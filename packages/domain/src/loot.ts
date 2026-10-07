import { err, ok, type Result } from './result';
import type { Rng } from './rng';

export const GOLD_COEFFICIENT = {
  pack: 0.5,
  pair: 1,
  solo: 1,
  air: 1,
  turret: 1.5,
  anomaly: 1,
  elite: 3,
  boss: 10,
} as const;

/** Default unique-component chances. Callers pass the boss entry; bosses are not hardcoded. */
export const UNIQUE_COMPONENT_CHANCE = {
  elite: 0.2,
  unique: 0.3,
} as const;

export type LootKind = 'resource' | 'gold' | 'gear' | 'echo' | 'path' | 'component';
export type LootGrade = 'common' | 'rare' | 'epic' | 'unique';
export type ChestTier = 'common' | 'rare' | 'epic';

export interface LootEntry {
  itemId: string;
  chance: number;
  min: number;
  max: number;
  kind: LootKind;
  /**
   * Finished unique gear is skipped. Unique echoes, paths, and components still drop.
   * `grade` is optional so callers can mark a row without changing its catalog id.
   */
  grade?: LootGrade;
}

export interface LootStack {
  itemId: string;
  qty: number;
  itemLevel?: number;
}

const ITEM_LEVEL_MIN = 1;
const ITEM_LEVEL_MAX = 50;

const LEVELED_KINDS: ReadonlySet<LootKind> = new Set(['gear', 'echo', 'path']);

export function goldAmount(level: number, coefficient: number, rng: Rng): number {
  const roll = 1 + rng.nextInt(3);
  return Math.max(1, Math.floor(level * roll * coefficient));
}

export function gearItemLevel(monsterLevel: number, rng: Rng): number {
  const rolled = monsterLevel + rng.nextInt(7) - 3;
  return Math.min(ITEM_LEVEL_MAX, Math.max(ITEM_LEVEL_MIN, rolled));
}

function isFinishedUnique(entry: LootEntry): boolean {
  if (entry.kind === 'echo' || entry.kind === 'path' || entry.kind === 'component') {
    return false;
  }
  if (entry.itemId === 'unique_component') {
    return false;
  }
  if (entry.grade === 'unique') {
    return true;
  }
  return (
    entry.kind === 'gear' && (entry.itemId === 'gear_unique' || entry.itemId.endsWith('_unique'))
  );
}

function rollQuantity(entry: LootEntry, rng: Rng): number {
  return entry.min + rng.nextInt(entry.max - entry.min + 1);
}

export function rollLoot(input: {
  entries: LootEntry[];
  extra?: LootEntry[];
  rng: Rng;
  eliteQuantityMultiplier: number;
  monsterLevel?: number;
}): LootStack[] {
  const entries = input.extra === undefined ? input.entries : input.entries.concat(input.extra);
  const stacks: LootStack[] = [];
  for (const entry of entries) {
    if (isFinishedUnique(entry)) {
      continue;
    }
    if (!(input.rng.nextUnit() < entry.chance)) {
      continue;
    }
    let qty = rollQuantity(entry, input.rng);
    if (entry.kind === 'gold') {
      qty = Math.max(1, qty);
    } else {
      qty = Math.floor(qty * input.eliteQuantityMultiplier);
      if (qty < 1) {
        qty = 1;
      }
    }
    const stack: LootStack = { itemId: entry.itemId, qty };
    if (input.monsterLevel !== undefined && LEVELED_KINDS.has(entry.kind)) {
      stack.itemLevel = gearItemLevel(input.monsterLevel, input.rng);
    }
    stacks.push(stack);
  }
  return stacks;
}

const CHEST_KEYS: Record<ChestTier, number> = {
  common: 0,
  rare: 1,
  epic: 2,
};

const CHEST_GOLD: Record<ChestTier, { min: number; max: number }> = {
  common: { min: 10, max: 50 },
  rare: { min: 50, max: 200 },
  epic: { min: 200, max: 800 },
};

const CHEST_ITEMS: Record<ChestTier, { min: number; max: number }> = {
  common: { min: 1, max: 2 },
  rare: { min: 2, max: 3 },
  epic: { min: 3, max: 4 },
};

/**
 * Published unique-gear weight is folded into epic.
 * Common 70/25/5/0, rare 0/60/40/0, epic 0/0/100/0.
 */
const CHEST_GRADE_WEIGHTS: Record<ChestTier, { common: number; rare: number; epic: number }> = {
  common: { common: 70, rare: 25, epic: 5 },
  rare: { common: 0, rare: 60, epic: 40 },
  epic: { common: 0, rare: 0, epic: 100 },
};

function pickChestGrade(tier: ChestTier, rng: Rng): 'common' | 'rare' | 'epic' {
  const weights = CHEST_GRADE_WEIGHTS[tier];
  const total = weights.common + weights.rare + weights.epic;
  let roll = rng.nextInt(total);
  if (roll < weights.common) {
    return 'common';
  }
  roll -= weights.common;
  if (roll < weights.rare) {
    return 'rare';
  }
  return 'epic';
}

export function openChest(input: {
  tier: ChestTier;
  keys: number;
  regionLevel: number;
  rng: Rng;
}): Result<LootStack[], 'keys'> {
  if (input.keys < CHEST_KEYS[input.tier]) {
    return err('keys');
  }
  const gold = CHEST_GOLD[input.tier];
  const goldRoll = gold.min + input.rng.nextInt(gold.max - gold.min + 1);
  const stacks: LootStack[] = [{ itemId: 'gold', qty: Math.max(1, goldRoll * input.regionLevel) }];
  const items = CHEST_ITEMS[input.tier];
  const count = items.min + input.rng.nextInt(items.max - items.min + 1);
  for (let i = 0; i < count; i += 1) {
    const grade = pickChestGrade(input.tier, input.rng);
    stacks.push({ itemId: `gear_${grade}`, qty: 1, itemLevel: input.regionLevel });
  }
  if (input.tier === 'epic') {
    stacks.push({ itemId: 'unique_component', qty: 1 });
  }
  return ok(stacks);
}
