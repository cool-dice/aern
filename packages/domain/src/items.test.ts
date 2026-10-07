import { expect, test } from 'vitest';
import {
  AMMO_WEIGHT_KG,
  EQUIP_SLOTS,
  GRADES,
  GRADE_IDS,
  IMPLANT_SLOTS,
  SPECIAL_AMMO_WEIGHT_MAX_KG,
  SPECIAL_AMMO_WEIGHT_MIN_KG,
  STARTING_DURABILITY,
  WEAR_LOSS,
  applyWear,
  canEquip,
  effectiveBonuses,
  itemStatValue,
  specialAmmoWeightKg,
  speedMultiplier,
  wearFor,
  type GradeDef,
  type ItemBonus,
} from './items';

const GRADE_TABLE: Record<(typeof GRADE_IDS)[number], GradeDef> = {
  common: {
    id: 'common',
    statCount: 2,
    activeMin: 0,
    activeMax: 0,
    passiveMin: 0,
    passiveMax: 1,
    statMin: 1,
    statMax: 10,
    priceCoefficient: 1,
  },
  rare: {
    id: 'rare',
    statCount: 3,
    activeMin: 0,
    activeMax: 1,
    passiveMin: 1,
    passiveMax: 1,
    statMin: 2,
    statMax: 15,
    priceCoefficient: 3,
  },
  epic: {
    id: 'epic',
    statCount: 4,
    activeMin: 1,
    activeMax: 1,
    passiveMin: 1,
    passiveMax: 2,
    statMin: 3,
    statMax: 20,
    priceCoefficient: 10,
  },
  unique: {
    id: 'unique',
    statCount: 6,
    activeMin: 2,
    activeMax: 2,
    passiveMin: 2,
    passiveMax: 3,
    statMin: 5,
    statMax: 30,
    priceCoefficient: 30,
  },
};

test('grade constants match the table, including price coefficients', () => {
  expect(GRADE_IDS).toEqual(['common', 'rare', 'epic', 'unique']);
  expect(GRADES).toEqual(GRADE_TABLE);
  expect(GRADES.common.priceCoefficient).toBe(1);
  expect(GRADES.rare.priceCoefficient).toBe(3);
  expect(GRADES.epic.priceCoefficient).toBe(10);
  expect(GRADES.unique.priceCoefficient).toBe(30);
});

test('equip and implant slots keep the full lists', () => {
  expect(EQUIP_SLOTS).toEqual(['head', 'torso', 'hands', 'legs', 'main_hand', 'off_hand', 'core']);
  expect(IMPLANT_SLOTS).toEqual([
    'implant_head',
    'implant_torso',
    'implant_hands',
    'implant_legs',
  ]);
});

test('item stat endpoints and rare bounds', () => {
  expect(itemStatValue('common', 1)).toBe(1);
  expect(itemStatValue('common', 50)).toBe(10);
  expect(itemStatValue('unique', 1)).toBe(5);
  expect(itemStatValue('unique', 50)).toBe(30);
  expect(itemStatValue('rare', 1)).toBe(2);
  expect(itemStatValue('rare', 50)).toBe(15);
  expect(itemStatValue('epic', 1)).toBe(3);
  expect(itemStatValue('epic', 50)).toBe(20);
});

test('item level outside 1..50 throws RangeError', () => {
  expect(() => itemStatValue('common', 0)).toThrow(RangeError);
  expect(() => itemStatValue('common', 51)).toThrow(RangeError);
  expect(() => itemStatValue('rare', -1)).toThrow(RangeError);
});

test('wear losses and starting durability', () => {
  expect(STARTING_DURABILITY).toBe(100);
  expect(WEAR_LOSS).toEqual({ shot: 0.05, ability: 0.5, death: 10, hour: 0.1 });
  expect(wearFor('shot')).toBe(0.05);
  expect(wearFor('ability')).toBe(0.5);
  expect(wearFor('death')).toBe(10);
  expect(wearFor('hour')).toBe(0.1);
  expect(wearFor('hour', 2.5)).toBe(0.25);
  expect(wearFor('shot', 2.5)).toBe(0.05);
});

