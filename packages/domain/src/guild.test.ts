import { expect, test } from 'vitest';
import { GUILD_BANK_CAP } from './economy';
import {
  CITY_CAPTURE_COOLDOWN_MS,
  CONTENDER_CLOSE_MS,
  CONTENDER_GOLD,
  DOCTRINE_COOLDOWN_MS,
  DOCTRINE_MULTIPLIER,
  DRAW_WAR_COOLDOWN_MS,
  GUILD_BANK_SLOTS,
  GUILD_CREATE_GOLD,
  GUILD_WAR_COOLDOWN_MS,
  NOVICE_LOCK_MS,
  OFFICE_COOLDOWN_MS,
  WAR_ASSAULT_MS,
  WAR_FINISH_MS,
  WAR_GOLD,
  WAR_HOLD_MS,
  WAR_LEAD_MS,
  WAR_MUSTER_MS,
  WAR_RESOURCES,
  advanceHold,
  applyDoctrine,
  canDissolve,
  canVote,
  castLeaderVote,
  createGuild,
  NEUTRAL_CAPTURE_GOLD,
  NEUTRAL_GUARD_COUNT,
  declareNeutralCapture,
  declareWar,
  depositBank,
  dissolveShares,
  doctrineMultiplier,
  founderRanks,
  holdWins,
  postContract,
  registerContender,
  seatRank,
  setDoctrine,
  settleWar,
  warPhase,
  warWinner,
  withdraw,
  NODE_CHEST_CAP,
  NODE_DROP_MS,
  NODE_PLANT_MS,
  NODE_TAX_COOLDOWN_MS,
  NODE_TAX_MAX,
  advanceResourceNode,
  depositNodeChest,
  freshResourceNode,
  NODE_TAX_OFFICER_MAX,
  PATROL_QUEST_GOLD,
  PATROL_QUEST_MS,
  ALLIANCE_BREAK_MS,
  NAP_BREACH_GOLD,
  PACT_MS,
  VASSAL_RELEASE_MS,
  VASSAL_TAX_MIN,
  applyVassalTithe,
  breachNonAggression,
  formPact,
  breakAlliance,
  releaseVassal,
  noticeAllianceBreak,
  noticeVassalRelease,
  coalitionChannel,
  pactAlly,
  pactLive,
  suzerainDefenders,
  renewPact,
  postMercenary,
  postPatrolQuest,
  nodeAccessCategory,
  setNodeAccess,
  setNodeTax,
  settleNodeDrop,
  tickContract,
  vassalMayDeclare,
  type GuildFounder,
} from './guild';
import { mulberry32, type Rng } from './rng';

const DAY_MS = 24 * 60 * 60 * 1000;

function founders(levels: number[]): GuildFounder[] {
  return levels.map((level, index) => ({
    id: index === 0 ? 'leader' : `m${String(index)}`,
    level,
    inGuild: false,
  }));
}

function quietRng(): Rng {
  return {
    nextInt(): number {
      throw new Error('rng should not be called');
    },
    nextUnit(): number {
      throw new Error('rng should not be called');
    },
  };
}

function draftInput(overrides: Partial<Parameters<typeof createGuild>[0]> = {}) {
  return {
    name: 'Red Wolves',
    tag: 'RW',
    initiatorId: 'leader',
    founders: founders([5, 5, 5, 5]),
    gold: GUILD_CREATE_GOLD,
    nowMs: 0,
    lastOfficeMs: null,
    leaderId: 'leader',
    ...overrides,
  };
}

test('three founders are refused and four of level 5 pay the charter fee', () => {
  expect(createGuild(draftInput({ founders: founders([5, 5, 5]) }))).toEqual({
    ok: false,
    code: 'size',
  });
  expect(createGuild(draftInput())).toEqual({
    ok: true,
    value: {
      name: 'Red Wolves',
      tag: 'RW',
      leaderId: 'leader',
      memberIds: ['leader', 'm1', 'm2', 'm3'],
      gold: 0,
    },
  });
  expect(GUILD_CREATE_GOLD).toBe(10_000);
});

test('a founder below level 5 is refused', () => {
  expect(createGuild(draftInput({ founders: founders([5, 5, 5, 4]) }))).toEqual({
    ok: false,
    code: 'level',
  });
});

test('creation requires 10000 gold, a free initiator, and no current guild', () => {
  expect(createGuild(draftInput({ gold: 9_999 }))).toEqual({ ok: false, code: 'gold' });
  const joined = founders([5, 5, 5, 5]);
  joined[1] = { id: 'm1', level: 5, inGuild: true };
  expect(createGuild(draftInput({ founders: joined }))).toEqual({ ok: false, code: 'member' });
  expect(createGuild(draftInput({ lastOfficeMs: 0, nowMs: OFFICE_COOLDOWN_MS - 1 }))).toEqual({
    ok: false,
    code: 'cooldown',
  });
  expect(createGuild(draftInput({ lastOfficeMs: 0, nowMs: OFFICE_COOLDOWN_MS })).ok).toBe(true);
});

test('duplicate founders are not four unique characters', () => {
  const duplicated = founders([5, 5, 5, 5]);
  duplicated[3] = { id: 'm1', level: 5, inGuild: false };
  expect(createGuild(draftInput({ founders: duplicated }))).toEqual({ ok: false, code: 'size' });
});

test('names are 3..24 letters and spaces, tags are 2..4 uppercase latin letters', () => {
  expect(createGuild(draftInput({ name: 'Ярость' })).ok).toBe(true);
  expect(() => createGuild(draftInput({ name: 'ab' }))).toThrow(RangeError);
  expect(() => createGuild(draftInput({ name: 'Red1' }))).toThrow(RangeError);
  expect(() => createGuild(draftInput({ tag: 'rw' }))).toThrow(RangeError);
  expect(() => createGuild(draftInput({ tag: 'R' }))).toThrow(RangeError);
  expect(() => createGuild(draftInput({ tag: 'ABCDE' }))).toThrow(RangeError);
  expect(createGuild(draftInput({ tag: 'ABCD' })).ok).toBe(true);
});

