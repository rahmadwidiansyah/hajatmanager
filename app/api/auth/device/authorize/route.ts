import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  deviceAuthFailed,
  deviceAuthRateLimited,
  deviceAuthSucceeded,
  deviceRateKey,
  issueDeviceToken,
} from "@/lib/device-auth";

/**
 * Fase 3: login email+password untuk client native (WPF/Flutter).
 * Return Bearer token (ditampilkan sekali) — bukan cookie — agar
 * tahan terhadap masalah __Secure- cookie di http / reverse-proxy.
 */
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  deviceName: z.string().max(100).optional(),
  platform: z.string().max(20).optional(),
});

export async function POST(req: Request) {
  const rlKey = deviceRateKey(req);
  if (deviceAuthRateLimited(rlKey)) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan — tunggu 1 menit" },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  const { email, password, deviceName, platform } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user || !user.password) {
    deviceAuthFailed(rlKey);
    return NextResponse.json({ error: "Email / password salah" }, { status: 401 });
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    deviceAuthFailed(rlKey);
    return NextResponse.json({ error: "Email / password salah" }, { status: 401 });
  }

  deviceAuthSucceeded(rlKey);
  const issued = await issueDeviceToken(user.id, { deviceName, platform });
  return NextResponse.json({
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
  });
}
