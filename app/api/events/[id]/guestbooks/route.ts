import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember, requireRole } from "@/lib/require-auth";
import { z } from "zod";

const schema = z.object({
  nama: z.string().min(2),
  alamat: z.string().min(2),
  // localId: UUID dari client (Flutter/native), dipakai untuk idempoten lookup.
  // Kalau dikirim dan sudah ada di DB → return existing (tidak insert ulang).
  localId: z.string().uuid().optional().nullable(),
});

const bulkSchema = z.object({
  bulk: z.array(schema).min(1).max(500),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const member = await requireMember(id, auth.user.id);
  if (!member) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const isExport = searchParams.get("export") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const where: Record<string, unknown> = { eventId: id, deletedAt: null };
  if (q) where.nama = { contains: q, mode: "insensitive" };

  if (isExport) {
    const data = await prisma.guestBook.findMany({ where: where as never, orderBy: { createdAt: "desc" }, take: 5000 });
    return NextResponse.json(data);
  }

  const [data, total] = await Promise.all([
    prisma.guestBook.findMany({ where: where as never, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.guestBook.count({ where: where as never }),
  ]);
  return NextResponse.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const role = await requireRole(id, auth.user.id, ["OWNER", "ADMIN"]);
  if (!role) return NextResponse.json({ error: "FORBIDDEN - hanya ADMIN/OWNER" }, { status: 403 });

  const body = await req.json();

  // bulk?
  if (body.bulk) {
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    const created = await prisma.$transaction(
      parsed.data.bulk.map((b) => prisma.guestBook.create({ data: { eventId: id, nama: b.nama, alamat: b.alamat } }))
    );
    // audit log untuk bulk — satu entry per tamu agar searchable by nama
    await Promise.all(
      created.map((gb) =>
        prisma.auditLog.create({
          data: { eventId: id, userId: auth.user.id, aksi: "CREATE_GUESTBOOK", targetId: gb.id, detail: { nama: gb.nama, alamat: gb.alamat } },
        })
      )
    );
    return NextResponse.json(created, { status: 201 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });

  // --- Idempoten via localId ---
  // Kalau client mengirim localId dan sudah ada di DB (retry / flush ganda),
  // kembalikan baris yang sudah ada tanpa insert ulang. HTTP 200 agar client
  // tahu ini bukan create baru.
  if (parsed.data.localId) {
    const byLocalId = await prisma.guestBook.findUnique({
      where: { localId: parsed.data.localId },
    });
    if (byLocalId && !byLocalId.deletedAt) {
      return NextResponse.json(byLocalId, { status: 200 });
    }
  }

  // Anti-double: tolak nama+alamat sama (case-insensitive) seperti guests 409.
  const existing = await prisma.guestBook.findFirst({
    where: { eventId: id, nama: { equals: parsed.data.nama, mode: "insensitive" }, alamat: { equals: parsed.data.alamat, mode: "insensitive" }, deletedAt: null },
    select: { id: true, nama: true, alamat: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "DUPLICATE", message: "Nama dan alamat sudah tercatat di buku tamu.", existing },
      { status: 409 }
    );
  }

  const created = await prisma.guestBook.create({
    data: {
      eventId: id,
      nama: parsed.data.nama,
      alamat: parsed.data.alamat,
      localId: parsed.data.localId ?? null,
    },
  });
  await prisma.auditLog.create({
    data: {
      eventId: id,
      userId: auth.user.id,
      aksi: "CREATE_GUESTBOOK",
      targetId: created.id,
      detail: { nama: created.nama, alamat: created.alamat, localId: parsed.data.localId ?? null },
    },
  });
  return NextResponse.json(created, { status: 201 });
}
