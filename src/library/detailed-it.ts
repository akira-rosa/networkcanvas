import type { DeviceDef, Shape } from '../model/types';
import { P, circ, def, ell, grad, line, path, poly, rect, repeat, rrect } from './draw';

// Detailed (front-view illustration) style — IT / network devices.
// Flat orthographic front views, real product colours, small believable details.
// Lighting: light from above (highlight strip on top edges, darker lip at the bottom).

// ── palette ──
const K = {
  dk: '#2d3135', // anthracite body
  dkHi: '#454b52', // top highlight on dark bodies
  dkEdge: '#5a6169', // lighter rim so dark gear separates from a dark canvas
  dkLo: '#1c1f22',
  panel: '#212427',
  hole: '#0b0c0d',
  frame: '#8a9198', // RJ45 metal shield
  metal: '#b4bac0',
  metalHi: '#d7dbdf',
  metalLo: '#7c838a',
  green: '#3ee07c',
  amber: '#f5a524',
  blue: '#45a2ff',
  off: '#3b4147',
  wh: '#f3f4f5',
  whLo: '#d9dde1',
  grey: '#c4c9ce',
  greyLo: '#9ba2a9',
  tag: '#cfd4d9',
  screen: grad(90, '#2f78c4', '#173a69'),
};

// ── small parts ──
/** RJ45 jack: metal shield, black opening, latch slot (down by default) */
const rj45 = (x: number, y: number, w = 4.6, h = 3.8, up = false, frame = K.frame): Shape[] => {
  const tab = h * 0.3;
  return [
    rect(x, y, w, h, frame, { radius: 0.35 }),
    rect(x + 0.5, y + (up ? 0.5 + tab : 0.5), w - 1, h - 1 - tab, K.hole),
    rect(x + w * 0.3, y + (up ? 0.5 : h - 0.5 - tab), w * 0.4, tab + 0.02, K.hole),
  ];
};

/** SFP cage, optionally with a module (pull tab) inserted */
const sfp = (x: number, y: number, w = 6.4, h = 3.2, module?: string): Shape[] => [
  rect(x, y, w, h, K.metalLo, { radius: 0.3 }),
  rect(x + 0.2, y + 0.2, w - 0.4, 0.5, K.metalHi),
  rect(x + 0.5, y + 0.8, w - 1, h - 1.3, module ? '#9aa1a8' : K.hole),
  ...(module ? [rect(x + 0.9, y + 1.2, w - 1.8, h - 2.1, module, { radius: 0.2 })] : []),
];

const led = (cx: number, cy: number, c: string, r = 0.55, glow = true): Shape[] =>
  c === K.off || !glow ? [circ(cx, cy, r, c)] : [circ(cx, cy, r * 2, c, { opacity: 0.22 }), circ(cx, cy, r, c)];

const screw = (cx: number, cy: number, r = 0.8, c = K.metal): Shape[] => [
  circ(cx, cy, r, c),
  rect(cx - r * 0.65, cy - r * 0.15, r * 1.3, r * 0.3, K.metalLo),
];

/** 19" rack ears with oblong mounting holes, full height h, outer width W */
const rackEars = (W: number, h: number, ew = 5.5): Shape[] => {
  const holes = h > 30 ? [h * 0.18, h * 0.82] : [h * 0.22, h * 0.78];
  const ear = (x: number, r: [number, number, number, number]) => [
    rrect(x, 0.5, ew, h - 1, r, '', { gradient: grad(0, K.metalHi, K.metalLo) }),
    ...holes.map((hy) => rrect(x + ew / 2 - 1.1, hy - 1.7, 2.2, 3.4, [1.1, 1.1, 1.1, 1.1], '#3d4248')),
  ];
  return [...ear(0, [1, 0, 0, 1]), ...ear(W - ew, [0, 1, 1, 0])];
};

/** dark rack chassis between the ears with lighter rim + top highlight */
const chassis = (x: number, w: number, h: number, body = K.dk): Shape[] => [
  rect(x - 0.5, 0, w + 1, h, K.dkEdge, { radius: 1.2 }),
  rect(x, 0.6, w, h - 1.2, body, { radius: 0.9 }),
  rect(x + 0.6, 0.9, w - 1.2, 0.9, K.dkHi, { radius: 0.4 }),
  rect(x + 0.6, h - 1.8, w - 1.2, 0.8, K.dkLo, { radius: 0.4 }),
];

/** vent slots */
const vents = (x: number, y: number, w: number, h: number, n: number, c = K.dkLo): Shape[] => {
  const step = w / n;
  return repeat(n, (i) => rect(x + i * step + step * 0.25, y, step * 0.5, h, c, { radius: step * 0.25 }));
};

/** label bar (silk-screen text as a plain bar) */
const bar = (x: number, y: number, w: number, c = '#aab1b8', o = 0.55) => rect(x, y, w, 0.55, c, { opacity: o, radius: 0.25 });

// ─────────────────────────────────────────────────────────────────────────────

