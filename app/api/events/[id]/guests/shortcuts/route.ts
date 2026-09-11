import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember } from "@/lib/require-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const member = await requireMember(id, auth.user.id);
  if (!member) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const [alamatGroups, nominalGroups] = await Promise.all([
    prisma.guest.groupBy({ by: ["alamat"], where: { eventId: id }, _count: { alamat: true }, orderBy: { _count: { alamat: "desc" } }, take: 4 }),
    prisma.guest.groupBy({ by: ["nominal"], where: { eventId: id }, _count: { nominal: true }, orderBy: { _count: { nominal: "desc" } }, take: 4 }),
  ]);

  return NextResponse.json({
    alamatTop: alamatGroups.map((g) => ({ alamat: g.alamat, jumlah: g._count.alamat })),
    nominalTop: nominalGroups.map((g) => ({ nominal: g.nominal, jumlah: g._count.nominal })),
  });
}
