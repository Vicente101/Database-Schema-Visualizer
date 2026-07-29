import React, { useState, useRef, useEffect, useMemo } from 'react';
import AddCircleIcon from '@solar-icons/react/icons/ui/AddCircle';
import AddFolderIcon from '@solar-icons/react/icons/folders/AddFolder';
import AltArrowDownIcon from '@solar-icons/react/icons/arrows/AltArrowDown';
import BoltCircleIcon from '@solar-icons/react/icons/ui/BoltCircle';
import ChatRoundDotsIcon from '@solar-icons/react/icons/messages/ChatRoundDots';
import CheckSquareIcon from '@solar-icons/react/icons/ui/CheckSquare';
import CloseCircleIcon from '@solar-icons/react/icons/ui/CloseCircle';
import CodeFileIcon from '@solar-icons/react/icons/files/CodeFile';
import CopyIcon from '@solar-icons/react/icons/ui/Copy';
import DatabaseIcon from '@solar-icons/react/icons/ui/Database';
import ExportIcon from '@solar-icons/react/icons/arrows-action/Export';
import UndoLeftIcon from '@solar-icons/react/icons/arrows-action/UndoLeft';
import UndoRightIcon from '@solar-icons/react/icons/arrows-action/UndoRight';
import EyeIcon from '@solar-icons/react/icons/security/Eye';
import EyeClosedIcon from '@solar-icons/react/icons/security/EyeClosed';
import FileCheckIcon from '@solar-icons/react/icons/files/FileCheck';
import FileTextIcon from '@solar-icons/react/icons/files/FileText';
import FolderOpenIcon from '@solar-icons/react/icons/folders/FolderOpen';
import FolderWithFilesIcon from '@solar-icons/react/icons/folders/FolderWithFiles';
import ImportIcon from '@solar-icons/react/icons/arrows-action/Import';
import LayersMinimalisticIcon from '@solar-icons/react/icons/tools/LayersMinimalistic';
import LinkRoundAngleIcon from '@solar-icons/react/icons/text-formatting/LinkRoundAngle';
import MagicStick2Icon from '@solar-icons/react/icons/ui/MagicStick2';
import Pen2Icon from '@solar-icons/react/icons/messages/Pen2';
import PresentationGraphIcon from '@solar-icons/react/icons/business/PresentationGraph';
import RulerIcon from '@solar-icons/react/icons/tools/Ruler';
import TrashBinMinimalisticIcon from '@solar-icons/react/icons/ui/TrashBinMinimalistic';
import EraserSquareIcon from '@solar-icons/react/icons/text-formatting/EraserSquare';
import Widget5Icon from '@solar-icons/react/icons/settings/Widget5';
import { AssistantPanel } from './components/assistant/AssistantPanel';
import { SchemaCanvas } from './components/canvas/SchemaCanvas';
import { WorkspaceDialog } from './components/dialogs/WorkspaceDialog';
import { TableEditorPanel } from './components/editor/TableEditorPanel';
import { HomeSidebar } from './components/home/HomeSidebar';
import { HomeWorkspace } from './components/home/HomeWorkspace';
import { InspectorSwitcher } from './components/inspector/InspectorSwitcher';
import {
  MobileDrawerHeader,
  MobileWorkspaceHeader,
} from './components/navigation/MobileWorkspaceHeader';
import { PrimaryNavigationRail } from './components/navigation/PrimaryNavigationRail';
import { SqlSidebar } from './components/sql/SqlSidebar';
import { SqlWorkspace } from './components/sql/SqlWorkspace';
import { TemplateSidebar } from './components/templates/TemplateSidebar';
import { DEMO_SCHEMAS } from './data/schemaTemplates';
import {
  aiModifySchema,
  detectIntent,
  normalizeText,
  type Intent,
} from './services/assistant/schemaAssistant';
import {
  deleteSchemaFromStorage,
  getSavedSchemas,
  saveSchemaToStorage,
  THEME_STORAGE_KEY,
} from './services/storage';
import { autoLayout, layoutTablesByCategory } from './services/layout/schemaLayout';
import { parseDDL, validateSqlForWorkspace } from './services/sql/parser';
import {
  downloadSchemaJson,
  downloadSchemaSql,
  generateSchemaSql,
} from './services/export/schemaExport';
import type {
  ChatMessage,
  Column,
  ConfirmationRequest,
  ConfirmationTone,
  MobileWorkspaceView,
  RightPanelView,
  SavedSchema,
  Schema,
  SidebarTab,
  SqlRunResult,
  SqlWorkspacePanel,
  Table,
  TableCategory,
  ThemeMode,
  WorkspaceNotice,
} from './types/workspace';
import { randomColor } from './utils/color';
import { stripDecorativeIcons } from './utils/text';

