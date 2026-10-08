import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { createClientStore } from '../state/store';
import { completeTrade, startCraft, type LiveResponse } from './live';

const here = dirname(fileURLToPath(import.meta.url));

test('the play screen posts craft and trade through App', () => {
  const app = readFileSync(join(here, '../App.tsx'), 'utf8');
  expect(app).toContain('startCraft(');
  expect(app).toContain('completeTrade(');
  expect(app).toContain('onCraft=');
  expect(app).toContain('onTrade=');
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
