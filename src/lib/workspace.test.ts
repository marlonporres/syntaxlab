import { describe, expect, it, vi } from "vitest";
import {
  createWorkspace,
  inspectInput,
  readWorkspace,
  saveWorkspace,
  STORAGE_KEY,
} from "./workspace";

const ORIGINAL_SQL = `INSERT INTO Usuarios (Usuario, nombre, perfil, clave, estado)
SELECT
    left(nombre, 1) + apellido,
    nombre + apellido,
    CASE WHEN departamento == "IT" THEN 1 ELSE 0 END perfil,
    generaClave(nombre, edad) clave,
    1)`;

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

describe("workspace persistence", () => {
  const fallback = createWorkspace(
    "SELECT nombre FROM Usuarios;",
    "first-select",
  );

  it("creates the default preferences and retains the SQL without normalization", () => {
    expect(createWorkspace(ORIGINAL_SQL, "original")).toEqual({
      version: 1,
      sql: ORIGINAL_SQL,
      exampleId: "original",
      fontSize: 14,
      inspectorOpen: true,
      sidebarOpen: true,
      panelWidth: 36,
    });
    expect(createWorkspace("").exampleId).toBe("custom");
  });

  it("persists and restores the complete workspace, including exact original SQL", () => {
    const storage = memoryStorage();
    const state = {
      ...createWorkspace(ORIGINAL_SQL, "original"),
      fontSize: 20,
      inspectorOpen: false,
      sidebarOpen: false,
      panelWidth: 48,
    };

    expect(saveWorkspace(storage, state)).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(state);
    expect(readWorkspace(storage, fallback)).toEqual(state);
    expect(readWorkspace(storage, fallback).sql).toBe(ORIGINAL_SQL);
  });

  it("restores empty SQL and whitespace exactly instead of replacing them with the example", () => {
    const storage = memoryStorage();
    for (const sql of ["", "  \r\n\t "]) {
      saveWorkspace(storage, createWorkspace(sql));
      expect(readWorkspace(storage, fallback).sql).toBe(sql);
    }
  });

  it("uses the fallback when no workspace has been saved", () => {
    expect(readWorkspace(memoryStorage(), fallback)).toBe(fallback);
  });

  it.each([
    "{broken",
    "null",
    "[]",
    "true",
    "42",
    '"text"',
    "{}",
    '{"version":2}',
  ])("recovers safely from malformed or unsupported data: %s", (stored) => {
    expect(readWorkspace({ getItem: () => stored }, fallback)).toBe(fallback);
  });

  it("recovers damaged preferences individually and preserves the student SQL", () => {
    const stored = JSON.stringify({
      version: 1,
      sql: ORIGINAL_SQL,
      exampleId: "original",
      fontSize: 200,
      inspectorOpen: "false",
      sidebarOpen: false,
      panelWidth: -1,
      ignored: "not part of the workspace",
    });

    expect(readWorkspace({ getItem: () => stored }, fallback)).toEqual({
      ...fallback,
      sql: ORIGINAL_SQL,
      exampleId: "original",
      sidebarOpen: false,
    });
  });

  it("falls back for missing fields and incorrect field types", () => {
    const stored = JSON.stringify({
      version: 1,
      sql: 123,
      exampleId: null,
      fontSize: "16",
      panelWidth: "40",
    });
    expect(readWorkspace({ getItem: () => stored }, fallback)).toEqual(
      fallback,
    );
  });

  it.each([
    { fontSize: 12, panelWidth: 28 },
    { fontSize: 20, panelWidth: 48 },
  ])("accepts both range boundaries: %o", (preferences) => {
    const stored = JSON.stringify({ ...fallback, ...preferences });
    expect(readWorkspace({ getItem: () => stored }, fallback)).toEqual({
      ...fallback,
      ...preferences,
    });
  });

  it.each([
    { fontSize: 11, panelWidth: 27 },
    { fontSize: 21, panelWidth: 49 },
  ])("rejects values outside the supported ranges: %o", (preferences) => {
    const stored = JSON.stringify({ ...fallback, ...preferences });
    expect(readWorkspace({ getItem: () => stored }, fallback)).toEqual(
      fallback,
    );
  });

  it("keeps editing available when browser storage cannot be read", () => {
    const getItem = vi.fn(() => {
      throw new Error("Storage unavailable");
    });
    expect(readWorkspace({ getItem }, fallback)).toBe(fallback);
    expect(getItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("reports failed saves without throwing or mutating the workspace", () => {
    const setItem = vi.fn(() => {
      throw new Error("Storage quota exceeded");
    });
    const state = createWorkspace(ORIGINAL_SQL, "original");
    const before = { ...state };

    expect(saveWorkspace({ setItem }, state)).toBe(false);
    expect(state).toEqual(before);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(state));
  });
});

describe("input statistics", () => {
  it("counts the empty editor as one line without reporting input", () => {
    expect(inspectInput("")).toEqual({
      lines: 1,
      characters: 0,
      nonEmpty: false,
    });
  });

  it("recognizes whitespace as empty while preserving its text statistics", () => {
    expect(inspectInput("  \t\n  ")).toEqual({
      lines: 2,
      characters: 6,
      nonEmpty: false,
    });
  });

  it("handles LF, CRLF, CR and a trailing line break", () => {
    expect(inspectInput("a\r\nb\nc\r")).toEqual({
      lines: 4,
      characters: 7,
      nonEmpty: true,
    });
  });

  it("counts UTF-16 code units and never interprets or normalizes SQL", () => {
    expect(inspectInput('SELECT "😀";')).toEqual({
      lines: 1,
      characters: 12,
      nonEmpty: true,
    });
    expect(inspectInput(ORIGINAL_SQL)).toEqual({
      lines: 7,
      characters: ORIGINAL_SQL.length,
      nonEmpty: true,
    });
  });
});
