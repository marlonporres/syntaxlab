import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { CORRECTED_SQL, EXAMPLES } from "../src/content/lab";
import { STORAGE_KEY } from "../src/lib/workspace";
import type { WorkspaceState } from "../src/lib/workspace";

// Independent fixture: the classroom input must remain unchanged, including its unusual syntax.
const ORIGINAL = `INSERT INTO Usuarios (Usuario, nombre, perfil, clave, estado)
SELECT
    left(nombre, 1) + apellido,
    nombre + apellido,
    CASE WHEN departamento == "IT" THEN 1 ELSE 0 END perfil,
    generaClave(nombre, edad) clave,
    1)`;

async function savedWorkspace(page: Page): Promise<WorkspaceState | null> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    STORAGE_KEY,
  );
}

async function expectSavedSql(page: Page, sql: string) {
  await expect.poll(async () => (await savedWorkspace(page))?.sql).toBe(sql);
}

async function expectEditorSql(page: Page, sql: string) {
  await expect(page.locator(".monaco-editor")).toBeVisible();
  // Monaco renders spaces as NBSP; the editor's public DOM exposes each visible line.
  await expect
    .poll(async () =>
      page
        .locator(".monaco-editor .view-line")
        .evaluateAll((lines) =>
          lines
            .map((line) => (line.textContent ?? "").replace(/\u00a0/g, " "))
            .join("\n"),
        ),
    )
    .toBe(sql);
}

async function replaceSql(page: Page, sql: string) {
  const editor = page.locator(".monaco-editor");
  await expect(editor).toBeVisible();
  await editor.click({ position: { x: 100, y: 45 } });
  const input = editor.locator("textarea");
  await input.focus();
  await input.press("ControlOrMeta+A");
  await input.press("Backspace");
  if (sql) await page.keyboard.insertText(sql);
  await expectSavedSql(page, sql);
}

async function openNavigation(page: Page) {
  await expect(page.locator(".app-shell .topbar")).toBeVisible();
  const mobileMenu = page.getByRole("button", {
    name: "Abrir navegación",
    exact: true,
  });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await expect(
    page.getByRole("complementary", { name: "Navegación del laboratorio" }),
  ).toBeVisible();
}

async function navigate(page: Page, label: string) {
  await openNavigation(page);
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/#otros");
  await navigate(page, "Laboratorio SQL");
  await expect(
    page.getByRole("heading", { name: "Laboratorio SQL" }),
  ).toBeVisible();
  await expect(page.locator(".monaco-editor")).toBeVisible();
});

