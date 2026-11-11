import React, { useState } from 'react';
import {
  MousePointer2, Hand, Spline, SquareDashed, Type, Square, Undo2, Redo2, Sun, Moon, SunMoon, Download, ZoomIn, ZoomOut, Maximize,
  Menu, Grid3x3, Magnet, CircleDot, Keyboard, FolderOpen, Save, House,
} from 'lucide-react';
import { useStore } from '../store/store';
import { IconButton, TextInput } from '../ui/controls';
import { ContextMenu, type MenuItem } from '../ui/ContextMenu';
import '../ui/banner.css';
import { canvasApi } from '../canvas/api';
import { newDocument, openFromFile, saveToFile, loadSample, importLibrary, goHome } from '../store/persistence';
import { exportCableScheduleCsv, exportInventoryCsv, exportPdf, exportPng, exportSvg } from '../export/exporters';
import type { Tool } from '../model/types';
import { createCallout, createImage, createLegend, createTitleBlock, createVlanTable } from '../model/factory';
import { pickFile, readFileDataUrl, rectsIntersect, unionRects } from '../model/util';
import { nodeRect } from '../model/geometry';

const TOOLS: { id: Tool; title: string; key: string; icon: React.ReactNode }[] = [
  { id: 'select', title: 'Select / move', key: 'V', icon: <MousePointer2 size={17} /> },
  { id: 'hand', title: 'Hand (pan)', key: 'H', icon: <Hand size={17} /> },
  { id: 'connect', title: 'Connect devices', key: 'C', icon: <Spline size={17} /> },
  { id: 'zone', title: 'Zone / VLAN area', key: 'Z', icon: <SquareDashed size={17} /> },
  { id: 'rect', title: 'Annotation box', key: 'R', icon: <Square size={17} /> },
  { id: 'text', title: 'Text', key: 'T', icon: <Type size={17} /> },
];

