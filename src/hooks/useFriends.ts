"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi, toBearerToken } from "@/shared/api/base";

/**
 * Хук для управления друзьями и заявками
 * @param token - Bearer токен авторизации
 * @returns Объект с данными и методами
 */
export function useFriends(token: string | null) {
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetchApi("/api/friends", {
        headers: { Authorization: toBearerToken(token) },
      });
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
      } else {
        setError("Ошибка при загрузке друзей");
      }
    } catch (err) {
      setError("Ошибка при загрузке друзей");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadRequests = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetchApi("/api/friends/requests", {
        headers: { Authorization: toBearerToken(token) },
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error("Failed to load requests:", err);
    }
  }, [token]);

  const sendFriendRequest = useCallback(
    async (friendId: number) => {
      if (!token) return;

      try {
        const res = await fetchApi("/api/friends/request", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: toBearerToken(token),
          },
          body: JSON.stringify({ friend_id: friendId }),
        });
        if (res.ok) {
          return true;
        }
        return false;
      } catch (err) {
        console.error("Failed to send friend request:", err);
        return false;
      }
    },
    [token]
  );

  const respondToRequest = useCallback(
    async (requesterId: number, accept: boolean) => {
      if (!token) return;

      try {
        const res = await fetchApi("/api/friends/respond", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: toBearerToken(token),
          },
          body: JSON.stringify({ requester_id: requesterId, accept }),
        });
        if (res.ok) {
          await loadRequests();
          if (accept) {
            await loadFriends();
          }
          return true;
        }
        return false;
      } catch (err) {
        console.error("Failed to respond to request:", err);
        return false;
      }
    },
    [token, loadRequests, loadFriends]
  );

  const removeFriend = useCallback(
    async (friendId: number) => {
      if (!token) return;

      try {
        const res = await fetchApi(`/api/friends/${friendId}`, {
          method: "DELETE",
          headers: { Authorization: toBearerToken(token) },
        });
        if (res.ok) {
          await loadFriends();
          return true;
        }
        return false;
      } catch (err) {
        console.error("Failed to remove friend:", err);
        return false;
      }
    },
    [token, loadFriends]
  );

  // Initial load
  useEffect(() => {
    if (token) {
      loadFriends();
      loadRequests();
    }
  }, [token, loadFriends, loadRequests]);

  // Poll for new requests every 30 seconds
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(loadRequests, 30000);
    return () => clearInterval(interval);
  }, [token, loadRequests]);

  return {
    friends,
    requests,
    loading,
    error,
    loadFriends,
    loadRequests,
    sendFriendRequest,
    respondToRequest,
    removeFriend,
  };
}

/**
 * Хук для управления приглашениями в комнаты
 * @param token - Bearer токен авторизации
 * @returns Объект с данными и методами
 */
export function useRoomInvitations(token: string | null) {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadInvitations = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    try {
      const res = await fetchApi("/api/rooms/invitations", {
        headers: { Authorization: toBearerToken(token) },
      });
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error("Failed to load invitations:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const respondToInvitation = useCallback(
    async (roomId: string, accept: boolean) => {
      if (!token) return;

      try {
        const res = await fetchApi("/api/rooms/invitations/respond", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: toBearerToken(token),
          },
          body: JSON.stringify({ room_id: roomId, accept }),
        });
        if (res.ok) {
          await loadInvitations();
          return true;
        }
        return false;
      } catch (err) {
        console.error("Failed to respond to invitation:", err);
        return false;
      }
    },
    [token, loadInvitations]
  );

  const inviteFriend = useCallback(
    async (friendId: number, roomId: string) => {
      if (!token) return;

      try {
        const res = await fetchApi("/api/rooms/invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: toBearerToken(token),
          },
          body: JSON.stringify({ friend_id: friendId, room_id: roomId }),
        });
        return res.ok;
      } catch (err) {
        console.error("Failed to invite friend:", err);
        return false;
      }
    },
    [token]
  );

  useEffect(() => {
    if (token) {
      loadInvitations();
    }
  }, [token, loadInvitations]);

  return {
    invitations,
    loading,
    loadInvitations,
    respondToInvitation,
    inviteFriend,
  };
}

/**
 * Хук для получения рейтинга друзей
 * @param token - Bearer токен авторизации
 * @param limit - Максимальное количество записей (по умолчанию 50)
 * @returns Объект с данными и методами
 */
export function useFriendsLeaderboard(
  token: string | null,
  limit: number = 50
) {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    try {
      const res = await fetchApi(
        `/api/leaderboard/friends?limit=${Math.min(Math.max(limit, 1), 100)}`,
        {
          headers: { Authorization: toBearerToken(token) },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
      }
    } catch (err) {
      console.error("Failed to load leaderboard:", err);
    } finally {
      setLoading(false);
    }
  }, [token, limit]);

  useEffect(() => {
    if (token) {
      loadLeaderboard();
    }
  }, [token, loadLeaderboard]);

  return {
    leaderboard,
    loading,
    loadLeaderboard,
  };
}

/**
 * Хук для управления WebSocket приглашениями
 * @param ws - WebSocket соединение
 * @param onInvitationRequest - Callback при получении запроса приглашения
 * @param onInvitationResponse - Callback при получении ответа на приглашение
 */
export function useWebSocketInvitations(
  ws: any,
  onInvitationRequest?: (data: any) => void,
  onInvitationResponse?: (data: any) => void
) {
  useEffect(() => {
    if (!ws) return;

    const handleRequest = (data: any) => {
      console.log("Received invitation request:", data);
      onInvitationRequest?.(data);
    };

    const handleResponse = (data: any) => {
      console.log("Received invitation response:", data);
      onInvitationResponse?.(data);
    };

    ws.on("room-invitation-request", handleRequest);
    ws.on("room-invitation-response", handleResponse);

    return () => {
      ws.off("room-invitation-request", handleRequest);
      ws.off("room-invitation-response", handleResponse);
    };
  }, [ws, onInvitationRequest, onInvitationResponse]);

  const sendInvitation = useCallback(
    (friendId: number) => {
      if (!ws) return false;

      try {
        ws.send(
          JSON.stringify({
            type: "invite-friend-to-room",
            friendId,
          })
        );
        return true;
      } catch (err) {
        console.error("Failed to send invitation:", err);
        return false;
      }
    },
    [ws]
  );

  return { sendInvitation };
}

/**
 * Хук для проверки новых заявок в друзья
 * @param token - Bearer токен авторизации
 * @param interval - Интервал проверки в миллисекундах (по умолчанию 30000)
 * @returns Количество новых заявок
 */
export function useNewFriendRequestsCount(
  token: string | null,
  interval: number = 30000
) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!token) return;

    const checkRequests = async () => {
      try {
        const res = await fetchApi("/api/friends/requests", {
          headers: { Authorization: toBearerToken(token) },
        });
        if (res.ok) {
          const data = await res.json();
          setCount((data.requests || []).length);
        }
      } catch (err) {
        console.error("Failed to check requests:", err);
      }
    };

    checkRequests();
    const timerId = setInterval(checkRequests, interval);

    return () => clearInterval(timerId);
  }, [token, interval]);

  return count;
}
