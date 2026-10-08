import { applyWear, wearFor } from './items';
import { err, ok, type Result } from './result';

export const CORPSE_MS = 7_200_000;
export const LOGOUT_GRACE_MS = 600_000;
export const REVIVE_HP_RATIO = 0.3;
/** Artifact 17 §5.5. A war death does not respawn on the tick it happens. */
export const WAR_RESPAWN_DELAY_MS = 30_000;

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

/** True only after the 30-second war delay. The death tick itself is not ready. */
export function warRespawnReady(diedAtMs: number, nowMs: number): boolean {
  if (!Number.isInteger(diedAtMs) || !Number.isInteger(nowMs)) {
    throw new RangeError('war respawn times must be integer milliseconds');
  }
  return nowMs >= diedAtMs + WAR_RESPAWN_DELAY_MS;
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

export type WarRespawnRole = 'defender' | 'attacker' | 'civilian';

/** Defenders fall back to the city. Attackers fall back to the muster hub until the city is theirs. */
export function warRespawnRole(input: {
  guildId: string | null;
  attackerGuildIds: readonly string[];
  defenderGuildIds: readonly string[];
}): WarRespawnRole {
  if (input.guildId !== null && input.defenderGuildIds.includes(input.guildId)) {
    return 'defender';
  }
  if (input.guildId !== null && input.attackerGuildIds.includes(input.guildId)) {
    return 'attacker';
  }
  return 'civilian';
}

export function warRespawnNode(input: {
  role: WarRespawnRole;
  cityNodeId: string;
  musterNodeId: string;
  captured: boolean;
  bindNodeId: string;
}): { nodeId: string; moveBind: boolean } {
  if (input.role === 'defender') {
    return { nodeId: input.cityNodeId, moveBind: false };
  }
  if (input.role === 'attacker' && input.captured) {
    return { nodeId: input.cityNodeId, moveBind: true };
  }
  if (input.role === 'attacker') {
    return { nodeId: input.musterNodeId, moveBind: false };
  }
  return { nodeId: input.bindNodeId, moveBind: false };
}

/** `applyRespawn` calls this. The node comes from `warRespawnNode`. */
export function respawn(input: {
  life: LifeState;
  maxHp: number;
  odLimit: number;
  nodeId: string;
  moveBind: boolean;
}): { life: LifeState; od: number; nodeId: string } {
  const spawned = respawnAtBind(input.life, input.maxHp, input.odLimit);
  const bindNodeId = input.moveBind ? input.nodeId : spawned.life.bindNodeId;
  return {
    life: { ...spawned.life, bindNodeId },
    od: spawned.od,
    nodeId: input.nodeId,
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
