import { useState } from "react";
import { ArrowRight, Lightbulb, RotateCcw } from "lucide-react";
import {
  applyProduction,
  findDerivation,
  formatForm,
  formatProduction,
  GRAMMAR_LIMITS,
  parseGrammar,
  tokenizeTarget,
} from "../engine/grammar";
import type {
  DerivationDirection,
  DerivationSearchResult,
  Grammar,
  GrammarDerivationStep,
} from "../engine/grammar";

const EXERCISES = [
  {
    id: "balanced",
    title: "Recursión y caso base",
    source: "S -> a S b | ε",
    target: "a a b b",
    objective:
      "Construye parejas de a y b. Decide cuándo repetir la regla recursiva y cuándo aplicar el caso base.",
  },
  {
    id: "alternatives",
    title: "Dos no terminales",
    source: "S -> A B\nA -> a | ε\nB -> b B | b",
    target: "a b b",
    objective:
      "Distingue qué no terminal debes expandir y observa cómo cambia el orden por izquierda o por derecha.",
  },
  {
    id: "expressions",
    title: "Expresiones y lista recursiva",
    source: "E -> T R\nR -> + T R | ε\nT -> n",
    target: "n + n + n",
    objective:
      "Usa la recursión de R para construir una expresión con tres operandos, y luego termina la lista.",
  },
];
const MAX_MANUAL_STEPS = 100;

function selectableIndex(
  grammar: Grammar,
  form: string[],
  direction: DerivationDirection,
): number | null {
  const positions = form.flatMap((symbol, index) =>
    grammar.nonterminals.includes(symbol) ? [index] : [],
  );
  return (direction === "right" ? positions.at(-1) : positions[0]) ?? null;
}

function DerivationPath({
  result,
  label,
}: {
  result: DerivationSearchResult;
  label: string;
}) {
  return (
    <section aria-label={label}>
      <h3>{label}</h3>
      <p
        className={
          result.status === "found" ? "positive-message" : "result-help"
        }
      >
        {result.message}
      </p>
      {result.status === "found" && (
        <ol className="derivation-history">
          {result.forms.map((form, index) => (
            <li key={index}>
              <code>{formatForm(form)}</code>
              {index > 0 && <small> · {result.steps[index - 1].rule}</small>}
            </li>
          ))}
        </ol>
      )}
      <p className="result-help">
        Estados explorados: {result.visited}.{" "}
        {result.status === "found"
          ? `${result.steps.length} pasos calculados.`
          : ""}
      </p>
    </section>
  );
}

