export interface Column {
  name: string;
  type: string;
  pk?: boolean;
  fk?: { table: string; column: string };
  nullable?: boolean;
  unique?: boolean;
  indexed?: boolean;
  defaultValue?: string;
}

export interface Table {
  name: string;
  columns: Column[];
  x?: number;
  y?: number;
  color?: string;
  category?: string;
}

export interface TableCategory {
  id: string;
  name: string;
  color: string;
  description?: string;
  collapsed?: boolean;
}

export interface Schema {
  tables: Table[];
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  categories?: TableCategory[];
}

export interface SavedSchema {
  id: string;
  name: string;
  schema: Schema;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type SidebarTab = 'home' | 'design' | 'organize' | 'templates' | 'projects' | 'sql' | 'export';
export type ThemeMode = 'light' | 'dark';
export type MobileWorkspaceView = 'tools' | 'canvas' | 'details' | 'assistant';
export type SqlWorkspacePanel = 'editor' | 'results';
export type RightPanelView = 'editor' | 'assistant';

export interface SqlDiagnostic {
  code: string;
  line: number;
  column?: number;
  message: string;
  suggestion: string;
  excerpt?: string;
}

export interface SqlRunResult {
  status: 'success' | 'error';
  title: string;
  detail: string;
  diagnostics?: SqlDiagnostic[];
  assistantGuidance?: string;
}

export type ConfirmationTone = 'danger' | 'warning' | 'info';

export interface ConfirmationRequest {
  title: string;
  description: string;
  subject: string;
  impact: string;
  confirmLabel: string;
  tone: ConfirmationTone;
  recoverable?: boolean;
  onConfirm: () => void;
}

export interface WorkspaceNotice {
  id: number;
  title: string;
  detail: string;
  tone: 'success' | 'info' | 'warning';
}
