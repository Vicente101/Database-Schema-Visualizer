// @ts-nocheck
import React, { useState, useRef, useEffect, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Schema Visualizer — AI-Enabled Database Schema Designer
   Full-featured: Create, Import, Save, Load, AI-powered modifications
   ═══════════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Column {
  name: string;
  type: string;
  pk?: boolean;
  fk?: { table: string; column: string };
  nullable?: boolean;
  unique?: boolean;
  defaultValue?: string;
}

interface Table {
  name: string;
  columns: Column[];
  x?: number;
  y?: number;
  color?: string;
  category?: string; // Category/group this table belongs to
}

interface TableCategory {
  id: string;
  name: string;
  color: string;
  description?: string;
  collapsed?: boolean;
}

interface Schema {
  tables: Table[];
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  categories?: TableCategory[];
}

interface SavedSchema {
  id: string;
  name: string;
  schema: Schema;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Storage Helpers
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'schema_visualizer_saved_schemas';

function getSavedSchemas(): SavedSchema[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSchemaToStorage(name: string, schema: Schema): SavedSchema {
  const saved = getSavedSchemas();
  const now = new Date().toISOString();
  const existing = saved.find((s) => s.name === name);
  if (existing) {
    existing.schema = schema;
    existing.updatedAt = now;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    return existing;
  } else {
    const newEntry: SavedSchema = {
      id: `schema_${Date.now()}`,
      name,
      schema,
      createdAt: now,
      updatedAt: now,
    };
    saved.push(newEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    return newEntry;
  }
}

function deleteSchemaFromStorage(id: string): void {
  const saved = getSavedSchemas().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

// ─────────────────────────────────────────────────────────────────────────────
// DDL Parser (import SQL)
// ─────────────────────────────────────────────────────────────────────────────
function parseDDL(ddl: string): Table[] {
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

// ─────────────────────────────────────────────────────────────────────────────
// Demo Schemas
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_SCHEMAS: Record<string, Schema> = {
  ecommerce: {
    name: 'E-Commerce',
    tables: [
      {
        name: 'users',
        color: '#6366f1',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'email', type: 'VARCHAR(255)', unique: true },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'password_hash', type: 'VARCHAR(255)' },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'products',
        color: '#10b981',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(200)' },
          { name: 'description', type: 'TEXT', nullable: true },
          { name: 'price', type: 'DECIMAL(10,2)' },
          { name: 'category_id', type: 'INT', fk: { table: 'categories', column: 'id' } },
          { name: 'stock', type: 'INT' },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'categories',
        color: '#f59e0b',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'slug', type: 'VARCHAR(100)', unique: true },
          { name: 'parent_id', type: 'INT', fk: { table: 'categories', column: 'id' }, nullable: true },
        ],
      },
      {
        name: 'orders',
        color: '#ec4899',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'user_id', type: 'INT', fk: { table: 'users', column: 'id' } },
          { name: 'total', type: 'DECIMAL(12,2)' },
          { name: 'status', type: 'VARCHAR(20)' },
          { name: 'shipping_address', type: 'TEXT' },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'order_items',
        color: '#8b5cf6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'order_id', type: 'INT', fk: { table: 'orders', column: 'id' } },
          { name: 'product_id', type: 'INT', fk: { table: 'products', column: 'id' } },
          { name: 'quantity', type: 'INT' },
          { name: 'unit_price', type: 'DECIMAL(10,2)' },
        ],
      },
      {
        name: 'reviews',
        color: '#14b8a6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'product_id', type: 'INT', fk: { table: 'products', column: 'id' } },
          { name: 'user_id', type: 'INT', fk: { table: 'users', column: 'id' } },
          { name: 'rating', type: 'INT' },
          { name: 'comment', type: 'TEXT', nullable: true },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
    ],
  },
  blog: {
    name: 'Blog Platform',
    tables: [
      {
        name: 'authors',
        color: '#3b82f6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'username', type: 'VARCHAR(50)', unique: true },
          { name: 'email', type: 'VARCHAR(255)', unique: true },
          { name: 'display_name', type: 'VARCHAR(100)' },
          { name: 'bio', type: 'TEXT', nullable: true },
          { name: 'avatar_url', type: 'VARCHAR(500)', nullable: true },
        ],
      },
      {
        name: 'posts',
        color: '#14b8a6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'author_id', type: 'INT', fk: { table: 'authors', column: 'id' } },
          { name: 'title', type: 'VARCHAR(200)' },
          { name: 'slug', type: 'VARCHAR(200)', unique: true },
          { name: 'excerpt', type: 'VARCHAR(500)', nullable: true },
          { name: 'content', type: 'TEXT' },
          { name: 'status', type: 'VARCHAR(20)' },
          { name: 'published_at', type: 'TIMESTAMP', nullable: true },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'comments',
        color: '#f97316',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'post_id', type: 'INT', fk: { table: 'posts', column: 'id' } },
          { name: 'author_id', type: 'INT', fk: { table: 'authors', column: 'id' }, nullable: true },
          { name: 'guest_name', type: 'VARCHAR(100)', nullable: true },
          { name: 'body', type: 'TEXT' },
          { name: 'approved', type: 'BOOLEAN' },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'tags',
        color: '#a855f7',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(50)', unique: true },
          { name: 'slug', type: 'VARCHAR(50)', unique: true },
        ],
      },
      {
        name: 'post_tags',
        color: '#64748b',
        columns: [
          { name: 'post_id', type: 'INT', pk: true, fk: { table: 'posts', column: 'id' } },
          { name: 'tag_id', type: 'INT', pk: true, fk: { table: 'tags', column: 'id' } },
        ],
      },
    ],
  },
  social: {
    name: 'Social Network',
    tables: [
      {
        name: 'users',
        color: '#0ea5e9',
        columns: [
          { name: 'id', type: 'UUID', pk: true },
          { name: 'handle', type: 'VARCHAR(30)', unique: true },
          { name: 'email', type: 'VARCHAR(255)', unique: true },
          { name: 'display_name', type: 'VARCHAR(100)' },
          { name: 'bio', type: 'TEXT', nullable: true },
          { name: 'avatar_url', type: 'TEXT', nullable: true },
          { name: 'verified', type: 'BOOLEAN' },
          { name: 'joined_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'follows',
        color: '#84cc16',
        columns: [
          { name: 'follower_id', type: 'UUID', pk: true, fk: { table: 'users', column: 'id' } },
          { name: 'following_id', type: 'UUID', pk: true, fk: { table: 'users', column: 'id' } },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'posts',
        color: '#f43f5e',
        columns: [
          { name: 'id', type: 'UUID', pk: true },
          { name: 'user_id', type: 'UUID', fk: { table: 'users', column: 'id' } },
          { name: 'content', type: 'TEXT' },
          { name: 'media_urls', type: 'JSON', nullable: true },
          { name: 'reply_to_id', type: 'UUID', fk: { table: 'posts', column: 'id' }, nullable: true },
          { name: 'repost_of_id', type: 'UUID', fk: { table: 'posts', column: 'id' }, nullable: true },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'likes',
        color: '#eab308',
        columns: [
          { name: 'user_id', type: 'UUID', pk: true, fk: { table: 'users', column: 'id' } },
          { name: 'post_id', type: 'UUID', pk: true, fk: { table: 'posts', column: 'id' } },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'messages',
        color: '#7c3aed',
        columns: [
          { name: 'id', type: 'UUID', pk: true },
          { name: 'sender_id', type: 'UUID', fk: { table: 'users', column: 'id' } },
          { name: 'receiver_id', type: 'UUID', fk: { table: 'users', column: 'id' } },
          { name: 'content', type: 'TEXT' },
          { name: 'read_at', type: 'TIMESTAMP', nullable: true },
          { name: 'sent_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'notifications',
        color: '#f472b6',
        columns: [
          { name: 'id', type: 'UUID', pk: true },
          { name: 'user_id', type: 'UUID', fk: { table: 'users', column: 'id' } },
          { name: 'type', type: 'VARCHAR(50)' },
          { name: 'data', type: 'JSON' },
          { name: 'read', type: 'BOOLEAN' },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
    ],
  },
  hr: {
    name: 'HR Management',
    tables: [
      {
        name: 'employees',
        color: '#3b82f6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'employee_code', type: 'VARCHAR(20)', unique: true },
          { name: 'first_name', type: 'VARCHAR(50)' },
          { name: 'last_name', type: 'VARCHAR(50)' },
          { name: 'email', type: 'VARCHAR(255)', unique: true },
          { name: 'phone', type: 'VARCHAR(20)', nullable: true },
          { name: 'department_id', type: 'INT', fk: { table: 'departments', column: 'id' } },
          { name: 'position_id', type: 'INT', fk: { table: 'positions', column: 'id' } },
          { name: 'manager_id', type: 'INT', fk: { table: 'employees', column: 'id' }, nullable: true },
          { name: 'hire_date', type: 'DATE' },
          { name: 'salary', type: 'DECIMAL(12,2)' },
          { name: 'status', type: 'VARCHAR(20)' },
        ],
      },
      {
        name: 'departments',
        color: '#10b981',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'code', type: 'VARCHAR(10)', unique: true },
          { name: 'head_id', type: 'INT', fk: { table: 'employees', column: 'id' }, nullable: true },
          { name: 'budget', type: 'DECIMAL(15,2)', nullable: true },
        ],
      },
      {
        name: 'positions',
        color: '#f59e0b',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'title', type: 'VARCHAR(100)' },
          { name: 'level', type: 'VARCHAR(20)' },
          { name: 'min_salary', type: 'DECIMAL(12,2)' },
          { name: 'max_salary', type: 'DECIMAL(12,2)' },
        ],
      },
      {
        name: 'leaves',
        color: '#ec4899',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'employee_id', type: 'INT', fk: { table: 'employees', column: 'id' } },
          { name: 'type', type: 'VARCHAR(30)' },
          { name: 'start_date', type: 'DATE' },
          { name: 'end_date', type: 'DATE' },
          { name: 'status', type: 'VARCHAR(20)' },
          { name: 'approved_by', type: 'INT', fk: { table: 'employees', column: 'id' }, nullable: true },
        ],
      },
      {
        name: 'payroll',
        color: '#8b5cf6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'employee_id', type: 'INT', fk: { table: 'employees', column: 'id' } },
          { name: 'period', type: 'VARCHAR(20)' },
          { name: 'basic_salary', type: 'DECIMAL(12,2)' },
          { name: 'deductions', type: 'DECIMAL(12,2)' },
          { name: 'bonuses', type: 'DECIMAL(12,2)' },
          { name: 'net_pay', type: 'DECIMAL(12,2)' },
          { name: 'paid_at', type: 'TIMESTAMP', nullable: true },
        ],
      },
    ],
  },
  crm: {
    name: 'CRM System',
    tables: [
      {
        name: 'contacts',
        color: '#0ea5e9',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'first_name', type: 'VARCHAR(50)' },
          { name: 'last_name', type: 'VARCHAR(50)' },
          { name: 'email', type: 'VARCHAR(255)' },
          { name: 'phone', type: 'VARCHAR(20)', nullable: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' }, nullable: true },
          { name: 'source', type: 'VARCHAR(50)' },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'companies',
        color: '#6366f1',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(200)' },
          { name: 'industry', type: 'VARCHAR(100)', nullable: true },
          { name: 'website', type: 'VARCHAR(255)', nullable: true },
          { name: 'size', type: 'VARCHAR(20)', nullable: true },
          { name: 'revenue', type: 'DECIMAL(15,2)', nullable: true },
        ],
      },
      {
        name: 'deals',
        color: '#10b981',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'title', type: 'VARCHAR(200)' },
          { name: 'contact_id', type: 'INT', fk: { table: 'contacts', column: 'id' } },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' }, nullable: true },
          { name: 'owner_id', type: 'INT', fk: { table: 'sales_reps', column: 'id' } },
          { name: 'stage', type: 'VARCHAR(50)' },
          { name: 'value', type: 'DECIMAL(15,2)' },
          { name: 'probability', type: 'INT' },
          { name: 'expected_close', type: 'DATE', nullable: true },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'sales_reps',
        color: '#f59e0b',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'email', type: 'VARCHAR(255)', unique: true },
          { name: 'team', type: 'VARCHAR(50)', nullable: true },
          { name: 'quota', type: 'DECIMAL(15,2)', nullable: true },
        ],
      },
      {
        name: 'activities',
        color: '#ec4899',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'type', type: 'VARCHAR(30)' },
          { name: 'subject', type: 'VARCHAR(200)' },
          { name: 'notes', type: 'TEXT', nullable: true },
          { name: 'contact_id', type: 'INT', fk: { table: 'contacts', column: 'id' }, nullable: true },
          { name: 'deal_id', type: 'INT', fk: { table: 'deals', column: 'id' }, nullable: true },
          { name: 'rep_id', type: 'INT', fk: { table: 'sales_reps', column: 'id' } },
          { name: 'due_date', type: 'TIMESTAMP', nullable: true },
          { name: 'completed_at', type: 'TIMESTAMP', nullable: true },
        ],
      },
    ],
  },
  inventory: {
    name: 'Inventory Management',
    tables: [
      {
        name: 'products',
        color: '#10b981',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'sku', type: 'VARCHAR(50)', unique: true },
          { name: 'name', type: 'VARCHAR(200)' },
          { name: 'description', type: 'TEXT', nullable: true },
          { name: 'category_id', type: 'INT', fk: { table: 'categories', column: 'id' } },
          { name: 'unit_cost', type: 'DECIMAL(10,2)' },
          { name: 'unit_price', type: 'DECIMAL(10,2)' },
          { name: 'reorder_level', type: 'INT' },
        ],
      },
      {
        name: 'categories',
        color: '#f59e0b',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'parent_id', type: 'INT', fk: { table: 'categories', column: 'id' }, nullable: true },
        ],
      },
      {
        name: 'warehouses',
        color: '#6366f1',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'location', type: 'VARCHAR(200)' },
          { name: 'capacity', type: 'INT' },
          { name: 'manager_id', type: 'INT', nullable: true },
        ],
      },
      {
        name: 'inventory',
        color: '#8b5cf6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'product_id', type: 'INT', fk: { table: 'products', column: 'id' } },
          { name: 'warehouse_id', type: 'INT', fk: { table: 'warehouses', column: 'id' } },
          { name: 'quantity', type: 'INT' },
          { name: 'last_counted', type: 'TIMESTAMP', nullable: true },
        ],
      },
      {
        name: 'suppliers',
        color: '#0ea5e9',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(200)' },
          { name: 'contact_name', type: 'VARCHAR(100)', nullable: true },
          { name: 'email', type: 'VARCHAR(255)' },
          { name: 'phone', type: 'VARCHAR(20)', nullable: true },
          { name: 'address', type: 'TEXT', nullable: true },
        ],
      },
      {
        name: 'purchase_orders',
        color: '#ec4899',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'supplier_id', type: 'INT', fk: { table: 'suppliers', column: 'id' } },
          { name: 'warehouse_id', type: 'INT', fk: { table: 'warehouses', column: 'id' } },
          { name: 'status', type: 'VARCHAR(20)' },
          { name: 'total', type: 'DECIMAL(12,2)' },
          { name: 'ordered_at', type: 'TIMESTAMP' },
          { name: 'received_at', type: 'TIMESTAMP', nullable: true },
        ],
      },
    ],
  },
  healthcare: {
    name: 'Healthcare System',
    tables: [
      {
        name: 'patients',
        color: '#f43f5e',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'mrn', type: 'VARCHAR(20)', unique: true },
          { name: 'first_name', type: 'VARCHAR(50)' },
          { name: 'last_name', type: 'VARCHAR(50)' },
          { name: 'date_of_birth', type: 'DATE' },
          { name: 'gender', type: 'VARCHAR(10)' },
          { name: 'phone', type: 'VARCHAR(20)' },
          { name: 'email', type: 'VARCHAR(255)', nullable: true },
          { name: 'address', type: 'TEXT' },
          { name: 'emergency_contact', type: 'VARCHAR(100)', nullable: true },
        ],
      },
      {
        name: 'doctors',
        color: '#3b82f6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'license_no', type: 'VARCHAR(30)', unique: true },
          { name: 'first_name', type: 'VARCHAR(50)' },
          { name: 'last_name', type: 'VARCHAR(50)' },
          { name: 'specialization', type: 'VARCHAR(100)' },
          { name: 'department_id', type: 'INT', fk: { table: 'departments', column: 'id' } },
          { name: 'email', type: 'VARCHAR(255)' },
          { name: 'phone', type: 'VARCHAR(20)' },
        ],
      },
      {
        name: 'departments',
        color: '#10b981',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'floor', type: 'VARCHAR(10)', nullable: true },
          { name: 'head_doctor_id', type: 'INT', nullable: true },
        ],
      },
      {
        name: 'appointments',
        color: '#f59e0b',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'patient_id', type: 'INT', fk: { table: 'patients', column: 'id' } },
          { name: 'doctor_id', type: 'INT', fk: { table: 'doctors', column: 'id' } },
          { name: 'scheduled_at', type: 'TIMESTAMP' },
          { name: 'duration_mins', type: 'INT' },
          { name: 'status', type: 'VARCHAR(20)' },
          { name: 'notes', type: 'TEXT', nullable: true },
        ],
      },
      {
        name: 'medical_records',
        color: '#8b5cf6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'patient_id', type: 'INT', fk: { table: 'patients', column: 'id' } },
          { name: 'doctor_id', type: 'INT', fk: { table: 'doctors', column: 'id' } },
          { name: 'diagnosis', type: 'TEXT' },
          { name: 'treatment', type: 'TEXT', nullable: true },
          { name: 'prescription', type: 'TEXT', nullable: true },
          { name: 'visit_date', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'billing',
        color: '#ec4899',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'patient_id', type: 'INT', fk: { table: 'patients', column: 'id' } },
          { name: 'appointment_id', type: 'INT', fk: { table: 'appointments', column: 'id' }, nullable: true },
          { name: 'amount', type: 'DECIMAL(10,2)' },
          { name: 'status', type: 'VARCHAR(20)' },
          { name: 'due_date', type: 'DATE' },
          { name: 'paid_at', type: 'TIMESTAMP', nullable: true },
        ],
      },
    ],
  },
  education: {
    name: 'Education Platform',
    tables: [
      {
        name: 'students',
        color: '#0ea5e9',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'student_id', type: 'VARCHAR(20)', unique: true },
          { name: 'first_name', type: 'VARCHAR(50)' },
          { name: 'last_name', type: 'VARCHAR(50)' },
          { name: 'email', type: 'VARCHAR(255)', unique: true },
          { name: 'enrollment_date', type: 'DATE' },
          { name: 'program_id', type: 'INT', fk: { table: 'programs', column: 'id' } },
          { name: 'gpa', type: 'DECIMAL(3,2)', nullable: true },
        ],
      },
      {
        name: 'instructors',
        color: '#6366f1',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'first_name', type: 'VARCHAR(50)' },
          { name: 'last_name', type: 'VARCHAR(50)' },
          { name: 'email', type: 'VARCHAR(255)', unique: true },
          { name: 'department', type: 'VARCHAR(100)' },
          { name: 'title', type: 'VARCHAR(50)', nullable: true },
        ],
      },
      {
        name: 'courses',
        color: '#10b981',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'code', type: 'VARCHAR(20)', unique: true },
          { name: 'name', type: 'VARCHAR(200)' },
          { name: 'description', type: 'TEXT', nullable: true },
          { name: 'credits', type: 'INT' },
          { name: 'instructor_id', type: 'INT', fk: { table: 'instructors', column: 'id' } },
          { name: 'program_id', type: 'INT', fk: { table: 'programs', column: 'id' } },
        ],
      },
      {
        name: 'programs',
        color: '#f59e0b',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(200)' },
          { name: 'degree_type', type: 'VARCHAR(50)' },
          { name: 'duration_years', type: 'INT' },
          { name: 'department', type: 'VARCHAR(100)' },
        ],
      },
      {
        name: 'enrollments',
        color: '#8b5cf6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'student_id', type: 'INT', fk: { table: 'students', column: 'id' } },
          { name: 'course_id', type: 'INT', fk: { table: 'courses', column: 'id' } },
          { name: 'semester', type: 'VARCHAR(20)' },
          { name: 'grade', type: 'VARCHAR(5)', nullable: true },
          { name: 'enrolled_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'assignments',
        color: '#ec4899',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'course_id', type: 'INT', fk: { table: 'courses', column: 'id' } },
          { name: 'title', type: 'VARCHAR(200)' },
          { name: 'description', type: 'TEXT', nullable: true },
          { name: 'due_date', type: 'TIMESTAMP' },
          { name: 'max_score', type: 'INT' },
        ],
      },
    ],
  },
  project: {
    name: 'Project Management',
    tables: [
      {
        name: 'projects',
        color: '#6366f1',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(200)' },
          { name: 'description', type: 'TEXT', nullable: true },
          { name: 'owner_id', type: 'INT', fk: { table: 'team_members', column: 'id' } },
          { name: 'status', type: 'VARCHAR(20)' },
          { name: 'start_date', type: 'DATE' },
          { name: 'target_date', type: 'DATE', nullable: true },
          { name: 'budget', type: 'DECIMAL(15,2)', nullable: true },
        ],
      },
      {
        name: 'team_members',
        color: '#0ea5e9',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'email', type: 'VARCHAR(255)', unique: true },
          { name: 'role', type: 'VARCHAR(50)' },
          { name: 'avatar_url', type: 'TEXT', nullable: true },
        ],
      },
      {
        name: 'tasks',
        color: '#10b981',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'project_id', type: 'INT', fk: { table: 'projects', column: 'id' } },
          { name: 'title', type: 'VARCHAR(200)' },
          { name: 'description', type: 'TEXT', nullable: true },
          { name: 'assignee_id', type: 'INT', fk: { table: 'team_members', column: 'id' }, nullable: true },
          { name: 'status', type: 'VARCHAR(20)' },
          { name: 'priority', type: 'VARCHAR(10)' },
          { name: 'due_date', type: 'DATE', nullable: true },
          { name: 'parent_task_id', type: 'INT', fk: { table: 'tasks', column: 'id' }, nullable: true },
        ],
      },
      {
        name: 'sprints',
        color: '#f59e0b',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'project_id', type: 'INT', fk: { table: 'projects', column: 'id' } },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'goal', type: 'TEXT', nullable: true },
          { name: 'start_date', type: 'DATE' },
          { name: 'end_date', type: 'DATE' },
          { name: 'status', type: 'VARCHAR(20)' },
        ],
      },
      {
        name: 'comments',
        color: '#ec4899',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'task_id', type: 'INT', fk: { table: 'tasks', column: 'id' } },
          { name: 'author_id', type: 'INT', fk: { table: 'team_members', column: 'id' } },
          { name: 'content', type: 'TEXT' },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        name: 'time_logs',
        color: '#8b5cf6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'task_id', type: 'INT', fk: { table: 'tasks', column: 'id' } },
          { name: 'member_id', type: 'INT', fk: { table: 'team_members', column: 'id' } },
          { name: 'hours', type: 'DECIMAL(5,2)' },
          { name: 'description', type: 'TEXT', nullable: true },
          { name: 'logged_at', type: 'TIMESTAMP' },
        ],
      },
    ],
  },
  erp: {
    name: 'ERP System',
    tables: [
      {
        name: 'companies',
        color: '#6366f1',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(200)' },
          { name: 'legal_name', type: 'VARCHAR(200)' },
          { name: 'tax_id', type: 'VARCHAR(50)', unique: true },
          { name: 'industry', type: 'VARCHAR(100)', nullable: true },
          { name: 'address', type: 'TEXT' },
          { name: 'phone', type: 'VARCHAR(20)', nullable: true },
          { name: 'email', type: 'VARCHAR(255)' },
          { name: 'currency', type: 'VARCHAR(3)' },
          { name: 'fiscal_year_start', type: 'INT' },
        ],
      },
      {
        name: 'departments',
        color: '#10b981',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'code', type: 'VARCHAR(10)' },
          { name: 'manager_id', type: 'INT', fk: { table: 'employees', column: 'id' }, nullable: true },
          { name: 'budget', type: 'DECIMAL(15,2)', nullable: true },
          { name: 'cost_center', type: 'VARCHAR(20)', nullable: true },
        ],
      },
      {
        name: 'employees',
        color: '#3b82f6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'department_id', type: 'INT', fk: { table: 'departments', column: 'id' } },
          { name: 'employee_code', type: 'VARCHAR(20)', unique: true },
          { name: 'first_name', type: 'VARCHAR(50)' },
          { name: 'last_name', type: 'VARCHAR(50)' },
          { name: 'email', type: 'VARCHAR(255)', unique: true },
          { name: 'phone', type: 'VARCHAR(20)', nullable: true },
          { name: 'position', type: 'VARCHAR(100)' },
          { name: 'hire_date', type: 'DATE' },
          { name: 'salary', type: 'DECIMAL(12,2)' },
          { name: 'status', type: 'VARCHAR(20)' },
        ],
      },
      {
        name: 'customers',
        color: '#0ea5e9',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'name', type: 'VARCHAR(200)' },
          { name: 'contact_name', type: 'VARCHAR(100)', nullable: true },
          { name: 'email', type: 'VARCHAR(255)' },
          { name: 'phone', type: 'VARCHAR(20)', nullable: true },
          { name: 'billing_address', type: 'TEXT' },
          { name: 'shipping_address', type: 'TEXT', nullable: true },
          { name: 'credit_limit', type: 'DECIMAL(15,2)', nullable: true },
          { name: 'payment_terms', type: 'INT' },
        ],
      },
      {
        name: 'vendors',
        color: '#f59e0b',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'name', type: 'VARCHAR(200)' },
          { name: 'contact_name', type: 'VARCHAR(100)', nullable: true },
          { name: 'email', type: 'VARCHAR(255)' },
          { name: 'phone', type: 'VARCHAR(20)', nullable: true },
          { name: 'address', type: 'TEXT' },
          { name: 'payment_terms', type: 'INT' },
          { name: 'tax_id', type: 'VARCHAR(50)', nullable: true },
        ],
      },
      {
        name: 'products',
        color: '#8b5cf6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'sku', type: 'VARCHAR(50)', unique: true },
          { name: 'name', type: 'VARCHAR(200)' },
          { name: 'description', type: 'TEXT', nullable: true },
          { name: 'category_id', type: 'INT', fk: { table: 'product_categories', column: 'id' } },
          { name: 'unit_cost', type: 'DECIMAL(12,2)' },
          { name: 'unit_price', type: 'DECIMAL(12,2)' },
          { name: 'tax_rate', type: 'DECIMAL(5,2)' },
          { name: 'is_active', type: 'BOOLEAN' },
        ],
      },
      {
        name: 'product_categories',
        color: '#14b8a6',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'parent_id', type: 'INT', fk: { table: 'product_categories', column: 'id' }, nullable: true },
          { name: 'gl_account_id', type: 'INT', fk: { table: 'gl_accounts', column: 'id' }, nullable: true },
        ],
      },
      {
        name: 'sales_orders',
        color: '#ec4899',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'order_number', type: 'VARCHAR(30)', unique: true },
          { name: 'customer_id', type: 'INT', fk: { table: 'customers', column: 'id' } },
          { name: 'salesperson_id', type: 'INT', fk: { table: 'employees', column: 'id' }, nullable: true },
          { name: 'order_date', type: 'DATE' },
          { name: 'ship_date', type: 'DATE', nullable: true },
          { name: 'subtotal', type: 'DECIMAL(15,2)' },
          { name: 'tax_amount', type: 'DECIMAL(15,2)' },
          { name: 'total', type: 'DECIMAL(15,2)' },
          { name: 'status', type: 'VARCHAR(20)' },
        ],
      },
      {
        name: 'sales_order_lines',
        color: '#f97316',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'order_id', type: 'INT', fk: { table: 'sales_orders', column: 'id' } },
          { name: 'product_id', type: 'INT', fk: { table: 'products', column: 'id' } },
          { name: 'quantity', type: 'DECIMAL(10,2)' },
          { name: 'unit_price', type: 'DECIMAL(12,2)' },
          { name: 'discount_percent', type: 'DECIMAL(5,2)', nullable: true },
          { name: 'line_total', type: 'DECIMAL(15,2)' },
        ],
      },
      {
        name: 'purchase_orders',
        color: '#84cc16',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'po_number', type: 'VARCHAR(30)', unique: true },
          { name: 'vendor_id', type: 'INT', fk: { table: 'vendors', column: 'id' } },
          { name: 'buyer_id', type: 'INT', fk: { table: 'employees', column: 'id' }, nullable: true },
          { name: 'order_date', type: 'DATE' },
          { name: 'expected_date', type: 'DATE', nullable: true },
          { name: 'subtotal', type: 'DECIMAL(15,2)' },
          { name: 'tax_amount', type: 'DECIMAL(15,2)' },
          { name: 'total', type: 'DECIMAL(15,2)' },
          { name: 'status', type: 'VARCHAR(20)' },
        ],
      },
      {
        name: 'invoices',
        color: '#a855f7',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'invoice_number', type: 'VARCHAR(30)', unique: true },
          { name: 'customer_id', type: 'INT', fk: { table: 'customers', column: 'id' } },
          { name: 'sales_order_id', type: 'INT', fk: { table: 'sales_orders', column: 'id' }, nullable: true },
          { name: 'invoice_date', type: 'DATE' },
          { name: 'due_date', type: 'DATE' },
          { name: 'subtotal', type: 'DECIMAL(15,2)' },
          { name: 'tax_amount', type: 'DECIMAL(15,2)' },
          { name: 'total', type: 'DECIMAL(15,2)' },
          { name: 'amount_paid', type: 'DECIMAL(15,2)' },
          { name: 'status', type: 'VARCHAR(20)' },
        ],
      },
      {
        name: 'gl_accounts',
        color: '#64748b',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'account_number', type: 'VARCHAR(20)' },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'type', type: 'VARCHAR(20)' },
          { name: 'parent_id', type: 'INT', fk: { table: 'gl_accounts', column: 'id' }, nullable: true },
          { name: 'is_active', type: 'BOOLEAN' },
        ],
      },
      {
        name: 'journal_entries',
        color: '#f43f5e',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'entry_number', type: 'VARCHAR(30)', unique: true },
          { name: 'entry_date', type: 'DATE' },
          { name: 'description', type: 'TEXT' },
          { name: 'reference_type', type: 'VARCHAR(30)', nullable: true },
          { name: 'reference_id', type: 'INT', nullable: true },
          { name: 'created_by', type: 'INT', fk: { table: 'employees', column: 'id' } },
          { name: 'posted', type: 'BOOLEAN' },
        ],
      },
      {
        name: 'journal_lines',
        color: '#0891b2',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'entry_id', type: 'INT', fk: { table: 'journal_entries', column: 'id' } },
          { name: 'account_id', type: 'INT', fk: { table: 'gl_accounts', column: 'id' } },
          { name: 'debit', type: 'DECIMAL(15,2)' },
          { name: 'credit', type: 'DECIMAL(15,2)' },
          { name: 'description', type: 'VARCHAR(255)', nullable: true },
        ],
      },
      {
        name: 'inventory',
        color: '#059669',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'product_id', type: 'INT', fk: { table: 'products', column: 'id' } },
          { name: 'warehouse_id', type: 'INT', fk: { table: 'warehouses', column: 'id' } },
          { name: 'quantity_on_hand', type: 'DECIMAL(10,2)' },
          { name: 'quantity_reserved', type: 'DECIMAL(10,2)' },
          { name: 'reorder_point', type: 'DECIMAL(10,2)', nullable: true },
          { name: 'last_count_date', type: 'DATE', nullable: true },
        ],
      },
      {
        name: 'warehouses',
        color: '#7c3aed',
        columns: [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'company_id', type: 'INT', fk: { table: 'companies', column: 'id' } },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'code', type: 'VARCHAR(10)', unique: true },
          { name: 'address', type: 'TEXT' },
          { name: 'manager_id', type: 'INT', fk: { table: 'employees', column: 'id' }, nullable: true },
          { name: 'is_active', type: 'BOOLEAN' },
        ],
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Auto-layout tables in a grid
// ─────────────────────────────────────────────────────────────────────────────
function autoLayout(tables: Table[]): Table[] {
  const cols = Math.ceil(Math.sqrt(tables.length)) || 1;
  const gapX = 340;
  const gapY = 300;
  return tables.map((t, i) => ({
    ...t,
    x: 60 + (i % cols) * gapX,
    y: 60 + Math.floor(i / cols) * gapY,
  }));
}

