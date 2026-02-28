"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Trophy, Zap } from "lucide-react";
import AnimatedBackground from "@/components/AnimatedBackground";
import FriendsBtn from "@/components/FriendsBtn";
import {
  buyShopItem,
  equipShopItem,
  getProfile,
  getShop,
  ShopCatalogItem,
  ShopState,
} from "@/shared/api/auth";
import { fetchApi } from "@/shared/api/base";
import { useProfileAvatar } from "@/shared/hooks/useProfileAvatar";
import { ShopModal } from "@/shared/shop/ShopModal";
import { Frame } from "@/shared/shop/Frame";
import {
  DIFFICULTY_OPTIONS,
  GAME_MODE_OPTIONS,
  INTRO_SEEN_STORAGE_KEY,
  JOIN_PREFILL_PIN_STORAGE_KEY,
  QUESTION_COUNT_OPTIONS,
  TOPIC_OPTIONS,
  roomHostTokenKey,
  roomJoinIntentKey,
  roomPasswordKey,
  roomPlayerNameKey,
  roomRoleKey,
} from "@/features/home/constants";
import type { DifficultyMode, GameMode, RoomType } from "@/features/home/types";
import { progressivePlanLabel, questionCountLabel } from "@/features/home/utils";

export default function HomePage() {
  const router = useRouter();

  const [topic, setTopic] = useState<string>(TOPIC_OPTIONS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [isAiTopicUnavailable, setIsAiTopicUnavailable] = useState(false);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>("medium");
  const [gameMode, setGameMode] = useState<GameMode>("classic");
  const [openModeHelp, setOpenModeHelp] = useState<GameMode | null>(null);
  const [questionCount, setQuestionCount] = useState(5);
  const [isTopicOpen, setIsTopicOpen] = useState(false);
  const [isDifficultyOpen, setIsDifficultyOpen] = useState(false);
  const [isGameModeOpen, setIsGameModeOpen] = useState(false);
  const [isQuestionCountOpen, setIsQuestionCountOpen] = useState(false);
  const [hostName, setHostName] = useState("Ведущий");
  const [roomType, setRoomType] = useState<RoomType>("public");
  const [roomPassword, setRoomPassword] = useState("");
  const topicDropdownRef = useRef<HTMLDivElement | null>(null);
  const difficultyDropdownRef = useRef<HTMLDivElement | null>(null);
  const gameModeDropdownRef = useRef<HTMLDivElement | null>(null);
  const questionCountDropdownRef = useRef<HTMLDivElement | null>(null);

  const [joinPin, setJoinPin] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joinPasswordStatus, setJoinPasswordStatus] = useState<
    "idle" | "checking" | "valid" | "invalid" | "error"
  >("idle");
  const [joinRoomHasPassword, setJoinRoomHasPassword] = useState(false);
  const [joinRoomCheckStatus, setJoinRoomCheckStatus] = useState<
    "idle" | "loading" | "ready" | "not-found" | "error"
  >("idle");
  const [isClientReady, setIsClientReady] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [isRulesExpanded, setIsRulesExpanded] = useState(false);
  const [openIntroMode, setOpenIntroMode] = useState<GameMode | null>("classic");
  const [isRegistered, setIsRegistered] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [brokenProfileAvatarUrl, setBrokenProfileAvatarUrl] = useState<string | null>(null);
  const [homeError, setHomeError] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [shopCatalog, setShopCatalog] = useState<ShopCatalogItem[]>([]);
  const [shopState, setShopState] = useState<ShopState | null>(null);
  const [shopBusyId, setShopBusyId] = useState<string | null>(null);
  const {
    avatarUrl: profileAvatarUrl,
    displayName: profileDisplayName,
    coins: profileCoins,
    profileFrame,
  } = useProfileAvatar();
  const normalizedProfileName = (profileDisplayName || "").trim();
  const displayCoins = Number(shopState?.balance ?? profileCoins ?? 0);
  const equippedProfileFrame = shopState?.equipped?.profileFrame || profileFrame || null;
  const normalizedJoinPin = useMemo(
    () =>
      joinPin
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8),
    [joinPin]
  );
  const isPasswordRoomCreationInvalid = roomType === "password" && roomPassword.trim().length < 3;
  const shouldShowJoinPasswordInput =
    joinRoomHasPassword && (isRegistered || joinName.trim().length >= 2);

  const isJoinDisabled = useMemo(
    () =>
      normalizedJoinPin.length < 4 ||
      (!isRegistered && joinName.trim().length < 2) ||
      joinRoomCheckStatus === "loading" ||
      joinPasswordStatus === "checking" ||
      (shouldShowJoinPasswordInput && !joinPassword.trim()),
    [
      isRegistered,
      joinName,
      joinPassword,
      joinPasswordStatus,
      joinRoomCheckStatus,
      normalizedJoinPin,
      shouldShowJoinPasswordInput,
    ]
  );
  const selectedDifficulty =
    DIFFICULTY_OPTIONS.find((option) => option.value === difficultyMode) || DIFFICULTY_OPTIONS[0];
  const selectedGameMode =
    GAME_MODE_OPTIONS.find((option) => option.value === gameMode) || GAME_MODE_OPTIONS[0];
  const closeAllLists = () => {
    setIsTopicOpen(false);
    setIsDifficultyOpen(false);
    setIsGameModeOpen(false);
    setIsQuestionCountOpen(false);
    setOpenModeHelp(null);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const introSeen = window.localStorage.getItem(INTRO_SEEN_STORAGE_KEY) === "1";
    const rawToken = (window.localStorage.getItem("access_token") || "").trim();
    const registered = Boolean(rawToken);
    setAuthToken(rawToken && rawToken !== "undefined" && rawToken !== "null" ? rawToken : null);
    const pendingJoinPin = (window.localStorage.getItem(JOIN_PREFILL_PIN_STORAGE_KEY) || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    if (pendingJoinPin) {
      setJoinPin(pendingJoinPin);
      window.localStorage.removeItem(JOIN_PREFILL_PIN_STORAGE_KEY);
    }
    const frameId = window.requestAnimationFrame(() => {
      setShowIntro(!introSeen);
      setIsRegistered(registered);
      setIsClientReady(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (normalizedJoinPin.length < 4) {
      setJoinRoomHasPassword(false);
      setJoinRoomCheckStatus("idle");
      setJoinPassword("");
      setJoinPasswordStatus("idle");
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setJoinRoomCheckStatus("loading");
        try {
          const response = await fetchApi(`/api/rooms/${normalizedJoinPin}`, {
            signal: controller.signal,
          });
          if (cancelled) return;
          if (response.status === 404) {
            setJoinRoomHasPassword(false);
            setJoinRoomCheckStatus("not-found");
            setJoinPassword("");
            setJoinPasswordStatus("idle");
            return;
          }
          if (!response.ok) {
            throw new Error(`Не удалось проверить комнату (${response.status})`);
          }
          const data = (await response.json()) as { hasPassword?: boolean };
          const hasPassword = !!data?.hasPassword;
          setJoinRoomHasPassword(hasPassword);
          setJoinRoomCheckStatus("ready");
          if (!hasPassword) {
            setJoinPassword("");
            setJoinPasswordStatus("idle");
          }
        } catch {
          if (cancelled || controller.signal.aborted) return;
          setJoinRoomHasPassword(false);
          setJoinRoomCheckStatus("error");
          setJoinPasswordStatus("idle");
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [normalizedJoinPin]);

  useEffect(() => {
    setJoinPasswordStatus("idle");
  }, [joinPassword, normalizedJoinPin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = (window.localStorage.getItem("access_token") || "").trim();
    if (!token || token === "undefined" || token === "null") return;
    let cancelled = false;
    void getShop(token)
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
  }, []);

  const buyItem = async (itemId: string) => {
    if (typeof window === "undefined") return;
    const token = (window.localStorage.getItem("access_token") || "").trim();
    if (!token || token === "undefined" || token === "null") return;
    setShopBusyId(itemId);
    try {
      const response = await buyShopItem(itemId, token);
      setShopState(response.state);
    } finally {
      setShopBusyId(null);
    }
  };

  const equipItem = async (
    target: "profile_frame" | "cat" | "dog" | "victory_front" | "victory_back",
    itemId: string | null | undefined
  ) => {
    if (typeof window === "undefined") return;
    const token = (window.localStorage.getItem("access_token") || "").trim();
    if (!token || token === "undefined" || token === "null") return;
    setShopBusyId(`${target}:${itemId || "none"}`);
    try {
      const response = await equipShopItem({ target, item_id: itemId || null }, token);
      setShopState(response.state);
    } finally {
      setShopBusyId(null);
    }
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!topicDropdownRef.current?.contains(target)) {
        setIsTopicOpen(false);
      }
      if (!difficultyDropdownRef.current?.contains(target)) {
        setIsDifficultyOpen(false);
      }
      if (!gameModeDropdownRef.current?.contains(target)) {
        setIsGameModeOpen(false);
      }
      if (!questionCountDropdownRef.current?.contains(target)) {
        setIsQuestionCountOpen(false);
      }
      const modeHelpTrigger = (target as HTMLElement | null)?.closest("[data-mode-help]");
      if (!modeHelpTrigger) {
        setOpenModeHelp(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTopicOpen(false);
        setIsDifficultyOpen(false);
        setIsGameModeOpen(false);
        setIsQuestionCountOpen(false);
        setOpenModeHelp(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const resolveRegisteredHostName = async (): Promise<string> => {
    const inMemoryName = normalizedProfileName.trim();
    if (inMemoryName) {
      return inMemoryName.slice(0, 24);
    }

    const rawToken =
      (authToken || "").trim() ||
      (typeof window !== "undefined" ? (window.localStorage.getItem("access_token") || "").trim() : "");
    if (rawToken && rawToken !== "undefined" && rawToken !== "null") {
      try {
        const profile = await getProfile(rawToken);
        const dbName = String(profile?.user?.display_name || "").trim();
        if (dbName) {
          return dbName.slice(0, 24);
        }
      } catch {
        // Ignore and fallback below.
      }
    }

    return "Игрок";
  };

  const handleCreate = async () => {
    const resolvedHostName = isRegistered
      ? await resolveRegisteredHostName()
      : hostName.trim() || "Ведущий";
    const normalizedRoomPassword = roomPassword.trim();
    if (roomType === "password" && normalizedRoomPassword.length < 3) {
      setHomeError("Пароль комнаты должен содержать минимум 3 символа");
      return;
    }
    setHomeError("");
    setIsCreatingRoom(true);
    try {
      const requestedTopic = customTopic.trim() || topic.trim() || TOPIC_OPTIONS[0];
      const response = await fetchApi("/api/rooms/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: requestedTopic,
          difficulty: difficultyMode,
          gameMode,
          questionCount: Math.max(5, Math.min(7, questionCount)),
          roomType,
          roomPassword: roomType === "password" ? normalizedRoomPassword : undefined,
        }),
      });
      if (!response.ok) {
        let message = `Не удалось создать комнату (${response.status})`;
        try {
          const payload = (await response.json()) as { detail?: string };
          if (payload?.detail) {
            message = payload.detail;
          }
        } catch {
          // Ignore json parsing error and keep fallback message.
        }
        const aiUnavailable =
          response.status === 503 ||
          /нейросеть|не ответила|готового списка/i.test(message);
        if (aiUnavailable) {
          setIsAiTopicUnavailable(true);
          setCustomTopic("");
        }
        throw new Error(message);
      }
      setIsAiTopicUnavailable(false);

      const data = (await response.json()) as { roomId?: string; hostToken?: string };
      const roomId = (data.roomId || "").toUpperCase();
      const hostToken = (data.hostToken || "").trim();
      if (!roomId || !hostToken) {
        throw new Error("Сервер не вернул данные комнаты");
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(roomHostTokenKey(roomId), hostToken);
        window.localStorage.setItem(roomPlayerNameKey(roomId), resolvedHostName.slice(0, 24));
        window.localStorage.setItem(roomRoleKey(roomId), "host");
        window.localStorage.removeItem(roomJoinIntentKey(roomId));
      }

      router.push(`/room/${roomId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Не удалось создать комнату";
      setHomeError(message);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleJoin = async () => {
    const pin = normalizedJoinPin;
    if (!pin) return;

    if (joinRoomHasPassword) {
      const candidatePassword = joinPassword.trim();
      if (!candidatePassword) {
        setJoinPasswordStatus("invalid");
        return;
      }
      setJoinPasswordStatus("checking");
      try {
        const verifyResponse = await fetchApi(`/api/rooms/${pin}/verify-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: candidatePassword }),
        });
        if (!verifyResponse.ok) {
          setJoinPasswordStatus("error");
          return;
        }
        const verifyPayload = (await verifyResponse.json()) as {
          valid?: boolean;
          hasPassword?: boolean;
        };
        if (!verifyPayload?.valid) {
          setJoinPasswordStatus("invalid");
          return;
        }
        setJoinPasswordStatus("valid");
      } catch {
        setJoinPasswordStatus("error");
        return;
      }
    }

    const resolvedJoinName = isRegistered ? normalizedProfileName || "Игрок" : joinName.trim() || "Игрок";
    if (typeof window !== "undefined") {
      window.localStorage.setItem(roomPlayerNameKey(pin), resolvedJoinName.slice(0, 24));
      window.localStorage.setItem(roomRoleKey(pin), "player");
      window.localStorage.setItem(roomJoinIntentKey(pin), String(Date.now()));
      if (joinRoomHasPassword) {
        window.localStorage.setItem(roomPasswordKey(pin), joinPassword.trim());
      } else {
        window.localStorage.removeItem(roomPasswordKey(pin));
      }
    }
    router.push(`/room/${pin}`);
  };

  const markIntroSeen = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INTRO_SEEN_STORAGE_KEY, "1");
    }
    setShowIntro(false);
  };

  const handleContinueWithoutRegistration = () => {
    markIntroSeen();
  };

  const handleRegister = () => {
    markIntroSeen();
    router.push("/auth");
  };

  const handleAuthLinkClick = () => {
    markIntroSeen();
  };

  if (!isClientReady) {
    return (
      <main className="relative min-h-screen overflow-hidden text-white">
        <AnimatedBackground className="fixed inset-0 -z-10 h-full w-full" />
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <AnimatedBackground className="fixed inset-0 -z-10 h-full w-full" />

      {showIntro ? (
        <div className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-8 sm:px-6 lg:px-8">
          <section className="w-full rounded-3xl border border-white/20 bg-black/45 p-6 backdrop-blur-md sm:p-8">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">QuizBattle</h1>
            <p className="mt-3 text-base text-white/80 sm:text-lg">
              Здесь ведущий создает комнату, а участники подключаются по PIN и играют в реальном времени.
              Можно играть командами или каждый сам за себя.
            </p>

            <div className="mt-6 rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4 sm:p-5">
              <p className="text-sm font-semibold text-cyan-100 sm:text-base">Роли в игре</p>
              <ul className="mt-3 space-y-2 text-sm text-cyan-50/90 sm:text-base">
                <li>
                  <span className="font-semibold">Ведущий:</span> настраивает комнату, запускает этапы и управляет
                  ходом игры.
                </li>
                <li>
                  <span className="font-semibold">Участники:</span> отвечают на вопросы, соревнуются за баллы и
                  помогают команде победить.
                </li>
              </ul>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4 sm:p-5">
              <p className="text-sm font-semibold text-emerald-100 sm:text-base">Что дает регистрация</p>
              <p className="mt-2 text-sm text-emerald-50/90 sm:text-base">
                После регистрации открываются друзья, магазин, приглашения в комнаты, профиль, рейтинг среди друзей и
                синхронизация прогресса аккаунта.
              </p>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-white/20 bg-white/5">
              <p className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white/90 sm:px-5 sm:text-base">
                Режимы игры
              </p>
              <div className="divide-y divide-white/10">
                {GAME_MODE_OPTIONS.map((mode) => {
                  const isOpen = openIntroMode === mode.value;
                  return (
                    <div key={mode.value}>
                      <button
                        type="button"
                        onClick={() => setOpenIntroMode((prev) => (prev === mode.value ? null : mode.value))}
                        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-white/90 transition hover:bg-white/5 sm:px-5 sm:py-4 sm:text-base"
                      >
                        <span className="font-semibold">{mode.label}</span>
                        <svg
                          className={`h-5 w-5 text-white/70 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isOpen ? (
                        <div className="bg-black/20 px-4 pb-4 pt-1 text-sm text-white/80 sm:px-5 sm:text-base">
                          <p>{mode.hint}</p>
                          <p className="mt-2 text-white/70">{mode.rules}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/20 bg-white/5">
              <button
                type="button"
                onClick={() => setIsRulesExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-white/90 transition hover:bg-white/5 sm:px-5 sm:py-4 sm:text-base"
              >
                <span>Правила игры</span>
                <svg
                  className={`h-5 w-5 text-white/70 transition-transform ${isRulesExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isRulesExpanded ? (
                <div className="border-t border-white/10 px-4 pb-4 pt-3 text-sm text-white/80 sm:px-5 sm:text-base">
                  <ul className="space-y-2">
                    <li>1. Ведущий создаёт комнату, выбирает тему и число вопросов.</li>
                    <li>2. Участники заходят по PIN и ждут распределения на синий/красный сектор.</li>
                    <li>3. После старта проходят этапы: выбор капитана, выбор названия, ответы на вопросы.</li>
                    <li>4. Отвечает капитан активного сектора, система считает баллы и скорость.</li>
                    <li>5. В финале показывается победитель, статистика и результаты обеих команд.</li>
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleContinueWithoutRegistration}
                className="w-full rounded-xl border border-white/30 bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/20 sm:w-auto"
              >
                Продолжить без регистрации
              </button>
              <button
                type="button"
                onClick={handleRegister}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 px-4 py-3 font-semibold text-white shadow-lg shadow-sky-900/25 transition hover:brightness-110 sm:w-auto"
              >
                Зарегистрироваться
              </button>
            </div>
          </section>
        </div>
      ) : (
        <>
          <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8 text-center">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">QuizBattle</h1>
              <p className="mt-2 text-sm text-white/70 sm:text-base">
                Играй в квиз онлайн: создавай комнаты, зови друзей и отвечай в реальном времени.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 min-[1301px]:fixed min-[1301px]:right-8 min-[1301px]:top-8 min-[1301px]:z-20 min-[1301px]:mt-0">
                <Link
                  href="/rating"
                  className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/20 px-3 py-2 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/30"
                >
                  <Trophy className="h-4 w-4" />
                  <span>Рейтинг</span>
                </Link>
                <FriendsBtn token={authToken} />
                {isRegistered ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsShopOpen(true)}
                      className="rounded-xl border border-emerald-300/40 bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                    >
                      Магазин
                    </button>
                    <div className="inline-flex items-center gap-1 rounded-xl border border-amber-300/40 bg-amber-500/20 px-3 py-2 text-sm font-semibold text-amber-100">
                      <span>⭐</span>
                      <span>{displayCoins}</span>
                    </div>
                    <Link
                      href="/profile"
                      className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-black/35 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                    <Frame
                      frameId={equippedProfileFrame}
                      className="h-7 w-7 shrink-0"
                      radiusClass="rounded-full"
                      innerClassName="relative flex h-full w-full items-center justify-center rounded-full bg-white/20 p-0"
                      tuningVariant="room"
                    >
                      {profileAvatarUrl && profileAvatarUrl !== brokenProfileAvatarUrl ? (
                        <img
                          src={profileAvatarUrl}
                          alt="Аватар профиля"
                          className="h-full w-full rounded-full object-cover"
                          onError={() => setBrokenProfileAvatarUrl(profileAvatarUrl)}
                        />
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z"
                          />
                        </svg>
                      )}
                    </Frame>
                    <span>{normalizedProfileName || "Профиль"}</span>
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/auth"
                    onClick={handleAuthLinkClick}
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-300/25">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 11V7a4 4 0 10-8 0v4m-2 0h12a2 2 0 012 2v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5a2 2 0 012-2z"
                        />
                      </svg>
                    </span>
                    <span>Зарегистрироваться / Войти</span>
                  </Link>
                )}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <section className="flex h-full flex-col rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
                <h2 className="text-2xl font-semibold">Создать битву</h2>
                <div className="mt-4 space-y-3">
                  <div className="block">
                    <span className="mb-1 block text-sm text-white/80">Тема</span>
                    <p className="mb-2 text-xs text-white/65">
                      Можно выбрать готовую тему или ввести свою. Для своей темы вопросы сгенерирует
                      нейросеть, а если она не ответит, останутся готовые темы из списка.
                    </p>
                    {isAiTopicUnavailable ? (
                      <p className="mb-3 rounded-xl border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                        Упс:( наша нейросеть сейчас недоступна. Выберите тему из готового списка.
                      </p>
                    ) : (
                      <input
                        value={customTopic}
                        onChange={(event) => setCustomTopic(event.target.value.slice(0, 80))}
                        placeholder="Своя тема, например: Криптовалюты"
                        className="mb-3 w-full rounded-xl border border-fuchsia-300/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-fuchsia-200/60 focus:ring-2 focus:ring-fuchsia-300/30"
                      />
                    )}
                    <div className="relative" ref={topicDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          closeAllLists();
                          setIsTopicOpen((prev) => !prev);
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-cyan-300/35 bg-gradient-to-br from-white/15 to-white/5 px-3 py-2 text-left text-white shadow-[0_8px_30px_rgba(14,116,144,0.2)] outline-none transition hover:border-cyan-200/60 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                        aria-haspopup="listbox"
                        aria-expanded={isTopicOpen}
                      >
                        <span className="font-medium">{topic}</span>
                        <svg
                          className={`h-4 w-4 text-cyan-200 transition-transform ${isTopicOpen ? "rotate-180" : ""}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.512a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>

                      {isTopicOpen ? (
                        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/25 bg-slate-950/95 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
                          <ul className="py-1" role="listbox">
                            {TOPIC_OPTIONS.map((item) => {
                              const selected = topic === item;
                              return (
                                <li key={item}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTopic(item);
                                      closeAllLists();
                                    }}
                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                                      selected
                                        ? "bg-cyan-500/20 text-cyan-100"
                                        : "text-white/90 hover:bg-white/10"
                                    }`}
                                  >
                                    <span className="pr-2">{item}</span>
                                    <span
                                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition ${
                                        selected
                                          ? "bg-gradient-to-br from-cyan-300/40 to-sky-400/30 text-cyan-100 ring-1 ring-cyan-200/60"
                                          : "border border-white/20 text-transparent"
                                      }`}
                                    >
                                      <svg
                                        className="h-3 w-3"
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                        aria-hidden="true"
                                      >
                                        <path
                                          d="M3.5 8.5L6.5 11.2L12.5 4.8"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="block">
                    <span className="mb-1 block text-sm text-white/80">Сложность</span>
                    <div className="relative" ref={difficultyDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          closeAllLists();
                          setIsDifficultyOpen((prev) => !prev);
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-emerald-300/35 bg-gradient-to-br from-white/15 to-white/5 px-3 py-2 text-left text-white shadow-[0_8px_30px_rgba(5,150,105,0.2)] outline-none transition hover:border-emerald-200/60 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-emerald-300/40"
                        aria-haspopup="listbox"
                        aria-expanded={isDifficultyOpen}
                      >
                        <span className="font-medium">{selectedDifficulty.label}</span>
                        <svg
                          className={`h-4 w-4 text-emerald-200 transition-transform ${isDifficultyOpen ? "rotate-180" : ""}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.512a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>

                      {isDifficultyOpen ? (
                        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/25 bg-slate-950/95 shadow-2xl shadow-emerald-950/40 backdrop-blur-xl">
                          <ul className="py-1" role="listbox">
                            {DIFFICULTY_OPTIONS.map((option) => {
                              const selected = difficultyMode === option.value;
                              return (
                                <li key={option.value}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDifficultyMode(option.value);
                                      closeAllLists();
                                    }}
                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                                      selected
                                        ? "bg-emerald-500/20 text-emerald-100"
                                        : "text-white/90 hover:bg-white/10"
                                    }`}
                                  >
                                    <span className="pr-2">{option.label}</span>
                                    <span
                                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition ${
                                        selected
                                          ? "bg-gradient-to-br from-emerald-300/40 to-green-400/30 text-emerald-100 ring-1 ring-emerald-200/60"
                                          : "border border-white/20 text-transparent"
                                      }`}
                                    >
                                      <svg
                                        className="h-3 w-3"
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                        aria-hidden="true"
                                      >
                                        <path
                                          d="M3.5 8.5L6.5 11.2L12.5 4.8"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-white/65">{selectedDifficulty.hint}</p>
                    {difficultyMode === "progressive" ? (
                      <p className="mt-2 text-xs text-amber-200/90">
                        {progressivePlanLabel(questionCount)}
                      </p>
                    ) : null}
                  </div>

                  <div className="block">
                    <span className="mb-1 block text-sm text-white/80">Режим игры</span>
                    <div className="relative" ref={gameModeDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          closeAllLists();
                          setIsGameModeOpen((prev) => !prev);
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-cyan-300/35 bg-gradient-to-br from-white/15 to-white/5 px-3 py-2 text-left text-white shadow-[0_8px_30px_rgba(14,116,144,0.2)] outline-none transition hover:border-cyan-200/60 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                        aria-haspopup="listbox"
                        aria-expanded={isGameModeOpen}
                      >
                        <span className="font-medium">{selectedGameMode.label}</span>
                        <svg
                          className={`h-4 w-4 text-cyan-200 transition-transform ${isGameModeOpen ? "rotate-180" : ""}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.512a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>

                      {isGameModeOpen ? (
                        <div className="absolute z-[120] mt-2 w-full overflow-visible rounded-xl border border-white/25 bg-slate-950/95 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
                          <ul className="py-1" role="listbox">
                            {GAME_MODE_OPTIONS.map((option) => {
                              const selected = gameMode === option.value;
                              const showHelp = openModeHelp === option.value;
                              return (
                                <li key={option.value}>
                                  <div
                                    onClick={() => {
                                      setGameMode(option.value);
                                      closeAllLists();
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        setGameMode(option.value);
                                        closeAllLists();
                                      }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                                      selected
                                        ? "bg-cyan-500/20 text-cyan-100"
                                        : "text-white/90 hover:bg-white/10"
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <p className="font-medium">{option.label}</p>
                                      <p className="mt-1 text-xs text-white/70">{option.hint}</p>
                                    </div>
                                    <div className="group relative shrink-0" data-mode-help>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setOpenModeHelp((prev) => (prev === option.value ? null : option.value));
                                        }}
                                        className="inline-flex items-center justify-center text-amber-200/90 transition hover:text-amber-100 focus-visible:outline-none"
                                        aria-label={`Правила режима ${option.label}`}
                                      >
                                        <Info className="h-4 w-4" aria-hidden="true" />
                                      </button>
                                      <div
                                        className={`absolute right-0 z-[9999] mt-2 w-64 rounded-xl border border-white/20 bg-slate-950/95 p-2 text-xs text-white/90 shadow-xl transition ${
                                          showHelp
                                            ? "opacity-100"
                                            : "pointer-events-none opacity-0 sm:group-hover:opacity-100"
                                        }`}
                                      >
                                        {option.rules}
                                      </div>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-white/65">{selectedGameMode.hint}</p>
                  </div>

                  {!isRegistered ? (
                    <label className="block">
                      <span className="mb-1 block text-sm text-white/80">Имя ведущего</span>
                      <input
                        value={hostName}
                        onChange={(e) => setHostName(e.target.value)}
                        placeholder="Ведущий"
                        className="w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 outline-none transition focus:border-white/50"
                      />
                    </label>
                  ) : null}

                  <div className="block">
                    <span className="mb-1 block text-sm text-white/80">Количество вопросов</span>
                    <div className="relative" ref={questionCountDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          closeAllLists();
                          setIsQuestionCountOpen((prev) => !prev);
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-cyan-300/35 bg-gradient-to-br from-white/15 to-white/5 px-3 py-2 text-left text-white shadow-[0_8px_30px_rgba(14,116,144,0.2)] outline-none transition hover:border-cyan-200/60 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                        aria-haspopup="listbox"
                        aria-expanded={isQuestionCountOpen}
                      >
                        <span className="font-medium">{questionCountLabel(questionCount)}</span>
                        <svg
                          className={`h-4 w-4 text-cyan-200 transition-transform ${isQuestionCountOpen ? "rotate-180" : ""}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.512a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>

                      {isQuestionCountOpen ? (
                        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/25 bg-slate-950/95 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
                          <ul className="py-1" role="listbox">
                            {QUESTION_COUNT_OPTIONS.map((value) => {
                              const selected = questionCount === value;
                              return (
                                <li key={value}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQuestionCount(value);
                                      closeAllLists();
                                    }}
                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                                      selected
                                        ? "bg-cyan-500/20 text-cyan-100"
                                        : "text-white/90 hover:bg-white/10"
                                    }`}
                                  >
                                    <span>{questionCountLabel(value)}</span>
                                    <span
                                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition ${
                                        selected
                                          ? "bg-gradient-to-br from-cyan-300/40 to-sky-400/30 text-cyan-100 ring-1 ring-cyan-200/60"
                                          : "border border-white/20 text-transparent"
                                      }`}
                                    >
                                      <svg
                                        className="h-3 w-3"
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                        aria-hidden="true"
                                      >
                                        <path
                                          d="M3.5 8.5L6.5 11.2L12.5 4.8"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="block">
                    <span className="mb-1 block text-sm text-white/80">Тип комнаты</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRoomType("public")}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          roomType === "public"
                            ? "border-cyan-300/60 bg-cyan-500/25 text-cyan-100"
                            : "border-white/25 bg-white/10 text-white/80 hover:bg-white/15"
                        }`}
                      >
                        Обычная
                      </button>
                      <button
                        type="button"
                        onClick={() => setRoomType("password")}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          roomType === "password"
                            ? "border-amber-300/60 bg-amber-500/25 text-amber-100"
                            : "border-white/25 bg-white/10 text-white/80 hover:bg-white/15"
                        }`}
                      >
                        С паролем
                      </button>
                    </div>
                    {roomType === "password" ? (
                      <label className="mt-2 block">
                        <span className="mb-1 block text-sm text-white/80">Пароль комнаты</span>
                        <input
                          value={roomPassword}
                          onChange={(event) => setRoomPassword(event.target.value)}
                          placeholder="Минимум 3 символа"
                          className="w-full rounded-xl border border-amber-300/35 bg-white/10 px-3 py-2 outline-none transition focus:border-amber-200/70"
                        />
                      </label>
                    ) : (
                      <p className="mt-2 text-xs text-white/65">
                        В обычную комнату можно войти только по PIN.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-auto pt-5">
                  <button
                    onClick={handleCreate}
                    disabled={isCreatingRoom || isPasswordRoomCreationInvalid}
                    className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreatingRoom
                      ? "Создаём..."
                      : gameMode === "ffa"
                      ? "Создать FFA-битву"
                      : gameMode === "chaos"
                      ? "Создать Командный хаос"
                      : "Создать битву"}
                  </button>
                </div>
              </section>

              <section className="flex h-full flex-col rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
                <h2 className="text-2xl font-semibold">Присоединиться</h2>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-sm text-white/80">Введите PIN</span>
                    <input
                      value={joinPin}
                      onChange={(e) => setJoinPin(e.target.value.toUpperCase())}
                      placeholder="Например: AB12CD"
                      className="w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 uppercase outline-none transition focus:border-white/50"
                    />
                  </label>
                  {normalizedJoinPin.length >= 4 ? (
                    <p className="text-xs text-white/70">
                      {joinRoomCheckStatus === "loading"
                        ? "Проверяем комнату..."
                        : joinRoomHasPassword
                        ? "Комната защищена паролем"
                        : joinRoomCheckStatus === "not-found"
                        ? "Комната пока не найдена"
                        : joinRoomCheckStatus === "error"
                        ? "Не удалось проверить пароль комнаты, попробуйте войти"
                        : "Комната без пароля"}
                    </p>
                  ) : null}

                  {!isRegistered ? (
                    <label className="block">
                      <span className="mb-1 block text-sm text-white/80">Имя</span>
                      <input
                        value={joinName}
                        onChange={(e) => setJoinName(e.target.value)}
                        placeholder="Ваше имя"
                        className="w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 outline-none transition focus:border-white/50"
                      />
                    </label>
                  ) : null}

                  {shouldShowJoinPasswordInput ? (
                    <label className="block">
                      <span className="mb-1 block text-sm text-white/80">Пароль комнаты</span>
                      <input
                        value={joinPassword}
                        onChange={(event) => {
                          setJoinPassword(event.target.value);
                          if (joinPasswordStatus !== "idle") {
                            setJoinPasswordStatus("idle");
                          }
                        }}
                        placeholder="Введите пароль"
                        className="w-full rounded-xl border border-amber-300/35 bg-white/10 px-3 py-2 outline-none transition focus:border-amber-200/70"
                      />
                      {joinPasswordStatus === "checking" ? (
                        <p className="mt-1 text-xs text-amber-200">Проверяем пароль...</p>
                      ) : null}
                      {joinPasswordStatus === "valid" ? (
                        <p className="mt-1 text-xs text-emerald-300">Правильный пароль</p>
                      ) : null}
                      {joinPasswordStatus === "invalid" ? (
                        <p className="mt-1 text-xs text-rose-300">Неправильный пароль</p>
                      ) : null}
                      {joinPasswordStatus === "error" ? (
                        <p className="mt-1 text-xs text-rose-300">Не удалось проверить пароль</p>
                      ) : null}
                    </label>
                  ) : null}
                </div>

                <Link
                  href="/quick-game"
                  className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300/45 bg-amber-500/20 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/30"
                >
                  <Zap className="h-4 w-4" />
                  <span>Быстрая игра</span>
                </Link>
                <button
                  onClick={handleJoin}
                  disabled={isJoinDisabled}
                  className="mt-3 w-full rounded-xl bg-blue-500 px-4 py-3 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Войти
                </button>
              </section>
            </div>
            {homeError ? (
              <p className="mt-4 text-center text-sm text-rose-300">{homeError}</p>
            ) : null}
            <ShopModal
              open={isShopOpen}
              onClose={() => setIsShopOpen(false)}
              catalog={shopCatalog}
              state={shopState}
              busyId={shopBusyId}
              onBuy={buyItem}
              onEquip={equipItem}
            />
          </div>
        </>
      )}

    </main>
  );
}
