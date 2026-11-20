import { describe, expect, it } from "vitest";
import { expressionTrees, factorLeft, graphFromTree, inputTokens, LL1_PRESET, PYTHON_PRESET, pythonDerivation, readGrammar, runLL1, SHIFT_PRESET, shiftReduce } from "./week10";
import type { Grammar } from "../formal";

function language(grammar: Grammar, maxSteps = 12) {
  const nts = new Set(grammar.productions.map(p => p.lhs));
  const words = new Set<string>();
  let frontier = [[grammar.start]];
  for (let i = 0; i < maxSteps; i++) {
    const next: string[][] = [];
    for (const form of frontier) {
      const at = form.findIndex(s => nts.has(s));
      if (at < 0) { words.add(form.join(" ")); continue; }
      for (const p of grammar.productions.filter(p => p.lhs === form[at])) {
        const result = [...form.slice(0, at), ...p.rhs, ...form.slice(at + 1)];
        if (result.length <= 7) next.push(result);
      }
    }
    frontier = next;
  }
  return [...words].sort();
}

describe("factorización a la izquierda", () => {
  it("extrae el prefijo y conserva las alternativas vacías", () => {
    const result = factorLeft("S -> a b | a c | a");
    expect(result.steps[0].alpha).toEqual(["a"]);
    expect(result.text).toContain("S' → ε");
    expect(language(result.grammar)).toEqual(["a", "a b", "a c"]);
  });
  it("factoriza prefijos anidados sin cambiar el lenguaje acotado", () => {
    const source = "S -> a b c | a b d | a e | f";
    const result = factorLeft(source);
    expect(result.steps.length).toBeGreaterThan(1);
    expect(language(result.grammar)).toEqual(language(readGrammar(source)));
  });
  it("elige nombres auxiliares sin colisionar", () => {
    const result = factorLeft("S -> a b | a c\nS' -> x");
    expect(result.steps[0].helper).toBe("S''");
  });
  it("no transforma una gramática ya factorizada", () => expect(factorLeft("S -> a | b").steps).toEqual([]));
  it("rechaza alternativas vacías y símbolos no definidos", () => {
    expect(() => readGrammar("S -> a |")).toThrow();
    expect(() => readGrammar("S -> A")).toThrow(/Falta definir/);
    expect(() => readGrammar("S -> ε a")).toThrow();
  });
});

describe("LL(1) sobre el motor compartido", () => {
  it("calcula FIRST, FOLLOW y reconoce acbb del ejemplo de clase", () => {
    const { analysis, result } = runLL1(LL1_PRESET, "acbb");
    expect(analysis.first.S).toEqual(["a", "c"]);
    expect(analysis.first.A).toEqual(["b", "c", "ε"]);
    expect(analysis.follow.B).toEqual(["$"]);
    expect(analysis.isLL1).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.trace.at(-1)?.action).toBe("Aceptar");
    expect(result.trace[0].stack).toEqual(["S", "$"]);
  });
  it("rechaza cadena ajena y conserva la traza de error", () => {
    const { result } = runLL1(LL1_PRESET, "ab");
    expect(result.accepted).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.trace.length).toBeGreaterThan(1);
  });
  it("detecta conflictos sin elegir una alternativa", () => {
    const { analysis, result } = runLL1("S -> a b | a c", "ab");
    expect(analysis.table.S.a).toHaveLength(2);
    expect(analysis.isLL1).toBe(false);
    expect(result.accepted).toBe(false);
    expect(result.consumed).toBe(0);
  });
  it("acepta epsilon y tokens de varias letras separados", () => {
    expect(runLL1("S -> id S | ε", "id id").result.accepted).toBe(true);
    expect(runLL1("S -> ε", "ε").result.accepted).toBe(true);
    expect(inputTokens("acbb", ["a", "b", "c"])).toEqual(["a", "c", "b", "b"]);
  });
});

describe("análisis ascendente SLR", () => {
  it("preserva y rechaza abcdef con las producciones suministradas", () => {
    const result = shiftReduce(SHIFT_PRESET, "abcdef");
    expect(result.conflicts).toEqual([]);
    expect(result.accepted).toBe(false);
    expect(result.trace.some(row => row.action === "Reducir por U → a")).toBe(true);
    expect(result.trace.at(-1)?.action).toMatch(/^Error:/);
  });
  it("acepta la cadena que realmente deriva S: abcdabef", () => {
    const result = shiftReduce(SHIFT_PRESET, "abcdabef");
    expect(result.accepted).toBe(true);
    expect(result.trace.at(-2)?.action).toBe("Reducir por S → V W Z");
    expect(result.trace.at(-1)?.action).toBe("Aceptar");
    expect(result.states.length).toBeGreaterThan(5);
  });
  it("maneja recursividad izquierda y precedencia declarada en la gramática", () => {
    const result = shiftReduce("E -> E + T | T\nT -> T * F | F\nF -> id", "id + id * id", "E");
    expect(result.accepted).toBe(true);
    const reductions = result.trace.map(r => r.action);
    expect(reductions.indexOf("Reducir por T → T * F")).toBeLessThan(reductions.indexOf("Reducir por E → E + T"));
  });
  it("rechaza gramáticas SLR conflictivas sin acción arbitraria", () => {
    const result = shiftReduce("S -> S S | a", "aaa");
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.accepted).toBe(false);
    expect(result.trace).toHaveLength(1);
  });
  it("reduce epsilon sin extraer símbolos de la pila", () => {
    expect(shiftReduce("S -> a S | ε", "aaa").accepted).toBe(true);
    expect(shiftReduce("S -> ε", "").accepted).toBe(true);
  });
  it("informa símbolos desconocidos y un inicio no definido", () => {
    expect(shiftReduce("S -> a", "b").error).toMatch(/alfabeto/);
    expect(() => shiftReduce("A -> a", "a", "S")).toThrow();
  });
});

