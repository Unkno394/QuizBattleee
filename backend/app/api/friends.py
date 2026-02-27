from __future__ import annotations

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from app.database import get_auth_session_identity
from app.auth_repository import (
    send_friend_request,
    accept_friend_request,
    decline_friend_request,
    remove_friend,
    get_user_friends,
    get_friend_requests,
    get_friends_leaderboard,
    send_room_invitation,
    get_pending_room_invitations,
    respond_to_room_invitation,
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
    return {
        "id": result["id"],
        "requester_id": result["requester_id"],
        "addressee_id": result["addressee_id"],
        "status": result["status"],
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
    inviter_id = identity["user_id"]
    friend_id = body.friend_id
    room_id = body.room_id
    
    result = await send_room_invitation(inviter_id, friend_id, room_id)
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
    return {
        "invitations": [
            {
                "id": inv["id"],
                "room_id": inv["room_id"],
                "inviter_id": inv["inviter_id"],
                "inviter_name": inv["inviter_name"],
                "inviter_avatar": inv["avatar_url"],
                "created_at": inv["created_at"].isoformat() if inv["created_at"] else None,
            }
            for inv in invitations
        ]
    }


@router.post("/api/rooms/invitations/respond")
async def respond_to_room_invitation_endpoint(
    body: RoomInvitationResponse,
    authorization: str | None = Header(None),
) -> dict:
    """Accept or decline a room invitation"""
    identity = await _require_auth(authorization)
    user_id = identity["user_id"]
    room_id = body.room_id
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
