import type {
  DerivationStep,
  Expression,
  SourceRange,
  SqlAst,
  TreeNode,
} from "./types";

function rangeOf(value: SourceRange): SourceRange {
  return {
    start: value.start,
    end: value.end,
    line: value.line,
    column: value.column,
  };
}

/** Builds a separate abstract view from AST values; punctuation lives only in CST. */
export function buildAstTree(ast: SqlAst): TreeNode {
  let counter = 0;
  const node = (
    label: string,
    range: SourceRange,
    children: TreeNode[] = [],
  ): TreeNode => ({
    id: `ast-${++counter}`,
    label,
    kind: "abstract",
    ...rangeOf(range),
    children,
  });
  const expressionNode = (expression: Expression): TreeNode => {
    switch (expression.kind) {
      case "literal":
        return node(
          expression.dataType === "number"
            ? `Número: ${expression.value}`
            : `Texto: ${JSON.stringify(expression.value)}`,
          expression,
        );
      case "identifier":
        return node(`Identificador: ${expression.name}`, expression);
      case "unary":
        return node(`Unario: ${expression.operator}`, expression, [
          expressionNode(expression.operand),
        ]);
      case "binary":
        return node(`Operador: ${expression.operator}`, expression, [
          expressionNode(expression.left),
          expressionNode(expression.right),
        ]);
      case "call":
        return node(
          `Llamada: ${expression.name}`,
          expression,
          expression.args.map(expressionNode),
        );
      case "case":
        return node("CASE", expression, [
          ...expression.branches.map((branch) =>
            node(
              "WHEN → THEN",
              {
                ...rangeOf(branch.when),
                end: branch.then.end,
              },
              [expressionNode(branch.when), expressionNode(branch.then)],
            ),
          ),
          node("ELSE", expression.otherwise, [
            expressionNode(expression.otherwise),
          ]),
        ]);
    }
  };
  const items = ast.items.map((item, index) =>
    node(
      item.alias
        ? `Expresión ${index + 1} AS ${item.alias}`
        : `Expresión ${index + 1}`,
      item,
      [expressionNode(item.expression)],
    ),
  );
  if (ast.kind === "select") return node("SELECT", ast, items);
  const columns = (ast.columns ?? []).map((column) =>
    node(`Columna: ${column.name}`, column.range),
  );
  return node(`INSERT INTO ${ast.table ?? ""}`, ast, [
    ...columns,
    node("SELECT", ast.selectRange??{...rangeOf(ast.items[0]??ast),end:ast.items.at(-1)?.end??ast.end}, items),
  ]);
}

/**
 * Expands actual nonterminal nodes in the accepted CST. Keeping node references
 * in the frontier avoids confusing an identifier lexeme with a rule name.
 */
export function deriveCst(
  cst: TreeNode,
  direction: "left" | "right",
): DerivationStep[] {
  const frontier: TreeNode[] = [cst];
  const steps: DerivationStep[] = [];
  while (true) {
    let index = direction === "left" ? 0 : frontier.length - 1;
    const delta = direction === "left" ? 1 : -1;
    while (
      index >= 0 &&
      index < frontier.length &&
      frontier[index].kind !== "nonterminal"
    )
      index += delta;
    if (index < 0 || index >= frontier.length) break;
    const current = frontier[index];
    const before = frontier.map((part) => part.label);
    frontier.splice(index, 1, ...current.children);
    steps.push({
      rule:
        current.rule ??
        `${current.label} → ${current.children.map((child) => child.label).join(" ") || "ε"}`,
      before,
      after: frontier.map((part) => part.label),
      nodeId: current.id,
    });
  }
  return steps;
}
