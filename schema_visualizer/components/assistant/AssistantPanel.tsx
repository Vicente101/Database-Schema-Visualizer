import type { KeyboardEventHandler, RefObject } from 'react';
import ChatRoundDotsIcon from '@solar-icons/react/icons/messages/ChatRoundDots';
import CloseCircleIcon from '@solar-icons/react/icons/ui/CloseCircle';
import EraserSquareIcon from '@solar-icons/react/icons/text-formatting/EraserSquare';
import FileTextIcon from '@solar-icons/react/icons/files/FileText';
import MagicStick2Icon from '@solar-icons/react/icons/ui/MagicStick2';
import SendSquareIcon from '@solar-icons/react/icons/arrows-action/SendSquare';
import UserCircleIcon from '@solar-icons/react/icons/users/UserCircle';
import type { ChatMessage } from '../../types/workspace';
import { stripDecorativeIcons } from '../../utils/text';

function renderAssistantText(content: string, removeDecorativeIcons = false) {
  const visibleContent = removeDecorativeIcons ? stripDecorativeIcons(content) : content;
  const renderInline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-[720] text-slate-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index} className="rounded bg-[#26313d] px-1 py-px text-[0.92em] text-sky-200">{part.slice(1, -1)}</code>;
      }
      return <span key={index}>{part}</span>;
    });

  return visibleContent.split('\n').map((line, index) => {
    const isBullet = /^\s*(?:•|-)\s+/.test(line);
    const cleanLine = line.replace(/^\s*(?:•|-)\s+/, '');
    return (
      <div key={index} className={`${isBullet ? 'mt-[3px] flex gap-[7px]' : 'block'} ${line ? '' : 'min-h-2'}`}>
        {isBullet && <span aria-hidden="true" className="text-sky-400">•</span>}
        <span>{renderInline(cleanLine)}</span>
      </div>
    );
  });
}

interface AssistantPanelProps {
  visible: boolean;
  tableCount: number;
  messages: ChatMessage[];
  thinking: boolean;
  suggestions: string[];
  input: string;
  chatEndRef: RefObject<HTMLDivElement>;
  onInputChange: (input: string) => void;
  onInputKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onSend: () => void;
  onSuggestion: (suggestion: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function AssistantPanel({
  visible,
  tableCount,
  messages,
  thinking,
  suggestions,
  input,
  chatEndRef,
  onInputChange,
  onInputKeyDown,
  onSend,
  onSuggestion,
  onClear,
  onClose,
}: AssistantPanelProps) {
  return (
    <div
      className="sv-assistant-panel flex min-h-0 flex-1 flex-col"
      data-visible={visible}
    >
      <div className="sv-assistant-header flex items-center gap-2 border-b border-slate-700 px-3.5 py-[11px]">
        <ChatRoundDotsIcon size={16} weight="Linear" />
        <div className="min-w-0 flex-1">
          <div className="sv-assistant-title text-xs font-bold text-blue-100">Assistant</div>
          <div className="sv-assistant-meta mt-px text-[9px] text-slate-500">
            {tableCount ? `Working with ${tableCount} tables` : 'Ready to create a schema'}
          </div>
        </div>
        <button
          onClick={onClear}
          title="Clear conversation"
          className="grid cursor-pointer place-items-center rounded-md border border-transparent bg-transparent p-[5px] text-slate-500"
        >
          <EraserSquareIcon size={14} weight="Linear" />
        </button>
        <button className="sv-mobile-panel-close" onClick={onClose} aria-label="Close Assistant" title="Close Assistant">
          <CloseCircleIcon size={17} weight="Linear" />
        </button>
      </div>

      <div className="sv-chat-thread">
        {messages.map((message, index) => (
          <div className="sv-chat-row" data-role={message.role} key={index}>
            <div className="sv-chat-card" data-role={message.role}>
              <div className="sv-chat-avatar">
                {message.role === 'user'
                  ? <UserCircleIcon size={16} weight="Linear" />
                  : <MagicStick2Icon size={16} weight="Linear" />}
              </div>
              <div className="sv-chat-copy">
                <div className="sv-chat-author">{message.role === 'user' ? 'You' : 'Assistant'}</div>
                <div>{renderAssistantText(message.content, message.role === 'assistant')}</div>
              </div>
            </div>
          </div>
        ))}
        {thinking && (
          <div className="sv-chat-row" data-role="assistant">
            <div className="sv-chat-card items-center text-[11px] text-slate-400" data-role="assistant">
              <MagicStick2Icon size={15} weight="Linear" />
              <span>Reviewing the schema and applying the change…</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="sv-assistant-suggestions" aria-label="Suggested prompts">
        {suggestions.map((suggestion) => (
          <button key={suggestion} onClick={() => onSuggestion(suggestion)} disabled={thinking}>{suggestion}</button>
        ))}
      </div>

      <div className="sv-assistant-composer border-t border-slate-700 bg-slate-950 p-3">
        {input.length >= 300 && (
          <div className="mb-[7px] flex items-center gap-1.5 text-[10px] text-sky-300">
            <FileTextIcon size={13} weight="Linear" />
            Requirements document detected · entities, attributes, and business rules will be analyzed
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Describe a change, or paste an assignment / requirements document…"
            rows={3}
            className="max-h-[180px] flex-1 resize-y rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-[13px] text-slate-200 outline-none"
          />
          <button
            onClick={onSend}
            disabled={!input.trim() || thinking}
            aria-label="Send message"
            className="flex w-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border-0 bg-sky-600 p-0 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            <SendSquareIcon size={17} weight="Linear" />
          </button>
        </div>
      </div>
    </div>
  );
}
