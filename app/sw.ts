import { defaultCache } from "@serwist/next/worker";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";
import type { PrecacheEntry } from "serwist";

// Catatan: tsconfig proyek hanya punya lib "dom" (tanpa "webworker"),
// jadi deklarasikan minimal shape `self` yang kita pakai — tanpa tipe SW global.
declare const self: {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Fase 6: abaikan query string saat mencocokkan precache — default Serwist
  // hanya mengabaikan utm_*/fbclid, sehingga /unlock?event=… atau
  // /events/…?tab=… offline jatuh ke /offline walau halamannya ter-cache.
  precacheOptions: { ignoreURLParametersMatching: [/.*/] },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Fase 3: bacaan kritis hajatan — NetworkFirst dengan timeout pendek (5s)
    // agar fallback cache cepat saat sinyal hilang. Mutasi (POST/PATCH/DELETE)
    // tidak pernah di-cache (hanya GET yang bisa masuk Cache API) dan tetap
    // ditangani outbox Dexie di `lib/offline-sync.ts`.
    {
      matcher: ({ request, sameOrigin, url }) =>
        request.method === "GET" &&
        sameOrigin &&
        (url.pathname.startsWith("/api/events/") ||
          url.pathname.startsWith("/api/sync/pull")),
      handler: new NetworkFirst({
        cacheName: "hajat-api",
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 300,
            maxAgeSeconds: 24 * 60 * 60,
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        // Fase 6: file statis (bukan route Next) agar tidak ada hidrasi /
        // kanonikalisasi router yang membuat fallback tidak deterministik.
        url: "/offline.html",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
