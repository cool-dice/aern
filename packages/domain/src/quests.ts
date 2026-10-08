import { questLanguageAccess } from './language';
import { err, ok, type Result } from './result';

/**
 * Quest rules. One `QuestProgress` value is the progress record.
 * Persistence name is `quest_progress`. There is no `character_quests` table.
 * NPC reputation after a deadline failure is applied outside this module.
 * Repeatable quests have no domain cooldown: the source names one and gives no duration.
 */

export const ACTIVE_QUEST_LIMIT = 20;
export const DAILY_QUEST_LIMIT = 5;

const UTC_DAY_MS = 86_400_000;
const REWARD_BASE = 50;

export const QUEST_OBJECTIVE_KINDS = [
  'kill',
  'collect',
  'gather',
  'craft',
  'deliver',
  'visit',
  'talk',
  'hack',
  'survive',
  'escort',
  'defend',
  'capture',
  'investigate',
  'rescue',
  'sabotage',
  'discover',
  'learn',
  'trade',
  'pvp',
  'lore',
] as const;

export type QuestObjectiveKind = (typeof QUEST_OBJECTIVE_KINDS)[number];

export type QuestDifficulty = 'easy' | 'normal' | 'hard' | 'epic';

export type QuestStatus = 'active' | 'completed' | 'failed';

export const QUEST_DIFFICULTY_COEFFICIENT: Record<QuestDifficulty, number> = {
  easy: 1,
  normal: 2,
  hard: 5,
  epic: 10,
};

export interface QuestObjective {
  id: string;
  kind: QuestObjectiveKind;
  target: number;
  current: number;
  /** Named story beat from artifact 20.6. Errand objectives omit it. */
  scene?: string;
  /** Monster, item, or place this objective asked for. Omitted means any of `kind`. */
  subject?: string;
}

export interface QuestProgress {
  questId: string;
  story: boolean;
  /** Guild contracts do not use an active-quest slot. Omitted means not a contract. */
  contract?: boolean;
  daily: boolean;
  repeatable: boolean;
  status: QuestStatus;
  objectives: QuestObjective[];
  /** Quest items removed from inventory on abandon or deadline failure. */
  itemIds: string[];
  expiresAtMs?: number;
  garbled: boolean;
  choiceId?: string;
}

export interface WorldQuestFlags {
  barrierDown: boolean;
  primordialOpened: boolean;
}

export type WorldQuestFlag = keyof WorldQuestFlags;

function assertNow(nowMs: number): void {
  if (!Number.isFinite(nowMs)) {
    throw new Error('nowMs must be a finite number');
  }
}

function copyObjective(objective: QuestObjective): QuestObjective {
  return {
    id: objective.id,
    kind: objective.kind,
    target: objective.target,
    current: objective.current,
    ...(objective.scene !== undefined ? { scene: objective.scene } : {}),
    ...(objective.subject !== undefined ? { subject: objective.subject } : {}),
  };
}

function copyProgress(progress: QuestProgress, keepExpiry = true): QuestProgress {
  const next: QuestProgress = {
    questId: progress.questId,
    story: progress.story,
    contract: progress.contract === true,
    daily: progress.daily,
    repeatable: progress.repeatable,
    status: progress.status,
    objectives: progress.objectives.map(copyObjective),
    itemIds: progress.itemIds.slice(),
    garbled: progress.garbled,
  };
  if (keepExpiry && progress.expiresAtMs !== undefined) {
    next.expiresAtMs = progress.expiresAtMs;
  }
  if (progress.choiceId !== undefined) {
    next.choiceId = progress.choiceId;
  }
  return next;
}

function isOneTime(quest: QuestProgress): boolean {
  return !quest.repeatable && !quest.daily;
}

function consumesActiveSlot(quest: QuestProgress): boolean {
  return !quest.story && quest.contract !== true;
}

function countActiveSlots(active: readonly QuestProgress[]): number {
  let count = 0;
  for (const quest of active) {
    if (quest.status === 'active' && consumesActiveSlot(quest)) {
      count += 1;
    }
  }
  return count;
}

/** Midnight UTC of the civil day that contains `nowMs`. Daily accepts reset then. */
export function utcDayStartMs(nowMs: number): number {
  assertNow(nowMs);
  return Math.floor(nowMs / UTC_DAY_MS) * UTC_DAY_MS;
}

export function questReward(
  level: number,
  difficulty: QuestDifficulty,
): { gold: number; xp: number } {
  const amount = Math.floor(REWARD_BASE * QUEST_DIFFICULTY_COEFFICIENT[difficulty] * level);
  return { gold: amount, xp: amount };
}

