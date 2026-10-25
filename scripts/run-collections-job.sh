#!/usr/bin/env bash
# Runs the collections job (Lipa reminders, flags, owner report, message delivery) on this server.
# Scheduled every 30 minutes from /etc/cron.d/gadgethub-ops; the job itself keeps quiet hours.
set -euo pipefail
cd "$(dirname "$0")/.."
SECRET=$(grep -E '^CRON_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '"')
curl -fsS -m 55 -H "Authorization: Bearer ${SECRET}" "http://127.0.0.1:${PORT:-3040}/api/cron/collections"
echo
