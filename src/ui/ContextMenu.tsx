import { useEffect, useRef } from 'react';

export type MenuItem =
  | { sep: true }
  | { sep?: false; label: string; shortcut?: string; action: () => void; disabled?: boolean; danger?: boolean };

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', h, true);
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('pointerdown', h, true); window.removeEventListener('keydown', k); };
  }, [onClose]);
  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button
            key={i}
            className={'ctx-item' + (it.danger ? ' danger' : '')}
            disabled={it.disabled}
            onClick={() => { it.action(); onClose(); }}
          >
            <span>{it.label}</span>
            {it.shortcut && <kbd>{it.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
