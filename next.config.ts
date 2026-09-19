import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LOCAL verification builds use `npm run build:local` -> .next-build so they
  // can never clobber a running dev server's .next state (that corruption
  // serves the app with no stylesheet). Vercel runs plain `npm run build` and
  // must use the default .next, or the deployment comes up NOT_FOUND.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The commit this bundle is built from, inlined for the installed app's self-update
  // (src/components/shell/SwRegister.tsx compares it with /api/version). "" on a local build.
  env: { NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "" },
  // The Sharp's system prompt is read from disk at request time on Vercel.
  outputFileTracingIncludes: { "/api/sharp": ["./prompts/**"] },
  // The background video never changes — let browsers keep it forever.
  async headers() {
    return [
      {
        source: "/media/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
