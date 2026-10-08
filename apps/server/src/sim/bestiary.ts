import { rollLoot, type LootEntry, type LootStack } from '@rift/domain/loot';
import type { Rng } from '@rift/domain/rng';
import type { Cell } from '@rift/domain/movement';

export interface BossPhase {
  index: number;
  /** Inclusive ratio of remaining HP above which this phase is not yet active. */
  hpBelow?: number;
  damageMultiplier?: number;
}

export interface MonsterTemplate {
  id: string;
  level: number;
  hp: number;
  damage: number;
  armor: number;
  accuracy: number;
  evasion: number;
  phaseCount: number;
  phases: readonly BossPhase[];
  prototype: boolean;
  rank: 'basic' | 'boss';
}

export interface EliteModifier {
  id: string;
  hpMultiplier?: number;
  damageMultiplier?: number;
  armorBonus?: number;
  speedMultiplier?: number;
  evasionMultiplier?: number;
}

export interface SpawnedMonster {
  id: string;
  monsterId: string;
  level: number;
  hp: number;
  maxHp: number;
  damage: number;
  armor: number;
  accuracyStat: number;
  accuracyScore: number;
  evasion: number;
  reaction: number;
  cell: Cell;
  eliteId: string | null;
  speedMultiplier: number;
  phaseCount: number;
  bossPhase: number;
  phases: readonly BossPhase[];
  prototype: boolean;
  rank: 'basic' | 'boss';
}

/** Catalog modifiers. Spore is +20% HP, matching the bestiary aura. */
export const ELITE_MODIFIERS: readonly EliteModifier[] = [
  { id: 'fiery', damageMultiplier: 1.5 },
  { id: 'poisonous', damageMultiplier: 1.3 },
  { id: 'armored', armorBonus: 5, speedMultiplier: 0.8 },
  { id: 'fast', speedMultiplier: 1.3, evasionMultiplier: 1.2 },
  { id: 'spore', hpMultiplier: 1.2 },
  { id: 'energetic', damageMultiplier: 1.4 },
];

/** Level 20, two phases. Second phase starts below half HP and hits ×1.5. */
export const KEEPER_PROTOTYPE: MonsterTemplate = {
  id: 'keeper_enhanced_prototype',
  level: 20,
  hp: 400,
  damage: 18,
  armor: 8,
  accuracy: 12,
  evasion: 6,
  phaseCount: 2,
  phases: [
    { index: 1 },
    { index: 2, hpBelow: 0.5, damageMultiplier: 1.5 },
  ],
  prototype: true,
  rank: 'boss',
};

/**
 * Level 50 unique keeper, three phases. The bestiary gives the phase count
 * and not the HP cuts, so the cuts are even thirds.
 */
export const KEEPER_FULL: MonsterTemplate = {
  id: 'keeper_enhanced',
  level: 50,
  hp: 1000,
  damage: 35,
  armor: 18,
  accuracy: 14,
  evasion: 8,
  phaseCount: 3,
  phases: [
    { index: 1 },
    { index: 2, hpBelow: 2 / 3, damageMultiplier: 1.25 },
    { index: 3, hpBelow: 1 / 3, damageMultiplier: 1.5 },
  ],
  prototype: false,
  rank: 'boss',
};

export const PROTOTYPE_MONSTERS: readonly MonsterTemplate[] = [
  {
    id: 'spore_rat',
    level: 1,
    hp: 15,
    damage: 3,
    armor: 0,
    accuracy: 5,
    evasion: 8,
    phaseCount: 1,
    phases: [{ index: 1 }],
    prototype: true,
    rank: 'basic',
  },
  {
    id: 'bandit',
    level: 3,
    hp: 25,
    damage: 6,
    armor: 2,
    accuracy: 8,
    evasion: 7,
    phaseCount: 1,
    phases: [{ index: 1 }],
    prototype: true,
    rank: 'basic',
  },
  {
    id: 'cyborg_dog',
    level: 12,
    hp: 50,
    damage: 10,
    armor: 5,
    accuracy: 9,
    evasion: 9,
    phaseCount: 1,
    phases: [{ index: 1 }],
    prototype: true,
    rank: 'basic',
  },
  {
    id: 'scout_drone',
    level: 18,
    hp: 25,
    damage: 6,
    armor: 2,
    accuracy: 11,
    evasion: 15,
    phaseCount: 1,
    phases: [{ index: 1 }],
    prototype: true,
    rank: 'basic',
  },
  {
    id: 'keeper_patrol',
    level: 12,
    hp: 80,
    damage: 14,
    armor: 8,
    accuracy: 10,
    evasion: 6,
    phaseCount: 1,
    phases: [{ index: 1 }],
    prototype: true,
    rank: 'basic',
  },
];

export function eliteById(id: string): EliteModifier | undefined {
  return ELITE_MODIFIERS.find((modifier) => modifier.id === id);
}

export function spawnMonster(input: {
  entityId: string;
  template: MonsterTemplate;
  cell: Cell;
  eliteId?: string | null;
}): SpawnedMonster {
  const elite = input.eliteId ? eliteById(input.eliteId) : undefined;
  const hp = Math.max(1, Math.floor(input.template.hp * (elite?.hpMultiplier ?? 1)));
  const evasion = Math.floor(input.template.evasion * (elite?.evasionMultiplier ?? 1));
  return {
    id: input.entityId,
    monsterId: input.template.id,
    level: input.template.level,
    hp,
    maxHp: hp,
    damage: input.template.damage * (elite?.damageMultiplier ?? 1),
    armor: input.template.armor + (elite?.armorBonus ?? 0),
    accuracyStat: input.template.accuracy,
    accuracyScore: input.template.accuracy,
    evasion,
    reaction: 8,
    cell: { x: input.cell.x, y: input.cell.y },
    eliteId: elite?.id ?? null,
    speedMultiplier: elite?.speedMultiplier ?? 1,
    phaseCount: input.template.phaseCount,
    bossPhase: 1,
    phases: input.template.phases,
    prototype: input.template.prototype,
    rank: input.template.rank,
  };
}

/** Highest phase whose `hpBelow` the creature has crossed. Phase 1 is the default. */
export function resolveBossPhase(
  hp: number,
  maxHp: number,
  phases: readonly BossPhase[],
): { phase: number; damageMultiplier: number } {
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  let phase = 1;
  let damageMultiplier = 1;
  for (const entry of phases) {
    if (entry.hpBelow === undefined || ratio < entry.hpBelow) {
      if (entry.hpBelow === undefined && entry.index === 1) {
        phase = 1;
        damageMultiplier = entry.damageMultiplier ?? 1;
        continue;
      }
      if (entry.hpBelow !== undefined && ratio < entry.hpBelow && entry.index >= phase) {
        phase = entry.index;
        damageMultiplier = entry.damageMultiplier ?? damageMultiplier;
      }
    }
  }
  return { phase, damageMultiplier };
}

export function rolledLoot(input: {
  entries: readonly LootEntry[];
  rng: Rng;
  elite: boolean;
  monsterLevel: number;
  lootMultiplier?: number;
}): LootStack[] {
  const bonus = input.lootMultiplier ?? 1;
  const entries = input.entries.map((entry) => ({
    ...entry,
    chance: Math.min(1, entry.chance * bonus),
  }));
  return rollLoot({
    entries,
    rng: input.rng,
    eliteQuantityMultiplier: input.elite ? 2 : 1,
    monsterLevel: input.monsterLevel,
  });
}
