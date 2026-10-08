import { readFileSync } from 'node:fs';
import type { Appearance } from '@rift/domain/character';
import { PORTAL_BLOCK_MS } from '@rift/domain/economy';
import {
  CITY_CAPTURE_COOLDOWN_MS,
  CONTENDER_CLOSE_MS,
  CONTENDER_GOLD,
  DRAW_WAR_COOLDOWN_MS,
  GUILD_CREATE_GOLD,
  NEUTRAL_CAPTURE_GOLD,
  NOVICE_LOCK_MS,
  NODE_PLANT_MS,
  REVOTE_MS,
  WAR_ASSAULT_MS,
  WAR_FINISH_MS,
  WAR_GOLD,
  WAR_HOLD_MS,
  WAR_LEAD_MS,
  WAR_MUSTER_MS,
  WAR_RESOURCES,
} from '@rift/domain/guild';
import { emptyPoints, type StatBlock } from '@rift/domain/stats';
import { SIM_TICK_MS } from '@rift/domain/time';
import { expect, test } from 'vitest';
import { compose } from './compose';

const founders = [
  { id: 'lia', level: 5, confirmed: true },
  { id: 'm1', level: 5, confirmed: true },
  { id: 'm2', level: 5, confirmed: true },
  { id: 'm3', level: 5, confirmed: true },
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
    gold: GUILD_CREATE_GOLD,
    members: founders,
  });
  expect(created.ok).toBe(true);
  return (created.value as { guildId: string }).guildId;
}

async function winCity(graph: ReturnType<typeof compose>, guildId: string, cityId: string): Promise<void> {
  const startsAtMs = CONTENDER_CLOSE_MS + 1;
  await graph.guild.repository.saveWar({
    id: `war-${cityId}`,
    attackerGuildId: guildId,
    cityId,
    startsAtMs,
    gold: 0,
    resources: 0,
  });
  const guild = await graph.guild.repository.findGuild(guildId);
  if (guild === null) {
    throw new Error('missing guild');
  }
  await graph.guild.repository.saveGuild({ ...guild, bank: (guild.bank ?? 0) + CONTENDER_GOLD });
  const contended = await graph.act('war_contend', { guildId, warId: `war-${cityId}`, characterId: 'lia' });
  expect(contended.ok).toBe(true);
  await graph.skipMs(startsAtMs + WAR_MUSTER_MS);
  await graph.skipMs(WAR_HOLD_MS);
}

