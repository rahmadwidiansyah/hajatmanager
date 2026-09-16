import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember, requireRole } from "@/lib/require-auth";
import { z } from "zod";

function toTitleCasePerKata(s: string) {
  return s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const schema = z.object({
  namaAcara: z.string().min(2).optional(),
  namaTuanRumah: z.string().trim().min(2, "Nama tuan rumah minimal 2 huruf").optional(),
  tanggal: z.string().optional(),
  lokasi: z.string().nullable().optional(),
  catatan: z.string().nullable().optional(),
  mejaList: z.array(z.string().min(1).max(20)).max(10).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const member = await requireMember(id, auth.user.id);
  if (!member) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      _count: { select: { guests: true, guestBooks: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const agg = await prisma.guest.aggregate({ where: { eventId: id }, _sum: { nominal: true }, _count: true });
  return NextResponse.json({ ...event, totalNominal: agg._sum.nominal ?? 0, totalTamu: agg._count, myRole: member.role });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const role = await requireRole(id, auth.user.id, ["OWNER", "ADMIN"]);
  if (!role) return NextResponse.json({ error: "FORBIDDEN - hanya OWNER/ADMIN" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.namaAcara !== undefined) data.namaAcara = parsed.data.namaAcara;
  if (parsed.data.namaTuanRumah !== undefined) data.namaTuanRumah = toTitleCasePerKata(parsed.data.namaTuanRumah);
  if (parsed.data.tanggal !== undefined) data.tanggal = new Date(parsed.data.tanggal);
  if (parsed.data.lokasi !== undefined) data.lokasi = parsed.data.lokasi;
  if (parsed.data.catatan !== undefined) data.catatan = parsed.data.catatan;
  if (parsed.data.mejaList !== undefined) data.mejaList = parsed.data.mejaList;

  const updated = await prisma.event.update({ where: { id }, data });
  await prisma.auditLog.create({ data: { eventId: id, userId: auth.user.id, aksi: "UPDATE_EVENT", targetId: id, detail: parsed.data as object } });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const role = await requireRole(id, auth.user.id, ["OWNER"]);
  if (!role) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
