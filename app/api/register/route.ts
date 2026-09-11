import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2, "Nama minimal 2 huruf"),
  username: z.string().trim().min(3, "Username minimal 3 karakter").max(20).regex(/^[a-zA-Z0-9._-]+$/, "Hanya huruf, angka, ., _, -").optional().or(z.literal("").transform(() => undefined)),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { name, username, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 400 });
    }
    if (username) {
      const uname = username.toLowerCase();
      const existsU = await prisma.user.findUnique({ where: { username: uname } });
      if (existsU) return NextResponse.json({ error: "Username sudah dipakai" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name: name.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()), username: username ? username.toLowerCase() : null, email: email.toLowerCase(), password: hashed },
    });

    return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Gagal mendaftar" }, { status: 500 });
  }
}
