import { useEffect } from 'react';
import { useStore, currentPage } from './store/store';
import { TopBar } from './panels/TopBar';
import { LeftPanel } from './panels/LeftPanel';
import { Inspector } from './panels/Inspector';
import { Canvas, isTyping } from './canvas/Canvas';
import { Modals } from './panels/Modals';
import { DeviceEditor } from './editor/DeviceEditor';
import { Home } from './home/Home';
import { SaveBanner } from './ui/SaveBanner';
import { ChoiceHost } from './ui/choice';
import { canvasApi } from './canvas/api';
import { newDocument, openFromFile, saveToFile } from './store/persistence';
import { modKey } from './model/util';
import type { Tool } from './model/types';

const TOOL_KEYS: Record<string, Tool> = { v: 'select', h: 'hand', c: 'connect', z: 'zone', r: 'rect', t: 'text' };

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.editor || s.home || isTyping()) return;
      const mod = modKey(e);
      const k = e.key.toLowerCase();
      // a modal owns the keyboard: only Escape (close) and undo/redo reach the document
      if (s.modal) {
        if (k === 'escape') s.set({ modal: null });
        else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); }
        return;
      }
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); s.redo(); return; }
      if (mod && k === 's') { e.preventDefault(); saveToFile(e.shiftKey); return; }
      if (mod && k === 'o') { e.preventDefault(); openFromFile(); return; }
      if (mod && e.altKey && k === 'n') { e.preventDefault(); newDocument(); return; }
      if (mod && k === 'c') { s.copy(); return; }
      if (mod && k === 'x') { s.copy(); s.deleteSelection(); return; }
      if (mod && k === 'v') { e.preventDefault(); s.paste(); return; }
      if (mod && !e.shiftKey && k === 'd') { e.preventDefault(); s.duplicate(); return; }
      if (mod && !e.shiftKey && k === 'a') { e.preventDefault(); s.selectAll(); return; }
      if (mod && k === 'f') { e.preventDefault(); s.set({ modal: 'find' }); return; }
      if (mod && e.shiftKey && k === 'g') { e.preventDefault(); s.ungroup(); return; }
      if (mod && e.shiftKey && k === 'a') { e.preventDefault(); s.autoLayout(); return; }
      if (mod && e.shiftKey && k === 'd') { e.preventDefault(); s.set({ modal: 'table' }); return; }
      if (mod && k === 'g') { e.preventDefault(); s.group(); return; }
      if (mod && k === '\\') { e.preventDefault(); s.set({ hideUi: !s.hideUi }); return; }
      if (mod && k === 'e') { e.preventDefault(); s.set({ modal: 'export' }); return; }
      if (mod && e.shiftKey && k === 'l') { e.preventDefault(); { const t = s.theme === 'dark' ? 'light' : 'dark'; s.set({ theme: t, themePref: t }); } return; }
      if (mod && (k === '=' || k === '+')) { e.preventDefault(); canvasApi.zoomBy(1.25); return; }
      if (mod && k === '-') { e.preventDefault(); canvasApi.zoomBy(0.8); return; }
      if (mod && k === '0') { e.preventDefault(); canvasApi.zoomTo(1); return; }
      if (e.shiftKey && (e.code === 'Digit1')) { e.preventDefault(); canvasApi.fit(); return; }
      if (e.shiftKey && (e.code === 'Digit2')) { e.preventDefault(); if (s.selection.length) canvasApi.fitTo(s.selection); return; }
      if (mod) return;
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); s.deleteSelection(); return; }
      if (k === 'escape') { s.set({ selection: [], tool: 'select', modal: null }); return; }
      if (k === '?') { s.set({ modal: 'shortcuts' }); return; }
      if (k === ']') { s.zOrder(e.shiftKey ? 'forward' : 'front'); return; }
      if (k === '[') { s.zOrder(e.shiftKey ? 'backward' : 'back'); return; }
      if (k === 'p') { s.set({ showPorts: !s.showPorts }); return; }
      if (TOOL_KEYS[k] && !e.altKey) { s.set({ tool: TOOL_KEYS[k] }); return; }
      if (k.startsWith('arrow') && s.selection.length) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0;
        const dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
        const sel = new Set(s.selection);
        s.change((_doc, pg) => { for (const id of sel) { const n = pg.nodes[id]; if (n && !n.locked) { n.x += dx; n.y += dy; } } });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>)}
    </div>
  );
}

export function App() {
  const theme = useStore((s) => s.theme);
  const editor = useStore((s) => s.editor);
  const hideUi = useStore((s) => s.hideUi);
  const home = useStore((s) => s.home);
  useShortcuts();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  // follow the browser / OS colour scheme while the preference is 'system'
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const on = () => { if (useStore.getState().themePref === 'system') useStore.setState({ theme: mq.matches ? 'light' : 'dark' }); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  void currentPage;
  if (home) return <><div className="app"><SaveBanner /><Home /></div><ChoiceHost /><Toasts /></>;
  return (
    <div className="app">
      <TopBar />
      <SaveBanner />
      <div className="workspace">
        {!hideUi && <LeftPanel />}
        <main className="canvas-area"><Canvas /></main>
        {!hideUi && <Inspector />}
      </div>
      <Modals />
      {editor && <DeviceEditor />}
      <ChoiceHost />
      <Toasts />
    </div>
  );
}
