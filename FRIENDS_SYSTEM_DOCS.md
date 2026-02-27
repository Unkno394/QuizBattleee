# Система друзей QuizBattle

## Обзор

Полная система управления друзьями с возможностью:
- Отправки заявок в друзья
- Принятия/отклонения заявок
- Приглашения друзей в комнаты
- Просмотра рейтинга среди друзей
- Бонус +5 баллов ведущему после игры

## Компоненты

### 1. FriendsBtn
Кнопка друзей для главного меню и комнаты

```tsx
import FriendsBtn from "@/components/FriendsBtn";

<FriendsBtn 
  token={authToken} 
  showLabel={true}
  className="..."
/>
```

**Props:**
- `token`: Bearer токен для авторизации
- `showLabel`: Показывать ли текст "Друзья" (по умолчанию true)
- `className`: Дополнительные CSS классы

**Особенности:**
- Красный мигающий кружочек при наличии заявок
- Открывает модальное окно со списком друзей и заявок

### 2. FriendsModal
Модальное окно со списком друзей и заявками

```tsx
<FriendsModal 
  isOpen={isOpen}
  onClose={handleClose}
  token={authToken}
/>
```

**Вкладки:**
- **Друзья**: Список принятых друзей с опцией удаления и добавления новых
- **Заявки**: Список входящих заявок с кнопками принять/отклонить

### 3. RoomInviteModal
Модальное окно для приглашения друзей в комнату

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
- Если комната защищена паролем: только ведущий может приглашать
- Если комната без пароля: все могут приглашать друзей

### 4. PlayerCard
Компонент для отображения игрока в лобби (справа)

```tsx
<PlayerCard
  name="Имя игрока"
  avatarUrl={avatarUrl}
  mascot="cat"
  mascotSkinCat={skinCat}
  profileFrame={frame}
  isSelf={false}
  onAddFriend={handleAddFriend}
/>
```

**Особенности:**
- Показывает аватар и ник справа
- Кнопка "Добавить в друзья" появляется при наведении
- Отображает скин и рамку профиля

### 5. InvitationModal
Всплывающее окно посередине экрана для уведомлений о приглашениях

```tsx
<InvitationModal
  notification={currentNotification}
  onClose={handleCloseNotification}
/>
```

**Типы уведомлений:**
- `invitation-request`: Получено приглашение в комнату
- `invitation-response`: Ответ на приглашение (принято/отклонено)

### 6. FriendsLeaderboard
Компонент для отображения рейтинга друзей

```tsx
<FriendsLeaderboard token={authToken} />
```

**Особенности:**
- Показывает топ 50 друзей по победам
- Медали для топ-3
- Автоматическое обновление

## API Endpoints

### Управление друзьями

#### POST `/api/friends/request`
Отправить заявку в друзья

```json
{
  "friend_id": 123
}
```

#### GET `/api/friends`
Получить список друзей

```json
{
  "friends": [
    {
      "id": 123,
      "email": "friend@example.com",
      "display_name": "Друг",
      "avatar_url": "...",
      "equipped_cat_skin": "...",
      "equipped_dog_skin": "...",
      "preferred_mascot": "cat"
    }
  ]
}
```

#### GET `/api/friends/requests`
Получить входящие заявки

```json
{
  "requests": [
    {
      "id": 1,
      "requester_id": 456,
      "display_name": "Заявитель",
      "avatar_url": "...",
      "created_at": "2026-02-27T10:00:00Z"
    }
  ]
}
```

#### POST `/api/friends/respond`
Ответить на заявку в друзья

```json
{
  "requester_id": 456,
  "accept": true
}
```

#### DELETE `/api/friends/{friend_id}`
Удалить друга

### Приглашения в комнаты

#### POST `/api/rooms/invite`
Пригласить друга в комнату

```json
{
  "friend_id": 123,
  "room_id": "ABCD1234"
}
```

#### GET `/api/rooms/invitations`
Получить входящие приглашения в комнаты

```json
{
  "invitations": [
    {
      "id": 1,
      "room_id": "ABCD1234",
      "inviter_id": 456,
      "inviter_name": "Ведущий",
      "inviter_avatar": "...",
      "created_at": "2026-02-27T10:00:00Z"
    }
  ]
}
```

#### POST `/api/rooms/invitations/respond`
Ответить на приглашение в комнату

```json
{
  "room_id": "ABCD1234",
  "accept": true
}
```

### Рейтинг

