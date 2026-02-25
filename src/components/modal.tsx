// components/JoinModal.tsx
"use client";
import { useState } from "react";

interface JoinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function JoinModal({ isOpen, onClose }: JoinModalProps) {
  const [roomId, setRoomId] = useState("");

  const handleJoin = () => {
    if (roomId.trim()) {
      // Переходим в комнату
      window.location.href = `/room/${roomId.trim()}`;
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Подключиться к встрече</h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-6">
          <label className="block text-white text-sm font-medium mb-2">
            Введите ID комнаты
          </label>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Например: ABC123XY"
            className="w-full bg-white/20 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-white/20 hover:bg-white/30 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-300"
          >
            Отмена
          </button>
          <button
            onClick={handleJoin}
            disabled={!roomId.trim()}
            className="flex-1 bg-white text-blue-600 hover:bg-blue-50 font-semibold py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Подключиться
          </button>
        </div>
      </div>
    </div>
  );
}