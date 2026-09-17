# Hajat Manager

Aplikasi manajemen tamu kondangan (hajatan) untuk mencatat pemberian secara **cepat, rapi, dan transparan**. Dibuat untuk panitia di lapangan (input satset di HP) dan tuan rumah (dashboard rekap & export). Mendukung **multi-acara, multi-admin tak terbatas**, buku tamu terpisah, dan rekap per desa/metode.

> Stack: **Next.js 15 + TypeScript + Tailwind + shadcn/ui + Prisma + PostgreSQL + Auth.js (Google & Email) + Docker**

## ✨ Fitur Utama

- **Buku Tamu dulu, Pemberian satset** — ketik 2 huruf nama langsung suggest dari buku tamu + data acara, alamat auto-fill
- **Shortcut cerdas** — 4 chip alamat paling sering & 4 chip nominal paling sering per acara (klik langsung isi)
- **Multi-admin tak terbatas** — 1 acara bisa punya banyak admin/owner/viewer, semua via search user
- **Rekap & Export** — total tamu, total Rp, per alamat (desa), per metode (AMPLOP/QRIS/TRANSFER), export Excel & PDF dengan opsi urutan (Nama A-Z, Alamat A-Z, Nominal, Waktu) + group by alamat
- **Audit Log** — siapa input/edit/hapus jam berapa tercatat
- **Login Google & Email** — semua user adalah `User`, hak akses di level acara (`EventMember`)

## 🚀 Quick Start (Lokal)

```bash
# 1. Clone & masuk folder
git clone <repo> "Hajat Manager"
cd "Hajat Manager"

# 2. Copy env
cp .env.example .env
# isi DATABASE_URL, AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET

# 3. Jalankan Postgres + App via Docker
docker compose up -d

# 4. Migrasi DB
npx prisma migrate dev

# 5. Jalankan dev
npm install
npm run dev
# buka http://localhost:3000
```

Lihat panduan lengkap di [`docs/setup.md`](docs/setup.md).

## 📚 Dokumentasi

| Dokumen | Isi |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Arsitektur, tech stack, diagram, keputusan |
| [`docs/database.md`](docs/database.md) | ERD, skema Prisma, relasi, index |
| [`docs/fitur.md`](docs/fitur.md) | Daftar fitur, user story, alur satset |
| [`docs/api.md`](docs/api.md) | Kontrak API & contoh payload |
| [`docs/setup.md`](docs/setup.md) | Setup lokal & deploy homelab + Google OAuth |
| [`docs/user-guide.md`](docs/user-guide.md) | Panduan panitia & owner (bahasa awam) |
| [`docs/decision-log.md`](docs/decision-log.md) | Catatan keputusan arsitektur (ADR) |
| [`docs/release-desktop.md`](docs/release-desktop.md) | Setup.exe Windows, paket Linux/AUR, build lokal |
| [`CHANGELOG.md`](CHANGELOG.md) | Riwayat perubahan |

## 🖥️ Alur Singkat

1. **Daftar** sebagai User (Google atau Email/Password)
2. **Buat Acara** → otomatis jadi OWNER acara itu
3. **Kelola Anggota** → search user lain → add sebagai ADMIN/OWNER/VIEWER (tak terbatas)
4. **Isi Buku Tamu** → import Excel atau input manual `nama + alamat`
5. **Input Pemberian** → ketik nama → pilih suggest → alamat terisi → klik chip nominal → simpan
6. **Rekap & Export** → owner bisa lihat dashboard & cetak Excel/PDF

## 🐳 Deploy Homelab

```bash
docker compose up -d --build
npx prisma migrate deploy
# backup
docker exec pencatat-postgres pg_dump -U postgres hajat_manager > backup.sql
```

## 📄 Lisensi

MIT — bebas pakai untuk hajatan keluarga & desa.

---

> Butuh bantuan? Baca [`docs/user-guide.md`](docs/user-guide.md) atau buat issue.
