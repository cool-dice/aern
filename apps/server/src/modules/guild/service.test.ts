import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import { createGuildModule, type GoldPort, type GuildMode } from './index';

const CHARTER_FEE = 10_000;

function members(count: number, level: number): { id: string; level: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${String(index)}`,
    level,
  }));
}

function trackingGold(start: number): {
  port: GoldPort;
  calls: { characterId: string; amount: number }[];
  balance: () => number;
} {
  const calls: { characterId: string; amount: number }[] = [];
  let gold = start;
  return {
    calls,
    balance: () => gold,
    port: {
      async deduct(characterId: string, amount: number) {
        calls.push({ characterId, amount });
        if (gold < amount) {
          return { ok: false, code: 'gold' };
        }
        gold -= amount;
        return { ok: true, value: { gold } };
      },
    },
  };
}

function started(mode: GuildMode, gold?: ReturnType<typeof trackingGold>) {
  const clock = manualClock(1_000);
  const bus = createBus();
  const guild = createGuildModule({ mode, gold: gold?.port });
  guild.start({ bus, now: () => clock.now() });
  return { clock, bus, guild };
}

const validCreate = {
  name: 'Red Wolves',
  tag: 'RW',
  initiatorId: 'm0',
  members: members(4, 5),
  gold: CHARTER_FEE,
};

test('preview of 3 members is size and writes nothing', async () => {
  for (const mode of ['stub', 'live'] as const) {
    const wallet = trackingGold(CHARTER_FEE);
    const { guild } = started(mode, wallet);
    const preview = await guild.service.previewCreate(members(3, 5), CHARTER_FEE);
    expect(preview).toEqual({ ok: false, code: 'size' });
    expect(await guild.repository.listGuilds()).toEqual([]);
    expect(wallet.calls).toEqual([]);
  }
});

test('preview of 4 valid members is ok and leaderReady', async () => {
  const wallet = trackingGold(CHARTER_FEE);
  const { guild } = started('stub', wallet);
  const preview = await guild.service.previewCreate(members(4, 5), CHARTER_FEE);
  expect(preview.ok).toBe(true);
  if (preview.ok) {
    expect(preview.value.leaderReady).toBe(true);
  }
  expect(await guild.repository.listGuilds()).toEqual([]);
  expect(wallet.calls).toEqual([]);
});

test('stub create, declareWar, and withdraw return feature_stub without gold or state', async () => {
  const wallet = trackingGold(CHARTER_FEE);
  const { guild } = started('stub', wallet);
  const before = await guild.repository.listGuilds();

  expect(await guild.service.create(validCreate)).toEqual({ ok: false, code: 'feature_stub' });
  expect(
    await guild.service.declareWar({
      attackerGuildId: 'guild-1',
      cityId: 'fort_humans',
      gold: 0,
      resources: 20_000,
      leaderConsent: true,
      councilConsents: 2,
    }),
  ).toEqual({ ok: false, code: 'feature_stub' });
  expect(await guild.service.withdraw({ guildId: 'guild-1', rank: 'leader', amount: 1 })).toEqual({
    ok: false,
    code: 'feature_stub',
  });

  expect(wallet.calls).toEqual([]);
  expect(wallet.balance()).toBe(CHARTER_FEE);
  expect(await guild.repository.listGuilds()).toEqual(before);
  expect(await guild.repository.listWars()).toEqual([]);
});

test('live create with four level-5 members and 10000 gold stores a guild and deducts the fee', async () => {
  const wallet = trackingGold(CHARTER_FEE);
  const { guild } = started('live', wallet);
  const created = await guild.service.create(validCreate);

  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  const stored = await guild.repository.listGuilds();
  expect(stored).toEqual([
    {
      id: created.value.guildId,
      name: 'Red Wolves',
      tag: 'RW',
      leaderId: 'm0',
      memberIds: ['m0', 'm1', 'm2', 'm3'],
      bank: 0,
    },
  ]);
  expect(wallet.calls).toEqual([{ characterId: 'm0', amount: CHARTER_FEE }]);
  expect(wallet.balance()).toBe(0);
});

test('live create that fails the domain check does not charge gold', async () => {
  const wallet = trackingGold(CHARTER_FEE);
  const { guild } = started('live', wallet);
  const created = await guild.service.create({ ...validCreate, members: members(3, 5) });
  expect(created).toEqual({ ok: false, code: 'size' });
  expect(wallet.calls).toEqual([]);
  expect(await guild.repository.listGuilds()).toEqual([]);
});

test('live declareWar without 50000 gold returns gold and stores no war', async () => {
  const { guild } = started('live', trackingGold(0));
  const declared = await guild.service.declareWar({
    attackerGuildId: 'guild-missing',
    cityId: 'fort_humans',
    gold: 49_999,
    resources: 20_000,
    leaderConsent: true,
    councilConsents: 2,
  });
  expect(declared).toEqual({ ok: false, code: 'gold' });
  expect(await guild.repository.listWars()).toEqual([]);
  expect(await guild.repository.listGuilds()).toEqual([]);
});

test('createGuildModule starts on the manual clock and does not read Date.now', async () => {
  const clock = manualClock(1_000);
  const guild = createGuildModule({ mode: 'stub' });
  expect(guild.name).toBe('guild');
  guild.start({ bus: createBus(), now: () => clock.now() });

  const realNow = Date.now;
  Date.now = () => {
    throw new Error('Date.now must not be read');
  };
  try {
    clock.advance(50);
    const preview = await guild.service.previewCreate(members(4, 5), CHARTER_FEE);
    expect(preview.ok).toBe(true);
    expect(await guild.service.create(validCreate)).toEqual({ ok: false, code: 'feature_stub' });
  } finally {
    Date.now = realNow;
  }
});
