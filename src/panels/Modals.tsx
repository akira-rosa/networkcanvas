import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Copy, FolderOpen } from 'lucide-react';
import { useStore } from '../store/store';
import { FindPalette } from './FindPalette';
import { ExportDialog } from './ExportDialog';
import { DeviceTable, ImportDialog } from './DeviceTable';
import { Modal, TextInput, NumInput } from '../ui/controls';
import { newVlan } from '../model/factory';
import { deleteDoc, duplicateDoc, listDocs, newDocument, openDoc, openFromFile, type DocMeta } from '../store/persistence';

export function Modals() {
  const modal = useStore((s) => s.modal);
  const set = useStore((s) => s.set);
  const close = () => set({ modal: null });
  if (modal === 'vlans') return <VlanManager onClose={close} />;
  if (modal === 'documents') return <Documents onClose={close} />;
  if (modal === 'shortcuts') return <Shortcuts onClose={close} />;
  if (modal === 'find') return <FindPalette onClose={close} />;
  if (modal === 'export') return <ExportDialog onClose={close} />;
  if (modal === 'table') return <DeviceTable onClose={close} />;
  if (modal === 'import') return <ImportDialog onClose={close} />;
  return null;
}

function VlanManager({ onClose }: { onClose: () => void }) {
  const vlans = useStore((s) => s.doc.vlans);
  const change = useStore((s) => s.change);
  const pages = useStore((s) => s.doc.pages);
  const usage = useMemo(() => {
    const u: Record<string, number> = {};
    pages.forEach((p) => Object.values(p.nodes).forEach((n) => {
      if (n.kind === 'device') n.addresses.forEach((a) => a.vlan && (u[a.vlan] = (u[a.vlan] ?? 0) + 1));
      if (n.kind === 'zone' && n.vlan) u[n.vlan] = (u[n.vlan] ?? 0) + 1;
    }));
    return u;
  }, [pages]);
  const upd = (id: string, fn: (v: (typeof vlans)[number]) => void) => change((d) => { const v = d.vlans.find((x) => x.id === id); if (v) fn(v); });
  return (
    <Modal title="VLAN registry" onClose={onClose} width={860}
      footer={<>
        <span className="hint">Zones and device addresses reference these VLANs — changing a colour or subnet updates the whole diagram.</span>
        <button className="btn primary" onClick={() => change((d) => { const max = Math.max(0, ...d.vlans.map((v) => v.vlanId)); d.vlans.push(newVlan(max + 10)); })}><Plus size={14} /> Add VLAN</button>
      </>}
    >
      <table className="vlan-table">
        <thead><tr><th style={{ width: 44 }}>Colour</th><th style={{ width: 80 }}>ID</th><th style={{ width: 150 }}>Name</th><th style={{ width: 170 }}>Subnet</th><th>Description</th><th style={{ width: 48 }}>Used</th><th style={{ width: 36 }} /></tr></thead>
        <tbody>
          {vlans.map((v, i) => (
            <tr key={v.id}>
              <td><label className="swatch" style={{ background: v.color }}><input type="color" value={v.color} onChange={(e) => upd(v.id, (x) => { x.color = e.target.value; })} /></label></td>
              <td><NumInput value={v.vlanId} min={0} max={4094} precision={0} onChange={(n) => upd(v.id, (x) => { x.vlanId = Math.round(n); })} /></td>
              <td><TextInput value={v.name} onChange={(t) => upd(v.id, (x) => { x.name = t; })} /></td>
              <td><TextInput value={v.subnet} mono onChange={(t) => upd(v.id, (x) => { x.subnet = t; })} /></td>
              <td><TextInput value={v.description} onChange={(t) => upd(v.id, (x) => { x.description = t; })} /></td>
              <td className="center dim">{usage[v.id] ?? 0}</td>
              <td>
                <button className="icon-btn xs" title="Delete VLAN" onClick={() => {
                  if ((usage[v.id] ?? 0) && !confirm(`VLAN ${v.vlanId} is used ${usage[v.id]} times. Delete anyway?`)) return;
                  change((d) => { d.vlans.splice(i, 1); });
                }}><Trash2 size={13} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function Documents({ onClose }: { onClose: () => void }) {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const current = useStore((s) => s.doc.id);
  const refresh = () => listDocs().then(setDocs);
  useEffect(() => { refresh(); }, []);
  return (
    <Modal title="My diagrams" onClose={onClose} width={640}
      footer={<>
        <span className="hint">Stored locally in this browser. Use File › Save to file for backups and sharing.</span>
        <button className="btn ghost" onClick={async () => { await openFromFile(); onClose(); }}><FolderOpen size={14} /> Open file…</button>
        <button className="btn primary" onClick={async () => { await newDocument(); onClose(); }}><Plus size={14} /> New diagram</button>
      </>}
    >
      <div className="doc-list">
        {docs.map((d) => (
          <div key={d.id} className={'doc-row' + (d.id === current ? ' active' : '')} onClick={async () => { await openDoc(d.id); onClose(); }}>
            <div className="grow">
              <div className="doc-title">{d.name}</div>
              <div className="dim small">{new Date(d.updatedAt).toLocaleString()} · {d.pages} page{d.pages !== 1 ? 's' : ''} · {d.devices} devices</div>
            </div>
            <button className="icon-btn xs" title="Duplicate" onClick={async (e) => { e.stopPropagation(); await duplicateDoc(d.id); refresh(); }}><Copy size={13} /></button>
            <button className="icon-btn xs" title="Delete" onClick={async (e) => { e.stopPropagation(); if (confirm(`Delete “${d.name}”? This cannot be undone.`)) { await deleteDoc(d.id); refresh(); } }}><Trash2 size={13} /></button>
          </div>
        ))}
        {!docs.length && <div className="empty">No saved diagrams yet.</div>}
      </div>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['V / H / C', 'Select · Hand · Connect tool'],
  ['Z / R / T', 'Zone · Box · Text tool'],
  ['Space + drag, middle mouse', 'Pan'],
  ['Wheel / Shift+wheel', 'Scroll vertically / horizontally'],
  ['Ctrl + wheel, pinch', 'Zoom'],
  ['Shift+1 · Shift+2 · Ctrl+0', 'Zoom to fit · zoom to selection · 100%'],
  ['Ctrl+F', 'Find devices, addresses, texts'],
  ['Ctrl+E', 'Export…'],
  ['Ctrl+Shift+D · Ctrl+Shift+A', 'Device table · auto-arrange as tree'],
  ['Ctrl+G · Ctrl+Shift+G', 'Group · ungroup'],
  ['Ctrl+\\', 'Hide / show side panels'],
  ['Drag from a port', 'Create a link (checks port media & capacity)'],
  ['Drag a zone', 'Moves everything inside (Alt: zone only)'],
  ['Shift + drag', 'Constrain movement to an axis'],
  ['Shift + resize', 'Free resize for devices / keep ratio for others'],
  ['Double-click', 'Rename device · edit text · link label'],
  ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copy · Paste · Duplicate'],
  ['Delete / Backspace', 'Delete selection'],
  ['Arrows (Shift = 10px)', 'Nudge'],
  ['[ / ]', 'Send to back / bring to front'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'],
  ['Ctrl+S / Ctrl+O', 'Save to file / Open file'],
  ['P', 'Show all ports'],
  ['Ctrl+Shift+L', 'Toggle light / dark theme'],
  ['Device editor: R O L P T B Y N', 'Rect · Ellipse · Line · Pen · Text · Iso box · Iso cylinder · Port'],
  ['Device editor: Ctrl+Alt+C / V', 'Copy / paste style between shapes'],
  ['Device editor: Alt + drag', 'Move without smart-guide snapping'],
];

function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={560}>
      <div className="shortcuts">
        {SHORTCUTS.map(([k, d]) => (
          <div key={k} className="sc-row"><kbd>{k}</kbd><span>{d}</span></div>
        ))}
      </div>
    </Modal>
  );
}
