import { expect, test } from 'vitest';
import type { StatBlock } from '@rift/domain/stats';
import { NotConfiguredError, createPrismaRepositories, type PrismaWrite, type RiftDb } from './prisma';
import type { CharacterRecord } from '../../modules/character/types';

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (value !== null && typeof value === 'object') {
      const compound = value as Record<string, unknown>;
      for (const [inner, innerValue] of Object.entries(compound)) {
        if (row[inner] !== innerValue) {
          return false;
        }
      }
      continue;
    }
    if (row[key] !== value) {
      return false;
    }
  }
  return true;
}

function table(calls: { model: string; op: string }[], model: string): PrismaWrite {
  const rows: Record<string, unknown>[] = [];
  return {
    async create({ data }) {
      calls.push({ model, op: 'create' });
      rows.push({ ...data });
      return data;
    },
    async upsert({ where, create, update }) {
      calls.push({ model, op: 'upsert' });
      const found = rows.find((row) => matches(row, where));
      if (found === undefined) {
        const next = { ...create };
        rows.push(next);
        return next;
      }
      Object.assign(found, update);
      return found;
    },
    async findUnique({ where }) {
      calls.push({ model, op: 'findUnique' });
      const found = rows.find((row) => matches(row, where));
      return found === undefined ? null : { ...found };
    },
    async findMany(args) {
      calls.push({ model, op: 'findMany' });
      const where = args?.where;
      return rows
        .filter((row) => where === undefined || matches(row, where))
        .map((row) => ({ ...row }));
    },
    async update({ where, data }) {
      calls.push({ model, op: 'update' });
      const found = rows.find((row) => matches(row, where));
      if (found === undefined) {
        throw new Error(`missing ${model}`);
      }
      Object.assign(found, data);
      return { ...found };
    },
    async delete({ where }) {
      calls.push({ model, op: 'delete' });
      const index = rows.findIndex((row) => matches(row, where));
      if (index >= 0) {
        rows.splice(index, 1);
      }
      return {};
    },
    async deleteMany(args) {
      calls.push({ model, op: 'deleteMany' });
      const where = args?.where;
      const before = rows.length;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index];
        if (row !== undefined && (where === undefined || matches(row, where))) {
          rows.splice(index, 1);
        }
      }
      return { count: before - rows.length };
    },
  };
}

function doubleClient(): { db: RiftDb; calls: { model: string; op: string }[] } {
  const calls: { model: string; op: string }[] = [];
  const names = [
    'account',
    'character',
    'characterStat',
    'characterLanguage',
    'characterTitle',
    'characterSkill',
    'inventorySlot',
    'item',
    'questProgress',
    'guild',
    'guildMember',
    'guildBank',
    'guildWar',
    'auction',
    'mail',
    'storage',
    'chatMessage',
    'instanceRecord',
    'weather',
    'memory',
  ] as const;
  const db = {} as RiftDb;
  for (const name of names) {
    db[name] = table(calls, name);
  }
  return { db, calls };
}

const URL = 'postgresql://rift@127.0.0.1:5432/rift';

function points(value = 5): StatBlock {
  return {
    body: value,
    reaction: value,
    accuracy: value,
    will: value,
    perception: value,
    technique: value,
  };
}

function character(): CharacterRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    accountId: '22222222-2222-4222-8222-222222222222',
    name: 'Lia',
    raceId: 'human',
    controller: 'player',
    level: 1,
    experience: 0,
    clean: false,
    createdAtMs: 1_000,
    bindNodeId: 'fort_humans',
    hp: 40,
    od: 5,
    appearance: {
      skin: 'fair',
      hair: 'brown',
      eyes: 'green',
      horns: false,
      ears: 'round',
      tattoos: 'none',
      scars: 'none',
      heightCm: 180,
      build: 'average',
    },
    points: points(),
    unspent: 0,
    stats: points(),
    languages: { common_light: 0, common_dark: 0, ancient: 0 },
    phase: 'online',
  };
}

test('empty DATABASE_URL stays not configured', () => {
  expect(() => createPrismaRepositories({})).toThrow(NotConfiguredError);
  expect(() => createPrismaRepositories({ DATABASE_URL: '   ' })).toThrow(NotConfiguredError);
});

