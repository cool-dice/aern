import { readFileSync } from 'node:fs';
import { PLAIN_ALPHABET, buildPermutation, encodeAncient } from '@rift/domain/ancient';
import type { Appearance } from '@rift/domain/character';
import { GUILD_CREATE_GOLD } from '@rift/domain/guild';
import { emptyPoints } from '@rift/domain/stats';
import { expect, test } from 'vitest';
import { compose } from './compose';

const appearance: Appearance = {
  skin: 'fair',
  hair: 'brown',
  eyes: 'green',
  horns: false,
  ears: 'round',
  tattoos: 'none',
  scars: 'none',
  heightCm: 180,
  build: 'average',
};

test('a coalition read returns the ledger rows and coalitionBank still refuses a balance', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const bank = composeSource.slice(
    composeSource.indexOf('function useCoalitionBank'),
    composeSource.indexOf('function noteWarRoster'),
  );
  expect(bank.includes('coalitionBank(')).toBe(true);
  expect(bank.includes('coalitionLedger')).toBe(true);
  expect(bank.includes('rows')).toBe(true);
  expect(dispatch.includes('useCoalitionBank(')).toBe(true);
});

test('a coalition deposit is a ledger row and the read returns those rows', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.enterCharacter('account-kai', 'kai');
  const wolves = await graph.act('guild_create', {
    name: 'Red Wolves',
    tag: 'RW',
    initiatorId: 'lia',
    leaderId: 'lia',
    emblem: 'wolf',
    description: 'the red pack',
    gold: GUILD_CREATE_GOLD,
    members: [
      { id: 'lia', level: 5, confirmed: true },
      { id: 'm1', level: 5, confirmed: true },
      { id: 'm2', level: 5, confirmed: true },
      { id: 'm3', level: 5, confirmed: true },
    ],
  });
  const ash = await graph.act('guild_create', {
    name: 'Ash Keepers',
    tag: 'ASH',
    initiatorId: 'kai',
    leaderId: 'kai',
    emblem: 'ash',
    description: 'the ash keep',
    gold: GUILD_CREATE_GOLD,
    members: [
      { id: 'kai', level: 5, confirmed: true },
      { id: 'k1', level: 5, confirmed: true },
      { id: 'k2', level: 5, confirmed: true },
      { id: 'k3', level: 5, confirmed: true },
    ],
  });
  expect(wolves.ok && ash.ok).toBe(true);
  if (!wolves.ok || !ash.ok) {
    return;
  }
  const wolvesId = (wolves.value as { guildId: string }).guildId;
  const ashId = (ash.value as { guildId: string }).guildId;
  expect(
    await graph.act('pact', {
      kind: 'coalition',
      guildIds: [wolvesId, ashId],
      targetGuildId: 'outsiders',
      characterId: 'lia',
    }),
  ).toMatchObject({ ok: true });
  expect(await graph.act('coalition_bank', { characterId: 'lia', op: 'deposit', amount: 10 })).toMatchObject({
    ok: false,
    code: 'bank',
    value: { op: 'deposit', guildId: wolvesId },
  });
  const read = await graph.act('coalition_bank', { characterId: 'kai', op: 'read' });
  expect(read).toMatchObject({ ok: false, code: 'bank', value: { op: 'read', guildId: ashId } });
  const rows = (read.value as { rows: { op: string; characterId: string; amount: number | null }[] }).rows;
  expect(rows.map((row) => ({ op: row.op, characterId: row.characterId, amount: row.amount }))).toEqual([
    { op: 'deposit', characterId: 'lia', amount: 10 },
    { op: 'read', characterId: 'kai', amount: null },
  ]);
  expect(read.value).not.toHaveProperty('bank');
});

test('the fragment route calls renderFragment, decodeAncient, and botRecord', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const decipher = composeSource.slice(
    composeSource.indexOf('async function decipherAncient'),
    composeSource.indexOf('function useCoalitionBank'),
  );
  expect(decipher.includes('renderFragment(')).toBe(true);
  expect(decipher.includes('decodeAncient(')).toBe(true);
  expect(decipher.includes('botRecord(')).toBe(true);
  expect(decipher.includes('decipherAttempt(')).toBe(true);
  expect(decipher.includes('lockout')).toBe(false);
});

