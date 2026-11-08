import React from 'react';
import type {
  CalloutNode, DeviceNode, DiagramDoc, DiagramNode, ImageNode, Layer, LegendNode, Link, Page, RectNode, TextNode, TitleBlockNode, Vlan, VlanTableNode, ZoneNode,
} from '../model/types';
import type { DefMap, LinkGeom } from '../model/geometry';
import { LEGEND, VTABLE, legendItems, legendLinkItems, legendSize, linkGeometry, pathWithJumps, vlanTableSize } from '../model/geometry';
import type { Pt } from '../model/util';
import { DeviceGraphic } from './ShapeView';
import { FONT, LINK_MEDIA_COLORS, type CanvasTheme } from './theme';
import { readableOn } from '../model/util';

export interface LayerProps {
  page: Page;
  defs: DefMap;
  vlans: Vlan[];
  theme: CanvasTheme;
  interactive?: boolean;
  /** text being edited inline is hidden */
  editingId?: string | null;
  /** document drawing options */
  linkColorByMedia?: boolean;
  lineJumps?: boolean;
  hidePortLabels?: boolean;
  /** document metadata + name for the title block */
  doc?: Pick<DiagramDoc, 'name' | 'meta' | 'updatedAt'>;
  layers?: Layer[];
}

export const layerHidden = (layers: Layer[] | undefined, layerId?: string) => !!layerId && !!layers?.find((l) => l.id === layerId)?.hidden;
export const layerLocked = (layers: Layer[] | undefined, layerId?: string) => !!layerId && !!layers?.find((l) => l.id === layerId)?.locked;

/** Fill {name} {subtitle} {type} {addresses} {ip} {prop:key} from the anchor device. */
export function resolveTemplate(text: string, anchor: DiagramNode | undefined, defs: DefMap, vlans: Vlan[]): string {
  if (!anchor) return text.replace(/\{[^}]+\}/g, '');
  const d = anchor.kind === 'device' ? anchor : undefined;
  const def = d ? defs[d.defId] : undefined;
  return text.replace(/\{([^}]+)\}/g, (_m, key: string) => {
    const k = key.trim();
    if (k === 'name') return d ? d.name : anchor.kind === 'zone' ? anchor.title : anchor.kind === 'text' ? anchor.text : '';
    if (k === 'subtitle') return d?.subtitle ?? '';
    if (k === 'type') return def?.name ?? '';
    if (k === 'addresses') return d ? d.addresses.map((a) => a.value).join(', ') : '';
    if (k === 'ip') return d?.addresses[0]?.value ?? '';
    if (k === 'vlan') { const v = d && vlans.find((x) => x.id === d.addresses[0]?.vlan); return v ? `VLAN ${v.vlanId}` : ''; }
    if (k.startsWith('prop:')) return d?.props[k.slice(5)] ?? '';
    return '';
  });
}

function ImageView({ n }: { n: ImageNode }) {
  return <image href={n.href} x={n.x} y={n.y} width={n.w} height={n.h} preserveAspectRatio="xMidYMid meet" opacity={n.opacity ?? 1} />;
}

