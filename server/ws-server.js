/* Standalone WebSocket server for QuizBattle rooms.
   Run with: node server/ws-server.js (or npm run ws-server)
   Default port: 3001; configure via WS_PORT.
*/

const { WebSocketServer } = require("ws");

const PORT = process.env.WS_PORT ? Number(process.env.WS_PORT) : 3001;
const MAX_PLAYERS = 20;
const QUESTION_TIME_MS = 30_000;
const REVEAL_TIME_MS = 4_000;
const TEAM_REVEAL_TIME_MS = 6_000;
const CAPTAIN_VOTE_TIME_MS = 30_000;
const TEAM_NAMING_TIME_MS = 30_000;
const HOST_RECONNECT_WAIT_MS = 30_000;
const TEAM_KEYS = ["A", "B"];

const DYNAMIC_TEAM_NAMES = [
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
];

const rooms = new Map();

const sendSafe = (socket, data) => {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(data));
  }
};

const randomId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2);

const sanitizeRoomId = (raw) =>
  String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

const sanitizeTeamName = (raw, fallback) => {
  const trimmed = String(raw || "").trim().slice(0, 32);
  return trimmed || fallback;
};

const normalizeTeamName = (name) => name.trim().toLowerCase();
const normalizePlayerName = (name) => String(name || "").trim().toLowerCase();

const clampQuestionCount = (value) => {
  if (!Number.isFinite(value)) return 5;
  return Math.max(5, Math.min(7, Math.round(value)));
};

const createMockQuestions = (topic, count) => {
  const base = [
    {
      text: `Что из этого лучше всего описывает тему "${topic}"?`,
      options: ["Практическая задача", "Случайный факт", "Музыкальный термин", "Историческая дата"],
      correctIndex: 0,
    },
    {
      text: `Какой подход обычно самый эффективный в "${topic}"?`,
      options: ["Пробовать без плана", "Игнорировать данные", "Проверять гипотезы", "Избегать изменений"],
      correctIndex: 2,
    },
    {
      text: `Что важнее всего для командной игры на тему "${topic}"?`,
      options: ["Скорость без точности", "Распределение ролей", "Тишина", "Один лидер"],
      correctIndex: 1,
    },
    {
      text: `Какой вариант чаще приводит к лучшему результату в "${topic}"?`,
      options: ["Итерации", "Случайный выбор", "Отсутствие обратной связи", "Пауза"],
      correctIndex: 0,
    },
    {
      text: `Что помогает снизить ошибки при решении задач "${topic}"?`,
      options: ["Пропуск проверки", "Ограничение времени до 1 секунды", "Ревью ответов", "Смена темы"],
      correctIndex: 2,
    },
    {
      text: `Какой шаг логичен перед финальным ответом в "${topic}"?`,
      options: ["Перепроверка", "Удаление черновика", "Игнор вопросов", "Выход из комнаты"],
      correctIndex: 0,
    },
    {
      text: `Что обычно усиливает шанс победы в QuizBattle по "${topic}"?`,
      options: ["Споры без решения", "Случайные клики", "Командная координация", "Паузы 5 минут"],
      correctIndex: 2,
    },
  ];

  return base.slice(0, count).map((item, idx) => ({ id: `${idx + 1}`, ...item }));
};

const nextTeam = (team) => (team === "A" ? "B" : "A");

const canPlayerSeeMessage = (player, room, message) => {
  if (player.isHost) return true;

  const visibility = message.visibility || "all";

  if (room.phase === "question") {
    if (player.team !== room.activeTeam) return false;
    return visibility === "all" || visibility === room.activeTeam;
  }

  if (visibility === "all") return true;
  return player.team === visibility;
};

const buildVotesForViewer = (room, viewer) => {
  if (viewer.isHost) {
    return {
      A: { ...room.captainVotes.A },
      B: { ...room.captainVotes.B },
    };
  }

  if (!viewer.team) {
    return { A: {}, B: {} };
  }

  return {
    A: viewer.team === "A" ? { ...room.captainVotes.A } : {},
    B: viewer.team === "B" ? { ...room.captainVotes.B } : {},
  };
};

