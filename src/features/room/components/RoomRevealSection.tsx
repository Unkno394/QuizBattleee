import type { GameMode, RevealInfo, RoomState, Team } from "@/features/room/types";
import { difficultyBadgeClass, difficultyLabel, truncateName } from "@/features/room/utils";

type Props = {
  roomState: RoomState;
  gameMode: GameMode;
  isFfaMode: boolean;
  isChaosMode: boolean;
  effectiveIsHost: boolean;
  myTeam: Team | null;
  teamLabel: (team: Team) => string;
};

export function RoomRevealSection({
  roomState,
  gameMode,
  isFfaMode,
  isChaosMode,
  effectiveIsHost,
  myTeam,
  teamLabel,
}: Props) {
  const question = roomState.currentQuestion;
  const reveal = roomState.lastReveal;
  if (!question) return null;
  if (!reveal) {
    return (
      <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
        <h3 className="text-xl font-semibold">Проверка ответа</h3>
        <p className="mt-2">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${difficultyBadgeClass(
              question.difficulty
            )}`}
          >
            {difficultyLabel(question.difficulty)}
          </span>
        </p>
        <p className="mt-2 text-white/80">
          {isFfaMode ? (
            "Идет проверка индивидуальных ответов."
          ) : (
            <>
              Проверка идет у команды <span className="font-semibold text-white">{teamLabel(roomState.activeTeam)}</span>.
            </>
          )}
        </p>
        <p className="mt-2 text-sm text-white/60">Ожидайте следующий ход.</p>
      </section>
    );
  }
  if (reveal.skippedByHost) {
    const isSkippedTeam = !!myTeam && myTeam === reveal.team;
    const skipMessage = effectiveIsHost
      ? "Вы пропустили вопрос. Переходим к следующему ходу."
      : isSkippedTeam
      ? "Вопрос пропущен ведущим."
      : "Переходим дальше...";
    return (
      <section className="rounded-3xl border border-amber-300/35 bg-black/35 p-5 backdrop-blur-md sm:p-6">
        <h3 className="text-xl font-semibold">Вопрос пропущен</h3>
        <p className="mt-2">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${difficultyBadgeClass(
              question.difficulty
            )}`}
          >
            {difficultyLabel(question.difficulty)}
          </span>
        </p>
        <p className="mt-2 text-white/85">{skipMessage}</p>
        <p className="mt-1 text-sm text-white/70">
          Команда хода: {reveal.team ? teamLabel(reveal.team) : "—"}. Очки за этот ход: 0.
        </p>
      </section>
    );
  }
  if ((reveal.mode || gameMode) === "ffa") {
    const playerResults = reveal.playerResults || [];
    return (
      <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold">Индивидуальная проверка</h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${difficultyBadgeClass(
                question.difficulty
              )}`}
            >
              {difficultyLabel(question.difficulty)}
            </span>
          </div>
          <p className="rounded-xl bg-white/15 px-3 py-1 text-sm font-semibold text-white/80">
            Участников: {reveal.participantsCount || playerResults.length}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {question.options.map((option, index) => {
            const isCorrect = index === reveal.correctIndex;
            return (
              <div
                key={`${option}-${index}`}
                className={`rounded-xl border px-4 py-3 ${
                  isCorrect
                    ? "border-emerald-300/90 bg-emerald-500/30 text-emerald-200"
                    : "border-white/20 bg-white/5 text-white/90"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium sm:text-base">{option}</p>
                  {isCorrect ? (
                    <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                      Правильный
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-white/20 bg-white/5 p-3">
          <p className="mb-2 text-sm font-semibold text-white/85">Результаты участников</p>
          <ul className="space-y-2 text-sm">
            {playerResults.map((result) => {
              const selectedLabel =
                typeof result.selectedIndex === "number" && question.options[result.selectedIndex]
                  ? question.options[result.selectedIndex]
                  : "Без ответа";
              return (
                <li
                  key={result.peerId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2"
                >
                  <span className="font-medium text-white/90">{truncateName(result.name, 18)}</span>
                  <span className={result.isCorrect ? "text-emerald-200" : "text-red-200"}>
                    {result.isCorrect ? "Верно" : "Неверно"}
                  </span>
                  <span className="text-white/70">{truncateName(selectedLabel, 24)}</span>
                  <span className="font-semibold text-cyan-200">+{result.pointsAwarded}</span>
                  <span className="text-white/80">Итого: {result.totalScore}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    );
  }
  if ((reveal.mode || gameMode) === "chaos") {
    const chaosTeamResults: Partial<Record<Team, NonNullable<RevealInfo["chaosTeamResults"]>[Team]>> =
      reveal.chaosTeamResults || {};
    const correctLabel =
      typeof reveal.correctIndex === "number" && question.options[reveal.correctIndex]
        ? question.options[reveal.correctIndex]
        : "—";
    return (
      <section className="rounded-3xl border border-emerald-300/35 bg-black/35 p-5 backdrop-blur-md sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold">Проверка голосования команд</h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${difficultyBadgeClass(
                question.difficulty
              )}`}
            >
              {difficultyLabel(question.difficulty)}
            </span>
          </div>
          <p className="rounded-xl bg-white/15 px-3 py-1 text-sm font-semibold text-white/80">
            Правильный ответ: {truncateName(correctLabel, 34)}
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {(["A", "B"] as Team[]).map((team) => {
            const result = chaosTeamResults[team] || {};
            const selectedLabel =
              typeof result.selectedIndex === "number" && question.options[result.selectedIndex]
                ? question.options[result.selectedIndex]
                : "Без ответа";
            const voteSummary = result.voteCounts
              ? Object.entries(result.voteCounts)
                  .map(([index, count]) => `${Number(index) + 1}: ${count}`)
                  .join(" • ")
              : "";
            const gainedPoints = result.pointsAwarded || 0;
            const isCorrect = !!result.isCorrect;

            return (
              <article
                key={`chaos-team-${team}`}
                className={`rounded-2xl border p-4 ${
                  team === "A" ? "border-sky-300/35 bg-sky-500/10" : "border-rose-300/35 bg-rose-500/10"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-base font-semibold ${team === "A" ? "text-sky-200" : "text-rose-200"}`}>
                    {teamLabel(team)}
                  </p>
                  <p
                    className={`rounded-lg px-2 py-0.5 text-xs font-bold ${
                      gainedPoints > 0 ? "bg-emerald-500/25 text-emerald-200" : "bg-red-500/25 text-red-200"
                    }`}
                  >
                    +{gainedPoints} баллов
                  </p>
                </div>
                <p className={`mt-2 text-sm ${isCorrect ? "text-emerald-200" : "text-red-200"}`}>
                  {isCorrect ? "Ответ команды верный" : "Ответ команды неверный"}
                </p>
                <p className="mt-1 text-sm text-white/85">Выбранный вариант: {truncateName(selectedLabel, 34)}</p>
                <p className="mt-1 text-xs text-white/70">
                  Ответили: {result.answeredCount || 0}/{result.participantsCount || 0}
                </p>
                {voteSummary ? <p className="mt-1 text-xs text-white/70">Голоса: {voteSummary}</p> : null}
                {result.tieResolvedRandomly ? (
                  <p className="mt-1 text-xs text-amber-200">Было равенство голосов: выбран случайный вариант из лидеров.</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  const currentQuestionIndex = roomState.currentQuestionIndex ?? 0;
  const questionCount = roomState.questionCount ?? 0;
  const revealTeam = reveal.team || "A";
  const hasNextTurn = revealTeam === "A" || currentQuestionIndex < questionCount - 1;
  const nextTeam: Team = revealTeam === "A" ? "B" : "A";
  const revealTeamTextClass = revealTeam === "A" ? "text-sky-200" : "text-rose-200";
  const revealSectionClass =
    revealTeam === "A" ? "border-sky-300/35 bg-sky-500/10" : "border-rose-300/35 bg-rose-500/10";

  return (
    <section className={`rounded-3xl border bg-black/35 p-5 backdrop-blur-md sm:p-6 ${revealSectionClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-semibold">Проверка ответа</h3>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${difficultyBadgeClass(
              question.difficulty
            )}`}
          >
            {difficultyLabel(question.difficulty)}
          </span>
        </div>
        <p
          className={`rounded-xl px-3 py-1 text-sm font-bold sm:text-base ${
            (reveal.pointsAwarded || 0) > 0 ? "bg-emerald-500/25 text-emerald-200" : "bg-red-500/25 text-red-200"
          }`}
        >
          +{reveal.pointsAwarded || 0} баллов
        </p>
      </div>

      {reveal.speedBonus && reveal.speedBonus > 0 ? (
        <p className="mt-2 text-sm text-emerald-200">Бонус за скорость: +{reveal.speedBonus}</p>
      ) : null}
      {isChaosMode ? (
        <>
          {reveal.voteCounts ? (
            <p className="mt-1 text-sm text-white/75">
              Голосов за варианты:{" "}
              {Object.entries(reveal.voteCounts)
                .map(([index, count]) => `${Number(index) + 1}: ${count}`)
                .join(" • ")}
            </p>
          ) : null}
          {reveal.tieResolvedRandomly ? (
            <p className="mt-1 text-xs text-amber-200">Было равенство голосов: выбран случайный вариант из лидеров.</p>
          ) : null}
        </>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className={`font-semibold ${revealTeamTextClass}`}>Отвечала команда: {teamLabel(revealTeam)}</p>
        {hasNextTurn ? <p className="text-sm text-white/75">Следующий ход: {teamLabel(nextTeam)}</p> : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {question.options.map((option, index) => {
          const isCorrect = index === reveal.correctIndex;
          const isSelectedWrong = reveal.selectedIndex === index && !isCorrect;

          const optionClass = isCorrect
            ? "border-emerald-300/90 bg-emerald-500/30 text-emerald-200"
            : isSelectedWrong
            ? "border-red-400/90 bg-red-500/45 text-red-200"
            : "border-white/20 bg-white/5 text-white/90";

          return (
            <div key={`${option}-${index}`} className={`rounded-xl border px-4 py-3 ${optionClass}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium sm:text-base">{option}</p>
                {isCorrect ? (
                  <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                    Правильный
                  </span>
                ) : null}
                {isSelectedWrong ? (
                  <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-xs font-semibold text-red-200">
                    Неверный
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
