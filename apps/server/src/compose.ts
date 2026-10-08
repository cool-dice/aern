import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, type Catalog } from '@rift/content';
import type { NodeKind, WorldEdge, WorldNode } from '@rift/domain/world';
import type { WorldRepository } from './modules/world/repository';
import { parseClientCommand, type ClientCommand } from '@rift/protocol';
import { mulberry32 } from '@rift/domain/rng';
import { EQUIP_SLOTS, type EquipSlot, type GradeId } from '@rift/domain/items';
import { STAT_IDS, derive, emptyPoints, type StatBlock } from '@rift/domain/stats';
import type { Appearance, RaceId } from '@rift/domain/character';
import Fastify, { type FastifyInstance } from 'fastify';
import type { WebSocketServer } from 'ws';
import { MemoryWorld } from './infra/db/memory';
import { createPrismaRepositories, type PrismaRepositories, type RiftDb } from './infra/db/prisma';
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
import type { InventoryRepository } from './modules/inventory/repository';
import type { InventoryState } from './modules/inventory/types';
import { createQuestModule } from './modules/quest/index';
import { createSocialModule, type SocialModule } from './modules/social/index';
import { createWorldModule, type WorldModule } from './modules/world/index';
import { createBus } from './shared/bus';
import { manualClock, type Clock } from './shared/clock';
import type { GameModule, ModuleContext } from './shared/module';
import { OBSERVATION_LENGTH, utilityAction } from '@rift/domain/ai';
import { NODES } from '@rift/domain/gathering';
import { branchScene, recordChoice, setWorldFlagOnce, type QuestObjectiveKind, type QuestProgress } from '@rift/domain/quests';
import { nnUsed, type BuildState } from '@rift/domain/build';
import { RACES } from '@rift/domain/character';
import { askHostilePortal, ownedCrossingFee, serviceCut, setCityFee, type PortalStance } from '@rift/domain/economy';
import {
  depositBank,
  depositNodeChest,
  freshResourceNode,
  GUILD_CREATE_GOLD,
  setNodeAccess,
  setNodeTax,
  warPhase,
  type ResourceNode,
} from '@rift/domain/guild';
import { DIRS, type Dir } from '@rift/domain/movement';
import { SIM_TICK_MS } from '@rift/domain/time';
import { canPortal } from '@rift/domain/world';
import { newEconomyCharacter } from './modules/economy/repository';
import type { EconomyCharacter } from './modules/economy/types';
import type { StoredWar } from './modules/guild/types';
import { observeEntity } from './modules/ai/observe';
import { SIDECAR_TIMEOUT_MS } from './modules/ai/types';
import { broadcastState } from './infra/ws/gateway';
import { isLiveAction, runLive, type LivePorts } from './runtime/dispatch';
import { toSimCommand } from './sim/commands';
import { askedObjective, onObjective } from './sim/progress';
import { readCaptures, tickCaptures, type CaptureHold } from './sim/capture';
import { tickResourceNodes } from './sim/nodes';
import { nextReputation, reputationScene } from './sim/reputation';
import { prototypeEncounter, spawnNamed } from './sim/population';
import { PROTOTYPE_MONSTERS } from './sim/bestiary';
import { stepTick, type SimCommand, type SimEntity, type SimWorld } from './sim/tick';
import { neighborStep, type Geography } from './sim/travel';
import { combatZone } from './sim/zones';
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
  /** Injected Prisma client. Production omits it and opens `databaseUrl`. */
  db?: RiftDb;
}

export interface ServerComposition {
  modules: readonly GameModule[];
  tickOnce: () => void;
  submit: (command: ClientCommand) => void;
  enterWorld: (playerId: string, bindNodeId?: string) => void;
  creditGuildGold: (characterId: string, amount: number) => void;
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
  enterCharacter: (accountId: string, characterId: string) => void;
  resume: (accountId: string) => Promise<void>;
  act: (action: string, body: Record<string, unknown>) => Promise<{ ok: boolean; code?: string; value?: unknown }>;
  state: () => Record<string, unknown>;
  creditGold: (characterId: string, amount: number) => void;
  seedTrader: (input: {
    characterId: string;
    gold: number;
    itemId?: string;
    qty?: number;
    level?: number;
    grade?: GradeId;
    durability?: number;
  }) => void;
  flush: () => Promise<void>;
  hydrate: () => Promise<void>;
  noteSidecar: (input: { atMs: number; characterId: string; action: string }) => void;
}

