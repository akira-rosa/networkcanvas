// Drawing sheets: the geometry of printing a page on real paper.
//
// A page's SheetSetup places one or more paper sheets over the canvas. Each sheet follows
// ISO 5457: a trimmed paper edge, a drawing frame 20 mm from the left (filing margin) and
// 10 mm from the other edges, grid reference zones in the margin and centring marks. The
// title block (ISO 7200, 180 mm wide) sits in the bottom-right corner of every sheet.
//
// Tiles: a drawing too large for one sheet spreads over cols × rows sheets. Rows overlap by
// the title block's height, so whatever a title block hides on one sheet appears on the next
// one down; only the bottom row's title-block strip is unusable, and fitting avoids it.
import type { DiagramDoc, Page, PaperSize, SheetSetup } from './types';
import type { Rect } from './util';

/** paper sizes in millimetres, long side first */
export const PAPER: Record<PaperSize, { long: number; short: number; label: string }> = {
  A4: { long: 297, short: 210, label: 'A4' },
  A3: { long: 420, short: 297, label: 'A3' },
  A2: { long: 594, short: 420, label: 'A2' },
  A1: { long: 841, short: 594, label: 'A1' },
  A0: { long: 1189, short: 841, label: 'A0' },
  Letter: { long: 279.4, short: 215.9, label: 'Letter' },
  Tabloid: { long: 431.8, short: 279.4, label: 'Tabloid' },
};
export const PAPER_SIZES = Object.keys(PAPER) as PaperSize[];

/** ISO 5457 borders, millimetres */
export const MARGIN = { left: 20, top: 10, right: 10, bottom: 10 };
/** title block size, millimetres */
export const TITLE_BLOCK = { w: 180, h: 36 };
/** CSS pixels per millimetre: at 100 % one canvas unit prints as one CSS pixel */
export const PX_PER_MM = 96 / 25.4;
/** font size of the smallest text the renderer draws (port labels), canvas units */
export const SMALLEST_TEXT = 9;
/** below this printed font size (mm) text is hard to read on a plant floor */
export const MIN_TEXT_MM = 1.8;
export const MAX_TILES = 8;
const MAX_FIT_PERCENT = 150;

export function paperMm(s: Pick<SheetSetup, 'size' | 'orientation'>): { w: number; h: number } {
  const p = PAPER[s.size];
  return s.orientation === 'portrait' ? { w: p.short, h: p.long } : { w: p.long, h: p.short };
}

/** the drawing frame inside the paper, millimetres from the paper's top-left corner */
export function frameMm(s: Pick<SheetSetup, 'size' | 'orientation'>): Rect {
  const p = paperMm(s);
  return { x: MARGIN.left, y: MARGIN.top, w: p.w - MARGIN.left - MARGIN.right, h: p.h - MARGIN.top - MARGIN.bottom };
}

/** title block, millimetres from the paper's top-left corner (never wider than the frame) */
export function titleBlockMm(s: Pick<SheetSetup, 'size' | 'orientation'>): Rect {
  const f = frameMm(s);
  const w = Math.min(TITLE_BLOCK.w, f.w);
  return { x: f.x + f.w - w, y: f.y + f.h - TITLE_BLOCK.h, w, h: TITLE_BLOCK.h };
}

/** print scale as a percentage (100 % = one canvas unit per CSS pixel of paper) */
export const scalePercent = (s: Pick<SheetSetup, 'unitsPerMm'>) => (PX_PER_MM / s.unitsPerMm) * 100;
export const unitsPerMmFor = (percent: number) => PX_PER_MM / (percent / 100);
/** printed font size of the smallest text, millimetres */
export const smallestTextMm = (s: Pick<SheetSetup, 'unitsPerMm'>) => SMALLEST_TEXT / s.unitsPerMm;

export interface Tile {
  col: number;
  row: number;
  /** drawing frame of this sheet on the canvas */
  frame: Rect;
  /** title block of this sheet on the canvas */
  titleBlock: Rect;
}

/** every sheet of a setup, row by row, with its frame in canvas units */
export function tiles(s: SheetSetup): Tile[] {
  const f = frameMm(s), tb = titleBlockMm(s), k = s.unitsPerMm;
  const stepX = f.w * k, stepY = (f.h - TITLE_BLOCK.h) * k;
  const out: Tile[] = [];
  for (let row = 0; row < s.rows; row++) {
    for (let col = 0; col < s.cols; col++) {
      const x = s.x + col * stepX, y = s.y + row * stepY;
      out.push({ col, row, frame: { x, y, w: f.w * k, h: f.h * k }, titleBlock: { x: x + (tb.x - f.x) * k, y: y + (tb.y - f.y) * k, w: tb.w * k, h: tb.h * k } });
    }
  }
  return out;
}

/** the area covered by all frames of a setup, canvas units */
export function sheetBounds(s: SheetSetup): Rect {
  const f = frameMm(s), k = s.unitsPerMm;
  return { x: s.x, y: s.y, w: s.cols * f.w * k, h: ((s.rows - 1) * (f.h - TITLE_BLOCK.h) + f.h) * k };
}

/** the whole paper area of a setup including margins, canvas units */
export function paperBounds(s: SheetSetup): Rect {
  const b = sheetBounds(s), k = s.unitsPerMm;
  return { x: b.x - MARGIN.left * k, y: b.y - MARGIN.top * k, w: b.w + (MARGIN.left + MARGIN.right) * k, h: b.h + (MARGIN.top + MARGIN.bottom) * k };
}

