"use client";

import React, { useState, useEffect } from "react";
import { Heart, Send, X } from "lucide-react";
import { fetchApi, toBearerToken } from "@/shared/api/base";

interface Friend {
  id: number;
  display_name: string;
  avatar_url?: string;
}

interface RoomInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  token: string | null;
  isHost: boolean;
  isPasswordProtected: boolean;
}

export default function RoomInviteModal({
  isOpen,
  onClose,
  roomId,
  token,
  isHost,
  isPasswordProtected,
}: RoomInviteModalProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isOpen && token) {
      loadFriends();
    }
  }, [isOpen, token]);

  const loadFriends = async () => {
    if (!token) return;
    setLoading(true);

    try {
      const res = await fetchApi("/api/friends", {
        headers: { Authorization: toBearerToken(token) },
      });
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
      }
    } catch (error) {
      console.error("Failed to load friends:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!selectedFriend || !token) return;

    try {
      const res = await fetchApi("/api/rooms/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: toBearerToken(token),
        },
        body: JSON.stringify({
          friend_id: selectedFriend,
          room_id: roomId,
        }),
      });

      if (res.ok) {
        setMessage("Приглашение отправлено!");
        setTimeout(() => {
          setSelectedFriend(null);
          setMessage("");
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to send invite:", error);
      if (error instanceof Error && /failed to fetch|networkerror/i.test(error.message)) {
        setMessage("Нет соединения с сервером (порт 3001)");
      } else {
        setMessage("Ошибка при отправке приглашения");
      }
    }
  };

  if (!isOpen) return null;

  // Only host can invite in password-protected rooms
  if (isPasswordProtected && !isHost) {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-gradient-to-b from-purple-900/80 to-indigo-900/80 backdrop-blur-md border border-purple-400/30 rounded-2xl p-6 w-full max-w-md">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Heart className="w-6 h-6 text-pink-400" /> Приглашение
            </h2>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-white/80">
            Только ведущий может приглашать друзей в защищенные паролем комнаты.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gradient-to-b from-purple-900/80 to-indigo-900/80 backdrop-blur-md border border-purple-400/30 rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Heart className="w-6 h-6 text-pink-400" /> Пригласить друга
          </h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {message && (
          <div
            className={`mb-4 p-3 rounded-lg text-center text-white ${
              message.includes("Ошибка")
                ? "bg-red-500/30 border border-red-500/50"
                : "bg-green-500/30 border border-green-500/50"
            }`}
          >
            {message}
          </div>
        )}

        {loading ? (
          <p className="text-white/60 text-center">Загрузка друзей...</p>
        ) : friends.length === 0 ? (
          <p className="text-white/60 text-center">У вас еще нет друзей</p>
        ) : (
          <div className="space-y-3">
            {friends.map((friend) => (
              <button
                key={friend.id}
                onClick={() => setSelectedFriend(friend.id)}
                className={`w-full p-3 rounded-lg transition-all text-left flex items-center gap-3 ${
                  selectedFriend === friend.id
                    ? "bg-pink-500 border border-pink-400"
                    : "bg-white/10 border border-white/20 hover:bg-white/15"
                }`}
              >
                {friend.avatar_url && (
                  <img
                    src={friend.avatar_url}
                    alt={friend.display_name}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <p className="text-white font-semibold flex-1">
                  {friend.display_name}
                </p>
                {selectedFriend === friend.id && (
                  <div className="w-5 h-5 rounded-full bg-white" />
                )}
              </button>
            ))}

            <button
              onClick={handleInvite}
              disabled={selectedFriend === null}
              className="w-full mt-4 px-4 py-2 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              Отправить приглашение
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
