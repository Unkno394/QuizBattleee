export type Team = "A" | "B";
export type Difficulty = "easy" | "medium" | "hard";
export type DifficultyMode = "easy" | "medium" | "hard" | "mixed" | "progressive";
export type GameMode = "classic" | "ffa" | "chaos";
export type Phase =
  | "lobby"
  | "team-reveal"
  | "captain-vote"
  | "team-naming"
  | "question"
  | "reveal"
  | "results"
  | "host-reconnect"
  | "manual-pause";

export type MascotKind = "dog" | "cat";
export type MascotMood = "common" | "happy" | "sad" | "sleep";

export type Player = {
  peerId: string;
  authUserId?: number | null;
  name: string;
  team: Team | null;
  isHost: boolean;
  isSpectator?: boolean;
  isCaptain?: boolean;
  avatar?: string | null;
  profileFrame?: string | null;
  mascotSkins?: {
    cat?: string | null;
    dog?: string | null;
  } | null;
  victoryEffects?: {
    front?: string | null;
    back?: string | null;
  } | null;
};

export type Question = {
  id: string;
  text: string;
  options: string[];
  difficulty?: Difficulty;
  correctIndex?: number;
};

export type ChatMessage = {
  id: string;
  from: string;
  name: string;
  text: string;
  timestamp: number;
  kind?: string | null;
};

export type RevealInfo = {
  mode?: GameMode;
  correctIndex: number;
  selectedIndex?: number | null;
  answeredBy?: string | null;
  answeredByName?: string | null;
  team?: Team;
  isCorrect?: boolean;
  basePoints?: number;
  speedBonus?: number;
  timeRemainingMs?: number;
  skippedByHost?: boolean;
  skippedByName?: string | null;
  pointsAwarded?: number;
  participantsCount?: number;
  tieResolvedRandomly?: boolean;
  voteCounts?: Record<string, number>;
  chaosTeamResults?: Record<
    Team,
    {
      team?: Team;
      selectedIndex?: number | null;
      isCorrect?: boolean;
      basePoints?: number;
      speedBonus?: number;
      timeRemainingMs?: number;
      pointsAwarded?: number;
      voteCounts?: Record<string, number>;
      tieResolvedRandomly?: boolean;
      participantsCount?: number;
      answeredCount?: number;
    }
  >;
  playerResults?: Array<{
    peerId: string;
    name: string;
    selectedIndex: number | null;
    isCorrect: boolean;
    basePoints: number;
    speedBonus: number;
    timeRemainingMs: number;
    pointsAwarded: number;
    totalScore: number;
  }>;
};

export type RoomState = {
  roomId: string;
  topic: string;
  difficultyMode?: DifficultyMode;
  gameMode?: GameMode;
  questionCount: number;
  phase: Phase;
  currentQuestionIndex: number;
  activeTeam: Team;
  questionEndsAt: number | null;
  teamRevealEndsAt?: number | null;
  captainVoteEndsAt?: number | null;
  teamNamingEndsAt?: number | null;
  hostReconnectEndsAt?: number | null;
  disconnectedHostName?: string | null;
  manualPauseByName?: string | null;
  scores: Record<Team, number>;
  playerScores?: Record<string, number>;
  hasPassword?: boolean;
  players: Player[];
  currentQuestion: Question | null;
  lastReveal: RevealInfo | null;
  chat: ChatMessage[];
  teamNames?: Record<Team, string>;
  captains?: Record<Team, string | null>;
  captainVotes?: Record<Team, Record<string, number>>;
  captainVoteReadyTeams?: Record<Team, boolean>;
  captainVoteProgress?: Record<Team, { votes: number; total: number }>;
  teamNamingReadyTeams?: Record<Team, boolean>;
  myCaptainVote?: string | null;
  answerProgress?: {
    answered: number;
    total: number;
  } | null;
  myAnswer?: {
    selectedIndex: number | null;
    isCorrect: boolean;
    basePoints: number;
    speedBonus: number;
    timeRemainingMs: number;
    pointsAwarded: number;
    projectedTotalScore: number;
  } | null;
  pendingPlayers?: string[];
  chaosProgress?: {
    submitted: boolean;
    answeredByTeam: Record<Team, number>;
    totalByTeam: Record<Team, number>;
  } | null;
  skipRequest?: {
    count: number;
    meRequested: boolean;
    names: string[];
    status?: "idle" | "pending" | "rejected";
    notice?: string | null;
    messageId?: string | null;
  } | null;
  resultsSummary?: {
    mode: GameMode;
    teamScores?: Record<Team, number>;
    winnerTeam?: Team | null;
    teamNames?: Record<Team, string>;
    players?: Array<{
      peerId: string;
      name: string;
      team?: Team | null;
      correctAnswers: number;
    }>;
    captainContribution?: {
      A?: {
        peerId?: string;
        name: string;
        team?: Team;
        correctAnswers: number;
        wrongAnswers: number;
        points: number;
      } | null;
      B?: {
        peerId?: string;
        name: string;
        team?: Team;
        correctAnswers: number;
        wrongAnswers: number;
        points: number;
      } | null;
      note?: string;
    } | null;
    ranking?: Array<{
      place: number;
      peerId: string;
      name: string;
      points: number;
      correctAnswers: number;
    }>;
    hostDetails?: {
      players: Array<{
        peerId: string;
        name: string;
        team?: Team | null;
        answers: number;
        correctAnswers: number;
        wrongAnswers: number;
        skippedAnswers: number;
        points: number;
        avgResponseMs?: number | null;
        fastestResponseMs?: number | null;
      }>;
      questionHistory: Array<Record<string, unknown>>;
      eventHistory: Array<{
        id?: string;
        timestamp?: number;
        kind?: string;
        text?: string;
      }>;
    } | null;
  } | null;
};

export type ConnectedMessage = {
  type: "connected";
  peerId: string;
  roomId: string;
  isHost: boolean;
  isSpectator?: boolean;
  assignedTeam: Team | null;
  playerToken?: string | null;
};

export type StateSyncMessage = {
  type: "state-sync";
  serverTime: number;
  room: RoomState;
};

export type ModerationNoticeMessage = {
  type: "moderation-notice";
  message: string;
  level?: "warning" | "error" | "info";
  strikes?: number;
  disqualified?: boolean;
};

export type FriendRequestReceivedMessage = {
  type: "friend_request_received";
  requester_id: number;
};

export type FriendRequestResolvedMessage = {
  type: "friend_request_resolved";
  requester_id: number;
  status: "accepted" | "declined";
};

export type ServerMessage =
  | ConnectedMessage
  | StateSyncMessage
  | ModerationNoticeMessage
  | FriendRequestReceivedMessage
  | FriendRequestResolvedMessage
  | { type: "error"; code?: string; message: string };
