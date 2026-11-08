import type { DeviceDef, Shape } from '../model/types';
import { OT_FIELDS, P, circ, def, line, poly, rect, repeat } from './draw';

// Detailed (front-view illustration) style — second batch of industrial / OT devices.
// Same visual language as detailed-ot.ts: slate housings, darker separators, teal label bars,
// tiny LEDs. Solid blocks only (square corners, no outlines, flat fills) — see docs/ICON_GUIDE.md.

/* ---------- palette (mirrors detailed-ot.ts) ---------- */
const SLATE = '#64778a'; // housing
const SLATE_L = '#7a8da0'; // highlight edge
const SLATE_D = '#4e5f71'; // caps / bevels
const SLATE_DD = '#3e4c5a'; // separators / terminal strips
const TEAL = '#14907f';
const CHAR = '#2f363e'; // charcoal (bezels, blocks)
const CHAR_L = '#454f5a';
const HOLE = '#1f252b';
const METAL = '#b4bdc6';
const METAL_D = '#87929d';
const COVER = '#9ebdd9'; // light-blue module front covers
const COVER_L = '#d6e6f3';
const GREEN = '#3ddc6a';
const AMBER = '#f2b33d';
const RED = '#e5534b';
const LED_OFF = '#cfd8e0';
const YELLOW = '#f5c518'; // safety accent
const LASER = '#ff3b30';
const BLUE = '#3b7fc4'; // manual-override buttons
const FACE = '#f08a24'; // proximity-sensor sensing face

/* ---------- small parts (copied from detailed-ot.ts, not exported there) ---------- */
const led = (cx: number, cy: number, c: string, r = 0.75): Shape => circ(cx, cy, r, c);
const sqLed = (x: number, y: number, c: string): Shape => rect(x, y, 1.5, 1.1, c);

/** terminal strip with screw heads */
const terminals = (x: number, y: number, w: number, h: number, n: number): Shape[] => {
  const step = w / n;
  return [
    rect(x, y, w, h, SLATE_DD),
    ...repeat(n, (i) => [
      circ(x + step * (i + 0.5), y + h / 2, Math.min(step, h) * 0.3, '#a9b5c1'),
      rect(x + step * (i + 0.5) - Math.min(step, h) * 0.22, y + h / 2 - 0.15, Math.min(step, h) * 0.44, 0.3, '#5d6b79'),
    ]),
  ];
};

/** RJ45 jack, front view (bottom inset > 1.2 so solidify keeps the frame) */
const rj45 = (x: number, y: number, w = 7, h = 6, frame = '#d3d9df'): Shape[] => [
  rect(x, y, w, h, frame),
  rect(x + 0.9, y + 0.9, w - 1.8, h - 2.5, HOLE),
  rect(x + w / 2 - 1.2, y + h - 1.5, 2.4, 0.9, HOLE),
  rect(x + 1.4, y + 1.3, w - 2.8, 0.5, '#c9a54a', { opacity: 0.8 }),
];

/** USB-A socket, front view */
const usbA = (x: number, y: number, w = 7, h = 3.4, frame = '#d3d9df'): Shape[] => [
  rect(x, y, w, h, frame),
  rect(x + 0.8, y + 0.8, w - 1.6, h - 1.6, HOLE),
  rect(x + 1.4, y + 1.2, w - 2.8, 0.8, '#5d6b79'),
];

/** M12 round connector, front view */
const m12 = (cx: number, cy: number, r: number): Shape[] => [
  circ(cx, cy, r, METAL),
  circ(cx, cy, r * 0.78, METAL_D),
  circ(cx, cy, r * 0.6, '#252b31'),
  ...[0, 1, 2, 3].map((i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    return circ(cx + Math.cos(a) * r * 0.32, cy + Math.sin(a) * r * 0.32, r * 0.09, '#d4b45c');
  }),
  circ(cx - r * 0.3, cy - r * 0.35, r * 0.28, '#ffffff', { opacity: 0.25 }),
];

