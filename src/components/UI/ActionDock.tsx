// Bottom action dock: friendly quick actions + special actions + AI hostility.

import { useGame } from '../../game/store';
import { useMemo } from 'react';
import { PLAYER_ACTION } from '../../game/constants';

export function ActionDock() {
  const selectedId = useGame((s) => s.selectedCountryId);
  const countries = useGame((s) => s.countries);
  const gold = useGame((s) => s.gold);
  const totalTurns = useGame((s) => s.totalTurns);

  const selected = selectedId ? countries[selectedId] : null;

  const ordered = useMemo(() => {
    const list = Object.values(countries).filter((c) => c.owner === 'player');
    return list.sort((a, b) => a.cy - b.cy);
  }, [countries]);

  if (!selected || selected.owner !== 'player') return null;

  const flagChips =
    ordered.length <= 6 ? ordered : ordered.slice(0, 5);

  return (
    <div className="pointer-events-none absolute bottom-0 inset-x-0 z-20">
      <div className="pointer-events-auto mx-auto mb-2 sm:mb-4 w-[min(96vw,1080px)] rounded-2xl bg-ink-700/85 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/40 p-1.5 sm:p-3 flex items-center gap-1 sm:gap-2 lg:gap-3 flex-wrap sm:flex-nowrap">
        <div className="hidden lg:flex items-center gap-2 px-2 sm:px-3">
          <span className="text-[10px] tracking-[0.25em] uppercase text-slate-400">Holdings</span>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {flagChips.map((c) => (
              <button
                key={c.id}
                onClick={() => useGame.getState().select(c.id)}
                className={`text-xl transition-transform hover:scale-110 ${c.id === selectedId ? 'drop-shadow-[0_0_4px_rgba(245,197,66,0.7)]' : 'opacity-80'}`}
                title={c.name}
              >
                {c.flag}
              </button>
            ))}
          </div>
        </div>
        <div className="hidden lg:block h-8 w-px bg-white/10" />

        <button
          onClick={() => useGame.getState().recruit()}
          disabled={gold < PLAYER_ACTION.recruitAmount * PLAYER_ACTION.recruitCostPerPoint}
          className="flex-1 min-w-0 sm:min-w-[110px] flex items-center justify-between gap-1 sm:gap-2 lg:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.10] disabled:opacity-40 disabled:cursor-not-allowed border border-white/5"
        >
          <div className="text-left min-w-0">
            <div className="text-[9px] sm:text-[10px] tracking-widest uppercase text-slate-400">Recruit</div>
            <div className="text-[11px] sm:text-[12px] font-bold truncate">+{PLAYER_ACTION.recruitAmount}</div>
          </div>
          <span className="text-[10px] sm:text-[11px] font-bold text-accent-gold whitespace-nowrap">−{PLAYER_ACTION.recruitAmount * PLAYER_ACTION.recruitCostPerPoint}g</span>
        </button>

        <button
          onClick={() => useGame.getState().fortify()}
          disabled={selected.fortification >= 5 || gold < PLAYER_ACTION.fortifyAmount * PLAYER_ACTION.fortifyCostPerPoint}
          className="flex-1 min-w-0 sm:min-w-[110px] flex items-center justify-between gap-1 sm:gap-2 lg:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.10] disabled:opacity-40 disabled:cursor-not-allowed border border-white/5"
        >
          <div className="text-left min-w-0">
            <div className="text-[9px] sm:text-[10px] tracking-widest uppercase text-slate-400">Fortify</div>
            <div className="text-[11px] sm:text-[12px] font-bold truncate">L{Math.min(5, selected.fortification + 1)} 🛡</div>
          </div>
          <span className="text-[10px] sm:text-[11px] font-bold text-accent-gold whitespace-nowrap">−{PLAYER_ACTION.fortifyAmount * PLAYER_ACTION.fortifyCostPerPoint}g</span>
        </button>

        <button
          onClick={() => useGame.getState().subsidize()}
          disabled={gold < PLAYER_ACTION.subsidizeAmount * PLAYER_ACTION.subsidizeCostPerPoint}
          className="flex-1 min-w-0 sm:min-w-[90px] flex items-center justify-between gap-1 sm:gap-2 lg:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.10] disabled:opacity-40 disabled:cursor-not-allowed border border-white/5"
        >
          <div className="text-left min-w-0">
            <div className="text-[9px] sm:text-[10px] tracking-widest uppercase text-slate-400">Civics</div>
            <div className="text-[11px] sm:text-[12px] font-bold truncate">+{PLAYER_ACTION.subsidizeAmount} 😊</div>
          </div>
          <span className="text-[10px] sm:text-[11px] font-bold text-accent-gold whitespace-nowrap">−{PLAYER_ACTION.subsidizeAmount * PLAYER_ACTION.subsidizeCostPerPoint}g</span>
        </button>

        <button
          onClick={() => useGame.getState().tax()}
          className="flex-1 min-w-0 sm:min-w-[90px] flex items-center justify-between gap-1 sm:gap-2 lg:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.10] border border-white/5"
        >
          <div className="text-left min-w-0">
            <div className="text-[9px] sm:text-[10px] tracking-widest uppercase text-slate-400">Tax</div>
            <div className="text-[11px] sm:text-[12px] font-bold truncate">+{PLAYER_ACTION.taxGainPerPoint}g</div>
          </div>
          <span className="text-[10px] sm:text-[11px] font-bold text-accent-crimson whitespace-nowrap">−{PLAYER_ACTION.taxHappinessCost} 😊</span>
        </button>

        <div className="basis-full sm:basis-auto sm:ml-auto hidden sm:flex flex-col items-end px-2">
          <span className="text-[10px] tracking-[0.2em] uppercase text-slate-400">Turn {totalTurns}</span>
          <span className="text-[11px] text-slate-300 font-mono">3s / tick</span>
        </div>
        <div className="basis-full sm:hidden flex justify-center items-center pt-0.5 -mt-0.5">
          <span className="text-[9px] tracking-[0.2em] uppercase text-slate-400">Turn {totalTurns} · 3s/tick</span>
        </div>
      </div>
    </div>
  );
}
