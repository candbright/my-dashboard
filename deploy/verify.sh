#!/usr/bin/env bash
# Acceptance tests for the my-dashboard deployment.
#
# Checks three things: (1) the new app works through the public URL,
# (2) its API is reachable only under /my-dashboard/ and not at the site root,
# (3) the pre-existing mc-dashboard / BDS services are untouched.
set -uo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
set -a; source "${STACK_DIR}/.env"; set +a

PASS=0
FAIL=0
ok()   { printf '  PASS  %s\n' "$*"; PASS=$((PASS + 1)); }
bad()  { printf '  FAIL  %s\n' "$*"; FAIL=$((FAIL + 1)); }
head_() { printf '\n--- %s ---\n' "$*"; }

code() { curl -sk -o /dev/null -w '%{http_code}' --max-time 30 "$@" || echo 000; }
body() { curl -sk --max-time 30 "$@" || true; }

head_ "1. new app over the public URL"
# Next.js' canonical basePath URL is the bare /my-dashboard; the trailing-slash
# form answers 308 and redirects to it.
c=$(code https://candbright.top/my-dashboard)
[[ "${c}" == "200" ]] && ok "/my-dashboard -> 200" || bad "/my-dashboard -> ${c}"

c=$(code https://candbright.top/my-dashboard/login)
[[ "${c}" == "200" ]] && ok "/my-dashboard/login -> 200" || bad "/my-dashboard/login -> ${c}"

c=$(code https://candbright.top/my-dashboard/)
[[ "${c}" == "200" || "${c}" == "308" ]] && ok "/my-dashboard/ -> ${c} (normalised by Next.js)" || bad "/my-dashboard/ -> ${c}"

if body https://candbright.top/my-dashboard | grep -q '/my-dashboard/_next/'; then
    ok "HTML references /my-dashboard/_next/ assets"
else
    bad "HTML does not reference basePath-prefixed assets"
fi

head_ "2. API through the app (same-origin rewrite -> kratos)"
c=$(code -X POST https://candbright.top/my-dashboard/api/auth/guest-login)
[[ "${c}" == "200" ]] && ok "POST /my-dashboard/api/auth/guest-login -> 200" || bad "guest-login -> ${c}"

if body -X POST https://candbright.top/my-dashboard/api/auth/guest-login | grep -q '"token"'; then
    ok "guest-login returns a JWT"
else
    bad "guest-login did not return a token"
fi

head_ "3. independence: root /api/* still belongs to the mc panel"
c=$(code https://candbright.top/api/health)
[[ "${c}" == "200" ]] && ok "mc panel /api/health -> 200" || bad "mc panel /api/health -> ${c}"

if body https://candbright.top/api/health | grep -q '"status":"ok"'; then
    ok "mc panel health payload intact"
else
    bad "mc panel health payload unexpected"
fi

# The resume API must NOT be exposed at the site root.
c=$(code https://candbright.top/api/resumes)
[[ "${c}" != "200" ]] && ok "/api/resumes -> ${c} (not our backend)" || bad "/api/resumes -> 200 (leaked to root!)"

head_ "4. mc dashboard UI and services untouched"
c=$(code https://candbright.top/mc_dashboard/)
[[ "${c}" == "200" ]] && ok "/mc_dashboard/ -> 200" || bad "/mc_dashboard/ -> ${c}"

for svc in mc-dashboard minecraft-bedrock nginx; do
    state=$(systemctl is-active "${svc}" 2>/dev/null || true)
    [[ "${state}" == "active" ]] && ok "systemd ${svc} active" || bad "systemd ${svc} -> ${state}"
done

head_ "5. containers and port exposure"
for ctr in mydash-postgres mydash-redis mydash-kratos mydash-web; do
    state=$(docker inspect -f '{{.State.Status}}' "${ctr}" 2>/dev/null || echo missing)
    [[ "${state}" == "running" ]] && ok "container ${ctr} running" || bad "container ${ctr} -> ${state}"
done

if ss -tln | grep -q "127.0.0.1:${WEB_PORT} "; then
    ok "web bound to 127.0.0.1:${WEB_PORT} (loopback only)"
else
    bad "web is not listening on 127.0.0.1:${WEB_PORT}"
fi

if ss -tln | grep -qE '(0\.0\.0\.0|\*):(5432|6379|3002|20002) '; then
    bad "a stack port is exposed on a public interface"
else
    ok "no stack port exposed publicly (5432/6379/3002/20002 stay private)"
fi

head_ "6. database"
tables=$(docker exec mydash-postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc \
    "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null || echo 0)
[[ "${tables}" -gt 0 ]] && ok "postgres migrated (${tables} tables)" || bad "postgres has no tables"

printf '\n=== RESULT: %d passed, %d failed ===\n' "${PASS}" "${FAIL}"
[[ "${FAIL}" -eq 0 ]] || exit 1
