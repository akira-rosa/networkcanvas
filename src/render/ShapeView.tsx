import React from 'react';
import type { DeviceDef, Shape } from '../model/types';
import { resolvePaint, shade } from '../model/util';
import { FONT } from './theme';

const transformFor = (s: Shape) =>
  s.rotation ? `rotate(${s.rotation} ${s.x + s.w / 2} ${s.y + s.h / 2})` : undefined;

export function isoBoxFaces(x: number, y: number, w: number, h: number, top: number, skew = 0.5) {
  const th = Math.max(0, Math.min(h, h * top));
  const s = skew;
  const L = [x, y + (1 - s) * th];
  const B = [x + (1 - s) * w, y];
  const R = [x + w, y + s * th];
  const F = [x + s * w, y + th];
  const d = h - th;
  const pts = (arr: number[][]) => arr.map((p) => `${p[0]},${p[1]}`).join(' ');
  return {
    top: pts([L, B, R, F]),
    left: pts([L, F, [F[0], F[1] + d], [L[0], L[1] + d]]),
    right: pts([F, R, [R[0], R[1] + d], [F[0], F[1] + d]]),
  };
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: [number, number, number, number]) {
  const m = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v || 0, m)));
  return `M${x + tl},${y}H${x + w - tr}${tr ? `A${tr},${tr} 0 0 1 ${x + w},${y + tr}` : ''}V${y + h - br}${br ? `A${br},${br} 0 0 1 ${x + w - br},${y + h}` : ''}` +
    `H${x + bl}${bl ? `A${bl},${bl} 0 0 1 ${x},${y + h - bl}` : ''}V${y + tl}${tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : ''}Z`;
}

function gradientVector(angle: number) {
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a) / 2, dy = Math.sin(a) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

const hash = (t: string) => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

interface Props {
  shape: Shape;
  accent: string;
  /** render reference/trace layers (device editor only) */
  showGuides?: boolean;
  /** extra props for editor hit-testing */
  hitProps?: React.SVGProps<SVGGElement>;
}

