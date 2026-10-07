import type { Clock } from '../../shared/clock';
import type { AuthRepository } from '../../modules/auth/repository';
import type { AccountRecord, SessionRecord } from '../../modules/auth/types';
import type { CharacterRepository } from '../../modules/character/repository';
import type { CharacterRecord } from '../../modules/character/types';
import { MemoryCrafterStore, MemoryItemSink, MemoryMaterialBank } from '../../modules/craft/repository';
import type { DungeonInstance, EntryLock, InstanceRepository } from '../../modules/dungeon/types';
import { memoryEconomyRepository, type EconomyRepository } from '../../modules/economy/repository';
import { createEventRepository, type EventRepository } from '../../modules/event/repository';
import { MemoryGuildRepository } from '../../modules/guild/repository';
import { MemoryInventoryRepository } from '../../modules/inventory/repository';
import { createQuestProgressRepository, type QuestProgressRepository } from '../../modules/quest/repository';
import { createSocialRepository, type SocialRepository } from '../../modules/social/repository';
import { memoryWorldRepository, type WorldRepository } from '../../modules/world/repository';
import { createAiRepository, type AiRepository } from '../../modules/ai/repository';
import {
  KEY_TTL_SEC,
  instanceKey,
  sessionKey,
} from './keys';

interface KeyEntry {
  value: string;
  expireAtMs: number | null;
}

/**
 * In-memory stand-in for Redis. TTL is checked here, not by a Redis process.
 * Sets (`online:characters`, `online:bots`) never expire.
 */
export class MemoryKeyStore {
  private readonly values = new Map<string, KeyEntry>();
  private readonly sets = new Map<string, Set<string>>();

  put(key: string, value: string, ttlSec: number | null, nowMs: number): void {
    this.values.set(key, {
      value,
      expireAtMs: ttlSec === null ? null : nowMs + ttlSec * 1000,
    });
  }

  read(key: string, nowMs: number): string | null {
    const entry = this.values.get(key);
    if (entry === undefined) {
      return null;
    }
    if (entry.expireAtMs !== null && entry.expireAtMs <= nowMs) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  /** Unexpired values whose key starts with `prefix`. */
  list(prefix: string, nowMs: number): { key: string; value: string }[] {
    const found: { key: string; value: string }[] = [];
    for (const [key, entry] of this.values) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      if (entry.expireAtMs !== null && entry.expireAtMs <= nowMs) {
        this.values.delete(key);
        continue;
      }
      found.push({ key, value: entry.value });
    }
    return found;
  }

  addToSet(key: string, member: string): void {
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(member);
    this.sets.set(key, set);
  }

  removeFromSet(key: string, member: string): void {
    this.sets.get(key)?.delete(member);
  }

  members(key: string): string[] {
    return [...(this.sets.get(key) ?? [])];
  }
}

function copyAccount(account: AccountRecord): AccountRecord {
  return { ...account };
}

function copyCharacter(record: CharacterRecord): CharacterRecord {
  return {
    ...record,
    appearance: { ...record.appearance },
    points: { ...record.points },
    stats: { ...record.stats },
    languages: { ...record.languages },
  };
}

function isSessionRecord(value: unknown): value is SessionRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as Partial<SessionRecord>;
  return (
    typeof row.accountId === 'string' &&
    typeof row.sessionKey === 'string' &&
    typeof row.expiresAtMs === 'number'
  );
}

function createAuthRepository(keys: MemoryKeyStore, now: () => number): AuthRepository {
  const accountsById = new Map<string, AccountRecord>();
  const accountIdsByEmail = new Map<string, string>();

  return {
    async findAccountByEmail(email) {
      const id = accountIdsByEmail.get(email);
      if (id === undefined) {
        return null;
      }
      const account = accountsById.get(id);
      return account === undefined ? null : copyAccount(account);
    },

    async findAccountById(id) {
      const account = accountsById.get(id);
      return account === undefined ? null : copyAccount(account);
    },

    async insertAccount(account) {
      if (accountsById.has(account.id) || accountIdsByEmail.has(account.email)) {
        throw new Error('account already exists');
      }
      accountsById.set(account.id, copyAccount(account));
      accountIdsByEmail.set(account.email, account.id);
    },

    async updateAccount(account) {
      const existing = accountsById.get(account.id);
      if (existing === undefined) {
        throw new Error(`account not found: ${account.id}`);
      }
      if (existing.email !== account.email) {
        accountIdsByEmail.delete(existing.email);
        accountIdsByEmail.set(account.email, account.id);
      }
      accountsById.set(account.id, copyAccount(account));
    },

    async saveSession(session) {
      keys.put(sessionKey(session.accountId), JSON.stringify(session), KEY_TTL_SEC.session, now());
    },

    async getSession(accountId, nowMs) {
      const key = sessionKey(accountId);
      const raw = keys.read(key, nowMs);
      if (raw === null) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!isSessionRecord(parsed) || parsed.expiresAtMs <= nowMs) {
        keys.delete(key);
        return null;
      }
      return { ...parsed };
    },
  };
}

