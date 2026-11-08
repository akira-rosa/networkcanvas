import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useStore } from '../store/store';
import { canvasApi } from '../canvas/api';
import { DefThumb } from '../render/ShapeView';
import { nodeLabel } from './LeftPanel';
import type { DiagramNode } from '../model/types';

interface Hit { id: string; pageId: string; pageName: string; node: DiagramNode; title: string; detail: string }

/** Ctrl+F: search devices, texts, zones and addresses across all pages. */
export function FindPalette({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const defs = useStore((s) => s.defs);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Hit[] = [];
    for (const p of doc.pages) {
      for (const id of [...p.order].reverse()) {
        const n = p.nodes[id];
        if (!n) continue;
        const title = nodeLabel(n, doc.vlans);
        let detail = '';
        if (n.kind === 'device') {
          const def = defs[n.defId];
          detail = [def?.name, n.subtitle, ...n.addresses.map((a) => a.value), ...Object.values(n.props).filter(Boolean)].filter(Boolean).join(' · ');
        } else if (n.kind === 'text') detail = n.text;
        const hay = (title + ' ' + detail).toLowerCase();
        if (!needle || hay.includes(needle)) out.push({ id, pageId: p.id, pageName: p.name, node: n, title, detail });
      }
    }
    return out.slice(0, 50);
  }, [q, doc, defs]);

  useEffect(() => setIdx(0), [q]);

  const go = (h: Hit) => {
    const s = useStore.getState();
    if (h.pageId !== s.pageId) s.setPage(h.pageId);
    s.select([h.id]);
    setTimeout(() => canvasApi.reveal([h.id]), 30);
    onClose();
  };

  return (
    <div className="modal-backdrop find-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="find">
        <div className="find-input">
          <Search size={16} />
          <input
            ref={inputRef}
            placeholder="Find devices, addresses, texts…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              if (e.key === 'Enter' && hits[idx]) go(hits[idx]);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="find-list">
          {hits.map((h, i) => (
            <button key={h.pageId + h.id} className={'find-item' + (i === idx ? ' active' : '')} onMouseEnter={() => setIdx(i)} onClick={() => go(h)}>
              <span className="find-icon">{h.node.kind === 'device' && defs[h.node.defId] ? <DefThumb def={defs[h.node.defId]} size={22} /> : <span className="find-kind">{h.node.kind}</span>}</span>
              <span className="grow">
                <div className="find-title">{h.title}</div>
                {h.detail && <div className="find-detail ellipsis">{h.detail}</div>}
              </span>
              {doc.pages.length > 1 && <span className="count">{h.pageName}</span>}
            </button>
          ))}
          {!hits.length && <div className="empty">Nothing matches “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}
