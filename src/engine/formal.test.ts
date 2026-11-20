import { describe, expect, it } from "vitest";
import {
  analyzeGrammar,
  compileRegex,
  FormalError,
  FORMAL_LIMITS,
  minimizeDFA,
  parseRegex,
  predictiveParse,
  simulateDFA,
  simulateNFA,
  subsetConstruction,
  thompson,
} from "./formal";
import type { DFA, Grammar } from "./formal";

function stringsThrough(alphabet: string[], maximum: number): string[] {
  const result = [""];
  let frontier = [""];
  for (let length = 1; length <= maximum; length += 1) {
    frontier = frontier.flatMap((prefix) =>
      alphabet.map((symbol) => prefix + symbol),
    );
    result.push(...frontier);
  }
  return result;
}

function expectErrorCode(action: () => unknown, code: string) {
  try {
    action();
    expect.fail(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(FormalError);
    expect((error as FormalError).code).toBe(code);
  }
}

describe("bounded regular-expression parser and Thompson construction", () => {
  it("distinguishes union, concatenation, grouping and postfix precedence", () => {
    expect(parseRegex("a|b0*")).toEqual({
      kind: "union",
      children: [
        { kind: "literal", value: "a" },
        {
          kind: "concat",
          children: [
            { kind: "literal", value: "b" },
            { kind: "star", child: { kind: "literal", value: "0" } },
          ],
        },
      ],
    });
    expect(parseRegex("(a|b)+")).toMatchObject({
      kind: "plus",
      child: { kind: "union" },
    });
    expect(parseRegex("a?")).toEqual({
      kind: "optional",
      child: { kind: "literal", value: "a" },
    });
  });

  it.each([
    "",
    "()",
    "|a",
    "a|",
    "a||b",
    "(a",
    "a)",
    "*a",
    "a**",
    "a+?",
    "a??",
    "[ab]",
    "a.b",
    "a\\b",
    "A",
    "a b",
    "a{2}",
    "^a$",
  ])(
    "rejects unsupported or malformed syntax without silently normalizing it: %s",
    (source) => expectErrorCode(() => parseRegex(source), "REGEX_SYNTAX"),
  );

  it("reports a concrete location for malformed expressions", () => {
    try {
      parseRegex("ab|");
    } catch (error) {
      expect(error).toMatchObject({ code: "REGEX_SYNTAX", index: 3 });
      expect((error as Error).message).toContain("Posición 4");
      return;
    }
    expect.fail("The empty alternative must be rejected.");
  });

  it("creates epsilon and literal edges rather than a stored acceptance result", () => {
    const literal = compileRegex("a");
    expect(literal.states).toHaveLength(2);
    expect(literal.alphabet).toEqual(["a"]);
    expect(literal.transitions).toEqual([
      { from: literal.start, to: literal.accepting[0], symbol: "a" },
    ]);
    const epsilon = compileRegex("ε");
    expect(epsilon.alphabet).toEqual([]);
    expect(epsilon.transitions).toEqual([
      { from: epsilon.start, to: epsilon.accepting[0], symbol: null },
    ]);
    expect(simulateNFA(epsilon, "").accepted).toBe(true);
    expect(simulateNFA(epsilon, "a").accepted).toBe(false);
  });

  it("terminates epsilon closures even when Thompson generates epsilon cycles", () => {
    const nfa = compileRegex("(ε|a)*");
    expect(simulateNFA(nfa, "").accepted).toBe(true);
    const trace = simulateNFA(nfa, "aaa");
    expect(trace.accepted).toBe(true);
    expect(trace.steps).toHaveLength(4);
    trace.steps.forEach((step, index) => {
      expect(new Set(step.after).size).toBe(step.after.length);
      expect(step.after.every((state) => nfa.states.includes(state))).toBe(
        true,
      );
      if (index) expect(step.before).toEqual(trace.steps[index - 1].after);
    });
  });

  it("enforces source, nesting, construction and simulation budgets", () => {
    expectErrorCode(
      () => parseRegex("a".repeat(FORMAL_LIMITS.regexLength + 1)),
      "REGEX_LENGTH",
    );
    const depth = FORMAL_LIMITS.regexDepth + 1;
    expectErrorCode(
      () => parseRegex("(".repeat(depth) + "a" + ")".repeat(depth)),
      "REGEX_DEPTH",
    );
    expectErrorCode(
      () => compileRegex("a".repeat(FORMAL_LIMITS.nfaStates / 2 + 1)),
      "NFA_LIMIT",
    );
    expectErrorCode(
      () =>
        simulateNFA(
          compileRegex("a*"),
          "a".repeat(FORMAL_LIMITS.inputLength + 1),
        ),
      "INPUT_LENGTH",
    );
    expectErrorCode(
      () => thompson({ kind: "literal", value: "A" }),
      "REGEX_LITERAL",
    );
    expectErrorCode(
      () => thompson({ kind: "union", children: [] }),
      "REGEX_AST",
    );
  });
});

describe("independent language equivalence through length four", () => {
  const patterns = [
    "ε",
    "a",
    "ab",
    "a|b",
    "a*",
    "a+",
    "a?",
    "(a|b)*",
    "(ab|ba)+",
    "a(b|a)*b",
    "(a|ε)b?",
    "(a?b*)+",
    "(ab)*a?",
    "a|b0",
    "0(a|b)*",
    "(a|b)*abb",
    "(a|b)?a+",
    "(a|b)*0(a|b)*",
    "ε|ab",
  ];
  const inputs = stringsThrough(["a", "b", "0"], 4);

  it.each(patterns)(
    "agrees between Thompson AFN, subset AFD, minimized AFD and a separate regex oracle: %s",
    (pattern) => {
      const nfa = compileRegex(pattern),
        dfa = subsetConstruction(nfa),
        minimized = minimizeDFA(dfa);
      const oracle = new RegExp(`^(?:${pattern.replaceAll("ε", "")})$`);
      for (const input of inputs) {
        const expected = oracle.test(input);
        expect(
          simulateNFA(nfa, input).accepted,
          `AFN ${pattern} with ${JSON.stringify(input)}`,
        ).toBe(expected);
        expect(
          simulateDFA(dfa, input).accepted,
          `AFD ${pattern} with ${JSON.stringify(input)}`,
        ).toBe(expected);
        expect(
          simulateDFA(minimized, input).accepted,
          `Minimum ${pattern} with ${JSON.stringify(input)}`,
        ).toBe(expected);
      }
    },
  );

  it("records actual reachable subsets and completes transitions through the empty set", () => {
    const nfa = compileRegex("ab"),
      dfa = subsetConstruction(nfa);
    const dead = dfa.states.find((state) => dfa.stateSets[state].length === 0);
    expect(dead).toBeDefined();
    expect(Object.keys(dfa.stateSets)).toHaveLength(dfa.states.length);
    expect(dfa.transitions).toHaveLength(
      dfa.states.length * dfa.alphabet.length,
    );
    for (const state of dfa.states) {
      const members = dfa.stateSets[state];
      expect(members.every((member) => nfa.states.includes(member))).toBe(true);
      expect(dfa.accepting.includes(state)).toBe(
        members.some((member) => nfa.accepting.includes(member)),
      );
    }
    for (const symbol of dfa.alphabet)
      expect(dfa.transitions).toContainEqual({ from: dead, symbol, to: dead });
    const trace = simulateDFA(dfa, "ab");
    expect(trace.accepted).toBe(true);
    expect(trace.consumed).toBe(2);
    expect(trace.steps.map((step) => step.symbol)).toEqual([null, "a", "b"]);
    expect(trace.finalStates).toEqual(trace.steps[2].after);
  });

  it.each([
    ["a*", 1],
    ["a", 3],
    ["(a|b)*", 1],
    ["(a|b)*abb", 4],
    ["ε", 1],
  ] as const)(
    "produces the independently known minimal state count for %s",
    (pattern, count) => {
      expect(
        minimizeDFA(subsetConstruction(compileRegex(pattern))).states,
      ).toHaveLength(count);
    },
  );

  it("rejects state explosion with an explicit budget instead of continuing exponentially", () => {
    const source = "(a|b)*a" + "(a|b)".repeat(10);
    expectErrorCode(
      () => subsetConstruction(compileRegex(source)),
      "DFA_LIMIT",
    );
  });
});

describe("reachable DFA partition minimization", () => {
  it("merges equivalent reachable states and identifies removed unreachable states", () => {
    const dfa: DFA = {
      states: ["s", "a", "b", "dead", "unreachable"],
      alphabet: ["a", "b"],
      start: "s",
      accepting: ["a", "b", "unreachable"],
      transitions: [
        { from: "s", symbol: "a", to: "a" },
        { from: "s", symbol: "b", to: "b" },
        { from: "a", symbol: "a", to: "a" },
        { from: "a", symbol: "b", to: "dead" },
        { from: "b", symbol: "a", to: "a" },
        { from: "b", symbol: "b", to: "dead" },
        { from: "dead", symbol: "a", to: "dead" },
        { from: "dead", symbol: "b", to: "dead" },
        { from: "unreachable", symbol: "a", to: "unreachable" },
        { from: "unreachable", symbol: "b", to: "unreachable" },
      ],
    };
    const original = JSON.stringify(dfa),
      minimum = minimizeDFA(dfa);
    expect(minimum.states).toHaveLength(3);
    expect(minimum.mapping.a).toBe(minimum.mapping.b);
    expect(minimum.groups[minimum.mapping.a]).toEqual(["a", "b"]);
    expect(minimum.removedStates).toEqual(["unreachable"]);
    expect(minimum.mapping.unreachable).toBeUndefined();
    expect(minimum.start).toBe(minimum.mapping.s);
    for (const input of stringsThrough(["a", "b"], 4))
      expect(simulateDFA(minimum, input).accepted).toBe(
        simulateDFA(dfa, input).accepted,
      );
    expect(JSON.stringify(dfa)).toBe(original);
  });

  it("completes a partial DFA with a rejecting sink before minimization", () => {
    const partial: DFA = {
      states: ["s", "f"],
      alphabet: ["a", "b"],
      start: "s",
      accepting: ["f"],
      transitions: [
        { from: "s", symbol: "a", to: "f" },
        { from: "f", symbol: "a", to: "f" },
      ],
    };
    const minimum = minimizeDFA(partial);
    expect(minimum.generatedSink).toBeDefined();
    expect(minimum.states).toHaveLength(3);
    expect(minimum.transitions).toHaveLength(6);
    for (const input of stringsThrough(["a", "b"], 4))
      expect(simulateDFA(minimum, input).accepted).toBe(/^a+$/.test(input));
  });

  it("handles an empty alphabet and a machine with no accepting states", () => {
    const noAcceptance: DFA = {
      states: ["s", "other"],
      alphabet: ["a"],
      start: "s",
      accepting: [],
      transitions: [
        { from: "s", symbol: "a", to: "other" },
        { from: "other", symbol: "a", to: "s" },
      ],
    };
    expect(minimizeDFA(noAcceptance).states).toHaveLength(1);
    const emptyAlphabet = minimizeDFA({
      states: ["s", "u"],
      alphabet: [],
      start: "s",
      accepting: ["s", "u"],
      transitions: [],
    });
    expect(emptyAlphabet.states).toHaveLength(1);
    expect(emptyAlphabet.removedStates).toEqual(["u"]);
    expect(simulateDFA(emptyAlphabet, "").accepted).toBe(true);
  });

  it("rejects malformed automata and nondeterministic DFA transitions", () => {
    expectErrorCode(
      () =>
        simulateDFA(
          {
            states: ["s"],
            alphabet: ["a"],
            start: "s",
            accepting: [],
            transitions: [
              { from: "s", symbol: "a", to: "s" },
              { from: "s", symbol: "a", to: "s" },
            ],
          },
          "a",
        ),
      "DFA_NONDETERMINISM",
    );
    expectErrorCode(
      () =>
        simulateNFA(
          {
            states: ["s"],
            alphabet: ["a"],
            start: "s",
            accepting: [],
            transitions: [{ from: "s", symbol: null, to: "missing" }],
          },
          "",
        ),
      "AUTOMATON_STATE",
    );
    const trace = simulateDFA(subsetConstruction(compileRegex("a*")), "b");
    expect(trace.accepted).toBe(false);
    expect(trace.error).toContain("alfabeto");
    expect(trace.finalStates).toEqual([]);
  });
});

const expressionGrammar: Grammar = {
  start: "E",
  productions: [
    { lhs: "E", rhs: ["T", "E'"] },
    { lhs: "E'", rhs: ["+", "T", "E'"] },
    { lhs: "E'", rhs: [] },
    { lhs: "T", rhs: ["F", "T'"] },
    { lhs: "T'", rhs: ["*", "F", "T'"] },
    { lhs: "T'", rhs: ["ε"] },
    { lhs: "F", rhs: ["(", "E", ")"] },
    { lhs: "F", rhs: ["id"] },
  ],
};

describe("CFG fixed points and predictive tables", () => {
  it("computes the standard arithmetic FIRST, FOLLOW and nullable sets", () => {
    const analysis = analyzeGrammar(expressionGrammar);
    expect(new Set(analysis.nullable)).toEqual(new Set(["E'", "T'"]));
    expect(analysis.first.E).toEqual(["(", "id"]);
    expect(analysis.first["E'"]).toEqual(["+", "ε"]);
    expect(analysis.first.T).toEqual(["(", "id"]);
    expect(analysis.first["T'"]).toEqual(["*", "ε"]);
    expect(analysis.first.F).toEqual(["(", "id"]);
    expect(new Set(analysis.follow.E)).toEqual(new Set(["$", ")"]));
    expect(new Set(analysis.follow.T)).toEqual(new Set(["$", ")", "+"]));
    expect(new Set(analysis.follow.F)).toEqual(new Set(["$", ")", "+", "*"]));
    expect(
      Object.values(analysis.follow).every((set) => !set.includes("ε")),
    ).toBe(true);
    expect(analysis.table.E.id).toEqual([0]);
    expect(analysis.table["E'"][")"]).toEqual([2]);
    expect(analysis.conflicts).toEqual([]);
    expect(analysis.isLL1).toBe(true);
  });

  it("propagates nullable, FIRST and FOLLOW through nullable chains regardless of production order", () => {
    const grammar: Grammar = {
      start: "S",
      productions: [
        { lhs: "S", rhs: ["A", "B"] },
        { lhs: "A", rhs: ["C"] },
        { lhs: "C", rhs: [] },
        { lhs: "B", rhs: ["b"] },
        { lhs: "B", rhs: [] },
      ],
    };
    const result = analyzeGrammar(grammar),
      reversed = analyzeGrammar({
        ...grammar,
        productions: [...grammar.productions].reverse(),
      });
    expect(new Set(result.nullable)).toEqual(new Set(["S", "A", "B", "C"]));
    expect(new Set(result.first.S)).toEqual(new Set(["b", "ε"]));
    expect(new Set(result.follow.A)).toEqual(new Set(["b", "$"]));
    expect(new Set(result.follow.C)).toEqual(new Set(["b", "$"]));
    expect(result.follow.B).toEqual(["$"]);
    expect(reversed.first).toEqual(result.first);
    expect(reversed.follow).toEqual(result.follow);
    expect(predictiveParse(result, []).accepted).toBe(true);
    expect(predictiveParse(result, ["b"]).accepted).toBe(true);
  });

  it("retains all candidates in FIRST/FIRST and FIRST/FOLLOW conflict cells", () => {
    const firstFirst = analyzeGrammar({
      start: "S",
      productions: [
        { lhs: "S", rhs: ["a"] },
        { lhs: "S", rhs: ["a", "b"] },
      ],
    });
    expect(firstFirst.conflicts).toEqual([
      { nonterminal: "S", lookahead: "a", productionIndices: [0, 1] },
    ]);
    expect(firstFirst.table.S.a).toEqual([0, 1]);
    expect(firstFirst.isLL1).toBe(false);
    const firstFollow = analyzeGrammar({
      start: "S",
      productions: [
        { lhs: "S", rhs: ["A", "a"] },
        { lhs: "A", rhs: ["a"] },
        { lhs: "A", rhs: [] },
      ],
    });
    expect(firstFollow.table.A.a).toEqual([1, 2]);
    expect(firstFollow.conflicts).toContainEqual({
      nonterminal: "A",
      lookahead: "a",
      productionIndices: [1, 2],
    });
    expect(predictiveParse(firstFollow, ["a"]).accepted).toBe(false);
  });

  it("terminates on direct and indirect left recursion and reports it honestly", () => {
    const direct = analyzeGrammar({
      start: "E",
      productions: [
        { lhs: "E", rhs: ["E", "+", "a"] },
        { lhs: "E", rhs: ["a"] },
      ],
    });
    expect(direct.first.E).toEqual(["a"]);
    expect(direct.leftRecursive).toEqual(["E"]);
    expect(direct.isLL1).toBe(false);
    const indirect = analyzeGrammar({
      start: "S",
      productions: [
        { lhs: "S", rhs: ["A", "c"] },
        { lhs: "A", rhs: ["B", "S"] },
        { lhs: "A", rhs: ["a"] },
        { lhs: "B", rhs: [] },
        { lhs: "B", rhs: ["b"] },
      ],
    });
    expect(new Set(indirect.leftRecursive)).toEqual(new Set(["S", "A"]));
    expect(indirect.isLL1).toBe(false);
    expect(predictiveParse(direct, ["a"]).error).toContain("LL(1)");
  });

  it("identifies unproductive cycles without inventing terminal strings", () => {
    const result = analyzeGrammar({
      start: "S",
      productions: [
        { lhs: "S", rhs: ["A"] },
        { lhs: "A", rhs: ["S"] },
      ],
    });
    expect(result.first).toEqual({ S: [], A: [] });
    expect(result.nullable).toEqual([]);
    expect(new Set(result.unproductive)).toEqual(new Set(["S", "A"]));
    expect(result.isLL1).toBe(false);
    expect(predictiveParse(result, []).accepted).toBe(false);
  });

  it("classifies nonterminals from left sides instead of guessing from capitalization", () => {
    const result = analyzeGrammar({
      start: "Query",
      productions: [
        { lhs: "Query", rhs: ["SELECT", "Value"] },
        { lhs: "Value", rhs: ["id"] },
      ],
    });
    expect(result.terminals).toEqual(["SELECT", "id"]);
    expect(predictiveParse(result, ["SELECT", "id"]).accepted).toBe(true);
  });

  it.each([
    { start: "Missing", productions: [{ lhs: "S", rhs: ["a"] }] },
    { start: "S", productions: [] },
    { start: "S", productions: [{ lhs: "S", rhs: ["ε", "a"] }] },
    { start: "S", productions: [{ lhs: "S", rhs: ["$"] }] },
    { start: "S", productions: [{ lhs: "S", rhs: ["a b"] }] },
    { start: "S", productions: [{ lhs: "S", rhs: [""] }] },
    { start: "ε", productions: [{ lhs: "ε", rhs: [] }] },
    {
      start: "S",
      productions: [
        { lhs: "S", rhs: [] },
        { lhs: "S", rhs: ["ε"] },
      ],
    },
  ])("rejects malformed grammar contracts: %j", (grammar) => {
    expect(() => analyzeGrammar(grammar)).toThrow(FormalError);
  });

  it("bounds grammar size before expensive fixed-point work", () => {
    const productions = Array.from(
      { length: FORMAL_LIMITS.grammarProductions + 1 },
      (_, index) => ({ lhs: "S", rhs: [`a${index}`] }),
    );
    expectErrorCode(
      () => analyzeGrammar({ start: "S", productions }),
      "GRAMMAR_SIZE",
    );
  });
});

describe("LL(1) predictive execution traces", () => {
  it("replays productions and terminal matches through a real predictive stack", () => {
    const analysis = analyzeGrammar(expressionGrammar),
      input = ["id", "+", "id", "*", "id"];
    const result = predictiveParse(analysis, input);
    expect(result.accepted).toBe(true);
    expect(result.consumed).toBe(input.length);
    const stack = [analysis.grammar.start, "$"],
      remaining = [...input, "$"];
    for (const step of result.trace) {
      expect(step.stack).toEqual(stack);
      expect(step.remaining).toEqual(remaining);
      if (step.productionIndex !== undefined) {
        const production = analysis.grammar.productions[step.productionIndex];
        expect(stack.shift()).toBe(production.lhs);
        stack.unshift(...production.rhs);
      } else if (step.action.startsWith("Consumir ")) {
        expect(stack.shift()).toBe(remaining.shift());
      } else {
        expect(step.action).toBe("Aceptar");
        expect(stack).toEqual(["$"]);
        expect(remaining).toEqual(["$"]);
      }
    }
    expect(input).toEqual(["id", "+", "id", "*", "id"]);
  });

  it("accepts a recursive language and epsilon without a preloaded sequence of answers", () => {
    const grammar: Grammar = {
      start: "S",
      productions: [
        { lhs: "S", rhs: ["a", "S", "b"] },
        { lhs: "S", rhs: [] },
      ],
    };
    for (let count = 0; count <= 4; count += 1)
      expect(
        predictiveParse(grammar, [...("a".repeat(count) + "b".repeat(count))])
          .accepted,
      ).toBe(true);
    for (const text of ["a", "b", "aab", "abba", "aaabbbb"]) {
      const result = predictiveParse(grammar, [...text]);
      expect(result.accepted).toBe(false);
      expect(result.error?.length).toBeGreaterThan(0);
      expect(result.trace.length).toBeGreaterThan(0);
    }
  });

  it.each(
    [["id", "+"], ["(", "id"], ["id", "id"], [], ["unknown"], ["$"], ["ε"]].map(
      (input) => ({ input }),
    ),
  )(
    "reports a meaningful failure instead of accepting an incomplete input: %j",
    ({ input }) => {
      const result = predictiveParse(expressionGrammar, input);
      expect(result.accepted).toBe(false);
      expect(result.error?.length).toBeGreaterThan(0);
    },
  );

  it("stops a huge epsilon derivation at the explicit step budget", () => {
    const grammar: Grammar = {
      start: "N0",
      productions: Array.from({ length: 13 }, (_, index) => ({
        lhs: `N${index}`,
        rhs:
          index === 12 ? [] : Array.from({ length: 5 }, () => `N${index + 1}`),
      })),
    };
    expect(analyzeGrammar(grammar).isLL1).toBe(true);
    const result = predictiveParse(grammar, []);
    expect(result.accepted).toBe(false);
    expect(result.error).toContain(`${FORMAL_LIMITS.predictiveSteps}`);
    expect(result.trace).toHaveLength(FORMAL_LIMITS.predictiveSteps + 1);
  });
});
