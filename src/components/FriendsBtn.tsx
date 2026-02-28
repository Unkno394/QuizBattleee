"use client";

import React, { useState, useEffect } from "react";
import { Users } from "lucide-react";
import FriendsModal from "./FriendsModal";
import { fetchApi, toBearerToken } from "@/shared/api/base";

interface FriendsBtnProps {
  token: string | null;
  className?: string;
  showLabel?: boolean;
  hasRequestsOverride?: boolean; // if provided, use this value instead of polling
  onModalClose?: () => void;
  inviteRoomId?: string | null;
  canInviteToRoom?: boolean;
  inviteDisabledReason?: string;
}

export default function FriendsBtn({
  token,
  className = "",
  showLabel = true,
  hasRequestsOverride,
  onModalClose,
  inviteRoomId = null,
  canInviteToRoom = true,
  inviteDisabledReason,
}: FriendsBtnProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasNewRequests, setHasNewRequests] = useState(false);
  const effectiveHasNew = Boolean(hasRequestsOverride) || hasNewRequests;

  const refreshRequests = React.useCallback(async () => {
    if (!token) return;
    try {
      const [friendRes, inviteRes] = await Promise.all([
        fetchApi("/api/friends/requests", {
          headers: { Authorization: toBearerToken(token) },
        }).catch(() => null),
        fetchApi("/api/rooms/invitations", {
          headers: { Authorization: toBearerToken(token) },
        }).catch(() => null),
      ]);
      const friendCount = friendRes?.ok ? ((await friendRes.json()).requests || []).length : 0;
      const inviteCount = inviteRes?.ok ? ((await inviteRes.json()).invitations || []).length : 0;
      setHasNewRequests(friendCount + inviteCount > 0);
    } catch (error) {
      console.error("Failed to check requests:", error);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    refreshRequests();
    const interval = setInterval(refreshRequests, 5000);

    return () => clearInterval(interval);
  }, [refreshRequests, token]);

  return (
    <>
      <style>{`
        @keyframes slowBlink {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
        .animate-slow-blink {
          animation: slowBlink 2s infinite;
        }
      `}</style>

      <button
        onClick={() => setIsModalOpen(true)}
        className={`relative inline-flex items-center gap-2 rounded-xl border border-white/25 bg-black/35 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10 ${className}`}
      >
        <Users className="w-5 h-5" />
        {showLabel ? <span className="hidden sm:inline">Друзья</span> : null}
        {effectiveHasNew && (
          <span className="absolute -top-2 -right-2 bg-red-500 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold animate-slow-blink">
            •
          </span>
        )}
      </button>

      <FriendsModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          onModalClose?.();
        }}
        token={token}
        inviteRoomId={inviteRoomId}
        canInviteToRoom={canInviteToRoom}
        inviteDisabledReason={inviteDisabledReason}
        onStatusChanged={() => {
          void refreshRequests();
        }}
      />
    </>
  );
}
