import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractBearerToken, resolveDeviceUser } from "@/lib/device-auth";
import { NextResponse } from "next/server";

export async function requireAuth() {
  // Fase 3: Bearer device-token (native WPF/Flutter) didahulukan.
  // Dibaca via headers() agar 35 route yang memanggil requireAuth()
  // tanpa argumen tidak perlu diubah satu per satu.
  try {
    const h = await headers();
    const bearer = extractBearerToken(h.get("authorization"));
    if (bearer) {
      const deviceUser = await resolveDeviceUser(bearer);
      if (!deviceUser) {
        return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
      }
      const user = await prisma.user.findUnique({ where: { id: deviceUser.id } });
      if (!user) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
      return { user, session: null, via: "device-token" as const };
    }
  } catch {
    // headers() tak tersedia (misal unit test) → lanjut ke cookie.
  }
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
