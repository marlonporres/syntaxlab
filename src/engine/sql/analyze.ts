import { lexSql } from "./lexer";
import { parseSql } from "./parser";
import { buildAstTree, deriveCst } from "./tree";
import type { SqlAnalysis } from "./types";

/** Lexical and syntactic analysis only. A catalog is not consulted here. */
export function analyzeSql(source: string): SqlAnalysis {
  const lexical = lexSql(source);
  const analysis: SqlAnalysis = {
    source,
    tokens: lexical.tokens,
    diagnostics: lexical.diagnostics,
    ast: null,
    cst: null,
    astTree: null,
    derivations: { left: [], right: [] },
    accepted: false,
  };
  if (lexical.diagnostics.some((diagnostic) => diagnostic.severity === "error"))
    return analysis;
  const parsed = parseSql(lexical.tokens, source);
  analysis.diagnostics = [...lexical.diagnostics, ...parsed.diagnostics];
  if (!parsed.ast || !parsed.cst) return analysis;
  analysis.ast = parsed.ast;
  analysis.cst = parsed.cst;
  analysis.astTree = buildAstTree(parsed.ast);
  analysis.derivations = {
    left: deriveCst(parsed.cst, "left"),
    right: deriveCst(parsed.cst, "right"),
  };
  analysis.accepted = true;
  return analysis;
}
