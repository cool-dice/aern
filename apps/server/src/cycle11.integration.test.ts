import { readFileSync } from 'node:fs';
import type { Appearance } from '@rift/domain/character';
import {
  GUILD_CREATE_GOLD,
  INTERNAL_VOTE_MS,
  LEADER_ABSENCE_MS,
  WITHDRAW_ITEMS,
} from '@rift/domain/guild';
import { emptyPoints, type StatBlock } from '@rift/domain/stats';
import { expect, test } from 'vitest';
import { compose } from './compose';

const founders = [
  { id: 'lia', level: 5 },
  { id: 'm1', level: 5 },
  { id: 'm2', level: 5 },
  { id: 'm3', level: 5 },
];

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

function fighterPoints(): StatBlock {
  return { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 };
}

async function foundGuild(graph: ReturnType<typeof compose>, name = 'Red Wolves', tag = 'RW'): Promise<string> {
  const created = await graph.act('guild_create', {
    name,
    tag,
    initiatorId: 'lia',
    leaderId: 'lia',
    emblem: 'wolf',
    description: 'the red pack',
    gold: GUILD_CREATE_GOLD,
    members: founders,
  });
  expect(created.ok).toBe(true);
  return (created.value as { guildId: string }).guildId;
}

test('cycle 11 hooks are called from tickOnce, skipMs, or the live route', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const tickBody = composeSource.slice(
    composeSource.indexOf('async function tickOnce'),
    composeSource.indexOf('function simSnapshot'),
  );
  const skipBody = composeSource.slice(
    composeSource.indexOf('async function skipMs'),
    composeSource.indexOf('function guardAllies'),
  );
  for (const hook of [
    'openWarFronts(',
    'resolveLeaderPolls(',
    'resolveInternalPolls(',
    'relieveAbsentLeaders(',
    'inspectRewardFreezes(',
    'refreshPortalLifts(',
    'sampleBalance(',
  ]) {
    expect(tickBody.includes(hook)).toBe(true);
    expect(skipBody.includes(hook)).toBe(true);
  }
  const finish = composeSource.slice(
    composeSource.indexOf('async function finishLeaderPoll'),
    composeSource.indexOf('async function castLeaderBallot'),
  );
  expect(finish.includes('ranks')).toBe(true);
  expect(finish.includes('castLeaderVote(')).toBe(true);
  const internal = composeSource.slice(
    composeSource.indexOf('async function castInternalBallot'),
    composeSource.indexOf('async function resolveInternalPolls'),
  );
  expect(internal.includes('closeInternalVote(')).toBe(false);
  const resolve = composeSource.slice(
    composeSource.indexOf('async function resolveInternalPolls'),
    composeSource.indexOf('function onlineMember'),
  );
  expect(resolve.includes('closeInternalVote(')).toBe(true);
  const relieve = composeSource.slice(
    composeSource.indexOf('async function relieveAbsentLeaders'),
    composeSource.indexOf('async function transferLeader'),
  );
  expect(relieve.includes('succeedAbsentLeader(')).toBe(true);
  const payout = composeSource.slice(
    composeSource.indexOf('async function payDissolution'),
    composeSource.indexOf('function strikeNode'),
  );
  expect(payout.includes('dissolveHoldings(')).toBe(true);
  expect(payout.includes('dissolveShares(')).toBe(true);
  const release = composeSource.slice(
    composeSource.indexOf('async function releaseHeldWithdrawals'),
    composeSource.indexOf('async function inspectRewardFreezes'),
  );
  expect(release.includes('creditWithdrawal(')).toBe(true);
  const create = dispatch.slice(
    dispatch.indexOf('async function guildCreate'),
    dispatch.indexOf('async function auctionBid'),
  );
  expect(create.indexOf('carriersBlocked(')).toBeLessThan(create.indexOf('ports.guild.create('));
  expect(create.includes('seatCharter(')).toBe(true);
  expect(create.includes('seatFounders(')).toBe(false);
  expect(create.includes('leadershipBlocked(')).toBe(true);
  const join = dispatch.slice(dispatch.indexOf("case 'guild_join'"), dispatch.indexOf("case 'guild_dissolve'"));
  expect(join.includes('joinGuild(')).toBe(true);
  const pull = dispatch.slice(
    dispatch.indexOf('async function guildWithdraw'),
    dispatch.indexOf('async function guildRank'),
  );
  expect(pull.includes('itemAmount')).toBe(true);
  expect(pull.includes('resourceAmount')).toBe(true);
  expect(pull.includes('creditWithdrawal(')).toBe(true);
  expect(pull.includes('ports.guild.withdraw(')).toBe(true);
});

