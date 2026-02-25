import type { NextApiRequest, NextApiResponse } from "next";
import { WebSocketServer, WebSocket } from "ws";

type Team = "A" | "B";
type Phase = "lobby" | "question" | "reveal" | "results";
type ChatVisibility = Team | "all";

type ExtWebSocket = WebSocket & { peerId?: string; roomId?: string };

type Player = {
  peerId: string;
  name: string;
  team: Team | null;
  isHost: boolean;
  socket: ExtWebSocket;
};

type QuizQuestion = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
};

type ChatMessage = {
  id: string;
  from: string;
  name: string;
  text: string;
  timestamp: number;
  visibility: ChatVisibility;
};

type RevealInfo = {
  correctIndex: number;
  selectedIndex: number | null;
  answeredBy: string | null;
  answeredByName: string | null;
  team: Team;
  isCorrect: boolean;
  pointsAwarded: number;
};

type ActiveAnswer = {
  selectedIndex: number;
  byPeerId: string;
  byName: string;
};

type Room = {
  roomId: string;
  topic: string;
  questionCount: number;
  questions: QuizQuestion[];
  players: Map<string, Player>;
  hostPeerId: string;
  phase: Phase;
  currentQuestionIndex: number;
  activeTeam: Team;
  questionEndsAt: number | null;
  activeAnswer: ActiveAnswer | null;
  lastReveal: RevealInfo | null;
  scores: Record<Team, number>;
  chat: ChatMessage[];
  timers: {
    question?: NodeJS.Timeout;
    reveal?: NodeJS.Timeout;
  };
};

type ExtServer = {
  wss?: WebSocketServer;
  on?: (event: string, cb: (...args: any[]) => void) => void;
};

const MAX_PLAYERS = 20;
const QUESTION_TIME_MS = 30_000;
const REVEAL_TIME_MS = 4_000;

type QuizRuntimeStore = {
  rooms: Map<string, Room>;
  wss?: WebSocketServer;
  instanceId: string;
  upgradeBound: boolean;
};

const getRuntimeStore = (): QuizRuntimeStore => {
  const g = globalThis as typeof globalThis & {
    __quizRuntimeStore?: QuizRuntimeStore;
  };

  if (!g.__quizRuntimeStore) {
    g.__quizRuntimeStore = {
      rooms: new Map<string, Room>(),
      instanceId: Math.random().toString(36).slice(2, 8),
      upgradeBound: false,
    };
  }

  return g.__quizRuntimeStore;
};

const runtimeStore = getRuntimeStore();
const rooms = runtimeStore.rooms;

const sendSafe = (socket: WebSocket, data: unknown) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
};

const randomId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2);

const clampQuestionCount = (value: number) => {
  if (!Number.isFinite(value)) return 5;
  return Math.max(5, Math.min(7, Math.round(value)));
};

const sanitizeRoomId = (raw: string) =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

