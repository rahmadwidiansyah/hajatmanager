"use client";

/**
 * Fase 4 — PIN unlock offline.
 *
 * Model ancaman: PIN 6 digit melindungi data hajatan yang ter-cache di perangkat
 * saat aplikasi dibuka tanpa koneksi (server tidak bisa dihubungi, jadi tidak ada
 * sesi server). Hash bcrypt disimpan via secure-store (encrypted di native,
 * localStorage di web) — bukan PIN plaintext.
 *
 * Catatan jujur: hash di perangkat bisa di-brute-force offline oleh pemilik
 * perangkat (~1M kombinasi). Ini trade-off yang disetujui demi ketersediaan
 * di lokasi hajatan. Throttle di bawah hanya menghambat via UI.
 */

import { PIN_HASH_KEY, secureGet, secureRemove, secureSet } from "./secure-store";
import { hashPin, isValidPin, verifyPin } from "./pin";

const UNLOCK_PREFIX = "offlineUnlock:";

// Throttle upaya via UI: 5x salah → kunci 60 detik (per tab, in-memory).
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;
let fails = 0;
let lockedUntil = 0;

export function pinAttemptsLeft(): number {
  return Math.max(0, MAX_ATTEMPTS - fails);
}

export function pinLockoutUntil(): number {
  return lockedUntil;
}

/** Simpan hash PIN untuk verifikasi offline. Dipanggil setelah set/ganti PIN (online). */
export async function cachePinHash(pin: string): Promise<void> {
  if (!isValidPin(pin)) return;
  try {
    const hash = await hashPin(pin);
    await secureSet(PIN_HASH_KEY, hash);
    try {
      localStorage.setItem("appPinHashSet", "1");
    } catch {}
  } catch {}
}

/** Hapus hash PIN cache. Dipanggil setelah hapus PIN (online). */
export async function clearCachedPinHash(): Promise<void> {
  try {
    await secureRemove(PIN_HASH_KEY);
  } catch {}
  try {
    localStorage.removeItem("appPinHashSet");
  } catch {}
}

export async function hasOfflinePin(): Promise<boolean> {
  try {
    return !!(await secureGet(PIN_HASH_KEY));
  } catch {
    return false;
  }
}

export type PinCheck =
  | { ok: true }
  | { ok: false; reason: "no-pin" | "wrong" | "locked"; retryInMs?: number };

/** Verifikasi PIN offline terhadap hash yang di-cache. */
export async function verifyOfflinePin(pin: string): Promise<PinCheck> {
  if (!isValidPin(pin)) return { ok: false, reason: "wrong" };
  const now = Date.now();
  if (now < lockedUntil) return { ok: false, reason: "locked", retryInMs: lockedUntil - now };
  let hash: string | null = null;
  try {
    hash = await secureGet(PIN_HASH_KEY);
  } catch {}
  if (!hash) return { ok: false, reason: "no-pin" };
  let match = false;
  try {
    match = await verifyPin(pin, hash);
  } catch {
    return { ok: false, reason: "wrong" };
  }
  if (match) {
    fails = 0;
    lockedUntil = 0;
    return { ok: true };
  }
  fails += 1;
  if (fails >= MAX_ATTEMPTS) {
    lockedUntil = Date.now() + LOCKOUT_MS;
    fails = 0;
    return { ok: false, reason: "locked", retryInMs: LOCKOUT_MS };
  }
  return { ok: false, reason: "wrong" };
}

// --- Unlock sesi (per tab; tutup tab = kunci lagi) ---

export function isEventUnlocked(eventId: string): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_PREFIX + eventId) === "1";
  } catch {
    return false;
  }
}

export function setEventUnlocked(eventId: string): void {
  try {
    sessionStorage.setItem(UNLOCK_PREFIX + eventId, "1");
  } catch {}
}

export function lockEvent(eventId: string): void {
  try {
    sessionStorage.removeItem(UNLOCK_PREFIX + eventId);
  } catch {}
}
