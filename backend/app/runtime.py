from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import random
from datetime import datetime, timezone
from typing import Any, cast

from fastapi import WebSocket, WebSocketDisconnect

from .config import settings
from .database import (
    get_auth_session_identity,
    load_room_snapshot,
    save_game_result,
    save_room_snapshot,
)
from .auth_repository import add_coins as add_auth_user_coins
from .auth_repository import get_user_by_id as get_auth_user_by_id
from .redis_cache import is_redis_connected, set_room_snapshot as set_cached_room_snapshot
logger = logging.getLogger(__name__)

from .runtime_constants import (
    AUTO_CAPTAIN_SINGLE_MEMBER_DELAY_MS,
    BASE_CORRECT_POINTS,
    CHAT_BAN_STRIKES_TO_DISQUALIFY,
    DIFFICULTY_LEVELS,
    DYNAMIC_TEAM_NAMES,
    MAX_PLAYERS,
    QUESTION_TIME_MS,
    TEAM_KEYS,
)
from .runtime_snapshot import apply_snapshot as apply_room_snapshot_state
from .runtime_snapshot import serialize_snapshot as serialize_room_snapshot_state
from .runtime_player_stats import (
    append_question_history as append_room_question_history,
    append_result_event as append_room_result_event,
    ensure_player_stat_entry as ensure_room_player_stat_entry,
    initialize_result_tracking as initialize_room_result_tracking,
    record_player_answer_stat as record_room_player_answer_stat,
    record_player_skip_stat as record_room_player_skip_stat,
    sync_player_stats_metadata as sync_room_player_stats_metadata,
)
from .runtime_results import build_game_result_payload
from .runtime_state_builders import (
    build_answer_progress as build_room_answer_progress,
    build_chaos_progress_for_viewer as build_room_chaos_progress_for_viewer,
    build_ffa_answer_for_viewer as build_room_ffa_answer_for_viewer,
    build_ffa_pending_players_for_viewer as build_room_ffa_pending_players_for_viewer,
    build_question_for_viewer as build_room_question_for_viewer,
    build_result_players as build_room_result_players,
    build_results_summary as build_room_results_summary,
    build_reveal_for_viewer as build_room_reveal_for_viewer,
    build_skip_request_for_viewer as build_room_skip_request_for_viewer,
)
from .runtime_state_sync import (
    build_state_payload as build_room_state_payload,
    upsert_skip_request_host_message as upsert_room_skip_request_host_message,
)
from .runtime_chat_visibility import can_player_see_message as can_room_player_see_message
from .runtime_message_handlers import handle_message as handle_room_message
from .runtime_host_reconnect import (
    assign_new_host as assign_room_new_host,
    get_phase_remaining_ms_for_pause as get_room_phase_remaining_ms_for_pause,
    pause_for_host_reconnect as pause_room_for_host_reconnect,
    resume_after_host_reconnect as resume_room_after_host_reconnect,
    schedule_phase_timer as schedule_room_phase_timer,
    should_pause_on_host_disconnect as should_pause_room_on_host_disconnect,
)
from .runtime_phase_flow import (
    advance_after_reveal as advance_room_after_reveal,
    after_team_reveal as after_room_team_reveal,
    finalize_captain_vote as finalize_room_captain_vote,
    finalize_team_naming as finalize_room_team_naming,
    reset_game as reset_room_game,
    start_captain_vote as start_room_captain_vote,
    start_game as start_room_game,
    start_team_naming_phase as start_room_team_naming_phase,
)
from .runtime_question_flow import (
    finalize_question as finalize_room_question,
    skip_question_by_host as skip_room_question_by_host,
)
from .runtime_types import (
    DifficultyMode,
    GameMode,
    Phase,
    PlayerConnection,
    RoomRuntime,
    Team,
)
from .runtime_view_helpers import (
    build_captain_vote_progress as build_room_captain_vote_progress,
    build_votes_for_viewer as build_room_votes_for_viewer,
    get_viewer_captain_vote as get_room_viewer_captain_vote,
)
from .runtime_utils import (
    build_guest_identity_key as _build_guest_identity_key,
    calculate_speed_bonus,
    clamp_question_count,
    create_mock_questions,
    generate_secret as _generate_secret,
    hash_secret as _hash_secret,
    next_team,
    normalize_difficulty_mode,
    normalize_game_mode,
    normalize_player_name,
    normalize_player_token as _normalize_player_token,
    normalize_team_name,
    normalize_topic,
    now_ms,
    random_id,
    random_room_code,
    sanitize_player_name,
    sanitize_room_id,
    sanitize_team_name,
)

