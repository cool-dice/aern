import { createRequire } from 'node:module';
import { STAT_IDS, type StatBlock } from '@rift/domain/stats';
import type { Appearance, Controller, RaceId } from '@rift/domain/character';
import type { AiRepository } from '../../modules/ai/repository';
import { createAiRepository } from '../../modules/ai/repository';
import type { AuthRepository } from '../../modules/auth/repository';
import type { AccountRecord, SessionRecord } from '../../modules/auth/types';
import type { CharacterRepository } from '../../modules/character/repository';
import type { CharacterPhase, CharacterRecord } from '../../modules/character/types';
import type { CrafterState, CrafterStore, CraftedItem, ItemSink, MaterialBank } from '../../modules/craft/types';
import { memoryInstanceRepository } from '../../modules/dungeon/repository';
import type { InstanceRepository } from '../../modules/dungeon/types';
import { memoryEconomyRepository } from '../../modules/economy/repository';
import type { EconomyRepository } from '../../modules/economy/repository';
import type { AuctionLot, EconomyCharacter } from '../../modules/economy/types';
import { createEventRepository } from '../../modules/event/repository';
import type { EventRepository } from '../../modules/event/repository';
import type { GuildRepository, StoredGuild, StoredWar } from '../../modules/guild/types';
import type { InventoryRepository } from '../../modules/inventory/repository';
import type { InventoryState, ItemStack } from '../../modules/inventory/types';
import type { QuestProgressRepository, QuestProgressRow } from '../../modules/quest/repository';
import { QUEST_PROGRESS_TABLE } from '../../modules/quest/repository';
import { createSocialRepository } from '../../modules/social/repository';
import type { SocialRepository } from '../../modules/social/repository';
import { memoryWorldRepository } from '../../modules/world/repository';
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
  /** Awaits every tracked write. A rejected write rejects this call. */
  flush(): Promise<void>;
}

