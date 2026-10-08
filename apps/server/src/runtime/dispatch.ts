import { nnUsed, type Program, type BuildState } from '@rift/domain/build';
import { sellerProceeds } from '@rift/domain/economy';
import { WAR_GOLD } from '@rift/domain/guild';
import { NODE_IDS, type NodeId, type ToolId, type ToolKind } from '@rift/domain/gathering';
import type { GuildRank } from '@rift/domain/guild';
import type { KeeperKind } from '@rift/domain/hack';
import type { GradeId } from '@rift/domain/items';
import type { RelicState, RelicSubtype } from '@rift/domain/relics';
import { socketCount } from '@rift/domain/relics';
import type { QuestObjectiveKind } from '@rift/domain/quests';
import { derive, emptyPoints } from '@rift/domain/stats';
import { choiceReputation } from '../sim/reputation';
import { weatheredGatherSeconds } from '../sim/weather';
import type { BuildService } from '../modules/build/service';
import type { CraftService } from '../modules/craft/types';
import type { DungeonService } from '../modules/dungeon/types';
import type { EconomyService } from '../modules/economy/types';
import type { GatheringService } from '../modules/gathering/service';
import type { GuildService as GuildServiceApi } from '../modules/guild/types';
import type { HackService } from '../modules/hack/service';
import type { QuestService } from '../modules/quest/types';
import type { SocialService } from '../modules/social/types';
import type { WikiService } from '../modules/wiki/service';

export interface LiveResult {
  ok: boolean;
  code?: string;
  value?: unknown;
}

export interface LivePorts {
  now(): number;
  gathering: GatheringService;
  hack: HackService;
  wiki: WikiService;
  build: BuildService;
  dungeon: DungeonService;
  quest: QuestService;
  guild: GuildServiceApi;
  economy: EconomyService;
  craft: CraftService;
  ensureCrafter(characterId: string): Promise<void>;
  social: SocialService;
  enterDungeon(
    characterId: string,
    instanceId: string,
    layout: {
      rooms: { id: number; x: number; y: number }[];
      edges: [number, number][];
      entranceId: number;
    },
  ): void;
  leaveDungeon(characterId: string): void;
  note(characterId: string, kind: QuestObjectiveKind, subject?: string): Promise<void>;
  applyChoice(characterId: string, questId: string | undefined, choiceId: string): Promise<boolean>;
  shiftReputation(characterId: string, npcId: string, event: 'quest' | 'fail' | 'attack' | 'gift'): number;
  portalTo(characterId: string, toNodeId: string): Promise<LiveResult>;
  askPortal(characterId: string, toNodeId: string): Promise<LiveResult>;
  grantPortal(guildId: string, cityId: string, characterId: string): Promise<LiveResult>;
  assignGuild(characterId: string, guildId: string): void;
  creditService(characterId: string, cost: number): Promise<number>;
  setOwnedCityFee(guildId: string, cityId: string, fee: number): Promise<LiveResult>;
  resourceTax(characterId: string): number;
  resourceAccess(characterId: string): { ok: true } | { ok: false; code: string };
  addNodeChest(characterId: string, amount: number): number;
  setResourceTax(guildId: string, nodeId: string, taxPercent: number, characterId: string): LiveResult;
  setResourceAccess(guildId: string, nodeId: string, category: string, access: string): LiveResult;
  grantResource(guildId: string, nodeId: string, characterId: string): LiveResult;
  creditGuildBank(guildId: string, amount: number): Promise<void>;
  auctionLot(lotId: string): { cityId?: string | null } | null;
  cityOwner(cityId: string): string | null;
  characterNode(characterId: string): string | undefined;
  cityService(characterId: string, cityId: string, service: string): LiveResult;
  rentStorage(characterId: string, cityId: string, slots: number, days: number): Promise<LiveResult>;
  useLibrary(characterId: string, cityId: string): Promise<LiveResult>;
  bindCity(characterId: string, cityId: string): Promise<LiveResult>;
  grantService(guildId: string, cityId: string, service: string, characterId: string): LiveResult;
  postPact(body: Record<string, unknown>): Promise<LiveResult>;
  noticePact(body: Record<string, unknown>): Promise<LiveResult>;
  renewPact(body: Record<string, unknown>): Promise<LiveResult>;
  breakPact(body: Record<string, unknown>): Promise<LiveResult>;
  registerContender(body: Record<string, unknown>): Promise<LiveResult>;
  postMercenaryContract(body: Record<string, unknown>): Promise<LiveResult>;
  postPatrol(body: Record<string, unknown>): Promise<LiveResult>;
  memberRank(guildId: string, characterId: string): GuildRank | null;
  vassalMayWar(guildId: string, suzerainConsent: boolean): LiveResult;
  warLimits(cityId: string, guildId: string): {
    cityCapturedAtMs: number | null;
    drawEndedAtMs: number | null;
    lastDeclaredAtMs: number | null;
  };
  rememberDeclaration(guildId: string): void;
  declareNeutralCity(body: Record<string, unknown>): Promise<LiveResult>;
  rememberDefense(cityId: string, warId: string): { suzerainId: string; vassalId: string }[];
  previousOffice(characterId: string): number | null;
  reviewDeclaredWar(attackerGuildId: string, cityId: string): Promise<{ ok: boolean; code?: string }>;
  rewardsFrozen(guildId: string): boolean;
  carrierBlocked(guildId: string): Promise<boolean>;
  noteDeclaredWar(): void;
  noteTurnover(amount: number): void;
  sampleBalance(): Promise<void>;
  logWithdrawal(guildId: string, characterId: string, amount: number): void;
  holdWithdrawal(input: {
    guildId: string;
    characterId: string;
    rank: GuildRank;
    amount: number;
    leaderConfirm: boolean;
    councilConfirms: number;
    councilVote: boolean;
  }): Promise<LiveResult>;
  openLeaderPoll(guildId: string): void;
  castLeaderBallot(body: Record<string, unknown>): Promise<LiveResult>;
  dissolveGuild(body: Record<string, unknown>): Promise<LiveResult>;
  depositGuild(body: Record<string, unknown>): Promise<LiveResult>;
  strikeNode(body: Record<string, unknown>): LiveResult;
  postCoalition(body: Record<string, unknown>): LiveResult;
  seatFounders(guildId: string, leaderId: string, memberIds: readonly string[]): void;
  seatMember(guildId: string, actorId: string, memberId: string, rank: string): LiveResult;
  placeQuest(characterId: string, questId: string): Promise<void>;
  loadBuild(characterId: string): Promise<BuildState>;
  relicGrade(characterId: string): Promise<GradeId>;
  saveBuild(characterId: string, state: BuildState, relicGrade: GradeId, echoIds: string[]): Promise<void>;
  setNeural(characterId: string, nn: number, nnLimit: number): void;
  walletGold(characterId: string): number;
  setGold(characterId: string, gold: number): void;
  weatherSpeed(): number;
  seasonBonus(): boolean;
  addEncounter(monsterId: string): boolean;
  enterEncounter(characterId: string): boolean;
}

