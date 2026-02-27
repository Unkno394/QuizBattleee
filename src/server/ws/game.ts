import { QUESTION_TIME_MS, REVEAL_TIME_MS, createMockQuestions } from "./core";
import { broadcastState } from "./state";
import type { Room, Team } from "./types";

export const clearRoomTimers = (room: Room) => {
  if (room.timers.question) clearTimeout(room.timers.question);
  if (room.timers.reveal) clearTimeout(room.timers.reveal);
  room.timers.question = undefined;
  room.timers.reveal = undefined;
};

export const teamCounts = (room: Room) => {
  let a = 0;
  let b = 0;
  room.players.forEach((player) => {
    if (player.team === "A") a += 1;
    if (player.team === "B") b += 1;
  });
  return { a, b };
};

export const nextTeam = (team: Team): Team => (team === "A" ? "B" : "A");

const switchToResults = (room: Room) => {
  room.phase = "results";
  room.questionEndsAt = null;
  room.activeAnswer = null;
  broadcastState(room);
};

const startQuestion = (room: Room) => {
  room.phase = "question";
  room.questionEndsAt = Date.now() + QUESTION_TIME_MS;
  room.activeAnswer = null;
  room.lastReveal = null;

  if (room.timers.question) clearTimeout(room.timers.question);
  room.timers.question = setTimeout(() => {
    finalizeQuestion(room);
  }, QUESTION_TIME_MS);

  broadcastState(room);
};

const advanceQuestion = (room: Room) => {
  if (room.currentQuestionIndex >= room.questionCount - 1) {
    switchToResults(room);
    return;
  }

  room.chat = [];
  room.currentQuestionIndex += 1;
  room.activeTeam = nextTeam(room.activeTeam);
  startQuestion(room);
};

export const finalizeQuestion = (room: Room) => {
  if (room.phase !== "question" || room.currentQuestionIndex < 0) return;

  if (room.timers.question) {
    clearTimeout(room.timers.question);
    room.timers.question = undefined;
  }

  const question = room.questions[room.currentQuestionIndex];
  const selected = room.activeAnswer;
  const selectedIndex = selected?.selectedIndex ?? null;
  const isCorrect = selectedIndex === question.correctIndex;
  const pointsAwarded = isCorrect ? 10 : 0;

  if (pointsAwarded > 0) {
    room.scores[room.activeTeam] += pointsAwarded;
  }

  room.chat = [];
  room.phase = "reveal";
  room.questionEndsAt = null;
  room.lastReveal = {
    correctIndex: question.correctIndex,
    selectedIndex,
    answeredBy: selected?.byPeerId ?? null,
    answeredByName: selected?.byName ?? null,
    team: room.activeTeam,
    isCorrect,
    pointsAwarded,
  };

  broadcastState(room);

  if (room.timers.reveal) clearTimeout(room.timers.reveal);
  room.timers.reveal = setTimeout(() => {
    advanceQuestion(room);
  }, REVEAL_TIME_MS);
};

export const startGame = (room: Room) => {
  clearRoomTimers(room);
  room.phase = "question";
  room.currentQuestionIndex = 0;
  room.activeTeam = "A";
  room.scores = { A: 0, B: 0 };
  room.chat = [];
  room.lastReveal = null;
  room.activeAnswer = null;
  startQuestion(room);
};

export const resetGame = (room: Room) => {
  clearRoomTimers(room);
  room.questions = createMockQuestions(room.topic, room.questionCount);
  room.phase = "lobby";
  room.currentQuestionIndex = -1;
  room.activeTeam = "A";
  room.questionEndsAt = null;
  room.activeAnswer = null;
  room.chat = [];
  room.lastReveal = null;
  room.scores = { A: 0, B: 0 };
  broadcastState(room);
};

export const createRoom = (
  roomId: string,
  topic: string,
  questionCount: number,
  hostPeerId: string
): Room => ({
  roomId,
  topic,
  questionCount,
  questions: createMockQuestions(topic, questionCount),
  players: new Map(),
  hostPeerId,
  phase: "lobby",
  currentQuestionIndex: -1,
  activeTeam: "A",
  questionEndsAt: null,
  activeAnswer: null,
  lastReveal: null,
  scores: { A: 0, B: 0 },
  chat: [],
  timers: {},
});