/**
 * Scale and place a setup so that `content` fits inside the frames without touching a title
 * block, as large as possible (up to 150 %), centred.
 */
export function fitSheet(base: Omit<SheetSetup, 'x' | 'y' | 'unitsPerMm'>, content: Rect | null, pad = 24): SheetSetup {
  const f = frameMm(base);
  const c = content ?? { x: 0, y: 0, w: 400, h: 300 };
  const cw = Math.max(1, c.w + pad * 2), ch = Math.max(1, c.h + pad * 2);
  const usableH = base.rows * (f.h - TITLE_BLOCK.h); // keep clear of the bottom title-block strip
  // a single sheet may use the column beside the title block instead, if that is larger
  const options: { w: number; h: number }[] = [{ w: base.cols * f.w, h: usableH }];
  if (base.cols === 1 && base.rows === 1) options.push({ w: f.w - Math.min(TITLE_BLOCK.w, f.w), h: f.h });
  let best = { mmPerUnit: 0, area: options[0] };
  for (const a of options) {
    if (a.w <= 0 || a.h <= 0) continue;
    const m = Math.min(a.w / cw, a.h / ch);
    if (m > best.mmPerUnit) best = { mmPerUnit: m, area: a };
  }
  const unitsPerMm = Math.max(unitsPerMmFor(MAX_FIT_PERCENT), 1 / best.mmPerUnit);
  // centre the content in the chosen area (which always starts at the first frame's top-left)
  const x = c.x + c.w / 2 - (best.area.w * unitsPerMm) / 2;
  const y = c.y + c.h / 2 - (best.area.h * unitsPerMm) / 2;
  // round k up, so the tidier number still holds all the content
  return { ...base, unitsPerMm: Math.ceil(unitsPerMm * 1e4) / 1e4, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** change the scale of a setup, keeping the centre of its frames where it is */
export function rescale(s: SheetSetup, unitsPerMm: number): SheetSetup {
  const b = sheetBounds(s);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const next = { ...s, unitsPerMm };
  const nb = sheetBounds(next);
  return { ...next, x: round(cx - nb.w / 2), y: round(cy - nb.h / 2) };
}

/** the setup a page prints with: its own, or one A3 landscape sheet fitted to its content */
export function effectiveSheet(page: Pick<Page, 'sheet'>, content: Rect | null): SheetSetup {
  return page.sheet ?? fitSheet({ size: 'A3', orientation: 'landscape', cols: 1, rows: 1 }, content);
}

export interface SheetNumber { pageId: string; first: number; count: number }

/** document-wide sheet numbers: pages in order, each tile one sheet */
export function sheetNumbers(doc: Pick<DiagramDoc, 'pages'>): { pages: Record<string, SheetNumber>; total: number } {
  const pages: Record<string, SheetNumber> = {};
  let n = 0;
  for (const p of doc.pages) {
    const count = p.sheet ? p.sheet.cols * p.sheet.rows : 1;
    pages[p.id] = { pageId: p.id, first: n + 1, count };
    n += count;
  }
  return { pages, total: n };
}

/* ---------- ISO 5457 reference zones ---------- */

const ROW_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O

/** number of reference zones along a paper side: even, about 50 mm each */
export function zoneCount(lengthMm: number) {
  return Math.max(2, 2 * Math.round(lengthMm / 100));
}

/** zone fields of a sheet in millimetres: columns numbered from the left, rows lettered from the top */
export function zones(s: Pick<SheetSetup, 'size' | 'orientation'>) {
  const f = frameMm(s), p = paperMm(s);
  const nc = zoneCount(p.w), nr = zoneCount(p.h);
  return {
    cols: Array.from({ length: nc }, (_, i) => ({ label: String(i + 1), from: f.x + (f.w * i) / nc, to: f.x + (f.w * (i + 1)) / nc })),
    rows: Array.from({ length: nr }, (_, i) => ({ label: ROW_LETTERS[i] ?? '?', from: f.y + (f.h * i) / nr, to: f.y + (f.h * (i + 1)) / nr })),
  };
}

/** where a canvas point appears: sheet number and zone (e.g. { sheet: 3, zone: 'C4' }), or null */
export function locate(s: SheetSetup, firstSheet: number, pt: { x: number; y: number }): { sheet: number; zone: string } | null {
  const z = zones(s), f = frameMm(s);
  const ts = tiles(s);
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const fr = t.frame, tb = t.titleBlock;
    const inFrame = pt.x >= fr.x && pt.x <= fr.x + fr.w && pt.y >= fr.y && pt.y <= fr.y + fr.h;
    const underTb = pt.x >= tb.x && pt.y >= tb.y;
    if (!inFrame || underTb) continue;
    const mx = f.x + (pt.x - fr.x) / s.unitsPerMm, my = f.y + (pt.y - fr.y) / s.unitsPerMm;
    const col = z.cols.find((c) => mx >= c.from && mx <= c.to) ?? z.cols[z.cols.length - 1];
    const row = z.rows.find((r) => my >= r.from && my <= r.to) ?? z.rows[z.rows.length - 1];
    return { sheet: firstSheet + i, zone: row.label + col.label };
  }
  return null;
}
