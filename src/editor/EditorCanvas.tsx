import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor, polyAbs, setPolyAbs, nextPortName } from './editorStore';
import { ShapeView } from '../render/ShapeView';
import { canvasThemes, MEDIA_COLORS, FONT } from '../render/theme';
import { useStore } from '../store/store';
import type { PortDef, Shape, Viewport } from '../model/types';
import { clamp, normRect, rectsIntersect, uid, unionRects, type Pt, type Rect } from '../model/util';
import { autoSide } from '../model/geometry';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

type Drag =
  | { kind: 'pan'; sx: number; sy: number; v: Viewport }
  | { kind: 'move'; start: Pt; orig: Record<string, Pt>; moved: boolean; clicked: string; startRect: Rect | null; targets: { xs: number[]; ys: number[] } }
  | { kind: 'rotate'; id: string; cx: number; cy: number }
  | { kind: 'resize'; id: string; handle: Handle; orig: Rect }
  | { kind: 'marquee'; start: Pt; cur: Pt; base: string[] }
  | { kind: 'create'; tool: string; start: Pt; cur: Pt }
  | { kind: 'vertex'; id: string; index: number };

export const editorApi = { fit: () => {} };

export function EditorCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const e = useEditor();
  const { def, vp, tool, selection, pen, editPoints, snap: snapOn } = e;
  const theme = canvasThemes[useStore((s) => s.theme)];
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const [size, setSize] = useState({ w: 800, h: 600 });
  const dragRef = useRef<Drag | null>(null);
  const [drag, _setDrag] = useState<Drag | null>(null);
  const setDrag = (d: Drag | null) => { dragRef.current = d; _setDrag(d); };
  const [space, setSpace] = useState(false);
  const [cursorPt, setCursorPt] = useState<Pt | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const S = useEditor.getState;

  const toWorld = (cx: number, cy: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = vpRef.current;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  };
  const sn = (v: number) => (snapOn ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100);

  const fit = useCallback(() => {
    const el = svgRef.current;
    if (!el) return;
    const d = S().def;
    const W = el.clientWidth, H = el.clientHeight;
    const z = clamp(Math.min((W * 0.62) / d.w, (H * 0.62) / d.h), 1, 48);
    S().set({ vp: { zoom: z, x: W / 2 - (d.w / 2) * z, y: H / 2 - (d.h / 2) * z } });
  }, []);
  useEffect(() => { editorApi.fit = fit; });

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    requestAnimationFrame(fit);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = svgRef.current!;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const v = vpRef.current;
      const r = el.getBoundingClientRect();
      if (ev.ctrlKey || ev.metaKey) {
        const f = Math.exp(-ev.deltaY * 0.0022);
        const z = clamp(v.zoom * f, 0.5, 80);
        const k = z / v.zoom;
        const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
        S().set({ vp: { zoom: z, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k } });
      } else {
        S().set({ vp: { ...v, x: v.x - ev.deltaX, y: v.y - ev.deltaY } });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const kd = (ev: KeyboardEvent) => { if (ev.code === 'Space' && !(document.activeElement instanceof HTMLInputElement) && !(document.activeElement instanceof HTMLTextAreaElement)) { ev.preventDefault(); setSpace(true); } };
    const ku = (ev: KeyboardEvent) => { if (ev.code === 'Space') setSpace(false); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { el.removeEventListener('wheel', onWheel); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  const shapeRect = (s: Shape): Rect => ({ x: s.x, y: s.y, w: s.w, h: s.h });
  /** edges and centres of other shapes and of the artboard, for smart guides */
  const snapTargets = (exclude: Set<string>) => {
    const d = S().def;
    const xs = [0, d.w / 2, d.w], ys = [0, d.h / 2, d.h];
    for (const s of d.shapes) {
      if (exclude.has(s.id) || s.hidden || s.guide) continue;
      xs.push(s.x, s.x + s.w / 2, s.x + s.w);
      ys.push(s.y, s.y + s.h / 2, s.y + s.h);
    }
    return { xs, ys };
  };
  const nearest = (vals: number[], targets: number[], thr: number) => {
    let best: { delta: number; at: number } | null = null;
    for (const v of vals) for (const t of targets) {
      const dd = t - v;
      if (Math.abs(dd) <= thr && (!best || Math.abs(dd) < Math.abs(best.delta))) best = { delta: dd, at: t };
    }
    return best;
  };

  const finishPen = (closed: boolean) => {
    const pts = S().pen;
    S().set({ pen: null });
    if (!pts || pts.length < 2) return;
    const shape: any = { id: uid('s'), type: 'polygon', name: closed ? 'Polygon' : 'Path', x: 0, y: 0, w: 1, h: 1, points: [], closed, fill: closed ? 'accent-light' : 'none', stroke: closed ? undefined : '#ffffff', strokeWidth: 1.2 };
    setPolyAbs(shape, pts);
    S().change((d) => { d.shapes.push(shape); });
    S().set({ selection: [shape.id], tool: 'select' });
  };
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (!S().pen) return;
      if (ev.key === 'Enter') { ev.stopPropagation(); finishPen(false); }
      if (ev.key === 'Escape') { ev.stopPropagation(); S().set({ pen: null }); }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, []);

  const onPointerDown = (ev: React.PointerEvent) => {
    const svg = svgRef.current!;
    const t = ev.target as Element;
    const w = toWorld(ev.clientX, ev.clientY);
    const st = S();
    if (ev.button === 1 || (ev.button === 0 && (tool === 'hand' || space))) {
      svg.setPointerCapture(ev.pointerId);
      setDrag({ kind: 'pan', sx: ev.clientX, sy: ev.clientY, v: vp });
      return;
    }
    if (ev.button !== 0) return;
    svg.setPointerCapture(ev.pointerId);
    const p = { x: sn(w.x), y: sn(w.y) };

    if (tool === 'pen') {
      const pts = st.pen ?? [];
      if (pts.length > 2 && Math.hypot(pts[0].x - p.x, pts[0].y - p.y) * vp.zoom < 8) return finishPen(true);
      st.set({ pen: [...pts, p] });
      return;
    }
    if (tool === 'port') {
      const pd: PortDef = { id: uid('p'), name: nextPortName(st.def.ports, 'P' + (st.def.ports.length + 1)), x: p.x, y: p.y, media: 'ethernet', side: 'auto', maxLinks: 1 };
      // snap to artboard edge when close
      const thr = 3;
      if (Math.abs(pd.x) < thr) pd.x = 0; if (Math.abs(pd.x - st.def.w) < thr) pd.x = st.def.w;
      if (Math.abs(pd.y) < thr) pd.y = 0; if (Math.abs(pd.y - st.def.h) < thr) pd.y = st.def.h;
      st.change((d) => { d.ports.push(pd); });
      st.set({ selection: [pd.id] });
      return;
    }
    if (tool === 'text') {
      const s: any = { id: uid('s'), type: 'text', name: 'Text', text: 'TXT', x: p.x - 10, y: p.y - 5, w: 20, h: 10, fontSize: 8, fill: '#ffffff', fontWeight: 700, align: 'middle' };
      st.change((d) => { d.shapes.push(s); });
      st.set({ selection: [s.id], tool: 'select' });
      return;
    }
    if (tool !== 'select') { setDrag({ kind: 'create', tool, start: p, cur: p }); return; }

    const vEl = t.closest('[data-vertex]');
    if (vEl) {
      const idx = +vEl.getAttribute('data-vertex')!;
      if (ev.altKey) {
        st.change((df) => {
          const s = df.shapes.find((x) => x.id === st.editPoints);
          if (s?.type !== 'polygon' || s.points.length <= 2) return;
          const pts = polyAbs(s as any); pts.splice(idx, 1); setPolyAbs(s as any, pts);
        });
        return;
      }
      st.begin(); setDrag({ kind: 'vertex', id: st.editPoints!, index: idx }); return;
    }
    const rEl = t.closest('[data-rot]');
    if (rEl) {
      const s = st.def.shapes.find((x) => x.id === rEl.getAttribute('data-rot'));
      if (s) { st.begin(); setDrag({ kind: 'rotate', id: s.id, cx: s.x + s.w / 2, cy: s.y + s.h / 2 }); }
      return;
    }
    const hEl = t.closest('[data-handle]');
    if (hEl) {
      const s = st.def.shapes.find((x) => x.id === st.selection[0]);
      if (s) { st.begin(); setDrag({ kind: 'resize', id: s.id, handle: hEl.getAttribute('data-handle') as Handle, orig: shapeRect(s) }); }
      return;
    }
    const id = t.closest('[data-pid]')?.getAttribute('data-pid') ?? t.closest('[data-sid]')?.getAttribute('data-sid');
    if (id) {
      if (st.editPoints && st.editPoints !== id) st.set({ editPoints: null });
      let sel = st.selection;
      if (ev.shiftKey) { st.select([id], 'toggle'); sel = S().selection; if (!sel.includes(id)) return; }
      else if (!sel.includes(id)) { st.select([id]); sel = [id]; }
      const orig: Record<string, Pt> = {};
      for (const sid of sel) {
        const s = st.def.shapes.find((x) => x.id === sid);
        if (s && !s.locked) orig[sid] = { x: s.x, y: s.y };
        const pp = st.def.ports.find((x) => x.id === sid);
        if (pp) orig[sid] = { x: pp.x, y: pp.y };
      }
      const selShapes = st.def.shapes.filter((x) => orig[x.id]);
      const startRect = selShapes.length ? unionRects(selShapes.map(shapeRect)) : null;
      setDrag({ kind: 'move', start: w, orig, moved: false, clicked: id, startRect, targets: snapTargets(new Set(Object.keys(orig))) });
      return;
    }
    st.set({ editPoints: null });
    if (!ev.shiftKey) st.select([]);
    setDrag({ kind: 'marquee', start: w, cur: w, base: ev.shiftKey ? st.selection : [] });
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const w = toWorld(ev.clientX, ev.clientY);
    setCursorPt(w);
    const d = dragRef.current;
    if (!d) return;
    const st = S();
    switch (d.kind) {
      case 'pan':
        st.set({ vp: { ...d.v, x: d.v.x + ev.clientX - d.sx, y: d.v.y + ev.clientY - d.sy } });
        break;
      case 'marquee':
      case 'create':
        setDrag({ ...d, cur: d.kind === 'create' ? { x: sn(w.x), y: sn(w.y) } : w });
        break;
      case 'move': {
        let dx = w.x - d.start.x, dy = w.y - d.start.y;
        if (!d.moved && Math.hypot(dx, dy) * vp.zoom < 3) return;
        if (!d.moved) { st.begin(); setDrag({ ...d, moved: true }); }
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        const gx: number[] = [], gy: number[] = [];
        let snapped = false;
        if (d.startRect && !ev.altKey) {
          const r = d.startRect, thr = 5 / vp.zoom;
          const bx = nearest([r.x + dx, r.x + r.w / 2 + dx, r.x + r.w + dx], d.targets.xs, thr);
          const by = nearest([r.y + dy, r.y + r.h / 2 + dy, r.y + r.h + dy], d.targets.ys, thr);
          if (bx) { dx += bx.delta; gx.push(bx.at); snapped = true; }
          if (by) { dy += by.delta; gy.push(by.at); snapped = true; }
        }
        setGuides({ x: gx, y: gy });
        const snapV = (v: number) => (snapped ? Math.round(v * 100) / 100 : sn(v));
        st.change((df) => {
          for (const [id, o] of Object.entries(d.orig)) {
            const s = df.shapes.find((x) => x.id === id);
            const tgt = s ?? df.ports.find((x) => x.id === id);
            if (!tgt) continue;
            tgt.x = snapV(o.x + dx); tgt.y = snapV(o.y + dy);
            if (!s) {
              // ports stick to the artboard edges
              const thr = 2.5;
              const pp = tgt as PortDef;
              if (Math.abs(pp.x) < thr) pp.x = 0; if (Math.abs(pp.x - df.w) < thr) pp.x = df.w;
              if (Math.abs(pp.y) < thr) pp.y = 0; if (Math.abs(pp.y - df.h) < thr) pp.y = df.h;
            }
          }
        }, false);
        break;
      }
      case 'resize': {
        const o = d.orig;
        let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
        let px = sn(w.x), py = sn(w.y);
        const tg = snapTargets(new Set([d.id])), thr = 5 / vp.zoom;
        const sx = ev.altKey ? null : nearest([w.x], tg.xs, thr), sy = ev.altKey ? null : nearest([w.y], tg.ys, thr);
        if (sx && (d.handle.includes('w') || d.handle.includes('e'))) px = sx.at;
        if (sy && (d.handle.includes('n') || d.handle.includes('s'))) py = sy.at;
        setGuides({ x: sx && (d.handle.includes('w') || d.handle.includes('e')) ? [sx.at] : [], y: sy && (d.handle.includes('n') || d.handle.includes('s')) ? [sy.at] : [] });
        if (d.handle.includes('w')) x1 = px; if (d.handle.includes('e')) x2 = px;
        if (d.handle.includes('n')) y1 = py; if (d.handle.includes('s')) y2 = py;
        if (ev.shiftKey && o.w && o.h) {
          const ratio = o.w / o.h;
          const nw = x2 - x1, nh = y2 - y1;
          if (Math.abs(nw / ratio) > Math.abs(nh)) { const h2 = nw / ratio; if (d.handle.includes('n')) y1 = y2 - h2; else y2 = y1 + h2; }
          else { const w2 = nh * ratio; if (d.handle.includes('w')) x1 = x2 - w2; else x2 = x1 + w2; }
        }
        st.change((df) => {
          const s = df.shapes.find((x) => x.id === d.id);
          if (!s) return;
          s.x = Math.min(x1, x2); s.y = Math.min(y1, y2); s.w = Math.max(0.5, Math.abs(x2 - x1)); s.h = Math.max(0.5, Math.abs(y2 - y1));
        }, false);
        break;
      }
      case 'rotate': {
        let a = (Math.atan2(w.y - d.cy, w.x - d.cx) * 180) / Math.PI + 90;
        if (ev.shiftKey) a = Math.round(a / 15) * 15;
        a = Math.round(((a % 360) + 540) % 360 - 180);
        st.change((df) => { const s = df.shapes.find((x) => x.id === d.id); if (s) s.rotation = a || undefined; }, false);
        break;
      }
      case 'vertex': {
        st.change((df) => {
          const s = df.shapes.find((x) => x.id === d.id);
          if (s?.type !== 'polygon') return;
          const pts = polyAbs(s as any);
          pts[d.index] = { x: sn(w.x), y: sn(w.y) };
          setPolyAbs(s as any, pts);
        }, false);
        break;
      }
    }
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    const d = dragRef.current;
    svgRef.current?.releasePointerCapture?.(ev.pointerId);
    setGuides({ x: [], y: [] });
    if (!d) return;
    setDrag(null);
    const st = S();
    switch (d.kind) {
      case 'rotate':
        st.end();
        break;
      case 'move':
        if (d.moved) st.end(); else if (!ev.shiftKey && st.selection.length > 1) st.select([d.clicked]);
        break;
      case 'resize':
      case 'vertex':
        st.end();
        break;
      case 'marquee': {
        const r = normRect(d.start, d.cur);
        if (r.w * vp.zoom < 3 && r.h * vp.zoom < 3) break;
        const hits = [
          ...st.def.shapes.filter((s) => !s.hidden && !s.locked && rectsIntersect(r, shapeRect(s))).map((s) => s.id),
          ...st.def.ports.filter((p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h).map((p) => p.id),
        ];
        st.set({ selection: Array.from(new Set([...d.base, ...hits])) });
        break;
      }
      case 'create': {
        let r = normRect(d.start, d.cur);
        const tiny = r.w < 1 && r.h < 1;
        if (tiny && d.tool !== 'line') r = { x: r.x - 8, y: r.y - 8, w: 16, h: 16 };
        let s: any;
        const base = { id: uid('s'), x: r.x, y: r.y, w: Math.max(r.w, 0.5), h: Math.max(r.h, 0.5) };
        if (d.tool === 'rect') s = { ...base, type: 'rect', name: 'Rectangle', fill: 'accent', radius: 0 };
        if (d.tool === 'ellipse') s = { ...base, type: 'ellipse', name: 'Ellipse', fill: 'accent' };
        if (d.tool === 'isoBox') s = { ...base, type: 'isoBox', name: 'Iso box', fill: 'accent', top: 0.35, skew: 0.5 };
        if (d.tool === 'isoCylinder') s = { ...base, type: 'isoCylinder', name: 'Iso cylinder', fill: 'accent', top: 0.4 };
        if (d.tool === 'line') {
          if (tiny) break;
          s = { id: uid('s'), type: 'polygon', name: 'Line', x: 0, y: 0, w: 1, h: 1, points: [], closed: false, fill: 'none', stroke: '#ffffff', strokeWidth: 1.2 };
          setPolyAbs(s, [d.start, d.cur]);
        }
        if (s) {
          st.change((df) => { df.shapes.push(s); });
          st.set({ selection: [s.id], tool: 'select' });
        }
        break;
      }
    }
  };

  const onDoubleClick = (ev: React.MouseEvent) => {
    if (tool === 'pen') { finishPen(false); return; }
    const segEl = (ev.target as Element).closest('[data-seg]');
    if (segEl && editPoints) {
      const idx = +segEl.getAttribute('data-seg')!;
      const w = toWorld(ev.clientX, ev.clientY);
      S().change((df) => {
        const s = df.shapes.find((x) => x.id === editPoints);
        if (s?.type !== 'polygon') return;
        const pts = polyAbs(s as any); pts.splice(idx + 1, 0, { x: sn(w.x), y: sn(w.y) }); setPolyAbs(s as any, pts);
      });
      return;
    }
    const id = (ev.target as Element).closest('[data-sid]')?.getAttribute('data-sid');
    const s = id ? def.shapes.find((x) => x.id === id) : undefined;
    if (s?.type === 'polygon') S().set({ editPoints: s.id, selection: [s.id] });
  };

  const z = vp.zoom, inv = 1 / z;
  const view = { x: -vp.x / z, y: -vp.y / z, w: size.w / z, h: size.h / z };
  let step = 1;
  while (step * z < 8) step *= 2;
  const sel = new Set(selection);
  const selShapes = def.shapes.filter((s) => sel.has(s.id));
  const single = selShapes.length === 1 && !def.ports.some((p) => sel.has(p.id)) ? selShapes[0] : null;
  const editShape = editPoints ? def.shapes.find((s) => s.id === editPoints) : undefined;

  let cursor = 'default';
  if (tool === 'hand' || space) cursor = drag?.kind === 'pan' ? 'grabbing' : 'grab';
  else if (tool !== 'select') cursor = 'crosshair';
  if (drag?.kind === 'resize') cursor = CURSOR[drag.handle];

  return (
    <div ref={wrapRef} className="canvas-wrap" style={{ background: theme.name === 'dark' ? '#1d1e20' : '#e9ebee' }}>
      <svg ref={svgRef} className="canvas-svg" width={size.w} height={size.h} style={{ cursor }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={onDoubleClick}
        onContextMenu={(ev) => ev.preventDefault()}>
        <defs>
          <pattern id="egrid" width={step} height={step} patternUnits="userSpaceOnUse">
            <path d={`M${step} 0H0V${step}`} fill="none" stroke={theme.name === 'dark' ? '#ffffff' : '#000000'} strokeOpacity={0.07} strokeWidth={inv} />
          </pattern>
        </defs>
        <g transform={`translate(${vp.x} ${vp.y}) scale(${z})`}>
          {/* artboard */}
          <rect x={0} y={0} width={def.w} height={def.h} fill={theme.bg} />
          {z >= 4 && <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#egrid)" pointerEvents="none" />}
          <rect x={0} y={0} width={def.w} height={def.h} fill="none" stroke={theme.selection} strokeOpacity={0.5} strokeWidth={inv} strokeDasharray={`${4 * inv} ${3 * inv}`} pointerEvents="none" />
          <text x={0} y={-6 * inv} fontSize={11 * inv} fill="#8a8f98" fontFamily={FONT}>{def.name} · {def.w}×{def.h}</text>

          {def.shapes.map((s) => (
            <ShapeView key={s.id} shape={s} accent={def.accent} showGuides
              hitProps={{ 'data-sid': s.id, style: s.locked ? { pointerEvents: 'none' } : { cursor: tool === 'select' ? 'move' : undefined } } as any} />
          ))}

          {/* selection outlines */}
          <g pointerEvents="none">
            {selShapes.map((s) => (
              <rect key={s.id} x={s.x} y={s.y} width={s.w} height={s.h} fill="none" stroke={theme.selection} strokeWidth={1.2 * inv}
                transform={s.rotation ? `rotate(${s.rotation} ${s.x + s.w / 2} ${s.y + s.h / 2})` : undefined} />
            ))}
            {selShapes.length > 1 && (() => { const b = unionRects(selShapes.map(shapeRect))!; return <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={theme.selection} strokeWidth={inv} strokeDasharray={`${3 * inv} ${3 * inv}`} />; })()}
          </g>
          {single && !single.locked && !editShape && HANDLES.map((h) => {
            const r = shapeRect(single);
            const pos: Record<Handle, Pt> = { nw: { x: r.x, y: r.y }, n: { x: r.x + r.w / 2, y: r.y }, ne: { x: r.x + r.w, y: r.y }, e: { x: r.x + r.w, y: r.y + r.h / 2 }, se: { x: r.x + r.w, y: r.y + r.h }, s: { x: r.x + r.w / 2, y: r.y + r.h }, sw: { x: r.x, y: r.y + r.h }, w: { x: r.x, y: r.y + r.h / 2 } };
            const hs = 8 * inv;
            return <rect key={h} data-handle={h} x={pos[h].x - hs / 2} y={pos[h].y - hs / 2} width={hs} height={hs} rx={1.5 * inv} fill="#fff" stroke={theme.selection} strokeWidth={1.2 * inv} style={{ cursor: CURSOR[h] }} />;
          })}
          {editShape?.type === 'polygon' && (
            <g>
              <polyline points={polyAbs(editShape).map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={theme.selection} strokeWidth={inv} pointerEvents="none" />
              {(() => {
                const pts = polyAbs(editShape);
                const segs = pts.map((p, i) => [p, pts[(i + 1) % pts.length]] as const).slice(0, editShape.closed ? pts.length : pts.length - 1);
                return segs.map(([a, b], i) => <line key={'s' + i} data-seg={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={8 * inv} style={{ cursor: 'copy' }} />);
              })()}
              {polyAbs(editShape).map((p, i) => (
                <circle key={i} data-vertex={i} cx={p.x} cy={p.y} r={4.5 * inv} fill="#fff" stroke={theme.selection} strokeWidth={1.4 * inv} style={{ cursor: 'move' }} />
              ))}
            </g>
          )}

          {/* ports */}
          {def.ports.map((p) => {
            const c = MEDIA_COLORS[p.media] ?? '#9aa3b2';
            const side = autoSide(p, def);
            const dir = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[side];
            const r = clamp(5 * inv, 0.6, 6);
            const isSel = sel.has(p.id);
            return (
              <g key={p.id} data-pid={p.id} style={{ cursor: 'move' }}>
                <line x1={p.x} y1={p.y} x2={p.x + dir[0] * 14 * inv} y2={p.y + dir[1] * 14 * inv} stroke={c} strokeWidth={1.5 * inv} pointerEvents="none" />
                <circle cx={p.x} cy={p.y} r={r * 1.8} fill="transparent" />
                <circle cx={p.x} cy={p.y} r={r} fill={isSel ? c : theme.portFill} stroke={isSel ? '#fff' : c} strokeWidth={1.8 * inv} />
                <text x={p.x + dir[0] * 20 * inv} y={p.y + dir[1] * 20 * inv + (dir[1] === 0 ? 0 : dir[1] * 2 * inv)} fontSize={10 * inv} fontFamily={FONT} fontWeight={700}
                  fill={c} textAnchor={dir[0] > 0 ? 'start' : dir[0] < 0 ? 'end' : 'middle'} dominantBaseline="central" pointerEvents="none">{p.name}</text>
              </g>
            );
          })}

          {single && !single.locked && !editShape && (() => {
            const cx = single.x + single.w / 2, cy = single.y + single.h / 2;
            const hy = single.y - 18 * inv;
            const t = single.rotation ? `rotate(${single.rotation} ${cx} ${cy})` : undefined;
            return (
              <g transform={t}>
                <line x1={cx} y1={single.y} x2={cx} y2={hy} stroke={theme.selection} strokeWidth={inv} pointerEvents="none" />
                <circle data-rot={single.id} cx={cx} cy={hy} r={4.5 * inv} fill="#fff" stroke={theme.selection} strokeWidth={1.3 * inv} style={{ cursor: 'grab' }} />
              </g>
            );
          })()}
          <g pointerEvents="none" stroke="#ff3d71" strokeWidth={inv}>
            {guides.x.map((x, i) => <line key={'gx' + i} x1={x} x2={x} y1={view.y} y2={view.y + view.h} />)}
            {guides.y.map((y, i) => <line key={'gy' + i} y1={y} y2={y} x1={view.x} x2={view.x + view.w} />)}
          </g>
          {/* pen preview */}
          {pen && (
            <g pointerEvents="none">
              <polyline points={[...pen, ...(cursorPt ? [{ x: sn(cursorPt.x), y: sn(cursorPt.y) }] : [])].map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={theme.selection} strokeWidth={1.5 * inv} />
              {pen.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.5 * inv} fill={i === 0 ? theme.selection : '#fff'} stroke={theme.selection} strokeWidth={inv} />)}
            </g>
          )}
          {drag?.kind === 'marquee' && (() => { const r = normRect(drag.start, drag.cur); return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={theme.selection} fillOpacity={0.08} stroke={theme.selection} strokeWidth={inv} pointerEvents="none" />; })()}
          {drag?.kind === 'create' && (() => {
            const r = normRect(drag.start, drag.cur);
            return drag.tool === 'line'
              ? <line x1={drag.start.x} y1={drag.start.y} x2={drag.cur.x} y2={drag.cur.y} stroke={theme.selection} strokeWidth={1.5 * inv} pointerEvents="none" />
              : drag.tool === 'ellipse'
                ? <ellipse cx={r.x + r.w / 2} cy={r.y + r.h / 2} rx={r.w / 2} ry={r.h / 2} fill="none" stroke={theme.selection} strokeWidth={1.5 * inv} pointerEvents="none" />
                : <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={theme.selection} strokeWidth={1.5 * inv} pointerEvents="none" />;
          })()}
        </g>
      </svg>
      <div className="zoom-indicator">
        {Math.round(z * 100)}%{cursorPt ? ` · x ${cursorPt.x.toFixed(1)}  y ${cursorPt.y.toFixed(1)}` : ''}
        {tool === 'pen' && ' · click to add points, click first point to close, Enter to finish'}
        {editShape && ' · drag points · double-click a segment to add · Alt+click a point to remove · Esc to finish'}
      </div>
    </div>
  );
}
