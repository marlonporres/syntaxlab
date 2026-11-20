/** Small, bounded educational algorithms. No automaton or parse result is precomputed. */
export const FORMAL_LIMITS = {
  regexLength: 160,
  regexDepth: 32,
  nfaStates: 256,
  nfaTransitions: 2048,
  dfaStates: 512,
  inputLength: 256,
  grammarProductions: 100,
  grammarNonterminals: 40,
  grammarSymbols: 400,
  predictiveSteps: 2048,
} as const;

export class FormalError extends Error {
  constructor(
    public code: string,
    message: string,
    public index?: number,
  ) {
    super(message);
    this.name = "FormalError";
  }
}

export type RegexNode =
  | { kind: "literal"; value: string }
  | { kind: "epsilon" }
  | { kind: "concat" | "union"; children: RegexNode[] }
  | { kind: "star" | "plus" | "optional"; child: RegexNode };

export interface NFA {
  states: string[];
  alphabet: string[];
  start: string;
  accepting: string[];
  transitions: { from: string; to: string; symbol: string | null }[];
}

export interface DFA {
  states: string[];
  alphabet: string[];
  start: string;
  accepting: string[];
  transitions: { from: string; to: string; symbol: string }[];
}

export interface SubsetDFA extends DFA {
  stateSets: Record<string, string[]>;
}
export interface MinimizedDFA extends DFA {
  groups: Record<string, string[]>;
  mapping: Record<string, string>;
  removedStates: string[];
  generatedSink?: string;
}

export interface SimulationTrace {
  accepted: boolean;
  consumed: number;
  finalStates: string[];
  steps: {
    index: number;
    symbol: string | null;
    before: string[];
    after: string[];
  }[];
  error?: string;
}

/** Grammar: union is weakest, then implicit concatenation, then one postfix quantifier. */
export function parseRegex(source: string): RegexNode {
  if (source.length > FORMAL_LIMITS.regexLength) {
    throw new FormalError(
      "REGEX_LENGTH",
      `La expresión supera ${FORMAL_LIMITS.regexLength} caracteres.`,
    );
  }
  let index = 0;
  const fail = (message: string): never => {
    throw new FormalError(
      "REGEX_SYNTAX",
      `${message} Posición ${index + 1}.`,
      index,
    );
  };
  const atom = (depth: number): RegexNode => {
    if (depth > FORMAL_LIMITS.regexDepth)
      throw new FormalError(
        "REGEX_DEPTH",
        `Máximo ${FORMAL_LIMITS.regexDepth} niveles de paréntesis.`,
        index,
      );
    const next = source[index];
    if (next === "(") {
      index += 1;
      const child = union(depth + 1);
      if (source[index] !== ")") fail("Falta cerrar el paréntesis.");
      index += 1;
      return child;
    }
    if (next === "ε") {
      index += 1;
      return { kind: "epsilon" };
    }
    if (next && /^[a-z0-9]$/.test(next)) {
      index += 1;
      return { kind: "literal", value: next };
    }
    return fail(
      "Se esperaba un literal a-z/0-9, ε o una expresión entre paréntesis.",
    );
  };
  const repetition = (depth: number): RegexNode => {
    let child = atom(depth);
    const postfix = source[index];
    if (postfix === "*" || postfix === "+" || postfix === "?") {
      index += 1;
      child = {
        kind: postfix === "*" ? "star" : postfix === "+" ? "plus" : "optional",
        child,
      };
      if (["*", "+", "?"].includes(source[index]))
        fail("No se permiten cuantificadores consecutivos; usa paréntesis.");
    }
    return child;
  };
  const concat = (depth: number): RegexNode => {
    const children: RegexNode[] = [];
    while (
      index < source.length &&
      source[index] !== ")" &&
      source[index] !== "|"
    )
      children.push(repetition(depth));
    if (!children.length)
      fail("La alternativa está vacía; escribe ε para la cadena vacía.");
    return children.length === 1 ? children[0] : { kind: "concat", children };
  };
  const union = (depth: number): RegexNode => {
    const children = [concat(depth)];
    while (source[index] === "|") {
      index += 1;
      children.push(concat(depth));
    }
    return children.length === 1 ? children[0] : { kind: "union", children };
  };
  const result = union(0);
  if (index !== source.length)
    fail("Hay un paréntesis de cierre sin apertura.");
  return result;
}

