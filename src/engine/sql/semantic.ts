import type {
  Catalog,
  Diagnostic,
  Expression,
  SemanticResult,
  SourceRange,
  SqlAst,
  SqlType,
} from "./types";

export const DEMO_CATALOG: Catalog = {
  sourceTable: "Usuarios",
  tables: [
    {
      name: "Usuarios",
      columns: [
        { name: "Usuario", type: "text" },
        { name: "nombre", type: "text" },
        { name: "apellido", type: "text" },
        { name: "departamento", type: "text" },
        { name: "edad", type: "number" },
        { name: "perfil", type: "number" },
        { name: "clave", type: "text" },
        { name: "estado", type: "number" },
      ],
    },
  ],
  functions: [
    { name: "left", parameters: ["text", "number"], returns: "text" },
    { name: "generaClave", parameters: ["text", "number"], returns: "text" },
  ],
};
const sqlTypes: SqlType[] = ["text", "number", "boolean"];
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function parseCatalog(text: string): Catalog {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object")
    throw new Error("El catálogo debe ser un objeto JSON.");
  const c = value as Record<string, unknown>;
  if (!Array.isArray(c.tables) || !Array.isArray(c.functions))
    throw new Error("Se necesitan listas tables y functions.");
  if (c.tables.length > 100 || c.functions.length > 100)
    throw new Error("Límite educativo: 100 tablas y 100 funciones.");
  const name = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z_][A-Za-z_0-9]*$/.test(value);
  const type = (value: unknown): value is SqlType =>
    sqlTypes.includes(value as SqlType);
  const unique = (values: string[], scope: string) => {
    if (new Set(values.map((n) => n.toLowerCase())).size !== values.length)
      throw new Error(`Nombres duplicados en ${scope}.`);
  };
  for (const table of c.tables) {
    if (
      !table ||
      !name(table.name) ||
      !Array.isArray(table.columns) ||
      table.columns.length > 200
    )
      throw new Error(
        "Cada tabla necesita name y columns (máximo 200 columnas).",
      );
    for (const column of table.columns)
      if (!column || !name(column.name) || !type(column.type))
        throw new Error(
          "Cada columna necesita name y type: text, number o boolean.",
        );
    unique(
      table.columns.map((column: { name: string }) => column.name),
      table.name,
    );
  }
  for (const func of c.functions)
    if (
      !func ||
      !name(func.name) ||
      !Array.isArray(func.parameters) ||
      func.parameters.length > 30 ||
      !func.parameters.every(type) ||
      !type(func.returns)
    )
      throw new Error(
        "Cada función necesita name, parameters (tipos) y returns. Máximo 30 parámetros.",
      );
  unique(
    c.tables.map((t) => t.name),
    "tablas",
  );
  unique(
    c.functions.map((f) => f.name),
    "funciones",
  );
  if (
    c.sourceTable !== undefined &&
    (!name(c.sourceTable) ||
      !c.tables.some((t) => sameName(t.name, c.sourceTable as string)))
  )
    throw new Error("sourceTable debe nombrar una tabla del catálogo.");
  return c as unknown as Catalog;
}

