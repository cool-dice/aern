import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Appearance } from '@rift/domain/character';
import { SERVICE_CUT_PERCENT } from '@rift/domain/economy';
import { GUILD_CREATE_GOLD } from '@rift/domain/guild';
import { emptyPoints } from '@rift/domain/stats';
import { loadCatalog } from '@rift/content';
import { expect, test } from 'vitest';
import { compose } from './compose';

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

test('city fees are applied from the live tick, portal, and repair', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  expect(composeSource.includes('ownedCrossingFee(')).toBe(true);
  expect(composeSource.includes('applyOwnedCityFees(')).toBe(true);
  expect(composeSource.includes('creditGuildBank(')).toBe(true);
  expect(composeSource.includes('serviceCut(')).toBe(true);
  expect(composeSource.includes('setCityFee(')).toBe(true);
  expect(dispatch.includes('creditService(')).toBe(true);
  expect(dispatch.includes('setOwnedCityFee(')).toBe(true);
  expect(composeSource.includes("path: '/repair'")).toBe(true);
  expect(composeSource.includes("path: '/city-fee'")).toBe(true);
});

test('a guild-owned city debits the crossing fee and the repair cut', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
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
  await graph.guild.repository.saveWar({
    id: 'war-fort',
    attackerGuildId: guildId,
    cityId: 'fort_humans',
    startsAtMs: 0,
    gold: 0,
    resources: 0,
  });
  let won = false;
  for (let i = 0; i < 7_000 && !won; i += 1) {
    graph.tickOnce();
    const held = graph.state() as { captures: { cityId: string; won: boolean }[] };
    won = held.captures.some((row) => row.cityId === 'fort_humans' && row.won);
  }
  expect(won).toBe(true);

  graph.seedTrader({
    characterId: 'lia',
    gold: 100,
    itemId: 'epic_sword',
    level: 20,
    grade: 'epic',
    durability: 50,
  });
  const portaled = await graph.act('portal', { characterId: 'lia', toNodeId: 'fort_humans' });
  expect(portaled).toMatchObject({
    ok: true,
    value: { nodeId: 'fort_humans', cityFee: 1, gold: 94 },
  });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(1);

  const priced = await graph.act('city_fee', { guildId, cityId: 'fort_humans', fee: 4 });
  expect(priced).toMatchObject({ ok: true, value: { cityFee: 4 } });
  expect(await graph.act('city_fee', { guildId, cityId: 'fort_humans', fee: 0 })).toMatchObject({
    ok: false,
    code: 'fee',
  });

  graph.enterCharacter('account-m1', 'm1');
  const member = await graph.act('portal', { characterId: 'm1', toNodeId: 'fort_humans' });
  expect(member).toMatchObject({
    ok: true,
    value: { cityFee: 4, gold: GUILD_CREATE_GOLD - 9 },
  });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(5);

  const repaired = await graph.act('repair', { characterId: 'lia', itemId: 'epic_sword' });
  expect(repaired).toMatchObject({ ok: true, value: { serviceCut: 3, gold: 64 } });
  expect(SERVICE_CUT_PERCENT).toBe(10);
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(8);
}, 60_000);

test('portal ask is a live route that calls askHostilePortal', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  expect(composeSource.includes('askHostilePortal(')).toBe(true);
  expect(composeSource.includes('askPortal(')).toBe(true);
  expect(composeSource.includes("path: '/portal/ask'")).toBe(true);
  expect(dispatch.includes('askPortal(')).toBe(true);
  expect(app.includes('askPortal(')).toBe(true);
});

