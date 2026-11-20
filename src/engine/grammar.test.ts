import { describe, expect, it } from "vitest";
import {
  applyProduction,
  findDerivation,
  formatForm,
  formatProduction,
  GRAMMAR_LIMITS,
  parseGrammar,
  tokenizeTarget,
} from "./grammar";
import type { Grammar, GrammarDerivationStep } from "./grammar";

function grammar(source: string): Grammar {
  const parsed = parseGrammar(source);
  expect(
    parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
  ).toEqual([]);
  expect(parsed.grammar).not.toBeNull();
  return parsed.grammar!;
}

function checkSteps(
  value: Grammar,
  steps: GrammarDerivationStep[],
  direction: "left" | "right",
  initial = [value.start],
) {
  let form = initial;
  for (const step of steps) {
    expect(step.before).toEqual(form);
    const result = applyProduction(
      value,
      form,
      step.index,
      step.productionId,
      direction,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.step).toEqual(step);
      form = result.form;
    }
  }
  return form;
}

describe("CFG definition", () => {
  it("parses rules and alternatives without treating epsilon as a terminal", () => {
    const result = grammar("# comentario\r\nS -> a S b | ε\r\nA -> x");
    expect(result.start).toBe("S");
    expect(result.nonterminals).toEqual(["S", "A"]);
    expect(result.terminals).toEqual(["a", "b", "x"]);
    expect(result.productions.map((production) => production.right)).toEqual([
      ["a", "S", "b"],
      [],
      ["x"],
    ]);
    expect(result.productions[0].line).toBe(2);
    expect(formatProduction(result.productions[1])).toBe("S → ε");
    expect(formatForm([])).toBe("ε");
    expect(tokenizeTarget("ε")).toEqual([]);
    expect(tokenizeTarget("")).toEqual([]);
    expect(tokenizeTarget(" a   b \n c ")).toEqual(["a", "b", "c"]);
  });

  it("accepts the Unicode arrow and independently defined multi-character symbols", () => {
    const result = grammar(
      "Expr → Term Tail\nTail -> + Term Tail | ε\nTerm -> number",
    );
    expect(result.nonterminals).toEqual(["Expr", "Tail", "Term"]);
    expect(result.terminals).toEqual(["+", "number"]);
    expect(findDerivation(result, "number + number", "left").status).toBe(
      "found",
    );
  });

  it("uses whitespace as the symbol separator without silently splitting compact strings", () => {
    const value = grammar("S -> aSb");
    expect(value.terminals).toEqual(["aSb"]);
    expect(findDerivation(value, "aSb", "left").status).toBe("found");
    expect(findDerivation(value, "a S b", "left").status).toBe("not-found");
  });

  it.each([
    ["", "GR_EMPTY"],
    ["# solo comentario", "GR_EMPTY"],
    ["S a b", "GR_INVALID_RULE"],
    ["s -> a", "GR_INVALID_RULE"],
    ["S A -> a", "GR_INVALID_RULE"],
    ["S ->", "GR_EMPTY_ALTERNATIVE"],
    ["S -> a |", "GR_EMPTY_ALTERNATIVE"],
    ["S -> | a", "GR_EMPTY_ALTERNATIVE"],
    ["S -> ε a", "GR_INVALID_SYMBOL"],
    ["S -> a -> b", "GR_INVALID_SYMBOL"],
    ["S -> A", "GR_UNDEFINED_NONTERMINAL"],
    ["S -> a Missing", "GR_UNDEFINED_NONTERMINAL"],
  ])("rejects an invalid definition: %s", (source, code) => {
    const result = parseGrammar(source);
    expect(result.grammar).toBeNull();
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === code && diagnostic.severity === "error",
      ),
    ).toBe(true);
    expect(result.diagnostics.every((diagnostic) => diagnostic.line >= 1)).toBe(
      true,
    );
  });

  it("detects duplicate alternatives but preserves a usable grammar", () => {
    const result = parseGrammar("S -> a | a | ε\nS -> ε");
    expect(result.grammar?.productions).toHaveLength(2);
    expect(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.code === "GR_DUPLICATE",
      ),
    ).toHaveLength(2);
  });

  it("computes productivity and reachability by graph relationships, including indirect cycles", () => {
    const result = parseGrammar("S -> A\nA -> B\nB -> A\nU -> u");
    expect(result.grammar).not.toBeNull();
    expect(
      result.diagnostics
        .filter((diagnostic) => diagnostic.code === "GR_NONPRODUCTIVE")
        .map((diagnostic) => diagnostic.message[0]),
    ).toEqual(["S", "A", "B"]);
    expect(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.code === "GR_UNREACHABLE",
      ),
    ).toHaveLength(1);
    const productive = parseGrammar("S -> A\nA -> B\nB -> A | ε");
    expect(
      productive.diagnostics.some(
        (diagnostic) => diagnostic.code === "GR_NONPRODUCTIVE",
      ),
    ).toBe(false);
  });

  it("enforces source, production and right-hand-side limits", () => {
    expect(
      parseGrammar("a".repeat(GRAMMAR_LIMITS.sourceLength + 1)).diagnostics[0]
        .code,
    ).toBe("GR_SOURCE_LIMIT");
    expect(
      parseGrammar(
        `S -> ${Array.from({ length: GRAMMAR_LIMITS.productions + 1 }, (_, index) => `t${index}`).join(" | ")}`,
      ).diagnostics.some(
        (diagnostic) => diagnostic.code === "GR_PRODUCTION_LIMIT",
      ),
    ).toBe(true);
    expect(
      parseGrammar(`S -> ${"a ".repeat(GRAMMAR_LIMITS.rightSymbols + 1)}`)
        .diagnostics[0].code,
    ).toBe("GR_RIGHT_LIMIT");
  });
});

