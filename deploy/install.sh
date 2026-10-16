#!/bin/bash
set -euo pipefail
archive="$1"
sha="$2"
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid commit'; exit 1; }
[ "$(id -u)" = 0 ] || { echo 'Run via sudo'; exit 1; }
base=/srv/touchline-manager
release="$base/releases/$sha"
case "$release" in /srv/touchline-manager/releases/*) ;; *) exit 1;; esac
if tar -tzf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then echo 'Unsafe archive'; exit 1; fi
if ! id football >/dev/null 2>&1; then useradd --system --user-group --home-dir /var/lib/touchline-manager --shell /usr/sbin/nologin football; fi
install -d -m 0755 "$base/releases"
install -d -m 0700 -o football -g football /var/lib/touchline-manager /var/backups/touchline-manager
if [ -f /var/lib/touchline-manager/game.sqlite ] && [ -f "$base/current/scripts/backup.mjs" ]; then
  runuser -u football -- env DATA_DIR=/var/lib/touchline-manager BACKUP_DIR=/var/backups/touchline-manager /usr/bin/node "$base/current/scripts/backup.mjs"
fi
if [ ! -d "$release" ]; then
  mkdir "$release"
  tar -xzf "$archive" -C "$release" --no-same-owner
fi
# Only pinned production runtime packages; the frontend was built on the development machine.
(cd "$release" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
/usr/bin/node --check "$release/packages/server/src/index.mjs"
caddy validate --config "$release/deploy/Caddyfile" --adapter caddyfile
if [ -L "$base/current" ]; then readlink -f "$base/current" > "$base/previous-release"; fi
ln -sfn "$release" "$base/current"
printf 'HOST=127.0.0.1\nPORT=3100\nDATA_DIR=/var/lib/touchline-manager\nBUILD_SHA=%s\n' "$sha" > /etc/touchline-manager.env
chmod 600 /etc/touchline-manager.env
install -m 0644 "$release/deploy/touchline-manager.service" /etc/systemd/system/
install -m 0644 "$release/deploy/touchline-backup.service" /etc/systemd/system/
install -m 0644 "$release/deploy/touchline-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable touchline-manager.service
systemctl restart touchline-manager.service
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3100/api/health; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3100/api/health
install -m 0644 "$release/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy
systemctl enable --now touchline-backup.timer
echo
systemctl is-active touchline-manager.service caddy

