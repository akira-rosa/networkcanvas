import { get, set, del, update } from 'idb-keyval';
import { useStore, withEmbeddedDefs, buildDefMap, systemTheme } from './store';
import type { DeviceDef, DiagramDoc, IconStyle } from '../model/types';
import { newDoc } from '../model/factory';
import { DocError, normalizeDef, normalizeDoc, tryNormalizeDoc } from '../model/validate';
import { createSampleDoc } from '../library/sample';
import { askChoice } from '../ui/choice';
import { downloadText, pickFile, readFileText, stableStringify, uid } from '../model/util';

// Everything is stored locally in the browser (IndexedDB) — no server.
const K = {
  settings: 'nc:settings',
  index: 'nc:docIndex',
  doc: (id: string) => `nc:doc:${id}`,
  userDefs: 'nc:userDefs',
};

export interface DocMeta {
  id: string; name: string; updatedAt: number; pages: number; devices: number;
  /** last time this diagram was written to, or opened from, a file */
  fileSavedAt?: number;
  fileName?: string;
}

/**
 * Each stored diagram carries a revision number next to its content. A tab remembers the revision it
 * last read or wrote; a save only goes through when the stored revision is still that one, so two tabs
 * (or a tab and an older backup) can never silently overwrite each other's work.
 */
const REV = '_rev';
const knownRev = new Map<string, number>();
class ConflictError extends Error {}

let retryTimer: number | undefined;
let retryDelay = 0;
let persistAsked = false;

let saveTimer: number | undefined;
let fileHandle: any = null;

const settingsKeys = ['themePref', 'showGrid', 'snapToGrid', 'gridSize', 'showPorts', 'smartGuides', 'leftTab', 'libStyle'] as const;

export async function initPersistence() {
  try {
    const [settings, userDefs, index] = await Promise.all([get(K.settings), get(K.userDefs), get(K.index)]);
    if (settings) useStore.setState(pick(settings, settingsKeys as unknown as string[]));
    const pref = useStore.getState().themePref;
    useStore.setState({ theme: pref === 'system' ? systemTheme() : pref });
    if (Array.isArray(userDefs)) useStore.getState().setUserDefs(userDefs.map((d) => normalizeDef(d)).filter((d): d is DeviceDef => !!d));
    void index; // the start screen lists the saved diagrams; nothing is opened automatically
    await set('nc:probe', Date.now());
  } catch (e) {
    console.warn('Storage unavailable, running in memory only', e);
    useStore.setState({ storageOk: false });
  }
  watchOtherTabs();

  // autosave
  useStore.subscribe((s, prev) => {
    if (s.doc !== prev.doc && s.dirty) {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveDocNow(useStore.getState().doc), 500);
    }
    if (s.userDefs !== prev.userDefs) set(K.userDefs, s.userDefs).catch((e) => useStore.setState({ saveError: 'Your device library could not be saved: ' + describeStorageError(e) }));
    if (settingsKeys.some((k) => s[k] !== prev[k]) || s.doc.id !== prev.doc.id) {
      set(K.settings, { ...pick(s as any, settingsKeys as unknown as string[]), lastDocId: s.doc.id }).catch(() => {});
    }
  });
  // save at once when the tab is hidden or closed, and ask before leaving with unsaved work
  const flush = () => { const s = useStore.getState(); if (s.dirty && !s.home) saveDocNow(s.doc); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', (e) => {
    const s = useStore.getState();
    if (s.dirty && !s.home) saveDocNow(s.doc);
    if ((s.dirty && !s.home) || s.saveError || s.saveConflict) { e.preventDefault(); e.returnValue = ''; }
  });
}

export function describeStorageError(e: unknown): string {
  const name = (e as any)?.name;
  if (name === 'QuotaExceededError') return 'the browser storage is full';
  if (name === 'InvalidStateError' || name === 'SecurityError' || name === 'UnknownError') return 'the browser is not allowing this page to store data';
  return String((e as any)?.message ?? e);
}

/* ---------- the same diagram in two tabs ---------- */

let releaseLock: (() => void) | null = null;
let lockedId: string | null = null;

