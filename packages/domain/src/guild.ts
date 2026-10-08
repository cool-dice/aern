import { GUILD_BANK_CAP } from './economy';
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
/** A novice cannot be promoted before this probation ends. */
export const NOVICE_LOCK_MS = 72 * 60 * 60 * 1000;

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
    leaderId: input.leaderId,
    memberIds: [...ids],
    gold: 0,
  });
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
  if (input.rank === 'novice') {
    if (input.amount === 0) {
      return ok({ bank: input.bank, amount: 0 });
    }
    return err('rank');
  }
  if (input.amount > input.bank) {
    return err('gold');
  }
  if (input.amount === 0) {
    return ok({ bank: input.bank, amount: 0 });
  }

  const allowance = Math.floor((input.bank * WITHDRAW_PERCENT[input.rank]) / 100);
  const band10 = Math.floor((input.bank * 10) / 100);
  const band25 = Math.floor((input.bank * 25) / 100);
  if (input.rank === 'officer' || input.rank === 'veteran') {
    if (input.amount > allowance) {
      return err('limit');
    }
    return ok({ bank: input.bank - input.amount, amount: input.amount });
  }

  const confirmed = input.leaderConfirm && input.councilConfirms >= 2;
  if (input.amount <= band10) {
    if (input.amount > allowance) {
      return err('limit');
    }
    return ok({ bank: input.bank - input.amount, amount: input.amount });
  }
  if (input.amount <= band25) {
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
 * The same call seizes the chest. The tick must not leave it on the node.
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
 * When the flag drops, the guild that held the node seizes the chest.
 * The chest is not left on the node. A later planter who finds a chest
 * still on a neutral node (the drop did not run) takes that chest instead.
 */
export function settleNodeDrop(
  before: ResourceNode,
  after: ResourceNode,
): { node: ResourceNode; seized: { guildId: string; amount: number } | null } {
  const dropped = before.guildId !== null && after.guildId === null;
  if (dropped && before.guildId !== null && before.chest > 0) {
    return {
      node: { ...after, chest: 0 },
      seized: { guildId: before.guildId, amount: before.chest },
    };
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
  if (pact.breakNoticeAtMs !== null && pact.kind === 'vassal') {
    return nowMs < pact.breakNoticeAtMs + VASSAL_RELEASE_MS;
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
}): Result<
  { kind: MercenaryKind; rewardGold: number; mercenaryId: string; untilMs: number; nodeId: string; durationMs: number },
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
  return ok({
    kind: input.kind,
    rewardGold: input.rewardGold,
    mercenaryId: input.mercenaryId,
    untilMs: input.nowMs + input.durationMs,
    nodeId: input.nodeId,
    durationMs: input.durationMs,
  });
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
