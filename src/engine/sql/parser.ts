import type {
  Diagnostic,
  Expression,
  SelectItem,
  SourceRange,
  SqlAst,
  SqlToken,
  TreeNode,
} from "./types";

export const MAX_PARSE_TOKENS = 512;
export const MAX_NESTING_DEPTH = 64;
export const MAX_CST_NODES = 4096;

export interface ParseResult {
  ast: SqlAst | null;
  cst: TreeNode | null;
  diagnostics: Diagnostic[];
}

const COMPARISONS = new Set(["=", "<>", "<", "<=", ">", ">="]);

function rangeOf(value: SourceRange): SourceRange {
  return {
    start: value.start,
    end: value.end,
    line: value.line,
    column: value.column,
  };
}

function span(first: SourceRange, last: SourceRange): SourceRange {
  return {
    start: first.start,
    end: last.end,
    line: first.line,
    column: first.column,
  };
}

function endOfSource(source: string): SourceRange {
  let line = 1;
  let column = 1;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\r") {
      if (source[i + 1] === "\n") i += 1;
      line += 1;
      column = 1;
    } else if (source[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { start: source.length, end: source.length, line, column };
}

class ParseFailure extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
  }
}

/**
 * Recursive descent for the documented dialect. Every capture is one actual
 * production, and consume() records each significant terminal exactly once.
 * Parsing stops at its first error: no recovered or hypothetical trees escape.
 */
class SqlParser {
  private readonly tokens: SqlToken[];
  private readonly eof: SourceRange;
  private index = 0;
  private nesting = 0;
  private nodeCount = 0;
  private frames: TreeNode[] = [];
  private root: TreeNode | null = null;

  constructor(tokens: SqlToken[], source: string) {
    this.tokens = tokens.filter(
      (token) =>
        token.category !== "whitespace" && token.category !== "comment",
    );
    this.eof = endOfSource(source);
  }

  parse(): ParseResult {
    try {
      if (this.tokens.length > MAX_PARSE_TOKENS) {
        this.fail(
          `La entrada supera el límite de ${MAX_PARSE_TOKENS} tokens significativos del laboratorio.`,
          `como máximo ${MAX_PARSE_TOKENS} tokens significativos`,
          "SYN_TOKEN_LIMIT",
          this.tokens[MAX_PARSE_TOKENS],
        );
      }
      const ast = this.capture("statement", () => {
        const first = this.peek() ?? this.eof;
        let statement: SqlAst;
        if (this.is("INSERT")) statement = this.insertSelect();
        else if (this.is("SELECT")) statement = this.select();
        else
          this.fail(
            "La sentencia debe comenzar con SELECT o INSERT INTO.",
            "SELECT o INSERT INTO",
            "SYN_EXPECTED_STATEMENT",
          );
        if (this.is(";")) this.consume();
        if (this.peek()) {
          const closing = this.is(")");
          this.fail(
            closing
              ? "Hay un paréntesis de cierre que no corresponde a una apertura pendiente."
              : "Se encontró contenido después de la expresión o sentencia completa.",
            "una coma (,), un punto y coma (;) o el final de la entrada",
            closing ? "SYN_UNEXPECTED_CLOSING_PAREN" : "SYN_TRAILING_INPUT",
          );
        }
        return { ...statement, ...span(first, this.previous() ?? first) };
      });
      return { ast, cst: this.root, diagnostics: [] };
    } catch (error) {
      if (error instanceof ParseFailure)
        return { ast: null, cst: null, diagnostics: [error.diagnostic] };
      throw error;
    }
  }

  private peek(): SqlToken | undefined {
    return this.tokens[this.index];
  }
  private previous(): SqlToken | undefined {
    return this.tokens[this.index - 1];
  }
  private is(lexeme: string): boolean {
    return this.peek()?.lexeme.toUpperCase() === lexeme;
  }
  private isName(token = this.peek()): token is SqlToken {
    return token?.category === "identifier" || token?.category === "function";
  }

  private fail(
    message: string,
    expected: string,
    code = "SYN_UNEXPECTED_TOKEN",
    token = this.peek(),
  ): never {
    const location = token ?? this.eof;
    const found = token ? `«${token.lexeme}»` : "el final de la entrada";
    throw new ParseFailure({
      ...rangeOf(location),
      phase: "syntax",
      severity: "error",
      code,
      message: `${message} Se encontró ${found} en línea ${location.line}, columna ${location.column}; se esperaba ${expected}.`,
      expected,
    });
  }