export function thompson(ast: RegexNode): NFA {
  const states: string[] = [];
  const transitions: NFA["transitions"] = [];
  const alphabet = new Set<string>();
  const state = () => {
    if (states.length >= FORMAL_LIMITS.nfaStates)
      throw new FormalError(
        "NFA_LIMIT",
        `La construcción supera ${FORMAL_LIMITS.nfaStates} estados AFN.`,
      );
    const name = `n${states.length}`;
    states.push(name);
    return name;
  };
  const edge = (from: string, to: string, symbol: string | null) =>
    transitions.push({ from, to, symbol });
  type Fragment = { start: string; end: string };
  const build = (node: RegexNode, depth: number): Fragment => {
    if (depth > FORMAL_LIMITS.regexDepth * 3)
      throw new FormalError(
        "REGEX_DEPTH",
        "El árbol de la expresión es demasiado profundo.",
      );
    if (node.kind === "literal" || node.kind === "epsilon") {
      const start = state(),
        end = state();
      if (node.kind === "literal") {
        if (!/^[a-z0-9]$/.test(node.value))
          throw new FormalError(
            "REGEX_LITERAL",
            "Los literales pertenecen a a-z o 0-9.",
          );
        alphabet.add(node.value);
      }
      edge(start, end, node.kind === "literal" ? node.value : null);
      return { start, end };
    }
    if (node.kind === "concat") {
      if (!node.children.length)
        throw new FormalError(
          "REGEX_AST",
          "La concatenación necesita operandos.",
        );
      const fragments = node.children.map((child) => build(child, depth + 1));
      for (let index = 1; index < fragments.length; index += 1)
        edge(fragments[index - 1].end, fragments[index].start, null);
      return {
        start: fragments[0].start,
        end: fragments[fragments.length - 1].end,
      };
    }
    const start = state(),
      end = state();
    if (node.kind === "union") {
      if (!node.children.length)
        throw new FormalError("REGEX_AST", "La unión necesita alternativas.");
      for (const child of node.children) {
        const fragment = build(child, depth + 1);
        edge(start, fragment.start, null);
        edge(fragment.end, end, null);
      }
    } else if ("child" in node) {
      const fragment = build(node.child, depth + 1);
      edge(start, fragment.start, null);
      edge(fragment.end, end, null);
      if (node.kind === "star" || node.kind === "optional")
        edge(start, end, null);
      if (node.kind === "star" || node.kind === "plus")
        edge(fragment.end, fragment.start, null);
    } else {
      throw new FormalError(
        "REGEX_AST",
        "El árbol de la expresión contiene un nodo desconocido.",
      );
    }
    return { start, end };
  };
  const fragment = build(ast, 0);
  return {
    states,
    alphabet: [...alphabet].sort(),
    start: fragment.start,
    accepting: [fragment.end],
    transitions,
  };
}

export function compileRegex(source: string): NFA {
  return thompson(parseRegex(source));
}

