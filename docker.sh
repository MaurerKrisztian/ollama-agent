#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/docker.env"

# Defaults
IMAGE="ollama-agent-studio"
CONTAINER="ollama-agent-studio"
HOST_PORT="3000"
CONTAINER_PORT="3001"
OLLAMA_URL="http://host.docker.internal:11434"
MOUNT_WORKDIR="true"
WORKING_DIR="/workspace"

# Load config file if present
if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  echo "⚙️  Loaded config from docker.env"
fi

start() {
  if docker ps -q -f name="^${CONTAINER}$" | grep -q .; then
    echo "✅ Already running → http://localhost:${HOST_PORT}"
    return
  fi

  docker rm -f "$CONTAINER" 2>/dev/null || true

  MOUNT_ARGS=()
  if [[ "$MOUNT_WORKDIR" == "true" ]]; then
    MOUNT_ARGS=(-v "${SCRIPT_DIR}:/workspace" -w /workspace)
  fi

  echo "🚀 Starting ${CONTAINER}..."
  echo "   Image:   ${IMAGE}"
  echo "   Port:    ${HOST_PORT} → ${CONTAINER_PORT}"
  echo "   Ollama:  ${OLLAMA_URL}"
  [[ "$MOUNT_WORKDIR" == "true" ]] && echo "   Mount:   ${SCRIPT_DIR} → /workspace"
  echo "   WorkDir: ${WORKING_DIR}"

  docker run -d \
    --name "$CONTAINER" \
    -p "${HOST_PORT}:${CONTAINER_PORT}" \
    --add-host=host.docker.internal:host-gateway \
    -e OLLAMA_BASE_URL="$OLLAMA_URL" \
    -e WORKING_DIR="$WORKING_DIR" \
    "${MOUNT_ARGS[@]}" \
    "$IMAGE"

  echo "✅ Started → http://localhost:${HOST_PORT}"
}

stop() {
  echo "🛑 Stopping ${CONTAINER}..."
  docker stop "$CONTAINER" 2>/dev/null || true
  docker rm   "$CONTAINER" 2>/dev/null || true
  echo "✅ Stopped."
}

restart() {
  stop
  start
}

rebuild() {
  stop
  echo "🔨 Rebuilding image ${IMAGE} (no cache)..."
  docker build --no-cache -t "$IMAGE" "$SCRIPT_DIR"
  echo "✅ Build complete."
  start
}

status() {
  if docker ps -q -f name="^${CONTAINER}$" | grep -q .; then
    echo "✅ Running → http://localhost:${HOST_PORT}"
    docker ps --filter name="^${CONTAINER}$" --format "   ID: {{.ID}}  Uptime: {{.Status}}"
  else
    echo "⛔ Not running."
  fi
}

help() {
  echo ""
  echo "  🐳 ollama-agent-studio — Docker control script"
  echo ""
  echo "  Commands:"
  echo "    start     Start the container (skips if already running)"
  echo "    stop      Stop and remove the container"
  echo "    restart   Stop then start"
  echo "    rebuild   Stop, rebuild the image, then start"
  echo "    status    Show running state and container info"
  echo ""
  echo "  Config (docker.env):"
  echo "    IMAGE          Docker image name        (default: ollama-agent-studio)"
  echo "    CONTAINER      Container name           (default: ollama-agent-studio)"
  echo "    HOST_PORT      Host port                (default: 3000)"
  echo "    CONTAINER_PORT Container port           (default: 3001)"
  echo "    OLLAMA_URL     Ollama base URL          (default: http://host.docker.internal:11434)"
  echo "    MOUNT_WORKDIR  Mount project dir        (default: true)"
  echo "    WORKING_DIR    Working dir in container (default: /workspace)"
  echo ""
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) restart ;;
  rebuild) rebuild ;;
  status)  status ;;
  help|--help|-h) help ;;
  *)
    [[ -n "${1:-}" ]] && echo "❓ Unknown command: $1"
    help
    ;;
esac
