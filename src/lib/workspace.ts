export type WorkspaceState = {
  version: 1;
  sql: string;
  exampleId: string;
  fontSize: number;
  inspectorOpen: boolean;
  sidebarOpen: boolean;
  panelWidth: number;
};

export const STORAGE_KEY = "syntaxlab.workspace.v1";

export function createWorkspace(
  sql: string,
  exampleId = "custom",
): WorkspaceState {
  return {
    version: 1,
    sql,
    exampleId,
    fontSize: 14,
    inspectorOpen: true,
    sidebarOpen: true,
    panelWidth: 36,
  };
}

function inRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

/** Recover valid fields independently so one damaged preference does not discard the student's SQL. */
export function readWorkspace(
  storage: Pick<Storage, "getItem">,
  fallback: WorkspaceState,
): WorkspaceState {
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored === null) return fallback;

    const data: unknown = JSON.parse(stored);
    if (typeof data !== "object" || data === null || Array.isArray(data))
      return fallback;

    const candidate = data as Record<string, unknown>;
    if (candidate.version !== 1) return fallback;

    return {
      version: 1,
      sql: typeof candidate.sql === "string" ? candidate.sql : fallback.sql,
      exampleId:
        typeof candidate.exampleId === "string"
          ? candidate.exampleId
          : fallback.exampleId,
      fontSize: inRange(candidate.fontSize, 12, 20)
        ? candidate.fontSize
        : fallback.fontSize,
      inspectorOpen:
        typeof candidate.inspectorOpen === "boolean"
          ? candidate.inspectorOpen
          : fallback.inspectorOpen,
      sidebarOpen:
        typeof candidate.sidebarOpen === "boolean"
          ? candidate.sidebarOpen
          : fallback.sidebarOpen,
      panelWidth: inRange(candidate.panelWidth, 28, 48)
        ? candidate.panelWidth
        : fallback.panelWidth,
    };
  } catch {
    // Browser privacy settings and full or inaccessible storage must not prevent editing.
    return fallback;
  }
}

export function saveWorkspace(
  storage: Pick<Storage, "setItem">,
  state: WorkspaceState,
): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Text statistics only; characters count JavaScript UTF-16 code units, not SQL tokens. */
export function inspectInput(sql: string): {
  lines: number;
  characters: number;
  nonEmpty: boolean;
} {
  return {
    lines: sql.split(/\r\n|\r|\n/).length,
    characters: sql.length,
    nonEmpty: sql.trim().length > 0,
  };
}
