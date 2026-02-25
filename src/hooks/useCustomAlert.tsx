// hooks/useCustomAlert.tsx
"use client";

import { useState } from "react";
import AlertDialog from "../components/AlertDialog";

export function useCustomAlert() {
  const [alertData, setAlertData] = useState<{
    title: string;
    description: string;
    cancelText?: string;
    confirmText?: string;
    confirmColor?: "red" | "blue" | "green" | "yellow" | "purple";
    onConfirm?: () => void;
    onCancel?: () => void;
  } | null>(null);

  const showAlert = (
    title: string,
    description: string,
    options: {
      cancelText?: string;
      confirmText?: string;
      confirmColor?: "red" | "blue" | "green" | "yellow" | "purple";
      onConfirm?: () => void;
      onCancel?: () => void;
    } = {}
  ) => {
    setAlertData({
      title,
      description,
      cancelText: options.cancelText || "",
      confirmText: options.confirmText || "ОК",
      confirmColor: options.confirmColor || "blue",
      onConfirm: options.onConfirm,
      onCancel: options.onCancel,
    });
  };

  const showConfirm = (
    title: string,
    description: string,
    onConfirm: () => void,
    options: {
      cancelText?: string;
      confirmText?: string;
      confirmColor?: "red" | "blue" | "green" | "yellow" | "purple";
    } = {}
  ) => {
    setAlertData({
      title,
      description,
      cancelText: options.cancelText || "Отмена",
      confirmText: options.confirmText || "Подтвердить",
      confirmColor: options.confirmColor || "red",
      onConfirm,
      onCancel: () => setAlertData(null),
    });
  };

  const handleClose = () => {
    alertData?.onCancel?.();
    setAlertData(null);
  };

  const handleConfirm = () => {
    alertData?.onConfirm?.();
    setAlertData(null);
  };

  const alertComponent = alertData ? (
    <AlertDialog
      isOpen={true}
      title={alertData.title}
      description={alertData.description}
      cancelText={alertData.cancelText}
      confirmText={alertData.confirmText}
      confirmColor={alertData.confirmColor}
      onConfirm={handleConfirm}
      onCancel={handleClose}
    />
  ) : null;

  return { showAlert, showConfirm, alertComponent };
}