const switch1u = def('detailed', {
  id: 'd-switch', name: 'Switch', category: 'Network', prefix: 'sw', w: 88, h: 24,
  description: '1U rack access switch',
  shapes: [
    ...chassis(4.5, 79, 24),
    ...rackEars(88, 24),
    // status panel
    ...led(9.5, 6.5, K.green), bar(11, 6.2, 3),
    ...led(9.5, 9.5, K.green), bar(11, 9.2, 3),
    ...led(9.5, 12.5, K.amber, 0.55, false), bar(11, 12.2, 3),
    ...rj45(8.2, 15.4, 4.6, 3.8, false, '#4f88b8'), // console
    line([[17.5, 4], [17.5, 20]], '#3e444a', 0.5),
    // 2 × 6 RJ45 in two groups, link LEDs above / below
    ...repeat(6, (i) => {
      const x = 20 + i * 5.4 + (i > 2 ? 2 : 0);
      const lit = [0, 1, 2, 4].includes(i);
      return [
        rect(x + 0.6, 3.6, 1.4, 0.8, lit ? K.green : K.off, { radius: 0.2 }),
        rect(x + 2.6, 3.6, 1.4, 0.8, i === 1 ? K.amber : K.off, { radius: 0.2 }),
        ...rj45(x, 5.6, 4.6, 3.8, true),
        ...rj45(x, 10.2, 4.6, 3.8, false),
        rect(x + 0.6, 15.4, 1.4, 0.8, [0, 2, 3].includes(i) ? K.green : K.off, { radius: 0.2 }),
      ];
    }),
    bar(20, 18.2, 31, '#aab1b8', 0.35),
    // SFP uplinks
    line([[54.5, 4], [54.5, 20]], '#3e444a', 0.5),
    ...sfp(57, 5.6, 7.2, 3.8, '#3b7fd1'),
    ...sfp(57, 10.6, 7.2, 3.8),
    ...led(66.4, 7.5, K.green, 0.45), ...led(66.4, 12.5, K.off, 0.45),
    bar(57, 16, 7.2, '#aab1b8', 0.35),
    // vent
    ...vents(69, 5, 12, 13, 6),
  ],
  ports: [
    P('P1', 16, 0, 'ethernet', 1, 'top'), P('P3', 30, 0, 'ethernet', 1, 'top'), P('P5', 44, 0, 'ethernet', 1, 'top'), P('P7', 58, 0, 'ethernet', 1, 'top'),
    P('P2', 23, 24, 'ethernet', 1, 'bottom'), P('P4', 37, 24, 'ethernet', 1, 'bottom'), P('P6', 51, 24, 'ethernet', 1, 'bottom'), P('P8', 65, 24, 'ethernet', 1, 'bottom'),
    P('SFP1', 88, 7, 'sfp', 1, 'right'), P('SFP2', 88, 17, 'sfp', 1, 'right'),
  ],
});

const switchL3 = def('detailed', {
  id: 'd-switch-l3', name: 'Layer 3 Switch', category: 'Network', prefix: 'sw', w: 88, h: 38,
  description: '2U core / multilayer switch, SFP+ uplinks',
  shapes: [
    ...chassis(4.5, 79, 38),
    ...rackEars(88, 38),
    // status / management panel
    ...led(9.5, 6.5, K.green), bar(11, 6.2, 3.5),
    ...led(9.5, 9.5, K.green), bar(11, 9.2, 3.5),
    ...led(9.5, 12.5, K.green), bar(11, 12.2, 3.5),
    ...led(9.5, 15.5, K.off), bar(11, 15.2, 3.5),
    ...rj45(8.2, 21.5, 4.6, 3.8, false, '#4f88b8'),
    ...rj45(8.2, 27, 4.6, 3.8),
    line([[17.5, 4], [17.5, 34]], '#3e444a', 0.5),
    // 2 × 8 SFP+ cages (belly to belly)
    ...repeat(8, (i) => {
      const x = 20.5 + i * 6.1 + (i > 3 ? 1.4 : 0);
      const mod = [0, 1, 2, 5].includes(i);
      return [
        ...sfp(x, 4.4, 5.5, 3.6, mod ? '#3b7fd1' : undefined),
        ...sfp(x, 8.4, 5.5, 3.6, i === 0 || i === 4 ? '#3b7fd1' : undefined),
        rect(x + 0.9, 12.8, 1.4, 0.7, mod ? K.green : K.off, { radius: 0.2 }),
        rect(x + 3.2, 12.8, 1.4, 0.7, i === 0 || i === 4 ? K.green : K.off, { radius: 0.2 }),
      ];
    }),
    rect(20, 16, 49.5, 0.5, '#3e444a'),
    // 2 × 4 RJ45 copper
    ...repeat(4, (i) => {
      const x = 20.5 + i * 5.4;
      return [
        ...rj45(x, 19.8, 4.6, 3.8, true),
        ...rj45(x, 24.4, 4.6, 3.8),
        rect(x + 1.6, 29.2, 1.4, 0.7, i < 3 ? K.green : K.off, { radius: 0.2 }),
      ];
    }),
    // 2 × 2 QSFP uplinks
    ...repeat(2, (i) => [
      ...sfp(44.5 + i * 12.2, 19.8, 11, 4.2, i === 0 ? '#2fae6a' : undefined),
      ...sfp(44.5 + i * 12.2, 24.8, 11, 4.2),
    ]),
    bar(44.5, 30.2, 23.2, '#aab1b8', 0.35),
    // fan grille
    line([[71, 4], [71, 34]], '#3e444a', 0.5),
    ...vents(72.5, 4.4, 9, 29, 4),
  ],
  ports: [
    P('P0.1', 18, 0, 'ethernet', 1, 'top'), P('P0.3', 36, 0, 'ethernet', 1, 'top'), P('P0.5', 54, 0, 'ethernet', 1, 'top'), P('P0.7', 72, 0, 'ethernet', 1, 'top'),
    P('P0.2', 18, 38, 'ethernet', 1, 'bottom'), P('P0.4', 36, 38, 'ethernet', 1, 'bottom'), P('P0.6', 54, 38, 'ethernet', 1, 'bottom'), P('P0.8', 72, 38, 'ethernet', 1, 'bottom'),
    P('SFP1', 88, 12, 'sfp', 1, 'right'), P('SFP2', 88, 26, 'sfp', 1, 'right'),
  ],
});

