import type { DeviceDef, Shape } from '../model/types';
import { P, circ, def, grad, line, rect, repeat } from './draw';

// Detailed (front-view illustration) style — second batch of IT / network devices.
// Same look as detailed-it.ts: anthracite rack gear, metal ears, RJ45 jacks, SFP cages, LEDs.
// Solid blocks only: square corners, no outlines, flat fills (solidify() enforces it anyway).

// ── palette (shared with detailed-it.ts) ──
const K = {
  dk: '#2d3135', // anthracite body
  dkHi: '#454b52', // top highlight on dark bodies
  dkEdge: '#5a6169',
  dkLo: '#1c1f22',
  panel: '#212427',
  hole: '#0b0c0d',
  frame: '#8a9198', // RJ45 metal shield
  metal: '#b4bac0',
  metalHi: '#d7dbdf',
  metalLo: '#7c838a',
  green: '#3ee07c',
  amber: '#f5a524',
  red: '#e5534b',
  blue: '#45a2ff',
  off: '#3b4147',
  wh: '#f3f4f5',
  whLo: '#d9dde1',
  grey: '#c4c9ce',
  greyLo: '#9ba2a9',
  tag: '#cfd4d9',
  lcd: '#3f85b4', // flat LCD colour (same family as the flattened K.screen gradient)
  lcdTxt: '#d7f0ff',
  screen: grad(90, '#2f78c4', '#173a69'),
};

// ── small parts ──
/** RJ45 jack: metal shield, black opening, latch slot (down by default) */
const rj45 = (x: number, y: number, w = 4.6, h = 3.8, up = false, frame = K.frame): Shape[] => {
  const tab = h * 0.3;
  return [
    rect(x, y, w, h, frame),
    rect(x + 0.5, y + (up ? 0.5 + tab : 0.5), w - 1, h - 1 - tab, K.hole),
    rect(x + w * 0.3, y + (up ? 0.5 : h - 0.5 - tab), w * 0.4, tab + 0.02, K.hole),
  ];
};

/** SFP cage, optionally with a module (pull tab) inserted */
const sfp = (x: number, y: number, w = 6.4, h = 3.2, module?: string): Shape[] => [
  rect(x, y, w, h, K.metalLo),
  rect(x + 0.2, y + 0.2, w - 0.4, 0.5, K.metalHi),
  rect(x + 0.5, y + 0.8, w - 1, h - 1.3, module ? '#9aa1a8' : K.hole),
  ...(module ? [rect(x + 0.9, y + 1.2, w - 1.8, h - 2.1, module)] : []),
];

/** SC duplex fiber receptacle (two square openings in a coloured housing) */
const scDuplex = (x: number, y: number, w = 7.6, h = 5.2, housing = '#2f5f9e'): Shape[] => [
  rect(x, y, w, h, housing),
  rect(x + 0.9, y + 1.1, (w - 2.6) / 2, h - 2.2, K.hole),
  rect(x + w / 2 + 0.4, y + 1.1, (w - 2.6) / 2, h - 2.2, K.hole),
];

const led = (cx: number, cy: number, c: string, r = 0.55, glow = true): Shape[] =>
  c === K.off || !glow ? [circ(cx, cy, r, c)] : [circ(cx, cy, r * 2, c, { opacity: 0.22 }), circ(cx, cy, r, c)];

const sqLed = (x: number, y: number, c: string, w = 1.4, h = 0.8): Shape => rect(x, y, w, h, c);

const screw = (cx: number, cy: number, r = 0.8, c = K.metal): Shape[] => [
  circ(cx, cy, r, c),
  rect(cx - r * 0.65, cy - r * 0.15, r * 1.3, r * 0.3, K.metalLo),
];

/** 19" rack ears with mounting holes, full height h, outer width W (flat metal) */
const rackEars = (W: number, h: number, ew = 5.5): Shape[] => {
  const holes = h > 30 ? [h * 0.18, h * 0.82] : [h * 0.22, h * 0.78];
  const ear = (x: number) => [
    rect(x, 0.5, ew, h - 1, K.metal),
    rect(x, 0.5, ew, 0.7, K.metalHi),
    ...holes.map((hy) => rect(x + ew / 2 - 1.1, hy - 1.7, 2.2, 3.4, '#3d4248')),
  ];
  return [...ear(0), ...ear(W - ew)];
};

