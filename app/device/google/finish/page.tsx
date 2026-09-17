import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDeviceGrant, isValidLoopbackPort } from "@/lib/device-auth";
import FinishClient from "./FinishClient";

/**
 * Fase 4 (finish): tujuan callbackUrl setelah login Google web.
 * Membuat grant sekali-pakai untuk user dari sesi browser, lalu
 * merender halaman yang redirect otomatis ke loopback app desktop
 * (http://127.0.0.1:port/callback?code=&state=) + kode manual.
 */
export default async function DeviceGoogleFinishPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; port?: string; device?: string }>;
}) {
  const sp = await searchParams;
  const state = sp.state ?? "";
  const port = sp.port ?? "";
  const device = (sp.device ?? "").slice(0, 100);

  if (state.length < 20 || !isValidLoopbackPort(port)) {
    redirect("/login?error=invalid_device_link");
  }

  const session = await auth();
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/device/google/finish?state=${state}&port=${port}`)}`);
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) redirect("/login?error=unknown_user");

  const code = await createDeviceGrant(user.id);
  return <FinishClient code={code} state={state} port={port} device={device} />;
}