test('cycle 10 routes call the domain functions from tickOnce or the live action', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const tickBody = composeSource.slice(
    composeSource.indexOf('async function tickOnce'),
    composeSource.indexOf('function simSnapshot'),
  );
  expect(tickBody.includes('resolveLeaderPolls(')).toBe(true);
  expect(tickBody.includes('inspectRewardFreezes(')).toBe(true);
  expect(tickBody.includes('refreshPortalLifts(')).toBe(true);
  expect(tickBody.includes('sampleBalance(')).toBe(true);
  expect(tickBody.includes('openWarFronts(')).toBe(true);

  const finish = composeSource.slice(
    composeSource.indexOf('async function finishLeaderPoll'),
    composeSource.indexOf('async function castLeaderBallot'),
  );
  expect(finish.includes('castLeaderVote(')).toBe(true);
  expect(finish.includes('voteQuorum(')).toBe(true);
  const ballot = composeSource.slice(
    composeSource.indexOf('async function castLeaderBallot'),
    composeSource.indexOf('async function resolveLeaderPolls'),
  );
  expect(ballot.includes("'stuffed'")).toBe(true);
  expect(ballot.includes("'offline'")).toBe(true);
  expect(ballot.includes('finishLeaderPoll(')).toBe(true);
  expect(ballot.includes('reviewSection11(')).toBe(false);

  const dissolve = composeSource.slice(
    composeSource.indexOf('async function dissolveGuild'),
    composeSource.indexOf('function strikeNode'),
  );
  expect(dissolve.includes('canDissolve(')).toBe(true);
  expect(dissolve.includes('dissolveShares(')).toBe(true);

  const strike = composeSource.slice(
    composeSource.indexOf('function strikeNode'),
    composeSource.indexOf('async function holdWithdrawal'),
  );
  expect(strike.includes('strikeNodeFlag(')).toBe(true);
  expect(strike.includes('settleNodeDrop(')).toBe(false);

  const held = composeSource.slice(
    composeSource.indexOf('async function holdWithdrawal'),
    composeSource.indexOf('async function releaseHeldWithdrawals'),
  );
  expect(held.includes('withdraw(')).toBe(true);
  expect(held.includes('logWithdrawal(')).toBe(true);
  const inspect = composeSource.slice(
    composeSource.indexOf('async function inspectRewardFreezes'),
    composeSource.indexOf('function refreshPortalLifts'),
  );
  expect(inspect.includes('rewardFreezeEnds(')).toBe(true);
  expect(inspect.includes('releaseHeldWithdrawals(')).toBe(true);

  const refresh = composeSource.slice(
    composeSource.indexOf('function refreshPortalLifts'),
    composeSource.indexOf('async function tickOnce'),
  );
  expect(refresh.includes('reviewSection11(')).toBe(true);
  const access = composeSource.slice(
    composeSource.indexOf('function cityServiceAccess'),
    composeSource.indexOf('function portalAccess'),
  );
  expect(access.includes('askHostilePortal(')).toBe(true);
  expect(access.includes('lifted: abuse.portalsLifted.includes(cityId)')).toBe(true);

  const sample = composeSource.slice(
    composeSource.indexOf('async function sampleBalance'),
    composeSource.indexOf('async function declareNeutralCity'),
  );
  expect(sample.includes('measureSection12(')).toBe(true);

  const neutral = composeSource.slice(
    composeSource.indexOf('async function declareNeutralCity'),
    composeSource.indexOf('function rememberDefense'),
  );
  expect(neutral.indexOf('carrierBlocked(')).toBeGreaterThan(-1);
  expect(neutral.indexOf('carrierBlocked(')).toBeLessThan(neutral.indexOf('saveGuild('));
  expect(neutral.indexOf('carrierBlocked(')).toBeLessThan(neutral.indexOf('saveWar('));

  const war = dispatch.slice(dispatch.indexOf('async function guildWar'), dispatch.indexOf('async function guildWithdraw'));
  expect(war.indexOf('carrierBlocked(')).toBeLessThan(war.indexOf('declareNeutralCity('));
  expect(war.indexOf('carrierBlocked(')).toBeLessThan(war.indexOf('ports.guild.declareWar('));
  expect(dispatch.includes('castLeaderBallot(')).toBe(true);
  expect(dispatch.includes('dissolveGuild(')).toBe(true);
  expect(dispatch.includes('strikeNode(')).toBe(true);
  const pull = dispatch.slice(dispatch.indexOf('async function guildWithdraw'), dispatch.indexOf('async function guildRank'));
  expect(pull.includes('rewardsFrozen(')).toBe(true);
  expect(pull.indexOf('holdWithdrawal(')).toBeLessThan(pull.indexOf('ports.guild.withdraw('));
  expect(pull.includes('logWithdrawal(')).toBe(true);

  expect(composeSource.includes("path: '/guild/vote'")).toBe(true);
  expect(composeSource.includes("path: '/guild/dissolve'")).toBe(true);
  expect(composeSource.includes("path: '/node/strike'")).toBe(true);
  expect(app.includes('castLeaderVote(')).toBe(true);
  expect(app.includes('dissolveGuild(')).toBe(true);
  expect(app.includes('strikeNode(')).toBe(true);
  expect(app.includes("kind: 'escort'")).toBe(true);
  expect(app.includes('destinationId:')).toBe(true);
});

