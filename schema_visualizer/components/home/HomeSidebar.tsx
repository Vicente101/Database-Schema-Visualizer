import AddCircleIcon from '@solar-icons/react/icons/ui/AddCircle';
import ImportIcon from '@solar-icons/react/icons/arrows-action/Import';
import LayersMinimalisticIcon from '@solar-icons/react/icons/tools/LayersMinimalistic';
import Widget5Icon from '@solar-icons/react/icons/settings/Widget5';

interface HomeSidebarProps {
  schemaName?: string;
  tableCount: number;
  columnCount: number;
  relationshipCount: number;
  onResume: () => void;
  onCreate: () => void;
  onImport: () => void;
  onBrowseTemplates: () => void;
}

export function HomeSidebar({
  schemaName,
  tableCount,
  columnCount,
  relationshipCount,
  onResume,
  onCreate,
  onImport,
  onBrowseTemplates,
}: HomeSidebarProps) {
  return (
    <>
      <div className="sv-section sv-home-summary mx-2 mb-2 p-3">
        <div className="sv-sidebar-kicker">{tableCount ? 'Current project' : 'Welcome'}</div>
        <strong>{schemaName || 'Database Schema Designer'}</strong>
        <p>
          {tableCount
            ? `${tableCount} tables, ${columnCount} columns, and ${relationshipCount} relationships are ready to continue.`
            : 'Choose a blueprint, import SQL, or begin with a clean schema.'}
        </p>
        {tableCount > 0 && (
          <button className="sv-action-button" onClick={onResume}>
            <Widget5Icon size={14} weight="Linear" />
            Resume canvas
          </button>
        )}
      </div>
      <div className="sv-section sv-home-actions mx-2 mb-2 p-2.5">
        <div className="sv-sidebar-kicker">Start</div>
        <div className="sv-home-action-grid grid gap-1.5">
          <button className="sv-action-button flex cursor-pointer items-center gap-[7px] border border-[var(--border-soft)] p-2.5" onClick={onCreate}>
            <AddCircleIcon size={14} weight="Linear" />
            New schema
          </button>
          <button className="sv-action-button flex cursor-pointer items-center gap-[7px] border border-[var(--border-soft)] p-2.5" onClick={onImport}>
            <ImportIcon size={14} weight="Linear" />
            Import SQL or JSON
          </button>
          <button className="sv-action-button flex cursor-pointer items-center gap-[7px] border border-[var(--border-soft)] p-2.5" onClick={onBrowseTemplates}>
            <LayersMinimalisticIcon size={14} weight="Linear" />
            Browse templates
          </button>
        </div>
      </div>
    </>
  );
}
