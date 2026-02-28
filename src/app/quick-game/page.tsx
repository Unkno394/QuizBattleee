"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Home, RotateCcw, Timer, Zap } from "lucide-react";

import AnimatedBackground from "@/components/AnimatedBackground";
import { TOPIC_OPTIONS } from "@/features/home/constants";
import { questionCountLabel } from "@/features/home/utils";
import { getStoredAccessToken } from "@/shared/api/auth";
import { fetchApi } from "@/shared/api/base";

type QuickDifficulty = "easy" | "medium" | "hard" | "progressive";
type QuestionDifficulty = "easy" | "medium" | "hard";

type QuickQuestion = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  difficulty: QuestionDifficulty;
};

type QuickAnswer = {
  questionId: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  points: number;
};

type QuestionResult = {
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  points: number;
};

const QUICK_COUNT_PRESETS = [5, 6, 7] as const;
const QUESTION_TIME_MS = 30_000;
const SCORE_BY_DIFFICULTY: Record<QuickDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  progressive: 2,
};

const DIFFICULTY_LABEL: Record<QuickDifficulty, string> = {
  easy: "Лёгкая",
  medium: "Средняя",
  hard: "Сложная",
  progressive: "По возрастанию",
};

const normalizeQuickGameCount = (value: number) => Math.max(5, Math.min(7, Number(value) || 7));

const toDifficulty = (value: unknown): QuickDifficulty => {
  const normalized = String(value || "").toLowerCase();
  if (
    normalized === "easy" ||
    normalized === "hard" ||
    normalized === "progressive"
  ) {
    return normalized;
  }
  return "medium";
};

