import type { AiRepository } from '../../modules/ai/repository';
import type { AuthRepository } from '../../modules/auth/repository';
import type { CharacterRepository } from '../../modules/character/repository';
import type { CrafterStore, ItemSink, MaterialBank } from '../../modules/craft/types';
import type { InstanceRepository } from '../../modules/dungeon/types';
import type { EconomyRepository } from '../../modules/economy/repository';
import type { EventRepository } from '../../modules/event/repository';
import type { GuildRepository } from '../../modules/guild/types';
import type { InventoryRepository } from '../../modules/inventory/repository';
import type { QuestProgressRepository } from '../../modules/quest/repository';
import type { SocialRepository } from '../../modules/social/repository';
import type { WorldRepository } from '../../modules/world/repository';

export interface PersistenceEnv {
  DATABASE_URL?: string | undefined;
}

/** Thrown when a Prisma factory is asked to run without `DATABASE_URL`. */
export class NotConfiguredError extends Error {
  readonly code = 'not_configured' as const;

  constructor() {
    super('not_configured');
    this.name = 'NotConfiguredError';
  }
}

export interface PrismaRepositories {
  auth: AuthRepository;
  characters: CharacterRepository;
  crafters: CrafterStore;
  materials: MaterialBank;
  items: ItemSink;
  instances: InstanceRepository;
  economy: EconomyRepository;
  events: EventRepository;
  guilds: GuildRepository;
  inventory: InventoryRepository;
  quests: QuestProgressRepository;
  social: SocialRepository;
  world: WorldRepository;
  ai: AiRepository;
}

function requireDatabaseUrl(env: PersistenceEnv): string {
  const url = env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new NotConfiguredError();
  }
  return url;
}

/**
 * Placeholder until `prisma generate` has produced a client.
 * Unit tests use {@link MemoryWorld} and never call these methods.
 * This module does not import `@prisma/client`, so typecheck does not need generate.
 */
function lazyRepository<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      if (prop === 'then') {
        return undefined;
      }
      throw new Error(
        `prisma repository ${name}.${String(prop)} is unavailable until prisma generate`,
      );
    },
  });
}

export function createPrismaAuthRepository(env: PersistenceEnv): AuthRepository {
  requireDatabaseUrl(env);
  return lazyRepository<AuthRepository>('auth');
}

export function createPrismaCharacterRepository(env: PersistenceEnv): CharacterRepository {
  requireDatabaseUrl(env);
  return lazyRepository<CharacterRepository>('characters');
}

export function createPrismaCrafterStore(env: PersistenceEnv): CrafterStore {
  requireDatabaseUrl(env);
  return lazyRepository<CrafterStore>('crafters');
}

export function createPrismaMaterialBank(env: PersistenceEnv): MaterialBank {
  requireDatabaseUrl(env);
  return lazyRepository<MaterialBank>('materials');
}

export function createPrismaItemSink(env: PersistenceEnv): ItemSink {
  requireDatabaseUrl(env);
  return lazyRepository<ItemSink>('items');
}

export function createPrismaInstanceRepository(env: PersistenceEnv): InstanceRepository {
  requireDatabaseUrl(env);
  return lazyRepository<InstanceRepository>('instances');
}

export function createPrismaEconomyRepository(env: PersistenceEnv): EconomyRepository {
  requireDatabaseUrl(env);
  return lazyRepository<EconomyRepository>('economy');
}

export function createPrismaEventRepository(env: PersistenceEnv): EventRepository {
  requireDatabaseUrl(env);
  return lazyRepository<EventRepository>('events');
}

export function createPrismaGuildRepository(env: PersistenceEnv): GuildRepository {
  requireDatabaseUrl(env);
  return lazyRepository<GuildRepository>('guilds');
}

export function createPrismaInventoryRepository(env: PersistenceEnv): InventoryRepository {
  requireDatabaseUrl(env);
  return lazyRepository<InventoryRepository>('inventory');
}

export function createPrismaQuestRepository(env: PersistenceEnv): QuestProgressRepository {
  requireDatabaseUrl(env);
  return lazyRepository<QuestProgressRepository>('quests');
}

export function createPrismaSocialRepository(env: PersistenceEnv): SocialRepository {
  requireDatabaseUrl(env);
  return lazyRepository<SocialRepository>('social');
}

export function createPrismaWorldRepository(env: PersistenceEnv): WorldRepository {
  requireDatabaseUrl(env);
  return lazyRepository<WorldRepository>('world');
}

export function createPrismaAiRepository(env: PersistenceEnv): AiRepository {
  requireDatabaseUrl(env);
  return lazyRepository<AiRepository>('ai');
}

export function createPrismaRepositories(env: PersistenceEnv): PrismaRepositories {
  requireDatabaseUrl(env);
  return {
    auth: createPrismaAuthRepository(env),
    characters: createPrismaCharacterRepository(env),
    crafters: createPrismaCrafterStore(env),
    materials: createPrismaMaterialBank(env),
    items: createPrismaItemSink(env),
    instances: createPrismaInstanceRepository(env),
    economy: createPrismaEconomyRepository(env),
    events: createPrismaEventRepository(env),
    guilds: createPrismaGuildRepository(env),
    inventory: createPrismaInventoryRepository(env),
    quests: createPrismaQuestRepository(env),
    social: createPrismaSocialRepository(env),
    world: createPrismaWorldRepository(env),
    ai: createPrismaAiRepository(env),
  };
}
