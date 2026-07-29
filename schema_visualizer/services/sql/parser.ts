import type { Column, SqlDiagnostic, Table } from '../../types/workspace';

export function parseDDL(ddl: string): Table[] {
  const tables: Table[] = [];

  // Normalize the DDL - handle multi-line and various formats
  const normalizedDDL = ddl
    .replace(/--[^\n]*/g, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ');

  // More flexible CREATE TABLE regex that handles various SQL dialects
  const createRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:[`"\[]?(\w+)[`"\]]?\.)?[`"\[]?(\w+)[`"\]]?\s*\(([\s\S]+?)\)(?:\s*(?:ENGINE|WITH|TABLESPACE|INHERITS|PARTITION|;)|\s*$)/gim;

  let m;
  while ((m = createRegex.exec(normalizedDDL))) {
    const schemaName = m[1]; // Optional schema prefix
    const tableName = m[2];
    const body = m[3];

    // Split by comma, but not commas inside parentheses (for types like DECIMAL(10,2))
    const lines: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of body) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) {
        lines.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    if (current.trim()) lines.push(current.trim());

    const cols: Column[] = [];
    const fks: { col: string; refTable: string; refCol: string }[] = [];
    const pkColumns: string[] = [];
    const uniqueColumns: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // FK constraint: FOREIGN KEY (col) REFERENCES table(col)
      const fkClause = trimmedLine.match(/foreign\s+key\s*\(([^)]+)\)\s*references\s+(?:[`"\[]?\w+[`"\]]?\.)?[`"\[]?(\w+)[`"\]]?\s*\(([^)]+)\)/i);
      if (fkClause) {
        const fkCols = fkClause[1].split(',').map(c => c.replace(/[`"\[\]\s]/g, ''));
        const refCols = fkClause[3].split(',').map(c => c.replace(/[`"\[\]\s]/g, ''));
        fkCols.forEach((col, i) => {
          fks.push({ col, refTable: fkClause[2], refCol: refCols[i] || refCols[0] });
        });
        continue;
      }

      // PRIMARY KEY constraint: PRIMARY KEY (col1, col2)
      const pkClause = trimmedLine.match(/^\s*(?:constraint\s+\w+\s+)?primary\s+key\s*\(([^)]+)\)/i);
      if (pkClause) {
        pkClause[1].split(',').forEach(c => pkColumns.push(c.replace(/[`"\[\]\s]/g, '')));
        continue;
      }

      // UNIQUE constraint: UNIQUE (col1, col2)
      const uniqueClause = trimmedLine.match(/^\s*(?:constraint\s+\w+\s+)?unique\s*\(([^)]+)\)/i);
      if (uniqueClause) {
        uniqueClause[1].split(',').forEach(c => uniqueColumns.push(c.replace(/[`"\[\]\s]/g, '')));
        continue;
      }

      // Skip other constraints
      if (/^\s*(?:constraint|check|index|key|fulltext|spatial)/i.test(trimmedLine)) continue;

      // Column definition: name TYPE [constraints...]
      // Handle various formats including quoted names and complex types
      const colMatch = trimmedLine.match(/^[`"\[]?(\w+)[`"\]]?\s+([A-Za-z_][\w]*(?:\s*\([^)]+\))?(?:\s+(?:unsigned|signed|varying|precision|with\s+time\s+zone|without\s+time\s+zone))?)\s*(.*)?$/i);

      if (colMatch) {
        const cname = colMatch[1];
        let ctype = colMatch[2].toUpperCase().trim();
        const rest = (colMatch[3] || '').toLowerCase();

        // Normalize common type variations
        ctype = ctype
          .replace(/\s+/g, ' ')
          .replace(/CHARACTER VARYING/i, 'VARCHAR')
          .replace(/INT4/i, 'INT')
          .replace(/INT8/i, 'BIGINT')
          .replace(/FLOAT8/i, 'DOUBLE')
          .replace(/FLOAT4/i, 'FLOAT')
          .replace(/BOOL\b/i, 'BOOLEAN');

        // Check for PRIMARY KEY in column definition
        const isPK = /primary\s*key/i.test(rest) ||
                     /\bserial\b/i.test(ctype) ||
                     /\bbigserial\b/i.test(ctype) ||
                     /\bauto_increment\b/i.test(rest) ||
                     /\bidentity\b/i.test(rest);

        // Check for UNIQUE
        const isUnique = /\bunique\b/i.test(rest);

        // Check for NOT NULL (default to nullable unless specified)
        const isNotNull = /\bnot\s+null\b/i.test(rest);
        const isNullable = !isNotNull && !isPK; // PKs are implicitly NOT NULL

        // Check for DEFAULT value
        const defaultMatch = rest.match(/default\s+([^,\s]+(?:\([^)]*\))?)/i);
        const defaultValue = defaultMatch ? defaultMatch[1] : undefined;

        // Inline FK: REFERENCES table(column)
        const inlineFK = rest.match(/references\s+(?:[`"\[]?\w+[`"\]]?\.)?[`"\[]?(\w+)[`"\]]?\s*\(([^)]+)\)/i);

        const col: Column = {
          name: cname,
          type: ctype,
          pk: isPK,
          unique: isUnique,
          nullable: isNullable
        };

        if (inlineFK) {
          col.fk = { table: inlineFK[1], column: inlineFK[2].replace(/[`"\[\]\s]/g, '') };
        }

        cols.push(col);
      }
    }

    // Apply table-level PRIMARY KEY constraint
    pkColumns.forEach(pkCol => {
      const col = cols.find(c => c.name.toLowerCase() === pkCol.toLowerCase());
      if (col) {
        col.pk = true;
        col.nullable = false;
      }
    });

    // Apply table-level UNIQUE constraint
    uniqueColumns.forEach(uqCol => {
      const col = cols.find(c => c.name.toLowerCase() === uqCol.toLowerCase());
      if (col && !col.pk) col.unique = true;
    });

    // Apply FK constraints to columns
    fks.forEach((f) => {
      const col = cols.find((c) => c.name.toLowerCase() === f.col.toLowerCase());
      if (col) col.fk = { table: f.refTable, column: f.refCol };
    });

    if (cols.length > 0) {
      tables.push({
        name: tableName,
        columns: cols,
        color: `#${Math.floor(Math.random() * 0x888888 + 0x444444).toString(16)}`,
      });
    }
  }

  return tables;
}

export function validateSqlForWorkspace(sql: string, parsedTables: Table[]): SqlDiagnostic[] {
  const diagnostics: SqlDiagnostic[] = [];
  const sourceLines = sql.split(/\r?\n/);
  const locationAt = (index: number) => {
    const before = sql.slice(0, Math.max(0, index)).split(/\r?\n/);
    const line = before.length;
    return {
      line,
      column: before[before.length - 1].length + 1,
      excerpt: sourceLines[line - 1]?.trim(),
    };
  };
  const addDiagnostic = (diagnostic: SqlDiagnostic) => {
    if (!diagnostics.some((item) => item.code === diagnostic.code && item.line === diagnostic.line && item.message === diagnostic.message)) {
      diagnostics.push(diagnostic);
    }
  };

  if (!sql.trim()) {
    return [{
      code: 'EMPTY_SCRIPT',
      line: 1,
      column: 1,
      message: 'The script is empty.',
      suggestion: 'Generate SQL from the current schema or add a CREATE TABLE statement.',
    }];
  }

  const maskedSql = sql
    .replace(/--[^\n]*/g, (comment) => ' '.repeat(comment.length))
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\r\n]/g, ' '));
  const createPattern = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"\[]?\w+[`"\]]?\.)?[`"\[]?(\w+)[`"\]]?/gi;
  const createMatches = [...maskedSql.matchAll(createPattern)];

  if (createMatches.length === 0) {
    addDiagnostic({
      code: 'CREATE_TABLE_REQUIRED',
      line: 1,
      column: 1,
      message: 'No CREATE TABLE statement was found.',
      suggestion: 'The canvas runner accepts CREATE TABLE DDL. Add a table definition before running the script.',
      excerpt: sourceLines.find((line) => line.trim())?.trim(),
    });
  }

  const openingParentheses: number[] = [];
  let quote: "'" | '"' | '`' | null = null;
  for (let index = 0; index < maskedSql.length; index += 1) {
    const character = maskedSql[index];
    const previous = maskedSql[index - 1];
    if ((character === "'" || character === '"' || character === '`') && previous !== '\\') {
      quote = quote === character ? null : quote || character;
      continue;
    }
    if (quote) continue;
    if (character === '(') openingParentheses.push(index);
    if (character === ')') {
      const opening = openingParentheses.pop();
      if (opening === undefined) {
        const location = locationAt(index);
        addDiagnostic({
          code: 'UNEXPECTED_CLOSING_PARENTHESIS',
          ...location,
          message: 'A closing parenthesis does not have a matching opening parenthesis.',
          suggestion: 'Remove this parenthesis or add the missing opening parenthesis earlier in the statement.',
        });
      }
    }
  }
  openingParentheses.forEach((index) => {
    const location = locationAt(index);
    addDiagnostic({
      code: 'UNCLOSED_PARENTHESIS',
      ...location,
      message: 'An opening parenthesis is not closed.',
      suggestion: 'Close the column or constraint list with a matching parenthesis before the statement ends.',
    });
  });

  for (const match of maskedSql.matchAll(/,\s*\)/g)) {
    const location = locationAt(match.index || 0);
    addDiagnostic({
      code: 'TRAILING_COMMA',
      ...location,
      message: 'A trailing comma appears immediately before a closing parenthesis.',
      suggestion: 'Remove the final comma from the column or constraint list.',
    });
  }

  const declaredTables = new Map<string, number>();
  createMatches.forEach((match) => {
    const tableName = match[1].toLowerCase();
    const location = locationAt(match.index || 0);
    if (declaredTables.has(tableName)) {
      addDiagnostic({
        code: 'DUPLICATE_TABLE',
        ...location,
        message: `Table "${match[1]}" is declared more than once.`,
        suggestion: 'Keep one CREATE TABLE statement or rename the duplicate table.',
      });
    } else {
      declaredTables.set(tableName, location.line);
    }
  });

  createMatches.forEach((match, index) => {
    const statementStart = match.index || 0;
    const statementEnd = createMatches[index + 1]?.index ?? sql.length;
    if (parseDDL(sql.slice(statementStart, statementEnd)).length === 0) {
      const location = locationAt(statementStart);
      addDiagnostic({
        code: 'UNPARSEABLE_CREATE_TABLE',
        ...location,
        message: `The CREATE TABLE statement for "${match[1]}" could not be parsed.`,
        suggestion: 'Check the table name, column data types, commas, constraints, and closing parenthesis.',
      });
    }
  });

  const parsedByName = new Map(parsedTables.map((table) => [table.name.toLowerCase(), table]));
  parsedTables.forEach((table) => {
    const columnNames = new Set<string>();
    table.columns.forEach((column) => {
      const normalizedColumn = column.name.toLowerCase();
      if (columnNames.has(normalizedColumn)) {
        const tableMatch = createMatches.find((match) => match[1].toLowerCase() === table.name.toLowerCase());
        const location = locationAt(tableMatch?.index || 0);
        addDiagnostic({
          code: 'DUPLICATE_COLUMN',
          ...location,
          message: `Column "${column.name}" is repeated in table "${table.name}".`,
          suggestion: 'Remove the duplicate column or give it a unique name.',
        });
      }
      columnNames.add(normalizedColumn);

      if (column.fk) {
        const referencedTable = parsedByName.get(column.fk.table.toLowerCase());
        const referencePattern = new RegExp(`\\bREFERENCES\\s+[\`"\\[]?${column.fk.table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\`"\\]]?`, 'i');
        const referenceMatch = maskedSql.match(referencePattern);
        const location = locationAt(referenceMatch?.index || 0);
        if (!referencedTable) {
          addDiagnostic({
            code: 'MISSING_REFERENCED_TABLE',
            ...location,
            message: `Foreign key "${table.name}.${column.name}" references missing table "${column.fk.table}".`,
            suggestion: `Create table "${column.fk.table}" in this script or correct the REFERENCES target.`,
          });
        } else if (!referencedTable.columns.some((candidate) => candidate.name.toLowerCase() === column.fk!.column.toLowerCase())) {
          addDiagnostic({
            code: 'MISSING_REFERENCED_COLUMN',
            ...location,
            message: `Foreign key "${table.name}.${column.name}" references missing column "${column.fk.table}.${column.fk.column}".`,
            suggestion: 'Reference an existing primary or unique column in the target table.',
          });
        }
      }
    });
  });

  return diagnostics.sort((left, right) => left.line - right.line || (left.column || 0) - (right.column || 0));
}