const buildCaptainVoteProgress = (room) => ({
  A: {
    votes: teamVotesCount(room, "A"),
    total: teamPlayers(room, "A").length,
  },
  B: {
    votes: teamVotesCount(room, "B"),
    total: teamPlayers(room, "B").length,
  },
});

const getViewerCaptainVote = (room, viewer) => {
  if (!viewer.team || viewer.isHost) return null;
  return room.captainBallots[viewer.team].get(viewer.peerId) || null;
};

const visibleTeamForViewer = (room, viewer, targetPlayer) => {
  const isPausedLobby =
    room.phase === "host-reconnect" && room.pausedState?.phase === "lobby";
  if (room.phase === "lobby" || isPausedLobby) return null;
  if (viewer.isHost) return targetPlayer.team;
  if (!viewer.team) return null;
  return targetPlayer.team;
};

const buildState = (room, viewer) => ({
  type: "state-sync",
  serverTime: Date.now(),
  room: {
    roomId: room.roomId,
    topic: room.topic,
    questionCount: room.questionCount,
    phase: room.phase,
    currentQuestionIndex: room.currentQuestionIndex,
    activeTeam: room.activeTeam,
    questionEndsAt: room.questionEndsAt,
    teamRevealEndsAt: room.teamRevealEndsAt,
    captainVoteEndsAt: room.captainVoteEndsAt,
    teamNamingEndsAt: room.teamNamingEndsAt,
    hostReconnectEndsAt: room.hostReconnectEndsAt,
    disconnectedHostName: room.disconnectedHostName,
    scores: room.scores,
    teamNames: room.teamNames,
    captains: room.captains,
    captainVotes: buildVotesForViewer(room, viewer),
    myCaptainVote: getViewerCaptainVote(room, viewer),
    captainVoteReadyTeams: room.captainVoteReadyTeams,
    captainVoteProgress: buildCaptainVoteProgress(room),
    teamNamingReadyTeams: room.teamNamingReadyTeams,
    players: Array.from(room.players.values()).map((p) => ({
      peerId: p.peerId,
      name: p.name,
      team: visibleTeamForViewer(room, viewer, p),
      isHost: p.isHost,
      isCaptain: p.isCaptain,
    })),
    currentQuestion: room.currentQuestionIndex >= 0 ? room.questions[room.currentQuestionIndex] : null,
    lastReveal: room.lastReveal,
    chat: room.chat
      .filter((message) => canPlayerSeeMessage(viewer, room, message))
      .slice(-100)
      .map(({ visibility, ...rest }) => rest),
  },
});

const broadcastState = (room) => {
  room.players.forEach((player) => {
    const payload = buildState(room, player);
    sendSafe(player.socket, payload);
  });
};

const clearTimers = (room) => {
  if (room.timers.question) clearTimeout(room.timers.question);
  if (room.timers.reveal) clearTimeout(room.timers.reveal);
  if (room.timers.teamReveal) clearTimeout(room.timers.teamReveal);
  if (room.timers.captainVote) clearTimeout(room.timers.captainVote);
  if (room.timers.teamNaming) clearTimeout(room.timers.teamNaming);
  if (room.timers.hostReconnect) clearTimeout(room.timers.hostReconnect);

  room.timers.question = undefined;
  room.timers.reveal = undefined;
  room.timers.teamReveal = undefined;
  room.timers.captainVote = undefined;
  room.timers.teamNaming = undefined;
  room.timers.hostReconnect = undefined;
};

const resetCaptainState = (room) => {
  room.captainVotes = { A: {}, B: {} };
  room.captainBallots = { A: new Map(), B: new Map() };
  room.captains = { A: null, B: null };
  room.captainVoteReadyTeams = { A: false, B: false };
  room.teamNamingReadyTeams = { A: false, B: false };
  room.players.forEach((player) => {
    player.isCaptain = false;
  });
};

const teamPlayers = (room, team) =>
  Array.from(room.players.values()).filter((player) => !player.isHost && player.team === team);

const randomItem = (items) => {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] || null;
};

const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const assignTeamsForStart = (room) => {
  const candidates = shuffle(
    Array.from(room.players.values()).filter((player) => !player.isHost)
  );

  let switchTeam = "A";
  candidates.forEach((player) => {
    player.team = switchTeam;
    switchTeam = nextTeam(switchTeam);
  });
};

