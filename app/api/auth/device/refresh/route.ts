import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractBearerToken,
  hashDeviceToken,
  issueDeviceToken,
} from "@/lib/device-auth";

/**
 * Fase 3: rotasi token. Client mengirim Bearer lama yang masih valid
 * → server revoke token lama + terbitkan token baru (device sama).
 */
export async function POST(req: Request) {
  const raw = extractBearerToken(req.headers.get("authorization"));
  if (!raw) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const row = await prisma.deviceSession.findUnique({
    where: { tokenHash: hashDeviceToken(raw) },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await prisma.deviceSession
    .update({ where: { id: row.id }, data: { revokedAt: new Date() } })
    .catch(() => {});
  const issued = await issueDeviceToken(row.userId, {
    deviceName: row.deviceName ?? undefined,
    platform: row.platform ?? undefined,
  });
  return NextResponse.json({
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      image: row.user.image,
    },
  });
}
