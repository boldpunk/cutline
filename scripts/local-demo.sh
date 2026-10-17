#!/usr/bin/env bash
# One-command local demo: Docker Desktop (or docker + compose plugin) is the only requirement.
#   ./scripts/local-demo.sh          — build, start, seed fictional demo data, print URLs
#   ./scripts/local-demo.sh stop     — stop containers (data is kept)
#   ./scripts/local-demo.sh reset    — stop and DELETE the demo database
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-start}" in
  stop) docker compose down; exit 0 ;;
  reset) docker compose down -v; exit 0 ;;
esac

command -v docker >/dev/null || { echo "Нужен Docker: https://docs.docker.com/get-docker/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Нужен docker compose v2 (входит в Docker Desktop)"; exit 1; }

if [ ! -f .env ]; then
  cp .env.example .env
  secret=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  sed -i.bak "s|^APP_SECRET=.*|APP_SECRET=${secret}|" .env && rm -f .env.bak
  echo "Создан .env со случайным APP_SECRET"
fi

port="${APP_PORT:-3000}"
export APP_PORT="$port" APP_URL="${APP_URL:-http://localhost:$port}"

echo "Сборка и запуск (первый раз ~2–4 минуты)…"
if [ -n "${SKIP_BUILD:-}" ]; then docker compose up -d --no-build; else docker compose up -d --build; fi
docker compose run --rm seed-demo

printf "Ждём приложение"
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$port/api/health" >/dev/null 2>&1; then echo; break; fi
  printf "."; sleep 2
done

cat <<MSG

Готово:
  Сайт:     http://localhost:$port
  Кабинет:  http://localhost:$port/staff
            admin@demo.cutline  /  demo-cutline-2026   (администратор)
            timur@demo.cutline  /  demo-cutline-2026   (мастер)

Остановить: ./scripts/local-demo.sh stop    Стереть данные: ./scripts/local-demo.sh reset
MSG
