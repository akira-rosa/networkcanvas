import type { DeviceDef, Shape } from '../model/types';
import { A, OT_FIELDS, P, circ, def, grad, line, poly, rect, repeat, rrect } from './draw';

// Detailed (front-view illustration) style — industrial / OT / IoT devices.
// Flat orthographic product views: slate housings, darker separators, teal label bars, tiny LEDs.

/* ---------- palette ---------- */
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
const WHITE = '#eceff2';
const WHITE_S = '#cdd4db';
const EDGE = '#a5afb9';
const GREEN = '#3ddc6a';
const AMBER = '#f2b33d';
const RED = '#e5534b';
const LED_OFF = '#cfd8e0';

/* ---------- small parts ---------- */
const led = (cx: number, cy: number, c: string, r = 0.75): Shape => circ(cx, cy, r, c);
const sqLed = (x: number, y: number, c: string): Shape => rect(x, y, 1.5, 1.1, c, { radius: 0.2 });

/** terminal strip with screw heads */
const terminals = (x: number, y: number, w: number, h: number, n: number): Shape[] => {
  const step = w / n;
  return [
    rect(x, y, w, h, SLATE_DD, { radius: 0.6 }),
    ...repeat(n, (i) => [
      circ(x + step * (i + 0.5), y + h / 2, Math.min(step, h) * 0.3, '#a9b5c1'),
      rect(x + step * (i + 0.5) - Math.min(step, h) * 0.22, y + h / 2 - 0.15, Math.min(step, h) * 0.44, 0.3, '#5d6b79'),
    ]),
  ];
};

