import React, { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Plus, Search, Eye, EyeOff, Lock, Unlock, Box, SquareDashed, Type, Square, LayoutGrid, Table2, Spline, FileText, MoreHorizontal,
  Upload, Download, Image as ImageIcon, MessageSquare, PanelTop, Layers3,
} from 'lucide-react';
import { useStore, usePage, placementDefId, defUsage } from '../store/store';
import { DefThumb } from '../render/ShapeView';
import { CATEGORY_ORDER, DEFAULT_ACCENT } from '../library';
import type { DeviceDef, DiagramNode } from '../model/types';
import { createDevice } from '../model/factory';
import { canvasApi } from '../canvas/api';
import { ContextMenu, type MenuItem } from '../ui/ContextMenu';
import { exportLibrary, importLibrary } from '../store/persistence';
import { deepClone, uid } from '../model/util';
import { zoneTitle } from '../render/DiagramLayer';

const NO_LAYERS: import('../model/types').Layer[] = [];

export function LeftPanel() {
  const tab = useStore((s) => s.leftTab);
  const set = useStore((s) => s.set);
  return (
    <aside className="left-panel">
      <Pages />
      <div className="tabs">
        <button className={tab === 'library' ? 'active' : ''} onClick={() => set({ leftTab: 'library' })}>Library</button>
        <button className={tab === 'layers' ? 'active' : ''} onClick={() => set({ leftTab: 'layers' })}>Layers</button>
      </div>
      {tab === 'library' ? <Library /> : <Layers />}
    </aside>
  );
}

function Pages() {
  const doc = useStore((s) => s.doc);
  const pageId = useStore((s) => s.pageId);
  const s = useStore.getState();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  return (
    <div className="pages">
      <div className="panel-title">
        <span>Pages</span>
        <button className="icon-btn sm" title="Add page" onClick={() => s.addPage()}><Plus size={14} /></button>
      </div>
      {doc.pages.map((p) => (
        <div
          key={p.id}
          className={'page-row' + (p.id === pageId ? ' active' : '')}
          onClick={() => s.setPage(p.id)}
          onDoubleClick={() => setRenaming(p.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({
              x: e.clientX, y: e.clientY, items: [
                { label: 'Rename', action: () => setRenaming(p.id) },
                { label: 'Duplicate', action: () => s.duplicatePage(p.id) },
                { sep: true },
                { label: 'Delete', danger: true, disabled: doc.pages.length < 2, action: () => s.deletePage(p.id) },
              ],
            });
          }}
        >
          <FileText size={13} />
          {renaming === p.id ? (
            <input
              className="input inline" autoFocus defaultValue={p.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v) s.change((d) => { d.pages.find((x) => x.id === p.id)!.name = v; }); setRenaming(null); }}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }}
            />
          ) : (
            <span className="grow">{p.name}</span>
          )}
          <span className="count">{Object.values(p.nodes).filter((n) => n.kind === 'device').length}</span>
        </div>
      ))}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

export function blankDef(): DeviceDef {
  return {
    id: uid('dev-'), name: 'New device', category: 'Custom', w: 48, h: 48, accent: DEFAULT_ACCENT,
    shapes: [],
    ports: [{ id: uid('p'), name: 'P1', x: 24, y: 0, media: 'ethernet', side: 'top', maxLinks: 1 }],
    fields: [{ key: 'model', label: 'Model' }, { key: 'serial', label: 'Serial number' }],
    prefix: 'dev',
  };
}

