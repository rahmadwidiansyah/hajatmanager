# Decision Log — Catatan Keputusan Arsitektur (ADR)

> Format ADR ringan untuk mencatat **kenapa** keputusan diambil, bukan cuma **apa** keputusannya.

## ADR-001: Pilih Next.js Daripada Laravel

**Tanggal:** 2026-09-09  
**Status:** Diterima (Opsi A)  
**Konteks:** Butuh web untuk kondangan yang nanti harus offline + push ke homelab, input satset di HP, autocomplete cepat.  
**Keputusan:** Pakai **Next.js 15 + TypeScript** sebagai fullstack.  
**Alasan:**
- Next.js + Dexie + next-pwa memang didesain untuk offline-first; Laravel Blade/Livewire akan sulit untuk offline.
- Satu bahasa (JS/TS) untuk frontend & backend, autocomplete & chips lebih natural di React.
- Homelab tetap bisa Docker, tidak ada hambatan.
**Konsekuensi:** Butuh setup Auth.js & Prisma manual (Laravel sudah ada Breeze/Socialite). Build image lebih besar.  
**Alternatif ditolak:** Laravel (cepat untuk CRUD murni tapi akan rewrite saat offline).

## ADR-002: Role Model - Single User + EventMember Unlimited

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** Awalnya ada ide role global `ADMIN vs USER`, tapi tidak fleksibel untuk multi-panitia.  
**Keputusan:** Semua pendaftar = `User` (1 tabel). Hak akses di level acara via `EventMember(eventId, userId, role: OWNER|ADMIN|VIEWER)` dengan `@@unique([eventId, userId])` dan **jumlah member tak terbatas** per event.  
**Alasan:**
- 1 orang bisa jadi OWNER di acara A, ADMIN di acara B, VIEWER di acara C.
- Tambah panitia tinggal search user, tidak perlu buat akun admin terpisah.
- Data tetap sync karena 1 DB, tidak perlu akun ganda.
**Konsekuensi:** Middleware harus cek `EventMember` tiap request, bukan cek `user.role` global.  
**Alternatif ditolak:** Role global `ADMIN/USER` (kaku, tidak bisa multi-peran).

## ADR-003: PostgreSQL Dari Awal

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** Awalnya diusulkan SQLite untuk MVP, tapi user minta Postgres langsung.  
**Keputusan:** Pakai **PostgreSQL 16** dari hari pertama.  
**Alasan:**
- Homelab sudah ada, tidak masalah setup.
- Rekap `GROUP BY alamat/metode`, search `ILIKE`, dan index lebih optimal di Postgres.
- Migrasi ke produksi tidak perlu ganti driver.
**Konsekuensi:** Butuh `docker-compose` dengan service postgres, `DATABASE_URL` wajib.  
**Alternatif ditolak:** SQLite (file hilang di serverless, kurang optimal untuk concurrent panitia).

## ADR-004: Alamat Single Field

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** Pertimbangan pecah alamat jadi desa/dusun/RT/RW vs 1 kolom.  
**Keputusan:** **1 kolom `alamat` saja** (string bebas, ex: "Krajan").  
**Alasan:**
- Input di lapangan harus satset; pecah field bikin panitia lambat.
- Top 4 alamat tetap bisa dihitung via `GROUP BY alamat`.
- Detail tambahan bisa tulis di `catatan` jika perlu.
**Konsekuensi:** Tidak bisa filter by RT/RW terpisah.  
**Alternatif ditolak:** Alamat terstruktur (desa, dusun, RT, RW terpisah).

## ADR-005: Buku Tamu Terpisah Dari Pemberian

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** Request autofill satset saat input pemberian.  
**Keputusan:** Buat tabel `GuestBook` terpisah sebagai master, `Guest` punya `guestBookId` opsional.  
**Alasan:**
- Buku tamu bisa diisi dulu (import Excel undangan) sebelum acara.
- Saat input pemberian, suggest dari `GuestBook` + `Guest` existing → alamat auto-fill → satset.
- Jika nama tidak ada di buku tamu, tetap bisa input manual.
**Konsekuensi:** Perlu 2 tab (Buku Tamu & Pemberian) dan logic suggest.  
**Alternatif ditolak:** Gabung 1 tabel (tidak bisa bedakan undangan vs yang sudah tercatat).

## ADR-006: Metode Default AMPLOP

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** Butuh bedakan cash, QRIS, transfer.  
**Keputusan:** Enum `Metode { CASH, AMPLOP, QRIS, TRANSFER, BARANG }` dengan **default `AMPLOP`**.  
**Alasan:**
- Di kondangan tradisional, amplop cash paling umum; QRIS/transfer opsi tambahan.
- `CASH` dan `AMPLOP` dianggap sama (uang tunai), tapi `AMPLOP` lebih jelas untuk panitia.
- Rekap per metode membantu tuan rumah tahu berapa cash vs digital.
**Konsekuensi:** Form perlu select metode, default tidak perlu diubah jika cash.  
**Alternatif ditolak:** Hanya `CASH/TRANSFER` (kurang ekspresif).

