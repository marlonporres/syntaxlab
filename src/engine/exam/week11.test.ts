import { describe, expect, it } from "vitest";
import {
  buildInheritedDDS, buildSynthesizedDDS, decorationAtStep, topologicalOrder,
  INHERITED_PRESET, SYNTHESIZED_PRESET,
} from "./week11";

describe("DDS sintetizada y grafo de dependencias", () => {
  it.each([
    [SYNTHESIZED_PRESET, 19], ["12 + 3 * 5 n", 27], ["(3 + 5) * 4 n", 32],
    ["2 * 3 * 4 + 5 + 6 n", 35], ["0 n", 0], ["123 + 7 n", 130],
    ["((2)) n", 2], ["2+3*4n", 14],
  ])("calcula %s desde el árbol y no desde respuestas fijas", (source, expected) => {
    const result = buildSynthesizedDDS(source);
    expect(result.output).toBe(expected);
    expect(result.steps.at(-1)?.rule).toBe("print(E.val)");
    expect(result.nodes.filter(node => node.role === "root")).toHaveLength(1);
    expect(result.nodes.find(node => node.role === "root")?.label).toBe("L");
  });
  it("toda dependencia antecede al atributo y apunta a un campo existente", () => {
    const result = buildSynthesizedDDS(SYNTHESIZED_PRESET);
    const completed = new Set(Object.keys(result.initialValues));
    for (const step of result.steps) {
      expect(step.dependsOn.every(id => completed.has(id))).toBe(true);
      completed.add(step.id);
    }
    for (const edge of result.dependencyEdges) {
      expect(result.nodes.find(node => node.id === edge.source)?.attributes?.some(attr => attr.id === edge.sourceHandle)).toBe(true);
      expect(result.nodes.find(node => node.id === edge.target)?.attributes?.some(attr => attr.id === edge.targetHandle)).toBe(true);
    }
    expect(result.nodes.filter(node => node.role === "token").flatMap(node => node.attributes ?? []).every(attr => attr.kind === "lexical")).toBe(true);
  });
  it("conserva paréntesis y cada producción en el árbol concreto", () => {
    const result = buildSynthesizedDDS("(2 + 3) * 4 n");
    expect(result.nodes.map(node => node.label)).toEqual(expect.arrayContaining(["(", ")", "+", "*", "n", "E", "T", "F"]));
    expect(result.steps.some(step => step.production === "F → ( E )")).toBe(true);
  });
  it.each(["", "3 * 5 + 4", "3 + n", "3 + 4 n extra", "2 - 1 n", "2 / 1 n", "-1 n", "2.5 n", "(2 + 3 n", "2 ** 3 n", "2 n n", "@ n"])("rechaza la entrada inválida %s sin resultados fabricados", source => {
    expect(() => buildSynthesizedDDS(source)).toThrow();
  });
  it("limita profundidad, tamaño y pérdida de precisión", () => {
    expect(() => buildSynthesizedDDS("(".repeat(40) + "2" + ")".repeat(40) + " n")).toThrow();
    expect(() => buildSynthesizedDDS("9".repeat(1100))).toThrow();
    expect(() => buildSynthesizedDDS("9007199254740991 + 1 n")).toThrow(/exactos/);
  });
  it("muestra solo atributos ejecutados y revela print en el paso final", () => {
    const result = buildSynthesizedDDS(SYNTHESIZED_PRESET);
    const initial = decorationAtStep(result, 0);
    expect(initial.nodes.flatMap(node => node.attributes ?? []).every(attr => attr.value === undefined)).toBe(true);
    expect(initial.output).toBeUndefined();
    const first = decorationAtStep(result, 1);
    expect(first.nodes.flatMap(node => node.attributes ?? []).filter(attr => attr.value !== undefined)).toHaveLength(1);
    expect(decorationAtStep(result, result.steps.length - 1).output).toBeUndefined();
    expect(decorationAtStep(result, result.steps.length).output).toBe(19);
  });
});

describe("DDS heredada y tabla de símbolos", () => {
  it("evalúa los 10 nodos de dependencia del preset y registra los tres tipos", () => {
    const result = buildInheritedDDS(INHERITED_PRESET);
    expect(result.steps).toHaveLength(10);
    expect(result.steps.map(step => step.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.steps.filter(step => step.kind === "inherited")).toHaveLength(3);
    expect(decorationAtStep(result, 10).symbols).toEqual([
      { name: "id1", type: "real" }, { name: "id2", type: "real" }, { name: "id3", type: "real" },
    ]);
    expect(result.nodes.filter(node => node.role === "token").flatMap(node => node.attributes ?? []).every(attr => attr.kind === "lexical")).toBe(true);
  });
  it("adapta el árbol a la entrada y propaga entero en declaraciones int", () => {
    const result = buildInheritedDDS("int contador, total");
    expect(result.steps).toHaveLength(7);
    expect(decorationAtStep(result, 7).symbols).toEqual([{ name: "contador", type: "entero" }, { name: "total", type: "entero" }]);
    const one = buildInheritedDDS("real x");
    expect(one.steps).toHaveLength(4);
    expect(one.nodes.filter(node => node.label === "L")).toHaveLength(1);
  });
  it("no registra símbolos antes de la acción y revierte el estado al retroceder", () => {
    const result = buildInheritedDDS(INHERITED_PRESET);
    const firstAction = result.steps.find(step => step.symbol)!;
    expect(decorationAtStep(result, firstAction.number - 1).symbols).toEqual([]);
    expect(decorationAtStep(result, firstAction.number).symbols).toEqual([{ name: "id1", type: "real" }]);
    expect(decorationAtStep(result, 0).symbols).toEqual([]);
    expect(decorationAtStep(result, -5).symbols).toEqual([]);
    expect(decorationAtStep(result, NaN).symbols).toEqual([]);
  });
  it("cada L.her depende de su padre o T.tipo y cada añadetipo de entrada y her", () => {
    const result = buildInheritedDDS(INHERITED_PRESET);
    for (const step of result.steps.filter(step => step.kind === "inherited")) {
      expect(step.dependsOn).toHaveLength(1);
      const origin = result.steps.find(candidate => candidate.id === step.dependsOn[0])!;
      expect(["tipo", "her"]).toContain(origin.attribute);
      expect(origin.number).toBeLessThan(step.number);
    }
    for (const step of result.steps.filter(step => step.symbol)) {
      expect(step.dependsOn.map(id => result.steps.find(candidate => candidate.id === id)?.attribute)).toEqual(["entrada", "her"]);
    }
  });
  it.each(["real", "float x", "real x x", "real ,x", "real x,", "real x,x", "int 12", "int real"])("rechaza declaración inválida %s", source => {
    expect(() => buildInheritedDDS(source)).toThrow();
  });
});

describe("orden topológico", () => {
  it("ordena dependencias recibidas fuera de orden y admite valores léxicos iniciales", () => {
    expect(topologicalOrder([{ id: "c", dependsOn: ["b"] }, { id: "a", dependsOn: ["lex"] }, { id: "b", dependsOn: ["a"] }], ["lex"])).toEqual(["a", "b", "c"]);
  });
  it("detecta ciclos, referencias ausentes e ids duplicados", () => {
    expect(() => topologicalOrder([{ id: "a", dependsOn: ["b"] }, { id: "b", dependsOn: ["a"] }])).toThrow(/ciclo/);
    expect(() => topologicalOrder([{ id: "a", dependsOn: ["missing"] }])).toThrow(/no definida/);
    expect(() => topologicalOrder([{ id: "a", dependsOn: [] }, { id: "a", dependsOn: [] }])).toThrow(/únicos/);
  });
});
