import path from "node:path";
import type { NextConfig } from "next";

/** The local sheet previewer: no backend, no auth, no environment variables. */
const config: NextConfig = {
  // The monorepo root, so the SDK and the systems compile from source.
  turbopack: { root: path.join(__dirname, "../..") },
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Portraits are whatever URL the character holds; nothing optimizes them locally.
  images: { unoptimized: true },
  async redirects() {
    return [{ source: "/", destination: "/en", permanent: false }];
  },
};

export default config;