function CalloutView({ n, page, defs, vlans, theme }: { n: CalloutNode; page: Page; defs: DefMap; vlans: Vlan[]; theme: CanvasTheme }) {
  const anchor = n.anchor ? page.nodes[n.anchor] : undefined;
  const text = resolveTemplate(n.text, anchor, defs, vlans);
  const lines = text.split('\n');
  const fs = n.fontSize;
  const lh = fs * 1.35;
  const fill = n.fill || theme.panelFill;
  const color = n.color || theme.fg;
  let leader: React.ReactNode = null;
  if (anchor && !anchor.hidden) {
    const ar = { x: anchor.x, y: anchor.y, w: anchor.w, h: anchor.h };
    const ac = { x: ar.x + ar.w / 2, y: ar.y + ar.h / 2 };
    const cc = { x: n.x + n.w / 2, y: n.y + n.h / 2 };
    // start on the callout border facing the anchor, end on the anchor box border
    const edge = (r: { x: number; y: number; w: number; h: number }, from: { x: number; y: number }, to: { x: number; y: number }) => {
      const dx = to.x - from.x, dy = to.y - from.y;
      const tx = dx ? (r.w / 2) / Math.abs(dx) : Infinity, ty = dy ? (r.h / 2) / Math.abs(dy) : Infinity;
      const t = Math.min(tx, ty, 1);
      return { x: from.x + dx * t, y: from.y + dy * t };
    };
    const a = edge({ x: n.x, y: n.y, w: n.w, h: n.h }, cc, ac);
    const b = edge(ar, ac, cc);
    leader = (
      <g>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={1} strokeDasharray="3 2" opacity={0.8} />
        <circle cx={b.x} cy={b.y} r={2.2} fill={color} />
      </g>
    );
  }
  return (
    <g fontFamily={FONT}>
      {leader}
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={4} fill={fill} stroke={color} strokeWidth={0.8} opacity={0.96} />
      {lines.map((l, i) => (
        <text key={i} x={n.x + 8} y={n.y + 8 + fs * 0.9 + i * lh} fontSize={fs} fill={color} style={{ whiteSpace: 'pre' }}>{l || ' '}</text>
      ))}
    </g>
  );
}

function TitleBlockView({ n, page, doc, theme }: { n: TitleBlockNode; page: Page; doc?: LayerProps['doc']; theme: CanvasTheme }) {
  const m = doc?.meta ?? {};
  const rows: [string, string][] = [
    ['Title', doc?.name ?? ''],
    ...(n.showPage ? [['Page', page.name] as [string, string]] : []),
    ['Author', m.author ?? ''],
    ['Company', m.company ?? ''],
    ['Version', m.version ?? ''],
    ...(n.showDate ? [['Date', doc?.updatedAt ? new Date(doc.updatedAt).toISOString().slice(0, 10) : ''] as [string, string]] : []),
    ['Classification', m.classification ?? ''],
  ].filter(([, v]) => v !== undefined) as [string, string][];
  const rowH = n.h / rows.length;
  const labelW = Math.min(90, n.w * 0.3);
  return (
    <g fontFamily={FONT}>
      <rect x={n.x} y={n.y} width={n.w} height={n.h} fill={theme.panelFill} stroke={theme.fg} strokeWidth={1} />
      {rows.map(([k, v], i) => {
        const y = n.y + i * rowH;
        return (
          <g key={k}>
            {i > 0 && <line x1={n.x} y1={y} x2={n.x + n.w} y2={y} stroke={theme.fg} strokeWidth={0.5} opacity={0.5} />}
            <text x={n.x + 6} y={y + rowH / 2} fontSize={Math.min(9, rowH * 0.55)} fill={theme.muted} dominantBaseline="central" fontWeight={600}>{k.toUpperCase()}</text>
            <text x={n.x + labelW} y={y + rowH / 2} fontSize={Math.min(11, rowH * 0.62)} fill={theme.fg} dominantBaseline="central" fontWeight={k === 'Title' ? 700 : 500}>{v}</text>
          </g>
        );
      })}
      <line x1={n.x + labelW - 6} y1={n.y} x2={n.x + labelW - 6} y2={n.y + n.h} stroke={theme.fg} strokeWidth={0.5} opacity={0.5} />
    </g>
  );
}

/** small ↗ badge for nodes that link to another page */
export function PageLinkBadge({ n, theme, interactive }: { n: DiagramNode; theme: CanvasTheme; interactive?: boolean }) {
  if (!n.pageLink) return null;
  const x = n.x + n.w - 6, y = n.y - 6;
  return (
    <g data-pagelink={interactive ? n.id : undefined} style={interactive ? { cursor: 'pointer' } : undefined}>
      <circle cx={x} cy={y} r={7} fill={theme.selection} stroke={theme.bg} strokeWidth={1.5} />
      <path d={`M${x - 2.5} ${y + 2.5} L${x + 2.5} ${y - 2.5} M${x - 0.5} ${y - 2.5} H${x + 2.5} V${y + 0.5}`} stroke="#fff" strokeWidth={1.3} fill="none" strokeLinecap="round" />
      <title>Open linked page</title>
    </g>
  );
}

