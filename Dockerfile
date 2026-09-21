FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# dummy env for prisma generate + next collectPageData (real env injected at runtime)
ENV DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy
ENV AUTH_SECRET=dummy-32-chars-for-build-only-xxxxxxxxxxxxxxxx
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Runtime deps + Prisma CLI 6.19.3 untuk `npx prisma migrate deploy`
# prisma & @prisma/client berada di dependencies (package.json) sehingga terbawa oleh --omit=dev.
# Pakai ulang node_modules dari stage deps + prune devDeps (tanpa download ulang).
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
RUN npm prune --omit=dev --ignore-scripts && npm cache clean --force

# Next.js standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma schema + migrations (wajib untuk migrate deploy)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Prisma Client yang sudah di-generate (libquery_engine, schema-engine)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
# next.config.ts dibutuhkan runtime standalone (dibaca server.js)
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts

# Fix ownership agar `nextjs` bisa menjalankan `npx prisma` tanpa error write permission
RUN chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Migrate otomatis saat start agar fresh deploy tidak P2021 (tabel belum ada).
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