export interface BuiltServer {
  app: FastifyInstance;
  tickOnce: () => void;
  close: () => Promise<void>;
  modules: readonly GameModule[];
  economy: EconomyModule;
  guild: GuildModule;
  social: SocialModule;
  creditGold: (characterId: string, amount: number) => void;
  seedTrader: (input: {
    characterId: string;
    gold: number;
    itemId?: string;
    qty?: number;
    level?: number;
    grade?: GradeId;
    durability?: number;
  }) => void;
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
  const repos = openRepositories(options.databaseUrl, clock, options.db);
  const openWars: StoredWar[] = [];
  const guildOf = new Map<string, string>();
  const portalGrants = new Map<string, Set<string>>();
  const nodeGrants = new Map<string, Set<string>>();
  let captures: CaptureHold[] = [];
  let resourceNodes: ResourceNode[] = [];
  const saveWar = repos.guilds.saveWar.bind(repos.guilds);
  repos.guilds.saveWar = async (war) => {
    const copy = { ...war };
    const index = openWars.findIndex((row) => row.id === copy.id);
    if (index >= 0) {
      openWars[index] = copy;
    } else {
      openWars.push(copy);
    }
    await saveWar(war);
  };
  const walletIds = new Set<string>();
  const saveWallet = repos.economy.saveCharacter.bind(repos.economy);
  repos.economy.saveCharacter = (character) => {
    walletIds.add(character.characterId);
    saveWallet(character);
  };
  const sessions = new Map<string, SessionCacheEntry>();
  const auth = createAuthModule({
    jwtSecret: options.jwtSecret ?? DEV_JWT_SECRET,
    repository: trackSessions(repos.auth, sessions),
    cost: PRODUCTION_BCRYPT_COST,
    now: () => clock.now(),
  });
  const carried = new Map<string, InventoryState>();
  const inventoryRepository: InventoryRepository = {
    async load(characterId) {
      const state = await repos.inventory.load(characterId);
      if (state !== null) {
        carried.set(characterId, state);
      }
      return state;
    },
    async save(state) {
      carried.set(state.characterId, state);
      await repos.inventory.save(state);
    },
  };
  const inventory = createInventoryModule({
    catalog: toInventoryCatalog(catalog),
    repository: inventoryRepository,
  });
  const character = createCharacterModule({
    granter: { grant: (characterId) => inventory.service.grantStarter(characterId) },
    features: { playableRaces: playableRaces(catalog.features.playableRaces) },
    bus,
    repository: repos.characters,
    now: () => clock.now(),
  });
  const world = createWorldModule(withGeography(repos.world, catalog));
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
  const guild = createGuildModule({
    mode: 'live',
    repository: repos.guilds,
    gold: {
      async deduct(characterId, amount) {
        const current = repos.economy.getCharacter(characterId);
        if (current === null || current.gold < amount) {
          return { ok: false, code: 'gold' };
        }
        const next = current.gold - amount;
        repos.economy.saveCharacter({ ...current, gold: next });
        return { ok: true, value: { gold: next } };
      },
    },
  });
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
      async validate(command) {
        return validateCommand(command.characterId, command.action);
      },
    },
    presence: {
      remove(characterId) {
        removePresence(characterId);
      },
    },
    corpse: {
      create(characterId) {
        createCorpse(characterId);
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

  let simWorld: SimWorld = { ...emptyWorld(clock.now()), geography: geographyFrom(catalog) };
  seedPortals();
  seedResourceNodes();

  function applyLife(characterId: string, kind: QuestObjectiveKind, subject?: string): void {
    let barrierDown = simWorld.barrierDown === true;
    let primordialOpened = simWorld.primordialOpened === true;
    const entities = simWorld.entities.map((entity) => {
      if (entity.id !== characterId || entity.progress === undefined || entity.quests === undefined) {
        return entity;
      }
      const before = entity.quests;
      const next = onObjective({ progress: entity.progress, quests: entity.quests }, kind, subject);
      const settled = settleStoryBeats({ ...entity, progress: next.progress, quests: next.quests }, before);
      barrierDown = barrierDown || settled.barrierDown;
      primordialOpened = primordialOpened || settled.primordialOpened;
      return settled.entity;
    });
    simWorld = {
      ...simWorld,
      entities,
      ...(barrierDown ? { barrierDown: true } : {}),
      ...(primordialOpened ? { primordialOpened: true } : {}),
    };
  }

  function settleStoryBeats(
    entity: SimEntity,
    before: readonly QuestProgress[],
  ): { entity: SimEntity; barrierDown: boolean; primordialOpened: boolean } {
    const finished = new Set<string>();
    for (const quest of entity.quests ?? []) {
      const prior = before.find((row) => row.questId === quest.questId);
      for (const objective of quest.objectives) {
        const previous = prior?.objectives.find((row) => row.id === objective.id)?.current ?? 0;
        if (previous < objective.target && objective.current >= objective.target) {
          finished.add(objective.id);
        }
      }
    }
    let flags = { barrierDown: false, primordialOpened: false };
    if (finished.has('shutdown')) {
      flags = setWorldFlagOnce(flags, 'barrierDown');
    }
    if (finished.has('outer_ring')) {
      flags = setWorldFlagOnce(flags, 'primordialOpened');
    }
    return { entity, barrierDown: flags.barrierDown, primordialOpened: flags.primordialOpened };
  }

  async function reportKind(characterId: string, kind: QuestObjectiveKind, subject?: string): Promise<void> {
    const rows = await repos.quests.list(characterId);
    for (const row of rows) {
      if (row.progress.status !== 'active') {
        continue;
      }
      for (const objective of row.progress.objectives) {
        if (objective.current >= objective.target) {
          continue;
        }
        if (!askedObjective(row.progress, objective, kind, subject)) {
          continue;
        }
        await quest.service.report(characterId, row.progress.questId, objective.id, 1);
      }
    }
  }

  async function note(characterId: string, kind: QuestObjectiveKind, subject?: string): Promise<void> {
    if (kind === 'visit' && subject !== undefined) {
      rememberVisit(characterId, subject);
    }
    applyLife(characterId, kind, subject);
    await reportKind(characterId, kind, subject);
  }

  function rememberVisit(characterId: string, nodeId: string): void {
    const node = simWorld.geography?.nodes.find((row) => row.id === nodeId);
    if (node?.kind !== 'city') {
      return;
    }
    const wallet = repos.economy.getCharacter(characterId);
    if (wallet === null || wallet.visited.includes(nodeId)) {
      return;
    }
    repos.economy.saveCharacter({ ...wallet, visited: [...wallet.visited, nodeId] });
  }

  function shiftReputation(characterId: string, npcId: string, event: 'quest' | 'fail' | 'attack' | 'gift'): number {
    let stored = nextReputation(undefined, event);
    let found = false;
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((entity) => {
        if (entity.id !== characterId || entity.monsterId !== undefined) {
          return entity;
        }
        found = true;
        const reputation = { ...(entity.reputation ?? {}) };
        stored = nextReputation(reputation[npcId], event);
        reputation[npcId] = stored;
        return { ...entity, reputation };
      }),
    };
    return found ? stored : 0;
  }

  async function applyChoice(characterId: string, questId: string | undefined, choiceId: string): Promise<boolean> {
    let found = false;
    const entities = simWorld.entities.map((entity) => {
      if (entity.id !== characterId || entity.quests === undefined) {
        return entity;
      }
      const quests = entity.quests.map((quest) => {
        if (quest.status !== 'active') {
          return quest;
        }
        if (questId !== undefined && quest.questId !== questId) {
          return quest;
        }
        if (questId === undefined && !quest.story) {
          return quest;
        }
        found = true;
        return recordChoice(quest, choiceId);
      });
      return { ...entity, quests };
    });
    if (!found) {
      return false;
    }
    simWorld = { ...simWorld, entities };
    const rows = await repos.quests.list(characterId);
    for (const row of rows) {
      if (row.progress.status !== 'active') {
        continue;
      }
      if (questId !== undefined && row.progress.questId !== questId) {
        continue;
      }
      if (questId === undefined && !row.progress.story) {
        continue;
      }
      await repos.quests.save({ ...row, progress: recordChoice(row.progress, choiceId) });
    }
    return true;
  }

  bus.on('gather.completed', (event) => {
    const gathered = event.nodeId in NODES ? NODES[event.nodeId as keyof typeof NODES].resource : null;
    void note(event.characterId, 'gather', gathered ?? event.nodeId);
    void note(event.characterId, 'collect', gathered ?? event.nodeId);
  });
  bus.on('item.crafted', (event) => {
    void note(event.characterId, 'craft', event.itemId);
  });
  bus.on('hack.opened', (event) => {
    const subject = event.subject ?? event.kind;
    void note(event.characterId, 'hack', subject);
    void note(event.characterId, 'sabotage', subject);
  });
  bus.on('wiki.written', (event) => {
    void note(event.authorId, 'lore', event.articleId);
    void note(event.authorId, 'learn', event.articleId);
    void note(event.authorId, 'investigate', event.articleId);
  });
  bus.on('quest.completed', (event) => {
    shiftReputation(event.characterId, event.npcId ?? event.questId, 'quest');
  });
  bus.on('quest.failed', (event) => {
    shiftReputation(event.characterId, event.npcId ?? event.questId, 'fail');
  });
  bus.on('build.installed', (event) => {
    if (event.kind === 'path') {
      void note(event.characterId, 'learn');
    }
    void note(event.characterId, 'craft');
  });
  bus.on('chat.message', (event) => {
    void note(event.senderId, 'talk');
  });
  bus.on('combat.hit', (event) => {
    void note(event.targetId, 'defend');
    void note(event.attackerId, 'pvp');
  });
  const pending: ClientCommand[] = [];
  let sidecarHeardAt = clock.now();
  let focusObservation: number[] = [];
  let lastUtility: string | null = null;
  let playedUtility = 0;
  let rejectedTotal = 0;
  let runtimeError: unknown = null;
  let snapshotJob: Promise<void> = Promise.resolve();
  let snapshotError: unknown = null;
  const rng = mulberry32(1);
  const weatherRng = mulberry32(2);
  const sockets = new Set<{ send(data: string): void }>();
  const parked = spawnNamed('keeper_enhanced', 'content:keeper_enhanced');

  const livePorts: LivePorts = {
    now: () => clock.now(),
    gathering: gathering.service,
    hack: hack.service,
    wiki: wiki.service,
    build: build.service,
    dungeon: dungeon.service,
    quest: quest.service,
    guild: guild.service,
    economy: economy.service,
    craft: craft.service(),
    ensureCrafter: openCrafter,
    social: social.service,
    enterDungeon(characterId, instanceId, layout) {
      const entrance = layout.rooms.find((room) => room.id === layout.entranceId) ?? layout.rooms[0];
      simWorld = {
        ...simWorld,
        entities: simWorld.entities.map((entity) => {
          if (entity.id !== characterId) {
            return entity;
          }
          return {
            ...entity,
            dungeonId: instanceId,
            roomId: layout.entranceId,
            dungeonRooms: layout.rooms.map((room) => ({ id: room.id, x: room.x, y: room.y })),
            dungeonEdges: layout.edges.map((edge) => [edge[0], edge[1]] as [number, number]),
            ...(entrance !== undefined ? { cell: { x: entrance.x, y: entrance.y } } : {}),
          };
        }),
      };
    },
    leaveDungeon(characterId) {
      const entity = simWorld.entities.find((row) => row.id === characterId);
      if (entity?.dungeonId !== undefined) {
        dungeon.service.leave(entity.dungeonId, characterId, clock.now());
      }
      simWorld = {
        ...simWorld,
        entities: simWorld.entities.map((row) => {
          if (row.id !== characterId) {
            return row;
          }
          const next = { ...row, cell: row.bindCell ?? { x: 0, y: 0 } };
          delete next.dungeonId;
          delete next.roomId;
          delete next.dungeonRooms;
          delete next.dungeonEdges;
          return next;
        }),
      };
    },
    note,
    applyChoice,
    shiftReputation,
    portalTo,
    askPortal,
    grantPortal,
    assignGuild,
    creditService,
    setOwnedCityFee,
    resourceTax,
    resourceAccess,
    addNodeChest,
    setResourceTax,
    setResourceAccess,
    grantResource,
    async loadBuild(characterId) {
      return buildOf(characterId);
    },
    async relicGrade(characterId) {
      const record = await repos.characters.findById(characterId);
      return record?.build?.relicGrade ?? 'common';
    },
    async saveBuild(characterId, state, relicGrade, echoIds) {
      const record = await repos.characters.findById(characterId);
      if (record === null) {
        return;
      }
      await repos.characters.update({
        ...record,
        build: {
          programs: state.programs.map((program) => ({ ...program })),
          cores: state.cores.map((core) => ({ ...core })),
          relicSocketFree: state.relicSocketFree,
          relicGrade,
          purifyingUntilMs: state.purifyingUntilMs,
          echoIds: [...echoIds],
        },
      });
    },
    walletGold(characterId) {
      return repos.economy.getCharacter(characterId)?.gold ?? 0;
    },
    setGold(characterId, gold) {
      const current = repos.economy.getCharacter(characterId);
      if (current === null) {
        return;
      }
      repos.economy.saveCharacter({ ...current, gold });
    },
    async placeQuest(characterId, questId) {
      const rows = await repos.quests.list(characterId);
      const row = rows.find(
        (entry) => entry.progress.questId === questId && entry.progress.status === 'active',
      );
      if (row === undefined) {
        return;
      }
      simWorld = {
        ...simWorld,
        entities: simWorld.entities.map((entity) => {
          if (entity.id !== characterId) {
            return entity;
          }
          const quests = (entity.quests ?? []).filter((quest) => quest.questId !== questId);
          return { ...entity, quests: [...quests, row.progress] };
        }),
      };
    },
    setNeural(characterId, nn, nnLimit) {
      simWorld = {
        ...simWorld,
        entities: simWorld.entities.map((entity) =>
          entity.id === characterId ? { ...entity, nn, nnLimit } : entity,
        ),
      };
    },
    weatherSpeed() {
      return simWorld.gatherSpeed ?? 1;
    },
    seasonBonus() {
      return (simWorld.seasonSpawn ?? 1) > 1;
    },
    addEncounter(monsterId) {
      const spawned = spawnNamed(monsterId, `${monsterId}:${String(simWorld.tick)}`);
      if (spawned === null) {
        return false;
      }
      simWorld = { ...simWorld, entities: [...simWorld.entities, { ...spawned, inEncounter: true }] };
      return true;
    },
    enterEncounter(characterId) {
      const present = simWorld.entities.some((entity) => entity.id === characterId && entity.monsterId === undefined);
      if (!present) {
        return false;
      }
      simWorld = {
        ...simWorld,
        entities: simWorld.entities.map((entity) =>
          entity.id === characterId ? { ...entity, inEncounter: true, cell: { x: 0, y: 0 } } : entity,
        ),
      };
      return true;
    },
  };

  function openWallet(characterId: string, side: 'light' | 'dark' = 'light'): void {
    if (repos.economy.getCharacter(characterId) !== null) {
      return;
    }
    repos.economy.saveCharacter(
      newEconomyCharacter({ characterId, side, gold: GUILD_CREATE_GOLD }),
    );
  }

  function assignGuild(characterId: string, guildId: string): void {
    guildOf.set(characterId, guildId);
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((entity) =>
        entity.id === characterId ? { ...entity, guildId } : entity,
      ),
    };
  }

  function seedResourceNodes(): void {
    resourceNodes = [];
    for (const node of simWorld.geography?.nodes ?? []) {
      if (node.kind !== 'resource') {
        continue;
      }
      resourceNodes.push(freshResourceNode(node.id));
    }
  }

  function seedPortals(): void {
    repos.economy.setGuild('live');
    for (const node of simWorld.geography?.nodes ?? []) {
      if (node.kind !== 'city' || repos.economy.getNode(node.id) !== null) {
        continue;
      }
      repos.economy.saveNode({
        nodeId: node.id,
        kind: 'city',
        side: node.side,
        cityFee: 0,
        hostile: false,
      });
    }
  }

  async function portalTo(characterId: string, toNodeId: string): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const entity = simWorld.entities.find((row) => row.id === characterId && row.monsterId === undefined);
    if (entity === undefined || entity.nodeId === undefined) {
      return { ok: false, code: 'missing' };
    }
    repos.economy.setBarrierDown(simWorld.barrierDown === true);
    const wallet = repos.economy.getCharacter(characterId);
    if (wallet === null) {
      return { ok: false, code: 'missing' };
    }
    const from = simWorld.geography?.nodes.find((node) => node.id === entity.nodeId);
    const to = simWorld.geography?.nodes.find((node) => node.id === toNodeId);
    if (from === undefined || to === undefined) {
      return { ok: false, code: 'unknown' };
    }
    const allowed = canPortal({
      from: { id: from.id, kind: from.kind, safe: from.safe, side: from.side, regionId: from.regionId },
      to: { id: to.id, kind: to.kind, safe: to.safe, side: to.side, regionId: to.regionId },
      visited: wallet.visited,
    });
    if (!allowed.ok) {
      return { ok: false, code: allowed.code };
    }
    const access = portalAccess(entity, toNodeId);
    if (!access.ok) {
      return { ok: false, code: access.code };
    }
    const node = repos.economy.getNode(toNodeId);
    if (node !== null && node.hostile) {
      repos.economy.saveNode({ ...node, hostile: false });
    }
    const paid = await economy.service.portal(characterId, toNodeId, clock.now());
    if (!paid.ok) {
      return { ok: false, code: paid.code };
    }
    const owner = captures.find((row) => row.cityId === toNodeId && row.won)?.guildId ?? null;
    const crossing = repos.economy.getNode(toNodeId)?.cityFee ?? 0;
    if (owner !== null && crossing > 0) {
      await creditGuildBank(owner, crossing);
    }
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((row) => {
        if (row.id !== characterId) {
          return row;
        }
        const next = { ...row, nodeId: to.id, cell: { x: to.x, y: to.y }, inEncounter: false };
        delete next.travel;
        return next;
      }),
    };
    const gold = repos.economy.getCharacter(characterId)?.gold ?? wallet.gold;
    const crossingFee = repos.economy.getNode(toNodeId)?.cityFee ?? 0;
    return {
      ok: true,
      value: { cooldownUntilMs: paid.value.cooldownUntilMs, nodeId: toNodeId, gold, cityFee: crossingFee },
    };
  }

  function portalStance(entity: SimEntity, owner: string): PortalStance {
    if (entity.guildId === owner) {
      return 'member';
    }
    if (entity.guildId !== undefined) {
      return 'enemy';
    }
    return 'neutral';
  }

  function portalAccess(
    entity: SimEntity,
    cityId: string,
  ): { ok: true; value: 'enter' } | { ok: false; code: string } {
    const hold = captures.find((row) => row.cityId === cityId && row.won && row.guildId !== null);
    if (hold?.guildId === undefined || hold.guildId === null) {
      return { ok: true, value: 'enter' };
    }
    const now = clock.now();
    const warActive = openWars.some(
      (war) =>
        war.cityId === cityId &&
        war.startsAtMs <= now &&
        warPhase(Math.max(0, now - war.startsAtMs)) !== 'closed',
    );
    const blockedForMs = hold.wonAtMs === undefined ? 0 : Math.max(0, now - hold.wonAtMs);
    const granted = portalGrants.get(cityId)?.has(entity.id) === true;
    const asked = askHostilePortal({
      stance: portalStance(entity, hold.guildId),
      warActive,
      blockedForMs,
      granted,
    });
    if (!asked.ok) {
      return { ok: false, code: asked.code };
    }
    return { ok: true, value: 'enter' };
  }

  async function askPortal(
    characterId: string,
    toNodeId: string,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const entity = simWorld.entities.find((row) => row.id === characterId && row.monsterId === undefined);
    if (entity === undefined) {
      return { ok: false, code: 'missing' };
    }
    const access = portalAccess(entity, toNodeId);
    if (!access.ok) {
      return { ok: false, code: access.code };
    }
    return portalTo(characterId, toNodeId);
  }

  async function grantPortal(
    guildId: string,
    cityId: string,
    characterId: string,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const hold = captures.find((row) => row.cityId === cityId && row.won && row.guildId === guildId);
    if (hold === undefined) {
      return { ok: false, code: 'owner' };
    }
    const granted = portalGrants.get(cityId) ?? new Set<string>();
    granted.add(characterId);
    portalGrants.set(cityId, granted);
    return { ok: true, value: { cityId, characterId, granted: true } };
  }

  async function creditGuildBank(guildId: string, amount: number): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) {
      return;
    }
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null) {
      return;
    }
    const deposited = depositBank(guild.bank, amount);
    await repos.guilds.saveGuild({ ...guild, bank: deposited.bank });
  }

  function applyOwnedCityFees(): void {
    for (const hold of captures) {
      if (!hold.won || hold.guildId === null) {
        continue;
      }
      const node = repos.economy.getNode(hold.cityId);
      if (node === null) {
        continue;
      }
      const fee = ownedCrossingFee(node.cityFee);
      if (node.cityFee === fee) {
        continue;
      }
      repos.economy.saveNode({ ...node, cityFee: fee });
    }
  }

  async function creditService(characterId: string, cost: number): Promise<number> {
    const cut = serviceCut(cost);
    if (cut <= 0) {
      return 0;
    }
    const entity = simWorld.entities.find((row) => row.id === characterId && row.monsterId === undefined);
    if (entity?.nodeId === undefined) {
      return 0;
    }
    const hold = captures.find((row) => row.cityId === entity.nodeId && row.won && row.guildId !== null);
    if (hold?.guildId === undefined || hold.guildId === null) {
      return 0;
    }
    await creditGuildBank(hold.guildId, cut);
    return cut;
  }

  async function setOwnedCityFee(
    guildId: string,
    cityId: string,
    fee: number,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const hold = captures.find((row) => row.cityId === cityId && row.won && row.guildId === guildId);
    if (hold === undefined) {
      return { ok: false, code: 'owner' };
    }
    const priced = setCityFee(fee);
    if (!priced.ok) {
      return { ok: false, code: priced.code };
    }
    const node = repos.economy.getNode(cityId);
    if (node === null) {
      return { ok: false, code: 'unknown' };
    }
    repos.economy.saveNode({ ...node, cityFee: priced.value });
    return { ok: true, value: { cityId, cityFee: priced.value } };
  }

  function resourceAt(nodeId: string | undefined): ResourceNode | undefined {
    if (nodeId === undefined) {
      return undefined;
    }
    return resourceNodes.find((node) => node.nodeId === nodeId);
  }

  function resourceTax(characterId: string): number {
    const entity = simWorld.entities.find((row) => row.id === characterId && row.monsterId === undefined);
    const node = resourceAt(entity?.nodeId);
    if (node?.guildId === null || node?.guildId === undefined) {
      return 0;
    }
    return node.taxPercent;
  }

  function resourceAccess(characterId: string): { ok: true } | { ok: false; code: string } {
    const entity = simWorld.entities.find((row) => row.id === characterId && row.monsterId === undefined);
    const node = resourceAt(entity?.nodeId);
    if (node === undefined || node.guildId === null) {
      return { ok: true };
    }
    if (node.access === 'open' || entity?.guildId === node.guildId) {
      return { ok: true };
    }
    if (node.access === 'request' && nodeGrants.get(node.nodeId)?.has(characterId) === true) {
      return { ok: true };
    }
    return { ok: false, code: node.access === 'closed' ? 'closed' : 'refused' };
  }

  function addNodeChest(characterId: string, amount: number): number {
    const entity = simWorld.entities.find((row) => row.id === characterId && row.monsterId === undefined);
    const node = resourceAt(entity?.nodeId);
    if (node === undefined || amount <= 0) {
      return 0;
    }
    const chest = depositNodeChest(node.chest, amount);
    const added = chest - node.chest;
    resourceNodes = resourceNodes.map((row) => (row.nodeId === node.nodeId ? { ...row, chest } : row));
    return added;
  }

  function setResourceTax(
    guildId: string,
    nodeId: string,
    taxPercent: number,
  ): { ok: boolean; code?: string; value?: unknown } {
    const node = resourceAt(nodeId);
    if (node === undefined || node.guildId !== guildId) {
      return { ok: false, code: 'owner' };
    }
    const priced = setNodeTax({ next: taxPercent, nowMs: clock.now(), taxSetAtMs: node.taxSetAtMs });
    if (!priced.ok) {
      return { ok: false, code: priced.code };
    }
    resourceNodes = resourceNodes.map((row) =>
      row.nodeId === nodeId ? { ...row, taxPercent: priced.value.taxPercent, taxSetAtMs: priced.value.taxSetAtMs } : row,
    );
    return { ok: true, value: { nodeId, taxPercent: priced.value.taxPercent } };
  }

  function setResourceAccess(
    guildId: string,
    nodeId: string,
    access: string,
  ): { ok: boolean; code?: string; value?: unknown } {
    const node = resourceAt(nodeId);
    if (node === undefined || node.guildId !== guildId) {
      return { ok: false, code: 'owner' };
    }
    const chosen = setNodeAccess(access);
    if (!chosen.ok) {
      return { ok: false, code: chosen.code };
    }
    resourceNodes = resourceNodes.map((row) => (row.nodeId === nodeId ? { ...row, access: chosen.value } : row));
    return { ok: true, value: { nodeId, access: chosen.value } };
  }

  function grantResource(
    guildId: string,
    nodeId: string,
    characterId: string,
  ): { ok: boolean; code?: string; value?: unknown } {
    const node = resourceAt(nodeId);
    if (node === undefined || node.guildId !== guildId) {
      return { ok: false, code: 'owner' };
    }
    const granted = nodeGrants.get(nodeId) ?? new Set<string>();
    granted.add(characterId);
    nodeGrants.set(nodeId, granted);
    return { ok: true, value: { nodeId, characterId, granted: true } };
  }

  function rememberCharacter(_accountId: string, characterId: string): void {
    openWallet(characterId);
    void openCrafter(characterId);
    enterWorld(characterId);
  }

  async function openCrafter(characterId: string): Promise<void> {
    const existing = await repos.crafters.get(characterId);
    if (existing === undefined) {
      await repos.crafters.save(characterId, {
        nodeId: 'fort_humans',
        inCombat: false,
        languageUpy: 100,
        gold: GUILD_CREATE_GOLD,
        skills: { weaponsmith: { level: 1, xp: 0 } },
      });
    }
    const stacks = await repos.materials.read(characterId);
    if ((stacks.metal ?? 0) < 5) {
      await repos.materials.commit(characterId, stacks, { ...stacks, metal: 5 });
    }
  }

  const travelDirs = new Set<string>(DIRS);

  function validateCommand(
    characterId: string,
    action: string,
  ): { ok: true; value: true } | { ok: false; code: string } {
    const entity = simWorld.entities.find((row) => row.id === characterId);
    if (entity === undefined) {
      return { ok: false, code: 'missing' };
    }
    if (action.startsWith('step_') || action.startsWith('run_')) {
      if (
        entity.inEncounter === true ||
        entity.dungeonId !== undefined ||
        entity.nodeId === undefined ||
        simWorld.geography === undefined
      ) {
        return { ok: true, value: true };
      }
      const dir = action.slice(action.startsWith('run_') ? 4 : 5);
      if (!travelDirs.has(dir)) {
        return { ok: false, code: 'no_edge' };
      }
      const stepped = neighborStep({
        geography: {
          ...simWorld.geography,
          barrierDown: simWorld.barrierDown === true || simWorld.geography.barrierDown,
        },
        fromId: entity.nodeId,
        dir: dir as Dir,
      });
      if (!stepped.ok) {
        return { ok: false, code: stepped.code };
      }
      return { ok: true, value: true };
    }
    if (action === 'attack_melee' || action === 'attack_ranged' || action === 'aim') {
      const zone = combatZone({
        geography: simWorld.geography,
        nodeId: entity.nodeId,
        inEncounter: entity.inEncounter === true,
        inDungeon: entity.dungeonId !== undefined,
        warCities: simWorld.warCities,
        invasion: simWorld.invasion,
      });
      if (zone !== null && zone.safeZone && !zone.pvpOpen) {
        return { ok: false, code: 'safe' };
      }
    }
    return { ok: true, value: true };
  }

  function removePresence(characterId: string): void {
    repos.social.forget(characterId);
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((entity) => {
        if (entity.id !== characterId || entity.phase === 'downed') {
          return entity;
        }
        return { ...entity, phase: 'offline', carrierOffline: true };
      }),
    };
  }

  function createCorpse(characterId: string): void {
    const entity = simWorld.entities.find((row) => row.id === characterId);
    const stacks = (entity?.inventory ?? []).map((stack) => ({
      itemId: stack.itemId,
      qty: 1,
      ...(stack.questItem === true ? { questItem: true } : {}),
      ...(stack.questOwnerId !== undefined ? { questOwnerId: stack.questOwnerId } : {}),
    }));
    const existing = simWorld.corpses.find((corpse) => corpse.victimId === characterId);
    if (existing !== undefined) {
      if (existing.killerId === undefined && entity?.lastAttackerId !== undefined) {
        existing.killerId = entity.lastAttackerId;
      }
      if ((existing.stacks?.length ?? 0) === 0 && stacks.length > 0) {
        existing.stacks = stacks;
      }
      return;
    }
    simWorld = {
      ...simWorld,
      corpses: [
        ...simWorld.corpses,
        {
          victimId: characterId,
          createdAtMs: clock.now(),
          stacks,
          looted: false,
          bindNodeId: entity?.bindNodeId ?? 'fort_humans',
          ...(entity?.lastAttackerId !== undefined ? { killerId: entity.lastAttackerId } : {}),
        },
      ],
    };
  }

  function tickOnce(): void {
    if (runtimeError !== null) {
      throw runtimeError;
    }
    const snap = event.service.snapshot(clock.now(), 'plains', simWorld.safeZone === true);
    event.service.planWeather('plains', clock.now(), weatherRng);
    if (snap.invasionActive && snap.invasion === null) {
      event.service.startInvasion('plains', clock.now());
    }
    const live = event.service.snapshot(clock.now(), 'plains', simWorld.safeZone === true);
    const seasonSpawn = live.spawnTagMultiplier;
    const warCities = openWars.filter((war) => war.startsAtMs <= clock.now()).map((war) => war.cityId);
    simWorld = {
      ...simWorld,
      seasonSpawn,
      holidayCraft: live.craftBonus,
      holidayKeeper: live.keeperBonus,
      invasion: live.invasion,
      seasonResource: live.resourceBonus,
      warCities,
      ...(live.weatherId !== null ? { weatherId: live.weatherId } : {}),
    };
    topUpSeasonSpawns(Math.max(0, Math.round(PROTOTYPE_MONSTERS.length * seasonSpawn)), live.spawnTag);
    const commands: SimCommand[] = [];
    playedUtility = 0;
    for (const command of pending.splice(0, pending.length)) {
      if (command.commandId.startsWith('utility-')) {
        playedUtility += 1;
      }
      const simCommand = toSimCommand(command);
      if (simCommand !== null) {
        commands.push(simCommand);
        continue;
      }
      if (isLiveAction(command.action)) {
        void runLive(command.action, { ...command.params }, livePorts).catch((error: unknown) => {
          runtimeError = error;
        });
      }
    }
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((entity) => {
        if (entity.monsterId !== undefined || entity.phase !== 'online') {
          return entity;
        }
        return { ...entity, inventory: kitOf(entity) };
      }),
    };
    const beforeNodes = new Map(
      simWorld.entities
        .filter((entity) => entity.monsterId === undefined)
        .map((entity) => [entity.id, entity.nodeId] as const),
    );
    const beforeCorpses = new Set(simWorld.corpses.map((corpse) => corpse.victimId));
    const beforeHp = new Map(simWorld.entities.map((entity) => [entity.id, entity.hp]));
    const monsterOf = new Map(
      simWorld.entities.flatMap((entity) =>
        entity.monsterId === undefined ? [] : [[entity.id, entity.monsterId] as const],
      ),
    );
    const eventFields = {
      seasonSpawn: simWorld.seasonSpawn,
      holidayCraft: simWorld.holidayCraft,
      holidayKeeper: simWorld.holidayKeeper,
      invasion: simWorld.invasion,
      seasonResource: simWorld.seasonResource,
      ...(simWorld.barrierDown === true ? { barrierDown: true } : {}),
      ...(simWorld.primordialOpened === true ? { primordialOpened: true } : {}),
    };
    simWorld = { ...stepTick(simWorld, commands, rng), ...eventFields };
    captures = tickCaptures({
      holds: captures,
      wars: openWars.map((war) => ({ cityId: war.cityId, startsAtMs: war.startsAtMs })),
      nowMs: simWorld.nowMs,
      deltaMs: SIM_TICK_MS,
      present: simWorld.entities.flatMap((entity) => {
        if (
          entity.monsterId !== undefined ||
          entity.phase !== 'online' ||
          entity.hp <= 0 ||
          entity.guildId === undefined ||
          entity.nodeId === undefined
        ) {
          return [];
        }
        return [{ cityId: entity.nodeId, guildId: entity.guildId }];
      }),
    });
    applyOwnedCityFees();
    resourceNodes = tickResourceNodes({
      nodes: resourceNodes,
      present: simWorld.entities.flatMap((entity) => {
        if (
          entity.monsterId !== undefined ||
          entity.phase !== 'online' ||
          entity.hp <= 0 ||
          entity.guildId === undefined ||
          entity.nodeId === undefined
        ) {
          return [];
        }
        return [{ nodeId: entity.nodeId, guildId: entity.guildId }];
      }),
      deltaMs: SIM_TICK_MS,
    });
    for (const entity of simWorld.entities) {
      if (entity.monsterId !== undefined || entity.nodeId === undefined) {
        continue;
      }
      if (beforeNodes.get(entity.id) !== entity.nodeId) {
        void note(entity.id, 'visit', entity.nodeId);
      }
    }
    dungeon.service.tickTtl(simWorld.nowMs, true);
    for (const corpse of simWorld.corpses) {
      if (beforeCorpses.has(corpse.victimId)) {
        continue;
      }
      createCorpse(corpse.victimId);
      if (
        simWorld.entities.some((entity) => entity.id === corpse.victimId && entity.monsterId === undefined)
      ) {
        removePresence(corpse.victimId);
      }
      clearDroppedKit(corpse.victimId);
      const killer = simWorld.entities.find((entity) => entity.id === corpse.killerId);
      if (killer !== undefined && killer.monsterId === undefined) {
        void reportKind(killer.id, 'kill', monsterOf.get(corpse.victimId));
        if (corpse.victimId.includes(':elite') || corpse.victimId.includes('keeper')) {
          void note(killer.id, 'capture');
        }
      }
    }
    for (const entity of simWorld.entities) {
      if (entity.monsterId !== undefined || entity.progress === undefined) {
        continue;
      }
      const previous = beforeHp.get(entity.id);
      if (previous !== undefined && entity.hp < previous && entity.hp > 0) {
        void note(entity.id, 'survive');
        void note(entity.id, 'defend');
      }
    }
    for (const command of commands) {
      const rejected = simWorld.rejections.some((row) => row.entityId === commandActor(command));
      if (rejected) {
        continue;
      }
      if (command.type === 'attack') {
        const attacker = simWorld.entities.find((entity) => entity.id === command.attackerId);
        const target = simWorld.entities.find((entity) => entity.id === command.targetId);
        if (attacker?.monsterId === undefined && target?.monsterId === undefined && attacker !== undefined) {
          void note(attacker.id, 'pvp');
        }
      } else if (command.type === 'loot') {
        void note(command.entityId, 'collect');
      } else if (command.type === 'respawn') {
        void note(command.entityId, 'survive');
      } else if (command.type === 'revive') {
        void note(command.entityId, 'rescue');
      }
    }
    const delta = simWorld.nowMs - clock.now();
    if (delta !== 0) {
      clock.advance(delta);
    }
    rejectedTotal += simWorld.rejections.length;
    observeAndSubmit();
    publishState();
    const saving = repos.world.saveSnapshot?.(simSnapshot());
    snapshotJob = (saving ?? Promise.resolve()).then(
      () => undefined,
      (error: unknown) => {
        snapshotError = error;
        runtimeError = error;
      },
    );
    void repos.flush().catch((error: unknown) => {
      runtimeError = error;
    });
  }

  function simSnapshot(): { kind: 'rift-sim'; world: SimWorld; wallets: EconomyCharacter[]; captures: CaptureHold[] } {
    const wallets: EconomyCharacter[] = [];
    for (const characterId of walletIds) {
      const wallet = repos.economy.getCharacter(characterId);
      if (wallet !== null) {
        wallets.push(wallet);
      }
    }
    return structuredClone({
      kind: 'rift-sim',
      world: {
        ...simWorld,
        history: [],
        rejections: [],
      },
      wallets,
      captures,
    });
  }

  async function hydrate(): Promise<void> {
    const loaded = await repos.world.loadSnapshot?.();
    const stored = (await repos.economy.readStored?.()) ?? { wallets: [], lots: [] };
    const storedIds = new Set(stored.wallets.map((wallet) => wallet.characterId));
    if (isRiftSim(loaded)) {
      simWorld = {
        ...loaded.world,
        history: [],
        rejections: [],
        corpses: loaded.world.corpses ?? [],
        obstacles: loaded.world.obstacles ?? [],
        entities: loaded.world.entities ?? [],
      };
      for (const wallet of loaded.wallets) {
        if (!storedIds.has(wallet.characterId)) {
          repos.economy.saveCharacter(wallet);
        }
      }
      captures = readCaptures(loaded);
      applyOwnedCityFees();
    }
    for (const wallet of stored.wallets) {
      repos.economy.saveCharacter(wallet);
    }
    for (const lot of stored.lots) {
      repos.economy.saveLot(lot);
    }
    await repos.social.loadPersisted?.();
    const wars = await repos.guilds.listWars();
    openWars.length = 0;
    for (const war of wars) {
      openWars.push(war);
    }
  }

  function topUpSeasonSpawns(budget: number, tag: string): void {
    const players = simWorld.entities.filter((entity) => entity.monsterId === undefined);
    if (players.length === 0) {
      return;
    }
    const living = simWorld.entities.filter((entity) => entity.monsterId !== undefined && entity.hp > 0).length;
    if (living >= budget) {
      return;
    }
    const template = PROTOTYPE_MONSTERS[living % PROTOTYPE_MONSTERS.length];
    if (template === undefined) {
      return;
    }
    const spawned = spawnNamed(template.id, `season:${template.id}:${String(simWorld.tick)}`);
    if (spawned === null) {
      return;
    }
    simWorld = { ...simWorld, entities: [...simWorld.entities, { ...spawned, seasonTag: tag }] };
  }

  function noteSidecar(input: { atMs: number; characterId: string; action: string }): void {
    if (!Number.isFinite(input.atMs)) {
      return;
    }
    sidecarHeardAt = input.atMs;
    if (input.action === 'wait' || input.action === '') {
      return;
    }
    pending.push({
      commandId: `sidecar-${input.characterId}-${String(simWorld.tick)}`,
      seq: simWorld.tick,
      issuedAtMs: input.atMs,
      action: input.action,
      params: { entityId: input.characterId },
    });
  }

  function observeAndSubmit(): void {
    const players = simWorld.entities.filter((entity) => entity.monsterId === undefined);
    for (const player of players) {
      const monsters = simWorld.entities.filter((entity) => entity.monsterId !== undefined && entity.hp > 0);
      const vector = observeEntity({
        player: {
          hp: player.hp,
          maxHp: player.maxHp,
          x: player.cell.x,
          y: player.cell.y,
        },
        monsters: monsters.map((monster) => ({
          hp: monster.hp,
          maxHp: monster.maxHp,
          x: monster.cell.x,
          y: monster.cell.y,
        })),
      });
      if (vector.length !== OBSERVATION_LENGTH) {
        throw new Error(`observation length ${String(vector.length)}`);
      }
      if (player.id === players[0]?.id) {
        focusObservation = vector;
      }
      if (player.phase !== 'online') {
        lastUtility = 'downed';
        continue;
      }
      const silentForMs = simWorld.nowMs - sidecarHeardAt;
      if (silentForMs <= SIDECAR_TIMEOUT_MS) {
        lastUtility = `quiet:${String(silentForMs)}`;
        continue;
      }
      let nearest: number | null = null;
      let nearestId: string | undefined;
      for (const monster of monsters) {
        const distance = Math.max(
          Math.abs(monster.cell.x - player.cell.x),
          Math.abs(monster.cell.y - player.cell.y),
        );
        if (nearest === null || distance < nearest) {
          nearest = distance;
          nearestId = monster.id;
        }
      }
      const legal = ['wait', 'step_n', 'attack_melee', 'attack_ranged'];
      const picked = utilityAction({
        legal,
        hp: player.hp,
        maxHp: player.maxHp,
        od: player.od,
        nearestEnemy: nearest,
        weaponRange: 1,
      });
      void ai.service
        .submit({
          characterId: player.id,
          action: 'wait',
          legal,
          sidecarAtMs: sidecarHeardAt,
          nowMs: simWorld.nowMs,
          hp: player.hp,
          maxHp: player.maxHp,
          od: player.od,
          nearestEnemy: nearest,
          weaponRange: 1,
        })
        .then((decision) => {
          if (!decision.ok) {
            return;
          }
          if (picked.ok && decision.value.action === picked.value) {
            return;
          }
          pending.push(utilityCommand(player, decision.value.action, nearestId));
        })
        .catch((error: unknown) => {
          runtimeError = error;
        });
      lastUtility = picked.ok ? picked.value : 'none';
      if (picked.ok && picked.value !== 'wait') {
        pending.push(utilityCommand(player, picked.value, nearestId));
      }
    }
  }

  function utilityCommand(player: SimEntity, action: string, nearestId: string | undefined): ClientCommand {
    return {
      commandId: `utility-${player.id}-${String(simWorld.tick)}-${action}`,
      seq: simWorld.tick + 1,
      issuedAtMs: simWorld.nowMs,
      action,
      ...(action.startsWith('attack') && nearestId !== undefined ? { targetId: nearestId } : {}),
      params: {
        entityId: player.id,
        ...(action.startsWith('attack')
          ? { weaponDamage: 8, range: action === 'attack_melee' ? 1 : 8, odCost: 1 }
          : {}),
      },
    };
  }

  function statePayload(): Record<string, unknown> {
    const passwords: Record<string, unknown> = {};
    let hackPassword: string | null = null;
    const players = simWorld.entities.filter((entity) => entity.monsterId === undefined);
    const focus = players[0];
    for (const entity of players) {
      const view = hack.service.view(entity.id);
      if (view !== null) {
        passwords[entity.id] = view;
      }
    }
    if (focus !== undefined) {
      const focused = hack.service.view(focus.id);
      hackPassword = focused?.password ?? null;
    }
    const graph = world.service.graph();
    return {
      nowMs: simWorld.nowMs,
      weatherId: simWorld.weatherId ?? null,
      vision: simWorld.vision ?? 1,
      gatherSpeed: simWorld.gatherSpeed ?? 1,
      seasonSpawn: simWorld.seasonSpawn ?? 1,
      seasonResource: simWorld.seasonResource ?? null,
      holidayCraft: simWorld.holidayCraft ?? 1,
      holidayKeeper: simWorld.holidayKeeper ?? 1,
      invasion: simWorld.invasion ?? null,
      barrierDown: simWorld.barrierDown === true,
      primordialOpened: simWorld.primordialOpened === true,
      self: focus === undefined ? null : entityView(focus, walletGold(focus.id)),
      entities: simWorld.entities
        .filter((entity) => entity.monsterId !== undefined)
        .map((entity) => entityView(entity, 0)),
      inventory: focus === undefined ? [] : inventoryRows(focus.id),
      corpses: simWorld.corpses,
      hack: passwords,
      hackPassword,
      observation: focusObservation,
      lastUtility,
      playedUtility,
      quests: focus === undefined ? [] : questRows(focus),
      players: players.map((entity) => ({
        id: entity.id,
        xp: entity.progress?.xp ?? 0,
        level: entity.progress?.level ?? 1,
        nn: entity.nn ?? 0,
        nnLimit: entity.nnLimit ?? 0,
        guildId: entity.guildId ?? null,
        reputation: entity.reputation ?? {},
        dungeonId: entity.dungeonId ?? null,
        roomId: entity.roomId ?? null,
        dungeonRooms: entity.dungeonRooms ?? [],
        quests: questRows(entity),
      })),
      mapNodes: graph.nodes.map((node) => ({ id: node.id, kind: node.kind })),
      recipes: catalog.recipes.map((recipe) => ({ id: recipe.id })),
      tax: economy.service.taxLedger(),
      keeper: parked === null ? null : { id: parked.monsterId, level: parked.level, phases: parked.phaseCount },
      captures,
      resourceNodes,
      reputation: focus?.reputation ?? {},
    };
  }

  function kitOf(entity: SimEntity): NonNullable<SimEntity['inventory']> {
    const state = carried.get(entity.id);
    if (state === undefined) {
      return entity.inventory ?? [];
    }
    const bound = new Set<string>();
    for (const quest of entity.quests ?? []) {
      for (const itemId of quest.itemIds) {
        bound.add(itemId);
      }
    }
    return state.stacks.map((stack) => ({
      itemId: stack.itemId,
      questItem: bound.has(stack.itemId),
      ...(bound.has(stack.itemId) ? { questOwnerId: entity.id } : {}),
      durability: stack.durability,
      equipped: stack.equipped,
    }));
  }

  function clearDroppedKit(characterId: string): void {
    const state = carried.get(characterId);
    if (state === undefined || state.stacks.length === 0) {
      return;
    }
    void inventoryRepository.save({ ...state, stacks: [] });
  }

  function walletGold(characterId: string): number {
    return carried.get(characterId)?.gold ?? repos.economy.getCharacter(characterId)?.gold ?? 0;
  }

  function inventoryRows(characterId: string): Record<string, unknown>[] {
    const state = carried.get(characterId);
    if (state === undefined) {
      return [];
    }
    return state.stacks.map((stack) => ({
      id: `${characterId}:${String(stack.slot)}`,
      itemId: stack.itemId,
      qty: stack.qty,
      slot: stack.equipped ? (stack.equipSlots[0] ?? null) : null,
    }));
  }

  function questRows(entity: SimEntity): Record<string, unknown>[] {
    return (entity.quests ?? []).map((quest) => ({
      id: quest.questId,
      story: quest.story,
      choiceId: quest.choiceId ?? null,
      objectives: quest.objectives.map((objective) => {
        const scene = reputationScene(branchScene(quest, objective), entity.reputation?.[objective.id]);
        return {
          id: objective.id,
          kind: objective.kind,
          target: objective.target,
          current: objective.current,
          ...(objective.subject !== undefined ? { subject: objective.subject } : {}),
          ...(scene !== undefined ? { scene } : {}),
        };
      }),
    }));
  }

  function publishState(): void {
    const message = broadcastState(simWorld.tick, statePayload(), simWorld.nowMs);
    const raw = JSON.stringify(message);
    for (const socket of sockets) {
      socket.send(raw);
    }
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
    const home = simWorld.geography?.nodes.find((node) => node.id === bindNodeId);
    const homeCell = home === undefined ? { x: 0, y: 0 } : { x: home.x, y: home.y };
    const arrived = prototypeEncounter({ playerId, bindNodeId }).map((entity) => {
      if (entity.monsterId !== undefined) {
        return { ...entity, inEncounter: true, instanceId: playerId };
      }
      const membership = guildOf.get(playerId);
      return {
        ...entity,
        inEncounter: false,
        nodeId: bindNodeId,
        cell: homeCell,
        bindCell: homeCell,
        ...(membership !== undefined ? { guildId: membership } : {}),
      };
    });
    simWorld = {
      ...simWorld,
      entities: [...simWorld.entities, ...arrived],
    };
    void applyStoredNeural(playerId);
    void note(playerId, 'visit', bindNodeId);
    void note(playerId, 'discover');
  }

  async function buildOf(characterId: string): Promise<BuildState> {
    const record = await repos.characters.findById(characterId);
    const entity = simWorld.entities.find((row) => row.id === characterId);
    const stored = record?.build ?? null;
    return {
      clean: record?.clean ?? false,
      purifyingUntilMs: stored?.purifyingUntilMs ?? null,
      level: Math.max(1, record?.level ?? entity?.progress?.level ?? 1),
      will: record?.stats.will ?? 0,
      programs: stored?.programs.map((program) => ({ ...program })) ?? [],
      cores: stored?.cores.map((core) => ({ ...core })) ?? [],
      relicSocketFree: stored?.relicSocketFree ?? 0,
      inCityOrHub: true,
      inCombat: entity?.inCombat === true,
    };
  }

  function limitOf(state: BuildState): number {
    const stats = emptyPoints();
    stats.will = state.will;
    return derive({ stats, level: state.level, totalWeightKg: 0 }).nnLimit;
  }

  async function applyStoredNeural(characterId: string): Promise<void> {
    const record = await repos.characters.findById(characterId);
    if (record?.build === undefined || record.build === null || record.build.programs.length === 0) {
      return;
    }
    const state = await buildOf(characterId);
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((entity) =>
        entity.id === characterId ? { ...entity, nn: nnUsed(state), nnLimit: limitOf(state) } : entity,
      ),
    };
  }

  function creditGold(characterId: string, amount: number): void {
    const current =
      repos.economy.getCharacter(characterId) ??
      newEconomyCharacter({ characterId, side: 'light', gold: 0 });
    repos.economy.saveCharacter({ ...current, gold: current.gold + amount });
  }

  function seedTrader(input: {
    characterId: string;
    gold: number;
    itemId?: string;
    qty?: number;
    level?: number;
    grade?: GradeId;
    durability?: number;
  }): void {
    const current =
      repos.economy.getCharacter(input.characterId) ??
      newEconomyCharacter({ characterId: input.characterId, side: 'light', gold: 0 });
    const items = { ...current.items };
    if (input.itemId !== undefined) {
      items[input.itemId] = {
        itemId: input.itemId,
        level: input.level ?? 1,
        grade: input.grade ?? 'common',
        unique: false,
        durability: input.durability ?? 100,
        qty: input.qty ?? 1,
      };
    }
    repos.economy.saveCharacter({ ...current, gold: input.gold, items });
  }

  return {
    modules,
    tickOnce,
    submit,
    enterWorld,
    creditGuildGold: creditGold,
    enterCharacter: rememberCharacter,
    async resume(accountId: string) {
      const saved = await repos.characters.listByAccount(accountId);
      for (const record of saved) {
        const race = RACES.find((row) => row.id === record.raceId);
        openWallet(record.id, race?.side ?? 'light');
        void openCrafter(record.id);
        enterWorld(record.id, record.bindNodeId === '' ? 'fort_humans' : record.bindNodeId);
      }
    },
    act: (action, body) => runLive(action, body, livePorts),
    state: statePayload,
    creditGold,
    seedTrader,
    async flush() {
      await snapshotJob;
      if (snapshotError !== null) {
        const error = snapshotError;
        snapshotError = null;
        throw error instanceof Error ? error : new Error(String(error));
      }
      await repos.flush();
    },
    hydrate,
    noteSidecar,
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
        sockets.add(socket);
        const actors = new Set<string>();
        socket.on('close', () => {
          sockets.delete(socket);
          for (const characterId of actors) {
            ai.service.onCarrierOffline(characterId);
          }
        });
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
              const entityId = command.params.entityId;
              if (typeof entityId === 'string') {
                actors.add(entityId);
              }
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
    if (options.databaseUrl !== undefined && options.databaseUrl.trim() !== '') {
      await composition.hydrate();
    }
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
      creditGold: composition.creditGold,
      seedTrader: composition.seedTrader,
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

  app.post('/sidecar', async (request, reply) => {
    const body = request.body;
    if (typeof body !== 'object' || body === null) {
      return reply.code(400).send({ code: 'invalid' });
    }
    const record = body as Record<string, unknown>;
    const characterId = typeof record.characterId === 'string' ? record.characterId : '';
    const action = typeof record.action === 'string' ? record.action : '';
    const atMs = typeof record.atMs === 'number' ? record.atMs : composition.state().nowMs;
    if (characterId === '' || action === '') {
      return reply.code(400).send({ code: 'invalid' });
    }
    composition.noteSidecar({
      characterId,
      action,
      atMs: typeof atMs === 'number' ? atMs : 0,
    });
    return { ok: true as const };
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
    const local = credentials.email.split('@')[0] ?? '';
    const name = /^[\p{L}\p{Nd} ]+$/u.test(local) && [...local].length >= 3 ? [...local].slice(0, 24).join('') : 'Wanderer';
    const spawned = await character.service.create({
      accountId: result.value.accountId,
      controller: 'player',
      name,
      clean: false,
      points: { body: 10, reaction: 5, accuracy: 5, will: 0, perception: 0, technique: 0 },
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
    });
    if (spawned.ok) {
      composition.enterCharacter(result.value.accountId, spawned.value.characterId);
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
    const access = auth.service.verifyAccess(result.value.accessToken);
    if (access.ok) {
      await composition.resume(access.value.accountId);
    }
    return reply.send({
      ...result.value,
      accountId: access.ok ? access.value.accountId : null,
    });
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
    composition.enterCharacter(body.accountId, created.value.characterId);
    return reply.send({ characterId: created.value.characterId });
  });

  app.get<{ Params: { id: string } }>('/characters/:id/inventory', async (request) => {
    return inventory.service.list(request.params.id);
  });

  app.get('/state', async () => composition.state());

  app.post('/command', async (request, reply) => {
    const record = readRecord(request.body);
    if (record === undefined || typeof record.action !== 'string') {
      return reply.code(400).send({ code: 'invalid' });
    }
    if (isLiveAction(record.action)) {
      const result = await composition.act(record.action, record);
      await composition.flush();
      if (!result.ok) {
        return reply.code(400).send({ code: result.code, value: result.value ?? null });
      }
      return reply.send(result.value ?? { ok: true });
    }
    const command = parseClientCommand(record);
    if (command === null) {
      return reply.code(400).send({ code: 'invalid' });
    }
    composition.submit(command);
    return reply.send({ queued: true });
  });

  for (const route of LIVE_ROUTES) {
    app.post(route.path, async (request, reply) => {
      const record = readRecord(request.body) ?? {};
      const result = await composition.act(route.action, record);
      await composition.flush();
      if (!result.ok) {
        return reply.code(400).send({ code: result.code, value: result.value ?? null });
      }
      return reply.send(result.value ?? { ok: true });
    });
  }

  app.post('/auction', async (request, reply) => {
    const body = readAuction(request.body);
    if (body === undefined) {
      const listed = economy.service.listAuction();
      return reply.send({ lots: listed.ok ? listed.value : [] });
    }
    const offered = economy.service.offerAuction(body);
    if (!offered.ok) {
      return reply.code(400).send({ code: offered.code });
    }
    return reply.send(offered.value);
  });
}

function openRepositories(
  databaseUrl: string | undefined,
  clock: Clock,
  db: RiftDb | undefined,
): PrismaRepositories {
  if (databaseUrl !== undefined && databaseUrl.trim() !== '') {
    return createPrismaRepositories({ DATABASE_URL: databaseUrl }, db);
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
    async flush() {
      return undefined;
    },
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

const LIVE_ROUTES: readonly { path: string; action: string }[] = [
  { path: '/gather', action: 'gather' },
  { path: '/hack/start', action: 'hack_start' },
  { path: '/hack/guess', action: 'hack_guess' },
  { path: '/wiki', action: 'wiki' },
  { path: '/relic', action: 'relic_install' },
  { path: '/echo', action: 'echo_install' },
  { path: '/path', action: 'path_learn' },
  { path: '/core', action: 'core_equip' },
  { path: '/dungeon', action: 'dungeon_enter' },
  { path: '/dungeon/leave', action: 'dungeon_leave' },
  { path: '/craft/start', action: 'craft_start' },
  { path: '/craft/complete', action: 'craft_complete' },
  { path: '/trade', action: 'trade_offer' },
  { path: '/trade/accept', action: 'trade_accept' },
  { path: '/quest/accept', action: 'quest_accept' },
  { path: '/quest/turnin', action: 'quest_turnin' },
  { path: '/guild', action: 'guild_create' },
  { path: '/auction/bid', action: 'auction_bid' },
  { path: '/mail', action: 'mail' },
  { path: '/titles', action: 'title_grant' },
  { path: '/encounter', action: 'encounter' },
  { path: '/encounter/enter', action: 'encounter_enter' },
  { path: '/dialogue', action: 'dialogue' },
  { path: '/portal', action: 'portal' },
  { path: '/portal/ask', action: 'portal_ask' },
  { path: '/portal/grant', action: 'portal_grant' },
  { path: '/repair', action: 'repair' },
  { path: '/city-fee', action: 'city_fee' },
  { path: '/node/tax', action: 'node_tax' },
  { path: '/node/access', action: 'node_access' },
  { path: '/node/grant', action: 'node_grant' },
];

function entityView(entity: SimEntity, gold: number): Record<string, unknown> {
  return {
    id: entity.id,
    hp: entity.hp,
    maxHp: entity.maxHp,
    od: entity.od,
    odLimit: entity.od,
    cell: { x: entity.cell.x, y: entity.cell.y },
    facing: 'e',
    phase: entity.phase,
    level: entity.progress?.level ?? entity.level ?? 1,
    gold,
    monsterId: entity.monsterId ?? null,
    eliteId: entity.eliteId ?? null,
    seasonTag: entity.seasonTag ?? null,
    legsDestroyed: entity.legsDestroyed ?? 0,
    roomId: entity.roomId ?? null,
    nodeId: entity.nodeId ?? null,
    nn: entity.nn ?? 0,
    nnLimit: entity.nnLimit ?? 0,
    guildId: entity.guildId ?? null,
    reputation: entity.reputation ?? {},
    dungeonId: entity.dungeonId ?? null,
    dungeonRooms: entity.dungeonRooms ?? [],
  };
}

function commandActor(command: SimCommand): string {
  return command.type === 'attack' ? command.attackerId : command.entityId;
}

function withGeography(inner: WorldRepository, catalog: Catalog): WorldRepository {
  const sites = catalog.world.sites ?? [];
  const links = catalog.world.siteEdges ?? [];
  return {
    load() {
      const graph = inner.load();
      const nodes: WorldNode[] = [
        ...graph.nodes,
        ...sites.map((site) => ({
          id: site.id,
          kind: asNodeKind(site.kind),
          safe: site.safe,
          side: site.side,
          regionId: site.regionId,
        })),
      ];
      const edges: WorldEdge[] = [...graph.edges, ...links];
      return { nodes, edges };
    },
    saveSnapshot: inner.saveSnapshot?.bind(inner),
    loadSnapshot: inner.loadSnapshot?.bind(inner),
  };
}

function asNodeKind(kind: string): NodeKind {
  if (
    kind === 'city' ||
    kind === 'hub' ||
    kind === 'dungeon' ||
    kind === 'resource' ||
    kind === 'primordial' ||
    kind === 'barrier'
  ) {
    return kind;
  }
  return 'hub';
}

function isRiftSim(
  value: unknown,
): value is { kind: 'rift-sim'; world: SimWorld; wallets: EconomyCharacter[] } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as { kind?: unknown; world?: unknown; wallets?: unknown };
  if (record.kind !== 'rift-sim' || typeof record.world !== 'object' || record.world === null) {
    return false;
  }
  const world = record.world as { tick?: unknown; nowMs?: unknown; entities?: unknown };
  if (typeof world.tick !== 'number' || typeof world.nowMs !== 'number' || !Array.isArray(world.entities)) {
    return false;
  }
  if (!Array.isArray(record.wallets)) {
    return false;
  }
  return record.wallets.every((wallet) => {
    if (typeof wallet !== 'object' || wallet === null) {
      return false;
    }
    const row = wallet as { characterId?: unknown; gold?: unknown };
    return typeof row.characterId === 'string' && typeof row.gold === 'number';
  });
}

function geographyFrom(catalog: Catalog): Geography {
  const sites = catalog.world.sites ?? [];
  return {
    barrierDown: false,
    nodes: [...catalog.world.nodes, ...sites].map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      kind: asNodeKind(node.kind),
      safe: node.safe,
      side: node.side,
      regionId: node.regionId,
    })),
    edges: [...catalog.world.edges, ...(catalog.world.siteEdges ?? [])],
  };
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

function readAuction(body: unknown):
  | {
      sellerId: string;
      itemId: string;
      qty: number;
      startPrice: number;
      buyout: number | null;
      guildCity: boolean;
    }
  | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.sellerId !== 'string' || typeof record.itemId !== 'string') {
    return undefined;
  }
  if (typeof record.startPrice !== 'number' || typeof record.qty !== 'number') {
    return undefined;
  }
  return {
    sellerId: record.sellerId,
    itemId: record.itemId,
    qty: record.qty,
    startPrice: record.startPrice,
    buyout: typeof record.buyout === 'number' ? record.buyout : null,
    guildCity: record.guildCity === true,
  };
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
