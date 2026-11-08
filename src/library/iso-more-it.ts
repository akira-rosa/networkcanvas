import type { DeviceDef, Shape } from '../model/types';
import { AL, ALL, AD, ADD, P, circ, def, ell, isoBox, isoCyl, line, poly } from './draw';
import { type Pt, type Faces, W, NAVY, faces, frect, fpoly, fline, sil, at, arrowUV } from './iso';

// Second batch of isometric IT devices — see docs/ICON_SPEC_MORE.md.
// Same language as iso.ts: blue iso bodies (lighter top, darker right face),
// navy outlines, white glyphs drawn in perspective on the faces, green LEDs.

const GREEN = '#7CFC9A';
const SCREEN = '#0b2236';

/* ---------- local helpers ---------- */

/** sampled arc in face space: centre (cu,cv), radii (ru,rv), angles in degrees (y-down) */
const arc = (cu: number, cv: number, ru: number, rv: number, a0: number, a1: number, n = 18): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [cu + Math.cos(a) * ru, cv + Math.sin(a) * rv] as Pt;
  });

/** double-headed arrow along u on a face */
const dblArrowU = (f: Faces['top'], u0: number, u1: number, v: number, t: number, head: number, hw: number, fill = W) =>
  fpoly(f, [[u0, v], [u0 + head, v - hw], [u0 + head, v - t], [u1 - head, v - t], [u1 - head, v - hw], [u1, v],
    [u1 - head, v + hw], [u1 - head, v + t], [u0 + head, v + t], [u0 + head, v + hw]], fill);

/** small flattened LED dot at a face point */
const led = (p: Pt, fill: string, r = 1.3) => ell(p[0] - r, p[1] - r * 0.62, r * 2, r * 1.24, fill);

interface Box { x: number; y: number; w: number; h: number; top: number; skew: number }

/** an iso box standing on the top face of `b`, covering u0..u1 × v0..v1 of it, hh high */
function boxOn(b: Box, u0: number, v0: number, u1: number, v1: number, hh: number, o: Record<string, unknown> = {}): { shape: Shape; box: Box } {
  const f = faces(b.x, b.y, b.w, b.h, b.top, b.skew);
  const th = b.h * b.top, s = b.skew;
  const w2 = (u1 - u0) * (1 - s) * b.w + (v1 - v0) * s * b.w;
  const s2 = ((v1 - v0) * s * b.w) / w2;
  const th2 = (th * w2) / b.w;
  const [lx] = f.top(u0, v0);
  const [, by] = f.top(u1, v0);
  const box: Box = { x: lx, y: by - hh, w: w2, h: th2 + hh, top: th2 / (th2 + hh), skew: s2 };
  return { shape: isoBox(box.x, box.y, box.w, box.h, box.top, { skew: box.skew, ...o }), box };
}

/* ---------- the set ---------- */

