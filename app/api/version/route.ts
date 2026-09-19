import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Which commit is this deployment serving? Read by the installed app's self-update
    (src/components/shell/SwRegister.tsx) on open and whenever it comes back to the foreground — 2026-09-19, after
    Josh's phone kept showing the pre-deploy page. Public and free: Vercel's own commit sha (the repo is public),
    nothing else, never cached. */
export async function GET() {
  return NextResponse.json({ sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "" }, { headers: { "cache-control": "no-store" } });
}
