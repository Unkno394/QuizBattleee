"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AnimatedBackground from "@/components/AnimatedBackground";
import { Crown, Flag, Shuffle, Users } from "lucide-react";

type Team = "A" | "B";
type Phase =
  | "lobby"
  | "team-reveal"
  | "captain-vote"
  | "team-naming"
  | "question"
  | "reveal"
  | "results"
  | "host-reconnect";

type MascotKind = "dog" | "cat";
type MascotMood = "common" | "happy" | "sad" | "sleep";

type Player = {
  peerId: string;
  name: string;
  team: Team | null;
  isHost: boolean;
  isCaptain?: boolean;
  avatar?: string | null;
};

type Question = {
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

type RoomState = {
  roomId: string;
  topic: string;
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
  scores: Record<Team, number>;
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
};

type ConnectedMessage = {
  type: "connected";
  peerId: string;
  roomId: string;
  isHost: boolean;
  assignedTeam: Team | null;
};

type StateSyncMessage = {
  type: "state-sync";
  serverTime: number;
  room: RoomState;
};

type ServerMessage =
  | ConnectedMessage
  | StateSyncMessage
  | { type: "error"; message: string };

type LottieAnimationInstance = {
  destroy: () => void;
};

type LottieEngine = {
  loadAnimation: (params: {
    container: Element;
    renderer: "svg" | "canvas" | "html";
    loop: boolean;
    autoplay: boolean;
    path: string;
    rendererSettings?: {
      preserveAspectRatio?: string;
    };
  }) => LottieAnimationInstance;
};

declare global {
  interface Window {
    lottie?: LottieEngine;
    __lottieLoaderPromise?: Promise<void>;
  }
}

const DEFAULT_TEAM_NAMES: Record<Team, string> = {
  A: "Команда A",
  B: "Команда B",
};

const LOTTIE_CDN_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js";
const WINNER_BACKGROUND_LOTTIE_PATH = "/winner%20background.json";
const WINNER_CONFETTI_LOTTIE_PATH = "/confetti.json";
const MASCOT_ASSET_VERSION = "20260225-7";

const createFramePaths = (basePath: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${basePath}/${index + 1}.png?v=${MASCOT_ASSET_VERSION}`);
const createPingPongFramePaths = (basePath: string, count: number) => {
  const forward = createFramePaths(basePath, count);
  const backward = forward.slice(1, -1).reverse();
  return [...forward, ...backward];
};

const MASCOT_FRAMES: Record<MascotKind, Record<MascotMood, string[]>> = {
  dog: {
    common: createFramePaths("/dog/common", 2),
    happy: createFramePaths("/dog/happy", 3),
    sad: createFramePaths("/dog/sad", 12),
    sleep: createPingPongFramePaths("/dog/sleep", 4),
  },
  cat: {
    common: createFramePaths("/cat/common", 2),
    happy: createFramePaths("/cat/happy", 4),
    sad: createFramePaths("/cat/sad", 12),
    sleep: createPingPongFramePaths("/cat/sleep", 4),
  },
};

const MASCOT_DISPLAY_META: Record<
  MascotKind,
  {
    title: string;
  }
> = {
  dog: {
    title: "пес Байт",
  },
  cat: {
    title: "кошка Луна",
  },
};

const LOADED_MASCOT_FRAMES = new Set<string>();
const LOADING_MASCOT_FRAMES = new Map<string, Promise<void>>();

const ensureLottieLoaded = async () => {
  if (typeof window === "undefined") return;
  if (window.lottie) return;
  if (window.__lottieLoaderPromise) {
    await window.__lottieLoaderPromise;
    return;
  }

  window.__lottieLoaderPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-lottie-loader="1"]'
    );
    if (existing) {
      if (window.lottie) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Lottie script failed")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = LOTTIE_CDN_URL;
    script.async = true;
    script.defer = true;
    script.dataset.lottieLoader = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Lottie script failed"));
    document.head.appendChild(script);
  });

  await window.__lottieLoaderPromise;
};

const preloadMascotFrame = (src: string) => {
  if (!src || typeof window === "undefined" || LOADED_MASCOT_FRAMES.has(src)) {
    return Promise.resolve();
  }
  const inFlight = LOADING_MASCOT_FRAMES.get(src);
  if (inFlight) return inFlight;

  const loadPromise = new Promise<void>((resolve) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      LOADED_MASCOT_FRAMES.add(src);
      LOADING_MASCOT_FRAMES.delete(src);
      resolve();
    };
    image.onerror = () => {
      LOADED_MASCOT_FRAMES.add(src);
      LOADING_MASCOT_FRAMES.delete(src);
      resolve();
    };
    image.src = src;
  });

  LOADING_MASCOT_FRAMES.set(src, loadPromise);
  return loadPromise;
};

function MascotFramePlayer({
  frames,
  fps,
  mood,
}: {
  frames: string[];
  fps: number;
  mood: MascotMood;
}) {
  const [frameIndex, setFrameIndex] = useState(0);
  const targetFrame = frames[frameIndex % frames.length] || frames[0];
  const [renderedFrame, setRenderedFrame] = useState(() => frames[0] || "");

  useEffect(() => {
    frames.forEach(preloadMascotFrame);
  }, [frames]);

  useEffect(() => {
    if (frames.length <= 1) return;

    if (mood !== "common") {
      const intervalMs = Math.max(60, Math.round(1000 / fps));
      const intervalId = window.setInterval(() => {
        setFrameIndex((prev) => (prev + 1) % frames.length);
      }, intervalMs);

      return () => window.clearInterval(intervalId);
    }

    let timeoutId: number | null = null;
    let cancelled = false;
    const openFrame = 0;
    const closedFrame = Math.min(1, frames.length - 1);
    const randomInt = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min;

    const schedule = (delayMs: number, task: () => void) => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        task();
      }, delayMs);
    };

    const blink = (allowDouble = true) => {
      setFrameIndex(closedFrame);
      schedule(randomInt(65, 95), () => {
        setFrameIndex(openFrame);
        if (allowDouble && Math.random() < 0.22) {
          schedule(randomInt(110, 180), () => blink(false));
          return;
        }
        schedule(randomInt(2600, 5600), () => blink(true));
      });
    };

    schedule(randomInt(1200, 2400), () => blink(true));

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [frames, fps, mood]);

  const safeTargetFrame = targetFrame || frames[0] || "";
  const isTargetReady = safeTargetFrame ? LOADED_MASCOT_FRAMES.has(safeTargetFrame) : false;
  const visibleFrame = isTargetReady ? safeTargetFrame : renderedFrame || safeTargetFrame;
  const shouldWarmPendingFrame = !!safeTargetFrame && !isTargetReady && safeTargetFrame !== visibleFrame;

  if (!visibleFrame) return null;

  return (
    <>
      <img
        src={visibleFrame}
        alt="Талисман команды"
        loading="eager"
        decoding="sync"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-bottom drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]"
        onLoad={() => {
          LOADED_MASCOT_FRAMES.add(visibleFrame);
          if (renderedFrame !== visibleFrame) {
            setRenderedFrame(visibleFrame);
          }
        }}
      />
      {shouldWarmPendingFrame ? (
        <img
          src={safeTargetFrame}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="sync"
          className="hidden"
          onLoad={() => {
            LOADED_MASCOT_FRAMES.add(safeTargetFrame);
            setRenderedFrame(safeTargetFrame);
          }}
          onError={() => {
            LOADED_MASCOT_FRAMES.add(safeTargetFrame);
            setRenderedFrame(safeTargetFrame);
          }}
        />
      ) : null}
    </>
  );
}

function LottieLayer({
  path,
  className,
  loop = true,
  autoplay = true,
  preserveAspectRatio = "xMidYMid meet",
}: {
  path: string;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  preserveAspectRatio?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let animation: LottieAnimationInstance | null = null;

    const start = async () => {
      try {
        await ensureLottieLoaded();
        if (isCancelled || !containerRef.current || !window.lottie) return;

        animation = window.lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop,
          autoplay,
          path,
          rendererSettings: {
            preserveAspectRatio,
          },
        });
      } catch {
        // ignore lottie loading failures, UI keeps working without decorative layer
      }
    };

    start();

    return () => {
      isCancelled = true;
      animation?.destroy();
    };
  }, [autoplay, loop, path, preserveAspectRatio]);

  return <div ref={containerRef} aria-hidden className={className} />;
}

const TEAM_SECTOR_META: Record<
  Team,
  {
    label: string;
    textClass: string;
    cardClass: string;
    flagWrapClass: string;
    flagClass: string;
  }
> = {
  A: {
    label: "СИНЕГО СЕКТОРА",
    textClass: "text-sky-300",
    cardClass: "border-sky-300/40 bg-sky-500/10",
    flagWrapClass: "border-sky-300/45 bg-sky-500/20",
    flagClass: "text-sky-200",
  },
  B: {
    label: "КРАСНОГО СЕКТОРА",
    textClass: "text-rose-300",
    cardClass: "border-rose-300/40 bg-rose-500/10",
    flagWrapClass: "border-rose-300/45 bg-rose-500/20",
    flagClass: "text-rose-200",
  },
};

const formatSeconds = (value: number) => (value < 10 ? `0${value}` : `${value}`);
const uniq = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const isLocalHostName = (host: string) =>
  host === "localhost" || host === "127.0.0.1" || host === "::1";

const shouldUseExplicitEndpoint = (endpoint: string, currentHost: string) => {
  try {
    const parsed = new URL(endpoint);
    const explicitHost = parsed.hostname;
    if (!isLocalHostName(currentHost) && isLocalHostName(explicitHost)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const votesLabel = (count: number) => {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} голос`;
  if (
    [2, 3, 4].includes(count % 10) &&
    ![12, 13, 14].includes(count % 100)
  ) {
    return `${count} голоса`;
  }
  return `${count} голосов`;
};

const getAvatarInitial = (name: string) => {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
};

const truncateName = (name: string, maxLength = 20) => {
  const normalized = name.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
};

const getPlayerAvatarStyle = (player: Player, phase?: Phase) => {
  if (player.avatar) {
    return {
      backgroundImage: `url(${player.avatar})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  if (player.isHost) {
    return {
      backgroundImage: "linear-gradient(135deg, #f59e0b 0%, #7c3aed 100%)",
    };
  }

  if (phase === "lobby") {
    return {
      backgroundColor: "#6b7280",
    };
  }

  if (player.team === "A") {
    return {
      backgroundColor: "#3b82f6",
    };
  }

  if (player.team === "B") {
    return {
      backgroundColor: "#ef4444",
    };
  }

  return {
    backgroundColor: "#6b7280",
  };
};

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ pin: string }>();
  const searchParams = useSearchParams();

  const pin = (params?.pin || "").toUpperCase();
  const nameParam = searchParams.get("name") || "Игрок";
  const isHostParam = searchParams.get("host") === "1";
  const topicParam = searchParams.get("topic") || "Общая тема";
  const countParam = searchParams.get("count") || "5";

  const socketRef = useRef<WebSocket | null>(null);
  const connectAttemptRef = useRef(0);

  const [peerId, setPeerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [assignedTeam, setAssignedTeam] = useState<Team | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState("Подключение...");
  const [error, setError] = useState<string | null>(null);
  const [selectedAnswerState, setSelectedAnswerState] = useState<{
    key: string;
    index: number;
  } | null>(null);
  const [chatText, setChatText] = useState("");
  const [isSocketReady, setIsSocketReady] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isProfileLeaveModalOpen, setIsProfileLeaveModalOpen] = useState(false);
  const [hostMascotKind] = useState<MascotKind>(() => (Math.random() < 0.5 ? "dog" : "cat"));

  const send = (payload: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isExitModalOpen && !isProfileLeaveModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExitModalOpen(false);
        setIsProfileLeaveModalOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExitModalOpen, isProfileLeaveModalOpen]);

  useEffect(() => {
    let isCancelled = false;
    const attemptId = connectAttemptRef.current + 1;
    connectAttemptRef.current = attemptId;

    const connect = async () => {
      try {
        if (socketRef.current) {
          try {
            socketRef.current.close();
          } catch {
            // ignore
          }
          socketRef.current = null;
        }

        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const standaloneEndpoint = `${protocol}://${window.location.hostname}:3001/api/ws`;
        const explicitUrl = (process.env.NEXT_PUBLIC_WS_URL || "").trim();
        const safeExplicitEndpoint = shouldUseExplicitEndpoint(
          explicitUrl,
          window.location.hostname
        )
          ? explicitUrl
          : "";
        const endpoints = safeExplicitEndpoint
          ? uniq([safeExplicitEndpoint, standaloneEndpoint])
          : [standaloneEndpoint];

        const query = new URLSearchParams({
          roomId: pin,
          name: nameParam.slice(0, 24),
        });

        if (isHostParam) query.set("host", "1");
        if (isHostParam) query.set("topic", topicParam);
        if (isHostParam) query.set("count", countParam);

        const openSocket = (endpoint: string) =>
          new Promise<{ ws: WebSocket; buffered: string[] }>((resolve, reject) => {
            const ws = new WebSocket(`${endpoint}?${query.toString()}`);
            const buffered: string[] = [];
            const timeout = window.setTimeout(() => {
              try {
                ws.close();
              } catch {
                // ignore
              }
              reject(new Error("timeout"));
            }, 4000);

            ws.onopen = () => {
              clearTimeout(timeout);
              resolve({ ws, buffered });
            };

            ws.onerror = () => {
              clearTimeout(timeout);
              reject(new Error("error"));
            };

            ws.onclose = () => {
              clearTimeout(timeout);
              reject(new Error("close"));
            };

            ws.onmessage = (event) => {
              if (typeof event.data === "string") {
                buffered.push(event.data);
              }
            };
          });

        let ws: WebSocket | null = null;
        let bufferedMessages: string[] = [];

        for (const endpoint of endpoints) {
          if (isCancelled) return;
          setStatus(`Подключаемся к ${endpoint}`);
          try {
            const connected = await openSocket(endpoint);
            if (isCancelled || connectAttemptRef.current !== attemptId) {
              try {
                connected.ws.close();
              } catch {
                // ignore
              }
              return;
            }

            ws = connected.ws;
            bufferedMessages = connected.buffered;
            break;
          } catch {
            // try next endpoint
          }
        }

        if (!ws) {
          setIsSocketReady(false);
          setStatus("Ошибка соединения");
          setError(`WebSocket не поднялся. Проверены endpoint: ${endpoints.join(" | ")}`);
          return;
        }

        if (isCancelled || connectAttemptRef.current !== attemptId) {
          try {
            ws.close();
          } catch {
            // ignore
          }
          return;
        }

        socketRef.current = ws;
        setIsSocketReady(true);
        setStatus("Подключено");
        setError(null);

        const handleMessageData = (rawData: string) => {
          let message: ServerMessage | null = null;
          try {
            message = JSON.parse(rawData) as ServerMessage;
          } catch {
            return;
          }

          if (!message) return;

          if (message.type === "connected") {
            setPeerId(message.peerId);
            setIsHost(message.isHost);
            setAssignedTeam(message.assignedTeam);
            return;
          }

          if (message.type === "state-sync") {
            setRoomState(message.room);
            setServerOffset(message.serverTime - Date.now());
            setStatus("Синхронизировано");
            return;
          }

          if (message.type === "error") {
            setError(message.message);
          }
        };

        ws.onmessage = (event) => {
          if (
            isCancelled ||
            connectAttemptRef.current !== attemptId ||
            socketRef.current !== ws
          ) {
            return;
          }
          if (typeof event.data === "string") {
            handleMessageData(event.data);
          }
        };

        if (bufferedMessages.length > 0) {
          bufferedMessages.forEach((item) => handleMessageData(item));
          bufferedMessages = [];
        }

        ws.onclose = () => {
          if (
            !isCancelled &&
            connectAttemptRef.current === attemptId &&
            socketRef.current === ws
          ) {
            setIsSocketReady(false);
            setStatus("Соединение закрыто");
          }
        };

        ws.onerror = () => {
          if (
            !isCancelled &&
            connectAttemptRef.current === attemptId &&
            socketRef.current === ws
          ) {
            setIsSocketReady(false);
            setStatus("Ошибка соединения");
            setError("Потеряно WebSocket-соединение");
          }
        };
      } catch {
        if (!isCancelled) {
          setIsSocketReady(false);
          setStatus("Ошибка соединения");
          setError("Не удалось инициализировать WebSocket сервер");
        }
      }
    };

    if (pin) {
      connect();
    }

    return () => {
      isCancelled = true;
      if (connectAttemptRef.current === attemptId) {
        connectAttemptRef.current += 1;
      }
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {
          // ignore
        }
        socketRef.current = null;
      }
    };
  }, [countParam, isHostParam, nameParam, pin, topicParam]);

  const me = roomState?.players.find((player) => player.peerId === peerId) || null;
  const hostPlayer = roomState?.players.find((player) => player.isHost) || null;

  const effectiveIsHost = me?.isHost ?? isHost;
  const myTeam = me?.team ?? assignedTeam;
  const isLobbyPhase = roomState?.phase === "lobby";
  const neutralMascotKind: MascotKind =
    peerId && peerId.length
      ? peerId.charCodeAt(peerId.length - 1) % 2 === 0
        ? "dog"
        : "cat"
      : "dog";
  const mascotKind: MascotKind =
    myTeam === "A"
      ? "dog"
      : myTeam === "B"
      ? "cat"
      : effectiveIsHost
      ? hostMascotKind
      : neutralMascotKind;
  const mascotMood: MascotMood = (() => {
    if (!roomState) return "common";

    // For players: react only to own team's answer; while opponent answers, mascot sleeps.
    if (myTeam) {
      if (roomState.phase === "question") {
        return roomState.activeTeam === myTeam ? "common" : "sleep";
      }

      if (roomState.phase === "reveal") {
        const revealTeam = roomState.lastReveal?.team;
        if (!revealTeam) return "common";
        if (revealTeam !== myTeam) return "sleep";
        return roomState.lastReveal?.isCorrect ? "happy" : "sad";
      }
    }

    if (roomState.phase === "reveal") {
      return roomState.lastReveal?.isCorrect ? "happy" : "sad";
    }

    return "common";
  })();
  const mascotFrames = MASCOT_FRAMES[mascotKind][mascotMood];
  const mascotFps =
    mascotMood === "sad" ? 12 : mascotMood === "happy" ? 10 : mascotMood === "sleep" ? 4 : 5;
  const captainSectorLabel = (team: Team) => (team === "A" ? "Синий сектор" : "Красный сектор");
  const captainSectorTextClass = (team: Team) => (team === "A" ? "text-sky-300" : "text-rose-300");

  useEffect(() => {
    Object.values(MASCOT_FRAMES[mascotKind])
      .flat()
      .forEach(preloadMascotFrame);
  }, [mascotKind]);

  const formatDisplayName = (name: string, targetPeerId?: string | null, maxLength = 20) => {
    const isSelf = !!peerId && !!targetPeerId && peerId === targetPeerId;
    const suffix = isSelf ? " (вы)" : "";
    const baseMaxLength = Math.max(4, maxLength - suffix.length);
    return `${truncateName(name, baseMaxLength)}${suffix}`;
  };

  const teamNames = roomState?.teamNames || DEFAULT_TEAM_NAMES;
  const teamLabel = (team: Team) => teamNames[team] || DEFAULT_TEAM_NAMES[team];

  const teamAPlayers = (roomState?.players || []).filter((player) => player.team === "A");
  const teamBPlayers = (roomState?.players || []).filter((player) => player.team === "B");

  const secondsLeft = roomState?.questionEndsAt
    ? Math.max(0, Math.ceil((roomState.questionEndsAt - (now + serverOffset)) / 1000))
    : 0;

  const teamRevealRemainingMs = roomState?.teamRevealEndsAt
    ? Math.max(0, roomState.teamRevealEndsAt - (now + serverOffset))
    : 0;

  const teamRevealCountdown =
    teamRevealRemainingMs <= 0
      ? 0
      : Math.max(0, Math.ceil((teamRevealRemainingMs - 3000) / 1000));
  const isTeamRevealCountdownVisible =
    !!roomState && roomState.phase === "team-reveal" && teamRevealRemainingMs > 3000;
  const showMascot =
    !!roomState &&
    roomState.phase !== "lobby" &&
    roomState.phase !== "results" &&
    !isTeamRevealCountdownVisible;

  const captainVoteLeft = roomState?.captainVoteEndsAt
    ? Math.max(0, Math.ceil((roomState.captainVoteEndsAt - (now + serverOffset)) / 1000))
    : 0;

  const teamNamingLeft = roomState?.teamNamingEndsAt
    ? Math.max(0, Math.ceil((roomState.teamNamingEndsAt - (now + serverOffset)) / 1000))
    : 0;

  const hostReconnectLeft = roomState?.hostReconnectEndsAt
    ? Math.max(0, Math.ceil((roomState.hostReconnectEndsAt - (now + serverOffset)) / 1000))
    : 0;

  const canReadChatNow =
    !!roomState &&
    (effectiveIsHost || roomState.phase !== "question" || myTeam === roomState.activeTeam);

  const canWriteChatNow =
    isSocketReady &&
    !!roomState &&
    (roomState.phase !== "question" ||
      (!effectiveIsHost && myTeam === roomState.activeTeam));

  const visibleChatMessages = roomState?.chat || [];

  const isMyTurn = !!me && !!roomState && me.team === roomState.activeTeam;
  const isMyTurnCaptain = isMyTurn && !!me?.isCaptain;
  const questionCursor = roomState
    ? `${roomState.phase}:${roomState.currentQuestionIndex}`
    : "";
  const selectedAnswer =
    selectedAnswerState?.key === questionCursor ? selectedAnswerState.index : null;
  const canSubmit = roomState?.phase === "question" && isMyTurnCaptain && selectedAnswer !== null;

  const winnerText = (() => {
    if (!roomState) return "";
    if (roomState.scores.A === roomState.scores.B) return "Ничья";
    if (roomState.scores.A > roomState.scores.B) {
      return `Победила команда ${teamLabel("A")}`;
    }
    return `Победила команда ${teamLabel("B")}`;
  })();
  const winnerTeam: Team | null = (() => {
    if (!roomState) return null;
    if (roomState.scores.A === roomState.scores.B) return null;
    return roomState.scores.A > roomState.scores.B ? "A" : "B";
  })();
  const winnerTextClass =
    winnerTeam === "A" ? "text-sky-300" : winnerTeam === "B" ? "text-rose-300" : "text-white/90";

  const myCaptainVote = roomState?.myCaptainVote || null;
  const defaultMyTeamName = myTeam ? teamLabel(myTeam) : "";
  const getTeamPlayersCount = (team: Team) =>
    (roomState?.players || []).filter((player) => !player.isHost && player.team === team).length;
  const getTeamVotesCount = (team: Team) =>
    Object.values(roomState?.captainVotes?.[team] || {}).reduce(
      (sum, votes) => sum + (Number(votes) || 0),
      0
    );

  const resolveCaptainVoteReady = (team: Team) => {
    if (roomState?.captains?.[team]) return true;
    if ((roomState?.players || []).some((player) => player.team === team && player.isCaptain)) {
      return true;
    }

    const progress = roomState?.captainVoteProgress?.[team];
    if (progress) {
      if (progress.total === 0) return true;
      if (progress.votes >= progress.total) return true;
    }

    const explicitReady = roomState?.captainVoteReadyTeams?.[team];
    if (typeof explicitReady === "boolean") return explicitReady;

    const membersCount = getTeamPlayersCount(team);
    if (membersCount === 0) return true;

    return getTeamVotesCount(team) >= membersCount;
  };

  const captainVoteReadyTeams: Record<Team, boolean> = {
    A: resolveCaptainVoteReady("A"),
    B: resolveCaptainVoteReady("B"),
  };

  const teamNamingReadyTeams: Record<Team, boolean> = {
    A:
      roomState?.teamNamingReadyTeams?.A ??
      (getTeamPlayersCount("A") === 0 || !roomState?.captains?.A),
    B:
      roomState?.teamNamingReadyTeams?.B ??
      (getTeamPlayersCount("B") === 0 || !roomState?.captains?.B),
  };

  const submitAnswer = () => {
    if (selectedAnswer === null) return;
    send({ type: "submit-answer", answerIndex: selectedAnswer });
  };

  const sendChat = () => {
    if (!canWriteChatNow) {
      setError("Сейчас чат недоступен для вашей роли/команды");
      return;
    }
    const trimmed = chatText.trim();
    if (!trimmed) return;
    send({ type: "send-chat", text: trimmed });
    setChatText("");
  };

  const voteCaptain = (candidatePeerId: string) => {
    send({ type: "vote-captain", candidatePeerId });
  };

  const saveTeamName = () => {
    if (!myTeam) return;
    send({
      type: "set-team-name",
      name: teamNameDraft.trim() || defaultMyTeamName || DEFAULT_TEAM_NAMES[myTeam],
    });
    setTeamNameDraft("");
  };

  const randomizeTeamName = () => {
    send({ type: "random-team-name" });
    setTeamNameDraft("");
  };

  const handleCopyPin = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopiedPin(true);
      window.setTimeout(() => setCopiedPin(false), 1500);
    } catch {
      setError("Не удалось скопировать PIN");
    }
  };

  const handleExitGame = () => {
    setIsExitModalOpen(true);
  };

  const handleOpenProfileFromLobby = () => {
    if (!isLobbyPhase) return;
    setIsProfileLeaveModalOpen(true);
  };

  const confirmLeaveToProfile = () => {
    setIsProfileLeaveModalOpen(false);
    router.push("/profile");
  };

  const confirmExitGame = () => {
    setIsExitModalOpen(false);
    router.push("/");
  };

  const renderLobby = () => (
    <section className="min-w-0 rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md max-[424px]:p-4 sm:p-6 lg:flex lg:h-full lg:flex-col">
      {(() => {
        const players = roomState?.players || [];
        const host = players.find((player) => player.isHost) || null;
        const participants = players.filter((player) => !player.isHost);

        return (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="break-words text-2xl font-semibold max-[424px]:text-xl">{roomState?.topic || "QuizBattle"}</h2>
                <p className="text-sm text-white/70">PIN: {roomState?.roomId || pin}</p>
                <p
                  className="text-sm text-white/70"
                  title={hostPlayer ? formatDisplayName(hostPlayer.name, hostPlayer.peerId, 32) : undefined}
                >
                  Ведущий: {hostPlayer ? formatDisplayName(hostPlayer.name, hostPlayer.peerId, 20) : "-"}
                </p>
              </div>
              <p className="rounded-full bg-white/15 px-3 py-1 text-sm">Ожидаем начала</p>
            </div>

            <div className="mt-4 space-y-3 rounded-xl border border-white/20 bg-white/5 p-3 text-sm text-white/85">
              <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3">
                <p className="mb-2 flex items-center gap-2 font-semibold text-amber-200">
                  <Crown className="h-4 w-4" />
                  <span>Ведущий</span>
                </p>
                {host ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={getPlayerAvatarStyle(host, roomState?.phase)}
                    >
                      {host.avatar ? "" : getAvatarInitial(host.name)}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate"
                      title={host.name}
                    >
                      {formatDisplayName(host.name, host.peerId)}
                    </span>
                  </div>
                ) : (
                  <p className="text-white/60">Ожидаем ведущего...</p>
                )}
              </div>

              <div className="rounded-xl border border-white/15 bg-white/5 p-3">
                <p className="mb-2 flex items-center gap-2 font-semibold">
                  <Users className="h-4 w-4" />
                  <span>Участники ({participants.length})</span>
                </p>
                <ul className="max-h-48 overflow-y-auto pr-1 space-y-1 sm:max-h-56 lg:max-h-64 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0 2xl:grid-cols-3">
                  {participants.length ? (
                    participants.map((player) => (
                      <li key={player.peerId} className="flex min-w-0 items-center gap-2">
                        <span
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={getPlayerAvatarStyle(player, roomState?.phase)}
                        >
                          {player.avatar ? "" : getAvatarInitial(player.name)}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={player.name}
                        >
                          {formatDisplayName(player.name, player.peerId)}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="text-white/60">Пока нет участников</li>
                  )}
                </ul>
              </div>
            </div>

            <p className="mt-4 text-sm text-white/70">
              До старта никто не видит свою команду. Распределение появится после команды ведущего.
            </p>
          </>
        );
      })()}

      <div className="mt-4 lg:mt-auto lg:pt-4">
        {effectiveIsHost ? (
          <button
            onClick={() => send({ type: "start-game" })}
            className="mt-5 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
          >
            Запустить формирование команд
          </button>
        ) : (
          <p className="mt-5 text-sm text-white/70">Старт игры запускает ведущий.</p>
        )}
      </div>
    </section>
  );

  const renderTeamReveal = () => {
    const showCountdown = teamRevealCountdown > 0;
    const teamMeta = myTeam ? TEAM_SECTOR_META[myTeam] : null;
    const teamMascotKind: MascotKind | null = myTeam === "A" ? "dog" : myTeam === "B" ? "cat" : null;
    const teamMascotMeta = teamMascotKind ? MASCOT_DISPLAY_META[teamMascotKind] : null;

    return (
      <section className="relative overflow-hidden rounded-3xl border border-white/30 bg-black/60 p-5 backdrop-blur-xl sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-black/35" />
        <div className="relative z-10 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-white/60">Подготовка раунда</p>

          {showCountdown ? (
            <>
              <h3 className="mt-3 text-2xl font-semibold">Формирование команд...</h3>
              <p className="mt-4 text-7xl font-black leading-none">{teamRevealCountdown}</p>
            </>
          ) : teamMeta ? (
            <>
              <div
                className={`mx-auto mt-4 inline-flex h-16 w-16 items-center justify-center rounded-full border ${teamMeta.flagWrapClass}`}
              >
                <Flag className={`h-8 w-8 ${teamMeta.flagClass}`} />
              </div>
              <h3 className={`mt-2 text-3xl font-black ${teamMeta.textClass}`}>
                ВЫ — КОМАНДА {teamMeta.label}
              </h3>
              <p className="mt-3 text-sm text-white/70">Сейчас начнется этап выбора капитана.</p>
              {teamMascotMeta ? (
                <p className="mt-2 text-sm text-white/75">
                  Ваш талисман <span className="font-semibold text-white">{teamMascotMeta.title}</span> добавлен!
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h3 className="mt-3 text-2xl font-semibold">Команды сформированы</h3>
              <p className="mt-2 text-white/70">Переходим к выбору капитанов.</p>
            </>
          )}
        </div>

        {effectiveIsHost ? (
          <div className="relative z-10 mt-6 grid gap-3 md:grid-cols-2">
            <div className={`rounded-2xl border p-4 ${TEAM_SECTOR_META.A.cardClass}`}>
              <p className="font-semibold text-sky-300">{teamLabel("A")}</p>
              <ul className="mt-2 space-y-1 text-sm text-white/90">
                {teamAPlayers.length
                  ? teamAPlayers.map((player) => (
                      <li key={player.peerId} className="flex min-w-0 items-center gap-2">
                        <span
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={getPlayerAvatarStyle(player, roomState?.phase)}
                        >
                          {player.avatar ? "" : getAvatarInitial(player.name)}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={player.name}
                        >
                          {truncateName(player.name)}
                        </span>
                      </li>
                    ))
                  : <li>Пока пусто</li>}
              </ul>
            </div>
            <div className={`rounded-2xl border p-4 ${TEAM_SECTOR_META.B.cardClass}`}>
              <p className="font-semibold text-rose-300">{teamLabel("B")}</p>
              <ul className="mt-2 space-y-1 text-sm text-white/90">
                {teamBPlayers.length
                  ? teamBPlayers.map((player) => (
                      <li key={player.peerId} className="flex min-w-0 items-center gap-2">
                        <span
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={getPlayerAvatarStyle(player, roomState?.phase)}
                        >
                          {player.avatar ? "" : getAvatarInitial(player.name)}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={player.name}
                        >
                          {truncateName(player.name)}
                        </span>
                      </li>
                    ))
                  : <li>Пока пусто</li>}
              </ul>
            </div>
          </div>
        ) : null}
      </section>
    );
  };

  const renderHostReconnect = () => {
    const disconnectedHost = roomState?.disconnectedHostName || "Ведущий";

    return (
      <section className="relative overflow-hidden rounded-3xl border border-amber-300/35 bg-black/55 p-5 backdrop-blur-xl sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-black/40" />
        <div className="relative z-10 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-amber-200/80">Пауза игры</p>
          <h3 className="mt-3 text-3xl font-bold text-amber-100">Ведущий отключился</h3>
          <p className="mt-2 text-white/80">
            {truncateName(disconnectedHost, 24)} временно вне сети.
          </p>
          <p className="mt-4 text-lg text-white/90">
            Ожидаем переподключения ({formatSeconds(hostReconnectLeft)} сек)
          </p>
          <p className="mt-2 text-sm text-white/70">
            Если ведущий не вернётся, через 30 секунд назначится новый ведущий.
          </p>
        </div>
      </section>
    );
  };

  const renderCaptainVoteForTeam = (team: Team, canVoteInTeam: boolean) => {
    const players = (roomState?.players || []).filter(
      (player) => !player.isHost && player.team === team
    );
    const votesMap = roomState?.captainVotes?.[team] || {};
    const visibleLabel = captainSectorLabel(team);
    const visibleLabelClass = captainSectorTextClass(team);
    const teamReady = captainVoteReadyTeams[team];
    const captainPeerId =
      roomState?.captains?.[team] || players.find((player) => player.isCaptain)?.peerId || null;
    const captainName = captainPeerId
      ? (roomState?.players || []).find((player) => player.peerId === captainPeerId)?.name || "выбран"
      : null;
    const selectedVoteClass =
      team === "A" ? "border-sky-300 bg-sky-500/20" : "border-rose-300 bg-rose-500/20";
    const captainTextClass = team === "A" ? "text-sky-200" : "text-rose-200";

    if (teamReady) {
      return (
        <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
          <p className={`text-sm font-semibold ${visibleLabelClass}`}>{visibleLabel}</p>
          <p className={`mt-2 text-base font-semibold ${captainTextClass}`}>
            Капитан: {truncateName(captainName || "выбран", 24)}
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={`text-sm font-semibold ${visibleLabelClass}`}>{visibleLabel}</p>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white/80">
            Таймер: 00:{formatSeconds(captainVoteLeft)}
          </span>
        </div>
        <ul className="mt-2 space-y-2">
          {players.length ? (
            players.map((player) => {
              const votes = votesMap[player.peerId] || 0;
              const selected = myCaptainVote === player.peerId;
              const isCaptain = captainPeerId === player.peerId;
              const isSelf = player.peerId === peerId;
              const displayName = isSelf ? `${player.name} (вы)` : player.name;
              const showVoteButton = canVoteInTeam && !teamReady;

              return (
                <li key={player.peerId} className="flex min-w-0 items-center justify-between gap-2">
                  {showVoteButton ? (
                    <button
                      onClick={() => {
                        if (!isSelf) voteCaptain(player.peerId);
                      }}
                      title={isSelf ? `${displayName} (за себя голосовать нельзя)` : displayName}
                      disabled={isSelf}
                      className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selected
                          ? selectedVoteClass
                          : "border-white/20 bg-white/10 hover:bg-white/15"
                      } ${
                        isSelf ? "cursor-not-allowed opacity-60" : ""
                      } truncate`}
                    >
                      {truncateName(displayName, 24)}
                    </button>
                  ) : (
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        isCaptain ? `font-semibold ${captainTextClass}` : "text-white/90"
                      }`}
                      title={displayName}
                    >
                      {truncateName(displayName, 24)}
                    </span>
                  )}
                  <span className="text-xs text-white/70">{votesLabel(votes)}</span>
                </li>
              );
            })
          ) : (
            <li className="text-sm text-white/60">Нет участников</li>
          )}
        </ul>
      </div>
    );
  };

  const renderCaptainVote = () => {
    const readyTeams = (["A", "B"] as Team[]).filter((team) => captainVoteReadyTeams[team]);
    const statusText = (() => {
      if (readyTeams.length === 2) return "Обе команды выбрали капитанов";
      if (readyTeams.length === 1) return `${captainSectorLabel(readyTeams[0])} уже выбрала капитана`;
      return `00:${formatSeconds(captainVoteLeft)}`;
    })();

    return (
      <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-2xl font-semibold">Этап: Выбор капитана</h3>
          <p className="rounded-xl bg-white/15 px-3 py-1 text-sm font-semibold sm:text-base">
            {statusText}
          </p>
        </div>

        <p className="mt-2 text-white/75">
          Как только команда соберёт все голоса, её капитан фиксируется сразу.
        </p>

        {readyTeams.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {readyTeams.map((team) => (
              <span
                key={team}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  team === "A"
                    ? "bg-sky-500/20 text-sky-200"
                    : "bg-rose-500/20 text-rose-200"
                }`}
              >
                {captainSectorLabel(team)} выбрал капитана
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {renderCaptainVoteForTeam("A", !effectiveIsHost && myTeam === "A")}
          {renderCaptainVoteForTeam("B", !effectiveIsHost && myTeam === "B")}
        </div>

        {!effectiveIsHost && myTeam ? (
          <div className="mt-4 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/70">
            {myCaptainVote
              ? `Ваш голос: ${truncateName((roomState?.players || []).find((p) => p.peerId === myCaptainVote)?.name || "выбран", 24)}`
              : "Вы пока не проголосовали"}
          </div>
        ) : null}
      </section>
    );
  };

  const renderTeamNaming = () => {
    const captainA = (roomState?.players || []).find(
      (player) => player.peerId === roomState?.captains?.A
    );
    const captainB = (roomState?.players || []).find(
      (player) => player.peerId === roomState?.captains?.B
    );
    const teamAReady = teamNamingReadyTeams.A;
    const teamBReady = teamNamingReadyTeams.B;
    const pendingTeams = (["A", "B"] as Team[]).filter((team) => !teamNamingReadyTeams[team]);
    const canEditMyTeamName =
      !!myTeam && !!me?.isCaptain && !teamNamingReadyTeams[myTeam];
    const teamNamingInputClass =
      "min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-white placeholder:text-white/60 outline-none transition focus:border-white/50";
    const teamNamingButtonClass =
      myTeam === "B"
        ? "bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 shadow-rose-900/25"
        : "bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 shadow-sky-900/25";

    return (
      <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-2xl font-semibold">Названия команд</h3>
          <p className="rounded-xl bg-white/15 px-3 py-1 text-lg font-bold">
            {pendingTeams.length ? `00:${formatSeconds(teamNamingLeft)}` : "Готово"}
          </p>
        </div>

        <p className="mt-2 text-white/75">
          Команда, которая уже задала название, отмечается как готовая. Остальные продолжают по таймеру.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className={`rounded-2xl border p-4 ${TEAM_SECTOR_META.A.cardClass}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-white/70">Команда A</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  teamAReady
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-white/15 text-white/80"
                }`}
              >
                {teamAReady ? "Готово" : `Таймер: 00:${formatSeconds(teamNamingLeft)}`}
              </span>
            </div>
            <p className="mt-1 text-xl font-bold">{teamLabel("A")}</p>
            <p className="mt-2 text-sm text-white/70" title={captainA?.name || undefined}>
              Капитан: {captainA ? truncateName(captainA.name, 24) : "-"}
            </p>
          </div>
          <div className={`rounded-2xl border p-4 ${TEAM_SECTOR_META.B.cardClass}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-white/70">Команда B</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  teamBReady
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-white/15 text-white/80"
                }`}
              >
                {teamBReady ? "Готово" : `Таймер: 00:${formatSeconds(teamNamingLeft)}`}
              </span>
            </div>
            <p className="mt-1 text-xl font-bold">{teamLabel("B")}</p>
            <p className="mt-2 text-sm text-white/70" title={captainB?.name || undefined}>
              Капитан: {captainB ? truncateName(captainB.name, 24) : "-"}
            </p>
          </div>
        </div>

        {canEditMyTeamName ? (
          <div className="mt-5 rounded-2xl border border-white/20 bg-white/5 p-4">
            <p className="text-sm text-white/70">Вы капитан. Можно изменить название команды.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={teamNameDraft}
                onChange={(e) => setTeamNameDraft(e.target.value)}
                maxLength={32}
                className={teamNamingInputClass}
                placeholder={defaultMyTeamName || "Название команды"}
              />
              <button
                onClick={saveTeamName}
                className={`rounded-xl ${teamNamingButtonClass} px-4 py-2 font-semibold text-white shadow-lg transition hover:brightness-110`}
              >
                Сохранить
              </button>
              <button
                onClick={randomizeTeamName}
                className={`inline-flex items-center gap-2 rounded-xl ${teamNamingButtonClass} px-4 py-2 font-semibold text-white shadow-lg transition hover:brightness-110`}
              >
                <Shuffle className="h-4 w-4" />
                Случайное
              </button>
            </div>
          </div>
        ) : !!myTeam && !!me?.isCaptain && teamNamingReadyTeams[myTeam] ? (
          <p className="mt-5 text-sm text-emerald-200">
            Ваша команда уже задала название. Ожидаем вторую команду.
          </p>
        ) : (
          <p className="mt-5 text-sm text-white/70">
            {effectiveIsHost
              ? "Ждём, пока капитаны завершат выбор названий."
              : "Сейчас название команды может менять только капитан."}
          </p>
        )}
      </section>
    );
  };

  const renderQuestion = () => {
    const activeTeam = roomState!.activeTeam;
    const questionTheme =
      activeTeam === "A"
        ? {
            headerTextClass: "text-sky-300",
            selectedOptionClass: "border-sky-300 bg-sky-500/20",
            submitButtonClass:
              "bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 shadow-sky-900/25",
            waitingTextClass: "text-sky-200",
          }
        : {
            headerTextClass: "text-rose-300",
            selectedOptionClass: "border-rose-300 bg-rose-500/20",
            submitButtonClass:
              "bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 shadow-rose-900/25",
            waitingTextClass: "text-rose-200",
          };

    return (
      <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-lg font-semibold ${questionTheme.headerTextClass}`}>
            Сейчас отвечает: {teamLabel(activeTeam)}
          </p>
          <p className="rounded-xl bg-white/15 px-3 py-1 text-lg font-bold">
            00:{formatSeconds(secondsLeft)}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-white/20 bg-white/5 p-4">
          <p className="text-sm text-white/60">
            Вопрос {roomState!.currentQuestionIndex + 1} из {roomState!.questionCount}
          </p>
          <h3 className="mt-2 text-xl font-semibold">{roomState!.currentQuestion?.text}</h3>
        </div>

        {isMyTurnCaptain ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {roomState!.currentQuestion?.options.map((option, index) => (
                <button
                  key={`${option}-${index}`}
                  onClick={() =>
                    setSelectedAnswerState({
                      key: questionCursor,
                      index,
                    })
                  }
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    selectedAnswer === index
                      ? questionTheme.selectedOptionClass
                      : "border-white/20 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              onClick={submitAnswer}
              disabled={!canSubmit}
              className={`mt-4 rounded-xl px-4 py-3 font-semibold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${questionTheme.submitButtonClass}`}
            >
              Подтвердить
            </button>
          </>
        ) : isMyTurn ? (
          <>
            <div className="mt-4 rounded-xl border border-amber-300/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Ответ выбирает только капитан вашей команды.
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {roomState!.currentQuestion?.options.map((option, index) => (
                <div
                  key={`${option}-${index}`}
                  className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-left text-white/90"
                >
                  {option}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-2xl border border-white/20 bg-white/5 p-4">
            <p className={questionTheme.waitingTextClass}>
              Ожидаем ответ {teamLabel(activeTeam)}.
            </p>
            <p className="text-sm text-white/60">До окончания: {secondsLeft} сек.</p>
          </div>
        )}
      </section>
    );
  };

  const renderReveal = () => {
    const question = roomState?.currentQuestion;
    const reveal = roomState?.lastReveal;
    if (!question || !reveal) return null;
    const revealTeamTextClass = reveal.team === "A" ? "text-sky-200" : "text-rose-200";
    const revealSectionClass =
      reveal.team === "A"
        ? "border-sky-300/35 bg-sky-500/10"
        : "border-rose-300/35 bg-rose-500/10";

    return (
      <section
        className={`rounded-3xl border bg-black/35 p-5 backdrop-blur-md sm:p-6 ${revealSectionClass}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">Проверка ответа</h3>
          <p
            className={`rounded-xl px-3 py-1 text-sm font-bold sm:text-base ${
              reveal.pointsAwarded > 0
                ? "bg-emerald-500/25 text-emerald-200"
                : "bg-red-500/25 text-red-200"
            }`}
          >
            +{reveal.pointsAwarded} баллов
          </p>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className={`font-semibold ${revealTeamTextClass}`}>
            Отвечала команда: {teamLabel(reveal.team)}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {question.options.map((option, index) => {
            const isCorrect = index === reveal.correctIndex;
            const isSelectedWrong = reveal.selectedIndex === index && !isCorrect;

            const optionClass = isCorrect
              ? "border-emerald-300/90 bg-emerald-500/30 text-emerald-200"
              : isSelectedWrong
              ? "border-red-400/90 bg-red-500/45 text-red-200"
              : "border-white/20 bg-white/5 text-white/90";

            return (
              <div
                key={`${option}-${index}`}
                className={`rounded-xl border px-4 py-3 ${optionClass}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium sm:text-base">{option}</p>
                  {isCorrect ? (
                    <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                      Правильный
                    </span>
                  ) : null}
                  {isSelectedWrong ? (
                    <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-xs font-semibold text-red-200">
                      Неверный
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const renderResults = () => (
    <section className="relative overflow-hidden rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
      <h3 className="relative text-2xl font-bold">Финал</h3>
      <p className={`relative mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl ${winnerTextClass}`}>
        {winnerText}
      </p>

      <div className="relative mt-4 grid gap-3 sm:grid-cols-2">
        {(["A", "B"] as Team[]).map((team) => {
          const isWinner = winnerTeam === team;
          const isTie = winnerTeam === null;
          const teamMascotKind: MascotKind = team === "A" ? "dog" : "cat";
          const teamMascotMood: MascotMood = isTie ? "sleep" : isWinner ? "happy" : "sad";
          const teamMascotFrames = MASCOT_FRAMES[teamMascotKind][teamMascotMood];
          const teamMascotFps =
            teamMascotMood === "sad"
              ? 12
              : teamMascotMood === "happy"
              ? 10
              : teamMascotMood === "sleep"
              ? 4
              : 5;
          const cardClass =
            team === "A"
              ? "border-sky-300/45 bg-sky-500/20"
              : "border-rose-300/45 bg-rose-500/20";
          const nameClass = team === "A" ? "text-sky-200" : "text-rose-200";
          const scoreClass = team === "A" ? "text-sky-100" : "text-rose-100";

          return (
            <div
              key={team}
              className={`relative overflow-hidden rounded-2xl border p-4 ${cardClass} ${
                isWinner ? "shadow-lg" : ""
              }`}
            >
              {isWinner ? (
                <LottieLayer
                  path={WINNER_CONFETTI_LOTTIE_PATH}
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute -inset-y-[5%] inset-x-[3%] z-20 opacity-95 [&>svg]:h-full [&>svg]:w-full [&>svg]:!overflow-visible"
                />
              ) : null}

              <div className="relative z-10">
                <div className="flex items-center justify-between gap-3">
                  <p className={`min-w-0 flex-1 truncate text-base font-semibold ${nameClass}`}>
                    {teamLabel(team)}
                  </p>
                  <p className={`whitespace-nowrap text-sm font-black sm:text-base ${scoreClass}`}>
                    всего {roomState?.scores[team] ?? 0} баллов
                  </p>
                </div>

                <div className="mt-3 flex justify-center">
                  <div className="relative h-[124px] w-[102px] sm:h-[142px] sm:w-[116px]">
                    {isWinner ? (
                      <LottieLayer
                        path={WINNER_BACKGROUND_LOTTIE_PATH}
                        className="pointer-events-none absolute inset-[-14%] z-0 opacity-90"
                      />
                    ) : null}
                    <div className="relative z-10 h-full w-full">
                      <MascotFramePlayer
                        frames={teamMascotFrames}
                        fps={teamMascotFps}
                        mood={teamMascotMood}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {effectiveIsHost ? (
        <button
          onClick={() => send({ type: "new-game" })}
          className="relative mt-5 rounded-xl bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 px-4 py-3 font-semibold text-white shadow-lg shadow-sky-900/25 transition hover:brightness-110"
        >
          Новая игра
        </button>
      ) : (
        <p className="relative mt-5 text-sm text-white/70">Новая игра запускается ведущим.</p>
      )}
    </section>
  );

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <AnimatedBackground className="fixed inset-0 -z-10 h-full w-full" />

      <div className="mx-auto w-full max-w-[min(96vw,2400px)] px-3 py-4 max-[424px]:px-2 sm:px-5 sm:py-5 lg:px-8 2xl:px-10 [@media(min-width:2200px)]:px-14">
        <header className="mb-4 rounded-2xl border border-white/20 bg-black/35 p-4 backdrop-blur-md 2xl:rounded-3xl 2xl:p-5 [@media(min-width:2200px)]:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 2xl:gap-6 max-[442px]:flex-nowrap">
            <h1 className="text-xl font-bold sm:text-2xl 2xl:text-3xl [@media(min-width:2200px)]:text-4xl max-[442px]:text-lg">
              Комната QuizBattle
            </h1>
            <div className="ml-auto flex flex-col items-end">
              {isLobbyPhase ? (
                <button
                  type="button"
                  onClick={handleOpenProfileFromLobby}
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm transition hover:bg-white/20 2xl:px-4 2xl:py-2 2xl:text-base [@media(min-width:2200px)]:text-lg max-[442px]:gap-0 max-[442px]:px-2 max-[442px]:py-2"
                  title="Открыть профиль"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20 2xl:h-8 2xl:w-8 [@media(min-width:2200px)]:h-9 [@media(min-width:2200px)]:w-9">
                    <svg className="h-4 w-4 2xl:h-5 2xl:w-5 [@media(min-width:2200px)]:h-6 [@media(min-width:2200px)]:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z"
                      />
                    </svg>
                  </span>
                  <span className="font-medium max-[442px]:hidden">Профиль</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Профиль доступен только в лобби"
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/45 opacity-80 2xl:px-4 2xl:py-2 2xl:text-base [@media(min-width:2200px)]:text-lg max-[442px]:gap-0 max-[442px]:px-2 max-[442px]:py-2"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 2xl:h-8 2xl:w-8 [@media(min-width:2200px)]:h-9 [@media(min-width:2200px)]:w-9">
                    <svg className="h-4 w-4 2xl:h-5 2xl:w-5 [@media(min-width:2200px)]:h-6 [@media(min-width:2200px)]:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z"
                      />
                    </svg>
                  </span>
                  <span className="font-medium max-[442px]:hidden">Профиль</span>
                </button>
              )}
            </div>
          </div>

          <p className="mt-2 text-sm text-white/70 2xl:text-base [@media(min-width:2200px)]:text-lg">{status}</p>
          {error ? <p className="text-sm text-rose-300 2xl:text-base [@media(min-width:2200px)]:text-lg">{error}</p> : null}

          <div className="mt-3 flex flex-wrap items-stretch justify-between gap-3 sm:items-end 2xl:mt-4 2xl:gap-4">
            <button
              onClick={handleExitGame}
              className="rounded-lg bg-red-500/85 px-3 py-1.5 text-sm font-semibold transition hover:bg-red-500 2xl:px-4 2xl:py-2 2xl:text-base [@media(min-width:2200px)]:text-lg"
            >
              Выйти из игры
            </button>

            <div className="w-full rounded-xl border border-emerald-200/80 bg-emerald-50/95 px-3 py-2 text-emerald-950 shadow-sm shadow-emerald-900/10 sm:w-auto 2xl:px-4 2xl:py-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-800/65">PIN комнаты</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-xl font-extrabold leading-none tracking-[0.12em] text-emerald-700 sm:text-2xl sm:tracking-[0.16em] 2xl:text-3xl [@media(min-width:2200px)]:text-4xl">
                  {pin}
                </p>
                <button
                  onClick={handleCopyPin}
                  className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:bg-emerald-500 2xl:px-4 2xl:py-2 2xl:text-sm [@media(min-width:2200px)]:text-base"
                >
                  {copiedPin ? "Скопировано" : "Копировать PIN"}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-4 max-[424px]:gap-3 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:gap-6 2xl:grid-cols-[minmax(0,1fr)_380px] [@media(min-width:2200px)]:grid-cols-[minmax(0,1fr)_460px]">
          <div className="min-w-0 space-y-4 max-[424px]:space-y-3">
            {!roomState ? (
              <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
                <h2 className="text-xl font-semibold">Ожидание синхронизации комнаты</h2>
                <p className="mt-2 text-white/80">Проверь, что второй участник заходит по PIN: {pin}.</p>
                <p className="mt-1 text-white/60">
                  Если статус не меняется на Синхронизировано, проверь поле WS endpoint выше.
                </p>
              </section>
            ) : null}

            {roomState?.phase === "lobby" && renderLobby()}
            {roomState?.phase === "team-reveal" && renderTeamReveal()}
            {roomState?.phase === "captain-vote" && renderCaptainVote()}
            {roomState?.phase === "team-naming" && renderTeamNaming()}
            {roomState?.phase === "question" && renderQuestion()}
            {roomState?.phase === "reveal" && renderReveal()}
            {roomState?.phase === "results" && renderResults()}
            {roomState?.phase === "host-reconnect" && renderHostReconnect()}
          </div>

          <aside className="min-w-0 rounded-3xl border border-white/20 bg-black/35 p-4 backdrop-blur-md max-[424px]:p-3 2xl:p-5 [@media(min-width:2200px)]:p-6">
            <div
              className={`grid min-w-0 ${
                showMascot
                  ? "grid-cols-[minmax(0,1fr)_72px] gap-2 sm:grid-cols-[minmax(0,1fr)_88px] sm:gap-3 2xl:grid-cols-[minmax(0,1fr)_104px]"
                  : "grid-cols-1"
              }`}
            >
              <div className="flex h-full min-w-0 flex-col justify-end p-1 pb-1">
                <h3 className="-mt-1 text-lg font-semibold">Чат команды</h3>
                <p className="mt-[5px] text-xs text-white/60">
                  В фазе вопроса чат активен только у отвечающей команды.
                </p>
              </div>

              {showMascot ? (
                <div className="-mt-3 flex min-w-0 flex-col p-1">
                  <div className="relative mx-auto h-[82px] w-[66px] overflow-hidden sm:h-[104px] sm:w-[84px] 2xl:h-[118px] 2xl:w-[96px]">
                    <MascotFramePlayer
                      frames={mascotFrames}
                      fps={mascotFps}
                      mood={mascotMood}
                    />
                  </div>
                  <p className="mt-1 text-center text-[10px] text-white/50">
                    Талисман
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-3 h-72 min-w-0 space-y-2 overflow-y-auto rounded-xl border border-white/15 bg-black/30 p-3 text-sm [scrollbar-width:thin] [scrollbar-color:rgba(56,189,248,0.75)_rgba(255,255,255,0.12)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gradient-to-b [&::-webkit-scrollbar-thumb]:from-cyan-400/90 [&::-webkit-scrollbar-thumb]:via-sky-500/90 [&::-webkit-scrollbar-thumb]:to-indigo-500/90 [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-white/20 max-[424px]:p-2 sm:h-80 2xl:h-[26rem] [@media(min-width:2200px)]:h-[34rem]">
              {canReadChatNow
                ? visibleChatMessages.map((message) => (
                    <div key={message.id} className="min-w-0 rounded-lg bg-white/10 p-2">
                      <p className="text-xs text-white/65">
                        {formatDisplayName(message.name, message.from)} •{" "}
                        {new Date(message.timestamp).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="break-words text-white/90">{message.text}</p>
                    </div>
                  ))
                : null}
              {canReadChatNow && !visibleChatMessages.length ? (
                <p className="text-white/50">Сообщений пока нет</p>
              ) : null}
              {!canReadChatNow ? (
                <p className="text-white/60">
                  Чат временно заблокирован. Сейчас отвечает{" "}
                  {roomState ? teamLabel(roomState.activeTeam) : "другая команда"}.
                </p>
              ) : null}
            </div>

            <div className="mt-3 flex min-w-0 gap-2">
              <input
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder={
                  !isSocketReady
                    ? "Нет подключения к WS"
                    : canWriteChatNow
                    ? "Сообщение"
                    : "Чат сейчас недоступен"
                }
                className="min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-white placeholder:text-white/60 outline-none transition focus:border-white/50"
              />
              <button
                onClick={sendChat}
                disabled={!canWriteChatNow}
                aria-label="Отправить сообщение"
                title="Отправить сообщение"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 shadow-lg shadow-emerald-900/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M22 2L11 13"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M22 2L15 22L11 13L2 9L22 2Z"
                  />
                </svg>
              </button>
            </div>
          </aside>
        </div>
      </div>

      {isExitModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setIsExitModalOpen(false)}
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-room-title"
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/25 bg-slate-950/90 p-5 shadow-2xl shadow-cyan-950/40 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-500/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />

            <div className="relative">
              <h3 id="exit-room-title" className="text-xl font-bold text-white">
                Точно хотите выйти из игры?
              </h3>
              <p className="mt-2 text-sm text-white/70">
                Вы покинете комнату и вернетесь на главную страницу.
              </p>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  onClick={() => setIsExitModalOpen(false)}
                  className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 font-semibold text-white transition hover:bg-white/20"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmExitGame}
                  className="rounded-xl bg-gradient-to-r from-red-500 to-rose-500 px-4 py-2 font-semibold text-white transition hover:brightness-110"
                >
                  Да, выйти
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isProfileLeaveModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setIsProfileLeaveModalOpen(false)}
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-room-for-profile-title"
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/25 bg-slate-950/90 p-5 shadow-2xl shadow-cyan-950/40 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-500/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />

            <div className="relative">
              <h3 id="leave-room-for-profile-title" className="text-xl font-bold text-white">
                Вы точно хотите покинуть эту комнату?
              </h3>
              <p className="mt-2 text-sm text-white/70">
                Вы выйдете из комнаты и перейдете в профиль.
              </p>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  onClick={() => setIsProfileLeaveModalOpen(false)}
                  className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 font-semibold text-white transition hover:bg-white/20"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmLeaveToProfile}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 font-semibold text-white transition hover:brightness-110"
                >
                  Да, перейти
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
