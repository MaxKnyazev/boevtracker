#!/usr/bin/env bash
# Local sanity checks before first VPS deploy (run from repo root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Check required files"
for f in \
  docker-compose.prod.yml \
  Caddyfile \
  .env.example \
  backend/Dockerfile.prod \
  frontend/Dockerfile.prod \
  frontend/nginx.prod.conf \
  .github/workflows/deploy.yml \
  deploy/bootstrap-vps.sh \
  deploy/README.md
do
  [[ -f "$f" ]] || { echo "Missing: $f"; exit 1; }
  echo "  ok $f"
done

echo "==> Validate docker compose (needs Docker)"
if command -v docker >/dev/null 2>&1; then
  cp -n .env.example .env.verify.tmp 2>/dev/null || cp .env.example .env.verify.tmp
  docker compose -f docker-compose.prod.yml --env-file .env.verify.tmp config >/dev/null
  rm -f .env.verify.tmp
  echo "  ok docker compose config"
else
  echo "  skip (docker not installed)"
fi

echo "==> Backend TypeScript build (with prisma generate)"
if [[ -d backend/node_modules ]]; then
  (cd backend && npx prisma generate >/dev/null && npx tsc --noEmit)
  echo "  ok backend tsc"
else
  echo "  skip (backend/node_modules missing)"
fi

echo "==> Optional: build prod images"
if [[ "${VERIFY_BUILD:-0}" == "1" ]] && command -v docker >/dev/null 2>&1; then
  cp .env.example .env.verify.tmp
  docker compose -f docker-compose.prod.yml --env-file .env.verify.tmp build backend frontend
  rm -f .env.verify.tmp
  echo "  ok image build"
else
  echo "  skip (set VERIFY_BUILD=1 to build images)"
fi

echo
echo "All local checks passed."
echo "Remote checklist after VPS deploy: see deploy/README.md §9"
