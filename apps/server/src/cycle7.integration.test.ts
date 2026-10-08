import { readFileSync } from 'node:fs';
import { ALLIANCE_BREAK_MS, CITY_CAPTURE_COOLDOWN_MS, CONTENDER_CLOSE_MS, CONTENDER_GOLD, GUILD_CREATE_GOLD, NODE_DROP_MS, NODE_PLANT_MS, NODE_TAX_OFFICER_MAX, NOVICE_LOCK_MS, PACT_MS, PATROL_QUEST_GOLD, PATROL_QUEST_MS, VASSAL_RELEASE_MS, VASSAL_TAX_MIN, WAR_GOLD, WAR_HOLD_MS, WAR_MUSTER_MS, WAR_RESOURCES } from '@rift/domain/guild';
import { PORTAL_BLOCK_MS, STORAGE_GOLD_PER_SLOT_DAY } from '@rift/domain/economy';
import { expect, test } from 'vitest';
import { compose } from './compose';

const founders = [
  { id: 'lia', level: 5 },
  { id: 'm1', level: 5 },
  { id: 'm2', level: 5 },
  { id: 'm3', level: 5 },
];

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

/** Register, wait out muster, then hold the center for 10 minutes during the assault. */
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

test('auction tax, storage, diplomacy, and war routes call the domain functions', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const bid = dispatch.slice(dispatch.indexOf('async function auctionBid'), dispatch.indexOf('async function mail'));
  expect(bid.includes('creditGuildBank(')).toBe(false);
  expect(bid.includes('sellerProceeds(')).toBe(true);
  expect(bid.includes('cityOwner(')).toBe(true);
  expect(bid.includes('guildCity')).toBe(false);
  expect(bid.includes('creditTax(')).toBe(true);
  const economyBid = readFileSync(new URL('./modules/economy/service.ts', import.meta.url), 'utf8');
  const priced = economyBid.slice(economyBid.indexOf('bidAuction(input)'), economyBid.indexOf('auctionLot(lotId)'));
  expect(priced.includes('auctionTaxSink(')).toBe(false);
  expect(priced.includes('guildCity')).toBe(false);
  expect(composeSource.includes('rentStorage(')).toBe(true);
  expect(composeSource.includes('askHostilePortal(')).toBe(true);
  expect(composeSource.includes('pactAlly(')).toBe(true);
  expect(composeSource.includes('formPact(')).toBe(true);
  expect(composeSource.includes('noticeAllianceBreak(')).toBe(true);
  expect(composeSource.includes('noticeVassalRelease(')).toBe(true);
  expect(composeSource.includes('renewPact(')).toBe(true);
  expect(composeSource.includes('registerContender(')).toBe(true);
  expect(composeSource.includes("path: '/pact/notice'")).toBe(true);
  expect(composeSource.includes("path: '/pact/renew'")).toBe(true);
  expect(composeSource.includes("path: '/war/contend'")).toBe(true);
  expect(composeSource.includes('postMercenary(')).toBe(true);
  expect(composeSource.includes('postPatrolQuest(')).toBe(true);
  expect(composeSource.includes('tickContract(')).toBe(true);
  const nodeTick = readFileSync(new URL('./sim/nodes.ts', import.meta.url), 'utf8');
  expect(nodeTick.includes('advanceResourceNode(')).toBe(true);
  expect(nodeTick.includes('advanced.seized')).toBe(true);
  expect(nodeTick.includes('settleNodeDrop(')).toBe(false);
  const advanceBody = readFileSync(new URL('../../../packages/domain/src/guild.ts', import.meta.url), 'utf8');
  const seizure = advanceBody.slice(
    advanceBody.indexOf('export function advanceResourceNode'),
    advanceBody.indexOf('export function depositNodeChest'),
  );
  expect(seizure.includes('settleNodeDrop(')).toBe(true);
  expect(composeSource.includes('tickResourceNodes(')).toBe(true);
  expect(composeSource.includes('declareWar(') || dispatch.includes('declareWar(')).toBe(true);
  expect(dispatch.includes('ports.guild.declareWar(')).toBe(true);
  expect(dispatch.includes('declareNeutralCity(')).toBe(true);
  expect(composeSource.includes('declareNeutralCapture(')).toBe(true);
  expect(composeSource.includes('spawnNeutralGuards(')).toBe(true);
  const tick = readFileSync(new URL('./sim/tick.ts', import.meta.url), 'utf8');
  expect(tick.includes('entity.cityGuard === undefined')).toBe(true);
  const tickBody = composeSource.slice(composeSource.indexOf('function tickOnce'), composeSource.indexOf('function simSnapshot'));
  expect(tickBody.includes('spawnNeutralGuards(')).toBe(true);
  expect(tickBody.includes('tickCaptures(')).toBe(true);
  const nodeGate = composeSource.slice(
    composeSource.indexOf('function resourceAccess'),
    composeSource.indexOf('function addNodeChest'),
  );
  expect(nodeGate.includes('portalStance(')).toBe(true);
  expect(nodeGate.includes('nodeAccessCategory(')).toBe(true);
  expect(nodeGate.includes("node.access === 'open'")).toBe(false);
  expect(dispatch.includes('ports.guild.withdraw(')).toBe(true);
  expect(dispatch.includes("path: '/war'") || composeSource.includes("path: '/war'")).toBe(true);
  expect(composeSource.includes("path: '/storage'")).toBe(true);
  expect(composeSource.includes("path: '/guild/withdraw'")).toBe(true);
  expect(app.includes('setCityFee(')).toBe(true);
  expect(app.includes('setNodeTax(')).toBe(true);
  expect(app.includes('setNodeAccess(')).toBe(true);
  expect(app.includes('grantNode(')).toBe(true);
  expect(app.includes('declareWar(')).toBe(true);
  expect(app.includes('withdrawBank(')).toBe(true);
  expect(app.includes('rentStorage(')).toBe(true);
  expect(app.includes('postMercenary(')).toBe(true);
  expect(app.includes('postPatrol(')).toBe(true);
  expect(app.includes('noticePact(')).toBe(true);
  expect(app.includes('renewPact(')).toBe(true);
  expect(app.includes('registerContender(')).toBe(true);
});

