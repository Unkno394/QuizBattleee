import { formatSeconds, truncateName } from "@/features/room/utils";

type HostReconnectSectionProps = {
  disconnectedHostName?: string | null;
  hostReconnectLeft: number;
};

export function HostReconnectSection({
  disconnectedHostName,
  hostReconnectLeft,
}: HostReconnectSectionProps) {
  const disconnectedHost = disconnectedHostName || "Ведущий";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-amber-300/35 bg-black/55 p-5 backdrop-blur-xl sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-black/40" />
      <div className="relative z-10 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-amber-200/80">Пауза игры</p>
        <h3 className="mt-3 text-3xl font-bold text-amber-100">Ведущий отключился</h3>
        <p className="mt-2 text-white/80">{truncateName(disconnectedHost, 24)} временно вне сети.</p>
        <p className="mt-4 text-lg text-white/90">
          Ожидаем переподключения ({formatSeconds(hostReconnectLeft)} сек)
        </p>
        <p className="mt-2 text-sm text-white/70">
          Если ведущий не вернётся, через 30 секунд назначится новый ведущий.
        </p>
      </div>
    </section>
  );
}

type ManualPauseSectionProps = {
  manualPauseByName?: string | null;
  effectiveIsHost: boolean;
};

export function ManualPauseSection({ manualPauseByName, effectiveIsHost }: ManualPauseSectionProps) {
  const pausedBy = (manualPauseByName || "Ведущий").trim() || "Ведущий";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-sky-300/35 bg-black/55 p-5 backdrop-blur-xl sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-black/40" />
      <div className="relative z-10 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-sky-200/80">Пауза игры</p>
        <h3 className="mt-3 text-3xl font-bold text-sky-100">Игра приостановлена</h3>
        <p className="mt-2 text-white/85">Пауза от ведущего: {truncateName(pausedBy, 28)}.</p>
        <p className="mt-3 text-white/90">Чат открыт для всех участников.</p>
        <p className="mt-2 text-sm text-white/70">
          {effectiveIsHost ? "Нажмите «Продолжить», чтобы вернуть игру." : "Ожидаем, пока ведущий снимет паузу."}
        </p>
      </div>
    </section>
  );
}
