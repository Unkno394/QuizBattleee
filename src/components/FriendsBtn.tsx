"use client";

import React, { useState, useEffect } from "react";
import { Heart } from "lucide-react";
import FriendsModal from "./FriendsModal";

interface FriendsBtnProps {
  token: string | null;
  className?: string;
  showLabel?: boolean;
}

export default function FriendsBtn({
  token,
  className = "",
  showLabel = true,
}: FriendsBtnProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasNewRequests, setHasNewRequests] = useState(false);

  useEffect(() => {
    if (!token) return;

    const checkForNewRequests = async () => {
      try {
        const res = await fetch("/api/friends/requests", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setHasNewRequests((data.requests || []).length > 0);
        }
      } catch (error) {
        console.error("Failed to check requests:", error);
      }
    };

    checkForNewRequests();
    const interval = setInterval(checkForNewRequests, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, [token]);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`relative px-4 py-2 rounded-lg bg-pink-500 hover:bg-pink-600 text-white font-semibold transition-all flex items-center gap-2 ${className}`}
      >
        <Heart className="w-5 h-5" />
        {showLabel && "Друзья"}
        {hasNewRequests && (
          <span className="absolute -top-2 -right-2 bg-red-500 w-5 h-5 rounded-full animate-pulse flex items-center justify-center text-white text-xs font-bold">
            •
          </span>
        )}
      </button>

      <FriendsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        token={token}
      />
    </>
  );
}
