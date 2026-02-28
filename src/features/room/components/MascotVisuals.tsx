"use client";

import { useEffect, useRef, useState } from "react";

const LOTTIE_CDN_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js";

type LottieAnimationInstance = {
  destroy: () => void;
};

type LottieEngine = {
  loadAnimation: (params: {
    container: Element;
    renderer: "svg" | "canvas" | "html";
    loop: boolean;
    autoplay: boolean;
    path: string;
    rendererSettings?: {
      preserveAspectRatio?: string;
    };
  }) => LottieAnimationInstance;
};

declare global {
  interface Window {
    lottie?: LottieEngine;
    __lottieLoaderPromise?: Promise<void>;
  }
}

const LOADED_MASCOT_FRAMES = new Set<string>();
const LOADING_MASCOT_FRAMES = new Map<string, Promise<void>>();
const NORMALIZED_SLEEP_FRAME_CACHE = new Map<string, string>();
const NORMALIZED_SLEEP_FRAME_LOADING = new Map<string, Promise<string>>();
const MARKET_SKIN_ITEM_RE = /\/market\/([^/]+)\//i;

const skinItemIdFromFrame = (src: string): string | null => {
  if (!src) return null;
  let normalized = src;
  try {
    normalized = decodeURI(src);
  } catch {
    normalized = src;
  }
  const match = normalized.match(MARKET_SKIN_ITEM_RE);
  if (!match) return null;
  return String(match[1] || "").trim() || null;
};

type FrameMetrics = {
  width: number;
  height: number;
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
  bboxWidth: number;
  bboxHeight: number;
  centerX: number;
  bottomY: number;
};
const FRAME_METRICS_CACHE = new Map<string, FrameMetrics | null>();
const FRAME_METRICS_LOADING = new Map<string, Promise<FrameMetrics | null>>();
const ensureLottieLoaded = async () => {
  if (typeof window === "undefined") return;
  if (window.lottie) return;
  if (window.__lottieLoaderPromise) {
    await window.__lottieLoaderPromise;
    return;
  }

  window.__lottieLoaderPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-lottie-loader="1"]'
    );
    if (existing) {
      if (window.lottie) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Lottie script failed")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = LOTTIE_CDN_URL;
    script.async = true;
    script.defer = true;
    script.dataset.lottieLoader = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Lottie script failed"));
    document.head.appendChild(script);
  });

  await window.__lottieLoaderPromise;
};

const measureFrameMetrics = (src: string): Promise<FrameMetrics | null> => {
  if (!src || typeof window === "undefined") {
    return Promise.resolve(null);
  }
  if (FRAME_METRICS_CACHE.has(src)) {
    return Promise.resolve(FRAME_METRICS_CACHE.get(src) || null);
  }
  const pending = FRAME_METRICS_LOADING.get(src);
  if (pending) return pending;

  const measurePromise = new Promise<FrameMetrics | null>((resolve) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) {
          FRAME_METRICS_CACHE.set(src, null);
          FRAME_METRICS_LOADING.delete(src);
          resolve(null);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          const fallback: FrameMetrics = {
            width,
            height,
            minY: 0,
            maxY: height - 1,
            minX: 0,
            maxX: width - 1,
            bboxWidth: width,
            bboxHeight: height,
            centerX: width / 2,
            bottomY: height - 1,
          };
          FRAME_METRICS_CACHE.set(src, fallback);
          FRAME_METRICS_LOADING.delete(src);
          resolve(fallback);
          return;
        }
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0);
        const rgba = context.getImageData(0, 0, width, height).data;
// Find the visible bounds using the *largest connected opaque component*.
// This ignores detached decorations like "Zzz" bubbles that would otherwise
// change the bbox between frames and cause scaling jitter.
const alphaThreshold = 20;
const pixelCount = width * height;
const mask = new Uint8Array(pixelCount);
for (let i = 0; i < pixelCount; i += 1) {
  const alpha = rgba[i * 4 + 3];
  if (alpha >= alphaThreshold) mask[i] = 1;
}