  private allocateNode(): number {
    this.nodeCount += 1;
    if (this.nodeCount > MAX_CST_NODES) {
      this.fail(
        `La estructura supera el límite de ${MAX_CST_NODES} nodos del laboratorio.`,
        "una sentencia de menor complejidad",
        "SYN_STRUCTURE_LIMIT",
      );
    }
    return this.nodeCount;
  }

  private capture<T>(name: string, body: () => T): T {
    const id = this.allocateNode();
    const startIndex = this.index;
    const first = this.peek() ?? this.eof;
    const node: TreeNode = {
      id: `cst-${id}`,
      label: name,
      kind: "nonterminal",
      ...rangeOf(first),
      children: [],
    };
    this.frames.push(node);
    try {
      const result = body();
      Object.assign(
        node,
        span(first, this.index > startIndex ? this.previous()! : first),
      );
      node.rule = `${name} → ${node.children.map((child) => (child.kind === "terminal" ? JSON.stringify(child.label) : child.label)).join(" ") || "ε"}`;
      const parent = this.frames[this.frames.length - 2];
      if (parent) parent.children.push(node);
      else this.root = node;
      return result;
    } finally {
      this.frames.pop();
    }
  }

  private consume(): SqlToken {
    const token = this.peek();
    if (!token) this.fail("La expresión está incompleta.", "un token");
    this.index += 1;
    const id = this.allocateNode();
    this.frames[this.frames.length - 1].children.push({
      id: `cst-${id}`,
      label: token.lexeme,
      kind: "terminal",
      category: token.category,
      ...rangeOf(token),
      children: [],
    });
    return token;
  }

  private expect(lexeme: string, context = ""): SqlToken {
    if (!this.is(lexeme))
      this.fail(
        context || `Falta el símbolo o palabra ${lexeme}.`,
        `«${lexeme}»`,
        "SYN_EXPECTED_TOKEN",
      );
    return this.consume();
  }

  private name(context: string): SqlToken {
    if (!this.isName())
      this.fail(context, "un identificador", "SYN_EXPECTED_IDENTIFIER");
    return this.consume();
  }

  private nested<T>(body: () => T): T {
    this.nesting += 1;
    try {
      if (this.nesting > MAX_NESTING_DEPTH) {
        this.fail(
          `Se superó el límite de ${MAX_NESTING_DEPTH} niveles de anidación.`,
          "una expresión menos anidada",
          "SYN_DEPTH_LIMIT",
        );
      }
      return body();
    } finally {
      this.nesting -= 1;
    }
  }

  private insertSelect(): SqlAst {
    return this.capture("insertSelect", () => {
      const start = this.expect("INSERT");
      this.expect("INTO", "INSERT debe ir seguido de INTO.");
      const table = this.name("Falta la tabla de destino después de INTO.");
      this.expect("(", "La lista explícita de columnas debe comenzar con (.");
      const columns = this.capture("columnList", () => {
        const result: NonNullable<SqlAst["columns"]> = [];
        do {
          if (result.length) this.expect(",");
          const column = this.name("La lista de columnas está incompleta.");
          result.push({ name: column.lexeme, range: rangeOf(column) });
        } while (this.is(","));
        return result;
      });
      this.expect(")", "Falta el cierre de la lista de columnas.");
      const selection = this.select();
      return {
        kind: "insert",
        table: table.lexeme,
        columns,
        items: selection.items,
        selectRange: rangeOf(selection),
        ...span(start, this.previous()!),
      };
    });
  }

  private select(): SqlAst {
    return this.capture("select", () => {
      const start = this.expect(
        "SELECT",
        "Se requiere SELECT después de la lista de columnas.",
      );
      const items: SelectItem[] = [this.selectItem()];
      while (this.is(",")) {
        this.consume();
        items.push(this.selectItem());
      }
      const range=span(start,this.previous()!);
      return { kind: "select", items, selectRange:range, ...range };
    });
  }

  private selectItem(): SelectItem {
    return this.capture("selectItem", () => {
      const expression = this.expression();
      let alias: string | undefined;
      if (this.is("AS")) {
        this.consume();
        alias = this.name("AS debe ir seguido del nombre del alias.").lexeme;
      } else if (this.isName()) alias = this.consume().lexeme;
      return {
        expression,
        ...(alias === undefined ? {} : { alias }),
        ...span(expression, this.previous()!),
      };
    });
  }

  private expression(): Expression {
    return this.nested(() =>
      this.capture("expression", () => this.orExpression()),
    );
  }

  private binaryLevel(
    name: string,
    next: () => Expression,
    operators: readonly string[],
  ): Expression {
    return this.capture(name, () => {
      let result = next();
      while (
        this.peek() &&
        operators.includes(this.peek()!.lexeme.toUpperCase())
      ) {
        const operator = this.consume().lexeme.toUpperCase();
        const right = next();
        result = {
          kind: "binary",
          operator,
          left: result,
          right,
          ...span(result, right),
        };
      }
      return result;
    });
  }

