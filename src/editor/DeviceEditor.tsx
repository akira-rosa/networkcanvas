import React, { useEffect } from 'react';
import {
  ArrowLeft, MousePointer2, Hand, Square, Circle, Minus, PenTool, Type, Box, Cylinder, CircleDot, Undo2, Redo2, Maximize,
  Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, Trash2, Plus, ImagePlus, FileUp, Magnet, Copy, X, Sun, Moon, SunMoon, Grid3x3,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignHorizontalSpaceAround, AlignVerticalSpaceAround,
} from 'lucide-react';
import { useEditor, nextPortName, type ETool } from './editorStore';
import { EditorCanvas, editorApi } from './EditorCanvas';
import { useStore } from '../store/store';
import type { DeviceDef, PortDef, PortMedia, Shape, Side } from '../model/types';
import { IconButton, Section, Row, TextInput, NumInput, Select, Toggle, ColorInput, TextArea } from '../ui/controls';
import { DeviceGraphic } from '../render/ShapeView';
import { DeviceLabel } from '../render/DiagramLayer';
import { canvasThemes, MEDIA_COLORS } from '../render/theme';
import { modKey, pickFile, readFileDataUrl, readFileText, uid, unionRects, deepClone } from '../model/util';
import { importSvgAsShapes, imageSize } from './svgImport';
import { ALL_BUILTIN as BUILTIN_DEFS } from '../library';
import { portWorld } from '../model/geometry';

const TOOLS: { id: ETool; title: string; key: string; icon: React.ReactNode }[] = [
  { id: 'select', title: 'Select', key: 'V', icon: <MousePointer2 size={17} /> },
  { id: 'hand', title: 'Hand', key: 'H', icon: <Hand size={17} /> },
  { id: 'rect', title: 'Rectangle', key: 'R', icon: <Square size={17} /> },
  { id: 'ellipse', title: 'Ellipse', key: 'O', icon: <Circle size={17} /> },
  { id: 'line', title: 'Line', key: 'L', icon: <Minus size={17} /> },
  { id: 'pen', title: 'Pen / polygon', key: 'P', icon: <PenTool size={17} /> },
  { id: 'text', title: 'Text', key: 'T', icon: <Type size={17} /> },
  { id: 'isoBox', title: 'Isometric box', key: 'B', icon: <Box size={17} /> },
  { id: 'isoCylinder', title: 'Isometric cylinder', key: 'Y', icon: <Cylinder size={17} /> },
  { id: 'port', title: 'Port (connection point)', key: 'N', icon: <CircleDot size={17} /> },
];
const KEYMAP: Record<string, ETool> = Object.fromEntries(TOOLS.map((t) => [t.key.toLowerCase(), t.id]));