// Utility: Layout tables by category in organized cluster groups
function layoutTablesByCategory(tables: Table[], categories: TableCategory[]): Table[] {
  const tableWidth = 300;
  const tableBaseHeight = 60;
  const rowHeight = 24;
  const tableGapX = 40;
  const tableGapY = 30;
  const clusterPadding = 60;
  const clusterGapX = 150;
  const clusterGapY = 120;

  const result = [...tables];
  
  const categoriesWithTables = categories.filter(c => tables.some(t => t.category === c.id));
  const clustersPerRow = Math.ceil(Math.sqrt(categoriesWithTables.length + 1));
  
  let clusterIdx = 0;
  let maxClusterHeightInRow = 0;
  let currentRowY = 80;

  categoriesWithTables.forEach((category) => {
    const categoryTables = result.filter(t => t.category === category.id);
    if (categoryTables.length === 0) return;

    const clusterCol = clusterIdx % clustersPerRow;
    const clusterX = 80 + clusterCol * (tableWidth * 2 + clusterGapX);
    const clusterY = currentRowY;

    const clusterCols = categoryTables.length <= 2 ? categoryTables.length : 2;
    
    categoryTables.forEach((table, idx) => {
      const col = idx % clusterCols;
      const row = Math.floor(idx / clusterCols);
      const tableHeight = tableBaseHeight + table.columns.length * rowHeight;
      
      const tableIndex = result.findIndex(t => t.name === table.name);
      if (tableIndex !== -1) {
        result[tableIndex] = {
          ...result[tableIndex],
          x: clusterX + col * (tableWidth + tableGapX),
          y: clusterY + row * (tableHeight + tableGapY),
        };
      }
    });

    const clusterRows = Math.ceil(categoryTables.length / clusterCols);
    const maxTableHeight = Math.max(...categoryTables.map(t => tableBaseHeight + t.columns.length * rowHeight));
    const clusterHeight = clusterRows * maxTableHeight + (clusterRows - 1) * tableGapY + clusterPadding;
    maxClusterHeightInRow = Math.max(maxClusterHeightInRow, clusterHeight);

    clusterIdx++;
    
    if (clusterIdx % clustersPerRow === 0) {
      currentRowY += maxClusterHeightInRow + clusterGapY;
      maxClusterHeightInRow = 0;
    }
  });

  const uncategorized = result.filter(t => !t.category);
  if (uncategorized.length > 0) {
    const clusterCol = clusterIdx % clustersPerRow;
    const uncatX = 80 + clusterCol * (tableWidth * 2 + clusterGapX);
    const uncatY = clusterIdx % clustersPerRow === 0 ? currentRowY : currentRowY + maxClusterHeightInRow + clusterGapY;
    
    const uncatCols = Math.min(uncategorized.length, 2);
    uncategorized.forEach((table, idx) => {
      const col = idx % uncatCols;
      const row = Math.floor(idx / uncatCols);
      const tableHeight = tableBaseHeight + table.columns.length * rowHeight;
      const tableIndex = result.findIndex(t => t.name === table.name);
      if (tableIndex !== -1) {
        result[tableIndex] = {
          ...result[tableIndex],
          x: uncatX + col * (tableWidth + tableGapX),
          y: uncatY + row * (tableHeight + tableGapY),
        };
      }
    });
  }

  return result;
}

function randomColor(): string {
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#3b82f6', '#84cc16', '#f43f5e', '#0ea5e9', '#a855f7'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Intelligent AI Schema Modifier — Natural Language Understanding
// ─────────────────────────────────────────────────────────────────────────────

// Context tracking for conversation awareness
let conversationContext = {
  lastCreatedTables: [] as string[],
  lastModifiedTable: '',
  lastAction: '',
  recentTables: [] as string[],
};

// Helper: Normalize and clean text
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[''""]/g, "'").replace(/\s+/g, ' ').trim();
}

// Helper: Extract potential identifiers (table/column names) from text
function extractIdentifiers(text: string): string[] {
  // Remove common filler words and extract potential names
  const cleaned = text.replace(/\b(the|a|an|some|my|our|this|that|these|those|for|each|every|with|and|or)\b/gi, ' ');
  const words = cleaned.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  // Filter out common verbs/keywords
  const stopWords = new Set(['create', 'add', 'make', 'build', 'generate', 'insert', 'put', 'set', 'remove', 'delete', 'drop', 'rename', 'change', 'modify', 'update', 'link', 'connect', 'table', 'tables', 'column', 'columns', 'field', 'fields', 'attribute', 'attributes', 'property', 'properties', 'called', 'named', 'to', 'from', 'in', 'into', 'of', 'as', 'be', 'is', 'are', 'was', 'were', 'will', 'would', 'could', 'should', 'can', 'need', 'want', 'like', 'necessary', 'required', 'default', 'typical', 'common', 'appropriate', 'relevant', 'suitable', 'proper', 'please', 'kindly', 'help', 'me', 'i', 'you', 'we', 'it', 'type', 'types', 'key', 'keys', 'primary', 'foreign', 'unique', 'nullable', 'optional', 'null', 'not', 'fk', 'pk', 'ref', 'reference', 'references', 'relationship', 'relationships', 'relation', 'new', 'existing', 'current', 'all', 'between', 'them', 'those', 'these', 'now', 'also', 'too', 'smart', 'auto', 'automatic', 'automatically']);
  return words.filter(w => !stopWords.has(w.toLowerCase()) && w.length > 1);
}

// Helper: Check if user is referring to recent/contextual tables
function isReferringToContext(text: string): boolean {
  const contextPhrases = [
    /\b(the\s+)?(new|recent|created|added|those|these|them|existing|current|above|previous)\s*(tables?|ones?)?\b/i,
    /\b(all|between)\s*(the\s+)?(tables?|them|those|these)\b/i,
    /\bto\s+(them|those|these|it)\b/i,
    /\bnow\s+(add|create|link|connect)/i,
    /\balso\b/i,
  ];
  return contextPhrases.some(p => p.test(text));
}

// Helper: Detect intent from natural language
type Intent = 'create_tables' | 'create_table' | 'create_table_in_category' | 'add_column' | 'add_columns' | 'remove_table' | 'remove_column' | 'rename_table' | 'rename_column' | 'add_fk' | 'add_fks_auto' | 'remove_fk' | 'set_pk' | 'set_unique' | 'set_nullable' | 'set_required' | 'describe' | 'clear' | 'help' | 'stats' | 'greeting' | 'thanks' | 'bye' | 'change_type' | 'color' | 'optimize' | 'suggest' | 'assign_category' | 'create_category' | 'auto_categorize' | 'unknown';

function detectIntent(text: string): Intent {
  const t = normalizeText(text);
  
  // Greeting patterns
  if (/^(hi|hello|hey|yo|sup|greetings|good\s*(morning|afternoon|evening|day)|howdy|hola)/i.test(t)) return 'greeting';
  if (/^(thanks|thank\s*you|thx|ty|cheers|appreciated|great|awesome|perfect|wonderful)/i.test(t)) return 'thanks';
  if (/^(bye|goodbye|exit|quit|done|finished|see\s*you|later|ciao)/i.test(t)) return 'bye';
  
  // Help
  if (/\b(help|what\s*can|how\s*(do|to)|commands?|options?|menu|guide|instructions?|assist)\b/i.test(t)) return 'help';
  
  // Clear/Reset
  if (/\b(clear|reset|empty|wipe|start\s*(over|fresh|new)|clean|blank|remove\s*all|delete\s*all|drop\s*all)\b/i.test(t)) return 'clear';
  
  // Stats
  if (/\b(stats?|statistics?|count|how\s*many|summary|overview|info|information)\b/i.test(t)) return 'stats';
  
  // Describe/Show
  if (/\b(describe|show|list|display|view|see|what('s|s|\s*is)|tell\s*me\s*about)\b.*\b(table|schema|column|structure|database|db)\b/i.test(t)) return 'describe';
  if (/\b(what\s*(do\s*i|we)\s*have|current\s*(schema|state))\b/i.test(t)) return 'describe';
  
  // Suggestions and optimization
  if (/\b(suggest|recommend|what\s*should|improve|optimize|fix|better|best\s*practice)\b/i.test(t)) return 'suggest';
  
  // Auto FK / relationships with context (e.g., "add relationships to the new tables", "link them", "connect those")
  if (/\b(add|create|make|set|establish|wire|setup|configure)\b.*\b(relationships?|fks?|foreign\s*keys?|links?|connections?)\b/i.test(t)) {
    if (isReferringToContext(t) || /\b(between|all|auto|automatic)\b/i.test(t)) return 'add_fks_auto';
    return 'add_fk';
  }
  if (/\b(link|connect|relate|wire)\b.*\b(them|those|these|all|tables?|together|automatically)\b/i.test(t)) return 'add_fks_auto';
  if (/\b(relationships?|fks?|foreign\s*keys?)\b.*\b(between|for|to)\b.*\b(them|those|these|new|all|tables?)\b/i.test(t)) return 'add_fks_auto';
  
  // FK operations - specific
  if (/\b(remove|delete|drop)\b.*\b(fk|foreign\s*key|relationship|link|reference)\b/i.test(t)) return 'remove_fk';
  if (/\b(link|connect|relate|join|associate)\b.*\b(to|with)\b/i.test(t)) return 'add_fk';
  
  // Constraint operations
  if (/\b(set|make|mark)\b.*\b(primary\s*key|pk)\b/i.test(t)) return 'set_pk';
  if (/\b(set|make|mark)\b.*\bunique\b/i.test(t)) return 'set_unique';
  if (/\b(set|make|mark)\b.*\b(nullable|optional|can\s*be\s*null|allow\s*null)\b/i.test(t)) return 'set_nullable';
  if (/\b(set|make|mark)\b.*\b(not\s*null|required|mandatory|must\s*have)\b/i.test(t)) return 'set_required';
  
  // Color
  if (/\b(color|colour)\b/i.test(t)) return 'color';
  
  // Category/Group operations - detect these BEFORE create operations
  // Auto-categorize / organize / group all tables
  if (/\b(auto\s*)?(?:categorize|organize|group)\b.*\b(tables?|all|everything|schema)\b/i.test(t)) return 'auto_categorize';
  if (/\b(smart|auto)\b.*\b(group|organize|categorize)\b/i.test(t)) return 'auto_categorize';
  
  // Create category/group
  if (/\b(create|add|make|new)\b.*\b(category|group|folder)\b/i.test(t) && !/\btable\b/i.test(t)) return 'create_category';
  
  // Assign/move table to category/group
  if (/\b(assign|move|put|add|place)\b.*\b(to|in|into)\b.*\b(category|group)\b/i.test(t)) return 'assign_category';
  if (/\b(table\s+\w+)\b.*\b(to|in|into)\b.*\b(category|group)\b/i.test(t)) return 'assign_category';
  
  // Create table IN a category/group - detect this pattern early
  if (/\b(create|add|make)\b.*\btable\b.*\b(in|to|under|into)\b.*\b(category|group)\b/i.test(t)) return 'create_table_in_category';
  if (/\b(create|add|make)\b.*\btable\b.*\b(in|to|under|into)\b.*\b(the\s+)?["']?[\w\s]+["']?\s*(category|group)\b/i.test(t)) return 'create_table_in_category';
  // Also catch "add X table to Y group" patterns
  if (/\b(create|add)\b.*\b\w+\b.*\b(table\s+)?(in|to)\s+(the\s+)?["']?[\w\s]+["']?\s*(category|group)\b/i.test(t)) return 'create_table_in_category';
  
  // Add columns to multiple/context tables
  if (/\b(add|create)\b.*\b(columns?|fields?|attributes?)\b.*\b(to|for)\b.*\b(them|those|these|all|each|every|new|tables?)\b/i.test(t)) return 'add_columns';
  
  // Rename operations
  if (/\brename\b.*\bcolumn\b/i.test(t)) return 'rename_column';
  if (/\brename\b.*\btable\b/i.test(t)) return 'rename_table';
  if (/\brename\b/i.test(t)) {
    // Infer from context
    if (/\.\w+/.test(t) || /column|field|attribute/i.test(t)) return 'rename_column';
    return 'rename_table';
  }
  
  // Change type
  if (/\b(change|modify|alter|update|set)\b.*\btype\b/i.test(t)) return 'change_type';
  
  // Remove operations
  if (/\b(remove|delete|drop|get\s*rid\s*of|eliminate)\b/i.test(t)) {
    if (/\b(column|field|attribute)\b/i.test(t) || /\bfrom\b/i.test(t)) return 'remove_column';
    return 'remove_table';
  }
  
  // Create operations - check for multiple tables
  if (/\b(create|add|make|build|generate|set\s*up|establish|design|need|want)\b/i.test(t)) {
    // Multiple tables detection
    if (/\btables\b/i.test(t) || (t.match(/,/g) || []).length >= 1 || /\band\b.*\band\b/i.test(t)) {
      return 'create_tables';
    }
    // Single table with columns
    if (/\b(column|field|attribute)\b/i.test(t) && !/\btable\b/i.test(t)) return 'add_column';
    if (/\bwith\b.*\b(column|field|attribute|id|name|email|price)/i.test(t)) return 'create_table';
    // Check for "add X to Y" pattern (column)
    if (/\b(to|in|into)\b/i.test(t) && !/\btable\b/i.test(t)) return 'add_column';
    return 'create_table';
  }
  
  // Fallback patterns
  if (/\b(i\s*need|i\s*want|can\s*you|could\s*you|please|would\s*you)\b/i.test(t)) {
    if (/\btables?\b/i.test(t)) return 'create_tables';
    return 'create_table';
  }
  
  return 'unknown';
}

// Helper: Infer column type from name
function inferColumnType(name: string): string {
  const n = name.toLowerCase();
  if (n === 'id' || n.endsWith('_id')) return n === 'id' ? 'SERIAL' : 'INT';
  if (n.includes('email')) return 'VARCHAR(255)';
  if (n.includes('password') || n.includes('hash')) return 'VARCHAR(255)';
  if (n.includes('phone') || n.includes('mobile')) return 'VARCHAR(20)';
  if (n.includes('price') || n.includes('cost') || n.includes('amount') || n.includes('total') || n.includes('salary')) return 'DECIMAL(10,2)';
  if (n.includes('count') || n.includes('quantity') || n.includes('stock') || n.includes('age') || n.includes('number')) return 'INT';
  if (n.includes('date') || n.includes('_at') || n.includes('time') || n.includes('created') || n.includes('updated') || n.includes('deleted')) return 'TIMESTAMP';
  if (n.includes('is_') || n.includes('has_') || n.includes('can_') || n.includes('active') || n.includes('enabled') || n.includes('verified') || n.includes('approved')) return 'BOOLEAN';
  if (n.includes('description') || n.includes('content') || n.includes('body') || n.includes('text') || n.includes('bio') || n.includes('notes') || n.includes('address')) return 'TEXT';
  if (n.includes('url') || n.includes('link') || n.includes('image') || n.includes('avatar') || n.includes('photo')) return 'VARCHAR(500)';
  if (n.includes('json') || n.includes('data') || n.includes('meta') || n.includes('config') || n.includes('settings')) return 'JSON';
  if (n.includes('uuid') || n.includes('guid')) return 'UUID';
  if (n.includes('status') || n.includes('type') || n.includes('role') || n.includes('category')) return 'VARCHAR(50)';
  if (n.includes('name') || n.includes('title') || n.includes('label')) return 'VARCHAR(100)';
  if (n.includes('slug')) return 'VARCHAR(100)';
  return 'VARCHAR(255)';
}

// Helper: Generate default columns for common table types
function getDefaultColumnsForTable(tableName: string): Column[] {
  const name = tableName.toLowerCase().replace(/s$/, ''); // Singularize
  
  const templates: Record<string, Column[]> = {
    user: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'email', type: 'VARCHAR(255)', unique: true },
      { name: 'name', type: 'VARCHAR(100)' },
      { name: 'password_hash', type: 'VARCHAR(255)' },
      { name: 'avatar_url', type: 'VARCHAR(500)', nullable: true },
      { name: 'is_active', type: 'BOOLEAN' },
      { name: 'created_at', type: 'TIMESTAMP' },
      { name: 'updated_at', type: 'TIMESTAMP' },
    ],
    product: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(200)' },
      { name: 'description', type: 'TEXT', nullable: true },
      { name: 'price', type: 'DECIMAL(10,2)' },
      { name: 'sku', type: 'VARCHAR(50)', unique: true },
      { name: 'stock', type: 'INT' },
      { name: 'category_id', type: 'INT', nullable: true },
      { name: 'is_active', type: 'BOOLEAN' },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    order: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'user_id', type: 'INT' },
      { name: 'order_number', type: 'VARCHAR(50)', unique: true },
      { name: 'total', type: 'DECIMAL(12,2)' },
      { name: 'status', type: 'VARCHAR(20)' },
      { name: 'shipping_address', type: 'TEXT' },
      { name: 'notes', type: 'TEXT', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP' },
      { name: 'updated_at', type: 'TIMESTAMP' },
    ],
    order_item: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'order_id', type: 'INT' },
      { name: 'product_id', type: 'INT' },
      { name: 'quantity', type: 'INT' },
      { name: 'unit_price', type: 'DECIMAL(10,2)' },
      { name: 'subtotal', type: 'DECIMAL(10,2)' },
    ],
    category: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(100)' },
      { name: 'slug', type: 'VARCHAR(100)', unique: true },
      { name: 'description', type: 'TEXT', nullable: true },
      { name: 'parent_id', type: 'INT', nullable: true },
      { name: 'sort_order', type: 'INT' },
    ],
    customer: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'email', type: 'VARCHAR(255)', unique: true },
      { name: 'first_name', type: 'VARCHAR(50)' },
      { name: 'last_name', type: 'VARCHAR(50)' },
      { name: 'phone', type: 'VARCHAR(20)', nullable: true },
      { name: 'address', type: 'TEXT', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    post: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'author_id', type: 'INT' },
      { name: 'title', type: 'VARCHAR(200)' },
      { name: 'slug', type: 'VARCHAR(200)', unique: true },
      { name: 'content', type: 'TEXT' },
      { name: 'excerpt', type: 'TEXT', nullable: true },
      { name: 'status', type: 'VARCHAR(20)' },
      { name: 'published_at', type: 'TIMESTAMP', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    comment: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'post_id', type: 'INT' },
      { name: 'user_id', type: 'INT', nullable: true },
      { name: 'author_name', type: 'VARCHAR(100)' },
      { name: 'content', type: 'TEXT' },
      { name: 'is_approved', type: 'BOOLEAN' },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    tag: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(50)', unique: true },
      { name: 'slug', type: 'VARCHAR(50)', unique: true },
    ],
    review: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'product_id', type: 'INT' },
      { name: 'user_id', type: 'INT' },
      { name: 'rating', type: 'INT' },
      { name: 'title', type: 'VARCHAR(100)', nullable: true },
      { name: 'content', type: 'TEXT', nullable: true },
      { name: 'is_verified', type: 'BOOLEAN' },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    payment: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'order_id', type: 'INT' },
      { name: 'amount', type: 'DECIMAL(12,2)' },
      { name: 'method', type: 'VARCHAR(50)' },
      { name: 'status', type: 'VARCHAR(20)' },
      { name: 'transaction_id', type: 'VARCHAR(100)', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    invoice: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'order_id', type: 'INT' },
      { name: 'invoice_number', type: 'VARCHAR(50)', unique: true },
      { name: 'amount', type: 'DECIMAL(12,2)' },
      { name: 'status', type: 'VARCHAR(20)' },
      { name: 'due_date', type: 'TIMESTAMP' },
      { name: 'paid_at', type: 'TIMESTAMP', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    cart: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'user_id', type: 'INT', nullable: true },
      { name: 'session_id', type: 'VARCHAR(100)' },
      { name: 'created_at', type: 'TIMESTAMP' },
      { name: 'updated_at', type: 'TIMESTAMP' },
    ],
    cart_item: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'cart_id', type: 'INT' },
      { name: 'product_id', type: 'INT' },
      { name: 'quantity', type: 'INT' },
    ],
    address: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'user_id', type: 'INT' },
      { name: 'type', type: 'VARCHAR(20)' },
      { name: 'street', type: 'VARCHAR(200)' },
      { name: 'city', type: 'VARCHAR(100)' },
      { name: 'state', type: 'VARCHAR(100)' },
      { name: 'postal_code', type: 'VARCHAR(20)' },
      { name: 'country', type: 'VARCHAR(100)' },
      { name: 'is_default', type: 'BOOLEAN' },
    ],
    notification: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'user_id', type: 'INT' },
      { name: 'type', type: 'VARCHAR(50)' },
      { name: 'title', type: 'VARCHAR(200)' },
      { name: 'message', type: 'TEXT' },
      { name: 'is_read', type: 'BOOLEAN' },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    message: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'sender_id', type: 'INT' },
      { name: 'receiver_id', type: 'INT' },
      { name: 'subject', type: 'VARCHAR(200)', nullable: true },
      { name: 'content', type: 'TEXT' },
      { name: 'is_read', type: 'BOOLEAN' },
      { name: 'sent_at', type: 'TIMESTAMP' },
    ],
    employee: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'employee_number', type: 'VARCHAR(20)', unique: true },
      { name: 'first_name', type: 'VARCHAR(50)' },
      { name: 'last_name', type: 'VARCHAR(50)' },
      { name: 'email', type: 'VARCHAR(255)', unique: true },
      { name: 'department_id', type: 'INT', nullable: true },
      { name: 'position', type: 'VARCHAR(100)' },
      { name: 'salary', type: 'DECIMAL(12,2)' },
      { name: 'hire_date', type: 'TIMESTAMP' },
      { name: 'is_active', type: 'BOOLEAN' },
    ],
    department: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(100)' },
      { name: 'code', type: 'VARCHAR(20)', unique: true },
      { name: 'manager_id', type: 'INT', nullable: true },
      { name: 'budget', type: 'DECIMAL(15,2)', nullable: true },
    ],
    project: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(200)' },
      { name: 'description', type: 'TEXT', nullable: true },
      { name: 'status', type: 'VARCHAR(20)' },
      { name: 'start_date', type: 'TIMESTAMP' },
      { name: 'end_date', type: 'TIMESTAMP', nullable: true },
      { name: 'budget', type: 'DECIMAL(15,2)', nullable: true },
      { name: 'owner_id', type: 'INT' },
    ],
    task: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'project_id', type: 'INT' },
      { name: 'title', type: 'VARCHAR(200)' },
      { name: 'description', type: 'TEXT', nullable: true },
      { name: 'status', type: 'VARCHAR(20)' },
      { name: 'priority', type: 'VARCHAR(20)' },
      { name: 'assignee_id', type: 'INT', nullable: true },
      { name: 'due_date', type: 'TIMESTAMP', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    event: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'title', type: 'VARCHAR(200)' },
      { name: 'description', type: 'TEXT', nullable: true },
      { name: 'location', type: 'VARCHAR(200)', nullable: true },
      { name: 'start_time', type: 'TIMESTAMP' },
      { name: 'end_time', type: 'TIMESTAMP' },
      { name: 'organizer_id', type: 'INT' },
      { name: 'is_public', type: 'BOOLEAN' },
    ],
    booking: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'user_id', type: 'INT' },
      { name: 'resource_id', type: 'INT' },
      { name: 'start_time', type: 'TIMESTAMP' },
      { name: 'end_time', type: 'TIMESTAMP' },
      { name: 'status', type: 'VARCHAR(20)' },
      { name: 'notes', type: 'TEXT', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    file: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(255)' },
      { name: 'path', type: 'VARCHAR(500)' },
      { name: 'mime_type', type: 'VARCHAR(100)' },
      { name: 'size', type: 'INT' },
      { name: 'uploaded_by', type: 'INT' },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    log: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'user_id', type: 'INT', nullable: true },
      { name: 'action', type: 'VARCHAR(100)' },
      { name: 'entity_type', type: 'VARCHAR(50)' },
      { name: 'entity_id', type: 'INT' },
      { name: 'details', type: 'JSON', nullable: true },
      { name: 'ip_address', type: 'VARCHAR(45)', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    setting: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'key', type: 'VARCHAR(100)', unique: true },
      { name: 'value', type: 'TEXT' },
      { name: 'type', type: 'VARCHAR(20)' },
      { name: 'updated_at', type: 'TIMESTAMP' },
    ],
    subscription: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'user_id', type: 'INT' },
      { name: 'plan_id', type: 'INT' },
      { name: 'status', type: 'VARCHAR(20)' },
      { name: 'starts_at', type: 'TIMESTAMP' },
      { name: 'ends_at', type: 'TIMESTAMP', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    plan: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(100)' },
      { name: 'description', type: 'TEXT', nullable: true },
      { name: 'price', type: 'DECIMAL(10,2)' },
      { name: 'billing_period', type: 'VARCHAR(20)' },
      { name: 'features', type: 'JSON', nullable: true },
      { name: 'is_active', type: 'BOOLEAN' },
    ],
    coupon: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'code', type: 'VARCHAR(50)', unique: true },
      { name: 'discount_type', type: 'VARCHAR(20)' },
      { name: 'discount_value', type: 'DECIMAL(10,2)' },
      { name: 'min_order_amount', type: 'DECIMAL(10,2)', nullable: true },
      { name: 'max_uses', type: 'INT', nullable: true },
      { name: 'used_count', type: 'INT' },
      { name: 'expires_at', type: 'TIMESTAMP', nullable: true },
      { name: 'is_active', type: 'BOOLEAN' },
    ],
    wishlist: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'user_id', type: 'INT' },
      { name: 'product_id', type: 'INT' },
      { name: 'added_at', type: 'TIMESTAMP' },
    ],
    inventory: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'product_id', type: 'INT' },
      { name: 'warehouse_id', type: 'INT' },
      { name: 'quantity', type: 'INT' },
      { name: 'reserved', type: 'INT' },
      { name: 'updated_at', type: 'TIMESTAMP' },
    ],
    warehouse: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(100)' },
      { name: 'code', type: 'VARCHAR(20)', unique: true },
      { name: 'address', type: 'TEXT' },
      { name: 'is_active', type: 'BOOLEAN' },
    ],
    supplier: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(200)' },
      { name: 'contact_name', type: 'VARCHAR(100)', nullable: true },
      { name: 'email', type: 'VARCHAR(255)' },
      { name: 'phone', type: 'VARCHAR(20)', nullable: true },
      { name: 'address', type: 'TEXT', nullable: true },
      { name: 'is_active', type: 'BOOLEAN' },
    ],
    brand: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(100)' },
      { name: 'slug', type: 'VARCHAR(100)', unique: true },
      { name: 'logo_url', type: 'VARCHAR(500)', nullable: true },
      { name: 'description', type: 'TEXT', nullable: true },
    ],
    author: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(100)' },
      { name: 'email', type: 'VARCHAR(255)', unique: true },
      { name: 'bio', type: 'TEXT', nullable: true },
      { name: 'avatar_url', type: 'VARCHAR(500)', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    article: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'author_id', type: 'INT' },
      { name: 'title', type: 'VARCHAR(200)' },
      { name: 'slug', type: 'VARCHAR(200)', unique: true },
      { name: 'content', type: 'TEXT' },
      { name: 'featured_image', type: 'VARCHAR(500)', nullable: true },
      { name: 'status', type: 'VARCHAR(20)' },
      { name: 'views', type: 'INT' },
      { name: 'published_at', type: 'TIMESTAMP', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    media: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(255)' },
      { name: 'file_path', type: 'VARCHAR(500)' },
      { name: 'mime_type', type: 'VARCHAR(100)' },
      { name: 'size', type: 'INT' },
      { name: 'alt_text', type: 'VARCHAR(255)', nullable: true },
      { name: 'uploaded_by', type: 'INT' },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    role: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(50)', unique: true },
      { name: 'display_name', type: 'VARCHAR(100)' },
      { name: 'description', type: 'TEXT', nullable: true },
    ],
    permission: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'name', type: 'VARCHAR(100)', unique: true },
      { name: 'display_name', type: 'VARCHAR(100)' },
      { name: 'module', type: 'VARCHAR(50)' },
    ],
    session: [
      { name: 'id', type: 'VARCHAR(100)', pk: true },
      { name: 'user_id', type: 'INT' },
      { name: 'ip_address', type: 'VARCHAR(45)' },
      { name: 'user_agent', type: 'TEXT' },
      { name: 'payload', type: 'TEXT' },
      { name: 'last_activity', type: 'TIMESTAMP' },
    ],
    token: [
      { name: 'id', type: 'SERIAL', pk: true },
      { name: 'user_id', type: 'INT' },
      { name: 'token', type: 'VARCHAR(255)', unique: true },
      { name: 'type', type: 'VARCHAR(20)' },
      { name: 'expires_at', type: 'TIMESTAMP' },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
  };
  
  // Check for exact match or close match
  if (templates[name]) return JSON.parse(JSON.stringify(templates[name]));
  
  // Check for plural or with underscore variations
  const variations = [name, name + 's', name.replace(/_/g, '')];
  for (const v of variations) {
    if (templates[v]) return JSON.parse(JSON.stringify(templates[v]));
  }
  
  // Check if name contains a known template key
  for (const key of Object.keys(templates)) {
    if (name.includes(key) || key.includes(name)) {
      return JSON.parse(JSON.stringify(templates[key]));
    }
  }
  
  // Default columns
  return [
    { name: 'id', type: 'SERIAL', pk: true },
    { name: 'name', type: 'VARCHAR(100)' },
    { name: 'created_at', type: 'TIMESTAMP' },
    { name: 'updated_at', type: 'TIMESTAMP' },
  ];
}

