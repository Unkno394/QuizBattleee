"use client";

import type { ReactNode } from "react";

import { LottieFrame } from "@/shared/shop/LottieFrame";
import {
  profileFrameClass,
  profileFrameFxSrc,
  profileFrameFxTuning,
  type FrameTuningVariant,
} from "@/shared/shop/market";

type Props = {
  frameId?: string | null;
  children: ReactNode;
  className?: string;
  radiusClass?: string;
  innerClassName?: string;
  tuningVariant?: FrameTuningVariant;
};

export function Frame({
  frameId,
  children,
  className = "",
  radiusClass = "rounded-full",
  innerClassName = "bg-black/35 backdrop-blur-[1px] p-1",
  tuningVariant = "avatar",
}: Props) {
  const cssFrameClass = profileFrameClass(frameId);
  const forcedRadiusClass = "rounded-full";
  const fxSrc = profileFrameFxSrc(frameId);
  const fxTuning = profileFrameFxTuning(frameId, tuningVariant);
  const outerClass = [
    "relative",
    "aspect-square",
    forcedRadiusClass,
    fxSrc ? "" : cssFrameClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <div
      className={`${radiusClass} ${forcedRadiusClass} relative z-[2] h-full w-full ${innerClassName}`.trim()}
    >
      {children}
    </div>
  );

  return (
    <div className={outerClass}>
      {fxSrc ? (
        <LottieFrame
          src={fxSrc}
          thickness={fxTuning.thickness}
          overscan={fxTuning.overscan}
          scale={fxTuning.scale}
          offsetX={fxTuning.offsetX}
          offsetY={fxTuning.offsetY}
          className="z-[5]"
        />
      ) : null}
      {content}
    </div>
  );
}
