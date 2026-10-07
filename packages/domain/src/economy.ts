import { GRADES, type GradeId } from './items';
import { err, ok, type Result } from './result';

export const WALLET_CAP = 1_000_000;
export const GUILD_BANK_CAP = 10_000_000;
export const AUCTION_TAX = 0.05;
export const AUCTION_LOT_MS = 86_400_000;
export const AUCTION_LOT_LIMIT = 5;
export const STARTER_GOLD = 100;

/** Personal stash. The GDD states no ceiling; task 018 locks 1000 slots. */
export const STASH_BASE_SLOTS = 200;
export const STASH_EXPAND_SLOTS = 50;
export const STASH_EXPAND_GOLD = 1_000;
export const STASH_SLOT_CAP = 1_000;
export const STASH_MAX_PURCHASES = 16;

const SAME_SIDE_GOLD = 5;
const CROSS_SIDE_GOLD = 10;
const SAME_SIDE_COOLDOWN_MS = 5 * 60 * 1000;
const CROSS_SIDE_COOLDOWN_MS = 10 * 60 * 1000;
const CITY_FEE_MAX = 5;
const BID_STEP_PERCENT = 5;

export type AuctionTaxSink = 'void' | 'guild';

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be an integer >= 0, got ${String(value)}`);
  }
}

function assertStacks(stacks: Record<string, number>, label: string): void {
  for (const [id, qty] of Object.entries(stacks)) {
    if (!Number.isInteger(qty) || qty < 0) {
      throw new RangeError(`${label}[${id}] must be an integer >= 0, got ${String(qty)}`);
    }
  }
}

/** ceil(n / d) for non-negative integers. */
function ceilDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator + denominator - 1) / denominator);
}

export function basePrice(level: number, grade: GradeId): number {
  assertNonNegativeInteger(level, 'level');
  const gradeDef = GRADES[grade];
  if (!gradeDef) {
    throw new RangeError(`unknown grade: ${String(grade)}`);
  }
  return level * gradeDef.priceCoefficient;
}

export function sellToNpc(
  level: number,
  grade: GradeId,
  unique: boolean,
): Result<number, 'unique'> {
  if (unique) {
    return err('unique');
  }
  return ok(Math.floor(basePrice(level, grade) / 2));
}

export function buyFromNpc(
  level: number,
  grade: GradeId,
  unique: boolean,
): Result<number, 'unique'> {
  if (unique) {
    return err('unique');
  }
  const base = basePrice(level, grade);
  return ok(ceilDiv(base * 3, 2));
}

export function repairCost(
  level: number,
  grade: GradeId,
  durability: number,
): Result<number, 'intact' | 'destroyed'> {
  if (!Number.isFinite(durability)) {
    throw new RangeError(`durability must be finite, got ${String(durability)}`);
  }
  if (durability <= 0) {
    return err('destroyed');
  }
  if (durability >= 100) {
    return err('intact');
  }
  const base = basePrice(level, grade);
  const durabilityBp = Math.min(9_999, Math.max(1, Math.round(durability * 100)));
  const numerator = base * (20_000 - durabilityBp);
  return ok(Math.max(1, ceilDiv(numerator, 100_000)));
}

export function deposit(wallet: number, amount: number): { wallet: number; overflow: number } {
  assertNonNegativeInteger(wallet, 'wallet');
  assertNonNegativeInteger(amount, 'amount');
  if (wallet > WALLET_CAP) {
    throw new RangeError(`wallet exceeds cap ${String(WALLET_CAP)}`);
  }
  const room = WALLET_CAP - wallet;
  if (amount <= room) {
    return { wallet: wallet + amount, overflow: 0 };
  }
  return { wallet: WALLET_CAP, overflow: amount - room };
}

export function portalFee(input: {
  sameSide: boolean;
  barrierDown: boolean;
  cityFee: number;
  visited: boolean;
  hostile: boolean;
}): Result<{ gold: number; cooldownMs: number }, 'barrier' | 'unknown' | 'blocked' | 'fee'> {
  if (!input.visited) {
    return err('unknown');
  }
  if (input.hostile) {
    return err('blocked');
  }
  if (!Number.isInteger(input.cityFee) || input.cityFee < 0 || input.cityFee > CITY_FEE_MAX) {
    return err('fee');
  }
  if (!input.sameSide && !input.barrierDown) {
    return err('barrier');
  }
  if (input.sameSide) {
    return ok({ gold: SAME_SIDE_GOLD + input.cityFee, cooldownMs: SAME_SIDE_COOLDOWN_MS });
  }
  return ok({ gold: CROSS_SIDE_GOLD + input.cityFee, cooldownMs: CROSS_SIDE_COOLDOWN_MS });
}

/**
 * Opening bid (no current bid) must be at least `startPrice`.
 * A later bid must reach `ceil(current * 1.05)`.
 * A bid that reaches `buyout` fills at `buyout`.
 */
export function placeBid(input: {
  startPrice: number;
  currentBid: number;
  bid: number;
  buyout: number | null;
}): Result<{ price: number; buyout: boolean }, 'step' | 'low'> {
  assertNonNegativeInteger(input.startPrice, 'startPrice');
  assertNonNegativeInteger(input.currentBid, 'currentBid');
  assertNonNegativeInteger(input.bid, 'bid');
  if (input.buyout !== null) {
    assertNonNegativeInteger(input.buyout, 'buyout');
  }
  if (input.buyout !== null && input.bid >= input.buyout) {
    return ok({ price: input.buyout, buyout: true });
  }
  const minimum =
    input.currentBid > 0
      ? ceilDiv(input.currentBid * (100 + BID_STEP_PERCENT), 100)
      : input.startPrice;
  if (input.bid < minimum) {
    const standing = input.currentBid > 0 ? input.currentBid : input.startPrice;
    if (input.bid < standing) {
      return err('low');
    }
    return err('step');
  }
  return ok({ price: input.bid, buyout: false });
}

export function sellerProceeds(price: number): { seller: number; tax: number } {
  assertNonNegativeInteger(price, 'price');
  const taxPercent = Math.round(AUCTION_TAX * 100);
  const seller = Math.floor((price * (100 - taxPercent)) / 100);
  return { seller, tax: price - seller };
}

/** Neutral cities sink the auction tax. Guild cities pay it into the guild bank. */
export function auctionTaxSink(guildCity: boolean): { taxSink: AuctionTaxSink } {
  return { taxSink: guildCity ? 'guild' : 'void' };
}

export function trade(input: {
  aGold: number;
  bGold: number;
  aOfferGold: number;
  bOfferGold: number;
  aStacks: Record<string, number>;
  bStacks: Record<string, number>;
  aOffer: Record<string, number>;
  bOffer: Record<string, number>;
  aAccept: boolean;
  bAccept: boolean;
}): Result<
  {
    aGold: number;
    bGold: number;
    aStacks: Record<string, number>;
    bStacks: Record<string, number>;
  },
  'gold' | 'items' | 'accept'
> {
  assertNonNegativeInteger(input.aGold, 'aGold');
  assertNonNegativeInteger(input.bGold, 'bGold');
  assertStacks(input.aStacks, 'aStacks');
  assertStacks(input.bStacks, 'bStacks');
  if (!input.aAccept || !input.bAccept) {
    return err('accept');
  }
  if (
    !Number.isInteger(input.aOfferGold) ||
    input.aOfferGold < 0 ||
    !Number.isInteger(input.bOfferGold) ||
    input.bOfferGold < 0 ||
    input.aOfferGold > input.aGold ||
    input.bOfferGold > input.bGold
  ) {
    return err('gold');
  }
  if (!stacksCover(input.aStacks, input.aOffer) || !stacksCover(input.bStacks, input.bOffer)) {
    return err('items');
  }
  const aStacks = { ...input.aStacks };
  const bStacks = { ...input.bStacks };
  give(aStacks, bStacks, input.aOffer);
  give(bStacks, aStacks, input.bOffer);
  return ok({
    aGold: input.aGold - input.aOfferGold + input.bOfferGold,
    bGold: input.bGold - input.bOfferGold + input.aOfferGold,
    aStacks,
    bStacks,
  });
}

function stacksCover(stacks: Record<string, number>, offer: Record<string, number>): boolean {
  for (const [id, qty] of Object.entries(offer)) {
    if (!Number.isInteger(qty) || qty < 0) {
      return false;
    }
    if ((stacks[id] ?? 0) < qty) {
      return false;
    }
  }
  return true;
}

function give(
  from: Record<string, number>,
  to: Record<string, number>,
  offer: Record<string, number>,
): void {
  for (const [id, qty] of Object.entries(offer)) {
    if (qty === 0) {
      continue;
    }
    const left = (from[id] ?? 0) - qty;
    if (left < 0) {
      throw new RangeError(`stack ${id} went negative`);
    }
    if (left === 0) {
      delete from[id];
    } else {
      from[id] = left;
    }
    to[id] = (to[id] ?? 0) + qty;
  }
}

/** Sum of unit price × quantity. Craft rush spends half of this; craft does not import this module. */
export function materialGold(
  unitPrices: Record<string, number>,
  need: Record<string, number>,
): number {
  let total = 0;
  for (const [id, qty] of Object.entries(need)) {
    if (!Number.isInteger(qty) || qty < 0) {
      throw new RangeError(`material quantity must be an integer >= 0, got ${String(qty)}`);
    }
    if (qty === 0) {
      continue;
    }
    const unit = unitPrices[id];
    if (unit === undefined) {
      throw new RangeError(`missing unit price for ${id}`);
    }
    if (!Number.isInteger(unit) || unit < 0) {
      throw new RangeError(`unit price must be an integer >= 0, got ${String(unit)}`);
    }
    total += unit * qty;
  }
  return total;
}

export function expandStash(slots: number): Result<{ gold: number; slots: number }, 'cap'> {
  assertNonNegativeInteger(slots, 'slots');
  if (slots + STASH_EXPAND_SLOTS > STASH_SLOT_CAP) {
    return err('cap');
  }
  return ok({ gold: STASH_EXPAND_GOLD, slots: slots + STASH_EXPAND_SLOTS });
}
