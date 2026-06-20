#!/usr/bin/env bash
#
# deploy.sh — Deploy this Docker Compose project to a Docker host on Proxmox.
#
# It rsyncs the project to the remote host and runs `docker compose up -d --build`
# THERE, so images are built natively on the target (amd64) — no arch mismatch
# from building on an Apple Silicon Mac.
#
# Usage:
#   ./deploy.sh                # sync + build + up
#   ./deploy.sh --no-cache     # force a clean image rebuild
#   ./deploy.sh --down         # bring the stack down on the remote, then exit
#   ./deploy.sh --logs         # tail logs after deploy
#
# Config: edit the block below, or drop a `deploy.env` next to this script
# (it will be sourced automatically) so you don't commit host details.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config (override via deploy.env or environment variables)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "${SCRIPT_DIR}/deploy.env" ] && source "${SCRIPT_DIR}/deploy.env"

REMOTE_USER="${REMOTE_USER:-root}"                       # SSH user on the Docker host
REMOTE_HOST="${REMOTE_HOST:-}"                            # IP / hostname of the Docker host (VM or LXC)
REMOTE_PORT="${REMOTE_PORT:-22}"                         # SSH port
REMOTE_DIR="${REMOTE_DIR:-/opt/essential-invoice}"       # where the project lives on the host
COMPOSE_PROJECT="${COMPOSE_PROJECT:-essential-invoice}"  # keep this consistent everywhere
LOCAL_DIR="${LOCAL_DIR:-$SCRIPT_DIR}"                    # project root to sync (defaults to script dir)
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"       # path relative to the project root
APP_ENV_FILE="${APP_ENV_FILE:-.env}"                     # path relative to the project root

# Files/dirs never to ship to the host
RSYNC_EXCLUDES=(
  ".git" "node_modules" "dist" "build" ".DS_Store"
  "*.log" ".vscode" ".idea" "deploy.env" "backups"
)

# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------
NO_CACHE=""
ACTION="deploy"
TAIL_LOGS=""

for arg in "$@"; do
  case "$arg" in
    --no-cache) NO_CACHE="--no-cache" ;;
    --down)     ACTION="down" ;;
    --logs)     TAIL_LOGS="1" ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

c_blue=$'\033[1;34m'; c_green=$'\033[1;32m'; c_red=$'\033[1;31m'; c_reset=$'\033[0m'
log()  { echo "${c_blue}==>${c_reset} $*"; }
ok()   { echo "${c_green}  ✔${c_reset} $*"; }
die()  { echo "${c_red}  ✘ $*${c_reset}" >&2; exit 1; }

SSH=(ssh -p "${REMOTE_PORT}" -o ConnectTimeout=10 "${REMOTE_USER}@${REMOTE_HOST}")

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
log "Pre-flight checks"
command -v rsync >/dev/null || die "rsync not found locally (install it: brew install rsync)"
command -v ssh   >/dev/null || die "ssh not found locally"
[[ -n "${REMOTE_HOST}" ]] || die "REMOTE_HOST is not set; copy deploy.env.example to deploy.env"
[[ -f "${LOCAL_DIR}/${COMPOSE_FILE}" ]] || die "Missing ${LOCAL_DIR}/${COMPOSE_FILE}"
[[ -f "${LOCAL_DIR}/${APP_ENV_FILE}" ]] || die "Missing ${LOCAL_DIR}/${APP_ENV_FILE}; create it from .env.example first"

log "Testing SSH connection to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PORT}"
"${SSH[@]}" "echo connected" >/dev/null 2>&1 || die "Cannot SSH to the host. Check REMOTE_* config and your SSH keys."
ok "SSH reachable"

log "Checking Docker on the remote host"
"${SSH[@]}" "command -v docker >/dev/null && docker compose version >/dev/null 2>&1" \
  || die "Docker (with the compose plugin) is not available on the remote host."
ok "Docker + compose present"