const createMockQuestions = (topic: string, count: number): QuizQuestion[] => {
  const base = [
    {
      text: `Что из этого лучше всего описывает тему "${topic}"?`,
      options: [
        "Практическая задача",
        "Случайный факт",
        "Музыкальный термин",
        "Историческая дата",
      ],
      correctIndex: 0,
    },
    {
      text: `Какой подход обычно самый эффективный в "${topic}"?`,
      options: [
        "Пробовать без плана",
        "Игнорировать данные",
        "Проверять гипотезы",
        "Избегать изменений",
      ],
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

  return base.slice(0, count).map((item, idx) => ({
    id: `${idx + 1}`,
    ...item,
  }));
};

const canPlayerSeeMessage = (player: Player, room: Room, message: ChatMessage) => {
  if (player.isHost) return true;

  const visibility = message.visibility ?? "all";

  if (room.phase === "question") {
    if (player.team !== room.activeTeam) return false;
    return visibility === "all" || visibility === room.activeTeam;
  }

  if (visibility === "all") return true;
  return player.team === visibility;
};

const buildState = (room: Room, viewer: Player) => ({
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
    scores: room.scores,
    players: Array.from(room.players.values()).map((player) => ({
      peerId: player.peerId,
      name: player.name,
      team: player.team,
      isHost: player.isHost,
    })),
    currentQuestion:
      room.currentQuestionIndex >= 0 ? room.questions[room.currentQuestionIndex] : null,
    lastReveal: room.lastReveal,
    chat: room.chat
      .filter((message) => canPlayerSeeMessage(viewer, room, message))
      .slice(-100)
      .map(({ visibility: _visibility, ...rest }) => rest),
  },
});

const broadcastState = (room: Room) => {
  room.players.forEach((player) => {
    const payload = buildState(room, player);
    sendSafe(player.socket, payload);
  });
};

const clearRoomTimers = (room: Room) => {
  if (room.timers.question) clearTimeout(room.timers.question);
  if (room.timers.reveal) clearTimeout(room.timers.reveal);
  room.timers.question = undefined;
  room.timers.reveal = undefined;
};

const teamCounts = (room: Room) => {
  let a = 0;
  let b = 0;
  room.players.forEach((player) => {
    if (player.team === "A") a += 1;
    if (player.team === "B") b += 1;
  });
  return { a, b };
};

const nextTeam = (team: Team): Team => (team === "A" ? "B" : "A");

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

const finalizeQuestion = (room: Room) => {
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

  // Hard reset chat right after answer finalization.
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

const startGame = (room: Room) => {
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

const resetGame = (room: Room) => {
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

const createRoom = (roomId: string, topic: string, questionCount: number, hostPeerId: string): Room => ({
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

const bindUpgradeHandler = (server: ExtServer, wss: WebSocketServer) => {
  if (runtimeStore.upgradeBound) return;
  server.on?.("upgrade", (req: any, socket: any, head: any) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    if (url.pathname !== "/api/ws") return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      (ws as any).query = url.searchParams;
      wss.emit("connection", ws, req);
    });
  });
  runtimeStore.upgradeBound = true;
};

const setupWebSocketServer = (server: ExtServer) => {
  if (runtimeStore.wss) {
    bindUpgradeHandler(server, runtimeStore.wss);
    return runtimeStore.wss;
  }
  if (server.wss) {
    runtimeStore.wss = server.wss;
    bindUpgradeHandler(server, server.wss);
    return server.wss;
  }

  const wss = new WebSocketServer({ noServer: true });
  // Set singleton reference immediately to avoid races on parallel /api/ws requests.
  runtimeStore.wss = wss;
  bindUpgradeHandler(server, wss);

  wss.on("connection", (socket: ExtWebSocket) => {
    const params: URLSearchParams = (socket as any).query || new URLSearchParams();
    const rawRoomId = params.get("roomId") || "";
    const roomId = sanitizeRoomId(rawRoomId);
    const name = (params.get("name") || "Игрок").trim().slice(0, 24) || "Игрок";
    const topic = (params.get("topic") || "Общая тема").trim().slice(0, 80) || "Общая тема";
    const questionCount = clampQuestionCount(Number(params.get("count")));

    if (!roomId) {
      socket.close(1008, "Room id required");
      return;
    }

    const peerId = randomId();
    socket.peerId = peerId;
    socket.roomId = roomId;

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

    const isHost = room.players.size === 0;
    if (room.players.size === 0) {
      room.hostPeerId = peerId;
    }

    const counts = teamCounts(room);
    const team: Team | null = isHost ? null : counts.a <= counts.b ? "A" : "B";

    room.players.set(peerId, {
      peerId,
      name,
      team,
      isHost,
      socket,
    });

    console.log(
      `[quiz-ws ${runtimeStore.instanceId}] join room=${roomId} peer=${peerId} name=${name} host=${isHost} players=${room.players.size}`
    );

    sendSafe(socket, {
      type: "connected",
      peerId,
      roomId,
      isHost,
      assignedTeam: team,
    });

    broadcastState(room);

    const handleClose = () => {
      const current = rooms.get(roomId);
      if (!current) return;

      current.players.delete(peerId);
      if (current.players.size === 0) {
        clearRoomTimers(current);
        rooms.delete(roomId);
        console.log(
          `[quiz-ws ${runtimeStore.instanceId}] room cleared room=${roomId}`
        );
        return;
      }

      if (current.hostPeerId === peerId) {
        const first = current.players.values().next().value as Player | undefined;
        if (first) {
          current.hostPeerId = first.peerId;
          first.isHost = true;
          first.team = null;
        }
      }

      // Rebalance newcomers by reassigning only non-host players.
      let switchTeam: Team = "A";
      current.players.forEach((player) => {
        if (player.isHost) return;
        player.team = switchTeam;
        switchTeam = nextTeam(switchTeam);
      });

      broadcastState(current);
      console.log(
        `[quiz-ws ${runtimeStore.instanceId}] leave room=${roomId} peer=${peerId} players=${current.players.size}`
      );
    };

    socket.on("message", (raw) => {
      const current = rooms.get(roomId);
      const player = current?.players.get(peerId);
      if (!current || !player) return;

      let data: any;
      try {
        const text =
          typeof raw === "string"
            ? raw
            : raw instanceof Buffer
            ? raw.toString("utf-8")
            : "";
        data = JSON.parse(text);
      } catch {
        return;
      }

      if (data?.type === "start-game") {
        if (!player.isHost || current.phase !== "lobby") return;
        startGame(current);
        return;
      }

      if (data?.type === "submit-answer") {
        if (current.phase !== "question") return;
        if (player.team !== current.activeTeam) return;
        if (current.activeAnswer) return;

        const answerIndex = Number(data.answerIndex);
        if (!Number.isInteger(answerIndex)) return;

        current.activeAnswer = {
          selectedIndex: answerIndex,
          byPeerId: peerId,
          byName: player.name,
        };
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

        const visibility: ChatVisibility =
          current.phase === "question" ? current.activeTeam : "all";

        current.chat.push({
          id: randomId(),
          from: peerId,
          name: player.name,
          text,
          timestamp: Date.now(),
          visibility,
        });
        if (current.chat.length > 100) {
          current.chat = current.chat.slice(-100);
        }
        broadcastState(current);
      }
    });

    socket.on("close", () => handleClose());
    socket.on("error", () => handleClose());
  });

  server.wss = wss;
  runtimeStore.wss = wss;
  return wss;
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const server = (res.socket as any)?.server as ExtServer;
  setupWebSocketServer(server);
  const roomsInfo = Array.from(rooms.entries()).map(([roomId, room]) => ({
    roomId,
    players: room.players.size,
    hostPeerId: room.hostPeerId,
    phase: room.phase,
  }));
  res.setHeader("Content-Type", "application/json");
  res.status(200).end(
    JSON.stringify({
      status: "ok",
      rooms: rooms.size,
      instanceId: runtimeStore.instanceId,
      upgradeBound: runtimeStore.upgradeBound,
      roomsInfo,
    })
  );
}
