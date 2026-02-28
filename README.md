# QuizBattle

![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?logo=websocket&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)

QuizBattle — это онлайн-квиз с realtime-комнатами, системой аккаунтов, друзьями и приглашениями, косметикой профиля, рейтингом и одиночным режимом `quick-game`.

Фронтенд: `Next.js 16 + React 19 + TypeScript + Tailwind`

Бэкенд: `FastAPI + PostgreSQL + Redis + WebSocket runtime`

## Возможности
- Создание комнаты с:
  - готовой темой
  - своей темой, которая генерируется через AI
  - `5`, `6` или `7` вопросами
  - сложностью: `easy`, `medium`, `hard`, `progressive`
  - режимом: `classic`, `ffa`, `chaos`
  - необязательным паролем
- Realtime-поток комнаты:
  - lobby
  - team reveal
  - captain vote
  - team naming
  - question
  - reveal
  - results
- Одиночный режим `quick-game` без комнаты и ведущего
- Авторизация с подтверждением email
- Друзья, приглашения и рейтинг друзей
- Страница профиля, магазин, рамки аватара, скины маскотов, эффекты победы
- Рейтинг и учёт побед
- AI-генерация вопросов с перебором провайдеров
- Сохранение снапшотов комнат и результатов игр

## Режимы игры
- `classic`
  - командная игра с ведущим
  - игроки победившей команды получают победу
- `chaos`
  - командная игра с ведущим
  - игроки победившей команды получают победу
- `ffa`
  - каждый играет сам за себя
  - все игроки, разделившие максимальный счёт, получают победу
- `quick-game`
  - одиночный режим
  - заработанные очки конвертируются в валюту `1:1`
  - награда подтверждается на backend и выдаётся один раз

## Источники вопросов
QuizBattle поддерживает два источника вопросов:

1. Встроенный каталог  
Вопросы загружаются из:
- [questions_by_difficulty.json](/home/user/Desktop/123/quizbattle/public/questions_by_difficulty.json)

2. AI-генерация  
Если пользователь вводит свою тему, которой нет во встроенном каталоге, backend пытается сгенерировать JSON с вопросами через AI-провайдеров. Провайдеры перебираются по очереди, пока один из них не ответит.

Временные файлы с AI-сгенерированными вопросами автоматически удаляются после завершения игры или очистки комнаты.

## Структура проекта
### Фронтенд
- [src/app/page.tsx](/home/user/Desktop/123/quizbattle/src/app/page.tsx)  
  Главная страница: создание комнаты, вход, fallback для AI-тем
- [src/app/quick-game/page.tsx](/home/user/Desktop/123/quizbattle/src/app/quick-game/page.tsx)  
  Одиночный режим quick-game
- [src/app/profile/page.tsx](/home/user/Desktop/123/quizbattle/src/app/profile/page.tsx)  
  Профиль, косметика, рендер рамок аватара
- [src/app/rating/page.tsx](/home/user/Desktop/123/quizbattle/src/app/rating/page.tsx)  
  Глобальный рейтинг
- `src/components/*`  
  Общие UI-компоненты, модалка друзей, алерты, списки
- `src/shared/*`  
  API-хелперы, магазин, хуки профиля

### Бэкенд
- [backend/app/application.py](/home/user/Desktop/123/quizbattle/backend/app/application.py)  
  Сборка FastAPI-приложения
- [backend/app/runtime.py](/home/user/Desktop/123/quizbattle/backend/app/runtime.py)  
  Основной realtime runtime комнаты
- [backend/app/runtime_phase_flow.py](/home/user/Desktop/123/quizbattle/backend/app/runtime_phase_flow.py)  
  Переходы между фазами
- [backend/app/runtime_question_flow.py](/home/user/Desktop/123/quizbattle/backend/app/runtime_question_flow.py)  
  Логика question / reveal / results
- [backend/app/runtime_state_builders.py](/home/user/Desktop/123/quizbattle/backend/app/runtime_state_builders.py)  
  Сборка state и result payload
- [backend/app/runtime_snapshot.py](/home/user/Desktop/123/quizbattle/backend/app/runtime_snapshot.py)  
  Сохранение снапшотов
- [backend/app/question_generation.py](/home/user/Desktop/123/quizbattle/backend/app/question_generation.py)  
  AI-генерация вопросов и fallback по провайдерам
- [backend/app/api/rooms.py](/home/user/Desktop/123/quizbattle/backend/app/api/rooms.py)  
  API комнат и quick-game
- [backend/app/auth_api.py](/home/user/Desktop/123/quizbattle/backend/app/auth_api.py)  
  Авторизация, магазин, профиль
- [backend/app/auth_repository.py](/home/user/Desktop/123/quizbattle/backend/app/auth_repository.py)  
  DB-операции для auth, валюты, побед и инвентаря
- [backend/app/database.py](/home/user/Desktop/123/quizbattle/backend/app/database.py)  
  Инициализация базы и создание таблиц

## Требования
- Node.js 20+
- Python 3.11+
- Docker + Docker Compose

## Быстрый старт
### 1. Установка зависимостей
```bash
npm install
pip install -r backend/requirements.txt
```

### 2. Настройка окружения
Создай `.env` в корне проекта.

Минимальный локальный набор:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/quizbattle
REDIS_URL=redis://localhost:6379/0
WS_PORT=3001
MAX_PLAYERS=20

