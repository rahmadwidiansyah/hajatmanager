import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import CreateEvent from "./CreateEvent";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSync } from "./DashboardSync";
import { CalendarDays, MapPin, ArrowRight } from "lucide-react";

// Halaman auth+DB: jangan di-prerender saat build (DATABASE_URL dummy di Docker).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { eventMembers: { include: { event: true } } },
  });

  const events = user?.eventMembers.map((m) => ({ ...m.event, role: m.role })) ?? [];

  return (
    <div className="min-h-dvh bg-[var(--background)]">
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

      <main className="page-shell py-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--on-surface)]">Acara Saya</h1>
            <p className="text-sm text-[var(--on-surface-variant)] mt-0.5">{events.length} acara</p>
          </div>
          <CreateEvent />
        </div>
        <DashboardSync />

        {events.length === 0 ? (
          <div className="bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-2xl p-6 text-left flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--surface-container)] flex items-center justify-center shrink-0">
              <CalendarDays size={20} className="text-[var(--on-surface-variant)]" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-[var(--on-surface)]">Belum ada acara</p>
              <p className="text-sm text-[var(--on-surface-variant)] mt-1">Buat acara pertama atau minta panitia menambahkanmu</p>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {events.map((ev) => {
              const e = ev as typeof ev & { namaTuanRumah?: string | null };
              return (
                <div key={ev.id} className="bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-2xl p-5 shadow-[var(--shadow-elevation-1)] hover:border-[var(--primary)] transition-colors group">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-[var(--on-surface)] leading-snug">{ev.namaAcara}</h3>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        ev.role === "OWNER"
                          ? "bg-[var(--primary-container)] text-[var(--on-primary-container)] border-[var(--outline-variant)]"
                          : ev.role === "ADMIN"
                          ? "bg-[var(--warning-container)] text-[var(--on-warning-container)] border-[var(--outline-variant)]"
                          : "bg-[var(--surface-container)] text-[var(--on-surface-variant)] border-[var(--outline-variant)]"
                      }`}>
                        {ev.role}
                      </span>
                    </span>
                  </div>

                  {e.namaTuanRumah && (
                    <p className="text-xs text-[var(--on-surface-variant)] mb-2">Tuan rumah: <span className="font-medium text-[var(--on-surface)]">{e.namaTuanRumah}</span></p>
                  )}

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--on-surface-variant)]">
                    <span className="flex items-center gap-1">
                      <CalendarDays size={14} />
                      {new Date(ev.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}
                    </span>
                    {ev.lokasi && (
                      <span className="flex items-center gap-1">
                        <MapPin size={14} />
                        {ev.lokasi}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-[var(--outline-variant)]">
                    <Link
                      href={`/events/${ev.id}`}
                      className="flex items-center justify-between text-sm font-medium text-[var(--primary)] hover:opacity-80 transition-opacity"
                    >
                      Buka Acara
                      <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                    </Link>
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