  private orExpression(): Expression {
    return this.binaryLevel("orExpression", () => this.andExpression(), ["OR"]);
  }
  private andExpression(): Expression {
    return this.binaryLevel("andExpression", () => this.notExpression(), [
      "AND",
    ]);
  }

  private notExpression(): Expression {
    return this.capture("notExpression", () => {
      if (!this.is("NOT")) return this.comparison();
      const start = this.consume();
      const operand = this.comparison();
      return {
        kind: "unary",
        operator: "NOT",
        operand,
        ...span(start, operand),
      };
    });
  }

  private comparison(): Expression {
    return this.capture("comparison", () => {
      const left = this.additive();
      if (!this.peek() || !COMPARISONS.has(this.peek()!.lexeme)) return left;
      const operator = this.capture(
        "comparisonOp",
        () => this.consume().lexeme,
      );
      const right = this.additive();
      return { kind: "binary", operator, left, right, ...span(left, right) };
    });
  }

  private additive(): Expression {
    return this.binaryLevel("additive", () => this.multiplicative(), [
      "+",
      "-",
    ]);
  }
  private multiplicative(): Expression {
    return this.binaryLevel("multiplicative", () => this.unary(), ["*", "/"]);
  }

  private unary(): Expression {
    return this.capture("unary", () => {
      if (!this.is("+") && !this.is("-")) return this.primary();
      const start = this.consume();
      const operand = this.nested(() => this.unary());
      return {
        kind: "unary",
        operator: start.lexeme,
        operand,
        ...span(start, operand),
      };
    });
  }

  private primary(): Expression {
    return this.capture("primary", () => {
      const token = this.peek();
      if (token?.category === "number") {
        const value = Number(token.lexeme);
        if (!Number.isFinite(value))
          this.fail(
            "El literal numérico excede el rango finito soportado.",
            "un número finito",
            "SYN_NUMBER_RANGE",
          );
        this.consume();
        return {
          kind: "literal",
          value,
          dataType: "number",
          ...rangeOf(token),
        };
      }
      if (token?.category === "string") {
        this.consume();
        return {
          kind: "literal",
          value: token.lexeme.slice(1, -1).replace(/''/g, "'"),
          dataType: "text",
          ...rangeOf(token),
        };
      }
      if (this.is("CASE")) return this.caseExpression();
      if (this.isName(token)) {
        if (this.tokens[this.index + 1]?.lexeme === "(")
          return this.functionCall();
        this.consume();
        return { kind: "identifier", name: token.lexeme, ...rangeOf(token) };
      }
      if (this.is("(")) {
        const start = this.consume();
        const expression = this.expression();
        const end = this.expect(
          ")",
          "Falta el paréntesis que cierra la expresión agrupada.",
        );
        return { ...expression, ...span(start, end) };
      }
      this.fail(
        "La expresión está incompleta o contiene un elemento no admitido.",
        "un número, texto entre comillas simples, identificador, llamada, CASE o (",
        "SYN_EXPECTED_EXPRESSION",
      );
    });
  }

  private functionCall(): Expression {
    return this.capture("functionCall", () => {
      const start = this.name("Falta el nombre de la función.");
      this.expect("(");
      const args: Expression[] = [];
      if (!this.is(")")) {
        args.push(this.expression());
        while (this.is(",")) {
          this.consume();
          args.push(this.expression());
        }
      }
      const end = this.expect(
        ")",
        "Falta el paréntesis que cierra los argumentos de la función.",
      );
      return { kind: "call", name: start.lexeme, args, ...span(start, end) };
    });
  }

  private caseExpression(): Expression {
    return this.capture("caseExpression", () => {
      const start = this.expect("CASE");
      const branches: { when: Expression; then: Expression }[] = [];
      do {
        this.expect("WHEN", "CASE requiere al menos una rama WHEN.");
        const when = this.expression();
        this.expect("THEN", "La condición WHEN debe ir seguida de THEN.");
        branches.push({ when, then: this.expression() });
      } while (this.is("WHEN"));
      this.expect("ELSE", "El dialecto requiere una rama ELSE en CASE.");
      const otherwise = this.expression();
      const end = this.expect("END", "Falta END para cerrar CASE.");
      return { kind: "case", branches, otherwise, ...span(start, end) };
    });
  }
}

export function parseSql(tokens: SqlToken[], source: string): ParseResult {
  return new SqlParser(tokens, source).parse();
}