const visited = new Uint8Array(pixelCount);
let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
let bestArea = 0;

const stack: number[] = [];
for (let idx = 0; idx < pixelCount; idx += 1) {
  if (!mask[idx] || visited[idx]) continue;

  // Flood-fill this component (4-neighborhood).
  visited[idx] = 1;
  stack.length = 0;
  stack.push(idx);

  let area = 0;
  let cMinX = width;
  let cMinY = height;
  let cMaxX = -1;
  let cMaxY = -1;

  while (stack.length) {
    const cur = stack.pop() as number;
    area += 1;

    const y = Math.floor(cur / width);
    const x = cur - y * width;

    if (x < cMinX) cMinX = x;
    if (y < cMinY) cMinY = y;
    if (x > cMaxX) cMaxX = x;
    if (y > cMaxY) cMaxY = y;

    // left
    if (x > 0) {
      const n = cur - 1;
      if (mask[n] && !visited[n]) {
        visited[n] = 1;
        stack.push(n);
      }
    }
    // right
    if (x + 1 < width) {
      const n = cur + 1;
      if (mask[n] && !visited[n]) {
        visited[n] = 1;
        stack.push(n);
      }
    }
    // up
    if (y > 0) {
      const n = cur - width;
      if (mask[n] && !visited[n]) {
        visited[n] = 1;
        stack.push(n);
      }
    }
    // down
    if (y + 1 < height) {
      const n = cur + width;
      if (mask[n] && !visited[n]) {
        visited[n] = 1;
        stack.push(n);
      }
    }
  }

  if (area > bestArea) {
    bestArea = area;
    minX = cMinX;
    minY = cMinY;
    maxX = cMaxX;
    maxY = cMaxY;
  }
}

const rowCounts = new Array<number>(height).fill(0);
        const colCounts = new Array<number>(width).fill(0);
        for (let y = minY; y <= maxY; y += 1) {
          const rowOffset = y * width * 4;
          for (let x = minX; x <= maxX; x += 1) {
            const alpha = rgba[rowOffset + x * 4 + 3];
            if (alpha < alphaThreshold) continue;
            rowCounts[y] += 1;
            colCounts[x] += 1;
          }
        }

        const maxRowPixels = rowCounts.reduce((max, value) => (value > max ? value : max), 0);
        const maxColPixels = colCounts.reduce((max, value) => (value > max ? value : max), 0);
        // Relative thresholds make bbox robust against tiny floating details (for example "Z" glyphs).
        const minDenseRowPixels = Math.max(3, Math.round(maxRowPixels * 0.1));
        const minDenseColPixels = Math.max(3, Math.round(maxColPixels * 0.06));
        let denseMinY = minY;
        let denseMaxY = maxY;
        let denseMinX = minX;
        let denseMaxX = maxX;

        while (denseMinY < denseMaxY && rowCounts[denseMinY] < minDenseRowPixels) {
          denseMinY += 1;
        }
        while (denseMaxY > denseMinY && rowCounts[denseMaxY] < minDenseRowPixels) {
          denseMaxY -= 1;
        }
        while (denseMinX < denseMaxX && colCounts[denseMinX] < minDenseColPixels) {
          denseMinX += 1;
        }
        while (denseMaxX > denseMinX && colCounts[denseMaxX] < minDenseColPixels) {
          denseMaxX -= 1;
        }

        const useDenseBounds =
          denseMaxX >= denseMinX &&
          denseMaxY >= denseMinY &&
          denseMaxX - denseMinX + 1 >= 2 &&
          denseMaxY - denseMinY + 1 >= 2;
        const finalMinX = useDenseBounds ? denseMinX : minX;
        const finalMaxX = useDenseBounds ? denseMaxX : maxX;
        const finalMinY = useDenseBounds ? denseMinY : minY;
        const finalMaxY = useDenseBounds ? denseMaxY : maxY;

        const metrics: FrameMetrics =
          maxX < 0 || maxY < 0
            ? {
                width,
                height,
                minY: 0,
                maxY: height - 1,
                minX: 0,
                maxX: width - 1,
                bboxWidth: width,
                bboxHeight: height,
                centerX: width / 2,
                bottomY: height - 1,
              }
            : {
                width,
                height,
                minY: finalMinY,
                maxY: finalMaxY,
                minX: finalMinX,
                maxX: finalMaxX,
                bboxWidth: finalMaxX - finalMinX + 1,
                bboxHeight: finalMaxY - finalMinY + 1,
                centerX: (finalMinX + finalMaxX) / 2,
                bottomY: finalMaxY,
              };
        FRAME_METRICS_CACHE.set(src, metrics);
        FRAME_METRICS_LOADING.delete(src);
        resolve(metrics);
      } catch {
        FRAME_METRICS_CACHE.set(src, null);
        FRAME_METRICS_LOADING.delete(src);
        resolve(null);
      }
    };
    image.onerror = () => {
      FRAME_METRICS_CACHE.set(src, null);
      FRAME_METRICS_LOADING.delete(src);
      resolve(null);
    };
    image.src = src;
  });

  FRAME_METRICS_LOADING.set(src, measurePromise);
  return measurePromise;
};

