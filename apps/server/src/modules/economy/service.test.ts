import { WALLET_CAP } from '@rift/domain/economy';
import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import { createEconomyModule } from './index';
import { memoryEconomyRepository, newEconomyCharacter } from './repository';
import { createEconomyService } from './service';
import type { EconomyCharacter, EconomyItem, PortalNode } from './types';

function epicSword(itemId: string, durability: number, unique = false): EconomyItem {
  return {
    itemId,
    level: 20,
    grade: 'epic',
    unique,
    durability,
    qty: 1,
  };
}

function city(nodeId: string, side: PortalNode['side'], cityFee = 0, hostile = false): PortalNode {
  return { nodeId, kind: 'city', side, cityFee, hostile };
}

function snapshot(character: EconomyCharacter): EconomyCharacter {
  return {
    ...character,
    visited: [...character.visited],
    items: Object.fromEntries(
      Object.entries(character.items).map(([id, item]) => [id, { ...item }]),
    ),
  };
}

test('selling an epic 20 sword adds 100 gold and ignores durability', async () => {
  const repository = memoryEconomyRepository();
  const worn = newEconomyCharacter({
    characterId: 'worn',
    side: 'light',
    gold: 0,
    items: { sword: epicSword('sword', 50) },
  });
  const pristine = newEconomyCharacter({
    characterId: 'pristine',
    side: 'light',
    gold: 0,
    items: { sword: epicSword('sword', 100) },
  });
  const ruined = newEconomyCharacter({
    characterId: 'ruined',
    side: 'light',
    gold: 0,
    items: { sword: epicSword('sword', 0) },
  });
  repository.saveCharacter(worn);
  repository.saveCharacter(pristine);
  repository.saveCharacter(ruined);
  const economy = createEconomyService(repository);

  const wornSale = await economy.sell('worn', 'sword');
  const pristineSale = await economy.sell('pristine', 'sword');
  const ruinedSale = await economy.sell('ruined', 'sword');

  expect(wornSale).toEqual({ ok: true, value: { gold: 100 } });
  expect(pristineSale).toEqual({ ok: true, value: { gold: 100 } });
  expect(ruinedSale).toEqual({ ok: true, value: { gold: 100 } });
  expect(repository.getCharacter('worn')?.items.sword).toBeUndefined();
  expect(repository.getCharacter('pristine')?.gold).toBe(100);
  expect(repository.getCharacter('ruined')?.gold).toBe(100);
});

test('a unique item is refused and gold does not grow', async () => {
  const repository = memoryEconomyRepository();
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'hero',
      side: 'light',
      gold: 40,
      items: { relic: epicSword('relic', 80, true) },
    }),
  );
  const economy = createEconomyService(repository);

  expect(await economy.sell('hero', 'relic')).toEqual({ ok: false, code: 'unique' });
  expect(repository.getCharacter('hero')).toMatchObject({
    gold: 40,
    items: { relic: { unique: true, durability: 80, qty: 1 } },
  });
});

test('repair of a base-200 sword at durability 50 costs 30 and restores 100', async () => {
  const repository = memoryEconomyRepository();
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'hero',
      side: 'light',
      gold: 30,
      items: { sword: epicSword('sword', 50) },
    }),
  );
  const economy = createEconomyService(repository);

  expect(await economy.repair('hero', 'sword')).toEqual({
    ok: true,
    value: { gold: 0, durability: 100 },
  });
  expect(repository.getCharacter('hero')).toMatchObject({
    gold: 0,
    items: { sword: { durability: 100 } },
  });
});

test('repair without enough gold leaves durability and gold unchanged', async () => {
  const repository = memoryEconomyRepository();
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'hero',
      side: 'light',
      gold: 29,
      items: { sword: epicSword('sword', 50) },
    }),
  );
  const economy = createEconomyService(repository);
  const before = snapshot(repository.getCharacter('hero')!);

  expect(await economy.repair('hero', 'sword')).toEqual({ ok: false, code: 'gold' });
  expect(repository.getCharacter('hero')).toEqual(before);
});

