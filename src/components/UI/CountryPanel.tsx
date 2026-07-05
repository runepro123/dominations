// Country detail panel – slides in from the right when a country is selected.
// Now drives the in-progress war visualisation: declare war, sit through 4
// game ticks of bleed, and offer cancel / speed up / reinforce while a war
// is in flight.

import { useGame, labelForOwner } from '../../game/store';
import { useMemo, useState } from 'react';
import { COMBAT, MAX_STATS, PLAYER_ACTION, WAR } from '../../game/constants';
import type { ActiveWar, FactionState, OwnerId, Proposal, ProposalKind } from '../../game/types';

export function CountryPanel() {
  const [tab, setTab] = useState<'brief' | 'diplomacy'>('brief');
  const selectedId = useGame((s) => s.selectedCountryId);
  const countries = useGame((s) => s.countries);
  const gold = useGame((s) => s.gold);
  const target = useGame((s) => s.conquestTargetId);
  const activeWars = useGame((s) => s.activeWars);
  const declareWar = useGame((s) => s.declareWar);
  const cancelWar = useGame((s) => s.cancelWar);
  const speedUpWar = useGame((s) => s.speedUpWar);
  const reinforceWar = useGame((s) => s.reinforceWar);
  const setTarget = useGame((s) => s.setTarget);
  const factions = useGame((s) => s.factions);
  const proposals = useGame((s) => s.proposals);
  const proposalOrder = useGame((s) => s.proposalOrder);
  const proposeDiplomacy = useGame((s) => s.proposeDiplomacy);
  const respondProposal = useGame((s) => s.respondProposal);

  const selected = selectedId ? countries[selectedId] : null;

  const intel = useMemo(() => {
    if (!selected) return null;
    return selected.neighbors
      .map((id) => countries[id])
      .filter(Boolean)
      .sort((a, b) => a.defense - b.defense);
  }, [selected, countries]);

  // Sea-borne expedition candidates: any non-player-owned country NOT already a neighbor.
  const navalTargets = useMemo(() => {
    if (!selected) return null;
    return Object.values(countries)
      .filter(
        (c) =>
          c &&
          c.id !== selected.id &&
          c.owner !== 'player' &&
          !selected.neighbors.includes(c.id),
      )
      .sort((a, b) => a.defense - b.defense)
      .slice(0, 12);
  }, [selected, countries]);

  // Find any war this country is currently involved in.
  const warInvolvingSelected = useMemo<ActiveWar | null>(() => {
    if (!selected) return null;
    for (const id in activeWars) {
      const w = activeWars[id];
      if (w.attackerId === selected.id || w.defenderId === selected.id) return w;
    }
    return null;
  }, [activeWars, selected]);

  if (!selected) return null;

  const isPlayer = selected.owner === 'player';
  const isAI = selected.owner?.startsWith('ai_');
  // Existing war: panel can show attacker or defender combat UI.
  const playerAtkWar = warInvolvingSelected && selected.owner === 'player' && warInvolvingSelected.attackerId === selected.id
    ? warInvolvingSelected
    : null;
  const playerDefWar = warInvolvingSelected && selected.owner === 'player' && warInvolvingSelected.defenderId === selected.id
    ? warInvolvingSelected
    : null;
  const aiWarsHere = (isAI && warInvolvingSelected) ? warInvolvingSelected : null;

  const npcsAtWar = playerDefWar || aiWarsHere;

  // Player actions
  const canRecruit = isPlayer && gold >= PLAYER_ACTION.recruitAmount * PLAYER_ACTION.recruitCostPerPoint;
  const canFortify = isPlayer && selected.fortification < 5 && gold >= PLAYER_ACTION.fortifyAmount * PLAYER_ACTION.fortifyCostPerPoint;
  const canSubsidize = isPlayer && gold >= PLAYER_ACTION.subsidizeAmount * PLAYER_ACTION.subsidizeCostPerPoint;

  const warCostForTarget = (def: { defense: number }) =>
    Math.round(WAR.warChestBaseGold + def.defense * WAR.warChestDefScale);

  // Single deploy-war button info: rendered only when ANY target (land or naval)
  // is chosen on a player tile that isn't already at war. Cost is the actual
  // cost (×1.8 if naval) so the player can't be blindsided.
  // Plain const (NOT useMemo) so we don't add a hook AFTER the early-return
  // guard above — that violated React's rules-of-hooks and triggered #310.
  const deployInfo = (() => {
    const sel = selected;
    if (!isPlayer || playerAtkWar || !target || !sel) return null;
    const def = countries[target];
    if (!def || def.id === sel.id) return null;
    const isNaval = !sel.neighbors.includes(target);
    const baseCost = Math.round(WAR.warChestBaseGold + def.defense * WAR.warChestDefScale);
    const cost = isNaval ? Math.round(baseCost * WAR.navalGoldMultiplier) : baseCost;
    const strong = (sel.military / Math.max(1, def.defense)) >= COMBAT.attackRatio;
    const funded = gold >= cost;
    return {
      isNaval,
      cost,
      strong,
      funded,
      viable: strong && funded,
      name: def.name,
    };
  })();

  return (
    <div className="pointer-events-none absolute right-0 left-0 sm:left-auto bottom-[136px] sm:bottom-auto sm:top-[100px] sm:right-3 z-30 sm:w-[320px] max-h-[calc(100dvh-156px)] sm:max-h-[calc(100dvh-130px)] overflow-hidden">
      <div className="pointer-events-auto m-2 sm:m-3 rounded-2xl bg-ink-700/90 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/40 p-3 sm:p-5 text-sm h-full max-h-[calc(100dvh-172px)] sm:max-h-[calc(100dvh-150px)] overflow-y-auto scroll-thin">
        <div className="flex items-start gap-3 mb-3">
          <span className="text-4xl drop-shadow">{selected.flag}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display font-black text-lg leading-tight truncate">{selected.name}</h2>
              <span className="text-[10px] tracking-[0.2em] uppercase text-slate-400">{selected.iso3}</span>
            </div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">
              {selected.continent} · {selected.population.toFixed(0)}M citizens
            </div>
          </div>
          <FactionBadge owner={selected.owner} />
        </div>

        <DiplomacyTabNav active={tab} onChange={setTab} />

        {tab === 'brief' && (
        <div>
        {isPlayer && !playerAtkWar && (
          <div className="space-y-2.5 mb-4">
            <Meter label="Happiness" value={selected.happiness} max={100} tone={selected.happiness < 30 ? 'danger' : selected.happiness < 60 ? 'warn' : 'good'} />
            <Meter label="Military" value={selected.military} max={MAX_STATS} tone={selected.military < MAX_STATS * 0.15 ? 'danger' : selected.military < MAX_STATS * 0.4 ? 'warn' : 'good'} />
            <Meter label="Defense" value={selected.defense} max={MAX_STATS} tone={selected.defense < MAX_STATS * 0.15 ? 'danger' : selected.defense < MAX_STATS * 0.4 ? 'warn' : 'good'} />
            <div className="flex items-center gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={`flex-1 h-2 rounded ${i < selected.fortification ? 'bg-accent-gold' : 'bg-white/5'}`} />
              ))}
              <span className="text-[10px] tracking-widest uppercase text-slate-400 ml-1">Fort L{selected.fortification}</span>
            </div>
          </div>
        )}

        {isAI && !aiWarsHere && (
          <div className="space-y-2.5 mb-4">
            <Meter label="Defense" value={selected.defense} max={MAX_STATS} tone={selected.defense < MAX_STATS * 0.15 ? 'danger' : 'good'} />
            <Meter label="Estimated Military" value={selected.military} max={MAX_STATS} tone={selected.military < MAX_STATS * 0.15 ? 'danger' : 'warn'} />
            <Meter label="Population Mood" value={selected.happiness} max={100} tone={selected.happiness < 30 ? 'danger' : 'warn'} />
            <div className="text-[11px] text-slate-400">Owner: <span className="text-accent-crimson font-bold">{labelForOwner(selected.owner, factions)}</span></div>
          </div>
        )}

        {!selected.owner && (
          <div className="text-[12px] text-slate-300 leading-relaxed mb-4">
            Neutral territory — unaligned with any global bloc. Invading here escalates into a 4-tick war; ensure your military outranks their defense.
          </div>
        )}

        {/* ── Player-vs-defender war view ── */}
        {playerAtkWar && (
          <div className="mb-3 p-3 rounded-xl border border-accent-crimson/50 bg-accent-crimson/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] tracking-[0.25em] uppercase text-accent-crimson font-bold">War in progress</span>
              <span className="text-[10px] tracking-widest uppercase text-slate-300">⏳ {playerAtkWar.ticksRemaining}t</span>
            </div>
            <div className="text-[12px] mb-2.5 text-slate-200">
              vs <span className="font-bold">{countries[playerAtkWar.defenderId]?.name}</span>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5 text-[11px]">
                <BarPair label="ATK" value={playerAtkWar.attackerCurrentMilitary} max={playerAtkWar.attackerStartMilitary + playerAtkWar.attackerReinforcements} accent="crimson" />
                <BarPair label="DEF" value={playerAtkWar.defenderCurrentDefense} max={playerAtkWar.defenderStartDefense} accent="azure" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <WarActionBtn
                onClick={() => cancelWar(playerAtkWar.id)}
                tone="warn"
                label="Cancel"
                sub={`refund ${Math.round(WAR.cancelRefundFraction * 100)}%`}
              />
              <WarActionBtn
                onClick={() => speedUpWar(playerAtkWar.id)}
                tone="info"
                label={`+${WAR.speedUpTicks} fast`}
                sub={`-${WAR.speedUpHappinessCost} morale`}
                disabled={playerAtkWar.ticksRemaining <= WAR.speedUpTicks}
              />
              <WarActionBtn
                onClick={() => reinforceWar(playerAtkWar.id, WAR.reinforceUnitAmount)}
                tone="good"
                label={`+${WAR.reinforceUnitAmount}`}
                sub={`−${WAR.reinforceUnitAmount * WAR.reinforceCostPerUnit}g`}
                disabled={gold < WAR.reinforceUnitAmount * WAR.reinforceCostPerUnit}
              />
            </div>
          </div>
        )}

        {/* ── Player defending view ── */}
        {playerDefWar && (
          <div className="mb-3 p-3 rounded-xl border border-accent-azure/40 bg-accent-azure/5">
            <div className="text-[10px] tracking-[0.25em] uppercase text-accent-azure font-bold">Under siege</div>
            <div className="text-[12px] text-slate-200 mt-1">
              Being invaded by <span className="font-bold">{countries[playerDefWar.attackerId]?.name}</span>.
              Your held-back defense: <b>{selected.defense}</b>. In-field: <b>{playerDefWar.defenderCurrentDefense}</b>.
            </div>
            <div className="text-[11px] text-slate-400 mt-1.5">⏳ {playerDefWar.ticksRemaining} tick(s) until resolution</div>
          </div>
        )}

        {/* ── AI war status (informational) ── */}
        {aiWarsHere && (
          <div className="mb-3 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="text-[10px] tracking-[0.25em] uppercase text-slate-400 font-bold">
              {aiWarsHere.attackerId === selected.id ? 'Invading' : 'Defending'}
            </div>
            <div className="text-[12px] text-slate-300 mt-1">
              vs <b>{countries[aiWarsHere.defenderId === selected.id ? aiWarsHere.attackerId : aiWarsHere.defenderId]?.name}</b> · ATK {aiWarsHere.attackerCurrentMilitary} / DEF {aiWarsHere.defenderCurrentDefense} · {aiWarsHere.ticksRemaining}t
            </div>
          </div>
        )}

        {/* Player economic actions */}
        {isPlayer && !playerAtkWar && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            <ActionPill
              icon={<RecruitIc />}
              label="Recruit"
              sub={`−${PLAYER_ACTION.recruitAmount * PLAYER_ACTION.recruitCostPerPoint}g`}
              disabled={!canRecruit}
              onClick={() => useGame.getState().recruit()}
            />
            <ActionPill
              icon={<FortifyIc />}
              label="Fortify"
              sub={`−${PLAYER_ACTION.fortifyAmount * PLAYER_ACTION.fortifyCostPerPoint}g`}
              disabled={!canFortify}
              onClick={() => useGame.getState().fortify()}
            />
            <ActionPill
              icon={<SubsidizeIc />}
              label="Civics"
              sub={`−${PLAYER_ACTION.subsidizeAmount * PLAYER_ACTION.subsidizeCostPerPoint}g`}
              disabled={!canSubsidize}
              onClick={() => useGame.getState().subsidize()}
            />
          </div>
        )}

        {/* Conquest entry: only when adjacent enemies exist & no in-flight war. */}
        {isPlayer && !intel?.length && (
          <div className="text-[11px] text-slate-500 italic pt-1 border-t border-white/10 mt-1">No bordering nations available.</div>
        )}
        {isPlayer && intel && intel.length > 0 && !playerAtkWar && (
          <div className="pt-1 border-t border-white/10">
            <h3 className="text-[11px] tracking-widest uppercase text-slate-400 mt-2 mb-1.5">
              Frontline targets
              <span className="float-right normal-case text-slate-500 text-[10px]">{WAR.defaultDuration}t war</span>
            </h3>
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
              {intel.slice(0, 8).map((n) => {
                if (!n || n.owner === 'player') return null;
                const ratio = selected.military / Math.max(1, n.defense);
                const cost = warCostForTarget(n);
                const strong = ratio >= COMBAT.attackRatio;
                const funded = gold >= cost;
                return (
                  <button
                    key={n.id}
                    onClick={() => setTarget(n.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all ${
                      target === n.id
                        ? 'border-accent-target bg-accent-target/10'
                        : strong && funded
                          ? 'border-white/10 hover:border-accent-crimson/40 hover:bg-accent-crimson/5'
                          : 'border-white/5 opacity-60'
                    }`}
                  >
                    <span className="text-lg">{n.flag}</span>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-[12px] font-medium truncate">{n.name}</div>
                      <div className="text-[10px] text-slate-400">
                        DEF {Math.round(n.defense)} · MIL {Math.round(n.military)}
                      </div>
                    </div>
                    <div className={`text-[11px] font-bold ${strong && funded ? 'text-accent-crimson' : 'text-slate-500'}`}>
                      {!funded ? 'no gold' : !strong ? 'too strong' : `⚔ ${cost}g`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sea-borne expeditions: countries we can't reach by land, but can invade
            with an amphibious force at higher gold + bleed cost. */}
        {isPlayer && !playerAtkWar && navalTargets && navalTargets.length > 0 && (
          <div className="pt-2 border-t border-white/10 mt-2">
            <h3 className="text-[11px] tracking-widest uppercase text-slate-400 mt-1 mb-1.5 flex items-center gap-1">
              <span>🚢</span>
              <span>Sea-borne expeditions</span>
              <span className="ml-auto normal-case text-slate-500 text-[10px]">{WAR.defaultDuration}t · ×{WAR.navalGoldMultiplier} cost</span>
            </h3>
            <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
              {navalTargets.map((n) => {
                const ratio = selected.military / Math.max(1, n.defense);
                const baseCost = warCostForTarget(n);
                const cost = Math.round(baseCost * WAR.navalGoldMultiplier);
                const strong = ratio >= COMBAT.attackRatio;
                const funded = gold >= cost;
                return (
                  <button
                    key={n.id}
                    onClick={() => setTarget(n.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all ${
                      target === n.id
                        ? 'border-accent-azure bg-accent-azure/10'
                        : strong && funded
                          ? 'border-white/10 hover:border-accent-azure/40 hover:bg-accent-azure/5'
                          : 'border-white/5 opacity-60'
                    }`}
                  >
                    <span className="text-lg">{n.flag}</span>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-[12px] font-medium truncate">{n.name}</div>
                      <div className="text-[10px] text-slate-400">
                        DEF {Math.round(n.defense)} · MIL {Math.round(n.military)}
                      </div>
                    </div>
                    <div className={`text-[11px] font-bold ${strong && funded ? 'text-accent-azure' : 'text-slate-500'}`}>
                      {!funded ? 'no gold' : !strong ? 'too strong' : `🚢 ${cost}g`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Single deploy-war button — renders when ANY target is chosen (land or naval).
            The label shows the actual cost (naval cost is multiplied x1.8) so the
            player isn't blindsided by an under-stated price. */}
        {deployInfo && (
          <button
            onClick={() => declareWar(target!)}
            disabled={!deployInfo.viable}
            className={`w-full mt-3 px-3 py-2.5 rounded-lg font-display font-bold tracking-wider text-sm transition-all ${
              deployInfo.viable
                ? deployInfo.isNaval
                  ? 'bg-accent-azure/90 text-white shadow-lg shadow-accent-azure/30 hover:scale-[1.02]'
                  : 'bg-accent-crimson/90 text-white shadow-lg shadow-accent-crimson/30 hover:scale-[1.02]'
                : 'bg-white/5 text-slate-500 cursor-not-allowed'
            }`}
          >
            {deployInfo.isNaval ? '🚢 AMPHIBIOUS ASSAULT' : '⚔ DECLARE WAR'} ON {deployInfo.name.toUpperCase()} ({WAR.defaultDuration}t) · −{deployInfo.cost}g
          </button>
        )}

        {/* Side-action: tax is universal */}
        {isPlayer && !playerAtkWar && (
          <button
            onClick={() => useGame.getState().tax()}
            className="w-full mt-2 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.10] border border-white/5 text-[11px] font-medium flex justify-between"
          >
            <span>📑 Impose emergency tax</span>
            <span className="text-accent-jade font-bold">+{PLAYER_ACTION.taxGainPerPoint}g · −{PLAYER_ACTION.taxHappinessCost}😊</span>
          </button>
        )}

        {/* Just show a non-action status when a player tile is just a defender being invaded. */}
        {!isPlayer && npcsAtWar && (
          <div className="text-[11px] text-slate-400 italic pt-2 border-t border-white/10">
            Watch closely — the outcome of this war will reshape your borders.
          </div>
        )}
        </div>
        )}

        {tab === 'diplomacy' && (
          <DiplomacyView
            factions={factions}
            proposals={proposals}
            proposalOrder={proposalOrder}
            isPlayer={isPlayer}
            onPropose={proposeDiplomacy}
            onRespond={respondProposal}
          />
        )}
      </div>
    </div>
  );
}

function Meter({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'good' | 'warn' | 'danger' }) {
  const pct = Math.min(100, (value / max) * 100);
  const toneClass = tone === 'danger' ? 'bg-accent-crimson' : tone === 'warn' ? 'bg-accent-gold' : 'bg-accent-jade';
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
        <span className="uppercase tracking-wider">{label}</span>
        <span className="font-bold text-slate-200">{Math.round(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${toneClass} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BarPair({ label, value, max, accent }: { label: string; value: number; max: number; accent: 'crimson' | 'azure' }) {
  const pct = Math.min(100, Math.max(4, (value / Math.max(1, max)) * 100));
  const toneClass = accent === 'crimson' ? 'bg-accent-crimson' : 'bg-accent-azure';
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
        <span>{label}</span>
        <span className="font-bold text-slate-200">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${toneClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ActionPill({ icon, label, sub, disabled, onClick }: { icon: React.ReactNode; label: string; sub: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-lg border transition-all ${
        disabled
          ? 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
          : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.06] hover:border-accent-gold/40'
      }`}
    >
      <div className="flex items-center gap-1">
        <span className="text-accent-gold">{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200">{label}</span>
      </div>
      <span className="text-[10px] text-slate-400">{sub}</span>
    </button>
  );
}

function WarActionBtn({ onClick, tone, label, sub, disabled }: { onClick: () => void; tone: 'good' | 'warn' | 'info'; label: string; sub: string; disabled?: boolean }) {
  const toneClass =
    tone === 'good' ? 'border-accent-jade/40 text-accent-jade hover:bg-accent-jade/10' :
    tone === 'warn' ? 'border-accent-gold/40 text-accent-gold hover:bg-accent-gold/10' :
    'border-accent-azure/40 text-accent-azure hover:bg-accent-azure/10';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-start gap-0 px-2 py-1.5 rounded-md border bg-white/[0.02] transition-all disabled:opacity-40 disabled:cursor-not-allowed ${toneClass}`}
    >
      <span className="text-[11px] font-bold leading-tight">{label}</span>
      <span className="text-[9px] text-slate-400 leading-tight">{sub}</span>
    </button>
  );
}

function FactionBadge({ owner }: { owner: OwnerId }) {
  const factions = useGame((s) => s.factions);
  if (!owner) {
    return <span className="text-[10px] tracking-widest font-bold uppercase bg-slate-700/60 text-slate-300 px-1.5 py-0.5 rounded">Neutral</span>;
  }
  if (owner === 'player') {
    return <span className="text-[10px] tracking-widest font-bold uppercase bg-accent-jade/15 text-accent-jade px-1.5 py-0.5 rounded">Your Empire</span>;
  }
  return <span className="text-[10px] tracking-widest font-bold uppercase bg-accent-crimson/15 text-accent-crimson px-1.5 py-0.5 rounded">{labelForOwner(owner, factions)}</span>;
}

function RecruitIc() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 11h14M5 11l4-4M5 11l4 4M19 11l-4-4M19 11l-4 4" />
    </svg>
  );
}
function FortifyIc() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M12 3l8 4v6c0 4-3 7-8 8-5-1-8-4-8-8V7l8-4z" />
    </svg>
  );
}
function SubsidizeIc() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 13h6M9 11h6" />
    </svg>
  );
}

function DiplomacyTabNav({
  active,
  onChange,
}: {
  active: 'brief' | 'diplomacy';
  onChange: (t: 'brief' | 'diplomacy') => void;
}) {
  return (
    <div className="flex gap-1 mb-3 border-b border-white/10">
      {(
        [
          { id: 'brief', label: 'Brief' },
          { id: 'diplomacy', label: 'Diplomacy' },
        ] as const
      ).map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 text-[10px] tracking-[0.2em] uppercase font-bold transition-all ${
            active === t.id
              ? 'text-accent-gold border-b-2 border-accent-gold -mb-px'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function DiplomacyView({
  factions,
  proposals,
  proposalOrder,
  isPlayer,
  onPropose,
  onRespond,
}: {
  factions: Record<string, FactionState>;
  proposals: Record<string, Proposal>;
  proposalOrder: string[];
  isPlayer: boolean;
  onPropose: (kind: ProposalKind, toOwner: OwnerId) => string | null;
  onRespond: (proposalId: string, accept: boolean) => void;
}) {
  const [proposeKind, setProposeKind] = useState<ProposalKind>('alliance');
  const [proposeTarget, setProposeTarget] = useState<OwnerId | null>(null);

  const playerFac = factions['player'];

  const aiOwners = useMemo(() => {
    return Object.keys(factions)
      .filter((k) => k.startsWith('ai_'))
      .map((k) => k as Exclude<OwnerId, null>)
      .sort((a, b) => {
        const ra = playerFac?.relationships[a] ?? 0;
        const rb = playerFac?.relationships[b] ?? 0;
        return rb - ra;
      });
  }, [factions, playerFac]);

  const targetEmpire = proposeTarget ?? aiOwners[0] ?? null;
  let targetRel = 0;
  if (targetEmpire && playerFac) {
    targetRel = playerFac.relationships[targetEmpire] ?? 0;
  }

  const incoming = useMemo(
    () =>
      proposalOrder
        .map((id) => proposals[id])
        .filter(
          (p): p is Proposal =>
            Boolean(p) && p.toOwner === 'player' && p.status === 'pending',
        ),
    [proposalOrder, proposals],
  );
  const outgoing = useMemo(
    () =>
      proposalOrder
        .map((id) => proposals[id])
        .filter(
          (p): p is Proposal =>
            Boolean(p) && p.fromOwner === 'player' && p.status === 'pending',
        ),
    [proposalOrder, proposals],
  );
  const active = useMemo(
    () =>
      proposalOrder
        .map((id) => proposals[id])
        .filter(
          (p): p is Proposal =>
            Boolean(p) &&
            p.status === 'active' &&
            (p.fromOwner === 'player' || p.toOwner === 'player'),
        ),
    [proposalOrder, proposals],
  );

  if (!isPlayer) {
    return (
      <div className="text-[12px] text-slate-400 italic">
        Diplomacy is only available from your own territories.
      </div>
    );
  }

  const handlePropose = () => {
    if (!targetEmpire) return;
    onPropose(proposeKind, targetEmpire);
  };

  return (
    <div>
      {/* Your Empire */}
      <div className="mb-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
        <div className="flex justify-between items-baseline mb-1.5">
          <div className="text-[10px] tracking-widest uppercase text-slate-400">Your Empire</div>
          <div className="text-[10px] text-slate-300">
            Aggression:{' '}
            <b className="text-accent-gold">
              {Math.round(playerFac?.aggression ?? 0)}
            </b>
            /100
          </div>
        </div>
        {aiOwners.length === 0 ? (
          <div className="text-[11px] text-slate-500 italic">No other empires on the map.</div>
        ) : (
          <div className="space-y-1">
            {aiOwners.map((o) => {
              const r = playerFac?.relationships[o] ?? 0;
              const isSelected = targetEmpire === o;
              return (
                <button
                  key={String(o)}
                  onClick={() => setProposeTarget(o)}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded transition-all ${
                    isSelected
                      ? 'bg-accent-gold/10 border border-accent-gold/40'
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className="text-[11px] font-medium text-slate-200 min-w-[90px] text-left">
                    {labelForOwner(o, factions)}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/5 relative overflow-hidden">
                    <div
                      className={`absolute top-0 h-full ${
                        r > 30
                          ? 'bg-accent-jade'
                          : r < -20
                            ? 'bg-accent-crimson'
                            : 'bg-slate-500'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.abs(r))}%`,
                        left: r < 0 ? `${100 - Math.min(100, Math.abs(r))}%` : '0',
                      }}
                    />
                  </div>
                  <span
                    className={`text-[10px] font-bold min-w-[28px] text-right ${
                      r > 0 ? 'text-accent-jade' : 'text-accent-crimson'
                    }`}
                  >
                    {r > 0 ? '+' : ''}
                    {Math.round(r)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Propose Treaty */}
      <div className="mb-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
        <div className="text-[10px] tracking-widest uppercase text-slate-400 mb-1.5">
          Propose Treaty
        </div>
        <div className="grid grid-cols-2 gap-1 mb-2">
          {(['alliance', 'nap', 'embargo', 'tribute'] as ProposalKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setProposeKind(k)}
              className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider font-bold transition-all ${
                proposeKind === k
                  ? 'bg-accent-gold/20 text-accent-gold border border-accent-gold/40'
                  : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'
              }`}
            >
              {k === 'nap' ? 'NAP' : k}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-slate-400 mb-1.5">
          To:{' '}
          <b className="text-slate-200">
            {targetEmpire ? labelForOwner(targetEmpire, factions) : '—'}
          </b>{' '}
          <span className="text-slate-500">
            (rel {targetRel > 0 ? '+' : ''}
            {Math.round(targetRel)})
          </span>
        </div>
        <button
          onClick={handlePropose}
          disabled={!targetEmpire}
          className="w-full px-2 py-1.5 rounded bg-accent-gold/20 hover:bg-accent-gold/30 text-accent-gold text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          📜 Send Proposal
        </button>
      </div>

      {/* Inbox */}
      {incoming.length > 0 && (
        <div className="mb-3 p-2.5 rounded-lg bg-accent-azure/5 border border-accent-azure/30">
          <div className="text-[10px] tracking-widest uppercase text-accent-azure font-bold mb-1.5">
            Inbox ({incoming.length})
          </div>
          <div className="space-y-1.5">
            {incoming.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-1.5 p-1.5 rounded bg-white/[0.03]"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-slate-200 truncate">
                    {labelForOwner(p.fromOwner, factions)} → {p.kind.toUpperCase()}
                    {p.kind === 'tribute' && (
                      <span className="text-accent-gold"> (−{p.tributePerTick}g/t)</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {p.turnsRemaining}t left
                  </div>
                </div>
                <button
                  onClick={() => onRespond(p.id, true)}
                  className="px-2 py-0.5 rounded text-[11px] font-bold bg-accent-jade/20 text-accent-jade hover:bg-accent-jade/30 transition-all"
                  title="Accept"
                >
                  ✓
                </button>
                <button
                  onClick={() => onRespond(p.id, false)}
                  className="px-2 py-0.5 rounded text-[11px] font-bold bg-accent-crimson/20 text-accent-crimson hover:bg-accent-crimson/30 transition-all"
                  title="Reject"
                >
                  ✗
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing */}
      {outgoing.length > 0 && (
        <div className="mb-3 p-2.5 rounded-lg bg-accent-gold/5 border border-accent-gold/30">
          <div className="text-[10px] tracking-widest uppercase text-accent-gold font-bold mb-1.5">
            Sent ({outgoing.length})
          </div>
          <div className="space-y-1">
            {outgoing.map((p) => (
              <div key={p.id} className="text-[11px] text-slate-300">
                {p.kind.toUpperCase()} → {labelForOwner(p.toOwner, factions)}{' '}
                <span className="text-slate-500">({p.turnsRemaining}t)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active treaties */}
      {active.length > 0 && (
        <div className="mb-3 p-2.5 rounded-lg bg-accent-jade/5 border border-accent-jade/30">
          <div className="text-[10px] tracking-widest uppercase text-accent-jade font-bold mb-1.5">
            Active Treaties ({active.length})
          </div>
          <div className="space-y-1">
            {active.map((p) => {
              const other = p.fromOwner === 'player' ? p.toOwner : p.fromOwner;
              return (
                <div key={p.id} className="text-[11px] text-slate-300">
                  ✓ {p.kind.toUpperCase()} with {labelForOwner(other, factions)}{' '}
                  <span className="text-slate-500">({p.turnsRemaining}t)</span>
                  {p.kind === 'tribute' && (
                    <span className="text-accent-gold"> −{p.tributePerTick}g/t</span>
                  )}
                  {p.kind === 'embargo' && (
                    <span className="text-accent-azure"> −25% income</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {incoming.length === 0 &&
        outgoing.length === 0 &&
        active.length === 0 && (
          <div className="text-[11px] text-slate-500 italic text-center py-2">
            No diplomatic activity. Propose a treaty to start.
          </div>
        )}
    </div>
  );
}
