"use client";

import React from "react";
import { Check, X } from "lucide-react";

export interface InvitationNotification {
  id: string;
  type: "invitation-request" | "invitation-response";
  title: string;
  message: string;
  inviterName?: string;
  accepted?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  timeout?: number;
}

interface InvitationModalProps {
  notification: InvitationNotification | null;
  onClose: () => void;
}

export default function InvitationModal({
  notification,
  onClose,
}: InvitationModalProps) {
  if (!notification) return null;

  const isRequest = notification.type === "invitation-request";
  const isResponse = notification.type === "invitation-response";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 pointer-events-auto">
      <div className="bg-gradient-to-b from-purple-900 to-indigo-900 border-2 border-purple-400 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in fade-in scale-95 duration-300">
        {/* Title */}
        <h3 className="text-2xl font-bold text-white mb-4 text-center">
          {notification.title}
        </h3>

        {/* Message */}
        <p className="text-white/80 text-center mb-6">{notification.message}</p>

        {/* Content based on type */}
        {isRequest && (
          <div className="bg-white/10 rounded-xl p-4 mb-6 border border-white/20">
            <p className="text-white text-center">
              <span className="font-semibold">{notification.inviterName}</span>{" "}
              приглашает вас в комнату
            </p>
          </div>
        )}

        {isResponse && (
          <div
            className={`bg-white/10 rounded-xl p-4 mb-6 border ${
              notification.accepted
                ? "border-green-400/50 bg-green-400/10"
                : "border-red-400/50 bg-red-400/10"
            }`}
          >
            <p className="text-white text-center">
              {notification.accepted
                ? "✅ Приглашение принято!"
                : "❌ Приглашение отклонено"}
            </p>
          </div>
        )}

        {/* Buttons */}
        {isRequest && (
          <div className="flex gap-3">
            <button
              onClick={() => {
                notification.onAccept?.();
                onClose();
              }}
              className="flex-1 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Принять
            </button>
            <button
              onClick={() => {
                notification.onReject?.();
                onClose();
              }}
              className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" />
              Отклонить
            </button>
          </div>
        )}

        {isResponse && (
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-bold transition-colors"
          >
            Закрыть
          </button>
        )}
      </div>
    </div>
  );
}
