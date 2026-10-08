import { err, ok, type Result } from './result';

/**
 * Perception vector and the discrete action space shared with the sidecar.
 *
 * Vision radius stays in `derive` (`./stats`): `5 + floor(perception / 2)`.
 * Character side is not stored; `player` is light and `bot` is dark via controller.
 * A silent sidecar (200 ms) is the server's fallback trigger. This module only
 * scores a legal action when that server asks.
 */

/** Episodic memory rows kept per bot. Older rows are the server's archive problem. */
export const MEMORY_CAP = 10_000;

/** Working-memory events kept for the current decision. */
export const WORKING_MEMORY = 10;

/**
 * Concatenation order of the observation vector.
 * `grid` is the space block from the task (8×8 cells).
 */
export const OBSERVATION_BLOCK_ORDER = [
  'self',
  'grid',
  'actors',
  'objects',
  'events',
  'quests',
  'economy',
  'guild',
  'memory',
] as const;

export type ObservationBlock = (typeof OBSERVATION_BLOCK_ORDER)[number];

/** Length of each block. Sum is the observation length, 896. */
export const BLOCK_LENGTHS = {
  self: 64,
  grid: 128,
  actors: 256,
  objects: 128,
  events: 64,
  quests: 64,
  economy: 32,
  guild: 32,
  memory: 128,
} as const satisfies Record<ObservationBlock, number>;

export const OBSERVATION_LENGTH =
  BLOCK_LENGTHS.self +
  BLOCK_LENGTHS.grid +
  BLOCK_LENGTHS.actors +
  BLOCK_LENGTHS.objects +
  BLOCK_LENGTHS.events +
  BLOCK_LENGTHS.quests +
  BLOCK_LENGTHS.economy +
  BLOCK_LENGTHS.guild +
  BLOCK_LENGTHS.memory;

/** Start index of each block inside the 896-vector. */
export const BLOCK_OFFSETS: { readonly [K in ObservationBlock]: number } = {
  self: 0,
  grid: BLOCK_LENGTHS.self,
  actors: BLOCK_LENGTHS.self + BLOCK_LENGTHS.grid,
  objects: BLOCK_LENGTHS.self + BLOCK_LENGTHS.grid + BLOCK_LENGTHS.actors,
  events: BLOCK_LENGTHS.self + BLOCK_LENGTHS.grid + BLOCK_LENGTHS.actors + BLOCK_LENGTHS.objects,
  quests:
    BLOCK_LENGTHS.self +
    BLOCK_LENGTHS.grid +
    BLOCK_LENGTHS.actors +
    BLOCK_LENGTHS.objects +
    BLOCK_LENGTHS.events,
  economy:
    BLOCK_LENGTHS.self +
    BLOCK_LENGTHS.grid +
    BLOCK_LENGTHS.actors +
    BLOCK_LENGTHS.objects +
    BLOCK_LENGTHS.events +
    BLOCK_LENGTHS.quests,
  guild:
    BLOCK_LENGTHS.self +
    BLOCK_LENGTHS.grid +
    BLOCK_LENGTHS.actors +
    BLOCK_LENGTHS.objects +
    BLOCK_LENGTHS.events +
    BLOCK_LENGTHS.quests +
    BLOCK_LENGTHS.economy,
  memory:
    BLOCK_LENGTHS.self +
    BLOCK_LENGTHS.grid +
    BLOCK_LENGTHS.actors +
    BLOCK_LENGTHS.objects +
    BLOCK_LENGTHS.events +
    BLOCK_LENGTHS.quests +
    BLOCK_LENGTHS.economy +
    BLOCK_LENGTHS.guild,
};

/** Space block: 8×8 cells relative to the bot, two features per cell. */
export const GRID_SIZE = 8;
export const CELL_FEATURE_ORDER = ['type', 'occupancy'] as const;

/** 16 nearest creatures. Named features, then zeros through index 15. */
export const ACTOR_SLOTS = 16;
export const ACTOR_SLOT_LENGTH = 16;
export const ACTOR_FEATURE_ORDER = ['type', 'hpRatio', 'distance', 'hostility'] as const;

/** 16 nearest objects, eight numbers each. The eight field names are not fixed here. */
export const OBJECT_SLOTS = 16;
export const OBJECT_SLOT_LENGTH = 8;