test('intact and destroyed gear are not repaired', async () => {
  const repository = memoryEconomyRepository();
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'hero',
      side: 'light',
      gold: 100,
      items: {
        whole: epicSword('whole', 100),
        scrap: epicSword('scrap', 0),
      },
    }),
  );
  const economy = createEconomyService(repository);

  expect(await economy.repair('hero', 'whole')).toEqual({ ok: false, code: 'intact' });
  expect(await economy.repair('hero', 'scrap')).toEqual({ ok: false, code: 'destroyed' });
  expect(repository.getCharacter('hero')?.gold).toBe(100);
  expect(repository.getCharacter('hero')?.items.whole?.durability).toBe(100);
  expect(repository.getCharacter('hero')?.items.scrap?.durability).toBe(0);
});

test('an auction lot accepts a step bid and a buyout', () => {
  const repository = memoryEconomyRepository();
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'seller',
      side: 'light',
      gold: 0,
      items: { ore: { itemId: 'ore', level: 1, grade: 'common', unique: false, durability: 100, qty: 2 } },
    }),
  );
  repository.saveCharacter(newEconomyCharacter({ characterId: 'buyer', side: 'light', gold: 200 }));
  const economy = createEconomyService(repository);
  expect(economy.listAuction()).toEqual({ ok: true, value: [] });
  const listed = economy.offerAuction({
    sellerId: 'seller',
    itemId: 'ore',
    qty: 1,
    startPrice: 10,
    buyout: 50,
    guildCity: false,
  });
  expect(listed.ok).toBe(true);
  expect(repository.getCharacter('seller')?.items.ore?.qty).toBe(1);
  if (!listed.ok) {
    return;
  }
  expect(economy.bidAuction({ lotId: listed.value.id, bidderId: 'buyer', bid: 9 })).toEqual({
    ok: false,
    code: 'low',
  });
  expect(economy.bidAuction({ lotId: listed.value.id, bidderId: 'buyer', bid: 10 }).ok).toBe(true);
  expect(economy.bidAuction({ lotId: listed.value.id, bidderId: 'buyer', bid: 10 })).toEqual({
    ok: false,
    code: 'step',
  });
  const bought = economy.bidAuction({ lotId: listed.value.id, bidderId: 'buyer', bid: 50 });
  expect(bought).toEqual({ ok: true, value: { price: 50, buyout: true } });
  expect(repository.getCharacter('buyer')?.items.ore?.qty).toBe(1);
  expect(repository.getCharacter('buyer')?.gold).toBe(150);
  expect(repository.getCharacter('seller')?.gold).toBeGreaterThan(0);
  expect(economy.listAuction()).toEqual({ ok: true, value: [] });
});

test('a same-side portal charges 5 gold and blocks a repeat until the cooldown', async () => {
  const repository = memoryEconomyRepository();
  repository.saveNode(city('fort_humans', 'light'));
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'hero',
      side: 'light',
      gold: 20,
      visited: ['fort_humans'],
    }),
  );
  const economy = createEconomyService(repository);
  const nowMs = 1_000;

  expect(await economy.portal('hero', 'fort_humans', nowMs)).toEqual({
    ok: true,
    value: { cooldownUntilMs: nowMs + 300_000 },
  });
  expect(repository.getCharacter('hero')).toMatchObject({
    gold: 15,
    portalCooldownUntilMs: nowMs + 300_000,
  });

  expect(await economy.portal('hero', 'fort_humans', nowMs + 1)).toEqual({
    ok: false,
    code: 'cooldown',
  });
  expect(repository.getCharacter('hero')?.gold).toBe(15);

  expect(await economy.portal('hero', 'fort_humans', nowMs + 300_000)).toEqual({
    ok: true,
    value: { cooldownUntilMs: nowMs + 600_000 },
  });
  expect(repository.getCharacter('hero')?.gold).toBe(10);
});

