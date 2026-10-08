import type { Program, BuildState } from '@rift/domain/build';
import { NODE_IDS, type NodeId, type ToolId, type ToolKind } from '@rift/domain/gathering';
import type { KeeperKind } from '@rift/domain/hack';
import type { RelicState, RelicSubtype } from '@rift/domain/relics';
import type { QuestObjectiveKind } from '@rift/domain/quests';
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
  setNeural(characterId: string, nn: number, nnLimit: number): void;
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
  const installed = ports.build.installRelic({
    characterId,
    clean: body.clean === true,
    inCombat: false,
    inCityOrHub: true,
    gold: numberOf(body.gold, 0),
    subtype,
    nowMs: ports.now(),
    relic: relicOf(subtype),
  });
  if (!installed.ok) {
    return { ok: false, code: installed.code };
  }
  return { ok: true, value: { gold: installed.value.gold, readyAtMs: installed.value.readyAtMs } };
}

async function echo(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const installed = ports.build.installEcho({
    characterId,
    state: buildState(body),
    program: programOf('echo', text(body, 'templateId') ?? 'memory'),
  });
  if (!installed.ok) {
    return { ok: false, code: installed.code };
  }
  if (installed.value.neuroshock) {
    ports.setNeural(characterId, 11, 10);
  }
  return { ok: true, value: { neuroshock: installed.value.neuroshock } };
}

async function path(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const learned = ports.build.learnPath({
    characterId,
    state: buildState(body),
    program: programOf('path', text(body, 'templateId') ?? 'ward'),
    gold: numberOf(body.gold, 100),
    nowMs: ports.now(),
  });
  if (!learned.ok) {
    return { ok: false, code: learned.code };
  }
  return { ok: true, value: { gold: learned.value.gold, readyAtMs: learned.value.readyAtMs } };
}

async function core(body: Record<string, unknown>, ports: LivePorts): Promise<LiveResult> {
  const characterId = text(body, 'characterId') ?? text(body, 'entityId');
  if (characterId === undefined) {
    return { ok: false, code: 'invalid' };
  }
  const equipped = ports.build.equipCore({
    characterId,
    state: buildState({ ...body, withCore: false }),
    core: { templateId: text(body, 'templateId') ?? 'heart', grade: 1, implant: false },
    gold: numberOf(body.gold, 0),
  });
  if (!equipped.ok) {
    return { ok: false, code: equipped.code };
  }
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

function relicOf(subtype: RelicSubtype): RelicState {
  return {
    subtype,
    grade: 'common',
    durability: 100,
    fed: true,
    onlineWornMs: 0,
    silencedUntilMs: 0,
    echoIds: [],
  };
}

function programOf(kind: 'echo' | 'path', templateId: string): Program {
  return { templateId, grade: 1, kind, forgetting: 0, idleMs: 0 };
}

function buildState(body: Record<string, unknown>): BuildState {
  const withCore = body.withCore !== false;
  return {
    clean: body.clean === true,
    purifyingUntilMs: null,
    level: numberOf(body.level, 1),
    will: numberOf(body.will, 10),
    programs: [],
    cores: withCore ? [] : [],
    relicSocketFree: 1,
    inCityOrHub: true,
    inCombat: false,
  };
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