const TOOLS: readonly ToolId[] = ['none', 'basic', 'advanced', 'master'];
const TOOL_KINDS: readonly ToolKind[] = ['pick', 'axe', 'knife', 'scalpel', 'manipulator', 'flask'];
const KEEPERS: readonly KeeperKind[] = ['patrol', 'guard', 'destroyer', 'unique'];
const RELICS: readonly RelicSubtype[] = ['spore', 'culture', 'symbiont', 'plate', 'mechanism', 'crystal'];

const LIVE_ACTIONS = new Set([
  'gather',
  'hack_start',
  'hack_guess',
  'wiki',
  'relic_install',
  'echo_install',
  'path_learn',
  'core_equip',
  'dungeon_enter',
  'dungeon_leave',
  'craft_start',
  'craft_complete',
  'trade_offer',
  'trade_accept',
  'quest_accept',
  'quest_turnin',
  'guild_create',
  'auction_bid',
  'mail',
  'title_grant',
  'encounter',
  'encounter_enter',
  'dialogue',
  'portal',
  'portal_ask',
  'portal_grant',
  'repair',
  'city_fee',
  'node_tax',
  'node_access',
  'node_grant',
  'storage',
  'library',
  'bind',
  'service_grant',
  'pact',
  'pact_notice',
  'pact_break',
  'pact_renew',
  'war_contend',
  'mercenary',
  'patrol',
  'guild_war',
  'guild_withdraw',
  'guild_rank',
  'guild_vote',
  'guild_dissolve',
  'guild_deposit',
  'node_strike',
  'coalition_say',
]);

export function isLiveAction(action: string): boolean {
  return LIVE_ACTIONS.has(action);
}

