// Every diagram that enters the app (opened file, browser storage, interactive-HTML export, library pack)
// passes through here first. The rest of the code can then trust the shape of the data:
//   - impossible files are refused with a message a person can act on (DocError);
//   - repairable gaps are filled with defaults and reported as warnings;
//   - colours and image references are restricted to safe values, so a crafted file cannot make
//     the app (or an export) fetch a URL or run script;
//   - files from a newer format version are refused instead of being half-understood.
import type { Address, DeviceDef, DiagramDoc, DiagramNode, Layer, Link, Page, SheetSetup, Vlan } from './types';
import { MAX_TILES, PAPER } from './sheet';
import { uid } from './util';

/** The file-format version this build reads and writes. Bump it with a migration in MIGRATIONS. */
export const CURRENT_VERSION = 1;

/** Migrations from version n to n + 1, applied in order to older files. None yet. */
const MIGRATIONS: Record<number, (raw: Record<string, any>) => void> = {};

export class DocError extends Error {}

export interface Normalized<T> { value: T; warnings: string[] }

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** a finite number, accepting numeric strings such as "400" or "400px"; `undefined` when impossible */
function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; }
  return undefined;
}

const COLOR_RE = [
  /^#[0-9a-f]{3,8}$/i,
  /^accent[\w-]*$/,
  /^(none|transparent|currentcolor)$/i,
  /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)$/i,
  /^hsla?\(\s*[\d.]+(deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+%?\s*)?\)$/i,
  /^[a-z]{3,20}$/i, // named colours
];
export const isSafeColor = (c: string) => COLOR_RE.some((r) => r.test(c.trim()));
/** images may only be embedded raster/SVG data — never a URL the browser would fetch */
export const isSafeImageHref = (h: string) => /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml)[;,]/i.test(h.trim());

const COLOR_KEYS = new Set(['color', 'fill', 'stroke', 'accent', 'stopColor', 'background']);
const HREF_KEYS = new Set(['href', 'src', 'xlinkHref']);

/**
 * Walks any JSON value and returns a cleaned copy: drops prototype-polluting keys, drops colour values
 * that are not plain colours (e.g. `url(http://…)`), and drops image references that are not data URLs.
 */
function scrub(v: unknown, warn: (m: string) => void, path: string): unknown {
  if (Array.isArray(v)) return v.map((x, i) => scrub(x, warn, `${path}[${i}]`));
  if (!isObj(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (BAD_KEYS.has(k)) { warn(`Ignored a field named “${k}” (${path}).`); continue; }
    if (COLOR_KEYS.has(k) && typeof x === 'string' && x && !isSafeColor(x)) { warn(`Removed an unsupported colour value at ${path}.${k}.`); continue; }
    if (HREF_KEYS.has(k) && typeof x === 'string' && x && !isSafeImageHref(x)) { warn(`Removed an external image reference at ${path}.${k}; only embedded images are allowed.`); continue; }
    out[k] = scrub(x, warn, `${path}.${k}`);
  }
  return out;
}

function geometry(n: Record<string, any>, warn: (m: string) => void, label: string) {
  for (const [k, d] of [['x', 0], ['y', 0], ['w', 40], ['h', 40]] as const) {
    const v = num(n[k]);
    if (v === undefined) { warn(`${label}: ${k} was missing or not a number; set to ${d}.`); n[k] = d; }
    else { if (typeof n[k] !== 'number') warn(`${label}: ${k} “${n[k]}” read as ${v}.`); n[k] = v; }
  }
  if (n.w < 0) n.w = Math.abs(n.w);
  if (n.h < 0) n.h = Math.abs(n.h);
}

function props(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v)) if (!BAD_KEYS.has(k) && x != null && typeof x !== 'object') out[k] = String(x);
  return out;
}

const NODE_KINDS = new Set(['device', 'zone', 'text', 'rect', 'legend', 'vlanTable', 'image', 'callout', 'titleBlock']);

