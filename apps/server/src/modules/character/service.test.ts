import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Appearance, RaceId } from '@rift/domain/character';
import { sideOf } from '@rift/domain/character';
import { STARTING_DURABILITY } from '@rift/domain/items';
import { emptyPoints, type StatBlock } from '@rift/domain/stats';
import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import { createCharacterModule, type CharacterRecord, type CharacterService } from './index';
import { MemoryCharacterRepository } from './repository';
import {
  STARTER_GOLD,
  createInventoryModule,
  type InventoryService,
  type ItemCatalog,
} from '../inventory/index';
import { MemoryInventoryRepository } from '../inventory/repository';

const appearance: Appearance = {
  skin: 'fair',
  hair: 'brown',
  eyes: 'green',
  horns: false,
  ears: 'round',
  tattoos: 'none',
  scars: 'none',
  heightCm: 180,
  build: 'average',
};

const catalog: ItemCatalog = {
  items: [
    { id: 'rusty_sword', weightKg: 3, slot: 'main_hand' },
    { id: 'leather_jacket', weightKg: 3, slot: 'torso' },
    { id: 'bandage', weightKg: 0.1 },
    { id: 'ammo_light', weightKg: 0.01 },
  ],
};

function fighterPoints(): StatBlock {
  return { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 };
}

function harness(playableRaces: readonly RaceId[] = ['human', 'demon']): {
  events: string[];
  characters: MemoryCharacterRepository;
  inventories: MemoryInventoryRepository;
  character: CharacterService;
  inventory: InventoryService;
} {
  const clock = manualClock(1_000);
  const bus = createBus();
  const events: string[] = [];
  bus.on('character.created', (payload) => {
    events.push(payload.characterId);
  });
  const characters = new MemoryCharacterRepository();
  const inventories = new MemoryInventoryRepository();
  const inventory = createInventoryModule({ repository: inventories, catalog });
  const character = createCharacterModule({
    repository: characters,
    granter: { grant: (characterId) => inventory.service.grantStarter(characterId) },
    features: { playableRaces },
    bus,
    now: () => 0,
  });
  inventory.start({ bus, now: () => clock.now() });
  character.start({ bus, now: () => clock.now() });
  return {
    events,
    characters,
    inventories,
    character: character.service,
    inventory: inventory.service,
  };
}

test('character and inventory modules do not import each other', () => {
  const characterDir = dirname(fileURLToPath(import.meta.url));
  const characterSource = sourceOf(characterDir);
  const inventorySource = sourceOf(join(characterDir, '../inventory'));
  expect(characterSource.includes('modules/inventory')).toBe(false);
  expect(characterSource.includes("from '../inventory")).toBe(false);
  expect(inventorySource.includes('modules/character')).toBe(false);
  expect(inventorySource.includes("from '../character")).toBe(false);
});

test('human fighter is created with the starter kit and one created event', async () => {
  const clock = manualClock(1_000);
  const early = createBus();
  const live = createBus();
  const earlyEvents: string[] = [];
  const liveEvents: string[] = [];
  early.on('character.created', (payload) => {
    earlyEvents.push(payload.characterId);
  });
  live.on('character.created', (payload) => {
    liveEvents.push(payload.characterId);
  });
  const characters = new MemoryCharacterRepository();
  const inventories = new MemoryInventoryRepository();
  const inventory = createInventoryModule({ repository: inventories, catalog });
  const character = createCharacterModule({
    repository: characters,
    granter: { grant: (characterId) => inventory.service.grantStarter(characterId) },
    features: { playableRaces: ['human', 'elf', 'demon'] },
    bus: early,
    now: () => 0,
  });
  inventory.start({ bus: live, now: () => clock.now() });
  character.start({ bus: live, now: () => clock.now() });
  clock.advance(25);

  const realNow = Date.now;
  Date.now = () => {
    throw new Error('Date.now must not be read');
  };
  let created: Awaited<ReturnType<CharacterService['create']>>;
  try {
    created = await character.service.create({
      accountId: 'acc-1',
      controller: 'player',
      name: 'Лиа',
      clean: false,
      points: fighterPoints(),
      appearance,
    });
  } finally {
    Date.now = realNow;
  }

  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  expect(liveEvents).toEqual([created.value.characterId]);
  expect(earlyEvents).toEqual([]);
  expect(character.name).toBe('character');

  const record = await characters.findById(created.value.characterId);
  expect(record).not.toBeNull();
  if (record === null) {
    return;
  }
  expect(storedSide(record)).toBe(false);
  expect(sideOf(record.controller)).toBe('light');
  expect(record.raceId).toBe('human');
  expect(record.accountId).toBe('acc-1');
  expect(record.bindNodeId).toBe('fort_humans');
  expect(record.phase).toBe('online');
  expect(record.createdAtMs).toBe(1_025);
  expect(record.level).toBe(1);
  expect(record.experience).toBe(0);
  expect(record.unspent).toBe(0);
  expect(record.points).toEqual(fighterPoints());
  expect(record.stats).toEqual({
    body: 16,
    reaction: 11,
    accuracy: 11,
    will: 6,
    perception: 6,
    technique: 6,
  });
  expect(record.hp).toBe(165);
  expect(record.od).toBe(6);
  expect(record.languages).toEqual({ common_light: 100, common_dark: 0, ancient: 0 });

  const listed = await inventory.service.list(record.id);
  expect(listed.gold).toBe(100);
  expect(listed.gold).toBe(STARTER_GOLD);
  expect(listed.items).toEqual([
    { itemId: 'rusty_sword', equipped: false },
    { itemId: 'leather_jacket', equipped: false },
    { itemId: 'bandage', equipped: false },
    { itemId: 'ammo_light', equipped: false },
  ]);
  const bags = await inventories.load(record.id);
  expect(bags).not.toBeNull();
  if (bags === null) {
    return;
  }
  expect(bags.stacks).toEqual([
    stack(0, 'rusty_sword', 1),
    stack(1, 'leather_jacket', 1),
    stack(2, 'bandage', 3),
    stack(3, 'ammo_light', 20),
  ]);
});

