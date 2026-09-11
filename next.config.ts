import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Untuk native (Tauri/Capacitor) build static export jika NATIVE_BUILD=1
  ...(process.env.NATIVE_BUILD === "1"
    ? { output: "export" as const, images: { unoptimized: true } }
    : {
        output: "standalone" as const,
        images: {
          remotePatterns: [
            { protocol: "https", hostname: "lh3.googleusercontent.com" },
            { protocol: "https", hostname: "*.googleusercontent.com" },
          ],
        },
      }),
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
