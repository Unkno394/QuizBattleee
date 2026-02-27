import type { WebSocket, WebSocketServer } from "ws";

export type Team = "A" | "B";
export type Phase = "lobby" | "question" | "reveal" | "results";
export type ChatVisibility = Team | "all";

export type ExtWebSocket = WebSocket & {
  peerId?: string;
  roomId?: string;
  query?: URLSearchParams;
};

export type Player = {
  peerId: string;
  name: string;
  team: Team | null;
  isHost: boolean;
  socket: ExtWebSocket;
};

export type QuizQuestion = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
};

export type ChatMessage = {
  id: string;
  from: string;
  name: string;
  text: string;
  timestamp: number;
  visibility: ChatVisibility;
};

export type RevealInfo = {
  correctIndex: number;
  selectedIndex: number | null;
  answeredBy: string | null;
  answeredByName: string | null;
  team: Team;
  isCorrect: boolean;
  pointsAwarded: number;
};

export type ActiveAnswer = {
  selectedIndex: number;
  byPeerId: string;
  byName: string;
};

export type Room = {
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

export type ExtServer = {
  wss?: WebSocketServer;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
};

export type QuizRuntimeStore = {
  rooms: Map<string, Room>;
  wss?: WebSocketServer;
  instanceId: string;
  upgradeBound: boolean;
};