/** dark rack chassis between the ears: body, top highlight, bottom lip */
const chassis = (x: number, w: number, h: number, body = K.dk): Shape[] => [
  rect(x, 0, w, h, body),
  rect(x + 0.6, 0.9, w - 1.2, 0.9, K.dkHi),
  rect(x + 0.6, h - 1.8, w - 1.2, 0.8, K.dkLo),
];

/** vent slots (vertical) */
const vents = (x: number, y: number, w: number, h: number, n: number, c = K.dkLo): Shape[] => {
  const step = w / n;
  return repeat(n, (i) => rect(x + i * step + step * 0.25, y, step * 0.5, h, c));
};

/** horizontal vent slots */
const hvents = (x: number, y: number, w: number, h: number, n: number, c = K.dkLo): Shape[] => {
  const step = h / n;
  return repeat(n, (i) => rect(x, y + i * step + step * 0.25, w, step * 0.5, c));
};

/** label bar (silk-screen text as a plain bar) */
const bar = (x: number, y: number, w: number, c = '#aab1b8', o = 0.55) => rect(x, y, w, 0.55, c, { opacity: o });

/** vertical panel separator */
const sep = (x: number, y1: number, y2: number) => line([[x, y1], [x, y2]], '#3e444a', 0.5);

/** small dark LCD with a lit panel and two text lines */
const lcd = (x: number, y: number, w: number, h: number, lines = 2): Shape[] => [
  rect(x, y, w, h, '#14171a'),
  rect(x + 1.3, y + 1.3, w - 2.6, h - 2.6, K.lcd),
  ...repeat(lines, (i) => rect(x + 2.3, y + 2.5 + i * 1.9, (w - 4.6) * (i === 0 ? 0.7 : 0.45), 0.7, K.lcdTxt, { opacity: i === 0 ? 0.85 : 0.6 })),
];

/** screen content: layered "landscape" like the PC / laptop screens */
const screenArt = (x: number, y: number, w: number, h: number): Shape[] => [
  rect(x, y, w, h, '', { gradient: K.screen }),
  rect(x, y + h * 0.62, w, h * 0.38, '#5aa0e0', { opacity: 0.25 }),
  rect(x, y + h * 0.8, w, h * 0.2, '#8cc4f0', { opacity: 0.2 }),
];

// ─────────────────────────────────────────────────────────────────────────────

const wirelessController = def('detailed', {
  id: 'd-wireless-controller', name: 'Wireless Controller', category: 'Wireless', prefix: 'wlc', w: 84, h: 24,
  description: '1U wireless LAN controller appliance',
  shapes: [
    ...chassis(4.5, 75, 24),
    ...rackEars(84, 24),
    // light-grey status bezel with signal-strength bars
    rect(6.5, 2.4, 18, 19.2, '#aeb5bb'),
    rect(6.5, 2.4, 18, 1, '#c9ced3'),
    ...led(9.5, 7, K.green), bar(11, 6.7, 4.5, '#4a5057', 0.7),
    ...led(9.5, 10.5, K.green), bar(11, 10.2, 4.5, '#4a5057', 0.7),
    ...led(9.5, 14, K.blue), bar(11, 13.7, 4.5, '#4a5057', 0.7),
    ...led(9.5, 17.5, K.amber, 0.55, false), bar(11, 17.2, 4.5, '#4a5057', 0.7),
    // signal bars (generic wireless indicator)
    rect(18, 14.5, 1.4, 3, '#4a5057'), rect(19.9, 12.5, 1.4, 5, '#4a5057'), rect(21.8, 10, 1.4, 7.5, '#4a5057'),
    sep(27, 4, 20),
    // console (blue) + service RJ45, USB
    ...rj45(29.5, 5.4, 4.6, 3.8, true, '#4f88b8'),
    ...rj45(35.1, 5.4, 4.6, 3.8, true),
    ...rj45(29.5, 10.2, 4.6, 3.8), ...rj45(35.1, 10.2, 4.6, 3.8),
    sqLed(31.1, 15.1, K.green), sqLed(36.7, 15.1, K.off),
    rect(29.5, 17.4, 5, 2, K.metalLo), rect(30.1, 18, 3.8, 0.8, K.hole),
    bar(35.5, 18.1, 4.2, '#aab1b8', 0.35),
    sep(42.5, 4, 20),
    // 2 × 2 SFP+ uplinks
    ...sfp(45, 5.6, 6.8, 3.6, '#3b7fd1'), ...sfp(52.6, 5.6, 6.8, 3.6, '#3b7fd1'),
    ...sfp(45, 10.4, 6.8, 3.6), ...sfp(52.6, 10.4, 6.8, 3.6),
    ...led(61.2, 7.4, K.green, 0.45), ...led(61.2, 12.2, K.off, 0.45),
    bar(45, 16, 14.4, '#aab1b8', 0.35),
    // fan grille
    sep(64, 4, 20),
    ...vents(65.5, 5, 12.5, 13, 6),
  ],
  ports: [
    P('P1', 0, 12, 'ethernet', 1, 'left'),
    P('P2', 84, 12, 'ethernet', 1, 'right'),
    P('SFP1', 49, 24, 'sfp', 1, 'bottom'),
    P('MGMT', 34, 0, 'ethernet', 1, 'top'),
  ],
});

