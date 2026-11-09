import type {
  CalloutNode, DeviceDef, DeviceNode, DiagramDoc, ImageNode, Link, LegendNode, Page, RectNode, TextNode, TitleBlockNode, Vlan, VlanTableNode, ZoneNode,
} from './types';
import { uid } from './util';

export const newPage = (name = 'Page 1'): Page => ({ id: uid('pg'), name, nodes: {}, order: [], links: {} });

export const newDoc = (name = 'Untitled diagram'): DiagramDoc => ({
  format: 'networkcanvas',
  version: 1,
  id: uid('doc'),
  name,
  pages: [newPage()],
  vlans: [
    { id: uid('v'), vlanId: 1, name: 'Default', subnet: '192.168.1.0/24', color: '#8b95a5', description: 'Default / management VLAN' },
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export const newVlan = (n: number): Vlan => ({
  id: uid('v'), vlanId: n, name: `VLAN ${n}`, subnet: `192.168.${n % 256}.0/24`, color: PALETTE[n % PALETTE.length], description: '',
});

export const PALETTE = ['#e5484d', '#f5a524', '#c6d01b', '#46a758', '#3fb59a', '#1a8fd8', '#5b5bd6', '#8e4ec6', '#d6409f', '#8b95a5'];

let devCounter = 1;
/**
 * @param def   the definition that will actually be drawn
 * @param defId the id to store on the node (may carry a style override, e.g. "switch@detailed")
 */
export function createDevice(def: DeviceDef, cx: number, cy: number, defId = def.id): DeviceNode {
  const scale = 1.25;
  const w = def.w * scale, h = def.h * scale;
  const props: Record<string, string> = {};
  def.fields.forEach((f) => { if (f.default) props[f.key] = f.default; });
  return {
    kind: 'device', id: uid('n'), defId,
    x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h,
    name: `${def.prefix || 'dev'}${String(devCounter++).padStart(2, '0')}`,
    addresses: [], props, labelPos: 'bottom',
  };
}

export const createZone = (x: number, y: number, w: number, h: number, vlan?: string): ZoneNode => ({
  kind: 'zone', id: uid('n'), x, y, w, h, title: 'Zone', vlan, radius: 6, titleAlign: 'right', border: false,
});

export const createText = (x: number, y: number, text = 'Text'): TextNode => ({
  kind: 'text', id: uid('n'), x, y, w: 160, h: 24, text, fontSize: 14, bold: true, align: 'left',
});

export const createRect = (x: number, y: number, w: number, h: number): RectNode => ({
  kind: 'rect', id: uid('n'), x, y, w, h, strokeWidth: 1.5, radius: 6, dash: true,
});

export const createLegend = (x: number, y: number): LegendNode => ({
  kind: 'legend', id: uid('n'), x, y, w: 0, h: 0, title: 'Legend', columns: 4,
});

export const createVlanTable = (x: number, y: number): VlanTableNode => ({
  kind: 'vlanTable', id: uid('n'), x, y, w: 0, h: 0, title: 'VLAN Table',
});

export const createImage = (x: number, y: number, w: number, h: number, href: string): ImageNode => ({
  kind: 'image', id: uid('n'), x, y, w, h, href,
});

export const createCallout = (x: number, y: number, anchor?: string, text = 'Note'): CalloutNode => ({
  kind: 'callout', id: uid('n'), x, y, w: 150, h: 40, text, anchor, fontSize: 11,
});

export const createTitleBlock = (x: number, y: number): TitleBlockNode => ({
  kind: 'titleBlock', id: uid('n'), x, y, w: 340, h: 92, showDate: true, showPage: true,
});

export const newLink = (from: Link['from'], to: Link['to'], media: Link['media'] = 'ethernet'): Link => ({
  id: uid('l'), from, to, media,
  routing: 'straight',
  width: 1.6,
  dash: media === 'wireless' ? 'dashed' : 'solid',
  arrowStart: false,
  arrowEnd: true,
  showPortLabels: true,
});
