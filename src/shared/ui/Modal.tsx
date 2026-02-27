"use client";

import { useState } from "react";

import { resendVerificationCode, verifyEmail } from "@/shared/api/auth";

interface ModalProps {
  email: string;
  onVerified?: () => void;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

export default function Modal({ email, onVerified }: ModalProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const handleVerify = async () => {
    const normalized = code.trim();
    if (!normalized) {
      setError("Введите код из письма");
      return;
    }

    setError("");
    setSuccess("");
    setVerifyLoading(true);
    try {
      await verifyEmail(email, normalized);
      setSuccess("Почта подтверждена. Теперь можно войти.");
      onVerified?.();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Не удалось подтвердить почту"));
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setSuccess("");
    setResendLoading(true);
    try {
      await resendVerificationCode(email);
      setSuccess("Новый код отправлен на почту.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Не удалось отправить код повторно"));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-md rounded-2xl border border-white/20 bg-[#0f1c3f] p-6 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-xl font-semibold">Подтверждение почты</h3>
        <p className="mt-3 text-sm text-white/80">
          Мы отправили код подтверждения на <span className="font-semibold text-white">{email}</span>.
          Введите код ниже.
        </p>
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Код из письма"
          className="mt-4 w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300"
        />
        {error ? (
          <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
            {success}
          </p>
        ) : null}
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifyLoading}
            className="rounded-xl bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {verifyLoading ? "Проверка..." : "Подтвердить"}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendLoading}
            className="rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resendLoading ? "Отправка..." : "Отправить код снова"}
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-white/60">
          Регистрация завершится после успешного подтверждения кода.
        </p>
      </div>
    </div>
  );
}
