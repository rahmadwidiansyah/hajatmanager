import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import EventClient from "./EventClient";

export const dynamic = "force-static";
export function generateStaticParams() {
  return [{ id: "dummy" }];
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const valid = ["pemberian", "buku", "rekap", "setting"] as const;
  const initialTab = (tab && (valid as readonly string[]).includes(tab) ? tab : "pemberian") as typeof valid[number];
  if (process.env.NATIVE_BUILD === "1") {
    return <EventClient eventId={id} userEmail="native@hajat.local" userName="Native" initialTab={initialTab} />;
  }
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  return <EventClient eventId={id} userEmail={session.user.email} userName={session.user.name ?? ""} initialTab={initialTab} />;
}
