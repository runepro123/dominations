// Single source of truth for the simulation. UI + globe subscribe to this.

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { CountryFeature } from './data/borders';
import { featureCentroid, featureArea } from './data/borders';
import { lookupCountry } from './data/countries';
import {
  AI,
  AI_START,
  COMBAT,
  DIPLOMACY,
  ECONOMY,
  HAPPINESS,
  MAX_STATS,
  PLAYER_ACTION,
  PLAYER_START,
  STARTING_YEAR,
  WAR,
} from './constants';
import type {
  ActiveWar,
  FactionState,
  GamePhase,
  GameState,
  OwnerId,
  Proposal,
  ProposalKind,
  ProposalStatus,
  TurnEvent,
} from './types';
import { runAiTurn } from './ai';

interface Store extends GameState {
  aiCount: number;
  load: (features: CountryFeature[], adjacency: Record<string, string[]>) => void;
  begin: (playerId: string) => void;
  select: (id: string | null) => void;
  setTarget: (id: string | null) => void;
  declareWar: (targetId: string) => string | null;
  cancelWar: (warId: string) => void;
  speedUpWar: (warId: string) => void;
  reinforceWar: (warId: string, units: number) => void;
  recruit: () => void;
  fortify: () => void;
  subsidize: () => void;
  tax: () => void;
  proposeDiplomacy: (kind: ProposalKind, toOwner: OwnerId) => string | null;
  respondProposal: (proposalId: string, accept: boolean) => void;
  reset: () => void;
}

function defaultState(): GameState {
  return {
    phase: 'start',
    year: STARTING_YEAR,
    countries: {},
    order: [],
    gold: 0,
    incomePerTurn: 0,
    selectedCountryId: null,
    conquestTargetId: null,
    events: [],
    totalTurns: 0,
    startingCountryId: null,
    playerRestedTurns: 0,
    activeWars: {},
    activeWarOrder: [],
    factions: {},
    proposals: {},
    proposalOrder: [],
    proposalHistory: [],
  };
}

function ownerKey(o: OwnerId): string {
  return o ?? '__null__';
}

function ownerFromKey(k: string): OwnerId {
  if (k === '__null__') return null;
  if (k === 'player') return 'player';
  return k as `ai_${number}`;
}

/** Display label for an owner. AI empires surface as their founding country
 *  ("Egypt", "Brazil", ...) once the game has begun; before that, or if the
 *  empire got wiped out before we recorded a name, we fall back to a numbered
 *  identifier so the UI never goes blank. */
export function labelForOwner(
  owner: OwnerId,
  factions: Record<string, FactionState> = {},
): string {
  if (!owner) return 'Neutral';
  if (owner === 'player') return 'You';
  const fac = factions[ownerKey(owner)];
  if (fac?.founderName) return fac.founderName;
  const idx = parseInt(String(owner).replace('ai_', ''), 10);
  return `AI Power ${idx}`;
}

function kindLabel(kind: ProposalKind): string {
  switch (kind) {
    case 'alliance':
      return 'an alliance';
    case 'embargo':
      return 'a joint embargo';
    case 'nap':
      return 'a non-aggression pact';
    case 'tribute':
      return 'a tribute demand';
  }
}

function aiAcceptThresholdFor(kind: ProposalKind): number {
  switch (kind) {
    case 'alliance':
      return DIPLOMACY.aiAcceptAlliance;
    case 'nap':
      return DIPLOMACY.aiAcceptNap;
    case 'embargo':
      return DIPLOMACY.aiAcceptEmbargoAgainst;
    case 'tribute':
      return DIPLOMACY.aiAcceptTribute;
  }
}

function relationshipBetween(
  factions: Record<string, FactionState>,
  from: OwnerId,
  to: OwnerId,
): number {
  if (from === to) return 0;
  return factions[ownerKey(from)]?.relationships[ownerKey(to)] ?? 0;
}

function setRelationship(
  factions: Record<string, FactionState>,
  from: OwnerId,
  to: OwnerId,
  value: number,
): Record<string, FactionState> {
  if (from === to) return factions;
  const fromKey = ownerKey(from);
  const toKey = ownerKey(to);
  const fromFac = factions[fromKey];
  if (!fromFac) return factions;
  return {
    ...factions,
    [fromKey]: {
      ...fromFac,
      relationships: { ...fromFac.relationships, [toKey]: Math.max(-100, Math.min(100, value)) },
    },
  };
}

function relationshipDelta(
  factions: Record<string, FactionState>,
  from: OwnerId,
  to: OwnerId,
  delta: number,
): Record<string, FactionState> {
  if (from === to) return factions;
  const cur = relationshipBetween(factions, from, to);
  return setRelationship(factions, from, to, cur + delta);
}