export async function runLive(
  action: string,
  body: Record<string, unknown>,
  ports: LivePorts,
): Promise<LiveResult> {
  switch (action) {
    case 'gather':
      return gather(body, ports);
    case 'hack_start':
      return hackStart(body, ports);
    case 'hack_guess':
      return hackGuess(body, ports);
    case 'wiki':
      return wiki(body, ports);
    case 'relic_install':
      return relic(body, ports);
    case 'echo_install':
      return echo(body, ports);
    case 'path_learn':
      return path(body, ports);
    case 'core_equip':
      return core(body, ports);
    case 'dungeon_enter':
      return dungeon(body, ports);
    case 'dungeon_leave':
      return dungeonLeave(body, ports);
    case 'craft_start':
      return craftStart(body, ports);
    case 'craft_complete':
      return craftComplete(body, ports);
    case 'trade_offer':
      return tradeOffer(body, ports);
    case 'trade_accept':
      return tradeAccept(body, ports);
    case 'quest_accept':
      return questAccept(body, ports);
    case 'quest_turnin':
      return questTurnIn(body, ports);
    case 'guild_create':
      return guildCreate(body, ports);
    case 'auction_bid':
      return auctionBid(body, ports);
    case 'mail':
      return mail(body, ports);
    case 'title_grant':
      return title(body, ports);
    case 'encounter':
      return encounter(body, ports);
    case 'encounter_enter':
      return encounterEnter(body, ports);
    case 'dialogue':
      return dialogue(body, ports);
    case 'portal':
      return portal(body, ports);
    case 'portal_ask':
      return portalAsk(body, ports);
    case 'portal_grant':
      return portalGrant(body, ports);
    case 'repair':
      return repair(body, ports);
    case 'city_fee':
      return cityFee(body, ports);
    case 'node_tax':
      return nodeTax(body, ports);
    case 'node_access':
      return nodeAccess(body, ports);
    case 'node_grant':
      return nodeGrant(body, ports);
    case 'storage':
      return storage(body, ports);
    case 'library':
      return library(body, ports);
    case 'bind':
      return bindCity(body, ports);
    case 'service_grant':
      return serviceGrant(body, ports);
    case 'pact':
      return ports.postPact(body);
    case 'pact_notice':
      return ports.noticePact(body);
    case 'pact_break':
      return ports.breakPact(body);
    case 'pact_renew':
      return ports.renewPact(body);
    case 'war_contend':
      return ports.registerContender(body);
    case 'mercenary':
      return ports.postMercenaryContract(body);
    case 'patrol':
      return ports.postPatrol(body);
    case 'guild_war':
      return guildWar(body, ports);
    case 'guild_withdraw':
      return guildWithdraw(body, ports);
    case 'guild_rank':
      return guildRank(body, ports);
    case 'guild_vote':
      return ports.castLeaderBallot(body);
    case 'guild_dissolve':
      return ports.dissolveGuild(body);
    case 'guild_deposit':
      return ports.depositGuild(body);
    case 'node_strike':
      return ports.strikeNode(body);
    case 'coalition_say':
      return ports.postCoalition(body);
    default:
      return { ok: false, code: 'unknown' };
  }
}

async function gather(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const nodeId = text(body, 'nodeId');
  if (characterId === undefined || nodeId === undefined || !isNode(nodeId)) {
    return { ok: false, code: 'invalid' };
  }
  const gate = ports.resourceAccess(characterId);
  if (!gate.ok) {
    return { ok: false, code: gate.code };
  }
  const tool = enumOf(text(body, 'tool'), TOOLS) ?? 'basic';
  const toolKind = enumOf(text(body, 'toolKind'), TOOL_KINDS) ?? 'pick';
  const rolled = ports.gathering.gather({
    characterId,
    nodeId,
    nowMs: ports.now(),
    technique: numberOf(body.technique, 5),
    tool,
    toolKind,
    durability: numberOf(body.durability, 100),
    seasonBonus: ports.seasonBonus(),
    taxRate: ports.resourceTax(characterId),
  });
  if (!rolled.ok) {
    return { ok: false, code: rolled.code };
  }
  const chest = ports.addNodeChest(characterId, rolled.value.tax);
  const seconds = weatheredGatherSeconds(rolled.value.seconds, numberOf(body.technique, 5), tool, true, ports.weatherSpeed());
  return { ok: true, value: { ...rolled.value, seconds, chest } };
}