test('the elected leader starts as leader and the other founders as novices', () => {
  expect(founderRanks('leader', ['leader', 'm1', 'm2', 'm3'])).toEqual([
    { id: 'leader', rank: 'leader' },
    { id: 'm1', rank: 'novice' },
    { id: 'm2', rank: 'novice' },
    { id: 'm3', rank: 'novice' },
  ]);
});

test('a vote for oneself does not count, and a ballot of only self-votes is self_vote', () => {
  const members = ['a', 'b', 'c', 'd'];
  expect(
    castLeaderVote({
      memberIds: members,
      ballots: [{ voterId: 'a', candidateId: 'a' }],
      revote: false,
      rng: quietRng(),
    }),
  ).toEqual({ ok: false, code: 'self_vote' });

  expect(
    castLeaderVote({
      memberIds: members,
      ballots: [
        { voterId: 'a', candidateId: 'a' },
        { voterId: 'b', candidateId: 'c' },
      ],
      revote: false,
      rng: quietRng(),
    }),
  ).toEqual({
    ok: true,
    value: { status: 'elected', leaderId: 'c', votes: 1, method: 'ballot' },
  });
});

test('a candidate needs more than half of the counted ballots', () => {
  expect(
    castLeaderVote({
      memberIds: ['a', 'b', 'c', 'd'],
      ballots: [
        { voterId: 'b', candidateId: 'a' },
        { voterId: 'c', candidateId: 'a' },
        { voterId: 'd', candidateId: 'a' },
      ],
      revote: false,
      rng: quietRng(),
    }),
  ).toEqual({
    ok: true,
    value: { status: 'elected', leaderId: 'a', votes: 3, method: 'ballot' },
  });
});

test('the first tie asks for a revote and the second tie uses rng', () => {
  const ballots = [
    { voterId: 'a', candidateId: 'm' },
    { voterId: 'b', candidateId: 'q' },
  ];
  const members = ['a', 'b', 'm', 'q'];
  expect(castLeaderVote({ memberIds: members, ballots, revote: false, rng: quietRng() })).toEqual({
    ok: true,
    value: { status: 'tie', candidateIds: ['m', 'q'], revote: true },
  });

  const probe = mulberry32(7);
  const expected = ['m', 'q'][probe.nextInt(2)];
  expect(
    castLeaderVote({
      memberIds: members,
      ballots,
      revote: true,
      rng: mulberry32(7),
    }),
  ).toEqual({
    ok: true,
    value: { status: 'elected', leaderId: expected, votes: 1, method: 'rng' },
  });
});

test('a unique plurality that is not a majority is still a tie', () => {
  const ballots = [
    { voterId: 'a', candidateId: 'b' },
    { voterId: 'c', candidateId: 'b' },
    { voterId: 'd', candidateId: 'a' },
    { voterId: 'e', candidateId: 'd' },
  ];
  const members = ['a', 'b', 'c', 'd', 'e'];
  expect(castLeaderVote({ memberIds: members, ballots, revote: false, rng: quietRng() })).toEqual({
    ok: true,
    value: { status: 'tie', candidateIds: ['b'], revote: true },
  });
  expect(castLeaderVote({ memberIds: members, ballots, revote: true, rng: mulberry32(1) })).toEqual(
    {
      ok: true,
      value: { status: 'elected', leaderId: 'b', votes: 2, method: 'rng' },
    },
  );
});

test('a novice ballot is refused and an outsider ballot is refused', () => {
  expect(canVote('novice')).toEqual({ ok: false, code: 'rank' });
  expect(canVote('veteran')).toEqual({ ok: true, value: true });
  expect(
    castLeaderVote({
      memberIds: ['a', 'b'],
      ballots: [{ voterId: 'a', candidateId: 'b' }],
      revote: false,
      rng: quietRng(),
      ranks: { a: 'novice' },
    }),
  ).toEqual({ ok: false, code: 'rank' });
  expect(
    castLeaderVote({
      memberIds: ['a', 'b'],
      ballots: [{ voterId: 'a', candidateId: 'z' }],
      revote: false,
      rng: quietRng(),
    }),
  ).toEqual({ ok: false, code: 'member' });
});

test('rank seats stop at one leader, three council, and ten officers', () => {
  const open = { leader: 0, council: 0, officer: 0 };
  expect(seatRank({ rank: 'leader', from: null, counts: open, joinedAtMs: 0, nowMs: 0 })).toEqual({
    ok: true,
    value: { rank: 'leader' },
  });
  expect(
    seatRank({
      rank: 'leader',
      from: null,
      counts: { leader: 1, council: 0, officer: 0 },
      joinedAtMs: 0,
      nowMs: 0,
    }),
  ).toEqual({ ok: false, code: 'limit' });
  expect(
    seatRank({
      rank: 'council',
      from: 'veteran',
      counts: { leader: 1, council: 3, officer: 0 },
      joinedAtMs: 0,
      nowMs: 0,
    }),
  ).toEqual({ ok: false, code: 'limit' });
  expect(
    seatRank({
      rank: 'officer',
      from: 'veteran',
      counts: { leader: 1, council: 0, officer: 10 },
      joinedAtMs: 0,
      nowMs: 0,
    }),
  ).toEqual({ ok: false, code: 'limit' });
  expect(
    seatRank({
      rank: 'officer',
      from: 'veteran',
      counts: { leader: 1, council: 0, officer: 9 },
      joinedAtMs: 0,
      nowMs: 0,
    }).ok,
  ).toBe(true);
});

