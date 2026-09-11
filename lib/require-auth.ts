import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  return { user, session };
}

export async function requireMember(eventId: string, userId: string) {
  const member = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
  return member;
}

export async function requireRole(eventId: string, userId: string, roles: string[]) {
  const member = await requireMember(eventId, userId);
  if (!member || !roles.includes(member.role)) return null;
  return member;
}
