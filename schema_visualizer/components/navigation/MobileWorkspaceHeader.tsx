import CloseCircleIcon from '@solar-icons/react/icons/ui/CloseCircle';
import DatabaseIcon from '@solar-icons/react/icons/ui/Database';
import HamburgerMenuIcon from '@solar-icons/react/icons/ui/HamburgerMenu';
import MoonIcon from '@solar-icons/react/icons/weather/Moon';
import Sun2Icon from '@solar-icons/react/icons/weather/Sun2';
import type { ThemeMode } from '../../types/workspace';

interface MobileWorkspaceHeaderProps {
  projectName?: string;
  tableCount: number;
  relationshipCount: number;
  theme: ThemeMode;
  drawerOpen: boolean;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onToggleTheme: () => void;
}

export function MobileWorkspaceHeader({
  projectName,
  tableCount,
  relationshipCount,
  theme,
  drawerOpen,
  onOpenDrawer,
  onCloseDrawer,
  onToggleTheme,
}: MobileWorkspaceHeaderProps) {
  return (
    <>
      <header className="sv-mobile-topbar">
        <button
          className="sv-mobile-menu-button"
          onClick={onOpenDrawer}
          aria-label="Open workspace tools"
          aria-expanded={drawerOpen}
        >
          <HamburgerMenuIcon size={20} weight="Linear" />
        </button>
        <div className="sv-mobile-project">
          <strong>{projectName || 'Schema Designer'}</strong>
          <span>{tableCount} tables · {relationshipCount} relations</span>
        </div>
        <button
          className="sv-mobile-theme-button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
        >
          {theme === 'dark' ? <Sun2Icon size={18} weight="Linear" /> : <MoonIcon size={18} weight="Linear" />}
        </button>
      </header>

      <button
        className="sv-mobile-drawer-scrim"
        data-open={drawerOpen}
        onClick={onCloseDrawer}
        aria-label="Close workspace drawer"
        tabIndex={drawerOpen ? 0 : -1}
      />
    </>
  );
}

export function MobileDrawerHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="sv-mobile-drawer-header">
      <div>
        <DatabaseIcon size={20} weight="Linear" />
        <span>Workspace tools</span>
      </div>
      <button onClick={onClose} aria-label="Close workspace drawer">
        <CloseCircleIcon size={19} weight="Linear" />
      </button>
    </div>
  );
}
