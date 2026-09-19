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
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 2) return NextResponse.json([]);

  // Ambil semua Guest sudah tercatat untuk filter (duplicate A: nama+alamat)
  const existingGuests = await prisma.guest.findMany({
    where: { eventId: id, deletedAt: null },
    select: { nama: true, alamat: true },
  });
  const sudahAda = new Set(existingGuests.map((g) => `${g.nama.toLowerCase()}|${g.alamat.toLowerCase()}`));

  // cari hanya di GuestBook yang BELUM tercatat (filter tidak tampil)
  const books = await prisma.guestBook.findMany({
    where: { eventId: id, deletedAt: null, nama: { contains: q, mode: "insensitive" } },
    take: 10,
    orderBy: { nama: "asc" },
  });

  const filtered = books
    .filter((b) => !sudahAda.has(`${b.nama.toLowerCase()}|${b.alamat.toLowerCase()}`))
    .map((b) => ({ nama: b.nama, alamat: b.alamat, source: "buku_tamu" as const, id: b.id }));

  // dedup by nama+alamat (jika buku tamu ada duplikat sendiri)
  const seen = new Set<string>();
  const dedup = filtered.filter((m) => {
    const key = `${m.nama.toLowerCase()}|${m.alamat.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json(dedup.slice(0, 5));
}
