import { Shuffle } from "lucide-react";

import { TEAM_SECTOR_META } from "@/features/room/constants";
import type { RoomState, Team } from "@/features/room/types";

type CaptainVoteSectionProps = {
  roomState: RoomState;
  captainVoteReadyTeams: Record<Team, boolean>;
  captainVoteLeft: number;
  effectiveIsHost: boolean;
  myTeam: Team | null;
  myCaptainVote: string | null;
  peerId: string;
  voteCaptain: (candidatePeerId: string) => void;
  truncateName: (name: string, maxLength?: number) => string;
  formatSeconds: (seconds: number) => string;
  votesLabel: (votes: number) => string;
  teamLabel: (team: Team) => string;
  captainSectorLabel: (team: Team) => string;
  captainSectorTextClass: (team: Team) => string;
};

export function CaptainVoteSection({
  roomState,
  captainVoteReadyTeams,
  captainVoteLeft,
  effectiveIsHost,
  myTeam,
  myCaptainVote,
  peerId,
  voteCaptain,
  truncateName,
  formatSeconds,
  votesLabel,
  teamLabel,
  captainSectorLabel,
  captainSectorTextClass,
}: CaptainVoteSectionProps) {
  const renderCaptainVoteForTeam = (team: Team, canVoteInTeam: boolean) => {
    const players = (roomState.players || []).filter(
      (player) => !player.isHost && player.team === team
    );
    const votesMap = roomState.captainVotes?.[team] || {};
    const visibleLabel = captainSectorLabel(team);
    const visibleLabelClass = captainSectorTextClass(team);
    const teamReady = captainVoteReadyTeams[team];
    const captainPeerId =
      roomState.captains?.[team] || players.find((player) => player.isCaptain)?.peerId || null;
    const captainName = captainPeerId
      ? (roomState.players || []).find((player) => player.peerId === captainPeerId)?.name || "выбран"
      : null;
    const selectedVoteClass =
      team === "A" ? "border-sky-300 bg-sky-500/20" : "border-rose-300 bg-rose-500/20";
    const captainTextClass = team === "A" ? "text-sky-200" : "text-rose-200";

    if (teamReady) {
      return (
        <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
          <p className={`text-sm font-semibold ${visibleLabelClass}`}>{visibleLabel}</p>
          <p className={`mt-2 text-base font-semibold ${captainTextClass}`}>
            Капитан: {truncateName(captainName || "выбран", 24)}
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={`text-sm font-semibold ${visibleLabelClass}`}>{visibleLabel}</p>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white/80">
            Таймер: 00:{formatSeconds(captainVoteLeft)}
          </span>
        </div>
        <ul className="mt-2 space-y-2">
          {players.length ? (
            players.map((player) => {
              const votes = votesMap[player.peerId] || 0;
              const selected = myCaptainVote === player.peerId;
              const isCaptain = captainPeerId === player.peerId;
              const isSelf = player.peerId === peerId;
              const displayName = isSelf ? `${player.name} (вы)` : player.name;
              const showVoteButton = canVoteInTeam && !teamReady;

              return (
                <li key={player.peerId} className="flex min-w-0 items-center justify-between gap-2">
                  {showVoteButton ? (
                    <button
                      onClick={() => {
                        if (!isSelf) voteCaptain(player.peerId);
                      }}
                      title={isSelf ? `${displayName} (за себя голосовать нельзя)` : displayName}
                      disabled={isSelf}
                      className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selected ? selectedVoteClass : "border-white/20 bg-white/10 hover:bg-white/15"
                      } ${isSelf ? "cursor-not-allowed opacity-60" : ""} truncate`}
                    >
                      {truncateName(displayName, 24)}
                    </button>
                  ) : (
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        isCaptain ? `font-semibold ${captainTextClass}` : "text-white/90"
                      }`}
                      title={displayName}
                    >
                      {truncateName(displayName, 24)}
                    </span>
                  )}
                  <span className="text-xs text-white/70">{votesLabel(votes)}</span>
                </li>
              );
            })
          ) : (
            <li className="text-sm text-white/60">Нет участников</li>
          )}
        </ul>
      </div>
    );
  };

  const readyTeams = (["A", "B"] as Team[]).filter((team) => captainVoteReadyTeams[team]);
  const statusText = (() => {
    if (readyTeams.length === 2) return "Обе команды выбрали капитанов";
    if (readyTeams.length === 1) return `${captainSectorLabel(readyTeams[0])} уже выбрала капитана`;
    return `00:${formatSeconds(captainVoteLeft)}`;
  })();

  return (
    <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-2xl font-semibold">Этап: Выбор капитана</h3>
        <p className="rounded-xl bg-white/15 px-3 py-1 text-sm font-semibold sm:text-base">{statusText}</p>
      </div>

      <p className="mt-2 text-white/75">Как только команда соберёт все голоса, её капитан фиксируется сразу.</p>

      {readyTeams.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {readyTeams.map((team) => (
            <span
              key={team}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                team === "A" ? "bg-sky-500/20 text-sky-200" : "bg-rose-500/20 text-rose-200"
              }`}
            >
              {captainSectorLabel(team)} выбрал капитана
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {renderCaptainVoteForTeam("A", !effectiveIsHost && myTeam === "A")}
        {renderCaptainVoteForTeam("B", !effectiveIsHost && myTeam === "B")}
      </div>

      {!effectiveIsHost && myTeam ? (
        <div className="mt-4 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/70">
          {myCaptainVote
            ? `Ваш голос: ${truncateName((roomState.players || []).find((p) => p.peerId === myCaptainVote)?.name || "выбран", 24)}`
            : "Вы пока не проголосовали"}
        </div>
      ) : null}
    </section>
  );
}

type TeamNamingSectionProps = {
  roomState: RoomState;
  teamNamingReadyTeams: Record<Team, boolean>;
  teamNamingLeft: number;
  myTeam: Team | null;
  effectiveIsHost: boolean;
  isClassicMode: boolean;
  isMyCaptain: boolean;
  teamNameDraft: string;
  setTeamNameDraft: (value: string) => void;
  defaultMyTeamName: string;
  saveTeamName: () => void;
  randomizeTeamName: () => void;
  teamLabel: (team: Team) => string;
  truncateName: (name: string, maxLength?: number) => string;
  formatSeconds: (seconds: number) => string;
};

export function TeamNamingSection({
  roomState,
  teamNamingReadyTeams,
  teamNamingLeft,
  myTeam,
  effectiveIsHost,
  isClassicMode,
  isMyCaptain,
  teamNameDraft,
  setTeamNameDraft,
  defaultMyTeamName,
  saveTeamName,
  randomizeTeamName,
  teamLabel,
  truncateName,
  formatSeconds,
}: TeamNamingSectionProps) {
  const captainA = (roomState.players || []).find((player) => player.peerId === roomState.captains?.A);
  const captainB = (roomState.players || []).find((player) => player.peerId === roomState.captains?.B);
  const teamAReady = teamNamingReadyTeams.A;
  const teamBReady = teamNamingReadyTeams.B;
  const pendingTeams = (["A", "B"] as Team[]).filter((team) => !teamNamingReadyTeams[team]);
  const canEditMyTeamName =
    !!myTeam && (isClassicMode ? isMyCaptain : !effectiveIsHost) && !teamNamingReadyTeams[myTeam];
  const teamNamingInputClass =
    "min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-white placeholder:text-white/60 outline-none transition focus:border-white/50";
  const teamNamingButtonClass =
    myTeam === "B"
      ? "bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 shadow-rose-900/25"
      : "bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 shadow-sky-900/25";

  return (
    <section className="rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-2xl font-semibold">Названия команд</h3>
        <p className="rounded-xl bg-white/15 px-3 py-1 text-lg font-bold">
          {pendingTeams.length ? `00:${formatSeconds(teamNamingLeft)}` : "Готово"}
        </p>
      </div>

      <p className="mt-2 text-white/75">
        {isClassicMode
          ? "Команда, которая уже задала название, отмечается как готовая. Остальные продолжают по таймеру."
          : "Любой участник команды может задать название. После этого команда отмечается готовой."}
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className={`rounded-2xl border p-4 ${TEAM_SECTOR_META.A.cardClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-white/70">Команда A</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                teamAReady ? "bg-emerald-500/20 text-emerald-200" : "bg-white/15 text-white/80"
              }`}
            >
              {teamAReady ? "Готово" : `Таймер: 00:${formatSeconds(teamNamingLeft)}`}
            </span>
          </div>
          <p className="mt-1 text-xl font-bold">{teamLabel("A")}</p>
          {isClassicMode ? (
            <p className="mt-2 text-sm text-white/70" title={captainA?.name || undefined}>
              Капитан: {captainA ? truncateName(captainA.name, 24) : "-"}
            </p>
          ) : (
            <p className="mt-2 text-sm text-white/70">Без капитана</p>
          )}
        </div>
        <div className={`rounded-2xl border p-4 ${TEAM_SECTOR_META.B.cardClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-white/70">Команда B</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                teamBReady ? "bg-emerald-500/20 text-emerald-200" : "bg-white/15 text-white/80"
              }`}
            >
              {teamBReady ? "Готово" : `Таймер: 00:${formatSeconds(teamNamingLeft)}`}
            </span>
          </div>
          <p className="mt-1 text-xl font-bold">{teamLabel("B")}</p>
          {isClassicMode ? (
            <p className="mt-2 text-sm text-white/70" title={captainB?.name || undefined}>
              Капитан: {captainB ? truncateName(captainB.name, 24) : "-"}
            </p>
          ) : (
            <p className="mt-2 text-sm text-white/70">Без капитана</p>
          )}
        </div>
      </div>

      {canEditMyTeamName ? (
        <div className="mt-5 rounded-2xl border border-white/20 bg-white/5 p-4">
          <p className="text-sm text-white/70">
            {isClassicMode
              ? "Вы капитан. Можно изменить название команды."
              : "Можно задать название вашей команды."}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={teamNameDraft}
              onChange={(e) => setTeamNameDraft(e.target.value)}
              maxLength={32}
              className={teamNamingInputClass}
              placeholder={defaultMyTeamName || "Название команды"}
            />
            <button
              onClick={saveTeamName}
              className={`rounded-xl ${teamNamingButtonClass} px-4 py-2 font-semibold text-white shadow-lg transition hover:brightness-110`}
            >
              Сохранить
            </button>
            <button
              onClick={randomizeTeamName}
              className={`inline-flex items-center gap-2 rounded-xl ${teamNamingButtonClass} px-4 py-2 font-semibold text-white shadow-lg transition hover:brightness-110`}
            >
              <Shuffle className="h-4 w-4" />
              Случайное
            </button>
          </div>
        </div>
      ) : !!myTeam && teamNamingReadyTeams[myTeam] && (isClassicMode ? isMyCaptain : !effectiveIsHost) ? (
        <p className="mt-5 text-sm text-emerald-200">Ваша команда уже задала название. Ожидаем вторую команду.</p>
      ) : (
        <p className="mt-5 text-sm text-white/70">
          {effectiveIsHost
            ? isClassicMode
              ? "Ждём, пока капитаны завершат выбор названий."
              : "Ждём, пока команды зададут названия."
            : isClassicMode
            ? "Сейчас название команды может менять только капитан."
            : "Дождитесь, пока участник вашей команды задаст название."}
        </p>
      )}
    </section>
  );
}
