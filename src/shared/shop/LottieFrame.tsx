"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import type { DotLottie } from "@lottiefiles/dotlottie-react";

type Props = {
  src: string;
  active?: boolean;
  thickness?: number;
  overscan?: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  className?: string;
  children?: ReactNode;
};

export function LottieFrame({
  src,
  active = true,
  thickness = 10,
  overscan = 14,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
  className = "",
  children,
}: Props) {
  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);
  const restartTimeoutRef = useRef<number | null>(null);
  const activeRef = useRef(active);

  const normalizedSrc = useMemo(() => {
    try {
      return decodeURI(src).toLowerCase();
    } catch {
      return String(src || "").toLowerCase();
    }
  }, [src]);

  const isFrame2 = normalizedSrc.endsWith("/frame2.lottie") || normalizedSrc.endsWith("frame2.lottie");
  const isFrame3 = normalizedSrc.endsWith("/frame3.lottie") || normalizedSrc.endsWith("frame3.lottie");

  const frame3FilterStyle: CSSProperties | undefined = isFrame3
    ? {
        filter:
          "hue-rotate(96deg) saturate(220%) brightness(1.08) contrast(1.06) drop-shadow(0 0 8px rgba(161,0,255,0.6))",
      }
    : undefined;

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    return () => {
      if (restartTimeoutRef.current) {
        window.clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!dotLottie) return;

    if (restartTimeoutRef.current) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    const onComplete = () => {
      if (!activeRef.current || !isFrame2) return;
      if (restartTimeoutRef.current) {
        window.clearTimeout(restartTimeoutRef.current);
      }
      restartTimeoutRef.current = window.setTimeout(() => {
        if (!dotLottie || !activeRef.current) return;
        dotLottie.play();
      }, 10000);
    };

    if (isFrame2) {
      dotLottie.setLoop(false);
      dotLottie.addEventListener("complete", onComplete);
    } else {
      dotLottie.setLoop(true);
    }

    if (active) {
      dotLottie.play();
    } else {
      dotLottie.pause();
    }

    return () => {
      if (restartTimeoutRef.current) {
        window.clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      if (isFrame2) {
        dotLottie.removeEventListener("complete", onComplete);
      }
    };
  }, [active, dotLottie, isFrame2]);

  const ringMask = `radial-gradient(circle at center,
    transparent calc(50% - ${thickness}px),
    #000 calc(50% - ${thickness}px),
    #000 calc(50% + ${thickness}px),
    transparent calc(50% + ${thickness}px + 0.5px)
  )`;

  return (
    <div
      className={`absolute pointer-events-none ${className}`.trim()}
      style={{
        inset: -overscan,
        borderRadius: "9999px",
        WebkitMaskImage: ringMask,
        maskImage: ringMask,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "100% 100%",
        maskSize: "100% 100%",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
          transformOrigin: "center center",
          ...frame3FilterStyle,
        }}
      >
        <DotLottieReact
          src={src}
          loop={!isFrame2}
          autoplay={active}
          dotLottieRefCallback={setDotLottie}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      {children ? <div className="relative z-[2]">{children}</div> : null}
    </div>
  );
}
