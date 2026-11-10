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
import { decodeCsv, guessDefId, guessMapping, parseCsv, propKey, splitAddresses, type CsvResult, type Target } from '../model/csv';

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

const TARGET_LABEL: Record<string, string> = { skip: '— skip —', name: 'Name', type: 'Device type', subtitle: 'Subtitle', addresses: 'IP addresses', vlan: 'VLAN (for the addresses)' };

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [csv, setCsv] = useState<(CsvResult & { encoding: string }) | null>(null);
  const [mapping, setMapping] = useState<Target[]>([]);
  const [typeMap, setTypeMap] = useState<Record<string, string>>({});
  const [merge, setMerge] = useState(true);
  const [fileName, setFileName] = useState('');
  const rows = csv?.rows ?? null;
  const header = rows?.[0] ?? [];
  const body = rows?.slice(1) ?? [];
  const style = s.doc.iconStyle ?? 'iso';
  const defsForStyle = useMemo(() => Object.values(s.libDefs).filter((d) => (d.style ?? 'iso') === style).sort((a, b) => a.name.localeCompare(b.name)), [s.libDefs, style]);
  const typeIdx = mapping.indexOf('type');
  const typeValues = useMemo(() => (typeIdx < 0 ? [] : [...new Set(body.map((r) => (r[typeIdx] ?? '').trim()).filter(Boolean))]), [body, typeIdx]);

  const load = async (f: File) => {
    try {
      const { text, encoding } = decodeCsv(await f.arrayBuffer());
      const parsed = parseCsv(text);
      if (parsed.rows.length < 2) throw new Error('The file has no data rows under the header.');
      const m = guessMapping(parsed.rows[0]);
      setCsv({ ...parsed, encoding });
      setMapping(m);
      const ti = m.indexOf('type');
      const values = ti < 0 ? [] : [...new Set(parsed.rows.slice(1).map((r) => (r[ti] ?? '').trim()).filter(Boolean))];
      setTypeMap(Object.fromEntries(values.map((v) => [v, guessDefId(v, defsForStyle) ?? ''])));
      setFileName(f.name);
    } catch (e: any) {
      s.toast(`Could not read ${f.name}: ${e?.message ?? e}`, 'error');
    }
  };

  const setTarget = (i: number, t: Target) => {
    // single-valued targets live on one column only
    const single = t === 'name' || t === 'type' || t === 'subtitle' || t === 'addresses' || t === 'vlan';
    setMapping(mapping.map((m, j) => (j === i ? t : single && m === t ? (`prop:${propKey(header[j] || 'col' + j)}` as Target) : m)));
    if (t === 'type') {
      const values = [...new Set(body.map((r) => (r[i] ?? '').trim()).filter(Boolean))];
      setTypeMap(Object.fromEntries(values.map((v) => [v, typeMap[v] ?? guessDefId(v, defsForStyle) ?? ''])));
    }
  };

  const unmatched = typeValues.filter((v) => !typeMap[v]);

  const run = () => {
    if (!rows) return;
    const nameIdx = mapping.indexOf('name');
    if (nameIdx < 0) return s.toast('Choose which column holds the device names (“Name”) first.', 'error');
    const addrIdx = mapping.indexOf('addresses');
    const vlanIdx = mapping.indexOf('vlan');
    const warnings: string[] = csv!.ragged.map((l) => `line ${l}: ${rows[l - 1].length} cells instead of ${header.length}`);
    let created = 0, updated = 0;
    const c = canvasApi.center();
    const cols = Math.ceil(Math.sqrt(body.length));
    const seenInFile = new Set<string>();
    const missingVlans = new Set<string>();
    s.change((d: DiagramDoc, pg) => {
      // existing devices are matched by name across every page
      const byName = new Map<string, DeviceNode>();
      for (const p of d.pages) for (const n of Object.values(p.nodes)) if (n.kind === 'device' && !byName.has(n.name.toLowerCase())) byName.set(n.name.toLowerCase(), n);
      const findVlan = (v: string) => { const k = v.trim().toLowerCase(); return k ? d.vlans.find((x) => String(x.vlanId) === k || x.name.toLowerCase() === k)?.id : undefined; };
      body.forEach((r, i) => {
        const line = i + 2;
        const name = (r[nameIdx] ?? '').trim();
        if (!name) { warnings.push(`line ${line}: no name, row skipped`); return; }
        if (seenInFile.has(name.toLowerCase())) warnings.push(`line ${line}: “${name}” appears more than once in the file`);
        seenInFile.add(name.toLowerCase());
        let n = merge ? byName.get(name.toLowerCase()) : undefined;
        if (!n) {
          const tv = typeIdx >= 0 ? (r[typeIdx] ?? '').trim() : '';
          const def = s.libDefs[typeMap[tv] || 'generic'] ?? s.libDefs['generic'] ?? defsForStyle[0];
          n = createDevice(def, c.x + (i % cols) * 120 - (cols * 120) / 2, c.y + Math.floor(i / cols) * 110 - 100);
          n.name = name;
          pg.nodes[n.id] = n; pg.order.push(n.id); byName.set(name.toLowerCase(), n);
          created++;
        } else updated++;
        const node = n;
        mapping.forEach((t, ci) => {
          const v = (r[ci] ?? '').trim();
          if (t === 'subtitle') node.subtitle = v || undefined;
          else if (t.startsWith('prop:')) { const key = t.slice(5); if (v) node.props[key] = v; }
        });
        if (addrIdx >= 0) {
          const v = (r[addrIdx] ?? '').trim();
          const { ips, other } = splitAddresses(v);
          const notes = other.filter((o) => /^dhcp/i.test(o));
          const bad = other.filter((o) => !/^dhcp/i.test(o));
          if (bad.length) warnings.push(`line ${line}: “${bad.join(' ')}” in the IP column is not an IP address and was not imported`);
          const vlan = vlanIdx >= 0 ? findVlan(r[vlanIdx] ?? '') : undefined;
          if (vlanIdx >= 0 && (r[vlanIdx] ?? '').trim() && !vlan) missingVlans.add((r[vlanIdx] ?? '').trim());
          if (ips.length || notes.length) {
            node.addresses = parseAddressList([...ips, ...notes].join(', '), d.vlans, node.addresses).map((a) => (vlan && !a.vlan ? { ...a, vlan } : a));
          }
        }
      });
    });
    if (missingVlans.size) warnings.unshift(`VLAN${missingVlans.size > 1 ? 's' : ''} ${[...missingVlans].join(', ')} not in the VLAN registry: add ${missingVlans.size > 1 ? 'them' : 'it'} under Manage VLANs, then import again with “Update devices that already exist”`);
    if (warnings.length) {
      console.warn('CSV import warnings:\n' + warnings.join('\n'));
      s.toast(`Imported ${created + updated} devices (${created} new, ${updated} updated) with ${warnings.length} warning${warnings.length > 1 ? 's' : ''}: ${warnings[0]}${warnings.length > 1 ? ' …' : ''}`, 'info');
    } else s.toast(`Imported ${created + updated} devices: ${created} new, ${updated} updated`, 'success');
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
          <p>Drop a <b>.csv</b> file here (comma, semicolon or tab separated, with a header row), or</p>
          <label className="btn primary">Choose file…<input type="file" accept=".csv,text/csv,.txt,.tsv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} /></label>
          <p className="hint">Typical columns: Name, Type, IP address, VLAN, Model, Serial, MAC, Location. Unmapped columns become device properties.</p>
        </div>
      ) : (
        <>
          <div className="hint" style={{ marginBottom: 8 }}>
            {fileName}: {body.length} rows · separator {csv!.delimiter === '\t' ? 'tab' : `“${csv!.delimiter}”`} · {csv!.encoding}. Choose what each column becomes:
          </div>
          {csv!.ragged.length > 0 && (
            <div className="import-warn">
              {csv!.ragged.length} row{csv!.ragged.length > 1 ? 's have' : ' has'} a different number of cells than the header (line{csv!.ragged.length > 1 ? 's' : ''} {csv!.ragged.slice(0, 8).join(', ')}{csv!.ragged.length > 8 ? '…' : ''}). Check the separator or quotes in the file.
            </div>
          )}
          <div className="table-wrap" style={{ maxHeight: '40vh' }}>
            <table className="dev-table">
              <thead>
                <tr>{header.map((h, i) => (
                  <th key={i}>
                    <div className="dim" style={{ marginBottom: 4 }}>{h || `Column ${i + 1}`}</div>
                    <select className="input select" aria-label={`Column ${h || i + 1} becomes`} value={mapping[i] ?? 'skip'} onChange={(e) => setTarget(i, e.target.value as Target)}>
                      {(['skip', 'name', 'type', 'subtitle', 'addresses', 'vlan'] as const).map((t) => <option key={t} value={t}>{TARGET_LABEL[t]}</option>)}
                      <option value={`prop:${propKey(h || 'col' + i)}`}>Property “{h || 'col' + i}”</option>
                      {mapping[i]?.startsWith('prop:') && mapping[i] !== `prop:${propKey(h || 'col' + i)}` && <option value={mapping[i]}>Property “{mapping[i].slice(5)}”</option>}
                    </select>
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {body.slice(0, 6).map((r, i) => <tr key={i}>{header.map((_, j) => <td key={j} className="dim">{r[j]}</td>)}</tr>)}
                {body.length > 6 && <tr><td colSpan={header.length} className="dim">… {body.length - 6} more rows</td></tr>}
              </tbody>
            </table>
          </div>
          {typeIdx >= 0 && typeValues.length > 0 && (
            <div className="import-types">
              <div className="hint" style={{ margin: '12px 0 6px' }}>
                Device types in “{header[typeIdx]}”: choose the library device for each value.{unmatched.length ? ` ${unmatched.length} not recognised yet; they become Generic devices unless you choose.` : ''}
              </div>
              <div className="import-type-grid">
                {typeValues.map((v) => (
                  <label key={v} className={'import-type' + (typeMap[v] ? '' : ' unmatched')}>
                    <span className="ellipsis" title={v}>{v}</span>
                    <select className="input select" value={typeMap[v] ?? ''} onChange={(e) => setTypeMap({ ...typeMap, [v]: e.target.value })}>
                      <option value="">Generic device</option>
                      {defsForStyle.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: 10 }}><Toggle label="Update devices that already exist with the same name (on any page); otherwise always create new ones" checked={merge} onChange={setMerge} /></div>
        </>
      )}
    </Modal>
  );
}
