import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember } from "@/lib/require-auth";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const since = searchParams.get("since");
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });
  const member = await requireMember(eventId, auth.user.id);
  if (!member) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const sinceDate = since ? new Date(since) : new Date(0);
  if (isNaN(sinceDate.getTime())) return NextResponse.json({ error: "invalid since" }, { status: 400 });

  const [event, guests, guestBooks, deletedGuests, deletedGuestBooks] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),

    // Sertakan localId secara eksplisit agar client Flutter bisa rekonsiliasi:
    // baris lokal dengan id sementara (== localId) → diganti server id.
    prisma.guest.findMany({
      where: { eventId, deletedAt: null, updatedAt: { gt: sinceDate } },
      orderBy: { updatedAt: "asc" },
      take: 2000,
      select: {
        id: true,
        eventId: true,
        guestBookId: true,
        nama: true,
        alamat: true,
        nominal: true,
        metode: true,
        catatan: true,
        petugasId: true,
        mejaLabel: true,
        kodeInput: true,
        deviceId: true,
        localId: true,   // ← kunci rekonsiliasi id lokal → server id
        createdAt: true,
        updatedAt: true,
      },
    }),

    prisma.guestBook.findMany({
      where: { eventId, deletedAt: null, createdAt: { gt: sinceDate } },
      orderBy: { createdAt: "asc" },
      take: 2000,
      select: {
        id: true,
        eventId: true,
        nama: true,
        alamat: true,
        localId: true,   // ← kunci rekonsiliasi id lokal → server id
        createdAt: true,
      },
    }),

    // Deleted items: sertakan localId agar client bisa hapus by localId
    // selain by id (penting untuk baris yang id lokalnya belum ter-replace).
    prisma.guest.findMany({
      where: { eventId, deletedAt: { gt: sinceDate } },
      select: { id: true, localId: true },
      take: 2000,
    }),

    prisma.guestBook.findMany({
      where: { eventId, deletedAt: { gt: sinceDate } },
      select: { id: true, localId: true },
      take: 2000,
    }),
  ]);

  return NextResponse.json({
    event,
    guests,
    guestBooks,
    // Array id server untuk hapus baris dari cache lokal.
    deletedGuestIds: deletedGuests.map((g) => g.id),
    // Array localId untuk hapus baris lokal yang id-nya mungkin belum
    // ter-replace (baris dengan id sementara == localId).
    deletedGuestLocalIds: deletedGuests.map((g) => g.localId).filter(Boolean) as string[],
    deletedGuestBookIds: deletedGuestBooks.map((b) => b.id),
    deletedGuestBookLocalIds: deletedGuestBooks.map((b) => b.localId).filter(Boolean) as string[],
    pulledAt: new Date().toISOString(),
  });
}