/** 7-segment digit built from filled bars (segments a..g as in the usual layout) */
const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
const seg7 = (ch: string, x: number, y: number, w: number, h: number, c: string, t = 0.5): Shape[] => {
  const on = SEG[ch] ?? '';
  const vh = h / 2 - t * 1.5;
  const parts: Record<string, Shape> = {
    a: rect(x + t, y, w - 2 * t, t, c),
    b: rect(x + w - t, y + t, t, vh, c),
    c: rect(x + w - t, y + h / 2 + t / 2, t, vh, c),
    d: rect(x + t, y + h - t, w - 2 * t, t, c),
    e: rect(x, y + h / 2 + t / 2, t, vh, c),
    f: rect(x, y + t, t, vh, c),
    g: rect(x + t, y + h / 2 - t / 2, w - 2 * t, t, c),
  };
  return on.split('').map((k) => parts[k]);
};

/* ---------- devices ---------- */

const industrialPc = def('detailed', {
  id: 'd-industrial-pc', name: 'Industrial PC', category: 'Industrial', prefix: 'ipc', w: 60, h: 46, fields: OT_FIELDS,
  description: 'Fanless box PC with top cooling fins',
  shapes: [
    // heatsink fins on top
    rect(2, 0, 56, 9, SLATE_DD),
    ...repeat(14, (i) => rect(3.2 + i * 4, 0, 2.2, 9, SLATE_D)),
    ...repeat(14, (i) => rect(3.2 + i * 4, 0, 2.2, 0.7, SLATE_L)),
    // housing
    rect(0, 9, 60, 36, SLATE),
    rect(0, 9, 60, 0.8, SLATE_L),
    poly([[0, 46], [60, 46], [60, 44.4], [6, 44.4]], SLATE_DD),
    // front I/O panel (recessed)
    rect(27, 13, 30, 29, '#56687a'),
    // left: label, status LEDs, power button, USB
    rect(4, 13, 14, 2.4, TEAL),
    rect(4, 18, 10, 3, SLATE_DD),
    led(6, 19.5, GREEN, 0.7), led(9, 19.5, AMBER, 0.7), led(12, 19.5, LED_OFF, 0.7),
    circ(21, 19.5, 2.3, CHAR), circ(21, 19.5, 1, GREEN),
    ...usbA(4, 24, 8, 3.6), ...usbA(4, 29, 8, 3.6),
    // SD slot + reset
    rect(14, 25, 8, 2, HOLE),
    circ(18, 31, 1.1, SLATE_DD), circ(18, 31, 0.45, HOLE),
    // display connector
    rect(29.5, 15.5, 22, 7, '#d3d9df'),
    rect(31.5, 17.2, 18, 3.6, HOLE),
    ...repeat(8, (i) => rect(33 + i * 2, 18.2, 0.8, 0.8, '#8c96a0')),
    ...repeat(8, (i) => rect(33 + i * 2, 19.6, 0.8, 0.8, '#8c96a0')),
    // COM (DB9) + audio
    rect(31, 25, 9, 4, '#d3d9df'),
    poly([[32.2, 25.9], [38.8, 25.9], [38.2, 28.2], [32.8, 28.2]], HOLE),
    circ(45, 27, 1.5, '#d3d9df'), circ(45, 27, 0.7, HOLE),
    circ(50, 27, 1.5, '#d3d9df'), circ(50, 27, 0.7, HOLE),
    // ethernet pair
    ...rj45(31, 32, 9, 8), ...rj45(42, 32, 9, 8),
    led(32.5, 40.9, GREEN, 0.5), led(38.5, 40.9, AMBER, 0.5),
    led(43.5, 40.9, GREEN, 0.5), led(49.5, 40.9, LED_OFF, 0.5),
    // power terminal
    ...terminals(53, 32, 4, 8, 1),
    // screws
    circ(2.2, 12, 0.8, SLATE_DD), circ(57.8, 12, 0.8, SLATE_DD),
    circ(2.2, 42.5, 0.8, SLATE_DD), circ(57.8, 42.5, 0.8, SLATE_DD),
  ],
  ports: [
    P('ETH0', 35.5, 46, 'ethernet', 1, 'bottom'),
    P('ETH1', 60, 36, 'ethernet', 1, 'right'),
    P('USB', 0, 28, 'usb', 1, 'left'),
  ],
});

