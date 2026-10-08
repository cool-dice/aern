import type { SimEntity } from './tick';
import {
  KEEPER_FULL,
  PROTOTYPE_MONSTERS,
  spawnMonster,
  type SpawnedMonster,
} from './bestiary';

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
  return [player, ...monsters];
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
