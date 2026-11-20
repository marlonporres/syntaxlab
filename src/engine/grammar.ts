/** A bounded context-free grammar engine. No SQL or stored solution is used. */
export const GRAMMAR_LIMITS = {
  sourceLength: 10_000,
  productions: 64,
  rightSymbols: 16,
  formSymbols: 64,
  searchStates: 5_000,
  searchDepth: 24,
} as const;

export type DerivationDirection = "left" | "right" | "free";
export interface Production {
  id: string;
  left: string;
  right: string[];
  line: number;
}
export interface Grammar {
  start: string;
  nonterminals: string[];
  terminals: string[];
  productions: Production[];
}
export interface GrammarDiagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  line: number;
}
export interface GrammarParseResult {
  grammar: Grammar | null;
  diagnostics: GrammarDiagnostic[];
}
export interface GrammarDerivationStep {
  before: string[];
  after: string[];
  index: number;
  productionId: string;
  rule: string;
}
export type StepResult =
  | { ok: true; form: string[]; step: GrammarDerivationStep }
  | { ok: false; code: string; message: string };
export interface DerivationSearchOptions {
  initialForm?: string[];
  maxStates?: number;
  maxDepth?: number;
  maxSymbols?: number;
}
export interface DerivationSearchResult {
  status: "found" | "not-found" | "limit";
  steps: GrammarDerivationStep[];
  forms: string[][];
  visited: number;
  message: string;
}

const NONTERMINAL_NAME = /^[A-Z][A-Za-z0-9_]*$/;
export const formatProduction = (production: Production): string =>
  `${production.left} → ${production.right.join(" ") || "ε"}`;
export const formatForm = (form: readonly string[]): string =>
  form.join(" ") || "ε";
export const tokenizeTarget = (target: string): string[] =>
  target.trim() === "" || target.trim() === "ε"
    ? []
    : target.trim().split(/\s+/u);

/** Symbols are whitespace-delimited; uppercase names denote nonterminals. */
export function parseGrammar(source: string): GrammarParseResult {
  const diagnostics: GrammarDiagnostic[] = [];
  const productions: Production[] = [];
  if (source.length > GRAMMAR_LIMITS.sourceLength)
    return {
      grammar: null,
      diagnostics: [
        {
          severity: "error",
          code: "GR_SOURCE_LIMIT",
          line: 1,
          message: `La gramática supera ${GRAMMAR_LIMITS.sourceLength} unidades UTF-16.`,
        },
      ],
    };
  const seen = new Set<string>();
  source.split(/\r\n|\r|\n/u).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const location = index + 1;
    const match = /^(\S+)\s*(?:->|→)\s*(.*)$/u.exec(line);
    if (!match || !NONTERMINAL_NAME.test(match[1])) {
      diagnostics.push({
        severity: "error",
        code: "GR_INVALID_RULE",
        line: location,
        message:
          "Usa un no terminal que empiece con mayúscula y una regla como S -> a S b | ε.",
      });
      return;
    }
    for (const alternative of match[2].split("|")) {
      const trimmed = alternative.trim();
      if (!trimmed) {
        diagnostics.push({
          severity: "error",
          code: "GR_EMPTY_ALTERNATIVE",
          line: location,
          message:
            "Una alternativa está vacía. Escribe ε para representar la cadena vacía.",
        });
        continue;
      }
      const right = trimmed === "ε" ? [] : trimmed.split(/\s+/u);
      if (
        right.some(
          (symbol) =>
            symbol === "ε" || symbol.includes("->") || symbol.includes("→"),
        )
      ) {
        diagnostics.push({
          severity: "error",
          code: "GR_INVALID_SYMBOL",
          line: location,
          message:
            "ε debe aparecer sola en su alternativa; cada línea solo puede contener una flecha de producción.",
        });
        continue;
      }
      if (right.length > GRAMMAR_LIMITS.rightSymbols) {
        diagnostics.push({
          severity: "error",
          code: "GR_RIGHT_LIMIT",
          line: location,
          message: `Una producción admite como máximo ${GRAMMAR_LIMITS.rightSymbols} símbolos a la derecha.`,
        });
        continue;
      }
      const key = JSON.stringify([match[1], right]);
      if (seen.has(key)) {
        diagnostics.push({
          severity: "warning",
          code: "GR_DUPLICATE",
          line: location,
          message: `La producción ${match[1]} → ${right.join(" ") || "ε"} está repetida; se conserva una copia.`,
        });
        continue;
      }
      seen.add(key);
      productions.push({
        id: `production-${productions.length + 1}`,
        left: match[1],
        right,
        line: location,
      });
    }
  });
  if (productions.length === 0 && diagnostics.length === 0)
    diagnostics.push({
      severity: "error",
      code: "GR_EMPTY",
      line: 1,
      message: "Escribe al menos una producción.",
    });
  if (productions.length > GRAMMAR_LIMITS.productions)
    diagnostics.push({
      severity: "error",
      code: "GR_PRODUCTION_LIMIT",
      line: 1,
      message: `El laboratorio admite hasta ${GRAMMAR_LIMITS.productions} producciones distintas.`,
    });
  const nonterminals = [
    ...new Set(productions.map((production) => production.left)),
  ];
  const nonterminalSet = new Set(nonterminals);
  const terminals = new Set<string>();
  for (const production of productions) {
    for (const symbol of production.right) {
      if (nonterminalSet.has(symbol)) continue;
      if (/^[A-Z]/u.test(symbol))
        diagnostics.push({
          severity: "error",
          code: "GR_UNDEFINED_NONTERMINAL",
          line: production.line,
          message: `El no terminal ${symbol} se utiliza pero no tiene ninguna producción definida.`,
        });
      else terminals.add(symbol);
    }
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
    return { grammar: null, diagnostics };
  const grammar: Grammar = {
    start: productions[0].left,
    nonterminals,
    terminals: [...terminals],
    productions,
  };

  const productive = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const production of productions) {
      if (
        !productive.has(production.left) &&
        production.right.every(
          (symbol) => !nonterminalSet.has(symbol) || productive.has(symbol),
        )
      ) {
        productive.add(production.left);
        changed = true;
      }
    }
  }
  const reachable = new Set([grammar.start]);
  changed = true;
  while (changed) {
    changed = false;
    for (const production of productions) {
      if (!reachable.has(production.left)) continue;
      for (const symbol of production.right)
        if (nonterminalSet.has(symbol) && !reachable.has(symbol)) {
          reachable.add(symbol);
          changed = true;
        }
    }
  }
  for (const nonterminal of nonterminals) {
    const line = productions.find(
      (production) => production.left === nonterminal,
    )!.line;
    if (!productive.has(nonterminal))
      diagnostics.push({
        severity: "warning",
        code: "GR_NONPRODUCTIVE",
        line,
        message: `${nonterminal} no puede producir una cadena formada solo por terminales con estas reglas.`,
      });
    if (!reachable.has(nonterminal))
      diagnostics.push({
        severity: "warning",
        code: "GR_UNREACHABLE",
        line,
        message: `${nonterminal} no es alcanzable desde el símbolo inicial ${grammar.start}.`,
      });
  }
  return { grammar, diagnostics };
}

