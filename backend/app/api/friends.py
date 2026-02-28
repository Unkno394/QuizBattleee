from __future__ import annotations

import asyncio
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from app.database import get_auth_session_identity, load_room_snapshot
from app.runtime import runtime
from app.auth_repository import (
    send_friend_request,
    accept_friend_request,
    decline_friend_request,
    remove_friend,
    get_friend_user_ids,
    get_user_friends,
    get_friend_requests,
    get_outgoing_friend_requests,
    get_friends_leaderboard,
    send_room_invitation,
    get_pending_room_invitations,
    respond_to_room_invitation,
    get_room_invitation_by_id,
    host_approve_room_invitation,
    get_pending_host_approvals,
    get_user_by_id,
)

router = APIRouter(tags=["friends"])


class FriendRequestRequest(BaseModel):
    friend_id: int


class FriendResponseRequest(BaseModel):
    requester_id: int
    accept: bool


class RoomInvitationRequest(BaseModel):
    friend_id: int
    room_id: str


class RoomInvitationResponse(BaseModel):
    room_id: str
    accept: bool


class HostApprovalRequest(BaseModel):
    invitation_id: int
    approve: bool


def _optional_bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    value = authorization.strip()
    if not value:
        return None
    if value.lower().startswith("bearer "):
        value = value[7:].strip()
    return value if value else None


async def _require_auth(authorization: str | None) -> dict:
    token = _optional_bearer_token(authorization)
    identity = await get_auth_session_identity(token, touch=True)
    if not identity:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return identity


async def _resolve_room_game_mode(room_id: str) -> str:
    room_id_value = str(room_id or "").upper()[:8]
    live_room = runtime.rooms.get(room_id_value)
    if live_room is not None:
        mode = str(getattr(live_room, "game_mode", "") or "").lower()
        if mode in {"classic", "ffa", "chaos"}:
            return mode

    snapshot = await load_room_snapshot(room_id_value)
    if snapshot is not None:
        mode = str((snapshot.state_json or {}).get("gameMode") or "").lower()
        if mode in {"classic", "ffa", "chaos"}:
            return mode

    return "classic"


def _normalize_room_id(room_id: str | None) -> str:
    return str(room_id or "").upper()[:8]


def _resolve_live_room_host_user_id(room) -> int | None:
    if room is None:
        return None
    if not getattr(room, "host_peer_id", ""):
        return None
    host_player = room.players.get(room.host_peer_id)
    if host_player is None or host_player.auth_user_id is None:
        return None
    try:
        return int(host_player.auth_user_id)
    except (TypeError, ValueError):
        return None


def _is_auth_user_in_room(room, user_id: int) -> bool:
    for player in room.players.values():
        if player.auth_user_id is None:
            continue
        try:
            if int(player.auth_user_id) == int(user_id):
                return True
        except (TypeError, ValueError):
            continue
    return False


def _require_host_of_live_room(room_id: str, host_user_id: int):
    room = runtime.rooms.get(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    room_host_user_id = _resolve_live_room_host_user_id(room)
    if room_host_user_id is None:
        raise HTTPException(status_code=403, detail="Host is not authorized for this room")
    if int(room_host_user_id) != int(host_user_id):
        raise HTTPException(status_code=403, detail="Only room host can perform this action")
    return room


async def _notify_auth_user_ws(user_id: int, payload: dict) -> None:
    """Push a WS event to all active sockets that belong to auth user."""
    tasks = []
    for room in runtime.rooms.values():
        for player in room.players.values():
            if player.auth_user_id is None:
                continue
            if int(player.auth_user_id) != int(user_id):
                continue
            tasks.append(
                runtime._send_safe(  # noqa: SLF001 - runtime private helper reused by API layer
                    player.websocket,
                    payload,
                    room_id=room.room_id,
                    peer_id=player.peer_id,
                )
            )
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


@router.post("/api/friends/request")
async def send_friend_request_endpoint(
    body: FriendRequestRequest,
    authorization: str | None = Header(None),
) -> dict:
    """Send a friend request to another user"""
    identity = await _require_auth(authorization)
    user_id = identity["user_id"]
    friend_id = body.friend_id
    
    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="Cannot add yourself as friend")
    
    # Check if friend exists
    friend = await get_user_by_id(friend_id)
    if not friend:
        raise HTTPException(status_code=404, detail="Friend not found")
    
    result = await send_friend_request(user_id, friend_id)
    relation = "unknown"
    status = str(result.get("status") or "")
    is_existing = bool(result.get("is_existing"))
    if status == "accepted":
        relation = "already_friends"
    elif status == "pending":
        if int(result["requester_id"]) == int(friend_id) and int(result["addressee_id"]) == int(user_id):
            relation = "incoming_pending"
        else:
            relation = "outgoing_pending" if is_existing else "created"

    if relation == "created":
        await _notify_auth_user_ws(
            friend_id,
            {
                "type": "friend_request_received",
                "requester_id": int(user_id),
            },
        )

    return {
        "id": result["id"],
        "requester_id": result["requester_id"],
        "addressee_id": result["addressee_id"],
        "status": status,
        "relation": relation,
        "created_at": result["created_at"].isoformat() if result["created_at"] else None,
    }