const MEDIA: { value: PortMedia; label: string }[] = [
  { value: 'ethernet', label: 'Ethernet (RJ45)' }, { value: 'fiber', label: 'Fiber' }, { value: 'sfp', label: 'SFP / SFP+' },
  { value: 'wireless', label: 'Wireless' }, { value: 'profinet', label: 'PROFINET' }, { value: 'iolink', label: 'IO-Link' },
  { value: 'serial', label: 'Serial (RS-232/485)' }, { value: 'console', label: 'Console' }, { value: 'usb', label: 'USB' },
  { value: 'power', label: 'Power' }, { value: 'any', label: 'Any (universal)' },
];
const SIDES: { value: Side; label: string }[] = [
  { value: 'auto', label: 'Auto' }, { value: 'top', label: 'Top' }, { value: 'right', label: 'Right' }, { value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left' },
];
const TOKENS = ['accent', 'accent-light', 'accent-lighter', 'accent-dark', 'accent-darker'];

export function DeviceEditor() {
  const session = useStore((s) => s.editor)!;
  const e = useEditor();
  const themePref = useStore((s) => s.themePref);

  useEffect(() => { useEditor.getState().reset(session.def); }, [session.def]);

  const isBuiltinId = BUILTIN_DEFS.some((d) => d.id === e.def.id);
  const close = (force = false) => {
    if (!force && useEditor.getState().past.length && !confirm('Discard unsaved changes to this device?')) return;
    useStore.setState({ editor: null });
  };
  const save = (asNew = false) => {
    const st = useStore.getState();
    let def: DeviceDef = deepClone(useEditor.getState().def);
    if (asNew) def = { ...def, id: uid('dev-'), name: def.name.endsWith('copy') ? def.name : def.name + ' copy' };
    st.saveUserDef(def);
    st.toast(asNew ? `Saved “${def.name}” as a new device` : `Saved “${def.name}” to the library`, 'success');
    useStore.setState({ editor: null });
  };

  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
      const st = useEditor.getState();
      const mod = modKey(ev);
      const key = ev.key.toLowerCase();
      if (mod && key === 'z') { ev.preventDefault(); ev.shiftKey ? st.redo() : st.undo(); return; }
      if (mod && key === 'y') { ev.preventDefault(); st.redo(); return; }
      if (mod && key === 's') { ev.preventDefault(); save(); return; }
      if (mod && ev.altKey && key === 'c') { ev.preventDefault(); copyStyle(); return; }
      if (mod && ev.altKey && key === 'v') { ev.preventDefault(); pasteStyle(); return; }
      if (mod && key === 'c') { st.copy(); return; }
      if (mod && key === 'v') { ev.preventDefault(); st.paste(); return; }
      if (mod && key === 'd') { ev.preventDefault(); st.duplicate(); return; }
      if (mod && key === 'a') { ev.preventDefault(); st.set({ selection: [...st.def.shapes.filter((s) => !s.locked && !s.hidden).map((s) => s.id), ...st.def.ports.map((p) => p.id)] }); return; }
      if (ev.shiftKey && ev.code === 'Digit1') { editorApi.fit(); return; }
      if (mod) return;
      if (key === 'delete' || key === 'backspace') { ev.preventDefault(); st.deleteSelection(); return; }
      if (key === 'escape') { if (st.editPoints) st.set({ editPoints: null }); else st.set({ selection: [], tool: 'select' }); return; }
      if (key === ']') { st.zOrder(ev.shiftKey ? 'forward' : 'front'); return; }
      if (key === '[') { st.zOrder(ev.shiftKey ? 'backward' : 'back'); return; }
      if (KEYMAP[key]) { st.set({ tool: KEYMAP[key], pen: null }); return; }
      if (key.startsWith('arrow') && st.selection.length) {
        ev.preventDefault();
        const d = ev.shiftKey ? 4 : 0.5;
        const dx = key === 'arrowleft' ? -d : key === 'arrowright' ? d : 0;
        const dy = key === 'arrowup' ? -d : key === 'arrowdown' ? d : 0;
        const sel = new Set(st.selection);
        st.change((df) => { [...df.shapes, ...df.ports].forEach((s: any) => { if (sel.has(s.id) && !s.locked) { s.x += dx; s.y += dy; } }); });
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  return (
    <div className="editor">
      <header className="topbar">
        <div className="topbar-left">
          <button className="menu-btn" onClick={() => close()}><ArrowLeft size={15} /> Back to diagram</button>
          <span className="divider" />
          <strong style={{ fontSize: 13 }}>{e.def.name}</strong>
          <span className="editor-badge">DEVICE EDITOR</span>
        </div>
        <div className="topbar-center tools">
          {TOOLS.map((t) => (
            <IconButton key={t.id} title={t.title} shortcut={t.key} active={e.tool === t.id} onClick={() => e.set({ tool: t.id, pen: null })}>{t.icon}</IconButton>
          ))}
          <span className="divider" />
          <IconButton title="Undo" shortcut="Ctrl+Z" disabled={!e.past.length} onClick={e.undo}><Undo2 size={17} /></IconButton>
          <IconButton title="Redo" shortcut="Ctrl+Shift+Z" disabled={!e.future.length} onClick={e.redo}><Redo2 size={17} /></IconButton>
        </div>
        <div className="topbar-right">
          <IconButton title="Snap to half-pixel grid" active={e.snap} onClick={() => e.set({ snap: !e.snap })}><Magnet size={16} /></IconButton>
          <IconButton title="Fit artboard" shortcut="Shift+1" onClick={() => editorApi.fit()}><Maximize size={16} /></IconButton>
          <IconButton title={`Theme: ${themePref === 'system' ? 'follow browser' : themePref}`} onClick={() => useStore.getState().cycleTheme()}>{themePref === 'system' ? <SunMoon size={16} /> : themePref === 'light' ? <Sun size={16} /> : <Moon size={16} />}</IconButton>
          <span className="divider" />
          <button className="btn ghost sm" onClick={() => save(true)} title="Keep the original and save this as a separate device"><Copy size={13} /> Save as new</button>
          <button className="btn primary sm" onClick={() => save()} title={isBuiltinId ? 'Overrides the built-in device everywhere it is used' : 'Updates the device everywhere it is used'}>
            {isBuiltinId ? 'Save (override built-in)' : 'Save to library'}
          </button>
        </div>
      </header>
      <div className="workspace">
        <EditorLayers />
        <main className="editor-canvas"><EditorCanvas /></main>
        <EditorInspector />
      </div>
    </div>
  );
}

type StyleClip = Pick<Shape, 'fill' | 'stroke' | 'strokeWidth' | 'dash' | 'opacity' | 'gradient'> & { radius?: number; radii?: [number, number, number, number] };
let styleClip: StyleClip | null = null;
function copyStyle() {
  const st = useEditor.getState();
  const sh = st.def.shapes.find((x) => st.selection.includes(x.id));
  if (!sh) return;
  styleClip = { fill: sh.fill, stroke: sh.stroke, strokeWidth: sh.strokeWidth, dash: sh.dash, opacity: sh.opacity, gradient: sh.gradient, radius: (sh as any).radius, radii: (sh as any).radii };
  useStore.getState().toast('Style copied', 'info');
}
function pasteStyle() {
  const st = useEditor.getState();
  if (!styleClip) return;
  const sel = new Set(st.selection);
  st.change((df) => df.shapes.forEach((x: any) => {
    if (!sel.has(x.id)) return;
    Object.assign(x, { fill: styleClip!.fill, stroke: styleClip!.stroke, strokeWidth: styleClip!.strokeWidth, dash: styleClip!.dash, opacity: styleClip!.opacity, gradient: styleClip!.gradient });
    if (x.type === 'rect') { x.radius = styleClip!.radius; x.radii = styleClip!.radii; }
  }));
}

/** align / distribute shapes; with one shape, aligns to the artboard */
function alignShapes(how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hdist' | 'vdist') {
  const st = useEditor.getState();
  const sel = new Set(st.selection);
  st.change((df) => {
    const ss = df.shapes.filter((x) => sel.has(x.id) && !x.locked);
    if (!ss.length) return;
    const b = ss.length === 1 ? { x: 0, y: 0, w: df.w, h: df.h } : unionRects(ss.map((x) => ({ x: x.x, y: x.y, w: x.w, h: x.h })))!;
    if (how === 'hdist' || how === 'vdist') {
      const H = how === 'hdist';
      const sorted = [...ss].sort((a, c) => (H ? a.x - c.x : a.y - c.y));
      if (sorted.length < 3) return;
      const total = sorted.reduce((t, x) => t + (H ? x.w : x.h), 0);
      const gap = ((H ? b.w : b.h) - total) / (sorted.length - 1);
      let cur = H ? b.x : b.y;
      for (const x of sorted) { if (H) x.x = Math.round(cur * 100) / 100; else x.y = Math.round(cur * 100) / 100; cur += (H ? x.w : x.h) + gap; }
      return;
    }
    for (const x of ss) {
      if (how === 'left') x.x = b.x;
      if (how === 'right') x.x = b.x + b.w - x.w;
      if (how === 'hcenter') x.x = b.x + b.w / 2 - x.w / 2;
      if (how === 'top') x.y = b.y;
      if (how === 'bottom') x.y = b.y + b.h - x.h;
      if (how === 'vcenter') x.y = b.y + b.h / 2 - x.h / 2;
    }
  });
}

function AlignBar({ multi }: { multi: boolean }) {
  return (
    <div className="align-grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
      <IconButton title="Align left" onClick={() => alignShapes('left')}><AlignHorizontalJustifyStart size={15} /></IconButton>
      <IconButton title="Align centre" onClick={() => alignShapes('hcenter')}><AlignHorizontalJustifyCenter size={15} /></IconButton>
      <IconButton title="Align right" onClick={() => alignShapes('right')}><AlignHorizontalJustifyEnd size={15} /></IconButton>
      <IconButton title="Align top" onClick={() => alignShapes('top')}><AlignVerticalJustifyStart size={15} /></IconButton>
      <IconButton title="Align middle" onClick={() => alignShapes('vcenter')}><AlignVerticalJustifyCenter size={15} /></IconButton>
      <IconButton title="Align bottom" onClick={() => alignShapes('bottom')}><AlignVerticalJustifyEnd size={15} /></IconButton>
      <IconButton title="Distribute horizontally" disabled={!multi} onClick={() => alignShapes('hdist')}><AlignHorizontalSpaceAround size={15} /></IconButton>
      <IconButton title="Distribute vertically" disabled={!multi} onClick={() => alignShapes('vdist')}><AlignVerticalSpaceAround size={15} /></IconButton>
    </div>
  );
}

function RepeatTool({ ids }: { ids: string[] }) {
  const [nx, setNx] = React.useState(4), [ny, setNy] = React.useState(1), [gx, setGx] = React.useState(2), [gy, setGy] = React.useState(2);
  const run = () => {
    const st = useEditor.getState();
    const src = st.def.shapes.filter((x) => ids.includes(x.id));
    if (!src.length) return;
    const b = unionRects(src.map((x) => ({ x: x.x, y: x.y, w: x.w, h: x.h })))!;
    const made: Shape[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!i && !j) continue;
      for (const x of src) made.push({ ...deepClone(x), id: uid('s'), x: x.x + i * (b.w + gx), y: x.y + j * (b.h + gy) } as Shape);
    }
    st.change((df) => { df.shapes.push(...(made as any)); });
    st.set({ selection: [...ids, ...made.map((m) => m.id)] });
  };
  return (
    <Section title="Repeat (array)">
      <Row><NumInput label="Cols" value={nx} min={1} max={60} precision={0} onChange={(v) => setNx(Math.round(v))} /><NumInput label="Rows" value={ny} min={1} max={60} precision={0} onChange={(v) => setNy(Math.round(v))} /></Row>
      <Row><NumInput label="Gap X" value={gx} step={0.5} onChange={setGx} /><NumInput label="Gap Y" value={gy} step={0.5} onChange={setGy} /></Row>
      <button className="btn sm" disabled={nx * ny < 2} onClick={run}><Grid3x3 size={13} /> Create {Math.max(0, nx * ny - 1)} copies</button>
      <div className="hint">Great for vents, LEDs, port rows and grilles.</div>
    </Section>
  );
}

function GradientEditor({ s, upd }: { s: Shape; upd: (fn: (x: any) => void) => void }) {
  const g = s.gradient;
  return (
    <>
      <Row><Toggle label="Linear gradient" checked={!!g} onChange={(v) => upd((x) => { x.gradient = v ? { angle: 90, from: x.fill && x.fill !== 'none' ? x.fill : '#6b7f8f', to: '#2f3b46' } : undefined; })} /></Row>
      {g && (
        <>
          <Row label="From"><ColorInput value={g.from} tokens={TOKENS} onChange={(v) => upd((x) => { x.gradient.from = v ?? '#000000'; })} /></Row>
          <Row label="To"><ColorInput value={g.to} tokens={TOKENS} onChange={(v) => upd((x) => { x.gradient.to = v ?? '#ffffff'; })} /></Row>
          <Row><NumInput label="Angle" value={g.angle} suffix="°" step={15} onChange={(v) => upd((x) => { x.gradient.angle = v; })} /></Row>
        </>
      )}
    </>
  );
}

const SHAPE_LABEL: Record<Shape['type'], string> = {
  rect: 'Rect', ellipse: 'Ellipse', polygon: 'Polygon', path: 'Path', text: 'Text', isoBox: 'Iso box', isoCylinder: 'Iso cyl.', image: 'Image',
};

function EditorLayers() {
  const { def, selection, select, change, set } = useEditor();
  const sel = new Set(selection);
  const move = (id: string, d: number) => change((df) => {
    const i = df.shapes.findIndex((s) => s.id === id), j = i + d;
    if (j < 0 || j >= df.shapes.length) return;
    [df.shapes[i], df.shapes[j]] = [df.shapes[j], df.shapes[i]];
  });
  return (
    <aside className="left-panel">
      <div className="panel-title"><span>Ports ({def.ports.length})</span>
        <button className="icon-btn sm" title="Add port (N)" onClick={() => set({ tool: 'port' })}><Plus size={14} /></button></div>
      <div style={{ maxHeight: '34%', overflowY: 'auto', flex: 'none' }}>
        {def.ports.map((p) => (
          <div key={p.id} className={'layer-row' + (sel.has(p.id) ? ' active' : '')} onClick={(ev) => select([p.id], ev.shiftKey ? 'toggle' : 'replace')}>
            <span className="port-chip" style={{ borderColor: MEDIA_COLORS[p.media] }} />
            <span className="grow ellipsis"><b>{p.name}</b> <span className="dim">· {p.media}{p.maxLinks !== 1 ? ` · ${p.maxLinks || '∞'}` : ''}</span></span>
            <button className="icon-btn xs" title="Delete port" onClick={(ev) => { ev.stopPropagation(); change((df) => { df.ports = df.ports.filter((x) => x.id !== p.id); }); }}><X size={12} /></button>
          </div>
        ))}
        {!def.ports.length && <div className="hint pad">No ports yet. Use the Port tool (N) and click where links should attach.</div>}
      </div>
      <div className="panel-title" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}><span>Layers ({def.shapes.length})</span></div>
      <div className="lib-scroll">
        {[...def.shapes].reverse().map((s) => (
          <div key={s.id} className={'layer-row' + (sel.has(s.id) ? ' active' : '') + (s.hidden ? ' dim' : '')} onClick={(ev) => select([s.id], ev.shiftKey ? 'toggle' : 'replace')}>
            <span className="layer-kind">{s.guide ? 'Ref' : SHAPE_LABEL[s.type]}</span>
            <span className="grow ellipsis">{s.name}</span>
            <button className="icon-btn xs" title="Move up" onClick={(ev) => { ev.stopPropagation(); move(s.id, 1); }}><ChevronUp size={12} /></button>
            <button className="icon-btn xs" title="Move down" onClick={(ev) => { ev.stopPropagation(); move(s.id, -1); }}><ChevronDown size={12} /></button>
            <button className={'icon-btn xs' + (s.locked ? ' on' : '')} onClick={(ev) => { ev.stopPropagation(); change((df) => { const x = df.shapes.find((y) => y.id === s.id)!; x.locked = !x.locked; }); }}>{s.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
            <button className={'icon-btn xs' + (s.hidden ? ' on' : '')} onClick={(ev) => { ev.stopPropagation(); change((df) => { const x = df.shapes.find((y) => y.id === s.id)!; x.hidden = !x.hidden; }); }}>{s.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function EditorInspector() {
  const { def, selection } = useEditor();
  const shapes = def.shapes.filter((s) => selection.includes(s.id));
  const ports = def.ports.filter((p) => selection.includes(p.id));
  let body: React.ReactNode;
  if (shapes.length === 1 && !ports.length) body = <ShapeInspector s={shapes[0]} />;
  else if (ports.length === 1 && !shapes.length) body = <PortInspector p={ports[0]} />;
  else if (shapes.length + ports.length > 1) body = <MultiEdit />;
  else body = <DefInspector />;
  return (
    <aside className="right-panel">
      {body}
      <Preview />
    </aside>
  );
}

function MultiEdit() {
  const { selection, def, change, deleteSelection } = useEditor();
  const sel = new Set(selection);
  const ports = def.ports.filter((p) => sel.has(p.id));
  const shapes = def.shapes.filter((s) => sel.has(s.id));
  const alignPorts = (axis: 'x' | 'y') => change((df) => {
    const ps = df.ports.filter((p) => sel.has(p.id));
    const v = ps.reduce((a, p) => a + p[axis], 0) / ps.length;
    ps.forEach((p) => { p[axis] = Math.round(v * 2) / 2; });
  });
  const distribute = (axis: 'x' | 'y') => change((df) => {
    const ps = df.ports.filter((p) => sel.has(p.id)).sort((a, b) => a[axis] - b[axis]);
    if (ps.length < 3) return;
    const a = ps[0][axis], b = ps[ps.length - 1][axis];
    ps.forEach((p, i) => { p[axis] = Math.round((a + ((b - a) * i) / (ps.length - 1)) * 2) / 2; });
  });
  return (
    <>
      <div className="insp-head"><div className="grow"><div className="insp-title">{selection.length} selected</div>
        <div className="insp-sub">{shapes.length} shapes · {ports.length} ports</div></div>
        <IconButton title="Delete" onClick={deleteSelection}><Trash2 size={15} /></IconButton></div>
      {shapes.length > 0 && (
        <Section title="Align & distribute"><AlignBar multi={shapes.length > 2} /></Section>
      )}
      {shapes.length > 0 && (
        <Section title="Shapes">
          <Row><button className="btn sm" onClick={copyStyle}>Copy style</button><button className="btn sm" disabled={!styleClip} onClick={pasteStyle}>Paste style</button></Row>
          <Row label="Fill"><ColorInput value={shapes[0].fill} tokens={TOKENS} onChange={(v) => change((df) => df.shapes.forEach((s) => { if (sel.has(s.id)) s.fill = v ?? 'none'; }))} /></Row>
        </Section>
      )}
      {shapes.length > 0 && !ports.length && <RepeatTool ids={shapes.map((x) => x.id)} />}
      {ports.length > 0 && (
        <Section title="Ports">
          <Row label="Media"><Select value={ports[0].media} options={MEDIA} onChange={(v) => change((df) => df.ports.forEach((p) => { if (sel.has(p.id)) p.media = v; }))} /></Row>
          <Row label="Side"><Select value={ports[0].side} options={SIDES} onChange={(v) => change((df) => df.ports.forEach((p) => { if (sel.has(p.id)) p.side = v; }))} /></Row>
          <Row label="Max links"><NumInput value={ports[0].maxLinks} min={0} precision={0} onChange={(v) => change((df) => df.ports.forEach((p) => { if (sel.has(p.id)) p.maxLinks = Math.round(v); }))} /></Row>
          <Row>
            <button className="btn sm" onClick={() => alignPorts('y')}>Align row</button>
            <button className="btn sm" onClick={() => alignPorts('x')}>Align column</button>
          </Row>
          <Row>
            <button className="btn sm" disabled={ports.length < 3} onClick={() => distribute('x')}>Distribute ↔</button>
            <button className="btn sm" disabled={ports.length < 3} onClick={() => distribute('y')}>Distribute ↕</button>
          </Row>
        </Section>
      )}
    </>
  );
}

function ShapeInspector({ s }: { s: Shape }) {
  const { change, set, deleteSelection } = useEditor();
  const upd = (fn: (x: any) => void) => change((df) => { const x = df.shapes.find((y) => y.id === s.id); if (x) fn(x); });
  return (
    <>
      <div className="insp-head"><div className="grow"><div className="insp-title">{SHAPE_LABEL[s.type]}</div><div className="insp-sub">{s.name}</div></div>
        <IconButton title="Delete" onClick={deleteSelection}><Trash2 size={15} /></IconButton></div>
      <Section title="Layer">
        <Row label="Name"><TextInput value={s.name} onChange={(v) => upd((x) => { x.name = v; })} /></Row>
        <Row><NumInput label="X" value={s.x} step={0.5} onChange={(v) => upd((x) => { x.x = v; })} /><NumInput label="Y" value={s.y} step={0.5} onChange={(v) => upd((x) => { x.y = v; })} /></Row>
        <Row><NumInput label="W" value={s.w} step={0.5} min={0.1} onChange={(v) => upd((x) => { x.w = v; })} /><NumInput label="H" value={s.h} step={0.5} min={0.1} onChange={(v) => upd((x) => { x.h = v; })} /></Row>
        <Row><NumInput label="↻" value={s.rotation ?? 0} suffix="°" onChange={(v) => upd((x) => { x.rotation = v || undefined; })} />
          <NumInput label="Op." value={Math.round((s.opacity ?? 1) * 100)} min={0} max={100} precision={0} suffix="%" onChange={(v) => upd((x) => { x.opacity = v >= 100 ? undefined : v / 100; })} /></Row>
        <Row><Toggle label="Reference only (hidden on diagrams)" checked={!!s.guide} onChange={(v) => upd((x) => { x.guide = v || undefined; })} /></Row>
      </Section>
      <Section title="Align to artboard"><AlignBar multi={false} /></Section>
      {s.type !== 'image' && (
        <Section title="Fill & stroke">
          {!s.gradient && <Row label="Fill"><ColorInput value={s.fill === 'none' ? undefined : s.fill} allowNone tokens={TOKENS} onChange={(v) => upd((x) => { x.fill = v ?? 'none'; })} /></Row>}
          {s.type !== 'isoBox' && s.type !== 'isoCylinder' && <GradientEditor s={s} upd={upd} />}
          <Row label="Stroke"><ColorInput value={s.stroke} allowNone tokens={TOKENS} onChange={(v) => upd((x) => { x.stroke = v; })} /></Row>
          <Row>
            <NumInput label="Width" value={s.strokeWidth ?? 1} min={0} step={0.1} onChange={(v) => upd((x) => { x.strokeWidth = v; })} />
            <Select value={s.dash ? 'dash' : 'solid'} onChange={(v) => upd((x) => { x.dash = v === 'dash' ? '2 1.5' : undefined; })} options={[{ value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dashed' }]} />
          </Row>
          {(s.type === 'isoBox' || s.type === 'isoCylinder') && <div className="hint">Faces are shaded automatically from the fill colour. Use the <b>accent</b> token so each diagram instance can recolour it.</div>}
          <Row><button className="btn sm" onClick={copyStyle} title="Ctrl+Alt+C">Copy style</button><button className="btn sm" disabled={!styleClip} onClick={pasteStyle} title="Ctrl+Alt+V">Paste style</button></Row>
        </Section>
      )}
      {s.type === 'rect' && (
        <Section title="Corners">
          <Row><Toggle label="Independent corners" checked={!!s.radii} onChange={(v) => upd((x) => { x.radii = v ? [x.radius ?? 0, x.radius ?? 0, x.radius ?? 0, x.radius ?? 0] : undefined; })} /></Row>
          {!s.radii ? (
            <Row><NumInput label="Radius" value={s.radius ?? 0} min={0} step={0.5} onChange={(v) => upd((x) => { x.radius = v; })} /></Row>
          ) : (
            <>
              <Row><NumInput label="TL" value={s.radii[0]} min={0} step={0.5} onChange={(v) => upd((x) => { x.radii[0] = v; })} /><NumInput label="TR" value={s.radii[1]} min={0} step={0.5} onChange={(v) => upd((x) => { x.radii[1] = v; })} /></Row>
              <Row><NumInput label="BL" value={s.radii[3]} min={0} step={0.5} onChange={(v) => upd((x) => { x.radii[3] = v; })} /><NumInput label="BR" value={s.radii[2]} min={0} step={0.5} onChange={(v) => upd((x) => { x.radii[2] = v; })} /></Row>
            </>
          )}
        </Section>
      )}
      {s.type === 'isoBox' && (
        <Section title="Isometric box">
          <Row><NumInput label="Top" value={Math.round(s.top * 100)} min={0} max={100} precision={0} suffix="%" onChange={(v) => upd((x) => { x.top = v / 100; })} />
            <NumInput label="Skew" value={Math.round((s.skew ?? 0.5) * 100)} min={5} max={95} precision={0} suffix="%" onChange={(v) => upd((x) => { x.skew = v / 100; })} /></Row>
        </Section>
      )}
      {s.type === 'isoCylinder' && (
        <Section title="Isometric cylinder"><Row><NumInput label="Top" value={Math.round(s.top * 100)} min={2} max={100} precision={0} suffix="%" onChange={(v) => upd((x) => { x.top = v / 100; })} /></Row></Section>
      )}
      {s.type === 'polygon' && (
        <Section title="Path">
          <Row><Toggle label="Closed shape" checked={s.closed} onChange={(v) => upd((x) => { x.closed = v; if (v && x.fill === 'none') x.fill = 'accent-light'; })} /></Row>
          <Row>
            <button className="btn sm" onClick={() => set({ editPoints: s.id })}>Edit points ({s.points.length})</button>
            <button className="btn sm" onClick={() => upd((x) => { x.points = x.points.map(([a, b]: [number, number]) => [1 - a, b]); })}>Flip ↔</button>
            <button className="btn sm" onClick={() => upd((x) => { x.points = x.points.map(([a, b]: [number, number]) => [a, 1 - b]); })}>Flip ↕</button>
          </Row>
          <div className="hint">Double-click the shape to edit points; double-click a segment to add one, Alt+click a point to remove it.</div>
        </Section>
      )}
      {s.type === 'text' && (
        <Section title="Text">
          <TextArea rows={2} value={s.text} onChange={(v) => upd((x) => { x.text = v; })} />
          <Row><NumInput label="Size" value={s.fontSize} min={1} step={0.5} onChange={(v) => upd((x) => { x.fontSize = v; })} />
            <NumInput label="Wt" value={s.fontWeight ?? 600} min={100} max={900} step={100} precision={0} onChange={(v) => upd((x) => { x.fontWeight = v; })} /></Row>
          <Row><Select value={s.align ?? 'middle'} onChange={(v) => upd((x) => { x.align = v; })} options={[{ value: 'start', label: 'Left' }, { value: 'middle', label: 'Center' }, { value: 'end', label: 'Right' }]} />
            <Toggle label="Italic" checked={!!s.italic} onChange={(v) => upd((x) => { x.italic = v; })} /></Row>
        </Section>
      )}
      <RepeatTool ids={[s.id]} />
      {s.type === 'image' && (
        <Section title="Image">
          <button className="btn sm" onClick={async () => {
            const f = await pickFile('image/*,.svg'); if (!f) return;
            const href = await readFileDataUrl(f); upd((x) => { x.href = href; });
          }}><ImagePlus size={13} /> Replace image</button>
        </Section>
      )}
    </>
  );
}

function PortInspector({ p }: { p: PortDef }) {
  const { change, deleteSelection } = useEditor();
  const upd = (fn: (x: PortDef) => void) => change((df) => { const x = df.ports.find((y) => y.id === p.id); if (x) fn(x); });
  return (
    <>
      <div className="insp-head"><span className="port-chip" style={{ borderColor: MEDIA_COLORS[p.media], width: 14, height: 14 }} />
        <div className="grow"><div className="insp-title">Port {p.name}</div><div className="insp-sub">Connection point — links attach here</div></div>
        <IconButton title="Delete" onClick={deleteSelection}><Trash2 size={15} /></IconButton></div>
      <Section title="Port">
        <Row label="Name"><TextInput value={p.name} onChange={(v) => upd((x) => { x.name = v || x.name; })} /></Row>
        <Row label="Media"><Select value={p.media} options={MEDIA} onChange={(v) => upd((x) => { x.media = v; if (v === 'wireless' && x.maxLinks === 1) x.maxLinks = 0; })} /></Row>
        <Row label="Max links"><NumInput value={p.maxLinks} min={0} precision={0} onChange={(v) => upd((x) => { x.maxLinks = Math.round(v); })} /></Row>
        <div className="hint">0 = unlimited (e.g. a Wi-Fi radio or a cloud). Links between incompatible media are refused on the canvas.</div>
        <Row label="Exit side"><Select value={p.side} options={SIDES} onChange={(v) => upd((x) => { x.side = v; })} /></Row>
        <Row><NumInput label="X" value={p.x} step={0.5} onChange={(v) => upd((x) => { x.x = v; })} /><NumInput label="Y" value={p.y} step={0.5} onChange={(v) => upd((x) => { x.y = v; })} /></Row>
        <Row label="Notes"><TextInput value={p.description ?? ''} placeholder="e.g. 1G uplink, PoE out" onChange={(v) => upd((x) => { x.description = v || undefined; })} /></Row>
      </Section>
    </>
  );
}

function DefInspector() {
  const { def, change, set } = useEditor();
  const defs = useStore((s) => s.libDefs);
  const cats = Array.from(new Set(Object.values(defs).map((d) => d.category))).sort();
  const upd = (fn: (d: DeviceDef) => void) => change(fn as any);
  const fitArtboard = () => change((df) => {
    const b = unionRects(df.shapes.filter((s) => !s.hidden).map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })));
    if (!b) return;
    const dx = -b.x, dy = -b.y;
    df.shapes.forEach((s) => { s.x += dx; s.y += dy; });
    df.ports.forEach((p) => { p.x += dx; p.y += dy; });
    df.w = Math.ceil(b.w); df.h = Math.ceil(b.h);
  });
  const importSvg = async (asShapes: boolean) => {
    const f = await pickFile(asShapes ? '.svg,image/svg+xml' : 'image/*,.svg');
    if (!f) return;
    const st = useEditor.getState();
    try {
      if (asShapes) {
        const { shapes, skipped } = importSvgAsShapes(await readFileText(f), st.def.w, st.def.h);
        st.change((df) => { df.shapes.push(...(shapes as any)); });
        st.set({ selection: shapes.map((s) => s.id) });
        useStore.getState().toast(`Imported ${shapes.length} shapes${skipped ? ` (${skipped} rotated/skewed elements skipped)` : ''}`, 'success');
      } else {
        const href = await readFileDataUrl(f);
        const sz = await imageSize(href);
        const k = Math.min(st.def.w / sz.w, st.def.h / sz.h);
        const s: any = { id: uid('s'), type: 'image', name: f.name, href, x: (st.def.w - sz.w * k) / 2, y: (st.def.h - sz.h * k) / 2, w: sz.w * k, h: sz.h * k };
        st.change((df) => { df.shapes.push(s); });
        st.set({ selection: [s.id] });
      }
    } catch (err: any) {
      useStore.getState().toast('Import failed: ' + (err?.message ?? err), 'error');
    }
  };
  return (
    <>
      <div className="insp-head"><div className="grow"><div className="insp-title">Device definition</div><div className="insp-sub">Applies to every instance in your diagrams</div></div></div>
      <Section title="Identity">
        <Row label="Name"><TextInput value={def.name} onChange={(v) => upd((d) => { d.name = v; })} /></Row>
        <Row label="Category">
          <div className="input-wrap" style={{ flex: 1 }}>
            <input className="input" list="nc-cats" defaultValue={def.category} key={def.category}
              onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== def.category) upd((d) => { d.category = v; }); }}
              onKeyDown={(ev) => { ev.stopPropagation(); if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }} />
            <datalist id="nc-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </Row>
        <Row label="Name prefix"><TextInput value={def.prefix ?? ''} placeholder="e.g. sw, rt, fw" onChange={(v) => upd((d) => { d.prefix = v || undefined; })} /></Row>
        <Row label="Style">
          <Select value={def.style ?? 'iso'} onChange={(v) => upd((d) => { d.style = v; })} options={[{ value: 'iso', label: 'Isometric' }, { value: 'detailed', label: 'Detailed' }]} />
        </Row>
        <Row label="Pair with">
          <select className="input select" value={def.counterpart ?? ''} onChange={(e) => upd((d) => { d.counterpart = e.target.value || undefined; })} onKeyDown={(e) => e.stopPropagation()}>
            <option value="">— none —</option>
            {Object.values(defs).filter((d) => d.id !== def.id && (d.style ?? 'iso') !== (def.style ?? 'iso')).sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
              <option key={d.id} value={d.id}>{d.name}{d.vendor ? ` (${d.vendor})` : ''}</option>
            ))}
          </select>
        </Row>
        <div className="hint">Pairing links this device with its drawing in the other style, so diagrams can switch between Isometric and Detailed.</div>
        <Row label="Notes"><TextInput value={def.description ?? ''} onChange={(v) => upd((d) => { d.description = v || undefined; })} /></Row>
      </Section>
      <Section title="Artboard">
        <Row><NumInput label="W" value={def.w} min={4} onChange={(v) => upd((d) => { d.w = v; })} /><NumInput label="H" value={def.h} min={4} onChange={(v) => upd((d) => { d.h = v; })} /></Row>
        <Row label="Accent"><ColorInput value={def.accent} onChange={(v) => upd((d) => { d.accent = v || '#1a8fd8'; })} /></Row>
        <div className="hint">Shapes using <b>accent</b> tokens follow this colour, and can be recoloured per instance.</div>
        <button className="btn sm" onClick={fitArtboard}>Fit artboard to content</button>
      </Section>
      <Section title="Trace from a photo">
        <button className="btn sm" onClick={async () => {
          const f = await pickFile('image/*'); if (!f) return;
          const href = await readFileDataUrl(f); const sz = await imageSize(href);
          const st = useEditor.getState();
          if (!st.def.shapes.some((x) => !x.guide)) {
            // empty artboard: match the photo's proportions (56 units on the long side)
            const r = sz.w / sz.h, W = r >= 1 ? 56 : Math.round(56 * r), H = r >= 1 ? Math.round(56 / r) : 56;
            st.change((df) => { df.ports.forEach((p) => { p.x = (p.x / df.w) * W; p.y = (p.y / df.h) * H; }); df.w = W; df.h = H; });
            setTimeout(() => editorApi.fit(), 0);
          }
          const cur = useEditor.getState().def;
          const k = Math.min(cur.w / sz.w, cur.h / sz.h);
          const s: any = { id: uid('s'), type: 'image', name: 'Reference: ' + f.name, href, guide: true, locked: true, opacity: 0.45,
            x: (cur.w - sz.w * k) / 2, y: (cur.h - sz.h * k) / 2, w: sz.w * k, h: sz.h * k };
          st.change((df) => { df.shapes.unshift(s); });
        }}><ImagePlus size={13} /> Add reference photo</button>
        <div className="hint">Places a product photo under your drawing (locked, 45% opacity) so you can trace it with rectangles and the pen. Reference layers never appear on diagrams or exports — unlock it in Layers to move or resize.</div>
      </Section>
      <PortGenerator />
      <Section title="Import artwork">
        <Row>
          <button className="btn sm" onClick={() => importSvg(true)}><FileUp size={13} /> SVG as shapes</button>
          <button className="btn sm" onClick={() => importSvg(false)}><ImagePlus size={13} /> Image / SVG</button>
        </Row>
        <div className="hint">Bring in vendor icon packs (Cisco, Fortinet, Siemens…). “SVG as shapes” keeps every path editable.</div>
      </Section>
      <Section title="Properties template" actions={<IconButton title="Add field" onClick={() => upd((d) => { d.fields.push({ key: 'field' + (d.fields.length + 1), label: 'New field' }); })}><Plus size={14} /></IconButton>}>
        {def.fields.map((f, i) => (
          <div key={i} className="field-row">
            <TextInput value={f.label} onChange={(v) => upd((d) => { d.fields[i].label = v; d.fields[i].key = v.toLowerCase().replace(/[^a-z0-9]+/g, '_') || d.fields[i].key; })} />
            <TextInput value={f.default ?? ''} placeholder="default" onChange={(v) => upd((d) => { d.fields[i].default = v || undefined; })} />
            <button className="icon-btn xs" onClick={() => upd((d) => { d.fields.splice(i, 1); })}><X size={12} /></button>
          </div>
        ))}
        <div className="hint">Fields every instance gets in the inspector (model, serial, firmware…).</div>
      </Section>
      <Section title="Quick start">
        <div className="hint"><b>Detailed style:</b> add a reference photo, then trace it with rectangles (R), the pen (P) and ellipses (O); use Repeat for vents and LEDs, gradients for metal and screens, and Ctrl+Alt+C / V to copy styles.<br /><b>Isometric style:</b> start from an iso box (B) or cylinder (Y) with the <i>accent</i> fill.<br />Then press <b>N</b> and click on the outline to drop ports; select a port to set its media, exit side and capacity.</div>
        <Row><button className="btn ghost sm" onClick={() => set({ tool: 'rect' })}>Rectangle</button><button className="btn ghost sm" onClick={() => set({ tool: 'isoBox' })}>Iso box</button></Row>
      </Section>
    </>
  );
}

/** Generate a run of ports from a pattern, e.g. Gi1/0/{n} × 8 along the bottom edge. */
function PortGenerator() {
  const { def, change, set } = useEditor();
  const [pattern, setPattern] = React.useState('P{n}');
  const [count, setCount] = React.useState(8);
  const [start, setStart] = React.useState(1);
  const [media, setMedia] = React.useState<PortMedia>('ethernet');
  const [side, setSide] = React.useState<Exclude<Side, 'auto'>>('bottom');
  const [inset, setInset] = React.useState(10);
  const run = () => {
    const names = Array.from({ length: count }, (_, i) => pattern.replace(/\{n\}/g, String(start + i)).replace(/\{nn\}/g, String(start + i).padStart(2, '0')));
    const horiz = side === 'top' || side === 'bottom';
    const L = horiz ? def.w : def.h;
    const span = Math.max(0, L - inset * 2);
    const ports = names.map((name, i) => {
      const t = count === 1 ? L / 2 : inset + (span * i) / (count - 1);
      const x = side === 'left' ? 0 : side === 'right' ? def.w : t;
      const y = side === 'top' ? 0 : side === 'bottom' ? def.h : t;
      return { id: uid('p'), name: nextPortName([...def.ports], name), x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2, media, side, maxLinks: media === 'wireless' ? 0 : 1 };
    });
    change((d) => { d.ports.push(...ports); });
    set({ selection: ports.map((p) => p.id) });
  };
  return (
    <Section title="Generate ports" collapsible>
      <Row label="Pattern"><TextInput value={pattern} mono placeholder="Gi1/0/{n}" onChange={setPattern} /></Row>
      <Row><NumInput label="Count" value={count} min={1} max={96} precision={0} onChange={(v) => setCount(Math.round(v))} /><NumInput label="Start" value={start} min={0} precision={0} onChange={(v) => setStart(Math.round(v))} /></Row>
      <Row label="Media"><Select value={media} options={MEDIA} onChange={setMedia} /></Row>
      <Row label="Edge"><Select value={side} options={SIDES.filter((x) => x.value !== 'auto') as { value: Exclude<Side, 'auto'>; label: string }[]} onChange={setSide} /><NumInput label="Inset" value={inset} min={0} onChange={setInset} /></Row>
      <button className="btn sm" onClick={run}><Plus size={13} /> Add {count} port{count > 1 ? 's' : ''}</button>
      <div className="hint"><code>{'{n}'}</code> = number, <code>{'{nn}'}</code> = zero-padded. Cisco style: <code>Gi1/0/{'{n}'}</code>, <code>Te1/1/{'{n}'}</code>; Siemens: <code>X1 P{'{n}'}</code>.</div>
    </Section>
  );
}

function Preview() {
  const def = useEditor((s) => s.def);
  const themeName = useStore((s) => s.theme);
  const theme = canvasThemes[themeName];
  const scale = 1.25;
  const w = def.w * scale, h = def.h * scale;
  const fake: any = { id: 'preview', kind: 'device', defId: def.id, x: 0, y: 0, w, h, name: def.prefix ? def.prefix + '01' : 'device01', addresses: [{ id: 'a', vlan: undefined, value: '192.168.0.10' }], props: {}, labelPos: 'bottom' };
  const vbW = Math.max(w + 80, 200), vbH = h + 70;
  return (
    <Section title="Preview (as on the diagram)">
      <div style={{ background: theme.bg, borderRadius: 8, padding: 8 }}>
        <svg width="100%" viewBox={`${-(vbW - w) / 2} -16 ${vbW} ${vbH}`} style={{ display: 'block', maxHeight: 220 }}>
          <DeviceGraphic def={def} x={0} y={0} w={w} h={h} />
          {def.ports.map((p) => { const pw = portWorld(fake, def, p); return <circle key={p.id} cx={pw.x} cy={pw.y} r={2.6} fill={theme.portFill} stroke={MEDIA_COLORS[p.media]} strokeWidth={1.3} />; })}
          <DeviceLabel n={fake} vlans={[]} theme={theme} />
        </svg>
      </div>
    </Section>
  );
}
