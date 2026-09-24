import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { verifyGoogleIdToken } from "@/lib/google-verify";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // sama seperti lib/auth.ts

function useSecureCookies() {
  return (process.env.AUTH_URL ?? "").startsWith("https://");
}

function sessionCookieName() {
  return `${useSecureCookies() ? "__Secure-" : ""}authjs.session-token`;
}

/**
 * Login Google native dari APK.
 * App mengirim ID token (google_sign_in) → server verifikasi ke Google,
 * upsert User + link Account, lalu terbitkan cookie session Auth.js (JWT)
 * yang identik dengan login web — semua /api/* langsung mengenalinya.
 */
export async function POST(req: Request) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SERVER_MISCONFIGURED" }, { status: 500 });
  }
  let idToken = "";
  try {
    const body = await req.json();
    idToken = typeof body?.idToken === "string" ? body.idToken : "";
  } catch {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (!idToken) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  // 1. Verifikasi ke Google (logika bersama di lib/google-verify.ts)
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
    return NextResponse.json({ error: verified.error }, { status });
  }
  const info = verified.info;
  const email = info.email;
  const name = info.name;

  // 2. Upsert user + link akun Google (sub sama seperti login web)
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name,
        email,
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
      await prisma.user.update({ where: { id: user.id }, data: { avatar: info.picture } }).catch(() => {});
    }
    const linked = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: "google", providerAccountId: info.sub } },
    });
    if (!linked) {
      await prisma.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: info.sub,
          id_token: idToken,
        },
      }).catch(() => {});
    }
  }

  // 3. Terbitkan session cookie Auth.js (payload mirror callbacks lib/auth.ts)
  const cookieName = sessionCookieName();
  const token = await encode({
    secret,
    salt: cookieName,
    maxAge: SESSION_MAX_AGE,
    token: {
      id: user.id,
      sub: user.id,
      name: user.name,
      email: user.email,
      picture: info.picture ?? user.image ?? undefined,
      avatar: info.picture ?? undefined,
    },
  });

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
  });
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: useSecureCookies(),
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
