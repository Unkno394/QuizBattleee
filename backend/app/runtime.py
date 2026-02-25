from __future__ import annotations

import asyncio
import json
import logging
import random
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal, cast

from fastapi import WebSocket, WebSocketDisconnect

from .config import settings
from .database import load_room_snapshot, save_game_result, save_room_snapshot

logger = logging.getLogger(__name__)

Team = Literal["A", "B"]
Phase = Literal[
    "lobby",
    "team-reveal",
    "captain-vote",
    "team-naming",
    "question",
    "reveal",
    "results",
    "host-reconnect",
]

MAX_PLAYERS = settings.max_players
QUESTION_TIME_MS = 30_000
REVEAL_TIME_MS = 4_000
TEAM_REVEAL_TIME_MS = 6_000
CAPTAIN_VOTE_TIME_MS = 30_000
TEAM_NAMING_TIME_MS = 30_000
HOST_RECONNECT_WAIT_MS = 30_000
TEAM_KEYS: tuple[Team, Team] = ("A", "B")

DYNAMIC_TEAM_NAMES = [
    "Импульс",
    "Перехват",
    "Фактор X",
    "Блиц-режим",
    "Прорыв",
    "Сверхновые",
    "Форсаж",
    "Рубеж",
    "Эпицентр",
    "Нулевая ошибка",
    "Контрольная точка",
    "Финальный ход",
    "Скрытый потенциал",
    "Мозговой штурм",
    "Решающий аргумент",
    "Горизонт",
    "Точка прорыва",
    "Стратегический резерв",
    "Ускорение",
    "Предел концентрации",
    "Критическая масса",
    "Вектор",
    "Смена парадигмы",
    "Код доступа",
    "Глубокий анализ",
    "Системный подход",
    "Синхронизация",
    "Быстрая логика",
    "Тактический ход",
    "Зона влияния",
    "Интеллектуальный шторм",
    "Второе дыхание",
    "Пиковая форма",
    "Точный расчёт",
    "Момент истины",
]


def now_ms() -> int:
    return int(time.time() * 1000)


def random_id() -> str:
    return str(uuid.uuid4())


def sanitize_room_id(raw: str | None) -> str:
    value = (raw or "").upper()
    filtered = "".join(ch for ch in value if ch.isalnum())
    return filtered[:8]


def sanitize_team_name(raw: Any, fallback: str) -> str:
    trimmed = str(raw or "").strip()[:32]
    return trimmed or fallback


def normalize_team_name(name: str) -> str:
    return name.strip().lower()


def normalize_player_name(name: str | None) -> str:
    return str(name or "").strip().lower()


def clamp_question_count(value: Any) -> int:
    try:
        num = int(value)
    except (TypeError, ValueError):
        return 5
    return max(5, min(7, round(num)))


def create_mock_questions(topic: str, count: int) -> list[dict[str, Any]]:
    base = [
        {
            "text": f'Что из этого лучше всего описывает тему "{topic}"?',
            "options": [
                "Практическая задача",
                "Случайный факт",
                "Музыкальный термин",
                "Историческая дата",
            ],
            "correctIndex": 0,
        },
        {
            "text": f'Какой подход обычно самый эффективный в "{topic}"?',
            "options": [
                "Пробовать без плана",
                "Игнорировать данные",
                "Проверять гипотезы",
                "Избегать изменений",
            ],
            "correctIndex": 2,
        },
        {
            "text": f'Что важнее всего для командной игры на тему "{topic}"?',
            "options": ["Скорость без точности", "Распределение ролей", "Тишина", "Один лидер"],
            "correctIndex": 1,
        },
        {
            "text": f'Какой вариант чаще приводит к лучшему результату в "{topic}"?',
            "options": ["Итерации", "Случайный выбор", "Отсутствие обратной связи", "Пауза"],
            "correctIndex": 0,
        },
        {
            "text": f'Что помогает снизить ошибки при решении задач "{topic}"?',
            "options": [
                "Пропуск проверки",
                "Ограничение времени до 1 секунды",
                "Ревью ответов",
                "Смена темы",
            ],
            "correctIndex": 2,
        },
        {
            "text": f'Какой шаг логичен перед финальным ответом в "{topic}"?',
            "options": ["Перепроверка", "Удаление черновика", "Игнор вопросов", "Выход из комнаты"],
            "correctIndex": 0,
        },
        {
            "text": f'Что обычно усиливает шанс победы в QuizBattle по "{topic}"?',
            "options": ["Споры без решения", "Случайные клики", "Командная координация", "Паузы 5 минут"],
            "correctIndex": 2,
        },
    ]

    return [{"id": str(idx + 1), **item} for idx, item in enumerate(base[:count])]


def next_team(team: Team) -> Team:
    return "B" if team == "A" else "A"


@dataclass
class PlayerConnection:
    peer_id: str
    name: str
    team: Team | None
    is_host: bool
    websocket: WebSocket
    is_captain: bool = False
    avatar: str | None = None