test('a neutral asking a hostile city is refused and an enemy is blocked', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
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
  await graph.guild.repository.saveWar({
    id: 'war-fort',
    attackerGuildId: guildId,
    cityId: 'fort_humans',
    startsAtMs: 0,
    gold: 0,
    resources: 0,
  });
  let won = false;
  for (let i = 0; i < 7_000 && !won; i += 1) {
    graph.tickOnce();
    const held = graph.state() as { captures: { cityId: string; won: boolean }[] };
    won = held.captures.some((row) => row.cityId === 'fort_humans' && row.won);
  }
  expect(won).toBe(true);

  graph.enterCharacter('account-noa', 'noa');
  const refused = await graph.act('portal_ask', { characterId: 'noa', toNodeId: 'fort_humans' });
  expect(refused).toMatchObject({ ok: false, code: 'refused' });
  expect(await graph.act('portal', { characterId: 'noa', toNodeId: 'fort_humans' })).toMatchObject({
    ok: false,
    code: 'refused',
  });

  graph.enterCharacter('account-kai', 'kai');
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
  expect(await graph.act('portal_ask', { characterId: 'kai', toNodeId: 'fort_humans' })).toMatchObject({
    ok: false,
    code: 'blocked',
  });

  const granted = await graph.act('portal_grant', { guildId, cityId: 'fort_humans', characterId: 'noa' });
  expect(granted).toMatchObject({ ok: true, value: { granted: true } });
  const entered = await graph.act('portal_ask', { characterId: 'noa', toNodeId: 'fort_humans' });
  expect(entered).toMatchObject({
    ok: true,
    value: { nodeId: 'fort_humans', cityFee: 1, gold: GUILD_CREATE_GOLD - 6 },
  });
}, 60_000);

test('resource node plant is advanced from the tick and visible on the snapshot', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const nodes = readFileSync(new URL('./sim/nodes.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  expect(composeSource.includes('tickResourceNodes(')).toBe(true);
  expect(nodes.includes('advanceResourceNode(')).toBe(true);
  expect(composeSource.includes('resourceNodes,')).toBe(true);
  expect(dispatch.includes('resourceTax(')).toBe(true);
  expect(dispatch.includes('addNodeChest(')).toBe(true);
  expect(composeSource.includes('setNodeTax(')).toBe(true);
});

test('a guild member on a resource node starts the plant timer', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
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
  const before = graph.state() as { resourceNodes: { nodeId: string }[] };
  expect(before.resourceNodes.some((node) => node.nodeId === 'plains_mine')).toBe(true);
  graph.submit({
    commandId: 'south',
    seq: 1,
    issuedAtMs: 0,
    action: 'step_s',
    params: { entityId: 'lia' },
  });
  let plantMs = 0;
  for (let i = 0; i < 400 && plantMs < 100; i += 1) {
    graph.tickOnce();
    const state = graph.state() as {
      self: { nodeId: string | null };
      resourceNodes: { nodeId: string; plantMs: number }[];
    };
    if (state.self.nodeId === 'plains_mine') {
      plantMs = state.resourceNodes.find((node) => node.nodeId === 'plains_mine')?.plantMs ?? 0;
    }
  }
  expect(plantMs).toBeGreaterThanOrEqual(100);
});

test('quest notes from build, chat, and combat carry a subject', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const build = readFileSync(new URL('./modules/build/service.ts', import.meta.url), 'utf8');
  const social = readFileSync(new URL('./modules/social/service.ts', import.meta.url), 'utf8');
  expect(composeSource.includes("note(event.characterId, 'learn', event.subject)")).toBe(true);
  expect(composeSource.includes("note(event.characterId, 'craft', event.subject)")).toBe(true);
  expect(composeSource.includes("note(event.senderId, 'talk', event.subject)")).toBe(true);
  expect(composeSource.includes("note(event.targetId, 'defend', event.subject)")).toBe(true);
  expect(composeSource.includes("note(event.attackerId, 'pvp', event.subject)")).toBe(true);
  expect(composeSource.includes("bus.emit('combat.hit'")).toBe(true);
  expect(build.includes('subject: input.program.templateId')).toBe(true);
  expect(social.includes('subject: input.npcId')).toBe(true);
});