const loadBalancer = def('detailed', {
  id: 'd-load-balancer', name: 'Load Balancer', category: 'Network', prefix: 'lb', w: 84, h: 24,
  description: '1U application delivery controller / load balancer',
  shapes: [
    ...chassis(4.5, 75, 24),
    ...rackEars(84, 24),
    // orange status bezel with LCD
    rect(6.5, 2.4, 17, 19.2, '#d9731f'),
    rect(6.5, 2.4, 17, 1, '#ee9240'),
    ...led(9.5, 6.8, K.green), bar(11, 6.5, 5, '#fbe3cf', 0.75),
    ...led(9.5, 10.2, K.green), bar(11, 9.9, 5, '#fbe3cf', 0.75),
    ...led(9.5, 13.6, K.off, 0.55, false), bar(11, 13.3, 5, '#fbe3cf', 0.75),
    ...lcd(8.5, 15.6, 13, 5.2, 1),
    // small nav buttons right of the LEDs
    ...repeat(3, (i) => rect(18.5, 6 + i * 3.4, 3, 1.8, '#a9561a')),
    sep(26, 4, 20),
    // 2 × 4 GE copper
    ...repeat(4, (i) => {
      const x = 28.5 + i * 5.6;
      return [
        ...rj45(x, 5.4, 4.6, 3.8, true),
        ...rj45(x, 10.2, 4.6, 3.8),
        sqLed(x + 0.6, 15.1, [0, 1].includes(i) ? K.green : K.off),
        sqLed(x + 2.6, 15.1, i === 2 ? K.amber : K.off),
      ];
    }),
    bar(28.5, 17.6, 21, '#aab1b8', 0.35),
    sep(52.5, 4, 20),
    // 2 × 2 SFP+
    ...sfp(55, 5.6, 6.8, 3.6, '#3b7fd1'), ...sfp(62.6, 5.6, 6.8, 3.6, '#2fae6a'),
    ...sfp(55, 10.4, 6.8, 3.6), ...sfp(62.6, 10.4, 6.8, 3.6),
    sqLed(56.5, 15.1, K.green), sqLed(64.1, 15.1, K.green),
    bar(55, 17.6, 14.4, '#aab1b8', 0.35),
    // fan grille
    ...vents(72, 5, 6, 13, 3),
  ],
  ports: [
    P('P1', 40, 0, 'ethernet', 1, 'top'),
    P('P2', 40, 24, 'ethernet', 1, 'bottom'),
    P('P3', 0, 12, 'ethernet', 1, 'left'),
    P('P4', 84, 12, 'ethernet', 1, 'right'),
  ],
});

