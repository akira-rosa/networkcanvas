import { describe, it, expect } from 'vitest';
import { portUsage } from '../src/model/geometry';
import { runChecks } from '../src/model/checks';
import { buildDefMap, styledDefMap } from '../src/store/store';
import { createSampleDoc } from '../src/library/sample';
import type { Page } from '../src/model/types';

/** the original definition: count by scanning every link */
function scan(page: Page, node: string, port: string, except?: string) {
  let n = 0;
  for (const l of Object.values(page.links)) {
    if (l.id === except) continue;
    if (l.from.node === node && l.from.port === port) n++;
    if (l.to.node === node && l.to.port === port) n++;
  }
  return n;
}

describe('port usage index', () => {
  const doc = createSampleDoc();
  const page = doc.pages[0];
  const ends = Object.values(page.links).flatMap((l) => [l.from, l.to]).filter((e) => e.port) as { node: string; port: string }[];
  it('agrees with a full scan for every used port, with and without an excluded link', () => {
    for (const e of ends) {
      expect(portUsage(page, e.node, e.port)).toBe(scan(page, e.node, e.port));
      for (const l of Object.values(page.links).slice(0, 5)) expect(portUsage(page, e.node, e.port, l.id)).toBe(scan(page, e.node, e.port, l.id));
    }
  });
  it('sees a new links object (an edit) instead of a stale count', () => {
    const e = ends[0];
    const before = portUsage(page, e.node, e.port);
    const l = Object.values(page.links)[0];
    const next: Page = { ...page, links: { ...page.links, extra: { ...l, id: 'extra', from: { node: e.node, port: e.port } } } };
    expect(portUsage(next, e.node, e.port)).toBe(before + 1);
  });
  it('keeps checks fast on a 1,000-device page', () => {
    // 1,000 devices on one page, chained port to port
    const defs = styledDefMap(buildDefMap([]), 'iso');
    const big = createSampleDoc();
    const p = big.pages[0];
    const proto = Object.values(p.nodes).find((n) => n.kind === 'device' && n.defId === 'switch')!;
    p.nodes = {}; p.order = []; p.links = {};
    for (let i = 0; i < 1000; i++) { const id = 'd' + i; p.nodes[id] = { ...proto, id, name: 'sw' + i, addresses: [], x: (i % 40) * 120, y: Math.floor(i / 40) * 120 } as any; p.order.push(id); }
    const ports = defs['switch'].ports;
    for (let i = 1; i < 1000; i++) p.links['l' + i] = { id: 'l' + i, from: { node: 'd' + (i - 1), port: ports[1].id }, to: { node: 'd' + i, port: ports[0].id }, media: 'ethernet', routing: 'straight', width: 1.6, dash: 'solid', arrowStart: false, arrowEnd: false, showPortLabels: true };
    const t = performance.now();
    runChecks(big, defs);
    expect(performance.now() - t).toBeLessThan(150);
  });
});
