import { describe, expect, it } from "vitest";
import {
  lexSql,
  MAX_SIGNIFICANT_TOKENS,
  MAX_SOURCE_LENGTH,
  MAX_TOKENS,
} from "./lexer";

describe("educational SQL lexer", () => {
  it("preserves exact lexemes and contiguous UTF-16 ranges including trivia", () => {
    const source =
      "select _name, left /*why*/ (nombre, 1.25) -- final\r\n 'O''Brien';";
    const { tokens, diagnostics } = lexSql(source);
    expect(diagnostics).toEqual([]);
    expect(tokens.map((token) => token.lexeme).join("")).toBe(source);
    expect(tokens[0]).toMatchObject({
      category: "keyword",
      lexeme: "select",
      start: 0,
      end: 6,
      line: 1,
      column: 1,
    });
    tokens.forEach((token, index) => {
      expect(token.lexeme).toBe(source.slice(token.start, token.end));
      expect(token.start).toBe(index ? tokens[index - 1].end : 0);
      expect(token.id).toBe(`token-${index}`);
    });
    expect(tokens.find((token) => token.lexeme === "left")?.category).toBe(
      "function",
    );
    expect(tokens.find((token) => token.lexeme === "1.25")?.category).toBe(
      "number",
    );
    expect(
      tokens.find((token) => token.lexeme === "'O''Brien'")?.category,
    ).toBe("string");
    expect(tokens.at(-1)?.end).toBe(source.length);
  });

  it("tracks CRLF, LF and CR as one line break with one-based UTF-16 columns", () => {
    const { tokens } = lexSql("a\r\nb\nc\rd 😀 z");
    expect(
      tokens
        .filter((token) => token.category !== "whitespace")
        .map(({ lexeme, line, column, start, end }) => ({
          lexeme,
          line,
          column,
          start,
          end,
        })),
    ).toEqual([
      { lexeme: "a", line: 1, column: 1, start: 0, end: 1 },
      { lexeme: "b", line: 2, column: 1, start: 3, end: 4 },
      { lexeme: "c", line: 3, column: 1, start: 5, end: 6 },
      { lexeme: "d", line: 4, column: 1, start: 7, end: 8 },
      { lexeme: "😀", line: 4, column: 3, start: 9, end: 11 },
      { lexeme: "z", line: 4, column: 6, start: 12, end: 13 },
    ]);
  });

  it("recognizes keywords case-insensitively without consuming identifier prefixes", () => {
    const { tokens } = lexSql(
      "SeLeCt select_value SELECTOR _value1 case when then else end AND or NOT insert into AS",
    );
    expect(
      tokens
        .filter((token) => token.category !== "whitespace")
        .map((token) => token.category),
    ).toEqual([
      "keyword",
      "identifier",
      "identifier",
      "identifier",
      "keyword",
      "keyword",
      "keyword",
      "keyword",
      "keyword",
      "keyword",
      "keyword",
      "keyword",
      "keyword",
      "keyword",
      "keyword",
    ]);
  });

  it("chooses the longest supported operator and keeps unary signs separate", () => {
    const { tokens, diagnostics } = lexSql("= <> <= >= < > + - * / -12 +0.5");
    expect(diagnostics).toEqual([]);
    expect(
      tokens
        .filter((token) => token.category !== "whitespace")
        .map((token) => [token.lexeme, token.category]),
    ).toEqual([
      ...["=", "<>", "<=", ">=", "<", ">", "+", "-", "*", "/", "-"].map(
        (operator) => [operator, "operator"],
      ),
      ["12", "number"],
      ["+", "operator"],
      ["0.5", "number"],
    ]);
  });

  it("recognizes function lookahead across spaces and comments but retains identifiers", () => {
    const { tokens } = lexSql(
      "plain left --note\n (a) other /*note*/ (b) SELECT (1)",
    );
    expect(
      tokens
        .filter((token) =>
          ["plain", "left", "other", "a", "b", "SELECT"].includes(token.lexeme),
        )
        .map((token) => [token.lexeme, token.category]),
    ).toEqual([
      ["plain", "identifier"],
      ["left", "function"],
      ["a", "identifier"],
      ["other", "function"],
      ["b", "identifier"],
      ["SELECT", "keyword"],
    ]);
  });

  it.each(["==", "===", "====="])(
    "emits one invalid token and diagnostic for unsupported equality %s",
    (operator) => {
      const { tokens, diagnostics } = lexSql(`a ${operator} b`);
      expect(tokens.find((token) => token.lexeme === operator)).toMatchObject({
        category: "invalid",
        start: 2,
        end: 2 + operator.length,
      });
      expect(diagnostics).toMatchObject([
        {
          code: "LEX_UNSUPPORTED_OPERATOR",
          start: 2,
          end: 2 + operator.length,
          line: 1,
          column: 3,
        },
      ]);
    },
  );

  it("consumes a complete unsupported double-quoted literal, including escaped quotes", () => {
    const { tokens, diagnostics } = lexSql('SELECT "a""b", "IT"');
    expect(
      tokens
        .filter((token) => token.category === "invalid")
        .map((token) => token.lexeme),
    ).toEqual(['"a""b"', '"IT"']);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "LEX_DOUBLE_QUOTES",
      "LEX_DOUBLE_QUOTES",
    ]);
  });

  it.each([
    ["'open", "LEX_UNTERMINATED_STRING"],
    ["/* open", "LEX_UNTERMINATED_COMMENT"],
    ['"open', "LEX_DOUBLE_QUOTES"],
  ])(
    "diagnoses unterminated input without dropping text: %s",
    (source, code) => {
      const { tokens, diagnostics } = lexSql(source);
      expect(tokens).toMatchObject([
        { category: "invalid", lexeme: source, start: 0, end: source.length },
      ]);
      expect(diagnostics).toMatchObject([
        {
          phase: "lexical",
          severity: "error",
          code,
          start: 0,
          end: source.length,
        },
      ]);
    },
  );

  it("handles empty and multiline strings and terminates block comments at the first close", () => {
    const { tokens, diagnostics } = lexSql(
      "'' 'a\r\nb' /* first /* inner */ SELECT",
    );
    expect(diagnostics).toEqual([]);
    expect(
      tokens
        .filter((token) => token.category !== "whitespace")
        .map((token) => [token.lexeme, token.category, token.line]),
    ).toEqual([
      ["''", "string", 1],
      ["'a\r\nb'", "string", 1],
      ["/* first /* inner */", "comment", 2],
      ["SELECT", "keyword", 2],
    ]);
  });

  it("rejects unknown Unicode code points once and does not accept incomplete decimal forms", () => {
    const { tokens, diagnostics } = lexSql("ñ 😀 @ .5 1. 1..2");
    expect(
      tokens
        .filter((token) => token.category === "invalid")
        .map((token) => token.lexeme),
    ).toEqual(["ñ", "😀", "@", ".", ".", ".", "."]);
    expect(
      tokens
        .filter((token) => token.category === "number")
        .map((token) => token.lexeme),
    ).toEqual(["5", "1", "1", "2"]);
    expect(diagnostics).toHaveLength(7);
    expect(
      diagnostics.every(
        (diagnostic) => diagnostic.code === "LEX_UNKNOWN_CHARACTER",
      ),
    ).toBe(true);
  });

  it("bounds oversized source before scanning and allows the exact length limit", () => {
    expect(lexSql(" ".repeat(MAX_SOURCE_LENGTH)).diagnostics).toEqual([]);
    const result = lexSql("x".repeat(MAX_SOURCE_LENGTH + 1));
    expect(result.tokens).toEqual([]);
    expect(result.diagnostics).toMatchObject([
      { code: "LEX_INPUT_LIMIT", start: 0, end: 1 },
    ]);
  });

  it("bounds significant tokens while excluding whitespace and comments", () => {
    const source = "x ".repeat(MAX_SIGNIFICANT_TOKENS + 1);
    const { tokens, diagnostics } = lexSql(source);
    expect(
      tokens.filter((token) => token.category !== "whitespace"),
    ).toHaveLength(MAX_SIGNIFICANT_TOKENS);
    expect(diagnostics).toMatchObject([
      {
        code: "LEX_TOKEN_LIMIT",
        start: MAX_SIGNIFICANT_TOKENS * 2,
        end: MAX_SIGNIFICANT_TOKENS * 2 + 1,
      },
    ]);
    expect(
      lexSql("x /* comment */ ".repeat(MAX_SIGNIFICANT_TOKENS)).diagnostics,
    ).toEqual([]);
  });

  it("also bounds total trivia tokens and reports the first unscanned position", () => {
    const source = " /**/".repeat(MAX_TOKENS / 2 + 1);
    const { tokens, diagnostics } = lexSql(source);
    expect(tokens).toHaveLength(MAX_TOKENS);
    expect(diagnostics).toMatchObject([
      {
        code: "LEX_TOKEN_LIMIT",
        start: (MAX_TOKENS / 2) * 5,
        end: (MAX_TOKENS / 2) * 5 + 1,
        line: 1,
        column: (MAX_TOKENS / 2) * 5 + 1,
      },
    ]);
    expect(lexSql(" /**/".repeat(MAX_TOKENS / 2)).diagnostics).toEqual([]);
  });
});
