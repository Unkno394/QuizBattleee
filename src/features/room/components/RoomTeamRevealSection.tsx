import { Flag } from "lucide-react";
import type { CSSProperties } from "react";

import { MASCOT_DISPLAY_META, TEAM_SECTOR_META } from "@/features/room/constants";
import type { MascotKind, Phase, Player, Team } from "@/features/room/types";
import { getAvatarInitial, truncateName } from "@/features/room/utils";
import { Frame } from "@/shared/shop/Frame";

type Props = {
  teamRevealCountdown: number;
  myTeam: Team | null;
  isClassicMode: boolean;
  effectiveIsHost: boolean;
  teamAPlayers: Player[];
  teamBPlayers: Player[];
  teamLabel: (team: Team) => string;
  roomPhase?: Phase;
  getPlayerAvatarStyle: (player: Player, phase?: Phase) => CSSProperties;
};

export function RoomTeamRevealSection({
  teamRevealCountdown,
  myTeam,
  isClassicMode,
  effectiveIsHost,
  teamAPlayers,
  teamBPlayers,
  teamLabel,
  roomPhase,
  getPlayerAvatarStyle,
}: Props) {
  const showCountdown = teamRevealCountdown > 0;
  const teamMeta = myTeam ? TEAM_SECTOR_META[myTeam] : null;
  const teamMascotKind: MascotKind | null = myTeam === "A" ? "dog" : myTeam === "B" ? "cat" : null;
  const teamMascotMeta = teamMascotKind ? MASCOT_DISPLAY_META[teamMascotKind] : null;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/30 bg-black/60 p-5 backdrop-blur-xl sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-black/35" />
      <div className="relative z-10 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-white/60">Подготовка раунда</p>

        {showCountdown ? (
          <>
            <h3 className="mt-3 text-2xl font-semibold">Формирование команд...</h3>
            <p className="mt-4 text-7xl font-black leading-none">{teamRevealCountdown}</p>
          </>
        ) : teamMeta ? (
          <>
            <div
              className={`mx-auto mt-4 inline-flex h-16 w-16 items-center justify-center rounded-full border ${teamMeta.flagWrapClass}`}
            >
              <Flag className={`h-8 w-8 ${teamMeta.flagClass}`} />
            </div>
            <h3 className={`mt-2 text-3xl font-black ${teamMeta.textClass}`}>ВЫ — КОМАНДА {teamMeta.label}</h3>
            <p className="mt-3 text-sm text-white/70">
              {isClassicMode
                ? "Сейчас начнется этап выбора капитана."
                : "Сейчас начнется этап выбора названия команды."}
            </p>
            {teamMascotMeta ? (
              <p className="mt-2 text-sm text-white/75">
                Ваш талисман <span className="font-semibold text-white">{teamMascotMeta.title}</span> добавлен!
              </p>
            ) : null}
          </>
        ) : (
          <>
            <h3 className="mt-3 text-2xl font-semibold">Команды сформированы</h3>
            <p className="mt-2 text-white/70">
              {isClassicMode ? "Переходим к выбору капитанов." : "Переходим к выбору названий команд."}
            </p>
          </>
        )}
      </div>

      {effectiveIsHost ? (
        <div className="relative z-10 mt-6 grid gap-3 md:grid-cols-2">
          <div className={`rounded-2xl border p-4 ${TEAM_SECTOR_META.A.cardClass}`}>
            <p className="font-semibold text-sky-300">{teamLabel("A")}</p>
            <ul className="mt-2 space-y-1 text-sm text-white/90">
              {teamAPlayers.length
                ? teamAPlayers.map((player) => (
                    <li key={player.peerId} className="flex min-w-0 items-center gap-3">
                      <Frame
                        frameId={player.profileFrame}
                        className="h-7 w-7 shrink-0"
                        radiusClass="rounded-full"
                        innerClassName="p-0"
                        tuningVariant="room"
                      >
                        <span
                          className="inline-flex h-full w-full items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={getPlayerAvatarStyle(player, roomPhase)}
                        >
                          {player.avatar ? "" : getAvatarInitial(player.name)}
                        </span>
                      </Frame>
                      <span className="min-w-0 flex-1 truncate" title={player.name}>
                        {truncateName(player.name)}
                      </span>
                    </li>
                  ))
                : <li>Пока пусто</li>}
            </ul>
          </div>
          <div className={`rounded-2xl border p-4 ${TEAM_SECTOR_META.B.cardClass}`}>
            <p className="font-semibold text-rose-300">{teamLabel("B")}</p>
            <ul className="mt-2 space-y-1 text-sm text-white/90">
              {teamBPlayers.length
                ? teamBPlayers.map((player) => (
                    <li key={player.peerId} className="flex min-w-0 items-center gap-3">
                      <Frame
                        frameId={player.profileFrame}
                        className="h-7 w-7 shrink-0"
                        radiusClass="rounded-full"
                        innerClassName="p-0"
                        tuningVariant="room"
                      >
                        <span
                          className="inline-flex h-full w-full items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={getPlayerAvatarStyle(player, roomPhase)}
                        >
                          {player.avatar ? "" : getAvatarInitial(player.name)}
                        </span>
                      </Frame>
                      <span className="min-w-0 flex-1 truncate" title={player.name}>
                        {truncateName(player.name)}
                      </span>
                    </li>
                  ))
                : <li>Пока пусто</li>}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
