import { NextResponse } from "next/server";

/**
 * Konfigurasi publik untuk APK (client ID bukan rahasia):
 * web client ID dipakai sebagai serverClientId agar ID token dari HP
 * beraudience sama dan bisa diverifikasi di /mobile/google.
 * Fallback ke ANDROID_GOOGLE_CLIENT_ID bila GOOGLE_CLIENT_ID kosong
 * (keduanya berisi web client ID yang sama — lihat .env.example).
 */
export async function GET() {
  const id = process.env.GOOGLE_CLIENT_ID || process.env.ANDROID_GOOGLE_CLIENT_ID || null;
  return NextResponse.json({ googleServerClientId: id && id.length > 0 ? id : null });
}