test('an internal ballot stays open for 24 hours and the leader breaks the tie', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const guildId = await foundGuild(graph);
  const yes = await graph.act('guild_vote', { guildId, voterId: 'm1', choice: 'yes' });
  const no = await graph.act('guild_vote', { guildId, voterId: 'm2', choice: 'no' });
  const later = await graph.act('guild_vote', { guildId, voterId: 'm3', choice: 'later' });
  const leader = await graph.act('guild_vote', { guildId, voterId: 'lia', choice: 'yes' });
  expect(yes).toMatchObject({ ok: true, value: { status: 'open' } });
  expect(no.ok && later.ok && leader.ok).toBe(true);
  await graph.skipMs(INTERNAL_VOTE_MS - 1);
  const early = graph.state() as { motions: { closed: boolean }[] };
  expect(early.motions[0]?.closed).toBe(false);
  await graph.skipMs(1);
  const closed = graph.state() as { motions: { closed: boolean; result: { status: string; choice?: string; by?: string } }[] };
  expect(closed.motions[0]).toMatchObject({
    closed: true,
    result: { status: 'passed', choice: 'yes', by: 'leader' },
  });
});

test('fourteen days of leader absence dissolves a guild with no council and no officers', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const guildId = await foundGuild(graph);
  graph.creditGold('lia', 40);
  graph.creditGold('m1', 10);
  expect(await graph.act('guild_deposit', { guildId, characterId: 'lia', amount: 30, resources: 4, resourceId: 'metal' })).toMatchObject({
    ok: true,
    value: { contributed: 30, resources: 4 },
  });
  expect(await graph.act('guild_deposit', { guildId, characterId: 'm1', amount: 10 })).toMatchObject({
    ok: true,
  });
  graph.ai.service.onCarrierOffline('lia');
  await graph.skipMs(LEADER_ABSENCE_MS - 1);
  expect((await graph.guild.repository.findGuild(guildId))?.leaderId).toBe('lia');
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(40);
  await graph.skipMs(1);
  const gone = await graph.guild.repository.findGuild(guildId);
  expect(gone?.bank).toBe(0);
  expect(gone?.memberIds).toEqual([]);
  expect(graph.economy.service.balance('lia')).toBe(40);
  expect(graph.economy.service.balance('m1')).toBe(10);
});

test('a second bot of one carrier is refused on create and on join', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const first = await graph.character.service.create({
    accountId: 'carrier-1',
    controller: 'bot',
    name: 'Хвост',
    clean: false,
    points: fighterPoints(),
    appearance,
  });
  const second = await graph.character.service.create({
    accountId: 'carrier-1',
    controller: 'bot',
    name: 'Клык',
    clean: false,
    points: fighterPoints(),
    appearance,
  });
  expect(first.ok && second.ok).toBe(true);
  if (!first.ok || !second.ok) {
    return;
  }
  const refused = await graph.act('guild_create', {
    name: 'Red Wolves',
    tag: 'RW',
    initiatorId: 'lia',
    leaderId: 'lia',
    gold: GUILD_CREATE_GOLD,
    members: [
      { id: 'lia', level: 5 },
      { id: first.value.characterId, level: 5 },
      { id: second.value.characterId, level: 5 },
      { id: 'm3', level: 5 },
    ],
  });
  expect(refused).toMatchObject({ ok: false, code: 'carrier' });
  const guildId = await foundGuild(graph);
  const joined = await graph.act('guild_join', {
    guildId,
    actorId: 'lia',
    characterId: first.value.characterId,
  });
  expect(joined).toMatchObject({ ok: true, value: { rank: 'novice' } });
  const again = await graph.act('guild_join', {
    guildId,
    actorId: 'lia',
    characterId: second.value.characterId,
  });
  expect(again).toMatchObject({ ok: false, code: 'carrier' });
  const members = (await graph.guild.repository.findGuild(guildId))?.memberIds ?? [];
  expect(members.includes(second.value.characterId)).toBe(false);
});