const router = def('detailed', {
  id: 'd-router', name: 'Router', category: 'Network', prefix: 'rt', w: 80, h: 30,
  description: 'Enterprise branch router (rack / desktop)',
  shapes: [
    ...chassis(4.5, 71, 30),
    ...rackEars(80, 30),
    // status + USB
    ...led(9.5, 6, K.green), bar(11, 5.7, 3),
    ...led(9.5, 9, K.green), bar(11, 8.7, 3),
    ...led(9.5, 12, K.amber, 0.55, false), bar(11, 11.7, 3),
    rect(8, 17, 5, 2, K.metalLo, { radius: 0.3 }), rect(8.6, 17.6, 3.8, 0.8, K.hole),
    rrect(8.4, 22, 4, 4, [2, 2, 2, 2], '#3a4046'), circ(10.4, 24, 1.1, K.green, { opacity: 0.85 }),
    // interface module slots: one populated, one blank, wide slot below
    rect(17, 3.4, 15, 11, '#3a4046', { radius: 0.6 }), rect(17.5, 3.9, 14, 10, '#33383d', { radius: 0.4 }),
    ...rj45(19.2, 6.2, 4.4, 3.6), ...rj45(25, 6.2, 4.4, 3.6),
    ...screw(18.6, 12.6, 0.55), ...screw(30, 12.6, 0.55),
    rect(33.5, 3.4, 15, 11, '#3a4046', { radius: 0.6 }), rect(34, 3.9, 14, 10, '#33383d', { radius: 0.4 }),
    ...vents(36, 6, 10, 4.5, 5, '#24272a'),
    ...screw(35.1, 12.6, 0.55), ...screw(46.5, 12.6, 0.55),
    rect(17, 16, 31.5, 10.6, '#3a4046', { radius: 0.6 }), rect(17.5, 16.5, 30.5, 9.6, '#33383d', { radius: 0.4 }),
    ...vents(21, 19, 23.5, 4, 10, '#24272a'),
    ...screw(18.9, 24.6, 0.55), ...screw(46.6, 24.6, 0.55),
    // onboard GE: WAN (yellow) + 5 LAN
    line([[51.5, 4], [51.5, 26]], '#3e444a', 0.5),
    ...rj45(54, 5.5, 4.6, 3.8, true, '#d4b23f'),
    ...rj45(59.6, 5.5, 4.6, 3.8, true), ...rj45(65.2, 5.5, 4.6, 3.8, true),
    ...rj45(54, 10.2, 4.6, 3.8), ...rj45(59.6, 10.2, 4.6, 3.8), ...rj45(65.2, 10.2, 4.6, 3.8),
    ...repeat(3, (i) => rect(55.6 + i * 5.6, 15, 1.4, 0.7, i < 2 ? K.green : K.off, { radius: 0.2 })),
    ...sfp(54, 18.2, 6.4, 3.4),
    ...rj45(62, 18, 4.6, 3.8, false, '#4f88b8'),
    bar(54, 23.6, 15.8, '#aab1b8', 0.35),
  ],
  ports: [
    P('WAN', 56, 0, 'ethernet', 1, 'top'),
    P('P1', 0, 15, 'ethernet', 1, 'left'),
    P('P2', 20, 30, 'ethernet', 1, 'bottom'), P('P3', 40, 30, 'ethernet', 1, 'bottom'), P('P4', 60, 30, 'ethernet', 1, 'bottom'),
    P('P5', 80, 15, 'ethernet', 1, 'right'),
  ],
});

