from __future__ import annotations

from .runtime_types import PlayerConnection, RoomRuntime, Team


def build_votes_for_viewer(
    room: RoomRuntime,
    viewer: PlayerConnection,
) -> dict[Team, dict[str, int]]:
    if room.phase == "results" and not viewer.is_host:
        return {"A": {}, "B": {}}
    if viewer.is_host or viewer.is_spectator:
        return {
            "A": dict(room.captain_votes["A"]),
            "B": dict(room.captain_votes["B"]),
        }

    if not viewer.team:
        return {"A": {}, "B": {}}

    return {
        "A": dict(room.captain_votes["A"]) if viewer.team == "A" else {},
        "B": dict(room.captain_votes["B"]) if viewer.team == "B" else {},
    }


def build_captain_vote_progress(
    *,
    votes_a: int,
    total_a: int,
    votes_b: int,
    total_b: int,
) -> dict[Team, dict[str, int]]:
    return {
        "A": {"votes": votes_a, "total": total_a},
        "B": {"votes": votes_b, "total": total_b},
    }


def get_viewer_captain_vote(
    room: RoomRuntime,
    viewer: PlayerConnection,
) -> str | None:
    if not viewer.team or viewer.is_host:
        return None
    return room.captain_ballots[viewer.team].get(viewer.peer_id)
