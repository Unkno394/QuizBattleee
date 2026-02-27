from __future__ import annotations

from typing import Any, Callable

from .runtime_constants import TEAM_KEYS
from .runtime_types import RoomRuntime, Team
from .runtime_utils import now_ms


def build_game_result_payload(
    room: RoomRuntime,
    result_players: list[dict[str, Any]],
    *,
    player_name_for_peer: Callable[[str, str], str],
) -> dict[str, Any]:
    if room.game_mode == "ffa":
        sorted_scores = sorted(
            room.player_scores.items(),
            key=lambda item: item[1],
            reverse=True,
        )
        leader_peer_id, leader_score = sorted_scores[0] if sorted_scores else ("", 0)
        runner_peer_id, runner_score = sorted_scores[1] if len(sorted_scores) > 1 else ("", 0)
        leader_name = player_name_for_peer(leader_peer_id, "Игрок 1")
        runner_name = player_name_for_peer(runner_peer_id, "Игрок 2")
        winner_team = "A" if leader_score > runner_score else None

        ranking_payload: list[dict[str, Any]] = []
        rank = 0
        prev_score: int | None = None
        prev_correct: int | None = None
        for index, row in enumerate(result_players):
            score = int(row.get("points", 0) or 0)
            correct_answers = int(row.get("correctAnswers", 0) or 0)
            if prev_score != score or prev_correct != correct_answers:
                rank = index + 1
                prev_score = score
                prev_correct = correct_answers
            ranking_payload.append(
                {
                    "place": rank,
                    "peerId": row.get("peerId"),
                    "name": row.get("name"),
                    "points": score,
                    "correctAnswers": correct_answers,
                }
            )

        return {
            "room_id": room.room_id,
            "team_a_name": f"Лидер: {leader_name}"[:32],
            "team_b_name": f"2 место: {runner_name}"[:32],
            "score_a": int(leader_score),
            "score_b": int(runner_score),
            "winner_team": winner_team,
            "payload_json": {
                "gameMode": "ffa",
                "playerScores": room.player_scores,
                "playerStats": result_players,
                "ranking": ranking_payload,
                "questionHistory": room.question_history[-120:],
                "eventHistory": room.event_history[-180:],
                "leaderPeerId": leader_peer_id,
                "finishedAt": now_ms(),
            },
        }

    winner_team: Team | None = None
    if room.scores["A"] > room.scores["B"]:
        winner_team = "A"
    elif room.scores["B"] > room.scores["A"]:
        winner_team = "B"

    captain_contribution: dict[str, Any] = {"A": None, "B": None}
    if room.game_mode == "classic":
        for team in TEAM_KEYS:
            captain_peer_id = room.captains.get(team)
            if not captain_peer_id:
                continue
            stat = next(
                (
                    row
                    for row in result_players
                    if str(row.get("peerId") or "") == captain_peer_id
                ),
                None,
            )
            captain_contribution[team] = {
                "peerId": captain_peer_id,
                "name": stat.get("name")
                if isinstance(stat, dict)
                else player_name_for_peer(captain_peer_id, "Игрок"),
                "correctAnswers": int(stat.get("correctAnswers", 0) or 0) if isinstance(stat, dict) else 0,
                "wrongAnswers": int(stat.get("wrongAnswers", 0) or 0) if isinstance(stat, dict) else 0,
                "points": int(stat.get("points", 0) or 0) if isinstance(stat, dict) else 0,
            }
    else:
        captain_contribution["note"] = "В этом режиме капитанов нет."

    return {
        "room_id": room.room_id,
        "team_a_name": room.team_names["A"],
        "team_b_name": room.team_names["B"],
        "score_a": room.scores["A"],
        "score_b": room.scores["B"],
        "winner_team": winner_team,
        "payload_json": {
            "gameMode": room.game_mode,
            "scores": room.scores,
            "teamNames": room.team_names,
            "playerStats": result_players,
            "captainContribution": captain_contribution,
            "questionHistory": room.question_history[-120:],
            "eventHistory": room.event_history[-180:],
            "winnerTeam": winner_team,
            "finishedAt": now_ms(),
        },
    }
