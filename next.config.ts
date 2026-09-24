import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.ngrok-free.app", "*.tunnelmole.net"],
  // The ~9.6 MB soundfont would otherwise be revalidated on every visit
  // (Vercel's default for /public). Soundfont filenames are versioned, so a
  // changed font gets a new name instead of fighting this cache. Only .sf2:
  // the LICENSE beside it isn't versioned and must stay revalidated.
  async headers() {
    return [
      {
        source: "/soundfont/:file(.*\.sf2)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
