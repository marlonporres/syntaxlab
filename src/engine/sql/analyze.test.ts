import { describe, expect, it } from "vitest";
import { CORRECTED_SQL, ORIGINAL_SQL } from "../../content/lab";
import { analyzeSql } from "./analyze";
import { lexSql } from "./lexer";
import {
  MAX_CST_NODES,
  MAX_NESTING_DEPTH,
  MAX_PARSE_TOKENS,
  parseSql,
} from "./parser";
import type { Expression, TreeNode } from "./types";

function nodes(root: TreeNode): TreeNode[] {
  const result = [root];
  for (const child of root.children) result.push(...nodes(child));
  return result;
}

function firstExpression(source: string): Expression {
  const result = analyzeSql(source);
  expect(result.accepted, JSON.stringify(result.diagnostics)).toBe(true);
  return result.ast!.items[0].expression;
}

describe("real SQL analysis", () => {
  it.each([
    "SELECT 1 AS numero, 'Hola' AS saludo",
    "SELECT (1 + 2) * 3",
    "SELECT CASE WHEN 2 = 2 THEN 1 ELSE 0 END perfil",
    "SELECT left(nombre, 1)",
    "INSERT INTO Usuarios (Usuario, estado) SELECT 'ana', 1",
    "select funcion() AS resultado;",
    "SELECT _nombre, 1.25, +2, -3",
    "SELECT CASE WHEN 1 < 2 THEN CASE WHEN 3 <> 4 THEN 5 ELSE 6 END WHEN 7 >= 8 THEN 9 ELSE 0 END",
    "SELECT 1 -- final\r\n;",
    "/*inicio*/ INSERT /*a*/ INTO Usuarios (a, b) SELECT f /*b*/ (1, 2), 3;",
  ])("accepts a supported complete sentence: %s", (source) => {
    const result = analyzeSql(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.accepted).toBe(true);
    expect(result.ast).not.toBeNull();
    expect(result.cst).not.toBeNull();
    expect(result.astTree?.kind).toBe("abstract");
  });

  it("preserves the original and rejects its actual unsupported lexemes without constructing trees", () => {
    const original = analyzeSql(ORIGINAL_SQL);
    expect(original.source).toBe(ORIGINAL_SQL);
    expect(original.tokens.map((token) => token.lexeme).join("")).toBe(
      ORIGINAL_SQL,
    );
    expect(original.accepted).toBe(false);
    expect(original.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "LEX_UNSUPPORTED_OPERATOR",
      "LEX_DOUBLE_QUOTES",
    ]);
    for (const diagnostic of original.diagnostics) {
      expect(ORIGINAL_SQL.slice(diagnostic.start, diagnostic.end)).toBe(
        diagnostic.code === "LEX_UNSUPPORTED_OPERATOR" ? "==" : '"IT"',
      );
      expect(diagnostic.line).toBe(5);
    }
    expect(original.ast).toBeNull();
    expect(original.cst).toBeNull();
    expect(original.astTree).toBeNull();
    expect(original.derivations).toEqual({ left: [], right: [] });
    expect(ORIGINAL_SQL).toContain('== "IT"');
  });

  it("accepts the separately corrected case and builds the actual insert/function/CASE structure", () => {
    const result = analyzeSql(CORRECTED_SQL);
    expect(result.accepted).toBe(true);
    expect(result.ast?.kind).toBe("insert");
    expect(result.ast?.table).toBe("Usuarios");
    expect(result.ast?.columns?.map((column) => column.name)).toEqual([
      "Usuario",
      "nombre",
      "perfil",
      "clave",
      "estado",
    ]);
    expect(result.ast?.items).toHaveLength(5);
    expect(result.ast?.items[2].alias).toBe("perfil");
    expect(result.ast?.items[2].expression.kind).toBe("case");
    expect(result.ast?.items[3].alias).toBe("clave");
    expect(result.ast?.items[3].expression).toMatchObject({
      kind: "call",
      name: "generaClave",
      args: [
        { kind: "identifier", name: "nombre" },
        { kind: "identifier", name: "edad" },
      ],
    });
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.phase === "semantic"),
    ).toBe(false);
  });

  it("exposes the unmatched final parenthesis after lexical edits rather than pretending to recover it", () => {
    const result = analyzeSql(ORIGINAL_SQL.replace('== "IT"', "= 'IT'"));
    expect(result.accepted).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({
      phase: "syntax",
      code: "SYN_UNEXPECTED_CLOSING_PAREN",
      line: 7,
      column: 6,
    });
    expect(
      result.source.slice(
        result.diagnostics[0].start,
        result.diagnostics[0].end,
      ),
    ).toBe(")");
    expect(result.cst).toBeNull();
  });

  it.each([
    "",
    "   -- sin sentencia",
    "UPDATE Usuarios",
    "SELECT",
    "SELECT *",
    "SELECT 1,",
    "SELECT 1 2",
    "SELECT 1)",
    "SELECT (1 + 2",
    "SELECT 1 +",
    "SELECT f(1,)",
    "SELECT f(1 2)",
    "SELECT 1 AS",
    "SELECT 1 AS SELECT",
    "INSERT Usuarios (a) SELECT 1",
    "INSERT INTO Usuarios () SELECT 1",
    "INSERT INTO Usuarios (a b) SELECT 1",
    "INSERT INTO Usuarios (a,) SELECT 1",
    "INSERT INTO Usuarios (a SELECT 1",
    "INSERT INTO Usuarios (a) 1",
    "SELECT CASE WHEN 1 = 1 1 ELSE 0 END",
    "SELECT CASE WHEN 1 THEN 2 END",
    "SELECT CASE WHEN 1 THEN 2 ELSE 3",
    "SELECT CASE ELSE 0 END",
    "SELECT 1 = 2 = 3",
    "SELECT NOT NOT 1",
    "SELECT 1; SELECT 2",
    "SELECT 1;;",
    "SELECT nombre FROM Usuarios",
    "SELECT tabla.columna",
  ])(
    "rejects unsupported or incomplete input with a real diagnosis: %s",
    (source) => {
      const result = analyzeSql(source);
      expect(result.accepted).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.ast).toBeNull();
      expect(result.cst).toBeNull();
      expect(result.astTree).toBeNull();
      expect(result.derivations.left).toEqual([]);
      for (const diagnostic of result.diagnostics) {
        expect(diagnostic.start).toBeGreaterThanOrEqual(0);
        expect(diagnostic.end).toBeGreaterThanOrEqual(diagnostic.start);
        expect(diagnostic.end).toBeLessThanOrEqual(source.length);
        expect(diagnostic.line).toBeGreaterThanOrEqual(1);
        expect(diagnostic.column).toBeGreaterThanOrEqual(1);
        if (diagnostic.phase === "syntax") {
          expect(diagnostic.expected).toBeTruthy();
          expect(diagnostic.message).toContain("línea");
          expect(diagnostic.message).toContain("se esperaba");
        }
      }
    },
  );

  it("points to EOF after CRLF, CR and LF using half-open UTF-16 coordinates", () => {
    const result = analyzeSql("SELECT\r\n1 +\r\n");
    expect(result.diagnostics[0]).toMatchObject({
      phase: "syntax",
      start: 13,
      end: 13,
      line: 3,
      column: 1,
    });
    const other = analyzeSql("SELECT\r1 +\n");
    expect(other.diagnostics[0]).toMatchObject({
      start: 11,
      end: 11,
      line: 3,
      column: 1,
    });
  });

  it("decodes escaped text only in AST and keeps the exact terminal/range in CST", () => {
    const source = "\r\nSELECT 'O''Brien 😀' AS nombre;";
    const result = analyzeSql(source);
    expect(result.accepted).toBe(true);
    expect(result.ast?.items[0].expression).toMatchObject({
      kind: "literal",
      dataType: "text",
      value: "O'Brien 😀",
      line: 2,
      column: 8,
    });
    const terminal = nodes(result.cst!).find(
      (node) => node.category === "string",
    )!;
    expect(source.slice(terminal.start, terminal.end)).toBe("'O''Brien 😀'");
    expect(terminal.end - terminal.start).toBe("'O''Brien 😀'".length);
  });
});

