import React, { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import interItalicUrl from '@fontsource-variable/inter/files/inter-latin-wght-italic.woff2?url';
import { DiagramLayer } from '../render/DiagramLayer';
import { canvasThemes, type ThemeName } from '../render/theme';
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
  const rects = page.order.map((id) => page.nodes[id]).filter((n) => n && !n.hidden).map((n) => nodeVisualRect(n, page, s.defs, s.doc.vlans));
  const b = unionRects(rects) ?? { x: 0, y: 0, w: 100, h: 100 };
  const pad = o.padding;
  const vb = { x: Math.floor(b.x - pad), y: Math.floor(b.y - pad), w: Math.ceil(b.w + pad * 2), h: Math.ceil(b.h + pad * 2) };
  const inner = renderSvgMarkup(createElement(DiagramLayer, { page, defs: s.defs, vlans: s.doc.vlans, theme, linkColorByMedia: s.doc.linkColorByMedia, lineJumps: s.doc.lineJumps, hidePortLabels: s.doc.hidePortLabels, doc: s.doc, layers: s.doc.layers }));
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

export async function exportPng(o: ExportOpts) {
  const { svg, w, h } = await buildSvg(o);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas');
  c.width = Math.round(w * o.scale);
  c.height = Math.round(h * o.scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(o.scale, o.scale);
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
  downloadBlob(`${safeName(useStore.getState().doc.name)} - ${safeName(currentPage().name)}.png`, blob);
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
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
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
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadText(`${safeName(s.doc.name)} - cable schedule.csv`, '﻿' + csv, 'text/csv');
}

/** Print / save as PDF: opens a print window with one landscape sheet per page. */
export async function exportPdf(o: ExportOpts & { allPages?: boolean }) {
  const s = useStore.getState();
  const pages = o.allPages ? s.doc.pages : [s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]];
  const svgs: { name: string; svg: string; w: number; h: number }[] = [];
  for (const p of pages) {
    const r = await buildSvg({ ...o, pageId: p.id, selectionOnly: false });
    svgs.push({ name: p.name, ...r });
  }
  const win = window.open('', '_blank');
  if (!win) { s.toast('Pop-up blocked: allow pop-ups for this page to print', 'error'); return; }
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.doc.name)}</title>
<style>
@page { size: ${svgs.some((x) => x.w >= x.h) ? 'landscape' : 'portrait'}; margin: 10mm; }
html, body { margin: 0; background: #fff; font-family: system-ui, sans-serif; }
.sheet { page-break-after: always; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; padding: 6mm; }
.sheet:last-child { page-break-after: auto; }
.sheet h1 { font-size: 11pt; margin: 0 0 4mm; color: #333; font-weight: 600; }
.sheet .art { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
.sheet svg { max-width: 100%; max-height: 100%; width: auto; height: auto; }
.bar { position: fixed; top: 8px; right: 8px; background: #1a8fd8; color: #fff; border: 0; padding: 8px 14px; border-radius: 6px; font: 600 13px system-ui; cursor: pointer; }
@media print { .bar { display: none; } }
</style></head><body>
<button class="bar" onclick="window.print()">Print / Save as PDF</button>
${svgs.map((x) => `<section class="sheet"><h1>${esc(s.doc.name)}${pages.length > 1 ? ' — ' + esc(x.name) : ''}</h1><div class="art">${x.svg}</div></section>`).join('')}
<script>setTimeout(function(){ window.print(); }, 400);</script>
</body></html>`);
  win.document.close();
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
  root.querySelectorAll('script[data-networkcanvas-doc]').forEach((e) => e.remove());
  const mount = root.querySelector('#root');
  if (mount) mount.innerHTML = '';
  const title = root.querySelector('title');
  if (title) title.textContent = doc.name;
  const json = JSON.stringify(doc).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
  const script = document.createElement('script');
  script.setAttribute('data-networkcanvas-doc', '');
  script.textContent = `window.__NETWORKCANVAS_DOC__=${json};window.__NETWORKCANVAS_VIEW__=true;`;
  root.querySelector('head')!.appendChild(script);
  return '<!doctype html>\n' + root.outerHTML;
}

export function exportViewerHtml() {
  const s = useStore.getState();
  downloadText(`${safeName(s.doc.name)} - interactive.html`, buildViewerHtml(), 'text/html');
}