test('repositories write account, character, inventory, quest progress, and guild members', async () => {
  const { db, calls } = doubleClient();
  const repos = createPrismaRepositories({ DATABASE_URL: URL }, db);
  const account = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'lia@example.com',
    passwordHash: 'hash',
    createdAtMs: 1_000,
    lastLoginAtMs: null,
    banned: false,
    banReason: null,
    banUntilMs: null,
    role: 'player' as const,
  };
  await repos.auth.insertAccount(account);
  expect(await repos.auth.findAccountByEmail('lia@example.com')).toMatchObject({ email: account.email });

  const hero = character();
  await repos.characters.insert(hero);
  const created = calls.find((call) => call.model === 'character' && call.op === 'create');
  expect(created).toBeTruthy();
  const stored = await repos.characters.findByName('Lia');
  expect(stored?.raceId).toBe('human');
  expect(stored?.phase).toBe('online');
  expect(calls.some((call) => call.model === 'characterStat' && call.op === 'upsert')).toBe(true);

  await repos.inventory.save({
    characterId: hero.id,
    gold: 100,
    stacks: [
      {
        slot: 0,
        itemId: 'rusty_sword',
        qty: 1,
        durability: 80,
        equipped: true,
        equipSlots: ['main_hand'],
      },
    ],
    character: { level: 1, stats: points() },
    totalWeightKg: 3,
    overloadPenalty: 0,
  });
  const loaded = await repos.inventory.load(hero.id);
  expect(loaded?.gold).toBe(100);
  expect(loaded?.stacks[0]?.itemId).toBe('rusty_sword');
  expect(calls.some((call) => call.model === 'inventorySlot' && call.op === 'upsert')).toBe(true);
  expect(calls.some((call) => call.model === 'item' && call.op === 'upsert')).toBe(true);

  await repos.quests.insert({
    id: 'qp-1',
    characterId: hero.id,
    acceptedAtMs: 2_000,
    difficulty: 'normal',
    progress: {
      questId: 'kill_rats',
      story: false,
      daily: false,
      repeatable: false,
      status: 'active',
      objectives: [{ id: 'rats', kind: 'kill', target: 3, current: 1 }],
      itemIds: [],
      garbled: false,
    },
  });
  const quests = await repos.quests.list(hero.id);
  expect(quests).toHaveLength(1);
  expect(quests[0]?.progress.questId).toBe('kill_rats');
  expect(repos.quests.table).toBe('quest_progress');
  expect(calls.some((call) => call.model === 'questProgress' && call.op === 'create')).toBe(true);

  await repos.guilds.saveGuild({
    id: 'guild-1',
    name: 'Red Wolves',
    tag: 'RW',
    leaderId: hero.id,
    memberIds: [hero.id, 'mate'],
    bank: 50,
  });
  const guild = await repos.guilds.findGuild('guild-1');
  expect(guild?.memberIds).toEqual([hero.id, 'mate']);
  expect(guild?.bank).toBe(50);
  expect(calls.some((call) => call.model === 'guildMember' && call.op === 'upsert')).toBe(true);

  repos.social.register({ id: hero.id, nodeId: 'fort_humans', language: 'common_light' });
  expect(repos.social.grantTitle(hero.id, 'scout')).toEqual({ ok: true, value: { titleId: 'scout' } });
  repos.social.saveMail({
    id: 'mail-1',
    fromId: hero.id,
    toId: 'kai',
    subject: 'news',
    body: 'hello',
  });
  expect(calls.some((call) => call.model === 'characterTitle' && call.op === 'create')).toBe(true);
  expect(calls.some((call) => call.model === 'mail' && call.op === 'create')).toBe(true);

  repos.economy.saveCharacter({
    characterId: hero.id,
    side: 'light',
    gold: 40,
    visited: [],
    portalCooldownUntilMs: 0,
    items: {},
  });
  repos.economy.saveLot({
    id: 'lot-1',
    sellerId: hero.id,
    itemId: 'rusty_sword',
    qty: 1,
    startPrice: 10,
    currentBid: 0,
    bidderId: null,
    buyout: 50,
    guildCity: false,
  });
  expect(repos.economy.getLot('lot-1')?.startPrice).toBe(10);
  expect(calls.some((call) => call.model === 'auction' && call.op === 'upsert')).toBe(true);
});
