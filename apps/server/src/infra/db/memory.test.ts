import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Appearance } from '@rift/domain/character';
import { emptyPoints } from '@rift/domain/stats';
import { expect, test } from 'vitest';
import type { DungeonInstance } from '../../modules/dungeon/types';
import type { CharacterRecord } from '../../modules/character/types';
import { manualClock } from '../../shared/clock';
import { KEY_TTL_SEC, ONLINE_CHARACTERS_KEY, instanceKey, sessionKey } from './keys';
import { MemoryWorld } from './memory';
import { NotConfiguredError, createPrismaRepositories } from './prisma';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '../../../prisma/schema.prisma');
const repoRoot = join(here, '../../../../..');

const MODELS = [
  'Account',
  'Character',
  'CharacterStat',
  'CharacterLanguage',
  'CharacterSkill',
  'CharacterTitle',
  'CharacterReputationNpc',
  'Quest',
  'QuestProgress',
  'CharacterJournal',
  'ItemTemplate',
  'Item',
  'InventorySlot',
  'Relic',
  'RelicTemplate',
  'EchoTemplate',
  'Echo',
  'PathTemplate',
  'Path',
  'CoreTemplate',
  'Core',
  'Region',
  'Node',
  'Edge',
  'ResourceNode',
  'GuildNodeControl',
  'InstanceRecord',
  'Combat',
  'DamageLog',
  'StatusEffect',
  'Auction',
  'Trade',
  'GuildBank',
  'Storage',
  'Guild',
  'GuildMember',
  'GuildWar',
  'GuildDiplomacy',
  'ChatMessage',
  'Mail',
  'Contract',
  'Report',
  'Mute',
  'Npc',
  'Bot',
  'Memory',
  'KnowledgeNode',
  'KnowledgeEdge',
  'ActionLog',
  'WikiArticle',
  'WikiVersion',
  'WikiVote',
  'WorldEvent',
  'Season',
  'Weather',
  'Side',
  'Biome',
  'Race',
  'RaceStatModifier',
  'RaceLanguage',
  'Stat',
  'Language',
  'CraftSkill',
  'TitleTemplate',
  'ItemGrade',
  'ItemType',
  'ItemSubtype',
  'DamageType',
  'StatusTemplate',
  'NodeType',
  'EdgeType',
  'ResourceType',
  'EventTemplate',
  'WeatherTemplate',
  'Meta',
] as const;

const appearance: Appearance = {
  skin: 'fair',
  hair: 'brown',
  eyes: 'green',
  horns: false,
  ears: 'round',
  tattoos: 'none',
  scars: 'none',
  heightCm: 180,
  build: 'average',
};

function character(name: string): CharacterRecord {
  const points = emptyPoints();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    accountId: '22222222-2222-4222-8222-222222222222',
    name,
    raceId: 'human',
    controller: 'player',
    level: 1,
    experience: 0,
    clean: false,
    createdAtMs: 0,
    bindNodeId: 'bind',
    hp: 15,
    od: 5,
    appearance,
    points,
    unspent: 20,
    stats: { ...points, body: 6 },
    languages: { common_light: 10, common_dark: 0, ancient: 0 },
    phase: 'online',
  };
}

function instance(id: string): DungeonInstance {
  return {
    id,
    key: 'edge-1',
    scope: 'shared',
    chunk: null,
    seedText: 'seed',
    layout: { rooms: [], edges: [], entranceId: 0, bossIds: [] },
    nodeId: 'node',
    edgeId: 'edge',
    windowStartMs: 0,
    present: [],
    entrants: [],
    groups: [],
    expireAt: null,
    frozenRemainingMs: null,
  };
}

function modelBlock(schema: string, name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) {
    throw new Error(`missing model ${name}`);
  }
  let depth = 0;
  for (let index = start; index < schema.length; index += 1) {
    const char = schema[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return schema.slice(start, index + 1);
      }
    }
  }
  throw new Error(`unclosed model ${name}`);
}

test('memory create then get returns the same character name', async () => {
  const world = new MemoryWorld(manualClock(0));
  const record = character('Аша');
  await world.createCharacter(record);
  const loaded = await world.getCharacter(record.id);
  expect(loaded?.name).toBe('Аша');
});

