# Setup — Hajat Manager

Panduan instalasi lokal dan deploy di homelab (Indonesia penuh).

## 1. Prasyarat

- **Node.js 20+** (`node -v`) dan **npm 10+**
- **Docker & Docker Compose** (untuk Postgres)
- **Git**
- Akun **Google Cloud** (jika pakai Login Google)
- Domain/HTTPS untuk homelab (bisa Cloudflare Tunnel, Tailscale, atau nip.io)

## 2. Setup Lokal (Tanpa Docker Postgres - Alternatif)

Jika tidak mau Docker, install Postgres lokal:

```bash
# Arch Linux
sudo pacman -S postgresql
sudo systemctl start postgresql
createdb hajat_manager
```

Tapi **disarankan pakai Docker** agar sama dengan homelab.

## 3. Clone & Install

```bash
git clone <repo-url> "Hajat Manager"
cd "Hajat Manager"

# copy env
cp .env.example .env
```

Isi `.env`:

```env
# Database
# Dev lokal (npm run dev tanpa docker): localhost
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hajat_manager?schema=public"
# Docker compose otomatis override jadi postgresql://postgres:postgres@postgres:5432/hajat_manager?schema=public
# (postgres tidak expose port, hanya via network appnet)

# Auth.js
AUTH_SECRET="ganti-dengan-random-32-karakter-minimal"
AUTH_URL="http://localhost:3000"

# Google OAuth (opsional, bisa kosong jika hanya email/password)
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="xxx"

# App
NEXT_PUBLIC_APP_NAME="Hajat Manager"

# Versi + link unduhan OTOMATIS ngikutin semantic-release — biarkan kosong:
# versi diambil dari package.json, link dibentuk ke GitHub Releases tag tsb.
NEXT_PUBLIC_APP_VERSION=""
NEXT_PUBLIC_GITHUB_REPO="rahmadwidiansyah/hajatmanager"
NEXT_PUBLIC_DOWNLOAD_ANDROID=""
NEXT_PUBLIC_DOWNLOAD_WINDOWS=""
NEXT_PUBLIC_DOWNLOAD_LINUX=""
# Isi manual hanya untuk override (misal CDN). Tiap ganti wajib rebuild.
```

Generate `AUTH_SECRET`:
```bash
openssl rand -base64 32
# atau
npx auth secret
```

## 4. Jalankan dengan Docker (Rekomendasi) — Hanya 1 Port Expose

`docker-compose.yml` sekarang **hanya expose port `3000` (web)**. Postgres komunikasi lewat network internal `appnet`, tidak expose ke host (lebih aman untuk homelab).

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: pencatat-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: hajat_manager
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - appnet
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5
    # tidak ada ports — hanya diakses web via appnet

  web:
    build: .
    container_name: pencatat-web
    restart: unless-stopped
    ports:
      - "3000:3000" # satu-satunya port yang expose
    env_file: .env
    environment:
      DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/hajat_manager?schema=public"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - appnet
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next

networks:
  appnet:
    driver: bridge
volumes:
  pgdata:
```

**Catatan dev lokal:**
- `npm run dev` di host **tidak bisa** pakai `postgres:5432` (itu hostname docker). Untuk dev lokal pakai **Docker web** (`docker compose up -d`) atau pakai Postgres host yang sudah ada (ex: `root:secretpassword@localhost:5432` seperti setup sekarang).
- Jika butuh `npm run dev` + Postgres docker, expose sementara: `docker compose run --service-ports postgres` atau buat `docker-compose.override.yml` dengan `ports: ["5432:5432"]`.

Jalankan:

```bash
docker compose up -d
# cek log
docker compose logs -f web
docker compose logs -f postgres
```

## 5. Migrasi Database

```bash
# install deps dulu (jika belum)
npm install

# generate Prisma Client & migrasi
npx prisma migrate dev --name init
# atau jika di Docker
docker exec pencatat-web npx prisma migrate dev --name init

