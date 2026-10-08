import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, type Catalog } from '@rift/content';
import type { ClientCommand } from '@rift/protocol';
import { mulberry32 } from '@rift/domain/rng';
import { EQUIP_SLOTS, type EquipSlot } from '@rift/domain/items';
import { STAT_IDS, type StatBlock } from '@rift/domain/stats';
import type { Appearance, RaceId } from '@rift/domain/character';
import Fastify, { type FastifyInstance } from 'fastify';
import type { WebSocketServer } from 'ws';
import { MemoryWorld } from './infra/db/memory';
import { createPrismaRepositories, type PrismaRepositories } from './infra/db/prisma';
import { attach, handleMessage } from './infra/ws/gateway';
import { createAiModule, type AiModule } from './modules/ai/index';
import { createBuildModule } from './modules/build/index';
import { createGatheringModule } from './modules/gathering/index';
import { createHackModule } from './modules/hack/index';
import { createWikiModule } from './modules/wiki/index';
import { PRODUCTION_BCRYPT_COST, createAuthModule, type AuthModule } from './modules/auth/index';
import type { AuthRepository } from './modules/auth/repository';
import type { SessionRecord } from './modules/auth/types';
import { createCharacterModule, type CharacterModule } from './modules/character/index';
import { createCraftModule, type CraftCatalog } from './modules/craft/index';
import { createDungeonModule, type DungeonModule } from './modules/dungeon/index';
import { createEconomyModule, type EconomyModule } from './modules/economy/index';
import { createEventModule, createEventService, type EventModule } from './modules/event/index';
import { createGuildModule, type GuildModule } from './modules/guild/index';
import {
  createInventoryModule,
  type CatalogItem,
  type InventoryModule,
} from './modules/inventory/index';
import { createQuestModule } from './modules/quest/index';
import { createSocialModule, type SocialModule } from './modules/social/index';
import { createWorldModule, type WorldModule } from './modules/world/index';
import { createBus } from './shared/bus';
import { manualClock, type Clock } from './shared/clock';
import type { GameModule, ModuleContext } from './shared/module';
import { toSimCommand } from './sim/commands';
import { prototypeEncounter } from './sim/population';
import { stepTick, type SimCommand, type SimWorld } from './sim/tick';
import { renderMetrics, type MetricsSnapshot } from './metrics';

export { PRODUCTION_BCRYPT_COST };

const RACE_IDS: readonly RaceId[] = [
  'human',
  'demon',
  'elf',
  'dark_elf',
  'dwarf',
  'goblin',
  'troll',
  'ogre',
];

const DEV_JWT_SECRET = 'rift-dev-jwt-secret';

export interface ComposeOptions {
  nowMs?: number;
  catalog?: Catalog;
  contentDir?: string;
  jwtSecret?: string;
  databaseUrl?: string;
}

export interface ServerComposition {
  modules: readonly GameModule[];
  tickOnce: () => void;
  submit: (command: ClientCommand) => void;
  enterWorld: (playerId: string, bindNodeId?: string) => void;
  snapshot: () => MetricsSnapshot;
  auth: AuthModule;
  character: CharacterModule;
  inventory: InventoryModule;
  world: WorldModule;
  dungeon: DungeonModule;
  economy: EconomyModule;
  social: SocialModule;
  guild: GuildModule;
  event: EventModule;
  ai: AiModule;
  bindGateway: (server: WebSocketServer) => void;
}

export interface BuiltServer {
  app: FastifyInstance;
  tickOnce: () => void;
  close: () => Promise<void>;
  modules: readonly GameModule[];
  economy: EconomyModule;
  guild: GuildModule;
  social: SocialModule;
}

interface SessionCacheEntry {
  key: string;
  expiresAtMs: number;
}

/**
 * Build the module graph. This does not listen and does not open a port.
 * Callers advance time with `tickOnce`. The clock is manual.
 */
