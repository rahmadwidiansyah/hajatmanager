import { defineConfig, devices } from "@playwright/test";

// Fase 6: E2E offline. Wajib jalan lawan PRODUCTION build (`npm start`)
// karena Service Worker hanya aktif di production (nonaktif di `next dev`).
// Port via E2E_PORT (default 3000) agar tidak rebutan dengan service lain.
const PORT = process.env.E2E_PORT ?? "3000";
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Serial: berbagi satu server + satu database.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `PORT=${PORT} npm start`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
