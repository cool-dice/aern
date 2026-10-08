import { randomUUID } from 'node:crypto';
import {
  abandon,
  acceptQuest,
  advance,
  failExpired,
  questReward,
  turnIn,
  utcDayStartMs,
  type QuestObjectiveKind,
  type QuestProgress,
} from '@rift/domain/quests';
import type { ModuleContext } from '../../shared/module';
import type { QuestProgressRepository, QuestProgressRow } from './repository';
import type { QuestCharacterView, QuestOffer, QuestService, Result, RewardSink } from './types';

const UTC_DAY_MS = 86_400_000;

export interface QuestServiceDeps {
  quests: readonly QuestOffer[];
  rewards: RewardSink;
  characters: QuestCharacterView;
  repository: QuestProgressRepository;
  context(): ModuleContext | undefined;
}

function failure(code: string): Result<never, string> {
  return { ok: false, code };
}

function templateOf(offer: QuestOffer): QuestProgress {
  const progress: QuestProgress = {
    questId: offer.id,
    story: offer.story,
    daily: offer.daily,
    repeatable: offer.repeatable,
    status: 'active',
    objectives: offer.objectives.map((objective) => {
      const subject = objective.monsterId ?? objective.itemId ?? objective.place;
      return {
        id: objective.id,
        kind: objective.kind as QuestObjectiveKind,
        target: objective.target,
        current: 0,
        ...(objective.scene !== undefined ? { scene: objective.scene } : {}),
        ...(subject !== undefined ? { subject } : {}),
      };
    }),
    itemIds: offer.itemIds ? offer.itemIds.slice() : [],
    garbled: false,
  };
  if (offer.contract === true) {
    progress.contract = true;
  }
  if (offer.expiresAtMs !== undefined) {
    progress.expiresAtMs = offer.expiresAtMs;
  }
  return progress;
}

function activeRows(rows: readonly QuestProgressRow[]): QuestProgress[] {
  const active: QuestProgress[] = [];
  for (const row of rows) {
    if (row.progress.status === 'active') {
      active.push(row.progress);
    }
  }
  return active;
}

function completedOnce(rows: readonly QuestProgressRow[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    const progress = row.progress;
    if (progress.status === 'active' || progress.repeatable || progress.daily) {
      continue;
    }
    if (!ids.includes(progress.questId)) {
      ids.push(progress.questId);
    }
  }
  return ids;
}

function dailiesAcceptedToday(rows: readonly QuestProgressRow[], nowMs: number): number {
  const dayStart = utcDayStartMs(nowMs);
  const nextDay = utcDayStartMs(dayStart + UTC_DAY_MS);
  let count = 0;
  for (const row of rows) {
    if (!row.progress.daily) {
      continue;
    }
    if (row.acceptedAtMs >= dayStart && row.acceptedAtMs < nextDay) {
      count += 1;
    }
  }
  return count;
}

function findActive(
  rows: readonly QuestProgressRow[],
  questId: string,
): QuestProgressRow | undefined {
  return rows.find((row) => row.progress.questId === questId && row.progress.status === 'active');
}

export function createQuestService(deps: QuestServiceDeps): QuestService {
  const { quests, rewards, characters, repository, context } = deps;

  function requireContext(): ModuleContext {
    const ctx = context();
    if (!ctx) {
      throw new Error('quest module is not started');
    }
    return ctx;
  }

  async function load(characterId: string, nowMs: number): Promise<QuestProgressRow[]> {
    const rows = await repository.list(characterId);
    const current: QuestProgressRow[] = [];
    for (const row of rows) {
      const expired = failExpired(row.progress, nowMs);
      if (expired === row.progress) {
        current.push(row);
        continue;
      }
      const failed: QuestProgressRow = { ...row, progress: expired };
      await repository.save(failed);
      const ctx = context();
      if (ctx) {
        const npcId = quests.find((quest) => quest.id === row.progress.questId)?.npcId;
        ctx.bus.emit('quest.failed', {
          characterId,
          questId: row.progress.questId,
          ...(npcId !== undefined ? { npcId } : {}),
        });
      }
      current.push(failed);
    }
    return current;
  }

  return {
    async accept(characterId, questId, nowMs) {
      const offer = quests.find((quest) => quest.id === questId);
      if (!offer) {
        return failure('missing');
      }
      const upy = await characters.upyOf(characterId);
      const rows = await load(characterId, nowMs);
      const accepted = acceptQuest({
        active: activeRows(rows),
        completedOnce: completedOnce(rows),
        quest: templateOf(offer),
        upy,
        nowMs,
        dailiesAcceptedToday: dailiesAcceptedToday(rows, nowMs),
      });
      if (!accepted.ok) {
        return failure(accepted.code);
      }
      const granted = accepted.value.at(-1);
      if (!granted) {
        throw new Error('acceptQuest returned an empty log');
      }
      await repository.insert({
        id: randomUUID(),
        characterId,
        acceptedAtMs: nowMs,
        difficulty: offer.difficulty,
        progress: granted,
      });
      return { ok: true, value: undefined };
    },

    async report(characterId, questId, objectiveId, amount) {
      const nowMs = requireContext().now();
      const rows = await load(characterId, nowMs);
      const row = findActive(rows, questId);
      if (!row) {
        return;
      }
      const next = advance(row.progress, objectiveId, amount);
      if (next === row.progress) {
        return;
      }
      await repository.save({ ...row, progress: next });
    },

    async turnIn(characterId, questId) {
      const ctx = requireContext();
      const rows = await load(characterId, ctx.now());
      const row = findActive(rows, questId);
      if (!row) {
        return failure('inactive');
      }
      const level = await characters.levelOf(characterId);
      const turned = turnIn(row.progress, level, row.difficulty);
      if (!turned.ok) {
        return failure(turned.code);
      }
      const reward = questReward(level, row.difficulty);
      if (reward.gold !== turned.value.gold || reward.xp !== turned.value.xp) {
        throw new Error('quest reward mismatch');
      }
      await repository.save({ ...row, progress: turned.value.progress });
      await rewards.grant(characterId, reward);
      const npcId = quests.find((quest) => quest.id === questId)?.npcId;
      ctx.bus.emit('quest.completed', {
        characterId,
        questId,
        ...(npcId !== undefined ? { npcId } : {}),
      });
      return { ok: true, value: reward };
    },

    async abandon(characterId, questId) {
      const nowMs = requireContext().now();
      const rows = await repository.list(characterId);
      const row = findActive(rows, questId);
      if (!row) {
        return failure('inactive');
      }
      const expired = failExpired(row.progress, nowMs);
      const left = abandon(expired);
      await repository.save({ ...row, progress: left.progress });
      const ctx = requireContext();
      const npcId = quests.find((quest) => quest.id === questId)?.npcId;
      ctx.bus.emit('quest.failed', {
        characterId,
        questId,
        ...(npcId !== undefined ? { npcId } : {}),
      });
      return { ok: true, value: { removeItemIds: left.removeItemIds } };
    },
  };
}