const remoteIo = def('detailed', {
  id: 'd-remote-io', name: 'Remote I/O', category: 'Industrial', prefix: 'rio', w: 34, h: 68, fields: OT_FIELDS,
  description: 'Slim DIN-rail I/O station with push-in terminals and channel LEDs',
  shapes: [
    rect(1, 0, 32, 68, SLATE),
    rect(1, 0, 1.6, 68, '#45566a'), rect(31.4, 0, 1.6, 68, '#45566a'),
    // top cap with bus-in jack and status LEDs
    rect(1, 0, 32, 8.5, SLATE_D),
    ...rj45(13, 1.2, 8, 6.3),
    rect(3.5, 1.5, 7.5, 5.5, SLATE_DD),
    led(5.5, 3, GREEN, 0.6), led(8.9, 3, GREEN, 0.6), led(5.5, 5.5, LED_OFF, 0.6), led(8.9, 5.5, AMBER, 0.6),
    rect(23, 1.5, 7.5, 5.5, SLATE_DD),
    led(25, 3, GREEN, 0.6), led(28.4, 3, LED_OFF, 0.6), led(25, 5.5, LED_OFF, 0.6), led(28.4, 5.5, LED_OFF, 0.6),
    rect(1, 8.5, 32, 0.7, SLATE_L),
    rect(4, 10.5, 13, 2.2, TEAL),
    // two push-in terminal columns with channel LED columns beside them
    rect(7, 14.5, 7.5, 43, '#56687a'), rect(20.5, 14.5, 7.5, 43, '#56687a'),
    ...repeat(8, (r) => {
      const y = 15.5 + r * 5.3;
      return [
        rect(8, y, 5.5, 2.1, '#a9b5c1'), rect(8, y + 2.5, 5.5, 1.7, HOLE),
        rect(21.5, y, 5.5, 2.1, '#a9b5c1'), rect(21.5, y + 2.5, 5.5, 1.7, HOLE),
        sqLed(3.6, y + 1.4, r === 0 || r === 2 || r === 5 ? GREEN : LED_OFF),
        sqLed(29, y + 1.4, r === 1 || r === 6 ? GREEN : LED_OFF),
      ];
    }),
    // bottom cap with bus-out jack
    rect(1, 59.5, 32, 8.5, SLATE_D),
    rect(1, 59.5, 32, 0.7, '#45566a'),
    ...rj45(13, 61, 8, 6.3),
    circ(6, 64, 1.1, SLATE_DD), circ(6, 64, 0.45, HOLE),
    circ(28, 64, 1.1, SLATE_DD), circ(28, 64, 0.45, HOLE),
    poly([[1, 68], [33, 68], [33, 66.6], [5, 66.6]], SLATE_DD),
  ],
  ports: [
    P('X1 P1', 17, 0, 'profinet', 1, 'top'), P('X1 P2', 17, 68, 'profinet', 1, 'bottom'),
    P('IO1', 1, 34, 'iolink', 1, 'left'), P('IO2', 33, 34, 'iolink', 1, 'right'),
  ],
});