const loadImageElement = (src: string): Promise<HTMLImageElement | null> => {
  if (!src || typeof window === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
};

const normalizeSleepFrameToBase = async (
  frameSrc: string,
  baseRefSrc: string
): Promise<string> => {
  if (!frameSrc || !baseRefSrc || typeof window === "undefined") {
    return frameSrc;
  }
  const cacheKey = `${baseRefSrc}__${frameSrc}`;
  const cached = NORMALIZED_SLEEP_FRAME_CACHE.get(cacheKey);
  if (cached) return cached;
  const loading = NORMALIZED_SLEEP_FRAME_LOADING.get(cacheKey);
  if (loading) return loading;

  const normalizePromise = (async () => {
    const [frameMetrics, baseMetrics, frameImage] = await Promise.all([
      measureFrameMetrics(frameSrc),
      measureFrameMetrics(baseRefSrc),
      loadImageElement(frameSrc),
    ]);
    if (!frameMetrics || !baseMetrics || !frameImage) {
      return frameSrc;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, baseMetrics.width);
    canvas.height = Math.max(1, baseMetrics.height);
    const context = canvas.getContext("2d");
    if (!context) {
      return frameSrc;
    }

    const boxWidth = canvas.width;
    const boxHeight = canvas.height;
    
const project = (frame: FrameMetrics) => {
  // Project by the visible bbox, not the full canvas size.
  // This prevents frames with extra transparent padding (or detached "Z") from changing the scale.
  const containScale =
    Math.min(boxWidth / frame.bboxWidth, boxHeight / frame.bboxHeight) || 1;
  const offsetX = (boxWidth - frame.bboxWidth * containScale) / 2 - frame.minX * containScale;
  const offsetY = boxHeight - frame.bboxHeight * containScale - frame.minY * containScale;
  return {
    containScale,
    offsetX,
    offsetY,
    centerBottomX: offsetX + frame.centerX * containScale,
    centerBottomY: offsetY + frame.bottomY * containScale,
  };
};

    const frameProjection = project(frameMetrics);
    const baseProjection = project(baseMetrics);
    const frameVisibleHeight = Math.max(
      1,
      frameMetrics.bboxHeight * frameProjection.containScale
    );
    const baseVisibleHeight = Math.max(
      1,
      baseMetrics.bboxHeight * baseProjection.containScale
    );
    const normalizeScale = Math.max(
      0.55,
      Math.min(2.5, baseVisibleHeight / frameVisibleHeight)
    );

    context.clearRect(0, 0, boxWidth, boxHeight);
    context.save();
    context.translate(baseProjection.centerBottomX, baseProjection.centerBottomY);
    context.scale(normalizeScale, normalizeScale);
    context.translate(-frameProjection.centerBottomX, -frameProjection.centerBottomY);
    context.drawImage(
      frameImage,
      frameProjection.offsetX,
      frameProjection.offsetY,
      frameMetrics.width * frameProjection.containScale,
      frameMetrics.height * frameProjection.containScale
    );
    context.restore();

    const normalized = canvas.toDataURL("image/png");
    NORMALIZED_SLEEP_FRAME_CACHE.set(cacheKey, normalized);
    LOADED_MASCOT_FRAMES.add(normalized);
    return normalized;
  })().finally(() => {
    NORMALIZED_SLEEP_FRAME_LOADING.delete(cacheKey);
  });

  NORMALIZED_SLEEP_FRAME_LOADING.set(cacheKey, normalizePromise);
  return normalizePromise;
};

export const preloadMascotFrame = (src: string) => {
  if (!src || typeof window === "undefined" || LOADED_MASCOT_FRAMES.has(src)) {
    return Promise.resolve();
  }
  const inFlight = LOADING_MASCOT_FRAMES.get(src);
  if (inFlight) return inFlight;

  const loadPromise = new Promise<void>((resolve) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      LOADED_MASCOT_FRAMES.add(src);
      LOADING_MASCOT_FRAMES.delete(src);
      resolve();
    };
    image.onerror = () => {
      LOADED_MASCOT_FRAMES.add(src);
      LOADING_MASCOT_FRAMES.delete(src);
      resolve();
    };
    image.src = src;
  });

  LOADING_MASCOT_FRAMES.set(src, loadPromise);
  return loadPromise;
};

