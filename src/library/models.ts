import type { DeviceDef, PortMedia, Shape, Side } from '../model/types';
import { circ, def, grad, line, OT_FIELDS, P, path, poly, rect, rrect } from './draw';

// Specific vendor models, drawn in the detailed style.
//
// Each model is a faithful recreation of the user's own flat illustrations. Coordinates are
// authored in the reference drawing's pixel space (x1, y1, x2, y2 corners as measured from the
// reference image) and scaled into the device artboard by `frame(k, ox, oy)`.

type Pt = [number, number];
type Opt = Partial<Shape> & Record<string, unknown>;

function frame(k: number, ox: number, oy: number) {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const X = (v: number) => r2((v - ox) * k);
  const Y = (v: number) => r2((v - oy) * k);
  const L = (v: number) => r2(v * k);
  const so = (o: Opt): Opt => (o.strokeWidth != null ? { ...o, strokeWidth: L(o.strokeWidth as number) } : o);
  return {
    X, Y, L,
    /** rect by corners */
    r: (x1: number, y1: number, x2: number, y2: number, fill: string, o: Opt = {}) =>
      rect(X(x1), Y(y1), L(x2 - x1), L(y2 - y1), fill, so({ ...o, ...(o.radius != null ? { radius: L(o.radius as number) } : {}) })),
    /** rect by corners with per-corner radii [tl, tr, br, bl] */
    rr: (x1: number, y1: number, x2: number, y2: number, radii: [number, number, number, number], fill: string, o: Opt = {}) =>
      rrect(X(x1), Y(y1), L(x2 - x1), L(y2 - y1), radii.map(L) as [number, number, number, number], fill, so(o)),
    c: (cx: number, cy: number, rad: number, fill: string, o: Opt = {}) => circ(X(cx), Y(cy), L(rad), fill, so(o)),
    pg: (pts: Pt[], fill: string, o: Opt = {}) => poly(pts.map(([x, y]) => [X(x), Y(y)] as Pt), fill, so(o)),
    ln: (pts: Pt[], stroke: string, sw: number, o: Opt = {}) => line(pts.map(([x, y]) => [X(x), Y(y)] as Pt), stroke, L(sw), o),
    port: (name: string, x: number, y: number, media: PortMedia, side: Side, desc?: string) => P(name, X(x), Y(y), media, 1, side, desc),
  };
}

/** clip segment a→b to box (Liang–Barsky); null when fully outside */
function clipSeg(a: Pt, b: Pt, x0: number, y0: number, x1: number, y1: number): [Pt, Pt] | null {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const tests: [number, number][] = [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]];
  for (const [p, q] of tests) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}