#### GET `/api/leaderboard/friends?limit=50`
Получить рейтинг друзей

```json
{
  "leaderboard": [
    {
      "id": 123,
      "display_name": "Друг",
      "avatar_url": "...",
      "wins": 42,
      "profile_frame": "frame1",
      "equipped_cat_skin": "...",
      "equipped_dog_skin": "...",
      "preferred_mascot": "cat"
    }
  ]
}
```

## WebSocket события

### Входящие события

#### room-invitation-request
Ведущий получает уведомление о желании приглашить друга

```json
{
  "type": "room-invitation-request",
  "roomId": "ABCD1234",
  "inviterId": 456,
  "inviterName": "Игрок",
  "friendId": 789
}
```

#### room-invitation-response
Гость получает ответ на приглашение

```json
{
  "type": "room-invitation-response",
  "roomId": "ABCD1234",
  "accepted": true
}
```

### Исходящие события

#### invite-friend-to-room
Отправить приглашение в комнату (только при условиях)

```json
{
  "type": "invite-friend-to-room",
  "friendId": 789
}
```

## Интеграция с главным меню

```tsx
// src/app/layout.tsx или главная страница

import FriendsBtn from "@/components/FriendsBtn";

export default function Layout() {
  const [token, setToken] = useState<string | null>(null);

  return (
    <>
      <header className="flex items-center gap-4">
        {/* Другие элементы */}
        <FriendsBtn token={token} showLabel={true} />
      </header>
    </>
  );
}
```

## Интеграция с комнатой

```tsx
// В компоненте комнаты

import RoomInviteModal from "@/components/RoomInviteModal";
import PlayerCard from "@/components/PlayerCard";
import InvitationModal from "@/components/InvitationModal";

export default function RoomComponent() {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  // Обработка WebSocket события room-invitation-request
  useEffect(() => {
    ws.on("room-invitation-request", (data) => {
      setNotification({
        id: generateId(),
        type: "invitation-request",
        title: "Новое приглашение",
        message: `${data.inviterName} хочет пригласить друга`,
        inviterName: data.inviterName,
        onAccept: () => {
          // Отправить accept
        },
        onReject: () => {
          // Отправить reject
        },
      });
    });
  }, []);

  return (
    <>
      {/* Кнопка в header комнаты */}
      <button onClick={() => setInviteModalOpen(true)}>
        Пригласить друга
      </button>

      {/* Список игроков справа */}
      <div className="flex flex-col gap-2">
        {players.map((player) => (
          <PlayerCard
            key={player.id}
            name={player.name}
            avatarUrl={player.avatarUrl}
            mascot={player.mascot}
            isSelf={player.isSelf}
            onAddFriend={() => {
              // Отправить заявку в друзья
            }}
          />
        ))}
      </div>

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
    </>
  );
}
```

## Интеграция с рейтингом

```tsx
// src/app/rating/page.tsx

import FriendsLeaderboard from "@/components/FriendsLeaderboard";

export default function RatingPage() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h2>Глобальный рейтинг</h2>
        {/* Компонент глобального рейтинга */}
      </div>
      <div>
        <FriendsLeaderboard token={authToken} />
      </div>
    </div>
  );
}
```

## Бизнес-логика

### Бонусы

- **Ведущий**: +5 баллов в рейтинг (монеты) после завершения игры
- Бонус добавляется автоматически при сохранении результатов

### Ограничения по приглашениям

**Комнаты без пароля:**
- Любой участник может пригласить друга
- Ведущий видит запрос и может одобрить/отклонить

**Комнаты с паролем:**
- Только ведущий может приглашать друзей
- Кнопка видна у всех, но работает только у ведущего

### Уведомления

**Красный мигающий кружочек:**
- Показывается на кнопке "Друзья" при наличии входящих заявок
- Анимация: `animate-pulse`
- Проверяется каждые 30 секунд

## Стиль и дизайн

Все компоненты используют:
- Tailwind CSS
- Градиентный фон: `from-purple-900/80 to-indigo-900/80`
- Blur эффект: `backdrop-blur-md`
- Цвет основной кнопки: `pink-500` (сердечко)
- Закругленные углы: `rounded-xl` или `rounded-2xl`

## Ошибки и валидация

- Не можете добавить себя в друзья
- Уникальность пар друзей (не может быть двух одинаковых приглашений)
- Проверка существования пользователя по ID
- Обработка ошибок при отправке HTTP запросов
