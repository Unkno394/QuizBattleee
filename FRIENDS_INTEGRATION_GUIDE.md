# Быстрая интеграция системы друзей

## Что было добавлено

### Backend

1. **Таблицы БД** (`backend/app/database.py`):
   - `room_invitations` - приглашения в комнаты

2. **Функции в БД** (`backend/app/auth_repository.py`):
   - `send_friend_request()` - отправить заявку
   - `accept_friend_request()` - принять заявку
   - `decline_friend_request()` - отклонить заявку
   - `remove_friend()` - удалить друга
   - `get_user_friends()` - получить друзей
   - `get_friend_requests()` - получить заявки
   - `get_friends_leaderboard()` - рейтинг друзей
   - `send_room_invitation()` - пригласить в комнату
   - `get_pending_room_invitations()` - получить приглашения
   - `respond_to_room_invitation()` - ответить на приглашение

3. **API endpoints** (`backend/app/api/friends.py`):
   - POST `/api/friends/request` - отправить заявку
   - GET `/api/friends` - список друзей
   - GET `/api/friends/requests` - входящие заявки
   - POST `/api/friends/respond` - ответить на заявку
   - DELETE `/api/friends/{friend_id}` - удалить друга
   - POST `/api/rooms/invite` - пригласить в комнату
   - GET `/api/rooms/invitations` - входящие приглашения
   - POST `/api/rooms/invitations/respond` - ответить на приглашение
   - GET `/api/leaderboard/friends` - рейтинг друзей

4. **WebSocket обработчики** (`backend/app/runtime_message_handlers.py`):
   - `invite-friend-to-room` - обработка приглашений

5. **Runtime методы** (`backend/app/runtime.py`):
   - `_send_room_invitation()` - отправка приглашения
   - `_send_room_invitation_response()` - ответ на приглашение
   - Бонус +5 баллов ведущему в конце игры

### Frontend

#### Компоненты (`src/components/`):

1. **FriendsBtn.tsx** - Кнопка друзей с уведомлением о заявках
2. **FriendsModal.tsx** - Модальное окно со списком друзей и заявками
3. **RoomInviteModal.tsx** - Окно для приглашения друзей в комнату
4. **PlayerCard.tsx** - Карточка игрока в лобби (справа)
5. **InvitationModal.tsx** - Всплывающее уведомление о приглашении (посередине)
6. **FriendsLeaderboard.tsx** - Компонент рейтинга друзей

## Пошаговая интеграция

### 1. В главном меню (Header)

```tsx
// src/app/layout.tsx или src/components/Header.tsx

import FriendsBtn from "@/components/FriendsBtn";

export default function Header() {
  const authToken = useAuth(); // или другой способ получения токена

  return (
    <header className="flex items-center gap-4">
      {/* Существующий контент */}
      
      <FriendsBtn 
        token={authToken}
        showLabel={true}
      />
    </header>
  );
}
```

### 2. В комнате (Лобби)

