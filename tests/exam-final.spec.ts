import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const browserErrors = new WeakMap<Page, string[]>();

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function openWeek(page: Page, week: 9 | 10 | 11) {
  await page.getByRole("navigation", { name: "Módulos del examen final" })
    .getByRole("button", { name: new RegExp(`SEMANA ${week} `) }).click();
  const module = week === 9
    ? page.getByRole("region", { name: "Semana 9: gramáticas", exact: true })
    : week === 11
      ? page.getByRole("region", { name: "Gramáticas Dirigidas por Sintaxis y DDS", exact: true })
      : page.locator(".week10:visible");
  await expect(module).toBeVisible();
  return module;
}

async function finishTrace(module: Locator) {
  await module.getByRole("button", { name: "Ver todos los pasos", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Analizadores sintácticos", exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  await noOverflow(page);
  expect(browserErrors.get(page) ?? []).toEqual([]);
});

test("el inicio prioriza los árboles y convierte una expresión propia entre CST y AST", async ({ page }) => {
  const module = page.locator(".week10:visible");
  await expect(module.getByLabel("Expresión para el árbol", { exact: true })).toHaveValue("12 + 3 * 5");
  await expect(module.locator(".exam-record-root")).toHaveCount(1);
  await expect(module.locator(".exam-record-token").first()).toContainText("Nodo Hoja (Token)");
  await expect(module.locator(".exam-record-internal").first()).toContainText("Sub-nodo (Nodo Interno/Padre)");
  const concreteCount = await module.locator(".exam-record").count();
  expect(concreteCount).toBeGreaterThan(5);
  await module.getByRole("button", { name: "Árbol Sintáctico Abstracto (AST)", exact: true }).click();
  await expect(module.locator(".exam-record")).toHaveCount(5);
  await expect(module.locator(".exam-record-root .exam-node-label")).toHaveText("+");

  await module.getByLabel("Expresión para el árbol", { exact: true }).fill("(saldo + 3) * cantidad");
  await expect(module.locator(".exam-record-root .exam-node-label")).toHaveText("*");
  await expect(module.locator(".exam-node-label").filter({ hasText: /^saldo$/ })).toHaveCount(1);
  await expect(module.locator(".exam-node-label").filter({ hasText: /^cantidad$/ })).toHaveCount(1);
  await noOverflow(page);

  await module.getByLabel("Expresión para el árbol", { exact: true }).fill("saldo +");
  await expect(module.getByRole("alert")).toBeVisible();
  await expect(module.locator(".exam-graph")).toHaveCount(0);
});

test("Semana 9 ofrece los diez presets y elimina la recursividad con alfa y beta explícitos", async ({ page }) => {
  const module = await openWeek(page, 9);
  const presets = module.getByLabel("Ejercicio de Semana 9", { exact: true });
  await expect(presets.locator("option:not([disabled])")).toHaveCount(10);
  await expect(module.getByLabel("Gramática de Semana 9", { exact: true })).toHaveValue("S -> S a | b");
  await module.getByRole("button", { name: "Eliminar recursividad izquierda", exact: true }).click();
  const elimination = module.getByRole("region", { name: "Eliminación paso a paso", exact: true });
  await expect(elimination).toContainText("α1 = a");
  await expect(elimination).toContainText("β1 = b");
  await expect(elimination.getByLabel("Gramática transformada", { exact: true })).toHaveText("S -> b S'\nS' -> a S' | ε");

  await presets.selectOption("8");
  await expect(elimination).toHaveCount(0);
  await module.getByRole("button", { name: "Eliminar recursividad izquierda", exact: true }).click();
  await expect(elimination.getByLabel("Gramática transformada", { exact: true })).toHaveText("S -> S'\nS' -> ( S ) S' | ε");
  await module.getByLabel("Gramática de Semana 9", { exact: true }).fill("S -> ε a");
  await expect(elimination).toHaveCount(0);
  await expect(module.getByRole("alert")).toBeVisible();
  await expect(module.getByRole("button", { name: "Eliminar recursividad izquierda", exact: true })).toBeDisabled();
});

test("la clasificación de Chomsky cambia según las reglas ingresadas", async ({ page }) => {
  const module = await openWeek(page, 9);
  await module.getByRole("button", { name: "Jerarquía de Chomsky", exact: true }).click();
  const grammar = module.getByLabel("Gramática de Semana 9", { exact: true });
  const status = module.getByRole("status");
  for (const [source, type, machine] of [
    ["S -> a S | b", "Tipo 3 · Regular", "Autómata Finito"],
    ["S -> a S b | ε", "Tipo 2 · Libre de contexto", "Autómata de Pila"],
    ["S -> A B\nA B -> a b", "Tipo 1 · Sensible al contexto", "Autómata Linealmente Acotado"],
    ["S -> A B\nA B -> a", "Tipo 0 · Sin restricciones", "Máquina de Turing"],
  ]) {
    await grammar.fill(source);
    await expect(status).toContainText(type);
    await expect(status).toContainText(machine);
  }
});

test("LL(1) calcula la tabla y revela la aceptación de acbb solo al completar la traza", async ({ page }) => {
  const module = page.locator(".week10:visible");
  await module.getByRole("button", { name: "LL(1)", exact: true }).click();
  await expect(module.getByLabel("Entrada LL(1)", { exact: true })).toHaveValue("acbb");
  await expect(module.getByText("Cumple LL(1): cada celda contiene a lo sumo una producción.", { exact: true })).toBeVisible();
  await expect(module.getByRole("table").first()).toContainText("{ a, c }");
  await expect(module.getByRole("table").nth(1)).toContainText("ERROR");
  await expect(module.getByText("Cadena aceptada", { exact: true })).toHaveCount(0);
  await module.getByRole("button", { name: "Siguiente paso", exact: true }).click();
  await expect(module.getByRole("table").last().locator("tbody tr")).toHaveCount(2);
  await finishTrace(module);
  await expect(module.getByText("Cadena aceptada", { exact: true })).toBeVisible();
  await expect(module.getByRole("table").last().locator("tbody tr").last()).toContainText("Aceptar");

  await module.getByLabel("Entrada LL(1)", { exact: true }).fill("ab");
  await expect(module.getByText("Cadena aceptada", { exact: true })).toHaveCount(0);
  await finishTrace(module);
  await expect(module.locator('.exam-feedback[role="status"]')).toContainText("Error:");
  await module.getByLabel("Gramática LL(1)", { exact: true }).fill("S -> a b | a c");
  await expect(module.getByRole("status").filter({ hasText: "No cumple LL(1)." })).toBeVisible();
});

test("el ascendente conserva abcdef rechazado y permite probar la alternativa derivable", async ({ page }) => {
  const module = page.locator(".week10:visible");
  await module.getByRole("button", { name: "Ascendente", exact: true }).click();
  await expect(module.getByLabel("Entrada ascendente", { exact: true })).toHaveValue("abcdef");
  await expect(module.getByLabel("Símbolo inicial ascendente", { exact: true })).toHaveValue("S");
  await finishTrace(module);
  await expect(module.locator('.exam-feedback[role="status"]')).toContainText("Cadena rechazada.");
  await expect(module.getByRole("table").locator("tbody tr").last()).toContainText("Error:");
  await module.getByText("Revisar la cadena del ejemplo", { exact: true }).click();
  await module.getByRole("button", { name: "Probar abcdabef", exact: true }).click();
  await expect(module.getByLabel("Entrada ascendente", { exact: true })).toHaveValue("abcdabef");
  await expect(module.getByRole("table").locator("tbody tr")).toHaveCount(1);
  await finishTrace(module);
  await expect(module.locator('.exam-feedback[role="status"]')).toHaveText("Cadena aceptada");
  await expect(module.getByRole("table")).toContainText("Reducir por S → V W Z");
});

test("la factorización muestra el prefijo y se recalcula para una gramática propia", async ({ page }) => {
  const module = page.locator(".week10:visible");
  await module.getByRole("button", { name: "Factorización", exact: true }).click();
  await expect(module.locator(".exam-steps")).toContainText("α = a");
  await expect(module.locator("pre").last()).toContainText("A' → b");
  await expect(module.locator("pre").last()).toContainText("A' → c");
  await module.getByLabel("Gramática para factorizar", { exact: true }).fill("S -> a b | a c | a");
  await expect(module.locator("pre").last()).toContainText("S' → ε");
  await module.getByLabel("Gramática para factorizar", { exact: true }).fill("S -> x | y");
  await expect(module.getByText("No hay prefijos comunes que factorizar.", { exact: true })).toBeVisible();
  await expect(module.locator(".exam-steps li")).toHaveCount(0);
});

test("BNF Python deriva un programa propio y rechaza texto fuera del subconjunto", async ({ page }) => {
  const module = page.locator(".week10:visible");
  await module.getByRole("button", { name: "BNF Python", exact: true }).click();
  await expect(module.locator(".exam-record-root .exam-node-label")).toHaveText("<programa>");
  await expect(module.locator(".exam-steps li")).toHaveCount(1);
  await module.getByLabel("Programa BNF Python", { exact: true }).fill("import tensorflow as tf\nvalor = 42\nprint(valor)");
  await finishTrace(module);
  await expect(module.locator(".exam-steps li").last()).toContainText("import tensorflow as tf valor = 42 print ( valor )");
  await expect(module.locator(".exam-node-label").filter({ hasText: /^42$/ })).toHaveCount(1);
  await module.getByLabel("Programa BNF Python", { exact: true }).fill("import tensorflow as tf\nx = call()\nprint(x)");
  await expect(module.getByRole("alert")).toBeVisible();
  await expect(module.locator(".exam-graph")).toHaveCount(0);
});

test("la DDS sintetizada evalúa atributos por pasos y termina en print de 19", async ({ page }) => {
  const module = await openWeek(page, 11);
  await expect(module.getByLabel("Entrada DDS", { exact: true })).toHaveValue("3 * 5 + 4 n");
  await module.getByRole("button", { name: "Construir árbol decorado", exact: true }).click();
  const output = module.locator('[aria-label="Salida de la DDS"]');
  await expect(output).toContainText("Pendiente de print(E.val).");
  await expect(module.locator(".exam-attribute b").filter({ hasText: /^\?$/ }).first()).toBeVisible();
  await expect(module.locator('.react-flow__edge[data-id^="dependency-"]').first()).toBeVisible();
  await module.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(module.locator(".exam-attribute.active")).toHaveCount(1);
  await expect(output).toContainText("Pendiente de print(E.val).");
  await module.getByRole("checkbox", { name: "Grafo de dependencias", exact: true }).uncheck();
  await expect(module.locator('.react-flow__edge[data-id^="dependency-"]')).toHaveCount(0);
  await module.getByRole("checkbox", { name: "Grafo de dependencias", exact: true }).check();
  await module.getByRole("button", { name: "Evaluar todo", exact: true }).click();
  await expect(output).toContainText("print(E.val) → 19");
  await module.getByRole("button", { name: "Reiniciar", exact: true }).click();
  await expect(output).toContainText("Pendiente de print(E.val).");
  await module.getByLabel("Entrada DDS", { exact: true }).fill("2 * (3 + 4) n");
  await expect(module.locator(".exam-graph")).toHaveCount(0);
  await module.getByRole("button", { name: "Construir árbol decorado", exact: true }).click();
  await module.getByRole("button", { name: "Evaluar todo", exact: true }).click();
  await expect(output).toContainText("print(E.val) → 14");
});

test("la DDS heredada registra tres identificadores en diez pasos y admite tipos propios", async ({ page }) => {
  const module = await openWeek(page, 11);
  await module.getByRole("button", { name: "Atributos heredados", exact: true }).click();
  await expect(module.getByLabel("Entrada DDS", { exact: true })).toHaveValue("real id1, id2, id3");
  await module.getByRole("button", { name: "Construir árbol decorado", exact: true }).click();
  const controls = module.locator('[aria-label="Evaluación de atributos"]');
  const symbols = module.locator('[aria-label="Tabla de símbolos"]');
  await expect(controls).toContainText("Paso 0 de 10");
  await expect(symbols.locator("tbody tr")).toHaveCount(0);
  await controls.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(controls).toContainText("Paso 1 de 10");
  await expect(symbols.locator("tbody tr")).toHaveCount(0);
  await controls.getByRole("button", { name: "Evaluar todo", exact: true }).click();
  await expect(controls).toContainText("Paso 10 de 10");
  await expect(symbols.locator("tbody tr")).toHaveCount(3);
  for (const id of ["id1", "id2", "id3"]) {
    await expect(symbols.locator("tbody tr").filter({ hasText: id }).getByRole("cell").nth(1)).toHaveText("real");
  }
  await module.getByLabel("Entrada DDS", { exact: true }).fill("int contador, limite");
  await expect(symbols).toHaveCount(0);
  await module.getByRole("button", { name: "Construir árbol decorado", exact: true }).click();
  await controls.getByRole("button", { name: "Evaluar todo", exact: true }).click();
  await expect(symbols.locator("tbody tr")).toHaveCount(2);
  await expect(symbols.locator("tbody tr").first()).toContainText("entero");
  await module.getByLabel("Entrada DDS", { exact: true }).fill("real duplicado, duplicado");
  await module.getByRole("button", { name: "Construir árbol decorado", exact: true }).click();
  await expect(module.getByRole("alert")).toBeVisible();
  await expect(module.locator(".exam-graph")).toHaveCount(0);
});

test("cambiar de semana conserva las entradas y SQL queda en el acceso secundario", async ({ page }) => {
  const week10 = page.locator(".week10:visible");
  await week10.getByLabel("Expresión para el árbol", { exact: true }).fill("precio * cantidad");
  await week10.getByRole("button", { name: "Árbol Sintáctico Abstracto (AST)", exact: true }).click();
  const week9 = await openWeek(page, 9);
  await week9.getByLabel("Gramática de Semana 9", { exact: true }).fill("A -> A x | y");
  await week9.getByRole("button", { name: "Eliminar recursividad izquierda", exact: true }).click();
  await openWeek(page, 10);
  await expect(week10.getByLabel("Expresión para el árbol", { exact: true })).toHaveValue("precio * cantidad");
  await expect(week10.getByRole("button", { name: "Árbol Sintáctico Abstracto (AST)", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(week10.locator(".exam-record")).toHaveCount(3);
  await openWeek(page, 9);
  await expect(week9.getByLabel("Gramática transformada", { exact: true })).toHaveText("A -> y A'\nA' -> x A' | ε");
  await page.getByRole("button", { name: "Otros laboratorios", exact: true }).click();
  await expect(page).toHaveURL(/#otros$/);
  await expect(page.getByRole("heading", { name: "Prácticas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver al examen final", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jerarquía de Chomsky y recursividad", exact: true })).toBeVisible();
});
