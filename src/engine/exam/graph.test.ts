import { describe, expect, it } from 'vitest';
import { layoutExamGraph, type ExamGraphNode } from './graph';

describe('distribución de árboles decorados', () => {
  it('centra el padre y reserva altura para los registros de atributos', () => {
    const nodes: ExamGraphNode[] = [
      { id: 'D', label: 'D', role: 'root', attributes: [{ id: 'D.tipo', label: '.tipo', kind: 'synthesized' }] },
      { id: 'T', label: 'T', role: 'internal' },
      { id: 'L', label: 'L', role: 'internal' },
      { id: 'id', label: 'id', role: 'token' },
    ];
    const positions = layoutExamGraph(nodes, [{ source: 'D', target: 'T' }, { source: 'D', target: 'L' }, { source: 'L', target: 'id' }]);
    expect(positions.size).toBe(4);
    expect(positions.get('D')!.x).toBe((positions.get('T')!.x + positions.get('L')!.x) / 2);
    expect(positions.get('T')!.y).toBe(positions.get('L')!.y);
    expect(positions.get('T')!.y - positions.get('D')!.y).toBeGreaterThanOrEqual(206);
    expect(positions.get('id')!.y).toBeGreaterThan(positions.get('L')!.y);
  });
  it('termina ante ciclos accidentales y admite un árbol vacío', () => {
    const nodes: ExamGraphNode[] = ['a', 'b'].map(id => ({ id, label: id, role: 'internal' }));
    const positions = layoutExamGraph(nodes, [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }]);
    expect(positions.size).toBe(2);
    for (const position of positions.values()) expect(Number.isFinite(position.x + position.y)).toBe(true);
    expect(layoutExamGraph([], []).size).toBe(0);
  });
});
