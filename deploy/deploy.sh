#!/usr/bin/env bash
# Build both images and (re)start the my-dashboard stack.
# Idempotent: safe to re-run for every code update.
#
#   bash deploy.sh
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${STACK_DIR}"

log() { printf '\n=== %s ===\n' "$*"; }

bash "${STACK_DIR}/bootstrap-env.sh"

set -a
# shellcheck disable=SC1091
source "${STACK_DIR}/.env"
set +a

log "build kratos image (prebuilt linux binary)"
docker build -f "${STACK_DIR}/Dockerfile.kratos" -t mydash-kratos:latest "${STACK_DIR}"

log "build web image (Next.js production build)"
docker build -f "${STACK_DIR}/Dockerfile.web" -t mydash-web:latest "${STACK_DIR}/src/my-dashboard"

log "start stack"
docker compose --env-file "${STACK_DIR}/.env" up -d

log "wait for kratos"
# /api/auth/me answers 200 with a null user when unauthenticated, so any real
# HTTP status (i.e. not 000) proves the HTTP server is up.
code=""
for _ in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${KRATOS_PORT}/api/auth/me" || true)
    if [[ "${code}" != "000" && -n "${code}" ]]; then break; fi
    sleep 2
done
printf 'kratos /api/auth/me -> %s (any HTTP status = up)\n' "${code}"

log "wait for web"
# NB: bare /my-dashboard (no trailing slash) is Next.js' canonical basePath URL;
# /my-dashboard/ answers 308 and redirects to it.
webcode=""
for _ in $(seq 1 60); do
    webcode=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${WEB_PORT}/my-dashboard" || true)
    if [[ "${webcode}" == "200" ]]; then break; fi
    sleep 2
done
printf 'web /my-dashboard -> %s\n' "${webcode}"

log "database tables"
docker exec mydash-postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c '\dt' || true

log "containers"
docker compose --env-file "${STACK_DIR}/.env" ps

if [[ "${webcode}" != "200" ]]; then
    echo "web did not come up; last logs:" >&2
    docker logs --tail 40 mydash-web >&2 || true
    exit 1
fi

log "done"
echo "web     : http://127.0.0.1:${WEB_PORT}/my-dashboard"
echo "kratos  : http://127.0.0.1:${KRATOS_PORT} (loopback only)"
echo "next: bash setup-nginx.sh, then https://candbright.top/my-dashboard/"