test('a novice cannot be promoted before 72 hours', () => {
  const counts = { leader: 1, council: 0, officer: 0 };
  expect(
    seatRank({
      rank: 'veteran',
      from: 'novice',
      counts,
      joinedAtMs: 0,
      nowMs: NOVICE_LOCK_MS - 1,
    }),
  ).toEqual({ ok: false, code: 'cooldown' });
  expect(
    seatRank({
      rank: 'veteran',
      from: 'novice',
      counts,
      joinedAtMs: 0,
      nowMs: NOVICE_LOCK_MS,
    }),
  ).toEqual({ ok: true, value: { rank: 'veteran' } });
});

test('a novice withdraws nothing and a leader takes 10 percent without a vote', () => {
  expect(
    withdraw({
      rank: 'novice',
      bank: 1_000,
      amount: 0,
      leaderConfirm: false,
      councilConfirms: 0,
      councilVote: false,
    }),
  ).toEqual({ ok: true, value: { bank: 1_000, amount: 0 } });
  expect(
    withdraw({
      rank: 'novice',
      bank: 1_000,
      amount: 1,
      leaderConfirm: true,
      councilConfirms: 2,
      councilVote: true,
    }),
  ).toEqual({ ok: false, code: 'rank' });
  expect(
    withdraw({
      rank: 'leader',
      bank: 1_000,
      amount: 100,
      leaderConfirm: false,
      councilConfirms: 0,
      councilVote: false,
    }),
  ).toEqual({ ok: true, value: { bank: 900, amount: 100 } });
});

test('101 gold from a 1000 bank needs confirmation', () => {
  expect(
    withdraw({
      rank: 'leader',
      bank: 1_000,
      amount: 101,
      leaderConfirm: false,
      councilConfirms: 0,
      councilVote: false,
    }),
  ).toEqual({ ok: false, code: 'confirm' });
});

test('leader and two council cover 10 to 25 percent, and above 25 needs councilVote', () => {
  const flags = { leaderConfirm: true, councilConfirms: 2, councilVote: false };
  expect(withdraw({ rank: 'leader', bank: 1_000, amount: 100, ...flags })).toEqual({
    ok: true,
    value: { bank: 900, amount: 100 },
  });
  expect(withdraw({ rank: 'leader', bank: 1_000, amount: 250, ...flags })).toEqual({
    ok: true,
    value: { bank: 750, amount: 250 },
  });
  expect(withdraw({ rank: 'leader', bank: 1_000, amount: 251, ...flags })).toEqual({
    ok: false,
    code: 'confirm',
  });
  expect(
    withdraw({
      rank: 'leader',
      bank: 1_000,
      amount: 251,
      leaderConfirm: true,
      councilConfirms: 2,
      councilVote: true,
    }),
  ).toEqual({ ok: true, value: { bank: 749, amount: 251 } });
  expect(
    withdraw({
      rank: 'leader',
      bank: 1_000,
      amount: 250,
      leaderConfirm: false,
      councilConfirms: 2,
      councilVote: true,
    }),
  ).toEqual({ ok: false, code: 'confirm' });
});

test('withdrawal percents floor against the current bank', () => {
  expect(
    withdraw({
      rank: 'leader',
      bank: 105,
      amount: 10,
      leaderConfirm: false,
      councilConfirms: 0,
      councilVote: false,
    }),
  ).toEqual({ ok: true, value: { bank: 95, amount: 10 } });
  expect(
    withdraw({
      rank: 'leader',
      bank: 105,
      amount: 11,
      leaderConfirm: false,
      councilConfirms: 0,
      councilVote: false,
    }),
  ).toEqual({ ok: false, code: 'confirm' });
  expect(
    withdraw({
      rank: 'officer',
      bank: 1_000,
      amount: 50,
      leaderConfirm: false,
      councilConfirms: 0,
      councilVote: false,
    }),
  ).toEqual({ ok: true, value: { bank: 950, amount: 50 } });
  expect(
    withdraw({
      rank: 'officer',
      bank: 1_000,
      amount: 51,
      leaderConfirm: true,
      councilConfirms: 2,
      councilVote: true,
    }),
  ).toEqual({ ok: false, code: 'limit' });
  expect(
    withdraw({
      rank: 'veteran',
      bank: 1_000,
      amount: 10,
      leaderConfirm: false,
      councilConfirms: 0,
      councilVote: false,
    }),
  ).toEqual({ ok: true, value: { bank: 990, amount: 10 } });
  expect(
    withdraw({
      rank: 'veteran',
      bank: 1_000,
      amount: 11,
      leaderConfirm: false,
      councilConfirms: 0,
      councilVote: false,
    }),
  ).toEqual({ ok: false, code: 'limit' });
  expect(
    withdraw({
      rank: 'council',
      bank: 1_000,
      amount: 250,
      leaderConfirm: true,
      councilConfirms: 2,
      councilVote: false,
    }),
  ).toEqual({ ok: true, value: { bank: 750, amount: 250 } });
  expect(
    withdraw({
      rank: 'council',
      bank: 1_000,
      amount: 250,
      leaderConfirm: false,
      councilConfirms: 0,
      councilVote: false,
    }),
  ).toEqual({ ok: false, code: 'confirm' });
});

test('the guild bank stops at the economy cap', () => {
  expect(GUILD_BANK_SLOTS).toBe(500);
  expect(depositBank(GUILD_BANK_CAP - 1, 5)).toEqual({ bank: GUILD_BANK_CAP, overflow: 4 });
  expect(depositBank(10, 5)).toEqual({ bank: 15, overflow: 0 });
});