export interface ObservationParts {
  self: readonly number[];
  grid: readonly number[];
  actors: readonly number[];
  objects: readonly number[];
  events: readonly number[];
  quests: readonly number[];
  economy: readonly number[];
  guild: readonly number[];
  memory: readonly number[];
}

/**
 * Fixed order of the 64 discrete actions. Index 0 is `step_n`, index 16 is `wait`,
 * the last id is `scan`. The five ids after `sleep` close the gap in the source table.
 */
export const ACTION_IDS = [
  'step_n',
  'step_ne',
  'step_e',
  'step_se',
  'step_s',
  'step_sw',
  'step_w',
  'step_nw',
  'run_n',
  'run_ne',
  'run_e',
  'run_se',
  'run_s',
  'run_sw',
  'run_w',
  'run_nw',
  'wait',
  'attack_melee',
  'attack_ranged',
  'aim',
  'ability_1',
  'ability_2',
  'ability_3',
  'dodge',
  'take',
  'drop',
  'use',
  'open',
  'hack',
  'talk',
  'swap_weapon',
  'swap_armor',
  'use_item',
  'discard',
  'station',
  'recipe',
  'craft_start',
  'craft_boost',
  'auction_open',
  'auction_list',
  'auction_buy',
  'auction_sell',
  'trade',
  'quest_accept',
  'quest_abandon',
  'quest_turnin',
  'guild_join',
  'guild_leave',
  'guild_create',
  'guild_invite',
  'guild_vote',
  'guild_war',
  'chat',
  'mail',
  'title',
  'bind',
  'portal',
  'rest',
  'sleep',
  'reload',
  'crawl',
  'party_invite',
  'loot_corpse',
  'scan',
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

export interface UtilityInput {
  legal: readonly string[];
  hp: number;
  maxHp: number;
  od: number;
  nearestEnemy: number | null;
  weaponRange: number;
}

/**
 * One creature slot, bot-relative.
 * `[type, hp/max, min(1, distance/20), hostility, ...12 zeros]`.
 * Hostility is `0`, `0.5`, or `1`. `encodeObservation` still clips every value into `[0, 1]`.
 */
export function encodeActorFeatures(input: {
  type: number;
  hp: number;
  maxHp: number;
  distance: number;
  hostility: number;
}): number[] {
  const hpRatio = input.maxHp > 0 ? input.hp / input.maxHp : 0;
  const scaledDistance = input.distance / 20;
  const features = new Array<number>(ACTOR_SLOT_LENGTH).fill(0);
  features[0] = input.type;
  features[1] = hpRatio;
  features[2] = scaledDistance > 1 ? 1 : scaledDistance;
  features[3] = input.hostility;
  return features;
}

function clipUnit(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

/**
 * Fit every block to its length (pad with zeros, drop the tail), replace NaN with 0,
 * and clip every value into `[0, 1]`. Result length is always 896.
 */
export function encodeObservation(partial: ObservationParts): number[] {
  const vector: number[] = [];
  for (const block of OBSERVATION_BLOCK_ORDER) {
    const length = BLOCK_LENGTHS[block];
    const source = partial[block];
    for (let index = 0; index < length; index += 1) {
      const raw = index < source.length ? source[index] : 0;
      vector.push(clipUnit(raw ?? 0));
    }
  }
  return vector;
}

function preferredAction(input: UtilityInput): string {
  const hpRatio = input.maxHp > 0 ? input.hp / input.maxHp : 0;
  if (hpRatio < 0.3 && input.legal.includes('use_item')) {
    return 'use_item';
  }
  if (input.nearestEnemy !== null && input.nearestEnemy < 2 && input.od >= 1) {
    return 'attack_melee';
  }
  if (input.nearestEnemy !== null && input.nearestEnemy <= input.weaponRange) {
    return 'attack_ranged';
  }
  // No quest-object bearing is on this input. With no target, step north.
  return 'step_n';
}

/**
 * Deterministic utility policy. Never returns an id outside `legal`.
 * An empty legal list is `none` (it does not invent `wait`).
 */
export function utilityAction(input: UtilityInput): Result<string, 'none'> {
  if (input.legal.length === 0) {
    return err('none');
  }

  const preferred = preferredAction(input);
  if (input.legal.includes(preferred)) {
    return ok(preferred);
  }

  const fallback = input.legal[0];
  if (fallback === undefined) {
    return err('none');
  }
  return ok(fallback);
}