// ───────────────────────── Dosetec TRAC1000 ─────────────────────────
// Vertical form-fill-seal packaging machine: glazed double doors on a light frame, right-hand
// control cabinet with HMI, push buttons, e-stops and a red cabinet box.
const trac1000 = (() => {
  const k = 0.24;
  const f = frame(k, 0, 0);
  const { r, rr, c, pg } = f;
  const FRAME = '#bcbdcf', DOOR = '#eceef2', BLACK = '#171614', BOLT = '#706d6a', RED = '#ad2521', YEL = '#dcc849';
  const hinge = (x: number, y: number) => r(x, y, x + 10, y + 12, BLACK);
  return def('detailed', {
    id: 'm-dosetec-trac1000', name: 'Dosetec TRAC1000', category: 'Machines', vendor: 'Dosetec', prefix: 'mq',
    description: 'Vertical packaging machine (VFFS)', fields: OT_FIELDS,
    w: f.L(252), h: f.L(276),
    shapes: [
      // lifting bolts and levelling feet
      r(15.5, 1, 20.5, 14, BOLT), r(161.5, 1, 166.5, 14, BOLT),
      r(15.5, 262, 20.5, 271.5, BOLT), r(161.5, 262, 166.5, 271.5, BOLT),
      rr(8.5, 271, 27.5, 275.5, [1, 1, 0.6, 0.6], BLACK), rr(152.5, 271, 172, 275.5, [1, 1, 0.6, 0.6], BLACK),
      // cabinet door hinges / latch on the right side
      r(247, 43.5, 251.5, 64.5, '#cabfb5'), r(247, 179.5, 251.5, 200.5, '#cabfb5'), r(247, 213.5, 251.5, 224.5, '#343331'),
      // frame
      r(0, 13, 248.5, 263.5, FRAME),
      // glazed doors, centre mullion and lower panel
      r(13, 27.5, 168, 263.5, DOOR),
      r(87.5, 27.5, 93, 263.5, FRAME),
      r(49.5, 204.5, 131, 263.5, FRAME),
      // dosing inlet plate on top
      pg([[140, 18], [169, 18], [164, 26], [135, 26]], BOLT),
      // hinges
      hinge(7, 42), hinge(7, 132), hinge(7, 222),
      hinge(164, 42), hinge(164, 132), hinge(164, 222),
      // door handles
      r(78.5, 80.5, 87.5, 145.5, BLACK), r(93.5, 80.5, 103.5, 145.5, BLACK),
      // cabinet split line
      r(181, 13, 186, 263.5, '#9f9da8'),
      // control panel: HMI, buttons, e-stops
      r(188, 19, 245, 100, '#c6c6c8'),
      r(190.5, 20.5, 241, 58.5, '#3b3a39'),
      r(198.5, 24.5, 234.5, 54.5, '#267675'),
      c(198, 67.5, 3.6, '#3b3a39'), c(210, 67.5, 3.6, '#66a76c'), c(222.5, 67.5, 3.4, RED), c(235, 67.5, 3.6, '#5681b8'),
      r(194, 82.5, 207, 95.5, YEL, { radius: 0.8 }), c(200.5, 89, 4.6, RED), r(200, 85, 201.2, 90, '#3d1412'),
      c(231.5, 89, 6.6, YEL), c(231.5, 89, 4.6, RED),
      // switch box and red cabinet box
      r(232, 154.5, 242, 172.5, BLACK),
      r(219.5, 173.5, 241.5, 248.5, RED),
    ],
    ports: [
      f.port('ETH', 251.5, 112, 'ethernet', 'right', 'Control cabinet Ethernet'),
      f.port('X1 P1', 251.5, 145, 'profinet', 'right'),
      f.port('X1 P2', 251.5, 260, 'profinet', 'right'),
    ],
  });
})();

// ───────────────────────── Dell PowerEdge T150 ─────────────────────────
// Mini tower: near-black body, top control strip, hexagon-backed vertical grille, two feet.
const dellT150 = (() => {
  const k = 0.24, ox = 176, oy = 116;
  const f = frame(k, ox, oy);
  const { r, rr, c } = f;
  const W = f.L(154), H = f.L(268.5);
  // honeycomb behind the grille slots (flat-top hexes, side 17.3, measured from the drawing)
  const gx0 = 186.5, gy0 = 150, gx1 = 318.5, gy1 = 367;
  const s = 17.32, hh = 30, segs: [Pt, Pt][] = [];
  for (let n = -2; n <= 5; n++) {
    const cx = 216 + 26 * n;
    const y0 = 163 + (Math.abs(n) % 2 ? 15 : 0) - 60;
    for (let yt = y0; yt < gy1 + hh; yt += hh) {
      segs.push([[cx - s / 2, yt], [cx + s / 2, yt]]);
      segs.push([[cx + s / 2, yt], [cx + s, yt + hh / 2]], [[cx + s, yt + hh / 2], [cx + s / 2, yt + hh]]);
      segs.push([[cx - s / 2, yt], [cx - s, yt + hh / 2]], [[cx - s, yt + hh / 2], [cx - s / 2, yt + hh]]);
    }
  }
  const d = segs
    .map(([a, b]) => clipSeg(a, b, gx0, gy0, gx1, gy1))
    .filter((v): v is [Pt, Pt] => !!v)
    .map(([a, b]) => `M${f.X(a[0])} ${f.Y(a[1])}L${f.X(b[0])} ${f.Y(b[1])}`)
    .join('');
  const bars: [number, number][] = [
    [191.6, 195], [201.6, 205.6], [212.5, 216.4], [223.2, 227.4], [234.6, 238.2], [245.2, 249],
    [256, 260.2], [266.6, 270.6], [277.6, 281.6], [288.4, 292.6], [299.6, 303], [310, 314],
  ];
  return def('detailed', {
    id: 'm-dell-t150', name: 'Dell PowerEdge T150', category: 'Compute', vendor: 'Dell', prefix: 'srv',
    description: 'Mini-tower server',
    w: W, h: H,
    shapes: [
      // feet
      r(188.5, 378, 204.5, 384.5, '#0a0a0a'), r(300.5, 378, 317, 384.5, '#0a0a0a'),
      // body, right side cheek, bottom lip
      r(176.5, 116.5, 329.5, 380, '#363636', { radius: 1.2 }),
      r(325.8, 116.5, 329.5, 380, '#494949', { radius: 0.8 }),
      r(176.5, 376.5, 329.5, 380, '#363636', { gradient: grad(90, '#3f3f3f', '#5f5f5f') }),
      // top strip: power button LED, status bar, USB-A, USB-C
      r(191, 121, 200.5, 129.5, '#545454'), c(195.7, 125.5, 2.9, '#35ee57'),
      r(234.5, 120, 270.5, 128, '#545454'), r(238.5, 123.5, 266, 127, '#2f59a9'),
      r(282, 122.5, 297, 131, '#bdbdbd'), r(283.5, 124, 295.5, 129.5, '#2f2f2f'),
      rr(302, 124.3, 313, 129.7, [2.7, 2.7, 2.7, 2.7], '#2f2f2f', { stroke: '#6c6c6c', strokeWidth: 0.9 }),
      // bezel strip
      r(191.5, 134, 313.5, 145, '#454545'), r(192.5, 135, 312.5, 144, '#545454'),
      // grille: frame, dark field, honeycomb, vertical bars
      r(185.5, 148, 319.5, 371, '#494949'),
      r(gx0, gy0, gx1, gy1, '#0f0f0f'),
      path(d, 0, 0, W, H, { vb: [0, 0, W, H], stroke: '#2c2c2c', strokeWidth: f.L(2), fill: 'none' }),
      ...bars.map(([a, b]) => r(a, gy0, b, gy1, '#494949')),
      // white label tab
      r(205.5, 173.5, 234.5, 182.5, '#d1d1d1'),
      // subtle light edge so the tower separates from dark canvases
      r(176.5, 116.5, 329.5, 380, 'none', { radius: 1.2, stroke: '#5e5e5e', strokeWidth: 1.6 }),
    ],
    ports: [
      f.port('ETH0', 176.5, 235, 'ethernet', 'left'),
      f.port('ETH1', 329.5, 235, 'ethernet', 'right'),
      f.port('iDRAC', 329.5, 300, 'ethernet', 'right', 'iDRAC management'),
      f.port('USB', 289.5, 116.5, 'usb', 'top'),
    ],
  });
})();

