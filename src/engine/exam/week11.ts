import type { ExamAttribute, ExamGraphEdge, ExamGraphNode } from "./graph";

export const SYNTHESIZED_PRESET = "3 * 5 + 4 n";
export const INHERITED_PRESET = "real id1, id2, id3";
export const SYNTHESIZED_RULES = [
  ["L → E n", "print(E.val)"],
  ["E → E₁ + T", "E.val = E₁.val + T.val"],
  ["E → T", "E.val = T.val"],
  ["T → T₁ * F", "T.val = T₁.val * F.val"],
  ["T → F", "T.val = F.val"],
  ["F → ( E )", "F.val = E.val"],
  ["F → digito", "F.val = digito.lexval"],
] as const;
export const INHERITED_RULES = [
  ["D → T L", "L.her = T.tipo"],
  ["T → int", "T.tipo = 'entero'"],
  ["T → real", "T.tipo = 'real'"],
  ["L → L₁ , id", "L₁.her = L.her; añadetipo(id.entrada, L.her)"],
  ["L → id", "añadetipo(id.entrada, L.her)"],
] as const;

type Value = string | number;
export interface Dependency {
  id: string;
  dependsOn: string[];
}
export interface DDSStep extends Dependency {
  number: number;
  nodeId: string;
  attribute: string;
  kind: ExamAttribute["kind"];
  production: string;
  rule: string;
  value: Value;
  symbol?: { name: string; type: string };
}
export interface DDSResult {
  source: string;
  nodes: ExamGraphNode[];
  edges: ExamGraphEdge[];
  dependencyEdges: ExamGraphEdge[];
  initialValues: Record<string, Value>;
  steps: DDSStep[];
  output?: number;
}
interface Job extends Dependency {
  nodeId: string;
  attribute: string;
  kind: ExamAttribute["kind"];
  production: string;
  rule: string;
  calculate: (values: ReadonlyMap<string, Value>) => Value;
  symbolName?: string;
}

/** Stable Kahn ordering; missing prerequisites and cycles are explicit errors. */
export function topologicalOrder(jobs: Dependency[], initial: string[] = []): string[] {
  const known = new Set(initial);
  const ids = new Set(jobs.map(job => job.id));
  if (ids.size !== jobs.length || initial.some(id => ids.has(id))) {
    throw new Error("Los atributos deben tener identificadores únicos.");
  }
  for (const job of jobs) for (const dependency of job.dependsOn) {
    if (!ids.has(dependency) && !known.has(dependency)) throw new Error(`Dependencia no definida: ${dependency}.`);
  }
  const pending = [...jobs];
  const ordered: string[] = [];
  while (pending.length) {
    const index = pending.findIndex(job => job.dependsOn.every(id => known.has(id)));
    if (index < 0) throw new Error("El grafo de dependencias contiene un ciclo; no existe orden topológico.");
    const [job] = pending.splice(index, 1);
    known.add(job.id);
    ordered.push(job.id);
  }
  return ordered;
}

class Builder {
  nodes: ExamGraphNode[] = [];
  edges: ExamGraphEdge[] = [];
  jobs: Job[] = [];
  initialValues: Record<string, Value> = {};
  private nextId = 1;
  node(label: string, children: string[] = [], token = false): string {
    const id = `dds-node-${this.nextId++}`;
    this.nodes.push({ id, label, role: token ? "token" : "internal", attributes: [] });
    for (const child of children) this.edges.push({ id: `${id}-${child}`, source: id, target: child });
    return id;
  }
  attribute(nodeId: string, name: string, kind: ExamAttribute["kind"]): string {
    const id = `${nodeId}.${name}`;
    this.nodes.find(node => node.id === nodeId)!.attributes!.push({ id, label: `.${name}`, kind });
    return id;
  }
  job(nodeId: string, name: string, kind: ExamAttribute["kind"], dependsOn: string[], production: string, rule: string, calculate: Job["calculate"], symbolName?: string): string {
    const id = this.attribute(nodeId, name, kind);
    this.jobs.push({ id, nodeId, attribute: name, kind, dependsOn, production, rule, calculate, symbolName });
    return id;
  }
  finish(source: string, rootId: string, outputAttribute?: string): DDSResult {
    this.nodes.find(node => node.id === rootId)!.role = "root";
    const owners = new Map(this.nodes.flatMap(node => (node.attributes ?? []).map(attr => [attr.id, node.id] as const)));
    const values = new Map<string, Value>(Object.entries(this.initialValues));
    const ordered = topologicalOrder(this.jobs, Object.keys(this.initialValues));
    const steps: DDSStep[] = ordered.map((id, index) => {
      const job = this.jobs.find(item => item.id === id)!;
      const value = job.calculate(values);
      if (typeof value === "number" && !Number.isSafeInteger(value)) {
        throw new Error("El resultado supera el rango de enteros exactos admitido.");
      }
      values.set(id, value);
      return {
        id, number: index + 1, nodeId: job.nodeId, attribute: job.attribute,
        kind: job.kind, dependsOn: [...job.dependsOn], production: job.production,
        rule: job.rule, value,
        ...(job.symbolName ? { symbol: { name: job.symbolName, type: String(value) } } : {}),
      };
    });
    const dependencyEdges: ExamGraphEdge[] = this.jobs.flatMap(job => job.dependsOn.map(dependency => ({
      id: `${dependency}->${job.id}`, source: owners.get(dependency)!, target: job.nodeId,
      sourceHandle: dependency, targetHandle: job.id,
    })));
    const output = outputAttribute ? Number(values.get(outputAttribute)) : undefined;
    return { source, nodes: this.nodes, edges: this.edges, dependencyEdges, initialValues: this.initialValues, steps, ...(output !== undefined ? { output } : {}) };
  }
}