test('war consent is leader plus two council, or three council when the leader is absent', () => {
  const paid = { gold: WAR_GOLD, resources: WAR_RESOURCES, nowMs: 0 };
  expect(
    declareWar({
      attackerGuildId: 'atk',
      cityId: 'city',
      ...paid,
      leaderAbsent: false,
      leaderConsent: true,
      councilConsents: 1,
    }),
  ).toEqual({ ok: false, code: 'confirm' });
  expect(
    declareWar({
      attackerGuildId: 'atk',
      cityId: 'city',
      ...paid,
      leaderAbsent: false,
      leaderConsent: false,
      councilConsents: 3,
    }),
  ).toEqual({ ok: false, code: 'confirm' });
  expect(
    declareWar({
      attackerGuildId: 'atk',
      cityId: 'city',
      ...paid,
      leaderAbsent: true,
      leaderConsent: false,
      councilConsents: 3,
    }),
  ).toEqual({
    ok: true,
    value: {
      attackerGuildId: 'atk',
      cityId: 'city',
      startsAtMs: WAR_LEAD_MS,
      gold: 0,
      resources: 0,
      costGold: WAR_GOLD,
      costResources: WAR_RESOURCES,
    },
  });
});

test('a war without 50000 gold is refused', () => {
  expect(
    declareWar({
      attackerGuildId: 'atk',
      cityId: 'city',
      gold: WAR_GOLD - 1,
      resources: WAR_RESOURCES,
      nowMs: 0,
      leaderAbsent: false,
      leaderConsent: true,
      councilConsents: 2,
    }),
  ).toEqual({ ok: false, code: 'gold' });
  expect(
    declareWar({
      attackerGuildId: 'atk',
      cityId: 'city',
      gold: WAR_GOLD,
      resources: WAR_RESOURCES - 1,
      nowMs: 0,
      leaderAbsent: false,
      leaderConsent: true,
      councilConsents: 2,
    }),
  ).toEqual({ ok: false, code: 'gold' });
});

test('city capture, a drawn war, and a recent declaration each have a cooldown', () => {
  const base = {
    attackerGuildId: 'atk',
    cityId: 'city',
    gold: WAR_GOLD,
    resources: WAR_RESOURCES,
    leaderAbsent: false,
    leaderConsent: true,
    councilConsents: 2,
  };
  expect(declareWar({ ...base, nowMs: CITY_CAPTURE_COOLDOWN_MS - 1, cityCapturedAtMs: 0 })).toEqual(
    { ok: false, code: 'cooldown' },
  );
  expect(declareWar({ ...base, nowMs: CITY_CAPTURE_COOLDOWN_MS, cityCapturedAtMs: 0 }).ok).toBe(
    true,
  );
  expect(declareWar({ ...base, nowMs: DRAW_WAR_COOLDOWN_MS - 1, drawEndedAtMs: 0 })).toEqual({
    ok: false,
    code: 'cooldown',
  });
  expect(declareWar({ ...base, nowMs: DRAW_WAR_COOLDOWN_MS, drawEndedAtMs: 0 }).ok).toBe(true);
  expect(declareWar({ ...base, nowMs: GUILD_WAR_COOLDOWN_MS - 1, lastDeclaredAtMs: 0 })).toEqual({
    ok: false,
    code: 'cooldown',
  });
});

test('a contender pays 10000 gold and must register at least one hour before the start', () => {
  const startsAtMs = WAR_LEAD_MS;
  expect(
    registerContender({ guildId: 'other', gold: CONTENDER_GOLD, nowMs: 0, startsAtMs }),
  ).toEqual({ ok: true, value: { guildId: 'other', gold: 0 } });
  expect(
    registerContender({
      guildId: 'other',
      gold: CONTENDER_GOLD - 1,
      nowMs: 0,
      startsAtMs,
    }),
  ).toEqual({ ok: false, code: 'gold' });
  expect(
    registerContender({
      guildId: 'other',
      gold: CONTENDER_GOLD,
      nowMs: startsAtMs - CONTENDER_CLOSE_MS,
      startsAtMs,
    }).ok,
  ).toBe(true);
  expect(
    registerContender({
      guildId: 'other',
      gold: CONTENDER_GOLD,
      nowMs: startsAtMs - CONTENDER_CLOSE_MS + 1,
      startsAtMs,
    }),
  ).toEqual({ ok: false, code: 'cooldown' });
});

test('a neutral city costs 25000 gold and a guild city still costs the war stake', () => {
  expect(NEUTRAL_CAPTURE_GOLD).toBe(25_000);
  expect(NEUTRAL_GUARD_COUNT).toBe(2);
  expect(WAR_GOLD).toBe(50_000);
  expect(WAR_RESOURCES).toBe(20_000);
  const neutral = declareNeutralCapture({
    attackerGuildId: 'wolves',
    cityId: 'fort_humans',
    gold: 25_000,
    nowMs: 0,
    leaderAbsent: false,
    leaderConsent: true,
    councilConsents: 2,
    owned: false,
  });
  expect(neutral.ok).toBe(true);
  if (neutral.ok) {
    expect(neutral.value.costGold).toBe(25_000);
    expect(neutral.value.gold).toBe(0);
    expect(neutral.value.startsAtMs).toBe(WAR_LEAD_MS);
    expect(neutral.value.guards).toBe(NEUTRAL_GUARD_COUNT);
    expect(neutral.value.kind).toBe('neutral');
  }
  expect(
    declareNeutralCapture({
      attackerGuildId: 'wolves',
      cityId: 'fort_humans',
      gold: 25_000,
      nowMs: 0,
      leaderAbsent: false,
      leaderConsent: true,
      councilConsents: 2,
      owned: true,
    }),
  ).toEqual({ ok: false, code: 'owned' });
  const guildWar = declareWar({
    attackerGuildId: 'wolves',
    cityId: 'fort_humans',
    gold: 50_000,
    resources: 20_000,
    nowMs: 0,
    leaderAbsent: false,
    leaderConsent: true,
    councilConsents: 2,
  });
  expect(guildWar.ok).toBe(true);
  if (guildWar.ok) {
    expect(guildWar.value.costGold).toBe(50_000);
    expect(guildWar.value.costResources).toBe(20_000);
  }
});