const teamCounts = (room) => {
  let a = 0;
  let b = 0;
  room.players.forEach((player) => {
    if (player.isHost) return;
    if (player.team === "A") a += 1;
    if (player.team === "B") b += 1;
  });
  return { a, b };
};

const assignLateJoinTeam = (room) => {
  const counts = teamCounts(room);
  return counts.a <= counts.b ? "A" : "B";
};

const chooseCaptainByVotes = (room, team) => {
  const players = teamPlayers(room, team);
  if (!players.length) return null;

  const voteEntries = Object.entries(room.captainVotes[team]);
  if (!voteEntries.length) {
    return randomItem(players)?.peerId || null;
  }

  const maxVotes = voteEntries.reduce((max, [, count]) => Math.max(max, Number(count) || 0), 0);
  const leaders = voteEntries
    .filter(([, count]) => Number(count) === maxVotes)
    .map(([peerId]) => peerId)
    .filter((peerId) => players.some((player) => player.peerId === peerId));

  if (!leaders.length) {
    return randomItem(players)?.peerId || null;
  }

  return randomItem(leaders);
};

const applyCaptainFlags = (room) => {
  room.players.forEach((player) => {
    if (player.isHost) {
      player.isCaptain = false;
      return;
    }
    player.isCaptain =
      (player.team === "A" && room.captains.A === player.peerId) ||
      (player.team === "B" && room.captains.B === player.peerId);
  });
};

const teamVotesCount = (room, team) =>
  Object.values(room.captainVotes[team]).reduce(
    (sum, count) => sum + (Number(count) || 0),
    0
  );

const isCaptainVoteReadyForTeam = (room, team) => {
  const membersCount = teamPlayers(room, team).length;
  if (membersCount === 0) return true;
  return teamVotesCount(room, team) >= membersCount;
};

const areAllTeamsReady = (readyMap) =>
  TEAM_KEYS.every((team) => !!readyMap[team]);

const refreshCaptainVoteProgress = (room) => {
  TEAM_KEYS.forEach((team) => {
    const ready = isCaptainVoteReadyForTeam(room, team);
    room.captainVoteReadyTeams[team] = ready;

    if (ready) {
      room.captains[team] = room.captains[team] || chooseCaptainByVotes(room, team);
    } else {
      room.captains[team] = null;
    }
  });

  applyCaptainFlags(room);
};

const initializeTeamNamingProgress = (room) => {
  TEAM_KEYS.forEach((team) => {
    const membersCount = teamPlayers(room, team).length;
    if (membersCount === 0) {
      room.teamNamingReadyTeams[team] = true;
      return;
    }

    room.teamNamingReadyTeams[team] = !room.captains[team];
  });
};

const startQuestionPhase = (room) => {
  room.phase = "question";
  room.questionEndsAt = Date.now() + QUESTION_TIME_MS;
  room.teamRevealEndsAt = null;
  room.captainVoteEndsAt = null;
  room.teamNamingEndsAt = null;
  room.activeAnswer = null;
  room.lastReveal = null;
  room.revealEndsAt = null;

  if (room.timers.question) clearTimeout(room.timers.question);
  room.timers.question = setTimeout(() => finalizeQuestion(room), QUESTION_TIME_MS);

  broadcastState(room);
};

const finalizeQuestion = (room) => {
  if (room.phase !== "question" || room.currentQuestionIndex < 0) return;

  if (room.timers.question) {
    clearTimeout(room.timers.question);
    room.timers.question = undefined;
  }

  const question = room.questions[room.currentQuestionIndex];
  const selected = room.activeAnswer;
  const selectedIndex = selected ? selected.selectedIndex : null;
  const isCorrect = selectedIndex === question.correctIndex;
  const pointsAwarded = isCorrect ? 10 : 0;

  if (pointsAwarded > 0) {
    room.scores[room.activeTeam] += pointsAwarded;
  }

  room.chat = [];
  room.phase = "reveal";
  room.questionEndsAt = null;
  room.revealEndsAt = Date.now() + REVEAL_TIME_MS;
  room.lastReveal = {
    correctIndex: question.correctIndex,
    selectedIndex,
    answeredBy: selected ? selected.byPeerId : null,
    answeredByName: selected ? selected.byName : null,
    team: room.activeTeam,
    isCorrect,
    pointsAwarded,
  };

  broadcastState(room);

  if (room.timers.reveal) clearTimeout(room.timers.reveal);
  room.timers.reveal = setTimeout(() => advanceAfterReveal(room), REVEAL_TIME_MS);
};

