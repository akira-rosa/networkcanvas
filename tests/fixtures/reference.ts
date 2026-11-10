// Reference projects for the industrial-readiness review, performance budgets and regression tests.
//   cell  ~30 devices, 1 page    — one production cell as an OT engineer documents it
//   plant ~400 devices, 12 pages — a plant modelled on the Smart4.0 structure: core, 10 lines with rings, IT
//   site  N devices over P pages — generated, for scale (default 2,000 devices / 40 pages)
// Regenerate the committed files with `npm run fixtures`.
import type { DeviceNode, DiagramDoc, Link, Page, Vlan, ZoneNode } from '../../src/model/types';
import { ALL_BUILTIN } from '../../src/library';
import { newLink, newPage } from '../../src/model/factory';
import { mediaCompatible } from '../../src/model/geometry';

const DEFS = Object.fromEntries(ALL_BUILTIN.map((d) => [d.id, d]));

/** deterministic ids so regenerated files diff cleanly */
function idGen(prefix: string) {
  let n = 0;
  return (kind: string) => `${prefix}-${kind}${(++n).toString(36)}`;
}

class Builder {
  doc: DiagramDoc;
  id: (k: string) => string;
  private used = new Map<string, Set<string>>();
  constructor(name: string, prefix: string) {
    this.id = idGen(prefix);
    this.doc = { format: 'networkcanvas', version: 1, id: this.id('doc'), name, pages: [], vlans: [], createdAt: 1767225600000, updatedAt: 1767225600000 };
  }
  vlan(vlanId: number, name: string, subnet: string, color: string, description = ''): Vlan {
    const v: Vlan = { id: this.id('v'), vlanId, name, subnet, color, description };
    this.doc.vlans.push(v);
    return v;
  }
  page(name: string): Page {
    const p = { ...newPage(name), id: this.id('pg') };
    this.doc.pages.push(p);
    return p;
  }
  zone(p: Page, title: string, v: Vlan | undefined, x: number, y: number, w: number, h: number) {
    const z = { kind: 'zone', id: this.id('n'), title, vlan: v?.id, x, y, w, h, radius: 6, titleAlign: 'right' } as ZoneNode;
    p.nodes[z.id] = z;
    p.order.unshift(z.id);
    return z;
  }
  dev(p: Page, defId: string, name: string, cx: number, cy: number, addr?: [Vlan, string], props: Record<string, string> = {}): DeviceNode {
    const d = DEFS[defId];
    if (!d) throw new Error('unknown def ' + defId);
    const w = d.w * 1.25, h = d.h * 1.25;
    const n = {
      kind: 'device', id: this.id('n'), defId, name, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h,
      addresses: addr ? [{ id: this.id('a'), vlan: addr[0].id, value: addr[1] }] : [], props, labelPos: 'bottom',
    } as DeviceNode;
    p.nodes[n.id] = n;
    p.order.push(n.id);
    return n;
  }
  /** first free port on `n` whose media works with `media` (or the named port) */
  port(n: DeviceNode, media: string, name?: string): string {
    const used = this.used.get(n.id) ?? new Set<string>();
    this.used.set(n.id, used);
    const ports = DEFS[n.defId].ports;
    const p = name ? ports.find((x) => x.name === name) : ports.find((x) => !used.has(x.id) && mediaCompatible(x.media, media as any));
    if (!p) throw new Error(`no free ${media} port on ${n.name} (${n.defId})`);
    if (name && used.has(p.id)) throw new Error(`port ${name} on ${n.name} is already used`);
    if (p.maxLinks === 1) used.add(p.id);
    return p.id;
  }
  link(p: Page, a: DeviceNode, b: DeviceNode, media = 'ethernet', o: Partial<Link> & { pa?: string; pb?: string } = {}): Link {
    const { pa, pb, ...rest } = o;
    const l = newLink({ node: a.id, port: this.port(a, media, pa) }, { node: b.id, port: this.port(b, media, pb) }, media as Link['media']);
    Object.assign(l, { id: this.id('l') }, rest);
    p.links[l.id] = l;
    return l;
  }
}

const PROPS = (model: string, i: number, cabinet: string) => ({ model, serial: `SN${(100000 + i * 7919) % 1000000}`, firmware: `V${1 + (i % 4)}.${i % 10}`, location: cabinet });

