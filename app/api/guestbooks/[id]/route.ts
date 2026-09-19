import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { z } from "zod";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const parsed = z.object({ nama: z.string().min(2).optional(), alamat: z.string().min(2).optional() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.guestBook.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // cek member
  const member = await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId: existing.eventId, userId: auth.user.id } } });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const updated = await prisma.guestBook.update({ where: { id }, data: parsed.data });
  await prisma.auditLog.create({
    data: { eventId: existing.eventId, userId: auth.user.id, aksi: "UPDATE_GUESTBOOK", targetId: id, detail: { before: existing, after: parsed.data } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const existing = await prisma.guestBook.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const member = await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId: existing.eventId, userId: auth.user.id } } });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  await prisma.guestBook.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({
    data: { eventId: existing.eventId, userId: auth.user.id, aksi: "DELETE_GUESTBOOK", targetId: id, detail: { nama: existing.nama } },
  });
  return NextResponse.json({ ok: true });
}