test('war phases run muster, assault, then a five minute finish', () => {
  expect(warPhase(0)).toBe('muster');
  expect(warPhase(WAR_MUSTER_MS - 1)).toBe('muster');
  expect(warPhase(WAR_MUSTER_MS)).toBe('assault');
  expect(warPhase(WAR_MUSTER_MS + WAR_ASSAULT_MS - 1)).toBe('assault');
  expect(warPhase(WAR_MUSTER_MS + WAR_ASSAULT_MS)).toBe('finish');
  expect(warPhase(WAR_MUSTER_MS + WAR_ASSAULT_MS + WAR_FINISH_MS - 1)).toBe('finish');
  expect(warPhase(WAR_MUSTER_MS + WAR_ASSAULT_MS + WAR_FINISH_MS)).toBe('closed');
});

test('holding the center for 599999 ms is not a win and 600000 ms is', () => {
  expect(WAR_HOLD_MS).toBe(600_000);
  expect(holdWins(599_999)).toBe(false);
  expect(holdWins(600_000)).toBe(true);
  expect(
    advanceHold({
      holderGuildId: 'atk',
      previousHolderGuildId: 'def',
      heldMs: 500_000,
      deltaMs: 1_000,
    }),
  ).toEqual({ holderGuildId: 'atk', heldMs: 0 });
  expect(
    advanceHold({
      holderGuildId: 'atk',
      previousHolderGuildId: 'atk',
      heldMs: 599_000,
      deltaMs: 1_000,
    }),
  ).toEqual({ holderGuildId: 'atk', heldMs: 600_000 });
});

test('the holder of the center wins at 600000 ms even if other guilds still fight', () => {
  expect(
    warWinner({
      heldCenterGuildId: 'atk',
      heldMs: 600_000,
      guilds: [
        { guildId: 'atk', fighters: 2 },
        { guildId: 'def', fighters: 2 },
      ],
    }),
  ).toEqual({ result: 'win', guildId: 'atk' });
  expect(
    warWinner({
      heldCenterGuildId: 'atk',
      heldMs: 599_999,
      guilds: [
        { guildId: 'atk', fighters: 2 },
        { guildId: 'def', fighters: 2 },
      ],
    }),
  ).toEqual({ result: 'draw' });
});

test('one guild left with fighters wins, and any other ending is a draw', () => {
  expect(
    warWinner({
      heldCenterGuildId: null,
      heldMs: 0,
      guilds: [
        { guildId: 'atk', fighters: 3 },
        { guildId: 'def', fighters: 0 },
      ],
    }),
  ).toEqual({ result: 'win', guildId: 'atk' });
  expect(
    warWinner({
      heldCenterGuildId: null,
      heldMs: 0,
      guilds: [
        { guildId: 'atk', fighters: 1 },
        { guildId: 'def', fighters: 1 },
      ],
    }),
  ).toEqual({ result: 'draw' });
  expect(
    warWinner({
      heldCenterGuildId: 'atk',
      heldMs: 599_999,
      guilds: [
        { guildId: 'atk', fighters: 0 },
        { guildId: 'def', fighters: 0 },
      ],
    }),
  ).toEqual({ result: 'draw' });
});

test('a draw keeps the city and forfeits the stake; a win starts the capture cooldown', () => {
  expect(settleWar({ outcome: { result: 'draw' }, ownerGuildId: 'def' })).toEqual({
    ownerGuildId: 'def',
    stakeForfeit: true,
    cooldownMs: DRAW_WAR_COOLDOWN_MS,
  });
  expect(settleWar({ outcome: { result: 'win', guildId: 'atk' }, ownerGuildId: 'def' })).toEqual({
    ownerGuildId: 'atk',
    stakeForfeit: false,
    cooldownMs: CITY_CAPTURE_COOLDOWN_MS,
  });
});

test('greed costs 100000 gold and cannot be changed again for 7 days', () => {
  const resources = { metal: 500, leather: 500, wood: 500, crystals: 500, titanium: 500 };
  const first = setDoctrine({
    current: null,
    next: 'greed',
    changedAtMs: null,
    nowMs: 0,
    gold: 100_000,
    resources,
  });
  expect(first).toEqual({
    ok: true,
    value: {
      doctrine: 'greed',
      gold: 0,
      resources,
      changedAtMs: 0,
      multiplier: DOCTRINE_MULTIPLIER,
      affects: 'lootGold',
    },
  });
  expect(
    setDoctrine({
      current: 'greed',
      next: 'greed',
      changedAtMs: 0,
      nowMs: 6 * DAY_MS,
      gold: 100_000,
      resources,
    }),
  ).toEqual({ ok: false, code: 'cooldown' });
  expect(
    setDoctrine({
      current: 'greed',
      next: 'greed',
      changedAtMs: 0,
      nowMs: 7 * DAY_MS,
      gold: 100_000,
      resources,
    }),
  ).toEqual({
    ok: true,
    value: {
      doctrine: 'greed',
      gold: 0,
      resources,
      changedAtMs: 7 * DAY_MS,
      multiplier: 1.05,
      affects: 'lootGold',
    },
  });
});

test('labor exposes a 1.05 gather multiplier and guard floors the armor total', () => {
  expect(doctrineMultiplier('labor')).toBe(1.05);
  expect(applyDoctrine('fury', 20)).toBe(21);
  expect(applyDoctrine('guard', 20)).toBe(21);
  expect(applyDoctrine('guard', 19)).toBe(19);
  expect(applyDoctrine('guard', 10) + applyDoctrine('guard', 10)).toBe(20);
  expect(applyDoctrine('guard', 20)).toBe(21);
});

