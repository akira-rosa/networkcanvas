// ───────────────────────── Core data model ─────────────────────────
// Everything that is saved (documents, device definitions) is plain JSON.

export type ID = string;

/* ---------- Device definitions (the expandable library) ---------- */

/** Colour value. Either a CSS colour or an accent token that follows the
 *  device's accent colour: 'accent' | 'accent-light' | 'accent-dark' | 'accent-darker'. */
export type Paint = string;

export type ShapeType =
  | 'rect'
  | 'ellipse'
  | 'polygon' // points, closed or open (pen tool / lines)
  | 'path' // raw SVG path data scaled into its box (SVG import)
  | 'text'
  | 'isoBox' // isometric box with auto-shaded faces
  | 'isoCylinder' // isometric cylinder with auto-shaded body
  | 'image'; // embedded raster/SVG image (vendor icons)

export interface ShapeBase {
  id: ID;
  type: ShapeType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number; // degrees, around centre
  fill?: Paint; // 'none' for no fill
  stroke?: Paint;
  strokeWidth?: number;
  dash?: string; // e.g. '4 2'
  opacity?: number; // 0..1
  hidden?: boolean;
  locked?: boolean;
  /** linear gradient fill; overrides `fill` */
  gradient?: Gradient;
  /** reference/trace layer: visible only in the device editor, never on diagrams */
  guide?: boolean;
}

export interface Gradient {
  /** degrees: 0 = left→right, 90 = top→bottom */
  angle: number;
  from: Paint;
  to: Paint;
}

export interface RectShape extends ShapeBase {
  type: 'rect';
  radius?: number;
  /** per-corner radii [top-left, top-right, bottom-right, bottom-left]; overrides radius */
  radii?: [number, number, number, number];
}
export interface EllipseShape extends ShapeBase { type: 'ellipse' }
export interface PolygonShape extends ShapeBase {
  type: 'polygon';
  /** points normalised to the shape box: 0..1 */
  points: [number, number][];
  closed: boolean;
}
export interface PathShape extends ShapeBase {
  type: 'path';
  d: string;
  /** original bounds of d, used to scale into x/y/w/h */
  vb: [number, number, number, number];
}
export interface TextShape extends ShapeBase {
  type: 'text';
  text: string;
  fontSize: number;
  fontWeight?: number;
  italic?: boolean;
  align?: 'start' | 'middle' | 'end';
}
export interface IsoBoxShape extends ShapeBase {
  type: 'isoBox';
  /** height of the top face as a fraction of the box height */
  top: number;
  /** horizontal position of the front edge 0..1 (0.5 = symmetric) */
  skew?: number;
}
export interface IsoCylinderShape extends ShapeBase {
  type: 'isoCylinder';
  /** height of the top ellipse as a fraction of the box height */
  top: number;
}
export interface ImageShape extends ShapeBase { type: 'image'; href: string }

export type Shape =
  | RectShape
  | EllipseShape
  | PolygonShape
  | PathShape
  | TextShape
  | IsoBoxShape
  | IsoCylinderShape
  | ImageShape;

export type PortMedia =
  | 'any'
  | 'ethernet'
  | 'fiber'
  | 'sfp'
  | 'wireless'
  | 'serial'
  | 'usb'
  | 'profinet'
  | 'iolink'
  | 'power'
  | 'console';

export type Side = 'auto' | 'top' | 'right' | 'bottom' | 'left';

export interface PortDef {
  id: ID;
  name: string; // shown as the port label on links, e.g. "P1", "WAN", "E1"
  x: number; // in definition coordinates
  y: number;
  media: PortMedia;
  side: Side; // direction a link leaves the port (for orthogonal/curved routing)
  /** 0 = unlimited */
  maxLinks: number;
  description?: string;
}

export interface FieldDef {
  key: string;
  label: string;
  default?: string;
}

export type IconStyle = 'iso' | 'detailed';

export interface DeviceDef {
  id: ID;
  name: string;
  category: string;
  description?: string;
  w: number;
  h: number;
  accent: string;
  shapes: Shape[];
  ports: PortDef[];
  fields: FieldDef[];
  /** short code used for naming conventions, e.g. "rt", "sw", "fw" */
  prefix?: string;
  /** icon family: 'iso' = isometric blue/white, 'detailed' = front-view illustration */
  style?: IconStyle;
  /** the same device drawn in the other style (built-ins pair `x` with `d-x` automatically) */
  counterpart?: ID;
  vendor?: string;
  builtin?: boolean;
  version?: number;
  updatedAt?: number;
}

/* ---------- Diagram documents ---------- */

export interface Vlan {
  id: ID;
  vlanId: number;
  name: string;
  subnet: string; // e.g. 192.168.200.0/24
  color: string;
  description: string;
}

export interface Address {
  id: ID;
  vlan?: ID; // Vlan.id → coloured dot
  value: string; // IP or any note ("DHCP Client")
}

export type LabelPos = 'bottom' | 'top' | 'left' | 'right' | 'none';

export interface NodeBase {
  id: ID;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
  locked?: boolean;
  /** nodes sharing a groupId select and move together */
  groupId?: ID;
  /** drill-down: clicking the badge opens this page */
  pageLink?: ID;
  /** layer membership (undefined = default layer) */
  layerId?: ID;
}

