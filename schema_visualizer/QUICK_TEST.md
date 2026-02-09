## Quick AI Test Cases for Schema Visualizer

Copy and paste these into the AI chat to test:

### Test 1: Create multiple tables
```
Create tables users, products, orders with appropriate columns
```
**Expected**: Should create 3 tables, each with 5-8 relevant columns

### Test 2: Create single table
```
Create a customers table
```
**Expected**: Should create customers with id, name, email, phone, address, created_at, etc.

### Test 3: Context-based creation
```
I need an e-commerce database
```
**Expected**: Should create users, products, categories, orders, order_items, cart (6 tables)

### Test 4: Explicit columns
```
Create invoices table with invoice_number, amount, due_date, status
```
**Expected**: Should create invoices with the 4 specified columns plus id and timestamps

### Test 5: Add relationships
```
link them together
```
**Expected**: Should auto-wire foreign keys between the previously created tables

### Test 6: Add column
```
add description to products
```
**Expected**: Should add description column to products table (not create a new table)

---

## What Was Fixed

✅ **Intent Detection**: Now correctly identifies create vs add operations  
✅ **Column Parsing**: Handles "with X, Y, Z" format properly  
✅ **Default Columns**: Always adds appropriate columns based on table name  
✅ **Multiple Tables**: Correctly parses comma-separated table names  
✅ **Empty Tables Fixed**: No more tables created with 0 columns  
✅ **Smart Defaults**: "appropriate columns" always respected
