import { expect, test } from "@playwright/test";
import { visitOnline, waitForCached } from "./helpers";

// Fase 6: permukaan offline yang tidak butuh login.
test("manifest + ikon PWA disajikan", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const j = await manifest.json();
  expect(j.short_name).toBe("Hajat");
  expect(j.display).toBe("standalone");
  for (const icon of j.icons) {
    const r = await request.get(icon.src);
    expect(r.ok()).toBeTruthy();
  }
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
});

test("navigasi offline ke halaman tak dikenal jatuh ke /offline", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Kunjungi dulu agar SW terpasang, terkontrol, & fallback ter-cache.
  await visitOnline(page, "/");
  await waitForCached(page, "/offline.html");
  await context.setOffline(true);
  await page.goto(`/tak-ada-${Date.now()}`);
  await expect(page.getByText("Kamu sedang offline")).toBeVisible();
  await context.close();
});

test("/unlock tampilkan kunci PIN saat offline", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Alur nyata: pernah dibuka online → reload saat offline.
  await visitOnline(page, "/unlock?event=abc");
  await expect(page.getByLabel("PIN 6 digit")).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel("PIN 6 digit")).toBeVisible();
  await context.close();
});