test('a player decipher round-trips fragment_rift_01 and a bot receives the record', async () => {
  const graph = compose({ nowMs: 0, jwtSecret: 'test-secret' });
  graph.enterCharacter('account-lia', 'lia');
  const permutation = buildPermutation('test-secret');
  const opened = await graph.act('ancient_decipher', {
    characterId: 'lia',
    fragmentId: 'fragment_rift_01',
    attempt: permutation,
    knownLetters: ['п'],
  });
  expect(opened.ok).toBe(true);
  if (!opened.ok || opened.value === undefined || typeof opened.value !== 'object') {
    return;
  }
  const value = opened.value as {
    plaintext: string;
    ciphertext: string;
    knownLetters: { letter: string; glyph: string }[];
  };
  expect(value.plaintext).toBe('предтечи открыли разлом в изначальном городе');
  expect(value.ciphertext).toBe(encodeAncient(value.plaintext, permutation));
  expect(value.knownLetters).toEqual([{ letter: 'п', glyph: permutation[PLAIN_ALPHABET.indexOf('п')] }]);
  const points = { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 };
  const bot = await graph.character.service.create({
    accountId: 'account-bot',
    controller: 'bot',
    name: 'Arch',
    clean: true,
    points,
    appearance,
  });
  expect(bot.ok).toBe(true);
  if (!bot.ok) {
    return;
  }
  const record = await graph.act('ancient_decipher', {
    characterId: bot.value.characterId,
    fragmentId: 'fragment_rift_01',
    attempt: '?',
  });
  expect(record).toMatchObject({
    ok: true,
    value: {
      event: 'ancient_record',
      location: 'fragment_rift_01',
      confidence: 0.9,
      content: {
        lore: 'предтечи открыли разлом в изначальном городе',
        coordinates: { x: 40, y: 0 },
        recipe: 'energy_blade',
        password: 'X7#9@!',
      },
    },
  });
  expect(JSON.stringify(record)).not.toContain(encodeAncient('предтечи', permutation));
});

test('removeRelic is a live route and the character row stores the relic stack', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const route = composeSource.slice(
    composeSource.indexOf('async function removeWornRelic'),
    composeSource.indexOf('function noteWarBlow'),
  );
  const install = dispatch.slice(dispatch.indexOf('async function relic'), dispatch.indexOf('async function echo'));
  expect(route.includes('removeRelic(')).toBe(true);
  expect(install.includes('relicStack(')).toBe(true);
  expect(dispatch.includes("case 'relic_remove'")).toBe(true);
  expect(dispatch.includes('removeWornRelic(')).toBe(true);
  expect(composeSource.includes("path: '/relic/remove'")).toBe(true);
  expect(app.includes('postRemoveRelic(')).toBe(true);
});

test('a worn relic is stored on the character and can be taken off before purification', async () => {
  const graph = compose({ nowMs: 0 });
  const points = { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 };
  const created = await graph.character.service.create({
    accountId: 'account-relic',
    controller: 'player',
    name: 'Rel',
    clean: false,
    points,
    appearance,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  const characterId = created.value.characterId;
  expect(await graph.act('relic_install', { characterId, subtype: 'spore' })).toMatchObject({ ok: true });
  expect(await graph.act('purify', { characterId })).toMatchObject({ ok: false, code: 'still_impure' });
  const removed = await graph.act('relic_remove', { characterId });
  expect(removed).toMatchObject({ ok: true, value: { relics: 0, lostEchoIds: [] } });
  expect(await graph.act('purify', { characterId })).toMatchObject({
    ok: true,
    value: { clean: false },
  });
});

test('matchmake runs from the live party route', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const route = composeSource.slice(
    composeSource.indexOf('async function matchParty'),
    composeSource.indexOf('function noteWarBlow'),
  );
  expect(route.includes('matchmake(')).toBe(true);
  expect(dispatch.includes("case 'party_match'")).toBe(true);
  expect(dispatch.includes('matchParty(')).toBe(true);
  expect(composeSource.includes("path: '/party/match'")).toBe(true);
  expect(app.includes('postMatchmake(')).toBe(true);
});

test('party search keeps a candidate within 5 levels of the asked role and skips a far level', async () => {
  const graph = compose({ nowMs: 0 });
  const points = { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 };
  const make = async (accountId: string, name: string) => {
    const created = await graph.character.service.create({
      accountId,
      controller: 'player',
      name,
      clean: true,
      points,
      appearance,
    });
    if (!created.ok) {
      throw new Error(created.code);
    }
    return created.value.characterId;
  };
  const far = await make('account-far', 'Far');
  const near = await make('account-near', 'Near');
  const seeker = await make('account-seek', 'Seek');
  await graph.character.service.grantXp(far, 20_000);
  expect(await graph.act('party_match', { characterId: far, role: 'tank' })).toMatchObject({
    ok: true,
    value: { picked: [], joined: [] },
  });
  expect(await graph.act('party_match', { characterId: near, role: 'tank' })).toMatchObject({
    ok: true,
    value: { picked: [], joined: [] },
  });
  const matched = await graph.act('party_match', { characterId: seeker, role: 'tank' });
  expect(matched).toMatchObject({ ok: true, value: { picked: [near], joined: [near] } });
  const damage = await graph.act('party_match', { characterId: seeker, role: 'damage' });
  expect(damage).toMatchObject({ ok: true, value: { picked: [] } });
});

test('gainUpy runs from the teacher route and from tickOnce and skipMs', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const tickBody = composeSource.slice(
    composeSource.indexOf('async function tickOnce'),
    composeSource.indexOf('function simSnapshot'),
  );
  const skipBody = composeSource.slice(
    composeSource.indexOf('async function skipMs'),
    composeSource.indexOf('function guardAllies'),
  );
  const teach = composeSource.slice(
    composeSource.indexOf('async function teachLanguage'),
    composeSource.indexOf('function noteWarBlow'),
  );
  const passive = composeSource.slice(
    composeSource.indexOf('async function advanceLanguage'),
    composeSource.indexOf('async function teachLanguage'),
  );
  expect(tickBody.includes('advanceLanguage(')).toBe(true);
  expect(skipBody.includes('advanceLanguage(')).toBe(true);
  expect(passive.includes('gainUpy(')).toBe(true);
  expect(teach.includes('gainUpy(')).toBe(true);
  expect(dispatch.includes('teachLanguage(')).toBe(true);
  expect(composeSource.includes("path: '/language/teach'")).toBe(true);
  expect(app.includes('postTeach(')).toBe(true);
});