export function compose(options: ComposeOptions = {}): ServerComposition {
  const clock = manualClock(options.nowMs ?? 0);
  const bus = createBus();
  const catalog = resolveCatalog(options);
  const repos = openRepositories(options.databaseUrl, clock);
  const sessions = new Map<string, SessionCacheEntry>();
  const auth = createAuthModule({
    jwtSecret: options.jwtSecret ?? DEV_JWT_SECRET,
    repository: trackSessions(repos.auth, sessions),
    cost: PRODUCTION_BCRYPT_COST,
    now: () => clock.now(),
  });
  const inventory = createInventoryModule({
    catalog: toInventoryCatalog(catalog),
    repository: repos.inventory,
  });
  const character = createCharacterModule({
    granter: { grant: (characterId) => inventory.service.grantStarter(characterId) },
    features: { playableRaces: playableRaces(catalog.features.playableRaces) },
    bus,
    repository: repos.characters,
    now: () => clock.now(),
  });
  const world = createWorldModule(repos.world);
  const dungeon = createDungeonModule(repos.instances);
  const craft = createCraftModule({
    bank: repos.materials,
    sink: repos.items,
    crafters: repos.crafters,
    catalog: toCraftCatalog(catalog),
    seed: 1,
  });
  const economy = createEconomyModule(repos.economy);
  const social = createSocialModule(repos.social);
  const guild = createGuildModule({ mode: 'stub', repository: repos.guilds });
  const quest = createQuestModule({
    quests: catalog.quests,
    repository: repos.quests,
    rewards: {
      async grant(characterId, reward) {
        if (reward.xp > 0) {
          await character.service.grantXp(characterId, reward.xp);
        }
      },
    },
    characters: {
      async levelOf(characterId) {
        const record = await repos.characters.findById(characterId);
        return record === null ? 1 : record.level;
      },
      async upyOf() {
        return 100;
      },
    },
  });
  const event = createEventModule(createEventService(repos.events));
  const ai = createAiModule({
    validator: {
      async validate() {
        return { ok: true, value: true };
      },
    },
    presence: {
      remove() {
        return undefined;
      },
    },
    corpse: {
      create() {
        return undefined;
      },
    },
  });
  const gateway: GameModule = {
    name: 'gateway',
    start(ctx) {
      requireContext(ctx, 'gateway');
    },
  };
  const sim: GameModule = {
    name: 'sim',
    start(ctx) {
      requireContext(ctx, 'sim');
    },
  };

  const gathering = createGatheringModule(mulberry32(1));
  const hack = createHackModule(mulberry32(1));
  const wiki = createWikiModule();
  const build = createBuildModule();

  const modules: readonly GameModule[] = [
    auth,
    character,
    inventory,
    world,
    dungeon,
    craft,
    economy,
    social,
    guild,
    quest,
    event,
    gathering,
    hack,
    wiki,
    build,
    ai,
    gateway,
    sim,
  ];
  const context: ModuleContext = { bus, now: () => clock.now() };
  for (const gameModule of modules) {
    gameModule.start(context);
  }

  let simWorld = emptyWorld(clock.now());
  const pending: ClientCommand[] = [];
  let rejectedTotal = 0;
  const rng = mulberry32(1);

  function tickOnce(): void {
    const commands: SimCommand[] = [];
    for (const command of pending.splice(0, pending.length)) {
      const simCommand = toSimCommand(command);
      if (simCommand !== null) {
        commands.push(simCommand);
      }
    }
    simWorld = stepTick(simWorld, commands, rng);
    const delta = simWorld.nowMs - clock.now();
    if (delta !== 0) {
      clock.advance(delta);
    }
    rejectedTotal += simWorld.rejections.length;
  }

  function snapshot(): MetricsSnapshot {
    let players = 0;
    let bots = 0;
    for (const entity of simWorld.entities) {
      if (entity.phase !== 'online' || entity.monsterId !== undefined) {
        continue;
      }
      if (entity.isBot) {
        bots += 1;
      } else {
        players += 1;
      }
    }
    return { ticks: simWorld.tick, rejected: rejectedTotal, players, bots };
  }

  function submit(command: ClientCommand): void {
    pending.push(command);
  }

  function enterWorld(playerId: string, bindNodeId = 'fort_humans'): void {
    if (simWorld.entities.some((entity) => entity.id === playerId)) {
      return;
    }
    const arrived = prototypeEncounter({ playerId, bindNodeId });
    simWorld = {
      ...simWorld,
      entities: [...simWorld.entities, ...arrived],
    };
  }

  return {
    modules,
    tickOnce,
    submit,
    enterWorld,
    snapshot,
    auth,
    character,
    inventory,
    world,
    dungeon,
    economy,
    social,
    guild,
    event,
    ai,
    bindGateway(server) {
      server.on('connection', (socket) => {
        const seen = new Set<string>();
        const rateTimestamps: number[] = [];
        socket.on('message', (data) => {
          const result = handleMessage(messageText(data), {
            nowMs: clock.now(),
            verifyAccess: (token) => auth.service.verifyAccess(token),
            sessionKey: (accountId) => sessionKeyOf(sessions, clock.now(), accountId),
            seen,
            rateTimestamps,
            enqueue: (command) => {
              pending.push(command);
            },
          });
          if (!result.ok) {
            rejectedTotal += 1;
            socket.send(JSON.stringify(result.reject));
          }
        });
      });
    },
  };
}

