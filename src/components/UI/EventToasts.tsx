// Scrolling event feed – AI wars, conquests, and diplomatic flashes.

import { useGame } from '../../game/store';

const accentByKind: Record<string, string> = {
  info: 'border-accent-azure/40',
  war: 'border-accent-crimson/50',
  economy: 'border-accent-gold/50',
  diplomacy: 'border-accent-jade/40',
  danger: 'border-accent-crimson/60',
};

export function EventToasts() {
  const events = useGame((s) => s.events);

  return (
    <div className="pointer-events-none absolute left-0 right-0 sm:right-auto top-[68px] sm:top-[110px] z-10 max-w-[min(100vw-1rem,260px)] sm:max-w-[320px] p-2 sm:p-3 space-y-1.5 max-h-[calc(100dvh-220px)] sm:max-h-[calc(100dvh-180px)] overflow-y-auto scroll-thin">
      {events.slice(0, 5).map((e) => (
        <div
          key={e.id}
          className={`pointer-events-auto group relative rounded-lg px-2.5 py-1.5 text-[11px] xs:text-[12px] sm:text-[13px] leading-snug backdrop-blur-md bg-ink-700/85 border-l-4 ${accentByKind[e.kind] ?? 'border-white/30'} border-y border-r border-white/5 shadow-md shadow-black/30`}
        >
          <div className="absolute inset-0 rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
          {e.message}
        </div>
      ))}
    </div>
  );
}
