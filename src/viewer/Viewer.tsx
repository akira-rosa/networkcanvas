import { useEffect, useMemo, useState } from 'react';
import { Sun, Moon, SunMoon, ZoomIn, ZoomOut, Maximize, Search, Download, Printer, Pencil, X, Network } from 'lucide-react';
import { useStore, usePage } from '../store/store';
import { Canvas } from '../canvas/Canvas';
import { canvasApi } from '../canvas/api';
import { IconButton } from '../ui/controls';
import { exportPdf } from '../export/exporters';
import { downloadText } from '../model/util';
import { portUsage } from '../model/geometry';
import { DefThumb } from '../render/ShapeView';
import { nodeLabel } from '../panels/LeftPanel';
import type { DiagramDoc, DeviceNode } from '../model/types';
import { safeName } from '../store/persistence';

/**
 * Read-only viewer used by "Export → Interactive HTML": the same app with the
 * document embedded. Pan/zoom, pages, search, hover cards and a details card.
 */
export function Viewer({ doc, onEdit }: { doc: DiagramDoc; onEdit: () => void }) {
  const s = useStore();
  const page = usePage();
  const [q, setQ] = useState('');
  useEffect(() => {
    useStore.setState({ readOnly: true, hideUi: true });
    s.loadDoc(doc);
    document.title = doc.name;
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = s.theme; }, [s.theme]);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const out: { id: string; pageId: string; label: string }[] = [];
    for (const p of s.doc.pages) for (const n of Object.values(p.nodes)) {
      if (n.kind !== 'device') continue;
      const hay = [n.name, n.subtitle, ...n.addresses.map((a) => a.value), ...Object.values(n.props)].join(' ').toLowerCase();
      if (hay.includes(needle)) out.push({ id: n.id, pageId: p.id, label: n.name });
    }
    return out.slice(0, 12);
  }, [q, s.doc]);

  const selected = s.selection.length === 1 ? page.nodes[s.selection[0]] : undefined;

  return (
    <div className="app viewer">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand"><Network size={18} /></div>
          <strong style={{ fontSize: 13 }} className="ellipsis">{s.doc.name}</strong>
          <span className="editor-badge">VIEWER</span>
          {s.doc.pages.length > 1 && (
            <div className="seg" style={{ margin: '0 0 0 10px' }}>
              {s.doc.pages.map((p) => <button key={p.id} className={p.id === s.pageId ? 'active' : ''} onClick={() => s.setPage(p.id)}>{p.name}</button>)}
            </div>
          )}
        </div>
        <div className="topbar-center">
          <div className="lib-search" style={{ width: 300, margin: 0, position: 'relative' }}>
            <Search size={14} />
            <input placeholder="Find device, address…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            {q && <button className="icon-btn xs" onClick={() => setQ('')}><X size={12} /></button>}
            {hits.length > 0 && (
              <div className="viewer-hits">
                {hits.map((h) => (
                  <button key={h.pageId + h.id} className="find-item" onClick={() => { if (h.pageId !== s.pageId) s.setPage(h.pageId); s.select([h.id]); setTimeout(() => canvasApi.reveal([h.id]), 30); setQ(''); }}>{h.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="topbar-right">
          <IconButton title="Zoom out" onClick={() => canvasApi.zoomBy(1 / 1.25)}><ZoomOut size={16} /></IconButton>
          <IconButton title="Zoom in" onClick={() => canvasApi.zoomBy(1.25)}><ZoomIn size={16} /></IconButton>
          <IconButton title="Zoom to fit" onClick={() => canvasApi.fit()}><Maximize size={16} /></IconButton>
          <span className="divider" />
          <IconButton title="Print / PDF" onClick={() => exportPdf({ theme: 'light', background: true, selectionOnly: false, scale: 2, padding: 40, allPages: true })}><Printer size={16} /></IconButton>
          <IconButton title="Download as NetCanvas file" onClick={() => downloadText(safeName(s.doc.name) + '.netcanvas.json', JSON.stringify(s.doc, null, 1))}><Download size={16} /></IconButton>
          <IconButton title={`Theme: ${s.themePref}`} onClick={s.cycleTheme}>{s.themePref === 'system' ? <SunMoon size={16} /> : s.themePref === 'light' ? <Sun size={16} /> : <Moon size={16} />}</IconButton>
          <span className="divider" />
          <button className="btn primary sm" onClick={onEdit} title="Open the full editor with this diagram"><Pencil size={13} /> Edit</button>
        </div>
      </header>
      <div className="workspace">
        <main className="canvas-area"><Canvas /></main>
        {selected && <DetailsCard n={selected} onClose={() => s.select([])} />}
      </div>
    </div>
  );
}

function DetailsCard({ n, onClose }: { n: ReturnType<typeof usePage>['nodes'][string]; onClose: () => void }) {
  const s = useStore();
  const page = usePage();
  const def = n.kind === 'device' ? s.defs[n.defId] : undefined;
  return (
    <aside className="right-panel viewer-card">
      <div className="insp-head">
        {def && <DefThumb def={def} size={34} accent={(n as DeviceNode).accent} />}
        <div className="grow">
          <div className="insp-title">{nodeLabel(n, s.doc.vlans)}</div>
          <div className="insp-sub">{def ? `${def.name} · ${def.category}` : n.kind}</div>
        </div>
        <IconButton title="Close" onClick={onClose}><X size={15} /></IconButton>
      </div>
      {n.kind === 'device' && (
        <>
          {n.subtitle && <div className="viewer-row"><span>Role</span><b>{n.subtitle}</b></div>}
          {n.addresses.map((a) => {
            const v = s.doc.vlans.find((x) => x.id === a.vlan);
            return <div key={a.id} className="viewer-row"><span>{v ? `VLAN ${v.vlanId} ${v.name}` : 'Address'}</span><b className="mono">{a.value}</b></div>;
          })}
          {def?.fields.filter((f) => n.props[f.key]).map((f) => <div key={f.key} className="viewer-row"><span>{f.label}</span><b>{n.props[f.key]}</b></div>)}
          {def && def.ports.length > 0 && (
            <div className="insp-section">
              <header><span>Ports</span></header>
              <div className="insp-body port-list">
                {def.ports.map((p) => {
                  const peers = Object.values(page.links).filter((l) => (l.from.node === n.id && l.from.port === p.id) || (l.to.node === n.id && l.to.port === p.id))
                    .map((l) => { const o = l.from.node === n.id ? l.to : l.from; const on = page.nodes[o.node]; return on ? nodeLabel(on, s.doc.vlans) : '?'; });
                  return (
                    <div key={p.id} className="port-row">
                      <span className="port-name">{p.name}</span>
                      <span className="port-media">{p.media}</span>
                      <span className="grow ellipsis port-peer">{peers.length ? '→ ' + peers.join(', ') : 'free'}</span>
                      <span className="count">{portUsage(page, n.id, p.id)}/{p.maxLinks || '∞'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      {n.kind === 'zone' && <div className="viewer-row"><span>VLAN</span><b>{s.doc.vlans.find((v) => v.id === n.vlan)?.subnet ?? n.tag ?? '—'}</b></div>}
    </aside>
  );
}