const routerIndustrial = def('detailed', {
  id: 'd-router-industrial', name: 'Industrial Router', category: 'Network', prefix: 'rt', w: 44, h: 60,
  description: 'DIN-rail industrial router with screw terminals',
  shapes: [
    // housing: grey with darker side cheeks
    rect(1, 5, 42, 50, '#8e979f', { radius: 1.6 }),
    rect(1.6, 5.6, 40.8, 48.8, '#c9ced3', { radius: 1.2 }),
    rect(1.6, 5.6, 4, 48.8, '#b2b9bf', { radius: 1.2 }),
    rect(38.4, 5.6, 4, 48.8, '#b2b9bf', { radius: 1.2 }),
    rect(5.6, 5.6, 32.8, 1, '#e3e6e9'),
    // top terminal block (power)
    rect(9, 0, 26, 8.5, '#2f7d3f', { radius: 0.8 }),
    rect(9.5, 0.5, 25, 3.2, '#3fa052', { radius: 0.5 }),
    ...repeat(4, (i) => [
      rect(11 + i * 6, 4.6, 4, 3, '#1d4f28', { radius: 0.4 }),
      ...screw(13 + i * 6, 2.1, 1.1, '#cfd4d8'),
    ]),
    // front panel
    rect(7, 10.5, 30, 40, '#4a535b', { radius: 0.9 }),
    rect(7, 10.5, 30, 2.2, '#3fa052', { radius: 0.9 }),
    rect(7, 11.6, 30, 1.1, '#3fa052'),
    // LEDs
    ...led(10.5, 16, K.green, 0.6), bar(12.2, 15.7, 4, '#d5d9dd', 0.6),
    ...led(10.5, 19, K.green, 0.6), bar(12.2, 18.7, 4, '#d5d9dd', 0.6),
    ...led(24, 16, K.amber, 0.6), bar(25.7, 15.7, 4, '#d5d9dd', 0.6),
    ...led(24, 19, K.off, 0.6), bar(25.7, 18.7, 4, '#d5d9dd', 0.6),
    // 2 × 3 RJ45 (WAN first)
    ...rj45(10, 22.5, 9.4, 7, false, '#d4b23f'),
    ...rj45(24.6, 22.5, 9.4, 7),
    ...rj45(10, 31.5, 9.4, 7), ...rj45(24.6, 31.5, 9.4, 7),
    ...rj45(10, 40.5, 9.4, 7), ...rj45(24.6, 40.5, 9.4, 7),
    // bottom terminal block (I/O)
    rect(9, 51.5, 26, 8.5, '#2f7d3f', { radius: 0.8 }),
    rect(9.5, 56.3, 25, 3.2, '#3fa052', { radius: 0.5 }),
    ...repeat(4, (i) => [
      rect(11 + i * 6, 52.4, 4, 3, '#1d4f28', { radius: 0.4 }),
      ...screw(13 + i * 6, 57.9, 1.1, '#cfd4d8'),
    ]),
    // housing release clips
    rect(19, 54.3, 6, 1.2, '#8e979f', { radius: 0.4 }),
  ],
  ports: [
    P('WAN', 0, 26, 'ethernet', 1, 'left'),
    P('P1', 44, 26, 'ethernet', 1, 'right'),
    P('P2', 0, 39, 'ethernet', 1, 'left'),
    P('P3', 44, 39, 'ethernet', 1, 'right'),
    P('P4', 4, 55, 'ethernet', 1, 'bottom'),
    P('P5', 40, 55, 'ethernet', 1, 'bottom'),
  ],
});

/** antenna hinged at its base (rotation is around the shape centre, so shift to keep the foot in place) */
const antenna = (cx: number, top: number, base: number, rot = 0): Shape[] => {
  const L = base - top, a = (rot * Math.PI) / 180;
  const dx = (L / 2) * Math.sin(a), dy = (L / 2) * (1 - Math.cos(a));
  return [
    rrect(cx - 1.8 + dx, top + dy, 3.6, L, [1.8, 1.8, 0.6, 0.6], '', { gradient: grad(0, '#5c636b', '#363b41'), rotation: rot }),
    rect(cx - 2.4, base - 1, 4.8, 3.2, '#2f3337', { radius: 0.8 }),
  ];
};

const routerWireless = def('detailed', {
  id: 'd-router-wireless', name: 'Commercial / Wi-Fi Router', category: 'Network', prefix: 'rt', w: 64, h: 44,
  description: 'Wi-Fi router with external antennas',
  shapes: [
    ...antenna(9, 4, 26, -8),
    ...antenna(22, 1, 26),
    ...antenna(42, 1, 26),
    ...antenna(55, 4, 26, 8),
    // body
    rect(3, 25, 58, 16, '#a8afb6', { radius: 3.5 }),
    rect(3.5, 25.4, 57, 15.2, '', { radius: 3.2, gradient: grad(90, '#ffffff', '#dfe3e7') }),
    rect(7, 26.2, 50, 1, '#ffffff', { radius: 0.5 }),
    // front LED strip
    rect(14, 31.5, 36, 3.4, '#2a2e33', { radius: 1.7 }),
    ...[K.wh, K.blue, K.blue, K.wh, K.wh, K.off].flatMap((c, i) => led(18.5 + i * 5.4, 33.2, c, 0.6)),
    // feet
    rect(8, 40.6, 7, 2.4, '#4a5057', { radius: 0.8 }),
    rect(49, 40.6, 7, 2.4, '#4a5057', { radius: 0.8 }),
  ],
  ports: [
    P('WLAN', 32, 12, 'wireless', 0, 'top'),
    P('WAN', 3, 33, 'ethernet', 1, 'left'),
    P('P1', 10, 41, 'ethernet', 1, 'bottom'), P('P2', 21, 41, 'ethernet', 1, 'bottom'), P('P3', 32, 41, 'ethernet', 1, 'bottom'),
    P('P4', 43, 41, 'ethernet', 1, 'bottom'), P('P5', 54, 41, 'ethernet', 1, 'bottom'),
  ],
});

