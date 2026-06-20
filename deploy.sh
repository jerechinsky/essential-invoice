#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.server}"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.server.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-essential-invoice}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" "$@"
}

require_runtime() {
  command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }
  docker compose version >/dev/null || { echo "Docker Compose v2 is required." >&2; exit 1; }
  docker info >/dev/null || { echo "Docker daemon is unavailable." >&2; exit 1; }
}

init_env() {
  require_runtime
  command -v openssl >/dev/null || { echo "OpenSSL is required to generate secrets." >&2; exit 1; }
  if [[ -e "${ENV_FILE}" ]]; then
    echo "Refusing to overwrite ${ENV_FILE}." >&2
    exit 1
  fi

  read -r -p "Public URL [https://invoice.example.com]: " app_url
  app_url="${app_url:-https://invoice.example.com}"
  if [[ ! "${app_url}" =~ ^https?:// ]]; then
    echo "Public URL must begin with http:// or https://" >&2
    exit 1
  fi

  read -r -p "Bind address [127.0.0.1]: " bind_address
  bind_address="${bind_address:-127.0.0.1}"

  umask 077
  db_password="$(openssl rand -hex 32)"
  jwt_secret="$(openssl rand -hex 48)"
  encryption_key="$(openssl rand -hex 32)"

  {
    echo "APP_URL=${app_url}"
    echo "BIND_ADDRESS=${bind_address}"
    echo "FRONTEND_PORT=8080"
    echo "DB_NAME=essential_invoice"
    echo "DB_USER=essential_invoice"
    echo "DB_PASSWORD=${db_password}"
    echo "JWT_SECRET=${jwt_secret}"
    echo "ENCRYPTION_KEY=${encryption_key}"
    echo "EMAIL_POLLING_INTERVAL=600"
    echo "RECURRING_INVOICE_INTERVAL=86400"
    echo "GLOBAL_SMTP_HOST="
    echo "GLOBAL_SMTP_PORT=587"
    echo "GLOBAL_SMTP_USER="
    echo "GLOBAL_SMTP_PASSWORD="
    echo "GLOBAL_SMTP_SECURE=false"
    echo "GLOBAL_SMTP_FROM_EMAIL="
    echo "GLOBAL_SMTP_FROM_NAME=essentialInvoice"
  } > "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  echo "Created ${ENV_FILE} with mode 600. Review APP_URL before deploying."
}

require_env() {
  [[ -f "${ENV_FILE}" ]] || {
    echo "Missing ${ENV_FILE}. Run ./deploy.sh init first." >&2
    exit 1
  }
  compose config --quiet
}

backup_database() {
  require_env
  if ! compose ps --status running --services | grep -qx db; then
    echo "Database is not running; skipping backup (expected on first deployment)."
    return
  fi

  mkdir -p "${BACKUP_DIR}"
  chmod 700 "${BACKUP_DIR}"
  backup_file="${BACKUP_DIR}/essential-invoice-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 > "${backup_file}"
  chmod 600 "${backup_file}"
  echo "Database backup: ${backup_file}"
}

wait_for_health() {
  for attempt in $(seq 1 30); do
    if compose exec -T frontend wget -qO- http://backend:3001/api/health >/dev/null 2>&1; then
      echo "Application is healthy."
      return
    fi
    sleep 2
  done

  echo "Health check failed. Recent logs:" >&2
  compose logs --tail=120 backend frontend >&2
  exit 1
}

deploy() {
  require_runtime
  require_env
  backup_database
  compose build --pull
  compose up -d --remove-orphans
  wait_for_health
  compose ps
}

case "${1:-deploy}" in
  init) init_env ;;
  deploy) deploy ;;
  backup) require_runtime; backup_database ;;
  status) require_runtime; require_env; compose ps ;;
  logs) require_runtime; require_env; compose logs -f --tail=200 ;;
  *)
    echo "Usage: ./deploy.sh [init|deploy|backup|status|logs]" >&2
    exit 1
    ;;
esac
