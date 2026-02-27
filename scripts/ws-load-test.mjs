#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import WebSocket from "ws";

const DEFAULTS = {
  clients: 20,
  durationSec: 60,
  connectTimeoutMs: 8000,
  spawnDelayMs: 20,
  questionCount: 5,
  topic: "WS load test",
  difficulty: "medium",
  reconnectBurst: true,
  reconnectMinPct: 20,
  reconnectMaxPct: 30,
  reconnectBurstDelayMs: 8000,
  reconnectJitterMs: 1500,
  reconnectPauseMs: 150,
};

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const [rawKey, rawInlineValue] = item.slice(2).split("=", 2);
    const next = argv[index + 1];
    const hasSeparateValue = rawInlineValue === undefined && next && !next.startsWith("--");
    const value = rawInlineValue ?? (hasSeparateValue ? next : "true");
    if (hasSeparateValue) index += 1;
    options[rawKey] = value;
  }
  return options;
}

function asInt(rawValue, fallback) {
  const value = Number.parseInt(String(rawValue ?? ""), 10);
  if (Number.isNaN(value)) return fallback;
  return value;
}

function asBool(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null) return fallback;
  const value = String(rawValue).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeApiBase(rawValue) {
  const value = String(rawValue || "").trim().replace(/\/$/, "");
  if (!value) return "http://127.0.0.1:3001";
  return value;
}

