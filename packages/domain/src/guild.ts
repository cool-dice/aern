import { askHostilePortal, GUILD_BANK_CAP, PORTAL_BLOCK_MS } from './economy';
import { textHitsBlacklist } from './moderation';
import { err, ok, type Result } from './result';
import type { Rng } from './rng';

const DAY_MS = 24 * 60 * 60 * 1000;

export const GUILD_CREATE_GOLD = 10_000;
export const GUILD_CREATE_SIZE = 4;
export const GUILD_MIN_LEVEL = 5;
/** Initiator must not have been leader or council during this window. */
export const OFFICE_COOLDOWN_MS = 7 * DAY_MS;
/** First leader tie waits this long; the wait itself is the caller's `revote` flag. */
export const REVOTE_MS = DAY_MS;
/** Artifact 17 §3.3. An internal ballot stays open for 24 real hours. */
export const INTERNAL_VOTE_MS = DAY_MS;
/** Artifact 17 §3.3. After this absence the senior council casts the deciding vote. */
export const DECIDING_ABSENCE_MS = DAY_MS;
/** Artifact 17 §2.5. A leader absent this long loses the seat. */
export const LEADER_ABSENCE_MS = 14 * DAY_MS;
/**
 * Artifact 32 §10. Collusion is a 30-day ban. Section 11 does not use this
 * number as a reward-freeze length.
 */
export const COLLUSION_BAN_MS = 30 * DAY_MS;
/** A novice cannot be promoted before this probation ends. */
export const NOVICE_LOCK_MS = 72 * 60 * 60 * 1000;
/** Artifact 17 §3.1. An officer invites at most this many characters in a day. */
export const OFFICER_INVITES_PER_DAY = 5;

export const WAR_GOLD = 50_000;
export const WAR_RESOURCES = 20_000;
/** Artifact 17 §6. A neutral city costs gold only. It does not pay the guild-war stake. */
export const NEUTRAL_CAPTURE_GOLD = 25_000;
/** NPC and monster guards that must fall before the center can be held. */
export const NEUTRAL_GUARD_COUNT = 2;
export const WAR_LEAD_MS = 48 * 60 * 60 * 1000;
export const CONTENDER_GOLD = 10_000;
/** Registration closes this long before the war starts. */
export const CONTENDER_CLOSE_MS = 60 * 60 * 1000;
export const WAR_MUSTER_MS = 30 * 60 * 1000;
export const WAR_ASSAULT_MS = 60 * 60 * 1000;
export const WAR_HOLD_MS = 10 * 60 * 1000;
export const WAR_FINISH_MS = 5 * 60 * 1000;
export const CITY_CAPTURE_COOLDOWN_MS = 7 * DAY_MS;
export const DRAW_WAR_COOLDOWN_MS = 3 * DAY_MS;
/** One guild cannot open another war inside this window (artifact 17 §5.6). */
export const GUILD_WAR_COOLDOWN_MS = 3 * DAY_MS;

export const DOCTRINE_COOLDOWN_MS = 7 * DAY_MS;
export const DOCTRINE_MULTIPLIER = 1.05;
const DOCTRINE_NUMERATOR = 105;
const DOCTRINE_DENOMINATOR = 100;

/** Artifact 17: 500 item slots. Gold cap is `GUILD_BANK_CAP` from economy. */
export const GUILD_BANK_SLOTS = 500;

export const GUILD_RANKS = ['leader', 'council', 'officer', 'veteran', 'novice'] as const;
export type GuildRank = (typeof GUILD_RANKS)[number];

export const RANK_LIMIT: Record<GuildRank, number | null> = {
  leader: 1,
  council: 3,
  officer: 10,
  veteran: null,
  novice: null,
};

/** Daily unilateral withdrawal, percent of the current bank. Novice is always 0. */
export const WITHDRAW_PERCENT: Record<GuildRank, number> = {
  leader: 10,
  council: 25,
  officer: 5,
  veteran: 1,
  novice: 0,
};

/** Artifact 17 §4.2. Items a rank may take from the bank in one day. */
export const WITHDRAW_ITEMS: Record<GuildRank, number> = {
  leader: 10,
  council: 20,
  officer: 5,
  veteran: 1,
  novice: 0,
};

const LEADERSHIP_RANKS = new Set<GuildRank>(['leader', 'council', 'officer']);

export const DOCTRINE_IDS = ['fury', 'fortitude', 'labor', 'greed', 'knowledge', 'guard'] as const;
export type DoctrineId = (typeof DOCTRINE_IDS)[number];

export const DOCTRINE_RESOURCES = ['metal', 'leather', 'wood', 'crystals', 'titanium'] as const;
export type DoctrineResource = (typeof DOCTRINE_RESOURCES)[number];

export type DoctrineAffect = 'damage' | 'hp' | 'gather' | 'lootGold' | 'xp' | 'armor';

export interface DoctrineCost {
  gold: number;
  resources: Partial<Record<DoctrineResource, number>>;
}

export const DOCTRINE_COST: Record<DoctrineId, DoctrineCost> = {
  fury: { gold: 50_000, resources: { metal: 500 } },
  fortitude: { gold: 50_000, resources: { leather: 500 } },
  labor: { gold: 50_000, resources: { wood: 500 } },
  greed: { gold: 100_000, resources: {} },
  knowledge: { gold: 100_000, resources: { crystals: 500 } },
  guard: { gold: 50_000, resources: { titanium: 500 } },
};

export const DOCTRINE_AFFECTS: Record<DoctrineId, DoctrineAffect> = {
  fury: 'damage',
  fortitude: 'hp',
  labor: 'gather',
  greed: 'lootGold',
  knowledge: 'xp',
  guard: 'armor',
};

export const CONTRACT_TYPES = ['kill', 'steal', 'smuggle', 'defend', 'scout'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export type GuildCode =
  | 'size'
  | 'level'
  | 'gold'
  | 'member'
  | 'cooldown'
  | 'self_vote'
  | 'rank'
  | 'limit'
  | 'confirm'
  | 'target'
  | 'doctrine';

export interface GuildDraft {
  name: string;
  tag: string;
  emblem: string;
  description: string;
  leaderId: string;
  memberIds: string[];
  gold: number;
}

export interface GuildFounder {
  id: string;
  level: number;
  inGuild: boolean;
}

export interface RankCounts {
  leader: number;
  council: number;
  officer: number;
}

export type WarPhase = 'muster' | 'assault' | 'finish' | 'closed';

export type WarOutcome = { result: 'win'; guildId: string } | { result: 'draw' };

export type LeaderElection =
  | { status: 'elected'; leaderId: string; votes: number; method: 'ballot' | 'rng' }
  | { status: 'tie'; candidateIds: string[]; revote: true };

const NAME_PATTERN = /^(?=.*\p{L})[\p{L} ]{3,24}$/u;
const TAG_PATTERN = /^[A-Z]{2,4}$/;

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be an integer >= 0, got ${String(value)}`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be an integer > 0, got ${String(value)}`);
  }
}

