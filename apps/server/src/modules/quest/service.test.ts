import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '@rift/content';
import { ACTIVE_QUEST_LIMIT, DAILY_QUEST_LIMIT } from '@rift/domain/quests';
import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import { createQuestModule, createQuestProgressRepository, QUEST_PROGRESS_TABLE } from './index';
import type { QuestOffer, QuestProgressRepository, RewardSink } from './index';
import type { QuestProgressRow } from './repository';

const contentData = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/content/data',
);

function offer(patch: Partial<QuestOffer> & Pick<QuestOffer, 'id'>): QuestOffer {
  return {
    prototype: true,
    story: false,
    daily: false,
    repeatable: false,
    difficulty: 'easy',
    objectives: [{ id: 'goal', kind: 'kill', target: 1 }],
    ...patch,
  };
}

const tutorial = offer({
  id: 'tutorial',
  story: true,
  difficulty: 'easy',
  objectives: [{ id: 'wake', kind: 'wake', target: 1 }],
});

const killRats = offer({
  id: 'kill_rats',
  repeatable: true,
  difficulty: 'normal',
  objectives: [{ id: 'kill', kind: 'kill', target: 5, monsterId: 'spore_rat' }],
});

function activeSeed(characterId: string, index: number): QuestProgressRow {
  return {
    id: `seed-${index}`,
    characterId,
    acceptedAtMs: 0,
    difficulty: 'easy',
    progress: {
      questId: `regular_${index}`,
      story: false,
      contract: false,
      daily: false,
      repeatable: false,
      status: 'active',
      objectives: [{ id: 'goal', kind: 'kill', target: 1, current: 0 }],
      itemIds: [],
      garbled: false,
    },
  };
}

function setup(options: {
  quests: readonly QuestOffer[];
  level?: number;
  upy?: number;
  repository?: QuestProgressRepository;
  startMs?: number;
}) {
  const bus = createBus();
  const clock = manualClock(options.startMs ?? 0);
  const repository = options.repository ?? createQuestProgressRepository();
  const grants: { characterId: string; gold: number; xp: number }[] = [];
  const completed: { characterId: string; questId: string }[] = [];
  const rewards: RewardSink = {
    async grant(characterId, reward) {
      grants.push({ characterId, gold: reward.gold, xp: reward.xp });
    },
  };
  bus.on('quest.completed', (payload) => {
    completed.push(payload);
  });
  const questModule = createQuestModule({
    quests: options.quests,
    rewards,
    characters: {
      async levelOf() {
        return options.level ?? 1;
      },
      async upyOf() {
        return options.upy ?? 100;
      },
    },
    repository,
  });
  questModule.start({ bus, now: () => clock.now() });
  return { bus, clock, repository, grants, completed, service: questModule.service, questModule };
}

test('quest progress is stored as quest_progress', () => {
  const repository = createQuestProgressRepository();
  expect(repository.table).toBe(QUEST_PROGRESS_TABLE);
  expect(QUEST_PROGRESS_TABLE).toBe('quest_progress');
});

test('accepts the tutorial and kill_rats, and the tutorial stays readable', async () => {
  const { service, repository, questModule } = setup({ quests: [tutorial, killRats] });
  expect(questModule.name).toBe('quest');

  const story = await service.accept('c1', 'tutorial', 0);
  const hunt = await service.accept('c1', 'kill_rats', 0);
  expect(story).toEqual({ ok: true, value: undefined });
  expect(hunt).toEqual({ ok: true, value: undefined });

  const rows = await repository.list('c1');
  expect(rows.map((row) => row.progress.questId).sort()).toEqual(['kill_rats', 'tutorial']);
  expect(rows.find((row) => row.progress.questId === 'tutorial')?.progress.garbled).toBe(false);
});

test('twenty ordinary quests fill the limit and the tutorial still accepts', async () => {
  const repository = createQuestProgressRepository();
  for (let index = 0; index < ACTIVE_QUEST_LIMIT; index += 1) {
    await repository.insert(activeSeed('c1', index));
  }
  const contract = offer({ id: 'guild_contract', contract: true, repeatable: true });
  const { service } = setup({
    quests: [tutorial, killRats, contract],
    repository,
  });

  const story = await service.accept('c1', 'tutorial', 0);
  const ordinary = await service.accept('c1', 'kill_rats', 0);
  const guild = await service.accept('c1', 'guild_contract', 0);

  expect(story.ok).toBe(true);
  expect(ordinary).toEqual({ ok: false, code: 'limit' });
  expect(guild.ok).toBe(true);
  expect(ACTIVE_QUEST_LIMIT).toBe(20);
});

