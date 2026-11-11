// One ISO 5457 drawing sheet, drawn in millimetres (0,0 = paper top-left): trim edge, frame,
// reference zones, centring marks, continuation notes and the title block. The canvas wraps it
// in a transform to place it over the drawing; print uses it as is inside a mm-sized <svg>.
import type { DiagramDoc, Page, SheetSetup } from '../model/types';
import { PAPER, frameMm, paperMm, scalePercent, sheetNumbers, titleBlockMm, zones } from '../model/sheet';
import type { CanvasTheme } from './theme';

const FONT = "'Inter Variable', Inter, system-ui, sans-serif";

export interface SheetInfo {
  doc: Pick<DiagramDoc, 'name' | 'meta' | 'updatedAt'>;
  page: Pick<Page, 'name'>;
  sheet: SheetSetup;
  col: number;
  row: number;
  /** document-wide sheet number of this tile and the total */
  number: number;
  total: number;
  /** sheet numbers of the neighbouring tiles, for continuation notes */
  next?: { left?: number; right?: number; up?: number; down?: number };
}

export function SheetFrame({ info, theme, preview }: { info: SheetInfo; theme: CanvasTheme; preview?: boolean }) {
  const s = info.sheet;
  const p = paperMm(s), f = frameMm(s), z = zones(s);
  const line = theme.fg;
  // on the canvas the sheet is a guide: quieter lines, and only the trim edge dashed
  const op = preview ? 0.55 : 1;
  const zoneText = { fontSize: 2.5, fill: line, textAnchor: 'middle' as const, dominantBaseline: 'central' as const, fontFamily: FONT };
  const nx = info.next ?? {};
  const paper = preview ? theme.bg : '#ffffff';
  // continuation notes are centred on a zone boundary one field right of (or below) the centre
  // line, half-way between two zone labels, masking the boundary tick behind them
  const cont = (n: number | undefined, x: number, y: number, rotate = 0) => {
    if (!n) return null;
    const t = `continued on sheet ${n}`, w = t.length * 2.2 * 0.55 + 2;
    return (
      <g transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}>
        <rect x={x - w / 2} y={y - 1.8} width={w} height={3.6} fill={paper} />
        <text x={x} y={y} {...zoneText} fontSize={2.2} fill={theme.muted}>{t}</text>
      </g>
    );
  };
  const midCol = z.cols[Math.min(z.cols.length - 1, z.cols.length / 2 + 1)].from;
  const midRow = z.rows[Math.min(z.rows.length - 1, z.rows.length / 2 + 1)].from;
  return (
    <g data-sheet-frame={info.number} fontFamily={FONT} pointerEvents="none">
      {preview
        ? <rect x={0} y={0} width={p.w} height={p.h} fill="none" stroke={line} strokeWidth={0.35} strokeDasharray="3 2" opacity={0.45} />
        : null}
      <g opacity={op}>
        <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="none" stroke={line} strokeWidth={0.7} />
        {/* reference zone boundaries and labels, all four sides */}
        {z.cols.map((c, i) => (
          <g key={'c' + i}>
            {i > 0 && <><line x1={c.from} y1={f.y - 5} x2={c.from} y2={f.y} stroke={line} strokeWidth={0.35} /><line x1={c.from} y1={f.y + f.h} x2={c.from} y2={f.y + f.h + 5} stroke={line} strokeWidth={0.35} /></>}
            <text x={(c.from + c.to) / 2} y={f.y - 2.5} {...zoneText}>{c.label}</text>
            <text x={(c.from + c.to) / 2} y={f.y + f.h + 2.5} {...zoneText}>{c.label}</text>
          </g>
        ))}
        {z.rows.map((r, i) => (
          <g key={'r' + i}>
            {i > 0 && <><line x1={f.x - 5} y1={r.from} x2={f.x} y2={r.from} stroke={line} strokeWidth={0.35} /><line x1={f.x + f.w} y1={r.from} x2={f.x + f.w + 5} y2={r.from} stroke={line} strokeWidth={0.35} /></>}
            <text x={f.x - 2.5} y={(r.from + r.to) / 2} {...zoneText}>{r.label}</text>
            <text x={f.x + f.w + 2.5} y={(r.from + r.to) / 2} {...zoneText}>{r.label}</text>
          </g>
        ))}
        {/* centring marks: from the trim edge 5 mm into the frame */}
        <g stroke={line} strokeWidth={0.7}>
          <line x1={p.w / 2} y1={0} x2={p.w / 2} y2={f.y + 5} />
          <line x1={p.w / 2} y1={p.h} x2={p.w / 2} y2={f.y + f.h - 5} />
          <line x1={0} y1={p.h / 2} x2={f.x + 5} y2={p.h / 2} />
          <line x1={p.w} y1={p.h / 2} x2={f.x + f.w - 5} y2={p.h / 2} />
        </g>
        {cont(nx.up, midCol, f.y - 2.5)}
        {cont(nx.down, midCol, f.y + f.h + 2.5)}
        {cont(nx.left, f.x - 2.5, midRow, -90)}
        {cont(nx.right, f.x + f.w + 2.5, midRow, 90)}
        <TitleBlock info={info} theme={theme} />
      </g>
    </g>
  );
}

