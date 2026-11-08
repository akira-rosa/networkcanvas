import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { currentPage, usePage, useStore, placementDefId } from '../store/store';
import { DiagramLayer, dashArray, layerHidden, layerLocked } from '../render/DiagramLayer';
import { canvasThemes, MEDIA_COLORS, FONT } from '../render/theme';
import type { DeviceNode, DiagramNode, Endpoint, Link, PortDef, Viewport } from '../model/types';
import {
  linkGeometry, linkMediaFor, mediaCompatible, nodeRect, nodeVisualRect, pickPort, portFree, portUsage, portWorld,
} from '../model/geometry';
import { clamp, modKey, normRect, rectContains, rectsIntersect, snap, unionRects, type Pt, type Rect } from '../model/util';
import { createDevice, createRect, createText, createZone, newLink } from '../model/factory';
import { canvasApi } from './api';
import { ContextMenu, type MenuItem } from '../ui/ContextMenu';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'marquee'; start: Pt; cur: Pt; base: string[]; additive: boolean }
  | {
      kind: 'move'; start: Pt; ids: string[]; origin: Record<string, Pt>; startRect: Rect;
      clickedId: string; moved: boolean; shift: boolean; targets: { xs: number[]; ys: number[] };
    }
  | { kind: 'resize'; id: string; handle: Handle; start: Pt; orig: Rect; begun: boolean }
  | { kind: 'link'; from: Endpoint; fromMedia?: PortDef['media']; cur: Pt; target?: Endpoint | null; invalid?: string; relink?: { id: string; end: 'from' | 'to' } }
  | { kind: 'create'; tool: 'zone' | 'rect'; start: Pt; cur: Pt }
  | { kind: 'bend'; id: string; begun: boolean }
  | { kind: 'waypoint'; id: string; index: number; begun: boolean };

interface Editing { id: string; field: 'text' | 'name' | 'title' | 'label' }

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

