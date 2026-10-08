import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { compose } from './compose';

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