test('a teacher lesson costs 100 gold under the cap, and passive gain waits two online hours beside a speaker', async () => {
  const graph = compose({ nowMs: 0 });
  const points = { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 };
  const human = await graph.character.service.create({
    accountId: 'account-human',
    controller: 'player',
    name: 'Lia',
    clean: true,
    points,
    appearance,
  });
  const demon = await graph.character.service.create({
    accountId: 'account-demon',
    controller: 'bot',
    name: 'Vex',
    clean: true,
    points,
    appearance,
  });
  expect(human.ok && demon.ok).toBe(true);
  if (!human.ok || !demon.ok) {
    return;
  }
  const humanId = human.value.characterId;
  const demonId = demon.value.characterId;
  expect(await graph.act('language_teach', { characterId: humanId, language: 'common_light' })).toMatchObject({
    ok: false,
    code: 'cap',
  });
  graph.creditGold(humanId, 100);
  graph.enterWorld(humanId, 'fort_humans');
  graph.enterWorld(demonId, 'fort_humans');
  await graph.skipMs(7_200_000 - 100);
  await graph.tickOnce();
  const learned = await graph.act('language_teach', { characterId: humanId, language: 'common_dark' });
  expect(learned).toMatchObject({ ok: true, value: { language: 'common_dark', upy: 6, gold: 0 } });
  graph.creditGold(humanId, 100);
  expect(await graph.act('language_teach', { characterId: humanId, language: 'common_dark' })).toMatchObject({
    ok: false,
    code: 'cooldown',
  });
});

test('dayPhase is stamped from the server clock on tickOnce and skipMs', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const tickBody = composeSource.slice(
    composeSource.indexOf('async function tickOnce'),
    composeSource.indexOf('function simSnapshot'),
  );
  const skipBody = composeSource.slice(
    composeSource.indexOf('async function skipMs'),
    composeSource.indexOf('function guardAllies'),
  );
  expect(tickBody.includes('dayPhase(')).toBe(true);
  expect(skipBody.includes('dayPhase(')).toBe(true);
  expect(app.includes('data-day-phase')).toBe(true);
  expect(app.includes('payload.dayPhase')).toBe(true);
});

test('the published phase follows the two-hour cosmetic day', async () => {
  const graph = compose({ nowMs: 0 });
  expect(graph.state().dayPhase).toBe('day');
  await graph.skipMs(60 * 60 * 1000);
  expect(graph.state().dayPhase).toBe('night');
  await graph.tickOnce();
  expect(graph.state().dayPhase).toBe('night');
  await graph.skipMs(60 * 60 * 1000);
  expect(graph.state().dayPhase).toBe('day');
});