NEXT_PUBLIC_API_BASE_URL=http://localhost
NEXT_PUBLIC_WS_URL=ws://localhost/api/ws
```

### 3. Запуск локальной базы
```bash
npm run backend:db
```

### 4. Запуск приложения в dev-режиме
```bash
npm run dev
```

Открыть:
- `http://localhost:3000`

`npm run dev` запускает:
- Next.js frontend
- Python backend на порту `3001`

## Полный Docker stack
Запуск полного стека:
```bash
npm run stack:up
```

Остановка:
```bash
npm run stack:down
```

Логи:
```bash
npm run stack:logs
```

Сервисы:
- `frontend`
- `backend-python`
- `postgres`
- `redis`
- `nginx`

Точка входа:
- `http://localhost:3000`

## Backend-only stack
```bash
npm run backend:stack:up
```

Остановка:
```bash
npm run backend:stack:down
```

## Полезные скрипты
```bash
npm run dev
npm run build
npm run start
npm run lint
npm run ws-server
npm run test:ws-load
```

## Переменные окружения
### Базовые
- `DATABASE_URL`
- `REDIS_URL`
- `WS_PORT`
- `MAX_PLAYERS`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_WS_URL`

### Auth / email
- `EMAIL_TRANSPORT`
- `CODE_TTL_SECONDS`
- `RESEND_COOLDOWN_SECONDS`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SMTP_USE_SSL`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `RESEND_API_URL`

### AI-генерация вопросов
- `AI_QUESTION_TIMEOUT_SECONDS`
- `AI_QUESTION_TEMPERATURE`
- `QUICK_GAME_REWARD_SECRET`

Перебор провайдеров поддерживает до 6 конфигов:
- `AI_QUESTION_PROVIDER_1_NAME`
- `AI_QUESTION_PROVIDER_1_URL`
- `AI_QUESTION_PROVIDER_1_MODEL`
- `AI_QUESTION_PROVIDER_1_KEY`
- `AI_QUESTION_PROVIDER_1_REFERER`
- `AI_QUESTION_PROVIDER_1_TITLE`

Аналогично для `_2` ... `_6`.

Пример:
```env
AI_QUESTION_TIMEOUT_SECONDS=60
AI_QUESTION_TEMPERATURE=0.8
QUICK_GAME_REWARD_SECRET=change-me

AI_QUESTION_PROVIDER_1_NAME=groq-70b
AI_QUESTION_PROVIDER_1_URL=https://api.groq.com/openai/v1/chat/completions
AI_QUESTION_PROVIDER_1_MODEL=llama-3.3-70b-versatile
AI_QUESTION_PROVIDER_1_KEY=your_groq_key

AI_QUESTION_PROVIDER_2_NAME=openrouter-deepseek
AI_QUESTION_PROVIDER_2_URL=https://openrouter.ai/api/v1/chat/completions
AI_QUESTION_PROVIDER_2_MODEL=deepseek/deepseek-chat
AI_QUESTION_PROVIDER_2_KEY=your_openrouter_key
AI_QUESTION_PROVIDER_2_REFERER=http://localhost:3000
AI_QUESTION_PROVIDER_2_TITLE=QuizBattle
```

## Хранение данных
### PostgreSQL
Backend хранит:
- пользователей
- auth sessions
- email-коды
- инвентарь магазина
- победы
- снапшоты комнат
- результаты игр
- одноразовые claim’ы награды для quick-game
- дружбу и приглашения в комнаты

### Redis
Используется для кэша снапшотов комнат и поддержки hot state sync.

## Валюта и победы
### Валюта
- `classic`, `chaos`, `ffa`
  - валюта начисляется на backend после завершения игры
  - награда зависит от заработанных очков
- `quick-game`
  - итоговые очки конвертируются в валюту `1:1`
  - награда валидируется и выдаётся на backend один раз

### Победы
- `classic`, `chaos`
  - все зарегистрированные игроки победившей команды получают `+1`
- `ffa`
  - все зарегистрированные игроки с максимальным счётом получают `+1`
- `quick-game`
  - не влияет на победы и рейтинг

## AI-генерация: примечания
- Генерация своей темы полностью backend-driven.
- Фронтенд только передаёт тему / сложность / количество вопросов.
- Если все AI-провайдеры упали, фронтенд переключается на готовые темы.
- Ошибки провайдеров пишутся в backend-логах как:
  - `question_generation attempt=...`
  - `question_generation failed ... reason=...`

Полезная команда:
```bash
docker logs quizbattle-backend-python --tail=200 | rg "question_generation|reason="
```

## Проверки и тесты
Проверка Python-синтаксиса:
```bash
python3 -m py_compile backend/app/*.py backend/app/api/*.py
```

Проверка TypeScript:
```bash
npx tsc --noEmit
```

Нагрузочный тест:
```bash
npm run test:ws-load
```

## Важные детали реализации
- Состояние комнаты определяется сервером.
- Обновления state рассылаются backend runtime через WebSocket.
- Сохранение снапшотов разделено между Redis и PostgreSQL.
- AI-сгенерированные наборы вопросов временные и автоматически удаляются.
- Награды quick-game защищены backend-подписанными одноразовыми reward token.

## Безопасность
- Не коммить реальные API-ключи в `.env`.
- Если ключи уже попали в логи, скриншоты или чат, их нужно перевыпустить.
- Для production задай сильный `QUICK_GAME_REWARD_SECRET`.

## Лицензия
В репозитории нет отдельного файла лицензии.
