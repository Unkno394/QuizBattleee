# Friends System - Remaining Work & Next Steps

## Current Status
**Completion**: ~70% ✅

### ✅ Completed
1. Database schema (status field exists)
2. All 13+ API endpoints implemented
3. Backend repository functions
4. Room invite status logic (pending_host_approval vs sent_to_invitee)
5. Host bonus +5 points logic
6. PlayerList component with friend actions
7. PlayerList integration in room page
8. FriendsBtn component with badge
9. FriendsModal component
10. Token management & authentication

### ⏳ Remaining Work

## 1. WebSocket Real-Time Events
**Priority**: HIGH  
**Location**: `backend/app/runtime_message_handlers.py`

### What needs to be done:
```python
# In handle_room_message or new message handler:

async def _send_friend_request_notification(friend_id: int, requester_data: dict):
    """Notify friend of new request"""
    # Find websocket connection for friend_id
    # Send event: friend_request_received

async def _send_room_invite_host_notification(room_id: str, invitation_data: dict):
    """Notify host of pending invitation approval"""
    # Send to host: room_invite_host_approval_needed

async def _send_room_invite_accepted_notification(friend_id: int, inviter_data: dict):
    """Notify friend of sent invitation"""
    # Send event: room_invite_sent_to_invitee
```

### Events to emit:
- `friend_request_received` - when someone sends friend request
- `friend_request_resolved` - when request accepted/declined
- `room_invite_host_approval_needed` - when non-host invites in non-password room
- `room_invite_sent_to_invitee` - when host approves or host invites
- `room_invite_resolved` - when invitee accepts/declines

## 2. Host Approval Popup Modal
**Priority**: HIGH  
**Location**: `src/components/HostApprovalModal.tsx` (new)

### What needs to be done:
```tsx
// Listen for room_invite_host_approval_needed event
// Show modal with:
// - Friend name & avatar
// - "Одобрить" button → POST /api/rooms/invite/host_respond {approve: true}
// - "Отклонить" button → POST /api/rooms/invite/host_respond {approve: false}
// Auto-dismiss on response or timeout

export function HostApprovalModal({ invitation, onApprove, onReject }) {
  // Modal UI
}
```

Then integrate into room page:
```tsx
<HostApprovalModal 
  invitation={pendingApproval}
  onApprove={handleApprove}
  onReject={handleReject}
/>
```

## 3. Update FriendsModal for Password Rooms
**Priority**: MEDIUM  
**Location**: `src/components/FriendsModal.tsx`

### What needs to be done:
```tsx
// In "Пригласить в комнату" section:
// Check if room.hasPassword = true

{room?.hasPassword && !isHost ? (
  <button disabled className="...">
    Пригласить
    <Tooltip>Только ведущий может приглашать в закрытую комнату</Tooltip>
  </button>
) : (
  <button onClick={invite}>Пригласить</button>
)}
```

Need to:
- Pass room data to FriendsModal
- Check room.hasPassword status
- Check if current user is host
- Disable/enable button accordingly

## 4. Leaderboard Friends/All Toggle
**Priority**: MEDIUM  
**Location**: `src/pages/rating/` or leaderboard component

### What needs to be done:
```tsx
const [scope, setScope] = useState<'all' | 'friends'>('all');

// Toggle buttons
<button onClick={() => setScope('all')}>Общий</button>
<button onClick={() => setScope('friends')}>Среди друзей</button>

// Fetch based on scope
useEffect(() => {
  const endpoint = scope === 'friends' 
    ? '/api/leaderboard/friends'
    : '/api/leaderboard';
  
  fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
}, [scope]);
```

## 5. Improved Room Invitation Notification
**Priority**: MEDIUM  
**Location**: `src/components/InvitationModal.tsx`

### Current state:
- Shows invitation popup
- Has Accept/Reject buttons