function validateAutomaton(machine: NFA | DFA, deterministic: boolean) {
  const limit = deterministic
    ? FORMAL_LIMITS.dfaStates
    : FORMAL_LIMITS.nfaStates;
  if (!machine.states.length || machine.states.length > limit)
    throw new FormalError(
      "AUTOMATON_SIZE",
      `El autómata requiere entre 1 y ${limit} estados.`,
    );
  if (
    new Set(machine.states).size !== machine.states.length ||
    new Set(machine.alphabet).size !== machine.alphabet.length
  )
    throw new FormalError(
      "AUTOMATON_DUPLICATE",
      "Estados y alfabeto deben tener nombres únicos.",
    );
  const states = new Set(machine.states),
    alphabet = new Set(machine.alphabet);
  if (
    !states.has(machine.start) ||
    machine.accepting.some((name) => !states.has(name))
  )
    throw new FormalError(
      "AUTOMATON_STATE",
      "El inicio y los estados de aceptación deben pertenecer al autómata.",
    );
  if (machine.alphabet.some((symbol) => !/^[a-z0-9]$/.test(symbol)))
    throw new FormalError(
      "AUTOMATON_ALPHABET",
      "El alfabeto admite caracteres individuales a-z y 0-9.",
    );
  if (
    machine.transitions.length >
    (deterministic ? limit * 36 : FORMAL_LIMITS.nfaTransitions)
  )
    throw new FormalError(
      "AUTOMATON_TRANSITIONS",
      "El autómata supera el límite de transiciones.",
    );
  const keys = new Set<string>();
  for (const transition of machine.transitions) {
    if (!states.has(transition.from) || !states.has(transition.to))
      throw new FormalError(
        "AUTOMATON_STATE",
        "Una transición menciona un estado inexistente.",
      );
    if (transition.symbol !== null && !alphabet.has(transition.symbol))
      throw new FormalError(
        "AUTOMATON_SYMBOL",
        "Una transición usa un símbolo fuera del alfabeto.",
      );
    if (deterministic) {
      if (transition.symbol === null)
        throw new FormalError(
          "DFA_EPSILON",
          "Un AFD no admite transiciones ε.",
        );
      const key = JSON.stringify([transition.from, transition.symbol]);
      if (keys.has(key))
        throw new FormalError(
          "DFA_NONDETERMINISM",
          "Un AFD admite un único destino por estado y símbolo.",
        );
      keys.add(key);
    }
  }
}

function nfaOperations(nfa: NFA) {
  const outgoing = new Map<string, NFA["transitions"]>();
  for (const transition of nfa.transitions) {
    const edges = outgoing.get(transition.from) ?? [];
    edges.push(transition);
    outgoing.set(transition.from, edges);
  }
  const closure = (initial: string[]) => {
    const visited = new Set(initial),
      pending = [...initial];
    while (pending.length) {
      const current = pending.pop()!;
      for (const edge of outgoing.get(current) ?? []) {
        if (edge.symbol === null && !visited.has(edge.to)) {
          visited.add(edge.to);
          pending.push(edge.to);
        }
      }
    }
    return [...visited].sort();
  };
  const move = (initial: string[], symbol: string) =>
    closure(
      initial.flatMap((name) =>
        (outgoing.get(name) ?? [])
          .filter((edge) => edge.symbol === symbol)
          .map((edge) => edge.to),
      ),
    );
  return { closure, move };
}

function boundedInput(input: string) {
  if (input.length > FORMAL_LIMITS.inputLength)
    throw new FormalError(
      "INPUT_LENGTH",
      `Máximo ${FORMAL_LIMITS.inputLength} caracteres de entrada.`,
    );
  return Array.from(input);
}

export function simulateNFA(nfa: NFA, input: string): SimulationTrace {
  validateAutomaton(nfa, false);
  const symbols = boundedInput(input),
    { closure, move } = nfaOperations(nfa);
  let active = closure([nfa.start]);
  const steps: SimulationTrace["steps"] = [
    { index: 0, symbol: null, before: [nfa.start], after: active },
  ];
  for (let index = 0; index < symbols.length; index += 1) {
    const symbol = symbols[index],
      before = active;
    active = move(active, symbol);
    steps.push({ index: index + 1, symbol, before, after: active });
    if (!nfa.alphabet.includes(symbol))
      return {
        accepted: false,
        consumed: index + 1,
        finalStates: active,
        steps,
        error: `El símbolo ${symbol} no pertenece al alfabeto.`,
      };
  }
  return {
    accepted: active.some((name) => nfa.accepting.includes(name)),
    consumed: symbols.length,
    finalStates: active,
    steps,
  };
}