test('a doctrine change spends its materials', () => {
  const result = setDoctrine({
    current: null,
    next: 'fury',
    changedAtMs: null,
    nowMs: 0,
    gold: 50_000,
    resources: { metal: 500 },
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.gold).toBe(0);
    expect(result.value.resources.metal).toBe(0);
    expect(result.value.affects).toBe('damage');
  }
  expect(
    setDoctrine({
      current: null,
      next: 'fury',
      changedAtMs: null,
      nowMs: 0,
      gold: 50_000,
      resources: { metal: 499 },
    }),
  ).toEqual({ ok: false, code: 'gold' });
  expect(
    setDoctrine({
      current: null,
      next: 'nope' as 'fury',
      changedAtMs: null,
      nowMs: 0,
      gold: 50_000,
      resources: { metal: 500 },
    }),
  ).toEqual({ ok: false, code: 'doctrine' });
});

test('a kill contract refuses a target below level 10 and a guild member', () => {
  expect(
    postContract({ type: 'kill', rewardGold: 100, targetLevel: 9, targetIsMember: false }),
  ).toEqual({
    ok: false,
    code: 'target',
  });
  expect(
    postContract({ type: 'kill', rewardGold: 100, targetLevel: 10, targetIsMember: true }),
  ).toEqual({
    ok: false,
    code: 'target',
  });
  expect(
    postContract({ type: 'kill', rewardGold: 100, targetLevel: 10, targetIsMember: false }),
  ).toEqual({
    ok: true,
    value: { type: 'kill', rewardGold: 100 },
  });
  expect(postContract({ type: 'kill', rewardGold: 0, targetLevel: 10 })).toEqual({
    ok: false,
    code: 'gold',
  });
  expect(
    postContract({ type: 'steal', rewardGold: 1, targetLevel: 1, targetIsMember: true }),
  ).toEqual({
    ok: true,
    value: { type: 'steal', rewardGold: 1 },
  });
});

test('dissolution splits gold by contribution and sends the remainder to void', () => {
  const even = dissolveShares(100, [
    { id: 'a', contributed: 1 },
    { id: 'b', contributed: 1 },
  ]);
  expect(even.shares).toEqual([
    { id: 'a', gold: 50 },
    { id: 'b', gold: 50 },
  ]);
  expect(even['void']).toBe(0);

  const uneven = dissolveShares(100, [
    { id: 'a', contributed: 1 },
    { id: 'b', contributed: 2 },
  ]);
  expect(uneven.shares).toEqual([
    { id: 'a', gold: 33 },
    { id: 'b', gold: 66 },
  ]);
  expect(uneven['void']).toBe(1);
  expect(uneven.shares.reduce((sum, share) => sum + share.gold, 0) + uneven['void']).toBe(100);
});

test('dissolution needs the leader and two council, or two thirds of the council', () => {
  expect(
    canDissolve({
      leaderConsent: true,
      councilConsents: 2,
      councilVotesFor: 0,
      councilSize: 3,
    }),
  ).toEqual({ ok: true, value: { by: 'council' } });
  expect(
    canDissolve({
      leaderConsent: false,
      councilConsents: 0,
      councilVotesFor: 2,
      councilSize: 3,
    }),
  ).toEqual({ ok: true, value: { by: 'vote' } });
  expect(
    canDissolve({
      leaderConsent: false,
      councilConsents: 1,
      councilVotesFor: 1,
      councilSize: 3,
    }),
  ).toEqual({ ok: false, code: 'confirm' });
  expect(DOCTRINE_COOLDOWN_MS).toBe(7 * DAY_MS);
});

test('a resource node plants in 60 seconds and drops after 30 minutes', () => {
  expect(NODE_PLANT_MS).toBe(60_000);
  expect(NODE_DROP_MS).toBe(1_800_000);
  expect(NODE_CHEST_CAP).toBe(10_000);
  expect(NODE_TAX_MAX).toBe(30);
  let node = freshResourceNode('plains_mine');
  node = advanceResourceNode({ node, presentGuildIds: ['wolves'], deltaMs: 1_000 }).node;
  expect(node.guildId).toBeNull();
  expect(node.plantMs).toBe(1_000);
  node = advanceResourceNode({ node, presentGuildIds: ['wolves', 'ash'], deltaMs: 5_000 }).node;
  expect(node.plantMs).toBe(0);
  expect(node.plantingGuildId).toBeNull();
  node = advanceResourceNode({ node, presentGuildIds: ['wolves'], deltaMs: NODE_PLANT_MS }).node;
  expect(node).toMatchObject({ guildId: 'wolves', plantMs: NODE_PLANT_MS, chest: 0 });
  node = { ...node, chest: 40 };
  node = advanceResourceNode({ node, presentGuildIds: ['ash'], deltaMs: NODE_DROP_MS - 1 }).node;
  expect(node.guildId).toBe('wolves');
  expect(node.chest).toBe(40);
  const droppedEarly = advanceResourceNode({ node, presentGuildIds: [], deltaMs: 1 });
  node = droppedEarly.node;
  expect(node.guildId).toBeNull();
  expect(node.chest).toBe(40);
  expect(droppedEarly.seized).toBeNull();
  expect(depositNodeChest(node.chest, NODE_CHEST_CAP)).toBe(NODE_CHEST_CAP);
  expect(setNodeTax({ next: 15, nowMs: 0, taxSetAtMs: null })).toEqual({
    ok: true,
    value: { taxPercent: 15, taxSetAtMs: 0 },
  });
  expect(setNodeTax({ next: 10, nowMs: NODE_TAX_COOLDOWN_MS - 1, taxSetAtMs: 0 })).toEqual({
    ok: false,
    code: 'cooldown',
  });
  expect(setNodeTax({ next: 31, nowMs: NODE_TAX_COOLDOWN_MS, taxSetAtMs: 0 })).toEqual({
    ok: false,
    code: 'tax',
  });
  const openPolicy = { allies: 'open' as const, guilds: 'open' as const, neutrals: 'open' as const };
  expect(setNodeAccess({ policy: openPolicy, category: 'guilds', access: 'closed' })).toEqual({
    ok: true,
    value: { allies: 'open', guilds: 'closed', neutrals: 'open' },
  });
  expect(setNodeAccess({ policy: openPolicy, category: 'guilds', access: 'guild' })).toEqual({
    ok: false,
    code: 'access',
  });
  expect(setNodeAccess({ policy: openPolicy, category: 'open', access: 'closed' })).toEqual({
    ok: false,
    code: 'category',
  });
  expect(nodeAccessCategory('ally')).toBe('allies');
  expect(nodeAccessCategory('enemy')).toBe('guilds');
  expect(nodeAccessCategory('neutral')).toBe('neutrals');
  expect(nodeAccessCategory('member')).toBeNull();
  expect(NODE_TAX_OFFICER_MAX).toBe(15);
  expect(setNodeTax({ next: 15, nowMs: 0, taxSetAtMs: null, rank: 'officer' })).toEqual({
    ok: true,
    value: { taxPercent: 15, taxSetAtMs: 0 },
  });
  expect(setNodeTax({ next: 16, nowMs: 0, taxSetAtMs: null, rank: 'officer' })).toEqual({
    ok: false,
    code: 'tax',
  });
  expect(setNodeTax({ next: 30, nowMs: 0, taxSetAtMs: null, rank: 'leader' }).ok).toBe(true);
  expect(setNodeTax({ next: 1, nowMs: 0, taxSetAtMs: null, rank: 'novice' })).toEqual({
    ok: false,
    code: 'rank',
  });
  expect(setNodeTax({ next: 1, nowMs: 0, taxSetAtMs: null, rank: 'veteran' })).toEqual({
    ok: false,
    code: 'rank',
  });
});

