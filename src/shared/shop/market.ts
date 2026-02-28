export type ProfileFrameId =
  | "profile_frame_aurora"
  | "profile_frame_gold"
  | "profile_frame_neon_circuit"
  | "profile_frame_holo_glass"
  | "profile_frame_glitch_edge"
  | "profile_frame_champion_laurel";
export type VictoryEffectLayer = "front" | "back";
export type FrameTuningVariant = "avatar" | "shop" | "room";
export type MarketMascotOverlayTuning = {
  scale: number;
  offsetY: number;
};
const MARKET_ASSET_VERSION = "20260227-2";

const withMarketAssetVersion = (path: string) =>
  `${path}${path.includes("?") ? "&" : "?"}v=${MARKET_ASSET_VERSION}`;

export const PROFILE_FRAME_CLASS: Record<ProfileFrameId, string> = {
  profile_frame_aurora: "qb-frame qb-frame--aurora qb-frame--impulse",
  profile_frame_gold: "qb-frame qb-frame--gold qb-frame--impulse qb-frame--sparkle",
  profile_frame_neon_circuit: "qb-frame qb-frame--neon-circuit qb-frame--impulse",
  profile_frame_holo_glass: "qb-frame qb-frame--holo-glass qb-frame--impulse",
  profile_frame_glitch_edge: "qb-frame qb-frame--glitch-edge",
  profile_frame_champion_laurel: "qb-frame qb-frame--champion-laurel",
};

export const profileFrameClass = (frameId?: string | null) => {
  if (!frameId) return "";
  return PROFILE_FRAME_CLASS[frameId as ProfileFrameId] || "";
};

export const PROFILE_FRAME_FX_SRC: Partial<Record<ProfileFrameId, string>> = {
  profile_frame_aurora: "/frame1.lottie",
  profile_frame_gold: "/frame2.lottie",
  profile_frame_glitch_edge: "/frame3.lottie",
  profile_frame_champion_laurel: "/frame4.lottie",
};

export const profileFrameFxSrc = (frameId?: string | null) => {
  if (!frameId) return "";
  return PROFILE_FRAME_FX_SRC[frameId as ProfileFrameId] || "";
};

