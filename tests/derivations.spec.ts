import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

if (process.env.SYNTAXLAB_TEST_BASE_URL)
  test.use({ baseURL: process.env.SYNTAXLAB_TEST_BASE_URL });

async function openDerivations(page: Page) {
  await page.goto("/#otros");
  await expect(
    page.getByRole("heading", { name: "Prácticas" }),
  ).toBeVisible();
  const menu = page.getByRole("button", {
    name: "Abrir navegación",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator(".main-nav")
    .getByRole("button", { name: "Derivaciones", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Derivaciones",
      exact: true,
    }),
  ).toBeVisible();
}

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

const applyName = "Aplicar producción";

test.beforeEach(async ({ page }) => {
  await openDerivations(page);
});

test("construye el objetivo guiado mediante dos pasos recursivos y un caso base real", async ({
  page,
}, testInfo) => {
  const form = page.locator(".symbol-row");
  const apply = page.getByRole("button", { name: applyName, exact: true });
  await expect(form.locator("button")).toHaveCount(1);
  await expect(form).toContainText("S");
  await apply.click();
  await expect(form.locator("button")).toHaveCount(3);
  await expect(
    page.getByLabel("Historial de derivación").locator("li"),
  ).toHaveCount(2);
  await apply.click();
  await expect(form.locator("button")).toHaveCount(5);
  await page
    .getByLabel("Producción a aplicar", { exact: true })
    .selectOption({ label: "S → ε" });
  await apply.click();
  await expect(form.locator("button")).toHaveCount(4);
  await expect(
    page.getByText("Objetivo alcanzado: a a b b", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Historial de derivación").locator("li"),
  ).toHaveCount(4);
  await expect(
    page.getByLabel("Historial de derivación").locator("li").last(),
  ).toContainText("S → ε");
  await expect(apply).toBeDisabled();
  await noPageOverflow(page);
  const path = testInfo.outputPath("guided-derivation.png");
  await page.locator(".module-page").screenshot({ path });
  await testInfo.attach("Derivación guiada terminada", {
    path,
    contentType: "image/png",
  });
  await page
    .getByRole("button", { name: "Reiniciar derivación", exact: true })
    .click();
  await expect(
    page.getByLabel("Historial de derivación").locator("li"),
  ).toHaveCount(1);
  await expect(form.locator("button")).toHaveCount(1);
});

test("rechaza expandir el extremo equivocado y comprueba la modalidad izquierda o derecha", async ({
  page,
}) => {
  await page
    .getByLabel("Ejercicio", { exact: true })
    .selectOption("alternatives");
  const apply = page.getByRole("button", { name: applyName, exact: true });
  await apply.click();
  await page
    .getByRole("button", { name: "No terminal B, posición 2", exact: true })
    .click();
  await apply.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Revisa el paso." }),
  ).toContainText("izquierda");
  await expect(
    page.getByLabel("Historial de derivación").locator("li"),
  ).toHaveCount(2);
  await page
    .getByLabel("Orden de expansión", { exact: true })
    .selectOption("right");
  await expect(
    page.getByLabel("Historial de derivación").locator("li"),
  ).toHaveCount(1);
  await apply.click();
  await page
    .getByRole("button", { name: "No terminal A, posición 1", exact: true })
    .click();
  await apply.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Revisa el paso." }),
  ).toContainText("derecha");
  await expect(
    page.getByLabel("Historial de derivación").locator("li"),
  ).toHaveCount(2);
  await noPageOverflow(page);
});

