import { readFileSync } from 'node:fs';
import { buildPermutation, encodeAncient } from '@rift/domain/ancient';
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

const PURIFY_MS = 24 * 60 * 60_000;

test('posted contracts carry the resource and relic rewards the artifact names', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const board = composeSource.slice(
    composeSource.indexOf('async function postBoardContract'),
    composeSource.indexOf('function visibleContracts'),
  );
  expect(board.includes('postContract(')).toBe(true);
  expect(board.includes('rewardResources')).toBe(true);
  expect(board.includes('rewardRelics')).toBe(true);
  expect(board.includes('untilMs')).toBe(false);
  expect(app.includes('postContractBoard(')).toBe(true);
  expect(app.includes('rewardResources: 10')).toBe(true);
  expect(app.includes('rewardRelics: 1')).toBe(true);
});

test('a city board stores a kill resource reward and a steal relic reward', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.place('lia', 'fort_humans');
  const kill = await graph.act('contract_post', {
    characterId: 'lia',
    type: 'kill',
    rewardGold: 100,
    rewardResources: 10,
    targetLevel: 10,
    targetIsMember: false,
  });
  expect(kill).toMatchObject({
    ok: true,
    value: { type: 'kill', rewardGold: 100, rewardResources: 10, rewardRelics: 0 },
  });
  expect((kill.value as { untilMs?: number }).untilMs).toBeUndefined();
  const relicOnKill = await graph.act('contract_post', {
    characterId: 'lia',
    type: 'kill',
    rewardGold: 100,
    rewardRelics: 1,
    targetLevel: 10,
  });
  expect(relicOnKill).toMatchObject({ ok: false, code: 'gold' });
  const steal = await graph.act('contract_post', {
    characterId: 'lia',
    type: 'steal',
    rewardGold: 20,
    rewardRelics: 1,
  });
  expect(steal).toMatchObject({
    ok: true,
    value: { type: 'steal', rewardGold: 20, rewardRelics: 1, rewardResources: 0 },
  });
  const smuggle = await graph.act('contract_post', {
    characterId: 'lia',
    type: 'smuggle',
    rewardGold: 5,
    rewardResources: 4,
  });
  expect(smuggle).toMatchObject({ ok: false, code: 'gold' });
});

test('a false report is judged on the live route and mutes chat for 24 hours', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const judge = composeSource.slice(
    composeSource.indexOf('function judgeReport'),
    composeSource.indexOf('async function sayChat'),
  );
  expect(judge.includes('falseReportSanction(')).toBe(true);
  expect(judge.includes('imposeSanction(')).toBe(true);
  expect(dispatch.includes("case 'report_judge'")).toBe(true);
  expect(dispatch.includes('judgeReport(')).toBe(true);
  expect(dispatch.includes("case 'chat_say'")).toBe(true);
  expect(composeSource.includes("path: '/report/judge'")).toBe(true);
  expect(composeSource.includes("path: '/chat'")).toBe(true);
});

test('the mute from a false report blocks chat until 24 hours elapse', async () => {
  const graph = compose({ nowMs: 0 });
  graph.enterCharacter('account-lia', 'lia');
  graph.appointStaff('mod', 'moderator');
  const filed = await graph.act('report_file', {
    reporterId: 'lia',
    targetId: 'kai',
    reason: 'camping the bind',
  });
  expect(filed.ok).toBe(true);
  const reportId = (filed.value as { id: string }).id;
  expect(
    await graph.act('report_judge', { reportId, reviewerId: 'lia', verdict: false }),
  ).toMatchObject({ ok: false, code: 'rank' });
  const judged = await graph.act('report_judge', { reportId, reviewerId: 'mod', verdict: false });
  expect(judged).toMatchObject({
    ok: true,
    value: { reporterId: 'lia', sanction: 'mute_24h', untilMs: 24 * 3_600_000 },
  });
  expect(await graph.act('chat_say', { characterId: 'lia', text: 'hello square' })).toMatchObject({
    ok: false,
    code: 'muted',
  });
  await graph.skipMs(24 * 3_600_000 - 1);
  expect(await graph.act('chat_say', { characterId: 'lia', text: 'still quiet' })).toMatchObject({
    ok: false,
    code: 'muted',
  });
  await graph.skipMs(1);
  expect(await graph.act('chat_say', { characterId: 'lia', text: 'hello square' })).toMatchObject({
    ok: true,
    value: { delivered: 1 },
  });
});

