import type { DeviceNode, DiagramDoc, Link, Page, Vlan, ZoneNode, DiagramNode } from '../model/types';
import { ALL_BUILTIN as BUILTIN_DEFS } from './index';
import { newLink, createLegend, createVlanTable, createText, createTitleBlock, createCallout } from '../model/factory';
import { uid } from '../model/util';

// A sample diagram modelled on the Smart4.0 schematic, so the first launch
// shows every feature (zones bound to VLANs, port-based links, legend, VLAN table).

export const SAMPLE_VERSION = 5;

export function createSampleDoc(): DiagramDoc {
  const V = (vlanId: number, name: string, subnet: string, color: string, description: string): Vlan => ({ id: uid('v'), vlanId, name, subnet, color, description });
  const vlans = {
    server: V(250, 'Server', '192.168.250.0/24', '#3fb59a', 'Detains and isolates the Main Server.'),
    eng: V(50, 'Engineering', '192.168.50.0/24', '#46a758', 'Development and maintenance access with expansions.'),
    visitors: V(100, 'Visitors', '192.168.100.0/24', '#c6d01b', 'Access point for guests and clients.'),
    prod: V(150, 'Production', '192.168.150.0/24', '#d6409f', 'Embeds all the devices from the stations.'),
    iot: V(200, 'IoT', '192.168.200.0/24', '#5b5bd6', 'Integrates the SmartSenses to the internet.'),
    gate: V(1, 'Gate', 'ISP / WAN', '#e5484d', 'Connects and manages the access from the outside.'),
    core: V(2, 'Core', '192.168.2.0/24', '#f5a524', 'Central hub that interconnects all internal VLANs.'),
    guest: V(3, 'Guest transit', '192.168.3.0/24', '#8e4ec6', 'Internet access for the guest network.'),
  };
  const defs = Object.fromEntries(BUILTIN_DEFS.map((d) => [d.id, d]));
  const page: Page = { id: uid('pg'), name: 'Topology', nodes: {}, order: [], links: {} };
  const add = (n: DiagramNode, bottom = false) => { page.nodes[n.id] = n; if (bottom) page.order.unshift(n.id); else page.order.push(n.id); return n; };

  const zone = (title: string, v: Vlan | undefined, x: number, y: number, w: number, h: number, align: 'left' | 'right' = 'left', tag?: string) =>
    add({ kind: 'zone', id: uid('n'), title, vlan: v?.id, tag, x, y, w, h, radius: 6, titleAlign: align } as ZoneNode);

  const dev = (defId: string, name: string, cx: number, cy: number, addrs: [Vlan | 'err', string][] = [], extra: Partial<DeviceNode> = {}) => {
    const d = defs[defId];
    const w = d.w * 1.25, h = d.h * 1.25;
    return add({
      kind: 'device', id: uid('n'), defId, name, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h,
      addresses: addrs.map(([v, value]) => ({ id: uid('a'), vlan: v === 'err' ? 'error' : v.id, value })),
      props: {}, labelPos: 'bottom', ...extra,
    } as DeviceNode) as DeviceNode;
  };
  const port = (n: DeviceNode, name: string) => defs[n.defId].ports.find((p) => p.name === name)?.id;
  const link = (a: DeviceNode, pa: string, b: DeviceNode, pb: string, o: Partial<Link> = {}) => {
    const l = newLink({ node: a.id, port: port(a, pa) }, { node: b.id, port: port(b, pb) }, o.media ?? 'ethernet');
    Object.assign(l, o);
    page.links[l.id] = l;
    return l;
  };
  const wifi = (a: DeviceNode, b: DeviceNode, pb = 'WLAN') => link(a, 'WLAN', b, pb, { media: 'wireless', dash: 'dashed', width: 1.4, showPortLabels: false });

  // ── zones ──
  zone('', vlans.iot, 390, 30, 520, 610);
  zone('', vlans.server, 390, 660, 520, 200);
  zone('', vlans.gate, 930, 30, 260, 190, 'right', '___.___/**');
  zone('', vlans.core, 930, 240, 260, 690, 'right');
  zone('', vlans.guest, 1210, 240, 240, 190, 'right');
  zone('', vlans.visitors, 1470, 30, 320, 400, 'right');
  zone('', vlans.eng, 1210, 450, 580, 480, 'right');
  zone('', vlans.prod, 40, 960, 2200, 420, 'right');

  // ── core ──
  const fwGate = dev('firewall', 'fwGate', 1060, 110, [], { subtitle: 'Main Server System' });
  const rtBorder = dev('router-industrial', 'rtBorder', 1060, 350, [[vlans.guest, '192.168.3.1'], [vlans.core, '192.168.2.1'], ['err', 'DHCP Client']]);
  const swHeart = dev('switch-l3', 'swHeart', 1060, 600, [[vlans.core, '192.168.2.10'], [vlans.server, '192.168.250.1']]);
  const rtProd = dev('router-industrial', 'rtProduction', 1060, 830, [[vlans.core, '192.168.2.20'], [vlans.prod, '192.168.150.1']]);
  link(fwGate, 'LAN', rtBorder, 'P1', { speed: '1G', cableId: 'C-001' });
  link(rtBorder, 'P3', swHeart, 'P0.1');
  link(swHeart, 'P0.7', rtProd, 'P1');

  // ── guest path ──
  const fwGuest = dev('firewall', 'fwGuest', 1275, 320, [], { subtitle: 'Guest Access' });
  const rtGuest = dev('router-wireless', 'rtGuest', 1385, 320, [[vlans.visitors, '192.168.100.1'], [vlans.guest, '192.168.3.10']]);
  link(rtBorder, 'WAN', fwGuest, 'DMZ', { fromLabel: 'P1' });
  link(fwGuest, 'MGMT', rtGuest, 'P2', { label: 'WAN', showPortLabels: false });
  const visitors = [
    dev('laptop', 'Visitor [01]', 1640, 90, [[vlans.visitors, '192.168.100.__']]),
    dev('laptop', 'Visitor [02]', 1720, 215, [[vlans.visitors, '192.168.100.__']]),
    dev('laptop', 'Visitor [03]', 1660, 340, [[vlans.visitors, '192.168.100.__']]),
  ];
  visitors.forEach((v) => wifi(rtGuest, v));

  // ── engineering ──
  const rtEng = dev('router-wireless', 'rtEngineering', 1310, 610, [[vlans.eng, '192.168.50.1'], [vlans.core, '192.168.2.30']]);
  link(swHeart, 'P0.5', rtEng, 'P2', { label: 'WAN', fromLabel: 'P0.3', showPortLabels: true, toLabel: '', speed: '1G', vlans: 'trunk 2,50', cableId: 'C-012' });
  [
    dev('laptop', 'Smart40', 1560, 500, [[vlans.eng, '192.168.50.200']]),
    dev('laptop', 'AksAvell', 1710, 560, [[vlans.eng, '192.168.50.210']]),
    dev('laptop', 'JA', 1710, 720, [[vlans.eng, '192.168.50.220']]),
    dev('laptop', 'MSI', 1560, 790, [[vlans.eng, '192.168.50.230']]),
  ].forEach((l) => wifi(rtEng, l));

  // ── IoT ──
  const gt = dev('iot-gateway', 'gtIOT', 830, 450, [[vlans.iot, '192.168.200.1'], [vlans.core, '192.168.2.40']]);
  link(swHeart, 'P0.2', gt, 'ETH2', { fromLabel: 'P0.5', toLabel: 'P1' });
  [
    dev('iot-sensor', 'SmartSense-1', 660, 110, [[vlans.iot, '192.168.200.10']]),
    dev('iot-sensor', 'SmartSense-2', 520, 170, [[vlans.iot, '192.168.200.20']]),
    dev('iot-sensor', 'SmartSense-3', 460, 320, [[vlans.iot, '192.168.200.30']]),
    dev('iot-sensor', 'SmartSense-4', 500, 480, [[vlans.iot, '192.168.200.40']]),
    dev('iot-sensor', 'SmartSense-5', 620, 540, [[vlans.iot, '192.168.200.50']]),
  ].forEach((s) => wifi(gt, s));

  // ── server ──
  const fwSrv = dev('firewall', 'fwServers', 820, 760, [], { subtitle: 'Main Server System' });
  const srv = dev('server', 'Main Server', 520, 750, [[vlans.server, '192.168.250.60']]);
  link(swHeart, 'P0.6', fwSrv, 'WAN', { fromLabel: 'P0.4', toLabel: '' });
  link(fwSrv, 'DMZ', srv, 'iLO', { toLabel: 'E1', fromLabel: '' });

  // ── production cells ──
  const P = vlans.prod;
  const cell = (title: string, sx: number, devs: [string, string, string][], hmiFirst = true) => {
    const sw = dev('switch', title, sx, 1035, [], { labelPos: 'top' });
    const nodes = devs.map(([defId, name, ip]) => dev(defId, name, 0, 0, [[P, ip]]));
    return { sw, nodes, hmiFirst };
  };

  const placeRow = (nodes: DeviceNode[], x0: number, gap: number, y = 1160) => {
    nodes.forEach((n, i) => { n.x = Math.round(x0 + i * gap - n.w / 2); n.y = Math.round(y - n.h / 2); });
  };

  const storage = cell('Storage Switch', 340, [
    ['hmi', 'Storage HMI', '192.168.150.11'], ['plc-compact', 'Storage PLC', '192.168.150.10'],
    ['motor-driver', 'Storage YAW Drv', '192.168.150.12'], ['motor-driver', 'Storage Y Drv', '192.168.150.13'],
  ]);
  placeRow(storage.nodes, 110, 140);
  const process = cell('Process Switch', 790, [
    ['hmi', 'Process HMI', '192.168.150.21'], ['plc-compact', 'Process PLC', '192.168.150.20'],
    ['motor-driver', 'Process X Drv', '192.168.150.22'], ['motor-driver', 'Process Y Drv', '192.168.150.23'],
  ]);
  placeRow(process.nodes, 640, 125);
  const expedition = cell('Expedition Switch', 1880, [
    ['hmi', 'Expedition HMI', '192.168.150.41'], ['plc-compact', 'Expedition PLC', '192.168.150.40'],
    ['motor-driver', 'Exp. YAW Drv', '192.168.150.42'], ['motor-driver', 'Exp. X Drv', '192.168.150.43'], ['motor-driver', 'Exp. Y Drv', '192.168.150.44'],
  ]);
  placeRow(expedition.nodes, 1660, 118);

  for (const c of [storage, process, expedition]) {
    const [hmi, plc, ...drv] = c.nodes;
    link(c.sw, 'P6', plc, 'X1 P1');
    link(c.sw, 'P8', drv[0], 'X1');
    link(hmi, 'P4', plc, 'P3', { arrowStart: true, showPortLabels: false });
    for (let i = 0; i < drv.length - 1; i++) link(drv[i], 'P2', drv[i + 1], 'P1', { arrowStart: true, showPortLabels: false });
  }

  // assembling cell
  const swA = dev('switch', 'Assembling Switch', 1310, 1035, [], { labelPos: 'top' });
  const aPlc = dev('plc-modular', 'Assembling PLC', 1140, 1160, [[P, '192.168.150.30']]);
  const aHmi = dev('hmi', 'Assembling HMI', 1140, 1305, [[P, '192.168.150.31']]);
  const turck = dev('iolink', 'Turck', 1255, 1160, [[P, '192.168.150.34']]);
  const grip = dev('gripper', 'ShunkEGH', 1255, 1305, [], { subtitle: 'via Turck IO-Link' });
  const visor = dev('vision', 'Visor', 1370, 1160, [[P, '192.168.150.32']]);
  const robot = dev('robot-arm', 'URRobot', 1490, 1150, [[P, '192.168.150.33']]);
  link(swA, 'P6', aPlc, 'X1 P1');
  link(swA, 'P7', turck, 'X1');
  link(swA, 'P8', visor, 'ETH');
  link(swA, 'P5', robot, 'ETH');
  link(aPlc, 'X1 P2', aHmi, 'X1 P1', { arrowStart: true, showPortLabels: false });
  link(turck, 'IO2', grip, 'I/O', { media: 'iolink', showPortLabels: false });

  // router → cell switches
  link(rtProd, 'P2', storage.sw, 'P1', { fromLabel: 'P1', toLabel: '' });
  link(rtProd, 'P4', process.sw, 'P1', { fromLabel: 'P2', toLabel: '' });
  link(rtProd, 'P5', swA, 'P1', { fromLabel: 'P3', toLabel: '' });
  link(rtProd, 'WAN', expedition.sw, 'P1', { fromLabel: 'P4', toLabel: '' });

  // ── blocks ──
  const title = createText(40, 40, 'Smart4.0');
  title.fontSize = 26; title.w = 300; title.h = 36;
  add(title);
  const sub = createText(40, 82, 'Network structure & topology 2.0');
  sub.fontSize = 13; sub.bold = false; sub.w = 300; sub.h = 20; sub.color = undefined;
  add(sub);
  const vt = createVlanTable(1830, 40);
  add(vt);
  const lg = createLegend(40, 1410);
  lg.columns = 5;
  add(lg);
  const tb = createTitleBlock(1900, 1410);
  tb.w = 340; tb.h = 110;
  add(tb);
  const note = createCallout(1480, 300, undefined, 'Guest Wi-Fi is isolated from the\nproduction VLANs by the second firewall.');
  note.w = 215; note.h = 40;
  add(note);

  return {
    format: 'netcanvas', version: 1, id: uid('doc'), name: 'Smart4.0 — Network topology', sampleVersion: SAMPLE_VERSION,
    pages: [page],
    meta: { author: 'Network team', company: 'Smart4.0', version: '2.0', classification: 'Internal' },
    lineJumps: true,
    vlans: Object.values(vlans),
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}
