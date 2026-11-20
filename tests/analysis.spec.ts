import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { CORRECTED_SQL, ORIGINAL_SQL } from "../src/content/lab";
import { STORAGE_KEY } from "../src/lib/workspace";

// A dedicated server may be used when another local project already owns port 5173.
if (process.env.SYNTAXLAB_TEST_BASE_URL)
  test.use({ baseURL: process.env.SYNTAXLAB_TEST_BASE_URL });

async function savedSql(page: Page) {
  return page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) ?? "{}").sql as string | undefined,
    STORAGE_KEY,
  );
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
  await expect.poll(() => savedSql(page)).toBe(sql);
}

async function analyze(page: Page) {
  await page.getByRole("button", { name: "Analizar", exact: true }).click();
  await expect(page.locator(".analysis-summary")).toBeVisible();
}

async function corrected(page: Page) {
  await page
    .getByLabel("Ejemplo", { exact: true })
    .selectOption("propuesta-corregida");
  await expect.poll(() => savedSql(page)).toBe(CORRECTED_SQL);
  await analyze(page);
  await expect(page.locator(".analysis-summary")).toContainText(
    "Sintaxis aceptada",
  );
}

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/#otros");
  await expect(page.getByRole("heading", { name: "Prácticas", exact: true })).toBeVisible();
  const menu = page.getByRole("button", { name: "Abrir navegación", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Laboratorio SQL", exact: true }).click();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Analizar", exact: true }),
  ).toBeVisible();
});