test('cheat strikes are sanctioned from tickOnce and skipMs', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const tickBody = composeSource.slice(
    composeSource.indexOf('async function tickOnce'),
    composeSource.indexOf('function simSnapshot'),
  );
  const skipBody = composeSource.slice(
    composeSource.indexOf('async function skipMs'),
    composeSource.indexOf('function guardAllies'),
  );
  const review = composeSource.slice(
    composeSource.indexOf('async function reviewCheatStrikes'),
    composeSource.indexOf('async function applyCheatSanction'),
  );
  expect(tickBody.includes('reviewCheatStrikes(')).toBe(true);
  expect(skipBody.includes('reviewCheatStrikes(')).toBe(true);
  expect(review.includes('sanctionForCheatStrikes(')).toBe(true);
  expect(dispatch.includes("case 'cheat_strike'")).toBe(true);
  expect(dispatch.includes('noteCheatStrike(')).toBe(true);
  expect(composeSource.includes("path: '/cheat/strike'")).toBe(true);
});

test('three cheat strikes in 24 hours ban the account for 7 days, and the next window is permanent', async () => {
  const graph = compose({ nowMs: 0 });
  const registered = await graph.auth.service.register('lia@rift.test', 'password1');
  expect(registered.ok).toBe(true);
  if (!registered.ok) {
    return;
  }
  const accountId = registered.value.accountId;
  expect(await graph.act('cheat_strike', { accountId })).toMatchObject({ ok: true, value: { strikes: 1 } });
  expect(await graph.act('cheat_strike', { accountId })).toMatchObject({ ok: true, value: { strikes: 2 } });
  await graph.tickOnce();
  expect((await graph.auth.service.login('lia@rift.test', 'password1')).ok).toBe(true);
  expect(await graph.act('cheat_strike', { accountId })).toMatchObject({ ok: true, value: { strikes: 3 } });
  await graph.tickOnce();
  expect(await graph.auth.service.login('lia@rift.test', 'password1')).toEqual({ ok: false, code: 'banned' });
  await graph.skipMs(7 * 86_400_000);
  expect((await graph.auth.service.login('lia@rift.test', 'password1')).ok).toBe(true);
  expect(await graph.act('cheat_strike', { accountId })).toMatchObject({ ok: true, value: { strikes: 1 } });
  await graph.act('cheat_strike', { accountId });
  await graph.act('cheat_strike', { accountId });
  await graph.skipMs(0);
  expect(await graph.auth.service.login('lia@rift.test', 'password1')).toEqual({ ok: false, code: 'banned' });
  await graph.skipMs(7 * 86_400_000);
  expect(await graph.auth.service.login('lia@rift.test', 'password1')).toEqual({ ok: false, code: 'banned' });
});

test('ancient encode and decipher are live routes', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const encode = composeSource.slice(
    composeSource.indexOf('function encodeAncientText'),
    composeSource.indexOf('function decipherAncient'),
  );
  const decipher = composeSource.slice(
    composeSource.indexOf('function decipherAncient'),
    composeSource.indexOf('function useCoalitionBank'),
  );
  expect(encode.includes('encodeAncient(')).toBe(true);
  expect(decipher.includes('decipherAttempt(')).toBe(true);
  expect(decipher.includes('lockout')).toBe(false);
  expect(dispatch.includes("case 'ancient_encode'")).toBe(true);
  expect(dispatch.includes('encodeAncientText(')).toBe(true);
  expect(dispatch.includes("case 'ancient_decipher'")).toBe(true);
  expect(dispatch.includes('decipherAncient(')).toBe(true);
  expect(composeSource.includes("path: '/ancient/encode'")).toBe(true);
  expect(composeSource.includes("path: '/ancient/decipher'")).toBe(true);
  expect(app.includes('encodeAncientLine(')).toBe(true);
  expect(app.includes('decipherAncient(')).toBe(true);
});

