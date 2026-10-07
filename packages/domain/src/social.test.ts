import { expect, test } from 'vitest';
import type { Rng } from './rng';
import {
  chatBypass,
  deliverChat,
  invite,
  leave,
  matchmake,
  bumpReputation,
  reputationTier,
  sendMail,
  CHAT_TEXT_MAX,
  MAIL_BODY_MAX,
  MAIL_SUBJECT_MAX,
  type Party,
} from './social';

function throwingRng(): Rng {
  return {
    nextInt(): number {
      throw new Error('nextInt');
    },
    nextUnit(): number {
      throw new Error('nextUnit');
    },
  };
}

function scriptedRng(units: number[]): Rng {
  let index = 0;
  return {
    nextInt(): number {
      throw new Error('nextInt');
    },
    nextUnit(): number {
      const value = units[index];
      index += 1;
      if (value === undefined) {
        throw new Error('rng exhausted');
      }
      return value;
    },
  };
}

function chat(overrides: Partial<Parameters<typeof deliverChat>[0]> = {}) {
  return deliverChat({
    channel: 'local',
    text: 'Ab',
    language: 'common_dark',
    listenerUpy: 0,
    translated: 'перевод',
    sameLocation: true,
    sameParty: true,
    sameGuild: true,
    muted: false,
    rng: throwingRng(),
    ...overrides,
  });
}

const squad: Party = {
  leaderId: 'a',
  members: [
    { id: 'a', role: 'tank' },
    { id: 'b', role: 'damage' },
    { id: 'c', role: 'support' },
  ],
};

test('chat bypass flag skips language on party, guild, and system only', () => {
  expect(chatBypass).toEqual({
    local: false,
    party: true,
    guild: true,
    trade: false,
    system: true,
    mail: false,
  });
});

test('local at UPY 0 returns the original text in raw mode', () => {
  expect(chat()).toEqual({ ok: true, value: { text: 'Ab', mode: 'raw' } });
});

test('local at UPY 100 returns the translation', () => {
  expect(chat({ listenerUpy: 100, text: 'сырой' })).toEqual({
    ok: true,
    value: { text: 'перевод', mode: 'translated' },
  });
});

test('local between 1 and 99 garbles, and 86–99 stays garbled with the original text', () => {
  expect(chat({ listenerUpy: 10, rng: scriptedRng([0, 0.95]) })).toEqual({
    ok: true,
    value: { text: '?b', mode: 'garbled' },
  });
  expect(chat({ listenerUpy: 90, text: 'Ab 1' })).toEqual({
    ok: true,
    value: { text: 'Ab 1', mode: 'garbled' },
  });
});

test('party at UPY 0 does not garble letters', () => {
  expect(chat({ channel: 'party', listenerUpy: 0, text: 'Ab' })).toEqual({
    ok: true,
    value: { text: 'Ab', mode: 'raw' },
  });
});

test('party and guild bypass language at every UPY, including translation', () => {
  expect(chat({ channel: 'party', listenerUpy: 10, text: 'Ab' })).toEqual({
    ok: true,
    value: { text: 'Ab', mode: 'raw' },
  });
  expect(chat({ channel: 'guild', listenerUpy: 100, text: 'Ab' })).toEqual({
    ok: true,
    value: { text: 'Ab', mode: 'raw' },
  });
});

test('trade and mail still apply UPY', () => {
  expect(chat({ channel: 'trade', listenerUpy: 10, rng: scriptedRng([0, 0]) })).toEqual({
    ok: true,
    value: { text: '??', mode: 'garbled' },
  });
  expect(chat({ channel: 'mail', listenerUpy: 100, sameLocation: false })).toEqual({
    ok: true,
    value: { text: 'перевод', mode: 'translated' },
  });
});

test('a player cannot post on the system channel', () => {
  expect(chat({ channel: 'system', text: 'server' })).toEqual({ ok: false, code: 'system' });
});

test('muted blocks delivery before channel rules', () => {
  expect(chat({ muted: true, channel: 'system' })).toEqual({ ok: false, code: 'muted' });
});

test('empty or overlong chat text is rejected', () => {
  expect(chat({ text: '' })).toEqual({ ok: false, code: 'empty' });
  expect(chat({ text: 'x'.repeat(CHAT_TEXT_MAX) }).ok).toBe(true);
  expect(chat({ text: 'x'.repeat(CHAT_TEXT_MAX + 1) })).toEqual({ ok: false, code: 'empty' });
});

test('mail body uses its own length and does not require a location', () => {
  expect(
    chat({ channel: 'mail', text: 'x'.repeat(CHAT_TEXT_MAX + 1), sameLocation: false }).ok,
  ).toBe(true);
  expect(chat({ channel: 'mail', text: 'x'.repeat(MAIL_BODY_MAX), sameLocation: false }).ok).toBe(
    true,
  );
  expect(chat({ channel: 'mail', text: 'x'.repeat(MAIL_BODY_MAX + 1) })).toEqual({
    ok: false,
    code: 'empty',
  });
});

test('scope follows the channel', () => {
  expect(chat({ channel: 'local', sameLocation: false })).toEqual({ ok: false, code: 'scope' });
  expect(chat({ channel: 'trade', sameLocation: false })).toEqual({ ok: false, code: 'scope' });
  expect(chat({ channel: 'party', sameParty: false })).toEqual({ ok: false, code: 'scope' });
  expect(chat({ channel: 'guild', sameGuild: false })).toEqual({ ok: false, code: 'scope' });
  expect(
    chat({ channel: 'mail', sameLocation: false, sameParty: false, sameGuild: false }).ok,
  ).toBe(true);
});