export default function DerivationLab() {
  const [mode, setMode] = useState<"guided" | "free">("guided");
  const [exerciseId, setExerciseId] = useState(EXERCISES[0].id);
  const [draft, setDraft] = useState(EXERCISES[0].source);
  const [activeSource, setActiveSource] = useState(EXERCISES[0].source);
  const [parsed, setParsed] = useState(() => parseGrammar(EXERCISES[0].source));
  const [target, setTarget] = useState(EXERCISES[0].target);
  const [direction, setDirection] = useState<DerivationDirection>("left");
  const [form, setForm] = useState<string[]>(["S"]);
  const [history, setHistory] = useState<GrammarDerivationStep[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0);
  const [productionId, setProductionId] = useState("production-1");
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [hint, setHint] = useState("");
  const [solutions, setSolutions] = useState<{
    left: DerivationSearchResult;
    right: DerivationSearchResult;
  } | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const grammar = parsed.grammar;
  const dirty = draft !== activeSource;
  const exercise =
    EXERCISES.find((item) => item.id === exerciseId) ?? EXERCISES[0];
  const targetSymbols = tokenizeTarget(target);
  const terminalOnly =
    grammar !== null &&
    form.every((symbol) => !grammar.nonterminals.includes(symbol));
  const reached =
    terminalOnly && JSON.stringify(form) === JSON.stringify(targetSymbols);

  function clearHelp() {
    setHintLevel(0);
    setHint("");
    setSolutions(null);
    setShowSolution(false);
    setShowComparison(false);
  }

  function restart(nextGrammar = grammar, nextDirection = direction) {
    setForm(nextGrammar ? [nextGrammar.start] : []);
    setHistory([]);
    setSelectedIndex(nextGrammar ? 0 : null);
    setProductionId(nextGrammar?.productions[0]?.id ?? "");
    setFeedback(null);
    clearHelp();
    if (nextGrammar)
      setSelectedIndex(
        selectableIndex(nextGrammar, [nextGrammar.start], nextDirection),
      );
  }

  function useGrammar(source: string) {
    const result = parseGrammar(source);
    setParsed(result);
    setActiveSource(source);
    restart(result.grammar);
    setFeedback(
      result.grammar
        ? {
            error: false,
            text: "Gramática aplicada. La derivación comienza desde su primer no terminal definido.",
          }
        : {
            error: true,
            text: "La gramática contiene errores. Corrige las reglas indicadas antes de derivar.",
          },
    );
  }

  function loadExercise(id: string) {
    const selected = EXERCISES.find((item) => item.id === id);
    if (!selected) return;
    setExerciseId(id);
    setDraft(selected.source);
    setTarget(selected.target);
    useGrammar(selected.source);
  }

  function applyStep() {
    if (!grammar || dirty) return;
    if (history.length >= MAX_MANUAL_STEPS) {
      setFeedback({
        error: true,
        text: `Esta sesión admite ${MAX_MANUAL_STEPS} pasos manuales. Reinicia para seguir explorando.`,
      });
      return;
    }
    const result = applyProduction(
      grammar,
      form,
      selectedIndex ?? -1,
      productionId,
      direction,
    );
    if (!result.ok) {
      setFeedback({ error: true, text: result.message });
      return;
    }
    setForm(result.form);
    setHistory((current) => [...current, result.step]);
    const nextIndex = selectableIndex(grammar, result.form, direction);
    setSelectedIndex(nextIndex);
    const nextProduction = grammar.productions.find(
      (production) => production.left === result.form[nextIndex ?? -1],
    );
    if (nextProduction) setProductionId(nextProduction.id);
    setHintLevel(0);
    setHint("");
    const complete = result.form.every(
      (symbol) => !grammar.nonterminals.includes(symbol),
    );
    const matches =
      JSON.stringify(result.form) === JSON.stringify(targetSymbols);
    setFeedback({
      error: false,
      text: complete
        ? matches
          ? "Cadena objetivo alcanzada mediante pasos válidos. Puedes reintentar con otro orden de expansión."
          : "Obtuviste una cadena terminal. El paso es válido, pero la cadena no coincide con el objetivo. Reinicia para intentar otra elección."
        : `Paso válido: ${result.step.rule}. Se sustituyó únicamente el no terminal de la posición ${result.step.index + 1}.`,
    });
  }

  function requestHint() {
    if (!grammar || dirty) return;
    const nextLevel = Math.min(3, hintLevel + 1);
    setHintLevel(nextLevel);
    if (nextLevel === 1) {
      setHint(
        direction === "free"
          ? "Pista conceptual: una producción sustituye un solo no terminal por su lado derecho. ε lo elimina; los terminales no se expanden."
          : `Pista conceptual: en derivación por la ${direction === "left" ? "izquierda" : "derecha"}, elige siempre el no terminal más a la ${direction === "left" ? "izquierda" : "derecha"}. El caso base permite terminar la recursión.`,
      );
    } else if (nextLevel === 2) {
      const required = selectableIndex(grammar, form, direction);
      setHint(
        feedback?.error
          ? `Identificación del error: ${feedback.text}`
          : selectedIndex !== null &&
              !grammar.nonterminals.includes(form[selectedIndex])
            ? `Identificación: ${form[selectedIndex]} es un terminal; selecciona un no terminal.`
            : direction !== "free" && required !== selectedIndex
              ? `Identificación: el orden actual requiere expandir la posición ${(required ?? -1) + 1}.`
              : "Identificación: revisa que el lado izquierdo de la producción coincida con el no terminal seleccionado. Un paso válido no garantiza todavía llegar a la cadena objetivo.",
      );
    } else {
      const result = findDerivation(
        grammar,
        target,
        direction === "right" ? "right" : "left",
        { initialForm: form },
      );
      const next = result.steps[0];
      setHint(
        result.status === "found"
          ? next
            ? `Siguiente paso posible: selecciona ${form[next.index]} en la posición ${next.index + 1} y aplica ${next.rule}. Es una opción calculada, no la única solución posible.`
            : "La forma sentencial ya coincide con la cadena objetivo."
          : result.message,
      );
    }
  }

  function calculateSolutions() {
    if (!grammar || dirty) return;
    if (!solutions)
      setSolutions({
        left: findDerivation(grammar, target, "left"),
        right: findDerivation(grammar, target, "right"),
      });
  }

  return (
    <div className="module-page">
      <h1>Derivaciones</h1>
      <p>Elige un no terminal y aplica una producción hasta llegar a la cadena objetivo.</p>
      <div
        className="module-toolbar"
        aria-label="Modo del laboratorio de derivaciones"
      >
        <button
          className={mode === "guided" ? "primary-button" : "secondary-button"}
          aria-pressed={mode === "guided"}
          onClick={() => {
            setMode("guided");
            loadExercise(exerciseId);
          }}
        >
          Modo guiado
        </button>
        <button
          className={mode === "free" ? "primary-button" : "secondary-button"}
          aria-pressed={mode === "free"}
          onClick={() => setMode("free")}
        >
          Modo libre
        </button>
        {mode === "guided" && (
          <label>
            Ejercicio
            <select
              aria-label="Ejercicio"
              value={exerciseId}
              onChange={(event) => loadExercise(event.target.value)}
            >
              {EXERCISES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {mode === "guided" && (
        <p className="module-feedback">
          <strong>Objetivo: </strong>
          {exercise.objective}
        </p>
      )}
      <div className="module-grid">
        <section className="module-card">
          <h2>La gramática</h2>
          <label className="form-field">
            Producciones
            <textarea
              className="grammar-editor"
              aria-label="Producciones de la gramática"
              value={draft}
              readOnly={mode === "guided"}
              maxLength={GRAMMAR_LIMITS.sourceLength + 1}
              spellCheck={false}
              onChange={(event) => {
                setDraft(event.target.value);
                clearHelp();
              }}
            />
          </label>
          {mode === "free" && <details><summary>Cómo escribir la gramática</summary><p className="result-help">
            Un símbolo por espacio. No terminales con inicial mayúscula;
            terminales con inicial minúscula, números o signos. Usa | para
            alternativas y ε sola para la cadena vacía. El primer lado izquierdo
            es el símbolo inicial.
          </p></details>}
          {mode === "free" && (
            <button
              className="secondary-button"
              onClick={() => useGrammar(draft)}
            >
              Aplicar gramática
            </button>
          )}
          {dirty && (
            <p className="module-feedback" role="status">
              Hay cambios sin aplicar. Aplica la gramática para volver a
              derivar.
            </p>
          )}
          {parsed.diagnostics.map((diagnostic, index) => (
            <p
              key={`${diagnostic.code}-${index}`}
              className="module-feedback"
              role={diagnostic.severity === "error" ? "alert" : undefined}
            >
              Línea {diagnostic.line} ·{" "}
              {diagnostic.severity === "error" ? "Error" : "Observación"}:{" "}
              {diagnostic.message}
            </p>
          ))}
          {grammar && (
            <div className="session-list">
              <div>
                <span>Símbolo inicial</span>
                <strong>{grammar.start}</strong>
              </div>
              <div>
                <span>No terminales</span>
                <strong>{grammar.nonterminals.join(", ")}</strong>
              </div>
              <div>
                <span>Terminales</span>
                <strong>{grammar.terminals.join(", ") || "Ninguno"}</strong>
              </div>
            </div>
          )}
          <label className="form-field">
            Cadena objetivo
            <input
              className="lab-input"
              aria-label="Cadena objetivo"
              value={target}
              maxLength={2000}
              readOnly={mode === "guided"}
              onChange={(event) => {
                setTarget(event.target.value);
                clearHelp();
                setFeedback(null);
              }}
            />
          </label>
          {mode === "free" && <p className="result-help">Separa los símbolos con espacios. ε representa la cadena vacía.</p>}
          <label className="form-field">
            Orden de expansión
            <select
              className="lab-input"
              aria-label="Orden de expansión"
              value={direction}
              onChange={(event) => {
                const next = event.target.value as DerivationDirection;
                setDirection(next);
                restart(grammar, next);
              }}
            >
              {[
                ["left", "Por la izquierda"],
                ["right", "Por la derecha"],
                ["free", "Libre: cualquier no terminal"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="result-help">
            Cambiar el orden reinicia los pasos.
          </p>
        </section>
        <section className="module-card">
          <h2>Construye la cadena</h2>
          <p>
            Forma sentencial actual · <strong>{history.length} pasos</strong>
          </p>
          <div className="symbol-row" aria-label="Forma sentencial actual">
            {form.length === 0 ? (
              <code>ε</code>
            ) : (
              form.map((symbol, index) => (
                <button
                  key={`${index}-${symbol}`}
                  className={`symbol-button ${grammar?.terminals.includes(symbol) ? "symbol-terminal" : ""}`}
                  aria-label={`${grammar?.nonterminals.includes(symbol) ? "No terminal" : "Terminal"} ${symbol}, posición ${index + 1}`}
                  aria-pressed={selectedIndex === index}
                  disabled={!grammar || dirty}
                  onClick={() => {
                    setSelectedIndex(index);
                    const matching = grammar?.productions.find(
                      (production) => production.left === symbol,
                    );
                    if (matching) setProductionId(matching.id);
                  }}
                >
                  {symbol}
                </button>
              ))
            )}
          </div>
          <p className="result-help">
            Los símbolos verdes son terminales. Los demás son no terminales y
            pueden expandirse mediante sus producciones.
          </p>
          <label className="form-field">
            Producción
            <select
              className="lab-input"
              aria-label="Producción a aplicar"
              value={productionId}
              disabled={!grammar || dirty}
              onChange={(event) => setProductionId(event.target.value)}
            >
              {grammar?.productions.map((production) => (
                <option key={production.id} value={production.id}>
                  {formatProduction(production)}
                </option>
              ))}
            </select>
          </label>
          <div className="module-toolbar">
            <button
              className="primary-button"
              disabled={!grammar || dirty || selectedIndex === null}
              onClick={applyStep}
            >
              Aplicar producción <ArrowRight size={15} />
            </button>
            <button
              className="secondary-button"
              onClick={() => restart()}
              disabled={!grammar}
            >
              <RotateCcw size={15} />
              Reiniciar derivación
            </button>
          </div>
          {feedback && (
            <p className="module-feedback" role="status">
              <strong>{feedback.error ? "Revisa el paso. " : ""}</strong>
              {feedback.text}
            </p>
          )}
          {reached && (
            <p className="positive-message" role="status">
              Objetivo alcanzado: {formatForm(form)}
            </p>
          )}
          {terminalOnly && !reached && (
            <p className="result-help">
              La cadena ya es terminal, pero difiere del objetivo. Puedes
              reiniciar e intentar otra derivación.
            </p>
          )}
          <h3>Tu recorrido</h3>
          <ol
            className="derivation-history"
            aria-label="Historial de derivación"
          >
            <li>
              <code>{grammar?.start ?? "Sin gramática válida"}</code>
            </li>
            {history.map((step, index) => (
              <li key={index}>
                <code>{formatForm(step.after)}</code>
                <small> · {step.rule}</small>
              </li>
            ))}
          </ol>
          <div className="module-toolbar">
            <button
              className="secondary-button"
              disabled={!grammar || dirty || hintLevel >= 3}
              onClick={requestHint}
            >
              <Lightbulb size={15} />
              Pedir pista{hintLevel ? ` (${hintLevel}/3)` : ""}
            </button>
          </div>
          {hint && (
            <p className="module-feedback" role="status">
              {hint}
            </p>
          )}
          <p className="result-help">
            Las pistas avanzan de concepto a identificación del error y
            siguiente paso posible. La solución completa permanece oculta hasta
            que la solicites.
          </p>
          <div className="module-toolbar">
            <button
              className="secondary-button"
              disabled={!grammar || dirty}
              onClick={() => {
                calculateSolutions();
                setShowSolution((current) => !current);
              }}
            >
              {showSolution ? "Ocultar solución" : "Mostrar solución calculada"}
            </button>
            <button
              className="secondary-button"
              disabled={!grammar || dirty}
              onClick={() => {
                calculateSolutions();
                setShowComparison((current) => !current);
              }}
            >
              {showComparison
                ? "Ocultar comparador"
                : "Comparar izquierda y derecha"}
            </button>
          </div>
          <p className="result-help">
            El comparador muestra las dos soluciones completas calculadas, si se
            encuentran. Puede haber otras derivaciones válidas.
          </p>
          {showSolution && solutions && (
            <DerivationPath
              result={direction === "right" ? solutions.right : solutions.left}
              label={`Solución calculada por la ${direction === "right" ? "derecha" : "izquierda"}`}
            />
          )}
        </section>
      </div>
      {showComparison && solutions && (
        <section className="module-card" style={{ marginTop: 24 }}>
          <h2>Comparador de derivaciones</h2>
          <p>
            El orden de expansión cambia; la cadena terminal objetivo es la
            misma.
          </p>
          <div className="compare-grid">
            <DerivationPath
              result={solutions.left}
              label="Derivación por la izquierda"
            />
            <DerivationPath
              result={solutions.right}
              label="Derivación por la derecha"
            />
          </div>
        </section>
      )}
      <p className="result-help">
        Alcance: gramáticas libres de contexto con un no terminal a la
        izquierda. Hasta {GRAMMAR_LIMITS.productions} producciones,{" "}
        {GRAMMAR_LIMITS.formSymbols} símbolos por forma y {MAX_MANUAL_STEPS}{" "}
        pasos manuales por sesión. La búsqueda automática usa hasta{" "}
        {GRAMMAR_LIMITS.searchDepth} pasos y {GRAMMAR_LIMITS.searchStates}{" "}
        estados; alcanzar un límite no demuestra imposibilidad.
      </p>
    </div>
  );
}
