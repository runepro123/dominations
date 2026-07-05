// Domain types for the world-conquest game.

export type OwnerId = 'player' | `ai_${number}` | null;

export interface CountryRecord {
  /** ISO 3166-1 numeric code as string (matches world-atlas id) */
  id: string;
  /** ISO 3-letter code (USA, CHN, etc.) */
  iso3: string;
  /** Display name */
  name: string;
  /** Population in millions */
  population: number;
  /** Strategic value: economic output per turn */
  baseValue: number;
  /** Centroid longitude (-180..180) */
  cx: number;
  /** Centroid latitude (-90..90) */
  cy: number;
  /** Owner of this country */
  owner: OwnerId;
  /** Population happiness 0..100 */
  happiness: number;
  /** Defensive strength 0..MAX_STATS (1000) */
  defense: number;
  /** Offensive military power 0..MAX_STATS (1000) */
  military: number;
  /** Fortification level, increases tick gains */
  fortification: number;
  /** Adjacent country IDs (computed on load) */
  neighbors: string[];
  /** Continent label */
  continent: string;
  /** Emoji flag for UI */
  flag: string;
  /** Ticks of enforced non-aggression remaining. Decays each game tick. */
  peaceTicksRemaining: number;
}

export type GamePhase = 'start' | 'playing' | 'won' | 'lost';

export interface TurnEvent {
  id: string;
  message: string;
  kind: 'info' | 'war' | 'economy' | 'diplomacy' | 'danger';
  createdAt: number;
}

/**
 * An in-progress invasion. Both sides bleed each tick; the war resolves when
 * `ticksRemaining` reaches zero — attacker wins if its remaining military
 * outranks the defender's remaining defense, otherwise the attack fails.
 */
export interface ActiveWar {
  id: string;
  attackerId: string;
  defenderId: string;
  startTurn: number;
  ticksRemaining: number;
  totalTicks: number;
  attackerStartMilitary: number;
  attackerCurrentMilitary: number;
  defenderStartDefense: number;
  defenderCurrentDefense: number;
  /** Sum of all reinforce amounts sent during this war. */
  attackerReinforcements: number;
  /** Gold spent on war chest + reinforcements so far. */
  goldSpent: number;
  /** Visual pulse phase, advanced on each tick. */
  pulse: number;
  /** True if this is a sea-borne invasion (target not adjacent to attacker). */
  naval: boolean;
}

export interface GameState {
  phase: GamePhase;
  year: number;
  countries: Record<string, CountryRecord>;
  order: string[];
  gold: number;
  incomePerTurn: number;
  selectedCountryId: string | null;
  conquestTargetId: string | null;
  events: TurnEvent[];
  totalTurns: number;
  /** IDs of countries owned by the player at start; pressure mounts if they slide. */
  startingCountryId: string | null;
  /** Has the player been defeated (used to seed AI narrative) */
  playerRestedTurns: number;
  /** Active invasions; key by war id. */
  activeWars: Record<string, ActiveWar>;
  /** Order used to iterate active wars during tick processing. */
  activeWarOrder: string[];
  /** Empire-level state (personality + relationships). Keyed by OwnerId as
   *  string (`'player'`, `'ai_1'`, etc.) so we don't duplicate the same map
   *  across 250 country tiles every tick. */
  factions: Record<string, FactionState>;
  /** Pending + active diplomatic proposals, keyed by id. */
  proposals: Record<string, Proposal>;
  /** Iteration order for proposals (newest first). */
  proposalOrder: string[];
  /** Capped ring of resolved proposals for the news ticker / history view. */
  proposalHistory: Proposal[];
}

/**
 * Empire-level personality + relationship scores. Stored per-empire (not per
 * country) to avoid duplicating the map across 250 tiles every game tick.
 */
export interface FactionState {
  /** Personality trait 0..100; higher = more hawkish / aggressive. */
  aggression: number;
  /** Per-other-owner relationship score (-100..100). Keyed by `'player'` /
   *  `'ai_1'` / `'ai_2'` / etc. — string coercion of an OwnerId. */
  relationships: Record<string, number>;
  /** Founding country name for AI empires — used as the visible empire label
   *  ("Egypt" rather than "AI Power 3"). Seeded once at game start. */
  founderName?: string;
}

export type ProposalKind = 'alliance' | 'embargo' | 'nap' | 'tribute';

export type ProposalStatus = 'pending' | 'active' | 'rejected' | 'expired' | 'broken';

/**
 * A diplomatic treaty between two empires. Created by either side, voted on by
 * the recipient, and either expires or stays active for a kind-specific span.
 */
export interface Proposal {
  id: string;
  kind: ProposalKind;
  /** Proposer's owner id (the one who spent the political capital). */
  fromOwner: OwnerId;
  /** Recipient's owner id (the one that votes). */
  toOwner: OwnerId;
  /** Ticks remaining before automatic expire/broken. */
  turnsRemaining: number;
  /** Only meaningful for tribute: payer loses this much gold per tick. */
  tributePerTick: number;
  status: ProposalStatus;
  createdTurn: number;
}