test('a guild city auction deposits the 5% tax and a neutral city sinks it', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
  const guildId = await foundGuild(graph);
  await winCity(graph, guildId, 'fort_humans');
  const held = graph.state() as { captures: { cityId: string; won: boolean; guildId: string | null }[] };
  expect(held.captures.some((row) => row.cityId === 'fort_humans' && row.won && row.guildId === guildId)).toBe(true);

  graph.seedTrader({ characterId: 'seller', gold: 0, itemId: 'rusty_sword', qty: 2 });
  graph.seedTrader({ characterId: 'buyer', gold: 400 });
  const guildLot = graph.economy.service.offerAuction({
    sellerId: 'seller',
    itemId: 'rusty_sword',
    qty: 1,
    startPrice: 20,
    buyout: 100,
    guildCity: false,
    cityId: 'fort_humans',
  });
  expect(guildLot.ok).toBe(true);
  if (!guildLot.ok) {
    return;
  }
  const bought = await graph.act('auction_bid', { lotId: guildLot.value.id, bidderId: 'buyer', bid: 100 });
  expect(bought).toMatchObject({ ok: true, value: { price: 100, buyout: true, taxSink: 'guild', guildTax: 5, sinkTax: 0 } });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(5);
  expect(graph.economy.service.balance('seller')).toBe(95);

  const wild = graph.economy.service.offerAuction({
    sellerId: 'seller',
    itemId: 'rusty_sword',
    qty: 1,
    startPrice: 20,
    buyout: 100,
    guildCity: true,
    cityId: 'obsidian_tower',
  });
  expect(wild.ok).toBe(true);
  if (!wild.ok) {
    return;
  }
  const sunk = await graph.act('auction_bid', { lotId: wild.value.id, bidderId: 'buyer', bid: 100 });
  expect(sunk).toMatchObject({ ok: true, value: { taxSink: 'void', guildTax: 0, sinkTax: 5 } });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(5);
});

