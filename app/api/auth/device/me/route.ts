import { NextResponse } from "next/server";
import { extractBearerToken, resolveDeviceUser } from "@/lib/device-auth";

/** Fase 3: validasi Bearer + info user ringkas (dipakai client cek session). */
export async function GET(req: Request) {
  const user = await resolveDeviceUser(extractBearerToken(req.headers.get("authorization")));
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
  });
}
