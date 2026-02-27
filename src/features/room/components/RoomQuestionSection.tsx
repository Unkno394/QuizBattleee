import type { RoomState, Team } from "@/features/room/types";
import { difficultyBadgeClass, difficultyLabel, formatSeconds, truncateName } from "@/features/room/utils";

type Props = {
  roomState: RoomState;
  isClassicMode: boolean;
  isFfaMode: boolean;
  isChaosMode: boolean;
  effectiveIsHost: boolean;
  effectiveIsSpectator: boolean;
  myTeam: Team | null;
  isMyTurn: boolean;
  canAnswerNow: boolean;
  hasSubmittedChaosVote: boolean;
  hasAnsweredCurrentFfaQuestion: boolean;
  pendingPlayers: string[];
  chaosProgress: RoomState["chaosProgress"];
  secondsLeft: number;
  selectedAnswer: number | null;
  canSubmit: boolean;
  myFfaAnswer: RoomState["myAnswer"] | null;
  ffaAnswerProgress: { answered: number; total: number };
  teamLabel: (team: Team) => string;
  skipQuestionByHost: () => void;
  requestSkipQuestion: () => void;
  submitAnswer: () => void;
  setSelectedAnswer: (index: number) => void;
};

export function RoomQuestionSection({
  roomState,
  isClassicMode,
  isFfaMode,
  isChaosMode,
  effectiveIsHost,
  effectiveIsSpectator,
  myTeam,
  isMyTurn,
  canAnswerNow,
  hasSubmittedChaosVote,
  hasAnsweredCurrentFfaQuestion,
  pendingPlayers,
  chaosProgress,
  secondsLeft,
  selectedAnswer,
  canSubmit,
  myFfaAnswer,
  ffaAnswerProgress,
  teamLabel,
  skipQuestionByHost,
  requestSkipQuestion,
  submitAnswer,
  setSelectedAnswer,
}: Props) {
  const activeTeam = roomState.activeTeam;
  const activeTeamName = teamLabel(activeTeam);
  const isOpponentTurn = !!myTeam && myTeam !== activeTeam;
  const ffaWaitingLabel =
    pendingPlayers.length === 1
      ? `Ждём игрока "${truncateName(pendingPlayers[0], 18)}".`
      : pendingPlayers.length > 1
      ? `Ждём остальных игроков: ${pendingPlayers.length}.`
      : "Все игроки ответили. Переходим к следующему вопросу...";
  const skipRequest = roomState.skipRequest;
  const skipStatus = skipRequest?.status || "idle";
  const isSkipRejected = skipStatus === "rejected";
  const answeredByTeam = chaosProgress?.answeredByTeam || { A: 0, B: 0 };
  const totalByTeam = chaosProgress?.totalByTeam || { A: 0, B: 0 };
  const myChaosTeamAnswered = myTeam ? answeredByTeam[myTeam] || 0 : 0;
  const myChaosTeamTotal = myTeam ? totalByTeam[myTeam] || 0 : 0;
  const opponentTeam: Team | null = myTeam === "A" ? "B" : myTeam === "B" ? "A" : null;
  const opponentChaosAnswered = opponentTeam ? answeredByTeam[opponentTeam] || 0 : 0;
  const opponentChaosTotal = opponentTeam ? totalByTeam[opponentTeam] || 0 : 0;
  const myChaosTeamComplete = myChaosTeamTotal > 0 && myChaosTeamAnswered >= myChaosTeamTotal;
  const opponentChaosTeamComplete =
    opponentChaosTotal > 0 && opponentChaosAnswered >= opponentChaosTotal;
  const questionTheme = isChaosMode
    ? {
        headerTextClass: "text-emerald-300",
        selectedOptionClass: "border-emerald-300 bg-emerald-500/20",
        submitButtonClass:
          "bg-gradient-to-r from-emerald-500 via-green-500 to-lime-500 shadow-emerald-900/25",
        waitingTextClass: "text-emerald-200",
      }
    : activeTeam === "A"
    ? {
        headerTextClass: "text-sky-300",
        selectedOptionClass: "border-sky-300 bg-sky-500/20",
        submitButtonClass:
          "bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 shadow-sky-900/25",
        waitingTextClass: "text-sky-200",
      }
    : {
        headerTextClass: "text-rose-300",
        selectedOptionClass: "border-rose-300 bg-rose-500/20",
        submitButtonClass:
          "bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 shadow-rose-900/25",
        waitingTextClass: "text-rose-200",
      };

  return (
    <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-lg font-semibold ${questionTheme.headerTextClass}`}>
          {isFfaMode
            ? "Сейчас отвечают все участники"
            : isChaosMode
            ? "Сейчас отвечают обе команды"
            : `Сейчас отвечает: ${activeTeamName}`}
        </p>
        <div className="flex items-center gap-2">
          <p className="rounded-xl bg-white/15 px-3 py-1 text-lg font-bold">
            00:{formatSeconds(secondsLeft)}
          </p>
          {effectiveIsHost ? (
            <button
              type="button"
              onClick={skipQuestionByHost}
              className="rounded-xl border border-red-300/60 bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-100 transition hover:bg-red-500/20"
            >
              Пропустить
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-sm text-white/70">
        {isFfaMode
          ? "Каждый участник выбирает собственный ответ."
          : isChaosMode
          ? "Обе команды голосуют одновременно. Переход к следующему вопросу после ответов двух команд."
          : isOpponentTurn
          ? `Ход соперника: отвечает ${activeTeamName}.`
          : isMyTurn
          ? "Сейчас ход вашей команды."
          : `Сейчас ход ${activeTeamName}.`}
      </p>
      {!effectiveIsHost && !effectiveIsSpectator ? (
        <div className="mt-3">
          {isSkipRejected ? (
            <p className="inline-flex rounded-xl border border-slate-300/50 bg-slate-500/15 px-3 py-1.5 text-sm font-semibold text-slate-200">
              Отклонено
            </p>
          ) : (
            <button
              type="button"
              onClick={requestSkipQuestion}
              disabled={!!skipRequest?.meRequested}
              className="rounded-xl border border-amber-300/60 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {skipRequest?.meRequested ? "Запрос отправлен" : "Попросить пропустить"}
            </button>
          )}
        </div>
      ) : null}
      {isFfaMode && effectiveIsSpectator ? (
        <p className="mt-3 text-sm text-white/70">
          Режим зрителя: вы наблюдаете игру без возможности отвечать.
        </p>
      ) : null}

      <div className="mt-5 rounded-2xl border border-white/20 bg-white/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-white/60">
            Вопрос {roomState.currentQuestionIndex + 1} из {roomState.questionCount}
          </p>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${difficultyBadgeClass(
              roomState.currentQuestion?.difficulty
            )}`}
          >
            {difficultyLabel(roomState.currentQuestion?.difficulty)}
          </span>
        </div>
        <h3 className="mt-2 text-xl font-semibold">{roomState.currentQuestion?.text}</h3>
      </div>

      {canAnswerNow ? (
        <>
          <div className="mt-4 rounded-xl border border-cyan-300/35 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
            {isClassicMode
              ? "Вы капитан активной команды. Выберите и подтвердите ответ."
              : isChaosMode
              ? "Вы голосуете за вариант своей команды. Победит самый популярный ответ."
              : "Выбирайте ответ: очки начисляются каждому игроку индивидуально."}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {roomState.currentQuestion?.options.map((option, index) => (
              <button
                key={`${option}-${index}`}
                onClick={() => setSelectedAnswer(index)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  selectedAnswer === index
                    ? questionTheme.selectedOptionClass
                    : "border-white/20 bg-white/5 hover:bg-white/10"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            onClick={submitAnswer}
            disabled={!canSubmit}
            className={`mt-4 rounded-xl px-4 py-3 font-semibold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${questionTheme.submitButtonClass}`}
          >
            {isChaosMode ? "Отдать голос" : "Подтвердить"}
          </button>
        </>
      ) : isChaosMode && hasSubmittedChaosVote ? (
        <div className="mt-5 space-y-3 rounded-2xl border border-emerald-300/35 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-100">Голос принят</p>
          <p className="text-sm text-white/85">
            {myChaosTeamComplete && !opponentChaosTeamComplete
              ? "Ваша команда уже ответила. Ждём, пока ответит другая команда."
              : myChaosTeamComplete && opponentChaosTeamComplete
              ? "Обе команды ответили. Переходим к проверке."
              : `Ждём ответы вашей команды: ${myChaosTeamAnswered}/${myChaosTeamTotal}.`}
          </p>
          <p className="text-xs text-white/70">
            Прогресс: {teamLabel("A")} {answeredByTeam.A || 0}/{totalByTeam.A || 0} •{" "}
            {teamLabel("B")} {answeredByTeam.B || 0}/{totalByTeam.B || 0}
          </p>
        </div>
      ) : isFfaMode && hasAnsweredCurrentFfaQuestion ? (
        <div className="mt-5 space-y-3 rounded-2xl border border-cyan-300/35 bg-cyan-500/10 p-4">
          <p className="text-sm font-semibold text-cyan-100">Проверка вашего ответа завершена</p>
          <p className={myFfaAnswer?.isCorrect ? "text-emerald-200" : "text-red-200"}>
            {myFfaAnswer?.isCorrect ? "Верно" : "Неверно"} · +{myFfaAnswer?.pointsAwarded || 0}
          </p>
          {myFfaAnswer?.speedBonus ? (
            <p className="text-xs text-emerald-200">Бонус за скорость: +{myFfaAnswer.speedBonus}</p>
          ) : null}
          <p className="text-sm text-white/85">{ffaWaitingLabel}</p>
          <p className="text-xs text-white/70">
            Ответили: {ffaAnswerProgress.answered} из {ffaAnswerProgress.total}
          </p>
        </div>
      ) : effectiveIsHost ? (
        <>
          <div className="mt-4 rounded-xl border border-emerald-300/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {isFfaMode
              ? "Режим ведущего: вы видите варианты и индивидуальную проверку каждого участника."
              : "Режим ведущего: вы видите варианты и проверку ответа обеих команд."}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {roomState.currentQuestion?.options.map((option, index) => (
              <div
                key={`${option}-${index}`}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-left text-white/90"
              >
                {option}
              </div>
            ))}
          </div>
        </>
      ) : isMyTurn && isClassicMode ? (
        <>
          <div className="mt-4 rounded-xl border border-amber-300/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Ответ выбирает только капитан вашей команды.
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {roomState.currentQuestion?.options.map((option, index) => (
              <div
                key={`${option}-${index}`}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-left text-white/90"
              >
                {option}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-2xl border border-white/20 bg-white/5 p-4">
          <p className={questionTheme.waitingTextClass}>
            {isFfaMode
              ? "Ожидаем ответы участников."
              : isChaosMode
              ? "Ожидаем ответы команд."
              : `Ожидаем ответ ${activeTeamName}.`}
          </p>
          <p className="text-sm text-white/60">До окончания: {secondsLeft} сек.</p>
          {isChaosMode ? (
            <p className="mt-1 text-xs text-white/65">
              Прогресс: {teamLabel("A")} {answeredByTeam.A || 0}/{totalByTeam.A || 0} •{" "}
              {teamLabel("B")} {answeredByTeam.B || 0}/{totalByTeam.B || 0}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
