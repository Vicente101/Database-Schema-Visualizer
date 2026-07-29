import AddCircleIcon from '@solar-icons/react/icons/ui/AddCircle';
import AltArrowDownIcon from '@solar-icons/react/icons/arrows/AltArrowDown';
import AltArrowUpIcon from '@solar-icons/react/icons/arrows/AltArrowUp';
import CloseCircleIcon from '@solar-icons/react/icons/ui/CloseCircle';
import CopyIcon from '@solar-icons/react/icons/ui/Copy';
import DatabaseIcon from '@solar-icons/react/icons/ui/Database';
import FolderIcon from '@solar-icons/react/icons/folders/Folder';
import LinkRoundAngleIcon from '@solar-icons/react/icons/text-formatting/LinkRoundAngle';
import Pen2Icon from '@solar-icons/react/icons/messages/Pen2';
import TrashBinMinimalisticIcon from '@solar-icons/react/icons/ui/TrashBinMinimalistic';
import type { Column, Table, TableCategory } from '../../types/workspace';

interface TableEditorPanelProps {
  visible: boolean;
  table?: Table;
  categories: TableCategory[];
  onClose: () => void;
  onRename: (tableName: string, nextName: string) => void;
  onDuplicate: (tableName: string) => void;
  onDeleteTable: (tableName: string) => void;
  onAssignCategory: (tableName: string, categoryId: string | null) => void;
  onCreateCategory: () => void;
  onMoveColumnUp: (tableName: string, columnIndex: number) => void;
  onMoveColumnDown: (tableName: string, columnIndex: number) => void;
  onTogglePrimaryKey: (tableName: string, columnName: string) => void;
  onToggleUnique: (tableName: string, columnName: string) => void;
  onToggleIndex: (tableName: string, columnName: string) => void;
  onToggleNullable: (tableName: string, columnName: string) => void;
  onEditColumn: (tableName: string, column: Column, columnIndex: number) => void;
  onDeleteColumn: (tableName: string, columnName: string) => void;
  onRemoveForeignKey: (tableName: string, columnName: string) => void;
  onAddColumn: () => void;
}