function build(): DeviceDef[] {
  const out: DeviceDef[] = [];
  const add = (d: Omit<DeviceDef, 'builtin' | 'accent' | 'fields' | 'style'> & { accent?: string; fields?: DeviceDef['fields'] }) => out.push(def('iso', d));

  // Wireless controller: 1U slab, Wi-Fi arcs in perspective on the top face
  {
    const w = 60, h = 32, top = 0.64;
    const f = faces(0, 0, w, h, top);
    const q = sil(0, 0, w, h, top);
    // glyph frame: screen-upright on the top face, centred, k = half size in face units
    const g = (x: number, y: number): Pt => [0.5 + ((x - y) * 0.46) / Math.SQRT2, 0.5 + ((x + y) * 0.46) / Math.SQRT2];
    const dot = g(0, 0.5);
    const ring = (r: number) => fline(f.top, arc(0, 0.5, r, r, -135, -45).map(([x, y]) => g(x, y)), W, 1.7);
    add({
      id: 'wireless-controller', name: 'Wireless Controller', category: 'Wireless', prefix: 'wlc', w, h,
      description: 'WLAN controller appliance',
      shapes: [
        isoBox(0, 0, w, h, top, { name: 'Body' }),
        ...[0, 1, 2, 3].map((i) => frect(f.left, 0.12 + i * 0.14, 0.32, 0.09, 0.38, NAVY, { opacity: 0.55 })),
        ...[0, 1].map((i) => frect(f.right, 0.6 + i * 0.17, 0.32, 0.12, 0.38, NAVY, { opacity: 0.55 })),
        ...[0, 1, 2].map((i) => fpoly(f.right, [[0.12 + i * 0.1, 0.45], [0.17 + i * 0.1, 0.45], [0.17 + i * 0.1, 0.62], [0.12 + i * 0.1, 0.62]], GREEN)),
        ring(0.42), ring(0.72), ring(1.02),
        fpoly(f.top, arc(dot[0], dot[1], 0.07, 0.07, 0, 360, 12), W),
      ],
      ports: [at('P1', q.left(0.5), 'ethernet', 'left'), at('P2', q.right(0.5), 'ethernet', 'right'), at('SFP1', q.bottomL(1), 'sfp', 'bottom'), at('MGMT', q.top(), 'ethernet', 'top')],
    });
  }

  // Load balancer: slab with a 1 → 3 fan-out glyph along the top face
  {
    const w = 60, h = 32, top = 0.64;
    const f = faces(0, 0, w, h, top);
    const q = sil(0, 0, w, h, top);
    add({
      id: 'load-balancer', name: 'Load Balancer', category: 'Network', prefix: 'lb', w, h,
      description: 'Application delivery / load balancing appliance',
      shapes: [
        isoBox(0, 0, w, h, top, { name: 'Body' }),
        ...[0, 1, 2, 3].map((i) => frect(f.left, 0.12 + i * 0.14, 0.32, 0.09, 0.38, NAVY, { opacity: 0.55 })),
        ...[0, 1].map((i) => frect(f.right, 0.6 + i * 0.17, 0.32, 0.12, 0.38, NAVY, { opacity: 0.55 })),
        ...[0, 1, 2].map((i) => fpoly(f.right, [[0.12 + i * 0.1, 0.45], [0.17 + i * 0.1, 0.45], [0.17 + i * 0.1, 0.62], [0.12 + i * 0.1, 0.62]], GREEN)),
        frect(f.top, 0.1, 0.455, 0.3, 0.09, W),
        arrowUV(f.top, [0.4, 0.5], [0.9, 0.2], 0.045, 0.16, 0.12),
        arrowUV(f.top, [0.4, 0.5], [0.9, 0.5], 0.045, 0.16, 0.12),
        arrowUV(f.top, [0.4, 0.5], [0.9, 0.8], 0.045, 0.16, 0.12),
        fpoly(f.top, arc(0.4, 0.5, 0.09, 0.09, 0, 360, 12), W),
      ],
      ports: [at('P1', q.top(), 'ethernet', 'top'), at('P2', q.bottomL(1), 'ethernet', 'bottom'), at('P3', q.left(0.5), 'ethernet', 'left'), at('P4', q.right(0.5), 'ethernet', 'right')],
    });
  }

  // Modem / ONT: small flat slab with a status LED row along the front edge of the top face
  {
    const w = 46, h = 26, top = 0.6;
    const f = faces(0, 0, w, h, top);
    const q = sil(0, 0, w, h, top);
    add({
      id: 'modem-ont', name: 'Modem / ONT', category: 'Network', prefix: 'mdm', w, h,
      description: 'Cable / DSL modem or optical network terminal',
      shapes: [
        isoBox(0, 0, w, h, top, { name: 'Body' }),
        frect(f.top, 0.1, 0.14, 0.8, 0.16, W, { opacity: 0.9 }),
        frect(f.top, 0.1, 0.4, 0.5, 0.1, ALL),
        ...[0, 1, 2, 3, 4].map((i) => led(f.top(0.16 + i * 0.13, 0.78), i < 3 ? GREEN : W)),
        // fibre socket on the left face, two RJ45 on the right face
        fpoly(f.left, [[0.4, 0.3], [0.6, 0.3], [0.6, 0.72], [0.4, 0.72]], W, { stroke: NAVY, strokeWidth: 0.4 }),
        fpoly(f.left, [[0.46, 0.4], [0.54, 0.4], [0.54, 0.62], [0.46, 0.62]], NAVY),
        ...[0, 1].map((i) => frect(f.right, 0.5 + i * 0.22, 0.3, 0.14, 0.42, NAVY, { opacity: 0.55 })),
      ],
      ports: [at('WAN', q.left(0.5), 'fiber', 'left'), at('LAN1', q.right(0.5), 'ethernet', 'right'), at('LAN2', q.bottomL(1), 'ethernet', 'bottom')],
    });
  }

  // Patch panel: wide thin slab, 2 × 4 dark keystone slots on the front face
  {
    const w = 66, h = 24, top = 0.42, skew = 0.78;
    const f = faces(0, 0, w, h, top, skew);
    const q = sil(0, 0, w, h, top, skew);
    const slot = (u: number) => [
      frect(f.left, u, 0.22, 0.075, 0.56, SCREEN, { stroke: W, strokeWidth: 0.5 }),
      frect(f.left, u + 0.02, 0.6, 0.035, 0.1, W, { opacity: 0.6 }),
    ];
    add({
      id: 'patch-panel', name: 'Patch Panel', category: 'Network', prefix: 'pp', w, h,
      description: '8-port patch panel',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        ...[0, 1, 2, 3].flatMap((i) => slot(0.07 + i * 0.1)),
        ...[0, 1, 2, 3].flatMap((i) => slot(0.555 + i * 0.1)),
        fline(f.left, [[0.07, 0.12], [0.925, 0.12]], ALL, 0.8),
        // mounting screws on the right (end) face
        ...[0.28, 0.72].map((v) => circ(...f.right(0.5, v), 1.1, W, { opacity: 0.85 })),
      ],
      ports: [
        at('P1', q.top(0.16), 'ethernet', 'top'), at('P2', q.top(0.38), 'ethernet', 'top'), at('P3', q.top(0.6), 'ethernet', 'top'), at('P4', q.top(0.82), 'ethernet', 'top'),
        at('P5', q.bottomL(0.16), 'ethernet', 'bottom'), at('P6', q.bottomL(0.38), 'ethernet', 'bottom'), at('P7', q.bottomL(0.6), 'ethernet', 'bottom'), at('P8', q.bottomL(0.82), 'ethernet', 'bottom'),
      ],
    });
  }

  // Media converter: small box, fibre ⟷ copper double arrow on top, SC socket left, RJ45 right
  {
    const w = 40, h = 26, top = 0.56, skew = 0.55;
    const f = faces(0, 0, w, h, top, skew);
    const q = sil(0, 0, w, h, top, skew);
    add({
      id: 'media-converter', name: 'Media Converter', category: 'Network', prefix: 'mc', w, h,
      description: 'Fibre to copper media converter',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        dblArrowU(f.top, 0.1, 0.9, 0.5, 0.07, 0.22, 0.2),
        led(f.top(0.2, 0.82), GREEN), led(f.top(0.36, 0.82), W),
        // SC duplex fibre socket on the left face: two square ferrule housings on a common clip
        frect(f.left, 0.24, 0.68, 0.5, 0.1, W, { opacity: 0.85 }),
        ...[0, 1].map((i) => fpoly(f.left, [[0.26 + i * 0.26, 0.26], [0.46 + i * 0.26, 0.26], [0.46 + i * 0.26, 0.7], [0.26 + i * 0.26, 0.7]], W, { stroke: NAVY, strokeWidth: 0.4 })),
        ...[0, 1].map((i) => fpoly(f.left, arc(0.36 + i * 0.26, 0.48, 0.05, 0.1, 0, 360, 10), NAVY)),
        // RJ45 keystone on the right face: dark slot, white frame, clip notch at the bottom
        frect(f.right, 0.28, 0.26, 0.44, 0.46, SCREEN, { stroke: W, strokeWidth: 0.45 }),
        fpoly(f.right, [[0.42, 0.62], [0.58, 0.62], [0.58, 0.72], [0.42, 0.72]], W),
      ],
      ports: [at('FX', q.left(0.5), 'fiber', 'left'), at('TX', q.right(0.5), 'ethernet', 'right')],
    });
  }

  // VPN gateway: compact appliance with a padlock on the front face
  {
    const w = 40, h = 46, top = 0.26, skew = 0.62;
    const f = faces(0, 0, w, h, top, skew);
    const q = sil(0, 0, w, h, top, skew);
    const uL = skew * Math.hypot(w, h * top), vL = h * (1 - top); // left-face edge lengths (px)
    const r = 4.6, ru = r / uL, rv = r / vL;
    add({
      id: 'vpn-gateway', name: 'VPN Gateway', category: 'Security', prefix: 'vpn', w, h,
      description: 'Site-to-site / remote-access VPN concentrator',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        fline(f.left, [[0.5 - ru, 0.5] as Pt, ...arc(0.5, 0.42, ru, rv, 180, 360), [0.5 + ru, 0.5] as Pt], W, 1.8),
        frect(f.left, 0.5 - ru - 0.1, 0.48, 2 * ru + 0.2, 0.26, W),
        fpoly(f.left, [[0.46, 0.55], [0.54, 0.55], [0.54, 0.66], [0.46, 0.66]], AD),
        ...[0, 1, 2].map((i) => fpoly(f.right, [[0.3, 0.2 + i * 0.09], [0.62, 0.2 + i * 0.09], [0.62, 0.25 + i * 0.09], [0.3, 0.25 + i * 0.09]], i === 0 ? GREEN : W)),
        ...[0, 1].map((i) => fline(f.left, [[0.14, 0.86 + i * 0.06], [0.86, 0.86 + i * 0.06]], ALL, 0.8)),
      ],
      ports: [at('WAN', q.top(), 'ethernet', 'top'), at('LAN', q.bottomL(0.7), 'ethernet', 'bottom'), at('MGMT', q.right(0.5), 'ethernet', 'right')],
    });
  }

  // Printer: iso body with a raised rear section, a sheet in the feeder and one in the output tray
  {
    const body: Box = { x: 10, y: 14, w: 48, h: 30, top: 0.42, skew: 0.6 };
    const f = faces(body.x, body.y, body.w, body.h, body.top, body.skew);
    const q = sil(body.x, body.y, body.w, body.h, body.top, body.skew);
    const rear = boxOn(body, 0.06, 0.02, 0.94, 0.44, 9, { name: 'Feeder' });
    const rf = faces(rear.box.x, rear.box.y, rear.box.w, rear.box.h, rear.box.top, rear.box.skew);
    const lift = (p: Pt, dy: number): Pt => [p[0], p[1] - dy];
    // outward normal of the front (left) face in screen space
    const nx = -(1 - body.skew) * body.w, ny = (1 - body.skew) * body.h * body.top, nL = Math.hypot(nx, ny);
    const outw = (p: Pt, k: number): Pt => [p[0] + (nx / nL) * k, p[1] + (ny / nL) * k + k * 0.12];
    add({
      id: 'printer', name: 'Printer', category: 'Endpoints', prefix: 'prn', w: 58, h: 44,
      description: 'Network printer / MFP',
      shapes: [
        isoBox(body.x, body.y, body.w, body.h, body.top, { skew: body.skew, name: 'Body' }),
        rear.shape,
        // sheet standing in the feeder, leaning back
        poly([rf.top(0.18, 0.62), rf.top(0.82, 0.62), lift(rf.top(0.82, 0.3), 11), lift(rf.top(0.18, 0.3), 11)], W, { stroke: NAVY, strokeWidth: 0.5, name: 'Paper' }),
        // control panel on the top face
        frect(f.top, 0.12, 0.62, 0.3, 0.14, SCREEN, { stroke: W, strokeWidth: 0.4 }),
        led(f.top(0.55, 0.69), GREEN), led(f.top(0.68, 0.69), W),
        // output slot and the sheet coming out of it
        frect(f.left, 0.1, 0.22, 0.8, 0.12, SCREEN),
        poly([f.left(0.14, 0.34), f.left(0.86, 0.34), outw(f.left(0.86, 0.34), 9), outw(f.left(0.14, 0.34), 9)], W, { stroke: NAVY, strokeWidth: 0.5, name: 'Output' }),
      ],
      ports: [at('ETH', q.bottomL(1), 'ethernet', 'bottom'), at('USB', q.right(0.5), 'usb', 'right'), P('WLAN', Math.round(lift(rf.top(0.5, 0.3), 11)[0]), 1, 'wireless', 1, 'top', 'Wi-Fi radio')],
    });
  }

  // IP phone: iso base with screen, keypad and the handset lying along the left side
  {
    const w = 58, h = 30, top = 0.6;
    const f = faces(0, 4, w, h, top);
    const q = sil(0, 4, w, h, top);
    const up = (p: Pt, dy = 3): Pt => [p[0], p[1] - dy];
    const h0 = up(f.top(0.14, 0.17)), h1 = up(f.top(0.86, 0.17));
    const keys: Shape[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) keys.push(frect(f.top, 0.5 + c * 0.13, 0.62 + r * 0.11, 0.08, 0.06, W));
    add({
      id: 'ip-phone', name: 'IP Phone', category: 'Endpoints', prefix: 'ph', w, h: 34,
      description: 'VoIP desk phone',
      shapes: [
        isoBox(0, 4, w, h, top, { name: 'Base' }),
        frect(f.top, 0.06, 0.06, 0.88, 0.22, AD, { opacity: 0.35, name: 'Cradle' }),
        frect(f.top, 0.44, 0.34, 0.5, 0.2, SCREEN, { stroke: W, strokeWidth: 0.4, name: 'Display' }),
        frect(f.top, 0.5, 0.4, 0.3, 0.04, ALL),
        ...keys,
        line([h0, h1], NAVY, 4.6),
        line([h0, h1], AD, 3.4, { name: 'Handset' }),
        ell(h0[0] - 3.8, h0[1] - 2.3, 7.6, 4.6, AD, { stroke: NAVY, strokeWidth: 0.6 }),
        ell(h1[0] - 3.8, h1[1] - 2.3, 7.6, 4.6, AD, { stroke: NAVY, strokeWidth: 0.6 }),
        line([[h0[0] + 3, h0[1] - 1.1], [h1[0] - 3, h1[1] - 1.1]], AL, 0.9),
      ],
      ports: [at('ETH', q.bottomL(1), 'ethernet', 'bottom'), at('PC', q.right(0.5), 'ethernet', 'right', 1, 'PC pass-through port')],
    });
  }

  // Smartphone: thin upright slab, screen on the front face
  {
    const w = 26, h = 50, top = 0.07, skew = 0.84;
    const f = faces(0, 0, w, h, top, skew);
    const q = sil(0, 0, w, h, top, skew);
    add({
      id: 'mobile', name: 'Smartphone', category: 'Endpoints', prefix: 'mob', w, h,
      description: 'Smartphone / mobile client',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        frect(f.left, 0.09, 0.07, 0.82, 0.84, ADD, { stroke: W, strokeWidth: 0.5, name: 'Screen' }),
        fline(f.left, [[0.38, 0.035], [0.62, 0.035]], W, 0.8),
        frect(f.left, 0.18, 0.15, 0.46, 0.06, W, { opacity: 0.95 }),
        frect(f.left, 0.18, 0.28, 0.64, 0.05, ALL),
        frect(f.left, 0.18, 0.39, 0.52, 0.05, ALL),
        frect(f.left, 0.18, 0.5, 0.58, 0.05, ALL),
        frect(f.left, 0.34, 0.85, 0.32, 0.025, W, { opacity: 0.9 }),
        frect(f.right, 0.25, 0.2, 0.5, 0.08, W, { opacity: 0.8 }),
      ],
      ports: [at('WLAN', q.top(0.5), 'wireless', 'top', 1, 'Wi-Fi radio'), at('USB', q.bottomL(0.5), 'usb', 'bottom')],
    });
  }

  // Tablet: thin landscape slab lying flat, screen on the top face
  {
    const w = 60, h = 46, top = 0.84, skew = 0.4;
    const f = faces(0, 0, w, h, top, skew);
    const q = sil(0, 0, w, h, top, skew);
    add({
      id: 'tablet', name: 'Tablet', category: 'Endpoints', prefix: 'tab', w, h,
      description: 'Tablet / handheld terminal',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        frect(f.top, 0.08, 0.1, 0.84, 0.8, ADD, { stroke: W, strokeWidth: 0.5, name: 'Screen' }),
        frect(f.top, 0.15, 0.2, 0.34, 0.08, W, { opacity: 0.95 }),
        frect(f.top, 0.15, 0.37, 0.58, 0.07, ALL),
        frect(f.top, 0.15, 0.52, 0.46, 0.07, ALL),
        frect(f.top, 0.15, 0.67, 0.52, 0.07, ALL),
        led(f.top(0.5, 0.05), W, 1),
        led(f.top(0.5, 0.95), W, 1.1),
      ],
      ports: [at('WLAN', q.top(), 'wireless', 'top', 1, 'Wi-Fi radio'), at('USB', q.bottomL(1), 'usb', 'bottom')],
    });
  }

  // UPS: stocky tower with a power symbol, status LCD and battery bars on the front face
  {
    const w = 34, h = 56, top = 0.17, skew = 0.64;
    const f = faces(0, 0, w, h, top, skew);
    const q = sil(0, 0, w, h, top, skew);
    const uL = skew * Math.hypot(w, h * top), vL = h * (1 - top);
    const r = 6, ru = r / uL, rv = r / vL, cv = 0.46;
    add({
      id: 'ups', name: 'UPS', category: 'Power', prefix: 'ups', w, h,
      description: 'Uninterruptible power supply',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        frect(f.left, 0.2, 0.1, 0.6, 0.1, SCREEN, { stroke: W, strokeWidth: 0.4 }),
        frect(f.left, 0.25, 0.13, 0.3, 0.04, GREEN),
        fline(f.left, arc(0.5, cv, ru, rv, -55, 235), W, 1.9),
        fline(f.left, [[0.5, cv - rv * 1.15], [0.5, cv - rv * 0.15]], W, 1.9),
        ...[0, 1, 2, 3].map((i) => fpoly(f.left, [[0.2 + i * 0.16, 0.76], [0.3 + i * 0.16, 0.76], [0.3 + i * 0.16, 0.82], [0.2 + i * 0.16, 0.82]], i < 3 ? GREEN : W)),
        ...[0, 1, 2, 3].map((i) => fline(f.right, [[0.2, 0.62 + i * 0.07], [0.8, 0.62 + i * 0.07]], ALL, 0.9)),
      ],
      ports: [at('ETH', q.top(), 'ethernet', 'top'), at('USB', q.right(0.5), 'usb', 'right'), at('PWR', q.bottomL(1), 'power', 'bottom', 0, 'Battery-backed outlets')],
    });
  }

  // Database server: three stacked iso cylinders
  {
    const w = 46, seg = 22, step = 15, top = 0.45;
    const h = step * 2 + seg;
    add({
      id: 'database', name: 'Database Server', category: 'Compute', prefix: 'db', w, h,
      description: 'Database / data store',
      shapes: [
        isoCyl(0, step * 2, w, seg, top, { name: 'Disk 3' }),
        isoCyl(0, step, w, seg, top, { name: 'Disk 2' }),
        isoCyl(0, 0, w, seg, top, { name: 'Disk 1' }),
        led([w * 0.82, step * 2 + seg * top + 5], GREEN, 1.4),
      ],
      ports: [P('ETH0', w / 2, 0, 'ethernet', 1, 'top'), P('ETH1', w / 2, h, 'ethernet', 1, 'bottom'), P('MGMT', w, h / 2, 'ethernet', 1, 'right')],
    });
  }

  // Storage array / SAN: wide shelf with two rows of drive bays
  {
    const w = 58, h = 42, top = 0.3, skew = 0.7;
    const f = faces(0, 0, w, h, top, skew);
    const q = sil(0, 0, w, h, top, skew);
    const bay = (u: number, v: number) => [
      frect(f.left, u, v, 0.15, 0.34, AD, { stroke: W, strokeWidth: 0.55 }),
      fpoly(f.left, [[u + 0.03, v + 0.06], [u + 0.08, v + 0.06], [u + 0.08, v + 0.11], [u + 0.03, v + 0.11]], GREEN),
    ];
    add({
      id: 'storage-array', name: 'Storage Array / SAN', category: 'Compute', prefix: 'san', w, h,
      description: 'Disk shelf / SAN storage array',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        ...[0, 1, 2, 3, 4].flatMap((i) => bay(0.06 + i * 0.18, 0.1)),
        ...[0, 1, 2, 3, 4].flatMap((i) => bay(0.06 + i * 0.18, 0.56)),
        ...[0, 1, 2].map((i) => fline(f.right, [[0.2, 0.3 + i * 0.1], [0.8, 0.3 + i * 0.1]], ALL, 0.9)),
        fpoly(f.right, [[0.3, 0.68], [0.7, 0.68], [0.7, 0.74], [0.3, 0.74]], GREEN),
      ],
      ports: [at('FC1', q.left(0.5), 'fiber', 'left'), at('FC2', q.right(0.5), 'fiber', 'right'), at('MGMT', q.top(), 'ethernet', 'top')],
    });
  }

  return out;
}

export const ISO_MORE_IT_DEFS: DeviceDef[] = build();