```tsx
// src/app/room/[roomId]/page.tsx

import FriendsBtn from "@/components/FriendsBtn";
import RoomInviteModal from "@/components/RoomInviteModal";
import PlayerCard from "@/components/PlayerCard";
import InvitationModal from "@/components/InvitationModal";

export default function RoomPage() {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const ws = useWebSocket();
  const authToken = useAuth();

  // Обработка приглашений через WebSocket
  useEffect(() => {
    if (!ws) return;

    const handleInvitationRequest = (data: any) => {
      setNotification({
        id: Math.random().toString(),
        type: "invitation-request",
        title: "Запрос на приглашение друга",
        message: `Игрок ${data.inviterName} хочет пригласить друга`,
        inviterName: data.inviterName,
        onAccept: () => {
          // Одобрить приглашение (отправить через API)
          handleApproveInvitation(data.friendId);
        },
        onReject: () => {
          // Отклонить приглашение
          handleRejectInvitation(data.friendId);
        },
      });
    };

    const handleInvitationResponse = (data: any) => {
      setNotification({
        id: Math.random().toString(),
        type: "invitation-response",
        title: data.accepted ? "Приглашение принято" : "Приглашение отклонено",
        message: data.accepted
          ? "Ваш друг принял приглашение в комнату"
          : "Ваш друг отклонил приглашение",
        accepted: data.accepted,
      });
    };

    ws.on("room-invitation-request", handleInvitationRequest);
    ws.on("room-invitation-response", handleInvitationResponse);

    return () => {
      ws.off("room-invitation-request", handleInvitationRequest);
      ws.off("room-invitation-response", handleInvitationResponse);
    };
  }, [ws]);

  return (
    <div className="flex gap-4">
      {/* Левая часть - игровая область */}
      <div className="flex-1">
        {/* Кнопка в header комнаты */}
        <div className="flex items-center justify-between mb-4">
          <h1>{roomName}</h1>
          <div className="flex gap-2">
            <FriendsBtn 
              token={authToken}
              showLabel={false}
              className="px-3 py-2 text-sm"
            />
            <button 
              onClick={() => setInviteModalOpen(true)}
              className="px-4 py-2 bg-pink-500 hover:bg-pink-600 rounded-lg"
            >
              Пригласить друга
            </button>
          </div>
        </div>

        {/* Игровая область */}
      </div>

      {/* Правая часть - список игроков */}
      <div className="w-80 bg-black/20 rounded-xl p-4">
        <h2 className="text-white font-bold mb-4">Участники</h2>
        <div className="space-y-3">
          {players.map((player) => (
            <PlayerCard
              key={player.peer_id}
              name={player.name}
              avatarUrl={player.avatar}
              isSelf={player.is_self}
              mascot={player.mascot}
              mascotSkinCat={player.mascot_skin_cat}
              mascotSkinDog={player.mascot_skin_dog}
              profileFrame={player.profile_frame}
              userId={player.auth_user_id}
              onAddFriend={
                !player.is_self
                  ? () => handleAddFriend(player.auth_user_id)
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {/* Модальные окна */}
      <RoomInviteModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        roomId={roomId}
        token={authToken}
        isHost={isHost}
        isPasswordProtected={!!roomPassword}
      />

      <InvitationModal
        notification={notification}
        onClose={() => setNotification(null)}
      />
    </div>
  );
}
```

### 3. В рейтинге

```tsx
// src/app/rating/page.tsx

import FriendsLeaderboard from "@/components/FriendsLeaderboard";
import GlobalLeaderboard from "./GlobalLeaderboard"; // существующий компонент

export default function RatingPage() {
  const authToken = useAuth();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <GlobalLeaderboard />
      </div>
      <div>
        <FriendsLeaderboard token={authToken} />
      </div>
    </div>
  );
}
```

## Переменные окружения

Убедитесь, что в `.env.local` есть:

```env
# URL API backend
NEXT_PUBLIC_API_URL=http://localhost:8000
# или для production
NEXT_PUBLIC_API_URL=https://your-domain.com/api
```

## Проверка функционала

### 1. Отправка заявки в друзья
```bash
curl -X POST http://localhost:8000/api/friends/request \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"friend_id": 123}'
```

### 2. Получение друзей
```bash
curl http://localhost:8000/api/friends \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Получение заявок
```bash
curl http://localhost:8000/api/friends/requests \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Ответ на заявку
```bash
curl -X POST http://localhost:8000/api/friends/respond \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"requester_id": 456, "accept": true}'
```

### 5. Приглашение в комнату
```bash
curl -X POST http://localhost:8000/api/rooms/invite \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"friend_id": 123, "room_id": "ABCD1234"}'
```

## Известные ограничения и особенности

1. **ID друзей**: Используются целые числа (Integer) - это ID пользователя в системе
2. **Уникальность приглашений**: Нельзя отправить два одинаковых приглашения одному другу в одну комнату
3. **Пароль комнаты**: При наличии пароля только ведущий может приглашать (кнопка видна, но не работает у остальных)
4. **Бонус ведущему**: +5 баллов добавляется сразу после завершения игры (в монеты)

## Файлы для изменения

Список файлов, которые нужно изменить для интеграции в существующий код:

- `src/app/layout.tsx` - добавить FriendsBtn в header
- `src/app/room/[roomId]/page.tsx` - добавить компоненты в комнату
- `src/app/rating/page.tsx` - добавить FriendsLeaderboard рядом с глобальным рейтингом
- Любые другие места, где нужна интеграция

## Поддержка и отладка

- Все API endpoints требуют авторизации через Bearer токен в header `Authorization`
- WebSocket события отправляются только авторизованным пользователям
- Логи ошибок выводятся в консоль browser (F12)
- Backend логи доступны в логах сервера

## Дополнительные возможности

Для расширения функционала можно добавить:

1. Поиск пользователей по имени (вместо ввода ID)
2. Блокировка пользователей
3. История приглашений
4. Уведомления о статусе (онлайн/офлайн)
5. Синхронизация друзей в реальном времени через WebSocket
6. Группы друзей
7. Совместные турниры

Все компоненты готовы к расширению и модификации.
