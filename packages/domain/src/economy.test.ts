import { expect, test } from 'vitest';
import { GRADE_IDS, GRADES } from './items';
import {
  AUCTION_LOT_LIMIT,
  AUCTION_LOT_MS,
  AUCTION_TAX,
  GUILD_BANK_CAP,
  STASH_BASE_SLOTS,
  STASH_EXPAND_GOLD,
  STASH_EXPAND_SLOTS,
  STASH_MAX_PURCHASES,
  STASH_SLOT_CAP,
  STARTER_GOLD,
  WALLET_CAP,
  auctionTaxSink,
  basePrice,
  buyFromNpc,
  deposit,
  expandStash,
  materialGold,
  placeBid,
  portalFee,
  repairCost,
  sellToNpc,
  sellerProceeds,
  trade,
} from './economy';

test('epic sword prices and repair use the grade coefficient', () => {
  expect(basePrice(20, 'epic')).toBe(200);
  expect(sellToNpc(20, 'epic', false)).toEqual({ ok: true, value: 100 });
  expect(buyFromNpc(20, 'epic', false)).toEqual({ ok: true, value: 300 });
  expect(repairCost(20, 'epic', 50)).toEqual({ ok: true, value: 30 });
  expect(Number.isInteger(200)).toBe(true);
  for (const grade of GRADE_IDS) {
    expect(basePrice(20, grade)).toBe(20 * GRADES[grade].priceCoefficient);
  }
});

test('npc prices floor the sale and ceil the purchase', () => {
  expect(basePrice(1, 'rare')).toBe(3);
  expect(sellToNpc(1, 'rare', false)).toEqual({ ok: true, value: 1 });
  expect(buyFromNpc(1, 'rare', false)).toEqual({ ok: true, value: 5 });
});

test('unique items and components are not sold to or bought from an npc', () => {
  expect(sellToNpc(20, 'unique', true)).toEqual({ ok: false, code: 'unique' });
  expect(sellToNpc(20, 'epic', true)).toEqual({ ok: false, code: 'unique' });
  expect(buyFromNpc(20, 'unique', true)).toEqual({ ok: false, code: 'unique' });
  expect(buyFromNpc(1, 'common', true)).toEqual({ ok: false, code: 'unique' });
});

test('intact gear cannot be repaired and destroyed gear is refused', () => {
  expect(repairCost(20, 'epic', 100)).toEqual({ ok: false, code: 'intact' });
  expect(repairCost(20, 'epic', 0)).toEqual({ ok: false, code: 'destroyed' });
  expect(repairCost(20, 'epic', -1)).toEqual({ ok: false, code: 'destroyed' });
});

test('a damaged item costs at least 1 gold to repair', () => {
  expect(repairCost(1, 'common', 99.99)).toEqual({ ok: true, value: 1 });
});

test('deposit keeps the wallet cap and reports overflow', () => {
  expect(WALLET_CAP).toBe(1_000_000);
  expect(deposit(999_999, 5)).toEqual({ wallet: 1_000_000, overflow: 4 });
  expect(deposit(10, 5)).toEqual({ wallet: 15, overflow: 0 });
  expect(deposit(1_000_000, 5)).toEqual({ wallet: 1_000_000, overflow: 5 });
});

test('portal on the same side costs 5 gold and 5 minutes', () => {
  expect(
    portalFee({
      sameSide: true,
      barrierDown: false,
      cityFee: 0,
      visited: true,
      hostile: false,
    }),
  ).toEqual({ ok: true, value: { gold: 5, cooldownMs: 300_000 } });
});

test('a cross-side portal with the barrier up is refused', () => {
  expect(
    portalFee({
      sameSide: false,
      barrierDown: false,
      cityFee: 0,
      visited: true,
      hostile: false,
    }),
  ).toEqual({ ok: false, code: 'barrier' });
});

test('a cross-side portal after the barrier falls adds the city fee', () => {
  expect(
    portalFee({
      sameSide: false,
      barrierDown: true,
      cityFee: 3,
      visited: true,
      hostile: false,
    }),
  ).toEqual({ ok: true, value: { gold: 13, cooldownMs: 600_000 } });
});

test('portal refuses an unknown city, a hostile city, and a fee outside 0..5', () => {
  expect(
    portalFee({
      sameSide: true,
      barrierDown: true,
      cityFee: 0,
      visited: false,
      hostile: false,
    }),
  ).toEqual({ ok: false, code: 'unknown' });
  expect(
    portalFee({
      sameSide: true,
      barrierDown: true,
      cityFee: 0,
      visited: true,
      hostile: true,
    }),
  ).toEqual({ ok: false, code: 'blocked' });
  expect(
    portalFee({
      sameSide: true,
      barrierDown: true,
      cityFee: 6,
      visited: true,
      hostile: false,
    }),
  ).toEqual({ ok: false, code: 'fee' });
  expect(
    portalFee({
      sameSide: false,
      barrierDown: true,
      cityFee: -1,
      visited: true,
      hostile: false,
    }),
  ).toEqual({ ok: false, code: 'fee' });
});

test('an auction raise from 100 rejects 104 and accepts 105', () => {
  expect(placeBid({ startPrice: 100, currentBid: 100, bid: 104, buyout: null })).toEqual({
    ok: false,
    code: 'step',
  });
  expect(placeBid({ startPrice: 100, currentBid: 100, bid: 105, buyout: null })).toEqual({
    ok: true,
    value: { price: 105, buyout: false },
  });
});

