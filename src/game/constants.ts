// Game tuning knobs. Centralised so we can re-balance without diving through components.

/**
 * Hard cap on each country's military and defense. Replaces the old 200 ceiling
 * so the can grow into a true global superpower and invade anyone.
 */
export const MAX_STATS = 1000;

export const STARTING_YEAR = 2026;

export const PLAYER_START = {
  gold: 1200,
  military: 60,
  defense: 60,
  happiness: 75,
  fortification: 0,
};

export const AI_START = {
  /** Lower than player so the player can snowball first. */
  gold: 600,
  military: 40,
  defense: 40,
  happiness: 60,
  fortification: 0,
};

export const ECONOMY = {
  /** Turn interval in seconds; income / events tick at this rate. */
  tickSeconds: 3,
  /** Happiness tax threshold above which income is full. */
  happyFullAt: 60,
  /** Multiplier applied to base_value when owner is unhappy. */
  unhappyPenalty: 0.4,
  /** Defensive upkeep applied per fortification level each tick. */
  upkeepPerFortification: 1,
  /** Maximum fortification. */
  maxFortification: 5,
  /** Defense decay each tick (no fortification, borders degenerate). */
  defenseDecay: 6,
};

export const COMBAT = {
  /** Minimum military-to-defense ratio needed to attempt conquest. With the
   *  raised MAX_STATS ceiling, an equal-strength defender is fair game, and a
   *  smaller force can invade by bleeding the defender down over 4 ticks. */
  attackRatio: 0.85,
  /** Base gold cost of an attack. */
  baseAttackCost: 80,
  /** Maximum military that can be lost in a single attack. */
  maxMilitaryLoss: 0.6,
  /** Defense reduction to defender once conquered. */
  conquerDefenseKeep: 0.6,
  /** Minimum defender happiness after conquest (rampant occupation). */
  conquerHappinessFloor: 35,
};

export const HAPPINESS = {
  /** Per-tick gain from a happy country. */
  naturalGainWhenCalm: 0.4,
  /** Per-tick erosion from unrest. */
  naturalErodeWhenUnhappy: 0.6,
  /** Below this, country may revolt during a tick (lose control). */
  revoltThreshold: 8,
  /** If player owner happiness drops below this for too long, player loses. */
  playerCollapseThreshold: 5,
  /** Number of consecutive low-happiness player-ticks before defeat. */
  playerCollapseTolerance: 6,
};

export const AI = {
  /** Seconds between AI strategic decisions. */
  decisionSeconds: 10,
  /** Probability an AI country attacks when conditions allow. */
  attackChance: 0.12,
  /** Probability an AI country fortifies instead of attacking. */
  buildChance: 0.55,
  /** AI attack preferred military ratio (above this it always attacks). Dropped
   *  from 1.7 to 1.4 so AI still needs a real advantage but doesn't out-pace
   *  the player forever once the cap is raised. */
  aiAttackRatio: 1.4,
  /** Naval invasions need a starker military advantage (amphibious logistics). */
  aiNavalAttackRatio: 2.0,
  /** Probability an AI country launches a sea-borne invasion once naval candidates
   *  are eligible (compounds with attackChance ≈ 0.18 × 0.12 ≈ 2%/tick). */
  navalAttackChance: 0.18,
  /** Minimum happiness required for AI to launch an attack; unhappy powers focus inward. */
  aiHappinessAttackFloor: 45,
  /** Ticks of enforced non-aggression after a war ends (8 ticks ≈ 24 s). */
  peaceCooldownTicks: 8,
  /** AI gains per tick applied to chosen action. (`runAiTurn` currently runs
   *  every game tick — true per-tick rates.) Tuned so AI gains ≈100 mil/min
   *  and ≈100 def/min, keeping pace with the raised MAX_STATS cap = 1000
   *  without outpacing the player (who can recruit ~80/click). */
  fortifyPerTick: 5,
  recruitPerTick: 6,
};

export const COLORS = {
  player: 0x36d399,
  ai: 0xe63946,
  neutral: 0x4b6082,
  selected: 0xf5c542,
  target: 0xff7a45,
  border: 0xa9c4ff,
  borderOwned: 0x36d399,
};

export const PLAYER_ACTION = {
  /** Big batches + low per-point cost so the player can climb towards
   *  MAX_STATS (= 1000) within a handful of clicks rather than 50+. */
  recruitCostPerPoint: 4,
  recruitAmount: 80,
  fortifyCostPerPoint: 6,
  fortifyAmount: 50,
  subsidizeCostPerPoint: 10,
  subsidizeAmount: 8,
  taxGainPerPoint: 18,
  taxHappinessCost: 6,
};

