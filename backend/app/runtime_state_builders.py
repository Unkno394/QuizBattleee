from __future__ import annotations

from typing import Any, Callable, Iterable, cast

from .runtime_types import PlayerConnection, RoomRuntime, Team


def build_question_for_viewer(
    room: RoomRuntime,
    viewer: PlayerConnection,
    *,
    difficulty_levels: set[str],
) -> dict[str, Any] | None:
    if room.current_question_index < 0 or room.current_question_index >= len(room.questions):
        return None

    raw_question = room.questions[room.current_question_index]
    if not isinstance(raw_question, dict):
        return None

    raw_options = raw_question.get("options")
    normalized_options: list[str] = []
    if isinstance(raw_options, list):
        normalized_options = [str(option) for option in raw_options]

    can_see_options = False
    if room.phase == "question":
        if room.game_mode in {"ffa", "chaos"}:
            can_see_options = True
        else:
            can_see_options = viewer.is_host or viewer.is_spectator or (
                viewer.team is not None and viewer.team == room.active_team
            )
    elif room.phase == "reveal":
        if room.game_mode in {"ffa", "chaos"}:
            can_see_options = True
        else:
            reveal_team_raw = room.last_reveal.get("team") if isinstance(room.last_reveal, dict) else None
            can_see_options = viewer.is_host or viewer.is_spectator or (
                viewer.team is not None and reveal_team_raw == viewer.team
            )
    elif room.phase in {"results", "team-naming", "captain-vote", "team-reveal", "host-reconnect"}:
        can_see_options = True

    difficulty_raw = str(raw_question.get("difficulty") or "medium").strip().lower()
    difficulty = difficulty_raw if difficulty_raw in difficulty_levels else "medium"

    return {
        "id": str(raw_question.get("id") or room.current_question_index + 1),
        "text": str(raw_question.get("text") or ""),
        "options": normalized_options if can_see_options else [],
        "difficulty": difficulty,
    }


def build_reveal_for_viewer(
    room: RoomRuntime,
    viewer: PlayerConnection,
    *,
    team_keys: tuple[Team, Team],
) -> dict[str, Any] | None:
    if room.phase == "results" and not viewer.is_host:
        return None
    if not isinstance(room.last_reveal, dict):
        return None
    if room.game_mode in {"ffa", "chaos"}:
        return dict(room.last_reveal)
    reveal_team_raw = room.last_reveal.get("team")
    if reveal_team_raw not in team_keys:
        return None
    if bool(room.last_reveal.get("skippedByHost")):
        return dict(room.last_reveal)
    if viewer.is_host or viewer.is_spectator:
        return dict(room.last_reveal)
    if viewer.team != cast(Team, reveal_team_raw):
        return None
    return dict(room.last_reveal)


def build_answer_progress(room: RoomRuntime, *, eligible_count: int) -> dict[str, int] | None:
    if room.phase != "question":
        return None
    answered = len(room.answer_submissions)
    return {
        "answered": max(0, answered),
        "total": max(0, eligible_count),
    }


def build_ffa_answer_for_viewer(
    room: RoomRuntime,
    viewer: PlayerConnection,
    *,
    now_ms: Callable[[], int],
    calculate_speed_bonus: Callable[[int], int],
    base_correct_points: int,
) -> dict[str, Any] | None:
    if room.game_mode != "ffa" or room.phase != "question" or viewer.is_host or viewer.is_spectator:
        return None
    if room.current_question_index < 0 or room.current_question_index >= len(room.questions):
        return None

    submission = room.answer_submissions.get(viewer.peer_id)
    if not isinstance(submission, dict):
        return None

    question = room.questions[room.current_question_index]
    selected_index_raw = submission.get("selectedIndex")
    selected_index = selected_index_raw if isinstance(selected_index_raw, int) else None
    answered_at = submission.get("answeredAt")
    answered_at_ms = int(answered_at) if isinstance(answered_at, int) else now_ms()
    question_ends_at = room.question_ends_at or now_ms()
    remaining_ms = max(0, question_ends_at - answered_at_ms)
    is_correct = selected_index == question.get("correctIndex")
    speed_bonus = calculate_speed_bonus(remaining_ms) if is_correct else 0
    base_points = base_correct_points if is_correct else 0
    points_awarded = base_points + speed_bonus
    projected_total = int(room.player_scores.get(viewer.peer_id, 0)) + points_awarded
    return {
        "selectedIndex": selected_index,
        "isCorrect": is_correct,
        "basePoints": base_points,
        "speedBonus": speed_bonus,
        "timeRemainingMs": remaining_ms if is_correct else 0,
        "pointsAwarded": points_awarded,
        "projectedTotalScore": projected_total,
    }


