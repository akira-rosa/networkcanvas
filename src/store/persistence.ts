import { get, set, del } from 'idb-keyval';
import { useStore, withEmbeddedDefs, buildDefMap, systemTheme } from './store';
import type { DeviceDef, DiagramDoc, IconStyle } from '../model/types';
import { newDoc } from '../model/factory';
import { createSampleDoc } from '../library/sample';
import { downloadText, pickFile, readFileText, stableStringify, uid } from '../model/util';

// Everything is stored locally in the browser (IndexedDB) — no server.
const K = {
  settings: 'nc:settings',
  index: 'nc:docIndex',
  doc: (id: string) => `nc:doc:${id}`,
  userDefs: 'nc:userDefs',
};

export interface DocMeta { id: string; name: string; updatedAt: number; pages: number; devices: number }

let saveTimer: number | undefined;
let fileHandle: any = null;

const settingsKeys = ['themePref', 'showGrid', 'snapToGrid', 'gridSize', 'showPorts', 'smartGuides', 'leftTab', 'libStyle'] as const;

export async function initPersistence() {
  try {
    const [settings, userDefs, index] = await Promise.all([get(K.settings), get(K.userDefs), get(K.index)]);
    if (settings) useStore.setState(pick(settings, settingsKeys as unknown as string[]));
    const pref = useStore.getState().themePref;
    useStore.setState({ theme: pref === 'system' ? systemTheme() : pref });
    if (Array.isArray(userDefs)) useStore.getState().setUserDefs(userDefs as DeviceDef[]);
    void index; // the start screen lists the saved diagrams; nothing is opened automatically
  } catch (e) {
    console.warn('Storage unavailable, running in memory only', e);
  }

  // autosave
  useStore.subscribe((s, prev) => {
    if (s.doc !== prev.doc && s.dirty) {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveDocNow(useStore.getState().doc), 500);
    }
    if (s.userDefs !== prev.userDefs) set(K.userDefs, s.userDefs).catch(() => {});
    if (settingsKeys.some((k) => s[k] !== prev[k]) || s.doc.id !== prev.doc.id) {
      set(K.settings, { ...pick(s as any, settingsKeys as unknown as string[]), lastDocId: s.doc.id }).catch(() => {});
    }
  });
  window.addEventListener('beforeunload', () => { if (useStore.getState().dirty) saveDocNow(useStore.getState().doc); });
}

function pick(o: Record<string, any>, keys: string[]) {
  const r: Record<string, any> = {};
  keys.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; });
  return r;
}

export async function saveDocNow(doc: DiagramDoc) {
  try {
    const full = withEmbeddedDefs(doc, useStore.getState().libDefs);
    await set(K.doc(doc.id), full);
    const idx: DocMeta[] = ((await get(K.index)) as DocMeta[]) ?? [];
    const meta: DocMeta = {
      id: doc.id, name: doc.name, updatedAt: doc.updatedAt, pages: doc.pages.length,
      devices: doc.pages.reduce((s, p) => s + Object.values(p.nodes).filter((n) => n.kind === 'device').length, 0),
    };
    await set(K.index, [meta, ...idx.filter((m) => m.id !== doc.id)]);
    if (useStore.getState().doc === doc) useStore.setState({ dirty: false, lastSaved: Date.now() });
  } catch (e) {
    console.warn('save failed', e);
  }
}

