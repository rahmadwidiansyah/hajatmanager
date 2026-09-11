import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";

const pinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, "PIN harus 6 digit angka"),
});

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { pinCreatedAt: true, appPinHash: true } });
  return NextResponse.json({ hasPin: !!user?.appPinHash, pinCreatedAt: user?.pinCreatedAt ?? null });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const parsed = pinSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  const hash = await bcrypt.hash(parsed.data.pin, 10);
  await prisma.user.update({ where: { id: auth.user.id }, data: { appPinHash: hash, pinCreatedAt: new Date() } });
  await prisma.auditLog.create({ data: { eventId: (await prisma.event.findFirst({ where: { createdById: auth.user.id }, select: { id: true } }))?.id ?? auth.user.id, userId: auth.user.id, aksi: "SET_PIN", detail: { hasPin: true } } }).catch(() => {});
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  await prisma.user.update({ where: { id: auth.user.id }, data: { appPinHash: null, pinCreatedAt: null } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const schema = z.object({ pin: z.string().regex(/^\d{6}$/), currentPin: z.string().regex(/^\d{6}$/).optional() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (user?.appPinHash && parsed.data.currentPin) {
    const ok = await bcrypt.compare(parsed.data.currentPin, user.appPinHash);
    if (!ok) return NextResponse.json({ error: "PIN lama salah" }, { status: 400 });
  }
  const hash = await bcrypt.hash(parsed.data.pin, 10);
  await prisma.user.update({ where: { id: auth.user.id }, data: { appPinHash: hash, pinCreatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
