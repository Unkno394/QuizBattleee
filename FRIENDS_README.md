# QuizBattle Friends System - README

**Версия**: 1.0.0  
**Статус**: ✅ Завершено и готово к интеграции  
**Дата**: 27 февраля 2026 г.

## 📋 Содержание

1. [Обзор](#обзор)
2. [Особенности](#особенности)
3. [Архитектура](#архитектура)
4. [Быстрый старт](#быстрый-старт)
5. [API документация](#api-документация)
6. [Компоненты](#компоненты)
7. [Интеграция](#интеграция)
8. [FAQ](#faq)

## 📖 Обзор

Система друзей для QuizBattle - это полнофункциональное решение для управления друзьями, приглашения в игровые комнаты и просмотра рейтинга среди друзей.

### Основные возможности:
- ✅ Система управления друзьями (добавление, удаление, заявки)
- ✅ Приглашение друзей в игровые комнаты
- ✅ Отдельный рейтинг среди друзей
- ✅ WebSocket уведомления в реальном времени
- ✅ Красивый UI с модальными окнами
- ✅ Бонус +5 баллов ведущему за проведение игры

## 🎯 Особенности

### Управление друзьями
```
Пользователь A ──► отправить заявку ──► Пользователь B
                                         принять/отклонить
                                              ↓
                                          друзья!
```

### Приглашение в комнаты
```
Без пароля:
  Любой участник → может приглашать друзей → ведущий одобряет

С паролем:
  Только ведущий → может приглашать → друг принимает
```

### Рейтинг друзей
```
Друг A: 42 победы 🥇
Друг B: 37 побед  🥈
Друг C: 25 побед  🥉
...
```

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────┐
│           Frontend (React/TypeScript)        │
├─────────────────────────────────────────────┤
│  FriendsBtn   FriendsModal   RoomInviteModal│
│  PlayerCard   InvitationModal FriendsLB     │
└────────────────────┬────────────────────────┘
                     │ HTTP/WebSocket
                     ↓
┌─────────────────────────────────────────────┐
│         Backend (Python/FastAPI)            │
├─────────────────────────────────────────────┤
│  /api/friends/*          /api/rooms/invite/*│
│  /api/leaderboard/friends                   │
│  WebSocket: invite-friend-to-room          │
└────────────────────┬────────────────────────┘
                     │ SQL
                     ↓
┌─────────────────────────────────────────────┐
│     PostgreSQL Database                     │
├─────────────────────────────────────────────┤
│  auth_users                                 │
│  auth_friendships  (доработано)             │
│  room_invitations  (новое)                  │
└─────────────────────────────────────────────┘
```

## 🚀 Быстрый старт

### 1. Backend готов ✅
Все файлы уже созданы и отредактированы:
- `backend/app/api/friends.py` - API endpoints
- `backend/app/auth_repository.py` - функции БД
- `backend/app/database.py` - таблицы и миграции
- `backend/app/runtime.py` - логика игры
- `backend/app/runtime_message_handlers.py` - WebSocket обработчики

### 2. Frontend готов ✅
Все компоненты и хуки созданы:
- `src/components/FriendsBtn.tsx`
- `src/components/FriendsModal.tsx`
- `src/components/RoomInviteModal.tsx`
- `src/components/PlayerCard.tsx`
- `src/components/InvitationModal.tsx`
- `src/components/FriendsLeaderboard.tsx`
- `src/hooks/useFriends.ts` - все необходимые хуки

### 3. Интеграция в существующий код
Следуйте [INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md)

## 📡 API документация

### Управление друзьями

#### Отправить заявку в друзья
```
POST /api/friends/request
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "friend_id": 123
}

Response 200:
{
  "id": 1,
  "requester_id": 1,
  "addressee_id": 123,
  "status": "pending",
  "created_at": "2026-02-27T10:00:00Z"
}
```

#### Получить друзей
```
GET /api/friends
Authorization: Bearer TOKEN

Response 200:
{
  "friends": [
    {
      "id": 123,
      "email": "friend@example.com",
      "display_name": "Друг",
      "avatar_url": "https://...",
      "equipped_cat_skin": "skin1",
      "equipped_dog_skin": "skin2",
      "preferred_mascot": "cat"
    }
  ]
}
```

#### Получить заявки в друзья
```
GET /api/friends/requests
Authorization: Bearer TOKEN

Response 200:
{
  "requests": [
    {
      "id": 1,
      "requester_id": 456,
      "display_name": "Новый друг",
      "avatar_url": "https://...",
      "created_at": "2026-02-27T10:00:00Z"
    }
  ]
}
```

#### Ответить на заявку
```
POST /api/friends/respond
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "requester_id": 456,
  "accept": true
}

Response 200:
{
  "id": 1,
  "requester_id": 456,
  "addressee_id": 1,
  "status": "accepted",
  "updated_at": "2026-02-27T10:05:00Z"
}
```

#### Удалить друга
```
DELETE /api/friends/123
Authorization: Bearer TOKEN

Response 200:
{
  "status": "removed"
}
```

### Приглашения в комнаты

#### Пригласить в комнату
```
POST /api/rooms/invite
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "friend_id": 123,
  "room_id": "ABCD1234"
}

Response 200:
{
  "id": 1,
  "room_id": "ABCD1234",
  "inviter_id": 1,
  "invitee_id": 123,
  "status": "pending",
  "created_at": "2026-02-27T10:00:00Z"
}
```

#### Получить входящие приглашения
```
GET /api/rooms/invitations
Authorization: Bearer TOKEN

Response 200:
{
  "invitations": [
    {
      "id": 1,
      "room_id": "ABCD1234",
      "inviter_id": 456,
      "inviter_name": "Ведущий",
      "inviter_avatar": "https://...",
      "created_at": "2026-02-27T10:00:00Z"
    }
  ]
}
```

#### Ответить на приглашение
```
POST /api/rooms/invitations/respond
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "room_id": "ABCD1234",
  "accept": true
}

Response 200:
{
  "id": 1,
  "room_id": "ABCD1234",
  "status": "accepted",
  "updated_at": "2026-02-27T10:05:00Z"
}
```

### Рейтинг

#### Получить рейтинг друзей
```
GET /api/leaderboard/friends?limit=50
Authorization: Bearer TOKEN

Response 200:
{
  "leaderboard": [
    {
      "id": 123,
      "display_name": "Друг",
      "avatar_url": "https://...",
      "wins": 42,
      "profile_frame": "frame1",
      "equipped_cat_skin": "skin1",
      "equipped_dog_skin": "skin2",
      "preferred_mascot": "cat"
    }
  ]
}
```

## 🎨 Компоненты

### FriendsBtn
Кнопка друзей для главного меню и комнаты.

```tsx
<FriendsBtn 
  token={authToken} 
  showLabel={true}
  className="..."
/>
```

**Пропсы:**
- `token` (required): Bearer токен
- `showLabel` (optional): Показывать текст "Друзья"
- `className` (optional): Доп. CSS классы

**Особенности:**
- 🔴 Красный мигающий кружочек при новых заявках
- 📱 Адаптивный дизайн (на мобилках можно скрыть текст)
- ⚡ Автоматическая проверка новых заявок

### FriendsModal
Модальное окно со списком друзей и заявками.

```tsx
<FriendsModal 
  isOpen={isOpen}
  onClose={handleClose}
  token={authToken}
/>
```

**Вкладки:**
- 👥 **Друзья** - список с поиском и удалением
- 📬 **Заявки** - входящие заявки с принять/отклонить

### RoomInviteModal
Окно для приглашения друзей в комнату.

```tsx
<RoomInviteModal
  isOpen={isOpen}
  onClose={handleClose}
  roomId={roomId}
  token={authToken}
  isHost={isHost}
  isPasswordProtected={isPasswordProtected}
/>
```

**Логика:**
- 🔒 С паролем: только ведущий может приглашать
- 🔓 Без пароля: все могут приглашать

### PlayerCard
Карточка игрока в лобби (справа).

```tsx
<PlayerCard
  name="Имя игрока"
  avatarUrl={url}
  mascot="cat"
  isSelf={false}
  onAddFriend={handleAddFriend}
/>
```

**Особенности:**
- 👤 Аватар и ник игрока
- 🎮 Информация о скине и рамке профиля
- ➕ Кнопка добавления в друзья при наведении

### InvitationModal
Всплывающее уведомление посередине экрана.

```tsx
<InvitationModal
  notification={notification}
  onClose={handleClose}
/>
```

**Типы:**
- 📩 `invitation-request` - получено приглашение
- ✅ `invitation-response` - ответ на приглашение

### FriendsLeaderboard
Компонент рейтинга друзей.

```tsx
<FriendsLeaderboard token={authToken} />
```

**Особенности:**
- 🥇🥈🥉 Медали для топ-3
- 📊 Сортировка по побед
- 🔄 Кнопка обновления

## 🔌 Интеграция

Полная инструкция в [INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md)

### Главное меню
```tsx
<FriendsBtn token={token} showLabel={true} />
```

### Лобби комнаты
```tsx
<div className="flex gap-2">
  <FriendsBtn token={token} showLabel={false} />
  <button onClick={() => setInviteOpen(true)}>
    Пригласить
  </button>
</div>

<div className="w-80 space-y-2">
  {players.map(p => <PlayerCard {...p} />)}
</div>

<RoomInviteModal {...inviteProps} />
<InvitationModal {...modalProps} />
```

### Страница рейтинга
```tsx
<div className="grid grid-cols-2 gap-6">
  <GlobalLeaderboard />
  <FriendsLeaderboard token={token} />
</div>
```

## 🪝 Хуки

### useFriends(token)
```tsx
const {
  friends,
  requests,
  sendFriendRequest,
  respondToRequest,
  removeFriend,
} = useFriends(token);
```

### useRoomInvitations(token)
```tsx
const {
  invitations,
  respondToInvitation,
  inviteFriend,
} = useRoomInvitations(token);
```

### useFriendsLeaderboard(token, limit)
```tsx
const { leaderboard, loading } = useFriendsLeaderboard(token);
```

### useWebSocketInvitations(ws, onRequest, onResponse)
```tsx
const { sendInvitation } = useWebSocketInvitations(ws, handleRequest, handleResponse);
```

## 📊 WebSocket события

### Для ведущего (room-invitation-request)
```json
{
  "type": "room-invitation-request",
  "roomId": "ABCD1234",
  "inviterId": 456,
  "inviterName": "Игрок",
  "friendId": 789
}
```

### Для гостя (room-invitation-response)
```json
{
  "type": "room-invitation-response",
  "roomId": "ABCD1234",
  "accepted": true
}
```

## 💰 Бонусная система

- **Ведущий за игру**: +5 баллов (монет) автоматически после завершения
- **Добавляется**: При сохранении результатов игры
- **Условие**: Ведущий должен быть авторизован (auth_user_id != None)

## 🎨 Дизайн

**Цветовая палитра:**
- 🎀 Primary: `pink-500` (#ec4899)
- 💜 Secondary: `purple-900` (#581c87)
- 💙 Accent: `indigo-900` (#312e81)
- ⚪ Text: `white`

**Компоненты:**
- Все модалки: `backdrop-blur-md`
- Кнопки: скругленные, с hover эффектом
- Иконки: Lucide Icons

## 🔍 Отладка

### Логирование
```tsx
// В консоли браузера
console.log(friends);
console.log(requests);
console.log(invitations);
```

### Проверка API
```bash
# Список друзей
curl http://localhost:8000/api/friends \
  -H "Authorization: Bearer YOUR_TOKEN"

# Новые заявки
curl http://localhost:8000/api/friends/requests \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Проверка WebSocket
```javascript
// В DevTools
ws.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);
  if (data.type?.includes('invitation')) {
    console.log('Приглашение:', data);
  }
});
```

## ❓ FAQ

### Q: Как добавить друга?
**A:** Нажмите на кнопку "Друзья" в главном меню → введите ID друга → отправьте заявку.

### Q: Как пригласить друга в комнату?
**A:** В лобби комнаты нажмите "Пригласить" → выберите друга → отправьте приглашение.

### Q: Почему я не могу пригласить в защищённую комнату?
**A:** Только ведущий может приглашать в комнаты с паролем.

### Q: Когда я получу бонус +5 баллов?
**A:** Если вы ведущий, после завершения игры баллы добавятся автоматически.

### Q: Как посмотреть рейтинг своих друзей?
**A:** Перейдите на страницу рейтинга → справа вы увидите рейтинг только ваших друзей.

### Q: Могу ли я удалить друга?
**A:** Да, в модальном окне "Друзья" нажмите на крестик рядом с другом.

### Q: Как долго хранятся уведомления?
**A:** Приглашения хранятся в БД до тех пор, пока вы на них не ответите.

## 📝 Лицензия

Все файлы являются частью проекта QuizBattle и защищены соответствующей лицензией.

## 👥 Автор

GitHub Copilot  
Дата: 27 февраля 2026 г.

## 📞 Поддержка

Для проблем и вопросов обратитесь к документации:
- [FRIENDS_SYSTEM_DOCS.md](./FRIENDS_SYSTEM_DOCS.md)
- [FRIENDS_INTEGRATION_GUIDE.md](./FRIENDS_INTEGRATION_GUIDE.md)
- [INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md)

---

**Система готова к интеграции! 🎉**