function tickRelationshipDecay(
  factions: Record<string, FactionState>,
): Record<string, FactionState> {
  const decay = DIPLOMACY.relationshipDecayPerTick;
  let next = factions;
  for (const aKey of Object.keys(factions)) {
    const fac = factions[aKey];
    if (!fac) continue;
    const rels = fac.relationships;
    for (const bKey of Object.keys(rels)) {
      const v = rels[bKey];
      if (Math.abs(v) < decay * 2) continue; // already neutral
      const sign = Math.sign(v);
      const newVal = v - sign * decay;
      if (Math.abs(newVal) < decay) continue;
      next = setRelationship(next, ownerFromKey(aKey), ownerFromKey(bKey), newVal);
    }
  }
  return next;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function pushEvent(events: TurnEvent[], message: string, kind: TurnEvent['kind']): TurnEvent[] {
  return [
    { id: makeId(), message, kind, createdAt: Date.now() },
    ...events,
  ].slice(0, 6);
}

export const useGame = create<Store>()(
  subscribeWithSelector((set, get) => ({
    ...defaultState(),
    aiCount: 5,

    load: (features, adjacency) => {
      const countries: GameState['countries'] = {};
      const order: string[] = [];
      for (const f of features) {
        const id = f.id == null ? '' : String(f.id);
        if (!id || id === '-99') continue;
        const name = (f.properties?.name as string) ?? 'Unknown';
        const area = featureArea(f as any);
        const meta = lookupCountry(id, name, area);
        const { lng, lat } = featureCentroid(f as any);
        countries[id] = {
          ...meta,
          cx: lng,
          cy: lat,
          neighbors: adjacency[id] ?? [],
          owner: null,
          happiness: 50,
          defense: 30,
          military: 20,
          fortification: 0,
          peaceTicksRemaining: 0,
        };
        order.push(id);
      }
      set({ countries, order });
    },

    begin: (playerId) => {
      const state = get();
      const player = state.countries[playerId];
      if (!player) return;

      const aiSet = pickAiStartingCountries(state.order, playerId, get().aiCount);
      const countries: GameState['countries'] = { ...state.countries };

      countries[playerId] = {
        ...player,
        owner: 'player',
        happiness: PLAYER_START.happiness,
        defense: PLAYER_START.defense,
        military: PLAYER_START.military,
        fortification: PLAYER_START.fortification,
      };

      const events: TurnEvent[] = [
        {
          id: makeId(),
          message: `Diplomats installed in ${player.name}. Your reign begins.`,
          kind: 'info',
          createdAt: Date.now(),
        },
      ];

      aiSet.forEach((id, idx) => {
        const aiId: OwnerId = `ai_${idx + 1}`;
        const current = countries[id];
        if (!current) return;
        countries[id] = {
          ...current,
          owner: aiId,
          happiness: AI_START.happiness,
          defense: AI_START.defense,
          military: AI_START.military,
          fortification: 0,
        };
        events.push({
          id: makeId(),
          message: `${current.name} has mobilised forces.`,
          kind: 'diplomacy',
          createdAt: Date.now(),
        });
      });

      const income = computeIncome(countries);

      // Seed factions (empires) for the player + every AI.
      const factions: Record<string, FactionState> = {};
      factions['player'] = { aggression: DIPLOMACY.playerAggression, relationships: {} };
      const ownerKeys: string[] = ['player'];
      aiSet.forEach((_id, idx) => {
        const aiKey = `ai_${idx + 1}`;
        ownerKeys.push(aiKey);
        const spread = DIPLOMACY.aiAggressionSpread;
        const agg = clamp(
          DIPLOMACY.aiBaseAggression - spread / 2 + Math.random() * spread,
          0,
          100,
        );
        const startCountry = countries[_id];
        factions[aiKey] = {
          aggression: agg,
          relationships: {},
          founderName: startCountry?.name ?? `AI Power ${idx + 1}`,
        };
      });
      // Pre-populate every cross-relationship at 0 so reads are always defined.
      for (const a of ownerKeys) {
        for (const b of ownerKeys) {
          if (a !== b) factions[a].relationships[b] = 0;
        }
      }

      set({
        phase: 'playing',
        countries,
        gold: PLAYER_START.gold,
        incomePerTurn: income,
        events,
        startingCountryId: playerId,
        selectedCountryId: playerId,
        conquestTargetId: null,
        totalTurns: 0,
        playerRestedTurns: 0,
        factions,
        proposals: {},
        proposalOrder: [],
        proposalHistory: [],
      });
    },

    select: (id) =>
      set((s) => ({
        selectedCountryId: id,
        conquestTargetId: id === null ? null : s.conquestTargetId,
      })),

    setTarget: (id) => set({ conquestTargetId: id }),

    declareWar: (targetId) => {
      const state = get();
      if (state.phase !== 'playing') return null;
      const sel = state.selectedCountryId;
      if (!sel) return null;
      const attacker = state.countries[sel];
      const defender = state.countries[targetId];
      if (!attacker || !defender) return null;
      if (attacker.owner !== 'player' || defender.owner === 'player') return null;
      if (attacker.id === defender.id) return null;
      // Realism gate: the player's tile is recovering from a previous war.
      if (attacker.peaceTicksRemaining > 0) return null;
      // Active alliance between the two empires blocks declareWar outright.
      const allianceBlocks = Object.values(state.proposals).some(
        (p) =>
          p.status === 'active' &&
          p.kind === 'alliance' &&
          ((p.fromOwner === attacker.owner && p.toOwner === defender.owner) ||
            (p.fromOwner === defender.owner && p.toOwner === attacker.owner)),
      );
      if (allianceBlocks) return null;

      // Navel = target is NOT adjacent to attacker on land borders. Sea-borne
      // invasions are allowed but cost more gold and bleed more aggressively.
      const naval = !attacker.neighbors.includes(targetId);

      const ratio = attacker.military / Math.max(1, defender.defense);
      if (ratio < COMBAT.attackRatio) return null;

      const baseGoldCost = Math.round(
        WAR.warChestBaseGold + defender.defense * WAR.warChestDefScale,
      );
      const goldCost = naval ? Math.round(baseGoldCost * WAR.navalGoldMultiplier) : baseGoldCost;
      if (state.gold < goldCost) return null;

      // Commit half of the attacker's standing military to the war pool; the
      // defender commits 70% of its defense; the rest stays "held back".
      // Naval invasions lose part of their landing force to the open sea.
      const baseCommitted = clamp(
        Math.round(attacker.military * 0.65),
        10,
        Math.max(10, attacker.military - 5),
      );
      const committed = naval
        ? Math.max(8, Math.round(baseCommitted * WAR.navalLandingFraction))
        : baseCommitted;
      const defenderMobilized = Math.round(defender.defense * 0.7);

      const warId = `war_${makeId()}`;
      const newWar: ActiveWar = {
        id: warId,
        attackerId: sel,
        defenderId: targetId,
        startTurn: state.totalTurns,
        ticksRemaining: WAR.defaultDuration,
        totalTicks: WAR.defaultDuration,
        attackerStartMilitary: committed,
        attackerCurrentMilitary: committed,
        defenderStartDefense: defenderMobilized,
        defenderCurrentDefense: defenderMobilized,
        attackerReinforcements: 0,
        goldSpent: goldCost,
        pulse: 0,
        naval,
      };

      const countries: GameState['countries'] = { ...state.countries };
      countries[sel] = {
        ...attacker,
        military: clamp(attacker.military - committed, 5, MAX_STATS),
      };
      countries[targetId] = {
        ...defender,
        defense: Math.round(defender.defense * 0.3), // 30% held back
      };

      const eventMsg = naval
        ? `🚢 ${attacker.name} launches a sea-borne assault on ${defender.name}!`
        : `🪖 ${attacker.name} marches on ${defender.name}!`;
      // War-declared relationship hit: -30 each direction, plus -15 treaty-violation
      // hit if an active NAP / alliance existed.
      let factions = state.factions;
      factions = relationshipDelta(factions, attacker.owner, defender.owner, DIPLOMACY.relOnWarDecline);
      factions = relationshipDelta(factions, defender.owner, attacker.owner, DIPLOMACY.relOnWarDecline);
      const hadTreaty = Object.values(state.proposals).some(
        (p) =>
          p.status === 'active' &&
          (p.kind === 'nap' || p.kind === 'alliance') &&
          ((p.fromOwner === attacker.owner && p.toOwner === defender.owner) ||
            (p.fromOwner === defender.owner && p.toOwner === attacker.owner)),
      );
      if (hadTreaty) {
        factions = relationshipDelta(factions, attacker.owner, defender.owner, DIPLOMACY.relOnWarBrokenTreaty);
        factions = relationshipDelta(factions, defender.owner, attacker.owner, DIPLOMACY.relOnWarBrokenTreaty);
      }
      set({
        countries,
        gold: state.gold - goldCost,
        activeWars: { ...state.activeWars, [warId]: newWar },
        activeWarOrder: [...state.activeWarOrder, warId],
        conquestTargetId: null,
        events: pushEvent(state.events, eventMsg, 'war'),
        factions,
      });
      return warId;
    },

    cancelWar: (warId) => {
      const state = get();
      const war = state.activeWars[warId];
      if (!war) return;
      // Naval cancellations refund fewer troops (ships sunk, transports lost).
      const refundRate = war.naval ? WAR.navalCancelRefundFraction : WAR.cancelRefundFraction;
      const refund = Math.round(war.attackerCurrentMilitary * refundRate);
      const countries: GameState['countries'] = { ...state.countries };
      const att = countries[war.attackerId];
      const def = countries[war.defenderId];
      if (att) {
        countries[war.attackerId] = {
          ...att,
          military: clamp(att.military + refund, 0, MAX_STATS),
          peaceTicksRemaining: AI.peaceCooldownTicks,
        };
      }
      if (def) {
        // Restore partial field defense back from the war pool, then anger the defender.
        // Naval cancellations restore less — the defender was barely engaged.
        const restoreFraction = war.naval
          ? WAR.navalCancelRestoreFraction
          : WAR.cancelRestoreFraction;
        const restoredDefense = Math.round(war.defenderCurrentDefense * restoreFraction);
        const defenderHappinessLoss = war.naval
          ? WAR.navalCancelDefenderHappinessLoss
          : WAR.cancelDefenderHappinessLoss;
        countries[war.defenderId] = {
          ...def,
          defense: clamp(def.defense + restoredDefense + WAR.cancelFlatDefenseBonus, 0, MAX_STATS),
          happiness: clamp(def.happiness - defenderHappinessLoss, 0, 100),
          peaceTicksRemaining: AI.peaceCooldownTicks,
        };
      }
      const { [warId]: _drop, ...activeWars } = state.activeWars;
      const activeWarOrder = state.activeWarOrder.filter((id) => id !== warId);
      set({
        countries,
        activeWars,
        activeWarOrder,
        events: pushEvent(
          state.events,
          `⚠️ ${att?.name ?? 'Attacker'} withdrew from ${def?.name ?? 'target'}.`,
          'war',
        ),
      });
    },

    speedUpWar: (warId) => {
      const state = get();
      const war = state.activeWars[warId];
      if (!war || war.ticksRemaining <= WAR.speedUpTicks) return;
      const countries: GameState['countries'] = { ...state.countries };
      const att = countries[war.attackerId];
      if (att && att.owner === 'player') {
        countries[war.attackerId] = {
          ...att,
          happiness: clamp(att.happiness - WAR.speedUpHappinessCost, 0, 100),
        };
      }
      set({
        countries,
        activeWars: {
          ...state.activeWars,
          [warId]: {
            ...war,
            ticksRemaining: war.ticksRemaining - WAR.speedUpTicks,
            totalTicks: war.totalTicks + WAR.speedUpTicks,
          },
        },
        events: pushEvent(state.events, `⏩ ${att?.name ?? 'War'} operations accelerated.`, 'war'),
      });
    },

    reinforceWar: (warId, units) => {
      const state = get();
      const war = state.activeWars[warId];
      if (!war || units <= 0) return;
      const att = state.countries[war.attackerId];
      if (!att || att.owner !== 'player') return;
      const cost = units * WAR.reinforceCostPerUnit;
      if (state.gold < cost) return;
      set({
        gold: state.gold - cost,
        activeWars: {
          ...state.activeWars,
          [warId]: {
            ...war,
            attackerCurrentMilitary: war.attackerCurrentMilitary + units,
            attackerStartMilitary: war.attackerStartMilitary + units,
            attackerReinforcements: war.attackerReinforcements + units,
            goldSpent: war.goldSpent + cost,
          },
        },
        events: pushEvent(state.events, `🪖 ${units} mercenaries integrated at ${att.name}.`, 'war'),
      });
    },

    recruit: () => {
      const state = get();
      const sel = state.selectedCountryId;
      if (!sel) return;
      const c = state.countries[sel];
      if (!c || c.owner !== 'player') return;
      const cost = PLAYER_ACTION.recruitAmount * PLAYER_ACTION.recruitCostPerPoint;
      if (state.gold < cost) return;
      const countries: GameState['countries'] = { ...state.countries };
      countries[sel] = {
        ...c,
        military: clamp(c.military + PLAYER_ACTION.recruitAmount, 0, MAX_STATS),
        happiness: clamp(c.happiness - 2, 0, 100),
      };
      set({
        countries,
        gold: state.gold - cost,
        events: pushEvent(state.events, `🪖 ${c.name} drafted ${PLAYER_ACTION.recruitAmount} troops.`, 'war'),
      });
    },

    fortify: () => {
      const state = get();
      const sel = state.selectedCountryId;
      if (!sel) return;
      const c = state.countries[sel];
      if (!c || c.owner !== 'player') return;
      const cost = PLAYER_ACTION.fortifyAmount * PLAYER_ACTION.fortifyCostPerPoint;
      if (state.gold < cost) return;
      if (c.fortification >= ECONOMY.maxFortification) return;
      const countries: GameState['countries'] = { ...state.countries };
      countries[sel] = {
        ...c,
        fortification: c.fortification + 1,
        defense: clamp(c.defense + PLAYER_ACTION.fortifyAmount, 0, MAX_STATS),
      };
      set({
        countries,
        gold: state.gold - cost,
        events: pushEvent(state.events, `🛡️ Fortifications rising in ${c.name}.`, 'economy'),
      });
    },

    subsidize: () => {
      const state = get();
      const sel = state.selectedCountryId;
      if (!sel) return;
      const c = state.countries[sel];
      if (!c || c.owner !== 'player') return;
      const cost = PLAYER_ACTION.subsidizeAmount * PLAYER_ACTION.subsidizeCostPerPoint;
      if (state.gold < cost) return;
      const countries: GameState['countries'] = { ...state.countries };
      countries[sel] = {
        ...c,
        happiness: clamp(c.happiness + PLAYER_ACTION.subsidizeAmount, 0, 100),
      };
      set({
        countries,
        gold: state.gold - cost,
        events: pushEvent(state.events, `💸 Subsidies paid to ${c.name}'s citizens.`, 'diplomacy'),
      });
    },

    tax: () => {
      const state = get();
      const sel = state.selectedCountryId;
      if (!sel) return;
      const c = state.countries[sel];
      if (!c || c.owner !== 'player') return;
      const countries: GameState['countries'] = { ...state.countries };
      countries[sel] = {
        ...c,
        happiness: clamp(c.happiness - PLAYER_ACTION.taxHappinessCost, 0, 100),
      };
      set({
        countries,
        gold: state.gold + PLAYER_ACTION.taxGainPerPoint,
        events: pushEvent(state.events, `💰 Steep new taxes levied in ${c.name}.`, 'danger'),
      });
    },

    proposeDiplomacy: (kind, toOwner) => {
      const state = get();
      if (state.phase !== 'playing') return null;
      const sel = state.selectedCountryId;
      if (!sel) return null;
      const c = state.countries[sel];
      if (!c || c.owner !== 'player') return null;
      if (!toOwner || toOwner === 'player') return null;

      const fromOwner: OwnerId = 'player';

      // Cap: at most N pending + active proposals from this owner in flight.
      const existing = state.proposalOrder
        .map((id) => state.proposals[id])
        .filter(
          (p) =>
            p &&
            p.fromOwner === fromOwner &&
            (p.status === 'pending' || p.status === 'active') &&
            (p.kind === 'alliance' || p.kind === 'nap' || p.kind === 'embargo' || p.kind === 'tribute'),
        );
      if (existing.length >= DIPLOMACY.maxActiveProposalsPerOwner) return null;

      // Cap: at most N pending per owner so the inbox doesn't get spammed.
      const pendingCount = state.proposalOrder
        .map((id) => state.proposals[id])
        .filter((p) => p && p.status === 'pending' && p.fromOwner === fromOwner).length;
      if (pendingCount >= DIPLOMACY.maxPendingProposalsPerOwner) return null;

      // Reject duplicates: same kind, same recipient, still pending or active.
      const duplicate = state.proposalOrder
        .map((id) => state.proposals[id])
        .find(
          (p) =>
            p &&
            p.fromOwner === fromOwner &&
            p.toOwner === toOwner &&
            p.kind === kind &&
            (p.status === 'pending' || p.status === 'active'),
        );
      if (duplicate) return null;

      // Reject cooldowns: same kind, same recipient, recently rejected.
      const inCooldown = state.proposalHistory.some(
        (p) =>
          p.fromOwner === fromOwner &&
          p.toOwner === toOwner &&
          p.kind === kind &&
          p.status === 'rejected' &&
          state.totalTurns - p.createdTurn < DIPLOMACY.rejectedCooldown,
      );
      if (inCooldown) return null;

      // Embargo requires a target country. The simplest v2 model: player
      // proposes an embargo against an AI owner; the AI votes on whether to
      // jointly embargo a third party (or just refuses).
      const id = `prop_${makeId()}`;
      const lifespan: Record<ProposalKind, number> = {
        alliance: DIPLOMACY.pendingLifespan + DIPLOMACY.allianceLifespan,
        embargo: DIPLOMACY.pendingLifespan + DIPLOMACY.embargoLifespan,
        nap: DIPLOMACY.pendingLifespan + DIPLOMACY.napLifespan,
        tribute: DIPLOMACY.pendingLifespan + DIPLOMACY.tributeLifespan,
      };
      const tributePerTick = kind === 'tribute' ? DIPLOMACY.tributeGoldPerTick : 0;
      const proposal: Proposal = {
        id,
        kind,
        fromOwner,
        toOwner,
        turnsRemaining: lifespan[kind],
        tributePerTick,
        status: 'pending',
        createdTurn: state.totalTurns,
      };
      set({
        proposals: { ...state.proposals, [id]: proposal },
        proposalOrder: [id, ...state.proposalOrder],
        events: pushEvent(
          state.events,
          `📜 You proposed ${kindLabel(kind)} to ${labelForOwner(toOwner, state.factions)}.`,
          'diplomacy',
        ),
      });
      return id;
    },

    respondProposal: (proposalId, accept) => {
      const state = get();
      const proposal = state.proposals[proposalId];
      if (!proposal || proposal.status !== 'pending') return;
      if (proposal.toOwner !== 'player') return;

      const newRel = relationshipBetween(
        state.factions,
        proposal.fromOwner,
        proposal.toOwner,
      ) + (accept ? DIPLOMACY.relOnAccept : DIPLOMACY.relOnReject);
      let factions = setRelationship(
        state.factions,
        proposal.fromOwner,
        proposal.toOwner,
        newRel,
      );

      const nextStatus: ProposalStatus = accept ? 'active' : 'rejected';
      const updatedProposal: Proposal = { ...proposal, status: nextStatus };
      let proposals = { ...state.proposals, [proposalId]: updatedProposal };
      let proposalOrder = state.proposalOrder;
      let proposalHistory = state.proposalHistory;
      // Rejected proposals move to history immediately so the player can audit
      // who refused what. Accepted proposals stay in `proposals` with status
      // 'active' and only enter history when they break.
      if (!accept) {
        proposalOrder = proposalOrder.filter((id) => id !== proposalId);
        delete proposals[proposalId];
        proposalHistory = [updatedProposal, ...proposalHistory].slice(0, 24);
      }
      const events = pushEvent(
        state.events,
        accept
          ? `✅ ${labelForOwner(proposal.fromOwner, factions)}'s ${kindLabel(proposal.kind)} is now in effect.`
          : `❌ You rejected ${labelForOwner(proposal.fromOwner, factions)}'s ${kindLabel(proposal.kind)}.`,
        'diplomacy',
      );

      set({ proposals, factions, events, proposalOrder, proposalHistory });
    },

    reset: () => set({ ...defaultState() }),
  })),
);

/** Periodic game tick – runs each economy / AI / event pass. */
export function applyTick() {
  useGame.setState((state) => {
    if (state.phase !== 'playing') return state;
    const countries: GameState['countries'] = { ...state.countries };
    const activeWars: GameState['activeWars'] = { ...state.activeWars };
    const activeWarOrder = [...state.activeWarOrder];
    const events: TurnEvent[] = [...state.events];
    let factions = state.factions;
    let proposals = { ...state.proposals };
    const proposalOrder = [...state.proposalOrder];
    const proposalHistory = [...state.proposalHistory];

    // 1. Advance wars and resolve finished ones (player + AI parity).
    for (let i = activeWarOrder.length - 1; i >= 0; i--) {
      const warId = activeWarOrder[i];
      const war = activeWars[warId];
      if (!war) {
        activeWarOrder.splice(i, 1);
        continue;
      }
      const attBleed = WAR.attackerBleedPerTick + (war.naval ? WAR.navalAttackerBleedBonus : 0);
      const defBleed = WAR.defenderBleedPerTick + (war.naval ? WAR.navalDefenderBleedBonus : 0);
      const newAtt = clamp(Math.round(war.attackerCurrentMilitary * (1 - attBleed)), 0, MAX_STATS);
      const newDef = clamp(Math.round(war.defenderCurrentDefense * (1 - defBleed)), 0, MAX_STATS);
      const newTicks = war.ticksRemaining - 1;

      if (newTicks <= 0) {
        // Resolve the war.
        const att = countries[war.attackerId];
        const def = countries[war.defenderId];
        if (!att || !def) {
          delete activeWars[warId];
          activeWarOrder.splice(i, 1);
          continue;
        }
        const attackerWins = newAtt >= 5 && newAtt > newDef;
        if (attackerWins) {
          // Conquer – both sides bleed; attacker absorbs remaining troops.
          // Naval winners bring home only a fraction of survivors (still at sea).
          const wonTroops = war.naval
            ? Math.round(newAtt * WAR.navalWinRefundFraction)
            : Math.max(0, newAtt - WAR.landWinRefundFloor);
          const conquerHappinessLoss = war.naval
            ? WAR.navalConquerHappinessLoss
            : WAR.landConquerHappinessLoss;
          countries[war.defenderId] = {
            ...def,
            owner: att.owner,
            military: 6,
            defense: Math.max(2, Math.round(newDef * 0.4)),
            happiness: clamp(def.happiness - conquerHappinessLoss, COMBAT.conquerHappinessFloor, 80),
            peaceTicksRemaining: AI.peaceCooldownTicks,
          };
          countries[war.attackerId] = {
            ...att,
            military: clamp(att.military + wonTroops, 0, MAX_STATS),
            happiness: clamp(att.happiness - 4, 0, 100),
            peaceTicksRemaining: AI.peaceCooldownTicks,
          };
          events.push({
            id: makeId(),
            message: `🏆 ${att.name} conquered ${def.name}!`,
            kind: 'war',
            createdAt: Date.now(),
          });
        } else {
          // Repelled – both sides bleed; defender rebuilds partial defense.
          // Naval retreats bring home very few soldiers (ships sunk, transports
          // lost). Land invasions retain about a third of the fielded troops.
          const retreatRefund = war.naval
            ? WAR.navalResolveLoseRefundFraction
            : WAR.resolveLoseRefundFraction;
          countries[war.defenderId] = {
            ...def,
            defense: clamp(def.defense + Math.round(newDef * 0.4) + 5, 0, MAX_STATS),
            happiness: clamp(def.happiness - 8, 0, 100),
            peaceTicksRemaining: AI.peaceCooldownTicks,
          };
          countries[war.attackerId] = {
            ...att,
            military: clamp(att.military + Math.round(newAtt * retreatRefund), 0, MAX_STATS),
            happiness: clamp(att.happiness - 6, 0, 100),
            peaceTicksRemaining: AI.peaceCooldownTicks,
          };
          events.push({
            id: makeId(),
            message: `💀 ${att.name}'s invasion of ${def.name} was repelled.`,
            kind: 'war',
            createdAt: Date.now(),
          });
        }
        delete activeWars[warId];
        activeWarOrder.splice(i, 1);
      } else {
        activeWars[warId] = {
          ...war,
          ticksRemaining: newTicks,
          attackerCurrentMilitary: newAtt,
          defenderCurrentDefense: newDef,
          pulse: war.pulse + 0.4,
        };
      }
    }

    // 2. Passive happiness / fortification drift + peace-countdown decay.
    // Also: build alive-owners set for zombie-proposal cleanup.
    const aliveOwners = new Set<OwnerId>();
    for (const id of state.order) {
      const c = countries[id];
      if (!c) continue;
      if (c.owner) aliveOwners.add(c.owner);
      let next = c;
      if (c.happiness >= 60) {
        next = { ...next, happiness: clamp(c.happiness + HAPPINESS.naturalGainWhenCalm * 0.6, 0, 100) };
      } else if (c.happiness < 40) {
        next = { ...next, happiness: clamp(c.happiness - HAPPINESS.naturalErodeWhenUnhappy * 0.4, 0, 100) };
      }
      if (c.fortification === 0) {
        next = { ...next, defense: clamp(c.defense - ECONOMY.defenseDecay * 0.5, 0, MAX_STATS) };
      } else if (c.fortification > 0) {
        next = { ...next, defense: clamp(c.defense + c.fortification * 0.8, 0, MAX_STATS) };
      }
      if (c.peaceTicksRemaining > 0) {
        next = { ...next, peaceTicksRemaining: c.peaceTicksRemaining - 1 };
      }
      countries[id] = next;
    }

    // 3. AI decisions: may declare new wars or fortify.
    const aiOutcome = runAiTurn(countries, state.order, factions);
    for (const ev of aiOutcome.events) events.push(ev);
    for (const war of aiOutcome.wars) {
      activeWars[war.id] = war;
      activeWarOrder.push(war.id);
      events.push({
        id: makeId(),
        message: `🪖 ${countries[war.attackerId]?.name ?? 'AI power'} advances on ${
          countries[war.defenderId]?.name ?? 'target'
        }!`,
        kind: 'war',
        createdAt: Date.now(),
      });
    }

    // 3b. Relationship hits for AI-initiated wars (player→AI hit in declareWar).
    for (const war of aiOutcome.wars) {
      const att = countries[war.attackerId];
      const def = countries[war.defenderId];
      if (!att || !def || !att.owner || !def.owner) continue;
      factions = relationshipDelta(factions, att.owner, def.owner, DIPLOMACY.relOnWarDecline);
      factions = relationshipDelta(factions, def.owner, att.owner, DIPLOMACY.relOnWarDecline);
    }

    // 4. Income.
    const baseIncome = computeIncome(countries);
    let income = baseIncome;
    let newGold = state.gold + income;

    // 4b. Proposal lifecycle: tick lifetimes, AI voting, tribute, embargo, decay.
    // 4b-i. Tick lifetimes and cleanup zombie proposals (eliminated owners).
    for (let i = proposalOrder.length - 1; i >= 0; i--) {
      const id = proposalOrder[i];
      const p = proposals[id];
      if (!p) {
        proposalOrder.splice(i, 1);
        continue;
      }
      if (
        (p.fromOwner && !aliveOwners.has(p.fromOwner)) ||
        (p.toOwner && !aliveOwners.has(p.toOwner))
      ) {
        const final: Proposal = { ...p, status: 'broken', turnsRemaining: 0 };
        proposals[id] = final;
        proposalHistory.unshift(final);
        if (proposalHistory.length > 24) proposalHistory.length = 24;
        proposalOrder.splice(i, 1);
        continue;
      }
      if (p.status === 'pending' || p.status === 'active') {
        const newTurns = p.turnsRemaining - 1;
        if (newTurns <= 0) {
          const final: Proposal = {
            ...p,
            turnsRemaining: 0,
            status: p.status === 'pending' ? 'expired' : 'broken',
          };
          proposals[id] = final;
          proposalHistory.unshift(final);
          if (proposalHistory.length > 24) proposalHistory.length = 24;
        } else {
          proposals[id] = { ...p, turnsRemaining: newTurns };
        }
      } else {
        // 'rejected' / 'expired' / 'broken' — defensive cleanup.
        proposalOrder.splice(i, 1);
        delete proposals[id];
      }
    }

    // 4b-ii. AI voting on pending proposals where the recipient is an AI.
    for (const id of proposalOrder) {
      const p = proposals[id];
      if (!p || p.status !== 'pending') continue;
      if (p.toOwner === 'player' || !p.toOwner) continue; // player votes via respondProposal
      const toFac = factions[ownerKey(p.toOwner)];
      if (!toFac) continue;
      const rel = relationshipBetween(factions, p.fromOwner, p.toOwner);
      const threshold = aiAcceptThresholdFor(p.kind);
      const baseChance =
        DIPLOMACY.aiAcceptBaseChance +
        (rel - threshold) * DIPLOMACY.aiAcceptRelScale +
        ((50 - toFac.aggression) / 100) * DIPLOMACY.aiAcceptAggressionMod;
      const chance = Math.max(0.05, Math.min(0.95, baseChance));
      if (Math.random() < chance) {
        proposals[id] = { ...p, status: 'active' };
        factions = relationshipDelta(factions, p.fromOwner, p.toOwner, DIPLOMACY.relOnAccept);
        factions = relationshipDelta(factions, p.toOwner, p.fromOwner, DIPLOMACY.relOnAccept);
        events.push({
          id: makeId(),
          message: `${labelForOwner(p.toOwner, factions)} accepts ${kindLabel(p.kind)} from ${labelForOwner(p.fromOwner, factions)}.`,
          kind: 'diplomacy',
          createdAt: Date.now(),
        });
      } else {
        proposals[id] = { ...p, status: 'rejected' };
        factions = relationshipDelta(factions, p.fromOwner, p.toOwner, DIPLOMACY.relOnReject);
        factions = relationshipDelta(factions, p.toOwner, p.fromOwner, DIPLOMACY.relOnReject);
        events.push({
          id: makeId(),
          message: `${labelForOwner(p.toOwner, factions)} rejects ${kindLabel(p.kind)} from ${labelForOwner(p.fromOwner, factions)}.`,
          kind: 'diplomacy',
          createdAt: Date.now(),
        });
      }
    }

    // 4b-iii. Tribute transfers: player is the only payer in v2 (AI gold untracked).
    let tributeOwed = 0;
    const tributeIds: string[] = [];
    for (const id of proposalOrder) {
      const p = proposals[id];
      if (!p || p.status !== 'active' || p.kind !== 'tribute') continue;
      if (p.fromOwner === 'player') {
        tributeOwed += p.tributePerTick;
        tributeIds.push(id);
      }
    }
    if (tributeOwed > 0) {
      if (newGold < tributeOwed) {
        // Bankruptcy: break every player tribute + apply relationship penalty.
        for (const id of tributeIds) {
          const p = proposals[id];
          if (!p) continue;
          const final: Proposal = { ...p, status: 'broken', turnsRemaining: 0 };
          proposals[id] = final;
          proposalHistory.unshift(final);
          if (proposalHistory.length > 24) proposalHistory.length = 24;
          if (p.toOwner) {
            factions = relationshipDelta(
              factions,
              p.fromOwner!,
              p.toOwner,
              DIPLOMACY.relOnWarBrokenTreaty,
            );
          }
        }
      } else {
        newGold -= tributeOwed;
      }
    }

    // 4b-iv. Embargo penalty on player income (flat -25% if any active).
    let playerHasEmbargo = false;
    for (const id of proposalOrder) {
      const p = proposals[id];
      if (!p || p.status !== 'active' || p.kind !== 'embargo') continue;
      if (p.fromOwner === 'player' || p.toOwner === 'player') {
        playerHasEmbargo = true;
        break;
      }
    }
    if (playerHasEmbargo) {
      income = Math.round(income * (1 - DIPLOMACY.embargoGoldPenalty));
      newGold = state.gold + income;
    }

    // 4b-v. Relationship decay toward 0.
    factions = tickRelationshipDecay(factions);

    // 4b-vi. Apply AI proposals (validated against the same caps as player proposals).
    for (const p of aiOutcome.proposals) {
      if (!p.fromOwner || !p.toOwner || p.fromOwner === p.toOwner) continue;
      // Cap: max pending+active from this owner.
      let fromCount = 0;
      for (const id of proposalOrder) {
        const q = proposals[id];
        if (
          q &&
          q.fromOwner === p.fromOwner &&
          (q.status === 'pending' || q.status === 'active')
        ) {
          fromCount++;
        }
      }
      if (fromCount >= DIPLOMACY.maxActiveProposalsPerOwner) continue;
      // Cap: max pending to this recipient.
      let pendingToRecipient = 0;
      for (const id of proposalOrder) {
        const q = proposals[id];
        if (q && q.toOwner === p.toOwner && q.status === 'pending') {
          pendingToRecipient++;
        }
      }
      if (pendingToRecipient >= DIPLOMACY.maxPendingProposalsPerOwner) continue;
      // Reject duplicate.
      let duplicate = false;
      for (const id of proposalOrder) {
        const q = proposals[id];
        if (
          q &&
          q.fromOwner === p.fromOwner &&
          q.toOwner === p.toOwner &&
          q.kind === p.kind &&
          (q.status === 'pending' || q.status === 'active')
        ) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) continue;
      // Reject cooldown.
      let inCooldown = false;
      for (const q of proposalHistory) {
        if (
          q.fromOwner === p.fromOwner &&
          q.toOwner === p.toOwner &&
          q.kind === p.kind &&
          q.status === 'rejected' &&
          state.totalTurns - q.createdTurn < DIPLOMACY.rejectedCooldown
        ) {
          inCooldown = true;
          break;
        }
      }
      if (inCooldown) continue;
      // Create the proposal.
      const id = `prop_${makeId()}`;
      const lifespan: Record<ProposalKind, number> = {
        alliance: DIPLOMACY.pendingLifespan + DIPLOMACY.allianceLifespan,
        embargo: DIPLOMACY.pendingLifespan + DIPLOMACY.embargoLifespan,
        nap: DIPLOMACY.pendingLifespan + DIPLOMACY.napLifespan,
        tribute: DIPLOMACY.pendingLifespan + DIPLOMACY.tributeLifespan,
      };
      const tributePerTick =
        p.kind === 'tribute' ? p.tributePerTick ?? DIPLOMACY.tributeGoldPerTick : 0;
      proposals[id] = {
        id,
        kind: p.kind,
        fromOwner: p.fromOwner,
        toOwner: p.toOwner,
        turnsRemaining: lifespan[p.kind],
        tributePerTick,
        status: 'pending',
        createdTurn: state.totalTurns,
      };
      proposalOrder.unshift(id);
      events.push({
        id: makeId(),
        message: `📜 ${labelForOwner(p.fromOwner, factions)} proposed ${kindLabel(p.kind)} to ${labelForOwner(p.toOwner, factions)}.`,
        kind: 'diplomacy',
        createdAt: Date.now(),
      });
    }

    // 5. Player collapse detection.
    const startId = state.startingCountryId;
    const startCountry = startId ? countries[startId] : null;
    let restedTurns = state.playerRestedTurns;
    let phase: GamePhase = state.phase;
    if (
      startCountry &&
      startCountry.owner === 'player' &&
      startCountry.happiness < HAPPINESS.playerCollapseThreshold &&
      !activeWarOrder.length // ignore collapse during active war-fronts
    ) {
      restedTurns += 1;
      if (restedTurns >= HAPPINESS.playerCollapseTolerance) {
        phase = 'lost';
      }
    } else {
      restedTurns = Math.max(0, restedTurns - 1);
    }

    if (phase === 'playing') phase = checkVictory(countries, startId);

    return {
      countries,
      gold: newGold,
      incomePerTurn: income,
      events: events.slice(0, 6),
      totalTurns: state.totalTurns + 1,
      year: STARTING_YEAR + Math.floor((state.totalTurns + 1) / 8),
      playerRestedTurns: restedTurns,
      phase,
      activeWars,
      activeWarOrder,
      factions,
      proposals,
      proposalOrder,
      proposalHistory,
    };
  });
}

function pickAiStartingCountries(order: string[], playerId: string, count: number): string[] {
  const candidates = order
    .filter((id) => id !== playerId)
    .slice()
    .sort(() => Math.random() - 0.5);
  const picked: string[] = [];
  for (const id of candidates) {
    if (picked.length >= count) break;
    if (!picked.includes(id)) picked.push(id);
  }
  return picked;
}

function computeIncome(countries: GameState['countries']): number {
  let total = 0;
  for (const id in countries) {
    const c = countries[id];
    if (!c || c.owner !== 'player') continue;
    const factor = c.happiness >= 60 ? 1 : c.happiness <= 20 ? ECONOMY.unhappyPenalty : 0.75;
    total += c.baseValue * factor;
  }
  let upkeep = 0;
  for (const id in countries) {
    const c = countries[id];
    if (!c || c.owner !== 'player') continue;
    upkeep += c.fortification * ECONOMY.upkeepPerFortification;
  }
  return Math.max(0, Math.round(total - upkeep));
}

function checkVictory(countries: GameState['countries'], playerId: string | null): GamePhase {
  if (!playerId) return 'playing';
  let playerOwned = 0;
  let total = 0;
  for (const id in countries) {
    total += 1;
    if (countries[id]?.owner === 'player') playerOwned += 1;
  }
  return playerOwned === total ? 'won' : 'playing';
}
