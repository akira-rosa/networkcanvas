import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { DeviceDef, PortDef, Shape, Viewport } from '../model/types';
import { deepClone, uid, type Pt } from '../model/util';

export type ETool = 'select' | 'hand' | 'rect' | 'ellipse' | 'line' | 'pen' | 'text' | 'isoBox' | 'isoCylinder' | 'port';

interface EState {
  def: DeviceDef;
  selection: string[];
  past: DeviceDef[];
  future: DeviceDef[];
  gestureBase: DeviceDef | null;
  tool: ETool;
  vp: Viewport;
  pen: Pt[] | null;
  editPoints: string | null;
  snap: boolean;
  showPreview: boolean;
  clipboard: { shapes: Shape[]; ports: PortDef[] } | null;

  reset: (def: DeviceDef) => void;
  change: (fn: (d: Draft<DeviceDef>) => void, history?: boolean) => void;
  begin: () => void;
  end: () => void;
  undo: () => void;
  redo: () => void;
  set: (p: Partial<EState>) => void;
  select: (ids: string[], mode?: 'replace' | 'toggle' | 'add') => void;
  deleteSelection: () => void;
  copy: () => void;
  paste: () => void;
  duplicate: () => void;
  zOrder: (dir: 'front' | 'back' | 'forward' | 'backward') => void;
}

export const useEditor = create<EState>((set, get) => ({
  def: { id: '', name: '', category: '', w: 48, h: 48, accent: '#1a8fd8', shapes: [], ports: [], fields: [] },
  selection: [],
  past: [],
  future: [],
  gestureBase: null,
  tool: 'select',
  vp: { x: 0, y: 0, zoom: 8 },
  pen: null,
  editPoints: null,
  snap: true,
  showPreview: true,
  clipboard: null,

  reset: (def) => set({ def: deepClone(def), selection: [], past: [], future: [], gestureBase: null, tool: 'select', pen: null, editPoints: null }),
  change: (fn, history = true) => {
    const { def, past, gestureBase } = get();
    const next = produce(def, fn);
    if (next === def) return;
    if (history && !gestureBase) set({ def: next, past: [...past.slice(-200), def], future: [] });
    else set({ def: next });
  },
  begin: () => set({ gestureBase: get().def }),
  end: () => {
    const { gestureBase, def, past } = get();
    if (gestureBase && gestureBase !== def) set({ past: [...past, gestureBase], future: [] });
    set({ gestureBase: null });
  },
  undo: () => {
    const { past, future, def } = get();
    if (!past.length) return;
    set({ def: past[past.length - 1], past: past.slice(0, -1), future: [def, ...future], editPoints: null });
  },
  redo: () => {
    const { past, future, def } = get();
    if (!future.length) return;
    set({ def: future[0], past: [...past, def], future: future.slice(1) });
  },
  set: (p) => set(p),
  select: (ids, mode = 'replace') => {
    const cur = get().selection;
    if (mode === 'replace') set({ selection: ids });
    else if (mode === 'add') set({ selection: Array.from(new Set([...cur, ...ids])) });
    else { const s = new Set(cur); ids.forEach((i) => (s.has(i) ? s.delete(i) : s.add(i))); set({ selection: [...s] }); }
  },
  deleteSelection: () => {
    const sel = new Set(get().selection);
    get().change((d) => {
      d.shapes = d.shapes.filter((s) => !sel.has(s.id) || s.locked);
      d.ports = d.ports.filter((p) => !sel.has(p.id));
    });
    set({ selection: [], editPoints: null });
  },
  copy: () => {
    const { def, selection } = get();
    const sel = new Set(selection);
    set({ clipboard: { shapes: def.shapes.filter((s) => sel.has(s.id)).map(deepClone), ports: def.ports.filter((p) => sel.has(p.id)).map(deepClone) } });
  },
  paste: () => {
    const cb = get().clipboard;
    if (!cb) return;
    const shapes = cb.shapes.map((s) => ({ ...deepClone(s), id: uid('s'), x: s.x + 2, y: s.y + 2 }));
    const ports = cb.ports.map((p) => ({ ...deepClone(p), id: uid('p'), x: p.x + 2, y: p.y + 2, name: nextPortName(get().def.ports, p.name) }));
    get().change((d) => { d.shapes.push(...(shapes as Shape[])); d.ports.push(...ports); });
    set({ selection: [...shapes.map((s) => s.id), ...ports.map((p) => p.id)], clipboard: { shapes: shapes.map(deepClone) as Shape[], ports: ports.map(deepClone) } });
  },
  duplicate: () => { const cb = get().clipboard; get().copy(); get().paste(); set({ clipboard: cb }); },
  zOrder: (dir) => {
    const sel = new Set(get().selection);
    get().change((d) => {
      const o = d.shapes;
      if (dir === 'front') d.shapes = [...o.filter((s) => !sel.has(s.id)), ...o.filter((s) => sel.has(s.id))];
      else if (dir === 'back') d.shapes = [...o.filter((s) => sel.has(s.id)), ...o.filter((s) => !sel.has(s.id))];
      else if (dir === 'forward') { for (let i = o.length - 2; i >= 0; i--) if (sel.has(o[i].id) && !sel.has(o[i + 1].id)) [o[i], o[i + 1]] = [o[i + 1], o[i]]; }
      else { for (let i = 1; i < o.length; i++) if (sel.has(o[i].id) && !sel.has(o[i - 1].id)) [o[i], o[i - 1]] = [o[i - 1], o[i]]; }
    });
  },
}));

export function nextPortName(ports: PortDef[], base = 'P1'): string {
  const names = new Set(ports.map((p) => p.name));
  if (!names.has(base)) return base;
  const m = base.match(/^(.*?)(\d+)$/);
  const prefix = m ? m[1] : base;
  let i = m ? parseInt(m[2]) : 1;
  while (names.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/** absolute points of a polygon shape */
export const polyAbs = (s: Extract<Shape, { type: 'polygon' }>): Pt[] => s.points.map(([px, py]) => ({ x: s.x + px * s.w, y: s.y + py * s.h }));

/** re-normalise absolute points into a polygon shape (updates its box) */
export function setPolyAbs(s: Draft<Extract<Shape, { type: 'polygon' }>>, pts: Pt[]) {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x || 0.001, h = Math.max(...ys) - y || 0.001;
  s.x = x; s.y = y; s.w = w; s.h = h;
  s.points = pts.map((p) => [(p.x - x) / w, (p.y - y) / h] as [number, number]);
}
