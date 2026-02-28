from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .runtime_constants import TEAM_KEYS
from .runtime_utils import normalize_team_name, now_ms, random_id, sanitize_team_name

if TYPE_CHECKING:
    from .runtime import QuizRuntime
    from .runtime_types import PlayerConnection, RoomRuntime


async def handle_message(
    runtime: "QuizRuntime",
    room: "RoomRuntime",
    player: "PlayerConnection",
    data: dict[str, Any],
) -> None:
    message_type = data.get("type")

    if message_type == "ping":
        runtime._increment_stat("pingReceived")
        await runtime._send_safe(
            player.websocket,
            {"type": "pong", "serverTime": now_ms()},
            room_id=room.room_id,
            peer_id=player.peer_id,
        )
        return

    if message_type == "refresh-profile-assets":
        if player.auth_user_id is None:
            return
        await runtime._refresh_connected_player_assets(room, player)
        return

    if message_type == "toggle-pause":
        if not player.is_host:
            return
        if room.phase == "host-reconnect":
            return
        if room.phase == "manual-pause":
            await runtime._resume_game_by_host(room, player)
            return
        await runtime._pause_game_by_host(room, player)
        return

    if message_type == "start-game":
        if not player.is_host or room.phase != "lobby":
            return
        await runtime._start_game(room)
        return

    if message_type == "vote-captain":
        if room.game_mode != "classic":
            return
        if room.phase != "captain-vote":
            return
        if player.is_host or not player.team:
            return
        if room.captain_vote_ready_teams[player.team]:
            return

        candidate_peer_id = str(data.get("candidatePeerId") or "")
        if candidate_peer_id == player.peer_id:
            return
        candidate = room.players.get(candidate_peer_id)
        if not candidate or candidate.is_host or candidate.team != player.team:
            return

        team = player.team
        previous_candidate = room.captain_ballots[team].get(player.peer_id)
        if previous_candidate:
            current_count = room.captain_votes[team].get(previous_candidate, 0)
            next_count = max(0, current_count - 1)
            if next_count == 0:
                room.captain_votes[team].pop(previous_candidate, None)
            else:
                room.captain_votes[team][previous_candidate] = next_count

        room.captain_ballots[team][player.peer_id] = candidate_peer_id
        room.captain_votes[team][candidate_peer_id] = (
            room.captain_votes[team].get(candidate_peer_id, 0) + 1
        )

        runtime._refresh_captain_vote_progress(room)
        runtime._schedule_single_member_auto_captain(room)
        if runtime._are_all_teams_ready(room.captain_vote_ready_teams):
            await runtime._finalize_captain_vote(room)
            return

        await runtime._broadcast_and_persist(room)
        return

    if message_type == "set-team-name":
        if room.phase != "team-naming":
            return
        if not player.team:
            return
        can_set_team_name = player.is_captain if room.game_mode == "classic" else not player.is_host
        if not can_set_team_name:
            return
        if room.team_naming_ready_teams[player.team]:
            return

        fallback = "Команда A" if player.team == "A" else "Команда B"
        next_name = sanitize_team_name(data.get("name"), fallback)
        room.team_names[player.team] = next_name
        room.used_team_names.add(normalize_team_name(next_name))
        room.team_naming_ready_teams[player.team] = True

        if runtime._are_all_teams_ready(room.team_naming_ready_teams):
            await runtime._finalize_team_naming(room)
            return

        await runtime._broadcast_and_persist(room)
        return

    if message_type == "random-team-name":
        if room.phase != "team-naming":
            return
        if not player.team:
            return
        can_set_team_name = player.is_captain if room.game_mode == "classic" else not player.is_host
        if not can_set_team_name:
            return
        if room.team_naming_ready_teams[player.team]:
            return

        fallback = "Команда A" if player.team == "A" else "Команда B"
        random_name = runtime._get_random_unique_team_name(room, fallback)
        room.team_names[player.team] = random_name
        room.team_naming_ready_teams[player.team] = True

        if runtime._are_all_teams_ready(room.team_naming_ready_teams):
            await runtime._finalize_team_naming(room)
            return

        await runtime._broadcast_and_persist(room)
        return

    if message_type == "submit-answer":
        if room.phase != "question":
            return
        if player.is_spectator:
            return

        answer_index_raw = data.get("answerIndex")
        if not isinstance(answer_index_raw, int):
            try:
                answer_index_raw = int(answer_index_raw)
            except (TypeError, ValueError):
                return

        if room.game_mode == "classic":
            if player.team != room.active_team:
                return
            if not player.is_captain:
                return
            if room.active_answer is not None:
                return

            room.active_answer = {
                "selectedIndex": answer_index_raw,
                "byPeerId": player.peer_id,
                "byName": player.name,
            }
            await runtime._finalize_question(room)
            return

        if room.game_mode == "chaos":
            if player.is_host or player.team not in TEAM_KEYS:
                return
        elif room.game_mode == "ffa":
            if player.is_host:
                return

        if room.answer_submissions.get(player.peer_id):
            return

        room.answer_submissions[player.peer_id] = {
            "selectedIndex": answer_index_raw,
            "byPeerId": player.peer_id,
            "byName": player.name,
            "answeredAt": now_ms(),
        }

        eligible_players = runtime._answer_eligible_players(room)
        if eligible_players and len(room.answer_submissions) >= len(eligible_players):
            await runtime._finalize_question(room)
        else:
            await runtime._broadcast_and_persist(room)
        return

    if message_type == "skip-question":
        if not player.is_host:
            return
        if room.phase != "question":
            return
        await runtime._skip_question_by_host(room, player)
        return

    if message_type == "request-skip-question":
        if room.phase != "question":
            return
        if player.is_host or player.is_spectator:
            return
        if room.skip_request_status == "rejected":
            return
        if player.peer_id in room.skip_requesters:
            return
        room.skip_requesters.add(player.peer_id)
        room.skip_request_status = "pending"
        runtime._upsert_skip_request_host_message(room)
        await runtime._broadcast_and_persist(room)
        return

    if message_type == "resolve-skip-request":
        if room.phase != "question":
            return
        if not player.is_host:
            return

        decision = str(data.get("decision") or "").strip().lower()
        if decision == "approve":
            if room.skip_request_status != "pending" or not room.skip_requesters:
                return
            await runtime._skip_question_by_host(room, player)
            return

        if decision == "reject":
            if room.skip_request_status != "pending":
                return
            room.skip_request_status = "rejected"
            runtime._upsert_skip_request_host_message(room)
            await runtime._broadcast_and_persist(room)
            return

    if message_type == "new-game":
        if not player.is_host:
            return
        await runtime._reset_game(room)
        return

    if message_type == "moderate-chat-message":
        if not player.is_host:
            return
        if room.phase == "lobby":
            return
        message_id = str(data.get("messageId") or "").strip()
        await runtime._moderate_chat_message(room, player, message_id)
        return

    if message_type == "send-chat":
        if player.is_spectator:
            return
        text = str(data.get("text") or "").strip()[:280]
        if not text:
            return

        if room.phase == "question":
            if room.game_mode == "ffa":
                if not (player.is_host or player.is_spectator) and player.peer_id not in room.answer_submissions:
                    return
            elif room.game_mode == "chaos":
                if player.is_host or player.is_spectator or not player.team:
                    return
            elif player.is_host or player.is_spectator or not player.team or player.team != room.active_team:
                return

        visibility: str = (
            "all"
            if room.phase != "question" or room.game_mode in {"ffa", "chaos"}
            else room.active_team
        )
        room.chat.append(
            {
                "id": random_id(),
                "from": player.peer_id,
                "name": player.name,
                "text": text,
                "timestamp": now_ms(),
                "visibility": visibility,
            }
        )
        if len(room.chat) > 100:
            room.chat = room.chat[-100:]

        await runtime._broadcast_and_persist(room)
    if message_type == "invite-friend-to-room":
        # Security hardening: room invitations must go through HTTP endpoints
        # with strict auth/host/friendship checks in api/friends.py.
        return
