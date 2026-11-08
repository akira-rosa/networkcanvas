import React, { useMemo } from 'react';
import {
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Plus, Trash2,
  ArrowLeftRight, PenTool, FlipHorizontal2, X, Wand2,
} from 'lucide-react';
import { useStore, usePage, defIdOverride } from '../store/store';
import type { CalloutNode, DeviceNode, DiagramNode, ImageNode, Link, LinkMedia, Page, TextNode, TitleBlockNode, Vlan, ZoneNode, RectNode, LegendNode, VlanTableNode } from '../model/types';
import { Section, Row, TextInput, NumInput, Select, Toggle, ColorInput, IconButton, TextArea, GestureContext } from '../ui/controls';
import { DefThumb } from '../render/ShapeView';
import { portUsage } from '../model/geometry';
import { uid, pickFile, readFileDataUrl } from '../model/util';
import { MEDIA_COLORS } from '../render/theme';
import { nodeLabel } from './LeftPanel';
import { runChecks, nextFreeIp, type Issue } from '../model/checks';
import { vlanForIp } from './DeviceTable';
import { canvasApi } from '../canvas/api';

const NO_LAYERS: import('../model/types').Layer[] = [];

type Upd<T> = (fn: (n: T) => void) => void;

export function Inspector() {
  const page = usePage();
  const selection = useStore((s) => s.selection);
  const nodes = selection.map((id) => page.nodes[id]).filter(Boolean) as DiagramNode[];
  const links = selection.map((id) => page.links[id]).filter(Boolean) as Link[];
  let body: React.ReactNode;
  if (nodes.length === 1 && !links.length) body = <NodeInspector n={nodes[0]} />;
  else if (links.length === 1 && !nodes.length) body = <LinkInspector l={links[0]} page={page} />;
  else if (nodes.length + links.length > 1) body = <MultiInspector nodes={nodes} links={links} />;
  else body = <DocInspector />;
  const gesture = useMemo(() => { const st = useStore.getState(); return { begin: st.beginGesture, end: st.endGesture }; }, []);
  return <aside className="right-panel"><GestureContext.Provider value={gesture}>{body}</GestureContext.Provider></aside>;
}

function useNodeUpdate<T extends DiagramNode>(id: string): Upd<T> {
  const change = useStore((s) => s.change);
  return (fn) => change((_d, pg) => { const n = pg.nodes[id]; if (n) fn(n as T); });
}

