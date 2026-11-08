import type { DeviceDef, Shape } from '../model/types';
import {
  A, AL, ALL, AD, ADD, OT_FIELDS, P, circ, def, ell, isoBox, isoCyl, line, path, poly, rect, rrect,
} from './draw';

// Isometric "blue & white" set, modelled on the Smart4.0 schematic:
// blue faces (lighter top, darker side), navy outlines, white glyphs drawn
// in perspective on the faces.

export type Pt = [number, number];
export const W = '#ffffff';
export const NAVY = ADD;

/* ---------- face mapping helpers ---------- */

export interface Faces { top: (u: number, v: number) => Pt; left: (u: number, v: number) => Pt; right: (u: number, v: number) => Pt }

/** Mirrors isoBoxFaces(): returns mappers from unit (u,v) to each visible face. */
export function faces(x: number, y: number, w: number, h: number, top: number, skew = 0.5): Faces {
  const th = h * top, s = skew, d = h - th;
  const L: Pt = [x, y + (1 - s) * th], B: Pt = [x + (1 - s) * w, y], R: Pt = [x + w, y + s * th], F: Pt = [x + s * w, y + th];
  return {
    top: (u, v) => [L[0] + u * (B[0] - L[0]) + v * (F[0] - L[0]), L[1] + u * (B[1] - L[1]) + v * (F[1] - L[1])],
    left: (u, v) => [L[0] + u * (F[0] - L[0]), L[1] + u * (F[1] - L[1]) + v * d],
    right: (u, v) => [F[0] + u * (R[0] - F[0]), F[1] + u * (R[1] - F[1]) + v * d],
  };
}

export const on = (f: (u: number, v: number) => Pt, uv: Pt[]) => uv.map(([u, v]) => f(u, v));
export const fpoly = (f: (u: number, v: number) => Pt, uv: Pt[], fill: string, o: Record<string, unknown> = {}) => poly(on(f, uv), fill, o);
export const fline = (f: (u: number, v: number) => Pt, uv: Pt[], stroke: string, sw = 1, o: Record<string, unknown> = {}) => line(on(f, uv), stroke, sw, o);
/** parallelogram on a face */
export const frect = (f: (u: number, v: number) => Pt, u: number, v: number, du: number, dv: number, fill: string, o: Record<string, unknown> = {}) =>
  fpoly(f, [[u, v], [u + du, v], [u + du, v + dv], [u, v + dv]], fill, o);

/** arrow along u (dir 1 = +u, -1 = -u) centred on v, in face space */
export function arrowU(f: (u: number, v: number) => Pt, u0: number, u1: number, v: number, t: number, head: number, hw: number, fill = W) {
  const d = Math.sign(u1 - u0);
  const hb = u1 - d * head;
  return fpoly(f, [[u0, v - t], [hb, v - t], [hb, v - hw], [u1, v], [hb, v + hw], [hb, v + t], [u0, v + t]], fill);
}

/** arrow between two face points with given shaft thickness (face units) */
export function arrowUV(f: (u: number, v: number) => Pt, a: Pt, b: Pt, t: number, head: number, hw: number, fill = W) {
  const du = b[0] - a[0], dv = b[1] - a[1];
  const L = Math.hypot(du, dv) || 1;
  const ux = du / L, vy = dv / L, nx = -vy, ny = ux;
  const hb: Pt = [b[0] - ux * head, b[1] - vy * head];
  const pts: Pt[] = [
    [a[0] + nx * t, a[1] + ny * t], [hb[0] + nx * t, hb[1] + ny * t], [hb[0] + nx * hw, hb[1] + ny * hw], b,
    [hb[0] - nx * hw, hb[1] - ny * hw], [hb[0] - nx * t, hb[1] - ny * t], [a[0] - nx * t, a[1] - ny * t],
  ];
  return fpoly(f, pts, fill);
}


