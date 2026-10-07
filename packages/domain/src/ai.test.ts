import { expect, test } from 'vitest';
import {
  ACTION_IDS,
  ACTOR_FEATURE_ORDER,
  ACTOR_SLOT_LENGTH,
  ACTOR_SLOTS,
  BLOCK_LENGTHS,
  BLOCK_OFFSETS,
  CELL_FEATURE_ORDER,
  GRID_SIZE,
  MEMORY_CAP,
  OBJECT_SLOT_LENGTH,
  OBJECT_SLOTS,
  OBSERVATION_BLOCK_ORDER,
  OBSERVATION_LENGTH,
  WORKING_MEMORY,
  encodeActorFeatures,
  encodeObservation,
  utilityAction,
  type ObservationParts,
} from './ai';

const ACTION_ORDER = [
  'step_n',
  'step_ne',
  'step_e',
  'step_se',
  'step_s',
  'step_sw',
  'step_w',
  'step_nw',
  'run_n',
  'run_ne',
  'run_e',
  'run_se',
  'run_s',
  'run_sw',
  'run_w',
  'run_nw',
  'wait',
  'attack_melee',
  'attack_ranged',
  'aim',
  'ability_1',
  'ability_2',
  'ability_3',
  'dodge',
  'take',
  'drop',
  'use',
  'open',
  'hack',
  'talk',
  'swap_weapon',
  'swap_armor',
  'use_item',
  'discard',
  'station',
  'recipe',
  'craft_start',
  'craft_boost',
  'auction_open',
  'auction_list',
  'auction_buy',
  'auction_sell',
  'trade',
  'quest_accept',
  'quest_abandon',
  'quest_turnin',
  'guild_join',
  'guild_leave',
  'guild_create',
  'guild_invite',
  'guild_vote',
  'guild_war',
  'chat',
  'mail',
  'title',
  'bind',
  'portal',
  'rest',
  'sleep',
  'reload',
  'crawl',
  'party_invite',
  'loot_corpse',
  'scan',
] as const;

function emptyParts(): ObservationParts {
  return {
    self: [],
    grid: [],
    actors: [],
    objects: [],
    events: [],
    quests: [],
    economy: [],
    guild: [],
    memory: [],
  };
}

test('block lengths sum to 896 in the fixed feature order', () => {
  expect(OBSERVATION_BLOCK_ORDER).toEqual([
    'self',
    'grid',
    'actors',
    'objects',
    'events',
    'quests',
    'economy',
    'guild',
    'memory',
  ]);
  expect(BLOCK_LENGTHS).toEqual({
    self: 64,
    grid: 128,
    actors: 256,
    objects: 128,
    events: 64,
    quests: 64,
    economy: 32,
    guild: 32,
    memory: 128,
  });
  const sum = OBSERVATION_BLOCK_ORDER.reduce((total, block) => total + BLOCK_LENGTHS[block], 0);
  expect(sum).toBe(896);
  expect(OBSERVATION_LENGTH).toBe(896);
  expect(BLOCK_OFFSETS).toEqual({
    self: 0,
    grid: 64,
    actors: 192,
    objects: 448,
    events: 576,
    quests: 640,
    economy: 704,
    guild: 736,
    memory: 768,
  });
  expect(GRID_SIZE * GRID_SIZE * CELL_FEATURE_ORDER.length).toBe(BLOCK_LENGTHS.grid);
  expect(CELL_FEATURE_ORDER).toEqual(['type', 'occupancy']);
  expect(ACTOR_SLOTS * ACTOR_SLOT_LENGTH).toBe(BLOCK_LENGTHS.actors);
  expect(ACTOR_FEATURE_ORDER).toEqual(['type', 'hpRatio', 'distance', 'hostility']);
  expect(OBJECT_SLOTS * OBJECT_SLOT_LENGTH).toBe(BLOCK_LENGTHS.objects);
  expect(MEMORY_CAP).toBe(10_000);
  expect(WORKING_MEMORY).toBe(10);
});

test('empty arrays encode to a zero vector of length 896', () => {
  const vector = encodeObservation(emptyParts());
  expect(vector).toHaveLength(896);
  expect(vector.every((value) => value === 0)).toBe(true);
});

test('extra elements are dropped and values are clipped into [0, 1]', () => {
  const self = new Array<number>(BLOCK_LENGTHS.self + 1).fill(0);
  self[0] = 2;
  self[1] = -1;
  self[2] = Number.NaN;
  self[3] = Number.POSITIVE_INFINITY;
  self[4] = 0.25;
  self[BLOCK_LENGTHS.self] = 0.9;

  const vector = encodeObservation({
    ...emptyParts(),
    self,
    grid: [0.5],
  });

  expect(vector).toHaveLength(896);
  expect(vector[0]).toBe(1);
  expect(vector[1]).toBe(0);
  expect(vector[2]).toBe(0);
  expect(vector[3]).toBe(1);
  expect(vector[4]).toBe(0.25);
  expect(vector[BLOCK_OFFSETS.grid]).toBe(0.5);
  expect(vector[BLOCK_OFFSETS.grid - 1]).toBe(0);
  expect(self).toHaveLength(BLOCK_LENGTHS.self + 1);
});

