import React, { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import interItalicUrl from '@fontsource-variable/inter/files/inter-latin-wght-italic.woff2?url';
import { DiagramLayer } from '../render/DiagramLayer';
import { canvasThemes, type CanvasTheme, type ThemeName } from '../render/theme';
import { SheetFrame, sheetInfos } from '../render/SheetFrame';
import { effectiveSheet, frameMm, paperMm, tiles } from '../model/sheet';
import type { Page } from '../model/types';
import { currentPage, useStore } from '../store/store';
import { nodeVisualRect } from '../model/geometry';
import { downloadBlob, downloadText, unionRects } from '../model/util';
import { safeName } from '../store/persistence';
import { withEmbeddedDefs } from '../store/store';

export interface ExportOpts { theme: ThemeName; background: boolean; selectionOnly: boolean; scale: number; padding: number; pageId?: string }

async function fontCss(): Promise<string> {
  const toData = async (u: string) => {
    if (u.startsWith('data:')) return u;
    const b = await (await fetch(u)).blob();
    return await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(b); });
  };
  try {
    const [n, i] = await Promise.all([toData(interUrl), toData(interItalicUrl)]);
    return `@font-face{font-family:'Inter Variable';font-weight:100 900;font-style:normal;src:url(${n}) format('woff2')}` +
      `@font-face{font-family:'Inter Variable';font-weight:100 900;font-style:italic;src:url(${i}) format('woff2')}`;
  } catch {
    return '';
  }
}

/** Render React SVG content off-screen and serialise it as XML (no react-dom/server needed). */
function renderSvgMarkup(el: React.ReactElement): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' }, el)));
  const svgEl = host.querySelector('svg')!;
  const ser = new XMLSerializer();
  const out = Array.from(svgEl.childNodes).map((n) => ser.serializeToString(n)).join('');
  root.unmount();
  return out;
}

/** the visible content of a page, canvas units (null when empty) */
export function pageContentRect(page: Page) {
  const s = useStore.getState();
  const rects = page.order.map((id) => page.nodes[id]).filter((n) => n && !n.hidden).map((n) => nodeVisualRect(n, page, s.defs, s.doc.vlans));
  return unionRects(rects);
}

/** a page's drawing as SVG markup (without the outer <svg>) */
function renderPageInner(page: Page, theme: CanvasTheme) {
  const s = useStore.getState();
  return renderSvgMarkup(createElement(DiagramLayer, { page, defs: s.defs, vlans: s.doc.vlans, theme, linkColorByMedia: s.doc.linkColorByMedia, lineJumps: s.doc.lineJumps, hidePortLabels: s.doc.hidePortLabels, doc: s.doc, layers: s.doc.layers }));
}

export async function buildSvg(o: ExportOpts): Promise<{ svg: string; w: number; h: number }> {
  const s = useStore.getState();
  let page = (o.pageId && s.doc.pages.find((p) => p.id === o.pageId)) || currentPage();
  if (o.selectionOnly && s.selection.length) {
    const keep = new Set(s.selection);
    page = {
      ...page,
      order: page.order.filter((id) => keep.has(id)),
      links: Object.fromEntries(Object.entries(page.links).filter(([, l]) => keep.has(l.from.node) && keep.has(l.to.node))),
    };
  }
  const theme = canvasThemes[o.theme];
  const b = pageContentRect(page) ?? { x: 0, y: 0, w: 100, h: 100 };
  const pad = o.padding;
  const vb = { x: Math.floor(b.x - pad), y: Math.floor(b.y - pad), w: Math.ceil(b.w + pad * 2), h: Math.ceil(b.h + pad * 2) };
  const inner = renderPageInner(page, theme);
  const css = await fontCss();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${vb.w}" height="${vb.h}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}">` +
    `<style>${css}</style>` +
    (o.background ? `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="${theme.bg}"/>` : '') +
    inner +
    `</svg>`;
  return { svg, w: vb.w, h: vb.h };
}

export async function exportSvg(o: ExportOpts) {
  const { svg } = await buildSvg(o);
  downloadText(`${safeName(useStore.getState().doc.name)} - ${safeName(currentPage().name)}.svg`, svg, 'image/svg+xml');
}

/** Largest bitmap browsers reliably create (WebKit on iPad/iPhone is much lower than desktop Chromium/Firefox). */
function canvasLimits() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return { side: ios ? 4096 : 16384, area: ios ? 16_700_000 : 120_000_000 };
}