function Geometry({ n, wh = true }: { n: DiagramNode; wh?: boolean }) {
  const upd = useNodeUpdate<DiagramNode>(n.id);
  const pages = useStore((s) => s.doc.pages);
  const pageId = useStore((s) => s.pageId);
  const layers = useStore((s) => s.doc.layers) ?? NO_LAYERS;
  return (
    <Section title="Layout">
      <Row>
        <NumInput label="X" value={n.x} onChange={(v) => upd((m) => { m.x = v; })} />
        <NumInput label="Y" value={n.y} onChange={(v) => upd((m) => { m.y = v; })} />
      </Row>
      {wh && (
        <Row>
          <NumInput label="W" value={n.w} min={4} onChange={(v) => upd((m) => {
            if (m.kind === 'device' && m.w) { const r = m.h / m.w; m.w = v; m.h = v * r; } else m.w = v;
          })} />
          <NumInput label="H" value={n.h} min={4} onChange={(v) => upd((m) => {
            if (m.kind === 'device' && m.h) { const r = m.w / m.h; m.h = v; m.w = v * r; } else m.h = v;
          })} />
        </Row>
      )}
      <Row>
        <Toggle label="Locked" checked={!!n.locked} onChange={(v) => upd((m) => { m.locked = v; })} />
        <Toggle label="Hidden" checked={!!n.hidden} onChange={(v) => upd((m) => { m.hidden = v; })} />
      </Row>
      <Row label="Layer">
        <select className="input select" value={n.layerId ?? ''} onChange={(e) => upd((m) => { m.layerId = e.target.value || undefined; })} onKeyDown={(e) => e.stopPropagation()}>
          <option value="">Default layer</option>
          {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Row>
      {n.kind !== 'titleBlock' && n.kind !== 'legend' && n.kind !== 'vlanTable' && (
        <Row label="Opens page">
          <select className="input select" value={n.pageLink ?? ''} onChange={(e) => upd((m) => { m.pageLink = e.target.value || undefined; })} onKeyDown={(e) => e.stopPropagation()}>
            <option value="">— none —</option>
            {pages.filter((p) => p.id !== pageId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
      )}
      {n.groupId && (
        <Row label="Group">
          <span className="hint grow">Member of a group</span>
          <button className="btn ghost xs" onClick={() => useStore.getState().ungroup()}>Ungroup</button>
        </Row>
      )}
    </Section>
  );
}

function NodeInspector({ n }: { n: DiagramNode }) {
  switch (n.kind) {
    case 'device': return <DeviceInspector n={n} />;
    case 'zone': return <ZoneInspector n={n} />;
    case 'text': return <TextInspector n={n} />;
    case 'rect': return <RectInspector n={n} />;
    case 'legend': return <BlockInspector n={n} />;
    case 'vlanTable': return <BlockInspector n={n} />;
    case 'image': return <ImageInspector n={n} />;
    case 'callout': return <CalloutInspector n={n} />;
    case 'titleBlock': return <TitleBlockInspector n={n} />;
  }
}

function ImageInspector({ n }: { n: ImageNode }) {
  const upd = useNodeUpdate<ImageNode>(n.id);
  return (
    <>
      <Section title="Image">
        <Row><NumInput label="Opacity" value={Math.round((n.opacity ?? 1) * 100)} min={0} max={100} precision={0} suffix="%" onChange={(v) => upd((m) => { m.opacity = v >= 100 ? undefined : v / 100; })} /></Row>
        <button className="btn sm" onClick={async () => { const f = await pickFile('image/*,.svg'); if (!f) return; const href = await readFileDataUrl(f); upd((m) => { m.href = href; }); }}>Replace image…</button>
        <div className="hint">Logos and photos; the image keeps its proportions inside the box.</div>
      </Section>
      <Geometry n={n} />
    </>
  );
}

function CalloutInspector({ n }: { n: CalloutNode }) {
  const upd = useNodeUpdate<CalloutNode>(n.id);
  const page = usePage();
  const vlans = useStore((s) => s.doc.vlans);
  const candidates = page.order.map((id) => page.nodes[id]).filter((x) => x && x.id !== n.id && (x.kind === 'device' || x.kind === 'zone' || x.kind === 'text'));
  return (
    <>
      <Section title="Callout">
        <TextArea value={n.text} rows={3} onChange={(v) => upd((m) => { m.text = v; })} />
        <div className="hint">Placeholders from the attached device: <code>{'{name}'}</code> <code>{'{type}'}</code> <code>{'{ip}'}</code> <code>{'{addresses}'}</code> <code>{'{subtitle}'}</code> <code>{'{prop:model}'}</code></div>
        <Row label="Attach to">
          <select className="input select" value={n.anchor ?? ''} onChange={(e) => upd((m) => { m.anchor = e.target.value || undefined; })} onKeyDown={(e) => e.stopPropagation()}>
            <option value="">— nothing —</option>
            {candidates.map((c) => <option key={c.id} value={c.id}>{nodeLabel(c, vlans)}</option>)}
          </select>
        </Row>
        <Row><NumInput label="Size" value={n.fontSize} min={6} max={40} onChange={(v) => upd((m) => { m.fontSize = v; })} /></Row>
        <Row label="Fill"><ColorInput value={n.fill} allowNone onChange={(v) => upd((m) => { m.fill = v; })} /></Row>
        <Row label="Text"><ColorInput value={n.color} allowNone onChange={(v) => upd((m) => { m.color = v; })} /></Row>
      </Section>
      <Geometry n={n} />
    </>
  );
}

function TitleBlockInspector({ n }: { n: TitleBlockNode }) {
  const upd = useNodeUpdate<TitleBlockNode>(n.id);
  const s = useStore();
  const meta = s.doc.meta ?? {};
  const setMeta = (k: keyof NonNullable<typeof s.doc.meta>, v: string) => s.change((d) => { (d.meta ??= {})[k] = v || undefined; });
  return (
    <>
      <Section title="Title block">
        <div className="hint">Filled from the document: name, page, author, company, version, date and classification.</div>
        <Row label="Author"><TextInput value={meta.author ?? ''} onChange={(v) => setMeta('author', v)} /></Row>
        <Row label="Company"><TextInput value={meta.company ?? ''} onChange={(v) => setMeta('company', v)} /></Row>
        <Row label="Version"><TextInput value={meta.version ?? ''} placeholder="e.g. 2.0" onChange={(v) => setMeta('version', v)} /></Row>
        <Row label="Class."><TextInput value={meta.classification ?? ''} placeholder="Internal / Confidential" onChange={(v) => setMeta('classification', v)} /></Row>
        <Row><Toggle label="Show page name" checked={n.showPage} onChange={(v) => upd((m) => { m.showPage = v; })} /></Row>
        <Row><Toggle label="Show date (last change)" checked={n.showDate} onChange={(v) => upd((m) => { m.showDate = v; })} /></Row>
      </Section>
      <Geometry n={n} />
    </>
  );
}

function VlanSelect({ value, onChange, vlans, allowNone = true, allowStatus = true }: { value?: string; onChange: (v: string | undefined) => void; vlans: Vlan[]; allowNone?: boolean; allowStatus?: boolean }) {
  const v = vlans.find((x) => x.id === value);
  return (
    <div className="vlan-select">
      <span className="dot" style={{ background: value === 'error' ? '#e5484d' : v?.color ?? 'transparent', borderColor: v || value === 'error' ? 'transparent' : undefined }} />
      <select className="input select" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} onKeyDown={(e) => e.stopPropagation()}>
        {allowNone && <option value="">No VLAN</option>}
        {vlans.map((x) => <option key={x.id} value={x.id}>VLAN {x.vlanId} · {x.name}</option>)}
        {allowStatus && <option value="error">Status: alert (red)</option>}
      </select>
    </div>
  );
}

function DeviceInspector({ n }: { n: DeviceNode }) {
  const upd = useNodeUpdate<DeviceNode>(n.id);
  const defs = useStore((s) => s.defs);
  const vlans = useStore((s) => s.doc.vlans);
  const openEditor = useStore((s) => s.openEditor);
  const setDeviceStyle = useStore((s) => s.setDeviceStyle);
  const docStyle = useStore((s) => s.doc.iconStyle ?? 'iso');
  const page = usePage();
  const def = defs[n.defId];
  const prefixFor = (vid?: string) => {
    const v = vlans.find((x) => x.id === vid);
    const m = v?.subnet.match(/^(\d+\.\d+\.\d+)\./);
    return m ? m[1] + '.' : '';
  };
  const customKeys = Object.keys(n.props).filter((k) => !def?.fields.some((f) => f.key === k));
  return (
    <>
      <div className="insp-head">
        {def && <DefThumb def={def} size={34} accent={n.accent} />}
        <div className="grow">
          <div className="insp-title">{n.name || 'Device'}</div>
          <div className="insp-sub">{def?.name ?? 'Missing definition'} · {def?.category}</div>
        </div>
        {def && <IconButton title="Edit device definition" onClick={() => openEditor(def)}><PenTool size={15} /></IconButton>}
      </div>
      <Section title="Identity">
        <Row label="Name"><TextInput value={n.name} onChange={(v) => upd((m) => { m.name = v; })} /></Row>
        <Row label="Subtitle"><TextInput value={n.subtitle ?? ''} placeholder="e.g. Main Server System" onChange={(v) => upd((m) => { m.subtitle = v || undefined; })} /></Row>
      </Section>
      <Section
        title="Addresses"
        actions={<IconButton title="Add address" onClick={() => upd((m) => { m.addresses.push({ id: uid('a'), vlan: m.addresses.at(-1)?.vlan, value: prefixFor(m.addresses.at(-1)?.vlan) }); })}><Plus size={14} /></IconButton>}
      >
        {n.addresses.length === 0 && <div className="hint">No addresses. Add IPs per VLAN — each gets the VLAN’s colour dot.</div>}
        {n.addresses.map((a, i) => (
          <div key={a.id} className="addr-row">
            <VlanSelect vlans={vlans} value={a.vlan} onChange={(v) => upd((m) => {
              const ad = m.addresses[i];
              const prevPrefix = prefixFor(ad.vlan);
              ad.vlan = v;
              if (!ad.value || ad.value === prevPrefix) ad.value = prefixFor(v);
            })} />
            <TextInput value={a.value} mono placeholder="192.168.0.1" onChange={(v) => upd((m) => { m.addresses[i].value = v; if (!m.addresses[i].vlan) m.addresses[i].vlan = vlanForIp(v, vlans); })} />
            <button className="icon-btn xs" title="Next free address in this VLAN" disabled={!vlans.find((x) => x.id === a.vlan)} onClick={() => {
              const v = vlans.find((x) => x.id === a.vlan); const ip = v && nextFreeIp(useStore.getState().doc, v);
              if (ip) upd((m) => { m.addresses[i].value = ip; }); else useStore.getState().toast('No free address found in this VLAN', 'error');
            }}><Wand2 size={12} /></button>
            <button className="icon-btn xs" title="Remove" onClick={() => upd((m) => { m.addresses.splice(i, 1); })}><X size={12} /></button>
          </div>
        ))}
      </Section>
      <Section title="Appearance">
        <Row label="Label">
          <Select value={n.labelPos} onChange={(v) => upd((m) => { m.labelPos = v; })} options={[
            { value: 'bottom', label: 'Below' }, { value: 'top', label: 'Above' }, { value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }, { value: 'none', label: 'Hidden' },
          ]} />
          <IconButton title="Flip horizontally" active={n.flipX} onClick={() => upd((m) => { m.flipX = !m.flipX; })}><FlipHorizontal2 size={15} /></IconButton>
        </Row>
        <Row label="Style">
          <Select value={defIdOverride(n.defId) ?? 'auto'} onChange={(v) => setDeviceStyle([n.id], v)} options={[
            { value: 'auto', label: `Follow diagram (${docStyle === 'iso' ? 'isometric' : 'detailed'})` }, { value: 'iso', label: 'Isometric' }, { value: 'detailed', label: 'Detailed' },
          ]} />
        </Row>
        <Row label="Accent">
          <ColorInput value={n.accent} allowNone onChange={(v) => upd((m) => { m.accent = v; })} />
        </Row>
      </Section>
      <Geometry n={n} />
      {def && (
        <Section title="Properties" actions={<IconButton title="Add custom property" onClick={() => {
          const k = prompt('Property name');
          if (k) upd((m) => { m.props[k] = ''; });
        }}><Plus size={14} /></IconButton>}>
          {def.fields.map((f) => (
            <Row key={f.key} label={f.label}><TextInput value={n.props[f.key] ?? ''} placeholder={f.default} onChange={(v) => upd((m) => { m.props[f.key] = v; })} /></Row>
          ))}
          {customKeys.map((k) => (
            <Row key={k} label={k}>
              <TextInput value={n.props[k]} onChange={(v) => upd((m) => { m.props[k] = v; })} />
              <button className="icon-btn xs" onClick={() => upd((m) => { delete m.props[k]; })}><X size={12} /></button>
            </Row>
          ))}
        </Section>
      )}
      {def && def.ports.length > 0 && (
        <Section title={`Ports (${def.ports.length})`} collapsible>
          <div className="port-list">
            {def.ports.map((p) => {
              const used = portUsage(page, n.id, p.id);
              const peers = Object.values(page.links).filter((l) => (l.from.node === n.id && l.from.port === p.id) || (l.to.node === n.id && l.to.port === p.id))
                .map((l) => { const other = l.from.node === n.id ? l.to : l.from; const on = page.nodes[other.node]; return on ? nodeLabel(on, vlans) : '?'; });
              return (
                <div key={p.id} className="port-row" title={p.description}>
                  <span className="port-dot" style={{ borderColor: MEDIA_COLORS[p.media], background: used ? MEDIA_COLORS[p.media] : 'transparent' }} />
                  <span className="port-name">{p.name}</span>
                  <span className="port-media">{p.media}</span>
                  <span className="grow ellipsis port-peer">{peers.length ? '→ ' + peers.join(', ') : 'free'}</span>
                  <span className="count">{used}/{p.maxLinks || '∞'}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}

function ZoneInspector({ n }: { n: ZoneNode }) {
  const upd = useNodeUpdate<ZoneNode>(n.id);
  const vlans = useStore((s) => s.doc.vlans);
  const set = useStore((s) => s.set);
  const v = vlans.find((x) => x.id === n.vlan);
  return (
    <>
      <div className="insp-head"><div className="grow"><div className="insp-title">Zone</div><div className="insp-sub">Drag to move everything inside · Alt-drag moves the zone alone</div></div></div>
      <Section title="Zone">
        <Row label="VLAN">
          <VlanSelect vlans={vlans} allowStatus={false} value={n.vlan} onChange={(val) => upd((m) => { m.vlan = val; if (val) m.tag = undefined; })} />
        </Row>
        <Row label="Title"><TextInput value={n.title} placeholder={v ? `VLAN ${v.vlanId}` : 'Zone title'} onChange={(val) => upd((m) => { m.title = val; })} /></Row>
        <Row label="Tag"><TextInput value={n.tag ?? ''} placeholder={v?.subnet ?? 'e.g. 10.0.0.0/24'} onChange={(val) => upd((m) => { m.tag = val || undefined; })} /></Row>
        <Row label="Header">
          <Select value={n.titleAlign} onChange={(val) => upd((m) => { m.titleAlign = val; })} options={[{ value: 'left', label: 'Tag left' }, { value: 'right', label: 'Tag right' }]} />
        </Row>
        {!v && <Row label="Colour"><ColorInput value={n.color} onChange={(val) => upd((m) => { m.color = val; })} /></Row>}
        <Row label="Fill"><ColorInput value={n.fill} allowNone onChange={(val) => upd((m) => { m.fill = val; })} /></Row>
        <Row>
          <Toggle label="Coloured border" checked={!!n.border} onChange={(val) => upd((m) => { m.border = val; })} />
        </Row>
        <Row><NumInput label="Radius" value={n.radius} min={0} onChange={(val) => upd((m) => { m.radius = val; })} /></Row>
        <button className="btn ghost sm" onClick={() => set({ modal: 'vlans' })}>Manage VLANs…</button>
      </Section>
      <Geometry n={n} />
    </>
  );
}

function TextInspector({ n }: { n: TextNode }) {
  const upd = useNodeUpdate<TextNode>(n.id);
  return (
    <>
      <Section title="Text">
        <TextArea value={n.text} onChange={(v) => upd((m) => { m.text = v; m.h = v.split('\n').length * m.fontSize * 1.3 + 4; })} />
        <Row>
          <NumInput label="Size" value={n.fontSize} min={6} max={200} onChange={(v) => upd((m) => { m.fontSize = v; m.h = m.text.split('\n').length * v * 1.3 + 4; })} />
          <Select value={n.align} onChange={(v) => upd((m) => { m.align = v; })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
        </Row>
        <Row>
          <Toggle label="Bold" checked={!!n.bold} onChange={(v) => upd((m) => { m.bold = v; })} />
          <Toggle label="Italic" checked={!!n.italic} onChange={(v) => upd((m) => { m.italic = v; })} />
        </Row>
        <Row label="Colour"><ColorInput value={n.color} allowNone onChange={(v) => upd((m) => { m.color = v; })} /></Row>
      </Section>
      <Geometry n={n} />
    </>
  );
}

function RectInspector({ n }: { n: RectNode }) {
  const upd = useNodeUpdate<RectNode>(n.id);
  return (
    <>
      <Section title="Box">
        <Row label="Stroke"><ColorInput value={n.stroke} allowNone onChange={(v) => upd((m) => { m.stroke = v; })} /></Row>
        <Row label="Fill"><ColorInput value={n.fill} allowNone onChange={(v) => upd((m) => { m.fill = v; })} /></Row>
        <Row>
          <NumInput label="Width" value={n.strokeWidth} min={0} step={0.5} onChange={(v) => upd((m) => { m.strokeWidth = v; })} />
          <NumInput label="Radius" value={n.radius} min={0} onChange={(v) => upd((m) => { m.radius = v; })} />
        </Row>
        <Row><Toggle label="Dashed" checked={!!n.dash} onChange={(v) => upd((m) => { m.dash = v; })} /></Row>
      </Section>
      <Geometry n={n} />
    </>
  );
}

function BlockInspector({ n }: { n: LegendNode | VlanTableNode }) {
  const upd = useNodeUpdate<LegendNode | VlanTableNode>(n.id);
  const set = useStore((s) => s.set);
  return (
    <>
      <Section title={n.kind === 'legend' ? 'Legend' : 'VLAN table'}>
        <Row label="Title"><TextInput value={n.title} onChange={(v) => upd((m) => { m.title = v; })} /></Row>
        {n.kind === 'legend' && (
          <Row><NumInput label="Columns" value={n.columns} min={1} max={12} onChange={(v) => upd((m) => { (m as LegendNode).columns = Math.round(v); })} /></Row>
        )}
        <div className="hint">
          {n.kind === 'legend' ? 'Updates automatically with the device types used on this page.' : 'Shows the document’s VLAN registry.'}
        </div>
        {n.kind === 'vlanTable' && <button className="btn ghost sm" onClick={() => set({ modal: 'vlans' })}>Manage VLANs…</button>}
      </Section>
      <Geometry n={n} wh={false} />
    </>
  );
}

const LINK_MEDIA: { value: LinkMedia; label: string }[] = [
  { value: 'ethernet', label: 'Ethernet (copper)' }, { value: 'fiber', label: 'Fiber' }, { value: 'wireless', label: 'Wireless' },
  { value: 'wan', label: 'WAN / ISP' }, { value: 'vpn', label: 'VPN tunnel' }, { value: 'profinet', label: 'PROFINET' },
  { value: 'iolink', label: 'IO-Link' }, { value: 'serial', label: 'Serial / console' }, { value: 'logical', label: 'Logical' },
];

function PortSelect({ page, ep, onChange, linkId }: { page: Page; ep: Link['from']; onChange: (p?: string) => void; linkId: string }) {
  const defs = useStore((s) => s.defs);
  const n = page.nodes[ep.node];
  if (n?.kind !== 'device') return null;
  const def = defs[n.defId];
  if (!def?.ports.length) return <span className="hint">no ports defined</span>;
  return (
    <select className="input select" value={ep.port ?? ''} onChange={(e) => onChange(e.target.value || undefined)} onKeyDown={(e) => e.stopPropagation()}>
      <option value="">(edge / floating)</option>
      {def.ports.map((p) => {
        const used = portUsage(page, n.id, p.id, linkId);
        const full = p.maxLinks > 0 && used >= p.maxLinks;
        return <option key={p.id} value={p.id} disabled={full && p.id !== ep.port}>{p.name} · {p.media}{full ? ' (in use)' : ''}</option>;
      })}
    </select>
  );
}

function LinkInspector({ l, page }: { l: Link; page: Page }) {
  const change = useStore((s) => s.change);
  const vlans = useStore((s) => s.doc.vlans);
  const upd = (fn: (m: Link) => void) => change((_d, pg) => { const m = pg.links[l.id]; if (m) fn(m); });
  const a = page.nodes[l.from.node], b = page.nodes[l.to.node];
  return (
    <>
      <div className="insp-head">
        <div className="grow">
          <div className="insp-title">Link</div>
          <div className="insp-sub">{a ? nodeLabel(a, vlans) : '?'} → {b ? nodeLabel(b, vlans) : '?'}</div>
        </div>
        <IconButton title="Reverse direction" onClick={() => upd((m) => { const f = m.from; m.from = m.to; m.to = f; const fl = m.fromLabel; m.fromLabel = m.toLabel; m.toLabel = fl; })}><ArrowLeftRight size={15} /></IconButton>
      </div>
      <Section title="Endpoints">
        <Row label={a ? nodeLabel(a, vlans) : 'From'}><PortSelect page={page} ep={l.from} linkId={l.id} onChange={(p) => upd((m) => { m.from.port = p; })} /></Row>
        <Row label={b ? nodeLabel(b, vlans) : 'To'}><PortSelect page={page} ep={l.to} linkId={l.id} onChange={(p) => upd((m) => { m.to.port = p; })} /></Row>
      </Section>
      <Section title="Link">
        <Row label="Media">
          <Select value={l.media} options={LINK_MEDIA} onChange={(v) => upd((m) => {
            m.media = v;
            if (v === 'wireless' || v === 'vpn') m.dash = 'dashed';
            else if (v === 'logical') m.dash = 'dotted';
          })} />
        </Row>
        <Row label="Routing">
          <Select value={l.routing} onChange={(v) => upd((m) => { m.routing = v; })} options={[{ value: 'straight', label: 'Straight' }, { value: 'orthogonal', label: 'Orthogonal' }, { value: 'curved', label: 'Curved' }]} />
        </Row>
        {l.routing === 'straight' && (
          <Row>
            <span className="hint grow">{l.waypoints?.length ? `${l.waypoints.length} bend point${l.waypoints.length > 1 ? 's' : ''}` : 'Drag the dashed midpoint handle to add a bend point'}</span>
            {!!l.waypoints?.length && <button className="btn ghost xs" onClick={() => upd((m) => { m.waypoints = undefined; })}>Clear</button>}
          </Row>
        )}
        <Row label="Line">
          <Select value={l.dash} onChange={(v) => upd((m) => { m.dash = v; })} options={[{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }]} />
          <NumInput label="W" value={l.width} min={0.5} max={12} step={0.2} onChange={(v) => upd((m) => { m.width = v; })} />
        </Row>
        <Row label="Colour"><ColorInput value={l.color} allowNone onChange={(v) => upd((m) => { m.color = v; })} /></Row>
        <Row>
          <Toggle label="Arrow at start" checked={l.arrowStart} onChange={(v) => upd((m) => { m.arrowStart = v; })} />
        </Row>
        <Row>
          <Toggle label="Arrow at end" checked={l.arrowEnd} onChange={(v) => upd((m) => { m.arrowEnd = v; })} />
        </Row>
      </Section>
      <Section title="Labels">
        <Row label="Centre"><TextInput value={l.label ?? ''} placeholder="e.g. WAN, 10G, VPN" onChange={(v) => upd((m) => { m.label = v || undefined; })} /></Row>
        <Row><Toggle label="Show port labels" checked={l.showPortLabels} onChange={(v) => upd((m) => { m.showPortLabels = v; })} /></Row>
        <Row label="Start"><TextInput value={l.fromLabel ?? ''} placeholder="port name" onChange={(v) => upd((m) => { m.fromLabel = v === '' ? undefined : v; })} /></Row>
        <Row label="End"><TextInput value={l.toLabel ?? ''} placeholder="port name" onChange={(v) => upd((m) => { m.toLabel = v === '' ? undefined : v; })} /></Row>
      </Section>
      <Section title="Documentation">
        <Row label="Speed"><TextInput value={l.speed ?? ''} placeholder="e.g. 1G, 10G, 100M" onChange={(v) => upd((m) => { m.speed = v || undefined; })} /></Row>
        <Row label="VLANs"><TextInput value={l.vlans ?? ''} placeholder="e.g. trunk 2,50,150 · access 150" onChange={(v) => upd((m) => { m.vlans = v || undefined; })} /></Row>
        <Row label="Cable ID"><TextInput value={l.cableId ?? ''} placeholder="e.g. C-0042" mono onChange={(v) => upd((m) => { m.cableId = v || undefined; })} /></Row>
        <Row label="Notes"><TextInput value={l.notes ?? ''} onChange={(v) => upd((m) => { m.notes = v || undefined; })} /></Row>
        <Row><Toggle label="Show speed / VLANs on the line" checked={l.showMeta !== false} onChange={(v) => upd((m) => { m.showMeta = v ? undefined : false; })} /></Row>
        <div className="hint">These appear in the cable schedule export (File › Export cable schedule).</div>
      </Section>
    </>
  );
}

function MultiInspector({ nodes, links }: { nodes: DiagramNode[]; links: Link[] }) {
  const s = useStore.getState();
  const change = useStore((st) => st.change);
  const devices = nodes.filter((n) => n.kind === 'device') as DeviceNode[];
  return (
    <>
      <div className="insp-head"><div className="grow"><div className="insp-title">{nodes.length + links.length} selected</div>
        <div className="insp-sub">{nodes.length} objects · {links.length} links</div></div>
        <IconButton title="Delete" onClick={s.deleteSelection}><Trash2 size={15} /></IconButton>
      </div>
      {nodes.length > 1 && (
        <Section title="Align & distribute">
          <div className="align-grid">
            <IconButton title="Align left" onClick={() => s.align('left')}><AlignHorizontalJustifyStart size={16} /></IconButton>
            <IconButton title="Align centre" onClick={() => s.align('hcenter')}><AlignHorizontalJustifyCenter size={16} /></IconButton>
            <IconButton title="Align right" onClick={() => s.align('right')}><AlignHorizontalJustifyEnd size={16} /></IconButton>
            <IconButton title="Align top" onClick={() => s.align('top')}><AlignVerticalJustifyStart size={16} /></IconButton>
            <IconButton title="Align middle" onClick={() => s.align('vcenter')}><AlignVerticalJustifyCenter size={16} /></IconButton>
            <IconButton title="Align bottom" onClick={() => s.align('bottom')}><AlignVerticalJustifyEnd size={16} /></IconButton>
            <IconButton title="Distribute horizontally" disabled={nodes.length < 3} onClick={() => s.align('hdist')}><AlignHorizontalSpaceAround size={16} /></IconButton>
            <IconButton title="Distribute vertically" disabled={nodes.length < 3} onClick={() => s.align('vdist')}><AlignVerticalSpaceAround size={16} /></IconButton>
          </div>
        </Section>
      )}
      {devices.length > 1 && (
        <Section title={`Devices (${devices.length})`}>
          <Row label="Label">
            <Select value={devices[0].labelPos} onChange={(v) => change((_d, pg) => devices.forEach((d) => { (pg.nodes[d.id] as DeviceNode).labelPos = v; }))} options={[
              { value: 'bottom', label: 'Below' }, { value: 'top', label: 'Above' }, { value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }, { value: 'none', label: 'Hidden' },
            ]} />
          </Row>
          <Row label="Accent"><ColorInput value={devices[0].accent} allowNone onChange={(v) => change((_d, pg) => devices.forEach((d) => { (pg.nodes[d.id] as DeviceNode).accent = v; }))} /></Row>
          <Row label="Style">
            <Select value={defIdOverride(devices[0].defId) ?? 'auto'} onChange={(v) => s.setDeviceStyle(devices.map((d) => d.id), v)} options={[
              { value: 'auto', label: 'Follow diagram' }, { value: 'iso', label: 'Isometric' }, { value: 'detailed', label: 'Detailed' },
            ]} />
          </Row>
        </Section>
      )}
      {links.length > 0 && (
        <Section title={`Links (${links.length})`}>
          <Row label="Routing">
            <Select value={links[0].routing} onChange={(v) => change((_d, pg) => links.forEach((l) => { pg.links[l.id].routing = v; }))} options={[{ value: 'straight', label: 'Straight' }, { value: 'orthogonal', label: 'Orthogonal' }, { value: 'curved', label: 'Curved' }]} />
          </Row>
          <Row label="Line">
            <Select value={links[0].dash} onChange={(v) => change((_d, pg) => links.forEach((l) => { pg.links[l.id].dash = v; }))} options={[{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }]} />
          </Row>
          <Row label="Colour"><ColorInput value={links[0].color} allowNone onChange={(v) => change((_d, pg) => links.forEach((l) => { pg.links[l.id].color = v; }))} /></Row>
        </Section>
      )}
    </>
  );
}

const SEV_COLOR: Record<string, string> = { error: '#e5484d', warning: '#f5a524', info: '#8b95a5' };

function ChecksSection() {
  const doc = useStore((s) => s.doc);
  const defs = useStore((s) => s.defs);
  const issues = React.useMemo(() => runChecks(doc, defs), [doc, defs]);
  const [showInfo, setShowInfo] = React.useState(false);
  const counts = { error: 0, warning: 0, info: 0 } as Record<string, number>;
  issues.forEach((i) => counts[i.severity]++);
  const shown = issues.filter((i) => showInfo || i.severity !== 'info');
  const go = (i: Issue) => {
    const s = useStore.getState();
    if (i.pageId !== s.pageId) s.setPage(i.pageId);
    s.select(i.targets);
    setTimeout(() => canvasApi.reveal(i.targets), 30);
  };
  return (
    <Section title="Checks" actions={<button className="btn ghost xs" onClick={() => setShowInfo(!showInfo)}>{showInfo ? 'Hide info' : `Show info (${counts.info})`}</button>}>
      <div className="check-counts">
        <span style={{ color: SEV_COLOR.error }}>● {counts.error} errors</span>
        <span style={{ color: SEV_COLOR.warning }}>● {counts.warning} warnings</span>
        <span style={{ color: SEV_COLOR.info }}>● {counts.info} info</span>
      </div>
      {!shown.length && <div className="hint">No problems found: IPs are unique and inside their VLANs, ports are within capacity, every device is connected.</div>}
      <div className="check-list">
        {shown.slice(0, 60).map((i) => (
          <button key={i.id} className="check-item" onClick={() => go(i)} title={i.code}>
            <span className="dot" style={{ background: SEV_COLOR[i.severity] }} />
            <span className="grow">{i.message}</span>
          </button>
        ))}
        {shown.length > 60 && <div className="hint">…and {shown.length - 60} more</div>}
      </div>
    </Section>
  );
}

function DocInspector() {
  const s = useStore();
  const page = usePage();
  const nodes = Object.values(page.nodes);
  return (
    <>
      <Section title="Document">
        <Row label="Name"><TextInput value={s.doc.name} onChange={(v) => s.change((d) => { d.name = v || 'Untitled'; })} /></Row>
        <Row label="Page"><TextInput value={page.name} onChange={(v) => s.change((_d, pg) => { pg.name = v || 'Page'; })} /></Row>
        <Row label="Author"><TextInput value={s.doc.meta?.author ?? ''} onChange={(v) => s.change((d) => { (d.meta ??= {}).author = v || undefined; })} /></Row>
        <Row label="Version"><TextInput value={s.doc.meta?.version ?? ''} placeholder="e.g. 2.0" onChange={(v) => s.change((d) => { (d.meta ??= {}).version = v || undefined; })} /></Row>
        <Row label="Icons">
          <div className="seg" style={{ margin: 0, flex: 1 }}>
            {(['iso', 'detailed'] as const).map((k) => (
              <button key={k} className={(s.doc.iconStyle ?? 'iso') === k ? 'active' : ''} onClick={() => s.setIconStyle(k)}>{k === 'iso' ? 'Isometric' : 'Detailed'}</button>
            ))}
          </div>
        </Row>
        <div className="stats">
          <div><b>{nodes.filter((n) => n.kind === 'device').length}</b><span>devices</span></div>
          <div><b>{Object.keys(page.links).length}</b><span>links</span></div>
          <div><b>{nodes.filter((n) => n.kind === 'zone').length}</b><span>zones</span></div>
          <div><b>{s.doc.vlans.length}</b><span>VLANs</span></div>
        </div>
      </Section>
      <Section title="VLANs" actions={<button className="btn ghost xs" onClick={() => s.set({ modal: 'vlans' })}>Manage</button>}>
        <div className="vlan-mini">
          {s.doc.vlans.map((v) => (
            <div key={v.id} className="vlan-mini-row">
              <span className="dot" style={{ background: v.color }} />
              <span className="mono">{v.vlanId}</span>
              <span className="grow ellipsis">{v.name}</span>
              <span className="mono dim">{v.subnet}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Drawing">
        <Row><Toggle label="Colour links by media type" checked={!!s.doc.linkColorByMedia} onChange={(v) => s.change((d) => { d.linkColorByMedia = v || undefined; })} /></Row>
        <Row><Toggle label="Line jumps where links cross" checked={!!s.doc.lineJumps} onChange={(v) => s.change((d) => { d.lineJumps = v || undefined; })} /></Row>
        <Row><Toggle label="Show port labels on links" checked={!s.doc.hidePortLabels} onChange={(v) => s.change((d) => { d.hidePortLabels = v ? undefined : true; })} /></Row>
        <Row label="Naming rule"><TextInput value={s.doc.namePattern ?? ''} mono placeholder="regex, e.g. ^[a-z]{2,3}[A-Z]" onChange={(v) => s.change((d) => { d.namePattern = v || undefined; })} /></Row>
      </Section>
      <ChecksSection />
      <Section title="Canvas">
        <Row><Toggle label="Grid" checked={s.showGrid} onChange={(v) => s.set({ showGrid: v })} /></Row>
        <Row><Toggle label="Snap to grid" checked={s.snapToGrid} onChange={(v) => s.set({ snapToGrid: v })} /></Row>
        <Row><Toggle label="Smart guides" checked={s.smartGuides} onChange={(v) => s.set({ smartGuides: v })} /></Row>
        <Row><Toggle label="Show all ports" checked={s.showPorts} onChange={(v) => s.set({ showPorts: v })} /></Row>
        <Row><NumInput label="Grid" value={s.gridSize} min={2} max={64} onChange={(v) => s.set({ gridSize: Math.round(v) })} suffix="px" /></Row>
      </Section>
      <div className="hint pad">
        Tip: drag from a device’s port to another device to connect. Ports turn red when the media types don’t match or the port is full.
      </div>
    </>
  );
}
