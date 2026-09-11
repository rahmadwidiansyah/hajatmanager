import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember } from "@/lib/require-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const member = await requireMember(id, auth.user.id);
  if (!member) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const [totalAgg, perAlamat, perMetode, perMeja, perKasir] = await Promise.all([
    prisma.guest.aggregate({ where: { eventId: id }, _sum: { nominal: true }, _count: true }),
    prisma.guest.groupBy({ by: ["alamat"], where: { eventId: id }, _count: { alamat: true }, _sum: { nominal: true }, orderBy: { _sum: { nominal: "desc" } } }),
    prisma.guest.groupBy({ by: ["metode"], where: { eventId: id }, _count: { metode: true }, _sum: { nominal: true } }),
    prisma.guest.groupBy({ by: ["mejaLabel"], where: { eventId: id }, _count: { mejaLabel: true }, _sum: { nominal: true } }),
    prisma.guest.groupBy({ by: ["petugasId"], where: { eventId: id }, _count: { petugasId: true }, _sum: { nominal: true } }),
  ]);

  // enrich perKasir with user names
  const petugasIds = perKasir.map((p) => p.petugasId);
  const users = await prisma.user.findMany({ where: { id: { in: petugasIds } }, select: { id: true, name: true, email: true } });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    totalTamu: totalAgg._count,
    totalNominal: totalAgg._sum.nominal ?? 0,
    perAlamat: perAlamat.map((g) => ({ alamat: g.alamat, jumlah: g._count.alamat, total: g._sum.nominal ?? 0 })),
    perMetode: perMetode.map((g) => ({ metode: g.metode, jumlah: g._count.metode, total: g._sum.nominal ?? 0 })),
    perMeja: perMeja.map((g) => ({ mejaLabel: g.mejaLabel || "Tanpa Meja", jumlah: g._count.mejaLabel, total: g._sum.nominal ?? 0 })),
    perKasir: perKasir.map((g) => ({ petugasId: g.petugasId, name: userMap.get(g.petugasId)?.name ?? g.petugasId, email: userMap.get(g.petugasId)?.email ?? "", jumlah: g._count.petugasId, total: g._sum.nominal ?? 0 })),
  });
}
