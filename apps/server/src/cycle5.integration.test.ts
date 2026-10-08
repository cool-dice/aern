import { readFileSync } from 'node:fs';
import { CONTENDER_CLOSE_MS, CONTENDER_GOLD, GUILD_CREATE_GOLD, WAR_MUSTER_MS } from '@rift/domain/guild';
import { expect, test } from 'vitest';
import { compose } from './compose';

test('portal and shared dungeon are live actions the play session posts', () => {
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const economy = readFileSync(new URL('./modules/economy/service.ts', import.meta.url), 'utf8');
  expect(dispatch.includes('portalTo(')).toBe(true);
  expect(dispatch.includes('assignGuild(')).toBe(true);
  expect(composeSource.includes("path: '/portal'")).toBe(true);
  expect(composeSource.includes('economy.service.portal(')).toBe(true);
  expect(composeSource.includes('seedPortals(')).toBe(true);
  expect(economy.includes('portalFee(')).toBe(true);
  expect(dispatch.includes('party?.leaderId')).toBe(true);
  expect(composeSource.includes('dungeonRooms:')).toBe(true);
});

test('a portal charges the same-side fee and then waits out the cooldown', async () => {
  const graph = compose({ nowMs: 1_000 });
  graph.enterCharacter('account-lia', 'lia');
  const paid = await graph.act('portal', { characterId: 'lia', toNodeId: 'fort_humans' });
  expect(paid).toMatchObject({
    ok: true,
    value: { nodeId: 'fort_humans', gold: GUILD_CREATE_GOLD - 5, cooldownUntilMs: 1_000 + 300_000 },
  });
  expect(graph.state().self).toMatchObject({ nodeId: 'fort_humans', gold: GUILD_CREATE_GOLD - 5 });
  expect(await graph.act('portal', { characterId: 'lia', toNodeId: 'fort_humans' })).toMatchObject({
    ok: false,
    code: 'cooldown',
  });
});

test('two characters with one seed share a layout and a solo edge does not', async () => {
  const graph = compose({ nowMs: 5_000 });
  graph.enterCharacter('account-lia', 'lia');
  graph.enterCharacter('account-kai', 'kai');
  graph.enterCharacter('account-noa', 'noa');
  const shared = {
    nodeId: 'light_dungeon',
    edgeId: 'edge_light__fort_humans',
    groupId: 'party',
    partySize: 2,
  };
  const first = await graph.act('dungeon_enter', { characterId: 'lia', ...shared });
  const second = await graph.act('dungeon_enter', { characterId: 'kai', ...shared });
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  const firstValue = first.value as { instanceId: string; rooms: { id: number }[] };
  const secondValue = second.value as { instanceId: string; rooms: { id: number }[] };
  expect(secondValue.instanceId).toBe(firstValue.instanceId);
  expect(secondValue.rooms).toEqual(firstValue.rooms);
  const placed = graph.state() as {
    players: { id: string; dungeonId: string | null; dungeonRooms: { id: number; x: number; y: number }[] }[];
  };
  const lia = placed.players.find((player) => player.id === 'lia');
  const kai = placed.players.find((player) => player.id === 'kai');
  expect(lia?.dungeonId).toBe(firstValue.instanceId);
  expect(kai?.dungeonId).toBe(firstValue.instanceId);
  expect(kai?.dungeonRooms).toEqual(lia?.dungeonRooms);
  expect(lia?.dungeonRooms.length).toBeGreaterThan(0);
  const solo = await graph.act('dungeon_enter', {
    characterId: 'noa',
    nodeId: 'light_dungeon',
    edgeId: 'solo_edge',
    groupId: 'noa',
    partySize: 1,
  });
  expect(solo.ok).toBe(true);
  expect((solo.value as { instanceId: string }).instanceId).not.toBe(firstValue.instanceId);
});

test('the tick accrues a guild hold that the client snapshot can read', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.enterCharacter('account-kai', 'kai');
  const created = await graph.act('guild_create', {
    name: 'Red Wolves',
    tag: 'RW',
    initiatorId: 'lia',
    leaderId: 'lia',
    gold: GUILD_CREATE_GOLD,
    members: [
      { id: 'lia', level: 5 },
      { id: 'm1', level: 5 },
      { id: 'm2', level: 5 },
      { id: 'm3', level: 5 },
    ],
  });
  expect(created.ok).toBe(true);
  const guildId = (created.value as { guildId: string }).guildId;
  const startsAtMs = CONTENDER_CLOSE_MS + 1;
  await graph.guild.repository.saveWar({
    id: 'war-fort',
    attackerGuildId: guildId,
    cityId: 'fort_humans',
    startsAtMs,
    gold: 0,
    resources: 0,
  });
  const funded = await graph.guild.repository.findGuild(guildId);
  if (funded === null) {
    throw new Error('missing guild');
  }
  await graph.guild.repository.saveGuild({ ...funded, bank: CONTENDER_GOLD });
  expect(await graph.act('war_contend', { guildId, warId: 'war-fort', characterId: 'lia' })).toMatchObject({
    ok: true,
  });
  await graph.skipMs(startsAtMs + WAR_MUSTER_MS);
  graph.tickOnce();
  graph.tickOnce();
  const held = graph.state() as {
    captures: { cityId: string; guildId: string | null; heldMs: number; won: boolean }[];
  };
  expect(held.captures).toEqual([
    { cityId: 'fort_humans', guildId, heldMs: 200, won: false, ownerGuildId: null },
  ]);
  const rival = await graph.act('guild_create', {
    name: 'Ash Keepers',
    tag: 'ASH',
    initiatorId: 'kai',
    leaderId: 'kai',
    gold: GUILD_CREATE_GOLD,
    members: [
      { id: 'kai', level: 5 },
      { id: 'n1', level: 5 },
      { id: 'n2', level: 5 },
      { id: 'n3', level: 5 },
    ],
  });
  expect(rival.ok).toBe(true);
  graph.tickOnce();
  const reset = graph.state() as { captures: { heldMs: number; won: boolean; guildId: string | null }[] };
  expect(reset.captures[0]).toMatchObject({ heldMs: 0, won: false, guildId: null });
});
