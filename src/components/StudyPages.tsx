import { ArrowRight } from "lucide-react";
import { EXERCISES, TOPICS } from "../engine/learning";

export function StudyPages({ onPractice }: { onPractice: (topic: string) => void }) {
  return (
    <div className="module-page review-page">
      <h1>Repaso</h1>
      <p>Abre un tema, revisa el ejemplo y ponlo en práctica.</p>
      <div className="review-topics">
        {TOPICS.map((topic, index) => {
          const exercise = EXERCISES.find(e => e.topic === topic)!;
          return (
            <details className="review-topic" name="review-topic" key={topic}>
              <summary><span>{String(index + 1).padStart(2, "0")}</span>{topic}</summary>
              <div className="review-content">
                <p>{exercise.hint}</p>
                {exercise.snippet && <pre className="practice-snippet"><code>{exercise.snippet}</code></pre>}
                <h2>{exercise.question}</h2>
                <p><strong>{exercise.options[exercise.correct]}.</strong> {exercise.explanation}</p>
                <button className="secondary-button" onClick={() => onPractice(topic)}>
                  Practicar este tema <ArrowRight size={15} />
                </button>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
