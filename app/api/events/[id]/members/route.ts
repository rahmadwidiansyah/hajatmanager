import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, requireMember } from "@/lib/require-auth";
import { z } from "zod";

const schema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(["OWNER", "ADMIN", "VIEWER"]),
}).refine((d) => d.userId || d.email, { message: "userId atau email wajib" });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const member = await requireMember(id, auth.user.id);
  if (!member) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const members = await prisma.eventMember.findMany({
    where: { eventId: id },
    include: { user: { select: { id: true, name: true, username: true, email: true, image: true, avatar: true, profilePicture: true } } },
    orderBy: { role: "asc" },
  });
  return NextResponse.json(members);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const roleCheck = await requireRole(id, auth.user.id, ["OWNER"]);
  if (!roleCheck) return NextResponse.json({ error: "FORBIDDEN - hanya OWNER bisa add anggota" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });

  let userId = parsed.data.userId;
  if (!userId && parsed.data.email) {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) return NextResponse.json({ error: "User dengan email tersebut belum terdaftar. Minta user daftar dulu." }, { status: 404 });
    userId = user.id;
  }

  const existing = await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId: id, userId: userId! } } });
  if (existing) return NextResponse.json({ error: "User sudah jadi anggota acara ini" }, { status: 400 });

  const member = await prisma.eventMember.create({ data: { eventId: id, userId: userId!, role: parsed.data.role }, include: { user: { select: { id: true, name: true, username: true, email: true, image: true, avatar: true, profilePicture: true } } } });
  await prisma.auditLog.create({ data: { eventId: id, userId: auth.user.id, aksi: "ADD_MEMBER", targetId: member.id, detail: { userId, role: parsed.data.role } } });
  return NextResponse.json(member, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const roleCheck = await requireRole(id, auth.user.id, ["OWNER"]);
  if (!roleCheck) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const parsed = z.object({ userId: z.string(), role: z.enum(["OWNER", "ADMIN", "VIEWER"]) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.eventMember.update({ where: { eventId_userId: { eventId: id, userId: parsed.data.userId } }, data: { role: parsed.data.role } });
  await prisma.auditLog.create({ data: { eventId: id, userId: auth.user.id, aksi: "UPDATE_MEMBER_ROLE", targetId: updated.id, detail: parsed.data } });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const roleCheck = await requireRole(id, auth.user.id, ["OWNER"]);
  if (!roleCheck) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId wajib" }, { status: 400 });

  // jangan hapus diri sendiri jika satu-satunya OWNER
  const members = await prisma.eventMember.findMany({ where: { eventId: id } });
  const ownerCount = members.filter((m) => m.role === "OWNER").length;
  const target = members.find((m) => m.userId === userId);
  if (target?.role === "OWNER" && ownerCount <= 1) return NextResponse.json({ error: "Tidak bisa hapus satu-satunya OWNER" }, { status: 400 });

  await prisma.eventMember.delete({ where: { eventId_userId: { eventId: id, userId } } });
  await prisma.auditLog.create({ data: { eventId: id, userId: auth.user.id, aksi: "REMOVE_MEMBER", targetId: userId, detail: { userId } } });
  return NextResponse.json({ ok: true });
}