const modemOnt = def('detailed', {
  id: 'd-modem-ont', name: 'Modem / ONT', category: 'Network', prefix: 'mdm', w: 52, h: 26,
  description: 'Fiber ONT / cable modem, desktop box',
  shapes: [
    // flat desktop body: light grey with white top edge and darker lower band
    rect(2, 4, 48, 17, K.whLo),
    rect(2, 4, 48, 1.2, K.wh),
    rect(2, 17.5, 48, 3.5, K.grey),
    // glossy LED strip
    rect(9, 9, 34, 4.6, '#2a2e33'),
    ...[K.green, K.green, K.off, K.green, K.off, K.blue].flatMap((c, i) => led(13 + i * 5.2, 11.3, c, 0.6)),
    ...repeat(6, (i) => bar(11.9 + i * 5.2, 14.4, 2.2, '#6c737a', 0.7)),
    // fiber pigtail boot (SC/APC green) on the left, power button on the right
    rect(0, 10.6, 3.2, 4.4, '#2f9e5b'),
    rect(45.5, 10.2, 2.6, 2.6, '#6c737a'), circ(46.8, 11.5, 0.7, K.green),
    // feet
    rect(6, 21, 8, 2.2, '#4a5057'), rect(38, 21, 8, 2.2, '#4a5057'),
  ],
  ports: [
    P('WAN', 0, 12.8, 'fiber', 1, 'left'),
    P('LAN1', 50, 12.8, 'ethernet', 1, 'right'),
    P('LAN2', 26, 23, 'ethernet', 1, 'bottom'),
  ],
});

const patchPanel = def('detailed', {
  id: 'd-patch-panel', name: 'Patch Panel', category: 'Network', prefix: 'pp', w: 88, h: 24,
  description: '1U 24-port patch panel with label strips',
  shapes: [
    ...chassis(4.5, 79, 24, K.panel),
    ...rackEars(88, 24),
    // ID label + screws on the left / right margins
    rect(7, 9.5, 4.2, 5, K.tag), rect(7.6, 10.8, 3, 0.6, '#5c656d'), rect(7.6, 12.2, 2, 0.6, '#5c656d'),
    ...screw(9.1, 19.5, 0.7), ...screw(78.9, 19.5, 0.7),
    // 2 rows × 12 jacks in groups of 6, white numbered label strip under each row
    ...repeat(2, (row) => {
      const y = 3.2 + row * 9.2;
      return [
        ...repeat(12, (i) => {
          const x = 13.5 + i * 5.1 + (i > 5 ? 3 : 0);
          return rj45(x, y, 4.6, 3.8, row === 0);
        }),
        rect(13.5, y + 4.6, 30.1, 1.8, K.tag), rect(47.1, y + 4.6, 30.1, 1.8, K.tag),
        ...repeat(12, (i) => rect(15 + i * 5.1 + (i > 5 ? 3 : 0), y + 5.2, 1.6, 0.6, '#5c656d')),
      ];
    }),
    // cable-management bar along the bottom
    rect(13.5, 20.2, 63.7, 1, '#3e444a'),
  ],
  ports: [
    P('P1', 19, 0, 'ethernet', 1, 'top'), P('P2', 35, 0, 'ethernet', 1, 'top'), P('P3', 55, 0, 'ethernet', 1, 'top'), P('P4', 71, 0, 'ethernet', 1, 'top'),
    P('P5', 19, 24, 'ethernet', 1, 'bottom'), P('P6', 35, 24, 'ethernet', 1, 'bottom'), P('P7', 55, 24, 'ethernet', 1, 'bottom'), P('P8', 71, 24, 'ethernet', 1, 'bottom'),
  ],
});

const mediaConverter = def('detailed', {
  id: 'd-media-converter', name: 'Media Converter', category: 'Network', prefix: 'mc', w: 42, h: 24,
  description: 'Fiber-to-copper media converter, small metal box',
  shapes: [
    // steel housing
    rect(1, 2, 40, 18, '#3b4248'),
    rect(1.6, 2.5, 38.8, 0.8, K.dkHi),
    rect(1.6, 18.6, 38.8, 0.8, K.dkLo),
    // SC duplex fiber (left), status LEDs (middle), RJ45 (right)
    ...scDuplex(4, 8, 8.4, 5.6),
    bar(4.6, 15, 7.2, '#aab1b8', 0.35),
    ...led(16.5, 8.2, K.green, 0.55), bar(18, 7.9, 3.6, '#aab1b8', 0.5),
    ...led(16.5, 11, K.green, 0.55), bar(18, 10.7, 3.6, '#aab1b8', 0.5),
    ...led(16.5, 13.8, K.amber, 0.55, false), bar(18, 13.5, 3.6, '#aab1b8', 0.5),
    // DIP switch block
    rect(23.5, 8.4, 5, 2.4, '#1d2023'), ...repeat(4, (i) => rect(24 + i * 1.2, i % 2 ? 9 : 9.8, 0.8, 1, K.metalHi)),
    ...rj45(30, 7.2, 7.4, 6.2),
    bar(30.4, 15, 6.6, '#aab1b8', 0.35),
    // feet
    rect(4, 20, 5, 2, '#1d2023'), rect(33, 20, 5, 2, '#1d2023'),
  ],
  ports: [
    P('FX', 1, 11, 'fiber', 1, 'left'),
    P('TX', 41, 11, 'ethernet', 1, 'right'),
  ],
});