const advanceAfterReveal = (room) => {
  if (room.phase !== "reveal") return;

  if (room.timers.reveal) {
    clearTimeout(room.timers.reveal);
    room.timers.reveal = undefined;
  }

  room.revealEndsAt = null;

  if (room.currentQuestionIndex >= room.questionCount - 1) {
    room.phase = "results";
    room.questionEndsAt = null;
    room.activeAnswer = null;
    broadcastState(room);
    return;
  }

  room.currentQuestionIndex += 1;
  room.chat = [];
  room.activeTeam = nextTeam(room.activeTeam);
  startQuestionPhase(room);
};

const getPhaseRemainingMsForPause = (room, phase) => {
  const now = Date.now();

  if (phase === "question") {
    return room.questionEndsAt ? Math.max(0, room.questionEndsAt - now) : 0;
  }
  if (phase === "team-reveal") {
    return room.teamRevealEndsAt ? Math.max(0, room.teamRevealEndsAt - now) : 0;
  }
  if (phase === "captain-vote") {
    return room.captainVoteEndsAt ? Math.max(0, room.captainVoteEndsAt - now) : 0;
  }
  if (phase === "team-naming") {
    return room.teamNamingEndsAt ? Math.max(0, room.teamNamingEndsAt - now) : 0;
  }
  if (phase === "reveal") {
    return room.revealEndsAt ? Math.max(0, room.revealEndsAt - now) : 0;
  }

  return 0;
};

const schedulePhaseTimer = (room, phase, remainingMs) => {
  const delay = Math.max(120, Math.ceil(remainingMs || 0));
  const endsAt = Date.now() + delay;

  if (phase === "question") {
    room.questionEndsAt = endsAt;
    room.timers.question = setTimeout(() => finalizeQuestion(room), delay);
    return;
  }

  if (phase === "team-reveal") {
    room.teamRevealEndsAt = endsAt;
    room.timers.teamReveal = setTimeout(() => startCaptainVote(room), delay);
    return;
  }

  if (phase === "captain-vote") {
    room.captainVoteEndsAt = endsAt;
    room.timers.captainVote = setTimeout(() => finalizeCaptainVote(room), delay);
    return;
  }

  if (phase === "team-naming") {
    room.teamNamingEndsAt = endsAt;
    room.timers.teamNaming = setTimeout(() => finalizeTeamNaming(room), delay);
    return;
  }

  if (phase === "reveal") {
    room.revealEndsAt = endsAt;
    room.timers.reveal = setTimeout(() => advanceAfterReveal(room), delay);
  }
};

const resumeAfterHostReconnect = (room) => {
  if (!room.pausedState) {
    room.hostReconnectEndsAt = null;
    room.disconnectedHostName = null;
    room.disconnectedHostExpectedName = null;
    broadcastState(room);
    return;
  }

  clearTimers(room);

  const snapshot = room.pausedState;
  room.phase = snapshot.phase;
  room.hostReconnectEndsAt = null;
  room.disconnectedHostName = null;
  room.disconnectedHostExpectedName = null;
  room.pausedState = null;

  room.questionEndsAt = null;
  room.teamRevealEndsAt = null;
  room.captainVoteEndsAt = null;
  room.teamNamingEndsAt = null;
  room.revealEndsAt = null;

  schedulePhaseTimer(room, snapshot.phase, snapshot.remainingMs);
  broadcastState(room);
};

const assignNewHost = (room) => {
  let candidate = null;
  room.players.forEach((player) => {
    player.isHost = false;
    if (!candidate) candidate = player;
  });

  if (!candidate) return null;

  candidate.isHost = true;
  room.hostPeerId = candidate.peerId;
  if (room.phase === "lobby") {
    candidate.team = null;
  }
  return candidate;
};

