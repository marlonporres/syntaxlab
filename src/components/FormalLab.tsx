import { useMemo, useState } from "react";
import {
  analyzeGrammar,
  compileRegex,
  minimizeDFA,
  predictiveParse,
  simulateDFA,
  simulateNFA,
  subsetConstruction,
} from "../engine/formal";
import type {
  DFA,
  NFA,
  LL1Analysis,
  PredictiveResult,
  SimulationTrace,
} from "../engine/formal";
import { parseGrammar } from "../engine/grammar";

function AutomatonDiagram({
  machine,
  active,
}: {
  machine: NFA | DFA;
  active: string[];
}) {
  const points = new Map(
    machine.states.map((state, index) => [
      state,
      { x: 80 + (index % 5) * 145, y: 75 + Math.floor(index / 5) * 135 },
    ]),
  );
  const marker = `arrow-${machine.start}-${machine.states.length}`;
  if (machine.states.length > 40)
    return (
      <p className="module-feedback">
        El autómata tiene {machine.states.length} estados. Para conservar
        legibilidad se muestra su tabla completa de transiciones debajo;
        simplifica la expresión para ver el diagrama (máximo 40 estados).
      </p>
    );
  return (
    <div className="automaton-viewport">
      <svg
        role="img"
        aria-label="Diagrama del autómata generado"
        width={Math.min(5, machine.states.length) * 145 + 25}
        height={Math.ceil(machine.states.length / 5) * 135 + 30}
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6e94c8" />
          </marker>
        </defs>
        {machine.transitions.map((edge, index) => {
          const a = points.get(edge.from)!,
            b = points.get(edge.to)!;
          const same = edge.from === edge.to;
          const d = same
            ? `M ${a.x - 18} ${a.y - 22} C ${a.x - 70} ${a.y - 88},${a.x + 70} ${a.y - 88},${a.x + 18} ${a.y - 22}`
            : `M ${a.x + 28} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 25 - (index % 3) * 13},${b.x - 28} ${b.y}`;
          return (
            <g key={index}>
              <path
                d={d}
                fill="none"
                stroke="#4e709f"
                strokeWidth="1.4"
                markerEnd={`url(#${marker})`}
              />
              <text
                x={same ? a.x : (a.x + b.x) / 2}
                y={same ? a.y - 61 : (a.y + b.y) / 2 - 19 - (index % 3) * 7}
                fill="#8fadd6"
                fontSize="11"
                textAnchor="middle"
              >
                {edge.symbol ?? "ε"}
              </text>
            </g>
          );
        })}
        {machine.states.map((state) => {
          const p = points.get(state)!;
          return (
            <g key={state}>
              {state === machine.start && (
                <path
                  d={`M ${p.x - 62} ${p.y} H ${p.x - 29}`}
                  stroke="#97b9e9"
                  markerEnd={`url(#${marker})`}
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r="28"
                fill={active.includes(state) ? "#285d70" : "#172b46"}
                stroke={active.includes(state) ? "#8ee1c2" : "#6389bc"}
                strokeWidth="2"
              />
              {machine.accepting.includes(state) && (
                <circle cx={p.x} cy={p.y} r="23" fill="none" stroke="#98c4f3" />
              )}
              <text
                x={p.x}
                y={p.y + 4}
                fill="#d1e5ff"
                fontSize="12"
                textAnchor="middle"
              >
                {state}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
function Trace({
  trace,
  step,
  onStep,
}: {
  trace: SimulationTrace;
  step: number;
  onStep: (step: number) => void;
}) {
  return (
    <>
      <div className="module-feedback" role="status">
        <strong>
          {trace.accepted ? "Cadena aceptada" : "Cadena rechazada"}
        </strong>
        <p>
          {trace.error ??
            `Se consumieron ${trace.consumed} símbolos. Estados finales del recorrido: { ${trace.finalStates.join(", ")} }.`}
        </p>
      </div>
      <label className="form-field">
        Recorrido: paso {step} de {trace.steps.length - 1}
        <input
          aria-label="Paso de simulación"
          type="range"
          min="0"
          max={trace.steps.length - 1}
          value={step}
          onChange={(e) => onStep(Number(e.target.value))}
        />
      </label>
      <pre className="algorithm-trace">
        {trace.steps
          .map(
            (s, index) =>
              `${index === step ? "▶ " : "  "}${s.index}. ${s.symbol ?? "ε inicial"}: {${s.before.join(",")}} → {${s.after.join(",")}}`,
          )
          .join("\n")}
      </pre>
    </>
  );
}
export default function FormalLab() {
  const [tab, setTab] = useState<"automata" | "ll1">("automata");
  const [regex, setRegex] = useState("(a|b)*abb");
  const [compiled, setCompiled] = useState<{
    regex: string;
    nfa: NFA;
    dfa: ReturnType<typeof subsetConstruction>;
    min: ReturnType<typeof minimizeDFA>;
  } | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"nfa" | "dfa" | "min">("dfa");
  const [word, setWord] = useState("aabb");
  const [trace, setTrace] = useState<SimulationTrace | null>(null);
  const [traceWord, setTraceWord] = useState("");
  const [step, setStep] = useState(0);
  const [grammarSource, setGrammarSource] = useState("S -> a S b | ε");
  const [grammarResult, setGrammarResult] = useState<{
    source: string;
    analysis: LL1Analysis;
  } | null>(null);
  const [grammarError, setGrammarError] = useState("");
  const [chain, setChain] = useState("a a b b");
  const [prediction, setPrediction] = useState<PredictiveResult | null>(null);
  const [predictedChain, setPredictedChain] = useState("");
  const machine = compiled?.[kind];
  const machineStale = compiled !== null && compiled.regex !== regex;
  const grammarStale =
    grammarResult !== null && grammarResult.source !== grammarSource;
  const memberMap = compiled
    ? kind === "dfa"
      ? compiled.dfa.stateSets
      : kind === "min"
        ? compiled.min.groups
        : null
    : null;
  const analysis = grammarResult?.analysis;
  const transitions = useMemo(
    () =>
      machine
        ? machine.states.map((state) => ({
            state,
            cells: machine.alphabet.map(
              (symbol) =>
                machine.transitions
                  .filter((e) => e.from === state && e.symbol === symbol)
                  .map((e) => e.to)
                  .join(", ") || "∅",
            ),
            epsilon:
              machine.transitions
                .filter((e) => e.from === state && e.symbol === null)
                .map((e) => e.to)
                .join(", ") || "∅",
          }))
        : [],
    [machine],
  );
  function compile() {
    try {
      const nfa = compileRegex(regex);
      const dfa = subsetConstruction(nfa);
      const min = minimizeDFA(dfa);
      setCompiled({ regex, nfa, dfa, min });
      setError("");
      setTrace(null);
      setStep(0);
    } catch (e) {
      setCompiled(null);
      setTrace(null);
      setError(e instanceof Error ? e.message : "Expresión inválida.");
    }
  }
  function simulate() {
    if (!compiled || machineStale) return;
    try {
      const result =
        kind === "nfa"
          ? simulateNFA(compiled.nfa, word)
          : simulateDFA(compiled[kind], word);
      setTrace(result);
      setTraceWord(word);
      setStep(result.steps.length - 1);
      setError("");
    } catch (e) {
      setTrace(null);
      setError(e instanceof Error ? e.message : "No se pudo simular.");
    }
  }
  function grammarAnalyze() {
    const parsed = parseGrammar(grammarSource);
    if (!parsed.grammar) {
      setGrammarError(
        parsed.diagnostics.map((d) => `L${d.line}: ${d.message}`).join("\n"),
      );
      setGrammarResult(null);
      setPrediction(null);
      return;
    }
    try {
      const grammar = parsed.grammar;
      setGrammarResult({
        source: grammarSource,
        analysis: analyzeGrammar({
          start: grammar.start,
          productions: grammar.productions.map((p) => ({
            lhs: p.left,
            rhs: p.right,
          })),
        }),
      });
      setGrammarError(parsed.diagnostics.map((d) => d.message).join("\n"));
      setPrediction(null);
    } catch (e) {
      setGrammarResult(null);
      setGrammarError(e instanceof Error ? e.message : "Gramática inválida.");
    }
  }
  return (
    <div className="module-page">
      <h1>Autómatas y LL(1)</h1>
      <p>Construye un autómata o analiza una gramática. Después prueba una cadena.</p>
      <div className="module-toolbar">
        <button
          className={tab === "automata" ? "primary-button" : "secondary-button"}
          onClick={() => setTab("automata")}
        >
          Expresiones y autómatas
        </button>
        <button
          className={tab === "ll1" ? "primary-button" : "secondary-button"}
          onClick={() => setTab("ll1")}
        >
          FIRST · FOLLOW · LL(1)
        </button>
      </div>
      {tab === "automata" ? (
        <>
          <div className="module-card">
            <details className="format-help">
              <summary>Símbolos admitidos</summary>
              <p>Letras a–z, números 0–9, unión |, agrupación (), repetición *, una o más +, opcional ? y ε. Máximo 160 caracteres; sin clases, escapes ni anclas.</p>
            </details>
            <label className="form-field">
              Expresión regular
              <input
                className="lab-input"
                aria-label="Expresión regular"
                value={regex}
                onChange={(e) => setRegex(e.target.value)}
                spellCheck={false}
              />
            </label>
            <button className="primary-button" onClick={compile}>
              Construir autómatas
            </button>
            {error && (
              <p className="module-feedback" role="alert">
                {error}
              </p>
            )}
            {machineStale && (
              <p role="status">
                La expresión cambió. Vuelve a construir el autómata.
              </p>
            )}
          </div>
          {compiled && !machineStale && machine && (
            <>
              <div className="module-toolbar">
                <label>
                  Representación
                  <select
                    aria-label="Representación del autómata"
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value as typeof kind);
                      setTrace(null);
                      setStep(0);
                    }}
                  >
                    <option value="nfa">AFN · Thompson</option>
                    <option value="dfa">AFD · Subconjuntos</option>
                    <option value="min">AFD mínimo · Particiones</option>
                  </select>
                </label>
                <span className="module-status">
                  AFN: {compiled.nfa.states.length} · AFD:{" "}
                  {compiled.dfa.states.length} · Mínimo:{" "}
                  {compiled.min.states.length} estados
                </span>
              </div>
              <div className="module-grid">
                <section className="module-card">
                  <h2>
                    {kind === "nfa"
                      ? "AFN con transiciones ε"
                      : kind === "dfa"
                        ? "AFD por subconjuntos alcanzables"
                        : "AFD por refinamiento de particiones"}
                  </h2>
                  <p>
                    Inicio: {machine.start} · Finales:{" "}
                    {machine.accepting.join(", ") || "∅"} · Alfabeto:{" "}
                    {machine.alphabet.join(", ") || "∅"}. Una doble
                    circunferencia indica aceptación.
                  </p>
                  <AutomatonDiagram
                    machine={machine}
                    active={
                      trace && traceWord === word
                        ? (trace.steps[step]?.after ?? [])
                        : []
                    }
                  />
                  <div className="table-scroll">
                    <table className="algorithm-table">
                      <thead>
                        <tr>
                          <th>Estado</th>
                          {machine.alphabet.map((s) => (
                            <th key={s}>{s}</th>
                          ))}
                          {kind === "nfa" && <th>ε</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {transitions.map((row) => (
                          <tr key={row.state}>
                            <td>
                              {row.state}
                              {machine.accepting.includes(row.state)
                                ? " *"
                                : ""}
                            </td>
                            {row.cells.map((cell, index) => (
                              <td key={index}>{cell}</td>
                            ))}
                            {kind === "nfa" && <td>{row.epsilon}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {memberMap && (
                    <details>
                      <summary>
                        {kind === "dfa"
                          ? "Conjuntos de estados del AFN"
                          : "Particiones equivalentes del AFD"}
                      </summary>
                      <pre className="algorithm-trace">
                        {Object.entries(memberMap)
                          .map(
                            ([state, set]) =>
                              `${state} = { ${set.join(", ")} }`,
                          )
                          .join("\n")}
                      </pre>
                    </details>
                  )}
                  <details>
                    <summary>Cómo se construyó</summary>
                    <p>
                      {kind === "nfa"
                        ? "Thompson crea fragmentos con entradas y salidas y los conecta mediante ε según el árbol de la expresión."
                        : kind === "dfa"
                          ? "Se parte de la clausura ε del inicio. Para cada símbolo se calcula movimiento y clausura; cada conjunto nuevo forma un estado del AFD."
                          : "Se eliminan estados inalcanzables. Se separan finales y no finales, refinando bloques hasta que sus destinos por símbolo sean equivalentes."}
                    </p>
                  </details>
                </section>
                <section className="module-card">
                  <h2>Recorrer una cadena</h2>
                  <p>
                    Entrada vacía representa ε. Máximo 256 caracteres. Un
                    símbolo ajeno al alfabeto se rechaza explícitamente.
                  </p>
                  <label className="form-field">
                    Cadena de entrada
                    <input
                      className="lab-input"
                      aria-label="Cadena del autómata"
                      value={word}
                      onChange={(e) => setWord(e.target.value)}
                    />
                  </label>
                  <button className="primary-button" onClick={simulate}>
                    Simular cadena
                  </button>
                  {trace && traceWord !== word ? (
                    <p role="status">La cadena cambió. Vuelve a simular.</p>
                  ) : (
                    trace && (
                      <Trace trace={trace} step={step} onStep={setStep} />
                    )
                  )}
                </section>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="module-grid">
            <section className="module-card">
              <h2>Una gramática, una tabla predictiva</h2>
              <p>
                Una producción por línea; alternativas con |; símbolos separados
                por espacios; ε es la alternativa vacía. No terminales con
                inicial mayúscula. La primera regla establece el inicio.
              </p>
              <label className="form-field">
                Gramática LL(1)
                <textarea
                  className="grammar-editor"
                  aria-label="Gramática LL1"
                  value={grammarSource}
                  onChange={(e) => setGrammarSource(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <button className="primary-button" onClick={grammarAnalyze}>
                Calcular FIRST y FOLLOW
              </button>
              {grammarError && (
                <pre className="module-feedback" role="alert">
                  {grammarError}
                </pre>
              )}
              {grammarStale && (
                <p role="status">
                  La gramática cambió. Vuelve a calcular sus conjuntos.
                </p>
              )}
            </section>
            <section className="module-card">
              <h2>Análisis predictivo paso a paso</h2>
              <p>
                Tokens separados por espacios. La pila se muestra con la cima a
                la izquierda; $ marca el fin. No se elige una regla arbitraria
                si hay conflictos.
              </p>
              <label className="form-field">
                Cadena de tokens
                <input
                  className="lab-input"
                  aria-label="Cadena LL1"
                  value={chain}
                  onChange={(e) => setChain(e.target.value)}
                />
              </label>
              <button
                className="primary-button"
                disabled={!analysis || grammarStale}
                onClick={() => {
                  if (!analysis) return;
                  try {
                    setPrediction(
                      predictiveParse(
                        analysis,
                        chain.trim() === "" || chain.trim() === "ε"
                          ? []
                          : chain.trim().split(/\s+/),
                      ),
                    );
                    setPredictedChain(chain);
                  } catch (e) {
                    setPrediction(null);
                    setGrammarError(
                      e instanceof Error ? e.message : "No se pudo analizar.",
                    );
                  }
                }}
              >
                Analizar con LL(1)
              </button>
              {prediction &&
                !grammarStale &&
                (chain !== predictedChain ? (
                  <p>La cadena cambió; vuelve a analizar.</p>
                ) : (
                  <>
                    <div className="module-feedback" role="status">
                      <strong>
                        {prediction.accepted
                          ? "Cadena aceptada por LL(1)"
                          : "Cadena rechazada por LL(1)"}
                      </strong>
                      <p>
                        {prediction.error ??
                          "Se agotaron la pila y la entrada al mismo tiempo."}
                      </p>
                    </div>
                    <div className="table-scroll">
                      <table className="algorithm-table">
                        <thead>
                          <tr>
                            <th>Pila</th>
                            <th>Entrada</th>
                            <th>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prediction.trace.map((t) => (
                            <tr key={t.step}>
                              <td>{t.stack.join(" ")}</td>
                              <td>{t.remaining.join(" ")}</td>
                              <td>{t.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ))}
            </section>
          </div>
          {analysis && !grammarStale && (
            <section className="module-card formal-results">
              <h2>
                {analysis.isLL1
                  ? "Gramática apta para LL(1)"
                  : "La gramática no es LL(1)"}
              </h2>
              <p>
                FIRST/FOLLOW se calculan por punto fijo. Anulables:{" "}
                {analysis.nullable.join(", ") || "∅"}. Recursividad izquierda:{" "}
                {analysis.leftRecursive.join(", ") || "ninguna"}. No
                productivos: {analysis.unproductive.join(", ") || "ninguno"}.
              </p>
              <div className="module-grid">
                <div>
                  <h3>Conjuntos calculados</h3>
                  <table className="algorithm-table">
                    <thead>
                      <tr>
                        <th>Símbolo</th>
                        <th>FIRST</th>
                        <th>FOLLOW</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.nonterminals.map((n) => (
                        <tr key={n}>
                          <td>{n}</td>
                          <td>{analysis.first[n].join(", ") || "∅"}</td>
                          <td>{analysis.follow[n].join(", ") || "∅"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ol>
                    {analysis.grammar.productions.map((p, i) => (
                      <li key={i}>
                        <code>
                          {i + 1}. {p.lhs} → {p.rhs.join(" ") || "ε"}
                        </code>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h3>Tabla M[no terminal, anticipación]</h3>
                  <div className="table-scroll">
                    <table className="algorithm-table">
                      <thead>
                        <tr>
                          <th>M</th>
                          {[...analysis.terminals, "$"].map((t) => (
                            <th key={t}>{t}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.nonterminals.map((n) => (
                          <tr key={n}>
                            <td>{n}</td>
                            {[...analysis.terminals, "$"].map((t) => (
                              <td key={t}>
                                {analysis.table[n][t]
                                  ?.map((i) => i + 1)
                                  .join(" / ") || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {analysis.conflicts.map((c) => (
                    <p
                      className="module-feedback"
                      key={`${c.nonterminal}-${c.lookahead}`}
                    >
                      Conflicto M[{c.nonterminal}, {c.lookahead}]: producciones{" "}
                      {c.productionIndices.map((i) => i + 1).join(", ")}.
                    </p>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
