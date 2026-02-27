import type { MascotKind, MascotMood, Team } from "./types";

export const DEFAULT_TEAM_NAMES: Record<Team, string> = {
  A: "Команда A",
  B: "Команда B",
};

export const WINNER_BACKGROUND_LOTTIE_PATH = "/winner%20background.json";
export const WINNER_CONFETTI_LOTTIE_PATH = "/confetti.json";
const MASCOT_ASSET_VERSION = "20260226-1";

const createFramePaths = (basePath: string, count: number) =>
  Array.from(
    { length: count },
    (_, index) => `${basePath}/${index + 1}.png?v=${MASCOT_ASSET_VERSION}`
  );

const createPingPongFramePaths = (basePath: string, count: number) => {
  const forward = createFramePaths(basePath, count);
  const backward = forward.slice(1, -1).reverse();
  return [...forward, ...backward];
};

export const MASCOT_FRAMES: Record<MascotKind, Record<MascotMood, string[]>> = {
  dog: {
    common: createFramePaths("/dog/common", 2),
    happy: createFramePaths("/dog/happy", 3),
    sad: createFramePaths("/dog/sad", 12),
    sleep: createPingPongFramePaths("/dog/sleep", 4),
  },
  cat: {
    common: createFramePaths("/cat/common", 2),
    happy: createFramePaths("/cat/happy", 4),
    sad: createFramePaths("/cat/sad", 12),
    sleep: createPingPongFramePaths("/cat/sleep", 4),
  },
};

export const MASCOT_DISPLAY_META: Record<
  MascotKind,
  {
    title: string;
  }
> = {
  dog: {
    title: "пес Байт",
  },
  cat: {
    title: "кошка Луна",
  },
};

export const TEAM_SECTOR_META: Record<
  Team,
  {
    label: string;
    textClass: string;
    cardClass: string;
    flagWrapClass: string;
    flagClass: string;
  }
> = {
  A: {
    label: "СИНЕГО СЕКТОРА",
    textClass: "text-sky-300",
    cardClass: "border-sky-300/40 bg-sky-500/10",
    flagWrapClass: "border-sky-300/45 bg-sky-500/20",
    flagClass: "text-sky-200",
  },
  B: {
    label: "КРАСНОГО СЕКТОРА",
    textClass: "text-rose-300",
    cardClass: "border-rose-300/40 bg-rose-500/10",
    flagWrapClass: "border-rose-300/45 bg-rose-500/20",
    flagClass: "text-rose-200",
  },
};

const ROOM_HOST_TOKEN_STORAGE_PREFIX = "qb_room_host_token_v1:";
const ROOM_PLAYER_TOKEN_STORAGE_PREFIX = "qb_room_player_token_v1:";
const ROOM_PLAYER_NAME_STORAGE_PREFIX = "qb_room_player_name_v1:";
const ROOM_ROLE_STORAGE_PREFIX = "qb_room_role_v1:";
const ROOM_JOIN_INTENT_STORAGE_PREFIX = "qb_room_join_intent_v1:";
const ROOM_PASSWORD_STORAGE_PREFIX = "qb_room_password_v1:";

export const GUEST_CLIENT_ID_STORAGE_KEY = "qb_guest_client_id_v1";
export const JOIN_PREFILL_PIN_STORAGE_KEY = "qb_join_pin_prefill_v1";
export const ROOM_JOIN_INTENT_TTL_MS = 120_000;

export const roomHostTokenKey = (roomId: string) =>
  `${ROOM_HOST_TOKEN_STORAGE_PREFIX}${roomId}`;
export const roomPlayerTokenKey = (roomId: string) =>
  `${ROOM_PLAYER_TOKEN_STORAGE_PREFIX}${roomId}`;
export const roomPlayerNameKey = (roomId: string) =>
  `${ROOM_PLAYER_NAME_STORAGE_PREFIX}${roomId}`;
export const roomRoleKey = (roomId: string) => `${ROOM_ROLE_STORAGE_PREFIX}${roomId}`;
export const roomJoinIntentKey = (roomId: string) =>
  `${ROOM_JOIN_INTENT_STORAGE_PREFIX}${roomId}`;
export const roomPasswordKey = (roomId: string) =>
  `${ROOM_PASSWORD_STORAGE_PREFIX}${roomId}`;
