#!/usr/bin/env bash
# Start both watch mode and no-watch mode simultaneously.
# Watch mode: Vite dev server (port 3000) + Express API (port 3001)
# No-watch mode: Express serves built React files + API (port 3002)

set -e

echo "Building client for no-watch mode..."
npm run build:client

echo ""
echo "=========================================="
echo " Watch mode    → http://localhost:3000"
echo "   UI: Vite dev server on port 3000"
echo "   API: Express on port 3001"
echo "   File watching: ON (auto-rebuild)"
echo ""
echo " No-watch mode → http://localhost:3002"
echo "   UI + API: Express serves built files on port 3002"
echo "   File watching: OFF (no rebuilds)"
echo "=========================================="
echo ""

# Start watch mode (Vite dev server + Express with file watching)
concurrently -n "watch-ui,watch-api" -c "yellow,cyan" \
  "vite --config src/client/vite.config.ts src/client" \
  "tsx watch src/server/index.ts" &
WATCH_PID=$!

# Start no-watch mode (Express serves built React + API on port 3002)
PORT=3002 tsx src/server/index.ts &
NOWATCH_PID=$!

# Trap SIGINT/SIGTERM to kill both processes
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $WATCH_PID $NOWATCH_PID 2>/dev/null
  wait $WATCH_PID $NOWATCH_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# Wait for both background processes
wait
