import { useMemo, useState } from 'react';
import { Download, Upload, Crosshair } from 'lucide-react';
import { useStore } from '../store/store';
import { Modal, Toggle } from '../ui/controls';
import { canvasApi } from '../canvas/api';
import { exportInventoryCsv } from '../export/exporters';
import type { DeviceNode, DiagramDoc, Vlan } from '../model/types';
import { parseIPv4, parseCidr, ipInCidr } from '../model/checks';
import { uid } from '../model/util';
import { createDevice } from '../model/factory';

/** VLAN whose subnet contains the address, when exactly one does */
export function vlanForIp(value: string, vlans: Vlan[]): string | undefined {
  const ip = parseIPv4(value);
  if (ip === null) return undefined;
  const hits = vlans.filter((v) => { const c = parseCidr(v.subnet); return c && ipInCidr(ip, c); });
  return hits.length === 1 ? hits[0].id : undefined;
}

/** "10.0.0.1, 10.0.1.5" → addresses, VLAN inferred from the registry */
export function parseAddressList(text: string, vlans: Vlan[], existing: DeviceNode['addresses'] = []) {
  return text.split(/[;,|\n]+/).map((t) => t.trim()).filter(Boolean).map((value) => {
    const prev = existing.find((a) => a.value === value);
    return { id: prev?.id ?? uid('a'), value, vlan: prev?.vlan ?? vlanForIp(value, vlans) };
  });
}

interface Row { pageId: string; pageName: string; node: DeviceNode }

export function DeviceTable({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [allPages, setAllPages] = useState(false);
  const [filter, setFilter] = useState('');
  const defs = s.defs;
  const rows = useMemo<Row[]>(() => {
    const pages = allPages ? s.doc.pages : s.doc.pages.filter((p) => p.id === s.pageId);
    const out: Row[] = [];
    for (const p of pages) for (const id of p.order) { const n = p.nodes[id]; if (n?.kind === 'device') out.push({ pageId: p.id, pageName: p.name, node: n }); }
    const f = filter.trim().toLowerCase();
    return f ? out.filter((r) => JSON.stringify(r.node).toLowerCase().includes(f)) : out;
  }, [s.doc, s.pageId, allPages, filter]);

  // union of property fields across the listed devices
  const fieldCols = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      const def = defs[r.node.defId];
      def?.fields.forEach((f) => seen.set(f.key, f.label));
      Object.keys(r.node.props).forEach((k) => { if (!seen.has(k)) seen.set(k, k); });
    }
    return [...seen.entries()];
  }, [rows, defs]);

  const upd = (r: Row, fn: (n: DeviceNode) => void) => s.change((d) => {
    const p = d.pages.find((x) => x.id === r.pageId);
    const n = p?.nodes[r.node.id];
    if (n?.kind === 'device') fn(n);
  });
  const reveal = (r: Row) => {
    if (r.pageId !== s.pageId) s.setPage(r.pageId);
    s.select([r.node.id]);
    setTimeout(() => canvasApi.reveal([r.node.id]), 30);
    onClose();
  };

  return (
    <Modal title={`Devices (${rows.length})`} onClose={onClose} width={1100}
      footer={<>
        <span className="hint">Edit cells inline. Addresses: comma-separated IPs — the VLAN is inferred from the registry subnets.</span>
        <button className="btn ghost" onClick={() => s.set({ modal: 'import' })}><Upload size={14} /> Import CSV…</button>
        <button className="btn" onClick={exportInventoryCsv}><Download size={14} /> Export CSV</button>
      </>}
    >
      <div className="table-tools">
        <input className="input" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.stopPropagation()} style={{ maxWidth: 240 }} />
        <Toggle label="All pages" checked={allPages} onChange={setAllPages} />
      </div>
      <div className="table-wrap">
        <table className="dev-table">
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              {allPages && <th>Page</th>}
              <th>Name</th><th>Type</th><th>Subtitle</th><th style={{ minWidth: 220 }}>Addresses</th>
              {fieldCols.map(([k, label]) => <th key={k}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const n = r.node;
              const def = defs[n.defId];
              return (
                <tr key={r.pageId + n.id}>
                  <td><button className="icon-btn xs" title="Show on canvas" onClick={() => reveal(r)}><Crosshair size={12} /></button></td>
                  {allPages && <td className="dim">{r.pageName}</td>}
                  <td><Cell value={n.name} onChange={(v) => upd(r, (m) => { m.name = v; })} /></td>
                  <td className="dim">{def?.name ?? n.defId}</td>
                  <td><Cell value={n.subtitle ?? ''} onChange={(v) => upd(r, (m) => { m.subtitle = v || undefined; })} /></td>
                  <td>
                    <Cell mono value={n.addresses.map((a) => a.value).join(', ')} onChange={(v) => upd(r, (m) => { m.addresses = parseAddressList(v, s.doc.vlans, m.addresses); })} />
                    <div className="addr-dots">{n.addresses.map((a) => { const v = s.doc.vlans.find((x) => x.id === a.vlan); return <span key={a.id} className="dot" title={v ? `VLAN ${v.vlanId}` : 'no VLAN'} style={{ background: v?.color ?? 'transparent', borderColor: v ? 'transparent' : 'var(--text-3)' }} />; })}</div>
                  </td>
                  {fieldCols.map(([k]) => <td key={k}><Cell value={n.props[k] ?? ''} onChange={(v) => upd(r, (m) => { if (v) m.props[k] = v; else delete m.props[k]; })} /></td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty">No devices{filter ? ' match the filter' : ' on this page'}.</div>}
      </div>
    </Modal>
  );
}

function Cell({ value, onChange, mono }: { value: string; onChange: (v: string) => void; mono?: boolean }) {
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);
  if (!editing && v !== value) setV(value);
  return (
    <input
      className={'cell' + (mono ? ' mono' : '')}
      value={v}
      onFocus={() => setEditing(true)}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); if (v !== value) onChange(v); }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur(); } }}
    />
  );
}