const vpnGateway = def('detailed', {
  id: 'd-vpn-gateway', name: 'VPN Gateway', category: 'Security', prefix: 'vpn', w: 80, h: 24,
  description: '1U VPN concentrator / gateway appliance',
  shapes: [
    ...chassis(4.5, 71, 24),
    ...rackEars(80, 24),
    // navy security bezel: status LEDs + tunnel-count LCD
    rect(6.5, 2.4, 20, 19.2, '#2c4a6e'),
    rect(6.5, 2.4, 20, 1, '#3d6391'),
    ...led(9.5, 7, K.green), bar(11, 6.7, 5, '#cfe0f2', 0.75),
    ...led(9.5, 10.5, K.green), bar(11, 10.2, 5, '#cfe0f2', 0.75),
    ...led(9.5, 14, K.amber, 0.55, false), bar(11, 13.7, 5, '#cfe0f2', 0.75),
    ...lcd(17.5, 5.2, 8, 9.6, 3),
    // USB + console (blue) in the bezel foot
    rect(9, 17, 5, 2, K.metalLo), rect(9.6, 17.6, 3.8, 0.8, K.hole),
    ...rj45(16, 16.2, 4.6, 3.8, false, '#4f88b8'),
    sep(29, 4, 20),
    // 2 × 3 GE: WAN (yellow) first
    ...rj45(31.5, 5.4, 4.6, 3.8, true, '#d4b23f'),
    ...rj45(37.1, 5.4, 4.6, 3.8, true), ...rj45(42.7, 5.4, 4.6, 3.8, true),
    ...rj45(31.5, 10.2, 4.6, 3.8), ...rj45(37.1, 10.2, 4.6, 3.8), ...rj45(42.7, 10.2, 4.6, 3.8),
    ...repeat(3, (i) => sqLed(33.1 + i * 5.6, 15.1, i < 2 ? K.green : K.off)),
    bar(31.5, 17.6, 15.8, '#aab1b8', 0.35),
    sep(50, 4, 20),
    // SFP pair (one populated)
    ...sfp(52.5, 5.6, 6.8, 3.6, '#3b7fd1'), ...sfp(52.5, 10.4, 6.8, 3.6),
    ...led(60.8, 7.4, K.green, 0.45), ...led(60.8, 12.2, K.off, 0.45),
    bar(52.5, 16, 6.8, '#aab1b8', 0.35),
    // fan grille
    sep(63.5, 4, 20),
    ...vents(65, 5, 9, 13, 4),
  ],
  ports: [
    P('WAN', 40, 0, 'ethernet', 1, 'top'),
    P('LAN', 40, 24, 'ethernet', 1, 'bottom'),
    P('MGMT', 80, 12, 'ethernet', 1, 'right'),
  ],
});

