import { describe, it, expect } from 'vitest';
import {
  PX_PER_MM, TITLE_BLOCK, effectiveSheet, fitSheet, frameMm, locate, paperMm, rescale, scalePercent, sheetBounds,
  sheetNumbers, smallestTextMm, tiles, titleBlockMm, unitsPerMmFor, zoneCount, zones,
} from '../src/model/sheet';
import { normalizeDoc } from '../src/model/validate';
import { runChecks } from '../src/model/checks';
import { createSampleDoc } from '../src/library/sample';
import { ALL_BUILTIN } from '../src/library';
import type { SheetSetup } from '../src/model/types';

const inside = (r: { x: number; y: number; w: number; h: number }, b: typeof r) =>
  r.x >= b.x - 1e-6 && r.y >= b.y - 1e-6 && r.x + r.w <= b.x + b.w + 1e-6 && r.y + r.h <= b.y + b.h + 1e-6;
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('paper and frame', () => {
  it('uses ISO sizes with a 20 mm filing margin and 10 mm elsewhere', () => {
    expect(paperMm({ size: 'A3', orientation: 'landscape' })).toEqual({ w: 420, h: 297 });
    expect(paperMm({ size: 'A4', orientation: 'portrait' })).toEqual({ w: 210, h: 297 });
    expect(frameMm({ size: 'A3', orientation: 'landscape' })).toEqual({ x: 20, y: 10, w: 390, h: 277 });
  });
  it('puts a 180 mm title block in the bottom-right corner, never wider than the frame', () => {
    expect(titleBlockMm({ size: 'A3', orientation: 'landscape' })).toEqual({ x: 230, y: 251, w: 180, h: 36 });
    const a4p = titleBlockMm({ size: 'A4', orientation: 'portrait' });
    expect(a4p.w).toBe(180);
    expect(a4p.x + a4p.w).toBe(200);
  });
  it('divides sides into an even number of reference zones of about 50 mm (ISO 5457)', () => {
    expect([zoneCount(1189), zoneCount(841), zoneCount(594), zoneCount(420), zoneCount(297), zoneCount(210)]).toEqual([24, 16, 12, 8, 6, 4]);
    const z = zones({ size: 'A3', orientation: 'landscape' });
    expect(z.cols.map((c) => c.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(z.rows.map((r) => r.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    const big = zones({ size: 'A0', orientation: 'portrait' });
    expect(big.rows.map((r) => r.label).join('')).not.toMatch(/[IO]/);
  });
});

describe('scale', () => {
  it('converts between percent and canvas units per millimetre', () => {
    expect(scalePercent({ unitsPerMm: PX_PER_MM })).toBeCloseTo(100);
    expect(unitsPerMmFor(50)).toBeCloseTo(PX_PER_MM * 2);
    expect(smallestTextMm({ unitsPerMm: PX_PER_MM })).toBeCloseTo(9 * 0.2646, 2);
  });
  it('rescales around the centre of the sheets', () => {
    const s = fitSheet({ size: 'A3', orientation: 'landscape', cols: 1, rows: 1 }, { x: 0, y: 0, w: 2000, h: 1000 });
    const b = sheetBounds(s), r = sheetBounds(rescale(s, s.unitsPerMm * 2));
    expect(r.x + r.w / 2).toBeCloseTo(b.x + b.w / 2, 2);
    expect(r.y + r.h / 2).toBeCloseTo(b.y + b.h / 2, 2);
    expect(r.w).toBeCloseTo(b.w * 2, 2);
  });
});

describe('fitSheet', () => {
  const content = { x: 100, y: -50, w: 3000, h: 1600 };
  for (const base of [
    { size: 'A3', orientation: 'landscape', cols: 1, rows: 1 },
    { size: 'A4', orientation: 'portrait', cols: 1, rows: 1 },
    { size: 'A3', orientation: 'landscape', cols: 2, rows: 2 },
    { size: 'A1', orientation: 'landscape', cols: 3, rows: 1 },
  ] as const) {
    it(`keeps the content on the sheets and clear of title blocks: ${base.size} ${base.orientation} ${base.cols}×${base.rows}`, () => {
      const s = fitSheet(base, content, 0);
      expect(inside(content, sheetBounds(s))).toBe(true);
      const ts = tiles(s);
      expect(ts).toHaveLength(base.cols * base.rows);
      // the bottom row's title blocks are the only ones not repeated on another sheet
      for (const t of ts.filter((t) => t.row === base.rows - 1)) expect(overlaps(content, t.titleBlock)).toBe(false);
    });
  }
  it('never enlarges a small drawing beyond 150 %', () => {
    const s = fitSheet({ size: 'A0', orientation: 'landscape', cols: 1, rows: 1 }, { x: 0, y: 0, w: 100, h: 50 });
    expect(scalePercent(s)).toBeCloseTo(150, 1);
  });
  it('rows overlap by the title block height, so nothing hides under an upper title block', () => {
    const s: SheetSetup = { size: 'A3', orientation: 'landscape', x: 0, y: 0, unitsPerMm: 4, cols: 1, rows: 2 };
    const [top, bottom] = tiles(s);
    expect(bottom.frame.y).toBeCloseTo(top.frame.y + top.frame.h - TITLE_BLOCK.h * 4);
    expect(inside(top.titleBlock, bottom.frame)).toBe(true);
  });
});

describe('numbering and zones', () => {
  it('numbers sheets across the document, page by page', () => {
    const doc = { pages: [
      { id: 'a', sheet: { size: 'A3', orientation: 'landscape', x: 0, y: 0, unitsPerMm: 4, cols: 2, rows: 2 } },
      { id: 'b' },
      { id: 'c', sheet: { size: 'A4', orientation: 'portrait', x: 0, y: 0, unitsPerMm: 4, cols: 3, rows: 1 } },
    ] } as any;
    const n = sheetNumbers(doc);
    expect(n.total).toBe(8);
    expect(n.pages.b).toMatchObject({ first: 5, count: 1 });
    expect(n.pages.c).toMatchObject({ first: 6, count: 3 });
  });
  it('locates a canvas point as sheet number and zone', () => {
    const s: SheetSetup = { size: 'A3', orientation: 'landscape', x: 0, y: 0, unitsPerMm: 1, cols: 2, rows: 1 };
    expect(locate(s, 1, { x: 1, y: 1 })).toEqual({ sheet: 1, zone: 'A1' });
    expect(locate(s, 1, { x: 390 + 389, y: 1 })).toEqual({ sheet: 2, zone: 'A8' });
    expect(locate(s, 1, { x: 389, y: 276 })).toBeNull(); // under the title block
    expect(locate(s, 1, { x: -5, y: 0 })).toBeNull();
  });
  it('prints pages without a setup on one A3 landscape sheet', () => {
    const s = effectiveSheet({}, { x: 0, y: 0, w: 1000, h: 500 });
    expect(s).toMatchObject({ size: 'A3', orientation: 'landscape', cols: 1, rows: 1 });
  });
});

describe('sheet in files and checks', () => {
  const defs = Object.fromEntries(ALL_BUILTIN.map((d) => [d.id, d]));
  it('keeps a valid sheet, repairs ranges, drops nonsense with a warning', () => {
    const d = JSON.parse(JSON.stringify(createSampleDoc()));
    d.pages[0].sheet = { size: 'A2', orientation: 'portrait', x: '10', y: 5, unitsPerMm: 3, cols: 40, rows: 0 };
    d.pages.push({ ...JSON.parse(JSON.stringify(d.pages[0])), id: 'p2', sheet: { size: 'B7' } });
    const { value, warnings } = normalizeDoc(d);
    expect(value.pages[0].sheet).toEqual({ size: 'A2', orientation: 'portrait', x: 10, y: 5, unitsPerMm: 3, cols: 8, rows: 1 });
    expect(value.pages[1].sheet).toBeUndefined();
    expect(warnings.some((w) => /print sheet/.test(w))).toBe(true);
  });
  it('warns about objects off the sheet, under the title block, and tiny text', () => {
    const d = createSampleDoc();
    const page = d.pages[0];
    page.sheet = { size: 'A4', orientation: 'landscape', x: 0, y: 0, unitsPerMm: 20, cols: 1, rows: 1 };
    const codes = new Set(runChecks(d, defs).map((i) => i.code));
    expect(codes.has('sheet-text-small')).toBe(true);
    page.sheet = { size: 'A4', orientation: 'landscape', x: 1e6, y: 1e6, unitsPerMm: 0.5, cols: 1, rows: 1 };
    expect(runChecks(d, defs).some((i) => i.code === 'sheet-outside')).toBe(true);
  });
  it('a fitted sheet raises no sheet warnings on the sample', () => {
    const d = createSampleDoc();
    for (const p of d.pages) {
      const rs = Object.values(p.nodes).map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
      const x = Math.min(...rs.map((r) => r.x)) - 300, y = Math.min(...rs.map((r) => r.y)) - 300;
      const X = Math.max(...rs.map((r) => r.x + r.w)) + 300, Y = Math.max(...rs.map((r) => r.y + r.h)) + 300;
      p.sheet = fitSheet({ size: 'A1', orientation: 'landscape', cols: 1, rows: 1 }, { x, y, w: X - x, h: Y - y });
    }
    expect(runChecks(d, defs).filter((i) => i.code.startsWith('sheet-'))).toEqual([]);
  });
});
