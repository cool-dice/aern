import { BLOCK_OFFSETS, encodeObservation } from '@rift/domain/ai';

export interface ObserveActor {
  hp: number;
  maxHp: number;
  x: number;
  y: number;
}

export interface ObserveWorld {
  player: ObserveActor;
  monsters: readonly ObserveActor[];
}

function ratio(current: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return current / max;
}

/**
 * Builds the 896-length observation from the player and nearby monsters.
 * Actor slot 0 is the creature type, so a rat makes the actors block non-zero.
 */
export function observeEntity(world: ObserveWorld): number[] {
  const self = [ratio(world.player.hp, world.player.maxHp)];
  const actors: number[] = [];
  for (const monster of world.monsters.slice(0, 16)) {
    const distance = Math.max(Math.abs(monster.x - world.player.x), Math.abs(monster.y - world.player.y));
    const slot = new Array<number>(16).fill(0);
    slot[0] = 1;
    slot[1] = ratio(monster.hp, monster.maxHp);
    slot[2] = Math.min(1, distance / 8);
    slot[3] = 1;
    actors.push(...slot);
  }
  return encodeObservation({
    self,
    grid: [],
    actors,
    objects: [],
    events: [],
    quests: [],
    economy: [],
    guild: [],
    memory: [],
  });
}

export function actorsAreSilent(vector: readonly number[]): boolean {
  const start = BLOCK_OFFSETS.actors;
  for (let index = start; index < start + 16; index += 1) {
    if ((vector[index] ?? 0) !== 0) {
      return false;
    }
  }
  return true;
}