test('extended storage debits 1 gold per slot and a hostile city refuses a neutral', async () => {
  expect(STORAGE_GOLD_PER_SLOT_DAY).toBe(1);
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-noa', 'noa');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'noa', action: 'wait' });
  const rented = await graph.act('storage', { characterId: 'noa', cityId: 'fort_humans', slots: 1, days: 1 });
  expect(rented).toMatchObject({ ok: true, value: { cost: 1, gold: GUILD_CREATE_GOLD - 1 } });

  graph.enterCharacter('account-lia', 'lia');
  const guildId = await foundGuild(graph);
  await winCity(graph, guildId, 'fort_humans');
  graph.enterCharacter('account-noa', 'noa');
  expect(await graph.act('storage', { characterId: 'noa', cityId: 'fort_humans', slots: 1, days: 1 })).toMatchObject({
    ok: false,
    code: 'refused',
  });
  expect(await graph.act('library', { characterId: 'noa', cityId: 'fort_humans' })).toMatchObject({
    ok: false,
    code: 'refused',
  });
  expect(await graph.act('bind', { characterId: 'noa', cityId: 'fort_humans' })).toMatchObject({
    ok: false,
    code: 'refused',
  });
  expect(await graph.act('repair', { characterId: 'noa', itemId: 'missing' })).toMatchObject({
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
  const ash = (rival.value as { guildId: string }).guildId;
  const pact = await graph.act('pact', { kind: 'alliance', guildIds: [guildId, ash], characterId: 'lia' });
  expect(pact.ok).toBe(true);
  graph.creditGold('kai', 10);
  const allyStorage = await graph.act('storage', { characterId: 'kai', cityId: 'fort_humans', slots: 2, days: 1 });
  expect(allyStorage).toMatchObject({ ok: true, value: { cost: 2, guildId } });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(2);
  expect(await graph.act('library', { characterId: 'kai', cityId: 'fort_humans' })).toMatchObject({
    ok: true,
    value: { service: 'library' },
  });
  expect(await graph.act('bind', { characterId: 'kai', cityId: 'fort_humans' })).toMatchObject({
    ok: true,
    value: { service: 'bind' },
  });
});

test('a node flag drop seizes the chest and the officer tax cap is 15', async () => {
  expect(NODE_DROP_MS).toBe(1_800_000);
  expect(NODE_TAX_OFFICER_MAX).toBe(15);
  const graph = compose({ nowMs: 0 });
  graph.enterWorld('lia', 'plains_mine');
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
  const guildId = await foundGuild(graph);
  await graph.skipMs(NODE_PLANT_MS);
  const planted = graph.state() as { resourceNodes: { nodeId: string; guildId: string | null; chest: number }[] };
  expect(planted.resourceNodes.find((node) => node.nodeId === 'plains_mine')).toMatchObject({ guildId });

  await graph.skipMs(NOVICE_LOCK_MS);
  expect(await graph.act('guild_rank', { guildId, actorId: 'lia', memberId: 'm1', rank: 'officer' })).toMatchObject({
    ok: true,
    value: { rank: 'officer' },
  });
  expect(await graph.act('node_tax', { guildId, nodeId: 'plains_mine', characterId: 'm1', taxPercent: 16 })).toMatchObject({
    ok: false,
    code: 'tax',
  });
  expect(await graph.act('node_tax', { guildId, nodeId: 'plains_mine', characterId: 'm2', taxPercent: 1 })).toMatchObject({
    ok: false,
    code: 'rank',
  });
  expect(await graph.act('node_tax', { guildId, nodeId: 'plains_mine', characterId: 'm1', taxPercent: 15 })).toMatchObject({
    ok: true,
    value: { taxPercent: 15 },
  });

  let chest = 0;
  for (let attempt = 0; attempt < 12 && chest === 0; attempt += 1) {
    const gathered = await graph.act('gather', {
      characterId: 'lia',
      nodeId: 'spring',
      tool: 'basic',
      toolKind: 'flask',
    });
    if (gathered.ok) {
      const state = graph.state() as { resourceNodes: { nodeId: string; chest: number }[] };
      chest = state.resourceNodes.find((node) => node.nodeId === 'plains_mine')?.chest ?? 0;
    }
    if (chest === 0) {
      await graph.skipMs(30 * 60 * 1000);
    }
  }
  expect(chest).toBeGreaterThan(0);

  graph.submit({
    commandId: 'leave-mine',
    seq: 1,
    issuedAtMs: 0,
    action: 'step_n',
    params: { entityId: 'lia', to: 'fort_humans' },
  });
  let left = false;
  for (let step = 0; step < 400 && !left; step += 1) {
    graph.tickOnce();
    const state = graph.state() as { self: { nodeId: string | null } | null };
    left = state.self?.nodeId === 'fort_humans';
  }
  expect(left).toBe(true);
  const absent =
    (graph.state() as { resourceNodes: { nodeId: string; absentMs: number }[] }).resourceNodes.find(
      (node) => node.nodeId === 'plains_mine',
    )?.absentMs ?? 0;
  await graph.skipMs(NODE_DROP_MS - absent - 1);
  const waiting = graph.state() as {
    resourceNodes: { nodeId: string; guildId: string | null; chest: number }[];
    guildVaults: { guildId: string; amount: number }[];
  };
  expect(waiting.resourceNodes.find((node) => node.nodeId === 'plains_mine')?.guildId).toBe(guildId);
  await graph.skipMs(1);
  const dropped = graph.state() as {
    resourceNodes: { nodeId: string; guildId: string | null; chest: number }[];
    guildVaults: { guildId: string; amount: number }[];
  };
  const node = dropped.resourceNodes.find((row) => row.nodeId === 'plains_mine');
  expect(node?.guildId).toBeNull();
  expect(node?.chest).toBe(0);
  expect(dropped.guildVaults.find((row) => row.guildId === guildId)?.amount).toBe(chest);
});

test('node access is separate for allies, other guilds, and neutrals', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterWorld('lia', 'plains_mine');
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
  const guildId = await foundGuild(graph);
  await graph.skipMs(NODE_PLANT_MS);
  expect(
    await graph.act('node_access', { guildId, nodeId: 'plains_mine', category: 'allies', access: 'open' }),
  ).toMatchObject({ ok: true });
  expect(
    await graph.act('node_access', { guildId, nodeId: 'plains_mine', category: 'guilds', access: 'closed' }),
  ).toMatchObject({ ok: true, value: { access: { allies: 'open', guilds: 'closed', neutrals: 'open' } } });
  expect(
    await graph.act('node_access', { guildId, nodeId: 'plains_mine', category: 'neutrals', access: 'request' }),
  ).toMatchObject({ ok: true });
  expect(
    await graph.act('node_access', { guildId, nodeId: 'plains_mine', category: 'open', access: 'closed' }),
  ).toMatchObject({ ok: false, code: 'category' });

  graph.enterWorld('kai', 'plains_mine');
  graph.enterCharacter('account-kai', 'kai');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'kai', action: 'wait' });
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
  const ash = (rival.value as { guildId: string }).guildId;
  const gather = { nodeId: 'spring', tool: 'basic', toolKind: 'flask' };
  expect(await graph.act('gather', { characterId: 'kai', ...gather })).toMatchObject({ ok: false, code: 'closed' });
  expect(await graph.act('pact', { kind: 'alliance', guildIds: [guildId, ash], characterId: 'lia' })).toMatchObject({
    ok: true,
  });
  const allied = await graph.act('gather', { characterId: 'kai', ...gather });
  expect(allied.code).not.toBe('closed');

  graph.enterWorld('noa', 'plains_mine');
  graph.enterCharacter('account-noa', 'noa');
  expect(await graph.act('gather', { characterId: 'noa', ...gather })).toMatchObject({ ok: false, code: 'refused' });
  expect(await graph.act('node_grant', { guildId, nodeId: 'plains_mine', characterId: 'noa' })).toMatchObject({
    ok: true,
  });
  const granted = await graph.act('gather', { characterId: 'noa', ...gather });
  expect(granted.code).not.toBe('refused');
});

