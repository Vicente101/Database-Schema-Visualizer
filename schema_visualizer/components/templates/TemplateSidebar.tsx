import { useMemo, useState } from 'react';
import AltArrowDownIcon from '@solar-icons/react/icons/arrows/AltArrowDown';
import MagnifierIcon from '@solar-icons/react/icons/search/Magnifier';
import LayersMinimalisticIcon from '@solar-icons/react/icons/tools/LayersMinimalistic';
import { TEMPLATE_CATALOG, type TemplateCatalogItem } from '../../data/templateCatalog';

interface TemplateSidebarProps {
  activeTemplate: string;
  loadingTemplate?: string;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (templateKey: string) => void;
}

export function TemplateSidebar({
  activeTemplate,
  loadingTemplate = '',
  expanded,
  onToggle,
  onSelect,
}: TemplateSidebarProps) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? TEMPLATE_CATALOG.filter((template) =>
          `${template.label} ${template.group}`.toLowerCase().includes(normalizedQuery),
        )
      : TEMPLATE_CATALOG;

    return filtered.reduce<Array<{ name: string; templates: TemplateCatalogItem[] }>>(
      (result, template) => {
        const currentGroup = result.find((group) => group.name === template.group);
        if (currentGroup) currentGroup.templates.push(template);
        else result.push({ name: template.group, templates: [template] });
        return result;
      },
      [],
    );
  }, [query]);

  return (
    <section className="sv-section mx-2 mb-2 overflow-hidden">
      <button
        className="sv-section-toggle flex w-full cursor-pointer items-center justify-between border-0 px-3 py-2.5"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 text-xs font-semibold">
          <LayersMinimalisticIcon size={15} weight="Linear" />
          Templates
          <span className="rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[9px] text-slate-400">
            {TEMPLATE_CATALOG.length}
          </span>
        </span>
        <AltArrowDownIcon
          size={13}
          className={`text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="animate-[fadeIn_180ms_ease-out] px-2 pb-2">
          <label className="relative mb-2 block">
            <MagnifierIcon
              size={14}
              weight="Linear"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a template"
              aria-label="Search templates"
              className="h-8 w-full border border-[var(--border-soft)] bg-[var(--surface-raised)] pl-8 pr-2 text-[10px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--icon-color)]"
            />
          </label>

          <div className="space-y-2.5">
            {groups.map((group) => (
              <section
                key={group.name}
                className="[contain-intrinsic-size:auto_96px] [content-visibility:auto]"
              >
                <h3 className="mb-1.5 px-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {group.name}
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.templates.map((template) => (
                    <button
                      className="sv-action-button min-h-8 cursor-pointer border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2 py-1.5 text-left text-[10px] font-medium leading-tight text-[var(--text-secondary)] transition-colors data-[active=true]:border-[var(--icon-color)] data-[active=true]:bg-[var(--surface-control)] data-[active=true]:text-[var(--text-primary)]"
                      data-active={activeTemplate === template.key}
                      disabled={Boolean(loadingTemplate)}
                      key={template.key}
                      onClick={() => onSelect(template.key)}
                      title={`Load the ${template.label} schema template`}
                    >
                      {loadingTemplate === template.key ? 'Loading…' : template.label}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {groups.length === 0 && (
            <p className="m-0 border border-dashed border-[var(--border-soft)] px-3 py-5 text-center text-[10px] text-[var(--text-muted)]">
              No templates match “{query.trim()}”.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