function node(raw: Record<string, any>, id: string, warn: (m: string) => void): DiagramNode | null {
  const label = `“${str(raw.name || raw.title || raw.text, id)}”`;
  if (!NODE_KINDS.has(raw.kind)) { warn(`Skipped an object of unknown kind “${str(raw.kind, '?')}”.`); return null; }
  const n: Record<string, any> = { ...raw, id };
  geometry(n, warn, label);
  for (const b of ['hidden', 'locked', 'flipX'] as const) if (n[b] !== undefined) n[b] = !!n[b];
  switch (n.kind) {
    case 'device': {
      if (typeof n.defId !== 'string' || !n.defId) { warn(`Skipped device ${label}: it has no device type.`); return null; }
      n.name = str(n.name);
      n.addresses = (Array.isArray(n.addresses) ? n.addresses : [])
        .filter((a: unknown) => isObj(a) || typeof a === 'string')
        .map((a: any): Address => (typeof a === 'string' ? { id: uid('a'), value: a } : { ...a, id: str(a.id) || uid('a'), value: str(a.value), vlan: typeof a.vlan === 'string' ? a.vlan : undefined }));
      n.props = props(n.props);
      if (!['bottom', 'top', 'left', 'right', 'none'].includes(n.labelPos)) n.labelPos = 'bottom';
      if (n.subtitle !== undefined) n.subtitle = str(n.subtitle);
      break;
    }
    case 'zone':
      n.title = str(n.title); n.radius = num(n.radius) ?? 6; n.titleAlign = n.titleAlign === 'right' ? 'right' : 'left';
      break;
    case 'text':
      n.text = str(n.text); n.fontSize = num(n.fontSize) ?? 14; if (!['left', 'center', 'right'].includes(n.align)) n.align = 'left';
      break;
    case 'rect':
      n.strokeWidth = num(n.strokeWidth) ?? 1; n.radius = num(n.radius) ?? 0;
      break;
    case 'legend':
      n.title = str(n.title, 'Legend'); n.columns = Math.max(1, Math.round(num(n.columns) ?? 4));
      break;
    case 'vlanTable':
      n.title = str(n.title, 'VLAN Table');
      break;
    case 'image':
      if (typeof n.href !== 'string' || !n.href) { warn(`Skipped an image without an embedded picture.`); return null; }
      break;
    case 'callout':
      n.text = str(n.text); n.fontSize = num(n.fontSize) ?? 11;
      break;
    case 'titleBlock':
      n.showDate = n.showDate !== false; n.showPage = n.showPage !== false;
      break;
  }
  return n as DiagramNode;
}

function link(raw: Record<string, any>, id: string, page: Page, warn: (m: string) => void): Link | null {
  const ep = (e: any) => (isObj(e) && typeof e.node === 'string' ? { node: e.node, port: typeof e.port === 'string' ? e.port : undefined } : null);
  const from = ep(raw.from), to = ep(raw.to);
  if (!from || !to || !page.nodes[from.node] || !page.nodes[to.node]) { warn(`Removed a link on page “${page.name}” whose end points to nothing.`); return null; }
  const l: Record<string, any> = { ...raw, id, from, to };
  if (typeof l.media !== 'string') l.media = 'ethernet';
  if (!['straight', 'orthogonal', 'curved'].includes(l.routing)) l.routing = 'straight';
  l.width = num(l.width) ?? 1.6;
  if (!['solid', 'dashed', 'dotted'].includes(l.dash)) l.dash = 'solid';
  l.arrowStart = !!l.arrowStart; l.arrowEnd = l.arrowEnd === undefined ? true : !!l.arrowEnd;
  l.showPortLabels = l.showPortLabels === undefined ? true : !!l.showPortLabels;
  if (l.bend !== undefined) l.bend = num(l.bend) ?? 0.5;
  if (l.waypoints !== undefined) l.waypoints = (Array.isArray(l.waypoints) ? l.waypoints : []).map((p: any) => ({ x: num(p?.x), y: num(p?.y) })).filter((p: any) => p.x !== undefined && p.y !== undefined);
  for (const k of ['label', 'fromLabel', 'toLabel', 'speed', 'vlans', 'cableId', 'notes'] as const) if (l[k] !== undefined) l[k] = str(l[k]);
  return l as Link;
}

