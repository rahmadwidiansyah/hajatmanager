import { expect, type Page } from "@playwright/test";

// SW dipasang saat halaman pertama dimuat, tapi navigasi awal sering
// lewat SEBELUM SW mengontrol (belum ada worker aktif) sehingga responsnya
// tidak masuk cache. Semua tes offline harus lewat helper ini dulu.
export async function waitForSWControl(page: Page, timeoutMs = 30_000) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: timeoutMs,
    })
    .toBe(true);
}

// Buka URL saat online + pastikan terkontrol & ter-cache (reload online).
export async function visitOnline(page: Page, url: string) {
  await page.goto(url);
  await waitForSWControl(page);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

// Tunggu DOKUMEN path ada di Cache Storage (navigasi / precache / runtime).
// Syarat content-type text/html agar tidak false-positive pada entri prefetch
// RSC (`/events/ID?_rsc=...`) yang pathnamenya sama tapi isinya flight data.
export async function waitForCached(page: Page, prefix: string, timeoutMs = 45_000) {
  await expect
    .poll(
      async () =>
        page.evaluate(async (p) => {
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            for (const req of await cache.keys()) {
              const u = new URL(req.url);
              if (u.pathname !== p && !u.pathname.startsWith(p + "?")) continue;
              const res = await cache.match(req);
              if (res?.headers.get("content-type")?.includes("text/html")) return true;
            }
          }
          return false;
        }, prefix),
      { timeout: timeoutMs }
    )
    .toBe(true);
}