test("conserva la pizarra exacta en Monaco y en el borrador local", async ({
  page,
}) => {
  await expectEditorSql(page, ORIGINAL);
  await expectSavedSql(page, ORIGINAL);
  expect(await savedWorkspace(page)).toMatchObject({
    version: 1,
    exampleId: "original",
  });
  await expect(
    page.getByText("Entrada original conservada", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Guardado local", { exact: true })).toBeVisible();
});

test("edita de verdad y recupera texto y preferencias al recargar", async ({
  page,
}) => {
  const draft = "SELECT nombre, 'mi borrador' AS mensaje\nFROM Usuarios";
  await replaceSql(page, draft);
  await expectEditorSql(page, draft);
  await page.getByRole("button", { name: "Aumentar tamaño de texto" }).click();
  await page.getByRole("button", { name: "Aumentar tamaño de texto" }).click();
  await page.getByRole("button", { name: "Ocultar resultados", exact: true }).click();
  await expect(
    page.getByRole("complementary", {
      name: "Resultados del análisis SQL",
    }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await savedWorkspace(page))?.fontSize)
    .toBe(16);
  await expect
    .poll(async () => (await savedWorkspace(page))?.inspectorOpen)
    .toBe(false);

  await page.reload();
  await navigate(page, "Laboratorio SQL");
  await expectEditorSql(page, draft);
  await expect(page.locator(".font-size")).toHaveText("16");
  await expect(
    page.getByRole("button", { name: "Mostrar resultados", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mostrar resultados", exact: true }).click();
  await expect(
    page.getByRole("complementary", {
      name: "Resultados del análisis SQL",
    }),
  ).toBeVisible();
});

test("carga los ejemplos y conserva la corrección separada de la entrada original", async ({
  page,
}) => {
  const select = page.getByLabel("Ejemplo", { exact: true });
  for (const example of EXAMPLES) {
    await select.selectOption(example.id);
    await expectSavedSql(page, example.sql);
    await expectEditorSql(page, example.sql);
  }
  await expectSavedSql(page, CORRECTED_SQL);
  expect(CORRECTED_SQL).not.toBe(ORIGINAL);

  const draft = "SELECT 42 AS borrador";
  await replaceSql(page, draft);
  await select.selectOption("original");
  await expectEditorSql(page, ORIGINAL);
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expectEditorSql(page, draft);
  await select.selectOption("original");
  await expectSavedSql(page, ORIGINAL);
});

test("analiza el SQL actual y renueva los resultados al editar o vaciar la entrada", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Analizar", exact: true }).click();
  await expect(page.locator(".analysis-summary")).toContainText(
    "Entrada rechazada",
  );
  await expect(
    page.getByRole("button", { name: "Tokens", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".token-table")).toBeVisible();

  await replaceSql(page, "SELECT 2 AS numero");
  await expect(page.locator(".analysis-summary")).toContainText(
    "Resultado desactualizado",
  );
  await expect(page.locator(".token-table")).toHaveCount(0);
  await page.locator(".monaco-editor textarea").press("ControlOrMeta+Enter");
  await expect(page.locator(".analysis-summary")).toContainText(
    "Sintaxis aceptada",
  );
  await expect(page.locator(".token-table tbody tr")).toHaveCount(4);
  await replaceSql(page, "  \n ");
  await page.getByRole("button", { name: "Analizar", exact: true }).click();
  await expect(page.locator(".analysis-summary")).toContainText(
    "Entrada rechazada",
  );
  await page.getByRole("button", { name: "Diagnósticos", exact: true }).click();
  await expect(page.locator(".diagnostic.error")).toContainText("Sintáctico");
  await expectSavedSql(page, "  \n ");
});

test("explora árboles del SQL aceptado y navega a las prácticas y la evaluación", async ({
  page,
}) => {
  await page
    .getByLabel("Ejemplo", { exact: true })
    .selectOption("select-basico");
  await page.getByRole("button", { name: "Analizar", exact: true }).click();
  await expect(page.locator(".analysis-summary")).toContainText(
    "Sintaxis aceptada",
  );
  await page.getByRole("button", { name: "CST", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Explorador del árbol", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".tree-node")).not.toHaveCount(0);
  await navigate(page, "Prácticas");
  await expect(
    page.getByRole("heading", {
      name: "Prácticas",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Opciones de respuesta", exact: true }),
  ).toBeVisible();
  await navigate(page, "Laboratorio SQL");
  await navigate(page, "Evaluarme");
  await expect(
    page.getByRole("heading", { name: "Evaluarme", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Comprobar respuesta", exact: true }),
  ).toBeDisabled();
  await navigate(page, "Laboratorio SQL");
  await expect(page.locator(".monaco-editor")).toBeVisible();
});

test("repasa un tema sin perder el borrador ni desbordar la pantalla", async ({ page }) => {
  const draft = "SELECT 7 AS conservar";
  await replaceSql(page, draft);
  await navigate(page, "Repaso");
  await expect(page.getByRole("heading", { name: "Repaso", exact: true })).toBeVisible();
  await expect(page.locator(".review-topic")).toHaveCount(18);
  await page.locator(".review-topic > summary").first().click();
  await expect(page.locator(".review-content").first()).toBeVisible();
  await expectNoPageOverflow(page);
  await navigate(page, "Laboratorio SQL");
  await expectEditorSql(page, draft);
});

test("ajusta la guía con el teclado dentro de sus límites y conserva el ancho", async ({
  page,
}, testInfo) => {
  test.skip(
    (testInfo.project.use.viewport?.width ?? 0) <= 1000,
    "El separador se usa cuando los paneles están lado a lado.",
  );
  const separator = page.getByRole("separator", {
    name: "Ajustar ancho de los resultados",
  });
  await separator.focus();
  await expect(separator).toBeFocused();
  await separator.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "38");
  await separator.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "36");
  for (let count = 0; count < 7; count += 1) await separator.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "48");
  for (let count = 0; count < 11; count += 1)
    await separator.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "28");
  await expect
    .poll(async () => (await savedWorkspace(page))?.panelWidth)
    .toBe(28);
  await page.reload();
  await navigate(page, "Laboratorio SQL");
  await expect(separator).toHaveAttribute("aria-valuenow", "28");
});

test("la ayuda recibe el foco, lo mantiene en el diálogo y cierra con Escape", async ({
  page,
}) => {
  let trigger = page.getByRole("button", { name: "Abrir ayuda", exact: true });
  if (!(await trigger.isVisible())) {
    await openNavigation(page);
    trigger = page.getByRole("button", { name: "Ayuda y atajos", exact: true });
  }
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Cerrar ayuda" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Continuar" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Cerrar ayuda" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("descarga un archivo con el SQL exacto del estudiante", async ({
  page,
}) => {
  const draft = "SELECT 'archivo propio' AS mensaje\n-- guardado sin cambios";
  await replaceSql(page, draft);
  const pendingDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar archivo SQL", exact: true })
    .click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe("syntaxlab-consulta.sql");
  const file = await download.path();
  expect(file).not.toBeNull();
  expect(await readFile(file!, "utf8")).toBe(draft);
});

test("abre y cierra el menú móvil y mantiene las acciones principales visibles", async ({
  page,
}, testInfo) => {
  test.skip(
    (testInfo.project.use.viewport?.width ?? 0) > 700,
    "El menú superpuesto corresponde al ancho móvil.",
  );
  const navigation = page.getByRole("complementary", {
    name: "Navegación del laboratorio",
  });
  await expect(navigation).not.toBeVisible();
  await openNavigation(page);
  const close = page.getByRole("button", {
    name: "Cerrar navegación",
    exact: true,
  });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Ayuda y atajos", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(navigation).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir navegación", exact: true }),
  ).toBeFocused();
  await openNavigation(page);
  await page
    .getByRole("button", { name: "Cerrar menú", exact: true })
    .click({ position: { x: 370, y: 200 } });
  await expect(navigation).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Analizar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Descargar archivo SQL", exact: true }),
  ).toBeVisible();
  await expectNoPageOverflow(page);
});
