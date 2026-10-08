import type { QuestObjectiveKind, QuestProgress } from '@rift/domain/quests';
import { advance } from '@rift/domain/quests';
import { applyDoctrine } from '@rift/domain/guild';
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
  doctrineId?: string,
): ProgressState {
  const baseXp = monsterXp(monsterLevel, kind);
  const xp = doctrineId === 'knowledge' ? applyDoctrine('knowledge', baseXp) : baseXp;
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
 * One event updates the objective that asked for `subject`.
 * A named subject matches that monster, item, or place.
 * An objective with no subject matches its own id, or the quest id when it is
 * the only unnamed objective of this kind on that quest. A bare kind does not
 * move every unnamed objective together.
 */
export function onObjective(
  state: ProgressState,
  kind: QuestObjectiveKind,
  subject?: string,
): ProgressState {
  return { progress: state.progress, quests: advanceMatching(state.quests, kind, subject) };
}

export function askedObjective(
  quest: { questId: string; objectives: readonly { id: string; kind: string; subject?: string }[] },
  objective: { id: string; kind: string; subject?: string },
  kind: string,
  subject: string | undefined,
): boolean {
  if (objective.kind !== kind) {
    return false;
  }
  if (objective.subject !== undefined) {
    return subject !== undefined && objective.subject === subject;
  }
  if (subject === undefined) {
    return false;
  }
  if (subject === objective.id) {
    return true;
  }
  if (subject !== quest.questId) {
    return false;
  }
  const unnamed = quest.objectives.filter((row) => row.kind === kind && row.subject === undefined);
  return unnamed.length === 1 && unnamed[0]?.id === objective.id;
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
      if (!askedObjective(quest, objective, kind, subject)) {
        continue;
      }
      next = advance(next, objective.id, 1);
    }
    return next;
  });
}