function Library() {
  const defs = useStore((s) => s.libDefs);
  const userDefs = useStore((s) => s.userDefs);
  const docStyle = useStore((s) => s.doc.iconStyle ?? 'iso');
  const s = useStore.getState();
  const [q, setQ] = useState('');
  const libStyle = useStore((s) => s.libStyle);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const clickTimer = useRef<number | undefined>(undefined);

  const groups = useMemo(() => {
    const list = Object.values(defs)
      .filter((d) => libStyle === 'all' || (d.style ?? 'iso') === libStyle)
      .filter((d) => !q || (d.name + ' ' + d.category + ' ' + (d.description ?? '') + ' ' + (d.vendor ?? '')).toLowerCase().includes(q.toLowerCase()));
    const g: Record<string, DeviceDef[]> = {};
    list.forEach((d) => (g[d.category] ??= []).push(d));
    const cats = Object.keys(g).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
      return (ia < 0 ? -1 : ia) - (ib < 0 ? -1 : ib) || a.localeCompare(b);
    });
    return cats.map((c) => ({ cat: c, items: g[c].sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [defs, q, libStyle]);

  const userIds = new Set(userDefs.map((d) => d.id));

  const addToCanvas = (d: DeviceDef) => {
    const c = canvasApi.center();
    const st = useStore.getState();
    const pg0 = st.doc.pages.find((p) => p.id === st.pageId)!;
    // step down-right while the spot is taken, so repeated clicks do not pile devices on top of each other
    let cx = c.x, cy = c.y;
    for (let i = 0; i < 12; i++) {
      const taken = Object.values(pg0.nodes).some((n) => n.kind === 'device' && Math.abs(n.x + n.w / 2 - cx) < 20 && Math.abs(n.y + n.h / 2 - cy) < 20);
      if (!taken) break;
      cx += 32; cy += 32;
    }
    const n = createDevice(d, cx, cy, placementDefId(defs, d, docStyle));
    s.change((_doc, pg) => { pg.nodes[n.id] = n; pg.order.push(n.id); });
    s.select([n.id]);
  };

  const itemMenu = (e: React.MouseEvent, d: DeviceDef) => {
    e.preventDefault();
    const isUser = userIds.has(d.id);
    const isOverride = isUser && d.builtin === false && d.id.indexOf('dev-') !== 0;
    setMenu({
      x: e.clientX, y: e.clientY, items: [
        { label: 'Add to canvas', action: () => addToCanvas(d) },
        { label: 'Edit in device editor…', action: () => s.openEditor(d) },
        { label: 'Duplicate as new device', action: () => s.openEditor({ ...deepClone(d), id: uid('dev-'), name: d.name + ' copy', builtin: false }, true) },
        { label: 'Export device…', action: () => exportLibrary([d], d.name) },
        { sep: true },
        isOverride
          ? { label: 'Reset to built-in', action: () => s.deleteUserDef(d.id) }
          : { label: 'Delete from library', danger: true, disabled: !isUser, action: () => {
              const used = defUsage(s.doc, d.id);
              if (confirm(`Delete “${d.name}” from your library?${used ? `\n\n${used} device${used > 1 ? 's' : ''} in this diagram use it; they keep working (a copy stays embedded in the document).` : ''}`)) s.deleteUserDef(d.id);
            } },
      ],
    });
  };

  return (
    <div className="library">
      <div className="lib-search">
        <Search size={14} />
        <input placeholder="Search devices…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <div className="seg">
        {(['iso', 'detailed', 'all'] as const).map((k) => (
          <button key={k} className={libStyle === k ? 'active' : ''} onClick={() => s.set({ libStyle: k })}>
            {k === 'iso' ? 'Isometric' : k === 'detailed' ? 'Detailed' : 'All'}
          </button>
        ))}
      </div>
      <div className="lib-actions">
        <button className="btn primary sm" onClick={() => s.openEditor(blankDef(), true)}><Plus size={14} /> New device</button>
        <button className="icon-btn sm" title="Import library / device" onClick={importLibrary}><Upload size={14} /></button>
        <button className="icon-btn sm" title="Export my custom devices" disabled={!userDefs.length} onClick={() => exportLibrary(userDefs, 'my-devices')}><Download size={14} /></button>
      </div>
      <div className="lib-scroll">
        {groups.map(({ cat, items }) => (
          <div key={cat} className="lib-group">
            <button className="lib-cat" onClick={() => setCollapsed({ ...collapsed, [cat]: !collapsed[cat] })}>
              <span className={'chev' + (collapsed[cat] ? '' : ' open')}>›</span> {cat} <span className="count">{items.length}</span>
            </button>
            {!collapsed[cat] && (
              <div className="lib-grid">
                {items.map((d) => (
                  <div
                    key={d.id}
                    className="lib-item"
                    draggable
                    title={`${d.name}${d.description ? ' — ' + d.description : ''}\n${d.ports.length} ports · drag onto canvas · double-click to edit`}
                    onDragStart={(e) => { e.dataTransfer.setData('application/x-networkcanvas-def', d.id); e.dataTransfer.effectAllowed = 'copy'; }}
                    onClick={() => { window.clearTimeout(clickTimer.current); clickTimer.current = window.setTimeout(() => addToCanvas(d), 260); }}
                    onDoubleClick={() => { window.clearTimeout(clickTimer.current); s.openEditor(d); }}
                    onContextMenu={(e) => itemMenu(e, d)}
                  >
                    <div className="lib-thumb"><DefThumb def={d} size={40} /></div>
                    <span className="lib-name">{d.name}</span>
                    {userIds.has(d.id) && <span className="lib-badge" title="Custom / modified">●</span>}
                    <button className="lib-more" onClick={(e) => { e.stopPropagation(); itemMenu(e, d); }}><MoreHorizontal size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {!groups.length && <div className="empty">No devices match “{q}”.</div>}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

const KIND_ICON: Record<DiagramNode['kind'], ReactNode> = {
  device: <Box size={13} />, zone: <SquareDashed size={13} />, text: <Type size={13} />, rect: <Square size={13} />,
  legend: <LayoutGrid size={13} />, vlanTable: <Table2 size={13} />, image: <ImageIcon size={13} />, callout: <MessageSquare size={13} />, titleBlock: <PanelTop size={13} />,
};

export function nodeLabel(n: DiagramNode, vlans: import('../model/types').Vlan[]): string {
  switch (n.kind) {
    case 'device': return n.name || 'Device';
    case 'zone': { const z = zoneTitle(n, vlans); return (z.title || 'Zone') + (z.tag ? ` · ${z.tag}` : ''); }
    case 'text': return n.text.split('\n')[0] || 'Text';
    case 'rect': return 'Box';
    case 'legend': return n.title;
    case 'vlanTable': return n.title;
    case 'image': return 'Image';
    case 'callout': return n.text.split('\n')[0] || 'Callout';
    case 'titleBlock': return 'Title block';
  }
}

function Layers() {
  const page = usePage();
  const selection = useStore((s) => s.selection);
  const defs = useStore((s) => s.defs);
  const vlans = useStore((s) => s.doc.vlans);
  const s = useStore.getState();
  const [q, setQ] = useState('');
  const rows = [...page.order].reverse().map((id) => page.nodes[id]).filter((n) => n && (!q || nodeLabel(n, vlans).toLowerCase().includes(q.toLowerCase())));
  const links = Object.values(page.links);
  const sel = new Set(selection);
  const toggle = (id: string, key: 'hidden' | 'locked') => s.change((_d, pg) => { pg.nodes[id][key] = !pg.nodes[id][key]; });
  const layers = useStore((st) => st.doc.layers) ?? NO_LAYERS;
  const [renamingLayer, setRenamingLayer] = useState<string | null>(null);
  const [layerMenu, setLayerMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const layerRow = (l: import('../model/types').Layer | null) => {
    const id = l?.id;
    const count = Object.values(page.nodes).filter((n) => (n.layerId ?? undefined) === id).length;
    return (
      <div
        key={id ?? 'default'}
        className={'layer-row layer-def' + (l?.hidden ? ' dim' : '')}
        onDoubleClick={() => l && setRenamingLayer(l.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          const items: MenuItem[] = [
            { label: 'Move selection to this layer', disabled: !selection.length, action: () => s.change((_d, pg) => { selection.forEach((sid) => { if (pg.nodes[sid]) pg.nodes[sid].layerId = id; if (pg.links[sid]) pg.links[sid].layerId = id; }); }) },
            { label: 'Select everything on this layer', action: () => s.select(page.order.filter((nid) => (page.nodes[nid]?.layerId ?? undefined) === id)) },
          ];
          if (l) items.push({ sep: true }, { label: 'Rename', action: () => setRenamingLayer(l.id) }, { label: 'Delete layer (objects move to default)', danger: true, action: () => s.change((d) => { d.layers = (d.layers ?? []).filter((x) => x.id !== l.id); d.pages.forEach((p) => { Object.values(p.nodes).forEach((n) => { if (n.layerId === l.id) delete n.layerId; }); Object.values(p.links).forEach((k) => { if (k.layerId === l.id) delete k.layerId; }); }); }) });
          setLayerMenu({ x: e.clientX, y: e.clientY, items });
        }}
      >
        <span className="layer-icon"><Layers3 size={13} /></span>
        {l && renamingLayer === l.id ? (
          <input className="input inline" autoFocus defaultValue={l.name}
            onBlur={(e) => { const v = e.target.value.trim(); if (v) s.change((d) => { const x = d.layers?.find((y) => y.id === l.id); if (x) x.name = v; }); setRenamingLayer(null); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingLayer(null); }} />
        ) : <span className="grow ellipsis">{l ? l.name : 'Default layer'}</span>}
        <span className="count">{count}</span>
        {l && <button className={'icon-btn xs' + (l.locked ? ' on' : '')} title={l.locked ? 'Unlock layer' : 'Lock layer'} onClick={(e) => { e.stopPropagation(); s.change((d) => { const x = d.layers?.find((y) => y.id === l.id); if (x) x.locked = !x.locked; }); }}>{l.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>}
        {l && <button className={'icon-btn xs' + (l.hidden ? ' on' : '')} title={l.hidden ? 'Show layer' : 'Hide layer'} onClick={(e) => { e.stopPropagation(); s.change((d) => { const x = d.layers?.find((y) => y.id === l.id); if (x) x.hidden = !x.hidden; }); }}>{l.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>}
      </div>
    );
  };
  return (
    <div className="layers">
      <div className="panel-title" style={{ paddingTop: 4 }}>
        <span>Layers</span>
        <button className="icon-btn sm" title="Add layer" onClick={() => s.change((d) => { (d.layers ??= []).push({ id: uid('ly'), name: `Layer ${(d.layers?.length ?? 0) + 1}` }); })}><Plus size={14} /></button>
      </div>
      <div className="layer-defs">
        {layerRow(null)}
        {layers.map((l) => layerRow(l))}
      </div>
      <div className="hint" style={{ padding: '0 14px 6px' }}>Right-click a layer to move the selection to it. Hidden layers are left out of exports.</div>
      {layerMenu && <ContextMenu {...layerMenu} onClose={() => setLayerMenu(null)} />}
      <div className="panel-subtitle">Objects on this page</div>
      <div className="lib-search">
        <Search size={14} />
        <input placeholder="Filter layers…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <div className="lib-scroll">
        {rows.map((n) => (
          <div
            key={n.id}
            className={'layer-row' + (sel.has(n.id) ? ' active' : '') + (n.hidden ? ' dim' : '')}
            onClick={(e) => s.select([n.id], e.shiftKey ? 'toggle' : 'replace')}
            onDoubleClick={() => canvasApi.editLabel(n.id)}
          >
            <span className="layer-icon">{n.kind === 'device' && defs[n.defId] ? <DefThumb def={defs[n.defId]} size={16} /> : KIND_ICON[n.kind]}</span>
            <span className="grow ellipsis">{nodeLabel(n, vlans)}</span>
            <button className={'icon-btn xs' + (n.locked ? ' on' : '')} title={n.locked ? 'Unlock' : 'Lock'} onClick={(e) => { e.stopPropagation(); toggle(n.id, 'locked'); }}>
              {n.locked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
            <button className={'icon-btn xs' + (n.hidden ? ' on' : '')} title={n.hidden ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); toggle(n.id, 'hidden'); }}>
              {n.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
        ))}
        {links.length > 0 && <div className="panel-subtitle">Links ({links.length})</div>}
        {links.map((l) => {
          const a = page.nodes[l.from.node], b = page.nodes[l.to.node];
          if (!a || !b) return null;
          return (
            <div key={l.id} className={'layer-row' + (sel.has(l.id) ? ' active' : '')} onClick={(e) => s.select([l.id], e.shiftKey ? 'toggle' : 'replace')}>
              <span className="layer-icon"><Spline size={13} /></span>
              <span className="grow ellipsis">{nodeLabel(a, vlans)} → {nodeLabel(b, vlans)}</span>
              <span className="count">{l.media}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