const vfd = def('detailed', {
  id: 'd-vfd', name: 'Frequency Inverter (VFD)', category: 'Industrial', prefix: 'vfd', w: 36, h: 70, fields: OT_FIELDS,
  description: 'Variable-frequency drive with operator keypad and top fan grille',
  shapes: [
    // fan grille
    rect(2, 0, 32, 9, SLATE_DD),
    ...repeat(5, (i) => line([[4, 1.6 + i * 1.5], [32, 1.6 + i * 1.5]], '#56687a', 0.55)),
    ...repeat(7, (i) => rect(4.5 + i * 4.2, 0.6, 1, 7.6, SLATE_DD)),
    // housing
    rect(0, 9, 36, 61, SLATE),
    rect(0, 9, 36, 0.8, SLATE_L),
    rect(0, 9, 2.4, 61, SLATE_D), rect(33.6, 9, 2.4, 61, SLATE_D),
    poly([[0, 70], [36, 70], [36, 68.6], [5, 68.6]], SLATE_DD),
    // operator panel: display + LEDs
    rect(4.5, 12, 27, 30, CHAR),
    rect(6.5, 14, 23, 10, '#171d23'),
    ...seg7('5', 8.5, 16, 3.4, 6, '#47d98a'), ...seg7('0', 13.3, 16, 3.4, 6, '#47d98a'),
    rect(17.6, 21.5, 0.7, 0.7, '#47d98a'),
    ...seg7('0', 19.4, 16, 3.4, 6, '#47d98a'),
    rect(24.5, 16, 4, 1.1, '#47d98a', { opacity: 0.6 }), rect(24.5, 18.2, 2.6, 1.1, '#47d98a', { opacity: 0.35 }),
    led(8.5, 26.3, GREEN, 0.65), led(12, 26.3, AMBER, 0.65), led(15.5, 26.3, LED_OFF, 0.65),
    // keypad
    ...repeat(2, (r) => repeat(3, (c) => rect(6.5 + c * 7.4, 28.5 + r * 4.4, 5.6, 3.2, '#48535f'))),
    circ(10.5, 38.5, 2.2, '#2fb565'), circ(16.5, 38.5, 2.2, '#c9463e'),
    rect(22, 37.5, 7.6, 3, '#48535f'),
    rect(6.5, 44, 12, 2, TEAL),
    // fieldbus jacks + option slot
    ...rj45(4.5, 48, 8, 6.5), ...rj45(13.5, 48, 8, 6.5),
    led(5.5, 55.6, GREEN, 0.5), led(11.5, 55.6, GREEN, 0.5), led(14.5, 55.6, GREEN, 0.5), led(20.5, 55.6, LED_OFF, 0.5),
    rect(24, 48.5, 7.5, 5.5, SLATE_DD), rect(25.5, 49.5, 4.5, 1.2, HOLE), rect(25.5, 52, 4.5, 1.2, HOLE),
    // control terminals + motor terminals
    ...terminals(4.5, 57.5, 27, 4, 7),
    ...terminals(9, 62.6, 18, 5, 3),
  ],
  ports: [
    P('X1 P1', 8.5, 0, 'profinet', 1, 'top'),
    P('X1 P2', 0, 51, 'profinet', 1, 'left'),
    P('MOTOR', 18, 70, 'power', 1, 'bottom'),
  ],
});

const fModule = (x: number, i: number): Shape[] => [
  rect(x, 0, 12, 56, SLATE),
  rect(x, 0, 12, 5, SLATE_D),
  rect(x + 2, 1.3, 8, 2.4, SLATE_DD),
  led(x + 3.6, 2.5, i === 2 ? LED_OFF : GREEN, 0.55), led(x + 6, 2.5, LED_OFF, 0.55), led(x + 8.4, 2.5, i === 1 ? RED : LED_OFF, 0.55),
  rect(x + 1.4, 8.6, 9.2, 44.6, SLATE_D),
  rect(x + 2.1, 9.4, 7.8, 43, COVER),
  rect(x + 2.1, 9.4, 7.8, 0.6, COVER_L),
  rect(x + 2.1, 10, 7.8, 3.6, YELLOW),
  ...repeat(2, (k) => rect(x + 3.3, 17 + k * 3, 5.4, 1, '#7b9bba')),
  poly([[x, 56], [x + 12, 56], [x + 12, 54.6], [x + 3, 54.6]], SLATE_DD),
  rect(x + 12, 0, 2, 56, '#45566a'),
];

const safetyPlc = def('detailed', {
  id: 'd-safety-plc', name: 'Safety PLC', category: 'Industrial', prefix: 'fplc', w: 68, h: 56, fields: OT_FIELDS,
  description: 'Fail-safe modular PLC (F-CPU with F-I/O modules, yellow safety band)',
  shapes: [
    // F-CPU
    rect(0, 0, 26, 56, SLATE),
    rect(0, 0, 26, 5, SLATE_D),
    rect(7, 1.3, 12, 2.4, SLATE_DD),
    led(9.5, 2.5, GREEN, 0.6), led(13, 2.5, LED_OFF, 0.6), led(16.5, 2.5, LED_OFF, 0.6),
    rect(2.5, 8, 21, 22, '#344250'),
    rect(4.5, 10, 17, 2.4, YELLOW),
    rect(4.5, 14.5, 17, 13.5, '#41505f'),
    rect(6, 17, 9, 1, '#8fb3cf', { opacity: 0.7 }), rect(6, 19.3, 13, 1, '#8fb3cf', { opacity: 0.45 }),
    rect(6, 21.6, 7, 1, '#8fb3cf', { opacity: 0.45 }), rect(6, 23.9, 11, 1, '#8fb3cf', { opacity: 0.45 }),
    rect(4.5, 33, 17, 18.5, '#5a6c7f'),
    ...([[11.6, 35], [8.2, 38.4], [11.6, 38.4], [15, 38.4], [11.6, 41.8], [6.2, 46.5], [17, 46.5]] as [number, number][]).map(([x, y]) =>
      rect(x, y, 2.8, 2.8, SLATE_DD)),
    rect(4.5, 33, 17, 1.8, TEAL),
    poly([[0, 56], [26, 56], [26, 54.6], [4, 54.6]], SLATE_DD),
    rect(26, 0, 2, 56, '#45566a'),
    // F-I/O modules
    ...fModule(28, 0), ...fModule(42, 1), ...fModule(56, 2).slice(0, -1),
    // continuous safety band under the caps
    rect(0, 5.4, 68, 2.2, YELLOW),
  ],
  ports: [
    P('X1 P1', 13, 0, 'profinet', 1, 'top'), P('X1 P2', 13, 56, 'profinet', 1, 'bottom'),
    P('X2', 68, 30, 'ethernet', 1, 'right'),
  ],
});

