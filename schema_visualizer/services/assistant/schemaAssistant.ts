import type { Column, Schema, Table, TableCategory } from '../../types/workspace';
import { randomColor } from '../../utils/color';

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
export function normalizeText(text: string): string {
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
export type Intent = 'create_tables' | 'create_table' | 'create_table_in_category' | 'add_column' | 'add_columns' | 'remove_table' | 'remove_column' | 'rename_table' | 'rename_column' | 'add_fk' | 'add_fks_auto' | 'remove_fk' | 'set_pk' | 'set_unique' | 'set_nullable' | 'set_required' | 'describe' | 'clear' | 'help' | 'stats' | 'greeting' | 'thanks' | 'bye' | 'change_type' | 'color' | 'optimize' | 'suggest' | 'audit' | 'normalize' | 'add_indexes' | 'assign_category' | 'create_category' | 'auto_categorize' | 'unknown';

export function detectIntent(text: string): Intent {
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
  if (/\b(add|create|recommend|apply)\b.*\b(index|indexes|indices)\b|\bindex\b.*\b(foreign\s*keys?|columns?|schema)\b/i.test(t)) return 'add_indexes';
  if (/\b(normalize|normalise|normalization|normalisation|1nf|2nf|3nf|bcnf)\b/i.test(t)) return 'normalize';
  if (/\b(audit|validate|lint|health\s*check|integrity\s*check|check\s*(the\s*)?schema)\b/i.test(t)) return 'audit';
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

interface RequirementEntityDefinition {
  name: string;
  cues: string[];
  attributes?: string[];
}

const REQUIREMENT_ENTITY_CATALOG: RequirementEntityDefinition[] = [
  { name: 'users', cues: ['user', 'users', 'account holder'], attributes: ['email', 'name', 'password_hash', 'is_active'] },
  { name: 'roles', cues: ['role', 'roles'], attributes: ['name', 'description'] },
  { name: 'permissions', cues: ['permission', 'permissions'], attributes: ['name', 'module'] },
  { name: 'students', cues: ['student', 'students', 'learner', 'learners'], attributes: ['student_number', 'first_name', 'last_name', 'email', 'date_of_birth'] },
  { name: 'courses', cues: ['course', 'courses', 'academic module', 'academic modules'], attributes: ['course_code', 'title', 'description', 'credits'] },
  { name: 'enrollments', cues: ['enrollment', 'enrollments', 'enrolment', 'enrolments', 'registration', 'registrations'], attributes: ['student_id', 'course_id', 'enrolled_at', 'status'] },
  { name: 'instructors', cues: ['instructor', 'instructors', 'lecturer', 'lecturers', 'teacher', 'teachers'], attributes: ['employee_number', 'first_name', 'last_name', 'email'] },
  { name: 'grades', cues: ['grade', 'grades', 'result', 'results', 'marks'], attributes: ['enrollment_id', 'score', 'letter_grade', 'recorded_at'] },
  { name: 'books', cues: ['book', 'books', 'publication', 'publications'], attributes: ['isbn', 'title', 'author', 'published_year', 'available_copies'] },
  { name: 'members', cues: ['member', 'members', 'library member', 'patron', 'patrons'], attributes: ['member_number', 'name', 'email', 'phone'] },
  { name: 'loans', cues: ['loan', 'loans', 'borrowing', 'borrowings', 'checkout', 'checkouts'], attributes: ['member_id', 'book_id', 'borrowed_at', 'due_at', 'returned_at'] },
  { name: 'patients', cues: ['patient', 'patients'], attributes: ['patient_number', 'first_name', 'last_name', 'date_of_birth', 'phone'] },
  { name: 'doctors', cues: ['doctor', 'doctors', 'physician', 'physicians'], attributes: ['license_number', 'first_name', 'last_name', 'specialization'] },
  { name: 'appointments', cues: ['appointment', 'appointments', 'consultation', 'consultations'], attributes: ['patient_id', 'doctor_id', 'scheduled_at', 'status', 'notes'] },
  { name: 'medical_records', cues: ['medical record', 'medical records', 'clinical record', 'health record'], attributes: ['patient_id', 'doctor_id', 'diagnosis', 'treatment', 'recorded_at'] },
  { name: 'customers', cues: ['customer', 'customers', 'client', 'clients'], attributes: ['customer_number', 'first_name', 'last_name', 'email', 'phone'] },
  { name: 'products', cues: ['product', 'products', 'merchandise'], attributes: ['sku', 'name', 'description', 'price', 'stock'] },
  { name: 'orders', cues: ['order', 'orders', 'purchase', 'purchases'], attributes: ['customer_id', 'order_number', 'status', 'total', 'ordered_at'] },
  { name: 'order_items', cues: ['order item', 'order items', 'line item', 'line items'], attributes: ['order_id', 'product_id', 'quantity', 'unit_price'] },
  { name: 'payments', cues: ['payment', 'payments', 'transaction', 'transactions'], attributes: ['order_id', 'amount', 'method', 'status', 'paid_at'] },
  { name: 'invoices', cues: ['invoice', 'invoices', 'billing record'], attributes: ['customer_id', 'invoice_number', 'amount', 'due_at', 'status'] },
  { name: 'employees', cues: ['employee', 'employees', 'staff member', 'staff'], attributes: ['employee_number', 'first_name', 'last_name', 'email', 'hire_date'] },
  { name: 'departments', cues: ['department', 'departments', 'division', 'divisions'], attributes: ['name', 'code', 'description'] },
  { name: 'projects', cues: ['project', 'projects'], attributes: ['name', 'description', 'status', 'start_date', 'end_date'] },
  { name: 'tasks', cues: ['task', 'tasks', 'work item', 'work items'], attributes: ['project_id', 'assignee_id', 'title', 'status', 'due_at'] },
  { name: 'suppliers', cues: ['supplier', 'suppliers', 'vendor', 'vendors'], attributes: ['supplier_code', 'name', 'email', 'phone'] },
  { name: 'warehouses', cues: ['warehouse', 'warehouses', 'store location', 'storage location'], attributes: ['code', 'name', 'address'] },
  { name: 'inventory', cues: ['inventory', 'stock record', 'stock records'], attributes: ['product_id', 'warehouse_id', 'quantity', 'reorder_level'] },
  { name: 'hotels', cues: ['hotel', 'hotels'], attributes: ['name', 'address', 'phone'] },
  { name: 'rooms', cues: ['room', 'rooms'], attributes: ['hotel_id', 'room_number', 'room_type', 'rate', 'status'] },
  { name: 'bookings', cues: ['booking', 'bookings', 'reservation', 'reservations'], attributes: ['customer_id', 'room_id', 'check_in', 'check_out', 'status'] },
  { name: 'accounts', cues: ['bank account', 'bank accounts', 'financial account', 'financial accounts'], attributes: ['customer_id', 'account_number', 'account_type', 'balance', 'status'] },
  { name: 'vehicles', cues: ['vehicle', 'vehicles', 'car', 'cars'], attributes: ['registration_number', 'make', 'model', 'year', 'status'] },
  { name: 'drivers', cues: ['driver', 'drivers'], attributes: ['license_number', 'name', 'phone', 'status'] },
  { name: 'trips', cues: ['trip', 'trips', 'journey', 'journeys'], attributes: ['vehicle_id', 'driver_id', 'origin', 'destination', 'started_at', 'ended_at'] },
];

const REQUIREMENT_HEADING_STOP_WORDS = new Set([
  'overview', 'introduction', 'background', 'objective', 'objectives', 'scope', 'requirement', 'requirements',
  'functional_requirements', 'non_functional_requirements', 'business_rules', 'assignment', 'question', 'scenario',
  'deliverables', 'conclusion', 'database', 'system', 'application', 'description', 'notes',
]);

function snakeCaseIdentifier(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function pluralizeEntity(value: string): string {
  const normalized = snakeCaseIdentifier(value).replace(/^(?:a|an|the)_/, '');
  if (!normalized) return '';
  const catalogMatch = REQUIREMENT_ENTITY_CATALOG.find((definition) =>
    definition.name === normalized ||
    definition.cues.some((cue) => snakeCaseIdentifier(cue) === normalized || snakeCaseIdentifier(cue).replace(/s$/, '') === normalized.replace(/s$/, '')),
  );
  if (catalogMatch) return catalogMatch.name;
  if (normalized.endsWith('ies') || normalized.endsWith('ses') || normalized.endsWith('s')) return normalized;
  if (/[^aeiou]y$/.test(normalized)) return `${normalized.slice(0, -1)}ies`;
  if (/(ch|sh|x|z)$/.test(normalized)) return `${normalized}es`;
  return `${normalized}s`;
}

function singularEntity(value: string): string {
  if (value.endsWith('ies')) return `${value.slice(0, -3)}y`;
  if (value.endsWith('ses')) return value.slice(0, -2);
  return value.replace(/s$/, '');
}

function looksLikeRequirementsDocument(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).length;
  const signals = [
    /\b(functional|non-functional|business)\s+requirements?\b/i,
    /\b(case\s+study|assignment|project\s+brief|scenario|deliverables?)\b/i,
    /\bthe\s+system\s+(shall|must|should|needs?\s+to)\b/i,
    /\b(each|every|one)\b.*\b(many|multiple|belongs\s+to|has)\b/i,
    /\bentities?\s+(?:include|are)\b|\bentity\s*:/i,
  ].filter((pattern) => pattern.test(text)).length;
  return text.length >= 650 || (lines >= 5 && signals >= 1) || signals >= 2;
}

function analyzeRequirementsDocument(baseSchema: Schema, documentText: string): { schema: Schema; response: string } | null {
  const text = documentText.replace(/\r/g, '');
  const lower = text.toLowerCase().replace(/\bin\s+order\s+to\b/g, 'to');
  const detected = new Map<string, Set<string>>();
  const evidence = new Map<string, string[]>();

  const addEntity = (rawName: string, attributes: string[] = [], reason = 'requirement') => {
    const name = pluralizeEntity(rawName);
    if (!name || REQUIREMENT_HEADING_STOP_WORDS.has(name) || name.length < 3) return;
    if (!detected.has(name)) detected.set(name, new Set());
    attributes.map(snakeCaseIdentifier).filter(Boolean).forEach((attribute) => detected.get(name)!.add(attribute));
    evidence.set(name, [...(evidence.get(name) || []), reason]);
  };

  REQUIREMENT_ENTITY_CATALOG.forEach((definition) => {
    if (definition.name === 'enrollments' && !/\b(student|course|academic|school|college|university)\b/i.test(lower)) return;
    if (definition.name === 'projects' && /\b(project\s+brief|assignment\s+project|course\s+project)\b/i.test(lower) && !/\b(task|milestone|project\s+manager|project\s+member)\b/i.test(lower)) return;
    const matchedCue = definition.cues.find((cue) =>
      new RegExp(`\\b${cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i').test(lower),
    );
    if (matchedCue) addEntity(definition.name, definition.attributes || [], `mentions “${matchedCue}”`);
  });

  text.split('\n').forEach((rawLine) => {
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
    if (!line) return;
    const definition = line.match(/^([a-z][a-z0-9 _-]{1,34})\s*:\s*(.+)$/i);
    if (definition && /,|\band\b|\b(id|name|code|email|date|status|number|address|phone)\b/i.test(definition[2])) {
      const attributes = definition[2]
        .split(/,|;|\band\b/i)
        .map((value) => value.replace(/\([^)]*\)/g, '').replace(/\b(required|optional|unique|primary key|foreign key)\b/gi, '').trim())
        .filter((value) => value.split(/\s+/).length <= 4);
      addEntity(definition[1], attributes, 'explicit entity definition');
    }
  });

  const entityListMatches = text.matchAll(/\b(?:entities|tables|records)\s*(?:include|are|:)\s*([^.\n]+)/gi);
  for (const match of entityListMatches) {
    match[1].split(/,|;|\band\b/i).forEach((candidate) => addEntity(candidate, [], 'explicit entity list'));
  }

  const attributeRules = text.matchAll(/\b(?:each|every|a|an)\s+([a-z][a-z0-9 _-]{1,28})\s+(?:has|contains|stores|records|includes|must\s+have|should\s+have)\s+([^.\n]+)/gi);
  for (const match of attributeRules) {
    const attributes = match[2]
      .split(/,|;|\band\b/i)
      .map((value) => value.replace(/\b(a|an|the|its|their|required|optional|unique)\b/gi, '').trim())
      .filter((value) => value && value.split(/\s+/).length <= 4);
    addEntity(match[1], attributes, 'attribute rule');
  }

  if (detected.size === 0) return null;

  const generatedTables: Table[] = [...detected.entries()].map(([name, attributes], index) => {
    const catalog = REQUIREMENT_ENTITY_CATALOG.find((definition) => definition.name === name);
    const columns = getDefaultColumnsForTable(name);
    [...(catalog?.attributes || []), ...attributes].forEach((attribute) => {
      const columnName = snakeCaseIdentifier(attribute);
      if (!columnName || columns.some((column) => column.name === columnName)) return;
      columns.push({
        name: columnName,
        type: inferColumnType(columnName),
        nullable: /\b(notes?|description|middle_name|returned_at|ended_at)\b/.test(columnName),
        unique: /\b(email|code|number|isbn|license_number|registration_number)\b/.test(columnName),
      });
    });
    return {
      name,
      columns,
      color: ['#0284c7', '#0891b2', '#0f766e', '#2563eb'][index % 4],
    };
  });

  const ensureRelationship = (fromName: string, toName: string) => {
    const from = findTable(generatedTables, pluralizeEntity(fromName));
    const to = findTable(generatedTables, pluralizeEntity(toName));
    if (!from || !to || from.name === to.name) return false;
    const columnName = `${singularEntity(to.name)}_id`;
    let column = from.columns.find((candidate) => candidate.name === columnName);
    if (!column) {
      column = { name: columnName, type: 'INT', indexed: true };
      from.columns.splice(Math.min(1, from.columns.length), 0, column);
    }
    column.fk = { table: to.name, column: 'id' };
    column.indexed = true;
    return true;
  };

  const belongsToRules = text.matchAll(/\b([a-z][a-z0-9_-]*)\s+(?:belongs\s+to|is\s+assigned\s+to|is\s+associated\s+with)\s+(?:a|an|the)?\s*([a-z][a-z0-9_-]*)/gi);
  for (const match of belongsToRules) ensureRelationship(match[1], match[2]);
  const hasManyRules = text.matchAll(/\b(?:each|a|an|one)\s+([a-z][a-z0-9_-]*)\s+(?:can\s+have|has|contains)\s+(?:many|multiple)\s+([a-z][a-z0-9_-]*)/gi);
  for (const match of hasManyRules) ensureRelationship(match[2], match[1]);

  const addBridgeTable = (name: string, left: string, right: string, extraColumns: Column[] = []) => {
    const leftTable = findTable(generatedTables, left);
    const rightTable = findTable(generatedTables, right);
    if (!leftTable || !rightTable || findTable(generatedTables, name)) return;
    generatedTables.push({
      name,
      color: '#0369a1',
      columns: [
        { name: 'id', type: 'SERIAL', pk: true },
        { name: `${singularEntity(leftTable.name)}_id`, type: 'INT', fk: { table: leftTable.name, column: 'id' }, indexed: true },
        { name: `${singularEntity(rightTable.name)}_id`, type: 'INT', fk: { table: rightTable.name, column: 'id' }, indexed: true },
        ...extraColumns,
      ],
    });
  };

  addBridgeTable('enrollments', 'students', 'courses', [{ name: 'enrolled_at', type: 'TIMESTAMP' }, { name: 'status', type: 'VARCHAR(30)' }]);
  addBridgeTable('order_items', 'orders', 'products', [{ name: 'quantity', type: 'INT' }, { name: 'unit_price', type: 'DECIMAL(10,2)' }]);
  addBridgeTable('role_permissions', 'roles', 'permissions');
  addBridgeTable('project_members', 'projects', 'users', [{ name: 'role', type: 'VARCHAR(50)' }]);

  ensureRelationship('appointments', 'patients');
  ensureRelationship('appointments', 'doctors');
  ensureRelationship('loans', 'members');
  ensureRelationship('loans', 'books');
  ensureRelationship('tasks', 'projects');
  ensureRelationship('inventory', 'products');
  ensureRelationship('inventory', 'warehouses');
  ensureRelationship('rooms', 'hotels');
  ensureRelationship('bookings', 'rooms');
  ensureRelationship('bookings', 'customers');
  ensureRelationship('trips', 'vehicles');
  ensureRelationship('trips', 'drivers');
  wireCommonForeignKeys(generatedTables);

  generatedTables.forEach((table) => {
    table.columns.forEach((column) => {
      if (column.fk) column.indexed = true;
    });
  });

  const existingByName = new Map(baseSchema.tables.map((table) => [table.name.toLowerCase(), table]));
  const mergedTables = generatedTables.map((generated) => {
    const existing = existingByName.get(generated.name.toLowerCase());
    if (!existing) return generated;
    const generatedColumnNames = new Set(generated.columns.map((column) => column.name));
    return {
      ...generated,
      x: existing.x,
      y: existing.y,
      color: existing.color || generated.color,
      category: existing.category,
      columns: [...generated.columns, ...existing.columns.filter((column) => !generatedColumnNames.has(column.name))],
    };
  });
  baseSchema.tables.forEach((table) => {
    if (!mergedTables.some((candidate) => candidate.name.toLowerCase() === table.name.toLowerCase())) mergedTables.push(table);
  });

  const firstHeading = text.split('\n').map((line) => line.trim()).find((line) => line.length >= 5 && line.length <= 80);
  const relationshipCount = mergedTables.reduce((count, table) => count + table.columns.filter((column) => column.fk).length, 0);
  const resultSchema: Schema = {
    ...baseSchema,
    name: baseSchema.name || firstHeading?.replace(/^(assignment|case study|project)\s*[:\-]\s*/i, '') || 'Requirements Schema',
    tables: mergedTables,
  };
  conversationContext.lastCreatedTables = generatedTables.map((table) => table.name);
  conversationContext.recentTables = generatedTables.map((table) => table.name);
  conversationContext.lastAction = 'requirements_document';

  return {
    schema: resultSchema,
    response: `**Requirements document analyzed**

I translated the assignment into **${generatedTables.length} tables** and **${relationshipCount} relationships**.

**Entities identified**
${generatedTables.map((table) => `• **${table.name}** — ${table.columns.length} columns`).join('\n')}

**Design decisions**
• Added primary keys and practical data types
• Converted business rules into foreign keys
• Added bridge tables for detected many-to-many relationships
• Marked foreign-key columns for indexing
• Preserved any compatible tables already on the canvas

Review any assumptions in the table editor, then ask me to **audit the schema**, **review normalization**, or **add recommended indexes**.`,
  };
}

// Main AI function
export function aiModifySchema(schema: Schema, userRequest: string): { schema: Schema; response: string } {
  if (looksLikeRequirementsDocument(userRequest)) {
    const requirementsResult = analyzeRequirementsDocument(schema, userRequest);
    if (requirementsResult) return requirementsResult;
  }
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
• Paste a complete assignment, case study, or requirements document

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
• "Audit the schema" — Integrity, keys, types, and relationship checks
• "Review normalization" — 1NF, 2NF, and 3NF guidance
• "Add recommended indexes" — Index likely joins and lookup columns

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

  // ─── Database design operations ───────────────────────────────────────────
  if (intent === 'add_indexes') {
    if (newSchema.tables.length === 0) {
      return { schema: newSchema, response: 'There are no tables to index yet. Paste your requirements or create a schema first.' };
    }
    const indexed: string[] = [];
    newSchema.tables.forEach((table) => {
      table.columns.forEach((column) => {
        const isLookupColumn =
          !!column.fk ||
          /(^|_)(status|type|code|number|email|created_at|updated_at|date)$/.test(column.name);
        if (isLookupColumn && !column.pk && !column.unique && !column.indexed) {
          column.indexed = true;
          indexed.push(`${table.name}.${column.name}`);
        }
      });
    });
    return {
      schema: newSchema,
      response: indexed.length
        ? `**Recommended indexes applied**\n\n${indexed.map((column) => `• \`${column}\``).join('\n')}\n\nThe SQL export now includes these indexes. Validate them against real query patterns before production deployment.`
        : '**Index review complete**\n\nAll obvious foreign-key and lookup columns are already indexed or covered by primary/unique constraints.',
    };
  }

  if (intent === 'audit') {
    if (newSchema.tables.length === 0) {
      return { schema: newSchema, response: 'The schema is empty. Paste a requirements document or create tables before running an audit.' };
    }
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const tableNames = new Set(newSchema.tables.map((table) => table.name.toLowerCase()));

    newSchema.tables.forEach((table) => {
      const columnNames = table.columns.map((column) => column.name.toLowerCase());
      const duplicateColumns = columnNames.filter((name, index) => columnNames.indexOf(name) !== index);
      if (!table.columns.some((column) => column.pk)) errors.push(`**${table.name}** has no primary key`);
      if (duplicateColumns.length) errors.push(`**${table.name}** repeats columns: ${[...new Set(duplicateColumns)].join(', ')}`);
      if (!/^[a-z][a-z0-9_]*$/.test(table.name)) warnings.push(`**${table.name}** does not use consistent snake_case naming`);
      if (table.columns.length > 18) warnings.push(`**${table.name}** is wide (${table.columns.length} columns); review its responsibilities`);

      table.columns.forEach((column) => {
        if (column.fk) {
          const target = newSchema.tables.find((candidate) => candidate.name === column.fk!.table);
          if (!target || !tableNames.has(column.fk.table.toLowerCase())) {
            errors.push(`\`${table.name}.${column.name}\` references missing table **${column.fk.table}**`);
          } else {
            const targetColumn = target.columns.find((candidate) => candidate.name === column.fk!.column);
            if (!targetColumn) {
              errors.push(`\`${table.name}.${column.name}\` references missing column \`${column.fk.table}.${column.fk.column}\``);
            } else if (targetColumn.type !== column.type && !/INT|SERIAL/.test(`${targetColumn.type} ${column.type}`)) {
              warnings.push(`Type mismatch between \`${table.name}.${column.name}\` and \`${target.name}.${targetColumn.name}\``);
            }
          }
          if (!column.indexed) recommendations.push(`Index foreign key \`${table.name}.${column.name}\``);
        }
        if (/email/i.test(column.name) && !column.unique) recommendations.push(`Consider a unique constraint on \`${table.name}.${column.name}\``);
        if (column.name.endsWith('_id') && !column.fk) warnings.push(`\`${table.name}.${column.name}\` looks like an unlinked foreign key`);
      });
    });

    const penalty = errors.length * 12 + warnings.length * 5 + recommendations.length * 2;
    const score = Math.max(0, 100 - penalty);
    return {
      schema: newSchema,
      response: `**Schema health audit — ${score}/100**

${errors.length ? `**Errors**\n${errors.map((item) => `• ${item}`).join('\n')}\n\n` : '**Errors**\n• None detected\n\n'}${warnings.length ? `**Warnings**\n${warnings.slice(0, 12).map((item) => `• ${item}`).join('\n')}\n\n` : ''}${recommendations.length ? `**Recommendations**\n${[...new Set(recommendations)].slice(0, 12).map((item) => `• ${item}`).join('\n')}` : '**Recommendations**\n• No immediate structural changes required'}

You can ask me to **add recommended indexes**, **add relationships**, or **review normalization**.`,
    };
  }

  if (intent === 'normalize') {
    if (newSchema.tables.length === 0) {
      return { schema: newSchema, response: 'There is no schema to normalize yet. Paste the assignment or requirements first.' };
    }
    const findings: string[] = [];
    newSchema.tables.forEach((table) => {
      const numberedGroups = table.columns.filter((column) => /\d+$/.test(column.name));
      const listColumns = table.columns.filter((column) => /(tags|items|phones|emails|categories|roles|permissions|ids)$/.test(column.name) && !column.name.endsWith('_id'));
      const jsonColumns = table.columns.filter((column) => /JSON/i.test(column.type));
      if (numberedGroups.length >= 2) findings.push(`**${table.name}** may contain repeating groups (${numberedGroups.map((column) => column.name).join(', ')}) — review 1NF`);
      if (listColumns.length) findings.push(`**${table.name}** may store multi-value data in ${listColumns.map((column) => `\`${column.name}\``).join(', ')} — consider child or bridge tables`);
      if (jsonColumns.length) findings.push(`**${table.name}** uses JSON in ${jsonColumns.map((column) => `\`${column.name}\``).join(', ')} — confirm the data is not relational or frequently queried`);
      if (table.columns.length > 18) findings.push(`**${table.name}** has ${table.columns.length} columns — check for mixed entities and transitive dependencies`);
    });
    const joinTables = newSchema.tables.filter((table) => table.columns.filter((column) => column.fk).length >= 2);
    return {
      schema: newSchema,
      response: `**Normalization review**

**First normal form (1NF)**
• Columns are modeled as atomic values unless noted below.

**Second and third normal form (2NF/3NF)**
• ${joinTables.length} associative table${joinTables.length === 1 ? '' : 's'} detected: ${joinTables.map((table) => `**${table.name}**`).join(', ') || 'none'}
• Foreign-key dependencies should describe one business subject per table.

${findings.length ? `**Items to review**\n${findings.map((finding) => `• ${finding}`).join('\n')}` : '**Result**\n• No obvious repeating groups, multi-value columns, or oversized entities were detected.'}

Normalization still depends on business meaning and functional dependencies. If you paste the original requirements, I can compare the design directly with those rules.`,
    };
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
    let wantDefaults = /\b(appropriate|necessary|default|typical|common|sensible|proper|relevant|suitable|good|standard|normal|basic|essential|required|needed|smart|full|complete)\b/i.test(req) ||
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
    const tableName = identifiers[0];

    if (!tableName) {
      return { schema: newSchema, response: `🤔 Which table's color? For example: "Set users color to blue"` };
    }

    const table = findTable(newSchema.tables, tableName);
    if (!table) {
      return { schema: newSchema, response: `⚠️ Table **${tableName}** not found.` };
    }

    return {
      schema: newSchema,
      response: `**${table.name}** uses the workspace's universal table color. Use categories to communicate business domains without introducing per-table colors.`,
    };
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
