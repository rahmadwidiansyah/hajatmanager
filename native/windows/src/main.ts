/**
 * Tauri wrapper — loads Next.js export (out/) or dev server http://localhost:3000.
 * Handles:
 * - SQLite init via tauri-plugin-sql (see packages/shared-core)
 * - Secure store for JWT + PIN hash via tauri-plugin-store (encrypted)
 * - OS info via tauri-plugin-os
 *
 * For dev: `npm run tauri:dev` loads Next dev server (auto-sync 30m via lib/offline-sync.ts).
 * For prod: `NATIVE_BUILD=1 npm run build` in root generates out/ then `tauri build` bundles NSIS exe.
 */
export {};
declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_OS__?: string;
  }
}

async function init() {
  console.log("[tauri] Hajat Manager Windows — offline-first");
  try {
    const { platform } = await import("@tauri-apps/plugin-os");
    const p = await platform();
    (window as unknown as { __TAURI_OS__?: string }).__TAURI_OS__ = p;
    console.log("[tauri] platform:", p);
  } catch {}

  // Wire secure store (tauri-plugin-store) + SQLite adapter into web lib/* if available
  try {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore("hajat-manager.dat");
    const { setSecureStoreAdapter } = await import("../../../lib/secure-store");
    setSecureStoreAdapter({
      get: async (k) => (await store.get<string>(k)) ?? null,
      set: async (k, v) => { await store.set(k, v); await store.save(); },
      remove: async (k) => { await store.delete(k); await store.save(); },
    });
    console.log("[tauri] secure store wired");
  } catch (e) { console.warn("[tauri] store wiring skipped", e); }

  try {
    const Database = (await import("@tauri-apps/plugin-sql")).default;
    const db = await Database.load("sqlite:hajat_manager.db");
    // Create tables via shared-core SQL
    const { CREATE_TABLES_SQL } = await import("../../../packages/shared-core/src/db");
    for (const stmt of CREATE_TABLES_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.execute(stmt);
    }
    const { setSqliteAdapter } = await import("../../../lib/offline-sync");
    setSqliteAdapter({
      exec: async (sql, params) => { await db.execute(sql, params as unknown[]); },
      query: async (sql, params) => (await db.select(sql, params as unknown[])) as unknown[],
    });
    console.log("[tauri] sqlite wired");
  } catch (e) { console.warn("[tauri] sqlite wiring skipped", e); }
}

init();

// Next.js will be loaded via tauri.conf.json devUrl / frontendDist — no manual navigation needed.
