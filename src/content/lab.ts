/**
 * Entradas y observaciones didácticas. Los diagnósticos se calculan por separado.
 * La entrada original se mantiene intacta para compararla con una propuesta.
 */
export const ORIGINAL_SQL = `INSERT INTO Usuarios (Usuario, nombre, perfil, clave, estado)
SELECT
    left(nombre, 1) + apellido,
    nombre + apellido,
    CASE WHEN departamento == "IT" THEN 1 ELSE 0 END perfil,
    generaClave(nombre, edad) clave,
    1)`;

/**
 * Corrección editorial para el dialecto educativo de docs/sql-dialect.md.
 * Su aceptación sintáctica se comprueba en tests; los nombres y tipos necesitan catálogo.
 */
export const CORRECTED_SQL = `INSERT INTO Usuarios (Usuario, nombre, perfil, clave, estado)
SELECT
    left(nombre, 1) + apellido,
    nombre + apellido,
    CASE WHEN departamento = 'IT' THEN 1 ELSE 0 END perfil,
    generaClave(nombre, edad) clave,
    1`;

export interface SqlExample {
  id: string;
  title: string;
  description: string;
  sql: string;
}

export const EXAMPLES: readonly SqlExample[] = [
  {
    id: "original",
    title: "Caso de la pizarra",
    description:
      "Entrada original del caso universitario, conservada sin cambios.",
    sql: ORIGINAL_SQL,
  },
  {
    id: "select-basico",
    title: "SELECT básico",
    description: "Explora una lista de expresiones, literales y un alias.",
    sql: `SELECT 1 AS numero, 'Hola' AS saludo`,
  },
  {
    id: "insert-select",
    title: "INSERT con SELECT",
    description: "Compara columnas de destino y expresiones de origen.",
    sql: `INSERT INTO Usuarios (Usuario, nombre, perfil, clave, estado)
SELECT 'ana', 'Ana', 1, 'clave-de-ejemplo', 1`,
  },
  {
    id: "propuesta-corregida",
    title: "Propuesta de corrección",
    description:
      "Versión separada con =, comillas simples y sin el paréntesis final.",
    sql: CORRECTED_SQL,
  },
];

export interface StudyNote {
  id: string;
  title: string;
  description: string;
}

/** Observaciones del material de referencia, no diagnósticos calculados. */
export const REFERENCE_NOTES: readonly StudyNote[] = [
  {
    id: "igualdad",
    title: "Igualdad: =",
    description:
      "El dialecto propuesto usa = para comparar. == queda fuera de su definición.",
  },
  {
    id: "texto",
    title: "Texto entre comillas simples",
    description:
      "La propuesta escribe el texto como 'IT'. Las comillas dobles no forman literales de texto en este subconjunto.",
  },
  {
    id: "parentesis",
    title: "Un cierre necesita una apertura",
    description:
      "El paréntesis que sigue al último 1 no tiene una apertura correspondiente en el caso de referencia.",
  },
];
