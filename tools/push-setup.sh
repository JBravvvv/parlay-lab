#!/usr/bin/env bash
# BET ALERTS — one-time key setup (2026-10-09). Run by Josh, once, from the Parlay-Lab folder.
#
# Makes the app's push-alert key pair and stores it in Vercel's Production settings, then redeploys so the
# live app picks it up. The PRIVATE key is never printed, written to disk, or committed — it goes straight
# from this script into Vercel as a sensitive variable. The PUBLIC key is public by design (phones use it
# to sign up). Safe to re-run: it replaces the old pair, and every phone then needs "Turn on bet alerts" again.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"

command -v vercel >/dev/null || { echo "The Vercel command isn't installed here — tell Claude."; exit 1; }
vercel whoami >/dev/null 2>&1 || { echo "Vercel isn't logged in on this Mac — run: vercel login   then run this again."; exit 1; }

KEYS="$(node -e 'const k=require("web-push").generateVAPIDKeys();process.stdout.write(k.publicKey+" "+k.privateKey)')"
PUB="${KEYS%% *}"
PRIV="${KEYS##* }"
unset KEYS

printf %s "$PUB"  | vercel env add VAPID_PUBLIC_KEY production --force --no-sensitive >/dev/null
printf %s "$PRIV" | vercel env add VAPID_PRIVATE_KEY production --force --sensitive >/dev/null
unset PRIV
echo "Keys stored in Vercel (Production)."

echo "Redeploying the live app so it picks them up (about 2 minutes)…"
if vercel redeploy https://parlay-lab-six.vercel.app --target production >/dev/null 2>&1; then
  echo "Done. Open Parlay Lab from your Home Screen → ⋯ More → Taken → Turn on bet alerts → Allow."
else
  echo "Keys are saved, but the redeploy didn't start — tell Claude \"push keys are in\" and it will redeploy."
fi
