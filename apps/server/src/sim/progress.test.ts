import type { QuestProgress } from '@rift/domain/quests';
import { emptyPoints } from '@rift/domain/stats';
import { expect, test } from 'vitest';
import { onCraft, onGather, onKill, onVisit } from './progress';

function quest(kind: QuestProgress['objectives'][number]['kind'], id = kind): QuestProgress {
  return {
    questId: id,
    story: false,
    daily: false,
    repeatable: false,
    status: 'active',
    objectives: [{ id, kind, target: 2, current: 0 }],
    itemIds: [],
    garbled: false,
  };
}

const fresh = {
  progress: { level: 1, xp: 0, unspent: 0, points: emptyPoints() },
  quests: [quest('kill'), quest('gather'), quest('craft'), quest('visit')],
};

test('a rat kill grants monster XP and advances only kill', () => {
  const next = onKill(fresh, 1, 'normal');
  expect(next.progress.xp).toBe(10);
  expect(next.quests.find((row) => row.questId === 'kill')?.objectives[0]?.current).toBe(1);
  expect(next.quests.find((row) => row.questId === 'gather')?.objectives[0]?.current).toBe(0);
});

test('gather, craft, and visit advance their own objectives', () => {
  expect(onGather(fresh).quests.find((row) => row.questId === 'gather')?.objectives[0]?.current).toBe(1);
  expect(onCraft(fresh).quests.find((row) => row.questId === 'craft')?.objectives[0]?.current).toBe(1);
  expect(onVisit(fresh).quests.find((row) => row.questId === 'visit')?.objectives[0]?.current).toBe(1);
  expect(onVisit(fresh).quests.find((row) => row.questId === 'kill')?.objectives[0]?.current).toBe(0);
});
