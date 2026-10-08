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
): ProgressState {
  const xp = monsterXp(monsterLevel, kind);
  return {
    progress: grantXp(state.progress, xp),
    quests: advanceMatching(state.quests, 'kill'),
  };
}

export function onGather(state: ProgressState): ProgressState {
  return { progress: state.progress, quests: advanceMatching(state.quests, 'gather') };
}

export function onCraft(state: ProgressState): ProgressState {
  return { progress: state.progress, quests: advanceMatching(state.quests, 'craft') };
}

export function onVisit(state: ProgressState): ProgressState {
  return { progress: state.progress, quests: advanceMatching(state.quests, 'visit') };
}

function advanceMatching(quests: readonly QuestProgress[], kind: QuestObjectiveKind): QuestProgress[] {
  return quests.map((quest) => {
    if (quest.status !== 'active') {
      return quest;
    }
    let next = quest;
    for (const objective of quest.objectives) {
      if (objective.kind === kind) {
        next = advance(next, objective.id, 1);
      }
    }
    return next;
  });
}