test('a matching substitution reveals the fragment and a mismatch does not lock the character out', async () => {
  const graph = compose({ nowMs: 0, jwtSecret: 'test-secret' });
  graph.enterCharacter('account-lia', 'lia');
  const permutation = buildPermutation('test-secret');
  const encoded = await graph.act('ancient_encode', { text: 'привет' });
  expect(encoded).toMatchObject({
    ok: true,
    value: { ciphertext: encodeAncient('привет', permutation) },
  });
  const wrong = await graph.act('ancient_decipher', {
    characterId: 'lia',
    fragmentId: 'fragment_rift_01',
    attempt: '?',
    knownLetters: ['п'],
  });
  expect(wrong).toEqual({ ok: false, code: 'mismatch' });
  const again = await graph.act('ancient_decipher', {
    characterId: 'lia',
    fragmentId: 'fragment_rift_01',
    attempt: '??',
  });
  expect(again).toEqual({ ok: false, code: 'mismatch' });
  expect(JSON.stringify(again)).not.toContain('Предтечи');
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
  const value = opened.value as { plaintext: string; solved: boolean; firstSolve: boolean };
  expect(value.solved).toBe(true);
  expect(value.firstSolve).toBe(true);
  expect(value.plaintext.includes('Предтечи')).toBe(true);
  const repeat = await graph.act('ancient_decipher', {
    characterId: 'lia',
    fragmentId: 'fragment_rift_01',
    attempt: permutation,
  });
  expect(repeat).toMatchObject({ ok: true, value: { firstSolve: false, solved: true } });
});

