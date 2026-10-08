import { expect, test } from 'vitest';
import type { Result } from './result';
import {
  ACTIVE_QUEST_LIMIT,
  DAILY_QUEST_LIMIT,
  QUEST_DIFFICULTY_COEFFICIENT,
  QUEST_OBJECTIVE_KINDS,
  abandon,
  acceptQuest,
  advance,
  failExpired,
  questReward,
  recordChoice,
  branchScene,
  setWorldFlagOnce,
  turnIn,
  utcDayStartMs,
  type QuestObjective,
  type QuestObjectiveKind,
  type QuestProgress,
  type WorldQuestFlags,
} from './quests';

function objective(
  id: string,
  kind: QuestObjectiveKind,
  target: number,
  current = 0,
): QuestObjective {
  return { id, kind, target, current };
}

function progress(patch: Partial<QuestProgress> & { questId: string }): QuestProgress {
  return {
    questId: patch.questId,
    story: patch.story ?? false,
    contract: patch.contract,
    daily: patch.daily ?? false,
    repeatable: patch.repeatable ?? false,
    status: patch.status ?? 'active',
    objectives: patch.objectives ?? [objective('goal', 'kill', 1)],
    itemIds: patch.itemIds ?? [],
    expiresAtMs: patch.expiresAtMs,
    garbled: patch.garbled ?? false,
    choiceId: patch.choiceId,
  };
}

function regulars(count: number, status: QuestProgress['status'] = 'active'): QuestProgress[] {
  const quests: QuestProgress[] = [];
  for (let index = 0; index < count; index += 1) {
    quests.push(progress({ questId: `regular_${index}`, status }));
  }
  return quests;
}

function unwrap<T, E extends string>(result: Result<T, E>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.code);
  }
  return result.value;
}

function expectCode<E extends string>(result: Result<unknown, E>, code: E): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
  }
}

test('reward is 50 times coefficient times level, and both payouts are integers', () => {
  expect(QUEST_DIFFICULTY_COEFFICIENT).toEqual({ easy: 1, normal: 2, hard: 5, epic: 10 });
  expect(questReward(1, 'easy')).toEqual({ gold: 50, xp: 50 });
  expect(questReward(1, 'normal')).toEqual({ gold: 100, xp: 100 });
  expect(questReward(20, 'hard')).toEqual({ gold: 5000, xp: 5000 });
  expect(questReward(4, 'epic')).toEqual({ gold: 2000, xp: 2000 });
  const fractional = questReward(1 / 3, 'hard');
  expect(fractional).toEqual({ gold: 83, xp: 83 });
  expect(Number.isInteger(fractional.gold)).toBe(true);
  expect(Number.isInteger(fractional.xp)).toBe(true);
});

