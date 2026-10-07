import { applyWear, wearFor } from './items';
import { err, ok, type Result } from './result';

export const CORPSE_MS = 7_200_000;
export const LOGOUT_GRACE_MS = 600_000;
export const REVIVE_HP_RATIO = 0.3;

export interface LootStack {
  itemId: string;
  questItem: boolean;
  questOwnerId?: string;
  durability: number;
  equipped: boolean;
}

export interface Corpse {
  victimId: string;
  createdAtMs: number;
  stacks: LootStack[];
  looted: boolean;
  /** Preserved so revive can rebuild LifeState from the corpse alone. */
  bindNodeId: string;
}

export interface LifeState {
  phase: 'online' | 'downed' | 'dead';
  hp: number;
  bindNodeId: string;
  inventory: LootStack[];
}

/**
 * `victimId` is not on LifeState. `maxHp` is part of the call shape; the
 * downed body keeps the hp the caller passed, including values below 0.
 */
export function fallDown(input: {
  victimId: string;
  life: LifeState;
  nowMs: number;
  maxHp: number;
}): { life: LifeState; corpse: Corpse } {
  if (input.life.hp > 0) {
    throw new RangeError(`fallDown requires hp <= 0, got ${String(input.life.hp)}`);
  }

  return {
    life: {
      phase: 'downed',
      hp: input.life.hp,
      bindNodeId: input.life.bindNodeId,
      inventory: [],
    },
    corpse: {
      victimId: input.victimId,
      createdAtMs: input.nowMs,
      stacks: input.life.inventory.map(toCorpseStack),
      looted: false,
      bindNodeId: input.life.bindNodeId,
    },
  };
}

export function takeFromCorpse(
  corpse: Corpse,
  itemId: string,
  looterId: string,
  nowMs: number,
): Result<{ corpse: Corpse; stack: LootStack }, 'missing' | 'quest' | 'expired'> {
  if (isExpired(corpse.createdAtMs, nowMs)) {
    return err('expired');
  }

  const index = corpse.stacks.findIndex((stack) => stack.itemId === itemId);
  const found = index >= 0 ? corpse.stacks[index] : undefined;
  if (found === undefined) {
    return err('missing');
  }
  if (found.questItem && found.questOwnerId !== looterId) {
    return err('quest');
  }

  const stack = copyStack(found);
  const stacks = corpse.stacks.flatMap((entry, entryIndex) =>
    entryIndex === index ? [] : [copyStack(entry)],
  );
  return ok({
    corpse: {
      victimId: corpse.victimId,
      createdAtMs: corpse.createdAtMs,
      stacks,
      looted: corpse.looted || !stack.questItem,
      bindNodeId: corpse.bindNodeId,
    },
    stack,
  });
}

export function revive(
  corpse: Corpse,
  maxHp: number,
  nowMs: number,
): Result<{ life: LifeState; inventory: LootStack[] }, 'expired'> {
  if (isExpired(corpse.createdAtMs, nowMs)) {
    return err('expired');
  }

  const inventory = corpse.stacks.map(copyStack);
  return ok({
    life: {
      phase: 'online',
      hp: Math.max(1, Math.floor(maxHp * REVIVE_HP_RATIO)),
      bindNodeId: corpse.bindNodeId,
      inventory,
    },
    inventory,
  });
}

export function respawnAtBind(
  life: LifeState,
  maxHp: number,
  odLimit: number,
): { life: LifeState; od: number } {
  return {
    life: {
      phase: 'online',
      hp: maxHp,
      bindNodeId: life.bindNodeId,
      inventory: [],
    },
    od: odLimit,
  };
}

function toCorpseStack(stack: LootStack): LootStack {
  const copy = copyStack(stack);
  if (!copy.equipped) {
    return copy;
  }
  return {
    ...copy,
    durability: applyWear(copy.durability, wearFor('death')),
  };
}

function copyStack(stack: LootStack): LootStack {
  return {
    itemId: stack.itemId,
    questItem: stack.questItem,
    ...(stack.questOwnerId !== undefined ? { questOwnerId: stack.questOwnerId } : {}),
    durability: stack.durability,
    equipped: stack.equipped,
  };
}

function isExpired(createdAtMs: number, nowMs: number): boolean {
  return nowMs >= createdAtMs + CORPSE_MS;
}
