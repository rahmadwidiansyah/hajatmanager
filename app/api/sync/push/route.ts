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
  // localId: UUID dari client — kunci idempoten utama.
  // Prioritas lookup: localId dulu, baru id. Memastikan data offline yang
  // sudah landing via POST langsung tidak di-insert ulang saat flush outbox.
  localId: z.string().uuid().optional().nullable(),
});

const guestBookSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  nama: z.string().min(2),
  alamat: z.string().min(2),
  createdAt: z.string().optional(),
  // localId: UUID dari client — kunci idempoten untuk buku tamu.
  localId: z.string().uuid().optional().nullable(),
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

// Shape item synced yang dikembalikan ke client Flutter.
// Dipakai untuk rekonsiliasi id lokal → server id:
//   1. Cari baris lokal dengan id == localId (id sementara saat offline)
//   2. Ganti id-nya dengan server id yang ada di field `id`
type SyncedItem = { id: string; localId: string | null };

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = pushSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  const { events, guestBooks, guests } = parsed.data;

  const syncedEventItems: SyncedItem[] = [];
  const syncedBookItems: SyncedItem[] = [];
  const syncedGuestItems: SyncedItem[] = [];
  const conflicts: { id: string; localId?: string | null; reason: string }[] = [];

  const userId = auth.user.id;

  // Role tulis per event — cache per request agar batch besar tidak N+1 query.
  const writeCache = new Map<string, boolean>();
  async function canWrite(eventId: string): Promise<boolean> {
    const hit = writeCache.get(eventId);
    if (hit !== undefined) return hit;
    const member = await requireRole(eventId, userId, ["OWNER", "ADMIN"]).catch(() => null);
    const ok = !!member;
    writeCache.set(eventId, ok);
    return ok;
  }

  // ── Events ────────────────────────────────────────────────────────────────
  for (const ev of events) {
    const exists = await prisma.event.findUnique({ where: { id: ev.id } });
    if (exists) {
      syncedEventItems.push({ id: exists.id, localId: null });
      continue;
    }
    try {
      const memberExists = await prisma.eventMember
        .findUnique({ where: { eventId_userId: { eventId: ev.id, userId: auth.user.id } } })
        .catch(() => null);
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
      await prisma.auditLog
        .create({ data: { eventId: ev.id, userId: auth.user.id, aksi: "CREATE_EVENT", targetId: ev.id, detail: { namaAcara: ev.namaAcara, sync: true } } })
        .catch(() => {});
      syncedEventItems.push({ id: ev.id, localId: null });
      writeCache.set(ev.id, true);
    } catch (e) {
      conflicts.push({ id: ev.id, reason: e instanceof Error ? e.message : "create failed" });
    }
  }

  // ── GuestBooks ────────────────────────────────────────────────────────────
  for (const gb of guestBooks) {
    // 1) Idempoten via localId — cek apakah sudah landing sebelumnya.
    if (gb.localId) {
      const byLocalId = await prisma.guestBook.findUnique({ where: { localId: gb.localId } });
      if (byLocalId) {
        syncedBookItems.push({ id: byLocalId.id, localId: gb.localId });
        continue;
      }
    }
    // 2) Fallback by id (data lama sebelum localId ada).
    const existsById = await prisma.guestBook.findUnique({ where: { id: gb.id } });
    if (existsById) {
      syncedBookItems.push({ id: existsById.id, localId: gb.localId ?? null });
      continue;
    }
    if (!(await canWrite(gb.eventId))) {
      conflicts.push({ id: gb.id, localId: gb.localId, reason: "FORBIDDEN" });
      continue;
    }
    // Anti-double: nama+alamat sama dari device berbeda.
    const dupBook = await prisma.guestBook.findFirst({
      where: {
        eventId: gb.eventId,
        nama: { equals: gb.nama, mode: "insensitive" },
        alamat: { equals: gb.alamat, mode: "insensitive" },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (dupBook) {
      conflicts.push({ id: gb.id, localId: gb.localId, reason: "DUPLICATE" });
      continue;
    }
    try {
      const created = await prisma.guestBook.create({
        data: {
          id: gb.id,
          eventId: gb.eventId,
          nama: gb.nama,
          alamat: gb.alamat,
          localId: gb.localId ?? null,
          createdAt: gb.createdAt ? new Date(gb.createdAt) : new Date(),
        },
      });
      syncedBookItems.push({ id: created.id, localId: gb.localId ?? null });
    } catch {
      conflicts.push({ id: gb.id, localId: gb.localId, reason: "guestBook exists" });
    }
  }

  // ── Guests ────────────────────────────────────────────────────────────────
  for (const g of guests) {
    // 1) Idempoten via localId.
    // Skenario kritis: POST langsung sudah landing (server buat server-CUID),
    // flush outbox masih kirim entry dengan localId yang sama.
    // → ditemukan via localId → kembalikan mapping id↔localId, tidak insert. ✓
    if (g.localId) {
      const byLocalId = await prisma.guest.findUnique({ where: { localId: g.localId } });
      if (byLocalId) {
        syncedGuestItems.push({ id: byLocalId.id, localId: g.localId });
        continue;
      }
    }
    // 2) Fallback by id.
    const existsById = await prisma.guest.findUnique({ where: { id: g.id } });
    if (existsById) {
      syncedGuestItems.push({ id: existsById.id, localId: g.localId ?? null });
      continue;
    }
    if (!(await canWrite(g.eventId))) {
      conflicts.push({ id: g.id, localId: g.localId, reason: "FORBIDDEN" });
      continue;
    }
    // Duplicate nama+alamat: boleh kalau ada catatan pembeda.
    const dup = await prisma.guest.findFirst({
      where: {
        eventId: g.eventId,
        nama: { equals: g.nama, mode: "insensitive" },
        alamat: { equals: g.alamat, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (dup && (!g.catatan || !g.catatan.trim())) {
      conflicts.push({ id: g.id, localId: g.localId, reason: "DUPLICATE_NEED_NOTE" });
      continue;
    }
    try {
      const created = await prisma.guest.create({
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
          localId: g.localId ?? null,
          createdAt: g.createdAt ? new Date(g.createdAt) : new Date(),
          updatedAt: g.updatedAt ? new Date(g.updatedAt) : new Date(),
        },
      });
      await prisma.auditLog
        .create({
          data: {
            eventId: g.eventId,
            userId: auth.user.id,
            aksi: dup ? "CREATE_GUEST_DUPLICATE_WITH_NOTE" : "CREATE_GUEST",
            targetId: created.id,
            detail: { nama: g.nama, sync: true, localId: g.localId ?? null },
          },
        })
        .catch(() => {});
      syncedGuestItems.push({ id: created.id, localId: g.localId ?? null });
    } catch (e) {
      conflicts.push({ id: g.id, localId: g.localId, reason: e instanceof Error ? e.message : "guest create failed" });
    }
  }

  // Update lastSyncAt untuk event yang boleh ditulis user ini.
  const allEventIds = [
    ...new Set([
      ...events.map((e) => e.id),
      ...guests.map((g) => g.eventId),
      ...guestBooks.map((b) => b.eventId),
    ]),
  ];
  const writableIds: string[] = [];
  for (const id of allEventIds) {
    if (await canWrite(id)) writableIds.push(id);
  }
  if (writableIds.length) {
    await prisma.event
      .updateMany({ where: { id: { in: writableIds } }, data: { lastSyncAt: new Date() } })
      .catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    // Counts — kompatibel dengan client lama yang hanya baca synced.guests, dll.
    synced: {
      events: syncedEventItems.length,
      guestBooks: syncedBookItems.length,
      guests: syncedGuestItems.length,
    },
    // Detail items — client Flutter baru pakai ini untuk rekonsiliasi id:
    //   syncedItems.guests[n].localId → id lokal sementara di SQLite client
    //   syncedItems.guests[n].id      → server id yang harus menggantikannya
    syncedItems: {
      events: syncedEventItems,
      guestBooks: syncedBookItems,
      guests: syncedGuestItems,
    },
    conflicts,
    lastSyncAt: new Date().toISOString(),
  });
}
