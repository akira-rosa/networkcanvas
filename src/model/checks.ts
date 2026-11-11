// Diagram checks: finds documentation problems a network engineer cares about.
// Pure function of the document + definitions, so it can run anywhere.
import type { DeviceNode, DiagramDoc, Vlan } from './types';
import type { DefMap } from './geometry';
import { mediaCompatible, portUsage } from './geometry';
import { nodeRect, nodeVisualRect } from './geometry';
import { rectContains, type Rect } from './util';
import { MIN_TEXT_MM, sheetBounds, smallestTextMm, tiles } from './sheet';

const rectInside = (r: Rect, b: Rect) => r.x >= b.x - 0.5 && r.y >= b.y - 0.5 && r.x + r.w <= b.x + b.w + 0.5 && r.y + r.h <= b.y + b.h + 0.5;
const rectsOverlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  id: string;
  severity: Severity;
  code: string;
  message: string;
  pageId: string;
  /** node ids or link ids to select when the issue is clicked */
  targets: string[];
}

/* ---------- IP helpers ---------- */

export function parseIPv4(s: string): number | null {
  const m = s.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function parseCidr(s: string): { net: number; bits: number } | null {
  const m = s.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m) return null;
  const ip = parseIPv4(m[1]);
  const bits = Number(m[2]);
  if (ip === null || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { net: (ip & mask) >>> 0, bits };
}

export function ipInCidr(ip: number, cidr: { net: number; bits: number }) {
  const mask = cidr.bits === 0 ? 0 : (~0 << (32 - cidr.bits)) >>> 0;
  return ((ip & mask) >>> 0) === cidr.net;
}

/** "192.168.100.__" / "x" / "DHCP Client" are placeholders, not addresses */
export const looksLikeIp = (v: string) => /^\s*\d{1,3}(\.\d{1,3}){3}\s*$/.test(v);
const looksLikeIpAttempt = (v: string) => /^\s*\d{1,3}(\.\d{1,3}){2,3}(\.\d{0,3})?\s*$/.test(v) && !looksLikeIp(v);

export function ipToString(n: number) {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** next unused host address in a VLAN's subnet (skips network, gateway candidates are not reserved) */
export function nextFreeIp(doc: DiagramDoc, vlan: Vlan): string | null {
  const cidr = parseCidr(vlan.subnet);
  if (!cidr || cidr.bits > 30) return null;
  const used = new Set<number>();
  for (const p of doc.pages) for (const n of Object.values(p.nodes)) {
    if (n.kind !== 'device') continue;
    for (const a of n.addresses) { const ip = parseIPv4(a.value); if (ip !== null) used.add(ip); }
  }
  const size = 2 ** (32 - cidr.bits);
  for (let i = 1; i < size - 1; i++) {
    const ip = (cidr.net + i) >>> 0;
    if (!used.has(ip)) return ipToString(ip);
  }
  return null;
}

/* ---------- the checks ---------- */

export function runChecks(doc: DiagramDoc, defs: DefMap): Issue[] {
  const issues: Issue[] = [];
  let n = 0;
  const add = (severity: Severity, code: string, message: string, pageId: string, targets: string[]) =>
    issues.push({ id: `i${++n}`, severity, code, message, pageId, targets });

  const vlanById = new Map(doc.vlans.map((v) => [v.id, v]));
  const cidrByVlan = new Map<string, { net: number; bits: number } | null>();
  for (const v of doc.vlans) cidrByVlan.set(v.id, parseCidr(v.subnet));

  // VLAN registry
  const seenVlanIds = new Map<number, Vlan>();
  for (const v of doc.vlans) {
    const prev = seenVlanIds.get(v.vlanId);
    if (prev) add('warning', 'vlan-dup', `VLAN ID ${v.vlanId} is defined twice (“${prev.name}” and “${v.name}”)`, doc.pages[0].id, []);
    seenVlanIds.set(v.vlanId, v);
    if (v.subnet && /\d+\.\d+/.test(v.subnet) && !parseCidr(v.subnet)) add('error', 'vlan-subnet', `VLAN ${v.vlanId} “${v.name}”: subnet “${v.subnet}” is not valid CIDR (e.g. 192.168.10.0/24), so its addresses cannot be checked`, doc.pages[0].id, []);
  }

  const namePattern = (() => { try { return doc.namePattern ? new RegExp(doc.namePattern) : null; } catch { return null; } })();

  // addresses across the whole document
  const ipOwners = new Map<string, { node: DeviceNode; pageId: string }[]>();

  for (const page of doc.pages) {
    const devices = Object.values(page.nodes).filter((x): x is DeviceNode => x.kind === 'device');
    const names = new Map<string, DeviceNode[]>();
    const hasLinks = Object.keys(page.links).length > 0;
    const linkCount = new Map<string, number>();
    for (const l of Object.values(page.links)) {
      linkCount.set(l.from.node, (linkCount.get(l.from.node) ?? 0) + 1);
      linkCount.set(l.to.node, (linkCount.get(l.to.node) ?? 0) + 1);
    }
    const zones = Object.values(page.nodes).filter((z) => z.kind === 'zone' && z.vlan);

    for (const d of devices) {
      const def = defs[d.defId];
      if (!def) add('error', 'def-missing', `${d.name}: device definition “${d.defId}” is missing (import the library it came from)`, page.id, [d.id]);
      names.set(d.name, [...(names.get(d.name) ?? []), d]);
      if (namePattern && !namePattern.test(d.name)) add('info', 'name-pattern', `${d.name}: name does not match the convention /${doc.namePattern}/`, page.id, [d.id]);

      for (const a of d.addresses) {
        if (a.vlan && a.vlan !== 'error' && !vlanById.has(a.vlan)) add('error', 'vlan-missing', `${d.name}: address ${a.value} refers to a VLAN that no longer exists`, page.id, [d.id]);
        if (looksLikeIpAttempt(a.value)) add('info', 'ip-format', `${d.name}: “${a.value}” is not a complete IPv4 address`, page.id, [d.id]);
        const ip = parseIPv4(a.value);
        if (ip === null) {
          if (looksLikeIp(a.value)) add('error', 'ip-format', `${d.name}: “${a.value.trim()}” is not a valid IPv4 address (each part must be 0–255)`, page.id, [d.id]);
          continue;
        }
        ipOwners.set(a.value.trim(), [...(ipOwners.get(a.value.trim()) ?? []), { node: d, pageId: page.id }]);
        const cidr = a.vlan ? cidrByVlan.get(a.vlan) : undefined;
        if (cidr && !ipInCidr(ip, cidr)) {
          const v = vlanById.get(a.vlan!)!;
          add('warning', 'ip-subnet', `${d.name}: ${a.value} is outside VLAN ${v.vlanId} “${v.name}” (${v.subnet})`, page.id, [d.id]);
        } else if (cidr && cidr.bits <= 30) {
          const bcast = (cidr.net | (~0 >>> cidr.bits)) >>> 0;
          if (ip === cidr.net || ip === bcast) {
            const v = vlanById.get(a.vlan!)!;
            add('error', 'ip-reserved', `${d.name}: ${a.value.trim()} is the ${ip === cidr.net ? 'network' : 'broadcast'} address of VLAN ${v.vlanId} (${v.subnet}) and cannot be used by a device`, page.id, [d.id]);
          }
        }
      }

      // inside a VLAN zone but not addressed in it
      if (d.addresses.length) {
        const r = nodeRect(d, page, defs, doc.vlans);
        for (const z of zones) {
          if (z.kind !== 'zone' || !z.vlan) continue;
          if (!rectContains(nodeRect(z, page, defs, doc.vlans), r)) continue;
          if (!d.addresses.some((a) => a.vlan === z.vlan)) {
            const v = vlanById.get(z.vlan);
            if (v) add('info', 'zone-vlan', `${d.name} sits in the VLAN ${v.vlanId} zone but has no address in it`, page.id, [d.id]);
          }
        }
      }

      if (hasLinks && !linkCount.get(d.id) && def && def.ports.length && !d.locked) add('warning', 'unconnected', `${d.name} has no links`, page.id, [d.id]);

      if (def) {
        for (const p of def.ports) {
          const used = portUsage(page, d.id, p.id);
          if (p.maxLinks && used > p.maxLinks) add('error', 'port-over', `${d.name}: port ${p.name} has ${used} links (max ${p.maxLinks})`, page.id, [d.id]);
        }
      }
    }

    // a page with devices but no links at all is reported once, so it is never called "connected"
    const linkable = devices.filter((d) => defs[d.defId]?.ports.length && !d.locked);
    if (!hasLinks && linkable.length > 1) add('info', 'unconnected', `No links on “${page.name}” yet: ${linkable.length} devices are not connected`, page.id, linkable.map((d) => d.id));

    for (const [name, list] of names) if (list.length > 1 && name.trim()) add('warning', 'name-dup', `${list.length} devices on “${page.name}” are named “${name}”`, page.id, list.map((x) => x.id));

    for (const l of Object.values(page.links)) {
      const a = page.nodes[l.from.node], b = page.nodes[l.to.node];
      if (!a || !b) { add('error', 'link-dangling', 'A link points to a device that no longer exists', page.id, [l.id]); continue; }
      const ends = [[a, l.from.port], [b, l.to.port]] as const;
      const medias: string[] = [];
      for (const [node, portId] of ends) {
        if (node.kind !== 'device') continue;
        const def = defs[node.defId];
        if (!def) continue;
        if (!portId) { if (def.ports.length) add('info', 'link-noport', `Link ${a.kind === 'device' ? a.name : '?'} → ${b.kind === 'device' ? b.name : '?'}: no port chosen on ${node.name}`, page.id, [l.id]); continue; }
        const port = def.ports.find((p) => p.id === portId);
        if (!port) { add('warning', 'link-port-missing', `Link on ${node.name}: port no longer exists in the device definition`, page.id, [l.id]); continue; }
        medias.push(port.media);
      }
      if (medias.length === 2 && !mediaCompatible(medias[0] as any, medias[1] as any)) {
        add('warning', 'link-media', `Link ${(a as DeviceNode).name} → ${(b as DeviceNode).name}: ${medias[0]} port connected to ${medias[1]} port`, page.id, [l.id]);
      }
    }
  }

  // print sheets: everything on the sheets, nothing under a title block, text large enough
  for (const page of doc.pages) {
    const sh = page.sheet;
    if (!sh) continue;
    const bounds = sheetBounds(sh);
    const blocks = tiles(sh).filter((t) => t.row === sh.rows - 1).map((t) => t.titleBlock);
    const outside: string[] = [], under: string[] = [];
    for (const id of page.order) {
      const node = page.nodes[id];
      if (!node || node.hidden) continue;
      const r = nodeVisualRect(node, page, defs, doc.vlans);
      if (!rectInside(r, bounds)) outside.push(id);
      else if (blocks.some((b) => rectsOverlap(r, b))) under.push(id);
    }
    const some = (ids: string[]) => (ids.length === 1 ? '1 object' : `${ids.length} objects`);
    if (outside.length) add('warning', 'sheet-outside', `Page “${page.name}”: ${some(outside)} reach beyond the print sheet and will be cut off (use Fit to drawing)`, page.id, outside);
    if (under.length) add('warning', 'sheet-title-block', `Page “${page.name}”: ${some(under)} sit under the title block and will be hidden in print`, page.id, under);
    const mm = smallestTextMm(sh);
    if (mm < MIN_TEXT_MM) add('warning', 'sheet-text-small', `Page “${page.name}”: port labels print at ${mm.toFixed(1)} mm, too small to read; use a larger paper, more sheets or a higher scale`, page.id, []);
  }

  for (const [ip, owners] of ipOwners) {
    if (owners.length > 1) {
      const names = owners.map((o) => o.node.name).join(', ');
      add('error', 'ip-dup', `${ip} is used ${owners.length} times: ${names}`, owners[0].pageId, owners.map((o) => o.node.id));
    }
  }

  const order: Severity[] = ['error', 'warning', 'info'];
  return issues.sort((x, y) => order.indexOf(x.severity) - order.indexOf(y.severity));
}
