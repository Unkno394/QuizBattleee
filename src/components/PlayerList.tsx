"use client";

import { useEffect, useState } from "react";
import { UserPlus, Check, Clock, Loader } from "lucide-react";
import { Team } from "@/features/room/types";
import { fetchApi, toBearerToken } from "@/shared/api/base";

export const getStoredAccessToken = () => {
  if (typeof window === "undefined") return "";
  const raw = window.localStorage.getItem("access_token");
  if (!raw) return "";
  const token = raw.trim();
  if (!token || token === "undefined" || token === "null") return "";
  return token;
};

interface Player {
  peerId: string;
  authUserId?: number | null;
  name: string;
  avatar?: string;
  isHost: boolean;
  team?: Team | null;
  isSpectator?: boolean;
}

interface FriendStatus {
  id?: number;
  status: "friend" | "pending" | "outgoing" | "not_friend" | "self";
}

interface PlayerListProps {
  players?: Player[];
  teamNames?: Partial<Record<Team, string>>;
  currentUserId?: string | undefined;
  currentUserBackendId?: number | undefined;
  notify?: (
    message: string,
    type?: "success" | "error" | "warning" | "info",
    duration?: number,
    action?: { label: string; href?: string; onClick?: () => void }
  ) => void;
  onFriendRequestSent?: (peerId: string, userId: number) => void;
  onFriendRequestResolved?: (peerId: string, accepted: boolean) => void;
  refreshKey?: unknown;
}

