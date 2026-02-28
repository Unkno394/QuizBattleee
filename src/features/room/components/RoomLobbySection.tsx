import { Check, Crown, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import type { GameMode, Phase, Player } from "@/features/room/types";
import { fetchApi, toBearerToken } from "@/shared/api/base";
import { Frame } from "@/shared/shop/Frame";

type Props = {
  roomTopic: string;
  roomId: string;
  pin: string;
  hostPlayerName: string;
  players: Player[];
  roomPhase?: Phase;
  gameMode: GameMode;
  effectiveIsHost: boolean;
  formatDisplayName: (name: string, targetPeerId?: string | null, maxLength?: number) => string;
  getAvatarInitial: (name: string) => string;
  getPlayerAvatarStyle: (player: Player, phase?: Phase) => CSSProperties;
  onStartGame: () => void;
  token: string | null;
  currentPeerId?: string | null;
  currentUserBackendId?: number | null;
  notify: (
    message: string,
    type?: "success" | "error" | "warning" | "info",
    duration?: number,
    action?: { label: string; href?: string; onClick?: () => void }
  ) => void;
};

export function RoomLobbySection({
  roomTopic,
  roomId,
  pin,
  hostPlayerName,
  players,
  roomPhase,
  gameMode,
  effectiveIsHost,
  formatDisplayName,
  getAvatarInitial,
  getPlayerAvatarStyle,
  onStartGame,
  token,
  currentPeerId,
  currentUserBackendId,
  notify,
}: Props) {
  const host = players.find((player) => player.isHost) || null;
  const participants = players.filter((player) => !player.isHost);
  const startEligibleParticipants = participants.filter((player) => !player.isSpectator);
  const startEligibleCount = startEligibleParticipants.length;
  const requiresTwoParticipants = gameMode === "classic" || gameMode === "chaos";
  const startBlockedReason =
    startEligibleCount === 0
      ? "Нельзя начать игру: в комнате нет участников."
      : requiresTwoParticipants && startEligibleCount < 2
      ? "Нельзя начать игру: для этого режима нужно минимум 2 участника."
      : "";
  const canStartGame = !startBlockedReason;
  const [alreadyFriends, setAlreadyFriends] = useState<Set<number>>(() => new Set());
  const [outgoingRequests, setOutgoingRequests] = useState<Set<number>>(() => new Set());
  const [incomingRequests, setIncomingRequests] = useState<Set<number>>(() => new Set());
  const [optimisticSentRequests, setOptimisticSentRequests] = useState<Set<number>>(() => new Set());
  const [liveRefreshTick, setLiveRefreshTick] = useState(0);
  const isViewerRegistered = !!token;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleFriendEvent = () => setLiveRefreshTick((prev) => prev + 1);
    window.addEventListener("qb:friend-request-received", handleFriendEvent);
    window.addEventListener("qb:friend-request-resolved", handleFriendEvent);
    return () => {
      window.removeEventListener("qb:friend-request-received", handleFriendEvent);
      window.removeEventListener("qb:friend-request-resolved", handleFriendEvent);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setAlreadyFriends(new Set());
      setOutgoingRequests(new Set());
      setIncomingRequests(new Set());
      setOptimisticSentRequests(new Set());
      return;
    }

    let cancelled = false;
    const loadStatuses = async () => {
      try {
        const nextFriends = new Set<number>();
        const nextOutgoing = new Set<number>();
        const nextIncoming = new Set<number>();

        const friendsRes = await fetchApi("/api/friends", {
          cache: "no-store",
          headers: { Authorization: toBearerToken(token) },
        });
        if (friendsRes.ok) {
          const friendsData = await friendsRes.json();
          (friendsData.friends || []).forEach((f: { id?: number }) => {
            if (typeof f?.id === "number" && f.id > 0) nextFriends.add(f.id);
          });
        }

        const outgoingRes = await fetchApi("/api/friends/requests/outgoing", {
          cache: "no-store",
          headers: { Authorization: toBearerToken(token) },
        });
        if (outgoingRes.ok) {
          const outgoingData = await outgoingRes.json();
          (outgoingData.requests || []).forEach((r: { friend_id?: number }) => {
            if (typeof r?.friend_id === "number" && r.friend_id > 0) {
              nextOutgoing.add(r.friend_id);
            }
          });
        }

        const incomingRes = await fetchApi("/api/friends/requests", {
          cache: "no-store",
          headers: { Authorization: toBearerToken(token) },
        });
        if (incomingRes.ok) {
          const incomingData = await incomingRes.json();
          (incomingData.requests || []).forEach((r: { requester_id?: number }) => {
            if (typeof r?.requester_id === "number" && r.requester_id > 0) {
              nextIncoming.add(r.requester_id);
            }
          });
        }

        if (!cancelled) {
          setAlreadyFriends(nextFriends);
          setOutgoingRequests(nextOutgoing);
          setIncomingRequests(nextIncoming);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load lobby friend statuses:", error);
        }
      }
    };

    void loadStatuses();
    return () => {
      cancelled = true;
    };
  }, [token, liveRefreshTick]);

  const markSent = (userId: number) => {
    setOptimisticSentRequests((prev) => new Set(prev).add(userId));
  };

  const unmarkSent = (userId: number) => {
    setOptimisticSentRequests((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  };

  const sendFriendRequest = async (targetUserId: number, player: Player) => {
    if (!isViewerRegistered) {
      notify(
        "Перед добавлением в друзья нужно зарегистрироваться.",
        "warning",
        7000,
        { label: "Зарегистрироваться", href: "/auth" }
      );
      return;
    }
    if (!targetUserId) return;
    const isSelf =
      (currentPeerId && player.peerId === currentPeerId) ||
      (currentUserBackendId && targetUserId === currentUserBackendId);
    if (isSelf) return;

    markSent(targetUserId);
    try {
      const response = await fetchApi("/api/friends/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: toBearerToken(token),
        },
        body: JSON.stringify({ friend_id: targetUserId }),
      });
      if (!response.ok) {
        let message = `Ошибка ${response.status}`;
        try {
          const data = await response.json();
          if (typeof data?.detail === "string" && data.detail.trim()) {
            message = data.detail;
          }
        } catch {
          try {
            const text = await response.text();
            if (text.trim()) message = text;
          } catch {
            // ignore parse fallback
          }
        }
        throw new Error(message);
      }
      try {
        const payload = await response.json();
        if (payload?.relation === "incoming_pending") {
          unmarkSent(targetUserId);
          notify("Пользователь уже отправил вам заявку в друзья.", "info");
          return;
        }
        if (payload?.relation === "already_friends") {
          setAlreadyFriends((prev) => new Set(prev).add(targetUserId));
        }
      } catch {
        // ignore JSON parse errors for success responses
      }
    } catch (error) {
      unmarkSent(targetUserId);
      const message = error instanceof Error ? error.message : "Не удалось добавить в друзья";
      const resolvedMessage =
        /failed to fetch|networkerror/i.test(message)
          ? "Нет соединения с сервером. Проверь доступность backend (порт 3001)."
          : message;
      notify(`Не удалось добавить в друзья: ${resolvedMessage}`, "error");
      console.error("Failed to send friend request:", error);
    }
  };

  const renderFriendControl = (player: Player, positionClass = "") => {
    const isSelf =
      (currentPeerId && player.peerId === currentPeerId) ||
      (currentUserBackendId && player.authUserId && player.authUserId === currentUserBackendId);
    if (isSelf) return null;

    if (!isViewerRegistered) {
      return (
        <button
          type="button"
          onClick={() =>
            notify(
              "Перед добавлением в друзья нужно зарегистрироваться.",
              "warning",
              7000,
              { label: "Зарегистрироваться", href: "/auth" }
            )
          }
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/25 bg-white/10 text-gray-300 transition hover:bg-white/15 ${positionClass}`.trim()}
          title="Добавить в друзья"
        >
          <UserPlus className="h-3.5 w-3.5" />
        </button>
      );
    }

    if (!player.authUserId) {
      return (
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-gray-500 ${positionClass}`.trim()}
          title="Добавлять можно только зарегистрированных игроков"
        >
          <UserPlus className="h-3.5 w-3.5" />
        </span>
      );
    }

    const userId = player.authUserId;
    const showCheck =
      alreadyFriends.has(userId) ||
      outgoingRequests.has(userId) ||
      incomingRequests.has(userId) ||
      optimisticSentRequests.has(userId);
    const baseClass =
      `inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/25 bg-white/10 text-gray-300 ${positionClass}`.trim();

    if (showCheck) {
      return (
        <span className={`${baseClass}`} title={alreadyFriends.has(userId) ? "Друг" : "Запрос отправлен"}>
          <Check className="h-3.5 w-3.5" />
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={() => {
          void sendFriendRequest(userId, player);
        }}
        className={`${baseClass} transition hover:bg-white/15`}
        title="Добавить в друзья"
        aria-label="Добавить в друзья"
      >
        <UserPlus className="h-3.5 w-3.5" />
      </button>
    );
  };

  return (
    <section className="min-w-0 rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md max-[424px]:p-4 sm:p-6 lg:flex lg:h-full lg:flex-col">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="break-words text-2xl font-semibold max-[424px]:text-xl">{roomTopic || "QuizBattle"}</h2>
            <p className="text-sm text-white/70">PIN: {roomId || pin}</p>
            <p className="text-sm text-white/70" title={hostPlayerName ? formatDisplayName(hostPlayerName, undefined, 32) : undefined}>
              Ведущий: {hostPlayerName ? formatDisplayName(hostPlayerName, undefined, 20) : "-"}
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
              <div className="flex min-w-0 items-center gap-3">
                <Frame
                  frameId={host.profileFrame}
                  className="h-7 w-7 shrink-0"
                  radiusClass="rounded-full"
                  innerClassName="p-0"
                  tuningVariant="room"
                >
                  <span
                    className="inline-flex h-full w-full items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={getPlayerAvatarStyle(host, roomPhase)}
                  >
                    {host.avatar ? "" : getAvatarInitial(host.name)}
                  </span>
                </Frame>
                <span className="min-w-0 flex-1 truncate" title={host.name}>
                  {formatDisplayName(host.name, host.peerId)}
                </span>
                {renderFriendControl(host)}
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
                  <li key={player.peerId} className="flex min-w-0 items-center gap-3">
                    <Frame
                      frameId={player.profileFrame}
                      className="h-7 w-7 shrink-0"
                      radiusClass="rounded-full"
                      innerClassName="p-0"
                      tuningVariant="room"
                    >
                      <span
                        className="inline-flex h-full w-full items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={getPlayerAvatarStyle(player, roomPhase)}
                      >
                        {player.avatar ? "" : getAvatarInitial(player.name)}
                      </span>
                    </Frame>
                    <span className="min-w-0 flex-1 truncate" title={player.name}>
                      {formatDisplayName(player.name, player.peerId)}
                    </span>
                    {renderFriendControl(player, "-ml-[5px]")}
                  </li>
                ))
              ) : (
                <li className="text-white/60">Пока нет участников</li>
              )}
            </ul>
          </div>
        </div>

        <p className="mt-4 text-sm text-white/70">
          {gameMode === "ffa"
            ? "Режим FFA: после старта каждый играет сам за себя, без команд и капитанов."
            : gameMode === "chaos"
            ? "Режим Командный хаос: команды формируются автоматически, без капитанов."
            : "До старта никто не видит свою команду. Распределение появится после команды ведущего."}
        </p>
      </div>

      <div className="mt-4 lg:mt-auto lg:pt-4">
        {effectiveIsHost ? (
          <button
            onClick={() => {
              if (!canStartGame) {
                notify(startBlockedReason, "warning");
                return;
              }
              onStartGame();
            }}
            disabled={!canStartGame}
            className="mt-5 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 disabled:cursor-not-allowed disabled:bg-emerald-800/60 disabled:text-white/70 disabled:shadow-none"
          >
            {gameMode === "ffa" ? "Запустить FFA-раунд" : "Запустить формирование команд"}
          </button>
        ) : (
          <p className="mt-5 text-sm text-white/70">Старт игры запускает ведущий.</p>
        )}
      </div>
    </section>
  );
}