def build_ffa_pending_players_for_viewer(
    room: RoomRuntime,
    viewer: PlayerConnection,
    *,
    active_non_host_players: Iterable[PlayerConnection],
) -> list[str]:
    if room.game_mode != "ffa" or room.phase != "question":
        return []
    if viewer.is_host or viewer.is_spectator:
        return []
    if viewer.peer_id not in room.answer_submissions:
        return []

    pending = [
        player.name
        for player in active_non_host_players
        if player.peer_id not in room.answer_submissions
    ]
    return pending


def build_result_players(
    room: RoomRuntime,
    *,
    sync_player_stats_metadata: Callable[[], None],
    player_name_for_peer: Callable[[str], str],
    team_keys: tuple[Team, Team],
) -> list[dict[str, Any]]:
    sync_player_stats_metadata()

    rows: list[dict[str, Any]] = []
    for peer_id, raw in room.player_stats.items():
        if not isinstance(raw, dict):
            continue
        team_raw = raw.get("team")
        team = cast(Team, team_raw) if team_raw in team_keys else None
        answers = max(0, int(raw.get("answers", 0) or 0))
        correct_answers = max(0, int(raw.get("correctAnswers", 0) or 0))
        wrong_answers = max(0, int(raw.get("wrongAnswers", 0) or 0))
        skipped_answers = max(0, int(raw.get("skippedAnswers", 0) or 0))
        total_response_ms = max(0, int(raw.get("totalResponseMs", 0) or 0))
        points = max(0, int(raw.get("points", 0) or 0))
        if room.game_mode == "ffa":
            points = max(points, int(room.player_scores.get(peer_id, 0) or 0))
        fastest_raw = raw.get("fastestResponseMs")
        fastest_ms = max(0, int(fastest_raw)) if isinstance(fastest_raw, int) else None
        avg_response_ms = int(total_response_ms / answers) if answers > 0 else None

        rows.append(
            {
                "peerId": peer_id,
                "accountUserId": (
                    int(raw.get("accountUserId"))
                    if raw.get("accountUserId") is not None
                    else None
                ),
                "name": str(raw.get("name") or player_name_for_peer(peer_id))[:24],
                "team": team,
                "answers": answers,
                "correctAnswers": correct_answers,
                "wrongAnswers": wrong_answers,
                "skippedAnswers": skipped_answers,
                "points": points,
                "totalResponseMs": total_response_ms,
                "avgResponseMs": avg_response_ms,
                "fastestResponseMs": fastest_ms,
                "lastAnsweredAt": int(raw.get("lastAnsweredAt") or 0) or None,
            }
        )

    if room.game_mode == "ffa":
        rows.sort(
            key=lambda item: (
                -int(item.get("points", 0)),
                -int(item.get("correctAnswers", 0)),
                str(item.get("name", "")),
            )
        )
    else:
        rows.sort(
            key=lambda item: (
                -int(item.get("correctAnswers", 0)),
                -int(item.get("points", 0)),
                str(item.get("name", "")),
            )
        )
    return rows


