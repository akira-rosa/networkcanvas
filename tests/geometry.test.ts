import { describe, it, expect } from 'vitest';
import { pathWithJumps, mediaCompatible, linkMediaFor, autoSide, linkGeometry, orthoBendAt } from '../src/model/geometry';
import { createDevice, newLink } from '../src/model/factory';
import { parseCidr, parseIPv4, ipInCidr, nextFreeIp, runChecks } from '../src/model/checks';
import { createSampleDoc } from '../src/library/sample';
import { ALL_BUILTIN } from '../src/library';
import { styledDefMap, buildDefMap, variantOf, placementDefId } from '../src/store/store';

describe('line jumps', () => {
  it('adds an arc where a straight link crosses an earlier one', () => {
    const d = pathWithJumps([{ x: 0, y: 50 }, { x: 100, y: 50 }], [[{ x: 50, y: 0 }, { x: 50, y: 100 }]], 4);
    expect(d).toContain('A4,4');
    expect(d).toMatch(/L46,50 A4,4 0 0 1 54,50/);
  });
  it('ignores parallel and non-crossing segments', () => {
    const d = pathWithJumps([{ x: 0, y: 50 }, { x: 100, y: 50 }], [[{ x: 0, y: 60 }, { x: 100, y: 60 }], [{ x: 150, y: 0 }, { x: 150, y: 100 }]]);
    expect(d).not.toContain('A');
  });
});

describe('orthogonal routing', () => {
  it('bends links whose ends leave on the same side and maps the handle back to a bend value', () => {
    const defs = buildDefMap([]);
    const sw = defs['switch'];
    const a = createDevice(sw, 0, 0), b = createDevice(sw, 300, 60);
    const top = sw.ports.filter((p) => p.side === 'top');
    const page: any = { id: 'p', name: 'p', nodes: { [a.id]: a, [b.id]: b }, order: [a.id, b.id], links: {} };
    const l = { ...newLink({ node: a.id, port: top[0].id }, { node: b.id, port: top[1].id }), routing: 'orthogonal' as const };
    const g = linkGeometry(l, page, defs, [])!;
    expect(g.exitStart).toEqual({ x: 0, y: -1 });
    expect(g.pts[1].y).toBeLessThan(Math.min(g.start.y, g.end.y)); // the middle segment runs above both devices
    const bend = orthoBendAt(g.start, g.exitStart, g.end, g.exitEnd, { x: 100, y: g.pts[1].y - 100 });
    const g2 = linkGeometry({ ...l, bend }, page, defs, [])!;
    expect(g2.pts[1].y).toBeCloseTo(g.pts[1].y - 100, 3);
  });
});

describe('ports & media', () => {
  it('matches compatible media groups', () => {
    expect(mediaCompatible('ethernet', 'profinet')).toBe(true);
    expect(mediaCompatible('fiber', 'sfp')).toBe(true);
    expect(mediaCompatible('fiber', 'ethernet')).toBe(false);
    expect(mediaCompatible('any', 'wireless')).toBe(true);
    expect(linkMediaFor('sfp', 'any')).toBe('fiber');
  });
  it('derives a port side from its position', () => {
    expect(autoSide({ x: 0, y: 10, side: 'auto' }, { w: 40, h: 20 })).toBe('left');
    expect(autoSide({ x: 20, y: 20, side: 'auto' }, { w: 40, h: 20 })).toBe('bottom');
  });
});

describe('IP helpers', () => {
  it('parses CIDR and tests membership', () => {
    const c = parseCidr('192.168.150.0/24')!;
    expect(ipInCidr(parseIPv4('192.168.150.33')!, c)).toBe(true);
    expect(ipInCidr(parseIPv4('192.168.151.33')!, c)).toBe(false);
    expect(parseCidr('ISP / WAN')).toBeNull();
  });
  it('finds the next free address', () => {
    const doc = createSampleDoc();
    const prod = doc.vlans.find((v) => v.vlanId === 150)!;
    const ip = nextFreeIp(doc, prod)!;
    expect(ip.startsWith('192.168.150.')).toBe(true);
    const used = new Set(doc.pages.flatMap((p) => Object.values(p.nodes)).flatMap((n) => (n.kind === 'device' ? n.addresses.map((a) => a.value) : [])));
    expect(used.has(ip)).toBe(false);
  });
});

describe('checks', () => {
  it('flags duplicate names and IPs', () => {
    const doc = createSampleDoc();
    const pg = doc.pages[0];
    const devs = Object.values(pg.nodes).filter((n) => n.kind === 'device') as any[];
    devs[1].name = devs[0].name;
    devs[2].addresses = [{ id: 'a1', vlan: doc.vlans[0].id, value: '10.0.0.1' }];
    devs[3].addresses = [{ id: 'a2', vlan: doc.vlans[0].id, value: '10.0.0.1' }];
    const issues = runChecks(doc, styledDefMap(buildDefMap([]), 'iso'));
    expect(issues.some((i) => i.code === 'name-dup')).toBe(true);
    expect(issues.some((i) => i.code === 'ip-dup')).toBe(true);
  });
  it('the bundled sample is clean (no errors or warnings)', () => {
    const issues = runChecks(createSampleDoc(), styledDefMap(buildDefMap([]), 'iso'));
    expect(issues.filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
  });
});

describe('icon styles', () => {
  const raw = buildDefMap([]);
  it('pairs every isometric device with a detailed counterpart', () => {
    const iso = ALL_BUILTIN.filter((d) => (d.style ?? 'iso') === 'iso');
    const missing = iso.filter((d) => variantOf(raw, d.id, 'detailed')!.id === d.id);
    expect(missing.map((d) => d.id)).toEqual([]);
  });
  it('keeps port names identical across styles so links survive a switch', () => {
    for (const d of ALL_BUILTIN) {
      const other = variantOf(raw, d.id, (d.style ?? 'iso') === 'iso' ? 'detailed' : 'iso')!;
      if (other.id === d.id) continue;
      const a = d.ports.map((p) => p.name).sort(), b = other.ports.map((p) => p.name).sort();
      expect({ id: d.id, ports: a }).toEqual({ id: d.id, ports: b });
    }
  });
  it('places explicit overrides only when the style differs from the document', () => {
    expect(placementDefId(raw, raw['switch'], 'iso')).toBe('switch');
    expect(placementDefId(raw, raw['switch'], 'detailed')).toBe('switch@iso');
    expect(placementDefId(raw, raw['d-switch'], 'detailed')).toBe('d-switch');
  });
});
