from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Literal

from fastapi import WebSocket

Team = Literal["A", "B"]
QuestionDifficulty = Literal["easy", "medium", "hard"]
DifficultyMode = Literal["easy", "medium", "hard", "mixed", "progressive"]
GameMode = Literal["classic", "ffa", "chaos"]
QuestionSource = Literal["catalog", "generated"]
SkipRequestStatus = Literal["idle", "pending", "rejected"]
Phase = Literal[
    "lobby",
    "team-reveal",
    "captain-vote",
    "team-naming",
    "question",
    "reveal",
    "results",
    "host-reconnect",
    "manual-pause",
]


@dataclass
class PlayerConnection:
    peer_id: str
    name: str
    team: Team | None
    is_host: bool
    websocket: WebSocket
    is_spectator: bool = False
    identity_key: str | None = None
    player_token: str | None = None
    is_captain: bool = False
    avatar: str | None = None
    auth_user_id: int | None = None
    profile_frame: str | None = None
    mascot_skin_cat: str | None = None
    mascot_skin_dog: str | None = None
    victory_effect_front: str | None = None
    victory_effect_back: str | None = None


@dataclass
class RoomRuntime:
    room_id: str
    topic: str
    difficulty_mode: DifficultyMode
    game_mode: GameMode
    question_count: int
    questions: list[dict[str, Any]]
    players: dict[str, PlayerConnection] = field(default_factory=dict)
    player_tokens: dict[str, str] = field(default_factory=dict)
    host_peer_id: str = ""
    host_token_hash: str = ""
    room_password_hash: str = ""
    is_password_protected: bool = False
    question_source: QuestionSource = "catalog"
    generated_questions_path: str | None = None
    password: str | None = None
    phase: Phase = "lobby"
    current_question_index: int = -1
    active_team: Team = "A"
    question_ends_at: int | None = None
    team_reveal_ends_at: int | None = None
    captain_vote_ends_at: int | None = None
    team_naming_ends_at: int | None = None
    reveal_ends_at: int | None = None
    host_reconnect_ends_at: int | None = None
    disconnected_host_name: str | None = None
    disconnected_host_expected_name: str | None = None
    paused_state: dict[str, Any] | None = None
    manual_pause_by_name: str | None = None
    active_answer: dict[str, Any] | None = None
    answer_submissions: dict[str, dict[str, Any]] = field(default_factory=dict)
    skip_requesters: set[str] = field(default_factory=set)
    skip_request_status: SkipRequestStatus = "idle"
    skip_request_message_id: str | None = None
    last_reveal: dict[str, Any] | None = None
    scores: dict[Team, int] = field(default_factory=lambda: {"A": 0, "B": 0})
    player_scores: dict[str, int] = field(default_factory=dict)
    player_stats: dict[str, dict[str, Any]] = field(default_factory=dict)
    question_history: list[dict[str, Any]] = field(default_factory=list)
    event_history: list[dict[str, Any]] = field(default_factory=list)
    chat: list[dict[str, Any]] = field(default_factory=list)
    chat_moderation_strikes: dict[str, int] = field(default_factory=dict)
    captains: dict[Team, str | None] = field(default_factory=lambda: {"A": None, "B": None})
    captain_votes: dict[Team, dict[str, int]] = field(default_factory=lambda: {"A": {}, "B": {}})
    captain_ballots: dict[Team, dict[str, str]] = field(default_factory=lambda: {"A": {}, "B": {}})
    captain_vote_ready_teams: dict[Team, bool] = field(
        default_factory=lambda: {"A": False, "B": False}
    )
    team_naming_ready_teams: dict[Team, bool] = field(
        default_factory=lambda: {"A": False, "B": False}
    )
    team_names: dict[Team, str] = field(
        default_factory=lambda: {"A": "Команда A", "B": "Команда B"}
    )
    used_team_names: set[str] = field(default_factory=set)
    results_recorded: bool = False
    state_version: int = 1
    timers: dict[str, asyncio.Task[None] | None] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
