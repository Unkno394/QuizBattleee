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
- SQLAlchemy (async) + asyncpg
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

## Только backend (опционально)
```bash
npm run ws-server
```

Проверка здоровья backend:
```bash
curl http://localhost:3001/api/health
```

## Legacy Node WS (fallback)
```bash
npm run ws-server:node
```

## Переменные окружения (опционально)
- `NEXT_PUBLIC_WS_URL` — полный URL WebSocket сервера.
- `WS_PORT` — порт Python backend (по умолчанию `3001`).
- `DATABASE_URL` — URL PostgreSQL (`postgresql+asyncpg://...`).
