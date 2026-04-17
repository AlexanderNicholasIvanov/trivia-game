#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
VENV="$BACKEND_DIR/.venv"

if [[ ! -d "$VENV" ]]; then
  echo "Creating Python venv at $VENV"
  python3.12 -m venv "$VENV"
  "$VENV/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies"
  (cd "$FRONTEND_DIR" && npm install)
fi

echo "Applying database migrations"
(cd "$BACKEND_DIR" && "$VENV/bin/alembic" upgrade head)

backend_pid=""
frontend_pid=""

cleanup() {
  trap - INT TERM EXIT
  if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
  fi
  if [[ -n "$frontend_pid" ]] && kill -0 "$frontend_pid" 2>/dev/null; then
    kill "$frontend_pid" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "Starting backend (uvicorn) on http://localhost:8000"
(cd "$BACKEND_DIR" && "$VENV/bin/uvicorn" app.main:app --reload) &
backend_pid=$!

echo "Starting frontend (vite) on http://localhost:5173"
(cd "$FRONTEND_DIR" && npm run dev) &
frontend_pid=$!

# Portable "wait for first to exit" — bash 3.2 lacks `wait -n`.
while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done