describe("árboles construidos desde expresiones", () => {
  it("12 + 3 * 5 conserva prioridad y cinco nodos AST", () => {
    const { cst, ast } = expressionTrees("12 + 3 * 5");
    expect(ast.label).toBe("+");
    expect(ast.children.map(n => n.label)).toEqual(["12", "*"]);
    expect(ast.children[1].children.map(n => n.label)).toEqual(["3", "5"]);
    expect(graphFromTree(ast).nodes).toHaveLength(5);
    expect(graphFromTree(cst).nodes.length).toBeGreaterThan(5);
    expect(graphFromTree(cst).nodes.filter(n => n.role === "root")).toHaveLength(1);
  });
  it("los paréntesis afectan la estructura pero no aparecen en AST", () => {
    const { cst, ast } = expressionTrees("(12 + 3) * 5");
    expect(ast.label).toBe("*");
    expect(graphFromTree(ast).nodes.some(n => n.label === "(")).toBe(false);
    expect(graphFromTree(cst).nodes.some(n => n.label === "(")).toBe(true);
  });
  it("conserva asociatividad izquierda de la resta y entrada propia", () => {
    const { ast } = expressionTrees("saldo - pago - ajuste");
    expect(ast.label).toBe("-");
    expect(ast.children[0].label).toBe("-");
    expect(ast.children[1].label).toBe("ajuste");
  });
  it.each(["", "3 +", "(3 + 2", "3 2", "2 @ 3", "2 ** 3"])("rechaza %s sin fabricar árboles", input => expect(() => expressionTrees(input)).toThrow());
});

describe("BNF Python didáctica", () => {
  it("deriva importación, asignación y print desde programa", () => {
    const result = pythonDerivation(PYTHON_PRESET);
    expect(result.tree.label).toBe("<programa>");
    expect(result.tree.children.map(n => n.label)).toEqual(["<importacion>", "<asignacion>", "<print>"]);
    expect(result.steps.at(-1)?.form).toBe("import tensorflow as tf x = tf . constant ( 3 ) print ( x )");
  });
  it("calcula otro programa sin reutilizar nodos estáticos", () => {
    const result = pythonDerivation("import tensorflow as tf\nvalor = 42\nprint(valor)");
    expect(result.steps.at(-1)?.form).toBe("import tensorflow as tf valor = 42 print ( valor )");
  });
  it("mantiene identificadores y números como hojas léxicas, no reglas BNF inventadas", () => {
    const result = pythonDerivation("import tensorflow as tf\nvalor = 42\nprint(valor)");
    expect(result.steps.map(step => step.rule)).toEqual([
      "Símbolo inicial",
      "<programa> → <importacion> <asignacion> <print>",
      "<importacion> → import tensorflow as tf",
      "<asignacion> → id = <valor>",
      "<valor> → numero",
      "<print> → print ( id )",
    ]);
    const graph = graphFromTree(result.tree);
    expect(graph.nodes.filter(node => node.label === "valor")).toHaveLength(2);
    expect(graph.nodes.filter(node => node.label === "valor" || node.label === "42").every(node => node.role === "token")).toBe(true);
  });
  it.each(["import", "class", "True", "await"])("rechaza %s como nombre de variable Python", name => {
    expect(() => pythonDerivation(`import tensorflow as tf\n${name} = 3\nprint(${name})`)).toThrow(/reservada/);
  });
  it("no confunde palabras contextuales ni nombres incorporados con palabras reservadas", () => {
    expect(pythonDerivation("import tensorflow as tf\nmatch = 3\nprint(match)").steps.at(-1)?.form).toContain("match = 3");
    expect(pythonDerivation("import tensorflow as tf\nvalue = 3\nprint(print)").tree.label).toBe("<programa>");
  });
  it("rechaza contenido fuera del subconjunto completo", () => {
    expect(() => pythonDerivation("import tensorflow as tf\nx = call()\nprint(x)")).toThrow();
    expect(() => pythonDerivation(`${PYTHON_PRESET}\nprint(x)`)).toThrow();
  });
});