def build_results_summary(
    room: RoomRuntime,
    viewer: PlayerConnection,
    *,
    players_full: list[dict[str, Any]],
    player_name_for_peer: Callable[[str], str],
    team_keys: tuple[Team, Team],
) -> dict[str, Any] | None:
    if room.phase != "results":
        return None

    host_details = {
        "players": players_full,
        "questionHistory": room.question_history[-120:],
        "eventHistory": room.event_history[-180:],
    }

    if room.game_mode == "ffa":
        ranking: list[dict[str, Any]] = []
        rank = 0
        prev_score: int | None = None
        prev_correct: int | None = None
        for index, row in enumerate(players_full):
            score = int(row.get("points", 0) or 0)
            correct_answers = int(row.get("correctAnswers", 0) or 0)
            if prev_score != score or prev_correct != correct_answers:
                rank = index + 1
                prev_score = score
                prev_correct = correct_answers
            ranking.append(
                {
                    "place": rank,
                    "peerId": row.get("peerId"),
                    "name": row.get("name"),
                    "points": score,
                    "correctAnswers": correct_answers,
                }
            )

        summary: dict[str, Any] = {
            "mode": "ffa",
            "ranking": ranking,
        }
        if viewer.is_host:
            summary["hostDetails"] = host_details
        return summary

    winner_team: Team | None = None
    if room.scores["A"] > room.scores["B"]:
        winner_team = "A"
    elif room.scores["B"] > room.scores["A"]:
        winner_team = "B"

    public_players = [
        {
            "peerId": row.get("peerId"),
            "name": row.get("name"),
            "team": row.get("team"),
            "correctAnswers": int(row.get("correctAnswers", 0) or 0),
        }
        for row in players_full
    ]

    captain_contribution: dict[str, Any] = {"A": None, "B": None}
    if room.game_mode == "classic":
        for team in team_keys:
            captain_peer_id = room.captains.get(team)
            if not captain_peer_id:
                continue
            stat = next(
                (
                    row
                    for row in players_full
                    if str(row.get("peerId") or "") == captain_peer_id
                ),
                None,
            )
            captain_contribution[team] = {
                "peerId": captain_peer_id,
                "name": stat.get("name") if isinstance(stat, dict) else player_name_for_peer(captain_peer_id),
                "team": team,
                "correctAnswers": int(stat.get("correctAnswers", 0) or 0) if isinstance(stat, dict) else 0,
                "wrongAnswers": int(stat.get("wrongAnswers", 0) or 0) if isinstance(stat, dict) else 0,
                "points": int(stat.get("points", 0) or 0) if isinstance(stat, dict) else 0,
            }
    else:
        captain_contribution["note"] = "В этом режиме капитанов нет."

    summary = {
        "mode": room.game_mode,
        "teamScores": dict(room.scores),
        "winnerTeam": winner_team,
        "teamNames": dict(room.team_names),
        "players": public_players,
        "captainContribution": captain_contribution,
    }
    if viewer.is_host:
        summary["hostDetails"] = host_details
    return summary


def build_chaos_progress_for_viewer(
    room: RoomRuntime,
    viewer: PlayerConnection,
    *,
    team_a_total: int,
    team_b_total: int,
) -> dict[str, Any] | None:
    if room.game_mode != "chaos" or room.phase != "question":
        return None

    total_by_team: dict[Team, int] = {
        "A": team_a_total,
        "B": team_b_total,
    }
    answered_by_team: dict[Team, int] = {"A": 0, "B": 0}
    for peer_id in room.answer_submissions:
        player = room.players.get(peer_id)
        if player is None or player.team not in {"A", "B"} or player.is_host or player.is_spectator:
            continue
        answered_by_team[player.team] += 1

    return {
        "submitted": viewer.peer_id in room.answer_submissions,
        "answeredByTeam": answered_by_team,
        "totalByTeam": total_by_team,
    }


def build_skip_request_for_viewer(
    room: RoomRuntime,
    viewer: PlayerConnection,
    *,
    non_host_players: Iterable[PlayerConnection],
) -> dict[str, Any] | None:
    if room.phase != "question":
        return None
    names = [
        player.name
        for player in non_host_players
        if player.peer_id in room.skip_requesters
    ]
    status = room.skip_request_status if room.skip_request_status in {"idle", "pending", "rejected"} else "idle"
    notice = None
    if status == "pending" and names:
        if len(names) == 1:
            notice = f'Участник {names[0]} попросил пропустить вопрос.'
        else:
            notice = f'Участники {", ".join(names)} попросили пропустить вопрос.'
    elif status == "rejected":
        notice = "Запрос на пропуск вопроса отклонён ведущим."
    return {
        "count": len(names),
        "meRequested": viewer.peer_id in room.skip_requesters,
        "names": names if (viewer.is_host or viewer.is_spectator) else [],
        "status": status,
        "notice": notice,
        "messageId": room.skip_request_message_id,
    }