test('a named subject advances that objective and a different unnamed one stays put', async () => {
  const loaded = loadCatalog(join(dirname(fileURLToPath(import.meta.url)), '../../../packages/content/data'));
  const catalog = {
    ...loaded,
    quests: [
      ...loaded.quests,
      {
        id: 'note_probe',
        prototype: true,
        story: false,
        daily: false,
        repeatable: false,
        difficulty: 'easy' as const,
        objectives: [
          { id: 'named_talk', kind: 'talk', target: 1, npcId: 'koval' },
          { id: 'other_talk', kind: 'talk', target: 1 },
          { id: 'named_craft', kind: 'craft', target: 1, itemId: 'ward' },
          { id: 'other_craft', kind: 'craft', target: 1 },
          { id: 'named_learn', kind: 'learn', target: 1, itemId: 'ward' },
          { id: 'other_learn', kind: 'learn', target: 1 },
          { id: 'named_pvp', kind: 'pvp', target: 1, monsterId: 'spore_rat' },
          { id: 'other_pvp', kind: 'pvp', target: 1 },
          { id: 'named_defend', kind: 'defend', target: 1, monsterId: 'spore_rat' },
          { id: 'other_defend', kind: 'defend', target: 1 },
        ],
      },
    ],
  };
  const graph = compose({ nowMs: 1_000, catalog });
  const created = await graph.character.service.create({
    accountId: 'account-cara',
    controller: 'player',
    name: 'Cara',
    clean: true,
    points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
    appearance,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  const characterId = created.value.characterId;
  await graph.character.service.grantXp(characterId, 200_000);
  graph.enterCharacter('account-cara', characterId);
  graph.noteSidecar({ atMs: 10_000_000_000, characterId, action: 'wait' });
  expect((await graph.act('quest_accept', { characterId, questId: 'note_probe' })).ok).toBe(true);
  expect((await graph.act('path_learn', { characterId, templateId: 'ward', grade: 1 })).ok).toBe(true);
  graph.social.service.register({ id: characterId, nodeId: 'fort_humans', language: 'common_light', upy: 100 });
  expect(
    await graph.social.service.say({
      senderId: characterId,
      channel: 'local',
      text: 'hello',
      nowMs: 1_000,
      npcId: 'koval',
    }),
  ).toMatchObject({ ok: true });
  expect((await graph.act('encounter_enter', { characterId })).ok).toBe(true);
  const current = (objectiveId: string): number => {
    const state = graph.state() as {
      players: { id: string; quests: { id: string; objectives: { id: string; current: number }[] }[] }[];
    };
    const player = state.players.find((row) => row.id === characterId);
    const quest = player?.quests.find((row) => row.id === 'note_probe');
    return quest?.objectives.find((row) => row.id === objectiveId)?.current ?? 0;
  };
  const rat = (graph.state() as { entities: { id: string; monsterId: string | null }[] }).entities.find(
    (entity) => entity.monsterId === 'spore_rat',
  );
  expect(rat).toBeDefined();
  const ratHp = (): number | null => {
    const state = graph.state() as { entities: { id: string; hp: number }[] };
    return state.entities.find((entity) => entity.id === rat?.id)?.hp ?? null;
  };
  for (let i = 0; i < 20 && current('named_pvp') < 1 && ratHp() !== null; i += 1) {
    graph.submit({
      commandId: `hit-rat-${String(i)}`,
      seq: 2 + i,
      issuedAtMs: 2_000,
      action: 'attack_ranged',
      targetId: rat?.id,
      params: {
        entityId: characterId,
        weaponDamage: 1,
        range: 8,
        odCost: 0,
        distance: 1,
        pvpOpen: true,
        safeZone: false,
      },
    });
    graph.tickOnce();
    await Promise.resolve();
  }
  for (let i = 0; i < 8 && current('named_defend') < 1; i += 1) {
    graph.submit({
      commandId: `rat-hit-${String(i)}`,
      seq: 40 + i,
      issuedAtMs: 4_000,
      action: 'attack_ranged',
      targetId: characterId,
      params: { entityId: rat?.id, weaponDamage: 4, range: 8, odCost: 0, pvpOpen: true, safeZone: false },
    });
    graph.tickOnce();
    await Promise.resolve();
  }
  expect(current('named_craft')).toBe(1);
  expect(current('other_craft')).toBe(0);
  expect(current('named_learn')).toBe(1);
  expect(current('other_learn')).toBe(0);
  expect(current('named_talk')).toBe(1);
  expect(current('other_talk')).toBe(0);
  expect(current('named_defend')).toBe(1);
  expect(current('other_defend')).toBe(0);
  expect(current('named_pvp')).toBe(1);
  expect(current('other_pvp')).toBe(0);
});
