// Simple tactical AI: each AI country decides whether to fortify, recruit, or declare war.
// AI invasions run through the same ActiveWar pipeline as the player, so we get
// parity on duration, bleed, and resolution across the entire world.

import { AI, WAR, MAX_STATS } from './constants';
import type {
  ActiveWar,
  CountryRecord,
  FactionState,
  OwnerId,
  ProposalKind,
  TurnEvent,
} from './types';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** A diplomatic proposal the AI wants to make this tick. Validated + created
 *  in the store, so we don't need to worry about caps/cooldowns here. */
export interface AiProposal {
  kind: ProposalKind;
  fromOwner: OwnerId;
  toOwner: OwnerId;
  /** Optional tribute amount; defaults to DIPLOMACY.tributeGoldPerTick. */
  tributePerTick?: number;
}

export interface AiOutcome {
  events: TurnEvent[];
  wars: ActiveWar[];
  proposals: AiProposal[];
}

export function runAiTurn(
  countries: Record<string, CountryRecord>,
  order: string[],
  factions: Record<string, FactionState>,
): AiOutcome {
  const events: TurnEvent[] = [];
  const wars: ActiveWar[] = [];
  const proposals: AiProposal[] = [];
  const proposedOwners = new Set<string>();

  for (const id of order) {
    const c = countries[id];
    if (!c || !c.owner || c.owner === 'player') continue;

    // One diplomacy roll per empire per tick. Skip if already proposed this tick.
    if (!proposedOwners.has(c.owner)) {
      proposedOwners.add(c.owner);
      const proposal = maybeProposeDiplomacy(c.owner, factions);
      if (proposal) proposals.push(proposal);
    }

    const score = scoreAction(c, countries);
    if (score.kind === 'fortify') {
      const updated: CountryRecord = {
        ...c,
        fortification: clamp(c.fortification + 1, 0, 5),
        defense: clamp(c.defense + AI.fortifyPerTick, 0, MAX_STATS),
      };
      countries[id] = updated;
      if (Math.random() < 0.04) {
        events.push(tell(`${updated.name} reinforces its borders.`, 'diplomacy'));
      }
      continue;
    }

    if (score.kind === 'recruit') {
      countries[id] = {
        ...c,
        military: clamp(c.military + AI.recruitPerTick, 0, MAX_STATS),
      };
      continue;
    }

    if (score.kind === 'attack') {
      const targetId = score.targetId;
      if (!targetId) continue;
      const target = countries[targetId];
      if (!target) continue;
      const naval = !c.neighbors.includes(targetId);
      const ratio = c.military / Math.max(1, target.defense);
      const requiredRatio = naval ? AI.aiNavalAttackRatio : AI.aiAttackRatio;
      if (ratio < requiredRatio) continue;

      const baseCommitted = clamp(Math.round(c.military * 0.65), 10, Math.max(10, c.military - 5));
      const committed = naval
        ? Math.max(8, Math.round(baseCommitted * WAR.navalLandingFraction))
        : baseCommitted;
      const defenderMobilized = Math.round(target.defense * 0.7);

      const war: ActiveWar = {
        id: `ai_war_${makeId()}`,
        attackerId: id,
        defenderId: targetId,
        startTurn: 0,
        ticksRemaining: WAR.defaultDuration,
        totalTicks: WAR.defaultDuration,
        attackerStartMilitary: committed,
        attackerCurrentMilitary: committed,
        defenderStartDefense: defenderMobilized,
        defenderCurrentDefense: defenderMobilized,
        attackerReinforcements: 0,
        goldSpent: 0,
        pulse: 0,
        naval,
      };
      wars.push(war);

      countries[id] = { ...c, military: clamp(c.military - committed, 5, MAX_STATS) };
      countries[targetId] = {
        ...target,
        defense: Math.round(target.defense * 0.3),
      };
      const eventMsg = naval
        ? `🚢 ${c.name} launches a sea-borne assault on ${target.name}!`
        : `🪖 ${c.name} marches on ${target.name}!`;
      events.push(tell(eventMsg, 'war'));
      continue;
    }
  }

  return { events, wars, proposals };
}

function ownerKeyLocal(o: OwnerId): string {
  return o ?? '__null__';
}

/**
 * One diplomacy roll per AI empire per tick. Aggressive AIs lean toward
 * demands (tribute / embargo); peaceful AIs lean toward offers (alliance /
 * NAP). Picks the most extreme target in the relationship map.
 */