test('session key expires after 86400 seconds on the manual clock', async () => {
  const clock = manualClock(0);
  const world = new MemoryWorld(clock);
  const accountId = '22222222-2222-4222-8222-222222222222';
  await world.saveSession({
    accountId,
    sessionKey: 'sess',
    expiresAtMs: 10 ** 15,
  });
  expect(world.keys.read(sessionKey(accountId), clock.now())).not.toBeNull();
  expect(await world.getSession(accountId)).toMatchObject({ sessionKey: 'sess' });

  clock.advance(KEY_TTL_SEC.session * 1000 - 1);
  expect(await world.getSession(accountId)).not.toBeNull();

  clock.advance(1);
  expect(await world.getSession(accountId)).toBeNull();
});

test('instance key is instance:{id}', () => {
  const clock = manualClock(0);
  const world = new MemoryWorld(clock);
  const id = '33333333-3333-4333-8333-333333333333';
  expect(instanceKey(id)).toBe(`instance:${id}`);
  world.saveInstance(instance(id));
  expect(world.keys.read(instanceKey(id), clock.now())).not.toBeNull();
  expect(world.getInstance(id)?.id).toBe(id);
});

test('online character set has no TTL', () => {
  const clock = manualClock(0);
  const world = new MemoryWorld(clock);
  world.keys.addToSet(ONLINE_CHARACTERS_KEY, 'c1');
  clock.advance(10_000_000_000);
  expect(world.keys.members(ONLINE_CHARACTERS_KEY)).toEqual(['c1']);
});

test('schema has the catalog models and no character side or character quests', () => {
  const schema = readFileSync(schemaPath, 'utf8');
  const found = [...schema.matchAll(/^model (\w+) \{/gm)].map((match) => match[1]);
  for (const name of MODELS) {
    expect(found, name).toContain(name);
  }
  expect(schema.includes('model CharacterQuest')).toBe(false);
  expect(schema.includes('@@map("character_quests")')).toBe(false);
  expect(schema.includes('@@map("quest_progress")')).toBe(true);
  expect(schema.includes('@@map("guild_members")')).toBe(true);
  expect(modelBlock(schema, 'Character').includes('side')).toBe(false);
  expect(schema.includes('10000 = 100.00%')).toBe(true);
});

test('partition and ivfflat sql stay out of the test process', () => {
  const partitions = readFileSync(join(here, '../../../prisma/sql/partitions.sql'), 'utf8');
  const ivfflat = readFileSync(join(here, '../../../prisma/sql/ivfflat.sql'), 'utf8');
  expect(partitions.includes('damage_log')).toBe(true);
  expect(partitions.includes('monthly')).toBe(true);
  expect(partitions.includes('chats')).toBe(true);
  expect(partitions.includes('action_logs')).toBe(true);
  expect(partitions.includes('daily')).toBe(true);
  expect(ivfflat.includes('ivfflat')).toBe(true);
  expect(ivfflat.includes('vector(768)') || ivfflat.includes('vector_cosine_ops')).toBe(true);

  const compose = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8');
  expect(compose.includes('pgvector/pgvector:pg16')).toBe(true);
  expect(compose.includes('redis:7-alpine')).toBe(true);
  expect(compose.includes('5432')).toBe(true);
  expect(compose.includes('6379')).toBe(true);
  const envExample = readFileSync(join(repoRoot, '.env.example'), 'utf8');
  expect(envExample.includes('DATABASE_URL=')).toBe(true);
  expect(envExample.includes('REDIS_URL=')).toBe(true);
});

test('prisma factories throw not_configured without DATABASE_URL', () => {
  expect(() => createPrismaRepositories({})).toThrow(NotConfiguredError);
  expect(() => createPrismaRepositories({ DATABASE_URL: '   ' })).toThrow(NotConfiguredError);
  const repos = createPrismaRepositories({ DATABASE_URL: 'postgresql://rift@127.0.0.1:5432/rift' });
  expect(repos.characters).toBeTruthy();
  expect(repos.auth).toBeTruthy();
  expect(repos.quests).toBeTruthy();
});
