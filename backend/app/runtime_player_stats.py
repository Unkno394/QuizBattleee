from __future__ import annotations

from typing import Any

from .runtime_constants import QUESTION_TIME_MS
from .runtime_types import PlayerConnection, RoomRuntime
from .runtime_utils import now_ms, random_id


def append_result_event(
    room: RoomRuntime,
    text: str,
    *,
    kind: str = "system",
    payload: dict[str, Any] | None = None,
) -> None:
    room.event_history.append(
        {
            "id": random_id(),
            "timestamp": now_ms(),
            "kind": kind,
            "text": text[:280],
            "payload": dict(payload or {}),
        }
    )
    if len(room.event_history) > 300:
        room.event_history = room.event_history[-300:]


def append_question_history(room: RoomRuntime, entry: dict[str, Any]) -> None:
    room.question_history.append(dict(entry))
    if len(room.question_history) > 200:
        room.question_history = room.question_history[-200:]


def ensure_player_stat_entry(
    room: RoomRuntime,
    player: PlayerConnection,
) -> dict[str, Any]:
    existing = room.player_stats.get(player.peer_id)
    if isinstance(existing, dict):
        stat = existing
    else:
        stat = {
            "peerId": player.peer_id,
            "accountUserId": int(player.auth_user_id) if player.auth_user_id is not None else None,
            "name": player.name,
            "team": player.team,
            "answers": 0,
            "correctAnswers": 0,
            "wrongAnswers": 0,
            "skippedAnswers": 0,
            "points": 0,
            "totalResponseMs": 0,
            "fastestResponseMs": None,
            "lastAnsweredAt": None,
        }
        room.player_stats[player.peer_id] = stat

    stat["name"] = player.name
    stat["team"] = player.team
    stat["accountUserId"] = int(player.auth_user_id) if player.auth_user_id is not None else None
    return stat


def record_player_answer_stat(
    room: RoomRuntime,
    player: PlayerConnection,
    *,
    is_correct: bool,
    points_awarded: int,
    remaining_ms: int = 0,
    answered_at: int | None = None,
) -> dict[str, Any]:
    stat = ensure_player_stat_entry(room, player)
    answers = max(0, int(stat.get("answers", 0) or 0)) + 1
    stat["answers"] = answers
    if is_correct:
        stat["correctAnswers"] = max(0, int(stat.get("correctAnswers", 0) or 0)) + 1
    else:
        stat["wrongAnswers"] = max(0, int(stat.get("wrongAnswers", 0) or 0)) + 1
    safe_points = max(0, int(points_awarded or 0))
    if safe_points:
        stat["points"] = max(0, int(stat.get("points", 0) or 0)) + safe_points

    response_ms = max(0, QUESTION_TIME_MS - max(0, int(remaining_ms or 0)))
    stat["totalResponseMs"] = max(0, int(stat.get("totalResponseMs", 0) or 0)) + response_ms
    fastest_raw = stat.get("fastestResponseMs")
    if fastest_raw is None:
        stat["fastestResponseMs"] = response_ms
    else:
        stat["fastestResponseMs"] = min(int(fastest_raw), response_ms)
    stat["lastAnsweredAt"] = int(answered_at or now_ms())
    return stat


def record_player_skip_stat(room: RoomRuntime, player: PlayerConnection) -> dict[str, Any]:
    stat = ensure_player_stat_entry(room, player)
    stat["skippedAnswers"] = max(0, int(stat.get("skippedAnswers", 0) or 0)) + 1
    return stat


def initialize_result_tracking(room: RoomRuntime) -> None:
    room.player_stats = {}
    room.question_history = []
    room.event_history = []
    for player in room.players.values():
        if player.is_host or player.is_spectator:
            continue
        ensure_player_stat_entry(room, player)


def sync_player_stats_metadata(room: RoomRuntime) -> None:
    for player in room.players.values():
        stat = room.player_stats.get(player.peer_id)
        if not isinstance(stat, dict):
            continue
        stat["name"] = player.name
        stat["team"] = player.team
        stat["accountUserId"] = int(player.auth_user_id) if player.auth_user_id is not None else None
