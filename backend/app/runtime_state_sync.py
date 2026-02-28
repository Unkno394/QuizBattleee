from __future__ import annotations

from typing import Any, Callable, Iterable

from .runtime_snapshot import phase_deadline_epoch_ms
from .runtime_types import PlayerConnection, RoomRuntime


def upsert_skip_request_host_message(
    room: RoomRuntime,
    *,
    non_host_players: Iterable[PlayerConnection],
    now_ms: Callable[[], int],
    random_id: Callable[[], str],
) -> None:
    if room.phase != "question":
        room.skip_requesters = set()
        room.skip_request_status = "idle"
        room.skip_request_message_id = None
        return

    requesters = [
        player.name
        for player in non_host_players
        if player.peer_id in room.skip_requesters
    ]

    if room.skip_request_status == "pending" and not requesters:
        room.skip_request_status = "idle"

    if room.skip_request_status == "rejected":
        text = "Запрос на пропуск вопроса отклонён."
    elif room.skip_request_status == "pending":
        if len(requesters) == 1:
            text = f'Участник {requesters[0]} попросил пропустить вопрос.'
        elif requesters:
            text = f'Участники {", ".join(requesters)} попросили пропустить вопрос.'
        else:
            text = ""
    else:
        text = ""

    if not text:
        if room.skip_request_message_id:
            room.chat = [
                message
                for message in room.chat
                if str(message.get("id") or "") != room.skip_request_message_id
            ]
        room.skip_request_message_id = None
        return

    now_value = now_ms()
    if room.skip_request_message_id:
        for message in room.chat:
            if str(message.get("id") or "") == room.skip_request_message_id:
                message["text"] = text
                message["timestamp"] = now_value
                message["visibility"] = "all"
                message["kind"] = "skip-request"
                return

    message_id = random_id()
    room.skip_request_message_id = message_id
    room.chat.append(
        {
            "id": message_id,
            "from": "system",
            "name": "Система",
            "text": text,
            "timestamp": now_value,
            "visibility": "all",
            "kind": "skip-request",
        }
    )
    if len(room.chat) > 100:
        room.chat = room.chat[-100:]
        if not any(
            str(message.get("id") or "") == room.skip_request_message_id for message in room.chat
        ):
            room.skip_request_message_id = None


def build_state_payload(
    room: RoomRuntime,
    viewer: PlayerConnection,
    *,
    now_ms: Callable[[], int],
    visible_team_for_viewer: Callable[[RoomRuntime, PlayerConnection, PlayerConnection], Any],
    can_player_see_message: Callable[[PlayerConnection, RoomRuntime, dict[str, Any]], bool],
    build_question_for_viewer: Callable[[RoomRuntime, PlayerConnection], dict[str, Any] | None],
    build_reveal_for_viewer: Callable[[RoomRuntime, PlayerConnection], dict[str, Any] | None],
    build_answer_progress: Callable[[RoomRuntime], dict[str, int] | None],
    build_ffa_answer_for_viewer: Callable[[RoomRuntime, PlayerConnection], dict[str, Any] | None],
    build_ffa_pending_players_for_viewer: Callable[[RoomRuntime, PlayerConnection], list[str]],
    build_chaos_progress_for_viewer: Callable[[RoomRuntime, PlayerConnection], dict[str, Any] | None],
    build_skip_request_for_viewer: Callable[[RoomRuntime, PlayerConnection], dict[str, Any] | None],
    build_results_summary: Callable[[RoomRuntime, PlayerConnection], dict[str, Any] | None],
    build_votes_for_viewer: Callable[[RoomRuntime, PlayerConnection], dict[str, Any]],
    get_viewer_captain_vote: Callable[[RoomRuntime, PlayerConnection], str | None],
    build_captain_vote_progress: Callable[[RoomRuntime], dict[str, Any]],
) -> dict[str, Any]:
    players_payload = []
    for player in room.players.values():
        players_payload.append(
            {
                "peerId": player.peer_id,
                "authUserId": player.auth_user_id,
                "name": player.name,
                "team": visible_team_for_viewer(room, viewer, player),
                "isHost": player.is_host,
                "isSpectator": player.is_spectator,
                "isCaptain": player.is_captain,
                "avatar": player.avatar,
                "profileFrame": player.profile_frame,
                "mascotSkins": {
                    "cat": player.mascot_skin_cat,
                    "dog": player.mascot_skin_dog,
                },
                "victoryEffects": {
                    "front": player.victory_effect_front,
                    "back": player.victory_effect_back,
                },
            }
        )

    chat_payload = []
    for message in room.chat[-100:]:
        if not can_player_see_message(viewer, room, message):
            continue
        chat_payload.append(
            {
                "id": message.get("id"),
                "from": message.get("from"),
                "name": message.get("name"),
                "text": message.get("text"),
                "timestamp": message.get("timestamp"),
                "kind": message.get("kind"),
            }
        )

    current_question = build_question_for_viewer(room, viewer)
    answer_progress = build_answer_progress(room)
    my_answer = build_ffa_answer_for_viewer(room, viewer)
    pending_players = build_ffa_pending_players_for_viewer(room, viewer)
    chaos_progress = build_chaos_progress_for_viewer(room, viewer)
    skip_request = build_skip_request_for_viewer(room, viewer)
    results_summary = build_results_summary(room, viewer)

    return {
        "type": "state-sync",
        "serverTime": now_ms(),
        "room": {
            "roomId": room.room_id,
            "topic": room.topic,
            "difficultyMode": room.difficulty_mode,
            "gameMode": room.game_mode,
            "questionCount": room.question_count,
            "stateVersion": max(1, int(getattr(room, "state_version", 1) or 1)),
            "lastEventId": len(room.event_history),
            "deadlineEpochMs": phase_deadline_epoch_ms(room),
            "phase": room.phase,
            "currentQuestionIndex": room.current_question_index,
            "activeTeam": room.active_team,
            "questionEndsAt": room.question_ends_at,
            "teamRevealEndsAt": room.team_reveal_ends_at,
            "captainVoteEndsAt": room.captain_vote_ends_at,
            "teamNamingEndsAt": room.team_naming_ends_at,
            "hostReconnectEndsAt": room.host_reconnect_ends_at,
            "disconnectedHostName": room.disconnected_host_name,
            "manualPauseByName": room.manual_pause_by_name,
            "scores": room.scores,
            "playerScores": room.player_scores,
            "hasPassword": bool(room.is_password_protected or room.room_password_hash),
            "teamNames": room.team_names,
            "captains": room.captains,
            "captainVotes": build_votes_for_viewer(room, viewer),
            "myCaptainVote": get_viewer_captain_vote(room, viewer),
            "captainVoteReadyTeams": room.captain_vote_ready_teams,
            "captainVoteProgress": build_captain_vote_progress(room),
            "teamNamingReadyTeams": room.team_naming_ready_teams,
            "players": players_payload,
            "currentQuestion": current_question,
            "lastReveal": build_reveal_for_viewer(room, viewer),
            "answerProgress": answer_progress,
            "myAnswer": my_answer,
            "pendingPlayers": pending_players,
            "chaosProgress": chaos_progress,
            "skipRequest": skip_request,
            "resultsSummary": results_summary,
            "chat": chat_payload,
        },
    }