/** Reachable powerset construction, including the empty set whenever it is reached. */
export function subsetConstruction(nfa: NFA): SubsetDFA {
  validateAutomaton(nfa, false);
  const { closure, move } = nfaOperations(nfa);
  const states: string[] = [],
    accepting: string[] = [],
    transitions: DFA["transitions"] = [];
  const stateSets: Record<string, string[]> = Object.create(null);
  const names = new Map<string, string>();
  const add = (set: string[]) => {
    const key = JSON.stringify(set);
    const existing = names.get(key);
    if (existing !== undefined) return existing;
    if (states.length >= FORMAL_LIMITS.dfaStates)
      throw new FormalError(
        "DFA_LIMIT",
        `La determinización supera ${FORMAL_LIMITS.dfaStates} estados. Simplifica la expresión.`,
      );
    const name = `q${states.length}`;
    names.set(key, name);
    states.push(name);
    stateSets[name] = set;
    if (set.some((state) => nfa.accepting.includes(state)))
      accepting.push(name);
    return name;
  };
  const start = add(closure([nfa.start]));
  for (let index = 0; index < states.length; index += 1) {
    const from = states[index];
    for (const symbol of nfa.alphabet)
      transitions.push({
        from,
        symbol,
        to: add(move(stateSets[from], symbol)),
      });
  }
  return {
    states,
    alphabet: [...nfa.alphabet],
    start,
    accepting,
    transitions,
    stateSets,
  };
}

export function simulateDFA(dfa: DFA, input: string): SimulationTrace {
  validateAutomaton(dfa, true);
  const symbols = boundedInput(input);
  const lookup = new Map(
    dfa.transitions.map((edge) => [
      JSON.stringify([edge.from, edge.symbol]),
      edge.to,
    ]),
  );
  let active = [dfa.start];
  const steps: SimulationTrace["steps"] = [
    { index: 0, symbol: null, before: [dfa.start], after: active },
  ];
  for (let index = 0; index < symbols.length; index += 1) {
    const symbol = symbols[index],
      before = active;
    const next = active.length
      ? lookup.get(JSON.stringify([active[0], symbol]))
      : undefined;
    active = next === undefined ? [] : [next];
    steps.push({ index: index + 1, symbol, before, after: active });
    if (!dfa.alphabet.includes(symbol))
      return {
        accepted: false,
        consumed: index + 1,
        finalStates: active,
        steps,
        error: `El símbolo ${symbol} no pertenece al alfabeto.`,
      };
  }
  return {
    accepted: active.some((name) => dfa.accepting.includes(name)),
    consumed: symbols.length,
    finalStates: active,
    steps,
  };
}

/** Reachability followed by fixed-point partition refinement. Partial DFAs gain a rejecting sink. */
export function minimizeDFA(dfa: DFA): MinimizedDFA {
  validateAutomaton(dfa, true);
  const alphabet = [...dfa.alphabet];
  const lookup = new Map(
    dfa.transitions.map((edge) => [
      JSON.stringify([edge.from, edge.symbol]),
      edge.to,
    ]),
  );
  let sink = "__sink";
  while (dfa.states.includes(sink)) sink += "_";
  let generatedSink: string | undefined;
  const target = (from: string, symbol: string) => {
    const existing = lookup.get(JSON.stringify([from, symbol]));
    if (existing !== undefined) return existing;
    generatedSink = sink;
    return sink;
  };
  const reachable = [dfa.start],
    seen = new Set(reachable);
  for (let index = 0; index < reachable.length; index += 1) {
    for (const symbol of alphabet) {
      const next = target(reachable[index], symbol);
      if (!seen.has(next)) {
        if (reachable.length >= FORMAL_LIMITS.dfaStates)
          throw new FormalError(
            "DFA_LIMIT",
            `Completar el AFD supera ${FORMAL_LIMITS.dfaStates} estados, incluido el sumidero.`,
          );
        seen.add(next);
        reachable.push(next);
      }
    }
  }
  let partitions = [
    reachable.filter((state) => dfa.accepting.includes(state)),
    reachable.filter((state) => !dfa.accepting.includes(state)),
  ].filter((group) => group.length);
  while (true) {
    const membership = new Map(
      partitions.flatMap((group, index) =>
        group.map((state) => [state, index] as const),
      ),
    );
    const refined: string[][] = [];
    for (const group of partitions) {
      const buckets = new Map<string, string[]>();
      for (const state of group) {
        const signature = JSON.stringify(
          alphabet.map((symbol) => membership.get(target(state, symbol))),
        );
        const bucket = buckets.get(signature) ?? [];
        bucket.push(state);
        buckets.set(signature, bucket);
      }
      refined.push(...buckets.values());
    }
    if (refined.length === partitions.length) break;
    partitions = refined;
  }
  partitions.sort((a, b) => reachable.indexOf(a[0]) - reachable.indexOf(b[0]));
  const mapping: Record<string, string> = Object.create(null),
    groups: Record<string, string[]> = Object.create(null);
  const states = partitions.map((group, index) => {
    const name = `m${index}`;
    groups[name] = [...group];
    for (const state of group) mapping[state] = name;
    return name;
  });
  if (states.length > FORMAL_LIMITS.dfaStates)
    throw new FormalError(
      "DFA_LIMIT",
      `El AFD completo necesita más de ${FORMAL_LIMITS.dfaStates} estados.`,
    );
  return {
    states,
    alphabet,
    start: mapping[dfa.start],
    accepting: states.filter((name) =>
      groups[name].some((state) => dfa.accepting.includes(state)),
    ),
    transitions: states.flatMap((from) =>
      alphabet.map((symbol) => ({
        from,
        symbol,
        to: mapping[target(groups[from][0], symbol)],
      })),
    ),
    mapping,
    groups,
    removedStates: dfa.states.filter((state) => !seen.has(state)),
    ...(generatedSink === undefined ? {} : { generatedSink }),
  };
}

