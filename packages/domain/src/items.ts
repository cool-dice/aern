import { err, ok, type Result } from './result';
import { MAX_LEVEL, type StatId } from './stats';

export const GRADE_IDS = ['common', 'rare', 'epic', 'unique'] as const;
export type GradeId = (typeof GRADE_IDS)[number];

export const EQUIP_SLOTS = [
  'head',
  'torso',
  'hands',
  'legs',
  'main_hand',
  'off_hand',
  'core',
] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export const IMPLANT_SLOTS = [
  'implant_head',
  'implant_torso',
  'implant_hands',
  'implant_legs',
] as const;
export type ImplantSlot = (typeof IMPLANT_SLOTS)[number];

export interface GradeDef {
  id: GradeId;
  statCount: number;
  activeMin: number;
  activeMax: number;
  passiveMin: number;
  passiveMax: number;
  statMin: number;
  statMax: number;
  priceCoefficient: number;
}

export const GRADES: Record<GradeId, GradeDef> = {
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

/** New items start at full durability. Destroyed at `<= 0`. */
export const STARTING_DURABILITY = 100;

export const WEAR_LOSS = {
  shot: 0.05,
  ability: 0.5,
  death: 10,
  hour: 0.1,
} as const;

export type WearKind = keyof typeof WEAR_LOSS;

/** Standard cartridge weights, kilograms. Special ammo is per item. */
export const AMMO_WEIGHT_KG = {
  light: 0.01,
  heavy: 0.03,
  cell: 0.05,
} as const;

export type StandardAmmoKind = keyof typeof AMMO_WEIGHT_KG;

export const SPECIAL_AMMO_WEIGHT_MIN_KG = 0.5;
export const SPECIAL_AMMO_WEIGHT_MAX_KG = 2;

const ITEM_LEVEL_SPAN = MAX_LEVEL - 1;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function itemStatValue(grade: GradeId, itemLevel: number): number {
  if (!(itemLevel >= 1 && itemLevel <= MAX_LEVEL)) {
    throw new RangeError(`item level must be in [1, ${MAX_LEVEL}], got ${String(itemLevel)}`);
  }
  const { statMin, statMax } = GRADES[grade];
  return Math.floor(statMin + ((statMax - statMin) * (itemLevel - 1)) / ITEM_LEVEL_SPAN);
}

export function applyWear(durability: number, loss: number): number {
  return Math.max(0, round2(durability - loss));
}

/** Online hours, not calendar hours. Omitted `hours` means one hour. */
export function wearFor(kind: WearKind, hours?: number): number {
  if (kind === 'hour') {
    const span = hours ?? 1;
    if (!Number.isFinite(span) || span < 0) {
      throw new RangeError(`hours must be a finite number >= 0, got ${String(hours)}`);
    }
    return round2(WEAR_LOSS.hour * span);
  }
  return WEAR_LOSS[kind];
}

export interface ItemBonus {
  stat: StatId;
  amount: number;
}

export function effectiveBonuses(bonuses: ItemBonus[], requirementMet: boolean): ItemBonus[] {
  return bonuses.map((bonus) => {
    if (bonus.amount < 0) {
      throw new RangeError('negative item bonuses are not generated');
    }
    if (requirementMet) {
      return { stat: bonus.stat, amount: bonus.amount };
    }
    return { stat: bonus.stat, amount: Math.floor(bonus.amount * 0.5) };
  });
}

/** One flag for every soft-failed item. Two failures stay at 0.8. */
export function speedMultiplier(anySoftFail: boolean): number {
  return anySoftFail ? 0.8 : 1;
}

export interface EquipAttempt {
  slot: EquipSlot;
  twoHanded: boolean;
  occupied: Partial<Record<EquipSlot, boolean>>;
}

export type EquipError = 'slot_blocked' | 'offhand_blocked' | 'destroyed';

/**
 * Does not store inventory. A two-handed weapon already in `main_hand` is
 * reported by the caller as `occupied.off_hand = true`.
 * Unique gear is not rejected here; loot and craft own that check.
 */
export function canEquip(
  itemDurability: number,
  attempt: EquipAttempt,
): Result<EquipSlot[], EquipError> {
  if (!(itemDurability > 0)) {
    return err('destroyed');
  }
  if (attempt.twoHanded) {
    if (attempt.slot !== 'main_hand') {
      throw new RangeError('two-handed items occupy main_hand');
    }
    if (attempt.occupied.main_hand) {
      return err('slot_blocked');
    }
    if (attempt.occupied.off_hand) {
      return err('offhand_blocked');
    }
    return ok(['main_hand', 'off_hand']);
  }
  if (attempt.occupied[attempt.slot]) {
    return err('slot_blocked');
  }
  return ok([attempt.slot]);
}

/** Inclusive range 0.5..2 kg. The item definition supplies the weight. */
export function specialAmmoWeightKg(weightKg: number): number {
  if (weightKg < SPECIAL_AMMO_WEIGHT_MIN_KG || weightKg > SPECIAL_AMMO_WEIGHT_MAX_KG) {
    throw new RangeError(`special ammo weight out of range: ${String(weightKg)}`);
  }
  return weightKg;
}