class QuizRuntime:
    def __init__(self) -> None:
        self.rooms: dict[str, RoomRuntime] = {}
        self.rooms_lock = asyncio.Lock()
        self._redis_hot_snapshot_interval_ms = max(100, int(settings.redis_hot_snapshot_interval_ms))
        self._db_snapshot_interval_ms = max(500, int(settings.db_room_snapshot_interval_ms))
        self._last_redis_snapshot_ms: dict[str, int] = {}
        self._last_db_snapshot_ms: dict[str, int] = {}
        self._ws_stats: dict[str, int] = {
            "connectAttempts": 0,
            "connectSuccess": 0,
            "connectRejected": 0,
            "connectHandoff": 0,
            "disconnects": 0,
            "staleDisconnects": 0,
            "sendFailures": 0,
            "messageReceived": 0,
            "pingReceived": 0,
            "hostReconnectPause": 0,
            "hostReconnectResume": 0,
            "hostReassigned": 0,
            "rejectInvalidRoomId": 0,
            "rejectInvalidJoin": 0,
            "rejectRoomNotFound": 0,
            "rejectRoomFull": 0,
            "rejectRoomPassword": 0,
            "rejectHostTokenInvalid": 0,
            "rejectAuthTokenInvalid": 0,
            "rejectAccountAlreadyInRoom": 0,
            "activeConnections": 0,
            "peakConnections": 0,
        }

    @property
    def active_rooms_count(self) -> int:
        return len(self.rooms)

    def _increment_stat(self, key: str, amount: int = 1) -> None:
        self._ws_stats[key] = int(self._ws_stats.get(key, 0)) + amount

    def _on_connect(self) -> None:
        self._increment_stat("connectSuccess")
        active_connections = int(self._ws_stats.get("activeConnections", 0)) + 1
        self._ws_stats["activeConnections"] = active_connections
        if active_connections > int(self._ws_stats.get("peakConnections", 0)):
            self._ws_stats["peakConnections"] = active_connections

    def _on_disconnect(self) -> None:
        self._increment_stat("disconnects")
        active_connections = max(0, int(self._ws_stats.get("activeConnections", 0)) - 1)
        self._ws_stats["activeConnections"] = active_connections

    def _mark_state_changed(self, room: RoomRuntime) -> None:
        room.state_version = max(1, int(getattr(room, "state_version", 1) or 1) + 1)

    def _clear_snapshot_tracking(self, room_id: str) -> None:
        self._last_redis_snapshot_ms.pop(room_id, None)
        self._last_db_snapshot_ms.pop(room_id, None)

    def _identity_for_logs(self, identity_key: str | None) -> str:
        if not identity_key:
            return "none"
        identity_type, _, identity_value = identity_key.partition(":")
        masked_value = hashlib.sha256(identity_value.encode("utf-8")).hexdigest()[:10]
        return f"{identity_type}:{masked_value}"

    def _log_ws_event(self, event: str, level: int = logging.INFO, **fields: object) -> None:
        logger.log(
            level,
            "ws.%s %s",
            event,
            json.dumps(fields, ensure_ascii=False, separators=(",", ":")),
        )

    async def get_ws_stats(self) -> dict[str, Any]:
        async with self.rooms_lock:
            room_summaries = [
                {
                    "roomId": room.room_id,
                    "connections": len(room.players),
                    "phase": room.phase,
                }
                for room in self.rooms.values()
            ]
            active_rooms = len(room_summaries)

        room_summaries.sort(key=lambda item: int(item.get("connections", 0)), reverse=True)

        return {
            "generatedAt": now_ms(),
            "activeRooms": active_rooms,
            "stats": dict(self._ws_stats),
            "rooms": room_summaries[:50],
        }

    async def _read_join_payload(
        self,
        websocket: WebSocket,
    ) -> tuple[dict[str, Any] | None, str | None, str | None]:
        room_id_hint = sanitize_room_id(websocket.query_params.get("roomId"))
        legacy_name = websocket.query_params.get("name")
        legacy_host_token = (websocket.query_params.get("hostToken") or "").strip()
        legacy_player_token = _normalize_player_token(websocket.query_params.get("playerToken"))
        legacy_room_password = (websocket.query_params.get("roomPassword") or "").strip()
        legacy_token = websocket.query_params.get("token")
        legacy_client_id = websocket.query_params.get("clientId")
        has_legacy_query_auth = bool(
            legacy_name
            or legacy_host_token
            or legacy_player_token
            or legacy_room_password
            or legacy_token
            or legacy_client_id
        )

        if has_legacy_query_auth:
            return (
                {
                    "roomId": room_id_hint,
                    "name": legacy_name or "Игрок",
                    "hostToken": legacy_host_token,
                    "playerToken": legacy_player_token,
                    "roomPassword": legacy_room_password,
                    "token": legacy_token,
                    "clientId": legacy_client_id,
                },
                None,
                None,
            )

        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=8)
        except asyncio.TimeoutError:
            return None, "JOIN_TIMEOUT", "Не получены данные подключения"
        except WebSocketDisconnect:
            return None, "JOIN_DISCONNECTED", "Клиент отключился до входа в комнату"

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return None, "INVALID_JOIN_PAYLOAD", "Некорректный формат join payload"

        if not isinstance(payload, dict) or payload.get("type") != "join":
            return None, "INVALID_JOIN_PAYLOAD", "Ожидалось join-сообщение"

        room_id_raw = str(payload.get("roomId") or room_id_hint or "")
        return (
            {
                "roomId": sanitize_room_id(room_id_raw),
                "name": str(payload.get("name") or "Игрок"),
                "hostToken": str(payload.get("hostToken") or "").strip(),
                "playerToken": _normalize_player_token(
                    str(payload.get("playerToken")) if payload.get("playerToken") is not None else None
                ),
                "roomPassword": str(payload.get("roomPassword") or "").strip(),
                "token": str(payload.get("token")) if payload.get("token") is not None else None,
                "clientId": str(payload.get("clientId")) if payload.get("clientId") is not None else None,
            },
            None,
            None,
        )

    async def create_room(
        self,
        topic: str,
        question_count: int,
        difficulty_mode: DifficultyMode,
        game_mode: GameMode = "classic",
        room_type: str = "public",
        room_password: str | None = None,
    ) -> tuple[str, str]:
        normalized_topic = normalize_topic(topic)
        normalized_count = clamp_question_count(question_count)
        normalized_difficulty = normalize_difficulty_mode(difficulty_mode)
        normalized_game_mode = normalize_game_mode(game_mode)
        normalized_room_type = str(room_type or "public").strip().lower()
        normalized_room_password = str(room_password or "").strip()[:64]
        room_password_hash = (
            _hash_secret(normalized_room_password)
            if normalized_room_type == "password" and normalized_room_password
            else ""
        )
        host_token = _generate_secret(24)
        host_token_hash = _hash_secret(host_token)
        created_room: RoomRuntime | None = None
        created_room_id = ""

        async with self.rooms_lock:
            for _ in range(24):
                room_id = random_room_code(6)
                if room_id in self.rooms:
                    continue
                room = self._create_room(
                    room_id=room_id,
                    topic=normalized_topic,
                    difficulty_mode=normalized_difficulty,
                    game_mode=normalized_game_mode,
                    question_count=normalized_count,
                    host_peer_id="",
                    host_token_hash=host_token_hash,
                    room_password_hash=room_password_hash,
                )
                self.rooms[room_id] = room
                created_room = room
                created_room_id = room_id
                break

        if created_room is None:
            raise RuntimeError("Failed to allocate room code")

        await self._persist_room(created_room)
        return created_room_id, host_token

    async def shutdown(self) -> None:
        async with self.rooms_lock:
            rooms = list(self.rooms.values())
            self.rooms.clear()

        for room in rooms:
            async with room.lock:
                self._clear_timers(room)
                await self._persist_room(room, force_redis=True, force_db=True)
                self._clear_snapshot_tracking(room.room_id)

        self._ws_stats["activeConnections"] = 0

    async def handle_websocket(self, websocket: WebSocket) -> None:
        await websocket.accept()

        join_payload, join_error_code, join_error_message = await self._read_join_payload(websocket)
        if join_payload is None:
            self._increment_stat("connectAttempts")
            self._increment_stat("connectRejected")
            self._increment_stat("rejectInvalidJoin")
            if join_error_code != "JOIN_DISCONNECTED":
                await self._send_safe(
                    websocket,
                    {
                        "type": "error",
                        "code": join_error_code or "INVALID_JOIN_PAYLOAD",
                        "message": join_error_message or "Некорректный запрос на подключение",
                    },
                    room_id="-",
                    peer_id="-",
                )
                await websocket.close(code=1008)
            self._log_ws_event(
                "connect_rejected",
                level=logging.WARNING,
                roomId="-",
                code=join_error_code or "INVALID_JOIN_PAYLOAD",
            )
            return

        room_id = sanitize_room_id(str(join_payload.get("roomId") or ""))
        requested_name = str(join_payload.get("name") or "Игрок")
        host_token = str(join_payload.get("hostToken") or "").strip()
        requested_host = bool(host_token)
        player_token = _normalize_player_token(
            str(join_payload.get("playerToken")) if join_payload.get("playerToken") is not None else None
        )
        room_password = str(join_payload.get("roomPassword") or "").strip()
        auth_token_raw = (
            str(join_payload.get("token")).strip()
            if join_payload.get("token") is not None
            else ""
        )
        if auth_token_raw.lower().startswith("bearer "):
            auth_token_raw = auth_token_raw[7:].strip()
        identity_key: str | None = None
        auth_user_id: int | None = None
        auth_avatar_url: str | None = None
        auth_profile_frame: str | None = None
        auth_cat_skin: str | None = None
        auth_dog_skin: str | None = None
        auth_victory_front_effect: str | None = None
        auth_victory_back_effect: str | None = None
        if auth_token_raw:
            auth_identity = await get_auth_session_identity(auth_token_raw, touch=True)
            if auth_identity is None:
                self._increment_stat("connectAttempts")
                self._increment_stat("connectRejected")
                self._increment_stat("rejectAuthTokenInvalid")
                await self._send_safe(
                    websocket,
                    {
                        "type": "error",
                        "code": "AUTH_TOKEN_INVALID",
                        "message": "Сессия недействительна. Войдите снова.",
                    },
                    room_id=room_id or "-",
                    peer_id="-",
                )
                await websocket.close(code=1008)
                self._log_ws_event(
                    "connect_rejected",
                    level=logging.WARNING,
                    roomId=room_id or "-",
                    code="AUTH_TOKEN_INVALID",
                )
                return
            auth_user_id = int(auth_identity["user_id"])
            identity_key = f"acct:{auth_user_id}"
            auth_user = await get_auth_user_by_id(auth_user_id)
            if auth_user is not None:
                auth_avatar_url = (
                    str(auth_user.get("avatar_url")).strip()
                    if auth_user.get("avatar_url") is not None
                    else None
                )
                auth_profile_frame = (
                    str(auth_user.get("profile_frame")).strip()
                    if auth_user.get("profile_frame") is not None
                    else None
                )
                auth_cat_skin = (
                    str(auth_user.get("equipped_cat_skin")).strip()
                    if auth_user.get("equipped_cat_skin") is not None
                    else None
                )
                auth_dog_skin = (
                    str(auth_user.get("equipped_dog_skin")).strip()
                    if auth_user.get("equipped_dog_skin") is not None
                    else None
                )
                auth_victory_front_effect = (
                    str(auth_user.get("equipped_victory_front_effect")).strip()
                    if auth_user.get("equipped_victory_front_effect") is not None
                    else None
                )
                auth_victory_back_effect = (
                    str(auth_user.get("equipped_victory_back_effect")).strip()
                    if auth_user.get("equipped_victory_back_effect") is not None
                    else None
                )
        else:
            identity_key = _build_guest_identity_key(
                str(join_payload.get("clientId")) if join_payload.get("clientId") is not None else None
            )
        identity_for_logs = self._identity_for_logs(identity_key)
        self._increment_stat("connectAttempts")
        self._log_ws_event(
            "connect_attempt",
            roomId=room_id or "-",
            wantsHost=requested_host,
            hasPlayerToken=bool(player_token),
            identity=identity_for_logs,
        )

        if not room_id:
            self._increment_stat("connectRejected")
            self._increment_stat("rejectInvalidRoomId")
            await self._send_safe(
                websocket,
                {
                    "type": "error",
                    "code": "INVALID_ROOM_ID",
                    "message": "Room id required",
                },
                room_id=room_id or "-",
                peer_id="-",
            )
            await websocket.close(code=1008)
            self._log_ws_event(
                "connect_rejected",
                level=logging.WARNING,
                roomId="-",
                code="INVALID_ROOM_ID",
                identity=identity_for_logs,
            )
            return

        peer_id = random_id()
        room = await self._get_or_create_room(room_id, "Общая эрудиция", 5, "mixed", "classic", "")
        if room is None:
            self._increment_stat("connectRejected")
            self._increment_stat("rejectRoomNotFound")
            await self._send_safe(
                websocket,
                {
                    "type": "error",
                    "code": "ROOM_NOT_FOUND",
                    "message": "Комната не найдена",
                },
                room_id=room_id,
                peer_id="-",
            )
            await websocket.close(code=1008)
            self._log_ws_event(
                "connect_rejected",
                level=logging.WARNING,
                roomId=room_id,
                code="ROOM_NOT_FOUND",
                identity=identity_for_logs,
            )
            return

        connection_allowed = True
        error_code = "ROOM_FULL"
        error_message = "Комната заполнена. Максимум 20 участников."
        rejection_stat_key = "rejectRoomFull"
        should_resume_host = False
        is_host = requested_host
        is_spectator = False
        assigned_team: Team | None = None
        effective_player_token: str | None = None
        connected_player_name = ""
        used_handoff = False

        async with room.lock:
            duplicate_by_token: PlayerConnection | None = None
            if player_token:
                mapped_peer_id = room.player_tokens.get(player_token)
                if mapped_peer_id:
                    duplicate_by_token = room.players.get(mapped_peer_id)

            duplicate_by_identity: PlayerConnection | None = None
            if identity_key:
                duplicate_by_identity = next(
                    (
                        p
                        for p in room.players.values()
                        if p.identity_key is not None and p.identity_key == identity_key
                    ),
                    None,
                )

            duplicate_player = duplicate_by_token or duplicate_by_identity

            if duplicate_player is not None:
                if requested_host != duplicate_player.is_host:
                    connection_allowed = False
                    error_code = "ACCOUNT_ALREADY_IN_ROOM"
                    error_message = "Этот пользователь уже находится в комнате. Повторный вход запрещен."
                    rejection_stat_key = "rejectAccountAlreadyInRoom"
                else:
                    try:
                        await duplicate_player.websocket.close(code=4002)
                    except Exception:
                        pass

                    peer_id = duplicate_player.peer_id
                    duplicate_player.websocket = websocket
                    duplicate_player.name = self._make_unique_player_name(
                        room,
                        requested_name,
                        exclude_peer_id=duplicate_player.peer_id,
                    )
                    duplicate_player.identity_key = identity_key
                    duplicate_player.auth_user_id = auth_user_id
                    duplicate_player.avatar = auth_avatar_url
                    duplicate_player.profile_frame = auth_profile_frame
                    duplicate_player.mascot_skin_cat = auth_cat_skin
                    duplicate_player.mascot_skin_dog = auth_dog_skin
                    duplicate_player.victory_effect_front = auth_victory_front_effect
                    duplicate_player.victory_effect_back = auth_victory_back_effect
                    is_host = duplicate_player.is_host
                    is_spectator = duplicate_player.is_spectator
                    assigned_team = duplicate_player.team
                    effective_player_token = duplicate_player.player_token
                    connected_player_name = duplicate_player.name
                    used_handoff = True
                    self._increment_stat("connectSuccess")
                    self._increment_stat("connectHandoff")
                    should_resume_host = bool(
                        is_host and room.phase == "host-reconnect" and room.host_reconnect_ends_at
                    )

                    await self._send_safe(
                        websocket,
                        {
                            "type": "connected",
                            "peerId": peer_id,
                            "roomId": room_id,
                            "isHost": is_host,
                            "isSpectator": is_spectator,
                            "assignedTeam": assigned_team if room.phase != "lobby" else None,
                            "playerToken": effective_player_token,
                        },
                        room_id=room_id,
                        peer_id=peer_id,
                    )

                    if should_resume_host:
                        await self._resume_after_host_reconnect(room)
                    else:
                        await self._broadcast_state(room)
                        await self._persist_room(room, force_redis=True)
                    self._log_ws_event(
                        "connect_handoff",
                        roomId=room_id,
                        peerId=peer_id,
                        isHost=is_host,
                        isSpectator=is_spectator,
                        team=assigned_team,
                        identity=identity_for_logs,
                    )
            elif len(room.players) >= MAX_PLAYERS:
                connection_allowed = False
                rejection_stat_key = "rejectRoomFull"
            else:
                if requested_host:
                    if not room.host_token_hash or _hash_secret(host_token) != room.host_token_hash:
                        connection_allowed = False
                        error_code = "HOST_TOKEN_INVALID"
                        error_message = "Недействительный токен ведущего"
                        rejection_stat_key = "rejectHostTokenInvalid"
                else:
                    is_host = False
                    if connection_allowed and room.room_password_hash:
                        if not room_password:
                            connection_allowed = False
                            error_code = "ROOM_PASSWORD_REQUIRED"
                            error_message = "Для этой комнаты требуется пароль"
                            rejection_stat_key = "rejectRoomPassword"
                        elif _hash_secret(room_password) != room.room_password_hash:
                            connection_allowed = False
                            error_code = "ROOM_PASSWORD_INVALID"
                            error_message = "Неверный пароль комнаты"
                            rejection_stat_key = "rejectRoomPassword"

                if connection_allowed:
                    if is_host:
                        room.host_peer_id = peer_id
                        for existing in room.players.values():
                            existing.is_host = False
                            existing.is_spectator = False
                    else:
                        effective_player_token = player_token or _generate_secret(18)
                        while effective_player_token in room.player_tokens:
                            effective_player_token = _generate_secret(18)
                        room.player_tokens[effective_player_token] = peer_id

                    is_paused_lobby = (
                        room.phase == "host-reconnect"
                        and room.paused_state is not None
                        and room.paused_state.get("phase") == "lobby"
                    )

                    if is_host:
                        assigned_team = None
                        is_spectator = False
                    elif room.phase == "lobby" or is_paused_lobby:
                        assigned_team = None
                        is_spectator = False
                    elif room.game_mode == "ffa":
                        assigned_team = None
                        is_spectator = True
                    else:
                        assigned_team = None
                        is_spectator = True

                    room.players[peer_id] = PlayerConnection(
                        peer_id=peer_id,
                        name=self._make_unique_player_name(room, requested_name),
                        team=assigned_team,
                        is_host=is_host,
                        websocket=websocket,
                        is_spectator=is_spectator,
                        identity_key=identity_key,
                        player_token=effective_player_token,
                        avatar=auth_avatar_url,
                        auth_user_id=auth_user_id,
                        profile_frame=auth_profile_frame,
                        mascot_skin_cat=auth_cat_skin,
                        mascot_skin_dog=auth_dog_skin,
                        victory_effect_front=auth_victory_front_effect,
                        victory_effect_back=auth_victory_back_effect,
                    )
                    connected_player_name = room.players[peer_id].name
                    self._on_connect()

                    if room.game_mode == "classic" and room.phase == "captain-vote":
                        self._refresh_captain_vote_progress(room)
                        self._schedule_single_member_auto_captain(room)

                    should_resume_host = bool(
                        is_host and room.phase == "host-reconnect" and room.host_reconnect_ends_at
                    )

                    await self._send_safe(
                        websocket,
                        {
                            "type": "connected",
                            "peerId": peer_id,
                            "roomId": room_id,
                            "isHost": is_host,
                            "isSpectator": is_spectator,
                            "assignedTeam": assigned_team if room.phase != "lobby" else None,
                            "playerToken": effective_player_token,
                        },
                        room_id=room_id,
                        peer_id=peer_id,
                    )

                    if should_resume_host:
                        await self._resume_after_host_reconnect(room)
                    else:
                        await self._broadcast_and_persist(room)
                    self._log_ws_event(
                        "connect_success",
                        roomId=room_id,
                        peerId=peer_id,
                        isHost=is_host,
                        isSpectator=is_spectator,
                        team=assigned_team,
                        identity=identity_for_logs,
                    )

        if not connection_allowed:
            self._increment_stat("connectRejected")
            self._increment_stat(rejection_stat_key)
            await self._send_safe(
                websocket,
                {
                    "type": "error",
                    "code": error_code,
                    "message": error_message,
                },
                room_id=room_id,
                peer_id=peer_id,
            )
            await websocket.close(code=1008)
            self._log_ws_event(
                "connect_rejected",
                level=logging.WARNING,
                roomId=room_id,
                code=error_code,
                wantsHost=requested_host,
                identity=identity_for_logs,
            )
            return

        if used_handoff:
            self._log_ws_event(
                "session_resumed",
                roomId=room_id,
                peerId=peer_id,
                name=connected_player_name,
                isHost=is_host,
                isSpectator=is_spectator,
                identity=identity_for_logs,
            )

        disconnect_code: int | None = None
        disconnect_reason = "unknown"

        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(data, dict):
                    continue
                self._increment_stat("messageReceived")

                async with room.lock:
                    player = room.players.get(peer_id)
                    if player is None:
                        continue
                    await self._handle_message(room, player, data)
        except WebSocketDisconnect as exc:
            disconnect_code = exc.code
            disconnect_reason = "websocket_disconnect"
        except Exception:
            disconnect_reason = "server_error"
            logger.exception("Unexpected websocket error for room %s peer %s", room_id, peer_id)
        finally:
            await self._cleanup_connection(
                room_id,
                peer_id,
                websocket=websocket,
                reason=disconnect_reason,
                close_code=disconnect_code,
            )

    async def _handle_message(
        self,
        room: RoomRuntime,
        player: PlayerConnection,
        data: dict[str, Any],
    ) -> None:
        await handle_room_message(self, room, player, data)

    @staticmethod
    def _normalized_optional_str(value: Any) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    async def _refresh_connected_player_assets(
        self,
        room: RoomRuntime,
        player: PlayerConnection,
    ) -> bool:
        if player.auth_user_id is None:
            return False

        auth_user = await get_auth_user_by_id(int(player.auth_user_id))
        if auth_user is None:
            return False

        next_avatar = self._normalized_optional_str(auth_user.get("avatar_url"))
        next_profile_frame = self._normalized_optional_str(auth_user.get("profile_frame"))
        next_cat_skin = self._normalized_optional_str(auth_user.get("equipped_cat_skin"))
        next_dog_skin = self._normalized_optional_str(auth_user.get("equipped_dog_skin"))
        next_victory_front = self._normalized_optional_str(auth_user.get("equipped_victory_front_effect"))
        next_victory_back = self._normalized_optional_str(auth_user.get("equipped_victory_back_effect"))

        changed = (
            player.avatar != next_avatar
            or player.profile_frame != next_profile_frame
            or player.mascot_skin_cat != next_cat_skin
            or player.mascot_skin_dog != next_dog_skin
            or player.victory_effect_front != next_victory_front
            or player.victory_effect_back != next_victory_back
        )
        if not changed:
            return False

        player.avatar = next_avatar
        player.profile_frame = next_profile_frame
        player.mascot_skin_cat = next_cat_skin
        player.mascot_skin_dog = next_dog_skin
        player.victory_effect_front = next_victory_front
        player.victory_effect_back = next_victory_back

        await self._broadcast_and_persist(room)
        return True

    async def _cleanup_connection(
        self,
        room_id: str,
        peer_id: str,
        websocket: WebSocket | None = None,
        reason: str = "unknown",
        close_code: int | None = None,
    ) -> None:
        async with self.rooms_lock:
            room = self.rooms.get(room_id)

        if room is None:
            return

        remove_room_from_runtime = False

        async with room.lock:
            current = room.players.get(peer_id)
            if current is None:
                return
            if websocket is not None and current.websocket is not websocket:
                # Stale disconnect from an old socket after connection handoff.
                self._increment_stat("staleDisconnects")
                self._log_ws_event(
                    "disconnect_stale_ignored",
                    roomId=room_id,
                    peerId=peer_id,
                    reason=reason,
                    closeCode=close_code,
                )
                return

            removed = room.players.pop(peer_id, None)
            if removed is None:
                return
            self._on_disconnect()
            if removed.player_token:
                mapped_peer = room.player_tokens.get(removed.player_token)
                if mapped_peer == peer_id:
                    room.player_tokens.pop(removed.player_token, None)
            room.answer_submissions.pop(peer_id, None)
            room.chat_moderation_strikes.pop(peer_id, None)
            if peer_id in room.skip_requesters:
                room.skip_requesters.discard(peer_id)
                if not room.skip_requesters and room.skip_request_status == "pending":
                    room.skip_request_status = "idle"
                self._upsert_skip_request_host_message(room)
            left_message: str | None = None
            if not removed.is_host:
                left_message = f"Участник {str(removed.name or 'Игрок')[:24]} вышел из игры."

            self._cleanup_votes_for_player(room, peer_id)

            if not room.players:
                self._clear_timers(room)
                self._mark_state_changed(room)
                await self._persist_room(room)
                remove_room_from_runtime = True
            else:
                if removed.is_host or room.host_peer_id == peer_id:
                    paused = await self._pause_for_host_reconnect(
                        room,
                        removed.name,
                        removed.identity_key,
                    )
                    if not paused:
                        self._assign_new_host(room, old_host_identity=removed.identity_key)

                if room.game_mode == "classic" and removed.team and room.captains.get(removed.team) == peer_id:
                    room.captains[removed.team] = None
                    if room.phase == "team-naming":
                        room.team_naming_ready_teams[removed.team] = False
                        self._reassign_captain_if_needed(room, removed.team)
                        if room.captains[removed.team] is None:
                            room.team_naming_ready_teams[removed.team] = True
                    self._apply_captain_flags(room)

                if room.phase == "lobby":
                    for player in room.players.values():
                        if not player.is_host:
                            player.is_spectator = False
                            player.team = None
                            player.is_captain = False

                stop_reason_message = None
                if left_message:
                    stop_reason_message = (
                        f"{left_message} Игра остановлена: в комнате недостаточно участников для двух команд."
                    )
                if await self._stop_team_mode_if_not_enough_players(room, reason=stop_reason_message):
                    return

                if room.game_mode == "classic" and room.phase == "captain-vote":
                    self._refresh_captain_vote_progress(room)
                    self._schedule_single_member_auto_captain(room)
                    if self._are_all_teams_ready(room.captain_vote_ready_teams):
                        await self._finalize_captain_vote(room)
                        if left_message:
                            self._append_system_chat_message(room, left_message, kind="presence")
                        await self._broadcast_and_persist(room)
                        return

                if room.phase == "team-naming":
                    for team in TEAM_KEYS:
                        members_count = len(self._team_players(room, team))
                        if members_count == 0:
                            room.team_naming_ready_teams[team] = True
                            continue
                        if room.game_mode == "classic" and not room.captains.get(team):
                            room.team_naming_ready_teams[team] = True

                    if self._are_all_teams_ready(room.team_naming_ready_teams):
                        await self._finalize_team_naming(room)
                        if left_message:
                            self._append_system_chat_message(room, left_message, kind="presence")
                        await self._broadcast_and_persist(room)
                        return

                if room.phase == "question" and room.game_mode in {"ffa", "chaos"}:
                    eligible_players = self._answer_eligible_players(room)
                    if eligible_players and len(room.answer_submissions) >= len(eligible_players):
                        await self._finalize_question(room)
                        if left_message:
                            self._append_system_chat_message(room, left_message, kind="presence")
                        await self._broadcast_and_persist(room)
                        return

                if left_message:
                    self._append_system_chat_message(room, left_message, kind="presence")
                await self._broadcast_and_persist(room)

            logger.info(
                "[DISCONNECT] room=%s peer=%s identity=%s code=%s reason=%s",
                room_id,
                peer_id,
                self._identity_for_logs(removed.identity_key),
                close_code,
                reason,
            )
            self._log_ws_event(
                "disconnect",
                roomId=room_id,
                peerId=peer_id,
                wasHost=removed.is_host,
                reason=reason,
                closeCode=close_code,
            )

        if remove_room_from_runtime:
            async with self.rooms_lock:
                if self.rooms.get(room_id) is room:
                    self.rooms.pop(room_id, None)
            self._clear_snapshot_tracking(room_id)
            self._log_ws_event("room_empty", roomId=room_id)

    async def _get_or_create_room(
        self,
        room_id: str,
        topic: str,
        question_count: int,
        difficulty_mode: DifficultyMode,
        game_mode: GameMode,
        host_peer_id: str,
    ) -> RoomRuntime | None:
        async with self.rooms_lock:
            existing = self.rooms.get(room_id)
            if existing is not None:
                return existing

            room = await self._load_room(
                room_id,
                topic,
                question_count,
                difficulty_mode,
                game_mode,
                host_peer_id,
            )
            if room is None:
                return None
            self.rooms[room_id] = room
            return room

    async def _load_room(
        self,
        room_id: str,
        topic: str,
        question_count: int,
        difficulty_mode: DifficultyMode,
        game_mode: GameMode,
        host_peer_id: str,
    ) -> RoomRuntime | None:
        try:
            snapshot = await load_room_snapshot(room_id)
        except Exception:
            logger.exception("Failed to load room snapshot for %s", room_id)
            snapshot = None

        if snapshot is None:
            return None

        room = self._create_room(
            room_id=room_id,
            topic=str(snapshot.topic or topic)[:80] or topic,
            difficulty_mode=normalize_difficulty_mode(difficulty_mode),
            game_mode=normalize_game_mode(game_mode),
            question_count=clamp_question_count(snapshot.question_count),
            host_peer_id=host_peer_id,
        )
        self._apply_snapshot(room, snapshot.state_json or {})

        # After process restart no sockets are connected, so restart from lobby state.
        if room.phase != "lobby":
            self._reset_room_for_empty_connections(room)

        return room

    def _create_room(
        self,
        room_id: str,
        topic: str,
        difficulty_mode: DifficultyMode,
        game_mode: GameMode,
        question_count: int,
        host_peer_id: str,
        host_token_hash: str = "",
        room_password_hash: str = "",
    ) -> RoomRuntime:
        normalized_topic = normalize_topic(topic)
        normalized_difficulty = normalize_difficulty_mode(difficulty_mode)
        normalized_count = clamp_question_count(question_count)
        return RoomRuntime(
            room_id=room_id,
            topic=normalized_topic,
            difficulty_mode=normalized_difficulty,
            game_mode=normalize_game_mode(game_mode),
            question_count=normalized_count,
            questions=create_mock_questions(normalized_topic, normalized_count, normalized_difficulty),
            host_peer_id=host_peer_id,
            host_token_hash=host_token_hash,
            room_password_hash=room_password_hash,
            timers={},
        )

    def _apply_snapshot(self, room: RoomRuntime, state: dict[str, Any]) -> None:
        apply_room_snapshot_state(room, state)

    def _serialize_snapshot(self, room: RoomRuntime) -> dict[str, Any]:
        return serialize_room_snapshot_state(room)

    async def _persist_room(
        self,
        room: RoomRuntime,
        *,
        force_redis: bool = False,
        force_db: bool = False,
    ) -> None:
        state_json = self._serialize_snapshot(room)
        room_id = room.room_id
        now_value = now_ms()
        last_db_write = int(self._last_db_snapshot_ms.get(room_id, 0))
        last_redis_write = int(self._last_redis_snapshot_ms.get(room_id, 0))

        should_write_db = force_db or (now_value - last_db_write >= self._db_snapshot_interval_ms)
        if should_write_db:
            try:
                await save_room_snapshot(
                    room_id=room_id,
                    topic=room.topic,
                    question_count=room.question_count,
                    state_json=state_json,
                )
            except Exception:
                logger.exception("Failed to persist room snapshot %s", room_id)
            else:
                self._last_db_snapshot_ms[room_id] = now_value
                self._last_redis_snapshot_ms[room_id] = now_value
            return

        if not is_redis_connected():
            return

        should_write_redis = force_redis or (
            now_value - last_redis_write >= self._redis_hot_snapshot_interval_ms
        )
        if not should_write_redis:
            return

        try:
            await set_cached_room_snapshot(
                room_id=room_id,
                topic=room.topic,
                question_count=room.question_count,
                state_json=state_json,
                updated_at=datetime.now(timezone.utc),
            )
        except Exception:
            logger.exception("Failed to persist redis room snapshot %s", room_id)
        else:
            self._last_redis_snapshot_ms[room_id] = now_value

    def _account_user_id_for_peer(self, room: RoomRuntime, peer_id: str) -> int | None:
        stat = room.player_stats.get(peer_id)
        if isinstance(stat, dict) and stat.get("accountUserId") is not None:
            try:
                return int(stat.get("accountUserId"))
            except (TypeError, ValueError):
                return None

        player = room.players.get(peer_id)
        if player and player.auth_user_id is not None:
            return int(player.auth_user_id)

        return None

    async def _award_currency_after_game(
        self,
        room: RoomRuntime,
        result_players: list[dict[str, Any]],
    ) -> None:
        if not result_players:
            return

        awarded_by_user_id: dict[int, int] = {}
        points_by_peer: dict[str, int] = {
            str(row.get("peerId")): max(0, int(row.get("points", 0) or 0))
            for row in result_players
            if row.get("peerId") is not None
        }

        def add_award(peer_id: str, amount: int) -> None:
            if amount <= 0:
                return
            user_id = self._account_user_id_for_peer(room, peer_id)
            if user_id is None:
                return
            awarded_by_user_id[user_id] = awarded_by_user_id.get(user_id, 0) + amount

        if room.game_mode == "ffa":
            if not points_by_peer:
                return
            top_score = max(points_by_peer.values())
            if top_score <= 0:
                return
            for peer_id, points in points_by_peer.items():
                if points == top_score:
                    add_award(peer_id, points)
        else:
            score_a = int(room.scores.get("A", 0) or 0)
            score_b = int(room.scores.get("B", 0) or 0)
            winner_teams: set[Team]
            if score_a > score_b:
                winner_teams = {"A"}
            elif score_b > score_a:
                winner_teams = {"B"}
            else:
                winner_teams = {"A", "B"}

            team_by_peer: dict[str, Team | None] = {
                str(row.get("peerId")): cast(Team | None, row.get("team"))
                if row.get("team") in TEAM_KEYS
                else None
                for row in result_players
                if row.get("peerId") is not None
            }

            for peer_id, points in points_by_peer.items():
                team = team_by_peer.get(peer_id)
                if team is None or team not in winner_teams:
                    continue
                add_award(peer_id, points)

        for user_id, amount in awarded_by_user_id.items():
            try:
                await add_auth_user_coins(user_id, amount)
            except Exception:
                logger.exception(
                    "Failed to award coins for room=%s user=%s amount=%s",
                    room.room_id,
                    user_id,
                    amount,
                )

    async def _persist_game_result(self, room: RoomRuntime) -> None:
        result_players = self._build_result_players(room)
        await self._award_currency_after_game(room, result_players)
        
        # Add bonus points to the host
        if room.host_peer_id:
            host = room.players.get(room.host_peer_id)
            if host and host.auth_user_id:
                try:
                    await add_auth_user_coins(host.auth_user_id, 5)
                except Exception:
                    logger.exception("Failed to add bonus coins to host %s", host.auth_user_id)
        
        payload = build_game_result_payload(
            room,
            result_players,
            player_name_for_peer=lambda peer_id, fallback: self._player_name_for_peer(
                room, peer_id, fallback
            ),
        )
        try:
            await save_game_result(**payload)
        except Exception:
            if room.game_mode == "ffa":
                logger.exception("Failed to persist FFA game result for room %s", room.room_id)
            else:
                logger.exception("Failed to persist game result for room %s", room.room_id)

    async def _broadcast_and_persist(self, room: RoomRuntime) -> None:
        self._mark_state_changed(room)
        await self._broadcast_state(room)
        await self._persist_room(room)

    async def _send_safe(
        self,
        websocket: WebSocket,
        data: dict[str, Any],
        room_id: str | None = None,
        peer_id: str | None = None,
    ) -> None:
        try:
            await websocket.send_json(data)
        except Exception as exc:
            # Connection may already be closed.
            self._increment_stat("sendFailures")
            logger.debug(
                "[SEND_FAIL] room=%s peer=%s reason=%s ws_client_state=%s ws_application_state=%s",
                room_id or "-",
                peer_id or "-",
                repr(exc),
                getattr(websocket, "client_state", None),
                getattr(websocket, "application_state", None),
            )

    async def _broadcast_state(self, room: RoomRuntime) -> None:
        for player in list(room.players.values()):
            await self._send_safe(
                player.websocket,
                self._build_state(room, player),
                room_id=room.room_id,
                peer_id=player.peer_id,
            )

    def _append_result_event(
        self,
        room: RoomRuntime,
        text: str,
        *,
        kind: str = "system",
        payload: dict[str, Any] | None = None,
    ) -> None:
        append_room_result_event(room, text, kind=kind, payload=payload)

    def _append_question_history(self, room: RoomRuntime, entry: dict[str, Any]) -> None:
        append_room_question_history(room, entry)

    def _ensure_player_stat_entry(
        self,
        room: RoomRuntime,
        player: PlayerConnection,
    ) -> dict[str, Any]:
        return ensure_room_player_stat_entry(room, player)

    def _record_player_answer_stat(
        self,
        room: RoomRuntime,
        player: PlayerConnection,
        *,
        is_correct: bool,
        points_awarded: int,
        remaining_ms: int = 0,
        answered_at: int | None = None,
    ) -> dict[str, Any]:
        return record_room_player_answer_stat(
            room,
            player,
            is_correct=is_correct,
            points_awarded=points_awarded,
            remaining_ms=remaining_ms,
            answered_at=answered_at,
        )

    def _record_player_skip_stat(self, room: RoomRuntime, player: PlayerConnection) -> dict[str, Any]:
        return record_room_player_skip_stat(room, player)

    def _initialize_result_tracking(self, room: RoomRuntime) -> None:
        initialize_room_result_tracking(room)

    def _sync_player_stats_metadata(self, room: RoomRuntime) -> None:
        sync_room_player_stats_metadata(room)

    def _append_system_chat_message(self, room: RoomRuntime, text: str, kind: str = "system") -> str:
        message_id = random_id()
        room.chat.append(
            {
                "id": message_id,
                "from": "system",
                "name": "Система",
                "text": text[:280],
                "timestamp": now_ms(),
                "visibility": "all",
                "kind": kind,
            }
        )
        if len(room.chat) > 100:
            room.chat = room.chat[-100:]
        self._append_result_event(room, text, kind=kind)
        return message_id

    async def _send_moderation_notice(
        self,
        room: RoomRuntime,
        player: PlayerConnection,
        message: str,
        level: str = "warning",
        strikes: int = 0,
        disqualified: bool = False,
    ) -> None:
        await self._send_safe(
            player.websocket,
            {
                "type": "moderation-notice",
                "message": message,
                "level": level,
                "strikes": strikes,
                "disqualified": disqualified,
            },
            room_id=room.room_id,
            peer_id=player.peer_id,
        )

    def _is_manual_pause_allowed_phase(self, phase: Phase) -> bool:
        return phase in {"team-reveal", "captain-vote", "team-naming", "question", "reveal"}

    async def _pause_game_by_host(self, room: RoomRuntime, host_player: PlayerConnection) -> None:
        if not self._is_manual_pause_allowed_phase(room.phase):
            return

        previous_phase = room.phase
        remaining_ms = self._get_phase_remaining_ms_for_pause(room, previous_phase)
        self._clear_timers(room)

        room.paused_state = {
            "phase": previous_phase,
            "remainingMs": remaining_ms,
        }
        room.phase = "manual-pause"
        room.manual_pause_by_name = host_player.name
        room.question_ends_at = None
        room.team_reveal_ends_at = None
        room.captain_vote_ends_at = None
        room.team_naming_ends_at = None
        room.reveal_ends_at = None
        room.host_reconnect_ends_at = None

        self._append_system_chat_message(
            room,
            f"Ведущий {str(host_player.name or 'Ведущий')[:24]} поставил игру на паузу. Чат открыт для всех.",
            kind="pause",
        )
        await self._broadcast_and_persist(room)

    async def _resume_game_by_host(self, room: RoomRuntime, host_player: PlayerConnection) -> None:
        if room.phase != "manual-pause":
            return

        snapshot = room.paused_state or {}
        snapshot_phase_raw = snapshot.get("phase")
        if snapshot_phase_raw not in {"team-reveal", "captain-vote", "team-naming", "question", "reveal"}:
            snapshot_phase_raw = "question"
        snapshot_phase = cast(Phase, snapshot_phase_raw)
        snapshot_remaining_ms = int(snapshot.get("remainingMs", 0) or 0)

        self._clear_timers(room)
        room.phase = snapshot_phase
        room.paused_state = None
        room.manual_pause_by_name = None
        room.question_ends_at = None
        room.team_reveal_ends_at = None
        room.captain_vote_ends_at = None
        room.team_naming_ends_at = None
        room.reveal_ends_at = None

        self._schedule_phase_timer(room, snapshot_phase, snapshot_remaining_ms)
        self._append_system_chat_message(
            room,
            f"Ведущий {str(host_player.name or 'Ведущий')[:24]} возобновил игру.",
            kind="pause",
        )
        await self._broadcast_and_persist(room)

    def _apply_disqualification(self, room: RoomRuntime, offender: PlayerConnection) -> None:
        old_team = offender.team
        room.answer_submissions.pop(offender.peer_id, None)
        self._cleanup_votes_for_player(room, offender.peer_id)

        if room.game_mode == "classic" and old_team and room.captains.get(old_team) == offender.peer_id:
            room.captains[old_team] = None
            if room.phase == "team-naming":
                room.team_naming_ready_teams[old_team] = False
                self._reassign_captain_if_needed(room, old_team)
                if room.captains[old_team] is None:
                    room.team_naming_ready_teams[old_team] = True
            self._apply_captain_flags(room)

        if offender.peer_id in room.skip_requesters:
            room.skip_requesters.discard(offender.peer_id)
            if not room.skip_requesters and room.skip_request_status == "pending":
                room.skip_request_status = "idle"
            self._upsert_skip_request_host_message(room)

        offender.is_spectator = True
        offender.team = None
        offender.is_captain = False

    async def _moderate_chat_message(
        self,
        room: RoomRuntime,
        host_player: PlayerConnection,
        message_id: str,
    ) -> None:
        if not message_id:
            return

        target_index = -1
        for index, message in enumerate(room.chat):
            if str(message.get("id") or "") == message_id:
                target_index = index
                break

        if target_index < 0:
            return

        message = room.chat[target_index]
        sender_peer_id = str(message.get("from") or "")
        if not sender_peer_id or sender_peer_id == "system":
            return
        if str(message.get("kind") or "") == "skip-request":
            return

        room.chat.pop(target_index)
        if room.skip_request_message_id == message_id:
            room.skip_request_message_id = None

        offender = room.players.get(sender_peer_id)
        if offender is None or offender.is_host:
            await self._broadcast_and_persist(room)
            return

        strikes = int(room.chat_moderation_strikes.get(sender_peer_id, 0)) + 1
        room.chat_moderation_strikes[sender_peer_id] = strikes

        if strikes >= CHAT_BAN_STRIKES_TO_DISQUALIFY:
            self._apply_disqualification(room, offender)
            self._append_system_chat_message(
                room,
                f"Участник {str(offender.name or 'Игрок')[:24]} дисквалифицирован за повторные нарушения.",
                kind="moderation",
            )
            await self._send_moderation_notice(
                room,
                offender,
                "Вы дисквалифицированы за повторные нарушения. В этой игре вы только зритель.",
                level="error",
                strikes=strikes,
                disqualified=True,
            )
        else:
            remaining = CHAT_BAN_STRIKES_TO_DISQUALIFY - strikes
            remaining_text = "2 раза" if remaining == 2 else "1 раз"
            await self._send_moderation_notice(
                room,
                offender,
                f"Ваше сообщение удалено ведущим. Если получите бан ещё {remaining_text}, вас дисквалифицируют.",
                level="warning",
                strikes=strikes,
                disqualified=False,
            )

        if room.game_mode == "classic" and room.phase == "captain-vote":
            self._refresh_captain_vote_progress(room)
            self._schedule_single_member_auto_captain(room)
            if self._are_all_teams_ready(room.captain_vote_ready_teams):
                await self._finalize_captain_vote(room)
                return

        if room.phase == "team-naming":
            for team in TEAM_KEYS:
                members_count = len(self._team_players(room, team))
                if members_count == 0:
                    room.team_naming_ready_teams[team] = True
                    continue
                if room.game_mode == "classic" and not room.captains.get(team):
                    room.team_naming_ready_teams[team] = True
            if self._are_all_teams_ready(room.team_naming_ready_teams):
                await self._finalize_team_naming(room)
                return

        if room.phase == "question" and room.game_mode in {"ffa", "chaos"}:
            eligible_players = self._answer_eligible_players(room)
            if eligible_players and len(room.answer_submissions) >= len(eligible_players):
                await self._finalize_question(room)
                return

        await self._broadcast_and_persist(room)

    def _can_player_see_message(
        self,
        player: PlayerConnection,
        room: RoomRuntime,
        message: dict[str, Any],
    ) -> bool:
        return can_room_player_see_message(player, room, message)

    def _build_votes_for_viewer(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
    ) -> dict[Team, dict[str, int]]:
        return build_room_votes_for_viewer(room, viewer)

    def _build_captain_vote_progress(self, room: RoomRuntime) -> dict[Team, dict[str, int]]:
        return build_room_captain_vote_progress(
            votes_a=self._team_votes_count(room, "A"),
            total_a=len(self._team_players(room, "A")),
            votes_b=self._team_votes_count(room, "B"),
            total_b=len(self._team_players(room, "B")),
        )

    def _get_viewer_captain_vote(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
    ) -> str | None:
        return get_room_viewer_captain_vote(room, viewer)

    def _visible_team_for_viewer(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
        target_player: PlayerConnection,
    ) -> Team | None:
        if room.game_mode == "ffa":
            return None

        is_paused_lobby = room.phase == "host-reconnect" and (
            room.paused_state is not None and room.paused_state.get("phase") == "lobby"
        )

        if room.phase == "lobby" or is_paused_lobby:
            return None
        if viewer.is_host or viewer.is_spectator:
            return target_player.team
        if not viewer.team:
            return None
        return target_player.team

    def _build_question_for_viewer(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
    ) -> dict[str, Any] | None:
        return build_room_question_for_viewer(
            room,
            viewer,
            difficulty_levels=set(DIFFICULTY_LEVELS),
        )

    def _build_reveal_for_viewer(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
    ) -> dict[str, Any] | None:
        return build_room_reveal_for_viewer(room, viewer, team_keys=TEAM_KEYS)

    def _build_answer_progress(self, room: RoomRuntime) -> dict[str, int] | None:
        return build_room_answer_progress(room, eligible_count=len(self._answer_eligible_players(room)))

    def _build_ffa_answer_for_viewer(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
    ) -> dict[str, Any] | None:
        return build_room_ffa_answer_for_viewer(
            room,
            viewer,
            now_ms=now_ms,
            calculate_speed_bonus=calculate_speed_bonus,
            base_correct_points=BASE_CORRECT_POINTS,
        )

    def _build_ffa_pending_players_for_viewer(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
    ) -> list[str]:
        return build_room_ffa_pending_players_for_viewer(
            room,
            viewer,
            active_non_host_players=self._active_non_host_players(room),
        )

    def _player_name_for_peer(self, room: RoomRuntime, peer_id: str) -> str:
        player = room.players.get(peer_id)
        if player is not None:
            return player.name
        raw = room.player_stats.get(peer_id)
        if isinstance(raw, dict):
            raw_name = str(raw.get("name") or "").strip()
            if raw_name:
                return raw_name[:24]
        return "Игрок"

    def _build_result_players(self, room: RoomRuntime) -> list[dict[str, Any]]:
        return build_room_result_players(
            room,
            sync_player_stats_metadata=lambda: self._sync_player_stats_metadata(room),
            player_name_for_peer=lambda peer_id: self._player_name_for_peer(room, peer_id),
            team_keys=TEAM_KEYS,
        )

    def _build_results_summary(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
    ) -> dict[str, Any] | None:
        players_full = self._build_result_players(room)
        return build_room_results_summary(
            room,
            viewer,
            players_full=players_full,
            player_name_for_peer=lambda peer_id: self._player_name_for_peer(room, peer_id),
            team_keys=TEAM_KEYS,
        )

    def _build_state(self, room: RoomRuntime, viewer: PlayerConnection) -> dict[str, Any]:
        return build_room_state_payload(
            room,
            viewer,
            now_ms=now_ms,
            visible_team_for_viewer=self._visible_team_for_viewer,
            can_player_see_message=self._can_player_see_message,
            build_question_for_viewer=self._build_question_for_viewer,
            build_reveal_for_viewer=self._build_reveal_for_viewer,
            build_answer_progress=self._build_answer_progress,
            build_ffa_answer_for_viewer=self._build_ffa_answer_for_viewer,
            build_ffa_pending_players_for_viewer=self._build_ffa_pending_players_for_viewer,
            build_chaos_progress_for_viewer=self._build_chaos_progress_for_viewer,
            build_skip_request_for_viewer=self._build_skip_request_for_viewer,
            build_results_summary=self._build_results_summary,
            build_votes_for_viewer=self._build_votes_for_viewer,
            get_viewer_captain_vote=self._get_viewer_captain_vote,
            build_captain_vote_progress=self._build_captain_vote_progress,
        )

    def _cancel_timer(self, room: RoomRuntime, key: str) -> None:
        task = room.timers.get(key)
        if task and not task.done():
            task.cancel()
        room.timers[key] = None

    def _clear_timers(self, room: RoomRuntime) -> None:
        for key in [
            "question",
            "reveal",
            "teamReveal",
            "captainVote",
            "captainAuto",
            "teamNaming",
            "hostReconnect",
        ]:
            self._cancel_timer(room, key)

    def _schedule_timer(
        self,
        room: RoomRuntime,
        key: str,
        delay_ms: int,
        callback: Any,
    ) -> None:
        self._cancel_timer(room, key)
        delay_s = max(0.12, (delay_ms or 0) / 1000)

        async def runner() -> None:
            try:
                await asyncio.sleep(delay_s)
            except asyncio.CancelledError:
                return
            async with room.lock:
                await callback(room)

        room.timers[key] = asyncio.create_task(runner(), name=f"{room.room_id}:{key}")

    def _reset_captain_state(self, room: RoomRuntime) -> None:
        room.captain_votes = {"A": {}, "B": {}}
        room.captain_ballots = {"A": {}, "B": {}}
        room.captains = {"A": None, "B": None}
        room.captain_vote_ready_teams = {"A": False, "B": False}
        room.team_naming_ready_teams = {"A": False, "B": False}
        for player in room.players.values():
            player.is_captain = False

    def _team_players(self, room: RoomRuntime, team: Team) -> list[PlayerConnection]:
        return [player for player in room.players.values() if not player.is_host and player.team == team]

    def _non_host_players(self, room: RoomRuntime) -> list[PlayerConnection]:
        return [player for player in room.players.values() if not player.is_host]

    def _active_non_host_players(self, room: RoomRuntime) -> list[PlayerConnection]:
        return [player for player in room.players.values() if not player.is_host and not player.is_spectator]

    def _active_team_players(self, room: RoomRuntime, team: Team) -> list[PlayerConnection]:
        return [
            player
            for player in room.players.values()
            if not player.is_host and not player.is_spectator and player.team == team
        ]

    async def _stop_team_mode_if_not_enough_players(
        self,
        room: RoomRuntime,
        reason: str | None = None,
    ) -> bool:
        if room.game_mode not in {"classic", "chaos"}:
            return False
        if room.phase in {"lobby", "results"}:
            return False

        team_a_count = len(self._active_team_players(room, "A"))
        team_b_count = len(self._active_team_players(room, "B"))
        total_players = team_a_count + team_b_count
        has_two_teams = team_a_count > 0 and team_b_count > 0
        if total_players > 1 and has_two_teams:
            return False

        message = reason or "Игра остановлена: в комнате недостаточно участников для двух команд."
        await self._reset_game(room, system_message=message)
        return True

    def _answer_eligible_players(self, room: RoomRuntime) -> list[PlayerConnection]:
        if room.game_mode == "ffa":
            return self._active_non_host_players(room)
        if room.game_mode == "chaos":
            return [player for player in self._active_non_host_players(room) if player.team in TEAM_KEYS]
        if room.game_mode == "classic":
            captain_peer_id = room.captains.get(room.active_team)
            if not captain_peer_id:
                return []
            captain = room.players.get(captain_peer_id)
            if captain is None or captain.is_host:
                return []
            return [captain]
        return self._team_players(room, room.active_team)

    def _build_chaos_progress_for_viewer(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
    ) -> dict[str, Any] | None:
        return build_room_chaos_progress_for_viewer(
            room,
            viewer,
            team_a_total=len(self._active_team_players(room, "A")),
            team_b_total=len(self._active_team_players(room, "B")),
        )

    def _upsert_skip_request_host_message(self, room: RoomRuntime) -> None:
        upsert_room_skip_request_host_message(
            room,
            non_host_players=self._non_host_players(room),
            now_ms=now_ms,
            random_id=random_id,
        )

    def _build_skip_request_for_viewer(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
    ) -> dict[str, Any] | None:
        return build_room_skip_request_for_viewer(
            room,
            viewer,
            non_host_players=self._non_host_players(room),
        )

    def _random_item(self, items: list[Any]) -> Any:
        if not items:
            return None
        return random.choice(items)

    def _shuffle(self, items: list[Any]) -> list[Any]:
        copy = list(items)
        random.shuffle(copy)
        return copy

    def _assign_teams_for_start(self, room: RoomRuntime) -> None:
        candidates = self._shuffle([player for player in room.players.values() if not player.is_host])
        switch_team: Team = "A"
        for player in candidates:
            player.team = switch_team
            switch_team = next_team(switch_team)

    def _team_counts(self, room: RoomRuntime) -> dict[str, int]:
        a = 0
        b = 0
        for player in room.players.values():
            if player.is_host:
                continue
            if player.team == "A":
                a += 1
            if player.team == "B":
                b += 1
        return {"a": a, "b": b}

    def _make_unique_player_name(
        self,
        room: RoomRuntime,
        requested: str,
        exclude_peer_id: str | None = None,
    ) -> str:
        base = sanitize_player_name(requested)
        used = {
            normalize_player_name(player.name)
            for player in room.players.values()
            if exclude_peer_id is None or player.peer_id != exclude_peer_id
        }
        if normalize_player_name(base) not in used:
            return base

        for index in range(2, 1000):
            suffix = f" #{index}"
            limit = max(1, 24 - len(suffix))
            candidate = f"{base[:limit].rstrip()}{suffix}"
            if normalize_player_name(candidate) not in used:
                return candidate
        return f"{base[:20].rstrip()} #{random.randint(1000, 9999)}"

    def _assign_late_join_team(self, room: RoomRuntime) -> Team:
        counts = self._team_counts(room)
        return "A" if counts["a"] <= counts["b"] else "B"

    def _choose_captain_by_votes(self, room: RoomRuntime, team: Team) -> str | None:
        players = self._team_players(room, team)
        if not players:
            return None

        vote_entries = list(room.captain_votes[team].items())
        if not vote_entries:
            candidate = self._random_item(players)
            return candidate.peer_id if candidate else None

        max_votes = max(int(count or 0) for _, count in vote_entries)
        leaders = [
            peer_id
            for peer_id, count in vote_entries
            if int(count or 0) == max_votes
            and any(player.peer_id == peer_id for player in players)
        ]

        if not leaders:
            candidate = self._random_item(players)
            return candidate.peer_id if candidate else None

        return cast(str | None, self._random_item(leaders))

    def _apply_captain_flags(self, room: RoomRuntime) -> None:
        for player in room.players.values():
            if player.is_host:
                player.is_captain = False
                continue
            player.is_captain = (
                (player.team == "A" and room.captains["A"] == player.peer_id)
                or (player.team == "B" and room.captains["B"] == player.peer_id)
            )

    def _team_votes_count(self, room: RoomRuntime, team: Team) -> int:
        return sum(max(0, int(count or 0)) for count in room.captain_votes[team].values())

    def _is_captain_vote_ready_for_team(self, room: RoomRuntime, team: Team) -> bool:
        members_count = len(self._team_players(room, team))
        if members_count == 0:
            return True
        if members_count == 1 and room.captains.get(team):
            return True
        return self._team_votes_count(room, team) >= members_count

    def _are_all_teams_ready(self, ready_map: dict[Team, bool]) -> bool:
        return all(bool(ready_map.get(team)) for team in TEAM_KEYS)

    def _refresh_captain_vote_progress(self, room: RoomRuntime) -> None:
        for team in TEAM_KEYS:
            ready = self._is_captain_vote_ready_for_team(room, team)
            room.captain_vote_ready_teams[team] = ready

            if ready:
                room.captains[team] = room.captains[team] or self._choose_captain_by_votes(room, team)
            else:
                room.captains[team] = None

        self._apply_captain_flags(room)

    def _single_member_teams_waiting_captain(self, room: RoomRuntime) -> list[Team]:
        if room.phase != "captain-vote":
            return []
        teams: list[Team] = []
        for team in TEAM_KEYS:
            if room.captain_vote_ready_teams.get(team):
                continue
            if len(self._team_players(room, team)) == 1:
                teams.append(team)
        return teams

    def _schedule_single_member_auto_captain(self, room: RoomRuntime) -> None:
        self._cancel_timer(room, "captainAuto")
        teams_for_auto = self._single_member_teams_waiting_captain(room)
        if not teams_for_auto:
            return

        async def auto_pick_single_member_captains(inner_room: RoomRuntime) -> None:
            if inner_room.phase != "captain-vote":
                return

            changed = False
            for team in teams_for_auto:
                if inner_room.captain_vote_ready_teams.get(team):
                    continue
                members = self._team_players(inner_room, team)
                if len(members) != 1:
                    continue

                chosen = members[0]
                inner_room.captains[team] = chosen.peer_id
                inner_room.captain_vote_ready_teams[team] = True
                changed = True

            if changed:
                self._apply_captain_flags(inner_room)

            if self._are_all_teams_ready(inner_room.captain_vote_ready_teams):
                await self._finalize_captain_vote(inner_room)
                return

            if changed:
                await self._broadcast_and_persist(inner_room)

        self._schedule_timer(
            room,
            "captainAuto",
            AUTO_CAPTAIN_SINGLE_MEMBER_DELAY_MS,
            auto_pick_single_member_captains,
        )

    def _initialize_team_naming_progress(self, room: RoomRuntime) -> None:
        for team in TEAM_KEYS:
            members_count = len(self._team_players(room, team))
            if members_count == 0:
                room.team_naming_ready_teams[team] = True
            else:
                room.team_naming_ready_teams[team] = (
                    room.captains[team] is None if room.game_mode == "classic" else False
                )

    async def _start_question_phase(self, room: RoomRuntime) -> None:
        room.phase = "question"
        room.question_ends_at = now_ms() + QUESTION_TIME_MS
        room.team_reveal_ends_at = None
        room.captain_vote_ends_at = None
        room.team_naming_ends_at = None
        room.active_answer = None
        room.answer_submissions = {}
        room.skip_requesters = set()
        room.skip_request_status = "idle"
        room.skip_request_message_id = None
        room.last_reveal = None
        room.reveal_ends_at = None

        self._schedule_timer(room, "question", QUESTION_TIME_MS, self._finalize_question)
        await self._broadcast_and_persist(room)

    async def _finalize_question(self, room: RoomRuntime) -> None:
        await finalize_room_question(self, room)

    async def _skip_question_by_host(self, room: RoomRuntime, host_player: PlayerConnection) -> None:
        await skip_room_question_by_host(self, room, host_player)

    async def _advance_after_reveal(self, room: RoomRuntime) -> None:
        await advance_room_after_reveal(self, room)

    def _get_phase_remaining_ms_for_pause(self, room: RoomRuntime, phase: Phase) -> int:
        return get_room_phase_remaining_ms_for_pause(self, room, phase)

    def _schedule_phase_timer(self, room: RoomRuntime, phase: Phase, remaining_ms: int) -> None:
        schedule_room_phase_timer(self, room, phase, remaining_ms)

    async def _resume_after_host_reconnect(self, room: RoomRuntime) -> None:
        await resume_room_after_host_reconnect(self, room)

    def _assign_new_host(
        self,
        room: RoomRuntime,
        old_host_identity: str | None = None,
    ) -> PlayerConnection | None:
        return assign_room_new_host(self, room, old_host_identity)

    def _should_pause_on_host_disconnect(self, phase: Phase) -> bool:
        return should_pause_room_on_host_disconnect(phase)

    async def _pause_for_host_reconnect(
        self,
        room: RoomRuntime,
        host_name: str | None,
        host_identity: str | None = None,
    ) -> bool:
        return await pause_room_for_host_reconnect(self, room, host_name, host_identity)

    async def _finalize_team_naming(self, room: RoomRuntime) -> None:
        await finalize_room_team_naming(self, room)

    async def _start_team_naming_phase(self, room: RoomRuntime) -> None:
        await start_room_team_naming_phase(self, room)

    async def _finalize_captain_vote(self, room: RoomRuntime) -> None:
        await finalize_room_captain_vote(self, room)

    async def _start_captain_vote(self, room: RoomRuntime) -> None:
        await start_room_captain_vote(self, room)

    async def _after_team_reveal(self, room: RoomRuntime) -> None:
        await after_room_team_reveal(self, room)

    async def _start_game(self, room: RoomRuntime) -> None:
        await start_room_game(self, room)

    async def _reset_game(self, room: RoomRuntime, system_message: str | None = None) -> None:
        await reset_room_game(self, room, system_message)

    def _get_random_unique_team_name(self, room: RoomRuntime, fallback: str) -> str:
        available = [
            name
            for name in DYNAMIC_TEAM_NAMES
            if normalize_team_name(name) not in room.used_team_names
        ]

        if not available:
            return fallback

        selected = cast(str, self._random_item(available))
        room.used_team_names.add(normalize_team_name(selected))
        return selected

    def _reassign_captain_if_needed(self, room: RoomRuntime, team: Team) -> None:
        if room.captains.get(team):
            return

        players = self._team_players(room, team)
        candidate = self._random_item(players)
        room.captains[team] = candidate.peer_id if candidate else None
        self._apply_captain_flags(room)

    def _cleanup_votes_for_player(self, room: RoomRuntime, peer_id: str) -> None:
        for team in TEAM_KEYS:
            previous_candidate = room.captain_ballots[team].get(peer_id)
            if previous_candidate:
                current_count = room.captain_votes[team].get(previous_candidate, 0)
                next_count = max(0, current_count - 1)
                if next_count == 0:
                    room.captain_votes[team].pop(previous_candidate, None)
                else:
                    room.captain_votes[team][previous_candidate] = next_count

            room.captain_ballots[team].pop(peer_id, None)
            room.captain_votes[team].pop(peer_id, None)

            voters_to_delete = [
                voter_peer_id
                for voter_peer_id, candidate_peer_id in room.captain_ballots[team].items()
                if candidate_peer_id == peer_id
            ]
            for voter_peer_id in voters_to_delete:
                room.captain_ballots[team].pop(voter_peer_id, None)

    def _reset_room_for_empty_connections(self, room: RoomRuntime) -> None:
        self._clear_timers(room)
        room.phase = "lobby"
        room.current_question_index = -1
        room.active_team = "A"
        room.question_ends_at = None
        room.team_reveal_ends_at = None
        room.captain_vote_ends_at = None
        room.team_naming_ends_at = None
        room.reveal_ends_at = None
        room.host_reconnect_ends_at = None
        room.disconnected_host_name = None
        room.disconnected_host_expected_name = None
        room.paused_state = None
        room.manual_pause_by_name = None
        room.active_answer = None
        room.answer_submissions = {}
        room.skip_requesters = set()
        room.skip_request_status = "idle"
        room.skip_request_message_id = None
        room.last_reveal = None
        room.scores = {"A": 0, "B": 0}
        room.player_scores = {}
        room.player_stats = {}
        room.question_history = []
        room.event_history = []
        room.chat_moderation_strikes = {}
        room.chat = []
        room.players = {}
        room.host_peer_id = ""
        room.questions = create_mock_questions(room.topic, room.question_count, room.difficulty_mode)
        self._reset_captain_state(room)
        room.team_names = {"A": "Команда A", "B": "Команда B"}

    async def _send_room_invitation(
        self,
        room: RoomRuntime,
        inviter: PlayerConnection,
        friend_id: int,
    ) -> None:
        """Send a room invitation to a friend via API, host will receive notification"""
        from app.auth_repository import send_room_invitation
        
        # Send invitation through API
        await send_room_invitation(inviter.auth_user_id, friend_id, room.room_id)
        
        # Notify host about the invitation request
        host = room.players.get(room.host_peer_id)
        if host and host.auth_user_id:
            await self._send_safe(
                host.websocket,
                {
                    "type": "room-invitation-request",
                    "roomId": room.room_id,
                    "inviterId": inviter.auth_user_id,
                    "inviterName": inviter.name,
                    "friendId": friend_id,
                },
                room_id=room.room_id,
                peer_id=host.peer_id,
            )

    async def _send_room_invitation_response(
        self,
        room: RoomRuntime,
        friend_peer_id: str | None,
        accepted: bool,
    ) -> None:
        """Send response to room invitation to a friend"""
        if friend_peer_id:
            friend = room.players.get(friend_peer_id)
            if friend:
                await self._send_safe(
                    friend.websocket,
                    {
                        "type": "room-invitation-response",
                        "roomId": room.room_id,
                        "accepted": accepted,
                    },
                    room_id=room.room_id,
                    peer_id=friend.peer_id,
                )


