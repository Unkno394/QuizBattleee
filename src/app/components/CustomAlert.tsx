"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";

export type AlertType = "success" | "error" | "warning" | "info";
export type AlertAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

interface CustomAlertProps {
  message: string;
  type?: AlertType;
  duration?: number;
  onClose?: () => void;
  action?: AlertAction;
}

export default function CustomAlert({
  message,
  type = "info",
  duration = 5000,
  onClose,
  action,
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

  const handleActionClick = useCallback(() => {
    try {
      action?.onClick?.();
      if (!action?.onClick && action?.href && typeof window !== "undefined") {
        window.location.href = action.href;
      }
    } finally {
      handleClose();
    }
  }, [action, handleClose]);

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
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[9999] flex items-end justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:justify-end sm:px-0 sm:pb-0">
        <div
          className={`
            ${colors[type].bg}
            ${colors[type].border}
            w-full max-w-[min(100vw-1.5rem,28rem)] rounded-2xl border p-3.5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:min-w-[320px] sm:p-4
            shadow-2xl shadow-black/30 backdrop-blur-xl
            transform transition-all duration-300 ease-in-out
            ${isExiting ? "translate-y-3 opacity-0 sm:translate-x-[20px] sm:translate-y-0" : "translate-y-0 opacity-100"}
            pointer-events-auto
          `}
        >
          <div className="flex items-start gap-2.5 sm:gap-3">
            <div className={`${colors[type].icon} mt-0.5 flex-shrink-0`}>{iconNode[type]}</div>

            <div className="min-w-0 flex-1">
              <p className={`${colors[type].text} whitespace-pre-line text-[13px] font-medium leading-relaxed sm:text-sm`}>
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

          {action?.label ? (
            <div className="mt-3 flex items-center justify-stretch sm:justify-end">
              <button
                type="button"
                onClick={handleActionClick}
                className="w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 sm:w-auto sm:rounded-lg sm:py-1.5"
              >
                {action.label}
              </button>
            </div>
          ) : null}

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
    action?: AlertAction;
  } | null>(null);

  const notify = useCallback((
    message: string,
    type: AlertType = "info",
    duration = 5000,
    action?: AlertAction
  ) => {
    setAlertState({
      message,
      type,
      duration,
      action,
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
        action={alertState.action}
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
