import { expect, test } from 'vitest';
import { limbMax, resolveAttack, type AttackInput, type Combatant, type LimbId } from './combat';
import {
  CORPSE_MS,
  LOGOUT_GRACE_MS,
  REVIVE_HP_RATIO,
  fallDown,
  respawnAtBind,
  revive,
  takeFromCorpse,
  type LifeState,
  type LootStack,
} from './death';

const BIND = 'fort_humans';
const OWNER = 'quest-owner';
const STRANGER = 'stranger';

function stack(partial: Partial<LootStack> & Pick<LootStack, 'itemId'>): LootStack {
  return {
    itemId: partial.itemId,
    questItem: partial.questItem ?? false,
    ...(partial.questOwnerId !== undefined ? { questOwnerId: partial.questOwnerId } : {}),
    durability: partial.durability ?? 100,
    equipped: partial.equipped ?? false,
  };
}

function life(partial: Partial<LifeState> = {}): LifeState {
  return {
    phase: partial.phase ?? 'online',
    hp: partial.hp ?? 0,
    bindNodeId: partial.bindNodeId ?? BIND,
    inventory: partial.inventory ?? [],
  };
}

function limbsAt(maxHp: number): Record<LimbId, number> {
  return {
    head: limbMax(maxHp, 'head'),
    torso: limbMax(maxHp, 'torso'),
    arm_left: limbMax(maxHp, 'arm_left'),
    arm_right: limbMax(maxHp, 'arm_right'),
    leg_left: limbMax(maxHp, 'leg_left'),
    leg_right: limbMax(maxHp, 'leg_right'),
  };
}

test('corpse and logout constants', () => {
  expect(CORPSE_MS).toBe(7_200_000);
  expect(LOGOUT_GRACE_MS).toBe(600_000);
  expect(REVIVE_HP_RATIO).toBe(0.3);
});

test('falling moves both items, wears only the equipped stack, and empties the victim', () => {
  const worn = stack({ itemId: 'rusty_sword', durability: 100, equipped: true });
  const bag = stack({ itemId: 'herb', durability: 40, equipped: false });
  const before = life({ hp: 0, inventory: [worn, bag] });
  const snapshot = structuredClone(before);

  const fallen = fallDown({
    victimId: 'hero',
    life: before,
    nowMs: 1_000,
    maxHp: 100,
  });

  expect(before).toEqual(snapshot);
  expect(fallen.life).toEqual({
    phase: 'downed',
    hp: 0,
    bindNodeId: BIND,
    inventory: [],
  });
  expect(fallen.corpse).toEqual({
    victimId: 'hero',
    createdAtMs: 1_000,
    looted: false,
    bindNodeId: BIND,
    stacks: [
      stack({ itemId: 'rusty_sword', durability: 90, equipped: true }),
      stack({ itemId: 'herb', durability: 40, equipped: false }),
    ],
  });
  expect(fallen.corpse.stacks[0]).not.toBe(worn);
  expect(worn.durability).toBe(100);
});

test('equipped durability 5 becomes 0 and the stack stays on the corpse', () => {
  const worn = stack({ itemId: 'rusty_sword', durability: 5, equipped: true });
  const fallen = fallDown({
    victimId: 'hero',
    life: life({ hp: -3, inventory: [worn] }),
    nowMs: 0,
    maxHp: 100,
  });

  expect(fallen.life.phase).toBe('downed');
  expect(fallen.life.hp).toBe(-3);
  expect(fallen.corpse.stacks).toEqual([
    stack({ itemId: 'rusty_sword', durability: 0, equipped: true }),
  ]);
});

test('positive hp is a caller bug and does not change the life', () => {
  const before = life({ hp: 1, inventory: [stack({ itemId: 'herb', durability: 40 })] });
  const snapshot = structuredClone(before);
  expect(() => fallDown({ victimId: 'hero', life: before, nowMs: 0, maxHp: 100 })).toThrow(
    RangeError,
  );
  expect(before).toEqual(snapshot);
});

