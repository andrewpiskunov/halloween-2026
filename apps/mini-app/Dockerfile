# Контекст сборки — корень репозитория: серверу нужен docs/design/game-data-v0.2.json.
# Цель app: сервер ярмарки (tsx). Цель web: nginx со статикой клиента и прокси на сервер.

FROM node:20-bookworm-slim AS app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo/apps/mini-app

# Сначала манифесты, чтобы слой с зависимостями переиспользовался между сборками
COPY apps/mini-app/package.json apps/mini-app/pnpm-lock.yaml apps/mini-app/pnpm-workspace.yaml apps/mini-app/tsconfig.base.json ./
COPY apps/mini-app/packages/shared/package.json packages/shared/
COPY apps/mini-app/packages/server/package.json packages/server/
COPY apps/mini-app/packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

COPY apps/mini-app/packages packages
COPY docs/design/game-data-v0.2.json /repo/docs/design/game-data-v0.2.json
COPY apps/mini-app/content /repo/apps/mini-app/content

# Базовый путь клиента: «/fair/», когда приложение живёт под путём домена
ARG BASE_PATH=/
RUN BASE_PATH=$BASE_PATH pnpm --filter @fair/client exec vite build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["pnpm", "--filter", "@fair/server", "exec", "tsx", "src/index.ts"]

FROM nginx:1.27-alpine AS web
COPY --from=app /repo/apps/mini-app/packages/client/dist /usr/share/nginx/html
COPY apps/mini-app/deploy/nginx.conf /etc/nginx/conf.d/default.conf
