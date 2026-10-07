import { MEMORY_CAP, WORKING_MEMORY } from '@rift/domain/ai';
import {
  ADAPTER_TRAIN_PERIOD_MS,
  POLICY_TRAIN_PERIOD_MS,
  type AiRejection,
  type BotMemory,
  type MemoryEntry,
  type Result,
  type TrainAcceptance,
  type TrainKind,
} from './types';

const TRAIN_PERIOD_MS: Record<TrainKind, number> = {
  policy: POLICY_TRAIN_PERIOD_MS,
  adapter: ADAPTER_TRAIN_PERIOD_MS,
};

interface CharacterMemory {
  active: MemoryEntry[];
  archive: MemoryEntry[];
}

export interface AiRepository {
  remember(characterId: string, entry: MemoryEntry): void;
  memory(characterId: string): BotMemory;
  requestTrain(kind: TrainKind, nowMs: number): Result<TrainAcceptance, 'early'>;
  recordRejection(entry: AiRejection): void;
  rejections(): readonly AiRejection[];
}

export function createAiRepository(): AiRepository {
  const memories = new Map<string, CharacterMemory>();
  const lastTrainAt = new Map<TrainKind, number>();
  const rejectionLog: AiRejection[] = [];

  function characterMemory(characterId: string): CharacterMemory {
    const existing = memories.get(characterId);
    if (existing !== undefined) {
      return existing;
    }
    const created: CharacterMemory = { active: [], archive: [] };
    memories.set(characterId, created);
    return created;
  }

  return {
    remember(characterId, entry) {
      const stored = characterMemory(characterId);
      stored.active.push({ atMs: entry.atMs, text: entry.text });
      if (stored.active.length > MEMORY_CAP) {
        const oldest = stored.active.shift();
        if (oldest !== undefined) {
          stored.archive.push(oldest);
        }
      }
    },

    memory(characterId) {
      const stored = memories.get(characterId);
      if (stored === undefined) {
        return { active: [], archive: [], working: [] };
      }
      const active = stored.active.slice();
      return {
        active,
        archive: stored.archive.slice(),
        working: active.slice(-WORKING_MEMORY),
      };
    },

    requestTrain(kind, nowMs) {
      const previous = lastTrainAt.get(kind);
      const period = TRAIN_PERIOD_MS[kind];
      if (previous !== undefined && nowMs - previous < period) {
        return { ok: false, code: 'early' };
      }
      lastTrainAt.set(kind, nowMs);
      return { ok: true, value: { atMs: nowMs } };
    },

    recordRejection(entry) {
      rejectionLog.push({
        characterId: entry.characterId,
        code: entry.code,
        atMs: entry.atMs,
      });
    },

    rejections() {
      return rejectionLog.slice();
    },
  };
}