export function linkColor(link: Link, theme: CanvasTheme, byMedia?: boolean) {
  return link.color || (byMedia ? LINK_MEDIA_COLORS[link.media] : undefined) || theme.fg;
}

/** text of the centre chip: label · speed · vlans */
export function linkMetaText(link: Link) {
  const parts = [link.label, link.showMeta === false ? undefined : link.speed, link.showMeta === false ? undefined : link.vlans].filter(Boolean);
  return parts.join(' · ');
}

const estW = (s: string, size: number, bold = false) => s.length * size * (bold ? 0.6 : 0.54);

export function zoneTitle(z: ZoneNode, vlans: Vlan[]) {
  const v = z.vlan ? vlans.find((x) => x.id === z.vlan) : undefined;
  return { v, title: z.title || (v ? `VLAN ${v.vlanId}` : ''), tag: z.tag ?? v?.subnet ?? '', color: v?.color ?? z.color ?? '#8b95a5' };
}

export function ZoneView({ n, vlans, theme }: { n: ZoneNode; vlans: Vlan[]; theme: CanvasTheme }) {
  const { title, tag, color } = zoneTitle(n, vlans);
  const pillH = 18;
  const [ipPart, maskPart] = tag.includes('/') ? [tag.slice(0, tag.lastIndexOf('/')), tag.slice(tag.lastIndexOf('/'))] : [tag, ''];
  const pillW = tag ? estW(tag, 10.5, true) + 14 : 0;
  const left = n.titleAlign === 'left';
  const pillX = left ? n.x + 3 : n.x + n.w - pillW - 3;
  const pillY = n.y + 3;
  const titleX = left ? pillX + pillW + 10 : pillX - 10;
  const txtColor = readableOn(color);
  return (
    <g>
      <rect
        x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius}
        fill={n.fill || theme.zoneFill}
        stroke={n.border ? color : theme.zoneStroke}
        strokeWidth={n.border ? 1.5 : 1}
      />
      {tag && (
        <g>
          <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={5} fill={color} stroke={theme.bg} strokeWidth={1.5} />
          <text x={pillX + pillW / 2} y={pillY + pillH / 2 + 0.5} fontFamily={FONT} fontSize={10.5} fontWeight={700} fontStyle="italic"
            textAnchor="middle" dominantBaseline="central" fill={txtColor}>
            {ipPart}<tspan opacity={0.65} fontWeight={500}>{maskPart}</tspan>
          </text>
        </g>
      )}
      {title && (
        <text x={titleX} y={pillY + pillH / 2 + 0.5} fontFamily={FONT} fontSize={11} fontWeight={700} fill={theme.fg}
          textAnchor={left ? 'start' : 'end'} dominantBaseline="central">
          {title}
        </text>
      )}
    </g>
  );
}

