import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RefreshCw } from "lucide-react";
import { classifyChomsky, detectRecursion, eliminateLeftRecursion, readGeneralGrammar, renderSymbols, WEEK9_PRESETS } from "../../engine/exam/week9";
import type { EliminationResult } from "../../engine/exam/week9";

const hierarchy = [
  ["Tipo 0", "Sin restricciones", "α → β", "Máquina de Turing"],
  ["Tipo 1", "Sensible al contexto", "α A β → α ω β", "Autómata Linealmente Acotado"],
  ["Tipo 2", "Libre de contexto", "A → ω", "Autómata de Pila"],
  ["Tipo 3", "Regular", "A → a B | a | ε", "Autómata Finito"],
];

export default function Week9() {
  const [tab, setTab] = useState<"recursion" | "chomsky">("recursion");
  const [source, setSource] = useState<string>(WEEK9_PRESETS[0]);
  const [result, setResult] = useState<EliminationResult | null>(null);
  const [step, setStep] = useState(0);
  const reading = useMemo(() => readGeneralGrammar(source), [source]);
  const classification = reading.grammar ? classifyChomsky(reading.grammar) : null;
  const recursion = useMemo(() => {
    if (!reading.grammar) return null;
    try { return detectRecursion(reading.grammar); } catch { return null; }
  }, [reading]);
  const edit = (value: string) => { setSource(value); setResult(null); setStep(0); };
  const presetIndex = WEEK9_PRESETS.findIndex(value => value === source);
  const currentStep = result?.steps[step];

  return <section aria-label="Semana 9: gramáticas">
    <div className="exam-tabs" aria-label="Tema de Semana 9">
      <button className={tab === "recursion" ? "exam-button" : "exam-secondary"} aria-pressed={tab === "recursion"} onClick={() => setTab("recursion")}>Recursividad</button>
      <button className={tab === "chomsky" ? "exam-button" : "exam-secondary"} aria-pressed={tab === "chomsky"} onClick={() => setTab("chomsky")}>Jerarquía de Chomsky</button>
    </div>
    <div className="exam-grid">
      <section className="exam-panel">
        <h2>Reglas de producción</h2>
        <label className="exam-field">Ejercicio de clase
          <select aria-label="Ejercicio de Semana 9" value={presetIndex < 0 ? "custom" : presetIndex} onChange={event => edit(WEEK9_PRESETS[Number(event.target.value)])}>
            <option value="custom" disabled>Gramática propia</option>
            {WEEK9_PRESETS.map((value, index) => <option key={value} value={index}>Ej. {index + 1}: {value}</option>)}
          </select>
        </label>
        <label className="exam-field">Gramática editable
          <textarea aria-label="Gramática de Semana 9" value={source} onChange={event => edit(event.target.value)} spellCheck={false} rows={7} maxLength={10001} />
        </label>
        <p className="exam-hint">Separa los símbolos con espacios. ε es la cadena vacía; e es un terminal.</p>
        {reading.errors.map(error => <p className="exam-feedback" role="alert" key={error}>{error}</p>)}
        {reading.warnings.map(warning => <p className="exam-feedback" key={warning}>{warning}</p>)}
        {tab === "recursion" && <button className="exam-button" disabled={!recursion} onClick={() => {
          if (!reading.grammar) return;
          setResult(eliminateLeftRecursion(reading.grammar)); setStep(0);
        }}><RefreshCw size={16} />Eliminar recursividad izquierda</button>}
      </section>
      <section className="exam-panel">
        {tab === "chomsky" ? <>
          <h2>Clasificación calculada</h2>
          {classification ? <div className="exam-feedback" role="status">
            <strong>Tipo {classification.type} · {classification.name}</strong>
            <p>{classification.machine}</p><p>{classification.reason}</p>
            {classification.regularOrientation && <p>Linealidad: {classification.regularOrientation}.</p>}
          </div> : <p>Escribe reglas válidas para clasificarlas.</p>}
          <p className="exam-hint">Se clasifica la forma de estas reglas. Una gramática equivalente podría pertenecer a una clase más restringida.</p>
        </> : <>
          <h2>Recursividad detectada</h2>
          {recursion ? <>
            <dl className="exam-recursion-list">
              <div><dt>Izquierda Directa (Inmediata)</dt><dd>{recursion.direct.join(", ") || "No detectada"}</dd></div>
              <div><dt>Izquierda Indirecta</dt><dd>{recursion.indirect.map(item => item.path.join(" → ")).join("; ") || "No detectada"}</dd></div>
              <div><dt>Derecha</dt><dd>{recursion.right.join(", ") || "No detectada"}</dd></div>
            </dl>
            <details><summary>Fórmulas y significado</summary>
              <p><code>A → A α | β</code>: recursividad izquierda directa.</p>
              <p><code>A → B α; B → A γ</code>: recursividad izquierda indirecta.</p>
              <p><code>A → α A | β</code>: recursividad derecha. En expresiones produce agrupación asociativa a la derecha. Es compatible con análisis LL(1), pero por sí sola no garantiza que la tabla esté libre de conflictos.</p>
            </details>
          </> : <p>Para detectar recursividad usa un solo no terminal a la izquierda de cada regla.</p>}
        </>}
      </section>
    </div>

    {tab === "chomsky" && <section className="exam-panel">
      <h2>Jerarquía de Chomsky</h2>
      <div className="exam-table-scroll"><table className="exam-table"><thead><tr><th>Tipo</th><th>Gramática</th><th>Forma</th><th>Máquina</th></tr></thead>
        <tbody>{hierarchy.map(([type, name, form, machine]) => <tr key={type}><th>{type}</th><td>{name}</td><td><code>{form}</code></td><td>{machine}</td></tr>)}</tbody>
      </table></div>
      <details><summary>Convenciones de la clasificación</summary><p>En Tipo 0, α contiene al menos un no terminal. En Tipo 1, ω no es vacío; se usa el criterio no contractivo equivalente. En Tipo 3 también se admiten reglas lineales por la izquierda y bloques de terminales, sin mezclar ambas orientaciones.</p></details>
    </section>}

    {tab === "recursion" && result && <section className="exam-panel" aria-label="Eliminación paso a paso">
      <h2>Eliminación paso a paso</h2>
      <p><code>A → β A′</code> &nbsp; <code>A′ → α A′ | ε</code></p>
      {currentStep ? <>
        <div className="exam-toolbar">
          <button className="exam-secondary" disabled={step === 0} onClick={() => setStep(value => value - 1)} aria-label="Paso anterior de eliminación"><ArrowLeft size={16} />Anterior</button>
          <span>Paso {step + 1} de {result.steps.length}</span>
          <button className="exam-secondary" disabled={step === result.steps.length - 1} onClick={() => setStep(value => value + 1)} aria-label="Siguiente paso de eliminación">Siguiente<ArrowRight size={16} /></button>
        </div>
        <div className="exam-feedback" role="status"><strong>{currentStep.kind === "directa" ? "Recursividad izquierda directa" : currentStep.kind === "sustitución" ? "Sustitución de una regla" : "Eliminar ciclo"}</strong><p>{currentStep.explanation}</p></div>
        {currentStep.alpha && <p><strong>A = {currentStep.symbol}</strong> · {currentStep.alpha.map((value, index) => `α${index + 1} = ${renderSymbols(value)}`).join("; ")} · {currentStep.beta?.map((value, index) => `β${index + 1} = ${renderSymbols(value)}`).join("; ")}</p>}
        <div className="exam-grid"><div><h3>Antes</h3><pre>{currentStep.before.join("\n")}</pre></div><div><h3>Después</h3><pre>{currentStep.after.join("\n") || "Producción eliminada"}</pre></div></div>
      </> : result.complete ? <p className="exam-feedback">No hay recursividad izquierda que eliminar.</p> : null}
      {result.warnings.map(warning => <p role="status" className="exam-feedback" key={warning}>{warning}</p>)}
      {(!result.steps.length || step === result.steps.length - 1) && <>
        <h3>{result.complete ? <><Check size={17} />Gramática sin recursividad izquierda</> : "Estado de la transformación"}</h3>
        <pre aria-label="Gramática transformada">{result.source}</pre>
      </>}
    </section>}
  </section>;
}