test('the 24 hour portal lift uses the domain clock skip', async () => {
  expect(PORTAL_BLOCK_MS).toBe(86_400_000);
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
  const guildId = await foundGuild(graph);
  await winCity(graph, guildId, 'fort_humans');
  graph.enterCharacter('account-noa', 'noa');
  expect(await graph.act('portal_ask', { characterId: 'noa', toNodeId: 'fort_humans' })).toMatchObject({
    ok: false,
    code: 'refused',
  });
  await graph.skipMs(PORTAL_BLOCK_MS);
  const lifted = await graph.act('portal_ask', { characterId: 'noa', toNodeId: 'fort_humans' });
  expect(lifted.ok).toBe(true);
});

test('mercenary and patrol contracts pay from the guild bank or fail', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterWorld('lia', 'plains_mine');
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
  const guildId = await foundGuild(graph);
  const guild = await graph.guild.repository.findGuild(guildId);
  expect(guild).not.toBeNull();
  if (guild === null) {
    return;
  }
  await graph.guild.repository.saveGuild({ ...guild, bank: 20_000 });
  const hired = await graph.act('mercenary', {
    guildId,
    characterId: 'lia',
    mercenaryId: 'blade',
    nodeId: 'plains_mine',
    kind: 'patrol',
    rewardGold: 100,
    durationMs: 1_000,
  });
  expect(hired).toMatchObject({ ok: true, value: { status: 'open', mercenaryId: 'blade' } });
  expect((await graph.guild.repository.findGuild(guildId))?.memberIds.includes('blade')).toBe(false);
  await graph.skipMs(1_000);
  const done = graph.state() as { mercenaries: { status: string }[] };
  expect(done.mercenaries[0]?.status).toBe('failed');

  graph.enterWorld('blade', 'plains_mine');
  graph.enterCharacter('account-blade', 'blade');
  const again = await graph.act('mercenary', {
    guildId,
    characterId: 'lia',
    mercenaryId: 'blade',
    nodeId: 'plains_mine',
    kind: 'patrol',
    rewardGold: 100,
    durationMs: 1_000,
  });
  expect(again.ok).toBe(true);
  const before = graph.economy.service.balance('blade');
  await graph.skipMs(1_000);
  const paid = graph.state() as { mercenaries: { status: string; kind: string }[] };
  expect(paid.mercenaries.map((row) => row.status)).toEqual(['failed', 'complete']);
  expect(graph.economy.service.balance('blade')).toBe((before ?? 0) + 100);
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(19_900);

  const patrol = await graph.act('patrol', {
    guildId,
    characterId: 'lia',
    nodeId: 'plains_mine',
    assigneeId: 'lia',
  });
  expect(patrol).toMatchObject({ ok: true, value: { rewardGold: PATROL_QUEST_GOLD, durationMs: PATROL_QUEST_MS } });
  await graph.skipMs(PATROL_QUEST_MS);
  const quests = graph.state() as { patrols: { status: string }[] };
  expect(quests.patrols[0]?.status).toBe('complete');
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(19_900 - PATROL_QUEST_GOLD);
});