const printer = def('detailed', {
  id: 'd-printer', name: 'Printer', category: 'Endpoints', prefix: 'prn', w: 64, h: 52,
  description: 'Office laser printer with paper tray',
  shapes: [
    // main body
    rect(2, 10, 60, 28, '#dfe3e7'),
    rect(2, 10, 60, 1, '#f3f4f5'),
    // top step with the output tray recess and a printed sheet
    rect(2, 4, 60, 6, '#cfd4d9'),
    rect(7, 5.4, 34, 4.6, '#3a3f45'),
    rect(9, 7.2, 30, 2.8, '#eef0f2'),
    rect(11, 8, 18, 0.5, '#aab1b8', { opacity: 0.8 }),
    // control panel (raised, right)
    rect(44, 2, 16, 8, '#3a3f45'),
    rect(45.4, 3.4, 7.6, 5.2, K.lcd),
    rect(46.4, 4.4, 4.6, 0.7, K.lcdTxt, { opacity: 0.85 }), rect(46.4, 6, 3, 0.7, K.lcdTxt, { opacity: 0.6 }),
    circ(55.2, 5.2, 1.1, '#aab1b8'), circ(58.2, 5.2, 1.1, '#aab1b8'),
    ...led(55.2, 8.6, K.green, 0.45), ...led(58.2, 8.6, K.off, 0.45),
    // front door (toner access) with recessed handle
    rect(6, 15, 38, 19, '#d0d5da'),
    rect(6, 15, 38, 0.8, '#bfc5ca'),
    rect(19, 30, 12, 1.6, '#aab1b8'),
    // right side vent
    ...hvents(49, 16, 9, 14, 6, '#aab1b8'),
    // paper tray drawer
    rect(2, 38, 60, 9.5, '#c4c9ce'),
    rect(2, 38, 60, 1, '#aab1b8'),
    rect(22, 41, 20, 3.2, '#3a3f45'),
    rect(24, 42, 16, 1.2, '#5c656d'),
    // feet
    rect(6, 47.5, 8, 2.5, '#4a5057'), rect(50, 47.5, 8, 2.5, '#4a5057'),
  ],
  ports: [
    P('ETH', 32, 50, 'ethernet', 1, 'bottom'),
    P('USB', 62, 24, 'usb', 1, 'right'),
    P('WLAN', 24, 4, 'wireless', 1, 'top'),
  ],
});

const ipPhone = def('detailed', {
  id: 'd-ip-phone', name: 'IP Phone', category: 'Endpoints', prefix: 'ph', w: 60, h: 46,
  description: 'Desk IP phone with display and handset',
  shapes: [
    // handset (left), resting in its cradle
    rect(4, 7, 7, 30, '#1f2225'),
    rect(2, 4, 11, 7, '#2a2e32'), rect(2, 33, 11, 7, '#2a2e32'),
    rect(3.5, 5.5, 8, 1.4, '#1a1c1f'), rect(3.5, 37.5, 8, 1.4, '#1a1c1f'),
    // body
    rect(13, 2, 45, 42, '#3a3f45'),
    rect(13, 2, 45, 1, '#4a5057'),
    rect(13, 42, 45, 2, '#24272b'),
    // display
    rect(16, 5, 39, 15, '#14171a'),
    ...screenArt(17.5, 6.5, 36, 12),
    rect(19, 8, 14, 1, K.lcdTxt, { opacity: 0.85 }), rect(19, 10.4, 8, 0.8, K.lcdTxt, { opacity: 0.6 }),
    rect(19, 15.5, 32, 1.6, '#0f1720', { opacity: 0.55 }),
    // soft keys under the display, line keys at the right of the keypad
    ...repeat(4, (i) => rect(18 + i * 9.2, 21.5, 7, 1.8, '#5c656d')),
    // keypad 3 × 4
    ...repeat(12, (i) => rect(17 + (i % 3) * 7, 25.5 + Math.floor(i / 3) * 4, 5.6, 2.8, '#cfd4d9')),
    // navigation cluster + call / mute keys
    circ(46, 29.5, 4.2, '#5c656d'), circ(46, 29.5, 1.6, '#3a3f45'),
    rect(41.5, 35.5, 9, 2.4, '#2fae6a'), rect(41.5, 38.8, 9, 2.4, K.red),
    ...led(54.5, 7.5, K.green, 0.5),
    rect(52.5, 25.5, 4, 2.2, '#5c656d'), rect(52.5, 29, 4, 2.2, '#5c656d'), rect(52.5, 32.5, 4, 2.2, '#5c656d'),
  ],
  ports: [
    P('ETH', 35, 44, 'ethernet', 1, 'bottom'),
    P('PC', 58, 30, 'ethernet', 1, 'right'),
  ],
});

