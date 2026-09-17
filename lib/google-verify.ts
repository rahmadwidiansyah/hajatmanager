/**
 * Verifikasi Google ID token ke oauth2.googleapis.com/tokeninfo.
 * Dipakai bersama oleh /api/auth/mobile/google (cookie, legacy APK)
 * dan /api/auth/device/google (bearer, Fase 3).
 */

export type GoogleInfo = {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
};

export type GoogleVerifyResult =
  | { ok: true; info: { sub: string; email: string; name: string; picture?: string } }
  | { ok: false; error: "VALIDATION_ERROR" | "INVALID_GOOGLE_TOKEN" | "AUD_MISMATCH" | "GOOGLE_UNREACHABLE" };

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleVerifyResult> {
  if (!idToken) return { ok: false, error: "VALIDATION_ERROR" };

  let info: GoogleInfo;
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return { ok: false, error: "INVALID_GOOGLE_TOKEN" };
    info = (await res.json()) as GoogleInfo;
  } catch {
    return { ok: false, error: "GOOGLE_UNREACHABLE" };
  }

  const allowedAud = [process.env.GOOGLE_CLIENT_ID, process.env.ANDROID_GOOGLE_CLIENT_ID].filter(
    (s): s is string => !!s && s.length > 0
  );
  const verified = info.email_verified === true || info.email_verified === "true";
  if (!info.sub || !info.email || !verified) {
    return { ok: false, error: "INVALID_GOOGLE_TOKEN" };
  }
  if (allowedAud.length > 0 && (!info.aud || !allowedAud.includes(info.aud))) {
    return { ok: false, error: "AUD_MISMATCH" };
  }

  const email = info.email.toLowerCase();
  const name = (info.name ?? email.split("@")[0]).trim().slice(0, 50) || "Pengguna Google";
  return { ok: true, info: { sub: info.sub, email, name, picture: info.picture } };
}