test('mercenary kind changes patrol, combat, and escort outcomes', async () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const tick = composeSource.slice(
    composeSource.indexOf('async function tickContracts'),
    composeSource.indexOf('function tickAllianceBreaks'),
  );
  expect(tick.includes('kind: contract.kind')).toBe(true);
  expect(tick.includes('duty: contractDuty(contract)')).toBe(true);
  const once = composeSource.slice(composeSource.indexOf('function tickOnce'), composeSource.indexOf('function simSnapshot'));
  expect(once.includes('tickContracts(')).toBe(true);

  const graph = compose({ nowMs: 0 });
  graph.enterWorld('lia', 'plains_mine');
  graph.enterCharacter('account-lia', 'lia');
  graph.enterWorld('blade', 'plains_mine');
  graph.enterCharacter('account-blade', 'blade');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'blade', action: 'wait' });
  const guildId = await foundGuild(graph);
  const guild = await graph.guild.repository.findGuild(guildId);
  if (guild === null) {
    throw new Error('missing guild');
  }
  await graph.guild.repository.saveGuild({ ...guild, bank: 20_000 });
  const hire = (kind: string) =>
    graph.act('mercenary', {
      guildId,
      characterId: 'lia',
      mercenaryId: 'blade',
      nodeId: 'plains_mine',
      kind,
      rewardGold: 100,
      durationMs: 1_000,
    });
  expect(await hire('escort')).toMatchObject({ ok: true });
  await graph.skipMs(1_000);
  expect((graph.state() as { mercenaries: { kind: string; status: string }[] }).mercenaries[0]?.status).toBe('failed');
  expect(await hire('defend')).toMatchObject({ ok: true });
  await graph.skipMs(1_000);
  expect(
    (graph.state() as { mercenaries: { kind: string; status: string }[] }).mercenaries.find((row) => row.kind === 'defend')
      ?.status,
  ).toBe('failed');
  expect(await hire('attack')).toMatchObject({ ok: true });
  graph.submit({
    commandId: 'blade-hits',
    seq: 1,
    issuedAtMs: (graph.state() as { nowMs: number }).nowMs,
    action: 'attack_ranged',
    targetId: 'blade:bandit',
    params: { entityId: 'blade', weaponDamage: 80, range: 8, odCost: 0, pvpOpen: true, safeZone: false },
  });
  graph.tickOnce();
  await graph.skipMs(1_000);
  expect(
    (graph.state() as { mercenaries: { kind: string; status: string }[] }).mercenaries.find((row) => row.kind === 'attack')
      ?.status,
  ).toBe('complete');
});