const shouldPauseOnHostDisconnect = (phase) =>
  phase === "lobby" ||
  phase === "team-reveal" ||
  phase === "captain-vote" ||
  phase === "team-naming" ||
  phase === "question" ||
  phase === "reveal";

const pauseForHostReconnect = (room, hostName) => {
  if (!shouldPauseOnHostDisconnect(room.phase)) return false;

  const previousPhase = room.phase;
  const remainingMs = getPhaseRemainingMsForPause(room, previousPhase);

  clearTimers(room);

  room.pausedState = {
    phase: previousPhase,
    remainingMs,
  };
  room.phase = "host-reconnect";
  room.questionEndsAt = null;
  room.teamRevealEndsAt = null;
  room.captainVoteEndsAt = null;
  room.teamNamingEndsAt = null;
  room.revealEndsAt = null;
  room.hostReconnectEndsAt = Date.now() + HOST_RECONNECT_WAIT_MS;
  room.disconnectedHostName = hostName || "Ведущий";
  room.disconnectedHostExpectedName = normalizePlayerName(hostName);

  broadcastState(room);

  room.timers.hostReconnect = setTimeout(() => {
    if (room.phase !== "host-reconnect") return;
    assignNewHost(room);
    resumeAfterHostReconnect(room);
  }, HOST_RECONNECT_WAIT_MS);

  return true;
};

const finalizeTeamNaming = (room) => {
  if (room.phase !== "team-naming") return;

  if (room.timers.teamNaming) {
    clearTimeout(room.timers.teamNaming);
    room.timers.teamNaming = undefined;
  }

  room.teamNamingReadyTeams = { A: true, B: true };

  room.currentQuestionIndex = 0;
  room.activeTeam = "A";
  room.chat = [];
  room.lastReveal = null;
  room.activeAnswer = null;
  room.scores = { A: 0, B: 0 };
  startQuestionPhase(room);
};

const finalizeCaptainVote = (room) => {
  if (room.phase !== "captain-vote") return;

  if (room.timers.captainVote) {
    clearTimeout(room.timers.captainVote);
    room.timers.captainVote = undefined;
  }

  room.captains = {
    A: room.captains.A || chooseCaptainByVotes(room, "A"),
    B: room.captains.B || chooseCaptainByVotes(room, "B"),
  };
  room.captainVoteReadyTeams = { A: true, B: true };
  applyCaptainFlags(room);

  room.phase = "team-naming";
  room.captainVoteEndsAt = null;
  room.teamNamingEndsAt = Date.now() + TEAM_NAMING_TIME_MS;
  initializeTeamNamingProgress(room);

  if (areAllTeamsReady(room.teamNamingReadyTeams)) {
    finalizeTeamNaming(room);
    return;
  }

  broadcastState(room);

  room.timers.teamNaming = setTimeout(() => finalizeTeamNaming(room), TEAM_NAMING_TIME_MS);
};

const startCaptainVote = (room) => {
  room.phase = "captain-vote";
  room.teamRevealEndsAt = null;
  room.captainVoteEndsAt = Date.now() + CAPTAIN_VOTE_TIME_MS;
  room.teamNamingEndsAt = null;
  room.teamNamingReadyTeams = { A: false, B: false };
  room.captains = { A: null, B: null };
  room.captainVoteReadyTeams = { A: false, B: false };
  refreshCaptainVoteProgress(room);

  if (areAllTeamsReady(room.captainVoteReadyTeams)) {
    finalizeCaptainVote(room);
    return;
  }

  broadcastState(room);

  room.timers.captainVote = setTimeout(() => finalizeCaptainVote(room), CAPTAIN_VOTE_TIME_MS);
};

const startGame = (room) => {
  clearTimers(room);
  resetCaptainState(room);

  room.hostReconnectEndsAt = null;
  room.disconnectedHostName = null;
  room.disconnectedHostExpectedName = null;
  room.pausedState = null;
  room.teamNames = { A: "Команда A", B: "Команда B" };
  assignTeamsForStart(room);

  room.phase = "team-reveal";
  room.currentQuestionIndex = -1;
  room.activeTeam = "A";
  room.questionEndsAt = null;
  room.teamRevealEndsAt = Date.now() + TEAM_REVEAL_TIME_MS;
  room.captainVoteEndsAt = null;
  room.teamNamingEndsAt = null;
  room.revealEndsAt = null;
  room.chat = [];
  room.activeAnswer = null;
  room.lastReveal = null;
  room.scores = { A: 0, B: 0 };

  broadcastState(room);

  room.timers.teamReveal = setTimeout(() => startCaptainVote(room), TEAM_REVEAL_TIME_MS);
};

