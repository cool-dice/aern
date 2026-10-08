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

test('a named kill or visit does not advance a different ask of the same kind', () => {
  const rats = quest('kill', 'kill_rats');
  const ratsObjective = rats.objectives[0];
  if (ratsObjective === undefined) {
    throw new Error('missing objective');
  }
  rats.objectives = [{ ...ratsObjective, id: 'rats', subject: 'spore_rat' }];
  const bandits = quest('kill', 'kill_bandits');
  const banditObjective = bandits.objectives[0];
  if (banditObjective === undefined) {
    throw new Error('missing objective');
  }
  bandits.objectives = [{ ...banditObjective, id: 'bandits', subject: 'bandit' }];
  const outer = quest('visit', 'act3_light');
  const outerObjective = outer.objectives[0];
  if (outerObjective === undefined) {
    throw new Error('missing objective');
  }
  outer.objectives = [{ ...outerObjective, id: 'outer_ring', subject: 'primordial_outer', target: 1 }];
  const middle = quest('visit', 'act3_middle');
  const middleObjective = middle.objectives[0];
  if (middleObjective === undefined) {
    throw new Error('missing objective');
  }
  middle.objectives = [{ ...middleObjective, id: 'middle_ring', subject: 'primordial_middle', target: 1 }];
  const state = { progress: fresh.progress, quests: [rats, bandits, outer, middle] };
  const killed = onKill(state, 1, 'normal', 'spore_rat');
  expect(killed.quests.find((row) => row.questId === 'kill_rats')?.objectives[0]?.current).toBe(1);
  expect(killed.quests.find((row) => row.questId === 'kill_bandits')?.objectives[0]?.current).toBe(0);
  const visited = onVisit(state, 'primordial_outer');
  expect(visited.quests.find((row) => row.questId === 'act3_light')?.objectives[0]?.current).toBe(1);
  expect(visited.quests.find((row) => row.questId === 'act3_middle')?.objectives[0]?.current).toBe(0);
});
