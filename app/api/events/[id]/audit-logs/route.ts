import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember } from "@/lib/require-auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const member = await requireMember(id, auth.user.id);
  if (!member) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const aksi = searchParams.get("aksi");
  const q = searchParams.get("q")?.trim() ?? "";

  const where: Record<string, unknown> = { eventId: id };
  if (aksi) where.aksi = aksi;

  // Jika ada q: filter case-insensitive untuk aksi/user/targetId via Prisma,
  // plus nama tamu di detail JSON (detail.nama / detail.before.nama / detail.after.nama) via JS
  // — karena Prisma JSON path string_contains case-sensitive, kita pakai post-filter JS
  if (q) {
    // Ambil kandidat: filter aksi/user/targetId di DB dulu untuk perkecil, lalu filter nama di JS
    // Untuk cover nama yang tidak match aksi/user, ambil juga semua log eventId (limit*3) sebagai fallback jika hasil DB kosong
    const dbWhere: Record<string, unknown> = { eventId: id };
    if (aksi) (dbWhere as Record<string, unknown>).aksi = aksi;
    (dbWhere as Record<string, unknown>).OR = [
      { aksi: { contains: q, mode: "insensitive" } },
      { targetId: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];

    // Fetch DB matches + extra recent logs untuk cover yang hanya match detail.nama
    const fetchLimit = Math.min(200, limit * 6);
    const [dbMatched, recent] = await Promise.all([
      prisma.auditLog.findMany({
        where: dbWhere as never,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: fetchLimit,
      }),
      prisma.auditLog.findMany({
        where: where as never,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: fetchLimit,
      }),
    ]);

    // Gabung & dedup by id
    const map = new Map<string, (typeof dbMatched)[number]>();
    for (const l of [...dbMatched, ...recent]) map.set(l.id, l);
    const all = [...map.values()];

    const qLower = q.toLowerCase();
    const filtered = all.filter((l) => {
      if ((l.aksi as string).toLowerCase().includes(qLower)) return true;
      if ((l.targetId as string | null)?.toLowerCase().includes(qLower)) return true;
      if ((l.user as { name: string; email: string }).name.toLowerCase().includes(qLower)) return true;
      if ((l.user as { name: string; email: string }).email.toLowerCase().includes(qLower)) return true;
      const d = l.detail as Record<string, unknown> | null;
      if (!d) return false;
      const nama = (d.nama as string | undefined)?.toLowerCase() ?? "";
      if (nama.includes(qLower)) return true;
      const before = d.before as Record<string, unknown> | undefined;
      const after = d.after as Record<string, unknown> | undefined;
      if (before && typeof before.nama === "string" && (before.nama as string).toLowerCase().includes(qLower)) return true;
      if (after && typeof after.nama === "string" && (after.nama as string).toLowerCase().includes(qLower)) return true;
      return false;
    });

    // sort desc sudah, paginate after filter
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = filtered.length;
    const paged = filtered.slice((page - 1) * limit, page * limit);
    return NextResponse.json({ logs: paged, total, page, limit });
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: where as never,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where: where as never }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
