import { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";

import {
  MAX_PLAYERS,
  clampQuestionCount,
  randomId,
  rooms,
  runtimeStore,
  sanitizeRoomId,
  sendSafe,
} from "./core";
import {
  clearRoomTimers,
  createRoom,
  finalizeQuestion,
  nextTeam,
  resetGame,
  startGame,
  teamCounts,
} from "./game";
import { broadcastState } from "./state";
import type { ExtServer, ExtWebSocket, Player, Team } from "./types";

const bindUpgradeHandler = (server: ExtServer, wss: WebSocketServer) => {
  if (runtimeStore.upgradeBound) return;
  server.on?.("upgrade", (req, socket, head) => {
    if (
      !req ||
      typeof req !== "object" ||
      !("url" in req) ||
      !("headers" in req) ||
      !socket ||
      !head
    ) {
      return;
    }
    if (!Buffer.isBuffer(head)) return;
    const reqObj = req as IncomingMessage;
    const host = reqObj.headers?.host || "localhost";
    const url = new URL(reqObj.url || "", `http://${host}`);
    if (url.pathname !== "/api/ws") return;

    wss.handleUpgrade(reqObj, socket as Duplex, head, (ws) => {
      (ws as ExtWebSocket).query = url.searchParams;
      wss.emit("connection", ws, req);
    });
  });
  runtimeStore.upgradeBound = true;
};

export const setupWebSocketServer = (server: ExtServer) => {
  if (runtimeStore.wss) {
    bindUpgradeHandler(server, runtimeStore.wss);
    return runtimeStore.wss;
  }
  if (server.wss) {
    runtimeStore.wss = server.wss;
    bindUpgradeHandler(server, server.wss);
    return server.wss;
  }

  const wss = new WebSocketServer({ noServer: true });
  runtimeStore.wss = wss;
  bindUpgradeHandler(server, wss);

  wss.on("connection", (socket: ExtWebSocket) => {
    const params: URLSearchParams = socket.query || new URLSearchParams();
    const rawRoomId = params.get("roomId") || "";
    const roomId = sanitizeRoomId(rawRoomId);
    const name = (params.get("name") || "Игрок").trim().slice(0, 24) || "Игрок";
    const topic = (params.get("topic") || "Общая тема").trim().slice(0, 80) || "Общая тема";
    const questionCount = clampQuestionCount(Number(params.get("count")));

    if (!roomId) {
      socket.close(1008, "Room id required");
      return;
    }

    const peerId = randomId();
    socket.peerId = peerId;
    socket.roomId = roomId;

    let room = rooms.get(roomId);
    if (!room) {
      room = createRoom(roomId, topic, questionCount, peerId);
      rooms.set(roomId, room);
    }

    if (room.players.size >= MAX_PLAYERS) {
      sendSafe(socket, {
        type: "error",
        code: "ROOM_FULL",
        message: "Комната заполнена. Максимум 20 участников.",
      });
      socket.close(1008, "Room full");
      return;
    }

    const isHost = room.players.size === 0;
    if (room.players.size === 0) {
      room.hostPeerId = peerId;
    }

    const counts = teamCounts(room);
    const team: Team | null = isHost ? null : counts.a <= counts.b ? "A" : "B";

    room.players.set(peerId, {
      peerId,
      name,
      team,
      isHost,
      socket,
    });

    console.log(
      `[quiz-ws ${runtimeStore.instanceId}] join room=${roomId} peer=${peerId} name=${name} host=${isHost} players=${room.players.size}`
    );

    sendSafe(socket, {
      type: "connected",
      peerId,
      roomId,
      isHost,
      assignedTeam: team,
    });

    broadcastState(room);

    const handleClose = () => {
      const current = rooms.get(roomId);
      if (!current) return;

      current.players.delete(peerId);
      if (current.players.size === 0) {
        clearRoomTimers(current);
        rooms.delete(roomId);
        console.log(`[quiz-ws ${runtimeStore.instanceId}] room cleared room=${roomId}`);
        return;
      }

      if (current.hostPeerId === peerId) {
        const first = current.players.values().next().value as Player | undefined;
        if (first) {
          current.hostPeerId = first.peerId;
          first.isHost = true;
          first.team = null;
        }
      }

      let switchTeam: Team = "A";
      current.players.forEach((player) => {
        if (player.isHost) return;
        player.team = switchTeam;
        switchTeam = nextTeam(switchTeam);
      });

      broadcastState(current);
      console.log(
        `[quiz-ws ${runtimeStore.instanceId}] leave room=${roomId} peer=${peerId} players=${current.players.size}`
      );
    };

    socket.on("message", (raw) => {
      const current = rooms.get(roomId);
      const player = current?.players.get(peerId);
      if (!current || !player) return;

      let data: Record<string, unknown>;
      try {
        const text =
          typeof raw === "string"
            ? raw
            : raw instanceof Buffer
            ? raw.toString("utf-8")
            : "";
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== "object") {
          return;
        }
        data = parsed as Record<string, unknown>;
      } catch {
        return;
      }

      if (data?.type === "start-game") {
        if (!player.isHost || current.phase !== "lobby") return;
        startGame(current);
        return;
      }

      if (data?.type === "submit-answer") {
        if (current.phase !== "question") return;
        if (player.team !== current.activeTeam) return;
        if (current.activeAnswer) return;

        const answerIndex = Number(data.answerIndex);
        if (!Number.isInteger(answerIndex)) return;

        current.activeAnswer = {
          selectedIndex: answerIndex,
          byPeerId: peerId,
          byName: player.name,
        };
        finalizeQuestion(current);
        return;
      }

      if (data?.type === "new-game") {
        if (!player.isHost) return;
        resetGame(current);
        return;
      }

      if (data?.type === "send-chat") {
        const text = typeof data.text === "string" ? data.text.trim().slice(0, 280) : "";
        if (!text) return;
        if (
          current.phase === "question" &&
          (player.isHost || !player.team || player.team !== current.activeTeam)
        ) {
          return;
        }

        const visibility = current.phase === "question" ? current.activeTeam : "all";
        current.chat.push({
          id: randomId(),
          from: peerId,
          name: player.name,
          text,
          timestamp: Date.now(),
          visibility,
        });
        if (current.chat.length > 100) {
          current.chat = current.chat.slice(-100);
        }
        broadcastState(current);
      }
    });

    socket.on("close", () => handleClose());
    socket.on("error", () => handleClose());
  });

  server.wss = wss;
  runtimeStore.wss = wss;
  return wss;
};