/** ISO 7200-style title block, 180 × 36 mm, bottom-right inside the frame */
function TitleBlock({ info, theme }: { info: SheetInfo; theme: CanvasTheme }) {
  const tb = titleBlockMm(info.sheet);
  const m = info.doc.meta ?? {};
  const date = info.doc.updatedAt ? new Date(info.doc.updatedAt).toISOString().slice(0, 10) : '';
  const pct = scalePercent(info.sheet);
  const sx = tb.w / 180; // narrow frames (A4 portrait is exactly 180 mm) keep proportions
  type Cell = [x: number, y: number, w: number, h: number, label: string, value: string, size?: number];
  const cells: Cell[] = [
    [0, 0, 60, 14, 'Company', m.company ?? ''],
    [60, 0, 120, 14, 'Title', info.doc.name, 4.2],
    [0, 14, 60, 11, 'Drawn by', m.author ?? ''],
    [60, 14, 70, 11, 'Page', info.page.name],
    [130, 14, 50, 11, 'Classification', m.classification ?? ''],
    [0, 25, 40, 11, 'Version', m.version ?? ''],
    [40, 25, 40, 11, 'Date', date],
    [80, 25, 40, 11, 'Size · scale', `${PAPER[info.sheet.size].label} · ${Math.round(pct)} %`],
    [120, 25, 60, 11, 'Sheet', `${info.number} of ${info.total}`, 3.6],
  ];
  return (
    <g data-title-block>
      <rect x={tb.x} y={tb.y} width={tb.w} height={tb.h} fill={theme.panelFill} stroke={theme.fg} strokeWidth={0.7} />
      {cells.map(([x, y, w, h, label, value, size], i) => {
        const cx = tb.x + x * sx, cy = tb.y + y, cw = w * sx;
        return (
          <g key={i}>
            <rect x={cx} y={cy} width={cw} height={h} fill="none" stroke={theme.fg} strokeWidth={0.25} />
            <text x={cx + 1.5} y={cy + 2.8} fontSize={1.9} fill={theme.muted}>{label}</text>
            <text x={cx + 1.5} y={cy + h - 2.6} fontSize={size ?? 3} fontWeight={label === 'Title' ? 700 : 500} fill={theme.fg}>
              {fit(value, cw - 3, size ?? 3)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** shorten text to roughly fit a cell (average glyph ≈ 0.55 em) */
function fit(t: string, widthMm: number, sizeMm: number) {
  const max = Math.floor(widthMm / (sizeMm * 0.55));
  return t.length > max ? t.slice(0, Math.max(1, max - 1)) + '…' : t;
}

/** the sheets one page prints on, numbered across the document */
export function sheetInfos(doc: Pick<DiagramDoc, 'name' | 'meta' | 'updatedAt' | 'pages'>, page: Page, sheet: SheetSetup): SheetInfo[] {
  const nums = sheetNumbers(doc);
  const first = nums.pages[page.id]?.first ?? 1;
  const at = (col: number, row: number) => (col >= 0 && row >= 0 && col < sheet.cols && row < sheet.rows ? first + row * sheet.cols + col : undefined);
  const out: SheetInfo[] = [];
  for (let row = 0; row < sheet.rows; row++) {
    for (let col = 0; col < sheet.cols; col++) {
      out.push({
        doc, page, sheet, col, row, number: at(col, row)!, total: nums.total,
        next: { left: at(col - 1, row), right: at(col + 1, row), up: at(col, row - 1), down: at(col, row + 1) },
      });
    }
  }
  return out;
}