/** one production line: a 4-switch fibre ring, PLC, safety PLC, HMI, a drive line, remote IO, vision, robot, scanner, camera */
function line(b: Builder, p: Page, v: Vlan, n: number, x0: number, y0: number, net: string) {
  const cab = `L${n}-CAB${1 + (n % 3)}`;
  b.zone(p, `Line ${n}`, v, x0 - 40, y0 - 60, 1520, 720);
  const sw = [0, 1, 2, 3].map((i) => b.dev(p, 'switch', `L${n}-SW${i + 1}`, x0 + 120 + i * 380, y0, [v, `${net}.${2 + i}`], PROPS('SCALANCE XC208', n * 10 + i, cab)));
  // fibre ring over the SFP ports
  for (let i = 0; i < 4; i++) b.link(p, sw[i], sw[(i + 1) % 4], 'fiber', { pa: 'SFP2', pb: 'SFP1', speed: '1G', cableId: `L${n}-F${i + 1}` });
  let ip = 10;
  const at = (name: string, defId: string, s: number, k: number, media = 'ethernet', model = '') => {
    const d = b.dev(p, defId, name, x0 + 40 + s * 380 + (k % 3) * 110, y0 + 150 + Math.floor(k / 3) * (s === 2 ? 250 : 120), [v, `${net}.${ip++}`], PROPS(model || defId, n * 100 + ip, cab));
    b.link(p, sw[s], d, media, { cableId: `L${n}-C${ip}` });
    return d;
  };
  const plc = at(`L${n}-PLC`, 'plc-modular', 0, 0, 'profinet', 'S7-1516');
  at(`L${n}-FPLC`, 'safety-plc', 0, 1, 'profinet', 'S7-1516F');
  at(`L${n}-HMI`, 'hmi', 0, 2, 'profinet', 'TP1500');
  at(`L${n}-IPC`, 'industrial-pc', 0, 3);
  // drive line: daisy-chained over X1 P1 / X1 P2
  let prev = at(`L${n}-VFD1`, 'vfd', 1, 0, 'profinet', 'G120');
  for (let k = 2; k <= 6; k++) {
    const d = b.dev(p, 'vfd', `L${n}-VFD${k}`, x0 + 40 + 380 + ((k - 1) % 3) * 110, y0 + 150 + Math.floor((k - 1) / 3) * 120, [v, `${net}.${ip++}`], PROPS('G120', n * 100 + k, cab));
    b.link(p, prev, d, 'profinet', { pa: 'X1 P2', pb: 'X1 P1' });
    prev = d;
  }
  for (let r = 0; r < 3; r++) {
    const rio = at(`L${n}-RIO${r + 1}`, 'remote-io', 2, r * 2 > 2 ? r + 1 : r, 'profinet', 'ET200SP');
    for (let s = 0; s < 2; s++) {
      const sen = b.dev(p, s ? 'actuator' : 'sensor', `L${n}-${s ? 'Y' : 'B'}${r * 2 + s + 1}`, rio.x + 20 + s * 50, rio.y + 110, undefined, {});
      b.link(p, rio, sen, 'iolink');
    }
  }
  // two IO-Link masters with four field devices each
  for (let m = 0; m < 2; m++) {
    const master = at(`L${n}-IOL${m + 1}`, 'iolink', 2, 4 + m);
    for (let s = 0; s < 4; s++) {
      const fd = b.dev(p, s % 2 ? 'actuator' : 'sensor', `L${n}-IOL${m + 1}-${s + 1}`, master.x - 40 + s * 45, master.y + 110, undefined, {});
      b.link(p, master, fd, 'iolink');
    }
  }
  at(`L${n}-VIS`, 'vision', 3, 0);
  const robot = at(`L${n}-ROB`, 'robot-arm', 3, 1);
  const grip = b.dev(p, 'gripper', `L${n}-GRP`, robot.x + 30, robot.y + 110);
  b.link(p, robot, grip, 'iolink');
  at(`L${n}-SCN`, 'barcode-scanner', 3, 2);
  at(`L${n}-CAM`, 'ip-camera', 3, 3);
  return { sw, plc };
}