function normalizeWsBase(rawValue, apiBase) {
  const source = String(rawValue || "").trim() || `${apiBase.replace(/^http/i, "ws")}/api/ws`;
  const parsed = new URL(source);
  if (!parsed.pathname || parsed.pathname === "/") {
    parsed.pathname = "/api/ws";
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const detail =
        (payload && (payload.detail || payload.message)) ||
        `${response.status} ${response.statusText}`;
      throw new Error(`HTTP ${response.status} for ${url}: ${detail}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function createClient(role, index) {
  const id = `${role}-${index}`;
  return {
    id,
    role,
    name: role === "host" ? "LoadHost" : `LoadUser${index}`,
    clientId:
      role === "host" ? null : `load-client-${index}-${crypto.randomBytes(6).toString("hex")}`,
    ws: null,
    connected: false,
    peerId: null,
    playerToken: null,
    connectedAt: 0,
    rawMessages: 0,
    stateSyncCount: 0,
    pongCount: 0,
    maxPlayersSeen: 0,
    phases: [],
    errors: [],
    closeCode: null,
    closeReason: "",
    sendFailures: 0,
    intentionalDisconnects: 0,
    reconnectAttempts: 0,
    reconnectSuccess: 0,
    reconnectFailures: 0,
    joinCount: 0,
    _voteKeys: new Set(),
    _nameKeys: new Set(),
    _answerKeys: new Set(),
  };
}

function trackPhase(client, phase) {
  if (!phase) return;
  const last = client.phases[client.phases.length - 1];
  if (last === phase) return;
  client.phases.push(phase);
}

function sendJson(client, payload) {
  if (!client.ws || client.ws.readyState !== WebSocket.OPEN) return false;
  try {
    client.ws.send(JSON.stringify(payload));
    return true;
  } catch {
    client.sendFailures += 1;
    return false;
  }
}

function chooseVoteCandidate(room, mePeerId, team) {
  const players = Array.isArray(room?.players) ? room.players : [];
  const teamMembers = players.filter((player) => !player.isHost && player.team === team);
  const candidate = teamMembers.find((player) => player.peerId !== mePeerId);
  return candidate?.peerId || null;
}

function randomAnswerIndex(room) {
  const options = Array.isArray(room?.currentQuestion?.options)
    ? room.currentQuestion.options.length
    : 4;
  const length = Math.max(2, options);
  return Math.floor(Math.random() * length);
}

function automateClient(client, room, send, shared) {
  const players = Array.isArray(room?.players) ? room.players : [];
  const me = players.find((player) => player.peerId === client.peerId) || null;
  if (!me) return;

  if (room.phase === "captain-vote") {
    if (me.isHost || !me.team) return;
    const ready = room?.captainVoteReadyTeams?.[me.team] === true;
    if (ready) return;
    if (room?.myCaptainVote) return;

    const voteKey = `${room.phase}:${room.captainVoteEndsAt || 0}:${me.team}`;
    if (client._voteKeys.has(voteKey)) return;
    const candidatePeerId = chooseVoteCandidate(room, me.peerId, me.team);
    if (!candidatePeerId) return;
    if (send({ type: "vote-captain", candidatePeerId })) {
      client._voteKeys.add(voteKey);
      shared.votesSent += 1;
    }
    return;
  }

  if (room.phase === "team-naming") {
    if (!me.isCaptain || !me.team) return;
    const ready = room?.teamNamingReadyTeams?.[me.team] === true;
    if (ready) return;
    const namingKey = `${room.phase}:${room.teamNamingEndsAt || 0}:${me.team}`;
    if (client._nameKeys.has(namingKey)) return;
    if (send({ type: "random-team-name" })) {
      client._nameKeys.add(namingKey);
      shared.teamNamesSent += 1;
    }
    return;
  }

  if (room.phase === "question") {
    if (!me.isCaptain || !me.team || me.team !== room.activeTeam) return;
    const questionId = room?.currentQuestion?.id || String(room.currentQuestionIndex ?? "q");
    const answerKey = `${room.phase}:${questionId}:${room.activeTeam}`;
    if (client._answerKeys.has(answerKey)) return;

    const answerIndex = randomAnswerIndex(room);
    if (send({ type: "submit-answer", answerIndex })) {
      client._answerKeys.add(answerKey);
      shared.answersSent += 1;
    }
  }
}

function sampleReconnectTargets(clients, minPct, maxPct) {
  if (!clients.length) return [];
  const lo = clamp(minPct, 0, 100);
  const hi = clamp(maxPct, lo, 100);
  const pct = lo + Math.random() * (hi - lo);
  const count = Math.max(1, Math.round((clients.length * pct) / 100));
  const pool = [...clients];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    const tmp = pool[index];
    pool[index] = pool[swapWith];
    pool[swapWith] = tmp;
  }
  return pool.slice(0, Math.min(count, pool.length));
}

async function connectClient(client, config) {
  const {
    wsBase,
    roomId,
    hostToken,
    connectTimeoutMs,
    verbose,
    onMessage,
  } = config;

  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(`${wsBase}?roomId=${encodeURIComponent(roomId)}`);
    client.ws = ws;

    const joinPayload = {
      type: "join",
      roomId,
      name: client.name,
    };

    if (client.role === "host") {
      joinPayload.hostToken = hostToken;
    } else if (client.clientId) {
      joinPayload.clientId = client.clientId;
    }
    if (client.playerToken) {
      joinPayload.playerToken = client.playerToken;
    }

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.close();
      reject(new Error(`[${client.id}] connect timeout`));
    }, connectTimeoutMs);

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn(value);
    };

    ws.on("open", () => {
      if (!sendJson(client, joinPayload)) {
        finish(reject, new Error(`[${client.id}] failed to send join payload`));
      }
    });

    ws.on("message", (rawData) => {
      client.rawMessages += 1;
      let message = null;
      try {
        message = JSON.parse(rawData.toString("utf-8"));
      } catch {
        return;
      }
      if (!message || typeof message !== "object") return;

      const send = (payload) => sendJson(client, payload);

      if (message.type === "connected") {
        client.connected = true;
        client.peerId = message.peerId || client.peerId || null;
        client.playerToken = message.playerToken || client.playerToken || null;
        client.connectedAt = Date.now();
        client.joinCount += 1;
        if (typeof onMessage === "function") {
          onMessage(client, message, send);
        }
        finish(resolve, client);
        return;
      }

      if (message.type === "state-sync") {
        client.stateSyncCount += 1;
        const players = Array.isArray(message.room?.players) ? message.room.players.length : 0;
        client.maxPlayersSeen = Math.max(client.maxPlayersSeen, players);
        trackPhase(client, message.room?.phase || "");
      } else if (message.type === "pong") {
        client.pongCount += 1;
      } else if (message.type === "error") {
        const code = message.code || "UNKNOWN";
        const text = message.message || "";
        client.errors.push(`${code}${text ? `:${text}` : ""}`);
        if (verbose) {
          console.log(`[${client.id}] server error: ${code} ${text}`);
        }
        if (!client.connected) {
          finish(reject, new Error(`[${client.id}] rejected: ${code} ${text}`));
          return;
        }
      }

      if (typeof onMessage === "function") {
        onMessage(client, message, send);
      }
    });

    ws.on("close", (code, reasonBuffer) => {
      client.closeCode = code;
      client.closeReason = reasonBuffer?.toString("utf-8") || "";
      if (!client.connected) {
        finish(
          reject,
          new Error(
            `[${client.id}] closed before connected: code=${code} reason=${client.closeReason}`
          )
        );
      }
    });

    ws.on("error", (error) => {
      client.errors.push(`SOCKET_ERROR:${error.message}`);
      if (!client.connected) {
        finish(reject, new Error(`[${client.id}] ws error: ${error.message}`));
      }
    });
  });
}

async function reconnectClient(client, config) {
  client.reconnectAttempts += 1;
  client.intentionalDisconnects += 1;
  if (client.ws && (client.ws.readyState === WebSocket.OPEN || client.ws.readyState === WebSocket.CONNECTING)) {
    try {
      client.ws.close(4001, "burst-reconnect");
    } catch {
      // ignore
    }
  }
  await delay(config.reconnectPauseMs);

  try {
    await connectClient(client, config);
    client.reconnectSuccess += 1;
    return true;
  } catch (error) {
    client.reconnectFailures += 1;
    client.errors.push(`RECONNECT_FAILED:${String(error)}`);
    return false;
  }
}

async function runReconnectBurst(clients, config) {
  if (!config.reconnectBurst) {
    return {
      enabled: false,
      planned: 0,
      selectedIds: [],
      attempted: 0,
      succeeded: 0,
      failed: 0,
      failures: [],
    };
  }

  await delay(config.reconnectBurstDelayMs);
  const selected = sampleReconnectTargets(
    clients,
    config.reconnectMinPct,
    config.reconnectMaxPct
  );

  const result = {
    enabled: true,
    planned: selected.length,
    selectedIds: selected.map((client) => client.id),
    attempted: 0,
    succeeded: 0,
    failed: 0,
    failures: [],
  };

  await Promise.all(
    selected.map(async (client) => {
      if (config.reconnectJitterMs > 0) {
        const jitter = Math.floor(Math.random() * config.reconnectJitterMs);
        await delay(jitter);
      }
      result.attempted += 1;
      const ok = await reconnectClient(client, config);
      if (ok) {
        result.succeeded += 1;
      } else {
        result.failed += 1;
        result.failures.push(client.id);
      }
    })
  );

  return result;
}

function buildStatsDelta(afterStats, beforeStats) {
  if (!afterStats || !beforeStats) return null;
  const output = {};
  const keys = new Set([
    ...Object.keys(beforeStats),
    ...Object.keys(afterStats),
  ]);

  for (const key of keys) {
    const before = Number(beforeStats[key] ?? 0);
    const after = Number(afterStats[key] ?? 0);
    if (Number.isNaN(before) || Number.isNaN(after)) continue;
    output[key] = after - before;
  }
  return output;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apiBase = normalizeApiBase(args.api || process.env.QB_API_BASE);
  const wsBase = normalizeWsBase(args.ws || process.env.QB_WS_URL, apiBase);
  const clients = Math.max(2, asInt(args.clients, DEFAULTS.clients));
  const durationSec = Math.max(10, asInt(args.duration, DEFAULTS.durationSec));
  const connectTimeoutMs = Math.max(
    1000,
    asInt(args["connect-timeout-ms"], DEFAULTS.connectTimeoutMs)
  );
  const spawnDelayMs = Math.max(0, asInt(args["spawn-delay-ms"], DEFAULTS.spawnDelayMs));
  const questionCount = clamp(
    asInt(args["question-count"], DEFAULTS.questionCount),
    5,
    7
  );
  const topic = String(args.topic || DEFAULTS.topic);
  const rawDifficulty = String(args.difficulty || DEFAULTS.difficulty).trim().toLowerCase();
  const difficulty = ["easy", "medium", "hard", "progressive"].includes(rawDifficulty)
    ? rawDifficulty
    : DEFAULTS.difficulty;
  const reconnectBurst = asBool(args["reconnect-burst"], DEFAULTS.reconnectBurst);
  const reconnectMinPct = clamp(
    asInt(args["reconnect-min-pct"], DEFAULTS.reconnectMinPct),
    0,
    100
  );
  const reconnectMaxPct = clamp(
    asInt(args["reconnect-max-pct"], DEFAULTS.reconnectMaxPct),
    reconnectMinPct,
    100
  );
  const reconnectBurstDelayMs = Math.max(
    0,
    asInt(args["reconnect-delay-ms"], DEFAULTS.reconnectBurstDelayMs)
  );
  const reconnectJitterMs = Math.max(
    0,
    asInt(args["reconnect-jitter-ms"], DEFAULTS.reconnectJitterMs)
  );
  const reconnectPauseMs = Math.max(
    0,
    asInt(args["reconnect-pause-ms"], DEFAULTS.reconnectPauseMs)
  );
  const verbose = asBool(args.verbose, false);
  const waitForResults = asBool(args["wait-results"], true);

  console.log(
    `[load-test] api=${apiBase} ws=${wsBase} clients=${clients} duration=${durationSec}s q=${questionCount} difficulty=${difficulty} reconnectBurst=${reconnectBurst}`
  );

  const baselineStatsResponse = await fetchJson(`${apiBase}/api/ws-stats`, {}, 5000).catch(() => null);
  const baselineStats = baselineStatsResponse?.stats || null;

  const createRoomResponse = await fetchJson(
    `${apiBase}/api/rooms/create`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        difficulty,
        questionCount,
      }),
    },
    8000
  );

  const roomId = String(createRoomResponse?.roomId || "").toUpperCase();
  const hostToken = String(createRoomResponse?.hostToken || "");
  if (!roomId || !hostToken) {
    throw new Error("Backend did not return roomId/hostToken");
  }
  console.log(`[load-test] room=${roomId}`);

  const shared = {
    startTimeMs: Date.now(),
    stateSyncEvents: 0,
    votesSent: 0,
    teamNamesSent: 0,
    answersSent: 0,
    phasesSeen: new Set(),
    lastKnownPhase: null,
    resultsReachedAt: 0,
    startAttempts: 0,
    lastStartAttemptAt: 0,
    ensureStart: true,
  };

  const connectedClients = [];
  const failedClients = [];

  const onMessage = (client, message, send) => {
    if (message.type !== "state-sync") return;
    const room = message.room || {};
    shared.stateSyncEvents += 1;
    if (room.phase) {
      shared.lastKnownPhase = room.phase;
      shared.phasesSeen.add(room.phase);
      if (room.phase === "results" && !shared.resultsReachedAt) {
        shared.resultsReachedAt = Date.now();
      }
    }

    if (client.role === "host" && room.phase === "lobby" && shared.ensureStart) {
      const now = Date.now();
      const enoughPlayers = Array.isArray(room.players) && room.players.length >= 2;
      if (enoughPlayers && now - shared.lastStartAttemptAt >= 1000) {
        if (send({ type: "start-game" })) {
          shared.startAttempts += 1;
          shared.lastStartAttemptAt = now;
        }
      }
    } else if (room.phase && room.phase !== "lobby") {
      shared.ensureStart = false;
    }

    automateClient(client, room, send, shared);
  };

  const connectionConfig = {
    wsBase,
    roomId,
    hostToken,
    connectTimeoutMs,
    verbose,
    onMessage,
    reconnectPauseMs,
    reconnectBurst,
    reconnectMinPct,
    reconnectMaxPct,
    reconnectBurstDelayMs,
    reconnectJitterMs,
  };

  const hostClient = createClient("host", 0);
  await connectClient(hostClient, connectionConfig);
  connectedClients.push(hostClient);
  console.log("[load-test] host connected");

  const playerClients = [];
  for (let index = 1; index < clients; index += 1) {
    playerClients.push(createClient("player", index));
  }

  await Promise.all(
    playerClients.map(async (client) => {
      if (spawnDelayMs > 0) {
        await delay(spawnDelayMs);
      }
      try {
        await connectClient(client, connectionConfig);
        connectedClients.push(client);
      } catch (error) {
        failedClients.push({ id: client.id, error: String(error) });
      }
    })
  );

  console.log(
    `[load-test] connected=${connectedClients.length}/${clients} failed=${failedClients.length}`
  );

  if (sendJson(hostClient, { type: "start-game" })) {
    shared.startAttempts += 1;
    shared.lastStartAttemptAt = Date.now();
  }

  for (const client of connectedClients) {
    sendJson(client, { type: "send-chat", text: `load-msg-${client.id}` });
  }

  const pingInterval = setInterval(() => {
    for (const client of connectedClients) {
      sendJson(client, { type: "ping" });
    }
  }, 5000);

  const reconnectBurstPromise = runReconnectBurst(connectedClients, connectionConfig);

  const deadlineMs = Date.now() + durationSec * 1000;
  while (Date.now() < deadlineMs) {
    if (!waitForResults) break;
    if (shared.resultsReachedAt) break;
    await delay(250);
  }

  const reconnectBurstResult = await reconnectBurstPromise;
  clearInterval(pingInterval);

  const wsStatsResponse = await fetchJson(`${apiBase}/api/ws-stats`, {}, 5000).catch((error) => ({
    error: String(error),
  }));
  const health = await fetchJson(`${apiBase}/api/health`, {}, 5000).catch((error) => ({
    error: String(error),
  }));

  for (const client of connectedClients) {
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.close(1000, "load-test-finished");
      } catch {
        // ignore
      }
    }
  }
  await delay(500);

  const wsStats = wsStatsResponse?.stats || null;
  const wsStatsDelta = buildStatsDelta(wsStats, baselineStats);
  const reachedResults = Boolean(shared.resultsReachedAt);
  const durationActualMs = Date.now() - shared.startTimeMs;

  const summary = {
    roomId,
    config: {
      apiBase,
      wsBase,
      clients,
      durationSec,
      connectTimeoutMs,
      spawnDelayMs,
      questionCount,
      reconnectBurst,
      reconnectMinPct,
      reconnectMaxPct,
      reconnectBurstDelayMs,
      reconnectJitterMs,
      reconnectPauseMs,
      waitForResults,
    },
    result: {
      connected: connectedClients.length,
      failed: failedClients.length,
      failedClients,
      reachedResults,
      timedOutWithoutResults: waitForResults && !reachedResults,
      durationActualMs,
      phasesSeen: Array.from(shared.phasesSeen),
      lastKnownPhase: shared.lastKnownPhase,
      automation: {
        startAttempts: shared.startAttempts,
        votesSent: shared.votesSent,
        teamNamesSent: shared.teamNamesSent,
        answersSent: shared.answersSent,
        stateSyncEvents: shared.stateSyncEvents,
      },
      reconnectBurst: reconnectBurstResult,
      connectedClients: connectedClients.map((client) => ({
        id: client.id,
        role: client.role,
        peerId: client.peerId,
        joinCount: client.joinCount,
        reconnectAttempts: client.reconnectAttempts,
        reconnectSuccess: client.reconnectSuccess,
        reconnectFailures: client.reconnectFailures,
        stateSyncCount: client.stateSyncCount,
        maxPlayersSeen: client.maxPlayersSeen,
        pongCount: client.pongCount,
        sendFailures: client.sendFailures,
        errors: client.errors,
        closeCode: client.closeCode,
        phases: client.phases,
      })),
    },
    server: {
      health,
      wsStats: wsStatsResponse,
      wsStatsDelta,
      baselineStats: baselineStatsResponse,
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  if (connectedClients.length < clients || (waitForResults && !reachedResults)) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(
    `[load-test] fatal: ${error instanceof Error ? error.stack || error.message : String(error)}`
  );
  process.exitCode = 1;
});
