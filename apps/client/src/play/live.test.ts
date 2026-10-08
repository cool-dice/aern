import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { createClientStore } from '../state/store';
import { completeTrade, enterDungeon, startCraft, startPortal, type LiveResponse } from './live';

const here = dirname(fileURLToPath(import.meta.url));

test('the play screen posts craft and trade through App', () => {
  const app = readFileSync(join(here, '../App.tsx'), 'utf8');
  expect(app).toContain('startCraft(');
  expect(app).toContain('completeTrade(');
  expect(app).toContain('startPortal(');
  expect(app).toContain('enterDungeon(');
  expect(app).toContain('onCraft=');
  expect(app).toContain('onTrade=');
  expect(app).toContain('onPortal=');
  expect(app).toContain('onDungeon=');
  expect(app).toContain('onDungeonSolo=');
  const panels = readFileSync(join(here, 'screens.tsx'), 'utf8');
  expect(panels).toContain('data-portal="start"');
  expect(panels).toContain('data-dungeon="share"');
  expect(panels).toContain('data-dungeon="solo"');
});

test('startCraft posts /craft/start and stores the job', async () => {
  const store = createClientStore();
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const posted = await startCraft({
    server: 'http://game.example',
    characterId: 'lia',
    recipeId: 'rusty_sword',
    store,
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      return { ok: true, json: async () => ({ jobId: 'job-1', readyAtMs: 50 }) };
    },
  });
  expect(calls).toEqual([
    {
      url: 'http://game.example/craft/start',
      body: { characterId: 'lia', recipeId: 'rusty_sword', itemLevel: 1 },
    },
  ]);
  expect(posted.ok).toBe(true);
  expect(store.getState().craftJob).toEqual({ jobId: 'job-1', readyAtMs: 50 });
  expect(store.getState().log).toEqual(['craft:job-1']);
});

test('completeTrade posts the offer and the accept and stores both', async () => {
  const store = createClientStore();
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const posted: LiveResponse = await completeTrade({
    server: 'http://game.example',
    characterId: 'seller',
    counterpartyId: 'buyer',
    gold: 20,
    store,
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      calls.push({ url, body });
      if (url.endsWith('/trade')) {
        return { ok: true, json: async () => ({ tradeId: 'trade-9' }) };
      }
      return { ok: true, json: async () => ({ status: 'done' }) };
    },
  });
  expect(calls.map((call) => call.url)).toEqual([
    'http://game.example/trade',
    'http://game.example/trade/accept',
  ]);
  expect(calls[1]?.body).toEqual({ characterId: 'seller', tradeId: 'trade-9' });
  expect(posted.body).toEqual({ status: 'done' });
  expect(store.getState().tradeResult).toEqual({
    offer: { tradeId: 'trade-9' },
    accept: { status: 'done' },
  });
  expect(store.getState().log).toEqual(['trade:done']);
});

test('startPortal posts /portal and stores the destination', async () => {
  const store = createClientStore();
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const posted = await startPortal({
    server: 'http://game.example',
    characterId: 'lia',
    toNodeId: 'fort_humans',
    store,
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      return { ok: true, json: async () => ({ nodeId: 'fort_humans', gold: 9995, cooldownUntilMs: 300_000 }) };
    },
  });
  expect(calls).toEqual([
    { url: 'http://game.example/portal', body: { characterId: 'lia', toNodeId: 'fort_humans' } },
  ]);
  expect(posted.ok).toBe(true);
  expect(store.getState().portalResult).toEqual({ nodeId: 'fort_humans', gold: 9995, cooldownUntilMs: 300_000 });
  expect(store.getState().log).toEqual(['portal:fort_humans']);
});

test('enterDungeon posts a shared seed and a solo enter stores its own body', async () => {
  const store = createClientStore();
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const shared = await enterDungeon({
    server: 'http://game.example',
    characterId: 'lia',
    groupId: 'party',
    partySize: 2,
    store,
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      return { ok: true, json: async () => ({ instanceId: 'shared-1', rooms: [{ id: 0, x: 1, y: 2 }] }) };
    },
  });
  const solo = await enterDungeon({
    server: 'http://game.example',
    characterId: 'lia',
    groupId: 'lia',
    partySize: 1,
    edgeId: 'solo_edge',
    store,
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      return { ok: true, json: async () => ({ instanceId: 'solo-1', rooms: [{ id: 0, x: 3, y: 4 }] }) };
    },
  });
  expect(shared.ok).toBe(true);
  expect(solo.ok).toBe(true);
  expect(calls[0]?.body).toMatchObject({ groupId: 'party', partySize: 2 });
  expect(calls[1]?.body).toMatchObject({ groupId: 'lia', partySize: 1, edgeId: 'solo_edge' });
  expect(store.getState().dungeonResult).toEqual({ instanceId: 'solo-1', rooms: [{ id: 0, x: 3, y: 4 }] });
});

test('a world snapshot keeps captures and reputation the map can read', () => {
  const store = createClientStore();
  store.getState().applySnapshot({
    captures: [{ cityId: 'fort_humans', guildId: 'wolves', heldMs: 100, won: false }],
    reputation: { koval: 3 },
    quests: [{ id: 'act1_light', objectives: [{ id: 'koval', target: 1, current: 0, scene: 'questioned the council' }] }],
  });
  expect(store.getState().captures).toEqual([{ cityId: 'fort_humans', guildId: 'wolves', heldMs: 100, won: false }]);
  expect(store.getState().reputation).toEqual({ koval: 3 });
  expect(store.getState().quests[0]?.objectives[0]?.scene).toContain('questioned the council');
});