const resetGame = (room) => {
  clearTimers(room);
  room.questions = createMockQuestions(room.topic, room.questionCount);
  room.phase = "lobby";
  room.currentQuestionIndex = -1;
  room.activeTeam = "A";
  room.questionEndsAt = null;
  room.teamRevealEndsAt = null;
  room.captainVoteEndsAt = null;
  room.teamNamingEndsAt = null;
  room.revealEndsAt = null;
  room.hostReconnectEndsAt = null;
  room.disconnectedHostName = null;
  room.disconnectedHostExpectedName = null;
  room.pausedState = null;
  room.activeAnswer = null;
  room.chat = [];
  room.lastReveal = null;
  room.scores = { A: 0, B: 0 };

  resetCaptainState(room);
  room.teamNames = { A: "Команда A", B: "Команда B" };

  room.players.forEach((player) => {
    if (!player.isHost) {
      player.team = null;
    }
  });

  broadcastState(room);
};

const getRandomUniqueTeamName = (room, fallback) => {
  const available = DYNAMIC_TEAM_NAMES.filter(
    (name) => !room.usedTeamNames.has(normalizeTeamName(name))
  );

  if (!available.length) return fallback;
  const selected = randomItem(available) || fallback;
  room.usedTeamNames.add(normalizeTeamName(selected));
  return selected;
};

const reassignCaptainIfNeeded = (room, team) => {
  if (room.captains[team]) return;
  const players = teamPlayers(room, team);
  const candidate = randomItem(players);
  room.captains[team] = candidate ? candidate.peerId : null;
  applyCaptainFlags(room);
};

const cleanupVotesForPlayer = (room, peerId) => {
  ["A", "B"].forEach((teamKey) => {
    const team = teamKey;
    const previousCandidate = room.captainBallots[team].get(peerId);
    if (previousCandidate) {
      const currentCount = room.captainVotes[team][previousCandidate] || 0;
      const nextCount = Math.max(0, currentCount - 1);
      if (nextCount === 0) {
        delete room.captainVotes[team][previousCandidate];
      } else {
        room.captainVotes[team][previousCandidate] = nextCount;
      }
    }
    room.captainBallots[team].delete(peerId);

    if (room.captainVotes[team][peerId]) {
      delete room.captainVotes[team][peerId];
    }

    room.captainBallots[team].forEach((candidatePeerId, voterPeerId) => {
      if (candidatePeerId === peerId) {
        room.captainBallots[team].delete(voterPeerId);
      }
    });
  });
};

const createRoom = (roomId, topic, questionCount, hostPeerId) => ({
  roomId,
  topic,
  questionCount,
  questions: createMockQuestions(topic, questionCount),
  players: new Map(),
  hostPeerId: hostPeerId,
  phase: "lobby",
  currentQuestionIndex: -1,
  activeTeam: "A",
  questionEndsAt: null,
  teamRevealEndsAt: null,
  captainVoteEndsAt: null,
  teamNamingEndsAt: null,
  revealEndsAt: null,
  hostReconnectEndsAt: null,
  disconnectedHostName: null,
  disconnectedHostExpectedName: null,
  pausedState: null,
  activeAnswer: null,
  lastReveal: null,
  scores: { A: 0, B: 0 },
  chat: [],
  captains: { A: null, B: null },
  captainVotes: { A: {}, B: {} },
  captainBallots: { A: new Map(), B: new Map() },
  captainVoteReadyTeams: { A: false, B: false },
  teamNamingReadyTeams: { A: false, B: false },
  teamNames: { A: "Команда A", B: "Команда B" },
  usedTeamNames: new Set(),
  timers: {},
});

const wss = new WebSocketServer({ port: PORT }, () => {
  console.log(`[ws-server] listening on ws://localhost:${PORT}`);
});

