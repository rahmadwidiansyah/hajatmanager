# Changelog — Hajat Manager

Semua perubahan penting dicatat di sini. Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/).

## [Unreleased]

### Ditambahkan
- Dokumentasi awal: `README.md`, `docs/architecture.md`, `docs/database.md`, `docs/fitur.md`, `docs/api.md`, `docs/setup.md`, `docs/user-guide.md`, `docs/decision-log.md`, `CHANGELOG.md` (Fase 0)
- Rancangan skema Prisma: `User`, `Account`, `Session`, `Event`, `EventMember` (unlimited), `GuestBook`, `Guest`, `AuditLog`
- Rancangan fitur: buku tamu dulu → catat pemberian satset dengan suggest + chips alamat/nominal Top 4, metode AMPLOP/QRIS, catatan
- Rancangan auth: Auth.js Google + Credentials, role per acara OWNER/ADMIN/VIEWER
- Rancangan export Excel/PDF dengan opsi urutan + group by alamat

### Diputuskan
- ADR-001 s/d ADR-010 (lihat `docs/decision-log.md`)

## [0.1.0] - 2026-09-09

### Ditambahkan
- Inisiasi proyek di folder `Hajat Manager` (sebelumnya kosong)
- Kesepakatan stack: Next.js 15 + Prisma + PostgreSQL + Docker + Auth.js
- Kesepakatan flow: web online dulu (Fase 1-6), offline + push homelab di Fase 7

---

> Versi mengikuti SemVer: `MAJOR.MINOR.PATCH`. `Unreleased` untuk perubahan yang belum di-tag.