export async function exportPng(o: ExportOpts) {
  const { svg, w, h } = await buildSvg(o);
  const lim = canvasLimits();
  const scale = Math.min(o.scale, lim.side / Math.max(w, h), Math.sqrt(lim.area / (w * h)));
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w * scale));
  c.height = Math.max(1, Math.floor(h * scale));
  const ctx = c.getContext('2d');
  if (!ctx) { URL.revokeObjectURL(url); throw new Error('the browser could not create an image this large. Export SVG or PDF instead.'); }
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('the browser could not create an image this large. Export SVG or PDF instead.');
  downloadBlob(`${safeName(useStore.getState().doc.name)} - ${safeName(currentPage().name)}.png`, blob);
  if (scale < o.scale - 0.01) useStore.getState().toast(`This page is large, so the PNG was made at ${scale.toFixed(1)}× instead of ${o.scale}× (browser limit). For printing, export SVG or PDF.`, 'info');
}

/**
 * One CSV cell. Text that a spreadsheet would read as a formula (=, +, -, @, tab, CR) gets a leading
 * apostrophe, so names like "+CAB1-K1" stay text and crafted cells cannot run formulas or DDE.
 */
export function csvCell(v: unknown): string {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
}

/** Device inventory as CSV (name, type, addresses, properties). */
export function exportInventoryCsv() {
  const s = useStore.getState();
  const rows: string[][] = [['Page', 'Name', 'Type', 'Category', 'Addresses', 'VLANs', 'Properties']];
  for (const p of s.doc.pages) {
    for (const id of p.order) {
      const n = p.nodes[id];
      if (n?.kind !== 'device') continue;
      const def = s.defs[n.defId];
      rows.push([
        p.name, n.name, def?.name ?? n.defId, def?.category ?? '',
        n.addresses.map((a) => a.value).join(' | '),
        n.addresses.map((a) => s.doc.vlans.find((v) => v.id === a.vlan)?.vlanId ?? '').join(' | '),
        Object.entries(n.props).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; '),
      ]);
    }
  }
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  downloadText(`${safeName(s.doc.name)} - inventory.csv`, '﻿' + csv, 'text/csv');
}

/** Cable schedule: one row per link, with both ends and the documentation fields. */
export function exportCableScheduleCsv() {
  const s = useStore.getState();
  const rows: string[][] = [['Page', 'From device', 'From port', 'To device', 'To port', 'Media', 'Speed', 'VLANs', 'Cable ID', 'Label', 'Notes']];
  for (const p of s.doc.pages) {
    for (const l of Object.values(p.links)) {
      const a = p.nodes[l.from.node], b = p.nodes[l.to.node];
      if (!a || !b) continue;
      const portName = (n: typeof a, id?: string) => (n.kind === 'device' && id ? s.defs[n.defId]?.ports.find((x) => x.id === id)?.name ?? '' : '');
      const name = (n: typeof a) => (n.kind === 'device' ? n.name : n.kind === 'zone' ? n.title : n.kind);
      rows.push([p.name, name(a), l.fromLabel ?? portName(a, l.from.port), name(b), l.toLabel ?? portName(b, l.to.port), l.media, l.speed ?? '', l.vlans ?? '', l.cableId ?? '', l.label ?? '', l.notes ?? '']);
    }
  }
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  downloadText(`${safeName(s.doc.name)} - cable schedule.csv`, '﻿' + csv, 'text/csv');
}

export interface PrintSheet { cls: string; w: number; h: number; svg: string; number: number }

/**
 * Every drawing sheet of the chosen pages as SVG in millimetres: the page's drawing clipped to
 * the frame at the sheet's scale, then the ISO 5457 frame and title block on top. Always the
 * light drawing: paper is white, whatever theme the editor uses.
 */
export function buildPrintSheets(pages: Page[]): PrintSheet[] {
  const s = useStore.getState();
  const light = canvasThemes.light;
  const out: PrintSheet[] = [];
  for (const p of pages) {
    const sheet = effectiveSheet(p, pageContentRect(p));
    const infos = sheetInfos(s.doc, p, sheet);
    const inner = renderPageInner(p, light);
    const paper = paperMm(sheet), f = frameMm(sheet), k = sheet.unitsPerMm;
    tiles(sheet).forEach((t, i) => {
      const clip = `nc-sheet-${infos[i].number}`;
      const frame = renderSvgMarkup(createElement(SheetFrame, { info: infos[i], theme: light }));
      out.push({
        cls: `s-${sheet.size.toLowerCase()}-${sheet.orientation}`,
        w: paper.w, h: paper.h, number: infos[i].number,
        svg:
          `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${paper.w}mm" height="${paper.h}mm" viewBox="0 0 ${paper.w} ${paper.h}">` +
          `<defs><clipPath id="${clip}"><rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}"/></clipPath></defs>` +
          `<rect width="${paper.w}" height="${paper.h}" fill="#ffffff"/>` +
          `<g clip-path="url(#${clip})"><g transform="translate(${f.x} ${f.y}) scale(${1 / k}) translate(${-t.frame.x} ${-t.frame.y})">${inner}</g></g>` +
          frame +
          `</svg>`,
      });
    });
  }
  return out;
}