export interface DeviceNode extends NodeBase {
  kind: 'device';
  defId: ID;
  name: string;
  subtitle?: string;
  addresses: Address[];
  props: Record<string, string>;
  accent?: string;
  labelPos: LabelPos;
  flipX?: boolean;
}

export interface ZoneNode extends NodeBase {
  kind: 'zone';
  title: string;
  vlan?: ID;
  /** overrides the auto tag (VLAN subnet) */
  tag?: string;
  color?: string; // tag / border colour when no VLAN
  fill?: string; // background override
  border?: boolean;
  radius: number;
  titleAlign: 'left' | 'right';
}

export interface TextNode extends NodeBase {
  kind: 'text';
  text: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align: 'left' | 'center' | 'right';
}

export interface RectNode extends NodeBase {
  kind: 'rect';
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  dash?: boolean;
  radius: number;
}

export interface LegendNode extends NodeBase {
  kind: 'legend';
  title: string;
  columns: number;
}

export interface VlanTableNode extends NodeBase {
  kind: 'vlanTable';
  title: string;
}

export interface ImageNode extends NodeBase {
  kind: 'image';
  href: string; // data URL
  opacity?: number;
}

/** note box with a leader line to an anchor node; text may use {name} {subtitle} {addresses} {prop:key} */
export interface CalloutNode extends NodeBase {
  kind: 'callout';
  text: string;
  anchor?: ID;
  fontSize: number;
  fill?: string;
  color?: string;
}

/** engineering title block, auto-filled from the document metadata */
export interface TitleBlockNode extends NodeBase {
  kind: 'titleBlock';
  showDate: boolean;
  showPage: boolean;
}

export type DiagramNode = DeviceNode | ZoneNode | TextNode | RectNode | LegendNode | VlanTableNode | ImageNode | CalloutNode | TitleBlockNode;
export type NodeKind = DiagramNode['kind'];

export type LinkMedia =
  | 'ethernet'
  | 'fiber'
  | 'wireless'
  | 'wan'
  | 'vpn'
  | 'serial'
  | 'profinet'
  | 'iolink'
  | 'logical';

export interface Endpoint {
  node: ID;
  port?: ID; // PortDef.id; undefined = floating on the device edge
}

export interface Link {
  id: ID;
  from: Endpoint;
  to: Endpoint;
  media: LinkMedia;
  routing: 'straight' | 'orthogonal' | 'curved';
  color?: string; // undefined = theme foreground
  width: number;
  dash: 'solid' | 'dashed' | 'dotted';
  arrowStart: boolean;
  arrowEnd: boolean;
  label?: string; // centre label (e.g. "WAN")
  fromLabel?: string; // override for port label at source
  toLabel?: string;
  showPortLabels: boolean;
  layerId?: ID;
  /** orthogonal routing: position of the middle segment (0..1) */
  bend?: number;
  /** straight routing: intermediate points the line passes through */
  waypoints?: { x: number; y: number }[];
  /** documentation fields (shown as a chip at the centre when `showMeta` is on) */
  speed?: string; // e.g. 1G, 10G, 100M
  vlans?: string; // e.g. "trunk 2,50,150" or "access 150"
  cableId?: string;
  notes?: string;
  showMeta?: boolean;
}

export type PaperSize = 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'Letter' | 'Tabloid';

/**
 * How a page prints: paper size, orientation, how many canvas units one millimetre of paper
 * holds, and a grid of tiles for drawings larger than one sheet. (x, y) is the top-left corner
 * of the first tile's drawing frame on the canvas. See src/model/sheet.ts.
 */
export interface SheetSetup {
  size: PaperSize;
  orientation: 'landscape' | 'portrait';
  x: number;
  y: number;
  unitsPerMm: number;
  cols: number;
  rows: number;
}

export interface Page {
  id: ID;
  name: string;
  nodes: Record<ID, DiagramNode>;
  order: ID[]; // z-order, bottom → top
  links: Record<ID, Link>;
  /** print setup; without one, printing fits the page on one A3 landscape sheet */
  sheet?: SheetSetup;
}

export interface DocMeta {
  author?: string;
  company?: string;
  version?: string;
  classification?: string;
  description?: string;
}

export interface Layer {
  id: ID;
  name: string;
  hidden?: boolean;
  locked?: boolean;
  color?: string;
}

export interface DiagramDoc {
  format: 'networkcanvas';
  version: 1;
  id: ID;
  name: string;
  pages: Page[];
  vlans: Vlan[];
  meta?: DocMeta;
  /** optional layers; nodes/links without layerId are on the default layer */
  layers?: Layer[];
  /** copies of custom device definitions used, so files are portable */
  embeddedDefs?: DeviceDef[];
  /** icon family used to draw devices on this diagram (default 'iso'); devices can override with `defId` = `<id>@<style>` */
  iconStyle?: IconStyle;
  /** colour links by media type unless a link sets its own colour */
  linkColorByMedia?: boolean;
  /** draw small arcs where straight links cross */
  lineJumps?: boolean;
  /** hide every port label (per-link setting still applies when off) */
  hidePortLabels?: boolean;
  /** optional regex that device names must match (diagram checks) */
  namePattern?: string;
  /** set on the bundled sample so it can be refreshed when the library changes */
  sampleVersion?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Viewport {
  x: number; // screen offset
  y: number;
  zoom: number;
}

export type Tool = 'select' | 'hand' | 'connect' | 'zone' | 'text' | 'rect';
