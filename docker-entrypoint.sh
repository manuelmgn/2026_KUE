#!/bin/sh
set -eu

echo "[KUE] Aplicando migraciones de Prisma..."
node ./node_modules/prisma/build/index.js migrate deploy

echo "[KUE] Iniciando servidor en ${HOSTNAME:-0.0.0.0}:${PORT:-5030}..."
exec node server.js