test('reporting five rats pays 100 gold and 100 xp once on turn-in', async () => {
  const harness = setup({ quests: [killRats], level: 1, upy: 100 });
  await harness.service.report('c1', 'kill_rats', 'kill', 5);
  expect(await harness.repository.list('c1')).toEqual([]);

  const missing = await harness.service.turnIn('c1', 'kill_rats');
  expect(missing).toEqual({ ok: false, code: 'inactive' });
  expect(harness.grants).toEqual([]);

  expect(await harness.service.accept('c1', 'kill_rats', harness.clock.now())).toEqual({
    ok: true,
    value: undefined,
  });
  const early = await harness.service.turnIn('c1', 'kill_rats');
  expect(early).toEqual({ ok: false, code: 'incomplete' });
  expect(harness.grants).toEqual([]);
  expect(harness.completed).toEqual([]);

  await harness.service.report('c1', 'kill_rats', 'kill', 5);
  const paid = await harness.service.turnIn('c1', 'kill_rats');
  expect(paid).toEqual({ ok: true, value: { gold: 100, xp: 100 } });
  expect(harness.grants).toEqual([{ characterId: 'c1', gold: 100, xp: 100 }]);
  expect(harness.completed).toEqual([{ characterId: 'c1', questId: 'kill_rats' }]);

  const again = await harness.service.turnIn('c1', 'kill_rats');
  expect(again).toEqual({ ok: false, code: 'inactive' });
  expect(harness.grants).toHaveLength(1);
  expect(harness.completed).toHaveLength(1);

  const retake = await harness.service.accept('c1', 'kill_rats', harness.clock.now());
  expect(retake.ok).toBe(true);
});

test('a higher level uses the same normal coefficient', async () => {
  const { service, grants } = setup({ quests: [killRats], level: 2 });
  await service.accept('c1', 'kill_rats', 0);
  await service.report('c1', 'kill_rats', 'kill', 5);
  const paid = await service.turnIn('c1', 'kill_rats');
  expect(paid).toEqual({ ok: true, value: { gold: 200, xp: 200 } });
  expect(grants).toEqual([{ characterId: 'c1', gold: 200, xp: 200 }]);
});

test('an unknown quest is missing and a report does not create it', async () => {
  const { service, repository } = setup({ quests: [killRats] });
  expect(await service.accept('c1', 'no_such_quest', 0)).toEqual({ ok: false, code: 'missing' });
  await service.report('c1', 'no_such_quest', 'kill', 1);
  expect(await repository.list('c1')).toEqual([]);
});

test('duplicate and once are reported before the language gate', async () => {
  const repository = createQuestProgressRepository();
  await repository.insert(activeSeed('c1', 0));
  await repository.insert({
    id: 'done-craft',
    characterId: 'c1',
    acceptedAtMs: 0,
    difficulty: 'easy',
    progress: {
      questId: 'first_craft',
      story: false,
      daily: false,
      repeatable: false,
      status: 'completed',
      objectives: [{ id: 'craft', kind: 'craft', target: 1, current: 1 }],
      itemIds: [],
      garbled: false,
    },
  });
  const firstCraft = offer({
    id: 'first_craft',
    objectives: [{ id: 'craft', kind: 'craft', target: 1 }],
  });
  const { service, repository: store } = setup({
    quests: [killRats, firstCraft, offer({ id: 'regular_0' })],
    upy: 30,
    repository,
  });

  expect(await service.accept('c1', 'regular_0', 0)).toEqual({ ok: false, code: 'duplicate' });
  expect(await service.accept('c1', 'first_craft', 0)).toEqual({ ok: false, code: 'once' });
  expect(await service.accept('c1', 'kill_rats', 0)).toEqual({ ok: false, code: 'language' });
  expect((await store.list('c1')).some((row) => row.progress.questId === 'kill_rats')).toBe(false);
});

test('upy 40 marks the quest garbled and still tracks the same objectives', async () => {
  const { service, repository } = setup({ quests: [killRats], upy: 40 });
  expect((await service.accept('c1', 'kill_rats', 0)).ok).toBe(true);
  const row = (await repository.list('c1')).find((item) => item.progress.questId === 'kill_rats');
  expect(row?.progress.garbled).toBe(true);
  expect(row?.progress.objectives).toEqual([{ id: 'kill', kind: 'kill', target: 5, current: 0 }]);
});

test('a daily at both caps is refused as daily', async () => {
  const repository = createQuestProgressRepository();
  for (let index = 0; index < ACTIVE_QUEST_LIMIT; index += 1) {
    await repository.insert(activeSeed('c1', index));
  }
  const day = 86_400_000;
  for (let index = 0; index < DAILY_QUEST_LIMIT; index += 1) {
    await repository.insert({
      id: `daily-seed-${index}`,
      characterId: 'c1',
      acceptedAtMs: day + 10,
      difficulty: 'easy',
      progress: {
        questId: `held_daily_${index}`,
        story: false,
        daily: true,
        repeatable: true,
        status: 'completed',
        objectives: [{ id: 'goal', kind: 'kill', target: 1, current: 1 }],
        itemIds: [],
        garbled: false,
      },
    });
  }
  const { service } = setup({
    quests: [offer({ id: 'daily_next', daily: true, repeatable: true })],
    repository,
  });
  expect(await service.accept('c1', 'daily_next', day + 20)).toEqual({ ok: false, code: 'daily' });
});