// Helper: Wire up common foreign keys between tables
function wireCommonForeignKeys(tables: Table[]): void {
  const tableMap = new Map(tables.map(t => [t.name.toLowerCase().replace(/s$/, ''), t]));
  
  const fkMappings: Array<{ from: string; col: string; to: string }> = [
    { from: 'order', col: 'user_id', to: 'user' },
    { from: 'order', col: 'customer_id', to: 'customer' },
    { from: 'order_item', col: 'order_id', to: 'order' },
    { from: 'order_item', col: 'product_id', to: 'product' },
    { from: 'cart_item', col: 'cart_id', to: 'cart' },
    { from: 'cart_item', col: 'product_id', to: 'product' },
    { from: 'cart', col: 'user_id', to: 'user' },
    { from: 'product', col: 'category_id', to: 'category' },
    { from: 'product', col: 'brand_id', to: 'brand' },
    { from: 'post', col: 'author_id', to: 'user' },
    { from: 'post', col: 'author_id', to: 'author' },
    { from: 'article', col: 'author_id', to: 'author' },
    { from: 'article', col: 'author_id', to: 'user' },
    { from: 'comment', col: 'post_id', to: 'post' },
    { from: 'comment', col: 'user_id', to: 'user' },
    { from: 'review', col: 'product_id', to: 'product' },
    { from: 'review', col: 'user_id', to: 'user' },
    { from: 'payment', col: 'order_id', to: 'order' },
    { from: 'invoice', col: 'order_id', to: 'order' },
    { from: 'address', col: 'user_id', to: 'user' },
    { from: 'notification', col: 'user_id', to: 'user' },
    { from: 'message', col: 'sender_id', to: 'user' },
    { from: 'message', col: 'receiver_id', to: 'user' },
    { from: 'employee', col: 'department_id', to: 'department' },
    { from: 'task', col: 'project_id', to: 'project' },
    { from: 'task', col: 'assignee_id', to: 'user' },
    { from: 'booking', col: 'user_id', to: 'user' },
    { from: 'wishlist', col: 'user_id', to: 'user' },
    { from: 'wishlist', col: 'product_id', to: 'product' },
    { from: 'inventory', col: 'product_id', to: 'product' },
    { from: 'inventory', col: 'warehouse_id', to: 'warehouse' },
    { from: 'subscription', col: 'user_id', to: 'user' },
    { from: 'subscription', col: 'plan_id', to: 'plan' },
    { from: 'session', col: 'user_id', to: 'user' },
    { from: 'token', col: 'user_id', to: 'user' },
    { from: 'file', col: 'uploaded_by', to: 'user' },
    { from: 'media', col: 'uploaded_by', to: 'user' },
    { from: 'log', col: 'user_id', to: 'user' },
  ];
  
  for (const mapping of fkMappings) {
    const fromTable = tableMap.get(mapping.from) || tables.find(t => t.name.toLowerCase().includes(mapping.from));
    const toTable = tableMap.get(mapping.to) || tables.find(t => t.name.toLowerCase().includes(mapping.to));
    
    if (fromTable && toTable && fromTable !== toTable) {
      const col = fromTable.columns.find(c => c.name === mapping.col);
      if (col && !col.fk) {
        col.fk = { table: toTable.name, column: 'id' };
      }
    }
  }
}

// Helper: Find table by flexible name matching
function findTable(tables: Table[], name: string): Table | undefined {
  const normalized = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return tables.find(t => t.name.toLowerCase() === normalized) ||
         tables.find(t => t.name.toLowerCase().replace(/s$/, '') === normalized.replace(/s$/, '')) ||
         tables.find(t => t.name.toLowerCase().includes(normalized) || normalized.includes(t.name.toLowerCase()));
}

