#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

printf '\n==> Instalando dependências adicionais do frontend usando Node dentro do Docker...\n'
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$ROOT_DIR/frontend:/app" \
  -w /app \
  node:22-alpine \
  npm install supertokens-auth-react

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$ROOT_DIR/frontend:/app" \
  -w /app \
  node:22-alpine \
  npm install -D jest jest-environment-jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @types/jest

printf '\n==> Instalando dependências adicionais do backend usando Node dentro do Docker...\n'
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$ROOT_DIR/backend:/app" \
  -w /app \
  node:22-alpine \
  npm install @nestjs/typeorm typeorm pg supertokens-node

printf '\nDependências instaladas. Os arquivos package.json e package-lock.json foram atualizados.\n'
