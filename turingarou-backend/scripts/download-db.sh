#!/usr/bin/env bash
# download-db.sh — Télécharge turingarou.db depuis le serveur Render.
#
# Usage:
#   npm run pull-db                     # télécharge dans turingarou-backend/
#   npm run pull-and-analyze            # télécharge puis analyse les 10 dernières parties
#   npm run pull-and-analyze -- --games 5
#
# Variables requises dans .env (à la racine de turingarou-backend/) :
#   RENDER_URL=https://ton-app.onrender.com
#   ADMIN_SECRET=ta_clé_secrète

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

# Charger .env si disponible
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

RENDER_URL="${RENDER_URL:-}"
ADMIN_SECRET="${ADMIN_SECRET:-}"
OUTPUT="$SCRIPT_DIR/../turingarou.db"

if [ -z "$RENDER_URL" ]; then
  echo "❌  RENDER_URL is not set. Add it to turingarou-backend/.env"
  exit 1
fi

if [ -z "$ADMIN_SECRET" ]; then
  echo "❌  ADMIN_SECRET is not set. Add it to turingarou-backend/.env"
  exit 1
fi

RENDER_URL="${RENDER_URL%/}"  # enlever le slash final si présent

echo "⬇️  Downloading DB from ${RENDER_URL}/admin/db ..."

HTTP_CODE=$(curl -s -o "$OUTPUT" -w "%{http_code}" \
  "${RENDER_URL}/admin/db?key=${ADMIN_SECRET}")

if [ "$HTTP_CODE" = "200" ]; then
  SIZE=$(du -sh "$OUTPUT" | cut -f1)
  echo "✅  DB saved to $(realpath "$OUTPUT") (${SIZE})"
elif [ "$HTTP_CODE" = "403" ]; then
  echo "❌  403 Forbidden — wrong ADMIN_SECRET"
  rm -f "$OUTPUT"
  exit 1
elif [ "$HTTP_CODE" = "404" ]; then
  echo "❌  404 — DB not found on server (no games played yet?)"
  rm -f "$OUTPUT"
  exit 1
elif [ "$HTTP_CODE" = "503" ]; then
  echo "❌  503 — ADMIN_SECRET not configured on the server"
  rm -f "$OUTPUT"
  exit 1
else
  echo "❌  Unexpected HTTP ${HTTP_CODE}"
  rm -f "$OUTPUT"
  exit 1
fi