export function TopBar() {
  const s = useStore();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const zoom = useStore((st) => st.viewports[st.pageId]?.zoom ?? 1);

  const openMenu = (e: React.MouseEvent, items: MenuItem[]) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4, items });
  };

  /** A spot of w×h that does not overlap existing content: below it (left-aligned), else to its right, else the view centre. */
  const freeSpot = (w: number, h: number) => {
    const c = canvasApi.center();
    const pg = s.doc.pages.find((p) => p.id === s.pageId)!;
    const rects = pg.order.map((id) => pg.nodes[id]).filter((n) => n && !n.hidden).map((n) => nodeRect(n, pg, s.defs, s.doc.vlans));
    const bounds = unionRects(rects);
    if (!bounds) return { x: c.x - w / 2, y: c.y - h / 2 };
    const gap = 40;
    const free = (r: { x: number; y: number; w: number; h: number }) => !rects.some((o) => rectsIntersect({ x: r.x - 12, y: r.y - 12, w: r.w + 24, h: r.h + 24 }, o));
    const candidates = [
      { x: bounds.x, y: bounds.y + bounds.h + gap, w, h },
      { x: bounds.x + bounds.w - w, y: bounds.y + bounds.h + gap, w, h },
      { x: bounds.x + bounds.w + gap, y: bounds.y, w, h },
      { x: bounds.x + bounds.w + gap, y: bounds.y + bounds.h - h, w, h },
    ];
    const spot = candidates.find(free) ?? candidates[0];
    return { x: Math.round(spot.x), y: Math.round(spot.y) };
  };

  const placeBlock = (kind: 'legend' | 'vlanTable' | 'titleBlock' | 'callout') => {
    const c = canvasApi.center();
    let n;
    if (kind === 'legend') { const p = freeSpot(420, 110); n = createLegend(p.x, p.y); }
    else if (kind === 'vlanTable') { const p = freeSpot(520, 40 + 22 * Math.max(1, s.doc.vlans.length)); n = createVlanTable(p.x, p.y); }
    else if (kind === 'titleBlock') { const p = freeSpot(340, 92); n = createTitleBlock(p.x, p.y); }
    else {
      // callout: attach to the selected device when there is one
      const pg = s.doc.pages.find((p) => p.id === s.pageId)!;
      const anchor = s.selection.map((id) => pg.nodes[id]).find((x) => x && x.kind !== 'callout');
      n = anchor ? createCallout(anchor.x + anchor.w + 30, anchor.y - 30, anchor.id, '{name}\n{ip}') : createCallout(c.x - 75, c.y - 20);
    }
    s.change((_d, pg) => { pg.nodes[n.id] = n; pg.order.push(n.id); });
    s.select([n.id]);
    if (kind !== 'callout') canvasApi.reveal([n.id]);
  };
  const insertImage = async () => {
    const f = await pickFile('image/*,.svg');
    if (!f) return;
    const href = await readFileDataUrl(f);
    const sz = await new Promise<{ w: number; h: number }>((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth || 200, h: im.naturalHeight || 200 }); im.onerror = () => res({ w: 200, h: 200 }); im.src = href; });
    const k = Math.min(1, 240 / Math.max(sz.w, sz.h));
    const c = canvasApi.center();
    const n = createImage(Math.round(c.x - (sz.w * k) / 2), Math.round(c.y - (sz.h * k) / 2), Math.round(sz.w * k), Math.round(sz.h * k), href);
    s.change((_d, pg) => { pg.nodes[n.id] = n; pg.order.unshift(n.id); });
    s.select([n.id]);
  };

  const exportOpts = { theme: s.theme, background: true, selectionOnly: false, scale: 2, padding: 40 };

  const fileMenu: MenuItem[] = [
    { label: 'All diagrams (home)', action: () => goHome() },
    { label: 'New diagram', shortcut: 'Ctrl+Alt+N', action: () => newDocument() },
    { label: 'Open file…', shortcut: 'Ctrl+O', action: () => openFromFile() },
    { label: 'Find…', shortcut: 'Ctrl+F', action: () => s.set({ modal: 'find' }) },
    { sep: true },
    { label: 'Save to file', shortcut: 'Ctrl+S', action: () => saveToFile() },
    { label: 'Save as…', shortcut: 'Ctrl+Shift+S', action: () => saveToFile(true) },
    { sep: true },
    { label: 'Export…', shortcut: 'Ctrl+E', action: () => s.set({ modal: 'export' }) },
    { label: 'Quick export PNG (2×)', action: () => exportPng(exportOpts).catch((e) => s.toast('Export failed: ' + (e?.message ?? e), 'error')) },
    { label: 'Quick export SVG', action: () => exportSvg(exportOpts) },
    { label: 'Print all sheets / PDF', shortcut: 'Ctrl+P', action: () => exportPdf({ allPages: true }) },
    { label: 'Print this page’s sheets', action: () => exportPdf({ allPages: false }) },
    { label: 'Export device inventory (CSV)', action: exportInventoryCsv },
    { label: 'Export cable schedule (CSV)', action: exportCableScheduleCsv },
    { sep: true },
    { label: 'Import device library…', action: importLibrary },
    { label: 'Open the Smart4.0 example', action: () => loadSample() },
    { sep: true },
    { label: 'Keyboard shortcuts', shortcut: '?', action: () => s.set({ modal: 'shortcuts' }) },
    { label: `About Network Canvas v${__APP_VERSION__} and licences…`, action: () => s.set({ modal: 'licences' }) },
    { label: 'Network Canvas on GitHub', action: () => window.open(__APP_REPO__, '_blank', 'noopener') },
  ];
  const insertMenu: MenuItem[] = [
    { label: 'VLAN table', action: () => placeBlock('vlanTable') },
    { label: 'Legend (auto)', action: () => placeBlock('legend') },
    { label: 'Title block', action: () => placeBlock('titleBlock') },
    { sep: true },
    { label: 'Zone / VLAN area', shortcut: 'Z', action: () => s.set({ tool: 'zone' }) },
    { label: 'Text', shortcut: 'T', action: () => s.set({ tool: 'text' }) },
    { label: 'Callout (note with leader line)', action: () => placeBlock('callout') },
    { label: 'Image / logo…', action: insertImage },
    { sep: true },
    { label: 'Group selection', shortcut: 'Ctrl+G', disabled: s.selection.length < 2, action: s.group },
    { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', action: s.ungroup },
    { label: 'Auto-arrange as tree (selection or page)', shortcut: 'Ctrl+Shift+A', action: s.autoLayout },
    { sep: true },
    { label: 'Device table…', shortcut: 'Ctrl+Shift+D', action: () => s.set({ modal: 'table' }) },
    { label: 'Import devices from CSV…', action: () => s.set({ modal: 'import' }) },
    { sep: true },
    { label: 'Manage VLANs…', action: () => s.set({ modal: 'vlans' }) },
  ];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <IconButton title="All diagrams" onClick={() => goHome()}><House size={16} /></IconButton>
        <button className="menu-btn" onClick={(e) => openMenu(e, fileMenu)}><Menu size={15} /> File</button>
        <button className="menu-btn" onClick={(e) => openMenu(e, insertMenu)}>Insert</button>
        <div className="doc-name">
          <TextInput value={s.doc.name} onChange={(v) => s.change((d) => { d.name = v || 'Untitled'; })} />
          <span className={'save-dot ' + (s.saveError || s.saveConflict ? 'dirty' : s.dirty ? 'dirty' : 'saved')}
            title={s.saveError || s.saveConflict ? 'Not saved — see the message at the top' : s.dirty ? 'Saving…' : `Saved in this browser${s.fileSavedAt ? ` · last saved to a file ${new Date(s.fileSavedAt).toLocaleString()}` : ''}`} />
          {!s.fileSavedAt && (
            <button className="file-chip" title="This diagram exists only in this browser. Browsers can clear stored data; keep a file copy (Ctrl+S)." onClick={() => saveToFile()}>No file copy</button>
          )}
        </div>
      </div>

      <div className="topbar-center tools">
        {TOOLS.map((t) => (
          <IconButton key={t.id} title={t.title} shortcut={t.key} active={s.tool === t.id} onClick={() => s.set({ tool: t.id })}>
            {t.icon}
          </IconButton>
        ))}
        <span className="divider" />
        <IconButton title="Undo" shortcut="Ctrl+Z" disabled={!s.past.length} onClick={s.undo}><Undo2 size={17} /></IconButton>
        <IconButton title="Redo" shortcut="Ctrl+Shift+Z" disabled={!s.future.length} onClick={s.redo}><Redo2 size={17} /></IconButton>
      </div>

      <div className="topbar-right">
        <IconButton title="Show grid" active={s.showGrid} onClick={() => s.set({ showGrid: !s.showGrid })}><Grid3x3 size={16} /></IconButton>
        <IconButton title="Snap to grid" active={s.snapToGrid} onClick={() => s.set({ snapToGrid: !s.snapToGrid })}><Magnet size={16} /></IconButton>
        <IconButton title="Show all ports" shortcut="P" active={s.showPorts} onClick={() => s.set({ showPorts: !s.showPorts })}><CircleDot size={16} /></IconButton>
        <span className="divider" />
        <IconButton title="Zoom out" shortcut="Ctrl+-" onClick={() => canvasApi.zoomBy(1 / 1.25)}><ZoomOut size={16} /></IconButton>
        <button className="zoom-btn" title="Reset to 100%" onClick={() => canvasApi.zoomTo(1)}>{Math.round(zoom * 100)}%</button>
        <IconButton title="Zoom in" shortcut="Ctrl+=" onClick={() => canvasApi.zoomBy(1.25)}><ZoomIn size={16} /></IconButton>
        <IconButton title="Zoom to fit" shortcut="Shift+1" onClick={() => canvasApi.fit()}><Maximize size={16} /></IconButton>
        <span className="divider" />
        <IconButton title="Open file" shortcut="Ctrl+O" onClick={() => openFromFile()}><FolderOpen size={16} /></IconButton>
        <IconButton title="Save to file" shortcut="Ctrl+S" onClick={() => saveToFile()}><Save size={16} /></IconButton>
        <IconButton title="Export" shortcut="Ctrl+E" onClick={() => s.set({ modal: 'export' })}><Download size={16} /></IconButton>
        <IconButton title="Keyboard shortcuts" shortcut="?" onClick={() => s.set({ modal: 'shortcuts' })}><Keyboard size={16} /></IconButton>
        <IconButton title={`Theme: ${s.themePref === 'system' ? 'follow browser (' + s.theme + ')' : s.themePref} — click to change`} onClick={s.cycleTheme}>
          {s.themePref === 'system' ? <SunMoon size={16} /> : s.themePref === 'light' ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </header>
  );
}
