#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo 'Create deploy/.env locally from .env.example first.' >&2; exit 1; }
[ -s certs/supabase-ca.crt ] || { echo 'Install the Dashboard root CA at deploy/certs/supabase-ca.crt first.' >&2; exit 1; }
# No `compose config` output: expanded configuration contains credentials.
compose() { docker compose --env-file .env -f compose.yml "$@"; }
case "${1:-}" in
  deploy|deploy-backend)
    compose config --quiet
    if [ "$1" = deploy ]; then
      compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    fi
    compose up -d backend
    # Compatible with Compose v2.15+; wait for DB-inclusive readiness.
    for attempt in $(seq 1 60); do
      if compose exec -T backend curl --fail --silent --max-time 5 http://localhost:8080/actuator/health/readiness >/dev/null; then
        if [ "$1" = deploy ]; then
          compose up -d caddy
          echo 'Backend ready. Verify public HTTPS authentication before any manuscript tests.'
        else
          echo 'Backend ready on its private Docker network. Caddy was not started.'
        fi
        exit 0
      fi
      sleep 2
    done
    echo 'Backend not ready; inspect logs. Caddy was not started by this invocation.' >&2
    exit 1
    ;;
  status) compose ps ;;
  logs) compose logs --tail=100 -f backend caddy ;;
  restart) compose restart backend ;;
  stop) compose stop ;;
  *) echo 'Usage: deploy/scripts/manage.sh {deploy|deploy-backend|status|logs|restart|stop}' >&2; exit 2 ;;
esac