test('applyWear rounds to 0.01 and does not go below 0', () => {
  expect(applyWear(100, wearFor('shot'))).toBe(99.95);
  expect(applyWear(100, wearFor('death'))).toBe(90);
  expect(applyWear(100, wearFor('ability'))).toBe(99.5);
  expect(100 - 2000 * wearFor('shot')).toBe(0);
  expect(applyWear(100, 2000 * wearFor('shot'))).toBe(0);
  expect(applyWear(5, wearFor('death'))).toBe(0);

  let durability = STARTING_DURABILITY;
  for (let shot = 0; shot < 2000; shot += 1) {
    durability = applyWear(durability, wearFor('shot'));
  }
  expect(durability).toBe(0);
});

test('soft requirement floors each positive bonus', () => {
  const bonuses: ItemBonus[] = [
    { stat: 'body', amount: 5 },
    { stat: 'accuracy', amount: 1 },
    { stat: 'will', amount: 3 },
  ];
  expect(effectiveBonuses(bonuses, false)).toEqual([
    { stat: 'body', amount: 2 },
    { stat: 'accuracy', amount: 0 },
    { stat: 'will', amount: 1 },
  ]);
  expect(effectiveBonuses(bonuses, true)).toEqual(bonuses);
  expect(effectiveBonuses(bonuses, true)).not.toBe(bonuses);
  expect(() => effectiveBonuses([{ stat: 'body', amount: -1 }], false)).toThrow(RangeError);
});

test('speed multiplier is one flag, so two soft fails stay at 0.8', () => {
  expect(speedMultiplier(false)).toBe(1);
  const softFails = [false, true, true];
  const anySoftFail = softFails.some((failed) => failed);
  expect(anySoftFail).toBe(true);
  expect(speedMultiplier(anySoftFail)).toBe(0.8);
});

test('canEquip returns the occupied slots or a domain error', () => {
  const free = canEquip(STARTING_DURABILITY, {
    slot: 'torso',
    twoHanded: false,
    occupied: {},
  });
  expect(free).toEqual({ ok: true, value: ['torso'] });

  const twoHand = canEquip(80, {
    slot: 'main_hand',
    twoHanded: true,
    occupied: { off_hand: false },
  });
  expect(twoHand).toEqual({ ok: true, value: ['main_hand', 'off_hand'] });

  const blockedOff = canEquip(80, {
    slot: 'main_hand',
    twoHanded: true,
    occupied: { off_hand: true },
  });
  expect(blockedOff).toEqual({ ok: false, code: 'offhand_blocked' });

  const blockedMain = canEquip(80, {
    slot: 'main_hand',
    twoHanded: true,
    occupied: { main_hand: true, off_hand: true },
  });
  expect(blockedMain).toEqual({ ok: false, code: 'slot_blocked' });

  const blockedSlot = canEquip(40, {
    slot: 'head',
    twoHanded: false,
    occupied: { head: true },
  });
  expect(blockedSlot).toEqual({ ok: false, code: 'slot_blocked' });

  const destroyed = canEquip(0, {
    slot: 'main_hand',
    twoHanded: true,
    occupied: { main_hand: true },
  });
  expect(destroyed).toEqual({ ok: false, code: 'destroyed' });
  expect(
    canEquip(-1, { slot: 'core', twoHanded: false, occupied: {} }),
  ).toEqual({ ok: false, code: 'destroyed' });

  expect(() =>
    canEquip(10, { slot: 'off_hand', twoHanded: true, occupied: {} }),
  ).toThrow(RangeError);
});

test('ammo weights', () => {
  expect(AMMO_WEIGHT_KG).toEqual({ light: 0.01, heavy: 0.03, cell: 0.05 });
  expect(specialAmmoWeightKg(SPECIAL_AMMO_WEIGHT_MIN_KG)).toBe(0.5);
  expect(specialAmmoWeightKg(SPECIAL_AMMO_WEIGHT_MAX_KG)).toBe(2);
  expect(specialAmmoWeightKg(1.25)).toBe(1.25);
  expect(() => specialAmmoWeightKg(0.49)).toThrow(RangeError);
  expect(() => specialAmmoWeightKg(2.01)).toThrow(RangeError);
});

test('negative online hours are a program error', () => {
  expect(() => wearFor('hour', -1)).toThrow(RangeError);
  expect(() => wearFor('hour', Number.NaN)).toThrow(RangeError);
});
