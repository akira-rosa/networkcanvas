import type { Shape } from '../model/types';
import { uid } from '../model/util';

// Converts an SVG file into editable path shapes. Each geometry element
// becomes a 'path' shape whose original bounds are scaled into its box.
// Elements with rotation/skew transforms are skipped (reported back).

const GEOM = 'path,rect,circle,ellipse,line,polyline,polygon';

function toPathD(el: Element): string | null {
  const n = (a: string) => parseFloat(el.getAttribute(a) || '0');
  switch (el.tagName.toLowerCase()) {
    case 'path': return el.getAttribute('d');
    case 'rect': {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height');
      let rx = n('rx'), ry = n('ry');
      if (!rx && ry) rx = ry; if (!ry && rx) ry = rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!rx) return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
    }
    case 'circle': {
      const cx = n('cx'), cy = n('cy'), r = n('r');
      return `M${cx - r},${cy}A${r},${r} 0 1 0 ${cx + r},${cy}A${r},${r} 0 1 0 ${cx - r},${cy}Z`;
    }
    case 'ellipse': {
      const cx = n('cx'), cy = n('cy'), rx = n('rx'), ry = n('ry');
      return `M${cx - rx},${cy}A${rx},${ry} 0 1 0 ${cx + rx},${cy}A${rx},${ry} 0 1 0 ${cx - rx},${cy}Z`;
    }
    case 'line': return `M${n('x1')},${n('y1')}L${n('x2')},${n('y2')}`;
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4) return null;
      let d = `M${pts[0]},${pts[1]}`;
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]},${pts[i + 1]}`;
      return el.tagName.toLowerCase() === 'polygon' ? d + 'Z' : d;
    }
  }
  return null;
}

export function importSvgAsShapes(svgText: string, targetW: number, targetH: number): { shapes: Shape[]; skipped: number } {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const src = doc.querySelector('svg');
  if (!src) throw new Error('Not an SVG file');
  // mount off-screen so the browser computes styles, bboxes and transforms
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:1000px;visibility:hidden';
  const svg = document.importNode(src, true) as SVGSVGElement;
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    let vb = svg.viewBox.baseVal;
    let box = vb && vb.width ? { x: vb.x, y: vb.y, w: vb.width, h: vb.height } : null;
    if (!box) { const b = svg.getBBox(); box = { x: b.x, y: b.y, w: b.width || 1, h: b.height || 1 }; }
    const k = Math.min(targetW / box.w, targetH / box.h);
    const ox = (targetW - box.w * k) / 2 - box.x * k;
    const oy = (targetH - box.h * k) / 2 - box.y * k;
    const rootInv = svg.getScreenCTM()?.inverse();
    const out: Shape[] = [];
    let skipped = 0;
    svg.querySelectorAll(GEOM).forEach((el) => {
      if (el.closest('defs,clipPath,mask,symbol,pattern')) return;
      const g = el as SVGGraphicsElement;
      const d = toPathD(el);
      if (!d) return;
      const ctm = g.getScreenCTM();
      const m = ctm && rootInv ? rootInv.multiply(ctm) : null;
      if (m && (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6)) { skipped++; return; }
      const a = m?.a ?? 1, dd = m?.d ?? 1, e = m?.e ?? 0, f = m?.f ?? 0;
      let bb: DOMRect;
      try { bb = g.getBBox(); } catch { return; }
      if (!bb.width && !bb.height) return;
      const cs = getComputedStyle(el);
      const fillRaw = cs.fill;
      const strokeRaw = cs.stroke;
      const fill = !fillRaw || fillRaw === 'none' ? 'none' : fillRaw.startsWith('url') ? '#8a94a6' : fillRaw;
      const stroke = !strokeRaw || strokeRaw === 'none' ? undefined : strokeRaw.startsWith('url') ? '#8a94a6' : strokeRaw;
      const sw = parseFloat(cs.strokeWidth || '1') * Math.abs(a) * k;
      const op = parseFloat(cs.opacity || '1') * parseFloat(cs.fillOpacity || '1');
      const wx = (a * bb.x + e) * k + ox, wy = (dd * bb.y + f) * k + oy;
      const ww = Math.max(0.01, a * bb.width * k), wh = Math.max(0.01, dd * bb.height * k);
      out.push({
        id: uid('s'), type: 'path', name: el.getAttribute('id') || el.tagName.toLowerCase(),
        d, vb: [bb.x, bb.y, bb.width || 0.01, bb.height || 0.01], x: wx, y: wy, w: ww, h: wh,
        fill, stroke, strokeWidth: stroke ? Math.max(0.2, sw) : undefined, opacity: op < 1 ? op : undefined,
      } as Shape);
    });
    return { shapes: out, skipped };
  } finally {
    host.remove();
  }
}

export async function imageSize(href: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth || 100, h: img.naturalHeight || 100 });
    img.onerror = () => res({ w: 100, h: 100 });
    img.src = href;
  });
}
