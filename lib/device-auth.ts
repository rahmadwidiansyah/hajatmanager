import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Fase 3: Bearer device-token untuk client native (WPF/Flutter).
 *
 * - Token mentah: 256-bit, base64url, diperlihatkan SEKALI saat diterbitkan.
 * - Yang disimpan: sha256 hex (tokenHash, unique). Bocor DB ≠ bocor token.
 * - TTL 30 hari (sama seperti JWT cookie Auth.js di lib/auth.ts).
 * - Cookie Auth.js tetap didukung (fallback) — require-auth cek Bearer dulu.
 */

export const DEVICE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type DeviceMeta = { deviceName?: string; platform?: string };

export async function issueDeviceToken(userId: string, meta: DeviceMeta = {}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DEVICE_TOKEN_TTL_SECONDS * 1000);
  const session = await prisma.deviceSession.create({
    data: {
      userId,
      tokenHash: hashDeviceToken(token),
      deviceName: meta.deviceName?.slice(0, 100) || null,
      platform: meta.platform?.slice(0, 20) || null,
      expiresAt,
    },
  });
  return { token, expiresAt: session.expiresAt, id: session.id };
}

export function extractBearerToken(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const m = headerValue.match(/^Bearer\s+(.+)$/i);
  const t = (m?.[1] ?? "").trim();
  return t.length >= 20 ? t : null;
}

export type DeviceUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  sessionId: string;
};

/** Validasi Bearer → user (null bila invalid/expired/revoked). Update lastUsedAt best-effort. */
export async function resolveDeviceUser(rawToken: string | null): Promise<DeviceUser | null> {
  if (!rawToken) return null;
  const row = await prisma.deviceSession.findUnique({
    where: { tokenHash: hashDeviceToken(rawToken) },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
  await prisma.deviceSession
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return {
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    image: row.user.image,
    sessionId: row.id,
  };
}

// --- Rate limit sederhana in-memory untuk /device/authorize (anti brute-force) ---
// Catatan: per-instance (tidak shared antar replica). Cukup untuk homelab single-instance;
// di balik multi-replica gunakan Redis. Kegagalan auth yang dihitung, sukses me-reset.
const rlBuckets = new Map<string, { count: number; resetAt: number }>();
const RL_WINDOW_MS = 60_000;
const RL_MAX_FAIL = 20;

export function deviceAuthRateLimited(key: string): boolean {
  const now = Date.now();
  const b = rlBuckets.get(key);
  if (!b || b.resetAt <= now) {
    rlBuckets.set(key, { count: 0, resetAt: now + RL_WINDOW_MS });
    return false;
  }
  return b.count >= RL_MAX_FAIL;
}

export function deviceAuthFailed(key: string) {
  const now = Date.now();
  const b = rlBuckets.get(key);
  if (!b || b.resetAt <= now) rlBuckets.set(key, { count: 1, resetAt: now + RL_WINDOW_MS });
  else b.count += 1;
}

export function deviceAuthSucceeded(key: string) {
  rlBuckets.delete(key);
}

export function deviceRateKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd?.split(",")[0] ?? "").trim() || "unknown";
  return `device-auth:${ip}`;
}

// --- Fase 4: grant sekali-pakai untuk login Google desktop ---
// Kode mentah 256-bit (base64url), disimpan sebagai sha256, kedaluwarsa 10 menit.
export const DEVICE_GRANT_TTL_SECONDS = 10 * 60;

export async function createDeviceGrant(userId: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await prisma.deviceGrant.create({
    data: {
      userId,
      codeHash: createHash("sha256").update(code, "utf8").digest("hex"),
      expiresAt: new Date(Date.now() + DEVICE_GRANT_TTL_SECONDS * 1000),
    },
  });
  return code;
}

/** Validasi + tandai terpakai (sekali pakai). Return userId atau null. */
export async function redeemDeviceGrant(code: string): Promise<string | null> {
  if (!code || code.length < 20) return null;
  const hash = createHash("sha256").update(code, "utf8").digest("hex");
  const row = await prisma.deviceGrant.findUnique({ where: { codeHash: hash } });
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) return null;
  const updated = await prisma.deviceGrant
    .updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    })
    .catch(() => ({ count: 0 }));
  if (updated.count !== 1) return null;
  return row.userId;
}

/** Port loopback valid? Hanya angka 1–65535 (target redirect selalu 127.0.0.1). */
export function isValidLoopbackPort(port: string | null | undefined): boolean {
  if (!port || !/^\d+$/.test(port)) return false;
  const n = Number(port);
  return n >= 1 && n <= 65535;
}
