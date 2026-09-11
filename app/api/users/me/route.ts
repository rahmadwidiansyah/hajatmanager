import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { z } from "zod";
import bcrypt from "bcryptjs";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  username: z
    .string()
    .trim()
    .min(3, "Username minimal 3 karakter")
    .max(20, "Maksimal 20 karakter")
    .regex(/^[a-zA-Z0-9._-]+$/, "Hanya huruf, angka, ., _, -")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  email: z.string().trim().email().optional(),
  profilePicture: z.string().trim().nullable().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, "Password minimal 6 karakter").optional(),
});

function toTitleCasePerKata(s: string) {
  return s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { id: true, name: true, username: true, email: true, emailVerified: true, image: true, avatar: true, profilePicture: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json(user);
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });

  const data: Record<string, unknown> = {};
  const current = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (parsed.data.name !== undefined) data.name = toTitleCasePerKata(parsed.data.name);
  if (parsed.data.username !== undefined) {
    const uname = parsed.data.username.toLowerCase();
    if (uname !== (current.username?.toLowerCase() ?? "")) {
      const exists = await prisma.user.findUnique({ where: { username: uname } });
      if (exists) return NextResponse.json({ error: "USERNAME_TAKEN", message: "Username sudah dipakai" }, { status: 409 });
      data.username = uname;
    }
  }
  if (parsed.data.email !== undefined && parsed.data.email.toLowerCase() !== current.email.toLowerCase()) {
    const exists = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (exists) return NextResponse.json({ error: "EMAIL_TAKEN", message: "Email sudah dipakai" }, { status: 409 });
    data.email = parsed.data.email.toLowerCase();
  }
  if (parsed.data.profilePicture !== undefined) {
    data.profilePicture = parsed.data.profilePicture || null;
  }
  if (parsed.data.newPassword) {
    if (current.password) {
      if (!parsed.data.currentPassword) return NextResponse.json({ error: "CURRENT_PASSWORD_REQUIRED" }, { status: 400 });
      const ok = await bcrypt.compare(parsed.data.currentPassword, current.password);
      if (!ok) return NextResponse.json({ error: "WRONG_PASSWORD", message: "Password lama salah" }, { status: 400 });
    }
    data.password = await bcrypt.hash(parsed.data.newPassword, 10);
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id: auth.user.id },
    data,
    select: { id: true, name: true, username: true, email: true, image: true, avatar: true, profilePicture: true },
  });
  return NextResponse.json(updated);
}
