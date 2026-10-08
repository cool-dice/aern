import type { GameModule, ModuleContext } from '../../shared/module';
import { createQuestProgressRepository, type QuestProgressRepository } from './repository';
import { createQuestService } from './service';
import type { QuestCharacterView, QuestOffer, QuestService, RewardSink } from './types';

export interface QuestModuleOptions {
  quests: readonly QuestOffer[];
  rewards: RewardSink;
  characters: QuestCharacterView;
  repository?: QuestProgressRepository;
}

export function createQuestModule(
  options: QuestModuleOptions,
): GameModule & { service: QuestService } {
  const repository = options.repository ?? createQuestProgressRepository();
  let ctx: ModuleContext | undefined;
  const service = createQuestService({
    quests: options.quests,
    rewards: options.rewards,
    characters: options.characters,
    repository,
    context: () => ctx,
  });

  return {
    name: 'quest',
    service,
    start(next) {
      ctx = next;
    },
  };
}

export { createQuestProgressRepository, QUEST_PROGRESS_TABLE } from './repository';
export type { QuestProgressRepository, QuestProgressRow } from './repository';
export type { QuestCharacterView, QuestOffer, QuestService, Result, RewardSink } from './types';
