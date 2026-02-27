"use client";

import { useEffect, useState } from "react";
import { getProfile } from "@/shared/api/auth";

const getStoredAccessToken = () => {
  if (typeof window === "undefined") return "";
  const raw = window.localStorage.getItem("access_token");
  if (!raw) return "";
  const token = raw.trim();
  if (!token || token === "undefined" || token === "null") return "";
  return token;
};

export function useProfileAvatar() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [coins, setCoins] = useState<number>(0);
  const [profileFrame, setProfileFrame] = useState<string | null>(null);
  const [equippedCatSkin, setEquippedCatSkin] = useState<string | null>(null);
  const [equippedDogSkin, setEquippedDogSkin] = useState<string | null>(null);
  const [equippedVictoryFrontEffect, setEquippedVictoryFrontEffect] = useState<string | null>(null);
  const [equippedVictoryBackEffect, setEquippedVictoryBackEffect] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = getStoredAccessToken();
    if (!token) {
      return;
    }

    let isCancelled = false;

    void getProfile(token)
      .then((response) => {
        if (isCancelled) return;
        setDisplayName(response.user.display_name || null);
        setAvatarUrl(response.user.avatar_url || null);
        setCoins(Number(response.user.coins || 0));
        setProfileFrame(response.user.profile_frame || null);
        setEquippedCatSkin(response.user.equipped_cat_skin || null);
        setEquippedDogSkin(response.user.equipped_dog_skin || null);
        setEquippedVictoryFrontEffect(response.user.equipped_victory_front_effect || null);
        setEquippedVictoryBackEffect(response.user.equipped_victory_back_effect || null);
      })
      .catch(() => {
        if (isCancelled) return;
        setDisplayName(null);
        setAvatarUrl(null);
        setCoins(0);
        setProfileFrame(null);
        setEquippedCatSkin(null);
        setEquippedDogSkin(null);
        setEquippedVictoryFrontEffect(null);
        setEquippedVictoryBackEffect(null);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  return {
    avatarUrl,
    displayName,
    coins,
    profileFrame,
    equippedCatSkin,
    equippedDogSkin,
    equippedVictoryFrontEffect,
    equippedVictoryBackEffect,
  };
}
