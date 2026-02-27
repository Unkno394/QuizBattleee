// contexts/ThemeContext.tsx
"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

export type WaveColor = 'blue' | 'green' | 'red' | 'yellow' | 'purple';

type ThemeContextType = {
  isDarkTheme: boolean;
  toggleTheme: () => void;
  waveColor: WaveColor;
  setWaveColor: (color: WaveColor) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('theme') !== 'light';
  });
  const [waveColor, setWaveColorState] = useState<WaveColor>(() => {
    if (typeof window === 'undefined') return 'blue';
    const savedWaveColor = localStorage.getItem('waveColor') as WaveColor | null;
    return savedWaveColor && ['blue', 'green', 'red', 'yellow', 'purple'].includes(savedWaveColor)
      ? savedWaveColor
      : 'blue';
  });

  useEffect(() => {
    if (isDarkTheme) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkTheme]);

  useEffect(() => {
    localStorage.setItem('waveColor', waveColor);
  }, [waveColor]);

  const toggleTheme = () => {
    setIsDarkTheme((prev) => !prev);
  };

  const setWaveColor = (color: WaveColor) => {
    setWaveColorState(color);
  };

  return (
    <ThemeContext.Provider value={{ isDarkTheme, toggleTheme, waveColor, setWaveColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
