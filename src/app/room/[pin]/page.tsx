"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AnimatedBackground from "@/components/AnimatedBackground";
import { Ban, Pause, Play, Store } from "lucide-react";
import { useAlert } from "../../components/CustomAlert";
import { useProfileAvatar } from "@/shared/hooks/useProfileAvatar";
import { ShopModal } from "@/shared/shop/ShopModal";
import { buyShopItem, equipShopItem, getShop, ShopCatalogItem, ShopState } from "@/shared/api/auth";
import {
  buildMarketOverlayFrames,
  resolveVictoryEffectRenderPath,
} from "@/shared/shop/market";
import { Frame } from "@/shared/shop/Frame";
import {
  MascotFramePlayer,
  preloadMascotFrame,
} from "@/features/room/components/MascotVisuals";
import {
  HostReconnectSection,
  ManualPauseSection,
} from "@/features/room/components/RoomPauseSections";
import { RoomLobbySection } from "@/features/room/components/RoomLobbySection";
import { RoomQuestionSection } from "@/features/room/components/RoomQuestionSection";
import { RoomRevealSection } from "@/features/room/components/RoomRevealSection";
import { RoomResultsSection } from "@/features/room/components/RoomResultsSection";
import {
  CaptainVoteSection,
  TeamNamingSection,
} from "@/features/room/components/RoomSetupSections";
import { RoomTeamRevealSection } from "@/features/room/components/RoomTeamRevealSection";
import {
  DEFAULT_TEAM_NAMES,
  MASCOT_DISPLAY_META,
  MASCOT_FRAMES,
} from "@/features/room/constants";
import type {
  GameMode,
  MascotKind,
  MascotMood,
  Player,
  Team,
} from "@/features/room/types";
import {
  detectLowPerformanceMode,
  formatSeconds,
  getAvatarInitial,
  getPlayerAvatarStyle,
  modeLabel,
  truncateName,
  votesLabel,
} from "@/features/room/utils";
import { useRoomConnection } from "@/features/room/hooks/useRoomConnection";