export interface Grammar {
  start: string;
  productions: { lhs: string; rhs: string[] }[];
}
export interface LL1Analysis {
  grammar: Grammar;
  nonterminals: string[];
  terminals: string[];
  nullable: string[];
  first: Record<string, string[]>;
  follow: Record<string, string[]>;
  table: Record<string, Record<string, number[]>>;
  conflicts: {
    nonterminal: string;
    lookahead: string;
    productionIndices: number[];
  }[];
  leftRecursive: string[];
  unproductive: string[];
  isLL1: boolean;
}

export interface PredictiveResult {
  accepted: boolean;
  consumed: number;
  trace: {
    step: number;
    stack: string[];
    remaining: string[];
    action: string;
    productionIndex?: number;
  }[];
  error?: string;
}

function normalizeGrammar(input: Grammar): Grammar {
  if (
    !input ||
    !Array.isArray(input.productions) ||
    !input.productions.length ||
    input.productions.length > FORMAL_LIMITS.grammarProductions
  )
    throw new FormalError(
      "GRAMMAR_SIZE",
      `Se necesitan entre 1 y ${FORMAL_LIMITS.grammarProductions} producciones.`,
    );
  const validSymbol = (value: unknown): value is string =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    !/\s/.test(value) &&
    value !== "$";
  const productions = input.productions.map((production) => {
    if (
      !production ||
      !validSymbol(production.lhs) ||
      production.lhs === "ε" ||
      !Array.isArray(production.rhs) ||
      production.rhs.some((symbol) => !validSymbol(symbol))
    )
      throw new FormalError(
        "GRAMMAR_SYMBOL",
        "Usa símbolos no vacíos, sin espacios, y reserva $ para el fin de entrada.",
      );
    if (production.rhs.includes("ε") && production.rhs.length !== 1)
      throw new FormalError(
        "GRAMMAR_EPSILON",
        "ε debe aparecer sola en una producción, o usa una lista vacía.",
      );
    return {
      lhs: production.lhs,
      rhs: production.rhs[0] === "ε" ? [] : [...production.rhs],
    };
  });
  const nonterminals = new Set(productions.map((production) => production.lhs));
  if (!nonterminals.has(input.start))
    throw new FormalError(
      "GRAMMAR_START",
      "El símbolo inicial debe tener una producción.",
    );
  if (
    nonterminals.size > FORMAL_LIMITS.grammarNonterminals ||
    productions.reduce((size, production) => size + production.rhs.length, 0) >
      FORMAL_LIMITS.grammarSymbols
  )
    throw new FormalError(
      "GRAMMAR_LIMIT",
      `Máximo ${FORMAL_LIMITS.grammarNonterminals} no terminales y ${FORMAL_LIMITS.grammarSymbols} símbolos en las producciones.`,
    );
  const signatures = productions.map((production) =>
    JSON.stringify([production.lhs, production.rhs]),
  );
  if (new Set(signatures).size !== signatures.length)
    throw new FormalError("GRAMMAR_DUPLICATE", "Hay producciones repetidas.");
  return { start: input.start, productions };
}