export function MascotFramePlayer({
  frames,
  overlayFrames = [],
  fps,
  mood,
  preloadAllFrames = true,
}: {
  frames: string[];
  overlayFrames?: string[];
  fps: number;
  mood: "common" | "happy" | "sad" | "sleep";
  preloadAllFrames?: boolean;
}) {
  const baseFramesKey = frames.filter(Boolean).join("|");
  const skinFramesKey = overlayFrames.filter(Boolean).join("|");
  const baseFrames = baseFramesKey ? baseFramesKey.split("|") : [];
  const skinFrames = skinFramesKey ? skinFramesKey.split("|") : [];
  const firstBaseFrame = baseFrames[0] || "";
  const sleepReferenceFrame = firstBaseFrame || skinFrames[0] || "";
  const skinItemId = skinItemIdFromFrame(skinFrames[0] || "");
  const shouldNormalizeCatBodyAllMoods = skinItemId === "cat_body_1";
  const shouldNormalizeDogBodySad = mood === "sad" && skinItemId === "dog_body_1";
  const shouldNormalizeSleepBase = mood === "sleep" && baseFrames.length > 0;
  const [normalizedSleepBaseFrames, setNormalizedSleepBaseFrames] = useState<string[]>([]);
  const isSleepBaseNormalizationReady =
    !shouldNormalizeSleepBase ||
    normalizedSleepBaseFrames.length === baseFrames.length;
  const effectiveBaseFrames =
    shouldNormalizeSleepBase && !isSleepBaseNormalizationReady
      ? baseFrames.slice(0, 1)
      : shouldNormalizeSleepBase
      ? normalizedSleepBaseFrames
      : baseFrames;
  const effectiveBaseFramesKey = effectiveBaseFrames.filter(Boolean).join("|");
  const firstEffectiveBaseFrame = effectiveBaseFrames[0] || firstBaseFrame;
  const shouldNormalizeSleepSkin =
    (mood === "sleep" || shouldNormalizeDogBodySad || shouldNormalizeCatBodyAllMoods) &&
    skinFrames.length > 0 &&
    !!sleepReferenceFrame;
  const [normalizedSleepSkinFrames, setNormalizedSleepSkinFrames] = useState<string[]>([]);
  const isSleepNormalizationReady =
    !shouldNormalizeSleepSkin ||
    normalizedSleepSkinFrames.length === skinFrames.length;
  const effectiveSkinFrames =
    shouldNormalizeSleepSkin && !isSleepNormalizationReady
      ? skinFrames.slice(0, 1)
      : shouldNormalizeSleepSkin
      ? normalizedSleepSkinFrames
      : skinFrames;
  const effectiveSkinFramesKey = effectiveSkinFrames.filter(Boolean).join("|");
  const animatedFrames = effectiveBaseFrames.length ? effectiveBaseFrames : effectiveSkinFrames;
  const animatedFramesKey = effectiveBaseFrames.length
    ? effectiveBaseFramesKey
    : shouldNormalizeSleepSkin
    ? effectiveSkinFramesKey
    : skinFramesKey;
  const [frameIndex, setFrameIndex] = useState(0);
  const targetBaseFrame =
    effectiveBaseFrames[frameIndex % Math.max(1, effectiveBaseFrames.length)] ||
    effectiveBaseFrames[0] ||
    "";
  const targetSkinFrame =
    effectiveSkinFrames[frameIndex % Math.max(1, effectiveSkinFrames.length)] ||
    effectiveSkinFrames[0] ||
    "";
  const [renderedBaseFrame, setRenderedBaseFrame] = useState(() => effectiveBaseFrames[0] || "");
  const [renderedSkinFrame, setRenderedSkinFrame] = useState(() => effectiveSkinFrames[0] || "");
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [skinFrameAdjust, setSkinFrameAdjust] = useState({ x: 0, y: 0, scale: 1 });

  useEffect(() => {
    if (!shouldNormalizeSleepBase) {
      setNormalizedSleepBaseFrames([]);
      return;
    }
    let cancelled = false;
    const normalize = async () => {
      const normalizedFrames = await Promise.all(
        baseFrames.map((src) => normalizeSleepFrameToBase(src, firstBaseFrame || src))
      );
      if (cancelled) return;
      setNormalizedSleepBaseFrames(normalizedFrames);
      normalizedFrames.forEach((src) => {
        LOADED_MASCOT_FRAMES.add(src);
      });
    };
    void normalize();
    return () => {
      cancelled = true;
    };
  }, [shouldNormalizeSleepBase, baseFramesKey, firstBaseFrame]);

  useEffect(() => {
    if (!shouldNormalizeSleepSkin) {
      setNormalizedSleepSkinFrames([]);
      return;
    }
    let cancelled = false;
    const normalize = async () => {
      const normalizedFrames = await Promise.all(
        skinFrames.map((src) => normalizeSleepFrameToBase(src, sleepReferenceFrame))
      );
      if (cancelled) return;
      setNormalizedSleepSkinFrames(normalizedFrames);
      normalizedFrames.forEach((src) => {
        LOADED_MASCOT_FRAMES.add(src);
      });
    };
    void normalize();
    return () => {
      cancelled = true;
    };
  }, [shouldNormalizeSleepSkin, skinFramesKey, sleepReferenceFrame]);

  useEffect(() => {
    setFrameIndex(0);
    if (!firstEffectiveBaseFrame) {
      setRenderedBaseFrame("");
    } else {
      if (LOADED_MASCOT_FRAMES.has(firstEffectiveBaseFrame)) {
        setRenderedBaseFrame(firstEffectiveBaseFrame);
      }
    }

    const initialSkinFrame = effectiveSkinFrames[0] || "";
    if (!initialSkinFrame) {
      setRenderedSkinFrame("");
      return;
    }
    if (LOADED_MASCOT_FRAMES.has(initialSkinFrame)) {
      setRenderedSkinFrame(initialSkinFrame);
    }
  }, [animatedFramesKey, effectiveSkinFramesKey, firstEffectiveBaseFrame]);

  useEffect(() => {
    if (animatedFrames.length === 0 && effectiveSkinFrames.length === 0) return;
    effectiveBaseFrames.forEach((src) => {
      void measureFrameMetrics(src);
    });
    effectiveSkinFrames.forEach((src) => {
      void measureFrameMetrics(src);
    });

    if (preloadAllFrames) {
      animatedFrames.forEach(preloadMascotFrame);
      effectiveSkinFrames.forEach(preloadMascotFrame);
      return;
    }
    if (animatedFrames[0]) {
      void preloadMascotFrame(animatedFrames[0]);
    }
    if (effectiveSkinFrames[0]) {
      void preloadMascotFrame(effectiveSkinFrames[0]);
    }
  }, [animatedFramesKey, effectiveSkinFramesKey, effectiveBaseFramesKey, preloadAllFrames]);

  useEffect(() => {
    if (animatedFrames.length <= 1) return;

    if (mood !== "common") {
      const frameDurationMs = Math.max(60, Math.round(1000 / fps));
      let rafId: number | null = null;
      let lastTs: number | null = null;
      let accMs = 0;

      const tick = (ts: number) => {
        if (lastTs === null) {
          lastTs = ts;
        }
        const deltaMs = Math.max(0, ts - lastTs);
        lastTs = ts;
        accMs += deltaMs;

        if (accMs >= frameDurationMs) {
          const steps = Math.floor(accMs / frameDurationMs);
          accMs -= steps * frameDurationMs;
          setFrameIndex((prev) => (prev + steps) % animatedFrames.length);
        }

        rafId = window.requestAnimationFrame(tick);
      };

      rafId = window.requestAnimationFrame(tick);
      return () => {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
        }
      };
    }

    let timeoutId: number | null = null;
    let cancelled = false;
    const openFrame = 0;
    const closedFrame = Math.min(1, animatedFrames.length - 1);
    const randomInt = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min;

    const schedule = (delayMs: number, task: () => void) => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        task();
      }, delayMs);
    };

    const blink = (allowDouble = true) => {
      setFrameIndex(closedFrame);
      schedule(randomInt(65, 95), () => {
        setFrameIndex(openFrame);
        if (allowDouble && Math.random() < 0.22) {
          schedule(randomInt(110, 180), () => blink(false));
          return;
        }
        schedule(randomInt(2600, 5600), () => blink(true));
      });
    };

    schedule(randomInt(1200, 2400), () => blink(true));

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [animatedFramesKey, fps, mood]);

  const safeTargetBaseFrame = targetBaseFrame || effectiveBaseFrames[0] || "";
  const isBaseTargetReady = safeTargetBaseFrame
    ? LOADED_MASCOT_FRAMES.has(safeTargetBaseFrame)
    : false;
  const visibleBaseFrame = isBaseTargetReady
    ? safeTargetBaseFrame
    : renderedBaseFrame || safeTargetBaseFrame;
  const shouldWarmPendingBaseFrame =
    !!safeTargetBaseFrame &&
    !isBaseTargetReady &&
    safeTargetBaseFrame !== visibleBaseFrame;

  const safeTargetSkinFrame = targetSkinFrame || effectiveSkinFrames[0] || "";
  const isSkinTargetReady = safeTargetSkinFrame
    ? LOADED_MASCOT_FRAMES.has(safeTargetSkinFrame)
    : false;
  const visibleSkinFrame = safeTargetSkinFrame
    ? isSkinTargetReady
      ? safeTargetSkinFrame
      : renderedSkinFrame || safeTargetSkinFrame
    : "";
  const shouldWarmPendingSkinFrame =
    !!safeTargetSkinFrame &&
    !isSkinTargetReady &&
    safeTargetSkinFrame !== visibleSkinFrame;

  const primaryFrame = visibleSkinFrame || visibleBaseFrame;
  const isSkinPrimary = !!visibleSkinFrame;
  useEffect(() => {
    if (!isSkinPrimary || !primaryFrame) {
      setSkinFrameAdjust({ x: 0, y: 0, scale: 1 });
      return;
    }
    if (shouldNormalizeCatBodyAllMoods) {
      setSkinFrameAdjust({ x: 0, y: 0, scale: 1 });
      return;
    }
    if (shouldNormalizeDogBodySad) {
      setSkinFrameAdjust({ x: 0, y: 0, scale: 1 });
      return;
    }
    // Sleep frames are pre-normalized to one reference canvas and anchor,
    // so extra per-frame runtime scaling would reintroduce visible jitter.
    if (mood === "sleep") {
      setSkinFrameAdjust({ x: 0, y: 0, scale: 1 });
      return;
    }
    let cancelled = false;

    const syncSkinFramePlacement = async () => {
      const framePositionIndex = Math.max(0, effectiveSkinFrames.indexOf(primaryFrame));
      const indexedBaseFrame =
        effectiveBaseFrames.length > 0
          ? effectiveBaseFrames[framePositionIndex % effectiveBaseFrames.length]
          : firstEffectiveBaseFrame || visibleBaseFrame || primaryFrame;
      const referenceFrame = indexedBaseFrame;
      const stableScaleSkinFrame = effectiveSkinFrames[0] || primaryFrame;
      const stableScaleBaseFrame = firstEffectiveBaseFrame || referenceFrame;
      await Promise.all([
        measureFrameMetrics(referenceFrame),
        measureFrameMetrics(primaryFrame),
        measureFrameMetrics(stableScaleSkinFrame),
        measureFrameMetrics(stableScaleBaseFrame),
      ]);
      if (cancelled) return;

      const reference = FRAME_METRICS_CACHE.get(referenceFrame);
      const current = FRAME_METRICS_CACHE.get(primaryFrame);
      const scaleReferenceSkin = FRAME_METRICS_CACHE.get(stableScaleSkinFrame);
      const scaleReferenceBase = FRAME_METRICS_CACHE.get(stableScaleBaseFrame);
      const imageEl = imageRef.current;
      if (!reference || !current || !scaleReferenceSkin || !scaleReferenceBase || !imageEl) {
        return;
      }

      const boxWidth = imageEl.clientWidth;
      const boxHeight = imageEl.clientHeight;
      if (boxWidth <= 0 || boxHeight <= 0) {
        return;
      }

      
const project = (frame: FrameMetrics, byBBox: boolean) => {
  if (byBBox) {
    const scale =
      Math.min(boxWidth / frame.bboxWidth, boxHeight / frame.bboxHeight) || 1;
    const offsetX = (boxWidth - frame.bboxWidth * scale) / 2 - frame.minX * scale;
    const offsetY = boxHeight - frame.bboxHeight * scale - frame.minY * scale;
    return {
      cx: offsetX + frame.centerX * scale,
      by: offsetY + frame.bottomY * scale,
      scale,
    };
  }
  const scale = Math.min(boxWidth / frame.width, boxHeight / frame.height) || 1;
  const offsetX = (boxWidth - frame.width * scale) / 2;
  const offsetY = boxHeight - frame.height * scale;
  return {
    cx: offsetX + frame.centerX * scale,
    by: offsetY + frame.bottomY * scale,
    scale,
  };
};
const useBBoxProjection = true;
const refPoint = project(reference, useBBoxProjection);
const positionFrame = current;
const curPoint = project(positionFrame, useBBoxProjection);

const refContainScale = project(scaleReferenceBase, useBBoxProjection).scale || 1;
const scaleRefContainScale = project(scaleReferenceSkin, useBBoxProjection).scale || 1;
const currentContainScale = project(current, useBBoxProjection).scale || 1;
      const refVisibleHeight = Math.max(1, scaleReferenceBase.bboxHeight * refContainScale);
      const stableSkinVisibleHeight = Math.max(1, scaleReferenceSkin.bboxHeight * scaleRefContainScale);
      const stableSkinVisibleWidth = Math.max(1, scaleReferenceSkin.bboxWidth * scaleRefContainScale);
      const currentVisibleHeight = Math.max(1, current.bboxHeight * currentContainScale);
      const currentVisibleWidth = Math.max(1, current.bboxWidth * currentContainScale);
      const stableScaleAdjust = Math.max(0.75, Math.min(1.75, refVisibleHeight / stableSkinVisibleHeight));
      const sleepFrameHeightRatio = stableSkinVisibleHeight / currentVisibleHeight;
      const sleepFrameWidthRatio = stableSkinVisibleWidth / currentVisibleWidth;
      const sleepFrameScaleAdjust = Math.max(
        0.5,
        Math.min(3.0, Math.sqrt(sleepFrameHeightRatio * sleepFrameWidthRatio))
      );
      setSkinFrameAdjust({
        x: refPoint.cx - curPoint.cx,
        y: refPoint.by - curPoint.by,
        scale: stableScaleAdjust * sleepFrameScaleAdjust,
      });
    };

    void syncSkinFramePlacement();
    return () => {
      cancelled = true;
    };
  }, [
    isSkinPrimary,
    primaryFrame,
    effectiveSkinFramesKey,
    effectiveBaseFramesKey,
    firstEffectiveBaseFrame,
    visibleBaseFrame,
    mood,
    shouldNormalizeCatBodyAllMoods,
    shouldNormalizeDogBodySad,
    animatedFramesKey,
    isSleepNormalizationReady,
  ]);

  const sleepScaleAdjust = isSkinPrimary ? skinFrameAdjust.scale : 1;
  const sleepStabilizeX = isSkinPrimary ? skinFrameAdjust.x : 0;
  const sleepStabilizeY = isSkinPrimary ? skinFrameAdjust.y : 0;
  const totalScale = sleepScaleAdjust;
  const primaryStyle =
    totalScale !== 1 || sleepStabilizeX !== 0 || sleepStabilizeY !== 0
      ? {
          transform: `translate(${sleepStabilizeX}px, ${sleepStabilizeY}px) scale(${totalScale})`,
          transformOrigin: "center bottom" as const,
        }
      : undefined;
  const primaryClassName = isSkinPrimary
    ? "pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-bottom drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]"
    : "pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-bottom drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]";

  if (!primaryFrame) return null;

  return (
    <>
      <img
        src={primaryFrame}
        alt="Талисман команды"
        loading="eager"
        decoding="sync"
        draggable={false}
        ref={imageRef}
        className={primaryClassName}
        style={primaryStyle}
        onLoad={() => {
          LOADED_MASCOT_FRAMES.add(primaryFrame);
          if (isSkinPrimary) {
            if (renderedSkinFrame !== primaryFrame) {
              setRenderedSkinFrame(primaryFrame);
            }
          } else if (renderedBaseFrame !== primaryFrame) {
            setRenderedBaseFrame(primaryFrame);
          }
        }}
      />
      {shouldWarmPendingBaseFrame ? (
        <img
          src={safeTargetBaseFrame}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="sync"
          className="hidden"
          onLoad={() => {
            LOADED_MASCOT_FRAMES.add(safeTargetBaseFrame);
            setRenderedBaseFrame(safeTargetBaseFrame);
          }}
          onError={() => {
            LOADED_MASCOT_FRAMES.add(safeTargetBaseFrame);
            setRenderedBaseFrame(safeTargetBaseFrame);
          }}
        />
      ) : null}
      {shouldWarmPendingSkinFrame ? (
        <img
          src={safeTargetSkinFrame}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="sync"
          className="hidden"
          onLoad={() => {
            LOADED_MASCOT_FRAMES.add(safeTargetSkinFrame);
            setRenderedSkinFrame(safeTargetSkinFrame);
          }}
          onError={() => {
            LOADED_MASCOT_FRAMES.add(safeTargetSkinFrame);
            setRenderedSkinFrame(safeTargetSkinFrame);
          }}
        />
      ) : null}
    </>
  );
}

export function LottieLayer({
  path,
  className,
  loop = true,
  autoplay = true,
  preserveAspectRatio = "xMidYMid meet",
  enabled = true,
}: {
  path: string;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  preserveAspectRatio?: string;
  enabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let isCancelled = false;
    let animation: LottieAnimationInstance | null = null;

    const start = async () => {
      try {
        await ensureLottieLoaded();
        if (isCancelled || !containerRef.current || !window.lottie) return;

        animation = window.lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop,
          autoplay,
          path,
          rendererSettings: {
            preserveAspectRatio,
          },
        });
      } catch {
        // ignore lottie loading failures, UI keeps working without decorative layer
      }
    };

    start();

    return () => {
      isCancelled = true;
      animation?.destroy();
    };
  }, [autoplay, enabled, loop, path, preserveAspectRatio]);

  if (!enabled) return null;
  return <div ref={containerRef} aria-hidden className={className} />;
}
