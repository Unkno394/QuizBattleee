import { MASCOT_FRAMES } from "@/features/room/constants";
import type { MascotKind, MascotMood, Team } from "@/features/room/types";
import { LottieLayer, MascotFramePlayer } from "./MascotVisuals";

type LeaderboardEntry = {
  peerId: string;
  name: string;
  score: number;
};

type RankingEntry = {
  place: number;
  peerId: string;
  name: string;
  points: number;
  correctAnswers: number;
};

type CaptainEntry = {
  peerId?: string;
  name: string;
  team?: Team;
  correctAnswers: number;
  wrongAnswers: number;
  points: number;
};

type CaptainContribution = {
  A?: CaptainEntry | null;
  B?: CaptainEntry | null;
  note?: string;
} | null;

type HostDetails = {
  players: Array<{
    peerId: string;
    name: string;
    team?: Team | null;
    answers: number;
    correctAnswers: number;
    wrongAnswers: number;
    skippedAnswers: number;
    points: number;
    avgResponseMs?: number | null;
    fastestResponseMs?: number | null;
  }>;
  questionHistory: Array<Record<string, unknown>>;
  eventHistory: Array<{
    id?: string;
    timestamp?: number;
    kind?: string;
    text?: string;
  }>;
} | null;

type Props = {
  isFfaMode: boolean;
  winnerText: string;
  winnerTextClass: string;
  winnerTeam: Team | null;
  scores: Record<Team, number>;
  teamLabel: (team: Team) => string;
  truncateName: (name: string, maxLength: number) => string;
  mascotKindByPeerId: (targetPeerId?: string | null) => MascotKind;
  getMascotOverlayFrames: (
    kind: MascotKind,
    mood: MascotMood,
    peerId?: string | null
  ) => string[];
  getVictoryEffectsByPeerId: (
    peerId?: string | null
  ) => {
    front: string;
    back: string;
  };
  isLowPerformanceMode: boolean;
  ffaLeaderboard: LeaderboardEntry[];
  resultsRanking: RankingEntry[];
  captainContribution: CaptainContribution;
  hostDetails: HostDetails;
  effectiveIsHost: boolean;
  onExportDocx: () => void;
  onNewGame: () => void;
};