test('a coalition bank route calls coalitionBank for members', () => {
  const composeSource = readFileSync(new URL('./compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./runtime/dispatch.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const bank = composeSource.slice(
    composeSource.indexOf('function useCoalitionBank'),
    composeSource.indexOf('function noteWarRoster'),
  );
  expect(bank.includes('coalitionBank(')).toBe(true);
  expect(dispatch.includes("case 'coalition_bank'")).toBe(true);
  expect(dispatch.includes('useCoalitionBank(')).toBe(true);
  expect(composeSource.includes("path: '/coalition/bank'")).toBe(true);
  expect(app.includes("op: 'deposit'")).toBe(true);
  expect(app.includes("op: 'read'")).toBe(true);
  expect(app.includes('postCoalitionBank(')).toBe(true);
});

test('coalition members can post a deposit and a read, and the artifact keeps the bank closed', async () => {
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
  expect(wolves.ok).toBe(true);
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
  expect(ash.ok).toBe(true);
  const wolvesId = (wolves.value as { guildId: string }).guildId;
  const ashId = (ash.value as { guildId: string }).guildId;
  expect(await graph.act('coalition_bank', { characterId: 'lia', op: 'deposit', amount: 10 })).toMatchObject({
    ok: false,
    code: 'member',
  });
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
  expect(await graph.act('coalition_bank', { characterId: 'kai', op: 'read' })).toMatchObject({
    ok: false,
    code: 'bank',
    value: { op: 'read', guildId: ashId },
  });
  expect(await graph.act('coalition_bank', { characterId: 'm1', op: 'read' })).toMatchObject({
    ok: false,
    code: 'bank',
    value: { op: 'read', guildId: wolvesId },
  });
  graph.enterCharacter('account-noa', 'noa');
  expect(await graph.act('coalition_bank', { characterId: 'noa', op: 'deposit', amount: 10 })).toMatchObject({
    ok: false,
    code: 'member',
  });
});

test('purification starts from the live route and completes from tickOnce and skipMs', () => {
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
  const route = composeSource.slice(
    composeSource.indexOf('async function startPurify'),
    composeSource.indexOf('async function finishPurifications'),
  );
  const finish = composeSource.slice(
    composeSource.indexOf('async function finishPurifications'),
    composeSource.indexOf('async function persistPurify'),
  );
  expect(tickBody.includes('finishPurifications(')).toBe(true);
  expect(skipBody.includes('finishPurifications(')).toBe(true);
  expect(route.includes('beginPurify(')).toBe(true);
  expect(route.includes('storedRelicsLeft(')).toBe(true);
  expect(route.includes('implantCoresLeft(')).toBe(true);
  expect(route.includes('body.relicsLeft')).toBe(false);
  expect(route.includes('body.implantCoresLeft')).toBe(false);
  expect(finish.includes('completePurify(')).toBe(true);
  expect(dispatch.includes("case 'purify'")).toBe(true);
  expect(dispatch.includes('startPurify(')).toBe(true);
  expect(composeSource.includes("path: '/purify'")).toBe(true);
  expect(app.includes('postPurify(')).toBe(true);
});

test('a worn relic or implant core blocks purification, and an empty body cleans after 24 hours', async () => {
  const graph = compose({ nowMs: 0 });
  const points = { ...emptyPoints(), body: 10, reaction: 5, accuracy: 5 };
  const relic = await graph.character.service.create({
    accountId: 'account-relic',
    controller: 'player',
    name: 'Rel',
    clean: false,
    points,
    appearance,
  });
  const implant = await graph.character.service.create({
    accountId: 'account-implant',
    controller: 'player',
    name: 'Imp',
    clean: false,
    points,
    appearance,
  });
  const body = await graph.character.service.create({
    accountId: 'account-body',
    controller: 'player',
    name: 'Noa',
    clean: false,
    points,
    appearance,
  });
  expect(relic.ok && implant.ok && body.ok).toBe(true);
  if (!relic.ok || !implant.ok || !body.ok) {
    return;
  }
  const relicId = relic.value.characterId;
  const implantId = implant.value.characterId;
  const bodyId = body.value.characterId;
  await graph.character.service.grantXp(bodyId, 500);
  graph.creditGold(bodyId, 200);
  expect(await graph.act('relic_install', { characterId: relicId, subtype: 'spore' })).toMatchObject({
    ok: true,
  });
  expect(
    await graph.act('purify', { characterId: relicId, relicsLeft: 0, implantCoresLeft: 0 }),
  ).toMatchObject({ ok: false, code: 'still_impure' });
  expect(
    await graph.act('core_equip', { characterId: implantId, templateId: 'titan', implant: true }),
  ).toMatchObject({ ok: true, value: { cores: 1 } });
  expect(await graph.act('purify', { characterId: implantId })).toMatchObject({
    ok: false,
    code: 'still_impure',
  });
  expect(await graph.act('path_learn', { characterId: bodyId, templateId: 'ward' })).toMatchObject({
    ok: false,
    code: 'incompatible',
  });
  const started = await graph.act('purify', { characterId: bodyId });
  expect(started).toMatchObject({
    ok: true,
    value: { purifyingUntilMs: PURIFY_MS, clean: false },
  });
  expect(await graph.act('purify', { characterId: bodyId })).toMatchObject({ ok: false, code: 'busy' });
  await graph.skipMs(PURIFY_MS - 100);
  expect(await graph.act('purify', { characterId: bodyId })).toMatchObject({ ok: false, code: 'busy' });
  expect(await graph.act('path_learn', { characterId: bodyId, templateId: 'ward' })).toMatchObject({
    ok: false,
    code: 'incompatible',
  });
  await graph.tickOnce();
  expect(await graph.act('path_learn', { characterId: bodyId, templateId: 'ward' })).toMatchObject({
    ok: true,
  });
  const again = await graph.act('purify', { characterId: bodyId });
  expect(again).toMatchObject({ ok: true, value: { clean: false } });
  const againUntil = (again.value as { purifyingUntilMs: number }).purifyingUntilMs;
  expect(await graph.act('purify', { characterId: bodyId })).toMatchObject({ ok: false, code: 'busy' });
  await graph.skipMs(PURIFY_MS);
  const restarted = await graph.act('purify', { characterId: bodyId });
  expect(restarted.ok).toBe(true);
  expect((restarted.value as { purifyingUntilMs: number }).purifyingUntilMs).toBe(againUntil + PURIFY_MS);
});