// ───────────────────────── Keyence MD-X2520A ─────────────────────────
// 3-axis hybrid laser marker head: black body, silver bevels forming an hourglass front,
// white label bar and amber indicator strip.
const keyenceMdx = (() => {
  const k = 0.235, ox = 187, oy = 113;
  const f = frame(k, ox, oy);
  const { r, pg } = f;
  const BEVEL = '#b8b8b8';
  return def('detailed', {
    id: 'm-keyence-mdx2520a', name: 'Keyence MD-X2520A', category: 'Industrial', vendor: 'Keyence', prefix: 'lsr',
    description: 'Laser marker head', fields: OT_FIELDS,
    w: f.L(162.5), h: f.L(255),
    shapes: [
      // body / side panels
      r(187.5, 114.3, 349.5, 368, '#464646'),
      r(188, 113, 212.5, 114.5, '#404040'), r(256, 113, 281.5, 114.5, '#404040'), r(324, 113, 349, 114.5, '#404040'),
      // upper front face
      pg([[190, 114.3], [347, 114.3], [312.5, 280], [224.5, 280]], '#252525'),
      // lower angled panels and centre
      pg([[224.5, 280], [312.5, 280], [347, 368], [190, 368]], '#000000'),
      pg([[226, 280.5], [311, 280.5], [301, 368], [236, 368]], '#1f1f1f'),
      // silver bevels
      pg([[188, 114.3], [191.2, 114.3], [226.3, 280], [191.6, 368], [188.4, 368], [223.1, 280]], BEVEL),
      pg([[345.8, 114.3], [349, 114.3], [314, 280], [348.6, 368], [345.4, 368], [310.8, 280]], BEVEL),
      // label bar and amber status strip
      r(244, 248.5, 293.5, 262, '#e8eef4'),
      r(235.5, 275.5, 302.5, 284.5, '#ffd86b'),
      // subtle light edge for dark canvases
      r(187.5, 114.3, 349.5, 368, 'none', { stroke: '#6e6e6e', strokeWidth: 1.6 }),
    ],
    ports: [
      f.port('ETH', 349.5, 165, 'ethernet', 'right'),
      f.port('I/O', 187.5, 165, 'serial', 'left'),
    ],
  });
})();

// ───────────────────────── Siemens S7-1500C ─────────────────────────
// Compact CPU (display window + keypad) with three I/O modules.
const SLATE = '#617485', SLATE_D = '#475462', SLATE_K = '#52616f', TEAL = '#128486', WINDOW = '#9fbed6';

