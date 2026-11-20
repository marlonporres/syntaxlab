import { describe, expect, it } from "vitest";
import { CORRECTED_SQL, ORIGINAL_SQL } from "../../content/lab";
import { analyzeSql } from "./analyze";
import type { DerivationStep, SqlAnalysis, TreeNode } from "./types";

const ORIGINAL = `INSERT INTO Usuarios (Usuario, nombre, perfil, clave, estado)
SELECT
    left(nombre, 1) + apellido,
    nombre + apellido,
    CASE WHEN departamento == "IT" THEN 1 ELSE 0 END perfil,
    generaClave(nombre, edad) clave,
    1)`;

const VALID = [
  "SELECT 1",
  "SELECT 1;",
  "SELECT 1 AS numero, 'Hola' AS saludo",
  "select nombre, apellido usuario",
  "SeLeCt _nombre2 AS resultado",
  "SELECT selectValue",
  "SELECT 12.5, 0.25, 0",
  "SELECT 'O''Brien' AS apellido",
  "SELECT '' vacio",
  "SELECT left(nombre, 1)",
  "SELECT generaClave(nombre, edad) clave",
  "SELECT funcionDesconocida()",
  "SELECT exterior(interior(1), 2 + 3)",
  "SELECT funcion /* entre nombre y llamada */ (1, 2)",
  "SELECT (1 + 2) * 3",
  "SELECT -1 + +2 * --3\n 4",
  "SELECT -(-2)",
  "SELECT a = 1, b <> 2, c <= 3, d >= 4, e < 5, f > 6",
  "SELECT NOT a = 1 AND b = 2 OR c = 3",
  "SELECT CASE WHEN 2 = 2 THEN 1 ELSE 0 END perfil",
  "SELECT CASE WHEN edad >= 18 THEN 'adulto' WHEN edad >= 12 THEN 'joven' ELSE 'niño' END AS etapa",
  "SELECT CASE WHEN 1 = 1 THEN CASE WHEN 2 = 2 THEN 3 ELSE 4 END ELSE 5 END",
  "INSERT INTO Usuarios (Usuario, estado) SELECT 'ana', 1",
  "insert into tabla_1 (_a2) select (2 + 3) valor;",
  "-- comienzo\r\nSELECT 1 /* comentario */; -- final",
  "/* comienzo */ SELECT\t1,\r\n2\r, 3",
  // These checks belong to the independent semantic stage, not grammar acceptance.
  "SELECT 'texto' - 3",
  "INSERT INTO Tabla (a, b) SELECT 1",
];

const INVALID_SYNTAX = [
  "",
  "  \r\n\t",
  "-- solo comentario",
  "SELECT",
  "SELECT 1,",
  "SELECT ,1",
  "SELECT 1,,2",
  "SELECT 1 2",
  "SELECT 1)",
  "SELECT (1 + 2",
  "SELECT ()",
  "SELECT 1 +",
  "SELECT *",
  "SELECT 1 FROM Usuarios",
  "SELECT 1 WHERE 1 = 1",
  "SELECT 1; SELECT 2",
  "SELECT 1;;",
  "SELECT 1 AS",
  "SELECT 1 AS SELECT",
  "SELECT 1 < 2 < 3",
  "SELECT NOT NOT 1 = 1",
  "SELECT f(1,)",
  "SELECT f(,1)",
  "SELECT CASE WHEN 1 = 1 THEN 2 END",
  "SELECT CASE WHEN 1 = 1 2 ELSE 3 END",
  "SELECT CASE THEN 1 ELSE 0 END",
  "INSERT Usuarios (a) SELECT 1",
  "INSERT INTO Usuarios SELECT 1",
  "INSERT INTO Usuarios () SELECT 1",
  "INSERT INTO Usuarios (a,) SELECT 1",
  "INSERT INTO Usuarios (a) VALUES (1)",
];

function allNodes(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap(allNodes)];
}

function terminalLexemes(result: SqlAnalysis): string[] {
  return result.tokens
    .filter(
      (token) =>
        token.category !== "whitespace" && token.category !== "comment",
    )
    .map((token) => token.lexeme);
}

