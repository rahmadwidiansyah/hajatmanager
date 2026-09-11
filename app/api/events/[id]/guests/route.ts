import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember, requireRole } from "@/lib/require-auth";
import { z } from "zod";

const schema = z.object({
  nama: z.string().min(2),
  alamat: z.string().min(2),
  nominal: z.number().int().positive(),
  metode: z.enum(["CASH", "AMPLOP", "QRIS", "TRANSFER", "BARANG"]).default("AMPLOP"),
  catatan: z.string().max(200).optional().nullable(),
  guestBookId: z.string().optional().nullable(),
  mejaLabel: z.string().max(20).optional().nullable(),
  kodeInput: z.string().max(30).optional().nullable(),
  deviceId: z.string().max(50).optional().nullable(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const member = await requireMember(id, auth.user.id);
  if (!member) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const sort = searchParams.get("sort") ?? "createdAt";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";
  const metodeFilter = searchParams.get("metode")?.split(",").filter(Boolean) ?? [];
  const mejaFilter = searchParams.get("meja")?.split(",").filter(Boolean) ?? [];
  const kasirFilter = searchParams.get("kasir")?.split(",").filter(Boolean) ?? [];
  const isExport = searchParams.get("export") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = isExport ? Math.min(5000, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10))) : Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

  const where: Record<string, unknown> = { eventId: id };
  if (q) {
    // search untuk id, nama, alamat, catatan, kodeInput
    const orConditions: Record<string, unknown>[] = [
      { nama: { contains: q, mode: "insensitive" } },
      { alamat: { contains: q, mode: "insensitive" } },
      { catatan: { contains: q, mode: "insensitive" } },
      { kodeInput: { contains: q, mode: "insensitive" } },
    ];
    // jika q mirip cuid, coba exact id
    if (q.length >= 8) orConditions.push({ id: { contains: q, mode: "insensitive" } });
    (where as Record<string, unknown>).OR = orConditions;
  }
  if (metodeFilter.length) where.metode = { in: metodeFilter };
  if (mejaFilter.length) where.mejaLabel = { in: mejaFilter };
  if (kasirFilter.length) where.petugasId = { in: kasirFilter };

  const allowedSort = ["nama", "alamat", "nominal", "createdAt", "metode"];
  const orderBy = allowedSort.includes(sort) ? { [sort]: order } : { createdAt: "desc" };

  const [data, total] = await Promise.all([
    prisma.guest.findMany({ where: where as never, orderBy: orderBy as never, skip: (page - 1) * limit, take: limit }),
    prisma.guest.count({ where: where as never }),
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });

  const { nama, alamat, nominal, metode, catatan, guestBookId, mejaLabel, kodeInput, deviceId } = parsed.data;

  // Duplicate A: cek nama+alamat persis (case-insensitive) untuk event ini
  const existing = await prisma.guest.findFirst({
    where: { eventId: id, nama: { equals: nama, mode: "insensitive" }, alamat: { equals: alamat, mode: "insensitive" } },
    select: { id: true, nama: true, alamat: true, nominal: true, metode: true, catatan: true, createdAt: true, petugasId: true },
  });
  if (existing) {
    const hasNote = catatan && catatan.trim().length > 0;
    if (!hasNote) {
      // wajib isi catatan agar tidak sama — return 409
      return NextResponse.json(
        {
          error: "DUPLICATE_NEED_NOTE",
          message: "Nama dan alamat sudah tercatat. Tambahkan catatan/penanda agar tidak sama, contoh: 'Krajan Lor', 'anak Pak RT', atau 'titip salam keluarga'",
          existing: { ...existing, nominalFormatted: new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(existing.nominal) },
        },
        { status: 409 }
      );
    }
    // jika sudah ada catatan, tetap izinkan (bedakan via catatan) — lanjut create
  }

  // auto-link guestBook jika tidak diisi tapi cocok nama+alamat
  let linkedId = guestBookId ?? null;
  if (!linkedId) {
    const gb = await prisma.guestBook.findFirst({ where: { eventId: id, nama: { equals: nama, mode: "insensitive" }, alamat: { equals: alamat, mode: "insensitive" } } });
    if (gb) linkedId = gb.id;
  }

  const guest = await prisma.guest.create({
    data: { eventId: id, nama, alamat, nominal, metode, catatan: catatan || null, guestBookId: linkedId, petugasId: auth.user.id, mejaLabel: mejaLabel || null, kodeInput: kodeInput || null, deviceId: deviceId || null },
  });

  await prisma.auditLog.create({
    data: { eventId: id, userId: auth.user.id, aksi: existing ? "CREATE_GUEST_DUPLICATE_WITH_NOTE" : "CREATE_GUEST", targetId: guest.id, detail: { nama, alamat, nominal, metode, catatan, duplicateOf: existing?.id ?? null, mejaLabel: mejaLabel || null, kodeInput: kodeInput || null } },
  });

  return NextResponse.json(guest, { status: 201 });
}
