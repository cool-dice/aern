import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { compose } from '../compose';
import { choiceReputation, nextReputation, reputationScene } from './reputation';

test('dialogue and quest outcomes call bumpReputation through the live path', () => {
  const source = readFileSync(new URL('./reputation.ts', import.meta.url), 'utf8');
  const composeSource = readFileSync(new URL('../compose.ts', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('../runtime/dispatch.ts', import.meta.url), 'utf8');
  expect(source.includes('bumpReputation(')).toBe(true);
  expect(composeSource.includes('shiftReputation(')).toBe(true);
  expect(composeSource.includes('reputationScene(')).toBe(true);
  expect(composeSource.includes("bus.on('quest.completed'")).toBe(true);
  expect(dispatch.includes('shiftReputation(')).toBe(true);
  expect(choiceReputation('question')).toBe('gift');
  expect(nextReputation(undefined, 'gift')).toBe(3);
  expect(reputationScene('Master Koval.', undefined)).toBe('Master Koval.');
  expect(reputationScene('Master Koval.', 3)).toContain('refuses further quests');
});

test('a dialogue choice stores reputation and a later scene reads it', async () => {
  const graph = compose({ nowMs: 1_000 });
  graph.enterCharacter('account-lia', 'lia');
  expect(await graph.act('quest_accept', { characterId: 'lia', questId: 'act1_light' })).toMatchObject({
    ok: true,
  });
  const chosen = await graph.act('dialogue', {
    characterId: 'lia',
    questId: 'act1_light',
    choiceId: 'question',
    npcId: 'koval',
  });
  expect(chosen).toMatchObject({ ok: true, value: { reputation: 3 } });
  const viewed = graph.state() as {
    reputation: Record<string, number>;
    players: { quests: { id: string; objectives: { id: string; scene?: string }[] }[] }[];
  };
  expect(viewed.reputation.koval).toBe(3);
  const scene = viewed.players[0]?.quests
    .find((quest) => quest.id === 'act1_light')
    ?.objectives.find((objective) => objective.id === 'koval')?.scene;
  expect(scene).toContain('Refused: reputation is too low for this quest.');
  expect(scene).not.toContain('questioned the council');
});