function assertMs(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} must be an integer millisecond timestamp, got ${String(value)}`);
  }
}

function isDoctrine(id: string): id is DoctrineId {
  return (DOCTRINE_IDS as readonly string[]).includes(id);
}

function isContract(id: string): id is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(id);
}

function isRank(id: string): id is GuildRank {
  return (GUILD_RANKS as readonly string[]).includes(id);
}

/** Charter fee is spent. It does not enter the guild bank. */
export function createGuild(input: {
  name: string;
  tag: string;
  initiatorId: string;
  founders: GuildFounder[];
  gold: number;
  nowMs: number;
  lastOfficeMs: number | null;
  leaderId: string;
  emblem?: string;
  description?: string;
}): Result<GuildDraft, 'size' | 'level' | 'gold' | 'member' | 'cooldown'> {
  if (!NAME_PATTERN.test(input.name)) {
    throw new RangeError('guild name must be 3..24 letters or spaces');
  }
  if (!TAG_PATTERN.test(input.tag)) {
    throw new RangeError('guild tag must be 2..4 uppercase latin letters');
  }
  assertNonNegativeInteger(input.gold, 'gold');
  assertMs(input.nowMs, 'nowMs');
  if (input.lastOfficeMs !== null) {
    assertMs(input.lastOfficeMs, 'lastOfficeMs');
  }
  if (input.founders.length < GUILD_CREATE_SIZE) {
    return err('size');
  }
  const ids = input.founders.map((founder) => founder.id);
  const unique = new Set(ids);
  if (unique.size < GUILD_CREATE_SIZE) {
    return err('size');
  }
  if (unique.size !== ids.length) {
    return err('member');
  }
  for (const founder of input.founders) {
    if (founder.id.length === 0) {
      throw new RangeError('founder id must be non-empty');
    }
    assertNonNegativeInteger(founder.level, 'level');
    if (founder.level < GUILD_MIN_LEVEL) {
      return err('level');
    }
  }
  if (input.founders.some((founder) => founder.inGuild)) {
    return err('member');
  }
  if (!unique.has(input.initiatorId) || !unique.has(input.leaderId)) {
    return err('member');
  }
  if (input.gold < GUILD_CREATE_GOLD) {
    return err('gold');
  }
  if (input.lastOfficeMs !== null && input.nowMs - input.lastOfficeMs < OFFICE_COOLDOWN_MS) {
    return err('cooldown');
  }
  return ok({
    name: input.name,
    tag: input.tag,
    emblem: input.emblem ?? '',
    description: input.description ?? '',
    leaderId: input.leaderId,
    memberIds: [...ids],
    gold: 0,
  });
}

export type CreationBanKind = 'collusion' | 'alt_guild';

export interface CreationBan {
  id: string;
  kind: CreationBanKind;
  /** Null does not expire. A collusion ban uses `COLLUSION_BAN_MS`. */
  untilMs: number | null;
}

/**
 * Artifact 17 §2.3. The name pattern is not the moderation rule. A blacklist
 * token is refused. An office still inside the 7-day window is refused, including
 * a founder who still holds leader or council. An active collusion or alt-guild
 * ban on any founder is refused.
 */
export function screenCharter(input: {
  name: string;
  blacklist: readonly string[];
  nowMs: number;
  founders: {
    id: string;
    lastOfficeMs: number | null;
    inOffice: boolean;
    ban: CreationBan | null;
  }[];
}): Result<true, 'name' | 'cooldown' | 'ban'> {
  assertMs(input.nowMs, 'nowMs');
  if (textHitsBlacklist(input.name, input.blacklist)) {
    return err('name');
  }
  for (const founder of input.founders) {
    if (founder.id.length === 0) {
      throw new RangeError('founder id must be non-empty');
    }
    if (founder.inOffice) {
      return err('cooldown');
    }
    if (founder.lastOfficeMs !== null) {
      assertMs(founder.lastOfficeMs, 'lastOfficeMs');
      if (input.nowMs - founder.lastOfficeMs < OFFICE_COOLDOWN_MS) {
        return err('cooldown');
      }
    }
    const ban = founder.ban;
    if (ban !== null && ban.id === founder.id && creationBanActive(ban, input.nowMs)) {
      return err('ban');
    }
  }
  return ok(true);
}

/** Artifact 17 §2.2 step 2. Every founder confirms before the charter is paid. */
export function foundersConfirmed(
  founders: { id: string; confirmed: boolean }[],
): Result<true, 'confirm'> {
  if (founders.length === 0) {
    return err('confirm');
  }
  for (const founder of founders) {
    if (founder.id.length === 0 || founder.confirmed !== true) {
      return err('confirm');
    }
  }
  return ok(true);
}

/** Artifact 17 §2.1. Registration is a city, its hall, or the guild registrar. */
export const REGISTRATION_PLACES = ['city', 'hall', 'registrar'] as const;
export type RegistrationPlace = (typeof REGISTRATION_PLACES)[number];

export function registrationPlace(input: {
  nodeKind: string;
  place?: string;
}): Result<RegistrationPlace, 'place'> {
  if (input.nodeKind !== 'city') {
    return err('place');
  }
  const place = input.place ?? 'hall';
  if (!(REGISTRATION_PLACES as readonly string[]).includes(place)) {
    return err('place');
  }
  return ok(place as RegistrationPlace);
}

function creationBanActive(ban: CreationBan, nowMs: number): boolean {
  if (ban.kind !== 'collusion' && ban.kind !== 'alt_guild') {
    return false;
  }
  if (ban.untilMs === null) {
    return true;
  }
  assertMs(ban.untilMs, 'untilMs');
  return nowMs < ban.untilMs;
}

/**
 * Artifact 32 §10. Collusion is 30 days. An alt-guild ban does not expire:
 * artifact 32 §6.1 bans the accounts.
 */
export function applyCreationBan(input: {
  role: string;
  kind: string;
  nowMs: number;
}): Result<{ kind: CreationBanKind; untilMs: number | null }, 'rank' | 'kind'> {
  assertMs(input.nowMs, 'nowMs');
  if (!(REVIEWER_ROLES as readonly string[]).includes(input.role)) {
    return err('rank');
  }
  if (input.kind === 'collusion') {
    return ok({ kind: 'collusion', untilMs: input.nowMs + COLLUSION_BAN_MS });
  }
  if (input.kind === 'alt_guild') {
    return ok({ kind: 'alt_guild', untilMs: null });
  }
  return err('kind');
}

/** Leader is leader; every other founder starts as novice. */
export function founderRanks(
  leaderId: string,
  memberIds: string[],
): { id: string; rank: GuildRank }[] {
  if (!memberIds.includes(leaderId)) {
    throw new RangeError('leader must be a member');
  }
  return memberIds.map((id) => ({ id, rank: id === leaderId ? 'leader' : 'novice' }));
}

/**
 * Self-votes are discarded. A winner needs strictly more than half of the
 * remaining ballots. Otherwise the candidates who share the highest count are
 * the tie leaders. The first tie sets `revote`. The next tie, with `revote`
 * already set, picks one of those leaders with `rng`.
 */
export function castLeaderVote(input: {
  memberIds: string[];
  ballots: { voterId: string; candidateId: string }[];
  revote: boolean;
  rng: Rng;
  ranks?: Partial<Record<string, GuildRank>>;
}): Result<LeaderElection, 'self_vote' | 'member' | 'rank'> {
  const members = new Set(input.memberIds);
  const latest = new Map<string, string>();
  for (const ballot of input.ballots) {
    if (!members.has(ballot.voterId) || !members.has(ballot.candidateId)) {
      return err('member');
    }
    const rank = input.ranks?.[ballot.voterId];
    if (rank === 'novice') {
      return err('rank');
    }
    latest.set(ballot.voterId, ballot.candidateId);
  }

  const counts = new Map<string, number>();
  let total = 0;
  for (const [voterId, candidateId] of latest) {
    if (voterId === candidateId) {
      continue;
    }
    counts.set(candidateId, (counts.get(candidateId) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) {
    return err('self_vote');
  }

  let top = 0;
  for (const count of counts.values()) {
    if (count > top) {
      top = count;
    }
  }
  const candidateIds: string[] = [];
  for (const [id, count] of counts) {
    if (count === top) {
      candidateIds.push(id);
    }
  }
  candidateIds.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  const sole = candidateIds.length === 1 ? candidateIds[0] : undefined;
  if (sole !== undefined && top * 2 > total) {
    return ok({ status: 'elected', leaderId: sole, votes: top, method: 'ballot' });
  }
  if (!input.revote) {
    return ok({ status: 'tie', candidateIds, revote: true });
  }
  const picked = candidateIds[input.rng.nextInt(candidateIds.length)];
  if (picked === undefined) {
    throw new RangeError('rng returned an index outside the tie');
  }
  return ok({ status: 'elected', leaderId: picked, votes: top, method: 'rng' });
}

/**
 * Artifact 17 §3.3. A vote needs half of the members who are allowed to vote.
 * `ballots * 2 >= eligible` is that half, in integers.
 */
export function voteQuorum(ballots: number, eligible: number): boolean {
  assertNonNegativeInteger(ballots, 'ballots');
  assertNonNegativeInteger(eligible, 'eligible');
  if (eligible === 0) {
    return false;
  }
  return ballots * 2 >= eligible;
}

/** Novices do not vote. Probation ending does not grant a vote until promotion. */
export function canVote(rank: GuildRank): Result<true, 'rank'> {
  if (!isRank(rank)) {
    throw new RangeError(`unknown rank: ${String(rank)}`);
  }
  if (rank === 'novice') {
    return err('rank');
  }
  return ok(true);
}

/**
 * `counts` are seats already filled, excluding the member being seated.
 * Leaving novice before 72 hours is refused.
 */
export function seatRank(input: {
  rank: GuildRank;
  from: GuildRank | null;
  counts: RankCounts;
  joinedAtMs: number;
  nowMs: number;
}): Result<{ rank: GuildRank }, 'limit' | 'cooldown'> {
  if (!isRank(input.rank)) {
    throw new RangeError(`unknown rank: ${String(input.rank)}`);
  }
  assertMs(input.joinedAtMs, 'joinedAtMs');
  assertMs(input.nowMs, 'nowMs');
  if (
    input.from === 'novice' &&
    input.rank !== 'novice' &&
    input.nowMs - input.joinedAtMs < NOVICE_LOCK_MS
  ) {
    return err('cooldown');
  }
  const cap = RANK_LIMIT[input.rank];
  if (cap !== null) {
    const held =
      input.rank === 'leader'
        ? input.counts.leader
        : input.rank === 'council'
          ? input.counts.council
          : input.counts.officer;
    if (!Number.isInteger(held) || held < 0) {
      throw new RangeError('rank count must be an integer >= 0');
    }
    if (held >= cap) {
      return err('limit');
    }
  }
  return ok({ rank: input.rank });
}

export function depositBank(bank: number, amount: number): { bank: number; overflow: number } {
  assertNonNegativeInteger(bank, 'bank');
  assertNonNegativeInteger(amount, 'amount');
  if (bank > GUILD_BANK_CAP) {
    throw new RangeError(`bank exceeds cap ${String(GUILD_BANK_CAP)}`);
  }
  const room = GUILD_BANK_CAP - bank;
  if (amount <= room) {
    return { bank: bank + amount, overflow: 0 };
  }
  return { bank: GUILD_BANK_CAP, overflow: amount - room };
}

/**
 * Unilateral caps are `WITHDRAW_PERCENT` of the current bank, floored.
 * A leader or council withdrawal above 10% needs the leader and 2 council
 * confirms. Above 25% also needs `councilVote`. Officers and veterans cannot
 * exceed their own percent.
 */
export function withdraw(input: {
  rank: GuildRank;
  bank: number;
  amount: number;
  leaderConfirm: boolean;
  councilConfirms: number;
  councilVote: boolean;
  /** Gold already taken today. The percent cap is the day's total. */
  goldWithdrawnToday?: number;
  resourceStock?: number;
  resourceAmount?: number;
  resourcesWithdrawnToday?: number;
  /** Occupied item slots. The bank holds at most `GUILD_BANK_SLOTS`. */
  itemSlots?: number;
  itemAmount?: number;
  itemsWithdrawnToday?: number;
}): Result<{ bank: number; amount: number }, 'rank' | 'limit' | 'confirm' | 'gold'> {
  if (!isRank(input.rank)) {
    throw new RangeError(`unknown rank: ${String(input.rank)}`);
  }
  assertNonNegativeInteger(input.bank, 'bank');
  assertNonNegativeInteger(input.amount, 'amount');
  if (!Number.isInteger(input.councilConfirms) || input.councilConfirms < 0) {
    throw new RangeError(
      `councilConfirms must be an integer >= 0, got ${String(input.councilConfirms)}`,
    );
  }
  if (input.bank > GUILD_BANK_CAP) {
    throw new RangeError(`bank exceeds cap ${String(GUILD_BANK_CAP)}`);
  }
  const itemSlots = input.itemSlots ?? 0;
  const itemAmount = input.itemAmount ?? 0;
  const itemsWithdrawnToday = input.itemsWithdrawnToday ?? 0;
  const resourceStock = input.resourceStock ?? 0;
  const resourceAmount = input.resourceAmount ?? 0;
  const resourcesWithdrawnToday = input.resourcesWithdrawnToday ?? 0;
  const goldWithdrawnToday = input.goldWithdrawnToday ?? 0;
  assertNonNegativeInteger(itemSlots, 'itemSlots');
  assertNonNegativeInteger(itemAmount, 'itemAmount');
  assertNonNegativeInteger(itemsWithdrawnToday, 'itemsWithdrawnToday');
  assertNonNegativeInteger(resourceStock, 'resourceStock');
  assertNonNegativeInteger(resourceAmount, 'resourceAmount');
  assertNonNegativeInteger(resourcesWithdrawnToday, 'resourcesWithdrawnToday');
  assertNonNegativeInteger(goldWithdrawnToday, 'goldWithdrawnToday');
  if (itemSlots > GUILD_BANK_SLOTS) {
    return err('limit');
  }
  if (input.rank === 'novice') {
    if (input.amount === 0 && itemAmount === 0 && resourceAmount === 0) {
      return ok({ bank: input.bank, amount: 0 });
    }
    return err('rank');
  }
  const itemCap = WITHDRAW_ITEMS[input.rank];
  if (itemsWithdrawnToday + itemAmount > itemCap) {
    return err('limit');
  }
  const resourceAllowance = Math.floor((resourceStock * WITHDRAW_PERCENT[input.rank]) / 100);
  if (resourcesWithdrawnToday + resourceAmount > resourceAllowance) {
    return err('limit');
  }
  if (resourceAmount > resourceStock) {
    return err('limit');
  }
  if (input.amount > input.bank) {
    return err('gold');
  }
  if (input.amount === 0) {
    return ok({ bank: input.bank, amount: 0 });
  }

  const spentGold = goldWithdrawnToday + input.amount;
  const allowance = Math.floor((input.bank * WITHDRAW_PERCENT[input.rank]) / 100);
  const band10 = Math.floor((input.bank * 10) / 100);
  const band25 = Math.floor((input.bank * 25) / 100);
  if (input.rank === 'officer' || input.rank === 'veteran') {
    if (spentGold > allowance) {
      return err('limit');
    }
    return ok({ bank: input.bank - input.amount, amount: input.amount });
  }

  const confirmed = input.leaderConfirm && input.councilConfirms >= 2;
  if (spentGold <= band10) {
    if (spentGold > allowance) {
      return err('limit');
    }
    return ok({ bank: input.bank - input.amount, amount: input.amount });
  }
  if (spentGold <= band25) {
    if (!confirmed) {
      return err('confirm');
    }
    return ok({ bank: input.bank - input.amount, amount: input.amount });
  }
  if (!confirmed || !input.councilVote) {
    return err('confirm');
  }
  return ok({ bank: input.bank - input.amount, amount: input.amount });
}

/** Artifact 17 §4.1. A deposit that would pass 500 item slots is refused. */
export function reserveItemSlots(
  slots: number,
  adding: number,
): Result<{ slots: number }, 'limit'> {
  assertNonNegativeInteger(slots, 'slots');
  assertNonNegativeInteger(adding, 'adding');
  if (adding === 0) {
    return slots > GUILD_BANK_SLOTS ? err('limit') : ok({ slots });
  }
  if (slots + adding > GUILD_BANK_SLOTS) {
    return err('limit');
  }
  return ok({ slots: slots + adding });
}

export function declareWar(input: {
  attackerGuildId: string;
  cityId: string;
  gold: number;
  resources: number;
  nowMs: number;
  leaderAbsent: boolean;
  leaderConsent: boolean;
  councilConsents: number;
  cityCapturedAtMs?: number | null;
  drawEndedAtMs?: number | null;
  lastDeclaredAtMs?: number | null;
}): Result<
  {
    attackerGuildId: string;
    cityId: string;
    startsAtMs: number;
    gold: number;
    resources: number;
    costGold: number;
    costResources: number;
  },
  'confirm' | 'cooldown' | 'gold'
> {
  assertNonNegativeInteger(input.gold, 'gold');
  assertNonNegativeInteger(input.resources, 'resources');
  assertMs(input.nowMs, 'nowMs');
  if (!Number.isInteger(input.councilConsents) || input.councilConsents < 0) {
    throw new RangeError(
      `councilConsents must be an integer >= 0, got ${String(input.councilConsents)}`,
    );
  }
  const consent = input.leaderAbsent
    ? input.councilConsents >= 3
    : input.leaderConsent && input.councilConsents >= 2;
  if (!consent) {
    return err('confirm');
  }
  if (
    input.cityCapturedAtMs != null &&
    input.nowMs - input.cityCapturedAtMs < CITY_CAPTURE_COOLDOWN_MS
  ) {
    return err('cooldown');
  }
  if (input.drawEndedAtMs != null && input.nowMs - input.drawEndedAtMs < DRAW_WAR_COOLDOWN_MS) {
    return err('cooldown');
  }
  if (
    input.lastDeclaredAtMs != null &&
    input.nowMs - input.lastDeclaredAtMs < GUILD_WAR_COOLDOWN_MS
  ) {
    return err('cooldown');
  }
  if (input.gold < WAR_GOLD || input.resources < WAR_RESOURCES) {
    return err('gold');
  }
  return ok({
    attackerGuildId: input.attackerGuildId,
    cityId: input.cityId,
    startsAtMs: input.nowMs + WAR_LEAD_MS,
    gold: input.gold - WAR_GOLD,
    resources: input.resources - WAR_RESOURCES,
    costGold: WAR_GOLD,
    costResources: WAR_RESOURCES,
  });
}

/**
 * Intent to take a neutral city. 25 000 gold, then a public event in 48 hours.
 * Guild-war gold and resources are not charged. An owned city is refused.
 */
export function declareNeutralCapture(input: {
  attackerGuildId: string;
  cityId: string;
  gold: number;
  nowMs: number;
  leaderAbsent: boolean;
  leaderConsent: boolean;
  councilConsents: number;
  owned: boolean;
  cityCapturedAtMs?: number | null;
  drawEndedAtMs?: number | null;
  lastDeclaredAtMs?: number | null;
}): Result<
  {
    attackerGuildId: string;
    cityId: string;
    startsAtMs: number;
    gold: number;
    costGold: number;
    kind: 'neutral';
    guards: number;
  },
  'confirm' | 'cooldown' | 'gold' | 'owned'
> {
  assertNonNegativeInteger(input.gold, 'gold');
  assertMs(input.nowMs, 'nowMs');
  if (!Number.isInteger(input.councilConsents) || input.councilConsents < 0) {
    throw new RangeError(
      `councilConsents must be an integer >= 0, got ${String(input.councilConsents)}`,
    );
  }
  if (input.owned) {
    return err('owned');
  }
  const consent = input.leaderAbsent
    ? input.councilConsents >= 3
    : input.leaderConsent && input.councilConsents >= 2;
  if (!consent) {
    return err('confirm');
  }
  if (
    input.cityCapturedAtMs != null &&
    input.nowMs - input.cityCapturedAtMs < CITY_CAPTURE_COOLDOWN_MS
  ) {
    return err('cooldown');
  }
  if (input.drawEndedAtMs != null && input.nowMs - input.drawEndedAtMs < DRAW_WAR_COOLDOWN_MS) {
    return err('cooldown');
  }
  if (
    input.lastDeclaredAtMs != null &&
    input.nowMs - input.lastDeclaredAtMs < GUILD_WAR_COOLDOWN_MS
  ) {
    return err('cooldown');
  }
  if (input.gold < NEUTRAL_CAPTURE_GOLD) {
    return err('gold');
  }
  return ok({
    attackerGuildId: input.attackerGuildId,
    cityId: input.cityId,
    startsAtMs: input.nowMs + WAR_LEAD_MS,
    gold: input.gold - NEUTRAL_CAPTURE_GOLD,
    costGold: NEUTRAL_CAPTURE_GOLD,
    kind: 'neutral',
    guards: NEUTRAL_GUARD_COUNT,
  });
}

export function registerContender(input: {
  guildId: string;
  gold: number;
  nowMs: number;
  startsAtMs: number;
}): Result<{ guildId: string; gold: number }, 'cooldown' | 'gold'> {
  assertNonNegativeInteger(input.gold, 'gold');
  assertMs(input.nowMs, 'nowMs');
  assertMs(input.startsAtMs, 'startsAtMs');
  if (input.nowMs > input.startsAtMs - CONTENDER_CLOSE_MS) {
    return err('cooldown');
  }
  if (input.gold < CONTENDER_GOLD) {
    return err('gold');
  }
  return ok({ guildId: input.guildId, gold: input.gold - CONTENDER_GOLD });
}

export function warPhase(elapsedMs: number): WarPhase {
  assertNonNegativeInteger(elapsedMs, 'elapsedMs');
  if (elapsedMs < WAR_MUSTER_MS) {
    return 'muster';
  }
  if (elapsedMs < WAR_MUSTER_MS + WAR_ASSAULT_MS) {
    return 'assault';
  }
  if (elapsedMs < WAR_MUSTER_MS + WAR_ASSAULT_MS + WAR_FINISH_MS) {
    return 'finish';
  }
  return 'closed';
}

/**
 * Milliseconds of `deltaMs` that fall inside the assault window.
 * Muster and the finish do not add to the center hold.
 */
export function assaultWindowMs(input: { startsAtMs: number; nowMs: number; deltaMs: number }): number {
  assertMs(input.startsAtMs, 'startsAtMs');
  assertMs(input.nowMs, 'nowMs');
  assertNonNegativeInteger(input.deltaMs, 'deltaMs');
  const from = input.nowMs - input.deltaMs;
  const assaultStart = input.startsAtMs + WAR_MUSTER_MS;
  const assaultEnd = assaultStart + WAR_ASSAULT_MS;
  const overlapStart = Math.max(from, assaultStart);
  const overlapEnd = Math.min(input.nowMs, assaultEnd);
  return Math.max(0, overlapEnd - overlapStart);
}

/** Continuous center hold. 599_999 ms is not yet a win; 600_000 ms is. */
export function holdWins(heldMs: number): boolean {
  assertNonNegativeInteger(heldMs, 'heldMs');
  return heldMs >= WAR_HOLD_MS;
}

/** Losing the center, or a new holder, resets the continuous timer to 0. */
export function advanceHold(input: {
  holderGuildId: string | null;
  previousHolderGuildId: string | null;
  heldMs: number;
  deltaMs: number;
}): { holderGuildId: string | null; heldMs: number } {
  assertNonNegativeInteger(input.heldMs, 'heldMs');
  assertNonNegativeInteger(input.deltaMs, 'deltaMs');
  if (input.holderGuildId === null) {
    return { holderGuildId: null, heldMs: 0 };
  }
  if (input.holderGuildId !== input.previousHolderGuildId) {
    return { holderGuildId: input.holderGuildId, heldMs: 0 };
  }
  return { holderGuildId: input.holderGuildId, heldMs: input.heldMs + input.deltaMs };
}

/**
 * Hold of at least 600_000 ms wins immediately. Otherwise, at the end of the
 * assault, the only guild with `fighters > 0` wins. Every other ending is a draw.
 */
export function warWinner(input: {
  heldCenterGuildId: string | null;
  heldMs: number;
  guilds: { guildId: string; fighters: number }[];
}): WarOutcome {
  assertNonNegativeInteger(input.heldMs, 'heldMs');
  if (input.heldCenterGuildId !== null && input.heldMs >= WAR_HOLD_MS) {
    return { result: 'win', guildId: input.heldCenterGuildId };
  }
  const totals = new Map<string, number>();
  for (const guild of input.guilds) {
    assertNonNegativeInteger(guild.fighters, 'fighters');
    totals.set(guild.guildId, (totals.get(guild.guildId) ?? 0) + guild.fighters);
  }
  const alive: string[] = [];
  for (const [guildId, fighters] of totals) {
    if (fighters > 0) {
      alive.push(guildId);
    }
  }
  const sole = alive.length === 1 ? alive[0] : undefined;
  if (sole !== undefined) {
    return { result: 'win', guildId: sole };
  }
  return { result: 'draw' };
}

/** A draw keeps the previous owner and forfeits the attacker's stake. */
export function settleWar(input: { outcome: WarOutcome; ownerGuildId: string | null }): {
  ownerGuildId: string | null;
  stakeForfeit: boolean;
  cooldownMs: number;
} {
  if (input.outcome.result === 'draw') {
    return {
      ownerGuildId: input.ownerGuildId,
      stakeForfeit: true,
      cooldownMs: DRAW_WAR_COOLDOWN_MS,
    };
  }
  return {
    ownerGuildId: input.outcome.guildId,
    stakeForfeit: false,
    cooldownMs: CITY_CAPTURE_COOLDOWN_MS,
  };
}

function readResources(
  resources: Partial<Record<DoctrineResource, number>>,
): Record<DoctrineResource, number> {
  const full = {
    metal: 0,
    leather: 0,
    wood: 0,
    crystals: 0,
    titanium: 0,
  };
  for (const key of DOCTRINE_RESOURCES) {
    const qty = resources[key] ?? 0;
    assertNonNegativeInteger(qty, key);
    full[key] = qty;
  }
  return full;
}

export function doctrineMultiplier(id: DoctrineId): number {
  if (!isDoctrine(id)) {
    throw new RangeError(`unknown doctrine: ${String(id)}`);
  }
  return DOCTRINE_MULTIPLIER;
}

/**
 * Armor (`guard`) floors the scaled total. Other doctrines return the scaled
 * number; gathering time is divided by the labor multiplier outside this module.
 */
export function applyDoctrine(id: DoctrineId, amount: number): number {
  if (!isDoctrine(id)) {
    throw new RangeError(`unknown doctrine: ${String(id)}`);
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`amount must be a finite number >= 0, got ${String(amount)}`);
  }
  const scaled = (amount * DOCTRINE_NUMERATOR) / DOCTRINE_DENOMINATOR;
  if (id === 'guard') {
    return Math.floor(scaled);
  }
  return scaled;
}

export function setDoctrine(input: {
  current: DoctrineId | null;
  next: DoctrineId;
  changedAtMs: number | null;
  nowMs: number;
  gold: number;
  resources: Partial<Record<DoctrineResource, number>>;
}): Result<
  {
    doctrine: DoctrineId;
    gold: number;
    resources: Record<DoctrineResource, number>;
    changedAtMs: number;
    multiplier: number;
    affects: DoctrineAffect;
  },
  'doctrine' | 'cooldown' | 'gold'
> {
  if (!isDoctrine(input.next)) {
    return err('doctrine');
  }
  if (input.current !== null && !isDoctrine(input.current)) {
    return err('doctrine');
  }
  assertMs(input.nowMs, 'nowMs');
  if (input.changedAtMs !== null) {
    assertMs(input.changedAtMs, 'changedAtMs');
  }
  assertNonNegativeInteger(input.gold, 'gold');
  if (input.changedAtMs !== null && input.nowMs - input.changedAtMs < DOCTRINE_COOLDOWN_MS) {
    return err('cooldown');
  }
  const cost = DOCTRINE_COST[input.next];
  const resources = readResources(input.resources);
  if (input.gold < cost.gold) {
    return err('gold');
  }
  for (const key of DOCTRINE_RESOURCES) {
    if (resources[key] < (cost.resources[key] ?? 0)) {
      return err('gold');
    }
  }
  const spent = { ...resources };
  for (const key of DOCTRINE_RESOURCES) {
    spent[key] -= cost.resources[key] ?? 0;
  }
  return ok({
    doctrine: input.next,
    gold: input.gold - cost.gold,
    resources: spent,
    changedAtMs: input.nowMs,
    multiplier: doctrineMultiplier(input.next),
    affects: DOCTRINE_AFFECTS[input.next],
  });
}

export function postContract(input: {
  type: ContractType;
  rewardGold: number;
  targetLevel?: number;
  targetIsMember?: boolean;
}): Result<{ type: ContractType; rewardGold: number }, 'target' | 'gold'> {
  if (!isContract(input.type)) {
    return err('target');
  }
  if (!Number.isInteger(input.rewardGold)) {
    throw new RangeError(`rewardGold must be an integer, got ${String(input.rewardGold)}`);
  }
  if (input.type === 'kill') {
    if (input.targetLevel === undefined || !Number.isInteger(input.targetLevel)) {
      return err('target');
    }
    if (input.targetLevel < 10 || input.targetIsMember === true) {
      return err('target');
    }
  }
  if (input.rewardGold <= 0) {
    return err('gold');
  }
  return ok({ type: input.type, rewardGold: input.rewardGold });
}

export function canDissolve(input: {
  leaderConsent: boolean;
  councilConsents: number;
  councilVotesFor: number;
  councilSize: number;
}): Result<{ by: 'council' | 'vote' }, 'confirm'> {
  if (!Number.isInteger(input.councilConsents) || input.councilConsents < 0) {
    throw new RangeError(
      `councilConsents must be an integer >= 0, got ${String(input.councilConsents)}`,
    );
  }
  if (!Number.isInteger(input.councilVotesFor) || input.councilVotesFor < 0) {
    throw new RangeError(
      `councilVotesFor must be an integer >= 0, got ${String(input.councilVotesFor)}`,
    );
  }
  if (!Number.isInteger(input.councilSize) || input.councilSize < 0) {
    throw new RangeError(`councilSize must be an integer >= 0, got ${String(input.councilSize)}`);
  }
  if (input.leaderConsent && input.councilConsents >= 2) {
    return ok({ by: 'council' });
  }
  if (input.councilSize > 0 && input.councilVotesFor * 3 >= input.councilSize * 2) {
    return ok({ by: 'vote' });
  }
  return err('confirm');
}

/** `floor(gold * contributed / sum)`. The undistributed remainder is `void`. */
export function dissolveShares(
  gold: number,
  contributions: { id: string; contributed: number }[],
): { shares: { id: string; gold: number }[]; void: number } {
  assertNonNegativeInteger(gold, 'gold');
  let sum = 0;
  for (const row of contributions) {
    assertPositiveInteger(row.contributed, 'contributed');
    if (row.id.length === 0) {
      throw new RangeError('contribution id must be non-empty');
    }
    sum += row.contributed;
  }
  if (contributions.length === 0) {
    return { shares: [], void: gold };
  }
  const shares = contributions.map((row) => ({
    id: row.id,
    gold: Math.floor((gold * row.contributed) / sum),
  }));
  const paid = shares.reduce((total, share) => total + share.gold, 0);
  return { shares, void: gold - paid };
}

export interface ContributionRow {
  id: string;
  contributed: number;
}

export interface AssetSplit {
  shares: { id: string; amount: number }[];
  void: number;
}

/**
 * Artifact 17 §2.4 and §4.3. Gold, resources, and items each split by their
 * own contribution ledger. An empty ledger sends that pile to `void`.
 */
export function dissolveHoldings(input: {
  gold: number;
  resources: number;
  items: number;
  goldLedger: ContributionRow[];
  resourceLedger: ContributionRow[];
  itemLedger: ContributionRow[];
}): { gold: AssetSplit; resources: AssetSplit; items: AssetSplit } {
  return {
    gold: asAmount(dissolveShares(input.gold, input.goldLedger)),
    resources: asAmount(dissolveShares(input.resources, input.resourceLedger)),
    items: asAmount(dissolveShares(input.items, input.itemLedger)),
  };
}

export interface KindContribution {
  kind: string;
  amount: number;
  ledger: ContributionRow[];
}

export interface KindSplit {
  kind: string;
  shares: { id: string; amount: number }[];
  void: number;
}

/**
 * Artifact 17 §4.3. Each resource kind and each item kind splits on its own
 * contribution ledger. A pile is not rewritten as another kind, and it is not
 * handed out by bank-stack order.
 */
export function dissolveKindPiles(piles: KindContribution[]): KindSplit[] {
  return piles.map((pile) => {
    if (pile.kind.length === 0) {
      throw new RangeError('kind must be non-empty');
    }
    const split = dissolveShares(pile.amount, pile.ledger);
    return {
      kind: pile.kind,
      shares: split.shares.map((share) => ({ id: share.id, amount: share.gold })),
      void: split.void,
    };
  });
}

function asAmount(split: { shares: { id: string; gold: number }[]; void: number }): AssetSplit {
  return {
    shares: split.shares.map((share) => ({ id: share.id, amount: share.gold })),
    void: split.void,
  };
}

export type InternalClose =
  | { status: 'open' }
  | { status: 'quorum' }
  | { status: 'failed' }
  | { status: 'passed'; choice: string; by: 'majority' | 'leader' | 'council'; deciderId: string | null };

/**
 * Artifact 17 §3.3. The ballot stays open for 24 hours. Quorum is half of the
 * members who may vote. A tie is the leader's vote, or the senior council's
 * when the leader has been absent for more than 24 hours.
 */
export function closeInternalVote(input: {
  openedAtMs: number;
  nowMs: number;
  ballots: { voterId: string; choice: string }[];
  eligibleIds: string[];
  ranks: Partial<Record<string, GuildRank>>;
  leaderId: string;
  leaderAbsentMs: number;
  council: { id: string; seniorityMs: number }[];
}): Result<InternalClose, 'rank' | 'member'> {
  assertMs(input.openedAtMs, 'openedAtMs');
  assertMs(input.nowMs, 'nowMs');
  assertNonNegativeInteger(input.leaderAbsentMs, 'leaderAbsentMs');
  if (input.nowMs < input.openedAtMs + INTERNAL_VOTE_MS) {
    return ok({ status: 'open' });
  }
  const members = new Set(input.eligibleIds);
  const latest = new Map<string, string>();
  for (const ballot of input.ballots) {
    if (!members.has(ballot.voterId)) {
      return err('member');
    }
    if (input.ranks[ballot.voterId] === 'novice') {
      return err('rank');
    }
    if (ballot.choice.length === 0) {
      throw new RangeError('choice must be non-empty');
    }
    latest.set(ballot.voterId, ballot.choice);
  }
  const eligible = input.eligibleIds.filter((id) => input.ranks[id] !== 'novice');
  if (!voteQuorum(latest.size, eligible.length)) {
    return ok({ status: 'quorum' });
  }
  const counts = new Map<string, number>();
  for (const choice of latest.values()) {
    counts.set(choice, (counts.get(choice) ?? 0) + 1);
  }
  let top = 0;
  for (const count of counts.values()) {
    if (count > top) {
      top = count;
    }
  }
  const tied: string[] = [];
  for (const [choice, count] of counts) {
    if (count === top) {
      tied.push(choice);
    }
  }
  tied.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const sole = tied.length === 1 ? tied[0] : undefined;
  if (sole !== undefined && top * 2 > latest.size) {
    return ok({ status: 'passed', choice: sole, by: 'majority', deciderId: null });
  }
  const deciderId =
    input.leaderAbsentMs > DECIDING_ABSENCE_MS ? seniorCouncil(input.council) : input.leaderId;
  if (deciderId === null) {
    return ok({ status: 'failed' });
  }
  const choice = latest.get(deciderId);
  if (choice === undefined || !tied.includes(choice)) {
    return ok({ status: 'failed' });
  }
  return ok({
    status: 'passed',
    choice,
    by: input.leaderAbsentMs > DECIDING_ABSENCE_MS ? 'council' : 'leader',
    deciderId,
  });
}

function seniorCouncil(council: { id: string; seniorityMs: number }[]): string | null {
  const rows = [...council];
  rows.sort((left, right) => {
    if (left.seniorityMs !== right.seniorityMs) {
      return right.seniorityMs - left.seniorityMs;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  return rows[0]?.id ?? null;
}

export type AbsenceSuccession =
  | { action: 'wait' }
  | { action: 'transfer'; toId: string; seat: 'council' | 'officer' }
  | { action: 'dissolve' };

/**
 * Artifact 17 §2.5. Fourteen days of absence moves the seat to the council
 * member with the greatest seniority, then activity. With no council, the
 * officer with the greatest seniority takes it. With neither, the guild dissolves.
 */
export function succeedAbsentLeader(input: {
  absentMs: number;
  council: { id: string; seniorityMs: number; activity: number }[];
  officers: { id: string; seniorityMs: number }[];
}): AbsenceSuccession {
  assertNonNegativeInteger(input.absentMs, 'absentMs');
  if (input.absentMs < LEADER_ABSENCE_MS) {
    return { action: 'wait' };
  }
  const council = [...input.council].sort((left, right) => {
    assertNonNegativeInteger(left.seniorityMs, 'seniorityMs');
    assertNonNegativeInteger(left.activity, 'activity');
    assertNonNegativeInteger(right.seniorityMs, 'seniorityMs');
    assertNonNegativeInteger(right.activity, 'activity');
    if (left.id.length === 0 || right.id.length === 0) {
      throw new RangeError('council id must be non-empty');
    }
    if (left.seniorityMs !== right.seniorityMs) {
      return right.seniorityMs - left.seniorityMs;
    }
    if (left.activity !== right.activity) {
      return right.activity - left.activity;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  const councilor = council[0];
  if (councilor !== undefined) {
    return { action: 'transfer', toId: councilor.id, seat: 'council' };
  }
  const officers = [...input.officers].sort((left, right) => {
    assertNonNegativeInteger(left.seniorityMs, 'seniorityMs');
    assertNonNegativeInteger(right.seniorityMs, 'seniorityMs');
    if (left.id.length === 0 || right.id.length === 0) {
      throw new RangeError('officer id must be non-empty');
    }
    if (left.seniorityMs !== right.seniorityMs) {
      return right.seniorityMs - left.seniorityMs;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  const officer = officers[0];
  if (officer !== undefined) {
    return { action: 'transfer', toId: officer.id, seat: 'officer' };
  }
  return { action: 'dissolve' };
}

/** Artifact 17 §10. An AI holds at most one leadership post at a time. */
export function aiLeadership(input: {
  ai: boolean;
  rank: GuildRank;
  posts: number;
}): Result<true, 'limit'> {
  if (!isRank(input.rank)) {
    throw new RangeError(`unknown rank: ${String(input.rank)}`);
  }
  assertNonNegativeInteger(input.posts, 'posts');
  if (!input.ai || !LEADERSHIP_RANKS.has(input.rank)) {
    return ok(true);
  }
  if (input.posts >= 1) {
    return err('limit');
  }
  return ok(true);
}

/** Leader, council, and officer may invite. An officer stops at five a day. */
export function officerInvite(input: {
  rank: GuildRank;
  invitesToday: number;
}): Result<true, 'rank' | 'limit'> {
  if (!isRank(input.rank)) {
    throw new RangeError(`unknown rank: ${String(input.rank)}`);
  }
  assertNonNegativeInteger(input.invitesToday, 'invitesToday');
  if (input.rank !== 'leader' && input.rank !== 'council' && input.rank !== 'officer') {
    return err('rank');
  }
  if (input.rank === 'officer' && input.invitesToday >= OFFICER_INVITES_PER_DAY) {
    return err('limit');
  }
  return ok(true);
}

/** Artifact 17 §8. One guild member plants a flag in 60 real seconds. */
export const NODE_PLANT_MS = 60_000;
/** No owning-guild member online for 30 real minutes drops the flag. */
export const NODE_DROP_MS = 30 * 60 * 1000;
export const NODE_CHEST_CAP = 10_000;
export const NODE_TAX_MAX = 30;
/** Artifact 17 rank table: an officer sets the node tax only inside 0–15%. */
export const NODE_TAX_OFFICER_MAX = 15;
export const NODE_TAX_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type NodeAccess = 'open' | 'request' | 'closed';
/** Artifact 17 §8.5. Allies, other guilds, and neutrals each have their own mode. */
export const NODE_ACCESS_CATEGORIES = ['allies', 'guilds', 'neutrals'] as const;
export type NodeAccessCategory = (typeof NODE_ACCESS_CATEGORIES)[number];

export interface NodeAccessPolicy {
  allies: NodeAccess;
  guilds: NodeAccess;
  neutrals: NodeAccess;
}

export interface ResourceNode {
  nodeId: string;
  guildId: string | null;
  plantingGuildId: string | null;
  plantMs: number;
  absentMs: number;
  taxPercent: number;
  taxSetAtMs: number | null;
  chest: number;
  access: NodeAccessPolicy;
}

export function freshResourceNode(nodeId: string): ResourceNode {
  return {
    nodeId,
    guildId: null,
    plantingGuildId: null,
    plantMs: 0,
    absentMs: 0,
    taxPercent: 0,
    taxSetAtMs: null,
    chest: 0,
    access: { allies: 'open', guilds: 'open', neutrals: 'open' },
  };
}

export function nodeAccessCategory(
  stance: 'member' | 'ally' | 'enemy' | 'neutral',
): NodeAccessCategory | null {
  if (stance === 'member') {
    return null;
  }
  if (stance === 'ally') {
    return 'allies';
  }
  if (stance === 'enemy') {
    return 'guilds';
  }
  return 'neutrals';
}

export function nodeAccessAllows(input: {
  policy: NodeAccessPolicy;
  category: NodeAccessCategory;
  granted: boolean;
}): { ok: true } | { ok: false; code: 'closed' | 'refused' } {
  const rule = input.policy[input.category];
  if (rule === 'open' || (rule === 'request' && input.granted)) {
    return { ok: true };
  }
  return { ok: false, code: rule === 'closed' ? 'closed' : 'refused' };
}

/**
 * Plant while exactly one guild stands on a neutral node.
 * Two guilds, or none, reset the plant timer.
 * An owned node drops only after the owning guild has been absent for 30 minutes.
 * The drop leaves the chest. The next planter takes it. This call owns that.
 */
export function advanceResourceNode(input: {
  node: ResourceNode;
  presentGuildIds: readonly string[];
  deltaMs: number;
}): { node: ResourceNode; seized: { guildId: string; amount: number } | null } {
  assertNonNegativeInteger(input.deltaMs, 'deltaMs');
  const present = [...new Set(input.presentGuildIds)];
  const next: ResourceNode = { ...input.node };
  if (next.guildId !== null) {
    const ownerHere = present.includes(next.guildId);
    next.absentMs = ownerHere ? 0 : next.absentMs + input.deltaMs;
    next.plantingGuildId = null;
    next.plantMs = 0;
    if (next.absentMs >= NODE_DROP_MS) {
      next.guildId = null;
      next.absentMs = 0;
    }
    return settleNodeDrop(input.node, next);
  }
  next.absentMs = 0;
  if (present.length !== 1) {
    next.plantingGuildId = null;
    next.plantMs = 0;
    return settleNodeDrop(input.node, next);
  }
  const planter = present[0] ?? null;
  if (planter === null) {
    return settleNodeDrop(input.node, next);
  }
  if (next.plantingGuildId !== planter) {
    next.plantingGuildId = planter;
    next.plantMs = 0;
  }
  next.plantMs += input.deltaMs;
  if (next.plantMs >= NODE_PLANT_MS) {
    next.guildId = planter;
    next.plantingGuildId = null;
    next.plantMs = NODE_PLANT_MS;
    next.absentMs = 0;
  }
  return settleNodeDrop(input.node, next);
}

export function depositNodeChest(chest: number, amount: number): number {
  assertNonNegativeInteger(chest, 'chest');
  assertNonNegativeInteger(amount, 'amount');
  return Math.min(NODE_CHEST_CAP, chest + amount);
}

/**
 * Owner range is 0–30. An officer is capped at 0–15.
 * A veteran or novice cannot set the tax. Omitting `rank` keeps the 0–30 owner check.
 */
export function setNodeTax(input: {
  next: number;
  nowMs: number;
  taxSetAtMs: number | null;
  rank?: GuildRank;
}): Result<{ taxPercent: number; taxSetAtMs: number }, 'tax' | 'cooldown' | 'rank'> {
  if (input.rank !== undefined) {
    if (!isRank(input.rank)) {
      throw new RangeError(`unknown rank: ${String(input.rank)}`);
    }
    if (input.rank === 'veteran' || input.rank === 'novice') {
      return err('rank');
    }
  }
  const cap = input.rank === 'officer' ? NODE_TAX_OFFICER_MAX : NODE_TAX_MAX;
  if (!Number.isInteger(input.next) || input.next < 0 || input.next > cap) {
    return err('tax');
  }
  assertNonNegativeInteger(input.nowMs, 'nowMs');
  if (input.taxSetAtMs !== null && input.nowMs < input.taxSetAtMs + NODE_TAX_COOLDOWN_MS) {
    return err('cooldown');
  }
  return ok({ taxPercent: input.next, taxSetAtMs: input.nowMs });
}

export function setNodeAccess(input: {
  policy: NodeAccessPolicy;
  category: string;
  access: string;
}): Result<NodeAccessPolicy, 'access' | 'category'> {
  if (!(NODE_ACCESS_CATEGORIES as readonly string[]).includes(input.category)) {
    return err('category');
  }
  if (input.access !== 'open' && input.access !== 'request' && input.access !== 'closed') {
    return err('access');
  }
  const category = input.category as NodeAccessCategory;
  return ok({ ...input.policy, [category]: input.access });
}

/**
 * Artifact 17 §8.4. When the flag drops, the chest stays for the next planter.
 * The guild that lost the flag does not seize it. Planting on a chest takes it.
 */
export function settleNodeDrop(
  before: ResourceNode,
  after: ResourceNode,
): { node: ResourceNode; seized: { guildId: string; amount: number } | null } {
  const dropped = before.guildId !== null && after.guildId === null;
  if (dropped) {
    return { node: { ...after, chest: before.chest }, seized: null };
  }
  const planted = before.guildId === null && after.guildId !== null && after.chest > 0;
  if (planted && after.guildId !== null) {
    return {
      node: { ...after, chest: 0 },
      seized: { guildId: after.guildId, amount: after.chest },
    };
  }
  return { node: after, seized: null };
}

const NODE_CHEST_RANKS = new Set<GuildRank>(['leader', 'council', 'officer']);

/**
 * Artifact 17 §8.3. The capturer takes the flag down and pockets the chest.
 * The capturer does not have to be the guild that currently owns the node.
 * This is not §8.4: an absence drop leaves the chest for the next planter.
 */
export function strikeNodeFlag(input: {
  node: ResourceNode;
  guildId: string;
  rank: GuildRank;
}): Result<{ node: ResourceNode; pocketed: number }, 'owner' | 'rank'> {
  if (!isRank(input.rank)) {
    throw new RangeError(`unknown rank: ${String(input.rank)}`);
  }
  if (input.guildId.length === 0 || input.node.guildId === null) {
    return err('owner');
  }
  if (!NODE_CHEST_RANKS.has(input.rank)) {
    return err('rank');
  }
  return ok({
    pocketed: input.node.chest,
    node: {
      ...input.node,
      guildId: null,
      plantingGuildId: null,
      plantMs: 0,
      absentMs: 0,
      chest: 0,
    },
  });
}

/** Artifact 17 §9. Alliances and non-aggression pacts last 7 real days. */
export const PACT_MS = 7 * DAY_MS;
/** An alliance ends 24 real hours after the break notice. */
export const ALLIANCE_BREAK_MS = DAY_MS;
/** A vassal pays this share of the guild bank to the suzerain. */
export const VASSAL_TAX_MIN = 10;
export const VASSAL_TAX_MAX = 30;
/** Breaking a non-aggression pact. */
export const NAP_BREACH_GOLD = 50_000;
export const NAP_FLAG_MS = 7 * DAY_MS;
export const VASSAL_RELEASE_MS = 7 * DAY_MS;

export const PACT_KINDS = ['alliance', 'coalition', 'vassal', 'non_aggression'] as const;
export type PactKind = (typeof PACT_KINDS)[number];

export interface GuildPact {
  kind: PactKind;
  guildIds: string[];
  startedAtMs: number;
  untilMs: number;
  taxPercent: number | null;
  targetGuildId: string | null;
  suzerainId: string | null;
  vassalId: string | null;
  breakNoticeAtMs: number | null;
  lastTitheAtMs: number | null;
  /** Set by `breakAlliance` after the notice has aged. The notice itself does not end the pact. */
  brokenAtMs: number | null;
}

export const MERCENARY_KINDS = ['patrol', 'defend', 'attack', 'escort'] as const;
export type MercenaryKind = (typeof MERCENARY_KINDS)[number];
/** Artifact 17 §8.7 example: patrol the node for 3 real hours. */
export const PATROL_QUEST_MS = 3 * 60 * 60 * 1000;
/** Artifact 17 §8.7 example reward, paid from the guild bank on completion. */
export const PATROL_QUEST_GOLD = 5_000;

function isPactKind(kind: string): kind is PactKind {
  return (PACT_KINDS as readonly string[]).includes(kind);
}

function isMercenaryKind(kind: string): kind is MercenaryKind {
  return (MERCENARY_KINDS as readonly string[]).includes(kind);
}

function distinctGuilds(guildIds: readonly string[]): string[] | null {
  const ids = guildIds.filter((id) => id.length > 0);
  if (new Set(ids).size !== ids.length) {
    return null;
  }
  return ids;
}

/** A coalition has no shared bank. Callers must not deposit into one. */
export function coalitionBank(): Result<never, 'bank'> {
  return err('bank');
}

export function formPact(input: {
  kind: string;
  guildIds: readonly string[];
  nowMs: number;
  taxPercent?: number;
  targetGuildId?: string;
  suzerainId?: string;
  vassalId?: string;
}): Result<GuildPact, 'guild' | 'tax' | 'kind'> {
  if (!isPactKind(input.kind)) {
    return err('kind');
  }
  assertMs(input.nowMs, 'nowMs');
  const guildIds = distinctGuilds(input.guildIds);
  if (guildIds === null || guildIds.length < 2) {
    return err('guild');
  }
  const base: GuildPact = {
    kind: input.kind,
    guildIds,
    startedAtMs: input.nowMs,
    untilMs: input.nowMs + PACT_MS,
    taxPercent: null,
    targetGuildId: null,
    suzerainId: null,
    vassalId: null,
    breakNoticeAtMs: null,
    lastTitheAtMs: null,
    brokenAtMs: null,
  };
  if (input.kind === 'coalition') {
    const target = input.targetGuildId ?? '';
    if (target.length === 0 || guildIds.includes(target)) {
      return err('guild');
    }
    if (coalitionBank().ok) {
      return err('guild');
    }
    return ok({ ...base, targetGuildId: target });
  }
  if (input.kind === 'vassal') {
    const suzerainId = input.suzerainId ?? '';
    const vassalId = input.vassalId ?? '';
    if (
      suzerainId.length === 0 ||
      vassalId.length === 0 ||
      suzerainId === vassalId ||
      !guildIds.includes(suzerainId) ||
      !guildIds.includes(vassalId)
    ) {
      return err('guild');
    }
    const tax = input.taxPercent ?? 0;
    if (!Number.isInteger(tax) || tax < VASSAL_TAX_MIN || tax > VASSAL_TAX_MAX) {
      return err('tax');
    }
    return ok({ ...base, taxPercent: tax, suzerainId, vassalId });
  }
  if (guildIds.length !== 2) {
    return err('guild');
  }
  return ok(base);
}

export function pactLive(pact: GuildPact, nowMs: number): boolean {
  assertMs(nowMs, 'nowMs');
  if (pact.brokenAtMs != null) {
    return false;
  }
  // A vassal pact has no 7-day expiry. It stays up through the release notice.
  if (pact.kind === 'vassal') {
    return true;
  }
  return nowMs < pact.untilMs;
}

/**
 * The break is a later action. During the 24-hour notice the alliance still
 * holds. `pactLive` does not end it. This refuses until the notice has aged.
 */
export function breakAlliance(
  pact: GuildPact,
  nowMs: number,
): Result<GuildPact, 'kind' | 'notice' | 'early' | 'closed'> {
  assertMs(nowMs, 'nowMs');
  if (pact.kind !== 'alliance') {
    return err('kind');
  }
  if (pact.brokenAtMs != null || !pactLive({ ...pact, brokenAtMs: null }, nowMs)) {
    return err('closed');
  }
  if (pact.breakNoticeAtMs === null) {
    return err('notice');
  }
  if (nowMs < pact.breakNoticeAtMs + ALLIANCE_BREAK_MS) {
    return err('early');
  }
  return ok({ ...pact, brokenAtMs: nowMs });
}

/** Any stored live pact (alliance, coalition, vassal, non-aggression) is an ally. */
export function pactAlly(
  pacts: readonly GuildPact[],
  guildId: string,
  ownerGuildId: string,
  nowMs: number,
): boolean {
  if (guildId.length === 0 || ownerGuildId.length === 0 || guildId === ownerGuildId) {
    return false;
  }
  assertMs(nowMs, 'nowMs');
  return pacts.some((pact) => {
    if (!pactLive(pact, nowMs)) {
      return false;
    }
    if (pact.kind === 'vassal') {
      return (
        (pact.vassalId === guildId && pact.suzerainId === ownerGuildId) ||
        (pact.suzerainId === guildId && pact.vassalId === ownerGuildId)
      );
    }
    return pact.guildIds.includes(guildId) && pact.guildIds.includes(ownerGuildId);
  });
}

export function noticeAllianceBreak(
  pact: GuildPact,
  nowMs: number,
): Result<GuildPact, 'kind' | 'closed'> {
  assertMs(nowMs, 'nowMs');
  if (pact.kind !== 'alliance') {
    return err('kind');
  }
  if (!pactLive(pact, nowMs)) {
    return err('closed');
  }
  return ok({ ...pact, breakNoticeAtMs: nowMs });
}

/**
 * The release is a later action. During the 7-day notice the vassal pact still
 * holds. `pactLive` does not end it. This refuses until the notice has aged.
 */
export function releaseVassal(
  pact: GuildPact,
  nowMs: number,
): Result<GuildPact, 'kind' | 'notice' | 'early' | 'closed'> {
  assertMs(nowMs, 'nowMs');
  if (pact.kind !== 'vassal') {
    return err('kind');
  }
  if (pact.brokenAtMs != null || !pactLive({ ...pact, brokenAtMs: null }, nowMs)) {
    return err('closed');
  }
  if (pact.breakNoticeAtMs === null) {
    return err('notice');
  }
  if (nowMs < pact.breakNoticeAtMs + VASSAL_RELEASE_MS) {
    return err('early');
  }
  return ok({ ...pact, brokenAtMs: nowMs });
}

/** A vassal is released 7 real days after this notice, not on the alliance's 24-hour fuse. */
export function noticeVassalRelease(
  pact: GuildPact,
  nowMs: number,
): Result<GuildPact, 'kind' | 'closed'> {
  assertMs(nowMs, 'nowMs');
  if (pact.kind !== 'vassal') {
    return err('kind');
  }
  if (!pactLive(pact, nowMs)) {
    return err('closed');
  }
  return ok({ ...pact, breakNoticeAtMs: nowMs });
}

export function renewPact(pact: GuildPact, nowMs: number): Result<GuildPact, 'kind' | 'closed'> {
  assertMs(nowMs, 'nowMs');
  if (pact.kind !== 'alliance' && pact.kind !== 'non_aggression') {
    return err('kind');
  }
  if (!pactLive(pact, nowMs)) {
    return err('closed');
  }
  return ok({ ...pact, untilMs: nowMs + PACT_MS, breakNoticeAtMs: null });
}

/** Suzerains of a live vassal pact. They must defend when that vassal is attacked. */
export function suzerainDefenders(
  pacts: readonly GuildPact[],
  vassalGuildId: string,
  nowMs: number,
): string[] {
  assertMs(nowMs, 'nowMs');
  const ids: string[] = [];
  for (const pact of pacts) {
    if (pact.kind !== 'vassal' || pact.vassalId !== vassalGuildId || !pactLive(pact, nowMs)) {
      continue;
    }
    if (pact.suzerainId !== null && !ids.includes(pact.suzerainId)) {
      ids.push(pact.suzerainId);
    }
  }
  return ids;
}

/** The temporary diplomatic channel of a live coalition. No coalition means no post. */
export function coalitionChannel(
  pacts: readonly GuildPact[],
  guildId: string,
  nowMs: number,
): GuildPact | null {
  assertMs(nowMs, 'nowMs');
  return (
    pacts.find(
      (pact) => pact.kind === 'coalition' && pactLive(pact, nowMs) && pact.guildIds.includes(guildId),
    ) ?? null
  );
}

/** A vassal cannot open a war unless the suzerain has consented. */
export function vassalMayDeclare(input: {
  pacts: readonly GuildPact[];
  guildId: string;
  nowMs: number;
  suzerainConsent: boolean;
}): Result<true, 'vassal'> {
  assertMs(input.nowMs, 'nowMs');
  const bound = input.pacts.find(
    (pact) => pact.kind === 'vassal' && pact.vassalId === input.guildId && pactLive(pact, input.nowMs),
  );
  if (bound === undefined) {
    return ok(true);
  }
  if (!input.suzerainConsent) {
    return err('vassal');
  }
  return ok(true);
}

/** One day of the vassal tax, floored. `days` applies that cut once per day. */
export function applyVassalTithe(input: {
  bank: number;
  taxPercent: number;
  days: number;
}): Result<{ bank: number; tithe: number }, 'tax'> {
  assertNonNegativeInteger(input.bank, 'bank');
  if (!Number.isInteger(input.taxPercent) || input.taxPercent < VASSAL_TAX_MIN || input.taxPercent > VASSAL_TAX_MAX) {
    return err('tax');
  }
  if (!Number.isInteger(input.days) || input.days < 0) {
    throw new RangeError(`days must be an integer >= 0, got ${String(input.days)}`);
  }
  let bank = input.bank;
  let tithe = 0;
  for (let day = 0; day < input.days; day += 1) {
    const cut = Math.floor((bank * input.taxPercent) / 100);
    tithe += cut;
    bank -= cut;
  }
  return ok({ bank, tithe });
}

export function titheDays(input: { lastTitheAtMs: number | null; startedAtMs: number; nowMs: number }): number {
  assertMs(input.nowMs, 'nowMs');
  assertMs(input.startedAtMs, 'startedAtMs');
  if (input.lastTitheAtMs !== null) {
    assertMs(input.lastTitheAtMs, 'lastTitheAtMs');
  }
  const from = input.lastTitheAtMs ?? input.startedAtMs;
  if (input.nowMs <= from) {
    return 0;
  }
  return Math.floor((input.nowMs - from) / DAY_MS);
}

/**
 * Artifact 17 §9.3: the suzerain must defend the vassal.
 * A suzerain who never reaches the city during the defense window breaks that pact.
 * §9.4 names the breach: 50_000 gold and a reputation flag for 7 days.
 */
export function failSuzerainDefense(input: { bank: number; nowMs: number }): {
  bank: number;
  fine: number;
  flagUntilMs: number;
} {
  return breachNonAggression(input);
}

export function breachNonAggression(input: { bank: number; nowMs: number }): {
  bank: number;
  fine: number;
  flagUntilMs: number;
} {
  assertNonNegativeInteger(input.bank, 'bank');
  assertMs(input.nowMs, 'nowMs');
  const fine = Math.min(input.bank, NAP_BREACH_GOLD);
  return { bank: input.bank - fine, fine: NAP_BREACH_GOLD, flagUntilMs: input.nowMs + NAP_FLAG_MS };
}

export function allianceFriendlyFire(
  pacts: readonly GuildPact[],
  guildId: string,
  otherGuildId: string,
  nowMs: number,
): boolean {
  return pacts.some(
    (pact) =>
      pact.kind === 'alliance' &&
      pactLive(pact, nowMs) &&
      pact.guildIds.includes(guildId) &&
      pact.guildIds.includes(otherGuildId),
  );
}

export function napBetween(
  pacts: readonly GuildPact[],
  guildId: string,
  otherGuildId: string,
  nowMs: number,
): GuildPact | undefined {
  return pacts.find(
    (pact) =>
      pact.kind === 'non_aggression' &&
      pactLive(pact, nowMs) &&
      pact.guildIds.includes(guildId) &&
      pact.guildIds.includes(otherGuildId),
  );
}

export function postMercenary(input: {
  rank: GuildRank;
  kind: string;
  rewardGold: number;
  bank: number;
  mercenaryId: string;
  memberIds: readonly string[];
  nowMs: number;
  durationMs: number;
  nodeId: string;
  destinationId?: string;
}): Result<
  {
    kind: MercenaryKind;
    rewardGold: number;
    mercenaryId: string;
    untilMs: number;
    nodeId: string;
    durationMs: number;
    destinationId: string | null;
  },
  'rank' | 'gold' | 'member' | 'kind'
> {
  if (!isRank(input.rank)) {
    throw new RangeError(`unknown rank: ${String(input.rank)}`);
  }
  if (input.rank !== 'leader' && input.rank !== 'council') {
    return err('rank');
  }
  if (!isMercenaryKind(input.kind)) {
    return err('kind');
  }
  if (input.mercenaryId.length === 0 || input.nodeId.length === 0) {
    return err('member');
  }
  if (input.memberIds.includes(input.mercenaryId)) {
    return err('member');
  }
  assertNonNegativeInteger(input.bank, 'bank');
  assertMs(input.nowMs, 'nowMs');
  assertNonNegativeInteger(input.durationMs, 'durationMs');
  if (!Number.isInteger(input.rewardGold) || input.rewardGold <= 0 || input.bank < input.rewardGold) {
    return err('gold');
  }
  if (input.durationMs <= 0) {
    return err('kind');
  }
  const destinationId = input.destinationId ?? null;
  if (input.kind === 'escort' && destinationId !== null && destinationId === input.nodeId) {
    return err('kind');
  }
  return ok({
    kind: input.kind,
    rewardGold: input.rewardGold,
    mercenaryId: input.mercenaryId,
    untilMs: input.nowMs + input.durationMs,
    nodeId: input.nodeId,
    durationMs: input.durationMs,
    destinationId,
  });
}

/** Escort pay requires a walk along edges from the start node to the destination. */
export function escortArrived(input: {
  startId: string;
  destinationId: string | null;
  trail: readonly string[];
  edges: readonly { a: string; b: string }[];
}): boolean {
  if (input.destinationId === null || input.destinationId === input.startId) {
    return false;
  }
  if (input.trail.length < 2 || input.trail[0] !== input.startId) {
    return false;
  }
  if (input.trail[input.trail.length - 1] !== input.destinationId) {
    return false;
  }
  for (let index = 1; index < input.trail.length; index += 1) {
    const from = input.trail[index - 1] ?? '';
    const to = input.trail[index] ?? '';
    const linked = input.edges.some(
      (edge) => (edge.a === from && edge.b === to) || (edge.a === to && edge.b === from),
    );
    if (!linked) {
      return false;
    }
  }
  return true;
}

export function postPatrolQuest(input: {
  rank: GuildRank;
  rewardGold: number;
  bank: number;
  nodeId: string;
  nowMs: number;
  durationMs: number;
}): Result<{ rewardGold: number; nodeId: string; untilMs: number; durationMs: number }, 'rank' | 'gold' | 'node'> {
  if (!isRank(input.rank)) {
    throw new RangeError(`unknown rank: ${String(input.rank)}`);
  }
  if (input.rank !== 'leader' && input.rank !== 'council') {
    return err('rank');
  }
  if (input.nodeId.length === 0) {
    return err('node');
  }
  assertNonNegativeInteger(input.bank, 'bank');
  assertMs(input.nowMs, 'nowMs');
  assertNonNegativeInteger(input.durationMs, 'durationMs');
  if (input.durationMs <= 0) {
    return err('node');
  }
  if (!Number.isInteger(input.rewardGold) || input.rewardGold <= 0 || input.bank < input.rewardGold) {
    return err('gold');
  }
  return ok({
    rewardGold: input.rewardGold,
    nodeId: input.nodeId,
    untilMs: input.nowMs + input.durationMs,
    durationMs: input.durationMs,
  });
}

export interface GuildQuestPost {
  rewardGold: number;
  nodeId: string;
  untilMs: number;
  durationMs: number;
  visibleTo: 'members';
}

/**
 * Artifact 17 §8.7. A leader or council member posts a guild quest.
 * The named example is a node patrol for 3 real hours paying 5 000 gold.
 * Members can see it. The bank is not charged until the quest is completed.
 */
export function postGuildQuest(input: {
  rank: GuildRank;
  nodeId: string;
  nowMs: number;
  bank: number;
  rewardGold?: number;
  durationMs?: number;
}): Result<GuildQuestPost, 'rank' | 'gold' | 'node'> {
  const posted = postPatrolQuest({
    rank: input.rank,
    rewardGold: input.rewardGold ?? PATROL_QUEST_GOLD,
    bank: input.bank,
    nodeId: input.nodeId,
    nowMs: input.nowMs,
    durationMs: input.durationMs ?? PATROL_QUEST_MS,
  });
  if (!posted.ok) {
    return posted;
  }
  return ok({ ...posted.value, visibleTo: 'members' });
}

/**
 * Artifact 17 §8.7. Staying on the node for the full duration completes the
 * quest and pays the bank reward. A missed deadline, or a bank that can no
 * longer cover the reward, fails the quest and pays nothing.
 */
export function settleGuildQuest(input: {
  status: ContractStatus;
  presentMs: number;
  durationMs: number;
  untilMs: number;
  deltaMs: number;
  present: boolean;
  nowMs: number;
  bank: number;
  rewardGold: number;
}): { status: ContractStatus; presentMs: number; pay: number } {
  return tickContract({ ...input, kind: 'patrol' });
}

export type ContractStatus = 'open' | 'complete' | 'failed';

/**
 * Patrol completes by staying on the node for `durationMs`.
 * Defend and attack complete only after combat duty (`duty`).
 * Escort completes only after the mercenary has traveled (`duty`), not by standing still.
 * The deadline without that duty fails the contract and pays nothing.
 */
export function tickContract(input: {
  status: ContractStatus;
  presentMs: number;
  durationMs: number;
  untilMs: number;
  deltaMs: number;
  present: boolean;
  nowMs: number;
  bank: number;
  rewardGold: number;
  kind?: MercenaryKind;
  duty?: boolean;
}): { status: ContractStatus; presentMs: number; pay: number } {
  assertNonNegativeInteger(input.presentMs, 'presentMs');
  assertNonNegativeInteger(input.durationMs, 'durationMs');
  assertNonNegativeInteger(input.deltaMs, 'deltaMs');
  assertNonNegativeInteger(input.bank, 'bank');
  assertMs(input.nowMs, 'nowMs');
  assertMs(input.untilMs, 'untilMs');
  if (input.status !== 'open') {
    return { status: input.status, presentMs: input.presentMs, pay: 0 };
  }
  const kind = input.kind ?? 'patrol';
  const presentMs = input.present ? input.presentMs + input.deltaMs : input.presentMs;
  if (kind === 'patrol') {
    if (presentMs >= input.durationMs) {
      if (input.bank < input.rewardGold) {
        return { status: 'failed', presentMs, pay: 0 };
      }
      return { status: 'complete', presentMs, pay: input.rewardGold };
    }
    if (input.nowMs >= input.untilMs) {
      return { status: 'failed', presentMs, pay: 0 };
    }
    return { status: 'open', presentMs, pay: 0 };
  }
  if (input.duty === true) {
    if (input.bank < input.rewardGold) {
      return { status: 'failed', presentMs, pay: 0 };
    }
    return { status: 'complete', presentMs, pay: input.rewardGold };
  }
  if (input.nowMs >= input.untilMs) {
    return { status: 'failed', presentMs, pay: 0 };
  }
  return { status: 'open', presentMs, pay: 0 };
}

export interface WarStamp {
  attackerGuildId: string;
  ownerGuildId: string | null;
  cityId: string;
  atMs: number;
  roster: readonly string[];
  blows: number;
  elapsedMs: number;
  heldMs: number;
  result: 'declared' | 'win' | 'draw';
}

export type CollusionReason = 'repeat_no_fight' | 'same_roster' | 'quick_win' | 'city_swap';

function rosterKey(roster: readonly string[]): string {
  return [...roster].sort().join('\0');
}

/** A 10-minute hold is a real defense. A war with no blows and no hold was not fought. */
function warWasFought(stamp: WarStamp): boolean {
  return stamp.blows > 0 || (stamp.result === 'win' && stamp.heldMs >= WAR_HOLD_MS);
}

/**
 * Artifact 17 §11. Alt-guilds, collusion, portal grief, votes, and multibox.
 * Repeated wars without a fight, identical rosters, quick wins, and city swaps
 * freeze rewards until a review. A legal 10-minute hold is not a quick win.
 */
export function reviewSection11(input: {
  nowMs: number;
  lastOfficeMs: number | null;
  history: readonly WarStamp[];
  next: WarStamp | null;
  portals: readonly { cityId: string; blockedForMs: number; warActive: boolean }[];
  ballots: readonly { voterId: string; ai: boolean; carrierOnline: boolean }[];
  carriers: readonly { carrierId: string; botIds: readonly string[] }[];
  withdrawalsLogged: number;
}): {
  altGuild: 'ok' | 'cooldown';
  reasons: CollusionReason[];
  freezeRewards: boolean;
  portalsLifted: string[];
  vote: 'ok' | 'offline' | 'stuffed';
  multibox: 'ok' | 'carrier';
  withdrawalsLogged: number;
} {
  assertMs(input.nowMs, 'nowMs');
  if (!Number.isInteger(input.withdrawalsLogged) || input.withdrawalsLogged < 0) {
    throw new RangeError(`withdrawalsLogged must be an integer >= 0, got ${String(input.withdrawalsLogged)}`);
  }
  let altGuild: 'ok' | 'cooldown' = 'ok';
  if (input.lastOfficeMs !== null) {
    assertMs(input.lastOfficeMs, 'lastOfficeMs');
    if (input.nowMs - input.lastOfficeMs < OFFICE_COOLDOWN_MS) {
      altGuild = 'cooldown';
    }
  }
  const reasons: CollusionReason[] = [];
  const next = input.next;
  if (next !== null) {
    const quiet = !warWasFought(next);
    const priorQuiet = input.history.some(
      (row) =>
        row.attackerGuildId === next.attackerGuildId &&
        row.cityId === next.cityId &&
        row.ownerGuildId === next.ownerGuildId &&
        row.result !== 'declared' &&
        !warWasFought(row),
    );
    if (quiet && next.result !== 'declared' && priorQuiet) {
      reasons.push('repeat_no_fight');
    }
    if (quiet && next.result === 'declared' && priorQuiet) {
      reasons.push('repeat_no_fight');
    }
    if (next.roster.length >= 2) {
      const key = rosterKey(next.roster);
      if (
        input.history.some(
          (row) =>
            row.attackerGuildId === next.attackerGuildId &&
            row.cityId === next.cityId &&
            rosterKey(row.roster) === key,
        )
      ) {
        reasons.push('same_roster');
      }
    }
    if (next.result === 'win' && next.blows === 0 && next.heldMs < WAR_HOLD_MS) {
      reasons.push('quick_win');
    }
    if (
      (next.result === 'win' || next.result === 'declared') &&
      next.ownerGuildId !== null &&
      next.attackerGuildId !== next.ownerGuildId &&
      input.history.some(
        (row) =>
          row.result === 'win' &&
          row.attackerGuildId !== row.ownerGuildId &&
          row.attackerGuildId === next.ownerGuildId &&
          row.ownerGuildId === next.attackerGuildId,
      )
    ) {
      reasons.push('city_swap');
    }
  }
  const portalsLifted: string[] = [];
  for (const portal of input.portals) {
    const asked = askHostilePortal({
      stance: 'neutral',
      warActive: portal.warActive,
      blockedForMs: portal.blockedForMs,
      granted: false,
    });
    if (asked.ok && !portal.warActive && portal.blockedForMs >= PORTAL_BLOCK_MS) {
      portalsLifted.push(portal.cityId);
    }
  }
  const seen = new Set<string>();
  let vote: 'ok' | 'offline' | 'stuffed' = 'ok';
  for (const ballot of input.ballots) {
    if (seen.has(ballot.voterId)) {
      vote = 'stuffed';
      continue;
    }
    seen.add(ballot.voterId);
    if (ballot.ai && !ballot.carrierOnline && vote === 'ok') {
      vote = 'offline';
    }
  }
  let multibox: 'ok' | 'carrier' = 'ok';
  for (const carrier of input.carriers) {
    if (new Set(carrier.botIds.filter((id) => id.length > 0)).size > 1) {
      multibox = 'carrier';
    }
  }
  return {
    altGuild,
    reasons,
    freezeRewards: reasons.length > 0,
    portalsLifted,
    vote,
    multibox,
    withdrawalsLogged: input.withdrawalsLogged,
  };
}

/** Artifact 32 §2. A moderator or an administrator performs the section 11 review. */
export const REVIEWER_ROLES = ['moderator', 'admin'] as const;

/**
 * Artifact 17 §11. Rewards stay frozen until a review. The section names no
 * duration, so a later clock reading does not end the freeze by itself.
 * `reviewedAtMs` is the reviewer action. Null means the case is still open.
 */
export function rewardFreezeEnds(
  frozenAtMs: number,
  nowMs: number,
  reviewedAtMs: number | null = null,
): boolean {
  assertMs(frozenAtMs, 'frozenAtMs');
  assertMs(nowMs, 'nowMs');
  if (reviewedAtMs === null) {
    return false;
  }
  assertMs(reviewedAtMs, 'reviewedAtMs');
  return reviewedAtMs >= frozenAtMs && nowMs >= reviewedAtMs;
}

/** The review is a person with a reviewer role. Time since the freeze is not a role. */
export function acceptRewardReview(input: {
  role: string;
  frozenAtMs: number;
  nowMs: number;
}): Result<{ reviewedAtMs: number }, 'rank'> {
  assertMs(input.frozenAtMs, 'frozenAtMs');
  assertMs(input.nowMs, 'nowMs');
  if (!(REVIEWER_ROLES as readonly string[]).includes(input.role)) {
    return err('rank');
  }
  return ok({ reviewedAtMs: input.nowMs });
}

/** Artifact 17 §12 target bands. These score observations. They do not refuse an action. */
export const SECTION12 = {
  guildsPerThousandMin: 30,
  guildsPerThousandMax: 50,
  guildSizeMin: 20,
  guildSizeMax: 30,
  playersInGuildsPercent: 60,
  aiInGuildsPercent: 50,
  warsPerDayMin: 1,
  warsPerDayMax: 2,
  warParticipantsMin: 20,
  warParticipantsMax: 80,
  warDurationMinMs: 60 * 60 * 1000,
  warDurationMaxMs: 90 * 60 * 1000,
  siegeWinPercent: 30,
  drawPercent: 10,
  nodeTaxPercent: 15,
  nodeCapturesMin: 5,
  nodeCapturesMax: 10,
  bankTurnoverGold: 100_000,
} as const;

export interface Section12Input {
  online: number;
  guilds: number;
  members: number;
  players: number;
  playersInGuilds: number;
  ai: number;
  aiInGuilds: number;
  warsToday: number;
  warParticipants: number | null;
  warDurationMs: number | null;
  sieges: number;
  siegeWins: number;
  draws: number;
  taxPercentSum: number;
  taxedNodes: number;
  capturesToday: number;
  turnoverToday: number;
}

export interface Section12Metric {
  observed: number | null;
  onTarget: boolean | null;
}

export interface Section12Report {
  guildsPerThousandOnline: Section12Metric;
  averageGuildSize: Section12Metric;
  playersInGuilds: Section12Metric;
  aiInGuilds: Section12Metric;
  warsPerDay: Section12Metric;
  warParticipants: Section12Metric;
  warDurationMs: Section12Metric;
  successfulSieges: Section12Metric;
  draws: Section12Metric;
  averageNodeTax: Section12Metric;
  nodeCapturesPerDay: Section12Metric;
  guildBankTurnover: Section12Metric;
}

function scoredCount(value: number, label: string): number {
  assertNonNegativeInteger(value, label);
  return value;
}

function band(value: number, min: number, max: number): Section12Metric {
  return { observed: value, onTarget: value >= min && value <= max };
}

function point(value: number | null, target: number): Section12Metric {
  if (value === null) {
    return { observed: null, onTarget: null };
  }
  return { observed: value, onTarget: value === target };
}

function share(part: number, whole: number, target: number): Section12Metric {
  if (whole <= 0) {
    return { observed: null, onTarget: null };
  }
  const observed = Math.floor((part * 100) / whole);
  return { observed, onTarget: observed === target };
}

/**
 * Artifact 17 §12. Each row is a target value for the live sample.
 * A zero denominator is not scored. Nothing in this function refuses play.
 */
export function measureSection12(input: Section12Input): Section12Report {
  const online = scoredCount(input.online, 'online');
  const guilds = scoredCount(input.guilds, 'guilds');
  const members = scoredCount(input.members, 'members');
  const players = scoredCount(input.players, 'players');
  const playersInGuilds = scoredCount(input.playersInGuilds, 'playersInGuilds');
  const ai = scoredCount(input.ai, 'ai');
  const aiInGuilds = scoredCount(input.aiInGuilds, 'aiInGuilds');
  const warsToday = scoredCount(input.warsToday, 'warsToday');
  const sieges = scoredCount(input.sieges, 'sieges');
  const siegeWins = scoredCount(input.siegeWins, 'siegeWins');
  const draws = scoredCount(input.draws, 'draws');
  const taxPercentSum = scoredCount(input.taxPercentSum, 'taxPercentSum');
  const taxedNodes = scoredCount(input.taxedNodes, 'taxedNodes');
  const capturesToday = scoredCount(input.capturesToday, 'capturesToday');
  const turnoverToday = scoredCount(input.turnoverToday, 'turnoverToday');
  if (input.warParticipants !== null) {
    assertNonNegativeInteger(input.warParticipants, 'warParticipants');
  }
  if (input.warDurationMs !== null) {
    assertNonNegativeInteger(input.warDurationMs, 'warDurationMs');
  }
  const guildsPerThousand =
    online === 0 ? null : Math.floor((guilds * 1000) / online);
  const averageSize = guilds === 0 ? null : Math.floor(members / guilds);
  const averageTax = taxedNodes === 0 ? null : Math.floor(taxPercentSum / taxedNodes);
  return {
    guildsPerThousandOnline:
      guildsPerThousand === null
        ? { observed: null, onTarget: null }
        : band(guildsPerThousand, SECTION12.guildsPerThousandMin, SECTION12.guildsPerThousandMax),
    averageGuildSize:
      averageSize === null
        ? { observed: null, onTarget: null }
        : band(averageSize, SECTION12.guildSizeMin, SECTION12.guildSizeMax),
    playersInGuilds: share(playersInGuilds, players, SECTION12.playersInGuildsPercent),
    aiInGuilds: share(aiInGuilds, ai, SECTION12.aiInGuildsPercent),
    warsPerDay: band(warsToday, SECTION12.warsPerDayMin, SECTION12.warsPerDayMax),
    warParticipants:
      input.warParticipants === null
        ? { observed: null, onTarget: null }
        : band(input.warParticipants, SECTION12.warParticipantsMin, SECTION12.warParticipantsMax),
    warDurationMs:
      input.warDurationMs === null
        ? { observed: null, onTarget: null }
        : band(input.warDurationMs, SECTION12.warDurationMinMs, SECTION12.warDurationMaxMs),
    successfulSieges: share(siegeWins, sieges, SECTION12.siegeWinPercent),
    draws: share(draws, sieges, SECTION12.drawPercent),
    averageNodeTax: point(averageTax, SECTION12.nodeTaxPercent),
    nodeCapturesPerDay: band(capturesToday, SECTION12.nodeCapturesMin, SECTION12.nodeCapturesMax),
    guildBankTurnover: point(turnoverToday, SECTION12.bankTurnoverGold),
  };
}
