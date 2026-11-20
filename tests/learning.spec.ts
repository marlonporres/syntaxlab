import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { EXERCISES, PROGRESS_KEY, TOPICS } from "../src/engine/learning";

async function navigation(page: Page, label: string) {
  await expect(page.locator(".app-shell .topbar")).toBeVisible();
  const menu = page.getByRole("button", {
    name: "Abrir navegación",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation", { name: "Estudio" })
    .getByRole("button", { name: label, exact: true })
    .click();
}
async function attempts(page: Page) {
  return page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) ?? '{"attempts":[]}').attempts,
    PROGRESS_KEY,
  );
}
test.beforeEach(async ({ page }) => {
  await page.goto("/#otros");
  await expect(
    page.getByRole("heading", { name: "Prácticas" }),
  ).toBeVisible();
});

test("practicar diferencia errores y pistas, sin revelar la solución antes de pedirla", async ({
  page,
}) => {
  await navigation(page, "Prácticas");
  await expect(
    page.getByRole("heading", { name: "Prácticas" }),
  ).toBeVisible();
  const options = page
    .getByRole("group", { name: "Opciones de respuesta" })
    .getByRole("button");
  await options.nth(0).click();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await expect(page.locator('.module-feedback[role="status"]')).toContainText(
    "Revisa tu razonamiento",
  );
  await expect(page.locator('.module-feedback[role="status"]')).toContainText(
    "Identificador",
  );
  expect(await attempts(page)).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar" }).click();
  await page.getByRole("button", { name: "Pista 1 de 3", exact: true }).click();
  await expect(page.getByText(/Pista conceptual:/)).toBeVisible();
  await page.getByRole("button", { name: "Pista 2 de 3", exact: true }).click();
  await expect(page.getByText(/Identifica el error:/)).toBeVisible();
  await page.getByRole("button", { name: "Pista 3 de 3", exact: true }).click();
  await expect(page.getByText(/Siguiente paso:/)).toBeVisible();
  await expect(
    page.getByText("Solución: Palabra reservada", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar solución completa" }).click();
  await expect(
    page.getByText("Solución: Palabra reservada", { exact: true }),
  ).toBeVisible();
  await options.nth(1).click();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await expect(page.locator('.module-feedback[role="status"]')).toContainText(
    "Respuesta correcta",
  );
  expect((await attempts(page)).at(-1)).toMatchObject({
    correct: true,
    hints: 3,
    mode: "practice",
  });
  await page.getByRole("button", { name: "Reintentar" }).click();
  await options.nth(1).click();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  expect((await attempts(page)).at(-1)).toMatchObject({
    correct: true,
    hints: 3,
  });
});

test("recupera progreso por tema y distingue resolución con y sin asistencia", async ({
  page,
}) => {
  await navigation(page, "Prácticas");
  const exercise = EXERCISES[0];
  await page
    .getByRole("group", { name: "Opciones de respuesta" })
    .getByRole("button")
    .nth(exercise.correct)
    .click();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  const next = EXERCISES.find(
    (e) => e.topic === exercise.topic && e.level === "Intermedio",
  )!;
  await page
    .getByLabel("Ejercicio de práctica", { exact: true })
    .selectOption(next.id);
  await page
    .getByRole("group", { name: "Opciones de respuesta" })
    .getByRole("button")
    .nth(next.correct)
    .click();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await expect(
    page.locator(".progress-row").filter({ hasText: exercise.topic }),
  ).toContainText("Dominado en prácticas");
  await page.reload();
  await navigation(page, "Prácticas");
  expect(await attempts(page)).toHaveLength(2);
  await expect(
    page.locator(".progress-row").filter({ hasText: exercise.topic }),
  ).toContainText("2 intentos");
  await expect(
    page.locator(".progress-row").filter({ hasText: exercise.topic }),
  ).toContainText("Dominado en prácticas");
});

test("evaluación oculta pistas iniciales y explica el resultado al enviar", async ({
  page,
}) => {
  await navigation(page, "Evaluarme");
  await expect(
    page.getByRole("heading", { name: "Evaluarme" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Pista \d/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mostrar solución completa" }),
  ).toHaveCount(0);
  await page
    .getByRole("group", { name: "Opciones de respuesta" })
    .getByRole("button")
    .nth(0)
    .click();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await expect(page.locator('.module-feedback[role="status"]')).toContainText(
    EXERCISES[0].explanation,
  );
  expect((await attempts(page))[0]).toMatchObject({
    correct: false,
    hints: 0,
    mode: "evaluate",
  });
});

test("los 18 temas ofrecen ejercicios iniciales e intermedios y el conteo usa el lexer real", async ({
  page,
}) => {
  await navigation(page, "Prácticas");
  await expect(
    page.getByLabel("Tema de práctica", { exact: true }).locator("option"),
  ).toHaveCount(TOPICS.length);
  for (const topic of TOPICS) {
    await page
      .getByLabel("Tema de práctica", { exact: true })
      .selectOption(topic);
    const labels = await page
      .getByLabel("Ejercicio de práctica", { exact: true })
      .locator("option")
      .allTextContents();
    expect(labels.some((t) => t.includes("Inicial"))).toBe(true);
    expect(labels.some((t) => t.includes("Intermedio"))).toBe(true);
  }
  await page
    .getByLabel("Tema de práctica", { exact: true })
    .selectOption(TOPICS[0]);
  await page
    .getByLabel("Ejercicio de práctica", { exact: true })
    .selectOption("tokens-computed");
  const exercise = EXERCISES.find((e) => e.id === "tokens-computed")!;
  await page
    .getByRole("group", { name: "Opciones de respuesta" })
    .getByRole("button")
    .nth(exercise.correct)
    .click();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await expect(page.locator('.module-feedback[role="status"]')).toContainText(
    exercise.explanation,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("repaso abre la práctica del tema sin puntuarla", async ({ page }) => {
  await navigation(page, "Repaso");
  const topic = page.locator(".review-topic").filter({ hasText: "FIRST y FOLLOW" });
  await topic.locator("summary").click();
  await topic.getByRole("button", { name: "Practicar este tema" }).click();
  await expect(page.getByLabel("Tema de práctica", { exact: true })).toHaveValue("FIRST y FOLLOW");
  expect(await attempts(page)).toEqual([]);
});

test("inicio directo y siguiente ejercicio conservan el intento y limpian la respuesta", async ({ page }) => {
  await expect(page.locator(".monaco-editor")).toHaveCount(0);
  await expect(page.locator(".progress-details")).not.toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "Siguiente ejercicio" })).toHaveCount(0);
  await page.getByRole("group", { name: "Opciones de respuesta" }).getByRole("button").nth(EXERCISES[0].correct).click();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await page.getByRole("button", { name: "Siguiente ejercicio", exact: true }).click();
  await expect(page.getByRole("heading", { name: EXERCISES[1].question, exact: true })).toBeFocused();
  await expect(page.getByLabel("Ejercicio de práctica", { exact: true })).toHaveValue(EXERCISES[1].id);
  await expect(page.getByRole("button", { name: "Comprobar respuesta" })).toBeDisabled();
  await expect(page.locator('.module-feedback[role="status"]')).toHaveCount(0);
  expect(await attempts(page)).toHaveLength(1);
});