export function TableEditorPanel({
  visible,
  table,
  categories,
  onClose,
  onRename,
  onDuplicate,
  onDeleteTable,
  onAssignCategory,
  onCreateCategory,
  onMoveColumnUp,
  onMoveColumnDown,
  onTogglePrimaryKey,
  onToggleUnique,
  onToggleIndex,
  onToggleNullable,
  onEditColumn,
  onDeleteColumn,
  onRemoveForeignKey,
  onAddColumn,
}: TableEditorPanelProps) {
  return (
    <div
      className="sv-right-editor flex-1 overflow-auto border-b border-white/8 p-4"
      data-visible={visible}
    >
      <div className="sv-editor-heading mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-slate-500">
        <Pen2Icon size={15} weight="Linear" />
        <span className="flex-1">Table Editor</span>
        <button className="sv-mobile-panel-close" onClick={onClose} aria-label="Close table editor" title="Close table editor">
          <CloseCircleIcon size={17} weight="Linear" />
        </button>
      </div>

      {table ? (
        <>
          <div className="sv-table-editor-header mb-3 flex items-center gap-2">
            <div className="sv-table-identity" aria-hidden="true">
              <DatabaseIcon size={18} weight="Linear" />
            </div>
            <label className="sv-table-name-field">
              <span>Table name</span>
              <input
                type="text"
                key={table.name}
                defaultValue={table.name}
                onBlur={(event) => onRename(table.name, event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && (event.target as HTMLInputElement).blur()}
                className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200"
              />
            </label>
            <button className="sv-editor-icon-button cursor-pointer rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-400" onClick={() => onDuplicate(table.name)} title="Duplicate table" aria-label="Duplicate table">
              <CopyIcon size={15} weight="Linear" />
            </button>
            <button className="sv-editor-icon-button sv-danger-action cursor-pointer rounded-md border border-red-600/20 bg-red-600/10 px-2 py-1.5 text-[11px] text-red-400" onClick={() => onDeleteTable(table.name)} title="Delete table" aria-label="Delete table">
              <TrashBinMinimalisticIcon size={15} weight="Linear" />
            </button>
          </div>

          <div className="sv-editor-card sv-category-assignment mb-3 flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2">
            <FolderIcon size={14} weight="Linear" />
            <span className="sv-editor-field-label text-[11px] text-slate-500">Category</span>
            <select
              aria-label="Table category"
              value={table.category || ''}
              onChange={(event) => onAssignCategory(table.name, event.target.value || null)}
              className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200"
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <button className="sv-editor-icon-button cursor-pointer rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-400" onClick={onCreateCategory} title="Create new category" aria-label="Create new category">
              <AddCircleIcon size={14} weight="Linear" />
            </button>
          </div>

          <div className="sv-columns-section text-xs">
            <div className="sv-columns-heading">
              <span>Columns</span>
              <span>{table.columns.length} total</span>
            </div>
            {table.columns.map((column, index) => (
              <div
                className="sv-column-card border-b border-slate-800 py-2"
                data-key-column={column.pk || undefined}
                data-foreign-column={!!column.fk || undefined}
                key={column.name}
              >
                <div className="sv-column-row flex items-center gap-1">
                  <div className="sv-column-reorder flex flex-col">
                    <button
                      onClick={() => onMoveColumnUp(table.name, index)}
                      disabled={index === 0}
                      title="Move column up"
                      aria-label={`Move ${column.name} up`}
                      className="cursor-pointer border-0 bg-transparent px-1 leading-none text-slate-500 disabled:cursor-default disabled:text-slate-700"
                    >
                      <AltArrowUpIcon size={10} weight="Linear" />
                    </button>
                    <button
                      onClick={() => onMoveColumnDown(table.name, index)}
                      disabled={index >= table.columns.length - 1}
                      title="Move column down"
                      aria-label={`Move ${column.name} down`}
                      className="cursor-pointer border-0 bg-transparent px-1 leading-none text-slate-500 disabled:cursor-default disabled:text-slate-700"
                    >
                      <AltArrowDownIcon size={10} weight="Linear" />
                    </button>
                  </div>
                  <span className="sv-column-kind w-[18px] text-[10px] font-semibold" data-kind={column.pk ? 'pk' : column.fk ? 'fk' : column.unique ? 'uq' : column.indexed ? 'ix' : 'column'}>
                    {column.pk ? 'PK' : column.fk ? 'FK' : column.unique ? 'UQ' : column.indexed ? 'IX' : '•'}
                  </span>
                  <span className="sv-column-name flex-1 text-[11px] font-medium">{column.name}</span>
                  <span className="sv-column-type rounded bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{column.type}</span>
                  <button className="sv-constraint-toggle px-1 py-0.5 text-[9px] font-semibold" data-active={column.pk || undefined} data-tone="primary" onClick={() => onTogglePrimaryKey(table.name, column.name)} title="Toggle primary key" aria-pressed={!!column.pk}>PK</button>
                  <button className="sv-constraint-toggle px-1 py-0.5 text-[9px] font-semibold" data-active={column.unique || undefined} data-tone="unique" onClick={() => onToggleUnique(table.name, column.name)} title="Toggle unique constraint" aria-pressed={!!column.unique}>UQ</button>
                  <button className="sv-constraint-toggle px-1 py-0.5 text-[9px] font-semibold disabled:opacity-35" data-active={column.indexed || undefined} data-tone="index" onClick={() => onToggleIndex(table.name, column.name)} title="Toggle index" aria-pressed={!!column.indexed} disabled={column.pk || column.unique}>IX</button>
                  <button className="sv-constraint-toggle px-1 py-0.5 text-[9px] font-semibold" data-active={!column.nullable || undefined} data-tone="required" onClick={() => onToggleNullable(table.name, column.name)} title={column.nullable ? 'Make required' : 'Allow null values'} aria-pressed={!column.nullable}>{column.nullable ? 'NULL' : 'REQ'}</button>
                  <button className="sv-column-action cursor-pointer border-0 bg-transparent px-1 py-0.5 text-slate-500" onClick={() => onEditColumn(table.name, { ...column }, index)} title="Edit column" aria-label={`Edit ${column.name}`}>
                    <Pen2Icon size={12} weight="Linear" />
                  </button>
                  <button className="sv-column-action sv-danger-action cursor-pointer border-0 bg-transparent px-1 py-0.5 text-slate-500" onClick={() => onDeleteColumn(table.name, column.name)} title="Delete column" aria-label={`Delete ${column.name}`}>
                    <TrashBinMinimalisticIcon size={12} weight="Linear" />
                  </button>
                </div>

                {column.fk && (
                  <div className="sv-fk-row ml-7 mt-1.5 flex items-center gap-1.5 rounded border border-sky-400/20 bg-sky-400/5 px-2.5 py-1.5">
                    <LinkRoundAngleIcon size={14} weight="Linear" />
                    <span className="sv-fk-label text-[10px] font-medium text-sky-400">References</span>
                    <span className="sv-fk-target rounded bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-slate-200">
                      {column.fk.table}.{column.fk.column}
                    </span>
                    <div className="flex-1" />
                    <button className="sv-fk-remove flex cursor-pointer items-center gap-1 rounded border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-medium text-red-400" onClick={() => onRemoveForeignKey(table.name, column.name)} title="Remove foreign key">
                      <CloseCircleIcon size={10} weight="Linear" />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button className="sv-add-column-button mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 border border-dashed border-slate-700 bg-transparent px-3 py-2.5 text-xs text-slate-500" onClick={onAddColumn}>
            <AddCircleIcon size={14} weight="Linear" />
            Add Column
          </button>
        </>
      ) : (
        <div className="sv-editor-card rounded-lg border border-dashed border-slate-700 bg-slate-950 p-6 text-center text-[13px] text-slate-500">
          <DatabaseIcon size={34} weight="Linear" className="mb-3" />
          <div>Select a table to edit</div>
        </div>
      )}
    </div>
  );
}
