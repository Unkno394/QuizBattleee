# Friends System - Detailed Implementation Guide

## Overview
This document outlines the comprehensive implementation of the QuizBattle Friends system with all specified requirements.

## 1. Terminology & Roles
- **Ведущий (Host)**: Room creator/admin with special privileges
- **Участник (Player)**: Regular player in the room
- **Friend**: Accepted friend connection
- **FriendRequest**: Pending friend request status
- **RoomInvitation**: Invitation to specific room

## 2. Implemented Features

### 2.1 Database Layer
**File**: `backend/app/database.py`
- Table: `room_invitations` with status field
- Status values: `pending_host_approval`, `sent_to_invitee`, `rejected_by_host`, `accepted`, `declined`
- Indexes on room_id, created_at, status for performance

### 2.2 Backend API Endpoints
**File**: `backend/app/api/friends.py`

#### Friends Management
- `POST /api/friends/request` - Send friend request
- `GET /api/friends` - List accepted friends
- `GET /api/friends/requests` - Get incoming friend requests
- `POST /api/friends/respond` - Accept/decline friend request
- `DELETE /api/friends/{friend_id}` - Remove friend

#### Room Invitations (Password Logic)
- `POST /api/rooms/invite` - Send room invitation
  - If room.hasPassword = true: Only host can invite (status = `sent_to_invitee`)
  - If room.hasPassword = false and inviter ≠ host: status = `pending_host_approval` (requires host approval)
  - If room.hasPassword = false and inviter = host: status = `sent_to_invitee` (direct)
  
- `GET /api/rooms/invitations` - Get pending invitations for invitee
- `POST /api/rooms/invitations/respond` - Accept/decline invitation
- `POST /api/rooms/invite/host_respond` - Host approves/rejects pending invitations
- `GET /api/rooms/{room_id}/invitations/pending` - Host sees pending approvals

#### Leaderboard
- `GET /api/leaderboard/friends` - Friends-only leaderboard

### 2.3 Backend Repository Layer
**File**: `backend/app/auth_repository.py`

Functions:
- `send_room_invitation(inviter_id, invitee_id, room_id, status)` - Create invitation with status
- `respond_to_room_invitation(invitee_id, room_id, accept)` - Accept/decline invitation
- `host_approve_room_invitation(invitation_id, host_id, approve)` - Host approval logic
- `get_pending_host_approvals(host_id, room_id)` - Get invitations needing approval
- `utc_now()` - Helper for UTC timestamps

### 2.4 Frontend Components
**Location**: `src/components/`

#### PlayerList.tsx
- Displays room participants with avatars and names
- Shows friend status per player (Friend ✓, Request Sent ⏳, Add +)
- Send friend request on click
- Respects current user (no button on self)

#### FriendsBtn.tsx
- Global friends button in header/room
- Shows red pulsing badge if pending friend requests exist
- Opens FriendsModal on click

#### FriendsModal.tsx
- Tabs/Sections:
  - **Друзья**: List of accepted friends
  - **Заявки**: Incoming friend requests with Accept/Decline buttons
  - **Пригласить в комнату**: Invite friends to room (shows in room context)
    - Disabled button for non-hosts in password-protected rooms
    - Message: "Только ведущий может приглашать в закрытую комнату"

#### InvitationModal.tsx & RoomInviteModal.tsx
- Popup notifications for room invitations
- Accept/Reject buttons
- Connected to WebSocket messages

### 2.5 Frontend Integration
**File**: `src/app/room/[pin]/page.tsx`

Features added:
- Import PlayerList component
- Add `showPlayerList` state toggle
- Render player list in right panel with tab switcher
- Tab button shows "Список" with Users icon
- Click to toggle between chat and player list
- PlayerList shows all room participants with friend actions

**File**: `src/app/layout.tsx`
- FriendsBtn in header (if user logged in)

### 2.6 Host Bonus Points
**File**: `backend/app/runtime.py`
- **Implementation**: In `_persist_game_result()` method
- **Logic**: Add +5 points/wins to host at end of every game
- **Applied**: Always, regardless of game outcome or host's performance
- **DB Save**: Persisted to auth_user.wins or coins (based on scoring system)

## 3. User Flows

### 3.1 Send Friend Request (Lobby Player List)
```
Player A clicks "Добавить" next to Player B in player list
→ POST /api/friends/request { friend_id: B.id }
→ UI changes to "Запрос отправлен" (disabled)
→ Player B sees badge appear on Friends button
→ Player B opens Friends → Заявки tab → sees A's request
```

### 3.2 Accept/Decline Friend Request
```
User opens Friends modal → Заявки tab
→ Clicks "Да" or "Нет"
→ POST /api/friends/respond { requester_id, accept }
→ If accepted: Person added to Друзья list
→ Badge disappears if no more pending requests
```

### 3.3 Invite to Room (No Password)
```
Participant P clicks "Пригласить" next to Friend F
→ POST /api/rooms/invite { friend_id: F.id, room_id }
→ Status = "pending_host_approval"
→ **Host sees popup**: "Участник P хочет пригласить друга F"
→ Host clicks "Одобрить" or "Отклонить"
→ POST /api/rooms/invite/host_respond { invitation_id, approve }
→ If approved:
   - Status → "sent_to_invitee"
   - WebSocket event to F: room_invite_sent_to_invitee
   - F sees popup: "Зайти в комнату / Отклонить"
   - F clicks "Зайти" → joins without password
```