test('a guild that does not own the node can strike the flag and pocket the chest', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterWorld('lia', 'plains_mine');
  graph.enterCharacter('account-lia', 'lia');
  graph.enterCharacter('account-kai', 'kai');
  const wolves = await foundGuild(graph);
  graph.creditGold('kai', GUILD_CREATE_GOLD);
  const ash = await graph.act('guild_create', {
    name: 'Ash Guard',
    tag: 'ASH',
    initiatorId: 'kai',
    leaderId: 'kai',
    gold: GUILD_CREATE_GOLD,
    members: [
      { id: 'kai', level: 5 },
      { id: 'a1', level: 5 },
      { id: 'a2', level: 5 },
      { id: 'a3', level: 5 },
    ],
  });
  expect(ash.ok).toBe(true);
  const ashId = (ash.value as { guildId: string }).guildId;
  await graph.skipMs(60_000);
  const before = graph.state() as { resourceNodes: { nodeId: string; guildId: string | null; chest: number }[] };
  const chest = before.resourceNodes.find((row) => row.nodeId === 'plains_mine');
  expect(chest?.guildId).toBe(wolves);
  const struck = await graph.act('node_strike', { guildId: ashId, nodeId: 'plains_mine', characterId: 'kai' });
  expect(struck).toMatchObject({ ok: true, value: { pocketed: chest?.chest ?? -1, guildId: null } });
  const state = graph.state() as {
    resourceNodes: { nodeId: string; guildId: string | null; chest: number }[];
    guildVaults: { guildId: string; amount: number }[];
  };
  expect(state.resourceNodes.find((row) => row.nodeId === 'plains_mine')).toMatchObject({
    guildId: null,
    chest: 0,
  });
  expect(state.guildVaults.find((row) => row.guildId === wolves)?.amount ?? 0).toBe(0);
  if ((chest?.chest ?? 0) > 0) {
    expect(state.guildVaults.find((row) => row.guildId === ashId)?.amount).toBe(chest?.chest);
  }
});

test('fourteen days of absence transfers the seat to the senior council member', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const guildId = await foundGuild(graph);
  expect(await graph.act('guild_rank', { guildId, actorId: 'lia', memberId: 'm1', rank: 'council' })).toMatchObject({
    ok: true,
  });
  await graph.skipMs(1_000);
  expect(await graph.act('guild_rank', { guildId, actorId: 'lia', memberId: 'm2', rank: 'council' })).toMatchObject({
    ok: true,
  });
  graph.ai.service.onCarrierOffline('lia');
  await graph.skipMs(LEADER_ABSENCE_MS);
  expect((await graph.guild.repository.findGuild(guildId))?.leaderId).toBe('m1');
  expect((await graph.guild.repository.findGuild(guildId))?.memberIds).toContain('lia');
});

test('an AI cannot take a second leadership post', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const bot = await graph.character.service.create({
    accountId: 'carrier-2',
    controller: 'bot',
    name: 'Хвост',
    clean: false,
    points: fighterPoints(),
    appearance,
  });
  expect(bot.ok).toBe(true);
  if (!bot.ok) {
    return;
  }
  const guildId = await foundGuild(graph);
  const joined = await graph.act('guild_join', {
    guildId,
    actorId: 'lia',
    characterId: bot.value.characterId,
  });
  expect(joined.ok).toBe(true);
  const { NOVICE_LOCK_MS } = await import('@rift/domain/guild');
  await graph.skipMs(NOVICE_LOCK_MS);
  expect(
    await graph.act('guild_rank', { guildId, actorId: 'lia', memberId: bot.value.characterId, rank: 'officer' }),
  ).toMatchObject({ ok: true });
  graph.creditGold('lia', GUILD_CREATE_GOLD);
  const second = await graph.act('guild_create', {
    name: 'Ash Guard',
    tag: 'ASH',
    initiatorId: 'lia',
    leaderId: bot.value.characterId,
    gold: GUILD_CREATE_GOLD,
    members: [
      { id: bot.value.characterId, level: 5 },
      { id: 'lia', level: 5 },
      { id: 'm2', level: 5 },
      { id: 'm3', level: 5 },
    ],
  });
  expect(second).toMatchObject({ ok: false, code: 'limit' });
  expect(await graph.guild.repository.listGuilds()).toHaveLength(1);
});

test('the charter stores an emblem and description, and withdraw caps items', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const guildId = await foundGuild(graph);
  const stored = await graph.guild.repository.findGuild(guildId);
  expect(stored?.emblem).toBe('wolf');
  expect(stored?.description).toBe('the red pack');
  expect(WITHDRAW_ITEMS.leader).toBe(10);
  graph.seedTrader({ characterId: 'lia', gold: 100, itemId: 'blade', qty: 11 });
  const deposited = await graph.act('guild_deposit', {
    guildId,
    characterId: 'lia',
    amount: 1,
    itemId: 'blade',
    itemQty: 11,
  });
  expect(deposited.ok).toBe(true);
  const over = await graph.act('guild_withdraw', {
    guildId,
    characterId: 'lia',
    amount: 0,
    itemAmount: 11,
  });
  expect(over).toMatchObject({ ok: false, code: 'limit' });
  const taken = await graph.act('guild_withdraw', {
    guildId,
    characterId: 'lia',
    amount: 0,
    itemAmount: 10,
  });
  expect(taken.ok).toBe(true);
  const extra = await graph.act('guild_withdraw', {
    guildId,
    characterId: 'lia',
    amount: 0,
    itemAmount: 1,
  });
  expect(extra).toMatchObject({ ok: false, code: 'limit' });
});
