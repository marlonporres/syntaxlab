import { analyzeGrammar, predictiveParse } from "../formal";
import type { Grammar, LL1Analysis, PredictiveResult } from "../formal";

export const LL1_PRESET = "S -> a S | c A\nA -> b A | c B | ε\nB -> c B | a | ε";
export const SHIFT_PRESET = "U -> a\nV -> U b\nW -> c d\nX -> e\nZ -> V X f\nS -> V W Z";
export const PYTHON_PRESET = "import tensorflow as tf\nx = tf.constant(3)\nprint(x)";
export const PYTHON_BNF = "<programa> → <importacion> <asignacion> <print>\n<importacion> → import tensorflow as tf\n<asignacion> → id = <valor>\n<valor> → numero | tf . constant ( numero )\n<print> → print ( id )\n\nTokens léxicos: id = identificador no reservado; numero = literal decimal sin signo. Los lexemas concretos se muestran en las hojas.";
export const ruleText = (p: Grammar["productions"][number]) => `${p.lhs} → ${p.rhs.join(" ") || "ε"}`;

/** Adapter for classroom productions; all FIRST/FOLLOW and LL(1) work uses formal.ts. */
export function readGrammar(source: string, start?: string): Grammar {
  if (source.length > 10000) throw new Error("La gramática admite hasta 10000 caracteres.");
  const productions: Grammar["productions"] = [];
  for (const line of source.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    const match = /^([A-Z][A-Za-z0-9_']*)\s*(?:->|→)\s*(.+)$/.exec(line);
    if (!match) throw new Error(`Regla inválida: ${line}. Usa A -> a B | ε.`);
    for (const choice of match[2].split("|")) {
      const rhs = choice.trim() === "ε" ? [] : choice.trim().split(/\s+/);
      if (!choice.trim() || rhs.includes("ε") || rhs.some(s => /->|→/.test(s))) throw new Error("Una alternativa vacía se escribe ε; separa los símbolos con espacios.");
      const item = { lhs: match[1], rhs };
      if (!productions.some(p => p.lhs === item.lhs && p.rhs.join(" ") === rhs.join(" "))) productions.push(item);
    }
  }
  if (!productions.length) throw new Error("Escribe al menos una producción.");
  const names = new Set(productions.map(p => p.lhs));
  const missing = productions.flatMap(p => p.rhs).find(s => /^[A-Z]/.test(s) && !names.has(s));
  if (missing) throw new Error(`Falta definir el no terminal ${missing}.`);
  const grammar = { start: start || productions[0].lhs, productions };
  analyzeGrammar(grammar); // The shared engine validates reserved symbols and size bounds.
  return grammar;
}

export function inputTokens(input: string, terminals: string[]): string[] {
  const text = input.trim();
  if (!text || text === "ε") return [];
  if (/\s/.test(text)) return text.split(/\s+/);
  return terminals.every(t => t.length === 1) ? [...text] : [text];
}

export function runLL1(source: string, input: string): { analysis: LL1Analysis; result: PredictiveResult } {
  const analysis = analyzeGrammar(readGrammar(source));
  return { analysis, result: predictiveParse(analysis, inputTokens(input, analysis.terminals)) };
}

export interface FactorStep { left: string; alpha: string[]; helper: string; before: string[]; after: string[]; }
export function factorLeft(source: string): { grammar: Grammar; steps: FactorStep[]; text: string } {
  const original = readGrammar(source);
  const productions = original.productions.map(p => ({ lhs: p.lhs, rhs: [...p.rhs] }));
  const steps: FactorStep[] = [];
  for (let pass = 0; pass < 100; pass++) {
    let best: { lhs: string; prefix: string[] } | null = null;
    for (const a of productions) for (const b of productions) {
      if (a === b || a.lhs !== b.lhs) continue;
      let length = 0;
      while (length < a.rhs.length && a.rhs[length] === b.rhs[length]) length++;
      if (length && (!best || length > best.prefix.length)) best = { lhs: a.lhs, prefix: a.rhs.slice(0, length) };
    }
    if (!best) return { grammar: { ...original, productions }, steps, text: productions.map(ruleText).join("\n") };
    const { lhs, prefix } = best;
    const group = productions.filter(p => p.lhs === lhs && prefix.every((s, i) => p.rhs[i] === s));
    let helper = `${lhs}'`;
    while (productions.some(p => p.lhs === helper)) helper += "'";
    const replacements = [{ lhs, rhs: [...prefix, helper] }, ...group.map(p => ({ lhs: helper, rhs: p.rhs.slice(prefix.length) }))];
    steps.push({ left: lhs, alpha: prefix, helper, before: group.map(ruleText), after: replacements.map(ruleText) });
    const at = productions.indexOf(group[0]);
    for (let i = productions.length - 1; i >= 0; i--) if (group.includes(productions[i])) productions.splice(i, 1);
    productions.splice(at, 0, ...replacements);
  }
  throw new Error("La factorización alcanzó el límite de 100 transformaciones.");
}

interface LRItem { production: number; dot: number; }
type LRAction = { kind: "shift"; state: number } | { kind: "reduce"; production: number } | { kind: "accept" };
export interface ShiftStep { step: number; stack: string[]; remaining: string[]; action: string; }
export interface ShiftResult { accepted: boolean; trace: ShiftStep[]; conflicts: string[]; states: string[][]; error?: string; }

/** Canonical LR(0) item sets plus FOLLOW reductions: an actual bounded SLR parser. */
export function shiftReduce(source: string, input: string, start = "S"): ShiftResult {
  const grammar = readGrammar(source, start);
  const analysis = analyzeGrammar(grammar);
  const nonterminals = new Set(analysis.nonterminals);
  let augmented = `${grammar.start}'`;
  while (nonterminals.has(augmented)) augmented += "'";
  const productions = [{ lhs: augmented, rhs: [grammar.start] }, ...grammar.productions];
  const key = (items: LRItem[]) => items.map(i => `${i.production}:${i.dot}`).sort().join("|");
  const closure = (initial: LRItem[]) => {
    const items = [...initial];
    for (let i = 0; i < items.length; i++) {
      const symbol = productions[items[i].production].rhs[items[i].dot];
      if (!nonterminals.has(symbol)) continue;
      productions.forEach((p, index) => {
        if (p.lhs === symbol && !items.some(it => it.production === index && it.dot === 0)) items.push({ production: index, dot: 0 });
      });
    }
    return items;
  };
  const states = [closure([{ production: 0, dot: 0 }])];
  const ids = new Map([[key(states[0]), 0]]);
  const transitions = new Map<string, number>();
  for (let i = 0; i < states.length; i++) {
    if (states.length > 256) throw new Error("La construcción SLR supera 256 estados.");
    const symbols = new Set(states[i].map(it => productions[it.production].rhs[it.dot]).filter(Boolean));
    for (const symbol of symbols) {
      const next = closure(states[i].filter(it => productions[it.production].rhs[it.dot] === symbol).map(it => ({ ...it, dot: it.dot + 1 })));
      const signature = key(next);
      let id = ids.get(signature);
      if (id === undefined) { id = states.length; states.push(next); ids.set(signature, id); }
      transitions.set(JSON.stringify([i, symbol]), id);
    }
  }
  const actions = new Map<string, LRAction[]>();
  const add = (state: number, symbol: string, action: LRAction) => {
    const k = JSON.stringify([state, symbol]);
    const cell = actions.get(k) ?? [];
    if (!cell.some(a => JSON.stringify(a) === JSON.stringify(action))) cell.push(action);
    actions.set(k, cell);
  };
  states.forEach((items, state) => items.forEach(item => {
    const p = productions[item.production];
    const symbol = p.rhs[item.dot];
    if (symbol && !nonterminals.has(symbol)) add(state, symbol, { kind: "shift", state: transitions.get(JSON.stringify([state, symbol]))! });
    else if (item.dot === p.rhs.length) {
      if (item.production === 0) add(state, "$", { kind: "accept" });
      else for (const lookahead of analysis.follow[p.lhs]) add(state, lookahead, { kind: "reduce", production: item.production });
    }
  }));
  const conflicts = [...actions].filter(([, list]) => list.length > 1).map(([cell]) => `Conflicto SLR en ${cell}.`);
  const stateLabels = states.map(items => items.map(item => { const p = productions[item.production]; const rhs = [...p.rhs]; rhs.splice(item.dot, 0, "·"); return `${p.lhs} → ${rhs.join(" ")}`; }));
  const tokens = inputTokens(input, analysis.terminals);
  if (tokens.length > 256) throw new Error("Máximo 256 tokens de entrada.");
  const remaining = [...tokens, "$"];
  const stateStack = [0], symbols: string[] = [], trace: ShiftStep[] = [];
  let cursor = 0;
  const record = (action: string) => trace.push({ step: trace.length, stack: ["0", ...symbols.flatMap((symbol, i) => [symbol, String(stateStack[i + 1])])], remaining: remaining.slice(cursor), action });
  const reject = (error: string): ShiftResult => { record(`Error: ${error}`); return { accepted: false, trace, states: stateLabels, conflicts, error }; };
  if (conflicts.length) return reject("La tabla tiene conflictos; no se elige una acción arbitraria.");
  if (tokens.some(t => !analysis.terminals.includes(t))) return reject("La entrada contiene un token ajeno al alfabeto.");
  for (let step = 0; step < 2048; step++) {
    const cell = actions.get(JSON.stringify([stateStack.at(-1), remaining[cursor]]));
    if (!cell?.length) return reject(`No hay acción con ${remaining[cursor]} en el estado ${stateStack.at(-1)}.`);
    const action = cell[0];
    if (action.kind === "accept") { record("Aceptar"); return { accepted: true, trace, states: stateLabels, conflicts }; }
    if (action.kind === "shift") { record(`Desplazar ${remaining[cursor]}`); symbols.push(remaining[cursor++]); stateStack.push(action.state); }
    else {
      const p = productions[action.production];
      record(`Reducir por ${ruleText(p)}`);
      if (p.rhs.length) { symbols.splice(-p.rhs.length); stateStack.splice(-p.rhs.length); }
      const next = transitions.get(JSON.stringify([stateStack.at(-1), p.lhs]));
      if (next === undefined) return reject("No existe transición GOTO tras la reducción.");
      symbols.push(p.lhs); stateStack.push(next);
    }
  }
  return reject("Se alcanzó el límite de 2048 pasos.");
}

export interface ClassroomNode { id: string; label: string; children: ClassroomNode[]; symbol?: string; }
export interface ClassroomGraph { nodes: { id: string; label: string; role: "root" | "internal" | "token" }[]; edges: { source: string; target: string }[]; }
export function graphFromTree(root: ClassroomNode): ClassroomGraph {
  const graph: ClassroomGraph = { nodes: [], edges: [] };
  const visit = (node: ClassroomNode, parent?: ClassroomNode) => {
    graph.nodes.push({ id: node.id, label: node.label, role: !parent ? "root" : node.children.length ? "internal" : "token" });
    if (parent) graph.edges.push({ source: parent.id, target: node.id });
    node.children.forEach(child => visit(child, node));
  };
  visit(root); return graph;
}

/** A concrete derivation tree and operator AST from the same parsed expression. */
export function expressionTrees(source: string): { cst: ClassroomNode; ast: ClassroomNode } {
  if (source.length > 2000) throw new Error("Máximo 2000 caracteres por expresión.");
  const tokens = source.match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[^\s]/g) ?? [];
  if (!tokens.length || tokens.length > 256) throw new Error("Escribe una expresión de hasta 256 tokens.");
  let cursor = 0, serial = 0, depth = 0;
  const node = (label: string, children: ClassroomNode[] = []): ClassroomNode => ({ id: `expr-${serial++}`, label, children });
  const primary = (): { cst: ClassroomNode; ast: ClassroomNode } => {
    if (++depth > 32) throw new Error("Máximo 32 niveles de paréntesis.");
    const token = tokens[cursor++];
    let result: { cst: ClassroomNode; ast: ClassroomNode };
    if (token === "(") {
      const inner = expression();
      if (tokens[cursor++] !== ")") throw new Error("Falta cerrar el paréntesis.");
      result = { cst: node("F", [node("("), inner.cst, node(")")]), ast: inner.ast };
    } else if (token && /^(?:\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*)$/.test(token)) {
      result = { cst: node("F", [node(token)]), ast: node(token) };
    } else throw new Error(`Se esperaba un número, identificador o paréntesis; se encontró ${token ?? "fin"}.`);
    depth--; return result;
  };
  const term = (): { cst: ClassroomNode; ast: ClassroomNode } => {
    const initial = primary(); let cst = node("T", [initial.cst]), ast = initial.ast;
    while (["*", "/"].includes(tokens[cursor])) { const op = tokens[cursor++], right = primary(); cst = node("T", [cst, node(op), right.cst]); ast = node(op, [ast, right.ast]); }
    return { cst, ast };
  };
  const expression = (): { cst: ClassroomNode; ast: ClassroomNode } => {
    const initial = term(); let cst = node("E", [initial.cst]), ast = initial.ast;
    while (["+", "-"].includes(tokens[cursor])) { const op = tokens[cursor++], right = term(); cst = node("E", [cst, node(op), right.cst]); ast = node(op, [ast, right.ast]); }
    return { cst, ast };
  };
  const result = expression();
  if (cursor !== tokens.length) throw new Error(`Token inesperado: ${tokens[cursor]}.`);
  return result;
}

export function pythonDerivation(source: string): { tree: ClassroomNode; steps: { rule: string; form: string }[] } {
  if (source.length > 4000) throw new Error("Máximo 4000 caracteres en el ejemplo BNF.");
  const lines = source.trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length !== 3 || !/^import\s+tensorflow\s+as\s+tf$/.test(lines[0])) throw new Error("Se esperan tres líneas: import tensorflow as tf, una asignación y print(id).");
  const assignment = /^([A-Za-z_]\w*)\s*=\s*(\d+(?:\.\d+)?|tf\s*\.\s*constant\s*\(\s*\d+(?:\.\d+)?\s*\))$/.exec(lines[1]);
  const print = /^print\s*\(\s*([A-Za-z_]\w*)\s*\)$/.exec(lines[2]);
  if (!assignment || !print) throw new Error("La BNF didáctica admite id = número o id = tf.constant(número), seguido de print(id).");
  const reserved = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
  const invalidIdentifier = [assignment[1], print[1]].find(identifier => reserved.has(identifier));
  if (invalidIdentifier) throw new Error(`${invalidIdentifier} es una palabra reservada de Python, no un identificador.`);
  let serial = 0;
  const n = (label: string, children: ClassroomNode[] = [], symbol?: string): ClassroomNode => ({ id: `python-${serial++}`, label, children, ...(symbol ? { symbol } : {}) });
  const valueTokens = assignment[2].match(/\d+(?:\.\d+)?|[A-Za-z_]\w*|[^\s]/g)!;
  // id and numero are lexical terminals, not nonterminals with invented rules.
  const value = n("<valor>", valueTokens.map(token => n(token, [], /^\d/.test(token) ? "numero" : undefined)));
  const tree = n("<programa>", [n("<importacion>", ["import", "tensorflow", "as", "tf"].map(t => n(t))), n("<asignacion>", [n(assignment[1], [], "id"), n("="), value]), n("<print>", [n("print"), n("("), n(print[1], [], "id"), n(")")])]);
  const form = [tree], steps: { rule: string; form: string }[] = [{ rule: "Símbolo inicial", form: tree.label }];
  while (form.some(item => item.children.length)) {
    const at = form.findIndex(item => item.children.length), current = form[at];
    form.splice(at, 1, ...current.children);
    steps.push({ rule: `${current.label} → ${current.children.map(c => c.symbol ?? c.label).join(" ")}`, form: form.map(n => n.label).join(" ") });
  }
  return { tree, steps };
}
