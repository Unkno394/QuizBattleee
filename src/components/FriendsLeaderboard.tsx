"use client";

import React, { useState, useEffect } from "react";
import { Heart, Trophy } from "lucide-react";
import { fetchApi, toBearerToken } from "@/shared/api/base";

interface FriendsLeaderboardProps {
  token: string | null;
}

interface FriendLeaderboardItem {
  id: number;
  display_name: string;
  avatar_url?: string;
  wins: number;
  profile_frame?: string;
}

export default function FriendsLeaderboard({
  token,
}: FriendsLeaderboardProps) {
  const [leaderboard, setLeaderboard] = useState<FriendLeaderboardItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      loadLeaderboard();
    }
  }, [token]);

  const loadLeaderboard = async () => {
    if (!token) return;
    setLoading(true);

    try {
      const res = await fetchApi("/api/leaderboard/friends?limit=50", {
        headers: { Authorization: toBearerToken(token) },
      });
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
      }
    } catch (error) {
      console.error("Failed to load friends leaderboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const getMedalEmoji = (place: number) => {
    if (place === 1) return "🥇";
    if (place === 2) return "🥈";
    if (place === 3) return "🥉";
    return `#${place}`;
  };

  return (
    <div className="w-full h-full bg-gradient-to-b from-purple-900/30 to-indigo-900/30 rounded-xl p-6 backdrop-blur-sm border border-purple-400/30">
      <div className="flex items-center gap-3 mb-6">
        <Heart className="w-6 h-6 text-pink-400" />
        <h2 className="text-2xl font-bold text-white">Рейтинг друзей</h2>
      </div>

      {loading ? (
        <div className="text-white/60 text-center py-8">Загрузка...</div>
      ) : leaderboard.length === 0 ? (
        <div className="text-white/60 text-center py-8">
          Добавьте друзей, чтобы увидеть их рейтинг
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {leaderboard.map((friend, index) => (
            <div
              key={friend.id}
              className={`p-4 rounded-lg flex items-center justify-between ${
                index < 3
                  ? "bg-gradient-to-r from-yellow-500/20 to-orange-500/10 border border-yellow-500/30"
                  : "bg-white/10 border border-white/20 hover:bg-white/15"
              } transition-colors`}
            >
              <div className="flex items-center gap-4 flex-1">
                <span className="text-2xl font-bold w-8 text-center">
                  {getMedalEmoji(index + 1)}
                </span>

                {friend.avatar_url && (
                  <img
                    src={friend.avatar_url}
                    alt={friend.display_name}
                    className="w-10 h-10 rounded-full"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate">
                    {friend.display_name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <span className="text-white font-bold text-lg">
                  {friend.wins}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={loadLeaderboard}
        className="w-full mt-4 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-semibold transition-colors"
      >
        Обновить
      </button>
    </div>
  );
}