const barcodeScanner = def('detailed', {
  id: 'd-barcode-scanner', name: 'Barcode / Code Reader', category: 'Industrial', prefix: 'scn', w: 42, h: 36, fields: OT_FIELDS,
  description: 'Fixed-mount code reader with scan window',
  shapes: [
    // mounting bosses
    rect(5, 0, 6, 3, METAL_D), rect(31, 0, 6, 3, METAL_D),
    rect(5, 33, 6, 3, METAL_D), rect(31, 33, 6, 3, METAL_D),
    // housing
    rect(0, 2.5, 42, 31, SLATE),
    rect(0, 2.5, 42, 0.8, SLATE_L),
    poly([[0, 33.5], [42, 33.5], [42, 32.2], [5, 32.2]], SLATE_DD),
    // bezel + scan window
    rect(2.5, 5.5, 37, 25, CHAR),
    rect(4.5, 7.5, 25, 21, '#11161b'),
    poly([[4.5, 7.5], [18, 7.5], [10, 28.5], [4.5, 28.5]], '#ffffff', { opacity: 0.045 }),
    rect(6.5, 16.6, 21, 2.8, LASER, { opacity: 0.22 }),
    rect(6.5, 17.5, 21, 1, LASER),
    circ(17, 11.5, 1.6, '#2b3a47'), circ(17, 11.5, 0.8, '#5b7f9d', { opacity: 0.8 }),
    rect(7, 25, 2, 2, '#3b4652'), rect(25, 25, 2, 2, '#3b4652'),
    // side strip: LEDs, trigger button, label
    rect(31.5, 7.5, 6.5, 21, CHAR_L),
    led(34.75, 10, GREEN, 0.8), led(34.75, 13.2, AMBER, 0.8), led(34.75, 16.4, LED_OFF, 0.8),
    rect(32.8, 19.5, 3.9, 2.8, SLATE_DD),
    rect(32.5, 24.5, 4.5, 2, TEAL),
    // bottom connectors
    rect(14, 30.5, 6, 2.5, '#d3d9df'), rect(15.2, 31.3, 3.6, 1.5, HOLE),
  ],
  ports: [
    P('ETH', 17, 36, 'ethernet', 1, 'bottom'),
    P('USB', 42, 21, 'usb', 1, 'right'),
  ],
});

