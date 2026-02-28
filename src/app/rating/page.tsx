"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trophy, Users } from "lucide-react";
import AnimatedBackground from "@/components/AnimatedBackground";
import {
  type LeaderboardEntry,
  type LeaderboardScope,
  getLeaderboard,
} from "@/shared/api/auth";
import { Frame } from "@/shared/shop/Frame";

const getStoredAccessToken = () => {
  if (typeof window === "undefined") return "";
  const raw = window.localStorage.getItem("access_token");
  if (!raw) return "";
  const token = raw.trim();
  if (!token || token === "undefined" || token === "null") return "";
  return token;
};

const initialsOf = (name: string) => {
  const normalized = (name || "").trim();
  if (!normalized) return "И";
  return normalized.slice(0, 2).toUpperCase();
};

export default function RatingPage() {
  const router = useRouter();
  const [scope, setScope] = useState<LeaderboardScope>("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [friendsCount, setFriendsCount] = useState<number | null>(null);

  // read initial scope from URL when client-side
  useEffect(() => {
    if (typeof window !== "undefined") {
      const param = (new URL(window.location.href).searchParams.get("scope") as LeaderboardScope) || "all";
      setScope(param);
    }
    const onPop = () => {
      const param = (new URL(window.location.href).searchParams.get("scope") as LeaderboardScope) || "all";
      setScope(param);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredAccessToken();

    void getLeaderboard(scope, token || undefined)
      .then((response) => {
        if (cancelled) return;
        setEntries(Array.isArray(response.entries) ? response.entries : []);
        setFriendsCount(
          typeof response.friendsCount === "number" ? Math.max(0, response.friendsCount) : null
        );
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : "Не удалось загрузить рейтинг";
        setError(message);
        setEntries([]);
        setFriendsCount(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [scope]);

  // keep scope in sync if query param changes (back/forward navigation)
  // (handled via popstate listener in the earlier effect)

  const emptyMessage = useMemo(() => {
    if (scope === "friends") {
      return "Пока нет побед среди друзей.";
    }
    return "Пока нет игроков с победами.";
  }, [scope]);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <AnimatedBackground className="fixed inset-0 -z-10 h-full w-full" />

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-black/35 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>На главную</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Рейтинг игроков</h1>
          <span className="inline-flex items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-500/20 px-3 py-2 text-sm font-semibold text-amber-100">
            <Trophy className="h-4 w-4" />
            <span>По количеству побед</span>
          </span>
        </div>

        <section className="rounded-3xl border border-white/20 bg-black/35 p-4 backdrop-blur-md sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                setError("");
                setScope("all");
                // update URL query param
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("scope");
                  router.replace(url.toString());
                }
              }}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                scope === "all"
                  ? "border-cyan-300/60 bg-cyan-500/25 text-cyan-100"
                  : "border-white/25 bg-white/10 text-white/80 hover:bg-white/15"
              }`}
            >
              <Trophy className="h-4 w-4" />
              <span>Среди всех</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                setError("");
                setScope("friends");
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  url.searchParams.set("scope", "friends");
                  router.replace(url.toString());
                }
              }}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                scope === "friends"
                  ? "border-fuchsia-300/60 bg-fuchsia-500/25 text-fuchsia-100"
                  : "border-white/25 bg-white/10 text-white/80 hover:bg-white/15"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Среди друзей</span>
            </button>
            {scope === "friends" && typeof friendsCount === "number" ? (
              <span className="ml-auto text-xs text-white/65">Друзей: {friendsCount}</span>
            ) : null}
          </div>

          {isLoading ? <p className="text-sm text-white/75">Загрузка рейтинга...</p> : null}
          {!isLoading && error ? <p className="text-sm text-rose-300">{error}</p> : null}

          {!isLoading && !error ? (
            entries.length > 0 ? (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <article
                    key={`${entry.userId}-${entry.rank}`}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                      entry.isMe
                        ? "border-emerald-300/55 bg-emerald-500/15"
                        : "border-white/15 bg-white/5"
                    }`}
                  >
                    <div className="w-10 shrink-0 text-center text-sm font-bold text-amber-200">
                      #{entry.rank}
                    </div>
                    <Frame
                      frameId={entry.profileFrame || null}
                      className="h-10 w-10 shrink-0"
                      radiusClass="rounded-full"
                      innerClassName="flex h-full w-full items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white"
                    >
                      {entry.avatarUrl ? (
                        <img
                          src={entry.avatarUrl}
                          alt={entry.displayName}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <span>{initialsOf(entry.displayName)}</span>
                      )}
                    </Frame>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{entry.displayName}</p>
                      <p className="text-xs text-white/65">Игрок #{entry.userId}</p>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-lg border border-amber-300/30 bg-amber-500/20 px-2 py-1 text-sm font-semibold text-amber-100">
                      <Trophy className="h-4 w-4" />
                      <span>{entry.wins}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/70">{emptyMessage}</p>
            )
          ) : null}
        </section>
      </div>
    </main>
  );
}
