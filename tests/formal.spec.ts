import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

async function build(page: Page, regex: string) {
  await page
    .getByRole("textbox", { name: "Expresión regular", exact: true })
    .fill(regex);
  await page
    .getByRole("button", { name: "Construir autómatas", exact: true })
    .click();
}

async function showLL1(page: Page, grammar = "S -> a S b | ε") {
  await page
    .getByRole("button", { name: "FIRST · FOLLOW · LL(1)", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Gramática LL1", exact: true })
    .fill(grammar);
  await page
    .getByRole("button", { name: "Calcular FIRST y FOLLOW", exact: true })
    .click();
}

function simulator(page: Page): Locator {
  return page.locator("section.module-card").filter({
    has: page.getByRole("heading", {
      name: "Recorrer una cadena",
      exact: true,
    }),
  });
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/#otros");
  await expect(page.getByRole("heading", { name: "Prácticas", exact: true })).toBeVisible();
  const menu = page.getByRole("button", {
    name: "Abrir navegación",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("button", { name: "Autómatas y LL(1)", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Autómatas y LL(1)",
      exact: true,
    }),
  ).toBeVisible();
});

test("construye un AFN propio, sus subconjuntos alcanzables y particiones mínimas", async ({
  page,
}) => {
  await build(page, "a(b|a)*b");
  await expect(page.locator(".module-status")).toHaveText(
    "AFN: 12 · AFD: 5 · Mínimo: 4 estados",
  );
  const representation = page.getByRole("combobox", {
    name: "Representación del autómata",
    exact: true,
  });
  await expect(representation).toHaveValue("dfa");
  await expect(
    page.getByRole("img", { name: "Diagrama del autómata generado" }),
  ).toBeVisible();
  await expect(page.locator(".algorithm-table tbody tr")).toHaveCount(5);
  await page.getByText("Conjuntos de estados del AFN", { exact: true }).click();
  const subsets = page
    .locator("details")
    .filter({
      has: page.getByText("Conjuntos de estados del AFN", { exact: true }),
    });
  await expect(subsets.locator("pre")).toContainText("q0 = { n0 }");
  await expect(subsets.locator("pre")).toContainText("q2 = {  }");

  await representation.selectOption("nfa");
  await expect(
    page.getByRole("heading", { name: "AFN con transiciones ε", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".algorithm-table tbody tr")).toHaveCount(12);
  await expect(
    page.getByRole("columnheader", { name: "ε", exact: true }),
  ).toBeVisible();

  await representation.selectOption("min");
  await expect(page.locator(".algorithm-table tbody tr")).toHaveCount(4);
  await page
    .getByText("Particiones equivalentes del AFD", { exact: true })
    .click();
  const partitions = page
    .locator("details")
    .filter({
      has: page.getByText("Particiones equivalentes del AFD", { exact: true }),
    });
  await expect(partitions.locator("pre")).toContainText("q1, q3");
  await expectNoOverflow(page);
});

test("simula las tres representaciones y permite inspeccionar estados de cada paso", async ({
  page,
}) => {
  await build(page, "a(b|a)*b");
  for (const kind of ["nfa", "dfa", "min"]) {
    await page
      .getByRole("combobox", { name: "Representación del autómata" })
      .selectOption(kind);
    await page
      .getByRole("textbox", { name: "Cadena del autómata", exact: true })
      .fill("aabb");
    await page
      .getByRole("button", { name: "Simular cadena", exact: true })
      .click();
    await expect(
      simulator(page).getByText("Cadena aceptada", { exact: true }),
    ).toBeVisible();
    const slider = page.getByRole("slider", {
      name: "Paso de simulación",
      exact: true,
    });
    await expect(slider).toHaveAttribute("max", "4");
    await expect(slider).toHaveValue("4");
    await slider.focus();
    await slider.press("Home");
    await expect(slider).toHaveValue("0");
    await expect(simulator(page).locator("pre")).toContainText(
      "▶ 0. ε inicial:",
    );
    await expect(
      page.locator('.automaton-viewport circle[fill="#285d70"]'),
    ).not.toHaveCount(0);
    await slider.press("End");
    await expect(slider).toHaveValue("4");
    await expect(simulator(page).locator("pre")).toContainText("▶ 4. b:");
  }
});

test("rechaza cadenas ajenas al lenguaje y símbolos fuera del alfabeto", async ({
  page,
}) => {
  await build(page, "a(b|a)*b");
  const word = page.getByRole("textbox", {
    name: "Cadena del autómata",
    exact: true,
  });
  await word.fill("a");
  await page
    .getByRole("button", { name: "Simular cadena", exact: true })
    .click();
  await expect(
    simulator(page).getByText("Cadena rechazada", { exact: true }),
  ).toBeVisible();
  await word.fill("abc");
  await expect(
    page.getByText("La cadena cambió. Vuelve a simular.", { exact: true }),
  ).toBeVisible();
  await expect(
    simulator(page).getByText("Cadena rechazada", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Simular cadena", exact: true })
    .click();
  await expect(
    simulator(page).getByText("Cadena rechazada", { exact: true }),
  ).toBeVisible();
  await expect(simulator(page).getByRole("status")).toContainText(
    "c no pertenece al alfabeto",
  );
});

test("invalida resultados al editar la regex y muestra errores calculados para expresiones inválidas", async ({
  page,
}) => {
  await build(page, "a+");
  await expect(page.locator(".module-status")).toHaveText(
    "AFN: 4 · AFD: 2 · Mínimo: 2 estados",
  );
  await page
    .getByRole("textbox", { name: "Expresión regular", exact: true })
    .fill("b*");
  await expect(
    page.getByRole("status").filter({ hasText: "La expresión cambió" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Diagrama del autómata generado" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simular cadena", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Construir autómatas", exact: true })
    .click();
  await expect(page.locator(".module-status")).toHaveText(
    "AFN: 4 · AFD: 2 · Mínimo: 1 estados",
  );
  await build(page, "a|");
  await expect(page.locator(".module-page").getByRole("alert")).toContainText(
    "alternativa está vacía",
  );
  await expect(page.locator(".module-status")).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "Diagrama del autómata generado" }),
  ).toHaveCount(0);
});

test("interpreta epsilon como la cadena vacía y nunca como un carácter consumido", async ({
  page,
}) => {
  await build(page, "ε");
  await expect(page.locator(".module-status")).toHaveText(
    "AFN: 2 · AFD: 1 · Mínimo: 1 estados",
  );
  await page
    .getByRole("textbox", { name: "Cadena del autómata", exact: true })
    .fill("");
  await page
    .getByRole("button", { name: "Simular cadena", exact: true })
    .click();
  await expect(
    simulator(page).getByText("Cadena aceptada", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Paso de simulación" }),
  ).toHaveAttribute("max", "0");
  await expect(simulator(page).getByRole("status")).toContainText(
    "Se consumieron 0 símbolos",
  );
  await page
    .getByRole("textbox", { name: "Cadena del autómata", exact: true })
    .fill("a");
  await page
    .getByRole("button", { name: "Simular cadena", exact: true })
    .click();
  await expect(
    simulator(page).getByText("Cadena rechazada", { exact: true }),
  ).toBeVisible();
});

test("calcula FIRST, FOLLOW, anulables y tabla LL1 desde una gramática recursiva", async ({
  page,
}) => {
  await showLL1(page);
  const results = page.locator(".formal-results");
  await expect(
    results.getByRole("heading", {
      name: "Gramática apta para LL(1)",
      exact: true,
    }),
  ).toBeVisible();
  const sets = results.locator("table").nth(0),
    table = results.locator("table").nth(1);
  await expect(sets.locator("tbody tr td")).toHaveText(["S", "a, ε", "$, b"]);
  await expect(table.locator("thead th")).toHaveText(["M", "a", "b", "$"]);
  await expect(table.locator("tbody tr td")).toHaveText(["S", "1", "2", "2"]);
  await expect(results).toContainText("Anulables: S");
  await expectNoOverflow(page);
});

test("ejecuta una pila predictiva real para aceptar y rechazar cadenas balanceadas", async ({
  page,
}) => {
  await showLL1(page);
  const chain = page.getByRole("textbox", { name: "Cadena LL1", exact: true });
  await chain.fill("a a a b b b");
  await page
    .getByRole("button", { name: "Analizar con LL(1)", exact: true })
    .click();
  await expect(
    page.getByText("Cadena aceptada por LL(1)", { exact: true }),
  ).toBeVisible();
  const prediction = page.locator("section.module-card").filter({
    has: page.getByRole("heading", {
      name: "Análisis predictivo paso a paso",
      exact: true,
    }),
  });
  await expect(prediction.locator("tbody tr")).toHaveCount(11);
  await expect(prediction.locator("tbody tr").first().locator("td")).toHaveText(
    ["S $", "a a a b b b $", "S → a S b"],
  );
  await expect(prediction.locator("tbody tr").last().locator("td")).toHaveText([
    "$",
    "$",
    "Aceptar",
  ]);
  await chain.fill("a a b");
  await expect(
    page.getByText("La cadena cambió; vuelve a analizar.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Cadena aceptada por LL(1)", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Analizar con LL(1)", exact: true })
    .click();
  await expect(
    page.getByText("Cadena rechazada por LL(1)", { exact: true }),
  ).toBeVisible();
  await expect(prediction.getByRole("status")).toContainText("Se esperaba b");
  await chain.fill("");
  await page
    .getByRole("button", { name: "Analizar con LL(1)", exact: true })
    .click();
  await expect(
    page.getByText("Cadena aceptada por LL(1)", { exact: true }),
  ).toBeVisible();
  await expectNoOverflow(page);
});

test("oculta conjuntos antiguos y desactiva el análisis cuando cambia la gramática", async ({
  page,
}) => {
  await showLL1(page);
  await page
    .getByRole("textbox", { name: "Gramática LL1", exact: true })
    .fill("S -> a S | b");
  await expect(
    page.getByText("La gramática cambió. Vuelve a calcular sus conjuntos.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".formal-results")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Analizar con LL(1)", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Calcular FIRST y FOLLOW", exact: true })
    .click();
  await expect(
    page.locator(".formal-results table").first().locator("tbody td"),
  ).toHaveText(["S", "a, b", "$"]);
  await page
    .getByRole("textbox", { name: "Cadena LL1", exact: true })
    .fill("a a b");
  await page
    .getByRole("button", { name: "Analizar con LL(1)", exact: true })
    .click();
  await expect(
    page.getByText("Cadena aceptada por LL(1)", { exact: true }),
  ).toBeVisible();
});

test("conserva conflictos LL1 y rechaza sin escoger arbitrariamente una producción", async ({
  page,
}) => {
  await showLL1(page, "S -> a | a b");
  await expect(
    page.getByRole("heading", {
      name: "La gramática no es LL(1)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Conflicto M[S, a]: producciones 1, 2.", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".formal-results table")
      .nth(1)
      .getByRole("cell", { name: "1 / 2", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Cadena LL1", exact: true })
    .fill("a");
  await page
    .getByRole("button", { name: "Analizar con LL(1)", exact: true })
    .click();
  await expect(
    page.getByText("Cadena rechazada por LL(1)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Cadena aceptada por LL(1)", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Gramática LL1", exact: true })
    .fill("S a");
  await page
    .getByRole("button", { name: "Calcular FIRST y FOLLOW", exact: true })
    .click();
  await expect(page.locator(".module-page").getByRole("alert")).toBeVisible();
  await expect(page.locator(".formal-results")).toHaveCount(0);
  await expectNoOverflow(page);
});
