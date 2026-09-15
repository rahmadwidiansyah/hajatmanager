import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // sama seperti lib/auth.ts

function useSecureCookies() {
  return (process.env.AUTH_URL ?? "").startsWith("https://");
}

function sessionCookieName() {
  return `${useSecureCookies() ? "__Secure-" : ""}authjs.session-token`;
}

type GoogleInfo = {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string;
  name?: string;
  picture?: string;
};

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

  // 1. Verifikasi ke Google
  let info: GoogleInfo;
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "INVALID_GOOGLE_TOKEN" }, { status: 401 });
    }
    info = (await res.json()) as GoogleInfo;
  } catch {
    return NextResponse.json({ error: "GOOGLE_UNREACHABLE" }, { status: 502 });
  }

  const allowedAud = [process.env.GOOGLE_CLIENT_ID, process.env.ANDROID_GOOGLE_CLIENT_ID]
    .filter((s): s is string => !!s && s.length > 0);
  if (!info.sub || !info.email || info.email_verified !== "true") {
    return NextResponse.json({ error: "INVALID_GOOGLE_TOKEN" }, { status: 401 });
  }
  if (allowedAud.length > 0 && (!info.aud || !allowedAud.includes(info.aud))) {
    return NextResponse.json({ error: "AUD_MISMATCH" }, { status: 401 });
  }

  const email = info.email.toLowerCase();
  const name = (info.name ?? email.split("@")[0]).trim().slice(0, 50) || "Pengguna Google";

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
