import { emptyPoints, type StatBlock } from '@rift/domain/stats';
import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import { createInventoryModule, STARTER_GOLD, type ItemCatalog } from './index';
import { MemoryInventoryRepository } from './repository';
import type { InventoryState } from './types';

const stats: StatBlock = {
  ...emptyPoints(),
  body: 5,
  reaction: 5,
  accuracy: 5,
  will: 5,
  perception: 5,
  technique: 5,
};

test('starter loadout is four stacks and overload uses the weight sum', async () => {
  const catalog: ItemCatalog = {
    items: [
      { id: 'rusty_sword', weightKg: 20, slot: 'main_hand' },
      { id: 'leather_jacket', weightKg: 10, slot: 'torso' },
      { id: 'bandage', weightKg: 10 },
      { id: 'ammo_light', weightKg: 0.5 },
    ],
  };
  const repository = new MemoryInventoryRepository();
  const inventory = createInventoryModule({ repository, catalog });
  inventory.start({ bus: createBus(), now: () => manualClock(0).now() });
  await repository.save(empty('c-weight'));
  await inventory.service.grantStarter('c-weight');

  const listed = await inventory.service.list('c-weight');
  expect(listed.gold).toBe(STARTER_GOLD);
  expect(listed.items.map((item) => item.itemId)).toEqual([
    'rusty_sword',
    'leather_jacket',
    'bandage',
    'ammo_light',
  ]);
  const state = await repository.load('c-weight');
  expect(state).not.toBeNull();
  if (state === null) {
    return;
  }
  expect(state.stacks.map((stack) => stack.qty)).toEqual([1, 1, 3, 20]);
  expect(state.totalWeightKg).toBe(70);
  expect(state.overloadPenalty).toBe(3);
  expect(inventory.name).toBe('inventory');
});

test('equipping a sword fills main_hand and a second weapon is slot_blocked', async () => {
  const catalog: ItemCatalog = {
    items: [
      { id: 'rusty_sword', weightKg: 3, slot: 'main_hand' },
      { id: 'leather_jacket', weightKg: 3, slot: 'torso' },
      { id: 'iron_sword', weightKg: 4, slot: 'main_hand' },
      { id: 'bandage', weightKg: 0.1 },
      { id: 'greatsword', weightKg: 6, slot: 'main_hand', twoHanded: true },
      { id: 'dagger', weightKg: 1, slot: 'off_hand' },
    ],
  };
  const repository = new MemoryInventoryRepository();
  const inventory = createInventoryModule({ repository, catalog });
  const state = empty('c-gear');
  state.stacks = [
    bare(0, 'rusty_sword'),
    bare(1, 'leather_jacket'),
    bare(2, 'iron_sword'),
    bare(3, 'bandage'),
  ];
  await repository.save(state);

  const sword = await inventory.service.equip('c-gear', 'rusty_sword');
  const jacket = await inventory.service.equip('c-gear', 'leather_jacket');
  const blocked = await inventory.service.equip('c-gear', 'iron_sword');
  const bandage = await inventory.service.equip('c-gear', 'bandage');
  expect(sword.ok).toBe(true);
  expect(jacket.ok).toBe(true);
  expect(blocked.ok).toBe(false);
  if (!blocked.ok) {
    expect(blocked.code).toBe('slot_blocked');
  }
  expect(bandage.ok).toBe(false);
  if (!bandage.ok) {
    expect(bandage.code).toBe('not_equippable');
  }

  const listed = await inventory.service.list('c-gear');
  expect(listed.items).toEqual([
    { itemId: 'rusty_sword', equipped: true },
    { itemId: 'leather_jacket', equipped: true },
    { itemId: 'iron_sword', equipped: false },
    { itemId: 'bandage', equipped: false },
  ]);

  const broken = empty('c-broken');
  broken.stacks = [{ ...bare(0, 'rusty_sword'), durability: 0 }];
  await repository.save(broken);
  const destroyed = await inventory.service.equip('c-broken', 'rusty_sword');
  expect(destroyed.ok).toBe(false);
  if (!destroyed.ok) {
    expect(destroyed.code).toBe('destroyed');
  }

  const hands = empty('c-hands');
  hands.stacks = [bare(0, 'greatsword'), bare(1, 'dagger')];
  await repository.save(hands);
  const twoHand = await inventory.service.equip('c-hands', 'greatsword');
  const offhand = await inventory.service.equip('c-hands', 'dagger');
  expect(twoHand.ok).toBe(true);
  expect(offhand.ok).toBe(false);
  if (!offhand.ok) {
    expect(offhand.code).toBe('slot_blocked');
  }
  const held = await repository.load('c-hands');
  expect(held?.stacks[0]?.equipSlots).toEqual(['main_hand', 'off_hand']);

  const blockedHands = empty('c-offhand');
  blockedHands.stacks = [bare(0, 'dagger'), bare(1, 'greatsword')];
  await repository.save(blockedHands);
  const dagger = await inventory.service.equip('c-offhand', 'dagger');
  const greatsword = await inventory.service.equip('c-offhand', 'greatsword');
  expect(dagger.ok).toBe(true);
  expect(greatsword.ok).toBe(false);
  if (!greatsword.ok) {
    expect(greatsword.code).toBe('offhand_blocked');
  }

  const missing = await inventory.service.equip('nobody', 'rusty_sword');
  expect(missing.ok).toBe(false);
  if (!missing.ok) {
    expect(missing.code).toBe('missing');
  }
});

function empty(characterId: string): InventoryState {
  return {
    characterId,
    gold: 0,
    stacks: [],
    character: { stats, level: 1 },
    totalWeightKg: 0,
    overloadPenalty: 0,
  };
}

function bare(slot: number, itemId: string) {
  return {
    slot,
    itemId,
    qty: 1,
    durability: 100,
    equipped: false,
    equipSlots: [],
  };
}