test('a dropped resource-node flag leaves the chest for the next planter', () => {
  let node = freshResourceNode('plains_mine');
  node = advanceResourceNode({ node, presentGuildIds: ['wolves'], deltaMs: NODE_PLANT_MS }).node;
  node = { ...node, chest: 40 };
  const held = advanceResourceNode({ node, presentGuildIds: [], deltaMs: NODE_DROP_MS - 1 }).node;
  expect(held.guildId).toBe('wolves');
  expect(held.chest).toBe(40);
  const dropped = advanceResourceNode({ node: held, presentGuildIds: [], deltaMs: 1 });
  expect(dropped.node.guildId).toBeNull();
  expect(dropped.node.chest).toBe(40);
  expect(dropped.seized).toBeNull();
  expect(settleNodeDrop(held, dropped.node)).toEqual(dropped);
  const planted = advanceResourceNode({ node: dropped.node, presentGuildIds: ['ash'], deltaMs: NODE_PLANT_MS });
  expect(planted.node.guildId).toBe('ash');
  expect(planted.node.chest).toBe(0);
  expect(planted.seized).toEqual({ guildId: 'ash', amount: 40 });
});

test('pacts make two guilds allies and a vassal cannot declare war alone', () => {
  expect(PACT_MS).toBe(7 * 24 * 60 * 60 * 1000);
  const alliance = formPact({ kind: 'alliance', guildIds: ['wolves', 'ash'], nowMs: 0 });
  expect(alliance.ok).toBe(true);
  if (!alliance.ok) {
    return;
  }
  expect(pactAlly([alliance.value], 'ash', 'wolves', 0)).toBe(true);
  expect(pactAlly([alliance.value], 'ash', 'wolves', PACT_MS)).toBe(false);
  const coalition = formPact({
    kind: 'coalition',
    guildIds: ['wolves', 'ash'],
    targetGuildId: 'order',
    nowMs: 0,
  });
  expect(coalition.ok).toBe(true);
  if (coalition.ok) {
    expect(pactAlly([coalition.value], 'wolves', 'ash', 0)).toBe(true);
  }
  const vassal = formPact({
    kind: 'vassal',
    guildIds: ['ash', 'wolves'],
    suzerainId: 'wolves',
    vassalId: 'ash',
    taxPercent: VASSAL_TAX_MIN,
    nowMs: 0,
  });
  expect(vassal.ok).toBe(true);
  if (!vassal.ok) {
    return;
  }
  expect(pactAlly([vassal.value], 'ash', 'wolves', 0)).toBe(true);
  expect(vassalMayDeclare({ pacts: [vassal.value], guildId: 'ash', nowMs: 0, suzerainConsent: false })).toEqual({
    ok: false,
    code: 'vassal',
  });
  expect(vassalMayDeclare({ pacts: [vassal.value], guildId: 'ash', nowMs: 0, suzerainConsent: true }).ok).toBe(true);
  expect(suzerainDefenders([vassal.value], 'ash', 0)).toEqual(['wolves']);
  expect(suzerainDefenders([vassal.value], 'wolves', 0)).toEqual([]);
  expect(coalition.ok && coalitionChannel([coalition.value], 'wolves', 0)?.targetGuildId).toBe('order');
  expect(coalitionChannel([vassal.value], 'ash', 0)).toBeNull();
  expect(applyVassalTithe({ bank: 1_000, taxPercent: 10, days: 1 })).toEqual({
    ok: true,
    value: { bank: 900, tithe: 100 },
  });
  const nap = formPact({ kind: 'non_aggression', guildIds: ['wolves', 'ash'], nowMs: 0 });
  expect(nap.ok).toBe(true);
  if (nap.ok) {
    expect(pactAlly([nap.value], 'wolves', 'ash', 0)).toBe(true);
  }
  expect(breachNonAggression({ bank: 80_000, nowMs: 0 })).toEqual({
    bank: 30_000,
    fine: NAP_BREACH_GOLD,
    flagUntilMs: 7 * 24 * 60 * 60 * 1000,
  });
  expect(NAP_BREACH_GOLD).toBe(50_000);
  const noticed = noticeAllianceBreak(alliance.value, 0);
  expect(noticed.ok).toBe(true);
  if (noticed.ok) {
    expect(pactAlly([noticed.value], 'ash', 'wolves', ALLIANCE_BREAK_MS - 1)).toBe(true);
    expect(pactAlly([noticed.value], 'ash', 'wolves', ALLIANCE_BREAK_MS)).toBe(true);
    expect(breakAlliance(noticed.value, ALLIANCE_BREAK_MS - 1)).toEqual({ ok: false, code: 'early' });
    const broken = breakAlliance(noticed.value, ALLIANCE_BREAK_MS);
    expect(broken.ok).toBe(true);
    if (broken.ok) {
      expect(pactAlly([broken.value], 'ash', 'wolves', ALLIANCE_BREAK_MS)).toBe(false);
    }
    const renewed = renewPact(noticed.value, 1_000);
    expect(renewed.ok).toBe(true);
    if (renewed.ok) {
      expect(pactAlly([renewed.value], 'ash', 'wolves', ALLIANCE_BREAK_MS)).toBe(true);
    }
  }
  const release = noticeVassalRelease(vassal.value, 0);
  expect(release.ok).toBe(true);
  if (release.ok) {
    expect(pactAlly([release.value], 'ash', 'wolves', ALLIANCE_BREAK_MS)).toBe(true);
    expect(pactAlly([release.value], 'ash', 'wolves', VASSAL_RELEASE_MS)).toBe(true);
    expect(pactLive(release.value, VASSAL_RELEASE_MS)).toBe(true);
    expect(releaseVassal(release.value, VASSAL_RELEASE_MS - 1)).toEqual({ ok: false, code: 'early' });
    const freed = releaseVassal(release.value, VASSAL_RELEASE_MS);
    expect(freed.ok).toBe(true);
    if (freed.ok) {
      expect(pactAlly([freed.value], 'ash', 'wolves', VASSAL_RELEASE_MS)).toBe(false);
    }
  }
  expect(noticeVassalRelease(alliance.value, 0)).toEqual({ ok: false, code: 'kind' });
});

