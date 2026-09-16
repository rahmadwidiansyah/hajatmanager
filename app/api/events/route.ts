import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { z } from "zod";

function toTitleCasePerKata(s: string) {
  return s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const schema = z.object({
  namaAcara: z.string().min(2, "Nama acara minimal 2 huruf"),
  namaTuanRumah: z.string().trim().min(2, "Nama tuan rumah minimal 2 huruf"),
  tanggal: z.string().min(1, "Tanggal wajib"),
  lokasi: z.string().optional(),
  catatan: z.string().optional(),
  id: z.string().min(1).optional(),
});

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const events = await prisma.event.findMany({
    where: { members: { some: { userId: auth.user.id } } },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { guests: true, guestBooks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // enrich with totals
  const withTotals = await Promise.all(
    events.map(async (ev) => {
      const agg = await prisma.guest.aggregate({ where: { eventId: ev.id }, _sum: { nominal: true }, _count: true });
      return {
        ...ev,
        totalNominal: agg._sum.nominal ?? 0,
        totalTamu: agg._count,
      };
    })
  );

  return NextResponse.json(withTotals);
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });

  const { namaAcara, namaTuanRumah, tanggal, lokasi, catatan, id } = parsed.data;

  const event = await prisma.event.create({
    data: {
      ...(id ? { id } : {}),
      namaAcara,
      namaTuanRumah: toTitleCasePerKata(namaTuanRumah),
      tanggal: new Date(tanggal),
      lokasi: lokasi || null,
      catatan: catatan || null,
      lastSyncAt: new Date(),
      createdById: auth.user.id,
      members: {
        create: { userId: auth.user.id, role: "OWNER" },
      },
    },
    include: { members: true },
  });

  await prisma.auditLog.create({
    data: { eventId: event.id, userId: auth.user.id, aksi: "CREATE_EVENT", targetId: event.id, detail: { namaAcara, namaTuanRumah } },
  });

  return NextResponse.json(event, { status: 201 });
}
