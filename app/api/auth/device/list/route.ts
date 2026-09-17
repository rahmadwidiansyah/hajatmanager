import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { extractBearerToken, hashDeviceToken } from "@/lib/device-auth";
import { headers } from "next/headers";

/**
 * Fase 3: daftar perangkat tertaut (untuk halaman Akun → revoke).
 * Bisa diakses via cookie web maupun Bearer native.
 */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rows = await prisma.deviceSession.findMany({
    where: { userId: auth.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      tokenHash: true,
      deviceName: true,
      platform: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });

  let currentHash: string | null = null;
  try {
    const h = await headers();
    const raw = extractBearerToken(h.get("authorization"));
    currentHash = raw ? hashDeviceToken(raw) : null;
  } catch {
    currentHash = null;
  }

  return NextResponse.json({
    devices: rows.map((r) => ({
      id: r.id,
      deviceName: r.deviceName,
      platform: r.platform,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      current: currentHash ? r.tokenHash === currentHash : false,
    })),
  });
}