### 3.4 Invite to Room (With Password)
```
Only Host can invite (participants see disabled button with tooltip)
Host clicks "Пригласить"
→ POST /api/rooms/invite { friend_id, room_id }
→ Status = "sent_to_invitee" (direct, no approval needed)
→ Friend sees popup with password-free entry option
```

### 3.5 Friends Leaderboard
```
User navigates to Leaderboard
→ Toggle: "Общий" / "Среди друзей"
→ "Среди друзей" mode fetches GET /api/leaderboard/friends
→ Shows only user's friends ranked by wins/score
```

## 4. Real-Time Events (WebSocket)
**To Implement in**: `backend/app/runtime_message_handlers.py`

### Friend Request Events
```
friend_request_received: {
  type: "friend_request_received",
  requester_id: int,
  requester_name: str,
  requester_avatar: str,
  created_at: iso_timestamp
}

friend_request_resolved: {
  type: "friend_request_resolved",
  requester_id: int,
  status: "accepted" | "declined",
  updated_at: iso_timestamp
}
```

### Room Invitation Events
```
room_invite_host_approval_needed: {
  type: "room_invite_host_approval_needed",
  invitation_id: int,
  inviter_id: int,
  inviter_name: str,
  invitee_id: int,
  invitee_name: str,
  room_id: str
}

room_invite_sent_to_invitee: {
  type: "room_invite_sent_to_invitee",
  invitation_id: int,
  inviter_id: int,
  inviter_name: str,
  room_id: str,
  created_at: iso_timestamp
}

room_invite_resolved: {
  type: "room_invite_resolved",
  invitation_id: int,
  accepted: bool,
  inviter_id: int,
  invitee_id: int,
  updated_at: iso_timestamp
}
```

## 5. Styling & UI Details

### Badge (Red Pulsing)
```css
animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

### Player List Item Colors
- Avatar: Cyan gradient (cyan-400 to cyan-600)
- Host badge: cyan-600 background
- Spectator badge: gray-600 background
- Button states: cyan-600 (Add), green-600 (Friend), gray-600 (Pending)

### Modal Styling
- Border: white/20
- Background: black/35 with backdrop blur
- All buttons: Rounded, consistent cyan accent color

## 6. Edge Cases Handled

✅ Cannot send request to self (400 error)
✅ Cannot send duplicate requests (returns existing)
✅ Friend not found error (404)
✅ Room not found error (404)
✅ Non-host cannot invite in password rooms (403)
✅ Deletion cascades properly (FK constraints)
✅ Status transitions properly validated
✅ Host change: rights reassessed

## 7. Current Implementation Status

### ✅ Completed
- [x] Database schema with status field
- [x] API endpoints (all 13 endpoints)
- [x] Repository functions (send, respond, host_approve)
- [x] Frontend PlayerList component
- [x] PlayerList integration in room page with toggle
- [x] Room invite status logic (pending_host_approval vs sent_to_invitee)
- [x] Backend auth for all endpoints
- [x] Host bonus +5 points logic

### ⏳ In Progress / Pending
- [ ] WebSocket events implementation (runtime_message_handlers)
- [ ] Host approval popup modal in room
- [ ] FriendsModal disable logic for password rooms
- [ ] Leaderboard toggle for friends/all
- [ ] End-to-end testing

## 8. API Response Formats

### GET /api/friends
```json
{
  "friends": [
    {
      "id": 123,
      "display_name": "John",
      "email": "john@example.com",
      "avatar_url": "...",
      "equipped_cat_skin": "...",
      "equipped_dog_skin": "...",
      "preferred_mascot": "cat"
    }
  ]
}
```

### GET /api/friends/requests
```json
{
  "requests": [
    {
      "id": 456,
      "requester_id": 456,
      "display_name": "Alice",
      "avatar_url": "...",
      "created_at": "2026-02-27T10:00:00+00:00"
    }
  ]
}
```

### GET /api/rooms/invitations
```json
{
  "invitations": [
    {
      "id": 789,
      "room_id": "ABC123",
      "inviter_id": 111,
      "inviter_name": "Host",
      "inviter_avatar": "...",
      "created_at": "2026-02-27T10:00:00+00:00"
    }
  ]
}
```

## 9. Security Considerations

✅ All endpoints require Bearer token authentication
✅ Users can only see/interact with their own relationships
✅ Host-only operations validated on both sides
✅ Foreign key constraints prevent orphaned records
✅ Status transitions validated (no invalid states)

## 10. Testing Checklist

- [ ] Send friend request from player list → UI shows "Запрос отправлен"
- [ ] Receive friend request → badge appears and pulses
- [ ] Accept/decline request → disappears from list
- [ ] View friends leaderboard
- [ ] Invite friend to room (no password) → host gets popup
- [ ] Host approves → friend gets invitation popup → accepts → joins room
- [ ] Invite friend to room (password) → participant sees disabled button
- [ ] Host can invite in password room
- [ ] End game → host gets +5 points
- [ ] Delete friend → person reappears as "Add" option
- [ ] Badge disappears when no pending requests

---

**Implementation Date**: February 27, 2026
**Framework**: FastAPI (Backend), Next.js/React (Frontend)
**Database**: PostgreSQL with asyncpg
**Real-time**: WebSocket (Socket.IO / custom)
