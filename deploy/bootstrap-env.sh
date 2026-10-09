#!/usr/bin/env bash
# Generate the stack secrets (.env) and the kratos config derived from them.
#
# Idempotent: an existing .env is never regenerated, because rotating the
# postgres password would lock the running database out of its own data.
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${STACK_DIR}/.env"

command -v openssl >/dev/null || { echo "openssl is required to generate secrets" >&2; exit 1; }

if [[ ! -f "${ENV_FILE}" ]]; then
    cat > "${ENV_FILE}" <<EOF
# my-dashboard stack secrets. Generated $(date -Iseconds). Keep this file 0600.
POSTGRES_USER=myadmin
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=resumevault
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_USERNAME=candbright
ADMIN_EMAIL=candbright@outlook.com
ADMIN_PASSWORD=$(openssl rand -hex 8)
WEB_PORT=3002
KRATOS_PORT=20002
EOF
    chmod 600 "${ENV_FILE}"
    echo "generated ${ENV_FILE}"
else
    echo "keeping existing ${ENV_FILE}"
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

mkdir -p "${STACK_DIR}/runtime/kratos/conf" "${STACK_DIR}/runtime/resumes"

# Written with sudo install(): the config embeds the database password and the
# JWT secret, so it ends up 0640 owned by this user with group 10001 — the
# uid/gid the kratos container runs as. Going through install() also keeps
# re-runs working, because the file is deliberately not owned by us afterwards.
CONF_TMP="$(mktemp)"
cat > "${CONF_TMP}" <<EOF
server:
  http:
    addr: 0.0.0.0:20002
    # Generous: the AI parse/chat endpoints stream for a long time.
    timeout: 300s

data:
  database:
    driver: postgres
    host: mydash-postgres
    port: 5432
    user: ${POSTGRES_USER}
    password: ${POSTGRES_PASSWORD}
    dbname: ${POSTGRES_DB}
    ssl_mode: disable
  redis:
    addr: mydash-redis:6379
    read_timeout: 0.2s
    write_timeout: 0.2s

auth:
  jwt_secret: "${JWT_SECRET}"
  token_expiry: 604800

admin:
  username: ${ADMIN_USERNAME}
  email: "${ADMIN_EMAIL}"
  password: "${ADMIN_PASSWORD}"

guest:
  username: guest
  email: "guest@example.com"
  password: "guest@123"

cors:
  allowed_origins:
    - "https://candbright.top"
    - "http://127.0.0.1:${WEB_PORT}"

resume:
  storage_dir: "/data/resumes"
EOF
sudo install -o "$(id -u)" -g 10001 -m 640 "${CONF_TMP}" \
    "${STACK_DIR}/runtime/kratos/conf/config.yaml"
rm -f "${CONF_TMP}"

# The kratos container runs as uid 10001 and must be able to write resumes.
mkdir -p "${STACK_DIR}/runtime/resumes"
sudo chown -R 10001:10001 "${STACK_DIR}/runtime/resumes"

echo "kratos config written to runtime/kratos/conf/config.yaml"