test('mercenary and patrol contracts pay on completion and fail when the clock runs out', () => {
  expect(PATROL_QUEST_MS).toBe(3 * 60 * 60 * 1000);
  expect(PATROL_QUEST_GOLD).toBe(5_000);
  expect(
    postMercenary({
      rank: 'officer',
      kind: 'patrol',
      rewardGold: 100,
      bank: 100,
      mercenaryId: 'blade',
      memberIds: ['lia'],
      nowMs: 0,
      durationMs: 1_000,
      nodeId: 'plains_mine',
    }),
  ).toEqual({ ok: false, code: 'rank' });
  const posted = postMercenary({
    rank: 'leader',
    kind: 'escort',
    rewardGold: 100,
    bank: 100,
    mercenaryId: 'lia',
    memberIds: ['lia'],
    nowMs: 0,
    durationMs: 1_000,
    nodeId: 'plains_mine',
  });
  expect(posted).toEqual({ ok: false, code: 'member' });
  const hired = postMercenary({
    rank: 'council',
    kind: 'defend',
    rewardGold: 100,
    bank: 500,
    mercenaryId: 'blade',
    memberIds: ['lia'],
    nowMs: 0,
    durationMs: 1_000,
    nodeId: 'plains_mine',
  });
  expect(hired.ok).toBe(true);
  expect(
    tickContract({
      status: 'open',
      presentMs: 0,
      durationMs: 1_000,
      untilMs: 1_000,
      deltaMs: 1_000,
      present: true,
      nowMs: 1_000,
      bank: 500,
      rewardGold: 100,
    }),
  ).toEqual({ status: 'complete', presentMs: 1_000, pay: 100 });
  expect(
    tickContract({
      status: 'open',
      presentMs: 0,
      durationMs: 1_000,
      untilMs: 1_000,
      deltaMs: 1_000,
      present: false,
      nowMs: 1_000,
      bank: 500,
      rewardGold: 100,
    }),
  ).toEqual({ status: 'failed', presentMs: 0, pay: 0 });
  expect(
    tickContract({
      status: 'open',
      presentMs: 1_000,
      durationMs: 1_000,
      untilMs: 1_000,
      deltaMs: 1_000,
      present: true,
      nowMs: 1_000,
      bank: 500,
      rewardGold: 100,
      kind: 'escort',
      duty: false,
    }),
  ).toEqual({ status: 'failed', presentMs: 2_000, pay: 0 });
  expect(
    tickContract({
      status: 'open',
      presentMs: 0,
      durationMs: 1_000,
      untilMs: 1_000,
      deltaMs: 1_000,
      present: true,
      nowMs: 500,
      bank: 500,
      rewardGold: 100,
      kind: 'attack',
      duty: true,
    }),
  ).toEqual({ status: 'complete', presentMs: 1_000, pay: 100 });
  expect(
    tickContract({
      status: 'open',
      presentMs: 0,
      durationMs: 1_000,
      untilMs: 1_000,
      deltaMs: 0,
      present: false,
      nowMs: 1_000,
      bank: 500,
      rewardGold: 100,
      kind: 'defend',
    }),
  ).toEqual({ status: 'failed', presentMs: 0, pay: 0 });
  const patrol = postPatrolQuest({
    rank: 'leader',
    rewardGold: PATROL_QUEST_GOLD,
    bank: PATROL_QUEST_GOLD,
    nodeId: 'plains_mine',
    nowMs: 0,
    durationMs: PATROL_QUEST_MS,
  });
  expect(patrol.ok).toBe(true);
  expect(
    postPatrolQuest({
      rank: 'novice',
      rewardGold: 1,
      bank: 1,
      nodeId: 'plains_mine',
      nowMs: 0,
      durationMs: 1,
    }),
  ).toEqual({ ok: false, code: 'rank' });
});
