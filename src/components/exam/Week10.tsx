import { useMemo, useState } from "react";
import { ArrowRight, GitBranch } from "lucide-react";
import ExamGraph from "./ExamGraph";
import { expressionTrees, factorLeft, graphFromTree, LL1_PRESET, PYTHON_BNF, PYTHON_PRESET, pythonDerivation, ruleText, runLL1, SHIFT_PRESET, shiftReduce } from "../../engine/exam/week10";

function attempt<T>(work: () => T): { value: T | null; error: string } {
  try { return { value: work(), error: "" }; }
  catch (error) { return { value: null, error: error instanceof Error ? error.message : "Revisa la entrada." }; }
}
function StepControls({ step, count, onChange }: { step: number; count: number; onChange: (step: number) => void }) {
  return <div className="exam-toolbar" aria-label="Recorrido paso a paso">
    <button className="exam-secondary" disabled={step === 0} onClick={() => onChange(0)}>Inicio</button>
    <button className="exam-secondary" disabled={step === 0} onClick={() => onChange(step - 1)}>Anterior</button>
    <span>Paso {step + 1} de {count}</span>
    <button className="exam-button" disabled={step >= count - 1} onClick={() => onChange(step + 1)}>Siguiente paso <ArrowRight size={15} /></button>
    <button className="exam-secondary" disabled={step >= count - 1} onClick={() => onChange(count - 1)}>Ver todos los pasos</button>
  </div>;
}

