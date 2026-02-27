"use client";

import React, { useState, useEffect } from "react";
import { Heart, UserPlus, Check, X, Bell } from "lucide-react";

interface Friend {
  id: number;
  display_name: string;
  avatar_url?: string;
  equipped_cat_skin?: string;
  equipped_dog_skin?: string;
  preferred_mascot?: string;
}

interface FriendRequest {
  id: number;
  requester_id: number;
  display_name: string;
  avatar_url?: string;
  created_at?: string;
}

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
}

export default function FriendsModal({ isOpen, onClose, token }: FriendsModalProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const [newFriendId, setNewFriendId] = useState("");
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadFriendsAndRequests();
    }
  }, [isOpen, token]);

  const loadFriendsAndRequests = async () => {
    if (!token) return;
    setLoading(true);

    try {
      const friendsRes = await fetch("/api/friends", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (friendsRes.ok) {
        const data = await friendsRes.json();
        setFriends(data.friends || []);
      }

      const requestsRes = await fetch("/api/friends/requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (requestsRes.ok) {
        const data = await requestsRes.json();
        setFriendRequests(data.requests || []);
      }
    } catch (error) {
      console.error("Failed to load friends:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFriendId || !token) return;

    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ friend_id: parseInt(newFriendId) }),
      });

      if (res.ok) {
        setNewFriendId("");
        setSearchError("");
        loadFriendsAndRequests();
      } else {
        const error = await res.json();
        setSearchError(error.detail || "Ошибка при отправке запроса");
      }
    } catch (error) {
      setSearchError("Ошибка при отправке запроса");
    }
  };

  const handleRespondToRequest = async (requester_id: number, accept: boolean) => {
    if (!token) return;

    try {
      await fetch("/api/friends/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requester_id,
          accept,
        }),
      });
      loadFriendsAndRequests();
    } catch (error) {
      console.error("Failed to respond to request:", error);
    }
  };

  const handleRemoveFriend = async (friendId: number) => {
    if (!token) return;

    try {
      await fetch(`/api/friends/${friendId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      loadFriendsAndRequests();
    } catch (error) {
      console.error("Failed to remove friend:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gradient-to-b from-purple-900/80 to-indigo-900/80 backdrop-blur-md border border-purple-400/30 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Heart className="w-6 h-6 text-pink-400" /> Друзья
          </h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("friends")}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              tab === "friends"
                ? "bg-pink-500 text-white"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            Друзья ({friends.length})
          </button>
          <button
            onClick={() => setTab("requests")}
            className={`px-4 py-2 rounded-lg font-semibold transition-all relative ${
              tab === "requests"
                ? "bg-pink-500 text-white"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            Заявки
            {friendRequests.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                {friendRequests.length}
              </span>
            )}
          </button>
        </div>

        {loading ? (
          <div className="text-white text-center py-8">Загрузка...</div>
        ) : tab === "friends" ? (
          <div className="space-y-4">
            {/* Add Friend Form */}
            <form onSubmit={handleAddFriend} className="bg-white/10 rounded-lg p-4 mb-6">
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="ID друга"
                  value={newFriendId}
                  onChange={(e) => setNewFriendId(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-white/20 border border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-pink-400"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Добавить
                </button>
              </div>
              {searchError && (
                <p className="text-red-400 text-sm mt-2">{searchError}</p>
              )}
            </form>

            {/* Friends List */}
            {friends.length === 0 ? (
              <p className="text-white/60 text-center py-8">У вас еще нет друзей</p>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.id}
                  className="bg-white/10 rounded-lg p-4 flex items-center justify-between hover:bg-white/15 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {friend.avatar_url && (
                      <img
                        src={friend.avatar_url}
                        alt={friend.display_name}
                        className="w-10 h-10 rounded-full"
                      />
                    )}
                    <div>
                      <p className="text-white font-semibold">
                        {friend.display_name}
                      </p>
                      <p className="text-white/50 text-sm">ID: {friend.id}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFriend(friend.id)}
                    className="text-red-400 hover:text-red-300 transition-colors p-2"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {friendRequests.length === 0 ? (
              <p className="text-white/60 text-center py-8">Нет новых заявок</p>
            ) : (
              friendRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {req.avatar_url && (
                      <img
                        src={req.avatar_url}
                        alt={req.display_name}
                        className="w-10 h-10 rounded-full"
                      />
                    )}
                    <div>
                      <p className="text-white font-semibold">
                        {req.display_name}
                      </p>
                      <p className="text-white/50 text-sm">
                        {req.created_at
                          ? new Date(req.created_at).toLocaleDateString("ru-RU")
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        handleRespondToRequest(req.requester_id, true)
                      }
                      className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        handleRespondToRequest(req.requester_id, false)
                      }
                      className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