const firewall = def('detailed', {
  id: 'd-firewall', name: 'Firewall', category: 'Security', prefix: 'fw', w: 84, h: 24,
  description: '1U firewall / security appliance',
  shapes: [
    ...chassis(4.5, 75, 24),
    ...rackEars(84, 24),
    // red security bezel with status LEDs
    rect(6.5, 2.4, 13, 19.2, '#a32b26', { radius: 0.8 }),
    rect(6.5, 2.4, 13, 1, '#c7453d', { radius: 0.5 }),
    ...led(9.5, 7, K.green), bar(11, 6.7, 5.5, '#f0c9c6', 0.7),
    ...led(9.5, 11, K.green), bar(11, 10.7, 5.5, '#f0c9c6', 0.7),
    ...led(9.5, 15, K.amber, 0.55, false), bar(11, 14.7, 5.5, '#f0c9c6', 0.7),
    // LCD + keypad
    rect(22.5, 5, 15, 7.5, '#14171a', { radius: 0.6 }),
    rect(23.3, 5.8, 13.4, 5.9, '', { gradient: grad(90, '#5aa7d6', '#2c6c99') }),
    rect(24.5, 7.2, 8, 0.7, '#d7f0ff', { opacity: 0.8 }), rect(24.5, 9.2, 5, 0.7, '#d7f0ff', { opacity: 0.6 }),
    ...repeat(4, (i) => rrect(23.4 + i * 3.6, 14.5, 2.4, 2.4, [1.2, 1.2, 1.2, 1.2], '#4a5158')),
    line([[40.5, 4], [40.5, 20]], '#3e444a', 0.5),
    // ports: 2 × 4, first column = MGMT (blue) / console
    ...repeat(4, (i) => {
      const x = 43 + i * 5.6;
      return [
        ...rj45(x, 5.4, 4.6, 3.8, true, i === 0 ? '#4f88b8' : K.frame),
        ...rj45(x, 10.2, 4.6, 3.8),
        rect(x + 1.6, 15.1, 1.4, 0.7, i === 1 || i === 2 ? K.green : K.off, { radius: 0.2 }),
      ];
    }),
    ...sfp(66.5, 5.6, 6.6, 3.6), ...sfp(66.5, 10.4, 6.6, 3.6),
    bar(43, 17.6, 30, '#aab1b8', 0.35),
    ...vents(74.5, 5, 4, 13, 2),
  ],
  ports: [
    P('WAN', 52, 0, 'ethernet', 1, 'top'),
    P('LAN', 52, 24, 'ethernet', 1, 'bottom'),
    P('DMZ', 84, 12, 'ethernet', 1, 'right'),
    P('MGMT', 0, 12, 'ethernet', 1, 'left'),
  ],
});

const accessPoint = def('detailed', {
  id: 'd-access-point', name: 'Access Point', category: 'Wireless', prefix: 'ap', w: 52, h: 26,
  description: 'Ceiling-mount Wi-Fi access point',
  accent: '#1a8fd8',
  shapes: [
    // rim (side of the disc)
    ell(2, 6.5, 48, 17, '#a9b0b7'),
    rect(2, 9, 48, 6, '#a9b0b7'),
    ell(2.4, 6.3, 47.2, 16.6, '', { gradient: grad(90, '#dde1e5', '#c3c9cf') }),
    rect(2.4, 9, 47.2, 6, '', { gradient: grad(0, '#c7cdd2', '#e3e6e9') }),
    // top face
    ell(2, 1, 48, 16, '#c3c9ce'),
    ell(2.4, 1.3, 47.2, 15.4, '', { gradient: grad(90, '#ffffff', '#eceef0') }),
    ell(12, 4.8, 28, 8.4, 'none', { stroke: '#dde1e5', strokeWidth: 0.6 }),
    // status LED
    ell(23.2, 7.9, 5.6, 2.2, K.blue, { opacity: 0.25 }),
    ell(24.4, 8.3, 3.2, 1.4, K.blue),
  ],
  ports: [P('WLAN', 26, 1, 'wireless', 0, 'top'), P('ETH', 26, 23.5, 'ethernet', 1, 'bottom')],
});

