/** UI-independent graph contract for syntax trees and attribute dependencies. */
export interface ExamAttribute {
  id: string;
  label: string;
  kind: 'synthesized' | 'inherited' | 'lexical' | 'action';
  value?: string | number;
}
export interface ExamGraphNode {
  id: string;
  label: string;
  role: 'root' | 'internal' | 'token';
  attributes?: ExamAttribute[];
}
export interface ExamGraphEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  sourceHandle?: string;
  targetHandle?: string;
}

/** Deterministic ordered tree layout; guards cycles without recursive traversal. */
export function layoutExamGraph(nodes: ExamGraphNode[], edges: ExamGraphEdge[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
    hasParent.add(edge.target);
  }
  const roots = nodes.filter(node => !hasParent.has(node.id));
  const depth = new Map<string, number>();
  const order: string[] = [];
  const queue = [...roots, ...nodes].map(node => ({ id: node.id, depth: 0 }));
  // Visit roots first, completing each tree before any disconnected fallback.
  for (const seed of queue) {
    if (depth.has(seed.id)) continue;
    const pending = [seed];
    for (let index = 0; index < pending.length; index++) {
      const current = pending[index];
      if (depth.has(current.id)) continue;
      depth.set(current.id, current.depth);
      order.push(current.id);
      for (const child of children.get(current.id) ?? []) pending.push({ id: child, depth: current.depth + 1 });
    }
  }
  const widths = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const next = (children.get(id) ?? []).filter(child => depth.get(child) === (depth.get(id) ?? 0) + 1);
    widths.set(id, Math.max(1, next.reduce((sum, child) => sum + (widths.get(child) ?? 1), 0)));
  }
  const rowHeights: number[] = [];
  for (const node of nodes) {
    const row = depth.get(node.id) ?? 0;
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, 108 + (node.attributes?.length ?? 0) * 34);
  }
  const rowY = rowHeights.map((_, index) => rowHeights.slice(0, index).reduce((sum, height) => sum + height + 64, 0));
  const positions = new Map<string, { x: number; y: number }>();
  let offset = 0;
  const pending: { id: string; left: number }[] = [];
  for (const id of order) {
    if (depth.get(id) === 0) {
      pending.push({ id, left: offset });
      offset += widths.get(id) ?? 1;
    }
  }
  for (let index = 0; index < pending.length; index++) {
    const { id, left } = pending[index];
    if (positions.has(id)) continue;
    const level = depth.get(id) ?? 0;
    positions.set(id, { x: (left + ((widths.get(id) ?? 1) - 1) / 2) * 260, y: rowY[level] ?? 0 });
    let childLeft = left;
    for (const child of children.get(id) ?? []) {
      if (depth.get(child) !== level + 1) continue;
      pending.push({ id: child, left: childLeft });
      childLeft += widths.get(child) ?? 1;
    }
  }
  return positions;
}