function positionAt(source: string, index: number) {
  const before = source.slice(0, index).split(/\r\n|\r|\n/);
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

function expectNoCompleteStructures(result: SqlAnalysis) {
  expect(result.accepted).toBe(false);
  expect(result.ast).toBeNull();
  expect(result.cst).toBeNull();
  expect(result.astTree).toBeNull();
  expect(result.derivations.left).toEqual([]);
  expect(result.derivations.right).toEqual([]);
}

function assertDerivation(
  root: TreeNode,
  steps: DerivationStep[],
  side: "left" | "right",
) {
  const frontier = [root];
  expect(steps.length).toBeGreaterThan(0);
  for (const step of steps) {
    expect(step.before).toEqual(frontier.map((node) => node.label));
    const candidates = frontier
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => node.kind === "nonterminal");
    const expected =
      side === "left" ? candidates[0] : candidates[candidates.length - 1];
    expect(
      expected,
      "Each step must expand an available nonterminal.",
    ).toBeDefined();
    expect(step.nodeId).toBe(expected.node.id);
    expect(step.rule.trim().length).toBeGreaterThan(0);
    if (expected.node.rule) expect(step.rule).toBe(expected.node.rule);
    frontier.splice(expected.index, 1, ...expected.node.children);
    expect(step.after).toEqual(frontier.map((node) => node.label));
  }
  expect(frontier.every((node) => node.kind === "terminal")).toBe(true);
  return frontier.map((node) => node.label);
}

describe("external grammar acceptance", () => {
  it.each(VALID)("accepts the documented grammar: %s", (sql) => {
    const result = analyzeSql(sql);
    expect(result.source).toBe(sql);
    expect(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.severity === "error",
      ),
    ).toEqual([]);
    expect(result.accepted).toBe(true);
    expect(result.ast).not.toBeNull();
    expect(result.cst).not.toBeNull();
    expect(result.astTree).not.toBeNull();
  });

  it.each(INVALID_SYNTAX)(
    "rejects incomplete or unsupported grammar: %s",
    (sql) => {
      const result = analyzeSql(sql);
      expectNoCompleteStructures(result);
      const errors = result.diagnostics.filter(
        (diagnostic) => diagnostic.severity === "error",
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((diagnostic) => diagnostic.phase === "syntax")).toBe(
        true,
      );
      for (const error of errors) {
        expect(error.message.trim().length).toBeGreaterThan(0);
        expect(error.start).toBeGreaterThanOrEqual(0);
        expect(error.end).toBeGreaterThanOrEqual(error.start);
        expect(error.end).toBeLessThanOrEqual(sql.length);
        expect({ line: error.line, column: error.column }).toEqual(
          positionAt(sql, error.start),
        );
      }
    },
  );

  it("preserves the original reference and only builds the separately corrected version", () => {
    expect(ORIGINAL_SQL).toBe(ORIGINAL);
    const original = analyzeSql(ORIGINAL_SQL);
    expect(original.source).toBe(ORIGINAL);
    expectNoCompleteStructures(original);
    expect(
      original.diagnostics.some((diagnostic) => diagnostic.phase === "lexical"),
    ).toBe(true);
    const corrected = analyzeSql(CORRECTED_SQL);
    expect(corrected.accepted).toBe(true);
    expect(corrected.source).toBe(CORRECTED_SQL);
    expect(corrected.ast).toMatchObject({
      kind: "insert",
      table: "Usuarios",
      columns: [
        { name: "Usuario" },
        { name: "nombre" },
        { name: "perfil" },
        { name: "clave" },
        { name: "estado" },
      ],
    });
    expect(corrected.ast?.items).toHaveLength(5);
    expect(corrected.ast?.items[2].alias).toBe("perfil");
    expect(corrected.ast?.items[3].alias).toBe("clave");
  });

  it.each([
    "SELECT @",
    'SELECT "IT"',
    "SELECT departamento == 'IT'",
    "SELECT 'sin cerrar",
    "SELECT 1 /* sin cerrar",
    "SELECT usuario.nombre",
  ])("reports lexical errors without inventing trees: %s", (sql) => {
    const result = analyzeSql(sql);
    expectNoCompleteStructures(result);
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.phase === "lexical" && diagnostic.severity === "error",
      ),
    ).toBe(true);
    expect(result.tokens.map((token) => token.lexeme).join("")).toBe(sql);
  });

  it("explains the expected input for a missing expression and closing parenthesis", () => {
    for (const sql of ["SELECT 1,", "SELECT (1 + 2"]) {
      const result = analyzeSql(sql);
      const diagnostic = result.diagnostics.find(
        (item) => item.phase === "syntax",
      );
      expect(diagnostic?.expected?.trim().length).toBeGreaterThan(0);
      expect(diagnostic?.start).toBe(sql.length);
    }
  });
});

