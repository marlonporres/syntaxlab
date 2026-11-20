import { describe, expect, it } from "vitest";
import { classifyChomsky, detectRecursion, eliminateLeftRecursion, readGeneralGrammar, WEEK9_PRESETS } from "./week9";

function grammar(source: string) {
  const result = readGeneralGrammar(source);
  expect(result.errors).toEqual([]);
  if (!result.grammar) throw new Error("Gramática inválida en prueba");
  return result.grammar;
}
function words(source: string, max = 4) {
  const g = grammar(source), result = new Set<string>(), queue = [[g.start]], seen = new Set<string>();
  for (let i = 0; i < queue.length && i < 30000; i++) {
    const form = queue[i], key = JSON.stringify(form);
    if (seen.has(key)) continue; seen.add(key);
    if (form.filter(s => !g.nonterminals.includes(s)).length > max || form.length > max * 2 + 4) continue;
    const index = form.findIndex(s => g.nonterminals.includes(s));
    if (index < 0) { result.add(form.join(" ")); continue; }
    for (const rule of g.productions.filter(p => p.left.length === 1 && p.left[0] === form[index])) queue.push([...form.slice(0, index), ...rule.right, ...form.slice(index + 1)]);
  }
  return [...result].sort();
}

describe("Jerarquía de Chomsky", () => {
  it.each([
    ["S -> a S | b", 3], ["S -> S a | b", 3], ["S -> a S b | ε", 2],
    ["S -> A B\nA B -> a b", 1], ["S -> A B\nA B -> a", 0],
  ] as const)("clasifica %s como Tipo %s", (source, type) => expect(classifyChomsky(grammar(source)).type).toBe(type));
  it("no confunde mezcla izquierda/derecha con una gramática regular", () => {
    expect(classifyChomsky(grammar("S -> a A | B b\nA -> a\nB -> b")).type).toBe(2);
  });
  it("respeta la excepción de ε del símbolo inicial", () => {
    expect(classifyChomsky(grammar("S -> A B | ε\nA B -> a b")).type).toBe(1);
    expect(classifyChomsky(grammar("S -> A B | ε\nA B -> S a")).type).toBe(0);
  });
  it("rechaza lados izquierdos terminales y ε incrustada", () => {
    expect(readGeneralGrammar("a -> b").grammar).toBeNull();
    expect(readGeneralGrammar("S -> ε a").grammar).toBeNull();
    expect(readGeneralGrammar("S -> a |").grammar).toBeNull();
  });
  it("conserva e como terminal y admite primas y fragmentos sin inventar reglas", () => {
    const result = readGeneralGrammar("E -> E + T | T\nE' -> e");
    expect(result.grammar?.undefinedSymbols).toEqual(["T"]);
    expect(result.grammar?.productions.at(-1)?.right).toEqual(["e"]);
    expect(result.warnings[0]).toContain("Fragmento");
  });
});

describe("Recursividad y eliminación", () => {
  it("distingue izquierda directa, indirecta y derecha", () => {
    const result = detectRecursion(grammar("A -> A a | B b | c\nB -> A d | e\nR -> r R | s"));
    expect(result.direct).toEqual(["A"]);
    expect(result.indirect.map(p => p.symbol)).toEqual(["A", "B"]);
    expect(result.right).toEqual(["R"]);
  });
  it("detecta recursividad oculta tras un prefijo anulable", () => {
    expect(detectRecursion(grammar("A -> B A c | d\nB -> ε")).indirect[0].symbol).toBe("A");
  });
  it("identifica A, todos los alfa y beta", () => {
    const result = eliminateLeftRecursion(grammar(WEEK9_PRESETS[6]));
    expect(result.complete).toBe(true);
    expect(result.steps[0].alpha).toEqual([["a"], ["b"]]);
    expect(result.steps[0].beta).toEqual([["c"], ["d"]]);
    expect(result.source).toBe("P -> c P' | d P'\nP' -> a P' | b P' | ε");
  });
  it("preserva beta vacía en el ejercicio 9", () => {
    const result = eliminateLeftRecursion(grammar(WEEK9_PRESETS[8]));
    expect(result.source).toBe("S -> S'\nS' -> ( S ) S' | ε");
    expect(result.complete).toBe(true);
    expect(words(result.source)).toEqual(words(WEEK9_PRESETS[8]));
  });
  it.each([0, 1, 4, 6, 7, 9])("preserva cadenas de hasta cuatro terminales en el preset %i", index => {
    const transformed = eliminateLeftRecursion(grammar(WEEK9_PRESETS[index]));
    expect(transformed.complete).toBe(true);
    expect(words(transformed.source)).toEqual(words(WEEK9_PRESETS[index]));
  });
  it("expone y elimina recursividad indirecta por sustitución", () => {
    const source = "A -> B a | c\nB -> A b | d";
    const result = eliminateLeftRecursion(grammar(source));
    expect(result.complete).toBe(true);
    expect(result.steps.some(step => step.kind === "sustitución")).toBe(true);
    expect(detectRecursion(grammar(result.source)).indirect).toEqual([]);
    expect(words(result.source)).toEqual(words(source));
  });
  it("no inventa ε cuando falta beta", () => {
    const result = eliminateLeftRecursion(grammar("A -> A a"));
    expect(result.complete).toBe(false);
    expect(result.source).toBe("A -> A a");
    expect(result.warnings[0]).toContain("no tiene alternativa β");
  });
  it("elimina A → A sin introducir un ciclo nuevo", () => {
    const result = eliminateLeftRecursion(grammar("A -> A | b"));
    expect(result.complete).toBe(true);
    expect(result.source).toBe("A -> b");
  });
  it("elige una prima nueva sin colisionar con reglas existentes", () => {
    const result = eliminateLeftRecursion(grammar("A -> A a | b\nA' -> c"));
    expect(result.source).toContain("A'' -> a A'' | ε");
    expect(result.source).toContain("A' -> c");
  });
  it("los 10 presets oficiales permanecen exactos y la transformación es calculada", () => {
    expect(WEEK9_PRESETS).toHaveLength(10);
    expect(WEEK9_PRESETS[2]).toBe("E -> E + T | E - T | T");
    expect(WEEK9_PRESETS[9]).toBe("C -> C a b | C c | e");
    for (const source of WEEK9_PRESETS) expect(eliminateLeftRecursion(grammar(source)).complete).toBe(true);
  });
  it("no aplica el algoritmo GLC a una producción contextual", () => {
    expect(() => eliminateLeftRecursion(grammar("A B -> a B"))).toThrow("libres de contexto");
  });
});
