import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, type Catalog } from '@rift/content';
import {
  botRecord,
  buildPermutation,
  decipherAttempt,
  decodeAncient,
  encodeAncient,
  renderFragment,
} from '@rift/domain/ancient';
import type { NodeKind, WorldEdge, WorldNode } from '@rift/domain/world';
import type { WorldRepository } from './modules/world/repository';
import { parseClientCommand, type ClientCommand } from '@rift/protocol';
import {
  CHAT_BAN_MS,
  falseReportSanction,
  GUILD_NAME_BLACKLIST,
  sanctionForCheatStrikes,
} from '@rift/domain/moderation';
import { mulberry32 } from '@rift/domain/rng';
import { EQUIP_SLOTS, STARTING_DURABILITY, type EquipSlot, type GradeId } from '@rift/domain/items';
import { openChest, type ChestTier } from '@rift/domain/loot';
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
import {
  beginPurify,
  breakClean,
  completePurify,
  nnUsed,
  recoverForgetting,
  tickForgetting,
  type BuildState,
} from '@rift/domain/build';
import { removeRelic, type RelicState } from '@rift/domain/relics';
import { RACES } from '@rift/domain/character';
import { PARTY_MAX, matchmake, type PartyRole } from '@rift/domain/social';
import { gainUpy, type LanguageId } from '@rift/domain/language';
import {
  askHostilePortal,
  isCityService,
  ownedCrossingFee,
  buyFromNpc,
  deposit,
  rentStorage,
  serviceCut,
  setCityFee,
  type CityService,
  type PortalStance,
} from '@rift/domain/economy';
import {
  aiLeadership,
  allianceFriendlyFire,
  applyVassalTithe,
  breakAlliance,
  canDissolve,
  castLeaderVote,
  closeInternalVote,
  escortArrived,
  failSuzerainDefense,
  releaseVassal,
  breachNonAggression,
  declareNeutralCapture,
  depositBank,
  depositNodeChest,
  dissolveHoldings,
  dissolveKindPiles,
  dissolveShares,
  formPact,
  withdraw,
  founderRanks,
  INTERNAL_VOTE_MS,
  LEADER_ABSENCE_MS,
  freshResourceNode,
  GUILD_CREATE_GOLD,
  measureSection12,
  officerInvite,
  reserveItemSlots,
  NEUTRAL_GUARD_COUNT,
  coalitionBank,
  coalitionChannel,
  napBetween,
  noticeAllianceBreak,
  noticeVassalRelease,
  PATROL_QUEST_GOLD,
  PATROL_QUEST_MS,
  pactAlly,
  postMercenary,
  postGuildQuest,
  postPatrolQuest,
  settleGuildQuest,
  registerContender,
  renewPact,
  REVOTE_MS,
  acceptRewardReview,
  applyCreationBan,
  applyDoctrine,
  doctrineMultiplier,
  DOCTRINE_RESOURCES,
  postContract,
  setDoctrine,
  COLLUSION_BAN_MS,
  reviewSection11,
  foundersConfirmed,
  registrationPlace,
  screenCharter,
  rewardFreezeEnds,
  type Section12Report,
  type WarStamp,
  seatRank,
  strikeNodeFlag,
  succeedAbsentLeader,
  voteQuorum,
  nodeAccessAllows,
  nodeAccessCategory,
  setNodeAccess,
  setNodeTax,
  suzerainDefenders,
  tickContract,
  titheDays,
  vassalMayDeclare,
  warPhase,
  type ContractStatus,
  type ContractType,
  type DoctrineAffect,
  type DoctrineId,
  type DoctrineResource,
  type GuildPact,
  type GuildRank,
  type MercenaryKind,
  type ResourceNode,
} from '@rift/domain/guild';
import { DIRS, type Dir } from '@rift/domain/movement';
import { SIM_TICK_MS, dayPhase } from '@rift/domain/time';
import { canBind, canPortal } from '@rift/domain/world';
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
  tickOnce: () => Promise<void>;
  submit: (command: ClientCommand) => void;
  enterWorld: (playerId: string, bindNodeId?: string) => void;
  place: (playerId: string, nodeId: string) => void;
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
  creditMaterial: (characterId: string, resourceId: string, amount: number) => Promise<void>;
  materialQty: (characterId: string, resourceId: string) => Promise<number>;
  heldItemQty: (characterId: string, itemId: string) => number;
  appointStaff: (characterId: string, role: 'moderator' | 'admin') => void;
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
  /** Jump the manual clock and the node/capture timers by `ms` without looping ticks. */
  skipMs: (ms: number) => Promise<void>;
  characterNode: (characterId: string) => string | undefined;
  cityService: (
    characterId: string,
    cityId: string,
    service: string,
  ) => { ok: boolean; code?: string; value?: unknown };
}