test('a short block is padded with zeros and later blocks keep their offsets', () => {
  const vector = encodeObservation({
    ...emptyParts(),
    self: [0.5],
    memory: [1],
  });

  expect(vector[0]).toBe(0.5);
  expect(vector[1]).toBe(0);
  expect(vector[BLOCK_OFFSETS.memory]).toBe(1);
  expect(vector[BLOCK_OFFSETS.memory + 1]).toBe(0);
  expect(vector[OBSERVATION_LENGTH - 1]).toBe(0);
});

test('actor slot is type, hp ratio, distance/20 clipped to 1, hostility, then zeros', () => {
  const slot = encodeActorFeatures({
    type: 0.4,
    hp: 5,
    maxHp: 10,
    distance: 10,
    hostility: 0.5,
  });
  expect(slot).toHaveLength(16);
  expect(slot[0]).toBe(0.4);
  expect(slot[1]).toBe(0.5);
  expect(slot[2]).toBe(0.5);
  expect(slot[3]).toBe(0.5);
  expect(slot.slice(4)).toEqual(new Array<number>(12).fill(0));

  const far = encodeActorFeatures({
    type: 1,
    hp: 1,
    maxHp: 1,
    distance: 40,
    hostility: 1,
  });
  expect(far[2]).toBe(1);

  const packed = encodeObservation({
    ...emptyParts(),
    actors: [...slot, ...far, 2],
  });
  expect(packed[BLOCK_OFFSETS.actors]).toBe(0.4);
  expect(packed[BLOCK_OFFSETS.actors + 2]).toBe(0.5);
  expect(packed[BLOCK_OFFSETS.actors + ACTOR_SLOT_LENGTH]).toBe(1);
  expect(packed[BLOCK_OFFSETS.actors + ACTOR_SLOT_LENGTH * 2]).toBe(1);
  expect(packed[BLOCK_OFFSETS.actors + ACTOR_SLOT_LENGTH * 2 + 1]).toBe(0);
});

test('ACTION_IDS is 64 unique ids with stable anchors', () => {
  expect(ACTION_IDS).toEqual(ACTION_ORDER);
  expect(ACTION_IDS).toHaveLength(64);
  expect(new Set(ACTION_IDS).size).toBe(64);
  expect(ACTION_IDS[0]).toBe('step_n');
  expect(ACTION_IDS[16]).toBe('wait');
  expect(ACTION_IDS[ACTION_IDS.length - 1]).toBe('scan');
});

test('low hp with use_item legal chooses use_item', () => {
  const result = utilityAction({
    legal: ['step_n', 'use_item', 'attack_melee'],
    hp: 10,
    maxHp: 100,
    od: 1,
    nearestEnemy: 1,
    weaponRange: 4,
  });
  expect(result).toEqual({ ok: true, value: 'use_item' });
});

test('full hp and an adjacent enemy with od spends attack_melee', () => {
  const result = utilityAction({
    legal: ['step_n', 'attack_melee', 'attack_ranged'],
    hp: 100,
    maxHp: 100,
    od: 1,
    nearestEnemy: 1,
    weaponRange: 4,
  });
  expect(result).toEqual({ ok: true, value: 'attack_melee' });
});

test('enemy inside weapon range but not adjacent chooses attack_ranged', () => {
  const result = utilityAction({
    legal: ['step_n', 'attack_ranged'],
    hp: 100,
    maxHp: 100,
    od: 1,
    nearestEnemy: 4,
    weaponRange: 4,
  });
  expect(result).toEqual({ ok: true, value: 'attack_ranged' });
});

test('enemy beyond weapon range steps north when that id is legal', () => {
  const result = utilityAction({
    legal: ['attack_ranged', 'step_n', 'wait'],
    hp: 100,
    maxHp: 100,
    od: 1,
    nearestEnemy: 5,
    weaponRange: 4,
  });
  expect(result).toEqual({ ok: true, value: 'step_n' });
});

test('enemy beyond weapon range returns the first legal id when step_n is absent', () => {
  const result = utilityAction({
    legal: ['attack_ranged', 'wait'],
    hp: 100,
    maxHp: 100,
    od: 1,
    nearestEnemy: 5,
    weaponRange: 4,
  });
  expect(result).toEqual({ ok: true, value: 'attack_ranged' });
});

test('a preferred action that is not legal falls back to the first legal id', () => {
  const result = utilityAction({
    legal: ['step_e'],
    hp: 100,
    maxHp: 100,
    od: 1,
    nearestEnemy: 1,
    weaponRange: 4,
  });
  expect(result).toEqual({ ok: true, value: 'step_e' });
});

test('empty legal list is none', () => {
  const result = utilityAction({
    legal: [],
    hp: 10,
    maxHp: 100,
    od: 1,
    nearestEnemy: 1,
    weaponRange: 4,
  });
  expect(result).toEqual({ ok: false, code: 'none' });
});
