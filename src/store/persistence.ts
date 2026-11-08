import { get, set, del } from 'idb-keyval';
import { useStore, withEmbeddedDefs, buildDefMap, systemTheme } from './store';
import type { DeviceDef, DiagramDoc } from '../model/types';
import { createSampleDoc, SAMPLE_VERSION } from '../library/sample';
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
    const idx = (index as DocMeta[] | undefined) ?? [];
    const lastId = settings?.lastDocId as string | undefined;
    let doc: DiagramDoc | undefined;
    if (lastId) doc = await get(K.doc(lastId));
    if (!doc && idx.length) doc = await get(K.doc(idx[0].id));
    const isOldSample = doc && doc.name.startsWith('Smart4.0') && (doc.sampleVersion ?? 1) < SAMPLE_VERSION && !idx.some((m) => m.id !== doc!.id && m.name.startsWith('Smart4.0'));
    if (!doc || isOldSample) {
      // first run, or the bundled sample was made with an older icon library: load the current one
      doc = createSampleDoc();
      await saveDocNow(doc);
    }
    useStore.getState().loadDoc(doc);
  } catch (e) {
    console.warn('Storage unavailable, running in memory only', e);
    useStore.getState().loadDoc(createSampleDoc());
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

export async function openDoc(id: string) {
  const s = useStore.getState();
  if (s.dirty) await saveDocNow(s.doc);
  const doc = (await get(K.doc(id))) as DiagramDoc | undefined;
  if (doc) { importEmbeddedDefs(doc); s.loadDoc(doc); fileHandle = null; }
}

export async function deleteDoc(id: string) {
  await del(K.doc(id));
  const idx = await listDocs();
  await set(K.index, idx.filter((m) => m.id !== id));
  if (useStore.getState().doc.id === id) {
    const rest = idx.filter((m) => m.id !== id);
    if (rest.length) await openDoc(rest[0].id); else newDocument();
  }
}

export async function duplicateDoc(id: string) {
  const doc = (await get(K.doc(id))) as DiagramDoc | undefined;
  if (!doc) return;
  const copy = { ...doc, id: uid('doc'), name: doc.name + ' (copy)', updatedAt: Date.now() };
  await saveDocNow(copy);
}

export async function newDocument() {
  const s = useStore.getState();
  if (s.dirty) await saveDocNow(s.doc);
  s.newDocument();
  fileHandle = null;
  await saveDocNow(useStore.getState().doc);
}

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

const FILE_EXT = '.netcanvas.json';
const fileTypes = [{ description: 'NetCanvas diagram', accept: { 'application/json': ['.json'] } }];

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
  try {
    const doc = JSON.parse(text) as DiagramDoc;
    if (doc.format !== 'netcanvas') throw new Error('Not a NetCanvas file');
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

export function exportLibrary(defs: DeviceDef[], name = 'netcanvas-library') {
  downloadText(`${safeName(name)}.netlib.json`, JSON.stringify({ format: 'netcanvas-library', version: 1, defs }, null, 1));
}

export async function importLibrary() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  try {
    const data = JSON.parse(await readFileText(f));
    const defs: DeviceDef[] = data.format === 'netcanvas-library' ? data.defs : data.id && data.shapes ? [data] : [];
    if (!defs.length) throw new Error('No devices found in file');
    const s = useStore.getState();
    const ids = new Set(defs.map((d) => d.id));
    s.setUserDefs([...s.userDefs.filter((d) => !ids.has(d.id)), ...defs.map((d) => ({ ...d, builtin: false }))]);
    s.toast(`Imported ${defs.length} device${defs.length > 1 ? 's' : ''}`, 'success');
  } catch (e: any) {
    useStore.getState().toast('Import failed: ' + (e?.message ?? e), 'error');
  }
}