export const ShapeView = React.memo(function ShapeView({ shape: s, accent, hitProps, showGuides }: Props) {
  if (s.hidden || (s.guide && !showGuides)) return null;
  let fill = s.fill === 'none' ? 'none' : resolvePaint(s.fill, accent) ?? 'none';
  let gradDef: React.ReactNode = null;
  if (s.gradient && s.type !== 'isoBox' && s.type !== 'isoCylinder' && s.type !== 'image') {
    const from = resolvePaint(s.gradient.from, accent) ?? '#000';
    const to = resolvePaint(s.gradient.to, accent) ?? '#fff';
    const gid = `gr-${s.id}-${hash(from + to + s.gradient.angle)}`;
    const v = gradientVector(s.gradient.angle);
    gradDef = (
      <defs>
        <linearGradient id={gid} {...v}>
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
    );
    fill = `url(#${gid})`;
  }
  const stroke = s.stroke && s.stroke !== 'none' ? resolvePaint(s.stroke, accent) : 'none';
  const common = {
    stroke,
    strokeWidth: stroke === 'none' ? undefined : s.strokeWidth ?? 1,
    strokeDasharray: s.dash || undefined,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  let body: React.ReactNode = null;
  switch (s.type) {
    case 'rect':
      body = s.radii && s.radii.some((r) => r > 0)
        ? <path d={roundedRectPath(s.x, s.y, Math.max(0, s.w), Math.max(0, s.h), s.radii)} fill={fill} {...common} />
        : <rect x={s.x} y={s.y} width={Math.max(0, s.w)} height={Math.max(0, s.h)} rx={s.radius || 0} fill={fill} {...common} />;
      break;
    case 'ellipse':
      body = <ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={Math.abs(s.w / 2)} ry={Math.abs(s.h / 2)} fill={fill} {...common} />;
      break;
    case 'polygon': {
      const pts = s.points.map(([px, py]) => `${s.x + px * s.w},${s.y + py * s.h}`).join(' ');
      body = s.closed ? (
        <polygon points={pts} fill={fill} {...common} />
      ) : (
        <polyline points={pts} fill="none" {...common} />
      );
      break;
    }
    case 'path': {
      const [vx, vy, vw, vh] = s.vb;
      const sx = vw ? s.w / vw : 1;
      const sy = vh ? s.h / vh : 1;
      body = (
        <g transform={`translate(${s.x} ${s.y}) scale(${sx} ${sy}) translate(${-vx} ${-vy})`}>
          <path d={s.d} fill={fill} {...common} strokeWidth={stroke === 'none' ? undefined : (s.strokeWidth ?? 1) / Math.max(0.0001, Math.sqrt(Math.abs(sx * sy)))} />
        </g>
      );
      break;
    }
    case 'text': {
      const anchor = s.align ?? 'middle';
      const tx = anchor === 'start' ? s.x : anchor === 'end' ? s.x + s.w : s.x + s.w / 2;
      const lines = s.text.split('\n');
      const lh = s.fontSize * 1.2;
      const y0 = s.y + s.h / 2 - ((lines.length - 1) * lh) / 2;
      body = (
        <text
          x={tx}
          y={y0}
          fontSize={s.fontSize}
          fontFamily={FONT}
          fontWeight={s.fontWeight ?? 600}
          fontStyle={s.italic ? 'italic' : undefined}
          textAnchor={anchor}
          dominantBaseline="central"
          fill={fill === 'none' ? '#fff' : fill}
          stroke={common.stroke}
          strokeWidth={common.strokeWidth}
          style={{ userSelect: 'none' }}
        >
          {lines.map((l, i) => (
            <tspan key={i} x={tx} dy={i === 0 ? 0 : lh}>{l}</tspan>
          ))}
        </text>
      );
      break;
    }
    case 'isoBox': {
      const base = fill === 'none' || fill.startsWith('url') ? resolvePaint('accent', accent)! : fill;
      const f = isoBoxFaces(s.x, s.y, s.w, s.h, s.top, s.skew ?? 0.5);
      const st = stroke === 'none' ? shade(base, -0.55) : stroke;
      const sw = s.strokeWidth ?? 0.7;
      body = (
        <g strokeLinejoin="round">
          <polygon points={f.left} fill={base} stroke={st} strokeWidth={sw} />
          <polygon points={f.right} fill={shade(base, -0.22)} stroke={st} strokeWidth={sw} />
          <polygon points={f.top} fill={shade(base, 0.26)} stroke={st} strokeWidth={sw} />
        </g>
      );
      break;
    }
    case 'isoCylinder': {
      const base = fill === 'none' || fill.startsWith('url') ? resolvePaint('accent', accent)! : fill;
      const th = Math.max(1, s.h * s.top);
      const rx = s.w / 2;
      const ry = th / 2;
      const cx = s.x + rx;
      const yb = s.y + s.h - ry;
      const st = stroke === 'none' ? shade(base, -0.55) : stroke;
      const sw = s.strokeWidth ?? 0.7;
      const gid = `cyl-${hash(base)}`;
      const bodyD = `M ${s.x} ${s.y + ry} L ${s.x} ${yb} A ${rx} ${ry} 0 0 0 ${s.x + s.w} ${yb} L ${s.x + s.w} ${s.y + ry} Z`;
      body = (
        <g>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={shade(base, -0.08)} />
              <stop offset="0.38" stopColor={shade(base, 0.1)} />
              <stop offset="0.7" stopColor={base} />
              <stop offset="1" stopColor={shade(base, -0.28)} />
            </linearGradient>
          </defs>
          <path d={bodyD} fill={`url(#${gid})`} stroke={st} strokeWidth={sw} strokeLinejoin="round" />
          <ellipse cx={cx} cy={s.y + ry} rx={rx} ry={ry} fill={shade(base, 0.24)} stroke={st} strokeWidth={sw} />
        </g>
      );
      break;
    }
    case 'image':
      body = <image href={s.href} x={s.x} y={s.y} width={Math.max(0, s.w)} height={Math.max(0, s.h)} preserveAspectRatio="none" />;
      break;
  }
  return (
    <g transform={transformFor(s)} opacity={s.opacity ?? 1} {...hitProps}>
      {gradDef}
      {body}
    </g>
  );
});

/** Draws a device definition scaled into the box x,y,w,h. */
export function DeviceGraphic({
  def,
  x,
  y,
  w,
  h,
  accent,
  flipX,
}: {
  def: DeviceDef;
  x: number;
  y: number;
  w: number;
  h: number;
  accent?: string;
  flipX?: boolean;
}) {
  const sx = w / def.w;
  const sy = h / def.h;
  const t = flipX
    ? `translate(${x + w} ${y}) scale(${-sx} ${sy})`
    : `translate(${x} ${y}) scale(${sx} ${sy})`;
  return (
    <g transform={t}>
      {def.shapes.map((s) => (
        <ShapeView key={s.id} shape={s} accent={accent || def.accent} />
      ))}
    </g>
  );
}

/** Small preview used in the library list and legend. */
export function DefThumb({ def, size = 36, accent }: { def: DeviceDef; size?: number; accent?: string }) {
  const k = Math.min(size / def.w, size / def.h);
  const w = def.w * k;
  const h = def.h * k;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', overflow: 'visible' }}>
      <DeviceGraphic def={def} x={(size - w) / 2} y={(size - h) / 2} w={w} h={h} accent={accent} />
    </svg>
  );
}
