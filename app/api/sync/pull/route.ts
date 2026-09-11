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

  const [event, guests, guestBooks] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    prisma.guest.findMany({ where: { eventId, updatedAt: { gt: sinceDate } }, orderBy: { updatedAt: "asc" }, take: 2000 }),
    prisma.guestBook.findMany({ where: { eventId, createdAt: { gt: sinceDate } }, orderBy: { createdAt: "asc" }, take: 2000 }),
  ]);

  return NextResponse.json({ event, guests, guestBooks, pulledAt: new Date().toISOString() });
}