@dataclass
class RoomRuntime:
    room_id: str
    topic: str
    question_count: int
    questions: list[dict[str, Any]]
    players: dict[str, PlayerConnection] = field(default_factory=dict)
    host_peer_id: str = ""
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
    active_answer: dict[str, Any] | None = None
    last_reveal: dict[str, Any] | None = None
    scores: dict[Team, int] = field(default_factory=lambda: {"A": 0, "B": 0})
    chat: list[dict[str, Any]] = field(default_factory=list)
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
    timers: dict[str, asyncio.Task[None] | None] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class QuizRuntime:
    def __init__(self) -> None:
        self.rooms: dict[str, RoomRuntime] = {}
        self.rooms_lock = asyncio.Lock()

    @property
    def active_rooms_count(self) -> int:
        return len(self.rooms)

    async def shutdown(self) -> None:
        async with self.rooms_lock:
            rooms = list(self.rooms.values())
            self.rooms.clear()

        for room in rooms:
            async with room.lock:
                self._clear_timers(room)

    async def handle_websocket(self, websocket: WebSocket) -> None:
        await websocket.accept()

        room_id = sanitize_room_id(websocket.query_params.get("roomId"))
        name = (websocket.query_params.get("name") or "Игрок").strip()[:24] or "Игрок"
        requested_host = websocket.query_params.get("host") == "1"
        topic = (websocket.query_params.get("topic") or "Общая тема").strip()[:80] or "Общая тема"
        question_count = clamp_question_count(websocket.query_params.get("count"))

        if not room_id:
            await self._send_safe(
                websocket,
                {
                    "type": "error",
                    "code": "INVALID_ROOM_ID",
                    "message": "Room id required",
                },
            )
            await websocket.close(code=1008)
            return

        peer_id = random_id()
        room = await self._get_or_create_room(room_id, topic, question_count, peer_id)

        connection_allowed = True
        is_returning_host = False
        is_host = False
        assigned_team: Team | None = None

        async with room.lock:
            if len(room.players) >= MAX_PLAYERS:
                connection_allowed = False
            else:
                is_returning_host = (
                    room.phase == "host-reconnect"
                    and bool(room.host_reconnect_ends_at)
                    and requested_host
                    and normalize_player_name(name) == (room.disconnected_host_expected_name or "")
                )

                is_host = is_returning_host or len(room.players) == 0
                if is_host:
                    room.host_peer_id = peer_id
                    for existing in room.players.values():
                        existing.is_host = False

                is_paused_lobby = (
                    room.phase == "host-reconnect"
                    and room.paused_state is not None
                    and room.paused_state.get("phase") == "lobby"
                )

                if is_host:
                    assigned_team = None
                elif room.phase == "lobby" or is_paused_lobby:
                    assigned_team = None
                else:
                    assigned_team = self._assign_late_join_team(room)

                room.players[peer_id] = PlayerConnection(
                    peer_id=peer_id,
                    name=name,
                    team=assigned_team,
                    is_host=is_host,
                    websocket=websocket,
                )

                await self._send_safe(
                    websocket,
                    {
                        "type": "connected",
                        "peerId": peer_id,
                        "roomId": room_id,
                        "isHost": is_host,
                        "assignedTeam": assigned_team if room.phase != "lobby" else None,
                    },
                )

                if is_returning_host:
                    await self._resume_after_host_reconnect(room)
                else:
                    await self._broadcast_state(room)

                await self._persist_room(room)

        if not connection_allowed:
            await self._send_safe(
                websocket,
                {
                    "type": "error",
                    "code": "ROOM_FULL",
                    "message": "Комната заполнена. Максимум 20 участников.",
                },
            )
            await websocket.close(code=1008)
            return

        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(data, dict):
                    continue

                async with room.lock:
                    player = room.players.get(peer_id)
                    if player is None:
                        continue
                    await self._handle_message(room, player, data)
        except WebSocketDisconnect:
            pass
        finally:
            await self._cleanup_connection(room_id, peer_id)

    async def _handle_message(
        self,
        room: RoomRuntime,
        player: PlayerConnection,
        data: dict[str, Any],
    ) -> None:
        message_type = data.get("type")

        if message_type == "start-game":
            if not player.is_host or room.phase != "lobby":
                return
            await self._start_game(room)
            return

        if message_type == "vote-captain":
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

            self._refresh_captain_vote_progress(room)
            if self._are_all_teams_ready(room.captain_vote_ready_teams):
                await self._finalize_captain_vote(room)
                return

            await self._broadcast_and_persist(room)
            return

        if message_type == "set-team-name":
            if room.phase != "team-naming":
                return
            if not player.team or not player.is_captain:
                return
            if room.team_naming_ready_teams[player.team]:
                return

            fallback = "Команда A" if player.team == "A" else "Команда B"
            next_name = sanitize_team_name(data.get("name"), fallback)
            room.team_names[player.team] = next_name
            room.used_team_names.add(normalize_team_name(next_name))
            room.team_naming_ready_teams[player.team] = True

            if self._are_all_teams_ready(room.team_naming_ready_teams):
                await self._finalize_team_naming(room)
                return

            await self._broadcast_and_persist(room)
            return

        if message_type == "random-team-name":
            if room.phase != "team-naming":
                return
            if not player.team or not player.is_captain:
                return
            if room.team_naming_ready_teams[player.team]:
                return

            fallback = "Команда A" if player.team == "A" else "Команда B"
            random_name = self._get_random_unique_team_name(room, fallback)
            room.team_names[player.team] = random_name
            room.team_naming_ready_teams[player.team] = True

            if self._are_all_teams_ready(room.team_naming_ready_teams):
                await self._finalize_team_naming(room)
                return

            await self._broadcast_and_persist(room)
            return

        if message_type == "submit-answer":
            if room.phase != "question":
                return
            if player.team != room.active_team:
                return
            if not player.is_captain:
                return
            if room.active_answer is not None:
                return

            answer_index_raw = data.get("answerIndex")
            if not isinstance(answer_index_raw, int):
                try:
                    answer_index_raw = int(answer_index_raw)
                except (TypeError, ValueError):
                    return

            room.active_answer = {
                "selectedIndex": answer_index_raw,
                "byPeerId": player.peer_id,
                "byName": player.name,
            }
            await self._finalize_question(room)
            return

        if message_type == "new-game":
            if not player.is_host:
                return
            await self._reset_game(room)
            return

        if message_type == "send-chat":
            text = str(data.get("text") or "").strip()[:280]
            if not text:
                return

            if (
                room.phase == "question"
                and (player.is_host or not player.team or player.team != room.active_team)
            ):
                return

            visibility: str = room.active_team if room.phase == "question" else "all"
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

            await self._broadcast_and_persist(room)

    async def _cleanup_connection(self, room_id: str, peer_id: str) -> None:
        async with self.rooms_lock:
            room = self.rooms.get(room_id)

        if room is None:
            return

        remove_room_from_runtime = False

        async with room.lock:
            removed = room.players.pop(peer_id, None)
            if removed is None:
                return

            self._cleanup_votes_for_player(room, peer_id)

            if not room.players:
                self._clear_timers(room)
                await self._persist_room(room)
                remove_room_from_runtime = True
            else:
                if removed.is_host or room.host_peer_id == peer_id:
                    paused = await self._pause_for_host_reconnect(room, removed.name)
                    if not paused:
                        self._assign_new_host(room)

                if removed.team and room.captains.get(removed.team) == peer_id:
                    room.captains[removed.team] = None
                    if room.phase == "team-naming":
                        room.team_naming_ready_teams[removed.team] = False
                        self._reassign_captain_if_needed(room, removed.team)
                        if room.captains[removed.team] is None:
                            room.team_naming_ready_teams[removed.team] = True
                    self._apply_captain_flags(room)

                if room.phase == "lobby":
                    for player in room.players.values():
                        if not player.is_host:
                            player.team = None
                            player.is_captain = False

                if room.phase == "captain-vote":
                    self._refresh_captain_vote_progress(room)
                    if self._are_all_teams_ready(room.captain_vote_ready_teams):
                        await self._finalize_captain_vote(room)
                        await self._persist_room(room)
                        return

                if room.phase == "team-naming":
                    for team in TEAM_KEYS:
                        members_count = len(self._team_players(room, team))
                        if members_count == 0 or not room.captains.get(team):
                            room.team_naming_ready_teams[team] = True

                    if self._are_all_teams_ready(room.team_naming_ready_teams):
                        await self._finalize_team_naming(room)
                        await self._persist_room(room)
                        return

                await self._broadcast_and_persist(room)

        if remove_room_from_runtime:
            async with self.rooms_lock:
                if self.rooms.get(room_id) is room:
                    self.rooms.pop(room_id, None)

    async def _get_or_create_room(
        self,
        room_id: str,
        topic: str,
        question_count: int,
        host_peer_id: str,
    ) -> RoomRuntime:
        async with self.rooms_lock:
            existing = self.rooms.get(room_id)
            if existing is not None:
                return existing

            room = await self._load_room(room_id, topic, question_count, host_peer_id)
            self.rooms[room_id] = room
            return room

    async def _load_room(
        self,
        room_id: str,
        topic: str,
        question_count: int,
        host_peer_id: str,
    ) -> RoomRuntime:
        try:
            snapshot = await load_room_snapshot(room_id)
        except Exception:
            logger.exception("Failed to load room snapshot for %s", room_id)
            snapshot = None

        if snapshot is None:
            return self._create_room(room_id, topic, question_count, host_peer_id)

        room = self._create_room(
            room_id=room_id,
            topic=str(snapshot.topic or topic)[:80] or topic,
            question_count=clamp_question_count(snapshot.question_count),
            host_peer_id=host_peer_id,
        )
        self._apply_snapshot(room, snapshot.state_json or {})

        # After process restart no sockets are connected, so restart from lobby state.
        if room.phase != "lobby":
            self._reset_room_for_empty_connections(room)

        return room

    def _create_room(
        self,
        room_id: str,
        topic: str,
        question_count: int,
        host_peer_id: str,
    ) -> RoomRuntime:
        return RoomRuntime(
            room_id=room_id,
            topic=topic,
            question_count=question_count,
            questions=create_mock_questions(topic, question_count),
            host_peer_id=host_peer_id,
            timers={},
        )

    def _apply_snapshot(self, room: RoomRuntime, state: dict[str, Any]) -> None:
        if not isinstance(state, dict):
            return

        room.topic = str(state.get("topic", room.topic))[:80] or room.topic
        room.question_count = clamp_question_count(state.get("questionCount", room.question_count))

        questions_raw = state.get("questions")
        if isinstance(questions_raw, list) and questions_raw:
            room.questions = [q for q in questions_raw if isinstance(q, dict)]
        else:
            room.questions = create_mock_questions(room.topic, room.question_count)

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
        }:
            room.phase = cast(Phase, phase_raw)

        room.current_question_index = int(state.get("currentQuestionIndex", room.current_question_index))

        active_team_raw = state.get("activeTeam")
        if active_team_raw in TEAM_KEYS:
            room.active_team = cast(Team, active_team_raw)

        room.question_ends_at = self._as_optional_int(state.get("questionEndsAt"))
        room.team_reveal_ends_at = self._as_optional_int(state.get("teamRevealEndsAt"))
        room.captain_vote_ends_at = self._as_optional_int(state.get("captainVoteEndsAt"))
        room.team_naming_ends_at = self._as_optional_int(state.get("teamNamingEndsAt"))
        room.reveal_ends_at = self._as_optional_int(state.get("revealEndsAt"))
        room.host_reconnect_ends_at = self._as_optional_int(state.get("hostReconnectEndsAt"))

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
        room.paused_state = state.get("pausedState") if isinstance(state.get("pausedState"), dict) else None
        room.active_answer = state.get("activeAnswer") if isinstance(state.get("activeAnswer"), dict) else None
        room.last_reveal = state.get("lastReveal") if isinstance(state.get("lastReveal"), dict) else None

        scores = state.get("scores")
        if isinstance(scores, dict):
            room.scores = {
                "A": int(scores.get("A", 0) or 0),
                "B": int(scores.get("B", 0) or 0),
            }

        chat_raw = state.get("chat")
        if isinstance(chat_raw, list):
            room.chat = [item for item in chat_raw if isinstance(item, dict)][-100:]

        captains = state.get("captains")
        if isinstance(captains, dict):
            room.captains = {
                "A": str(captains.get("A")) if captains.get("A") else None,
                "B": str(captains.get("B")) if captains.get("B") else None,
            }

        captain_votes = state.get("captainVotes")
        if isinstance(captain_votes, dict):
            room.captain_votes = {
                "A": self._sanitize_vote_map(captain_votes.get("A")),
                "B": self._sanitize_vote_map(captain_votes.get("B")),
            }

        captain_ballots = state.get("captainBallots")
        if isinstance(captain_ballots, dict):
            room.captain_ballots = {
                "A": self._sanitize_ballot_map(captain_ballots.get("A")),
                "B": self._sanitize_ballot_map(captain_ballots.get("B")),
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
                normalize_team_name(str(name))
                for name in used_team_names
                if str(name).strip()
            }

    def _serialize_snapshot(self, room: RoomRuntime) -> dict[str, Any]:
        players_payload = [
            {
                "peerId": p.peer_id,
                "name": p.name,
                "team": p.team,
                "isHost": p.is_host,
                "isCaptain": p.is_captain,
                "avatar": p.avatar,
            }
            for p in room.players.values()
        ]

        return {
            "topic": room.topic,
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
            "disconnectedHostName": room.disconnected_host_name,
            "disconnectedHostExpectedName": room.disconnected_host_expected_name,
            "pausedState": room.paused_state,
            "activeAnswer": room.active_answer,
            "lastReveal": room.last_reveal,
            "scores": room.scores,
            "chat": room.chat,
            "captains": room.captains,
            "captainVotes": room.captain_votes,
            "captainBallots": room.captain_ballots,
            "captainVoteReadyTeams": room.captain_vote_ready_teams,
            "teamNamingReadyTeams": room.team_naming_ready_teams,
            "teamNames": room.team_names,
            "usedTeamNames": sorted(room.used_team_names),
            "players": players_payload,
        }

    async def _persist_room(self, room: RoomRuntime) -> None:
        try:
            await save_room_snapshot(
                room_id=room.room_id,
                topic=room.topic,
                question_count=room.question_count,
                state_json=self._serialize_snapshot(room),
            )
        except Exception:
            logger.exception("Failed to persist room snapshot %s", room.room_id)

    async def _persist_game_result(self, room: RoomRuntime) -> None:
        winner_team: Team | None = None
        if room.scores["A"] > room.scores["B"]:
            winner_team = "A"
        elif room.scores["B"] > room.scores["A"]:
            winner_team = "B"

        try:
            await save_game_result(
                room_id=room.room_id,
                team_a_name=room.team_names["A"],
                team_b_name=room.team_names["B"],
                score_a=room.scores["A"],
                score_b=room.scores["B"],
                winner_team=winner_team,
                payload_json={
                    "scores": room.scores,
                    "teamNames": room.team_names,
                    "winnerTeam": winner_team,
                    "finishedAt": now_ms(),
                },
            )
        except Exception:
            logger.exception("Failed to persist game result for room %s", room.room_id)

    async def _broadcast_and_persist(self, room: RoomRuntime) -> None:
        await self._broadcast_state(room)
        await self._persist_room(room)

    async def _send_safe(self, websocket: WebSocket, data: dict[str, Any]) -> None:
        try:
            await websocket.send_json(data)
        except Exception:
            # Connection may already be closed.
            pass

    async def _broadcast_state(self, room: RoomRuntime) -> None:
        payloads: list[tuple[WebSocket, dict[str, Any]]] = []
        for player in list(room.players.values()):
            payloads.append((player.websocket, self._build_state(room, player)))

        for websocket, payload in payloads:
            await self._send_safe(websocket, payload)

    def _can_player_see_message(
        self,
        player: PlayerConnection,
        room: RoomRuntime,
        message: dict[str, Any],
    ) -> bool:
        if player.is_host:
            return True

        visibility = str(message.get("visibility") or "all")

        if room.phase == "question":
            if player.team != room.active_team:
                return False
            return visibility in {"all", room.active_team}

        if visibility == "all":
            return True
        return player.team == visibility

    def _build_votes_for_viewer(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
    ) -> dict[Team, dict[str, int]]:
        if viewer.is_host:
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

    def _build_captain_vote_progress(self, room: RoomRuntime) -> dict[Team, dict[str, int]]:
        return {
            "A": {
                "votes": self._team_votes_count(room, "A"),
                "total": len(self._team_players(room, "A")),
            },
            "B": {
                "votes": self._team_votes_count(room, "B"),
                "total": len(self._team_players(room, "B")),
            },
        }

    def _get_viewer_captain_vote(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
    ) -> str | None:
        if not viewer.team or viewer.is_host:
            return None
        return room.captain_ballots[viewer.team].get(viewer.peer_id)

    def _visible_team_for_viewer(
        self,
        room: RoomRuntime,
        viewer: PlayerConnection,
        target_player: PlayerConnection,
    ) -> Team | None:
        is_paused_lobby = room.phase == "host-reconnect" and (
            room.paused_state is not None and room.paused_state.get("phase") == "lobby"
        )

        if room.phase == "lobby" or is_paused_lobby:
            return None
        if viewer.is_host:
            return target_player.team
        if not viewer.team:
            return None
        return target_player.team

    def _build_state(self, room: RoomRuntime, viewer: PlayerConnection) -> dict[str, Any]:
        players_payload = []
        for player in room.players.values():
            players_payload.append(
                {
                    "peerId": player.peer_id,
                    "name": player.name,
                    "team": self._visible_team_for_viewer(room, viewer, player),
                    "isHost": player.is_host,
                    "isCaptain": player.is_captain,
                }
            )

        chat_payload = []
        for message in room.chat[-100:]:
            if not self._can_player_see_message(viewer, room, message):
                continue
            chat_payload.append(
                {
                    "id": message.get("id"),
                    "from": message.get("from"),
                    "name": message.get("name"),
                    "text": message.get("text"),
                    "timestamp": message.get("timestamp"),
                }
            )

        current_question: dict[str, Any] | None = None
        if room.current_question_index >= 0 and room.current_question_index < len(room.questions):
            current_question = room.questions[room.current_question_index]

        return {
            "type": "state-sync",
            "serverTime": now_ms(),
            "room": {
                "roomId": room.room_id,
                "topic": room.topic,
                "questionCount": room.question_count,
                "phase": room.phase,
                "currentQuestionIndex": room.current_question_index,
                "activeTeam": room.active_team,
                "questionEndsAt": room.question_ends_at,
                "teamRevealEndsAt": room.team_reveal_ends_at,
                "captainVoteEndsAt": room.captain_vote_ends_at,
                "teamNamingEndsAt": room.team_naming_ends_at,
                "hostReconnectEndsAt": room.host_reconnect_ends_at,
                "disconnectedHostName": room.disconnected_host_name,
                "scores": room.scores,
                "teamNames": room.team_names,
                "captains": room.captains,
                "captainVotes": self._build_votes_for_viewer(room, viewer),
                "myCaptainVote": self._get_viewer_captain_vote(room, viewer),
                "captainVoteReadyTeams": room.captain_vote_ready_teams,
                "captainVoteProgress": self._build_captain_vote_progress(room),
                "teamNamingReadyTeams": room.team_naming_ready_teams,
                "players": players_payload,
                "currentQuestion": current_question,
                "lastReveal": room.last_reveal,
                "chat": chat_payload,
            },
        }

    def _cancel_timer(self, room: RoomRuntime, key: str) -> None:
        task = room.timers.get(key)
        if task and not task.done():
            task.cancel()
        room.timers[key] = None

    def _clear_timers(self, room: RoomRuntime) -> None:
        for key in [
            "question",
            "reveal",
            "teamReveal",
            "captainVote",
            "teamNaming",
            "hostReconnect",
        ]:
            self._cancel_timer(room, key)

    def _schedule_timer(
        self,
        room: RoomRuntime,
        key: str,
        delay_ms: int,
        callback: Any,
    ) -> None:
        self._cancel_timer(room, key)
        delay_s = max(0.12, (delay_ms or 0) / 1000)

        async def runner() -> None:
            try:
                await asyncio.sleep(delay_s)
            except asyncio.CancelledError:
                return
            async with room.lock:
                await callback(room)

        room.timers[key] = asyncio.create_task(runner(), name=f"{room.room_id}:{key}")

    def _reset_captain_state(self, room: RoomRuntime) -> None:
        room.captain_votes = {"A": {}, "B": {}}
        room.captain_ballots = {"A": {}, "B": {}}
        room.captains = {"A": None, "B": None}
        room.captain_vote_ready_teams = {"A": False, "B": False}
        room.team_naming_ready_teams = {"A": False, "B": False}
        for player in room.players.values():
            player.is_captain = False

    def _team_players(self, room: RoomRuntime, team: Team) -> list[PlayerConnection]:
        return [player for player in room.players.values() if not player.is_host and player.team == team]

    def _random_item(self, items: list[Any]) -> Any:
        if not items:
            return None
        return random.choice(items)

    def _shuffle(self, items: list[Any]) -> list[Any]:
        copy = list(items)
        random.shuffle(copy)
        return copy

    def _assign_teams_for_start(self, room: RoomRuntime) -> None:
        candidates = self._shuffle([player for player in room.players.values() if not player.is_host])
        switch_team: Team = "A"
        for player in candidates:
            player.team = switch_team
            switch_team = next_team(switch_team)

    def _team_counts(self, room: RoomRuntime) -> dict[str, int]:
        a = 0
        b = 0
        for player in room.players.values():
            if player.is_host:
                continue
            if player.team == "A":
                a += 1
            if player.team == "B":
                b += 1
        return {"a": a, "b": b}

    def _assign_late_join_team(self, room: RoomRuntime) -> Team:
        counts = self._team_counts(room)
        return "A" if counts["a"] <= counts["b"] else "B"

    def _choose_captain_by_votes(self, room: RoomRuntime, team: Team) -> str | None:
        players = self._team_players(room, team)
        if not players:
            return None

        vote_entries = list(room.captain_votes[team].items())
        if not vote_entries:
            candidate = self._random_item(players)
            return candidate.peer_id if candidate else None

        max_votes = max(int(count or 0) for _, count in vote_entries)
        leaders = [
            peer_id
            for peer_id, count in vote_entries
            if int(count or 0) == max_votes
            and any(player.peer_id == peer_id for player in players)
        ]

        if not leaders:
            candidate = self._random_item(players)
            return candidate.peer_id if candidate else None

        return cast(str | None, self._random_item(leaders))

    def _apply_captain_flags(self, room: RoomRuntime) -> None:
        for player in room.players.values():
            if player.is_host:
                player.is_captain = False
                continue
            player.is_captain = (
                (player.team == "A" and room.captains["A"] == player.peer_id)
                or (player.team == "B" and room.captains["B"] == player.peer_id)
            )

    def _team_votes_count(self, room: RoomRuntime, team: Team) -> int:
        return sum(max(0, int(count or 0)) for count in room.captain_votes[team].values())

    def _is_captain_vote_ready_for_team(self, room: RoomRuntime, team: Team) -> bool:
        members_count = len(self._team_players(room, team))
        if members_count == 0:
            return True
        return self._team_votes_count(room, team) >= members_count

    def _are_all_teams_ready(self, ready_map: dict[Team, bool]) -> bool:
        return all(bool(ready_map.get(team)) for team in TEAM_KEYS)

    def _refresh_captain_vote_progress(self, room: RoomRuntime) -> None:
        for team in TEAM_KEYS:
            ready = self._is_captain_vote_ready_for_team(room, team)
            room.captain_vote_ready_teams[team] = ready

            if ready:
                room.captains[team] = room.captains[team] or self._choose_captain_by_votes(room, team)
            else:
                room.captains[team] = None

        self._apply_captain_flags(room)

    def _initialize_team_naming_progress(self, room: RoomRuntime) -> None:
        for team in TEAM_KEYS:
            members_count = len(self._team_players(room, team))
            if members_count == 0:
                room.team_naming_ready_teams[team] = True
            else:
                room.team_naming_ready_teams[team] = room.captains[team] is None

    async def _start_question_phase(self, room: RoomRuntime) -> None:
        room.phase = "question"
        room.question_ends_at = now_ms() + QUESTION_TIME_MS
        room.team_reveal_ends_at = None
        room.captain_vote_ends_at = None
        room.team_naming_ends_at = None
        room.active_answer = None
        room.last_reveal = None
        room.reveal_ends_at = None

        self._schedule_timer(room, "question", QUESTION_TIME_MS, self._finalize_question)
        await self._broadcast_and_persist(room)

    async def _finalize_question(self, room: RoomRuntime) -> None:
        if room.phase != "question" or room.current_question_index < 0:
            return

        self._cancel_timer(room, "question")

        if room.current_question_index >= len(room.questions):
            return

        question = room.questions[room.current_question_index]
        selected = room.active_answer
        selected_index = selected.get("selectedIndex") if isinstance(selected, dict) else None
        is_correct = selected_index == question.get("correctIndex")
        points_awarded = 10 if is_correct else 0

        if points_awarded > 0:
            room.scores[room.active_team] += points_awarded

        room.chat = []
        room.phase = "reveal"
        room.question_ends_at = None
        room.reveal_ends_at = now_ms() + REVEAL_TIME_MS
        room.last_reveal = {
            "correctIndex": question.get("correctIndex"),
            "selectedIndex": selected_index,
            "answeredBy": selected.get("byPeerId") if isinstance(selected, dict) else None,
            "answeredByName": selected.get("byName") if isinstance(selected, dict) else None,
            "team": room.active_team,
            "isCorrect": is_correct,
            "pointsAwarded": points_awarded,
        }

        self._schedule_timer(room, "reveal", REVEAL_TIME_MS, self._advance_after_reveal)
        await self._broadcast_and_persist(room)

    async def _advance_after_reveal(self, room: RoomRuntime) -> None:
        if room.phase != "reveal":
            return

        self._cancel_timer(room, "reveal")
        room.reveal_ends_at = None

        if room.current_question_index >= room.question_count - 1:
            room.phase = "results"
            room.question_ends_at = None
            room.active_answer = None
            await self._broadcast_and_persist(room)
            await self._persist_game_result(room)
            return

        room.current_question_index += 1
        room.chat = []
        room.active_team = next_team(room.active_team)
        await self._start_question_phase(room)

    def _get_phase_remaining_ms_for_pause(self, room: RoomRuntime, phase: Phase) -> int:
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

    def _schedule_phase_timer(self, room: RoomRuntime, phase: Phase, remaining_ms: int) -> None:
        delay = max(120, int(remaining_ms or 0))
        ends_at = now_ms() + delay

        if phase == "question":
            room.question_ends_at = ends_at
            self._schedule_timer(room, "question", delay, self._finalize_question)
            return

        if phase == "team-reveal":
            room.team_reveal_ends_at = ends_at
            self._schedule_timer(room, "teamReveal", delay, self._start_captain_vote)
            return

        if phase == "captain-vote":
            room.captain_vote_ends_at = ends_at
            self._schedule_timer(room, "captainVote", delay, self._finalize_captain_vote)
            return

        if phase == "team-naming":
            room.team_naming_ends_at = ends_at
            self._schedule_timer(room, "teamNaming", delay, self._finalize_team_naming)
            return

        if phase == "reveal":
            room.reveal_ends_at = ends_at
            self._schedule_timer(room, "reveal", delay, self._advance_after_reveal)

    async def _resume_after_host_reconnect(self, room: RoomRuntime) -> None:
        if room.paused_state is None:
            room.host_reconnect_ends_at = None
            room.disconnected_host_name = None
            room.disconnected_host_expected_name = None
            await self._broadcast_and_persist(room)
            return

        self._clear_timers(room)

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
        }:
            snapshot_phase_raw = "lobby"

        snapshot_phase = cast(Phase, snapshot_phase_raw)
        snapshot_remaining_ms = int(snapshot.get("remainingMs", 0) or 0)

        room.phase = snapshot_phase
        room.host_reconnect_ends_at = None
        room.disconnected_host_name = None
        room.disconnected_host_expected_name = None
        room.paused_state = None

        room.question_ends_at = None
        room.team_reveal_ends_at = None
        room.captain_vote_ends_at = None
        room.team_naming_ends_at = None
        room.reveal_ends_at = None

        self._schedule_phase_timer(room, snapshot_phase, snapshot_remaining_ms)
        await self._broadcast_and_persist(room)

    def _assign_new_host(self, room: RoomRuntime) -> PlayerConnection | None:
        candidate: PlayerConnection | None = None
        for player in room.players.values():
            player.is_host = False
            if candidate is None:
                candidate = player

        if candidate is None:
            return None

        candidate.is_host = True
        room.host_peer_id = candidate.peer_id
        if room.phase == "lobby":
            candidate.team = None
        return candidate

    def _should_pause_on_host_disconnect(self, phase: Phase) -> bool:
        return phase in {
            "lobby",
            "team-reveal",
            "captain-vote",
            "team-naming",
            "question",
            "reveal",
        }

    async def _pause_for_host_reconnect(self, room: RoomRuntime, host_name: str | None) -> bool:
        if not self._should_pause_on_host_disconnect(room.phase):
            return False

        previous_phase = room.phase
        remaining_ms = self._get_phase_remaining_ms_for_pause(room, previous_phase)

        self._clear_timers(room)

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
        room.disconnected_host_name = host_name or "Ведущий"
        room.disconnected_host_expected_name = normalize_player_name(host_name)

        await self._broadcast_and_persist(room)

        async def after_reconnect_timeout(inner_room: RoomRuntime) -> None:
            if inner_room.phase != "host-reconnect":
                return
            self._assign_new_host(inner_room)
            await self._resume_after_host_reconnect(inner_room)

        self._schedule_timer(
            room,
            "hostReconnect",
            HOST_RECONNECT_WAIT_MS,
            after_reconnect_timeout,
        )

        return True

    async def _finalize_team_naming(self, room: RoomRuntime) -> None:
        if room.phase != "team-naming":
            return

        self._cancel_timer(room, "teamNaming")
        room.team_naming_ready_teams = {"A": True, "B": True}

        room.current_question_index = 0
        room.active_team = "A"
        room.chat = []
        room.last_reveal = None
        room.active_answer = None
        room.scores = {"A": 0, "B": 0}

        await self._start_question_phase(room)

    async def _finalize_captain_vote(self, room: RoomRuntime) -> None:
        if room.phase != "captain-vote":
            return

        self._cancel_timer(room, "captainVote")

        room.captains = {
            "A": room.captains["A"] or self._choose_captain_by_votes(room, "A"),
            "B": room.captains["B"] or self._choose_captain_by_votes(room, "B"),
        }
        room.captain_vote_ready_teams = {"A": True, "B": True}
        self._apply_captain_flags(room)

        room.phase = "team-naming"
        room.captain_vote_ends_at = None
        room.team_naming_ends_at = now_ms() + TEAM_NAMING_TIME_MS
        self._initialize_team_naming_progress(room)

        if self._are_all_teams_ready(room.team_naming_ready_teams):
            await self._finalize_team_naming(room)
            return

        self._schedule_timer(room, "teamNaming", TEAM_NAMING_TIME_MS, self._finalize_team_naming)
        await self._broadcast_and_persist(room)

    async def _start_captain_vote(self, room: RoomRuntime) -> None:
        room.phase = "captain-vote"
        room.team_reveal_ends_at = None
        room.captain_vote_ends_at = now_ms() + CAPTAIN_VOTE_TIME_MS
        room.team_naming_ends_at = None
        room.team_naming_ready_teams = {"A": False, "B": False}
        room.captains = {"A": None, "B": None}
        room.captain_vote_ready_teams = {"A": False, "B": False}

        self._refresh_captain_vote_progress(room)

        if self._are_all_teams_ready(room.captain_vote_ready_teams):
            await self._finalize_captain_vote(room)
            return

        self._schedule_timer(room, "captainVote", CAPTAIN_VOTE_TIME_MS, self._finalize_captain_vote)
        await self._broadcast_and_persist(room)

    async def _start_game(self, room: RoomRuntime) -> None:
        self._clear_timers(room)
        self._reset_captain_state(room)

        room.host_reconnect_ends_at = None
        room.disconnected_host_name = None
        room.disconnected_host_expected_name = None
        room.paused_state = None
        room.team_names = {"A": "Команда A", "B": "Команда B"}

        self._assign_teams_for_start(room)

        room.phase = "team-reveal"
        room.current_question_index = -1
        room.active_team = "A"
        room.question_ends_at = None
        room.team_reveal_ends_at = now_ms() + TEAM_REVEAL_TIME_MS
        room.captain_vote_ends_at = None
        room.team_naming_ends_at = None
        room.reveal_ends_at = None
        room.chat = []
        room.active_answer = None
        room.last_reveal = None
        room.scores = {"A": 0, "B": 0}

        self._schedule_timer(room, "teamReveal", TEAM_REVEAL_TIME_MS, self._start_captain_vote)
        await self._broadcast_and_persist(room)

    async def _reset_game(self, room: RoomRuntime) -> None:
        self._clear_timers(room)
        room.questions = create_mock_questions(room.topic, room.question_count)
        room.phase = "lobby"
        room.current_question_index = -1
        room.active_team = "A"
        room.question_ends_at = None
        room.team_reveal_ends_at = None
        room.captain_vote_ends_at = None
        room.team_naming_ends_at = None
        room.reveal_ends_at = None
        room.host_reconnect_ends_at = None
        room.disconnected_host_name = None
        room.disconnected_host_expected_name = None
        room.paused_state = None
        room.active_answer = None
        room.chat = []
        room.last_reveal = None
        room.scores = {"A": 0, "B": 0}

        self._reset_captain_state(room)
        room.team_names = {"A": "Команда A", "B": "Команда B"}

        for player in room.players.values():
            if not player.is_host:
                player.team = None

        await self._broadcast_and_persist(room)

    def _get_random_unique_team_name(self, room: RoomRuntime, fallback: str) -> str:
        available = [
            name
            for name in DYNAMIC_TEAM_NAMES
            if normalize_team_name(name) not in room.used_team_names
        ]

        if not available:
            return fallback

        selected = cast(str, self._random_item(available))
        room.used_team_names.add(normalize_team_name(selected))
        return selected

    def _reassign_captain_if_needed(self, room: RoomRuntime, team: Team) -> None:
        if room.captains.get(team):
            return

        players = self._team_players(room, team)
        candidate = self._random_item(players)
        room.captains[team] = candidate.peer_id if candidate else None
        self._apply_captain_flags(room)

    def _cleanup_votes_for_player(self, room: RoomRuntime, peer_id: str) -> None:
        for team in TEAM_KEYS:
            previous_candidate = room.captain_ballots[team].get(peer_id)
            if previous_candidate:
                current_count = room.captain_votes[team].get(previous_candidate, 0)
                next_count = max(0, current_count - 1)
                if next_count == 0:
                    room.captain_votes[team].pop(previous_candidate, None)
                else:
                    room.captain_votes[team][previous_candidate] = next_count

            room.captain_ballots[team].pop(peer_id, None)
            room.captain_votes[team].pop(peer_id, None)

            voters_to_delete = [
                voter_peer_id
                for voter_peer_id, candidate_peer_id in room.captain_ballots[team].items()
                if candidate_peer_id == peer_id
            ]
            for voter_peer_id in voters_to_delete:
                room.captain_ballots[team].pop(voter_peer_id, None)

    def _reset_room_for_empty_connections(self, room: RoomRuntime) -> None:
        self._clear_timers(room)
        room.phase = "lobby"
        room.current_question_index = -1
        room.active_team = "A"
        room.question_ends_at = None
        room.team_reveal_ends_at = None
        room.captain_vote_ends_at = None
        room.team_naming_ends_at = None
        room.reveal_ends_at = None
        room.host_reconnect_ends_at = None
        room.disconnected_host_name = None
        room.disconnected_host_expected_name = None
        room.paused_state = None
        room.active_answer = None
        room.last_reveal = None
        room.scores = {"A": 0, "B": 0}
        room.chat = []
        room.players = {}
        room.host_peer_id = ""
        room.questions = create_mock_questions(room.topic, room.question_count)
        self._reset_captain_state(room)
        room.team_names = {"A": "Команда A", "B": "Команда B"}

    def _sanitize_vote_map(self, raw: Any) -> dict[str, int]:
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

    def _sanitize_ballot_map(self, raw: Any) -> dict[str, str]:
        if not isinstance(raw, dict):
            return {}
        output: dict[str, str] = {}
        for key, value in raw.items():
            if not isinstance(key, str) or not isinstance(value, str):
                continue
            output[key] = value
        return output

    def _as_optional_int(self, value: Any) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None


runtime = QuizRuntime()
