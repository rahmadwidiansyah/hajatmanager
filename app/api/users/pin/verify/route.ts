import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";

const verifySchema = z.object({
  pin: z.string().regex(/^\d{6}$/, "PIN harus 6 digit angka"),
});

/**
 * Verifikasi PIN server tanpa mengubahnya.
 * Dipakai APK setelah logout → login lagi: PIN lokal dihapus,
 * tapi PIN server masih ada, jadi user verifikasi PIN lama
 * lalu APK simpan ulang secara lokal (tidak perlu buat baru).
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { appPinHash: true },
  });
  if (!user?.appPinHash)
    return NextResponse.json({ error: "PIN_NOT_SET" }, { status: 404 });
  const ok = await bcrypt.compare(parsed.data.pin, user.appPinHash);
  if (!ok) return NextResponse.json({ error: "PIN salah" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