/**
 * Grants `quest` onto a new array.
 * `dailiesAcceptedToday` is the caller's count for the UTC day of `nowMs`.
 * A one-time id listed in `completedOnce` (completed or failed) cannot be taken again.
 * Checks, in order: duplicate, once, language, daily cap, active cap.
 * Story quests have no deadline. Any other quest already past `expiresAtMs` is stored failed.
 */
export function acceptQuest(input: {
  active: QuestProgress[];
  completedOnce: string[];
  quest: QuestProgress;
  upy: number;
  nowMs: number;
  dailiesAcceptedToday: number;
}): Result<QuestProgress[], 'limit' | 'daily' | 'once' | 'language' | 'duplicate'> {
  assertNow(input.nowMs);
  if (input.active.some((quest) => quest.questId === input.quest.questId)) {
    return err('duplicate');
  }
  if (isOneTime(input.quest) && input.completedOnce.includes(input.quest.questId)) {
    return err('once');
  }
  const access = questLanguageAccess(input.upy);
  if (access === 'deny') {
    return err('language');
  }
  if (input.quest.daily && input.dailiesAcceptedToday >= DAILY_QUEST_LIMIT) {
    return err('daily');
  }
  if (consumesActiveSlot(input.quest) && countActiveSlots(input.active) >= ACTIVE_QUEST_LIMIT) {
    return err('limit');
  }

  const granted = copyProgress(input.quest, !input.quest.story);
  granted.status = 'active';
  granted.garbled = access === 'garbled';
  const tracked = failExpired(granted, input.nowMs);
  return ok(input.active.concat([tracked]));
}

export function advance(
  progress: QuestProgress,
  objectiveId: string,
  amount: number,
): QuestProgress {
  if (!Number.isFinite(amount) || amount <= 0) {
    return progress;
  }
  const index = progress.objectives.findIndex((objective) => objective.id === objectiveId);
  const objective = progress.objectives[index];
  if (objective === undefined || objective.current >= objective.target) {
    return progress;
  }
  const current = Math.min(objective.target, objective.current + amount);
  const next = copyProgress(progress);
  next.objectives = next.objectives.map((item, itemIndex) =>
    itemIndex === index ? { ...item, current } : item,
  );
  return next;
}

export function turnIn(
  progress: QuestProgress,
  level: number,
  difficulty: QuestDifficulty,
): Result<{ progress: QuestProgress; gold: number; xp: number }, 'incomplete' | 'inactive'> {
  if (progress.status !== 'active') {
    return err('inactive');
  }
  const ready = progress.objectives.every((objective) => objective.current >= objective.target);
  if (!ready) {
    return err('incomplete');
  }
  const completed = copyProgress(progress);
  completed.status = 'completed';
  const reward = questReward(level, difficulty);
  return ok({ progress: completed, gold: reward.gold, xp: reward.xp });
}

export function abandon(progress: QuestProgress): {
  progress: QuestProgress;
  removeItemIds: string[];
} {
  const failed = copyProgress(progress);
  failed.status = 'failed';
  return { progress: failed, removeItemIds: progress.itemIds.slice() };
}

export function failExpired(progress: QuestProgress, nowMs: number): QuestProgress {
  assertNow(nowMs);
  if (progress.status !== 'active' || progress.story) {
    return progress;
  }
  if (progress.expiresAtMs === undefined || nowMs <= progress.expiresAtMs) {
    return progress;
  }
  const failed = copyProgress(progress);
  failed.status = 'failed';
  return failed;
}

/** Personal branch only. World flags are not an input. */
export function recordChoice(progress: QuestProgress, choiceId: string): QuestProgress {
  const next = copyProgress(progress);
  next.choiceId = choiceId;
  return next;
}

/**
 * Later scenes read the stored personal choice.
 * A quest with no choice keeps the catalog line. World flags are not an input.
 */
export function branchScene(progress: QuestProgress, objective: QuestObjective): string | undefined {
  if (objective.scene === undefined) {
    return undefined;
  }
  if (progress.choiceId === 'question' && objective.id === 'koval') {
    return 'Master Koval. You questioned the council, so the forge lesson is private.';
  }
  if (progress.choiceId === 'serve' && objective.id === 'koval') {
    return 'Master Koval. You took the council errand, so the armory opens.';
  }
  if (progress.choiceId === 'question' && objective.id === 'mechanic') {
    return 'The Goblin Mechanic. You questioned the council, so the bench is a back room.';
  }
  return objective.scene;
}

/**
 * Sets `barrierDown` or `primordialOpened` to true once.
 * A flag that is already true is left as-is and the same object is returned.
 */
export function setWorldFlagOnce(flags: WorldQuestFlags, flag: WorldQuestFlag): WorldQuestFlags {
  if (flags[flag]) {
    return flags;
  }
  return {
    barrierDown: flag === 'barrierDown' ? true : flags.barrierDown,
    primordialOpened: flag === 'primordialOpened' ? true : flags.primordialOpened,
  };
}