type ProfileFrameFxTuning = {
  thickness: number;
  overscan: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

const DEFAULT_PROFILE_FRAME_FX_TUNING: ProfileFrameFxTuning = {
  thickness: 10,
  overscan: 14,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const PROFILE_FRAME_FX_TUNING: Partial<Record<ProfileFrameId, Partial<ProfileFrameFxTuning>>> = {
  profile_frame_aurora: {
    thickness: 10,
    overscan: 10,
    scale: 0.98,
    offsetX: 0,
    offsetY: 0,
  },
  profile_frame_champion_laurel: {
    thickness: 12,
    overscan: 22,
    scale: 1.24,
    offsetX: 0,
    offsetY: -2,
  },
};

const PROFILE_FRAME_FX_TUNING_VARIANT: Partial<
  Record<FrameTuningVariant, Partial<Record<ProfileFrameId, Partial<ProfileFrameFxTuning>>>>
> = {
  avatar: {
    profile_frame_aurora: {
      thickness: 12,
      overscan: 12,
      scale: 0.98,
    },
    profile_frame_gold: {
      overscan: 12,
      scale: 0.95,
    },
    profile_frame_glitch_edge: {
      overscan: 18,
      scale: 1.08,
    },
    profile_frame_champion_laurel: {
      overscan: 24,
      scale: 1.24,
    },
  },
  room: {
    profile_frame_aurora: {
      overscan: 8,
      scale: 0.94,
    },
    profile_frame_glitch_edge: {
      overscan: 10,
      scale: 0.92,
    },
    profile_frame_champion_laurel: {
      overscan: 18,
      scale: 1.05,
    },
  },
};

export const profileFrameFxTuning = (
  frameId?: string | null,
  variant: FrameTuningVariant = "avatar"
): ProfileFrameFxTuning => {
  const frameKey = frameId as ProfileFrameId | undefined;
  const tuning = frameKey ? PROFILE_FRAME_FX_TUNING[frameKey] : null;
  const variantTuning = frameKey ? PROFILE_FRAME_FX_TUNING_VARIANT[variant]?.[frameKey] : null;
  return {
    ...DEFAULT_PROFILE_FRAME_FX_TUNING,
    ...(tuning || {}),
    ...(variantTuning || {}),
  };
};

const MARKET_FRAME_COUNTS: Record<
  string,
  Partial<Record<"common" | "happy" | "sad" | "sleep", number>>
> = {
  cat_header_1: { common: 2, happy: 4, sad: 12, sleep: 4 },
  cat_header_2: { common: 2, happy: 4, sad: 12, sleep: 4 },
  cat_neck_1: { common: 2, happy: 4, sad: 12, sleep: 4 },
  cat_body_1: { common: 2, happy: 4, sad: 12, sleep: 4 },
  dog_header_1: { common: 2, happy: 3, sad: 11, sleep: 4 },
  dog_header_2: { common: 2, happy: 3, sad: 12, sleep: 4 },
  dog_neck_1: { common: 2, happy: 3, sad: 12, sleep: 4 },
  dog_body_1: { common: 2, happy: 3, sad: 10, sleep: 4 },
};

const MARKET_MASCOT_OVERLAY_TUNING: Record<string, MarketMascotOverlayTuning> = {
  cat_header_1: { scale: 0.97, offsetY: -1 },
  cat_header_2: { scale: 1, offsetY: 0 },
  cat_neck_1: { scale: 1.21, offsetY: 3 },
  cat_body_1: { scale: 1.08, offsetY: 2 },
  dog_header_1: { scale: 1.38, offsetY: 20 },
  dog_header_2: { scale: 1.4, offsetY: 20 },
  dog_neck_1: { scale: 1.3, offsetY: 11 },
  dog_body_1: { scale: 1.06, offsetY: 2 },
};

const DEFAULT_MARKET_MASCOT_OVERLAY_TUNING: MarketMascotOverlayTuning = {
  scale: 1,
  offsetY: 0,
};

const FRAME_NUMBER_RE = /\/(\d+)\.png(?:\?.*)?$/i;

const frameNumberFromPath = (path: string): number | null => {
  let normalized = String(path || "");
  try {
    normalized = decodeURI(normalized);
  } catch {
    normalized = String(path || "");
  }
  const match = normalized.match(FRAME_NUMBER_RE);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export const getMarketMascotOverlayTuning = (
  itemId: string | null | undefined
): MarketMascotOverlayTuning => {
  if (!itemId) return DEFAULT_MARKET_MASCOT_OVERLAY_TUNING;
  return MARKET_MASCOT_OVERLAY_TUNING[itemId] || DEFAULT_MARKET_MASCOT_OVERLAY_TUNING;
};

export const getMarketCommonFrames = (itemId: string) => {
  const count = Math.max(1, MARKET_FRAME_COUNTS[itemId]?.common || 1);
  return Array.from(
    { length: count },
    (_, index) => withMarketAssetVersion(`/market/${itemId}/common/${index + 1}.png`)
  );
};

export const buildMarketOverlayFrames = (
  itemId: string | null | undefined,
  mood: "common" | "happy" | "sad" | "sleep",
  baseFrames: string[]
) => {
  if (!itemId) return [];
  const moodCount = MARKET_FRAME_COUNTS[itemId]?.[mood] || 0;
  if (!moodCount || baseFrames.length === 0) return [];
  return baseFrames.map((baseFrame, index) => {
    const sourceFrameNumber = frameNumberFromPath(baseFrame);
    const frameIndex = sourceFrameNumber
      ? Math.max(1, Math.min(moodCount, sourceFrameNumber))
      : (index % moodCount) + 1;
    return withMarketAssetVersion(`/market/${itemId}/${mood}/${frameIndex}.png`);
  });
};

export const DEFAULT_VICTORY_EFFECT_PATHS: Record<VictoryEffectLayer, string> = {
  front: "/confetti.json",
  back: "/winner background.json",
};

const VICTORY_EFFECT_ITEM_PATHS: Record<string, string> = {
  victory_front_confetti2: "/Confetti2.lottie",
  victory_front_confetti_default: "/confetti.json",
  victory_front_winner_bg: "/winner background.json",
  victory_back_success: "/Success celebration.lottie",
  victory_back_vui: "/VUI Animation.lottie",
  victory_back_stars: "/backround stars.lottie",
};

const SHOP_EFFECT_LOTTIE_FALLBACKS: Record<string, string> = {
  "/Confetti1.lottie": "/lottie-preview/Confetti1.json",
  "/Confetti2.lottie": "/lottie-preview/Confetti2.json",
  "/Success celebration.lottie": "/lottie-preview/Success celebration.json",
  "/VUI Animation.lottie": "/lottie-preview/VUI Animation.json",
  "/backround stars.lottie": "/lottie-preview/backround stars.json",
};

const normalizeEffectPathKey = (path: string) => {
  const trimmed = String(path || "").trim();
  if (!trimmed) return "";
  try {
    return decodeURI(trimmed);
  } catch {
    return trimmed;
  }
};

export const getShopEffectFallbackJson = (path: string) => {
  const key = normalizeEffectPathKey(path);
  return SHOP_EFFECT_LOTTIE_FALLBACKS[key] || null;
};

export const getVictoryEffectLayerLabel = (layer: VictoryEffectLayer) =>
  layer === "front" ? "Перед талисманом" : "Позади талисмана";

export const resolveVictoryEffectRenderPath = (
  path: string | null | undefined,
  layer: VictoryEffectLayer
) => {
  const normalized = normalizeEffectPathKey(path || "");
  const sourcePath =
    normalized.startsWith("/")
      ? normalized
      : normalized
      ? VICTORY_EFFECT_ITEM_PATHS[normalized] || ""
      : "";
  const rawPath = sourcePath || DEFAULT_VICTORY_EFFECT_PATHS[layer];
  const fallbackJson = getShopEffectFallbackJson(rawPath);
  return encodeURI(fallbackJson || rawPath);
};
