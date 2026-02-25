"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AnimatedBackground from "@/components/AnimatedBackground";

const QUESTION_COUNT_OPTIONS = [5, 6, 7] as const;
const INTRO_SEEN_STORAGE_KEY = "qb_intro_seen_v1";
const REGISTERED_STORAGE_KEY = "qb_registered_v1";

const generatePin = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const cryptoApi = typeof crypto !== "undefined" ? crypto : null;
  const bytes = new Uint8Array(6);
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
};

const questionCountLabel = (count: number) => {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} вопрос`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} вопроса`;
  }
  return `${count} вопросов`;
};

export default function HomePage() {
  const router = useRouter();

  const [topic, setTopic] = useState("Общая эрудиция");
  const [questionCount, setQuestionCount] = useState(5);
  const [isQuestionCountOpen, setIsQuestionCountOpen] = useState(false);
  const [hostName, setHostName] = useState("Ведущий");
  const questionCountDropdownRef = useRef<HTMLDivElement | null>(null);

  const [joinPin, setJoinPin] = useState("");
  const [joinName, setJoinName] = useState("");
  const [isClientReady, setIsClientReady] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [isRulesExpanded, setIsRulesExpanded] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  const isJoinDisabled = useMemo(
    () => joinPin.trim().length < 4 || joinName.trim().length < 2,
    [joinName, joinPin]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const introSeen = window.localStorage.getItem(INTRO_SEEN_STORAGE_KEY) === "1";
    const registered = window.localStorage.getItem(REGISTERED_STORAGE_KEY) === "1";
    const frameId = window.requestAnimationFrame(() => {
      setShowIntro(!introSeen);
      setIsRegistered(registered);
      setIsClientReady(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!questionCountDropdownRef.current?.contains(target)) {
        setIsQuestionCountOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsQuestionCountOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleCreate = () => {
    const pin = generatePin();
    const params = new URLSearchParams({
      host: "1",
      name: (hostName.trim() || "Ведущий").slice(0, 24),
      topic: topic.trim() || "Общая эрудиция",
      count: String(Math.max(5, Math.min(7, questionCount))),
    });
    router.push(`/room/${pin}?${params.toString()}`);
  };

  const handleJoin = () => {
    const pin = joinPin
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    if (!pin) return;

    const params = new URLSearchParams({
      name: joinName.trim().slice(0, 24),
    });
    router.push(`/room/${pin}?${params.toString()}`);
  };

  const markIntroSeen = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INTRO_SEEN_STORAGE_KEY, "1");
    }
    setShowIntro(false);
  };

  const markAsRegistered = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(REGISTERED_STORAGE_KEY, "1");
    }
    setIsRegistered(true);
  };

  const handleContinueWithoutRegistration = () => {
    markIntroSeen();
  };

  const handleRegister = () => {
    markIntroSeen();
    markAsRegistered();
    router.push("/profile?returnTo=/");
  };

  const handleAuthLinkClick = () => {
    markIntroSeen();
    markAsRegistered();
  };

  if (!isClientReady) {
    return (
      <main className="relative min-h-screen overflow-hidden text-white">
        <AnimatedBackground className="fixed inset-0 -z-10 h-full w-full" />
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <AnimatedBackground className="fixed inset-0 -z-10 h-full w-full" />

      {showIntro ? (
        <div className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-8 sm:px-6 lg:px-8">
          <section className="w-full rounded-3xl border border-white/20 bg-black/45 p-6 backdrop-blur-md sm:p-8">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">QuizBattle</h1>
            <p className="mt-3 text-base text-white/80 sm:text-lg">
              Платформа для динамичных командных квиз-баталий в реальном времени.
              Ведущий запускает игру, участники делятся на два сектора и соревнуются за победу по знаниям и скорости.
            </p>

            <div className="mt-6 rounded-2xl border border-white/20 bg-white/5">
              <button
                type="button"
                onClick={() => setIsRulesExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-white/90 transition hover:bg-white/5 sm:px-5 sm:py-4 sm:text-base"
              >
                <span>Правила игры</span>
                <svg
                  className={`h-5 w-5 text-white/70 transition-transform ${isRulesExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isRulesExpanded ? (
                <div className="border-t border-white/10 px-4 pb-4 pt-3 text-sm text-white/80 sm:px-5 sm:text-base">
                  <ul className="space-y-2">
                    <li>1. Ведущий создаёт комнату, выбирает тему и число вопросов.</li>
                    <li>2. Участники заходят по PIN и ждут распределения на синий/красный сектор.</li>
                    <li>3. После старта проходят этапы: выбор капитана, выбор названия, ответы на вопросы.</li>
                    <li>4. Отвечает капитан активного сектора, система считает баллы и скорость.</li>
                    <li>5. В финале показывается победитель, статистика и результаты обеих команд.</li>
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleContinueWithoutRegistration}
                className="w-full rounded-xl border border-white/30 bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/20 sm:w-auto"
              >
                Продолжить без регистрации
              </button>
              <button
                type="button"
                onClick={handleRegister}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 px-4 py-3 font-semibold text-white shadow-lg shadow-sky-900/25 transition hover:brightness-110 sm:w-auto"
              >
                Зарегистрироваться
              </button>
            </div>
          </section>
        </div>
      ) : (
        <>
          {isRegistered ? (
            <Link
              href="/profile"
              className="absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-xl border border-white/25 bg-black/35 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10 sm:right-6 sm:top-6 lg:right-8 lg:top-8"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z"
                  />
                </svg>
              </span>
              <span>Профиль</span>
            </Link>
          ) : (
            <Link
              href="/profile?returnTo=/"
              onClick={handleAuthLinkClick}
              className="absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30 sm:right-6 sm:top-6 lg:right-8 lg:top-8"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-300/25">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 11V7a4 4 0 10-8 0v4m-2 0h12a2 2 0 012 2v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5a2 2 0 012-2z"
                  />
                </svg>
              </span>
              <span>Зарегистрироваться / Войти</span>
            </Link>
          )}

          <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8 text-center">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">QuizBattle</h1>
              <p className="mt-2 text-sm text-white/70 sm:text-base">
                Два экрана: Главная и Комната. Серверный таймер, команды A/B, live-синхронизация.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <section className="flex h-full flex-col rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
                <h2 className="text-2xl font-semibold">Создать битву</h2>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-sm text-white/80">Тема</span>
                    <input
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Например: Космос"
                      className="w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 outline-none transition focus:border-white/50"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm text-white/80">Имя ведущего</span>
                    <input
                      value={hostName}
                      onChange={(e) => setHostName(e.target.value)}
                      placeholder="Ведущий"
                      className="w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 outline-none transition focus:border-white/50"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm text-white/80">Количество вопросов</span>
                    <div className="relative" ref={questionCountDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsQuestionCountOpen((prev) => !prev)}
                        className="flex w-full items-center justify-between rounded-xl border border-cyan-300/35 bg-gradient-to-br from-white/15 to-white/5 px-3 py-2 text-left text-white shadow-[0_8px_30px_rgba(14,116,144,0.2)] outline-none transition hover:border-cyan-200/60 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                        aria-haspopup="listbox"
                        aria-expanded={isQuestionCountOpen}
                      >
                        <span className="font-medium">{questionCountLabel(questionCount)}</span>
                        <svg
                          className={`h-4 w-4 text-cyan-200 transition-transform ${isQuestionCountOpen ? "rotate-180" : ""}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.512a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>

                      {isQuestionCountOpen ? (
                        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/25 bg-slate-950/95 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
                          <ul className="py-1" role="listbox">
                            {QUESTION_COUNT_OPTIONS.map((value) => {
                              const selected = questionCount === value;
                              return (
                                <li key={value}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQuestionCount(value);
                                      setIsQuestionCountOpen(false);
                                    }}
                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                                      selected
                                        ? "bg-cyan-500/20 text-cyan-100"
                                        : "text-white/90 hover:bg-white/10"
                                    }`}
                                  >
                                    <span>{questionCountLabel(value)}</span>
                                    <span
                                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition ${
                                        selected
                                          ? "bg-gradient-to-br from-cyan-300/40 to-sky-400/30 text-cyan-100 ring-1 ring-cyan-200/60"
                                          : "border border-white/20 text-transparent"
                                      }`}
                                    >
                                      <svg
                                        className="h-3 w-3"
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                        aria-hidden="true"
                                      >
                                        <path
                                          d="M3.5 8.5L6.5 11.2L12.5 4.8"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </label>
                </div>

                <div className="mt-auto pt-5">
                  <button
                    onClick={handleCreate}
                    className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-400"
                  >
                    Создать битву
                  </button>
                </div>
              </section>

              <section className="flex h-full flex-col rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
                <h2 className="text-2xl font-semibold">Присоединиться</h2>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-sm text-white/80">Введите PIN</span>
                    <input
                      value={joinPin}
                      onChange={(e) => setJoinPin(e.target.value.toUpperCase())}
                      placeholder="Например: AB12CD"
                      className="w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 uppercase outline-none transition focus:border-white/50"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm text-white/80">Имя</span>
                    <input
                      value={joinName}
                      onChange={(e) => setJoinName(e.target.value)}
                      placeholder="Ваше имя"
                      className="w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 outline-none transition focus:border-white/50"
                    />
                  </label>
                </div>

                <button
                  onClick={handleJoin}
                  disabled={isJoinDisabled}
                  className="mt-auto w-full rounded-xl bg-blue-500 px-4 py-3 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Войти
                </button>
              </section>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