export default function Week10() {
  const [tab, setTab] = useState("trees");
  const [expression, setExpression] = useState("12 + 3 * 5");
  const [treeKind, setTreeKind] = useState<"cst" | "ast">("cst");
  const [llSource, setLlSource] = useState(LL1_PRESET), [llInput, setLlInput] = useState("acbb"), [llStep, setLlStep] = useState(0);
  const [shiftSource, setShiftSource] = useState(SHIFT_PRESET), [shiftInput, setShiftInput] = useState("abcdef"), [shiftStart, setShiftStart] = useState("S"), [shiftStep, setShiftStep] = useState(0);
  const [factorSource, setFactorSource] = useState("A -> a b | a c | d");
  const [pythonSource, setPythonSource] = useState(PYTHON_PRESET), [pythonStep, setPythonStep] = useState(0);
  const expressionResult = useMemo(() => attempt(() => expressionTrees(expression)), [expression]);
  const ll = useMemo(() => attempt(() => runLL1(llSource, llInput)), [llSource, llInput]);
  const shift = useMemo(() => attempt(() => shiftReduce(shiftSource, shiftInput, shiftStart)), [shiftSource, shiftInput, shiftStart]);
  const factor = useMemo(() => attempt(() => factorLeft(factorSource)), [factorSource]);
  const python = useMemo(() => attempt(() => pythonDerivation(pythonSource)), [pythonSource]);
  const treeGraph = useMemo(() => expressionResult.value ? graphFromTree(expressionResult.value[treeKind]) : null, [expressionResult.value, treeKind]);
  const pythonGraph = useMemo(() => python.value ? graphFromTree(python.value.tree) : null, [python.value]);
  return <section className="week10">
    <div className="exam-tabs" aria-label="Herramientas de Semana 10">
      {[["trees", "Árboles"], ["ll1", "LL(1)"], ["shift", "Ascendente"], ["factor", "Factorización"], ["python", "BNF Python"]].map(([id, label]) => <button key={id} aria-pressed={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <details className="exam-context-help"><summary>Fases del analizador sintáctico</summary><p>Recepción de Tokens → Verificación → Construcción del Árbol Sintáctico → Generación de Errores</p><p>Si la entrada no cumple la gramática, se informa el error; no se inventa un árbol completo.</p></details>

    {tab === "trees" && <>
      <section className="exam-panel">
        <h2>Árbol de Descripción y AST</h2>
        <label className="exam-field">Expresión a analizar<input aria-label="Expresión para el árbol" value={expression} onChange={e => setExpression(e.target.value)} spellCheck={false} /></label>
        <div className="exam-toolbar"><button className="exam-secondary" onClick={() => setExpression("12 + 3 * 5")}>Cargar expresión de clase</button><span>Escribe números, identificadores, +, −, *, / y paréntesis.</span></div>
        <div className="exam-tabs" aria-label="Vista del árbol"><button aria-pressed={treeKind === "cst"} className={treeKind === "cst" ? "active" : ""} onClick={() => setTreeKind("cst")}>Árbol Sintáctico de Descripción (Concreto)</button><button aria-pressed={treeKind === "ast"} className={treeKind === "ast" ? "active" : ""} onClick={() => setTreeKind("ast")}>Árbol Sintáctico Abstracto (AST)</button></div>
        <p>{treeKind === "cst" ? "Conserva las producciones E, T y F, los tokens y los paréntesis." : "Conserva operadores como padres y operandos como hojas; elimina los paréntesis y no terminales redundantes."}</p>
        <details><summary>Gramática de expresiones</summary><pre>{"E → E + T | E - T | T\nT → T * F | T / F | F\nF → ( E ) | número | identificador"}</pre></details>
      </section>
      {expressionResult.error && <p className="exam-feedback error" role="alert">{expressionResult.error}</p>}
      {treeGraph && <ExamGraph key={`${expression}-${treeKind}`} nodes={treeGraph.nodes} edges={treeGraph.edges} />}
    </>}

    {tab === "ll1" && <>
      <section className="exam-panel"><h2>Analizador Predictivo No Recursivo LL(1)</h2>
        <div className="exam-grid"><label className="exam-field">Producciones<textarea aria-label="Gramática LL(1)" value={llSource} onChange={e => { setLlSource(e.target.value); setLlStep(0); }} rows={5} spellCheck={false} /></label><div><label className="exam-field">Entrada<input aria-label="Entrada LL(1)" value={llInput} onChange={e => { setLlInput(e.target.value); setLlStep(0); }} spellCheck={false} /></label><p>Separa tokens de varias letras con espacios. ε representa entrada vacía.</p><button className="exam-secondary" onClick={() => { setLlSource(LL1_PRESET); setLlInput("acbb"); setLlStep(0); }}>Cargar ejemplo LL(1) de clase</button></div></div>
      </section>
      {ll.error && <p className="exam-feedback error" role="alert">{ll.error}</p>}
      {ll.value && <>
        <section className="exam-panel"><h3>PRIMERO (FIRST) y SIGUIENTE (FOLLOW)</h3><div className="exam-table-scroll"><table className="exam-table"><thead><tr><th>No terminal</th><th>PRIMERO</th><th>SIGUIENTE</th></tr></thead><tbody>{ll.value.analysis.nonterminals.map(nt => <tr key={nt}><th>{nt}</th><td>{`{ ${ll.value!.analysis.first[nt].join(", ")} }`}</td><td>{`{ ${ll.value!.analysis.follow[nt].join(", ")} }`}</td></tr>)}</tbody></table></div>
          <h3>Tabla de Análisis Predictivo</h3><p role="status">{ll.value.analysis.isLL1 ? "Cumple LL(1): cada celda contiene a lo sumo una producción." : "No cumple LL(1). Revisa los conflictos, la recursividad izquierda o los símbolos improductivos."}</p>
          <div className="exam-table-scroll"><table className="exam-table"><thead><tr><th>No terminal</th>{[...ll.value.analysis.terminals, "$"].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{ll.value.analysis.nonterminals.map(nt => <tr key={nt}><th>{nt}</th>{[...ll.value!.analysis.terminals, "$"].map(t => { const entries = ll.value!.analysis.table[nt][t] ?? []; return <td key={t} className={entries.length > 1 ? "conflict" : ""}>{entries.map(i => ruleText(ll.value!.analysis.grammar.productions[i])).join(" / ") || "ERROR"}</td>; })}</tr>)}</tbody></table></div>
        </section>
        <section className="exam-panel"><h3>Pila y Entrada</h3><p>La cima de la pila se muestra a la izquierda. $ marca el fin de entrada.</p><StepControls step={Math.min(llStep, ll.value.result.trace.length - 1)} count={ll.value.result.trace.length} onChange={setLlStep} /><div className="exam-table-scroll"><table className="exam-table"><thead><tr><th>Paso</th><th>Pila</th><th>Entrada</th><th>Acción</th></tr></thead><tbody>{ll.value.result.trace.slice(0, llStep + 1).map(row => <tr key={row.step}><td>{row.step + 1}</td><td>{row.stack.join(" ")}</td><td>{row.remaining.join(" ")}</td><td>{row.action}</td></tr>)}</tbody></table></div>{llStep >= ll.value.result.trace.length - 1 && <p className="exam-feedback" role="status">{ll.value.result.accepted ? "Cadena aceptada" : `Error: ${ll.value.result.error}`}</p>}</section>
      </>}
    </>}

    {tab === "shift" && <>
      <section className="exam-panel"><h2>Análisis Ascendente · Shift-Reduce</h2><p>SLR: estados LR(0) y reducciones por SIGUIENTE. Las reducciones reconstruyen una derivación por la derecha en inverso, como en el enfoque LR de YACC.</p>
        <div className="exam-grid"><label className="exam-field">Producciones<textarea aria-label="Gramática ascendente" rows={7} value={shiftSource} onChange={e => { setShiftSource(e.target.value); setShiftStep(0); }} spellCheck={false} /></label><div><label className="exam-field">Símbolo inicial<input aria-label="Símbolo inicial ascendente" value={shiftStart} onChange={e => { setShiftStart(e.target.value); setShiftStep(0); }} /></label><label className="exam-field">Entrada<input aria-label="Entrada ascendente" value={shiftInput} onChange={e => { setShiftInput(e.target.value); setShiftStep(0); }} spellCheck={false} /></label><button className="exam-secondary" onClick={() => { setShiftSource(SHIFT_PRESET); setShiftInput("abcdef"); setShiftStart("S"); setShiftStep(0); }}>Cargar ejemplo ascendente de clase</button></div></div>
        {shiftSource === SHIFT_PRESET && <details><summary>Revisar la cadena del ejemplo</summary><p>Con las reglas suministradas, S ⇒ V W Z ⇒ ab cd abef. La entrada original abcdef se conserva y será rechazada.</p><button className="exam-secondary" onClick={() => { setShiftInput("abcdabef"); setShiftStep(0); }}>Probar abcdabef</button></details>}
      </section>
      {shift.error && <p className="exam-feedback error" role="alert">{shift.error}</p>}
      {shift.value && <section className="exam-panel"><h3>Desplazar y reducir</h3><p>La cima está a la derecha; los números de la pila son estados LR.</p><StepControls step={Math.min(shiftStep, shift.value.trace.length - 1)} count={shift.value.trace.length} onChange={setShiftStep} /><div className="exam-table-scroll"><table className="exam-table"><thead><tr><th>Paso</th><th>Pila</th><th>Entrada</th><th>Acción</th></tr></thead><tbody>{shift.value.trace.slice(0, shiftStep + 1).map(row => <tr key={row.step}><td>{row.step + 1}</td><td>{row.stack.join(" ")}</td><td>{row.remaining.join(" ")}</td><td>{row.action}</td></tr>)}</tbody></table></div>{shiftStep >= shift.value.trace.length - 1 && <p className="exam-feedback" role="status">{shift.value.accepted ? "Cadena aceptada" : `Cadena rechazada. ${shift.value.error}`}</p>}{shift.value.conflicts.map(c => <p className="exam-feedback error" key={c}>{c}</p>)}<details><summary>Estados LR(0) calculados ({shift.value.states.length})</summary>{shift.value.states.map((items, i) => <pre key={i}>{`I${i}\n${items.join("\n")}`}</pre>)}</details></section>}
    </>}

    {tab === "factor" && <section className="exam-panel"><h2>Factorización a la Izquierda</h2><p>Retrasa la elección hasta leer el prefijo común. Evita retroceder para decidir entre esas alternativas; por sí sola no garantiza LL(1).</p><pre>{"A → α B₁ | α B₂\nA → α A′\nA′ → B₁ | B₂"}</pre><label className="exam-field">Producciones a factorizar<textarea aria-label="Gramática para factorizar" value={factorSource} onChange={e => setFactorSource(e.target.value)} rows={5} spellCheck={false} /></label>{factor.error && <p className="exam-feedback error" role="alert">{factor.error}</p>}{factor.value && <><ol className="exam-steps">{factor.value.steps.map((step, i) => <li key={i}><strong>{step.left}: α = {step.alpha.join(" ")}</strong><pre>{step.before.join("\n")}</pre><p>Extraer α y crear {step.helper}:</p><pre>{step.after.join("\n")}</pre></li>)}</ol>{!factor.value.steps.length && <p>No hay prefijos comunes que factorizar.</p>}<h3>Gramática resultante</h3><pre>{factor.value.text}</pre></>}</section>}

    {tab === "python" && <>
      <section className="exam-panel"><h2>Derivación BNF Python · TensorFlow</h2><p>Subconjunto didáctico para practicar importación, asignación y print. No ejecuta Python ni TensorFlow.</p><label className="exam-field">Programa de tres líneas<textarea aria-label="Programa BNF Python" rows={4} value={pythonSource} onChange={e => { setPythonSource(e.target.value); setPythonStep(0); }} spellCheck={false} /></label><button className="exam-secondary" onClick={() => { setPythonSource(PYTHON_PRESET); setPythonStep(0); }}>Cargar ejemplo TensorFlow</button><details><summary>BNF de este ejercicio</summary><pre>{PYTHON_BNF}</pre><p>Esta gramática de apoyo hace explícito el subconjunto del ejercicio; no es una transcripción de reglas no proporcionadas.</p></details></section>
      {python.error && <p className="exam-feedback error" role="alert">{python.error}</p>}
      {python.value && pythonGraph && <><section className="exam-panel"><h3><GitBranch size={18} /> Derivación por la izquierda</h3><StepControls step={pythonStep} count={python.value.steps.length} onChange={setPythonStep} /><ol className="exam-steps">{python.value.steps.slice(0, pythonStep + 1).map((s, i) => <li key={i}><strong>{s.rule}</strong><pre>{s.form}</pre></li>)}</ol></section><ExamGraph key={pythonSource} nodes={pythonGraph.nodes} edges={pythonGraph.edges} /></>}
    </>}
  </section>;
}
