from __future__ import annotations

import logging
from typing import TYPE_CHECKING, cast

from .runtime_constants import HOST_RECONNECT_WAIT_MS
from .runtime_utils import normalize_player_name, now_ms

if TYPE_CHECKING:
    from .runtime import QuizRuntime
    from .runtime_types import Phase, PlayerConnection, RoomRuntime

logger = logging.getLogger(__name__)


def get_phase_remaining_ms_for_pause(runtime: "QuizRuntime", room: "RoomRuntime", phase: "Phase") -> int:
    now_value = now_ms()

    if phase == "question":
        return max(0, (room.question_ends_at or 0) - now_value)
    if phase == "team-reveal":
        return max(0, (room.team_reveal_ends_at or 0) - now_value)
    if phase == "captain-vote":
        return max(0, (room.captain_vote_ends_at or 0) - now_value)
    if phase == "team-naming":
        return max(0, (room.team_naming_ends_at or 0) - now_value)
    if phase == "reveal":
        return max(0, (room.reveal_ends_at or 0) - now_value)

    return 0


def schedule_phase_timer(runtime: "QuizRuntime", room: "RoomRuntime", phase: "Phase", remaining_ms: int) -> None:
    delay = max(120, int(remaining_ms or 0))
    ends_at = now_ms() + delay

    if phase == "question":
        room.question_ends_at = ends_at
        runtime._schedule_timer(room, "question", delay, runtime._finalize_question)
        return

    if phase == "team-reveal":
        room.team_reveal_ends_at = ends_at
        runtime._schedule_timer(room, "teamReveal", delay, runtime._after_team_reveal)
        return

    if phase == "captain-vote":
        room.captain_vote_ends_at = ends_at
        runtime._schedule_timer(room, "captainVote", delay, runtime._finalize_captain_vote)
        return

    if phase == "team-naming":
        room.team_naming_ends_at = ends_at
        runtime._schedule_timer(room, "teamNaming", delay, runtime._finalize_team_naming)
        return

    if phase == "reveal":
        room.reveal_ends_at = ends_at
        runtime._schedule_timer(room, "reveal", delay, runtime._advance_after_reveal)


async def resume_after_host_reconnect(runtime: "QuizRuntime", room: "RoomRuntime") -> None:
    if room.paused_state is None:
        room.host_reconnect_ends_at = None
        room.disconnected_host_name = None
        room.disconnected_host_expected_name = None
        runtime._increment_stat("hostReconnectResume")
        runtime._log_ws_event("host_reconnect_resume", roomId=room.room_id, resumedPhase=room.phase)
        await runtime._broadcast_and_persist(room)
        return

    runtime._clear_timers(room)

    snapshot = room.paused_state
    snapshot_phase_raw = snapshot.get("phase")
    if snapshot_phase_raw not in {
        "lobby",
        "team-reveal",
        "captain-vote",
        "team-naming",
        "question",
        "reveal",
        "results",
        "host-reconnect",
        "manual-pause",
    }:
        snapshot_phase_raw = "lobby"

    snapshot_phase = cast("Phase", snapshot_phase_raw)
    snapshot_remaining_ms = int(snapshot.get("remainingMs", 0) or 0)

    room.phase = snapshot_phase
    room.host_reconnect_ends_at = None
    room.disconnected_host_name = None
    room.disconnected_host_expected_name = None
    room.paused_state = None
    room.manual_pause_by_name = None
    runtime._increment_stat("hostReconnectResume")
    runtime._log_ws_event("host_reconnect_resume", roomId=room.room_id, resumedPhase=snapshot_phase)

    room.question_ends_at = None
    room.team_reveal_ends_at = None
    room.captain_vote_ends_at = None
    room.team_naming_ends_at = None
    room.reveal_ends_at = None

    runtime._schedule_phase_timer(room, snapshot_phase, snapshot_remaining_ms)
    await runtime._broadcast_and_persist(room)


def assign_new_host(
    runtime: "QuizRuntime",
    room: "RoomRuntime",
    old_host_identity: str | None = None,
) -> "PlayerConnection | None":
    candidate: PlayerConnection | None = None
    fallback_candidate: PlayerConnection | None = None
    for player in room.players.values():
        player.is_host = False
        if fallback_candidate is None:
            fallback_candidate = player
        if candidate is None and not player.is_spectator:
            candidate = player

    if candidate is None:
        candidate = fallback_candidate

    if candidate is None:
        return None

    candidate.is_host = True
    candidate.is_spectator = False
    room.host_peer_id = candidate.peer_id
    if room.phase == "lobby":
        candidate.team = None
    runtime._increment_stat("hostReassigned")
    logger.error(
        "[HOST_REASSIGNED] room=%s old_host=%s new_host=%s phase=%s",
        room.room_id,
        runtime._identity_for_logs(old_host_identity),
        runtime._identity_for_logs(candidate.identity_key),
        room.phase,
    )
    runtime._log_ws_event("host_reassigned", roomId=room.room_id, newHostPeerId=candidate.peer_id)
    return candidate


def should_pause_on_host_disconnect(phase: "Phase") -> bool:
    return phase in {
        "lobby",
        "team-reveal",
        "captain-vote",
        "team-naming",
        "question",
        "reveal",
    }


async def pause_for_host_reconnect(
    runtime: "QuizRuntime",
    room: "RoomRuntime",
    host_name: str | None,
    host_identity: str | None = None,
) -> bool:
    if not runtime._should_pause_on_host_disconnect(room.phase):
        return False

    previous_phase = room.phase
    remaining_ms = runtime._get_phase_remaining_ms_for_pause(room, previous_phase)

    runtime._clear_timers(room)

    room.paused_state = {
        "phase": previous_phase,
        "remainingMs": remaining_ms,
    }
    room.phase = "host-reconnect"
    room.question_ends_at = None
    room.team_reveal_ends_at = None
    room.captain_vote_ends_at = None
    room.team_naming_ends_at = None
    room.reveal_ends_at = None
    room.host_reconnect_ends_at = now_ms() + HOST_RECONNECT_WAIT_MS
    room.manual_pause_by_name = None
    room.disconnected_host_name = host_name or "Ведущий"
    room.disconnected_host_expected_name = normalize_player_name(host_name)
    logger.warning(
        "[HOST_PAUSE] room=%s phase=%s remaining=%.2f host_identity=%s",
        room.room_id,
        previous_phase,
        max(0.0, float(remaining_ms)) / 1000.0,
        runtime._identity_for_logs(host_identity),
    )
    runtime._increment_stat("hostReconnectPause")
    runtime._log_ws_event(
        "host_reconnect_pause",
        roomId=room.room_id,
        phase=previous_phase,
        hostName=room.disconnected_host_name,
        timeoutMs=HOST_RECONNECT_WAIT_MS,
    )

    await runtime._broadcast_and_persist(room)

    async def after_reconnect_timeout(inner_room: "RoomRuntime") -> None:
        if inner_room.phase != "host-reconnect":
            return
        runtime._assign_new_host(inner_room, old_host_identity=host_identity)
        await runtime._resume_after_host_reconnect(inner_room)

    runtime._schedule_timer(
        room,
        "hostReconnect",
        HOST_RECONNECT_WAIT_MS,
        after_reconnect_timeout,
    )

    return True
