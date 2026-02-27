import type { ChatMessage, Player, Room } from "./types";
import { sendSafe } from "./core";

export const canPlayerSeeMessage = (player: Player, room: Room, message: ChatMessage) => {
  if (player.isHost) return true;

  const visibility = message.visibility ?? "all";

  if (room.phase === "question") {
    if (player.team !== room.activeTeam) return false;
    return visibility === "all" || visibility === room.activeTeam;
  }

  if (visibility === "all") return true;
  return player.team === visibility;
};

export const buildState = (room: Room, viewer: Player) => ({
  type: "state-sync",
  serverTime: Date.now(),
  room: {
    roomId: room.roomId,
    topic: room.topic,
    questionCount: room.questionCount,
    phase: room.phase,
    currentQuestionIndex: room.currentQuestionIndex,
    activeTeam: room.activeTeam,
    questionEndsAt: room.questionEndsAt,
    scores: room.scores,
    players: Array.from(room.players.values()).map((player) => ({
      peerId: player.peerId,
      name: player.name,
      team: player.team,
      isHost: player.isHost,
    })),
    currentQuestion:
      room.currentQuestionIndex >= 0 ? room.questions[room.currentQuestionIndex] : null,
    lastReveal: room.lastReveal,
    chat: room.chat
      .filter((message) => canPlayerSeeMessage(viewer, room, message))
      .slice(-100)
      .map((message) => ({
        id: message.id,
        from: message.from,
        name: message.name,
        text: message.text,
        timestamp: message.timestamp,
      })),
  },
});

export const broadcastState = (room: Room) => {
  room.players.forEach((player) => {
    const payload = buildState(room, player);
    sendSafe(player.socket, payload);
  });
};
