import { lazy, Suspense, useState } from "react";
import { GitBranch } from "lucide-react";
import { EXAMPLES } from "../content/lab";
import type { SourceRange, SqlAnalysis } from "../engine/sql/types";
import TreeExplorer from "./TreeExplorer";

const SqlEditor = lazy(() => import("./SqlEditor"));

interface Props {
  sql: string;
  exampleId: string;
  fontSize: number;
  result: SqlAnalysis | null;
  selectedRange: (SourceRange & { focusEditor?: boolean }) | null;
  onChange: (sql: string) => void;
  onExample: (id: string) => void;
  onAnalyze: () => void;
  onSelectRange: (range: SourceRange, focusEditor?: boolean) => void;
}

export default function SyntaxTreeLab({ sql, exampleId, fontSize, result, selectedRange, onChange, onExample, onAnalyze, onSelectRange }: Props) {
  const [kind, setKind] = useState<"cst" | "ast">("cst");
  const stale = result !== null && result.source !== sql;
  const tree = !stale && result?.accepted ? (kind === "cst" ? result.cst : result.astTree) : null;
  return (
    <div className="module-page syntax-tree-page">
      <h1>Árbol sintáctico</h1>
      <p>Escribe o pega tu sentencia SQL y explora su estructura.</p>
      <section className="tree-input-card" aria-label="Sentencia para el árbol">
        <div className="editor-toolbar">
          <label className="tree-example">Ejemplo
            <select aria-label="Ejemplo para el árbol" value={EXAMPLES.find(e => e.id === exampleId)?.sql === sql ? exampleId : "custom"} onChange={e => onExample(e.target.value)}>
              <option value="custom" disabled>Mi sentencia</option>
              {EXAMPLES.map(example => <option key={example.id} value={example.id}>{example.title}</option>)}
            </select>
          </label>
          <span className="tree-edit-label">Puedes editar todo el texto</span>
        </div>
        <div className="tree-source-editor">
          <Suspense fallback={<p role="status">Preparando editor…</p>}>
            <SqlEditor value={sql} onChange={onChange} fontSize={fontSize} onCursorChange={() => {}}
              onReview={onAnalyze} selectedRange={stale ? null : selectedRange}
              diagnostics={stale ? [] : result?.diagnostics ?? []} />
          </Suspense>
        </div>
        <div className="run-bar">
          <span><kbd>Ctrl / ⌘ + Enter</kbd></span>
          <button className="primary-button" onClick={onAnalyze}><GitBranch size={16} />Generar árbol</button>
        </div>
      </section>
      <details className="tree-dialect-help">
        <summary>Qué sentencias puedo escribir</summary>
        <p>Una sentencia SELECT o INSERT INTO … SELECT, con expresiones, alias, funciones y CASE. Por ejemplo: <code>SELECT precio * cantidad AS total</code>.</p>
        <p>Texto entre comillas simples e igualdad con =. Este dialecto de estudio todavía no incluye FROM, WHERE, JOIN ni varias sentencias juntas.</p>
      </details>
      {stale ? <p className="module-feedback" role="status">La sentencia cambió. Pulsa Generar árbol para actualizarlo.</p> : result && !result.accepted ? (
        <section className="module-card tree-errors" aria-label="Errores de la sentencia">
          <h2>Corrige la sentencia para generar el árbol</h2>
          {result.diagnostics.map(diagnostic => <button className="diagnostic error" key={`${diagnostic.code}-${diagnostic.start}`} onClick={() => onSelectRange(diagnostic, true)}>
            <span>Línea {diagnostic.line}, columna {diagnostic.column}</span>
            <strong>{diagnostic.message}</strong>
            {diagnostic.hint && <small>{diagnostic.hint}</small>}
          </button>)}
        </section>
      ) : null}
      {tree && result ? <section className="tree-result" aria-label="Árbol de la sentencia">
        <div className="tree-result-heading">
          <div className="tree-view-switch" aria-label="Tipo de árbol">
            <button aria-pressed={kind === "cst"} onClick={() => setKind("cst")}>CST · Árbol sintáctico</button>
            <button aria-pressed={kind === "ast"} onClick={() => setKind("ast")}>AST · Árbol abstracto</button>
          </div>
          <span role="status">Sintaxis aceptada</span>
        </div>
        <p className="result-help">{kind === "cst" ? "Reglas y símbolos de la sentencia." : "Operaciones y relaciones esenciales."} Selecciona un nodo para ver su detalle.</p>
        <TreeExplorer key={`${result.source}-${kind}`} root={tree} onSelectRange={onSelectRange} derivations={result.derivations} />
      </section> : !result ? <div className="tree-placeholder"><GitBranch size={26} /><p>Tu árbol aparecerá aquí al analizar la sentencia.</p></div> : null}
    </div>
  );
}
