import type { QuestDifficulty, QuestProgress } from '@rift/domain/quests';

/** Persistence name for quest state. There is no `character_quests` table. */
export const QUEST_PROGRESS_TABLE = 'quest_progress';

export interface QuestProgressRow {
  id: string;
  characterId: string;
  acceptedAtMs: number;
  difficulty: QuestDifficulty;
  progress: QuestProgress;
}

export interface QuestProgressRepository {
  readonly table: typeof QUEST_PROGRESS_TABLE;
  list(characterId: string): Promise<QuestProgressRow[]>;
  insert(row: QuestProgressRow): Promise<void>;
  save(row: QuestProgressRow): Promise<void>;
}

function cloneProgress(progress: QuestProgress): QuestProgress {
  const next: QuestProgress = {
    questId: progress.questId,
    story: progress.story,
    daily: progress.daily,
    repeatable: progress.repeatable,
    status: progress.status,
    objectives: progress.objectives.map((objective) => ({
      id: objective.id,
      kind: objective.kind,
      target: objective.target,
      current: objective.current,
      ...(objective.scene !== undefined ? { scene: objective.scene } : {}),
      ...(objective.subject !== undefined ? { subject: objective.subject } : {}),
    })),
    itemIds: progress.itemIds.slice(),
    garbled: progress.garbled,
  };
  if (progress.contract !== undefined) {
    next.contract = progress.contract;
  }
  if (progress.expiresAtMs !== undefined) {
    next.expiresAtMs = progress.expiresAtMs;
  }
  if (progress.choiceId !== undefined) {
    next.choiceId = progress.choiceId;
  }
  return next;
}

function cloneRow(row: QuestProgressRow): QuestProgressRow {
  return {
    id: row.id,
    characterId: row.characterId,
    acceptedAtMs: row.acceptedAtMs,
    difficulty: row.difficulty,
    progress: cloneProgress(row.progress),
  };
}

export function createQuestProgressRepository(): QuestProgressRepository {
  const rows: QuestProgressRow[] = [];

  return {
    table: QUEST_PROGRESS_TABLE,
    async list(characterId) {
      const owned: QuestProgressRow[] = [];
      for (const row of rows) {
        if (row.characterId === characterId) {
          owned.push(cloneRow(row));
        }
      }
      return owned;
    },
    async insert(row) {
      if (rows.some((stored) => stored.id === row.id)) {
        throw new Error(`${QUEST_PROGRESS_TABLE} duplicate: ${row.id}`);
      }
      rows.push(cloneRow(row));
    },
    async save(row) {
      const index = rows.findIndex(
        (stored) => stored.id === row.id && stored.characterId === row.characterId,
      );
      if (index < 0) {
        throw new Error(`${QUEST_PROGRESS_TABLE} missing: ${row.id}`);
      }
      rows[index] = cloneRow(row);
    },
  };
}