function addAll(target: Set<string>, values: Iterable<string>) {
  let changed = false;
  for (const value of values)
    if (!target.has(value)) {
      target.add(value);
      changed = true;
    }
  return changed;
}

export function analyzeGrammar(input: Grammar): LL1Analysis {
  const grammar = normalizeGrammar(input);
  const nonterminals = [
    ...new Set(grammar.productions.map((production) => production.lhs)),
  ];
  const nts = new Set(nonterminals);
  const terminals = [
    ...new Set(
      grammar.productions
        .flatMap((production) => production.rhs)
        .filter((symbol) => !nts.has(symbol)),
    ),
  ].sort();
  const nullable = new Set<string>(),
    productive = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const { lhs, rhs } of grammar.productions) {
      if (!nullable.has(lhs) && rhs.every((symbol) => nullable.has(symbol))) {
        nullable.add(lhs);
        changed = true;
      }
      if (
        !productive.has(lhs) &&
        rhs.every((symbol) => !nts.has(symbol) || productive.has(symbol))
      ) {
        productive.add(lhs);
        changed = true;
      }
    }
  }
  const firstSets = new Map(
    nonterminals.map((symbol) => [symbol, new Set<string>()]),
  );
  const firstSequence = (sequence: string[]) => {
    const result = new Set<string>();
    for (const symbol of sequence) {
      if (!nts.has(symbol)) {
        result.add(symbol);
        return result;
      }
      addAll(
        result,
        [...firstSets.get(symbol)!].filter((item) => item !== "ε"),
      );
      if (!nullable.has(symbol)) return result;
    }
    result.add("ε");
    return result;
  };
  changed = true;
  while (changed) {
    changed = false;
    for (const { lhs, rhs } of grammar.productions)
      changed = addAll(firstSets.get(lhs)!, firstSequence(rhs)) || changed;
  }
  const followSets = new Map(
    nonterminals.map((symbol) => [symbol, new Set<string>()]),
  );
  followSets.get(grammar.start)!.add("$");
  changed = true;
  while (changed) {
    changed = false;
    for (const { lhs, rhs } of grammar.productions) {
      rhs.forEach((symbol, index) => {
        if (!nts.has(symbol)) return;
        const suffix = firstSequence(rhs.slice(index + 1));
        changed =
          addAll(
            followSets.get(symbol)!,
            [...suffix].filter((item) => item !== "ε"),
          ) || changed;
        if (suffix.has("ε"))
          changed =
            addAll(followSets.get(symbol)!, followSets.get(lhs)!) || changed;
      });
    }
  }
  const table: LL1Analysis["table"] = Object.create(null);
  for (const symbol of nonterminals) table[symbol] = Object.create(null);
  grammar.productions.forEach(({ lhs, rhs }, index) => {
    const first = firstSequence(rhs);
    const lookaheads = new Set([...first].filter((item) => item !== "ε"));
    if (first.has("ε")) addAll(lookaheads, followSets.get(lhs)!);
    for (const symbol of lookaheads) {
      const entries = table[lhs][symbol] ?? [];
      if (!entries.includes(index)) entries.push(index);
      table[lhs][symbol] = entries;
    }
  });
  const conflicts = nonterminals.flatMap((nonterminal) =>
    Object.entries(table[nonterminal])
      .filter(([, indices]) => indices.length > 1)
      .map(([lookahead, productionIndices]) => ({
        nonterminal,
        lookahead,
        productionIndices: [...productionIndices],
      })),
  );
  const leftCorners = new Map(
    nonterminals.map((symbol) => [symbol, new Set<string>()]),
  );
  for (const { lhs, rhs } of grammar.productions) {
    for (const symbol of rhs) {
      if (!nts.has(symbol)) break;
      leftCorners.get(lhs)!.add(symbol);
      if (!nullable.has(symbol)) break;
    }
  }
  const leftRecursive = nonterminals.filter((origin) => {
    const pending = [...leftCorners.get(origin)!],
      visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === origin) return true;
      if (!visited.has(current)) {
        visited.add(current);
        pending.push(...leftCorners.get(current)!);
      }
    }
    return false;
  });
  const unproductive = nonterminals.filter((symbol) => !productive.has(symbol));
  const toRecord = (sets: Map<string, Set<string>>) =>
    Object.fromEntries(
      [...sets].map(([symbol, set]) => [symbol, [...set].sort()]),
    );
  return {
    grammar,
    nonterminals,
    terminals,
    nullable: nonterminals.filter((symbol) => nullable.has(symbol)),
    first: toRecord(firstSets),
    follow: toRecord(followSets),
    table,
    conflicts,
    leftRecursive,
    unproductive,
    isLL1:
      conflicts.length === 0 &&
      leftRecursive.length === 0 &&
      unproductive.length === 0,
  };
}