const getStoredAccessToken = () => {
  if (typeof window === "undefined") return "";
  const raw = window.localStorage.getItem("access_token");
  if (!raw) return "";
  const token = raw.trim();
  if (!token || token === "undefined" || token === "null") return "";
  return token;
};

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ pin: string }>();

  const pin = (params?.pin || "").toUpperCase();

  const ffaMascotIntroShownRef = useRef(false);
  const spectatorIntroShownRef = useRef(false);

  const [now, setNow] = useState(() => Date.now());
  const [selectedAnswerState, setSelectedAnswerState] = useState<{
    key: string;
    index: number;
  } | null>(null);
  const [chatText, setChatText] = useState("");
  const [copiedPin, setCopiedPin] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isSkipQuestionModalOpen, setIsSkipQuestionModalOpen] = useState(false);
  const [hostMascotKind] = useState<MascotKind>(() => (Math.random() < 0.5 ? "dog" : "cat"));
  const [isLowPerformanceMode] = useState<boolean>(detectLowPerformanceMode);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [shopCatalog, setShopCatalog] = useState<ShopCatalogItem[]>([]);
  const [shopState, setShopState] = useState<ShopState | null>(null);
  const [shopBusyId, setShopBusyId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const {
    coins: profileCoins,
    equippedCatSkin,
    equippedDogSkin,
    equippedVictoryFrontEffect,
    equippedVictoryBackEffect,
  } = useProfileAvatar();
  const { AlertComponent, notify } = useAlert();
  const isRegisteredUser = !!accessToken;
  const displayCoins = Number(shopState?.balance ?? profileCoins ?? 0);
  const equippedSkins = {
    cat: shopState?.equipped?.catSkin || equippedCatSkin || null,
    dog: shopState?.equipped?.dogSkin || equippedDogSkin || null,
  };
  const equippedVictoryEffects = {
    front: shopState?.equipped?.victoryFrontEffect || equippedVictoryFrontEffect || null,
    back: shopState?.equipped?.victoryBackEffect || equippedVictoryBackEffect || null,
  };
  const handleRequireJoin = useCallback(() => {
    router.replace("/");
  }, [router]);
  const {
    peerId,
    isHost,
    isSpectator,
    assignedTeam,
    roomState,
    serverOffset,
    status,
    error,
    isSocketReady,
    send,
    setError,
  } = useRoomConnection({ pin, onRequireJoin: handleRequireJoin, notify });

  useEffect(() => {
    const timerMs = isLowPerformanceMode ? 1000 : 500;
    const timer = setInterval(() => setNow(Date.now()), timerMs);
    return () => clearInterval(timer);
  }, [isLowPerformanceMode]);

  useEffect(() => {
    if (!isExitModalOpen && !isSkipQuestionModalOpen && !isShopOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExitModalOpen(false);
        setIsSkipQuestionModalOpen(false);
        setIsShopOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExitModalOpen, isSkipQuestionModalOpen, isShopOpen]);

  const me = roomState?.players.find((player) => player.peerId === peerId) || null;
  const hostPlayer = roomState?.players.find((player) => player.isHost) || null;
  const gameMode: GameMode = roomState?.gameMode || "classic";
  const isClassicMode = gameMode === "classic";
  const isFfaMode = gameMode === "ffa";
  const isChaosMode = gameMode === "chaos";

  const effectiveIsHost = me?.isHost ?? isHost;
  const effectiveIsSpectator = me?.isSpectator ?? isSpectator;
  const myTeam = me?.team ?? assignedTeam;
  const isManualPausePhase = roomState?.phase === "manual-pause";
  const canHostTogglePause =
    !!roomState &&
    effectiveIsHost &&
    roomState.phase !== "lobby" &&
    roomState.phase !== "results" &&
    roomState.phase !== "host-reconnect";
  const mascotKindByPeerId = (targetPeerId?: string | null): MascotKind =>
    targetPeerId && targetPeerId.length
      ? targetPeerId.charCodeAt(targetPeerId.length - 1) % 2 === 0
        ? "dog"
        : "cat"
      : "dog";
  const neutralMascotKind: MascotKind = mascotKindByPeerId(peerId);
  const mascotKind: MascotKind =
    myTeam === "A"
      ? "dog"
      : myTeam === "B"
      ? "cat"
      : effectiveIsHost
      ? hostMascotKind
      : neutralMascotKind;
  const mascotTitle = MASCOT_DISPLAY_META[mascotKind]?.title || "талисман";
  const mascotMood: MascotMood = (() => {
    if (!roomState) return "common";

    if (isFfaMode) {
      if (roomState.phase === "question") {
        return "common";
      }
      if (roomState.phase === "reveal") {
        const myResult = roomState.lastReveal?.playerResults?.find(
          (item) => item.peerId === peerId
        );
        if (!myResult) return "sleep";
        return myResult.isCorrect ? "happy" : "sad";
      }
      return "common";
    }

    if (isChaosMode) {
      if (roomState.phase === "question") {
        return "common";
      }
      if (roomState.phase === "reveal") {
        const teamResult = myTeam ? roomState.lastReveal?.chaosTeamResults?.[myTeam] : undefined;
        if (!teamResult) return "common";
        return teamResult.isCorrect ? "happy" : "sad";
      }
      return "common";
    }

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
  const effectiveMascotFps = isLowPerformanceMode
    ? Math.max(3, Math.round(mascotFps * 0.6))
    : mascotFps;
  const captainSectorLabel = (team: Team) => (team === "A" ? "Синий сектор" : "Красный сектор");
  const captainSectorTextClass = (team: Team) => (team === "A" ? "text-sky-300" : "text-rose-300");

  useEffect(() => {
    setAccessToken(getStoredAccessToken());
  }, []);

  useEffect(() => {
    if (isLowPerformanceMode) return;
    Object.values(MASCOT_FRAMES[mascotKind])
      .flat()
      .forEach(preloadMascotFrame);
  }, [isLowPerformanceMode, mascotKind]);

  useEffect(() => {
    if (!roomState) return;

    if (!isFfaMode || roomState.phase === "lobby" || effectiveIsSpectator) {
      ffaMascotIntroShownRef.current = false;
      return;
    }

    if (
      roomState.phase === "question" &&
      !ffaMascotIntroShownRef.current
    ) {
      notify(`Ваш талисман ${mascotTitle} добавлен. Удачной игры.`, "info", 4500);
      ffaMascotIntroShownRef.current = true;
    }
  }, [
    effectiveIsSpectator,
    effectiveIsHost,
    isFfaMode,
    mascotTitle,
    notify,
    roomState,
  ]);

  useEffect(() => {
    if (!roomState || roomState.phase === "lobby" || !effectiveIsSpectator) {
      spectatorIntroShownRef.current = false;
      return;
    }
    if (spectatorIntroShownRef.current) return;

    notify("Вы подключены как зритель. Принять участие можно в следующей игре.", "info", 5200);
    spectatorIntroShownRef.current = true;
  }, [effectiveIsSpectator, notify, roomState]);

  useEffect(() => {
    if (!accessToken) {
      setShopCatalog([]);
      setShopState(null);
      return;
    }
    let cancelled = false;
    void getShop(accessToken)
      .then((response) => {
        if (cancelled) return;
        setShopCatalog(response.catalog || []);
        setShopState(response.state || null);
      })
      .catch(() => {
        if (cancelled) return;
        setShopCatalog([]);
        setShopState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const formatDisplayName = (name: string, targetPeerId?: string | null, maxLength = 20) => {
    const isSelf = !!peerId && !!targetPeerId && peerId === targetPeerId;
    const suffix = isSelf ? " (вы)" : "";
    const baseMaxLength = Math.max(4, maxLength - suffix.length);
    return `${truncateName(name, baseMaxLength)}${suffix}`;
  };

  const teamNames = roomState?.teamNames || DEFAULT_TEAM_NAMES;
  const teamLabel = (team: Team) => teamNames[team] || DEFAULT_TEAM_NAMES[team];
  const playerTeamByPeerId = useMemo(() => {
    const map = new Map<string, Team | null>();
    (roomState?.players || []).forEach((player) => {
      map.set(player.peerId, player.team ?? null);
    });
    return map;
  }, [roomState]);
  const useTeamChatColors = isClassicMode || isChaosMode;

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
    !effectiveIsSpectator &&
    !isTeamRevealCountdownVisible &&
    !isLowPerformanceMode;

  const captainVoteLeft = roomState?.captainVoteEndsAt
    ? Math.max(0, Math.ceil((roomState.captainVoteEndsAt - (now + serverOffset)) / 1000))
    : 0;

  const teamNamingLeft = roomState?.teamNamingEndsAt
    ? Math.max(0, Math.ceil((roomState.teamNamingEndsAt - (now + serverOffset)) / 1000))
    : 0;

  const hostReconnectLeft = roomState?.hostReconnectEndsAt
    ? Math.max(0, Math.ceil((roomState.hostReconnectEndsAt - (now + serverOffset)) / 1000))
    : 0;

  const myFfaAnswer =
    isFfaMode && roomState?.phase === "question" ? roomState?.myAnswer || null : null;
  const hasAnsweredCurrentFfaQuestion = isFfaMode && !!myFfaAnswer;
  const ffaAnswerProgress = roomState?.answerProgress || { answered: 0, total: 0 };
  const pendingPlayers = roomState?.pendingPlayers || [];
  const hasPendingSkipRequest =
    !!roomState && roomState.phase === "question" && roomState.skipRequest?.status === "pending";
  const chaosProgress =
    isChaosMode && roomState?.phase === "question" ? roomState?.chaosProgress || null : null;
  const hasSubmittedChaosVote = isChaosMode && !!chaosProgress?.submitted;

  const canReadChatNow =
    !!roomState &&
    (isFfaMode
      ? effectiveIsHost ||
        effectiveIsSpectator ||
        hasPendingSkipRequest ||
        roomState.phase !== "question" ||
        hasAnsweredCurrentFfaQuestion
      : effectiveIsHost ||
        effectiveIsSpectator ||
        hasPendingSkipRequest ||
        roomState.phase !== "question" ||
        myTeam === roomState.activeTeam);

  const canWriteChatNow =
    isSocketReady &&
    !!roomState &&
    !effectiveIsSpectator &&
    (isFfaMode
      ? effectiveIsHost ||
        roomState.phase !== "question" ||
        hasAnsweredCurrentFfaQuestion
      : roomState.phase !== "question" || (!effectiveIsHost && myTeam === roomState.activeTeam));

  const visibleChatMessages = roomState?.chat || [];

  const isMyTurn =
    !!me &&
    !!roomState &&
    (isFfaMode
      ? !effectiveIsHost && !effectiveIsSpectator
      : isChaosMode
      ? !effectiveIsHost && !effectiveIsSpectator && !!myTeam
      : me.team === roomState.activeTeam);
  const isMyTurnCaptain = isClassicMode && isMyTurn && !!me?.isCaptain;
  const canAnswerNow =
    !!roomState &&
    roomState.phase === "question" &&
    !effectiveIsSpectator &&
    (isClassicMode
      ? isMyTurnCaptain
      : isFfaMode
      ? isMyTurn && !hasAnsweredCurrentFfaQuestion
      : isChaosMode
      ? isMyTurn && !hasSubmittedChaosVote
      : !effectiveIsHost && myTeam === roomState.activeTeam);
  const questionCursor = roomState
    ? `${roomState.phase}:${roomState.currentQuestionIndex}`
    : "";
  const selectedAnswer =
    selectedAnswerState?.key === questionCursor ? selectedAnswerState.index : null;
  const canSubmit = roomState?.phase === "question" && canAnswerNow && selectedAnswer !== null;

  const ffaLeaderboard = isFfaMode
    ? (roomState?.players || [])
        .filter((player) => !player.isHost && !player.isSpectator)
        .map((player) => ({
          peerId: player.peerId,
          name: player.name,
          score: roomState?.playerScores?.[player.peerId] || 0,
        }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"))
    : [];
  const resultsSummary = roomState?.resultsSummary || null;
  const resultsRanking = isFfaMode ? resultsSummary?.ranking || [] : [];
  const captainContribution = !isFfaMode ? resultsSummary?.captainContribution || null : null;
  const hostDetails = resultsSummary?.hostDetails || null;
  const ffaTopScore = isFfaMode && ffaLeaderboard.length ? ffaLeaderboard[0].score : null;
  const ffaWinners =
    isFfaMode && ffaTopScore !== null
      ? ffaLeaderboard.filter((entry) => entry.score === ffaTopScore)
      : [];
  const myFfaEntry = isFfaMode && peerId ? ffaLeaderboard.find((entry) => entry.peerId === peerId) || null : null;
  const myFfaRank =
    isFfaMode && peerId ? ffaLeaderboard.findIndex((entry) => entry.peerId === peerId) + 1 : 0;
  const isMyFfaWinner =
    !!myFfaEntry && ffaTopScore !== null && Number(myFfaEntry.score) === Number(ffaTopScore);
  const winnerTeam: Team | null = (() => {
    if (!roomState || isFfaMode) return null;
    if (roomState.scores.A === roomState.scores.B) return null;
    return roomState.scores.A > roomState.scores.B ? "A" : "B";
  })();
  const winnerText = (() => {
    if (!roomState) return "";
    if (isFfaMode) {
      if (!ffaLeaderboard.length) return "Игра завершена";
      if (myFfaEntry) {
        if (isMyFfaWinner) {
          return ffaWinners.length > 1 ? "Вы среди победителей" : "Вы победили";
        }
        return `Ваше место: #${myFfaRank}`;
      }
      if (ffaWinners.length === 1) {
        return `Победитель: ${truncateName(ffaWinners[0].name, 24)}`;
      }
      return `Победители: ${ffaWinners.length}`;
    }
    if (winnerTeam === null) return "Ничья";
    if (myTeam) {
      return winnerTeam === myTeam ? "Ваша команда выиграла" : "Ваша команда проиграла";
    }
    return `Победила команда ${teamLabel(winnerTeam)}`;
  })();
  const winnerTextClass = (() => {
    if (isFfaMode) {
      return isMyFfaWinner ? "text-emerald-300" : "text-white/90";
    }
    if (winnerTeam === null) return "text-white/90";
    if (myTeam === "A") return "text-sky-300";
    if (myTeam === "B") return "text-rose-300";
    return winnerTeam === "A" ? "text-sky-300" : "text-rose-300";
  })();

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

  const skipQuestionByHost = () => {
    if (!effectiveIsHost || roomState?.phase !== "question") return;
    setIsSkipQuestionModalOpen(true);
  };

  const confirmSkipQuestionByHost = () => {
    if (!effectiveIsHost || roomState?.phase !== "question") {
      setIsSkipQuestionModalOpen(false);
      return;
    }
    send({ type: "skip-question" });
    setIsSkipQuestionModalOpen(false);
  };

  const requestSkipQuestion = () => {
    if (
      !roomState ||
      roomState.phase !== "question" ||
      effectiveIsHost ||
      effectiveIsSpectator
    )
      return;
    if (roomState.skipRequest?.meRequested || roomState.skipRequest?.status === "rejected") return;
    send({ type: "request-skip-question" });
  };

  const resolveSkipQuestionRequest = (decision: "approve" | "reject") => {
    if (!roomState || !effectiveIsHost || roomState.phase !== "question") return;
    send({ type: "resolve-skip-request", decision });
  };

  const buyItem = async (itemId: string) => {
    if (!accessToken) {
      notify("Магазин доступен только зарегистрированным пользователям", "warning");
      return;
    }
    setShopBusyId(itemId);
    try {
      const response = await buyShopItem(itemId, accessToken);
      setShopState(response.state);
      notify("Покупка успешна", "success");
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : "Не удалось купить предмет", "error");
    } finally {
      setShopBusyId(null);
    }
  };

  const equipItem = async (
    target: "profile_frame" | "cat" | "dog" | "victory_front" | "victory_back",
    itemId: string | null | undefined
  ) => {
    if (!accessToken) return;
    setShopBusyId(`${target}:${itemId || "none"}`);
    try {
      const response = await equipShopItem({ target, item_id: itemId || null }, accessToken);
      setShopState(response.state);
      send({ type: "refresh-profile-assets" });
      notify("Предмет применён", "success");
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : "Не удалось применить предмет", "error");
    } finally {
      setShopBusyId(null);
    }
  };

  const playerByPeerId = useMemo(() => {
    const map = new Map<string, Player>();
    (roomState?.players || []).forEach((player) => map.set(player.peerId, player));
    return map;
  }, [roomState]);

  const getMascotOverlayFrames = (
    kind: MascotKind,
    mood: MascotMood,
    targetPeerId?: string | null
  ) => {
    const baseFrames = MASCOT_FRAMES[kind][mood];
    const player = targetPeerId ? playerByPeerId.get(targetPeerId) : undefined;
    const equippedItemId =
      player?.mascotSkins?.[kind] || (targetPeerId === peerId || !targetPeerId ? equippedSkins[kind] : null);
    return buildMarketOverlayFrames(equippedItemId, mood, baseFrames);
  };

  const getVictoryEffectsByPeerId = (targetPeerId?: string | null) => {
    const player = targetPeerId ? playerByPeerId.get(targetPeerId) : undefined;
    const hasTarget = !!(targetPeerId && String(targetPeerId).trim().length > 0);
    const frontPath =
      player?.victoryEffects?.front ||
      (!hasTarget || targetPeerId === peerId ? equippedVictoryEffects.front : null);
    const backPath =
      player?.victoryEffects?.back ||
      (!hasTarget || targetPeerId === peerId ? equippedVictoryEffects.back : null);

    return {
      front: resolveVictoryEffectRenderPath(frontPath, "front"),
      back: resolveVictoryEffectRenderPath(backPath, "back"),
    };
  };

  const togglePauseByHost = () => {
    if (!canHostTogglePause) return;
    send({ type: "toggle-pause" });
  };

  const moderateChatMessage = (messageId: string) => {
    if (!effectiveIsHost || !messageId || !roomState || roomState.phase === "lobby") return;
    send({ type: "moderate-chat-message", messageId });
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

  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const buildResultsWordHtml = () => {
    if (!roomState || !resultsSummary) return "";

    const heading = isFfaMode ? "Отчет по игре (Все против всех)" : "Отчет по игре (Командный режим)";
    const generatedAt = new Date().toLocaleString("ru-RU");
    const baseMetaRows = `
      <tr><th>Комната</th><td>${escapeHtml(roomState.roomId)}</td></tr>
      <tr><th>Тема</th><td>${escapeHtml(roomState.topic)}</td></tr>
      <tr><th>Режим</th><td>${escapeHtml(modeLabel(roomState.gameMode || "classic"))}</td></tr>
      <tr><th>Вопросов</th><td>${escapeHtml(roomState.questionCount)}</td></tr>
      <tr><th>Сформирован</th><td>${escapeHtml(generatedAt)}</td></tr>
    `;

    let body = `
      <h1>${escapeHtml(heading)}</h1>
      <h2>Общая информация</h2>
      <table><tbody>${baseMetaRows}</tbody></table>
      <h2>Итог</h2>
      <p>${escapeHtml(winnerText)}</p>
    `;

    if (isFfaMode) {
      const rankingRows =
        resultsRanking.length > 0
          ? resultsRanking.map(
              (entry) => `
                <tr>
                  <td>${escapeHtml(entry.place)}</td>
                  <td>${escapeHtml(entry.name)}</td>
                  <td>${escapeHtml(entry.points)}</td>
                  <td>${escapeHtml(entry.correctAnswers)}</td>
                </tr>
              `
            )
          : ffaLeaderboard.map(
              (entry, index) => `
                <tr>
                  <td>${escapeHtml(index + 1)}</td>
                  <td>${escapeHtml(entry.name)}</td>
                  <td>${escapeHtml(entry.score)}</td>
                  <td>0</td>
                </tr>
              `
            );

      body += `
        <h2>Финальный рейтинг</h2>
        <table>
          <thead>
            <tr>
              <th>Место</th>
              <th>Игрок</th>
              <th>Очки</th>
              <th>Правильных</th>
            </tr>
          </thead>
          <tbody>${rankingRows.join("")}</tbody>
        </table>
      `;
    } else {
      const teamRows = (["A", "B"] as Team[]).map(
        (team) => `
          <tr>
            <td>${escapeHtml(teamLabel(team))}</td>
            <td>${escapeHtml(roomState.scores?.[team] ?? 0)}</td>
          </tr>
        `
      );

      const publicPlayersRows = (resultsSummary.players || []).map(
        (entry) => `
          <tr>
            <td>${escapeHtml(entry.name)}</td>
            <td>${escapeHtml(entry.team ? teamLabel(entry.team) : "-")}</td>
            <td>${escapeHtml(entry.correctAnswers)}</td>
          </tr>
        `
      );

      body += `
        <h2>Счёт команд</h2>
        <table>
          <thead>
            <tr>
              <th>Команда</th>
              <th>Баллы</th>
            </tr>
          </thead>
          <tbody>${teamRows.join("")}</tbody>
        </table>
      `;

      if (publicPlayersRows.length > 0) {
        body += `
          <h2>Игроки (упрощенно)</h2>
          <table>
            <thead>
              <tr>
                <th>Игрок</th>
                <th>Команда</th>
                <th>Правильных ответов</th>
              </tr>
            </thead>
            <tbody>${publicPlayersRows.join("")}</tbody>
          </table>
        `;
      }

      if (captainContribution && !captainContribution.note) {
        const captainRows = (["A", "B"] as Team[]).map((team) => {
          const captain = team === "A" ? captainContribution.A : captainContribution.B;
          if (!captain) {
            return `
              <tr>
                <td>${escapeHtml(teamLabel(team))}</td>
                <td>-</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
              </tr>
            `;
          }
          return `
            <tr>
              <td>${escapeHtml(teamLabel(team))}</td>
              <td>${escapeHtml(captain.name)}</td>
              <td>${escapeHtml(captain.correctAnswers)}</td>
              <td>${escapeHtml(captain.wrongAnswers)}</td>
              <td>${escapeHtml(captain.points)}</td>
            </tr>
          `;
        });

        body += `
          <h2>Вклад капитанов</h2>
          <table>
            <thead>
              <tr>
                <th>Команда</th>
                <th>Капитан</th>
                <th>Верно</th>
                <th>Ошибок</th>
                <th>Очки</th>
              </tr>
            </thead>
            <tbody>${captainRows.join("")}</tbody>
          </table>
        `;
      }
    }

    if (hostDetails) {
      const fullPlayersRows = (hostDetails.players || []).map(
        (player) => `
          <tr>
            <td>${escapeHtml(player.name)}</td>
            <td>${escapeHtml(player.team ? teamLabel(player.team) : "-")}</td>
            <td>${escapeHtml(player.answers)}</td>
            <td>${escapeHtml(player.correctAnswers)}</td>
            <td>${escapeHtml(player.wrongAnswers)}</td>
            <td>${escapeHtml(player.skippedAnswers)}</td>
            <td>${escapeHtml(player.points)}</td>
            <td>${escapeHtml(player.avgResponseMs ?? "-")}</td>
            <td>${escapeHtml(player.fastestResponseMs ?? "-")}</td>
          </tr>
        `
      );

      body += `
        <h2>Полная статистика ведущего</h2>
        <table>
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Команда</th>
              <th>Ответов</th>
              <th>Верно</th>
              <th>Ошибок</th>
              <th>Пропусков</th>
              <th>Очки</th>
              <th>Среднее, мс</th>
              <th>Лучшее, мс</th>
            </tr>
          </thead>
          <tbody>${fullPlayersRows.join("")}</tbody>
        </table>
      `;

      const questionRows = (hostDetails.questionHistory || [])
        .slice(-20)
        .map((entry, index) => {
          const raw = entry as { mode?: string; questionNumber?: number; skippedByHost?: boolean };
          return `
            <tr>
              <td>${escapeHtml(raw.questionNumber || index + 1)}</td>
              <td>${escapeHtml(raw.mode || roomState.gameMode || "classic")}</td>
              <td>${escapeHtml(raw.skippedByHost ? "Да" : "Нет")}</td>
            </tr>
          `;
        });
      if (questionRows.length > 0) {
        body += `
          <h2>История вопросов</h2>
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Режим</th>
                <th>Пропуск ведущим</th>
              </tr>
            </thead>
            <tbody>${questionRows.join("")}</tbody>
          </table>
        `;
      }

      const eventRows = (hostDetails.eventHistory || [])
        .slice(-30)
        .map(
          (event) => `
            <tr>
              <td>${escapeHtml(
                event.timestamp
                  ? new Date(event.timestamp).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "--:--"
              )}</td>
              <td>${escapeHtml(event.kind || "system")}</td>
              <td>${escapeHtml(event.text || "")}</td>
            </tr>
          `
        );
      if (eventRows.length > 0) {
        body += `
          <h2>История событий</h2>
          <table>
            <thead>
              <tr>
                <th>Время</th>
                <th>Тип</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>${eventRows.join("")}</tbody>
          </table>
        `;
      }
    }

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>QuizBattle Results</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; line-height: 1.4; }
    h1, h2 { margin: 10px 0 6px; }
    p { margin: 4px 0 8px; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; }
    th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #efefef; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
  };

  const handleExportDocx = () => {
    if (!effectiveIsHost || !roomState?.resultsSummary) return;
    try {
      const html = buildResultsWordHtml();
      if (!html) return;
      const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const blob = new Blob(["\ufeff", html], { type: `${mime};charset=utf-8` });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `quizbattle-${roomState.roomId}-results.docx`;
      link.click();
      window.URL.revokeObjectURL(url);
      notify("Статистика сохранена в DOCX.", "success", 3200);
    } catch {
      notify("Не удалось сохранить экспорт Word.", "error", 3600);
    }
  };

  const handleExitGame = () => {
    setIsExitModalOpen(true);
  };

  useEffect(() => {
    if (!isSkipQuestionModalOpen) return;
    if (!effectiveIsHost || roomState?.phase !== "question") {
      const timer = window.setTimeout(() => {
        setIsSkipQuestionModalOpen(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [effectiveIsHost, isSkipQuestionModalOpen, roomState?.phase]);

  const confirmExitGame = () => {
    setIsExitModalOpen(false);
    router.push("/");
  };

  const renderLobby = () => (
    <RoomLobbySection
      roomTopic={roomState?.topic || "QuizBattle"}
      roomId={roomState?.roomId || ""}
      pin={pin}
      hostPlayerName={hostPlayer?.name || ""}
      players={roomState?.players || []}
      roomPhase={roomState?.phase}
      gameMode={gameMode}
      effectiveIsHost={effectiveIsHost}
      formatDisplayName={formatDisplayName}
      getAvatarInitial={getAvatarInitial}
      getPlayerAvatarStyle={getPlayerAvatarStyle}
      onStartGame={() => send({ type: "start-game" })}
    />
  );

  const renderTeamReveal = () => (
    <RoomTeamRevealSection
      teamRevealCountdown={teamRevealCountdown}
      myTeam={myTeam}
      isClassicMode={isClassicMode}
      effectiveIsHost={effectiveIsHost}
      teamAPlayers={teamAPlayers}
      teamBPlayers={teamBPlayers}
      teamLabel={teamLabel}
      roomPhase={roomState?.phase}
      getPlayerAvatarStyle={getPlayerAvatarStyle}
    />
  );

  const renderHostReconnect = () => (
    <HostReconnectSection
      disconnectedHostName={roomState?.disconnectedHostName}
      hostReconnectLeft={hostReconnectLeft}
    />
  );

  const renderManualPause = () => (
    <ManualPauseSection
      manualPauseByName={roomState?.manualPauseByName}
      effectiveIsHost={effectiveIsHost}
    />
  );

  const renderCaptainVote = () => (
    roomState ? (
      <CaptainVoteSection
        roomState={roomState}
        captainVoteReadyTeams={captainVoteReadyTeams}
        captainVoteLeft={captainVoteLeft}
        effectiveIsHost={effectiveIsHost}
        myTeam={myTeam}
        myCaptainVote={myCaptainVote}
        peerId={peerId || ""}
        voteCaptain={voteCaptain}
        truncateName={truncateName}
        formatSeconds={formatSeconds}
        votesLabel={votesLabel}
        captainSectorLabel={captainSectorLabel}
        captainSectorTextClass={captainSectorTextClass}
      />
    ) : null
  );

  const renderTeamNaming = () => (
    roomState ? (
      <TeamNamingSection
        roomState={roomState}
        teamNamingReadyTeams={teamNamingReadyTeams}
        teamNamingLeft={teamNamingLeft}
        myTeam={myTeam}
        effectiveIsHost={effectiveIsHost}
        isClassicMode={isClassicMode}
        isMyCaptain={!!me?.isCaptain}
        teamNameDraft={teamNameDraft}
        setTeamNameDraft={setTeamNameDraft}
        defaultMyTeamName={defaultMyTeamName}
        saveTeamName={saveTeamName}
        randomizeTeamName={randomizeTeamName}
        teamLabel={teamLabel}
        truncateName={truncateName}
        formatSeconds={formatSeconds}
      />
    ) : null
  );

  const renderQuestion = () => (
    roomState ? (
      <RoomQuestionSection
        roomState={roomState}
        isClassicMode={isClassicMode}
        isFfaMode={isFfaMode}
        isChaosMode={isChaosMode}
        effectiveIsHost={effectiveIsHost}
        effectiveIsSpectator={effectiveIsSpectator}
        myTeam={myTeam}
        isMyTurn={isMyTurn}
        canAnswerNow={canAnswerNow}
        hasSubmittedChaosVote={hasSubmittedChaosVote}
        hasAnsweredCurrentFfaQuestion={hasAnsweredCurrentFfaQuestion}
        pendingPlayers={pendingPlayers}
        chaosProgress={chaosProgress}
        secondsLeft={secondsLeft}
        selectedAnswer={selectedAnswer}
        canSubmit={canSubmit}
        myFfaAnswer={myFfaAnswer}
        ffaAnswerProgress={ffaAnswerProgress}
        teamLabel={teamLabel}
        skipQuestionByHost={skipQuestionByHost}
        requestSkipQuestion={requestSkipQuestion}
        submitAnswer={submitAnswer}
        setSelectedAnswer={(index) =>
          setSelectedAnswerState({
            key: questionCursor,
            index,
          })
        }
      />
    ) : null
  );

  const renderReveal = () =>
    roomState ? (
      <RoomRevealSection
        roomState={roomState}
        gameMode={gameMode}
        isFfaMode={isFfaMode}
        isChaosMode={isChaosMode}
        effectiveIsHost={effectiveIsHost}
        myTeam={myTeam}
        teamLabel={teamLabel}
      />
    ) : null;

  const renderResults = () => (
    <RoomResultsSection
      isFfaMode={isFfaMode}
      winnerText={winnerText}
      winnerTextClass={winnerTextClass}
      winnerTeam={winnerTeam}
      scores={roomState?.scores || { A: 0, B: 0 }}
      teamLabel={teamLabel}
      truncateName={truncateName}
      mascotKindByPeerId={mascotKindByPeerId}
      getMascotOverlayFrames={getMascotOverlayFrames}
      getVictoryEffectsByPeerId={getVictoryEffectsByPeerId}
      isLowPerformanceMode={isLowPerformanceMode}
      ffaLeaderboard={ffaLeaderboard}
      resultsRanking={resultsRanking}
      captainContribution={captainContribution}
      hostDetails={hostDetails}
      effectiveIsHost={effectiveIsHost}
      onExportDocx={handleExportDocx}
      onNewGame={() => send({ type: "new-game" })}
    />
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
            {isRegisteredUser ? (
              <div className="ml-auto flex flex-col items-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsShopOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                  title="Магазин"
                >
                  <Store className="h-4 w-4 shrink-0" />
                  <span className="max-[520px]:hidden">Магазин</span>
                </button>
                <div className="inline-flex items-center gap-1 rounded-full border border-amber-300/45 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100">
                  <span>⭐</span>
                  <span>{displayCoins}</span>
                </div>
              </div>
            ) : null}
          </div>

          <p className="mt-2 text-sm text-white/70 2xl:text-base [@media(min-width:2200px)]:text-lg">{status}</p>
          <p className="mt-1 text-xs text-cyan-200/80 2xl:text-sm">Режим: {modeLabel(gameMode)}</p>
          {error ? <p className="text-sm text-rose-300 2xl:text-base [@media(min-width:2200px)]:text-lg">{error}</p> : null}

          <div className="mt-3 flex flex-wrap items-stretch justify-between gap-3 sm:items-end 2xl:mt-4 2xl:gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExitGame}
                className="rounded-lg bg-red-500/85 px-3 py-1.5 text-sm font-semibold transition hover:bg-red-500 2xl:px-4 2xl:py-2 2xl:text-base [@media(min-width:2200px)]:text-lg"
              >
                Выйти из игры
              </button>
              {canHostTogglePause ? (
                <button
                  onClick={togglePauseByHost}
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-500/80 px-3 py-1.5 text-sm font-semibold transition hover:bg-sky-500 2xl:px-4 2xl:py-2 2xl:text-base [@media(min-width:2200px)]:text-lg"
                >
                  {isManualPausePhase ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {isManualPausePhase ? "Продолжить" : "Пауза"}
                </button>
              ) : null}
            </div>

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
            {roomState?.phase === "captain-vote" && isClassicMode && renderCaptainVote()}
            {roomState?.phase === "team-naming" && renderTeamNaming()}
            {roomState?.phase === "question" && renderQuestion()}
            {roomState?.phase === "reveal" && renderReveal()}
            {roomState?.phase === "results" && renderResults()}
            {roomState?.phase === "host-reconnect" && renderHostReconnect()}
            {roomState?.phase === "manual-pause" && renderManualPause()}
          </div>

          <aside className="min-w-0 self-start h-fit rounded-3xl border border-white/20 bg-black/35 p-4 backdrop-blur-md max-[424px]:p-3 2xl:p-5 [@media(min-width:2200px)]:p-6">
            <div
              className={`grid min-w-0 ${
                showMascot
                  ? "grid-cols-[minmax(0,1fr)_72px] gap-2 sm:grid-cols-[minmax(0,1fr)_88px] sm:gap-3 2xl:grid-cols-[minmax(0,1fr)_104px]"
                  : "grid-cols-1"
              }`}
            >
              <div className="flex h-full min-w-0 flex-col justify-end p-1 pb-1">
                <h3 className="-mt-1 text-lg font-semibold">
                  {isFfaMode ? "Чат ожидания" : "Чат команды"}
                </h3>
                <p className="mt-[5px] text-xs text-white/60">
                  {isFfaMode
                    ? effectiveIsHost || effectiveIsSpectator
                      ? "В FFA у ведущего чат всегда открыт."
                      : "В FFA чат откроется после вашего ответа на текущий вопрос."
                    : "В фазе вопроса чат активен только у отвечающей команды."}
                </p>
              </div>

              {showMascot ? (
                <div className="-mt-3 flex min-w-0 flex-col p-1">
                  <div className="relative mx-auto h-[82px] w-[66px] overflow-hidden sm:h-[104px] sm:w-[84px] 2xl:h-[118px] 2xl:w-[96px]">
                    <MascotFramePlayer
                      frames={mascotFrames}
                      overlayFrames={getMascotOverlayFrames(mascotKind, mascotMood, peerId)}
                      fps={effectiveMascotFps}
                      mood={mascotMood}
                      preloadAllFrames={!isLowPerformanceMode}
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
                ? visibleChatMessages.map((message) => {
                    const isHostMessage =
                      !!hostPlayer?.peerId && !!message.from && message.from === hostPlayer.peerId;
                    const senderTeam = useTeamChatColors
                      ? playerTeamByPeerId.get(message.from) || null
                      : null;
                    const isTeamA = senderTeam === "A";
                    const isTeamB = senderTeam === "B";
                    const messageCardClass = isHostMessage
                      ? "border border-amber-300/45 bg-amber-500/20"
                      : isTeamA
                      ? "border border-sky-300/35 bg-sky-500/15"
                      : isTeamB
                      ? "border border-rose-300/35 bg-rose-500/15"
                      : "bg-white/10";
                    const messageMetaClass = isHostMessage
                      ? "text-amber-100/95"
                      : isTeamA
                      ? "text-sky-200/90"
                      : isTeamB
                      ? "text-rose-200/90"
                      : "text-white/65";
                    const messageTextClass = isHostMessage
                      ? "text-amber-50"
                      : isTeamA
                      ? "text-sky-100"
                      : isTeamB
                      ? "text-rose-100"
                      : "text-white/90";
                    const messagePlayer = playerByPeerId.get(message.from || "") || null;
                    const canModerateMessage =
                      effectiveIsHost &&
                      roomState?.phase !== "lobby" &&
                      message.from !== "system" &&
                      !!message.from &&
                      message.from !== peerId &&
                      message.kind !== "skip-request";

                    return (
                      <div key={message.id} className={`min-w-0 rounded-lg p-2 ${messageCardClass}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-3">
                            {message.from !== "system" ? (
                              <Frame
                                frameId={messagePlayer?.profileFrame || null}
                                className="mt-0.5 h-7 w-7 shrink-0"
                                radiusClass="rounded-full"
                                innerClassName="p-0"
                              >
                                <span
                                  className="inline-flex h-full w-full items-center justify-center rounded-full text-[10px] font-semibold text-white"
                                  style={
                                    getPlayerAvatarStyle(
                                      messagePlayer || {
                                        peerId: "",
                                        name: message.name,
                                        team: null,
                                        isHost: false,
                                        avatar: null,
                                      },
                                      roomState?.phase
                                    ) as CSSProperties
                                  }
                                >
                                  {!messagePlayer?.avatar ? getAvatarInitial(message.name) : ""}
                                </span>
                              </Frame>
                            ) : null}
                            <div className="min-w-0">
                              <p className={`text-xs ${messageMetaClass}`}>
                                {formatDisplayName(message.name, message.from)} •{" "}
                                {new Date(message.timestamp).toLocaleTimeString("ru-RU", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                              <p className={`break-words ${messageTextClass}`}>{message.text}</p>
                            </div>
                          </div>
                          {canModerateMessage ? (
                            <button
                              type="button"
                              onClick={() => moderateChatMessage(message.id)}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-red-300/55 bg-red-500/10 text-red-200 transition hover:bg-red-500/25"
                              aria-label="Удалить сообщение и выдать бан"
                              title="Удалить сообщение и выдать бан"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                        {effectiveIsHost &&
                        roomState?.phase === "question" &&
                        roomState?.skipRequest?.status === "pending" &&
                        roomState?.skipRequest?.messageId === message.id &&
                        message.kind === "skip-request" ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => resolveSkipQuestionRequest("reject")}
                              className="rounded-lg border border-slate-300/55 bg-slate-500/15 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-500/25"
                            >
                              Отмена
                            </button>
                            <button
                              type="button"
                              onClick={() => resolveSkipQuestionRequest("approve")}
                              className="rounded-lg border border-emerald-300/60 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                            >
                              OK
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                : null}
              {canReadChatNow && !visibleChatMessages.length ? (
                <p className="text-white/50">Сообщений пока нет</p>
              ) : null}
              {!canReadChatNow ? (
                <p className="text-white/60">
                  {isFfaMode
                    ? effectiveIsHost
                      ? "Чат доступен только ведущему."
                      : "Чат закрыт. Ответьте на вопрос и используйте кнопку «Попросить пропустить», если нужно."
                    : (
                      <>
                        Чат временно заблокирован. Сейчас отвечает{" "}
                        {roomState ? teamLabel(roomState.activeTeam) : "другая команда"}.
                      </>
                    )}
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
                    : effectiveIsSpectator
                    ? "Режим зрителя: чат только для чтения"
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

      {isSkipQuestionModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setIsSkipQuestionModalOpen(false)}
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-question-title"
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/25 bg-slate-950/90 p-5 shadow-2xl shadow-cyan-950/40 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-emerald-500/20 blur-3xl" />

            <div className="relative">
              <h3 id="skip-question-title" className="text-xl font-bold text-white">
                Точно пропустить вопрос?
              </h3>
              <p className="mt-2 text-sm text-white/70">
                Текущий вопрос завершится сразу и игра перейдёт дальше.
              </p>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  onClick={() => setIsSkipQuestionModalOpen(false)}
                  className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 font-semibold text-white transition hover:bg-white/20"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmSkipQuestionByHost}
                  className="rounded-xl bg-gradient-to-r from-red-500 to-rose-500 px-4 py-2 font-semibold text-white transition hover:brightness-110"
                >
                  Да, пропустить
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

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

      {isRegisteredUser ? (
        <ShopModal
          open={isShopOpen}
          onClose={() => setIsShopOpen(false)}
          catalog={shopCatalog}
          state={shopState}
          busyId={shopBusyId}
          onBuy={buyItem}
          onEquip={equipItem}
        />
      ) : null}
      <AlertComponent />
    </main>
  );
}
