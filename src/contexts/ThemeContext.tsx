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
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const [waveColor, setWaveColorState] = useState<WaveColor>('blue');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Проверяем сохраненную тему в localStorage при загрузке
    const savedTheme = localStorage.getItem('theme');
    const savedWaveColor = localStorage.getItem('waveColor') as WaveColor;
    
    if (savedTheme === 'light') {
      setIsDarkTheme(false);
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      setIsDarkTheme(true);
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
    
    if (savedWaveColor && ['blue', 'green', 'red', 'yellow', 'purple'].includes(savedWaveColor)) {
      setWaveColorState(savedWaveColor);
    }
    
    setIsInitialized(true);
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDarkTheme;
    setIsDarkTheme(newTheme);
    
    if (newTheme) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const setWaveColor = (color: WaveColor) => {
    setWaveColorState(color);
    localStorage.setItem('waveColor', color);
  };

  // Не рендерим до инициализации темы
  if (!isInitialized) {
    return null;
  }

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
