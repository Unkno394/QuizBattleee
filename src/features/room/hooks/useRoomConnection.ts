"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  JOIN_PREFILL_PIN_STORAGE_KEY,
  ROOM_JOIN_INTENT_TTL_MS,
  roomHostTokenKey,
  roomJoinIntentKey,
  roomPasswordKey,
  roomPlayerNameKey,
  roomPlayerTokenKey,
  roomRoleKey,
} from "../constants";
import type { RoomState, ServerMessage, Team } from "../types";
import { getOrCreateGuestClientId, shouldUseExplicitEndpoint, uniq } from "../utils";

type NotifyFn = (
  message: string,
  type?: "success" | "error" | "warning" | "info",
  duration?: number
) => void;

type UseRoomConnectionParams = {
  pin: string;
  onRequireJoin: () => void;
  notify: NotifyFn;
  onFriendRequestReceived?: (requesterId: number) => void;
  onFriendRequestResolved?: (requesterId: number, accepted: boolean) => void;
};

export function useRoomConnection({
  pin,
  onRequireJoin,
  notify,
  onFriendRequestReceived,
  onFriendRequestResolved,
}: UseRoomConnectionParams) {
  const socketRef = useRef<WebSocket | null>(null);
  const connectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const notifyRef = useRef<NotifyFn>(notify);

  const [peerId, setPeerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  const [assignedTeam, setAssignedTeam] = useState<Team | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [status, setStatus] = useState("Подключение...");
  const [error, setError] = useState<string | null>(null);
  const [isSocketReady, setIsSocketReady] = useState(false);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const send = useCallback((payload: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const attemptId = connectAttemptRef.current + 1;
    connectAttemptRef.current = attemptId;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (isCancelled || reconnectTimerRef.current !== null || !shouldReconnectRef.current) {
        return;
      }

      reconnectAttemptsRef.current += 1;
      const exponent = Math.min(reconnectAttemptsRef.current, 5);
      const delayMs = Math.min(10_000, 500 * 2 ** exponent);
      setStatus(`Переподключение через ${Math.ceil(delayMs / 1000)} сек...`);
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        if (isCancelled || !shouldReconnectRef.current) return;
        void connect();
      }, delayMs);
    };

    const connect = async () => {
      try {
        clearReconnectTimer();
        if (socketRef.current) {
          try {
            socketRef.current.close();
          } catch {
            // ignore
          }
          socketRef.current = null;
        }

        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const sameOriginEndpoint = `${protocol}://${window.location.host}/api/ws`;
        const standaloneEndpoint = `${protocol}://${window.location.hostname}:3001/api/ws`;
        const explicitUrl = (process.env.NEXT_PUBLIC_WS_URL || "").trim();
        const safeExplicitEndpoint = shouldUseExplicitEndpoint(
          explicitUrl,
          window.location.hostname
        )
          ? explicitUrl
          : "";
        const endpoints = safeExplicitEndpoint
          ? uniq([safeExplicitEndpoint, sameOriginEndpoint, standaloneEndpoint])
          : uniq([sameOriginEndpoint, standaloneEndpoint]);

        const storedNameRaw = window.localStorage.getItem(roomPlayerNameKey(pin));
        const storedName = (storedNameRaw || "").trim();
        const storedRole = window.localStorage.getItem(roomRoleKey(pin)) || "player";
        const storedHostToken = (window.localStorage.getItem(roomHostTokenKey(pin)) || "").trim();
        const storedPlayerToken = (window.localStorage.getItem(roomPlayerTokenKey(pin)) || "").trim();
        const storedRoomPassword = (window.localStorage.getItem(roomPasswordKey(pin)) || "").trim();
        const joinIntentRaw = window.localStorage.getItem(roomJoinIntentKey(pin));
        const joinIntentTs = Number(joinIntentRaw || 0);
        const hasFreshJoinIntent =
          Number.isFinite(joinIntentTs) &&
          joinIntentTs > 0 &&
          Date.now() - joinIntentTs <= ROOM_JOIN_INTENT_TTL_MS;
        const canEnterAsHost = storedRole === "host" && !!storedHostToken;
        const canEnterAsPlayerByToken = storedRole === "player" && !!storedPlayerToken;
        const canEnterAsPlayerByIntent = storedRole === "player" && hasFreshJoinIntent;

        if (!(canEnterAsHost || canEnterAsPlayerByToken || canEnterAsPlayerByIntent)) {
          window.localStorage.removeItem(roomJoinIntentKey(pin));
          window.localStorage.setItem(JOIN_PREFILL_PIN_STORAGE_KEY, pin);
          onRequireJoin();
          return;
        }

        const effectiveName = (storedName || "Игрок").slice(0, 24);
        const wantsHost = canEnterAsHost;
        if (effectiveName) {
          window.localStorage.setItem(roomPlayerNameKey(pin), effectiveName);
        }

        const query = new URLSearchParams({ roomId: pin });
        const guestClientId = getOrCreateGuestClientId();
        const rawToken = window.localStorage.getItem("access_token");
        const token = (rawToken || "").trim();
        const joinPayload: Record<string, string> = {
          type: "join",
          roomId: pin,
          name: effectiveName || "Игрок",
        };
        if (guestClientId) {
          joinPayload.clientId = guestClientId;
        }
        if (token && token !== "undefined" && token !== "null") {
          joinPayload.token = token;
        }
        if (wantsHost) {
          joinPayload.hostToken = storedHostToken;
        }
        if (storedPlayerToken) {
          joinPayload.playerToken = storedPlayerToken;
        }
        if (storedRoomPassword) {
          joinPayload.roomPassword = storedRoomPassword;
        }

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
            }, 8000);

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
          scheduleReconnect();
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
        reconnectAttemptsRef.current = 0;
        try {
          ws.send(JSON.stringify(joinPayload));
        } catch {
          setIsSocketReady(false);
          setStatus("Ошибка соединения");
          setError("Не удалось отправить join-запрос");
          scheduleReconnect();
          return;
        }

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
            setIsSpectator(!!message.isSpectator);
            setAssignedTeam(message.assignedTeam);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(roomRoleKey(pin), message.isHost ? "host" : "player");
              if (message.playerToken) {
                window.localStorage.setItem(roomPlayerTokenKey(pin), message.playerToken);
                window.localStorage.removeItem(roomJoinIntentKey(pin));
              }
              if (message.playerToken || message.isHost) {
                window.localStorage.removeItem(roomPasswordKey(pin));
              }
            }
            return;
          }

          if (message.type === "state-sync") {
            setRoomState(message.room);
            setServerOffset(message.serverTime - Date.now());
            setStatus("Синхронизировано");
            return;
          }

          if (message.type === "moderation-notice") {
            const alertType =
              message.level === "error"
                ? "error"
                : message.level === "warning"
                ? "warning"
                : "info";
            notifyRef.current(message.message, alertType, message.disqualified ? 7000 : 5600);
            return;
          }

          if (message.type === "error") {
            setError(message.message);
            if (message.code === "AUTH_TOKEN_INVALID" && typeof window !== "undefined") {
              window.localStorage.removeItem("access_token");
            }
            if (
              (message.code === "ROOM_PASSWORD_REQUIRED" || message.code === "ROOM_PASSWORD_INVALID") &&
              typeof window !== "undefined"
            ) {
              window.localStorage.removeItem(roomPasswordKey(pin));
            }
            if (
              message.code === "ROOM_NOT_FOUND" ||
              message.code === "HOST_TOKEN_INVALID" ||
              message.code === "AUTH_TOKEN_INVALID" ||
              message.code === "ACCOUNT_ALREADY_IN_ROOM" ||
              message.code === "ROOM_PASSWORD_REQUIRED" ||
              message.code === "ROOM_PASSWORD_INVALID"
            ) {
              shouldReconnectRef.current = false;
              clearReconnectTimer();
            }
            return;
          }

          // new friend events
          if (message.type === "friend_request_received") {
            onFriendRequestReceived?.(message.requester_id);
            return;
          }

          if (message.type === "friend_request_resolved") {
            onFriendRequestResolved?.(
              message.requester_id,
              message.status === "accepted"
            );
            return;
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
            socketRef.current = null;
            scheduleReconnect();
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
            scheduleReconnect();
          }
        };
      } catch {
        if (!isCancelled) {
          setIsSocketReady(false);
          setStatus("Ошибка соединения");
          setError("Не удалось инициализировать WebSocket сервер");
          scheduleReconnect();
        }
      }
    };

    if (pin) {
      shouldReconnectRef.current = true;
      connect();
    }

    return () => {
      isCancelled = true;
      shouldReconnectRef.current = false;
      clearReconnectTimer();
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
  }, [onRequireJoin, pin]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        try {
          socketRef.current.send(JSON.stringify({ type: "ping" }));
        } catch {
          // ignore send race, reconnect handler will recover on close/error
        }
      }
    }, 15_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return {
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
  };
}
