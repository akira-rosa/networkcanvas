import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { DeviceDef, DeviceNode, DiagramDoc, DiagramNode, IconStyle, Link, Page, Tool, Viewport } from '../model/types';
import type { DefMap } from '../model/geometry';
import { nodeRect } from '../model/geometry';
import { ALL_BUILTIN as BUILTIN_DEFS } from '../library';
import { newDoc, newPage } from '../model/factory';
import { deepClone, uid, unionRects } from '../model/util';
import { treeLayout } from '../model/layout';
import type { ThemeName } from '../render/theme';

export type ThemePref = 'system' | 'light' | 'dark';
export const systemTheme = (): ThemeName =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

export interface Toast { id: string; text: string; kind: 'info' | 'error' | 'success' }
export type Modal = null | 'vlans' | 'shortcuts' | 'library' | 'find' | 'export' | 'table' | 'import';

export interface EditorSession { def: DeviceDef; isNew: boolean; returnTo?: string }

interface State {
  doc: DiagramDoc;
  pageId: string;
  selection: string[];
  past: DiagramDoc[];
  future: DiagramDoc[];
  gestureBase: DiagramDoc | null;

  userDefs: DeviceDef[];
  /** raw library (what the Library panel and editor show) */
  libDefs: DefMap;
  /** styled map used for rendering the current document */
  defs: DefMap;
  setIconStyle: (style: IconStyle) => void;
  setDeviceStyle: (ids: string[], style: IconStyle | 'auto') => void;

  tool: Tool;
  /** resolved theme actually shown */
  theme: ThemeName;
  /** user preference; 'system' follows the browser / OS setting */
  themePref: ThemePref;
  cycleTheme: () => void;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  showPorts: boolean;
  smartGuides: boolean;
  viewports: Record<string, Viewport>;
  leftTab: 'library' | 'layers';
  /** hide side panels (Ctrl+\) */
  hideUi: boolean;
  /** the start screen (diagram manager) is showing instead of the editor */
  home: boolean;
  /** viewer mode: no editing, clicks only select */
  readOnly: boolean;
  libStyle: 'iso' | 'detailed' | 'all';
  modal: Modal;
  editor: EditorSession | null;
  toasts: Toast[];
  clipboard: { nodes: DiagramNode[]; links: Link[] } | null;
  dirty: boolean;
  lastSaved: number;
  /** bumping this asks the canvas to fit the content */
  fitRequest: number;

  change: (fn: (doc: Draft<DiagramDoc>, page: Draft<Page>) => void, history?: boolean) => void;
  beginGesture: () => void;
  endGesture: () => void;
  cancelGesture: () => void;
  undo: () => void;
  redo: () => void;

  loadDoc: (doc: DiagramDoc) => void;
  newDocument: () => void;
  setPage: (id: string) => void;
  addPage: () => void;
  duplicatePage: (id: string) => void;
  deletePage: (id: string) => void;

