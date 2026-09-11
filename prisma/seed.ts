import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Nama dan alamat sample Jawa
const firstNames = [
  "Sutrisno","Siti","Budi","Ani","Slamet","Paijo","Tukimin","Sukardi","Jumadi","Wati",
  "Agus","Rini","Hadi","Yanto","Muryani","Parjo","Sarono","Tuti","Darmo","Sugeng",
  "Endah","Wahyu","Sri","Joko","Marni","Sarno","Legimin","Poniman","Giyanto","Suparti"
];
const lastNames = [
  "Santoso","Wijaya","Prasetyo","Lestari","Hidayat","Nugroho","Sari","Susanto","Hartono","Kusuma",
  "Setiawan","Wibowo","Saputra","Handayani","Kurniawan","Sutanto","Wulandari","Gunawan","Permadi","Utami"
];
const alamatPool = [
  { name: "Krajan", weight: 35 },
  { name: "Krakan", weight: 25 },
  { name: "Sumber", weight: 20 },
  { name: "Jati", weight: 10 },
  { name: "Kebon", weight: 3 },
  { name: "Sawah", weight: 3 },
  { name: "Lor", weight: 2 },
  { name: "Kidul", weight: 2 },
];
const nominalPool = [
  { value: 20000, weight: 20 },
  { value: 50000, weight: 30 },
  { value: 100000, weight: 25 },
  { value: 150000, weight: 15 },
  { value: 200000, weight: 10 },
];
const metodePool = [
  { value: "AMPLOP", weight: 80 },
  { value: "QRIS", weight: 15 },
  { value: "TRANSFER", weight: 3 },
  { value: "BARANG", weight: 1 },
  { value: "CASH", weight: 1 },
];

function pickWeighted<T extends { weight: number }>(pool: T[]): T {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return pool[pool.length - 1];
}

function randomName() {
  const f = firstNames[Math.floor(Math.random() * firstNames.length)];
  const l = lastNames[Math.floor(Math.random() * lastNames.length)];
  // kadang tanpa last name biar variasi
  return Math.random() < 0.3 ? f : `${f} ${l}`;
}

function randomAlamat() {
  return pickWeighted(alamatPool).name;
}

