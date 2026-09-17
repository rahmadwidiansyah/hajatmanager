import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { extractBearerToken, hashDeviceToken } from "@/lib/device-auth";
import { headers } from "next/headers";

/**
 * Fase 3: revoke satu perangkat ({id}) atau sesi sendiri ({self:true}).
 * Logout native memanggil {self:true} best-effort.
 */
const schema = z.object({
  id: z.string().min(1).optional(),
  self: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  if (parsed.data.self) {
    let raw: string | null = extractBearerToken(req.headers.get("authorization"));
    if (!raw) {
      try {
        const h = await headers();
        raw = extractBearerToken(h.get("authorization"));
      } catch {
        raw = null;
      }
    }
    if (!raw) return NextResponse.json({ ok: true });
    await prisma.deviceSession
      .updateMany({
        where: { tokenHash: hashDeviceToken(raw), userId: auth.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.id) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  await prisma.deviceSession
    .updateMany({
      where: { id: parsed.data.id, userId: auth.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
