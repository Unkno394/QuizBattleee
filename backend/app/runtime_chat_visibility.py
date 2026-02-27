from __future__ import annotations

from typing import Any

from .runtime_types import PlayerConnection, RoomRuntime


def can_player_see_message(
    player: PlayerConnection,
    room: RoomRuntime,
    message: dict[str, Any],
) -> bool:
    visibility = str(message.get("visibility") or "all")
    kind = str(message.get("kind") or "")
    if kind == "presence" and visibility == "all":
        return True
    if kind == "skip-request" and visibility == "all":
        return True
    if visibility == "host":
        return player.is_host or player.is_spectator

    if room.game_mode == "ffa" and room.phase == "question":
        if player.is_host or player.is_spectator:
            return True
        return player.peer_id in room.answer_submissions

    if room.phase == "manual-pause":
        return True

    if player.is_host or player.is_spectator:
        return True

    if room.game_mode == "ffa":
        return True
    if room.game_mode == "chaos":
        return visibility == "all" or player.team == visibility

    if room.phase == "question":
        if player.team != room.active_team:
            return False
        return visibility in {"all", room.active_team}

    if visibility == "all":
        return True
    return player.team == visibility
