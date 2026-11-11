import { describe, it, expect } from 'vitest';
import { normalizeDoc, normalizeDef, DocError, CURRENT_VERSION } from '../src/model/validate';
import { createSampleDoc } from '../src/library/sample';
import { ALL_BUILTIN } from '../src/library';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const sample = () => clone(createSampleDoc());
const firstDevice = (d: any) => Object.values(d.pages[0].nodes).find((n: any) => n.kind === 'device') as any;

describe('normalizeDoc', () => {
  it('leaves a valid document unchanged', () => {
    const d = sample();
    const { value, warnings } = normalizeDoc(d);
    expect(warnings).toEqual([]);
    expect(value).toEqual(d);
  });
  it('repairs the gaps that used to crash the app (missing addresses, props, order, links, vlans)', () => {
    const d = sample();
    delete firstDevice(d).addresses;
    delete firstDevice(d).props;
    delete d.pages[0].order;
    delete d.pages[0].links;
    delete d.vlans;
    const { value, warnings } = normalizeDoc(d);
    const n = firstDevice(value);
    expect(n.addresses).toEqual([]);
    expect(n.props).toEqual({});
    expect(value.pages[0].order.length).toBe(Object.keys(value.pages[0].nodes).length);
    expect(value.pages[0].links).toEqual({});
    expect(value.vlans).toEqual([]);
    expect(warnings).toEqual([]);
  });
  it('reads numeric strings, defaults impossible geometry and reports it', () => {
    const d = sample();
    firstDevice(d).x = '400px';
    firstDevice(d).y = 'abc';
    const { value, warnings } = normalizeDoc(d);
    expect(firstDevice(value).x).toBe(400);
    expect(firstDevice(value).y).toBe(0);
    expect(warnings.length).toBe(2);
  });
  it('drops links whose end points to nothing', () => {
    const d = sample();
    const l: any = Object.values(d.pages[0].links)[0];
    l.to.node = 'nope';
    const { value, warnings } = normalizeDoc(d);
    expect(value.pages[0].links[l.id]).toBeUndefined();
    expect(warnings[0]).toMatch(/end points to nothing/);
  });
  it('refuses files from a newer format version, and non-diagrams', () => {
    expect(() => normalizeDoc({ ...sample(), version: CURRENT_VERSION + 1 })).toThrow(DocError);
    expect(() => normalizeDoc({ ...sample(), version: 99 })).toThrow(/newer Network Canvas/);
    expect(() => normalizeDoc({ hello: 1 })).toThrow(/not a Network Canvas diagram/);
    expect(() => normalizeDoc({ ...sample(), pages: [] })).toThrow(/no pages/);
  });
  it('accepts files saved before the rename', () => {
    expect(normalizeDoc({ ...sample(), format: 'netcanvas' }).value.format).toBe('networkcanvas');
  });
  it('removes values that would make the app fetch a URL or run script', () => {
    const d = sample();
    d.vlans[0].color = 'url(http://evil.example/x.svg)';
    firstDevice(d).accent = 'url(http://evil.example/a.svg)';
    d.pages[0].nodes.img = { kind: 'image', id: 'img', x: 0, y: 0, w: 10, h: 10, href: 'http://evil.example/beacon.png' };
    d.pages[0].nodes.img2 = { kind: 'image', id: 'img2', x: 0, y: 0, w: 10, h: 10, href: 'data:image/png;base64,AAAA' };
    const { value, warnings } = normalizeDoc(d);
    expect(JSON.stringify(value)).not.toContain('evil.example');
    expect(value.pages[0].nodes.img).toBeUndefined();
    expect(value.pages[0].nodes.img2).toBeDefined();
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });
  it('drops prototype keys from properties without crashing', () => {
    const d = JSON.parse(JSON.stringify(sample()).replace('"props":{}', '"props":{"__proto__":{"x":1},"serial":42}'));
    const n = firstDevice(normalizeDoc(d).value);
    expect(Object.keys(n.props)).toEqual(['serial']);
    expect(n.props.serial).toBe('42');
    expect(({} as any).x).toBeUndefined();
  });
});

describe('normalizeDef', () => {
  it('keeps every built-in device definition intact', () => {
    for (const d of ALL_BUILTIN) expect(normalizeDef(clone(d))).toEqual(clone(d));
  });
  it('refuses definitions without an id or size', () => {
    expect(normalizeDef({ name: 'x', w: 10, h: 10 })).toBeNull();
    expect(normalizeDef({ id: 'x', name: 'x' })).toBeNull();
  });
});
