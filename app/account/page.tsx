import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AccountClient from "./AccountClient";

// Halaman auth+DB: jangan di-prerender saat build (DATABASE_URL dummy di Docker).
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, username: true, email: true, image: true, avatar: true, profilePicture: true, createdAt: true },
  });
  if (!user) redirect("/login");
  return <AccountClient initialUser={{ ...user, createdAt: user.createdAt.toISOString() } as unknown as Parameters<typeof AccountClient>[0]["initialUser"]} />;
}
