import CodeFileIcon from '@solar-icons/react/icons/files/CodeFile';
import CodeSquareIcon from '@solar-icons/react/icons/it/CodeSquare';
import CopyIcon from '@solar-icons/react/icons/ui/Copy';
import DatabaseIcon from '@solar-icons/react/icons/ui/Database';
import FileCheckIcon from '@solar-icons/react/icons/files/FileCheck';
import MagicStick2Icon from '@solar-icons/react/icons/ui/MagicStick2';
import Pen2Icon from '@solar-icons/react/icons/messages/Pen2';
import PlayIcon from '@solar-icons/react/icons/video/Play';
import RefreshIcon from '@solar-icons/react/icons/arrows/Refresh';
import type { SqlRunResult, SqlWorkspacePanel } from '../../types/workspace';

interface SqlWorkspaceProps {
  panel: SqlWorkspacePanel;
  sqlCode: string;
  runResult: SqlRunResult | null;
  onPanelChange: (panel: SqlWorkspacePanel) => void;
  onSqlChange: (sql: string) => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onRun: () => void;
  onViewCanvas: () => void;
}

export function SqlWorkspace({
  panel,
  sqlCode,
  runResult,
  onPanelChange,
  onSqlChange,
  onRegenerate,
  onCopy,
  onRun,
  onViewCanvas,
}: SqlWorkspaceProps) {
  return (
    <div className="sv-sql-page">
      <header className="sv-sql-page-header">
        <CodeSquareIcon size={21} weight="Linear" />
        <div className="sv-sql-page-title">
          <strong>SQL workspace</strong>
          <span>Validate DDL locally, apply it to the schema canvas, and diagnose errors before database deployment.</span>
        </div>
        <div className="sv-sql-page-tabs" aria-label="SQL workspace sections">
          <button data-active={panel === 'editor'} onClick={() => onPanelChange('editor')}>
            <CodeFileIcon size={14} weight="Linear" />
            Editor
          </button>
          <button data-active={panel === 'results'} onClick={() => onPanelChange('results')}>
            <FileCheckIcon size={14} weight="Linear" />
            Results
            {runResult?.status === 'error' ? ` (${runResult.diagnostics?.length || 1})` : ''}
          </button>
        </div>
      </header>
      <div className="sv-sql-page-body">
        {panel === 'editor' ? (
          <div className="sv-sql-editor-layout">
            <section className="sv-sql-editor-shell" aria-label="SQL editor">
              <div className="sv-sql-toolbar">
                <button onClick={onRegenerate} title="Replace the editor with SQL generated from the canvas">
                  <RefreshIcon size={14} weight="Linear" />
                  Regenerate
                </button>
                <button onClick={onCopy}>
                  <CopyIcon size={14} weight="Linear" />
                  Copy
                </button>
                <button className="sv-sql-run-button" onClick={onRun}>
                  <PlayIcon size={14} weight="Linear" />
                  Run script
                </button>
                <span>{sqlCode.split('\n').length} lines · local DDL runner</span>
              </div>
              <textarea
                className="sv-sql-editor"
                value={sqlCode}
                onChange={(event) => onSqlChange(event.target.value)}
                aria-label="SQL script"
                spellCheck={false}
                placeholder={'CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255) UNIQUE NOT NULL\n);'}
              />
            </section>
            <aside className="sv-sql-context" aria-label="SQL runner guidance">
              <section className="sv-sql-context-card">
                <strong>What the runner supports</strong>
                <ul>
                  <li>CREATE TABLE and constraints</li>
                  <li>Primary, unique, and foreign keys</li>
                  <li>CREATE INDEX metadata</li>
                </ul>
                <p className="sv-sql-safety-note">Runs locally in the browser. No external database is contacted or modified.</p>
              </section>
            </aside>
          </div>
        ) : (
          <div className="sv-sql-results" aria-live="polite">
            {runResult ? (
              <>
                <section className="sv-sql-result-summary" data-status={runResult.status}>
                  {runResult.status === 'error'
                    ? <CodeSquareIcon size={20} weight="Linear" />
                    : <FileCheckIcon size={20} weight="Linear" />}
                  <div>
                    <strong>{runResult.title}</strong>
                    <p>{runResult.detail}</p>
                  </div>
                </section>
                {runResult.diagnostics && runResult.diagnostics.length > 0 && (
                  <div className="sv-sql-diagnostics">
                    {runResult.diagnostics.map((diagnostic, index) => (
                      <article className="sv-sql-diagnostic" key={`${diagnostic.code}-${diagnostic.line}-${index}`}>
                        <div className="sv-sql-diagnostic-location">
                          Line {diagnostic.line}
                          {diagnostic.column ? <><br />Column {diagnostic.column}</> : null}
                        </div>
                        <div>
                          <strong>{diagnostic.message}</strong>
                          <p>{diagnostic.suggestion}</p>
                          {diagnostic.excerpt && <code>{diagnostic.excerpt}</code>}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {runResult.assistantGuidance && (
                  <section className="sv-sql-assistant-diagnosis">
                    <MagicStick2Icon size={17} weight="Linear" />
                    <div>
                      <strong>Assistant diagnosis</strong>
                      <p>{runResult.assistantGuidance}</p>
                    </div>
                  </section>
                )}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button className="sv-sql-run-button" onClick={() => onPanelChange('editor')}>
                    <Pen2Icon size={14} weight="Linear" />
                    {runResult.status === 'error' ? 'Fix in editor' : 'Review script'}
                  </button>
                  {runResult.status === 'success' && (
                    <button className="sv-sql-run-button" onClick={onViewCanvas}>
                      <DatabaseIcon size={14} weight="Linear" />
                      View schema canvas
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="sv-sql-results-empty">
                <div>
                  <FileCheckIcon size={30} weight="Linear" />
                  <strong className="mt-3 block text-[13px] text-[var(--text-primary)]">No run results yet</strong>
                  <p className="mx-auto mb-3.5 mt-[7px] max-w-[380px] text-[10px] leading-[1.55]">Run the script to validate table definitions, relationships, syntax structure, and supported indexes.</p>
                  <button className="sv-sql-run-button" onClick={() => onPanelChange('editor')}>
                    <CodeSquareIcon size={14} weight="Linear" />
                    Open editor
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
