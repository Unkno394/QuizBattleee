"use client";

import React, { useState } from "react";
import { Heart, UserPlus } from "lucide-react";

interface PlayerCardProps {
  name: string;
  avatarUrl?: string;
  mascot?: string;
  mascotSkinCat?: string;
  mascotSkinDog?: string;
  profileFrame?: string;
  onAddFriend?: () => void;
  isSelf?: boolean;
  userId?: number;
}

export default function PlayerCard({
  name,
  avatarUrl,
  mascot = "cat",
  mascotSkinCat,
  mascotSkinDog,
  profileFrame,
  onAddFriend,
  isSelf = false,
}: PlayerCardProps) {
  const [showAddFriendBtn, setShowAddFriendBtn] = useState(false);

  return (
    <div
      className="relative bg-gradient-to-br from-purple-600/40 to-indigo-600/40 backdrop-blur-sm border border-purple-400/30 rounded-xl p-4 w-full max-w-xs hover:border-purple-400/60 transition-all"
      onMouseEnter={() => setShowAddFriendBtn(true)}
      onMouseLeave={() => setShowAddFriendBtn(false)}
    >
      {/* Profile Frame Background */}
      {profileFrame && (
        <div
          className="absolute inset-0 rounded-xl opacity-20 pointer-events-none"
          style={{
            backgroundImage: `url('/market/${profileFrame}')`,
          }}
        />
      )}

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-pink-400/50 flex-shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                <span className="text-white font-bold">
                  {name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Name and Status */}
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold truncate">{name}</p>
            <p className="text-white/60 text-xs">
              {isSelf ? "Это вы" : "Игрок"}
            </p>
          </div>
        </div>

        {/* Add Friend Button */}
        {!isSelf && onAddFriend && showAddFriendBtn && (
          <button
            onClick={onAddFriend}
            className="ml-2 p-2 rounded-lg bg-pink-500 hover:bg-pink-600 text-white transition-colors flex-shrink-0"
            title="Добавить в друзья"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mascot Preview */}
      {(mascotSkinCat || mascotSkinDog) && (
        <div className="mt-3 text-center text-white/60 text-xs">
          {mascot === "cat" && mascotSkinCat ? (
            <span>🐱 Скин: {mascotSkinCat}</span>
          ) : mascot === "dog" && mascotSkinDog ? (
            <span>🐶 Скин: {mascotSkinDog}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