  select: (ids: string[], mode?: 'replace' | 'add' | 'toggle') => void;
  selectAll: () => void;
  deleteSelection: () => void;
  copy: () => void;
  paste: (at?: { x: number; y: number }) => void;
  duplicate: () => void;
  zOrder: (dir: 'front' | 'back' | 'forward' | 'backward') => void;
  align: (how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hdist' | 'vdist') => void;
  group: () => void;
  ungroup: () => void;
  autoLayout: () => void;

  setViewport: (vp: Viewport) => void;
  set: (p: Partial<State>) => void;
  toast: (text: string, kind?: Toast['kind']) => void;

  setUserDefs: (defs: DeviceDef[]) => void;
  saveUserDef: (def: DeviceDef) => void;
  deleteUserDef: (id: string) => void;
  openEditor: (def: DeviceDef, isNew?: boolean) => void;
}

/** Raw library: every definition by its own id. */
export function buildDefMap(userDefs: DeviceDef[], doc?: DiagramDoc): DefMap {
  const m: DefMap = {};
  for (const d of BUILTIN_DEFS) m[d.id] = d;
  for (const d of doc?.embeddedDefs ?? []) if (!m[d.id]) m[d.id] = d;
  for (const d of userDefs) m[d.id] = d;
  return m;
}

export const styleOf = (d: DeviceDef): IconStyle => d.style ?? 'iso';

/** The counterpart of a definition in the other icon style, if there is one. */
export function counterpartOf(raw: DefMap, id: string): DeviceDef | undefined {
  const d = raw[id];
  if (!d) return undefined;
  if (d.counterpart && raw[d.counterpart]) return raw[d.counterpart];
  const other = id.startsWith('d-') ? raw[id.slice(2)] : raw['d-' + id];
  if (other && styleOf(other) !== styleOf(d)) return other;
  // reverse links from user devices
  return Object.values(raw).find((x) => x.counterpart === id && styleOf(x) !== styleOf(d));
}

/** The variant of `id` drawn in `style` (falls back to the definition itself). */
export function variantOf(raw: DefMap, id: string, style: IconStyle): DeviceDef | undefined {
  const d = raw[id];
  if (!d || styleOf(d) === style) return d;
  const c = counterpartOf(raw, id);
  return c && styleOf(c) === style ? c : d;
}

/**
 * Node defId to use when a library definition is placed on the current document:
 * the raw id when it already matches the document style (so it follows later switches),
 * otherwise an explicit "<id>@<style>" override so what was dragged is what appears.
 */
export function placementDefId(raw: DefMap, def: DeviceDef, docStyle: IconStyle): string {
  if (styleOf(def) === docStyle) return def.id;
  const c = counterpartOf(raw, def.id);
  return c ? `${def.id}@${styleOf(def)}` : def.id;
}

/** node defId → raw id (strips a per-device style override such as "switch@detailed") */
export const rawDefId = (defId: string) => defId.split('@')[0];
export const defIdOverride = (defId: string): IconStyle | undefined => defId.split('@')[1] as IconStyle | undefined;

/**
 * The map the diagram renders with: every id resolves to the variant for the
 * document's icon style, and "<id>@iso" / "<id>@detailed" force a style per device.
 */
export function styledDefMap(raw: DefMap, style: IconStyle): DefMap {
  const m: DefMap = {};
  for (const id of Object.keys(raw)) {
    m[id] = variantOf(raw, id, style)!;
    m[id + '@iso'] = variantOf(raw, id, 'iso')!;
    m[id + '@detailed'] = variantOf(raw, id, 'detailed')!;
  }
  return m;
}

const HISTORY_LIMIT = 150;

const initialDoc = newDoc();

export const useStore = create<State>((set, get) => ({
  doc: initialDoc,
  pageId: initialDoc.pages[0].id,
  selection: [],
  past: [],
  future: [],
  gestureBase: null,
  userDefs: [],
  libDefs: buildDefMap([]),
  defs: styledDefMap(buildDefMap([]), 'iso'),
  tool: 'select',
  theme: systemTheme(),
  themePref: 'system',
  cycleTheme: () => {
    const order: ThemePref[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(get().themePref) + 1) % order.length];
    set({ themePref: next, theme: next === 'system' ? systemTheme() : next });
  },
  showGrid: true,
  snapToGrid: true,
  gridSize: 8,
  showPorts: false,
  smartGuides: true,
  viewports: {},
  leftTab: 'library',
  hideUi: false,
  home: true,
  readOnly: false,
  libStyle: 'iso',
  modal: null,
  editor: null,
  toasts: [],
  clipboard: null,
  dirty: false,
  lastSaved: 0,
  fitRequest: 0,

  change: (fn, history = true) => {
    const { doc, pageId, past, gestureBase } = get();
    const next = produce(doc, (d) => {
      const page = d.pages.find((p) => p.id === pageId) ?? d.pages[0];
      fn(d, page);
      d.updatedAt = Date.now();
    });
    if (next === doc) return;
    if ((next.iconStyle ?? 'iso') !== (doc.iconStyle ?? 'iso')) set({ defs: styledDefMap(get().libDefs, next.iconStyle ?? 'iso') });
    if (history && !gestureBase) {
      set({ doc: next, past: [...past.slice(-HISTORY_LIMIT), doc], future: [], dirty: true });
    } else {
      set({ doc: next, dirty: true });
    }
  },
  beginGesture: () => set({ gestureBase: get().doc }),
  endGesture: () => {
    const { gestureBase, doc, past } = get();
    if (gestureBase && gestureBase !== doc) set({ past: [...past.slice(-HISTORY_LIMIT), gestureBase], future: [] });
    set({ gestureBase: null });
  },
  cancelGesture: () => {
    const { gestureBase } = get();
    if (gestureBase) set({ doc: gestureBase, gestureBase: null });
  },
  undo: () => {
    const { past, future, doc } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], dirty: true });
    fixPageAndSelection();
  },
  redo: () => {
    const { past, future, doc } = get();
    if (!future.length) return;
    const nxt = future[0];
    set({ doc: nxt, past: [...past, doc], future: future.slice(1), dirty: true });
    fixPageAndSelection();
  },

  loadDoc: (doc) => {
    const libDefs = buildDefMap(get().userDefs, doc);
    set({
      doc, pageId: doc.pages[0].id, selection: [], past: [], future: [], gestureBase: null,
      libDefs, defs: styledDefMap(libDefs, doc.iconStyle ?? 'iso'), dirty: false, fitRequest: get().fitRequest + 1,
      home: false, modal: null, editor: null,
      // the library shows the document's icon style (unless the user asked to see all)
      libStyle: get().libStyle === 'all' ? 'all' : doc.iconStyle ?? 'iso',
    });
  },
  setIconStyle: (style) => {
    const { libDefs, doc } = get();
    if ((doc.iconStyle ?? 'iso') === style) return;
    const before = styledDefMap(libDefs, doc.iconStyle ?? 'iso');
    const after = styledDefMap(libDefs, style);
    get().change((d) => {
      d.iconStyle = style;
      for (const p of d.pages) for (const n of Object.values(p.nodes)) {
        if (n.kind !== 'device') continue;
        refitDevice(n, before[n.defId], after[n.defId]);
      }
    });
    if (get().libStyle !== 'all') set({ libStyle: style });
  },
  setDeviceStyle: (ids, style) => {
    const { defs } = get();
    get().change((_d, pg) => {
      for (const id of ids) {
        const n = pg.nodes[id];
        if (n?.kind !== 'device') continue;
        const base = rawDefId(n.defId);
        const next = style === 'auto' ? base : `${base}@${style}`;
        if (next === n.defId) continue;
        refitDevice(n, defs[n.defId], defs[next]);
        n.defId = next;
      }
    });
  },
  newDocument: () => get().loadDoc(newDoc()),
  setPage: (id) => set({ pageId: id, selection: [] }),
  addPage: () => {
    const p = newPage(`Page ${get().doc.pages.length + 1}`);
    get().change((d) => { d.pages.push(p); });
    set({ pageId: p.id, selection: [] });
  },
  duplicatePage: (id) => {
    const src = get().doc.pages.find((p) => p.id === id);
    if (!src) return;
    const copy: Page = { ...deepClone(src), id: uid('pg'), name: src.name + ' copy' };
    get().change((d) => { d.pages.splice(d.pages.findIndex((p) => p.id === id) + 1, 0, copy); });
    set({ pageId: copy.id, selection: [] });
  },
  deletePage: (id) => {
    const { doc } = get();
    if (doc.pages.length <= 1) return get().toast('A document needs at least one page', 'error');
    const idx = doc.pages.findIndex((p) => p.id === id);
    get().change((d) => { d.pages = d.pages.filter((p) => p.id !== id); });
    // stay on the current page; when it was the one deleted, move to its neighbour
    const pages = get().doc.pages;
    const pageId = get().pageId === id ? pages[Math.max(0, Math.min(idx - 1, pages.length - 1))].id : get().pageId;
    set({ pageId, selection: get().pageId === id ? [] : get().selection });
  },

  select: (ids, mode = 'replace') => {
    const cur = get().selection;
    if (mode === 'replace') set({ selection: ids });
    else if (mode === 'add') set({ selection: Array.from(new Set([...cur, ...ids])) });
    else {
      const s = new Set(cur);
      ids.forEach((i) => (s.has(i) ? s.delete(i) : s.add(i)));
      set({ selection: [...s] });
    }
  },
  selectAll: () => {
    const page = currentPage();
    set({ selection: page.order.filter((id) => !page.nodes[id]?.locked && !page.nodes[id]?.hidden) });
  },
  deleteSelection: () => {
    const sel = new Set(get().selection);
    if (!sel.size) return;
    get().change((_d, page) => {
      for (const id of sel) {
        if (page.links[id]) delete page.links[id];
        if (page.nodes[id] && !page.nodes[id].locked) delete page.nodes[id];
      }
      page.order = page.order.filter((id) => page.nodes[id]);
      for (const l of Object.values(page.links)) if (!page.nodes[l.from.node] || !page.nodes[l.to.node]) delete page.links[l.id];
    });
    set({ selection: [] });
  },
  copy: () => {
    const page = currentPage();
    const sel = new Set(get().selection);
    const nodes = page.order.filter((id) => sel.has(id)).map((id) => deepClone(page.nodes[id]));
    const ids = new Set(nodes.map((n) => n.id));
    const links = Object.values(page.links).filter((l) => ids.has(l.from.node) && ids.has(l.to.node)).map(deepClone);
    if (nodes.length) set({ clipboard: { nodes, links } });
  },
  paste: (at) => {
    const cb = get().clipboard;
    if (!cb) return;
    const map: Record<string, string> = {};
    const b = unionRects(cb.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w || 10, h: n.h || 10 })));
    const dx = at && b ? at.x - b.x - b.w / 2 : 24;
    const dy = at && b ? at.y - b.y - b.h / 2 : 24;
    const nodes = cb.nodes.map((n) => { const id = uid('n'); map[n.id] = id; return { ...deepClone(n), id, x: Math.round(n.x + dx), y: Math.round(n.y + dy) }; });
    const links = cb.links.map((l) => ({ ...deepClone(l), id: uid('l'), from: { ...l.from, node: map[l.from.node] }, to: { ...l.to, node: map[l.to.node] } }));
    get().change((_d, page) => {
      for (const n of nodes) {
        page.nodes[n.id] = n as DiagramNode;
        if (n.kind === 'zone') page.order.unshift(n.id); else page.order.push(n.id);
      }
      for (const l of links) page.links[l.id] = l;
    });
    set({ selection: nodes.map((n) => n.id), clipboard: { nodes: nodes.map(deepClone), links: links.map(deepClone) } });
  },
  duplicate: () => { const cb = get().clipboard; get().copy(); get().paste(); set({ clipboard: cb }); },
  zOrder: (dir) => {
    const sel = new Set(get().selection);
    get().change((_d, page) => {
      const o = page.order;
      if (dir === 'front') page.order = [...o.filter((i) => !sel.has(i)), ...o.filter((i) => sel.has(i))];
      else if (dir === 'back') page.order = [...o.filter((i) => sel.has(i)), ...o.filter((i) => !sel.has(i))];
      else if (dir === 'forward') {
        for (let i = o.length - 2; i >= 0; i--) if (sel.has(o[i]) && !sel.has(o[i + 1])) [o[i], o[i + 1]] = [o[i + 1], o[i]];
      } else {
        for (let i = 1; i < o.length; i++) if (sel.has(o[i]) && !sel.has(o[i - 1])) [o[i], o[i - 1]] = [o[i - 1], o[i]];
      }
    });
  },
  align: (how) => {
    const { selection, defs, doc } = get();
    const page = currentPage();
    const nodes = selection.map((id) => page.nodes[id]).filter(Boolean);
    if (nodes.length < 2) return;
    const rects = nodes.map((n) => ({ id: n.id, ...nodeRect(n, page, defs, doc.vlans) }));
    const b = unionRects(rects)!;
    get().change((_d, pg) => {
      const sorted = [...rects];
      if (how === 'hdist' || how === 'vdist') {
        const H = how === 'hdist';
        sorted.sort((a, c) => (H ? a.x - c.x : a.y - c.y));
        const total = sorted.reduce((s, r) => s + (H ? r.w : r.h), 0);
        const gap = ((H ? b.w : b.h) - total) / (sorted.length - 1);
        let cur = H ? b.x : b.y;
        for (const r of sorted) {
          const n = pg.nodes[r.id];
          if (H) n.x = Math.round(cur); else n.y = Math.round(cur);
          cur += (H ? r.w : r.h) + gap;
        }
        return;
      }
      for (const r of rects) {
        const n = pg.nodes[r.id];
        if (how === 'left') n.x = b.x;
        if (how === 'right') n.x = b.x + b.w - r.w;
        if (how === 'hcenter') n.x = Math.round(b.x + b.w / 2 - r.w / 2);
        if (how === 'top') n.y = b.y;
        if (how === 'bottom') n.y = b.y + b.h - r.h;
        if (how === 'vcenter') n.y = Math.round(b.y + b.h / 2 - r.h / 2);
      }
    });
  },

  group: () => {
    const sel = get().selection.filter((id) => currentPage().nodes[id]);
    if (sel.length < 2) return get().toast('Select two or more objects to group', 'info');
    const gid = uid('g');
    get().change((_d, pg) => { for (const id of sel) pg.nodes[id].groupId = gid; });
    get().toast('Grouped — Ctrl/⌘+click selects a single member', 'info');
  },
  autoLayout: () => {
    const pg = currentPage();
    const sel = get().selection.filter((id) => pg.nodes[id]);
    const ids = sel.length >= 2 ? sel : pg.order.filter((id) => pg.nodes[id]?.kind === 'device');
    const { positions } = treeLayout(pg, ids);
    if (!Object.keys(positions).length) return get().toast('Select connected devices to arrange', 'info');
    get().change((_d, p) => { for (const [id, pos] of Object.entries(positions)) { const n = p.nodes[id]; if (n) { n.x = pos.x; n.y = pos.y; } } });
    set({ selection: Object.keys(positions) });
    get().toast(`Arranged ${Object.keys(positions).length} devices as a tree (undo with Ctrl+Z)`, 'success');
  },
  ungroup: () => {
    const sel = get().selection;
    get().change((_d, pg) => { for (const id of sel) if (pg.nodes[id]) delete pg.nodes[id].groupId; });
  },
  setViewport: (vp) => set({ viewports: { ...get().viewports, [get().pageId]: vp } }),
  set: (p) => set(p),
  toast: (text, kind = 'info') => {
    const t = { id: uid('t'), text, kind };
    set({ toasts: [...get().toasts, t] });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }), 3200);
  },

  setUserDefs: (userDefs) => { const libDefs = buildDefMap(userDefs, get().doc); set({ userDefs, libDefs, defs: styledDefMap(libDefs, get().doc.iconStyle ?? 'iso') }); },
  saveUserDef: (def) => {
    const list = get().userDefs.filter((d) => d.id !== def.id);
    const saved = { ...def, builtin: false, updatedAt: Date.now(), version: (def.version ?? 0) + 1 };
    get().setUserDefs([...list, saved]);
  },
  deleteUserDef: (id) => {
    const { userDefs, doc } = get();
    const def = userDefs.find((d) => d.id === id);
    // instances in the open document keep rendering: the definition moves to the document's embedded copies
    if (def && defUsage(doc, id) && !(doc.embeddedDefs ?? []).some((d) => d.id === id)) {
      set({ doc: { ...doc, embeddedDefs: [...(doc.embeddedDefs ?? []), { ...def, builtin: false }] }, dirty: true });
    }
    get().setUserDefs(userDefs.filter((d) => d.id !== id));
  },
  openEditor: (def, isNew = false) => set({ editor: { def: deepClone(def), isNew }, modal: null }),
}));

