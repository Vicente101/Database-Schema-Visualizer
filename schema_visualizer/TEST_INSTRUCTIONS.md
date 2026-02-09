# Schema Visualizer AI - Test Instructions

## Changes Made

I've fixed several critical issues with the AI table creation logic:

### 1. **Improved Intent Detection Order**
   - Fixed the order of checks to prevent misclassification
   - "add X to Y" now correctly detected as add_column before create_table
   - Better patterns for detecting multiple tables vs single table

### 2. **Enhanced Create Tables Functionality**
   - Now correctly parses comma-separated table names
   - Always provides default columns for better UX (no more empty tables)
   - Improved context-based table inference (e.g., "build an e-commerce database")
   - Better handling of "appropriate columns" requests

### 3. **Fixed Create Single Table**
   - Improved column extraction from "table with X, Y, Z" patterns
   - Always ensures minimum columns (id, name, timestamps) if template is empty
   - Better handling of explicit column specifications
   - Adds timestamps automatically when not specified

### 4. **Better Column Defaults**
   - Tables now always get proper default columns
   - Smart inference based on table name (users get email, password_hash, etc.)
   - Fallback to basic columns if no template matches

## Test Cases

Please test the following AI commands:

### Basic Table Creation
1. ✅ "Create a users table"
   - Should create users with id, email, name, password_hash, etc.

2. ✅ "Create tables products, orders, customers"
   - Should create 3 tables with appropriate columns

3. ✅ "I need a blog database"
   - Should infer and create authors, posts, comments, etc.

4. ✅ "Create users, products, and orders with appropriate columns"
   - Should create all 3 with full column sets

### Advanced Creation
5. ✅ "Create orders table with order_number, total, status"
   - Should create with specified columns plus id and timestamps

6. ✅ "Build an e-commerce schema"
   - Should create users, products, categories, orders, order_items, cart

7. ✅ "Create a customers table with name email phone address"
   - Should parse all 4 columns plus add id

### Column Operations
8. ✅ "Add email column to customers"
   - Should add the column (not create a table)

9. ✅ "Add description and price to products"
   - Should add multiple columns

### Relationships
10. ✅ "Link them together" (after creating tables)
    - Should auto-wire foreign keys

11. ✅ "Add relationships to the new tables"
    - Should create FKs based on column names

## Issues Fixed

### Before:
- ❌ "Create tables users, products" - would fail to parse table names
- ❌ Some tables created with 0 columns
- ❌ "appropriate columns" sometimes ignored
- ❌ "Create X with Y, Z" would fail to parse columns

### After:
- ✅ All table creation commands parse correctly
- ✅ All tables get proper default columns
- ✅ "appropriate/default/smart columns" always respected
- ✅ Column parsing works with various formats

## Expected Behavior

1. **Always Get Columns**: Every table should have at least id, name, and created_at
2. **Smart Defaults**: Tables like "users" automatically get email, password_hash, etc.
3. **Multiple Tables**: Comma-separated lists work reliably
4. **Context Inference**: "blog database" creates relevant tables
5. **Explicit Columns**: "with X, Y, Z" correctly parses all columns

## Testing in the App

1. Start the app and navigate to the Schema Visualizer
2. Use the AI chat box on the right side
3. Try each test case above
4. Verify tables are created with proper columns
5. Check that relationships can be added
6. Ensure no empty tables are created

## Known Limitations

- Maximum 10 tables in context memory at once
- Complex SQL patterns in "table with" might need tweaking
- Category auto-assignment is best-effort based on table names
