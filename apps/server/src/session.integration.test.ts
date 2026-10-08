import type { Appearance } from '@rift/domain/character';
import { DAY_MS, EPOCH_MS, seasonAt, seasonSpawnTag, spawnMultiplier } from '@rift/domain/events';
import { GUILD_CREATE_GOLD } from '@rift/domain/guild';
import { emptyPoints } from '@rift/domain/stats';
import { expect, test } from 'vitest';
import { buildApp, compose } from './compose';
import type { PrismaWrite, RiftDb } from './infra/db/prisma';
import { PROTOTYPE_MONSTERS } from './sim/bestiary';

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

test('character create enters the world and a command moves that entity', async () => {
  const built = await buildApp({ nowMs: 1_000, jwtSecret: 'test-secret' });
  try {
    const created = await built.app.inject({
      method: 'POST',
      url: '/characters',
      payload: {
        accountId: 'account-lia',
        name: 'Lia',
        clean: false,
        points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
        appearance,
      },
    });
    expect(created.statusCode).toBe(200);
    const { characterId } = created.json() as { characterId: string };
    const before = await built.app.inject({ method: 'GET', url: '/state' });
    const entered = before.json() as {
      self: { id: string; cell: { x: number; y: number } } | null;
      entities: { id: string; eliteId?: string | null; monsterId?: string | null }[];
      keeper: { id: string; level: number; phases: number } | null;
    };
    expect(entered.self?.id).toBe(characterId);
    expect(entered.self?.cell).toEqual({ x: 0, y: 0 });
    for (const monster of PROTOTYPE_MONSTERS) {
      expect(entered.entities.some((entity) => entity.monsterId === monster.id)).toBe(true);
    }
    expect(entered.entities.some((entity) => entity.monsterId === 'keeper_enhanced_prototype')).toBe(true);
    expect(entered.entities.some((entity) => typeof entity.eliteId === 'string' && entity.eliteId.length > 0)).toBe(
      true,
    );
    expect(entered.keeper).toMatchObject({ id: 'keeper_enhanced', level: 50, phases: 3 });

    const moved = await built.app.inject({
      method: 'POST',
      url: '/command',
      payload: {
        commandId: 'move-1',
        seq: 1,
        issuedAtMs: 1_000,
        action: 'step_e',
        params: { entityId: characterId },
      },
    });
    expect(moved.statusCode).toBe(200);
    built.tickOnce();
    const after = await built.app.inject({ method: 'GET', url: '/state' });
    const next = after.json() as { self: { cell: { x: number; y: number }; hp: number } };
    expect(next.self.cell.x).toBeGreaterThan(0);
  } finally {
    await built.close();
  }
});

