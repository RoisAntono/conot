import { expect, test, type Page } from "@playwright/test";

test("login mock, pilih guild, tambah tracker, kirim preview, buka observability", async ({ page }, testInfo) => {
  const title = `Smoke Channel ${testInfo.project.name} ${Date.now().toString(36)}`;
  const isMobile = (page.viewportSize()?.width || 0) < 768;
  await page.goto("/");

  const loginButton = page.getByRole("button", { name: "Login dengan Discord" });
  if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginButton.click();
  }
  await expect(page.getByRole("heading", { name: "Pilih guild" })).toBeVisible();

  await page.getByRole("button", { name: /Guild 5678/ }).click();
  await expect(page.getByText("Setup Wizard")).toBeVisible();
  await expect(page.getByRole("button", { name: /Refresh guild/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Refresh$/i })).toHaveCount(0);
  await assertNoGlobalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("overview.png"), fullPage: true });

  await page.getByRole("button", { name: "Trackers" }).first().click();
  await expect(page.getByRole("button", { name: "Tambah Tracker" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Tambah Tracker" }).first().click();

  const drawer = page.locator(".drawer");
  await expect(drawer.getByRole("heading", { name: "Tambah tracker" })).toBeVisible();
  if (isMobile) {
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox?.width || 0).toBeGreaterThanOrEqual((page.viewportSize()?.width || 0) - 1);
  }
  await drawer.getByLabel("YouTube Username/Handle").fill("@smoke");
  await drawer.getByLabel("YouTube Channel ID").fill("UCcccccccccccccccccccccc");
  await drawer.getByLabel("YouTube Title").fill(title);
  await drawer.getByLabel("Target Discord ID").fill("888888888888888888");
  await drawer.getByRole("button", { name: "Tambah Tracker" }).click();
  await expect(page.getByText("Tracker ditambahkan.")).toBeVisible();
  await expect(page.locator(isMobile ? ".data-card-list" : ".data-table-desktop").getByText(title).first()).toBeVisible();

  if (isMobile) {
    await expect(page.locator(".data-card-list").first()).toBeVisible();
  } else {
    await expect(page.locator(".data-table-desktop").first()).toBeVisible();
  }
  await assertNoGlobalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("trackers.png"), fullPage: true });

  await page.getByRole("button", { name: "Aksi" }).first().click();
  await page.getByRole("menuitem", { name: "Test" }).click();
  await expect(page.getByText("Test notification diterima.")).toBeVisible();

  await page.getByRole("button", { name: "Aksi" }).first().click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page.locator(".drawer").getByRole("heading", { name: "Edit tracker" })).toBeVisible();
  await page.getByRole("button", { name: "Tutup panel" }).click();
  await expect(page.locator(".drawer")).toBeHidden();

  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.getByRole("heading", { name: "Konfigurasi Guild" })).toBeVisible();
  const prefix = page.getByLabel("Prefix");
  await prefix.fill("");
  await page.getByRole("button", { name: "Simpan Settings" }).click();
  await expect(page.getByText("Prefix wajib diisi.")).toBeVisible();
  await prefix.fill("?n");

  await page.getByRole("button", { name: "Title Watches" }).first().click();
  await page.getByRole("button", { name: "Tambah Title Watch" }).first().click();
  await expect(page.locator(".drawer").getByRole("heading", { name: "Tambah title watch" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".drawer")).toBeHidden();

  await page.getByRole("button", { name: "Logs" }).first().click();
  await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
  await page.getByRole("button", { name: /Filter|Tutup Filter/ }).click();
  await page.getByRole("button", { name: /Filter|Tutup Filter/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "CSV" }).click();
  await downloadPromise;

  await page.getByRole("button", { name: "Audit" }).first().click();
  await expect(page.getByRole("heading", { name: "Audit" })).toBeVisible();
  await assertNoGlobalOverflow(page);
});

async function assertNoGlobalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
