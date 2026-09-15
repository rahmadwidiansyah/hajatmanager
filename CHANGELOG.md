# [1.1.0](https://github.com/rahmadwidiansyah/hajatmanager/compare/v1.0.2...v1.1.0) (2026-09-15)


### Bug Fixes

* **android:** robust gradlew handling + remove tracked build.gradle ([1e13d39](https://github.com/rahmadwidiansyah/hajatmanager/commit/1e13d392939eb8119197aad5aabe1c9363708730))
* offline mode sync tidak mengubah status acara ke online ([c93a3d6](https://github.com/rahmadwidiansyah/hajatmanager/commit/c93a3d6c2b0f44ac8bf735e0960ab69a0f331edc))
* **prisma:** add username, avatar, profilePicture, updatedAt to User ([2a76bf2](https://github.com/rahmadwidiansyah/hajatmanager/commit/2a76bf2d3d6a3245a180d0d0d607db652de80372))


### Features

* flutter client, windows desktop, adaptive members, release pipeline ([278aed5](https://github.com/rahmadwidiansyah/hajatmanager/commit/278aed53d7b5988b4852b81eb586842b135d7e9b))

## [1.0.3](https://github.com/rahmadwidiansyah/hajatmanager/compare/v1.0.2...v1.0.3) (2026-09-13)


### Bug Fixes

* **android:** robust gradlew handling + remove tracked build.gradle ([1e13d39](https://github.com/rahmadwidiansyah/hajatmanager/commit/1e13d392939eb8119197aad5aabe1c9363708730))
* offline mode sync tidak mengubah status acara ke online ([c93a3d6](https://github.com/rahmadwidiansyah/hajatmanager/commit/c93a3d6c2b0f44ac8bf735e0960ab69a0f331edc))
* **prisma:** add username, avatar, profilePicture, updatedAt to User ([2a76bf2](https://github.com/rahmadwidiansyah/hajatmanager/commit/2a76bf2d3d6a3245a180d0d0d607db652de80372))

## [1.0.2](https://github.com/rahmadwidiansyah/hajatmanager/compare/v1.0.1...v1.0.2) (2026-09-12)


### Bug Fixes

* **android:** commit patched build.gradle with conditional signing ([3f204aa](https://github.com/rahmadwidiansyah/hajatmanager/commit/3f204aa9e0dc6d5d1658a33d6f0e219cf96c938f))
* **deploy:** production GHCR 5080 + prisma 6.19.3 + native npm ci + APK signed ([b6ce097](https://github.com/rahmadwidiansyah/hajatmanager/commit/b6ce097b540c32e0f9ca9788c26e169d68b2869b))
* **native:** gradle signing scope + windows PowerShell npm ci ([085c7cd](https://github.com/rahmadwidiansyah/hajatmanager/commit/085c7cd8d84f49c1ac684dde6e4ebd096f5ae55c))

## [1.0.1](https://github.com/rahmadwidiansyah/hajatmanager/compare/v1.0.0...v1.0.1) (2026-09-11)


### Bug Fixes

* **ci:** allow android workflow without secrets in if ([693aa90](https://github.com/rahmadwidiansyah/hajatmanager/commit/693aa906d4f2f791bee8d65dbb4f4b0f88dcef1b))

# 1.0.0 (2026-09-11)


### Bug Fixes

* **native:** make EXE/APK sideload buildable ([1aaf69c](https://github.com/rahmadwidiansyah/hajatmanager/commit/1aaf69cd038daa8937e7b0bb6486fc5bea1b64bb))
* **release:** install semantic-release plugins + use Node 22 ([80a683f](https://github.com/rahmadwidiansyah/hajatmanager/commit/80a683fbe8a6ba20e53ecc343284a54301d49e3c))
* sync package-lock for hajat-manager rebrand ([d9e56ec](https://github.com/rahmadwidiansyah/hajatmanager/commit/d9e56ec8119dc727969a47b9846ece35e78e7fd1))


### Features

* rebrand to Hajat Manager + 3 workflows ([06d9ec9](https://github.com/rahmadwidiansyah/hajatmanager/commit/06d9ec9d48a9e0cc470444eca5aed1dddaccafa5))

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