describe("AST precedence and association", () => {
  it("gives multiplication priority over addition and keeps subtraction left associative", () => {
    expect(firstExpression("SELECT 10 - 2 - 3 * 4")).toMatchObject({
      kind: "binary",
      operator: "-",
      left: {
        kind: "binary",
        operator: "-",
        left: { kind: "literal", value: 10 },
        right: { kind: "literal", value: 2 },
      },
      right: {
        kind: "binary",
        operator: "*",
        left: { kind: "literal", value: 3 },
        right: { kind: "literal", value: 4 },
      },
    });
  });

  it("applies grouping, unary signs, comparisons, NOT, AND and OR in documented order", () => {
    expect(
      firstExpression("SELECT NOT -1 + 2 * 3 = 5 AND 2 > 1 OR 0 = 1"),
    ).toMatchObject({
      kind: "binary",
      operator: "OR",
      left: {
        kind: "binary",
        operator: "AND",
        left: {
          kind: "unary",
          operator: "NOT",
          operand: {
            kind: "binary",
            operator: "=",
            left: {
              kind: "binary",
              operator: "+",
              left: { kind: "unary", operator: "-", operand: { value: 1 } },
              right: { kind: "binary", operator: "*" },
            },
          },
        },
        right: { kind: "binary", operator: ">" },
      },
      right: { kind: "binary", operator: "=" },
    });
    expect(firstExpression("SELECT (1 + 2) * 3")).toMatchObject({
      kind: "binary",
      operator: "*",
      left: { kind: "binary", operator: "+" },
    });
    expect(firstExpression("SELECT 12 / 3 / 2")).toMatchObject({
      kind: "binary",
      operator: "/",
      left: { kind: "binary", operator: "/" },
      right: { value: 2 },
    });
  });

  it.each(["=", "<>", "<", "<=", ">", ">="])(
    "recognizes comparison %s as a binary AST node",
    (operator) => {
      expect(firstExpression(`SELECT 1 ${operator} 2`)).toMatchObject({
        kind: "binary",
        operator,
        left: { value: 1 },
        right: { value: 2 },
      });
    },
  );
});

