import { readFileSync } from 'node:fs';
import { GUILD_CREATE_GOLD } from '@rift/domain/guild';
import { expect, test } from 'vitest';
import { compose } from './compose';

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
