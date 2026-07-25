#!/usr/bin/env bash
# Daily PostgreSQL backup for Khaanz.
#
# Usage:
#   npm run db:backup          (from khaanz/ or repo root)
#   ./scripts/backup-db.sh
#
# Environment (optional):
#   DATABASE_URL          Postgres connection string (loaded from .env if unset)
#   BACKUP_DIR            Output directory (default: ./backups)
#   BACKUP_RETENTION_DAYS Delete backups older than N days (default: 30)
#
# Daily schedule on your VPS (2 AM):
#   0 2 * * * cd /path/to/khaanz && ./scripts/backup-db.sh >> /var/log/khaanz-backup.log 2>&1
#
# Or run: ./scripts/install-daily-backup-cron.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/khaanz-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

if [[ -z "${DATABASE_URL:-}" && -f "$PROJECT_ROOT/.env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$PROJECT_ROOT/.env" | head -1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")"
  export DATABASE_URL
fi

dump_via_docker_client() {
  if ! docker info >/dev/null 2>&1; then
    echo "Error: local pg_dump is older than the Postgres server, and Docker is not running." >&2
    echo "Fix: start Docker Desktop, or install a matching client: brew install postgresql@18" >&2
    return 1
  fi
  local docker_url="$DATABASE_URL"
  if [[ "$(uname)" == "Darwin" ]]; then
    docker_url="${docker_url//127.0.0.1/host.docker.internal}"
    docker_url="${docker_url//localhost/host.docker.internal}"
  fi
  docker run --rm postgres:18-alpine pg_dump "$docker_url" | gzip > "$BACKUP_FILE"
}

dump_via_url() {
  local tmp err_file
  tmp="$(mktemp)"
  err_file="$(mktemp)"

  if command -v pg_dump >/dev/null 2>&1; then
    if pg_dump "$DATABASE_URL" > "$tmp" 2>"$err_file"; then
      gzip -c "$tmp" > "$BACKUP_FILE"
      rm -f "$tmp" "$err_file"
      return 0
    fi
    if grep -q "server version mismatch" "$err_file" && command -v docker >/dev/null 2>&1; then
      echo "pg_dump version mismatch — using Docker postgres:18 client..." >&2
      rm -f "$tmp" "$err_file"
      dump_via_docker_client
      return 0
    fi
    cat "$err_file" >&2
    rm -f "$tmp" "$err_file"
    return 1
  fi

  if command -v docker >/dev/null 2>&1; then
    rm -f "$tmp" "$err_file"
    dump_via_docker_client
    return 0
  fi

  echo "Error: pg_dump not found. Install PostgreSQL client tools or Docker." >&2
  rm -f "$tmp" "$err_file"
  return 1
}

dump_via_compose() {
  docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T postgres \
    pg_dump -U khaanz khaanz | gzip > "$BACKUP_FILE"
}

if [[ -n "${DATABASE_URL:-}" ]]; then
  dump_via_url
elif docker compose -f "$PROJECT_ROOT/docker-compose.yml" ps postgres 2>/dev/null | grep -qE 'running|Up'; then
  dump_via_compose
else
  echo "Error: DATABASE_URL is not set and the local postgres container is not running." >&2
  echo "Set DATABASE_URL in .env or start postgres with: docker compose up -d" >&2
  exit 1
fi

find "$BACKUP_DIR" -name 'khaanz-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

echo "Backup saved: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
