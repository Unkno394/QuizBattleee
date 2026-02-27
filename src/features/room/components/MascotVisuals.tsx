"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getMarketMascotOverlayTuning } from "@/shared/shop/market";

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
  const animatedFrames = baseFrames.length ? baseFrames : skinFrames;
  const animatedFramesKey = baseFrames.length ? baseFramesKey : skinFramesKey;
  const firstBaseFrame = baseFrames[0] || "";
  const firstSkinFrame = skinFrames[0] || "";
  const [frameIndex, setFrameIndex] = useState(0);
  const targetBaseFrame = baseFrames[frameIndex % Math.max(1, baseFrames.length)] || baseFrames[0] || "";
  const targetSkinFrame = skinFrames[frameIndex % Math.max(1, skinFrames.length)] || skinFrames[0] || "";
  const [renderedBaseFrame, setRenderedBaseFrame] = useState(() => baseFrames[0] || "");
  const [renderedSkinFrame, setRenderedSkinFrame] = useState(() => skinFrames[0] || "");
  const skinItemId = useMemo(
    () => skinItemIdFromFrame(firstSkinFrame || skinFrames[0] || ""),
    [firstSkinFrame, skinFramesKey]
  );
  const skinOverlayTuning = useMemo(
    () => getMarketMascotOverlayTuning(skinItemId),
    [skinItemId]
  );
  const skinOverlayStyle = skinItemId
    ? {
        transform: `translateY(${skinOverlayTuning.offsetY}px) scale(${skinOverlayTuning.scale})`,
        transformOrigin: "center bottom",
      }
    : undefined;

  useEffect(() => {
    setFrameIndex(0);
    if (!firstBaseFrame) {
      setRenderedBaseFrame("");
    } else {
      if (LOADED_MASCOT_FRAMES.has(firstBaseFrame)) {
        setRenderedBaseFrame(firstBaseFrame);
      }
    }

    if (!firstSkinFrame) {
      setRenderedSkinFrame("");
      return;
    }
    if (LOADED_MASCOT_FRAMES.has(firstSkinFrame)) {
      setRenderedSkinFrame(firstSkinFrame);
    }
  }, [animatedFramesKey, skinFramesKey, firstBaseFrame, firstSkinFrame]);

  useEffect(() => {
    if (animatedFrames.length === 0 && skinFrames.length === 0) return;
    if (preloadAllFrames) {
      animatedFrames.forEach(preloadMascotFrame);
      skinFrames.forEach(preloadMascotFrame);
      return;
    }
    if (animatedFrames[0]) {
      void preloadMascotFrame(animatedFrames[0]);
    }
    if (skinFrames[0]) {
      void preloadMascotFrame(skinFrames[0]);
    }
  }, [animatedFramesKey, skinFramesKey, preloadAllFrames]);

  useEffect(() => {
    if (animatedFrames.length <= 1) return;

    if (mood !== "common") {
      const intervalMs = Math.max(60, Math.round(1000 / fps));
      const intervalId = window.setInterval(() => {
        setFrameIndex((prev) => (prev + 1) % animatedFrames.length);
      }, intervalMs);

      return () => window.clearInterval(intervalId);
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

  const safeTargetBaseFrame = targetBaseFrame || baseFrames[0] || "";
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

  const safeTargetSkinFrame = targetSkinFrame || "";
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

  if (!visibleBaseFrame && !visibleSkinFrame) return null;

  return (
    <>
      {visibleBaseFrame ? (
        <img
          src={visibleBaseFrame}
          alt="Талисман команды"
          loading="eager"
          decoding="sync"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-bottom drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]"
          onLoad={() => {
            LOADED_MASCOT_FRAMES.add(visibleBaseFrame);
            if (renderedBaseFrame !== visibleBaseFrame) {
              setRenderedBaseFrame(visibleBaseFrame);
            }
          }}
        />
      ) : null}
      {visibleSkinFrame ? (
        <img
          src={visibleSkinFrame}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="sync"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-bottom"
          style={skinOverlayStyle}
          onLoad={() => {
            LOADED_MASCOT_FRAMES.add(visibleSkinFrame);
            if (renderedSkinFrame !== visibleSkinFrame) {
              setRenderedSkinFrame(visibleSkinFrame);
            }
          }}
        />
      ) : null}
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