/** Tuning for in-progress wars (replaces instant conquest). */
export const WAR = {
  /** Medium duration (3-5 ticks) per the user's choice (~12s at 3s/tick). */
  defaultDuration: 4,
  /** War chest cost now scales POSITIVELY with defender strength (was the
   *  inverse at the old 200 cap, which produced negative gold once any
   *  defender passed defense=100 — players got paid to declare war). */
  warChestBaseGold: 60,
  warChestDefScale: 0.25,
  /** Per-tick bleed multipliers — both sides lose each game tick. */
  attackerBleedPerTick: 0.10,
  defenderBleedPerTick: 0.16,
  /**
   * Sea-borne invasions incur extra bleed against the attacker (no haven, supply
   * lines cut, ships sunk). The defender fights on home turf so they get no
   * bonus bleed — in fact, slightly less.
   */
  navalAttackerBleedBonus: 0.06,
  navalDefenderBleedBonus: 0,
  /** Fraction of standing troops that survive the landing and join the war pool. */
  navalLandingFraction: 0.7,
  /** Multiplier on war-chest gold cost for sea invasions (amphibious logistics). */
  navalGoldMultiplier: 1.8,
  /** Cancel refunds are smaller for naval wars (ships lost in transit). */
  navalCancelRefundFraction: 0.3,
  /** Land-conquest happiness penalty applied to the defender on a successful WIN. */
  landConquerHappinessLoss: 25,
  /** Naval-conquest happiness penalty is smaller (defender is already foreign). */
  navalConquerHappinessLoss: 15,
  /** Even-failed naval invasions return very few troops (most lost at sea). */
  navalResolveLoseRefundFraction: 0.15,
  /** Cancel-time defender restore is smaller for cancelled naval invasions. */
  navalCancelRestoreFraction: 0.25,
  /** Naval WIN refunds are smaller (still scattered across the ocean). */
  navalWinRefundFraction: 0.55,
  /** Land WIN refunds = the attacker keeps newAtt minus 5 logistical losses. */
  landWinRefundFloor: 5,
  /** When the player cancels an invasion mid-war. */
  cancelRefundFraction: 0.5,
  cancelDefenderHappinessLoss: 12,
  /** Naval cancellations anger the defender less — they were never actually invaded. */
  navalCancelDefenderHappinessLoss: 4,
  /** Fraction of the attacker's war-pool returned on resolve-lose (retreats home). */
  resolveLoseRefundFraction: 0.3,
  /** Fraction of war-pooled field defense returned to the defender's tile on cancel. */
  cancelRestoreFraction: 0.4,
  /** Flat defense bonus that the recovering defender receives on top of the restore fraction. */
  cancelFlatDefenseBonus: 5,
  /** Speed-up bypasses 2 ticks at the cost of attacker morale. */
  speedUpTicks: 2,
  speedUpHappinessCost: 4,
  /** Mercenary reinforcements added directly into the war pool. */
  reinforceCostPerUnit: 14,
  reinforceUnitAmount: 25,
  /** Number of marching-troop spheres animated along the invade path. */
  marchTroopCount: 8,
};

/**
 * Tuning for the v2 UN-style diplomacy system (proposals, treaties, AI voting).
 * See src/game/types.ts for `Proposal`, `ProposalKind`, `FactionState`.
 */
export const DIPLOMACY = {
  /** Active treaty lifespans in ticks (3s/tick → 60 = ~3 minutes real time). */
  allianceLifespan: 60,
  embargoLifespan: 50,
  napLifespan: 40,
  tributeLifespan: 35,

  /** Pending proposals expire fast so the inbox doesn't get spammed. */
  pendingLifespan: 5,

  /** Cool-down after a rejection before re-proposing the same kind to the
   *  same target. Prevents AI ↔ AI relationship runaways from spamming. */
  rejectedCooldown: 10,

  /** Tribute gold cost: payer loses this much per tick, recipient gains it. */
  tributeGoldPerTick: 8,
  tributeCostFloor: 12,

  /** Embargo's only mechanical teeth for v2.1: embargóed target loses share
   *  of its income while a treaty is active. */
  embargoGoldPenalty: 0.25,

  /** Relationship scores drift toward 0 (diplomatic memory fades). */
  relationshipDecayPerTick: 0.15,

  /** Per-event relationship bumps. */
  relOnAccept: 15,
  relOnReject: -10,
  relOnWarDecline: -30,
  relOnWarBrokenTreaty: -15,

  /** Acceptance thresholds: AI owner needs AT LEAST this relationship to vote Yes. */
  aiAcceptAlliance: 60,
  aiAcceptNap: 40,
  /** AI accepts an EMBARGO against a third power when their relationship with
   *  that third power is BELOW this number (hostile enough to gang up). */
  aiAcceptEmbargoAgainst: 25,
  /** Tribute: AI must be hostile enough (rel below this) to demand money. */
  aiAcceptTribute: -10,

  /** Personality seeds. */
  playerAggression: 35,
  aiBaseAggression: 55,
  aiAggressionSpread: 30,

  /** AI acceptance probability formula:
   *    chance = aiAcceptBaseChance
   *           + (rel - threshold) * aiAcceptRelScale
   *           + (50 - ai.aggression) / 100 * aiAcceptAggressionMod
   *  Then clamp to [0.05, 0.95]. */
  aiAcceptBaseChance: 0.55,
  aiAcceptRelScale: 0.012,
  aiAcceptAggressionMod: 0.35,

  /** Cold-War caps. */
  maxPendingProposalsPerOwner: 4,
  maxActiveProposalsPerOwner: 12,
};
