import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { z } from "zod";

const schema = z.object({
  nama: z.string().min(2).optional(),
  alamat: z.string().min(2).optional(),
  nominal: z.number().int().positive().optional(),
  metode: z.enum(["CASH", "AMPLOP", "QRIS", "TRANSFER", "BARANG"]).optional(),
  catatan: z.string().max(200).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const existing = await prisma.guest.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const member = await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId: existing.eventId, userId: auth.user.id } } });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.guest.update({ where: { id }, data: parsed.data as Record<string, unknown> });
  await prisma.auditLog.create({ data: { eventId: existing.eventId, userId: auth.user.id, aksi: "UPDATE_GUEST", targetId: id, detail: { before: existing, after: parsed.data } } });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const existing = await prisma.guest.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const member = await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId: existing.eventId, userId: auth.user.id } } });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  await prisma.guest.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({ data: { eventId: existing.eventId, userId: auth.user.id, aksi: "DELETE_GUEST", targetId: id, detail: { nama: existing.nama } } });
  return NextResponse.json({ ok: true });
}
