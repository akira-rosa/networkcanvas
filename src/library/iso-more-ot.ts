import type { DeviceDef, Shape } from '../model/types';
import { A, AL, AD, ADD, ALL, OT_FIELDS, P, circ, def, ell, grad, isoBox, isoCyl, line, path, poly, rect } from './draw';
import { faces, frect, fpoly, fline, sil, at, W, NAVY } from './iso';
import type { Pt } from './iso';

// Isometric OT devices, second batch — see docs/ICON_SPEC_MORE.md.
// Same language as iso.ts: blue faces (lighter top, darker side), navy outlines,
// white glyphs drawn in perspective on the faces.

const YEL = '#f5c518'; // safety yellow
const LED = '#7CFC9A';
const RED = '#e5484d';
const SCREEN = '#0b2236';
const G1 = '#e3e6ea', G2 = '#b9bec6', GT = '#f3f5f7', GS = '#7d848e'; // mechanical greys (as robot arm / gripper)

/* ---------- local helpers ---------- */

type F = (u: number, v: number) => Pt;

/** small LED square on a face */
const led = (f: F, u: number, v: number, fill: string, du = 0.06, dv = 0.05) =>
  fpoly(f, [[u, v], [u + du, v], [u + du, v + dv], [u, v + dv]], fill);

/** slope of the iso axes: front axis runs down-right by K, depth axis up-right by K */
const K = 0.28;

/**
 * Box with independent length L (along the front axis), depth D (along the depth axis) and height H;
 * (x0, y0) is the front-bottom-left corner. Unlike isoBox the depth is not coupled to the width,
 * so long thin or short deep parts can be drawn. Returns [front, end, top] faces.
 */
function gbox(x0: number, y0: number, L: number, D: number, H: number, c: { front: string; end: string; top: string; stroke: string }, sw = 0.7): Shape[] {
  const p0: Pt = [x0, y0], p1: Pt = [x0 + L, y0 + L * K], p2: Pt = [p1[0] + D, p1[1] - D * K];
  const up = (p: Pt): Pt => [p[0], p[1] - H];
  const p3 = up(p0), p4 = up(p1), p5 = up(p2), p6: Pt = [p3[0] + D, p3[1] - D * K];
  const o = { stroke: c.stroke, strokeWidth: sw };
  return [poly([p3, p4, p1, p0], c.front, o), poly([p4, p5, p2, p1], c.end, o), poly([p3, p6, p5, p4], c.top, o)];
}
/** face mappers for a gbox: u along the length / depth, v down the face (top face: v = depth, 0 = front) */
function gfaces(x0: number, y0: number, L: number, D: number, H: number) {
  return {
    front: ((u, v) => [x0 + u * L, y0 + u * L * K - H + v * H]) as F,
    end: ((u, v) => [x0 + L + u * D, y0 + L * K - u * D * K - H + v * H]) as F,
    top: ((u, v) => [x0 + u * L + v * D, y0 + u * L * K - v * D * K - H]) as F,
  };
}
const BLUE = { front: A, end: AD, top: AL, stroke: NAVY };
const CAP = { front: AD, end: ADD, top: A, stroke: NAVY }; // darker end caps (cylinder heads)
const GREY = { front: G1, end: G2, top: GT, stroke: GS };

/* ---------- the set ---------- */