wss.on("connection", (socket, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = sanitizeRoomId(url.searchParams.get("roomId"));
  const name = (url.searchParams.get("name") || "Игрок").trim().slice(0, 24) || "Игрок";
  const requestedHost = url.searchParams.get("host") === "1";
  const topic = (url.searchParams.get("topic") || "Общая тема").trim().slice(0, 80) || "Общая тема";
  const questionCount = clampQuestionCount(Number(url.searchParams.get("count")));

  if (!roomId) {
    socket.close(1008, "Room id required");
    return;
  }

  const peerId = randomId();

  let room = rooms.get(roomId);
  if (!room) {
    room = createRoom(roomId, topic, questionCount, peerId);
    rooms.set(roomId, room);
  }

  if (room.players.size >= MAX_PLAYERS) {
    sendSafe(socket, {
      type: "error",
      code: "ROOM_FULL",
      message: "Комната заполнена. Максимум 20 участников.",
    });
    socket.close(1008, "Room full");
    return;
  }

  const isReturningHost =
    room.phase === "host-reconnect" &&
    !!room.hostReconnectEndsAt &&
    requestedHost &&
    normalizePlayerName(name) === room.disconnectedHostExpectedName;

  let isHost = isReturningHost || room.players.size === 0;
  if (isHost) {
    room.hostPeerId = peerId;
    room.players.forEach((player) => {
      player.isHost = false;
    });
  }

  const isPausedLobby =
    room.phase === "host-reconnect" && room.pausedState?.phase === "lobby";
  const team = isHost
    ? null
    : room.phase === "lobby" || isPausedLobby
    ? null
    : assignLateJoinTeam(room);

  room.players.set(peerId, {
    peerId,
    name,
    team,
    isHost,
    isCaptain: false,
    socket,
  });

  sendSafe(socket, {
    type: "connected",
    peerId,
    roomId,
    isHost,
    assignedTeam: room.phase === "lobby" ? null : team,
  });

  if (isReturningHost) {
    resumeAfterHostReconnect(room);
  } else {
    broadcastState(room);
  }

  socket.on("message", (raw) => {
    const current = rooms.get(roomId);
    const player = current?.players.get(peerId);
    if (!current || !player) return;

    let data;
    try {
      const text = typeof raw === "string" ? raw : raw instanceof Buffer ? raw.toString("utf-8") : "";
      data = JSON.parse(text);
    } catch {
      return;
    }

    if (data?.type === "start-game") {
      if (!player.isHost || current.phase !== "lobby") return;
      startGame(current);
      return;
    }

    if (data?.type === "vote-captain") {
      if (current.phase !== "captain-vote") return;
      if (player.isHost || !player.team) return;
      if (current.captainVoteReadyTeams[player.team]) return;

      const candidatePeerId = typeof data.candidatePeerId === "string" ? data.candidatePeerId : "";
      if (candidatePeerId === peerId) return;
      const candidate = current.players.get(candidatePeerId);
      if (!candidate || candidate.isHost || candidate.team !== player.team) return;

      const team = player.team;
      const previousCandidate = current.captainBallots[team].get(peerId);
      if (previousCandidate && current.captainVotes[team][previousCandidate]) {
        const nextCount = Math.max(0, current.captainVotes[team][previousCandidate] - 1);
        if (nextCount === 0) {
          delete current.captainVotes[team][previousCandidate];
        } else {
          current.captainVotes[team][previousCandidate] = nextCount;
        }
      }

      current.captainBallots[team].set(peerId, candidatePeerId);
      current.captainVotes[team][candidatePeerId] =
        (current.captainVotes[team][candidatePeerId] || 0) + 1;

      refreshCaptainVoteProgress(current);
      if (areAllTeamsReady(current.captainVoteReadyTeams)) {
        finalizeCaptainVote(current);
        return;
      }

      broadcastState(current);
      return;
    }

    if (data?.type === "set-team-name") {
      if (current.phase !== "team-naming") return;
      if (!player.team || !player.isCaptain) return;
      if (current.teamNamingReadyTeams[player.team]) return;

      const fallback = player.team === "A" ? "Команда A" : "Команда B";
      const nextName = sanitizeTeamName(data?.name, fallback);

      current.teamNames[player.team] = nextName;
      current.usedTeamNames.add(normalizeTeamName(nextName));
      current.teamNamingReadyTeams[player.team] = true;

      if (areAllTeamsReady(current.teamNamingReadyTeams)) {
        finalizeTeamNaming(current);
        return;
      }

      broadcastState(current);
      return;
    }

    if (data?.type === "random-team-name") {
      if (current.phase !== "team-naming") return;
      if (!player.team || !player.isCaptain) return;
      if (current.teamNamingReadyTeams[player.team]) return;

      const fallback = player.team === "A" ? "Команда A" : "Команда B";
      const randomName = getRandomUniqueTeamName(current, fallback);
      current.teamNames[player.team] = randomName;
      current.teamNamingReadyTeams[player.team] = true;

      if (areAllTeamsReady(current.teamNamingReadyTeams)) {
        finalizeTeamNaming(current);
        return;
      }

      broadcastState(current);
      return;
    }

    if (data?.type === "submit-answer") {
      if (current.phase !== "question") return;
      if (player.team !== current.activeTeam) return;
      if (!player.isCaptain) return;
      if (current.activeAnswer) return;

      const answerIndex = Number(data.answerIndex);
      if (!Number.isInteger(answerIndex)) return;

      current.activeAnswer = { selectedIndex: answerIndex, byPeerId: peerId, byName: player.name };
      finalizeQuestion(current);
      return;
    }

    if (data?.type === "new-game") {
      if (!player.isHost) return;
      resetGame(current);
      return;
    }

    if (data?.type === "send-chat") {
      const text = typeof data.text === "string" ? data.text.trim().slice(0, 280) : "";
      if (!text) return;

      if (
        current.phase === "question" &&
        (player.isHost || !player.team || player.team !== current.activeTeam)
      ) {
        return;
      }

      const visibility = current.phase === "question" ? current.activeTeam : "all";

      current.chat.push({
        id: randomId(),
        from: peerId,
        name: player.name,
        text,
        timestamp: Date.now(),
        visibility,
      });
      if (current.chat.length > 100) current.chat = current.chat.slice(-100);
      broadcastState(current);
    }
  });

  const cleanup = () => {
    const current = rooms.get(roomId);
    if (!current) return;

    const removed = current.players.get(peerId);
    if (!removed) return;
    current.players.delete(peerId);
    cleanupVotesForPlayer(current, peerId);

    if (current.players.size === 0) {
      clearTimers(current);
      rooms.delete(roomId);
      return;
    }

    if (removed.isHost || current.hostPeerId === peerId) {
      const paused = pauseForHostReconnect(current, removed.name);
      if (!paused) {
        assignNewHost(current);
      }
    }

    if (removed?.team && current.captains[removed.team] === peerId) {
      current.captains[removed.team] = null;
      if (current.phase === "team-naming") {
        current.teamNamingReadyTeams[removed.team] = false;
        reassignCaptainIfNeeded(current, removed.team);
        if (!current.captains[removed.team]) {
          current.teamNamingReadyTeams[removed.team] = true;
        }
      }
      applyCaptainFlags(current);
    }

    // В лобби до старта не показываем распределение.
    if (current.phase === "lobby") {
      current.players.forEach((player) => {
        if (!player.isHost) {
          player.team = null;
          player.isCaptain = false;
        }
      });
    }

    if (current.phase === "captain-vote") {
      refreshCaptainVoteProgress(current);
      if (areAllTeamsReady(current.captainVoteReadyTeams)) {
        finalizeCaptainVote(current);
        return;
      }
    }

    if (current.phase === "team-naming") {
      TEAM_KEYS.forEach((team) => {
        const membersCount = teamPlayers(current, team).length;
        if (membersCount === 0 || !current.captains[team]) {
          current.teamNamingReadyTeams[team] = true;
        }
      });

      if (areAllTeamsReady(current.teamNamingReadyTeams)) {
        finalizeTeamNaming(current);
        return;
      }
    }

    broadcastState(current);
  };

  socket.on("close", cleanup);
  socket.on("error", cleanup);
});

wss.on("error", (err) => {
  console.error("[ws-server] fatal error", err);
});
