from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from .runtime_constants import (
    BASE_CORRECT_POINTS,
    REVEAL_TIME_MS,
    SKIP_REVEAL_TIME_MS,
    TEAM_KEYS,
)
from .runtime_utils import calculate_speed_bonus, now_ms, random_id

if TYPE_CHECKING:
    from .runtime import QuizRuntime
    from .runtime_types import PlayerConnection, RoomRuntime, Team


async def finalize_question(runtime: "QuizRuntime", room: "RoomRuntime") -> None:
    if room.phase != "question" or room.current_question_index < 0:
        return

    runtime._cancel_timer(room, "question")

    if room.current_question_index >= len(room.questions):
        return

    question = room.questions[room.current_question_index]
    correct_index = question.get("correctIndex")
    question_ends_at = room.question_ends_at
    fallback_remaining_ms = (
        max(0, question_ends_at - now_ms()) if question_ends_at is not None else 0
    )

    if room.game_mode == "ffa":
        participants = runtime._active_non_host_players(room)
        question_player_results: list[dict[str, Any]] = []
        total_points_awarded = 0
        for participant in participants:
            submission = room.answer_submissions.get(participant.peer_id) or {}
            selected_index_raw = submission.get("selectedIndex")
            selected_index = selected_index_raw if isinstance(selected_index_raw, int) else None
            answered_at = (
                int(submission.get("answeredAt"))
                if isinstance(submission.get("answeredAt"), int)
                else None
            )
            remaining_ms = (
                max(0, question_ends_at - answered_at)
                if question_ends_at is not None and answered_at is not None
                else 0
            )
            if selected_index is None:
                runtime._record_player_skip_stat(room, participant)
                total_score = int(room.player_scores.get(participant.peer_id, 0) or 0)
                question_player_results.append(
                    {
                        "peerId": participant.peer_id,
                        "name": participant.name,
                        "team": participant.team,
                        "selectedIndex": None,
                        "isCorrect": False,
                        "basePoints": 0,
                        "speedBonus": 0,
                        "timeRemainingMs": 0,
                        "pointsAwarded": 0,
                        "totalScore": total_score,
                        "status": "timeout",
                    }
                )
                continue

            is_correct = selected_index == correct_index
            speed_bonus = calculate_speed_bonus(remaining_ms) if is_correct else 0
            base_points = BASE_CORRECT_POINTS if is_correct else 0
            points_awarded = base_points + speed_bonus
            if points_awarded > 0:
                room.player_scores[participant.peer_id] = (
                    int(room.player_scores.get(participant.peer_id, 0)) + points_awarded
                )
            total_points_awarded += points_awarded
            total_score = int(room.player_scores.get(participant.peer_id, 0) or 0)
            runtime._record_player_answer_stat(
                room,
                participant,
                is_correct=is_correct,
                points_awarded=points_awarded,
                remaining_ms=remaining_ms,
                answered_at=answered_at,
            )
            question_player_results.append(
                {
                    "peerId": participant.peer_id,
                    "name": participant.name,
                    "team": participant.team,
                    "selectedIndex": selected_index,
                    "isCorrect": is_correct,
                    "basePoints": base_points,
                    "speedBonus": speed_bonus,
                    "timeRemainingMs": remaining_ms if is_correct else 0,
                    "pointsAwarded": points_awarded,
                    "totalScore": total_score,
                    "status": "answered",
                }
            )

        runtime._append_question_history(
            room,
            {
                "id": random_id(),
                "timestamp": now_ms(),
                "mode": "ffa",
                "questionNumber": room.current_question_index + 1,
                "difficulty": question.get("difficulty"),
                "correctIndex": correct_index,
                "playerResults": question_player_results,
            },
        )

        room.chat = []
        room.phase = "reveal"
        room.question_ends_at = None
        room.reveal_ends_at = now_ms() + REVEAL_TIME_MS
        room.active_answer = None
        room.answer_submissions = {}
        room.skip_requesters = set()
        room.skip_request_status = "idle"
        room.skip_request_message_id = None
        room.last_reveal = {
            "mode": "ffa",
            "correctIndex": correct_index,
            "selectedIndex": None,
            "answeredBy": None,
            "answeredByName": "Индивидуальная проверка",
            "team": None,
            "isCorrect": False,
            "basePoints": 0,
            "speedBonus": 0,
            "timeRemainingMs": 0,
            "pointsAwarded": total_points_awarded,
            "participantsCount": len(participants),
            "playerResults": question_player_results,
        }

        runtime._schedule_timer(room, "reveal", REVEAL_TIME_MS, runtime._advance_after_reveal)
        await runtime._broadcast_and_persist(room)
        return

    room.chat = []
    room.phase = "reveal"
    room.question_ends_at = None
    room.reveal_ends_at = now_ms() + REVEAL_TIME_MS

    if room.game_mode == "classic":
        selected = room.active_answer
        selected_index = selected.get("selectedIndex") if isinstance(selected, dict) else None
        is_correct = selected_index == correct_index
        remaining_ms = fallback_remaining_ms if isinstance(selected, dict) else 0
        speed_bonus = calculate_speed_bonus(remaining_ms) if is_correct else 0
        base_points = BASE_CORRECT_POINTS if is_correct else 0
        points_awarded = base_points + speed_bonus

        if points_awarded > 0:
            room.scores[room.active_team] += points_awarded

        answered_by_peer_id = selected.get("byPeerId") if isinstance(selected, dict) else None
        answered_by_name = selected.get("byName") if isinstance(selected, dict) else None
        if isinstance(answered_by_peer_id, str):
            answered_player = room.players.get(answered_by_peer_id)
            if answered_player is not None and not answered_player.is_host:
                runtime._record_player_answer_stat(
                    room,
                    answered_player,
                    is_correct=is_correct,
                    points_awarded=points_awarded,
                    remaining_ms=remaining_ms,
                )
        else:
            captain_peer_id = room.captains.get(room.active_team)
            if captain_peer_id:
                captain_player = room.players.get(captain_peer_id)
                if captain_player is not None and not captain_player.is_host:
                    runtime._record_player_skip_stat(room, captain_player)

        room.last_reveal = {
            "mode": "classic",
            "correctIndex": correct_index,
            "selectedIndex": selected_index,
            "answeredBy": answered_by_peer_id,
            "answeredByName": answered_by_name,
            "team": room.active_team,
            "isCorrect": is_correct,
            "basePoints": base_points,
            "speedBonus": speed_bonus,
            "timeRemainingMs": remaining_ms if is_correct else 0,
            "pointsAwarded": points_awarded,
        }
        runtime._append_question_history(
            room,
            {
                "id": random_id(),
                "timestamp": now_ms(),
                "mode": "classic",
                "questionNumber": room.current_question_index + 1,
                "difficulty": question.get("difficulty"),
                "team": room.active_team,
                "correctIndex": correct_index,
                "selectedIndex": selected_index,
                "answeredBy": answered_by_peer_id,
                "answeredByName": answered_by_name,
                "isCorrect": is_correct,
                "basePoints": base_points,
                "speedBonus": speed_bonus,
                "timeRemainingMs": remaining_ms if is_correct else 0,
                "pointsAwarded": points_awarded,
                "status": "answered" if isinstance(answered_by_peer_id, str) else "timeout",
            },
        )
    elif room.game_mode == "chaos":
        chaos_team_results: dict[Team, dict[str, Any]] = {}
        total_points_awarded = 0
        chaos_player_results: list[dict[str, Any]] = []

        for team in TEAM_KEYS:
            participants = runtime._active_team_players(room, team)
            vote_counts: dict[int, int] = {}
            team_answered_count = 0
            latest_answered_at: int | None = None

            for participant in participants:
                submission = room.answer_submissions.get(participant.peer_id)
                if not isinstance(submission, dict):
                    runtime._record_player_skip_stat(room, participant)
                    chaos_player_results.append(
                        {
                            "peerId": participant.peer_id,
                            "name": participant.name,
                            "team": team,
                            "selectedIndex": None,
                            "isCorrect": False,
                            "basePoints": 0,
                            "speedBonus": 0,
                            "timeRemainingMs": 0,
                            "pointsAwarded": 0,
                            "status": "timeout",
                        }
                    )
                    continue
                team_answered_count += 1

                selected_index_raw = submission.get("selectedIndex")
                answered_at_raw = submission.get("answeredAt")
                answered_at: int | None = int(answered_at_raw) if isinstance(answered_at_raw, int) else None
                if isinstance(answered_at_raw, int):
                    if latest_answered_at is None or answered_at_raw > latest_answered_at:
                        latest_answered_at = answered_at_raw
                player_remaining_ms = (
                    max(0, question_ends_at - answered_at)
                    if question_ends_at is not None and answered_at is not None
                    else fallback_remaining_ms
                )

                if isinstance(selected_index_raw, int):
                    vote_counts[selected_index_raw] = vote_counts.get(selected_index_raw, 0) + 1
                    player_is_correct = selected_index_raw == correct_index
                    runtime._record_player_answer_stat(
                        room,
                        participant,
                        is_correct=player_is_correct,
                        points_awarded=0,
                        remaining_ms=player_remaining_ms,
                        answered_at=answered_at,
                    )
                    chaos_player_results.append(
                        {
                            "peerId": participant.peer_id,
                            "name": participant.name,
                            "team": team,
                            "selectedIndex": selected_index_raw,
                            "isCorrect": player_is_correct,
                            "basePoints": 0,
                            "speedBonus": 0,
                            "timeRemainingMs": player_remaining_ms if player_is_correct else 0,
                            "pointsAwarded": 0,
                            "status": "answered",
                        }
                    )
                else:
                    runtime._record_player_skip_stat(room, participant)
                    chaos_player_results.append(
                        {
                            "peerId": participant.peer_id,
                            "name": participant.name,
                            "team": team,
                            "selectedIndex": None,
                            "isCorrect": False,
                            "basePoints": 0,
                            "speedBonus": 0,
                            "timeRemainingMs": 0,
                            "pointsAwarded": 0,
                            "status": "invalid",
                        }
                    )

            selected_index: int | None = None
            tie_resolved_randomly = False
            if vote_counts:
                max_votes = max(vote_counts.values())
                leaders = [index for index, count in vote_counts.items() if count == max_votes]
                if leaders:
                    tie_resolved_randomly = len(leaders) > 1
                    selected_index = cast(int, runtime._random_item(leaders))

            is_correct = selected_index == correct_index
            if question_ends_at is not None and latest_answered_at is not None:
                team_remaining_ms = max(0, question_ends_at - latest_answered_at)
            else:
                team_remaining_ms = fallback_remaining_ms
            speed_bonus = calculate_speed_bonus(team_remaining_ms) if is_correct else 0
            base_points = BASE_CORRECT_POINTS if is_correct else 0
            points_awarded = base_points + speed_bonus
            if points_awarded > 0:
                room.scores[team] += points_awarded

            total_points_awarded += points_awarded
            chaos_team_results[team] = {
                "team": team,
                "selectedIndex": selected_index,
                "isCorrect": is_correct,
                "basePoints": base_points,
                "speedBonus": speed_bonus,
                "timeRemainingMs": team_remaining_ms if is_correct else 0,
                "pointsAwarded": points_awarded,
                "voteCounts": {str(index): count for index, count in vote_counts.items()},
                "tieResolvedRandomly": tie_resolved_randomly,
                "participantsCount": len(participants),
                "answeredCount": team_answered_count,
            }

        room.last_reveal = {
            "mode": "chaos",
            "correctIndex": correct_index,
            "selectedIndex": None,
            "answeredBy": None,
            "answeredByName": "Голосование команд",
            "team": None,
            "isCorrect": False,
            "basePoints": 0,
            "speedBonus": 0,
            "timeRemainingMs": 0,
            "pointsAwarded": total_points_awarded,
            "chaosTeamResults": chaos_team_results,
        }
        runtime._append_question_history(
            room,
            {
                "id": random_id(),
                "timestamp": now_ms(),
                "mode": "chaos",
                "questionNumber": room.current_question_index + 1,
                "difficulty": question.get("difficulty"),
                "correctIndex": correct_index,
                "chaosTeamResults": chaos_team_results,
                "playerResults": chaos_player_results,
            },
        )
    room.active_answer = None
    room.answer_submissions = {}
    runtime._schedule_timer(room, "reveal", REVEAL_TIME_MS, runtime._advance_after_reveal)
    await runtime._broadcast_and_persist(room)


