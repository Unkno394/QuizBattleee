"use client";

import { createElement, useEffect, useMemo, useState } from "react";
import type { ShopCatalogItem, ShopState } from "@/shared/api/auth";
import { LottieLayer, MascotFramePlayer } from "@/features/room/components/MascotVisuals";
import { MASCOT_FRAMES } from "@/features/room/constants";
import {
  buildMarketOverlayFrames,
  getMarketMascotOverlayTuning,
  getShopEffectFallbackJson,
  getVictoryEffectLayerLabel,
} from "@/shared/shop/market";
import { Frame } from "@/shared/shop/Frame";

type Props = {
  open: boolean;
  onClose: () => void;
  catalog: ShopCatalogItem[];
  state: ShopState | null;
  busyId?: string | null;
  onBuy: (itemId: string) => void;
  onEquip: (
    target: "profile_frame" | "cat" | "dog" | "victory_front" | "victory_back",
    itemId: string | null
  ) => void;
};

const targetLabel = (
  item: ShopCatalogItem
): "profile_frame" | "cat" | "dog" | "victory_front" | "victory_back" => {
  if (item.type === "profile_frame") return "profile_frame";
  if (item.type === "victory_effect") return item.effectLayer === "back" ? "victory_back" : "victory_front";
  return item.mascotKind === "dog" ? "dog" : "cat";
};

declare global {
  interface Window {
    __dotLottieLoaderPromise?: Promise<boolean>;
  }
}

const DOT_LOTTIE_PLAYER_URLS = [
  "https://cdn.jsdelivr.net/npm/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs",
  "https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs",
];

const ensureDotLottiePlayer = async () => {
  if (typeof window === "undefined") return false;

  if (customElements.get("dotlottie-player")) {
    return true;
  }

  if (window.__dotLottieLoaderPromise) {
    return window.__dotLottieLoaderPromise;
  }

  window.__dotLottieLoaderPromise = new Promise<boolean>((resolve) => {
    let index = 0;

    const tryLoad = () => {
      if (customElements.get("dotlottie-player")) {
        resolve(true);
        return;
      }

      if (index >= DOT_LOTTIE_PLAYER_URLS.length) {
        resolve(false);
        return;
      }

      const src = DOT_LOTTIE_PLAYER_URLS[index];
      index += 1;
      const script = document.createElement("script");
      script.type = "module";
      script.src = src;
      script.dataset.dotlottiePlayerLoader = "1";
      script.onload = async () => {
        try {
          await customElements.whenDefined("dotlottie-player");
          resolve(true);
        } catch {
          tryLoad();
        }
      };
      script.onerror = () => {
        script.remove();
        tryLoad();
      };
      document.head.appendChild(script);
    };

    tryLoad();
  });

  return window.__dotLottieLoaderPromise;
};

