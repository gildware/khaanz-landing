#!/usr/bin/env bash
# Installs a daily 2 AM cron job for khaanz DB backups.
#
# Usage:
#   ./scripts/install-daily-backup-cron.sh
#
# Override schedule with CRON_SCHEDULE, e.g.:
#   CRON_SCHEDULE="0 3 * * *" ./scripts/install-daily-backup-cron.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_SCRIPT="$PROJECT_ROOT/scripts/backup-db.sh"
LOG_FILE="${BACKUP_LOG_FILE:-/var/log/khaanz-backup.log}"
CRON_SCHEDULE="${CRON_SCHEDULE:-0 2 * * *}"
CRON_LINE="$CRON_SCHEDULE cd $PROJECT_ROOT && $BACKUP_SCRIPT >> $LOG_FILE 2>&1"

if [[ ! -x "$BACKUP_SCRIPT" ]]; then
  chmod +x "$BACKUP_SCRIPT"
fi

MARKER="# khaanz-daily-db-backup"
EXISTING="$(crontab -l 2>/dev/null || true)"

if echo "$EXISTING" | grep -q "$MARKER"; then
  echo "Daily backup cron already installed."
  crontab -l | grep -A1 "$MARKER" || true
  exit 0
fi

{
  echo "$EXISTING"
  echo "$MARKER"
  echo "$CRON_LINE"
} | crontab -

echo "Installed daily backup cron:"
echo "  Schedule: $CRON_SCHEDULE"
echo "  Script:   $BACKUP_SCRIPT"
echo "  Log:      $LOG_FILE"
echo ""
echo "Test now with: npm run db:backup"
