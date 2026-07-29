import ChatRoundDotsIcon from '@solar-icons/react/icons/messages/ChatRoundDots';
import Pen2Icon from '@solar-icons/react/icons/messages/Pen2';
import type { RightPanelView } from '../../types/workspace';

interface InspectorSwitcherProps {
  activeView: RightPanelView;
  onChange: (view: RightPanelView) => void;
}

export function InspectorSwitcher({ activeView, onChange }: InspectorSwitcherProps) {
  return (
    <div className="sv-right-panel-switcher" role="tablist" aria-label="Inspector panels">
      <button
        role="tab"
        aria-selected={activeView === 'editor'}
        data-active={activeView === 'editor'}
        onClick={() => onChange('editor')}
      >
        <Pen2Icon size={14} weight="Linear" />
        Table editor
      </button>
      <button
        role="tab"
        aria-selected={activeView === 'assistant'}
        data-active={activeView === 'assistant'}
        onClick={() => onChange('assistant')}
      >
        <ChatRoundDotsIcon size={14} weight="Linear" />
        Assistant
      </button>
    </div>
  );
}