test('login resume loads repository characters and create opens a guild wallet', async () => {
  const graph = compose({ nowMs: 1_000, jwtSecret: 'test-secret' });
  const created = await graph.character.service.create({
    accountId: 'account-ria',
    controller: 'player',
    name: 'Ria',
    clean: false,
    points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
    appearance,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  expect(graph.state().self).toBeNull();
  await graph.resume('account-ria');
  const resumed = graph.state() as { self: { id: string } | null };
  expect(resumed.self?.id).toBe(created.value.characterId);
  expect(graph.economy.service.balance(created.value.characterId)).toBe(GUILD_CREATE_GOLD);

  const built = await buildApp({ nowMs: 1_000, jwtSecret: 'test-secret' });
  try {
    const httpCreated = await built.app.inject({
      method: 'POST',
      url: '/characters',
      payload: {
        accountId: 'account-lia',
        name: 'Lia',
        clean: false,
        points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
        appearance,
      },
    });
    const { characterId } = httpCreated.json() as { characterId: string };
    expect(built.economy.service.balance(characterId)).toBe(GUILD_CREATE_GOLD);
    const guild = await built.app.inject({
      method: 'POST',
      url: '/guild',
      payload: {
        name: 'Red Wolves',
        tag: 'RW',
        initiatorId: characterId,
        members: [
          { id: characterId, level: 5 },
          { id: 'm1', level: 5 },
          { id: 'm2', level: 5 },
          { id: 'm3', level: 5 },
        ],
        gold: GUILD_CREATE_GOLD,
      },
    });
    expect(guild.statusCode).toBe(200);
    expect(built.economy.service.balance(characterId)).toBe(0);
  } finally {
    await built.close();
  }
});

test('accepted quests publish on /state and kill credit follows the attacker', async () => {
  const graph = compose({ nowMs: 1_000, jwtSecret: 'test-secret' });
  graph.enterWorld('alpha');
  graph.enterWorld('beta');
  const accepted = await graph.act('quest_accept', { characterId: 'beta', questId: 'kill_rats' });
  expect(accepted.ok).toBe(true);
  const listed = graph.state() as {
    players: { id: string; xp: number; quests: { id: string; objectives: { current: number }[] }[] }[];
  };
  const beta = listed.players.find((player) => player.id === 'beta');
  expect(beta?.quests.map((quest) => quest.id)).toEqual(['kill_rats']);
  expect(beta?.quests[0]?.objectives[0]?.current).toBe(0);

  graph.submit({
    commandId: 'beta-hit',
    seq: 1,
    issuedAtMs: 1_000,
    action: 'attack_ranged',
    targetId: 'alpha:spore_rat',
    params: { entityId: 'beta', weaponDamage: 500, range: 8, odCost: 0 },
  });
  graph.tickOnce();
  const after = graph.state() as {
    players: { id: string; xp: number; quests: { id: string; objectives: { current: number }[] }[] }[];
  };
  const alphaAfter = after.players.find((player) => player.id === 'alpha');
  const betaAfter = after.players.find((player) => player.id === 'beta');
  expect(alphaAfter?.xp).toBe(0);
  expect(betaAfter?.xp).toBeGreaterThan(0);
  expect(betaAfter?.quests[0]?.objectives[0]?.current).toBe(1);

  const gathered = await graph.act('quest_accept', { characterId: 'alpha', questId: 'gather_metal' });
  expect(gathered.ok).toBe(true);
  const gather = await graph.act('gather', { characterId: 'alpha', nodeId: 'mine_metal' });
  expect(gather.ok).toBe(true);
  const visited = await graph.act('quest_accept', { characterId: 'alpha', questId: 'visit_hub' });
  expect(visited.ok).toBe(true);
  const dungeon = await graph.act('dungeon_enter', { characterId: 'alpha' });
  expect(dungeon.ok).toBe(true);
  const played = graph.state() as {
    players: { id: string; quests: { id: string; objectives: { id: string; current: number }[] }[] }[];
  };
  const alphaPlayed = played.players.find((player) => player.id === 'alpha');
  expect(alphaPlayed?.quests.find((quest) => quest.id === 'gather_metal')?.objectives[0]?.current).toBe(1);
  expect(alphaPlayed?.quests.find((quest) => quest.id === 'visit_hub')?.objectives[0]?.current).toBe(0);
});

test('0 HP writes a corpse and respawnAtBind brings the player back', () => {
  const graph = compose({ nowMs: 1_000, jwtSecret: 'test-secret' });
  graph.enterWorld('lia');
  graph.submit({
    commandId: 'hit-1',
    seq: 1,
    issuedAtMs: 1_000,
    action: 'attack_ranged',
    targetId: 'lia:spore_rat',
    params: { entityId: 'lia', weaponDamage: 500, range: 8, odCost: 0 },
  });
  graph.tickOnce();
  const killed = graph.state() as { corpses: { victimId: string }[] };
  expect(killed.corpses.some((corpse) => corpse.victimId === 'lia:spore_rat')).toBe(true);
  for (let step = 0; step < 8; step += 1) {
    graph.tickOnce();
  }
  const fallen = graph.state() as {
    nowMs: number;
    corpses: { victimId: string }[];
    self: { hp: number; phase: string } | null;
  };
  expect(fallen.corpses.some((corpse) => corpse.victimId === 'lia')).toBe(true);
  expect(fallen.self?.phase).toBe('downed');
  expect(fallen.self?.hp).toBeLessThanOrEqual(0);
  graph.submit({
    commandId: 'up',
    seq: 2,
    issuedAtMs: fallen.nowMs,
    action: 'respawn',
    params: { entityId: 'lia' },
  });
  graph.tickOnce();
  const back = graph.state() as { self: { hp: number; phase: string } | null };
  expect(back.self).toMatchObject({ phase: 'online', hp: 40 });
});

test('death drops the inventory kit and the client respawn command restores the player', async () => {
  const built = await buildApp({ nowMs: 1_000, jwtSecret: 'test-secret' });
  try {
    const created = await built.app.inject({
      method: 'POST',
      url: '/characters',
      payload: {
        accountId: 'account-ned',
        name: 'Ned',
        clean: false,
        points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
        appearance,
      },
    });
    const { characterId } = created.json() as { characterId: string };
    const before = await built.app.inject({ method: 'GET', url: `/characters/${characterId}/inventory` });
    const kit = before.json() as { items: { itemId: string }[] };
    expect(kit.items.map((item) => item.itemId)).toContain('rusty_sword');

    await built.app.inject({
      method: 'POST',
      url: '/command',
      payload: {
        commandId: 'hit-ned',
        seq: 1,
        issuedAtMs: 1_000,
        action: 'attack_ranged',
        targetId: `${characterId}:spore_rat`,
        params: { entityId: characterId, weaponDamage: 500, range: 8, odCost: 0 },
      },
    });
    built.tickOnce();
    for (let step = 0; step < 12; step += 1) {
      built.tickOnce();
    }
    const fallen = await built.app.inject({ method: 'GET', url: '/state' });
    const downed = fallen.json() as {
      nowMs: number;
      self: { phase: string; hp: number } | null;
      corpses: { victimId: string; stacks?: { itemId: string; questItem?: boolean }[] }[];
    };
    expect(downed.self?.phase).toBe('downed');
    const corpse = downed.corpses.find((row) => row.victimId === characterId);
    expect(corpse?.stacks?.map((stack) => stack.itemId)).toContain('rusty_sword');
    expect(corpse?.stacks?.every((stack) => stack.questItem !== true)).toBe(true);
    const emptied = await built.app.inject({ method: 'GET', url: `/characters/${characterId}/inventory` });
    expect((emptied.json() as { items: unknown[] }).items).toEqual([]);

    await built.app.inject({
      method: 'POST',
      url: '/command',
      payload: {
        commandId: 'up-ned',
        seq: 2,
        issuedAtMs: downed.nowMs,
        action: 'respawn',
        params: { entityId: characterId },
      },
    });
    built.tickOnce();
    const back = await built.app.inject({ method: 'GET', url: '/state' });
    expect((back.json() as { self: { phase: string; hp: number } }).self).toMatchObject({
      phase: 'online',
      hp: 40,
    });
  } finally {
    await built.close();
  }
});

test('relic sockets and echo slots persist, and path load can shock the character', async () => {
  const graph = compose({ nowMs: 1_000, jwtSecret: 'test-secret' });
  const created = await graph.character.service.create({
    accountId: 'account-nia',
    controller: 'player',
    name: 'Nia',
    clean: false,
    points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
    appearance,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  const characterId = created.value.characterId;
  await graph.character.service.grantXp(characterId, 200_000);
  graph.enterCharacter('account-nia', characterId);
  const relic = await graph.act('relic_install', {
    characterId,
    subtype: 'culture',
    grade: 'rare',
  });
  expect(relic).toMatchObject({ ok: true, value: { sockets: 2 } });
  const first = await graph.act('echo_install', { characterId, templateId: 'memory', grade: 1 });
  const second = await graph.act('echo_install', { characterId, templateId: 'second', grade: 1 });
  const third = await graph.act('echo_install', { characterId, templateId: 'third', grade: 1 });
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  expect(third).toMatchObject({ ok: false, code: 'sockets' });

  const clean = await graph.character.service.create({
    accountId: 'account-cara',
    controller: 'player',
    name: 'Cara',
    clean: true,
    points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
    appearance,
  });
  expect(clean.ok).toBe(true);
  if (!clean.ok) {
    return;
  }
  await graph.character.service.grantXp(clean.value.characterId, 200_000);
  graph.enterCharacter('account-cara', clean.value.characterId);
  for (const templateId of ['ward', 'step', 'veil', 'mark', 'oath']) {
    const learned = await graph.act('path_learn', {
      characterId: clean.value.characterId,
      templateId,
      grade: 3,
    });
    expect(learned.ok).toBe(true);
  }
  const viewed = graph.state() as {
    players: { id: string; nn: number; nnLimit: number }[];
  };
  const cara = viewed.players.find((player) => player.id === clean.value.characterId);
  expect(cara?.nn).toBeGreaterThan(cara?.nnLimit ?? 0);
});

test('season spawns use the live snapshot multiplier and tag', () => {
  const nowMs = EPOCH_MS + 84 * DAY_MS;
  const season = seasonAt(nowMs);
  const tag = seasonSpawnTag(season);
  const multiplier = spawnMultiplier(season, tag);
  expect(multiplier).not.toBe(1);
  const graph = compose({ nowMs, jwtSecret: 'test-secret' });
  graph.enterWorld('lia');
  const before = graph.state() as { entities: { id: string }[] };
  for (const entity of before.entities) {
    graph.submit({
      commandId: `clear-${entity.id}`,
      seq: 1,
      issuedAtMs: nowMs,
      action: 'attack_ranged',
      targetId: entity.id,
      params: { entityId: 'lia', weaponDamage: 5000, range: 30, odCost: 0 },
    });
  }
  graph.tickOnce();
  for (let step = 0; step < 8; step += 1) {
    graph.tickOnce();
  }
  const after = graph.state() as {
    seasonSpawn: number;
    entities: { hp: number; seasonTag: string | null }[];
  };
  expect(after.seasonSpawn).toBe(multiplier);
  const budget = Math.round(PROTOTYPE_MONSTERS.length * multiplier);
  const living = after.entities.filter((entity) => entity.hp > 0);
  expect(living.length).toBeLessThanOrEqual(budget);
  expect(living.some((entity) => entity.seasonTag === tag)).toBe(true);
});

test('dungeon, craft, trade, and barrier-day invasion run from the live routes', async () => {
  const graph = compose({ nowMs: 1_000, jwtSecret: 'test-secret' });
  graph.enterWorld('lia');
  const entered = await graph.act('dungeon_enter', { characterId: 'lia' });
  expect(entered.ok).toBe(true);
  const inside = graph.state() as { self: { roomId: number | null; cell: { x: number; y: number } } | null };
  expect(inside.self?.roomId).toBe(0);
  expect(inside.self?.cell).toEqual({ x: 0, y: 0 });
  graph.submit({
    commandId: 'dungeon-step',
    seq: 1,
    issuedAtMs: 1_000,
    action: 'step_e',
    params: { entityId: 'lia' },
  });
  graph.tickOnce();
  const held = graph.state() as { self: { roomId: number | null; cell: { x: number; y: number } } | null };
  expect(held.self?.roomId).toBe(0);
  expect(held.self?.cell).toEqual({ x: 0, y: 0 });
  expect(await graph.act('dungeon_leave', { characterId: 'lia' })).toMatchObject({ ok: true });
  const outside = graph.state() as { self: { roomId: number | null } | null };
  expect(outside.self?.roomId).toBeNull();

  const started = await graph.act('craft_start', { characterId: 'lia', recipeId: 'rusty_sword', itemLevel: 1 });
  expect(started.ok).toBe(true);
  const jobId = (started.value as { jobId: string }).jobId;
  const early = await graph.act('craft_complete', { characterId: 'lia', jobId });
  expect(early).toMatchObject({ ok: false, code: 'early' });

  graph.seedTrader({ characterId: 'seller', gold: 100, itemId: 'rusty_sword', qty: 1 });
  graph.seedTrader({ characterId: 'buyer', gold: 80 });
  const offerA = await graph.act('trade_offer', {
    characterId: 'seller',
    counterpartyId: 'buyer',
    gold: 0,
    items: { rusty_sword: 1 },
  });
  expect(offerA.ok).toBe(true);
  const tradeId = (offerA.value as { tradeId: string }).tradeId;
  expect(
    await graph.act('trade_offer', {
      characterId: 'buyer',
      counterpartyId: 'seller',
      gold: 20,
      items: {},
    }),
  ).toMatchObject({ ok: true });
  expect(await graph.act('trade_accept', { characterId: 'seller', tradeId })).toMatchObject({
    ok: true,
    value: { status: 'pending' },
  });
  expect(await graph.act('trade_accept', { characterId: 'buyer', tradeId })).toMatchObject({
    ok: true,
    value: { status: 'done' },
  });
  expect(graph.economy.service.balance('seller')).toBe(120);
  expect(graph.economy.service.balance('buyer')).toBe(60);

  const barrier = EPOCH_MS + 11 * 28 * DAY_MS;
  const holiday = compose({ nowMs: barrier, jwtSecret: 'test-secret' });
  holiday.tickOnce();
  const events = holiday.state() as { invasion: string | null; holidayKeeper: number; seasonResource: string | null };
  expect(events.invasion).toBe('prepare');
  expect(events.holidayKeeper).toBe(1.1);
  expect(events.seasonResource).toBeTypeOf('string');
});

test('story acts publish artifact scenes and live events advance them', async () => {
  const graph = compose({ nowMs: 1_000, jwtSecret: 'test-secret' });
  graph.enterWorld('lia');
  expect(await graph.act('quest_accept', { characterId: 'lia', questId: 'act1_light' })).toMatchObject({
    ok: true,
  });
  expect(await graph.act('quest_accept', { characterId: 'lia', questId: 'act3_light' })).toMatchObject({
    ok: true,
  });
  const opened = graph.state() as {
    players: { quests: { id: string; objectives: { id: string; scene?: string; current: number }[] }[] }[];
  };
  const scenes = opened.players
    .flatMap((player) => player.quests)
    .flatMap((quest) => quest.objectives.map((objective) => objective.scene ?? ''));
  for (const phrase of ['Barrier', 'Koval', 'council', 'outer ring', 'Archive', 'Shutdown', 'other side']) {
    expect(scenes.some((scene) => scene.includes(phrase))).toBe(true);
  }

  expect(await graph.act('wiki', { characterId: 'lia', articleId: 'barrier' })).toMatchObject({ ok: true });
  const studied = graph.state() as {
    players: { quests: { id: string; objectives: { id: string; current: number }[] }[] }[];
  };
  const act1 = studied.players[0]?.quests.find((quest) => quest.id === 'act1_light');
  const act3 = studied.players[0]?.quests.find((quest) => quest.id === 'act3_light');
  expect(act1?.objectives.find((objective) => objective.id === 'barrier')?.current).toBe(1);
  expect(act3?.objectives.find((objective) => objective.id === 'archive')?.current).toBe(1);

  expect(await graph.act('hack_start', { characterId: 'lia' })).toMatchObject({ ok: true });
  const password = (graph.state() as { hackPassword: string | null }).hackPassword;
  expect(password).toHaveLength(4);
  const guessed = await graph.act('hack_guess', { characterId: 'lia', attempt: password });
  expect(guessed).toMatchObject({ ok: true, value: { correct: true } });
  const fallen = graph.state() as { barrierDown: boolean };
  expect(fallen.barrierDown).toBe(true);

  const chosen = await graph.act('dialogue', {
    characterId: 'lia',
    questId: 'act1_light',
    choiceId: 'question',
  });
  expect(chosen).toMatchObject({ ok: true, value: { choiceId: 'question' } });
  const branched = graph.state() as {
    barrierDown: boolean;
    players: { quests: { id: string; choiceId: string | null; objectives: { id: string; scene?: string; current: number }[] }[] }[];
  };
  expect(branched.barrierDown).toBe(true);
  const koval = branched.players[0]?.quests
    .find((quest) => quest.id === 'act1_light')
    ?.objectives.find((objective) => objective.id === 'koval');
  expect(koval?.scene).toContain('questioned the council');
  expect(branched.players[0]?.quests.find((quest) => quest.id === 'act1_light')?.choiceId).toBe('question');

  expect(await graph.act('dungeon_enter', { characterId: 'lia' })).toMatchObject({ ok: true });
  const rings = graph.state() as {
    primordialOpened: boolean;
    self: { nodeId: string | null; roomId: number | null } | null;
    players: { quests: { id: string; objectives: { id: string; current: number }[] }[] }[];
  };
  expect(rings.primordialOpened).toBe(false);
  expect(rings.self?.nodeId).toBeNull();
  const act3 = rings.players[0]?.quests.find((quest) => quest.id === 'act3_light');
  expect(act3?.objectives.find((objective) => objective.id === 'outer_ring')?.current).toBe(0);
  expect(act3?.objectives.find((objective) => objective.id === 'middle_ring')?.current).toBe(0);
  expect(act3?.objectives.find((objective) => objective.id === 'archive')?.current).toBe(1);
});

test('utility runs after 200ms of sidecar silence and the action is played', async () => {
  const graph = compose({ nowMs: 1_000, jwtSecret: 'test-secret' });
  graph.enterWorld('lia');
  const before = graph.state() as { self: { cell: { x: number; y: number } } | null; observation: number[] };
  expect(before.observation).toHaveLength(0);
  const monsters = (graph.state() as { entities: { id: string }[] }).entities;
  for (const entity of monsters) {
    graph.submit({
      commandId: `clear-${entity.id}`,
      seq: 1,
      issuedAtMs: 1_000,
      action: 'attack_ranged',
      targetId: entity.id,
      params: { entityId: 'lia', weaponDamage: 5000, range: 30, odCost: 0 },
    });
  }
  graph.tickOnce();
  const seen = graph.state() as { observation: number[]; self: { cell: { x: number; y: number } } | null };
  expect(seen.observation).toHaveLength(896);
  expect(seen.self?.cell).toEqual({ x: 0, y: 0 });
  graph.tickOnce();
  const quiet = graph.state() as {
    self: { cell: { x: number; y: number } } | null;
    entities: { id: string; hp: number }[];
    lastUtility: string | null;
  };
  expect(quiet.self?.cell).toEqual({ x: 0, y: 0 });
  expect(quiet.lastUtility?.startsWith('quiet:')).toBe(true);
  const beforeHp = new Map(quiet.entities.map((entity) => [entity.id, entity.hp]));

  graph.tickOnce();
  graph.tickOnce();
  const moved = graph.state() as {
    self: { cell: { x: number; y: number } } | null;
    entities: { id: string; hp: number }[];
    lastUtility: string | null;
    playedUtility: number;
  };
  expect(['step_n', 'attack_melee', 'attack_ranged']).toContain(moved.lastUtility);
  expect(moved.playedUtility).toBeGreaterThan(0);
  const damaged = moved.entities.some((entity) => {
    const previous = beforeHp.get(entity.id);
    return previous !== undefined && entity.hp < previous;
  });
  const stepped = moved.self?.cell.x !== 0 || moved.self?.cell.y !== 0;
  expect(stepped || damaged).toBe(true);

  const heard = compose({ nowMs: 1_000, jwtSecret: 'test-secret' });
  heard.enterWorld('lia');
  for (let step = 0; step < 6; step += 1) {
    heard.noteSidecar({ atMs: 1_000 + step * 100, characterId: 'lia', action: 'wait' });
    heard.tickOnce();
    await new Promise((resolve) => setImmediate(resolve));
  }
  const stayed = heard.state() as { self: { cell: { x: number; y: number } } | null };
  expect(stayed.self?.cell).toEqual({ x: 0, y: 0 });
});

test('auction buyout records the 5% tax destination', async () => {
  const built = await buildApp({ nowMs: 1_000, jwtSecret: 'test-secret' });
  try {
    built.seedTrader({ characterId: 'seller', gold: 0, itemId: 'rusty_sword', qty: 2 });
    built.seedTrader({ characterId: 'buyer', gold: 400 });
    const guildLot = await built.app.inject({
      method: 'POST',
      url: '/auction',
      payload: {
        sellerId: 'seller',
        itemId: 'rusty_sword',
        qty: 1,
        startPrice: 20,
        buyout: 100,
        guildCity: true,
      },
    });
    expect(guildLot.statusCode).toBe(200);
    const guildId = (guildLot.json() as { id: string }).id;
    const guildBid = await built.app.inject({
      method: 'POST',
      url: '/auction/bid',
      payload: { lotId: guildId, bidderId: 'buyer', bid: 100 },
    });
    expect(guildBid.statusCode).toBe(200);
    expect(guildBid.json()).toMatchObject({ price: 100, buyout: true, taxSink: 'guild', guildTax: 5, sinkTax: 0 });
    expect(built.economy.service.balance('seller')).toBe(95);
    expect(built.economy.service.balance('buyer')).toBe(300);

    const voidLot = await built.app.inject({
      method: 'POST',
      url: '/auction',
      payload: {
        sellerId: 'seller',
        itemId: 'rusty_sword',
        qty: 1,
        startPrice: 20,
        buyout: 100,
        guildCity: false,
      },
    });
    const voidId = (voidLot.json() as { id: string }).id;
    const voidBid = await built.app.inject({
      method: 'POST',
      url: '/auction/bid',
      payload: { lotId: voidId, bidderId: 'buyer', bid: 100 },
    });
    expect(voidBid.json()).toMatchObject({ taxSink: 'void', guildTax: 5, sinkTax: 5 });
    expect(built.economy.service.balance('seller')).toBe(190);
  } finally {
    await built.close();
  }
});

test('a database boot restores the sim snapshot and wallets', async () => {
  const db = memoryDb();
  const url = 'postgresql://rift@127.0.0.1:5432/rift';
  const first = compose({ nowMs: 1_000, jwtSecret: 'test-secret', databaseUrl: url, db });
  await first.hydrate();
  expect((first.state() as { self: unknown }).self).toBeNull();
  first.enterWorld('lia');
  first.creditGold('lia', 250);
  first.tickOnce();
  await first.flush();

  const second = compose({ nowMs: 5, jwtSecret: 'test-secret', databaseUrl: url, db });
  await second.hydrate();
  const restored = second.state() as { nowMs: number; self: { id: string } | null };
  expect(restored.nowMs).toBe(1_100);
  expect(restored.self?.id).toBe('lia');
  expect(second.economy.service.balance('lia')).toBe(250);

  await db.storage.upsert({
    where: { id: 'world:sim' },
    create: {
      id: 'world:sim',
      ownerId: 'world',
      items: { tick: 4, entities: ['lia'] },
      gold: 0,
      slots: 0,
    },
    update: { items: { tick: 4, entities: ['lia'] } },
  });
  const ignored = compose({ nowMs: 50, jwtSecret: 'test-secret', databaseUrl: url, db });
  await ignored.hydrate();
  expect((ignored.state() as { nowMs: number; self: unknown }).nowMs).toBe(50);
  expect((ignored.state() as { self: unknown }).self).toBeNull();

  db.storage.upsert = async () => {
    throw new Error('disk');
  };
  ignored.tickOnce();
  await expect(ignored.flush()).rejects.toThrow('disk');
});

function memoryDb(): RiftDb {
  const writers = new Map<string, PrismaWrite>();
  return new Proxy({} as RiftDb, {
    get(_target, prop) {
      const name = String(prop);
      const cached = writers.get(name);
      if (cached !== undefined) {
        return cached;
      }
      const rows: Record<string, unknown>[] = [];
      const writer: PrismaWrite = {
        async create({ data }) {
          rows.push({ ...data });
          return data;
        },
        async upsert({ where, create, update }) {
          const found = rows.find((row) => row.id === where.id);
          if (found === undefined) {
            const next = { ...create };
            rows.push(next);
            return next;
          }
          Object.assign(found, update);
          return found;
        },
        async findUnique({ where }) {
          const found = rows.find((row) => row.id === where.id);
          return found === undefined ? null : { ...found };
        },
        async findMany() {
          return rows.map((row) => ({ ...row }));
        },
        async update({ where, data }) {
          const found = rows.find((row) => row.id === where.id);
          if (found === undefined) {
            throw new Error(`missing ${name}`);
          }
          Object.assign(found, data);
          return { ...found };
        },
        async delete({ where }) {
          const index = rows.findIndex((row) => row.id === where.id);
          if (index >= 0) {
            rows.splice(index, 1);
          }
          return {};
        },
        async deleteMany() {
          rows.splice(0, rows.length);
          return { count: 0 };
        },
      };
      writers.set(name, writer);
      return writer;
    },
  });
}

test('guild create debits character gold and rejects a short roster', async () => {
  const built = await buildApp({ nowMs: 1_000, jwtSecret: 'test-secret' });
  try {
    built.creditGold('m0', 10_000);
    const short = await built.app.inject({
      method: 'POST',
      url: '/guild',
      payload: {
        name: 'Red Wolves',
        tag: 'RW',
        initiatorId: 'm0',
        members: [
          { id: 'm0', level: 5 },
          { id: 'm1', level: 5 },
          { id: 'm2', level: 5 },
        ],
        gold: 10_000,
      },
    });
    expect(short.statusCode).toBe(400);
    expect(built.economy.service.balance('m0')).toBe(10_000);

    const created = await built.app.inject({
      method: 'POST',
      url: '/guild',
      payload: {
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
      },
    });
    expect(created.statusCode).toBe(200);
    expect(built.economy.service.balance('m0')).toBe(0);

    const again = await built.app.inject({
      method: 'POST',
      url: '/guild',
      payload: {
        name: 'Blue Wolves',
        tag: 'BW',
        initiatorId: 'm0',
        members: [
          { id: 'm0', level: 5 },
          { id: 'a1', level: 5 },
          { id: 'a2', level: 5 },
          { id: 'a3', level: 5 },
        ],
        gold: 10_000,
      },
    });
    expect(again.statusCode).toBe(400);
    expect(again.json()).toMatchObject({ code: 'gold' });
  } finally {
    await built.close();
  }
});
