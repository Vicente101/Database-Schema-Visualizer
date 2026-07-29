import type { Schema } from '../../types/workspace';

function safeFileName(name: string) {
  return (name || 'schema').replace(/[^a-zA-Z0-9]/g, '_');
}

export function generateSchemaSql(schema: Schema): string {
  let sql = '-- Generated DDL\n';
  sql += `-- Schema: ${schema.name || 'Untitled'}\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n\n`;

  schema.tables.forEach((table) => {
    sql += `CREATE TABLE ${table.name} (\n`;
    const lines: string[] = [];
    table.columns.forEach((column) => {
      let line = `  ${column.name} ${column.type}`;
      if (column.pk) line += ' PRIMARY KEY';
      if (column.unique && !column.pk) line += ' UNIQUE';
      if (column.nullable === false && !column.pk) line += ' NOT NULL';
      lines.push(line);
    });
    table.columns.forEach((column) => {
      if (column.fk) {
        lines.push(`  FOREIGN KEY (${column.name}) REFERENCES ${column.fk.table}(${column.fk.column})`);
      }
    });
    sql += `${lines.join(',\n')}\n);\n\n`;
  });

  schema.tables.forEach((table) => {
    table.columns.forEach((column) => {
      if (column.indexed && !column.pk && !column.unique) {
        const indexName = `idx_${table.name}_${column.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
        sql += `CREATE INDEX ${indexName} ON ${table.name} (${column.name});\n`;
      }
    });
  });
  return sql;
}

export function serializeSchema(schema: Schema): string {
  return JSON.stringify({
    name: schema.name,
    exportedAt: new Date().toISOString(),
    categories: schema.categories || [],
    tables: schema.tables.map((table) => ({
      name: table.name,
      color: table.color,
      x: table.x,
      y: table.y,
      category: table.category,
      columns: table.columns.map((column) => ({
        name: column.name,
        type: column.type,
        pk: column.pk || false,
        unique: column.unique || false,
        indexed: column.indexed || false,
        nullable: column.nullable !== false,
        fk: column.fk || null,
      })),
    })),
  }, null, 2);
}

export function downloadSchemaSql(schema: Schema) {
  downloadTextFile(
    generateSchemaSql(schema),
    `${safeFileName(schema.name || 'schema')}.sql`,
    'text/sql',
  );
}

export function downloadSchemaJson(schema: Schema) {
  downloadTextFile(
    serializeSchema(schema),
    `${safeFileName(schema.name || 'schema')}.json`,
    'application/json',
  );
}

function downloadTextFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
