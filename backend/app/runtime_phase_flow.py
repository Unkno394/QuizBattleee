from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from .runtime_constants import CAPTAIN_VOTE_TIME_MS, TEAM_NAMING_TIME_MS, TEAM_REVEAL_TIME_MS
from .runtime_utils import create_mock_questions, now_ms

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from .runtime import QuizRuntime
    from .runtime_types import RoomRuntime


async def advance_after_reveal(runtime: "QuizRuntime", room: "RoomRuntime") -> None:
    if room.phase != "reveal":
        return

    runtime._cancel_timer(room, "reveal")
    room.reveal_ends_at = None

    if room.game_mode == "ffa":
        if room.current_question_index >= room.question_count - 1:
            room.phase = "results"
            room.question_ends_at = None
            room.active_answer = None
            room.answer_submissions = {}
            logger.warning("advance_after_reveal -> results room=%s mode=ffa", room.room_id)
            runtime._append_result_event(room, "Игра завершена. Переход к финальной статистике.", kind="phase")
            runtime._schedule_persist_game_result(room)
            await runtime._broadcast_and_persist(room)
            return

        room.current_question_index += 1
        room.chat = []
        room.last_reveal = None
        room.active_answer = None
        room.answer_submissions = {}
        await runtime._start_question_phase(room)
        return

    if room.game_mode == "chaos":
        if room.current_question_index >= room.question_count - 1:
            room.phase = "results"
            room.question_ends_at = None
            room.active_answer = None
            room.answer_submissions = {}
            logger.warning("advance_after_reveal -> results room=%s mode=chaos", room.room_id)
            runtime._append_result_event(room, "Игра завершена. Переход к финальной статистике.", kind="phase")
            runtime._schedule_persist_game_result(room)
            await runtime._broadcast_and_persist(room)
            return

        room.current_question_index += 1
        room.chat = []
        room.last_reveal = None
        room.active_answer = None
        room.answer_submissions = {}
        room.active_team = "A"
        await runtime._start_question_phase(room)
        return

    # Classic mode: if host skipped the question, jump to the next question for all.
    skipped_by_host = isinstance(room.last_reveal, dict) and bool(room.last_reveal.get("skippedByHost"))
    if skipped_by_host:
        if room.current_question_index >= room.question_count - 1:
            room.phase = "results"
            room.question_ends_at = None
            room.active_answer = None
            room.answer_submissions = {}
            logger.warning("advance_after_reveal -> results room=%s mode=classic skipped_by_host=1", room.room_id)
            runtime._append_result_event(room, "Игра завершена. Переход к финальной статистике.", kind="phase")
            runtime._schedule_persist_game_result(room)
            await runtime._broadcast_and_persist(room)
            return

        room.current_question_index += 1
        room.chat = []
        room.active_answer = None
        room.answer_submissions = {}
        room.last_reveal = None
        room.active_team = "A"
        await runtime._start_question_phase(room)
        return

    # Team modes: each question is answered by A, then B.
    if room.active_team == "A":
        room.chat = []
        room.active_answer = None
        room.answer_submissions = {}
        room.last_reveal = None
        room.active_team = "B"
        await runtime._start_question_phase(room)
        return

    if room.current_question_index >= room.question_count - 1:
        room.phase = "results"
        room.question_ends_at = None
        room.active_answer = None
        room.answer_submissions = {}
        logger.warning("advance_after_reveal -> results room=%s mode=classic skipped_by_host=0", room.room_id)
        runtime._append_result_event(room, "Игра завершена. Переход к финальной статистике.", kind="phase")
        runtime._schedule_persist_game_result(room)
        await runtime._broadcast_and_persist(room)
        return

    room.current_question_index += 1
    room.chat = []
    room.active_team = "A"
    room.answer_submissions = {}
    await runtime._start_question_phase(room)


async def finalize_team_naming(runtime: "QuizRuntime", room: "RoomRuntime") -> None:
    if room.phase != "team-naming":
        return

    runtime._cancel_timer(room, "teamNaming")
    room.team_naming_ready_teams = {"A": True, "B": True}

    room.current_question_index = 0
    room.active_team = "A"
    room.chat = []
    room.last_reveal = None
    room.active_answer = None
    room.answer_submissions = {}
    room.skip_requesters = set()
    room.skip_request_status = "idle"
    room.skip_request_message_id = None
    room.scores = {"A": 0, "B": 0}
    room.player_scores = {}

    await runtime._start_question_phase(room)