function numeric(values: ReadonlyMap<string, Value>, id: string): number {
  const value = values.get(id);
  if (typeof value !== "number") throw new Error(`El atributo ${id} no contiene un número.`);
  return value;
}
interface ExpressionToken { text: string; offset: number }

/** E/T loops implement left association while constructing the original left-recursive CST. */
export function buildSynthesizedDDS(source: string): DDSResult {
  if (source.length > 1000) throw new Error("Usa como máximo 1000 caracteres.");
  const tokens: ExpressionToken[] = [];
  let position = 0;
  while (position < source.length) {
    if (/\s/.test(source[position])) { position++; continue; }
    const match = /^(?:[0-9]+|[+*()n])/.exec(source.slice(position));
    if (!match) throw new Error(`Símbolo no admitido en la posición ${position + 1}: ${source[position]}.`);
    tokens.push({ text: match[0], offset: position });
    position += match[0].length;
  }
  if (tokens.length > 180) throw new Error("La expresión admite como máximo 180 tokens.");
  let cursor = 0;
  let depth = 0;
  const builder = new Builder();
  const current = () => tokens[cursor]?.text;
  const fail = (message: string): never => { throw new Error(`${message} Posición ${(tokens[cursor]?.offset ?? source.length) + 1}.`); };
  const tokenNode = (text: string) => builder.node(text, [], true);
  interface Term { node: string; attribute: string }
  function factor(): Term {
    if (++depth > 32) fail("Demasiados paréntesis anidados.");
    let result: Term;
    if (current() === "(") {
      cursor++;
      const opening = tokenNode("(");
      const expression = expr();
      if (current() !== ")") fail("Se esperaba ).");
      cursor++;
      const closing = tokenNode(")");
      const node = builder.node("F", [opening, expression.node, closing]);
      const attribute = builder.job(node, "val", "synthesized", [expression.attribute], "F → ( E )", "F.val = E.val", values => numeric(values, expression.attribute));
      result = { node, attribute };
    } else {
      const text = current();
      if (!text || !/^[0-9]+$/.test(text)) fail("Se esperaba digito o (.");
      cursor++;
      const value = Number(text);
      if (!Number.isSafeInteger(value)) fail("El número excede el rango de enteros exactos.");
      const token = tokenNode(`digito: ${text}`);
      const lexical = builder.job(token, "lexval", "lexical", [], "digito", `digito.lexval = ${text} (léxico)`, () => value);
      const node = builder.node("F", [token]);
      const attribute = builder.job(node, "val", "synthesized", [lexical], "F → digito", "F.val = digito.lexval", values => numeric(values, lexical));
      result = { node, attribute };
    }
    depth--;
    return result;
  }
  function term(): Term {
    const child = factor();
    let node = builder.node("T", [child.node]);
    let attribute = builder.job(node, "val", "synthesized", [child.attribute], "T → F", "T.val = F.val", values => numeric(values, child.attribute));
    while (current() === "*") {
      cursor++;
      const operator = tokenNode("*");
      const right = factor();
      const leftAttribute = attribute;
      node = builder.node("T", [node, operator, right.node]);
      attribute = builder.job(node, "val", "synthesized", [leftAttribute, right.attribute], "T → T₁ * F", "T.val = T₁.val * F.val", values => numeric(values, leftAttribute) * numeric(values, right.attribute));
    }
    return { node, attribute };
  }
  function expr(): Term {
    const child = term();
    let node = builder.node("E", [child.node]);
    let attribute = builder.job(node, "val", "synthesized", [child.attribute], "E → T", "E.val = T.val", values => numeric(values, child.attribute));
    while (current() === "+") {
      cursor++;
      const operator = tokenNode("+");
      const right = term();
      const leftAttribute = attribute;
      node = builder.node("E", [node, operator, right.node]);
      attribute = builder.job(node, "val", "synthesized", [leftAttribute, right.attribute], "E → E₁ + T", "E.val = E₁.val + T.val", values => numeric(values, leftAttribute) + numeric(values, right.attribute));
    }
    return { node, attribute };
  }
  const expression = expr();
  if (current() !== "n") fail("Termina la entrada con n, como en L → E n.");
  cursor++;
  const terminator = tokenNode("n");
  if (cursor !== tokens.length) fail("Hay símbolos después de n.");
  const root = builder.node("L", [expression.node, terminator]);
  const output = builder.job(root, "salida", "action", [expression.attribute], "L → E n", "print(E.val)", values => numeric(values, expression.attribute));
  return builder.finish(source, root, output);
}

