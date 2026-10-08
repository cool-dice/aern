import { readFileSync } from 'node:fs';
import type { Appearance } from '@rift/domain/character';
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

test('gainUpy book, ruins, and interaction are live routes the session can post', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const book = composeSource.slice(
    composeSource.indexOf('async function studyBook'),
    composeSource.indexOf('async function studyRuins'),
  );
  const ruins = composeSource.slice(
    composeSource.indexOf('async function studyRuins'),
    composeSource.indexOf('async function studyInteraction'),
  );
  const interaction = composeSource.slice(
    composeSource.indexOf('async function studyInteraction'),
    composeSource.indexOf('async function advanceForgetting'),
  );
  expect(book.includes("gain: 'book'")).toBe(true);
  expect(book.includes('gainUpy(')).toBe(true);
  expect(ruins.includes('gainUpy(')).toBe(true);
  expect(ruins.includes('ruins_success')).toBe(true);
  expect(ruins.includes('ruins_fail')).toBe(true);
  expect(interaction.includes("gain: 'interaction'")).toBe(true);
  expect(interaction.includes('gainUpy(')).toBe(true);
  expect(dispatch.includes('studyBook(')).toBe(true);
  expect(dispatch.includes('studyRuins(')).toBe(true);
  expect(dispatch.includes('studyInteraction(')).toBe(true);
  expect(app.includes('postStudyBook(')).toBe(true);
  expect(app.includes('postStudyRuins(')).toBe(true);
  expect(app.includes('postStudyInteraction(')).toBe(true);
});

test('a book is consumed, ruins pay once, and an interaction adds UPY', async () => {
  const graph = compose({ nowMs: 0 });
  const created = await graph.character.service.create({
    accountId: 'account-upy',
    controller: 'player',
    name: 'Lex',
    clean: false,
    points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
    appearance,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  const characterId = created.value.characterId;
  graph.enterCharacter('account-upy', characterId);
  const missing = await graph.act('language_book', { characterId, language: 'common_dark' });
  expect(missing).toMatchObject({ ok: false, code: 'book' });
  graph.seedTrader({ characterId, gold: 0, itemId: 'book_common_dark', qty: 1 });
  const read = await graph.act('language_book', { characterId, language: 'common_dark' });
  expect(read).toMatchObject({ ok: true, value: { language: 'common_dark', upy: 3, qty: 0 } });
  expect(graph.heldItemQty(characterId, 'book_common_dark')).toBe(0);
  const ruins = await graph.act('language_ruins', {
    characterId,
    language: 'ancient',
    ruinsId: 'ruins_lexicon',
    success: true,
  });
  expect(ruins).toMatchObject({ ok: true, value: { upy: 10, gain: 'ruins_success' } });
  const again = await graph.act('language_ruins', {
    characterId,
    language: 'ancient',
    ruinsId: 'ruins_lexicon',
    success: false,
  });
  expect(again).toMatchObject({ ok: false, code: 'once' });
  const deal = await graph.act('language_interact', { characterId, language: 'common_dark' });
  expect(deal).toMatchObject({ ok: true, value: { upy: 5, gain: 'interaction' } });
});

test('chatPresentation runs from the live chat route', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('./modules/social/service.ts', import.meta.url), 'utf8');
  const say = composeSource.slice(
    composeSource.indexOf('async function sayChat'),
    composeSource.indexOf('function recordCheatStrike'),
  );
  expect(say.includes('chatPresentation(')).toBe(true);
  expect(service.includes('chatPresentation(')).toBe(true);
  expect(say.includes('muteRemainingMs')).toBe(true);
});

test('textHitsBlacklist runs on chat send and a listed token is not delivered', async () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const say = composeSource.slice(
    composeSource.indexOf('async function sayChat'),
    composeSource.indexOf('function recordCheatStrike'),
  );
  expect(say.includes('textHitsBlacklist(')).toBe(true);
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  const sent = await graph.act('chat_say', { characterId: 'lia', text: 'slug' });
  expect(sent).toMatchObject({ ok: true, value: { delivered: 0, listed: true } });
  expect(graph.social.service.sanctionOf('lia')).toBe('mute_1h');
  const clean = await graph.act('chat_say', { characterId: 'lia', text: 'hello' });
  expect(clean.ok).toBe(false);
});

test('questLanguageAccess denies a quest when side-language UPY is 30 or less', async () => {
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const accept = dispatch.slice(dispatch.indexOf('async function questAccept'), dispatch.indexOf('async function questTurnIn'));
  expect(accept.includes('questLanguageAccess(')).toBe(true);
  const graph = compose({ nowMs: 0 });
  const created = await graph.character.service.create({
    accountId: 'account-quest',
    controller: 'player',
    name: 'Ques',
    clean: false,
    points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
    appearance,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  const characterId = created.value.characterId;
  const record = await graph.character.repository.findById(characterId);
  expect(record).not.toBeNull();
  if (record === null) {
    return;
  }
  await graph.character.repository.update({
    ...record,
    languages: { ...record.languages, common_light: 30 },
  });
  const denied = await graph.act('quest_accept', { characterId, questId: 'tutorial' });
  expect(denied).toMatchObject({ ok: false, code: 'language' });
  await graph.character.repository.update({
    ...record,
    languages: { ...record.languages, common_light: 40 },
  });
  const garbled = await graph.act('quest_accept', { characterId, questId: 'tutorial' });
  expect(garbled.ok).toBe(true);
});