# ---------------------------------------------------------------------------
# --down: tear down and exit
# ---------------------------------------------------------------------------
if [ "$ACTION" = "down" ]; then
  log "Bringing the stack down on the remote"
  "${SSH[@]}" "cd '${REMOTE_DIR}' && docker compose --env-file '${APP_ENV_FILE}' -f '${COMPOSE_FILE}' -p '${COMPOSE_PROJECT}' down"
  ok "Stack stopped"
  exit 0
fi

# ---------------------------------------------------------------------------
# Sync project to the host
# ---------------------------------------------------------------------------
log "Syncing project to ${REMOTE_HOST}:${REMOTE_DIR}"
exclude_args=()
for e in "${RSYNC_EXCLUDES[@]}"; do exclude_args+=(--exclude "$e"); done

"${SSH[@]}" "mkdir -p '${REMOTE_DIR}'"
rsync -az --delete "${exclude_args[@]}" \
  -e "ssh -p ${REMOTE_PORT}" \
  "${LOCAL_DIR}/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"
ok "Files synced"

# ---------------------------------------------------------------------------
# Build + deploy on the host
# ---------------------------------------------------------------------------
log "Deploying on the remote host (project: ${COMPOSE_PROJECT})"
"${SSH[@]}" bash -s <<REMOTE_SCRIPT
set -euo pipefail
cd '${REMOTE_DIR}'

compose=(docker compose --env-file '${APP_ENV_FILE}' -f '${COMPOSE_FILE}' -p '${COMPOSE_PROJECT}')
"\${compose[@]}" config --quiet

# Back up an existing database before replacing application containers.
if "\${compose[@]}" ps --status running --services | grep -qx db; then
  mkdir -p backups
  backup_file="backups/essential-invoice-\$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  "\${compose[@]}" exec -T db sh -c 'pg_dump -U "\$POSTGRES_USER" "\$POSTGRES_DB"' </dev/null | gzip -9 > "\${backup_file}"
  chmod 600 "\${backup_file}"
  echo "  database backup: \${backup_file}"
fi

# Remove a fixed-name database container only when it belongs to another
# Compose project. This keeps the known db-name conflict fix without stopping
# this project's healthy database unnecessarily.
existing_project="\$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' essential-invoice-db 2>/dev/null || true)"
if [ -n "\${existing_project}" ] && [ "\${existing_project}" != '${COMPOSE_PROJECT}' ]; then
  echo "  removing conflicting essential-invoice-db container from project \${existing_project}"
  docker rm -f essential-invoice-db >/dev/null
fi

if [ -n "${NO_CACHE}" ]; then
  echo "  building with --no-cache"
  "\${compose[@]}" build --no-cache
  "\${compose[@]}" up -d --force-recreate --remove-orphans
else
  "\${compose[@]}" up -d --build --force-recreate --remove-orphans
fi

# Verify the API through the same internal route used by the frontend.
for attempt in \$(seq 1 30); do
  if "\${compose[@]}" exec -T frontend wget -qO- http://backend:3001/api/health </dev/null >/dev/null 2>&1; then
    echo "  application is healthy"
    break
  fi
  if [ "\${attempt}" -eq 30 ]; then
    "\${compose[@]}" logs --tail=120 backend frontend >&2
    echo "Application health check failed." >&2
    exit 1
  fi
  sleep 2
done

# Reclaim space from old image layers
docker image prune -f >/dev/null 2>&1 || true
REMOTE_SCRIPT
ok "Deploy complete"

# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------
log "Service status"
"${SSH[@]}" "cd '${REMOTE_DIR}' && docker compose --env-file '${APP_ENV_FILE}' -f '${COMPOSE_FILE}' -p '${COMPOSE_PROJECT}' ps"

if [ -n "$TAIL_LOGS" ]; then
  log "Tailing logs (Ctrl-C to stop)"
  "${SSH[@]}" "cd '${REMOTE_DIR}' && docker compose --env-file '${APP_ENV_FILE}' -f '${COMPOSE_FILE}' -p '${COMPOSE_PROJECT}' logs -f --tail=50"
fi

ok "Done."