async def start_team_naming_phase(runtime: "QuizRuntime", room: "RoomRuntime") -> None:
    room.phase = "team-naming"
    room.team_reveal_ends_at = None
    room.captain_vote_ends_at = None
    room.team_naming_ends_at = now_ms() + TEAM_NAMING_TIME_MS
    runtime._initialize_team_naming_progress(room)
    logger.warning(
        "start_team_naming_phase room=%s captains=%s ready=%s",
        room.room_id,
        room.captains,
        room.team_naming_ready_teams,
    )

    if runtime._are_all_teams_ready(room.team_naming_ready_teams):
        await runtime._finalize_team_naming(room)
        return

    runtime._schedule_timer(room, "teamNaming", TEAM_NAMING_TIME_MS, runtime._finalize_team_naming)
    await runtime._broadcast_and_persist(room)


async def finalize_captain_vote(runtime: "QuizRuntime", room: "RoomRuntime") -> None:
    if room.phase != "captain-vote":
        return

    logger.warning(
        "finalize_captain_vote room=%s game_mode=%s votes=%s captains_before=%s ready_before=%s",
        room.room_id,
        room.game_mode,
        room.captain_votes,
        room.captains,
        room.captain_vote_ready_teams,
    )
    runtime._cancel_timer(room, "captainVote")
    runtime._cancel_timer(room, "captainAuto")

    if room.game_mode != "classic":
        room.captains = {"A": None, "B": None}
        room.captain_vote_ready_teams = {"A": True, "B": True}
        runtime._apply_captain_flags(room)
        await runtime._start_team_naming_phase(room)
        return

    room.captains = {
        "A": room.captains["A"] or runtime._choose_captain_by_votes(room, "A"),
        "B": room.captains["B"] or runtime._choose_captain_by_votes(room, "B"),
    }
    room.captain_vote_ready_teams = {"A": True, "B": True}
    runtime._apply_captain_flags(room)
    logger.warning(
        "finalize_captain_vote done room=%s captains=%s",
        room.room_id,
        room.captains,
    )

    await runtime._start_team_naming_phase(room)


async def start_captain_vote(runtime: "QuizRuntime", room: "RoomRuntime") -> None:
    if room.game_mode != "classic":
        await runtime._start_team_naming_phase(room)
        return

    room.phase = "captain-vote"
    room.team_reveal_ends_at = None
    captain_vote_timeout_ms = runtime._captain_vote_timeout_ms(room)
    room.captain_vote_ends_at = now_ms() + captain_vote_timeout_ms
    room.team_naming_ends_at = None
    room.team_naming_ready_teams = {"A": False, "B": False}
    room.captains = {"A": None, "B": None}
    room.captain_vote_ready_teams = {"A": False, "B": False}

    team_sizes = {team: len(runtime._team_players(room, team)) for team in ("A", "B")}
    single_member_fast_path = runtime._all_non_empty_teams_single_member(room)
    if not single_member_fast_path:
        runtime._refresh_captain_vote_progress(room)
        runtime._schedule_single_member_auto_captain(room)

    if not single_member_fast_path and runtime._are_all_teams_ready(room.captain_vote_ready_teams):
        await runtime._finalize_captain_vote(room)
        return

    logger.warning(
        "captain_vote started room=%s timeout_ms=%s team_sizes=%s single_member_fast_path=%s",
        room.room_id,
        captain_vote_timeout_ms,
        team_sizes,
        single_member_fast_path,
    )
    runtime._schedule_timer(room, "captainVote", captain_vote_timeout_ms, runtime._finalize_captain_vote)
    await runtime._broadcast_and_persist(room)


async def after_team_reveal(runtime: "QuizRuntime", room: "RoomRuntime") -> None:
    if room.phase != "team-reveal":
        return
    if room.game_mode == "classic":
        await runtime._start_captain_vote(room)
        return
    await runtime._start_team_naming_phase(room)


