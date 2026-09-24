import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyGoogleIdToken } from "@/lib/google-verify";
import {
  deviceAuthFailed,
  deviceAuthRateLimited,
  deviceAuthSucceeded,
  deviceRateKey,
  issueDeviceToken,
} from "@/lib/device-auth";

/**
 * Fase 3: login Google untuk client native (dipakai Fase 4 desktop loopback).
 * Verifikasi & upsert user identik dengan /api/auth/mobile/google,
 * tapi menerbitkan Bearer device-token (bukan cookie Auth.js).
 */
const schema = z.object({
  idToken: z.string().min(10),
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
  const { idToken, deviceName, platform } = parsed.data;

  const verified = await verifyGoogleIdToken(idToken);
  if (!verified.ok) {
    const status =
      verified.error === "GOOGLE_UNREACHABLE"
        ? 502
        : verified.error === "VALIDATION_ERROR"
          ? 400
          : verified.error === "GOOGLE_NOT_CONFIGURED"
            ? 500
            : 401;
    deviceAuthFailed(rlKey);
    return NextResponse.json({ error: verified.error }, { status });
  }
  const info = verified.info;

  let user = await prisma.user.findUnique({ where: { email: info.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: info.name,
        email: info.email,
        emailVerified: new Date(),
        image: info.picture ?? null,
        avatar: info.picture ?? null,
        accounts: {
          create: {
            type: "oauth",
            provider: "google",
            providerAccountId: info.sub,
            id_token: idToken,
          },
        },
      },
    });
  } else {
    if (info.picture && user.avatar !== info.picture) {
      await prisma.user
        .update({ where: { id: user.id }, data: { avatar: info.picture } })
        .catch(() => {});
    }
    const linked = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: "google", providerAccountId: info.sub } },
    });
    if (!linked) {
      await prisma.account
        .create({
          data: {
            userId: user.id,
            type: "oauth",
            provider: "google",
            providerAccountId: info.sub,
            id_token: idToken,
          },
        })
        .catch(() => {});
    }
  }

  deviceAuthSucceeded(rlKey);
  const issued = await issueDeviceToken(user.id, { deviceName, platform });
  return NextResponse.json({
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
  });
}
