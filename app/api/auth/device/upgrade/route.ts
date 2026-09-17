import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueDeviceToken } from "@/lib/device-auth";

/**
 * Fase 3 (migrasi): client yang masih memegang cookie session Auth.js
 * yang valid dapat menukarnya menjadi Bearer device-token TANPA
 * memasukkan password ulang. Dipakai sekali per perangkat.
 */
const schema = z.object({
  deviceName: z.string().max(100).optional(),
  platform: z.string().max(20).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const issued = await issueDeviceToken(user.id, parsed.data);
  return NextResponse.json({
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
  });
}
