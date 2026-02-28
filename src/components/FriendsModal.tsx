"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Users, UserPlus, Check, X, Send, Loader } from "lucide-react";
import { fetchApi, toBearerToken } from "@/shared/api/base";
import { modeLabel } from "@/features/room/utils";
import { roomJoinIntentKey, roomPlayerNameKey, roomRoleKey } from "@/features/room/constants";

interface Friend {
  id: number;
  display_name: string;
  avatar_url?: string;
  equipped_cat_skin?: string;
  equipped_dog_skin?: string;
  preferred_mascot?: string;
}

interface FriendRequest {
  id: number;
  requester_id: number;
  display_name: string;
  avatar_url?: string;
  created_at?: string;
}

interface OutgoingFriendRequest {
  id: number;
  friend_id: number;
  display_name?: string;
  avatar_url?: string;
  created_at?: string;
}

interface RoomInvitation {
  id: number;
  room_id: string;
  inviter_name: string;
  inviter_avatar?: string;
  game_mode?: "classic" | "ffa" | "chaos";
  created_at?: string;
}

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  inviteRoomId?: string | null;
  canInviteToRoom?: boolean;
  inviteDisabledReason?: string;
  onStatusChanged?: () => void; // Callback to refresh parent badge
}

export default function FriendsModal({
  isOpen,
  onClose,
  token,
  inviteRoomId = null,
  canInviteToRoom = true,
  inviteDisabledReason,
  onStatusChanged,
}: FriendsModalProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingFriendRequest[]>([]);
  const [roomInvitations, setRoomInvitations] = useState<RoomInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"friends" | "requests" | "invites">("friends");
  const [newFriendId, setNewFriendId] = useState("");
  const [searchError, setSearchError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [invitingFriendId, setInvitingFriendId] = useState<number | null>(null);
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<number>>(() => new Set());
  const [respondingInviteId, setRespondingInviteId] = useState<number | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPortalRoot(window.document.body);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setInviteError("");
      setInviteSuccess("");
      setInvitedFriendIds(new Set());
      loadFriendsAndRequests();
    }
  }, [isOpen, token, inviteRoomId]);

  useEffect(() => {
    if (!isOpen || !token) return;
    const interval = window.setInterval(() => {
      void loadFriendsAndRequests();
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [isOpen, token]);

  const loadFriendsAndRequests = async () => {
    if (!token) return;
    setLoading(true);
    setLoadError("");

    try {
      const friendsRes = await fetchApi("/api/friends", {
        cache: "no-store",
        headers: { Authorization: toBearerToken(token) },
      });
      if (friendsRes.ok) {
        const data = await friendsRes.json();
        setFriends(data.friends || []);
      } else {
        setFriends([]);
      }

      const requestsRes = await fetchApi("/api/friends/requests", {
        cache: "no-store",
        headers: { Authorization: toBearerToken(token) },
      });
      if (requestsRes.ok) {
        const data = await requestsRes.json();
        setFriendRequests(data.requests || []);
      } else {
        setFriendRequests([]);
        setLoadError(`Не удалось загрузить входящие заявки (HTTP ${requestsRes.status})`);
      }

      const outgoingRes = await fetchApi("/api/friends/requests/outgoing", {
        cache: "no-store",
        headers: { Authorization: toBearerToken(token) },
      });
      if (outgoingRes.ok) {
        const data = await outgoingRes.json();
        setOutgoingRequests(data.requests || []);
      } else {
        setOutgoingRequests([]);
      }

      const invitationsRes = await fetchApi("/api/rooms/invitations", {
        cache: "no-store",
        headers: { Authorization: toBearerToken(token) },
      });
      if (invitationsRes.ok) {
        const data = await invitationsRes.json();
        setRoomInvitations(data.invitations || []);
      } else {
        setRoomInvitations([]);
      }
    } catch (error) {
      console.error("Failed to load friends:", error);
      setLoadError("Не удалось загрузить друзей: нет соединения с сервером.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFriendId || !token) return;

    try {
      const res = await fetchApi("/api/friends/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: toBearerToken(token),
        },
        body: JSON.stringify({ friend_id: parseInt(newFriendId) }),
      });

      if (res.ok) {
        let relation: string | null = null;
        try {
          const payload = await res.json();
          if (typeof payload?.relation === "string") relation = payload.relation;
        } catch {
          // ignore parse
        }
        if (relation === "incoming_pending") {
          setSearchError("Этот пользователь уже отправил вам заявку. Откройте вкладку 'Заявки'.");
          await loadFriendsAndRequests();
          onStatusChanged?.();
          return;
        }
        setNewFriendId("");
        setSearchError("");
        await loadFriendsAndRequests();
        onStatusChanged?.();
      } else {
        const error = await res.json();
        setSearchError(error.detail || "Ошибка при отправке запроса");
      }
    } catch (error) {
      if (error instanceof Error && /failed to fetch|networkerror/i.test(error.message)) {
        setSearchError("Нет соединения с сервером. Проверь доступность backend (порт 3001).");
      } else {
        setSearchError("Ошибка при отправке запроса");
      }
    }
  };

  const handleRespondToRequest = async (requester_id: number, accept: boolean) => {
    if (!token) return;

    try {
      await fetchApi("/api/friends/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: toBearerToken(token),
        },
        body: JSON.stringify({
          requester_id,
          accept,
        }),
      });
      onStatusChanged?.(); // Notify parent to refresh
      loadFriendsAndRequests();
    } catch (error) {
      console.error("Failed to respond to request:", error);
    }
  };

  const handleRemoveFriend = async (friendId: number) => {
    if (!token) return;

    try {
      await fetchApi(`/api/friends/${friendId}`, {
        method: "DELETE",
        headers: { Authorization: toBearerToken(token) },
      });
      loadFriendsAndRequests();
    } catch (error) {
      console.error("Failed to remove friend:", error);
    }
  };

  const resolveInviteJoinName = async (roomId: string) => {
    if (typeof window === "undefined") return "Игрок";

    const storedName = (window.localStorage.getItem(roomPlayerNameKey(roomId)) || "").trim();
    if (storedName) {
      return storedName.slice(0, 24);
    }

    if (!token) return "Игрок";

    try {
      const profileRes = await fetchApi("/api/auth/me", {
        cache: "no-store",
        headers: { Authorization: toBearerToken(token) },
      });
      if (profileRes.ok) {
        const profilePayload = await profileRes.json();
        const dbName = String(profilePayload?.user?.display_name || "").trim();
        if (dbName) {
          return dbName.slice(0, 24);
        }
      }
    } catch {
      // ignore profile lookup errors, fallback below
    }

    return "Игрок";
  };

  const handleRoomInvitation = async (invite: RoomInvitation, accept: boolean) => {
    if (!token || !invite) return;
    setInviteError("");
    setInviteSuccess("");
    setRespondingInviteId(invite.id);
    try {
      if (accept) {
        const roomCheck = await fetchApi(`/api/rooms/${invite.room_id}`, { cache: "no-store" });
        if (!roomCheck.ok) {
          if (roomCheck.status === 404) {
            setInviteError("Комната удалена. Войти уже нельзя.");
            if (typeof window !== "undefined") {
              window.alert("Комната удалена. Войти уже нельзя.");
            }
            await fetchApi("/api/rooms/invitations/respond", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: toBearerToken(token),
              },
              body: JSON.stringify({ room_id: invite.room_id, accept: false }),
            }).catch(() => null);
            setRoomInvitations((prev) => prev.filter((item) => item.id !== invite.id));
            onStatusChanged?.();
            return;
          }
          throw new Error(`Не удалось проверить комнату (${roomCheck.status})`);
        }
      }

      const response = await fetchApi("/api/rooms/invitations/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: toBearerToken(token),
        },
        body: JSON.stringify({ room_id: invite.room_id, accept }),
      });
      if (!response.ok) {
        throw new Error(`Ошибка ${response.status}`);
      }

      setRoomInvitations((prev) => prev.filter((item) => item.id !== invite.id));
      onStatusChanged?.();
      if (accept) {
        onClose();
        if (typeof window !== "undefined") {
          const roomId = String(invite.room_id || "").toUpperCase().slice(0, 8);
          if (roomId) {
            const effectiveName = await resolveInviteJoinName(roomId);
            window.localStorage.setItem(roomRoleKey(roomId), "player");
            window.localStorage.setItem(roomJoinIntentKey(roomId), String(Date.now()));
            window.localStorage.setItem(roomPlayerNameKey(roomId), effectiveName);
          }
          window.location.assign(`/room/${invite.room_id}`);
        }
      } else {
        setInviteSuccess("Приглашение отклонено.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обработать приглашение";
      setInviteError(message);
    } finally {
      setRespondingInviteId(null);
    }
  };

  const handleInviteFriend = async (friendId: number, friendName: string) => {
    if (!token || !inviteRoomId) return;
    if (!canInviteToRoom) {
      setInviteError(
        inviteDisabledReason || "В этой комнате приглашать друзей может только ведущий."
      );
      return;
    }

    setInviteError("");
    setInviteSuccess("");
    setInvitingFriendId(friendId);
    try {
      const response = await fetchApi("/api/rooms/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: toBearerToken(token),
        },
        body: JSON.stringify({
          friend_id: friendId,
          room_id: inviteRoomId,
        }),
      });

      if (!response.ok) {
        let message = `Ошибка ${response.status}`;
        try {
          const payload = await response.json();
          if (typeof payload?.detail === "string" && payload.detail.trim()) {
            message = payload.detail;
          }
        } catch {
          // ignore parse error
        }
        throw new Error(message);
      }

      const payload = await response.json().catch(() => ({}));
      const status = String(payload?.status || "");
      setInvitedFriendIds((prev) => new Set(prev).add(friendId));
      if (status === "pending_host_approval") {
        setInviteSuccess(`Запрос на приглашение ${friendName} отправлен ведущему.`);
      } else {
        setInviteSuccess(`Приглашение для ${friendName} отправлено.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить приглашение";
      const resolvedMessage =
        /failed to fetch|networkerror/i.test(message)
          ? "Нет соединения с сервером. Проверь доступность backend (порт 3001)."
          : message;
      setInviteError(resolvedMessage);
    } finally {
      setInvitingFriendId(null);
    }
  };

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    return () => {
      window.document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const reload = () => {
      void loadFriendsAndRequests();
    };
    window.addEventListener("qb:friend-request-received", reload as EventListener);
    window.addEventListener("qb:friend-request-resolved", reload as EventListener);
    return () => {
      window.removeEventListener("qb:friend-request-received", reload as EventListener);
      window.removeEventListener("qb:friend-request-resolved", reload as EventListener);
    };
  }, [isOpen, token]);

  if (!isOpen || !portalRoot) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        .friends-id-input::-webkit-outer-spin-button,
        .friends-id-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .friends-id-input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
      <section
        className="flex h-[min(92vh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-cyan-200/15 bg-[linear-gradient(180deg,rgba(8,17,34,0.98),rgba(3,8,20,0.96))] text-white shadow-2xl shadow-cyan-950/30 sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
          <h2 className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
            <Users className="h-5 w-5 text-cyan-300 sm:h-6 sm:w-6" /> Друзья
          </h2>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-white/5 p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 [scrollbar-width:thin] [scrollbar-color:rgba(56,189,248,0.75)_rgba(255,255,255,0.12)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gradient-to-b [&::-webkit-scrollbar-thumb]:from-cyan-400/90 [&::-webkit-scrollbar-thumb]:via-sky-500/90 [&::-webkit-scrollbar-thumb]:to-indigo-500/90 sm:px-5">
          {/* Tabs */}
          <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setTab("friends")}
            className={`relative min-w-0 rounded-xl px-2 py-2 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${
              tab === "friends"
                ? "bg-cyan-500/80 text-white border border-cyan-300/50"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            <span className="block truncate">Друзья ({friends.length})</span>
          </button>
          <button
            onClick={() => setTab("requests")}
            className={`relative min-w-0 rounded-xl px-2 py-2 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${
              tab === "requests"
                ? "bg-cyan-500/80 text-white border border-cyan-300/50"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            <span className="block truncate">Заявки</span>
            {friendRequests.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white animate-pulse">
                {friendRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("invites")}
            className={`relative min-w-0 rounded-xl px-2 py-2 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${
              tab === "invites"
                ? "bg-cyan-500/80 text-white border border-cyan-300/50"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            <span className="block truncate">Инвайты</span>
            {roomInvitations.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white animate-pulse">
                {roomInvitations.length}
              </span>
            )}
          </button>
          </div>

          {loading ? (
            <div className="text-white text-center py-8">Загрузка...</div>
          ) : tab === "friends" ? (
            <div className="space-y-4">
              {/* Add Friend Form */}
              <form onSubmit={handleAddFriend} className="rounded-2xl border border-white/10 bg-white/8 p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="ID друга"
                  value={newFriendId}
                  onChange={(e) => setNewFriendId(e.target.value.replace(/\D/g, ""))}
                  className="friends-id-input min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-white placeholder-white/45 focus:outline-none focus:border-cyan-300/70"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-white font-semibold transition-colors hover:bg-cyan-600 sm:min-w-[132px]"
                >
                  <UserPlus className="w-4 h-4" />
                  Добавить
                </button>
              </div>
              {searchError && (
                <p className="text-red-400 text-sm mt-2">{searchError}</p>
              )}
              {loadError && (
                <p className="text-red-400 text-sm mt-2">{loadError}</p>
              )}
              {inviteError && (
                <p className="text-red-400 text-sm mt-2">{inviteError}</p>
              )}
              {inviteSuccess && (
                <p className="text-emerald-300 text-sm mt-2">{inviteSuccess}</p>
              )}
            </form>

              {/* Friends List */}
              {friends.length === 0 ? (
                <p className="text-white/60 text-center py-8">У вас еще нет друзей</p>
              ) : (
                friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="rounded-2xl border border-white/10 bg-white/8 p-3 transition-colors hover:bg-white/12 sm:p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3 flex-1">
                      {friend.avatar_url && (
                        <img
                          src={friend.avatar_url}
                          alt={friend.display_name}
                          className="h-10 w-10 rounded-full"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-white font-semibold">
                          {friend.display_name}
                        </p>
                        <p className="text-white/50 text-sm">ID: {friend.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {inviteRoomId ? (
                        <button
                          type="button"
                          onClick={() => handleInviteFriend(friend.id, friend.display_name)}
                          disabled={
                            invitingFriendId === friend.id ||
                            invitedFriendIds.has(friend.id) ||
                            !canInviteToRoom
                          }
                          title={
                            !canInviteToRoom
                              ? inviteDisabledReason ||
                                "В этой комнате приглашать друзей может только ведущий."
                              : invitedFriendIds.has(friend.id)
                              ? "Приглашение отправлено"
                              : "Позвать в комнату"
                          }
                          className="inline-flex items-center gap-1 rounded-xl border border-cyan-300/40 bg-cyan-500/20 px-3 py-2 text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {invitingFriendId === friend.id ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : invitedFriendIds.has(friend.id) ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          <span className="hidden sm:inline">
                            {invitedFriendIds.has(friend.id) ? "Отправлено" : "Позвать"}
                          </span>
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleRemoveFriend(friend.id)}
                        className="rounded-xl p-2 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                        title="Удалить из друзей"
                        aria-label="Удалить из друзей"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : tab === "requests" ? (
            <div className="space-y-4">
              {loadError && (
                <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {loadError}
                </p>
              )}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Входящие</p>
                {friendRequests.length === 0 ? (
                  <p className="text-white/60 text-sm">Нет новых заявок</p>
                ) : (
                  friendRequests.map((req) => (
                    <div
                      key={req.id}
                      className="mb-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3 last:mb-0 sm:p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3 flex-1">
                        {req.avatar_url && (
                          <img
                            src={req.avatar_url}
                            alt={req.display_name}
                            className="h-10 w-10 rounded-full"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-white font-semibold">
                            {req.display_name}
                          </p>
                          <p className="text-white/50 text-sm">
                            {req.created_at
                              ? new Date(req.created_at).toLocaleDateString("ru-RU")
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() =>
                            handleRespondToRequest(req.requester_id, true)
                          }
                          className="flex items-center gap-2 rounded-xl bg-green-500 px-3 py-2 text-white font-semibold transition-colors hover:bg-green-600"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            handleRespondToRequest(req.requester_id, false)
                          }
                          className="flex items-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-white font-semibold transition-colors hover:bg-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Исходящие</p>
                {outgoingRequests.length === 0 ? (
                  <p className="text-white/60 text-sm">Нет отправленных заявок</p>
                ) : (
                  outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="mb-3 rounded-2xl border border-white/15 bg-white/8 p-3 last:mb-0 sm:p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3 flex-1">
                        {req.avatar_url && (
                          <img
                            src={req.avatar_url}
                            alt={req.display_name || `ID ${req.friend_id}`}
                            className="h-10 w-10 rounded-full"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-white font-semibold">
                            {req.display_name || `Пользователь #${req.friend_id}`}
                          </p>
                          <p className="text-white/50 text-sm">
                            {req.created_at
                              ? `Отправлено ${new Date(req.created_at).toLocaleDateString("ru-RU")}`
                              : "Ожидает ответа"}
                          </p>
                        </div>
                      </div>
                      <span className="self-end rounded-xl border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white/75 sm:self-auto">
                        Ожидает
                      </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {inviteError && (
                <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {inviteError}
                </p>
              )}
              {inviteSuccess && (
                <p className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                  {inviteSuccess}
                </p>
              )}
              {roomInvitations.length === 0 ? (
                <p className="text-white/60 text-sm">Нет приглашений в комнаты</p>
              ) : (
                roomInvitations.map((invite) => (
                  <div
                    key={invite.id}
                    className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-3 sm:p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3 flex-1">
                      {invite.inviter_avatar ? (
                        <img
                          src={invite.inviter_avatar}
                          alt={invite.inviter_name}
                          className="h-10 w-10 rounded-full"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="text-white font-semibold truncate">
                          {invite.inviter_name}
                        </p>
                        <p className="text-white/70 text-sm">
                          Позвал в {modeLabel(invite.game_mode || "classic")}
                        </p>
                        <p className="text-white/50 text-xs">
                          Комната: {invite.room_id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void handleRoomInvitation(invite, false);
                        }}
                        disabled={respondingInviteId === invite.id}
                        className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/20 disabled:opacity-60"
                      >
                        Нет
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleRoomInvitation(invite, true);
                        }}
                        disabled={respondingInviteId === invite.id}
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {respondingInviteId === invite.id ? <Loader className="h-4 w-4 animate-spin" /> : null}
                        Зайти
                      </button>
                    </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </section>
    </div>,
    portalRoot
  );
}
