import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import EventClient from "./EventClient";

// Halaman auth only (tanpa query DB langsung), tapi tandai dinamis
// agar tidak di-prerender saat build Docker.
export const dynamic = "force-dynamic";

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const valid = ["pemberian", "buku", "rekap", "setting"] as const;
  const initialTab = (tab && (valid as readonly string[]).includes(tab) ? tab : "pemberian") as typeof valid[number];
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  return <EventClient eventId={id} userEmail={session.user.email} userName={session.user.name ?? ""} initialTab={initialTab} />;
}
