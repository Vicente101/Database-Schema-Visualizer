import type { SavedSchema, Schema } from '../types/workspace';

const SCHEMA_STORAGE_KEY = 'schema_visualizer_saved_schemas';
export const THEME_STORAGE_KEY = 'schema_visualizer_theme';

export function getSavedSchemas(): SavedSchema[] {
  try {
    const data = localStorage.getItem(SCHEMA_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveSchemaToStorage(name: string, schema: Schema): SavedSchema {
  const saved = getSavedSchemas();
  const now = new Date().toISOString();
  const existing = saved.find((item) => item.name === name);

  if (existing) {
    existing.schema = schema;
    existing.updatedAt = now;
    localStorage.setItem(SCHEMA_STORAGE_KEY, JSON.stringify(saved));
    return existing;
  }

  const newEntry: SavedSchema = {
    id: `schema_${Date.now()}`,
    name,
    schema,
    createdAt: now,
    updatedAt: now,
  };
  saved.push(newEntry);
  localStorage.setItem(SCHEMA_STORAGE_KEY, JSON.stringify(saved));
  return newEntry;
}

export function deleteSchemaFromStorage(id: string): void {
  const saved = getSavedSchemas().filter((item) => item.id !== id);
  localStorage.setItem(SCHEMA_STORAGE_KEY, JSON.stringify(saved));
}
