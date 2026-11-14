#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${MATTERLAB_API_PORT:-8000}"
WEB_PORT="${MATTERLAB_WEB_PORT:-5173}"
API_PID=""

find_listening_pids() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -tlnp "sport = :$port" 2>/dev/null \
      | grep -oE 'pid=[0-9]+' \
      | cut -d= -f2 \
      | sort -u || true
  fi
}

free_port() {
  local port="$1"
  local pids
  pids="$(find_listening_pids "$port")"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  echo "Port $port is in use by PID(s): $(echo "$pids" | tr '\n' ' '). Stopping..."
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done

  for _ in {1..15}; do
    if [[ -z "$(find_listening_pids "$port")" ]]; then
      echo "Port $port freed."
      return 0
    fi
    sleep 0.2
  done

  local remaining
  remaining="$(find_listening_pids "$port")"
  if [[ -n "$remaining" ]]; then
    echo "Force-stopping remaining PID(s) on port $port: $(echo "$remaining" | tr '\n' ' ')"
    for pid in $remaining; do
      kill -9 "$pid" 2>/dev/null || true
    done
    sleep 0.3
  fi
}

cleanup() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    echo ""
    echo "Stopping Science API (PID $API_PID)..."
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

free_port "$API_PORT"
free_port "$WEB_PORT"

echo "Starting MatterLab Science API on http://127.0.0.1:$API_PORT ..."
(
  cd "$ROOT_DIR/services/science-api"
  exec uv run uvicorn app.main:app --reload --port "$API_PORT"
) &
API_PID=$!

echo "Waiting for Science API health check..."
api_ready=false
for _ in {1..60}; do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "Error: Science API process exited unexpectedly." >&2
    exit 1
  fi
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null 2>&1; then
      api_ready=true
      break
    fi
  else
    if [[ -n "$(find_listening_pids "$API_PORT")" ]]; then
      api_ready=true
      break
    fi
  fi
  sleep 0.5
done

if [[ "$api_ready" != "true" ]]; then
  echo "Error: Science API did not become healthy on port $API_PORT in time." >&2
  exit 1
fi

echo "Science API ready at http://127.0.0.1:$API_PORT"
echo "Starting MatterLab Web App on http://localhost:$WEB_PORT ..."

cd "$ROOT_DIR"
npm --workspace=@matterlab/web run dev -- --port "$WEB_PORT"
