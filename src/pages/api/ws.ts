import type { NextApiRequest, NextApiResponse } from "next";

import { rooms, runtimeStore } from "../../server/ws/core";
import { setupWebSocketServer } from "../../server/ws/server";
import type { ExtServer } from "../../server/ws/types";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const server = (res.socket as { server?: ExtServer } | undefined)?.server as ExtServer;
  setupWebSocketServer(server);
  const roomsInfo = Array.from(rooms.entries()).map(([roomId, room]) => ({
    roomId,
    players: room.players.size,
    hostPeerId: room.hostPeerId,
    phase: room.phase,
  }));
  res.setHeader("Content-Type", "application/json");
  res.status(200).end(
    JSON.stringify({
      status: "ok",
      rooms: rooms.size,
      instanceId: runtimeStore.instanceId,
      upgradeBound: runtimeStore.upgradeBound,
      roomsInfo,
    })
  );
}
