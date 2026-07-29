import MagicStick2Icon from '@solar-icons/react/icons/ui/MagicStick2';
import type { SqlRunResult } from '../../types/workspace';

interface SqlSidebarProps {
  sqlCode: string;
  runResult: SqlRunResult | null;
}

export function SqlSidebar({ sqlCode, runResult }: SqlSidebarProps) {
  const tableCount = sqlCode.match(/\bCREATE\s+TABLE\b/gi)?.length || 0;

  return (
    <div className="sv-section sv-sql-flow mx-2 mb-2 p-2.5">
      <div className="sv-sidebar-kicker">Simple SQL workflow</div>
      <ol>
        <li><span>1</span><div><strong>Edit</strong><small>Write DDL or use the current canvas.</small></div></li>
        <li><span>2</span><div><strong>Run</strong><small>Validate and apply supported statements.</small></div></li>
        <li><span>3</span><div><strong>Review</strong><small>Fix errors or return to the canvas.</small></div></li>
      </ol>
      <div className="sv-sql-flow-status">
        <span>{sqlCode.split('\n').length} lines</span>
        <span>{tableCount} tables</span>
        <strong data-status={runResult?.status || 'idle'}>{runResult ? runResult.status : 'Not run'}</strong>
      </div>
      <p><MagicStick2Icon size={14} weight="Linear" /> Errors include a source line and Assistant guidance.</p>
    </div>
  );
}