test('a stranger cannot take a quest item; the owner can, and that does not mark looted', () => {
  const quest = stack({
    itemId: 'quest_token',
    questItem: true,
    questOwnerId: OWNER,
    durability: 100,
    equipped: false,
  });
  const fallen = fallDown({
    victimId: 'hero',
    life: life({ inventory: [quest, stack({ itemId: 'herb', durability: 40 })] }),
    nowMs: 50,
    maxHp: 80,
  });
  const corpse = fallen.corpse;
  const snapshot = structuredClone(corpse);

  const denied = takeFromCorpse(corpse, 'quest_token', STRANGER, 50);
  expect(denied).toEqual({ ok: false, code: 'quest' });
  expect(corpse).toEqual(snapshot);

  const taken = takeFromCorpse(corpse, 'quest_token', OWNER, 50);
  expect(taken.ok).toBe(true);
  if (!taken.ok) {
    return;
  }
  expect(taken.value.stack).toEqual(quest);
  expect(taken.value.corpse.looted).toBe(false);
  expect(taken.value.corpse.stacks.map((entry) => entry.itemId)).toEqual(['herb']);
  expect(corpse).toEqual(snapshot);
});

test('the first non-quest item marks the corpse looted', () => {
  const fallen = fallDown({
    victimId: 'hero',
    life: life({
      inventory: [
        stack({ itemId: 'rusty_sword', durability: 100, equipped: true }),
        stack({ itemId: 'herb', durability: 40 }),
      ],
    }),
    nowMs: 0,
    maxHp: 100,
  });

  const first = takeFromCorpse(fallen.corpse, 'herb', STRANGER, 0);
  expect(first.ok).toBe(true);
  if (!first.ok) {
    return;
  }
  expect(first.value.corpse.looted).toBe(true);
  expect(first.value.stack.durability).toBe(40);

  const second = takeFromCorpse(first.value.corpse, 'rusty_sword', STRANGER, 0);
  expect(second.ok).toBe(true);
  if (!second.ok) {
    return;
  }
  expect(second.value.corpse.looted).toBe(true);
  expect(second.value.stack.durability).toBe(90);
  expect(second.value.corpse.stacks).toEqual([]);
});

test('a missing item is rejected and does not mark the corpse looted', () => {
  const fallen = fallDown({
    victimId: 'hero',
    life: life({ inventory: [stack({ itemId: 'herb', durability: 40 })] }),
    nowMs: 0,
    maxHp: 100,
  });
  expect(takeFromCorpse(fallen.corpse, 'missing_item', STRANGER, 0)).toEqual({
    ok: false,
    code: 'missing',
  });
  expect(fallen.corpse.looted).toBe(false);
});

test('revive before any loot returns both items and 30 percent hp, minimum 1', () => {
  const before = life({
    hp: 0,
    inventory: [
      stack({ itemId: 'rusty_sword', durability: 100, equipped: true }),
      stack({ itemId: 'herb', durability: 40 }),
    ],
  });
  const fallen = fallDown({ victimId: 'hero', life: before, nowMs: 10, maxHp: 100 });
  const snapshot = structuredClone(fallen.corpse);

  const full = revive(fallen.corpse, 100, 10);
  expect(full.ok).toBe(true);
  if (!full.ok) {
    return;
  }
  expect(full.value.life.phase).toBe('online');
  expect(full.value.life.hp).toBe(30);
  expect(full.value.life.bindNodeId).toBe(BIND);
  expect(full.value.life.inventory).toEqual([
    stack({ itemId: 'rusty_sword', durability: 90, equipped: true }),
    stack({ itemId: 'herb', durability: 40 }),
  ]);
  expect(full.value.inventory).toEqual(full.value.life.inventory);
  expect(full.value.inventory[0]).not.toBe(fallen.corpse.stacks[0]);
  expect(fallen.corpse).toEqual(snapshot);

  const small = revive(fallen.corpse, 10, 10);
  expect(small.ok).toBe(true);
  if (!small.ok) {
    return;
  }
  expect(small.value.life.hp).toBe(3);

  const tiny = revive(fallen.corpse, 1, 10);
  expect(tiny.ok).toBe(true);
  if (!tiny.ok) {
    return;
  }
  expect(tiny.value.life.hp).toBe(1);
});

test('revive after a non-quest item was taken restores only what remains', () => {
  const fallen = fallDown({
    victimId: 'hero',
    life: life({
      inventory: [
        stack({ itemId: 'rusty_sword', durability: 100, equipped: true }),
        stack({
          itemId: 'quest_token',
          questItem: true,
          questOwnerId: OWNER,
          durability: 80,
        }),
      ],
    }),
    nowMs: 0,
    maxHp: 100,
  });
  const looted = takeFromCorpse(fallen.corpse, 'rusty_sword', STRANGER, 0);
  expect(looted.ok).toBe(true);
  if (!looted.ok) {
    return;
  }

  const raised = revive(looted.value.corpse, 100, 0);
  expect(raised.ok).toBe(true);
  if (!raised.ok) {
    return;
  }
  expect(raised.value.life.hp).toBe(30);
  expect(raised.value.life.phase).toBe('online');
  expect(raised.value.inventory).toEqual([
    stack({
      itemId: 'quest_token',
      questItem: true,
      questOwnerId: OWNER,
      durability: 80,
    }),
  ]);
});