test('declareWar and withdraw are live routes', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const guildId = await foundGuild(graph);
  await winCity(graph, guildId, 'fort_humans');
  await graph.skipMs(CITY_CAPTURE_COOLDOWN_MS);
  const owned = await graph.guild.repository.findGuild(guildId);
  if (owned === null) {
    throw new Error('missing guild');
  }
  await graph.guild.repository.saveGuild({ ...owned, bank: 100_000 });
  const declared = await graph.act('guild_war', {
    attackerGuildId: guildId,
    cityId: 'fort_humans',
    leaderConsent: true,
    councilConsents: 2,
    resources: WAR_RESOURCES,
  });
  expect(declared.ok).toBe(true);
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(100_000 - WAR_GOLD);
  const withdrawn = await graph.act('guild_withdraw', { guildId, characterId: 'lia', amount: 1 });
  expect(withdrawn).toMatchObject({ ok: true, value: { amount: 1 } });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(100_000 - WAR_GOLD - 1);
});

test('alliance notice, vassal release, and war contenders follow the domain clocks', async () => {
  expect(ALLIANCE_BREAK_MS).toBe(86_400_000);
  expect(VASSAL_RELEASE_MS).toBe(7 * 86_400_000);
  expect(CONTENDER_GOLD).toBe(10_000);
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'kai', action: 'wait' });
  const guildId = await foundGuild(graph);
  await winCity(graph, guildId, 'fort_humans');
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
  const ash = (rival.value as { guildId: string }).guildId;
  const pact = await graph.act('pact', { kind: 'alliance', guildIds: [guildId, ash], characterId: 'lia' });
  expect(pact.ok).toBe(true);
  const pactId = (pact.value as { id: string }).id;
  graph.creditGold('kai', 5);
  expect(await graph.act('library', { characterId: 'kai', cityId: 'fort_humans' })).toMatchObject({ ok: true });
  expect(await graph.act('pact_notice', { pactId, characterId: 'lia' })).toMatchObject({ ok: true });
  await graph.skipMs(ALLIANCE_BREAK_MS - 1);
  expect(await graph.act('library', { characterId: 'kai', cityId: 'fort_humans' })).toMatchObject({ ok: true });
  await graph.skipMs(1);
  expect(await graph.act('library', { characterId: 'kai', cityId: 'fort_humans' })).toMatchObject({
    ok: false,
    code: 'blocked',
  });
  const again = await graph.act('pact', { kind: 'alliance', guildIds: [guildId, ash], characterId: 'lia' });
  expect(again.ok).toBe(true);
  const renewed = await graph.act('pact_renew', {
    pactId: (again.value as { id: string }).id,
    characterId: 'lia',
  });
  expect(renewed.ok).toBe(true);
  await graph.skipMs(PACT_MS - 1);
  expect(await graph.act('library', { characterId: 'kai', cityId: 'fort_humans' })).toMatchObject({ ok: true });
  await graph.skipMs(1);
  expect(await graph.act('library', { characterId: 'kai', cityId: 'fort_humans' })).toMatchObject({
    ok: false,
    code: 'blocked',
  });

  const bound = await graph.act('pact', {
    kind: 'vassal',
    guildIds: [guildId, ash],
    suzerainId: guildId,
    vassalId: ash,
    taxPercent: VASSAL_TAX_MIN,
    characterId: 'lia',
  });
  expect(bound.ok).toBe(true);
  const vassalId = (bound.value as { id: string }).id;
  expect(await graph.act('pact_notice', { pactId: vassalId, characterId: 'lia' })).toMatchObject({ ok: true });
  await graph.skipMs(ALLIANCE_BREAK_MS);
  expect(await graph.act('library', { characterId: 'kai', cityId: 'fort_humans' })).toMatchObject({ ok: true });
  await graph.skipMs(VASSAL_RELEASE_MS - ALLIANCE_BREAK_MS);
  expect(await graph.act('library', { characterId: 'kai', cityId: 'fort_humans' })).toMatchObject({
    ok: false,
    code: 'blocked',
  });

  const wolves = await graph.guild.repository.findGuild(guildId);
  if (wolves === null) {
    throw new Error('missing guild');
  }
  await graph.guild.repository.saveGuild({ ...wolves, bank: 100_000 });
  const declared = await graph.act('guild_war', {
    attackerGuildId: guildId,
    cityId: 'obsidian_tower',
    leaderConsent: true,
    councilConsents: 2,
    resources: 20_000,
  });
  expect(declared.ok).toBe(true);
  const warId = (declared.value as { warId: string }).warId;
  expect(await graph.act('war_contend', { guildId, warId, characterId: 'm2' })).toMatchObject({
    ok: false,
    code: 'rank',
  });
  const contended = await graph.act('war_contend', { guildId, warId, characterId: 'lia' });
  expect(contended).toMatchObject({ ok: true, value: { warId, guildId, gold: 100_000 - 25_000 - CONTENDER_GOLD } });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(65_000);
});

