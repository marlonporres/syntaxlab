import { expect, it } from "vitest";
import { FORMAL_LIMITS, minimizeDFA } from "./formal";
it("aplica el límite de estados también al sumidero agregado al minimizar un AFD parcial", () => {
  const states = Array.from(
    { length: FORMAL_LIMITS.dfaStates },
    (_, i) => `s${i}`,
  );
  const machine = {
    states,
    alphabet: ["a"],
    start: states[0],
    accepting: [states.at(-1)!],
    transitions: states
      .slice(0, -1)
      .map((from, i) => ({ from, symbol: "a", to: states[i + 1] })),
  };
  expect(() => minimizeDFA(machine)).toThrow(/sumidero/);
});