describe("real production application", () => {
  const value = grammar("S -> A B\nA -> a | ε\nB -> b B | b");

  it("substitutes one selected nonterminal, preserves terminals, and never mutates inputs", () => {
    const form = ["a", "A", "b", "B"];
    const before = [...form];
    const production = value.productions.find(
      (item) => item.left === "A" && item.right.length === 0,
    )!;
    const result = applyProduction(value, form, 1, production.id, "left");
    expect(form).toEqual(before);
    expect(result).toMatchObject({
      ok: true,
      form: ["a", "b", "B"],
      step: { index: 1, before, after: ["a", "b", "B"], rule: "A → ε" },
    });
    expect(production.right).toEqual([]);
  });

  it("checks leftmost/rightmost position and allows either position in free mode", () => {
    const a = value.productions.find((item) => item.left === "A")!;
    const b = value.productions.find((item) => item.left === "B")!;
    expect(applyProduction(value, ["A", "B"], 1, b.id, "left")).toMatchObject({
      ok: false,
      code: "STEP_DIRECTION",
    });
    expect(applyProduction(value, ["A", "B"], 0, a.id, "right")).toMatchObject({
      ok: false,
      code: "STEP_DIRECTION",
    });
    expect(applyProduction(value, ["A", "B"], 0, a.id, "free").ok).toBe(true);
    expect(applyProduction(value, ["A", "B"], 1, b.id, "free").ok).toBe(true);
  });

  it("validates production identity and its left side rather than accepting any stored sequence", () => {
    const a = value.productions.find((item) => item.left === "A")!;
    const b = value.productions.find((item) => item.left === "B")!;
    expect(applyProduction(value, ["A", "B"], 0, b.id, "left")).toMatchObject({
      ok: false,
      code: "STEP_LEFT_MISMATCH",
    });
    expect(
      applyProduction(value, ["A", "B"], 0, "inventada", "left"),
    ).toMatchObject({ ok: false, code: "STEP_UNKNOWN_PRODUCTION" });
    expect(applyProduction(value, ["A", "B"], 0, a.id, "left").ok).toBe(true);
    expect(
      applyProduction(
        value,
        ["A", "B"],
        0,
        value.productions.find(
          (item) => item.left === "A" && item.right.length === 0,
        )!.id,
        "left",
      ).ok,
    ).toBe(true);
  });

  it.each([-1, 9, 0.5, Number.NaN])(
    "rejects a missing or invalid selection: %s",
    (index) => {
      expect(
        applyProduction(value, ["A"], index, value.productions[0].id, "free"),
      ).toMatchObject({ ok: false, code: "STEP_SELECTION" });
    },
  );

  it("rejects terminal expansion, unknown symbols and oversized sentential forms", () => {
    expect(
      applyProduction(value, ["a"], 0, value.productions[0].id, "free"),
    ).toMatchObject({ ok: false, code: "STEP_TERMINAL" });
    expect(
      applyProduction(value, ["Z"], 0, value.productions[0].id, "free"),
    ).toMatchObject({ ok: false, code: "STEP_INVALID_FORM" });
    expect(
      applyProduction(
        value,
        Array(GRAMMAR_LIMITS.formSymbols + 1).fill("A"),
        0,
        value.productions[1].id,
        "free",
      ),
    ).toMatchObject({ ok: false, code: "STEP_INVALID_FORM" });
    const grows = grammar("S -> S S | a");
    expect(
      applyProduction(
        grows,
        Array(GRAMMAR_LIMITS.formSymbols).fill("S"),
        0,
        grows.productions[0].id,
        "left",
      ),
    ).toMatchObject({ ok: false, code: "STEP_FORM_LIMIT" });
  });
});