/** The stack is shown top first; input tokens omit the reserved end marker $. */
export function predictiveParse(
  grammarOrAnalysis: Grammar | LL1Analysis,
  input: string[],
): PredictiveResult {
  const analysis =
    "table" in grammarOrAnalysis
      ? grammarOrAnalysis
      : analyzeGrammar(grammarOrAnalysis);
  if (input.length > FORMAL_LIMITS.inputLength)
    throw new FormalError(
      "INPUT_LENGTH",
      `Máximo ${FORMAL_LIMITS.inputLength} tokens de entrada.`,
    );
  const stack = [analysis.grammar.start, "$"],
    tokens = [...input, "$"];
  const trace: PredictiveResult["trace"] = [];
  let consumed = 0;
  const record = (action: string, productionIndex?: number) =>
    trace.push({
      step: trace.length,
      stack: [...stack],
      remaining: tokens.slice(consumed),
      action,
      ...(productionIndex === undefined ? {} : { productionIndex }),
    });
  const reject = (error: string): PredictiveResult => {
    record(error);
    return { accepted: false, consumed, trace, error };
  };
  if (!analysis.isLL1)
    return reject(
      "La gramática no admite esta tabla predictiva LL(1): revisa conflictos, recursividad izquierda o símbolos improductivos.",
    );
  if (input.some((symbol) => !symbol || symbol === "$" || symbol === "ε"))
    return reject(
      "La entrada contiene un símbolo vacío o reservado. Para ε utiliza una entrada vacía.",
    );
  const nts = new Set(analysis.nonterminals);
  while (trace.length < FORMAL_LIMITS.predictiveSteps) {
    const top = stack[0],
      lookahead = tokens[consumed];
    if (top === "$" && lookahead === "$") {
      record("Aceptar");
      return { accepted: true, consumed, trace };
    }
    if (!nts.has(top)) {
      if (top !== lookahead)
        return reject(`Se esperaba ${top}; se encontró ${lookahead}.`);
      record(`Consumir ${lookahead}`);
      stack.shift();
      consumed += 1;
      continue;
    }
    const candidates = analysis.table[top][lookahead];
    if (!candidates?.length)
      return reject(
        `No existe producción para ${top} con anticipación ${lookahead}.`,
      );
    if (candidates.length !== 1)
      return reject(`Conflicto en M[${top}, ${lookahead}].`);
    const productionIndex = candidates[0],
      production = analysis.grammar.productions[productionIndex];
    record(
      `${production.lhs} → ${production.rhs.join(" ") || "ε"}`,
      productionIndex,
    );
    stack.shift();
    stack.unshift(...production.rhs);
  }
  return reject(
    `El análisis alcanzó el límite de ${FORMAL_LIMITS.predictiveSteps} pasos.`,
  );
}
