import type {
  DeviceDef, DeviceNode, DiagramNode, Endpoint, Link, LinkMedia, Page, PortDef, PortMedia, Side, Vlan,
} from './types';
import type { Pt, Rect } from './util';

export type DefMap = Record<string, DeviceDef>;

const DIRS: Record<Exclude<Side, 'auto'>, Pt> = {
  top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

export function autoSide(port: Pick<PortDef, 'x' | 'y' | 'side'>, def: Pick<DeviceDef, 'w' | 'h'>): Exclude<Side, 'auto'> {
  if (port.side !== 'auto') return port.side;
  const dx = port.x / def.w - 0.5;
  const dy = port.y / def.h - 0.5;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}

export function portWorld(node: DeviceNode, def: DeviceDef, port: PortDef): Pt & { dir: Pt; side: Exclude<Side, 'auto'> } {
  const sx = node.w / def.w, sy = node.h / def.h;
  const px = node.flipX ? def.w - port.x : port.x;
  let side = autoSide(port, def);
  if (node.flipX && (side === 'left' || side === 'right')) side = side === 'left' ? 'right' : 'left';
  return { x: node.x + px * sx, y: node.y + port.y * sy, dir: DIRS[side], side };
}

export function mediaGroup(m: PortMedia): string {
  if (m === 'sfp') return 'fiber';
  if (m === 'profinet') return 'ethernet';
  if (m === 'console') return 'serial';
  return m;
}

export function mediaCompatible(a: PortMedia, b: PortMedia) {
  if (a === 'any' || b === 'any') return true;
  return mediaGroup(a) === mediaGroup(b);
}

export function linkMediaFor(a?: PortMedia, b?: PortMedia): LinkMedia {
  const m = a && a !== 'any' ? a : b && b !== 'any' ? b : 'ethernet';
  switch (m) {
    case 'wireless': return 'wireless';
    case 'fiber': case 'sfp': return 'fiber';
    case 'serial': case 'console': return 'serial';
    case 'profinet': return 'profinet';
    case 'iolink': return 'iolink';
    default: return 'ethernet';
  }
}

export function portUsage(page: Page, nodeId: string, portId: string, exceptLink?: string) {
  let n = 0;
  for (const l of Object.values(page.links)) {
    if (l.id === exceptLink) continue;
    if (l.from.node === nodeId && l.from.port === portId) n++;
    if (l.to.node === nodeId && l.to.port === portId) n++;
  }
  return n;
}

export function portFree(page: Page, nodeId: string, port: PortDef, exceptLink?: string) {
  return port.maxLinks === 0 || portUsage(page, nodeId, port.id, exceptLink) < port.maxLinks;
}

/** Choose the best free, compatible port of `node` facing `toward`. */
export function pickPort(
  page: Page, node: DeviceNode, def: DeviceDef, toward: Pt, media?: PortMedia, exceptLink?: string,
): PortDef | undefined {
  let best: PortDef | undefined;
  let bestD = Infinity;
  for (const p of def.ports) {
    if (!portFree(page, node.id, p, exceptLink)) continue;
    if (media && !mediaCompatible(p.media, media)) continue;
    const w = portWorld(node, def, p);
    const d = Math.hypot(w.x - toward.x, w.y - toward.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/* ---------- blocks with computed size ---------- */

export const LEGEND = { cellW: 168, cellH: 34, pad: 16, title: 26, linkH: 22 };

export function legendItems(page: Page, defs: DefMap): DeviceDef[] {
  const seen = new Set<string>();
  const out: DeviceDef[] = [];
  for (const id of page.order) {
    const n = page.nodes[id];
    const d = n?.kind === 'device' ? defs[n.defId] : undefined;
    if (d && !seen.has(d.id)) {
      seen.add(d.id);
      out.push(d);
    }
  }
  return out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/** link media types worth a legend row: listed when a page uses more than one */
export function legendLinkItems(page: Page): LinkMedia[] {
  const set = new Set<LinkMedia>();
  for (const l of Object.values(page.links)) set.add(l.media);
  return set.size > 1 ? [...set].sort() : [];
}

export function legendSize(count: number, columns: number, linkCount = 0) {
  const cols = Math.max(1, Math.min(columns, Math.max(1, count, linkCount)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const linkRows = Math.ceil(linkCount / cols);
  return { w: LEGEND.pad * 2 + cols * LEGEND.cellW, h: LEGEND.pad * 2 + LEGEND.title + rows * LEGEND.cellH + (linkRows ? linkRows * LEGEND.linkH + 8 : 0), cols, rows, linkRows };
}

export const VTABLE = { pad: 16, title: 28, rowH: 24, gap: 5, colId: 40, colName: 104, colDesc: 300, colDot: 22, colGap: 6 };

export function vlanTableSize(vlans: Vlan[]) {
  const w = VTABLE.pad * 2 + VTABLE.colId + VTABLE.colName + VTABLE.colDesc + VTABLE.colDot + VTABLE.colGap * 3;
  const h = VTABLE.pad * 2 + VTABLE.title + Math.max(1, vlans.length) * (VTABLE.rowH + VTABLE.gap) - VTABLE.gap;
  return { w, h };
}

export function nodeRect(n: DiagramNode, page: Page, defs: DefMap, vlans: Vlan[]): Rect {
  if (n.kind === 'legend') {
    const s = legendSize(legendItems(page, defs).length, n.columns, legendLinkItems(page).length);
    return { x: n.x, y: n.y, w: s.w, h: s.h };
  }
  if (n.kind === 'vlanTable') {
    const s = vlanTableSize(vlans);
    return { x: n.x, y: n.y, w: s.w, h: s.h };
  }
  return { x: n.x, y: n.y, w: n.w, h: n.h };
}

/** Rect including the device label (for fit-to-screen / export bounds). */
export function nodeVisualRect(n: DiagramNode, page: Page, defs: DefMap, vlans: Vlan[]): Rect {
  const r = nodeRect(n, page, defs, vlans);
  if (n.kind === 'device' && n.labelPos !== 'none') {
    const lines = 1 + n.addresses.length + (n.subtitle ? 1 : 0);
    const lh = lines * 14 + 8;
    const lw = 150;
    if (n.labelPos === 'bottom') return { x: Math.min(r.x, r.x + r.w / 2 - lw / 2), y: r.y, w: Math.max(r.w, lw), h: r.h + lh };
    if (n.labelPos === 'top') return { x: Math.min(r.x, r.x + r.w / 2 - lw / 2), y: r.y - lh, w: Math.max(r.w, lw), h: r.h + lh };
    if (n.labelPos === 'right') return { x: r.x, y: r.y, w: r.w + lw, h: Math.max(r.h, lh) };
    if (n.labelPos === 'left') return { x: r.x - lw, y: r.y, w: r.w + lw, h: Math.max(r.h, lh) };
  }
  return r;
}

/* ---------- link routing ---------- */

export interface LinkGeom {
  d: string;
  pts: Pt[]; // polyline (for curved: start, c1, c2, end)
  /** polyline actually stroked (after arrow shortening); straight/orthogonal only */
  linePts?: Pt[];
  routing: Link['routing'];
  start: Pt;
  end: Pt;
  startDir: Pt;
  endDir: Pt;
  /** exit directions at each end (away from the device), used for orthogonal bend editing */
  exitStart: Pt;
  exitEnd: Pt;
  mid: Pt;
  midDir: Pt;
  arrowStart?: string;
  arrowEnd?: string;
  fromPort?: PortDef;
  toPort?: PortDef;
}

function clipToRect(c: Pt, toward: Pt, r: Rect, pad = 3): Pt & { dir: Pt } {
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return { ...c, dir: { x: 0, y: 1 } };
  const hw = r.w / 2 + pad, hh = r.h / 2 + pad;
  const tx = dx ? hw / Math.abs(dx) : Infinity;
  const ty = dy ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  const dir = tx < ty ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
  return { x: c.x + dx * t, y: c.y + dy * t, dir };
}

export function endpointPos(
  ep: Endpoint, other: Pt, page: Page, defs: DefMap, vlans: Vlan[],
): (Pt & { dir: Pt; port?: PortDef }) | null {
  const n = page.nodes[ep.node];
  if (!n) return null;
  if (n.kind === 'device') {
    const def = defs[n.defId];
    const port = def && ep.port ? def.ports.find((p) => p.id === ep.port) : undefined;
    if (def && port) {
      const w = portWorld(n, def, port);
      return { x: w.x, y: w.y, dir: w.dir, port };
    }
  }
  const r = nodeRect(n, page, defs, vlans);
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  return clipToRect(c, other, r);
}

export function nodeCenter(id: string, page: Page, defs: DefMap, vlans: Vlan[]): Pt | null {
  const n = page.nodes[id];
  if (!n) return null;
  const r = nodeRect(n, page, defs, vlans);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
  }
  // drop collinear middle points
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01)) out.splice(i, 1);
  }
  return out;
}

const ORTHO_GAP = 16;
/** px of bend-handle travel represented by bend 0..1 when both ends exit on the same side */
const SAME_SIDE_SPAN = 400;

/** Position of the movable middle segment of an orthogonal route (x when the ends exit horizontally, y otherwise). */
function orthoMidCoord(s1: Pt, ds: Pt, e1: Pt, de: Pt, bend: number): number {
  const horiz = ds.x !== 0;
  const a = horiz ? s1.x : s1.y, b = horiz ? e1.x : e1.y;
  const same = ds.x === de.x && ds.y === de.y;
  if (!same) return a + (b - a) * bend;
  // both ends leave on the same side: the segment sits past the outermost stub and the bend pushes it further out
  const sign = horiz ? ds.x : ds.y;
  const base = sign < 0 ? Math.min(a, b) : Math.max(a, b);
  return base + (bend - 0.5) * SAME_SIDE_SPAN;
}

/** Inverse of orthoMidCoord: the bend value that puts the middle segment through point p. */
export function orthoBendAt(s: Pt, ds: Pt, e: Pt, de: Pt, p: Pt): number {
  const s1 = { x: s.x + ds.x * ORTHO_GAP, y: s.y + ds.y * ORTHO_GAP };
  const e1 = { x: e.x + de.x * ORTHO_GAP, y: e.y + de.y * ORTHO_GAP };
  const sH = ds.x !== 0, eH = de.x !== 0;
  if (sH !== eH) return 0.5;
  const v = sH ? p.x : p.y;
  const a = sH ? s1.x : s1.y, b = sH ? e1.x : e1.y;
  const same = ds.x === de.x && ds.y === de.y;
  if (same) {
    const sign = sH ? ds.x : ds.y;
    const base = sign < 0 ? Math.min(a, b) : Math.max(a, b);
    return Math.max(-1, Math.min(2, 0.5 + (v - base) / SAME_SIDE_SPAN));
  }
  return b === a ? 0.5 : Math.max(-1, Math.min(2, (v - a) / (b - a)));
}

function orthoRoute(s: Pt, ds: Pt, e: Pt, de: Pt, bend = 0.5): Pt[] {
  const gap = ORTHO_GAP;
  const s1 = { x: s.x + ds.x * gap, y: s.y + ds.y * gap };
  const e1 = { x: e.x + de.x * gap, y: e.y + de.y * gap };
  const sH = ds.x !== 0, eH = de.x !== 0;
  let mid: Pt[];
  if (sH && eH) {
    const mx = orthoMidCoord(s1, ds, e1, de, bend);
    mid = [{ x: mx, y: s1.y }, { x: mx, y: e1.y }];
  } else if (!sH && !eH) {
    const my = orthoMidCoord(s1, ds, e1, de, bend);
    mid = [{ x: s1.x, y: my }, { x: e1.x, y: my }];
  } else if (sH && !eH) {
    mid = [{ x: e1.x, y: s1.y }];
  } else {
    mid = [{ x: s1.x, y: e1.y }];
  }
  return simplify([s, s1, ...mid, e1, e]);
}

function polyLength(pts: Pt[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

function pointAt(pts: Pt[], t: number): { p: Pt; dir: Pt } {
  const L = polyLength(pts) * t;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + seg >= L && seg > 0) {
      const k = (L - acc) / seg;
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, dir: { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg } };
    }
    acc += seg;
  }
  const a = pts[pts.length - 2] ?? pts[0], b = pts[pts.length - 1];
  const seg = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { p: b, dir: { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg } };
}

function arrowHead(tip: Pt, dir: Pt, width: number) {
  const len = 7 + width * 1.6;
  const hw = 3.6 + width * 0.9;
  const bx = tip.x - dir.x * len, by = tip.y - dir.y * len;
  const nx = -dir.y, ny = dir.x;
  return { d: `M${tip.x},${tip.y} L${bx + nx * hw},${by + ny * hw} L${bx - nx * hw},${by - ny * hw} Z`, len };
}

export interface GeomOpts { to?: Pt; from?: Pt; /** perpendicular offset for parallel links between the same two devices */ parallel?: number }

export function linkGeometry(link: Link, page: Page, defs: DefMap, vlans: Vlan[], override?: GeomOpts): LinkGeom | null {
  const cFrom = override?.from ?? nodeCenter(link.from.node, page, defs, vlans);
  const cTo = override?.to ?? nodeCenter(link.to.node, page, defs, vlans);
  if (!cFrom || !cTo) return null;
  const wps = link.routing === 'straight' && link.waypoints?.length ? link.waypoints : [];
  const towardTo = wps.length ? wps[0] : cTo;
  const A = override?.from ? { ...override.from, dir: { x: 0, y: 0 } } : endpointPos(link.from, towardTo, page, defs, vlans);
  const B = override?.to ? { ...override.to, dir: { x: 0, y: 0 } } : endpointPos(link.to, wps.length ? wps[wps.length - 1] : (A ?? cFrom), page, defs, vlans);
  if (!A || !B) return null;
  // second pass so floating "from" faces the actual "to" point
  const A2 = !override?.from && !A.port ? endpointPos(link.from, wps.length ? wps[0] : B, page, defs, vlans) ?? A : A;
  let s: Pt = { x: A2.x, y: A2.y };
  let e: Pt = { x: B.x, y: B.y };
  if (override?.parallel) {
    const L = Math.hypot(e.x - s.x, e.y - s.y) || 1;
    const nx = (-(e.y - s.y) / L) * override.parallel, ny = ((e.x - s.x) / L) * override.parallel;
    s = { x: s.x + nx, y: s.y + ny };
    e = { x: e.x + nx, y: e.y + ny };
  }
  const fallbackDir = (from: Pt, to: Pt) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    return Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
  };
  const ds = A2.dir.x || A2.dir.y ? A2.dir : fallbackDir(s, e);
  const de = B.dir.x || B.dir.y ? B.dir : fallbackDir(e, s);

  let pts: Pt[];
  let d: string;
  let startDir: Pt, endDir: Pt;
  const unit = (a: Pt, b: Pt) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; };

  if (link.routing === 'curved') {
    const dist = Math.hypot(e.x - s.x, e.y - s.y);
    const k = Math.max(30, dist * 0.4);
    const c1 = { x: s.x + ds.x * k, y: s.y + ds.y * k };
    const c2 = { x: e.x + de.x * k, y: e.y + de.y * k };
    pts = [s, c1, c2, e];
    startDir = unit(s, c1);
    endDir = unit(c2, e);
  } else if (link.routing === 'orthogonal') {
    pts = orthoRoute(s, ds, e, de, link.bend ?? 0.5);
    startDir = unit(pts[0], pts[1]);
    endDir = unit(pts[pts.length - 2], pts[pts.length - 1]);
  } else if (wps.length) {
    pts = [s, ...wps.map((p) => ({ x: p.x, y: p.y })), e];
    startDir = unit(pts[0], pts[1]);
    endDir = unit(pts[pts.length - 2], pts[pts.length - 1]);
  } else {
    pts = [s, e];
    startDir = endDir = unit(s, e);
  }

  // shorten for arrows
  let arrowStart: string | undefined, arrowEnd: string | undefined;
  const P = pts.map((p) => ({ ...p }));
  if (link.arrowEnd) {
    const a = arrowHead(e, endDir, link.width);
    arrowEnd = a.d;
    P[P.length - 1] = { x: e.x - endDir.x * a.len * 0.8, y: e.y - endDir.y * a.len * 0.8 };
  }
  if (link.arrowStart) {
    const a = arrowHead(s, { x: -startDir.x, y: -startDir.y }, link.width);
    arrowStart = a.d;
    P[0] = { x: s.x + startDir.x * a.len * 0.8, y: s.y + startDir.y * a.len * 0.8 };
  }

  if (link.routing === 'curved') {
    d = `M${P[0].x},${P[0].y} C${P[1].x},${P[1].y} ${P[2].x},${P[2].y} ${P[3].x},${P[3].y}`;
  } else if (link.routing === 'orthogonal') {
    d = roundedPolyline(P, 6);
  } else {
    d = `M${P.map((p) => `${p.x},${p.y}`).join(' L')}`;
  }

  let mid: Pt, midDir: Pt;
  if (link.routing === 'curved') {
    const t = 0.5;
    const [p0, p1, p2, p3] = pts;
    const mt = 1 - t;
    mid = {
      x: mt ** 3 * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t ** 3 * p3.x,
      y: mt ** 3 * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t ** 3 * p3.y,
    };
    midDir = unit(p1, p2);
  } else {
    const r = pointAt(pts, 0.5);
    mid = r.p;
    midDir = r.dir;
  }
  return { d, pts, linePts: link.routing === 'curved' ? undefined : P, routing: link.routing, start: s, end: e, startDir, endDir, exitStart: ds, exitEnd: de, mid, midDir, arrowStart, arrowEnd, fromPort: A.port, toPort: B.port };
}