describe("computed derivation search", () => {
  it.each(["left", "right"] as const)(
    "constructs a valid %s derivation including recursion and epsilon",
    (direction) => {
      const value = grammar("S -> a S b | ε");
      const result = findDerivation(value, "a a b b", direction);
      expect(result.status).toBe("found");
      expect(result.forms).toEqual([
        ["S"],
        ["a", "S", "b"],
        ["a", "a", "S", "b", "b"],
        ["a", "a", "b", "b"],
      ]);
      expect(checkSteps(value, result.steps, direction)).toEqual([
        "a",
        "a",
        "b",
        "b",
      ]);
      expect(result.steps).toHaveLength(3);
    },
  );

  it("computes different expansion orders that reach the same terminal target", () => {
    const value = grammar("S -> A B\nA -> a\nB -> b");
    const left = findDerivation(value, "a b", "left");
    const right = findDerivation(value, "a b", "right");
    expect(left.status).toBe("found");
    expect(right.status).toBe("found");
    expect(left.steps.map((step) => step.rule)).toEqual([
      "S → A B",
      "A → a",
      "B → b",
    ]);
    expect(right.steps.map((step) => step.rule)).toEqual([
      "S → A B",
      "B → b",
      "A → a",
    ]);
    expect(checkSteps(value, left.steps, "left")).toEqual(
      checkSteps(value, right.steps, "right"),
    );
  });

  it("finds a next step from an arbitrary valid current form", () => {
    const value = grammar("S -> a S b | ε");
    const result = findDerivation(value, "a a b b", "left", {
      initialForm: ["a", "S", "b"],
    });
    expect(result.status).toBe("found");
    expect(result.forms[0]).toEqual(["a", "S", "b"]);
    expect(result.steps[0].index).toBe(1);
    expect(checkSteps(value, result.steps, "left", result.forms[0])).toEqual([
      "a",
      "a",
      "b",
      "b",
    ]);
  });

  it("allows alternative valid derivations and does not depend on a reference solution", () => {
    const value = grammar("S -> A | B\nA -> a\nB -> a");
    const fromA = findDerivation(value, "a", "left", { initialForm: ["A"] });
    const fromB = findDerivation(value, "a", "left", { initialForm: ["B"] });
    expect(fromA.status).toBe("found");
    expect(fromB.status).toBe("found");
    expect(fromA.steps[0].rule).toBe("A → a");
    expect(fromB.steps[0].rule).toBe("B → a");
  });

  it("handles empty objectives, already completed forms, cycles and impossible terminal order", () => {
    const value = grammar("S -> S | a S b | ε");
    expect(findDerivation(value, "", "left").forms.at(-1)).toEqual([]);
    const completed = findDerivation(value, "a b", "left", {
      initialForm: ["a", "b"],
    });
    expect(completed.status).toBe("found");
    expect(completed.steps).toEqual([]);
    expect(findDerivation(value, "b a", "left").status).toBe("not-found");
    expect(findDerivation(grammar("S -> S"), "", "left").status).toBe(
      "not-found",
    );
  });

  it("rejects targets with nonterminals or unknown terminals without claiming a search solution", () => {
    const value = grammar("S -> a");
    expect(findDerivation(value, "S", "left").status).toBe("not-found");
    expect(findDerivation(value, "z", "left").status).toBe("not-found");
    expect(
      findDerivation(value, "a", "left", { initialForm: ["Unknown"] }).status,
    ).toBe("not-found");
  });

  it("distinguishes a resource limit from a proof that the target cannot be derived", () => {
    const value = grammar("S -> a S b | ε");
    const depth = findDerivation(value, "a a b b", "left", { maxDepth: 1 });
    expect(depth.status).toBe("limit");
    expect(depth.message).toContain("no demuestra");
    expect(findDerivation(value, "a b", "left", { maxStates: 1 }).status).toBe(
      "limit",
    );
    expect(findDerivation(value, "a b", "left", { maxSymbols: 1 }).status).toBe(
      "limit",
    );
    expect(
      findDerivation(
        value,
        Array(GRAMMAR_LIMITS.formSymbols + 1).fill("a"),
        "left",
      ).status,
    ).toBe("limit");
  });

  it("does not allow search options to exceed the hard resource bounds", () => {
    const value = grammar("S -> S S | a");
    const result = findDerivation(value, Array(20).fill("a"), "left", {
      maxStates: 1_000_000,
      maxDepth: 1_000_000,
      maxSymbols: 1_000_000,
    });
    expect(result.visited).toBeLessThanOrEqual(GRAMMAR_LIMITS.searchStates);
    if (result.status === "found")
      expect(result.steps.length).toBeLessThanOrEqual(
        GRAMMAR_LIMITS.searchDepth,
      );
    else expect(result.status).toBe("limit");
  });
});