test("ofrece tres niveles de pista y mantiene la solución completa oculta hasta solicitarla", async ({
  page,
}) => {
  const solutionHeading = page.getByRole("heading", {
    name: /Solución calculada por la/,
  });
  await expect(solutionHeading).toHaveCount(0);
  await page.getByRole("button", { name: /^Pedir pista/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Pista conceptual:" }),
  ).toBeVisible();
  await expect(solutionHeading).toHaveCount(0);
  await page.getByRole("button", { name: /^Pedir pista/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Identificación:" }),
  ).toBeVisible();
  await expect(solutionHeading).toHaveCount(0);
  await page.getByRole("button", { name: /^Pedir pista/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Siguiente paso posible:" }),
  ).toContainText("S → a S b");
  await expect(
    page.getByRole("button", { name: /^Pedir pista/ }),
  ).toBeDisabled();
  await expect(solutionHeading).toHaveCount(0);
  await page
    .getByRole("button", { name: "Mostrar solución calculada", exact: true })
    .click();
  await expect(solutionHeading).toBeVisible();
  const solution = page.locator(
    'section[aria-label="Solución calculada por la izquierda"]',
  );
  await expect(solution.locator("ol li").last().locator("code")).toHaveText(
    "a a b b",
  );
  await page
    .getByRole("button", { name: "Ocultar solución", exact: true })
    .click();
  await expect(solutionHeading).toHaveCount(0);
  await noPageOverflow(page);
});

test("aplica una gramática propia, rechaza definiciones y pasos inválidos y acepta una alternativa válida", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Modo libre", exact: true }).click();
  const definition = page.getByRole("textbox", {
    name: "Producciones de la gramática",
    exact: true,
  });
  const apply = page.getByRole("button", { name: applyName, exact: true });
  await expect(definition).toBeEditable();
  await definition.fill("S -> A");
  await expect(
    page.getByText(
      "Hay cambios sin aplicar. Aplica la gramática para volver a derivar.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(apply).toBeDisabled();
  await page
    .getByRole("button", { name: "Aplicar gramática", exact: true })
    .click();
  await expect(page.locator(".module-page").getByRole("alert")).toContainText(
    "no tiene ninguna producción definida",
  );
  await expect(apply).toBeDisabled();
  await definition.fill("S -> A | B\nA -> a\nB -> a");
  await page
    .getByRole("button", { name: "Aplicar gramática", exact: true })
    .click();
  await expect(page.locator(".module-page").getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Cadena objetivo", exact: true })
    .fill("a");
  const productions = page.getByLabel("Producción a aplicar", { exact: true });
  await productions.selectOption({ label: "A → a" });
  await apply.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Revisa el paso." }),
  ).toContainText("seleccionaste S");
  await expect(
    page.getByLabel("Historial de derivación").locator("li"),
  ).toHaveCount(1);
  // The B alternative is valid even though the bounded solution finder chooses A first.
  await productions.selectOption({ label: "S → B" });
  await apply.click();
  await expect(
    page.getByRole("button", {
      name: "No terminal B, posición 1",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await apply.click();
  await expect(
    page.getByText("Objetivo alcanzado: a", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Historial de derivación").locator("li"),
  ).toHaveCount(3);
  await definition.fill("S ->");
  await expect(
    page.getByRole("button", {
      name: "Mostrar solución calculada",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Aplicar gramática", exact: true })
    .click();
  await expect(page.locator(".module-page").getByRole("alert")).toContainText("alternativa está vacía");
  await expect(
    page.getByText("Objetivo alcanzado: a", { exact: true }),
  ).toHaveCount(0);
  await noPageOverflow(page);
});

test("compara dos órdenes calculados y verifica la misma cadena terminal", async ({
  page,
}) => {
  await page
    .getByLabel("Ejercicio", { exact: true })
    .selectOption("alternatives");
  await expect(
    page.getByRole("heading", {
      name: "Comparador de derivaciones",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Comparar izquierda y derecha", exact: true })
    .click();
  const left = page.locator(
    'section[aria-label="Derivación por la izquierda"]',
  );
  const right = page.locator('section[aria-label="Derivación por la derecha"]');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await expect(left.locator("ol li").last().locator("code")).toHaveText(
    "a b b",
  );
  await expect(right.locator("ol li").last().locator("code")).toHaveText(
    "a b b",
  );
  const leftForms = await left.locator("ol li code").allTextContents();
  const rightForms = await right.locator("ol li code").allTextContents();
  expect(leftForms).not.toEqual(rightForms);
  await page
    .getByRole("button", { name: "Ocultar comparador", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Comparador de derivaciones",
      exact: true,
    }),
  ).toHaveCount(0);
  await noPageOverflow(page);
});