export function currentPage(): Page {
  const { doc, pageId } = useStore.getState();
  return doc.pages.find((p) => p.id === pageId) ?? doc.pages[0];
}

export const usePage = () => useStore((s) => s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]);

function fixPageAndSelection() {
  const s = useStore.getState();
  const page = s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0];
  useStore.setState({
    pageId: page.id,
    selection: s.selection.filter((id) => page.nodes[id] || page.links[id]),
    defs: styledDefMap(s.libDefs, s.doc.iconStyle ?? 'iso'),
  });
}

/** keep a device's centre and relative scale when its drawing changes to another variant */
function refitDevice(n: DeviceNode, from?: DeviceDef, to?: DeviceDef) {
  if (!from || !to || from === to) return;
  const k = Math.sqrt((n.w * n.h) / (from.w * from.h)) || 1.25;
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  n.w = Math.round(to.w * k * 100) / 100;
  n.h = Math.round(to.h * k * 100) / 100;
  n.x = Math.round((cx - n.w / 2) * 100) / 100;
  n.y = Math.round((cy - n.h / 2) * 100) / 100;
}

/** number of device instances of a definition across all pages of a document */
export function defUsage(doc: DiagramDoc, id: string): number {
  let n = 0;
  doc.pages.forEach((p) => Object.values(p.nodes).forEach((x) => { if (x.kind === 'device' && rawDefId(x.defId) === id) n++; }));
  return n;
}

/** custom definitions used in a document, embedded so the file is portable */
export function withEmbeddedDefs(doc: DiagramDoc, defs: DefMap): DiagramDoc {
  const used = new Set<string>();
  doc.pages.forEach((p) => Object.values(p.nodes).forEach((n) => n.kind === 'device' && used.add(rawDefId(n.defId))));
  for (const id of [...used]) { const c = counterpartOf(defs, id); if (c) used.add(c.id); }
  const builtinIds = new Set(BUILTIN_DEFS.map((d) => d.id));
  const embedded = [...used].map((id) => defs[id]).filter((d) => d && (!builtinIds.has(d.id) || !d.builtin));
  return { ...doc, embeddedDefs: embedded };
}
