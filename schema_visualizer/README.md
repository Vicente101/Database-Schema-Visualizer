# Schema Visualizer

> Workspace component: Schema Visualizer

This folder contains the Schema Visualizer window and related assets.

- Open `SchemaVisualizerWindow.tsx` to view the React/TypeScript component.# Schema Visualizer

AI-powered database schema designer with interactive canvas, natural language editing, and professional exports.

## Features

### 🎨 Visual Schema Design
- **Interactive Canvas** - Drag tables, zoom, pan with mouse/touchpad
- **Relationship Lines** - Automatic FK relationship visualization with curved connectors
- **Color Coding** - Each table has a unique color, customizable per table
- **Auto-Layout** - Smart positioning of tables to minimize overlap

### 📁 Table Categories & Grouping
- **Visual Grouping** - Tables in the same category are grouped with colored backgrounds
- **Auto-Categorize** - Smart detection using 13 semantic patterns (User Management, Orders & Sales, Products, Content, etc.)
- **Custom Categories** - Create named categories with custom colors and descriptions
- **Editable Categories** - Click the ✏️ edit button to add/remove tables from any category
- **Category Dragging** - Drag entire category groups on the canvas
- **Toggle Visibility** - Show/hide category backgrounds on the canvas
- **Smart Suggestions** - AI suggests tables based on category name patterns

### 🤖 AI-Powered Editing
- **Natural Language Commands** - "Add a users table with email, name, and password"
- **Context Awareness** - "Add relationships to the new tables"
- **Smart Suggestions** - Auto-detects potential FK relationships
- **Intent Detection** - Understands add, modify, delete, rename operations

### 📦 Import/Export
- **SQL Import** - Paste or upload `.sql` DDL files (CREATE TABLE statements)
- **JSON Import/Export** - Full-fidelity backup with positions, colors, relationships, categories
- **SQL Export** - Generate clean DDL with foreign key constraints
- **PowerPoint Export** - Professional dark-themed presentations with:
  - Title slide with stats
  - Schema overview with table cards
  - Relationships diagram
  - Individual table detail slides
  - Summary slide

### 💾 Save & Load
- **Local Storage** - Save schemas to browser for later use
- **Multiple Schemas** - Store and switch between different projects
- **Templates** - 10 pre-built schemas (E-Commerce, Blog, HR, CRM, ERP, etc.)

## Installation

**No dependencies required!** This is a single-file React component.

1. Download the `schema_visualizer` folder
2. Place it in your ContextUI workflows directory
3. Open ContextUI - Schema Visualizer will appear in your workflow list

## Usage

### Quick Start
1. **Use a Template** - Click any template card on the welcome screen
2. **Import SQL** - Click "Import" and select a `.sql` file
3. **Create from Scratch** - Use the AI chat: "Create a users table with id, email, and name"

### Table Categories
1. **Auto-Detect** - Click "⚡ Auto-Group" to smart-group tables using 13 semantic patterns
2. **Create Manually** - Click "📁 Category" to create a custom category with selected tables
3. **Edit Category** - Click the ✏️ button on any category to add/remove tables
4. **Drag Categories** - Click and drag the category label on the canvas to move all tables together
5. **Toggle Display** - Click the 👁️ button to show/hide category backgrounds on canvas
6. **Rearrange** - Click "📐 Rearrange by Category" to auto-layout tables in organized clusters

### AI Chat Commands (Examples)
- "Add a products table with name, price, and description"
- "Add a category_id foreign key to products referencing categories"
- "Rename the users table to customers"
- "Add an email column to the orders table"
- "Delete the reviews table"
- "Show me the relationships"

### Export Options
- **📥 SQL** - Download DDL for database creation
- **📦 JSON** - Full backup (recommended for re-importing, includes categories)
- **📊 PowerPoint** - Professional presentation for documentation

## File Structure

```
schema_visualizer/
├── SchemaVisualizerWindow.tsx    # Main React component (self-contained)
├── SchemaVisualizerWindow.meta.json  # ContextUI metadata
└── README.md                     # This file
```

## Technical Details

- **Framework**: React (provided by ContextUI runtime)
- **External CDN**: JSZip (loaded on-demand for PowerPoint export only)
- **Storage**: Browser localStorage for saved schemas
- **No Backend Required**: Runs entirely in the browser
- **Union-Find Algorithm**: Used for auto-detecting related table groups via FK relationships

## Templates Included

| Template | Tables | Description |
|----------|--------|-------------|
| 🛒 E-Commerce | 6 | Users, Products, Orders, Categories, Reviews |
| 📝 Blog | 5 | Authors, Posts, Comments, Categories, Tags |
| 👥 Social | 6 | Users, Posts, Comments, Likes, Follows, Messages |
| 🏢 HR | 5 | Employees, Departments, Positions, Attendance, Payroll |
| 📞 CRM | 5 | Contacts, Companies, Deals, Tasks, Notes |
| 📦 Inventory | 5 | Products, Warehouses, Stock, Suppliers, Movements |
| 🏥 Healthcare | 6 | Patients, Doctors, Appointments, Records, Prescriptions |
| 🎓 Education | 6 | Students, Courses, Enrollments, Grades, Teachers |
| 📋 Project | 5 | Projects, Tasks, Users, Comments, Attachments |
| 🏢 ERP | 16 | Complete enterprise system with GL, AP, AR, Inventory |

## Browser Compatibility

Works in all modern browsers:
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

MIT - Free for personal and commercial use.