test('a leader vote is one ballot per character and an offline carrier cannot vote', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const bot = await graph.character.service.create({
    accountId: 'carrier-1',
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
  const created = await graph.act('guild_create', {
    name: 'Red Wolves',
    tag: 'RW',
    initiatorId: 'lia',
    leaderId: 'lia',
    gold: GUILD_CREATE_GOLD,
    members: [
      { id: 'lia', level: 5, confirmed: true },
      { id: bot.value.characterId, level: 5, confirmed: true },
      { id: 'm2', level: 5, confirmed: true },
      { id: 'm3', level: 5, confirmed: true },
    ],
  });
  expect(created.ok).toBe(true);
  const guildId = (created.value as { guildId: string }).guildId;
  const offline = await graph.act('guild_vote', {
    guildId,
    voterId: bot.value.characterId,
    candidateId: 'lia',
  });
  expect(offline).toMatchObject({ ok: false, code: 'offline' });
  const first = await graph.act('guild_vote', { guildId, voterId: 'm2', candidateId: 'lia' });
  expect(first).toMatchObject({ ok: true, value: { status: 'open', quorum: false } });
  const again = await graph.act('guild_vote', { guildId, voterId: 'm2', candidateId: 'm3' });
  expect(again).toMatchObject({ ok: false, code: 'stuffed' });
  graph.enterWorld(bot.value.characterId);
  const botVote = await graph.act('guild_vote', {
    guildId,
    voterId: bot.value.characterId,
    candidateId: 'lia',
  });
  expect(botVote.ok).toBe(true);
  expect((await graph.guild.repository.findGuild(guildId))?.leaderId).toBe('lia');
});

test('a tied leader vote waits 24 hours and the live route calls the revote', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const guildId = await foundGuild(graph);
  const left = await graph.act('guild_vote', { guildId, voterId: 'm1', candidateId: 'm2' });
  const right = await graph.act('guild_vote', { guildId, voterId: 'm2', candidateId: 'm1' });
  expect(left).toMatchObject({ ok: true, value: { status: 'open', quorum: false } });
  expect(right).toMatchObject({ ok: true, value: { status: 'tie', revote: true } });
  expect((await graph.guild.repository.findGuild(guildId))?.leaderId).toBe('lia');
  await graph.skipMs(REVOTE_MS - SIM_TICK_MS - 1);
  await graph.tickOnce();
  expect((await graph.guild.repository.findGuild(guildId))?.leaderId).toBe('lia');
  await graph.skipMs(1);
  await graph.tickOnce();
  const leaderId = (await graph.guild.repository.findGuild(guildId))?.leaderId;
  expect(leaderId === 'm1' || leaderId === 'm2').toBe(true);
});

test('dissolution pays contribution shares and a leader alone cannot empty the bank', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const guildId = await foundGuild(graph);
  graph.creditGold('lia', 30);
  graph.creditGold('m1', 10);
  expect(await graph.act('guild_deposit', { guildId, characterId: 'lia', amount: 30 })).toMatchObject({
    ok: true,
    value: { contributed: 30 },
  });
  expect(await graph.act('guild_deposit', { guildId, characterId: 'm1', amount: 10 })).toMatchObject({
    ok: true,
    value: { contributed: 10 },
  });
  const alone = await graph.act('guild_dissolve', { guildId, characterId: 'lia' });
  expect(alone).toMatchObject({ ok: false, code: 'confirm' });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(40);
  await graph.skipMs(NOVICE_LOCK_MS);
  expect(await graph.act('guild_rank', { guildId, actorId: 'lia', memberId: 'm1', rank: 'council' })).toMatchObject({
    ok: true,
  });
  expect(await graph.act('guild_rank', { guildId, actorId: 'lia', memberId: 'm2', rank: 'council' })).toMatchObject({
    ok: true,
  });
  expect(await graph.act('guild_dissolve', { guildId, characterId: 'm1' })).toMatchObject({
    ok: false,
    code: 'confirm',
  });
  const dissolved = await graph.act('guild_dissolve', { guildId, characterId: 'm2' });
  expect(dissolved).toMatchObject({
    ok: true,
    value: {
      shares: [
        { id: 'lia', gold: 30 },
        { id: 'm1', gold: 10 },
      ],
      void: 0,
    },
  });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(0);
  expect(graph.economy.service.balance('lia')).toBe(30);
  expect(graph.economy.service.balance('m1')).toBe(10);
});

