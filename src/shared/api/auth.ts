import { buildApiUrl } from "./base";

type HttpMethod = "GET" | "POST" | "PATCH";
export type ApiError = Error & { status?: number };

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  full_name: string;
  email: string;
  password: string;
  password_confirm: string;
}

interface ResetPasswordPayload {
  email: string;
  token: string;
  new_password: string;
  new_password_confirm: string;
}

interface LoginResponse {
  access_token: string;
  token_type?: string;
}

export interface ProfileUser {
  id?: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
  preferred_mascot?: "cat" | "dog" | null;
  wins_total?: number;
  coins?: number;
  profile_frame?: string | null;
  equipped_cat_skin?: string | null;
  equipped_dog_skin?: string | null;
  equipped_victory_front_effect?: string | null;
  equipped_victory_back_effect?: string | null;
  is_email_verified: boolean;
  created_at: string | null;
  last_login_at: string | null;
}

export type ShopCatalogItem = {
  id: string;
  title: string;
  description: string;
  price: number;
  type: "mascot_skin" | "profile_frame" | "victory_effect";
  mascotKind?: "cat" | "dog" | null;
  effectLayer?: "front" | "back" | null;
  effectPath?: string | null;
};

export type ShopState = {
  balance: number;
  ownedItemIds: string[];
  equipped: {
    profileFrame?: string | null;
    catSkin?: string | null;
    dogSkin?: string | null;
    victoryFrontEffect?: string | null;
    victoryBackEffect?: string | null;
  };
};

export type LeaderboardScope = "all" | "friends";

export type LeaderboardEntry = {
  rank: number;
  userId: number;
  displayName: string;
  avatarUrl?: string | null;
  profileFrame?: string | null;
  wins: number;
  isMe?: boolean;
};

const resolveMessage = async (response: Response) => {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.message === "string") return data.message;
  } catch {
    // ignore non-json payload
  }
  return `Ошибка запроса (${response.status})`;
};

export const getStoredAccessToken = () => {
  if (typeof window === "undefined") return "";
  const raw = window.localStorage.getItem("access_token");
  if (!raw) return "";
  const token = raw.trim();
  if (!token || token === "undefined" || token === "null") return "";
  return token;
};

async function request<T>(
  path: string,
  method: HttpMethod,
  body?: unknown,
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authToken = token || getStoredAccessToken();
  if (authToken) {
    headers.Authorization = /^Bearer\s+/i.test(authToken) ? authToken : `Bearer ${authToken}`;
  }

  const response = await fetch(buildApiUrl(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = new Error(await resolveMessage(response)) as ApiError;
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

export const login = (payload: LoginPayload) =>
  request<LoginResponse>("/api/auth/login", "POST", payload);

export const register = (payload: RegisterPayload) =>
  request<{ ok: boolean }>("/api/auth/register", "POST", payload);

export const verifyEmail = (email: string, code: string) =>
  request<{ ok: boolean }>("/api/auth/verify-email", "POST", { email, code });

export const resendVerificationCode = (email: string) =>
  request<{ ok: boolean }>("/api/auth/resend-verification", "POST", { email });

export const forgotPassword = (email: string) =>
  request<{ ok: boolean }>("/api/auth/forgot-password", "POST", { email });

export const verifyResetCode = (email: string, token: string) =>
  request<{ ok: boolean }>("/api/auth/verify-reset", "POST", { email, token });

export const resetPassword = (payload: ResetPasswordPayload) =>
  request<{ ok: boolean }>("/api/auth/reset-password", "POST", payload);

export const getProfile = (token?: string) =>
  request<{ ok: boolean; user: ProfileUser }>("/api/auth/me", "GET", undefined, token);

export const updateProfile = (
  payload: { display_name?: string; avatar_url?: string | null; preferred_mascot?: "cat" | "dog" },
  token?: string
) => request<{ ok: boolean; user: ProfileUser }>("/api/auth/profile", "PATCH", payload, token);

export const changeEmail = (
  payload: { new_email: string; current_password: string },
  token?: string
) =>
  request<{ ok: boolean; message: string; access_token: string; user: ProfileUser }>(
    "/api/auth/change-email",
    "POST",
    payload,
    token
  );

export const changePassword = (
  payload: { old_password: string; new_password: string; new_password_confirm: string },
  token?: string
) => request<{ ok: boolean; message: string }>("/api/auth/change-password", "POST", payload, token);

export const logout = (token?: string) =>
  request<{ ok: boolean }>("/api/auth/logout", "POST", undefined, token);

export const logoutAll = (token?: string) =>
  request<{ ok: boolean; revoked: number }>("/api/auth/logout-all", "POST", undefined, token);

export const getShop = (token?: string) =>
  request<{ ok: boolean; currency: string; catalog: ShopCatalogItem[]; state: ShopState }>(
    "/api/auth/shop",
    "GET",
    undefined,
    token
  );

export const buyShopItem = (itemId: string, token?: string) =>
  request<{ ok: boolean; state: ShopState }>("/api/auth/shop/buy", "POST", { item_id: itemId }, token);

export const equipShopItem = (
  payload: {
    item_id?: string | null;
    target: "profile_frame" | "cat" | "dog" | "victory_front" | "victory_back";
  },
  token?: string
) => request<{ ok: boolean; state: ShopState }>("/api/auth/shop/equip", "POST", payload, token);

export const getLeaderboard = (scope: LeaderboardScope, token?: string) =>
  request<{
    ok: boolean;
    scope: LeaderboardScope;
    entries: LeaderboardEntry[];
    friendsCount?: number | null;
    generatedAt?: string;
  }>(`/api/leaderboard?scope=${scope}`, "GET", undefined, token);