export function PlayerList({
  players = [],
  teamNames,
  currentUserId,
  currentUserBackendId,
  notify,
  onFriendRequestSent,
  onFriendRequestResolved,
  refreshKey,
}: PlayerListProps) {
  const [friendStatuses, setFriendStatuses] = useState<Record<string, FriendStatus>>({});
  const [loading, setLoading] = useState(true);
  const [sendingFriend, setSendingFriend] = useState<string | null>(null);
  const [liveRefreshTick, setLiveRefreshTick] = useState(0);

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

  // Load initial friend statuses
  useEffect(() => {
    const fetchFriendStatuses = async () => {
      const token = getStoredAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        // Get friends list
        const friendsResponse = await fetchApi("/api/friends", {
          cache: "no-store",
          headers: { Authorization: toBearerToken(token) },
        });

        if (!friendsResponse.ok) {
          setLoading(false);
          return;
        }

        const friendsData = await friendsResponse.json();
        const friends = friendsData.friends || [];
        const friendIdMap: Record<string, FriendStatus> = {};

        // Build map of friend IDs by peerId and id
        friends.forEach((f: any) => {
          if (f.peerId !== undefined) {
            friendIdMap[f.peerId] = { id: f.id, status: "friend" };
          }
          if (f.id !== undefined) {
            friendIdMap[String(f.id)] = { id: f.id, status: "friend" };
          }
        });

        // Fetch outgoing requests (requests WE sent)
        const outgoingRes = await fetchApi("/api/friends/requests/outgoing", {
          cache: "no-store",
          headers: { Authorization: toBearerToken(token) },
        }).catch(() => null);

        if (outgoingRes?.ok) {
          const outgoingData = await outgoingRes.json();
          (outgoingData.requests || []).forEach((r: any) => {
            if (r.friend_id !== undefined) {
              friendIdMap[String(r.friend_id)] = { id: r.friend_id, status: "outgoing" };
            }
          });
        }

        // Fetch incoming pending requests (requests sent TO us)
        const incomingRes = await fetchApi("/api/friends/requests", {
          cache: "no-store",
          headers: { Authorization: toBearerToken(token) },
        }).catch(() => null);

        if (incomingRes?.ok) {
          const incomingData = await incomingRes.json();
          (incomingData.requests || []).forEach((r: any) => {
            if (r.requester_id !== undefined && !friendIdMap[String(r.requester_id)]) {
              friendIdMap[String(r.requester_id)] = {
                id: r.requester_id,
                status: "pending",
              };
            }
          });
        }

        // Mark non-friends
        players.forEach((player) => {
          const peerId = player.peerId;
          const userId = player.authUserId;
          if (!userId) {
            return;
          }
          if (
            !friendIdMap[peerId] &&
            !friendIdMap[String(userId)] &&
            peerId !== currentUserId &&
            userId !== currentUserBackendId
          ) {
            friendIdMap[peerId] = { status: "not_friend" };
            friendIdMap[String(userId)] = { status: "not_friend" };
          }
        });

        setFriendStatuses(friendIdMap);
      } catch (error) {
        console.error("Failed to fetch friend statuses:", error);
      } finally {
        setLoading(false);
      }
    };

    if (players.length > 0) {
      fetchFriendStatuses();
    } else {
      setLoading(false);
    }
  }, [players, currentUserId, currentUserBackendId, refreshKey, liveRefreshTick]);

  const handleAddFriend = async (peerId: string, userId: number) => {
    const token = getStoredAccessToken();
    if (!token) {
      notify?.(
        "Перед добавлением в друзья нужно зарегистрироваться.",
        "warning",
        7000,
        { label: "Зарегистрироваться", href: "/auth" }
      );
      return;
    }

    setSendingFriend(peerId);
    try {
      const response = await fetchApi("/api/friends/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: toBearerToken(token),
        },
        body: JSON.stringify({ friend_id: userId }),
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
            // ignore
          }
        }
        throw new Error(message);
      }

      let relation: string | null = null;
      try {
        const payload = await response.json();
        if (typeof payload?.relation === "string") relation = payload.relation;
      } catch {
        // ignore JSON parse errors for success responses
      }

      if (relation === "incoming_pending") {
        setFriendStatuses((prev) => ({
          ...prev,
          [peerId]: { id: userId, status: "pending" },
          [String(userId)]: { id: userId, status: "pending" },
        }));
        notify?.("Пользователь уже отправил вам заявку в друзья.", "info");
        return;
      }

      if (relation === "outgoing_pending") {
        setFriendStatuses((prev) => ({
          ...prev,
          [peerId]: { id: userId, status: "outgoing" },
          [String(userId)]: { id: userId, status: "outgoing" },
        }));
        return;
      }

      setFriendStatuses((prev) => ({
        ...prev,
        // optimistic UI: immediately show as "friend" with checkmark
        [peerId]: { id: userId, status: "friend" },
        [String(userId)]: { id: userId, status: "friend" },
      }));
      onFriendRequestSent?.(peerId, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось добавить в друзья";
      const resolvedMessage =
        /failed to fetch|networkerror/i.test(message)
          ? "Нет соединения с сервером. Проверь доступность backend (порт 3001)."
          : message;
      notify?.(`Не удалось добавить в друзья: ${resolvedMessage}`, "error");
      console.error("Failed to send friend request:", error);
    } finally {
      setSendingFriend(null);
    }
  };

  const teamLabel = (team: Team) => {
    if (team === "A") return teamNames?.A || "Команда A";
    return teamNames?.B || "Команда B";
  };

  const renderFriendControl = (player: Player) => {
    const peerId = player.peerId;
    const userId = player.authUserId;
    const isSelf = peerId === currentUserId || userId === currentUserBackendId;
    const status = friendStatuses[peerId] || friendStatuses[String(userId)];
    const isSending = sendingFriend === peerId;

    if (isSelf || !userId) return null;

    if (status?.status === "friend") {
      return (
        <span
          className="inline-flex items-center gap-1 rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-xs font-medium text-gray-200 whitespace-nowrap"
          title="Уже в друзьях"
        >
          <Check size={12} className="text-gray-300" />
          Друг
        </span>
      );
    }

    if (status?.status === "outgoing" || status?.status === "pending") {
      return (
        <span
          className="inline-flex items-center gap-1 rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-xs font-medium text-gray-200 whitespace-nowrap"
          title="Запрос отправлен"
        >
          <Clock size={12} className="text-gray-300" />
          Запрос отправлен
        </span>
      );
    }

    if (isSending) {
      return (
        <span className="inline-flex items-center gap-1 rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-xs font-medium text-gray-200 whitespace-nowrap">
          <Loader size={12} className="animate-spin text-gray-300" />
          ...
        </span>
      );
    }

    return (
      <button
        onClick={() => handleAddFriend(peerId, userId)}
        className="inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/10 p-1.5 text-gray-100 transition-colors hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Добавить в друзья"
        aria-label="Добавить в друзья"
      >
        <UserPlus size={14} className="text-gray-300" />
      </button>
    );
  };

  const renderPlayerRow = (player: Player, nameClass = "text-white") => (
    <div
      key={player.peerId}
      className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2.5"
    >
      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-400/90 to-cyan-600/90 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
        {player.avatar ? (
          <img src={player.avatar} alt={player.name} className="w-full h-full rounded-full object-cover" />
        ) : (
          (player.name || "?")[0].toUpperCase()
        )}
      </div>

      <span className={`min-w-0 flex-1 truncate text-sm font-medium ${nameClass}`} title={player.name}>
        {player.name}
      </span>

      {renderFriendControl(player)}
    </div>
  );

  const host = players.find((player) => player.isHost) || null;
  const participants = players.filter((player) => !player.isHost);
  const teamA = participants.filter((player) => player.team === "A");
  const teamB = participants.filter((player) => player.team === "B");
  const unassigned = participants.filter((player) => !player.team);
  const hasTeamDistribution = teamA.length > 0 || teamB.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {host ? (
        <div className="rounded-xl border border-amber-300/35 bg-amber-500/10 p-2.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200">Ведущий</p>
          {renderPlayerRow(host, "text-amber-100")}
        </div>
      ) : null}

      {hasTeamDistribution ? (
        <>
          <div className="rounded-xl border border-sky-300/30 bg-sky-500/10 p-2.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-200">
              {teamLabel("A")}
            </p>
            <div className="space-y-2">
              {teamA.length ? teamA.map((player) => renderPlayerRow(player, "text-sky-100")) : (
                <p className="text-xs text-white/60">Пока нет игроков</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-2.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-200">
              {teamLabel("B")}
            </p>
            <div className="space-y-2">
              {teamB.length ? teamB.map((player) => renderPlayerRow(player, "text-rose-100")) : (
                <p className="text-xs text-white/60">Пока нет игроков</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-white/15 bg-black/25 p-2.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">
            Участники
          </p>
          <div className="space-y-2">
            {unassigned.length ? unassigned.map((player) => renderPlayerRow(player, "text-white")) : (
              !loading ? <p className="text-xs text-white/60">Нет участников</p> : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}
