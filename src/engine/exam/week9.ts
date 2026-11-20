/** Semana 9: clasificación de la forma de las reglas y transformación de GLC. */
export interface GeneralProduction { left: string[]; right: string[]; line: number }
export interface GeneralGrammar { start: string; productions: GeneralProduction[]; nonterminals: string[]; undefinedSymbols: string[] }
export interface GrammarReading { grammar: GeneralGrammar | null; errors: string[]; warnings: string[] }
export interface ChomskyResult { type: 0 | 1 | 2 | 3; name: string; machine: string; reason: string; regularOrientation?: "izquierda" | "derecha" | "ambas" }
export interface RecursionResult { direct: string[]; indirect: { symbol: string; path: string[] }[]; right: string[]; nullable: string[] }
export interface EliminationStep { symbol: string; kind: "sustitución" | "directa" | "ciclo"; explanation: string; before: string[]; after: string[]; alpha?: string[][]; beta?: string[][] }
export interface EliminationResult { complete: boolean; source: string; steps: EliminationStep[]; warnings: string[] }

export const WEEK9_PRESETS = [
  "S -> S a | b", "A -> A b | A c | d", "E -> E + T | E - T | T",
  "T -> T * F | T / F | F", "L -> L , id | id", "B -> B and C | C",
  "P -> P a | P b | c | d", "X -> X 0 | X 1 | 0 | 1",
  "S -> S ( S ) | ε", "C -> C a b | C c | e",
] as const;