/** Holds a lock on the open diagram; when another tab already holds it, both get a visible warning. */
function watchOtherTabs() {
  const locks = (navigator as any).locks;
  const claim = (id: string | null) => {
    if (id === lockedId) return;
    releaseLock?.(); releaseLock = null; lockedId = id;
    useStore.setState({ openElsewhere: false });
    if (!id || !locks) return;
    locks.request(`networkcanvas:doc:${id}`, { ifAvailable: true }, (lock: unknown) => {
      if (lockedId !== id) return undefined;
      if (!lock) { useStore.setState({ openElsewhere: true }); return undefined; }
      return new Promise<void>((resolve) => { releaseLock = resolve; });
    }).catch(() => {});
  };
  useStore.subscribe((s, prev) => {
    if (s.home !== prev.home || s.doc.id !== prev.doc.id) claim(s.home ? null : s.doc.id);
  });
}

function pick(o: Record<string, any>, keys: string[]) {
  const r: Record<string, any> = {};
  keys.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; });
  return r;
}

/** Writes a diagram to browser storage. Returns false when it could not (the reason is shown to the user). */
export async function saveDocNow(doc: DiagramDoc): Promise<boolean> {
  clearTimeout(saveTimer);
  if (useStore.getState().saveConflict === doc.id) return false; // waiting for the user to choose
  try {
    const full = withEmbeddedDefs(doc, useStore.getState().libDefs);
    const base = knownRev.get(doc.id);
    let rev = 0;
    await update(K.doc(doc.id), (cur: any) => {
      const curRev = typeof cur?.[REV] === 'number' ? cur[REV] : 0;
      // the stored copy changed since this tab read it (another tab, or a file opened over it)
      if (cur && (base === undefined || curRev !== base)) throw new ConflictError();
      rev = curRev + 1;
      return { ...full, [REV]: rev };
    });
    knownRev.set(doc.id, rev);
    const meta: DocMeta = {
      id: doc.id, name: doc.name, updatedAt: doc.updatedAt, pages: doc.pages.length,
      devices: doc.pages.reduce((s, p) => s + Object.values(p.nodes).filter((n) => n.kind === 'device').length, 0),
    };
    await update(K.index, (idx: DocMeta[] | undefined) => {
      const list = Array.isArray(idx) ? idx : [];
      const prev = list.find((m) => m.id === doc.id);
      return [{ ...meta, fileSavedAt: prev?.fileSavedAt, fileName: prev?.fileName }, ...list.filter((m) => m.id !== doc.id)];
    });
    const st = useStore.getState();
    useStore.setState({ saveError: null, ...(st.doc === doc ? { dirty: false, lastSaved: Date.now() } : {}) });
    retryDelay = 0;
    askPersistentStorage();
    return true;
  } catch (e) {
    if (e instanceof ConflictError) { useStore.setState({ saveConflict: doc.id }); return false; }
    console.warn('save failed', e);
    useStore.setState({ saveError: `Not saved in this browser: ${describeStorageError(e)}.` });
    retryDelay = Math.min(retryDelay ? retryDelay * 2 : 5000, 60000);
    clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => { const s = useStore.getState(); if (s.dirty && !s.home) saveDocNow(s.doc); }, retryDelay);
    return false;
  }
}

/** Ask the browser not to evict our storage (granted silently for installed or frequently used pages). */
function askPersistentStorage() {
  if (persistAsked) return;
  persistAsked = true;
  (navigator.storage?.persist?.() ?? Promise.resolve(false)).catch(() => false);
}

/** Resolve a conflict: take the stored version (dropping this tab's unsaved changes) or keep this tab's work as a copy. */
export async function resolveConflict(choice: 'theirs' | 'mine') {
  const s = useStore.getState();
  const id = s.saveConflict;
  if (!id) return;
  useStore.setState({ saveConflict: null });
  if (choice === 'theirs') { await openDoc(id, true); return; }
  const copy = { ...s.doc, id: uid('doc'), name: `${s.doc.name} (my copy)`, updatedAt: Date.now() };
  s.loadDoc(copy);
  await saveDocNow(copy);
  s.toast(`Saved your version as “${copy.name}”`, 'success');
}

