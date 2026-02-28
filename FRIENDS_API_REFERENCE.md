# Friends System - API Quick Reference

## Base URL
`http://localhost:8000` (or production URL)

## Authentication
All endpoints require: `Authorization: Bearer {access_token}`

## Friend Management

### Send Friend Request
```
POST /api/friends/request
Content-Type: application/json

{
  "friend_id": 123
}

Response 200:
{
  "id": 456,
  "requester_id": 789,
  "addressee_id": 123,
  "status": "pending",
  "created_at": "2026-02-27T10:00:00+00:00"
}

Error 400: Cannot add yourself as friend
Error 404: Friend not found
```

### Respond to Friend Request
```
POST /api/friends/respond
Content-Type: application/json

{
  "requester_id": 123,
  "accept": true
}

Response 200:
{
  "id": 456,
  "requester_id": 123,
  "addressee_id": 789,
  "status": "accepted",
  "updated_at": "2026-02-27T10:00:00+00:00"
}
```

### Get Friends List
```
GET /api/friends

Response 200:
{
  "friends": [
    {
      "id": 123,
      "display_name": "John",
      "email": "john@example.com",
      "avatar_url": "https://...",
      "equipped_cat_skin": "skin_1",
      "equipped_dog_skin": "skin_2",
      "preferred_mascot": "cat"
    }
  ]
}
```

### Get Friend Requests
```
GET /api/friends/requests

Response 200:
{
  "requests": [
    {
      "id": 123,
      "requester_id": 123,
      "display_name": "Alice",
      "email": "alice@example.com",
      "avatar_url": "https://...",
      "equipped_cat_skin": "...",
      "equipped_dog_skin": "...",
      "preferred_mascot": "dog",
      "created_at": "2026-02-27T10:00:00+00:00"
    }
  ]
}
```

### Remove Friend
```
DELETE /api/friends/123

Response 200:
{
  "status": "removed"
}
```

## Room Invitations

### Send Room Invitation
```
POST /api/rooms/invite
Content-Type: application/json

{
  "friend_id": 123,
  "room_id": "ABC123"
}

Response 200:
{
  "id": 456,
  "room_id": "ABC123",
  "inviter_id": 789,
  "invitee_id": 123,
  "status": "pending_host_approval" | "sent_to_invitee",
  "created_at": "2026-02-27T10:00:00+00:00"
}

Status Logic:
- "sent_to_invitee": If inviter is host OR room has no password
- "pending_host_approval": If room has no password AND inviter is not host

Error 403: Only host can invite in password-protected rooms
Error 404: Friend not found or Room not found
```

### Get Pending Invitations (for invitee)
```
GET /api/rooms/invitations

Response 200:
{
  "invitations": [
    {
      "id": 456,
      "room_id": "ABC123",
      "inviter_id": 789,
      "inviter_name": "Host",
      "inviter_avatar": "https://...",
      "created_at": "2026-02-27T10:00:00+00:00"
    }
  ]
}
```

### Accept/Decline Room Invitation (invitee)
```
POST /api/rooms/invitations/respond
Content-Type: application/json

{
  "room_id": "ABC123",
  "accept": true
}

Response 200:
{
  "id": 456,
  "room_id": "ABC123",
  "status": "accepted" | "declined",
  "updated_at": "2026-02-27T10:00:00+00:00"
}
```

### Host Approve/Reject Pending Invitation
```
POST /api/rooms/invite/host_respond
Content-Type: application/json

{
  "invitation_id": 456,
  "approve": true
}

Response 200:
{
  "id": 456,
  "room_id": "ABC123",
  "inviter_id": 789,
  "invitee_id": 123,
  "status": "sent_to_invitee" | "rejected_by_host",
  "updated_at": "2026-02-27T10:00:00+00:00"
}

Error 404: Invitation not found or not pending approval
```

### Get Pending Invitations Needing Host Approval
```
GET /api/rooms/ABC123/invitations/pending

Response 200:
{
  "invitations": [
    {
      "id": 456,
      "room_id": "ABC123",
      "inviter_id": 111,
      "inviter_name": "Alice",
      "inviter_avatar": "https://...",
      "invitee_id": 222,
      "invitee_name": "Bob",
      "invitee_avatar": "https://...",
      "created_at": "2026-02-27T10:00:00+00:00"
    }
  ]
}
```

## Leaderboard

### Get Friends-Only Leaderboard
```
GET /api/leaderboard/friends?limit=50

Query Parameters:
- limit: 1-100 (default 50)

Response 200:
{
  "leaderboard": [
    {
      "id": 123,
      "display_name": "John",
      "avatar_url": "https://...",
      "equipped_cat_skin": "...",
      "equipped_dog_skin": "...",
      "preferred_mascot": "cat",
      "profile_frame": "frame_1",
      "wins": 15
    }
  ]
}
```

## Status Codes

| Code | Meaning | Possible Causes |
|------|---------|-----------------|
| 200 | Success | Operation completed |
| 400 | Bad Request | Invalid data, self-request |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Not host in password room |
| 404 | Not Found | Friend/Room/Request doesn't exist |
| 500 | Server Error | Database or logic error |

## Frontend Usage Examples

### React Hook for Friends
```typescript
const { friends, loading, error, addFriend, acceptRequest } = useFriends(token);

// Send request
await addFriend(friendId);

// Accept/decline
await acceptRequest(requesterId, true);
```

### PlayerList Component
```tsx
<PlayerList 
  players={roomState?.players || []}
  currentUserId={peerId}
/>
```

### FriendsBtn Component
```tsx
<FriendsBtn token={authToken} showLabel={true} />
```
