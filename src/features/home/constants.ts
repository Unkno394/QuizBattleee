import type { DifficultyMode, GameMode } from "./types";

export const QUESTION_COUNT_OPTIONS = [5, 6, 7] as const;
export const TOPIC_OPTIONS = [
  "Кино и сериалы",
  "Музыка",
  "Игры",
  "Спорт",
  "История",
  "География",
  "Наука и технологии",
  "Космос",
  "Литература",
  "Еда и напитки",
  "Мемы и интернет",
  "Общая эрудиция",
  "Математика",
] as const;

export const DIFFICULTY_OPTIONS: Array<{
  value: DifficultyMode;
  label: string;
  hint: string;
}> = [
  {
    value: "easy",
    label: "Легкая",
    hint: "Все вопросы уровня легкий",
  },
  {
    value: "medium",
    label: "Средняя",
    hint: "Все вопросы уровня средний",
  },
  {
    value: "hard",
    label: "Сложная",
    hint: "Все вопросы уровня сложный",
  },
  {
    value: "progressive",
    label: "По возрастанию",
    hint: "Сложность растет по ходу раунда",
  },
];

export const GAME_MODE_OPTIONS: Array<{
  value: GameMode;
  label: string;
  hint: string;
  rules: string;
}> = [
  {
    value: "classic",
    label: "Что? Где? Когда?",
    hint: "Классика: команды, капитаны, поочередные ходы A/B.",
    rules: "Команды выбирают капитанов, ответы дает капитан активной команды.",
  },
  {
    value: "ffa",
    label: "Все против всех",
    hint: "Без команд и капитанов, каждый отвечает сам.",
    rules: "Индивидуальная игра: каждый участник получает и отправляет свой ответ.",
  },
  {
    value: "chaos",
    label: "Командный хаос",
    hint: "Без капитанов: отвечает голосование команды.",
    rules: "Ответ команды выбирается большинством голосов; при равенстве ответ выбирается случайно.",
  },
];

export const INTRO_SEEN_STORAGE_KEY = "qb_intro_seen_v1";
export const JOIN_PREFILL_PIN_STORAGE_KEY = "qb_join_pin_prefill_v1";
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:3001").replace(
  /\/$/,
  ""
);

const ROOM_HOST_TOKEN_STORAGE_PREFIX = "qb_room_host_token_v1:";
const ROOM_PLAYER_NAME_STORAGE_PREFIX = "qb_room_player_name_v1:";
const ROOM_ROLE_STORAGE_PREFIX = "qb_room_role_v1:";
const ROOM_JOIN_INTENT_STORAGE_PREFIX = "qb_room_join_intent_v1:";
const ROOM_PASSWORD_STORAGE_PREFIX = "qb_room_password_v1:";

export const roomHostTokenKey = (roomId: string) => `${ROOM_HOST_TOKEN_STORAGE_PREFIX}${roomId}`;
export const roomPlayerNameKey = (roomId: string) => `${ROOM_PLAYER_NAME_STORAGE_PREFIX}${roomId}`;
export const roomRoleKey = (roomId: string) => `${ROOM_ROLE_STORAGE_PREFIX}${roomId}`;
export const roomJoinIntentKey = (roomId: string) => `${ROOM_JOIN_INTENT_STORAGE_PREFIX}${roomId}`;
export const roomPasswordKey = (roomId: string) => `${ROOM_PASSWORD_STORAGE_PREFIX}${roomId}`;
