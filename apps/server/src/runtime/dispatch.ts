import { nnUsed, type Program, type BuildState } from '@rift/domain/build';
import { NODE_IDS, type NodeId, type ToolId, type ToolKind } from '@rift/domain/gathering';
import type { KeeperKind } from '@rift/domain/hack';
import type { GradeId } from '@rift/domain/items';
import type { RelicState, RelicSubtype } from '@rift/domain/relics';
import { socketCount } from '@rift/domain/relics';
import type { QuestObjectiveKind } from '@rift/domain/quests';
import { derive, emptyPoints } from '@rift/domain/stats';
import { weatheredGatherSeconds } from '../sim/weather';
import type { BuildService } from '../modules/build/service';
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
  social: SocialService;
  note(characterId: string, kind: QuestObjectiveKind): Promise<void>;
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
  'quest_accept',
  'quest_turnin',
  'guild_create',
  'auction_bid',
  'mail',
  'title_grant',
  'encounter',
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
  });
  if (!rolled.ok) {
    return { ok: false, code: rolled.code };
  }
  const seconds = weatheredGatherSeconds(rolled.value.seconds, numberOf(body.technique, 5), tool, true, ports.weatherSpeed());
  return { ok: true, value: { ...rolled.value, seconds } };
}

async function hackStart(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const kind = enumOf(text(body, 'kind'), KEEPERS) ?? 'patrol';
  const opened = ports.hack.start({
    characterId,
    kind,
    technique: numberOf(body.technique, 5),
    hasDeck: body.hasDeck !== false,
    nowMs: ports.now(),
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
  const partySize = numberOf(body.partySize, 1);
  const entered = ports.dungeon.enter({
    characterId,
    nodeId: text(body, 'nodeId') ?? 'light_dungeon',
    edgeId: text(body, 'edgeId') ?? 'edge_light__fort_humans',
    groupId: text(body, 'groupId') ?? characterId,
    nowMs: ports.now(),
    partySize,
  });
  if (!entered.ok) {
    return { ok: false, code: entered.code };
  }
  await ports.note(characterId, 'visit');
  if (partySize > 1) {
    await ports.note(characterId, 'escort');
  }
  return { ok: true, value: { instanceId: entered.value.instanceId } };
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
  const created = await ports.guild.create(body);
  if (!created.ok) {
    return { ok: false, code: created.code };
  }
  const initiator = text(body, 'initiatorId');
  if (initiator !== undefined) {
    await ports.note(initiator, 'capture');
  }
  return { ok: true, value: created.value };
}

async function auctionBid(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const lotId = text(body, 'lotId');
  const bidderId = text(body, 'bidderId') ?? text(body, 'characterId');
  if (lotId === undefined || bidderId === undefined || typeof body.bid !== 'number') {
    return { ok: false, code: 'invalid' };
  }
  const before = ports.economy.taxLedger();
  const bid = ports.economy.bidAuction({ lotId, bidderId, bid: body.bid });
  if (!bid.ok) {
    return { ok: false, code: bid.code };
  }
  const after = ports.economy.taxLedger();
  const taxSink = after.guild > before.guild ? 'guild' : after.void > before.void ? 'void' : null;
  if (taxSink === 'guild') {
    await ports.guild.creditTax(after.guild - before.guild);
  }
  if (bid.value.buyout) {
    await ports.note(bidderId, 'trade');
  }
  return {
    ok: true,
    value: { ...bid.value, taxSink, guildTax: after.guild, sinkTax: after.void },
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