@router.post("/api/friends/respond")
async def respond_to_friend_request(
    body: FriendResponseRequest,
    authorization: str | None = Header(None),
) -> dict:
    """Accept or decline a friend request"""
    identity = await _require_auth(authorization)
    user_id = identity["user_id"]
    requester_id = body.requester_id
    accept = body.accept
    
    if accept:
        result = await accept_friend_request(requester_id, user_id)
    else:
        result = await decline_friend_request(requester_id, user_id)
    
    if not result:
        raise HTTPException(status_code=404, detail="Friend request not found")

    await _notify_auth_user_ws(
        int(result["requester_id"]),
        {
            "type": "friend_request_resolved",
            "requester_id": int(result["requester_id"]),
            "status": str(result["status"]),
        },
    )
    await _notify_auth_user_ws(
        int(result["addressee_id"]),
        {
            "type": "friend_request_resolved",
            "requester_id": int(result["requester_id"]),
            "status": str(result["status"]),
        },
    )
    
    return {
        "id": result["id"],
        "requester_id": result["requester_id"],
        "addressee_id": result["addressee_id"],
        "status": result["status"],
        "updated_at": result["updated_at"].isoformat() if result["updated_at"] else None,
    }


@router.get("/api/friends")
async def get_friends(
    authorization: str | None = Header(None),
) -> dict:
    """Get user's accepted friends"""
    identity = await _require_auth(authorization)
    user_id = identity["user_id"]
    
    friends = await get_user_friends(user_id)
    return {
        "friends": [
            {
                "id": f["id"],
                "email": f["email"],
                "display_name": f["display_name"],
                "avatar_url": f["avatar_url"],
                "equipped_cat_skin": f["equipped_cat_skin"],
                "equipped_dog_skin": f["equipped_dog_skin"],
                "preferred_mascot": f["preferred_mascot"],
            }
            for f in friends
        ]
    }


