import { emptyPoints } from '@rift/domain/stats';
import type { SimEntity } from './tick';
import {
  ELITE_MODIFIERS,
  KEEPER_FULL,
  KEEPER_PROTOTYPE,
  PROTOTYPE_MONSTERS,
  spawnMonster,
  type MonsterTemplate,
  type SpawnedMonster,
} from './bestiary';

const ELITE_CYCLE = ['spore', 'fiery', 'armored', 'fast', 'poisonous'] as const;

const CELLS = [
  { x: 3, y: 0 },
  { x: 0, y: 3 },
  { x: -3, y: 1 },
  { x: 2, y: -3 },
  { x: -2, y: -2 },
] as const;

export function prototypeEncounter(input: { playerId: string; bindNodeId: string }): SimEntity[] {
  const player = playerEntity(input.playerId, input.bindNodeId);
  const monsters = PROTOTYPE_MONSTERS.map((template, index) => {
    const cell = CELLS[index] ?? { x: index + 1, y: 1 };
    return toEntity(
      spawnMonster({
        entityId: `${input.playerId}:${template.id}`,
        template,
        cell,
      }),
    );
  });
  const elites = PROTOTYPE_MONSTERS.map((template, index) =>
    toEntity(
      spawnMonster({
        entityId: `${input.playerId}:${template.id}:elite`,
        template,
        cell: { x: 6, y: index - 2 },
        eliteId: ELITE_CYCLE[index] ?? ELITE_MODIFIERS[0]?.id ?? 'spore',
      }),
    ),
  );
  const keeper = toEntity(
    spawnMonster({
      entityId: `${input.playerId}:${KEEPER_PROTOTYPE.id}`,
      template: KEEPER_PROTOTYPE,
      cell: { x: 4, y: 4 },
      eliteId: 'energetic',
    }),
  );
  return [player, ...monsters, keeper, ...elites];
}

/** Level-50 three-phase keeper. The prototype meeting does not place this id. */
export function spawnNamed(monsterId: string, entityId: string): SimEntity | null {
  const template = templateById(monsterId);
  if (template === undefined) {
    return null;
  }
  return toEntity(
    spawnMonster({
      entityId,
      template,
      cell: { x: 8, y: 0 },
    }),
  );
}

export function templateById(monsterId: string): MonsterTemplate | undefined {
  if (monsterId === KEEPER_FULL.id) {
    return KEEPER_FULL;
  }
  if (monsterId === KEEPER_PROTOTYPE.id) {
    return KEEPER_PROTOTYPE;
  }
  return PROTOTYPE_MONSTERS.find((template) => template.id === monsterId);
}

/** The level-50 keeper stays out of the prototype meeting. */
export function prototypeIncludesFullKeeper(): boolean {
  return PROTOTYPE_MONSTERS.some((template) => template.id === KEEPER_FULL.id);
}

function playerEntity(id: string, bindNodeId: string): SimEntity {
  return {
    id,
    reaction: 10,
    accuracyStat: 8,
    accuracyScore: 10,
    evasion: 6,
    armor: 1,
    will: 5,
    od: 0,
    odFrac: 0,
    hp: 40,
    maxHp: 40,
    cell: { x: 0, y: 0 },
    inCombat: false,
    stunned: false,
    statuses: [],
    phase: 'online',
    isBot: false,
    bindNodeId,
    progress: {
      level: 1,
      xp: 0,
      unspent: 0,
      points: emptyPoints(),
    },
    quests: [],
    nn: 0,
    nnLimit: 10,
  };
}

function toEntity(spawned: SpawnedMonster): SimEntity {
  return {
    id: spawned.id,
    reaction: spawned.reaction,
    accuracyStat: spawned.accuracyStat,
    accuracyScore: spawned.accuracyScore,
    evasion: spawned.evasion,
    armor: spawned.armor,
    will: 5,
    od: 0,
    odFrac: 0,
    hp: spawned.hp,
    maxHp: spawned.maxHp,
    cell: { x: spawned.cell.x, y: spawned.cell.y },
    inCombat: false,
    stunned: false,
    statuses: [],
    phase: 'online',
    isBot: false,
    monsterId: spawned.monsterId,
    level: spawned.level,
    baseDamage: spawned.damage,
    damage: spawned.damage,
    eliteId: spawned.eliteId,
    phaseCount: spawned.phaseCount,
    bossPhase: spawned.bossPhase,
    phases: spawned.phases,
    speedMultiplier: spawned.speedMultiplier,
    rank: spawned.rank,
  };
}