async def start_game(runtime: "QuizRuntime", room: "RoomRuntime") -> None:
    participant_count = len(runtime._active_non_host_players(room))
    if participant_count == 0:
        runtime._append_system_chat_message(room, "Нельзя начать игру: в комнате нет участников.", kind="system")
        await runtime._broadcast_and_persist(room)
        return

    if room.game_mode in {"classic", "chaos"} and participant_count < 2:
        runtime._append_system_chat_message(
            room,
            "Нельзя начать игру: для режима Что? Где? Когда? и Командный хаос нужно минимум 2 участника.",
            kind="system",
        )
        await runtime._broadcast_and_persist(room)
        return

    if room.question_source == "generated":
        try:
            await runtime._populate_generated_room_questions(room)
        except Exception:
            runtime._append_system_chat_message(
                room,
                "Не удалось сгенерировать вопросы по этой теме. Выберите тему из готового списка или попробуйте позже.",
                kind="system",
            )
            await runtime._broadcast_and_persist(room)
            return
    else:
        room.questions = create_mock_questions(room.topic, room.question_count, room.difficulty_mode)

    runtime._clear_timers(room)
    runtime._reset_captain_state(room)

    room.host_reconnect_ends_at = None
    room.disconnected_host_name = None
    room.disconnected_host_expected_name = None
    room.paused_state = None
    room.team_names = {"A": "Команда A", "B": "Команда B"}
    room.current_question_index = -1
    room.active_team = "A"
    room.question_ends_at = None
    room.team_reveal_ends_at = None
    room.captain_vote_ends_at = None
    room.team_naming_ends_at = None
    room.reveal_ends_at = None
    room.chat = []
    room.active_answer = None
    room.answer_submissions = {}
    room.skip_requesters = set()
    room.skip_request_status = "idle"
    room.skip_request_message_id = None
    room.last_reveal = None
    room.scores = {"A": 0, "B": 0}
    room.player_scores = {}
    room.player_stats = {}
    room.question_history = []
    room.event_history = []
    room.chat_moderation_strikes = {}

    if room.game_mode == "ffa":
        for player in room.players.values():
            if not player.is_host:
                player.is_spectator = False
                player.team = None
                player.is_captain = False
        runtime._initialize_result_tracking(room)
        runtime._append_result_event(room, "Игра началась (Все против всех).", kind="phase")
        room.current_question_index = 0
        await runtime._start_question_phase(room)
        return

    runtime._assign_teams_for_start(room)
    runtime._initialize_result_tracking(room)
    runtime._append_result_event(room, f"Игра началась ({room.game_mode}).", kind="phase")
    room.phase = "team-reveal"
    room.team_reveal_ends_at = now_ms() + TEAM_REVEAL_TIME_MS
    runtime._schedule_timer(room, "teamReveal", TEAM_REVEAL_TIME_MS, runtime._after_team_reveal)
    await runtime._broadcast_and_persist(room)


async def reset_game(
    runtime: "QuizRuntime",
    room: "RoomRuntime",
    system_message: str | None = None,
) -> None:
    runtime._clear_timers(room)
    runtime._cleanup_generated_questions_file(room)
    if room.question_source == "catalog":
        room.questions = create_mock_questions(room.topic, room.question_count, room.difficulty_mode)
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
    room.manual_pause_by_name = None
    room.active_answer = None
    room.answer_submissions = {}
    room.skip_requesters = set()
    room.skip_request_status = "idle"
    room.skip_request_message_id = None
    room.chat = []
    room.last_reveal = None
    room.scores = {"A": 0, "B": 0}
    room.player_scores = {}
    room.player_stats = {}
    room.question_history = []
    room.event_history = []
    room.chat_moderation_strikes = {}
    room.results_recorded = False

    runtime._reset_captain_state(room)
    room.team_names = {"A": "Команда A", "B": "Команда B"}

    for player in room.players.values():
        if not player.is_host:
            player.is_spectator = False
            player.team = None

    if system_message:
        runtime._append_system_chat_message(room, system_message)

    await runtime._broadcast_and_persist(room)