export function applyProduction(
  grammar: Grammar,
  form: readonly string[],
  index: number,
  productionId: string,
  direction: DerivationDirection,
): StepResult {
  const nonterminals = new Set(grammar.nonterminals);
  const known = new Set([...grammar.nonterminals, ...grammar.terminals]);
  if (
    form.length > GRAMMAR_LIMITS.formSymbols ||
    form.some((symbol) => !known.has(symbol))
  )
    return {
      ok: false,
      code: "STEP_INVALID_FORM",
      message:
        "La forma sentencial contiene símbolos desconocidos o supera el límite de tamaño.",
    };
  if (!Number.isInteger(index) || index < 0 || index >= form.length)
    return {
      ok: false,
      code: "STEP_SELECTION",
      message: "Selecciona una posición de la forma sentencial.",
    };
  if (!nonterminals.has(form[index]))
    return {
      ok: false,
      code: "STEP_TERMINAL",
      message: `«${form[index]}» es un terminal y no se puede expandir con una producción.`,
    };
  const expandable = form.flatMap((symbol, position) =>
    nonterminals.has(symbol) ? [position] : [],
  );
  if (
    (direction === "left" && index !== expandable[0]) ||
    (direction === "right" && index !== expandable[expandable.length - 1])
  )
    return {
      ok: false,
      code: "STEP_DIRECTION",
      message: `En derivación por la ${direction === "left" ? "izquierda" : "derecha"}, expande el no terminal situado más a la ${direction === "left" ? "izquierda" : "derecha"}.`,
    };
  const production = grammar.productions.find(
    (candidate) => candidate.id === productionId,
  );
  if (!production)
    return {
      ok: false,
      code: "STEP_UNKNOWN_PRODUCTION",
      message: "La producción seleccionada no pertenece a esta gramática.",
    };
  if (production.left !== form[index])
    return {
      ok: false,
      code: "STEP_LEFT_MISMATCH",
      message: `La producción empieza con ${production.left}, pero seleccionaste ${form[index]}. Deben coincidir.`,
    };
  const after = [
    ...form.slice(0, index),
    ...production.right,
    ...form.slice(index + 1),
  ];
  if (after.length > GRAMMAR_LIMITS.formSymbols)
    return {
      ok: false,
      code: "STEP_FORM_LIMIT",
      message: `Este paso supera el límite de ${GRAMMAR_LIMITS.formSymbols} símbolos por forma sentencial.`,
    };
  return {
    ok: true,
    form: after,
    step: {
      before: [...form],
      after: [...after],
      index,
      productionId,
      rule: formatProduction(production),
    },
  };
}

