/**
 * WHERE THIS APP CALLS ITSELF (2026-11-14, the outage Josh reported: "no excuse for it not running").
 *
 * The scheduler forwards to its own routes (the any-time run, the CFB and NFL locks, the MLB
 * refill and grade). It built those addresses from the incoming request's origin. A Vercel cron
 * invocation arrives on the DEPLOYMENT hostname (parlay-<id>-<team>.vercel.app), and that hostname
 * sits behind Vercel's login page, so every forward was answered 302 and nothing ran: measured in
 * the request log, every forward from 2026-11-12 21:45Z on. The production domain is not behind
 * the login. So in production a self-call goes to the production domain, whatever host the
 * request came in on. Anywhere else (local, tests, a preview) it is the request's own origin.
 */
export const PRODUCTION_HOST = "parlay-lab-six.vercel.app";

type Env = { VERCEL_ENV?: string; VERCEL_PROJECT_PRODUCTION_URL?: string };

export function selfOrigin(requestOrigin: string, env: Env = process.env as Env): string {
  if (env.VERCEL_ENV !== "production") return requestOrigin;
  const host = env.VERCEL_PROJECT_PRODUCTION_URL;
  return `https://${host && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) ? host : PRODUCTION_HOST}`;
}
