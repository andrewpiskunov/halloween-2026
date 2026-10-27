# Развёртывание Mini App

Схема как у tablechamp на том же сервере: два контейнера в docker compose, наружу их отдаёт системный nginx под путём домена. Нужны Docker с Compose и домен с сертификатом.

## Контейнеры

| Сервис | Что делает | Порт |
| --- | --- | --- |
| `server` | сервер ярмарки (Fastify, WebSocket, SQLite) и бот на long polling | только внутри сети compose |
| `web` | nginx: статика клиента, прокси `/api` и `/ws` на `server` | `127.0.0.1:3500` |

База лежит в томе `fair-data`. Образ собирается из корня репозитория: серверу нужен `docs/design/game-data-v0.2.json`.

## Переменные

```sh
cp .env.production.example .env
```

Заполнить `BOT_TOKEN`, `BOT_NAME` (без `@`), `SESSION_SECRET` (`openssl rand -base64 32`), `CLIENT_URL` (адрес, который открывает бот, например `https://example.org/fair/`). `BASE_PATH` это путь, под которым живёт клиент; на отдельном домене оставить `/`. `.env` в Git не кладите.

Бот работает на long polling: хостер режет входящие от подсетей Telegram, webhook не доставляется. В `docker-compose.yml` `api.telegram.org` пришпилен к `149.154.167.220`; если у вашего хостера доступ свободный, уберите `extra_hosts`.

## Установка

```sh
git clone https://github.com/andrewpiskunov/halloween-2026.git /opt/fair
cd /opt/fair/apps/mini-app
cp .env.production.example .env   # и заполнить
docker compose up -d --build
curl -s localhost:3500/api/health
```

## Системный nginx

В server-блок домена добавить:

```nginx
location = /fair { return 301 /fair/; }
location ^~ /fair/ {
    proxy_pass http://127.0.0.1:3500/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
    # Любой add_header здесь отменяет унаследованный X-Frame-Options DENY:
    # веб-версия Telegram открывает Mini App во фрейме
    add_header X-Content-Type-Options nosniff always;
}
```

Затем `nginx -t && systemctl reload nginx`.

## Бот в BotFather

1. `/newbot`: имя и username. Токен в `.env`, username в `BOT_NAME`.
2. `/mybots` → бот → Bot Settings → Configure Mini App → Enable Mini App, URL `https://<домен>/fair/`. Без этого не работают ссылки `t.me/<бот>?startapp=<код>`, которые раздаёт экран «Состав».
3. `/start` в боте отвечает кнопкой «Открыть ярмарку» с `CLIENT_URL`. Кнопка без кода открывает приложение без роли; ведущий и игроки входят по своим ссылкам из «Состава». Первая ссылка ведущего печатается в лог сервера: `docker compose logs server | grep "Код ведущего"`, её вид `https://t.me/<бот>?startapp=<код>`.

## Обновление

```sh
cd /opt/fair && git pull
cd apps/mini-app && docker compose up -d --build
```

## Выгрузка журнала

При закрытии ярмарки сервер сам пишет выгрузку журнала в том `fair-data`: `/data/exports/evening-<момент закрытия>.json` внутри контейнера `server`. Тот же файл перезаписывается при показе итогов и после каждого исправления ведущего. Забрать папку на хост можно из `apps/mini-app`:

```sh
docker compose cp server:/data/exports ./exports
```

Без доступа к серверу то же самое скачивает ведущий: «Пульт» → «Скачать журнал». Папка `exports/` в `.gitignore`, выгрузки в Git не кладите.

## Новая игра

Состояние одной ярмарки лежит в SQLite. Чтобы начать заново: `docker compose down -v` (том с базой удаляется вместе с выгрузками, поэтому сначала заберите их, см. «Выгрузка журнала») и `docker compose up -d`.