function page(raw: unknown, i: number, warn: (m: string) => void): Page {
  const p: Record<string, any> = isObj(raw) ? { ...raw } : {};
  p.id = str(p.id) || uid('pg');
  p.name = str(p.name, `Page ${i + 1}`);
  const rawNodes: Record<string, any> = Array.isArray(p.nodes) ? Object.fromEntries(p.nodes.filter(isObj).map((n: any) => [str(n.id) || uid('n'), n])) : isObj(p.nodes) ? p.nodes : {};
  const nodes: Record<string, DiagramNode> = {};
  for (const [id, n] of Object.entries(rawNodes)) {
    if (BAD_KEYS.has(id) || !isObj(n)) continue;
    const ok = node(n, id, warn);
    if (ok) nodes[id] = ok;
  }
  const out: Page = { ...p, id: p.id, name: p.name, nodes, order: [], links: {} } as Page;
  const seen = new Set<string>();
  for (const id of Array.isArray(p.order) ? p.order : []) if (typeof id === 'string' && nodes[id] && !seen.has(id)) { seen.add(id); out.order.push(id); }
  for (const id of Object.keys(nodes)) if (!seen.has(id)) out.order.push(id);
  const rawLinks: Record<string, any> = Array.isArray(p.links) ? Object.fromEntries(p.links.filter(isObj).map((l: any) => [str(l.id) || uid('l'), l])) : isObj(p.links) ? p.links : {};
  for (const [id, l] of Object.entries(rawLinks)) {
    if (BAD_KEYS.has(id) || !isObj(l)) continue;
    const ok = link(l, id, out, warn);
    if (ok) out.links[id] = ok;
  }
  delete out.sheet;
  const sh = sheet(p.sheet);
  if (sh) out.sheet = sh;
  else if (p.sheet !== undefined) warn(`The print sheet of page “${out.name}” was not understood and was reset.`);
  return out;
}

function sheet(raw: unknown): SheetSetup | undefined {
  if (!isObj(raw) || typeof raw.size !== 'string' || !Object.hasOwn(PAPER, raw.size)) return undefined;
  const k = num(raw.unitsPerMm);
  const tiles = (v: unknown) => Math.min(MAX_TILES, Math.max(1, Math.round(num(v) ?? 1)));
  return {
    size: raw.size as SheetSetup['size'],
    orientation: raw.orientation === 'portrait' ? 'portrait' : 'landscape',
    x: num(raw.x) ?? 0,
    y: num(raw.y) ?? 0,
    unitsPerMm: k && k >= 0.05 && k <= 1000 ? k : 96 / 25.4,
    cols: tiles(raw.cols),
    rows: tiles(raw.rows),
  };
}

function vlan(raw: unknown): Vlan | null {
  if (!isObj(raw)) return null;
  return { ...raw, id: str(raw.id) || uid('v'), vlanId: Math.round(num(raw.vlanId) ?? 0), name: str(raw.name), subnet: str(raw.subnet), color: str(raw.color, '#8b95a5'), description: str(raw.description) } as Vlan;
}

