import { AVATAR_JPEG_QUALITY, AVATAR_MAX_DIMENSION } from "./constants";

export const validatePasswordPolicy = (password: string): string | null => {
  if (password.length < 8) {
    return "Пароль должен содержать минимум 8 символов";
  }
  if (!/[A-Za-z]/.test(password)) {
    return "Пароль должен содержать хотя бы одну английскую букву";
  }
  return null;
};

export const formatCreatedAt = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export const formatLastLogin = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return `сегодня в ${date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return `${date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })} в ${date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

export const compressAvatarToDataUrl = async (file: File): Promise<string> => {
  const imageBitmap = await createImageBitmap(file);
  const width = imageBitmap.width;
  const height = imageBitmap.height;

  const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось подготовить изображение");
  }

  context.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
  imageBitmap.close();

  return canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY);
};