test('a multibox carrier is refused before the war is saved or charged', async () => {
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
  const created = await graph.act('guild_create', {
    name: 'Red Wolves',
    tag: 'RW',
    initiatorId: 'lia',
    leaderId: 'lia',
    gold: GUILD_CREATE_GOLD,
    members: [
      { id: 'lia', level: 5, confirmed: true },
      { id: first.value.characterId, level: 5, confirmed: true },
      { id: second.value.characterId, level: 5, confirmed: true },
      { id: 'm3', level: 5, confirmed: true },
    ],
  });
  expect(created).toMatchObject({ ok: false, code: 'carrier' });
  expect(await graph.guild.repository.listGuilds()).toEqual([]);
  const seated = await graph.act('guild_create', {
    name: 'Red Wolves',
    tag: 'RW',
    initiatorId: 'lia',
    leaderId: 'lia',
    gold: GUILD_CREATE_GOLD,
    members: [
      { id: 'lia', level: 5, confirmed: true },
      { id: first.value.characterId, level: 5, confirmed: true },
      { id: 'm2', level: 5, confirmed: true },
      { id: 'm3', level: 5, confirmed: true },
    ],
  });
  expect(seated.ok).toBe(true);
  const guildId = (seated.value as { guildId: string }).guildId;
  const funded = await graph.guild.repository.findGuild(guildId);
  if (funded === null) {
    throw new Error('missing guild');
  }
  await graph.guild.repository.saveGuild({
    ...funded,
    bank: 100_000,
    memberIds: [...funded.memberIds, second.value.characterId],
  });
  const declared = await graph.act('guild_war', {
    attackerGuildId: guildId,
    cityId: 'fort_humans',
    leaderConsent: true,
    councilConsents: 2,
    resources: WAR_RESOURCES,
  });
  expect(declared).toMatchObject({ ok: false, code: 'carrier' });
  expect(await graph.guild.repository.listWars()).toEqual([]);
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(100_000);
  expect(NEUTRAL_CAPTURE_GOLD).toBe(25_000);
});

test('a withdrawal during review stays held until a reviewer releases it into the wallet', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
  const guildId = await foundGuild(graph);
  await winCity(graph, guildId, 'fort_humans');
  await graph.skipMs(CITY_CAPTURE_COOLDOWN_MS);
  const guild = await graph.guild.repository.findGuild(guildId);
  if (guild === null) {
    throw new Error('missing guild');
  }
  await graph.guild.repository.saveGuild({ ...guild, bank: 200_000 });
  const quietWar = async () => {
    const declared = await graph.act('guild_war', {
      attackerGuildId: guildId,
      cityId: 'fort_humans',
      leaderConsent: true,
      councilConsents: 2,
      resources: WAR_RESOURCES,
    });
    expect(declared.ok).toBe(true);
    await graph.skipMs(WAR_LEAD_MS + WAR_MUSTER_MS + WAR_ASSAULT_MS + WAR_FINISH_MS);
  };
  await quietWar();
  await graph.skipMs(DRAW_WAR_COOLDOWN_MS);
  const funded = await graph.guild.repository.findGuild(guildId);
  if (funded === null) {
    throw new Error('missing guild');
  }
  await graph.guild.repository.saveGuild({ ...funded, bank: 200_000 });
  await quietWar();
  expect((graph.state() as { abuse: { frozen: string[] } }).abuse.frozen).toContain(guildId);
  const bank = (await graph.guild.repository.findGuild(guildId))?.bank ?? 0;
  const blocked = await graph.act('guild_withdraw', {
    guildId,
    characterId: 'lia',
    amount: Math.floor(bank * 11 / 100),
  });
  expect(blocked).toMatchObject({ ok: false, code: 'confirm' });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(bank);
  const held = await graph.act('guild_withdraw', { guildId, characterId: 'lia', amount: 1 });
  expect(held).toMatchObject({ ok: true, value: { held: true, amount: 1, bank } });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(bank);
  const wallet = graph.economy.service.balance('lia') ?? 0;
  await graph.tickOnce();
  await graph.skipMs(7 * 24 * 60 * 60 * 1000);
  expect((graph.state() as { abuse: { frozen: string[] } }).abuse.frozen).toContain(guildId);
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(bank);
  expect(graph.economy.service.balance('lia')).toBe(wallet);
  const player = await graph.act('guild_review', { guildId, reviewerId: 'lia' });
  expect(player).toMatchObject({ ok: false, code: 'rank' });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(bank);
  graph.appointStaff('mod', 'moderator');
  const released = await graph.act('guild_review', { guildId, reviewerId: 'mod' });
  expect(released).toMatchObject({ ok: true, value: { released: true, guildId } });
  expect((graph.state() as { abuse: { frozen: string[] } }).abuse.frozen).not.toContain(guildId);
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(bank - 1);
  expect(graph.economy.service.balance('lia')).toBe(wallet + 1);
  expect(WAR_GOLD).toBe(50_000);
});

