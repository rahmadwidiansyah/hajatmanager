"use client";

/**
 * Secure store abstraction (web only — mobile full Flutter):
 * - Web: localStorage fallback (non-secure but works offline)
 */

type StoreAdapter = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

let adapter: StoreAdapter | null = null;

export function setSecureStoreAdapter(a: StoreAdapter | null) {
  adapter = a;
}

async function lsGet(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
async function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}
async function lsRemove(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

export async function secureGet(key: string): Promise<string | null> {
  if (adapter) return adapter.get(key);
  return lsGet(key);
}
export async function secureSet(key: string, value: string): Promise<void> {
  if (adapter) return adapter.set(key, value);
  return lsSet(key, value);
}
export async function secureRemove(key: string): Promise<void> {
  if (adapter) return adapter.remove(key);
  return lsRemove(key);
}

// Convenience for PIN 6 digit
export const PIN_STORE_KEY = "appPinHashSet";
export const PIN_HASH_KEY = "appPinHash";
export const JWT_STORE_KEY = "jwt";