describe("external token and source contract", () => {
  it("partitions every source unit, preserving trivia and CRLF source positions", () => {
    const sql =
      "-- inicio\r\nSELECT left(nombre, 1), 'O''Brien' AS apellido /* fin */\r\n;";
    const result = analyzeSql(sql);
    expect(result.accepted).toBe(true);
    expect(result.tokens.map((token) => token.lexeme).join("")).toBe(sql);
    expect(new Set(result.tokens.map((token) => token.id)).size).toBe(
      result.tokens.length,
    );
    let end = 0;
    for (const token of result.tokens) {
      expect(token.start).toBe(end);
      expect(token.end).toBeGreaterThan(token.start);
      expect(sql.slice(token.start, token.end)).toBe(token.lexeme);
      expect({ line: token.line, column: token.column }).toEqual(
        positionAt(sql, token.start),
      );
      end = token.end;
    }
    expect(end).toBe(sql.length);
    expect(
      result.tokens
        .filter((token) => token.category === "comment")
        .map((token) => token.lexeme),
    ).toEqual(["-- inicio", "/* fin */"]);
    expect(
      result.tokens.find((token) => token.lexeme === "SELECT"),
    ).toMatchObject({ line: 2, column: 1, category: "keyword" });
    expect(
      result.tokens.find((token) => token.lexeme === "left"),
    ).toMatchObject({ category: "function" });
    expect(
      result.tokens.find((token) => token.lexeme === "'O''Brien'"),
    ).toMatchObject({ category: "string" });
    expect(
      result.tokens.some(
        (token) =>
          token.category === "whitespace" && token.lexeme.includes("\r\n"),
      ),
    ).toBe(true);
  });

  it("uses the longest admitted operators and preserves keyword casing", () => {
    const result = analyzeSql("SeLeCt a <= 2, b >= 3, c <> 4");
    expect(result.accepted).toBe(true);
    expect(result.tokens[0]).toMatchObject({
      lexeme: "SeLeCt",
      category: "keyword",
    });
    expect(
      result.tokens
        .filter((token) => token.category === "operator")
        .map((token) => token.lexeme),
    ).toEqual(["<=", ">=", "<>"]);
  });

  it("marks the unsupported equality operator explicitly at its actual source range", () => {
    const sql = "SELECT nombre == 1";
    const result = analyzeSql(sql);
    const equals = result.tokens.find((token) => token.lexeme === "==");
    expect(equals).toMatchObject({
      category: "invalid",
      start: 14,
      end: 16,
      line: 1,
      column: 15,
    });
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.phase === "lexical" &&
          sql.slice(diagnostic.start, diagnostic.end) === "==",
      ),
    ).toBe(true);
  });

  it("uses UTF-16 offsets consistently for Unicode inside text literals", () => {
    const sql = "SELECT '😀',\r\n'año' texto";
    const result = analyzeSql(sql);
    expect(result.accepted).toBe(true);
    for (const token of result.tokens) {
      expect(sql.slice(token.start, token.end)).toBe(token.lexeme);
      expect({ line: token.line, column: token.column }).toEqual(
        positionAt(sql, token.start),
      );
    }
    expect(
      result.tokens.find((token) => token.lexeme === "'😀'"),
    ).toMatchObject({ start: 7, end: 11 });
    expect(
      result.tokens.find((token) => token.lexeme === "'año'"),
    ).toMatchObject({ line: 2, column: 1 });
  });
});

