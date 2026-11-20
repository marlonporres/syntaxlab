import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import ExamGraph from "./ExamGraph";
import {
  buildInheritedDDS, buildSynthesizedDDS, decorationAtStep,
  INHERITED_PRESET, INHERITED_RULES, SYNTHESIZED_PRESET, SYNTHESIZED_RULES,
} from "../../engine/exam/week11";
import type { DDSResult } from "../../engine/exam/week11";

export default function Week11() {
  const [mode, setMode] = useState<"synthesized" | "inherited">("synthesized");
  const [expression, setExpression] = useState(SYNTHESIZED_PRESET);
  const [declaration, setDeclaration] = useState(INHERITED_PRESET);
  const [result, setResult] = useState<DDSResult | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const source = mode === "synthesized" ? expression : declaration;
  const rules = mode === "synthesized" ? SYNTHESIZED_RULES : INHERITED_RULES;
  const state = result ? decorationAtStep(result, step) : null;
  const current = result?.steps[step - 1];
  const numbers = new Map(result?.steps.map(item => [item.id, item.number]));

  function invalidate() {
    setResult(null);
    setError("");
    setStep(0);
  }
  function construct() {
    try {
      setResult(mode === "synthesized" ? buildSynthesizedDDS(source) : buildInheritedDDS(source));
      setStep(0);
      setError("");
    } catch (failure) {
      setResult(null);
      setError(failure instanceof Error ? failure.message : "No se pudo analizar la entrada.");
    }
  }
  return (
    <section aria-label="Gramáticas Dirigidas por Sintaxis y DDS">
      <div className="exam-tabs" aria-label="Tipo de DDS">
        <button aria-pressed={mode === "synthesized"} onClick={() => { setMode("synthesized"); invalidate(); }}>Atributos sintetizados</button>
        <button aria-pressed={mode === "inherited"} onClick={() => { setMode("inherited"); invalidate(); }}>Atributos heredados</button>
      </div>
      <div className="exam-panel">
        <h2>{mode === "synthesized" ? "Evaluación de expresiones" : "Declaración de tipos"}</h2>
        <p>{mode === "synthesized" ? "Los hijos calculan el valor que recibe su padre." : "T sintetiza el tipo; L lo hereda y lo transmite a la lista."}</p>
        <label className="exam-field">Entrada para el árbol decorado
          <input aria-label="Entrada DDS" value={source} maxLength={1000} spellCheck={false} onChange={event => {
            if (mode === "synthesized") setExpression(event.target.value);
            else setDeclaration(event.target.value);
            invalidate();
          }} />
        </label>
        <div className="exam-toolbar">
          <button className="exam-button" onClick={construct}>Construir árbol decorado</button>
          <button className="exam-secondary" onClick={() => {
            if (mode === "synthesized") setExpression(SYNTHESIZED_PRESET);
            else setDeclaration(INHERITED_PRESET);
            invalidate();
          }}>Cargar ejemplo de clase</button>
        </div>
        <details>
          <summary>Producciones y acciones semánticas</summary>
          <div className="exam-table-scroll"><table className="exam-table">
            <thead><tr><th>Producción</th><th>Acción semántica</th></tr></thead>
            <tbody>{rules.map(([production, action]) => <tr key={production}><td><code>{production}</code></td><td><code>{action}</code></td></tr>)}</tbody>
          </table></div>
          <p>{mode === "synthesized" ? "Usa enteros no negativos, +, *, paréntesis y el terminador n. El token digito contiene el valor léxico del número." : "Usa int o real y hasta 20 identificadores diferentes separados por comas."}</p>
        </details>
        {error && <p className="exam-feedback" role="alert">{error}</p>}
      </div>
      {result && state && <>
        <div className="exam-panel">
          <div className="exam-toolbar" aria-label="Evaluación de atributos">
            <button className="exam-secondary" disabled={step === 0} onClick={() => setStep(0)}><RotateCcw size={15} /> Reiniciar</button>
            <button className="exam-secondary" disabled={step === 0} onClick={() => setStep(value => value - 1)}><ArrowLeft size={15} /> Anterior</button>
            <strong>Paso {step} de {result.steps.length}</strong>
            <button className="exam-button" disabled={step === result.steps.length} onClick={() => setStep(value => value + 1)}>Siguiente <ArrowRight size={15} /></button>
            <button className="exam-secondary" disabled={step === result.steps.length} onClick={() => setStep(result.steps.length)}>Evaluar todo</button>
          </div>
          <p className="exam-feedback" role="status">{current ? <><strong>{current.number}. {current.rule}</strong><br />{current.production} · valor: {current.value}</> : "Árbol listo. Pulsa Siguiente para evaluar el primer atributo."}</p>
          <ExamGraph
            nodes={state.nodes.map(node => ({ ...node, attributes: node.attributes?.map(attribute => ({ ...attribute, label: `${numbers.has(attribute.id) ? `${numbers.get(attribute.id)} · ` : ""}${attribute.label}` })) }))}
            edges={result.edges}
            dependencyEdges={result.dependencyEdges}
            activeAttributeId={state.activeAttributeId}
            completedAttributeIds={state.completedAttributeIds}
          />
          <p>Los atributos léxicos de los terminales son sintetizados; no reciben atributos heredados.</p>
        </div>
        {mode === "synthesized" ? <section className="exam-panel" aria-label="Salida de la DDS"><h2>Salida</h2><p role="status">{state.output === undefined ? "Pendiente de print(E.val)." : `print(E.val) → ${state.output}`}</p></section> : <section className="exam-panel" aria-label="Tabla de símbolos">
          <h2>Tabla de símbolos</h2>
          <div className="exam-table-scroll"><table className="exam-table"><thead><tr><th>id.entrada</th><th>Tipo</th></tr></thead><tbody>{state.symbols.map(symbol => <tr key={symbol.name}><td>{symbol.name}</td><td>{symbol.type}</td></tr>)}</tbody></table></div>
          {!state.symbols.length && <p>Aún no se ha ejecutado añadetipo.</p>}
        </section>}
        <details className="exam-panel">
          <summary>Orden topológico y dependencias</summary>
          <p>La numeración indica el orden de evaluación calculado. Un atributo se evalúa cuando sus dependencias ya tienen valor.</p>
          <div className="exam-table-scroll"><table className="exam-table">
            <thead><tr><th>N.º</th><th>Regla semántica</th><th>Depende de pasos</th><th>Valor</th></tr></thead>
            <tbody>{result.steps.map(item => <tr key={item.id} aria-current={current?.id === item.id ? "step" : undefined}>
              <td>{item.number}</td><td><code>{item.rule}</code></td><td>{item.dependsOn.length ? item.dependsOn.map(id => numbers.get(id) ?? "Léxico").join(", ") : "Léxico"}</td><td>{item.number <= step ? item.value : "Pendiente"}</td>
            </tr>)}</tbody>
          </table></div>
        </details>
      </>}
    </section>
  );
}