function createCharacterRepository(): CharacterRepository {
  const byId = new Map<string, CharacterRecord>();
  const byName = new Map<string, string>();

  return {
    async findById(id) {
      const record = byId.get(id);
      return record === undefined ? null : copyCharacter(record);
    },

    async findByName(name) {
      const id = byName.get(name);
      if (id === undefined) {
        return null;
      }
      const record = byId.get(id);
      return record === undefined ? null : copyCharacter(record);
    },

    async insert(record) {
      if (byId.has(record.id) || byName.has(record.name)) {
        throw new Error('character already exists');
      }
      byId.set(record.id, copyCharacter(record));
      byName.set(record.name, record.id);
    },

    async update(record) {
      const existing = byId.get(record.id);
      if (existing === undefined) {
        throw new Error(`character not found: ${record.id}`);
      }
      if (existing.name !== record.name) {
        if (byName.has(record.name)) {
          throw new Error('character already exists');
        }
        byName.delete(existing.name);
        byName.set(record.name, record.id);
      }
      byId.set(record.id, copyCharacter(record));
    },
  };
}

function parseInstance(raw: string): DungeonInstance {
  return JSON.parse(raw) as DungeonInstance;
}

function copyInstance(instance: DungeonInstance): DungeonInstance {
  return parseInstance(JSON.stringify(instance));
}

function lockId(characterId: string, nodeId: string, edgeId: string): string {
  return `${characterId}\0${nodeId}\0${edgeId}`;
}

function createInstanceRepository(keys: MemoryKeyStore, now: () => number): InstanceRepository {
  const locks = new Map<string, EntryLock>();

  return {
    findById(id) {
      const raw = keys.read(instanceKey(id), now());
      return raw === null ? undefined : parseInstance(raw);
    },

    findByKey(key) {
      for (const entry of keys.list('instance:', now())) {
        const instance = parseInstance(entry.value);
        if (instance.key === key) {
          return instance;
        }
      }
      return undefined;
    },

    list() {
      return keys.list('instance:', now()).map((entry) => parseInstance(entry.value));
    },

    insert(instance) {
      const key = instanceKey(instance.id);
      if (keys.read(key, now()) !== null) {
        throw new Error(`duplicate instance ${instance.id}`);
      }
      keys.put(key, JSON.stringify(copyInstance(instance)), KEY_TTL_SEC.instance, now());
    },

    update(instance) {
      const key = instanceKey(instance.id);
      if (keys.read(key, now()) === null) {
        throw new Error(`missing instance ${instance.id}`);
      }
      keys.put(key, JSON.stringify(copyInstance(instance)), KEY_TTL_SEC.instance, now());
    },

    delete(id) {
      keys.delete(instanceKey(id));
    },

    findLock(characterId, nodeId, edgeId) {
      const found = locks.get(lockId(characterId, nodeId, edgeId));
      return found === undefined ? undefined : { ...found };
    },

    saveLock(lock) {
      locks.set(lockId(lock.characterId, lock.nodeId, lock.edgeId), { ...lock });
    },
  };
}

/**
 * One in-memory world for compose tests. Character rows stay until deleted.
 * Sessions and instances live in {@link MemoryKeyStore} and expire by TTL.
 */
export class MemoryWorld {
  readonly keys = new MemoryKeyStore();
  readonly auth: AuthRepository;
  readonly characters: CharacterRepository;
  readonly instances: InstanceRepository;
  readonly crafters: MemoryCrafterStore;
  readonly materials: MemoryMaterialBank;
  readonly items: MemoryItemSink;
  readonly economy: EconomyRepository;
  readonly events: EventRepository;
  readonly guilds: MemoryGuildRepository;
  readonly inventory: MemoryInventoryRepository;
  readonly quests: QuestProgressRepository;
  readonly social: SocialRepository;
  readonly world: WorldRepository;
  readonly ai: AiRepository;

  constructor(private readonly clock: Clock) {
    const now = () => this.clock.now();
    this.auth = createAuthRepository(this.keys, now);
    this.characters = createCharacterRepository();
    this.instances = createInstanceRepository(this.keys, now);
    this.crafters = new MemoryCrafterStore();
    this.materials = new MemoryMaterialBank();
    this.items = new MemoryItemSink();
    this.economy = memoryEconomyRepository();
    this.events = createEventRepository();
    this.guilds = new MemoryGuildRepository();
    this.inventory = new MemoryInventoryRepository();
    this.quests = createQuestProgressRepository();
    this.social = createSocialRepository();
    this.world = memoryWorldRepository();
    this.ai = createAiRepository();
  }

  async createCharacter(record: CharacterRecord): Promise<void> {
    await this.characters.insert(record);
  }

  async getCharacter(id: string): Promise<CharacterRecord | null> {
    return this.characters.findById(id);
  }

  async saveSession(session: SessionRecord): Promise<void> {
    await this.auth.saveSession(session);
  }

  async getSession(accountId: string): Promise<SessionRecord | null> {
    return this.auth.getSession(accountId, this.clock.now());
  }

  saveInstance(instance: DungeonInstance): void {
    this.instances.insert(instance);
  }

  getInstance(id: string): DungeonInstance | undefined {
    return this.instances.findById(id);
  }
}
