# QuizBattle

![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=000000)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?logo=websocket&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql&logoColor=white)

## Описание
QuizBattle — realtime-викторина с двумя основными экранами:
- `Главная` (создание/вход)
- `Комната` (Lobby → Question → Reveal → Results)

WebRTC-логика удалена, обмен данными выполняется через WebSocket и общий серверный state комнаты.
Бэкенд перенесен на Python (FastAPI) и сохраняет состояние комнат в PostgreSQL.

## Архитектура backend
- Источник истины realtime: `Python/FastAPI` (`backend/app/runtime.py`).
- API/роутинг разнесен по модулям:
  - `backend/app/api/system.py`
  - `backend/app/api/rooms.py`
  - `backend/app/api/ws.py`
  - `backend/app/application.py` (создание приложения, startup/shutdown, middleware)
- Вынесены доменные блоки runtime:
  - `backend/app/runtime_types.py` (типы и dataclass состояния комнаты/игрока)
  - `backend/app/runtime_constants.py` (константы режимов/таймеров и банки вопросов)
  - `backend/app/runtime_utils.py` (чистые утилиты нормализации/генерации)
- Вынесены блоки auth:
  - `backend/app/auth_schemas.py` (Pydantic-схемы)
  - `backend/app/auth_utils.py` (security/email/password утилиты)
- `backend/main.py` теперь тонкая точка входа (`from app.application import app`).

## Что реализовано
- Создание битвы: тема, 5–7 вопросов, генерация PIN, переход в комнату ведущего.
- Вход в комнату: PIN + имя, авто-распределение по командам A/B.
- Режимы комнаты:
  - Lobby: список игроков и команд, ожидание старта.
  - Question: активная команда, серверный таймер 30 секунд, ответы.
  - Reveal: правильный ответ, кто ответил, начисленные очки.
  - Results: итоговый счёт, победитель, кнопка новой игры.
- Серверная логика:
  - таймер и фазы управляются на сервере;
  - ответ принимается только от активной команды;
  - новый участник получает полный state при подключении;
  - лимит комнаты: до 20 участников.
- Чат в комнате (синхронизируется через WebSocket).
- Персист в PostgreSQL:
  - snapshot состояния комнаты;
  - результаты завершенных игр.

## Стек
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Python 3.11+
- FastAPI + Uvicorn
- asyncpg
- PostgreSQL
- OGL (WebGL) для анимированного фона

## Запуск
```bash
npm install
pip install -r backend/requirements.txt
docker compose -f docker-compose.postgres.yml up -d
# опционально: cp .env.local.example .env.local
npm run dev
```

`npm run dev` поднимает Next.js и Python WebSocket/API сервер (`3001`).

Открыть `http://localhost:3000`.

## Docker stack (backend + db + redis)
```bash
npm run backend:stack:up
```

Сервисы:
- `backend` — FastAPI на `http://localhost:3001`
- `postgres` — `localhost:5432`
- `redis` — `localhost:6379` (резерв под масштабирование/кэш)

Остановить:
```bash
npm run backend:stack:down
```

## Только backend (опционально)
```bash
npm run ws-server
```

Проверка здоровья backend:
```bash
curl http://localhost:3001/api/health
```

## Legacy Node WS (fallback, не использовать как основной realtime)
```bash
npm run ws-server:node
```

## Нагрузочный тест комнаты (20 WebSocket)
Запускает host + участников, прогоняет sync/ping/chat и печатает итог + `/api/ws-stats`:

```bash
npm run test:ws-load
```

Полезные параметры:

```bash
node scripts/ws-load-test.mjs --clients 20 --duration 45 --api http://127.0.0.1:3001
node scripts/ws-load-test.mjs --ws ws://127.0.0.1:3001/api/ws --connect-timeout-ms 10000
node scripts/ws-load-test.mjs --clients 20 --reconnect-burst true --reconnect-min-pct 20 --reconnect-max-pct 30
node scripts/ws-load-test.mjs --clients 40 --spawn-delay-ms 0 --duration 60
```

## Переменные окружения (опционально)
- `NEXT_PUBLIC_WS_URL` — полный URL WebSocket сервера.
- `WS_PORT` — порт Python backend (по умолчанию `3001`).
- `DATABASE_URL` — URL PostgreSQL (`postgresql+asyncpg://...`).

### Auth / Email коды
- `EMAIL_TRANSPORT` — `auto` | `resend` | `smtp` | `log` (по умолчанию `auto`).
- `CODE_TTL_SECONDS` — срок жизни кода (по умолчанию `300`).
- `CODE_LENGTH` — длина кода (по умолчанию `6`).
- `RESEND_COOLDOWN_SECONDS` — задержка между повторной отправкой (по умолчанию `30`).

Для `resend`:
- `RESEND_API_KEY`
- `RESEND_FROM`
- `RESEND_API_URL` (опционально, по умолчанию `https://api.resend.com/emails`)

Для `smtp`:
- `SMTP_HOST`
- `SMTP_PORT` (по умолчанию `465`)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SMTP_USE_SSL` (`true`/`false`)
