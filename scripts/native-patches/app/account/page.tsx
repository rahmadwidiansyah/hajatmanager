import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AccountClient from "./AccountClient";

export const dynamic = "force-static";

export default async function AccountPage() {
  if (process.env.NATIVE_BUILD === "1") {
    return <AccountClient initialUser={{ id: "native", name: "Native", username: null, email: "native@hajat.local", image: null, avatar: null, profilePicture: null, createdAt: new Date().toISOString() } as unknown as Parameters<typeof AccountClient>[0]["initialUser"]} />;
  }
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, username: true, email: true, image: true, avatar: true, profilePicture: true, createdAt: true },
  });
  if (!user) redirect("/login");
  return <AccountClient initialUser={{ ...user, createdAt: user.createdAt.toISOString() } as unknown as Parameters<typeof AccountClient>[0]["initialUser"]} />;
}