const isNonterminal = (symbol: string) => /^(?:[A-Z][A-Za-z0-9_']*|<[^<>\s]+>)$/u.test(symbol);
export const renderSymbols = (symbols: readonly string[]): string => symbols.join(" ") || "ε";
const renderRule = (left: readonly string[], right: readonly string[]) => `${left.join(" ")} → ${renderSymbols(right)}`;
const uniqueRights = (rights: string[][]): string[][] => [...new Map(rights.map(right => [JSON.stringify(right), right])).values()];

/** Symbols are explicitly separated by spaces; e is a terminal, ε is the empty word. */
export function readGeneralGrammar(source: string): GrammarReading {
  const errors: string[] = [], warnings: string[] = [];
  const productions: GeneralProduction[] = [];
  if (source.length > 10000) return { grammar: null, errors: ["Máximo 10 000 caracteres por gramática."], warnings };
  source.split(/\r\n|\r|\n/u).forEach((raw, index) => {
    if (!raw.trim() || raw.trim().startsWith("#")) return;
    const parts = raw.split(/->|→|::=/u);
    if (parts.length !== 2) { errors.push(`Línea ${index + 1}: escribe una sola flecha de producción.`); return; }
    const left = parts[0].trim().split(/\s+/u);
    if (!left.some(isNonterminal) || left.includes("ε") || left.includes("|")) {
      errors.push(`Línea ${index + 1}: el lado izquierdo debe contener al menos un no terminal y no puede ser ε.`); return;
    }
    for (const rawRight of parts[1].split("|")) {
      const value = rawRight.trim();
      if (!value) { errors.push(`Línea ${index + 1}: usa ε para una alternativa vacía.`); continue; }
      const right = value === "ε" ? [] : value.split(/\s+/u);
      if (right.includes("ε")) { errors.push(`Línea ${index + 1}: ε debe aparecer sola.`); continue; }
      if (left.length > 32 || right.length > 32) { errors.push(`Línea ${index + 1}: máximo 32 símbolos por lado.`); continue; }
      if (!productions.some(p => JSON.stringify([p.left, p.right]) === JSON.stringify([left, right]))) productions.push({ left, right, line: index + 1 });
    }
  });
  if (!productions.length && !errors.length) errors.push("Escribe al menos una producción.");
  if (productions.length > 100) errors.push("Máximo 100 producciones.");
  if (errors.length) return { grammar: null, errors, warnings };
  const nonterminals = [...new Set(productions.flatMap(p => [...p.left, ...p.right]).filter(isNonterminal))];
  const defined = new Set(productions.flatMap(p => p.left.filter(isNonterminal)));
  const undefinedSymbols = nonterminals.filter(symbol => !defined.has(symbol));
  if (undefinedSymbols.length) warnings.push(`Fragmento de gramática: ${undefinedSymbols.join(", ")} no tiene producciones. Se estudian las reglas dadas sin inventar las restantes.`);
  return { grammar: { start: productions[0].left.find(isNonterminal)!, productions, nonterminals, undefinedSymbols }, errors, warnings };
}

/** Classifies these productions, not the smallest language class obtainable by an equivalent grammar. */
export function classifyChomsky(grammar: GeneralGrammar): ChomskyResult {
  const { productions, nonterminals, start } = grammar;
  const nt = new Set(nonterminals);
  const contextFree = productions.every(p => p.left.length === 1 && nt.has(p.left[0]));
  if (contextFree) {
    let leftLinear = true, rightLinear = true;
    for (const p of productions) {
      const positions = p.right.flatMap((symbol, index) => nt.has(symbol) ? [index] : []);
      if (positions.length > 1) { leftLinear = false; rightLinear = false; }
      else if (positions.length === 1) { leftLinear &&= positions[0] === 0; rightLinear &&= positions[0] === p.right.length - 1; }
    }
    if (leftLinear || rightLinear) return {
      type: 3, name: "Regular", machine: "Autómata Finito",
      regularOrientation: leftLinear && rightLinear ? "ambas" : leftLinear ? "izquierda" : "derecha",
      reason: "Cada lado izquierdo es un no terminal y las alternativas son lineales con una orientación uniforme. Se admiten bloques de terminales y ε (forma regular extendida).",
    };
    return { type: 2, name: "Libre de contexto", machine: "Autómata de Pila", reason: "Todas las reglas tienen forma A → ω; no todas mantienen la misma orientación regular." };
  }
  const startOnRight = productions.some(p => p.right.includes(start));
  const noncontracting = productions.every(p => p.right.length >= p.left.length || (p.left.length === 1 && p.left[0] === start && p.right.length === 0 && !startOnRight));
  if (noncontracting) return { type: 1, name: "Sensible al contexto", machine: "Autómata Linealmente Acotado", reason: "Las reglas no acortan la cadena (forma no contractiva, equivalente en poder a α A β → α ω β, con ω ≠ ε). Excepción: S → ε solo si S no aparece a la derecha." };
  return { type: 0, name: "Sin restricciones", machine: "Máquina de Turing", reason: "Hay un lado izquierdo contextual y alguna regla contractiva que no satisface la excepción del símbolo inicial." };
}

function requireContextFree(grammar: GeneralGrammar): void {
  if (!grammar.productions.every(p => p.left.length === 1 && isNonterminal(p.left[0]))) throw new Error("La detección y eliminación de recursividad se aplica a gramáticas libres de contexto: un no terminal a la izquierda.");
}

export function detectRecursion(grammar: GeneralGrammar): RecursionResult {
  requireContextFree(grammar);
  const nt = new Set(grammar.nonterminals), nullable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of grammar.productions) if (!nullable.has(p.left[0]) && p.right.every(s => nullable.has(s))) { nullable.add(p.left[0]); changed = true; }
  }
  const graph = new Map(grammar.nonterminals.map(s => [s, new Set<string>()]));
  for (const p of grammar.productions) for (const s of p.right) {
    if (nt.has(s)) graph.get(p.left[0])!.add(s);
    if (!nullable.has(s)) break;
  }
  const direct = [...new Set(grammar.productions.filter(p => p.right[0] === p.left[0]).map(p => p.left[0]))];
  const indirect: RecursionResult["indirect"] = [];
  for (const start of grammar.nonterminals) {
    const queue: string[][] = [[start]], visited = new Set([start]);
    let path: string[] | undefined;
    for (let index = 0; index < queue.length && !path; index++) {
      const current = queue[index];
      for (const next of graph.get(current.at(-1)!) ?? []) {
        if (next === start && current.length > 1) { path = [...current, next]; break; }
        if (next === start && current.length === 1 && !direct.includes(start)) { path = [start, "prefijo anulable", start]; break; }
        if (!visited.has(next)) { visited.add(next); queue.push([...current, next]); }
      }
    }
    if (path) indirect.push({ symbol: start, path });
  }
  const right = [...new Set(grammar.productions.filter(p => p.right.length > 1 && p.right.at(-1) === p.left[0]).map(p => p.left[0]))];
  return { direct, indirect, right, nullable: [...nullable] };
}

