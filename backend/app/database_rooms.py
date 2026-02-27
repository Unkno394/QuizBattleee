from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import asyncpg


@dataclass
class RoomSnapshotRecord:
    room_id: str
    topic: str
    question_count: int
    state_json: dict[str, Any]
    updated_at: datetime


async def load_room_snapshot(pool: asyncpg.Pool, room_id: str) -> RoomSnapshotRecord | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT room_id, topic, question_count, state_json, updated_at
            FROM room_snapshots
            WHERE room_id = $1
            """,
            room_id,
        )

    if row is None:
        return None

    raw_state = row["state_json"] or "{}"
    try:
        state_json = json.loads(raw_state)
        if not isinstance(state_json, dict):
            state_json = {}
    except Exception:
        state_json = {}

    return RoomSnapshotRecord(
        room_id=row["room_id"],
        topic=row["topic"],
        question_count=int(row["question_count"]),
        state_json=state_json,
        updated_at=row["updated_at"],
    )


async def save_room_snapshot(
    pool: asyncpg.Pool,
    *,
    room_id: str,
    topic: str,
    question_count: int,
    state_json: dict[str, Any],
) -> None:
    payload = json.dumps(state_json, ensure_ascii=False)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO room_snapshots (room_id, topic, question_count, state_json)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (room_id) DO UPDATE
            SET topic = EXCLUDED.topic,
                question_count = EXCLUDED.question_count,
                state_json = EXCLUDED.state_json,
                updated_at = NOW()
            """,
            room_id,
            topic,
            int(question_count),
            payload,
        )


async def save_game_result(
    pool: asyncpg.Pool,
    *,
    room_id: str,
    team_a_name: str,
    team_b_name: str,
    score_a: int,
    score_b: int,
    winner_team: str | None,
    payload_json: dict[str, Any],
) -> None:
    payload = json.dumps(payload_json, ensure_ascii=False)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO game_results
              (room_id, team_a_name, team_b_name, score_a, score_b, winner_team, payload_json)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            room_id,
            team_a_name,
            team_b_name,
            int(score_a),
            int(score_b),
            winner_team,
            payload,
        )