function EffectPreview({ path }: { path: string }) {
  const isJson = path.toLowerCase().endsWith(".json");
  const isLottie = path.toLowerCase().endsWith(".lottie");
  const normalizedPath = encodeURI(path);
  const fallbackJson = getShopEffectFallbackJson(path);
  const [dotReady, setDotReady] = useState(false);

  useEffect(() => {
    if (!isLottie) {
      setDotReady(false);
      return;
    }
    let cancelled = false;
    void ensureDotLottiePlayer()
      .then((ready) => {
        if (!cancelled) setDotReady(!!ready);
      })
      .catch(() => {
        if (!cancelled) setDotReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLottie]);

  if (isJson) {
    return (
      <div className="relative h-24 w-full overflow-hidden rounded-lg border border-white/10 bg-black/30">
        <LottieLayer path={normalizedPath} className="absolute inset-0" />
      </div>
    );
  }

  if (isLottie && (dotReady || fallbackJson)) {
    return (
      <div className="relative h-24 w-full overflow-hidden rounded-lg border border-white/10 bg-black/30">
        {fallbackJson ? <LottieLayer path={encodeURI(fallbackJson)} className="absolute inset-0" /> : null}
        {dotReady
          ? createElement("dotlottie-player", {
              src: normalizedPath,
              autoplay: true,
              loop: true,
              style: { width: "100%", height: "100%", display: "block" },
            } as Record<string, unknown>)
          : null}
      </div>
    );
  }

  return (
    <div className="flex h-24 w-full flex-col items-center justify-center rounded-lg border border-white/10 bg-black/30 px-2 text-center text-xs text-white/60">
      <p>Загрузка .lottie…</p>
    </div>
  );
}

function SkinPreview({ item }: { item: ShopCatalogItem }) {
  const mascotKind = item.mascotKind === "dog" ? "dog" : "cat";
  const baseFrames = MASCOT_FRAMES[mascotKind].common;
  const skinFrames = useMemo(
    () => buildMarketOverlayFrames(item.id, "common", baseFrames),
    [baseFrames, item.id]
  );
  const previewFrames = skinFrames.length ? skinFrames : baseFrames;
  const previewTuning = getMarketMascotOverlayTuning(item.id);
  const previewScale = previewTuning.scale;
  const previewOffsetY = previewTuning.offsetY;

  return (
    <div className="mb-2 flex items-center justify-center p-2">
      <div className="relative h-[104px] w-[84px]">
        <div
          className="absolute inset-0"
          style={{
            transform: `translateY(${previewOffsetY}px) scale(${previewScale})`,
            transformOrigin: "center bottom",
          }}
        >
          <MascotFramePlayer
            frames={previewFrames}
            overlayFrames={[]}
            fps={5}
            mood="common"
            preloadAllFrames
          />
        </div>
      </div>
    </div>
  );
}

function FramePreview({ frameId }: { frameId: string }) {
  return (
    <div className="mb-2 flex items-center justify-center rounded-lg border border-white/10 bg-black/30 p-2">
      <Frame
        frameId={frameId}
        className="h-16 w-16"
        radiusClass="rounded-full"
        innerClassName="flex h-full w-full items-center justify-center rounded-full bg-black/35 p-1 text-xs font-semibold text-white"
        tuningVariant="shop"
      >
        UI
      </Frame>
    </div>
  );
}

export function ShopModal({ open, onClose, catalog, state, busyId, onBuy, onEquip }: Props) {
  if (!open) return null;

  const owned = new Set(state?.ownedItemIds || []);
  const equipped = state?.equipped || {};
  const skins = catalog.filter((item) => item.type === "mascot_skin");
  const frames = catalog.filter((item) => item.type === "profile_frame");
  const effects = catalog
    .filter((item) => item.type === "victory_effect" && !!item.effectPath)
    .sort((a, b) => {
      const aLayer = a.effectLayer === "back" ? 1 : 0;
      const bLayer = b.effectLayer === "back" ? 1 : 0;
      if (aLayer !== bLayer) return aLayer - bLayer;
      return String(a.title).localeCompare(String(b.title), "ru");
    });

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4" onClick={onClose}>
      <section
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/20 bg-slate-950/95 p-4 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-bold">Магазин</h3>
          <div className="inline-flex items-center gap-1 rounded-full border border-amber-300/45 bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-100">
            <span>⭐</span>
            <span>{state?.balance ?? 0}</span>
          </div>
        </div>

        <div className="mt-4 max-h-[68vh] space-y-4 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(56,189,248,0.75)_rgba(255,255,255,0.12)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gradient-to-b [&::-webkit-scrollbar-thumb]:from-cyan-400/90 [&::-webkit-scrollbar-thumb]:via-sky-500/90 [&::-webkit-scrollbar-thumb]:to-indigo-500/90">
          <div className="rounded-xl border border-white/15 bg-black/30 p-3">
            <p className="mb-2 text-sm font-semibold text-white/90">Скины талисманов</p>
            <div className="grid gap-2 sm:grid-cols-2 sm:auto-rows-fr">
              {skins.map((item) => {
                const isOwned = owned.has(item.id);
                const isEquipped =
                  (item.mascotKind === "cat" && equipped.catSkin === item.id) ||
                  (item.mascotKind === "dog" && equipped.dogSkin === item.id);
                const actionBusy = busyId === item.id || busyId === `${targetLabel(item)}:${item.id}`;
                return (
                  <div key={item.id} className="flex h-full flex-col rounded-lg border border-white/15 bg-white/5 p-3">
                    <SkinPreview item={item} />
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-xs text-white/70">{item.description}</p>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                      <span className="text-xs text-amber-200">⭐ {item.price}</span>
                      {!isOwned ? (
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => onBuy(item.id)}
                          className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          Купить
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => onEquip(targetLabel(item), isEquipped ? null : item.id)}
                          className={`rounded-md px-3 py-1 text-xs font-semibold text-white disabled:opacity-60 ${
                            isEquipped ? "bg-slate-500" : "bg-cyan-500"
                          }`}
                        >
                          {isEquipped ? "Снять" : "Применить"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/15 bg-black/30 p-3">
            <p className="mb-2 text-sm font-semibold text-white/90">Рамки профиля</p>
            <div className="grid gap-2 sm:grid-cols-2 sm:auto-rows-fr">
              {frames.map((item) => {
                const isOwned = owned.has(item.id);
                const isEquipped = equipped.profileFrame === item.id;
                const actionBusy = busyId === item.id || busyId === `profile_frame:${item.id}`;
                return (
                  <div key={item.id} className="flex h-full flex-col rounded-lg border border-white/15 bg-white/5 p-3">
                    <FramePreview frameId={item.id} />
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-xs text-white/70">{item.description}</p>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                      <span className="text-xs text-amber-200">⭐ {item.price}</span>
                      {!isOwned ? (
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => onBuy(item.id)}
                          className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          Купить
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => onEquip("profile_frame", isEquipped ? null : item.id)}
                          className={`rounded-md px-3 py-1 text-xs font-semibold text-white disabled:opacity-60 ${
                            isEquipped ? "bg-slate-500" : "bg-cyan-500"
                          }`}
                        >
                          {isEquipped ? "Снять" : "Применить"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/15 bg-black/30 p-3">
            <p className="text-sm font-semibold text-white/90">Эффекты победы</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 sm:auto-rows-fr">
              {effects.map((item) => {
                const path = item.effectPath || "";
                const layerLabel = getVictoryEffectLayerLabel(item.effectLayer === "back" ? "back" : "front");
                const target = targetLabel(item);
                const isOwned = owned.has(item.id);
                const isEquipped =
                  (target === "victory_front" && equipped.victoryFrontEffect === item.id) ||
                  (target === "victory_back" && equipped.victoryBackEffect === item.id);
                const actionBusy = busyId === item.id || busyId === `${target}:${item.id}`;
                return (
                  <div key={item.id} className="flex h-full flex-col rounded-lg border border-white/15 bg-white/5 p-3">
                    <EffectPreview path={path} />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="font-semibold">{item.title}</p>
                      <span className="rounded-full border border-cyan-300/35 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                        {layerLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/70">{item.description}</p>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                      <span className="text-xs text-amber-200">⭐ {item.price}</span>
                      {!isOwned ? (
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => onBuy(item.id)}
                          className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          Купить
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!!actionBusy || isEquipped}
                          onClick={() => onEquip(target, item.id)}
                          className="rounded-md bg-cyan-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {isEquipped ? "Применено" : "Применить"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
