from __future__ import annotations

from typing import Any, cast

from .runtime_constants import TEAM_KEYS
from .runtime_types import Phase, RoomRuntime, SkipRequestStatus, Team
from .runtime_utils import (
    clamp_question_count,
    create_mock_questions,
    normalize_difficulty_mode,
    normalize_game_mode,
    normalize_team_name,
    normalize_topic,
    sanitize_team_name,
)


def phase_deadline_epoch_ms(room: RoomRuntime) -> int | None:
    if room.phase == "question":
        return as_optional_int(room.question_ends_at)
    if room.phase == "team-reveal":
        return as_optional_int(room.team_reveal_ends_at)
    if room.phase == "captain-vote":
        return as_optional_int(room.captain_vote_ends_at)
    if room.phase == "team-naming":
        return as_optional_int(room.team_naming_ends_at)
    if room.phase == "reveal":
        return as_optional_int(room.reveal_ends_at)
    if room.phase == "host-reconnect":
        return as_optional_int(room.host_reconnect_ends_at)
    return None


def apply_snapshot(room: RoomRuntime, state: dict[str, Any]) -> None:
    if not isinstance(state, dict):
        return

    room.topic = normalize_topic(state.get("topic", room.topic))
    room.difficulty_mode = normalize_difficulty_mode(
        state.get("difficultyMode", room.difficulty_mode)
    )
    room.game_mode = normalize_game_mode(state.get("gameMode", room.game_mode))
    room.question_count = clamp_question_count(state.get("questionCount", room.question_count))

    questions_raw = state.get("questions")
    if isinstance(questions_raw, list) and questions_raw:
        room.questions = [q for q in questions_raw if isinstance(q, dict)]
    else:
        room.questions = create_mock_questions(room.topic, room.question_count, room.difficulty_mode)

    phase_raw = state.get("phase")
    if phase_raw in {
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
        room.phase = cast(Phase, phase_raw)

    room.current_question_index = int(state.get("currentQuestionIndex", room.current_question_index))

    active_team_raw = state.get("activeTeam")
    if active_team_raw in TEAM_KEYS:
        room.active_team = cast(Team, active_team_raw)

    room.question_ends_at = as_optional_int(state.get("questionEndsAt"))
    room.team_reveal_ends_at = as_optional_int(state.get("teamRevealEndsAt"))
    room.captain_vote_ends_at = as_optional_int(state.get("captainVoteEndsAt"))
    room.team_naming_ends_at = as_optional_int(state.get("teamNamingEndsAt"))
    room.reveal_ends_at = as_optional_int(state.get("revealEndsAt"))
    room.host_reconnect_ends_at = as_optional_int(state.get("hostReconnectEndsAt"))

    room.disconnected_host_name = (
        str(state.get("disconnectedHostName"))
        if state.get("disconnectedHostName") is not None
        else None
    )
    room.disconnected_host_expected_name = (
        str(state.get("disconnectedHostExpectedName"))
        if state.get("disconnectedHostExpectedName") is not None
        else None
    )
    room.host_token_hash = str(state.get("hostTokenHash") or room.host_token_hash or "")
    room.room_password_hash = str(state.get("roomPasswordHash") or room.room_password_hash or "")
    room.paused_state = state.get("pausedState") if isinstance(state.get("pausedState"), dict) else None
    room.manual_pause_by_name = (
        str(state.get("manualPauseByName"))
        if state.get("manualPauseByName") is not None
        else None
    )
    room.active_answer = state.get("activeAnswer") if isinstance(state.get("activeAnswer"), dict) else None

    answer_submissions_raw = state.get("answerSubmissions")
    if isinstance(answer_submissions_raw, dict):
        room.answer_submissions = {
            str(peer_id): dict(payload)
            for peer_id, payload in answer_submissions_raw.items()
            if isinstance(peer_id, str) and isinstance(payload, dict)
        }
    else:
        room.answer_submissions = {}

    skip_requesters_raw = state.get("skipRequesters")
    if isinstance(skip_requesters_raw, list):
        room.skip_requesters = {
            str(peer_id) for peer_id in skip_requesters_raw if isinstance(peer_id, str) and peer_id
        }
    else:
        room.skip_requesters = set()

    skip_request_status_raw = str(state.get("skipRequestStatus") or "idle").lower()
    if skip_request_status_raw in {"idle", "pending", "rejected"}:
        room.skip_request_status = cast(SkipRequestStatus, skip_request_status_raw)
    else:
        room.skip_request_status = "idle"

    room.skip_request_message_id = (
        str(state.get("skipRequestMessageId"))
        if state.get("skipRequestMessageId") is not None
        else None
    )
    room.last_reveal = state.get("lastReveal") if isinstance(state.get("lastReveal"), dict) else None

    scores = state.get("scores")
    if isinstance(scores, dict):
        room.scores = {
            "A": int(scores.get("A", 0) or 0),
            "B": int(scores.get("B", 0) or 0),
        }

    player_scores_raw = state.get("playerScores")
    if isinstance(player_scores_raw, dict):
        room.player_scores = {
            str(peer_id): int(score or 0)
            for peer_id, score in player_scores_raw.items()
            if isinstance(peer_id, str)
        }
    else:
        room.player_scores = {}

    player_stats_raw = state.get("playerStats")
    if isinstance(player_stats_raw, dict):
        room.player_stats = {
            str(peer_id): dict(payload)
            for peer_id, payload in player_stats_raw.items()
            if isinstance(peer_id, str) and isinstance(payload, dict)
        }
    else:
        room.player_stats = {}

    question_history_raw = state.get("questionHistory")
    if isinstance(question_history_raw, list):
        room.question_history = [item for item in question_history_raw if isinstance(item, dict)][-200:]
    else:
        room.question_history = []

    event_history_raw = state.get("eventHistory")
    if isinstance(event_history_raw, list):
        room.event_history = [item for item in event_history_raw if isinstance(item, dict)][-300:]
    else:
        room.event_history = []

    chat_raw = state.get("chat")
    if isinstance(chat_raw, list):
        room.chat = [item for item in chat_raw if isinstance(item, dict)][-100:]

    chat_moderation_strikes_raw = state.get("chatModerationStrikes")
    if isinstance(chat_moderation_strikes_raw, dict):
        room.chat_moderation_strikes = {
            str(peer_id): max(0, int(value or 0))
            for peer_id, value in chat_moderation_strikes_raw.items()
            if isinstance(peer_id, str)
        }
    else:
        room.chat_moderation_strikes = {}

    captains = state.get("captains")
    if isinstance(captains, dict):
        room.captains = {
            "A": str(captains.get("A")) if captains.get("A") else None,
            "B": str(captains.get("B")) if captains.get("B") else None,
        }

    captain_votes = state.get("captainVotes")
    if isinstance(captain_votes, dict):
        room.captain_votes = {
            "A": sanitize_vote_map(captain_votes.get("A")),
            "B": sanitize_vote_map(captain_votes.get("B")),
        }

    captain_ballots = state.get("captainBallots")
    if isinstance(captain_ballots, dict):
        room.captain_ballots = {
            "A": sanitize_ballot_map(captain_ballots.get("A")),
            "B": sanitize_ballot_map(captain_ballots.get("B")),
        }

    captain_ready = state.get("captainVoteReadyTeams")
    if isinstance(captain_ready, dict):
        room.captain_vote_ready_teams = {
            "A": bool(captain_ready.get("A")),
            "B": bool(captain_ready.get("B")),
        }

    naming_ready = state.get("teamNamingReadyTeams")
    if isinstance(naming_ready, dict):
        room.team_naming_ready_teams = {
            "A": bool(naming_ready.get("A")),
            "B": bool(naming_ready.get("B")),
        }

    team_names = state.get("teamNames")
    if isinstance(team_names, dict):
        room.team_names = {
            "A": sanitize_team_name(team_names.get("A"), "Команда A"),
            "B": sanitize_team_name(team_names.get("B"), "Команда B"),
        }

    used_team_names = state.get("usedTeamNames")
    if isinstance(used_team_names, list):
        room.used_team_names = {
            normalize_team_name(str(name)) for name in used_team_names if str(name).strip()
        }

    state_version = as_optional_int(state.get("stateVersion"))
    if state_version is not None:
        room.state_version = max(1, state_version)
    else:
        room.state_version = max(1, int(getattr(room, "state_version", 1) or 1))


def serialize_snapshot(room: RoomRuntime) -> dict[str, Any]:
    players_payload = [
        {
            "peerId": p.peer_id,
            "name": p.name,
            "team": p.team,
            "isHost": p.is_host,
            "isSpectator": p.is_spectator,
            "isCaptain": p.is_captain,
            "avatar": p.avatar,
        }
        for p in room.players.values()
    ]

    return {
        "stateVersion": max(1, int(getattr(room, "state_version", 1) or 1)),
        "lastEventId": len(room.event_history),
        "deadlineEpochMs": phase_deadline_epoch_ms(room),
        "topic": room.topic,
        "difficultyMode": room.difficulty_mode,
        "gameMode": room.game_mode,
        "questionCount": room.question_count,
        "questions": room.questions,
        "phase": room.phase,
        "currentQuestionIndex": room.current_question_index,
        "activeTeam": room.active_team,
        "questionEndsAt": room.question_ends_at,
        "teamRevealEndsAt": room.team_reveal_ends_at,
        "captainVoteEndsAt": room.captain_vote_ends_at,
        "teamNamingEndsAt": room.team_naming_ends_at,
        "revealEndsAt": room.reveal_ends_at,
        "hostReconnectEndsAt": room.host_reconnect_ends_at,
        "hostTokenHash": room.host_token_hash,
        "roomPasswordHash": room.room_password_hash,
        "disconnectedHostName": room.disconnected_host_name,
        "disconnectedHostExpectedName": room.disconnected_host_expected_name,
        "pausedState": room.paused_state,
        "manualPauseByName": room.manual_pause_by_name,
        "activeAnswer": room.active_answer,
        "answerSubmissions": room.answer_submissions,
        "skipRequesters": sorted(room.skip_requesters),
        "skipRequestStatus": room.skip_request_status,
        "skipRequestMessageId": room.skip_request_message_id,
        "lastReveal": room.last_reveal,
        "scores": room.scores,
        "playerScores": room.player_scores,
        "playerStats": room.player_stats,
        "questionHistory": room.question_history,
        "eventHistory": room.event_history,
        "chat": room.chat,
        "chatModerationStrikes": room.chat_moderation_strikes,
        "captains": room.captains,
        "captainVotes": room.captain_votes,
        "captainBallots": room.captain_ballots,
        "captainVoteReadyTeams": room.captain_vote_ready_teams,
        "teamNamingReadyTeams": room.team_naming_ready_teams,
        "teamNames": room.team_names,
        "usedTeamNames": sorted(room.used_team_names),
        "players": players_payload,
    }


def sanitize_vote_map(raw: Any) -> dict[str, int]:
    if not isinstance(raw, dict):
        return {}
    output: dict[str, int] = {}
    for key, value in raw.items():
        if not isinstance(key, str):
            continue
        try:
            output[key] = max(0, int(value))
        except (TypeError, ValueError):
            continue
    return output


def sanitize_ballot_map(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    output: dict[str, str] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not isinstance(value, str):
            continue
        output[key] = value
    return output


def as_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
