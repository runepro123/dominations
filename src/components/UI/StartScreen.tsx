// Start screen: pick your nation. Lists great powers first, then everyone else.

import { useMemo, useState } from 'react';
import { useGame } from '../../game/store';
import type { CountryRecord } from '../../game/types';
import { SettingsPanel } from './SettingsPanel';

const GREY_POWERS = new Set([
  '840', // USA
  '156', // China
  '643', // Russia
  '356', // India
  '826', // UK
  '250', // France
  '276', // Germany
  '392', // Japan
  '076', // Brazil
  '036', // Australia
  '124', // Canada
  '792', // Turkey
  '364', // Iran
  '682', // Saudi Arabia
  '710', // South Africa
  '484', // Mexico
]);

export function StartScreen() {
  const countries = useGame((s) => s.countries);
  const begin = useGame((s) => s.begin);
  const order = useGame((s) => s.order);
  const [hovered, setHovered] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const list = useMemo(() => {
    return order
      .map((id) => countries[id])
      .filter((c): c is CountryRecord => Boolean(c))
      .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.iso3.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const aGreat = GREY_POWERS.has(a.id) ? 1 : 0;
        const bGreat = GREY_POWERS.has(b.id) ? 1 : 0;
        if (aGreat !== bGreat) return bGreat - aGreat;
        return b.baseValue - a.baseValue;
      });
  }, [countries, order, search]);

  const featured = hovered ? countries[hovered] : list[0];

  if (order.length === 0) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-900 pointer-events-auto">
        <div className="flex items-center gap-3 text-slate-300">
          <div className="w-3 h-3 rounded-full bg-accent-gold animate-pulseRing" />
          <span className="font-display tracking-widest text-sm">LOADING NATIONS…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-ink-900/85 backdrop-blur-sm pointer-events-auto">
      <div className="px-3 sm:px-10 py-3 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <Globe className="w-7 h-7 sm:w-9 sm:h-9 text-accent-gold animate-pulse shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display font-black text-lg sm:text-2xl tracking-wider text-accent-gold">
              DOMINATION
            </h1>
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-slate-400 truncate">
              World Conquest Simulator · Era {useGame.getState().year}
            </p>
            <p className="text-[9px] sm:text-[10px] tracking-[0.2em] text-slate-500 mt-0.5 hidden sm:block">
              V1 ships with modern borders · 1500–1900 eras arrive in 1.1
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search nations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-ink-700/80 border border-white/10 rounded-full px-3 py-1.5 text-sm placeholder:text-slate-500 focus:outline-none focus:border-accent-gold/60 flex-1 sm:flex-none sm:min-w-[220px]"
          />
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={() => setShowSettings(true)}
            className="w-9 h-9 shrink-0 rounded-full bg-ink-700/80 border border-white/10 flex items-center justify-center text-slate-300 hover:text-accent-gold hover:border-accent-gold/60 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_420px] overflow-hidden">
        <div className="overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {list.map((c) => {
              const great = GREY_POWERS.has(c.id);
              return (
                <button
                  key={c.id}
                  onMouseEnter={() => setHovered(c.id)}
                  onClick={() => begin(c.id)}
                  className={`group relative flex flex-col items-start gap-1.5 p-3.5 rounded-xl border text-left transition-all duration-200 bg-ink-700/60 hover:bg-ink-600/80 ${
                    great ? 'border-accent-gold/40 hover:border-accent-gold' : 'border-white/5 hover:border-accent-azure/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5 w-full">
                    <span className="text-2xl drop-shadow">{c.flag}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold text-sm truncate">{c.name}</div>
                      <div className="text-[10px] tracking-widest text-slate-400 uppercase">{c.iso3} · {c.continent}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 w-full mt-1">
                    <Stat label="POP" value={c.population.toFixed(0)} unit="M" />
                    <Stat label="GDP" value={c.baseValue.toFixed(0)} />
                    <Stat label="ID" value={c.id} />
                  </div>
                  {great && (
                    <div className="absolute -top-1 -right-1 text-[9px] tracking-[0.2em] font-bold uppercase bg-accent-gold/90 text-ink-900 px-1.5 py-0.5 rounded">
                      Major
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="hidden lg:flex flex-col gap-4 border-l border-white/10 p-6 bg-ink-800/60">
          <h2 className="font-display font-black text-lg tracking-wider">Strategic Briefing</h2>
          {featured ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <span className="text-6xl drop-shadow">{featured.flag}</span>
                <div>
                  <div className="font-display font-bold text-xl">{featured.name}</div>
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
                    {featured.continent} · {featured.population.toFixed(0)}M people
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Conquer neighbours, fund militaries, and manage the mood of your citizens.
                World events unfold turn-by-turn as rival powers expand their own blocs.
              </p>
              <div className="space-y-2 pt-2">
                <h3 className="text-xs tracking-[0.25em] uppercase text-slate-400">Order of Battle</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <BarRow label="Industry" value={featured.baseValue * 4} max={1000} colorClass="bg-accent-gold" />
                  <BarRow label="Population" value={featured.population} max={1500} colorClass="bg-accent-azure" />
                  <BarRow label="Reach" value={featured.neighbors.length * 14} max={420} colorClass="bg-accent-jade" />
                </div>
              </div>
              <button
                onClick={() => begin(featured.id)}
                className="mt-auto w-full bg-accent-gold text-ink-900 font-display font-black tracking-wider py-3 rounded-lg shadow-lg shadow-accent-gold/30 hover:scale-[1.02] transition-transform"
              >
                BEGIN AS {featured.iso3}
              </button>
              <div className="text-[11px] text-slate-500 leading-relaxed">
                You begin with strong reserves and an aggressive diplomatic posture. Five rival superpowers
                begin with lighter resources but will grow over time.
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">Hover a nation to inspect.</div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-md bg-ink-900/40 px-1.5 py-1">
      <div className="text-[8px] tracking-[0.15em] uppercase text-slate-500">{label}</div>
      <div className="text-[11px] font-semibold text-slate-200 truncate">
        {value}
        {unit && <span className="text-[8px] text-slate-500 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

function BarRow({ label, value, max, colorClass }: { label: string; value: number; max: number; colorClass: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Globe(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <radialGradient id="g" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.2" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#g)" />
      <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="currentColor" strokeOpacity="0.5" />
      <ellipse cx="32" cy="32" rx="10" ry="28" fill="none" stroke="currentColor" strokeOpacity="0.5" />
      <path d="M5 32 Q 32 14 59 32" fill="none" stroke="currentColor" strokeOpacity="0.6" />
      <path d="M5 32 Q 32 50 59 32" fill="none" stroke="currentColor" strokeOpacity="0.6" />
    </svg>
  );
}
