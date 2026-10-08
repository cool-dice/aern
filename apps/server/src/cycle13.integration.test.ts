import { readFileSync } from 'node:fs';
import { GUILD_CREATE_GOLD } from '@rift/domain/guild';
import { expect, test } from 'vitest';
import { compose } from './compose';

const founders = [
  { id: 'lia', level: 5, confirmed: true },
  { id: 'm1', level: 5, confirmed: true },
  { id: 'm2', level: 5, confirmed: true },
  { id: 'm3', level: 5, confirmed: true },
];

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

test('doctrine, bank rows, withdrawal confirms, halls, and contracts are on the live path', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const live = readFileSync(new URL('../../client/src/play/live.ts', import.meta.url), 'utf8');
  const tickBody = composeSource.slice(
    composeSource.indexOf('async function tickOnce'),
    composeSource.indexOf('function simSnapshot'),
  );
  expect(tickBody.includes('stampGuildDoctrines(')).toBe(true);
  const doctrine = composeSource.slice(
    composeSource.indexOf('async function changeDoctrine'),
    composeSource.indexOf('async function postBoardContract'),
  );
  expect(doctrine.includes('setDoctrine(')).toBe(true);
  expect(doctrine.includes('leaderConfirm')).toBe(true);
  expect(doctrine.includes('councilConfirms')).toBe(true);
  expect(doctrine.includes("code: 'confirm'")).toBe(true);
  expect(doctrine.includes("code: 'rank'")).toBe(true);
  const bank = composeSource.slice(
    composeSource.indexOf('function readBankLog'),
    composeSource.indexOf('function doctrineStocks'),
  );
  expect(bank.includes('operations: bankOperations')).toBe(true);
  expect(bank.includes('bankLog.length')).toBe(false);
  const board = composeSource.slice(
    composeSource.indexOf('async function postBoardContract'),
    composeSource.indexOf('function visibleContracts'),
  );
  expect(board.includes('postContract(')).toBe(true);
  expect(board.includes('countedInQuests: false')).toBe(true);
  expect(board.includes('untilMs')).toBe(false);
  const hall = composeSource.slice(
    composeSource.indexOf('function registerAtHall'),
    composeSource.indexOf('function screenGuildCreate'),
  );
  expect(hall.includes('node?.place')).toBe(true);
  expect(hall.includes("place: 'hall'")).toBe(false);
  expect(hall.includes('registrationPlace(')).toBe(true);
  expect(dispatch.includes("case 'guild_doctrine'")).toBe(true);
  expect(dispatch.includes('changeDoctrine(')).toBe(true);
  expect(dispatch.includes("case 'guild_bank'")).toBe(true);
  expect(dispatch.includes('readBankLog(')).toBe(true);
  expect(dispatch.includes("case 'contract_post'")).toBe(true);
  expect(dispatch.includes('postBoardContract(')).toBe(true);
  expect(composeSource.includes("path: '/guild/doctrine'")).toBe(true);
  expect(composeSource.includes("path: '/guild/bank'")).toBe(true);
  expect(composeSource.includes("path: '/contract'")).toBe(true);
  const pull = dispatch.slice(
    dispatch.indexOf('async function guildWithdraw'),
    dispatch.indexOf('async function guildRank'),
  );
  expect(pull.includes('leaderConfirm')).toBe(true);
  expect(pull.includes('councilConfirms')).toBe(true);
  expect(pull.includes('councilVote')).toBe(true);
  expect(app.includes('postDoctrine(')).toBe(true);
  expect(app.includes('readBankLog(')).toBe(true);
  expect(app.includes('postContractBoard(')).toBe(true);
  expect(app.includes('amount: 26')).toBe(true);
  expect(app.includes('bank: 100')).toBe(true);
  expect(live.includes('leaderConfirm')).toBe(true);
  expect(live.includes('councilConfirms')).toBe(true);
  expect(live.includes('councilVote')).toBe(true);
});

