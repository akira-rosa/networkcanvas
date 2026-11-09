import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, MoreHorizontal, Plus, Search, SunMoon, Sun, Moon, Upload } from 'lucide-react';
import { useStore, buildDefMap, styledDefMap } from '../store/store';
import {
  deleteDoc, downloadDoc, duplicateDoc, listDocs, loadSample, newDocument, openDoc, openDroppedFile, openFromFile,
  readDoc, renameDoc, importLibrary, type DocMeta,
} from '../store/persistence';
import { DiagramLayer } from '../render/DiagramLayer';
import { DeviceGraphic } from '../render/ShapeView';
import { canvasThemes } from '../render/theme';
import { nodeVisualRect } from '../model/geometry';
import { unionRects } from '../model/util';
import { createSampleDoc } from '../library/sample';
import type { DiagramDoc, IconStyle } from '../model/types';
import { ContextMenu, type MenuItem } from '../ui/ContextMenu';
import { IconButton, Modal } from '../ui/controls';
import { modKey } from '../model/util';

/** Start screen: the diagrams stored in this browser, plus ways to start a new one. */
export function Home() {
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [dropping, setDropping] = useState(false);
  const themePref = useStore((s) => s.themePref);
  const cycleTheme = useStore((s) => s.cycleTheme);
  const refresh = () => listDocs().then(setDocs).catch(() => setDocs([]));
  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (creating || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (modKey(e) && k === 'o') { e.preventDefault(); openFromFile(); }
      else if (modKey(e) && e.altKey && k === 'n') { e.preventDefault(); setCreating(true); }
      else if (k === 'n' && !modKey(e) && !e.altKey) { e.preventDefault(); setCreating(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (docs ?? []).filter((d) => !needle || d.name.toLowerCase().includes(needle));
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list;
  }, [docs, q, sort]);

  const cardMenu = (e: React.MouseEvent, d: DocMeta) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX, y: e.clientY, items: [
        { label: 'Open', action: () => openDoc(d.id) },
        { label: 'Rename', action: () => setRenaming(d.id) },
        { label: 'Duplicate', action: async () => { await duplicateDoc(d.id); refresh(); } },
        { label: 'Download as file', action: () => downloadDoc(d.id) },
        { sep: true },
        { label: 'Delete…', danger: true, action: async () => {
          if (!confirm(`Delete “${d.name}” from this browser? This cannot be undone.`)) return;
          await deleteDoc(d.id); refresh();
        } },
      ],
    });
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const f = [...e.dataTransfer.files].find((x) => x.name.endsWith('.json'));
    if (f) await openDroppedFile(f);
  };

  return (
    <div className={'home' + (dropping ? ' dropping' : '')}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
      onDrop={onDrop}>
      <header className="home-bar">
        <div className="home-brand">
          <BrandMark />
          <span className="home-brand-name">Network Canvas</span>
          <span className="home-version">v{__APP_VERSION__}</span>
        </div>
        <div className="home-bar-actions">
          <button className="btn ghost" onClick={() => openFromFile()} title="Ctrl+O"><FolderOpen size={14} /> Open file…</button>
          <button className="btn ghost" onClick={() => importLibrary()}><Upload size={14} /> Import device library…</button>
          <IconButton title={`Theme: ${themePref === 'system' ? 'follow browser' : themePref}`} onClick={cycleTheme}>
            {themePref === 'system' ? <SunMoon size={16} /> : themePref === 'light' ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
        </div>
      </header>

      <main className="home-main">
        <section className="home-start" aria-label="Start a diagram">
          <button className="start-tile start-new" onClick={() => setCreating(true)}>
            <span className="start-plus"><Plus size={22} /></span>
            <span className="start-text">
              <span className="start-title">New topology</span>
              <span className="start-sub">Blank canvas with a default VLAN. Press N.</span>
            </span>
          </button>
          <button className="start-tile start-example" onClick={() => loadSample()}>
            <ExampleThumb />
            <span className="start-text">
              <span className="start-title">Open the example</span>
              <span className="start-sub">Smart4.0 industrial network: 8 VLANs, 45 devices. Opens as a copy you can edit.</span>
            </span>
          </button>
        </section>

        <section className="home-docs" aria-label="Your diagrams">
          <div className="home-docs-head">
            <h2>Your diagrams{docs && docs.length ? <span className="home-count">{docs.length}</span> : null}</h2>
            {!!docs?.length && (
              <div className="home-docs-tools">
                <label className="home-search">
                  <Search size={14} />
                  <input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
                </label>
                <div className="seg home-sort">
                  <button className={sort === 'recent' ? 'active' : ''} onClick={() => setSort('recent')}>Last edited</button>
                  <button className={sort === 'name' ? 'active' : ''} onClick={() => setSort('name')}>Name</button>
                </div>
              </div>
            )}
          </div>

          {docs === null ? null : !docs.length ? (
            <div className="home-empty">
              <p>Nothing saved in this browser yet. Create a topology, open the example, or drop a <code>.networkcanvas.json</code> file here.</p>
              <p className="dim">Diagrams save automatically in this browser. Use <b>Save to file</b> (Ctrl+S) in the editor to keep backups or share them.</p>
            </div>
          ) : !shown.length ? (
            <div className="home-empty"><p>No diagram matches “{q}”.</p></div>
          ) : (
            <ul className="doc-grid">
              {shown.map((d) => (
                <li key={d.id} className="doc-card" onContextMenu={(e) => cardMenu(e, d)}>
                  <button className="doc-card-open" onClick={() => renaming !== d.id && openDoc(d.id)} aria-label={`Open ${d.name}`}>
                    <DocThumb id={d.id} updatedAt={d.updatedAt} />
                  </button>
                  <div className="doc-card-info">
                    <div className="grow">
                      {renaming === d.id ? (
                        <RenameField value={d.name} onDone={async (v) => { setRenaming(null); if (v && v !== d.name) { await renameDoc(d.id, v); refresh(); } }} />
                      ) : (
                        <div className="doc-card-name ellipsis" title={d.name} onDoubleClick={() => setRenaming(d.id)}>{d.name}</div>
                      )}
                      <div className="doc-card-meta">Edited {ago(d.updatedAt)}</div>
                      <div className="doc-card-meta">{plural(d.pages, 'page')}, {plural(d.devices, 'device')}</div>
                    </div>
                    <button className="icon-btn sm" title="More" onClick={(e) => cardMenu(e, d)}><MoreHorizontal size={16} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {dropping && <div className="home-drop">Drop to open the diagram</div>}
      {creating && <NewTopologyDialog onClose={() => setCreating(false)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

function NewTopologyDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [style, setStyle] = useState<IconStyle>('iso');
  const libDefs = useStore((s) => s.libDefs);
  const create = () => newDocument({ name, iconStyle: style });
  const choice = (id: IconStyle, defId: string, label: string, hint: string) => {
    const def = libDefs[defId];
    return (
      <button type="button" className={'style-choice' + (style === id ? ' active' : '')} onClick={() => setStyle(id)} aria-pressed={style === id}>
        <svg viewBox="-10 -10 116 76" width="116" height="76" aria-hidden>
          {def && <DeviceGraphic def={def} x={4} y={28 - (88 * def.h) / def.w / 2} w={88} h={(88 * def.h) / def.w} />}
        </svg>
        <span className="style-label">{label}</span>
        <span className="style-hint">{hint}</span>
      </button>
    );
  };
  return (
    <Modal title="New topology" onClose={onClose} width={440}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={create}>Create topology</button>
      </>}>
      <form className="new-topo" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <label className="new-topo-label" htmlFor="new-topo-name">Name</label>
        <input id="new-topo-name" className="input" autoFocus placeholder="Untitled topology" value={name}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }} />
        <div className="new-topo-label">Icon style</div>
        <div className="style-choices">
          {choice('iso', 'switch', 'Isometric', 'Blue and white schematic')}
          {choice('detailed', 'd-switch', 'Detailed', 'Front-view product drawings')}
        </div>
        <p className="dim small">You can switch the whole diagram, or single devices, to the other style at any time.</p>
      </form>
    </Modal>
  );
}

function RenameField({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(value);
  const done = useRef(false);
  const finish = (x: string | null) => { if (done.current) return; done.current = true; onDone(x); };
  return (
    <input className="input doc-card-rename" autoFocus value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()}
      onBlur={() => finish(v.trim())}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') finish(v.trim()); if (e.key === 'Escape') finish(null); }} />
  );
}

/* ---------- thumbnails: the first page drawn with the real renderer ---------- */

function DocThumb({ id, updatedAt }: { id: string; updatedAt: number }) {
  const [doc, setDoc] = useState<DiagramDoc | null | undefined>(undefined);
  useEffect(() => { let live = true; readDoc(id).then((d) => live && setDoc(d ?? null)).catch(() => live && setDoc(null)); return () => { live = false; }; }, [id, updatedAt]);
  return <Thumb doc={doc} />;
}

function ExampleThumb() {
  const doc = useMemo(() => createSampleDoc(), []);
  return <Thumb doc={doc} />;
}

function Thumb({ doc }: { doc: DiagramDoc | null | undefined }) {
  const userDefs = useStore((s) => s.userDefs);
  const themeName = useStore((s) => s.theme);
  const view = useMemo(() => {
    if (!doc) return null;
    const page = doc.pages[0];
    const defs = styledDefMap(buildDefMap(userDefs, doc), doc.iconStyle ?? 'iso');
    const rects = page.order.map((nid) => page.nodes[nid]).filter((n) => n && !n.hidden).map((n) => nodeVisualRect(n, page, defs, doc.vlans));
    const b = unionRects(rects);
    if (!b) return { page, defs, vb: null };
    // small diagrams keep a sensible scale instead of filling the card with one huge icon
    const pad = Math.max(b.w, b.h) * 0.04 + 10;
    const w = Math.max(b.w + pad * 2, 640), h = Math.max(b.h + pad * 2, 400);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return { page, defs, vb: `${cx - w / 2} ${cy - h / 2} ${w} ${h}` };
  }, [doc, userDefs]);
  const theme = canvasThemes[themeName];
  if (!view || !doc) return <div className="thumb" />;
  if (!view.vb) return <div className="thumb"><span className="thumb-empty">Empty canvas</span></div>;
  return (
    <div className="thumb">
      <svg viewBox={view.vb} preserveAspectRatio="xMidYMid meet" aria-hidden>
        <DiagramLayer page={view.page} defs={view.defs} vlans={doc.vlans} theme={theme} linkColorByMedia={doc.linkColorByMedia}
          lineJumps={false} hidePortLabels={doc.hidePortLabels} doc={doc} layers={doc.layers} />
      </svg>
    </div>
  );
}

function BrandMark() {
  return (
    <svg className="home-mark" viewBox="0 0 32 32" width="26" height="26" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#1a8fd8" />
      <path d="M9 22h14M16 9v13" stroke="#fff" strokeWidth="2.2" />
      <circle cx="9" cy="22" r="2.6" fill="#fff" /><circle cx="23" cy="22" r="2.6" fill="#fff" /><circle cx="16" cy="9" r="2.6" fill="#fff" />
    </svg>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function ago(t: number) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d > 300 ? 'numeric' : undefined });
}