const s71500c = (() => {
  const k = 0.22, ox = 87, oy = 149;
  const f = frame(k, ox, oy);
  const { r, pg } = f;
  const KEY = '#455063';
  const recess = (x1: number, x2: number, i1: number, i2: number) => [r(x1, 149.5, x2, 166.5, SLATE_D), r(i1, 149.5, i2, 160, SLATE)];
  const module = (x1: number, x2: number, w1: number, w2: number) => [
    ...recess(x1 + 1.5, x1 + 38.5, x1 + 9.5, x1 + 31),
    r(w1, 176, w2, 388, WINDOW),
    pg([[x1 + 2, 403.5], [x1 + 26, 394], [x2, 394], [x2, 403.5]], SLATE_K),
  ];
  return def('detailed', {
    id: 'm-siemens-s7-1500c', name: 'Siemens S7-1500C', category: 'Industrial', vendor: 'Siemens', prefix: 'plc',
    description: 'Compact CPU with I/O modules', fields: OT_FIELDS,
    w: f.L(273.5), h: f.L(254.5),
    shapes: [
      r(87, 149.5, 360.5, 403.5, SLATE),
      // CPU: top recess with LEDs, display window, keypad, bottom bevel
      ...recess(101, 155.5, 108.5, 147.5),
      r(112, 152.5, 116.5, 157, '#35ee57'), r(119, 152.5, 123, 157, '#d9d9d9'), r(126, 152.5, 130, 157, '#d9d9d9'),
      r(96, 173.5, 160.5, 272.5, '#384152'),
      r(109.5, 180, 147.5, 188.5, TEAL),
      r(106, 194.5, 150.5, 261, '#434e61'),
      r(102.5, 295, 154.5, 371, '#536274'),
      r(121.5, 303.5, 136, 317, KEY), r(121.5, 333.5, 136, 347, KEY),
      r(105.5, 318.5, 119.5, 332, KEY), r(136.5, 318.5, 150, 332, KEY),
      r(106.5, 355.5, 117.5, 365.5, KEY), r(138.5, 355.5, 149.5, 365.5, KEY),
      pg([[106, 403.5], [133, 394], [168, 394], [168, 403.5]], SLATE_K),
      // module separators
      r(168, 149.5, 177, 403.5, SLATE_D), r(230.5, 149.5, 239.5, 403.5, SLATE_D),
      r(293.5, 149.5, 302, 403.5, SLATE_D), r(356, 149.5, 360.5, 403.5, SLATE_D),
      // I/O modules
      ...module(184, 230.5, 188, 219.5),
      ...module(246, 293.5, 251, 282),
      ...module(309, 356, 313, 344.5),
    ],
    ports: [
      f.port('X1 P1', 87, 300, 'profinet', 'left'),
      f.port('X1 P2', 87, 345, 'profinet', 'left'),
      f.port('X2 P1', 130, 403.5, 'profinet', 'bottom'),
    ],
  });
})();