/** points on the outer silhouette of an iso box (where links should attach) */
export function sil(x: number, y: number, w: number, h: number, top: number, skew = 0.5) {
  const th = h * top, s = skew, d = h - th;
  const L: Pt = [x, y + (1 - s) * th], B: Pt = [x + (1 - s) * w, y], R: Pt = [x + w, y + s * th], F: Pt = [x + s * w, y + th];
  const lerp = (a: Pt, b: Pt, t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const dn = (p: Pt): Pt => [p[0], p[1] + d];
  return {
    top: (t = 0) => (t === 0 ? ([B[0], B[1]] as [number, number]) : t < 0 ? lerp(B, L, -t) : lerp(B, R, t)),
    left: (t: number) => lerp(L, dn(L), t),
    right: (t: number) => lerp(R, dn(R), t),
    bottomL: (t: number) => lerp(dn(L), dn(F), t),
    bottomR: (t: number) => lerp(dn(F), dn(R), t),
  };
}
export const at = (name: string, pt: [number, number], media: Parameters<typeof P>[3], side: Parameters<typeof P>[5], maxLinks = 1, desc?: string) =>
  P(name, Math.round(pt[0] * 10) / 10, Math.round(pt[1] * 10) / 10, media, maxLinks, side, desc);

/* ---------- glyphs ---------- */

export const I_WIFI = 'M3.5 10a12 12 0 0 1 17 0 M7 13.6a7 7 0 0 1 10 0 M10.4 17.1a2.2 2.2 0 0 1 3.2 0';
export const GEAR = (() => {
  const pts: string[] = [];
  const n = 8;
  for (let i = 0; i < n * 4; i++) {
    const a = (i / (n * 4)) * Math.PI * 2 - Math.PI / (n * 4) * 1.5;
    const r = i % 4 < 2 ? 10 : 7.4;
    pts.push(`${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z M15.2 12a3.2 3.2 0 1 0 -6.4 0 a3.2 3.2 0 1 0 6.4 0 Z`;
})();

/* ---------- reusable bodies ---------- */

/** flat switch slab with ports on its outline */
export function slab(prefix: string, glyph: 'switch' | 'l3') {
  const w = 64, h = 34, top = 0.66;
  const f = faces(0, 0, w, h, top);
  const shapes: Shape[] = [isoBox(0, 0, w, h, top, { name: 'Body' })];
  // port strip on the front-left face
  shapes.push(...[0, 1, 2, 3, 4, 5].map((i) => frect(f.left, 0.12 + i * 0.13, 0.32, 0.08, 0.38, NAVY, { opacity: 0.55, strokeWidth: 0 })));
  shapes.push(...[0, 1].map((i) => frect(f.right, 0.62 + i * 0.16, 0.32, 0.11, 0.38, NAVY, { opacity: 0.55 })));
  shapes.push(...[0, 1, 2].map((i) => fpoly(f.right, [[0.12 + i * 0.1, 0.45], [0.17 + i * 0.1, 0.45], [0.17 + i * 0.1, 0.62], [0.12 + i * 0.1, 0.62]], '#7CFC9A')));
  if (glyph === 'switch') {
    shapes.push(arrowU(f.top, 0.2, 0.8, 0.36, 0.045, 0.17, 0.12));
    shapes.push(arrowU(f.top, 0.8, 0.2, 0.64, 0.045, 0.17, 0.12));
  } else {
    shapes.push(arrowUV(f.top, [0.18, 0.28], [0.82, 0.72], 0.045, 0.17, 0.12));
    shapes.push(arrowUV(f.top, [0.18, 0.72], [0.82, 0.28], 0.045, 0.17, 0.12));
  }
  const yL = (x: number) => 22.8 + (11.2 * x) / 32; // bottom-left edge
  const yR = (x: number) => 34 - (11.2 * (x - 32)) / 32;
  const ports = [
    P(`${prefix}1`, 32, 0, 'ethernet', 1, 'top'),
    P(`${prefix}2`, 14, 5.6, 'ethernet', 1, 'top'),
    P(`${prefix}3`, 50, 5.6, 'ethernet', 1, 'top'),
    P(`${prefix}4`, 0, 17, 'ethernet', 1, 'left'),
    P(`${prefix}5`, 64, 17, 'ethernet', 1, 'right'),
    P(`${prefix}6`, 17, yL(17), 'ethernet', 1, 'bottom'),
    P(`${prefix}7`, 32, 34, 'ethernet', 1, 'bottom'),
    P(`${prefix}8`, 47, yR(47), 'ethernet', 1, 'bottom'),
    P('SFP1', 59, yR(59), 'sfp', 1, 'right'),
    P('SFP2', 5, yL(5), 'sfp', 1, 'left'),
  ];
  return { w, h, shapes, ports };
}

/** router-style cylinder; returns geometry helpers for the top and body */
export function cylinder(w = 60, h = 42, top = 0.46) {
  const th = h * top, rx = w / 2, ry = th / 2;
  const cx = rx, cyTop = ry, cyBot = h - ry;
  const topPt = (u: number, v: number): Pt => [cx + u * rx, cyTop + v * ry];
  const ports = [
    P('P1', cx, 0, 'ethernet', 1, 'top'),
    P('WAN', w, (cyTop + cyBot) / 2, 'ethernet', 1, 'right'),
    P('P2', 0, (cyTop + cyBot) / 2, 'ethernet', 1, 'left'),
    P('P3', cx, h, 'ethernet', 1, 'bottom'),
    P('P4', cx - rx * 0.66, cyBot + ry * 0.75, 'ethernet', 1, 'bottom'),
    P('P5', cx + rx * 0.66, cyBot + ry * 0.75, 'ethernet', 1, 'bottom'),
  ];
  return { w, h, th, rx, ry, cx, cyTop, cyBot, topPt, body: isoCyl(0, 0, w, h, top, { name: 'Body' }), ports };
}

/** bricks on the two side faces of a tower */
export function bricks(f: Faces, rows: number): Shape[] {
  const out: Shape[] = [];
  for (const [face, opacity] of [[f.left, 1], [f.right, 0.85]] as const) {
    for (let i = 1; i < rows; i++) out.push(fline(face, [[0, i / rows], [1, i / rows]], W, 0.8, { opacity }));
    for (let i = 0; i < rows; i++) {
      const offs = i % 2 ? [0.25, 0.75] : [0.5];
      for (const u of offs) out.push(fline(face, [[u, i / rows], [u, (i + 1) / rows]], W, 0.8, { opacity }));
    }
  }
  return out;
}


/* ---------- the set ---------- */

function build(): DeviceDef[] {
  const out: DeviceDef[] = [];
  const add = (d: Omit<DeviceDef, 'builtin' | 'accent' | 'fields' | 'style'> & { accent?: string; fields?: DeviceDef['fields'] }) => out.push(def('iso', d));

  // Switch & L3 switch
  { const s = slab('P', 'switch'); add({ id: 'switch', name: 'Switch', category: 'Network', prefix: 'sw', description: 'Layer 2 managed / unmanaged switch', ...s }); }
  { const s = slab('P0.', 'l3'); add({ id: 'switch-l3', name: 'Layer 3 Switch', category: 'Network', prefix: 'sw', description: 'Multilayer / core switch', ...s }); }

  // Routers
  {
    const c = cylinder();
    const T = c.topPt;
    const arr = (a: Pt, b: Pt) => {
      // arrow drawn in top-ellipse space
      const pa = T(a[0], a[1]), pb = T(b[0], b[1]);
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      const nx = -uy * 0.5, ny = ux * 0.5; // flattened normal
      const t = 1.1, hw = 3, hl = 3.6;
      const hb: Pt = [pb[0] - ux * hl, pb[1] - uy * hl];
      return poly([[pa[0] + nx * t, pa[1] + ny * t * 2], [hb[0] + nx * t, hb[1] + ny * t * 2], [hb[0] + nx * hw, hb[1] + ny * hw * 2], pb, [hb[0] - nx * hw, hb[1] - ny * hw * 2], [hb[0] - nx * t, hb[1] - ny * t * 2], [pa[0] - nx * t, pa[1] - ny * t * 2]], W);
    };
    add({
      id: 'router', name: 'Router', category: 'Network', prefix: 'rt', w: c.w, h: c.h,
      shapes: [c.body, arr([-0.15, 0], [-0.78, 0]), arr([0.15, 0], [0.78, 0]), arr([0, -0.95], [0, -0.22]), arr([0, 0.95], [0, 0.22])],
      ports: c.ports,
    });
    add({
      id: 'router-industrial', name: 'Industrial Router', category: 'Network', prefix: 'rt', w: c.w, h: c.h,
      shapes: [c.body, path(GEAR, c.cx - 6.5, c.cyTop + c.ry + 3.2, 13, 13, { fill: W, stroke: 'none', strokeWidth: 0 })],
      ports: c.ports,
    });
    add({
      id: 'router-wireless', name: 'Commercial / Wi-Fi Router', category: 'Network', prefix: 'rt', w: c.w, h: c.h,
      shapes: [c.body, path(I_WIFI, c.cx - 7.5, c.cyTop + c.ry + 2.6, 15, 15, { strokeWidth: 2.8 })],
      ports: [...c.ports, P('WLAN', c.cx + c.rx * 0.77, c.cyTop - c.ry * 0.64, 'wireless', 0, 'top', 'Wi-Fi radio')],
    });
  }

  // Firewall
  {
    const w = 38, h = 60, top = 0.22, skew = 0.6;
    const f = faces(0, 0, w, h, top, skew);
    add({
      id: 'firewall', name: 'Firewall', category: 'Security', prefix: 'fw', w, h,
      shapes: [isoBox(0, 0, w, h, top, { skew, name: 'Body' }), ...bricks(f, 8)],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('WAN', q.top(), 'ethernet', 'top'), at('LAN', q.bottomL(1), 'ethernet', 'bottom'), at('DMZ', q.left(0.5), 'ethernet', 'left'), at('MGMT', q.right(0.5), 'ethernet', 'right')]; })(),
    });
  }

  // Access point: flat puck with radio waves
  {
    const w = 50, h = 34;
    add({
      id: 'access-point', name: 'Access Point', category: 'Wireless', prefix: 'ap', w, h,
      shapes: [
        isoCyl(3, 20, 44, 14, 0.66, { name: 'Body' }),
        ell(22.5, 24.2, 5, 2.4, '#7CFC9A'),
        path('M4 15a11.3 11.3 0 0 1 16 0 M7.6 18.4a6.2 6.2 0 0 1 8.8 0', 11, 3, 28, 15, { vb: [2, 9, 20, 11], stroke: A, strokeWidth: 2.4 }),
      ],
      ports: [P('ETH', 25, 34, 'ethernet', 1, 'bottom'), P('WLAN', 25, 4, 'wireless', 0, 'top', 'Wi-Fi radio')],
    });
  }

  // Internet / cloud
  add({
    id: 'cloud', name: 'Internet / Cloud', category: 'Network', prefix: 'inet', w: 76, h: 44, accent: '#8fa6bf',
    shapes: [
      path('M19 43 H59 A14.5 14.5 0 0 0 61 14.3 A18 18 0 0 0 27.5 9.8 A13 13 0 0 0 9.5 21 A11.2 11.2 0 0 0 19 43 Z', 0, 0, 76, 44,
        { vb: [0, 0, 76, 44], fill: AL, stroke: AD, strokeWidth: 1 }),
    ],
    ports: [P('N', 38, 4, 'any', 0, 'top'), P('S', 38, 43, 'any', 0, 'bottom'), P('W', 3, 32, 'any', 0, 'left'), P('E', 74, 28, 'any', 0, 'right')],
  });

  // Server tower (wide front face like the reference)
  {
    const w = 38, h = 56, top = 0.2, skew = 0.74;
    const f = faces(0, 0, w, h, top, skew);
    add({
      id: 'server', name: 'Server', category: 'Compute', prefix: 'srv', w, h,
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        frect(f.left, 0.14, 0.08, 0.5, 0.15, W, { stroke: NAVY, strokeWidth: 0.4 }),
        ...[0, 1, 2].map((i) => fpoly(f.left, [[0.2 + i * 0.12, 0.13], [0.27 + i * 0.12, 0.13], [0.27 + i * 0.12, 0.18], [0.2 + i * 0.12, 0.18]], NAVY)),
        ...[0, 1, 2, 3].map((i) => fline(f.left, [[0.42, 0.6 + i * 0.07], [0.86, 0.6 + i * 0.07]], W, 1.1)),
        fline(f.left, [[0.14, 0.86], [0.24, 0.86]], '#7CFC9A', 1.6),
      ],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('ETH0', q.top(), 'ethernet', 'top'), at('ETH1', q.bottomL(0.6), 'ethernet', 'bottom'), at('ETH2', q.left(0.5), 'ethernet', 'left'), at('iLO', q.right(0.5), 'ethernet', 'right')]; })(),
    });
  }

  // NAS
  {
    const w = 46, h = 42, top = 0.3, skew = 0.66;
    const f = faces(0, 0, w, h, top, skew);
    add({
      id: 'nas', name: 'Storage / NAS', category: 'Compute', prefix: 'nas', w, h,
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        ...[0, 1, 2, 3].map((i) => frect(f.left, 0.08 + i * 0.22, 0.16, 0.17, 0.7, AD, { stroke: W, strokeWidth: 0.6 })),
        ...[0, 1, 2, 3].map((i) => fpoly(f.left, [[0.12 + i * 0.22, 0.24], [0.18 + i * 0.22, 0.24], [0.18 + i * 0.22, 0.3], [0.12 + i * 0.22, 0.3]], '#7CFC9A')),
      ],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('ETH0', q.top(), 'ethernet', 'top'), at('ETH1', q.bottomL(0.7), 'ethernet', 'bottom'), at('ETH2', q.left(0.5), 'ethernet', 'left'), at('ETH3', q.right(0.5), 'ethernet', 'right')]; })(),
    });
  }

  // Personal computer: monitor + tower
  {
    const mf = faces(0, 0, 44, 36, 0.08, 0.86);
    const tf = faces(46, 10, 14, 36, 0.16, 0.42);
    add({
      id: 'pc', name: 'Personal Computer', category: 'Compute', prefix: 'pc', w: 60, h: 48,
      shapes: [
        poly([[17, 33], [27, 33], [29, 42], [15, 42]], AD, { stroke: NAVY, strokeWidth: 0.6 }),
        poly([[7, 41.5], [37, 41.5], [41, 46], [3, 46]], AL, { stroke: NAVY, strokeWidth: 0.6 }),
        isoBox(0, 0, 44, 36, 0.08, { skew: 0.86, name: 'Monitor' }),
        frect(mf.left, 0.06, 0.08, 0.88, 0.8, AD),
        frect(mf.left, 0.12, 0.2, 0.36, 0.09, W, { opacity: 0.95 }),
        frect(mf.left, 0.12, 0.38, 0.6, 0.07, ALL),
        frect(mf.left, 0.12, 0.52, 0.48, 0.07, ALL),
        isoBox(46, 10, 14, 36, 0.16, { skew: 0.42, name: 'Tower' }),
        fline(tf.left, [[0.25, 0.15], [0.75, 0.15]], W, 1),
        fline(tf.left, [[0.25, 0.27], [0.75, 0.27]], W, 1),
        fpoly(tf.left, [[0.35, 0.8], [0.65, 0.8], [0.65, 0.86], [0.35, 0.86]], '#7CFC9A'),
      ],
      ports: [P('ETH', 54, 46, 'ethernet', 1, 'bottom'), P('ETH2', 0, 18, 'ethernet', 1, 'left'), P('USB', 22, 2, 'usb', 1, 'top')],
    });
  }

  // Laptop (open, three-quarter view)
  {
    const lid: Pt[] = [[14, 0], [62, 0], [57, 30], [9, 30]];
    const scr: Pt[] = [[17.4, 2.8], [58.6, 2.8], [54.2, 27.2], [13, 27.2]];
    const s = (u: number, v: number): Pt => [scr[0][0] + u * (scr[1][0] - scr[0][0]) + v * (scr[3][0] - scr[0][0]), scr[0][1] + v * (scr[3][1] - scr[0][1])];
    add({
      id: 'laptop', name: 'Laptop', category: 'Compute', prefix: 'nb', w: 64, h: 46,
      shapes: [
        poly(lid, A, { stroke: NAVY, strokeWidth: 0.7 }),
        poly(scr, '#0f6fb2', { stroke: NAVY, strokeWidth: 0.4 }),
        poly([s(0.1, 0.2), s(0.42, 0.2), s(0.42, 0.29), s(0.1, 0.29)], '#e5484d'),
        poly([s(0.1, 0.38), s(0.6, 0.38), s(0.6, 0.45), s(0.1, 0.45)], ALL),
        poly([s(0.1, 0.53), s(0.5, 0.53), s(0.5, 0.6), s(0.1, 0.6)], ALL),
        poly([[9, 30], [57, 30], [64, 40], [2, 40]], AL, { stroke: NAVY, strokeWidth: 0.7 }),
        poly([[2, 40], [64, 40], [64, 43], [2, 43]], AD, { stroke: NAVY, strokeWidth: 0.6 }),
        poly([[15, 32], [51, 32], [54.5, 36.6], [11.5, 36.6]], A, { opacity: 0.55 }),
        poly([[27, 37.6], [39, 37.6], [39.6, 39.2], [26.4, 39.2]], A, { opacity: 0.5 }),
      ],
      ports: [P('ETH', 2, 41, 'ethernet', 1, 'left'), P('WLAN', 38, 0, 'wireless', 1, 'top'), P('USB', 64, 41, 'usb', 1, 'right')],
    });
  }

  // IP camera: bullet camera on a wall mount
  {
    add({
      id: 'ip-camera', name: 'IP Camera', category: 'Security', prefix: 'cam', w: 56, h: 38,
      shapes: [
        poly([[38, 19], [44, 19], [44, 32], [38, 32]], AD, { stroke: NAVY, strokeWidth: 0.6 }),
        rrect(32, 31, 20, 6, [1.5, 1.5, 1.5, 1.5], ADD),
        rrect(8, 6, 44, 15, [7.5, 3, 3, 7.5], A, { stroke: NAVY, strokeWidth: 0.7, name: 'Housing' }),
        rrect(10, 6, 40, 4, [2, 2, 0, 0], AL, { opacity: 0.9 }),
        poly([[6, 3], [50, 3], [54, 6], [4, 6]], AL, { stroke: NAVY, strokeWidth: 0.6, name: 'Sun shield' }),
        ell(2, 6, 11, 15, ADD, { stroke: NAVY, strokeWidth: 0.6 }),
        ell(4.2, 9, 6.6, 9, '#0b2236'),
        ell(5.2, 10.4, 2.2, 2.6, W, { opacity: 0.8 }),
        ell(46, 15.5, 2, 2, '#e5484d'),
      ],
      ports: [P('PoE', 41, 38, 'ethernet', 1, 'bottom', 'Power over Ethernet')],
    });
  }

  // HMI panel
  {
    const w = 62, h = 44, top = 0.1, skew = 0.9;
    const f = faces(0, 0, w, h, top, skew);
    add({
      id: 'hmi', name: 'HMI Panel', category: 'Industrial', prefix: 'hmi', w, h, fields: OT_FIELDS,
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        frect(f.left, 0.07, 0.1, 0.86, 0.78, '#0f6fb2', { stroke: NAVY, strokeWidth: 0.5 }),
        frect(f.left, 0.14, 0.22, 0.42, 0.08, W),
        frect(f.left, 0.14, 0.38, 0.62, 0.07, ALL),
        frect(f.left, 0.14, 0.52, 0.5, 0.07, ALL),
        frect(f.left, 0.14, 0.66, 0.3, 0.07, ALL),
      ],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('X1 P1', q.top(-0.45), 'profinet', 'top'), at('X1 P2', q.bottomL(0.5), 'profinet', 'bottom'), at('P3', q.left(0.5), 'profinet', 'left'), at('P4', q.right(0.5), 'profinet', 'right')]; })(),
    });
  }

  // Compact PLC (S7-1200-like "capsule", as in the reference)
  {
    add({
      id: 'plc-compact', name: 'PLC (compact)', category: 'Industrial', prefix: 'plc', w: 58, h: 38, fields: OT_FIELDS,
      description: 'Compact PLC, e.g. S7-1200 class',
      shapes: [
        path('M10 1 H48 A9 18 0 0 1 48 37 H6 A5 5 0 0 1 1 32 V10 A9 9 0 0 1 10 1 Z', 0, 0, 58, 38, { vb: [0, 0, 58, 38], fill: A, stroke: NAVY, strokeWidth: 0.8, name: 'Body' }),
        path('M48 1 A9 18 0 0 1 48 37 A9 18 0 0 1 48 1 Z', 0, 0, 58, 38, { vb: [0, 0, 58, 38], fill: AD, stroke: NAVY, strokeWidth: 0.8, name: 'End cap' }),
        path('M10 1 H48 A9 18 0 0 0 42 6 H8 A9 9 0 0 1 10 1 Z', 0, 0, 58, 38, { vb: [0, 0, 58, 38], fill: AL, stroke: 'none', opacity: 0.85 }),
        circ(8, 12, 1.6, W), circ(13, 12, 1.6, W), circ(18, 12, 1.6, W),
        line([[8, 22], [36, 22]], ALL, 1.2), line([[8, 27], [30, 27]], ALL, 1.2),
      ],
      ports: [P('X1 P1', 28, 1, 'profinet', 1, 'top'), P('X1 P2', 26, 37, 'profinet', 1, 'bottom'), P('P3', 1, 21, 'profinet', 1, 'left'), P('P4', 57, 19, 'profinet', 1, 'right')],
    });
  }

  // Modular PLC (S7-1500-like)
  {
    const w = 44, h = 54, top = 0.2, skew = 0.78;
    const f = faces(0, 0, w, h, top, skew);
    add({
      id: 'plc-modular', name: 'PLC (modular)', category: 'Industrial', prefix: 'plc', w, h, fields: OT_FIELDS,
      description: 'Modular PLC, e.g. S7-1500 class',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        frect(f.left, 0.08, 0.08, 0.38, 0.26, '#0b2236', { stroke: W, strokeWidth: 0.5 }),
        frect(f.left, 0.12, 0.12, 0.3, 0.06, '#3fb59a'),
        ...[0, 1].map((i) => fline(f.left, [[0.55 + i * 0.2, 0.04], [0.55 + i * 0.2, 0.96]], NAVY, 0.9)),
        ...[0, 1].map((i) => frect(f.left, 0.59 + i * 0.2, 0.12, 0.12, 0.7, ALL, { opacity: 0.9 })),
        ...[0, 1, 2].map((i) => fpoly(f.left, [[0.12 + i * 0.1, 0.5], [0.18 + i * 0.1, 0.5], [0.18 + i * 0.1, 0.55], [0.12 + i * 0.1, 0.55]], W)),
        fline(f.left, [[0.1, 0.7], [0.44, 0.7]], W, 1), fline(f.left, [[0.1, 0.78], [0.38, 0.78]], W, 1),
      ],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('X1 P1', q.top(), 'profinet', 'top'), at('X1 P2', q.bottomL(0.4), 'profinet', 'bottom'), at('X2', q.left(0.5), 'ethernet', 'left'), at('X3', q.right(0.5), 'ethernet', 'right')]; })(),
    });
  }

  // Motor driver (slim drive)
  {
    const w = 24, h = 50, top = 0.14, skew = 0.7;
    const f = faces(0, 0, w, h - 6, top, skew);
    add({
      id: 'motor-driver', name: 'Motor Driver', category: 'Industrial', prefix: 'drv', w, h, fields: OT_FIELDS,
      shapes: [
        rect(8, h - 8, 4, 8, AD, { stroke: NAVY, strokeWidth: 0.5 }),
        isoBox(0, 0, w, h - 6, top, { skew, name: 'Body' }),
        frect(f.left, 0.14, 0.08, 0.7, 0.14, '#0b2236', { stroke: W, strokeWidth: 0.4 }),
        ...[0, 1, 2].map((i) => fpoly(f.left, [[0.18, 0.32 + i * 0.08], [0.32, 0.32 + i * 0.08], [0.32, 0.37 + i * 0.08], [0.18, 0.37 + i * 0.08]], W)),
        fline(f.left, [[0.5, 0.33], [0.84, 0.33]], ALL, 1), fline(f.left, [[0.5, 0.42], [0.84, 0.42]], ALL, 1),
        frect(f.left, 0.2, 0.66, 0.6, 0.18, AD, { stroke: W, strokeWidth: 0.5 }),
      ],
      ports: (() => { const q = sil(0, 0, w, h - 6, top, skew); return [at('X1', q.top(), 'profinet', 'top'), P('X2', 10, h, 'profinet', 1, 'bottom'), at('P1', q.left(0.5), 'profinet', 'left'), at('P2', q.right(0.5), 'profinet', 'right')]; })(),
    });
  }

  // IO-Link master / slave
  {
    const w = 38, h = 38, top = 0.28, skew = 0.62;
    const f = faces(0, 0, w, h, top, skew);
    const m12 = (u: number, v: number) => {
      const [x, y] = f.left(u, v);
      return [ell(x - 2.4, y - 2.6, 4.8, 5.2, W, { stroke: NAVY, strokeWidth: 0.5 }), ell(x - 1.1, y - 1.2, 2.2, 2.4, AD)];
    };
    add({
      id: 'iolink', name: 'IO-Link Master / Slave', category: 'Industrial', prefix: 'io', w, h, fields: OT_FIELDS,
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        ...m12(0.25, 0.25), ...m12(0.7, 0.25), ...m12(0.25, 0.68), ...m12(0.7, 0.68),
        ...[0, 1, 2].map((i) => fpoly(f.right, [[0.2, 0.25 + i * 0.12], [0.45, 0.25 + i * 0.12], [0.45, 0.31 + i * 0.12], [0.2, 0.31 + i * 0.12]], i === 0 ? '#7CFC9A' : W)),
      ],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('X1', q.top(), 'ethernet', 'top'), at('X2', q.right(0.45), 'ethernet', 'right'),
        at('IO1', q.bottomL(0.15), 'iolink', 'bottom'), at('IO2', q.bottomL(0.55), 'iolink', 'bottom'), at('IO3', q.bottomR(0.35), 'iolink', 'bottom'), at('IO4', q.left(0.5), 'iolink', 'left')]; })(),
    });
  }

  // Vision sensor (smart camera)
  {
    const w = 42, h = 36, top = 0.3, skew = 0.6;
    const f = faces(0, 0, w, h, top, skew);
    const [lx, ly] = f.left(0.42, 0.5);
    add({
      id: 'vision', name: 'Vision Sensor', category: 'Industrial', prefix: 'vis', w, h, fields: OT_FIELDS,
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        ell(lx - 8, ly - 8.6, 16, 17.2, W, { stroke: NAVY, strokeWidth: 0.6, rotation: 14 }),
        ell(lx - 5.6, ly - 6, 11.2, 12, '#0b2236', { rotation: 14 }),
        ell(lx - 2.6, ly - 3.2, 4, 4, '#3b82c4', { opacity: 0.9 }),
        ...[0, 1].map((i) => fpoly(f.right, [[0.25, 0.3 + i * 0.16], [0.7, 0.3 + i * 0.16], [0.7, 0.38 + i * 0.16], [0.25, 0.38 + i * 0.16]], i ? W : '#7CFC9A')),
      ],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('ETH', q.top(), 'ethernet', 'top'), at('I/O', q.bottomL(1), 'iolink', 'bottom')]; })(),
    });
  }

  // IoT sensor (slim tower with slots, like SmartSense)
  {
    const w = 24, h = 52, top = 0.16, skew = 0.62;
    const f = faces(0, 4, w, h - 4, top, skew);
    add({
      id: 'iot-sensor', name: 'IoT Sensor', category: 'IoT', prefix: 'iot', w, h,
      shapes: [
        line([[19, 9], [19, 0.8]], NAVY, 1.4), circ(19, 1.2, 1.3, AD),
        isoBox(0, 4, w, h - 4, top, { skew, name: 'Body' }),
        ...[0, 1, 2, 3].map((i) => fline(f.left, [[0.2 + i * 0.18, 0.18], [0.2 + i * 0.18, 0.62]], W, 1.1)),
        fpoly(f.left, [[0.2, 0.74], [0.4, 0.74], [0.4, 0.8], [0.2, 0.8]], '#7CFC9A'),
        path('M2 12c2.5-4 5-4 7.5 0s5 4 7.5 0 5-4 7.5 0', 0, 0, 1, 1, { vb: [1, 6, 23, 12], stroke: W, strokeWidth: 1.6, ...(() => { const [x, y] = f.right(0.15, 0.2); return { x, y, w: 7, h: 4 }; })() }),
      ],
      ports: [P('WLAN', 19, 0, 'wireless', 1, 'top'), at('ETH', sil(0, 4, w, h - 4, top, skew).bottomL(1), 'ethernet', 'bottom')],
    });
  }

  // IoT gateway
  {
    const w = 30, h = 56, top = 0.16, skew = 0.62;
    const f = faces(0, 6, w, h - 6, top, skew);
    add({
      id: 'iot-gateway', name: 'IoT Gateway', category: 'IoT', prefix: 'gt', w, h,
      shapes: [
        line([[23, 12], [23, 1.6]], NAVY, 1.6), circ(23, 1.8, 1.7, A, { stroke: NAVY, strokeWidth: 0.5 }),
        isoBox(0, 6, w, h - 6, top, { skew, name: 'Body' }),
        frect(f.left, 0.15, 0.1, 0.7, 0.16, W, { stroke: NAVY, strokeWidth: 0.4 }),
        ...[0, 1].map((i) => frect(f.left, 0.2 + i * 0.34, 0.36, 0.26, 0.12, '#0b2236', { stroke: W, strokeWidth: 0.4 })),
        ...[0, 1, 2].map((i) => fline(f.left, [[0.18, 0.6 + i * 0.08], [0.82, 0.6 + i * 0.08]], ALL, 1)),
        ...[0, 1, 2].map((i) => fpoly(f.right, [[0.3, 0.2 + i * 0.09], [0.6, 0.2 + i * 0.09], [0.6, 0.25 + i * 0.09], [0.3, 0.25 + i * 0.09]], i === 0 ? '#7CFC9A' : W)),
      ],
      ports: (() => { const q = sil(0, 6, w, h - 6, top, skew); return [P('WLAN', 23, 0, 'wireless', 0, 'top', 'Wi-Fi / cellular radio'), at('ETH0', q.bottomL(1), 'ethernet', 'bottom'), at('ETH1', q.left(0.5), 'ethernet', 'left'), at('ETH2', q.right(0.5), 'ethernet', 'right')]; })(),
    });
  }

  // Robot arm (grey links, blue joints, like the URRobot in the reference)
  {
    const G1 = '#e3e6ea', G2 = '#b9bec6', GS = '#7d848e';
    const link = (a: Pt, b: Pt, r: number, fill: string) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = (-dy / L) * r, ny = (dx / L) * r;
      return poly([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], fill, { stroke: GS, strokeWidth: 0.6 });
    };
    const joint = (c: Pt, r: number) => [circ(c[0], c[1], r, A, { stroke: NAVY, strokeWidth: 0.6 }), circ(c[0] + r * 0.12, c[1] - r * 0.1, r * 0.55, ALL)];
    const base: Pt = [22, 46], sh: Pt = [22, 38], el: Pt = [40, 20], wr: Pt = [18, 8];
    add({
      id: 'robot-arm', name: 'Robot Arm', category: 'Industrial', prefix: 'rb', w: 52, h: 58, fields: OT_FIELDS,
      shapes: [
        isoCyl(10, 46, 24, 12, 0.5, { fill: G2, stroke: GS }),
        rect(15, 38, 14, 10, G1, { stroke: GS, strokeWidth: 0.6 }),
        link(sh, el, 3.4, G1),
        link(el, wr, 2.8, G1),
        ...joint(sh, 5.4), ...joint(el, 4.8), ...joint(wr, 4.2),
        rrect(5, 4, 8, 9, [1.5, 1.5, 1.5, 1.5], AD, { stroke: NAVY, strokeWidth: 0.6, rotation: -20 }),
      ],
      ports: [P('ETH', 10, 52, 'ethernet', 1, 'left'), P('TOOL', 7, 14, 'iolink', 1, 'left', 'Tool flange I/O')],
    });
    void base;
  }

  // Gripper
  {
    const G1 = '#e7e9ec', G2 = '#c9cdd3', GS = '#7d848e';
    add({
      id: 'gripper', name: 'Gripper', category: 'Industrial', prefix: 'gr', w: 34, h: 48, accent: '#1a8fd8', fields: OT_FIELDS,
      shapes: [
        rrect(10, 0, 14, 7, [2, 2, 0, 0], '#4b525c', { stroke: '#2b3036', strokeWidth: 0.6 }),
        rrect(3, 7, 28, 20, [5, 5, 3, 3], G1, { stroke: GS, strokeWidth: 0.7, name: 'Body' }),
        rect(6, 11, 22, 3, G2), rect(6, 16, 22, 2, G2),
        rect(3, 24, 28, 4, '#5f6670', { stroke: GS, strokeWidth: 0.5 }),
        poly([[5, 28], [13, 28], [13, 44], [9, 48], [5, 44]], G2, { stroke: GS, strokeWidth: 0.7 }),
        poly([[21, 28], [29, 28], [29, 44], [25, 48], [21, 44]], G2, { stroke: GS, strokeWidth: 0.7 }),
        rect(7, 31, 4, 9, G1), rect(23, 31, 4, 9, G1),
        circ(27, 10.5, 1.2, A),
      ],
      ports: [P('I/O', 17, 0, 'iolink', 1, 'top')],
    });
  }

  // Generic device
  {
    const w = 46, h = 40, top = 0.3, skew = 0.6;
    const f = faces(0, 0, w, h, top, skew);
    add({
      id: 'generic', name: 'Generic Device', category: 'Basic', prefix: 'dev', w, h,
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        frect(f.left, 0.14, 0.2, 0.6, 0.12, W),
        frect(f.left, 0.14, 0.44, 0.72, 0.08, ALL),
        frect(f.left, 0.14, 0.6, 0.5, 0.08, ALL),
        fpoly(f.right, [[0.25, 0.25], [0.5, 0.25], [0.5, 0.32], [0.25, 0.32]], '#7CFC9A'),
      ],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('P1', q.top(), 'any', 'top'), at('P2', q.bottomL(1), 'any', 'bottom'), at('P3', q.left(0.5), 'any', 'left'), at('P4', q.right(0.5), 'any', 'right')]; })(),
    });
  }

  return out;
}

export const ISO_DEFS: DeviceDef[] = build();