@router.get("/api/friends/requests")
async def get_friend_requests_endpoint(
    authorization: str | None = Header(None),
) -> dict:
    """Get pending friend requests for user"""
    identity = await _require_auth(authorization)
    user_id = identity["user_id"]
    
    requests = await get_friend_requests(user_id)
    return {
        "requests": [
            {
                "id": r["id"],
                "requester_id": r["requester_id"],
                "display_name": r["display_name"],
                "email": r["email"],
                "avatar_url": r["avatar_url"],
                "equipped_cat_skin": r["equipped_cat_skin"],
                "equipped_dog_skin": r["equipped_dog_skin"],
                "preferred_mascot": r["preferred_mascot"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in requests
        ]
    }


@router.get("/api/friends/requests/outgoing")
async def get_outgoing_friend_requests_endpoint(
    authorization: str | None = Header(None),
) -> dict:
    """Get outgoing pending friend requests for user"""
    identity = await _require_auth(authorization)
    user_id = identity["user_id"]

    requests = await get_outgoing_friend_requests(user_id)
    return {
        "requests": [
            {
                "id": r["id"],
                "friend_id": r["friend_id"],
                "display_name": r.get("display_name"),
                "avatar_url": r.get("avatar_url"),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in requests
        ]
    }


@router.delete("/api/friends/{friend_id}")
async def remove_friend_endpoint(
    friend_id: int,
    authorization: str | None = Header(None),
) -> dict:
    """Remove a friend"""
    identity = await _require_auth(authorization)
    user_id = identity["user_id"]
    
    await remove_friend(user_id, friend_id)
    return {"status": "removed"}


@router.get("/api/leaderboard/friends")
async def get_friends_leaderboard_endpoint(
    limit: int = 50,
    authorization: str | None = Header(None),
) -> dict:
    """Get leaderboard for user's friends only"""
    identity = await _require_auth(authorization)
    user_id = identity["user_id"]
    
    if limit < 1 or limit > 100:
        limit = 50
    
    friends = await get_friends_leaderboard(user_id, limit)
    return {
        "leaderboard": [
            {
                "id": f["id"],
                "display_name": f["display_name"],
                "avatar_url": f["avatar_url"],
                "equipped_cat_skin": f["equipped_cat_skin"],
                "equipped_dog_skin": f["equipped_dog_skin"],
                "preferred_mascot": f["preferred_mascot"],
                "profile_frame": f["profile_frame"],
                "wins": f["wins"],
            }
            for f in friends
        ]
    }


@router.post("/api/rooms/invite")
async def invite_friend_to_room(
    body: RoomInvitationRequest,
    authorization: str | None = Header(None),
) -> dict:
    """Send a room invitation to a friend"""
    identity = await _require_auth(authorization)
    inviter_id = int(identity["user_id"])
    friend_id = int(body.friend_id)
    room_id = _normalize_room_id(body.room_id)

    if not room_id:
        raise HTTPException(status_code=400, detail="Room id is required")
    if inviter_id == friend_id:
        raise HTTPException(status_code=400, detail="You cannot invite yourself")

    # Check if friend is in the system
    friend = await get_user_by_id(friend_id)
    if not friend:
        raise HTTPException(status_code=404, detail="Friend not found")

    # Get room info from runtime
    room = runtime.rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    is_paused_lobby = (
        str(getattr(room, "phase", "")) == "host-reconnect"
        and getattr(room, "paused_state", None) is not None
        and room.paused_state.get("phase") == "lobby"
    )
    if str(getattr(room, "phase", "")) != "lobby" and not is_paused_lobby:
        raise HTTPException(status_code=403, detail="Invitations are available only in lobby")

    if not _is_auth_user_in_room(room, inviter_id):
        raise HTTPException(status_code=403, detail="You are not a participant of this room")

    friend_ids = set(await get_friend_user_ids(inviter_id))
    if friend_id not in friend_ids:
        raise HTTPException(status_code=403, detail="You can invite only users from your friends list")

    if _is_auth_user_in_room(room, friend_id):
        raise HTTPException(status_code=409, detail="This friend is already in the room")

    # Get host user_id from room.players
    host_user_id = _resolve_live_room_host_user_id(room)

    # Determine invitation status based on room password and inviter role
    is_host = inviter_id == host_user_id if host_user_id else False
    has_password = bool(
        getattr(room, "is_password_protected", False) or room.password or room.room_password_hash
    )

    # If room has password, only host can invite (and it goes direct)
    if has_password:
        if not is_host:
            raise HTTPException(status_code=403, detail="Only host can invite in password-protected rooms")
        invitation_status = "sent_to_invitee"
    else:
        # If no password, non-hosts need host approval
        if is_host:
            invitation_status = "sent_to_invitee"
        else:
            if host_user_id is None:
                raise HTTPException(
                    status_code=403,
                    detail="Host must be registered to approve participant invitations",
                )
            invitation_status = "pending_host_approval"

    result = await send_room_invitation(inviter_id, friend_id, room_id, status=invitation_status)
    if invitation_status == "pending_host_approval" and host_user_id is not None:
        await _notify_auth_user_ws(
            int(host_user_id),
            {
                "type": "room_invitation_host_approval_required",
                "invitation_id": int(result["id"]),
                "room_id": room_id,
            },
        )
    elif invitation_status == "sent_to_invitee":
        await _notify_auth_user_ws(
            int(friend_id),
            {
                "type": "room_invitation_received",
                "invitation_id": int(result["id"]),
                "room_id": room_id,
                "inviter_id": int(inviter_id),
            },
        )
    return {
        "id": result["id"],
        "room_id": result["room_id"],
        "inviter_id": result["inviter_id"],
        "invitee_id": result["invitee_id"],
        "status": result["status"],
        "created_at": result["created_at"].isoformat() if result["created_at"] else None,
    }


@router.get("/api/rooms/invitations")
async def get_room_invitations(
    authorization: str | None = Header(None),
) -> dict:
    """Get pending room invitations for user"""
    identity = await _require_auth(authorization)
    user_id = identity["user_id"]
    
    invitations = await get_pending_room_invitations(user_id)
    result = []
    for inv in invitations:
        room_id_value = str(inv["room_id"])
        result.append(
            {
                "id": inv["id"],
                "room_id": room_id_value,
                "inviter_id": inv["inviter_id"],
                "inviter_name": inv["inviter_name"],
                "inviter_avatar": inv["avatar_url"],
                "game_mode": await _resolve_room_game_mode(room_id_value),
                "created_at": inv["created_at"].isoformat() if inv["created_at"] else None,
            }
        )
    return {"invitations": result}


@router.post("/api/rooms/invitations/respond")
async def respond_to_room_invitation_endpoint(
    body: RoomInvitationResponse,
    authorization: str | None = Header(None),
) -> dict:
    """Accept or decline a room invitation"""
    identity = await _require_auth(authorization)
    user_id = identity["user_id"]
    room_id = str(body.room_id or "").upper()[:8]
    accept = body.accept
    
    result = await respond_to_room_invitation(user_id, room_id, accept)
    if not result:
        raise HTTPException(status_code=404, detail="Room invitation not found")
    
    return {
        "id": result["id"],
        "room_id": result["room_id"],
        "status": result["status"],
        "updated_at": result["updated_at"].isoformat() if result["updated_at"] else None,
    }


@router.post("/api/rooms/invite/host_respond")
async def host_respond_to_invitation(
    body: HostApprovalRequest,
    authorization: str | None = Header(None),
) -> dict:
    """Host approves or rejects a pending room invitation"""
    identity = await _require_auth(authorization)
    host_id = int(identity["user_id"])
    invitation_id = int(body.invitation_id)
    approve = body.approve

    invitation = await get_room_invitation_by_id(invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if str(invitation["status"] or "") != "pending_host_approval":
        raise HTTPException(status_code=404, detail="Invitation is no longer pending host approval")

    room_id = _normalize_room_id(str(invitation["room_id"] or ""))
    _require_host_of_live_room(room_id, host_id)

    result = await host_approve_room_invitation(invitation_id, approve)
    if not result:
        raise HTTPException(status_code=404, detail="Invitation not found or not pending")

    await _notify_auth_user_ws(
        int(result["invitee_id"]),
        {
            "type": "room_invitation_host_decision",
            "invitation_id": int(result["id"]),
            "room_id": str(result["room_id"]),
            "status": str(result["status"]),
        },
    )

    return {
        "id": result["id"],
        "room_id": result["room_id"],
        "inviter_id": result["inviter_id"],
        "invitee_id": result["invitee_id"],
        "status": result["status"],
        "updated_at": result["updated_at"].isoformat() if result["updated_at"] else None,
    }


@router.get("/api/rooms/{room_id}/invitations/pending")
async def get_pending_invitations_for_room(
    room_id: str,
    authorization: str | None = Header(None),
) -> dict:
    """Get all invitations pending host approval for a room"""
    identity = await _require_auth(authorization)
    host_id = int(identity["user_id"])
    room_id_value = _normalize_room_id(room_id)
    _require_host_of_live_room(room_id_value, host_id)

    invitations = await get_pending_host_approvals(room_id_value)
    return {
        "invitations": [
            {
                "id": inv["id"],
                "room_id": inv["room_id"],
                "inviter_id": inv["inviter_id"],
                "inviter_name": inv["inviter_name"],
                "inviter_avatar": inv["inviter_avatar"],
                "invitee_id": inv["invitee_id"],
                "invitee_name": inv["invitee_name"],
                "invitee_avatar": inv["invitee_avatar"],
                "created_at": inv["created_at"].isoformat() if inv["created_at"] else None,
            }
            for inv in invitations
        ]
    }
