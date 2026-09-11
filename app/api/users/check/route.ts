import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.trim().toLowerCase();
  if (!username) return NextResponse.json({ available: false });
  const exists = await prisma.user.findUnique({ where: { username } });
  const isOwn = exists?.id === auth.user.id;
  return NextResponse.json({ available: !exists || isOwn, taken: !!exists && !isOwn });
}