test('bot is a demon at the dark bind and a player stays human', async () => {
  const { character, characters, events } = harness();
  const bot = await character.create({
    accountId: 'acc-bot',
    controller: 'bot',
    name: 'Хвост',
    clean: false,
    points: fighterPoints(),
    appearance,
  });
  expect(bot.ok).toBe(true);
  if (!bot.ok) {
    return;
  }
  const record = await characters.findById(bot.value.characterId);
  expect(record).not.toBeNull();
  if (record === null) {
    return;
  }
  expect(record.raceId).toBe('demon');
  expect(record.controller).toBe('bot');
  expect(record.bindNodeId).toBe('obsidian_tower');
  expect(storedSide(record)).toBe(false);
  expect(sideOf(record.controller)).toBe('dark');
  expect(record.languages).toEqual({ common_light: 0, common_dark: 100, ancient: 0 });
  expect(events).toEqual([bot.value.characterId]);
});

test('race outside playableRaces is rejected and domain name errors pass through', async () => {
  const blocked = harness(['human']);
  const bot = await blocked.character.create({
    accountId: 'acc-bot',
    controller: 'bot',
    name: 'Хвост',
    clean: false,
    points: fighterPoints(),
    appearance,
  });
  expect(bot.ok).toBe(false);
  if (!bot.ok) {
    expect(bot.code).toBe('race');
  }
  expect(blocked.events).toEqual([]);
  expect(await blocked.inventories.load('missing')).toBeNull();

  const { character, characters, events } = harness();
  const renamed = await character.create({
    accountId: 'acc-1',
    controller: 'player',
    name: 'Ab',
    clean: false,
    points: fighterPoints(),
    appearance,
  });
  expect(renamed.ok).toBe(false);
  if (!renamed.ok) {
    expect(renamed.code).toBe('name');
  }
  const short = { ...fighterPoints(), technique: -1 };
  const points = await character.create({
    accountId: 'acc-1',
    controller: 'player',
    name: 'Лиа',
    clean: false,
    points: short,
    appearance,
  });
  expect(points.ok).toBe(false);
  if (!points.ok) {
    expect(points.code).toBe('points_total');
  }
  expect(events).toEqual([]);
  expect(await characters.findByName('Лиа')).toBeNull();
});

test('duplicate name is name_taken and does not emit again', async () => {
  const { character, events, inventory } = harness();
  const first = await character.create({
    accountId: 'acc-1',
    controller: 'player',
    name: 'Лиа',
    clean: false,
    points: fighterPoints(),
    appearance,
  });
  const second = await character.create({
    accountId: 'acc-2',
    controller: 'player',
    name: 'Лиа',
    clean: false,
    points: fighterPoints(),
    appearance,
  });
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(false);
  if (!second.ok) {
    expect(second.code).toBe('name_taken');
  }
  expect(events).toHaveLength(1);
  if (first.ok) {
    const listed = await inventory.list(first.value.characterId);
    expect(listed.gold).toBe(STARTER_GOLD);
  }
});

test('the 11th point in a stat is refused and the unspent point stays', async () => {
  const { character, characters } = harness();
  const created = await character.create({
    accountId: 'acc-1',
    controller: 'player',
    name: 'Лиа',
    clean: false,
    points: fighterPoints(),
    appearance,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  await character.grantXp(created.value.characterId, 100);
  const leveled = await characters.findById(created.value.characterId);
  expect(leveled).not.toBeNull();
  if (leveled === null) {
    return;
  }
  expect(leveled.level).toBe(2);
  expect(leveled.experience).toBe(0);
  expect(leveled.unspent).toBe(1);
  expect(leveled.hp).toBe(170);

  const refused = await character.spend(created.value.characterId, 'body');
  expect(refused.ok).toBe(false);
  if (!refused.ok) {
    expect(refused.code).toBe('stat_cap');
  }
  const afterRefuse = await characters.findById(created.value.characterId);
  expect(afterRefuse).not.toBeNull();
  if (afterRefuse === null) {
    return;
  }
  expect(afterRefuse.unspent).toBe(1);
  expect(afterRefuse.points.body).toBe(10);
  expect(afterRefuse.stats.body).toBe(16);

  const spent = await character.spend(created.value.characterId, 'reaction');
  expect(spent.ok).toBe(true);
  const afterSpend = await characters.findById(created.value.characterId);
  expect(afterSpend).not.toBeNull();
  if (afterSpend === null) {
    return;
  }
  expect(afterSpend.unspent).toBe(0);
  expect(afterSpend.points.reaction).toBe(6);
  expect(afterSpend.stats.reaction).toBe(12);
  expect(afterSpend.od).toBe(6);
});

function stack(slot: number, itemId: string, qty: number) {
  return {
    slot,
    itemId,
    qty,
    durability: STARTING_DURABILITY,
    equipped: false,
    equipSlots: [],
  };
}

function storedSide(record: CharacterRecord): boolean {
  return Object.prototype.hasOwnProperty.call(record, 'side');
}

function sourceOf(dir: string): string {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n');
}