/* ---------- CSV import ---------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

type Target = 'skip' | 'name' | 'type' | 'subtitle' | 'addresses' | `prop:${string}`;

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Target[]>([]);
  const [merge, setMerge] = useState(true);
  const [fileName, setFileName] = useState('');
  const header = rows?.[0] ?? [];
  const body = rows?.slice(1) ?? [];

  const guess = (h: string): Target => {
    const k = h.trim().toLowerCase();
    if (/^(name|device|hostname|host)$/.test(k)) return 'name';
    if (/^(type|model type|device type|category|kind)$/.test(k)) return 'type';
    if (/^(subtitle|role|description|function)$/.test(k)) return 'subtitle';
    if (/(ip|address)/.test(k)) return 'addresses';
    return k ? `prop:${k.replace(/[^a-z0-9]+/g, '_')}` : 'skip';
  };

  const load = async (f: File) => {
    const text = await f.text();
    const parsed = parseCsv(text);
    setRows(parsed);
    setMapping((parsed[0] ?? []).map(guess));
    setFileName(f.name);
  };

  const findDef = (typeText: string) => {
    const t = typeText.trim().toLowerCase();
    const list = Object.values(s.libDefs).filter((d) => (d.style ?? 'iso') === (s.doc.iconStyle ?? 'iso'));
    return list.find((d) => d.id === t || d.name.toLowerCase() === t) || list.find((d) => d.name.toLowerCase().includes(t) && t.length > 2) || s.libDefs['generic'];
  };

  const run = () => {
    if (!rows) return;
    const nameIdx = mapping.indexOf('name');
    if (nameIdx < 0) return s.toast('Map one column to “Name” first', 'error');
    let created = 0, updated = 0;
    const c = canvasApi.center();
    const cols = Math.ceil(Math.sqrt(body.length));
    s.change((d: DiagramDoc, pg) => {
      const byName = new Map<string, DeviceNode>();
      for (const n of Object.values(pg.nodes)) if (n.kind === 'device') byName.set(n.name.toLowerCase(), n);
      body.forEach((r, i) => {
        const name = (r[nameIdx] ?? '').trim();
        if (!name) return;
        let n = merge ? byName.get(name.toLowerCase()) : undefined;
        if (!n) {
          const typeIdx = mapping.indexOf('type');
          const def = findDef(typeIdx >= 0 ? r[typeIdx] ?? '' : '') ?? Object.values(s.libDefs)[0];
          n = createDevice(def, c.x + (i % cols) * 120 - (cols * 120) / 2, c.y + Math.floor(i / cols) * 110 - 100);
          n.name = name;
          pg.nodes[n.id] = n; pg.order.push(n.id); byName.set(name.toLowerCase(), n);
          created++;
        } else updated++;
        mapping.forEach((t, ci) => {
          const v = (r[ci] ?? '').trim();
          if (t === 'subtitle') n!.subtitle = v || undefined;
          else if (t === 'addresses') { if (v) n!.addresses = parseAddressList(v, d.vlans, n!.addresses); }
          else if (t.startsWith('prop:')) { const key = t.slice(5); if (v) n!.props[key] = v; }
        });
      });
    });
    s.toast(`Imported ${body.length} rows: ${created} created, ${updated} updated`, 'success');
    onClose();
  };

  return (
    <Modal title="Import devices from CSV" onClose={onClose} width={860}
      footer={<>
        <span className="hint">New devices are placed in a grid at the centre of the view; move them into zones afterwards.</span>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!rows} onClick={run}><Upload size={14} /> Import</button>
      </>}
    >
      {!rows ? (
        <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) load(f); }}>
          <p>Drop a <b>.csv</b> file here (comma, semicolon or tab separated, header row), or</p>
          <label className="btn primary">Choose file…<input type="file" accept=".csv,text/csv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} /></label>
          <p className="hint">Typical columns: Name, Type, IP address, Model, Serial, Location. Unmapped columns become device properties.</p>
        </div>
      ) : (
        <>
          <div className="hint" style={{ marginBottom: 8 }}>{fileName}: {body.length} rows. Choose what each column becomes:</div>
          <div className="table-wrap" style={{ maxHeight: '48vh' }}>
            <table className="dev-table">
              <thead>
                <tr>{header.map((h, i) => (
                  <th key={i}>
                    <div className="dim" style={{ marginBottom: 4 }}>{h || `Column ${i + 1}`}</div>
                    <select className="input select" value={mapping[i] ?? 'skip'} onChange={(e) => setMapping(mapping.map((m, j) => (j === i ? (e.target.value as Target) : m)))}>
                      <option value="skip">— skip —</option>
                      <option value="name">Name</option>
                      <option value="type">Device type</option>
                      <option value="subtitle">Subtitle</option>
                      <option value="addresses">IP addresses</option>
                      <option value={`prop:${(h || 'col' + i).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`}>Property “{h || 'col' + i}”</option>
                    </select>
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {body.slice(0, 8).map((r, i) => <tr key={i}>{header.map((_, j) => <td key={j} className="dim">{r[j]}</td>)}</tr>)}
                {body.length > 8 && <tr><td colSpan={header.length} className="dim">… {body.length - 8} more rows</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10 }}><Toggle label="Update existing devices with the same name (otherwise always create new)" checked={merge} onChange={setMerge} /></div>
        </>
      )}
    </Modal>
  );
}