export function validateSemantic(
  ast: SqlAst,
  catalog: Catalog | null,
): SemanticResult {
  const diagnostics: Diagnostic[] = [];
  const report = (
    range: SourceRange,
    code: string,
    message: string,
    severity: Diagnostic["severity"] = "error",
    hint?: string,
  ) =>
    diagnostics.push({
      ...range,
      phase: "semantic",
      severity,
      code,
      message,
      hint,
    });
  const source = catalog?.sourceTable
    ? catalog.tables.find((t) => sameName(t.name, catalog.sourceTable!))
    : undefined;
  if (!catalog)
    report(
      ast,
      "CATALOG_MISSING",
      "No hay catálogo configurado: no se comprueban nombres de tablas, columnas ni firmas de funciones.",
      "info",
      "Configura un catálogo explícito para completar el análisis.",
    );
  const requireType = (
    expression: Expression,
    actual: SqlType | "unknown",
    expected: SqlType,
    context: string,
  ) => {
    if (actual !== "unknown" && actual !== expected)
      report(
        expression,
        "TYPE_MISMATCH",
        `${context} requiere ${expected}; se obtuvo ${actual}.`,
        "error",
        "¿Qué tipo produce cada operando?",
      );
  };
  const infer = (expr: Expression): SqlType | "unknown" => {
    switch (expr.kind) {
      case "literal":
        return expr.dataType;
      case "identifier": {
        if (!source) {
          report(
            expr,
            "SOURCE_MISSING",
            `No se puede resolver ${expr.name}: selecciona una tabla de origen en el catálogo.`,
            "info",
          );
          return "unknown";
        }
        const column = source.columns.find((c) => sameName(c.name, expr.name));
        if (!column) {
          report(
            expr,
            "COLUMN_UNKNOWN",
            `La columna ${expr.name} no existe en ${source.name}.`,
          );
          return "unknown";
        }
        return column.type;
      }
      case "call": {
        const args = expr.args.map(infer);
        const func = catalog?.functions.find((f) =>
          sameName(f.name, expr.name),
        );
        if (!func) {
          report(
            expr,
            "FUNCTION_UNKNOWN",
            `No se conoce la firma de ${expr.name}.`,
            catalog ? "error" : "info",
            "Declara los parámetros y el retorno de la función.",
          );
          return "unknown";
        }
        if (args.length !== func.parameters.length)
          report(
            expr,
            "FUNCTION_ARITY",
            `${expr.name} espera ${func.parameters.length} argumentos; recibió ${args.length}.`,
          );
        args.forEach((arg, index) => {
          if (func.parameters[index])
            requireType(
              expr.args[index],
              arg,
              func.parameters[index],
              `Argumento ${index + 1} de ${func.name}`,
            );
        });
        return func.returns;
      }
      case "unary": {
        const value = infer(expr.operand);
        const expected = expr.operator === "NOT" ? "boolean" : "number";
        requireType(expr.operand, value, expected, `Operador ${expr.operator}`);
        return value === "unknown" ? "unknown" : expected;
      }
      case "binary": {
        const left = infer(expr.left),
          right = infer(expr.right),
          op = expr.operator.toUpperCase();
        if (["AND", "OR"].includes(op)) {
          requireType(expr.left, left, "boolean", op);
          requireType(expr.right, right, "boolean", op);
          return "boolean";
        }
        if (["=", "<>", "<", "<=", ">", ">="].includes(op)) {
          if (left !== "unknown" && right !== "unknown" && left !== right)
            report(
              expr,
              "COMPARISON_TYPES",
              `No se comparan ${left} y ${right} sin conversión explícita.`,
            );
          return "boolean";
        }
        if (left === "unknown" || right === "unknown") return "unknown";
        if (op === "+" && left === "text" && right === "text") return "text";
        if (left !== "number" || right !== "number") {
          report(
            expr,
            "OPERATOR_TYPES",
            `${op} no admite operandos ${left} y ${right}.`,
            "error",
            op === "+"
              ? "Usa dos números para sumar o dos textos para concatenar."
              : "Ambos operandos deben ser numéricos.",
          );
          return "unknown";
        }
        return "number";
      }
      case "case": {
        const branchTypes = expr.branches.map((branch) => {
          requireType(branch.when, infer(branch.when), "boolean", "WHEN");
          return infer(branch.then);
        });
        branchTypes.push(infer(expr.otherwise));
        const known = branchTypes.filter((type) => type !== "unknown");
        if (new Set(known).size > 1) {
          report(
            expr,
            "CASE_TYPES",
            "Las ramas THEN y ELSE de CASE deben producir el mismo tipo.",
          );
          return "unknown";
        }
        return branchTypes.includes("unknown")
          ? "unknown"
          : (known[0] ?? "unknown");
      }
    }
  };
  const itemTypes = ast.items.map((item) => infer(item.expression));
  if (ast.kind === "insert") {
    const columns = ast.columns ?? [];
    if (columns.length !== ast.items.length)
      report(
        ast,
        "INSERT_ARITY",
        `INSERT declara ${columns.length} columnas pero SELECT produce ${ast.items.length} expresiones.`,
      );
    const seen = new Set<string>();
    columns.forEach((column) => {
      const key = column.name.toLowerCase();
      if (seen.has(key))
        report(
          column.range,
          "DUPLICATE_COLUMN",
          `La columna de destino ${column.name} está repetida.`,
        );
      seen.add(key);
    });
    const target = catalog?.tables.find((table) =>
      sameName(table.name, ast.table ?? ""),
    );
    if (catalog && !target)
      report(
        ast,
        "TABLE_UNKNOWN",
        `La tabla de destino ${ast.table} no existe en el catálogo.`,
      );
    if (target)
      columns.forEach((column, index) => {
        const targetColumn = target.columns.find((c) =>
          sameName(c.name, column.name),
        );
        if (!targetColumn)
          report(
            column.range,
            "TARGET_COLUMN_UNKNOWN",
            `La columna ${column.name} no existe en ${target.name}.`,
          );
        else if (
          itemTypes[index] &&
          itemTypes[index] !== "unknown" &&
          itemTypes[index] !== targetColumn.type
        )
          report(
            ast.items[index],
            "INSERT_TYPE",
            `La columna ${column.name} necesita ${targetColumn.type}; la expresión produce ${itemTypes[index]}.`,
          );
      });
  }
  return {
    diagnostics,
    itemTypes,
    complete: diagnostics.length === 0 && !itemTypes.includes("unknown"),
  };
}
