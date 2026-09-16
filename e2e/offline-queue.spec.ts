import { expect, test } from "@playwright/test";
import { visitOnline, waitForCached } from "./helpers";

// Fase 6: alur inti kasir hajatan — input saat offline tidak hilang,
// bertahan setelah reload, lalu tersync saat online.
test("input offline → reload → online → tersync", async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Daftar akun acak (mandiri, tidak mengotori data lain).
  await page.goto("/register");
  await page.getByPlaceholder("Nama lengkap").fill(`E2E ${stamp}`);
  await page.getByPlaceholder("username").fill(`e2e${stamp}`);
  await page.getByPlaceholder("Email").fill(`e2e-${stamp}@example.com`);
  await page.getByPlaceholder("Password (min 6 karakter)").fill("rahasia123");
  await page.getByRole("button", { name: "Buat Akun", exact: true }).click();
  await page.waitForURL("**/dashboard");

  // 2. Buat acara via API (deterministik; sesi cookie ikut konteks).
  // Semua acara online, tidak ada lagi field mode.
  const evRes = await context.request.post("/api/events", {
    data: {
      namaAcara: `E2E Hajatan ${stamp}`,
      namaTuanRumah: "E2E Tuan Rumah",
      tanggal: "2026-09-20",
    },
  });
  expect(evRes.ok()).toBeTruthy();
  const event = await evRes.json();
  const eventId: string = event.id;
  expect(eventId).toBeTruthy();

  try {
    const nama = `E2E Tamu ${stamp}`;
    const alamat = `E2E Krajan ${stamp}`;

    // 3. Buka acara saat online (terkontrol SW + dokumen ter-cache).
    await visitOnline(page, `/events/${eventId}`);
    await expect(page.locator("#nama-input")).toBeVisible();
    await waitForCached(page, `/events/${eventId}`);

    // 4. Putus koneksi → input tetap bisa.
    await context.setOffline(true);
    await page.locator("#nama-input").fill(nama);
    await page.getByPlaceholder("Nama desa/kampung").fill(alamat);
    await page.locator("#nominal-input").fill("50000");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();

    // Antrean terlihat: banner offline + baris bertanda pending.
    await expect(page.getByText(/tersimpan di perangkat \(1\)/)).toBeVisible();
    const row = page.locator("tr, div", { hasText: nama }).filter({ hasText: "pending" }).first();
    await expect(row).toBeVisible();

    // 5. Reload saat offline → data antrean tidak hilang.
    await page.reload();
    await expect(page.locator("#nama-input")).toBeVisible();
    await expect(page.getByText(/tersimpan di perangkat \(1\)/)).toBeVisible();
    await expect(page.getByText(nama).first()).toBeVisible();

    // 6. Online lagi → sync via tombol sync TopBar (hijau = sudah sync).
    await context.setOffline(false);
    await page.getByRole("button", { name: /belum sync|tersinkron|Offline/i }).first().click();
    await expect(page.getByText(/tersimpan di perangkat/)).toBeHidden({ timeout: 30_000 });

    const listRes = await context.request.get(
      `/api/events/${eventId}/guests?q=${encodeURIComponent(nama)}`
    );
    expect(listRes.ok()).toBeTruthy();
    const list = await listRes.json();
    // Server menyimpan versi title-case (toTitleCasePerKata) → bandingkan case-insensitive.
    expect(JSON.stringify(list).toLowerCase()).toContain(nama.toLowerCase());
  } finally {
    // Bersih-bersih agar DB dev tidak penuh data uji.
    await context.request.delete(`/api/events/${eventId}`).catch(() => {});
    await context.close();
  }
});