describe("CST, abstract tree and genuine derivations", () => {
  it("retains all significant terminals exactly once in CST and excludes trivia from productions", () => {
    const source = "-- nota\r\nSELECT f /*espacio*/ (1 + 2), 'x' AS etiqueta;";
    const result = analyzeSql(source);
    const significant = result.tokens.filter(
      (token) =>
        token.category !== "whitespace" && token.category !== "comment",
    );
    const treeNodes = nodes(result.cst!);
    const terminals = treeNodes.filter((node) => node.kind === "terminal");
    expect(terminals.map((node) => node.label)).toEqual(
      significant.map((token) => token.lexeme),
    );
    expect(
      terminals.map((node) => [node.start, node.end, node.line, node.column]),
    ).toEqual(
      significant.map((token) => [
        token.start,
        token.end,
        token.line,
        token.column,
      ]),
    );
    expect(new Set(treeNodes.map((node) => node.id)).size).toBe(
      treeNodes.length,
    );
    for (const node of treeNodes) {
      if (node.kind === "nonterminal") {
        expect(node.rule).toContain(`${node.label} →`);
        expect(node.children.length).toBeGreaterThan(0);
        for (const child of node.children) {
          expect(child.start).toBeGreaterThanOrEqual(node.start);
          expect(child.end).toBeLessThanOrEqual(node.end);
        }
      }
    }
    expect(
      nodes(result.astTree!).every((node) => node.kind === "abstract"),
    ).toBe(true);
    expect(nodes(result.astTree!).some((node) => node.label === "(")).toBe(
      false,
    );
    expect(
      nodes(result.astTree!).some((node) => node.label === "Operador: +"),
    ).toBe(true);
    expect(result.cst?.id).not.toBe(result.astTree?.id);
  });

  it.each(["left", "right"] as const)(
    "expands exactly the %s frontier nonterminal at each derivation step",
    (direction) => {
      const result = analyzeSql(
        "SELECT (1 + 2) * f(3), CASE WHEN 4 = 4 THEN 5 ELSE 6 END valor;",
      );
      const byId = new Map(nodes(result.cst!).map((node) => [node.id, node]));
      let frontier = [result.cst!];
      for (const step of result.derivations[direction]) {
        expect(step.before).toEqual(frontier.map((node) => node.label));
        const target = byId.get(step.nodeId)!;
        const candidates = frontier.filter(
          (node) => node.kind === "nonterminal",
        );
        expect(target).toBe(
          direction === "left"
            ? candidates[0]
            : candidates[candidates.length - 1],
        );
        expect(step.rule).toBe(target.rule);
        const index = frontier.indexOf(target);
        frontier.splice(index, 1, ...target.children);
        expect(step.after).toEqual(frontier.map((node) => node.label));
      }
      expect(frontier.every((node) => node.kind === "terminal")).toBe(true);
      expect(frontier.map((node) => node.label)).toEqual(
        result.tokens
          .filter(
            (token) => !["whitespace", "comment"].includes(token.category),
          )
          .map((token) => token.lexeme),
      );
    },
  );

  it("reaches the same terminal sentence with different left/right expansion orders", () => {
    const result = analyzeSql("SELECT 1 + 2, f(3)");
    const left = result.derivations.left;
    const right = result.derivations.right;
    expect(left.at(-1)?.after).toEqual(right.at(-1)?.after);
    expect(left.map((step) => step.nodeId)).not.toEqual(
      right.map((step) => step.nodeId),
    );
    expect(left[0].before).toEqual(["statement"]);
    expect(right[0].before).toEqual(["statement"]);
  });

  it("derives fresh structures from each actual input instead of reusing the reference case", () => {
    const first = analyzeSql("SELECT 101 AS a");
    const second = analyzeSql("SELECT otro(202) AS b");
    expect(nodes(first.cst!).map((node) => node.label)).toContain("101");
    expect(nodes(second.cst!).map((node) => node.label)).not.toContain("101");
    expect(second.derivations.left.at(-1)?.after).toEqual([
      "SELECT",
      "otro",
      "(",
      "202",
      ")",
      "AS",
      "b",
    ]);
  });
});