export function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const page = usePage();
  const doc = useStore((s) => s.doc);
  const defs = useStore((s) => s.defs);
  const themeName = useStore((s) => s.theme);
  const theme = canvasThemes[themeName];
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const showGrid = useStore((s) => s.showGrid);
  const gridSize = useStore((s) => s.gridSize);
  const snapOn = useStore((s) => s.snapToGrid);
  const guidesOn = useStore((s) => s.smartGuides);
  const showAllPorts = useStore((s) => s.showPorts);
  const fitRequest = useStore((s) => s.fitRequest);
  const pageId = useStore((s) => s.pageId);
  const vp: Viewport = useStore((s) => s.viewports[s.pageId]) ?? { x: 80, y: 60, zoom: 1 };
  const vpRef = useRef(vp);
  vpRef.current = vp;

  const [size, setSize] = useState({ w: 800, h: 600 });
  const [drag, _setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => { dragRef.current = d; _setDrag(d); };
  const [hover, setHover] = useState<string | null>(null);
  const [hoverCard, setHoverCard] = useState<{ id: string; x: number; y: number } | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const [hoverPort, setHoverPort] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [space, setSpace] = useState(false);
  // pointer capture makes browser dblclick events target the <svg>, so detect double clicks ourselves
  const lastClick = useRef<{ t: number; id: string | null; x: number; y: number } | null>(null);

  const store = useStore.getState;

  /* ---------- viewport helpers ---------- */
  const toWorld = useCallback((cx: number, cy: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = vpRef.current;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  }, []);
  const setVp = (v: Viewport) => store().setViewport(v);

  const zoomAt = (factor: number, sx: number, sy: number) => {
    const v = vpRef.current;
    const z = clamp(v.zoom * factor, 0.08, 8);
    const k = z / v.zoom;
    setVp({ zoom: z, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k });
  };

  const fit = useCallback(() => {
    const s = store();
    const pg = currentPage();
    const rects = pg.order.map((id) => pg.nodes[id]).filter((n) => n && !n.hidden).map((n) => nodeVisualRect(n, pg, s.defs, s.doc.vlans));
    const b = unionRects(rects);
    const el = svgRef.current;
    if (!el) return;
    const W = el.clientWidth, H = el.clientHeight;
    if (!b) return setVp({ x: W / 2, y: H / 2, zoom: 1 });
    const pad = 60;
    const z = clamp(Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.h), 0.08, 2);
    setVp({ zoom: z, x: W / 2 - (b.x + b.w / 2) * z, y: H / 2 - (b.y + b.h / 2) * z });
  }, []);

  useEffect(() => {
    canvasApi.fit = fit;
    canvasApi.zoomBy = (f) => { const el = svgRef.current!; zoomAt(f, el.clientWidth / 2, el.clientHeight / 2); };
    canvasApi.zoomTo = (z) => { const el = svgRef.current!; zoomAt(z / vpRef.current.zoom, el.clientWidth / 2, el.clientHeight / 2); };
    canvasApi.center = () => { const el = svgRef.current!; const v = vpRef.current; return { x: (el.clientWidth / 2 - v.x) / v.zoom, y: (el.clientHeight / 2 - v.y) / v.zoom }; };
    canvasApi.editLabel = (id) => startEditing(id);
    canvasApi.fitTo = (ids) => fitRects(ids, true);
    canvasApi.reveal = (ids) => fitRects(ids, false);
  });

  /** rects of nodes/links by id on the current page */
  function rectsOf(ids: string[]): Rect[] {
    const s = store();
    const pg = currentPage();
    const out: Rect[] = [];
    for (const id of ids) {
      const n = pg.nodes[id];
      if (n) { out.push(nodeVisualRect(n, pg, s.defs, s.doc.vlans)); continue; }
      const l = pg.links[id];
      if (l) {
        const g = linkGeometry(l, pg, s.defs, s.doc.vlans);
        if (g) out.push({ x: Math.min(g.start.x, g.end.x), y: Math.min(g.start.y, g.end.y), w: Math.abs(g.end.x - g.start.x) || 1, h: Math.abs(g.end.y - g.start.y) || 1 });
      }
    }
    return out;
  }
  function fitRects(ids: string[], zoom: boolean) {
    const b = unionRects(rectsOf(ids));
    const el = svgRef.current;
    if (!b || !el) return;
    const W = el.clientWidth, H = el.clientHeight;
    const v = vpRef.current;
    let z = v.zoom;
    if (zoom) z = clamp(Math.min((W - 120) / b.w, (H - 120) / b.h), 0.08, 2.5);
    else if (b.w * z > W - 80 || b.h * z > H - 80) z = clamp(Math.min((W - 80) / b.w, (H - 80) / b.h), 0.08, z);
    setVp({ zoom: z, x: W / 2 - (b.x + b.w / 2) * z, y: H / 2 - (b.y + b.h / 2) * z });
  }

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // fit when a document is loaded or a page without a viewport is opened
  useEffect(() => { requestAnimationFrame(fit); }, [fitRequest]);
  useEffect(() => { if (!store().viewports[pageId]) requestAnimationFrame(fit); }, [pageId]);

  // wheel: pan, ctrl/⌘+wheel or pinch: zoom
  useEffect(() => {
    const el = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022));
        zoomAt(f, e.clientX - r.left, e.clientY - r.top);
      } else {
        const v = vpRef.current;
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        setVp({ ...v, x: v.x - dx, y: v.y - dy });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // space to pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping()) { e.preventDefault(); setSpace(true); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  /* ---------- helpers ---------- */
  const rectOf = (n: DiagramNode) => nodeRect(n, page, defs, doc.vlans);

  const devicePortsVisible = useMemo(() => {
    const ids = new Set<string>();
    if (showAllPorts || tool === 'connect' || drag?.kind === 'link') {
      Object.values(page.nodes).forEach((n) => n.kind === 'device' && !n.hidden && !n.locked && ids.add(n.id));
    } else {
      if (hover && page.nodes[hover]?.kind === 'device' && !page.nodes[hover].locked) ids.add(hover);
      selection.forEach((id) => page.nodes[id]?.kind === 'device' && !page.nodes[id].locked && ids.add(id));
    }
    return ids;
  }, [showAllPorts, tool, drag?.kind, hover, selection, page]);

  function startEditing(id: string) {
    const pg = currentPage();
    const n = pg.nodes[id];
    if (n?.kind === 'text') setEditing({ id, field: 'text' });
    else if (n?.kind === 'device') setEditing({ id, field: 'name' });
    else if (n?.kind === 'zone') setEditing({ id, field: 'title' });
    else if (pg.links[id]) setEditing({ id, field: 'label' });
  }

  const elementAt = (cx: number, cy: number) => document.elementFromPoint(cx, cy) as Element | null;

  /** resolve what the pointer is over while dragging a link */
  const resolveLinkTarget = (d: Extract<Drag, { kind: 'link' }>, cx: number, cy: number, w: Pt): { target: Endpoint | null; invalid?: string } => {
    const el = elementAt(cx, cy);
    const pg = currentPage();
    const exceptLink = d.relink?.id;
    const portEl = el?.closest('[data-port]');
    if (portEl) {
      const [nid, pid] = portEl.getAttribute('data-port')!.split('|');
      if (nid === d.from.node) return { target: null, invalid: 'Cannot connect a device to itself' };
      const n = pg.nodes[nid] as DeviceNode;
      const port = defs[n.defId]?.ports.find((p) => p.id === pid);
      if (!port) return { target: null };
      if (d.fromMedia && !mediaCompatible(d.fromMedia, port.media)) return { target: { node: nid, port: pid }, invalid: `Incompatible ports: ${d.fromMedia} ↔ ${port.media}` };
      if (!portFree(pg, nid, port, exceptLink)) return { target: { node: nid, port: pid }, invalid: `Port ${port.name} is already in use` };
      return { target: { node: nid, port: pid } };
    }
    const nodeEl = el?.closest('[data-id]');
    const nid = nodeEl?.getAttribute('data-id');
    if (nid && nid !== d.from.node) {
      const n = pg.nodes[nid];
      if (n?.kind !== 'device') return { target: null };
      const def = defs[n.defId];
      if (!def || !def.ports.length) return { target: { node: nid } };
      const p = pickPort(pg, n, def, w, d.fromMedia, exceptLink);
      if (!p) return { target: { node: nid }, invalid: 'No free compatible port on this device' };
      return { target: { node: nid, port: p.id } };
    }
    return { target: null };
  };

  /* ---------- pointer handlers ---------- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (editing) return;
    setMenu(null);
    const svg = svgRef.current!;
    const target = e.target as Element;
    const w = toWorld(e.clientX, e.clientY);
    const s = store();

    if (e.button === 1 || (e.button === 0 && (tool === 'hand' || space))) {
      svg.setPointerCapture(e.pointerId);
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: vp.x, vy: vp.y });
      return;
    }
    if (e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);

    if (s.readOnly) {
      // viewer: click selects, drag pans
      const id = target.closest('[data-id]')?.getAttribute('data-id') ?? target.closest('[data-link-id]')?.getAttribute('data-link-id');
      s.select(id ? [id] : []);
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: vp.x, vy: vp.y });
      return;
    }

    const pageLinkEl = target.closest('[data-pagelink]');
    if (pageLinkEl) {
      const n = page.nodes[pageLinkEl.getAttribute('data-pagelink')!];
      if (n?.pageLink && doc.pages.some((p) => p.id === n.pageLink)) { s.setPage(n.pageLink); return; }
    }
    const portEl = target.closest('[data-port]');
    const handleEl = target.closest('[data-handle]');
    const linkEndEl = target.closest('[data-link-end]');
    const bendEl = target.closest('[data-bend]');
    const linkEl = target.closest('[data-link-id]');
    const nodeEl = target.closest('[data-id]');
    const nodeId = nodeEl?.getAttribute('data-id') ?? null;

    if (tool === 'select' && !portEl && !handleEl && !linkEndEl && !bendEl) {
      const clickId = nodeId ?? linkEl?.getAttribute('data-link-id') ?? null;
      const now = performance.now();
      const lc = lastClick.current;
      if (lc && clickId && lc.id === clickId && now - lc.t < 380 && Math.hypot(lc.x - e.clientX, lc.y - e.clientY) < 6) {
        lastClick.current = null;
        e.preventDefault(); // no compat mousedown → the inline editor keeps focus
        s.select([clickId]);
        setTimeout(() => startEditing(clickId), 0);
        return;
      }
      lastClick.current = { t: now, id: clickId, x: e.clientX, y: e.clientY };
    }

    if (handleEl) {
      const id = s.selection[0];
      const n = page.nodes[id];
      if (n) setDrag({ kind: 'resize', id, handle: handleEl.getAttribute('data-handle') as Handle, start: w, orig: rectOf(n), begun: false });
      return;
    }
    if (linkEndEl) {
      const [lid, end] = linkEndEl.getAttribute('data-link-end')!.split('|') as [string, 'from' | 'to'];
      const l = page.links[lid];
      if (!l) return;
      const fixed = end === 'from' ? l.to : l.from;
      const fixedNode = page.nodes[fixed.node] as DeviceNode;
      const fixedPort = fixedNode?.kind === 'device' ? defs[fixedNode.defId]?.ports.find((p) => p.id === fixed.port) : undefined;
      setDrag({ kind: 'link', from: fixed, fromMedia: fixedPort?.media, cur: w, relink: { id: lid, end } });
      return;
    }
    if (bendEl) {
      setDrag({ kind: 'bend', id: bendEl.getAttribute('data-bend')!, begun: false });
      return;
    }
    const wpEl = target.closest('[data-wp]');
    if (wpEl) {
      const [lid, idxS] = wpEl.getAttribute('data-wp')!.split('|');
      const idx = +idxS;
      if (e.altKey) { s.change((_d, pg) => { pg.links[lid]?.waypoints?.splice(idx, 1); }); return; }
      setDrag({ kind: 'waypoint', id: lid, index: idx, begun: false });
      return;
    }
    const wpAddEl = target.closest('[data-wp-add]');
    if (wpAddEl) {
      const [lid, idxS] = wpAddEl.getAttribute('data-wp-add')!.split('|');
      const idx = +idxS;
      s.beginGesture();
      s.change((_d, pg) => { const l = pg.links[lid]; if (!l) return; (l.waypoints ??= []).splice(idx, 0, { x: w.x, y: w.y }); }, false);
      setDrag({ kind: 'waypoint', id: lid, index: idx, begun: true });
      return;
    }
    if (portEl && (tool === 'select' || tool === 'connect')) {
      const [nid, pid] = portEl.getAttribute('data-port')!.split('|');
      const n = page.nodes[nid] as DeviceNode;
      const port = defs[n.defId]?.ports.find((p) => p.id === pid);
      if (port && !portFree(page, nid, port)) {
        s.toast(`Port ${port.name} is already in use (max ${port.maxLinks})`, 'error');
        return;
      }
      setDrag({ kind: 'link', from: { node: nid, port: pid }, fromMedia: port?.media, cur: w });
      return;
    }

    if (tool === 'connect') {
      if (nodeId && page.nodes[nodeId]?.kind === 'device') {
        const n = page.nodes[nodeId] as DeviceNode;
        const def = defs[n.defId];
        const p = def ? pickPort(page, n, def, w) : undefined;
        if (def?.ports.length && !p) return s.toast('No free port on this device', 'error');
        setDrag({ kind: 'link', from: { node: nodeId, port: p?.id }, fromMedia: p?.media, cur: w });
      }
      return;
    }
    if (tool === 'zone' || tool === 'rect') {
      setDrag({ kind: 'create', tool, start: w, cur: w });
      return;
    }
    if (tool === 'text') {
      const t = createText(snapOn ? snap(w.x, gridSize) : w.x, snapOn ? snap(w.y, gridSize) : w.y);
      s.change((_d, pg) => { pg.nodes[t.id] = t; pg.order.push(t.id); });
      s.set({ selection: [t.id], tool: 'select' });
      setTimeout(() => setEditing({ id: t.id, field: 'text' }), 0);
      return;
    }

    // select tool
    if (nodeId && page.nodes[nodeId]) {
      let sel = s.selection;
      const gid = page.nodes[nodeId].groupId;
      // a grouped node selects its whole group unless Ctrl/⌘ is held
      const unit = gid && !modKey(e) ? page.order.filter((id) => page.nodes[id]?.groupId === gid) : [nodeId];
      if (e.shiftKey) {
        s.select(unit, 'toggle');
        sel = store().selection;
        if (!sel.includes(nodeId)) return;
      } else if (!sel.includes(nodeId) || (gid && !modKey(e) && !unit.every((id) => sel.includes(id)))) {
        s.select(unit);
        sel = unit;
      }
      startMove(sel, w, nodeId, e.altKey);
      return;
    }
    if (linkEl) {
      const lid = linkEl.getAttribute('data-link-id')!;
      s.select([lid], e.shiftKey ? 'toggle' : 'replace');
      return;
    }
    if (!e.shiftKey) s.select([]);
    setDrag({ kind: 'marquee', start: w, cur: w, base: e.shiftKey ? s.selection : [], additive: e.shiftKey });
  };

  function startMove(sel: string[], w: Pt, clickedId: string, alt: boolean) {
    const pg = currentPage();
    const s = store();
    const ids = new Set(sel.filter((id) => pg.nodes[id] && !pg.nodes[id].locked && !layerLocked(doc.layers, pg.nodes[id].layerId)));
    // zones carry the nodes inside them (hold Alt to move the zone alone)
    if (!alt) {
      for (const id of [...ids]) {
        const z = pg.nodes[id];
        if (z.kind !== 'zone') continue;
        const zr = rectOf(z);
        for (const oid of pg.order) {
          const o = pg.nodes[oid];
          if (!o || o.locked || o.hidden || ids.has(oid) || layerLocked(doc.layers, o.layerId)) continue;
          if (rectContains(zr, rectOf(o))) ids.add(oid);
        }
      }
    }
    const origin: Record<string, Pt> = {};
    ids.forEach((id) => { origin[id] = { x: pg.nodes[id].x, y: pg.nodes[id].y }; });
    const moving = [...ids];
    const startRect = unionRects(sel.filter((id) => ids.has(id)).map((id) => rectOf(pg.nodes[id]))) ?? { x: w.x, y: w.y, w: 0, h: 0 };
    const xs: number[] = [], ys: number[] = [];
    for (const oid of pg.order) {
      const o = pg.nodes[oid];
      if (!o || ids.has(oid) || o.hidden) continue;
      const r = rectOf(o);
      xs.push(r.x, r.x + r.w / 2, r.x + r.w);
      ys.push(r.y, r.y + r.h / 2, r.y + r.h);
    }
    void s;
    setDrag({ kind: 'move', start: w, ids: moving, origin, startRect, clickedId, moved: false, shift: false, targets: { xs, ys } });
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const s = store();
    if (!d) {
      const t = e.target as Element;
      const portEl = t.closest('[data-port]');
      setHoverPort(portEl?.getAttribute('data-port') ?? null);
      const nid = t.closest('[data-id]')?.getAttribute('data-id') ?? null;
      if (nid !== hover) setHover(nid);
      // hover card after a short pause over a device
      window.clearTimeout(hoverTimer.current);
      if (nid && page.nodes[nid]?.kind === 'device') {
        const r = wrapRef.current!.getBoundingClientRect();
        const pos = { x: e.clientX - r.left + 14, y: e.clientY - r.top + 14 };
        if (hoverCard?.id !== nid) { setHoverCard(null); hoverTimer.current = window.setTimeout(() => setHoverCard({ id: nid, ...pos }), 550); }
      } else if (hoverCard) setHoverCard(null);
      return;
    }
    if (hoverCard) setHoverCard(null);
    const w = toWorld(e.clientX, e.clientY);
    switch (d.kind) {
      case 'pan':
        setVp({ ...vpRef.current, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy });
        break;
      case 'marquee':
        setDrag({ ...d, cur: w });
        break;
      case 'create':
        setDrag({ ...d, cur: w });
        break;
      case 'move': {
        let dx = w.x - d.start.x, dy = w.y - d.start.y;
        if (!d.moved && Math.hypot(dx * vp.zoom, dy * vp.zoom) < 3) return;
        if (!d.moved) s.beginGesture();
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        // snapping: smart guides first, then grid
        const r = { ...d.startRect, x: d.startRect.x + dx, y: d.startRect.y + dy };
        const gx: number[] = [], gy: number[] = [];
        let snappedX = false, snappedY = false;
        if (guidesOn) {
          const thr = 5 / vp.zoom;
          const cand = (vals: number[], targets: number[]) => {
            let best: { delta: number; at: number } | null = null;
            for (const v of vals) for (const t of targets) {
              const dd = t - v;
              if (Math.abs(dd) <= thr && (!best || Math.abs(dd) < Math.abs(best.delta))) best = { delta: dd, at: t };
            }
            return best;
          };
          const bx = cand([r.x, r.x + r.w / 2, r.x + r.w], d.targets.xs);
          const by = cand([r.y, r.y + r.h / 2, r.y + r.h], d.targets.ys);
          if (bx) { dx += bx.delta; gx.push(bx.at); snappedX = true; }
          if (by) { dy += by.delta; gy.push(by.at); snappedY = true; }
        }
        if (snapOn) {
          if (!snappedX) dx = snap(d.startRect.x + dx, gridSize) - d.startRect.x;
          if (!snappedY) dy = snap(d.startRect.y + dy, gridSize) - d.startRect.y;
        }
        setGuides({ x: gx, y: gy });
        s.change((_doc, pg) => {
          for (const id of d.ids) {
            const n = pg.nodes[id];
            if (!n) continue;
            n.x = Math.round((d.origin[id].x + dx) * 100) / 100;
            n.y = Math.round((d.origin[id].y + dy) * 100) / 100;
          }
        }, false);
        if (!d.moved) setDrag({ ...d, moved: true });
        break;
      }
      case 'resize': {
        if (!d.begun) { s.beginGesture(); setDrag({ ...d, begun: true }); }
        const n = currentPage().nodes[d.id];
        if (!n) return;
        const o = d.orig;
        let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
        const px = snapOn ? snap(w.x, gridSize) : w.x;
        const py = snapOn ? snap(w.y, gridSize) : w.y;
        if (d.handle.includes('w')) x1 = Math.min(px, x2 - 8);
        if (d.handle.includes('e')) x2 = Math.max(px, x1 + 8);
        if (d.handle.includes('n')) y1 = Math.min(py, y2 - 8);
        if (d.handle.includes('s')) y2 = Math.max(py, y1 + 8);
        const keep = n.kind === 'device' ? !e.shiftKey : e.shiftKey;
        if (keep && o.w && o.h) {
          const ratio = o.w / o.h;
          let nw = x2 - x1, nh = y2 - y1;
          if (d.handle === 'n' || d.handle === 's') nw = nh * ratio;
          else if (d.handle === 'e' || d.handle === 'w') nh = nw / ratio;
          else if (nw / nh > ratio) nh = nw / ratio; else nw = nh * ratio;
          if (d.handle.includes('w')) x1 = x2 - nw; else if (d.handle === 'n' || d.handle === 's') { x1 = o.x + o.w / 2 - nw / 2; } x2 = x1 + nw;
          if (d.handle.includes('n')) y1 = y2 - nh; else if (d.handle === 'e' || d.handle === 'w') { y1 = o.y + o.h / 2 - nh / 2; } y2 = y1 + nh;
        }
        s.change((_doc, pg) => {
          const m = pg.nodes[d.id];
          m.x = x1; m.y = y1; m.w = x2 - x1; m.h = y2 - y1;
        }, false);
        break;
      }
      case 'link': {
        const res = resolveLinkTarget(d, e.clientX, e.clientY, w);
        setDrag({ ...d, cur: w, target: res.target, invalid: res.invalid });
        break;
      }
      case 'waypoint': {
        if (!d.begun) { s.beginGesture(); setDrag({ ...d, begun: true }); }
        const px = snapOn ? snap(w.x, gridSize) : Math.round(w.x), py = snapOn ? snap(w.y, gridSize) : Math.round(w.y);
        s.change((_doc, p) => { const wp = p.links[d.id]?.waypoints; if (wp && wp[d.index]) wp[d.index] = { x: px, y: py }; }, false);
        break;
      }
      case 'bend': {
        const pg = currentPage();
        const l = pg.links[d.id];
        if (!l) return;
        const g = linkGeometry({ ...l, bend: 0.5 }, pg, defs, doc.vlans);
        if (!g) return;
        if (!d.begun) { s.beginGesture(); setDrag({ ...d, begun: true }); }
        const horiz = Math.abs(g.startDir.x) > 0.5;
        const a = horiz ? g.start.x + g.startDir.x * 16 : g.start.y + g.startDir.y * 16;
        const b = horiz ? g.end.x - g.endDir.x * 16 : g.end.y - g.endDir.y * 16;
        const v = horiz ? w.x : w.y;
        const bend = b === a ? 0.5 : clamp((v - a) / (b - a), -1, 2);
        s.change((_doc, p) => { p.links[d.id].bend = Math.round(bend * 1000) / 1000; }, false);
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const s = store();
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    setGuides({ x: [], y: [] });
    if (!d) return;
    setDrag(null);
    switch (d.kind) {
      case 'move':
        if (d.moved) s.endGesture();
        else if (!e.shiftKey && s.selection.length > 1) s.select([d.clickedId]);
        break;
      case 'resize':
      case 'bend':
      case 'waypoint':
        if (d.begun) s.endGesture();
        break;
      case 'marquee': {
        const r = normRect(d.start, d.cur);
        if (r.w < 2 && r.h < 2) break;
        const hits = page.order.filter((id) => {
          const n = page.nodes[id];
          if (!n || n.hidden || n.locked || layerLocked(doc.layers, n.layerId) || layerHidden(doc.layers, n.layerId)) return false;
          const nr = rectOf(n);
          return n.kind === 'zone' ? rectContains(r, nr) : rectsIntersect(r, nr);
        });
        // include whole groups touched by the marquee
        const gids = new Set(hits.map((id) => page.nodes[id]?.groupId).filter(Boolean));
        const expanded = gids.size ? page.order.filter((id) => gids.has(page.nodes[id]?.groupId)) : [];
        s.set({ selection: Array.from(new Set([...d.base, ...hits, ...expanded])) });
        break;
      }
      case 'create': {
        let r = normRect(d.start, d.cur);
        if (snapOn) r = { x: snap(r.x, gridSize), y: snap(r.y, gridSize), w: snap(r.w, gridSize), h: snap(r.h, gridSize) };
        if (r.w < 16 || r.h < 16) r = { x: r.x, y: r.y, w: d.tool === 'zone' ? 320 : 160, h: d.tool === 'zone' ? 220 : 100 };
        const n = d.tool === 'zone' ? createZone(r.x, r.y, r.w, r.h) : createRect(r.x, r.y, r.w, r.h);
        if (n.kind === 'zone') {
          // auto-number the new zone
          n.title = '';
          n.tag = 'New zone';
        }
        s.change((_doc, pg) => {
          pg.nodes[n.id] = n;
          if (n.kind === 'zone') pg.order.unshift(n.id); else pg.order.push(n.id);
        });
        s.set({ selection: [n.id], tool: 'select' });
        break;
      }
      case 'link': {
        const res = resolveLinkTarget(d, e.clientX, e.clientY, toWorld(e.clientX, e.clientY));
        if (res.invalid) { s.toast(res.invalid, 'error'); break; }
        if (!res.target) break;
        const pg = currentPage();
        const tn = pg.nodes[res.target.node] as DeviceNode;
        const tPort = tn?.kind === 'device' ? defs[tn.defId]?.ports.find((p) => p.id === res.target!.port) : undefined;
        if (d.relink) {
          const { id, end } = d.relink;
          s.change((_doc, p) => { p.links[id][end] = res.target!; });
          break;
        }
        const media = linkMediaFor(d.fromMedia, tPort?.media);
        const l: Link = newLink(d.from, res.target, media);
        s.change((_doc, p) => { p.links[l.id] = l; });
        s.set({ selection: [l.id] });
        break;
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (store().readOnly) return;
    const t = e.target as Element;
    const id = t.closest('[data-id]')?.getAttribute('data-id') ?? t.closest('[data-link-id]')?.getAttribute('data-link-id');
    if (id) { store().select([id]); startEditing(id); }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const s = store();
    if (s.readOnly) return;
    const t = e.target as Element;
    const id = t.closest('[data-id]')?.getAttribute('data-id') ?? t.closest('[data-link-id]')?.getAttribute('data-link-id') ?? null;
    if (id && !s.selection.includes(id)) s.select([id]);
    if (!id) s.select([]);
    const w = toWorld(e.clientX, e.clientY);
    const sel = store().selection;
    const n = id ? page.nodes[id] : undefined;
    const items: MenuItem[] = [];
    if (sel.length) {
      if (n) items.push({ label: 'Rename / edit label', shortcut: 'Dbl-click', action: () => startEditing(n.id) });
      if (n?.kind === 'device' && defs[n.defId]) items.push({ label: 'Edit device definition…', action: () => s.openEditor(defs[n.defId]) });
      items.push({ label: 'Copy', shortcut: 'Ctrl+C', action: s.copy });
      items.push({ label: 'Duplicate', shortcut: 'Ctrl+D', action: s.duplicate });
      items.push({ sep: true });
      items.push({ label: 'Bring to front', shortcut: ']', action: () => s.zOrder('front') });
      items.push({ label: 'Send to back', shortcut: '[', action: () => s.zOrder('back') });
      if (n) {
        items.push({ sep: true });
        items.push({ label: n.locked ? 'Unlock' : 'Lock', action: () => s.change((_d, pg) => { pg.nodes[n.id].locked = !n.locked; }) });
        items.push({ label: 'Hide', action: () => s.change((_d, pg) => { pg.nodes[n.id].hidden = true; }) });
      }
      items.push({ sep: true });
      items.push({ label: 'Delete', shortcut: 'Del', danger: true, action: s.deleteSelection });
    } else {
      items.push({ label: 'Paste here', shortcut: 'Ctrl+V', disabled: !s.clipboard, action: () => s.paste(w) });
      items.push({ label: 'Select all', shortcut: 'Ctrl+A', action: s.selectAll });
      items.push({ label: 'Zoom to fit', shortcut: 'Shift+1', action: fit });
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  /* ---------- drop from library ---------- */
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-netcanvas-def')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  };
  const onDrop = (e: React.DragEvent) => {
    if (store().readOnly) return;
    const defId = e.dataTransfer.getData('application/x-netcanvas-def');
    const lib = store().libDefs;
    const def = lib[defId];
    if (!def) return;
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    const n = createDevice(def, w.x, w.y, placementDefId(lib, def, doc.iconStyle ?? 'iso'));
    if (snapOn) { n.x = snap(n.x, gridSize); n.y = snap(n.y, gridSize); }
    const s = store();
    s.change((_d, pg) => { pg.nodes[n.id] = n; pg.order.push(n.id); });
    s.set({ selection: [n.id], tool: 'select' });
  };

  /* ---------- render ---------- */
  const z = vp.zoom;
  const inv = 1 / z;
  const view = { x: -vp.x / z, y: -vp.y / z, w: size.w / z, h: size.h / z };
  let gridStep = gridSize;
  while (gridStep * z < 12) gridStep *= 2;

  const selNodes = selection.map((id) => page.nodes[id]).filter(Boolean) as DiagramNode[];
  const selLinks = selection.map((id) => page.links[id]).filter(Boolean) as Link[];
  const single = selNodes.length === 1 && !selLinks.length ? selNodes[0] : null;
  const readOnly = useStore((s) => s.readOnly);
  const resizable = single && !readOnly && !single.locked && single.kind !== 'legend' && single.kind !== 'vlanTable';

  let cursor = 'default';
  if (tool === 'hand' || space) cursor = drag?.kind === 'pan' ? 'grabbing' : 'grab';
  else if (tool === 'zone' || tool === 'rect' || tool === 'connect') cursor = 'crosshair';
  else if (tool === 'text') cursor = 'text';
  if (drag?.kind === 'resize') cursor = HANDLE_CURSOR[drag.handle];
  if (drag?.kind === 'link') cursor = drag.invalid ? 'not-allowed' : 'crosshair';

  // preview for link being drawn
  let linkPreview: React.ReactNode = null;
  if (drag?.kind === 'link') {
    const fromN = page.nodes[drag.from.node];
    let a: Pt | null = null;
    if (fromN?.kind === 'device') {
      const def = defs[fromN.defId];
      const p = def?.ports.find((pp) => pp.id === drag.from.port);
      if (def && p) a = portWorld(fromN, def, p);
    }
    if (!a && fromN) { const r = rectOf(fromN); a = { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
    let b: Pt = drag.cur;
    if (drag.target?.port) {
      const tn = page.nodes[drag.target.node] as DeviceNode;
      const def = defs[tn.defId];
      const p = def?.ports.find((pp) => pp.id === drag.target!.port);
      if (def && p) b = portWorld(tn, def, p);
    }
    if (a) {
      const col = drag.invalid ? '#e5484d' : drag.target ? '#22c55e' : theme.selection;
      linkPreview = (
        <g pointerEvents="none">
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={2 * inv} strokeDasharray={`${6 * inv} ${4 * inv}`} />
          <circle cx={b.x} cy={b.y} r={4 * inv} fill={col} />
          {drag.invalid && (
            <text x={b.x + 10 * inv} y={b.y - 10 * inv} fontSize={11 * inv} fill="#e5484d" fontFamily={FONT} fontWeight={600}>{drag.invalid}</text>
          )}
        </g>
      );
    }
  }

  const portR = clamp(4.2 * inv, 2, 10);

  return (
    <div ref={wrapRef} className="canvas-wrap" style={{ background: theme.bg }}>
      <svg
        ref={svgRef}
        className="canvas-svg"
        width={size.w}
        height={size.h}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !dragRef.current && setHover(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
        data-canvas
      >
        <defs>
          <pattern id="grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={1.1 * inv} fill={theme.gridStrong} />
          </pattern>
        </defs>
        <g transform={`translate(${vp.x} ${vp.y}) scale(${z})`}>
          {showGrid && <rect x={view.x - gridStep} y={view.y - gridStep} width={view.w + gridStep * 2} height={view.h + gridStep * 2} fill="url(#grid)" />}
          <DiagramLayer page={page} defs={defs} vlans={doc.vlans} theme={theme} interactive editingId={editing?.field !== 'label' ? editing?.id : null}
            linkColorByMedia={doc.linkColorByMedia} lineJumps={doc.lineJumps} hidePortLabels={doc.hidePortLabels} doc={doc} layers={doc.layers} />

          {/* hover outline */}
          {hover && !selection.includes(hover) && page.nodes[hover] && !drag && (
            (() => { const r = rectOf(page.nodes[hover]); return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={theme.selection} strokeWidth={1.2 * inv} pointerEvents="none" />; })()
          )}

          {/* selection */}
          <g pointerEvents="none">
            {selNodes.map((n) => {
              const r = rectOf(n);
              return <rect key={n.id} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={n.locked ? '#f5a524' : theme.selection} strokeWidth={1.5 * inv} />;
            })}
            {(() => {
              // dashed outline around each selected group
              const gids = new Set(selNodes.map((n) => n.groupId).filter(Boolean) as string[]);
              return [...gids].map((gid) => {
                const members = page.order.map((id) => page.nodes[id]).filter((n) => n?.groupId === gid);
                const b = unionRects(members.map(rectOf));
                return b ? <rect key={gid} x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="none" stroke={theme.selection} strokeWidth={inv} strokeDasharray={`${5 * inv} ${3 * inv}`} opacity={0.8} /> : null;
              });
            })()}
            {selNodes.length > 1 && (() => {
              const b = unionRects(selNodes.map(rectOf))!;
              return <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={theme.selection} strokeWidth={inv} strokeDasharray={`${4 * inv} ${3 * inv}`} />;
            })()}
          </g>
          {selLinks.map((l) => {
            const g = linkGeometry(l, page, defs, doc.vlans);
            if (!g) return null;
            return (
              <g key={l.id} style={readOnly ? { pointerEvents: 'none' } : undefined}>
                <path d={g.d} stroke={theme.selection} strokeWidth={l.width + 3 * inv} fill="none" opacity={0.45} pointerEvents="none" strokeDasharray={dashArray(l)} />
                {!readOnly && <circle data-link-end={`${l.id}|from`} cx={g.start.x} cy={g.start.y} r={5 * inv} fill="#fff" stroke={theme.selection} strokeWidth={1.5 * inv} style={{ cursor: 'move' }} />}
                {!readOnly && <circle data-link-end={`${l.id}|to`} cx={g.end.x} cy={g.end.y} r={5 * inv} fill="#fff" stroke={theme.selection} strokeWidth={1.5 * inv} style={{ cursor: 'move' }} />}
                {!readOnly && l.routing === 'orthogonal' && (
                  <rect data-bend={l.id} x={g.mid.x - 5 * inv} y={g.mid.y - 5 * inv} width={10 * inv} height={10 * inv} rx={2 * inv}
                    fill={theme.selection} stroke="#fff" strokeWidth={1.2 * inv} style={{ cursor: Math.abs(g.startDir.x) > 0.5 ? 'ew-resize' : 'ns-resize' }} />
                )}
                {!readOnly && l.routing === 'straight' && (() => {
                  const pts = g.pts;
                  const wps = l.waypoints ?? [];
                  return (
                    <g>
                      {pts.slice(0, -1).map((p, i) => {
                        const q = pts[i + 1];
                        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
                        return <circle key={'a' + i} data-wp-add={`${l.id}|${i}`} cx={mx} cy={my} r={4 * inv} fill={theme.bg} stroke={theme.selection} strokeWidth={1.2 * inv} strokeDasharray={`${2 * inv} ${1.5 * inv}`} style={{ cursor: 'copy' }}><title>Drag to add a bend point</title></circle>;
                      })}
                      {wps.map((p, i) => (
                        <rect key={'w' + i} data-wp={`${l.id}|${i}`} x={p.x - 4.5 * inv} y={p.y - 4.5 * inv} width={9 * inv} height={9 * inv} rx={2 * inv} fill={theme.selection} stroke="#fff" strokeWidth={1.2 * inv} style={{ cursor: 'move' }}><title>Drag to move · Alt+click to remove</title></rect>
                      ))}
                    </g>
                  );
                })()}
              </g>
            );
          })}
          {/* ports */}
          {[...devicePortsVisible].map((nid) => {
            const n = page.nodes[nid] as DeviceNode;
            const def = defs[n?.defId];
            if (!def || n.hidden) return null;
            return (
              <g key={nid} data-id={nid}>
                {def.ports.map((p) => {
                  const pw = portWorld(n, def, p);
                  const used = portUsage(page, nid, p.id);
                  const full = p.maxLinks > 0 && used >= p.maxLinks;
                  const key = `${nid}|${p.id}`;
                  let ring = MEDIA_COLORS[p.media] ?? '#9aa3b2';
                  let op = 1;
                  if (drag?.kind === 'link' && nid !== drag.from.node) {
                    const ok = (!drag.fromMedia || mediaCompatible(drag.fromMedia, p.media)) && !full;
                    if (!ok) { op = 0.3; ring = '#e5484d'; }
                  }
                  const isHover = hoverPort === key || (drag?.kind === 'link' && drag.target?.node === nid && drag.target?.port === p.id);
                  return (
                    <g key={p.id} data-port={key} opacity={op} style={{ cursor: 'crosshair' }}>
                      <circle cx={pw.x} cy={pw.y} r={portR * 2.2} fill="transparent" />
                      <circle cx={pw.x} cy={pw.y} r={isHover ? portR * 1.35 : portR} fill={used ? ring : theme.portFill} stroke={ring} strokeWidth={1.6 * inv} />
                      {(isHover || p.media === 'wireless') && isHover && (
                        <g pointerEvents="none">
                          <rect x={pw.x + 8 * inv} y={pw.y - 18 * inv} width={(p.name.length * 6.6 + 60) * inv} height={16 * inv} rx={3 * inv} fill="#111" opacity={0.9} />
                          <text x={pw.x + 13 * inv} y={pw.y - 10 * inv} fontSize={10 * inv} fill="#fff" fontFamily={FONT} dominantBaseline="central" fontWeight={600}>
                            {p.name} · {p.media}{p.maxLinks !== 1 ? ` · ${p.maxLinks === 0 ? '∞' : p.maxLinks}` : ''}{full ? ' · in use' : ''}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {linkPreview}
          {resizable && single && (() => {
            const r = rectOf(single);
            const hs = 8 * inv;
            const pos: Record<Handle, Pt> = {
              nw: { x: r.x, y: r.y }, n: { x: r.x + r.w / 2, y: r.y }, ne: { x: r.x + r.w, y: r.y }, e: { x: r.x + r.w, y: r.y + r.h / 2 },
              se: { x: r.x + r.w, y: r.y + r.h }, s: { x: r.x + r.w / 2, y: r.y + r.h }, sw: { x: r.x, y: r.y + r.h }, w: { x: r.x, y: r.y + r.h / 2 },
            };
            return HANDLES.map((h) => (
              <rect key={h} data-handle={h} x={pos[h].x - hs / 2} y={pos[h].y - hs / 2} width={hs} height={hs} rx={1.5 * inv}
                fill="#fff" stroke={theme.selection} strokeWidth={1.3 * inv} style={{ cursor: HANDLE_CURSOR[h] }} />
            ));
          })()}


          {/* guides */}
          <g pointerEvents="none" stroke="#ff3d71" strokeWidth={inv}>
            {guides.x.map((x, i) => <line key={'x' + i} x1={x} x2={x} y1={view.y} y2={view.y + view.h} />)}
            {guides.y.map((y, i) => <line key={'y' + i} y1={y} y2={y} x1={view.x} x2={view.x + view.w} />)}
          </g>

          {drag?.kind === 'marquee' && (() => {
            const r = normRect(drag.start, drag.cur);
            return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={theme.selection} fillOpacity={0.08} stroke={theme.selection} strokeWidth={inv} pointerEvents="none" />;
          })()}
          {drag?.kind === 'create' && (() => {
            const r = normRect(drag.start, drag.cur);
            return <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={6} fill={theme.zoneFill} fillOpacity={0.7} stroke={theme.selection} strokeWidth={inv} pointerEvents="none" />;
          })()}
        </g>
      </svg>

      {editing && <InlineEditor editing={editing} vp={vp} onDone={() => setEditing(null)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      <div className="zoom-indicator">{Math.round(z * 100)}%</div>
      {hoverCard && !drag && !editing && page.nodes[hoverCard.id]?.kind === 'device' && (
        <HoverCard n={page.nodes[hoverCard.id] as DeviceNode} x={hoverCard.x} y={hoverCard.y} />
      )}
    </div>
  );
}

export function isTyping() {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
}

function InlineEditor({ editing, vp, onDone }: { editing: Editing; vp: Viewport; onDone: () => void }) {
  const s = useStore.getState();
  const page = currentPage();
  const n = page.nodes[editing.id];
  const l = page.links[editing.id];
  const defs = s.defs;
  let initial = '';
  let box = { x: 0, y: 0, w: 160, h: 24 };
  let fontSize = 12;
  let multiline = false;
  if (n?.kind === 'text') { initial = n.text; box = { x: n.x, y: n.y, w: Math.max(n.w, 120), h: n.h }; fontSize = n.fontSize; multiline = true; }
  else if (n?.kind === 'device') { initial = n.name; box = { x: n.x + n.w / 2 - 80, y: n.y + n.h + 4, w: 160, h: 18 }; fontSize = 11.5; }
  else if (n?.kind === 'zone') { initial = n.title; box = { x: n.x + 6, y: n.y + 3, w: Math.min(220, n.w - 12), h: 18 }; fontSize = 11; }
  else if (l) {
    const g = linkGeometry(l, page, defs, s.doc.vlans);
    initial = l.label ?? '';
    if (g) box = { x: g.mid.x - 60, y: g.mid.y - 10, w: 120, h: 20 };
    fontSize = 10;
  }
  const [val, setVal] = useState(initial);
  if (!n && !l) return null;
  const commit = () => {
    s.change((_d, pg) => {
      const m = pg.nodes[editing.id];
      if (m?.kind === 'text') {
        m.text = val;
        const lines = val.split('\n');
        m.h = Math.max(1, lines.length) * m.fontSize * 1.3 + 4;
        m.w = Math.max(m.w, Math.max(...lines.map((x) => x.length)) * m.fontSize * 0.6 + 8);
      } else if (m?.kind === 'device') m.name = val;
      else if (m?.kind === 'zone') m.title = val;
      else if (pg.links[editing.id]) pg.links[editing.id].label = val || undefined;
    });
    onDone();
  };
  const style: React.CSSProperties = {
    left: box.x * vp.zoom + vp.x,
    top: box.y * vp.zoom + vp.y,
    width: box.w * vp.zoom,
    minHeight: box.h * vp.zoom,
    fontSize: fontSize * vp.zoom,
    textAlign: n?.kind === 'device' || l ? 'center' : 'left',
    fontWeight: n?.kind === 'text' && !n.bold ? 400 : 700,
  };
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') onDone();
    if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
  };
  return multiline ? (
    <textarea className="inline-editor" autoFocus style={{ ...style, height: Math.max(box.h, (val.split('\n').length) * fontSize * 1.3 + 6) * vp.zoom }}
      value={val} onChange={(e) => setVal(e.target.value)} onBlur={commit} onKeyDown={keys} onFocus={(e) => e.target.select()} />
  ) : (
    <input className="inline-editor" autoFocus style={style} value={val} onChange={(e) => setVal(e.target.value)} onBlur={commit} onKeyDown={keys}
      onFocus={(e) => e.target.select()} />
  );
}

function HoverCard({ n, x, y }: { n: DeviceNode; x: number; y: number }) {
  const s = useStore.getState();
  const def = s.defs[n.defId];
  const page = currentPage();
  const links = Object.values(page.links).filter((l) => l.from.node === n.id || l.to.node === n.id).length;
  const props = def ? def.fields.filter((f) => n.props[f.key]) : [];
  return (
    <div className="hover-card" style={{ left: x, top: y }}>
      <div className="hover-title">{n.name}{n.subtitle ? <span className="dim"> · {n.subtitle}</span> : null}</div>
      <div className="hover-sub">{def?.name ?? n.defId}{def ? ` · ${links} link${links === 1 ? '' : 's'} · ${def.ports.length} ports` : ''}</div>
      {n.addresses.map((a) => {
        const v = s.doc.vlans.find((vl) => vl.id === a.vlan);
        return <div key={a.id} className="hover-row"><span className="dot" style={{ background: v?.color ?? (a.vlan === 'error' ? '#e5484d' : 'transparent') }} /><span className="mono">{a.value}</span>{v && <span className="dim">VLAN {v.vlanId}</span>}</div>;
      })}
      {props.slice(0, 4).map((f) => <div key={f.key} className="hover-row"><span className="dim">{f.label}</span><span>{n.props[f.key]}</span></div>)}
    </div>
  );
}