test('sendMail accepts an empty subject and a body of 1..2000', () => {
  expect(sendMail({ subject: '', body: 'a' })).toEqual({
    ok: true,
    value: { subject: '', body: 'a' },
  });
  expect(
    sendMail({ subject: 's'.repeat(MAIL_SUBJECT_MAX), body: 'b'.repeat(MAIL_BODY_MAX) }).ok,
  ).toBe(true);
  expect(sendMail({ subject: 's'.repeat(MAIL_SUBJECT_MAX + 1), body: 'a' })).toEqual({
    ok: false,
    code: 'subject',
  });
  expect(sendMail({ subject: 'ok', body: '' })).toEqual({ ok: false, code: 'body' });
  expect(sendMail({ subject: 'ok', body: 'b'.repeat(MAIL_BODY_MAX + 1) })).toEqual({
    ok: false,
    code: 'body',
  });
});

test('the fifth party member is rejected', () => {
  const full: Party = {
    leaderId: 'a',
    members: [
      { id: 'a', role: 'tank' },
      { id: 'b', role: 'damage' },
      { id: 'c', role: 'support' },
      { id: 'd', role: 'flex' },
    ],
  };
  expect(invite(full, 'e', 'flex')).toEqual({ ok: false, code: 'full' });
  expect(full.members).toHaveLength(4);
});

test('invite adds a member until the party is full and rejects duplicates', () => {
  const joined = invite(squad, 'd', 'flex');
  expect(joined).toEqual({
    ok: true,
    value: {
      leaderId: 'a',
      members: [
        { id: 'a', role: 'tank' },
        { id: 'b', role: 'damage' },
        { id: 'c', role: 'support' },
        { id: 'd', role: 'flex' },
      ],
    },
  });
  expect(squad.members).toHaveLength(3);
  expect(invite(squad, 'a', 'tank')).toEqual({ ok: false, code: 'duplicate' });
  expect(invite(squad, 'b', 'damage')).toEqual({ ok: false, code: 'duplicate' });
});

test('the leader leaving hands leadership to the first remaining member', () => {
  expect(leave(squad, 'a')).toEqual({
    leaderId: 'b',
    members: [
      { id: 'b', role: 'damage' },
      { id: 'c', role: 'support' },
    ],
  });
  expect(
    leave(
      {
        leaderId: 'a',
        members: [
          { id: 'b', role: 'damage' },
          { id: 'a', role: 'tank' },
          { id: 'c', role: 'support' },
        ],
      },
      'a',
    ),
  ).toEqual({
    leaderId: 'b',
    members: [
      { id: 'b', role: 'damage' },
      { id: 'c', role: 'support' },
    ],
  });
});

test('a non-leader leaving keeps the leader, and the last member dissolves the party', () => {
  expect(leave(squad, 'c')).toEqual({
    leaderId: 'a',
    members: [
      { id: 'a', role: 'tank' },
      { id: 'b', role: 'damage' },
    ],
  });
  expect(leave({ leaderId: 'a', members: [{ id: 'a', role: 'tank' }] }, 'a')).toBeNull();
  expect(leave(squad, 'missing')).toBe(squad);
});

test('matchmake at level 10 takes 8 and 14, skips 16, respects role, and keeps order', () => {
  const candidates = [
    { id: 'eight', level: 8, role: 'tank' as const },
    { id: 'sixteen', level: 16, role: 'tank' as const },
    { id: 'damage', level: 14, role: 'damage' as const },
    { id: 'fourteen', level: 14, role: 'tank' as const },
    { id: 'low', level: 4, role: 'tank' as const },
    { id: 'high', level: 15, role: 'tank' as const },
  ];
  expect(matchmake(candidates, 10, 'tank', 4)).toEqual(['eight', 'fourteen', 'high']);
  expect(matchmake(candidates, 10, null, 3)).toEqual(['eight', 'damage', 'fourteen']);
  expect(
    matchmake(
      [
        { id: 'later', level: 14, role: 'tank' },
        { id: 'earlier', level: 8, role: 'tank' },
      ],
      10,
      'tank',
      2,
    ),
  ).toEqual(['later', 'earlier']);
  expect(matchmake(candidates, 10, 'tank', 1)).toEqual(['eight']);
  expect(matchmake(candidates, 10, 'support', 4)).toEqual([]);
});

test('reputation 20 plus a quest is 25, basic, with no discount', () => {
  expect(bumpReputation(20, 'quest')).toBe(25);
  expect(reputationTier(25)).toEqual({ quests: 'basic', discount: 0 });
});

test('reputation 41 discounts 5 percent, and the value stays inside 0..100', () => {
  expect(reputationTier(41)).toEqual({ quests: 'all', discount: 0.05 });
  expect(bumpReputation(100, 'quest')).toBe(100);
  expect(bumpReputation(0, 'attack')).toBe(0);
  expect(bumpReputation(1, 'fail')).toBe(0);
  expect(bumpReputation(0, 'gift')).toBe(3);
  expect(reputationTier(20)).toEqual({ quests: 'none', discount: 0 });
  expect(reputationTier(61)).toEqual({ quests: 'rare', discount: 0.1 });
  expect(reputationTier(81)).toEqual({ quests: 'unique', discount: 0.15 });
});
