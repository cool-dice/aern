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

test('canCraftLanguage blocks a recipe when side-language UPY is below 60', async () => {
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const craft = readFileSync(new URL('./modules/craft/service.ts', import.meta.url), 'utf8');
  const start = dispatch.slice(dispatch.indexOf('async function craftStart'), dispatch.indexOf('async function craftComplete'));
  expect(start.includes('canCraftLanguage(')).toBe(true);
  expect(craft.includes('canCraftLanguage(')).toBe(true);
  const graph = compose({ nowMs: 0 });
  const created = await graph.character.service.create({
    accountId: 'account-craft',
    controller: 'player',
    name: 'Cra',
    clean: false,
    points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
    appearance,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  const characterId = created.value.characterId;
  graph.enterCharacter('account-craft', characterId);
  const record = await graph.character.repository.findById(characterId);
  if (record === null) {
    return;
  }
  await graph.character.repository.update({
    ...record,
    languages: { ...record.languages, common_light: 59 },
  });
  const blocked = await graph.act('craft_start', { characterId, recipeId: 'rusty_sword', itemLevel: 1 });
  expect(blocked).toMatchObject({ ok: false, code: 'language' });
});

test('refine spends 3 ordinary resource and 10 gold from the live route', async () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const route = composeSource.slice(
    composeSource.indexOf('async function refineResource'),
    composeSource.indexOf('async function advanceForgetting'),
  );
  expect(route.includes('refine(')).toBe(true);
  expect(dispatch.includes('refineResource(')).toBe(true);
  expect(app.includes('postRefine(')).toBe(true);
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.creditGold('lia', 25);
  await graph.creditMaterial('lia', 'metal', 7);
  const refined = await graph.act('refine', { characterId: 'lia', resourceId: 'metal' });
  expect(refined).toMatchObject({
    ok: true,
    value: { resourceId: 'metal', normalLeft: 1, cleanedGained: 2, gold: 5 },
  });
  expect(await graph.materialQty('lia', 'metal_cleaned')).toBe(2);
});

test('relic implant categories are four body slots and echo sockets stay 1/2/3/3', async () => {
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const relic = dispatch.slice(dispatch.indexOf('async function relic'), dispatch.indexOf('async function echo'));
  expect(relic.includes('IMPLANT_SLOTS')).toBe(true);
  expect(relic.includes('socketCount(')).toBe(true);
  const graph = compose({ nowMs: 0 });
  const created = await graph.character.service.create({
    accountId: 'account-slots',
    controller: 'player',
    name: 'Slot',
    clean: false,
    points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
    appearance,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  const characterId = created.value.characterId;
  graph.creditGold(characterId, 5000);
  const rare = await graph.act('relic_install', { characterId, subtype: 'plate', grade: 'rare' });
  expect(rare).toMatchObject({ ok: true, value: { sockets: 2, implantSlot: 'implant_head' } });
  expect(await graph.act('relic_install', { characterId, subtype: 'plate', implantSlot: 'implant_head' })).toMatchObject({
    ok: false,
    code: 'slot',
  });
  expect(await graph.act('relic_install', { characterId, subtype: 'plate', implantSlot: 'implant_torso' })).toMatchObject({
    ok: true,
  });
  expect(await graph.act('relic_install', { characterId, subtype: 'plate', implantSlot: 'implant_hands' })).toMatchObject({
    ok: true,
  });
  expect(await graph.act('relic_install', { characterId, subtype: 'plate', implantSlot: 'implant_legs' })).toMatchObject({
    ok: true,
  });
  expect(await graph.act('relic_install', { characterId, subtype: 'plate' })).toMatchObject({
    ok: false,
    code: 'slot',
  });
});

test('relicBonuses applies worn relic armor on the combat tick', async () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const tick = readFileSync(new URL('./sim/tick.ts', import.meta.url), 'utf8');
  const once = composeSource.slice(
    composeSource.indexOf('async function tickOnce'),
    composeSource.indexOf('async function hydrate'),
  );
  const stamp = composeSource.slice(
    composeSource.indexOf('async function stampWornRelics'),
    composeSource.indexOf('function relicReady'),
  );
  const combatant = tick.slice(tick.indexOf('function toCombatant'), tick.indexOf('function commitCombatant'));
  expect(once.includes('stampWornRelics(')).toBe(true);
  expect(stamp.includes('relicBonuses(')).toBe(true);
  expect(combatant.includes('relicArmor')).toBe(true);
  const graph = compose({ nowMs: 0 });
  const created = await graph.character.service.create({
    accountId: 'account-relic',
    controller: 'player',
    name: 'Rel',
    clean: false,
    points: { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 },
    appearance,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    return;
  }
  const characterId = created.value.characterId;
  graph.enterCharacter('account-relic', characterId);
  expect(await graph.act('relic_install', { characterId, subtype: 'plate', grade: 'common' })).toMatchObject({
    ok: true,
  });
  await graph.tickOnce();
  const self = (graph.state() as { self: { relicArmor?: number } | null }).self;
  expect(self?.relicArmor).toBe(1);
});