export function DeviceLabel({ n, vlans, theme, halo }: { n: DeviceNode; vlans: Vlan[]; theme: CanvasTheme; halo?: string }) {
  if (n.labelPos === 'none') return null;
  const lines: { text: string; color?: string; kind: 'name' | 'sub' | 'addr' }[] = [{ text: n.name, kind: 'name' }];
  if (n.subtitle) lines.push({ text: n.subtitle, kind: 'sub' });
  for (const a of n.addresses) {
    const v = a.vlan ? vlans.find((x) => x.id === a.vlan) : undefined;
    lines.push({ text: a.value, color: v?.color ?? (a.vlan === 'error' ? '#e5484d' : undefined), kind: 'addr' });
  }
  const lh = 13.5;
  const total = lines.length * lh;
  let x0: number, y0: number, anchor: 'middle' | 'start' | 'end';
  if (n.labelPos === 'bottom') { x0 = n.x + n.w / 2; y0 = n.y + n.h + 12; anchor = 'middle'; }
  else if (n.labelPos === 'top') { x0 = n.x + n.w / 2; y0 = n.y - total - 2; anchor = 'middle'; }
  else if (n.labelPos === 'right') { x0 = n.x + n.w + 18; y0 = n.y + n.h / 2 - total / 2 + lh / 2; anchor = 'start'; }
  else { x0 = n.x - 8; y0 = n.y + n.h / 2 - total / 2 + lh / 2; anchor = 'end'; }
  return (
    <g fontFamily={FONT} style={{ userSelect: 'none' }}>
      {lines.map((l, i) => {
        const y = y0 + i * lh;
        const size = l.kind === 'name' ? 11.5 : 10.5;
        const w = estW(l.text, size, l.kind === 'name');
        const hasDot = l.kind === 'addr' && !!l.color;
        // keep the dot+text group centred
        const shift = anchor === 'middle' && hasDot ? 5 : 0;
        const tx = x0 + shift;
        const dotX = anchor === 'middle' ? tx - w / 2 - 7 : anchor === 'start' ? x0 - 9 : x0 - w - 7;
        return (
          <g key={i}>
            {hasDot && <circle cx={dotX} cy={y} r={3.3} fill={l.color} />}
            <text
              x={tx} y={y} textAnchor={anchor} dominantBaseline="central"
              fontSize={size} fontWeight={l.kind === 'name' ? 700 : 500}
              fontStyle={l.kind === 'name' ? undefined : 'italic'}
              fill={l.kind === 'name' ? theme.fg : theme.muted}
              stroke={halo} strokeWidth={halo ? 3.2 : undefined} strokeLinejoin="round" paintOrder="stroke"
            >
              {l.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function TextView({ n, theme }: { n: TextNode; theme: CanvasTheme }) {
  const lines = n.text.split('\n');
  const lh = n.fontSize * 1.3;
  const x = n.align === 'left' ? n.x : n.align === 'center' ? n.x + n.w / 2 : n.x + n.w;
  const anchor = n.align === 'left' ? 'start' : n.align === 'center' ? 'middle' : 'end';
  return (
    <text x={x} y={n.y} fontFamily={FONT} fontSize={n.fontSize} fontWeight={n.bold ? 700 : 400}
      fontStyle={n.italic ? 'italic' : undefined} fill={n.color || theme.fg} textAnchor={anchor} style={{ whiteSpace: 'pre' }}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} y={n.y + lh * i + n.fontSize * 0.95}>{l || ' '}</tspan>
      ))}
    </text>
  );
}

function RectView({ n, theme }: { n: RectNode; theme: CanvasTheme }) {
  return (
    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius}
      fill={n.fill || 'none'} stroke={n.stroke || theme.muted} strokeWidth={n.strokeWidth}
      strokeDasharray={n.dash ? `${n.strokeWidth * 4} ${n.strokeWidth * 3}` : undefined} />
  );
}

const MEDIA_LABEL: Record<string, string> = { ethernet: 'Ethernet', fiber: 'Fiber', wireless: 'Wireless', wan: 'WAN / ISP', vpn: 'VPN tunnel', serial: 'Serial', profinet: 'PROFINET', iolink: 'IO-Link', logical: 'Logical' };

function LegendView({ n, page, defs, theme, byMedia }: { n: LegendNode; page: Page; defs: DefMap; theme: CanvasTheme; byMedia?: boolean }) {
  const items = legendItems(page, defs);
  const linkItems = legendLinkItems(page);
  const s = legendSize(items.length, n.columns, linkItems.length);
  const linksY = n.y + LEGEND.pad + LEGEND.title + s.rows * LEGEND.cellH + 8;
  return (
    <g fontFamily={FONT}>
      <rect x={n.x} y={n.y} width={s.w} height={s.h} rx={8} fill={theme.panelFill} stroke={theme.zoneStroke} />
      <text x={n.x + LEGEND.pad} y={n.y + LEGEND.pad + 8} fontSize={12} fontWeight={700} fill={theme.fg} dominantBaseline="central">{n.title}</text>
      {items.map((d, i) => {
        const c = i % s.cols, r = Math.floor(i / s.cols);
        const x = n.x + LEGEND.pad + c * LEGEND.cellW;
        const y = n.y + LEGEND.pad + LEGEND.title + r * LEGEND.cellH;
        const k = Math.min(34 / d.w, 24 / d.h);
        const gw = d.w * k, gh = d.h * k;
        return (
          <g key={d.id}>
            <DeviceGraphic def={d} x={x + (36 - gw) / 2} y={y + (LEGEND.cellH - gh) / 2 - 3} w={gw} h={gh} />
            <text x={x + 44} y={y + LEGEND.cellH / 2 - 3} fontSize={10.5} fontWeight={600} fill={theme.fg} dominantBaseline="central">{d.name.length > 21 ? d.name.slice(0, 20) + '…' : d.name}<title>{d.name}</title></text>
          </g>
        );
      })}
      {!items.length && (
        <text x={n.x + LEGEND.pad} y={n.y + LEGEND.pad + LEGEND.title + 12} fontSize={10.5} fill={theme.muted} fontStyle="italic">Add devices to populate the legend</text>
      )}
      {linkItems.map((m, i) => {
        const c = i % s.cols, r = Math.floor(i / s.cols);
        const x = n.x + LEGEND.pad + c * LEGEND.cellW;
        const y = linksY + r * LEGEND.linkH + LEGEND.linkH / 2;
        const sample: Link = { id: 'lg', from: { node: '' }, to: { node: '' }, media: m, routing: 'straight', width: 1.6, dash: m === 'wireless' || m === 'vpn' ? 'dashed' : m === 'logical' ? 'dotted' : 'solid', arrowStart: false, arrowEnd: false, showPortLabels: false };
        const col = linkColor(sample, theme, byMedia);
        return (
          <g key={m}>
            <line x1={x + 4} y1={y} x2={x + 34} y2={y} stroke={col} strokeWidth={1.6} strokeDasharray={dashArray(sample)} strokeLinecap={sample.dash === 'dotted' ? 'round' : 'butt'} />
            <text x={x + 44} y={y} fontSize={10.5} fontWeight={600} fill={theme.fg} dominantBaseline="central">{MEDIA_LABEL[m] ?? m}</text>
          </g>
        );
      })}
    </g>
  );
}

function VlanTableView({ n, vlans, theme }: { n: VlanTableNode; vlans: Vlan[]; theme: CanvasTheme }) {
  const s = vlanTableSize(vlans);
  const T = VTABLE;
  const cols = [T.colId, T.colName, T.colDesc];
  return (
    <g fontFamily={FONT}>
      <rect x={n.x} y={n.y} width={s.w} height={s.h} rx={8} fill={theme.panelFill} stroke={theme.zoneStroke} />
      <text x={n.x + T.pad} y={n.y + T.pad + 8} fontSize={12} fontWeight={700} fill={theme.fg} dominantBaseline="central">{n.title}</text>
      {vlans.map((v, i) => {
        const y = n.y + T.pad + T.title + i * (T.rowH + T.gap);
        let x = n.x + T.pad;
        const vals = [String(v.vlanId), v.name, v.description || v.subnet];
        return (
          <g key={v.id}>
            {cols.map((w, ci) => {
              const cx = x;
              x += w + T.colGap;
              return (
                <g key={ci}>
                  <rect x={cx} y={y} width={w} height={T.rowH} rx={3} fill={theme.cellFill} />
                  <text x={ci === 2 ? cx + 8 : cx + w / 2} y={y + T.rowH / 2} fontSize={10} fill={theme.cellText}
                    textAnchor={ci === 2 ? 'start' : 'middle'} dominantBaseline="central">{vals[ci]}</text>
                </g>
              );
            })}
            <circle cx={x + T.colDot / 2} cy={y + T.rowH / 2} r={7} fill={v.color} stroke={theme.fg} strokeWidth={1.6} />
          </g>
        );
      })}
    </g>
  );
}

export function dashArray(l: Pick<Link, 'dash' | 'width'>) {
  if (l.dash === 'dashed') return `${4 + l.width * 2} ${3 + l.width * 1.6}`;
  if (l.dash === 'dotted') return `0.1 ${2 + l.width * 1.8}`;
  return undefined;
}

export function LinkView({ link, g, theme, interactive, bgAt, clear, byMedia, d, hidePorts }: { link: Link; g: LinkGeom; theme: CanvasTheme; interactive?: boolean; bgAt?: (x: number, y: number) => string; clear?: [number, number]; byMedia?: boolean; d?: string; hidePorts?: boolean }) {
  const color = linkColor(link, theme, byMedia);
  const path = d ?? g.d;
  const meta = linkMetaText(link);
  const labelPos = (p: { x: number; y: number }, dir: { x: number; y: number }, along: number, side: number) => {
    const nx = -dir.y, ny = dir.x;
    return { x: p.x + dir.x * along + nx * side, y: p.y + dir.y * along + ny * side };
  };
  const halo = (p: { x: number; y: number }) => (bgAt ? { stroke: bgAt(p.x, p.y), strokeWidth: 3, strokeLinejoin: 'round' as const, paintOrder: 'stroke' } : {});
  const fromText = link.showPortLabels && !hidePorts ? link.fromLabel ?? g.fromPort?.name : undefined;
  const toText = link.showPortLabels && !hidePorts ? link.toLabel ?? g.toPort?.name : undefined;
  const fl = labelPos(g.start, g.startDir, 16 + (clear?.[0] ?? 0), 10);
  const tl = labelPos(g.end, { x: -g.endDir.x, y: -g.endDir.y }, 20 + (clear?.[1] ?? 0), -10);
  const ml = labelPos(g.mid, g.midDir.x < 0 ? { x: -g.midDir.x, y: -g.midDir.y } : g.midDir, 0, -9);
  return (
    <g data-link-id={interactive ? link.id : undefined} style={interactive ? { cursor: 'pointer' } : undefined}>
      {interactive && <path d={path} stroke="transparent" strokeWidth={12} fill="none" />}
      <path d={path} stroke={color} strokeWidth={link.width} fill="none" strokeDasharray={dashArray(link)}
        strokeLinecap={link.dash === 'dotted' ? 'round' : 'butt'} strokeLinejoin="round" />
      {g.arrowEnd && <path d={g.arrowEnd} fill={color} />}
      {g.arrowStart && <path d={g.arrowStart} fill={color} />}
      <g fontFamily={FONT} fontSize={9.5} fontWeight={700} fill={color} style={{ userSelect: 'none' }}>
        {fromText && <text x={fl.x} y={fl.y} textAnchor="middle" dominantBaseline="central" {...halo(fl)}>{fromText}</text>}
        {toText && <text x={tl.x} y={tl.y} textAnchor="middle" dominantBaseline="central" {...halo(tl)}>{toText}</text>}
        {meta && <text x={ml.x} y={ml.y} textAnchor="middle" dominantBaseline="central" {...halo(ml)}>{meta}</text>}
      </g>
    </g>
  );
}

const BACKGROUND = new Set(['zone', 'rect', 'image']);

export function NodeView({ n, props, bgAt }: { n: DiagramNode; props: LayerProps; bgAt?: (x: number, y: number) => string }) {
  const { page, defs, vlans, theme, interactive, editingId } = props;
  const data = interactive ? { 'data-id': n.id } : {};
  const pe = interactive && (n.locked || layerLocked(props.layers, n.layerId)) ? { pointerEvents: 'none' as const } : undefined;
  let body: React.ReactNode = null;
  switch (n.kind) {
    case 'zone': body = <ZoneView n={n} vlans={vlans} theme={theme} />; break;
    case 'rect': body = <RectView n={n} theme={theme} />; break;
    case 'text': body = editingId === n.id ? null : <TextView n={n} theme={theme} />; break;
    case 'legend': body = <LegendView n={n} page={page} defs={defs} theme={theme} byMedia={props.linkColorByMedia} />; break;
    case 'vlanTable': body = <VlanTableView n={n} vlans={vlans} theme={theme} />; break;
    case 'image': body = <ImageView n={n} />; break;
    case 'callout': body = editingId === n.id ? null : <CalloutView n={n} page={page} defs={defs} vlans={vlans} theme={theme} />; break;
    case 'titleBlock': body = <TitleBlockView n={n} page={page} doc={props.doc} theme={theme} />; break;
    case 'device': {
      const def = defs[n.defId];
      body = (
        <>
          {interactive && <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="transparent" />}
          {def ? (
            <DeviceGraphic def={def} x={n.x} y={n.y} w={n.w} h={n.h} accent={n.accent} flipX={n.flipX} />
          ) : (
            <g>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={6} fill="none" stroke="#e5484d" strokeDasharray="4 3" />
              <text x={n.x + n.w / 2} y={n.y + n.h / 2} fontSize={9} fill="#e5484d" textAnchor="middle" dominantBaseline="central" fontFamily={FONT}>missing: {n.defId}</text>
            </g>
          )}
          {editingId === n.id ? null : <DeviceLabel n={n} vlans={vlans} theme={theme} halo={bgAt?.(n.x + n.w / 2, n.y + n.h)} />}
        </>
      );
      break;
    }
  }
  return <g {...data} style={pe}>{body}<PageLinkBadge n={n} theme={theme} interactive={interactive} /></g>;
}

/** Pure renderer for a page: used for the live canvas and for SVG/PNG export. */
export function DiagramLayer(props: LayerProps & { linkOverride?: Record<string, Partial<Link>> }) {
  const { page, defs, vlans, theme, interactive, linkColorByMedia, lineJumps } = props;
  const drawn: Pt[][] = [];
  // links between the same two devices that don't use ports would overlap: fan them out
  const parallel = new Map<string, number>();
  {
    const groups = new Map<string, Link[]>();
    for (const l of Object.values(page.links)) {
      if (l.from.port || l.to.port || l.waypoints?.length) continue;
      const key = [l.from.node, l.to.node].sort().join('|');
      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      list.forEach((l, i) => {
        const sign = l.from.node < l.to.node ? 1 : -1;
        parallel.set(l.id, sign * (i - (list.length - 1) / 2) * 9);
      });
    }
  }
  const ordered = page.order.map((id) => page.nodes[id]).filter((n): n is DiagramNode => !!n && !n.hidden && !layerHidden(props.layers, n.layerId));
  const bg = ordered.filter((n) => BACKGROUND.has(n.kind));
  const fg = ordered.filter((n) => !BACKGROUND.has(n.kind));
  const zones = bg.filter((n): n is ZoneNode => n.kind === 'zone').reverse();
  const bgAt = (x: number, y: number) => {
    const z = zones.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    return z ? z.fill || theme.zoneFill : theme.bg;
  };
  return (
    <g>
      {bg.map((n) => <NodeView key={n.id} n={n} props={props} />)}
      <g>
        {Object.values(page.links).map((l) => {
          const fromN = page.nodes[l.from.node], toN = page.nodes[l.to.node];
          if (!fromN || !toN || fromN.hidden || toN.hidden) return null;
          if (layerHidden(props.layers, l.layerId) || layerHidden(props.layers, fromN.layerId) || layerHidden(props.layers, toN.layerId)) return null;
          const g = linkGeometry(l, page, defs, vlans, parallel.has(l.id) ? { parallel: parallel.get(l.id) } : undefined);
          if (!g) return null;
          // push port labels past the device's own label when the link leaves on that side
          const clearFor = (n: DiagramNode, dir: { x: number; y: number }) => {
            if (n.kind !== 'device' || n.labelPos === 'none') return 0;
            const lines = 1 + n.addresses.length + (n.subtitle ? 1 : 0);
            const vert = (n.labelPos === 'bottom' && dir.y > 0.3) || (n.labelPos === 'top' && dir.y < -0.3);
            return vert ? Math.min(90, (lines * 13.5) / Math.abs(dir.y)) : 0;
          };
          const clear: [number, number] = [clearFor(fromN, g.startDir), clearFor(toN, { x: -g.endDir.x, y: -g.endDir.y })];
          let d: string | undefined;
          if (lineJumps && g.linePts) {
            d = pathWithJumps(g.linePts, drawn, 3.5 + l.width * 0.6);
            drawn.push(g.linePts);
          }
          return <LinkView key={l.id} link={l} g={g} theme={theme} interactive={interactive} bgAt={bgAt} clear={clear} byMedia={linkColorByMedia} d={d} hidePorts={props.hidePortLabels} />;
        })}
      </g>
      {fg.map((n) => <NodeView key={n.id} n={n} props={props} bgAt={bgAt} />)}
    </g>
  );
}