/** Subset of the generated Prisma client the repositories write. Tests pass a double. */
export interface PrismaWrite {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  upsert(args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
  findUnique(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
  findMany(args?: { where?: Record<string, unknown> }): Promise<Record<string, unknown>[]>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
  delete(args: { where: Record<string, unknown> }): Promise<unknown>;
  deleteMany(args?: { where?: Record<string, unknown> }): Promise<unknown>;
}

export interface RiftDb {
  account: PrismaWrite;
  character: PrismaWrite;
  characterStat: PrismaWrite;
  characterLanguage: PrismaWrite;
  characterTitle: PrismaWrite;
  characterSkill: PrismaWrite;
  inventorySlot: PrismaWrite;
  item: PrismaWrite;
  questProgress: PrismaWrite;
  guild: PrismaWrite;
  guildMember: PrismaWrite;
  guildBank: PrismaWrite;
  guildWar: PrismaWrite;
  auction: PrismaWrite;
  mail: PrismaWrite;
  storage: PrismaWrite;
  chatMessage: PrismaWrite;
  instanceRecord: PrismaWrite;
  weather: PrismaWrite;
  memory: PrismaWrite;
}

function requireDatabaseUrl(env: PersistenceEnv): string {
  const url = env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new NotConfiguredError();
  }
  return url;
}

function openPrismaClient(url: string): RiftDb {
  const require = createRequire(import.meta.url);
  const loaded = require('@prisma/client') as {
    PrismaClient: new (options: { datasources: { db: { url: string } } }) => RiftDb;
  };
  return new loaded.PrismaClient({ datasources: { db: { url } } });
}

function dbFrom(env: PersistenceEnv, client?: RiftDb): RiftDb {
  const url = requireDatabaseUrl(env);
  return client ?? openPrismaClient(url);
}

interface WriteTracker {
  track(task: Promise<unknown>): void;
  flush(): Promise<void>;
}

const trackers = new WeakMap<RiftDb, WriteTracker>();

function createWriteTracker(): WriteTracker {
  const pending: Promise<void>[] = [];
  let failure: unknown = null;
  return {
    track(task) {
      pending.push(
        task.then(
          () => undefined,
          (error: unknown) => {
            failure = error;
          },
        ),
      );
    },
    async flush() {
      const batch = pending.splice(0, pending.length);
      await Promise.all(batch);
      if (failure !== null) {
        const error = failure;
        failure = null;
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
  };
}

/** Records a write. Callers must `flush()` so the promise is awaited and errors surface. */
function write(db: RiftDb, task: Promise<unknown>): void {
  const tracker = trackers.get(db);
  if (tracker === undefined) {
    void task.then(undefined, (error: unknown) => {
      throw error;
    });
    return;
  }
  tracker.track(task);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stamp(ms: number): Date {
  return new Date(ms);
}

function millis(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return Number(value);
}

function toAccount(row: Record<string, unknown>): AccountRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.passwordHash),
    createdAtMs: millis(row.createdAt),
    lastLoginAtMs: row.lastLogin === null || row.lastLogin === undefined ? null : millis(row.lastLogin),
    banned: row.banned === true,
    banReason: row.banReason === undefined || row.banReason === null ? null : String(row.banReason),
    banUntilMs: row.banUntil === null || row.banUntil === undefined ? null : millis(row.banUntil),
    role: row.role as AccountRecord['role'],
  };
}

function accountData(account: AccountRecord): Record<string, unknown> {
  return {
    id: account.id,
    email: account.email,
    passwordHash: account.passwordHash,
    createdAt: stamp(account.createdAtMs),
    lastLogin: account.lastLoginAtMs === null ? null : stamp(account.lastLoginAtMs),
    banned: account.banned,
    banReason: account.banReason,
    banUntil: account.banUntilMs === null ? null : stamp(account.banUntilMs),
    role: account.role,
  };
}

function characterBlob(record: CharacterRecord): Record<string, unknown> {
  return {
    look: record.appearance,
    phase: record.phase,
    unspent: record.unspent,
    points: record.points,
    languages: record.languages,
    stats: record.stats,
    ...(record.build !== undefined ? { build: record.build } : {}),
  };
}

function characterData(record: CharacterRecord): Record<string, unknown> {
  return {
    id: record.id,
    accountId: record.accountId,
    name: record.name,
    raceId: record.raceId,
    controller: record.controller,
    level: record.level,
    experience: BigInt(record.experience),
    isClean: record.clean,
    createdAt: stamp(record.createdAtMs),
    bindNodeId: record.bindNodeId,
    hpCurrent: record.hp,
    odCurrent: record.od,
    nnCurrent: 0,
    weightCurrent: 0,
    online: record.phase === 'online',
    appearance: characterBlob(record),
  };
}

function toCharacter(row: Record<string, unknown>): CharacterRecord {
  const blob = asRecord(row.appearance);
  const phase: CharacterPhase = blob.phase === 'downed' ? 'downed' : 'online';
  return {
    id: String(row.id),
    accountId: String(row.accountId),
    name: String(row.name),
    raceId: String(row.raceId) as RaceId,
    controller: String(row.controller) as Controller,
    level: Number(row.level),
    experience: millis(row.experience),
    clean: row.isClean === true,
    createdAtMs: millis(row.createdAt),
    bindNodeId: String(row.bindNodeId ?? ''),
    hp: Number(row.hpCurrent),
    od: Number(row.odCurrent),
    appearance: asRecord(blob.look) as unknown as Appearance,
    points: blob.points as StatBlock,
    unspent: Number(blob.unspent ?? 0),
    stats: blob.stats as StatBlock,
    languages: blob.languages as CharacterRecord['languages'],
    phase,
    ...(blob.build !== undefined ? { build: blob.build as CharacterRecord['build'] } : {}),
  };
}

function bindAuth(db: RiftDb): AuthRepository {
  return {
    async findAccountByEmail(email) {
      const row = await db.account.findUnique({ where: { email } });
      return row === null ? null : toAccount(row);
    },
    async findAccountById(id) {
      const row = await db.account.findUnique({ where: { id } });
      return row === null ? null : toAccount(row);
    },
    async insertAccount(account) {
      const existing = await db.account.findUnique({ where: { id: account.id } });
      if (existing !== null) {
        throw new Error('account already exists');
      }
      await db.account.create({ data: accountData(account) });
    },
    async updateAccount(account) {
      await db.account.update({ where: { id: account.id }, data: accountData(account) });
    },
    async saveSession(session) {
      await db.storage.upsert({
        where: { id: `session:${session.accountId}` },
        create: {
          id: `session:${session.accountId}`,
          ownerId: session.accountId,
          items: session,
          gold: 0,
          slots: 0,
        },
        update: { items: session },
      });
    },
    async getSession(accountId, nowMs) {
      const row = await db.storage.findUnique({ where: { id: `session:${accountId}` } });
      if (row === null) {
        return null;
      }
      const session = asRecord(row.items) as unknown as SessionRecord;
      if (session.expiresAtMs <= nowMs) {
        return null;
      }
      return { ...session };
    },
  };
}

function bindCharacters(db: RiftDb): CharacterRepository {
  async function writeStats(record: CharacterRecord): Promise<void> {
    for (const statId of STAT_IDS) {
      const data = {
        characterId: record.id,
        statId,
        baseValue: record.points[statId],
        racialModifier: 0,
        finalValue: record.stats[statId],
        statPointsSpent: record.points[statId],
      };
      await db.characterStat.upsert({
        where: { characterId_statId: { characterId: record.id, statId } },
        create: data,
        update: data,
      });
    }
    for (const [languageId, upy] of Object.entries(record.languages)) {
      await db.characterLanguage.upsert({
        where: { characterId_languageId: { characterId: record.id, languageId } },
        create: { characterId: record.id, languageId, upy },
        update: { upy },
      });
    }
  }

  return {
    async findById(id) {
      const row = await db.character.findUnique({ where: { id } });
      return row === null ? null : toCharacter(row);
    },
    async findByName(name) {
      const row = await db.character.findUnique({ where: { name } });
      return row === null ? null : toCharacter(row);
    },
    async listByAccount(accountId) {
      const rows = await db.character.findMany({ where: { accountId } });
      return rows.map((row) => toCharacter(row));
    },
    async insert(record) {
      const data = characterData(record);
      if ('side' in data) {
        throw new Error('character side is not stored');
      }
      await db.character.create({ data });
      await writeStats(record);
    },
    async update(record) {
      const data = characterData(record);
      await db.character.update({ where: { id: record.id }, data });
      await writeStats(record);
    },
  };
}

function bindInventory(db: RiftDb): InventoryRepository {
  return {
    async load(characterId) {
      const wallet = await db.storage.findUnique({ where: { id: `inventory:${characterId}` } });
      if (wallet === null) {
        return null;
      }
      const slots = await db.inventorySlot.findMany({ where: { characterId } });
      const stacks: ItemStack[] = [];
      for (const slot of slots) {
        const item = await db.item.findUnique({ where: { id: String(slot.itemId) } });
        const stats = asRecord(item?.stats);
        stacks.push({
          slot: Number(slot.slot),
          itemId: String(slot.itemId),
          qty: Number(slot.quantity),
          durability: Number(item?.durability ?? stats.durability ?? 100),
          equipped: slot.equipped === true,
          equipSlots: Array.isArray(stats.equipSlots) ? (stats.equipSlots as ItemStack['equipSlots']) : [],
        });
      }
      const blob = asRecord(wallet.items);
      return {
        characterId,
        gold: Number(wallet.gold ?? 0),
        stacks,
        character: (blob.character as InventoryState['character']) ?? null,
        totalWeightKg: Number(blob.totalWeightKg ?? 0),
        overloadPenalty: Number(blob.overloadPenalty ?? 0),
      };
    },
    async save(state) {
      for (const stack of state.stacks) {
        await db.item.upsert({
          where: { id: stack.itemId },
          create: {
            id: stack.itemId,
            templateId: stack.itemId,
            ownerId: state.characterId,
            durability: stack.durability,
            level: 1,
            gradeId: 'common',
            stats: { equipSlots: stack.equipSlots, durability: stack.durability },
            activeSkills: [],
            passiveSkills: [],
            sockets: [],
            createdAt: stamp(0),
          },
          update: {
            ownerId: state.characterId,
            durability: stack.durability,
            stats: { equipSlots: stack.equipSlots, durability: stack.durability },
          },
        });
        await db.inventorySlot.upsert({
          where: { id: `${state.characterId}:${stack.slot}` },
          create: {
            id: `${state.characterId}:${stack.slot}`,
            characterId: state.characterId,
            itemId: stack.itemId,
            quantity: stack.qty,
            slot: stack.slot,
            equipped: stack.equipped,
          },
          update: {
            itemId: stack.itemId,
            quantity: stack.qty,
            equipped: stack.equipped,
          },
        });
      }
      await db.storage.upsert({
        where: { id: `inventory:${state.characterId}` },
        create: {
          id: `inventory:${state.characterId}`,
          ownerId: state.characterId,
          items: {
            character: state.character,
            totalWeightKg: state.totalWeightKg,
            overloadPenalty: state.overloadPenalty,
          },
          gold: state.gold,
          slots: state.stacks.length,
        },
        update: {
          gold: state.gold,
          slots: state.stacks.length,
          items: {
            character: state.character,
            totalWeightKg: state.totalWeightKg,
            overloadPenalty: state.overloadPenalty,
          },
        },
      });
    },
  };
}

function toQuestRow(row: Record<string, unknown>): QuestProgressRow {
  const progress = asRecord(row.progress) as unknown as QuestProgressRow['progress'];
  return {
    id: String(row.id),
    characterId: String(row.characterId),
    acceptedAtMs: millis(row.updatedAt),
    difficulty: (asRecord(row.progress).difficulty as QuestProgressRow['difficulty']) ?? 'normal',
    progress,
  };
}

function bindQuests(db: RiftDb): QuestProgressRepository {
  return {
    table: QUEST_PROGRESS_TABLE,
    async list(characterId) {
      const rows = await db.questProgress.findMany({ where: { characterId } });
      return rows.map(toQuestRow);
    },
    async insert(row) {
      await db.questProgress.create({
        data: {
          id: row.id,
          characterId: row.characterId,
          questId: row.progress.questId,
          status: row.progress.status,
          progress: { ...row.progress, difficulty: row.difficulty, acceptedAtMs: row.acceptedAtMs },
          updatedAt: stamp(row.acceptedAtMs),
        },
      });
    },
    async save(row) {
      const data = {
        id: row.id,
        characterId: row.characterId,
        questId: row.progress.questId,
        status: row.progress.status,
        progress: { ...row.progress, difficulty: row.difficulty, acceptedAtMs: row.acceptedAtMs },
        updatedAt: stamp(row.acceptedAtMs),
      };
      await db.questProgress.upsert({
        where: { id: row.id },
        create: data,
        update: data,
      });
    },
  };
}

function bindGuilds(db: RiftDb): GuildRepository {
  function toGuild(
    row: Record<string, unknown>,
    memberIds: string[],
    bank: number,
    charter?: { emblem?: string; description?: string },
  ): StoredGuild {
    return {
      id: String(row.id),
      name: String(row.name),
      tag: String(row.tag),
      emblem: charter?.emblem ?? '',
      description: charter?.description ?? '',
      leaderId: String(row.leaderId),
      memberIds,
      bank,
    };
  }

  function charterOf(items: unknown): { emblem: string; description: string } {
    if (typeof items !== 'object' || items === null || Array.isArray(items)) {
      return { emblem: '', description: '' };
    }
    const row = items as { emblem?: unknown; description?: unknown };
    return {
      emblem: typeof row.emblem === 'string' ? row.emblem : '',
      description: typeof row.description === 'string' ? row.description : '',
    };
  }

  return {
    async saveGuild(guild) {
      await db.guild.upsert({
        where: { id: guild.id },
        create: {
          id: guild.id,
          name: guild.name,
          tag: guild.tag,
          leaderId: guild.leaderId,
          createdAt: stamp(0),
          taxRate: 0,
        },
        update: { name: guild.name, tag: guild.tag, leaderId: guild.leaderId },
      });
      const charter = { emblem: guild.emblem ?? '', description: guild.description ?? '', slots: [] };
      await db.guildBank.upsert({
        where: { guildId: guild.id },
        create: { guildId: guild.id, gold: guild.bank, items: charter, resources: [] },
        update: { gold: guild.bank, items: charter },
      });
      for (const memberId of guild.memberIds) {
        const rank = memberId === guild.leaderId ? 'leader' : 'member';
        await db.guildMember.upsert({
          where: { guildId_characterId: { guildId: guild.id, characterId: memberId } },
          create: {
            guildId: guild.id,
            characterId: memberId,
            rank,
            joinedAt: stamp(0),
          },
          update: { rank },
        });
      }
    },
    async findGuild(id) {
      const row = await db.guild.findUnique({ where: { id } });
      if (row === null) {
        return null;
      }
      const members = await db.guildMember.findMany({ where: { guildId: id } });
      const bank = await db.guildBank.findUnique({ where: { guildId: id } });
      return toGuild(
        row,
        members.map((member) => String(member.characterId)),
        Number(bank?.gold ?? 0),
        charterOf(bank?.items),
      );
    },
    async listGuilds() {
      const rows = await db.guild.findMany();
      const listed: StoredGuild[] = [];
      for (const row of rows) {
        const id = String(row.id);
        const members = await db.guildMember.findMany({ where: { guildId: id } });
        const bank = await db.guildBank.findUnique({ where: { guildId: id } });
        listed.push(
          toGuild(
            row,
            members.map((member) => String(member.characterId)),
            Number(bank?.gold ?? 0),
            charterOf(bank?.items),
          ),
        );
      }
      return listed;
    },
    async saveWar(war: StoredWar) {
      await db.guildWar.upsert({
        where: { id: war.id },
        create: {
          id: war.id,
          attackerId: war.attackerGuildId,
          defenderId: war.attackerGuildId,
          cityNodeId: war.cityId,
          startAt: stamp(war.startsAtMs),
          status: JSON.stringify({ gold: war.gold, resources: war.resources }),
        },
        update: {
          cityNodeId: war.cityId,
          status: JSON.stringify({ gold: war.gold, resources: war.resources }),
        },
      });
    },
    async listWars() {
      const rows = await db.guildWar.findMany();
      return rows.map((row) => {
        const extra = JSON.parse(String(row.status)) as { gold?: number; resources?: number };
        return {
          id: String(row.id),
          attackerGuildId: String(row.attackerId),
          cityId: String(row.cityNodeId),
          startsAtMs: millis(row.startAt),
          gold: Number(extra.gold ?? 0),
          resources: Number(extra.resources ?? 0),
        };
      });
    },
  };
}

function bindEconomy(db: RiftDb): EconomyRepository {
  const memory = memoryEconomyRepository();
  return {
    getCharacter: (id) => memory.getCharacter(id),
    saveCharacter(character) {
      memory.saveCharacter(character);
      write(db, 
        db.storage.upsert({
          where: { id: `wallet:${character.characterId}` },
          create: {
            id: `wallet:${character.characterId}`,
            ownerId: character.characterId,
            items: character,
            gold: character.gold,
            slots: Object.keys(character.items).length,
          },
          update: { items: character, gold: character.gold },
        }),
      );
    },
    getNode: (id) => memory.getNode(id),
    saveNode: (node) => memory.saveNode(node),
    barrierDown: () => memory.barrierDown(),
    setBarrierDown: (down) => memory.setBarrierDown(down),
    guild: () => memory.guild(),
    setGuild: (mode) => memory.setGuild(mode),
    getTrade: (id) => memory.getTrade(id),
    findTrade: (a, b) => memory.findTrade(a, b),
    saveTrade(session) {
      memory.saveTrade(session);
      write(db, 
        db.storage.upsert({
          where: { id: `trade:${session.tradeId}` },
          create: {
            id: `trade:${session.tradeId}`,
            ownerId: session.aId,
            items: session,
            gold: 0,
            slots: 0,
          },
          update: { items: session },
        }),
      );
    },
    deleteTrade: (id) => memory.deleteTrade(id),
    listLots: () => memory.listLots(),
    getLot: (id) => memory.getLot(id),
    saveLot(lot) {
      memory.saveLot(lot);
      write(db, 
        db.auction.upsert({
          where: { id: lot.id },
          create: {
            id: lot.id,
            sellerId: lot.sellerId,
            itemId: lot.itemId,
            startPrice: lot.startPrice,
            buyoutPrice: lot.buyout ?? lot.startPrice,
            currentBid: lot.currentBid,
            bidderId: lot.bidderId,
            cityNodeId: lot.guildCity ? 'guild-city' : 'wild',
            expiresAt: stamp(0),
            status: JSON.stringify({ open: true, qty: lot.qty, cityId: lot.cityId ?? null }),
            createdAt: stamp(0),
          },
          update: {
            currentBid: lot.currentBid,
            bidderId: lot.bidderId,
            status: JSON.stringify({ open: true, qty: lot.qty, cityId: lot.cityId ?? null }),
          },
        }),
      );
    },
    async readStored() {
      const rows = await db.storage.findMany();
      const wallets: EconomyCharacter[] = [];
      for (const row of rows) {
        if (typeof row.id !== 'string' || !row.id.startsWith('wallet:')) {
          continue;
        }
        const character = row.items as EconomyCharacter;
        if (character === null || typeof character !== 'object' || typeof character.characterId !== 'string') {
          continue;
        }
        wallets.push(character);
      }
      const listed = await db.auction.findMany();
      const lots: AuctionLot[] = [];
      for (const row of listed) {
        let qty = 1;
        let cityId: string | null = null;
        if (typeof row.status === 'string' && row.status.startsWith('{')) {
          const parsed = JSON.parse(row.status) as { qty?: unknown; cityId?: unknown };
          if (typeof parsed.qty === 'number' && Number.isInteger(parsed.qty) && parsed.qty > 0) {
            qty = parsed.qty;
          }
          if (typeof parsed.cityId === 'string' && parsed.cityId.length > 0) {
            cityId = parsed.cityId;
          }
        }
        lots.push({
          id: String(row.id),
          sellerId: String(row.sellerId),
          itemId: String(row.itemId),
          qty,
          startPrice: Number(row.startPrice),
          currentBid: Number(row.currentBid ?? row.startPrice),
          bidderId: row.bidderId === null || row.bidderId === undefined ? null : String(row.bidderId),
          buyout: Number(row.buyoutPrice),
          guildCity: String(row.cityNodeId) === 'guild-city',
          cityId,
        });
      }
      return { wallets, lots };
    },
    deleteLot(id) {
      memory.deleteLot(id);
      write(db, db.auction.delete({ where: { id } }));
    },
  };
}

function bindSocial(db: RiftDb): SocialRepository {
  const inner = createSocialRepository();
  return {
    register(input) {
      inner.register(input);
      write(
        db,
        db.storage.upsert({
          where: { id: `presence:${input.id}` },
          create: {
            id: `presence:${input.id}`,
            ownerId: input.id,
            items: {
              id: input.id,
              nodeId: input.nodeId,
              language: input.language,
              upy: input.upy ?? 0,
            },
            gold: 0,
            slots: 0,
          },
          update: {
            items: {
              id: input.id,
              nodeId: input.nodeId,
              language: input.language,
              upy: input.upy ?? 0,
            },
          },
        }),
      );
    },
    forget(id) {
      inner.forget(id);
      write(
        db,
        db.storage.delete({ where: { id: `presence:${id}` } }).then(
          () => undefined,
          () => undefined,
        ),
      );
    },
    character: (id) => inner.character(id),
    charactersAt: (nodeId) => inner.charactersAt(nodeId),
    applySanction: (id, sanction, untilMs, nowMs) => inner.applySanction(id, sanction, untilMs, nowMs),
    setSanction: (id, sanction, untilMs) => inner.setSanction(id, sanction, untilMs),
    remember: (id, text, nowMs) => inner.remember(id, text, nowMs),
    partyByMember: (id) => inner.partyByMember(id),
    saveParty: (party) => inner.saveParty(party),
    deleteParty: (leaderId) => inner.deleteParty(leaderId),
    inbox: (listenerId) => inner.inbox(listenerId),
    titlesOf: (characterId) => inner.titlesOf(characterId),
    mailbox: (toId) => inner.mailbox(toId),
    addDelivery(listenerId, message) {
      inner.addDelivery(listenerId, message);
      write(db, 
        db.chatMessage.create({
          data: {
            channel: message.channel,
            senderId: message.senderId,
            message: message.text,
            languageId: 'common',
            createdAt: stamp(0),
          },
        }),
      );
    },
    saveMail(entry) {
      inner.saveMail(entry);
      write(db, 
        db.mail.create({
          data: {
            id: entry.id,
            senderId: entry.fromId,
            receiverId: entry.toId,
            subject: entry.subject,
            body: entry.body,
            items: [],
            gold: 0,
            read: false,
            createdAt: stamp(0),
          },
        }),
      );
    },
    grantTitle(characterId, titleId) {
      const granted = inner.grantTitle(characterId, titleId);
      if (granted.ok) {
        write(db, 
          db.characterTitle.create({
            data: {
              id: `${characterId}:${titleId}`,
              characterId,
              titleTemplateId: titleId,
              createdAt: stamp(0),
            },
          }),
        );
      }
      return granted;
    },
    async loadPersisted() {
      const rows = await db.storage.findMany();
      for (const row of rows) {
        if (typeof row.id !== 'string' || !row.id.startsWith('presence:')) {
          continue;
        }
        const items = asRecord(row.items);
        if (typeof items.id !== 'string' || typeof items.nodeId !== 'string' || typeof items.language !== 'string') {
          continue;
        }
        inner.register({
          id: items.id,
          nodeId: items.nodeId,
          language: items.language as 'common_light',
          upy: typeof items.upy === 'number' ? items.upy : 0,
        });
      }
      const letters = await db.mail.findMany();
      for (const row of letters) {
        inner.saveMail({
          id: String(row.id),
          fromId: String(row.senderId),
          toId: String(row.receiverId),
          subject: String(row.subject),
          body: String(row.body),
        });
      }
    },
  };
}

function bindCrafters(db: RiftDb): CrafterStore {
  return {
    async get(characterId) {
      const row = await db.storage.findUnique({ where: { id: `craft:${characterId}` } });
      if (row === null) {
        return undefined;
      }
      return asRecord(row.items) as unknown as CrafterState;
    },
    async save(characterId, state) {
      await db.storage.upsert({
        where: { id: `craft:${characterId}` },
        create: {
          id: `craft:${characterId}`,
          ownerId: characterId,
          items: state,
          gold: state.gold,
          slots: 0,
        },
        update: { items: state, gold: state.gold },
      });
      for (const [skillId, skill] of Object.entries(state.skills)) {
        if (skill === undefined) {
          continue;
        }
        await db.characterSkill.upsert({
          where: { characterId_skillId: { characterId, skillId } },
          create: { characterId, skillId, level: skill.level, experience: skill.xp },
          update: { level: skill.level, experience: skill.xp },
        });
      }
    },
  };
}

function bindMaterials(db: RiftDb): MaterialBank {
  return {
    async read(characterId) {
      const row = await db.storage.findUnique({ where: { id: `materials:${characterId}` } });
      if (row === null) {
        return {};
      }
      return asRecord(row.items) as Record<string, number>;
    },
    async commit(characterId, expected, next) {
      const current = await this.read(characterId);
      const keys = new Set([...Object.keys(current), ...Object.keys(expected)]);
      for (const key of keys) {
        if ((current[key] ?? 0) !== (expected[key] ?? 0)) {
          return false;
        }
      }
      await db.storage.upsert({
        where: { id: `materials:${characterId}` },
        create: {
          id: `materials:${characterId}`,
          ownerId: characterId,
          items: next,
          gold: 0,
          slots: Object.keys(next).length,
        },
        update: { items: next },
      });
      return true;
    },
  };
}

function bindItems(db: RiftDb): ItemSink {
  return {
    async put(item: CraftedItem) {
      const itemId = `${item.characterId}:${item.recipeId}:${item.grade}:${item.itemLevel}`;
      await db.item.upsert({
        where: { id: itemId },
        create: {
          id: itemId,
          templateId: item.templateId,
          ownerId: item.characterId,
          durability: 10000,
          level: item.itemLevel,
          gradeId: item.grade,
          stats: { recipeId: item.recipeId },
          activeSkills: [],
          passiveSkills: [],
          sockets: [],
          createdAt: stamp(0),
        },
        update: { level: item.itemLevel, gradeId: item.grade },
      });
      return { itemId };
    },
  };
}

function bindInstances(db: RiftDb): InstanceRepository {
  const memory = memoryInstanceRepository();
  return {
    findById: (id) => memory.findById(id),
    findByKey: (key) => memory.findByKey(key),
    list: () => memory.list(),
    insert(instance) {
      memory.insert(instance);
      write(db, 
        db.instanceRecord.upsert({
          where: { id: instance.id },
          create: {
            id: instance.id,
            seed: instance.seedText,
            type: instance.scope,
            data: instance,
            createdAt: stamp(instance.windowStartMs),
            expiresAt: stamp(instance.expireAt ?? instance.windowStartMs),
          },
          update: { data: instance },
        }),
      );
    },
    update(instance) {
      memory.update(instance);
      write(db, 
        db.instanceRecord.upsert({
          where: { id: instance.id },
          create: {
            id: instance.id,
            seed: instance.seedText,
            type: instance.scope,
            data: instance,
            createdAt: stamp(instance.windowStartMs),
            expiresAt: stamp(instance.expireAt ?? instance.windowStartMs),
          },
          update: { data: instance },
        }),
      );
    },
    delete(id) {
      memory.delete(id);
      write(db, db.instanceRecord.delete({ where: { id } }));
    },
    findLock: (characterId, nodeId, edgeId) => memory.findLock(characterId, nodeId, edgeId),
    saveLock: (lock) => memory.saveLock(lock),
  };
}

function bindEvents(db: RiftDb): EventRepository {
  const memory = createEventRepository();
  return {
    addWeather(plan) {
      memory.addWeather(plan);
      write(db, 
        db.weather.create({
          data: {
            id: `${plan.regionId}:${plan.weatherId}:${plan.startMs}`,
            regionId: plan.regionId,
            templateId: plan.weatherId,
            startedAt: stamp(plan.startMs),
          },
        }),
      );
    },
    weatherFor: (regionId) => memory.weatherFor(regionId),
    startInvasion: (regionId, startMs) => memory.startInvasion(regionId, startMs),
    invasionStartedAt: (regionId) => memory.invasionStartedAt(regionId),
  };
}

function bindAi(db: RiftDb): AiRepository {
  const memory = createAiRepository();
  return {
    remember(characterId, entry) {
      memory.remember(characterId, entry);
      write(db, 
        db.memory.create({
          data: {
            id: `${characterId}:${entry.atMs}:${entry.text}`,
            botId: characterId,
            content: entry,
            timestamp: stamp(entry.atMs),
          },
        }),
      );
    },
    memory: (characterId) => memory.memory(characterId),
    requestTrain: (kind, nowMs) => memory.requestTrain(kind, nowMs),
    recordRejection: (entry) => memory.recordRejection(entry),
    rejections: () => memory.rejections(),
  };
}

function bindWorld(db: RiftDb): WorldRepository {
  const memory = memoryWorldRepository();
  return {
    load: () => memory.load(),
    async saveSnapshot(payload) {
      await db.storage.upsert({
        where: { id: 'world:sim' },
        create: {
          id: 'world:sim',
          ownerId: 'world',
          items: payload,
          gold: 0,
          slots: 0,
        },
        update: { items: payload },
      });
    },
    async loadSnapshot() {
      const row = await db.storage.findUnique({ where: { id: 'world:sim' } });
      return row === null ? null : row.items;
    },
  };
}

function bindAll(db: RiftDb): PrismaRepositories {
  const tracker = createWriteTracker();
  trackers.set(db, tracker);
  return {
    auth: bindAuth(db),
    characters: bindCharacters(db),
    crafters: bindCrafters(db),
    materials: bindMaterials(db),
    items: bindItems(db),
    instances: bindInstances(db),
    economy: bindEconomy(db),
    events: bindEvents(db),
    guilds: bindGuilds(db),
    inventory: bindInventory(db),
    quests: bindQuests(db),
    social: bindSocial(db),
    world: bindWorld(db),
    ai: bindAi(db),
    flush: () => tracker.flush(),
  };
}

export function createPrismaAuthRepository(env: PersistenceEnv, client?: RiftDb): AuthRepository {
  return bindAuth(dbFrom(env, client));
}

export function createPrismaCharacterRepository(env: PersistenceEnv, client?: RiftDb): CharacterRepository {
  return bindCharacters(dbFrom(env, client));
}

export function createPrismaCrafterStore(env: PersistenceEnv, client?: RiftDb): CrafterStore {
  return bindCrafters(dbFrom(env, client));
}

export function createPrismaMaterialBank(env: PersistenceEnv, client?: RiftDb): MaterialBank {
  return bindMaterials(dbFrom(env, client));
}

export function createPrismaItemSink(env: PersistenceEnv, client?: RiftDb): ItemSink {
  return bindItems(dbFrom(env, client));
}

export function createPrismaInstanceRepository(env: PersistenceEnv, client?: RiftDb): InstanceRepository {
  return bindInstances(dbFrom(env, client));
}

export function createPrismaEconomyRepository(env: PersistenceEnv, client?: RiftDb): EconomyRepository {
  return bindEconomy(dbFrom(env, client));
}

export function createPrismaEventRepository(env: PersistenceEnv, client?: RiftDb): EventRepository {
  return bindEvents(dbFrom(env, client));
}

export function createPrismaGuildRepository(env: PersistenceEnv, client?: RiftDb): GuildRepository {
  return bindGuilds(dbFrom(env, client));
}

export function createPrismaInventoryRepository(env: PersistenceEnv, client?: RiftDb): InventoryRepository {
  return bindInventory(dbFrom(env, client));
}

export function createPrismaQuestRepository(env: PersistenceEnv, client?: RiftDb): QuestProgressRepository {
  return bindQuests(dbFrom(env, client));
}

export function createPrismaSocialRepository(env: PersistenceEnv, client?: RiftDb): SocialRepository {
  return bindSocial(dbFrom(env, client));
}

export function createPrismaWorldRepository(env: PersistenceEnv, client?: RiftDb): WorldRepository {
  return bindWorld(dbFrom(env, client));
}

export function createPrismaAiRepository(env: PersistenceEnv, client?: RiftDb): AiRepository {
  return bindAi(dbFrom(env, client));
}

export function createPrismaRepositories(env: PersistenceEnv, client?: RiftDb): PrismaRepositories {
  return bindAll(dbFrom(env, client));
}
