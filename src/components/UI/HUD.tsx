// Top HUD: gold, income, owned country count, average happiness, year.

import { useGame } from '../../game/store';
import { useMemo } from 'react';

export function HUD() {
  const gold = useGame((s) => s.gold);
  const income = useGame((s) => s.incomePerTurn);
  const countries = useGame((s) => s.countries);
  const year = useGame((s) => s.year);
  const phase = useGame((s) => s.phase);

  const stats = useMemo(() => {
    let owned = 0,
      total = 0,
      avgHappy = 0,
      avgMil = 0,
      avgDef = 0;
    for (const id in countries) {
      const c = countries[id]!;
      total += 1;
      if (c.owner === 'player') {
        owned += 1;
        avgHappy += c.happiness;
        avgMil += c.military;
        avgDef += c.defense;
      }
    }
    return {
      owned,
      total,
      pct: total === 0 ? 0 : Math.round((owned / total) * 100),
      avgHappy: owned ? Math.round(avgHappy / owned) : 0,
      avgMil: owned ? Math.round(avgMil / owned) : 0,
      avgDef: owned ? Math.round(avgDef / owned) : 0,
    };
  }, [countries]);

  if (phase !== 'playing') return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col">
      <div className="pointer-events-auto mx-auto mt-2 sm:mt-3 w-[min(96vw,1080px)] rounded-2xl bg-ink-700/85 backdrop-blur-md border border-white/10 px-2.5 sm:px-6 py-1.5 sm:py-3 flex items-center gap-1.5 sm:gap-6 shadow-2xl shadow-black/40">
        <Stat
          icon={<Coin />}
          label="Gold"
          value={Math.round(gold).toLocaleString()}
          sub={`+${income}/t`}
          subPositive={income >= 0}
          compact
        />
        <Divider />
        <Stat
          icon={<Crown />}
          label="Empire"
          value={`${stats.owned}/${stats.total}`}
          sub={`${stats.pct}%`}
          progress={stats.pct}
          compact
        />
        <Divider />
        <Stat
          icon={<Heart />}
          label="Morale"
          value={`${stats.avgHappy}%`}
          sub={stats.avgHappy >= 60 ? 'OK' : stats.avgHappy >= 30 ? 'Mid' : 'Low'}
          bar={stats.avgHappy}
          barTone={stats.avgHappy < 30 ? 'danger' : stats.avgHappy < 60 ? 'warn' : 'good'}
          compact
        />
        <Divider />
        <Stat
          icon={<Shield />}
          label="Defense"
          value={`${stats.avgDef}`}
          sub={stats.avgDef >= 50 ? 'OK' : 'Low'}
          bar={stats.avgDef}
          barTone={stats.avgDef < 40 ? 'danger' : 'good'}
          compact
        />
        <div className="ml-auto pl-1 sm:pl-3 flex items-center gap-1">
          <div className="flex sm:hidden flex-col items-end">
            <div className="text-[8px] tracking-[0.2em] uppercase text-slate-400">Era</div>
            <div className="font-display font-black text-sm text-accent-gold leading-none">{Math.round(year)}</div>
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] tracking-[0.25em] uppercase text-slate-400">Era</div>
            <div className="font-display font-black text-xl text-accent-gold leading-none">{Math.round(year)}</div>
          </div>
        </div>
      </div>

      {/* Conquest progress bar */}
      <div className="pointer-events-none mx-auto mt-1.5 sm:mt-2 w-[min(96vw,1080px)] h-1 sm:h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent-jade via-accent-azure to-accent-gold transition-all duration-500"
          style={{ width: `${stats.pct}%` }}
        />
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  subPositive = true,
  progress,
  bar,
  barTone,
  compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  subPositive?: boolean;
  progress?: number;
  bar?: number;
  barTone?: 'good' | 'warn' | 'danger';
  compact?: boolean;
}) {
  const toneBar =
    barTone === 'danger' ? 'bg-accent-crimson' : barTone === 'warn' ? 'bg-accent-gold' : 'bg-accent-jade';
  return (
    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
      <div className={`${compact ? 'w-6 h-6 sm:w-9 sm:h-9' : 'w-9 h-9'} rounded-full bg-white/5 flex items-center justify-center text-accent-gold shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className={`${compact ? 'text-[8px] sm:text-[9px]' : 'text-[9px]'} tracking-[0.2em] sm:tracking-[0.25em] uppercase text-slate-400 truncate`}>{label}</div>
        <div className={`font-display font-bold ${compact ? 'text-[12px] sm:text-lg' : 'text-lg'} leading-tight text-slate-100 truncate`}>{value}</div>
        {sub && (
          <div className={`${compact ? 'text-[9px] sm:text-[10px]' : 'text-[10px]'} ${subPositive ? 'text-accent-jade' : 'text-accent-crimson'} font-medium truncate`}>
            {sub}
          </div>
        )}
        {progress !== undefined && (
          <div className={`mt-0.5 sm:mt-1 ${compact ? 'h-[2px] sm:h-1' : 'h-1'} rounded-full bg-white/5 overflow-hidden`}>
            <div className="h-full bg-accent-gold" style={{ width: `${progress}%` }} />
          </div>
        )}
        {bar !== undefined && (
          <div className={`mt-0.5 sm:mt-1 ${compact ? 'h-[2px] sm:h-1' : 'h-1'} rounded-full bg-white/5 overflow-hidden`}>
            <div className={`h-full ${toneBar}`} style={{ width: `${bar}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="hidden sm:block h-6 lg:h-10 w-px bg-white/10" />;
}

function Coin() {
  return (
    <svg viewBox="0 0 24 24" className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 13l3-3 3 3" />
    </svg>
  );
}
function Crown() {
  return (
    <svg viewBox="0 0 24 24" className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor">
      <path d="M3 7l4 5 5-7 5 7 4-5v11H3V7z" />
    </svg>
  );
}
function Heart() {
  return (
    <svg viewBox="0 0 24 24" className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor">
      <path d="M12 21s-7-4.5-7-11a4 4 0 017-2.65A4 4 0 0119 10c0 6.5-7 11-7 11z" />
    </svg>
  );
}
function Shield() {
  return (
    <svg viewBox="0 0 24 24" className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l8 3v6c0 5-4 9-8 9s-8-4-8-9V6l8-3z" />
    </svg>
  );
}