// Main AI function
function aiModifySchema(schema: Schema, userRequest: string): { schema: Schema; response: string } {
  const req = normalizeText(userRequest);
  let newSchema = JSON.parse(JSON.stringify(schema)) as Schema;
  const intent = detectIntent(req);
  const identifiers = extractIdentifiers(req);
  
  // ─── Greetings and small talk ──────────────────────────────────────────────
  if (intent === 'greeting') {
    return { schema: newSchema, response: `👋 Hello! I'm your intelligent schema assistant. Just describe what you want in natural language!\n\nFor example:\n• "Create tables for users, products, and orders with appropriate fields"\n• "I need a blog database with posts, comments, and authors"\n• "Add an email field to the customers table"` };
  }
  
  if (intent === 'thanks') {
    return { schema: newSchema, response: `😊 You're welcome! Let me know if you need anything else with your schema.` };
  }
  
  if (intent === 'bye') {
    return { schema: newSchema, response: `👋 Goodbye! Your schema is saved. Come back anytime!` };
  }
  
  // ─── Help ──────────────────────────────────────────────────────────────────
  if (intent === 'help') {
    return { schema: newSchema, response: `🤖 **I understand natural language! Just tell me what you need:**

**Creating Tables:**
• "Create tables for users, orders, and products"
• "I need a customer table with name, email, and phone"
• "Build me a blog database with posts and comments"
• "Set up an e-commerce schema"

**Modifying Tables:**
• "Add an email column to users"
• "Remove the bio field from customers"
• "Rename the products table to items"

**Relationships (I'm smart about these!):**
• "Add relationships to the new tables" ← I'll figure out the connections!
• "Link them together" / "Connect those tables"
• "Wire up the foreign keys automatically"
• "Link orders to users" (specific)

**Categories & Groups:**
• "Auto-organize tables" — Smart grouping by table purpose
• "Create a category called User Management"
• "Create orders table in the Sales group"
• "Assign users to the User Management category"
• "Move payments to Orders group"

**Constraints:**
• "Make email unique in users"
• "Set name as required"
• "Mark description as optional"

**Smart Features:**
• "Suggest improvements" — I'll analyze your schema
• "What's missing?" — I'll identify potential issues
• "Organize tables" — Auto-group by category

**Other:**
• "Show me the current schema"
• "How many tables do I have?"
• "Clear everything and start fresh"

💡 **Tip:** I remember context! After creating tables, just say "now link them" or "organize them".` };
  }
  
  // ─── Clear / Reset ─────────────────────────────────────────────────────────
  if (intent === 'clear') {
    newSchema.tables = [];
    newSchema.categories = [];
    conversationContext = { lastCreatedTables: [], lastModifiedTable: '', lastAction: '', recentTables: [] };
    return { schema: newSchema, response: '🧹 Cleared the entire schema. You have a blank canvas now!' };
  }
  
  // ─── Stats ─────────────────────────────────────────────────────────────────
  if (intent === 'stats') {
    if (newSchema.tables.length === 0) {
      return { schema: newSchema, response: '📊 The schema is empty. Start by creating some tables!' };
    }
    const tableCount = newSchema.tables.length;
    const colCount = newSchema.tables.reduce((sum, t) => sum + t.columns.length, 0);
    const fkCount = newSchema.tables.reduce((sum, t) => sum + t.columns.filter((c) => c.fk).length, 0);
    const pkCount = newSchema.tables.reduce((sum, t) => sum + t.columns.filter((c) => c.pk).length, 0);
    return { schema: newSchema, response: `📊 **Schema Statistics:**\n• **${tableCount}** tables\n• **${colCount}** total columns\n• **${pkCount}** primary keys\n• **${fkCount}** foreign key relationships` };
  }
  
  // ─── Suggest / Improve / Optimize ──────────────────────────────────────────
  if (intent === 'suggest' || intent === 'optimize') {
    if (newSchema.tables.length === 0) {
      return { schema: newSchema, response: '💡 Your schema is empty! Start by telling me what kind of application you\'re building (e.g., "e-commerce", "blog", "social network").' };
    }
    
    const suggestions: string[] = [];
    const issues: string[] = [];
    
    // Check for missing PKs
    const tablesWithoutPK = newSchema.tables.filter(t => !t.columns.some(c => c.pk));
    if (tablesWithoutPK.length > 0) {
      issues.push(`⚠️ Tables without primary key: ${tablesWithoutPK.map(t => `**${t.name}**`).join(', ')}`);
    }
    
    // Check for orphan tables (no FKs pointing to/from them)
    const tablesWithFKs = new Set<string>();
    newSchema.tables.forEach(t => {
      t.columns.forEach(c => {
        if (c.fk) {
          tablesWithFKs.add(t.name);
          tablesWithFKs.add(c.fk.table);
        }
      });
    });
    const orphanTables = newSchema.tables.filter(t => !tablesWithFKs.has(t.name) && newSchema.tables.length > 1);
    if (orphanTables.length > 0) {
      issues.push(`🔗 Isolated tables (no relationships): ${orphanTables.map(t => `**${t.name}**`).join(', ')}`);
    }
    
    // Check for missing timestamps
    const tablesWithoutTimestamps = newSchema.tables.filter(t => 
      !t.columns.some(c => c.name.includes('created') || c.name.includes('_at') || c.name.includes('date'))
    );
    if (tablesWithoutTimestamps.length > 0) {
      suggestions.push(`📅 Consider adding \`created_at\` to: ${tablesWithoutTimestamps.map(t => `**${t.name}**`).join(', ')}`);
    }
    
    // Check for potential missing FKs based on column names
    const potentialFKs: string[] = [];
    newSchema.tables.forEach(t => {
      t.columns.forEach(c => {
        if (c.name.endsWith('_id') && !c.fk) {
          const refTableName = c.name.replace(/_id$/, '');
          const refTable = newSchema.tables.find(rt => 
            rt.name === refTableName || rt.name === refTableName + 's' || rt.name === refTableName.replace(/s$/, '')
          );
          if (refTable) {
            potentialFKs.push(`**${t.name}.${c.name}** → **${refTable.name}**`);
          }
        }
      });
    });
    if (potentialFKs.length > 0) {
      suggestions.push(`🔗 Potential missing relationships:\n  ${potentialFKs.join('\n  ')}\n  Say "add relationships" to wire them up!`);
    }
    
    // Build response
    let response = '💡 **Schema Analysis:**\n\n';
    if (issues.length > 0) {
      response += '**Issues Found:**\n' + issues.join('\n') + '\n\n';
    }
    if (suggestions.length > 0) {
      response += '**Suggestions:**\n' + suggestions.join('\n') + '\n\n';
    }
    if (issues.length === 0 && suggestions.length === 0) {
      response += '✅ Your schema looks good! No obvious issues found.\n\nTips:\n• Make sure all important columns are NOT NULL\n• Consider adding indexes for frequently queried columns\n• Add `updated_at` timestamps for audit trails';
    }
    
    return { schema: newSchema, response };
  }
  
  // ─── Auto Add FKs / Relationships ──────────────────────────────────────────
  if (intent === 'add_fks_auto') {
    // Determine which tables to work with
    let targetTables: Table[];
    
    if (isReferringToContext(req) && conversationContext.lastCreatedTables.length > 0) {
      // User is referring to recently created tables
      targetTables = newSchema.tables.filter(t => 
        conversationContext.lastCreatedTables.includes(t.name) ||
        conversationContext.recentTables.includes(t.name)
      );
    } else {
      // Work with all tables
      targetTables = newSchema.tables;
    }
    
    if (targetTables.length === 0) {
      targetTables = newSchema.tables;
    }
    
    if (newSchema.tables.length < 2) {
      return { schema: newSchema, response: '⚠️ Need at least 2 tables to create relationships. Create more tables first!' };
    }
    
    const createdFKs: string[] = [];
    
    // Smart FK detection: look at column names ending in _id
    targetTables.forEach(table => {
      table.columns.forEach(col => {
        if (col.name.endsWith('_id') && !col.fk && col.name !== 'id') {
          const refTableName = col.name.replace(/_id$/, '');
          
          // Try to find matching table
          const refTable = newSchema.tables.find(t => {
            const tName = t.name.toLowerCase();
            const rName = refTableName.toLowerCase();
            return tName === rName || 
                   tName === rName + 's' || 
                   tName === rName + 'es' ||
                   tName.replace(/s$/, '') === rName ||
                   tName.replace(/ies$/, 'y') === rName ||
                   rName.replace(/ies$/, 'y') === tName;
          });
          
          if (refTable && refTable.name !== table.name) {
            col.fk = { table: refTable.name, column: 'id' };
            createdFKs.push(`**${table.name}.${col.name}** → **${refTable.name}.id**`);
          }
        }
      });
    });
    
    // Also check for common relationship patterns even without _id suffix
    const commonPatterns: Array<{ from: string; col: string; to: string }> = [
      { from: 'order', col: 'customer', to: 'customer' },
      { from: 'order', col: 'buyer', to: 'user' },
      { from: 'post', col: 'author', to: 'user' },
      { from: 'comment', col: 'author', to: 'user' },
      { from: 'article', col: 'writer', to: 'user' },
      { from: 'review', col: 'reviewer', to: 'user' },
      { from: 'message', col: 'sender', to: 'user' },
      { from: 'message', col: 'recipient', to: 'user' },
    ];
    
    commonPatterns.forEach(pattern => {
      const fromTable = targetTables.find(t => t.name.toLowerCase().includes(pattern.from));
      const toTable = newSchema.tables.find(t => t.name.toLowerCase().includes(pattern.to));
      
      if (fromTable && toTable && fromTable !== toTable) {
        // Check if there's a column that should be an FK
        const col = fromTable.columns.find(c => 
          c.name.toLowerCase().includes(pattern.col) && !c.fk
        );
        if (col) {
          col.fk = { table: toTable.name, column: 'id' };
          createdFKs.push(`**${fromTable.name}.${col.name}** → **${toTable.name}.id**`);
        }
      }
    });
    
    if (createdFKs.length === 0) {
      // Try to be helpful
      const tablesChecked = targetTables.map(t => t.name).join(', ');
      return { schema: newSchema, response: `🤔 I checked ${tablesChecked} but couldn't find obvious relationships to add.\n\n**Tips:**\n• Name FK columns with \`_id\` suffix (e.g., \`user_id\`, \`order_id\`)\n• Or specify: "Link orders.user_id to users.id"\n• Or ask me to suggest improvements: "What's missing?"` };
    }
    
    conversationContext.lastAction = 'add_fks';
    
    return { schema: newSchema, response: `🔗 **Created ${createdFKs.length} relationship${createdFKs.length > 1 ? 's' : ''}:**\n${createdFKs.join('\n')}\n\n✨ Your tables are now connected!` };
  }
  
  // ─── Describe / Show ───────────────────────────────────────────────────────
  if (intent === 'describe') {
    if (newSchema.tables.length === 0) {
      return { schema: newSchema, response: '📋 The schema is empty. Tell me what tables you need!' };
    }
    const summary = newSchema.tables.map((t) => {
      const cols = t.columns.map(c => {
        let badges = '';
        if (c.pk) badges += ' 🔑';
        if (c.fk) badges += ' 🔗';
        if (c.unique) badges += ' ✨';
        return `\`${c.name}\` (${c.type})${badges}`;
      }).join(', ');
      return `• **${t.name}** — ${cols}`;
    }).join('\n');
    return { schema: newSchema, response: `📋 **Current Schema:**\n${summary}` };
  }
  
  // ─── Create Multiple Tables ────────────────────────────────────────────────
  if (intent === 'create_tables') {
    // Check if user wants default/appropriate attributes - make this more comprehensive
    const wantDefaults = /\b(appropriate|necessary|default|typical|common|sensible|proper|relevant|suitable|good|standard|normal|basic|essential|required|needed|smart|full|complete)\b/i.test(req) ||
                        /\b(with|add|include|generate|having)\b.*\b(attributes?|columns?|fields?|properties)\b/i.test(req) ||
                        /\bfor\s+(each|every|all)\b/i.test(req) ||
                        /\b(full|complete)\s+(tables?|schema)\b/i.test(req);
    
    // Extract table names - improved logic
    let tableNames: string[] = [];
    
    // Try explicit listing format: "create users, products, orders"
    const listMatch = req.match(/\b(?:tables?|table\s+for|database\s+for)\s+([a-z_][a-z0-9_,\s]+)/i);
    if (listMatch) {
      tableNames = listMatch[1].split(/[,\s]+/).map(s => s.trim()).filter(s => s.length > 2 && !/^(and|or|with|for|the|a|an)$/i.test(s));
    } else {
      // Use identifiers
      tableNames = identifiers.filter(id => {
        const lower = id.toLowerCase();
        return lower.length > 2 && 
               !['ecommerce', 'blog', 'database', 'schema', 'system', 'api', 'app', 'application', 'store', 'shop', 'website', 'web', 'site', 'platform', 'appropriate', 'necessary', 'default'].includes(lower);
      });
    }
    
    // If still no tables found, try to infer from context keywords
    if (tableNames.length === 0) {
      if (/\b(e-?commerce|shop|store|retail|marketplace)\b/i.test(req)) {
        tableNames.push('users', 'products', 'categories', 'orders', 'order_items', 'cart');
      } else if (/\b(blog|cms|content|publishing)\b/i.test(req)) {
        tableNames.push('authors', 'posts', 'categories', 'comments', 'tags');
      } else if (/\b(social|network|community|forum)\b/i.test(req)) {
        tableNames.push('users', 'posts', 'comments', 'likes', 'follows', 'messages');
      } else if (/\b(crm|customer|sales|leads?)\b/i.test(req)) {
        tableNames.push('customers', 'contacts', 'deals', 'activities', 'notes', 'companies');
      } else if (/\b(hr|employee|staff|personnel)\b/i.test(req)) {
        tableNames.push('employees', 'departments', 'positions', 'leaves', 'payroll');
      } else if (/\b(project|task|management|kanban)\b/i.test(req)) {
        tableNames.push('projects', 'tasks', 'users', 'comments', 'files', 'sprints');
      } else if (/\b(inventory|warehouse|stock|logistics)\b/i.test(req)) {
        tableNames.push('products', 'warehouses', 'inventory', 'suppliers', 'orders');
      }
    }
    
    if (tableNames.length === 0) {
      return { schema: newSchema, response: `🤔 I couldn't identify specific table names. Could you list them? For example:\n• "Create tables users, products, orders with appropriate columns"\n• "I need customer, order, and product tables"\n• "Build an e-commerce schema"` };
    }
    
    const created: string[] = [];
    const skipped: string[] = [];
    const categorized: string[] = [];
    
    // Ensure default columns if requested
    if (!wantDefaults) {
      // If not explicitly requested, still give them some columns for usability
      wantDefaults = true; // Default to giving full tables
    }
    
    // Helper to find matching category for a table name
    const findMatchingCategory = (tableName: string): { id: string; name: string; color: string } | undefined => {
      if (!newSchema.categories || newSchema.categories.length === 0) return undefined;
      
      const tableNameLower = tableName.toLowerCase();
      const userPatterns = /user|account|auth|profile|login|session|permission|role/i;
      const orderPatterns = /order|cart|checkout|payment|invoice|transaction|sale/i;
      const productPatterns = /product|item|inventory|stock|sku|catalog/i;
      const contentPatterns = /post|article|blog|comment|media|content|document/i;
      const customerPatterns = /customer|client|contact|lead|company/i;
      const hrPatterns = /employee|staff|department|salary|payroll|job/i;
      const messagePatterns = /message|notification|email|chat|inbox/i;
      
      for (const cat of newSchema.categories) {
        const catNameLower = cat.name.toLowerCase();
        
        if ((catNameLower.includes('user') || userPatterns.test(catNameLower)) && userPatterns.test(tableNameLower)) {
          return cat;
        }
        if ((catNameLower.includes('order') || catNameLower.includes('sale') || orderPatterns.test(catNameLower)) && orderPatterns.test(tableNameLower)) {
          return cat;
        }
        if ((catNameLower.includes('product') || catNameLower.includes('inventory') || productPatterns.test(catNameLower)) && productPatterns.test(tableNameLower)) {
          return cat;
        }
        if ((catNameLower.includes('content') || catNameLower.includes('post') || contentPatterns.test(catNameLower)) && contentPatterns.test(tableNameLower)) {
          return cat;
        }
        if ((catNameLower.includes('customer') || catNameLower.includes('crm') || customerPatterns.test(catNameLower)) && customerPatterns.test(tableNameLower)) {
          return cat;
        }
        if ((catNameLower.includes('hr') || catNameLower.includes('employee') || hrPatterns.test(catNameLower)) && hrPatterns.test(tableNameLower)) {
          return cat;
        }
        if ((catNameLower.includes('message') || messagePatterns.test(catNameLower)) && messagePatterns.test(tableNameLower)) {
          return cat;
        }
        if (catNameLower.includes(tableNameLower) || tableNameLower.includes(catNameLower.replace(/[^\w]/g, ''))) {
          return cat;
        }
      }
      return undefined;
    };
    
    for (const name of tableNames) {
      const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (!cleanName || cleanName.length < 2) continue;
      
      if (newSchema.tables.find(t => t.name.toLowerCase() === cleanName)) {
        skipped.push(cleanName);
        continue;
      }
      
      // Always get default columns for better UX
      const columns = getDefaultColumnsForTable(cleanName);
      
      // Ensure at least basic columns if template didn't provide enough
      if (columns.length === 0) {
        columns.push(
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'created_at', type: 'TIMESTAMP' },
          { name: 'updated_at', type: 'TIMESTAMP' }
        );
      }
      
      // Smart category assignment
      const matchingCat = findMatchingCategory(cleanName);
      
      newSchema.tables.push({
        name: cleanName,
        color: matchingCat?.color || randomColor(),
        columns: columns,
        category: matchingCat?.id,
      });
      created.push(cleanName);
      if (matchingCat) {
        categorized.push(cleanName);
      }
    }
    
    // Wire up foreign keys if defaults were requested
    if (wantDefaults && created.length > 1) {
      wireCommonForeignKeys(newSchema.tables);
    }
    
    if (created.length === 0) {
      return { schema: newSchema, response: `⚠️ All specified tables already exist: ${skipped.join(', ')}` };
    }
    
    // Track created tables for context-aware follow-up commands
    conversationContext.lastCreatedTables = [...created];
    conversationContext.recentTables = [...created, ...conversationContext.recentTables].slice(0, 10);
    conversationContext.lastAction = 'create_tables';
    
    let msg = `✅ Created **${created.length}** table${created.length > 1 ? 's' : ''}: ${created.map(n => `**${n}**`).join(', ')}`;
    
    // Count columns added
    const totalCols = created.reduce((sum, name) => {
      const table = newSchema.tables.find(t => t.name === name);
      return sum + (table?.columns.length || 0);
    }, 0);
    
    msg += `\n\n📝 Added ${totalCols} columns with smart defaults and relationships.`;
    
    if (categorized.length > 0) {
      msg += `\n\n📁 Auto-assigned ${categorized.length} table(s) to matching categories.`;
    }
    if (skipped.length > 0) {
      msg += `\n\n⚠️ Skipped existing: ${skipped.join(', ')}`;
    }
    msg += '\n\n💡 *Tip: Say "organize tables" to auto-group or "link them together" to add more relationships!*';
    
    return { schema: newSchema, response: msg };
  }
  
  // ─── Create Single Table ───────────────────────────────────────────────────
  if (intent === 'create_table') {
    const wantDefaults = /\b(appropriate|necessary|default|typical|common|sensible|proper|relevant|suitable|good|standard|smart|full|complete|with\s+columns?|with\s+fields?|with\s+attributes?)\b/i.test(req);
    
    // Try to extract table name and columns - improved patterns
    const withMatch = req.match(/\b(?:table\s+)?(?:called\s+|named\s+)?(\w+)\s+(?:table\s+)?(?:with|having|containing|including)\s+(.+)/i) ||
                      req.match(/\b(\w+)\s+table\s+(?:with|having)\s+(.+)/i);
    
    let tableName = '';
    let explicitColumns: string[] = [];
    
    if (withMatch) {
      tableName = withMatch[1];
      // Parse explicit columns
      const colPart = withMatch[2].replace(/\b(columns?|fields?|attributes?)\b/gi, '').trim();
      explicitColumns = colPart.split(/[,\s]+(?:and\s+)?/).map(s => s.trim()).filter(s => s.length > 1 && !/^(and|or|with|for)$/i.test(s));
    } else if (identifiers.length > 0) {
      tableName = identifiers[0];
    }
    
    // Also check for "table for X" pattern
    if (!tableName) {
      const forMatch = req.match(/\btable\s+for\s+(\w+)/i) || req.match(/\b(\w+)\s+table\b/i);
      if (forMatch) tableName = forMatch[1];
    }
    
    if (!tableName || tableName.length < 2) {
      return { schema: newSchema, response: `🤔 What would you like to name the table? For example: "Create a users table"` };
    }
    
    const cleanName = tableName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    if (newSchema.tables.find(t => t.name.toLowerCase() === cleanName)) {
      return { schema: newSchema, response: `⚠️ Table **${cleanName}** already exists. Would you like to add columns to it instead?` };
    }
    
    let columns: Column[];
    
    if (explicitColumns.length > 0) {
      // User specified columns explicitly
      columns = [];
      let hasId = false;
      
      for (const colDef of explicitColumns) {
        if (!colDef || colDef.length < 2) continue;
        const parts = colDef.trim().split(/\s+/);
        const colName = parts[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        if (!colName) continue;
        
        const colType = parts[1]?.toUpperCase() || inferColumnType(colName);
        const isPk = colName === 'id';
        if (isPk) hasId = true;
        
        columns.push({
          name: colName,
          type: colType,
          pk: isPk,
          nullable: !isPk && !colName.includes('name') && !colName.includes('email'),
        });
      }
      
      // Add id if not present
      if (!hasId) {
        columns.unshift({ name: 'id', type: 'SERIAL', pk: true });
      }
      
      // Add timestamps if not present
      if (!columns.some(c => c.name.includes('created'))) {
        columns.push({ name: 'created_at', type: 'TIMESTAMP', nullable: true });
      }
    } else {
      // Get smart defaults - always use templates for better UX
      columns = getDefaultColumnsForTable(cleanName);
      
      // Ensure minimum columns if template returned empty
      if (columns.length === 0) {
        columns = [
          { name: 'id', type: 'SERIAL', pk: true },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'created_at', type: 'TIMESTAMP' },
          { name: 'updated_at', type: 'TIMESTAMP' },
        ];
      }
    }
    
    // Smart category assignment: find matching category based on table name
    let assignedCategory: string | undefined = undefined;
    let categoryName = '';
    
    if (newSchema.categories && newSchema.categories.length > 0) {
      // Try to match table to existing category using semantic patterns
      for (const cat of newSchema.categories) {
        const catNameLower = cat.name.toLowerCase();
        const tableNameLower = cleanName.toLowerCase();
        
        // Direct match or semantic patterns
        const userPatterns = /user|account|auth|profile|login|session|permission|role/i;
        const orderPatterns = /order|cart|checkout|payment|invoice|transaction|sale/i;
        const productPatterns = /product|item|inventory|stock|sku|catalog/i;
        const contentPatterns = /post|article|blog|comment|media|content|document/i;
        const customerPatterns = /customer|client|contact|lead|company/i;
        const hrPatterns = /employee|staff|department|salary|payroll|job/i;
        const messagePatterns = /message|notification|email|chat|inbox/i;
        
        // Check if category matches a pattern and table also matches
        if ((catNameLower.includes('user') || userPatterns.test(catNameLower)) && userPatterns.test(tableNameLower)) {
          assignedCategory = cat.id;
          categoryName = cat.name;
          break;
        }
        if ((catNameLower.includes('order') || catNameLower.includes('sale') || orderPatterns.test(catNameLower)) && orderPatterns.test(tableNameLower)) {
          assignedCategory = cat.id;
          categoryName = cat.name;
          break;
        }
        if ((catNameLower.includes('product') || catNameLower.includes('inventory') || productPatterns.test(catNameLower)) && productPatterns.test(tableNameLower)) {
          assignedCategory = cat.id;
          categoryName = cat.name;
          break;
        }
        if ((catNameLower.includes('content') || catNameLower.includes('post') || catNameLower.includes('blog') || contentPatterns.test(catNameLower)) && contentPatterns.test(tableNameLower)) {
          assignedCategory = cat.id;
          categoryName = cat.name;
          break;
        }
        if ((catNameLower.includes('customer') || catNameLower.includes('crm') || customerPatterns.test(catNameLower)) && customerPatterns.test(tableNameLower)) {
          assignedCategory = cat.id;
          categoryName = cat.name;
          break;
        }
        if ((catNameLower.includes('hr') || catNameLower.includes('employee') || hrPatterns.test(catNameLower)) && hrPatterns.test(tableNameLower)) {
          assignedCategory = cat.id;
          categoryName = cat.name;
          break;
        }
        if ((catNameLower.includes('message') || messagePatterns.test(catNameLower)) && messagePatterns.test(tableNameLower)) {
          assignedCategory = cat.id;
          categoryName = cat.name;
          break;
        }
        
        // Also check if table name directly matches category name
        if (catNameLower.includes(tableNameLower) || tableNameLower.includes(catNameLower.replace(/[^\w]/g, ''))) {
          assignedCategory = cat.id;
          categoryName = cat.name;
          break;
        }
      }
    }
    
    const newTable: Table = {
      name: cleanName,
      color: assignedCategory 
        ? newSchema.categories?.find(c => c.id === assignedCategory)?.color || randomColor()
        : randomColor(),
      columns: columns,
      category: assignedCategory,
    };
    
    newSchema.tables.push(newTable);
    
    // Wire up FKs if there are related tables
    wireCommonForeignKeys(newSchema.tables);
    
    // Track for context-aware follow-ups
    conversationContext.lastCreatedTables = [cleanName];
    conversationContext.lastModifiedTable = cleanName;
    conversationContext.recentTables = [cleanName, ...conversationContext.recentTables.filter(t => t !== cleanName)].slice(0, 10);
    conversationContext.lastAction = 'create_table';
    
    const colList = columns.map(c => `\`${c.name}\` (${c.type})${c.pk ? ' 🔑' : ''}`).join(', ');
    let response = `✅ Created table **${cleanName}**\n\n📝 Columns: ${colList}`;
    if (assignedCategory && categoryName) {
      response += `\n\n📁 Auto-assigned to **"${categoryName}"** category`;
    }
    return { schema: newSchema, response };
  }
  
  // ─── Add Column ────────────────────────────────────────────────────────────
  if (intent === 'add_column') {
    // Try to find table and column from context
    let tableName = '';
    let colName = '';
    let colType = '';
    
    // Pattern: "add X to Y" or "add X in Y"
    const addToMatch = req.match(/\b(?:add|insert|put|include)\b.*?\b(\w+)\b.*?\b(?:to|in|into|on)\b.*?\b(\w+)\b/i);
    if (addToMatch) {
      colName = addToMatch[1];
      tableName = addToMatch[2];
    }
    
    // Check for type specification
    const typeMatch = req.match(/\b(varchar|int|text|boolean|decimal|timestamp|date|uuid|json|serial|bigint)\b(?:\s*\([^)]+\))?/i);
    if (typeMatch) {
      colType = typeMatch[0].toUpperCase();
    }
    
    // Fall back to identifiers if pattern didn't match well
    if (!tableName && identifiers.length >= 2) {
      // Assume last identifier is the table
      tableName = identifiers[identifiers.length - 1];
      colName = identifiers[0];
    } else if (!tableName && identifiers.length === 1) {
      // Only one identifier - might be the column, look for existing table
      colName = identifiers[0];
      if (newSchema.tables.length === 1) {
        tableName = newSchema.tables[0].name;
      }
    }
    
    if (!tableName) {
      return { schema: newSchema, response: `🤔 Which table should I add the column to? For example: "Add email to users"` };
    }
    
    const table = findTable(newSchema.tables, tableName);
    if (!table) {
      const suggestions = newSchema.tables.map(t => t.name).join(', ') || 'none yet';
      return { schema: newSchema, response: `⚠️ Couldn't find table **${tableName}**. Available tables: ${suggestions}` };
    }
    
    if (!colName) {
      return { schema: newSchema, response: `🤔 What column would you like to add to **${table.name}**?` };
    }
    
    const cleanColName = colName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    if (table.columns.find(c => c.name.toLowerCase() === cleanColName)) {
      return { schema: newSchema, response: `⚠️ Column \`${cleanColName}\` already exists in **${table.name}**.` };
    }
    
    const finalType = colType || inferColumnType(cleanColName);
    
    table.columns.push({
      name: cleanColName,
      type: finalType,
      pk: false,
      nullable: true,
    });
    
    // Track context
    conversationContext.lastModifiedTable = table.name;
    conversationContext.lastAction = 'add_column';
    
    return { schema: newSchema, response: `✅ Added column \`${cleanColName}\` (${finalType}) to **${table.name}**` };
  }
  
  // ─── Add Multiple Columns (context-aware) ──────────────────────────────────
  if (intent === 'add_columns') {
    // Handle commands like "add email, phone, address to them" or "add columns to the new tables"
    let targetTables: Table[] = [];
    
    // Check for contextual references
    if (isReferringToContext(req)) {
      if (conversationContext.lastCreatedTables.length > 0) {
        targetTables = newSchema.tables.filter(t => 
          conversationContext.lastCreatedTables.includes(t.name)
        );
      } else if (conversationContext.lastModifiedTable) {
        const lastTable = findTable(newSchema.tables, conversationContext.lastModifiedTable);
        if (lastTable) targetTables = [lastTable];
      }
    }
    
    // Also check for explicit table references
    const explicitTableMatch = req.match(/\bto\s+(\w+(?:\s*,\s*\w+)*)\b(?:\s+table)?s?/i);
    if (explicitTableMatch && !isReferringToContext(req)) {
      const tableNames = explicitTableMatch[1].split(/,/).map(s => s.trim().toLowerCase());
      targetTables = newSchema.tables.filter(t => 
        tableNames.some(name => t.name.toLowerCase().includes(name))
      );
    }
    
    if (targetTables.length === 0) {
      return { schema: newSchema, response: `🤔 Which table(s) should I add columns to? Tell me the table names or create tables first.` };
    }
    
    // Extract column names from the request
    const columnNames = identifiers.filter(id => {
      const lower = id.toLowerCase();
      // Filter out table names and common words
      return !targetTables.some(t => t.name.toLowerCase() === lower) &&
             !['add', 'columns', 'fields', 'table', 'tables', 'them', 'these', 'those', 'new'].includes(lower);
    });
    
    if (columnNames.length === 0) {
      return { schema: newSchema, response: `🤔 What columns would you like to add to ${targetTables.map(t => `**${t.name}**`).join(', ')}?` };
    }
    
    const addedCols: string[] = [];
    
    for (const table of targetTables) {
      for (const colName of columnNames) {
        const cleanCol = colName.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (!cleanCol || table.columns.find(c => c.name.toLowerCase() === cleanCol)) continue;
        
        table.columns.push({
          name: cleanCol,
          type: inferColumnType(cleanCol),
          pk: false,
          nullable: true,
        });
        addedCols.push(`**${table.name}**.${cleanCol}`);
      }
    }
    
    if (addedCols.length === 0) {
      return { schema: newSchema, response: `⚠️ Those columns already exist in the target tables.` };
    }
    
    conversationContext.lastAction = 'add_columns';
    
    return { schema: newSchema, response: `✅ Added ${addedCols.length} column${addedCols.length > 1 ? 's' : ''}:\n${addedCols.join('\n')}` };
  }
  
  // ─── Remove Table ──────────────────────────────────────────────────────────
  if (intent === 'remove_table') {
    const tableName = identifiers[0];
    if (!tableName) {
      return { schema: newSchema, response: `🤔 Which table would you like to remove?` };
    }
    
    const table = findTable(newSchema.tables, tableName);
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }
    
    // Remove the table
    newSchema.tables = newSchema.tables.filter(t => t.name !== table.name);
    
    // Remove FK references to deleted table
    newSchema.tables.forEach(t => {
      t.columns.forEach(c => {
        if (c.fk && c.fk.table === table.name) {
          delete c.fk;
        }
      });
    });
    
    return { schema: newSchema, response: `🗑️ Removed table **${table.name}** and all foreign key references to it.` };
  }
  
  // ─── Remove Column ─────────────────────────────────────────────────────────
  if (intent === 'remove_column') {
    let tableName = '';
    let colName = '';
    
    // Pattern: "remove X from Y"
    const fromMatch = req.match(/\b(?:remove|delete|drop)\b.*?\b(\w+)\b.*?\b(?:from|in)\b.*?\b(\w+)\b/i);
    if (fromMatch) {
      colName = fromMatch[1];
      tableName = fromMatch[2];
    } else if (identifiers.length >= 2) {
      colName = identifiers[0];
      tableName = identifiers[1];
    }
    
    if (!tableName || !colName) {
      return { schema: newSchema, response: `🤔 Which column from which table? For example: "Remove bio from users"` };
    }
    
    const table = findTable(newSchema.tables, tableName);
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }
    
    const colIndex = table.columns.findIndex(c => c.name.toLowerCase() === colName.toLowerCase());
    if (colIndex === -1) {
      return { schema: newSchema, response: `⚠️ Column \`${colName}\` not found in **${table.name}**.` };
    }
    
    table.columns.splice(colIndex, 1);
    return { schema: newSchema, response: `🗑️ Removed column \`${colName}\` from **${table.name}**.` };
  }
  
  // ─── Rename Table ──────────────────────────────────────────────────────────
  if (intent === 'rename_table') {
    // Pattern: "rename X to Y"
    const renameMatch = req.match(/\brename\b.*?\b(\w+)\b.*?\b(?:to|as)\b.*?\b(\w+)\b/i);
    
    if (!renameMatch) {
      return { schema: newSchema, response: `🤔 What would you like to rename? For example: "Rename users to customers"` };
    }
    
    const [, oldName, newName] = renameMatch;
    const table = findTable(newSchema.tables, oldName);
    
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${oldName}** not found.` };
    }
    
    const cleanNewName = newName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    // Update FK references
    newSchema.tables.forEach(t => {
      t.columns.forEach(c => {
        if (c.fk && c.fk.table === table.name) {
          c.fk.table = cleanNewName;
        }
      });
    });
    
    table.name = cleanNewName;
    return { schema: newSchema, response: `✏️ Renamed table **${oldName}** to **${cleanNewName}**.` };
  }
  
  // ─── Rename Column ─────────────────────────────────────────────────────────
  if (intent === 'rename_column') {
    // Pattern: "rename X to Y in Z"
    const renameMatch = req.match(/\brename\b.*?\b(\w+)\b.*?\b(?:to|as)\b.*?\b(\w+)\b.*?\b(?:in|on|from)\b.*?\b(\w+)\b/i);
    
    if (!renameMatch) {
      return { schema: newSchema, response: `🤔 Please specify: "Rename oldColumn to newColumn in tableName"` };
    }
    
    const [, oldCol, newCol, tableName] = renameMatch;
    const table = findTable(newSchema.tables, tableName);
    
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }
    
    const col = table.columns.find(c => c.name.toLowerCase() === oldCol.toLowerCase());
    if (!col) {
      return { schema: newSchema, response: `⚠️ Column \`${oldCol}\` not found in **${table.name}**.` };
    }
    
    col.name = newCol.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return { schema: newSchema, response: `✏️ Renamed column \`${oldCol}\` to \`${col.name}\` in **${table.name}**.` };
  }
  
  // ─── Change Type ───────────────────────────────────────────────────────────
  if (intent === 'change_type') {
    const typeMatch = req.match(/\b(varchar|int|text|boolean|decimal|timestamp|date|uuid|json|serial|bigint)\b(?:\s*\([^)]+\))?/i);
    const newType = typeMatch ? typeMatch[0].toUpperCase() : '';
    
    if (!newType) {
      return { schema: newSchema, response: `🤔 What type should it be? For example: "Change price type to DECIMAL(10,2) in products"` };
    }
    
    // Find column and table from identifiers
    let tableName = '';
    let colName = '';
    
    if (identifiers.length >= 2) {
      colName = identifiers[0];
      tableName = identifiers.find(id => findTable(newSchema.tables, id)) || identifiers[1];
    }
    
    if (!tableName || !colName) {
      return { schema: newSchema, response: `🤔 Please specify: "Change columnName type to TYPE in tableName"` };
    }
    
    const table = findTable(newSchema.tables, tableName);
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }
    
    const col = table.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
    if (!col) {
      return { schema: newSchema, response: `⚠️ Column \`${colName}\` not found in **${table.name}**.` };
    }
    
    col.type = newType;
    return { schema: newSchema, response: `✏️ Changed \`${col.name}\` type to **${newType}** in **${table.name}**.` };
  }
  
  // ─── Add FK ────────────────────────────────────────────────────────────────
  if (intent === 'add_fk') {
    // Try multiple patterns
    const dotPattern = req.match(/\b(\w+)\.(\w+)\b.*?(?:to|->|references?)\s*\b(\w+)(?:\.(\w+))?\b/i);
    const linkPattern = req.match(/\b(?:link|connect)\b.*?\b(\w+)\b.*?\b(?:to|with)\b.*?\b(\w+)\b/i);
    
    let fromTable = '', fromCol = '', toTable = '', toCol = 'id';
    
    if (dotPattern) {
      [, fromTable, fromCol, toTable, toCol] = dotPattern;
      toCol = toCol || 'id';
    } else if (linkPattern) {
      fromTable = linkPattern[1];
      toTable = linkPattern[2];
      // Infer the FK column
      fromCol = toTable.replace(/s$/, '') + '_id';
    } else if (identifiers.length >= 2) {
      fromTable = identifiers[0];
      toTable = identifiers[1];
      fromCol = toTable.replace(/s$/, '') + '_id';
    }
    
    if (!fromTable || !toTable) {
      return { schema: newSchema, response: `🤔 Please specify: "Link orders to users" or "Add FK from orders.user_id to users.id"` };
    }
    
    const srcTable = findTable(newSchema.tables, fromTable);
    const refTable = findTable(newSchema.tables, toTable);
    
    if (!srcTable) {
      return { schema: newSchema, response: `⚠️ Table **${fromTable}** not found.` };
    }
    if (!refTable) {
      return { schema: newSchema, response: `⚠️ Table **${toTable}** not found.` };
    }
    
    // Find or create the FK column
    let col = srcTable.columns.find(c => c.name.toLowerCase() === fromCol.toLowerCase());
    
    if (!col) {
      // Create the FK column
      const fkColName = refTable.name.replace(/s$/, '') + '_id';
      col = { name: fkColName, type: 'INT', nullable: true };
      srcTable.columns.push(col);
    }
    
    col.fk = { table: refTable.name, column: toCol || 'id' };
    
    return { schema: newSchema, response: `🔗 Linked **${srcTable.name}.${col.name}** → **${refTable.name}.${toCol || 'id'}**` };
  }
  
  // ─── Remove FK ─────────────────────────────────────────────────────────────
  if (intent === 'remove_fk') {
    const dotPattern = req.match(/\b(\w+)\.(\w+)\b/);
    
    if (!dotPattern) {
      return { schema: newSchema, response: `🤔 Please specify: "Remove FK from orders.user_id"` };
    }
    
    const [, tableName, colName] = dotPattern;
    const table = findTable(newSchema.tables, tableName);
    
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }
    
    const col = table.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
    if (!col || !col.fk) {
      return { schema: newSchema, response: `⚠️ No FK found on \`${colName}\` in **${table.name}**.` };
    }
    
    delete col.fk;
    return { schema: newSchema, response: `🗑️ Removed foreign key from **${table.name}.${colName}**.` };
  }
  
  // ─── Set PK ────────────────────────────────────────────────────────────────
  if (intent === 'set_pk') {
    if (identifiers.length < 2) {
      return { schema: newSchema, response: `🤔 Please specify: "Set id as primary key in users"` };
    }
    
    const colName = identifiers[0];
    const tableName = identifiers.find(id => findTable(newSchema.tables, id)) || identifiers[1];
    const table = findTable(newSchema.tables, tableName);
    
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }
    
    const col = table.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
    if (!col) {
      return { schema: newSchema, response: `⚠️ Column \`${colName}\` not found in **${table.name}**.` };
    }
    
    // Clear other PKs
    table.columns.forEach(c => c.pk = false);
    col.pk = true;
    
    return { schema: newSchema, response: `🔑 Set \`${col.name}\` as primary key in **${table.name}**.` };
  }
  
  // ─── Set Unique ────────────────────────────────────────────────────────────
  if (intent === 'set_unique') {
    if (identifiers.length < 2) {
      return { schema: newSchema, response: `🤔 Please specify: "Make email unique in users"` };
    }
    
    const colName = identifiers[0];
    const tableName = identifiers.find(id => findTable(newSchema.tables, id)) || identifiers[1];
    const table = findTable(newSchema.tables, tableName);
    
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }
    
    const col = table.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
    if (!col) {
      return { schema: newSchema, response: `⚠️ Column \`${colName}\` not found in **${table.name}**.` };
    }
    
    col.unique = true;
    return { schema: newSchema, response: `✨ Set \`${col.name}\` as unique in **${table.name}**.` };
  }
  
  // ─── Set Nullable ──────────────────────────────────────────────────────────
  if (intent === 'set_nullable') {
    if (identifiers.length < 2) {
      return { schema: newSchema, response: `🤔 Please specify: "Make bio nullable in users"` };
    }
    
    const colName = identifiers[0];
    const tableName = identifiers.find(id => findTable(newSchema.tables, id)) || identifiers[1];
    const table = findTable(newSchema.tables, tableName);
    
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }
    
    const col = table.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
    if (!col) {
      return { schema: newSchema, response: `⚠️ Column \`${colName}\` not found in **${table.name}**.` };
    }
    
    col.nullable = true;
    return { schema: newSchema, response: `✅ Set \`${col.name}\` as nullable (optional) in **${table.name}**.` };
  }
  
  // ─── Set Required ──────────────────────────────────────────────────────────
  if (intent === 'set_required') {
    if (identifiers.length < 2) {
      return { schema: newSchema, response: `🤔 Please specify: "Make name required in users"` };
    }
    
    const colName = identifiers[0];
    const tableName = identifiers.find(id => findTable(newSchema.tables, id)) || identifiers[1];
    const table = findTable(newSchema.tables, tableName);
    
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }
    
    const col = table.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
    if (!col) {
      return { schema: newSchema, response: `⚠️ Column \`${colName}\` not found in **${table.name}**.` };
    }
    
    col.nullable = false;
    return { schema: newSchema, response: `✅ Set \`${col.name}\` as required (NOT NULL) in **${table.name}**.` };
  }
  
  // ─── Color ─────────────────────────────────────────────────────────────────
  if (intent === 'color') {
    const colorMatch = req.match(/#[0-9a-f]{3,6}\b|\b(red|blue|green|purple|orange|pink|yellow|cyan|teal|indigo|gray|grey)\b/i);
    const tableName = identifiers[0];
    
    if (!tableName) {
      return { schema: newSchema, response: `🤔 Which table's color? For example: "Set users color to blue"` };
    }
    
    const table = findTable(newSchema.tables, tableName);
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }
    
    const colorNames: Record<string, string> = {
      red: '#ef4444', blue: '#3b82f6', green: '#10b981', purple: '#8b5cf6',
      orange: '#f97316', pink: '#ec4899', yellow: '#eab308', cyan: '#06b6d4',
      teal: '#14b8a6', indigo: '#6366f1', gray: '#64748b', grey: '#64748b',
    };
    
    const color = colorMatch ? (colorNames[colorMatch[0].toLowerCase()] || colorMatch[0]) : randomColor();
    table.color = color.startsWith('#') ? color : `#${color}`;
    
    return { schema: newSchema, response: `🎨 Changed **${table.name}** color to ${table.color}.` };
  }
  
  // ─── Auto-Categorize Tables ────────────────────────────────────────────────
  if (intent === 'auto_categorize') {
    // This will be handled by the component since it needs access to the full categorization logic
    // Return a signal that auto-categorize was requested
    return { schema: newSchema, response: `__AUTO_CATEGORIZE__` };
  }
  
  // ─── Create Category/Group ─────────────────────────────────────────────────
  if (intent === 'create_category') {
    // Extract category name from request
    const categoryMatch = req.match(/\b(?:category|group|folder)\s+(?:called|named|")?([^"]+?)(?:"|\s*$)/i) ||
                          req.match(/(?:create|add|make|new)\s+(?:a\s+)?(?:category|group|folder)\s+([^\s,]+)/i) ||
                          req.match(/["']([^"']+)["']\s*(?:category|group)/i);
    
    let categoryName = '';
    let tablesToAssign: string[] = [];
    
    if (categoryMatch) {
      categoryName = categoryMatch[1].trim().replace(/["']/g, '');
    }
    
    // Check for tables to assign: "with tables X, Y, Z" or "for X, Y tables"
    const withTablesMatch = req.match(/\b(?:with|for|containing|including)\s+(?:tables?\s+)?([^.]+)/i);
    if (withTablesMatch) {
      const tablesPart = withTablesMatch[1];
      const potentialTables = tablesPart.split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      tablesToAssign = potentialTables.filter(name => 
        newSchema.tables.some(t => t.name.toLowerCase() === name)
      );
    }
    
    if (!categoryName) {
      // Try to infer from identifiers
      categoryName = identifiers.find(id => 
        !newSchema.tables.some(t => t.name.toLowerCase() === id.toLowerCase())
      ) || '';
    }
    
    if (!categoryName) {
      return { schema: newSchema, response: `🤔 What should the category be called? For example: "Create a category called User Management"` };
    }
    
    // Check if category already exists
    const existingCat = newSchema.categories?.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    if (existingCat) {
      return { schema: newSchema, response: `⚠️ Category **"${existingCat.name}"** already exists. Say "assign X to ${existingCat.name}" to add tables to it.` };
    }
    
    // Create new category
    const categoryColors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6'];
    const colorIndex = (newSchema.categories?.length || 0) % categoryColors.length;
    const newCat: TableCategory = {
      id: `cat_${Date.now()}`,
      name: categoryName,
      color: categoryColors[colorIndex],
    };
    
    newSchema.categories = [...(newSchema.categories || []), newCat];
    
    // Assign tables if specified
    if (tablesToAssign.length > 0) {
      newSchema.tables = newSchema.tables.map(t => 
        tablesToAssign.includes(t.name.toLowerCase()) ? { ...t, category: newCat.id } : t
      );
    }
    
    let msg = `📁 Created category **"${categoryName}"**`;
    if (tablesToAssign.length > 0) {
      msg += ` with ${tablesToAssign.length} table(s): ${tablesToAssign.join(', ')}.`;
    } else {
      msg += `. To add tables: "assign users to ${categoryName}" or "add orders table to ${categoryName} group"`;
    }
    
    return { schema: newSchema, response: msg };
  }
  
  // ─── Assign Table to Category ──────────────────────────────────────────────
  if (intent === 'assign_category') {
    // Extract table name and category name
    const assignMatch = req.match(/\b(?:assign|move|put|add|place)\s+(?:the\s+)?(?:table\s+)?(\w+)\s+(?:to|in|into)\s+(?:the\s+)?(?:category|group)\s+["']?([^"']+?)["']?(?:\s*$|\s*(?:category|group))/i) ||
                        req.match(/\b(\w+)\s+(?:table\s+)?(?:to|in|into)\s+(?:the\s+)?["']?([^"']+?)["']?\s*(?:category|group)/i);
    
    if (!assignMatch) {
      const availableCategories = newSchema.categories?.map(c => c.name).join(', ') || 'none yet';
      return { schema: newSchema, response: `🤔 Which table to which category? For example: "Assign users to User Management"\n\n📁 Available categories: ${availableCategories}` };
    }
    
    const [, tableName, categoryName] = assignMatch;
    const table = findTable(newSchema.tables, tableName);
    
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }
    
    // Find category by name (fuzzy match)
    const category = newSchema.categories?.find(c => 
      c.name.toLowerCase().includes(categoryName.toLowerCase()) ||
      categoryName.toLowerCase().includes(c.name.toLowerCase())
    );
    
    if (!category) {
      const availableCategories = newSchema.categories?.map(c => c.name).join(', ') || 'none yet';
      return { schema: newSchema, response: `⚠️ Category **"${categoryName}"** not found.\n\n📁 Available categories: ${availableCategories}\n\n💡 Create it with: "Create category ${categoryName}"` };
    }
    
    // Assign the table to the category
    table.category = category.id;
    
    return { schema: newSchema, response: `📁 Assigned **${table.name}** to category **"${category.name}"**.` };
  }
  
  // ─── Create Table in Specific Category ─────────────────────────────────────
  if (intent === 'create_table_in_category') {
    // Extract table name and category from request
    // Patterns: "create X table in Y category", "add table X to Y group"
    const patterns = [
      /\b(?:create|add|make)\s+(?:a\s+)?(?:table\s+)?(\w+)(?:\s+table)?\s+(?:in|to|into|under)\s+(?:the\s+)?["']?([^"']+?)["']?\s*(?:category|group)\b/i,
      /\b(?:create|add)\s+(\w+)\s+(?:in|to)\s+(?:the\s+)?["']?([^"']+?)["']?\s*(?:category|group)\b/i,
      /\b(\w+)\s+table\s+(?:in|to)\s+(?:the\s+)?["']?([^"']+?)["']?\s*(?:category|group)\b/i,
    ];
    
    let tableName = '';
    let categoryName = '';
    
    for (const pattern of patterns) {
      const match = req.match(pattern);
      if (match) {
        tableName = match[1];
        categoryName = match[2].trim();
        break;
      }
    }
    
    if (!tableName) {
      return { schema: newSchema, response: `🤔 What table would you like to create and in which category?\n\nExample: "Create orders table in the Sales category"` };
    }
    
    const cleanName = tableName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    // Check if table already exists
    if (newSchema.tables.find(t => t.name.toLowerCase() === cleanName)) {
      // Table exists, maybe just assign it
      const table = findTable(newSchema.tables, cleanName);
      const category = newSchema.categories?.find(c => 
        c.name.toLowerCase().includes(categoryName.toLowerCase()) ||
        categoryName.toLowerCase().includes(c.name.toLowerCase())
      );
      
      if (category && table) {
        table.category = category.id;
        return { schema: newSchema, response: `⚠️ Table **${cleanName}** already exists. Assigned it to **"${category.name}"** category.` };
      }
      return { schema: newSchema, response: `⚠️ Table **${cleanName}** already exists. Would you like to add columns to it?` };
    }
    
    // Find or create the category
    let category = newSchema.categories?.find(c => 
      c.name.toLowerCase().includes(categoryName.toLowerCase()) ||
      categoryName.toLowerCase().includes(c.name.toLowerCase())
    );
    
    if (!category) {
      // Create the category automatically
      const categoryColors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6'];
      const colorIndex = (newSchema.categories?.length || 0) % categoryColors.length;
      category = {
        id: `cat_${Date.now()}`,
        name: categoryName,
        color: categoryColors[colorIndex],
      };
      newSchema.categories = [...(newSchema.categories || []), category];
    }
    
    // Create the table with default columns and assign to category
    const columns = getDefaultColumnsForTable(cleanName);
    const newTable: Table = {
      name: cleanName,
      color: category.color, // Use category color for consistency
      columns,
      category: category.id,
    };
    
    newSchema.tables.push(newTable);
    wireCommonForeignKeys(newSchema.tables);
    
    // Track for context
    conversationContext.lastCreatedTables = [cleanName];
    conversationContext.lastModifiedTable = cleanName;
    conversationContext.recentTables = [cleanName, ...conversationContext.recentTables.filter(t => t !== cleanName)].slice(0, 10);
    conversationContext.lastAction = 'create_table_in_category';
    
    const colList = columns.slice(0, 4).map(c => `\`${c.name}\``).join(', ') + (columns.length > 4 ? ` +${columns.length - 4} more` : '');
    return { schema: newSchema, response: `✅ Created table **${cleanName}** in **"${category.name}"** category.\n\n📝 Columns: ${colList}` };
  }
  
  // ─── Fallback: Try to understand what they want ────────────────────────────
  // If we have identifiers that look like table names and user seems to want tables
  if (identifiers.length > 0 && /\b(need|want|create|build|make|design|set\s*up)\b/i.test(req)) {
    const wantDefaults = true; // Assume they want full tables
    const created: string[] = [];
    const categorized: string[] = [];
    
    // Helper to find matching category
    const findMatchingCategoryFallback = (tableName: string): { id: string; name: string; color: string } | undefined => {
      if (!newSchema.categories || newSchema.categories.length === 0) return undefined;
      const tableNameLower = tableName.toLowerCase();
      const patterns: Record<string, RegExp> = {
        user: /user|account|auth|profile|login|session|permission|role/i,
        order: /order|cart|checkout|payment|invoice|transaction|sale/i,
        product: /product|item|inventory|stock|sku|catalog/i,
        content: /post|article|blog|comment|media|content|document/i,
        customer: /customer|client|contact|lead|company/i,
        hr: /employee|staff|department|salary|payroll|job/i,
        message: /message|notification|email|chat|inbox/i,
      };
      
      for (const cat of newSchema.categories) {
        const catNameLower = cat.name.toLowerCase();
        for (const [key, pattern] of Object.entries(patterns)) {
          if ((catNameLower.includes(key) || pattern.test(catNameLower)) && pattern.test(tableNameLower)) {
            return cat;
          }
        }
        if (catNameLower.includes(tableNameLower) || tableNameLower.includes(catNameLower.replace(/[^\w]/g, ''))) {
          return cat;
        }
      }
      return undefined;
    };
    
    for (const name of identifiers.slice(0, 5)) { // Max 5 tables
      const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (!cleanName || cleanName.length < 2) continue;
      if (newSchema.tables.find(t => t.name.toLowerCase() === cleanName)) continue;
      
      const matchingCat = findMatchingCategoryFallback(cleanName);
      
      newSchema.tables.push({
        name: cleanName,
        color: matchingCat?.color || randomColor(),
        columns: getDefaultColumnsForTable(cleanName),
        category: matchingCat?.id,
      });
      created.push(cleanName);
      if (matchingCat) categorized.push(cleanName);
    }
    
    if (created.length > 0) {
      wireCommonForeignKeys(newSchema.tables);
      let response = `✅ Created: ${created.map(n => `**${n}**`).join(', ')} with sensible default columns and relationships.`;
      if (categorized.length > 0) {
        response += `\n\n📁 Auto-assigned ${categorized.length} table(s) to matching categories.`;
      }
      return { schema: newSchema, response };
    }
  }
  
  // ─── Ultimate fallback ─────────────────────────────────────────────────────
  return { schema: newSchema, response: `🤔 I'm not sure what you mean. Here are some examples:\n\n• "Create tables users, orders, products with necessary attributes"\n• "Add email column to customers"\n• "Create orders table in the Sales group"\n• "Organize tables" / "Auto-group tables"\n• "Link orders to users"\n• "Show me the schema"\n• "Help" for more options\n\nJust describe what you want in plain English!` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Renderer
// ─────────────────────────────────────────────────────────────────────────────
interface CanvasProps {
  schema: Schema;
  selectedTable: string | null;
  onSelectTable: (name: string | null) => void;
  onMoveTable: (name: string, x: number, y: number) => void;
  onMoveCategory?: (categoryId: string, dx: number, dy: number) => void;
  showCategories?: boolean;
}

function SchemaCanvas({ schema, selectedTable, onSelectTable, onMoveTable, onMoveCategory, showCategories = true }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<{ type: 'pan' | 'table' | 'category'; tableName?: string; categoryId?: string; startX: number; startY: number } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const gridSize = 40 * zoom;
    const offsetX = (pan.x % gridSize);
    const offsetY = (pan.y % gridSize);
    for (let x = offsetX; x < rect.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = offsetY; y < rect.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw category backgrounds if enabled
    if (showCategories && schema.categories && schema.categories.length > 0) {
      schema.categories.forEach((category) => {
        const tablesInCategory = schema.tables.filter(t => t.category === category.id);
        if (tablesInCategory.length === 0) return;

        // Calculate bounding box for tables in this category
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        tablesInCategory.forEach(table => {
          if (table.x === undefined || table.y === undefined) return;
          const tableW = 280;
          const tableH = 36 + table.columns.length * 24 + 8;
          minX = Math.min(minX, table.x);
          minY = Math.min(minY, table.y);
          maxX = Math.max(maxX, table.x + tableW);
          maxY = Math.max(maxY, table.y + tableH);
        });

        if (minX === Infinity) return;

        // Padding around the group
        const padding = 30;
        const labelHeight = 28;
        minX -= padding;
        minY -= padding + labelHeight;
        maxX += padding;
        maxY += padding;

        // Draw category background
        ctx.fillStyle = category.color + '15'; // 15 = ~8% opacity
        ctx.strokeStyle = category.color + '40'; // 40 = ~25% opacity
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.roundRect(minX, minY, maxX - minX, maxY - minY, 12);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw category label (draggable)
        ctx.fillStyle = category.color;
        ctx.beginPath();
        ctx.roundRect(minX, minY, 180, labelHeight, [12, 12, 0, 0]);
        ctx.fill();

        // Move icon hint
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillText('⋮⋮', minX + 8, minY + labelHeight / 2);

        // Folder icon (simple square with fold)
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(minX + 24, minY + labelHeight / 2 - 5, 10, 8);
        ctx.fillRect(minX + 24, minY + labelHeight / 2 - 7, 5, 3);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(category.name, minX + 38, minY + labelHeight / 2);
      });
    }

    // Draw edges (FK relationships)
    schema.tables.forEach((table) => {
      table.columns.forEach((col) => {
        if (col.fk) {
          const refTable = schema.tables.find((t) => t.name === col.fk!.table);
          if (refTable && table.x !== undefined && table.y !== undefined && refTable.x !== undefined && refTable.y !== undefined) {
            const fromX = table.x + 140;
            const fromY = table.y + 40 + table.columns.indexOf(col) * 24;
            const toX = refTable.x + 140;
            const toY = refTable.y + 20;

            // Gradient line
            const grad = ctx.createLinearGradient(fromX, fromY, toX, toY);
            grad.addColorStop(0, table.color || '#6366f1');
            grad.addColorStop(1, refTable.color || '#10b981');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            // Bezier curve
            const midX = (fromX + toX) / 2;
            ctx.bezierCurveTo(midX, fromY, midX, toY, toX, toY);
            ctx.stroke();

            // Arrow head
            ctx.fillStyle = refTable.color || '#10b981';
            ctx.beginPath();
            ctx.moveTo(toX, toY);
            ctx.lineTo(toX - 8, toY - 5);
            ctx.lineTo(toX - 8, toY + 5);
            ctx.closePath();
            ctx.fill();
          }
        }
      });
    });

    // Draw tables
    schema.tables.forEach((table) => {
      if (table.x === undefined || table.y === undefined) return;
      const w = 280;
      const headerH = 36;
      const rowH = 24;
      const h = headerH + table.columns.length * rowH + 8;
      const isSelected = selectedTable === table.name;

      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = isSelected ? 20 : 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;

      // Card background
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(table.x, table.y, w, h, 10);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Header
      ctx.fillStyle = table.color || '#6366f1';
      ctx.beginPath();
      ctx.roundRect(table.x, table.y, w, headerH, [10, 10, 0, 0]);
      ctx.fill();

      // Table icon (simple grid)
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(table.x + 12, table.y + headerH / 2 - 5, 10, 10);
      ctx.fillStyle = table.color || '#6366f1';
      ctx.fillRect(table.x + 13, table.y + headerH / 2 - 4, 3, 3);
      ctx.fillRect(table.x + 18, table.y + headerH / 2 - 4, 3, 3);
      ctx.fillRect(table.x + 13, table.y + headerH / 2 + 1, 3, 3);
      ctx.fillRect(table.x + 18, table.y + headerH / 2 + 1, 3, 3);

      // Table name
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(table.name, table.x + 28, table.y + headerH / 2);

      // Columns
      ctx.font = '12px "JetBrains Mono", monospace';
      table.columns.forEach((col, i) => {
        const y = table.y + headerH + 4 + i * rowH;
        // Draw key indicator
        if (col.pk) {
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText('PK', table.x + 12, y + 12);
        } else if (col.fk) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText('FK', table.x + 12, y + 12);
        } else if (col.unique) {
          ctx.fillStyle = '#a78bfa';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText('UQ', table.x + 12, y + 12);
        } else {
          ctx.fillStyle = '#475569';
          ctx.font = '12px "JetBrains Mono", monospace';
          ctx.fillText('•', table.x + 16, y + 12);
        }

        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.fillStyle = col.pk ? '#fbbf24' : col.fk ? '#38bdf8' : '#94a3b8';
        ctx.fillText(col.name, table.x + 32, y + 12);

        ctx.fillStyle = '#64748b';
        ctx.fillText(col.type, table.x + 160, y + 12);
      });

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(table.x - 4, table.y - 4, w + 8, h + 8, 12);
        ctx.stroke();
      }
    });

    ctx.restore();
  }, [schema, selectedTable, pan, zoom, showCategories]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Get category label bounds for hit testing
  const getCategoryBounds = (): { id: string; labelX: number; labelY: number; labelW: number; labelH: number }[] => {
    if (!showCategories || !schema.categories) return [];
    const bounds: { id: string; labelX: number; labelY: number; labelW: number; labelH: number }[] = [];
    
    schema.categories.forEach((category) => {
      const tablesInCategory = schema.tables.filter(t => t.category === category.id);
      if (tablesInCategory.length === 0) return;
      
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      tablesInCategory.forEach(table => {
        if (table.x === undefined || table.y === undefined) return;
        const tableW = 280;
        const tableH = 36 + table.columns.length * 24 + 8;
        minX = Math.min(minX, table.x);
        minY = Math.min(minY, table.y);
        maxX = Math.max(maxX, table.x + tableW);
        maxY = Math.max(maxY, table.y + tableH);
      });
      
      if (minX === Infinity) return;
      
      const padding = 30;
      const labelHeight = 28;
      bounds.push({
        id: category.id,
        labelX: minX - padding,
        labelY: minY - padding - labelHeight,
        labelW: 180,
        labelH: labelHeight,
      });
    });
    
    return bounds;
  };

  const getTableAt = (clientX: number, clientY: number): Table | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y) / zoom;

    for (const table of schema.tables) {
      if (table.x === undefined || table.y === undefined) continue;
      const w = 280;
      const h = 36 + table.columns.length * 24 + 8;
      if (x >= table.x && x <= table.x + w && y >= table.y && y <= table.y + h) {
        return table;
      }
    }
    return null;
  };

  const getCategoryAt = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y) / zoom;
    
    const bounds = getCategoryBounds();
    for (const b of bounds) {
      if (x >= b.labelX && x <= b.labelX + b.labelW && y >= b.labelY && y <= b.labelY + b.labelH) {
        return b.id;
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Check category label first (it's on top)
    const categoryId = getCategoryAt(e.clientX, e.clientY);
    if (categoryId && onMoveCategory) {
      setDragging({ type: 'category', categoryId, startX: e.clientX, startY: e.clientY });
      return;
    }
    
    const table = getTableAt(e.clientX, e.clientY);
    if (table) {
      setDragging({ type: 'table', tableName: table.name, startX: e.clientX, startY: e.clientY });
      onSelectTable(table.name);
    } else {
      setDragging({ type: 'pan', startX: e.clientX, startY: e.clientY });
      onSelectTable(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;

    if (dragging.type === 'pan') {
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else if (dragging.type === 'table' && dragging.tableName) {
      const table = schema.tables.find((t) => t.name === dragging.tableName);
      if (table && table.x !== undefined && table.y !== undefined) {
        onMoveTable(dragging.tableName, table.x + dx / zoom, table.y + dy / zoom);
      }
    } else if (dragging.type === 'category' && dragging.categoryId && onMoveCategory) {
      onMoveCategory(dragging.categoryId, dx / zoom, dy / zoom);
    }
    setDragging({ ...dragging, startX: e.clientX, startY: e.clientY });
  };

  const handleMouseUp = () => setDragging(null);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)));
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', cursor: dragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function SchemaVisualizerWindow() {
  const [schema, setSchema] = useState<Schema>({ tables: [], name: '' });
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '👋 **Welcome to Schema Visualizer!**\n\nStart by selecting a template below or tell me what you need:\n\n• "Create an e-commerce database"\n• "I need tables for users, products, orders"\n• "Build a blog schema with authors and posts"\n\nOr click one of the template buttons to get started instantly!' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [activeDemo, setActiveDemo] = useState('');
  const [savedSchemas, setSavedSchemas] = useState<SavedSchema[]>(getSavedSchemas());
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [schemaName, setSchemaName] = useState('');
  // Manual editing states
  const [editingTable, setEditingTable] = useState<string | null>(null);
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [showEditColumnModal, setShowEditColumnModal] = useState(false);
  const [showAddFkModal, setShowAddFkModal] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newColumn, setNewColumn] = useState<Column>({ name: '', type: 'VARCHAR(255)', pk: false, nullable: true, unique: false });
  const [editingColumn, setEditingColumn] = useState<{ tableName: string; column: Column; index: number } | null>(null);
  const [newFk, setNewFk] = useState<{ fromTable: string; fromCol: string; toTable: string; toCol: string }>({ fromTable: '', fromCol: '', toTable: '', toCol: 'id' });
  // Category/grouping states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TableCategory | null>(null); // null = create new, object = edit existing
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategory, setNewCategory] = useState<{ name: string; color: string; description: string; selectedTables: string[] }>({ name: '', color: '#6366f1', description: '', selectedTables: [] });
  const [assigningCategory, setAssigningCategory] = useState<string | null>(null); // table name being assigned
  const [showCategories, setShowCategories] = useState(true); // Toggle category visibility on canvas
  const [showSqlViewer, setShowSqlViewer] = useState(false); // SQL code viewer modal
  const [sqlCode, setSqlCode] = useState(''); // Editable SQL code
  // Sidebar section expand/collapse states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    actions: true,
    templates: false,
    categories: true,
    tables: true,
  });
  const toggleSection = (section: string) => setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleMoveTable = (name: string, x: number, y: number) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => (t.name === name ? { ...t, x, y } : t)),
    }));
  };

  const loadDemo = (name: string) => {
    setActiveDemo(name);
    setSchema({ tables: autoLayout(DEMO_SCHEMAS[name].tables) });
    setSelectedTable(null);
    setChatMessages([
      { role: 'assistant', content: `Loaded **${name}** demo schema. Feel free to modify it!` },
    ]);
  };

  const handleChat = () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: chatInput };
    setChatMessages((m) => [...m, userMsg]);

    const { schema: newSchema, response } = aiModifySchema(schema, chatInput);
    
    console.log('AI Response:', response);
    console.log('Old tables count:', schema.tables.length);
    console.log('New tables count:', newSchema.tables.length);
    console.log('New tables:', newSchema.tables.map(t => ({ name: t.name, cols: t.columns.length, x: t.x, y: t.y })));
    
    // Handle auto-categorize signal
    if (response === '__AUTO_CATEGORIZE__') {
      setChatInput('');
      autoCategorizeTables();
      return;
    }
    
    // Preserve categories and use category-aware layout when categories exist
    const hasCategories = (newSchema.categories && newSchema.categories.length > 0) || (schema.categories && schema.categories.length > 0);
    const mergedCategories = newSchema.categories || schema.categories || [];
    
    // Ensure all tables have positions - check if any tables are missing x/y coordinates
    const tablesNeedLayout = newSchema.tables.some(t => t.x === undefined || t.y === undefined);
    
    console.log('Tables need layout:', tablesNeedLayout);
    
    let layoutedTables;
    if (tablesNeedLayout) {
      // Some tables don't have positions, need to layout all tables
      layoutedTables = hasCategories 
        ? layoutTablesByCategory(newSchema.tables, mergedCategories)
        : autoLayout(newSchema.tables);
      console.log('After layout:', layoutedTables.map(t => ({ name: t.name, x: t.x, y: t.y })));
    } else {
      // All tables already have positions, preserve them
      layoutedTables = newSchema.tables;
    }
    
    const finalSchema = { 
      ...newSchema,
      categories: mergedCategories,
      tables: layoutedTables 
    };
    
    console.log('Setting schema with', finalSchema.tables.length, 'tables');
    setSchema(finalSchema);
    setChatMessages((m) => [...m, { role: 'assistant', content: response }]);
    setChatInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChat();
    }
  };

  // ─── New Schema ────────────────────────────────────────────────────────────
  const createNewSchema = () => {
    const newSchema: Schema = {
      name: 'Untitled Schema',
      tables: autoLayout([
        { name: 'table1', columns: [{ name: 'id', type: 'INT', pk: true }], color: randomColor() },
      ]),
    };
    setSchema(newSchema);
    setActiveDemo('');
    setSelectedTable(null);
    setChatMessages([
      { role: 'assistant', content: '🆕 Created a new blank schema with one starter table. Use the chat to add more tables and columns!' },
    ]);
  };

  // ─── Import SQL ────────────────────────────────────────────────────────────
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const fileName = file.name.toLowerCase();
      
      // Try JSON import first (for exported schemas)
      if (fileName.endsWith('.json')) {
        try {
          const parsed = JSON.parse(content);
          
          // Check if it's a valid schema format
          if (parsed.tables && Array.isArray(parsed.tables)) {
            // Direct schema format
            const importedSchema: Schema = {
              name: parsed.name || file.name.replace('.json', ''),
              tables: autoLayout(parsed.tables.map((t: any) => ({
                name: t.name,
                color: t.color || `#${Math.floor(Math.random() * 0x888888 + 0x444444).toString(16)}`,
                x: t.x,
                y: t.y,
                columns: (t.columns || []).map((c: any) => ({
                  name: c.name,
                  type: c.type || 'VARCHAR(255)',
                  pk: c.pk || c.primaryKey || false,
                  unique: c.unique || false,
                  nullable: c.nullable !== false,
                  fk: c.fk || c.foreignKey || (c.references ? { table: c.references.table || c.references, column: c.references.column || 'id' } : undefined),
                })),
              }))),
            };
            setSchema(importedSchema);
            setActiveDemo('');
            setSelectedTable(null);
            setChatMessages([
              { role: 'assistant', content: `📄 Imported **${importedSchema.tables.length} table(s)** from \`${file.name}\` with all relationships preserved!` },
            ]);
            e.target.value = '';
            return;
          }
          
          // Array of tables format
          if (Array.isArray(parsed)) {
            const tables = parsed.map((t: any) => ({
              name: t.name || t.tableName,
              color: t.color || `#${Math.floor(Math.random() * 0x888888 + 0x444444).toString(16)}`,
              columns: (t.columns || t.fields || []).map((c: any) => ({
                name: c.name || c.columnName || c.field,
                type: c.type || c.dataType || 'VARCHAR(255)',
                pk: c.pk || c.primaryKey || c.isPrimaryKey || false,
                unique: c.unique || c.isUnique || false,
                nullable: c.nullable !== false && c.isNullable !== false,
                fk: c.fk || c.foreignKey || (c.references ? { table: c.references.table || c.references, column: c.references.column || 'id' } : undefined),
              })),
            }));
            setSchema({ name: file.name.replace('.json', ''), tables: autoLayout(tables) });
            setActiveDemo('');
            setSelectedTable(null);
            setChatMessages([
              { role: 'assistant', content: `📄 Imported **${tables.length} table(s)** from \`${file.name}\`!` },
            ]);
            e.target.value = '';
            return;
          }
        } catch (jsonError) {
          console.log('Not valid JSON, trying SQL parse...');
        }
      }
      
      // Try SQL DDL parsing
      const tables = parseDDL(content);
      if (tables.length > 0) {
        // Calculate relationship count
        let relCount = 0;
        tables.forEach(t => t.columns.forEach(c => { if (c.fk) relCount++; }));
        
        setSchema({ name: file.name.replace(/\.(sql|txt)$/i, ''), tables: autoLayout(tables) });
        setActiveDemo('');
        setSelectedTable(null);
        
        const colCount = tables.reduce((a, t) => a + t.columns.length, 0);
        setChatMessages([
          { role: 'assistant', content: `📄 Imported **${tables.length} table(s)** with **${colCount} columns** and **${relCount} relationships** from \`${file.name}\`.` },
        ]);
      } else {
        // Try to provide helpful error message
        let hint = 'Make sure it contains CREATE TABLE statements.';
        if (content.includes('{') && content.includes('}')) {
          hint = 'This looks like JSON. Make sure the file has a .json extension.';
        }
        setChatMessages((m) => [
          ...m,
          { role: 'assistant', content: `⚠️ Could not parse any tables from the file. ${hint}` },
        ]);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset for re-import
  };

  // ─── Save Schema ───────────────────────────────────────────────────────────
  const handleSaveSchema = () => {
    setSchemaName(schema.name || 'My Schema');
    setShowSaveModal(true);
  };

  const confirmSave = () => {
    const name = schemaName.trim() || 'My Schema';
    saveSchemaToStorage(name, schema);
    setSavedSchemas(getSavedSchemas());
    setSchema({ ...schema, name });
    setShowSaveModal(false);
    setChatMessages((m) => [
      ...m,
      { role: 'assistant', content: `💾 Saved schema as **"${name}"**. You can load it anytime from the Load button.` },
    ]);
  };

  // ─── Load Schema ───────────────────────────────────────────────────────────
  const handleLoadSchema = () => {
    setSavedSchemas(getSavedSchemas()); // Refresh list
    setShowLoadModal(true);
  };

  const loadSavedSchema = (saved: SavedSchema) => {
    setSchema(saved.schema);
    setActiveDemo('');
    setSelectedTable(null);
    setShowLoadModal(false);
    setChatMessages([
      { role: 'assistant', content: `📂 Loaded schema **"${saved.name}"**. Feel free to modify!` },
    ]);
  };

  const deleteSaved = (id: string) => {
    deleteSchemaFromStorage(id);
    setSavedSchemas(getSavedSchemas());
  };

  // ─── Manual Table Operations ─────────────────────────────────────────────
  const addTableManual = () => {
    if (!newTableName.trim()) return;
    if (schema.tables.find((t) => t.name === newTableName)) {
      setChatMessages((m) => [...m, { role: 'assistant', content: `⚠️ Table **${newTableName}** already exists.` }]);
      return;
    }
    const newTable: Table = {
      name: newTableName.trim(),
      color: randomColor(),
      columns: [{ name: 'id', type: 'SERIAL', pk: true }],
    };
    setSchema((s) => ({ ...s, tables: autoLayout([...s.tables, newTable]) }));
    setNewTableName('');
    setShowAddTableModal(false);
    setChatMessages((m) => [...m, { role: 'assistant', content: `✅ Added table **${newTable.name}**.` }]);
  };

  const deleteTable = (tableName: string) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.filter((t) => t.name !== tableName).map((t) => ({
        ...t,
        columns: t.columns.map((c) => c.fk?.table === tableName ? { ...c, fk: undefined } : c),
      })),
    }));
    if (selectedTable === tableName) setSelectedTable(null);
    setChatMessages((m) => [...m, { role: 'assistant', content: `🗑️ Deleted table **${tableName}**.` }]);
  };

  const duplicateTable = (tableName: string) => {
    const table = schema.tables.find((t) => t.name === tableName);
    if (!table) return;
    let newName = `${tableName}_copy`;
    let i = 1;
    while (schema.tables.find((t) => t.name === newName)) {
      newName = `${tableName}_copy${++i}`;
    }
    const newTable: Table = { ...JSON.parse(JSON.stringify(table)), name: newName, color: randomColor() };
    setSchema((s) => ({ ...s, tables: autoLayout([...s.tables, newTable]) }));
    setChatMessages((m) => [...m, { role: 'assistant', content: `📋 Duplicated **${tableName}** as **${newName}**.` }]);
  };

  // ─── Category Management Functions ─────────────────────────────────────────
  const categoryColors = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', 
    '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
    '#0ea5e9', '#3b82f6', '#6366f1'
  ];

  const addCategory = () => {
    if (!newCategory.name.trim()) return;
    const id = `cat_${Date.now()}`;
    const category: TableCategory = {
      id,
      name: newCategory.name.trim(),
      color: newCategory.color,
      description: newCategory.description || undefined,
    };
    const tablesToAssign = newCategory.selectedTables;
    setSchema((s) => {
      const updatedCategories = [...(s.categories || []), category];
      const updatedTables = s.tables.map(t => tablesToAssign.includes(t.name) ? { ...t, category: id } : t);
      // Rearrange tables if any were assigned
      return {
        ...s,
        categories: updatedCategories,
        tables: tablesToAssign.length > 0 ? layoutTablesByCategory(updatedTables, updatedCategories) : updatedTables,
      };
    });
    const tableCount = tablesToAssign.length;
    setNewCategory({ name: '', color: categoryColors[Math.floor(Math.random() * categoryColors.length)], description: '', selectedTables: [] });
    setShowCategoryModal(false);
    setChatMessages((m) => [...m, { role: 'assistant', content: `📁 Created category **"${category.name}"**${tableCount > 0 ? ` with ${tableCount} table(s): ${tablesToAssign.join(', ')}. Tables rearranged.` : '. Assign tables to it from the table menu.'}` }]);
  };

  const openCategoryForEdit = (category: TableCategory) => {
    const tablesInCategory = schema.tables.filter(t => t.category === category.id).map(t => t.name);
    setEditingCategory(category);
    setNewCategory({
      name: category.name,
      color: category.color,
      description: category.description || '',
      selectedTables: tablesInCategory,
    });
    setShowCategoryModal(true);
  };

  const updateCategory = () => {
    if (!editingCategory || !newCategory.name.trim()) return;
    const previousTables = schema.tables.filter(t => t.category === editingCategory.id).map(t => t.name);
    const tablesToAdd = newCategory.selectedTables.filter(n => !previousTables.includes(n));
    const tablesToRemove = previousTables.filter(n => !newCategory.selectedTables.includes(n));
    
    setSchema((s) => {
      const updatedCategories = (s.categories || []).map(c => 
        c.id === editingCategory.id 
          ? { ...c, name: newCategory.name.trim(), color: newCategory.color, description: newCategory.description || undefined }
          : c
      );
      let updatedTables = s.tables.map(t => {
        if (tablesToAdd.includes(t.name)) return { ...t, category: editingCategory.id };
        if (tablesToRemove.includes(t.name)) return { ...t, category: undefined };
        return t;
      });
      // Re-layout if tables changed
      if (tablesToAdd.length > 0 || tablesToRemove.length > 0) {
        updatedTables = layoutTablesByCategory(updatedTables, updatedCategories);
      }
      return { ...s, categories: updatedCategories, tables: updatedTables };
    });
    
    const changes: string[] = [];
    if (tablesToAdd.length > 0) changes.push(`added ${tablesToAdd.join(', ')}`);
    if (tablesToRemove.length > 0) changes.push(`removed ${tablesToRemove.join(', ')}`);
    setChatMessages((m) => [...m, { role: 'assistant', content: `✏️ Updated category **"${newCategory.name}"**${changes.length > 0 ? `: ${changes.join('; ')}.` : '.'}` }]);
    
    closeCategoryModal();
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setEditingCategory(null);
    setNewCategory({ name: '', color: categoryColors[Math.floor(Math.random() * categoryColors.length)], description: '', selectedTables: [] });
  };

  const deleteCategory = (categoryId: string) => {
    const cat = schema.categories?.find(c => c.id === categoryId);
    setSchema((s) => ({
      ...s,
      categories: (s.categories || []).filter(c => c.id !== categoryId),
      tables: s.tables.map(t => t.category === categoryId ? { ...t, category: undefined } : t),
    }));
    if (cat) {
      setChatMessages((m) => [...m, { role: 'assistant', content: `🗑️ Deleted category **"${cat.name}"**.` }]);
    }
  };

  const assignTableToCategory = (tableName: string, categoryId: string | null) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.map(t => t.name === tableName ? { ...t, category: categoryId || undefined } : t),
    }));
    const cat = schema.categories?.find(c => c.id === categoryId);
    if (cat) {
      setChatMessages((m) => [...m, { role: 'assistant', content: `📁 Assigned **${tableName}** to category **"${cat.name}"**.` }]);
    }
    setAssigningCategory(null);
  };

  // Semantic patterns for smart table grouping - enhanced with priority and column hints
  const semanticPatterns: { name: string; patterns: RegExp[]; columnHints: RegExp[]; icon: string; color: string; priority: number }[] = [
    { name: 'User Management', patterns: [/user/i, /account/i, /profile/i, /auth/i, /login/i, /session/i, /permission/i, /role/i, /credential/i, /member/i, /subscriber/i], columnHints: [/password/i, /email/i, /username/i, /avatar/i, /last_login/i], icon: '👤', color: '#6366f1', priority: 10 },
    { name: 'Orders & Sales', patterns: [/order/i, /cart/i, /checkout/i, /payment/i, /invoice/i, /transaction/i, /sale/i, /purchase/i, /receipt/i, /shipment/i, /shipping/i, /delivery/i], columnHints: [/total/i, /subtotal/i, /tax/i, /discount/i, /quantity/i, /shipped/i], icon: '🛒', color: '#f59e0b', priority: 9 },
    { name: 'Products & Inventory', patterns: [/product/i, /item/i, /inventory/i, /stock/i, /sku/i, /catalog/i, /variant/i, /warehouse/i, /goods/i, /merchandise/i], columnHints: [/price/i, /cost/i, /sku/i, /barcode/i, /weight/i, /dimension/i], icon: '📦', color: '#10b981', priority: 8 },
    { name: 'Content & Media', patterns: [/post/i, /article/i, /blog/i, /comment/i, /media/i, /image/i, /video/i, /content/i, /document/i, /file/i, /attachment/i, /upload/i, /page/i], columnHints: [/title/i, /body/i, /content/i, /slug/i, /excerpt/i, /thumbnail/i], icon: '📝', color: '#8b5cf6', priority: 7 },
    { name: 'Categories & Tags', patterns: [/category/i, /tag/i, /label/i, /taxonomy/i, /classification/i, /topic/i, /genre/i], columnHints: [/parent_id/i, /level/i, /path/i, /slug/i], icon: '🏷️', color: '#ec4899', priority: 6 },
    { name: 'Customers & CRM', patterns: [/customer/i, /client/i, /contact/i, /lead/i, /prospect/i, /company/i, /organization/i, /vendor/i, /supplier/i, /partner/i], columnHints: [/company/i, /phone/i, /address/i, /industry/i], icon: '🤝', color: '#06b6d4', priority: 8 },
    { name: 'HR & Employees', patterns: [/employee/i, /staff/i, /department/i, /salary/i, /attendance/i, /leave/i, /payroll/i, /job/i, /position/i, /team/i, /manager/i, /worker/i], columnHints: [/hire_date/i, /salary/i, /department/i, /title/i, /supervisor/i], icon: '👥', color: '#f43f5e', priority: 7 },
    { name: 'Messaging', patterns: [/message/i, /notification/i, /email/i, /chat/i, /inbox/i, /conversation/i, /thread/i, /reply/i, /sms/i, /alert/i], columnHints: [/subject/i, /body/i, /read_at/i, /sent_at/i, /recipient/i], icon: '💬', color: '#0ea5e9', priority: 5 },
    { name: 'Analytics & Logs', patterns: [/log/i, /event/i, /analytic/i, /metric/i, /tracking/i, /audit/i, /history/i, /activity/i, /stat/i, /report/i], columnHints: [/ip_address/i, /user_agent/i, /action/i, /timestamp/i], icon: '📊', color: '#84cc16', priority: 4 },
    { name: 'Settings & Config', patterns: [/setting/i, /config/i, /preference/i, /option/i, /parameter/i, /feature/i, /flag/i], columnHints: [/key/i, /value/i, /default/i], icon: '⚙️', color: '#64748b', priority: 3 },
    { name: 'Locations & Geo', patterns: [/address/i, /location/i, /country/i, /city/i, /state/i, /region/i, /zone/i, /area/i, /place/i, /geo/i], columnHints: [/latitude/i, /longitude/i, /zip/i, /postal/i, /street/i], icon: '📍', color: '#14b8a6', priority: 5 },
    { name: 'Financial', patterns: [/account/i, /balance/i, /ledger/i, /budget/i, /expense/i, /income/i, /tax/i, /fee/i, /billing/i, /credit/i, /debit/i], columnHints: [/amount/i, /balance/i, /currency/i, /rate/i], icon: '💰', color: '#eab308', priority: 6 },
    { name: 'Scheduling', patterns: [/schedule/i, /calendar/i, /event/i, /booking/i, /appointment/i, /reservation/i, /slot/i, /availability/i], columnHints: [/start_time/i, /end_time/i, /duration/i, /recurring/i], icon: '📅', color: '#a855f7', priority: 5 },
  ];

  // Analyze table structure for better categorization
  const analyzeTableForCategory = (table: Table): { pattern: typeof semanticPatterns[0]; score: number } | null => {
    let bestMatch: { pattern: typeof semanticPatterns[0]; score: number } | null = null;
    
    for (const pattern of semanticPatterns) {
      let score = 0;
      
      // Check table name matches (high weight)
      if (pattern.patterns.some(p => p.test(table.name))) {
        score += 10;
      }
      
      // Check column names for hints (medium weight)
      for (const col of table.columns) {
        if (pattern.columnHints.some(h => h.test(col.name))) {
          score += 2;
        }
        // Check if column name matches pattern
        if (pattern.patterns.some(p => p.test(col.name))) {
          score += 1;
        }
      }
      
      // Apply priority as tiebreaker
      score += pattern.priority * 0.1;
      
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { pattern, score };
      }
    }
    
    return bestMatch;
  };

  const suggestTablesForCategory = (categoryName: string): string[] => {
    const lowerName = categoryName.toLowerCase();
    const suggestions: string[] = [];
    
    // Find matching semantic pattern
    for (const pattern of semanticPatterns) {
      if (pattern.name.toLowerCase().includes(lowerName) || pattern.patterns.some(p => p.test(categoryName))) {
        // Find tables matching this pattern
        schema.tables.forEach(t => {
          if (!t.category) {
            const analysis = analyzeTableForCategory(t);
            if (analysis && analysis.pattern.name === pattern.name) {
              suggestions.push(t.name);
            }
          }
        });
        break;
      }
    }
    
    // Also match tables with the category name in them
    schema.tables.forEach(t => {
      if (!t.category && t.name.toLowerCase().includes(lowerName) && !suggestions.includes(t.name)) {
        suggestions.push(t.name);
      }
    });
    
    return suggestions;
  };

  const autoCategorizeTables = () => {
    const tables = schema.tables.filter(t => !t.category); // Only uncategorized tables
    if (tables.length === 0) {
      setChatMessages((m) => [...m, { role: 'assistant', content: '⚠️ All tables are already categorized.' }]);
      return;
    }

    const newCategories: TableCategory[] = [];
    const tableUpdates: Record<string, string> = {};
    const categoryMap: Record<string, { pattern: typeof semanticPatterns[0]; tables: string[] }> = {};
    
    // Step 1: Analyze each table and find best category match
    tables.forEach(table => {
      const analysis = analyzeTableForCategory(table);
      if (analysis && analysis.score >= 5) { // Minimum confidence threshold
        if (!categoryMap[analysis.pattern.name]) {
          categoryMap[analysis.pattern.name] = { pattern: analysis.pattern, tables: [] };
        }
        categoryMap[analysis.pattern.name].tables.push(table.name);
      }
    });
    
    // Step 2: Create categories for matched patterns
    Object.entries(categoryMap).forEach(([name, data]) => {
      if (data.tables.length >= 1) {
        const id = `cat_auto_${Date.now()}_${newCategories.length}`;
        newCategories.push({
          id,
          name: `${data.pattern.icon} ${data.pattern.name}`,
          color: data.pattern.color,
          description: `${data.tables.length} table(s): ${data.tables.slice(0, 3).join(', ')}${data.tables.length > 3 ? '...' : ''}`,
        });
        data.tables.forEach(tn => { tableUpdates[tn] = id; });
      }
    });
    
    // Step 3: FK-based grouping for remaining uncategorized tables
    const remaining = tables.filter(t => !tableUpdates[t.name]);
    if (remaining.length > 1) {
      // Build FK relationship graph
      const parent: Record<string, string> = {};
      remaining.forEach(t => { parent[t.name] = t.name; });
      
      const find = (x: string): string => {
        if (parent[x] !== x) parent[x] = find(parent[x]);
        return parent[x];
      };
      
      const union = (x: string, y: string) => {
        const px = find(x);
        const py = find(y);
        if (px !== py) parent[px] = py;
      };
      
      // Also include tables that reference categorized tables
      remaining.forEach(t => {
        t.columns.forEach(c => {
          if (c.fk) {
            const refTable = schema.tables.find(tt => tt.name === c.fk!.table);
            if (refTable) {
              // If FK points to a categorized table, inherit its category
              if (tableUpdates[refTable.name]) {
                tableUpdates[t.name] = tableUpdates[refTable.name];
              } else if (remaining.find(rt => rt.name === refTable.name)) {
                union(t.name, c.fk.table);
              }
            }
          }
        });
      });
      
      // Check reverse FKs too (tables that reference this one)
      remaining.forEach(t => {
        schema.tables.forEach(other => {
          if (other.name !== t.name && tableUpdates[other.name]) {
            const hasFkToThis = other.columns.some(c => c.fk?.table === t.name);
            if (hasFkToThis && !tableUpdates[t.name]) {
              tableUpdates[t.name] = tableUpdates[other.name];
            }
          }
        });
      });
      
      // Create categories for FK-connected groups
      const groups: Record<string, string[]> = {};
      remaining.filter(t => !tableUpdates[t.name]).forEach(t => {
        const root = find(t.name);
        if (!groups[root]) groups[root] = [];
        groups[root].push(t.name);
      });
      
      const miscColors = ['#64748b', '#78716c', '#71717a', '#737373'];
      let miscIdx = 0;
      Object.entries(groups).forEach(([root, tableNames]) => {
        if (tableNames.length > 1) {
          const id = `cat_auto_${Date.now()}_fk_${newCategories.length}`;
          newCategories.push({
            id,
            name: `🔗 ${root} Related`,
            color: miscColors[miscIdx % miscColors.length],
            description: `FK-connected: ${tableNames.join(', ')}`,
          });
          tableNames.forEach(tn => { tableUpdates[tn] = id; });
          miscIdx++;
        }
      });
    }
    
    if (newCategories.length === 0 && Object.keys(tableUpdates).length === 0) {
      setChatMessages((m) => [...m, { role: 'assistant', content: '⚠️ Could not detect any table groups. Try:\n• Adding foreign key relationships between tables\n• Using descriptive table names (users, orders, products, etc.)\n• Creating categories manually' }]);
      return;
    }
    
    // Apply categories and rearrange
    setSchema((s) => {
      const updatedTables = s.tables.map(t => tableUpdates[t.name] ? { ...t, category: tableUpdates[t.name] } : t);
      const allCategories = [...(s.categories || []), ...newCategories];
      return {
        ...s,
        categories: allCategories,
        tables: layoutTablesByCategory(updatedTables, allCategories),
      };
    });
    
    const categorizedCount = Object.keys(tableUpdates).length;
    const uncategorizedCount = tables.length - categorizedCount;
    setChatMessages((m) => [...m, { 
      role: 'assistant', 
      content: `✅ **Smart categorization complete!**

📊 Categorized **${categorizedCount}** of ${tables.length} tables into **${newCategories.length}** groups:

${newCategories.map(c => `• **${c.name}** - ${c.description}`).join('\n')}${uncategorizedCount > 0 ? `\n\n⚠️ ${uncategorizedCount} table(s) couldn't be auto-categorized. Assign them manually or add FK relationships.` : '\n\n🎉 All tables organized!'}

📐 Tables have been arranged by category. Drag category labels to reposition groups.` 
    }]);
  };

  // Move all tables in a category by a delta
  const moveCategoryTables = (categoryId: string, dx: number, dy: number) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.map(t => {
        if (t.category === categoryId && t.x !== undefined && t.y !== undefined) {
          return { ...t, x: t.x + dx, y: t.y + dy };
        }
        return t;
      }),
    }));
  };

  // Rearrange all tables by their categories
  const rearrangeByCategory = () => {
    if (!schema.categories || schema.categories.length === 0) {
      setChatMessages((m) => [...m, { role: 'assistant', content: '⚠️ No categories defined. Create or auto-detect categories first.' }]);
      return;
    }
    setSchema((s) => ({
      ...s,
      tables: layoutTablesByCategory(s.tables, s.categories || []),
    }));
    setChatMessages((m) => [...m, { role: 'assistant', content: '📐 Tables have been rearranged by category.' }]);
  };

  const toggleCategoryCollapse = (categoryId: string) => {
    setSchema((s) => ({
      ...s,
      categories: (s.categories || []).map(c => 
        c.id === categoryId ? { ...c, collapsed: !c.collapsed } : c
      ),
    }));
  };

  const getCategoryForTable = (tableName: string): TableCategory | undefined => {
    const table = schema.tables.find(t => t.name === tableName);
    if (!table?.category) return undefined;
    return schema.categories?.find(c => c.id === table.category);
  };

  const getTablesInCategory = (categoryId: string): Table[] => {
    return schema.tables.filter(t => t.category === categoryId);
  };

  const getUncategorizedTables = (): Table[] => {
    return schema.tables.filter(t => !t.category);
  };

  const renameTableManual = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return;
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name === oldName) return { ...t, name: newName };
        return { ...t, columns: t.columns.map((c) => c.fk?.table === oldName ? { ...c, fk: { ...c.fk, table: newName } } : c) };
      }),
    }));
    if (selectedTable === oldName) setSelectedTable(newName);
  };

  // ─── Manual Column Operations ────────────────────────────────────────────
  const addColumnManual = () => {
    if (!selectedTable || !newColumn.name.trim()) return;
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name !== selectedTable) return t;
        if (t.columns.find((c) => c.name === newColumn.name)) return t;
        return { ...t, columns: [...t.columns, { ...newColumn }] };
      }),
    }));
    setNewColumn({ name: '', type: 'VARCHAR(255)', pk: false, nullable: true, unique: false });
    setShowAddColumnModal(false);
    setChatMessages((m) => [...m, { role: 'assistant', content: `✅ Added column \`${newColumn.name}\` to **${selectedTable}**.` }]);
  };

  const updateColumn = () => {
    if (!editingColumn) return;
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name !== editingColumn.tableName) return t;
        const cols = [...t.columns];
        cols[editingColumn.index] = editingColumn.column;
        return { ...t, columns: cols };
      }),
    }));
    setEditingColumn(null);
    setShowEditColumnModal(false);
  };

  const deleteColumn = (tableName: string, colName: string) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => t.name === tableName ? { ...t, columns: t.columns.filter((c) => c.name !== colName) } : t),
    }));
  };

  const moveColumnUp = (tableName: string, index: number) => {
    if (index === 0) return;
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name !== tableName) return t;
        const cols = [...t.columns];
        [cols[index - 1], cols[index]] = [cols[index], cols[index - 1]];
        return { ...t, columns: cols };
      }),
    }));
  };

  const moveColumnDown = (tableName: string, index: number) => {
    const table = schema.tables.find((t) => t.name === tableName);
    if (!table || index >= table.columns.length - 1) return;
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name !== tableName) return t;
        const cols = [...t.columns];
        [cols[index], cols[index + 1]] = [cols[index + 1], cols[index]];
        return { ...t, columns: cols };
      }),
    }));
  };

  // ─── FK Operations ───────────────────────────────────────────────────────
  const addFkManual = () => {
    if (!newFk.fromTable || !newFk.fromCol || !newFk.toTable) return;
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name !== newFk.fromTable) return t;
        return {
          ...t,
          columns: t.columns.map((c) => c.name === newFk.fromCol ? { ...c, fk: { table: newFk.toTable, column: newFk.toCol || 'id' } } : c),
        };
      }),
    }));
    setShowAddFkModal(false);
    setChatMessages((m) => [...m, { role: 'assistant', content: `🔗 Created FK: **${newFk.fromTable}.${newFk.fromCol}** → **${newFk.toTable}.${newFk.toCol || 'id'}**` }]);
    setNewFk({ fromTable: '', fromCol: '', toTable: '', toCol: 'id' });
  };

  const removeFk = (tableName: string, colName: string) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => t.name === tableName ? { ...t, columns: t.columns.map((c) => c.name === colName ? { ...c, fk: undefined } : c) } : t),
    }));
  };

  const toggleColumnPk = (tableName: string, colName: string) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name !== tableName) return t;
        return { ...t, columns: t.columns.map((c) => c.name === colName ? { ...c, pk: !c.pk } : c) };
      }),
    }));
  };

  const toggleColumnUnique = (tableName: string, colName: string) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name !== tableName) return t;
        return { ...t, columns: t.columns.map((c) => c.name === colName ? { ...c, unique: !c.unique } : c) };
      }),
    }));
  };

  const toggleColumnNullable = (tableName: string, colName: string) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name !== tableName) return t;
        return { ...t, columns: t.columns.map((c) => c.name === colName ? { ...c, nullable: !c.nullable } : c) };
      }),
    }));
  };

  const changeTableColor = (tableName: string, color: string) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => t.name === tableName ? { ...t, color } : t),
    }));
  };

  const generateSQL = (): string => {
    let sql = '-- Generated DDL\n';
    sql += `-- Schema: ${schema.name || 'Untitled'}\n`;
    sql += `-- Generated: ${new Date().toISOString()}\n\n`;
    
    schema.tables.forEach((t) => {
      sql += `CREATE TABLE ${t.name} (\n`;
      const lines: string[] = [];
      t.columns.forEach((c) => {
        let line = `  ${c.name} ${c.type}`;
        if (c.pk) line += ' PRIMARY KEY';
        if (c.unique && !c.pk) line += ' UNIQUE';
        if (c.nullable === false && !c.pk) line += ' NOT NULL';
        lines.push(line);
      });
      // FK constraints
      t.columns.forEach((c) => {
        if (c.fk) {
          lines.push(`  FOREIGN KEY (${c.name}) REFERENCES ${c.fk.table}(${c.fk.column})`);
        }
      });
      sql += lines.join(',\n') + '\n);\n\n';
    });
    return sql;
  };

  const openSqlViewer = () => {
    setSqlCode(generateSQL());
    setShowSqlViewer(true);
  };

  const downloadSqlCode = () => {
    const blob = new Blob([sqlCode], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(schema.name || 'schema').replace(/[^a-zA-Z0-9]/g, '_')}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    setShowSqlViewer(false);
    setChatMessages((m) => [...m, { role: 'assistant', content: `✅ Downloaded SQL file with your custom modifications.` }]);
  };

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(sqlCode);
    setChatMessages((m) => [...m, { role: 'assistant', content: `📋 SQL code copied to clipboard!` }]);
  };

  const exportSQL = () => {
    let sql = '-- Generated DDL\n';
    sql += `-- Schema: ${schema.name || 'Untitled'}\n`;
    sql += `-- Generated: ${new Date().toISOString()}\n\n`;
    
    schema.tables.forEach((t) => {
      sql += `CREATE TABLE ${t.name} (\n`;
      const lines: string[] = [];
      t.columns.forEach((c) => {
        let line = `  ${c.name} ${c.type}`;
        if (c.pk) line += ' PRIMARY KEY';
        if (c.unique && !c.pk) line += ' UNIQUE';
        if (c.nullable === false && !c.pk) line += ' NOT NULL';
        lines.push(line);
      });
      // FK constraints
      t.columns.forEach((c) => {
        if (c.fk) {
          lines.push(`  FOREIGN KEY (${c.name}) REFERENCES ${c.fk.table}(${c.fk.column})`);
        }
      });
      sql += lines.join(',\n') + '\n);\n\n';
    });
    const blob = new Blob([sql], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(schema.name || 'schema').replace(/[^a-zA-Z0-9]/g, '_')}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const exportData = {
      name: schema.name,
      exportedAt: new Date().toISOString(),
      tables: schema.tables.map(t => ({
        name: t.name,
        color: t.color,
        x: t.x,
        y: t.y,
        columns: t.columns.map(c => ({
          name: c.name,
          type: c.type,
          pk: c.pk || false,
          unique: c.unique || false,
          nullable: c.nullable !== false,
          fk: c.fk || null,
        })),
      })),
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(schema.name || 'schema').replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setChatMessages((m) => [...m, { role: 'assistant', content: `📦 Exported schema as JSON. This format preserves all table positions, colors, and relationships for perfect re-import.` }]);
  };

  // ─── PowerPoint Export Function ──────────────────────────────────────────────
  const exportPowerPoint = async () => {
    if (schema.tables.length === 0) {
      setChatMessages((m) => [...m, { role: 'assistant', content: '⚠️ No tables to export. Create some tables first!' }]);
      return;
    }

    setChatMessages((m) => [...m, { role: 'assistant', content: '📊 Generating professional PowerPoint presentation...' }]);

    try {
      // Load JSZip for creating the PPTX file (which is just a ZIP)
      const JSZip = await new Promise<any>((resolve, reject) => {
        if ((window as any).JSZip) {
          resolve((window as any).JSZip);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => {
          setTimeout(() => {
            if ((window as any).JSZip) {
              resolve((window as any).JSZip);
            } else {
              reject(new Error('JSZip failed to initialize'));
            }
          }, 50);
        };
        script.onerror = () => reject(new Error('Failed to load JSZip library'));
        document.head.appendChild(script);
      });

      // Count relationships
      const relationships: Array<{ from: string; fromCol: string; to: string; toCol: string }> = [];
      schema.tables.forEach(t => {
        t.columns.forEach(c => {
          if (c.fk) {
            relationships.push({ from: t.name, fromCol: c.name, to: c.fk.table, toCol: c.fk.column });
          }
        });
      });

      // Helper to escape XML
      const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      
      // EMU conversions (914400 EMUs per inch)
      const inchToEmu = (inches: number) => Math.round(inches * 914400);
      const SLIDE_W = inchToEmu(10);
      const SLIDE_H = inchToEmu(7.5);

      // Color helper
      const hexColor = (hex: string) => hex.replace('#', '').toUpperCase();

      // Generate slide XML
      const createSlideXml = (content: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    ${content}
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;

      // Create rectangle shape
      const createRect = (x: number, y: number, w: number, h: number, fillColor: string, id: number) => `
<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Rect${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${inchToEmu(x)}" y="${inchToEmu(y)}"/><a:ext cx="${inchToEmu(w)}" cy="${inchToEmu(h)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${hexColor(fillColor)}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>`;

      // Create text box
      const createTextBox = (x: number, y: number, w: number, h: number, text: string, fontSize: number, color: string, bold: boolean, align: string, id: number) => `
<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${inchToEmu(x)}" y="${inchToEmu(y)}"/><a:ext cx="${inchToEmu(w)}" cy="${inchToEmu(h)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
<p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="ctr"/><a:lstStyle/>
<a:p><a:pPr algn="${align === 'center' ? 'ctr' : align === 'right' ? 'r' : 'l'}"/>
<a:r><a:rPr lang="en-US" sz="${fontSize * 100}"${bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${hexColor(color)}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr>
<a:t>${escXml(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;

      const colors = {
        dark: '0F172A',
        darkAlt: '1E293B',
        primary: '6366F1',
        secondary: '8B5CF6',
        accent: '10B981',
        light: 'F1F5F9',
        muted: '94A3B8',
        warning: 'F59E0B',
      };

      const slides: string[] = [];
      
      // ═══════════════════════════════════════════════════════════════════════════
      // SLIDE 1: Title Slide
      // ═══════════════════════════════════════════════════════════════════════════
      let slide1Content = '';
      let id = 2;
      slide1Content += createRect(0, 0, 10, 7.5, colors.dark, id++);
      slide1Content += createRect(0, 3.8, 10, 0.15, colors.primary, id++);
      slide1Content += createRect(0, 4.0, 10, 0.1, colors.secondary, id++);
      slide1Content += createTextBox(0.5, 1.8, 9, 1, schema.name || 'Database Schema', 44, colors.light, true, 'center', id++);
      slide1Content += createTextBox(0.5, 2.8, 9, 0.6, 'Database Architecture & Documentation', 20, colors.muted, false, 'center', id++);
      const statsText = `${schema.tables.length} Tables  |  ${schema.tables.reduce((a, t) => a + t.columns.length, 0)} Columns  |  ${relationships.length} Relationships`;
      slide1Content += createTextBox(0.5, 4.3, 9, 0.5, statsText, 14, colors.accent, false, 'center', id++);
      slide1Content += createTextBox(0.5, 4.8, 9, 0.4, new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 12, colors.muted, false, 'center', id++);
      slides.push(createSlideXml(slide1Content));

      // ═══════════════════════════════════════════════════════════════════════════
      // SLIDE 2: Schema Overview
      // ═══════════════════════════════════════════════════════════════════════════
      let slide2Content = '';
      id = 2;
      slide2Content += createRect(0, 0, 10, 7.5, colors.dark, id++);
      slide2Content += createRect(0, 0, 10, 0.8, colors.primary, id++);
      slide2Content += createTextBox(0.4, 0.15, 8, 0.5, 'Schema Overview', 24, 'FFFFFF', true, 'left', id++);
      
      // Table grid
      const gridCols = Math.min(4, schema.tables.length);
      const tableBoxWidth = 2.1;
      const tableBoxHeight = 1.0;
      const gridStartX = (10 - (gridCols * tableBoxWidth + (gridCols - 1) * 0.2)) / 2;
      
      schema.tables.slice(0, 12).forEach((table, idx) => {
        const col = idx % gridCols;
        const row = Math.floor(idx / gridCols);
        const x = gridStartX + col * (tableBoxWidth + 0.2);
        const y = 1.1 + row * (tableBoxHeight + 0.15);
        if (y + tableBoxHeight > 5.0) return;
        
        const tableColor = (table.color || '#6366f1').replace('#', '');
        slide2Content += createRect(x, y, tableBoxWidth, tableBoxHeight, colors.darkAlt, id++);
        slide2Content += createRect(x, y, tableBoxWidth, 0.15, tableColor, id++);
        slide2Content += createTextBox(x, y + 0.25, tableBoxWidth, 0.3, table.name, 11, colors.light, true, 'center', id++);
        slide2Content += createTextBox(x, y + 0.55, tableBoxWidth, 0.25, `${table.columns.length} columns`, 9, colors.muted, false, 'center', id++);
      });
      
      slide2Content += createRect(0.4, 5.2, 9.2, 0.5, colors.darkAlt, id++);
      slide2Content += createTextBox(0.4, 5.25, 9.2, 0.4, `Total: ${schema.tables.length} tables  |  ${schema.tables.reduce((a, t) => a + t.columns.length, 0)} columns  |  ${relationships.length} relationships`, 11, colors.accent, false, 'center', id++);
      slides.push(createSlideXml(slide2Content));

      // ═══════════════════════════════════════════════════════════════════════════
      // SLIDE 3: Relationships (if any)
      // ═══════════════════════════════════════════════════════════════════════════
      if (relationships.length > 0) {
        let slide3Content = '';
        id = 2;
        slide3Content += createRect(0, 0, 10, 7.5, colors.dark, id++);
        slide3Content += createRect(0, 0, 10, 0.8, colors.secondary, id++);
        slide3Content += createTextBox(0.4, 0.15, 8, 0.5, 'Table Relationships', 24, 'FFFFFF', true, 'left', id++);
        
        let yPos = 1.2;
        // Header row
        slide3Content += createRect(0.5, yPos, 2.2, 0.4, colors.darkAlt, id++);
        slide3Content += createTextBox(0.5, yPos, 2.2, 0.4, 'From Table', 10, colors.light, true, 'center', id++);
        slide3Content += createRect(2.7, yPos, 1.8, 0.4, colors.darkAlt, id++);
        slide3Content += createTextBox(2.7, yPos, 1.8, 0.4, 'Column', 10, colors.light, true, 'center', id++);
        slide3Content += createRect(4.5, yPos, 0.6, 0.4, colors.darkAlt, id++);
        slide3Content += createTextBox(4.5, yPos, 0.6, 0.4, '->', 10, colors.muted, false, 'center', id++);
        slide3Content += createRect(5.1, yPos, 2.2, 0.4, colors.darkAlt, id++);
        slide3Content += createTextBox(5.1, yPos, 2.2, 0.4, 'To Table', 10, colors.light, true, 'center', id++);
        slide3Content += createRect(7.3, yPos, 1.8, 0.4, colors.darkAlt, id++);
        slide3Content += createTextBox(7.3, yPos, 1.8, 0.4, 'Column', 10, colors.light, true, 'center', id++);
        yPos += 0.45;

        relationships.slice(0, 12).forEach((rel, idx) => {
          const bgColor = idx % 2 === 0 ? colors.dark : colors.darkAlt;
          slide3Content += createRect(0.5, yPos, 2.2, 0.35, bgColor, id++);
          slide3Content += createTextBox(0.5, yPos, 2.2, 0.35, rel.from, 9, colors.light, false, 'center', id++);
          slide3Content += createRect(2.7, yPos, 1.8, 0.35, bgColor, id++);
          slide3Content += createTextBox(2.7, yPos, 1.8, 0.35, rel.fromCol, 9, colors.accent, false, 'center', id++);
          slide3Content += createRect(4.5, yPos, 0.6, 0.35, bgColor, id++);
          slide3Content += createTextBox(4.5, yPos, 0.6, 0.35, '->', 9, colors.muted, false, 'center', id++);
          slide3Content += createRect(5.1, yPos, 2.2, 0.35, bgColor, id++);
          slide3Content += createTextBox(5.1, yPos, 2.2, 0.35, rel.to, 9, colors.light, false, 'center', id++);
          slide3Content += createRect(7.3, yPos, 1.8, 0.35, bgColor, id++);
          slide3Content += createTextBox(7.3, yPos, 1.8, 0.35, rel.toCol, 9, colors.warning, false, 'center', id++);
          yPos += 0.38;
        });
        slides.push(createSlideXml(slide3Content));
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // TABLE DETAIL SLIDES
      // ═══════════════════════════════════════════════════════════════════════════
      schema.tables.forEach((table, tableIdx) => {
        let slideContent = '';
        id = 2;
        const tableColor = (table.color || '#6366f1').replace('#', '');
        
        slideContent += createRect(0, 0, 10, 7.5, colors.dark, id++);
        slideContent += createRect(0, 0, 10, 0.8, tableColor, id++);
        slideContent += createTextBox(0.4, 0.15, 7, 0.5, `Table: ${table.name}`, 24, 'FFFFFF', true, 'left', id++);
        slideContent += createTextBox(7.5, 0.2, 2, 0.4, `${tableIdx + 1} of ${schema.tables.length}`, 11, 'FFFFFF', false, 'right', id++);

        // Stats
        const pkCount = table.columns.filter(c => c.pk).length;
        const fkCount = table.columns.filter(c => c.fk).length;
        slideContent += createRect(0.4, 1.0, 4.4, 0.6, colors.darkAlt, id++);
        slideContent += createTextBox(0.5, 1.05, 4.2, 0.5, `Columns: ${table.columns.length}  |  PK: ${pkCount}  |  FK: ${fkCount}`, 10, colors.accent, false, 'left', id++);

        // Column header
        slideContent += createTextBox(0.4, 1.8, 9, 0.3, 'Column Details', 13, colors.light, true, 'left', id++);
        
        // Column table header
        let yPos = 2.2;
        slideContent += createRect(0.4, yPos, 2.5, 0.35, tableColor, id++);
        slideContent += createTextBox(0.4, yPos, 2.5, 0.35, 'Column Name', 10, 'FFFFFF', true, 'center', id++);
        slideContent += createRect(2.9, yPos, 2.0, 0.35, tableColor, id++);
        slideContent += createTextBox(2.9, yPos, 2.0, 0.35, 'Data Type', 10, 'FFFFFF', true, 'center', id++);
        slideContent += createRect(4.9, yPos, 2.5, 0.35, tableColor, id++);
        slideContent += createTextBox(4.9, yPos, 2.5, 0.35, 'Constraints', 10, 'FFFFFF', true, 'center', id++);
        slideContent += createRect(7.4, yPos, 2.2, 0.35, tableColor, id++);
        slideContent += createTextBox(7.4, yPos, 2.2, 0.35, 'References', 10, 'FFFFFF', true, 'center', id++);
        yPos += 0.38;

        table.columns.slice(0, 12).forEach((col, idx) => {
          const bgColor = idx % 2 === 0 ? colors.dark : colors.darkAlt;
          const constraints: string[] = [];
          if (col.pk) constraints.push('PK');
          if (col.unique && !col.pk) constraints.push('UQ');
          if (col.nullable === false) constraints.push('NOT NULL');

          slideContent += createRect(0.4, yPos, 2.5, 0.32, bgColor, id++);
          slideContent += createTextBox(0.4, yPos, 2.5, 0.32, col.name, 9, col.pk ? colors.warning : colors.light, col.pk, 'center', id++);
          slideContent += createRect(2.9, yPos, 2.0, 0.32, bgColor, id++);
          slideContent += createTextBox(2.9, yPos, 2.0, 0.32, col.type, 9, colors.accent, false, 'center', id++);
          slideContent += createRect(4.9, yPos, 2.5, 0.32, bgColor, id++);
          slideContent += createTextBox(4.9, yPos, 2.5, 0.32, constraints.join(', ') || '-', 8, colors.muted, false, 'center', id++);
          slideContent += createRect(7.4, yPos, 2.2, 0.32, bgColor, id++);
          slideContent += createTextBox(7.4, yPos, 2.2, 0.32, col.fk ? `${col.fk.table}.${col.fk.column}` : '-', 8, col.fk ? colors.accent : colors.muted, false, 'center', id++);
          yPos += 0.34;
        });

        if (table.columns.length > 12) {
          slideContent += createTextBox(0.4, yPos + 0.1, 9, 0.3, `+ ${table.columns.length - 12} more columns...`, 10, colors.muted, false, 'left', id++);
        }
        slides.push(createSlideXml(slideContent));
      });

      // ═══════════════════════════════════════════════════════════════════════════
      // FINAL SLIDE: Summary
      // ═══════════════════════════════════════════════════════════════════════════
      let finalContent = '';
      id = 2;
      finalContent += createRect(0, 0, 10, 7.5, colors.dark, id++);
      finalContent += createRect(0, 2.6, 10, 0.1, colors.primary, id++);
      finalContent += createTextBox(0.5, 2.0, 9, 0.7, 'Documentation Complete', 36, colors.light, true, 'center', id++);
      finalContent += createTextBox(0.5, 3.0, 9, 0.5, `${schema.tables.length} Tables  |  ${schema.tables.reduce((a, t) => a + t.columns.length, 0)} Columns  |  ${relationships.length} Relationships`, 16, colors.accent, false, 'center', id++);
      finalContent += createTextBox(0.5, 4.2, 9, 0.4, 'Generated by Schema Visualizer', 12, colors.muted, false, 'center', id++);
      finalContent += createTextBox(0.5, 4.6, 9, 0.3, new Date().toLocaleString(), 10, colors.muted, false, 'center', id++);
      slides.push(createSlideXml(finalContent));

      // ═══════════════════════════════════════════════════════════════════════════
      // BUILD PPTX PACKAGE
      // ═══════════════════════════════════════════════════════════════════════════
      const zip = new JSZip();

      // [Content_Types].xml
      let contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`;
      slides.forEach((_, i) => {
        contentTypes += `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
      });
      contentTypes += `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`;
      zip.file('[Content_Types].xml', contentTypes);

      // _rels/.rels
      zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

      // ppt/presentation.xml
      let slideIdList = '';
      let slideRelList = '';
      slides.forEach((_, i) => {
        slideIdList += `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`;
        slideRelList += `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`;
      });
      zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${slideIdList}</p:sldIdLst>
<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/>
<p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>
</p:presentation>`);

      // ppt/_rels/presentation.xml.rels
      zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slideRelList}
</Relationships>`);

      // Add slides
      slides.forEach((slideXml, i) => {
        zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml);
        zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);
      });

      // Slide master and layout
      zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`);

      zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`);

      zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`);

      zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);

      // Theme
      zip.file('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Schema Theme">
<a:themeElements>
<a:clrScheme name="Schema"><a:dk1><a:srgbClr val="0F172A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1E293B"/></a:dk2><a:lt2><a:srgbClr val="F1F5F9"/></a:lt2>
<a:accent1><a:srgbClr val="6366F1"/></a:accent1><a:accent2><a:srgbClr val="8B5CF6"/></a:accent2>
<a:accent3><a:srgbClr val="10B981"/></a:accent3><a:accent4><a:srgbClr val="F59E0B"/></a:accent4>
<a:accent5><a:srgbClr val="EF4444"/></a:accent5><a:accent6><a:srgbClr val="06B6D4"/></a:accent6>
<a:hlink><a:srgbClr val="6366F1"/></a:hlink><a:folHlink><a:srgbClr val="8B5CF6"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements></a:theme>`);

      // Generate and download
      const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      const fileName = `${(schema.name || 'schema').replace(/[^a-zA-Z0-9]/g, '_')}_documentation.pptx`;
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      
      setChatMessages((m) => [...m, { role: 'assistant', content: `✅ **PowerPoint presentation generated!**\n\n📁 File: \`${fileName}\`\n\nIncludes:\n• Title slide\n• Schema overview with table cards\n• Relationship diagram\n• ${schema.tables.length} individual table slides\n• Summary slide\n\n🎨 Professional dark theme with your table colors!` }]);
      
    } catch (error) {
      console.error('PowerPoint export error:', error);
      setChatMessages((m) => [...m, { role: 'assistant', content: `❌ **Error generating PowerPoint:**\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again or check the browser console for details.` }]);
    }
  };

  const selectedTableData = schema.tables.find((t) => t.name === selectedTable);

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0' }}>
      {/* CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {/* Hidden file input for import */}
      <input type="file" ref={fileInputRef} accept=".sql,.txt,.json" style={{ display: 'none' }} onChange={handleFileImport} />

      {/* Save Modal */}
      {showSaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Save Schema
            </div>
            <input
              type="text"
              value={schemaName}
              onChange={(e) => setSchemaName(e.target.value)}
              placeholder="Schema name..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && confirmSave()}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowSaveModal(false)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmSave} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Load Modal */}
      {showLoadModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, width: 400, maxHeight: '70vh', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                Load Schema
              </span>
              <button onClick={() => setShowLoadModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            {savedSchemas.length === 0 ? (
              <div style={{ color: '#64748b', textAlign: 'center', padding: 24 }}>No saved schemas yet. Create one and save it!</div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto' }}>
                {savedSchemas.map((s) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 8, background: '#0f172a', gap: 12 }}>
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => loadSavedSchema(s)}>
                      <div style={{ fontWeight: 500, marginBottom: 2 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{s.schema.tables.length} tables • {new Date(s.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <button onClick={() => deleteSaved(s.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 8px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Table Modal */}
      {showAddTableModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
              Add New Table
            </div>
            <input
              type="text"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              placeholder="Table name..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && addTableManual()}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAddTableModal(false)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
              <button onClick={addTableManual} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Add Table</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Category Modal */}
      {showCategoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, width: 480, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              {editingCategory ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              )}
              {editingCategory ? 'Edit Category' : 'Create Category'}
              {editingCategory && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: editingCategory.color + '30', color: editingCategory.color }}>{editingCategory.name}</span>
              )}
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
              {editingCategory 
                ? 'Edit the category details and manage which tables belong to it.'
                : 'Categories help you group related tables together for better organization.'}
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Category Name</label>
              <input
                type="text"
                value={newCategory.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewCategory({ ...newCategory, name });
                  // Auto-suggest tables based on name
                  if (name.length >= 2) {
                    const suggestions = suggestTablesForCategory(name);
                    if (suggestions.length > 0 && newCategory.selectedTables.length === 0) {
                      setNewCategory(prev => ({ ...prev, name, selectedTables: suggestions }));
                    }
                  }
                }}
                placeholder="e.g., User Management, Orders, Analytics..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Color</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {categoryColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewCategory({ ...newCategory, color })}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      border: newCategory.color === color ? '2px solid #fff' : '1px solid #334155',
                      background: color,
                      cursor: 'pointer',
                      transform: newCategory.color === color ? 'scale(1.1)' : 'scale(1)',
                      transition: 'all 0.15s',
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Description (optional)</label>
              <input
                type="text"
                value={newCategory.description}
                onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                placeholder="Brief description of this category..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            {/* Table Selector */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 11, color: '#64748b' }}>Select Tables ({newCategory.selectedTables.length} selected)</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setNewCategory({ ...newCategory, selectedTables: schema.tables.filter(t => !t.category || (editingCategory && t.category === editingCategory.id)).map(t => t.name) })}
                    style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #334155', background: '#0f172a', color: '#64748b', fontSize: 10, cursor: 'pointer' }}
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setNewCategory({ ...newCategory, selectedTables: [] })}
                    style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #334155', background: '#0f172a', color: '#64748b', fontSize: 10, cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #334155', borderRadius: 8, background: '#0f172a' }}>
                {schema.tables.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 12 }}>No tables in schema</div>
                ) : (
                  schema.tables.map(t => {
                    const isSelected = newCategory.selectedTables.includes(t.name);
                    const isInThisCategory = editingCategory && t.category === editingCategory.id;
                    const isInOtherCategory = !!t.category && (!editingCategory || t.category !== editingCategory.id);
                    const existingCat = t.category ? schema.categories?.find(c => c.id === t.category) : null;
                    const isClickable = !isInOtherCategory; // Can click if uncategorized or in this category
                    return (
                      <div
                        key={t.name}
                        onClick={() => {
                          if (!isClickable) return;
                          setNewCategory(prev => ({
                            ...prev,
                            selectedTables: isSelected
                              ? prev.selectedTables.filter(n => n !== t.name)
                              : [...prev.selectedTables, t.name]
                          }));
                        }}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: isClickable ? 'pointer' : 'not-allowed',
                          background: isSelected ? `${newCategory.color}30` : isInThisCategory ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                          borderBottom: '1px solid #334155',
                          opacity: isInOtherCategory ? 0.5 : 1,
                        }}
                      >
                        <div style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: isSelected ? 'none' : '2px solid #475569',
                          background: isSelected ? newCategory.color : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          color: '#fff',
                        }}>
                          {isSelected && '✓'}
                        </div>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: t.color || '#6366f1' }} />
                        <span style={{ flex: 1, fontSize: 12, color: '#e2e8f0' }}>{t.name}</span>
                        <span style={{ fontSize: 10, color: '#64748b' }}>{t.columns.length} cols</span>
                        {isInOtherCategory && existingCat && (
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: existingCat.color + '40', color: existingCat.color }}>
                            {existingCat.name}
                          </span>
                        )}
                        {isInThisCategory && (
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#10b98130', color: '#10b981' }}>
                            current
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              {!editingCategory && newCategory.name.length >= 2 && suggestTablesForCategory(newCategory.name).length > 0 && (
                <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: '#0f172a', border: '1px solid #334155' }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>💡 Suggested tables for "{newCategory.name}":</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {suggestTablesForCategory(newCategory.name).filter(n => !newCategory.selectedTables.includes(n)).slice(0, 5).map(name => (
                      <button
                        key={name}
                        onClick={() => setNewCategory(prev => ({ ...prev, selectedTables: [...prev.selectedTables, name] }))}
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', fontSize: 10, cursor: 'pointer' }}
                      >
                        + {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={closeCategoryModal} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
              <button 
                onClick={editingCategory ? updateCategory : addCategory} 
                style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: newCategory.color, color: '#fff', fontWeight: 600, cursor: 'pointer' }}
              >
                {editingCategory 
                  ? `Save Changes` 
                  : `Create ${newCategory.selectedTables.length > 0 ? `with ${newCategory.selectedTables.length} tables` : 'Category'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Column Modal */}
      {showAddColumnModal && selectedTable && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
              Add Column to {selectedTable}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="text" value={newColumn.name} onChange={(e) => setNewColumn({ ...newColumn, name: e.target.value })} placeholder="Column name" style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 }} autoFocus />
              <select value={newColumn.type} onChange={(e) => setNewColumn({ ...newColumn, type: e.target.value })} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 }}>
                <option value="INT">INT</option>
                <option value="SERIAL">SERIAL</option>
                <option value="BIGINT">BIGINT</option>
                <option value="VARCHAR(255)">VARCHAR(255)</option>
                <option value="VARCHAR(100)">VARCHAR(100)</option>
                <option value="TEXT">TEXT</option>
                <option value="BOOLEAN">BOOLEAN</option>
                <option value="DECIMAL(10,2)">DECIMAL(10,2)</option>
                <option value="TIMESTAMP">TIMESTAMP</option>
                <option value="DATE">DATE</option>
                <option value="UUID">UUID</option>
                <option value="JSON">JSON</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={newColumn.pk} onChange={(e) => setNewColumn({ ...newColumn, pk: e.target.checked })} /> Primary Key
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={newColumn.unique} onChange={(e) => setNewColumn({ ...newColumn, unique: e.target.checked })} /> Unique
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={newColumn.nullable} onChange={(e) => setNewColumn({ ...newColumn, nullable: e.target.checked })} /> Nullable
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAddColumnModal(false)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
              <button onClick={addColumnManual} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Add Column</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Column Modal */}
      {showEditColumnModal && editingColumn && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, width: 450, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
              Edit Column
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="text" value={editingColumn.column.name} onChange={(e) => setEditingColumn({ ...editingColumn, column: { ...editingColumn.column, name: e.target.value } })} placeholder="Column name" style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 }} autoFocus />
              <select value={editingColumn.column.type} onChange={(e) => setEditingColumn({ ...editingColumn, column: { ...editingColumn.column, type: e.target.value } })} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 }}>
                <option value="INT">INT</option>
                <option value="SERIAL">SERIAL</option>
                <option value="BIGINT">BIGINT</option>
                <option value="VARCHAR(255)">VARCHAR(255)</option>
                <option value="VARCHAR(100)">VARCHAR(100)</option>
                <option value="TEXT">TEXT</option>
                <option value="BOOLEAN">BOOLEAN</option>
                <option value="DECIMAL(10,2)">DECIMAL(10,2)</option>
                <option value="TIMESTAMP">TIMESTAMP</option>
                <option value="DATE">DATE</option>
                <option value="UUID">UUID</option>
                <option value="JSON">JSON</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={editingColumn.column.pk} onChange={(e) => setEditingColumn({ ...editingColumn, column: { ...editingColumn.column, pk: e.target.checked } })} /> Primary Key
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={editingColumn.column.unique} onChange={(e) => setEditingColumn({ ...editingColumn, column: { ...editingColumn.column, unique: e.target.checked } })} /> Unique
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={editingColumn.column.nullable} onChange={(e) => setEditingColumn({ ...editingColumn, column: { ...editingColumn.column, nullable: e.target.checked } })} /> Nullable
              </label>
            </div>

            {/* Foreign Key Section */}
            <div style={{ marginBottom: 16, padding: 12, background: '#0f172a', borderRadius: 8, border: '1px solid #334155' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                Foreign Key Reference
              </div>
              {editingColumn.column.fk ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>References:</span>
                  <select
                    value={editingColumn.column.fk.table}
                    onChange={(e) => {
                      const newTable = e.target.value;
                      const refTable = schema.tables.find(t => t.name === newTable);
                      const pkCol = refTable?.columns.find(c => c.pk)?.name || 'id';
                      setEditingColumn({ ...editingColumn, column: { ...editingColumn.column, fk: { table: newTable, column: pkCol } } });
                    }}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 12 }}
                  >
                    {schema.tables.filter(t => t.name !== editingColumn.tableName).map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <span style={{ color: '#64748b' }}>.</span>
                  <select
                    value={editingColumn.column.fk.column}
                    onChange={(e) => setEditingColumn({ ...editingColumn, column: { ...editingColumn.column, fk: { ...editingColumn.column.fk!, column: e.target.value } } })}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 12 }}
                  >
                    {schema.tables.find(t => t.name === editingColumn.column.fk?.table)?.columns.map(c => (
                      <option key={c.name} value={c.name}>{c.name}{c.pk ? ' (PK)' : ''}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setEditingColumn({ ...editingColumn, column: { ...editingColumn.column, fk: undefined } })}
                    style={{ padding: '4px 8px', border: '1px solid #ef444440', background: '#ef444420', color: '#f87171', cursor: 'pointer', borderRadius: 4, fontSize: 10, marginLeft: 'auto' }}
                  >
                    Remove FK
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>No foreign key set</span>
                  <button
                    onClick={() => {
                      const otherTables = schema.tables.filter(t => t.name !== editingColumn.tableName);
                      if (otherTables.length > 0) {
                        const refTable = otherTables[0];
                        const pkCol = refTable.columns.find(c => c.pk)?.name || refTable.columns[0]?.name || 'id';
                        setEditingColumn({ ...editingColumn, column: { ...editingColumn.column, fk: { table: refTable.name, column: pkCol } } });
                      }
                    }}
                    disabled={schema.tables.filter(t => t.name !== editingColumn.tableName).length === 0}
                    style={{ padding: '4px 10px', border: '1px solid #38bdf840', background: '#38bdf820', color: '#38bdf8', cursor: 'pointer', borderRadius: 4, fontSize: 10, marginLeft: 'auto', opacity: schema.tables.filter(t => t.name !== editingColumn.tableName).length === 0 ? 0.5 : 1 }}
                  >
                    + Add FK
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowEditColumnModal(false); setEditingColumn(null); }} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
              <button onClick={updateColumn} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Add FK Modal */}
      {showAddFkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Add Foreign Key Relationship
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <select value={newFk.fromTable} onChange={(e) => setNewFk({ ...newFk, fromTable: e.target.value, fromCol: '' })} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 }}>
                <option value="">From table...</option>
                {schema.tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
              <span style={{ color: '#64748b' }}>.</span>
              <select value={newFk.fromCol} onChange={(e) => setNewFk({ ...newFk, fromCol: e.target.value })} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 }}>
                <option value="">Column...</option>
                {schema.tables.find((t) => t.name === newFk.fromTable)?.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ textAlign: 'center', color: '#64748b', marginBottom: 12 }}>↓ references ↓</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
              <select value={newFk.toTable} onChange={(e) => setNewFk({ ...newFk, toTable: e.target.value })} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 }}>
                <option value="">To table...</option>
                {schema.tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
              <span style={{ color: '#64748b' }}>.</span>
              <select value={newFk.toCol} onChange={(e) => setNewFk({ ...newFk, toCol: e.target.value })} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 }}>
                <option value="id">id</option>
                {schema.tables.find((t) => t.name === newFk.toTable)?.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAddFkModal(false)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
              <button onClick={addFkManual} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Create Relationship</button>
            </div>
          </div>
        </div>
      )}

      {/* SQL Code Viewer/Editor Modal */}
      {showSqlViewer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, width: 700, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                SQL Code Editor
              </div>
              <button onClick={() => setShowSqlViewer(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
              Edit the SQL code below to add custom statements, indexes, triggers, or any additional SQL. Then download or copy the result.
            </p>
            
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                onClick={() => setSqlCode(generateSQL())}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Regenerate
              </button>
              <button
                onClick={copySqlToClipboard}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy
              </button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center' }}>
                {sqlCode.split('\n').length} lines
              </span>
            </div>

            {/* Code Editor */}
            <textarea
              value={sqlCode}
              onChange={(e) => setSqlCode(e.target.value)}
              style={{
                flex: 1,
                minHeight: 350,
                padding: 16,
                borderRadius: 8,
                border: '1px solid #334155',
                background: '#0f172a',
                color: '#e2e8f0',
                fontSize: 13,
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                lineHeight: 1.6,
                resize: 'vertical',
                outline: 'none',
              }}
              spellCheck={false}
            />

            {/* Tips */}
            <div style={{ marginTop: 12, padding: 10, background: '#0f172a', borderRadius: 6, border: '1px solid #334155' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Quick Tips
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
                • Add <code style={{ background: '#334155', padding: '1px 4px', borderRadius: 3 }}>CREATE INDEX</code> statements for better query performance<br/>
                • Add <code style={{ background: '#334155', padding: '1px 4px', borderRadius: 3 }}>INSERT INTO</code> statements for seed data<br/>
                • Add <code style={{ background: '#334155', padding: '1px 4px', borderRadius: 3 }}>ALTER TABLE</code> for additional constraints
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowSqlViewer(false)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
              <button onClick={downloadSqlCode} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download SQL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left Sidebar */}
      <div style={{ width: 300, background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)', display: 'flex', flexDirection: 'column', borderRight: '1px solid #334155' }}>
        {/* Header */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid #334155', background: 'linear-gradient(135deg, #1e293b, #334155)' }}>
          <div style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
            <span style={{ color: '#e2e8f0' }}>Schema Visualizer</span>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }}></span>
            AI-powered database designer
          </div>
        </div>

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {/* Actions Section */}
          <div style={{ margin: '0 8px 8px' }}>
            <button
              onClick={() => toggleSection('actions')}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: expandedSections.actions ? 'linear-gradient(135deg, #334155, #1e293b)' : 'transparent',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#e2e8f0',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                Quick Actions
              </span>
              <span style={{ fontSize: 10, color: '#64748b', transform: expandedSections.actions ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
            </button>
            {expandedSections.actions && (
              <div style={{ padding: '8px 4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, animation: 'fadeIn 0.2s ease-out' }}>
                <button onClick={createNewSchema} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#94a3b8', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg> New
                </button>
                <button onClick={handleImportClick} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#94a3b8', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Import
                </button>
                <button onClick={handleSaveSchema} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#94a3b8', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save
                </button>
                <button onClick={handleLoadSchema} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#94a3b8', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Load
                </button>
                <button onClick={() => setShowAddTableModal(true)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #33415580', background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#e2e8f0', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, gridColumn: '1 / -1', fontWeight: 500 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg> Add Table
                </button>
                <button onClick={() => setShowAddFkModal(true)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #33415580', background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#e2e8f0', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, gridColumn: '1 / -1', fontWeight: 500 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Add Relationship
                </button>
                <button onClick={() => setShowCategoryModal(true)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #33415580', background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#e2e8f0', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Category
                </button>
                <button onClick={autoCategorizeTables} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #33415580', background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#e2e8f0', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg> Auto-Group
                </button>
                {schema.categories && schema.categories.length > 0 && (
                  <button onClick={rearrangeByCategory} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #33415580', background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#e2e8f0', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, gridColumn: '1 / -1', fontWeight: 500 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Rearrange Layout
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Templates Section */}
          <div style={{ margin: '0 8px 8px' }}>
            <button
              onClick={() => toggleSection('templates')}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: expandedSections.templates ? 'linear-gradient(135deg, #334155, #1e293b)' : 'transparent',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#e2e8f0',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                Templates
                <span style={{ fontSize: 9, padding: '2px 6px', background: '#47556920', color: '#94a3b8', borderRadius: 10 }}>10</span>
              </span>
              <span style={{ fontSize: 10, color: '#64748b', transform: expandedSections.templates ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
            </button>
            {expandedSections.templates && (
              <div style={{ padding: '8px 4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, animation: 'fadeIn 0.2s ease-out' }}>
                {[
                  { key: 'ecommerce', label: 'E-Commerce' },
                  { key: 'blog', label: 'Blog' },
                  { key: 'social', label: 'Social' },
                  { key: 'hr', label: 'HR' },
                  { key: 'crm', label: 'CRM' },
                  { key: 'inventory', label: 'Inventory' },
                  { key: 'healthcare', label: 'Healthcare' },
                  { key: 'education', label: 'Education' },
                  { key: 'project', label: 'Projects' },
                  { key: 'erp', label: 'ERP' },
                ].map((demo) => (
                  <button
                    key={demo.key}
                    onClick={() => loadDemo(demo.key)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: activeDemo === demo.key ? '1px solid #6366f1' : '1px solid #334155',
                      background: activeDemo === demo.key ? '#6366f120' : '#0f172a',
                      color: activeDemo === demo.key ? '#e2e8f0' : '#94a3b8',
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                      fontWeight: 500,
                    }}
                  >
                    {demo.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Categories Section */}
          <div style={{ margin: '0 8px 8px' }}>
            <button
              onClick={() => toggleSection('categories')}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: expandedSections.categories ? 'linear-gradient(135deg, #334155, #1e293b)' : 'transparent',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#e2e8f0',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                Categories
                <span style={{ fontSize: 9, padding: '2px 6px', background: '#47556920', color: '#94a3b8', borderRadius: 10 }}>{(schema.categories || []).length}</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowCategories(!showCategories); }}
                  title={showCategories ? 'Hide categories on canvas' : 'Show categories on canvas'}
                  style={{ padding: '3px 6px', border: 'none', background: showCategories ? '#6366f130' : 'transparent', color: showCategories ? '#818cf8' : '#64748b', cursor: 'pointer', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {showCategories ? (
                      <><circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/></>
                    ) : (
                      <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    )}
                  </svg>
                  {showCategories ? 'On' : 'Off'}
                </button>
                <span style={{ fontSize: 10, color: '#64748b', transform: expandedSections.categories ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
              </div>
            </button>
            {expandedSections.categories && (
              <div style={{ padding: '8px 4px', animation: 'fadeIn 0.2s ease-out' }}>
                {(schema.categories || []).length > 0 ? (
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {(schema.categories || []).map((cat) => {
                const tablesInCat = schema.tables.filter(t => t.category === cat.id);
                const fkCount = tablesInCat.reduce((acc, t) => acc + t.columns.filter(c => c.fk).length, 0);
                return (
                  <div
                    key={cat.id}
                    style={{
                      padding: '8px 10px',
                      marginBottom: 6,
                      borderRadius: 8,
                      background: `linear-gradient(135deg, ${cat.color}15, ${cat.color}08)`,
                      border: `1px solid ${cat.color}50`,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      // Select first table in category
                      if (tablesInCat.length > 0) setSelectedTable(tablesInCat[0].name);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: cat.color }} />
                      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{cat.name}</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openCategoryForEdit(cat); }}
                        title="Edit category"
                        style={{ padding: '4px 6px', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center' }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                        title="Delete category"
                        style={{ padding: '4px 6px', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center' }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#94a3b8' }}>
                      <span>{tablesInCat.length} tables</span>
                      <span>{fkCount} FKs</span>
                    </div>
                    {tablesInCat.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {tablesInCat.slice(0, 4).map(t => (
                          <span
                            key={t.name}
                            onClick={(e) => { e.stopPropagation(); setSelectedTable(t.name); }}
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: t.color || '#6366f1',
                              color: '#fff',
                              fontSize: 9,
                              cursor: 'pointer',
                            }}
                          >
                            {t.name}
                          </span>
                        ))}
                        {tablesInCat.length > 4 && (
                          <span style={{ padding: '2px 6px', fontSize: 9, color: '#64748b' }}>+{tablesInCat.length - 4} more</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Uncategorized section */}
              {schema.tables.filter(t => !t.category).length > 0 && (
                <div style={{
                  padding: '8px 10px',
                  marginBottom: 6,
                  borderRadius: 8,
                  background: '#0f172a',
                  border: '1px dashed #334155',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: '#475569' }} />
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#94a3b8' }}>Uncategorized</div>
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>
                    {schema.tables.filter(t => !t.category).length} tables not assigned
                  </div>
                </div>
              )}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: 16, background: '#0f172a', borderRadius: 6, border: '1px dashed #334155' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" style={{ marginBottom: 8 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    <div style={{ marginBottom: 6, fontWeight: 500, color: '#94a3b8' }}>No categories yet</div>
                    <div style={{ fontSize: 10, lineHeight: 1.5 }}>Click <strong style={{ color: '#f59e0b' }}>Auto-Group</strong> above<br/>or <strong style={{ color: '#a855f7' }}>Category</strong> to create</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tables Section */}
          <div style={{ margin: '0 8px 8px' }}>
            <button
              onClick={() => toggleSection('tables')}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: expandedSections.tables ? 'linear-gradient(135deg, #334155, #1e293b)' : 'transparent',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#e2e8f0',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/></svg>
                Tables
                <span style={{ fontSize: 9, padding: '2px 6px', background: '#47556920', color: '#94a3b8', borderRadius: 10 }}>{schema.tables.length}</span>
              </span>
              <span style={{ fontSize: 10, color: '#64748b', transform: expandedSections.tables ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
            </button>
            {expandedSections.tables && (
              <div style={{ padding: '8px 4px', maxHeight: 300, overflow: 'auto', animation: 'fadeIn 0.2s ease-out' }}>
                {schema.tables.length > 0 ? schema.tables.map((t) => {
                  const tableCat = (schema.categories || []).find(c => c.id === t.category);
                  return (
                    <div
                      key={t.name}
                      onClick={() => setSelectedTable(t.name)}
                      style={{
                        padding: '10px 12px',
                        marginBottom: 6,
                        borderRadius: 6,
                        background: selectedTable === t.name ? '#334155' : '#0f172a',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        transition: 'all 0.2s',
                        borderLeft: tableCat ? `3px solid ${tableCat.color}` : '3px solid transparent',
                        border: selectedTable === t.name ? '1px solid #475569' : '1px solid #1e293b',
                      }}
                    >
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: t.color || '#6366f1' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 12, color: selectedTable === t.name ? '#e2e8f0' : '#94a3b8' }}>{t.name}</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                          {t.columns.length} cols
                          {t.columns.filter(c => c.pk).length > 0 && <span style={{ marginLeft: 4, color: '#fbbf24' }}>PK {t.columns.filter(c => c.pk).length}</span>}
                          {t.columns.filter(c => c.fk).length > 0 && <span style={{ marginLeft: 4, color: '#38bdf8' }}>FK {t.columns.filter(c => c.fk).length}</span>}
                        </div>
                      </div>
                      {/* Quick actions */}
                      <div style={{ display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => duplicateTable(t.name)} title="Duplicate" style={{ padding: '4px 6px', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 10, borderRadius: 4 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button onClick={() => deleteTable(t.name)} title="Delete" style={{ padding: '4px 6px', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 10, borderRadius: 4 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  );
                }) : (
                  <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: 20, background: '#0f172a', borderRadius: 6, border: '1px dashed #334155' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" style={{ marginBottom: 10 }}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/></svg>
                    <div style={{ marginBottom: 6, fontWeight: 500, color: '#94a3b8' }}>No tables yet</div>
                    <div style={{ fontSize: 10, lineHeight: 1.5 }}>Use the chat or Add Table</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Export Section */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #334155', background: '#0f172a' }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* View/Edit Code Button */}
            <button
              onClick={openSqlViewer}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid #6366f140',
                background: '#6366f115',
                color: '#a5b4fc',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: 11,
                transition: 'all 0.2s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              View & Edit SQL Code
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={exportSQL}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 11,
                  transition: 'all 0.2s',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                SQL
              </button>
              <button
                onClick={exportJSON}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 11,
                  transition: 'all 0.2s',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                JSON
              </button>
            </div>
            <button
              onClick={exportPowerPoint}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: 6,
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#e2e8f0',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: 11,
                transition: 'all 0.2s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              Export PowerPoint
            </button>
          </div>
        </div>
      </div>

      {/* Canvas / Welcome Screen */}
      <div style={{ flex: 1, position: 'relative' }}>
        {schema.tables.length === 0 ? (
          /* Empty State Welcome Screen */
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            padding: 40,
          }}>
            <div style={{ fontSize: 64, marginBottom: 24, color: '#475569' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9', marginBottom: 8, textAlign: 'center' }}>
              Database Schema Designer
            </h1>
            <p style={{ fontSize: 16, color: '#94a3b8', marginBottom: 32, textAlign: 'center', maxWidth: 500 }}>
              Design your database visually with AI assistance. Start from a template or describe what you need.
            </p>
            
            {/* Template Grid */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>
                Choose a Template
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, maxWidth: 720 }}>
                {[
                  { key: 'ecommerce', label: 'E-Commerce', desc: 'Users, Products, Orders', color: '#6366f1' },
                  { key: 'blog', label: 'Blog', desc: 'Authors, Posts, Comments', color: '#10b981' },
                  { key: 'social', label: 'Social', desc: 'Users, Posts, Follows', color: '#f59e0b' },
                  { key: 'hr', label: 'HR', desc: 'Employees, Departments', color: '#3b82f6' },
                  { key: 'crm', label: 'CRM', desc: 'Contacts, Deals, Sales', color: '#ec4899' },
                  { key: 'inventory', label: 'Inventory', desc: 'Products, Warehouses', color: '#14b8a6' },
                  { key: 'healthcare', label: 'Healthcare', desc: 'Patients, Doctors', color: '#ef4444' },
                  { key: 'education', label: 'Education', desc: 'Students, Courses', color: '#8b5cf6' },
                  { key: 'project', label: 'Projects', desc: 'Tasks, Sprints, Teams', color: '#f97316' },
                  { key: 'erp', label: 'ERP System', desc: 'Full Enterprise Suite', color: '#64748b' },
                ].map((demo) => (
                  <button
                    key={demo.key}
                    onClick={() => loadDemo(demo.key)}
                    style={{
                      padding: '16px 12px',
                      borderRadius: 8,
                      border: '1px solid #334155',
                      background: '#1e293b',
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = demo.color;
                      e.currentTarget.style.background = `${demo.color}15`;
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = '#334155';
                      e.currentTarget.style.background = '#1e293b';
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: `${demo.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={demo.color} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                    </div>
                    <span style={{ fontWeight: 500, fontSize: 12 }}>{demo.label}</span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>{demo.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#64748b', fontSize: 13 }}>
              <span>or</span>
              <button
                onClick={createNewSchema}
                style={{
                  padding: '10px 20px',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                Start from Scratch
              </button>
              <button
                onClick={handleImportClick}
                style={{
                  padding: '10px 20px',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Import SQL
              </button>
            </div>

            <p style={{ fontSize: 11, color: '#475569', marginTop: 32, textAlign: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              Use the AI chat on the right to describe what you need in plain English
            </p>
          </div>
        ) : (
          <>
            <SchemaCanvas schema={schema} selectedTable={selectedTable} onSelectTable={setSelectedTable} onMoveTable={handleMoveTable} onMoveCategory={moveCategoryTables} showCategories={showCategories} />
            {/* Zoom hint */}
            <div style={{ position: 'absolute', bottom: 12, left: 12, fontSize: 11, color: '#64748b', background: '#1e293b', padding: '4px 8px', borderRadius: 4 }}>
              Scroll to zoom • Drag to pan • Click table to select
            </div>
          </>
        )}
      </div>

      {/* Right Panel: Details + AI Chat */}
      <div style={{ width: 360, background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #334155' }}>
        {/* Table Editor */}
        <div style={{ padding: 16, borderBottom: '1px solid #334155', flex: '0 0 auto', maxHeight: '50%', overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
            Table Editor
          </div>
          {selectedTableData ? (
            <>
              {/* Table Header with actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <input
                  type="color"
                  value={selectedTableData.color || '#6366f1'}
                  onChange={(e) => changeTableColor(selectedTableData.name, e.target.value)}
                  style={{ width: 28, height: 28, border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', padding: 0, background: '#0f172a' }}
                  title="Change table color"
                />
                <input
                  type="text"
                  defaultValue={selectedTableData.name}
                  onBlur={(e) => renameTableManual(selectedTableData.name, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}
                />
                <button onClick={() => duplicateTable(selectedTableData.name)} title="Duplicate" style={{ padding: '6px 8px', border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', cursor: 'pointer', borderRadius: 6, fontSize: 11 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button onClick={() => deleteTable(selectedTableData.name)} title="Delete" style={{ padding: '6px 8px', border: '1px solid #dc262630', background: '#dc262610', color: '#f87171', cursor: 'pointer', borderRadius: 6, fontSize: 11 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>

              {/* Category Assignment */}
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#0f172a', borderRadius: 6, border: '1px solid #334155' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <span style={{ fontSize: 11, color: '#64748b' }}>Category:</span>
                <select
                  value={selectedTableData.category || ''}
                  onChange={(e) => assignTableToCategory(selectedTableData.name, e.target.value || null)}
                  style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 11 }}
                >
                  <option value="">None</option>
                  {(schema.categories || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowCategoryModal(true)}
                  title="Create new category"
                  style={{ padding: '4px 8px', border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', borderRadius: 4, fontSize: 10 }}
                >
                  +
                </button>
              </div>

              {/* Columns */}
              <div style={{ fontSize: 12 }}>
                {selectedTableData.columns.map((c, i) => (
                  <div key={c.name} style={{ padding: '8px 0', borderBottom: '1px solid #1e293b' }}>
                    {/* Main row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {/* Reorder */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        <button onClick={() => moveColumnUp(selectedTableData.name, i)} disabled={i === 0} style={{ padding: '0 4px', border: 'none', background: 'none', color: i === 0 ? '#334155' : '#64748b', cursor: i === 0 ? 'default' : 'pointer', fontSize: 8, lineHeight: 1 }}>▲</button>
                        <button onClick={() => moveColumnDown(selectedTableData.name, i)} disabled={i >= selectedTableData.columns.length - 1} style={{ padding: '0 4px', border: 'none', background: 'none', color: i >= selectedTableData.columns.length - 1 ? '#334155' : '#64748b', cursor: i >= selectedTableData.columns.length - 1 ? 'default' : 'pointer', fontSize: 8, lineHeight: 1 }}>▼</button>
                      </div>
                      {/* Icon */}
                      <span style={{ width: 18, fontSize: 10, color: c.pk ? '#fbbf24' : c.fk ? '#38bdf8' : c.unique ? '#a78bfa' : '#475569', fontWeight: 600 }}>
                        {c.pk ? 'PK' : c.fk ? 'FK' : c.unique ? 'UQ' : '•'}
                      </span>
                      {/* Name */}
                      <span style={{ flex: 1, color: c.pk ? '#fbbf24' : c.fk ? '#38bdf8' : '#e2e8f0', fontSize: 11, fontWeight: 500 }}>{c.name}</span>
                      {/* Type */}
                      <span style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 10, background: '#0f172a', padding: '2px 6px', borderRadius: 3 }}>{c.type}</span>
                      {/* Quick toggles */}
                      <button onClick={() => toggleColumnPk(selectedTableData.name, c.name)} title="Toggle Primary Key" style={{ padding: '2px 4px', border: 'none', background: c.pk ? '#fbbf2430' : 'transparent', color: c.pk ? '#fbbf24' : '#475569', cursor: 'pointer', borderRadius: 3, fontSize: 9, fontWeight: 600 }}>PK</button>
                      <button onClick={() => toggleColumnUnique(selectedTableData.name, c.name)} title="Toggle Unique" style={{ padding: '2px 4px', border: 'none', background: c.unique ? '#a78bfa30' : 'transparent', color: c.unique ? '#a78bfa' : '#475569', cursor: 'pointer', borderRadius: 3, fontSize: 9, fontWeight: 600 }}>UQ</button>
                      <button onClick={() => toggleColumnNullable(selectedTableData.name, c.name)} title="Toggle Nullable" style={{ padding: '2px 4px', border: 'none', background: c.nullable ? 'transparent' : '#ef444430', color: c.nullable ? '#475569' : '#f87171', cursor: 'pointer', borderRadius: 3, fontSize: 9, fontWeight: 600 }}>{c.nullable ? 'N' : 'R'}</button>
                      {/* Edit */}
                      <button onClick={() => { setEditingColumn({ tableName: selectedTableData.name, column: { ...c }, index: i }); setShowEditColumnModal(true); }} title="Edit column" style={{ padding: '2px 4px', border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: 10 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      </button>
                      {/* Delete */}
                      <button onClick={() => deleteColumn(selectedTableData.name, c.name)} title="Delete column" style={{ padding: '2px 4px', border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}>×</button>
                    </div>
                    {/* FK Reference Row - shown below if column has FK */}
                    {c.fk && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, marginLeft: 28, padding: '6px 10px', background: '#38bdf810', borderRadius: 4, border: '1px solid #38bdf830' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 500 }}>References:</span>
                        <span style={{ fontSize: 11, color: '#e2e8f0', fontFamily: 'monospace', background: '#0f172a', padding: '2px 8px', borderRadius: 3 }}>
                          {c.fk.table}.{c.fk.column}
                        </span>
                        <div style={{ flex: 1 }} />
                        <button
                          onClick={() => removeFk(selectedTableData.name, c.name)}
                          title="Remove foreign key"
                          style={{ padding: '3px 6px', border: '1px solid #ef444440', background: '#ef444420', color: '#f87171', cursor: 'pointer', borderRadius: 3, fontSize: 9, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Column Button */}
              <button
                onClick={() => setShowAddColumnModal(true)}
                style={{ width: '100%', marginTop: 12, padding: '10px 12px', borderRadius: 6, border: '1px dashed #334155', background: 'transparent', color: '#64748b', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                Add Column
              </button>
            </>
          ) : (
            <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: 24, background: '#0f172a', borderRadius: 8, border: '1px dashed #334155' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" style={{ marginBottom: 12 }}><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
              <div>Select a table to edit</div>
            </div>
          )}
        </div>

        {/* AI Chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #334155', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            AI Assistant
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 12, maxHeight: 250 }}>
            {chatMessages.map((m, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 8,
                  background: m.role === 'user' ? '#334155' : '#0f172a',
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                  border: m.role === 'user' ? 'none' : '1px solid #334155',
                  display: 'flex',
                  gap: 10,
                }}
              >
                <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, background: m.role === 'user' ? '#475569' : '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {m.role === 'user' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><path d="M7.5 13a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0zm6 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z"/></svg>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.role === 'user' ? 'You' : 'Assistant'}</div>
                  <div style={{ color: '#e2e8f0', lineHeight: 1.5 }}>{m.content}</div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding: 12, borderTop: '1px solid #334155', background: '#0f172a' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe changes..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #334155',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleChat}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#6366f1',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