test('setDoctrine spends the fury cost only after the leader and a seated council confirm', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const guildId = await foundGuild(graph);
  expect(await graph.act('guild_rank', { guildId, actorId: 'lia', memberId: 'm2', rank: 'officer' })).toMatchObject({
    ok: true,
  });
  expect(
    await graph.act('guild_doctrine', {
      guildId,
      characterId: 'm2',
      doctrine: 'fury',
      leaderConfirm: true,
      councilConfirms: 1,
    }),
  ).toMatchObject({ ok: false, code: 'rank' });
  expect(
    await graph.act('guild_doctrine', {
      guildId,
      characterId: 'lia',
      doctrine: 'fury',
      leaderConfirm: true,
      councilConfirms: 1,
    }),
  ).toMatchObject({ ok: false, code: 'confirm' });
  expect(await graph.act('guild_rank', { guildId, actorId: 'lia', memberId: 'm1', rank: 'council' })).toMatchObject({
    ok: true,
  });
  expect(await graph.act('guild_doctrine', { guildId, characterId: 'lia', doctrine: 'fury' })).toMatchObject({
    ok: false,
    code: 'confirm',
  });
  expect(
    await graph.act('guild_doctrine', {
      guildId,
      characterId: 'lia',
      doctrine: 'fury',
      leaderConfirm: true,
      councilConfirms: 2,
    }),
  ).toMatchObject({ ok: false, code: 'confirm' });
  await graph.materialQty('lia', 'metal');
  await graph.creditMaterial('lia', 'metal', 500);
  graph.creditGold('lia', 50_000);
  expect(
    await graph.act('guild_deposit', {
      guildId,
      characterId: 'lia',
      amount: 50_000,
      resources: 500,
      resourceId: 'metal',
    }),
  ).toMatchObject({ ok: true });
  const changed = await graph.act('guild_doctrine', {
    guildId,
    characterId: 'lia',
    doctrine: 'fury',
    leaderConfirm: true,
    councilConfirms: 1,
  });
  expect(changed).toMatchObject({
    ok: true,
    value: { doctrine: 'fury', affects: 'damage', multiplier: 1.05, bank: 0 },
  });
  expect(
    await graph.act('guild_doctrine', {
      guildId,
      characterId: 'lia',
      doctrine: 'greed',
      leaderConfirm: true,
      councilConfirms: 1,
    }),
  ).toMatchObject({ ok: false, code: 'cooldown' });
  await graph.tickOnce();
  const self = graph.state().self as { id: string };
  expect(self.id).toBe('lia');
});

test('guild members read bank operation rows, and a large withdrawal needs the confirm flags', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const guildId = await foundGuild(graph);
  graph.creditGold('lia', 100);
  expect(await graph.act('guild_deposit', { guildId, characterId: 'lia', amount: 40 })).toMatchObject({
    ok: true,
  });
  const funded = await graph.guild.repository.findGuild(guildId);
  if (funded === null) {
    throw new Error('missing guild');
  }
  await graph.guild.repository.saveGuild({ ...funded, bank: 100 });
  expect(await graph.act('guild_bank', { guildId, characterId: 'ghost' })).toMatchObject({
    ok: false,
    code: 'member',
  });
  expect(await graph.act('guild_rank', { guildId, actorId: 'lia', memberId: 'm3', rank: 'novice' })).toMatchObject({
    ok: true,
  });
  const logged = await graph.act('guild_bank', { guildId, characterId: 'm3' });
  expect(logged.ok).toBe(true);
  const operations = (logged.value as { operations: { op: string; amount: number; guildId: string }[] }).operations;
  expect(operations.some((row) => row.op === 'deposit' && row.amount === 40 && row.guildId === guildId)).toBe(true);
  const bare = await graph.act('guild_withdraw', { guildId, characterId: 'lia', amount: 11 });
  expect(bare).toMatchObject({ ok: false, code: 'confirm' });
  const mid = await graph.act('guild_withdraw', {
    guildId,
    characterId: 'lia',
    amount: 11,
    leaderConfirm: true,
    councilConfirms: 2,
  });
  expect(mid.ok).toBe(true);
  const over = await graph.act('guild_withdraw', {
    guildId,
    characterId: 'lia',
    amount: 26,
    leaderConfirm: true,
    councilConfirms: 2,
  });
  expect(over).toMatchObject({ ok: false, code: 'confirm' });
  const stored = await graph.guild.repository.findGuild(guildId);
  if (stored === null) {
    throw new Error('missing guild');
  }
  await graph.guild.repository.saveGuild({ ...stored, bank: 100 });
  const voted = await graph.act('guild_withdraw', {
    guildId,
    characterId: 'lia',
    amount: 26,
    leaderConfirm: true,
    councilConfirms: 2,
    councilVote: true,
  });
  expect(voted.ok).toBe(true);
  const again = await graph.act('guild_bank', { guildId, characterId: 'lia' });
  const rows = (again.value as { operations: { op: string; amount: number }[] }).operations;
  expect(rows.some((row) => row.op === 'withdraw' && row.amount === 26)).toBe(true);
  const stateRows = graph.state().bankOperations as { op: string; amount: number }[];
  expect(Array.isArray(stateRows)).toBe(true);
  expect(stateRows.some((row) => row.op === 'deposit')).toBe(true);
  expect(typeof graph.state().bankOperations).not.toBe('number');
});

