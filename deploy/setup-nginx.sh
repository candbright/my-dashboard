#!/usr/bin/env bash
# Install the /my-dashboard/ snippet and wire it into the existing
# candbright.top server block — additively, so the mc panel keeps working.
#
# Idempotent. Every change is backed up and rolled back automatically if
# `nginx -t` rejects the result.
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VHOST=/etc/nginx/sites-available/mc-dashboard
SNIPPET=/etc/nginx/snippets/my-dashboard.conf
INCLUDE_LINE='    include /etc/nginx/snippets/my-dashboard.conf;'

log() { printf '\n=== %s ===\n' "$*"; }

log "install snippet -> ${SNIPPET}"
sudo install -d -m 755 /etc/nginx/snippets
sudo install -m 644 "${STACK_DIR}/nginx-my-dashboard.conf" "${SNIPPET}"

BACKUP=""
if sudo grep -qF "${INCLUDE_LINE}" "${VHOST}"; then
    log "include already present in ${VHOST}"
else
    BACKUP="${VHOST}.bak-$(date +%Y%m%d-%H%M%S)"
    sudo cp -a "${VHOST}" "${BACKUP}"
    log "backed up vhost -> ${BACKUP}"

    # Insert the include immediately after server_name of the TLS server block.
    sudo awk '
        { print }
        /^[[:space:]]*server_name[[:space:]]+candbright\.top;/ && !done {
            print "    include /etc/nginx/snippets/my-dashboard.conf;"
            done = 1
        }
    ' "${VHOST}" > /tmp/my-dashboard-vhost.new

    sudo cp /tmp/my-dashboard-vhost.new "${VHOST}"
    rm -f /tmp/my-dashboard-vhost.new
fi

log "nginx config test"
if ! sudo nginx -t; then
    echo "nginx -t FAILED" >&2
    if [[ -n "${BACKUP}" ]]; then
        echo "restoring ${BACKUP}" >&2
        sudo cp -a "${BACKUP}" "${VHOST}"
        sudo nginx -t || true
    fi
    exit 1
fi

log "reload nginx"
sudo systemctl reload nginx
systemctl is-active nginx

log "done"
sudo grep -n 'my-dashboard' "${VHOST}" || true
