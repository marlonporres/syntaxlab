import type { Diagnostic, SqlToken, TokenCategory } from "./types";

export const MAX_SOURCE_LENGTH = 20_000;
export const MAX_SIGNIFICANT_TOKENS = 512;
export const MAX_TOKENS = 5_000;

const keywords = new Set([
  "INSERT",
  "INTO",
  "SELECT",
  "AS",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "AND",
  "OR",
  "NOT",
]);
const isLetter = (value: string) => /^[A-Za-z_]$/.test(value);
const isDigit = (value: string) => /^[0-9]$/.test(value);
const isTrivia = (token: SqlToken) =>
  token.category === "whitespace" || token.category === "comment";

export function lexSql(source: string): {
  tokens: SqlToken[];
  diagnostics: Diagnostic[];
} {
  const tokens: SqlToken[] = [];
  const diagnostics: Diagnostic[] = [];
  if (source.length > MAX_SOURCE_LENGTH) {
    diagnostics.push({
      phase: "lexical",
      severity: "error",
      code: "LEX_INPUT_LIMIT",
      message: `La entrada supera el límite de ${MAX_SOURCE_LENGTH.toLocaleString("es")} unidades UTF-16.`,
      start: 0,
      end: 1,
      line: 1,
      column: 1,
      hint: "Reduce el tamaño de la consulta para analizarla.",
    });
    return { tokens, diagnostics };
  }

  let index = 0;
  let line = 1;
  let column = 1;
  let significantCount = 0;
  let stopped = false;

  function emit(
    category: TokenCategory,
    end: number,
    error?: { code: string; message: string; hint?: string },
  ) {
    if (category !== "whitespace" && category !== "comment") {
      if (significantCount >= MAX_SIGNIFICANT_TOKENS) {
        diagnostics.push({
          phase: "lexical",
          severity: "error",
          code: "LEX_TOKEN_LIMIT",
          message: `La entrada supera el límite de ${MAX_SIGNIFICANT_TOKENS} tokens significativos.`,
          start: index,
          end,
          line,
          column,
          hint: "Reduce la consulta y vuelve a analizarla.",
        });
        stopped = true;
        return;
      }
      significantCount++;
    }
    const token: SqlToken = {
      id: `token-${tokens.length}`,
      category,
      lexeme: source.slice(index, end),
      start: index,
      end,
      line,
      column,
    };
    tokens.push(token);
    if (error)
      diagnostics.push({
        phase: "lexical",
        severity: "error",
        ...error,
        start: token.start,
        end,
        line,
        column,
      });
    while (index < end) {
      if (source[index] === "\r") {
        index += source[index + 1] === "\n" && index + 1 < end ? 2 : 1;
        line++;
        column = 1;
      } else if (source[index] === "\n") {
        index++;
        line++;
        column = 1;
      } else {
        index++;
        column++;
      }
    }
  }

  while (index < source.length && !stopped) {
    if (tokens.length >= MAX_TOKENS) {
      diagnostics.push({
        phase: "lexical",
        severity: "error",
        code: "LEX_TOKEN_LIMIT",
        message: `La entrada supera el límite de ${MAX_TOKENS.toLocaleString("es")} tokens, incluidos espacios y comentarios.`,
        start: index,
        end: Math.min(index + 1, source.length),
        line,
        column,
        hint: "Reduce la consulta y vuelve a analizarla.",
      });
      break;
    }
    const current = source[index];
    let end = index + 1;

    if (/\s/u.test(current)) {
      while (end < source.length && /\s/u.test(source[end])) end++;
      emit("whitespace", end);
    } else if (source.startsWith("--", index)) {
      end = index + 2;
      while (
        end < source.length &&
        source[end] !== "\r" &&
        source[end] !== "\n"
      )
        end++;
      emit("comment", end);
    } else if (source.startsWith("/*", index)) {
      const close = source.indexOf("*/", index + 2);
      if (close === -1)
        emit("invalid", source.length, {
          code: "LEX_UNTERMINATED_COMMENT",
          message: "El comentario de bloque no tiene cierre.",
          hint: "Añade */ al final del comentario.",
        });
      else emit("comment", close + 2);
    } else if (current === "'" || current === '"') {
      let closed = false;
      while (end < source.length) {
        if (source[end] === current) {
          if (source[end + 1] === current) {
            end += 2;
            continue;
          }
          end++;
          closed = true;
          break;
        }
        end++;
      }
      if (current === '"') {
        emit("invalid", end, {
          code: "LEX_DOUBLE_QUOTES",
          message: closed
            ? "Las comillas dobles no están admitidas en este dialecto."
            : "El texto con comillas dobles no está admitido y no tiene cierre.",
          hint: "Para escribir texto, utiliza comillas simples.",
        });
      } else if (!closed) {
        emit("invalid", end, {
          code: "LEX_UNTERMINATED_STRING",
          message: "El literal de texto no tiene comilla simple de cierre.",
          hint: "Cierra el texto con ' y duplica las comillas internas.",
        });
      } else emit("string", end);
    } else if (isLetter(current)) {
      while (
        end < source.length &&
        (isLetter(source[end]) || isDigit(source[end]))
      )
        end++;
      emit(
        keywords.has(source.slice(index, end).toUpperCase())
          ? "keyword"
          : "identifier",
        end,
      );
    } else if (isDigit(current)) {
      while (end < source.length && isDigit(source[end])) end++;
      if (source[end] === "." && isDigit(source[end + 1] ?? "")) {
        end++;
        while (end < source.length && isDigit(source[end])) end++;
      }
      emit("number", end);
    } else if (source.startsWith("==", index)) {
      while (source[end] === "=") end++;
      emit("invalid", end, {
        code: "LEX_UNSUPPORTED_OPERATOR",
        message:
          "El operador de igualdad del dialecto es =; la secuencia de signos = no está admitida.",
        hint: "Usa un solo signo = para comparar igualdad.",
      });
    } else if (["<>", "<=", ">="].includes(source.slice(index, index + 2))) {
      emit("operator", index + 2);
    } else if ("=<>+-*/".includes(current)) {
      emit("operator", end);
    } else if ("(),;".includes(current)) {
      emit("delimiter", end);
    } else {
      const codePoint = source.codePointAt(index)!;
      end = index + (codePoint > 0xffff ? 2 : 1);
      emit("invalid", end, {
        code: "LEX_UNKNOWN_CHARACTER",
        message: `El carácter ${JSON.stringify(source.slice(index, end))} no pertenece al dialecto.`,
      });
    }
  }

  const significant=tokens.filter(token=>!isTrivia(token));
  for (let tokenIndex = 0; tokenIndex < significant.length; tokenIndex++) {
    const token = significant[tokenIndex];
    // INTO introduces a table, even though its column list begins with '(' .
    if (token.category === "identifier" && significant[tokenIndex+1]?.lexeme === "(" && significant[tokenIndex-1]?.lexeme.toUpperCase() !== 'INTO')
      token.category = "function";
  }
  return { tokens, diagnostics };
}