/** Record that the diagram now exists as a file (saved or opened). */
async function markFileSaved(id: string, fileName?: string) {
  const at = Date.now();
  try {
    await update(K.index, (idx: DocMeta[] | undefined) => (Array.isArray(idx) ? idx : []).map((m) => (m.id === id ? { ...m, fileSavedAt: at, fileName: fileName ?? m.fileName } : m)));
  } catch { /* the banner for storage errors covers this */ }
  if (useStore.getState().doc.id === id) useStore.setState({ fileSavedAt: at });
}

export async function listDocs(): Promise<DocMeta[]> {
  return (((await get(K.index)) as DocMeta[]) ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** a stored diagram without opening it (start-screen thumbnails, downloads) */
export async function readDoc(id: string): Promise<DiagramDoc | undefined> {
  return (await readDocWithRev(id))?.doc;
}

async function readDocWithRev(id: string): Promise<{ doc: DiagramDoc; rev: number } | undefined> {
  const raw: any = await get(K.doc(id));
  // stored copies are checked too: a damaged entry must never take the start screen down with it
  const doc = tryNormalizeDoc(raw);
  if (!doc) return undefined;
  delete (doc as any)[REV];
  return { doc, rev: typeof raw?.[REV] === 'number' ? raw[REV] : 0 };
}

/** the stored entry exactly as it is (for downloading a damaged diagram) */
export async function readRawDoc(id: string): Promise<unknown> {
  return get(K.doc(id));
}

export async function openDoc(id: string, discardCurrent = false) {
  const s = useStore.getState();
  if (!discardCurrent && s.dirty && !s.home && !(await saveDocNow(s.doc))) {
    s.toast('The open diagram could not be saved, so it stays open. Save it to a file first.', 'error');
    return;
  }
  const hit = await readDocWithRev(id);
  if (!hit) { s.toast('This diagram is damaged and cannot be opened. Use ⋯ › Download as file to keep a copy.', 'error'); return; }
  knownRev.set(id, hit.rev);
  importEmbeddedDefs(hit.doc);
  s.loadDoc(hit.doc);
  fileHandle = null;
  const meta = (await listDocs()).find((m) => m.id === id);
  useStore.setState({ fileSavedAt: meta?.fileSavedAt ?? null });
}

/** back to the start screen (the current diagram is saved first) */
export async function goHome() {
  const s = useStore.getState();
  if (s.dirty && !(await saveDocNow(s.doc))) {
    s.toast(s.saveConflict ? 'Choose what to do with your changes first (banner at the top).' : 'This diagram could not be saved in the browser. Save it to a file before leaving it.', 'error');
    return;
  }
  useStore.setState({ home: true, modal: null, editor: null, selection: [] });
}

export async function deleteDoc(id: string) {
  await del(K.doc(id));
  knownRev.delete(id);
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
  if (s.doc.id === id && !s.home) { s.change((d) => { d.name = name; }); await saveDocNow(useStore.getState().doc); return; }
  const hit = await readDocWithRev(id);
  if (!hit) return;
  knownRev.set(id, hit.rev);
  await saveDocNow({ ...hit.doc, name, updatedAt: Date.now() });
  if (s.doc.id === id) useStore.setState({ doc: { ...useStore.getState().doc, name } });
}

export async function downloadDoc(id: string) {
  // the stored entry as it is, so a damaged diagram can still be rescued by hand
  const raw: any = (await readDoc(id)) ?? (await readRawDoc(id));
  if (raw && typeof raw === 'object') delete raw[REV];
  const name = raw && typeof raw === 'object' && typeof (raw as any).name === 'string' ? (raw as any).name : 'damaged diagram';
  if (!raw) return;
  downloadText(safeName(name) + FILE_EXT, stableStringify(raw));
  await markFileSaved(id, safeName(name) + FILE_EXT);
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
      saveDocNow(s.doc).then(() => markFileSaved(s.doc.id, fileHandle?.name));
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.warn(e);
    }
  }
  downloadText(safeName(doc.name) + FILE_EXT, text);
  saveDocNow(s.doc).then(() => markFileSaved(s.doc.id, safeName(doc.name) + FILE_EXT));
}