test('at CORPSE_MS the corpse can neither be looted nor revived', () => {
  const fallen = fallDown({
    victimId: 'hero',
    life: life({
      hp: 0,
      inventory: [stack({ itemId: 'herb', durability: 40 }), stack({ itemId: 'rusty_sword' })],
    }),
    nowMs: 5_000,
    maxHp: 100,
  });
  const openAt = fallen.corpse.createdAtMs + CORPSE_MS - 1;
  const closedAt = fallen.corpse.createdAtMs + CORPSE_MS;
  const snapshot = structuredClone(fallen.corpse);

  const stillOpen = takeFromCorpse(fallen.corpse, 'herb', STRANGER, openAt);
  expect(stillOpen.ok).toBe(true);

  const stillRaised = revive(fallen.corpse, 100, openAt);
  expect(stillRaised.ok).toBe(true);
  if (!stillRaised.ok) {
    return;
  }
  expect(stillRaised.value.life.hp).toBe(30);

  expect(takeFromCorpse(fallen.corpse, 'herb', STRANGER, closedAt)).toEqual({
    ok: false,
    code: 'expired',
  });
  expect(revive(fallen.corpse, 100, closedAt)).toEqual({ ok: false, code: 'expired' });
  expect(fallen.corpse).toEqual(snapshot);

  const respawned = respawnAtBind(fallen.life, 100, 12);
  expect(respawned.life.phase).toBe('online');
  expect(respawned.life.hp).toBe(100);
  expect(respawned.od).toBe(12);
});

test('respawn clears inventory, restores full hp, and keeps the bind', () => {
  const before = life({
    phase: 'downed',
    hp: -4,
    inventory: [stack({ itemId: 'herb', durability: 40, equipped: true })],
  });
  const snapshot = structuredClone(before);
  const respawned = respawnAtBind(before, 80, 7);

  expect(before).toEqual(snapshot);
  expect(respawned).toEqual({
    life: {
      phase: 'online',
      hp: 80,
      bindNodeId: BIND,
      inventory: [],
    },
    od: 7,
  });
  expect(respawned.life.inventory).not.toBe(before.inventory);
});

test('resolveAttack leaves alive and downed unchanged; fallDown is the death decision', () => {
  const maxHp = 100;
  const attacker: Combatant = {
    id: 'attacker',
    reaction: 10,
    accuracyStat: 10,
    accuracyScore: 20,
    evasion: 0,
    armor: 0,
    od: 5,
    hp: maxHp,
    maxHp,
    limbs: limbsAt(maxHp),
    alive: true,
    downed: false,
    cover: false,
    stunned: false,
  };
  const target: Combatant = {
    id: 'victim',
    reaction: 10,
    accuracyStat: 0,
    accuracyScore: 0,
    evasion: 0,
    armor: 0,
    od: 0,
    hp: 5,
    maxHp,
    limbs: limbsAt(maxHp),
    alive: true,
    downed: false,
    cover: false,
    stunned: false,
  };
  const input: AttackInput = {
    attacker,
    target,
    weaponDamage: 40,
    odCost: 1,
    range: 10,
    distance: 5,
    los: true,
    aim: null,
    melee: false,
    friendlyFire: false,
    sameGroup: false,
    pvpOpen: false,
    safeZone: false,
    issuedAtMs: 0,
  };

  const hit = resolveAttack(input);
  expect(hit.ok).toBe(true);
  if (!hit.ok) {
    return;
  }
  expect(hit.value.target.hp).toBeLessThanOrEqual(0);
  expect(hit.value.target.alive).toBe(true);
  expect(hit.value.target.downed).toBe(false);
  expect(target.alive).toBe(true);
  expect(target.downed).toBe(false);
  expect(hit.value.reason).toBe('hit');

  const fallen = fallDown({
    victimId: target.id,
    life: life({
      hp: hit.value.target.hp,
      inventory: [stack({ itemId: 'rusty_sword', durability: 100, equipped: true })],
    }),
    nowMs: input.issuedAtMs,
    maxHp,
  });
  expect(fallen.life.phase).toBe('downed');
  expect(fallen.life.hp).toBe(hit.value.target.hp);
  expect(fallen.corpse.stacks[0]?.durability).toBe(90);
});
