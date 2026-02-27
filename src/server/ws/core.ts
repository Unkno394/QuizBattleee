import { WebSocket } from "ws";

import type { QuizQuestion, QuizRuntimeStore } from "./types";

export const MAX_PLAYERS = 20;
export const QUESTION_TIME_MS = 30_000;
export const REVEAL_TIME_MS = 4_000;

const getRuntimeStore = (): QuizRuntimeStore => {
  const g = globalThis as typeof globalThis & {
    __quizRuntimeStore?: QuizRuntimeStore;
  };

  if (!g.__quizRuntimeStore) {
    g.__quizRuntimeStore = {
      rooms: new Map(),
      instanceId: Math.random().toString(36).slice(2, 8),
      upgradeBound: false,
    };
  }

  return g.__quizRuntimeStore;
};

export const runtimeStore = getRuntimeStore();
export const rooms = runtimeStore.rooms;

export const sendSafe = (socket: WebSocket, data: unknown) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
};

export const randomId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2);

export const clampQuestionCount = (value: number) => {
  if (!Number.isFinite(value)) return 5;
  return Math.max(5, Math.min(7, Math.round(value)));
};

export const sanitizeRoomId = (raw: string) =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

export const createMockQuestions = (topic: string, count: number): QuizQuestion[] => {
  const base = [
    {
      text: `Что из этого лучше всего описывает тему "${topic}"?`,
      options: [
        "Практическая задача",
        "Случайный факт",
        "Музыкальный термин",
        "Историческая дата",
      ],
      correctIndex: 0,
    },
    {
      text: `Какой подход обычно самый эффективный в "${topic}"?`,
      options: [
        "Пробовать без плана",
        "Игнорировать данные",
        "Проверять гипотезы",
        "Избегать изменений",
      ],
      correctIndex: 2,
    },
    {
      text: `Что важнее всего для командной игры на тему "${topic}"?`,
      options: ["Скорость без точности", "Распределение ролей", "Тишина", "Один лидер"],
      correctIndex: 1,
    },
    {
      text: `Какой вариант чаще приводит к лучшему результату в "${topic}"?`,
      options: ["Итерации", "Случайный выбор", "Отсутствие обратной связи", "Пауза"],
      correctIndex: 0,
    },
    {
      text: `Что помогает снизить ошибки при решении задач "${topic}"?`,
      options: ["Пропуск проверки", "Ограничение времени до 1 секунды", "Ревью ответов", "Смена темы"],
      correctIndex: 2,
    },
    {
      text: `Какой шаг логичен перед финальным ответом в "${topic}"?`,
      options: ["Перепроверка", "Удаление черновика", "Игнор вопросов", "Выход из комнаты"],
      correctIndex: 0,
    },
    {
      text: `Что обычно усиливает шанс победы в QuizBattle по "${topic}"?`,
      options: ["Споры без решения", "Случайные клики", "Командная координация", "Паузы 5 минут"],
      correctIndex: 2,
    },
  ];

  return base.slice(0, count).map((item, idx) => ({
    id: `${idx + 1}`,
    ...item,
  }));
};
