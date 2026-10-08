import { readFileSync } from 'node:fs';
import { emptyPoints } from '@rift/domain/stats';
import type { Appearance } from '@rift/domain/character';
import type { Catalog } from '@rift/content';
import { expect, test } from 'vitest';
import { PRODUCTION_BCRYPT_COST, buildApp, compose } from './compose';
import { renderMetrics } from './metrics';

const MODULE_NAMES = [
  'auth',
  'character',
  'inventory',
  'world',
  'dungeon',
  'craft',
  'economy',
  'social',
  'guild',
  'quest',
  'event',
  'gathering',
  'hack',
  'wiki',
  'build',
  'ai',
  'gateway',
  'sim',
] as const;

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

test('compose wires modules in registration order without listening', () => {
  const realNow = Date.now;
  Date.now = () => {
    throw new Error('Date.now must not be read');
  };
  try {
    const graph = compose({ catalog: minimalCatalog(), nowMs: 1_000, jwtSecret: 'test-secret' });
    expect(graph.modules.map((gameModule) => gameModule.name)).toEqual([...MODULE_NAMES]);
    graph.tickOnce();
    graph.tickOnce();
    expect(graph.snapshot()).toMatchObject({ ticks: 2, rejected: 0, players: 0, bots: 0 });
  } finally {
    Date.now = realNow;
  }
});

test('guild, auction, mail, and titles follow the live domain rules', async () => {
  const graph = compose({ catalog: minimalCatalog(), nowMs: 1_000, jwtSecret: 'test-secret' });
  expect(graph.economy.service.listAuction()).toEqual({ ok: true, value: [] });
  expect(await graph.guild.service.create({})).toEqual({ ok: false, code: 'member' });
  expect(
    await graph.guild.service.declareWar({ attackerGuildId: 'guild-1', cityId: 'fort_humans' }),
  ).not.toEqual({ ok: false, code: 'feature_stub' });
  expect(
    await graph.guild.service.withdraw({ guildId: 'guild-1', rank: 'leader', amount: 1 }),
  ).toEqual({ ok: false, code: 'member' });
  graph.creditGuildGold('m0', 10_000);
  const created = await graph.guild.service.create({
    name: 'Red Wolves',
    tag: 'RW',
    initiatorId: 'm0',
    members: [
      { id: 'm0', level: 5 },
      { id: 'm1', level: 5 },
      { id: 'm2', level: 5 },
      { id: 'm3', level: 5 },
    ],
    gold: 10_000,
  });
  expect(created.ok).toBe(true);
  expect(graph.social.service.grantTitle({ characterId: 'lia', titleId: 'scout' })).toEqual({
    ok: false,
    code: 'missing',
  });
  graph.social.service.register({ id: 'lia', nodeId: 'fort_humans', language: 'common_light' });
  graph.social.service.register({ id: 'kai', nodeId: 'far', language: 'common_dark' });
  expect(
    await graph.social.service.say({
      senderId: 'lia',
      channel: 'mail',
      text: 'hello',
      subject: 'note',
      recipientId: 'kai',
      nowMs: 1_000,
    }),
  ).toEqual({ ok: true, value: { delivered: 1 } });
  expect(graph.social.service.inbox('kai')).toEqual([
    { channel: 'mail', senderId: 'lia', text: 'hello', mode: 'raw' },
  ]);
  expect(graph.social.service.grantTitle({ characterId: 'lia', titleId: 'scout' })).toEqual({
    ok: true,
    value: { titleId: 'scout' },
  });
  expect(
    await graph.social.service.say({
      senderId: 'lia',
      channel: 'guild',
      text: 'hello',
      nowMs: 1_000,
    }),
  ).toEqual({ ok: false, code: 'no_guild' });
});

test('enterWorld puts the player and prototype monsters on the tick', () => {
  const graph = compose({ catalog: minimalCatalog(), nowMs: 1_000, jwtSecret: 'test-secret' });
  expect(graph.snapshot()).toMatchObject({ players: 0, bots: 0 });
  graph.enterWorld('lia');
  expect(graph.snapshot()).toMatchObject({ players: 1, bots: 0 });
  graph.submit({
    commandId: 's1',
    seq: 1,
    issuedAtMs: 1_000,
    action: 'step_e',
    params: { entityId: 'lia' },
  });
  graph.tickOnce();
  expect(graph.snapshot().ticks).toBe(1);
  expect(graph.snapshot().players).toBe(1);
});

test('renderMetrics names the four series', () => {
  const text = renderMetrics({ ticks: 2, rejected: 1, players: 3, bots: 4 });
  expect(text).toContain('rift_tick_total 2');
  expect(text).toContain('rift_commands_rejected_total 1');
  expect(text).toContain('rift_online_players 3');
  expect(text).toContain('rift_online_bots 4');
});