async function main() {
  console.log("🌱 Seeder: 1 event + 3 akun (owner/admin/viewer) + 150 GuestBook + 300 Guest ...");

  const hashed = await bcrypt.hash("123456", 10);

  // Upsert 4 users
  const usersData = [
    { email: "owner@test.com", name: "Owner Hajatan" },
    { email: "admin@test.com", name: "Admin Panitia" },
    { email: "viewer@test.com", name: "Viewer Tuan Rumah" },
    { email: "tester@test.com", name: "Tester" },
  ];

  const users: Record<string, { id: string; name: string; email: string }> = {};
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, password: hashed },
      create: { email: u.email, name: u.name, password: hashed },
    });
    users[u.email] = user;
    console.log(`✅ User: ${u.email} (${user.id})`);
  }

  // Hapus event seeder lama jika ada (biar idempoten)
  const existingEvent = await prisma.event.findFirst({ where: { namaAcara: "Hajatan Test — Seeder 300" } });
  if (existingEvent) {
    console.log(`🗑️ Hapus event lama ${existingEvent.id} + data terkait...`);
    await prisma.guest.deleteMany({ where: { eventId: existingEvent.id } });
    await prisma.guestBook.deleteMany({ where: { eventId: existingEvent.id } });
    await prisma.auditLog.deleteMany({ where: { eventId: existingEvent.id } });
    await prisma.eventMember.deleteMany({ where: { eventId: existingEvent.id } });
    await prisma.event.delete({ where: { id: existingEvent.id } });
  }

  // Buat event baru
  const event = await prisma.event.create({
    data: {
      namaAcara: "Hajatan Test — Seeder 300",
      tanggal: new Date("2026-09-09"),
      lokasi: "Balai Desa Krajan",
      catatan: "Seeder: 150 buku tamu + 300 pemberian, 3 role (owner/admin/viewer)",
      createdById: users["owner@test.com"].id,
    },
  });
  console.log(`✅ Event: ${event.namaAcara} (${event.id})`);

  // EventMember unlimited — 4 anggota
  const members = [
    { userId: users["owner@test.com"].id, role: "OWNER" as const },
    { userId: users["admin@test.com"].id, role: "ADMIN" as const },
    { userId: users["viewer@test.com"].id, role: "VIEWER" as const },
    { userId: users["tester@test.com"].id, role: "OWNER" as const },
  ];
  for (const m of members) {
    await prisma.eventMember.create({ data: { eventId: event.id, userId: m.userId, role: m.role } });
    console.log(`✅ Member: ${m.role} — ${m.userId}`);
  }

  // GuestBook 150
  const guestBooks = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < 150; i++) {
    let nama: string;
    // pastikan tidak duplikat persis
    do {
      nama = randomName();
    } while (usedNames.has(nama) && Math.random() < 0.7);
    usedNames.add(nama);
    const alamat = randomAlamat();
    const gb = await prisma.guestBook.create({ data: { eventId: event.id, nama, alamat } });
    guestBooks.push(gb);
  }
  console.log(`✅ GuestBook: ${guestBooks.length} entri`);

  // Guest 300 — 200 link ke GuestBook, 100 random baru, dengan mejaLabel
  const petugasIds = [users["owner@test.com"].id, users["admin@test.com"].id];
  const petugasMeja: Record<string, string> = {
    [users["owner@test.com"].id]: "MEJA-1",
    [users["admin@test.com"].id]: "MEJA-2",
  };
  const catatanPool = ["", "", "", "titip salam", "keluarga", "tetangga", ""];
  const guestsToCreate = [];

  for (let i = 0; i < 300; i++) {
    let nama: string;
    let alamat: string;
    let guestBookId: string | null = null;

    if (i < 200 && guestBooks.length > 0) {
      // link ke GuestBook
      const gb = guestBooks[Math.floor(Math.random() * guestBooks.length)];
      nama = gb.nama;
      alamat = gb.alamat;
      guestBookId = gb.id;
      // variasi: 20% ubah alamat sedikit biar tidak semua persis
      if (Math.random() < 0.2) {
        alamat = randomAlamat();
        guestBookId = null;
      }
      // 10% ubah nama sedikit
      if (Math.random() < 0.1) {
        nama = randomName();
        guestBookId = null;
      }
    } else {
      nama = randomName();
      alamat = randomAlamat();
    }

    const nominal = pickWeighted(nominalPool).value;
    const metode = pickWeighted(metodePool).value as "AMPLOP" | "QRIS" | "TRANSFER" | "BARANG" | "CASH";
    const catatan = catatanPool[Math.floor(Math.random() * catatanPool.length)] || null;
    const petugasId = petugasIds[Math.floor(Math.random() * petugasIds.length)];
    const mejaLabel = petugasMeja[petugasId] ?? "MEJA-1";
    const kodeInput = `${mejaLabel}-${String(i + 1).padStart(3, "0")}`;
    // createdAt spread 6 jam terakhir
    const createdAt = new Date(Date.now() - Math.floor(Math.random() * 6 * 60 * 60 * 1000));

    guestsToCreate.push({ eventId: event.id, nama, alamat, nominal, metode, catatan, petugasId, guestBookId, createdAt, mejaLabel, kodeInput, deviceId: `seed-${mejaLabel}` });
  }

  // batch create (prisma tidak support createMany dengan createdAt custom? tetap bisa)
  // kita pakai transaction
  let createdCount = 0;
  for (const g of guestsToCreate) {
    await prisma.guest.create({
      data: {
        eventId: g.eventId,
        nama: g.nama,
        alamat: g.alamat,
        nominal: g.nominal,
        metode: g.metode as never,
        catatan: g.catatan,
        petugasId: g.petugasId,
        guestBookId: g.guestBookId,
        createdAt: g.createdAt,
        mejaLabel: (g as Record<string, unknown>).mejaLabel as string,
        kodeInput: (g as Record<string, unknown>).kodeInput as string,
        deviceId: (g as Record<string, unknown>).deviceId as string,
      },
    });
    createdCount++;
  }
  console.log(`✅ Guest: ${createdCount} entri`);

  // AuditLog sample 10
  for (let i = 0; i < Math.min(10, guestsToCreate.length); i++) {
    const g = guestsToCreate[i];
    await prisma.auditLog.create({
      data: {
        eventId: event.id,
        userId: g.petugasId,
        aksi: "CREATE_GUEST",
        targetId: `seed-${i}`,
        detail: { nama: g.nama, alamat: g.alamat, nominal: g.nominal },
      },
    });
  }
  console.log(`✅ AuditLog: 10 entri`);

  // Rekap untuk log
  const agg = await prisma.guest.aggregate({ where: { eventId: event.id }, _sum: { nominal: true }, _count: true });
  console.log(`\n📊 Rekap Event ${event.id}:`);
  console.log(`   Total Tamu: ${agg._count}`);
  console.log(`   Total Nominal: ${agg._sum.nominal} (${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(agg._sum.nominal ?? 0)})`);
  const perAlamat = await prisma.guest.groupBy({ by: ["alamat"], where: { eventId: event.id }, _count: { alamat: true }, _sum: { nominal: true }, orderBy: { _count: { alamat: "desc" } }, take: 4 });
  console.log(`   Top 4 Alamat:`);
  perAlamat.forEach((a) => console.log(`   - ${a.alamat}: ${a._count.alamat} tamu, ${a._sum.nominal}`));

  console.log("\n✅ Seeder selesai!");
  console.log("Akun (password semua 123456):");
  console.log(" - owner@test.com  (OWNER)");
  console.log(" - admin@test.com  (ADMIN)");
  console.log(" - viewer@test.com (VIEWER)");
  console.log(" - tester@test.com (OWNER)");
  console.log(`\nBuka: http://localhost:3000/events/${event.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