test('racial cities register at a hall, and a claimed hall on a bare city is refused', async () => {
  const market = compose({ nowMs: 0 });
  market.enterCharacter('account-lia', 'lia');
  market.place('lia', 'plains_market');
  expect(market.characterNode('lia')).toBe('plains_market');
  expect(
    await market.act('guild_create', {
      name: 'Red Wolves',
      tag: 'RW',
      initiatorId: 'lia',
      leaderId: 'lia',
      gold: GUILD_CREATE_GOLD,
      place: 'hall',
      members: founders,
    }),
  ).toMatchObject({ ok: false, code: 'place' });
  const marketGuild = await market.act('guild_create', {
    name: 'Red Wolves',
    tag: 'RW',
    initiatorId: 'lia',
    leaderId: 'lia',
    gold: GUILD_CREATE_GOLD,
    members: founders,
  });
  expect(marketGuild.ok).toBe(true);

  const hall = compose({ nowMs: 0 });
  hall.enterCharacter('account-lia', 'lia');
  hall.place('lia', 'fort_humans');
  expect(
    await hall.act('guild_create', {
      name: 'Ash Guard',
      tag: 'ASH',
      initiatorId: 'lia',
      leaderId: 'lia',
      gold: GUILD_CREATE_GOLD,
      place: 'city',
      members: founders,
    }),
  ).toMatchObject({ ok: false, code: 'place' });
  hall.place('lia', 'fort_humans_hall');
  expect(hall.characterNode('lia')).toBe('fort_humans_hall');
  const guildId = await foundGuild(hall);
  expect(guildId.length).toBeGreaterThan(0);

  const mine = compose({ nowMs: 0 });
  mine.enterCharacter('account-lia', 'lia');
  mine.place('lia', 'plains_mine');
  expect(
    await mine.act('guild_create', {
      name: 'Red Wolves',
      tag: 'RW',
      initiatorId: 'lia',
      leaderId: 'lia',
      gold: GUILD_CREATE_GOLD,
      members: founders,
    }),
  ).toMatchObject({ ok: false, code: 'place' });
});

test('the contract board posts from a city and hides a kill bounty from other guilds', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-out', 'out');
  graph.enterCharacter('account-lia', 'lia');
  const guildId = await foundGuild(graph);
  const before = (graph.state().quests as unknown[]).length;
  expect(
    await graph.act('contract_post', {
      characterId: 'lia',
      type: 'kill',
      rewardGold: 100,
      targetLevel: 9,
    }),
  ).toMatchObject({ ok: false, code: 'target' });
  expect(
    await graph.act('contract_post', {
      characterId: 'lia',
      type: 'kill',
      rewardGold: 0,
      targetLevel: 10,
      targetIsMember: false,
    }),
  ).toMatchObject({ ok: false, code: 'gold' });
  graph.place('lia', 'plains_mine');
  expect(
    await graph.act('contract_post', {
      characterId: 'lia',
      type: 'steal',
      rewardGold: 20,
    }),
  ).toMatchObject({ ok: false, code: 'place' });
  graph.place('lia', 'fort_humans');
  const posted = await graph.act('contract_post', {
    characterId: 'lia',
    type: 'kill',
    rewardGold: 100,
    targetLevel: 10,
    targetIsMember: false,
    anonymous: true,
  });
  expect(posted).toMatchObject({
    ok: true,
    value: { type: 'kill', rewardGold: 100, guildId, countedInQuests: false, anonymous: true },
  });
  expect((posted.value as { untilMs?: number }).untilMs).toBeUndefined();
  expect((graph.state().quests as unknown[]).length).toBe(before);
  const hidden = graph.state().contracts as { type: string }[];
  expect(hidden.some((row) => row.type === 'kill')).toBe(false);
  const steal = await graph.act('contract_post', {
    characterId: 'lia',
    type: 'steal',
    rewardGold: 15,
  });
  expect(steal.ok).toBe(true);
  const visible = graph.state().contracts as { type: string; posterId: string }[];
  expect(visible.some((row) => row.type === 'steal')).toBe(true);
  expect(visible.some((row) => row.type === 'kill')).toBe(false);
});