/**
 * Fastify app without `listen`. Tests call `inject` and `tickOnce`.
 * A module that throws during start closes the app before it accepts traffic.
 */
export async function buildApp(options: ComposeOptions = {}): Promise<BuiltServer> {
  const app = Fastify({ logger: false });
  let sockets: WebSocketServer | undefined;
  try {
    const composition = compose(options);
    registerHttp(app, composition);
    await app.ready();
    sockets = attach(app.server);
    composition.bindGateway(sockets);
    return {
      app,
      tickOnce: composition.tickOnce,
      modules: composition.modules,
      economy: composition.economy,
      guild: composition.guild,
      social: composition.social,
      close: async () => {
        await closeSockets(sockets);
        await app.close();
      },
    };
  } catch (error) {
    await closeSockets(sockets);
    await app.close();
    throw error;
  }
}

function registerHttp(app: FastifyInstance, composition: ServerComposition): void {
  const { auth, character, inventory, economy } = composition;

  app.get('/health', async () => {
    return { ok: true as const, tick: composition.snapshot().ticks };
  });

  app.get('/metrics', async (_request, reply) => {
    return reply.type('text/plain; charset=utf-8').send(renderMetrics(composition.snapshot()));
  });

  app.post('/auth/register', async (request, reply) => {
    const credentials = readCredentials(request.body);
    if (credentials === undefined) {
      return reply.code(400).send({ code: 'email' });
    }
    const result = await auth.service.register(credentials.email, credentials.password);
    if (!result.ok) {
      return reply.code(400).send({ code: result.code });
    }
    return reply.send({ accountId: result.value.accountId });
  });

  app.post('/auth/login', async (request, reply) => {
    const credentials = readCredentials(request.body);
    if (credentials === undefined) {
      return reply.code(401).send({ code: 'credentials' });
    }
    const result = await auth.service.login(credentials.email, credentials.password);
    if (!result.ok) {
      return reply.code(401).send({ code: result.code });
    }
    return reply.send(result.value);
  });

  app.post('/characters', async (request, reply) => {
    const body = readCharacterBody(request.body);
    if (body === undefined) {
      return reply.code(400).send({ code: 'invalid' });
    }
    const created = await character.service.create({
      accountId: body.accountId,
      controller: 'player',
      name: body.name,
      clean: body.clean,
      points: body.points,
      appearance: body.appearance,
    });
    if (!created.ok) {
      return reply.code(400).send({ code: created.code });
    }
    return reply.send({ characterId: created.value.characterId });
  });

  app.get<{ Params: { id: string } }>('/characters/:id/inventory', async (request) => {
    return inventory.service.list(request.params.id);
  });

  app.post('/auction', async (_request, reply) => {
    const listed = economy.service.listAuction();
    if (listed.ok) {
      return reply.code(409).send({ code: 'feature_stub' });
    }
    return reply.code(409).send({ code: listed.code });
  });
}

function openRepositories(databaseUrl: string | undefined, clock: Clock): PrismaRepositories {
  if (databaseUrl !== undefined && databaseUrl.trim() !== '') {
    return createPrismaRepositories({ DATABASE_URL: databaseUrl });
  }
  const memory = new MemoryWorld(clock);
  return {
    auth: memory.auth,
    characters: memory.characters,
    crafters: memory.crafters,
    materials: memory.materials,
    items: memory.items,
    instances: memory.instances,
    economy: memory.economy,
    events: memory.events,
    guilds: memory.guilds,
    inventory: memory.inventory,
    quests: memory.quests,
    social: memory.social,
    world: memory.world,
    ai: memory.ai,
  };
}

function resolveCatalog(options: ComposeOptions): Catalog {
  if (options.catalog !== undefined) {
    return options.catalog;
  }
  return loadCatalog(options.contentDir ?? defaultContentDir());
}

function defaultContentDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../packages/content/data');
}

function toInventoryCatalog(catalog: Catalog): { items: CatalogItem[] } {
  return {
    items: catalog.items.map((item) => {
      const entry: CatalogItem = {
        id: item.id,
        weightKg: item.weightKg ?? item.weightKgMin ?? 0,
      };
      if (typeof item.slot === 'string' && isEquipSlot(item.slot)) {
        entry.slot = item.slot;
      }
      if (item.twoHanded === true) {
        entry.twoHanded = true;
      }
      return entry;
    }),
  };
}