export interface BuiltServer {
  app: FastifyInstance;
  tickOnce: () => Promise<void>;
  close: () => Promise<void>;
  modules: readonly GameModule[];
  economy: EconomyModule;
  guild: GuildModule;
  social: SocialModule;
  creditGold: (characterId: string, amount: number) => void;
  enterWorld: (playerId: string, bindNodeId?: string) => void;
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

interface StoredPact extends GuildPact {
  id: string;
}

interface StoredMercenary {
  id: string;
  guildId: string;
  mercenaryId: string;
  kind: MercenaryKind;
  rewardGold: number;
  nodeId: string;
  postedAtMs: number;
  untilMs: number;
  durationMs: number;
  presentMs: number;
  status: ContractStatus;
  destinationId: string | null;
  trail: string[];
}

interface StoredPatrol {
  id: string;
  guildId: string;
  nodeId: string;
  rewardGold: number;
  postedAtMs: number;
  untilMs: number;
  durationMs: number;
  assigneeId: string | null;
  presentMs: number;
  status: ContractStatus;
}

/**
 * Build the module graph. This does not listen and does not open a port.
 * Callers advance time with `tickOnce`. The clock is manual.
 */
export function compose(options: ComposeOptions = {}): ServerComposition {
  const clock = manualClock(options.nowMs ?? 0);
  const bus = createBus();
  const catalog = resolveCatalog(options);
  const ancientPermutation = buildPermutation(options.jwtSecret ?? DEV_JWT_SECRET);
  const solvedAncient = new Map<string, Set<string>>();
  const repos = openRepositories(options.databaseUrl, clock, options.db);
  const openWars: StoredWar[] = [];
  const guildOf = new Map<string, string>();
  const portalGrants = new Map<string, Set<string>>();
  const serviceGrants = new Map<string, Map<CityService, Set<string>>>();
  const nodeGrants = new Map<string, Set<string>>();
  const guildRanks = new Map<string, Map<string, GuildRank>>();
  let captures: CaptureHold[] = [];
  let resourceNodes: ResourceNode[] = [];
  let pacts: StoredPact[] = [];
  let defenseDuties: {
    warId: string;
    cityId: string;
    suzerainId: string;
    vassalId: string;
    appeared: boolean;
    penalized: boolean;
  }[] = [];
  let suzerainFlags: { guildId: string; untilMs: number; fine: number }[] = [];
  let warHistory: WarStamp[] = [];
  const warBlows = new Map<string, number>();
  const warRosters = new Map<string, Set<string>>();
  const frozenGuilds = new Set<string>();
  let rewardFreezes: { guildId: string; atMs: number; reviewedAtMs: number | null }[] = [];
  const staffRoles = new Map<string, 'moderator' | 'admin'>();
  const creationBans = new Map<string, { kind: 'collusion' | 'alt_guild'; untilMs: number | null }>();
  let heldWithdrawals: {
    guildId: string;
    characterId: string;
    amount: number;
    resourceAmount: number;
    resourceId: string;
    itemAmount: number;
    rank: GuildRank;
    leaderConfirm: boolean;
    councilConfirms: number;
    councilVote: boolean;
  }[] = [];
  const leaderPolls = new Map<
    string,
    {
      guildId: string;
      openedAtMs: number;
      ballots: { voterId: string; candidateId: string }[];
      tieAtMs: number | null;
      revoteUsed: boolean;
      closed: boolean;
      emblem: string;
      description: string;
    }
  >();
  const voteRng = mulberry32(3);
  const internalPolls = new Map<
    string,
    {
      guildId: string;
      openedAtMs: number;
      ballots: { voterId: string; choice: string }[];
      closed: boolean;
      result: { status: string; choice?: string; by?: string; deciderId?: string | null } | null;
    }
  >();
  const dissolvePolls = new Map<string, { leaderConsent: boolean; councilIds: Set<string> }>();
  const contributions = new Map<string, Map<string, number>>();
  const resourceLedgers = new Map<string, Map<string, number>>();
  const itemLedgers = new Map<string, Map<string, number>>();
  const resourceKindLedgers = new Map<string, Map<string, Map<string, number>>>();
  const itemKindLedgers = new Map<string, Map<string, Map<string, number>>>();
  const resourceKindStock = new Map<string, Map<string, number>>();
  const guildResources = new Map<string, number>();
  const guildItems = new Map<string, { itemId: string; qty: number }[]>();
  const memberStats = new Map<string, Map<string, { seatedAtMs: number; activityMs: number }>>();
  const leaderSeenAt = new Map<string, number>();
  const invitesToday = new Map<string, { day: number; count: number }>();
  const withdrawnToday = new Map<string, { day: number; gold: number; resources: number; items: number }>();
  let dissolutionVoid = 0;
  let dissolutionResourceVoid = 0;
  let dissolutionItemVoid = 0;
  const declaredEvents: number[] = [];
  const settledEvents: { atMs: number; elapsedMs: number; participants: number; result: 'win' | 'draw' }[] = [];
  const captureEvents: number[] = [];
  const turnoverEvents: { atMs: number; amount: number }[] = [];
  let balanceReport: Section12Report | null = null;
  const BALANCE_DAY_MS = 24 * 60 * 60 * 1000;
  const settledReviewed = new Set<string>();
  const officeHeldAt = new Map<string, { atMs: number; guildId: string }>();
  const bankLog: {
    guildId: string;
    characterId: string;
    amount: number;
    atMs: number;
    op: string;
    resourceId?: string;
    resourceAmount?: number;
    itemId?: string;
    itemAmount?: number;
  }[] = [];
  const guildDoctrines = new Map<
    string,
    { doctrine: DoctrineId; changedAtMs: number; affects: DoctrineAffect; multiplier: number }
  >();
  const CHEAT_STRIKE_WINDOW_MS = 24 * 60 * 60 * 1000;
  const cheatStrikes = new Map<string, number[]>();
  const cheatRepeat = new Set<string>();
  const purifyingIds = new Set<string>();
  const lfgRoles = new Map<string, PartyRole>();
  const upyMemory = new Map<string, { lastLessonMs: Partial<Record<LanguageId, number>>; onlineMs: number }>();
  let clockPhase: 'day' | 'night' = dayPhase(0);
  const pathUsed = new Map<string, Set<string>>();
  /** Deposits and reads posted to a coalition. There is still no shared balance. */
  const coalitionLedger = new Map<
    string,
    { op: 'deposit' | 'read'; characterId: string; guildId: string; amount: number | null; atMs: number }[]
  >();
  const accountByCharacter = new Map<string, string>();
  let playerReports: {
    id: string;
    reporterId: string;
    targetId: string;
    reason: string;
    atMs: number;
    verdict: 'open' | 'false' | 'upheld';
  }[] = [];
  let boardContracts: {
    id: string;
    type: ContractType;
    rewardGold: number;
    rewardResources: number;
    rewardRelics: number;
    posterId: string;
    guildId: string | null;
    anonymous: boolean;
    atMs: number;
  }[] = [];
  let abuse: {
    reasons: string[];
    frozen: string[];
    portalsLifted: string[];
    vote: string;
    multibox: string;
    altGuild: string;
  } = { reasons: [], frozen: [], portalsLifted: [], vote: 'ok', multibox: 'ok', altGuild: 'ok' };
  let diplomacy: { pactId: string; guildId: string; characterId: string; text: string; atMs: number }[] = [];
  let mercenaries: StoredMercenary[] = [];
  let patrols: StoredPatrol[] = [];
  let guildQuests: StoredPatrol[] = [];
  let contenders: { warId: string; guildId: string }[] = [];
  const declaredAtMs = new Map<string, number>();
  const neutralCities = new Set<string>();
  const guildVaults = new Map<string, number>();
  let diplomacySeq = 0;
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
    if (event.subject === undefined || event.subject.length === 0) {
      return;
    }
    if (event.kind === 'path') {
      void note(event.characterId, 'learn', event.subject);
    }
    void note(event.characterId, 'craft', event.subject);
  });
  bus.on('chat.message', (event) => {
    if (event.subject === undefined || event.subject.length === 0) {
      return;
    }
    void note(event.senderId, 'talk', event.subject);
  });
  bus.on('combat.hit', (event) => {
    if (event.subject === undefined || event.subject.length === 0) {
      return;
    }
    void note(event.targetId, 'defend', event.subject);
    if (event.playerAttacker === true) {
      void note(event.attackerId, 'pvp', event.subject);
    }
  });
  const pending: ClientCommand[] = [];
  let sidecarHeardAt = clock.now();
  let focusObservation: number[] = [];
  let lastUtility: string | null = null;
  let playedUtility = 0;
  let rejectedTotal = 0;
  const guardsSpawned = new Set<string>();
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
    creditGuildBank,
    auctionLot(lotId) {
      return economy.service.auctionLot(lotId);
    },
    cityOwner,
    characterNode,
    cityService,
    rentStorage: rentCityStorage,
    useLibrary,
    bindCity,
    grantService,
    postPact,
    noticePact: noticeStoredPact,
    renewPact: renewStoredPact,
    breakPact: breakStoredPact,
    rememberDefense,
    previousOffice,
    reviewDeclaredWar,
    rewardsFrozen(guildId: string) {
      return frozenGuilds.has(guildId);
    },
    carrierBlocked,
    noteDeclaredWar,
    noteTurnover,
    sampleBalance,
    logWithdrawal,
    readBankLog,
    changeDoctrine,
    postBoardContract,
    fileReport,
    judgeReport,
    sayChat,
    noteCheatStrike,
    encodeAncientText,
    decipherAncient,
    useCoalitionBank,
    startPurify,
    removeWornRelic,
    matchParty,
    teachLanguage,
    markPathUsed,
    recoverPath,
    breakPurity,
    openLiveChest,
    buyNpc,
    memberDoctrine,
    holdWithdrawal,
    reviewRewardFreeze,
    screenGuildCreate,
    confirmFounders,
    registerAtHall,
    banFounder,
    openLeaderPoll,
    setCharterEmblem,
    seatCharter,
    carriersBlocked: carriersBlockedIds,
    leadershipBlocked,
    castLeaderBallot,
    joinGuild,
    bankLimits,
    creditWithdrawal,
    dissolveGuild,
    depositGuild,
    strikeNode,
    postCoalition,
    registerContender: registerWarContender,
    postMercenaryContract,
    postPatrol,
    acceptGuildQuest,
    memberRank,
    declareNeutralCity,
    rememberDeclaration(guildId) {
      declaredAtMs.set(guildId, clock.now());
    },
    warLimits(cityId, guildId) {
      const hold = captures.find((row) => row.cityId === cityId);
      return {
        cityCapturedAtMs: hold?.wonAtMs ?? null,
        drawEndedAtMs: hold?.drawEndedAtMs ?? null,
        lastDeclaredAtMs: declaredAtMs.get(guildId) ?? null,
      };
    },
    vassalMayWar(guildId, suzerainConsent) {
      const allowed = vassalMayDeclare({
        pacts,
        guildId,
        nowMs: clock.now(),
        suzerainConsent,
      });
      if (!allowed.ok) {
        return { ok: false, code: allowed.code };
      }
      return { ok: true, value: true };
    },
    seatFounders,
    seatMember,
    async loadBuild(characterId) {
      return buildOf(characterId);
    },
    async relicGrade(characterId) {
      const record = await repos.characters.findById(characterId);
      return record?.build?.relicGrade ?? 'common';
    },
    async relicStack(characterId) {
      const record = await repos.characters.findById(characterId);
      return (record?.build?.relics ?? []).map((relic) => ({ ...relic, echoIds: [...relic.echoIds] }));
    },
    async saveBuild(characterId, state, relicGrade, echoIds, relics) {
      const record = await repos.characters.findById(characterId);
      if (record === null) {
        return;
      }
      const worn = relics ?? record.build?.relics ?? [];
      await repos.characters.update({
        ...record,
        build: {
          programs: state.programs.map((program) => ({ ...program })),
          cores: state.cores.map((core) => ({ ...core })),
          relicSocketFree: state.relicSocketFree,
          relicGrade,
          purifyingUntilMs: state.purifyingUntilMs,
          echoIds: [...echoIds],
          relics: worn.map((relic) => ({ ...relic, echoIds: [...relic.echoIds] })),
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
    if (entity.guildId !== undefined && pactAlly(pacts, entity.guildId, owner, clock.now())) {
      return 'ally';
    }
    if (entity.guildId !== undefined) {
      return 'enemy';
    }
    return 'neutral';
  }

  function serviceGranted(cityId: string, service: CityService, characterId: string): boolean {
    if (service === 'portal' && portalGrants.get(cityId)?.has(characterId) === true) {
      return true;
    }
    return serviceGrants.get(cityId)?.get(service)?.has(characterId) === true;
  }

  function cityServiceAccess(
    entity: SimEntity,
    cityId: string,
    service: CityService,
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
    const asked = askHostilePortal({
      stance: portalStance(entity, hold.guildId),
      warActive,
      blockedForMs,
      granted: serviceGranted(cityId, service, entity.id),
      lifted: abuse.portalsLifted.includes(cityId),
    });
    if (!asked.ok) {
      return { ok: false, code: asked.code };
    }
    return { ok: true, value: 'enter' };
  }

  function portalAccess(
    entity: SimEntity,
    cityId: string,
  ): { ok: true; value: 'enter' } | { ok: false; code: string } {
    return cityServiceAccess(entity, cityId, 'portal');
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
    if (frozenGuilds.has(guildId)) {
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return;
    }
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null) {
      return;
    }
    const deposited = depositBank(guild.bank, amount);
    await repos.guilds.saveGuild({ ...guild, bank: deposited.bank });
    noteTurnover(amount);
    logBank(guildId, '', deposited.bank - guild.bank, 'credit');
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
    if (entity === undefined) {
      return { ok: false, code: 'missing' };
    }
    const category = nodeAccessCategory(portalStance(entity, node.guildId));
    if (category === null) {
      return { ok: true };
    }
    return nodeAccessAllows({
      policy: node.access,
      category,
      granted: nodeGrants.get(node.nodeId)?.has(characterId) === true,
    });
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
    characterId: string,
  ): { ok: boolean; code?: string; value?: unknown } {
    const node = resourceAt(nodeId);
    if (node === undefined || node.guildId !== guildId) {
      return { ok: false, code: 'owner' };
    }
    const rank = memberRank(guildId, characterId);
    if (rank === null) {
      return { ok: false, code: 'rank' };
    }
    const priced = setNodeTax({ next: taxPercent, nowMs: clock.now(), taxSetAtMs: node.taxSetAtMs, rank });
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
    category: string,
    access: string,
  ): { ok: boolean; code?: string; value?: unknown } {
    const node = resourceAt(nodeId);
    if (node === undefined || node.guildId !== guildId) {
      return { ok: false, code: 'owner' };
    }
    const chosen = setNodeAccess({ policy: node.access, category, access });
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

  function memberRank(guildId: string, characterId: string): GuildRank | null {
    return guildRanks.get(guildId)?.get(characterId) ?? null;
  }

  async function seatMember(
    guildId: string,
    actorId: string,
    memberId: string,
    rank: string,
  ): { ok: boolean; code?: string; value?: unknown } {
    const actor = memberRank(guildId, actorId);
    if (actor !== 'leader' && actor !== 'council') {
      return { ok: false, code: 'rank' };
    }
    if (
      rank !== 'leader' &&
      rank !== 'council' &&
      rank !== 'officer' &&
      rank !== 'veteran' &&
      rank !== 'novice'
    ) {
      return { ok: false, code: 'rank' };
    }
    const table = guildRanks.get(guildId);
    if (table === undefined || !table.has(memberId)) {
      return { ok: false, code: 'member' };
    }
    const counts = { leader: 0, council: 0, officer: 0 };
    for (const [id, held] of table) {
      if (id === memberId) {
        continue;
      }
      if (held === 'leader' || held === 'council' || held === 'officer') {
        counts[held] += 1;
      }
    }
    const joined = memberStats.get(guildId)?.get(memberId)?.seatedAtMs ?? 0;
    const seated = seatRank({
      rank,
      from: table.get(memberId) ?? null,
      counts,
      joinedAtMs: joined,
      nowMs: clock.now(),
    });
    if (!seated.ok) {
      return { ok: false, code: seated.code };
    }
    const posts = await leadershipPosts(memberId, guildId);
    const allowed = aiLeadership({ ai: posts.ai, rank: seated.value.rank, posts: posts.count });
    if (!allowed.ok) {
      return { ok: false, code: allowed.code };
    }
    const previousRank = table.get(memberId) ?? null;
    table.set(memberId, seated.value.rank);
    rememberSeat(guildId, memberId, clock.now());
    if (
      (previousRank === 'leader' || previousRank === 'council') &&
      seated.value.rank !== 'leader' &&
      seated.value.rank !== 'council'
    ) {
      endOffice(memberId);
    }
    if (seated.value.rank === 'leader' || seated.value.rank === 'council') {
      rememberOffice(memberId, guildId);
    }
    if (seated.value.rank === 'leader') {
      leaderSeenAt.set(guildId, clock.now());
    }
    return { ok: true, value: { guildId, memberId, rank: seated.value.rank } };
  }

  function seatFounders(guildId: string, leaderId: string, memberIds: readonly string[]): void {
    const table = new Map<string, GuildRank>();
    for (const row of founderRanks(leaderId, memberIds)) {
      table.set(row.id, row.rank);
      rememberSeat(guildId, row.id, clock.now());
    }
    guildRanks.set(guildId, table);
    leaderSeenAt.set(guildId, clock.now());
    rememberOffice(leaderId, guildId);
  }

  /** Charter members can vote. Starting novice ranks wait until the leader poll closes. */
  function seatCharter(guildId: string, leaderId: string, memberIds: readonly string[]): void {
    const table = new Map<string, GuildRank>();
    for (const id of memberIds) {
      table.set(id, id === leaderId ? 'leader' : 'veteran');
      rememberSeat(guildId, id, clock.now());
    }
    guildRanks.set(guildId, table);
    leaderSeenAt.set(guildId, clock.now());
    rememberOffice(leaderId, guildId);
  }

  function rememberSeat(guildId: string, characterId: string, atMs: number): void {
    const table = memberStats.get(guildId) ?? new Map<string, { seatedAtMs: number; activityMs: number }>();
    const previous = table.get(characterId);
    table.set(characterId, { seatedAtMs: atMs, activityMs: previous?.activityMs ?? 0 });
    memberStats.set(guildId, table);
  }

  async function leadershipPosts(
    characterId: string,
    exceptGuildId: string,
  ): Promise<{ ai: boolean; count: number }> {
    const record = await repos.characters.findById(characterId);
    if (record?.controller !== 'bot') {
      return { ai: false, count: 0 };
    }
    let count = 0;
    for (const [guildId, table] of guildRanks) {
      if (guildId === exceptGuildId) {
        continue;
      }
      const rank = table.get(characterId);
      if (rank === 'leader' || rank === 'council' || rank === 'officer') {
        count += 1;
      }
    }
    return { ai: true, count };
  }

  function rankRecord(guildId: string): Partial<Record<string, GuildRank>> {
    const ranks: Partial<Record<string, GuildRank>> = {};
    for (const [id, rank] of guildRanks.get(guildId) ?? []) {
      ranks[id] = rank;
    }
    return ranks;
  }

  function dayIndex(nowMs: number): number {
    return Math.floor(nowMs / (24 * 60 * 60 * 1000));
  }

  function takenToday(guildId: string, characterId: string): { gold: number; resources: number; items: number } {
    const row = withdrawnToday.get(`${guildId}\0${characterId}`);
    if (row === undefined || row.day !== dayIndex(clock.now())) {
      return { gold: 0, resources: 0, items: 0 };
    }
    return row;
  }

  function noteTaken(guildId: string, characterId: string, gold: number, resources: number, items: number): void {
    const current = takenToday(guildId, characterId);
    withdrawnToday.set(`${guildId}\0${characterId}`, {
      day: dayIndex(clock.now()),
      gold: current.gold + gold,
      resources: current.resources + resources,
      items: current.items + items,
    });
  }

  function bankLimits(guildId: string, characterId: string): {
    goldWithdrawnToday: number;
    resourceStock: number;
    resourcesWithdrawnToday: number;
    itemSlots: number;
    itemsWithdrawnToday: number;
  } {
    const taken = takenToday(guildId, characterId);
    return {
      goldWithdrawnToday: taken.gold,
      resourceStock: guildResources.get(guildId) ?? 0,
      resourcesWithdrawnToday: taken.resources,
      itemSlots: guildItems.get(guildId)?.length ?? 0,
      itemsWithdrawnToday: taken.items,
    };
  }

  function itemQty(guildId: string): number {
    return (guildItems.get(guildId) ?? []).reduce((total, stack) => total + stack.qty, 0);
  }

  async function creditWithdrawal(input: {
    guildId: string;
    characterId: string;
    amount: number;
    resourceAmount: number;
    itemAmount: number;
    resourceId?: string;
  }): Promise<void> {
    if (input.amount > 0) {
      creditGold(input.characterId, input.amount);
    }
    if (input.resourceAmount > 0) {
      const kind = input.resourceId ?? 'metal';
      const stocks = resourceKindStock.get(input.guildId) ?? new Map<string, number>();
      const stock = stocks.get(kind) ?? 0;
      const moved = Math.min(stock, input.resourceAmount);
      stocks.set(kind, Math.max(0, stock - moved));
      resourceKindStock.set(input.guildId, stocks);
      guildResources.set(input.guildId, Math.max(0, (guildResources.get(input.guildId) ?? 0) - moved));
      if (moved > 0) {
        await creditMaterial(input.characterId, kind, moved);
      }
    }
    if (input.itemAmount > 0) {
      const left = takeItems(input.guildId, input.itemAmount);
      giveItems(input.characterId, left.given);
    }
    noteTaken(input.guildId, input.characterId, input.amount, input.resourceAmount, input.itemAmount);
  }

  function takeItems(
    guildId: string,
    qty: number,
  ): { given: { itemId: string; qty: number }[]; voided: number } {
    const stacks = [...(guildItems.get(guildId) ?? [])];
    const given: { itemId: string; qty: number }[] = [];
    let left = qty;
    const next: { itemId: string; qty: number }[] = [];
    for (const stack of stacks) {
      if (left <= 0) {
        next.push(stack);
        continue;
      }
      const moved = Math.min(stack.qty, left);
      left -= moved;
      if (moved > 0) {
        given.push({ itemId: stack.itemId, qty: moved });
      }
      if (stack.qty > moved) {
        next.push({ itemId: stack.itemId, qty: stack.qty - moved });
      }
    }
    guildItems.set(guildId, next);
    return { given, voided: left };
  }

  function giveItems(characterId: string, stacks: { itemId: string; qty: number }[]): void {
    if (stacks.length === 0) {
      return;
    }
    const current =
      repos.economy.getCharacter(characterId) ??
      newEconomyCharacter({ characterId, side: 'light', gold: 0 });
    const items = { ...current.items };
    for (const stack of stacks) {
      const held = items[stack.itemId];
      if (held === undefined) {
        items[stack.itemId] = {
          itemId: stack.itemId,
          level: 1,
          grade: 'common',
          unique: false,
          durability: 100,
          qty: stack.qty,
        };
      } else {
        items[stack.itemId] = { ...held, qty: held.qty + stack.qty };
      }
    }
    repos.economy.saveCharacter({ ...current, items });
  }

  async function creditMaterial(characterId: string, resourceId: string, amount: number): Promise<void> {
    const stacks = await repos.materials.read(characterId);
    await repos.materials.commit(characterId, stacks, {
      ...stacks,
      [resourceId]: (stacks[resourceId] ?? 0) + amount,
    });
  }

  function nextDiplomacyId(prefix: string): string {
    diplomacySeq += 1;
    return `${prefix}-${String(diplomacySeq)}`;
  }

  function creditGuildVault(guildId: string, amount: number): number {
    const next = depositNodeChest(guildVaults.get(guildId) ?? 0, amount);
    guildVaults.set(guildId, next);
    return next;
  }

  function characterNode(characterId: string): string | undefined {
    return simWorld.entities.find((row) => row.id === characterId && row.monsterId === undefined)?.nodeId;
  }

  function cityOwner(cityId: string): string | null {
    return captures.find((row) => row.cityId === cityId && row.won && row.guildId !== null)?.guildId ?? null;
  }

  function cityService(
    characterId: string,
    cityId: string,
    service: string,
  ): { ok: boolean; code?: string; value?: unknown } {
    if (!isCityService(service)) {
      return { ok: false, code: 'service' };
    }
    const entity = simWorld.entities.find((row) => row.id === characterId && row.monsterId === undefined);
    if (entity === undefined) {
      return { ok: false, code: 'missing' };
    }
    const access = cityServiceAccess(entity, cityId, service);
    if (!access.ok) {
      return { ok: false, code: access.code };
    }
    return { ok: true, value: 'enter' };
  }

  async function rentCityStorage(
    characterId: string,
    cityId: string,
    slots: number,
    days: number,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const access = cityService(characterId, cityId, 'storage');
    if (!access.ok) {
      return access;
    }
    const wallet = repos.economy.getCharacter(characterId);
    if (wallet === null) {
      return { ok: false, code: 'missing' };
    }
    const priced = rentStorage({ wallet: wallet.gold, slots, days });
    if (!priced.ok) {
      return { ok: false, code: priced.code };
    }
    repos.economy.saveCharacter({ ...wallet, gold: priced.value.gold });
    const owner = cityOwner(cityId);
    if (owner !== null) {
      await creditGuildBank(owner, priced.value.cost);
    }
    return {
      ok: true,
      value: {
        cityId,
        slots: priced.value.slots,
        days: priced.value.days,
        cost: priced.value.cost,
        gold: priced.value.gold,
        guildId: owner,
      },
    };
  }

  async function useLibrary(
    characterId: string,
    cityId: string,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const access = cityService(characterId, cityId, 'library');
    if (!access.ok) {
      return access;
    }
    return { ok: true, value: { cityId, service: 'library' } };
  }

  async function bindCity(
    characterId: string,
    cityId: string,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const access = cityService(characterId, cityId, 'bind');
    if (!access.ok) {
      return access;
    }
    const node = simWorld.geography?.nodes.find((row) => row.id === cityId);
    if (node === undefined) {
      return { ok: false, code: 'unknown' };
    }
    const bound = canBind(
      { id: node.id, kind: node.kind, safe: node.safe, side: node.side, regionId: node.regionId },
      false,
    );
    if (!bound.ok) {
      return { ok: false, code: bound.code };
    }
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((row) =>
        row.id === characterId ? { ...row, bindNodeId: cityId, bindCell: { x: node.x, y: node.y } } : row,
      ),
    };
    return { ok: true, value: { cityId, service: 'bind' } };
  }

  function grantService(
    guildId: string,
    cityId: string,
    service: string,
    characterId: string,
  ): { ok: boolean; code?: string; value?: unknown } {
    if (!isCityService(service)) {
      return { ok: false, code: 'service' };
    }
    const hold = captures.find((row) => row.cityId === cityId && row.won && row.guildId === guildId);
    if (hold === undefined) {
      return { ok: false, code: 'owner' };
    }
    const byService = serviceGrants.get(cityId) ?? new Map<CityService, Set<string>>();
    const granted = byService.get(service) ?? new Set<string>();
    granted.add(characterId);
    byService.set(service, granted);
    serviceGrants.set(cityId, byService);
    if (service === 'portal') {
      const portal = portalGrants.get(cityId) ?? new Set<string>();
      portal.add(characterId);
      portalGrants.set(cityId, portal);
    }
    return { ok: true, value: { cityId, service, characterId, granted: true } };
  }

  async function postPact(body: Record<string, unknown>): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const kind = typeof body.kind === 'string' ? body.kind : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const guildIds = Array.isArray(body.guildIds)
      ? body.guildIds.filter((id): id is string => typeof id === 'string')
      : [];
    const diplomat = guildIds.some((guildId) => {
      const rank = memberRank(guildId, characterId);
      return rank === 'leader' || rank === 'council';
    });
    if (!diplomat) {
      return { ok: false, code: 'rank' };
    }
    const formed = formPact({
      kind,
      guildIds,
      nowMs: clock.now(),
      ...(typeof body.taxPercent === 'number' ? { taxPercent: body.taxPercent } : {}),
      ...(typeof body.targetGuildId === 'string' ? { targetGuildId: body.targetGuildId } : {}),
      ...(typeof body.suzerainId === 'string' ? { suzerainId: body.suzerainId } : {}),
      ...(typeof body.vassalId === 'string' ? { vassalId: body.vassalId } : {}),
    });
    if (!formed.ok) {
      return { ok: false, code: formed.code };
    }
    const stored: StoredPact = { ...formed.value, id: nextDiplomacyId('pact') };
    pacts = [...pacts, stored];
    return { ok: true, value: stored };
  }

  function pactDiplomat(guildIds: readonly string[], characterId: string): boolean {
    return guildIds.some((guildId) => {
      const rank = memberRank(guildId, characterId);
      return rank === 'leader' || rank === 'council';
    });
  }

  async function noticeStoredPact(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const pactId = typeof body.pactId === 'string' ? body.pactId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const pact = pacts.find((row) => row.id === pactId);
    if (pact === undefined) {
      return { ok: false, code: 'closed' };
    }
    if (!pactDiplomat(pact.guildIds, characterId)) {
      return { ok: false, code: 'rank' };
    }
    const noticed =
      pact.kind === 'vassal'
        ? noticeVassalRelease(pact, clock.now())
        : noticeAllianceBreak(pact, clock.now());
    if (!noticed.ok) {
      return { ok: false, code: noticed.code };
    }
    pacts = pacts.map((row) => (row.id === pactId ? { ...row, ...noticed.value } : row));
    return { ok: true, value: pacts.find((row) => row.id === pactId) };
  }

  async function renewStoredPact(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const pactId = typeof body.pactId === 'string' ? body.pactId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const pact = pacts.find((row) => row.id === pactId);
    if (pact === undefined) {
      return { ok: false, code: 'closed' };
    }
    if (!pactDiplomat(pact.guildIds, characterId)) {
      return { ok: false, code: 'rank' };
    }
    const renewed = renewPact(pact, clock.now());
    if (!renewed.ok) {
      return { ok: false, code: renewed.code };
    }
    pacts = pacts.map((row) => (row.id === pactId ? { ...row, ...renewed.value } : row));
    return { ok: true, value: pacts.find((row) => row.id === pactId) };
  }

  async function breakStoredPact(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const pactId = typeof body.pactId === 'string' ? body.pactId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const pact = pacts.find((row) => row.id === pactId);
    if (pact === undefined) {
      return { ok: false, code: 'closed' };
    }
    if (!pactDiplomat(pact.guildIds, characterId)) {
      return { ok: false, code: 'rank' };
    }
    const broken = pact.kind === 'vassal' ? releaseVassal(pact, clock.now()) : breakAlliance(pact, clock.now());
    if (!broken.ok) {
      return { ok: false, code: broken.code };
    }
    pacts = pacts.map((row) => (row.id === pactId ? { ...row, ...broken.value } : row));
    return { ok: true, value: pacts.find((row) => row.id === pactId) };
  }

  async function registerWarContender(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const warId = typeof body.warId === 'string' ? body.warId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const rank = memberRank(guildId, characterId);
    if (rank !== 'leader' && rank !== 'council') {
      return { ok: false, code: 'rank' };
    }
    const wars = await repos.guilds.listWars();
    const war = wars.find((row) => row.id === warId);
    if (war === undefined) {
      return { ok: false, code: 'war' };
    }
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null) {
      return { ok: false, code: 'member' };
    }
    const registered = registerContender({
      guildId,
      gold: guild.bank,
      nowMs: clock.now(),
      startsAtMs: war.startsAtMs,
    });
    if (!registered.ok) {
      return { ok: false, code: registered.code };
    }
    await repos.guilds.saveGuild({ ...guild, bank: registered.value.gold });
    logBank(guildId, characterId, guild.bank - registered.value.gold, 'contend');
    contenders = [
      ...contenders.filter((row) => row.warId !== warId || row.guildId !== guildId),
      { warId, guildId },
    ];
    return { ok: true, value: { warId, guildId, gold: registered.value.gold } };
  }

  async function postMercenaryContract(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const mercenaryId = typeof body.mercenaryId === 'string' ? body.mercenaryId : '';
    const nodeId = typeof body.nodeId === 'string' ? body.nodeId : '';
    const kind = typeof body.kind === 'string' ? body.kind : '';
    const rewardGold = typeof body.rewardGold === 'number' ? body.rewardGold : 0;
    const durationMs = typeof body.durationMs === 'number' ? body.durationMs : PATROL_QUEST_MS;
    const destinationId = typeof body.destinationId === 'string' ? body.destinationId : undefined;
    const rank = memberRank(guildId, characterId);
    if (rank === null) {
      return { ok: false, code: 'rank' };
    }
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null) {
      return { ok: false, code: 'member' };
    }
    const posted = postMercenary({
      rank,
      kind,
      rewardGold,
      bank: guild.bank,
      mercenaryId,
      memberIds: guild.memberIds,
      nowMs: clock.now(),
      durationMs,
      nodeId,
      ...(destinationId !== undefined ? { destinationId } : {}),
    });
    if (!posted.ok) {
      return { ok: false, code: posted.code };
    }
    const stored: StoredMercenary = {
      id: nextDiplomacyId('merc'),
      guildId,
      mercenaryId: posted.value.mercenaryId,
      kind: posted.value.kind,
      rewardGold: posted.value.rewardGold,
      nodeId: posted.value.nodeId,
      postedAtMs: clock.now(),
      untilMs: posted.value.untilMs,
      durationMs: posted.value.durationMs,
      presentMs: 0,
      status: 'open',
      destinationId: posted.value.destinationId,
      trail: [posted.value.nodeId],
    };
    mercenaries = [...mercenaries, stored];
    return { ok: true, value: stored };
  }

  async function postPatrol(body: Record<string, unknown>): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const nodeId = typeof body.nodeId === 'string' ? body.nodeId : '';
    const rewardGold = typeof body.rewardGold === 'number' ? body.rewardGold : PATROL_QUEST_GOLD;
    const durationMs = typeof body.durationMs === 'number' ? body.durationMs : PATROL_QUEST_MS;
    const assigneeId = typeof body.assigneeId === 'string' ? body.assigneeId : null;
    const rank = memberRank(guildId, characterId);
    if (rank === null) {
      return { ok: false, code: 'rank' };
    }
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null) {
      return { ok: false, code: 'member' };
    }
    if (assigneeId !== null && !guild.memberIds.includes(assigneeId)) {
      return { ok: false, code: 'member' };
    }
    const posted = postPatrolQuest({
      rank,
      rewardGold,
      bank: guild.bank,
      nodeId,
      nowMs: clock.now(),
      durationMs,
    });
    if (!posted.ok) {
      return { ok: false, code: posted.code };
    }
    const stored: StoredPatrol = {
      id: nextDiplomacyId('patrol'),
      guildId,
      nodeId: posted.value.nodeId,
      rewardGold: posted.value.rewardGold,
      postedAtMs: clock.now(),
      untilMs: posted.value.untilMs,
      durationMs: posted.value.durationMs,
      assigneeId,
      presentMs: 0,
      status: 'open',
    };
    patrols = [...patrols, stored];
    return { ok: true, value: stored };
  }

  async function acceptGuildQuest(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const nodeId = typeof body.nodeId === 'string' ? body.nodeId : '';
    const assigneeId = typeof body.assigneeId === 'string' ? body.assigneeId : '';
    const rank = memberRank(guildId, characterId);
    if (rank === null) {
      return { ok: false, code: 'rank' };
    }
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null || !guild.memberIds.includes(assigneeId)) {
      return { ok: false, code: 'member' };
    }
    const posted = postGuildQuest({
      rank,
      nodeId,
      nowMs: clock.now(),
      bank: guild.bank,
      ...(typeof body.rewardGold === 'number' ? { rewardGold: body.rewardGold } : {}),
      ...(typeof body.durationMs === 'number' ? { durationMs: body.durationMs } : {}),
    });
    if (!posted.ok) {
      return { ok: false, code: posted.code };
    }
    const stored: StoredPatrol = {
      id: nextDiplomacyId('gquest'),
      guildId,
      nodeId: posted.value.nodeId,
      rewardGold: posted.value.rewardGold,
      postedAtMs: clock.now(),
      untilMs: posted.value.untilMs,
      durationMs: posted.value.durationMs,
      assigneeId,
      presentMs: 0,
      status: 'open',
    };
    guildQuests = [...guildQuests, stored];
    return { ok: true, value: { ...stored, visibleTo: posted.value.visibleTo } };
  }

  async function tickGuildQuests(deltaMs: number): Promise<void> {
    const now = clock.now();
    const next: StoredPatrol[] = [];
    for (const quest of guildQuests) {
      const present = quest.assigneeId !== null && standingAt(quest.assigneeId, quest.nodeId);
      const ticked = settleGuildQuest({
        status: quest.status,
        presentMs: quest.presentMs,
        durationMs: quest.durationMs,
        untilMs: quest.untilMs,
        deltaMs,
        present,
        nowMs: now,
        bank: (await repos.guilds.findGuild(quest.guildId))?.bank ?? 0,
        rewardGold: quest.rewardGold,
      });
      if (ticked.pay > 0 && quest.assigneeId !== null) {
        const guild = await repos.guilds.findGuild(quest.guildId);
        if (guild !== null && guild.bank >= ticked.pay) {
          await repos.guilds.saveGuild({ ...guild, bank: guild.bank - ticked.pay });
          logBank(quest.guildId, quest.assigneeId, ticked.pay, 'quest');
          const wallet = repos.economy.getCharacter(quest.assigneeId);
          if (wallet !== null) {
            repos.economy.saveCharacter({ ...wallet, gold: wallet.gold + ticked.pay });
          }
        }
      }
      next.push({ ...quest, presentMs: ticked.presentMs, status: ticked.status });
    }
    guildQuests = next;
  }

  function contractDuty(contract: StoredMercenary): boolean {
    const actor = simWorld.entities.find(
      (entity) => entity.id === contract.mercenaryId && entity.monsterId === undefined,
    );
    if (contract.kind === 'escort') {
      return escortArrived({
        startId: contract.nodeId,
        destinationId: contract.destinationId,
        trail: contract.trail,
        edges: simWorld.geography?.edges ?? [],
      });
    }
    if (contract.kind === 'defend') {
      return actor !== undefined && (actor.lastAttackerId !== undefined || actor.hp < actor.maxHp);
    }
    if (contract.kind === 'attack') {
      return (
        simWorld.entities.some((entity) => entity.lastAttackerId === contract.mercenaryId) ||
        simWorld.corpses.some((corpse) => corpse.killerId === contract.mercenaryId)
      );
    }
    return false;
  }

  function allyMarkers(): { guildId: string; nodeId: string; characterId: string }[] {
    const focus = simWorld.entities.find((entity) => entity.monsterId === undefined);
    if (focus?.guildId === undefined) {
      return [];
    }
    const now = clock.now();
    return simWorld.entities.flatMap((entity) => {
      if (
        entity.monsterId !== undefined ||
        entity.guildId === undefined ||
        entity.nodeId === undefined ||
        entity.id === focus.id ||
        !pactAlly(pacts, focus.guildId ?? '', entity.guildId, now)
      ) {
        return [];
      }
      return [{ guildId: entity.guildId, nodeId: entity.nodeId, characterId: entity.id }];
    });
  }

  function standingAt(characterId: string, nodeId: string): boolean {
    const entity = simWorld.entities.find((row) => row.id === characterId && row.monsterId === undefined);
    return entity !== undefined && entity.phase === 'online' && entity.hp > 0 && entity.nodeId === nodeId;
  }

  async function tickContracts(deltaMs: number): Promise<void> {
    const now = clock.now();
    const nextMerc: StoredMercenary[] = [];
    for (const contract of mercenaries) {
      const actor = simWorld.entities.find(
        (entity) => entity.id === contract.mercenaryId && entity.monsterId === undefined,
      );
      const trail = [...contract.trail];
      if (actor?.nodeId !== undefined && trail[trail.length - 1] !== actor.nodeId) {
        trail.push(actor.nodeId);
      }
      const walked = { ...contract, trail };
      const ticked = tickContract({
        status: contract.status,
        presentMs: contract.presentMs,
        durationMs: contract.durationMs,
        untilMs: contract.untilMs,
        deltaMs,
        present: standingAt(contract.mercenaryId, contract.nodeId),
        nowMs: now,
        bank: (await repos.guilds.findGuild(contract.guildId))?.bank ?? 0,
        rewardGold: contract.rewardGold,
        kind: contract.kind,
        duty: contractDuty(walked),
      });
      if (ticked.pay > 0) {
        const guild = await repos.guilds.findGuild(contract.guildId);
        if (guild !== null) {
          await repos.guilds.saveGuild({ ...guild, bank: guild.bank - ticked.pay });
          logBank(contract.guildId, contract.mercenaryId, ticked.pay, 'mercenary');
        }
        const wallet = repos.economy.getCharacter(contract.mercenaryId);
        if (wallet !== null) {
          repos.economy.saveCharacter({ ...wallet, gold: wallet.gold + ticked.pay });
        }
      }
      nextMerc.push({ ...walked, presentMs: ticked.presentMs, status: ticked.status });
    }
    mercenaries = nextMerc;
    const nextPatrol: StoredPatrol[] = [];
    for (const quest of patrols) {
      const present =
        quest.assigneeId !== null && standingAt(quest.assigneeId, quest.nodeId);
      const ticked = tickContract({
        status: quest.status,
        presentMs: quest.presentMs,
        durationMs: quest.durationMs,
        untilMs: quest.untilMs,
        deltaMs,
        present,
        nowMs: now,
        bank: (await repos.guilds.findGuild(quest.guildId))?.bank ?? 0,
        rewardGold: quest.rewardGold,
      });
      if (ticked.pay > 0 && quest.assigneeId !== null) {
        const guild = await repos.guilds.findGuild(quest.guildId);
        if (guild !== null) {
          await repos.guilds.saveGuild({ ...guild, bank: guild.bank - ticked.pay });
          logBank(quest.guildId, quest.assigneeId ?? '', ticked.pay, 'patrol');
        }
        const wallet = repos.economy.getCharacter(quest.assigneeId);
        if (wallet !== null) {
          repos.economy.saveCharacter({ ...wallet, gold: wallet.gold + ticked.pay });
        }
      }
      nextPatrol.push({ ...quest, presentMs: ticked.presentMs, status: ticked.status });
    }
    patrols = nextPatrol;
  }

  function tickAllianceBreaks(): void {
    const now = clock.now();
    pacts = pacts.map((pact) => {
      if (pact.kind !== 'alliance' || pact.breakNoticeAtMs === null || pact.brokenAtMs != null) {
        return pact;
      }
      const broken = breakAlliance(pact, now);
      return broken.ok ? { ...pact, ...broken.value } : pact;
    });
  }

  function tickVassalReleases(): void {
    const now = clock.now();
    pacts = pacts.map((pact) => {
      if (pact.kind !== 'vassal' || pact.breakNoticeAtMs === null || pact.brokenAtMs != null) {
        return pact;
      }
      const released = releaseVassal(pact, now);
      return released.ok ? { ...pact, ...released.value } : pact;
    });
  }

  async function tickVassalTithes(): Promise<void> {
    const now = clock.now();
    const next: StoredPact[] = [];
    for (const pact of pacts) {
      if (pact.kind !== 'vassal' || pact.vassalId === null || pact.suzerainId === null || pact.taxPercent === null) {
        next.push(pact);
        continue;
      }
      const days = titheDays({ lastTitheAtMs: pact.lastTitheAtMs, startedAtMs: pact.startedAtMs, nowMs: now });
      if (days <= 0) {
        next.push(pact);
        continue;
      }
      const vassal = await repos.guilds.findGuild(pact.vassalId);
      if (vassal === null) {
        next.push(pact);
        continue;
      }
      const tithe = applyVassalTithe({ bank: vassal.bank, taxPercent: pact.taxPercent, days });
      if (!tithe.ok) {
        next.push(pact);
        continue;
      }
      await repos.guilds.saveGuild({ ...vassal, bank: tithe.value.bank });
      logBank(pact.vassalId, '', vassal.bank - tithe.value.bank, 'tithe');
      await creditGuildBank(pact.suzerainId, tithe.value.tithe);
      next.push({ ...pact, lastTitheAtMs: now });
    }
    pacts = next;
  }

  function applyNodeSeizure(seized: readonly { guildId: string; amount: number }[]): void {
    for (const row of seized) {
      creditGuildVault(row.guildId, row.amount);
    }
  }

  async function skipMs(ms: number): Promise<void> {
    if (!Number.isInteger(ms) || ms < 0) {
      throw new RangeError(`skipMs must be an integer >= 0, got ${String(ms)}`);
    }
    clock.advance(ms);
    simWorld = { ...simWorld, nowMs: clock.now() };
    clockPhase = dayPhase(clock.now());
    spawnNeutralGuards();
    captures = tickCaptures({
      holds: captures,
      wars: openWars.map((war) => ({
        id: war.id,
        cityId: war.cityId,
        startsAtMs: war.startsAtMs,
        attackerGuildId: war.attackerGuildId,
      })),
      nowMs: simWorld.nowMs,
      deltaMs: ms,
      present: presentGuilds(),
      contenders: contenderRows(),
      guardsRemaining: guardRows(),
    });
    applyOwnedCityFees();
    const ownersBeforeSkip = new Map(resourceNodes.map((node) => [node.nodeId, node.guildId] as const));
    const ticked = tickResourceNodes({
      nodes: resourceNodes,
      present: presentNodes(),
      deltaMs: ms,
    });
    resourceNodes = ticked.nodes;
    noteNodeCaptures(ownersBeforeSkip);
    applyNodeSeizure(ticked.seized);
    await tickContracts(ms);
    await tickGuildQuests(ms);
    await tickVassalTithes();
    tickAllianceBreaks();
    tickVassalReleases();
    noteSuzerainPresence();
    await penalizeAbsentSuzerains();
    noteWarRoster();
    await reviewNewSettlements();
    const fronts = openWarFronts();
    simWorld = { ...simWorld, warFronts: fronts };
    await resolveLeaderPolls();
    await resolveInternalPolls();
    await relieveAbsentLeaders(ms);
    await inspectRewardFreezes();
    await reviewCheatStrikes();
    await finishPurifications();
    await advanceLanguage(ms);
    await advanceForgetting(ms);
    refreshPortalLifts();
    await sampleBalance();
  }

  function guardAllies(command: SimCommand): SimCommand {
    if (command.type !== 'attack') {
      return command;
    }
    const attacker = simWorld.entities.find((row) => row.id === command.attackerId);
    const target = simWorld.entities.find((row) => row.id === command.targetId);
    if (attacker?.guildId === undefined || target?.guildId === undefined) {
      return command;
    }
    const now = clock.now();
    if (allianceFriendlyFire(pacts, attacker.guildId, target.guildId, now)) {
      return { ...command, sameGroup: true, friendlyFire: false };
    }
    const nap = napBetween(pacts, attacker.guildId, target.guildId, now);
    if (nap !== undefined) {
      void breachNap(attacker.guildId);
    }
    return command;
  }

  async function breachNap(guildId: string): Promise<void> {
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null) {
      return;
    }
    const breached = breachNonAggression({ bank: guild.bank, nowMs: clock.now() });
    await repos.guilds.saveGuild({ ...guild, bank: breached.bank });
    logBank(guildId, '', guild.bank - breached.bank, 'breach');
  }

  function contenderRows(): { cityId: string; guildId: string; warId: string }[] {
    return contenders.flatMap((row) => {
      const war = openWars.find((item) => item.id === row.warId);
      return war === undefined ? [] : [{ cityId: war.cityId, guildId: row.guildId, warId: row.warId }];
    });
  }

  function openWarFronts(): {
    cityId: string;
    attackerGuildIds: string[];
    defenderGuildIds: string[];
    captured: boolean;
    musterNodeId: string;
  }[] {
    spawnMusterCamps();
    return openWars.flatMap((war) => {
      if (war.startsAtMs > clock.now()) {
        return [];
      }
      const phase = warPhase(Math.max(0, clock.now() - war.startsAtMs));
      if (phase === 'closed') {
        return [];
      }
      const owner = cityOwner(war.cityId);
      const defenders = new Set<string>();
      if (owner !== null) {
        defenders.add(owner);
      }
      for (const duty of defenseDuties) {
        if (duty.cityId === war.cityId) {
          defenders.add(duty.suzerainId);
        }
      }
      const attackers = new Set<string>([war.attackerGuildId]);
      for (const row of contenders) {
        if (row.warId === war.id && !defenders.has(row.guildId)) {
          attackers.add(row.guildId);
        }
      }
      const captured = captures.some(
        (row) => row.cityId === war.cityId && row.won === true && row.settled === true && row.guildId !== null && row.guildId !== owner,
      );
      return [
        {
          cityId: war.cityId,
          attackerGuildIds: [...attackers],
          defenderGuildIds: [...defenders],
          captured,
          musterNodeId: `muster:${war.cityId}`,
        },
      ];
    });
  }

  /** The 30-minute muster spawns a camp one node off the city. Attackers respawn there. */
  function spawnMusterCamps(): void {
    const geography = simWorld.geography;
    if (geography === undefined) {
      return;
    }
    const nodes = [...geography.nodes];
    const edges = [...geography.edges];
    let changed = false;
    const now = clock.now();
    for (const war of openWars) {
      if (war.startsAtMs > now) {
        continue;
      }
      const phase = warPhase(Math.max(0, now - war.startsAtMs));
      if (phase === 'closed') {
        continue;
      }
      const campId = `muster:${war.cityId}`;
      if (nodes.some((node) => node.id === campId)) {
        continue;
      }
      const city = nodes.find((node) => node.id === war.cityId);
      if (city === undefined) {
        continue;
      }
      nodes.push({
        id: campId,
        x: city.x + 1,
        y: city.y,
        kind: 'hub',
        safe: false,
        side: city.side,
        regionId: city.regionId,
      });
      edges.push({ id: `${campId}__${war.cityId}`, a: war.cityId, b: campId, length: 1 });
      changed = true;
    }
    if (!changed) {
      return;
    }
    simWorld = { ...simWorld, geography: { ...geography, nodes, edges } };
  }

  function spawnNeutralGuards(): void {
    const extras: SimEntity[] = [];
    for (const cityId of neutralCities) {
      if (guardsSpawned.has(cityId)) {
        continue;
      }
      const war = openWars.find((row) => row.cityId === cityId);
      if (war === undefined || war.startsAtMs > clock.now()) {
        continue;
      }
      guardsSpawned.add(cityId);
      const city = simWorld.geography?.nodes.find((node) => node.id === cityId);
      for (let index = 0; index < NEUTRAL_GUARD_COUNT; index += 1) {
        const guard = spawnNamed('bandit', `guard:${cityId}:${String(index)}`);
        if (guard === null) {
          continue;
        }
        extras.push({
          ...guard,
          cityGuard: cityId,
          nodeId: cityId,
          inEncounter: false,
          ...(city !== undefined ? { cell: { x: city.x, y: city.y } } : {}),
        });
      }
    }
    if (extras.length === 0) {
      return;
    }
    simWorld = { ...simWorld, entities: [...simWorld.entities, ...extras] };
  }

  function noteDeclaredWar(): void {
    declaredEvents.push(clock.now());
  }

  function noteTurnover(amount: number): void {
    if (!Number.isInteger(amount) || amount <= 0) {
      return;
    }
    turnoverEvents.push({ atMs: clock.now(), amount });
  }

  function noteNodeCaptures(before: ReadonlyMap<string, string | null>): void {
    for (const node of resourceNodes) {
      if ((before.get(node.nodeId) ?? null) === null && node.guildId !== null) {
        captureEvents.push(clock.now());
      }
    }
  }

  function withinDay(atMs: number): boolean {
    return atMs > clock.now() - BALANCE_DAY_MS && atMs <= clock.now();
  }

  async function sampleBalance(): Promise<void> {
    const guilds = await repos.guilds.listGuilds();
    const people = simWorld.entities.filter((entity) => entity.monsterId === undefined);
    const online = people.filter((entity) => entity.phase === 'online' && entity.hp > 0).length;
    const memberIds = new Set(guilds.flatMap((guild) => guild.memberIds));
    const counted = new Set<string>([...memberIds, ...people.map((entity) => entity.id)]);
    let ai = 0;
    let aiInGuilds = 0;
    for (const id of counted) {
      const record = await repos.characters.findById(id);
      if (record?.controller !== 'bot') {
        continue;
      }
      ai += 1;
      if (memberIds.has(id)) {
        aiInGuilds += 1;
      }
    }
    const botIds = new Set<string>();
    for (const id of counted) {
      const record = await repos.characters.findById(id);
      if (record?.controller === 'bot') {
        botIds.add(id);
      }
    }
    const playerIds = [...counted].filter((id) => !botIds.has(id));
    let taxPercentSum = 0;
    let taxedNodes = 0;
    for (const node of resourceNodes) {
      if (node.guildId === null) {
        continue;
      }
      taxPercentSum += node.taxPercent;
      taxedNodes += 1;
    }
    const latest = settledEvents.length === 0 ? undefined : settledEvents[settledEvents.length - 1];
    const sieges = settledEvents.filter((row) => withinDay(row.atMs));
    balanceReport = measureSection12({
      online,
      guilds: guilds.length,
      members: guilds.reduce((total, guild) => total + guild.memberIds.length, 0),
      players: playerIds.length,
      playersInGuilds: playerIds.filter((id) => memberIds.has(id)).length,
      ai,
      aiInGuilds,
      warsToday: declaredEvents.filter((atMs) => withinDay(atMs)).length,
      warParticipants: latest?.participants ?? null,
      warDurationMs: latest?.elapsedMs ?? null,
      sieges: sieges.length,
      siegeWins: sieges.filter((row) => row.result === 'win').length,
      draws: sieges.filter((row) => row.result === 'draw').length,
      taxPercentSum,
      taxedNodes,
      capturesToday: captureEvents.filter((atMs) => withinDay(atMs)).length,
      turnoverToday: turnoverEvents
        .filter((row) => withinDay(row.atMs))
        .reduce((total, row) => total + row.amount, 0),
    });
  }

  async function declareNeutralCity(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const attackerGuildId = typeof body.attackerGuildId === 'string' ? body.attackerGuildId : '';
    const cityId = typeof body.cityId === 'string' ? body.cityId : '';
    const guild = await repos.guilds.findGuild(attackerGuildId);
    if (guild === null) {
      return { ok: false, code: 'member' };
    }
    if (await carrierBlocked(attackerGuildId)) {
      return { ok: false, code: 'carrier' };
    }
    const limits = {
      cityCapturedAtMs: captures.find((row) => row.cityId === cityId)?.wonAtMs ?? null,
      drawEndedAtMs: captures.find((row) => row.cityId === cityId)?.drawEndedAtMs ?? null,
      lastDeclaredAtMs: declaredAtMs.get(attackerGuildId) ?? null,
    };
    const declared = declareNeutralCapture({
      attackerGuildId,
      cityId,
      gold: typeof body.gold === 'number' ? body.gold : guild.bank,
      nowMs: clock.now(),
      leaderAbsent: body.leaderAbsent === true,
      leaderConsent: body.leaderConsent === true,
      councilConsents: typeof body.councilConsents === 'number' ? body.councilConsents : 0,
      owned: cityOwner(cityId) !== null,
      cityCapturedAtMs:
        typeof body.cityCapturedAtMs === 'number' ? body.cityCapturedAtMs : limits.cityCapturedAtMs,
      drawEndedAtMs: typeof body.drawEndedAtMs === 'number' ? body.drawEndedAtMs : limits.drawEndedAtMs,
      lastDeclaredAtMs:
        typeof body.lastDeclaredAtMs === 'number' ? body.lastDeclaredAtMs : limits.lastDeclaredAtMs,
    });
    if (!declared.ok) {
      return { ok: false, code: declared.code };
    }
    await repos.guilds.saveGuild({ ...guild, bank: declared.value.gold });
    logBank(attackerGuildId, '', guild.bank - declared.value.gold, 'war');
    const warId = nextDiplomacyId('war');
    await repos.guilds.saveWar({
      id: warId,
      attackerGuildId,
      cityId,
      startsAtMs: declared.value.startsAtMs,
      gold: declared.value.gold,
      resources: 0,
    });
    neutralCities.add(cityId);
    declaredAtMs.set(attackerGuildId, clock.now());
    noteDeclaredWar();
    noteTurnover(Math.max(0, guild.bank - declared.value.gold));
    rememberDefense(cityId, warId);
    await sampleBalance();
    const reviewed = await reviewDeclaredWar(attackerGuildId, cityId);
    if (!reviewed.ok) {
      return { ok: false, code: reviewed.code };
    }
    return { ok: true, value: { warId, ...declared.value } };
  }

  function rememberDefense(cityId: string, warId: string): { suzerainId: string; vassalId: string }[] {
    const owner = cityOwner(cityId);
    if (owner === null) {
      return [];
    }
    const obliged = suzerainDefenders(pacts, owner, clock.now()).map((suzerainId) => ({
      warId,
      cityId,
      suzerainId,
      vassalId: owner,
      appeared: false,
      penalized: false,
    }));
    defenseDuties = [
      ...defenseDuties.filter((row) => row.warId !== warId),
      ...obliged,
    ];
    return obliged.map((row) => ({ suzerainId: row.suzerainId, vassalId: row.vassalId }));
  }

  function noteSuzerainPresence(): void {
    const now = clock.now();
    defenseDuties = defenseDuties.map((duty) => {
      if (duty.appeared) {
        return duty;
      }
      const war = openWars.find((row) => row.id === duty.warId);
      if (war === undefined || war.startsAtMs > now) {
        return duty;
      }
      if (warPhase(Math.max(0, now - war.startsAtMs)) === 'closed') {
        return duty;
      }
      const here = simWorld.entities.some(
        (entity) =>
          entity.monsterId === undefined &&
          entity.phase === 'online' &&
          entity.hp > 0 &&
          entity.guildId === duty.suzerainId &&
          entity.nodeId === duty.cityId,
      );
      return here ? { ...duty, appeared: true } : duty;
    });
  }

  async function penalizeAbsentSuzerains(): Promise<void> {
    const now = clock.now();
    const next = [];
    for (const duty of defenseDuties) {
      if (duty.appeared || duty.penalized) {
        next.push(duty);
        continue;
      }
      const war = openWars.find((row) => row.id === duty.warId);
      if (war === undefined || war.startsAtMs > now) {
        next.push(duty);
        continue;
      }
      const phase = warPhase(Math.max(0, now - war.startsAtMs));
      const settled = captures.some((row) => row.cityId === duty.cityId && row.settled === true);
      if (phase !== 'closed' && !settled) {
        next.push(duty);
        continue;
      }
      const guild = await repos.guilds.findGuild(duty.suzerainId);
      if (guild === null) {
        next.push({ ...duty, penalized: true });
        continue;
      }
      const fined = failSuzerainDefense({ bank: guild.bank, nowMs: now });
      await repos.guilds.saveGuild({ ...guild, bank: fined.bank });
      logBank(duty.suzerainId, '', guild.bank - fined.bank, 'fine');
      suzerainFlags = [...suzerainFlags, { guildId: duty.suzerainId, untilMs: fined.flagUntilMs, fine: fined.fine }];
      next.push({ ...duty, penalized: true });
    }
    defenseDuties = next;
  }

  function rememberOffice(characterId: string, guildId: string): void {
    officeHeldAt.set(characterId, { atMs: clock.now(), guildId });
  }

  function endOffice(characterId: string): void {
    const held = officeHeldAt.get(characterId);
    if (held === undefined) {
      return;
    }
    held.atMs = clock.now();
  }

  function founderInOffice(characterId: string): boolean {
    for (const table of guildRanks.values()) {
      const rank = table.get(characterId);
      if (rank === 'leader' || rank === 'council') {
        return true;
      }
    }
    return false;
  }

  function activeCreationBan(characterId: string): { id: string; kind: 'collusion' | 'alt_guild'; untilMs: number | null } | null {
    const ban = creationBans.get(characterId);
    if (ban === undefined) {
      return null;
    }
    if (ban.untilMs !== null && clock.now() >= ban.untilMs) {
      return null;
    }
    return { id: characterId, kind: ban.kind, untilMs: ban.untilMs };
  }

  function noteCreationBan(characterId: string, kind: 'collusion' | 'alt_guild', untilMs: number | null): void {
    if (characterId.length === 0) {
      return;
    }
    creationBans.set(characterId, { kind, untilMs });
  }

  function previousOffice(characterId: string): number | null {
    return officeHeldAt.get(characterId)?.atMs ?? null;
  }

  function logBank(
    guildId: string,
    characterId: string,
    amount: number,
    op: string,
    extra?: { resourceId?: string; resourceAmount?: number; itemId?: string; itemAmount?: number },
  ): void {
    bankLog.push({
      guildId,
      characterId,
      amount,
      atMs: clock.now(),
      op,
      ...(extra?.resourceId !== undefined
        ? { resourceId: extra.resourceId, resourceAmount: extra.resourceAmount ?? 0 }
        : {}),
      ...(extra?.itemId !== undefined ? { itemId: extra.itemId, itemAmount: extra.itemAmount ?? 0 } : {}),
    });
  }

  function logWithdrawal(guildId: string, characterId: string, amount: number): void {
    logBank(guildId, characterId, amount, 'withdraw');
  }

  function bankOperations(guildId: string) {
    return bankLog.filter((row) => row.guildId === guildId);
  }

  function readBankLog(
    body: Record<string, unknown>,
  ): { ok: boolean; code?: string; value?: unknown } {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    if (guildId.length === 0 || characterId.length === 0) {
      return { ok: false, code: 'member' };
    }
    if (memberRank(guildId, characterId) === null) {
      return { ok: false, code: 'member' };
    }
    return { ok: true, value: { operations: bankOperations(guildId) } };
  }

  function doctrineStocks(guildId: string): Record<DoctrineResource, number> {
    const stocks = resourceKindStock.get(guildId);
    const resources: Record<DoctrineResource, number> = {
      metal: 0,
      leather: 0,
      wood: 0,
      crystals: 0,
      titanium: 0,
    };
    for (const key of DOCTRINE_RESOURCES) {
      resources[key] = stocks?.get(key) ?? 0;
    }
    return resources;
  }

  function memberDoctrine(characterId: string): DoctrineId | null {
    const guildId = guildOf.get(characterId);
    if (guildId === undefined) {
      return null;
    }
    return guildDoctrines.get(guildId)?.doctrine ?? null;
  }

  function stampGuildDoctrines(): void {
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((entity) => stampDoctrine(entity)),
    };
  }

  function stampDoctrine(entity: SimEntity): SimEntity {
    if (entity.monsterId !== undefined) {
      return entity;
    }
    const doctrine =
      entity.guildId === undefined ? undefined : guildDoctrines.get(entity.guildId)?.doctrine;
    let next = entity;
    if (entity.doctrineBaseMaxHp !== undefined && doctrine !== 'fortitude') {
      next = {
        ...entity,
        maxHp: entity.doctrineBaseMaxHp,
        hp: Math.min(entity.hp, entity.doctrineBaseMaxHp),
      };
      delete next.doctrineBaseMaxHp;
      delete next.doctrineId;
    }
    if (doctrine === undefined) {
      if (next.doctrineId === undefined) {
        return next;
      }
      const cleared = { ...next };
      delete cleared.doctrineId;
      return cleared;
    }
    if (doctrine === 'fortitude') {
      const base = next.doctrineBaseMaxHp ?? next.maxHp;
      const scaled = applyDoctrine('fortitude', base);
      const ratio = next.maxHp > 0 ? next.hp / next.maxHp : 1;
      return {
        ...next,
        doctrineId: doctrine,
        doctrineBaseMaxHp: base,
        maxHp: scaled,
        hp: Math.max(0, Math.floor(scaled * ratio)),
      };
    }
    return { ...next, doctrineId: doctrine };
  }

  async function changeDoctrine(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const next = typeof body.doctrine === 'string' ? body.doctrine : '';
    const guild = await repos.guilds.findGuild(guildId);
    const rank = memberRank(guildId, characterId);
    if (guild === null || rank === null || !guild.memberIds.includes(characterId)) {
      return { ok: false, code: 'member' };
    }
    if (rank !== 'leader' && rank !== 'council' && rank !== 'veteran') {
      return { ok: false, code: 'rank' };
    }
    const leaderConfirm = body.leaderConfirm === true;
    const posted = body.councilConfirms;
    const seated = councilSize(guildId);
    if (
      !leaderConfirm ||
      typeof posted !== 'number' ||
      !Number.isInteger(posted) ||
      posted < 1 ||
      posted > seated
    ) {
      return { ok: false, code: 'confirm' };
    }
    const current = guildDoctrines.get(guildId) ?? null;
    const changed = setDoctrine({
      current: current?.doctrine ?? null,
      next: next as DoctrineId,
      changedAtMs: current?.changedAtMs ?? null,
      nowMs: clock.now(),
      gold: guild.bank,
      resources: doctrineStocks(guildId),
    });
    if (!changed.ok) {
      return { ok: false, code: changed.code };
    }
    const stocks = new Map(resourceKindStock.get(guildId) ?? []);
    for (const key of DOCTRINE_RESOURCES) {
      stocks.set(key, changed.value.resources[key]);
    }
    resourceKindStock.set(guildId, stocks);
    let total = 0;
    for (const qty of stocks.values()) {
      total += qty;
    }
    guildResources.set(guildId, total);
    const spentGold = guild.bank - changed.value.gold;
    await repos.guilds.saveGuild({ ...guild, bank: changed.value.gold });
    if (spentGold > 0) {
      logBank(guildId, characterId, spentGold, 'doctrine');
      noteTurnover(spentGold);
    }
    guildDoctrines.set(guildId, {
      doctrine: changed.value.doctrine,
      changedAtMs: changed.value.changedAtMs,
      affects: changed.value.affects,
      multiplier: changed.value.multiplier,
    });
    stampGuildDoctrines();
    return {
      ok: true,
      value: {
        doctrine: changed.value.doctrine,
        affects: changed.value.affects,
        multiplier: changed.value.multiplier,
        changedAtMs: changed.value.changedAtMs,
        bank: changed.value.gold,
      },
    };
  }

  async function postBoardContract(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const type = typeof body.type === 'string' ? body.type : '';
    if (characterId.length === 0 || typeof body.rewardGold !== 'number') {
      return { ok: false, code: 'gold' };
    }
    const nodeId = characterNode(characterId);
    const kind =
      nodeId === undefined
        ? ''
        : (simWorld.geography?.nodes.find((node) => node.id === nodeId)?.kind ?? '');
    if (kind !== 'city' && kind !== 'hub') {
      return { ok: false, code: 'place' };
    }
    const posted = postContract({
      type: type as ContractType,
      rewardGold: body.rewardGold,
      ...(typeof body.rewardResources === 'number' ? { rewardResources: body.rewardResources } : {}),
      ...(typeof body.rewardRelics === 'number' ? { rewardRelics: body.rewardRelics } : {}),
      ...(typeof body.targetLevel === 'number' ? { targetLevel: body.targetLevel } : {}),
      ...(body.targetIsMember === true ? { targetIsMember: true } : { targetIsMember: false }),
    });
    if (!posted.ok) {
      return { ok: false, code: posted.code };
    }
    const id = nextDiplomacyId('contract');
    const row = {
      id,
      type: posted.value.type,
      rewardGold: posted.value.rewardGold,
      rewardResources: posted.value.rewardResources ?? 0,
      rewardRelics: posted.value.rewardRelics ?? 0,
      posterId: characterId,
      guildId: guildOf.get(characterId) ?? null,
      anonymous: body.anonymous === true,
      atMs: clock.now(),
    };
    boardContracts = [...boardContracts, row];
    return { ok: true, value: { ...row, countedInQuests: false } };
  }

  function visibleContracts(focus: SimEntity | undefined) {
    return boardContracts.flatMap((contract) => {
      if (contract.type === 'kill') {
        if (focus === undefined) {
          return [];
        }
        const sameGuild = contract.guildId !== null && focus.guildId === contract.guildId;
        const soloPoster = contract.guildId === null && focus.id === contract.posterId;
        if (!sameGuild && !soloPoster) {
          return [];
        }
      }
      return [
        {
          id: contract.id,
          type: contract.type,
          rewardGold: contract.rewardGold,
          rewardResources: contract.rewardResources,
          rewardRelics: contract.rewardRelics,
          guildId: contract.guildId,
          posterId: contract.anonymous ? '' : contract.posterId,
          anonymous: contract.anonymous,
          atMs: contract.atMs,
        },
      ];
    });
  }

  function fileReport(
    body: Record<string, unknown>,
  ): { ok: boolean; code?: string; value?: unknown } {
    const reporterId = typeof body.reporterId === 'string' ? body.reporterId : '';
    const targetId = typeof body.targetId === 'string' ? body.targetId : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reporterId.length === 0 || targetId.length === 0 || reporterId === targetId || reason.length === 0) {
      return { ok: false, code: 'report' };
    }
    const row = {
      id: nextDiplomacyId('report'),
      reporterId,
      targetId,
      reason,
      atMs: clock.now(),
      verdict: 'open' as const,
    };
    playerReports = [...playerReports, row];
    return { ok: true, value: { id: row.id, reporterId, targetId } };
  }

  /**
   * Artifact 32 §10. A moderator who judges a report false mutes the reporter for 24 hours.
   * The mute is `falseReportSanction` and blocks chat until that window elapses.
   */
  function judgeReport(
    body: Record<string, unknown>,
  ): { ok: boolean; code?: string; value?: unknown } {
    const reportId = typeof body.reportId === 'string' ? body.reportId : '';
    const reviewerId = typeof body.reviewerId === 'string' ? body.reviewerId : '';
    const report = playerReports.find((row) => row.id === reportId);
    if (report === undefined || report.verdict !== 'open') {
      return { ok: false, code: 'report' };
    }
    const role = staffRoles.get(reviewerId);
    if (role !== 'moderator' && role !== 'admin') {
      return { ok: false, code: 'rank' };
    }
    const falseVerdict = body.verdict === false || body.verdict === 'false';
    if (!falseVerdict) {
      report.verdict = 'upheld';
      return { ok: true, value: { id: report.id, verdict: 'upheld' } };
    }
    const sanction = falseReportSanction();
    const nodeId = characterNode(report.reporterId) ?? 'fort_humans';
    social.service.register({ id: report.reporterId, nodeId, language: 'common_light' });
    if (!social.service.imposeSanction(report.reporterId, sanction, clock.now())) {
      return { ok: false, code: 'missing' };
    }
    report.verdict = 'false';
    const untilMs = social.repository.character(report.reporterId)?.sanctionUntilMs ?? null;
    return {
      ok: true,
      value: { id: report.id, reporterId: report.reporterId, sanction, untilMs },
    };
  }

  async function sayChat(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const text = typeof body.text === 'string' ? body.text : '';
    if (characterId.length === 0 || text.trim().length === 0) {
      return { ok: false, code: 'invalid' };
    }
    const nodeId = characterNode(characterId) ?? 'fort_humans';
    social.service.register({ id: characterId, nodeId, language: 'common_light' });
    const sent = await social.service.say({
      senderId: characterId,
      channel: 'local',
      text,
      nowMs: clock.now(),
    });
    if (!sent.ok) {
      return { ok: false, code: sent.code };
    }
    return { ok: true, value: sent.value };
  }

  function recordCheatStrike(accountId: string, nowMs: number): number {
    const prior = cheatStrikes.get(accountId) ?? [];
    const recent = prior.filter((atMs) => nowMs - atMs >= 0 && nowMs - atMs <= CHEAT_STRIKE_WINDOW_MS);
    recent.push(nowMs);
    cheatStrikes.set(accountId, recent);
    return recent.length;
  }

  /**
   * Artifact 32 §10 and task 027. Three cheat flags in 24 hours ban the account for 7 days.
   * A later window, after a ban was already applied, is permanent.
   */
  async function reviewCheatStrikes(): Promise<void> {
    const now = clock.now();
    for (const [accountId, times] of [...cheatStrikes.entries()]) {
      const recent = times.filter((atMs) => now - atMs >= 0 && now - atMs <= CHEAT_STRIKE_WINDOW_MS);
      cheatStrikes.set(accountId, recent);
      const sanction = sanctionForCheatStrikes(recent.length, cheatRepeat.has(accountId));
      if (sanction === 'none') {
        continue;
      }
      const applied = await applyCheatSanction(accountId, sanction, now);
      if (!applied) {
        continue;
      }
      cheatRepeat.add(accountId);
      cheatStrikes.set(accountId, []);
    }
  }

  async function applyCheatSanction(
    accountId: string,
    sanction: 'account_ban_7d' | 'permanent',
    nowMs: number,
  ): Promise<boolean> {
    const account = await repos.auth.findAccountById(accountId);
    if (account === null) {
      return false;
    }
    await repos.auth.updateAccount({
      ...account,
      banned: true,
      banReason: 'cheat',
      banUntilMs: sanction === 'permanent' ? null : nowMs + CHAT_BAN_MS,
    });
    return true;
  }

  async function noteCheatStrike(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const posted = typeof body.accountId === 'string' ? body.accountId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    let accountId = posted;
    if (accountId.length === 0 && characterId.length > 0) {
      const record = await repos.characters.findById(characterId);
      accountId = record?.accountId ?? accountByCharacter.get(characterId) ?? '';
    }
    if (accountId.length === 0) {
      return { ok: false, code: 'account' };
    }
    const strikes = recordCheatStrike(accountId, clock.now());
    return { ok: true, value: { accountId, strikes } };
  }

  function encodeAncientText(
    body: Record<string, unknown>,
  ): { ok: boolean; code?: string; value?: unknown } {
    const text = typeof body.text === 'string' ? body.text : '';
    if (text.length === 0) {
      return { ok: false, code: 'text' };
    }
    return { ok: true, value: { ciphertext: encodeAncient(text, ancientPermutation) } };
  }

  /**
   * Artifact 3 §6 and artifact 20 §10. A player sees `renderFragment` (ciphertext and
   * the letter pairs already found). `decodeAncient` applies their substitution.
   * `decipherAttempt` accepts it only when that reading matches the fragment.
   * A bot does not solve the cipher: `botRecord` returns the structured fields.
   * Those sections name no lockout, so a mismatch stays a mismatch.
   */
  async function decipherAncient(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const fragmentId = typeof body.fragmentId === 'string' ? body.fragmentId : '';
    const attempt = typeof body.attempt === 'string' ? body.attempt : '';
    if (characterId.length === 0 || fragmentId.length === 0) {
      return { ok: false, code: 'fragment' };
    }
    const found = catalog.fragments.find((row) => row.id === fragmentId);
    if (found === undefined) {
      return { ok: false, code: 'fragment' };
    }
    const record = await repos.characters.findById(characterId);
    const fragment = {
      id: found.id,
      plaintext: found.lore,
      x: found.x,
      y: found.y,
      recipeId: found.recipeId,
      password: found.password,
    };
    if (record?.controller === 'bot') {
      return {
        ok: true,
        value: botRecord({
          id: found.id,
          lore: found.lore,
          x: found.x,
          y: found.y,
          recipeId: found.recipeId,
          password: found.password,
        }),
      };
    }
    if (attempt.length === 0) {
      return { ok: false, code: 'fragment' };
    }
    const knownLetters = Array.isArray(body.knownLetters)
      ? body.knownLetters.filter((letter): letter is string => typeof letter === 'string')
      : [];
    const solved = solvedAncient.get(characterId)?.has(fragmentId) ?? false;
    const rendered = renderFragment({
      fragment,
      permutation: ancientPermutation,
      knownLetters,
      solved,
      upy: record?.languages.ancient ?? 0,
    });
    const decoded = decodeAncient(rendered.ciphertext, attempt);
    const result = decipherAttempt({
      fragment,
      permutation: ancientPermutation,
      knownLetters,
      attempt,
      solved,
    });
    if (!result.ok || decoded !== result.value.plaintext) {
      return { ok: false, code: result.ok ? 'mismatch' : result.code };
    }
    const known = solvedAncient.get(characterId) ?? new Set<string>();
    known.add(fragmentId);
    solvedAncient.set(characterId, known);
    return {
      ok: true,
      value: {
        plaintext: result.value.plaintext,
        solved: result.value.solved,
        firstSolve: result.value.firstSolve,
        ciphertext: rendered.ciphertext,
        knownLetters: rendered.knownLetters,
      },
    };
  }

  /**
   * Artifact 17 §9.2. A coalition has no shared bank, so `coalitionBank` stays `bank`
   * and there is no balance to return. Members still post a deposit or a read.
   * Those posts are the ledger. A read returns the rows.
   */
  function useCoalitionBank(
    body: Record<string, unknown>,
  ): { ok: boolean; code?: string; value?: unknown } {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const op = body.op === 'deposit' || body.op === 'read' ? body.op : '';
    if (characterId.length === 0 || op === '') {
      return { ok: false, code: 'op' };
    }
    const guildId = guildOf.get(characterId);
    if (guildId === undefined) {
      return { ok: false, code: 'member' };
    }
    const pact = coalitionChannel(pacts, guildId, clock.now());
    if (pact === null) {
      return { ok: false, code: 'member' };
    }
    const postedAmount = body.amount;
    const amount =
      op === 'deposit' &&
      typeof postedAmount === 'number' &&
      Number.isInteger(postedAmount) &&
      postedAmount >= 0
        ? postedAmount
        : null;
    const key = [...pact.guildIds].sort().join('|');
    const rows = [
      ...(coalitionLedger.get(key) ?? []),
      { op, characterId, guildId, amount, atMs: clock.now() },
    ];
    coalitionLedger.set(key, rows);
    const bank = coalitionBank();
    if (!bank.ok) {
      return {
        ok: false,
        code: bank.code,
        value: op === 'read' ? { op, guildId, rows } : { op, guildId },
      };
    }
    return {
      ok: false,
      code: 'bank',
      value: op === 'read' ? { op, guildId, rows } : { op, guildId },
    };
  }

  function noteWarRoster(): void {
    const now = clock.now();
    for (const war of openWars) {
      if (war.startsAtMs > now || warPhase(Math.max(0, now - war.startsAtMs)) === 'closed') {
        continue;
      }
      const roster = warRosters.get(war.id) ?? new Set<string>();
      for (const entity of simWorld.entities) {
        if (
          entity.monsterId === undefined &&
          entity.phase === 'online' &&
          entity.hp > 0 &&
          entity.nodeId === war.cityId
        ) {
          roster.add(entity.id);
        }
      }
      warRosters.set(war.id, roster);
    }
  }

  /** Worn relics stored on the character row. A missing stack is empty. */
  function storedRelicsLeft(record: { build?: { relics?: RelicState[] } | null }): number {
    return record.build?.relics?.length ?? 0;
  }

  function implantCoresLeft(state: BuildState): number {
    return state.cores.filter((core) => core.implant).length;
  }

  /**
   * Artifact 6 §6.4–6.5. A clean return starts only after every relic and implant
   * core is gone, then waits `PURIFY_MS` (24 hours). Implant cores are the stored
   * `cores` with `implant`. Worn relics are the stack on the character row.
   * The request does not supply those counts.
   */
  async function startPurify(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    if (characterId.length === 0) {
      return { ok: false, code: 'character' };
    }
    const record = await repos.characters.findById(characterId);
    if (record === null) {
      return { ok: false, code: 'character' };
    }
    const state = await buildOf(characterId);
    const started = beginPurify(state, storedRelicsLeft(record), implantCoresLeft(state), clock.now());
    if (!started.ok) {
      return { ok: false, code: started.code };
    }
    await persistPurify(characterId, started.value);
    purifyingIds.add(characterId);
    return {
      ok: true,
      value: { purifyingUntilMs: started.value.purifyingUntilMs, clean: started.value.clean },
    };
  }

  /** Closes a purification once `nowMs` reaches the deadline `beginPurify` stored. */
  async function finishPurifications(): Promise<void> {
    const now = clock.now();
    for (const characterId of [...purifyingIds]) {
      const state = await buildOf(characterId);
      if (state.purifyingUntilMs === null) {
        purifyingIds.delete(characterId);
        continue;
      }
      const done = completePurify(state, now);
      if (done.purifyingUntilMs !== null) {
        continue;
      }
      await persistPurify(characterId, done);
      purifyingIds.delete(characterId);
    }
  }

  async function persistPurify(characterId: string, state: BuildState): Promise<void> {
    const record = await repos.characters.findById(characterId);
    if (record === null) {
      return;
    }
    await repos.characters.update({
      ...record,
      clean: state.clean,
      build: {
        programs: state.programs.map((program) => ({ ...program })),
        cores: state.cores.map((core) => ({ ...core })),
        relicSocketFree: state.relicSocketFree,
        relicGrade: record.build?.relicGrade ?? 'common',
        purifyingUntilMs: state.purifyingUntilMs,
        echoIds: [...(record.build?.echoIds ?? [])],
        relics: (record.build?.relics ?? []).map((relic) => ({ ...relic, echoIds: [...relic.echoIds] })),
      },
    });
  }

  /**
   * Artifact 4 §6.8. A worn relic comes off in a city or hub, outside combat.
   * Echoes in its sockets are lost. Purification can start once the stack is empty.
   */
  async function removeWornRelic(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    if (characterId.length === 0) {
      return { ok: false, code: 'character' };
    }
    const record = await repos.characters.findById(characterId);
    if (record === null) {
      return { ok: false, code: 'character' };
    }
    const relics = record.build?.relics ?? [];
    const requested = body.index;
    const index =
      typeof requested === 'number' && Number.isInteger(requested) ? requested : relics.length - 1;
    const relic = relics[index];
    if (relic === undefined) {
      return { ok: false, code: 'relic' };
    }
    const state = await buildOf(characterId);
    const removed = removeRelic(relic, state.inCityOrHub, state.inCombat);
    if (!removed.ok) {
      return { ok: false, code: removed.code };
    }
    const lost = new Set(removed.value.lostEchoIds);
    const nextRelics = relics.filter((_, relicIndex) => relicIndex !== index);
    await repos.characters.update({
      ...record,
      build: {
        programs: state.programs
          .filter((program) => !(program.kind === 'echo' && lost.has(program.templateId)))
          .map((program) => ({ ...program })),
        cores: state.cores.map((core) => ({ ...core })),
        relicSocketFree: state.relicSocketFree,
        relicGrade: record.build?.relicGrade ?? relic.grade,
        purifyingUntilMs: state.purifyingUntilMs,
        echoIds: (record.build?.echoIds ?? []).filter((id) => !lost.has(id)),
        relics: nextRelics.map((row) => ({ ...row, echoIds: [...row.echoIds] })),
      },
    });
    return {
      ok: true,
      value: { relics: nextRelics.length, lostEchoIds: removed.value.lostEchoIds },
    };
  }

  function isPartyRole(role: string): role is PartyRole {
    return role === 'tank' || role === 'damage' || role === 'support' || role === 'flex';
  }

  /**
   * Artifact 16 §4. Automatic group search: level within 5, an optional role,
   * and the open seats under the party cap of 4.
   */
  async function matchParty(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    if (characterId.length === 0) {
      return { ok: false, code: 'character' };
    }
    const record = await repos.characters.findById(characterId);
    if (record === null) {
      return { ok: false, code: 'character' };
    }
    const postedRole = typeof body.role === 'string' ? body.role : '';
    const wantRole = isPartyRole(postedRole) ? postedRole : null;
    lfgRoles.set(characterId, wantRole ?? 'flex');
    const nodeId =
      simWorld.entities.find((entity) => entity.id === characterId)?.nodeId ??
      (record.bindNodeId === '' ? 'fort_humans' : record.bindNodeId);
    social.service.register({ id: characterId, nodeId, language: 'common_light' });
    const party = social.service.partyOf(characterId);
    const seated = party?.members.length ?? 1;
    const seats = Math.max(0, PARTY_MAX - seated);
    const candidates: { id: string; level: number; role: PartyRole }[] = [];
    for (const [id, role] of lfgRoles) {
      if (id === characterId) {
        continue;
      }
      const other = await repos.characters.findById(id);
      if (other === null) {
        continue;
      }
      const otherParty = social.service.partyOf(id);
      if (otherParty !== null && otherParty.leaderId !== characterId) {
        continue;
      }
      candidates.push({ id, level: other.level, role });
    }
    const picked = matchmake(candidates, record.level, wantRole, seats);
    const joined: string[] = [];
    for (const id of picked) {
      const otherNode =
        simWorld.entities.find((entity) => entity.id === id)?.nodeId ?? nodeId;
      social.service.register({ id, nodeId: otherNode, language: 'common_light' });
      const invited = await social.service.invite(characterId, id, lfgRoles.get(id) ?? 'flex');
      if (invited.ok) {
        joined.push(id);
      }
    }
    return { ok: true, value: { picked, joined, seats } };
  }

  function isLanguage(value: string): value is LanguageId {
    return value === 'common_light' || value === 'common_dark' || value === 'ancient';
  }

  function nativeLanguage(raceId: string): LanguageId {
    const race = RACES.find((row) => row.id === raceId);
    return race?.side === 'dark' ? 'common_dark' : 'common_light';
  }

  /**
   * Artifact 3 §4–5.1. Passive understanding waits 7 200 000 ms online beside a speaker.
   * A teacher costs 100 gold, stops at 80, and waits 24 hours before the same language.
   */
  async function advanceLanguage(deltaMs: number): Promise<void> {
    if (deltaMs <= 0) {
      return;
    }
    const spoken = new Map<string, LanguageId>();
    for (const entity of simWorld.entities) {
      if (entity.monsterId !== undefined || entity.phase !== 'online') {
        continue;
      }
      const record = await repos.characters.findById(entity.id);
      if (record === null) {
        continue;
      }
      spoken.set(entity.id, nativeLanguage(record.raceId));
    }
    for (const entity of simWorld.entities) {
      if (entity.monsterId !== undefined || entity.phase !== 'online' || entity.nodeId === undefined) {
        continue;
      }
      const record = await repos.characters.findById(entity.id);
      if (record === null) {
        continue;
      }
      const memory = upyMemory.get(entity.id) ?? { lastLessonMs: {}, onlineMs: 0 };
      memory.onlineMs += deltaMs;
      let heard: LanguageId | null = null;
      for (const [id, language] of spoken) {
        if (id === entity.id) {
          continue;
        }
        const other = simWorld.entities.find((row) => row.id === id);
        if (other?.phase === 'online' && other.nodeId === entity.nodeId) {
          heard = language;
          break;
        }
      }
      if (heard !== null) {
        const gained = gainUpy({
          state: { values: { ...record.languages }, lastLessonMs: { ...memory.lastLessonMs } },
          language: heard,
          gain: 'passive',
          nowMs: clock.now(),
          onlineMsSinceLastPassive: memory.onlineMs,
          gold: repos.economy.getCharacter(entity.id)?.gold ?? 0,
        });
        if (gained.ok) {
          memory.onlineMs = 0;
          memory.lastLessonMs = gained.value.state.lastLessonMs;
          await repos.characters.update({ ...record, languages: { ...gained.value.state.values } });
        }
      }
      upyMemory.set(entity.id, memory);
    }
  }

  async function teachLanguage(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const language = typeof body.language === 'string' ? body.language : '';
    if (characterId.length === 0 || !isLanguage(language)) {
      return { ok: false, code: 'language' };
    }
    const record = await repos.characters.findById(characterId);
    if (record === null) {
      return { ok: false, code: 'character' };
    }
    const memory = upyMemory.get(characterId) ?? { lastLessonMs: {}, onlineMs: 0 };
    const gold = repos.economy.getCharacter(characterId)?.gold ?? 0;
    const gained = gainUpy({
      state: { values: { ...record.languages }, lastLessonMs: { ...memory.lastLessonMs } },
      language,
      gain: 'teacher',
      nowMs: clock.now(),
      onlineMsSinceLastPassive: memory.onlineMs,
      gold,
    });
    if (!gained.ok) {
      return { ok: false, code: gained.code };
    }
    memory.lastLessonMs = gained.value.state.lastLessonMs;
    upyMemory.set(characterId, memory);
    await repos.characters.update({ ...record, languages: { ...gained.value.state.values } });
    const wallet = repos.economy.getCharacter(characterId);
    if (wallet !== null) {
      repos.economy.saveCharacter({ ...wallet, gold: gained.value.gold });
    }
    return {
      ok: true,
      value: { language, upy: gained.value.state.values[language], gold: gained.value.gold },
    };
  }

  /**
   * Artifact 6 §4.4. Online idle advances path forgetting by one step each two hours.
   * Using the path clears that idle and does not restore a lost step.
   */
  async function advanceForgetting(deltaMs: number): Promise<void> {
    if (deltaMs <= 0) {
      return;
    }
    for (const entity of simWorld.entities) {
      if (entity.monsterId !== undefined || entity.phase !== 'online') {
        continue;
      }
      const record = await repos.characters.findById(entity.id);
      const programs = record?.build?.programs;
      if (record === null || programs === undefined || !programs.some((program) => program.kind === 'path')) {
        continue;
      }
      const used = pathUsed.get(entity.id) ?? new Set<string>();
      pathUsed.delete(entity.id);
      await repos.characters.update({
        ...record,
        build: {
          programs: programs.map((program) =>
            program.kind === 'path' ? tickForgetting(program, deltaMs, used.has(program.templateId)) : { ...program },
          ),
          cores: record.build?.cores.map((core) => ({ ...core })) ?? [],
          relicSocketFree: record.build?.relicSocketFree ?? 0,
          relicGrade: record.build?.relicGrade ?? 'common',
          purifyingUntilMs: record.build?.purifyingUntilMs ?? null,
          echoIds: [...(record.build?.echoIds ?? [])],
          relics: (record.build?.relics ?? []).map((relic) => ({ ...relic, echoIds: [...relic.echoIds] })),
        },
      });
    }
  }

  function markPathUsed(
    body: Record<string, unknown>,
  ): { ok: boolean; code?: string; value?: unknown } {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const templateId = typeof body.templateId === 'string' ? body.templateId : '';
    if (characterId.length === 0 || templateId.length === 0) {
      return { ok: false, code: 'path' };
    }
    const used = pathUsed.get(characterId) ?? new Set<string>();
    used.add(templateId);
    pathUsed.set(characterId, used);
    return { ok: true, value: { templateId } };
  }

  /**
   * One forgetting step back: 50 gold and a 30-minute channel, in a city and out of combat.
   */
  async function recoverPath(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const templateId = typeof body.templateId === 'string' ? body.templateId : '';
    if (characterId.length === 0 || templateId.length === 0) {
      return { ok: false, code: 'path' };
    }
    const record = await repos.characters.findById(characterId);
    if (record === null) {
      return { ok: false, code: 'character' };
    }
    const state = await buildOf(characterId);
    const gold = repos.economy.getCharacter(characterId)?.gold ?? 0;
    const recovered = recoverForgetting(state, templateId, gold, clock.now());
    if (!recovered.ok) {
      return { ok: false, code: recovered.code };
    }
    const wallet = repos.economy.getCharacter(characterId);
    if (wallet !== null) {
      repos.economy.saveCharacter({ ...wallet, gold: recovered.value.gold });
    }
    await repos.characters.update({
      ...record,
      build: {
        programs: recovered.value.state.programs.map((program) => ({ ...program })),
        cores: recovered.value.state.cores.map((core) => ({ ...core })),
        relicSocketFree: recovered.value.state.relicSocketFree,
        relicGrade: record.build?.relicGrade ?? 'common',
        purifyingUntilMs: recovered.value.state.purifyingUntilMs,
        echoIds: [...(record.build?.echoIds ?? [])],
        relics: (record.build?.relics ?? []).map((relic) => ({ ...relic, echoIds: [...relic.echoIds] })),
      },
    });
    return {
      ok: true,
      value: { gold: recovered.value.gold, readyAtMs: recovered.value.readyAtMs, templateId },
    };
  }

  /**
   * Artifact 6. Installing a relic is what breaks purity, and that refusal stays on
   * `startInstall`. This route is the separate act that stores `clean: false`.
   */
  async function breakPurity(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    if (characterId.length === 0) {
      return { ok: false, code: 'character' };
    }
    const record = await repos.characters.findById(characterId);
    if (record === null) {
      return { ok: false, code: 'character' };
    }
    const state = await buildOf(characterId);
    const broken = breakClean(state, clock.now());
    await repos.characters.update({
      ...record,
      clean: broken.clean,
      build: {
        programs: broken.programs.map((program) => ({ ...program })),
        cores: broken.cores.map((core) => ({ ...core })),
        relicSocketFree: broken.relicSocketFree,
        relicGrade: record.build?.relicGrade ?? 'common',
        purifyingUntilMs: broken.purifyingUntilMs,
        echoIds: [...(record.build?.echoIds ?? [])],
        relics: (record.build?.relics ?? []).map((relic) => ({ ...relic, echoIds: [...relic.echoIds] })),
      },
    });
    return { ok: true, value: { clean: broken.clean, programs: broken.programs.length } };
  }

  /**
   * Artifact 11 §9. A common chest needs no key, a rare chest needs one, an epic chest needs two.
   * Gold is `roll × region level`. Epic also drops one unique component.
   */
  function openLiveChest(
    body: Record<string, unknown>,
  ): { ok: boolean; code?: string; value?: unknown } {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const tier = body.tier;
    if (characterId.length === 0 || (tier !== 'common' && tier !== 'rare' && tier !== 'epic')) {
      return { ok: false, code: 'chest' };
    }
    const wallet =
      repos.economy.getCharacter(characterId) ??
      newEconomyCharacter({ characterId, side: 'light', gold: 0 });
    const keys = wallet.items.key?.qty ?? 0;
    const regionLevel = regionLevelOf(characterId);
    const opened = openChest({
      tier,
      keys,
      regionLevel,
      rng: mulberry32(chestSeed(characterId, clock.now())),
    });
    if (!opened.ok) {
      return { ok: false, code: opened.code };
    }
    const cost = CHEST_KEY_COST[tier];
    const items = { ...wallet.items };
    const key = items.key;
    if (cost > 0) {
      if (key === undefined || key.qty < cost) {
        return { ok: false, code: 'keys' };
      }
      if (key.qty === cost) {
        delete items.key;
      } else {
        items.key = { ...key, qty: key.qty - cost };
      }
    }
    let gold = wallet.gold;
    for (const stack of opened.value) {
      if (stack.itemId === 'gold') {
        gold = deposit(gold, stack.qty).wallet;
        continue;
      }
      const existing = items[stack.itemId];
      const grade = chestGrade(stack.itemId);
      if (existing === undefined) {
        items[stack.itemId] = {
          itemId: stack.itemId,
          level: stack.itemLevel ?? regionLevel,
          grade,
          unique: stack.itemId === 'unique_component',
          durability: STARTING_DURABILITY,
          qty: stack.qty,
        };
      } else {
        items[stack.itemId] = { ...existing, qty: existing.qty + stack.qty };
      }
    }
    repos.economy.saveCharacter({ ...wallet, gold, items });
    return {
      ok: true,
      value: { gold, keys: items.key?.qty ?? 0, regionLevel, stacks: opened.value },
    };
  }

  /** Artifact 11 §9.3. The same counts `openChest` checks and does not export. */
  const CHEST_KEY_COST: Record<ChestTier, number> = { common: 0, rare: 1, epic: 2 };

  function chestGrade(itemId: string): GradeId {
    if (itemId === 'gear_epic' || itemId === 'unique_component') {
      return itemId === 'unique_component' ? 'unique' : 'epic';
    }
    if (itemId === 'gear_rare') {
      return 'rare';
    }
    return 'common';
  }

  function chestSeed(characterId: string, nowMs: number): number {
    let hash = nowMs >>> 0;
    for (let index = 0; index < characterId.length; index += 1) {
      hash = Math.imul(hash ^ characterId.charCodeAt(index), 0x5bd1e995);
    }
    return hash >>> 0;
  }

  /**
   * Artifact 13. NPC price is 3/2 of the catalog base. A unique is refused.
   * Catalog rows name a grade and no item level, so the level passed here is 1.
   * A price on the request is ignored.
   */
  function buyNpc(body: Record<string, unknown>): { ok: boolean; code?: string; value?: unknown } {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    if (characterId.length === 0 || itemId.length === 0) {
      return { ok: false, code: 'item' };
    }
    const item = catalog.items.find((row) => row.id === itemId);
    if (item?.grade === undefined) {
      return { ok: false, code: 'item' };
    }
    const unique = item.grade === 'unique' || item.uniqueProfile !== undefined;
    const quoted = buyFromNpc(1, item.grade, unique);
    if (!quoted.ok) {
      return { ok: false, code: quoted.code };
    }
    const wallet =
      repos.economy.getCharacter(characterId) ??
      newEconomyCharacter({ characterId, side: 'light', gold: 0 });
    if (wallet.gold < quoted.value) {
      return { ok: false, code: 'gold' };
    }
    const items = { ...wallet.items };
    const existing = items[itemId];
    items[itemId] =
      existing === undefined
        ? {
            itemId,
            level: 1,
            grade: item.grade,
            unique,
            durability: STARTING_DURABILITY,
            qty: 1,
          }
        : { ...existing, qty: existing.qty + 1 };
    const gold = wallet.gold - quoted.value;
    repos.economy.saveCharacter({ ...wallet, gold, items });
    return { ok: true, value: { gold, price: quoted.value, itemId } };
  }

  function regionLevelOf(characterId: string): number {
    const entity = simWorld.entities.find((row) => row.id === characterId);
    const nodeId = entity?.nodeId ?? entity?.bindNodeId;
    const node =
      catalog.world.nodes.find((row) => row.id === nodeId) ??
      catalog.world.sites?.find((row) => row.id === nodeId);
    const region = catalog.world.regions.find((row) => row.id === node?.regionId);
    return region?.levelMin ?? 1;
  }

  function noteWarBlow(attackerId: string, targetId: string): void {
    const attacker = simWorld.entities.find((entity) => entity.id === attackerId);
    const target = simWorld.entities.find((entity) => entity.id === targetId);
    if (attacker?.monsterId !== undefined || target?.monsterId !== undefined) {
      return;
    }
    const nodeId = target?.nodeId ?? attacker?.nodeId;
    if (nodeId === undefined) {
      return;
    }
    const now = clock.now();
    const live = openWars.some(
      (war) =>
        war.cityId === nodeId &&
        war.startsAtMs <= now &&
        warPhase(Math.max(0, now - war.startsAtMs)) !== 'closed',
    );
    if (!live) {
      return;
    }
    warBlows.set(nodeId, (warBlows.get(nodeId) ?? 0) + 1);
  }

  async function section11For(guildId: string, next: WarStamp | null) {
    const guild = await repos.guilds.findGuild(guildId);
    const leaderId = guild?.leaderId ?? '';
    const held = officeHeldAt.get(leaderId);
    const lastOfficeMs = held !== undefined && held.guildId !== guildId ? held.atMs : null;
    const carriers = new Map<string, string[]>();
    const ballots: { voterId: string; ai: boolean; carrierOnline: boolean }[] = [];
    for (const memberId of guild?.memberIds ?? []) {
      const record = await repos.characters.findById(memberId);
      if (record?.controller !== 'bot') {
        continue;
      }
      const bots = carriers.get(record.accountId) ?? [];
      bots.push(memberId);
      carriers.set(record.accountId, bots);
    }
    for (const ballot of storedBallots(guildId)) {
      const record = await repos.characters.findById(ballot.voterId);
      const entity = simWorld.entities.find((row) => row.id === ballot.voterId);
      ballots.push({
        voterId: ballot.voterId,
        ai: record?.controller === 'bot',
        carrierOnline: entity !== undefined && entity.phase === 'online' && entity.carrierOffline !== true,
      });
    }
    const now = clock.now();
    const portals = captures.flatMap((hold) => {
      if (!hold.won || hold.guildId === null || hold.wonAtMs === undefined) {
        return [];
      }
      const warActive = openWars.some(
        (war) =>
          war.cityId === hold.cityId &&
          war.startsAtMs <= now &&
          warPhase(Math.max(0, now - war.startsAtMs)) !== 'closed',
      );
      return [{ cityId: hold.cityId, blockedForMs: Math.max(0, now - hold.wonAtMs), warActive }];
    });
    const reviewed = reviewSection11({
      nowMs: now,
      lastOfficeMs,
      history: warHistory,
      next,
      portals,
      ballots,
      carriers: [...carriers.entries()].map(([carrierId, botIds]) => ({ carrierId, botIds })),
      withdrawalsLogged: bankLog.length,
    });
    abuse = {
      reasons: reviewed.reasons,
      frozen: [...frozenGuilds],
      portalsLifted: reviewed.portalsLifted,
      vote: reviewed.vote,
      multibox: reviewed.multibox,
      altGuild: reviewed.altGuild,
    };
    if (reviewed.freezeRewards && next !== null) {
      frozenGuilds.add(next.attackerGuildId);
      const existing = rewardFreezes.find((row) => row.guildId === next.attackerGuildId);
      if (existing === undefined) {
        rewardFreezes.push({ guildId: next.attackerGuildId, atMs: now, reviewedAtMs: null });
      } else {
        existing.atMs = now;
      }
      noteCreationBan(leaderId, 'collusion', now + COLLUSION_BAN_MS);
      for (const memberId of next.roster) {
        noteCreationBan(memberId, 'collusion', now + COLLUSION_BAN_MS);
      }
      abuse = { ...abuse, frozen: [...frozenGuilds] };
    }
    if (reviewed.multibox === 'carrier') {
      for (const bots of carriers.values()) {
        for (const botId of bots) {
          noteCreationBan(botId, 'alt_guild', null);
        }
      }
    }
    return reviewed;
  }

  function confirmFounders(body: Record<string, unknown>): { ok: boolean; code?: string } {
    const members = Array.isArray(body.members) ? body.members : [];
    const founders: { id: string; confirmed: boolean }[] = [];
    for (const member of members) {
      if (typeof member !== 'object' || member === null || !('id' in member)) {
        continue;
      }
      const row = member as { id?: unknown; confirmed?: unknown };
      if (typeof row.id !== 'string' || row.id.length === 0) {
        continue;
      }
      founders.push({ id: row.id, confirmed: row.confirmed === true });
    }
    const confirmed = foundersConfirmed(founders);
    if (!confirmed.ok) {
      return { ok: false, code: confirmed.code };
    }
    return { ok: true };
  }

  function registerAtHall(initiatorId: string, claimed: string | undefined): { ok: boolean; code?: string } {
    const nodeId = characterNode(initiatorId);
    const node =
      nodeId === undefined ? undefined : simWorld.geography?.nodes.find((row) => row.id === nodeId);
    const kind = node?.kind ?? '';
    const graphPlace = node?.place;
    if (claimed !== undefined && graphPlace !== claimed) {
      return { ok: false, code: 'place' };
    }
    const place =
      graphPlace === 'hall' || graphPlace === 'registrar' ? graphPlace : kind === 'city' ? 'city' : '';
    if (place !== 'hall' && place !== 'registrar' && place !== 'city') {
      return { ok: false, code: 'place' };
    }
    const registered = registrationPlace({ nodeKind: 'city', place });
    if (!registered.ok) {
      return { ok: false, code: registered.code };
    }
    return { ok: true };
  }

  function screenGuildCreate(body: Record<string, unknown>): { ok: boolean; code?: string } {
    const name = typeof body.name === 'string' ? body.name : '';
    const members = Array.isArray(body.members) ? body.members : [];
    const founders: string[] = [];
    for (const member of members) {
      if (typeof member !== 'object' || member === null || !('id' in member)) {
        continue;
      }
      const id = (member as { id?: unknown }).id;
      if (typeof id === 'string' && id.length > 0) {
        founders.push(id);
      }
    }
    const screened = screenCharter({
      name,
      blacklist: GUILD_NAME_BLACKLIST,
      nowMs: clock.now(),
      founders: founders.map((id) => ({
        id,
        lastOfficeMs: previousOffice(id),
        inOffice: founderInOffice(id),
        ban: activeCreationBan(id),
      })),
    });
    if (!screened.ok) {
      return { ok: false, code: screened.code };
    }
    return { ok: true };
  }

  function banFounder(
    body: Record<string, unknown>,
  ): { ok: boolean; code?: string; value?: unknown } {
    const reviewerId = typeof body.reviewerId === 'string' ? body.reviewerId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const kind = typeof body.kind === 'string' ? body.kind : '';
    const role = staffRoles.get(reviewerId);
    if (role === undefined || characterId.length === 0) {
      return { ok: false, code: 'rank' };
    }
    const applied = applyCreationBan({ role, kind, nowMs: clock.now() });
    if (!applied.ok) {
      return { ok: false, code: applied.code };
    }
    noteCreationBan(characterId, applied.value.kind, applied.value.untilMs);
    return { ok: true, value: { characterId, kind: applied.value.kind, untilMs: applied.value.untilMs } };
  }

  async function reviewDeclaredWar(attackerGuildId: string, cityId: string): Promise<{ ok: boolean; code?: string }> {
    settledReviewed.delete(cityId);
    const stamp: WarStamp = {
      attackerGuildId,
      ownerGuildId: cityOwner(cityId),
      cityId,
      atMs: clock.now(),
      roster: [],
      blows: 0,
      elapsedMs: 0,
      heldMs: 0,
      result: 'declared',
    };
    const reviewed = await section11For(attackerGuildId, stamp);
    warHistory = [...warHistory, stamp];
    if (reviewed.multibox === 'carrier') {
      abuse = { ...abuse, multibox: 'carrier' };
    }
    return { ok: true };
  }

  async function guildCarriers(guildId: string): Promise<{ carrierId: string; botIds: string[] }[]> {
    const guild = await repos.guilds.findGuild(guildId);
    const carriers = new Map<string, string[]>();
    for (const memberId of guild?.memberIds ?? []) {
      const record = await repos.characters.findById(memberId);
      if (record?.controller !== 'bot') {
        continue;
      }
      const bots = carriers.get(record.accountId) ?? [];
      bots.push(memberId);
      carriers.set(record.accountId, bots);
    }
    return [...carriers.entries()].map(([carrierId, botIds]) => ({ carrierId, botIds }));
  }

  function storedBallots(guildId: string): { voterId: string }[] {
    const rows: { voterId: string }[] = [];
    const leader = leaderPolls.get(guildId);
    if (leader !== undefined) {
      for (const ballot of leader.ballots) {
        rows.push({ voterId: ballot.voterId });
      }
    }
    const motion = internalPolls.get(guildId);
    if (motion !== undefined) {
      for (const ballot of motion.ballots) {
        rows.push({ voterId: ballot.voterId });
      }
    }
    return rows;
  }

  async function leadershipBlocked(characterId: string): Promise<boolean> {
    const posts = await leadershipPosts(characterId, '');
    const allowed = aiLeadership({ ai: posts.ai, rank: 'leader', posts: posts.count });
    return !allowed.ok;
  }

  async function carriersBlockedIds(memberIds: readonly string[]): Promise<boolean> {
    const carriers = new Map<string, string[]>();
    for (const memberId of memberIds) {
      const record = await repos.characters.findById(memberId);
      if (record?.controller !== 'bot') {
        continue;
      }
      const bots = carriers.get(record.accountId) ?? [];
      bots.push(memberId);
      carriers.set(record.accountId, bots);
    }
    const reviewed = reviewSection11({
      nowMs: clock.now(),
      lastOfficeMs: null,
      history: [],
      next: null,
      portals: [],
      ballots: [],
      carriers: [...carriers.entries()].map(([carrierId, botIds]) => ({ carrierId, botIds })),
      withdrawalsLogged: 0,
    });
    if (reviewed.multibox !== 'carrier') {
      return false;
    }
    abuse = { ...abuse, multibox: 'carrier' };
    return true;
  }

  /** Section 11 multibox, before a war row is saved or the bank is charged. */
  async function carrierBlocked(guildId: string): Promise<boolean> {
    const reviewed = reviewSection11({
      nowMs: clock.now(),
      lastOfficeMs: null,
      history: [],
      next: null,
      portals: [],
      ballots: [],
      carriers: await guildCarriers(guildId),
      withdrawalsLogged: 0,
    });
    if (reviewed.multibox !== 'carrier') {
      return false;
    }
    abuse = { ...abuse, multibox: 'carrier' };
    return true;
  }

  async function reviewNewSettlements(): Promise<void> {
    for (const hold of captures) {
      if (hold.settled !== true || settledReviewed.has(hold.cityId)) {
        continue;
      }
      settledReviewed.add(hold.cityId);
      const war = [...openWars].reverse().find((row) => row.cityId === hold.cityId);
      if (war === undefined) {
        continue;
      }
      const stamp: WarStamp = {
        attackerGuildId: war.attackerGuildId,
        ownerGuildId: hold.ownerGuildId ?? null,
        cityId: hold.cityId,
        atMs: clock.now(),
        roster: [...(warRosters.get(war.id) ?? [])],
        blows: warBlows.get(hold.cityId) ?? 0,
        elapsedMs: Math.max(0, clock.now() - war.startsAtMs),
        heldMs: hold.heldMs,
        result: hold.drawEndedAtMs !== undefined ? 'draw' : 'win',
      };
      await section11For(war.attackerGuildId, stamp);
      warHistory = [...warHistory, stamp];
      if (stamp.result === 'win' || stamp.result === 'draw') {
        settledEvents.push({
          atMs: stamp.atMs,
          elapsedMs: stamp.elapsedMs,
          participants: stamp.roster.length,
          result: stamp.result,
        });
      }
    }
  }

  function postCoalition(
    body: Record<string, unknown>,
  ): { ok: boolean; code?: string; value?: unknown } {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const guildId = guildOf.get(characterId);
    if (guildId === undefined || text.length === 0) {
      return { ok: false, code: 'invalid' };
    }
    const channel = coalitionChannel(pacts, guildId, clock.now());
    if (channel === null) {
      return { ok: false, code: 'channel' };
    }
    const pactId = pacts.find((row) => row.kind === 'coalition' && row.guildIds.includes(guildId))?.id ?? '';
    const message = { pactId, guildId, characterId, text, atMs: clock.now() };
    diplomacy = [...diplomacy, message];
    return { ok: true, value: message };
  }

  function guardRows(): { cityId: string; remaining: number }[] {
    const counts = new Map<string, number>();
    for (const entity of simWorld.entities) {
      if (entity.cityGuard === undefined || entity.hp <= 0 || entity.phase === 'downed') {
        continue;
      }
      counts.set(entity.cityGuard, (counts.get(entity.cityGuard) ?? 0) + 1);
    }
    return [...counts.entries()].map(([cityId, remaining]) => ({ cityId, remaining }));
  }

  function presentGuilds(): { cityId: string; guildId: string; mercenary?: boolean }[] {
    return simWorld.entities.flatMap((entity) => {
      if (
        entity.monsterId !== undefined ||
        entity.phase !== 'online' ||
        entity.hp <= 0 ||
        entity.guildId === undefined ||
        entity.nodeId === undefined
      ) {
        return [];
      }
      const mercenary = mercenaries.some(
        (row) => row.status === 'open' && row.mercenaryId === entity.id,
      );
      return [{ cityId: entity.nodeId, guildId: entity.guildId, ...(mercenary ? { mercenary: true } : {}) }];
    });
  }

  function presentNodes(): { nodeId: string; guildId: string }[] {
    return simWorld.entities.flatMap((entity) => {
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
    });
  }

  function rememberCharacter(accountId: string, characterId: string): void {
    if (accountId.length > 0) {
      accountByCharacter.set(characterId, accountId);
    }
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

  async function setCharterEmblem(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const characterId =
      typeof body.characterId === 'string'
        ? body.characterId
        : typeof body.voterId === 'string'
          ? body.voterId
          : '';
    const emblem = typeof body.emblem === 'string' ? body.emblem : '';
    const description = typeof body.description === 'string' ? body.description : undefined;
    if (guildId.length === 0 || characterId.length === 0 || emblem.length === 0) {
      return { ok: false, code: 'member' };
    }
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null || !guild.memberIds.includes(characterId)) {
      return { ok: false, code: 'member' };
    }
    const rank = rankRecord(guildId)[characterId];
    if (rank !== 'leader' && rank !== 'council') {
      return { ok: false, code: 'rank' };
    }
    const poll = leaderPolls.get(guildId);
    if (poll !== undefined && !poll.closed) {
      poll.emblem = emblem;
      if (description !== undefined) {
        poll.description = description;
      }
      return { ok: true, value: { stored: false, emblem, description: poll.description } };
    }
    await repos.guilds.saveGuild({
      ...guild,
      emblem,
      ...(description !== undefined ? { description } : {}),
    });
    return { ok: true, value: { stored: true, emblem, description: description ?? guild.description } };
  }

  function openLeaderPoll(guildId: string, emblem = '', description = ''): void {
    if (leaderPolls.has(guildId)) {
      const poll = leaderPolls.get(guildId);
      if (poll !== undefined && !poll.closed) {
        if (emblem.length > 0) {
          poll.emblem = emblem;
        }
        if (description.length > 0) {
          poll.description = description;
        }
      }
      return;
    }
    leaderPolls.set(guildId, {
      guildId,
      openedAtMs: clock.now(),
      ballots: [],
      tieAtMs: null,
      revoteUsed: false,
      closed: false,
      emblem,
      description,
    });
  }

  async function finishLeaderPoll(
    guildId: string,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guild = await repos.guilds.findGuild(guildId);
    const poll = leaderPolls.get(guildId);
    if (guild === null || poll === undefined) {
      return { ok: false, code: 'member' };
    }
    if (poll.closed) {
      return { ok: false, code: 'closed' };
    }
    const revote =
      poll.tieAtMs !== null && !poll.revoteUsed && clock.now() >= poll.tieAtMs + REVOTE_MS;
    if (revote) {
      poll.revoteUsed = true;
    }
    const ranks = rankRecord(guildId);
    let eligible = 0;
    for (const id of guild.memberIds) {
      if (ranks[id] !== 'novice') {
        eligible += 1;
      }
    }
    const elected = castLeaderVote({
      memberIds: guild.memberIds,
      ballots: poll.ballots,
      revote,
      rng: voteRng,
      ranks,
    });
    if (!elected.ok) {
      return { ok: false, code: elected.code };
    }
    if (elected.value.status === 'tie') {
      if (poll.tieAtMs === null) {
        poll.tieAtMs = clock.now();
      }
      return { ok: true, value: { status: 'tie', candidateIds: elected.value.candidateIds, revote: true } };
    }
    if (!voteQuorum(poll.ballots.length, eligible)) {
      return { ok: true, value: { status: 'open', quorum: false, leaderId: elected.value.leaderId } };
    }
    const posts = await leadershipPosts(elected.value.leaderId, guildId);
    const allowed = aiLeadership({ ai: posts.ai, rank: 'leader', posts: posts.count });
    if (!allowed.ok) {
      return { ok: false, code: allowed.code };
    }
    poll.closed = true;
    await repos.guilds.saveGuild({
      ...guild,
      leaderId: elected.value.leaderId,
      emblem: poll.emblem,
      description: poll.description,
    });
    seatFounders(guildId, elected.value.leaderId, guild.memberIds);
    return { ok: true, value: elected.value };
  }

  async function castLeaderBallot(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const voterId =
      typeof body.voterId === 'string'
        ? body.voterId
        : typeof body.characterId === 'string'
          ? body.characterId
          : '';
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId : '';
    if (typeof body.choice === 'string') {
      return castInternalBallot(body);
    }
    if (guildId.length === 0 || voterId.length === 0 || candidateId.length === 0) {
      return { ok: false, code: 'member' };
    }
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null || !guild.memberIds.includes(voterId)) {
      return { ok: false, code: 'member' };
    }
    let poll = leaderPolls.get(guildId);
    if (poll === undefined) {
      openLeaderPoll(guildId);
      poll = leaderPolls.get(guildId);
    }
    if (poll === undefined || poll.closed) {
      return { ok: false, code: 'closed' };
    }
    if (poll.ballots.some((row) => row.voterId === voterId)) {
      return { ok: false, code: 'stuffed' };
    }
    const record = await repos.characters.findById(voterId);
    if (record?.controller === 'bot') {
      const entity = simWorld.entities.find((row) => row.id === voterId);
      const online = entity !== undefined && entity.phase === 'online' && entity.carrierOffline !== true;
      if (!online) {
        return { ok: false, code: 'offline' };
      }
    }
    poll.ballots.push({ voterId, candidateId });
    const finished = await finishLeaderPoll(guildId);
    if (!finished.ok) {
      poll.ballots.pop();
    }
    return finished;
  }

  async function resolveLeaderPolls(): Promise<void> {
    for (const poll of leaderPolls.values()) {
      if (poll.closed || poll.tieAtMs === null || clock.now() < poll.tieAtMs + REVOTE_MS) {
        continue;
      }
      await finishLeaderPoll(poll.guildId);
    }
  }

  async function castInternalBallot(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const voterId =
      typeof body.voterId === 'string'
        ? body.voterId
        : typeof body.characterId === 'string'
          ? body.characterId
          : '';
    const choice = typeof body.choice === 'string' ? body.choice : '';
    if (guildId.length === 0 || voterId.length === 0 || choice.length === 0) {
      return { ok: false, code: 'member' };
    }
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null || !guild.memberIds.includes(voterId)) {
      return { ok: false, code: 'member' };
    }
    let poll = internalPolls.get(guildId);
    if (poll === undefined) {
      poll = { guildId, openedAtMs: clock.now(), ballots: [], closed: false, result: null };
      internalPolls.set(guildId, poll);
    }
    if (poll.closed) {
      return { ok: true, value: poll.result ?? { status: 'closed' } };
    }
    if (clock.now() >= poll.openedAtMs + INTERNAL_VOTE_MS) {
      await resolveInternalPolls();
      return { ok: true, value: poll.result ?? { status: 'window' } };
    }
    if (poll.ballots.some((row) => row.voterId === voterId)) {
      return { ok: false, code: 'stuffed' };
    }
    const record = await repos.characters.findById(voterId);
    if (record?.controller === 'bot') {
      const entity = simWorld.entities.find((row) => row.id === voterId);
      const online = entity !== undefined && entity.phase === 'online' && entity.carrierOffline !== true;
      if (!online) {
        return { ok: false, code: 'offline' };
      }
    }
    const ranks = rankRecord(guildId);
    if (ranks[voterId] === 'novice') {
      return { ok: false, code: 'rank' };
    }
    poll.ballots.push({ voterId, choice });
    return { ok: true, value: { status: 'open', closesAtMs: poll.openedAtMs + INTERNAL_VOTE_MS } };
  }

  async function resolveInternalPolls(): Promise<void> {
    const now = clock.now();
    for (const poll of internalPolls.values()) {
      if (poll.closed || now < poll.openedAtMs + INTERNAL_VOTE_MS) {
        continue;
      }
      const guild = await repos.guilds.findGuild(poll.guildId);
      if (guild === null) {
        poll.closed = true;
        poll.result = { status: 'failed' };
        continue;
      }
      const ranks = rankRecord(poll.guildId);
      const council: { id: string; seniorityMs: number }[] = [];
      for (const [id, rank] of guildRanks.get(poll.guildId) ?? []) {
        if (rank !== 'council') {
          continue;
        }
        const seated = memberStats.get(poll.guildId)?.get(id)?.seatedAtMs ?? now;
        council.push({ id, seniorityMs: Math.max(0, now - seated) });
      }
      const seen = leaderSeenAt.get(poll.guildId) ?? poll.openedAtMs;
      const closed = closeInternalVote({
        openedAtMs: poll.openedAtMs,
        nowMs: now,
        ballots: poll.ballots,
        eligibleIds: guild.memberIds,
        ranks,
        leaderId: guild.leaderId,
        leaderAbsentMs: Math.max(0, now - seen),
        council,
      });
      poll.closed = true;
      poll.result = closed.ok ? closed.value : { status: closed.code };
    }
  }

  function onlineMember(characterId: string): boolean {
    const entity = simWorld.entities.find((row) => row.id === characterId && row.monsterId === undefined);
    return entity !== undefined && entity.phase === 'online' && entity.carrierOffline !== true;
  }

  function noteMemberPresence(deltaMs: number): void {
    const now = clock.now();
    for (const [guildId, table] of guildRanks) {
      for (const [id, rank] of table) {
        if (!onlineMember(id)) {
          continue;
        }
        if (rank === 'leader') {
          leaderSeenAt.set(guildId, now);
        }
        const stats = memberStats.get(guildId)?.get(id);
        if (stats !== undefined) {
          stats.activityMs += deltaMs;
        }
      }
    }
  }

  async function relieveAbsentLeaders(deltaMs: number): Promise<void> {
    noteMemberPresence(deltaMs);
    const now = clock.now();
    const guilds = await repos.guilds.listGuilds();
    for (const guild of guilds) {
      if (guild.memberIds.length === 0) {
        continue;
      }
      const seen = leaderSeenAt.get(guild.id);
      if (seen === undefined) {
        leaderSeenAt.set(guild.id, now);
        continue;
      }
      const council: { id: string; seniorityMs: number; activity: number }[] = [];
      const officers: { id: string; seniorityMs: number }[] = [];
      for (const [id, rank] of guildRanks.get(guild.id) ?? []) {
        const stats = memberStats.get(guild.id)?.get(id);
        const seniorityMs = Math.max(0, now - (stats?.seatedAtMs ?? now));
        const posts = await leadershipPosts(id, guild.id);
        const allowed = aiLeadership({ ai: posts.ai, rank: 'leader', posts: posts.count });
        if (!allowed.ok) {
          continue;
        }
        if (rank === 'council') {
          council.push({ id, seniorityMs, activity: stats?.activityMs ?? 0 });
        } else if (rank === 'officer') {
          officers.push({ id, seniorityMs });
        }
      }
      const next = succeedAbsentLeader({
        absentMs: Math.max(0, now - seen),
        council,
        officers,
      });
      if (next.action === 'wait') {
        continue;
      }
      if (next.action === 'transfer') {
        await transferLeader(guild.id, next.toId);
        continue;
      }
      await payDissolution(guild.id, 'absence');
    }
  }

  async function transferLeader(guildId: string, toId: string): Promise<void> {
    const guild = await repos.guilds.findGuild(guildId);
    const table = guildRanks.get(guildId);
    if (guild === null || table === undefined || !table.has(toId)) {
      return;
    }
    const previous = guild.leaderId;
    if (table.get(previous) === 'leader') {
      table.set(previous, 'veteran');
      endOffice(previous);
      rememberSeat(guildId, previous, clock.now());
    }
    table.set(toId, 'leader');
    rememberSeat(guildId, toId, clock.now());
    rememberOffice(toId, guildId);
    leaderSeenAt.set(guildId, clock.now());
    await repos.guilds.saveGuild({ ...guild, leaderId: toId });
  }

  async function joinGuild(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const actorId = typeof body.actorId === 'string' ? body.actorId : '';
    if (guildId.length === 0 || characterId.length === 0 || actorId.length === 0) {
      return { ok: false, code: 'member' };
    }
    const guild = await repos.guilds.findGuild(guildId);
    const actorRank = memberRank(guildId, actorId);
    if (guild === null || actorRank === null) {
      return { ok: false, code: 'member' };
    }
    if (guild.memberIds.includes(characterId) || guildOf.has(characterId)) {
      return { ok: false, code: 'member' };
    }
    const day = dayIndex(clock.now());
    const inviteKey = `${guildId}\0${actorId}`;
    const invites = invitesToday.get(inviteKey);
    const invitesCount = invites !== undefined && invites.day === day ? invites.count : 0;
    const invited = officerInvite({ rank: actorRank, invitesToday: invitesCount });
    if (!invited.ok) {
      return { ok: false, code: invited.code };
    }
    if (await carriersBlockedIds([...guild.memberIds, characterId])) {
      return { ok: false, code: 'carrier' };
    }
    const table = guildRanks.get(guildId) ?? new Map<string, GuildRank>();
    table.set(characterId, 'novice');
    guildRanks.set(guildId, table);
    rememberSeat(guildId, characterId, clock.now());
    await repos.guilds.saveGuild({ ...guild, memberIds: [...guild.memberIds, characterId] });
    assignGuild(characterId, guildId);
    if (actorRank === 'officer') {
      invitesToday.set(inviteKey, { day, count: invitesCount + 1 });
    }
    return { ok: true, value: { guildId, characterId, rank: 'novice' } };
  }

  function councilSize(guildId: string): number {
    let count = 0;
    for (const rank of guildRanks.get(guildId)?.values() ?? []) {
      if (rank === 'council') {
        count += 1;
      }
    }
    return count;
  }

  async function depositGuild(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const amount = body.amount;
    if (guildId.length === 0 || characterId.length === 0 || typeof amount !== 'number') {
      return { ok: false, code: 'member' };
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return { ok: false, code: 'gold' };
    }
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null || !guild.memberIds.includes(characterId)) {
      return { ok: false, code: 'member' };
    }
    const wallet = repos.economy.getCharacter(characterId);
    if (wallet === null || wallet.gold < amount) {
      return { ok: false, code: 'gold' };
    }
    const deposited = depositBank(guild.bank, amount);
    const entered = amount - deposited.overflow;
    if (entered <= 0) {
      return { ok: false, code: 'limit' };
    }
    repos.economy.saveCharacter({ ...wallet, gold: wallet.gold - entered });
    await repos.guilds.saveGuild({ ...guild, bank: deposited.bank });
    const table = contributions.get(guildId) ?? new Map<string, number>();
    table.set(characterId, (table.get(characterId) ?? 0) + entered);
    contributions.set(guildId, table);
    noteTurnover(entered);
    const resources = typeof body.resources === 'number' ? body.resources : 0;
    const itemQtyIn = typeof body.itemQty === 'number' ? body.itemQty : 0;
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    let resourceContributed = 0;
    let itemContributed = 0;
    if (Number.isInteger(resources) && resources > 0) {
      const resourceId = typeof body.resourceId === 'string' ? body.resourceId : 'metal';
      const stacks = await repos.materials.read(characterId);
      const held = stacks[resourceId] ?? 0;
      if (held < resources) {
        return { ok: false, code: 'gold' };
      }
      const committed = await repos.materials.commit(characterId, stacks, {
        ...stacks,
        [resourceId]: held - resources,
      });
      if (!committed) {
        return { ok: false, code: 'gold' };
      }
      guildResources.set(guildId, (guildResources.get(guildId) ?? 0) + resources);
      const ledger = resourceLedgers.get(guildId) ?? new Map<string, number>();
      ledger.set(characterId, (ledger.get(characterId) ?? 0) + resources);
      resourceLedgers.set(guildId, ledger);
      noteKind(resourceKindLedgers, guildId, resourceId, characterId, resources);
      const stocks = resourceKindStock.get(guildId) ?? new Map<string, number>();
      stocks.set(resourceId, (stocks.get(resourceId) ?? 0) + resources);
      resourceKindStock.set(guildId, stocks);
      resourceContributed = resources;
    }
    if (Number.isInteger(itemQtyIn) && itemQtyIn > 0 && itemId.length > 0) {
      const slots = guildItems.get(guildId) ?? [];
      const adding = slots.some((stack) => stack.itemId === itemId) ? 0 : 1;
      const reserved = reserveItemSlots(slots.length, adding);
      if (!reserved.ok) {
        return { ok: false, code: reserved.code };
      }
      const walletNow = repos.economy.getCharacter(characterId);
      const heldItem = walletNow?.items[itemId];
      if (walletNow === null || heldItem === undefined || heldItem.qty < itemQtyIn) {
        return { ok: false, code: 'gold' };
      }
      const items = { ...walletNow.items };
      const nextQty = heldItem.qty - itemQtyIn;
      if (nextQty === 0) {
        delete items[itemId];
      } else {
        items[itemId] = { ...heldItem, qty: nextQty };
      }
      repos.economy.saveCharacter({ ...walletNow, items });
      const bankStacks = slots.map((stack) => ({ ...stack }));
      const existing = bankStacks.find((stack) => stack.itemId === itemId);
      if (existing === undefined) {
        bankStacks.push({ itemId, qty: itemQtyIn });
      } else {
        existing.qty += itemQtyIn;
      }
      guildItems.set(guildId, bankStacks);
      const ledger = itemLedgers.get(guildId) ?? new Map<string, number>();
      ledger.set(characterId, (ledger.get(characterId) ?? 0) + itemQtyIn);
      itemLedgers.set(guildId, ledger);
      noteKind(itemKindLedgers, guildId, itemId, characterId, itemQtyIn);
      itemContributed = itemQtyIn;
    }
    logBank(guildId, characterId, entered, 'deposit', {
      ...(resourceContributed > 0
        ? {
            resourceId: typeof body.resourceId === 'string' ? body.resourceId : 'metal',
            resourceAmount: resourceContributed,
          }
        : {}),
      ...(itemContributed > 0 && itemId.length > 0 ? { itemId, itemAmount: itemContributed } : {}),
    });
    return {
      ok: true,
      value: { bank: deposited.bank, contributed: entered, resources: resourceContributed, items: itemContributed },
    };
  }

  async function dissolveGuild(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    if (guildId.length === 0 || characterId.length === 0) {
      return { ok: false, code: 'member' };
    }
    const guild = await repos.guilds.findGuild(guildId);
    const rank = memberRank(guildId, characterId);
    if (guild === null || rank === null) {
      return { ok: false, code: 'member' };
    }
    const poll = dissolvePolls.get(guildId) ?? { leaderConsent: false, councilIds: new Set<string>() };
    if (rank === 'leader') {
      poll.leaderConsent = true;
    } else if (rank === 'council') {
      poll.councilIds.add(characterId);
    } else {
      return { ok: false, code: 'rank' };
    }
    dissolvePolls.set(guildId, poll);
    const decision = canDissolve({
      leaderConsent: poll.leaderConsent,
      councilConsents: poll.councilIds.size,
      councilVotesFor: poll.councilIds.size,
      councilSize: councilSize(guildId),
    });
    if (!decision.ok) {
      return { ok: false, code: decision.code };
    }
    const paid = await payDissolution(guildId, decision.value.by);
    if (paid === null) {
      return { ok: false, code: 'member' };
    }
    return { ok: true, value: paid };
  }

  function ledgerRows(table: Map<string, Map<string, number>>, guildId: string): { id: string; contributed: number }[] {
    return [...(table.get(guildId)?.entries() ?? [])]
      .filter((row) => row[1] > 0)
      .map(([id, contributed]) => ({ id, contributed }));
  }

  function noteKind(
    table: Map<string, Map<string, Map<string, number>>>,
    guildId: string,
    kind: string,
    characterId: string,
    amount: number,
  ): void {
    const kinds = table.get(guildId) ?? new Map<string, Map<string, number>>();
    const pile = kinds.get(kind) ?? new Map<string, number>();
    pile.set(characterId, (pile.get(characterId) ?? 0) + amount);
    kinds.set(kind, pile);
    table.set(guildId, kinds);
  }

  function resourceKindPiles(guildId: string): { kind: string; amount: number; ledger: { id: string; contributed: number }[] }[] {
    const stocks = resourceKindStock.get(guildId) ?? new Map<string, number>();
    const ledgers = resourceKindLedgers.get(guildId) ?? new Map<string, Map<string, number>>();
    return [...stocks.entries()]
      .filter((row) => row[1] > 0)
      .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
      .map(([kind, amount]) => ({
        kind,
        amount,
        ledger: ledgerRows(new Map([[guildId, ledgers.get(kind) ?? new Map()]]), guildId),
      }));
  }

  function itemKindPiles(guildId: string): { kind: string; amount: number; ledger: { id: string; contributed: number }[] }[] {
    const ledgers = itemKindLedgers.get(guildId) ?? new Map<string, Map<string, number>>();
    return (guildItems.get(guildId) ?? [])
      .filter((stack) => stack.qty > 0)
      .map((stack) => ({
        kind: stack.itemId,
        amount: stack.qty,
        ledger: ledgerRows(new Map([[guildId, ledgers.get(stack.itemId) ?? new Map()]]), guildId),
      }));
  }

  async function payDissolution(
    guildId: string,
    by: string,
  ): Promise<{
    by: string;
    shares: { id: string; gold: number }[];
    void: number;
    resources: { id: string; amount: number }[];
    items: { id: string; amount: number }[];
    resourceKinds: { kind: string; shares: { id: string; amount: number }[]; void: number }[];
    itemKinds: { kind: string; shares: { id: string; amount: number }[]; void: number }[];
  } | null> {
    const guild = await repos.guilds.findGuild(guildId);
    if (guild === null) {
      return null;
    }
    const goldRows = ledgerRows(contributions, guildId);
    const resourceRows = ledgerRows(resourceLedgers, guildId);
    const itemRows = ledgerRows(itemLedgers, guildId);
    const shares = dissolveShares(guild.bank, goldRows);
    const holdings = dissolveHoldings({
      gold: guild.bank,
      resources: guildResources.get(guildId) ?? 0,
      items: itemQty(guildId),
      goldLedger: goldRows,
      resourceLedger: resourceRows,
      itemLedger: itemRows,
    });
    for (const share of shares.shares) {
      if (share.gold > 0) {
        creditGold(share.id, share.gold);
      }
    }
    const resourceKinds = dissolveKindPiles(resourceKindPiles(guildId));
    const itemKinds = dissolveKindPiles(itemKindPiles(guildId));
    for (const pile of resourceKinds) {
      for (const share of pile.shares) {
        if (share.amount > 0) {
          await creditMaterial(share.id, pile.kind, share.amount);
        }
      }
      dissolutionResourceVoid += pile.void;
    }
    for (const pile of itemKinds) {
      for (const share of pile.shares) {
        if (share.amount > 0) {
          giveItems(share.id, [{ itemId: pile.kind, qty: share.amount }]);
        }
      }
      dissolutionItemVoid += pile.void;
    }
    dissolutionVoid += shares.void;
    noteTurnover(guild.bank);
    logBank(guildId, '', guild.bank, 'dissolve');
    await repos.guilds.saveGuild({ ...guild, bank: 0, memberIds: [] });
    for (const memberId of guild.memberIds) {
      guildOf.delete(memberId);
    }
    guildRanks.delete(guildId);
    memberStats.delete(guildId);
    contributions.delete(guildId);
    resourceLedgers.delete(guildId);
    itemLedgers.delete(guildId);
    resourceKindLedgers.delete(guildId);
    itemKindLedgers.delete(guildId);
    resourceKindStock.delete(guildId);
    guildResources.delete(guildId);
    guildItems.delete(guildId);
    dissolvePolls.delete(guildId);
    leaderSeenAt.delete(guildId);
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((entity) => {
        if (entity.guildId !== guildId) {
          return entity;
        }
        const next = { ...entity };
        delete next.guildId;
        return next;
      }),
    };
    return {
      by,
      shares: shares.shares,
      void: shares.void,
      resources: holdings.resources.shares,
      items: holdings.items.shares,
      resourceKinds,
      itemKinds,
    };
  }

  function strikeNode(body: Record<string, unknown>): { ok: boolean; code?: string; value?: unknown } {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const nodeId = typeof body.nodeId === 'string' ? body.nodeId : '';
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    const node = resourceAt(nodeId);
    const rank = memberRank(guildId, characterId);
    if (node === undefined || rank === null) {
      return { ok: false, code: rank === null ? 'rank' : 'owner' };
    }
    const struck = strikeNodeFlag({ node, guildId, rank });
    if (!struck.ok) {
      return { ok: false, code: struck.code };
    }
    resourceNodes = resourceNodes.map((row) => (row.nodeId === nodeId ? struck.value.node : row));
    if (struck.value.pocketed > 0) {
      creditGuildVault(guildId, struck.value.pocketed);
    }
    return { ok: true, value: { nodeId, pocketed: struck.value.pocketed, guildId: null } };
  }

  async function holdWithdrawal(input: {
    guildId: string;
    characterId: string;
    rank: GuildRank;
    amount: number;
    leaderConfirm: boolean;
    councilConfirms: number;
    councilVote: boolean;
    goldWithdrawnToday?: number;
    resourceStock?: number;
    resourceAmount?: number;
    resourceId?: string;
    resourcesWithdrawnToday?: number;
    itemSlots?: number;
    itemAmount?: number;
    itemsWithdrawnToday?: number;
  }): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guild = await repos.guilds.findGuild(input.guildId);
    if (guild === null) {
      return { ok: false, code: 'member' };
    }
    const checked = withdraw({
      rank: input.rank,
      bank: guild.bank,
      amount: input.amount,
      leaderConfirm: input.leaderConfirm,
      councilConfirms: input.councilConfirms,
      councilVote: input.councilVote,
      ...(input.goldWithdrawnToday !== undefined ? { goldWithdrawnToday: input.goldWithdrawnToday } : {}),
      ...(input.resourceStock !== undefined ? { resourceStock: input.resourceStock } : {}),
      ...(input.resourceAmount !== undefined ? { resourceAmount: input.resourceAmount } : {}),
      ...(input.resourcesWithdrawnToday !== undefined
        ? { resourcesWithdrawnToday: input.resourcesWithdrawnToday }
        : {}),
      ...(input.itemSlots !== undefined ? { itemSlots: input.itemSlots } : {}),
      ...(input.itemAmount !== undefined ? { itemAmount: input.itemAmount } : {}),
      ...(input.itemsWithdrawnToday !== undefined ? { itemsWithdrawnToday: input.itemsWithdrawnToday } : {}),
    });
    if (!checked.ok) {
      return { ok: false, code: checked.code };
    }
    heldWithdrawals = [
      ...heldWithdrawals,
      {
        guildId: input.guildId,
        characterId: input.characterId,
        amount: checked.value.amount,
        resourceAmount: input.resourceAmount ?? 0,
        resourceId: input.resourceId ?? 'metal',
        itemAmount: input.itemAmount ?? 0,
        rank: input.rank,
        leaderConfirm: input.leaderConfirm,
        councilConfirms: input.councilConfirms,
        councilVote: input.councilVote,
      },
    ];
    logWithdrawal(input.guildId, input.characterId, checked.value.amount);
    return { ok: true, value: { held: true, bank: guild.bank, amount: checked.value.amount } };
  }

  async function releaseHeldWithdrawals(guildId: string): Promise<void> {
    const pending = heldWithdrawals.filter((row) => row.guildId === guildId);
    heldWithdrawals = heldWithdrawals.filter((row) => row.guildId !== guildId);
    for (const row of pending) {
      const taken = await guild.service.withdraw({
        guildId,
        rank: row.rank,
        amount: row.amount,
        leaderConfirm: row.leaderConfirm,
        councilConfirms: row.councilConfirms,
        councilVote: row.councilVote,
        resourceAmount: row.resourceAmount,
        itemAmount: row.itemAmount,
        resourceStock: guildResources.get(guildId) ?? 0,
        itemSlots: guildItems.get(guildId)?.length ?? 0,
      });
      if (taken.ok) {
        noteTurnover(taken.value.amount);
        await creditWithdrawal({
          guildId,
          characterId: row.characterId,
          amount: taken.value.amount,
          resourceAmount: row.resourceAmount,
          resourceId: row.resourceId,
          itemAmount: row.itemAmount,
        });
      }
    }
  }

  async function inspectRewardFreezes(): Promise<void> {
    const now = clock.now();
    const still = [];
    for (const freeze of rewardFreezes) {
      if (!rewardFreezeEnds(freeze.atMs, now, freeze.reviewedAtMs)) {
        still.push(freeze);
        continue;
      }
      frozenGuilds.delete(freeze.guildId);
      await releaseHeldWithdrawals(freeze.guildId);
    }
    rewardFreezes = still;
    abuse = { ...abuse, frozen: [...frozenGuilds] };
  }

  /**
   * Artifact 17 §11. A moderator or administrator reviews the freeze.
   * The clock does not release it. A released hold is paid into the wallet.
   */
  async function reviewRewardFreeze(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; code?: string; value?: unknown }> {
    const guildId = typeof body.guildId === 'string' ? body.guildId : '';
    const reviewerId = typeof body.reviewerId === 'string' ? body.reviewerId : '';
    if (guildId.length === 0 || reviewerId.length === 0) {
      return { ok: false, code: 'rank' };
    }
    const freeze = rewardFreezes.find((row) => row.guildId === guildId);
    if (freeze === undefined || !frozenGuilds.has(guildId)) {
      return { ok: false, code: 'target' };
    }
    const role = staffRoles.get(reviewerId);
    if (role === undefined) {
      return { ok: false, code: 'rank' };
    }
    const accepted = acceptRewardReview({ role, frozenAtMs: freeze.atMs, nowMs: clock.now() });
    if (!accepted.ok) {
      return { ok: false, code: accepted.code };
    }
    freeze.reviewedAtMs = accepted.value.reviewedAtMs;
    frozenGuilds.delete(guildId);
    await releaseHeldWithdrawals(guildId);
    rewardFreezes = rewardFreezes.filter((row) => row.guildId !== guildId);
    abuse = { ...abuse, frozen: [...frozenGuilds] };
    return { ok: true, value: { guildId, reviewedAtMs: accepted.value.reviewedAtMs, released: true } };
  }

  function refreshPortalLifts(): void {
    const now = clock.now();
    const portals = captures.flatMap((hold) => {
      if (!hold.won || hold.guildId === null || hold.wonAtMs === undefined) {
        return [];
      }
      const warActive = openWars.some(
        (war) =>
          war.cityId === hold.cityId &&
          war.startsAtMs <= now &&
          warPhase(Math.max(0, now - war.startsAtMs)) !== 'closed',
      );
      return [{ cityId: hold.cityId, blockedForMs: Math.max(0, now - hold.wonAtMs), warActive }];
    });
    const reviewed = reviewSection11({
      nowMs: now,
      lastOfficeMs: null,
      history: warHistory,
      next: null,
      portals,
      ballots: [],
      carriers: [],
      withdrawalsLogged: bankLog.length,
    });
    abuse = { ...abuse, portalsLifted: reviewed.portalsLifted };
  }

  async function tickOnce(): Promise<void> {
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
    const warCities = openWars
      .filter((war) => {
        if (war.startsAtMs > clock.now()) {
          return false;
        }
        const phase = warPhase(Math.max(0, clock.now() - war.startsAtMs));
        return phase === 'assault' || phase === 'finish';
      })
      .map((war) => war.cityId);
    const warFronts = openWarFronts();
    simWorld = {
      ...simWorld,
      seasonSpawn,
      holidayCraft: live.craftBonus,
      holidayKeeper: live.keeperBonus,
      invasion: live.invasion,
      seasonResource: live.resourceBonus,
      warCities,
      warFronts,
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
        commands.push(guardAllies(simCommand));
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
    stampGuildDoctrines();
    simWorld = { ...stepTick(simWorld, commands, rng), ...eventFields };
    spawnNeutralGuards();
    captures = tickCaptures({
      holds: captures,
      wars: openWars.map((war) => ({
        id: war.id,
        cityId: war.cityId,
        startsAtMs: war.startsAtMs,
        attackerGuildId: war.attackerGuildId,
      })),
      nowMs: simWorld.nowMs,
      deltaMs: SIM_TICK_MS,
      present: presentGuilds(),
      contenders: contenderRows(),
      guardsRemaining: guardRows(),
    });
    applyOwnedCityFees();
    const ownersBeforeTick = new Map(resourceNodes.map((node) => [node.nodeId, node.guildId] as const));
    const tickedNodes = tickResourceNodes({
      nodes: resourceNodes,
      present: presentNodes(),
      deltaMs: SIM_TICK_MS,
    });
    resourceNodes = tickedNodes.nodes;
    noteNodeCaptures(ownersBeforeTick);
    applyNodeSeizure(tickedNodes.seized);
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
      const victimGone = !simWorld.entities.some((entity) => entity.id === corpse.victimId);
      if (victimGone && corpse.killerId !== undefined) {
        bus.emit('combat.hit', {
          attackerId: corpse.killerId,
          targetId: corpse.victimId,
          damage: 1,
          subject: monsterOf.get(corpse.victimId) ?? killer?.monsterId ?? corpse.victimId,
          playerAttacker: killer !== undefined && killer.monsterId === undefined,
        });
      }
      if (corpse.killerId !== undefined) {
        noteWarBlow(corpse.killerId, corpse.victimId);
      }
      if (killer !== undefined && killer.monsterId === undefined) {
        void reportKind(killer.id, 'kill', monsterOf.get(corpse.victimId));
        if (corpse.victimId.includes(':elite') || corpse.victimId.includes('keeper')) {
          void note(killer.id, 'capture');
        }
      }
    }
    for (const entity of simWorld.entities) {
      const previous = beforeHp.get(entity.id);
      if (previous === undefined || entity.hp >= previous) {
        continue;
      }
      if (entity.monsterId === undefined && entity.progress !== undefined && entity.hp > 0) {
        void note(entity.id, 'survive');
      }
      if (entity.lastAttackerId === undefined) {
        continue;
      }
      const attacker = simWorld.entities.find((row) => row.id === entity.lastAttackerId);
      const subject = attacker?.monsterId ?? entity.monsterId ?? entity.id;
      bus.emit('combat.hit', {
        attackerId: entity.lastAttackerId,
        targetId: entity.id,
        damage: previous - entity.hp,
        subject,
        playerAttacker: attacker !== undefined && attacker.monsterId === undefined,
      });
      noteWarBlow(entity.lastAttackerId, entity.id);
    }
    for (const command of commands) {
      const rejected = simWorld.rejections.some((row) => row.entityId === commandActor(command));
      if (rejected) {
        continue;
      }
      if (command.type === 'loot') {
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
    await tickContracts(SIM_TICK_MS);
    await tickGuildQuests(SIM_TICK_MS);
    await tickVassalTithes();
    tickAllianceBreaks();
    tickVassalReleases();
    noteSuzerainPresence();
    await penalizeAbsentSuzerains();
    noteWarRoster();
    await reviewNewSettlements();
    await resolveLeaderPolls();
    await resolveInternalPolls();
    await relieveAbsentLeaders(SIM_TICK_MS);
    await inspectRewardFreezes();
    await reviewCheatStrikes();
    await finishPurifications();
    await advanceLanguage(SIM_TICK_MS);
    await advanceForgetting(SIM_TICK_MS);
    clockPhase = dayPhase(clock.now());
    refreshPortalLifts();
    await sampleBalance();
  }

  function simSnapshot(): {
    kind: 'rift-sim';
    world: SimWorld;
    wallets: EconomyCharacter[];
    captures: CaptureHold[];
    resourceNodes: ResourceNode[];
    pacts: StoredPact[];
    mercenaries: StoredMercenary[];
    patrols: StoredPatrol[];
    guildQuests: StoredPatrol[];
    contenders: { warId: string; guildId: string }[];
    guildVaults: { guildId: string; amount: number }[];
  } {
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
      resourceNodes,
      pacts,
      mercenaries,
      patrols,
      guildQuests,
      contenders,
      guildVaults: [...guildVaults.entries()].map(([guildId, amount]) => ({ guildId, amount })),
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
      restoreDiplomacy(loaded);
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
    await restoreGuilds();
  }

  function restoreDiplomacy(loaded: object): void {
    if (!('resourceNodes' in loaded) || !Array.isArray(loaded.resourceNodes)) {
      return;
    }
    const nodes: ResourceNode[] = [];
    for (const row of loaded.resourceNodes) {
      if (typeof row !== 'object' || row === null || !('nodeId' in row)) {
        continue;
      }
      const node = row as ResourceNode;
      if (typeof node.nodeId === 'string') {
        nodes.push(node);
      }
    }
    if (nodes.length > 0) {
      resourceNodes = nodes;
    }
    if ('pacts' in loaded && Array.isArray(loaded.pacts)) {
      pacts = loaded.pacts as StoredPact[];
    }
    if ('mercenaries' in loaded && Array.isArray(loaded.mercenaries)) {
      mercenaries = (loaded.mercenaries as StoredMercenary[]).map((row) => ({
        ...row,
        destinationId: row.destinationId ?? null,
        trail: row.trail ?? [row.nodeId],
      }));
    }
    if ('patrols' in loaded && Array.isArray(loaded.patrols)) {
      patrols = loaded.patrols as StoredPatrol[];
    }
    if ('guildQuests' in loaded && Array.isArray(loaded.guildQuests)) {
      guildQuests = loaded.guildQuests as StoredPatrol[];
    }
    if ('contenders' in loaded && Array.isArray(loaded.contenders)) {
      contenders = loaded.contenders.flatMap((row) => {
        if (typeof row !== 'object' || row === null) {
          return [];
        }
        const stored = row as { warId?: unknown; guildId?: unknown };
        if (typeof stored.warId === 'string' && typeof stored.guildId === 'string') {
          return [{ warId: stored.warId, guildId: stored.guildId }];
        }
        return [];
      });
    }
    if ('guildVaults' in loaded && Array.isArray(loaded.guildVaults)) {
      guildVaults.clear();
      for (const row of loaded.guildVaults) {
        if (typeof row !== 'object' || row === null) {
          continue;
        }
        const vault = row as { guildId?: unknown; amount?: unknown };
        if (typeof vault.guildId === 'string' && typeof vault.amount === 'number') {
          guildVaults.set(vault.guildId, vault.amount);
        }
      }
    }
  }

  async function restoreGuilds(): Promise<void> {
    const guilds = await repos.guilds.listGuilds();
    const memberGuild = new Map<string, string>();
    for (const guild of guilds) {
      for (const memberId of guild.memberIds) {
        memberGuild.set(memberId, guild.id);
      }
      if (!guildRanks.has(guild.id)) {
        seatFounders(guild.id, guild.leaderId, guild.memberIds);
      }
    }
    guildOf.clear();
    for (const [memberId, guildId] of memberGuild) {
      guildOf.set(memberId, guildId);
    }
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((entity) => {
        if (entity.monsterId !== undefined) {
          return entity;
        }
        const guildId = memberGuild.get(entity.id);
        if (guildId === undefined) {
          if (entity.guildId === undefined) {
            return entity;
          }
          const next = { ...entity };
          delete next.guildId;
          return next;
        }
        return { ...entity, guildId };
      }),
    };
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
      dayPhase: clockPhase,
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
        nodeId: entity.nodeId ?? null,
      })),
      mapNodes: graph.nodes.map((node) => ({ id: node.id, kind: node.kind })),
      recipes: catalog.recipes.map((recipe) => ({ id: recipe.id })),
      tax: economy.service.taxLedger(),
      keeper: parked === null ? null : { id: parked.monsterId, level: parked.level, phases: parked.phaseCount },
      captures,
      resourceNodes,
      guildVaults: [...guildVaults.entries()].map(([guildId, amount]) => ({ guildId, amount })),
      pacts,
      allies: allyMarkers(),
      defenses: defenseDuties,
      suzerainFlags,
      abuse,
      balance: balanceReport,
      dissolutionVoid,
      motions: [...internalPolls.values()].map((poll) => ({
        guildId: poll.guildId,
        closed: poll.closed,
        result: poll.result,
        ballots: poll.ballots.length,
      })),
      musterCamps: (simWorld.geography?.nodes ?? [])
        .filter((node) => node.id.startsWith('muster:'))
        .map((node) => node.id),
      diplomacy,
      mercenaries,
      patrols,
      guildQuests: guildQuests.filter((quest) => focus?.guildId === quest.guildId),
      bankOperations: focus?.guildId === undefined ? [] : bankOperations(focus.guildId),
      contracts: visibleContracts(focus),
      contenders,
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
        const standing = entity.reputation?.[objective.id];
        const scene = reputationScene(branchScene(quest, objective, standing), standing);
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

  function place(playerId: string, nodeId: string): void {
    const home = simWorld.geography?.nodes.find((node) => node.id === nodeId);
    if (home === undefined) {
      return;
    }
    const cell = { x: home.x, y: home.y };
    if (!simWorld.entities.some((entity) => entity.id === playerId)) {
      enterWorld(playerId, nodeId);
      return;
    }
    simWorld = {
      ...simWorld,
      entities: simWorld.entities.map((entity) =>
        entity.id === playerId ? { ...entity, nodeId, cell } : entity,
      ),
    };
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

  function accountIdFromCommandFrame(raw: string): string | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const token = (parsed as { accessToken?: unknown }).accessToken;
    if (typeof token !== 'string') {
      return null;
    }
    const access = auth.service.verifyAccess(token);
    return access.ok ? access.value.accountId : null;
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
    place,
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
    creditMaterial,
    async materialQty(characterId: string, resourceId: string) {
      const stacks = await repos.materials.read(characterId);
      return stacks[resourceId] ?? 0;
    },
    heldItemQty(characterId: string, itemId: string) {
      return repos.economy.getCharacter(characterId)?.items[itemId]?.qty ?? 0;
    },
    appointStaff(characterId: string, role: 'moderator' | 'admin') {
      staffRoles.set(characterId, role);
    },
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
    skipMs,
    characterNode,
    cityService,
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
          const raw = messageText(data);
          const result = handleMessage(raw, {
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
          if (!result.ok && result.cheatStrike === true) {
            const accountId = accountIdFromCommandFrame(raw);
            if (accountId !== null) {
              recordCheatStrike(accountId, clock.now());
            }
          }
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
      enterWorld: composition.enterWorld,
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
    const standing = composition.characterNode(body.sellerId);
    const cityId = body.cityId ?? standing ?? null;
    if (cityId !== null) {
      const access = composition.cityService(body.sellerId, cityId, 'auction');
      if (!access.ok && access.code !== 'missing') {
        return reply.code(400).send({ code: access.code });
      }
    }
    const offered = economy.service.offerAuction({
      ...body,
      cityId,
    });
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
  { path: '/storage', action: 'storage' },
  { path: '/library', action: 'library' },
  { path: '/bind', action: 'bind' },
  { path: '/service/grant', action: 'service_grant' },
  { path: '/pact', action: 'pact' },
  { path: '/coalition', action: 'coalition_say' },
  { path: '/pact/notice', action: 'pact_notice' },
  { path: '/pact/break', action: 'pact_break' },
  { path: '/pact/renew', action: 'pact_renew' },
  { path: '/war/contend', action: 'war_contend' },
  { path: '/mercenary', action: 'mercenary' },
  { path: '/patrol', action: 'patrol' },
  { path: '/guild/quest', action: 'guild_quest' },
  { path: '/war', action: 'guild_war' },
  { path: '/guild/withdraw', action: 'guild_withdraw' },
  { path: '/guild/rank', action: 'guild_rank' },
  { path: '/guild/vote', action: 'guild_vote' },
  { path: '/guild/emblem', action: 'guild_emblem' },
  { path: '/guild/join', action: 'guild_join' },
  { path: '/guild/dissolve', action: 'guild_dissolve' },
  { path: '/guild/deposit', action: 'guild_deposit' },
  { path: '/guild/review', action: 'guild_review' },
  { path: '/guild/ban', action: 'guild_ban' },
  { path: '/guild/doctrine', action: 'guild_doctrine' },
  { path: '/guild/bank', action: 'guild_bank' },
  { path: '/contract', action: 'contract_post' },
  { path: '/report', action: 'report_file' },
  { path: '/report/judge', action: 'report_judge' },
  { path: '/chat', action: 'chat_say' },
  { path: '/cheat/strike', action: 'cheat_strike' },
  { path: '/ancient/encode', action: 'ancient_encode' },
  { path: '/ancient/decipher', action: 'ancient_decipher' },
  { path: '/coalition/bank', action: 'coalition_bank' },
  { path: '/purify', action: 'purify' },
  { path: '/relic/remove', action: 'relic_remove' },
  { path: '/party/match', action: 'party_match' },
  { path: '/language/teach', action: 'language_teach' },
  { path: '/path/use', action: 'path_use' },
  { path: '/path/recover', action: 'path_recover' },
  { path: '/core/unequip', action: 'core_unequip' },
  { path: '/purity/break', action: 'purity_break' },
  { path: '/chest', action: 'chest_open' },
  { path: '/npc/buy', action: 'npc_buy' },
  { path: '/node/strike', action: 'node_strike' },
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
      ...(node.place === 'hall' || node.place === 'registrar' ? { place: node.place } : {}),
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
      cityId: string | null;
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
    cityId: typeof record.cityId === 'string' && record.cityId.length > 0 ? record.cityId : null,
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
