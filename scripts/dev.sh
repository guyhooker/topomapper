#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
PROCESSOR_PID=""

if [ ! -x "$VENV/bin/python3" ]; then
  echo "Preparing Topomapper's local elevation tools (first run only)…"
  python3 -m venv "$VENV"
  "$VENV/bin/python3" -m pip install --upgrade pip
  "$VENV/bin/python3" -m pip install -r "$ROOT/processing/requirements.txt"
fi

if ! "$VENV/bin/python3" -c "import rasterio" >/dev/null 2>&1; then
  echo "Repairing Topomapper's local elevation tools…"
  "$VENV/bin/python3" -m pip install -r "$ROOT/processing/requirements.txt"
fi

if [ ! -f "$ROOT/fixtures/taranaki-stage3-synthetic.tif" ]; then
  "$VENV/bin/python3" "$ROOT/processing/create_test_fixture.py"
fi

cleanup() {
  if [ -n "$PROCESSOR_PID" ]; then
    kill "$PROCESSOR_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if ! curl --silent --fail http://127.0.0.1:8765/health >/dev/null 2>&1; then
  "$VENV/bin/python3" -u "$ROOT/processing/server.py" &
  PROCESSOR_PID=$!
fi

cd "$ROOT"
WRANGLER_LOG_PATH=.wrangler/wrangler.log ./node_modules/.bin/vinext dev
