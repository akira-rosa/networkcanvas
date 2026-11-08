// Tiny builder API used to author the built-in device libraries as data.
// Coordinates are in the device's own units (its artboard is w × h).
import type { DeviceDef, FieldDef, Gradient, IconStyle, PortDef, PortMedia, Shape, Side } from '../model/types';

export const DEFAULT_ACCENT = '#1a8fd8';

/** Accent tokens follow the device (or instance) accent colour. */
export const A = 'accent', AL = 'accent-light', ALL = 'accent-lighter', AD = 'accent-dark', ADD = 'accent-darker';

let counter = 0;
const sid = () => `s${(++counter).toString(36)}`;

type O = Partial<Shape> & Record<string, unknown>;

export const rect = (x: number, y: number, w: number, h: number, fill: string, o: O = {}): Shape =>
  ({ id: sid(), type: 'rect', name: 'Rectangle', x, y, w, h, fill, ...o }) as Shape;

/** rectangle with per-corner radii [tl, tr, br, bl] */
export const rrect = (x: number, y: number, w: number, h: number, radii: [number, number, number, number], fill: string, o: O = {}): Shape =>
  ({ id: sid(), type: 'rect', name: 'Rectangle', x, y, w, h, fill, radii, ...o }) as Shape;

export const ell = (x: number, y: number, w: number, h: number, fill: string, o: O = {}): Shape =>
  ({ id: sid(), type: 'ellipse', name: 'Ellipse', x, y, w, h, fill, ...o }) as Shape;

/** circle by centre and radius */
export const circ = (cx: number, cy: number, r: number, fill: string, o: O = {}): Shape => ell(cx - r, cy - r, r * 2, r * 2, fill, o);

export const isoBox = (x: number, y: number, w: number, h: number, top: number, o: O = {}): Shape =>
  ({ id: sid(), type: 'isoBox', name: 'Iso box', x, y, w, h, top, fill: A, ...o }) as Shape;

export const isoCyl = (x: number, y: number, w: number, h: number, top: number, o: O = {}): Shape =>
  ({ id: sid(), type: 'isoCylinder', name: 'Iso cylinder', x, y, w, h, top, fill: A, ...o }) as Shape;

/** closed polygon from absolute points (normalised to its bounding box) */
export const poly = (abs: [number, number][], fill: string, o: O = {}, closed = true): Shape => {
  const xs = abs.map((p) => p[0]);
  const ys = abs.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x || 0.001, h = Math.max(...ys) - y || 0.001;
  return {
    id: sid(), type: 'polygon', name: closed ? 'Polygon' : 'Line', x, y, w, h, fill: closed ? fill : 'none',
    points: abs.map(([px, py]) => [(px - x) / w, (py - y) / h] as [number, number]), closed, ...o,
  } as Shape;
};

/** open polyline */
export const line = (abs: [number, number][], stroke: string, sw = 1, o: O = {}) => poly(abs, 'none', { stroke, strokeWidth: sw, ...o }, false);

/** SVG path data authored in a box of vw × vh, placed into x, y, w, h */
export const path = (d: string, x: number, y: number, w: number, h: number, o: O & { vb?: [number, number, number, number] } = {}): Shape =>
  ({ id: sid(), type: 'path', name: 'Path', d, vb: o.vb ?? [0, 0, 24, 24], x, y, w, h, fill: 'none', stroke: '#ffffff', strokeWidth: 2, ...o }) as Shape;

export const text = (t: string, x: number, y: number, w: number, h: number, fontSize: number, o: O = {}): Shape =>
  ({ id: sid(), type: 'text', name: 'Text', text: t, x, y, w, h, fontSize, fill: '#ffffff', fontWeight: 700, align: 'middle', ...o }) as Shape;

export const grad = (angle: number, from: string, to: string): Gradient => ({ angle, from, to });

/** repeat a shape factory n times with a step */
export function repeat(n: number, make: (i: number) => Shape | Shape[]): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < n; i++) { const r = make(i); Array.isArray(r) ? out.push(...r) : out.push(r); }
  return out;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'p';

/** Port. Its id is derived from its name so it stays stable when artwork changes. */
export const P = (name: string, x: number, y: number, media: PortMedia = 'ethernet', maxLinks = 1, side: Side = 'auto', description?: string): PortDef => ({
  id: 'p-' + slug(name), name, x, y, media, maxLinks, side, description,
});

export const NET_FIELDS: FieldDef[] = [
  { key: 'model', label: 'Model' },
  { key: 'serial', label: 'Serial number' },
  { key: 'mac', label: 'MAC address' },
  { key: 'firmware', label: 'Firmware' },
  { key: 'location', label: 'Location / rack' },
];
export const OT_FIELDS: FieldDef[] = [
  { key: 'model', label: 'Model / order no.' },
  { key: 'station', label: 'Station' },
  { key: 'profinet', label: 'PROFINET name' },
  { key: 'firmware', label: 'Firmware' },
];

export function def(
  style: IconStyle,
  d: Omit<DeviceDef, 'builtin' | 'accent' | 'fields' | 'style'> & { accent?: string; fields?: FieldDef[] },
): DeviceDef {
  return { accent: DEFAULT_ACCENT, fields: NET_FIELDS, builtin: true, version: 2, style, ...d };
}

const mixHex = (a: string, b: string) => {
  const p = (h: string) => { const m = h.replace('#', ''); const f = m.length === 3 ? m.split('').map((c) => c + c).join('') : m; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
  if (!/^#[0-9a-f]{3,6}$/i.test(a) || !/^#[0-9a-f]{3,6}$/i.test(b)) return a;
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round((v + y[i]) / 2).toString(16).padStart(2, '0')).join('');
};

/**
 * Detailed-style rule: solid blocks — square corners, no outlines, flat fills.
 * Lines (open polylines / unfilled strokes) are kept, since they are detail, not outline.
 */
export function solidify(d: DeviceDef): DeviceDef {
  const src = d.shapes.filter((s, i) => {
    const filled = !!s.gradient || (!!s.fill && s.fill !== 'none');
    // outline-only shapes (unfilled rectangles / ellipses / closed polygons) are outlines
    if (!filled && (s.type === 'rect' || s.type === 'ellipse' || (s.type === 'polygon' && s.closed))) return false;
    // a thin "rim" block directly behind a slightly smaller body is an outline in disguise
    const n = d.shapes[i + 1];
    if (s.type === 'rect' && n && n.type === 'rect') {
      const ins = [n.x - s.x, n.y - s.y, s.x + s.w - (n.x + n.w), s.y + s.h - (n.y + n.h)];
      if (ins.every((v) => v >= -0.01 && v <= 1.2) && ins.filter((v) => v > 0.05).length >= 2) return false;
    }
    return true;
  });
  return {
    ...d,
    shapes: src.map((s) => {
      const o: any = { ...s };
      if (o.type === 'rect') { delete o.radius; delete o.radii; }
      if (o.gradient) { o.fill = mixHex(o.gradient.from, o.gradient.to); delete o.gradient; }
      const isLine = (o.type === 'polygon' && !o.closed) || !o.fill || o.fill === 'none';
      if (!isLine) { delete o.stroke; delete o.strokeWidth; delete o.dash; }
      return o as Shape;
    }),
  };
}
