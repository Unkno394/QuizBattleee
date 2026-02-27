"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";

export type AlertType = "success" | "error" | "warning" | "info";

interface CustomAlertProps {
  message: string;
  type?: AlertType;
  duration?: number;
  onClose?: () => void;
}

export default function CustomAlert({
  message,
  type = "info",
  duration = 5000,
  onClose,
}: CustomAlertProps) {
  const [isExiting, setIsExiting] = useState(false);

  const colors = {
    success: {
      bg: "bg-gradient-to-r from-[#8B23CB]/20 to-[#A020F0]/20",
      border: "border-[#8B23CB]/40",
      text: "text-[#d0a8ff]",
      icon: "text-[#b57aff]",
      progress: "from-[#8B23CB] to-[#A020F0]",
    },
    error: {
      bg: "bg-gradient-to-r from-[#FF416C]/20 to-[#FF4B2B]/20",
      border: "border-[#FF416C]/40",
      text: "text-[#ffa8c1]",
      icon: "text-[#ff7a9d]",
      progress: "from-[#FF416C] to-[#FF4B2B]",
    },
    warning: {
      bg: "bg-gradient-to-r from-[#FF9A3D]/20 to-[#FFB347]/20",
      border: "border-[#FF9A3D]/40",
      text: "text-[#ffd9b3]",
      icon: "text-[#ffc285]",
      progress: "from-[#FF9A3D] to-[#FFB347]",
    },
    info: {
      bg: "bg-gradient-to-r from-[#7B6F9C]/20 to-[#8B23CB]/20",
      border: "border-[#7B6F9C]/40",
      text: "text-[#d0a8ff]",
      icon: "text-[#b57aff]",
      progress: "from-[#7B6F9C] to-[#8B23CB]",
    },
  };

  const iconNode = {
    success: <CircleCheck className="h-5 w-5" />,
    error: <TriangleAlert className="h-5 w-5" />,
    warning: <TriangleAlert className="h-5 w-5" />,
    info: <Info className="h-5 w-5" />,
  };

  const handleClose = useCallback(() => {
    setIsExiting(true);
    window.setTimeout(() => {
      onClose?.();
    }, 300);
  }, [onClose]);

  useEffect(() => {
    if (duration > 0 && !isExiting) {
      const timer = window.setTimeout(() => {
        handleClose();
      }, duration);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [duration, isExiting, handleClose]);

  return (
    <>
      <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex items-start justify-end p-4">
        <div
          className={`
            ${colors[type].bg}
            ${colors[type].border}
            min-w-[320px] max-w-md w-full rounded-xl border p-4
            shadow-2xl shadow-black/30 backdrop-blur-xl
            transform transition-all duration-300 ease-in-out
            ${isExiting ? "translate-x-[20px] opacity-0" : "translate-x-0 opacity-100"}
            pointer-events-auto
          `}
        >
          <div className="flex items-start gap-3">
            <div className={`${colors[type].icon} mt-0.5 flex-shrink-0`}>{iconNode[type]}</div>

            <div className="min-w-0 flex-1">
              <p className={`${colors[type].text} whitespace-pre-line text-sm font-medium leading-relaxed`}>
                {message}
              </p>
            </div>

            <button
              onClick={handleClose}
              className={`
                ${colors[type].text}
                ml-2 flex-shrink-0 rounded-lg p-1 transition-opacity hover:bg-white/10 hover:opacity-80
              `}
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {duration > 0 ? (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${colors[type].progress}`}
                style={{
                  animation: `shrink ${duration}ms linear forwards`,
                  animationPlayState: isExiting ? "paused" : "running",
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
      <style jsx global>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </>
  );
}

export function useAlert() {
  const [alertState, setAlertState] = useState<{
    message: string;
    type: AlertType;
    duration?: number;
  } | null>(null);

  const notify = useCallback((message: string, type: AlertType = "info", duration = 5000) => {
    setAlertState({
      message,
      type,
      duration,
    });
  }, []);

  const hideAlert = useCallback(() => {
    setAlertState(null);
  }, []);

  const AlertComponent = useCallback(() => {
    if (!alertState) return null;

    return (
      <CustomAlert
        message={alertState.message}
        type={alertState.type}
        duration={alertState.duration}
        onClose={hideAlert}
      />
    );
  }, [alertState, hideAlert]);

  return {
    notify,
    hideAlert,
    AlertComponent,
  };
}

export const alertService = {
  success: (message: string, duration?: number) => ({
    show: true,
    message,
    type: "success" as AlertType,
    duration,
  }),
  error: (message: string, duration?: number) => ({
    show: true,
    message,
    type: "error" as AlertType,
    duration,
  }),
  warning: (message: string, duration?: number) => ({
    show: true,
    message,
    type: "warning" as AlertType,
    duration,
  }),
  info: (message: string, duration?: number) => ({
    show: true,
    message,
    type: "info" as AlertType,
    duration,
  }),
};