export async function listDocs(): Promise<DocMeta[]> {
  return (((await get(K.index)) as DocMeta[]) ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** a stored diagram without opening it (start-screen thumbnails, downloads) */
export async function readDoc(id: string): Promise<DiagramDoc | undefined> {
  return (await get(K.doc(id))) as DiagramDoc | undefined;
}

export async function openDoc(id: string) {
  const s = useStore.getState();
  if (s.dirty) await saveDocNow(s.doc);
  const doc = await readDoc(id);
  if (doc) { importEmbeddedDefs(doc); s.loadDoc(doc); fileHandle = null; }
}

/** back to the start screen (the current diagram is saved first) */
export async function goHome() {
  const s = useStore.getState();
  if (s.dirty) { clearTimeout(saveTimer); await saveDocNow(s.doc); }
  useStore.setState({ home: true, modal: null, editor: null, selection: [] });
}

export async function deleteDoc(id: string) {
  await del(K.doc(id));
  const idx = await listDocs();
  await set(K.index, idx.filter((m) => m.id !== id));
  if (useStore.getState().doc.id === id) {
    // forget the deleted diagram in memory too, so autosave cannot bring it back
    const blank = newDoc();
    useStore.setState({ doc: blank, pageId: blank.pages[0].id, past: [], future: [], selection: [], dirty: false });
  }
}

export async function duplicateDoc(id: string) {
  const doc = await readDoc(id);
  if (!doc) return;
  const copy = { ...doc, id: uid('doc'), name: doc.name + ' (copy)', createdAt: Date.now(), updatedAt: Date.now() };
  await saveDocNow(copy);
}

export async function renameDoc(id: string, name: string) {
  const s = useStore.getState();
  if (s.doc.id === id) { s.change((d) => { d.name = name; }); await saveDocNow(useStore.getState().doc); return; }
  const doc = await readDoc(id);
  if (doc) await saveDocNow({ ...doc, name, updatedAt: Date.now() });
}

export async function downloadDoc(id: string) {
  const doc = await readDoc(id);
  if (doc) downloadText(safeName(doc.name) + FILE_EXT, stableStringify(doc));
}

export async function newDocument(opts: { name?: string; iconStyle?: IconStyle } = {}) {
  const s = useStore.getState();
  if (s.dirty) await saveDocNow(s.doc);
  const d = newDoc(opts.name?.trim() || 'Untitled topology');
  if (opts.iconStyle && opts.iconStyle !== 'iso') d.iconStyle = opts.iconStyle;
  s.loadDoc(d);
  fileHandle = null;
  await saveDocNow(useStore.getState().doc);
}

/** a fresh copy of the bundled Smart4.0 example */
export async function loadSample() {
  const s = useStore.getState();
  if (s.dirty) await saveDocNow(s.doc);
  const d = createSampleDoc();
  s.loadDoc(d);
  await saveDocNow(d);
}

/** custom devices that came inside a file are added to the user's library */
function importEmbeddedDefs(doc: DiagramDoc) {
  const s = useStore.getState();
  const known = buildDefMap(s.userDefs);
  const add = (doc.embeddedDefs ?? []).filter((d) => !known[d.id] || (!known[d.id].builtin && (known[d.id].updatedAt ?? 0) < (d.updatedAt ?? 0)));
  if (add.length) s.setUserDefs([...s.userDefs.filter((u) => !add.some((a) => a.id === u.id)), ...add.map((d) => ({ ...d, builtin: false }))]);
}

/* ---------- files on disk ---------- */

const FILE_EXT = '.networkcanvas.json';
const fileTypes = [{ description: 'Network Canvas diagram', accept: { 'application/json': ['.json'] } }];

export async function saveToFile(saveAs = false) {
  const s = useStore.getState();
  const doc = withEmbeddedDefs(s.doc, s.libDefs);
  const text = stableStringify(doc);
  const w = window as any;
  if (w.showSaveFilePicker) {
    try {
      if (!fileHandle || saveAs) fileHandle = await w.showSaveFilePicker({ suggestedName: safeName(doc.name) + FILE_EXT, types: fileTypes });
      const ws = await fileHandle.createWritable();
      await ws.write(text);
      await ws.close();
      s.toast(`Saved ${fileHandle.name}`, 'success');
      saveDocNow(s.doc);
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.warn(e);
    }
  }
  downloadText(safeName(doc.name) + FILE_EXT, text);
  saveDocNow(s.doc);
}

export async function openFromFile() {
  const w = window as any;
  let text: string | null = null;
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ types: fileTypes });
      text = await (await h.getFile()).text();
      fileHandle = h;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
  }
  if (text === null) {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    text = await readFileText(f);
    fileHandle = null;
  }
  await openDocText(text);
}

/** open a dropped .networkcanvas.json file */
export async function openDroppedFile(f: File) {
  fileHandle = null;
  await openDocText(await readFileText(f));
}

async function openDocText(text: string) {
  try {
    const doc = JSON.parse(text) as DiagramDoc;
    // files written before the rename (format 'netcanvas') still open
    if (doc.format !== 'networkcanvas' && (doc.format as string) !== 'netcanvas') throw new Error('Not a Network Canvas file');
    doc.format = 'networkcanvas';
    const s = useStore.getState();
    if (s.dirty) await saveDocNow(s.doc);
    importEmbeddedDefs(doc);
    s.loadDoc(doc);
    await saveDocNow(doc);
    s.toast(`Opened ${doc.name}`, 'success');
  } catch (e: any) {
    useStore.getState().toast('Could not open file: ' + (e?.message ?? e), 'error');
  }
}

export const safeName = (n: string) =>
  n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^\x20-\x7e]/g, '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'diagram';

/* ---------- library packs ---------- */

export function exportLibrary(defs: DeviceDef[], name = 'network-canvas-library') {
  downloadText(`${safeName(name)}.netlib.json`, JSON.stringify({ format: 'networkcanvas-library', version: 1, defs }, null, 1));
}

export async function importLibrary() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  try {
    const data = JSON.parse(await readFileText(f));
    const defs: DeviceDef[] = data.format === 'networkcanvas-library' || data.format === 'netcanvas-library' ? data.defs : data.id && data.shapes ? [data] : [];
    if (!defs.length) throw new Error('No devices found in file');
    const s = useStore.getState();
    const ids = new Set(defs.map((d) => d.id));
    s.setUserDefs([...s.userDefs.filter((d) => !ids.has(d.id)), ...defs.map((d) => ({ ...d, builtin: false }))]);
    s.toast(`Imported ${defs.length} device${defs.length > 1 ? 's' : ''}`, 'success');
  } catch (e: any) {
    useStore.getState().toast('Import failed: ' + (e?.message ?? e), 'error');
  }
}
