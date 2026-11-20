import { analyzeSql } from "./sql/analyze";

export interface Exercise {
  id: string;
  topic: string;
  level: "Inicial" | "Intermedio";
  objective: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  hint: string;
  reasoning: string;
  snippet?: string;
}
type Pair = [
  string,
  string,
  [string, string, string],
  number,
  string,
  string,
  string?,
];
const exercises: Exercise[] = [];
function add(topic: string, objective: string, first: Pair, second: Pair) {
  for (const [index, pair] of [first, second].entries())
    exercises.push({
      id: `topic-${exercises.length + 1}`,
      topic,
      level: index === 0 ? "Inicial" : "Intermedio",
      objective,
      question: pair[0],
      hint: pair[1],
      options: pair[2],
      correct: pair[3],
      explanation: pair[4],
      reasoning: pair[5],
      snippet: pair[6],
    });
}
add(
  "Identificación de tokens",
  "Relacionar lexemas y categorías del lexer.",
  [
    "¿Qué categoría tiene SELECT?",
    "Una palabra del vocabulario fijo del lenguaje.",
    ["Identificador", "Palabra reservada", "Literal de texto"],
    1,
    "SELECT pertenece al vocabulario reservado del dialecto.",
    "¿El estudiante puede elegir ese nombre libremente?",
    "SELECT 12",
  ],
  [
    "¿Qué token contiene una comilla interna escapada?",
    "Dos comillas simples internas representan una comilla dentro del mismo literal.",
    [
      "'O''Brien' es un solo texto",
      "Son dos identificadores",
      "Es un operador",
    ],
    0,
    "El lexer reconoce 'O''Brien' completo y el AST conserva el valor O'Brien.",
    "¿Dónde comienza y dónde termina el literal?",
    "SELECT 'O''Brien'",
  ],
);
add(
  "Clasificación de símbolos",
  "Distinguir terminales y no terminales.",
  [
    "En S → a S b, ¿cuál es no terminal?",
    "Un no terminal puede sustituirse usando una producción.",
    ["a", "S", "b"],
    1,
    "S aparece a la izquierda de una producción; a y b son terminales.",
    "¿Qué símbolo puede expandirse otra vez?",
  ],
  [
    "¿Qué representa ε en una producción?",
    "No agrega un carácter a la cadena.",
    ["Un terminal llamado epsilon", "Una variable nueva", "La cadena vacía"],
    2,
    "ε representa una secuencia de longitud cero.",
    "¿Cómo cambia la longitud al sustituir S por ε?",
  ],
);
add(
  "Construcción de producciones",
  "Aplicar el reemplazo de un único no terminal.",
  [
    "Con S → a S b y S → ε, ¿qué se obtiene al expandir S una vez con la primera regla?",
    "Reemplaza todo el símbolo seleccionado por el lado derecho.",
    ["a S b", "a b S", "S a b"],
    0,
    "La producción reemplaza S por a S b, en ese orden.",
    "¿Puedes alterar el orden de los símbolos de la regla?",
  ],
  [
    "En a S b, ¿qué resulta al aplicar S → ε?",
    "Los terminales que rodean a S permanecen.",
    ["ε", "a b", "a S b"],
    1,
    "Solo desaparece el no terminal seleccionado. La forma resultante es a b.",
    "¿La producción reemplaza toda la forma sentencial o solo S?",
  ],
);
add(
  "Recursividad en gramáticas",
  "Reconocer reglas recursivas y casos base.",
  [
    "¿Cuál producción es recursiva?",
    "Busca el símbolo de la izquierda dentro del lado derecho.",
    ["S → a", "S → ε", "S → a S b"],
    2,
    "S → a S b vuelve a introducir S; las otras alternativas pueden terminar la expansión.",
    "¿Qué regla permite repetir la estructura?",
  ],
  [
    "¿Por qué S → a S, sin otras reglas, no genera cadenas terminales finitas?",
    "Toda expansión conserva un S.",
    [
      "No existe un caso base que elimine S",
      "Porque a no es una letra",
      "Porque falta un operador SQL",
    ],
    0,
    "Siempre queda un no terminal. El sistema debe detectar que S no es productivo.",
    "¿Puede llegar a desaparecer el último no terminal?",
  ],
);
add(
  "Derivación por izquierda",
  "Elegir el no terminal situado más a la izquierda.",
  [
    "En A b B, ¿qué no terminal se expande en una derivación izquierda?",
    "Los terminales no se expanden.",
    ["B", "A", "b"],
    1,
    "Se selecciona A, el no terminal más izquierdo.",
    "¿Cuál de los símbolos es reemplazable primero?",
  ],
  [
    "En a B C, con B → b B | ε, ¿se permite B → ε en una derivación izquierda?",
    "El orden elige un símbolo, no impone una única alternativa.",
    [
      "No, siempre hay que usar la regla recursiva",
      "Sí, es una producción válida del B elegido",
      "Solo si C ya es terminal",
    ],
    1,
    "Ambas reglas de B son válidas en ese punto; la cadena objetivo puede orientar cuál conviene.",
    "¿Confundes orden de expansión con elección de producción?",
  ],
);
add(
  "Derivación por derecha",
  "Separar el orden de expansión de la cadena obtenida.",
  [
    "En A b B, ¿qué no terminal se expande por la derecha?",
    "Busca desde el extremo derecho, ignorando terminales.",
    ["B", "b", "A"],
    0,
    "B es el no terminal situado más a la derecha.",
    "¿El símbolo b puede expandirse con una producción?",
  ],
  [
    "¿Pueden izquierda y derecha producir la misma cadena terminal?",
    "Un mismo árbol puede recorrerse con órdenes de expansión distintos.",
    ["Nunca", "Solo si no hay terminales", "Sí, cambia el orden de expansión"],
    2,
    "El orden de expansión puede cambiar conservando la misma secuencia terminal.",
    "¿El orden de expandir cambia necesariamente el orden de las hojas?",
  ],
);
add(
  "Árboles sintácticos",
  "Diferenciar CST y AST y razonar sobre precedencia.",
  [
    "¿Qué estructura conserva producciones y delimitadores?",
    "Concreto significa que conserva detalles de la sintaxis.",
    ["CST", "AST", "Catálogo de tablas"],
    0,
    "El CST conserva las reglas y los terminales; el AST elimina detalles de puntuación.",
    "¿En cuál deberían aparecer comas y paréntesis?",
  ],
  [
    "En el AST de 1 + 2 * 3, ¿qué operación está más cerca de la raíz?",
    "La multiplicación se agrupa antes que la suma.",
    ["Multiplicación", "Suma", "Ambas tienen la misma raíz"],
    1,
    "La raíz de esa expresión es +, con * en su hijo derecho.",
    "¿Cuál operación necesita el resultado de la otra?",
    "SELECT 1 + 2 * 3",
  ],
);
add(
  "Errores léxicos",
  "Distinguir caracteres y operadores fuera del dialecto.",
  [
    "¿Qué etapa rechaza @ en este dialecto?",
    "Antes de formar producciones, se reconocen unidades de texto.",
    ["Semántica", "Ejecución", "Léxica"],
    2,
    "@ no pertenece al vocabulario léxico definido; produce un diagnóstico con rango.",
    "¿Es posible asignarle un token admitido?",
    "SELECT @",
  ],
  [
    "¿Por qué == genera diagnóstico en SyntaxLab?",
    "La igualdad del dialecto se escribe con un único signo.",
    [
      "Se definió = como igualdad y == queda fuera",
      "SQL nunca permite comparar",
      "Porque falta un catálogo",
    ],
    0,
    "El lexer reconoce == como secuencia no admitida y no la corrige silenciosamente.",
    "¿Qué operador documenta la gramática?",
    "SELECT 1 == 1",
  ],
);
add(
  "Errores sintácticos",
  "Detectar el incumplimiento de una producción.",
  [
    "SELECT 1, termina después de la coma. ¿Qué falta?",
    "Una coma separa dos elementos; no termina una lista.",
    ["Otra expresión", "Un catálogo", "Una comilla doble"],
    0,
    "La regla de lista exige una expresión después de cada coma.",
    "¿Qué símbolo espera el parser tras el separador?",
    "SELECT 1,",
  ],
  [
    "SELECT (1 + 2 es inválido. ¿Cuál es la causa?",
    "La producción de agrupación tiene apertura, expresión y cierre.",
    [
      "El número 2 es desconocido",
      "Falta el cierre de paréntesis",
      "No se puede sumar",
    ],
    1,
    "El parser espera ) antes del final de la entrada y conserva ese rango de error.",
    "¿Qué terminal de la producción de agrupación no se consumió?",
    "SELECT (1 + 2",
  ],
);
add(
  "Errores semánticos",
  "Usar un catálogo para validar nombres y tipos.",
  [
    "¿Puede la sintaxis demostrar que una columna existe?",
    "La gramática admite nombres; el catálogo los resuelve.",
    [
      "Sí, cualquier identificador existe",
      "No, hace falta un catálogo explícito",
      "Solo si está en mayúsculas",
    ],
    1,
    "Un identificador sintácticamente válido puede no existir en el esquema.",
    "¿De dónde procede la información sobre columnas?",
  ],
  [
    "En un catálogo con edad:number, ¿qué ocurre con edad + texto:string?",
    "El dialecto no aplica conversiones implícitas entre texto y número.",
    [
      "Es un problema semántico de tipos",
      "Es siempre un error léxico",
      "Se acepta como número",
    ],
    0,
    "+ requiere dos números o dos textos; mezclar tipos genera diagnóstico semántico.",
    "¿Qué tipos producen ambos operandos?",
  ],
);
add(
  "Expresiones regulares",
  "Interpretar concatenación, unión y repetición.",
  [
    "¿Qué describe a*?",
    "La estrella permite cero o más repeticiones.",
    ["Solo a", "Una o más a", "Cero o más a"],
    2,
    "a* incluye ε, a, aa y sucesivas repeticiones.",
    "¿La cadena vacía debe ser aceptada?",
  ],
  [
    "¿Qué cadenas describe (a|b)c?",
    "Primero se elige a o b, después se concatena c.",
    ["ac y bc", "a y bc", "abc solamente"],
    0,
    "La agrupación determina que c se añade a cualquiera de las dos alternativas.",
    "¿A qué fragmento se concatena c?",
  ],
);
add(
  "Autómatas deterministas",
  "Interpretar una única transición por símbolo.",
  [
    "¿Qué condición caracteriza a un AFD?",
    "Fija un estado y un símbolo de entrada.",
    [
      "Varios estados iniciales",
      "Una única transición definida para cada símbolo y estado",
      "Uso obligatorio de ε",
    ],
    1,
    "En el AFD completo del laboratorio, cada par estado/símbolo tiene un destino único.",
    "¿Puede haber dos destinos distintos para el mismo par?",
  ],
  [
    "Si la entrada termina en un estado no final, ¿se acepta?",
    "La aceptación se decide después de consumir la cadena completa.",
    ["No", "Sí, si pasó por un estado final antes", "Siempre"],
    0,
    "Haber visitado antes un estado final no basta si quedan símbolos o se termina fuera de él.",
    "¿Dónde está el autómata al terminar de leer?",
  ],
);
add(
  "Autómatas no deterministas",
  "Interpretar conjuntos de estados y transiciones ε.",
  [
    "¿Qué consume una transición ε?",
    "Puede recorrerse sin avanzar en la cadena.",
    ["Un carácter e", "Un espacio", "Ningún símbolo"],
    2,
    "ε cambia de estado sin consumir entrada; su clausura debe calcularse.",
    "¿Debe avanzar el índice de entrada?",
  ],
  [
    "¿Cuándo acepta un AFN tras consumir toda la cadena?",
    "Puede conservar varias rutas simultáneas.",
    [
      "Si alguna ruta posible termina en estado final",
      "Solo si todas las rutas son finales",
      "Si no hay transiciones",
    ],
    0,
    "Basta con que el conjunto de estados alcanzables, incluida su clausura ε, contenga un final.",
    "¿La aceptación es existencial o universal?",
  ],
);
add(
  "Conversión AFN a AFD",
  "Representar conjuntos de estados mediante subconjuntos.",
  [
    "¿Qué representa cada estado del AFD construido por subconjuntos?",
    "Las rutas posibles del AFN se agrupan.",
    ["Una producción", "Un conjunto de estados del AFN", "Un único token"],
    1,
    "Cada estado determinista corresponde a un conjunto alcanzable de estados del AFN.",
    "¿Cómo representarías varias rutas con un solo estado?",
  ],
  [
    "¿Cuándo es final un subconjunto del AFD?",
    "Recuerda cómo acepta un AFN.",
    [
      "Solo si contiene todos los estados",
      "Si contiene el estado inicial",
      "Si contiene al menos un estado final del AFN",
    ],
    2,
    "La presencia de cualquier final del AFN basta para marcar el subconjunto como final.",
    "¿Qué ocurre si una de las rutas acepta?",
  ],
);
add(
  "Minimización de autómatas",
  "Identificar estados con comportamiento distinguible.",
  [
    "¿Qué partición inicial usa la minimización de un AFD?",
    "La cadena vacía distingue aceptación inmediata.",
    [
      "Finales y no finales",
      "Todos los pares de letras",
      "Estados pares e impares",
    ],
    0,
    "Finales y no finales no pueden fusionarse porque ε los distingue.",
    "¿Qué estados aceptan sin consumir más símbolos?",
  ],
  [
    "¿Cuándo se refina un bloque de estados?",
    "Compara los bloques destino para cada símbolo.",
    [
      "Cuando dos estados tienen distinto nombre",
      "Cuando sus transiciones van a bloques distintos",
      "Cuando el estado inicial es final",
    ],
    1,
    "Dos estados del mismo bloque se separan si algún símbolo los conduce a bloques distintos.",
    "¿Existe un sufijo que permita distinguir sus comportamientos?",
  ],
);
add(
  "Gramáticas libres de contexto",
  "Reconocer la forma de las producciones y su alcance.",
  [
    "¿Qué forma tiene el lado izquierdo de una producción de GLC?",
    "Un símbolo no terminal determina la expansión.",
    [
      "Una cadena arbitraria de terminales",
      "Dos terminales",
      "Un solo no terminal",
    ],
    2,
    "En una GLC cada producción reemplaza un único no terminal por una secuencia de símbolos.",
    "¿Depende la sustitución del contexto que rodea al símbolo?",
  ],
  [
    "¿Qué genera S → a S b | ε?",
    "Cada regla recursiva agrega una a al inicio y una b al final.",
    ["aⁿbⁿ para n ≥ 0", "Cualquier mezcla de a y b", "Solo ab"],
    0,
    "Cada expansión agrega un par ordenado; ε termina la recursión.",
    "¿Cuántas a y b añade cada expansión?",
  ],
);
add(
  "FIRST y FOLLOW",
  "Calcular símbolos de inicio y contexto posterior.",
  [
    "Si A → ε | a, ¿qué contiene FIRST(A)?",
    "Una alternativa empieza con a y otra puede desaparecer.",
    ["Solo a", "a y ε", "Solo $"],
    1,
    "FIRST(A) contiene a y ε. $ es el marcador de fin, relevante para FOLLOW del inicio.",
    "¿A puede producir la cadena vacía?",
  ],
  [
    "Con S → A b y A → a | ε, ¿qué contiene FOLLOW(A)?",
    "Mira qué terminal puede aparecer inmediatamente después de A.",
    ["a", "ε", "b"],
    2,
    "b sigue a A en la producción de S; FOLLOW no contiene ε.",
    "¿Qué queda después de A incluso cuando A desaparece?",
  ],
);
add(
  "Análisis predictivo LL(1)",
  "Razonar sobre selección de producciones y conflictos.",
  [
    "¿Qué significa un conflicto en una celda de la tabla LL(1)?",
    "Una única anticipación debería seleccionar una única regla.",
    [
      "Hay más de una producción aplicable",
      "La cadena siempre es válida",
      "El lexer no reconoce espacios",
    ],
    0,
    "Si una celda contiene varias producciones, esa gramática no se decide de forma determinista con LL(1).",
    "¿Puede elegirse una regla sin mirar información adicional?",
  ],
  [
    "Si A → ε, ¿en qué columnas se coloca esa producción?",
    "Una producción anulable permite continuar con lo que sigue a A.",
    ["En todas las letras", "En FOLLOW(A)", "Solo en ε"],
    1,
    "Las producciones que derivan ε se colocan según FOLLOW del no terminal, revisando conflictos.",
    "¿Qué anticipación permite continuar después de que A desaparezca?",
  ],
);