test("el original conserva tokens inválidos, diagnósticos reales y ausencia de árboles completos", async ({
  page,
}) => {
  await expect.poll(() => savedSql(page)).toBe(ORIGINAL_SQL);
  await analyze(page);
  await expect(page.locator(".analysis-summary")).toContainText(
    "Entrada rechazada",
  );
  const filter = page.getByRole("textbox", { name: "Buscar lexema" });
  await filter.fill("==");
  await expect(page.locator(".token-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".token-table tbody tr")).toContainText(
    "No reconocido",
  );
  await filter.fill('"IT"');
  await expect(page.locator(".token-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".token-table tbody tr")).toContainText(
    "No reconocido",
  );
  await page.getByRole("button", { name: "Diagnósticos", exact: true }).click();
  await expect(page.locator(".diagnostic.error")).not.toHaveCount(0);
  await expect(page.locator(".analysis-content")).toContainText("igualdad");
  await expect(page.locator(".analysis-content")).toContainText(
    "comillas dobles",
  );
  for (const name of ["CST", "AST"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No hay árbol completo", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".tree-explorer")).toHaveCount(0);
  }
  await expect.poll(() => savedSql(page)).toBe(ORIGINAL_SQL);
  await noPageOverflow(page);
});

test("seleccionar un token marca el rango Monaco y editar invalida todos los resultados anteriores", async ({
  page,
}) => {
  await analyze(page);
  await page.getByRole("textbox", { name: "Buscar lexema" }).fill("==");
  await page.getByRole("button", { name: "==", exact: true }).click();
  await expect(
    page.locator(".monaco-editor .selected-text").first(),
  ).toBeVisible();
  await expect(page.locator(".monaco-editor textarea")).toBeFocused();
  // Replacing the public editor selection proves that exactly this token was selected.
  await page.keyboard.insertText("=");
  await expect.poll(() => savedSql(page)).toBe(ORIGINAL_SQL.replace("==", "="));
  await expect(page.locator(".analysis-summary")).toContainText(
    "Resultado desactualizado",
  );
  await expect(page.locator(".token-table")).toHaveCount(0);
  await expect(page.locator(".diagnostic")).toHaveCount(0);
  await expect(page.locator(".tree-explorer")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Volver a analizar", exact: true })
    .click();
  await expect(page.locator(".analysis-summary")).toContainText(
    "Entrada rechazada",
  );
  await expect(page.locator(".analysis-summary")).not.toContainText(
    "desactualizado",
  );
});

test("la propuesta aceptada produce CST y AST diferentes, reglas y derivaciones del texto actual", async ({
  page,
}, testInfo) => {
  await corrected(page);
  await page.getByRole("textbox", { name: "Buscar lexema" }).fill("Usuarios");
  await expect(page.locator(".token-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".token-table tbody tr")).toContainText(
    "Identificador",
  );
  await page.getByRole("button", { name: "CST", exact: true }).click();
  const tree = page.locator(".tree-explorer");
  await expect(tree).toBeVisible();
  const cstCount = await tree.locator(".tree-node").count();
  expect(cstCount).toBeGreaterThan(100);
  const colors = await Promise.all(
    ["Palabra reservada", "Número", "Texto"].map((category) =>
      tree
        .locator(`.tree-node[aria-label*="${category}"] rect`)
        .first()
        .getAttribute("fill"),
    ),
  );
  expect(colors.every(Boolean)).toBe(true);
  expect(new Set(colors).size).toBe(3);
  await expect(tree.locator(".tree-node-details")).toContainText("Regla");
  await tree.screenshot({ path: testInfo.outputPath("corrected-cst.png") });
  await testInfo.attach("CST de la propuesta corregida", {
    path: testInfo.outputPath("corrected-cst.png"),
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "AST", exact: true }).click();
  await expect(tree).toBeVisible();
  const astCount = await tree.locator(".tree-node").count();
  expect(astCount).toBeGreaterThan(5);
  expect(astCount).toBeLessThan(cstCount);
  await expect(tree.locator(".tree-legend")).toContainText("Abstracto");
  await page.getByRole("button", { name: "Producciones", exact: true }).click();
  await expect(page.locator(".rules-list li")).not.toHaveCount(0);
  await page
    .locator(".result-tabs")
    .getByRole("button", { name: "Derivaciones", exact: true })
    .click();
  const leftFinal = await page
    .locator(".sentential-list li")
    .last()
    .locator("code")
    .textContent();
  expect(leftFinal).toContain("departamento = 'IT'");
  await page
    .getByRole("button", { name: "Por la derecha", exact: true })
    .click();
  await expect(
    page.locator(".sentential-list li").last().locator("code"),
  ).toHaveText(leftFinal!);
  await expect.poll(() => savedSql(page)).toBe(CORRECTED_SQL);
  await noPageOverflow(page);
});

test("el parser rechaza paréntesis incompletos y el catálogo explícito resuelve nombres y tipos", async ({
  page,
}) => {
  await replaceSql(page, "SELECT (1 + 2");
  await analyze(page);
  await expect(page.locator(".analysis-summary")).toContainText(
    "Entrada rechazada",
  );
  await page.getByRole("button", { name: "Diagnósticos", exact: true }).click();
  await expect(page.locator(".diagnostic.error")).toContainText("Sintáctico");
  await expect(page.locator(".diagnostic.error")).toContainText(")");
  await corrected(page);
  await page.getByRole("button", { name: "Diagnósticos", exact: true }).click();
  await expect(page.locator(".analysis-content")).toContainText(
    "No hay catálogo configurado",
  );
  await expect(page.locator(".diagnostic.error")).toHaveCount(0);
  await page.locator(".catalog-panel summary").click();
  await page
    .getByRole("button", { name: "Cargar catálogo de ejemplo", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Catálogo de símbolos JSON" }),
  ).toHaveValue(/"Usuarios"/);
  await page
    .getByRole("button", { name: "Aplicar catálogo", exact: true })
    .click();
  await expect(page.locator(".analysis-content")).toContainText(
    "con catálogo suficiente",
  );
  await expect(page.locator(".analysis-summary")).toContainText("0 errores");
  await expect(page.locator(".diagnostic.error")).toHaveCount(0);
  await replaceSql(page, "SELECT columnaInexistente");
  await analyze(page);
  await expect(page.locator(".analysis-summary")).toContainText(
    "Sintaxis aceptada",
  );
  await expect(page.locator(".diagnostic.error")).toContainText(
    "La columna columnaInexistente no existe en Usuarios.",
  );
  await noPageOverflow(page);
});

test("el árbol permite zoom, desplazamiento, ramas, teclado, recorrido progresivo y SVG autónomo", async ({
  page,
}, testInfo) => {
  await replaceSql(page, "SELECT (1 + 2) * 3 AS resultado");
  await analyze(page);
  await page.getByRole("button", { name: "CST", exact: true }).click();
  const tree = page.locator(".tree-explorer");
  const nodes = tree.locator(".tree-node");
  const totalNodes = await nodes.count();
  expect(totalNodes).toBeGreaterThan(10);
  const zoom = tree.locator(".tree-zoom");
  const initialZoom = Number((await zoom.textContent())!.replace("%", ""));
  await tree
    .getByRole("button", { name: "Acercar árbol", exact: true })
    .click();
  expect(Number((await zoom.textContent())!.replace("%", ""))).toBeGreaterThan(
    initialZoom,
  );
  await tree.getByRole("button", { name: "Alejar árbol", exact: true }).click();
  expect(
    Math.abs(
      Number((await zoom.textContent())!.replace("%", "")) - initialZoom,
    ),
  ).toBeLessThanOrEqual(1);
  const rootToggle = tree.locator(".tree-branch-toggle").first();
  await rootToggle.press("Enter");
  await expect(nodes).toHaveCount(1);
  await expect(rootToggle).toHaveAttribute("aria-expanded", "false");
  await rootToggle.press("Space");
  await expect(nodes).toHaveCount(totalNodes);
  await nodes.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tree.locator(".tree-selected-label")).not.toHaveText(
    "statement",
  );
  await expect(
    page.locator(".monaco-editor .selected-text").first(),
  ).toBeVisible();
  await expect(tree.locator(".tree-node[aria-pressed=true]")).toBeFocused();
  const currentLabel = await tree.locator(".tree-selected-label").textContent();
  await page.keyboard.press("ArrowDown");
  await expect(tree.locator(".tree-selected-label")).not.toHaveText(
    currentLabel!,
  );
  await expect(tree.locator(".tree-node[aria-pressed=true]")).toBeFocused();
  await tree
    .getByRole("button", { name: "Ver en el editor", exact: true })
    .click();
  await expect(page.locator(".monaco-editor textarea")).toBeFocused();
  const slider = tree.getByRole("slider", { name: /Recorrido en preorden/ });
  await slider.press("Home");
  await expect(nodes).toHaveCount(1);
  await slider.press("ArrowRight");
  await expect(nodes).toHaveCount(2);
  await tree
    .getByRole("button", { name: "Mostrar el siguiente nodo", exact: true })
    .click();
  await expect(nodes).toHaveCount(3);
  await tree
    .getByRole("button", { name: "Mostrar un nodo menos", exact: true })
    .click();
  await expect(nodes).toHaveCount(2);
  const visibleTransform = await tree
    .locator("[data-tree-diagram]")
    .getAttribute("transform");
  const pendingDownload = page.waitForEvent("download");
  await tree
    .getByRole("button", {
      name: "Exportar árbol visible como SVG",
      exact: true,
    })
    .click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe("syntaxlab-arbol.svg");
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const svg = await readFile(filePath!, "utf8");
  const exported = await page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, "image/svg+xml");
    const root = document.documentElement;
    return {
      error: Boolean(document.querySelector("parsererror")),
      root: root.localName,
      count: document.querySelectorAll(".tree-node").length,
      transform: document
        .querySelector("[data-tree-diagram]")
        ?.getAttribute("transform"),
      bounds: root.getAttribute("viewBox")?.split(" ").map(Number),
      texts: [...document.querySelectorAll("text")]
        .map((text) => text.textContent)
        .join(" "),
    };
  }, svg);
  expect(exported.error).toBe(false);
  expect(exported.root).toBe("svg");
  expect(exported.count).toBe(2);
  expect(exported.transform).toBe(visibleTransform);
  expect(exported.bounds).toHaveLength(4);
  expect(exported.bounds!.every(Number.isFinite)).toBe(true);
  expect(exported.bounds![2]).toBeGreaterThan(0);
  expect(exported.bounds![3]).toBeGreaterThan(0);
  expect(exported.texts.length).toBeGreaterThan(0);
  await tree
    .getByRole("button", { name: "Restablecer árbol", exact: true })
    .click();
  await expect(nodes).toHaveCount(totalNodes);
  await tree
    .getByRole("button", { name: "Ajustar árbol a la vista", exact: true })
    .click();
  const canvas = tree.locator(".tree-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const beforePan = await tree
    .locator("[data-tree-diagram]")
    .getAttribute("transform");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 8, bounds!.y + 40);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 48, bounds!.y + 70, { steps: 4 });
  await page.mouse.up();
  await expect(tree.locator("[data-tree-diagram]")).not.toHaveAttribute(
    "transform",
    beforePan!,
  );
  await tree
    .getByRole("button", { name: "Ajustar árbol a la vista", exact: true })
    .click();
  await expect(tree.locator("[data-tree-diagram]")).toHaveAttribute(
    "transform",
    beforePan!,
  );
  const fullscreen = tree.getByRole("button", {
    name: "Ver árbol en pantalla completa",
    exact: true,
  });
  if (await fullscreen.count()) {
    await fullscreen.click();
    await expect(
      tree.getByRole("button", {
        name: "Salir de pantalla completa",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await tree
      .getByRole("button", { name: "Salir de pantalla completa", exact: true })
      .click();
  }
  await tree.screenshot({ path: testInfo.outputPath("tree-controls.png") });
  await testInfo.attach("Árbol tras navegación y exportación", {
    path: testInfo.outputPath("tree-controls.png"),
    contentType: "image/png",
  });
  await noPageOverflow(page);
});
