"use client";

import type { OutboxAction, OutboxOp } from "./db";

export type { OutboxAction, OutboxOp };

export const SYNC_INTERVAL_MS = 60 * 1000;
export const FLUSH_TIMEOUT_MS = 12_000;
export const REACH_TIMEOUT_MS = 5_000;
export const MAX_BACKOFF_MS = 10 * 60 * 1000;
export const QUEUE_KEY = (eventId: string) => `offlineQueue:${eventId}`;
export const LAST_SYNC_KEY = (eventId: string) => `lastSyncAt:${eventId}`;
export const AUTOSYNC_KEY = (eventId: string) => `autoSync:${eventId}`;
export const INTERVAL_KEY = (eventId: string) => `autoSyncInterval:${eventId}`;

export type QueuedGuest = {
  id: string;
  eventId: string;
  nama: string;
  alamat: string;
  nominal: number;
  metode: string;
  catatan?: string | null;
  mejaLabel?: string | null;
  kodeInput?: string | null;
  deviceId?: string | null;
  localId?: string | null;
  createdAt: string;
};

export function setSqliteAdapter(_a: unknown) {}
export function hasSqliteAdapter() { return false; }

export function getQueue(_eventId: string): QueuedGuest[] { return []; }
export function setQueue(_eventId: string, _items: QueuedGuest[]) {}
export async function getQueueAsync(_eventId: string): Promise<QueuedGuest[]> { return []; }

export function enqueueGuest(_eventId: string, _g: QueuedGuest): number {
  throw new Error("Aplikasi web 100% online. Koneksi internet diperlukan.");
}

export function getPendingCount(_eventId: string) { return 0; }
export async function getPendingCountAsync(_eventId: string): Promise<number> { return 0; }

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export async function checkReachability(timeoutMs = REACH_TIMEOUT_MS): Promise<boolean> {
  if (!isOnline()) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`/api/health?t=${Date.now()}`, { method: "GET", cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export function subscribeNetworkStatus(cb: (online: boolean) => void) {
  if (typeof window === "undefined") return () => {};
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener("online", on);
  window.addEventListener("offline", off);
  return () => {
    window.removeEventListener("online", on);
    window.removeEventListener("offline", off);
  };
}

export type FlushResult = { flushed: number; conflicts: number; error?: string };

export function newOpId(prefix = "op"): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  } catch {}
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newLocalId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueOp(_eventId: string, _action: OutboxAction, _tableName: OutboxOp["tableName"], _payload: Record<string, unknown>, _id?: string): Promise<string> {
  throw new Error("Aplikasi web 100% online. Koneksi internet diperlukan.");
}

export async function migrateLSQueueToOutbox(_eventId: string): Promise<number> { return 0; }
export async function getTotalPendingAsync(_eventId: string): Promise<number> { return 0; }
export async function refreshPendingCount(_eventId: string): Promise<number> { return 0; }

export async function pullDelta(_eventId: string): Promise<{ pulled: number; error?: string }> {
  return { pulled: 0 };
}

export async function flushOfflineQueue(_eventId: string): Promise<FlushResult> {
  return { flushed: 0, conflicts: 0 };
}

export async function getConflictOps(_eventId: string): Promise<OutboxOp[]> { return []; }

export function conflictGuestView(op: OutboxOp): { nama: string; alamat: string; nominal: number; metode: string } {
  const p = op.payload as Record<string, unknown>;
  return {
    nama: typeof p.nama === "string" ? p.nama : "-",
    alamat: typeof p.alamat === "string" ? p.alamat : "-",
    nominal: typeof p.nominal === "number" ? p.nominal : 0,
    metode: typeof p.metode === "string" ? p.metode : "-",
  };
}

export async function resolveGuestConflict(_eventId: string, _opId: string, _catatan: string): Promise<void> {}
export async function discardOp(_eventId: string, _opId: string): Promise<void> {}

export function startBackgroundSync(_eventId: string, _onFlush?: (r: FlushResult) => void) {
  return () => {};
}

export async function getGlobalPendingCount(): Promise<number> { return 0; }
export async function flushAllPending(): Promise<FlushResult> { return { flushed: 0, conflicts: 0 }; }