export default function QuickGamePage() {
  const [phase, setPhase] = useState<"setup" | "playing" | "results">("setup");
  const [topicPreset, setTopicPreset] = useState<string>(TOPIC_OPTIONS[0]);
  const [isTopicOpen, setIsTopicOpen] = useState(false);
  const [customTopic, setCustomTopic] = useState("");
  const [isAiTopicUnavailable, setIsAiTopicUnavailable] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>(7);
  const [isQuestionCountOpen, setIsQuestionCountOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<QuickDifficulty>("medium");
  const [isDifficultyOpen, setIsDifficultyOpen] = useState(false);
  const [startError, setStartError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [rewardToken, setRewardToken] = useState("");
  const [rewardStatus, setRewardStatus] = useState<"idle" | "claiming" | "claimed" | "guest" | "already" | "error">(
    "idle"
  );
  const [rewardMessage, setRewardMessage] = useState("");

  const [questions, setQuestions] = useState<QuickQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answers, setAnswers] = useState<QuickAnswer[]>([]);
  const [timeLeftMs, setTimeLeftMs] = useState(QUESTION_TIME_MS);
  const [currentResult, setCurrentResult] = useState<QuestionResult | null>(null);

  const selectedIndexRef = useRef<number | null>(null);
  const topicDropdownRef = useRef<HTMLDivElement | null>(null);
  const difficultyDropdownRef = useRef<HTMLDivElement | null>(null);
  const questionCountDropdownRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!topicDropdownRef.current?.contains(target)) {
        setIsTopicOpen(false);
      }
      if (!difficultyDropdownRef.current?.contains(target)) {
        setIsDifficultyOpen(false);
      }
      if (!questionCountDropdownRef.current?.contains(target)) {
        setIsQuestionCountOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTopicOpen(false);
        setIsDifficultyOpen(false);
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

  const resolvedTopic = useMemo(() => {
    const custom = customTopic.trim();
    return (custom || topicPreset).slice(0, 80);
  }, [customTopic, topicPreset]);

  const currentQuestion = questions[currentIndex] || null;

  const closeAllLists = () => {
    setIsTopicOpen(false);
    setIsDifficultyOpen(false);
    setIsQuestionCountOpen(false);
  };

  const finalizeCurrentAnswer = useCallback(
    (answerIndex: number | null) => {
      if (phase !== "playing" || currentResult) return;
      const question = questions[currentIndex];
      if (!question) return;

      const isCorrect = answerIndex === question.correctIndex;
      const points = isCorrect ? SCORE_BY_DIFFICULTY[question.difficulty] : 0;
      setAnswers((prev) => [
        ...prev,
        {
          questionId: question.id,
          selectedIndex: answerIndex,
          isCorrect,
          points,
        },
      ]);
      setCurrentResult({
        selectedIndex: answerIndex,
        correctIndex: question.correctIndex,
        isCorrect,
        points,
      });
    },
    [currentIndex, currentResult, phase, questions]
  );

  useEffect(() => {
    if (phase !== "playing" || currentResult) return;

    const deadlineMs = Date.now() + QUESTION_TIME_MS;
    setTimeLeftMs(QUESTION_TIME_MS);

    const timerId = window.setInterval(() => {
      const remaining = Math.max(0, deadlineMs - Date.now());
      setTimeLeftMs(remaining);
      if (remaining <= 0) {
        window.clearInterval(timerId);
        finalizeCurrentAnswer(selectedIndexRef.current);
      }
    }, 100);

    return () => {
      window.clearInterval(timerId);
    };
  }, [currentIndex, currentResult, finalizeCurrentAnswer, phase]);

  const startQuickGame = useCallback(async () => {
    setStartError("");
    setIsStarting(true);
    setRewardToken("");
    setRewardStatus("idle");
    setRewardMessage("");
    try {
      const response = await fetchApi("/api/quick-game/questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: resolvedTopic || TOPIC_OPTIONS[0],
          difficulty,
          questionCount: normalizeQuickGameCount(questionCount),
        }),
      });
      if (!response.ok) {
        let message = `Не удалось запустить быструю игру (${response.status})`;
        try {
          const payload = (await response.json()) as { detail?: string };
          if (payload?.detail) {
            message = payload.detail;
          }
        } catch {
          // Ignore json parsing error and keep fallback message.
        }
        const aiUnavailable =
          response.status === 503 ||
          /нейросеть|не ответила|готового списка/i.test(message);
        if (aiUnavailable) {
          setIsAiTopicUnavailable(true);
          setCustomTopic("");
        }
        throw new Error(message);
      }
      setIsAiTopicUnavailable(false);

      const payload = (await response.json()) as {
        topic?: string;
        questions?: QuickQuestion[];
        rewardToken?: string;
      };
      const nextQuestions = Array.isArray(payload.questions) ? payload.questions : [];
      if (!nextQuestions.length) {
        throw new Error("Не удалось собрать вопросы для быстрой игры");
      }

      setQuestions(nextQuestions);
      setRewardToken(String(payload.rewardToken || ""));
      setAnswers([]);
      setCurrentIndex(0);
      setSelectedIndex(null);
      setCurrentResult(null);
      selectedIndexRef.current = null;
      setPhase("playing");
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Не удалось запустить быструю игру");
    } finally {
      setIsStarting(false);
    }
  }, [difficulty, questionCount, resolvedTopic]);

  const goToNextQuestion = () => {
    if (currentIndex >= questions.length - 1) {
      setPhase("results");
      return;
    }
    setCurrentIndex((prev) => prev + 1);
    setSelectedIndex(null);
    selectedIndexRef.current = null;
    setCurrentResult(null);
  };

  const totalPoints = useMemo(() => answers.reduce((sum, row) => sum + row.points, 0), [answers]);
  const correctCount = useMemo(() => answers.filter((row) => row.isCorrect).length, [answers]);
  const wrongCount = Math.max(0, answers.length - correctCount);
  const timerSeconds = Math.max(0, Math.ceil(timeLeftMs / 1000));
  const progressPercent = Math.max(0, Math.min(100, (timeLeftMs / QUESTION_TIME_MS) * 100));

  useEffect(() => {
    if (phase !== "results" || !rewardToken || rewardStatus !== "idle") {
      return;
    }

    let cancelled = false;

    const claimReward = async () => {
      const accessToken = getStoredAccessToken();
      if (!accessToken) {
        if (!cancelled) {
          setRewardStatus("guest");
          setRewardMessage("Награда за быструю игру начисляется только зарегистрированным игрокам.");
        }
        return;
      }

      if (!answers.length) {
        if (!cancelled) {
          setRewardStatus("already");
          setRewardMessage("Баллы не заработаны, награда не начислена.");
        }
        return;
      }

      if (!cancelled) {
        setRewardStatus("claiming");
        setRewardMessage("");
      }

      try {
        const response = await fetchApi("/api/quick-game/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: /^Bearer\s+/i.test(accessToken) ? accessToken : `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            rewardToken,
            answers: answers.map((answer) => ({
              questionId: answer.questionId,
              selectedIndex: answer.selectedIndex,
            })),
          }),
        });

        let message = `Не удалось начислить награду (${response.status})`;
        if (!response.ok) {
          try {
            const payload = (await response.json()) as { detail?: string };
            if (payload?.detail) {
              message = payload.detail;
            }
          } catch {
            // Ignore json parsing error and keep fallback message.
          }
          throw new Error(message);
        }

        const payload = (await response.json()) as {
          awarded?: boolean;
          awardedCoins?: number;
          totalPoints?: number;
        };
        if (cancelled) {
          return;
        }

        if (payload.awarded) {
          setRewardStatus("claimed");
          setRewardMessage(`Начислено ${Number(payload.awardedCoins || 0)} звёзд.`);
          return;
        }

        if (Number(payload.totalPoints || 0) <= 0) {
          setRewardStatus("already");
          setRewardMessage("Баллы не заработаны, награда не начислена.");
          return;
        }

        setRewardStatus("already");
        setRewardMessage("Награда за эту быструю игру уже была начислена.");
      } catch (error) {
        if (!cancelled) {
          setRewardStatus("error");
          setRewardMessage(error instanceof Error ? error.message : "Не удалось начислить награду");
        }
      }
    };

    void claimReward();

    return () => {
      cancelled = true;
    };
  }, [answers, phase, rewardStatus, rewardToken]);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 text-white sm:px-6 lg:px-8">
      <AnimatedBackground className="fixed inset-0 -z-10 h-full w-full" />

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-black/35 px-3 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>На главную</span>
          </Link>
          <p className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-100">
            <Zap className="h-4 w-4" />
            Быстрая игра
          </p>
        </div>

        {phase === "setup" ? (
          <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
            <h1 className="text-3xl font-bold">Настройки быстрой игры</h1>
            <p className="mt-2 text-sm text-white/75">
              Играй в одиночку без комнаты и ожидания. Запуск за 2 клика: выбрать параметры и нажать
              «Начать игру».
            </p>

            <div className="mt-5 space-y-4">
              <div className="block">
                <span className="mb-1 block text-sm text-white/80">Тема</span>
                <p className="mb-2 text-xs text-white/65">
                  Можно выбрать готовую тему или ввести свою. Для своей темы вопросы сгенерирует
                  нейросеть, а если она не ответит, останутся готовые темы из списка.
                </p>
                {isAiTopicUnavailable ? (
                  <p className="mb-3 rounded-xl border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    Упс:( наша нейросеть сейчас недоступна. Выберите тему из готового списка.
                  </p>
                ) : (
                  <input
                    value={customTopic}
                    onChange={(event) => setCustomTopic(event.target.value.slice(0, 80))}
                    placeholder="Своя тема, например: Фронтенд"
                    className="mb-3 w-full rounded-xl border border-fuchsia-300/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-fuchsia-200/60 focus:ring-2 focus:ring-fuchsia-300/30"
                  />
                )}
                <div className="relative" ref={topicDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsTopicOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-xl border border-cyan-300/35 bg-gradient-to-br from-white/15 to-white/5 px-3 py-2 text-left text-white shadow-[0_8px_30px_rgba(14,116,144,0.2)] outline-none transition hover:border-cyan-200/60 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                    aria-haspopup="listbox"
                    aria-expanded={isTopicOpen}
                  >
                    <span className="font-medium">{topicPreset}</span>
                    <svg
                      className={`h-4 w-4 text-cyan-200 transition-transform ${isTopicOpen ? "rotate-180" : ""}`}
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

                  {isTopicOpen ? (
                    <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/25 bg-slate-950/95 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
                      <ul className="py-1" role="listbox">
                        {TOPIC_OPTIONS.map((topic) => {
                          const selected = topicPreset === topic;
                          return (
                            <li key={topic}>
                              <button
                                type="button"
                                onClick={() => {
                                  setTopicPreset(topic);
                                  setIsTopicOpen(false);
                                }}
                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                                  selected
                                    ? "bg-cyan-500/20 text-cyan-100"
                                    : "text-white/90 hover:bg-white/10"
                                }`}
                              >
                                <span className="pr-2">{topic}</span>
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
              </div>

              <div className="block">
                <span className="mb-2 block text-sm text-white/80">Количество вопросов</span>
                <div className="relative" ref={questionCountDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      closeAllLists();
                      setIsQuestionCountOpen((prev) => !prev);
                    }}
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
                        {QUICK_COUNT_PRESETS.map((value) => {
                          const selected = questionCount === value;
                          return (
                            <li key={value}>
                              <button
                                type="button"
                                onClick={() => {
                                  setQuestionCount(value);
                                  closeAllLists();
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
              </div>

              <div className="block">
                <span className="mb-2 block text-sm text-white/80">Сложность</span>
                <div className="relative" ref={difficultyDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      closeAllLists();
                      setIsDifficultyOpen((prev) => !prev);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-emerald-300/35 bg-gradient-to-br from-white/15 to-white/5 px-3 py-2 text-left text-white shadow-[0_8px_30px_rgba(5,150,105,0.2)] outline-none transition hover:border-emerald-200/60 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-emerald-300/40"
                    aria-haspopup="listbox"
                    aria-expanded={isDifficultyOpen}
                  >
                    <span className="font-medium">{DIFFICULTY_LABEL[difficulty]}</span>
                    <svg
                      className={`h-4 w-4 text-emerald-200 transition-transform ${isDifficultyOpen ? "rotate-180" : ""}`}
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

                  {isDifficultyOpen ? (
                    <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/25 bg-slate-950/95 shadow-2xl shadow-emerald-950/40 backdrop-blur-xl">
                      <ul className="py-1" role="listbox">
                        {(["easy", "medium", "hard", "progressive"] as const).map((value) => {
                          const selected = difficulty === value;
                          return (
                            <li key={value}>
                              <button
                                type="button"
                                onClick={() => {
                                  setDifficulty(value);
                                  closeAllLists();
                                }}
                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                                  selected
                                    ? "bg-emerald-500/20 text-emerald-100"
                                    : "text-white/90 hover:bg-white/10"
                                }`}
                              >
                                <span>{DIFFICULTY_LABEL[value]}</span>
                                <span
                                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition ${
                                    selected
                                      ? "bg-gradient-to-br from-emerald-300/40 to-green-400/30 text-emerald-100 ring-1 ring-emerald-200/60"
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
              </div>
            </div>

            {startError ? <p className="mt-4 text-sm text-rose-300">{startError}</p> : null}

            <button
              type="button"
              onClick={() => {
                void startQuickGame();
              }}
              disabled={isStarting}
              className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStarting ? "Запускаем..." : "Начать игру"}
            </button>
          </section>
        ) : null}

        {phase === "playing" && currentQuestion ? (
          <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-sm text-white/75">
                Вопрос {currentIndex + 1} / {questions.length} • {DIFFICULTY_LABEL[currentQuestion.difficulty]}
              </p>
              <p className="inline-flex items-center gap-2 rounded-lg border border-amber-300/45 bg-amber-500/20 px-2.5 py-1 text-sm font-semibold text-amber-100">
                <Timer className="h-4 w-4" />
                {timerSeconds} c
              </p>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-[width] duration-100"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <h2 className="mt-4 text-xl font-semibold sm:text-2xl">{currentQuestion.text}</h2>

            <div className="mt-4 grid gap-2">
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedIndex === index;
                const isCorrect = currentResult?.correctIndex === index;
                const selectedWrong =
                  currentResult?.selectedIndex === index && currentResult?.selectedIndex !== currentResult.correctIndex;
                const locked = !!currentResult;

                return (
                  <button
                    key={`${currentQuestion.id}-${index}`}
                    type="button"
                    disabled={locked}
                    onClick={() => setSelectedIndex(index)}
                    className={`rounded-xl border px-3 py-3 text-left text-sm transition sm:text-base ${
                      isCorrect
                        ? "border-emerald-300/70 bg-emerald-500/25 text-emerald-100"
                        : selectedWrong
                        ? "border-rose-300/70 bg-rose-500/25 text-rose-100"
                        : isSelected
                        ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
                        : "border-white/20 bg-white/10 text-white/90 hover:bg-white/15"
                    } ${locked ? "cursor-default" : ""}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {currentResult ? (
              <div className="mt-5 rounded-xl border border-white/20 bg-white/5 p-3">
                <p className={`text-sm font-semibold ${currentResult.isCorrect ? "text-emerald-300" : "text-rose-300"}`}>
                  {currentResult.isCorrect ? "Правильно!" : "Неправильно"}
                </p>
                <p className="mt-1 text-sm text-white/75">
                  +{currentResult.points} балл(ов) за вопрос
                </p>
                <button
                  type="button"
                  onClick={goToNextQuestion}
                  className="mt-3 w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-400"
                >
                  {currentIndex >= questions.length - 1 ? "Смотреть результат" : "Следующий вопрос"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => finalizeCurrentAnswer(selectedIndexRef.current)}
                disabled={selectedIndex === null}
                className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ответить
              </button>
            )}
          </section>
        ) : null}

        {phase === "results" ? (
          <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
            <h2 className="text-3xl font-bold">Результат</h2>
            <p className="mt-2 text-sm text-white/75">
              Тема: <span className="font-semibold text-white/95">{resolvedTopic || TOPIC_OPTIONS[0]}</span>
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-amber-300/40 bg-amber-500/20 p-3">
                <p className="text-xs uppercase tracking-wide text-amber-100/80">Общие баллы</p>
                <p className="mt-1 text-2xl font-bold text-amber-100">{totalPoints}</p>
              </div>
              <div className="rounded-xl border border-cyan-300/40 bg-cyan-500/20 p-3">
                <p className="text-xs uppercase tracking-wide text-cyan-100/80">Награда</p>
                <p className="mt-1 text-2xl font-bold text-cyan-100">+{totalPoints}</p>
              </div>
              <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/20 p-3">
                <p className="text-xs uppercase tracking-wide text-emerald-100/80">Правильных</p>
                <p className="mt-1 text-2xl font-bold text-emerald-100">{correctCount}</p>
              </div>
              <div className="rounded-xl border border-rose-300/40 bg-rose-500/20 p-3">
                <p className="text-xs uppercase tracking-wide text-rose-100/80">Неправильных</p>
                <p className="mt-1 text-2xl font-bold text-rose-100">{wrongCount}</p>
              </div>
            </div>

            {rewardMessage ? (
              <p
                className={`mt-4 text-sm ${
                  rewardStatus === "claimed"
                    ? "text-cyan-200"
                    : rewardStatus === "error"
                    ? "text-rose-300"
                    : "text-white/75"
                }`}
              >
                {rewardMessage}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  void startQuickGame();
                }}
                disabled={isStarting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 sm:w-auto"
              >
                <RotateCcw className="h-4 w-4" />
                {isStarting ? "Запускаем..." : "Сыграть ещё раз"}
              </button>
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-400 sm:w-auto"
              >
                <Home className="h-4 w-4" />
                Вернуться на главную
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