test('taking the flag down pockets the chest and does not leave it for the next planter', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
  const guildId = await foundGuild(graph);
  graph.place('lia', 'plains_mine');
  await graph.skipMs(NODE_PLANT_MS);
  expect(await graph.act('node_tax', { guildId, nodeId: 'plains_mine', characterId: 'lia', taxPercent: 30 })).toMatchObject({
    ok: true,
  });
  let chest = 0;
  for (let attempt = 0; attempt < 12 && chest === 0; attempt += 1) {
    await graph.act('gather', {
      characterId: 'lia',
      nodeId: 'spring',
      tool: 'basic',
      toolKind: 'flask',
    });
    chest =
      (graph.state() as { resourceNodes: { nodeId: string; chest: number }[] }).resourceNodes.find(
        (node) => node.nodeId === 'plains_mine',
      )?.chest ?? 0;
    if (chest === 0) {
      await graph.skipMs(30 * 60 * 1000);
    }
  }
  expect(chest).toBeGreaterThan(0);
  const novice = await graph.act('node_strike', { guildId, nodeId: 'plains_mine', characterId: 'm2' });
  expect(novice).toMatchObject({ ok: false, code: 'rank' });
  const struck = await graph.act('node_strike', { guildId, nodeId: 'plains_mine', characterId: 'lia' });
  expect(struck).toMatchObject({ ok: true, value: { pocketed: chest, guildId: null } });
  const state = graph.state() as {
    resourceNodes: { nodeId: string; guildId: string | null; chest: number }[];
    guildVaults: { guildId: string; amount: number }[];
  };
  expect(state.resourceNodes.find((node) => node.nodeId === 'plains_mine')).toMatchObject({
    guildId: null,
    chest: 0,
  });
  expect(state.guildVaults.find((row) => row.guildId === guildId)?.amount).toBe(chest);
});

test('the section 11 tick lifts a 24 hour portal block for a neutral', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
  const guildId = await foundGuild(graph);
  await winCity(graph, guildId, 'fort_humans');
  await graph.skipMs(PORTAL_BLOCK_MS - 1);
  expect((graph.state() as { abuse: { portalsLifted: string[] } }).abuse.portalsLifted).not.toContain('fort_humans');
  await graph.skipMs(1);
  expect((graph.state() as { abuse: { portalsLifted: string[] } }).abuse.portalsLifted).toContain('fort_humans');
  graph.enterWorld('neo', 'obsidian_tower');
  expect(graph.cityService('neo', 'fort_humans', 'portal').ok).toBe(true);
});

test('tickOnce records section 12 targets without refusing play', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  await graph.tickOnce();
  const balance = (graph.state() as { balance: { warsPerDay: { observed: number | null; onTarget: boolean | null } } | null }).balance;
  expect(balance).not.toBeNull();
  expect(balance?.warsPerDay.observed).toBe(0);
  expect(balance?.warsPerDay.onTarget).toBe(false);
});