const source = "SELECT 1 + 2 * 3";
const computed = analyzeSql(source).tokens.filter(
  (token) => !["comment", "whitespace"].includes(token.category),
).length;
exercises.push({
  id: "tokens-computed",
  topic: "Identificación de tokens",
  level: "Intermedio",
  objective: "Contar tokens reconocidos por el lexer real.",
  question: "¿Cuántos tokens significativos reconoce esta entrada?",
  snippet: source,
  options: [String(computed - 1), String(computed), String(computed + 1)],
  correct: 1,
  explanation: `El lexer reconoce ${computed} tokens significativos. Espacios y comentarios son trivia.`,
  hint: "Cuenta cada número y operador como una unidad independiente.",
  reasoning: "¿Estás contando espacios como tokens significativos?",
});
export const EXERCISES: readonly Exercise[] = exercises;
export const TOPICS = [...new Set(EXERCISES.map((exercise) => exercise.topic))];
export const NEXT_STEPS: Record<string, string> = {
  "Identificación de tokens":
    "Separa primero palabras, números, literales completos y delimitadores. Después compara cada unidad con las categorías del lexer.",
  "Clasificación de símbolos":
    "Marca los símbolos que aparecen a la izquierda de una regla; contrástalos con los caracteres que permanecen en la cadena final.",
  "Construcción de producciones":
    "Rodea el no terminal elegido y sustituye solo esa posición por el lado derecho, conservando el prefijo y el sufijo.",
  "Recursividad en gramáticas":
    "Aplica mentalmente la regla dos veces y comprueba si aún queda el mismo no terminal. Busca después una alternativa que lo elimine.",
  "Derivación por izquierda":
    "Recorre la forma desde la izquierda, omite terminales y detente en el primer no terminal. Solo entonces elige una regla para él.",
  "Derivación por derecha":
    "Recorre la forma desde la derecha, omite terminales y encuentra el último no terminal; conserva el orden de los terminales del lado derecho.",
  "Árboles sintácticos":
    "Agrupa primero la subexpresión de mayor precedencia. La operación que combina su resultado con el resto debe quedar por encima de ella.",
  "Errores léxicos":
    "Comprueba si los caracteres pueden convertirse en un token del dialecto antes de preguntar por el orden de la sentencia.",
  "Errores sintácticos":
    "Escribe la producción esperada y tacha los símbolos ya consumidos. El siguiente símbolo sin tachar indica lo que falta.",
  "Errores semánticos":
    "Anota el tipo o la existencia de cada identificador usando el catálogo. Luego compara esa información con el requisito de la operación.",
  "Expresiones regulares":
    "Resuelve primero los paréntesis, después la repetición y luego la concatenación. Prueba también la cadena vacía.",
  "Autómatas deterministas":
    "Fija un estado y una letra; sigue su transición. Repite hasta consumir la entrada completa y solo entonces revisa si el estado es final.",
  "Autómatas no deterministas":
    "Calcula la clausura ε, toma todas las transiciones del símbolo y vuelve a cerrar por ε antes del siguiente carácter.",
  "Conversión AFN a AFD":
    "Escribe cada conjunto alcanzable como un estado nuevo. Comprueba si alguno de sus integrantes acepta y calcula sus destinos por letra.",
  "Minimización de autómatas":
    "Separa aceptación y rechazo; para cada letra compara a qué bloques llegan los estados que intentas mantener unidos.",
  "Gramáticas libres de contexto":
    "Aplica la regla recursiva dos veces y observa qué pares de terminales se agregan. Usa el caso base para terminar.",
  "FIRST y FOLLOW":
    "Para FIRST, inspecciona cómo empieza cada alternativa y si puede desaparecer. Para FOLLOW, inspecciona el sufijo que sigue al símbolo.",
  "Análisis predictivo LL(1)":
    "Mira la intersección entre la fila del no terminal y la columna de anticipación. Distingue una regla única, una celda vacía y un conflicto.",
};

