import { useRef, useState } from "react";
import {
  EXERCISES,
  TOPICS,
  NEXT_STEPS,
  PROGRESS_KEY,
  evaluateAnswer,
  loadProgress,
  recordAttempt,
  topicProgress,
} from "../engine/learning";
import type { Progress } from "../engine/learning";

const EXERCISE_SEQUENCE = TOPICS.flatMap(topic => EXERCISES.filter(e => e.topic === topic));

export default function PracticeLab({
  mode = "practice",
  initialTopic,
  initialExercise,
}: {
  mode?: "practice" | "evaluate";
  initialTopic?: string;
  initialExercise?: string;
}) {
  const initial = EXERCISES.find((e) => e.id === initialExercise);
  const [topic, setTopic] = useState(
    initial?.topic ??
      (initialTopic && TOPICS.includes(initialTopic)
        ? initialTopic
        : TOPICS[0]),
  );
  const [exerciseId, setExerciseId] = useState(
    initial?.id ??
      EXERCISES.find((e) => e.topic === (initialTopic ?? TOPICS[0]))?.id ??
      EXERCISES[0].id,
  );
  const [answer, setAnswer] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    message: string;
  } | null>(null);
  const [hints, setHints] = useState(0);
  const [solution, setSolution] = useState(false);
  const helpSeen = useRef<Record<string, number>>({});
  const [progress, setProgress] = useState<Progress>(() => {
    try {
      return loadProgress(localStorage);
    } catch {
      return { version: 1, attempts: [] };
    }
  });
  const [saved, setSaved] = useState(true);
  const exercise = EXERCISES.find((e) => e.id === exerciseId)!;
  const currentProgress = topicProgress(progress, topic);
  const exerciseIndex = EXERCISE_SEQUENCE.findIndex(e => e.id === exerciseId);
  const nextExercise = EXERCISE_SEQUENCE[(exerciseIndex + 1) % EXERCISE_SEQUENCE.length];
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const reset = () => {
    setAnswer(null);
    setFeedback(null);
    setHints(0);
    setSolution(false);
  };
  function submit() {
    if (answer === null) return;
    const result = evaluateAnswer(exercise, answer);
    setFeedback(result);
    const next = recordAttempt(progress, {
      exerciseId,
      correct: result.correct,
      hints: Math.max(solution ? 3 : hints, helpSeen.current[exerciseId] ?? 0),
      mode,
      at: Date.now(),
    });
    setProgress(next);
    if (!result.correct)
      helpSeen.current[exerciseId] = Math.max(
        helpSeen.current[exerciseId] ?? 0,
        mode === "evaluate" ? 3 : 1,
      );
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("syntaxlab:progress"));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }
  return (
    <div className="module-page practice-page">
      <h1>
        {mode === "evaluate"
          ? "Evaluarme"
          : "Prácticas"}
      </h1>
      <p>
        {mode === "evaluate"
          ? "Responde sin pistas y comprueba lo que sabes."
          : "Elige una respuesta, compruébala y sigue practicando."}
      </p>
      <div className="module-toolbar">
        <label>
          Tema
          <select
            aria-label="Tema de práctica"
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              setExerciseId(
                EXERCISES.find((x) => x.topic === e.target.value)!.id,
              );
              reset();
            }}
          >
            {TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Ejercicio
          <select
            aria-label="Ejercicio de práctica"
            value={exerciseId}
            onChange={(e) => {
              setExerciseId(e.target.value);
              reset();
            }}
          >
            {EXERCISES.filter((e) => e.topic === topic).map((e, i) => (
              <option key={e.id} value={e.id}>
                {e.level} · {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
          {!saved && (
            <p role="status">
              No se pudo guardar el progreso en este navegador.
            </p>
          )}
      <div className="practice-progress" aria-label="Progreso del tema">
        <span>{currentProgress.completed} de {currentProgress.total} ejercicios resueltos en este tema</span>
        <progress value={currentProgress.completed} max={currentProgress.total} aria-label="Ejercicios resueltos" />
      </div>
      <div className="practice-layout">
        <section className="module-card question-card" aria-label="Pregunta actual">
          <span className="outline-label">
            {exercise.level} · {topic}
          </span>
          <h2 ref={questionHeading} tabIndex={-1}>{exercise.question}</h2>
          {exercise.snippet && (
            <pre className="practice-snippet">
              <code>{exercise.snippet}</code>
            </pre>
          )}
          <div
            className="answer-options"
            role="group"
            aria-label="Opciones de respuesta"
          >
            {exercise.options.map((option, index) => (
              <button
                key={option}
                aria-pressed={answer === index}
                disabled={feedback !== null}
                onClick={() => setAnswer(index)}
              >
                <span className="answer-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span><span>{option}</span>
              </button>
            ))}
          </div>
          <div className="module-toolbar">
            <button
              className="primary-button"
              disabled={answer === null || feedback !== null}
              onClick={submit}
            >
              Comprobar respuesta
            </button>
            {(feedback || solution || hints > 0) && <button className="secondary-button" onClick={reset}>Reintentar</button>}
            {feedback && <button className="secondary-button" onClick={() => {
              setTopic(nextExercise.topic);
              setExerciseId(nextExercise.id);
              reset();
              questionHeading.current?.focus();
            }}>
              {exerciseIndex === EXERCISES.length - 1 ? "Volver al primer ejercicio" : "Siguiente ejercicio"}
            </button>}
          </div>
          {feedback && (
            <div className="module-feedback" role="status">
              <strong>
                {feedback.correct
                  ? "Respuesta correcta"
                  : "Revisa tu razonamiento"}
              </strong>
              <p>{feedback.message}</p>
              {mode === "evaluate" && feedback.message !== exercise.explanation && <p>{exercise.explanation}</p>}
            </div>
          )}
          {mode === "practice" && (
            <>
              <div className="module-toolbar">
                <button
                  className="secondary-button"
                  disabled={hints >= 3}
                  onClick={() => {
                    helpSeen.current[exerciseId] = Math.max(
                      helpSeen.current[exerciseId] ?? 0,
                      hints + 1,
                    );
                    setHints((h) => h + 1);
                  }}
                >
                  Pista {Math.min(hints + 1, 3)} de 3
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    helpSeen.current[exerciseId] = 3;
                    setSolution(true);
                  }}
                >
                  Mostrar solución completa
                </button>
              </div>
              {hints >= 1 && (
                <p className="module-feedback">
                  Pista conceptual: {exercise.hint}
                </p>
              )}
              {hints >= 2 && (
                <p className="module-feedback">
                  Identifica el error: {exercise.reasoning}
                </p>
              )}
              {hints >= 3 && (
                <p className="module-feedback">
                  Siguiente paso: {NEXT_STEPS[exercise.topic]}
                </p>
              )}
              {solution && (
                <div className="module-feedback">
                  <strong>
                    Solución: {exercise.options[exercise.correct]}
                  </strong>
                  <p>{exercise.explanation}</p>
                </div>
              )}
            </>
          )}
        </section>
        <details className="module-card progress-details">
          <summary>Ver mi progreso por tema</summary>
          <p>
            Dominado: un ejercicio inicial y uno intermedio resueltos sin pistas.
          </p>
          <div className="progress-list">
            {TOPICS.map((t) => {
              const p = topicProgress(progress, t);
              return (
                <div className="progress-row" key={t}>
                  <strong>{t}</strong>
                  <small>
                    {p.completed}/{p.total} · {p.attempts} intentos{" "}
                    {p.mastered ? "· Dominado en prácticas" : ""}
                  </small>
                </div>
              );
            })}
          </div>
          <p className="result-help">
            Guardado en este navegador.
          </p>
        </details>
      </div>
    </div>
  );
}