const mobile = def('detailed', {
  id: 'd-mobile', name: 'Smartphone', category: 'Endpoints', prefix: 'mob', w: 30, h: 56,
  description: 'Smartphone (Wi-Fi client)',
  shapes: [
    rect(2, 0, 26, 56, '#1e2124'),
    rect(2, 0, 26, 0.8, '#3a3f45'),
    // side buttons
    rect(0.9, 13, 1.1, 5, '#3a3f45'), rect(0.9, 20, 1.1, 5, '#3a3f45'), rect(28, 16, 1.1, 8, '#3a3f45'),
    // screen with status bar and app grid
    ...screenArt(3.8, 4.2, 22.4, 46.4),
    rect(5.5, 5.5, 5, 0.9, K.lcdTxt, { opacity: 0.8 }), rect(21, 5.5, 3.6, 0.9, K.lcdTxt, { opacity: 0.8 }),
    ...repeat(12, (i) => rect(6.2 + (i % 4) * 4.7, 11 + Math.floor(i / 4) * 5.2, 3.4, 3.4, '#ffffff', { opacity: 0.35 })),
    ...repeat(4, (i) => rect(6.2 + i * 4.7, 44.8, 3.4, 3.4, '#ffffff', { opacity: 0.5 })),
    // earpiece, camera, home indicator
    rect(11, 1.8, 8, 0.9, '#3a3f45'), circ(21.5, 2.2, 0.75, '#3a3f45'),
    rect(10, 52.6, 10, 1, '#5a6168'),
  ],
  ports: [
    P('WLAN', 15, 0, 'wireless', 1, 'top'),
    P('USB', 15, 56, 'usb', 1, 'bottom'),
  ],
});

const tablet = def('detailed', {
  id: 'd-tablet', name: 'Tablet', category: 'Endpoints', prefix: 'tab', w: 58, h: 42,
  description: 'Tablet (Wi-Fi client), landscape',
  shapes: [
    rect(0, 1, 58, 40, '#1e2124'),
    rect(0, 1, 58, 0.8, '#3a3f45'),
    rect(8, 0.2, 6, 0.9, '#3a3f45'), rect(16, 0.2, 3, 0.9, '#3a3f45'),
    // screen
    ...screenArt(3.4, 4.2, 51.2, 33.6),
    rect(5.2, 5.6, 6, 0.9, K.lcdTxt, { opacity: 0.8 }), rect(49, 5.6, 4, 0.9, K.lcdTxt, { opacity: 0.8 }),
    ...repeat(12, (i) => rect(7.5 + (i % 6) * 7.5, 10.5 + Math.floor(i / 6) * 7.5, 5, 5, '#ffffff', { opacity: 0.35 })),
    ...repeat(5, (i) => rect(12 + i * 7.5, 31.5, 5, 4.4, '#ffffff', { opacity: 0.5 })),
    // camera
    circ(29, 2.6, 0.75, '#3a3f45'),
  ],
  ports: [
    P('WLAN', 29, 1, 'wireless', 1, 'top'),
    P('USB', 29, 41, 'usb', 1, 'bottom'),
  ],
});

const ups = def('detailed', {
  id: 'd-ups', name: 'UPS', category: 'Power', prefix: 'ups', w: 36, h: 60,
  description: 'Tower UPS with LCD status display',
  shapes: [
    // tower body + darker front bezel
    rect(3, 1, 30, 55, K.dk),
    rect(3, 1, 30, 1.2, K.dkHi),
    rect(6, 4.5, 24, 49, K.panel),
    rect(6, 4.5, 24, 0.8, '#2f3337'),
    // top LEDs
    ...led(10, 8.5, K.green, 0.6), bar(11.8, 8.2, 4.5, '#aab1b8', 0.5),
    ...led(19, 8.5, K.amber, 0.6, false), bar(20.8, 8.2, 4.5, '#aab1b8', 0.5),
    // LCD: load / battery bars
    rect(8.5, 12, 19, 13, '#14171a'),
    rect(9.9, 13.4, 16.2, 10.2, K.lcd),
    rect(11.2, 14.8, 8, 1.1, K.lcdTxt, { opacity: 0.85 }),
    ...repeat(5, (i) => rect(11.2 + i * 2.8, 17.2, 2, 2.2, K.lcdTxt, { opacity: i < 4 ? 0.85 : 0.3 })),
    rect(11.2, 20.6, 5.5, 1, K.lcdTxt, { opacity: 0.6 }), rect(19.5, 20.6, 5.5, 1, K.lcdTxt, { opacity: 0.6 }),
    // power button + function keys
    circ(13, 29.5, 2, '#3a4046'), circ(13, 29.5, 1, K.green),
    rect(18, 28.4, 3.4, 2.2, '#4a5158'), rect(22.6, 28.4, 3.4, 2.2, '#4a5158'),
    // grille
    ...hvents(9, 34, 18, 16, 7),
    // base / feet
    rect(1, 56, 34, 3, '#1d2023'),
  ],
  ports: [
    P('ETH', 18, 1, 'ethernet', 1, 'top'),
    P('USB', 33, 30, 'usb', 1, 'right'),
    P('PWR', 18, 59, 'power', 0, 'bottom'),
  ],
});