test('PRODUCTION_BCRYPT_COST is 12', () => {
  expect(PRODUCTION_BCRYPT_COST).toBe(12);
});

test('the interval and listen stay in main', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const mainSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const testSource = readFileSync(new URL('./compose.test.ts', import.meta.url), 'utf8');
  expect(composeSource.includes('setInterval')).toBe(false);
  expect(composeSource.includes('Date.now')).toBe(false);
  expect(composeSource.includes('.listen(')).toBe(false);
  expect(mainSource.includes('setInterval')).toBe(true);
  expect(mainSource.includes('.listen(')).toBe(true);
  expect(mainSource.includes('Date.now')).toBe(false);
  expect(/from\s+['"]\.\/main(\.ts)?['"]/.test(testSource)).toBe(false);
});

test('a bad clock aborts startup and does not listen', async () => {
  await expect(
    buildApp({ catalog: minimalCatalog(), nowMs: Number.NaN, jwtSecret: 'test-secret' }),
  ).rejects.toThrow(/clock is not finite/);
});

test('health, metrics, auth, and a human inventory do not listen', async () => {
  const built = await buildApp({
    catalog: minimalCatalog(),
    nowMs: 1_000,
    jwtSecret: 'test-secret',
  });
  try {
    expect(built.modules.map((gameModule) => gameModule.name)).toEqual([...MODULE_NAMES]);
    expect(built.app.server.listening).toBe(false);

    const health = await built.app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true, tick: 0 });

    const registered = await built.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'lia@example.com', password: 'correct-horse' },
    });
    expect(registered.statusCode).toBe(200);
    const account = registered.json() as { accountId: string };
    expect(account.accountId.length).toBeGreaterThan(0);

    const loggedIn = await built.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'lia@example.com', password: 'correct-horse' },
    });
    expect(loggedIn.statusCode).toBe(200);
    const session = loggedIn.json() as { accessToken: string; sessionKey: string };
    expect(session.accessToken.length).toBeGreaterThan(0);
    expect(session.sessionKey.length).toBeGreaterThan(0);

    const created = await built.app.inject({
      method: 'POST',
      url: '/characters',
      payload: {
        accountId: account.accountId,
        name: 'Лиа',
        clean: false,
        points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
        appearance,
      },
    });
    expect(created.statusCode).toBe(200);
    const character = created.json() as { characterId: string };

    const inventory = await built.app.inject({
      method: 'GET',
      url: `/characters/${character.characterId}/inventory`,
    });
    expect(inventory.statusCode).toBe(200);
    expect(inventory.json()).toMatchObject({ gold: 100 });

    const auction = await built.app.inject({ method: 'POST', url: '/auction' });
    expect(auction.statusCode).toBe(200);
    expect(auction.json()).toEqual({ lots: [] });
    expect(built.economy.service.listAuction()).toEqual({ ok: true, value: [] });

    built.tickOnce();
    built.tickOnce();
    const metrics = await built.app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain('rift_tick_total 2');
    expect(metrics.body).toContain('rift_commands_rejected_total');
    expect(metrics.body).toContain('rift_online_players');
    expect(metrics.body).toContain('rift_online_bots');
    const after = await built.app.inject({ method: 'GET', url: '/health' });
    expect(after.json()).toEqual({ ok: true, tick: 2 });
    expect(built.app.server.listening).toBe(false);
  } finally {
    await built.close();
  }
}, 60_000);

function minimalCatalog(): Catalog {
  return {
    races: [],
    items: [
      { id: 'rusty_sword', kind: 'weapon', weightKg: 3, slot: 'main_hand' },
      { id: 'leather_jacket', kind: 'armor', weightKg: 3, slot: 'torso' },
      { id: 'bandage', kind: 'consumable', weightKg: 0.1 },
      { id: 'ammo_light', kind: 'ammo', weightKg: 0.01 },
    ],
    cores: [],
    recipes: [],
    monsters: [],
    loot: {
      base: [],
      rare: [],
      byType: {},
      byRegion: [],
      elite: [],
      bosses: {},
      chests: {},
      programSources: [],
    },
    world: { nodes: [], edges: [], regions: [] },
    quests: [],
    features: {
      playableRaces: ['human', 'demon'],
      auction: 'stub',
      mail: 'stub',
      guild: 'stub',
      titles: 'stub',
      languages: ['ru', 'en'],
    },
    fragments: [],
    starter: {
      weapon: { itemId: 'rusty_sword' },
      armor: { itemId: 'leather_jacket' },
      items: [],
    },
    echoes: [],
    paths: [],
    modifiers: [],
  };
}