function toCraftCatalog(catalog: Catalog): CraftCatalog {
  return {
    recipes: catalog.recipes,
    nodeKinds: new Map(catalog.world.nodes.map((node) => [node.id, node.kind])),
    echoIds: new Set(catalog.echoes.map((echo) => echo.id)),
    pathIds: new Set(catalog.paths.map((path) => path.id)),
    componentIds: new Set(
      catalog.items.filter((item) => item.kind === 'component').map((item) => item.id),
    ),
  };
}

function playableRaces(ids: readonly string[]): RaceId[] {
  const races: RaceId[] = [];
  for (const id of ids) {
    if (isRaceId(id)) {
      races.push(id);
    }
  }
  if (races.length === 0) {
    throw new Error('catalog has no playable races');
  }
  return races;
}

function isRaceId(id: string): id is RaceId {
  return (RACE_IDS as readonly string[]).includes(id);
}

function isEquipSlot(slot: string): slot is EquipSlot {
  return (EQUIP_SLOTS as readonly string[]).includes(slot);
}

function emptyWorld(nowMs: number): SimWorld {
  return {
    tick: 0,
    nowMs,
    entities: [],
    corpses: [],
    rejections: [],
    obstacles: [],
    history: [],
  };
}

function requireContext(ctx: ModuleContext, name: string): void {
  const now = ctx.now();
  if (!Number.isFinite(now)) {
    throw new Error(`${name} module clock is not finite`);
  }
  if (typeof ctx.bus.on !== 'function' || typeof ctx.bus.emit !== 'function') {
    throw new Error(`${name} module bus is incomplete`);
  }
}

function trackSessions(
  inner: AuthRepository,
  sessions: Map<string, SessionCacheEntry>,
): AuthRepository {
  return {
    findAccountByEmail: (email) => inner.findAccountByEmail(email),
    findAccountById: (id) => inner.findAccountById(id),
    insertAccount: (account) => inner.insertAccount(account),
    updateAccount: (account) => inner.updateAccount(account),
    async saveSession(session: SessionRecord) {
      sessions.set(session.accountId, {
        key: session.sessionKey,
        expiresAtMs: session.expiresAtMs,
      });
      await inner.saveSession(session);
    },
    async getSession(accountId, nowMs) {
      const session = await inner.getSession(accountId, nowMs);
      if (session === null) {
        sessions.delete(accountId);
        return null;
      }
      sessions.set(accountId, { key: session.sessionKey, expiresAtMs: session.expiresAtMs });
      return session;
    },
  };
}

function sessionKeyOf(
  sessions: ReadonlyMap<string, SessionCacheEntry>,
  nowMs: number,
  accountId: string,
): string | null {
  const row = sessions.get(accountId);
  if (row === undefined || row.expiresAtMs <= nowMs) {
    return null;
  }
  return row.key;
}

function messageText(data: Buffer | ArrayBuffer | Buffer[] | string): string {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  return Buffer.from(data).toString('utf8');
}

async function closeSockets(sockets: WebSocketServer | undefined): Promise<void> {
  if (sockets === undefined) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    sockets.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function readRecord(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  return body as Record<string, unknown>;
}

function readCredentials(body: unknown): { email: string; password: string } | undefined {
  const record = readRecord(body);
  if (record === undefined) {
    return undefined;
  }
  if (typeof record.email !== 'string' || typeof record.password !== 'string') {
    return undefined;
  }
  return { email: record.email, password: record.password };
}

function readCharacterBody(body: unknown):
  | {
      accountId: string;
      name: string;
      clean: boolean;
      points: StatBlock;
      appearance: Appearance;
    }
  | undefined {
  const record = readRecord(body);
  if (record === undefined) {
    return undefined;
  }
  if (typeof record.accountId !== 'string' || typeof record.name !== 'string') {
    return undefined;
  }
  if (typeof record.clean !== 'boolean') {
    return undefined;
  }
  if (!isStatBlock(record.points) || !isAppearance(record.appearance)) {
    return undefined;
  }
  return {
    accountId: record.accountId,
    name: record.name,
    clean: record.clean,
    points: record.points,
    appearance: record.appearance,
  };
}

function isStatBlock(value: unknown): value is StatBlock {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  for (const id of STAT_IDS) {
    const stat = record[id];
    if (typeof stat !== 'number' || !Number.isFinite(stat)) {
      return false;
    }
  }
  return true;
}

function isAppearance(value: unknown): value is Appearance {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const textFields = ['skin', 'hair', 'eyes', 'ears', 'tattoos', 'scars', 'build'] as const;
  for (const field of textFields) {
    if (typeof record[field] !== 'string') {
      return false;
    }
  }
  return typeof record.horns === 'boolean' && typeof record.heightCm === 'number';
}
