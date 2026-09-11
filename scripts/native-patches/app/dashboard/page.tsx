import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import CreateEvent from "./CreateEvent";
import { DashboardHeader } from "./DashboardHeader";
import { CalendarDays, MapPin, ArrowRight } from "lucide-react";

export const dynamic = "force-static";

export default async function DashboardPage() {
  if (process.env.NATIVE_BUILD === "1") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-8 text-center">
        <p className="text-[var(--on-surface-variant)]">Hajat Manager — Dashboard (native shell)</p>
      </div>
    );
  }
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { eventMembers: { include: { event: true } } },
  });

  const events = user?.eventMembers.map((m) => ({ ...m.event, role: m.role })) ?? [];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DashboardHeader
        user={{
          id: user?.id || "",
          name: user?.name || session.user.name,
          username: (user as { username?: string })?.username || null,
          email: user?.email || session.user.email || "",
          image: (user as { image?: string })?.image || (session.user as { image?: string })?.image || null,
          avatar: (user as { avatar?: string })?.avatar || null,
          profilePicture: (user as { profilePicture?: string })?.profilePicture || null,
        }}
        displayName={session.user.name ?? session.user.email ?? ""}
      />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--on-surface)]">Acara Saya</h1>
            <p className="text-sm text-[var(--on-surface-variant)] mt-0.5">{events.length} acara</p>
          </div>
          <CreateEvent />
        </div>
        {events.length === 0 ? (
          <div className="bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-2xl p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--surface-container)] flex items-center justify-center mx-auto mb-4">
              <CalendarDays size={22} className="text-[var(--on-surface-variant)]" />
            </div>
            <p className="font-medium text-[var(--on-surface)]">Belum ada acara</p>
            <p className="text-sm text-[var(--on-surface-variant)] mt-1">Buat acara pertama atau minta panitia menambahkanmu</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {events.map((ev) => {
              const e = ev as typeof ev & { namaTuanRumah?: string | null; mode?: string; isOffline?: boolean };
              const isOff = (e as { isOffline?: boolean }).isOffline || (e as { mode?: string }).mode === "OFFLINE";
              return (
                <div key={ev.id} className="bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-[var(--on-surface)] leading-snug">{ev.namaAcara}</h3>
                    <span className="flex items-center gap-1 shrink-0">
                      {isOff && <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700">Offline</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${ev.role === "OWNER" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100"}`}>{ev.role}</span>
                    </span>
                  </div>
                  <div className="mt-4 pt-4 border-t border-[var(--outline-variant)]">
                    <Link href={`/events/${ev.id}`} className="flex items-center justify-between text-sm font-medium text-[var(--primary)]">Buka Acara<ArrowRight size={15} /></Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
