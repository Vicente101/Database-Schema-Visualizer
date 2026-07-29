const TABLE_ACCENTS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#3b82f6',
  '#84cc16',
  '#f43f5e',
  '#0ea5e9',
  '#a855f7',
];

export function randomColor(): string {
  return TABLE_ACCENTS[Math.floor(Math.random() * TABLE_ACCENTS.length)];
}
