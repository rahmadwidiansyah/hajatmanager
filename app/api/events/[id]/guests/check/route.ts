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
  const nama = searchParams.get("nama")?.trim() ?? "";
  const alamat = searchParams.get("alamat")?.trim() ?? "";
  if (!nama || !alamat) return NextResponse.json({ exists: false });

  const existing = await prisma.guest.findFirst({
    where: { eventId: id, nama: { equals: nama, mode: "insensitive" }, alamat: { equals: alamat, mode: "insensitive" } },
    select: { id: true, nama: true, alamat: true, nominal: true, metode: true, catatan: true, createdAt: true },
  });

  if (!existing) return NextResponse.json({ exists: false });

  return NextResponse.json({
    exists: true,
    existing: {
      ...existing,
      nominalFormatted: new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(existing.nominal),
    },
  });
}
