import { useEffect, useRef, type ReactNode } from 'react';
import CloseCircleIcon from '@solar-icons/react/icons/ui/CloseCircle';

interface WorkspaceDialogProps {
  id: string;
  eyebrow: string;
  title: ReactNode;
  description?: string;
  context?: ReactNode;
  icon: ReactNode;
  size?: 'compact' | 'medium' | 'wide';
  onClose: () => void;
  children: ReactNode;
}

export function WorkspaceDialog({
  id,
  eyebrow,
  title,
  description,
  context,
  icon,
  size = 'medium',
  onClose,
  children,
}: WorkspaceDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const initialFocus = dialogRef.current?.querySelector<HTMLElement>(
        '[autofocus], input:not([type="hidden"]), textarea, select, button:not(.sv-dialog-close)',
      );
      initialFocus?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, []);

  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div
      className="sv-workspace-dialog-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="sv-workspace-dialog"
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="sv-dialog-header">
          <div className="sv-dialog-icon">{icon}</div>
          <div className="sv-dialog-heading">
            <span>{eyebrow}</span>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          {context && <div className="sv-dialog-context">{context}</div>}
          <button className="sv-dialog-close" onClick={onClose} aria-label={`Close ${eyebrow}`}>
            <CloseCircleIcon size={18} weight="Linear" />
          </button>
        </header>
        <div className="sv-dialog-body">{children}</div>
      </section>
    </div>
  );
}
