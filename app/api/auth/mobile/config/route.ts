import { NextResponse } from "next/server";

/**
 * Konfigurasi publik untuk APK (client ID bukan rahasia):
 * web client ID dipakai sebagai serverClientId agar ID token dari HP
 * beraudience sama dan bisa diverifikasi di /mobile/google.
 */
export async function GET() {
  const id = process.env.GOOGLE_CLIENT_ID || null;
  return NextResponse.json({ googleServerClientId: id && id.length > 0 ? id : null });
}