/** Print / save as PDF: opens a print window with every drawing sheet at its own paper size. */
export async function exportPdf(o: { allPages?: boolean }) {
  const s = useStore.getState();
  const pages = o.allPages ? s.doc.pages : [s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]];
  const sheets = buildPrintSheets(pages);
  const css = await fontCss();
  const win = window.open('', '_blank');
  if (!win) { s.toast('Pop-up blocked: allow pop-ups for this page to print', 'error'); return; }
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  // one named @page per paper size, so mixed sizes print each on its own paper
  const sizes = new Map(sheets.map((x) => [x.cls, x]));
  const pageCss = [...sizes.values()].map((x) => `@page ${x.cls} { size: ${x.w}mm ${x.h}mm; margin: 0; }\n.sheet.${x.cls} { page: ${x.cls}; width: ${x.w}mm; height: ${x.h}mm; }`).join('\n');
  const summary = [...sizes.values()].map((x) => x.cls.split('-').slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')).join(', ');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.doc.name)}</title>
<style>
${css}
@page { margin: 0; }
${pageCss}
html, body { margin: 0; background: #fff; font-family: system-ui, sans-serif; }
.sheet { break-after: page; overflow: hidden; background: #fff; }
.sheet:last-child { break-after: auto; }
.sheet > svg { display: block; width: 100%; height: 100%; }
.bar { position: sticky; top: 0; display: flex; gap: 12px; align-items: center; padding: 8px 16px; background: #1c2028; color: #fff; font: 13px system-ui; }
.bar button { background: #1a8fd8; color: #fff; border: 0; padding: 7px 14px; border-radius: 6px; font: 600 13px system-ui; cursor: pointer; }
@media screen { body { background: #d9dce1; } .sheet { margin: 16px auto; box-shadow: 0 1px 4px rgba(0, 0, 0, .25); } }
@media print { .bar { display: none; } }
</style></head><body>
<div class="bar"><button type="button">Print / Save as PDF</button><span>${sheets.length} sheet${sheets.length === 1 ? '' : 's'} · ${esc(summary)}. Keep the print scale at 100 % so drawings stay true to scale.</span></div>
${sheets.map((x) => `<section class="sheet ${x.cls}" data-sheet="${x.number}">${x.svg}</section>`).join('\n')}
</body></html>`);
  win.document.close();
  // no inline script in the print window: the app's Content-Security-Policy applies to it too
  win.document.querySelector('.bar button')?.addEventListener('click', () => win.print());
  setTimeout(() => win.print(), 400);
}

/**
 * Interactive HTML: this very app with the document embedded, opening in a
 * read-only viewer (pan/zoom, search, hover cards, device details) that can
 * also switch to the full editor. Works offline, single file.
 */
export function buildViewerHtml(): string {
  const s = useStore.getState();
  const doc = withEmbeddedDefs(s.doc, s.libDefs);
  const root = document.documentElement.cloneNode(true) as HTMLElement;
  root.removeAttribute('data-theme');
  root.querySelectorAll('script[data-networkcanvas-doc], script#networkcanvas-doc').forEach((e) => e.remove());
  const mount = root.querySelector('#root');
  if (mount) mount.innerHTML = '';
  const title = root.querySelector('title');
  if (title) title.textContent = doc.name;
  const json = JSON.stringify(doc).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
  // a data block, not a script: it never runs, so the Content-Security-Policy stays strict
  const script = document.createElement('script');
  script.type = 'application/json';
  script.id = 'networkcanvas-doc';
  script.textContent = json;
  root.querySelector('head')!.appendChild(script);
  return '<!doctype html>\n' + root.outerHTML;
}

export function exportViewerHtml() {
  const s = useStore.getState();
  downloadText(`${safeName(s.doc.name)} - interactive.html`, buildViewerHtml(), 'text/html');
}