### What needs updating:
- Listen for different event types:
  - `room_invite_sent_to_invitee` - show popup with room info
  - `room_invite_host_approval_needed` - only for host (see task #2)
- Show room details (room name/PIN, who's inviting)
- Better styling

## 6. FriendRequest Event Handling
**Priority**: LOW  
**Location**: Frontend hooks

### What needs to be done:
- Listen for `friend_request_received` WebSocket event
- Trigger badge update in real-time
- Show optional toast notification
- Update friend requests list

## 7. Testing & Validation
**Priority**: HIGH

### Test scenarios:
- [ ] Player sends friend request → other player sees badge
- [ ] Accept request → added to friends
- [ ] Decline request → badge disappears
- [ ] Non-host invites in non-password room → host gets popup
- [ ] Host approves → friend gets invitation → accepts → joins room
- [ ] Non-host in password room → button disabled with tooltip
- [ ] Delete friend → reverts to "Add" button
- [ ] Host gets +5 points at game end
- [ ] Friends leaderboard tab works
- [ ] All WebSocket events trigger correctly
- [ ] Errors handled gracefully

## Implementation Order (Recommended)

1. **Week 1**: 
   - [ ] WebSocket events (task #1)
   - [ ] Host approval popup (task #2)
   
2. **Week 2**:
   - [ ] Password room button logic (task #3)
   - [ ] Leaderboard toggle (task #4)
   
3. **Week 3**:
   - [ ] Invitation notification improvements (task #5)
   - [ ] Friend request events (task #6)
   - [ ] Full testing (task #7)

## Code Snippets to Implement

### WebSocket message handler example:
```python
async def handle_friend_request_message(room, player, data):
    """Handle friend request notifications"""
    message_type = data.get("type")
    
    if message_type == "friend-request-received":
        # Get friend data from database
        friend_data = await get_user_by_id(data["friend_id"])
        
        # Send notification to all connected users
        for peer_id, other_player in room.players.items():
            if other_player.auth_user_id == friend_data["id"]:
                await runtime._send_safe(
                    other_player.websocket,
                    {
                        "type": "friend_request_received",
                        "requester_id": player.auth_user_id,
                        "requester_name": player.name,
                        "requester_avatar": player.avatar,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
```

### React hook for WebSocket listener:
```typescript
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    const data = JSON.parse(event.data);
    
    if (data.type === "friend_request_received") {
      // Update badge
      setHasPendingRequests(true);
      
      // Optional toast
      toast.info(`New friend request from ${data.requester_name}`);
    }
    
    if (data.type === "room_invite_sent_to_invitee") {
      // Show invitation modal
      setInvitation(data);
    }
  };
  
  ws.addEventListener("message", handleMessage);
  return () => ws.removeEventListener("message", handleMessage);
}, [ws]);
```

## Files Modified Summary

### Backend
- ✅ `backend/app/database.py` - Status field exists
- ✅ `backend/app/auth_repository.py` - Functions added
- ✅ `backend/app/api/friends.py` - Endpoints added
- ⏳ `backend/app/runtime_message_handlers.py` - WebSocket events (TODO)
- ✅ `backend/app/runtime.py` - Host bonus logic

### Frontend
- ✅ `src/components/PlayerList.tsx` - Created
- ✅ `src/components/FriendsBtn.tsx` - Created
- ✅ `src/components/FriendsModal.tsx` - Created
- ⏳ `src/components/HostApprovalModal.tsx` - New (TODO)
- ⏳ `src/components/InvitationModal.tsx` - Update (TODO)
- ✅ `src/app/room/[pin]/page.tsx` - PlayerList integrated
- ⏳ `src/hooks/useFriends.ts` - Update for WebSocket events (TODO)
- ⏳ Leaderboard component - Add toggle (TODO)

## Known Issues to Address

1. TypeScript types for Player may need expansion
2. WebSocket connection handling in frontend
3. Polling fallback if WebSocket unavailable
4. Race conditions in friend request handling
5. Real-time badge update timing

## Performance Considerations

- Friend list caching (frontend)
- Invitation polling interval (5-10 seconds if no WS)
- Leaderboard pagination (if >100 friends)
- Badge animation optimization (use CSS animations)

## Documentation Generated

- ✅ `FRIENDS_SYSTEM_IMPLEMENTATION.md` - Complete feature spec
- ✅ `FRIENDS_API_REFERENCE.md` - API endpoints & usage
- ✅ `FRIENDS_SYSTEM_REMAINING_WORK.md` - This file

---

**Last Updated**: February 27, 2026  
**Status**: Ready for WebSocket implementation phase