describe("bounded educational input", () => {
  it("rejects excessive nesting with a diagnostic instead of overflowing the stack", () => {
    const source = `SELECT ${"(".repeat(MAX_NESTING_DEPTH + 1)}1${")".repeat(MAX_NESTING_DEPTH + 1)}`;
    const result = analyzeSql(source);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics[0].code).toBe("SYN_DEPTH_LIMIT");
    expect(result.cst).toBeNull();
    expect(result.derivations.left).toEqual([]);
    const unary = analyzeSql(`SELECT ${"- ".repeat(MAX_NESTING_DEPTH + 1)}1`);
    expect(unary.diagnostics[0].code).toBe("SYN_DEPTH_LIMIT");
  });

  it("accepts ordinary nested expressions below the documented limit", () => {
    expect(
      analyzeSql(`SELECT ${"(".repeat(12)}1${")".repeat(12)}`).accepted,
    ).toBe(true);
  });

  it("rejects a nonfinite numeric value with an explicit range diagnosis", () => {
    expect(analyzeSql(`SELECT ${"9".repeat(400)}`).diagnostics[0].code).toBe(
      "SYN_NUMBER_RANGE",
    );
  });

  it("has a token guard even if parseSql is called directly without the lexer gate", () => {
    const token = lexSql("SELECT 1").tokens.find(
      (item) => item.lexeme === "1",
    )!;
    const result = parseSql(
      Array.from({ length: MAX_PARSE_TOKENS + 1 }, (_, index) => ({
        ...token,
        id: String(index),
      })),
      "SELECT 1",
    );
    expect(result.diagnostics[0].code).toBe("SYN_TOKEN_LIMIT");
    expect(MAX_CST_NODES).toBeGreaterThan(MAX_PARSE_TOKENS);
  });
});