async function nodeTax(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const guildId = text(body, 'guildId');
  const nodeId = text(body, 'nodeId');
  if (guildId === undefined || nodeId === undefined || typeof body.taxPercent !== 'number') {
    return { ok: false, code: 'invalid' };
  }
  const characterId = text(body, 'characterId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  return ports.setResourceTax(guildId, nodeId, body.taxPercent, characterId);
}

async function nodeAccess(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const guildId = text(body, 'guildId');
  const nodeId = text(body, 'nodeId');
  const access = text(body, 'access');
  const category = text(body, 'category');
  if (guildId === undefined || nodeId === undefined || access === undefined || category === undefined) {
    return { ok: false, code: 'invalid' };
  }
  return ports.setResourceAccess(guildId, nodeId, category, access);
}

async function nodeGrant(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const guildId = text(body, 'guildId');
  const nodeId = text(body, 'nodeId');
  const characterId = text(body, 'characterId');
  if (guildId === undefined || nodeId === undefined || characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  return ports.grantResource(guildId, nodeId, characterId);
}

async function hackStart(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const kind = enumOf(text(body, 'kind'), KEEPERS) ?? 'patrol';
  const subject = text(body, 'subject') ?? text(body, 'objectiveId') ?? text(body, 'questId');
  const opened = ports.hack.start({
    characterId,
    kind,
    technique: numberOf(body.technique, 5),
    hasDeck: body.hasDeck !== false,
    nowMs: ports.now(),
    ...(subject !== undefined ? { subject } : {}),
  });
  if (!opened.ok) {
    return { ok: false, code: opened.code };
  }
  return { ok: true, value: { ...opened.value, password: ports.hack.view(characterId) } };
}

async function hackGuess(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const attempt = text(body, 'attempt');
  if (characterId === undefined || attempt === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const guessed = ports.hack.guess({ characterId, attempt, nowMs: ports.now() });
  if (!guessed.ok) {
    return { ok: false, code: guessed.code, value: ports.hack.view(characterId) };
  }
  return { ok: true, value: { ...guessed.value, password: ports.hack.view(characterId) } };
}

async function wiki(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const articleId = text(body, 'articleId') ?? 'barrier';
  const authorId = text(body, 'characterId') ?? text(body, 'entityId') ?? 'anon';
  const prose = text(body, 'text') ?? 'The Barrier stands at the edge of the world.';
  const written = ports.wiki.writeProse({
    articleId,
    articleSide: 'light',
    authorId,
    authorSide: 'light',
    text: prose,
  });
  if (!written.ok) {
    return { ok: false, code: written.code };
  }
  return { ok: true, value: written.value };
}

async function relic(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const subtype = enumOf(text(body, 'subtype'), RELICS) ?? 'spore';
  const grade = enumOf(text(body, 'grade'), GRADES) ?? 'common';
  const state = await ports.loadBuild(characterId);
  const installed = ports.build.installRelic({
    characterId,
    clean: state.clean,
    inCombat: state.inCombat,
    inCityOrHub: state.inCityOrHub,
    gold: ports.walletGold(characterId),
    subtype,
    nowMs: ports.now(),
    relic: relicOf(subtype, grade),
  });
  if (!installed.ok) {
    return { ok: false, code: installed.code };
  }
  const echoes = state.programs.filter((program) => program.kind === 'echo').length;
  const next = { ...state, relicSocketFree: Math.max(0, socketCount(grade) - echoes) };
  ports.setGold(characterId, installed.value.gold);
  await ports.saveBuild(characterId, next, grade, installed.value.relic.echoIds);
  return {
    ok: true,
    value: { gold: installed.value.gold, readyAtMs: installed.value.readyAtMs, sockets: next.relicSocketFree },
  };
}

async function echo(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const state = await ports.loadBuild(characterId);
  const installed = ports.build.installEcho({
    characterId,
    state,
    program: programOf('echo', text(body, 'templateId') ?? 'memory', gradeOf(body)),
  });
  if (!installed.ok) {
    return { ok: false, code: installed.code };
  }
  rememberNeural(characterId, installed.value.state, ports);
  await ports.saveBuild(
    characterId,
    installed.value.state,
    await ports.relicGrade(characterId),
    echoIdsOf(installed.value.state),
  );
  return {
    ok: true,
    value: {
      neuroshock: installed.value.neuroshock,
      programs: installed.value.state.programs.length,
      sockets: installed.value.state.relicSocketFree,
    },
  };
}

async function path(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const state = await ports.loadBuild(characterId);
  const learned = ports.build.learnPath({
    characterId,
    state,
    program: programOf('path', text(body, 'templateId') ?? 'ward', gradeOf(body)),
    gold: ports.walletGold(characterId),
    nowMs: ports.now(),
  });
  if (!learned.ok) {
    return { ok: false, code: learned.code };
  }
  ports.setGold(characterId, learned.value.gold);
  rememberNeural(characterId, learned.value.state, ports);
  await ports.saveBuild(
    characterId,
    learned.value.state,
    await ports.relicGrade(characterId),
    echoIdsOf(learned.value.state),
  );
  return {
    ok: true,
    value: {
      gold: learned.value.gold,
      readyAtMs: learned.value.readyAtMs,
      programs: learned.value.state.programs.length,
    },
  };
}

async function core(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const state = await ports.loadBuild(characterId);
  const equipped = ports.build.equipCore({
    characterId,
    state,
    core: {
      templateId: text(body, 'templateId') ?? 'heart',
      grade: coreGrade(body),
      implant: body.implant === true,
    },
    gold: ports.walletGold(characterId),
  });
  if (!equipped.ok) {
    return { ok: false, code: equipped.code };
  }
  rememberNeural(characterId, equipped.value, ports);
  await ports.saveBuild(
    characterId,
    equipped.value,
    await ports.relicGrade(characterId),
    echoIdsOf(equipped.value),
  );
  return { ok: true, value: { cores: equipped.value.cores.length } };
}

async function dungeon(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const place = text(body, 'nodeId') ?? 'light_dungeon';
  const questId = text(body, 'questId');
  const party = ports.social.partyOf(characterId);
  const partySize =
    typeof body.partySize === 'number' ? numberOf(body.partySize, 1) : (party?.members.length ?? 1);
  const entered = ports.dungeon.enter({
    characterId,
    nodeId: place,
    edgeId: text(body, 'edgeId') ?? 'edge_light__fort_humans',
    groupId: text(body, 'groupId') ?? party?.leaderId ?? characterId,
    nowMs: ports.now(),
    partySize,
  });
  if (!entered.ok) {
    return { ok: false, code: entered.code };
  }
  ports.enterDungeon(characterId, entered.value.instanceId, entered.value.layout);
  await ports.note(characterId, 'visit', questId ?? place);
  if (partySize > 1) {
    await ports.note(characterId, 'escort');
  }
  return {
    ok: true,
    value: {
      instanceId: entered.value.instanceId,
      roomId: entered.value.layout.entranceId,
      rooms: entered.value.layout.rooms.map((room) => ({ id: room.id, x: room.x, y: room.y })),
    },
  };
}

async function dungeonLeave(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  ports.leaveDungeon(characterId);
  return { ok: true, value: { left: true } };
}

async function craftStart(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const recipeId = text(body, 'recipeId');
  if (characterId === undefined || recipeId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  await ports.ensureCrafter(characterId);
  const started = await ports.craft.start({
    characterId,
    recipeId,
    itemLevel: numberOf(body.itemLevel, 1),
    accelerate: body.accelerate === true,
    nowMs: ports.now(),
  });
  if (!started.ok) {
    return { ok: false, code: started.code };
  }
  const cut = await ports.creditService(characterId, started.value.goldSpent);
  return { ok: true, value: { ...started.value, serviceCut: cut } };
}

async function craftComplete(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const jobId = text(body, 'jobId');
  if (characterId === undefined || jobId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const done = await ports.craft.complete(characterId, jobId, ports.now());
  if (!done.ok) {
    return { ok: false, code: done.code };
  }
  return { ok: true, value: done.value };
}

async function tradeOffer(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const counterpartyId = text(body, 'counterpartyId');
  if (characterId === undefined || counterpartyId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const offered = await ports.economy.offerTrade({
    characterId,
    counterpartyId,
    gold: numberOf(body.gold, 0),
    items: itemCounts(body.items),
  });
  if (!offered.ok) {
    return { ok: false, code: offered.code };
  }
  return { ok: true, value: offered.value };
}

async function tradeAccept(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const tradeId = text(body, 'tradeId');
  if (characterId === undefined || tradeId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const accepted = await ports.economy.acceptTrade(tradeId, characterId);
  if (!accepted.ok) {
    return { ok: false, code: accepted.code };
  }
  if (accepted.value === 'done') {
    await ports.note(characterId, 'trade');
  }
  return { ok: true, value: { status: accepted.value } };
}

function itemCounts(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const counts: Record<string, number> = {};
  for (const [id, qty] of Object.entries(value)) {
    if (typeof qty === 'number' && Number.isInteger(qty) && qty > 0) {
      counts[id] = qty;
    }
  }
  return counts;
}

async function questAccept(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const questId = text(body, 'questId');
  if (characterId === undefined || questId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const accepted = await ports.quest.accept(characterId, questId, ports.now());
  if (!accepted.ok) {
    return { ok: false, code: accepted.code };
  }
  await ports.placeQuest(characterId, questId);
  return { ok: true, value: { questId } };
}

async function questTurnIn(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const questId = text(body, 'questId');
  if (characterId === undefined || questId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const turned = await ports.quest.turnIn(characterId, questId);
  if (!turned.ok) {
    return { ok: false, code: turned.code };
  }
  return { ok: true, value: turned.value };
}

async function guildCreate(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const initiatorId = text(body, 'initiatorId');
  if (initiatorId !== undefined && body.lastOfficeMs === undefined) {
    const held = ports.previousOffice(initiatorId);
    if (held !== null) {
      body.lastOfficeMs = held;
    }
  }
  const created = await ports.guild.create(body);
  if (!created.ok) {
    return { ok: false, code: created.code };
  }
  if (Array.isArray(body.members)) {
    for (const member of body.members) {
      if (typeof member !== 'object' || member === null || !('id' in member)) {
        continue;
      }
      const id = (member as { id?: unknown }).id;
      if (typeof id === 'string' && id.length > 0) {
        ports.assignGuild(id, created.value.guildId);
      }
    }
  }
  const initiator = text(body, 'initiatorId');
  const leaderId = text(body, 'leaderId') ?? initiator;
  const memberIds = Array.isArray(body.members)
    ? body.members.flatMap((member) => {
        if (typeof member !== 'object' || member === null || !('id' in member)) {
          return [];
        }
        const id = (member as { id?: unknown }).id;
        return typeof id === 'string' && id.length > 0 ? [id] : [];
      })
    : [];
  if (leaderId !== undefined && memberIds.length > 0) {
    ports.seatFounders(created.value.guildId, leaderId, memberIds);
  }
  if (initiator !== undefined) {
    await ports.note(initiator, 'capture');
  }
  ports.openLeaderPoll(created.value.guildId);
  return { ok: true, value: created.value };
}

async function auctionBid(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const lotId = text(body, 'lotId');
  const bidderId = text(body, 'bidderId') ?? text(body, 'characterId');
  if (lotId === undefined || bidderId === undefined || typeof body.bid !== 'number') {
    return { ok: false, code: 'invalid' };
  }
  const lot = ports.auctionLot(lotId);
  const cityId = lot?.cityId ?? ports.characterNode(bidderId) ?? null;
  if (cityId !== null) {
    const access = ports.cityService(bidderId, cityId, 'auction');
    if (!access.ok && access.code !== 'missing') {
      return access;
    }
  }
  const bid = ports.economy.bidAuction({ lotId, bidderId, bid: body.bid });
  if (!bid.ok) {
    return { ok: false, code: bid.code };
  }
  let taxSink: 'guild' | 'void' | null = null;
  let guildTax = 0;
  let sinkTax = 0;
  if (bid.value.buyout) {
    const paid = sellerProceeds(bid.value.price);
    const owner = cityId === null ? null : ports.cityOwner(cityId);
    const frozen = owner !== null && ports.rewardsFrozen(owner);
    const credited = frozen ? 'void' : await ports.guild.creditTax({ amount: paid.tax, guildId: owner });
    ports.economy.recordAuctionTax({ amount: paid.tax, sink: credited });
    taxSink = credited;
    if (credited === 'guild') {
      guildTax = paid.tax;
    } else if (paid.tax > 0) {
      sinkTax = paid.tax;
    }
    await ports.note(bidderId, 'trade');
  }
  return {
    ok: true,
    value: { ...bid.value, taxSink, guildTax, sinkTax },
  };
}

async function mail(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const senderId = text(body, 'senderId') ?? text(body, 'characterId');
  const recipientId = text(body, 'recipientId');
  const message = text(body, 'text');
  if (senderId === undefined || recipientId === undefined || message === undefined) {
    return { ok: false, code: 'invalid' };
  }
  ports.social.register({ id: senderId, nodeId: text(body, 'nodeId') ?? 'fort_humans', language: 'common_light' });
  ports.social.register({ id: recipientId, nodeId: 'fort_humans', language: 'common_light' });
  const sent = await ports.social.say({
    senderId,
    channel: 'mail',
    text: message,
    subject: text(body, 'subject') ?? message.slice(0, 80),
    recipientId,
    nowMs: ports.now(),
  });
  if (!sent.ok) {
    return { ok: false, code: sent.code };
  }
  await ports.note(senderId, 'deliver');
  return { ok: true, value: sent.value };
}

async function title(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId');
  const titleId = text(body, 'titleId');
  if (characterId === undefined || titleId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  ports.social.register({ id: characterId, nodeId: 'fort_humans', language: 'common_light' });
  const granted = ports.social.grantTitle({ characterId, titleId });
  if (!granted.ok) {
    return { ok: false, code: granted.code };
  }
  return { ok: true, value: granted.value };
}

async function dialogue(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const choiceId = text(body, 'choiceId');
  if (characterId === undefined || choiceId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const stored = await ports.applyChoice(characterId, text(body, 'questId'), choiceId);
  if (!stored) {
    return { ok: false, code: 'inactive' };
  }
  const npcId = text(body, 'npcId');
  const reputation =
    npcId === undefined ? null : ports.shiftReputation(characterId, npcId, choiceReputation(choiceId));
  return { ok: true, value: { choiceId, questId: text(body, 'questId') ?? null, npcId, reputation } };
}

async function repair(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const itemId = text(body, 'itemId');
  if (characterId === undefined || itemId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const cityId = ports.characterNode(characterId);
  if (cityId !== undefined) {
    const access = ports.cityService(characterId, cityId, 'repair');
    if (!access.ok) {
      return access;
    }
  }
  const before = ports.walletGold(characterId);
  const repaired = await ports.economy.repair(characterId, itemId);
  if (!repaired.ok) {
    return { ok: false, code: repaired.code };
  }
  const spent = before - ports.walletGold(characterId);
  const cut = await ports.creditService(characterId, spent);
  return { ok: true, value: { ...repaired.value, serviceCut: cut } };
}

async function cityFee(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const guildId = text(body, 'guildId');
  const cityId = text(body, 'cityId');
  if (guildId === undefined || cityId === undefined || typeof body.fee !== 'number') {
    return { ok: false, code: 'invalid' };
  }
  return ports.setOwnedCityFee(guildId, cityId, body.fee);
}

async function portal(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const toNodeId = text(body, 'toNodeId');
  if (characterId === undefined || toNodeId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  return ports.portalTo(characterId, toNodeId);
}

async function portalAsk(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const toNodeId = text(body, 'toNodeId');
  if (characterId === undefined || toNodeId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  return ports.askPortal(characterId, toNodeId);
}

async function portalGrant(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const guildId = text(body, 'guildId');
  const cityId = text(body, 'cityId');
  const characterId = text(body, 'characterId');
  if (guildId === undefined || cityId === undefined || characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  return ports.grantPortal(guildId, cityId, characterId);
}

async function storage(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const cityId = text(body, 'cityId') ?? (characterId === undefined ? undefined : ports.characterNode(characterId));
  if (characterId === undefined || cityId === undefined || typeof body.slots !== 'number' || typeof body.days !== 'number') {
    return { ok: false, code: 'invalid' };
  }
  return ports.rentStorage(characterId, cityId, body.slots, body.days);
}

async function library(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const cityId = text(body, 'cityId') ?? (characterId === undefined ? undefined : ports.characterNode(characterId));
  if (characterId === undefined || cityId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  return ports.useLibrary(characterId, cityId);
}

async function bindCity(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  const cityId = text(body, 'cityId') ?? (characterId === undefined ? undefined : ports.characterNode(characterId));
  if (characterId === undefined || cityId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  return ports.bindCity(characterId, cityId);
}

async function serviceGrant(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const guildId = text(body, 'guildId');
  const cityId = text(body, 'cityId');
  const service = text(body, 'service');
  const characterId = text(body, 'characterId');
  if (guildId === undefined || cityId === undefined || service === undefined || characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  return ports.grantService(guildId, cityId, service, characterId);
}

async function guildWar(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const attackerGuildId = text(body, 'attackerGuildId') ?? text(body, 'guildId');
  const cityId = text(body, 'cityId');
  if (attackerGuildId === undefined || cityId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const vassal = ports.vassalMayWar(attackerGuildId, body.suzerainConsent === true);
  if (!vassal.ok) {
    return vassal;
  }
  if (await ports.carrierBlocked(attackerGuildId)) {
    return { ok: false, code: 'carrier' };
  }
  if (ports.cityOwner(cityId) === null) {
    const neutral = await ports.declareNeutralCity(body);
    return neutral;
  }
  const limits = ports.warLimits(cityId, attackerGuildId);
  const declared = await ports.guild.declareWar({
    attackerGuildId,
    cityId,
    ...(typeof body.gold === 'number' ? { gold: body.gold } : {}),
    ...(typeof body.resources === 'number' ? { resources: body.resources } : {}),
    ...(typeof body.leaderAbsent === 'boolean' ? { leaderAbsent: body.leaderAbsent } : {}),
    ...(typeof body.leaderConsent === 'boolean' ? { leaderConsent: body.leaderConsent } : {}),
    ...(typeof body.councilConsents === 'number' ? { councilConsents: body.councilConsents } : {}),
    cityCapturedAtMs:
      typeof body.cityCapturedAtMs === 'number' ? body.cityCapturedAtMs : limits.cityCapturedAtMs,
    drawEndedAtMs: typeof body.drawEndedAtMs === 'number' ? body.drawEndedAtMs : limits.drawEndedAtMs,
    lastDeclaredAtMs:
      typeof body.lastDeclaredAtMs === 'number' ? body.lastDeclaredAtMs : limits.lastDeclaredAtMs,
  });
  if (!declared.ok) {
    return { ok: false, code: declared.code };
  }
  if (typeof body.gold !== 'number') {
    ports.noteTurnover(WAR_GOLD);
  }
  ports.noteDeclaredWar();
  await ports.sampleBalance();
  ports.rememberDeclaration(attackerGuildId);
  const warId = declared.value.warId;
  const defenders = ports.rememberDefense(cityId, warId);
  const reviewed = await ports.reviewDeclaredWar(attackerGuildId, cityId);
  if (!reviewed.ok) {
    return { ok: false, code: reviewed.code };
  }
  return { ok: true, value: { ...declared.value, defenders } };
}

async function guildWithdraw(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const guildId = text(body, 'guildId');
  const characterId = text(body, 'characterId');
  if (guildId === undefined || typeof body.amount !== 'number') {
    return { ok: false, code: 'invalid' };
  }
  const stored = characterId === undefined ? null : ports.memberRank(guildId, characterId);
  const rank = stored ?? rankOf(text(body, 'rank'));
  if (rank === null) {
    return { ok: false, code: 'rank' };
  }
  const confirms = {
    leaderConfirm: body.leaderConfirm === true,
    councilConfirms: typeof body.councilConfirms === 'number' ? body.councilConfirms : 0,
    councilVote: body.councilVote === true,
  };
  if (ports.rewardsFrozen(guildId)) {
    return ports.holdWithdrawal({
      guildId,
      characterId: characterId ?? '',
      rank,
      amount: body.amount,
      ...confirms,
    });
  }
  const taken = await ports.guild.withdraw({
    guildId,
    rank,
    amount: body.amount,
    ...confirms,
  });
  if (!taken.ok) {
    return { ok: false, code: taken.code };
  }
  ports.noteTurnover(body.amount);
  if (characterId !== undefined) {
    ports.logWithdrawal(guildId, characterId, body.amount);
  }
  return { ok: true, value: taken.value };
}

async function guildRank(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const guildId = text(body, 'guildId');
  const actorId = text(body, 'actorId') ?? text(body, 'characterId');
  const memberId = text(body, 'memberId');
  const rank = text(body, 'rank');
  if (guildId === undefined || actorId === undefined || memberId === undefined || rank === undefined) {
    return { ok: false, code: 'invalid' };
  }
  return ports.seatMember(guildId, actorId, memberId, rank);
}

function rankOf(value: string | undefined): GuildRank | null {
  if (
    value === 'leader' ||
    value === 'council' ||
    value === 'officer' ||
    value === 'veteran' ||
    value === 'novice'
  ) {
    return value;
  }
  return null;
}

async function encounterEnter(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  if (!ports.enterEncounter(characterId)) {
    return { ok: false, code: 'missing' };
  }
  return { ok: true, value: { characterId } };
}

async function encounter(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const monsterId = text(body, 'monsterId') ?? text(body, 'id');
  if (monsterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  if (!ports.addEncounter(monsterId)) {
    return { ok: false, code: 'missing' };
  }
  return { ok: true, value: { monsterId } };
}

const GRADES = ['common', 'rare', 'epic', 'unique'] as const;

function relicOf(subtype: RelicSubtype, grade: GradeId): RelicState {
  return {
    subtype,
    grade,
    durability: 100,
    fed: true,
    onlineWornMs: 0,
    silencedUntilMs: 0,
    echoIds: [],
  };
}

function programOf(kind: 'echo' | 'path', templateId: string, grade: 1 | 2 | 3): Program {
  return { templateId, grade, kind, forgetting: 0, idleMs: 0 };
}

function gradeOf(body: Record<string, unknown>): 1 | 2 | 3 {
  const grade = numberOf(body.grade, 1);
  if (grade === 2 || grade === 3) {
    return grade;
  }
  return 1;
}

function coreGrade(body: Record<string, unknown>): 1 | 2 | 3 | 4 | 5 {
  const grade = numberOf(body.grade, 1);
  if (grade === 2 || grade === 3 || grade === 4 || grade === 5) {
    return grade;
  }
  return 1;
}

function echoIdsOf(state: BuildState): string[] {
  return state.programs.filter((program) => program.kind === 'echo').map((program) => program.templateId);
}

function neuralLimit(state: BuildState): number {
  const stats = emptyPoints();
  stats.will = state.will;
  return derive({ stats, level: state.level, totalWeightKg: 0 }).nnLimit;
}

function rememberNeural(characterId: string, state: BuildState, ports: LivePorts): void {
  ports.setNeural(characterId, nnUsed(state), neuralLimit(state));
}

function text(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function enumOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function isNode(id: string): id is NodeId {
  return (NODE_IDS as readonly string[]).includes(id);
}
