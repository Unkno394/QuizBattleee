import { Crown, Users } from "lucide-react";
import type { CSSProperties } from "react";

import type { GameMode, Phase, Player } from "@/features/room/types";
import { Frame } from "@/shared/shop/Frame";

type Props = {
  roomTopic: string;
  roomId: string;
  pin: string;
  hostPlayerName: string;
  players: Player[];
  roomPhase?: Phase;
  gameMode: GameMode;
  effectiveIsHost: boolean;
  formatDisplayName: (name: string, targetPeerId?: string | null, maxLength?: number) => string;
  getAvatarInitial: (name: string) => string;
  getPlayerAvatarStyle: (player: Player, phase?: Phase) => CSSProperties;
  onStartGame: () => void;
};

export function RoomLobbySection({
  roomTopic,
  roomId,
  pin,
  hostPlayerName,
  players,
  roomPhase,
  gameMode,
  effectiveIsHost,
  formatDisplayName,
  getAvatarInitial,
  getPlayerAvatarStyle,
  onStartGame,
}: Props) {
  const host = players.find((player) => player.isHost) || null;
  const participants = players.filter((player) => !player.isHost);

  return (
    <section className="min-w-0 rounded-3xl border border-white/20 bg-black/35 p-5 backdrop-blur-md max-[424px]:p-4 sm:p-6 lg:flex lg:h-full lg:flex-col">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="break-words text-2xl font-semibold max-[424px]:text-xl">{roomTopic || "QuizBattle"}</h2>
            <p className="text-sm text-white/70">PIN: {roomId || pin}</p>
            <p className="text-sm text-white/70" title={hostPlayerName ? formatDisplayName(hostPlayerName, undefined, 32) : undefined}>
              Ведущий: {hostPlayerName ? formatDisplayName(hostPlayerName, undefined, 20) : "-"}
            </p>
          </div>
          <p className="rounded-full bg-white/15 px-3 py-1 text-sm">Ожидаем начала</p>
        </div>

        <div className="mt-4 space-y-3 rounded-xl border border-white/20 bg-white/5 p-3 text-sm text-white/85">
          <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3">
            <p className="mb-2 flex items-center gap-2 font-semibold text-amber-200">
              <Crown className="h-4 w-4" />
              <span>Ведущий</span>
            </p>
            {host ? (
              <div className="flex min-w-0 items-center gap-3">
                <Frame
                  frameId={host.profileFrame}
                  className="h-7 w-7 shrink-0"
                  radiusClass="rounded-full"
                  innerClassName="p-0"
                >
                  <span
                    className="inline-flex h-full w-full items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={getPlayerAvatarStyle(host, roomPhase)}
                  >
                    {host.avatar ? "" : getAvatarInitial(host.name)}
                  </span>
                </Frame>
                <span className="min-w-0 flex-1 truncate" title={host.name}>
                  {formatDisplayName(host.name, host.peerId)}
                </span>
              </div>
            ) : (
              <p className="text-white/60">Ожидаем ведущего...</p>
            )}
          </div>

          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <Users className="h-4 w-4" />
              <span>Участники ({participants.length})</span>
            </p>
            <ul className="max-h-48 overflow-y-auto pr-1 space-y-1 sm:max-h-56 lg:max-h-64 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0 2xl:grid-cols-3">
              {participants.length ? (
                participants.map((player) => (
                  <li key={player.peerId} className="flex min-w-0 items-center gap-3">
                    <Frame
                      frameId={player.profileFrame}
                      className="h-7 w-7 shrink-0"
                      radiusClass="rounded-full"
                      innerClassName="p-0"
                    >
                      <span
                        className="inline-flex h-full w-full items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={getPlayerAvatarStyle(player, roomPhase)}
                      >
                        {player.avatar ? "" : getAvatarInitial(player.name)}
                      </span>
                    </Frame>
                    <span className="min-w-0 flex-1 truncate" title={player.name}>
                      {formatDisplayName(player.name, player.peerId)}
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-white/60">Пока нет участников</li>
              )}
            </ul>
          </div>
        </div>

        <p className="mt-4 text-sm text-white/70">
          {gameMode === "ffa"
            ? "Режим FFA: после старта каждый играет сам за себя, без команд и капитанов."
            : gameMode === "chaos"
            ? "Режим Командный хаос: команды формируются автоматически, без капитанов."
            : "До старта никто не видит свою команду. Распределение появится после команды ведущего."}
        </p>
      </div>

      <div className="mt-4 lg:mt-auto lg:pt-4">
        {effectiveIsHost ? (
          <button
            onClick={onStartGame}
            className="mt-5 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
          >
            {gameMode === "ffa" ? "Запустить FFA-раунд" : "Запустить формирование команд"}
          </button>
        ) : (
          <p className="mt-5 text-sm text-white/70">Старт игры запускает ведущий.</p>
        )}
      </div>
    </section>
  );
}
