// Victory / defeat end screen with restart.

import { useGame } from '../../game/store';
import { useMemo } from 'react';

export function EndScreen() {
  const phase = useGame((s) => s.phase);
  const countries = useGame((s) => s.countries);
  const totalTurns = useGame((s) => s.totalTurns);
  const reset = useGame((s) => s.reset);

  const stats = useMemo(() => {
    let owned = 0,
      total = 0,
      pop = 0,
      target = 0;
    for (const id in countries) {
      const c = countries[id]!;
      total += 1;
      if (c.owner === 'player') {
        owned += 1;
        pop += c.population;
      }
    }
    target = total;
    return { owned, total, pop, target };
  }, [countries]);

  if (phase !== 'won' && phase !== 'lost') return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-900/85 backdrop-blur-md pointer-events-auto">
      <div className="relative m-4 max-w-3xl w-full rounded-3xl border border-white/10 bg-ink-800/95 shadow-2xl shadow-black/60 overflow-hidden">
        <div className={`absolute inset-x-0 top-0 h-1 ${phase === 'won' ? 'bg-accent-gold' : 'bg-accent-crimson'}`} />
        <div className="p-6 sm:p-10 text-center">
          <div className={`font-display font-black text-4xl sm:text-6xl tracking-widest mb-3 ${phase === 'won' ? 'text-accent-gold' : 'text-accent-crimson'}`}>
            {phase === 'won' ? '★ WORLD DOMINATION ★' : 'EMPIRE COLLAPSED'}
          </div>
          <h2 className="font-display text-xl sm:text-2xl tracking-wider mb-4 text-slate-200">
            {phase === 'won' ? 'A new world order is born in your name.' : 'Internal unrest toppled your regime.'}
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-6">
            <Cell label="Nations" value={`${stats.owned} / ${stats.total}`} />
            <Cell label="Population" value={`${Math.round(stats.pop).toLocaleString()}M`} />
            <Cell label="Turns" value={`${totalTurns}`} />
            <Cell label="Outcome" value={phase === 'won' ? 'Absolute' : 'Collapse'} />
          </div>

          <p className="text-sm text-slate-400 leading-relaxed mb-6 max-w-xl mx-auto">
            {phase === 'won'
              ? 'Every nation stands unified under your flag. Trade, culture, and military command now flow from a single capital. The era of conquest closes here — but the era of governance begins.'
              : 'Your people have revolted. Centuries of conquest cannot disguise the void at the heart of empire. Step back, learn the lessons of supply and morale, and try again.'}
          </p>

          <button
            onClick={() => reset()}
            className="px-6 py-3 bg-accent-gold text-ink-900 font-display font-black tracking-widest rounded-lg shadow-lg shadow-accent-gold/30 hover:scale-[1.03] transition-transform"
          >
            CONQUER AGAIN
          </button>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-700/60 border border-white/5 py-3">
      <div className="text-[10px] tracking-[0.25em] uppercase text-slate-400">{label}</div>
      <div className="font-display font-bold text-lg text-slate-100">{value}</div>
    </div>
  );
}