# seed (opsional, buat user demo)
npx prisma db seed
```

Cek DB:
```bash
npx prisma studio
# buka http://localhost:5555
```

## 6. Jalankan Aplikasi

```bash
npm run dev
# buka http://localhost:3000
```

Akun demo setelah seed (jika ada):
- `admin@test.com / password123` (bisa buat acara)
- `owner@test.com / password123`

## 7. Setup Google OAuth (Login Google)

1. Buka https://console.cloud.google.com → buat Project baru.
2. **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   - Application type: Web application
   - Name: Hajat Manager
   - Authorized JavaScript origins: `http://localhost:3000` dan `https://homelab-mu.com` (nanti)
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` dan `https://homelab-mu.com/api/auth/callback/google`
3. Copy `Client ID` & `Client Secret` → masukkan ke `.env`.
4. Restart app: `docker compose restart web` atau `npm run dev`.

**Catatan homelab:** Google tidak mengizinkan `http://192.168.x.x` sebagai redirect. Harus pakai domain/HTTPS. Solusi:
- **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:3000`)
- **Tailscale Funnel**
- **ngrok** untuk tes

## 7b. Login Google di APK Android (native)

APK memakai `serverClientId` = **Web client ID yang sama** (`GOOGLE_CLIENT_ID`, fallback `ANDROID_GOOGLE_CLIENT_ID` bila yang pertama kosong — lihat `/api/auth/mobile/config`). Selain itu wajib daftar **Android OAuth client** agar SHA-1 cocok:

1. Google Cloud Console → Credentials → Create Credentials → OAuth Client ID → **Android**.
2. Package name: `com.hajatmanager.hajat_manager` (lihat `mobile/android/app/build.gradle.kts`).
3. SHA-1 certificate fingerprint — daftarkan **dua-duanya**:
   ```bash
   # SHA-1 debug (dev)
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
   # SHA-1 release (APK rilis — dari keystore yang dipakai build)
   keytool -list -v -keystore <release.keystore> -alias <key-alias>
   ```
4. Gejala bila belum lengkap:
   - Tombol Google tidak muncul / "Login Google belum tersedia" → `GOOGLE_CLIENT_ID` & `ANDROID_GOOGLE_CLIENT_ID` kosong di server, atau HP offline.
   - "Token Google kosong" → `serverClientId` null saat init (cek `/api/auth/mobile/config`).
   - "Token Google ditolak server" → `aud` token tidak cocok dengan env (isi `GOOGLE_CLIENT_ID` dengan Web client ID yang sama).
   - Popup langsung tertutup / `clientConfigurationError` → SHA-1 release belum didaftarkan, atau package name beda.

## 8. Deploy di Homelab

```bash
# di server homelab
git clone <repo> hajat-manager
cd hajat-manager
cp .env.example .env
# isi .env dengan AUTH_URL=https://kondangan.homelab-mu.com dan DATABASE_URL yang sesuai

docker compose up -d --build
# migrasi production
docker exec pencatat-web npx prisma migrate deploy

# cek
docker compose ps
docker compose logs -f web
```

**Backup harian (cron):**
```bash
# crontab -e
0 2 * * * docker exec pencatat-postgres pg_dump -U postgres hajat_manager | gzip > /backup/kondangan_$(date +\%F).sql.gz
```

**Restore:**
```bash
gunzip < /backup/kondangan_2026-09-09.sql.gz | docker exec -i pencatat-postgres psql -U postgres -d hajat_manager
```

**Update aplikasi:**
```bash
git pull
docker compose up -d --build
docker exec pencatat-web npx prisma migrate deploy
```

## 9. Perintah Penting

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Build production |
| `npm start` | Jalankan production |
| `npx prisma studio` | GUI database |
| `npx prisma migrate dev --name <nama>` | Buat migrasi baru |
| `docker compose up -d` | Jalankan semua service |
| `docker compose down` | Matikan |
| `docker compose logs -f web` | Lihat log web |

## 10. Troubleshooting

**Prisma error `Can't reach database`:** cek `DATABASE_URL` dan `docker compose ps` (postgres harus healthy).

**Google login error `redirect_uri_mismatch`:** cek di Google Console redirect URI harus persis `.../api/auth/callback/google` (tanpa trailing slash).

**Port 3000 sudah dipakai:** `lsof -i :3000` lalu `kill` atau ganti port di `docker-compose.yml` dan `AUTH_URL`.

**Build gagal di Docker:** `docker compose build --no-cache`.

## 11. Variabel Env Lengkap

Lihat `.env.example` di repo untuk daftar lengkap.