export function createCell(): DiagramDoc {
  const b = new Builder('Reference — Cell 3 (packaging)', 'cell');
  const prod = b.vlan(10, 'Cell 3', '10.3.10.0/24', '#d6409f', 'Production cell 3');
  const mgmt = b.vlan(99, 'Management', '10.3.99.0/24', '#8b95a5', 'Switch and firewall management');
  const p = b.page('Cell 3');
  b.zone(p, 'Cell 3', prod, -80, -140, 1700, 760);
  const fw = b.dev(p, 'firewall', 'C3-FW', 120, -60, [mgmt, '10.3.99.1'], PROPS('SCALANCE S615', 1, 'C3-CAB1'));
  const up = b.dev(p, 'switch-l3', 'C3-SW0', 420, -60, [mgmt, '10.3.99.2'], PROPS('SCALANCE XC216', 2, 'C3-CAB1'));
  b.link(p, fw, up, 'ethernet', { pa: 'LAN', speed: '1G' });
  const { sw } = line(b, p, prod, 3, 0, 100, '10.3.10');
  b.link(p, up, sw[0], 'ethernet', { speed: '1G' });
  const ups = b.dev(p, 'ups', 'C3-UPS', 720, -60, [mgmt, '10.3.99.10'], PROPS('SITOP UPS1600', 3, 'C3-CAB1'));
  b.link(p, up, ups);
  return b.doc;
}

export function createPlant(): DiagramDoc {
  const b = new Builder('Reference — Plant (10 lines)', 'plant');
  const C = ['#e5484d', '#f5a524', '#c6d01b', '#46a758', '#3fb59a', '#1a8fd8', '#5b5bd6', '#8e4ec6', '#d6409f', '#8b95a5'];
  const lines = Array.from({ length: 10 }, (_, i) => b.vlan(110 + i, `Line ${i + 1}`, `10.20.${110 + i}.0/24`, C.at(i)!, `Production line ${i + 1}`));
  const mgmt = b.vlan(99, 'Management', '10.20.99.0/24', '#8b95a5');
  const dmz = b.vlan(200, 'OT DMZ', '10.20.200.0/24', '#e5484d', 'Historian, patch server, remote access');
  const srv = b.vlan(250, 'Servers', '10.30.250.0/24', '#3fb59a');
  const eng = b.vlan(50, 'Engineering', '10.30.50.0/24', '#46a758');
  const office = b.vlan(60, 'Office', '10.30.60.0/24', '#1a8fd8');
  const voice = b.vlan(70, 'Voice', '10.30.70.0/24', '#f5a524');
  b.vlan(80, 'Wi-Fi', '10.30.80.0/24', '#c6d01b');
  const cctv = b.vlan(90, 'CCTV', '10.30.90.0/24', '#5b5bd6');
  b.vlan(30, 'Safety', '10.20.30.0/24', '#e5484d');
  b.vlan(1, 'Transit', '10.0.0.0/30', '#8b95a5');

  // overview / core
  const core = b.page('Core and DMZ');
  const fwIt = b.dev(core, 'firewall', 'FW-IT', 200, 100, [mgmt, '10.20.99.1'], PROPS('FortiGate 100F', 1, 'MDF'));
  const fwOt = b.dev(core, 'firewall', 'FW-OT', 200, 400, [mgmt, '10.20.99.2'], PROPS('FortiGate 60F', 2, 'MDF'));
  b.link(core, fwIt, fwOt, 'ethernet', { pa: 'LAN', pb: 'WAN', speed: '1G' });
  const cores = [0, 1, 2, 3].map((i) => b.dev(core, 'switch-l3', `CORE-${i + 1}`, 520 + (i % 2) * 300, 300 + Math.floor(i / 2) * 260, [mgmt, `10.20.99.${10 + i}`], PROPS('SCALANCE XR528', 10 + i, 'MDF')));
  for (let i = 0; i < 4; i++) b.link(core, cores[i], cores[[1, 3, 0, 2].at(i)!], 'fiber', { pa: 'SFP2', pb: 'SFP1', speed: '10G' });
  b.link(core, fwOt, cores[0], 'ethernet', { pa: 'LAN', speed: '1G' });
  b.zone(core, 'OT DMZ', dmz, 40, 600, 700, 300);
  for (const [i, [id, name]] of ([['server', 'HIST-01'], ['server', 'WSUS-01'], ['server', 'JUMP-01'], ['nas', 'BKP-01'], ['database', 'SQL-OT']] as const).entries()) {
    const d = b.dev(core, id, name, 120 + i * 130, 760, [dmz, `10.20.200.${10 + i}`], PROPS(id, 30 + i, 'MDF'));
    if (i === 0) b.link(core, fwOt, d, 'ethernet', { pa: 'DMZ' }); // the other DMZ hosts hang off DMZ-SW below
  }
  const dmzSw = b.dev(core, 'switch', 'DMZ-SW', 420, 680, [dmz, '10.20.200.2']);
  b.link(core, fwOt, dmzSw, 'ethernet', { pa: 'MGMT' });
  for (const id of Object.keys(core.nodes)) {
    const n = core.nodes[id];
    if (n.kind === 'device' && n.addresses[0]?.vlan === dmz.id && n.id !== dmzSw.id && !Object.values(core.links).some((l) => l.to.node === n.id)) b.link(core, dmzSw, n);
  }

  // ten lines, one page each
  lines.forEach((v, i) => {
    const p = b.page(`Line ${i + 1}`);
    line(b, p, v, i + 1, 0, 0, `10.20.${110 + i}`);
  });

  // IT / enterprise
  const it = b.page('Enterprise IT');
  const acc = [0, 1, 2].map((i) => b.dev(it, 'switch', `IT-SW${i + 1}`, 200 + i * 420, 120, [mgmt, `10.20.99.${40 + i}`]));
  acc.slice(1).forEach((s, i) => b.link(it, acc[0], s, 'fiber', { pa: i ? 'SFP2' : 'SFP1', pb: 'SFP1' }));
  const hosts: [string, string, Vlan][] = [
    ['server', 'AD-01', srv], ['server', 'FILE-01', srv], ['database', 'ERP-DB', srv], ['nas', 'NAS-01', srv],
    ['pc', 'ENG-WS1', eng], ['pc', 'ENG-WS2', eng], ['laptop', 'ENG-LT1', eng], ['pc', 'OFF-PC1', office], ['pc', 'OFF-PC2', office],
    ['pc', 'OFF-PC3', office], ['printer', 'PRN-01', office], ['ip-phone', 'TEL-101', voice], ['ip-phone', 'TEL-102', voice],
    ['ip-phone', 'TEL-103', voice], ['ip-camera', 'CAM-01', cctv], ['ip-camera', 'CAM-02', cctv], ['ip-camera', 'CAM-03', cctv],
    ['access-point', 'AP-01', mgmt], ['access-point', 'AP-02', mgmt], ['wireless-controller', 'WLC-01', mgmt], ['ups', 'UPS-IT', mgmt],
  ];
  hosts.forEach(([id, name, v], k) => {
    const s = acc.at(k % 3)!;
    const d = b.dev(it, id, name, s.x + (k % 7) * 60 - 120, 320 + Math.floor(k / 3) * 110, [v, `${v.subnet.split('.').slice(0, 3).join('.')}.${(v === mgmt ? 60 : 20) + k}`], PROPS(id, 200 + k, 'IDF-1'));
    b.link(it, s, d);
  });
  // the page order the reader expects: core first
  return b.doc;
}