const cloud = def('detailed', {
  id: 'd-cloud', name: 'Internet / Cloud', category: 'Network', prefix: 'inet', w: 72, h: 44, accent: '#8fa3b8',
  description: 'Internet / WAN cloud',
  shapes: [
    // one solid block, no rim or highlight (detailed style)
    path('M17 42H55A13 13 0 0 0 58.5 16.6 17 17 0 0 0 26.5 11.5 12 12 0 0 0 10 22.6 10 10 0 0 0 17 42Z', 0, 0, 72, 44,
      { vb: [0, 0, 72, 44], stroke: 'none', fill: '#c3d0dd' }),
  ],
  ports: [
    P('N', 40, 3.6, 'any', 0, 'top'), P('S', 36, 42, 'any', 0, 'bottom'),
    P('W', 6.5, 30, 'any', 0, 'left'), P('E', 68, 29, 'any', 0, 'right'),
  ],
});

const driveBay = (x: number, y: number, w: number, h: number, act: boolean): Shape[] => [
  rect(x, y, w, h, '#3c4248', { radius: 0.5 }),
  rect(x + 0.4, y + 0.4, w - 0.8, h - 0.8, '#24272b', { radius: 0.3 }),
  ...repeat(5, (i) => rect(x + 1.4 + i * ((w - 7.5) / 5), y + 1.4, (w - 7.5) / 5 - 0.7, h - 4.4, '#15171a', { radius: 0.3 })),
  rect(x + 1.2, y + h - 2.4, w - 6.5, 1.3, '#4c535a', { radius: 0.4 }),
  ...led(x + w - 3.4, y + 2.4, act ? K.green : K.off, 0.5),
  ...led(x + w - 3.4, y + 4.8, K.off, 0.5, false),
  rect(x + w - 4.6, y + h - 2.4, 2.4, 1.3, '#4c535a', { radius: 0.4 }),
];

const server = def('detailed', {
  id: 'd-server', name: 'Server', category: 'Compute', prefix: 'srv', w: 84, h: 34,
  description: '2U rack server, front with drive bays',
  shapes: [
    ...chassis(6.5, 71, 34),
    // ears with control panel (left) and I/O (right)
    rrect(0, 0.5, 8, 33, [1.2, 0, 0, 1.2], '', { gradient: grad(0, '#5d646b', '#3d4248') }),
    rrect(76, 0.5, 8, 33, [0, 1.2, 1.2, 0], '', { gradient: grad(0, '#3d4248', '#5d646b') }),
    rrect(2.2, 5, 3.6, 3.6, [1.8, 1.8, 1.8, 1.8], '#2a2e32'), circ(4, 6.8, 1.3, 'none', { stroke: K.green, strokeWidth: 0.6 }),
    ...led(4, 12, K.green, 0.5), ...led(4, 14.6, K.blue, 0.5), ...led(4, 17.2, K.off, 0.5),
    rect(2.6, 24, 2.8, 6, '#2a2e32', { radius: 0.6 }),
    rect(78.2, 5, 3.6, 1.8, K.metalLo, { radius: 0.3 }), rect(78.6, 5.4, 2.8, 0.8, K.hole),
    rect(78.2, 9, 3.6, 1.8, K.metalLo, { radius: 0.3 }), rect(78.6, 9.4, 2.8, 0.8, K.hole),
    rect(78.6, 24, 2.8, 6, '#2a2e32', { radius: 0.6 }),
    // 4 × 2 drive bays
    ...repeat(8, (i) => driveBay(9 + (i % 4) * 16.6, 3 + Math.floor(i / 4) * 14.2, 16, 13.6, i !== 3 && i !== 7)),
    // pull-out service tag
    rect(39, 30.6, 6, 1.6, K.tag, { radius: 0.3 }),
  ],
  ports: [
    P('ETH0', 30, 0, 'ethernet', 1, 'top'), P('ETH1', 54, 0, 'ethernet', 1, 'top'),
    P('ETH2', 54, 34, 'ethernet', 1, 'bottom'),
    P('iLO', 0, 21, 'ethernet', 1, 'left'),
  ],
});