/** A device definition from a file, a library pack or browser storage. Returns null when unusable. */
export function normalizeDef(raw: unknown, warn: (m: string) => void = () => {}): DeviceDef | null {
  const d = scrub(raw, warn, 'device') as Record<string, any>;
  if (!isObj(d) || typeof d.id !== 'string' || !d.id || BAD_KEYS.has(d.id)) { warn('Skipped a device definition without an id.'); return null; }
  const w = num(d.w), h = num(d.h);
  if (!w || !h) { warn(`Skipped device definition “${str(d.name, d.id)}”: it has no size.`); return null; }
  const fields = (Array.isArray(d.fields) ? d.fields : []).filter((f: any) => isObj(f) && typeof f.key === 'string' && /^[\w.-]{1,60}$/.test(f.key)).map((f: any) => ({ ...f, label: str(f.label, f.key) }));
  return {
    ...d, w, h, name: str(d.name, d.id), category: str(d.category, 'Custom'), accent: str(d.accent, '#1a8fd8'),
    shapes: (Array.isArray(d.shapes) ? d.shapes : []).filter(isObj),
    ports: (Array.isArray(d.ports) ? d.ports : []).filter((p: any) => isObj(p) && typeof p.id === 'string' && Number.isFinite(num(p.x)) && Number.isFinite(num(p.y))),
    fields,
  } as DeviceDef;
}

/**
 * Turns anything parsed from JSON into a document the app can render, or throws DocError.
 * Never mutates its input.
 */
export function normalizeDoc(input: unknown): Normalized<DiagramDoc> {
  const warnings: string[] = [];
  const warn = (m: string) => { if (warnings.length < 200 && !warnings.includes(m)) warnings.push(m); };
  if (!isObj(input)) throw new DocError('This file is not a Network Canvas diagram.');
  if (input.format !== 'networkcanvas' && input.format !== 'netcanvas') throw new DocError('This file is not a Network Canvas diagram.');
  const version = input.version === undefined ? 1 : num(input.version);
  if (!version || version < 1 || !Number.isInteger(version)) throw new DocError('This file has an unknown format version and cannot be opened.');
  if (version > CURRENT_VERSION) throw new DocError(`This diagram was saved by a newer Network Canvas (file format ${version}; this copy reads up to ${CURRENT_VERSION}). Open it with the latest version.`);
  const raw = scrub(input, warn, 'diagram') as Record<string, any>;
  for (let v = version; v < CURRENT_VERSION; v++) MIGRATIONS[v]?.(raw);
  if (!Array.isArray(raw.pages) || !raw.pages.length) throw new DocError('This diagram has no pages, so there is nothing to open.');
  const now = Date.now();
  const doc: DiagramDoc = {
    ...raw,
    format: 'networkcanvas',
    version: CURRENT_VERSION,
    id: str(raw.id) || uid('doc'),
    name: str(raw.name) || 'Untitled diagram',
    pages: raw.pages.map((p: unknown, i: number) => page(p, i, warn)),
    vlans: (Array.isArray(raw.vlans) ? raw.vlans : []).map(vlan).filter((v: Vlan | null): v is Vlan => !!v),
    createdAt: num(raw.createdAt) ?? now,
    updatedAt: num(raw.updatedAt) ?? now,
  } as DiagramDoc;
  if (raw.layers !== undefined) doc.layers = (Array.isArray(raw.layers) ? raw.layers : []).filter(isObj).map((l: any): Layer => ({ ...l, id: str(l.id) || uid('ly'), name: str(l.name, 'Layer') }));
  if (raw.embeddedDefs !== undefined) doc.embeddedDefs = (Array.isArray(raw.embeddedDefs) ? raw.embeddedDefs : []).map((d: unknown) => normalizeDef(d, warn)).filter((d: DeviceDef | null): d is DeviceDef => !!d);
  if (raw.meta !== undefined) doc.meta = isObj(raw.meta) ? (props(raw.meta) as DiagramDoc['meta']) : undefined;
  if (doc.namePattern !== undefined) doc.namePattern = str(doc.namePattern);
  const seenPages = new Set<string>();
  for (const p of doc.pages) { if (seenPages.has(p.id)) { warn(`Two pages shared the id ${p.id}; one was renamed.`); p.id = uid('pg'); } seenPages.add(p.id); }
  return { value: doc, warnings };
}

/** the same, but never throws: unusable input → null (for stored documents and thumbnails) */
export function tryNormalizeDoc(input: unknown): DiagramDoc | null {
  try { return normalizeDoc(input).value; } catch { return null; }
}
