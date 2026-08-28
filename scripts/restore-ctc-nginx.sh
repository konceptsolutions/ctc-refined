#!/usr/bin/env bash
# Restore crystaltrading.net nginx config after Hestia changes.
set -euo pipefail

BACKUP_DIR="$(cd "$(dirname "$0")/../backups" && pwd)"
CONF_SRC="${1:-$(ls -td "${BACKUP_DIR}"/pre-hestia-*/crystaltrading.net.conf 2>/dev/null | head -1)}"
CONF_DEST="/etc/nginx/conf.d/crystaltrading.net.conf"

if [[ ! -f "$CONF_SRC" ]]; then
  echo "Backup not found: $CONF_SRC"
  exit 1
fi

echo "Restoring CTC nginx config from: $CONF_SRC"
sudo cp "$CONF_SRC" "$CONF_DEST"
sudo nginx -t
sudo systemctl start nginx || true
sudo systemctl enable nginx
sudo systemctl reload nginx

echo "Verifying..."
curl -sfI https://crystaltrading.net/login | head -3
curl -sf https://crystaltrading.net/api/health
echo ""
echo "CTC nginx restored."
