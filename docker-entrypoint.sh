#!/bin/sh
set -eu

echo "[KUE] Aplicando migraciones de Prisma..."
./node_modules/.bin/prisma migrate deploy

echo "[KUE] Iniciando servidor en ${HOSTNAME:-0.0.0.0}:${PORT:-5030}..."
exec node server.js
