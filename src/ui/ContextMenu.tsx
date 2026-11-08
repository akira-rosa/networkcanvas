import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type MenuItem =
  | { sep: true }
  | { sep?: false; label: string; shortcut?: string; action: () => void; disabled?: boolean; danger?: boolean };

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    // capture phase so the global shortcut handler never sees the Escape that closes the menu
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); } };
    window.addEventListener('pointerdown', h, true);
    window.addEventListener('keydown', k, true);
    return () => { window.removeEventListener('pointerdown', h, true); window.removeEventListener('keydown', k, true); };
  }, [onClose]);
  // keep the menu inside the viewport
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4));
    if (left !== pos.left || top !== pos.top) setPos({ left, top });
  }, [x, y, items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="ctx-menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
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