// ───────────────────────── Siemens IOT2050 ─────────────────────────
// Narrow IoT gateway: 2× RJ45, 2× USB, DisplayPort, COM (DB9) and power plug.
const iot2050 = (() => {
  const k = 0.225, ox = 581, oy = 149;
  const f = frame(k, ox, oy);
  const { r, rr, c, pg } = f;
  const PORT = '#2f2f2f', FR = '#d9d9d9', LED = '#747474';
  return def('detailed', {
    id: 'm-siemens-iot2050', name: 'Siemens IOT2050', category: 'IoT', vendor: 'Siemens', prefix: 'gt',
    description: 'Industrial IoT gateway',
    w: f.L(80.5), h: f.L(255),
    shapes: [
      r(581, 149.5, 661.5, 404, SLATE),
      // left side strip with LEDs and slots
      r(581, 149.5, 594.5, 404, SLATE_D),
      r(581, 199.5, 589.5, 205, '#35ee57'),
      r(581, 213.5, 589.5, 218.3, LED), r(581, 226.5, 589.5, 231.5, LED), r(581, 239.8, 589.5, 244.5, LED),
      r(589.5, 270.5, 594, 282, '#384152'), r(589.5, 380.5, 594, 392.5, '#384152'),
      // label and screws
      r(604.5, 158.5, 642.8, 167, TEAL),
      c(604.7, 189.3, 5.6, '#384152'), c(604.7, 189.3, 2.9, '#60544b'),
      c(604.7, 260.3, 5.6, '#384152'), c(604.7, 260.3, 2.9, '#60544b'),
      // 2× RJ45 (X30 P1 / P2)
      r(619.3, 174.2, 650.5, 240, FR),
      r(624.5, 179.5, 645, 204.3, PORT), r(624.5, 210.3, 645, 235.3, PORT),
      // 2× USB
      r(619.3, 248.3, 650.5, 278.5, FR),
      r(621.5, 251.5, 632.3, 276, PORT), r(637.7, 251.5, 648.3, 276, PORT),
      // DisplayPort
      pg([[620.3, 293.5], [624.5, 289], [631.7, 289], [631.7, 323.3], [620.3, 323.3]], PORT, { stroke: '#b4b7b9', strokeWidth: 1 }),
      // COM (DB9) with screws
      c(627, 331, 2.1, FR), c(627, 367, 2.1, FR),
      rr(618.5, 334.5, 635, 363.5, [7, 7, 5, 5], PORT, { stroke: '#b4b7b9', strokeWidth: 1 }),
      // power plug
      r(619.3, 373.5, 634.3, 397, PORT),
      r(620.7, 375, 627, 395.6, '#080808'),
      rr(620.7, 375, 632.8, 385.2, [0, 4.6, 4.6, 0], '#080808'),
      rr(620.7, 385.8, 632.8, 395.6, [0, 4.6, 4.6, 0], '#080808'),
    ],
    ports: [
      f.port('X30 P1', 661.5, 185, 'ethernet', 'right'),
      f.port('X30 P2', 661.5, 228, 'ethernet', 'right'),
      f.port('USB', 581, 263.5, 'usb', 'left'),
      f.port('COM', 661.5, 349, 'serial', 'right'),
    ],
  });
})();

// ───────────────────────── Siemens S7-1200 ─────────────────────────
// Compact CPU: slate housing, teal label, two terminal-cover bands with I/O LED rows.
const s71200 = (() => {
  const k = 0.22, ox = 920.5, oy = 149.5;
  const f = frame(k, ox, oy);
  const { r, pg } = f;
  const HL = '#9daab7', BAND = '#45525f', DIV = '#3d3d3d', WLED = '#d9d9d9';
  const ledRow = (y1: number, y2: number) => [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => r(1083.3 + 7.5 * i, y1, 1087.6 + 7.5 * i, y2, WLED)),
    ...[0, 1, 2, 3, 4].map((i) => r(1152.3 + 7.5 * i, y1, 1156.6 + 7.5 * i, y2, WLED)),
  ];
  return def('detailed', {
    id: 'm-siemens-s7-1200', name: 'Siemens S7-1200', category: 'Industrial', vendor: 'Siemens', prefix: 'plc',
    description: 'Compact PLC CPU', fields: OT_FIELDS,
    w: f.L(281), h: f.L(253.5),
    shapes: [
      r(920.5, 149.5, 1201.5, 400, SLATE),
      // top chamfer band and teal label
      pg([[920.5, 149.5], [1141.5, 149.5], [1113, 159.5], [920.5, 159.5]], SLATE_K),
      r(935, 169.5, 983.5, 181.5, TEAL),
      // upper terminal cover
      r(920.5, 232.5, 1201.5, 235.7, HL),
      r(920.5, 243.5, 1201.5, 249.5, BAND),
      // lower terminal cover
      r(920.5, 303.3, 1201.5, 306.5, HL),
      r(920.5, 314.5, 1201.5, 320.5, BAND),
      // cover dividers
      r(981.8, 232.5, 984.2, 320.5, DIV), r(1064.8, 232.5, 1067.2, 320.5, DIV),
      // status + I/O LEDs
      r(935, 237.8, 939.5, 242.5, '#35ee57'), r(942.5, 237.8, 947, 242.5, WLED), r(950, 237.8, 954.5, 242.5, WLED),
      ...ledRow(237.8, 242.5),
      ...ledRow(308.8, 313.5),
      // bottom chamfer and base edge
      pg([[987, 400], [1009, 392], [1201.5, 392], [1201.5, 400]], SLATE_K),
      r(920.5, 399.8, 1201.5, 403, '#15191c'),
    ],
    ports: [
      f.port('X1 P1', 950, 403, 'profinet', 'bottom'),
      f.port('X1 P2', 1010, 403, 'profinet', 'bottom'),
    ],
  });
})();

export const MODEL_DEFS: DeviceDef[] = [trac1000, dellT150, keyenceMdx, s71500c, iot2050, s71200];
