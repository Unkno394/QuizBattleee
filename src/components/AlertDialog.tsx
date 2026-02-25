// components/AlertDialog.tsx
"use client";

import { useState, useEffect } from "react";

interface AlertDialogProps {
  trigger?: React.ReactNode;
  title: string;
  description: string;
  cancelText?: string;
  confirmText?: string;
  confirmColor?: "red" | "blue" | "green" | "yellow" | "purple";
  onConfirm: () => void;
  onCancel?: () => void;
  maxWidth?: string;
  isOpen?: boolean;
}

export default function AlertDialog({
  trigger,
  title,
  description,
  cancelText = "Отмена",
  confirmText = "Подтвердить",
  confirmColor = "red",
  onConfirm,
  onCancel,
  maxWidth = "450px",
  isOpen = false
}: AlertDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(isOpen);

  // Синхронизируем внутреннее состояние с пропсом isOpen
  useEffect(() => {
    setInternalIsOpen(isOpen);
  }, [isOpen]);

  const handleOpen = () => setInternalIsOpen(true);
  const handleClose = () => {
    setInternalIsOpen(false);
    onCancel?.();
  };

  const handleConfirm = () => {
    onConfirm();
    setInternalIsOpen(false);
  };

  // Закрытие по ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && internalIsOpen) {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [internalIsOpen]);

  const getConfirmButtonClass = () => {
    const baseClass = "px-4 py-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50";
    
    switch (confirmColor) {
      case 'red':
        return `${baseClass} bg-red-500 hover:bg-red-600 text-white`;
      case 'blue':
        return `${baseClass} bg-blue-500 hover:bg-blue-600 text-white`;
      case 'green':
        return `${baseClass} bg-green-500 hover:bg-green-600 text-white`;
      case 'yellow':
        return `${baseClass} bg-yellow-500 hover:bg-yellow-600 text-white`;
      case 'purple':
        return `${baseClass} bg-purple-500 hover:bg-purple-600 text-white`;
      default:
        return `${baseClass} bg-red-500 hover:bg-red-600 text-white`;
    }
  };

  // Клик по оверлею
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <>
      {/* Trigger - отображаем только если передан trigger и диалог не контролируется извне */}
      {trigger && !isOpen && (
        <div onClick={handleOpen} className="inline-block">
          {trigger}
        </div>
      )}

      {/* Overlay */}
      {internalIsOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleOverlayClick}
        >
          {/* Dialog Content */}
          <div 
            className="bg-gray-900/95 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl w-full max-w-full overflow-hidden"
            style={{ maxWidth }}
          >
            <div className="p-6">
              {/* Title */}
              <h2 className="text-xl font-semibold text-white mb-2">
                {title}
              </h2>
              
              {/* Description */}
              <p className="text-white/70 text-sm mb-6 leading-relaxed">
                {description}
              </p>

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                {cancelText && (
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 rounded-lg font-medium bg-white/10 hover:bg-white/20 text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50"
                  >
                    {cancelText}
                  </button>
                )}
                <button
                  onClick={handleConfirm}
                  className={getConfirmButtonClass()}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}