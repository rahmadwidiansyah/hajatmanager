import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { z } from "zod";

const guestSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  nama: z.string().min(2),
  alamat: z.string().min(2),
  nominal: z.number().int().positive(),
  metode: z.enum(["CASH", "AMPLOP", "QRIS", "TRANSFER", "BARANG"]).default("AMPLOP"),
  catatan: z.string().max(200).nullable().optional(),
  petugasId: z.string().optional(),
  mejaLabel: z.string().nullable().optional(),
  kodeInput: z.string().nullable().optional(),
  deviceId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  guestBookId: z.string().nullable().optional(),
});

const guestBookSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  nama: z.string().min(2),
  alamat: z.string().min(2),
  createdAt: z.string().optional(),
});

const eventSchema = z.object({
  id: z.string(),
  namaAcara: z.string().min(2),
  namaTuanRumah: z.string().nullable().optional(),
  tanggal: z.string(),
  lokasi: z.string().nullable().optional(),
  catatan: z.string().nullable().optional(),
  mejaList: z.array(z.string()).optional(),
  mode: z.enum(["ONLINE", "OFFLINE"]).optional(),
  isOffline: z.boolean().optional(),
  localOnly: z.boolean().optional(),
  createdAt: z.string().optional(),
});

const pushSchema = z.object({
  events: z.array(eventSchema).optional().default([]),
  guestBooks: z.array(guestBookSchema).optional().default([]),
  guests: z.array(guestSchema).optional().default([]),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = pushSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });

  const { events, guestBooks, guests } = parsed.data;
  let syncedEvents = 0;
  let syncedBooks = 0;
  let syncedGuests = 0;
  const conflicts: { id: string; reason: string }[] = [];

  // Sync offline-created events: if localOnly and not exists on server, create
  for (const ev of events) {
    const exists = await prisma.event.findUnique({ where: { id: ev.id } });
    if (exists) {
      // update if offline event now online
      if (ev.mode === "ONLINE" && exists.isOffline) {
        await prisma.event.update({ where: { id: ev.id }, data: { mode: "ONLINE", isOffline: false, localOnly: false, lastSyncAt: new Date() } });
        await prisma.auditLog.create({ data: { eventId: ev.id, userId: auth.user.id, aksi: "SYNC_ONLINE", detail: { from: "OFFLINE" } } }).catch(() => {});
      }
      syncedEvents++;
      continue;
    }
    // create event that was offline localOnly
    try {
      await prisma.event.create({
        data: {
          id: ev.id,
          namaAcara: ev.namaAcara,
          namaTuanRumah: ev.namaTuanRumah ?? null,
          tanggal: new Date(ev.tanggal),
          lokasi: ev.lokasi ?? null,
          catatan: ev.catatan ?? null,
          mejaList: ev.mejaList ?? ["MEJA-1", "MEJA-2"],
          mode: (ev.mode as "ONLINE" | "OFFLINE") ?? "ONLINE",
          isOffline: false,
          localOnly: false,
          lastSyncAt: new Date(),
          createdById: auth.user.id,
          members: { create: { userId: auth.user.id, role: "OWNER" } },
        },
      });
      syncedEvents++;
    } catch (e) {
      conflicts.push({ id: ev.id, reason: e instanceof Error ? e.message : "create failed" });
    }
  }

  // GuestBooks: upsert
  for (const gb of guestBooks) {
    const exists = await prisma.guestBook.findUnique({ where: { id: gb.id } });
    if (exists) continue;
    try {
      await prisma.guestBook.create({ data: { id: gb.id, eventId: gb.eventId, nama: gb.nama, alamat: gb.alamat, createdAt: gb.createdAt ? new Date(gb.createdAt) : new Date() } });
      syncedBooks++;
    } catch {
      conflicts.push({ id: gb.id, reason: "guestBook exists" });
    }
  }

  // Guests: idempotent by id + duplicate nama+alamat check
  for (const g of guests) {
    const exists = await prisma.guest.findUnique({ where: { id: g.id } });
    if (exists) continue;
    // duplicate check without catatan -> mark conflict but allow if has catatan
    const dup = await prisma.guest.findFirst({ where: { eventId: g.eventId, nama: { equals: g.nama, mode: "insensitive" }, alamat: { equals: g.alamat, mode: "insensitive" } } });
    if (dup && (!g.catatan || !g.catatan.trim())) {
      conflicts.push({ id: g.id, reason: "DUPLICATE_NEED_NOTE" });
      continue;
    }
    try {
      await prisma.guest.create({
        data: {
          id: g.id,
          eventId: g.eventId,
          guestBookId: g.guestBookId ?? null,
          nama: g.nama,
          alamat: g.alamat,
          nominal: g.nominal,
          metode: g.metode as "CASH" | "AMPLOP" | "QRIS" | "TRANSFER" | "BARANG",
          catatan: g.catatan ?? null,
          petugasId: g.petugasId ?? auth.user.id,
          mejaLabel: g.mejaLabel ?? null,
          kodeInput: g.kodeInput ?? null,
          deviceId: g.deviceId ?? null,
          createdAt: g.createdAt ? new Date(g.createdAt) : new Date(),
          updatedAt: g.updatedAt ? new Date(g.updatedAt) : new Date(),
        },
      });
      await prisma.auditLog.create({ data: { eventId: g.eventId, userId: auth.user.id, aksi: dup ? "CREATE_GUEST_DUPLICATE_WITH_NOTE" : "CREATE_GUEST", targetId: g.id, detail: { nama: g.nama, sync: true } } }).catch(() => {});
      syncedGuests++;
    } catch (e) {
      conflicts.push({ id: g.id, reason: e instanceof Error ? e.message : "guest create failed" });
    }
  }

  // update lastSyncAt for involved events
  const eventIds = [...new Set([...events.map((e) => e.id), ...guests.map((g) => g.eventId), ...guestBooks.map((b) => b.eventId)])];
  if (eventIds.length) await prisma.event.updateMany({ where: { id: { in: eventIds } }, data: { lastSyncAt: new Date(), isOffline: false, localOnly: false, mode: "ONLINE" } }).catch(() => {});

  return NextResponse.json({ ok: true, synced: { events: syncedEvents, guestBooks: syncedBooks, guests: syncedGuests }, conflicts, lastSyncAt: new Date().toISOString() });
}