/** RJ45 jack, front view */
const rj45 = (x: number, y: number, w = 7, h = 6, frame = '#d3d9df'): Shape[] => [
  rect(x, y, w, h, frame, { radius: 0.5 }),
  rect(x + 0.9, y + 0.9, w - 1.8, h - 2.1, HOLE, { radius: 0.3 }),
  rect(x + w / 2 - 1.2, y + h - 1.3, 2.4, 0.8, HOLE),
  rect(x + 1.4, y + 1.3, w - 2.8, 0.5, '#c9a54a', { opacity: 0.8 }),
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

/** tapered link between two joint centres (robot), returns [body, shade] */
const limb = (x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, fill: string, shade: string): Shape[] => {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L;
  return [
    poly([[x1 + nx * r1, y1 + ny * r1], [x2 + nx * r2, y2 + ny * r2], [x2 - nx * r2, y2 - ny * r2], [x1 - nx * r1, y1 - ny * r1]], fill, { stroke: EDGE, strokeWidth: 0.5 }),
    poly([[x1 + nx * r1 * 0.95, y1 + ny * r1 * 0.95], [x2 + nx * r2 * 0.95, y2 + ny * r2 * 0.95], [x2 + nx * r2 * 0.35, y2 + ny * r2 * 0.35], [x1 + nx * r1 * 0.35, y1 + ny * r1 * 0.35]], shade),
  ];
};

/* ---------- devices ---------- */

const hmi = def('detailed', {
  id: 'd-hmi', name: 'HMI Panel', category: 'Industrial', prefix: 'hmi', w: 72, h: 54, fields: OT_FIELDS,
  description: 'Operator panel with touch screen and function keys',
  shapes: [
    rect(0, 0, 72, 54, CHAR, { radius: 3 }),
    rect(0.5, 0.5, 71, 53, 'none', { radius: 2.6, stroke: '#56616d', strokeWidth: 0.7 }),
    rect(4, 4, 64, 38, '#141a20', { radius: 1 }),
    rect(5, 5, 62, 36, '#1e2c39'),
    // header
    rect(5, 5, 62, 4, TEAL),
    rect(7, 6.4, 11, 1.2, '#d8f2ee', { radius: 0.4 }),
    rect(57, 6.4, 8, 1.2, '#a9e0d8', { radius: 0.4 }),
    // nav buttons
    ...repeat(4, (i) => rect(7, 11.5 + i * 7.3, 12, 5.4, i === 0 ? '#3b84b0' : '#2e4a61', { radius: 0.8 })),
    ...repeat(4, (i) => rect(9, 13.8 + i * 7.3, 6, 0.8, '#c8dceb', { opacity: i === 0 ? 0.95 : 0.55 })),
    // trend panel
    rect(22, 11.5, 43, 18, '#243a4d', { radius: 0.8 }),
    ...repeat(3, (i) => rect(24, 15 + i * 4.5, 39, 0.3, '#3d556b')),
    line([[24, 26], [29, 22.5], [34, 24], [39, 18], [44, 20], [49, 15.5], [54, 18.5], [59, 14.5], [63, 16]], '#5fd38a', 0.9),
    // bars + status tiles
    rect(22, 31.5, 43, 7.5, '#243a4d', { radius: 0.8 }),
    rect(24, 33, 18, 1.7, AMBER, { radius: 0.4 }),
    rect(24, 35.8, 12, 1.7, '#5aa9e6', { radius: 0.4 }),
    rect(51, 33, 5.5, 4.6, '#2fb565', { radius: 0.5 }),
    rect(58, 33, 5.5, 4.6, '#3a5266', { radius: 0.5 }),
    // glass glare
    poly([[5, 5], [34, 5], [20, 41], [5, 41]], '#ffffff', { opacity: 0.045 }),
    // keys
    led(7.5, 47.5, GREEN, 1),
    ...repeat(6, (i) => [
      rect(13 + i * 8, 45, 6, 4.6, '#48535f', { radius: 0.8 }),
      rect(13.6 + i * 8, 45.4, 4.8, 0.7, '#66727f', { radius: 0.3 }),
    ]),
    rect(63, 46.6, 5, 1.6, TEAL, { radius: 0.3 }),
  ],
  ports: [
    P('X1 P1', 22, 54, 'profinet', 1, 'bottom'), P('X1 P2', 50, 54, 'profinet', 1, 'bottom'),
    P('P3', 0, 27, 'profinet', 1, 'left'), P('P4', 72, 27, 'profinet', 1, 'right'),
  ],
});

const plcCompact = def('detailed', {
  id: 'd-plc-compact', name: 'PLC (compact)', category: 'Industrial', prefix: 'plc', w: 70, h: 50, fields: OT_FIELDS,
  description: 'Compact PLC with on-board I/O',
  shapes: [
    rect(0, 0, 70, 50, SLATE, { radius: 1 }),
    rect(0, 0, 70, 9.5, SLATE_D, { radius: 1 }),
    ...terminals(2, 2, 66, 5, 16),
    rect(0, 9.5, 70, 0.6, SLATE_L),
    rect(4, 12.5, 13, 3, TEAL),
    // upper I/O LED rail
    rect(0, 18, 70, 0.7, '#97a9ba'), rect(0, 18.7, 70, 2.3, '#56687a'),
    sqLed(3, 19.3, GREEN), sqLed(5.3, 19.3, LED_OFF), sqLed(7.6, 19.3, LED_OFF),
    ...repeat(8, (i) => sqLed(46 + i * 2.2, 19.3, i === 1 || i === 4 ? GREEN : LED_OFF)),
    // module separators
    rect(24, 21, 0.9, 16, SLATE_DD), rect(44, 21, 0.9, 16, SLATE_DD),
    // ethernet + signal board cover
    ...rj45(4, 26, 7, 6), ...rj45(13, 26, 7, 6),
    rect(28, 24, 13, 10, '#5b6d80', { radius: 0.6 }),
    rect(28, 24, 13, 0.6, SLATE_L),
    rect(31, 28.5, 7, 1.2, SLATE_DD, { radius: 0.3 }),
    // lower I/O LED rail
    rect(0, 37, 70, 0.7, '#97a9ba'), rect(0, 37.7, 70, 2.3, '#56687a'),
    ...repeat(8, (i) => sqLed(46 + i * 2.2, 38.3, i === 2 ? GREEN : LED_OFF)),
    ...repeat(4, (i) => sqLed(26 + i * 2.2, 38.3, i === 0 ? GREEN : LED_OFF)),
    ...terminals(2, 42, 66, 5, 16),
    poly([[0, 50], [70, 50], [70, 48.6], [6, 48.6]], SLATE_DD),
  ],
  ports: [
    P('X1 P1', 8, 50, 'profinet', 1, 'bottom'), P('X1 P2', 28, 50, 'profinet', 1, 'bottom'),
    P('P3', 0, 29, 'profinet', 1, 'left'), P('P4', 70, 29, 'profinet', 1, 'right'),
  ],
});

const ioModule = (x: number, i: number): Shape[] => [
  rect(x, 0, 13, 58, SLATE),
  rect(x, 0, 13, 5, SLATE_D),
  rect(x + 2.5, 1.4, 8, 2.4, SLATE_DD, { radius: 0.4 }),
  led(x + 4, 2.6, i === 1 ? AMBER : GREEN, 0.55), led(x + 6.5, 2.6, LED_OFF, 0.55),
  rect(x + 1.6, 7.2, 9.8, 47.6, SLATE_D, { radius: 0.5 }),
  rect(x + 2.4, 8, 8.2, 46, '#a3c2de', { gradient: grad(90, '#adcbe5', '#8eaecd') }),
  rect(x + 2.4, 8, 8.2, 0.6, '#d6e6f3'),
  poly([[x, 58], [x + 13, 58], [x + 13, 56.6], [x + 3, 56.6]], SLATE_DD),
  rect(x + 13, 0, 2, 58, '#45566a'),
];

const plcModular = def('detailed', {
  id: 'd-plc-modular', name: 'PLC (modular)', category: 'Industrial', prefix: 'plc', w: 75, h: 58, fields: OT_FIELDS,
  description: 'Rack PLC: CPU with display plus I/O modules',
  shapes: [
    // CPU
    rect(0, 0, 28, 58, SLATE),
    rect(0, 0, 28, 5, SLATE_D),
    rect(8, 1.4, 12, 2.4, SLATE_DD, { radius: 0.4 }),
    led(10.5, 2.6, GREEN, 0.6), led(14, 2.6, LED_OFF, 0.6), led(17.5, 2.6, LED_OFF, 0.6),
    rect(2.5, 8, 23, 23, '#344250', { radius: 0.8 }),
    rect(5, 10, 10, 2, TEAL),
    rect(5, 14, 18, 14.5, '#41505f', { gradient: grad(90, '#4a5a6b', '#36434f') }),
    rect(6.5, 16, 10, 1, '#8fb3cf', { opacity: 0.7 }), rect(6.5, 18.5, 14, 1, '#8fb3cf', { opacity: 0.45 }),
    rect(6.5, 21, 8, 1, '#8fb3cf', { opacity: 0.45 }), rect(6.5, 23.5, 12, 1, '#8fb3cf', { opacity: 0.45 }),
    rect(5, 35, 18, 18, '#5a6c7f', { radius: 0.6 }),
    ...([[12, 37], [8.5, 40.5], [12, 40.5], [15.5, 40.5], [12, 44], [6.5, 48.5], [17.5, 48.5]] as [number, number][]).map(([x, y]) =>
      rect(x, y, 2.8, 2.8, SLATE_DD, { radius: 0.3 })),
    poly([[0, 58], [28, 58], [28, 56.6], [4, 56.6]], SLATE_DD),
    rect(28, 0, 2, 58, '#45566a'),
    ...ioModule(30, 0), ...ioModule(45, 1), ...ioModule(60, 2).slice(0, -1),
  ],
  ports: [
    P('X1 P1', 7, 58, 'profinet', 1, 'bottom'), P('X1 P2', 21, 58, 'profinet', 1, 'bottom'),
    P('X2', 0, 32, 'ethernet', 1, 'left'), P('X3', 14, 0, 'ethernet', 1, 'top'),
  ],
});

const motorDriver = def('detailed', {
  id: 'd-motor-driver', name: 'Motor Driver', category: 'Industrial', prefix: 'drv', w: 30, h: 66, fields: OT_FIELDS,
  description: 'Servo drive, DIN-rail / panel mount',
  shapes: [
    rect(0, 0, 30, 66, SLATE_DD, { radius: 1 }),
    ...repeat(6, (i) => rect(0.6, 4 + i * 10, 2.2, 6, '#33404c', { radius: 0.4 })),
    rect(3.5, 0, 26.5, 66, SLATE, { radius: 1 }),
    rect(3.5, 0, 26.5, 0.7, SLATE_L),
    ...repeat(5, (i) => rect(6.5 + i * 4.6, 2.2, 2.6, 4.6, SLATE_DD, { radius: 0.8 })),
    ...terminals(6, 9, 21, 4.6, 4),
    // display + status
    rect(7, 16.5, 17, 7.5, '#171d23', { radius: 0.6 }),
    ...repeat(3, (i) => [
      rect(9 + i * 4.4, 18, 2.8, 4.4, 'none', { stroke: '#47d98a', strokeWidth: 0.55 }),
      rect(9 + i * 4.4, 20.05, 2.8, 0.3, '#47d98a'),
    ]),
    led(26.5, 18, GREEN, 0.7), led(26.5, 20.6, AMBER, 0.7), led(26.5, 23.2, LED_OFF, 0.7),
    rect(7, 26, 12, 1.8, TEAL),
    // fieldbus ports
    ...rj45(11, 30, 8, 6.5), ...rj45(11, 38.5, 8, 6.5),
    led(22, 31.4, GREEN, 0.6), led(22, 39.9, GREEN, 0.6),
    rect(7, 31, 2.4, 13, SLATE_D, { radius: 0.4 }),
    // encoder + motor connectors
    rect(8, 48, 14, 4, '#d3d9df', { radius: 1.6 }), rect(9.2, 48.9, 11.6, 2.2, HOLE, { radius: 1.1 }),
    ...terminals(6, 54, 21, 4.6, 4),
    rect(5, 60.4, 23, 3.6, METAL, { radius: 0.5 }),
    ...repeat(2, (i) => circ(9 + i * 15, 62.2, 0.8, METAL_D)),
  ],
  ports: [
    P('X1', 16, 0, 'profinet', 1, 'top'), P('X2', 16, 66, 'profinet', 1, 'bottom'),
    P('P1', 0, 33, 'profinet', 1, 'left'), P('P2', 30, 42, 'profinet', 1, 'right'),
  ],
});

const iolink = def('detailed', {
  id: 'd-iolink', name: 'IO-Link Master / Slave', category: 'Industrial', prefix: 'io', w: 40, h: 70, fields: OT_FIELDS,
  description: 'IP67 IO-Link master block with M12 ports',
  shapes: [
    rect(2, 0, 36, 70, CHAR, { radius: 3 }),
    rect(2.5, 0.5, 35, 69, 'none', { radius: 2.7, stroke: '#525d68', strokeWidth: 0.7 }),
    rect(5, 3, 30, 64, CHAR_L, { radius: 2 }),
    // fieldbus in/out
    ...m12(12, 9.5, 4.4), ...m12(28, 9.5, 4.4),
    led(20, 7.5, GREEN, 0.7), led(20, 11.5, AMBER, 0.7),
    rect(9, 16.5, 22, 2.2, TEAL, { radius: 0.3 }),
    // 8 IO-Link ports, two columns
    ...repeat(4, (r) => [
      ...m12(12, 25 + r * 10, 3.8), ...m12(28, 25 + r * 10, 3.8),
      led(18.3, 25 + r * 10, r === 1 ? AMBER : GREEN, 0.6), led(21.7, 25 + r * 10, r === 3 ? LED_OFF : GREEN, 0.6),
    ]),
    // power in
    ...m12(20, 62, 3.6),
    circ(9, 63.5, 1.2, HOLE), circ(31, 63.5, 1.2, HOLE),
  ],
  ports: [
    P('X1', 12, 0, 'ethernet', 1, 'top'), P('X2', 28, 0, 'ethernet', 1, 'top'),
    P('IO1', 2, 25, 'iolink', 1, 'left'), P('IO2', 2, 45, 'iolink', 1, 'left'),
    P('IO3', 38, 25, 'iolink', 1, 'right'), P('IO4', 38, 45, 'iolink', 1, 'right'),
  ],
});

const vision = def('detailed', {
  id: 'd-vision', name: 'Vision Sensor', category: 'Industrial', prefix: 'vis', w: 44, h: 50, fields: OT_FIELDS,
  description: 'Smart camera with integrated LED ring light',
  shapes: [
    rect(18, 0, 8, 4.5, METAL, { radius: 0.6 }), rect(18, 1.5, 8, 0.6, METAL_D),
    rect(18, 45.5, 8, 4.5, METAL, { radius: 0.6 }), rect(18, 47.9, 8, 0.6, METAL_D),
    rect(1, 4, 42, 42, '#56687a', { radius: 4 }),
    rect(1.5, 4.4, 41, 1.2, '#7b8ea2', { radius: 0.6 }),
    rect(4, 7, 36, 36, '#20262c', { radius: 3 }),
    // ring light
    circ(22, 24, 13, '#2c343c'),
    ...repeat(12, (i) => {
      const a = (i * Math.PI * 2) / 12;
      return circ(22 + Math.cos(a) * 11.3, 24 + Math.sin(a) * 11.3, 1.15, '#f3f6f8');
    }),
    // lens
    circ(22, 24, 9.2, '#0f1418'),
    circ(22, 24, 7.6, '#3a444e'),
    circ(22, 24, 6.2, '#14283d', { gradient: grad(45, '#2a4f78', '#0b1520') }),
    circ(22, 24, 2.4, '#06090c'),
    circ(19.6, 21.4, 1.6, '#ffffff', { opacity: 0.45 }),
    led(36.5, 9.8, GREEN, 0.75), led(33.6, 9.8, AMBER, 0.75),
    rect(15, 39.3, 14, 1.8, TEAL, { radius: 0.3 }),
  ],
  ports: [P('ETH', 22, 0, 'ethernet', 1, 'top'), P('I/O', 22, 50, 'iolink', 1, 'bottom')],
});

const iotSensor = def('detailed', {
  id: 'd-iot-sensor', name: 'IoT Sensor', category: 'IoT', prefix: 'iot', w: 24, h: 58,
  description: 'Battery / PoE wireless sensor node',
  shapes: [
    rrect(14.8, 0, 2.8, 13, [1.4, 1.4, 0.4, 0.4], '#2b3138'),
    rect(13.8, 11.5, 4.8, 3, METAL_D, { radius: 0.5 }),
    rect(8.5, 54, 7, 4, '#7d8894', { radius: 0.6 }), rect(8.5, 55.6, 7, 0.6, '#5f6a75'),
    rect(2, 14, 20, 40.5, WHITE, { radius: 4 }),
    rrect(17, 14, 5, 40.5, [0, 4, 4, 0], WHITE_S),
    rect(2, 14, 20, 40.5, 'none', { radius: 4, stroke: EDGE, strokeWidth: 0.6 }),
    rect(5, 18, 10, 9, '#2a333c', { radius: 1 }),
    rect(6.5, 20, 5, 1.3, '#5fd38a', { radius: 0.3 }), rect(6.5, 22.6, 7, 1, '#7fa6c4', { radius: 0.3 }),
    led(8, 31, GREEN, 0.85),
    rect(5, 34, 10, 1.6, TEAL, { radius: 0.3 }),
    ...repeat(4, (i) => rect(5, 40 + i * 3, 10, 1.4, '#a3adb7', { radius: 0.7 })),
  ],
  ports: [P('WLAN', 16.2, 0, 'wireless', 1, 'top'), P('ETH', 12, 58, 'ethernet', 1, 'bottom')],
});

const iotGateway = def('detailed', {
  id: 'd-iot-gateway', name: 'IoT Gateway', category: 'IoT', prefix: 'gt', w: 34, h: 62,
  description: 'DIN-rail edge gateway with Wi-Fi / LTE antenna',
  shapes: [
    rrect(25, 0, 3.2, 14.5, [1.6, 1.6, 0.5, 0.5], '#2b3138'),
    rect(24.3, 13.5, 4.6, 3, '#c2a95e', { radius: 0.4 }),
    rect(0, 16, 34, 46, SLATE, { radius: 1 }),
    rect(0, 16, 4.5, 46, SLATE_D, { radius: 1 }),
    rect(4.5, 16, 29.5, 0.7, SLATE_L),
    sqLed(1.5, 22, GREEN), sqLed(1.5, 25, LED_OFF), sqLed(1.5, 28, LED_OFF), sqLed(1.5, 31, AMBER),
    rect(13, 18.5, 13, 2, TEAL),
    circ(8.5, 26, 1.3, SLATE_DD), circ(8.5, 26, 0.6, HOLE),
    circ(8.5, 46, 1.3, SLATE_DD), circ(8.5, 46, 0.6, HOLE),
    // stacked RJ45 pair + single RJ45
    rect(12.5, 23, 14, 16.5, '#d3d9df', { radius: 0.6 }),
    rect(14, 24.4, 11, 6, HOLE, { radius: 0.3 }), rect(18.3, 29.4, 2.4, 1, '#d3d9df'),
    rect(14, 32, 11, 6, HOLE, { radius: 0.3 }), rect(18.3, 37, 2.4, 1, '#d3d9df'),
    ...rj45(13.5, 41.5, 12, 7),
    // USB + power
    rect(13.5, 50.5, 12, 4.5, '#d3d9df', { radius: 0.5 }),
    rect(14.5, 51.6, 4.4, 2.3, HOLE), rect(20.1, 51.6, 4.4, 2.3, HOLE),
    rect(15, 57, 9, 3.6, HOLE, { radius: 0.4 }),
    rect(16.4, 58, 2.4, 1.6, '#5d6b79'), rect(20.2, 58, 2.4, 1.6, '#5d6b79'),
  ],
  ports: [
    P('WLAN', 26.6, 0, 'wireless', 0, 'top'),
    P('ETH0', 0, 27, 'ethernet', 1, 'left'), P('ETH1', 34, 35, 'ethernet', 1, 'right'), P('ETH2', 0, 45, 'ethernet', 1, 'left'),
  ],
});

const robotArm = def('detailed', {
  id: 'd-robot-arm', name: 'Robot Arm', category: 'Industrial', prefix: 'rb', w: 62, h: 64, accent: '#2f86c9', fields: OT_FIELDS,
  description: '6-axis articulated industrial robot (side view)',
  shapes: [
    // plinth + base
    rect(9, 59.5, 32, 4.5, SLATE_DD, { radius: 0.6 }), rect(9, 59.5, 32, 0.8, SLATE_L),
    poly([[13, 59.5], [37, 59.5], [34, 50], [16, 50]], WHITE, { stroke: EDGE, strokeWidth: 0.5 }),
    poly([[30, 59.5], [37, 59.5], [34, 50], [30, 50]], WHITE_S),
    rect(14, 39, 22, 12, WHITE, { radius: 2.5, stroke: EDGE, strokeWidth: 0.5 }),
    rrect(30, 39.3, 5.7, 11.4, [0, 2.3, 2.3, 0], WHITE_S),
    // dress pack cable
    line([[31, 48], [36, 36], [37.5, 24], [35, 13]], '#3a434d', 1),
    // lower arm
    ...limb(25, 40, 5.6, 32, 16, 4.4, WHITE, WHITE_S),
    // forearm with rear motor housing
    rect(21, 10.5, 10, 10, WHITE, { radius: 2.5, stroke: EDGE, strokeWidth: 0.5 }),
    ...limb(32, 16, 4.2, 53, 22, 3, WHITE, WHITE_S),
    // wrist + flange
    ...limb(53, 31, 2.4, 53, 22, 2.8, WHITE, WHITE_S),
    rect(49.5, 30.6, 7, 2.4, '#5e6873', { radius: 0.5 }),
    rect(50.5, 33, 5, 1.4, METAL_D),
    // joint caps
    circ(25, 40, 7, '#dfe3e7', { stroke: EDGE, strokeWidth: 0.5 }), circ(25, 40, 4.6, A), circ(25, 40, 1.5, '#ffffff', { opacity: 0.85 }),
    circ(32, 16, 5.8, '#dfe3e7', { stroke: EDGE, strokeWidth: 0.5 }), circ(32, 16, 3.8, A), circ(32, 16, 1.3, '#ffffff', { opacity: 0.85 }),
    circ(53, 22, 3.8, '#dfe3e7', { stroke: EDGE, strokeWidth: 0.5 }), circ(53, 22, 2.4, A),
  ],
  ports: [P('ETH', 25, 64, 'ethernet', 1, 'bottom'), P('TOOL', 57, 33, 'iolink', 1, 'right')],
});

const gripper = def('detailed', {
  id: 'd-gripper', name: 'Gripper', category: 'Industrial', prefix: 'gr', w: 38, h: 50, fields: OT_FIELDS,
  description: '2-finger parallel gripper',
  shapes: [
    rect(11, 0, 16, 4, '#5e6873', { radius: 0.8 }),
    rect(29, 0.8, 4, 6.4, METAL, { radius: 0.5 }), rect(28.4, 4.2, 5.2, 1.4, METAL_D, { radius: 0.3 }),
    rect(7, 4, 24, 3, '#8a949e', { radius: 0.5 }),
    rect(3, 7, 32, 20, '#c7cdd4', { radius: 2, gradient: grad(90, '#dde2e7', '#b2bac3'), stroke: METAL_D, strokeWidth: 0.5 }),
    rect(3.5, 12.5, 31, 0.7, '#a1abb5'),
    rect(13, 15, 12, 1.8, TEAL, { radius: 0.3 }),
    ...([[6, 9.6], [32, 9.6], [6, 19.5], [32, 19.5]] as [number, number][]).map(([x, y]) => circ(x, y, 0.9, '#7e8994')),
    rect(5, 22, 28, 5, '#454f5a', { radius: 0.6 }),
    // jaws
    rect(6, 23, 10, 6, '#717d89', { radius: 0.6 }), rect(22, 23, 10, 6, '#717d89', { radius: 0.6 }),
    // fingers
    poly([[7, 29], [15, 29], [15, 45], [13, 48.5], [9.5, 48.5], [7, 44]], '#bcc4cc', { stroke: METAL_D, strokeWidth: 0.5 }),
    poly([[23, 29], [31, 29], [31, 44], [28.5, 48.5], [25, 48.5], [23, 45]], '#bcc4cc', { stroke: METAL_D, strokeWidth: 0.5 }),
    rect(13, 38, 2, 8.5, '#3a434d', { radius: 0.4 }), rect(23, 38, 2, 8.5, '#3a434d', { radius: 0.4 }),
    circ(11, 32.5, 0.8, '#7e8994'), circ(27, 32.5, 0.8, '#7e8994'),
  ],
  ports: [P('I/O', 31, 0, 'iolink', 1, 'top')],
});

export const DETAILED_OT_DEFS: DeviceDef[] = [
  hmi, plcCompact, plcModular, motorDriver, iolink, vision, iotSensor, iotGateway, robotArm, gripper,
];