export function RoomResultsSection({
  isFfaMode,
  winnerText,
  winnerTextClass,
  winnerTeam,
  scores,
  teamLabel,
  truncateName,
  mascotKindByPeerId,
  getMascotOverlayFrames,
  getVictoryEffectsByPeerId,
  isLowPerformanceMode,
  ffaLeaderboard,
  resultsRanking,
  captainContribution,
  hostDetails,
  effectiveIsHost,
  onExportDocx,
  onNewGame,
}: Props) {
  if (isFfaMode) {
    const rankingRows =
      resultsRanking.length > 0
        ? resultsRanking.map((entry) => ({
            peerId: entry.peerId,
            name: entry.name,
            score: entry.points,
            correctAnswers: entry.correctAnswers,
            place: entry.place,
          }))
        : ffaLeaderboard.map((entry, index) => ({
            peerId: entry.peerId,
            name: entry.name,
            score: entry.score,
            correctAnswers: 0,
            place: index + 1,
          }));
    const topScore = rankingRows.length ? rankingRows[0].score : null;

    return (
      <section className="relative overflow-hidden rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
        <h3 className="relative text-2xl font-bold">Финал FFA</h3>
        <p className={`relative mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl ${winnerTextClass}`}>
          {winnerText}
        </p>

        <div className="relative mt-4 grid gap-3 sm:grid-cols-2">
          {rankingRows.map((entry) => {
            const isWinner = topScore !== null && entry.score === topScore;
            const entryMascotKind = mascotKindByPeerId(entry.peerId);
            const entryMood: MascotMood = isWinner ? "happy" : "sad";
            const entryFrames = MASCOT_FRAMES[entryMascotKind][entryMood];
            const entryOverlayFrames = getMascotOverlayFrames(entryMascotKind, entryMood, entry.peerId);
            const entryVictoryEffects = getVictoryEffectsByPeerId(entry.peerId);
            const entryFps = isLowPerformanceMode
              ? Math.max(4, Math.round((entryMood === "sad" ? 12 : 10) * 0.6))
              : entryMood === "sad"
              ? 12
              : 10;

            return (
              <article
                key={entry.peerId}
                className={`relative overflow-hidden rounded-2xl border p-4 ${
                  isWinner
                    ? "border-emerald-300/45 bg-emerald-500/15"
                    : "border-white/15 bg-black/25"
                }`}
              >
                {isWinner ? (
                  <LottieLayer
                    path={entryVictoryEffects.front}
                    className="pointer-events-none absolute inset-0 z-20 opacity-95"
                  />
                ) : null}
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold text-white/90">
                      #{entry.place} {truncateName(entry.name, 24)}
                    </p>
                    <p className="whitespace-nowrap font-black text-cyan-200">{entry.score} балл.</p>
                  </div>
                  <p className="mt-1 text-xs text-white/75">Правильных ответов: {entry.correctAnswers}</p>
                  <div className="mt-3 flex justify-center">
                    <div className="relative h-[130px] w-[108px] sm:h-[146px] sm:w-[120px]">
                      {isWinner ? (
                        <LottieLayer
                          path={entryVictoryEffects.back}
                          className="pointer-events-none absolute inset-[-14%] z-0 opacity-90"
                        />
                      ) : null}
                      <div className="relative z-10 h-full w-full">
                        <MascotFramePlayer
                          frames={entryFrames}
                          overlayFrames={entryOverlayFrames}
                          fps={entryFps}
                          mood={entryMood}
                          preloadAllFrames={!isLowPerformanceMode}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {effectiveIsHost && hostDetails?.players?.length ? (
          <div className="mt-5 rounded-2xl border border-white/15 bg-black/25 p-3">
            <p className="text-sm font-semibold text-amber-200">Полная статистика ведущего</p>
            <div className="mt-2 space-y-1 text-xs text-white/80">
              {hostDetails.players.slice(0, 12).map((player) => (
                <p key={`host-ffa-${player.peerId}`}>
                  {truncateName(player.name, 22)}: верно {player.correctAnswers}, ошибок {player.wrongAnswers},
                  пропусков {player.skippedAnswers}, среднее {player.avgResponseMs ?? "-"} мс
                </p>
              ))}
            </div>
            <div className="mt-3 border-t border-amber-200/20 pt-3">
              <p className="text-xs font-semibold text-amber-100">История вопросов</p>
              <div className="mt-1 max-h-24 space-y-1 overflow-y-auto text-[11px] text-white/75">
                {(hostDetails.questionHistory || []).slice(-8).map((entry, index) => {
                  const raw = entry as {
                    mode?: string;
                    questionNumber?: number;
                    skippedByHost?: boolean;
                  };
                  return (
                    <p key={`host-ffa-q-${index}`}>
                      #{raw.questionNumber || index + 1} • {raw.mode || "ffa"} •{" "}
                      {raw.skippedByHost ? "пропущен ведущим" : "завершен"}
                    </p>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 border-t border-amber-200/20 pt-3">
              <p className="text-xs font-semibold text-amber-100">История событий</p>
              <div className="mt-1 max-h-20 space-y-1 overflow-y-auto text-[11px] text-white/75">
                {(hostDetails.eventHistory || []).slice(-8).map((event, index) => (
                  <p key={`host-ffa-event-${index}`}>
                    {event.timestamp
                      ? new Date(event.timestamp).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--"}{" "}
                    • {event.text || "Событие"}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {effectiveIsHost ? (
          <div className="relative mt-5 flex flex-wrap gap-2">
            <button
              onClick={onExportDocx}
              className="rounded-xl border border-cyan-200/45 bg-cyan-500/20 px-4 py-3 font-semibold text-cyan-100 transition hover:bg-cyan-500/30"
            >
              Экспорт DOCX
            </button>
            <button
              onClick={onNewGame}
              className="rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-lime-500 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-900/25 transition hover:brightness-110"
            >
              Новая игра
            </button>
          </div>
        ) : (
          <p className="relative mt-5 text-sm text-white/70">Новая игра запускается ведущим.</p>
        )}
      </section>
    );
  }

  const captainA = captainContribution?.A || null;
  const captainB = captainContribution?.B || null;
  const teamVictoryEffects = getVictoryEffectsByPeerId();

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
      <h3 className="relative text-2xl font-bold">Финал</h3>
      <p className={`relative mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl ${winnerTextClass}`}>
        {winnerText}
      </p>

      <div className="relative mt-4 grid gap-3 sm:grid-cols-2">
        {(["A", "B"] as Team[]).map((team) => {
          const isWinner = winnerTeam === team;
          const isTie = winnerTeam === null;
          const teamMascotKind: MascotKind = team === "A" ? "dog" : "cat";
          const teamMascotMood: MascotMood = isTie ? "sleep" : isWinner ? "happy" : "sad";
          const teamMascotFrames = MASCOT_FRAMES[teamMascotKind][teamMascotMood];
          const teamOverlayFrames = getMascotOverlayFrames(teamMascotKind, teamMascotMood);
          const teamMascotFps =
            teamMascotMood === "sad"
              ? 12
              : teamMascotMood === "happy"
              ? 10
              : teamMascotMood === "sleep"
              ? 4
              : 5;
          const cardClass =
            team === "A"
              ? "border-sky-300/45 bg-sky-500/20"
              : "border-rose-300/45 bg-rose-500/20";
          const nameClass = team === "A" ? "text-sky-200" : "text-rose-200";
          const scoreClass = team === "A" ? "text-sky-100" : "text-rose-100";

          return (
            <div
              key={team}
              className={`relative overflow-hidden rounded-2xl border p-4 ${cardClass} ${
                isWinner ? "shadow-lg" : ""
              }`}
            >
              {isWinner ? (
                <LottieLayer
                  enabled={!isLowPerformanceMode}
                  path={teamVictoryEffects.front}
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute -inset-y-[5%] inset-x-[3%] z-20 opacity-95 [&>svg]:h-full [&>svg]:w-full [&>svg]:!overflow-visible"
                />
              ) : null}

              <div className="relative z-10">
                <div className="flex items-center justify-between gap-3">
                  <p className={`min-w-0 flex-1 truncate text-base font-semibold ${nameClass}`}>
                    {teamLabel(team)}
                  </p>
                  <p className={`whitespace-nowrap text-sm font-black sm:text-base ${scoreClass}`}>
                    всего {scores[team] ?? 0} баллов
                  </p>
                </div>

                <div className="mt-3 flex justify-center">
                  <div className="relative h-[124px] w-[102px] sm:h-[142px] sm:w-[116px]">
                    {isWinner ? (
                      <LottieLayer
                        enabled={!isLowPerformanceMode}
                        path={teamVictoryEffects.back}
                        className="pointer-events-none absolute inset-[-14%] z-0 opacity-90"
                      />
                    ) : null}
                    <div className="relative z-10 h-full w-full">
                      <MascotFramePlayer
                        frames={teamMascotFrames}
                        overlayFrames={teamOverlayFrames}
                        fps={isLowPerformanceMode ? Math.max(3, Math.round(teamMascotFps * 0.6)) : teamMascotFps}
                        mood={teamMascotMood}
                        preloadAllFrames={!isLowPerformanceMode}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-white/15 bg-black/25 p-4">
        <p className="text-base font-semibold text-white/95">Статистика после игры</p>

        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="text-sm font-semibold text-white/90">Вклад капитанов</p>
          {captainContribution?.note ? (
            <p className="mt-1 text-xs text-white/70">{captainContribution.note}</p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[captainA, captainB].map((captain, index) => (
                <div
                  key={`captain-stat-${index}`}
                  className={`rounded-lg border p-2 text-xs ${
                    index === 0
                      ? "border-sky-300/30 bg-sky-500/10 text-sky-100"
                      : "border-rose-300/30 bg-rose-500/10 text-rose-100"
                  }`}
                >
                  <p className="font-semibold">
                    {captain ? truncateName(captain.name, 22) : "Капитан не выбран"}
                  </p>
                  <p className="mt-1">Верно: {captain?.correctAnswers || 0}</p>
                  <p>Ошибок: {captain?.wrongAnswers || 0}</p>
                  <p>Очков: {captain?.points || 0}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {effectiveIsHost && hostDetails ? (
        <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-200">Полная статистика ведущего</p>
          <div className="mt-2 space-y-1 text-xs text-white/85">
            {(hostDetails.players || []).slice(0, 16).map((player) => (
              <p key={`host-detail-${player.peerId}`}>
                {truncateName(player.name, 22)}: ответов {player.answers}, верно {player.correctAnswers},
                ошибок {player.wrongAnswers}, пропусков {player.skippedAnswers}, среднее{" "}
                {player.avgResponseMs ?? "-"} мс
              </p>
            ))}
          </div>
          <div className="mt-3 border-t border-amber-200/20 pt-3">
            <p className="text-xs font-semibold text-amber-100">История вопросов</p>
            <div className="mt-1 max-h-24 space-y-1 overflow-y-auto text-[11px] text-white/75">
              {(hostDetails.questionHistory || []).slice(-10).map((entry, index) => {
                const raw = entry as {
                  mode?: string;
                  questionNumber?: number;
                  skippedByHost?: boolean;
                };
                return (
                  <p key={`host-team-q-${index}`}>
                    #{raw.questionNumber || index + 1} • {raw.mode || "classic"} •{" "}
                    {raw.skippedByHost ? "пропущен ведущим" : "завершен"}
                  </p>
                );
              })}
            </div>
          </div>
          <div className="mt-3 border-t border-amber-200/20 pt-3">
            <p className="text-xs font-semibold text-amber-100">История событий</p>
            <div className="mt-1 max-h-24 space-y-1 overflow-y-auto text-[11px] text-white/75">
              {(hostDetails.eventHistory || []).slice(-10).map((event, index) => (
                <p key={`host-event-${index}`}>
                  {event.timestamp
                    ? new Date(event.timestamp).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "--:--"}{" "}
                  • {event.text || "Событие"}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {effectiveIsHost ? (
        <div className="relative mt-5 flex flex-wrap gap-2">
          <button
            onClick={onExportDocx}
            className="rounded-xl border border-cyan-200/45 bg-cyan-500/20 px-4 py-3 font-semibold text-cyan-100 transition hover:bg-cyan-500/30"
          >
            Экспорт DOCX
          </button>
          <button
            onClick={onNewGame}
            className="rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-lime-500 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-900/25 transition hover:brightness-110"
          >
            Новая игра
          </button>
        </div>
      ) : (
        <p className="relative mt-5 text-sm text-white/70">Новая игра запускается ведущим.</p>
      )}
    </section>
  );
}
