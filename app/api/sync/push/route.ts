import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/require-auth";
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

  const userId = auth.user.id;

  // Role tulis per event (OWNER/ADMIN saja; VIEWER read-only).
  // Cache per request agar batch besar tidak N+1 query.
  const writeCache = new Map<string, boolean>();
  async function canWrite(eventId: string): Promise<boolean> {
    const hit = writeCache.get(eventId);
    if (hit !== undefined) return hit;
    const member = await requireRole(eventId, userId, ["OWNER", "ADMIN"]).catch(() => null);
    const ok = !!member;
    writeCache.set(eventId, ok);
    return ok;
  }

  // Sync events created while offline: idempotent by id.
  for (const ev of events) {
    const exists = await prisma.event.findUnique({ where: { id: ev.id } });
    if (exists) {
      syncedEvents++;
      continue;
    }
    try {
      const memberExists = await prisma.eventMember.findUnique({
        where: { eventId_userId: { eventId: ev.id, userId: auth.user.id } },
      }).catch(() => null);
      await prisma.event.create({
        data: {
          id: ev.id,
          namaAcara: ev.namaAcara,
          namaTuanRumah: ev.namaTuanRumah ?? null,
          tanggal: new Date(ev.tanggal),
          lokasi: ev.lokasi ?? null,
          catatan: ev.catatan ?? null,
          mejaList: ev.mejaList ?? ["MEJA-1", "MEJA-2"],
          lastSyncAt: new Date(),
          createdById: auth.user.id,
          members: memberExists ? undefined : { create: { userId: auth.user.id, role: "OWNER" } },
        },
      });
      await prisma.auditLog.create({ data: { eventId: ev.id, userId: auth.user.id, aksi: "CREATE_EVENT", targetId: ev.id, detail: { namaAcara: ev.namaAcara, sync: true } } }).catch(() => {});
      syncedEvents++;
      writeCache.set(ev.id, true); // pembuat = OWNER, boleh tulis di request ini
    } catch (e) {
      conflicts.push({ id: ev.id, reason: e instanceof Error ? e.message : "create failed" });
    }
  }

  // GuestBooks: upsert (hanya OWNER/ADMIN; VIEWER read-only)
  for (const gb of guestBooks) {
    const exists = await prisma.guestBook.findUnique({ where: { id: gb.id } });
    if (exists) continue;
    if (!(await canWrite(gb.eventId))) {
      conflicts.push({ id: gb.id, reason: "FORBIDDEN" });
      continue;
    }
    try {
      await prisma.guestBook.create({ data: { id: gb.id, eventId: gb.eventId, nama: gb.nama, alamat: gb.alamat, createdAt: gb.createdAt ? new Date(gb.createdAt) : new Date() } });
      syncedBooks++;
    } catch {
      conflicts.push({ id: gb.id, reason: "guestBook exists" });
    }
  }

  // Guests: idempotent by id + duplicate nama+alamat check (hanya OWNER/ADMIN)
  for (const g of guests) {
    const exists = await prisma.guest.findUnique({ where: { id: g.id } });
    if (exists) continue;
    if (!(await canWrite(g.eventId))) {
      conflicts.push({ id: g.id, reason: "FORBIDDEN" });
      continue;
    }
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

  // update lastSyncAt hanya untuk event yang boleh ditulis user ini
  const eventIds = [...new Set([...events.map((e) => e.id), ...guests.map((g) => g.eventId), ...guestBooks.map((b) => b.eventId)])];
  const writableIds = [] as string[];
  for (const id of eventIds) {
    if (await canWrite(id)) writableIds.push(id);
  }
  if (writableIds.length) await prisma.event.updateMany({ where: { id: { in: writableIds } }, data: { lastSyncAt: new Date() } }).catch(() => {});

  return NextResponse.json({ ok: true, synced: { events: syncedEvents, guestBooks: syncedBooks, guests: syncedGuests }, conflicts, lastSyncAt: new Date().toISOString() });
}