test('portal surfaces unknown, fee, and barrier, and ignores hostile cities while guild is stub', async () => {
  const repository = memoryEconomyRepository();
  repository.saveNode(city('fort_humans', 'light', 0, true));
  repository.saveNode(city('obsidian_tower', 'dark', 3, false));
  repository.saveNode({ ...city('cross_light', 'light'), kind: 'hub' });
  repository.saveNode(city('fee_city', 'light', 6));
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'hero',
      side: 'light',
      gold: 50,
      visited: ['fort_humans', 'obsidian_tower', 'fee_city'],
    }),
  );
  const economy = createEconomyService(repository);

  expect(await economy.portal('hero', 'no_such_city', 0)).toEqual({ ok: false, code: 'unknown' });
  expect(await economy.portal('hero', 'cross_light', 0)).toEqual({ ok: false, code: 'unknown' });
  expect(await economy.portal('hero', 'fee_city', 0)).toEqual({ ok: false, code: 'fee' });
  expect(await economy.portal('hero', 'obsidian_tower', 0)).toEqual({ ok: false, code: 'barrier' });
  expect(repository.getCharacter('hero')?.gold).toBe(50);
  expect(repository.getCharacter('hero')?.portalCooldownUntilMs).toBe(0);

  expect(await economy.portal('hero', 'fort_humans', 0)).toEqual({
    ok: true,
    value: { cooldownUntilMs: 300_000 },
  });
  expect(repository.getCharacter('hero')?.gold).toBe(45);

  repository.setGuild('live');
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'other',
      side: 'light',
      gold: 50,
      visited: ['fort_humans'],
    }),
  );
  expect(await economy.portal('other', 'fort_humans', 0)).toEqual({ ok: false, code: 'blocked' });
  expect(repository.getCharacter('other')?.gold).toBe(50);
});

test('a cross-side portal after the barrier falls adds the city fee', async () => {
  const repository = memoryEconomyRepository();
  repository.saveNode(city('obsidian_tower', 'dark', 3));
  repository.setBarrierDown(true);
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'hero',
      side: 'light',
      gold: 40,
      visited: ['obsidian_tower'],
    }),
  );
  const economy = createEconomyService(repository);

  expect(await economy.portal('hero', 'obsidian_tower', 5_000)).toEqual({
    ok: true,
    value: { cooldownUntilMs: 5_000 + 600_000 },
  });
  expect(repository.getCharacter('hero')?.gold).toBe(27);
});

test('an unvisited city is unknown and a short wallet does not start a cooldown', async () => {
  const repository = memoryEconomyRepository();
  repository.saveNode(city('fort_humans', 'light'));
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'hero',
      side: 'light',
      gold: 4,
      visited: [],
    }),
  );
  const economy = createEconomyService(repository);

  expect(await economy.portal('hero', 'fort_humans', 0)).toEqual({ ok: false, code: 'unknown' });

  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'hero',
      side: 'light',
      gold: 4,
      visited: ['fort_humans'],
    }),
  );
  expect(await economy.portal('hero', 'fort_humans', 0)).toEqual({ ok: false, code: 'gold' });
  expect(repository.getCharacter('hero')).toMatchObject({ gold: 4, portalCooldownUntilMs: 0 });
});

test('one accept stays pending and both accepts swap 10 gold for an item', async () => {
  const repository = memoryEconomyRepository();
  repository.saveCharacter(newEconomyCharacter({ characterId: 'buyer', side: 'light', gold: 10 }));
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'seller',
      side: 'light',
      gold: 0,
      items: { sword: epicSword('sword', 40) },
    }),
  );
  const economy = createEconomyService(repository);

  const offered = await economy.offerTrade({
    characterId: 'buyer',
    counterpartyId: 'seller',
    gold: 10,
    items: {},
  });
  expect(offered.ok).toBe(true);
  if (!offered.ok) {
    return;
  }
  expect(
    await economy.offerTrade({
      characterId: 'seller',
      counterpartyId: 'buyer',
      gold: 0,
      items: { sword: 1 },
    }),
  ).toEqual(offered);

  expect(await economy.acceptTrade(offered.value.tradeId, 'buyer')).toEqual({
    ok: true,
    value: 'pending',
  });
  expect(repository.getCharacter('buyer')).toMatchObject({ gold: 10, items: {} });
  expect(repository.getCharacter('seller')?.items.sword?.qty).toBe(1);
  expect(repository.getCharacter('seller')?.gold).toBe(0);

  expect(await economy.acceptTrade(offered.value.tradeId, 'seller')).toEqual({
    ok: true,
    value: 'done',
  });
  expect(repository.getCharacter('buyer')).toMatchObject({
    gold: 0,
    items: { sword: { qty: 1, durability: 40, level: 20, grade: 'epic' } },
  });
  expect(repository.getCharacter('seller')).toMatchObject({ gold: 10, items: {} });
  expect(repository.getTrade(offered.value.tradeId)).toBeNull();
});