test('the 21st ordinary quest hits the limit and a story quest still fits', () => {
  expect(ACTIVE_QUEST_LIMIT).toBe(20);
  const active = regulars(20);
  const ordinary = progress({ questId: 'ordinary_21' });
  expectCode(
    acceptQuest({
      active,
      completedOnce: [],
      quest: ordinary,
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
    'limit',
  );
  expect(active).toHaveLength(20);

  const story = progress({ questId: 'story_21', story: true });
  const accepted = unwrap(
    acceptQuest({
      active,
      completedOnce: [],
      quest: story,
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(accepted).toHaveLength(21);
  expect(accepted[20]?.questId).toBe('story_21');
  expect(accepted[20]?.status).toBe('active');
  expect(active).toHaveLength(20);
});

test('stories and contracts do not fill active slots', () => {
  const stories = Array.from({ length: 20 }, (_ignored, index) =>
    progress({ questId: `story_${index}`, story: true }),
  );
  const afterStories = unwrap(
    acceptQuest({
      active: stories,
      completedOnce: [],
      quest: progress({ questId: 'ordinary' }),
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(afterStories).toHaveLength(21);

  const contracts = Array.from({ length: 20 }, (_ignored, index) =>
    progress({ questId: `contract_${index}`, contract: true }),
  );
  const afterContracts = unwrap(
    acceptQuest({
      active: contracts,
      completedOnce: [],
      quest: progress({ questId: 'ordinary' }),
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(afterContracts).toHaveLength(21);

  const full = regulars(20);
  const contract = unwrap(
    acceptQuest({
      active: full,
      completedOnce: [],
      quest: progress({ questId: 'guild_contract', contract: true }),
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(contract).toHaveLength(21);
  expect(contract[20]?.contract).toBe(true);
});

test('failed ordinary quests do not occupy the active limit', () => {
  const accepted = unwrap(
    acceptQuest({
      active: regulars(20, 'failed'),
      completedOnce: [],
      quest: progress({ questId: 'fresh' }),
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(accepted).toHaveLength(21);
  expect(accepted[20]?.status).toBe('active');
});

test('the sixth daily is rejected and the fifth is accepted', () => {
  expect(DAILY_QUEST_LIMIT).toBe(5);
  const daily = progress({ questId: 'daily_job', daily: true, repeatable: true });
  expectCode(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest: daily,
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 5,
    }),
    'daily',
  );
  const accepted = unwrap(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest: daily,
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 4,
    }),
  );
  expect(accepted).toHaveLength(1);
  expect(accepted[0]?.daily).toBe(true);

  const ordinary = unwrap(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest: progress({ questId: 'not_daily' }),
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 5,
    }),
  );
  expect(ordinary[0]?.questId).toBe('not_daily');
});

test('daily cap is checked before the active cap', () => {
  expectCode(
    acceptQuest({
      active: regulars(20),
      completedOnce: [],
      quest: progress({ questId: 'daily_full', daily: true }),
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 5,
    }),
    'daily',
  );
});

test('upy 30 denies, 40 marks garbled, and 61 keeps the text clear', () => {
  const quest = progress({
    questId: 'npc_job',
    garbled: true,
    objectives: [objective('rats', 'kill', 5), objective('ore', 'gather', 3)],
  });
  expectCode(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest,
      upy: 30,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
    'language',
  );
  expect(quest.garbled).toBe(true);
  expect(quest.objectives[0]?.current).toBe(0);

  const garbled = unwrap(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest: progress({
        questId: 'npc_job',
        objectives: [objective('rats', 'kill', 5)],
      }),
      upy: 40,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(garbled[0]?.garbled).toBe(true);
  expect(garbled[0]?.objectives).toEqual([objective('rats', 'kill', 5)]);

  const clear = unwrap(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest: progress({
        questId: 'npc_job',
        garbled: true,
        objectives: [objective('rats', 'kill', 5)],
      }),
      upy: 61,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(clear[0]?.garbled).toBe(false);
  expect(clear[0]?.objectives).toEqual([objective('rats', 'kill', 5)]);
});

test('language boundaries follow questLanguageAccess', () => {
  const quest = progress({ questId: 'bounds' });
  expectCode(
    acceptQuest({
      active: regulars(20),
      completedOnce: [],
      quest,
      upy: 0,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
    'language',
  );
  const at31 = unwrap(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest,
      upy: 31,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(at31[0]?.garbled).toBe(true);
  const at60 = unwrap(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest: progress({ questId: 'bounds_60' }),
      upy: 60,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(at60[0]?.garbled).toBe(true);
});

test('a story quest is still refused when the language gate denies it', () => {
  expectCode(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest: progress({ questId: 'tale', story: true }),
      upy: 30,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
    'language',
  );
});

test('a one-time quest already completed is refused and a repeatable one is not', () => {
  const once = progress({ questId: 'once_job', repeatable: false, daily: false });
  expectCode(
    acceptQuest({
      active: [],
      completedOnce: ['once_job'],
      quest: once,
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
    'once',
  );
  const repeatable = unwrap(
    acceptQuest({
      active: [],
      completedOnce: ['again'],
      quest: progress({ questId: 'again', repeatable: true }),
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(repeatable[0]?.questId).toBe('again');

  const dailyAgain = unwrap(
    acceptQuest({
      active: [],
      completedOnce: ['daily_job'],
      quest: progress({ questId: 'daily_job', daily: true, repeatable: false }),
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(dailyAgain[0]?.daily).toBe(true);

  const freshOnce = unwrap(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest: once,
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(freshOnce[0]?.status).toBe('active');
});

test('identity and language errors win over later caps', () => {
  const quest = progress({ questId: 'regular_0' });
  expectCode(
    acceptQuest({
      active: regulars(1),
      completedOnce: [],
      quest,
      upy: 30,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
    'duplicate',
  );
  expectCode(
    acceptQuest({
      active: [],
      completedOnce: ['once_job'],
      quest: progress({ questId: 'once_job' }),
      upy: 30,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
    'once',
  );
});

test('the same quest id already tracked is a duplicate', () => {
  const active = [progress({ questId: 'same', status: 'failed' })];
  expectCode(
    acceptQuest({
      active,
      completedOnce: [],
      quest: progress({ questId: 'same', repeatable: true }),
      upy: 100,
      nowMs: 0,
      dailiesAcceptedToday: 0,
    }),
    'duplicate',
  );
  expect(active).toHaveLength(1);
});

test('advance clamps at the target and ignores an unknown objective', () => {
  const quest = progress({
    questId: 'hunt',
    objectives: [objective('rats', 'kill', 2), objective('speak', 'talk', 1)],
  });
  const advanced = advance(quest, 'rats', 3);
  expect(advanced.objectives[0]?.current).toBe(2);
  expect(advanced.objectives[1]?.current).toBe(0);
  expect(quest.objectives[0]?.current).toBe(0);
  expect(advanced).not.toBe(quest);

  expect(advance(quest, 'missing', 1)).toBe(quest);
  expect(advance(advanced, 'rats', 1)).toBe(advanced);
  expect(advance(quest, 'rats', 0)).toBe(quest);
  expect(advance(quest, 'rats', -2)).toBe(quest);
});

test('a story scene stays on the objective when the counter advances', () => {
  const quest = progress({
    questId: 'act3_light',
    story: true,
    objectives: [{ id: 'shutdown', kind: 'hack', target: 1, current: 0, scene: 'Shutdown. Start the mechanism that drops the Barrier.' }],
  });
  const advanced = advance(quest, 'shutdown', 1);
  expect(advanced.objectives[0]).toEqual({
    id: 'shutdown',
    kind: 'hack',
    target: 1,
    current: 1,
    scene: 'Shutdown. Start the mechanism that drops the Barrier.',
  });
});

test('every objective kind is a counter capped at its target', () => {
  expect(QUEST_OBJECTIVE_KINDS).toEqual([
    'kill',
    'collect',
    'gather',
    'craft',
    'deliver',
    'visit',
    'talk',
    'hack',
    'survive',
    'escort',
    'defend',
    'capture',
    'investigate',
    'rescue',
    'sabotage',
    'discover',
    'learn',
    'trade',
    'pvp',
    'lore',
  ]);
  for (const kind of QUEST_OBJECTIVE_KINDS) {
    const quest = progress({
      questId: kind,
      objectives: [objective(kind, kind, 2)],
    });
    expect(advance(quest, kind, 1).objectives[0]?.current).toBe(1);
  }
});

test('turn-in needs every objective full and an active quest', () => {
  const quest = progress({
    questId: 'errand',
    objectives: [objective('collect', 'collect', 2, 2), objective('deliver', 'deliver', 1, 0)],
    itemIds: ['parcel'],
  });
  expectCode(turnIn(quest, 20, 'hard'), 'incomplete');
  expect(quest.status).toBe('active');

  const ready = advance(quest, 'deliver', 1);
  const turned = unwrap(turnIn(ready, 20, 'hard'));
  expect(turned.gold).toBe(5000);
  expect(turned.xp).toBe(5000);
  expect(turned.progress.status).toBe('completed');
  expect(ready.status).toBe('active');
  expectCode(turnIn(turned.progress, 20, 'hard'), 'inactive');
});

test('a deadline strictly after expiresAt fails the quest and blocks turn-in', () => {
  const quest = progress({
    questId: 'timed',
    expiresAtMs: 1_000,
    objectives: [objective('visit', 'visit', 1, 1)],
    itemIds: ['token'],
  });
  expect(failExpired(quest, 1_000)).toBe(quest);
  expect(quest.status).toBe('active');

  const failed = failExpired(quest, 1_001);
  expect(failed.status).toBe('failed');
  expect(failed.itemIds).toEqual(['token']);
  expect(quest.status).toBe('active');
  expectCode(turnIn(failed, 1, 'easy'), 'inactive');
  expect(failExpired(failed, 5_000)).toBe(failed);
});

test('abandon fails the quest, lists its items, and pays nothing', () => {
  const quest = progress({
    questId: 'carry',
    objectives: [objective('deliver', 'deliver', 1, 1)],
    itemIds: ['seal', 'map'],
  });
  const abandoned = abandon(quest);
  expect(abandoned.progress.status).toBe('failed');
  expect(abandoned.removeItemIds).toEqual(['seal', 'map']);
  expect(abandoned.progress.itemIds).toEqual(['seal', 'map']);
  expect('gold' in abandoned).toBe(false);
  expect(quest.status).toBe('active');
  abandoned.removeItemIds.push('extra');
  expect(abandoned.progress.itemIds).toEqual(['seal', 'map']);
  expectCode(turnIn(abandoned.progress, 1, 'normal'), 'inactive');
});

test('accept copies the template, forces active, and does not mutate the log', () => {
  const template = progress({
    questId: 'board',
    status: 'failed',
    objectives: [objective('craft', 'craft', 1)],
    itemIds: ['blueprint'],
  });
  const active = [progress({ questId: 'other' })];
  const accepted = unwrap(
    acceptQuest({
      active,
      completedOnce: [],
      quest: template,
      upy: 80,
      nowMs: 50,
      dailiesAcceptedToday: 1,
    }),
  );
  expect(accepted).not.toBe(active);
  expect(active).toHaveLength(1);
  expect(template.status).toBe('failed');
  expect(accepted[1]?.status).toBe('active');
  expect(accepted[1]?.garbled).toBe(false);
  expect(accepted[1]?.itemIds).toEqual(['blueprint']);
  expect(accepted[1]?.objectives[0]).not.toBe(template.objectives[0]);
});

test('a story quest has no deadline and a past deadline is stored failed', () => {
  const story = progress({
    questId: 'tale',
    story: true,
    expiresAtMs: 1_000,
    objectives: [objective('talk', 'talk', 1, 1)],
  });
  const acceptedStory = unwrap(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest: story,
      upy: 100,
      nowMs: 5_000,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(story.expiresAtMs).toBe(1_000);
  expect(acceptedStory[0]?.status).toBe('active');
  expect(acceptedStory[0]?.expiresAtMs).toBeUndefined();
  expect(failExpired(acceptedStory[0] ?? story, 9_000)).toBe(acceptedStory[0]);
  expect(unwrap(turnIn(acceptedStory[0] ?? story, 1, 'easy')).progress.status).toBe('completed');

  const late = unwrap(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest: progress({
        questId: 'late',
        expiresAtMs: 1_000,
        objectives: [objective('survive', 'survive', 1, 1)],
      }),
      upy: 100,
      nowMs: 1_001,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(late[0]?.status).toBe('failed');
  expectCode(turnIn(late[0] ?? story, 1, 'easy'), 'inactive');

  const onTime = unwrap(
    acceptQuest({
      active: [],
      completedOnce: [],
      quest: progress({
        questId: 'on_time',
        expiresAtMs: 2_000,
        objectives: [objective('hack', 'hack', 1, 0)],
      }),
      upy: 100,
      nowMs: 2_000,
      dailiesAcceptedToday: 0,
    }),
  );
  expect(onTime[0]?.status).toBe('active');
  expect(onTime[0]?.expiresAtMs).toBe(2_000);
});

test('limits are checked before a past deadline is stored', () => {
  expectCode(
    acceptQuest({
      active: regulars(20),
      completedOnce: [],
      quest: progress({ questId: 'late_ordinary', expiresAtMs: 1 }),
      upy: 100,
      nowMs: 2,
      dailiesAcceptedToday: 0,
    }),
    'limit',
  );
});

test('choice is personal and world flags are set once', () => {
  const flags: WorldQuestFlags = { barrierDown: false, primordialOpened: false };
  const quest = progress({ questId: 'fork' });
  const chosen = recordChoice(quest, 'path_b');
  expect(chosen.choiceId).toBe('path_b');
  expect(chosen).not.toBe(quest);
  expect(quest.choiceId).toBeUndefined();
  const koval = {
    id: 'koval',
    kind: 'craft' as const,
    target: 1,
    current: 0,
    scene: 'Master Koval. Buy gear and learn the forge.',
  };
  expect(branchScene(chosen, koval)).toBe(koval.scene);
  expect(branchScene(recordChoice(quest, 'question'), koval)).toContain('questioned the council');
  expect(flags).toEqual({ barrierDown: false, primordialOpened: false });

  const barrier = setWorldFlagOnce(flags, 'barrierDown');
  expect(barrier).toEqual({ barrierDown: true, primordialOpened: false });
  expect(flags).toEqual({ barrierDown: false, primordialOpened: false });
  expect(setWorldFlagOnce(barrier, 'barrierDown')).toBe(barrier);

  const both = setWorldFlagOnce(barrier, 'primordialOpened');
  expect(both).toEqual({ barrierDown: true, primordialOpened: true });
  expect(setWorldFlagOnce(both, 'primordialOpened')).toBe(both);
  expect(barrier.primordialOpened).toBe(false);
});

test('daily reset is midnight UTC', () => {
  const day = 86_400_000;
  expect(utcDayStartMs(0)).toBe(0);
  expect(utcDayStartMs(day - 1)).toBe(0);
  expect(utcDayStartMs(day)).toBe(day);
  expect(utcDayStartMs(day + 3_600_000)).toBe(day);
  const secondDay = Date.UTC(2026, 0, 2);
  expect(utcDayStartMs(secondDay + 86_399_999)).toBe(secondDay);
  expect(utcDayStartMs(-1)).toBe(-day);
});

test('a non-finite clock is a programmer error', () => {
  const quest = progress({ questId: 'clock' });
  expect(() => failExpired(quest, Number.NaN)).toThrow(/nowMs/);
  expect(() => utcDayStartMs(Number.POSITIVE_INFINITY)).toThrow(/nowMs/);
  expect(() =>
    acceptQuest({
      active: [],
      completedOnce: [],
      quest,
      upy: 100,
      nowMs: Number.NaN,
      dailiesAcceptedToday: 0,
    }),
  ).toThrow(/nowMs/);
  expect(quest.status).toBe('active');
});