const pc = def('detailed', {
  id: 'd-pc', name: 'Personal Computer', category: 'Compute', prefix: 'pc', w: 64, h: 48,
  description: 'Desktop PC with monitor',
  shapes: [
    // monitor stand
    rect(20, 33, 6, 10, '', { gradient: grad(0, '#7b838b', '#5a6168') }),
    rrect(12, 42.5, 22, 3, [1.5, 1.5, 0.6, 0.6], '#6c737a'),
    rect(12, 44.8, 22, 0.9, '#4b5157', { radius: 0.4 }),
    // monitor
    rect(0, 0, 46, 34.5, K.dkEdge, { radius: 1.8 }),
    rect(0.6, 0.6, 44.8, 33.3, '#1f2225', { radius: 1.4 }),
    rect(2.2, 2.2, 41.6, 27.4, '', { gradient: K.screen }),
    poly([[2.2, 22], [20, 13], [43.8, 20], [43.8, 29.6], [2.2, 29.6]], '#5aa0e0', { opacity: 0.25 }),
    poly([[2.2, 26], [26, 17.5], [43.8, 25], [43.8, 29.6], [2.2, 29.6]], '#8cc4f0', { opacity: 0.2 }),
    rect(2.2, 28, 41.6, 1.6, '#0f1720', { opacity: 0.6 }),
    ...led(41.5, 31.8, K.blue, 0.4),
    // tower
    rect(49, 9, 15, 37, K.dkEdge, { radius: 1.4 }),
    rect(49.6, 9.6, 13.8, 35.8, '', { radius: 1.1, gradient: grad(0, '#383d42', '#2a2e32') }),
    rect(50.2, 10, 12.6, 0.8, K.dkHi, { radius: 0.4 }),
    circ(56.5, 14, 1.6, '#1d2023'), circ(56.5, 14, 1, 'none', { stroke: K.blue, strokeWidth: 0.4 }),
    rect(52.8, 18, 2.4, 1.2, K.metalLo, { radius: 0.2 }), rect(53.2, 18.3, 1.6, 0.5, K.hole),
    rect(57.8, 18, 2.4, 1.2, K.metalLo, { radius: 0.2 }), rect(58.2, 18.3, 1.6, 0.5, K.hole),
    ...vents(51.5, 23, 10, 18.5, 5, '#1d2023'),
    rect(51, 46, 3, 2, '#1d2023', { radius: 0.5 }), rect(59, 46, 3, 2, '#1d2023', { radius: 0.5 }),
  ],
  ports: [
    P('ETH', 56.5, 48, 'ethernet', 1, 'bottom'),
    P('ETH2', 64, 28, 'ethernet', 1, 'right'),
    P('USB', 23, 0, 'usb', 1, 'top'),
  ],
});

const laptop = def('detailed', {
  id: 'd-laptop', name: 'Laptop', category: 'Compute', prefix: 'nb', w: 64, h: 44,
  description: 'Notebook / laptop',
  shapes: [
    // lid + display
    rrect(9, 0, 46, 33, [2.4, 2.4, 0.5, 0.5], '#5a6168'),
    rrect(9.5, 0.5, 45, 32.5, [2, 2, 0.4, 0.4], '#1e2124'),
    rect(11.5, 2.5, 41, 27.5, '', { gradient: K.screen }),
    poly([[11.5, 22], [28, 14], [52.5, 21], [52.5, 30], [11.5, 30]], '#5aa0e0', { opacity: 0.25 }),
    poly([[11.5, 26.5], [33, 18], [52.5, 25.5], [52.5, 30], [11.5, 30]], '#8cc4f0', { opacity: 0.2 }),
    circ(32, 1.5, 0.45, '#3a3f45'),
    // base deck (seen slightly from above)
    poly([[7.5, 33], [56.5, 33], [62.5, 41], [1.5, 41]], '', { gradient: grad(90, '#d3d8dc', '#bfc5ca') }),
    poly([[11, 34], [53, 34], [56.6, 38], [7.4, 38]], '#3a3f45'),
    ...repeat(3, (i) => line([[10.6 - i * 1.2, 35.3 + i * 1.3], [53.4 + i * 1.2, 35.3 + i * 1.3]], '#565c63', 0.35)),
    poly([[26, 38.6], [38, 38.6], [38.6, 40.4], [25.4, 40.4]], '#aab1b7'),
    rrect(1.5, 41, 61, 2.4, [0, 0, 1.4, 1.4], '#9aa1a8'),
    rect(28, 41, 8, 0.8, '#868d94', { radius: 0.4 }),
  ],
  ports: [
    P('ETH', 3, 41, 'ethernet', 1, 'left'),
    P('WLAN', 32, 0, 'wireless', 1, 'top'),
    P('USB', 61, 41, 'usb', 1, 'right'),
  ],
});

const nasTray = (x: number, y: number, w: number, h: number, act: boolean): Shape[] => [
  rect(x, y, w, h, '#16181b', { radius: 0.5 }),
  ...repeat(9, (i) => rect(x + 1.2, y + 3.6 + i * 2.6, w - 2.4, 1.2, '#2b2f34', { radius: 0.5 })),
  ...led(x + w / 2, y + 1.7, act ? K.green : K.off, 0.5),
  rect(x + 1, y + h - 3.6, w - 2, 2.4, '#30343a', { radius: 0.5 }),
];

const nas = def('detailed', {
  id: 'd-nas', name: 'Storage / NAS', category: 'Compute', prefix: 'nas', w: 46, h: 48,
  description: '4-bay network storage',
  shapes: [
    rect(0, 0, 46, 45.5, K.dkEdge, { radius: 2.6 }),
    rect(0.6, 0.6, 44.8, 44.3, '', { radius: 2.2, gradient: grad(90, '#34383d', '#24272b') }),
    rect(2, 1, 42, 0.8, '#4c535a', { radius: 0.4 }),
    ...repeat(4, (i) => nasTray(3.4 + i * 7.9, 4, 7.2, 37, i < 3)),
    // right control column
    circ(39.6, 7.6, 2, '#1a1c1f'), circ(39.6, 7.6, 1.3, 'none', { stroke: K.blue, strokeWidth: 0.5 }),
    ...led(39.6, 13, K.green, 0.5), ...led(39.6, 16, K.green, 0.5), ...led(39.6, 19, K.amber, 0.5, false),
    rect(37.8, 33.5, 3.6, 2, K.metalLo, { radius: 0.3 }), rect(38.2, 34, 2.8, 0.9, K.hole),
    rect(37.8, 37.5, 3.6, 2, '#3a3f45', { radius: 0.3 }),
    // feet
    rect(4, 45, 7, 3, '#1b1d20', { radius: 0.8 }), rect(35, 45, 7, 3, '#1b1d20', { radius: 0.8 }),
  ],
  ports: [
    P('ETH0', 23, 0, 'ethernet', 1, 'top'), P('ETH1', 23, 46, 'ethernet', 1, 'bottom'),
    P('ETH2', 0, 23, 'ethernet', 1, 'left'), P('ETH3', 46, 23, 'ethernet', 1, 'right'),
  ],
});