export function createSite(devices = 2000, pages = 40): DiagramDoc {
  const b = new Builder(`Reference — Site (${devices} devices)`, 'site');
  const perPage = Math.ceil(devices / pages);
  let made = 0;
  for (let pi = 0; pi < pages && made < devices; pi++) {
    const v = b.vlan(100 + pi, `Area ${pi + 1}`, `10.${40 + Math.floor(pi / 200)}.${pi % 250}.0/24`, '#1a8fd8');
    const p = b.page(`Area ${pi + 1}`);
    const sws: DeviceNode[] = [];
    const nSw = Math.max(1, Math.ceil(perPage / 9));
    for (let s = 0; s < nSw && made < devices; s++, made++) {
      sws.push(b.dev(p, 'switch', `A${pi + 1}-SW${s + 1}`, 200 + s * 700, 100, [v, `10.40.${pi % 250}.${2 + s}`]));
      if (s) b.link(p, sws[s - 1], sws[s], 'fiber', { pa: 'SFP2', pb: 'SFP1' });
    }
    const kinds = ['plc-compact', 'hmi', 'motor-driver', 'remote-io', 'vision', 'industrial-pc', 'barcode-scanner', 'ip-camera'];
    for (let k = 0; made < devices && k < perPage - nSw; k++, made++) {
      const s = sws.at(Math.floor(k / 8) % sws.length)!;
      const d = b.dev(p, kinds.at(k % kinds.length)!, `A${pi + 1}-D${k + 1}`, s.x - 260 + (k % 8) * 90, 300 + Math.floor(k / 8) * 150, [v, `10.40.${pi % 250}.${20 + k}`]);
      try { b.link(p, s, d, 'ethernet'); } catch { /* switch full: leave unconnected */ }
    }
  }
  return b.doc;
}

export const countDevices = (d: DiagramDoc) => d.pages.reduce((s, p) => s + Object.values(p.nodes).filter((n) => n.kind === 'device').length, 0);
