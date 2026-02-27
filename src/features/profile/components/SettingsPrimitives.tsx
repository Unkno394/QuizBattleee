"use client";

import type { ReactNode } from "react";

import type { WaveColor } from "@/contexts/ThemeContext";

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-md">
      <h2 className="mb-4 text-xl font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}

export function SettingItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-2 border-b border-white/10 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="min-w-[170px] text-sm font-medium text-white/90 sm:text-base">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function WaveColorSelector({
  currentColor,
  onColorChange,
}: {
  currentColor: WaveColor;
  onColorChange: (color: WaveColor) => void;
}) {
  const colors: { color: WaveColor; name: string; bgClass: string }[] = [
    { color: "blue", name: "Синий", bgClass: "bg-blue-500" },
    { color: "green", name: "Зелёный", bgClass: "bg-green-500" },
    { color: "red", name: "Красный", bgClass: "bg-red-500" },
    { color: "yellow", name: "Жёлтый", bgClass: "bg-yellow-500" },
    { color: "purple", name: "Фиолетовый", bgClass: "bg-purple-500" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {colors.map(({ color, name, bgClass }) => (
        <button
          key={color}
          onClick={() => onColorChange(color)}
          className={`h-8 w-8 rounded-full ${bgClass} border-2 transition-all duration-200 ${
            currentColor === color
              ? "scale-110 border-white shadow-lg"
              : "border-transparent hover:scale-105"
          }`}
          title={name}
        />
      ))}
    </div>
  );
}

export const getWaveColorClass = (color: WaveColor) => {
  switch (color) {
    case "blue":
      return "from-blue-400 to-blue-600";
    case "green":
      return "from-green-400 to-green-600";
    case "red":
      return "from-red-400 to-red-600";
    case "yellow":
      return "from-yellow-400 to-yellow-600";
    case "purple":
      return "from-purple-400 to-purple-600";
    default:
      return "from-blue-400 to-blue-600";
  }
};
