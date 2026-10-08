import { bumpReputation, reputationTier, type ReputationEvent } from '@rift/domain/social';

/**
 * Dialogue choices use the personal-reputation table.
 * `attack` and `fail` are those events. `serve`, `question`, and `gift` are a gift (+3).
 * Quest completion and failure are applied by the quest listener, not by this map.
 */
export function choiceReputation(choiceId: string): ReputationEvent {
  if (choiceId === 'attack' || choiceId === 'fail' || choiceId === 'quest') {
    return choiceId;
  }
  return 'gift';
}

export function nextReputation(current: number | undefined, event: ReputationEvent): number {
  return bumpReputation(current ?? 0, event);
}

/** Later scene text reads the stored value. A missing value leaves the catalog line. */
export function reputationScene(scene: string | undefined, value: number | undefined): string | undefined {
  if (scene === undefined || value === undefined) {
    return scene;
  }
  const tier = reputationTier(value);
  if (tier.quests === 'none') {
    if (scene.includes('Refused:')) {
      return scene;
    }
    return `${scene} The NPC refuses further quests.`;
  }
  if (tier.quests === 'basic') {
    return `${scene} The NPC offers basic quests.`;
  }
  if (tier.discount > 0) {
    return `${scene} Discount ${String(Math.round(tier.discount * 100))} percent.`;
  }
  return scene;
}