test('the sixth daily waits until the next UTC midnight', async () => {
  expect(DAILY_QUEST_LIMIT).toBe(5);
  const quests = Array.from({ length: DAILY_QUEST_LIMIT + 1 }, (_, index) =>
    offer({ id: `daily_${index}`, daily: true, repeatable: true }),
  );
  const { service } = setup({ quests });
  const day = 86_400_000;
  for (let index = 0; index < DAILY_QUEST_LIMIT; index += 1) {
    const accepted = await service.accept('c1', `daily_${index}`, day + 1_000);
    expect(accepted.ok).toBe(true);
  }
  expect(await service.accept('c1', `daily_${DAILY_QUEST_LIMIT}`, day + 1_000)).toEqual({
    ok: false,
    code: 'daily',
  });
  expect(await service.accept('c1', `daily_${DAILY_QUEST_LIMIT}`, day * 2)).toEqual({
    ok: true,
    value: undefined,
  });
});

test('abandon fails the quest, returns its items, and does not pay', async () => {
  const carry = offer({
    id: 'carry',
    itemIds: ['seal', 'map'],
    objectives: [{ id: 'deliver', kind: 'deliver', target: 1 }],
  });
  const { service, repository, grants, completed } = setup({ quests: [carry] });
  await service.accept('c1', 'carry', 0);
  const left = await service.abandon('c1', 'carry');
  expect(left).toEqual({ ok: true, value: { removeItemIds: ['seal', 'map'] } });
  const row = (await repository.list('c1')).find((item) => item.progress.questId === 'carry');
  expect(row?.progress.status).toBe('failed');
  expect(await service.turnIn('c1', 'carry')).toEqual({ ok: false, code: 'inactive' });
  expect(await service.abandon('c1', 'carry')).toEqual({ ok: false, code: 'inactive' });
  expect(grants).toEqual([]);
  expect(completed).toEqual([]);
});

test('a deadline failure blocks report and turn-in without paying', async () => {
  const timed = offer({
    id: 'timed',
    expiresAtMs: 1_000,
    itemIds: ['token'],
    objectives: [{ id: 'visit', kind: 'visit', target: 1 }],
  });
  const { service, repository, clock, grants } = setup({ quests: [timed] });
  expect((await service.accept('c1', 'timed', 0)).ok).toBe(true);
  clock.advance(1_001);
  await service.report('c1', 'timed', 'visit', 1);
  const row = (await repository.list('c1')).find((item) => item.progress.questId === 'timed');
  expect(row?.progress.status).toBe('failed');
  expect(row?.progress.objectives[0]?.current).toBe(0);
  expect(await service.turnIn('c1', 'timed')).toEqual({ ok: false, code: 'inactive' });
  expect(grants).toEqual([]);
});

test('catalog quests from @rift/content accept and pay the normal rat hunt', async () => {
  const catalog = loadCatalog(contentData);
  expect(catalog.quests.map((quest) => quest.id)).toEqual([
    'tutorial',
    'kill_rats',
    'gather_metal',
    'gather_spores',
    'first_craft',
    'visit_hub',
  ]);
  const { service, grants, completed, repository } = setup({
    quests: catalog.quests,
    level: 1,
    upy: 100,
  });

  expect((await service.accept('c1', 'tutorial', 0)).ok).toBe(true);
  expect((await service.accept('c1', 'kill_rats', 0)).ok).toBe(true);
  const story = (await repository.list('c1')).find((row) => row.progress.questId === 'tutorial');
  expect(story?.progress.garbled).toBe(false);
  expect(story?.progress.story).toBe(true);
  expect(story?.progress.objectives).toHaveLength(10);

  await service.report('c1', 'kill_rats', 'kill', 5);
  expect(await service.turnIn('c1', 'kill_rats')).toEqual({
    ok: true,
    value: { gold: 100, xp: 100 },
  });
  expect(grants).toEqual([{ characterId: 'c1', gold: 100, xp: 100 }]);
  expect(completed).toEqual([{ characterId: 'c1', questId: 'kill_rats' }]);
  const second = await service.turnIn('c1', 'kill_rats');
  expect(second).toEqual({ ok: false, code: 'inactive' });
  expect(grants).toHaveLength(1);
});

test('the bus used by the module is the one passed to start', () => {
  const bus = createBus();
  const clock = manualClock(50);
  let seen = 0;
  bus.on('quest.completed', () => {
    seen += 1;
  });
  const questModule = createQuestModule({
    quests: [],
    rewards: {
      async grant() {
        return undefined;
      },
    },
    characters: {
      async levelOf() {
        return 1;
      },
      async upyOf() {
        return 100;
      },
    },
  });
  questModule.start({ bus, now: () => clock.now() });
  bus.emit('quest.completed', { characterId: 'c1', questId: 'tutorial' });
  expect(seen).toBe(1);
  expect(clock.now()).toBe(50);
});