test('a trade with too little gold does not change either character', async () => {
  const repository = memoryEconomyRepository();
  repository.saveCharacter(newEconomyCharacter({ characterId: 'buyer', side: 'light', gold: 4 }));
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'seller',
      side: 'dark',
      gold: 7,
      items: { sword: epicSword('sword', 90) },
    }),
  );
  const economy = createEconomyService(repository);
  const buyerBefore = snapshot(repository.getCharacter('buyer')!);
  const sellerBefore = snapshot(repository.getCharacter('seller')!);

  const offered = await economy.offerTrade({
    characterId: 'buyer',
    counterpartyId: 'seller',
    gold: 10,
    items: {},
  });
  expect(offered.ok).toBe(true);
  if (!offered.ok) {
    return;
  }
  await economy.offerTrade({
    characterId: 'seller',
    counterpartyId: 'buyer',
    gold: 0,
    items: { sword: 1 },
  });

  expect(await economy.acceptTrade(offered.value.tradeId, 'buyer')).toEqual({
    ok: true,
    value: 'pending',
  });
  expect(await economy.acceptTrade(offered.value.tradeId, 'seller')).toEqual({
    ok: false,
    code: 'gold',
  });
  expect(repository.getCharacter('buyer')).toEqual(buyerBefore);
  expect(repository.getCharacter('seller')).toEqual(sellerBefore);
});

test('cancel clears the offer so a later accept does not move items', async () => {
  const repository = memoryEconomyRepository();
  repository.saveCharacter(newEconomyCharacter({ characterId: 'buyer', side: 'light', gold: 10 }));
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'seller',
      side: 'light',
      gold: 1,
      items: { sword: epicSword('sword', 10) },
    }),
  );
  const economy = createEconomyService(repository);
  const offered = await economy.offerTrade({
    characterId: 'buyer',
    counterpartyId: 'seller',
    gold: 10,
    items: {},
  });
  expect(offered.ok).toBe(true);
  if (!offered.ok) {
    return;
  }
  await economy.offerTrade({
    characterId: 'seller',
    counterpartyId: 'buyer',
    gold: 0,
    items: { sword: 1 },
  });

  expect(await economy.cancelTrade(offered.value.tradeId, 'buyer')).toEqual({
    ok: true,
    value: 'cleared',
  });
  expect(await economy.acceptTrade(offered.value.tradeId, 'buyer')).toEqual({
    ok: true,
    value: 'pending',
  });
  expect(await economy.acceptTrade(offered.value.tradeId, 'seller')).toEqual({
    ok: true,
    value: 'pending',
  });
  expect(repository.getCharacter('buyer')?.gold).toBe(10);
  expect(repository.getCharacter('seller')?.items.sword?.qty).toBe(1);
  expect(repository.getCharacter('seller')?.gold).toBe(1);
});

test('sale gold above the wallet cap is dropped', async () => {
  const repository = memoryEconomyRepository();
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'hero',
      side: 'light',
      gold: WALLET_CAP - 1,
      items: { sword: epicSword('sword', 12) },
    }),
  );
  const economy = createEconomyService(repository);

  expect(await economy.sell('hero', 'sword')).toEqual({ ok: true, value: { gold: WALLET_CAP } });
  expect(repository.getCharacter('hero')?.gold).toBe(WALLET_CAP);
  expect(repository.getCharacter('hero')?.items.sword).toBeUndefined();
});

test('the economy module starts from the bus clock and does not listen', async () => {
  const repository = memoryEconomyRepository();
  repository.saveCharacter(
    newEconomyCharacter({
      characterId: 'hero',
      side: 'light',
      gold: 0,
      items: { sword: epicSword('sword', 50) },
    }),
  );
  const bus = createBus();
  const clock = manualClock(1_000);
  let hits = 0;
  bus.on('item.crafted', () => {
    hits += 1;
  });
  const economy = createEconomyModule(repository);
  const realNow = Date.now;
  Date.now = () => {
    throw new Error('Date.now must not be read');
  };
  try {
    economy.start({ bus, now: () => clock.now() });
    expect(economy.name).toBe('economy');
    expect(economy.service.listAuction()).toEqual({ ok: true, value: [] });
    expect(await economy.service.sell('hero', 'sword')).toEqual({ ok: true, value: { gold: 100 } });
    clock.advance(100);
    expect(clock.now()).toBe(1_100);
    expect(hits).toBe(0);
    expect('listen' in economy).toBe(false);
  } finally {
    Date.now = realNow;
  }
});
