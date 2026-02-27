import type { Difficulty, GameMode, Phase, Player } from "./types";
import { GUEST_CLIENT_ID_STORAGE_KEY } from "./constants";

export const formatSeconds = (value: number) => (value < 10 ? `0${value}` : `${value}`);
export const uniq = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const isLocalHostName = (host: string) =>
  host === "localhost" || host === "127.0.0.1" || host === "::1";

export const shouldUseExplicitEndpoint = (endpoint: string, currentHost: string) => {
  try {
    const parsed = new URL(endpoint);
    const explicitHost = parsed.hostname;
    if (!isLocalHostName(currentHost) && isLocalHostName(explicitHost)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const getOrCreateGuestClientId = () => {
  if (typeof window === "undefined") return "";

  const existingRaw = window.localStorage.getItem(GUEST_CLIENT_ID_STORAGE_KEY);
  const existing = (existingRaw || "").trim().toLowerCase();
  const existingValid = existing.replace(/[^a-z0-9_-]/g, "");
  if (existingValid.length >= 8) {
    return existingValid.slice(0, 64);
  }

  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const normalized = randomPart.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
  window.localStorage.setItem(GUEST_CLIENT_ID_STORAGE_KEY, normalized);
  return normalized;
};

export const detectLowPerformanceMode = () => {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
  const lowCpu = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4;
  const smallScreen = window.innerWidth <= 768;
  return reducedMotion || lowMemory || (lowCpu && smallScreen);
};

export const votesLabel = (count: number) => {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} голос`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} голоса`;
  }
  return `${count} голосов`;
};

export const normalizeDifficulty = (value?: string | null): Difficulty => {
  if (value === "easy" || value === "medium" || value === "hard") return value;
  return "medium";
};

export const difficultyLabel = (value?: string | null) => {
  const normalized = normalizeDifficulty(value);
  if (normalized === "easy") return "Легкий";
  if (normalized === "hard") return "Сложный";
  return "Средний";
};

export const difficultyBadgeClass = (value?: string | null) => {
  const normalized = normalizeDifficulty(value);
  if (normalized === "easy") {
    return "border-emerald-300/45 bg-emerald-500/15 text-emerald-200";
  }
  if (normalized === "hard") {
    return "border-orange-500/45 bg-orange-800/35 text-orange-200";
  }
  return "border-yellow-300/45 bg-yellow-500/15 text-yellow-100";
};

export const modeLabel = (mode?: GameMode) => {
  if (mode === "ffa") return "Все против всех";
  if (mode === "chaos") return "Командный хаос";
  return "Что? Где? Когда?";
};

export const getAvatarInitial = (name: string) => {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
};

export const truncateName = (name: string, maxLength = 20) => {
  const normalized = name.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
};

export const getPlayerAvatarStyle = (player: Player, phase?: Phase) => {
  if (player.avatar) {
    return {
      backgroundImage: `url(${player.avatar}), linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)`,
      backgroundSize: "cover, cover",
      backgroundPosition: "center, center",
    };
  }

  if (player.isHost) {
    return {
      backgroundImage: "linear-gradient(135deg, #f59e0b 0%, #7c3aed 100%)",
    };
  }

  if (phase === "lobby") {
    return {
      backgroundColor: "#6b7280",
    };
  }

  if (player.team === "A") {
    return {
      backgroundColor: "#3b82f6",
    };
  }

  if (player.team === "B") {
    return {
      backgroundColor: "#ef4444",
    };
  }

  return {
    backgroundColor: "#6b7280",
  };
};