export function buildInheritedDDS(source: string): DDSResult {
  if (source.length > 1000) throw new Error("Usa como máximo 1000 caracteres.");
  const match = /^\s*(int|real)\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*$/.exec(source);
  if (!match) throw new Error("Escribe int o real seguido de identificadores separados por comas; ejemplo: real id1, id2, id3.");
  const names = match[2].split(",").map(name => name.trim());
  if (names.length > 20) throw new Error("Se admiten como máximo 20 identificadores.");
  if (new Set(names).size !== names.length) throw new Error("Hay identificadores repetidos en la declaración.");
  if (names.some(name => name === "int" || name === "real")) throw new Error("int y real son palabras reservadas, no identificadores.");
  const builder = new Builder();
  const keyword = match[1];
  const token = builder.node(keyword, [], true);
  const tokenAttribute = builder.attribute(token, "lexval", "lexical");
  builder.initialValues[tokenAttribute] = keyword;
  const typeNode = builder.node("T", [token]);
  const typeAttribute = builder.job(typeNode, "tipo", "synthesized", [tokenAttribute], `T → ${keyword}`, `T.tipo = '${keyword === "int" ? "entero" : "real"}'`, values => values.get(tokenAttribute) === "int" ? "entero" : "real");
  function list(length: number, inheritedFrom: string): string {
    const node = builder.node("L");
    const inherited = builder.job(node, "her", "inherited", [inheritedFrom], length === names.length ? "D → T L" : "L → L₁ , id", length === names.length ? "L.her = T.tipo" : "L₁.her = L.her", values => String(values.get(inheritedFrom)));
    if (length > 1) {
      const left = list(length - 1, inherited);
      const comma = builder.node(",", [], true);
      builder.edges.push({ source: node, target: left }, { source: node, target: comma });
    }
    const name = names[length - 1];
    const idNode = builder.node(name, [], true);
    builder.edges.push({ source: node, target: idNode });
    const entry = builder.job(idNode, "entrada", "lexical", [], "id", `id.entrada = '${name}' (léxico)`, () => name);
    builder.job(node, "añadetipo", "action", [entry, inherited], length > 1 ? "L → L₁ , id" : "L → id", "añadetipo(id.entrada, L.her)", values => String(values.get(inherited)), name);
    return node;
  }
  const listNode = list(names.length, typeAttribute);
  const root = builder.node("D", [typeNode, listNode]);
  return builder.finish(source, root);
}

/** Produces the exact visible prefix, so unexecuted attributes and symbol rows stay hidden. */
export function decorationAtStep(result: DDSResult, count: number) {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.min(result.steps.length, Math.floor(count))) : 0;
  const completed = result.steps.slice(0, safeCount);
  const values = new Map<string, Value>(Object.entries(result.initialValues));
  for (const step of completed) values.set(step.id, step.value);
  return {
    nodes: result.nodes.map(node => ({ ...node, attributes: node.attributes?.map(attribute => ({ ...attribute, value: values.get(attribute.id) })) })),
    completedAttributeIds: [...values.keys()],
    activeAttributeId: completed.at(-1)?.id,
    symbols: completed.flatMap(step => step.symbol ? [step.symbol] : []),
    output: completed.some(step => step.attribute === "salida") ? result.output : undefined,
  };
}