function bounded(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(1, Math.min(fallback, Math.floor(value)));
}

/** Breadth-first search over actual sentential forms, with explicit resource bounds. */
export function findDerivation(
  grammar: Grammar,
  targetInput: readonly string[] | string,
  direction: "left" | "right",
  options: DerivationSearchOptions = {},
): DerivationSearchResult {
  const target =
    typeof targetInput === "string"
      ? tokenizeTarget(targetInput)
      : [...targetInput];
  const initial = options.initialForm
    ? [...options.initialForm]
    : [grammar.start];
  const maxStates = bounded(options.maxStates, GRAMMAR_LIMITS.searchStates);
  const maxDepth = bounded(options.maxDepth, GRAMMAR_LIMITS.searchDepth);
  const maxSymbols = bounded(options.maxSymbols, GRAMMAR_LIMITS.formSymbols);
  const nonterminals = new Set(grammar.nonterminals);
  const terminals = new Set(grammar.terminals);
  const known = new Set([...terminals, ...nonterminals]);
  const failure = (
    status: "not-found" | "limit",
    message: string,
    visited = 0,
  ): DerivationSearchResult => ({
    status,
    message,
    steps: [],
    forms: [],
    visited,
  });
  if (target.some((symbol) => !terminals.has(symbol)))
    return failure(
      "not-found",
      "La cadena objetivo debe contener únicamente terminales definidos en la gramática.",
    );
  if (initial.some((symbol) => !known.has(symbol)))
    return failure(
      "not-found",
      "La forma inicial contiene símbolos que no pertenecen a la gramática.",
    );
  if (target.length > maxSymbols || initial.length > maxSymbols)
    return failure(
      "limit",
      `La cadena o la forma inicial supera el límite de ${maxSymbols} símbolos.`,
    );
  const compatible = (form: readonly string[]): boolean => {
    if (form.filter((symbol) => terminals.has(symbol)).length > target.length)
      return false;
    const first = form.findIndex((symbol) => nonterminals.has(symbol));
    if (first === -1) return JSON.stringify(form) === JSON.stringify(target);
    let last = form.length - 1;
    while (!nonterminals.has(form[last])) last -= 1;
    const prefix = form.slice(0, first);
    const suffix = form.slice(last + 1);
    return (
      prefix.every((symbol, index) => target[index] === symbol) &&
      suffix.every(
        (symbol, index) =>
          target[target.length - suffix.length + index] === symbol,
      )
    );
  };
  type SearchNode = {
    form: string[];
    parent: number;
    depth: number;
    step?: GrammarDerivationStep;
  };
  const queue: SearchNode[] = [{ form: initial, parent: -1, depth: 0 }];
  const seen = new Set([JSON.stringify(initial)]);
  let limited = false;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (JSON.stringify(current.form) === JSON.stringify(target)) {
      const steps: GrammarDerivationStep[] = [];
      const forms: string[][] = [];
      let pathIndex = cursor;
      while (pathIndex !== -1) {
        const pathNode = queue[pathIndex];
        forms.push([...pathNode.form]);
        if (pathNode.step) steps.push(pathNode.step);
        pathIndex = pathNode.parent;
      }
      return {
        status: "found",
        steps: steps.reverse(),
        forms: forms.reverse(),
        visited: queue.length,
        message:
          "Derivación calculada aplicando las producciones de la gramática.",
      };
    }
    if (!compatible(current.form)) continue;
    const positions = current.form.flatMap((symbol, position) =>
      nonterminals.has(symbol) ? [position] : [],
    );
    if (!positions.length) continue;
    if (current.depth >= maxDepth) {
      limited = true;
      continue;
    }
    const position =
      direction === "left" ? positions[0] : positions[positions.length - 1];
    for (const production of grammar.productions) {
      if (production.left !== current.form[position]) continue;
      const result = applyProduction(
        grammar,
        current.form,
        position,
        production.id,
        direction,
      );
      if (!result.ok) {
        if (result.code === "STEP_FORM_LIMIT") limited = true;
        continue;
      }
      if (result.form.length > maxSymbols) {
        limited = true;
        continue;
      }
      if (!compatible(result.form)) continue;
      const key = JSON.stringify(result.form);
      if (seen.has(key)) continue;
      if (queue.length >= maxStates) {
        limited = true;
        continue;
      }
      seen.add(key);
      queue.push({
        form: result.form,
        parent: cursor,
        depth: current.depth + 1,
        step: result.step,
      });
    }
  }
  return failure(
    limited ? "limit" : "not-found",
    limited
      ? `La búsqueda alcanzó un límite (${maxDepth} pasos, ${maxStates} estados o ${maxSymbols} símbolos). Esto no demuestra que la cadena sea imposible.`
      : "No se encontró una derivación: se agotaron las formas compatibles con la cadena objetivo.",
    queue.length,
  );
}
