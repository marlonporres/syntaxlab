import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function navigate(page: Page, name: string) {
  await expect(page.locator(".app-shell .topbar")).toBeVisible();
  const menu = page.getByRole("button", { name: "Abrir navegación", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator(".main-nav").getByRole("button", { name, exact: true }).click();
}
async function writeSql(page: Page, sql: string) {
  const editor = page.locator(".monaco-editor textarea");
  await editor.focus();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await page.keyboard.insertText(sql);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/#otros");
  await navigate(page, "Árbol sintáctico");
  await expect(page.getByRole("heading", { name: "Árbol sintáctico", exact: true })).toBeVisible();
  await expect(page.locator(".monaco-editor")).toBeVisible();
});
test("una sentencia propia genera CST y AST a todo el ancho y conserva el borrador", async ({ page }) => {
  const sql = "SELECT precio * cantidad + 7 AS total";
  await writeSql(page, sql);
  await expect(page.getByLabel("Ejemplo para el árbol")).toHaveValue("custom");
  await page.getByRole("button", { name: "Generar árbol", exact: true }).click();
  await expect(page.locator(".tree-result")).toContainText("Sintaxis aceptada");
  await expect(page.locator(".tree-node").filter({ hasText: "precio" }).first()).toBeVisible();
  const cstCount = await page.locator(".tree-node").count();
  await page.getByRole("button", { name: "AST · Árbol abstracto", exact: true }).click();
  await expect.poll(() => page.locator(".tree-node").count()).toBeLessThan(cstCount);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const widths = await page.evaluate(() => ({ tree: document.querySelector(".tree-explorer")!.getBoundingClientRect().width, container: document.querySelector(".syntax-tree-page")!.getBoundingClientRect().width }));
  expect(widths.tree).toBeGreaterThan(widths.container * .95);
  await page.reload();
  await navigate(page, "Árbol sintáctico");
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("precio");
  await page.getByRole("button", { name: "Generar árbol", exact: true }).click();
  await expect(page.locator(".tree-result")).toContainText("Sintaxis aceptada");
});
test("editar invalida el árbol y los errores no generan una estructura inventada", async ({ page }) => {
  await page.getByLabel("Ejemplo para el árbol").selectOption("select-basico");
  await page.getByRole("button", { name: "Generar árbol", exact: true }).click();
  await expect(page.locator(".tree-explorer")).toBeVisible();
  await writeSql(page, "SELECT (2 +");
  await expect(page.locator(".tree-explorer")).toHaveCount(0);
  await expect(page.getByText("La sentencia cambió. Pulsa Generar árbol para actualizarlo.")).toBeVisible();
  await page.getByRole("button", { name: "Generar árbol", exact: true }).click();
  await expect(page.getByRole("region", { name: "Errores de la sentencia" })).toBeVisible();
  await expect(page.locator(".tree-explorer")).toHaveCount(0);
  await writeSql(page, "SELECT CASE WHEN nota >= 61 THEN 'Aprobado' ELSE 'Repasar' END AS resultado");
  await page.locator(".monaco-editor textarea").press("ControlOrMeta+Enter");
  await expect(page.locator(".tree-explorer")).toBeVisible();
  await navigate(page, "Laboratorio SQL");
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("nota");
});
