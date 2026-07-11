import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run build` writes to .next-build so a verification build can never
  // clobber the running dev server's .next state (that corruption serves the
  // app with no stylesheet). Vercel/`next start` use the default via env.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // PWA (Serwist) is wired in Phase 6.
};

export default nextConfig;