describe("external AST, CST and derivations", () => {
  it("represents arithmetic precedence instead of flattening the expression", () => {
    expect(
      analyzeSql("SELECT 1 + 2 * 3").ast?.items[0].expression,
    ).toMatchObject({
      kind: "binary",
      operator: "+",
      left: { kind: "literal", value: 1 },
      right: {
        kind: "binary",
        operator: "*",
        left: { value: 2 },
        right: { value: 3 },
      },
    });
    expect(
      analyzeSql("SELECT (1 + 2) * 3").ast?.items[0].expression,
    ).toMatchObject({
      kind: "binary",
      operator: "*",
      left: {
        kind: "binary",
        operator: "+",
        left: { value: 1 },
        right: { value: 2 },
      },
      right: { kind: "literal", value: 3 },
    });
    expect(
      analyzeSql("SELECT 8 - 3 - 1").ast?.items[0].expression,
    ).toMatchObject({
      kind: "binary",
      operator: "-",
      left: {
        kind: "binary",
        operator: "-",
        left: { value: 8 },
        right: { value: 3 },
      },
      right: { kind: "literal", value: 1 },
    });
  });

  it("distinguishes unary signs and logical precedence", () => {
    expect(analyzeSql("SELECT -1 * +2").ast?.items[0].expression).toMatchObject(
      {
        kind: "binary",
        operator: "*",
        left: { kind: "unary", operator: "-", operand: { value: 1 } },
        right: { kind: "unary", operator: "+", operand: { value: 2 } },
      },
    );
    expect(
      analyzeSql("SELECT NOT 1 = 2 AND 3 < 4 OR 0 = 0").ast?.items[0]
        .expression,
    ).toMatchObject({
      kind: "binary",
      operator: "OR",
      left: {
        kind: "binary",
        operator: "AND",
        left: {
          kind: "unary",
          operator: "NOT",
          operand: { kind: "binary", operator: "=" },
        },
        right: { kind: "binary", operator: "<" },
      },
      right: { kind: "binary", operator: "=" },
    });
  });

  it("keeps function arguments, decoded literals and CASE branches in the AST", () => {
    const result = analyzeSql(
      "SELECT f('O''Brien', 12.5) persona, CASE WHEN 1 = 1 THEN 2 WHEN 3 = 3 THEN 4 ELSE 0 END perfil",
    );
    expect(result.accepted).toBe(true);
    expect(result.ast?.items[0]).toMatchObject({
      alias: "persona",
      expression: {
        kind: "call",
        name: "f",
        args: [
          { kind: "literal", value: "O'Brien", dataType: "text" },
          { kind: "literal", value: 12.5, dataType: "number" },
        ],
      },
    });
    expect(result.ast?.items[1]).toMatchObject({
      alias: "perfil",
      expression: {
        kind: "case",
        branches: [
          { when: { operator: "=" }, then: { value: 2 } },
          { when: { operator: "=" }, then: { value: 4 } },
        ],
        otherwise: { kind: "literal", value: 0 },
      },
    });
  });

  it("keeps every CST terminal, punctuation and exact range independently of the AST", () => {
    const sql = "/* fuente */ SELECT (1 + 2) * f(3, 4) AS total;";
    const result = analyzeSql(sql);
    expect(result.accepted).toBe(true);
    const nodes = allNodes(result.cst!);
    const terminals = nodes.filter((node) => node.kind === "terminal");
    expect(terminals.map((node) => node.label)).toEqual(
      terminalLexemes(result),
    );
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
    for (const terminal of terminals) {
      expect(sql.slice(terminal.start, terminal.end)).toBe(terminal.label);
      expect({ line: terminal.line, column: terminal.column }).toEqual(
        positionAt(sql, terminal.start),
      );
    }
    for (const node of nodes) {
      expect(node.start).toBeGreaterThanOrEqual(0);
      expect(node.end).toBeLessThanOrEqual(sql.length);
      expect(node.end).toBeGreaterThanOrEqual(node.start);
      for (const child of node.children) {
        expect(child.start).toBeGreaterThanOrEqual(node.start);
        expect(child.end).toBeLessThanOrEqual(node.end);
      }
    }
    expect(result.astTree?.kind).toBe("abstract");
    expect(
      allNodes(result.astTree!).every((node) => node.kind === "abstract"),
    ).toBe(true);
  });

  it("constructs different leftmost and rightmost expansions ending in the exact same terminal sequence", () => {
    const result = analyzeSql("SELECT (1 + 2) * f(3, 4) AS total;");
    expect(result.accepted).toBe(true);
    const left = assertDerivation(result.cst!, result.derivations.left, "left");
    const right = assertDerivation(
      result.cst!,
      result.derivations.right,
      "right",
    );
    expect(left).toEqual(terminalLexemes(result));
    expect(right).toEqual(left);
    expect(result.derivations.left.map((step) => step.nodeId)).not.toEqual(
      result.derivations.right.map((step) => step.nodeId),
    );
  });
});
