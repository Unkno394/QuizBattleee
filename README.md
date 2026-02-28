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

## Что выполнено по ТЗ
### 1. Главная страница
- Есть поле для ввода PIN-кода комнаты
- Есть поле имени игрока для входа в игру
- Есть создание новой игры для ведущего
- При создании игры можно указать:
  - тему вопросов
  - количество вопросов `5`, `6` или `7`

### 2. Создание игры
- Генерируется уникальный `6`-символьный PIN-код из букв и цифр
- PIN-код уникален для активной комнаты
- Игра хранит состояние:
  - ожидание
  - игра идёт
  - завершена

### 3. Комната ожидания
- Показывается крупный PIN-код комнаты
- Отображается список подключившихся игроков
- Игроки автоматически делятся на две команды
- Команды визуально различаются
- Только ведущий может нажать `Начать игру`
- После старта все участники переходят в игровой экран

### 4. Игровой процесс
- Вопросы идут по очереди между командами
- Во время хода видно, какая команда отвечает сейчас
- На вопрос даётся таймер
- У каждого вопроса 4 варианта ответа
- После ответа кнопки блокируются
- Если команда не успела ответить вовремя, вопрос считается проигранным

### 5. Подсчёт очков
- Правильные ответы начисляют очки
- Счёт обновляется в реальном времени
- В конце игры определяется победитель или ничья

## Что выполнено дополнительно
- AI-генерация вопросов по своей теме с fallback на готовый каталог
- Выбор сложности вопросов:
  - `easy`
  - `medium`
  - `hard`
  - `progressive`
- Режим `ffa` — все против всех
- Режим `chaos` — альтернативный командный режим
- Быстрая игра `quick-game` без комнаты и ведущего
- Регистрация, вход и подтверждение email
- Профили пользователей
- Рейтинг игроков
- Победы и статистика профиля
- Комнаты с паролем
- История результатов игр в базе
- Магазин и внутриигровая валюта
- Друзья, приглашения в комнату и рейтинг друзей
- Адаптация интерфейса под мобильные устройства

## Киллер-фичи
- Realtime-архитектура с серверным источником истины, а не с локальной логикой на клиентах
- Перебор нескольких AI-провайдеров для генерации вопросов
- Автоматическая очистка временных AI-наборов вопросов после завершения игры
- Backend-начисление валюты и побед, а не доверие клиенту
- Защищённая выдача награды в `quick-game` через одноразовый backend reward token
- Профильная косметика:
  - рамки
  - скины маскотов
  - эффекты победы

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

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="./public/secret/very_cool_foto_umba.png" alt="Фуллстек разработчик" width="260" />
        <br />
        <strong>Фуллстек разработчик и тимлид</strong>
      </td>
      <td align="center">
        <img src="./public/secret/very_67_foto.png" alt="Дизайнер" width="260" />
        <br />
        <strong>Дизайнер</strong>
      </td>
    </tr>
  </table>
</div>

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

## Важные детали реализации
- Состояние комнаты определяется сервером.
- Обновления state рассылаются backend runtime через WebSocket.
- Сохранение снапшотов разделено между Redis и PostgreSQL.
- AI-сгенерированные наборы вопросов временные и автоматически удаляются.
- Награды quick-game защищены backend-подписанными одноразовыми reward token.

<div align="center">
  <h2>Команда VibeCode team</h2>
  <img src="./public/secret/very_omg.jpg" alt="Команда VibeCode team" width="420" />
</div>