function build(): DeviceDef[] {
  const out: DeviceDef[] = [];
  const add = (d: Omit<DeviceDef, 'builtin' | 'accent' | 'fields' | 'style'> & { accent?: string; fields?: DeviceDef['fields'] }) =>
    out.push(def('iso', { fields: OT_FIELDS, ...d }));

  // Industrial PC: fanless box PC with cooling fins across the top
  {
    const w = 54, h = 42, top = 0.34, skew = 0.7;
    const f = faces(0, 0, w, h, top, skew);
    const [px, py] = f.left(0.86, 0.22);
    add({
      id: 'industrial-pc', name: 'Industrial PC', category: 'Industrial', prefix: 'ipc', w, h,
      description: 'Fanless box PC / edge computer',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        // heat-sink fins: grooves running front-to-back across the top face
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => frect(f.top, 0.08, 0.1 + i * 0.095, 0.84, 0.032, NAVY, { opacity: 0.5 })),
        // front: status LEDs, power button, two port slots, drive slot lines
        led(f.left, 0.1, 0.16, LED), led(f.left, 0.19, 0.16, W), led(f.left, 0.28, 0.16, W),
        circ(px, py, 2.1, W), circ(px, py, 0.8, AD),
        ...[0, 1].map((i) => frect(f.left, 0.1 + i * 0.17, 0.58, 0.12, 0.22, SCREEN, { stroke: W, strokeWidth: 0.4 })),
        ...[0, 1, 2].map((i) => fline(f.left, [[0.52, 0.6 + i * 0.09], [0.9, 0.6 + i * 0.09]], W, 1)),
        // side: vent slots
        ...[0, 1, 2].map((i) => fline(f.right, [[0.3 + i * 0.2, 0.18], [0.3 + i * 0.2, 0.5]], W, 0.9, { opacity: 0.85 })),
      ],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('ETH0', q.bottomL(0.55), 'ethernet', 'bottom'), at('ETH1', q.right(0.5), 'ethernet', 'right'), at('USB', q.left(0.5), 'usb', 'left')]; })(),
    });
  }

  // Remote I/O: slim DIN-rail station — interface module + two I/O slices with channel LED rows
  {
    const w = 42, h = 44, top = 0.14, skew = 0.72;
    const f = faces(0, 0, w, h, top, skew);
    const slice = (u0: number, du: number, lit: number[]): Shape[] => [
      ...[0, 1, 2, 3, 4, 5].map((i) => led(f.left, u0 + du * 0.14, 0.2 + i * 0.075, lit.includes(i) ? LED : W, du * 0.3, 0.045)),
      ...[0, 1, 2, 3, 4, 5].map((i) => led(f.left, u0 + du * 0.56, 0.2 + i * 0.075, lit.includes(i + 6) ? LED : W, du * 0.3, 0.045)),
      ...[0, 1].map((i) => frect(f.left, u0 + du * (0.14 + i * 0.42), 0.76, du * 0.3, 0.1, ALL)),
      frect(f.left, u0 + du * 0.1, 0.9, du * 0.8, 0.05, NAVY, { opacity: 0.5 }),
    ];
    add({
      id: 'remote-io', name: 'Remote I/O', category: 'Industrial', prefix: 'rio', w, h,
      description: 'Distributed I/O station (interface module + I/O slices)',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        // interface module: label, bus LEDs, label lines
        frect(f.left, 0.05, 0.06, 0.22, 0.08, W, { opacity: 0.95 }),
        led(f.left, 0.08, 0.2, LED, 0.07, 0.05), led(f.left, 0.08, 0.28, LED, 0.07, 0.05), led(f.left, 0.08, 0.36, W, 0.07, 0.05),
        led(f.left, 0.18, 0.2, W, 0.07, 0.05), led(f.left, 0.18, 0.28, W, 0.07, 0.05),
        fline(f.left, [[0.07, 0.5], [0.25, 0.5]], ALL, 1), fline(f.left, [[0.07, 0.58], [0.21, 0.58]], ALL, 1),
        ...[0, 1].map((i) => frect(f.left, 0.08 + i * 0.1, 0.76, 0.07, 0.1, ALL)),
        // module splits
        fline(f.left, [[0.32, 0.02], [0.32, 0.98]], NAVY, 0.9), fline(f.left, [[0.66, 0.02], [0.66, 0.98]], NAVY, 0.9),
        // I/O slices
        ...slice(0.32, 0.34, [0, 1, 2, 6]),
        ...slice(0.66, 0.34, [0, 1, 6, 7, 8]),
        // side: port LEDs
        led(f.right, 0.25, 0.22, LED, 0.5, 0.05), led(f.right, 0.25, 0.32, W, 0.5, 0.05),
      ],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('X1 P1', q.top(), 'profinet', 'top'), at('X1 P2', q.bottomL(0.5), 'profinet', 'bottom'), at('IO1', q.left(0.45), 'iolink', 'left'), at('IO2', q.right(0.45), 'iolink', 'right')]; })(),
    });
  }

  // Frequency inverter (VFD): tall drive, small display + keypad, fan grille, motor cable stub
  {
    const w = 32, h = 60, top = 0.13, skew = 0.66;
    const bh = h - 6;
    const f = faces(0, 0, w, bh, top, skew);
    const [kx, ky] = f.left(0.8, 0.33);
    const [cx, cy] = f.left(0.5, 0.72);
    const rx = 5.4, ry = 5.9;
    const spoke = (deg: number) => { const a = (deg * Math.PI) / 180; return line([[cx - rx * 0.85 * Math.cos(a), cy - ry * 0.85 * Math.sin(a)], [cx + rx * 0.85 * Math.cos(a), cy + ry * 0.85 * Math.sin(a)]], W, 0.7, { opacity: 0.9 }); };
    add({
      id: 'vfd', name: 'Frequency Inverter (VFD)', category: 'Industrial', prefix: 'vfd', w, h,
      description: 'Variable-frequency drive',
      shapes: [
        rect(12, bh - 2, 4, 8, AD, { stroke: NAVY, strokeWidth: 0.5, name: 'Motor cable' }),
        isoBox(0, 0, w, bh, top, { skew, name: 'Body' }),
        // display with digits
        frect(f.left, 0.14, 0.07, 0.72, 0.13, SCREEN, { stroke: W, strokeWidth: 0.4 }),
        ...[0, 1, 2].map((i) => led(f.left, 0.22 + i * 0.15, 0.105, LED, 0.1, 0.06)),
        // keypad + knob
        ...[0, 1, 2].map((i) => led(f.left, 0.16 + i * 0.15, 0.27, W, 0.1, 0.05)),
        ...[0, 1, 2].map((i) => led(f.left, 0.16 + i * 0.15, 0.36, W, 0.1, 0.05)),
        circ(kx, ky, 2.3, W), circ(kx, ky, 0.9, AD),
        // label lines
        fline(f.left, [[0.16, 0.5], [0.84, 0.5]], ALL, 1), fline(f.left, [[0.16, 0.57], [0.66, 0.57]], ALL, 1),
        // fan grille
        ell(cx - rx, cy - ry, rx * 2, ry * 2, AD, { stroke: W, strokeWidth: 0.6, rotation: 12 }),
        spoke(12), spoke(72), spoke(132), circ(cx, cy, 1.4, W),
        // side: vent slots + LED
        ...[0, 1, 2].map((i) => fline(f.right, [[0.28 + i * 0.22, 0.1], [0.28 + i * 0.22, 0.4]], W, 0.9, { opacity: 0.85 })),
        led(f.right, 0.3, 0.52, LED, 0.4, 0.05),
      ],
      ports: (() => { const q = sil(0, 0, w, bh, top, skew); return [at('X1 P1', q.top(), 'profinet', 'top'), at('X1 P2', q.left(0.5), 'profinet', 'left'), P('MOTOR', 14, h, 'power', 1, 'bottom', 'Motor cable')]; })(),
    });
  }

  // Safety PLC: modular PLC with the yellow safety stripe
  {
    const w = 46, h = 52, top = 0.2, skew = 0.76;
    const f = faces(0, 0, w, h, top, skew);
    add({
      id: 'safety-plc', name: 'Safety PLC', category: 'Industrial', prefix: 'fplc', w, h,
      description: 'Fail-safe PLC (F-CPU with safety I/O)',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        // yellow safety band across the front and side
        frect(f.left, 0, 0.05, 1, 0.1, YEL, { stroke: NAVY, strokeWidth: 0.4 }),
        frect(f.right, 0, 0.05, 1, 0.1, YEL, { stroke: NAVY, strokeWidth: 0.4, opacity: 0.85 }),
        // CPU display + status line
        frect(f.left, 0.08, 0.24, 0.36, 0.22, SCREEN, { stroke: W, strokeWidth: 0.5 }),
        frect(f.left, 0.12, 0.28, 0.28, 0.05, YEL),
        // fail-safe I/O slices with yellow module tabs
        ...[0, 1].map((i) => fline(f.left, [[0.54 + i * 0.22, 0.17], [0.54 + i * 0.22, 0.96]], NAVY, 0.9)),
        ...[0, 1].map((i) => frect(f.left, 0.58 + i * 0.22, 0.24, 0.13, 0.64, ALL, { opacity: 0.9 })),
        ...[0, 1].map((i) => frect(f.left, 0.58 + i * 0.22, 0.24, 0.13, 0.08, YEL)),
        // LEDs + label lines
        led(f.left, 0.12, 0.56, LED), led(f.left, 0.22, 0.56, W), led(f.left, 0.32, 0.56, W),
        fline(f.left, [[0.1, 0.74], [0.44, 0.74]], W, 1), fline(f.left, [[0.1, 0.82], [0.36, 0.82]], W, 1),
      ],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('X1 P1', q.top(), 'profinet', 'top'), at('X1 P2', q.bottomL(0.4), 'profinet', 'bottom'), at('X2', q.right(0.5), 'ethernet', 'right')]; })(),
    });
  }

  // Barcode / code reader: small box with a dark window and a red scan line
  {
    const w = 42, h = 30, top = 0.32, skew = 0.62;
    const f = faces(0, 0, w, h, top, skew);
    const bars: [number, number][] = [[0.2, 1.3], [0.3, 0.6], [0.37, 0.9], [0.48, 1.4], [0.58, 0.6], [0.66, 1.0], [0.76, 0.7]];
    add({
      id: 'barcode-scanner', name: 'Barcode / Code Reader', category: 'Industrial', prefix: 'scn', w, h,
      description: 'Fixed-mount 1D/2D code reader',
      shapes: [
        isoBox(0, 0, w, h, top, { skew, name: 'Body' }),
        // barcode glyph on top
        ...bars.map(([v, sw]) => fline(f.top, [[0.16, v], [0.84, v]], W, sw)),
        // reading window + laser line
        frect(f.left, 0.1, 0.16, 0.58, 0.66, SCREEN, { stroke: W, strokeWidth: 0.5 }),
        fline(f.left, [[0.16, 0.27], [0.5, 0.27]], W, 0.7, { opacity: 0.35 }),
        fline(f.left, [[0.04, 0.5], [0.74, 0.5]], RED, 1.4),
        // status LEDs
        led(f.left, 0.78, 0.22, LED, 0.12, 0.07), led(f.left, 0.78, 0.4, W, 0.12, 0.07), led(f.left, 0.78, 0.58, W, 0.12, 0.07),
      ],
      ports: (() => { const q = sil(0, 0, w, h, top, skew); return [at('ETH', q.bottomL(0.6), 'ethernet', 'bottom'), at('USB', q.right(0.5), 'usb', 'right')]; })(),
    });
  }

  // Sensor (M12): cylindrical proximity sensor lying along the depth axis — sensing face toward the
  // viewer (lower left), threaded barrel with two lock nuts, M12 connector and cable at the back.
  {
    const w = 54, h = 38;
    const nrm = Math.hypot(1, K);
    const ax: Pt = [1 / nrm, -K / nrm]; // along the barrel, away from the viewer
    const nv: Pt = [K / nrm, 1 / nrm]; // across the barrel (down the screen)
    const q = 0.5; // end-ellipse squash
    const rot = -(Math.atan(K) * 180) / Math.PI;
    const c0: Pt = [8, 28.5]; // centre of the sensing face
    /** t along the axis, s across it, u extra along-axis offset */
    const pt = (t: number, s: number, u = 0): Pt => [c0[0] + ax[0] * (t + u) + nv[0] * s, c0[1] + ax[1] * (t + u) + nv[1] * s];
    const cap = (t: number, r: number, fill: string, o: Record<string, unknown> = {}) => { const c = pt(t, 0); return ell(c[0] - r * q, c[1] - r, 2 * r * q, 2 * r, fill, { rotation: rot, ...o }); };
    const tube = (t0: number, t1: number, r: number, fill: string, o: Record<string, unknown> = {}): Shape[] => [
      poly([pt(t0, -r), pt(t1, -r), pt(t1, r), pt(t0, r)], fill, o),
      line([pt(t0, -r), pt(t1, -r)], NAVY, 0.7), line([pt(t0, r), pt(t1, r)], NAVY, 0.7),
    ];
    /** visible (near) half of a ring around the barrel: a thread */
    const ring = (t: number, r: number) =>
      line([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => { const p = Math.PI + (i * Math.PI) / 8; return pt(t, r * Math.cos(p), r * q * Math.sin(p)); }), NAVY, 0.6, { opacity: 0.6 });
    /** hex lock nut: near hexagon + the three visible facets */
    const nut = (t: number, R: number, len: number): Shape[] => {
      const V = (i: number, u = 0): Pt => { const p = (i * Math.PI) / 3; return pt(t, R * Math.cos(p), R * q * Math.sin(p) + u); };
      const fills = [ADD, AD, AL];
      return [
        ...[0, 1, 2].map((i) => poly([V(i), V(i + 1), V(i + 1, len), V(i, len)], fills[i], { stroke: NAVY, strokeWidth: 0.5 })),
        poly([0, 1, 2, 3, 4, 5].map((i) => V(i)), A, { stroke: NAVY, strokeWidth: 0.6 }),
      ];
    };
    const r = 6.3, R = 9.4, NL = 4;
    const [ex, ey] = pt(41, 0);
    const cableTop: Pt = [ex + 4, 0.8];
    add({
      id: 'sensor', name: 'Sensor (M12)', category: 'Industrial', prefix: 'sen', w, h,
      description: 'Proximity / photoelectric sensor, M12 barrel',
      shapes: [
        // cable + M12 connector at the back
        path(`M${ex} ${ey} C ${ex + 3.4} ${ey - 1} ${cableTop[0]} ${ey - 4.5} ${cableTop[0]} ${cableTop[1]}`, 0, 0, w, h, { vb: [0, 0, w, h], stroke: NAVY, strokeWidth: 1.5 }),
        cap(41, 3.6, AD, { stroke: NAVY, strokeWidth: 0.6 }),
        ...tube(34.5, 41, 3.6, AD),
        ring(38, 3.6),
        // barrel, far to near
        cap(34.5, r, AD, { stroke: NAVY, strokeWidth: 0.6 }),
        ...tube(23.5, 34.5, r, A, { gradient: grad(74, AL, AD) }),
        ring(26.5, r), ring(28.8, r), ring(31.1, r),
        circ(...pt(32.6, -4.1), 1.2, LED),
        ...nut(19.5, R, NL),
        ...tube(11, 19.5, r, A, { gradient: grad(74, AL, AD) }),
        ring(13.3, r), ring(15.6, r), ring(17.9, r),
        ...nut(7, R, NL),
        ...tube(0, 7, r, A, { gradient: grad(74, AL, AD) }),
        ring(2.8, r), ring(5.1, r),
        // sensing face
        cap(0, r, AL, { stroke: NAVY, strokeWidth: 0.6, name: 'Sensing face' }),
        cap(0, 4, SCREEN),
      ],
      ports: [P('IO', Math.round(cableTop[0] * 10) / 10, 0, 'iolink', 1, 'top', 'M12 connector')],
    });
  }

  // Actuator / valve: compact pneumatic cylinder — dark end caps, blue barrel with sensor slot,
  // piston rod with rod end, solenoid valve block with M12 plug on top.
  {
    const w = 54, h = 32;
    const D = 13, H = 14, CL = 4, BL = 22, y0 = 23;
    const tY = (t: number) => y0 + t * K;
    const bf = gfaces(CL, tY(CL), BL, D, H);
    const cf = gfaces(CL + BL, tY(CL + BL), CL, D, H);
    // piston rod out of the front end cap, along the front axis
    const a1: Pt = [1 / Math.hypot(1, K), K / Math.hypot(1, K)], n1: Pt = [-a1[1], a1[0]];
    const E = cf.end(0.5, 0.5);
    const rr = 1.8, RL = 11, q = 0.5;
    const rp = (t: number, s: number): Pt => [E[0] + a1[0] * t + n1[0] * s, E[1] + a1[1] * t + n1[1] * s];
    const tip = rp(RL, 0);
    const rotRod = (Math.atan(K) * 180) / Math.PI;
    const EL = 3.2, ED = 3.6, EH = 4.4; // rod end block
    const ec: Pt = [tip[0] + a1[0] * 1.5 - ED / 2, tip[1] + a1[1] * 1.5 + (ED / 2) * K];
    const eP0: Pt = [ec[0] - EL / 2, ec[1] - (EL / 2) * K + EH / 2];
    // valve block on the barrel's top face
    const VL = 10, VD = 7, VH = 6;
    const vP0 = bf.top((BL - VL) / 2 / BL, (D - VD) / 2 / D);
    const vf = gfaces(vP0[0], vP0[1], VL, VD, VH);
    const vc = vf.top(0.5, 0.5);
    const pw = 5, ph = 7, pry = (ph * 0.5) / 2;
    const plugY = vc[1] + pry - ph;
    add({
      id: 'actuator', name: 'Actuator / Valve', category: 'Industrial', prefix: 'act', w, h,
      description: 'Pneumatic cylinder with solenoid valve / position feedback',
      shapes: [
        ...gbox(0, y0, CL, D, H, CAP),
        ...gbox(CL, tY(CL), BL, D, H, BLUE),
        // barrel: sensor slot with position LED, label
        fline(bf.front, [[0.06, 0.3], [0.94, 0.3]], NAVY, 1),
        led(bf.front, 0.72, 0.24, LED, 0.08, 0.12),
        frect(bf.front, 0.1, 0.56, 0.4, 0.14, W, { opacity: 0.95 }),
        frect(bf.front, 0.1, 0.78, 0.26, 0.1, ALL),
        ...gbox(CL + BL, tY(CL + BL), CL, D, H, CAP),
        // tie-rod nuts on the front cap
        ...([[0.25, 0.22], [0.75, 0.22], [0.25, 0.78], [0.75, 0.78]] as Pt[]).map(([u, v]) => circ(...cf.end(u, v), 0.75, W, { opacity: 0.85 })),
        // piston rod + rod end
        poly([rp(0, -rr), rp(RL, -rr), rp(RL, rr), rp(0, rr)], G1, { stroke: GS, strokeWidth: 0.5 }),
        ell(tip[0] - rr * q, tip[1] - rr, rr * 2 * q, rr * 2, G2, { stroke: GS, strokeWidth: 0.5, rotation: rotRod }),
        ...gbox(eP0[0], eP0[1], EL, ED, EH, GREY, 0.6),
        // solenoid valve block + M12 plug
        ...gbox(vP0[0], vP0[1], VL, VD, VH, BLUE),
        frect(vf.front, 0.12, 0.3, 0.5, 0.18, W, { opacity: 0.95 }),
        led(vf.front, 0.72, 0.3, LED, 0.14, 0.2),
        isoCyl(vc[0] - pw / 2, plugY, pw, ph, 0.5, { fill: AD, name: 'M12 plug' }),
      ],
      ports: [P('IO', Math.round(vc[0] * 10) / 10, Math.round(plugY * 10) / 10, 'iolink', 1, 'top', 'Solenoid / position feedback')],
    });
  }

  return out;
}

export const ISO_MORE_OT_DEFS: DeviceDef[] = build();
