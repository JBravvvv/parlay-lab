#!/bin/bash
# Parlay Lab local dev server.
# Double-click this file (or run it) to serve the app at http://localhost:8790
# then open that URL in your browser. Press Ctrl+C in the Terminal window to stop.
# NOTE: must be served over http — do NOT open index.html as a file:// URL,
# or the live MLB / Odds API fetches will fail.
cd "$(dirname "$0")" || exit 1
PORT=8790
echo "Parlay Lab -> http://localhost:$PORT   (Ctrl+C to stop)"
open "http://localhost:$PORT/index.html" 2>/dev/null
python3 -m http.server "$PORT"
