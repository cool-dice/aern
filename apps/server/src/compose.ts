import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, type Catalog } from '@rift/content';
import type { NodeKind, WorldEdge, WorldNode } from '@rift/domain/world';
import type { WorldRepository } from './modules/world/repository';
import { parseClientCommand, type ClientCommand } from '@rift/protocol';
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
import type { InventoryRepository } from './modules/inventory/repository';
import type { InventoryState } from './modules/inventory/types';
import { createQuestModule } from './modules/quest/index';
import { createSocialModule, type SocialModule } from './modules/social/index';
import { createWorldModule, type WorldModule } from './modules/world/index';
import { createBus } from './shared/bus';
import { manualClock, type Clock } from './shared/clock';
import type { GameModule, ModuleContext } from './shared/module';
import { OBSERVATION_LENGTH } from '@rift/domain/ai';
import type { QuestObjectiveKind } from '@rift/domain/quests';
import { GUILD_CREATE_GOLD } from '@rift/domain/guild';
import { newEconomyCharacter } from './modules/economy/repository';
import { observeEntity } from './modules/ai/observe';
import { SIDECAR_TIMEOUT_MS } from './modules/ai/types';
import { broadcastState } from './infra/ws/gateway';
import { isLiveAction, runLive, type LivePorts } from './runtime/dispatch';
import { toSimCommand } from './sim/commands';
import { onObjective } from './sim/progress';
import { prototypeEncounter, spawnNamed } from './sim/population';
import { PROTOTYPE_MONSTERS } from './sim/bestiary';
import { stepTick, type SimCommand, type SimEntity, type SimWorld } from './sim/tick';
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
  seedTrader: (input: { characterId: string; gold: number; itemId?: string; qty?: number }) => void;
  flush: () => Promise<void>;
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
  seedTrader: (input: { characterId: string; gold: number; itemId?: string; qty?: number }) => void;
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

  function applyLife(characterId: string, kind: QuestObjectiveKind): void {
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((entity) => {
        if (entity.id !== characterId || entity.progress === undefined || entity.quests === undefined) {
          return entity;
        }
        const next = onObjective({ progress: entity.progress, quests: entity.quests }, kind);
        return { ...entity, progress: next.progress, quests: next.quests };
      }),
    };
  }

  async function reportKind(characterId: string, kind: QuestObjectiveKind): Promise<void> {
    const rows = await repos.quests.list(characterId);
    for (const row of rows) {
      if (row.progress.status !== 'active') {
        continue;
      }
      for (const objective of row.progress.objectives) {
        if (objective.kind === kind && objective.current < objective.target) {
          await quest.service.report(characterId, row.progress.questId, objective.id, 1);
        }
      }
    }
  }

  async function note(characterId: string, kind: QuestObjectiveKind): Promise<void> {
    applyLife(characterId, kind);
    await reportKind(characterId, kind);
  }

  bus.on('gather.completed', (event) => {
    void note(event.characterId, 'gather');
    void note(event.characterId, 'collect');
  });
  bus.on('item.crafted', (event) => {
    void note(event.characterId, 'craft');
  });
  bus.on('hack.opened', (event) => {
    void note(event.characterId, 'hack');
    void note(event.characterId, 'sabotage');
  });
  bus.on('wiki.written', (event) => {
    void note(event.authorId, 'lore');
    void note(event.authorId, 'learn');
    void note(event.authorId, 'investigate');
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
  let rejectedTotal = 0;
  let runtimeError: unknown = null;
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
    social: social.service,
    note,
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
      simWorld = { ...simWorld, entities: [...simWorld.entities, spawned] };
      return true;
    },
  };

  function openWallet(characterId: string): void {
    if (repos.economy.getCharacter(characterId) !== null) {
      return;
    }
    repos.economy.saveCharacter(
      newEconomyCharacter({ characterId, side: 'light', gold: GUILD_CREATE_GOLD }),
    );
  }

  function rememberCharacter(_accountId: string, characterId: string): void {
    openWallet(characterId);
    enterWorld(characterId);
  }

  function tickOnce(): void {
    if (runtimeError !== null) {
      throw runtimeError;
    }
    const snap = event.service.snapshot(clock.now(), 'plains', simWorld.safeZone === true);
    event.service.planWeather('plains', clock.now(), weatherRng);
    const seasonSpawn = snap.spawnTagMultiplier;
    simWorld = {
      ...simWorld,
      seasonSpawn,
      ...(snap.weatherId !== null ? { weatherId: snap.weatherId } : {}),
    };
    topUpSeasonSpawns(Math.max(0, Math.round(PROTOTYPE_MONSTERS.length * seasonSpawn)), snap.spawnTag);
    const commands: SimCommand[] = [];
    for (const command of pending.splice(0, pending.length)) {
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
    const beforeCorpses = new Set(simWorld.corpses.map((corpse) => corpse.victimId));
    const beforeHp = new Map(simWorld.entities.map((entity) => [entity.id, entity.hp]));
    simWorld = stepTick(simWorld, commands, rng);
    for (const corpse of simWorld.corpses) {
      if (beforeCorpses.has(corpse.victimId)) {
        continue;
      }
      clearDroppedKit(corpse.victimId);
      const killer = simWorld.entities.find((entity) => entity.id === corpse.killerId);
      if (killer !== undefined && killer.monsterId === undefined) {
        void reportKind(killer.id, 'kill');
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
    const saving = repos.world.saveSnapshot?.(statePayload());
    if (saving !== undefined) {
      void saving.catch((error: unknown) => {
        runtimeError = error;
      });
    }
    void repos.flush().catch((error: unknown) => {
      runtimeError = error;
    });
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

  function observeAndSubmit(): void {
    for (const player of simWorld.entities) {
      if (player.monsterId !== undefined) {
        continue;
      }
      const monsters = simWorld.entities.filter((entity) => entity.monsterId !== undefined);
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
      let nearest: number | null = null;
      for (const monster of monsters) {
        const distance = Math.max(
          Math.abs(monster.cell.x - player.cell.x),
          Math.abs(monster.cell.y - player.cell.y),
        );
        if (nearest === null || distance < nearest) {
          nearest = distance;
        }
      }
      void ai.service
        .submit({
          characterId: player.id,
          action: 'wait',
          legal: ['wait', 'step_n', 'attack_melee'],
          sidecarAtMs: simWorld.nowMs - SIDECAR_TIMEOUT_MS - 1,
          nowMs: simWorld.nowMs,
          hp: player.hp,
          maxHp: player.maxHp,
          od: player.od,
          nearestEnemy: nearest,
          weaponRange: 1,
        })
        .catch((error: unknown) => {
          runtimeError = error;
        });
    }
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
      self: focus === undefined ? null : entityView(focus, walletGold(focus.id)),
      entities: simWorld.entities
        .filter((entity) => entity.monsterId !== undefined)
        .map((entity) => entityView(entity, 0)),
      inventory: focus === undefined ? [] : inventoryRows(focus.id),
      corpses: simWorld.corpses,
      hack: passwords,
      hackPassword,
      quests: focus === undefined ? [] : questRows(focus),
      players: players.map((entity) => ({
        id: entity.id,
        xp: entity.progress?.xp ?? 0,
        level: entity.progress?.level ?? 1,
        quests: questRows(entity),
      })),
      mapNodes: graph.nodes.map((node) => ({ id: node.id, kind: node.kind })),
      recipes: catalog.recipes.map((recipe) => ({ id: recipe.id })),
      tax: economy.service.taxLedger(),
      keeper: parked === null ? null : { id: parked.monsterId, level: parked.level, phases: parked.phaseCount },
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
      objectives: quest.objectives.map((objective) => ({
        id: objective.id,
        target: objective.target,
        current: objective.current,
      })),
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
    const arrived = prototypeEncounter({ playerId, bindNodeId });
    simWorld = {
      ...simWorld,
      entities: [...simWorld.entities, ...arrived],
    };
    void note(playerId, 'visit');
    void note(playerId, 'discover');
  }

  function creditGold(characterId: string, amount: number): void {
    const current =
      repos.economy.getCharacter(characterId) ??
      newEconomyCharacter({ characterId, side: 'light', gold: 0 });
    repos.economy.saveCharacter({ ...current, gold: current.gold + amount });
  }

  function seedTrader(input: { characterId: string; gold: number; itemId?: string; qty?: number }): void {
    const current =
      repos.economy.getCharacter(input.characterId) ??
      newEconomyCharacter({ characterId: input.characterId, side: 'light', gold: 0 });
    const items = { ...current.items };
    if (input.itemId !== undefined) {
      items[input.itemId] = {
        itemId: input.itemId,
        level: 1,
        grade: 'common',
        unique: false,
        durability: 100,
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
        openWallet(record.id);
        enterWorld(record.id, record.bindNodeId === '' ? 'fort_humans' : record.bindNodeId);
      }
    },
    act: (action, body) => runLive(action, body, livePorts),
    state: statePayload,
    creditGold,
    seedTrader,
    flush: () => repos.flush(),
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
        socket.on('close', () => {
          sockets.delete(socket);
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
  { path: '/quest/accept', action: 'quest_accept' },
  { path: '/quest/turnin', action: 'quest_turnin' },
  { path: '/guild', action: 'guild_create' },
  { path: '/auction/bid', action: 'auction_bid' },
  { path: '/mail', action: 'mail' },
  { path: '/titles', action: 'title_grant' },
  { path: '/encounter', action: 'encounter' },
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
    nn: entity.nn ?? 0,
    nnLimit: entity.nnLimit ?? 0,
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
