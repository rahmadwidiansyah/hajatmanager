import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"];

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type) && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "INVALID_TYPE", message: "Hanya file gambar" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "FILE_TOO_LARGE", message: "Maksimal 20MB" }, { status: 413 });
  }

  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const filename = `${auth.user.id}-${Date.now()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  const filepath = path.join(dir, filename);
  await writeFile(filepath, buffer);
  const url = `/uploads/${filename}`;
  return NextResponse.json({ url });
}
