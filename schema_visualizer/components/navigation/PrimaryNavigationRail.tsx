import CodeSquareIcon from '@solar-icons/react/icons/it/CodeSquare';
import DatabaseIcon from '@solar-icons/react/icons/ui/Database';
import ExportIcon from '@solar-icons/react/icons/arrows-action/Export';
import FolderOpenIcon from '@solar-icons/react/icons/folders/FolderOpen';
import FolderWithFilesIcon from '@solar-icons/react/icons/folders/FolderWithFiles';
import Home2Icon from '@solar-icons/react/icons/ui/Home2';
import LayersMinimalisticIcon from '@solar-icons/react/icons/tools/LayersMinimalistic';
import MoonIcon from '@solar-icons/react/icons/weather/Moon';
import Sun2Icon from '@solar-icons/react/icons/weather/Sun2';
import Widget5Icon from '@solar-icons/react/icons/settings/Widget5';
import type { SidebarTab, ThemeMode } from '../../types/workspace';

const NAVIGATION_ITEMS: Array<{
  id: SidebarTab;
  label: string;
  icon: typeof Home2Icon;
}> = [
  { id: 'home', label: 'Home', icon: Home2Icon },
  { id: 'design', label: 'Design', icon: Widget5Icon },
  { id: 'organize', label: 'Organize', icon: FolderWithFilesIcon },
  { id: 'templates', label: 'Templates', icon: LayersMinimalisticIcon },
  { id: 'projects', label: 'Projects', icon: FolderOpenIcon },
  { id: 'sql', label: 'SQL', icon: CodeSquareIcon },
  { id: 'export', label: 'Ship', icon: ExportIcon },
];

interface PrimaryNavigationRailProps {
  activeTab: SidebarTab;
  theme: ThemeMode;
  onSelect: (tab: SidebarTab) => void;
  onToggleTheme: () => void;
}

export function PrimaryNavigationRail({
  activeTab,
  theme,
  onSelect,
  onToggleTheme,
}: PrimaryNavigationRailProps) {
  return (
    <nav className="sv-nav-rail" aria-label="Workspace sections">
      <div className="sv-rail-brand grid place-items-center" title="Schema Visualizer">
        <DatabaseIcon size={25} weight="Linear" />
      </div>
      {NAVIGATION_ITEMS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className="sv-rail-button"
          data-active={activeTab === id}
          data-tooltip={label}
          onClick={() => onSelect(id)}
          aria-current={activeTab === id ? 'page' : undefined}
          title={label}
        >
          <Icon size={19} weight="Linear" />
          <span>{label}</span>
        </button>
      ))}
      <div className="sv-rail-spacer flex-1" />
      <button
        className="sv-rail-button"
        data-active="false"
        data-tooltip={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
        aria-label={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
      >
        {theme === 'dark' ? <Sun2Icon size={19} weight="Linear" /> : <MoonIcon size={19} weight="Linear" />}
        <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
      </button>
    </nav>
  );
}
