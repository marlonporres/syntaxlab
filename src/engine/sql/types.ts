export interface SourceRange {
  start: number;
  end: number;
  line: number;
  column: number;
}
export type TokenCategory =
  | "keyword"
  | "identifier"
  | "function"
  | "operator"
  | "number"
  | "string"
  | "delimiter"
  | "comment"
  | "whitespace"
  | "invalid";
export interface SqlToken extends SourceRange {
  id: string;
  lexeme: string;
  category: TokenCategory;
}
export interface Diagnostic extends SourceRange {
  phase: "lexical" | "syntax" | "semantic";
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  expected?: string;
  hint?: string;
}
export interface TreeNode extends SourceRange {
  id: string;
  label: string;
  kind: "terminal" | "nonterminal" | "abstract";
  rule?: string;
  category?: TokenCategory;
  children: TreeNode[];
}
export type Expression =
  | (SourceRange & {
      kind: "literal";
      value: string | number;
      dataType: "text" | "number";
    })
  | (SourceRange & { kind: "identifier"; name: string })
  | (SourceRange & { kind: "unary"; operator: string; operand: Expression })
  | (SourceRange & {
      kind: "binary";
      operator: string;
      left: Expression;
      right: Expression;
    })
  | (SourceRange & { kind: "call"; name: string; args: Expression[] })
  | (SourceRange & {
      kind: "case";
      branches: { when: Expression; then: Expression }[];
      otherwise: Expression;
    });
export interface SelectItem extends SourceRange {
  expression: Expression;
  alias?: string;
}
export interface SqlAst extends SourceRange {
  selectRange?: SourceRange;
  kind: "select" | "insert";
  table?: string;
  columns?: { name: string; range: SourceRange }[];
  items: SelectItem[];
}
export interface DerivationStep {
  rule: string;
  before: string[];
  after: string[];
  nodeId: string;
}
export interface SqlAnalysis {
  source: string;
  tokens: SqlToken[];
  diagnostics: Diagnostic[];
  ast: SqlAst | null;
  cst: TreeNode | null;
  astTree: TreeNode | null;
  derivations: { left: DerivationStep[]; right: DerivationStep[] };
  accepted: boolean;
}
export type SqlType = "number" | "text" | "boolean";
export interface Catalog {
  sourceTable?: string;
  tables: { name: string; columns: { name: string; type: SqlType }[] }[];
  functions: { name: string; parameters: SqlType[]; returns: SqlType }[];
}
export interface SemanticResult {
  diagnostics: Diagnostic[];
  itemTypes: (SqlType | "unknown")[];
  complete: boolean;
}