const sensor = def('detailed', {
  id: 'd-sensor', name: 'Sensor (M12)', category: 'Industrial', prefix: 'sen', w: 24, h: 62, fields: OT_FIELDS,
  description: 'M12 cylindrical proximity sensor with cable (side view)',
  shapes: [
    // cable + moulded connector with knurled nut
    rect(10.8, 0, 2.4, 12, '#2b3138'),
    rect(8.5, 10.5, 7, 7, CHAR),
    rect(8, 16, 8, 2.8, METAL_D),
    ...repeat(4, (i) => rect(8.6 + i * 1.9, 16, 0.7, 2.8, '#6f7a85')),
    // status LED ring
    rect(7.5, 19, 9, 2.6, SLATE_DD),
    rect(8.5, 19.6, 7, 1.4, GREEN),
    // threaded barrel
    rect(7.5, 21.6, 9, 32.4, '#aab4bd'),
    rect(7.5, 21.6, 1.4, 32.4, '#cdd4db'),
    rect(14.6, 21.6, 1.9, 32.4, '#7f8a95'),
    ...repeat(18, (i) => rect(7.5, 23 + i * 1.7, 9, 0.5, '#8d98a3')),
    // two hex nuts with washers
    rect(3.5, 26, 17, 5, '#9aa5af'), rect(3.5, 26, 17, 0.9, '#c3cbd2'), rect(3.5, 30.1, 17, 0.9, '#6f7a85'),
    rect(9.2, 26.9, 5.6, 3.2, '#a9b3bc'),
    rect(3.5, 43, 17, 5, '#9aa5af'), rect(3.5, 43, 17, 0.9, '#c3cbd2'), rect(3.5, 47.1, 17, 0.9, '#6f7a85'),
    rect(9.2, 43.9, 5.6, 3.2, '#a9b3bc'),
    // sensing face
    rect(7.5, 54, 9, 2, SLATE_DD),
    rect(7.5, 56, 9, 6, FACE),
    rect(7.5, 56, 1.4, 6, '#f6a74f'), rect(14.6, 56, 1.9, 6, '#cf7118'),
  ],
  ports: [P('IO', 12, 0, 'iolink', 1, 'top')],
});

const actuator = def('detailed', {
  id: 'd-actuator', name: 'Actuator / Valve', category: 'Industrial', prefix: 'act', w: 64, h: 36, fields: OT_FIELDS,
  description: 'Pneumatic valve terminal with bus node',
  shapes: [
    // manifold base with push-in fittings
    rect(0, 24, 64, 10, SLATE_DD),
    rect(0, 24, 64, 0.8, '#56687a'),
    ...repeat(6, (i) => [
      circ(20 + i * 7.6, 29.3, 2.1, METAL), circ(20 + i * 7.6, 29.3, 1.35, '#3a434d'), circ(20 + i * 7.6, 29.3, 0.65, HOLE),
    ]),
    circ(8, 29.3, 2.4, METAL), circ(8, 29.3, 1.6, '#3a434d'), circ(8, 29.3, 0.8, HOLE),
    rect(0, 34, 64, 2, '#33404c'),
    // bus node
    rect(0, 0, 15, 25, CHAR),
    rect(0, 0, 15, 0.8, '#56616d'),
    ...m12(7.5, 6.5, 4),
    rect(2.5, 12.5, 10, 2, TEAL),
    rect(2.5, 16.5, 10, 6, HOLE),
    led(4.8, 18.2, GREEN, 0.65), led(7.5, 18.2, GREEN, 0.65), led(10.2, 18.2, LED_OFF, 0.65),
    led(4.8, 20.8, AMBER, 0.65), led(7.5, 20.8, LED_OFF, 0.65), led(10.2, 20.8, LED_OFF, 0.65),
    rect(15, 0, 1.5, 25, '#45566a'),
    // valve slices
    ...repeat(6, (i) => {
      const x = 16.5 + i * 7.6;
      return [
        rect(x, 1, 7.1, 24, SLATE),
        rect(x, 1, 7.1, 3.6, SLATE_D),
        led(x + 2.2, 2.8, i === 1 || i === 4 ? AMBER : GREEN, 0.6), led(x + 4.9, 2.8, i === 3 ? GREEN : LED_OFF, 0.6),
        circ(x + 3.55, 8.2, 1.7, BLUE), circ(x + 3.55, 8.2, 0.6, '#1f4f80'),
        rect(x + 1, 11.5, 5.1, 10.5, SLATE_D),
        rect(x + 1.8, 12.5, 3.5, 2.2, SLATE_DD),
        rect(x + 1.8, 16, 3.5, 4.5, '#56687a'),
        rect(x + 7.1, 1, 0.5, 24, '#45566a'),
      ];
    }),
    // end plate
    rect(62, 1, 2, 24, SLATE_D),
  ],
  ports: [P('IO', 7.5, 0, 'iolink', 1, 'top')],
});

export const DETAILED_MORE_OT_DEFS: DeviceDef[] = [
  industrialPc, remoteIo, vfd, safetyPlc, barcodeScanner, sensor, actuator,
];
