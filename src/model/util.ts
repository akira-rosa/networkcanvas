import type { Paint } from './types';

export const uid = (p = '') =>
  p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const snap = (v: number, step: number) => Math.round(v / step) * step;
export const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }

export const rectsIntersect = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const rectContains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export function unionRects(rs: Rect[]): Rect | null {
  if (!rs.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rs) {
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const normRect = (a: Pt, b: Pt): Rect => ({
  x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
});

/* ---------- colour ---------- */

export function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

/** amt > 0 lightens towards white, < 0 darkens towards black */
export function shade(hex: string, amt: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  return '#' + rgb.map((c) => toHex(c + (t - c) * p)).join('');
}

export function resolvePaint(p: Paint | undefined, accent: string): string | undefined {
  if (!p) return undefined;
  switch (p) {
    case 'accent': return accent;
    case 'accent-light': return shade(accent, 0.28);
    case 'accent-lighter': return shade(accent, 0.55);
    case 'accent-dark': return shade(accent, -0.28);
    case 'accent-darker': return shade(accent, -0.5);
    default: return p;
  }
}

export const isAccentToken = (p?: string) => !!p && p.startsWith('accent');

export function readableOn(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#fff';
  const [r, g, b] = rgb;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111' : '#fff';
}

/** JSON with object keys sorted (arrays keep order): stable diffs in git. */
export function stableStringify(value: unknown, indent = 1): string {
  const sort = (v: any): any => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    return v;
  };
  return JSON.stringify(sort(value), null, indent);
}

export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function downloadText(name: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  downloadBlob(name, blob);
}

export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export const readFileText = (f: File) => f.text();
export const readFileDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(f);
  });

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = (e: { ctrlKey: boolean; metaKey: boolean }) => (isMac ? e.metaKey : e.ctrlKey);