test('a bid under the standing price is low, and the opening bid may equal the start', () => {
  expect(placeBid({ startPrice: 100, currentBid: 100, bid: 99, buyout: null })).toEqual({
    ok: false,
    code: 'low',
  });
  expect(placeBid({ startPrice: 100, currentBid: 0, bid: 100, buyout: null })).toEqual({
    ok: true,
    value: { price: 100, buyout: false },
  });
  expect(placeBid({ startPrice: 100, currentBid: 0, bid: 99, buyout: null })).toEqual({
    ok: false,
    code: 'low',
  });
});

test('a bid that reaches buyout fills at the buyout price', () => {
  expect(placeBid({ startPrice: 100, currentBid: 100, bid: 500, buyout: 200 })).toEqual({
    ok: true,
    value: { price: 200, buyout: true },
  });
});

test('seller proceeds floor 95 percent and the tax is the remainder', () => {
  expect(AUCTION_TAX).toBe(0.05);
  expect(sellerProceeds(100)).toEqual({ seller: 95, tax: 5 });
  expect(sellerProceeds(10)).toEqual({ seller: 9, tax: 1 });
});

test('auction tax sinks to the void in a neutral city and to the guild bank otherwise', () => {
  expect(auctionTaxSink(false)).toEqual({ taxSink: 'void' });
  expect(auctionTaxSink(true)).toEqual({ taxSink: 'guild' });
});

test('auction lots last 24 hours and a player may list 5', () => {
  expect(AUCTION_LOT_MS).toBe(86_400_000);
  expect(AUCTION_LOT_LIMIT).toBe(5);
  expect(GUILD_BANK_CAP).toBe(10_000_000);
  expect(STARTER_GOLD).toBe(100);
});

test('a direct trade of 10 gold for a stack fails closed when gold is short', () => {
  const aStacks = { ore: 2 };
  const bStacks = { sword: 1 };
  const input = {
    aGold: 4,
    bGold: 0,
    aOfferGold: 10,
    bOfferGold: 0,
    aStacks,
    bStacks,
    aOffer: {},
    bOffer: { sword: 1 },
    aAccept: true,
    bAccept: true,
  };
  expect(trade(input)).toEqual({ ok: false, code: 'gold' });
  expect(input.aGold).toBe(4);
  expect(input.bGold).toBe(0);
  expect(aStacks).toEqual({ ore: 2 });
  expect(bStacks).toEqual({ sword: 1 });
});

test('a trade does not move anything until both sides accept', () => {
  expect(
    trade({
      aGold: 4,
      bGold: 0,
      aOfferGold: 10,
      bOfferGold: 0,
      aStacks: {},
      bStacks: { sword: 1 },
      aOffer: {},
      bOffer: { sword: 1 },
      aAccept: true,
      bAccept: false,
    }),
  ).toEqual({ ok: false, code: 'accept' });
});

test('a trade refuses a stack the owner does not have', () => {
  const aStacks = { ore: 1 };
  const bStacks = { sword: 1 };
  expect(
    trade({
      aGold: 10,
      bGold: 0,
      aOfferGold: 10,
      bOfferGold: 0,
      aStacks,
      bStacks,
      aOffer: { ore: 2 },
      bOffer: { sword: 1 },
      aAccept: true,
      bAccept: true,
    }),
  ).toEqual({ ok: false, code: 'items' });
  expect(aStacks).toEqual({ ore: 1 });
  expect(bStacks).toEqual({ sword: 1 });
});

test('an accepted trade moves gold and stacks without a fee', () => {
  const aStacks = { ore: 5 };
  const bStacks = { sword: 1 };
  const result = trade({
    aGold: 10,
    bGold: 3,
    aOfferGold: 10,
    bOfferGold: 0,
    aStacks,
    bStacks,
    aOffer: { ore: 2 },
    bOffer: { sword: 1 },
    aAccept: true,
    bAccept: true,
  });
  expect(result).toEqual({
    ok: true,
    value: {
      aGold: 0,
      bGold: 13,
      aStacks: { ore: 3, sword: 1 },
      bStacks: { ore: 2 },
    },
  });
  expect(aStacks).toEqual({ ore: 5 });
  expect(bStacks).toEqual({ sword: 1 });
});

test('material gold is unit price times quantity', () => {
  expect(materialGold({ metal: 2 }, { metal: 5 })).toBe(10);
  expect(materialGold({ metal: 2, wood: 9 }, { metal: 5 })).toBe(10);
});

test('stash expansion is 1000 gold per 50 slots up to 1000', () => {
  expect(STASH_BASE_SLOTS).toBe(200);
  expect(STASH_EXPAND_SLOTS).toBe(50);
  expect(STASH_EXPAND_GOLD).toBe(1_000);
  expect(STASH_SLOT_CAP).toBe(1_000);
  expect(STASH_BASE_SLOTS + STASH_MAX_PURCHASES * STASH_EXPAND_SLOTS).toBe(STASH_SLOT_CAP);

  let slots = STASH_BASE_SLOTS;
  for (let purchase = 0; purchase < STASH_MAX_PURCHASES; purchase += 1) {
    const result = expandStash(slots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.gold).toBe(1_000);
      slots = result.value.slots;
    }
  }
  expect(slots).toBe(1_000);
  expect(expandStash(slots)).toEqual({ ok: false, code: 'cap' });
});