function serializeRules(order: string[], rules: Map<string, string[][]>): string {
  return order.map(symbol => `${symbol} -> ${(rules.get(symbol) ?? []).map(renderSymbols).join(" | ")}`).join("\n");
}

/** Ordered substitution followed by immediate elimination; never invents a β. */
export function eliminateLeftRecursion(grammar: GeneralGrammar): EliminationResult {
  requireContextFree(grammar);
  const order = [...new Set(grammar.productions.map(p => p.left[0]))];
  const originalOrder = [...order];
  const rules = new Map(order.map(symbol => [symbol, grammar.productions.filter(p => p.left[0] === symbol).map(p => [...p.right])]));
  const steps: EliminationStep[] = [], warnings: string[] = [];
  const occupied = new Set(grammar.nonterminals);
  const snapshot = () => serializeRules(order, rules);
  const describe = (symbol: string, rights: string[][]) => rights.map(right => renderRule([symbol], right));
  for (let i = 0; i < originalOrder.length; i++) {
    const symbol = originalOrder[i];
    for (let j = 0; j < i; j++) {
      const previous = originalOrder[j], before = rules.get(symbol)!;
      if (!before.some(right => right[0] === previous)) continue;
      const after = uniqueRights(before.flatMap(right => right[0] === previous ? rules.get(previous)!.map(replacement => [...replacement, ...right.slice(1)]) : [right]));
      if (after.length > 256 || after.some(right => right.length > 128)) return { complete: false, source: snapshot(), steps, warnings: ["La sustitución alcanzó el límite de tamaño. No se declara terminada la eliminación."] };
      rules.set(symbol, after);
      steps.push({ symbol, kind: "sustitución", explanation: `Sustituir ${previous} en las alternativas de ${symbol} para exponer la recursividad indirecta.`, before: describe(symbol, before), after: describe(symbol, after) });
    }
    const before = rules.get(symbol)!;
    const alpha = before.filter(right => right[0] === symbol && right.length > 1).map(right => right.slice(1));
    const selfLoop = before.some(right => right.length === 1 && right[0] === symbol);
    const beta = before.filter(right => right[0] !== symbol);
    if (!alpha.length && !selfLoop) continue;
    if (!beta.length) {
      warnings.push(`${symbol} no tiene alternativa β. La fórmula no se puede aplicar: añadir ε cambiaría su lenguaje. Ninguna derivación de ${symbol} puede terminar con estas reglas.`);
      return { complete: false, source: snapshot(), steps, warnings };
    }
    if (selfLoop) steps.push({ symbol, kind: "ciclo", explanation: `${symbol} → ${symbol} no añade cadenas; se elimina ese ciclo improductivo.`, before: [renderRule([symbol], [symbol])], after: [], alpha: [[]], beta });
    if (!alpha.length) { rules.set(symbol, beta); continue; }
    let fresh = `${symbol}'`;
    while (occupied.has(fresh)) fresh += "'";
    occupied.add(fresh);
    const newParent = beta.map(right => [...right, fresh]);
    const newTail = [...alpha.map(right => [...right, fresh]), []];
    rules.set(symbol, newParent); rules.set(fresh, newTail);
    order.splice(order.indexOf(symbol) + 1, 0, fresh);
    steps.push({ symbol, kind: "directa", explanation: `A = ${symbol}. Aplicar A → β A' y A' → α A' | ε; el nuevo no terminal es ${fresh}.`, before: describe(symbol, before), after: [...describe(symbol, newParent), ...describe(fresh, newTail)], alpha, beta });
  }
  const source = snapshot(), final = readGeneralGrammar(source).grammar;
  if (!final) return { complete: false, source, steps, warnings: ["La transformación produjo una gramática fuera de los límites del laboratorio."] };
  const remaining = detectRecursion(final);
  const complete = !remaining.direct.length && !remaining.indirect.length;
  if (!complete) warnings.push("Queda recursividad a través de prefijos anulables o ciclos. Esta sustitución ordenada no basta; simplifica esas reglas antes de continuar.");
  return { complete, source, steps, warnings };
}
