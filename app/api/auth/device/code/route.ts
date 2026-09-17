import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  deviceAuthFailed,
  deviceAuthRateLimited,
  deviceAuthSucceeded,
  deviceRateKey,
  issueDeviceToken,
  redeemDeviceGrant,
} from "@/lib/device-auth";

/**
 * Fase 4: app desktop menukar grant (dari browser loopback / tempel manual)
 * menjadi Bearer device-token. Grant sekali pakai, 10 menit.
 */
const schema = z.object({
  code: z.string().min(20),
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

  const userId = await redeemDeviceGrant(parsed.data.code);
  if (!userId) {
    deviceAuthFailed(rlKey);
    return NextResponse.json(
      { error: "Kode tidak valid / kedaluwarsa — ulangi login Google" },
      { status: 401 }
    );
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    deviceAuthFailed(rlKey);
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  deviceAuthSucceeded(rlKey);
  const issued = await issueDeviceToken(user.id, {
    deviceName: parsed.data.deviceName,
    platform: parsed.data.platform,
  });
  return NextResponse.json({
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
  });
}