const ipCamera = def('detailed', {
  id: 'd-ip-camera', name: 'IP Camera', category: 'Security', prefix: 'cam', w: 56, h: 36,
  description: 'Bullet CCTV camera (PoE)',
  shapes: [
    // mount
    rect(15, 32.4, 22, 3.6, '#c3c9ce', { radius: 1 }), rect(15, 35, 22, 1, '#9ba2a9', { radius: 0.5 }),
    poly([[23, 33], [29, 33], [28, 23], [24.4, 23]], '', { gradient: grad(0, '#d9dde1', '#b5bcc2') }),
    circ(26.2, 22, 3, '#b8bec4'), circ(26.2, 22, 2, '#d3d8dc'),
    // body
    rect(8, 7, 41, 14.6, '#a9b0b7', { radius: 6.5 }),
    rect(8.4, 7.4, 40.2, 13.8, '', { radius: 6.2, gradient: grad(90, '#ffffff', '#cdd3d8') }),
    rect(14, 9, 30, 1.2, '#ffffff', { radius: 0.6 }),
    // sun shield
    rrect(5, 3, 49, 4.6, [2.3, 1, 0.6, 2], '#aab1b8'),
    rrect(5.4, 3.3, 48.2, 3.9, [2, 0.8, 0.4, 1.8], '', { gradient: grad(90, '#fbfbfc', '#dfe3e7') }),
    // front cap + lens glass
    rect(46, 7.6, 6, 13.4, '#2c3035', { radius: 1.2 }),
    rect(50.6, 8.4, 2.4, 11.8, '', { radius: 0.8, gradient: grad(90, '#3d5f86', '#0d1218') }),
    rect(51.2, 9.6, 0.7, 4, '#9fc7f0', { opacity: 0.6, radius: 0.35 }),
    // rear cap + cable gland
    rect(6, 9.4, 3.2, 9.8, '#b9bfc5', { radius: 1.2 }),
    rect(4.2, 12.6, 2.4, 3.4, '#8f979f', { radius: 0.6 }),
  ],
  ports: [P('PoE', 26, 36, 'ethernet', 1, 'bottom')],
});

const generic = def('detailed', {
  id: 'd-generic', name: 'Generic Device', category: 'Basic', prefix: 'dev', w: 48, h: 34,
  description: 'Generic network device',
  shapes: [
    rect(0, 0, 48, 31.5, '#8f979f', { radius: 2.2 }),
    rect(0.6, 0.6, 46.8, 30.3, '', { radius: 1.8, gradient: grad(90, '#e2e5e8', '#c9ced3') }),
    rect(1.8, 1, 44.4, 0.8, '#f4f5f6', { radius: 0.4 }),
    // front panel
    rect(4, 5, 40, 21, '#5c656d', { radius: 1.2 }),
    rect(4.6, 5.6, 38.8, 19.8, '#3a4046', { radius: 0.9 }),
    ...led(9, 10, K.green, 0.65), bar(11, 9.7, 6, '#c8cdd2', 0.6),
    ...led(9, 14, K.green, 0.65), bar(11, 13.7, 6, '#c8cdd2', 0.6),
    ...led(9, 18, K.amber, 0.65, false), bar(11, 17.7, 6, '#c8cdd2', 0.6),
    ...rj45(25, 9.5, 7, 6, true), ...rj45(33.4, 9.5, 7, 6, true),
    rect(25, 18.5, 15.4, 3.6, '#cfd4d9', { radius: 0.4, opacity: 0.9 }),
    rect(26, 19.6, 8, 0.6, '#5c656d'), rect(26, 20.8, 5, 0.6, '#5c656d'),
    // feet
    rect(4, 31, 7, 3, '#4a5057', { radius: 0.8 }), rect(37, 31, 7, 3, '#4a5057', { radius: 0.8 }),
  ],
  ports: [
    P('P1', 24, 0, 'any', 1, 'top'), P('P2', 24, 31.5, 'any', 1, 'bottom'),
    P('P3', 0, 16, 'any', 1, 'left'), P('P4', 48, 16, 'any', 1, 'right'),
  ],
});

export const DETAILED_IT_DEFS: DeviceDef[] = [
  switch1u, switchL3, router, routerIndustrial, routerWireless, firewall, accessPoint,
  cloud, server, pc, laptop, nas, ipCamera, generic,
];