async def skip_question_by_host(
    runtime: "QuizRuntime",
    room: "RoomRuntime",
    host_player: "PlayerConnection",
) -> None:
    if room.phase != "question" or room.current_question_index < 0:
        return

    runtime._cancel_timer(room, "question")

    if room.current_question_index >= len(room.questions):
        return

    question = room.questions[room.current_question_index]
    remaining_ms = 0
    if room.question_ends_at is not None:
        remaining_ms = max(0, room.question_ends_at - now_ms())
    skipped_player_results: list[dict[str, Any]] = []
    if room.game_mode == "ffa":
        skipped_participants = runtime._active_non_host_players(room)
    elif room.game_mode == "chaos":
        skipped_participants = [
            player
            for player in runtime._active_non_host_players(room)
            if player.team in TEAM_KEYS
        ]
    else:
        captain_peer_id = room.captains.get(room.active_team)
        captain_player = room.players.get(captain_peer_id) if captain_peer_id else None
        skipped_participants = [captain_player] if captain_player is not None else []

    for participant in skipped_participants:
        skipped_player_results.append(
            {
                "peerId": participant.peer_id,
                "name": participant.name,
                "team": participant.team,
                "selectedIndex": None,
                "isCorrect": False,
                "basePoints": 0,
                "speedBonus": 0,
                "timeRemainingMs": 0,
                "pointsAwarded": 0,
                "status": "skipped_by_host",
            }
        )
    runtime._append_question_history(
        room,
        {
            "id": random_id(),
            "timestamp": now_ms(),
            "mode": room.game_mode,
            "questionNumber": room.current_question_index + 1,
            "difficulty": question.get("difficulty"),
            "correctIndex": question.get("correctIndex"),
            "team": room.active_team if room.game_mode != "ffa" else None,
            "skippedByHost": True,
            "skippedByName": host_player.name,
            "timeRemainingMs": remaining_ms,
            "playerResults": skipped_player_results,
        },
    )
    runtime._append_result_event(
        room,
        f"Ведущий {str(host_player.name or 'Ведущий')[:24]} пропустил вопрос №{room.current_question_index + 1}.",
        kind="question-skip",
        payload={"questionNumber": room.current_question_index + 1, "mode": room.game_mode},
    )

    room.chat = []
    room.question_ends_at = None
    room.active_answer = None
    room.answer_submissions = {}
    room.skip_requesters = set()
    room.skip_request_status = "idle"
    room.skip_request_message_id = None

    if room.game_mode == "ffa":
        room.last_reveal = None
        room.reveal_ends_at = None
        if room.current_question_index >= room.question_count - 1:
            room.phase = "results"
            runtime._append_result_event(room, "Игра завершена. Переход к финальной статистике.", kind="phase")
            runtime._schedule_persist_game_result(room)
            await runtime._broadcast_and_persist(room)
            return

        room.current_question_index += 1
        await runtime._start_question_phase(room)
        return

    room.phase = "reveal"
    room.reveal_ends_at = now_ms() + SKIP_REVEAL_TIME_MS
    room.last_reveal = {
        "mode": room.game_mode,
        "correctIndex": question.get("correctIndex"),
        "selectedIndex": None,
        "answeredBy": None,
        "answeredByName": None,
        "team": room.active_team,
        "isCorrect": False,
        "basePoints": 0,
        "speedBonus": 0,
        "timeRemainingMs": remaining_ms,
        "pointsAwarded": 0,
        "skippedByHost": True,
        "skippedByName": host_player.name,
    }

    runtime._schedule_timer(room, "reveal", SKIP_REVEAL_TIME_MS, runtime._advance_after_reveal)
    await runtime._broadcast_and_persist(room)
