import { describe, it, expect } from "vitest";
import {
  EXERCISES,
  TOPICS,
  NEXT_STEPS,
  evaluateAnswer,
  loadProgress,
  recordAttempt,
  topicProgress,
} from "./learning";
import type { Attempt, Progress } from "./learning";

describe("ejercicios y progreso verificables", () => {
  it("cubre los 18 temas con niveles inicial e intermedio e identificadores únicos", () => {
    expect(TOPICS).toHaveLength(18);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const topic of TOPICS) {
      const levels = EXERCISES.filter((e) => e.topic === topic).map(
        (e) => e.level,
      );
      expect(levels).toContain("Inicial");
      expect(levels).toContain("Intermedio");
      expect(NEXT_STEPS[topic].length).toBeGreaterThan(30);
    }
  });
  it.each(EXERCISES.map((e) => [e.id, e] as const))(
    "acepta solo la respuesta correcta de %s",
    (_id, exercise) => {
      expect(evaluateAnswer(exercise, exercise.correct).correct).toBe(true);
      exercise.options.forEach((_answer, index) =>
        expect(evaluateAnswer(exercise, index).correct).toBe(
          index === exercise.correct,
        ),
      );
      for (const invalid of [-1, 10, 1.5, NaN])
        expect(evaluateAnswer(exercise, invalid).correct).toBe(false);
    },
  );
  it("recupera un progreso vacío ante datos corruptos o storage inaccesible", () => {
    for (const input of [null, "{", "[]", '{"version":2,"attempts":[]}'])
      expect(loadProgress({ getItem: () => input })).toEqual({
        version: 1,
        attempts: [],
      });
    expect(
      loadProgress({
        getItem: () => {
          throw Error("denied");
        },
      }).attempts,
    ).toEqual([]);
  });
  it("conserva intentos reales y descarta entradas ajenas o mal tipadas", () => {
    const valid: Attempt = {
      exerciseId: EXERCISES[0].id,
      correct: false,
      hints: 1,
      mode: "practice",
      at: 100,
    };
    const values = [
      valid,
      { ...valid, exerciseId: "nonexistent" },
      { ...valid, hints: 4 },
      { ...valid, correct: "yes" },
      { ...valid, mode: "fake" },
    ];
    expect(
      loadProgress({
        getItem: () => JSON.stringify({ version: 1, attempts: values }),
      }).attempts,
    ).toEqual([valid]);
  });
  it("no confunde intentos, ejercicios resueltos y dominio sin pistas", () => {
    const topic = TOPICS[0],
      a = EXERCISES.find((e) => e.topic === topic && e.level === "Inicial")!,
      b = EXERCISES.find((e) => e.topic === topic && e.level === "Intermedio")!;
    let progress: Progress = { version: 1, attempts: [] };
    const attempt = (
      exerciseId: string,
      correct: boolean,
      hints = 0,
    ): Attempt => ({ exerciseId, correct, hints, mode: "practice", at: 1 });
    progress = recordAttempt(progress, attempt(a.id, false));
    expect(topicProgress(progress, topic).completed).toBe(0);
    progress = recordAttempt(progress, attempt(a.id, true));
    progress = recordAttempt(progress, attempt(b.id, true, 1));
    expect(topicProgress(progress, topic)).toMatchObject({
      attempts: 3,
      completed: 2,
      mastered: false,
    });
    progress = recordAttempt(progress, attempt(b.id, true));
    expect(topicProgress(progress, topic).mastered).toBe(true);
    expect(loadProgress({ getItem: () => JSON.stringify(progress) })).toEqual(
      progress,
    );
  });
  it("acota el historial a 1000 intentos", () => {
    const a: Attempt = {
      exerciseId: EXERCISES[0].id,
      correct: true,
      hints: 0,
      mode: "evaluate",
      at: 0,
    };
    const progress: Progress = {
      version: 1,
      attempts: Array.from({ length: 1000 }, (_, at) => ({ ...a, at })),
    };
    const next = recordAttempt(progress, { ...a, at: 1000 });
    expect(next.attempts).toHaveLength(1000);
    expect(next.attempts[0].at).toBe(1);
    expect(next.attempts.at(-1)?.at).toBe(1000);
  });
});