function maybeProposeDiplomacy(
  from: OwnerId,
  factions: Record<string, FactionState>,
): AiProposal | null {
  const myFac = factions[ownerKeyLocal(from)];
  if (!myFac) return null;
  let bestPos: { to: OwnerId; rel: number } | null = null;
  let bestNeg: { to: OwnerId; rel: number } | null = null;
  for (const [toKey, rel] of Object.entries(myFac.relationships)) {
    if (rel > (bestPos?.rel ?? -Infinity)) {
      bestPos = { to: toKey as OwnerId, rel };
    }
    if (rel < (bestNeg?.rel ?? Infinity)) {
      bestNeg = { to: toKey as OwnerId, rel };
    }
  }
  // Aggression in [0..1]. Peaceful AIs (< 50) favour offers; aggressive ones
  // favour demands.
  const agg = myFac.aggression / 100;
  const peaceFactor = 1 - agg;
  const warFactor = agg;
  // Tribute demand: requires a hostile target (rel < -10) and aggressive AI.
  if (bestNeg && bestNeg.rel < -10 && Math.random() < warFactor * 0.18) {
    return { kind: 'tribute', fromOwner: from, toOwner: bestNeg.to };
  }
  // Embargo: hostile target (rel < 0) and aggressive AI.
  if (bestNeg && bestNeg.rel < 0 && Math.random() < warFactor * 0.12) {
    return { kind: 'embargo', fromOwner: from, toOwner: bestNeg.to };
  }
  // Alliance: friendly target (rel > 55) and peaceful AI.
  if (bestPos && bestPos.rel > 55 && Math.random() < peaceFactor * 0.18) {
    return { kind: 'alliance', fromOwner: from, toOwner: bestPos.to };
  }
  // NAP: friendly target (rel > 25) and peaceful AI.
  if (bestPos && bestPos.rel > 25 && Math.random() < peaceFactor * 0.14) {
    return { kind: 'nap', fromOwner: from, toOwner: bestPos.to };
  }
  return null;
}

function tell(message: string, kind: TurnEvent['kind']): TurnEvent {
  return { id: makeId(), message, kind, createdAt: Date.now() };
}

interface AiScore {
  kind: 'fortify' | 'recruit' | 'attack' | 'idle';
  targetId?: string;
}

function scoreAction(c: CountryRecord, countries: Record<string, CountryRecord>): AiScore {
  // Realism gate: a country in enforced peace or unhappy never goes on the
  // offensive. It still grows internally.
  const inEnforcedPeace = c.peaceTicksRemaining > 0;
  const tooUnhappy = c.happiness < AI.aiHappinessAttackFloor;

  if (c.military < 35) return { kind: 'recruit' };

  // Land candidates: only adjacent borders.
  const landCandidates = c.neighbors
    .map((id) => countries[id])
    .filter((t): t is CountryRecord => Boolean(t) && t.owner !== c.owner)
    .sort((a, b) => a.defense - b.defense);

  // Sea-born candidates: any non-owner, non-peace country (slower + pricier).
  // Skip if we already have a land target — preferring land keeps the AI
  // realistic. Otherwise, a small chance per tick to consider far shores.
  const allowNaval = landCandidates.length === 0 || Math.random() < AI.navalAttackChance;
  const navalCandidates = allowNaval
    ? Object.values(countries)
        .filter(
          (t) =>
            t &&
            t.id !== c.id &&
            t.owner !== c.owner && // covers player, other-AI, and neutrals
            !c.neighbors.includes(t.id),
        )
        .sort((a, b) => a.defense - b.defense)
    : [];

  const landTarget = landCandidates[0];
  const navalTarget = navalCandidates[0];

  if (!landTarget && !navalTarget) {
    return Math.random() < AI.buildChance
      ? { kind: 'fortify' }
      : c.happiness < 70
        ? { kind: 'fortify' }
        : { kind: 'idle' };
  }

  if (inEnforcedPeace || tooUnhappy) {
    // Cannot attack, but we should still grow / strengthen borders.
    if (c.happiness < 70) return { kind: 'fortify' };
    if (c.military < 80) return { kind: 'recruit' };
    if (c.fortification < 3) return { kind: 'fortify' };
    return { kind: 'idle' };
  }

  // Prefer land invasions when conditions are met; only consider naval as a
  // risky fallback (much rarer + stricter ratio).
  // Effective attack ratios DECREASE as the AI scales towards MAX_STATS — at the
  // old 200 cap with a fixed ratio of 1.7 the AI was fine, but at the new 1000
  // cap a fixed ratio physically locks the AI out of the late game. Linear
  // interpolation: land 1.4 → 1.0; naval 2.0 → 1.5.
  const milFrac = c.military / MAX_STATS;
  const landRatio = AI.aiAttackRatio - milFrac * 0.4;
  const navalRatio = AI.aiNavalAttackRatio - milFrac * 0.5;
  if (landTarget) {
    const ratio = c.military / Math.max(1, landTarget.defense);
    if (ratio >= landRatio && Math.random() < AI.attackChance) {
      return { kind: 'attack', targetId: landTarget.id };
    }
  }
  if (navalTarget) {
    const ratio = c.military / Math.max(1, navalTarget.defense);
    if (ratio >= navalRatio && Math.random() < AI.attackChance) {
      return { kind: 'attack', targetId: navalTarget.id };
    }
  }

  if (c.fortification < 3 && Math.random() < AI.buildChance) return { kind: 'fortify' };
  if (c.military < 60) return { kind: 'recruit' };
  return { kind: 'idle' };
}
