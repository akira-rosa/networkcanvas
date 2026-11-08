// Simple hierarchical ("tree") auto-layout for a set of devices on a page.
import type { DiagramNode, Page } from './types';

export interface LayoutResult { positions: Record<string, { x: number; y: number }> }

/**
 * Lays out `ids` (devices and other movable nodes) as a top-down tree using the
 * page's links as edges. The root is the node with the most links (ties: top-most).
 * Unconnected nodes go in a row underneath. Returns new top-left positions.
 */
export function treeLayout(page: Page, ids: string[], opts: { hGap?: number; vGap?: number } = {}): LayoutResult {
  const hGap = opts.hGap ?? 40, vGap = opts.vGap ?? 90;
  // only devices move; annotations, zones and blocks stay where they are
  const set = new Set(ids.filter((id) => page.nodes[id]?.kind === 'device'));
  const nodes = [...set].map((id) => page.nodes[id]);
  if (nodes.length < 2) return { positions: {} };

  const adj = new Map<string, Set<string>>();
  for (const id of set) adj.set(id, new Set());
  for (const l of Object.values(page.links)) {
    if (set.has(l.from.node) && set.has(l.to.node) && l.from.node !== l.to.node) {
      adj.get(l.from.node)!.add(l.to.node);
      adj.get(l.to.node)!.add(l.from.node);
    }
  }

  const bounds = { x: Math.min(...nodes.map((n) => n.x)), y: Math.min(...nodes.map((n) => n.y)) };
  const positions: Record<string, { x: number; y: number }> = {};
  const visited = new Set<string>();
  const labelPad = (n: DiagramNode) => (n.kind === 'device' ? 14 + 13.5 * (1 + n.addresses.length + (n.subtitle ? 1 : 0)) : 0);

  // forests: one tree per connected component, roots chosen by degree
  const components: string[][] = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp: string[] = [];
    const stack = [n.id];
    visited.add(n.id);
    while (stack.length) {
      const id = stack.pop()!;
      comp.push(id);
      for (const m of adj.get(id)!) if (!visited.has(m)) { visited.add(m); stack.push(m); }
    }
    components.push(comp);
  }

  let cursorX = bounds.x;
  let maxBottom = bounds.y;
  const singles: string[] = [];
  for (const comp of components) {
    if (comp.length === 1) { singles.push(comp[0]); continue; }
    // root = graph centre (smallest eccentricity), ties broken by degree then position
    const ecc = new Map<string, number>();
    for (const start of comp) {
      const dist = new Map<string, number>([[start, 0]]);
      const q = [start];
      let far = 0;
      while (q.length) { const id = q.shift()!; for (const m of adj.get(id)!) if (!dist.has(m)) { dist.set(m, dist.get(id)! + 1); far = Math.max(far, dist.get(m)!); q.push(m); } }
      ecc.set(start, far);
    }
    const root = comp.slice().sort((a, b) => ecc.get(a)! - ecc.get(b)! || adj.get(b)!.size - adj.get(a)!.size || page.nodes[a].y - page.nodes[b].y || page.nodes[a].x - page.nodes[b].x)[0];
    // BFS tree
    const parent = new Map<string, string | null>([[root, null]]);
    const children = new Map<string, string[]>();
    const queue = [root];
    const depth = new Map<string, number>([[root, 0]]);
    while (queue.length) {
      const id = queue.shift()!;
      const kids = [...adj.get(id)!].filter((m) => !parent.has(m)).sort((a, b) => page.nodes[a].x - page.nodes[b].x);
      children.set(id, kids);
      for (const k of kids) { parent.set(k, id); depth.set(k, depth.get(id)! + 1); queue.push(k); }
    }
    // subtree widths
    const width = new Map<string, number>();
    const measure = (id: string): number => {
      const kids = children.get(id) ?? [];
      const own = Math.max(page.nodes[id].w, 110) + hGap; // room for the label under the device
      if (!kids.length) { width.set(id, own); return own; }
      const sum = kids.reduce((s, k) => s + measure(k), 0);
      const w = Math.max(own, sum);
      width.set(id, w);
      return w;
    };
    measure(root);
    // row heights per depth
    const rowH = new Map<number, number>();
    for (const [id, d] of depth) rowH.set(d, Math.max(rowH.get(d) ?? 0, page.nodes[id].h + labelPad(page.nodes[id])));
    const rowY = new Map<number, number>();
    let y = bounds.y;
    for (let d = 0; rowH.has(d); d++) { rowY.set(d, y); y += rowH.get(d)! + vGap; }
    maxBottom = Math.max(maxBottom, y);
    // place
    const place = (id: string, x0: number) => {
      const n = page.nodes[id];
      const w = width.get(id)!;
      const d = depth.get(id)!;
      positions[id] = { x: Math.round(x0 + w / 2 - n.w / 2), y: Math.round(rowY.get(d)!) };
      let cx = x0;
      for (const k of children.get(id) ?? []) { place(k, cx); cx += width.get(k)!; }
    };
    place(root, cursorX);
    cursorX += width.get(root)! + hGap * 2;
  }
  if (singles.length) {
    let x = bounds.x;
    for (const id of singles) {
      const n = page.nodes[id];
      positions[id] = { x: Math.round(x), y: Math.round(maxBottom) };
      x += n.w + hGap;
    }
  }
  return { positions };
}