const databaseServer = def('detailed', {
  id: 'd-database', name: 'Database Server', category: 'Compute', prefix: 'db', w: 84, h: 34,
  description: '2U database server with locking front bezel',
  shapes: [
    ...chassis(4.5, 75, 34),
    ...rackEars(84, 34),
    // locking bezel: grey frame, perforated grille, LCD + key lock on the left
    rect(6.5, 2.4, 71, 29.2, '#4a5058'),
    rect(6.5, 2.4, 71, 1, '#5c636b'),
    ...lcd(9, 6, 16, 9, 2),
    ...led(11.5, 19, K.green, 0.6), bar(13.2, 18.7, 6, '#aab1b8', 0.5),
    ...led(11.5, 22.5, K.blue, 0.6), bar(13.2, 22.2, 6, '#aab1b8', 0.5),
    ...led(11.5, 26, K.off, 0.6), bar(13.2, 25.7, 6, '#aab1b8', 0.5),
    circ(22.5, 24.5, 2, K.greyLo), rect(21.7, 23.4, 1.6, 2.2, '#3d4248'),
    // grille: two bands of vertical slots
    ...vents(28, 5, 47.5, 10.6, 19, '#2a2e32'),
    ...vents(28, 17.8, 47.5, 10.6, 19, '#2a2e32'),
    // blue status light bar across the bottom of the bezel
    rect(28, 29.3, 47.5, 0.9, K.blue, { opacity: 0.7 }),
    // pull-out service tag
    rect(66, 30.6, 6, 1.6, K.tag),
  ],
  ports: [
    P('ETH0', 30, 0, 'ethernet', 1, 'top'),
    P('ETH1', 54, 34, 'ethernet', 1, 'bottom'),
    P('MGMT', 84, 17, 'ethernet', 1, 'right'),
  ],
});

/** 3.5" drive carrier: dark body, metal latch handle with blue release tab, slotted face, two LEDs */
const carrier = (x: number, y: number, w: number, h: number, act: boolean): Shape[] => [
  rect(x, y, w, h, '#3c4248'),
  rect(x + 3.6, y + 0.5, w - 4.1, h - 1, '#24272b'),
  rect(x + 0.5, y + 0.5, 2.6, h - 1, K.metalLo),
  rect(x + 0.5, y + 0.5, 2.6, 2.2, K.blue),
  ...repeat(3, (i) => rect(x + 4.8, y + 1.8 + i * 2.2, w - 9, 0.9, '#15171a')),
  ...led(x + w - 2, y + 2.2, act ? K.green : K.off, 0.5),
  ...led(x + w - 2, y + 4.6, K.off, 0.5, false),
];

const storageArray = def('detailed', {
  id: 'd-storage-array', name: 'Storage Array / SAN', category: 'Compute', prefix: 'san', w: 84, h: 34,
  description: '2U 12-bay storage array (SAN shelf)',
  shapes: [
    ...chassis(4.5, 75, 34),
    ...rackEars(84, 34),
    // 3 × 4 drive carriers
    ...repeat(12, (i) => carrier(7 + (i % 4) * 17.5, 2.6 + Math.floor(i / 4) * 9.9, 17, 9.4, i !== 5 && i !== 10)),
    // service tag
    rect(39, 30.6, 6, 1.6, K.tag),
  ],
  ports: [
    P('FC1', 0, 17, 'fiber', 1, 'left'),
    P('FC2', 84, 17, 'fiber', 1, 'right'),
    P('MGMT', 42, 0, 'ethernet', 1, 'top'),
  ],
});

export const DETAILED_MORE_IT_DEFS: DeviceDef[] = [
  wirelessController, loadBalancer, modemOnt, patchPanel, mediaConverter, vpnGateway,
  printer, ipPhone, mobile, tablet, ups, databaseServer, storageArray,
];
