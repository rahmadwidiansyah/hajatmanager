/**
 * Capacitor Android entry — loads Next.js out/ in WebView.
 * - SQLite via @capacitor-community/sqlite (encrypted, jeep-sqlite fallback)
 * - Network via @capacitor/network (online listener for 30m background sync)
 * - Preferences via @capacitor/preferences (secure store for JWT + PIN hash fallback)
 *
 * Web code detects Capacitor via `window.Capacitor` and uses SQLite adapter
 * in packages/shared-core instead of localStorage queue.
 */
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";
import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";

declare global {
  interface Window {
    Capacitor?: unknown;
  }
}

export const isCapacitor = () => Capacitor.isNativePlatform();

export async function initAndroid() {
  if (!isCapacitor()) return;
  console.log("[capacitor] Hajat Manager Android — offline-first");

  // Secure store adapter -> lib/secure-store
  try {
    const { setSecureStoreAdapter } = await import("../../../lib/secure-store");
    setSecureStoreAdapter({
      get: async (k) => (await Preferences.get({ key: k })).value,
      set: async (k, v) => { await Preferences.set({ key: k, value: v }); },
      remove: async (k) => { await Preferences.remove({ key: k }); },
    });
    console.log("[capacitor] secure store wired");
  } catch (e) { console.warn("[capacitor] prefs wiring skipped", e); }

  // SQLite adapter -> lib/offline-sync
  try {
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const ret = await sqlite.checkConnectionsConsistency();
    console.log("[capacitor] sqlite consistency:", ret);
    const { CREATE_TABLES_SQL } = await import("../../../packages/shared-core/src/db");
    // Create/open DB via helper (native/android/src/sqlite.ts)
    const { getDb } = await import("./sqlite");
    const db = await getDb();
    console.log("[capacitor] sqlite db ready");
    const { setSqliteAdapter } = await import("../../../lib/offline-sync");
    setSqliteAdapter({
      exec: async (sql, params) => { await db.execute(sql, params as unknown as (string | number)[]); },
      query: async (sql, params) => (await db.query(sql, params as unknown as (string | number)[])).values ?? [],
    });
  } catch (e) {
    console.warn("[capacitor] sqlite init warn:", e);
  }

  // Network listener — triggers background sync in lib/offline-sync.ts (30m interval already)
  try {
    Network.addListener("networkStatusChange", (status) => {
      console.log("[capacitor] network:", status.connected, status.connectionType);
      window.dispatchEvent(new CustomEvent("capacitor-network-change", { detail: status }));
      window.dispatchEvent(new CustomEvent("online"));
      if (status.connected) window.dispatchEvent(new Event("online"));
    });
    const status = await Network.getStatus();
    console.log("[capacitor] initial network:", status);
  } catch {}

  try {
    const { value } = await Preferences.get({ key: "appPinHashSet" });
    console.log("[capacitor] pin set:", !!value);
  } catch {}
}

initAndroid();
