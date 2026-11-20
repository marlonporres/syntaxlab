import { describe, expect, it } from "vitest";
import { CORRECTED_SQL } from "../../content/lab";
import { analyzeSql } from "./analyze";
import { DEMO_CATALOG, parseCatalog, validateSemantic } from "./semantic";
import type { Catalog, SemanticResult } from "./types";

function check(
  sql: string,
  catalog: Catalog | null = DEMO_CATALOG,
): SemanticResult {
  const analysis = analyzeSql(sql);
  expect(analysis.accepted, JSON.stringify(analysis.diagnostics)).toBe(true);
  expect(analysis.ast).not.toBeNull();
  return validateSemantic(analysis.ast!, catalog);
}

function codes(result: SemanticResult) {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe("explicit catalog parsing", () => {
  it("accepts and preserves a complete catalog without assuming a schema", () => {
    expect(parseCatalog(JSON.stringify(DEMO_CATALOG))).toEqual(DEMO_CATALOG);
    expect(parseCatalog('{"tables":[],"functions":[]}')).toEqual({
      tables: [],
      functions: [],
    });
  });

  it("resolves sourceTable without case sensitivity while preserving supplied names", () => {
    const supplied = { ...DEMO_CATALOG, sourceTable: "uSuArIoS" };
    expect(parseCatalog(JSON.stringify(supplied))).toEqual(supplied);
  });

  it.each([
    "{invalid",
    "null",
    "[]",
    "1",
    '"catalog"',
    "{}",
    '{"tables":[],"functions":{}}',
    '{"tables":{},"functions":[]}',
  ])("rejects malformed JSON or catalog structure: %s", (json) => {
    expect(() => parseCatalog(json)).toThrow();
  });

  it.each([
    {
      tables: [
        { name: "Usuarios", columns: [{ name: "edad", type: "integer" }] },
      ],
      functions: [],
    },
    {
      tables: [
        { name: "Usuarios", columns: [{ name: "edad", type: "NUMBER" }] },
      ],
      functions: [],
    },
    {
      tables: [{ name: "Usuarios", columns: [{ name: "edad", type: 1 }] }],
      functions: [],
    },
    {
      tables: [{ name: "Usuarios", columns: [{ name: "edad" }] }],
      functions: [],
    },
    { tables: [{ name: "Usuarios" }], functions: [] },
    { tables: [{ name: "tabla incorrecta", columns: [] }], functions: [] },
    {
      tables: [
        { name: "Usuarios", columns: [{ name: "1columna", type: "text" }] },
      ],
      functions: [],
    },
    {
      tables: [],
      functions: [{ name: "f", parameters: ["integer"], returns: "text" }],
    },
    { tables: [], functions: [{ name: "f", parameters: [], returns: "date" }] },
    {
      tables: [],
      functions: [{ name: "f", parameters: "text", returns: "text" }],
    },
    { tables: [], functions: [{ name: "f", parameters: [], returns: null }] },
    { tables: [], functions: [null] },
    { tables: [null], functions: [] },
    { sourceTable: "Fantasma", tables: [], functions: [] },
    { sourceTable: 3, tables: [], functions: [] },
  ])("rejects invalid names, types and source definitions: %j", (value) => {
    expect(() => parseCatalog(JSON.stringify(value))).toThrow();
  });

  it.each([
    {
      tables: [
        { name: "Usuarios", columns: [] },
        { name: "USUARIOS", columns: [] },
      ],
      functions: [],
    },
    {
      tables: [
        {
          name: "Usuarios",
          columns: [
            { name: "nombre", type: "text" },
            { name: "NOMBRE", type: "text" },
          ],
        },
      ],
      functions: [],
    },
    {
      tables: [],
      functions: [
        { name: "left", parameters: [], returns: "text" },
        { name: "LEFT", parameters: [], returns: "text" },
      ],
    },
  ])(
    "rejects duplicate names within their case-insensitive scope: %j",
    (value) => {
      expect(() => parseCatalog(JSON.stringify(value))).toThrow(/duplicad/i);
    },
  );

  it("permits the same column name in different tables", () => {
    const catalog = {
      tables: [
        { name: "Uno", columns: [{ name: "id", type: "number" }] },
        { name: "Dos", columns: [{ name: "id", type: "number" }] },
      ],
      functions: [],
    };
    expect(parseCatalog(JSON.stringify(catalog))).toEqual(catalog);
  });

  it("enforces documented educational size limits for catalogs", () => {
    const tooManyTables = {
      tables: Array.from({ length: 101 }, (_, index) => ({
        name: `T${index}`,
        columns: [],
      })),
      functions: [],
    };
    const tooManyColumns = {
      tables: [
        {
          name: "T",
          columns: Array.from({ length: 201 }, (_, index) => ({
            name: `c${index}`,
            type: "number",
          })),
        },
      ],
      functions: [],
    };
    const tooManyParameters = {
      tables: [],
      functions: [
        {
          name: "f",
          parameters: Array.from({ length: 31 }, () => "number"),
          returns: "number",
        },
      ],
    };
    for (const invalid of [tooManyTables, tooManyColumns, tooManyParameters]) {
      expect(() => parseCatalog(JSON.stringify(invalid))).toThrow();
    }
  });
});

describe("independent semantic analysis", () => {
  it("reports limitations without inventing tables, columns or function signatures when no catalog exists", () => {
    const result = check("SELECT nombre, generaClave(nombre, edad)", null);
    expect(result.complete).toBe(false);
    expect(result.itemTypes).toEqual(["unknown", "unknown"]);
    expect(codes(result)).toContain("CATALOG_MISSING");
    expect(
      result.diagnostics.every((diagnostic) => diagnostic.severity === "info"),
    ).toBe(true);
    expect(codes(result)).not.toContain("COLUMN_UNKNOWN");
    expect(codes(result)).not.toContain("TABLE_UNKNOWN");
  });

  it("can infer literal types without claiming complete validation without a catalog", () => {
    const result = check("SELECT 1, 'texto', 1 = 1", null);
    expect(result.itemTypes).toEqual(["number", "text", "boolean"]);
    expect(result.complete).toBe(false);
    expect(codes(result)).toEqual(["CATALOG_MISSING"]);
  });

  it("does not silently choose a source table when a configured catalog omits sourceTable", () => {
    const catalog = {
      tables: DEMO_CATALOG.tables,
      functions: DEMO_CATALOG.functions,
    };
    const result = check("SELECT nombre", catalog);
    expect(result.itemTypes).toEqual(["unknown"]);
    expect(result.complete).toBe(false);
    expect(codes(result)).toEqual(["SOURCE_MISSING"]);
    expect(result.diagnostics[0].severity).toBe("info");
  });

  it("resolves tables, columns and functions without case sensitivity", () => {
    const catalog = parseCatalog(
      JSON.stringify({ ...DEMO_CATALOG, sourceTable: "uSuArIoS" }),
    );
    const result = check(
      "INSERT INTO USUARIOS (NOMBRE, EDAD, CLAVE) SELECT NOMBRE, EDAD, LEFT(NOMBRE, 1)",
      catalog,
    );
    expect(result.itemTypes).toEqual(["text", "number", "text"]);
    expect(result.diagnostics).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("validates the separately corrected classroom case only against an explicit demo catalog", () => {
    const result = check(CORRECTED_SQL);
    expect(result.itemTypes).toEqual([
      "text",
      "text",
      "number",
      "text",
      "number",
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("reports an unknown source column at its exact CRLF source range", () => {
    const sql = "SELECT\r\n falta";
    const result = check(sql);
    const diagnostic = result.diagnostics.find(
      (item) => item.code === "COLUMN_UNKNOWN",
    );
    expect(diagnostic).toMatchObject({
      phase: "semantic",
      severity: "error",
      line: 2,
      column: 2,
    });
    expect(sql.slice(diagnostic!.start, diagnostic!.end)).toBe("falta");
    expect(result.itemTypes).toEqual(["unknown"]);
    expect(result.complete).toBe(false);
  });

  it("reports unknown target tables and target columns without inferring them from names", () => {
    expect(
      codes(check("INSERT INTO Fantasma (nombre) SELECT 'Ana'")),
    ).toContain("TABLE_UNKNOWN");
    expect(codes(check("INSERT INTO Usuarios (extra) SELECT 1"))).toContain(
      "TARGET_COLUMN_UNKNOWN",
    );
  });

  it("reports unknown functions when a catalog is present", () => {
    const result = check("SELECT noExiste(nombre)");
    expect(codes(result)).toContain("FUNCTION_UNKNOWN");
    expect(
      result.diagnostics.find((item) => item.code === "FUNCTION_UNKNOWN")
        ?.severity,
    ).toBe("error");
    expect(result.itemTypes).toEqual(["unknown"]);
    expect(result.complete).toBe(false);
  });

  it.each([
    "SELECT left()",
    "SELECT left(nombre)",
    "SELECT left(nombre, 1, 2)",
  ])("checks function arity: %s", (sql) => {
    const result = check(sql);
    expect(codes(result)).toContain("FUNCTION_ARITY");
    expect(result.complete).toBe(false);
  });

  it("checks each function argument type at the argument range", () => {
    const sql = "SELECT left(10, 'x')";
    const result = check(sql);
    const mismatches = result.diagnostics.filter(
      (item) => item.code === "TYPE_MISMATCH",
    );
    expect(
      mismatches.map((diagnostic) =>
        sql.slice(diagnostic.start, diagnostic.end),
      ),
    ).toEqual(["10", "'x'"]);
    expect(result.complete).toBe(false);
  });

  it("uses configured return types when checking INSERT destinations", () => {
    const result = check(
      "INSERT INTO Usuarios (perfil) SELECT left(nombre, 1)",
    );
    expect(result.itemTypes).toEqual(["text"]);
    expect(codes(result)).toContain("INSERT_TYPE");
    expect(result.complete).toBe(false);
  });

  it.each([
    "INSERT INTO Usuarios (nombre, edad) SELECT nombre",
    "INSERT INTO Usuarios (nombre) SELECT nombre, edad",
  ])(
    "checks the number of INSERT columns and SELECT expressions: %s",
    (sql) => {
      expect(codes(check(sql))).toContain("INSERT_ARITY");
      expect(codes(check(sql, null))).toContain("INSERT_ARITY");
    },
  );

  it("checks destination types and duplicate destination names", () => {
    const mismatched = check(
      "INSERT INTO Usuarios (nombre, edad) SELECT 1, '20'",
    );
    expect(
      mismatched.diagnostics.filter((item) => item.code === "INSERT_TYPE"),
    ).toHaveLength(2);
    expect(
      codes(check("INSERT INTO Usuarios (nombre, NOMBRE) SELECT 'a', 'b'")),
    ).toContain("DUPLICATE_COLUMN");
  });

  it("accepts compatible CASE branches with boolean conditions", () => {
    const result = check(
      "SELECT CASE WHEN edad >= 18 THEN 'adulto' WHEN edad >= 12 THEN 'joven' ELSE 'niño' END",
    );
    expect(result.itemTypes).toEqual(["text"]);
    expect(result.complete).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects nonboolean CASE conditions and incompatible branch types", () => {
    expect(codes(check("SELECT CASE WHEN edad THEN 1 ELSE 0 END"))).toContain(
      "TYPE_MISMATCH",
    );
    const incompatible = check(
      "SELECT CASE WHEN 1 = 1 THEN 1 ELSE 'texto' END",
    );
    expect(codes(incompatible)).toContain("CASE_TYPES");
    expect(incompatible.itemTypes).toEqual(["unknown"]);
    expect(incompatible.complete).toBe(false);
  });

  it("does not infer a known CASE return type from one branch when another is unresolved", () => {
    const result = check("SELECT CASE WHEN 1 = 1 THEN falta ELSE 0 END");
    expect(codes(result)).toContain("COLUMN_UNKNOWN");
    expect(result.itemTypes).toEqual(["unknown"]);
    expect(result.complete).toBe(false);
  });

  it("distinguishes numeric addition, text concatenation and comparison results", () => {
    const result = check(
      "SELECT 1 + 2 * 3, 'a' + 'b', nombre + apellido, edad >= 18",
    );
    expect(result.itemTypes).toEqual(["number", "text", "text", "boolean"]);
    expect(result.diagnostics).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it.each([
    "SELECT 'texto' + 1",
    "SELECT 'texto' - 'otro'",
    "SELECT nombre * edad",
    "SELECT (1 = 1) + 2",
  ])("rejects incompatible arithmetic operands: %s", (sql) => {
    const result = check(sql);
    expect(codes(result)).toContain("OPERATOR_TYPES");
    expect(result.itemTypes).toEqual(["unknown"]);
    expect(result.complete).toBe(false);
  });

  it("checks comparison, logical and unary operand types independently", () => {
    expect(codes(check("SELECT 1 = '1'"))).toContain("COMPARISON_TYPES");
    expect(codes(check("SELECT edad AND estado"))).toContain("TYPE_MISMATCH");
    expect(codes(check("SELECT NOT edad"))).toContain("TYPE_MISMATCH");
    expect(codes(check("SELECT -nombre"))).toContain("TYPE_MISMATCH");
    expect(
      check("SELECT NOT (edad < 18) AND estado = 1 OR perfil = 0").itemTypes,
    ).toEqual(["boolean"]);
  });

  it("keeps unresolved expression types unknown and does not mutate the explicit catalog", () => {
    const catalog = parseCatalog(JSON.stringify(DEMO_CATALOG));
    const before = JSON.stringify(catalog);
    const result = check("SELECT falta + 1", catalog);
    expect(result.itemTypes).toEqual(["unknown"]);
    expect(result.complete).toBe(false);
    expect(JSON.stringify(catalog)).toBe(before);
    expect(
      result.diagnostics.every((diagnostic) => diagnostic.phase === "semantic"),
    ).toBe(true);
  });
});