// ─────────────────────────────────────────────────────────────────────────────
// DDL Parser (import SQL)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Demo Schemas
// ─────────────────────────────────────────────────────────────────────────────
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
  const [sqlCode, setSqlCode] = useState(''); // Editable SQL code
  const [sqlRunResult, setSqlRunResult] = useState<SqlRunResult | null>(null);
  const [sqlWorkspacePanel, setSqlWorkspacePanel] = useState<SqlWorkspacePanel>('editor');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>('home');
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>('assistant');
  const [mobileWorkspaceView, setMobileWorkspaceView] = useState<MobileWorkspaceView>('canvas');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileSpeedDialOpen, setMobileSpeedDialOpen] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);
  const [workspaceNotices, setWorkspaceNotices] = useState<WorkspaceNotice[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [assistantThinking, setAssistantThinking] = useState(false);
  // Sidebar section expand/collapse states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    actions: true,
    templates: true,
    categories: true,
    tables: true,
  });
  const toggleSection = (section: string) => setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  const openTableEditor = (tableName: string | null) => {
    setSelectedTable(tableName);
    if (!tableName) return;
    setRightPanelView('editor');
    if (window.matchMedia?.('(max-width: 920px)').matches) {
      setMobileDrawerOpen(false);
      setMobileSpeedDialOpen(false);
      setMobileWorkspaceView('details');
    }
  };
  const openAssistantPanel = () => {
    setRightPanelView('assistant');
    if (window.matchMedia?.('(max-width: 920px)').matches) {
      setMobileDrawerOpen(false);
      setMobileSpeedDialOpen(false);
      setMobileWorkspaceView('assistant');
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mobileSpeedDialTriggerRef = useRef<HTMLButtonElement>(null);
  const undoStackRef = useRef<Schema[]>([]);
  const redoStackRef = useRef<Schema[]>([]);
  const currentSchemaRef = useRef<Schema>({ tables: [], name: '' });
  const applyingHistoryRef = useRef(false);
  const lastHistoryAtRef = useRef(0);
  const savedFingerprintRef = useRef(JSON.stringify({ tables: [], name: '' }));
  const pendingProjectActionRef = useRef<(() => void) | null>(null);
  const afterSaveActionRef = useRef<(() => void) | null>(null);
  const noticeIdRef = useRef(0);
  const schemaFingerprint = useMemo(() => JSON.stringify(schema), [schema]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const closeMobileLayer = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmationRequest) setConfirmationRequest(null);
      else if (showUnsavedModal) {
        pendingProjectActionRef.current = null;
        setShowUnsavedModal(false);
      }
      else if (showAddFkModal) setShowAddFkModal(false);
      else if (showEditColumnModal) {
        setShowEditColumnModal(false);
        setEditingColumn(null);
      }
      else if (showAddColumnModal) setShowAddColumnModal(false);
      else if (showCategoryModal) {
        setShowCategoryModal(false);
        setEditingCategory(null);
      }
      else if (showAddTableModal) setShowAddTableModal(false);
      else if (showLoadModal) setShowLoadModal(false);
      else if (showSaveModal) {
        afterSaveActionRef.current = null;
        setShowSaveModal(false);
      }
      else if (mobileDrawerOpen) setMobileDrawerOpen(false);
      else if (mobileSpeedDialOpen) setMobileSpeedDialOpen(false);
      else if (mobileWorkspaceView !== 'canvas') setMobileWorkspaceView('canvas');
    };
    window.addEventListener('keydown', closeMobileLayer);
    return () => window.removeEventListener('keydown', closeMobileLayer);
  }, [
    confirmationRequest,
    showUnsavedModal,
    showAddFkModal,
    showEditColumnModal,
    showAddColumnModal,
    showCategoryModal,
    showAddTableModal,
    showLoadModal,
    showSaveModal,
    mobileDrawerOpen,
    mobileSpeedDialOpen,
    mobileWorkspaceView,
  ]);

  useEffect(() => {
    const sectionByTab: Partial<Record<SidebarTab, string>> = {
      design: 'actions',
      organize: 'categories',
      templates: 'templates',
    };
    const section = sectionByTab[activeSidebarTab];
    if (section) {
      setExpandedSections((current) => ({ ...current, [section]: true, ...(activeSidebarTab === 'design' ? { tables: true } : {}) }));
    }
  }, [activeSidebarTab]);

  useEffect(() => {
    const previous = currentSchemaRef.current;
    const previousFingerprint = JSON.stringify(previous);
    if (previousFingerprint === schemaFingerprint) {
      applyingHistoryRef.current = false;
      return;
    }

    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
    } else {
      const now = Date.now();
      if (now - lastHistoryAtRef.current > 350) {
        undoStackRef.current = [...undoStackRef.current.slice(-49), previous];
      }
      redoStackRef.current = [];
      lastHistoryAtRef.current = now;
      setHistoryVersion((version) => version + 1);
    }

    currentSchemaRef.current = JSON.parse(schemaFingerprint);
    setIsDirty(schema.tables.length > 0 && schemaFingerprint !== savedFingerprintRef.current);
  }, [schema, schemaFingerprint]);

  useEffect(() => {
    const preventAccidentalClose = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventAccidentalClose);
    return () => window.removeEventListener('beforeunload', preventAccidentalClose);
  }, [isDirty]);

  const replaceProject = (nextSchema: Schema, saved = false) => {
    const normalizedSchema = {
      ...nextSchema,
      categories: nextSchema.categories?.map((category) => ({
        ...category,
        name: stripDecorativeIcons(category.name).trim(),
      })),
    };
    const nextFingerprint = JSON.stringify(normalizedSchema);
    applyingHistoryRef.current = true;
    currentSchemaRef.current = JSON.parse(nextFingerprint);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryVersion((version) => version + 1);
    savedFingerprintRef.current = saved ? nextFingerprint : '';
    setIsDirty(!saved && normalizedSchema.tables.length > 0);
    setSchema(normalizedSchema);
  };

  const requestProjectTransition = (action: () => void) => {
    if (isDirty && schema.tables.length > 0) {
      pendingProjectActionRef.current = action;
      setShowUnsavedModal(true);
      return;
    }
    action();
  };

  const showWorkspaceNotice = (
    title: string,
    detail: string,
    tone: WorkspaceNotice['tone'] = 'success',
  ) => {
    const id = ++noticeIdRef.current;
    setWorkspaceNotices((current) => [...current.slice(-2), { id, title, detail, tone }]);
    window.setTimeout(() => {
      setWorkspaceNotices((current) => current.filter((notice) => notice.id !== id));
    }, 4200);
  };

  const confirmWorkspaceAction = (request: ConfirmationRequest) => {
    setMobileSpeedDialOpen(false);
    setConfirmationRequest(request);
  };

  const runConfirmedWorkspaceAction = () => {
    const action = confirmationRequest?.onConfirm;
    setConfirmationRequest(null);
    action?.();
  };

  const cancelWorkspaceAction = () => setConfirmationRequest(null);

  const closeMobileSpeedDial = (restoreFocus = false) => {
    if (restoreFocus) mobileSpeedDialTriggerRef.current?.focus({ preventScroll: true });
    setMobileSpeedDialOpen(false);
  };

  const closeMobileWorkspacePopup = () => {
    setMobileWorkspaceView('canvas');
    closeMobileSpeedDial();
    window.requestAnimationFrame(() => {
      mobileSpeedDialTriggerRef.current?.focus({ preventScroll: true });
    });
  };

  const undo = () => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current = [...redoStackRef.current.slice(-49), currentSchemaRef.current];
    applyingHistoryRef.current = true;
    currentSchemaRef.current = previous;
    setSchema(previous);
    setHistoryVersion((version) => version + 1);
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current = [...undoStackRef.current.slice(-49), currentSchemaRef.current];
    applyingHistoryRef.current = true;
    currentSchemaRef.current = next;
    setSchema(next);
    setHistoryVersion((version) => version + 1);
  };

  const commitClearSchema = () => {
    if (schema.tables.length === 0) return;
    setSchema((current) => ({ ...current, tables: [], categories: [] }));
    setSelectedTable(null);
    setChatMessages((messages) => [
      ...messages,
      { role: 'assistant', content: 'The canvas is clear. You can undo this action if you need the schema back.' },
    ]);
    showWorkspaceNotice('Canvas cleared', 'All tables were removed. Undo remains available.', 'warning');
  };

  const clearSchema = () => {
    if (schema.tables.length === 0) return;
    confirmWorkspaceAction({
      title: 'Clear the entire canvas?',
      description: 'Every table, category, and visible relationship will be removed from this project.',
      subject: schema.name || 'Untitled Schema',
      impact: `${schema.tables.length} tables · ${(schema.categories || []).length} categories`,
      confirmLabel: 'Clear canvas',
      tone: 'danger',
      recoverable: true,
      onConfirm: commitClearSchema,
    });
  };

  const clearAssistantConversation = () => {
    if (chatMessages.length <= 1) return;
    confirmWorkspaceAction({
      title: 'Clear the Assistant history?',
      description: 'This removes the visible conversation only. The current database schema will not be changed.',
      subject: 'Assistant conversation',
      impact: `${chatMessages.length} message${chatMessages.length === 1 ? '' : 's'}`,
      confirmLabel: 'Clear conversation',
      tone: 'info',
      recoverable: false,
      onConfirm: () => {
        setChatMessages([{ role: 'assistant', content: 'Conversation cleared. What would you like to change?' }]);
        showWorkspaceNotice('Conversation cleared', 'The schema and canvas were left unchanged.', 'info');
      },
    });
  };

  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [historyVersion]);

  const handleMoveTable = (name: string, x: number, y: number) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => (t.name === name ? { ...t, x, y } : t)),
    }));
  };

  const loadDemo = (name: string) => {
    requestProjectTransition(() => {
      const source = DEMO_SCHEMAS[name];
      const categories = source.categories || [];
      const demoTables = JSON.parse(JSON.stringify(source.tables)) as Table[];
      const demoSchema: Schema = {
        ...JSON.parse(JSON.stringify(source)),
        name: source.name || `${name.charAt(0).toUpperCase()}${name.slice(1)} Schema`,
        tables: categories.length ? layoutTablesByCategory(demoTables, categories) : autoLayout(demoTables),
      };
      setActiveDemo(name);
      replaceProject(demoSchema);
      setActiveSidebarTab('design');
      setMobileWorkspaceView('canvas');
      setMobileDrawerOpen(false);
      setSelectedTable(null);
      setChatMessages([
        { role: 'assistant', content: `Loaded **${name}** as a new project. I can add tables, connect relationships, or review the design.` },
      ]);
    });
  };

  const handleChat = (prompt?: string, destructiveActionConfirmed = false) => {
    const request = typeof prompt === 'string' ? prompt : chatInput;
    if (!request.trim() || assistantThinking) return;
    const requestedIntent = detectIntent(normalizeText(request));
    const destructiveAssistantIntents: Intent[] = ['clear', 'remove_table', 'remove_column', 'remove_fk'];
    if (!destructiveActionConfirmed && destructiveAssistantIntents.includes(requestedIntent) && schema.tables.length > 0) {
      const isFullClear = requestedIntent === 'clear';
      confirmWorkspaceAction({
        title: isFullClear ? 'Let the Assistant clear the schema?' : 'Approve this destructive Assistant change?',
        description: isFullClear
          ? 'The Assistant interpreted this request as removing every table and category from the current canvas.'
          : 'The Assistant interpreted this request as removing part of the current database design.',
        subject: request.length > 72 ? `${request.slice(0, 69)}...` : request,
        impact: isFullClear
          ? `${schema.tables.length} tables · ${(schema.categories || []).length} categories`
          : 'A table, column, or relationship may be removed',
        confirmLabel: isFullClear ? 'Approve clear request' : 'Approve Assistant change',
        tone: isFullClear || requestedIntent === 'remove_table' ? 'danger' : 'warning',
        recoverable: true,
        onConfirm: () => handleChat(request, true),
      });
      return;
    }
    openAssistantPanel();
    const userMsg: ChatMessage = { role: 'user', content: request };
    setChatMessages((m) => [...m, userMsg]);
    setChatInput('');
    setAssistantThinking(true);

    window.setTimeout(() => {
    const { schema: newSchema, response } = aiModifySchema(schema, request);

    // Handle auto-categorize signal
    if (response === '__AUTO_CATEGORIZE__') {
      setAssistantThinking(false);
      autoCategorizeTables();
      return;
    }

    // Preserve categories and use category-aware layout when categories exist
    const hasCategories = (newSchema.categories && newSchema.categories.length > 0) || (schema.categories && schema.categories.length > 0);
    const mergedCategories = newSchema.categories || schema.categories || [];

    // Ensure all tables have positions - check if any tables are missing x/y coordinates
    const tablesNeedLayout = newSchema.tables.some(t => t.x === undefined || t.y === undefined);

    let layoutedTables;
    if (tablesNeedLayout) {
      // Some tables don't have positions, need to layout all tables
      layoutedTables = hasCategories
        ? layoutTablesByCategory(newSchema.tables, mergedCategories)
        : autoLayout(newSchema.tables);
    } else {
      // All tables already have positions, preserve them
      layoutedTables = newSchema.tables;
    }

    const finalSchema = {
      ...newSchema,
      categories: mergedCategories,
      tables: layoutedTables
    };

    setSchema(finalSchema);
    if (activeSidebarTab === 'home' && finalSchema.tables.length > 0) {
      setActiveSidebarTab('design');
    }
    setChatMessages((m) => [...m, { role: 'assistant', content: response }]);
    if (destructiveAssistantIntents.includes(requestedIntent)) {
      showWorkspaceNotice(
        requestedIntent === 'clear' ? 'Assistant cleared the canvas' : 'Assistant change applied',
        'The approved request was applied. Undo remains available.',
        'warning',
      );
    }
    setAssistantThinking(false);
    }, 180);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChat();
    }
  };

  // ─── New Schema ────────────────────────────────────────────────────────────
  const createNewSchema = () => {
    requestProjectTransition(() => {
      const newSchema: Schema = {
        name: 'Untitled Schema',
        tables: autoLayout([
          { name: 'table1', columns: [{ name: 'id', type: 'INT', pk: true }], color: '#38bdf8' },
        ]),
        categories: [],
      };
      replaceProject(newSchema);
      setActiveSidebarTab('design');
      setMobileWorkspaceView('canvas');
      setMobileDrawerOpen(false);
      setActiveDemo('');
      setSelectedTable('table1');
      setChatMessages([
        { role: 'assistant', content: 'Your new schema is ready. Rename the starter table or tell me what you want to model.' },
      ]);
    });
  };

  // ─── Import SQL ────────────────────────────────────────────────────────────
  const handleImportClick = () => {
    requestProjectTransition(() => fileInputRef.current?.click());
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
            const categories = Array.isArray(parsed.categories) ? parsed.categories : [];
            const importedTables: Table[] = parsed.tables.map((t: any) => ({
              name: t.name,
              color: t.color || '#38bdf8',
              x: t.x,
              y: t.y,
              category: t.category,
              columns: (t.columns || []).map((c: any) => ({
                name: c.name,
                type: c.type || 'VARCHAR(255)',
                pk: c.pk || c.primaryKey || false,
                unique: c.unique || false,
                indexed: c.indexed || c.isIndexed || false,
                nullable: c.nullable !== false,
                fk: c.fk || c.foreignKey || (c.references ? { table: c.references.table || c.references, column: c.references.column || 'id' } : undefined),
              })),
            }));
            const hasSavedPositions = importedTables.every((table) => table.x !== undefined && table.y !== undefined);
            const importedSchema: Schema = {
              name: parsed.name || file.name.replace('.json', ''),
              categories,
              tables: hasSavedPositions
                ? importedTables
                : categories.length
                  ? layoutTablesByCategory(importedTables, categories)
                  : autoLayout(importedTables),
            };
            replaceProject(importedSchema);
            setActiveSidebarTab('design');
            setMobileWorkspaceView('canvas');
            setMobileDrawerOpen(false);
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
                indexed: c.indexed || c.isIndexed || false,
                nullable: c.nullable !== false && c.isNullable !== false,
                fk: c.fk || c.foreignKey || (c.references ? { table: c.references.table || c.references, column: c.references.column || 'id' } : undefined),
              })),
            }));
            replaceProject({ name: file.name.replace('.json', ''), tables: autoLayout(tables) });
            setActiveSidebarTab('design');
            setMobileWorkspaceView('canvas');
            setMobileDrawerOpen(false);
            setActiveDemo('');
            setSelectedTable(null);
            setChatMessages([
              { role: 'assistant', content: `📄 Imported **${tables.length} table(s)** from \`${file.name}\`!` },
            ]);
            e.target.value = '';
            return;
          }
        } catch (jsonError) {
          // The same file may contain DDL rather than JSON; continue with SQL parsing.
        }
      }

      // Try SQL DDL parsing
      const tables = parseDDL(content);
      if (tables.length > 0) {
        // Calculate relationship count
        let relCount = 0;
        tables.forEach(t => t.columns.forEach(c => { if (c.fk) relCount++; }));

        replaceProject({ name: file.name.replace(/\.(sql|txt)$/i, ''), tables: autoLayout(tables) });
        setActiveSidebarTab('design');
        setMobileWorkspaceView('canvas');
        setMobileDrawerOpen(false);
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
    const namedSchema = { ...schema, name, updatedAt: new Date().toISOString() };
    saveSchemaToStorage(name, namedSchema);
    setSavedSchemas(getSavedSchemas());
    const savedFingerprint = JSON.stringify(namedSchema);
    applyingHistoryRef.current = true;
    currentSchemaRef.current = JSON.parse(savedFingerprint);
    savedFingerprintRef.current = savedFingerprint;
    setSchema(namedSchema);
    setIsDirty(false);
    setShowSaveModal(false);
    setChatMessages((m) => [
      ...m,
      { role: 'assistant', content: `Saved **"${name}"**. Your latest layout, categories, and relationships are protected.` },
    ]);
    showWorkspaceNotice('Project saved', `"${name}" is stored locally with the latest schema state.`, 'success');
    const afterSave = afterSaveActionRef.current;
    afterSaveActionRef.current = null;
    afterSave?.();
  };

  const saveBeforeProjectTransition = () => {
    afterSaveActionRef.current = pendingProjectActionRef.current;
    pendingProjectActionRef.current = null;
    setShowUnsavedModal(false);
    handleSaveSchema();
  };

  const discardAndContinue = () => {
    const action = pendingProjectActionRef.current;
    pendingProjectActionRef.current = null;
    setShowUnsavedModal(false);
    action?.();
  };

  const cancelProjectTransition = () => {
    pendingProjectActionRef.current = null;
    setShowUnsavedModal(false);
  };

  // ─── Load Schema ───────────────────────────────────────────────────────────
  const handleLoadSchema = () => {
    setSavedSchemas(getSavedSchemas()); // Refresh list
    setShowLoadModal(true);
  };

  const loadSavedSchema = (saved: SavedSchema) => {
    setShowLoadModal(false);
    requestProjectTransition(() => {
      const savedProject = JSON.parse(JSON.stringify(saved.schema)) as Schema;
      replaceProject(savedProject, true);
      setActiveSidebarTab('design');
      setMobileWorkspaceView('canvas');
      setMobileDrawerOpen(false);
      setActiveDemo('');
      setSelectedTable(null);
      setChatMessages([
        { role: 'assistant', content: `Loaded **"${saved.name}"**. The project is up to date and ready to edit.` },
      ]);
    });
  };

  const deleteSaved = (id: string) => {
    const saved = savedSchemas.find((candidate) => candidate.id === id);
    if (!saved) return;
    confirmWorkspaceAction({
      title: 'Remove this saved project?',
      description: 'The local project snapshot will be permanently removed from this browser.',
      subject: saved.name,
      impact: `${saved.schema.tables.length} saved tables`,
      confirmLabel: 'Remove project',
      tone: 'danger',
      recoverable: false,
      onConfirm: () => {
        deleteSchemaFromStorage(id);
        setSavedSchemas(getSavedSchemas());
        showWorkspaceNotice('Saved project removed', `"${saved.name}" was removed from local storage.`, 'warning');
      },
    });
  };

  // ─── Manual Table Operations ─────────────────────────────────────────────
  const addTableManual = () => {
    const cleanName = newTableName.trim();
    if (!cleanName) return;
    if (schema.tables.some((table) => table.name.toLowerCase() === cleanName.toLowerCase())) {
      showWorkspaceNotice('Table name already in use', `"${cleanName}" already exists in this schema.`, 'warning');
      return;
    }
    const newTable: Table = {
      name: cleanName,
      color: randomColor(),
      columns: [{ name: 'id', type: 'SERIAL', pk: true }],
    };
    setSchema((s) => ({ ...s, tables: autoLayout([...s.tables, newTable]) }));
    setNewTableName('');
    setShowAddTableModal(false);
    setChatMessages((m) => [...m, { role: 'assistant', content: `✅ Added table **${newTable.name}**.` }]);
    showWorkspaceNotice('Table created', `${newTable.name} is ready with a primary key.`, 'success');
  };

  const deleteTable = (tableName: string) => {
    const table = schema.tables.find((candidate) => candidate.name === tableName);
    if (!table) return;
    const dependentReferences = schema.tables.reduce(
      (count, candidate) => count + candidate.columns.filter((column) => column.fk?.table === tableName).length,
      0,
    );
    confirmWorkspaceAction({
      title: `Delete ${tableName}?`,
      description: 'The table will be removed and incoming relationships from other tables will be detached.',
      subject: tableName,
      impact: `${table.columns.length} columns · ${dependentReferences} dependent relationships`,
      confirmLabel: 'Delete table',
      tone: 'danger',
      recoverable: true,
      onConfirm: () => {
        setSchema((s) => ({
          ...s,
          tables: s.tables.filter((t) => t.name !== tableName).map((t) => ({
            ...t,
            columns: t.columns.map((c) => c.fk?.table === tableName ? { ...c, fk: undefined } : c),
          })),
        }));
        if (selectedTable === tableName) setSelectedTable(null);
        setChatMessages((m) => [...m, { role: 'assistant', content: `🗑️ Deleted table **${tableName}**.` }]);
        showWorkspaceNotice('Table removed', `${tableName} was removed. Undo remains available.`, 'warning');
      },
    });
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
    showWorkspaceNotice('Table duplicated', `${newName} was created from ${tableName}.`, 'success');
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
    showWorkspaceNotice('Category created', `${category.name} contains ${tableCount} table${tableCount === 1 ? '' : 's'}.`, 'success');
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
    if (!cat) return;
    const tableCount = schema.tables.filter((table) => table.category === categoryId).length;
    confirmWorkspaceAction({
      title: `Delete ${cat.name}?`,
      description: 'The category will be removed. Its tables will remain in the schema as uncategorized tables.',
      subject: cat.name,
      impact: `${tableCount} table${tableCount === 1 ? '' : 's'} will become uncategorized`,
      confirmLabel: 'Delete category',
      tone: 'warning',
      recoverable: true,
      onConfirm: () => {
        setSchema((s) => ({
          ...s,
          categories: (s.categories || []).filter(c => c.id !== categoryId),
          tables: s.tables.map(t => t.category === categoryId ? { ...t, category: undefined } : t),
        }));
        setChatMessages((m) => [...m, { role: 'assistant', content: `🗑️ Deleted category **"${cat.name}"**.` }]);
        showWorkspaceNotice('Category removed', `${cat.name} was removed; its tables were preserved.`, 'warning');
      },
    });
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
  const semanticPatterns: { name: string; patterns: RegExp[]; columnHints: RegExp[]; color: string; priority: number }[] = [
    { name: 'User Management', patterns: [/user/i, /account/i, /profile/i, /auth/i, /login/i, /session/i, /permission/i, /role/i, /credential/i, /member/i, /subscriber/i], columnHints: [/password/i, /email/i, /username/i, /avatar/i, /last_login/i], color: '#6366f1', priority: 10 },
    { name: 'Orders & Sales', patterns: [/order/i, /cart/i, /checkout/i, /payment/i, /invoice/i, /transaction/i, /sale/i, /purchase/i, /receipt/i, /shipment/i, /shipping/i, /delivery/i], columnHints: [/total/i, /subtotal/i, /tax/i, /discount/i, /quantity/i, /shipped/i], color: '#f59e0b', priority: 9 },
    { name: 'Products & Inventory', patterns: [/product/i, /item/i, /inventory/i, /stock/i, /sku/i, /catalog/i, /variant/i, /warehouse/i, /goods/i, /merchandise/i], columnHints: [/price/i, /cost/i, /sku/i, /barcode/i, /weight/i, /dimension/i], color: '#10b981', priority: 8 },
    { name: 'Content & Media', patterns: [/post/i, /article/i, /blog/i, /comment/i, /media/i, /image/i, /video/i, /content/i, /document/i, /file/i, /attachment/i, /upload/i, /page/i], columnHints: [/title/i, /body/i, /content/i, /slug/i, /excerpt/i, /thumbnail/i], color: '#8b5cf6', priority: 7 },
    { name: 'Categories & Tags', patterns: [/category/i, /tag/i, /label/i, /taxonomy/i, /classification/i, /topic/i, /genre/i], columnHints: [/parent_id/i, /level/i, /path/i, /slug/i], color: '#ec4899', priority: 6 },
    { name: 'Customers & CRM', patterns: [/customer/i, /client/i, /contact/i, /lead/i, /prospect/i, /company/i, /organization/i, /vendor/i, /supplier/i, /partner/i], columnHints: [/company/i, /phone/i, /address/i, /industry/i], color: '#06b6d4', priority: 8 },
    { name: 'HR & Employees', patterns: [/employee/i, /staff/i, /department/i, /salary/i, /attendance/i, /leave/i, /payroll/i, /job/i, /position/i, /team/i, /manager/i, /worker/i], columnHints: [/hire_date/i, /salary/i, /department/i, /title/i, /supervisor/i], color: '#f43f5e', priority: 7 },
    { name: 'Messaging', patterns: [/message/i, /notification/i, /email/i, /chat/i, /inbox/i, /conversation/i, /thread/i, /reply/i, /sms/i, /alert/i], columnHints: [/subject/i, /body/i, /read_at/i, /sent_at/i, /recipient/i], color: '#0ea5e9', priority: 5 },
    { name: 'Analytics & Logs', patterns: [/log/i, /event/i, /analytic/i, /metric/i, /tracking/i, /audit/i, /history/i, /activity/i, /stat/i, /report/i], columnHints: [/ip_address/i, /user_agent/i, /action/i, /timestamp/i], color: '#84cc16', priority: 4 },
    { name: 'Settings & Config', patterns: [/setting/i, /config/i, /preference/i, /option/i, /parameter/i, /feature/i, /flag/i], columnHints: [/key/i, /value/i, /default/i], color: '#64748b', priority: 3 },
    { name: 'Locations & Geo', patterns: [/address/i, /location/i, /country/i, /city/i, /state/i, /region/i, /zone/i, /area/i, /place/i, /geo/i], columnHints: [/latitude/i, /longitude/i, /zip/i, /postal/i, /street/i], color: '#14b8a6', priority: 5 },
    { name: 'Financial', patterns: [/account/i, /balance/i, /ledger/i, /budget/i, /expense/i, /income/i, /tax/i, /fee/i, /billing/i, /credit/i, /debit/i], columnHints: [/amount/i, /balance/i, /currency/i, /rate/i], color: '#eab308', priority: 6 },
    { name: 'Scheduling', patterns: [/schedule/i, /calendar/i, /event/i, /booking/i, /appointment/i, /reservation/i, /slot/i, /availability/i], columnHints: [/start_time/i, /end_time/i, /duration/i, /recurring/i], color: '#a855f7', priority: 5 },
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
          name: data.pattern.name,
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
            name: `${root} Related`,
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

Tables have been arranged by dependency-aware category groups. Drag any open shaded area inside a category to reposition the group.`
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
    setChatMessages((m) => [...m, { role: 'assistant', content: 'Tables were arranged by relationship flow inside dependency-aware category groups.' }]);
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
    const cleanName = newColumn.name.trim();
    if (!selectedTable || !cleanName) return;
    const targetTable = schema.tables.find((table) => table.name === selectedTable);
    if (targetTable?.columns.some((column) => column.name.toLowerCase() === cleanName.toLowerCase())) {
      showWorkspaceNotice('Column name already in use', `${selectedTable}.${cleanName} already exists.`, 'warning');
      return;
    }
    const columnToAdd = { ...newColumn, name: cleanName, nullable: newColumn.pk ? false : newColumn.nullable };
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name !== selectedTable) return t;
        return { ...t, columns: [...t.columns, columnToAdd] };
      }),
    }));
    setNewColumn({ name: '', type: 'VARCHAR(255)', pk: false, nullable: true, unique: false });
    setShowAddColumnModal(false);
    setChatMessages((m) => [...m, { role: 'assistant', content: `✅ Added column \`${cleanName}\` to **${selectedTable}**.` }]);
    showWorkspaceNotice('Column added', `${selectedTable}.${cleanName} is now part of the table.`, 'success');
  };

  const updateColumn = () => {
    if (!editingColumn) return;
    const cleanName = editingColumn.column.name.trim();
    const targetTable = schema.tables.find((table) => table.name === editingColumn.tableName);
    if (!cleanName) {
      showWorkspaceNotice('Column name required', 'Enter a name before saving this field.', 'warning');
      return;
    }
    if (targetTable?.columns.some((column, index) => index !== editingColumn.index && column.name.toLowerCase() === cleanName.toLowerCase())) {
      showWorkspaceNotice('Column name already in use', `${editingColumn.tableName}.${cleanName} already exists.`, 'warning');
      return;
    }
    const updatedColumn = {
      ...editingColumn.column,
      name: cleanName,
      nullable: editingColumn.column.pk ? false : editingColumn.column.nullable,
    };
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name !== editingColumn.tableName) return t;
        const cols = [...t.columns];
        cols[editingColumn.index] = updatedColumn;
        return { ...t, columns: cols };
      }),
    }));
    setEditingColumn(null);
    setShowEditColumnModal(false);
    showWorkspaceNotice('Column updated', `${editingColumn.tableName}.${cleanName} was saved.`, 'success');
  };

  const deleteColumn = (tableName: string, colName: string) => {
    const column = schema.tables.find((table) => table.name === tableName)?.columns.find((candidate) => candidate.name === colName);
    if (!column) return;
    const constraints = [
      column.pk ? 'primary key' : '',
      column.fk ? 'foreign key' : '',
      column.unique ? 'unique' : '',
      column.indexed ? 'indexed' : '',
    ].filter(Boolean);
    confirmWorkspaceAction({
      title: `Delete ${tableName}.${colName}?`,
      description: 'The column and all constraints attached to it will be removed from the table.',
      subject: `${tableName}.${colName}`,
      impact: constraints.length ? constraints.join(' · ') : column.type,
      confirmLabel: 'Delete column',
      tone: constraints.length ? 'danger' : 'warning',
      recoverable: true,
      onConfirm: () => {
        setSchema((s) => ({
          ...s,
          tables: s.tables.map((table) => table.name === tableName
            ? { ...table, columns: table.columns.filter((candidate) => candidate.name !== colName) }
            : table),
        }));
        showWorkspaceNotice('Column removed', `${tableName}.${colName} was removed. Undo remains available.`, 'warning');
      },
    });
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
    showWorkspaceNotice('Relationship created', `${newFk.fromTable}.${newFk.fromCol} now references ${newFk.toTable}.${newFk.toCol || 'id'}.`, 'success');
    setNewFk({ fromTable: '', fromCol: '', toTable: '', toCol: 'id' });
  };

  const removeFk = (tableName: string, colName: string) => {
    const column = schema.tables.find((table) => table.name === tableName)?.columns.find((candidate) => candidate.name === colName);
    if (!column?.fk) return;
    const target = `${column.fk.table}.${column.fk.column}`;
    confirmWorkspaceAction({
      title: 'Detach this relationship?',
      description: 'The column remains in place, but it will no longer enforce a reference to the target table.',
      subject: `${tableName}.${colName}`,
      impact: `Relationship to ${target}`,
      confirmLabel: 'Detach relationship',
      tone: 'warning',
      recoverable: true,
      onConfirm: () => {
        setSchema((s) => ({
          ...s,
          tables: s.tables.map((t) => t.name === tableName
            ? { ...t, columns: t.columns.map((c) => c.name === colName ? { ...c, fk: undefined } : c) }
            : t),
        }));
        showWorkspaceNotice('Relationship detached', `${tableName}.${colName} no longer references ${target}.`, 'warning');
      },
    });
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

  const toggleColumnIndexed = (tableName: string, colName: string) => {
    setSchema((s) => ({
      ...s,
      tables: s.tables.map((t) => {
        if (t.name !== tableName) return t;
        return { ...t, columns: t.columns.map((c) => c.name === colName ? { ...c, indexed: !c.indexed } : c) };
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

  const openSqlWorkspace = () => {
    if (!sqlCode.trim()) setSqlCode(generateSchemaSql(schema));
    setSqlWorkspacePanel('editor');
    setActiveSidebarTab('sql');
    setMobileWorkspaceView('canvas');
    setMobileDrawerOpen(false);
    setMobileSpeedDialOpen(false);
  };

  const regenerateSqlWorkspace = () => {
    setSqlCode(generateSchemaSql(schema));
    setSqlRunResult(null);
    setSqlWorkspacePanel('editor');
  };

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(sqlCode);
    setChatMessages((m) => [...m, { role: 'assistant', content: `📋 SQL code copied to clipboard!` }]);
  };

  const runSqlScript = () => {
    const parsedTables = parseDDL(sqlCode);
    const diagnostics = validateSqlForWorkspace(sqlCode, parsedTables);
    if (diagnostics.length > 0) {
      const firstIssue = diagnostics[0];
      const assistantGuidance = `Start at line ${firstIssue.line}${firstIssue.column ? `, column ${firstIssue.column}` : ''}: ${firstIssue.message} ${firstIssue.suggestion}`;
      setSqlRunResult({
        status: 'error',
        title: `${diagnostics.length} SQL issue${diagnostics.length === 1 ? '' : 's'} blocked execution`,
        detail: `No canvas changes were applied. Review the diagnostics below, correct the script, and run it again.`,
        diagnostics,
        assistantGuidance,
      });
      setSqlWorkspacePanel('results');
      setRightPanelView('assistant');
      setChatMessages((messages) => [
        ...messages,
        {
          role: 'assistant',
          content: `I traced the SQL error to **line ${firstIssue.line}${firstIssue.column ? `, column ${firstIssue.column}` : ''}**.\n\n**Cause:** ${firstIssue.message}\n\n**How to fix it:** ${firstIssue.suggestion}${diagnostics.length > 1 ? `\n\nThere ${diagnostics.length === 2 ? 'is' : 'are'} **${diagnostics.length - 1} more issue${diagnostics.length - 1 === 1 ? '' : 's'}** in the Results tab.` : ''}`,
        },
      ]);
      return;
    }

    const existingByName = new Map(schema.tables.map((table) => [table.name.toLowerCase(), table]));
    const mergedTables = parsedTables.map((table) => {
      const existing = existingByName.get(table.name.toLowerCase());
      return {
        ...table,
        color: existing?.color || '#38bdf8',
        category: existing?.category,
      };
    });
    const indexPattern = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+["`[]?[a-zA-Z0-9_]+["`\]]?\s+ON\s+["`[]?([a-zA-Z0-9_]+)["`\]]?\s*\(\s*["`[]?([a-zA-Z0-9_]+)["`\]]?\s*\)/gi;
    for (const match of sqlCode.matchAll(indexPattern)) {
      const table = mergedTables.find((candidate) => candidate.name.toLowerCase() === match[1].toLowerCase());
      const column = table?.columns.find((candidate) => candidate.name.toLowerCase() === match[2].toLowerCase());
      if (column) column.indexed = true;
    }
    const retainedCategories = (schema.categories || []).filter((category) =>
      mergedTables.some((table) => table.category === category.id),
    );
    const layoutedTables = retainedCategories.length
      ? layoutTablesByCategory(mergedTables, retainedCategories)
      : autoLayout(mergedTables);
    const extraStatements =
      sqlCode.match(/\b(CREATE\s+(?:UNIQUE\s+)?INDEX|ALTER\s+TABLE|INSERT\s+INTO|CREATE\s+TRIGGER|CREATE\s+VIEW)\b/gi)?.length || 0;

    setSchema((current) => ({ ...current, tables: layoutedTables, categories: retainedCategories }));
    setSelectedTable(null);
    setSqlRunResult({
      status: 'success',
      title: `Applied ${parsedTables.length} table${parsedTables.length === 1 ? '' : 's'} to the canvas`,
      detail: extraStatements
        ? `${extraStatements} additional statement${extraStatements === 1 ? '' : 's'} remain in the script. Supported indexes were reflected; other statements must be executed in the target database.`
        : 'The in-browser schema now matches this DDL. No external database was contacted.',
    });
    setSqlWorkspacePanel('results');
    setChatMessages((messages) => [
      ...messages,
      { role: 'assistant', content: `Ran the SQL workspace script and updated the canvas with **${parsedTables.length} table${parsedTables.length === 1 ? '' : 's'}**.` },
    ]);
  };

  const exportSQL = () => {
    downloadSchemaSql(schema);
  };

  const exportJSON = () => {
    downloadSchemaJson(schema);
    setChatMessages((m) => [...m, { role: 'assistant', content: `📦 Exported schema as JSON. This format preserves all table positions, colors, and relationships for perfect re-import.` }]);
  };

  const exportPowerPoint = async () => {
    if (schema.tables.length === 0) {
      setChatMessages((messages) => [...messages, { role: 'assistant', content: 'No tables are available to export. Create a schema first.' }]);
      return;
    }

    setChatMessages((messages) => [...messages, { role: 'assistant', content: 'Generating the PowerPoint documentation…' }]);
    try {
      const { downloadPowerPoint } = await import('./services/export/powerPoint');
      const fileName = await downloadPowerPoint(schema);
      setChatMessages((messages) => [...messages, {
        role: 'assistant',
        content: `**PowerPoint presentation generated.**\n\nFile: \`${fileName}\`\n\nIncludes:\n• Editorial title slide\n• Neutral schema overview\n• Paginated relationship documentation\n• Complete, paginated table specifications for ${schema.tables.length} tables\n• Summary slide`,
      }]);
    } catch (error) {
      setChatMessages((messages) => [...messages, {
        role: 'assistant',
        content: `**PowerPoint export failed.**\n\n${error instanceof Error ? error.message : 'Unknown export error'}`,
      }]);
    }
  };

  const selectedTableData = schema.tables.find((t) => t.name === selectedTable);
  const columnCount = schema.tables.reduce((sum, table) => sum + table.columns.length, 0);
  const relationshipCount = schema.tables.reduce((sum, table) => sum + table.columns.filter((column) => column.fk).length, 0);
  const canUndo = historyVersion >= 0 && undoStackRef.current.length > 0;
  const canRedo = historyVersion >= 0 && redoStackRef.current.length > 0;
  const sidebarTitles: Record<SidebarTab, { title: string; description: string }> = {
    home: { title: 'Home', description: 'Start, resume, or open a project' },
    design: { title: 'Design', description: 'Build and edit your schema' },
    organize: { title: 'Organize', description: 'Domains, groups, and layout' },
    templates: { title: 'Templates', description: 'Start from a proven model' },
    projects: { title: 'Projects', description: 'Save, import, and switch safely' },
    sql: { title: 'SQL', description: 'Write, validate, and run DDL scripts' },
    export: { title: 'Ship', description: 'Download scripts and project artifacts' },
  };
  const assistantSuggestions = schema.tables.length === 0
    ? ['How do I use an assignment brief?', 'Create a CRM schema', 'Create users, roles and permissions']
    : relationshipCount === 0 && schema.tables.length > 1
      ? ['Add relationships to the tables', 'Review this schema', 'Organize tables into domains']
      : (schema.categories || []).length === 0
        ? ['Organize tables into domains', 'Audit the schema', 'Review normalization']
        : ['Audit the schema', 'Add recommended indexes', 'Review normalization'];

  return (
    <div className="sv-app flex h-full min-h-0 overflow-hidden" data-theme={theme} data-mobile-view={mobileWorkspaceView}>
      {/* CSS Animations */}

      {/* Hidden file input for import */}
      <input type="file" ref={fileInputRef} accept=".sql,.txt,.json" style={{ display: 'none' }} onChange={handleFileImport} />

      {confirmationRequest && (
        <div className="sv-checkpoint-layer" onMouseDown={(event) => event.target === event.currentTarget && cancelWorkspaceAction()}>
          <section
            className="sv-checkpoint"
            data-tone={confirmationRequest.tone}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sv-checkpoint-title"
            aria-describedby="sv-checkpoint-description"
          >
            <header className="sv-checkpoint-header">
              <div>
                <span className="sv-checkpoint-kicker">Schema checkpoint</span>
                <strong id="sv-checkpoint-title">{confirmationRequest.title}</strong>
              </div>
              <button onClick={cancelWorkspaceAction} aria-label="Close confirmation">
                <CloseCircleIcon size={18} weight="Linear" />
              </button>
            </header>
            <p id="sv-checkpoint-description">{confirmationRequest.description}</p>
            <div className="sv-checkpoint-impact">
              <div><span>Target</span><strong>{confirmationRequest.subject}</strong></div>
              <div><span>Impact</span><strong>{confirmationRequest.impact}</strong></div>
              <div><span>Recovery</span><strong>{confirmationRequest.recoverable ? 'Undo is available after this change' : 'This action cannot be undone'}</strong></div>
            </div>
            <footer className="sv-checkpoint-actions">
              <button onClick={cancelWorkspaceAction}>Keep current design</button>
              <button className="sv-checkpoint-confirm" onClick={runConfirmedWorkspaceAction}>{confirmationRequest.confirmLabel}</button>
            </footer>
          </section>
        </div>
      )}

      <aside className="sv-notice-stack" aria-live="polite" aria-label="Workspace notifications">
        {workspaceNotices.map((notice) => (
          <div className="sv-workspace-notice" data-tone={notice.tone} key={notice.id}>
            <FileCheckIcon size={18} weight="Linear" />
            <div><strong>{notice.title}</strong><span>{notice.detail}</span></div>
            <button onClick={() => setWorkspaceNotices((current) => current.filter((item) => item.id !== notice.id))} aria-label={`Dismiss ${notice.title}`}>
              <CloseCircleIcon size={17} weight="Linear" />
            </button>
          </div>
        ))}
      </aside>

      {/* Unsaved project guard */}
      {showUnsavedModal && (
        <div className="sv-checkpoint-layer" onMouseDown={(event) => event.target === event.currentTarget && cancelProjectTransition()}>
          <section className="sv-checkpoint sv-unsaved-checkpoint" data-tone="warning" role="alertdialog" aria-modal="true" aria-labelledby="sv-unsaved-title">
            <header className="sv-checkpoint-header">
              <div>
                <span className="sv-checkpoint-kicker">Project transition</span>
                <strong id="sv-unsaved-title">Save this project first?</strong>
              </div>
              <button onClick={cancelProjectTransition} aria-label="Close confirmation">
                <CloseCircleIcon size={18} weight="Linear" />
              </button>
            </header>
            <p><strong>{schema.name || 'Untitled Schema'}</strong> has changes that are not saved. Save them before opening or starting another project.</p>
            <div className="sv-checkpoint-impact">
              <div><span>Project</span><strong>{schema.name || 'Untitled Schema'}</strong></div>
              <div><span>Unsaved state</span><strong>{schema.tables.length} tables · {relationshipCount} relationships</strong></div>
              <div><span>Next step</span><strong>Save, leave without saving, or cancel</strong></div>
            </div>
            <footer className="sv-checkpoint-actions sv-unsaved-actions">
              <button onClick={cancelProjectTransition}>Cancel</button>
              <button className="sv-checkpoint-discard" onClick={discardAndContinue}>Leave without saving</button>
              <button className="sv-checkpoint-confirm" onClick={saveBeforeProjectTransition}>Save and continue</button>
            </footer>
          </section>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <WorkspaceDialog
          id="sv-save-project"
          eyebrow="Project snapshot"
          title="Save schema"
          description="Store the current tables, relationships, categories, and canvas layout in this browser."
          context={`${schema.tables.length} tables`}
          icon={<FileCheckIcon size={20} weight="Linear" />}
          size="compact"
          onClose={() => {
            afterSaveActionRef.current = null;
            setShowSaveModal(false);
          }}
        >
          <label className="sv-dialog-field">
            <span>Project name</span>
            <input type="text" value={schemaName} onChange={(event) => setSchemaName(event.target.value)} placeholder="e.g. Student records" autoFocus onKeyDown={(event) => event.key === 'Enter' && confirmSave()} />
          </label>
          <div className="sv-dialog-actions">
            <button onClick={() => {
              afterSaveActionRef.current = null;
              setShowSaveModal(false);
            }}>Cancel</button>
            <button className="sv-dialog-primary" onClick={confirmSave}>Save project</button>
          </div>
        </WorkspaceDialog>
      )}

      {/* Load Modal */}
      {showLoadModal && (
        <WorkspaceDialog
          id="sv-open-project"
          eyebrow="Local projects"
          title="Open a saved schema"
          description="Choose a browser-saved project. Unsaved work in the current canvas will be protected first."
          context={`${savedSchemas.length} saved`}
          icon={<FolderOpenIcon size={20} weight="Linear" />}
          onClose={() => setShowLoadModal(false)}
        >
          {savedSchemas.length === 0 ? (
            <div className="sv-dialog-empty">
              <FolderWithFilesIcon size={28} weight="Linear" />
              <strong>No saved projects</strong>
              <span>Save the current schema and it will appear here.</span>
            </div>
          ) : (
            <div className="sv-saved-project-list">
              {savedSchemas.map((saved) => (
                <div className="sv-saved-project" key={saved.id}>
                  <button className="sv-saved-project-open" onClick={() => loadSavedSchema(saved)}>
                    <span>{saved.name}</span>
                    <small>{saved.schema.tables.length} tables · Updated {new Date(saved.updatedAt).toLocaleDateString()}</small>
                  </button>
                  <button className="sv-saved-project-delete" onClick={() => deleteSaved(saved.id)} aria-label={`Delete ${saved.name}`} title={`Delete ${saved.name}`}>
                    <TrashBinMinimalisticIcon size={16} weight="Linear" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </WorkspaceDialog>
      )}

      {/* Add Table Modal */}
      {showAddTableModal && (
        <WorkspaceDialog
          id="sv-add-table"
          eyebrow="Schema structure"
          title="Create a table"
          description="A primary-key column will be created automatically so the table is ready to connect."
          context={`${schema.tables.length} existing tables`}
          icon={<DatabaseIcon size={20} weight="Linear" />}
          size="compact"
          onClose={() => setShowAddTableModal(false)}
        >
          <label className="sv-dialog-field">
            <span>Table name</span>
            <input type="text" value={newTableName} onChange={(event) => setNewTableName(event.target.value)} placeholder="e.g. course_enrollments" autoFocus onKeyDown={(event) => event.key === 'Enter' && addTableManual()} />
          </label>
          <div className="sv-dialog-actions">
            <button onClick={() => setShowAddTableModal(false)}>Cancel</button>
            <button className="sv-dialog-primary" onClick={addTableManual} disabled={!newTableName.trim()}>Create table</button>
          </div>
        </WorkspaceDialog>
      )}

      {/* Add/Edit Category Modal */}
      {showCategoryModal && (
        <WorkspaceDialog
          id="sv-category-editor"
          eyebrow="Schema organization"
          title={editingCategory ? <>Edit <strong>{editingCategory.name}</strong></> : 'Create a category'}
          description={editingCategory ? 'Update the category and review the tables grouped inside it.' : 'Create a meaningful domain and choose the related tables it should contain.'}
          context={`${newCategory.selectedTables.length} selected`}
          icon={editingCategory ? <Pen2Icon size={20} weight="Linear" /> : <AddFolderIcon size={20} weight="Linear" />}
          onClose={closeCategoryModal}
        >
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
              <div className="sv-dialog-selection-list" style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #334155', borderRadius: 8, background: '#0f172a' }}>
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
                        className="sv-dialog-selection-row"
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
                          {isSelected && <CheckSquareIcon size={15} weight="Bold" />}
                        </div>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--icon-color)' }} />
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
                <div className="sv-dialog-callout" style={{ marginTop: 8, padding: 8, borderRadius: 6, background: '#0f172a', border: '1px solid #334155' }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <BoltCircleIcon size={13} weight="Linear" />
                    Suggested tables for "{newCategory.name}":
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {suggestTablesForCategory(newCategory.name).filter(n => !newCategory.selectedTables.includes(n)).slice(0, 5).map(name => (
                      <button
                        key={name}
                        onClick={() => setNewCategory(prev => ({ ...prev, selectedTables: [...prev.selectedTables, name] }))}
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <AddCircleIcon size={13} weight="Linear" /> {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="sv-dialog-actions">
              <button onClick={closeCategoryModal} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
              <button
                className="sv-dialog-primary"
                onClick={editingCategory ? updateCategory : addCategory}
                style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: newCategory.color, color: '#fff', fontWeight: 600, cursor: 'pointer' }}
              >
                {editingCategory
                  ? `Save Changes`
                  : `Create ${newCategory.selectedTables.length > 0 ? `with ${newCategory.selectedTables.length} tables` : 'Category'}`}
              </button>
            </div>
        </WorkspaceDialog>
      )}

      {/* Add Column Modal */}
      {showAddColumnModal && selectedTable && (
        <WorkspaceDialog
          id="sv-add-column"
          eyebrow="Table structure"
          title={<>Add column to <strong>{selectedTable}</strong></>}
          description="Define the field type and constraints before it is added to the table."
          context={`${selectedTable} / ${selectedTableData?.columns.length || 0} columns`}
          icon={<AddCircleIcon size={20} weight="Linear" />}
          onClose={() => setShowAddColumnModal(false)}
        >
          <div className="sv-dialog-form-grid">
            <label className="sv-dialog-field">
              <span>Column name</span>
              <input type="text" value={newColumn.name} onChange={(event) => setNewColumn({ ...newColumn, name: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && addColumnManual()} placeholder="e.g. email_address" autoFocus />
            </label>
            <label className="sv-dialog-field">
              <span>Data type</span>
              <select value={newColumn.type} onChange={(event) => setNewColumn({ ...newColumn, type: event.target.value })}>
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
            </label>
          </div>
          <div className="sv-dialog-constraint-grid" aria-label="Column constraints">
            <label className="sv-dialog-constraint">
              <input type="checkbox" checked={!!newColumn.pk} onChange={(event) => setNewColumn({ ...newColumn, pk: event.target.checked, nullable: event.target.checked ? false : newColumn.nullable })} />
              <span>Primary key</span>
            </label>
            <label className="sv-dialog-constraint">
              <input type="checkbox" checked={!!newColumn.unique} onChange={(event) => setNewColumn({ ...newColumn, unique: event.target.checked })} />
              <span>Unique values</span>
            </label>
            <label className="sv-dialog-constraint">
              <input type="checkbox" checked={!!newColumn.nullable} disabled={!!newColumn.pk} onChange={(event) => setNewColumn({ ...newColumn, nullable: event.target.checked })} />
              <span>Allow null</span>
            </label>
          </div>
          <div className="sv-dialog-actions">
            <button onClick={() => setShowAddColumnModal(false)}>Cancel</button>
            <button className="sv-dialog-primary" onClick={addColumnManual} disabled={!newColumn.name.trim()}>Add column</button>
          </div>
        </WorkspaceDialog>
      )}

      {/* Edit Column Modal */}
      {showEditColumnModal && editingColumn && (
        <WorkspaceDialog
          id="sv-edit-column"
          eyebrow="Column definition"
          title={<>Edit <strong>{editingColumn.column.name}</strong></>}
          description="Update the field definition and its optional relationship without leaving the canvas."
          context={`${editingColumn.tableName}.${editingColumn.column.name}`}
          icon={<Pen2Icon size={20} weight="Linear" />}
          onClose={() => { setShowEditColumnModal(false); setEditingColumn(null); }}
        >
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
            <div className="sv-dialog-section" style={{ marginBottom: 16, padding: 12, background: '#0f172a', borderRadius: 8, border: '1px solid #334155' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <LinkRoundAngleIcon size={14} weight="Linear" />
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
                    style={{ padding: '4px 10px', border: '1px solid #38bdf840', background: '#38bdf820', color: '#38bdf8', cursor: 'pointer', borderRadius: 4, fontSize: 10, marginLeft: 'auto', opacity: schema.tables.filter(t => t.name !== editingColumn.tableName).length === 0 ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <AddCircleIcon size={13} weight="Linear" /> Add FK
                  </button>
                </div>
              )}
            </div>

            <div className="sv-dialog-actions">
              <button onClick={() => { setShowEditColumnModal(false); setEditingColumn(null); }} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
              <button className="sv-dialog-primary" onClick={updateColumn} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Save changes</button>
            </div>
        </WorkspaceDialog>
      )}

      {/* Add FK Modal */}
      {showAddFkModal && (
        <WorkspaceDialog
          id="sv-add-relationship"
          eyebrow="Referential integrity"
          title="Create a relationship"
          description="Connect a source column to the key it references in another table."
          context={`${relationshipCount} existing links`}
          icon={<LinkRoundAngleIcon size={20} weight="Linear" />}
          onClose={() => setShowAddFkModal(false)}
        >
          <div className="sv-relationship-builder">
            <div>
              <span>Source field</span>
              <div className="sv-relationship-fields">
                <select value={newFk.fromTable} onChange={(event) => setNewFk({ ...newFk, fromTable: event.target.value, fromCol: '' })} autoFocus>
                  <option value="">Choose table</option>
                  {schema.tables.map((table) => <option key={table.name} value={table.name}>{table.name}</option>)}
                </select>
                <select value={newFk.fromCol} onChange={(event) => setNewFk({ ...newFk, fromCol: event.target.value })}>
                  <option value="">Choose column</option>
                  {schema.tables.find((table) => table.name === newFk.fromTable)?.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                </select>
              </div>
            </div>
            <div className="sv-relationship-path" aria-hidden="true"><i /><LinkRoundAngleIcon size={16} weight="Linear" /><i /></div>
            <div>
              <span>Referenced key</span>
              <div className="sv-relationship-fields">
                <select value={newFk.toTable} onChange={(event) => {
                  const targetTable = schema.tables.find((table) => table.name === event.target.value);
                  const targetColumn = targetTable?.columns.find((column) => column.pk)?.name || targetTable?.columns[0]?.name || 'id';
                  setNewFk({ ...newFk, toTable: event.target.value, toCol: targetColumn });
                }}>
                  <option value="">Choose table</option>
                  {schema.tables.map((table) => <option key={table.name} value={table.name}>{table.name}</option>)}
                </select>
                <select value={newFk.toCol} onChange={(event) => setNewFk({ ...newFk, toCol: event.target.value })}>
                  <option value="">Choose column</option>
                  {schema.tables.find((table) => table.name === newFk.toTable)?.columns.map((column) => <option key={column.name} value={column.name}>{column.name}{column.pk ? ' · PK' : ''}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="sv-dialog-actions">
            <button onClick={() => setShowAddFkModal(false)}>Cancel</button>
            <button className="sv-dialog-primary" onClick={addFkManual} disabled={!newFk.fromTable || !newFk.fromCol || !newFk.toTable || !newFk.toCol}>Create relationship</button>
          </div>
        </WorkspaceDialog>
      )}

      <MobileWorkspaceHeader
        projectName={schema.name}
        tableCount={schema.tables.length}
        relationshipCount={relationshipCount}
        theme={theme}
        drawerOpen={mobileDrawerOpen}
        onOpenDrawer={() => {
          setMobileWorkspaceView('canvas');
          setMobileDrawerOpen(true);
          setMobileSpeedDialOpen(false);
        }}
        onCloseDrawer={() => setMobileDrawerOpen(false)}
        onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
      />

      <div className="sv-navigation-shell" data-open={mobileDrawerOpen}>
        <MobileDrawerHeader onClose={() => setMobileDrawerOpen(false)} />

      {/* Primary navigation rail */}
      <PrimaryNavigationRail
        activeTab={activeSidebarTab}
        theme={theme}
        onSelect={(tab) => tab === 'sql' ? openSqlWorkspace() : setActiveSidebarTab(tab)}
        onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
      />

      {/* Left Sidebar */}
      <div className="sv-sidebar flex w-[300px] flex-col border-r border-slate-700 bg-slate-900">
        {/* Header */}
        <div className="sv-brand border-b border-slate-700 bg-slate-800 px-4 py-5">
          <div className="flex items-center gap-[9px] text-lg font-[720]">
            <span className="text-slate-200">{sidebarTitles[activeSidebarTab].title}</span>
            {isDirty && <span title="Unsaved changes" className="size-[7px] rounded-full bg-amber-400 ring-[3px] ring-amber-400/10" />}
          </div>
          <div className="mt-[5px] text-[10px] text-[#7f8c99]">{sidebarTitles[activeSidebarTab].description}</div>
          <div className="mt-2.5 flex items-center gap-[7px] text-[10px] text-[#9aa4af]">
            <span className={`sv-status-dot size-1.5 rounded-full ${isDirty ? 'bg-amber-400' : 'bg-teal-300'}`} />
            {schema.tables.length || 0} tables · {columnCount} columns · {relationshipCount} relations
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-auto py-2">
          {activeSidebarTab === 'home' && (
            <HomeSidebar
              schemaName={schema.name}
              tableCount={schema.tables.length}
              columnCount={columnCount}
              relationshipCount={relationshipCount}
              onResume={() => setActiveSidebarTab('design')}
              onCreate={createNewSchema}
              onImport={handleImportClick}
              onBrowseTemplates={() => setActiveSidebarTab('templates')}
            />
          )}

          {activeSidebarTab === 'projects' && (
            <>
              <div className="sv-section" style={{ margin: '0 8px 8px', padding: 10 }}>
                <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Project actions</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button className="sv-action-button" onClick={createNewSchema} style={{ padding: '10px', borderRadius: 7, border: '1px solid #334155', background: '#151b22', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}><AddCircleIcon size={14} weight="Linear" /> New</button>
                  <button className="sv-action-button" onClick={handleImportClick} style={{ padding: '10px', borderRadius: 7, border: '1px solid #334155', background: '#151b22', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}><ImportIcon size={14} weight="Linear" /> Import</button>
                  <button className="sv-action-button" onClick={handleSaveSchema} disabled={schema.tables.length === 0} style={{ padding: '10px', borderRadius: 7, border: '1px solid #38bdf840', background: '#38bdf812', color: '#bae6fd', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}><FileCheckIcon size={14} weight="Linear" /> Save</button>
                  <button className="sv-action-button" onClick={handleLoadSchema} style={{ padding: '10px', borderRadius: 7, border: '1px solid #334155', background: '#151b22', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}><FolderOpenIcon size={14} weight="Linear" /> Load</button>
                </div>
              </div>
              <div className="sv-section" style={{ margin: '0 8px 8px', padding: 10 }}>
                <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Saved locally</div>
                {savedSchemas.length > 0 ? savedSchemas.slice(0, 8).map((saved) => (
                  <button key={saved.id} onClick={() => loadSavedSchema(saved)} style={{ width: '100%', padding: '9px 8px', border: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileTextIcon size={14} weight="Linear" />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11, fontWeight: 650 }}>{saved.name}</span>
                      <span style={{ display: 'block', color: '#64748b', fontSize: 9, marginTop: 2 }}>{saved.schema.tables.length} tables · {new Date(saved.updatedAt).toLocaleDateString()}</span>
                    </span>
                  </button>
                )) : (
                  <div style={{ padding: '18px 8px', textAlign: 'center', color: '#64748b', fontSize: 10 }}>No saved projects yet</div>
                )}
              </div>
            </>
          )}

          {activeSidebarTab === 'sql' && (
            <SqlSidebar sqlCode={sqlCode} runResult={sqlRunResult} />
          )}

          {activeSidebarTab === 'organize' && (
            <>
              <div className="sv-section" style={{ margin: '0 8px 8px', padding: 10 }}>
                <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Structure tools</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <button className="sv-action-button" onClick={() => setShowCategoryModal(true)} style={{ padding: '10px', borderRadius: 7, border: '1px solid #334155', background: '#151b22', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}><AddFolderIcon size={14} weight="Linear" /> Create domain</button>
                  <button className="sv-action-button" onClick={autoCategorizeTables} disabled={schema.tables.length === 0} style={{ padding: '10px', borderRadius: 7, border: '1px solid #334155', background: '#151b22', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}><MagicStick2Icon size={14} weight="Linear" /> Detect domains</button>
                  <button className="sv-action-button" onClick={() => setShowAddFkModal(true)} disabled={schema.tables.length < 2} style={{ padding: '10px', borderRadius: 7, border: '1px solid #334155', background: '#151b22', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}><LinkRoundAngleIcon size={14} weight="Linear" /> Add relationship</button>
                  <button className="sv-action-button" onClick={rearrangeByCategory} disabled={(schema.categories || []).length === 0} title="Arrange category groups and their tables by relationship flow" style={{ padding: '10px', borderRadius: 7, border: '1px solid #38bdf840', background: '#38bdf810', color: '#bae6fd', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}><Widget5Icon size={14} weight="Linear" /> Smart domain layout</button>
                </div>
              </div>
              <div className="sv-section" style={{ margin: '0 8px 8px', padding: 10 }}>
                <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Database checks</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <button className="sv-action-button" onClick={() => handleChat('Audit the schema')} disabled={schema.tables.length === 0} title="Validate keys, references, types, and naming" style={{ padding: '10px', borderRadius: 7, border: '1px solid #334155', background: '#151b22', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}><FileCheckIcon size={14} weight="Linear" /> Schema health audit</button>
                  <button className="sv-action-button" onClick={() => handleChat('Review normalization')} disabled={schema.tables.length === 0} title="Review 1NF, 2NF, and 3NF risks" style={{ padding: '10px', borderRadius: 7, border: '1px solid #334155', background: '#151b22', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}><LayersMinimalisticIcon size={14} weight="Linear" /> Normalization review</button>
                  <button className="sv-action-button" onClick={() => handleChat('Add recommended indexes')} disabled={schema.tables.length === 0} title="Index foreign keys and common lookup columns" style={{ padding: '10px', borderRadius: 7, border: '1px solid #334155', background: '#151b22', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}><BoltCircleIcon size={14} weight="Linear" /> Apply index guidance</button>
                </div>
              </div>
            </>
          )}

          {/* Actions Section */}
          {activeSidebarTab === 'design' && <div className="sv-section" style={{ margin: '0 8px 8px' }}>
            <button
              className="sv-section-toggle"
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
                <BoltCircleIcon size={15} weight="Linear" />
                Quick Actions
              </span>
              <AltArrowDownIcon size={13} style={{ color: '#77828f', transform: expandedSections.actions ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
            </button>
            {expandedSections.actions && (
              <div style={{ padding: '8px 4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, animation: 'fadeIn 0.2s ease-out' }}>
                <button className="sv-action-button" onClick={createNewSchema} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: 'linear-gradient(135deg, #15191f, #20242b)', color: '#d9e2ec', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                  <AddCircleIcon size={14} weight="Linear" /> New
                </button>
                <button className="sv-action-button" onClick={handleImportClick} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: 'linear-gradient(135deg, #15191f, #20242b)', color: '#d9e2ec', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                  <ImportIcon size={14} weight="Linear" /> Import
                </button>
                <button className="sv-action-button" onClick={handleSaveSchema} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: 'linear-gradient(135deg, #15191f, #20242b)', color: '#d9e2ec', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                  <FileCheckIcon size={14} weight="Linear" /> Save
                </button>
                <button className="sv-action-button" onClick={handleLoadSchema} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: 'linear-gradient(135deg, #15191f, #20242b)', color: '#d9e2ec', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                  <FolderOpenIcon size={14} weight="Linear" /> Load
                </button>
                <button className="sv-action-button" onClick={() => setShowAddTableModal(true)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #33415580', background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.16), #15191f)', color: '#ecfeff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, gridColumn: '1 / -1', fontWeight: 500 }}>
                  <DatabaseIcon size={14} weight="Linear" color="#5eead4" /> Add Table
                </button>
                <button className="sv-action-button" onClick={() => setShowAddFkModal(true)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #33415580', background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.16), #15191f)', color: '#eef2ff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, gridColumn: '1 / -1', fontWeight: 500 }}>
                  <LinkRoundAngleIcon size={14} weight="Linear" color="#818cf8" /> Add Relationship
                </button>
                <button className="sv-action-button" onClick={() => setShowCategoryModal(true)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #33415580', background: 'linear-gradient(135deg, #20242b, #15191f)', color: '#e2e8f0', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                  <AddFolderIcon size={14} weight="Linear" color="#f472b6" /> Category
                </button>
                <button className="sv-action-button" onClick={autoCategorizeTables} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #33415580', background: 'linear-gradient(135deg, #20242b, #15191f)', color: '#e2e8f0', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                  <MagicStick2Icon size={14} weight="Linear" color="#fbbf24" /> Auto-Group
                </button>
                {schema.categories && schema.categories.length > 0 && (
                  <button className="sv-action-button" onClick={rearrangeByCategory} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #33415580', background: 'linear-gradient(135deg, #20242b, #15191f)', color: '#e2e8f0', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, gridColumn: '1 / -1', fontWeight: 500 }}>
                    <Widget5Icon size={14} weight="Linear" color="#06b6d4" /> Smart Relationship Layout
                  </button>
                )}
              </div>
            )}
          </div>}

          {activeSidebarTab === 'templates' && (
            <TemplateSidebar
              activeTemplate={activeDemo}
              expanded={expandedSections.templates}
              onToggle={() => toggleSection('templates')}
              onSelect={loadDemo}
            />
          )}

          {/* Categories Section */}
          {activeSidebarTab === 'organize' && <div className="sv-section" style={{ margin: '0 8px 8px' }}>
            <button
              className="sv-section-toggle"
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
                <FolderWithFilesIcon size={15} weight="Linear" />
                Categories
                <span style={{ fontSize: 9, padding: '2px 6px', background: '#47556920', color: '#94a3b8', borderRadius: 10 }}>{(schema.categories || []).length}</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowCategories(!showCategories); }}
                  title={showCategories ? 'Hide categories on canvas' : 'Show categories on canvas'}
                  style={{ padding: '3px 6px', border: 'none', background: showCategories ? '#6366f130' : 'transparent', color: showCategories ? '#818cf8' : '#64748b', cursor: 'pointer', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  {showCategories ? <EyeIcon size={12} weight="Linear" /> : <EyeClosedIcon size={12} weight="Linear" />}
                  {showCategories ? 'On' : 'Off'}
                </button>
                <AltArrowDownIcon size={13} style={{ color: '#77828f', transform: expandedSections.categories ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
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
                    className="sv-category-row"
                    key={cat.id}
                    role="button"
                    tabIndex={0}
                    title="Select a table in this category. Drag anywhere in its shaded canvas area to move the group."
                    style={{
                      padding: '8px 10px',
                      marginBottom: 6,
                      borderRadius: 8,
                      background: 'var(--surface-raised)',
                      border: '1px solid var(--border-soft)',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      if (tablesInCat.length > 0) openTableEditor(tablesInCat[0].name);
                      else openCategoryForEdit(cat);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      if (tablesInCat.length > 0) openTableEditor(tablesInCat[0].name);
                      else openCategoryForEdit(cat);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--icon-color)' }} />
                      <div className="sv-category-name" style={{ flex: 1, fontSize: 12, fontWeight: 650, color: 'var(--text-primary)' }}>{cat.name}</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openCategoryForEdit(cat); }}
                        title="Edit category"
                        style={{ padding: '4px 6px', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center' }}
                      >
                        <Pen2Icon size={12} weight="Linear" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                        title="Delete category"
                        style={{ padding: '4px 6px', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center' }}
                      >
                        <TrashBinMinimalisticIcon size={12} weight="Linear" />
                      </button>
                    </div>
                    <div className="sv-category-meta" style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-secondary)' }}>
                      <span>{tablesInCat.length} tables</span>
                      <span>{fkCount} FKs</span>
                    </div>
                    <div className="sv-category-help" style={{ marginTop: 4, fontSize: 9, color: 'var(--text-muted)' }}>
                      Drag its shaded canvas area to move the group
                    </div>
                    {tablesInCat.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {tablesInCat.slice(0, 4).map(t => (
                          <span
                            key={t.name}
                            onClick={(e) => { e.stopPropagation(); openTableEditor(t.name); }}
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'var(--surface-control)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-soft)',
                              fontSize: 9,
                              cursor: 'pointer',
                            }}
                          >
                            {t.name}
                          </span>
                        ))}
                        {tablesInCat.length > 4 && (
                          <span style={{ padding: '2px 6px', fontSize: 9, color: '#64748b' }}>{tablesInCat.length - 4} more</span>
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
                    <FolderWithFilesIcon size={30} weight="Linear" color="#66717e" style={{ marginBottom: 8 }} />
                    <div style={{ marginBottom: 6, fontWeight: 500, color: '#94a3b8' }}>No categories yet</div>
                    <div style={{ fontSize: 10, lineHeight: 1.5 }}>Click <strong style={{ color: '#f59e0b' }}>Auto-Group</strong> above<br/>or <strong style={{ color: '#a855f7' }}>Category</strong> to create</div>
                  </div>
                )}
              </div>
            )}
          </div>}

          {/* Tables Section */}
          {activeSidebarTab === 'design' && <div className="sv-section" style={{ margin: '0 8px 8px' }}>
            <button
              className="sv-section-toggle"
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
                <DatabaseIcon size={15} weight="Linear" />
                Tables
                <span style={{ fontSize: 9, padding: '2px 6px', background: '#47556920', color: '#94a3b8', borderRadius: 10 }}>{schema.tables.length}</span>
              </span>
              <AltArrowDownIcon size={13} style={{ color: '#77828f', transform: expandedSections.tables ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
            </button>
            {expandedSections.tables && (
              <div style={{ padding: '8px 4px', maxHeight: 300, overflow: 'auto', animation: 'fadeIn 0.2s ease-out' }}>
                {schema.tables.length > 0 ? schema.tables.map((t) => {
                  return (
                    <div
                      className="sv-table-row"
                      data-selected={selectedTable === t.name}
                      key={t.name}
                      onClick={() => openTableEditor(t.name)}
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
                        border: selectedTable === t.name ? '1px solid #475569' : '1px solid #1e293b',
                      }}
                    >
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--icon-color)' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 650, fontSize: 12, color: 'var(--text-primary)' }}>{t.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {t.columns.length} cols
                          {t.columns.filter(c => c.pk).length > 0 && <span style={{ marginLeft: 4, color: 'var(--icon-color)' }}>PK {t.columns.filter(c => c.pk).length}</span>}
                          {t.columns.filter(c => c.fk).length > 0 && <span style={{ marginLeft: 4, color: 'var(--icon-color)' }}>FK {t.columns.filter(c => c.fk).length}</span>}
                        </div>
                      </div>
                      {/* Quick actions */}
                      <div style={{ display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => duplicateTable(t.name)} title="Duplicate" style={{ padding: '4px 6px', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 10, borderRadius: 4 }}>
                          <CopyIcon size={12} weight="Linear" />
                        </button>
                        <button onClick={() => deleteTable(t.name)} title="Delete" style={{ padding: '4px 6px', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 10, borderRadius: 4 }}>
                          <TrashBinMinimalisticIcon size={12} weight="Linear" />
                        </button>
                      </div>
                    </div>
                  );
                }) : (
                  <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: 20, background: '#0f172a', borderRadius: 6, border: '1px dashed #334155' }}>
                    <DatabaseIcon size={34} weight="Linear" color="#66717e" style={{ marginBottom: 10 }} />
                    <div style={{ marginBottom: 6, fontWeight: 500, color: '#94a3b8' }}>No tables yet</div>
                    <div style={{ fontSize: 10, lineHeight: 1.5 }}>Use the chat or Add Table</div>
                  </div>
                )}
              </div>
            )}
          </div>}
        </div>

        {/* Export Section */}
        {activeSidebarTab === 'export' && <div className="sv-export-panel" style={{ padding: '12px 16px', borderTop: '1px solid #334155', background: '#0f172a' }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ExportIcon size={14} weight="Linear" />
            Downloads
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <button
                className="sv-export-button"
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
                <CodeFileIcon size={14} weight="Linear" color="#818cf8" />
                Download SQL
              </button>
              <button
                className="sv-export-button"
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
                <FileTextIcon size={14} weight="Linear" color="#38bdf8" />
                Download JSON
              </button>
            </div>
            <button
              className="sv-export-button"
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
              <PresentationGraphIcon size={15} weight="Linear" color="#f97316" />
              Download PowerPoint
            </button>
          </div>
        </div>}
      </div>
      </div>

      {/* Canvas / Welcome Screen */}
      <div className="sv-canvas-region relative flex-1">
        {activeSidebarTab === 'sql' ? (
          <SqlWorkspace
            panel={sqlWorkspacePanel}
            sqlCode={sqlCode}
            runResult={sqlRunResult}
            onPanelChange={setSqlWorkspacePanel}
            onSqlChange={(nextSql) => {
              setSqlCode(nextSql);
              if (sqlRunResult) setSqlRunResult(null);
            }}
            onRegenerate={regenerateSqlWorkspace}
            onCopy={copySqlToClipboard}
            onRun={runSqlScript}
            onViewCanvas={() => setActiveSidebarTab('design')}
          />
        ) : activeSidebarTab === 'home' || schema.tables.length === 0 ? (
          <HomeWorkspace onLoadTemplate={loadDemo} onCreate={createNewSchema} onImport={handleImportClick} />
        ) : (
          <>
            <div className="sv-canvas-toolbar" aria-label="Canvas actions">
              <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                <UndoLeftIcon size={15} weight="Linear" />
                <span>Undo</span>
              </button>
              <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
                <UndoRightIcon size={15} weight="Linear" />
                <span>Redo</span>
              </button>
              <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.09)' }} />
              <button
                onClick={() => setSchema((current) => ({
                  ...current,
                  tables: (current.categories || []).length
                    ? layoutTablesByCategory(current.tables, current.categories || [])
                    : autoLayout(current.tables),
                }))}
                title="Create a clear, relationship-aware layout"
              >
                <Widget5Icon size={15} weight="Linear" />
                <span>Smart arrange</span>
              </button>
              <button onClick={clearSchema} title="Clear canvas (undo is available)" style={{ color: '#fca5a5' }}>
                <EraserSquareIcon size={15} weight="Linear" />
                <span>Clear</span>
              </button>
            </div>
            <SchemaCanvas schema={schema} theme={theme} selectedTable={selectedTable} onSelectTable={openTableEditor} onMoveTable={handleMoveTable} onMoveCategory={moveCategoryTables} showCategories={showCategories} fitSignal={mobileWorkspaceView} />
            {/* Zoom hint */}
            <div className="sv-hint" style={{ position: 'absolute', bottom: 12, left: 12, fontSize: 11, color: '#aeb7c2', background: 'rgba(21,25,31,0.78)', padding: '8px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
              <RulerIcon size={14} weight="Linear" color="#5eead4" />
              {(schema.categories || []).length > 0 && showCategories
                ? 'Drag open shaded category space to move the group'
                : 'Relationship-aware canvas ready'}
            </div>
          </>
        )}
      </div>

      {(mobileWorkspaceView === 'assistant' || mobileWorkspaceView === 'details') && (
        <button
          className="sv-mobile-workspace-scrim"
          onClick={closeMobileWorkspacePopup}
          aria-label={mobileWorkspaceView === 'assistant' ? 'Close Assistant' : 'Close table editor'}
        />
      )}

      {/* Right Panel: Details + AI Chat */}
      <div className="sv-right-panel flex w-[360px] flex-col border-l border-slate-700 bg-slate-900">
        <InspectorSwitcher
          activeView={rightPanelView}
          onChange={(view) => view === 'assistant' ? openAssistantPanel() : setRightPanelView('editor')}
        />
        <TableEditorPanel
          visible={rightPanelView === 'editor'}
          table={selectedTableData}
          categories={schema.categories || []}
          onClose={closeMobileWorkspacePopup}
          onRename={renameTableManual}
          onDuplicate={duplicateTable}
          onDeleteTable={deleteTable}
          onAssignCategory={assignTableToCategory}
          onCreateCategory={() => setShowCategoryModal(true)}
          onMoveColumnUp={moveColumnUp}
          onMoveColumnDown={moveColumnDown}
          onTogglePrimaryKey={toggleColumnPk}
          onToggleUnique={toggleColumnUnique}
          onToggleIndex={toggleColumnIndexed}
          onToggleNullable={toggleColumnNullable}
          onEditColumn={(tableName, column, index) => {
            setEditingColumn({ tableName, column, index });
            setShowEditColumnModal(true);
          }}
          onDeleteColumn={deleteColumn}
          onRemoveForeignKey={removeFk}
          onAddColumn={() => setShowAddColumnModal(true)}
        />
        {/* Assistant */}
        <AssistantPanel
          visible={rightPanelView === 'assistant'}
          tableCount={schema.tables.length}
          messages={chatMessages}
          thinking={assistantThinking}
          suggestions={assistantSuggestions}
          input={chatInput}
          chatEndRef={chatEndRef}
          onInputChange={setChatInput}
          onInputKeyDown={handleKeyDown}
          onSend={() => handleChat()}
          onSuggestion={(suggestion) => handleChat(suggestion)}
          onClear={clearAssistantConversation}
          onClose={closeMobileWorkspacePopup}
        />
      </div>

      <div className="sv-mobile-speed-dial" data-open={mobileSpeedDialOpen} data-assistant-open={mobileWorkspaceView === 'assistant'}>
        {mobileSpeedDialOpen && (
          <div className="sv-mobile-speed-actions">
            <button
              onClick={() => {
                setMobileWorkspaceView('canvas');
                closeMobileSpeedDial();
                setMobileDrawerOpen(true);
                window.requestAnimationFrame(() => {
                  document.querySelector<HTMLElement>('.sv-mobile-drawer-header button')?.focus({ preventScroll: true });
                });
              }}
            >
              <span>Tools</span>
              <Widget5Icon size={18} weight="Linear" />
            </button>
            <button onClick={() => { closeMobileSpeedDial(true); setRightPanelView('editor'); setMobileWorkspaceView('details'); setMobileDrawerOpen(false); }}>
              <span>{selectedTable ? 'Edit table' : 'Table editor'}</span>
              <Pen2Icon size={18} weight="Linear" />
            </button>
            <button onClick={() => { closeMobileSpeedDial(true); openAssistantPanel(); }}>
              <span>Assistant</span>
              <ChatRoundDotsIcon size={18} weight="Linear" />
            </button>
            {(mobileWorkspaceView === 'assistant' || mobileWorkspaceView === 'details') && (
              <button onClick={() => { closeMobileSpeedDial(true); setMobileWorkspaceView('canvas'); }}>
                <span>Canvas</span>
                <DatabaseIcon size={18} weight="Linear" />
              </button>
            )}
          </div>
        )}
        <button
          ref={mobileSpeedDialTriggerRef}
          className="sv-mobile-speed-trigger"
          onClick={() => {
            if (mobileWorkspaceView === 'assistant') {
              closeMobileWorkspacePopup();
              return;
            }
            setMobileSpeedDialOpen((open) => !open);
          }}
          aria-label={mobileWorkspaceView === 'assistant' ? 'Close Assistant' : mobileSpeedDialOpen ? 'Close quick actions' : 'Open quick actions'}
          aria-expanded={mobileSpeedDialOpen}
          title={mobileWorkspaceView === 'assistant' ? 'Close Assistant' : mobileSpeedDialOpen ? 'Close quick actions' : 'Open quick actions'}
        >
          {(mobileWorkspaceView === 'assistant' || mobileSpeedDialOpen)
            ? <CloseCircleIcon size={22} weight="Linear" />
            : <AddCircleIcon size={22} weight="Linear" />}
        </button>
      </div>
    </div>
  );
}