export async function openFromFile() {
  const w = window as any;
  let text: string | null = null;
  let name = '';
  let handle: any = null;
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ types: fileTypes });
      text = await (await h.getFile()).text();
      handle = h; name = h.name;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
  }
  if (text === null) {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    text = await readFileText(f);
    name = f.name;
  }
  if (await openDocText(text, name)) fileHandle = handle;
}

/** open a dropped .networkcanvas.json file */
export async function openDroppedFile(f: File) {
  if (await openDocText(await readFileText(f), f.name)) fileHandle = null;
}

const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Opens a diagram file. Returns true when a diagram was opened. */
async function openDocText(text: string, fileName = ''): Promise<boolean> {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch {
    useStore.getState().toast('Could not open the file: it is not valid JSON (it may be truncated or not a Network Canvas diagram).', 'error');
    return false;
  }
  try {
    // files written before the rename (format 'netcanvas') still open; damaged files are repaired or refused
    const { value: opened, warnings } = normalizeDoc(parsed);
    let doc = opened;
    delete (doc as any)[REV];
    const s = useStore.getState();
    if (s.dirty && !s.home && !(await saveDocNow(s.doc))) {
      s.toast('The open diagram could not be saved, so it stays open. Save it to a file first.', 'error');
      return false;
    }
    // the same diagram (same id) may already be in this browser, possibly with newer work
    const stored = await readDocWithRev(doc.id).catch(() => undefined);
    if (stored) {
      const same = stableStringify({ ...stored.doc, embeddedDefs: undefined }) === stableStringify({ ...doc, embeddedDefs: undefined });
      if (same) knownRev.set(doc.id, stored.rev);
      else {
        const browserNewer = stored.doc.updatedAt > doc.updatedAt;
        const pick = await askChoice('This diagram is already in this browser',
          `“${stored.doc.name}” is already saved in this browser (last edited ${when(stored.doc.updatedAt)}).\n` +
          `The file you opened was last edited ${when(doc.updatedAt)}${browserNewer ? ', so the browser copy is newer' : ''}.`,
          [
            { value: 'copy', label: 'Open the file as a separate copy', primary: browserNewer },
            { value: 'replace', label: 'Replace the browser copy with the file', primary: !browserNewer },
          ]);
        if (!pick) return false;
        if (pick === 'copy') doc = { ...doc, id: uid('doc'), name: `${doc.name} (from file)` };
        else knownRev.set(doc.id, stored.rev);
      }
    }
    importEmbeddedDefs(doc);
    s.loadDoc(doc);
    await saveDocNow(doc);
    if (doc.id === opened.id) await markFileSaved(doc.id, fileName || undefined);
    if (warnings.length) {
      console.warn('Network Canvas repaired the file:\n' + warnings.join('\n'));
      s.toast(`Opened ${doc.name}, with ${warnings.length} problem${warnings.length > 1 ? 's' : ''} repaired: ${warnings[0]}${warnings.length > 1 ? ' …' : ''}`, 'info');
    } else s.toast(`Opened ${doc.name}`, 'success');
    return true;
  } catch (e: any) {
    useStore.getState().toast(e instanceof DocError ? `Could not open the file: ${e.message}` : `Could not open the file: ${e?.message ?? e}`, 'error');
    return false;
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
    const raw: unknown[] = (data.format === 'networkcanvas-library' || data.format === 'netcanvas-library') && Array.isArray(data.defs) ? data.defs : data.id && data.shapes ? [data] : [];
    const defs = raw.map((d) => normalizeDef(d)).filter((d): d is DeviceDef => !!d);
    if (!defs.length) throw new Error('No usable devices found in the file');
    const s = useStore.getState();
    const ids = new Set(defs.map((d) => d.id));
    s.setUserDefs([...s.userDefs.filter((d) => !ids.has(d.id)), ...defs.map((d) => ({ ...d, builtin: false }))]);
    s.toast(`Imported ${defs.length} device${defs.length > 1 ? 's' : ''}`, 'success');
  } catch (e: any) {
    useStore.getState().toast('Import failed: ' + (e?.message ?? e), 'error');
  }
}