export function evaluateAnswer(
  exercise: Exercise,
  answer: number,
): { correct: boolean; message: string } {
  const correct = Number.isInteger(answer) && answer === exercise.correct;
  return {
    correct,
    message: correct
      ? exercise.explanation
      : `La opción «${exercise.options[answer] ?? "sin respuesta válida"}» no coincide con la regla del ejercicio. ${exercise.hint} ${exercise.reasoning}`,
  };
}
export interface Attempt {
  exerciseId: string;
  correct: boolean;
  hints: number;
  mode: "practice" | "evaluate";
  at: number;
}
export interface Progress {
  version: 1;
  attempts: Attempt[];
}
export const PROGRESS_KEY = "syntaxlab.progress.v1";
export function loadProgress(storage: Pick<Storage, "getItem">): Progress {
  try {
    const value = JSON.parse(storage.getItem(PROGRESS_KEY) ?? "null");
    if (value?.version !== 1 || !Array.isArray(value.attempts))
      return { version: 1, attempts: [] };
    return {
      version: 1,
      attempts: value.attempts
        .filter(
          (a: Attempt) =>
            a &&
            EXERCISES.some((e) => e.id === a.exerciseId) &&
            typeof a.correct === "boolean" &&
            Number.isInteger(a.hints) &&
            a.hints >= 0 &&
            a.hints <= 3 &&
            ["practice", "evaluate"].includes(a.mode) &&
            typeof a.at === "number" &&
            Number.isFinite(a.at),
        )
        .slice(-1000),
    };
  } catch {
    return { version: 1, attempts: [] };
  }
}
export function recordAttempt(progress: Progress, attempt: Attempt): Progress {
  return { version: 1, attempts: [...progress.attempts, attempt].slice(-1000) };
}
export function topicProgress(progress: Progress, topic: string) {
  const exercises = EXERCISES.filter((e) => e.topic === topic);
  const attempts = progress.attempts.filter((a) =>
    exercises.some((e) => e.id === a.exerciseId),
  );
  const completed = new Set(
    attempts.filter((a) => a.correct).map((a) => a.exerciseId),
  );
  const unaided = new Set(
    attempts.filter((a) => a.correct && a.hints === 0).map((a) => a.exerciseId),
  );
  const mastered = ["Inicial", "Intermedio"].every((level) =>
    exercises.some((e) => e.level === level && unaided.has(e.id)),
  );
  return {
    attempts: attempts.length,
    completed: completed.size,
    total: exercises.length,
    mastered,
  };
}
