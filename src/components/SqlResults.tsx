import { useState } from "react";
import {
  Check,
  CircleAlert,
  FileCode2,
} from "lucide-react";
import type {
  SqlAnalysis,
  SourceRange,
  TreeNode,
  SemanticResult,
} from "../engine/sql/types";
import TreeExplorer from "./TreeExplorer";

interface Props {
  result: SqlAnalysis | null;
  stale: boolean;
  semantic?: SemanticResult;
  onSelectRange: (range: SourceRange, focusEditor?: boolean) => void;
  onAnalyze: () => void;
}
const labels = {
  keyword: "Palabra reservada",
  identifier: "Identificador",
  function: "Función",
  operator: "Operador",
  number: "Número",
  string: "Texto",
  delimiter: "Delimitador",
  comment: "Comentario",
  whitespace: "Espacio",
  invalid: "No reconocido",
};
const phaseNames = {
  lexical: "Léxico",
  syntax: "Sintáctico",
  semantic: "Semántico",
};
function productions(root: TreeNode): TreeNode[] {
  return [root, ...root.children.flatMap(productions)].filter(
    (node) => node.kind === "nonterminal",
  );
}

export default function SqlResults({
  result,
  stale,
  semantic,
  onSelectRange,
  onAnalyze,
}: Props) {
  const [tab, setTab] = useState("tokens");
  const [trivia, setTrivia] = useState(false);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<"left" | "right">("left");
  const tokens =
    result?.tokens.filter(
      (token) =>
        (trivia || !["whitespace", "comment"].includes(token.category)) &&
        (!filter || token.lexeme.toLowerCase().includes(filter.toLowerCase())),
    ) ?? [];
  const diagnostics = [
    ...(result?.diagnostics ?? []),
    ...(semantic?.diagnostics ?? []),
  ];
  const visiblePage = Math.min(
    page,
    Math.max(0, Math.ceil(tokens.length / 50) - 1),
  );
  return (
    <aside
      className="inspector analysis-inspector"
      aria-label="Resultados del análisis SQL"
    >
      <div className="inspector-heading">
        <span>
          <span className="small-blue-dot" />
          RESULTADOS
        </span>
      </div>
      {!result ? (
        <div className="inspector-content">
          <h2>Tokens, errores y árboles</h2>
          <p className="guide-intro">Pulsa Analizar para ver los resultados aquí.</p>
          <p className="quiet-note">El caso de pizarra contiene errores para practicar. No se ejecutan consultas.</p>
        </div>
      ) : (
        <>
          <div
            className={`analysis-summary ${result.accepted ? "accepted" : "rejected"}`}
            role="status"
          >
            {result.accepted ? <Check size={18} /> : <CircleAlert size={18} />}
            <span>
              <strong>
                {stale
                  ? "Resultado desactualizado"
                  : result.accepted
                    ? "Sintaxis aceptada"
                    : "Entrada rechazada"}
              </strong>
              <small>
                {stale
                  ? "La entrada cambió. Vuelve a analizar."
                  : `${result.tokens.filter((t) => !["comment", "whitespace"].includes(t.category)).length} tokens · ${diagnostics.filter((d) => d.severity === "error").length} errores`}
              </small>
            </span>
          </div>
          {stale ? (
            <div className="inspector-content">
              <button className="primary-button" onClick={onAnalyze}>
                Volver a analizar
              </button>
            </div>
          ) : (
            <>
              <div className="result-tabs" aria-label="Vistas de análisis">
                {[
                  ["tokens", "Tokens"],
                  ["diagnostics", "Diagnósticos"],
                  ["cst", "CST"],
                  ["ast", "AST"],
                  ["rules", "Producciones"],
                  ["derivations", "Derivaciones"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={tab === id}
                    className={tab === id ? "active" : ""}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="analysis-content">
                {tab === "tokens" && (
                  <>
                    <div className="token-controls">
                      <input
                        aria-label="Buscar lexema"
                        placeholder="Buscar lexema…"
                        value={filter}
                        onChange={(e) => {
                          setFilter(e.target.value);
                          setPage(0);
                        }}
                      />
                      <label>
                        <input
                          type="checkbox"
                          checked={trivia}
                          onChange={(e) => {
                            setTrivia(e.target.checked);
                            setPage(0);
                          }}
                        />{" "}
                        Incluir espacios y comentarios
                      </label>
                    </div>
                    <p className="result-help">
                      Selecciona un token para localizarlo en el editor.
                    </p>
                    <div className="table-scroll">
                      <table className="token-table">
                        <thead>
                          <tr>
                            <th>Lexema</th>
                            <th>Tipo</th>
                            <th>L:C</th>
                            <th>Rango</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tokens
                            .slice(visiblePage * 50, (visiblePage + 1) * 50)
                            .map((token) => (
                              <tr key={token.id}>
                                <td>
                                  <button
                                    onClick={() => onSelectRange(token)}
                                    title={`Seleccionar ${JSON.stringify(token.lexeme)}`}
                                  >
                                    <code>
                                      {token.category === "whitespace"
                                        ? JSON.stringify(token.lexeme)
                                        : token.lexeme}
                                    </code>
                                  </button>
                                </td>
                                <td>
                                  <span
                                    className={`token-category ${token.category}`}
                                  >
                                    {labels[token.category]}
                                  </span>
                                </td>
                                <td>
                                  {token.line}:{token.column}
                                </td>
                                <td>
                                  {token.start}–{token.end}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="pagination">
                      <button
                        disabled={visiblePage === 0}
                        onClick={() => setPage(visiblePage - 1)}
                      >
                        Anterior
                      </button>
                      <span>
                        {tokens.length} tokens · página {visiblePage + 1}/
                        {Math.max(1, Math.ceil(tokens.length / 50))}
                      </span>
                      <button
                        disabled={(visiblePage + 1) * 50 >= tokens.length}
                        onClick={() => setPage(visiblePage + 1)}
                      >
                        Siguiente
                      </button>
                    </div>
                  </>
                )}
                {tab === "diagnostics" && (
                  <>
                    <h3>Diagnósticos por etapa</h3>
                    {diagnostics.length === 0 ? (
                      <p className="positive-message">
                        Sin errores léxicos ni sintácticos.{" "}
                        {semantic?.complete
                          ? "La comprobación semántica también terminó sin diagnósticos con el catálogo configurado."
                          : "La semántica requiere un catálogo explícito para comprobar nombres y firmas."}
                      </p>
                    ) : (
                      diagnostics.map((diagnostic, index) => (
                        <button
                          className={`diagnostic ${diagnostic.severity}`}
                          key={`${diagnostic.code}-${index}`}
                          onClick={() => onSelectRange(diagnostic)}
                        >
                          <span>
                            {phaseNames[diagnostic.phase]} ·{" "}
                            {diagnostic.severity} · {diagnostic.line}:
                            {diagnostic.column}
                          </span>
                          <strong>{diagnostic.message}</strong>
                          {diagnostic.expected && (
                            <small>Se esperaba: {diagnostic.expected}</small>
                          )}
                          {diagnostic.hint && (
                            <small>Para razonar: {diagnostic.hint}</small>
                          )}
                        </button>
                      ))
                    )}
                    {semantic && (
                      <p className="result-help">
                        Comprobación semántica:{" "}
                        {semantic.complete
                          ? "con catálogo suficiente"
                          : "parcial: falta información o existen errores"}
                        . Tipos de salida:{" "}
                        {semantic.itemTypes.join(", ") || "ninguno"}.
                      </p>
                    )}
                  </>
                )}
                {(tab === "cst" || tab === "ast") &&
                  (result.accepted &&
                  (tab === "cst" ? result.cst : result.astTree) ? (
                    <>
                      <p className="result-help">
                        {tab === "cst"
                          ? "CST: reglas y terminales concretos."
                          : "AST: operaciones y relaciones esenciales."}{" "}
                        Selecciona un nodo para inspeccionar y vincular con el
                        editor.
                      </p>
                      <TreeExplorer
                        key={`${result.source}-${tab}`}
                        root={(tab === "cst" ? result.cst : result.astTree)!}
                        onSelectRange={onSelectRange}
                        derivations={result.derivations}
                      />
                    </>
                  ) : (
                    <div className="result-empty">
                      <FileCode2 size={30} />
                      <h3>No hay árbol completo</h3>
                      <p>
                        Corrige los diagnósticos y vuelve a analizar. Solo se
                        construyen estructuras completas para entradas
                        aceptadas.
                      </p>
                      <button
                        className="secondary-button"
                        onClick={() => setTab("diagnostics")}
                      >
                        Ver diagnósticos
                      </button>
                    </div>
                  ))}
                {tab === "rules" &&
                  (result.cst ? (
                    <>
                      <h3>Producciones aplicadas</h3>
                      <p className="result-help">
                        Recorrido del CST real; cada expansión muestra los
                        símbolos consumidos.
                      </p>
                      <ol className="rules-list">
                        {productions(result.cst).map((node) => (
                          <li key={node.id}>
                            <button onClick={() => onSelectRange(node)}>
                              <code>{node.rule}</code>
                              <small>
                                L{node.line}:C{node.column}
                              </small>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <p>
                      Las producciones completas requieren una sentencia
                      aceptada.
                    </p>
                  ))}
                {tab === "derivations" && (
                  <>
                    <h3>Formas sentenciales del CST</h3>
                    <div className="mode-switch">
                      <button
                        aria-pressed={direction === "left"}
                        className={direction === "left" ? "selected" : ""}
                        onClick={() => setDirection("left")}
                      >
                        Por la izquierda
                      </button>
                      <button
                        aria-pressed={direction === "right"}
                        className={direction === "right" ? "selected" : ""}
                        onClick={() => setDirection("right")}
                      >
                        Por la derecha
                      </button>
                    </div>
                    <p className="result-help">
                      En cada paso se expande el no terminal más{" "}
                      {direction === "left" ? "izquierdo" : "derecho"}. Los
                      terminales finales conservan sus lexemas; se omite la
                      trivia.
                    </p>
                    {result.accepted ? (
                      <ol className="sentential-list">
                        {result.derivations[direction].map((step, index) => (
                          <li key={`${step.nodeId}-${index}`}>
                            <small>{step.rule}</small>
                            <code>{step.after.join(" ")}</code>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p>
                        No hay derivación completa para una entrada rechazada.
                      </p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
}
