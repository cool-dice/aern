import { expect, test } from 'vitest';
import { readWiki, vote, writeBotEntry, writeProse, type WikiBotEntry } from './wiki';

const entry: WikiBotEntry = {
  action: 'move_north',
  from: 'node_42',
  result: 'node_17',
  tags: ['forest', 'hellhounds', 'danger_high'],
  confidence: 0.8,
  author: 'bot_1337',
};

test('a primordial article is sealed', () => {
  expect(vote('primordial', 'light', null, 1)).toEqual({ ok: false, code: 'sealed' });
  expect(vote('primordial', 'dark', 1, -1)).toEqual({ ok: false, code: 'sealed' });
  expect(writeProse('primordial', 'light', 'лор')).toEqual({ ok: false, code: 'sealed' });
  expect(writeBotEntry('primordial', 'dark', entry)).toEqual({ ok: false, code: 'sealed' });
});

test('the other side cannot read, write, or vote', () => {
  expect(vote('dark', 'light', null, 1)).toEqual({ ok: false, code: 'side' });
  expect(vote('light', 'dark', null, -1)).toEqual({ ok: false, code: 'side' });
  expect(readWiki('dark', 'light')).toEqual({ ok: false, code: 'side' });
  expect(writeProse('light', 'dark', 'чужое')).toEqual({ ok: false, code: 'side' });
  expect(writeBotEntry('light', 'dark', entry)).toEqual({ ok: false, code: 'side' });
});

test('changing a vote from 1 to -1 moves the rating by -2', () => {
  expect(vote('light', 'light', 1, -1)).toEqual({
    ok: true,
    value: { ratingDelta: -2, vote: -1 },
  });
});

test('a new vote adds its value, and repeating a vote replaces it', () => {
  expect(vote('dark', 'dark', null, 1)).toEqual({
    ok: true,
    value: { ratingDelta: 1, vote: 1 },
  });
  expect(vote('dark', 'dark', null, -1)).toEqual({
    ok: true,
    value: { ratingDelta: -1, vote: -1 },
  });
  expect(vote('light', 'light', -1, 1)).toEqual({
    ok: true,
    value: { ratingDelta: 2, vote: 1 },
  });
  expect(vote('light', 'light', 1, 1)).toEqual({
    ok: true,
    value: { ratingDelta: 0, vote: 1 },
  });
});

test('primordial lore is readable by both sides, and the own side is readable', () => {
  expect(readWiki('primordial', 'light')).toEqual({ ok: true, value: true });
  expect(readWiki('primordial', 'dark')).toEqual({ ok: true, value: true });
  expect(readWiki('light', 'light')).toEqual({ ok: true, value: true });
});

test('a human writes prose and a bot writes a structured entry without UPY', () => {
  expect(writeProse('light', 'light', 'заметка')).toEqual({
    ok: true,
    value: { text: 'заметка' },
  });
  expect(writeProse('dark', 'dark', '')).toEqual({ ok: false, code: 'empty' });
  expect(writeBotEntry('dark', 'dark', entry)).toEqual({ ok: true, value: entry });
  expect(writeBotEntry('dark', 'dark', { ...entry, action: '' })).toEqual({
    ok: false,
    code: 'shape',
  });
});