## ADR-007: Export Dengan Opsi Urutan + Group By Alamat

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** Request export bisa pilih urutan Nama A-Z atau Desa.  
**Keputusan:** Modal export dengan `orderBy` (`nama_az, nama_za, alamat_az, nominal_desc, waktu_desc`) dan checkbox `groupByAlamat`.  
**Alasan:**
- Tuan rumah sering minta "urut per desa biar gampang ngatur balasan".
- Subtotal per alamat di Excel/PDF sangat membantu.
**Konsekuensi:** Logic export perlu sorting dinamis dan subtotal.  
**Alternatif ditolak:** Export tanpa opsi urutan (kaku).

## ADR-008: Tunda Offline Ke Fase 7

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** User minta offline + push ke homelab, tapi juga minta web dulu.  
**Keputusan:** MVP Fase 1-6 **web online dulu**, pondasi Dexie disiapkan tapi tidak diaktifkan. Fase 7 baru offline full.  
**Alasan:**
- Web harus stabil dulu (auth, member, rekap, export) sebelum tambah kompleksitas sync.
- Offline butuh queue, conflict handling, dan PWA — butuh waktu.
**Konsekuensi:** Fase 1-6 butuh internet saat input.  
**Alternatif ditolak:** Offline dari hari pertama (memperlambat MVP).

## ADR-009: Auth Google + Credentials

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** Butuh login mudah untuk tuan rumah yang gaptek.  
**Keputusan:** **Auth.js v5** dengan `GoogleProvider` + `CredentialsProvider` (email/password).  
**Alasan:**
- Google login 1 klik, cocok untuk owner yang tidak mau ingat password.
- Credentials untuk panitia yang tidak punya Google atau di HP desa.
- Satu email bisa link 2 metode.
**Konsekuensi:** Butuh `GOOGLE_CLIENT_ID/SECRET` dan HTTPS untuk redirect di homelab.  
**Alternatif ditolak:** Hanya credentials (repot untuk owner).

## ADR-010: Bahasa Indonesia Penuh

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** User minta docs Indonesia full.  
**Keputusan:** Semua MD, UI label, dan panduan pakai **Bahasa Indonesia** (istilah teknis tetap Inggris jika perlu).  
**Alasan:** Panitia & tuan rumah di desa lebih nyaman bahasa Indonesia (ex: "Kelola Anggota", "Pemberian", "Rekap").

## ADR-011: Docker Hanya 1 Port Expose

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** Request homelab hanya expose 1 port ke web, DB lewat network internal.  
**Keputusan:** `docker-compose.yml` hanya `web:3000`, `postgres` tanpa `ports`, komunikasi via `networks: appnet`, `web.environment.DATABASE_URL=postgresql://postgres:postgres@postgres:5432/...`  
**Alasan:** Lebih aman (DB tidak expose), sesuai request, dan homelab tetap bisa backup via `docker exec`.

## ADR-012: Export Selalu Semua Data + Footer Total

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** Export sebelumnya ikut filter `q` di tabel, total tidak ada di footer, tuan rumah bingung totalnya.  
**Keputusan:** Export (Excel/PDF) **selalu semua data di DB untuk event** (abaikan `search`), sorting via `exportOrder`, **footer TOTAL selalu ada** (Rp + jumlah tamu + nominal mentah + rekap TOTAL jika groupBy).  
**Alasan:** Laporan untuk tuan rumah harus utuh, bukan yang ter-filter.

## ADR-013: Duplicate Tamu Wajib Catatan

**Tanggal:** 2026-09-09  
**Status:** Diterima  
**Konteks:** Tamu yang sama bisa diinput >1x tanpa cek, rawan dobel.  
**Keputusan:** Duplicate = `nama+alamat` (case-insensitive) per `eventId` (Opsi A). `Suggest` filter tidak tampil yang sudah tercatat. `POST /guests` return `409 DUPLICATE_NEED_NOTE` jika `catatan` kosong; `GET /guests/check?nama=&alamat=` untuk live warning (banner kuning di form). Jika kebetulan sama (nama kembar), wajib isi `catatan`/penanda (contoh: Krajan Lor) untuk bedakan, lalu bisa simpan. Audit `CREATE_GUEST_DUPLICATE_WITH_NOTE`.  
**Alasan:** Mencegah dobel tidak sengaja tapi tetap izinkan kembaran dengan penanda, satset tetap terjaga.