test('a neutral capture charges 25000 gold and waits for the guard fight', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.noteSidecar({ atMs: 10_000_000_000, characterId: 'lia', action: 'wait' });
  const guildId = await foundGuild(graph);
  const guild = await graph.guild.repository.findGuild(guildId);
  if (guild === null) {
    throw new Error('missing guild');
  }
  await graph.guild.repository.saveGuild({ ...guild, bank: 40_000 });
  const declared = await graph.act('guild_war', {
    attackerGuildId: guildId,
    cityId: 'fort_humans',
    leaderConsent: true,
    councilConsents: 2,
    resources: 20_000,
  });
  expect(declared.ok).toBe(true);
  expect(declared.value).toMatchObject({ costGold: 25_000, kind: 'neutral', guards: 2 });
  expect((await graph.guild.repository.findGuild(guildId))?.bank).toBe(15_000);
  const warId = (declared.value as { warId: string }).warId;
  const startsAtMs = (declared.value as { startsAtMs: number }).startsAtMs;
  expect(startsAtMs).toBe(48 * 60 * 60 * 1000);
  expect(await graph.act('war_contend', { guildId, warId, characterId: 'lia' })).toMatchObject({ ok: true });
  await graph.skipMs(startsAtMs + WAR_MUSTER_MS);
  const guards = (graph.state() as { entities: { id: string; monsterId: string | null; hp: number }[] }).entities.filter(
    (entity) => entity.id.startsWith('guard:fort_humans'),
  );
  expect(guards.length).toBe(2);
  expect(guards.every((guard) => guard.hp > 0)).toBe(true);
  await graph.skipMs(WAR_HOLD_MS);
  const blocked = graph.state() as { captures: { cityId: string; won: boolean }[] };
  expect(blocked.captures.some((row) => row.cityId === 'fort_humans' && row.won)).toBe(false);
  for (const guard of guards) {
    graph.submit({
      commandId: `guard-${guard.id}`,
      seq: 1,
      issuedAtMs: (graph.state() as { nowMs: number }).nowMs,
      action: 'attack_ranged',
      targetId: guard.id,
      params: { entityId: 'lia', weaponDamage: 80, range: 8, odCost: 0, pvpOpen: true, safeZone: false },
    });
    graph.tickOnce();
  }
  const fought = graph.state() as { entities: { id: string; hp: number }[] };
  expect(fought.entities.some((entity) => entity.id.startsWith('guard:') && entity.hp > 0)).toBe(false);
  await graph.skipMs(WAR_HOLD_MS);
  const won = graph.state() as { captures: { cityId: string; won: boolean; guildId: string | null }[] };
  expect(won.captures.some((row) => row.cityId === 'fort_humans' && row.won && row.guildId === guildId)).toBe(true);
});