function roundedPolyline(pts: Pt[], r: number): string {
  if (pts.length < 3) return `M${pts.map((p) => `${p.x},${p.y}`).join(' L')}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1 = { x: b.x - ((b.x - a.x) / (l1 || 1)) * rr, y: b.y - ((b.y - a.y) / (l1 || 1)) * rr };
    const p2 = { x: b.x + ((c.x - b.x) / (l2 || 1)) * rr, y: b.y + ((c.y - b.y) / (l2 || 1)) * rr };
    d += ` L${p1.x},${p1.y} Q${b.x},${b.y} ${p2.x},${p2.y}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last.x},${last.y}`;
}

/* ---------- line jumps ---------- */

function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const r = { x: b.x - a.x, y: b.y - a.y }, q = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * q.y - r.y * q.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * q.y - (c.y - a.y) * q.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  const eps = 0.02;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return t;
}

/**
 * Path for a polyline with rounded corners and "jump" arcs where it crosses
 * the segments in `others` (which should be the polylines of links drawn earlier).
 */
export function pathWithJumps(pts: Pt[], others: Pt[][], radius = 4, corner = 6): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    // corner trimming (same rule as roundedPolyline)
    const prev = pts[i - 1], next = pts[i + 2];
    const l1 = prev ? Math.hypot(a.x - prev.x, a.y - prev.y) : 0;
    const r0 = prev ? Math.min(corner, l1 / 2, L / 2) : 0;
    const l2 = next ? Math.hypot(next.x - b.x, next.y - b.y) : 0;
    const r1 = next ? Math.min(corner, l2 / 2, L / 2) : 0;
    const segStart = { x: a.x + ux * r0, y: a.y + uy * r0 };
    const segEnd = { x: b.x - ux * r1, y: b.y - uy * r1 };
    // crossings along this segment
    const ts: number[] = [];
    for (const o of others) for (let j = 0; j < o.length - 1; j++) {
      const t = segIntersect(a, b, o[j], o[j + 1]);
      if (t !== null) ts.push(t * L);
    }
    ts.sort((x, y) => x - y);
    if (prev) d += ` Q${a.x},${a.y} ${segStart.x},${segStart.y}`;
    else d += ` M${segStart.x},${segStart.y}`;
    let cur = r0;
    const minGap = radius * 2.2;
    for (const t of ts) {
      if (t - radius <= cur + 0.5 || t + radius >= L - r1 - 0.5) continue;
      if (t - cur < minGap && cur !== r0) continue; // too close to the previous jump
      const p1 = { x: a.x + ux * (t - radius), y: a.y + uy * (t - radius) };
      const p2 = { x: a.x + ux * (t + radius), y: a.y + uy * (t + radius) };
      const sweep = ux >= 0 ? 1 : 0;
      d += ` L${p1.x},${p1.y} A${radius},${radius} 0 0 ${sweep} ${p2.x},${p2.y}`;
      cur = t + radius;
    }
    d += ` L${segEnd.x},${segEnd.y}`;
  }
  return d;
}
