import type { QuestObjectiveKind, QuestProgress } from '@rift/domain/quests';
import { advance } from '@rift/domain/quests';
import { grantXp, monsterXp, type MonsterKind, type Progress } from '@rift/domain/progression';

export interface ProgressState {
  progress: Progress;
  quests: QuestProgress[];
}

export function onKill(
  state: ProgressState,
  monsterLevel: number,
  kind: MonsterKind,
  monsterId?: string,
): ProgressState {
  const xp = monsterXp(monsterLevel, kind);
  return {
    progress: grantXp(state.progress, xp),
    quests: advanceMatching(state.quests, 'kill', monsterId),
  };
}

export function onGather(state: ProgressState, subject?: string): ProgressState {
  return onObjective(state, 'gather', subject);
}

export function onCraft(state: ProgressState, subject?: string): ProgressState {
  return onObjective(state, 'craft', subject);
}

export function onVisit(state: ProgressState, subject?: string): ProgressState {
  return onObjective(state, 'visit', subject);
}

/**
 * One event updates objectives of `kind` that asked for `subject`.
 * An objective with no subject asked for any event of that kind.
 * A different subject on the same kind stays put.
 */
export function onObjective(
  state: ProgressState,
  kind: QuestObjectiveKind,
  subject?: string,
): ProgressState {
  return { progress: state.progress, quests: advanceMatching(state.quests, kind, subject) };
}

function advanceMatching(
  quests: readonly QuestProgress[],
  kind: QuestObjectiveKind,
  subject?: string,
): QuestProgress[] {
  return quests.map((quest) => {
    if (quest.status !== 'active') {
      return quest;
    }
    let next = quest;
    for (const objective of quest.objectives) {
      if (objective.kind !== kind) {
        continue;
      }
      if (objective.subject !== undefined && objective.subject !== subject) {
        continue;
      }
      next = advance(next, objective.id, 1);
    }
    return next;
  });
}
