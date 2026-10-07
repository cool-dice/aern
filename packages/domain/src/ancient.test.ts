import { expect, test } from 'vitest';
import {
  CIPHER_GLYPHS,
  PLAIN_ALPHABET,
  botRecord,
  buildPermutation,
  decipherAttempt,
  decodeAncient,
  encodeAncient,
  renderFragment,
  type AncientFragment,
} from './ancient';

const SAMPLE = 'привет мир';

function fragment(plaintext: string): AncientFragment {
  return {
    id: 'fragment-1',
    plaintext,
    x: 1,
    y: 2,
    recipeId: 'energy_blade',
    password: 'secret',
  };
}

function withSwappedLetters(permutation: string, left: string, right: string): string {
  const chars = Array.from(permutation);
  const i = PLAIN_ALPHABET.indexOf(left);
  const j = PLAIN_ALPHABET.indexOf(right);
  const atI = chars[i];
  const atJ = chars[j];
  if (atI === undefined || atJ === undefined) {
    throw new Error('letter missing from alphabet');
  }
  chars[i] = atJ;
  chars[j] = atI;
  return chars.join('');
}

test('one secret yields one permutation', () => {
  const first = buildPermutation('test-secret');
  expect(buildPermutation('test-secret')).toBe(first);
  expect(first[0]).toBe(buildPermutation('test-secret')[0]);
});

test('a different secret yields a different permutation', () => {
  const first = buildPermutation('test-secret');
  const otherSecret = buildPermutation('other') === first ? 'other-2' : 'other';
  expect(buildPermutation(otherSecret)).not.toBe(first);
});

test('permutation is 33 unique glyphs from the cipher alphabet', () => {
  const permutation = buildPermutation('test-secret');
  expect(permutation).toHaveLength(33);
  expect(new Set(permutation).size).toBe(33);
  expect(PLAIN_ALPHABET).toHaveLength(33);
  expect(new Set(PLAIN_ALPHABET).size).toBe(33);
  expect(CIPHER_GLYPHS).toHaveLength(33);
  expect(new Set(CIPHER_GLYPHS).size).toBe(33);
  expect(CIPHER_GLYPHS.includes(' ')).toBe(false);
  expect([...permutation].sort()).toEqual([...CIPHER_GLYPHS].sort());
});

test('decode(encode) roundtrips привет мир', () => {
  const permutation = buildPermutation('test-secret');
  expect(decodeAncient(encodeAncient(SAMPLE, permutation), permutation)).toBe(SAMPLE);
});

test('spaces stay spaces', () => {
  const permutation = buildPermutation('test-secret');
  expect(encodeAncient('а б', permutation).charAt(1)).toBe(' ');
  expect(encodeAncient('а  б', permutation).slice(1, 3)).toBe('  ');
  expect(decodeAncient('x y', permutation).includes(' ')).toBe(true);
});

test('ё folds to е and Cyrillic case folds before encryption', () => {
  const permutation = buildPermutation('test-secret');
  expect(encodeAncient('Ёлка', permutation)).toBe(encodeAncient('елка', permutation));
  expect(encodeAncient('Ж', permutation)).toBe(encodeAncient('ж', permutation));
  expect(decodeAncient(encodeAncient('ЁЖ', permutation), permutation)).toBe('еж');
});

test('latin letters and digits are copied as-is', () => {
  const permutation = buildPermutation('test-secret');
  expect(encodeAncient('A1 z', permutation)).toBe('A1 z');
});

test('botRecord exposes password and confidence without ciphertext', () => {
  const lore = SAMPLE;
  const record = botRecord({
    id: 'node_42',
    lore,
    x: 120,
    y: 45,
    recipeId: 'energy_blade',
    password: 'X7#9@!',
  });
  expect(record.event).toBe('ancient_record');
  expect(record.location).toBe('node_42');
  expect(record.content.password).toBe('X7#9@!');
  expect(record.confidence).toBe(0.9);
  expect(record.content.lore).toBe(lore);
  expect(record.content.recipe).toBe('energy_blade');
  expect(record.content.coordinates).toEqual({ x: 120, y: 45 });
  const cipher = encodeAncient(lore, buildPermutation('test-secret'));
  expect(JSON.stringify(record)).not.toContain(cipher);
  expect(record).not.toHaveProperty('ciphertext');
});

test('upy 100 still shows ciphertext until the fragment is solved', () => {
  const permutation = buildPermutation('test-secret');
  const item = fragment(SAMPLE);
  const hidden = renderFragment({
    fragment: item,
    permutation,
    knownLetters: ['п', 'р'],
    solved: false,
    upy: 100,
  });
  expect(hidden.solved).toBe(false);
  expect(hidden.plaintext).toBeNull();
  expect(hidden.ciphertext).toBe(encodeAncient(SAMPLE, permutation));
  expect(hidden.ciphertext).not.toBe(SAMPLE);
  expect(hidden.knownLetters).toEqual([
    { letter: 'п', glyph: permutation[PLAIN_ALPHABET.indexOf('п')] },
    { letter: 'р', glyph: permutation[PLAIN_ALPHABET.indexOf('р')] },
  ]);
  const revealed = renderFragment({
    fragment: item,
    permutation,
    knownLetters: ['п'],
    solved: true,
    upy: 0,
  });
  expect(revealed.solved).toBe(true);
  expect(revealed.plaintext).toBe(SAMPLE);
});

test('a full matching substitution returns plaintext and the first-solve flag', () => {
  const permutation = buildPermutation('test-secret');
  const item = fragment('Привет мир');
  const first = decipherAttempt({
    fragment: item,
    permutation,
    knownLetters: ['п'],
    attempt: permutation,
    solved: false,
  });
  expect(first).toEqual({
    ok: true,
    value: { plaintext: 'Привет мир', solved: true, firstSolve: true },
  });
  const again = decipherAttempt({
    fragment: item,
    permutation,
    knownLetters: ['п'],
    attempt: permutation,
    solved: true,
  });
  expect(again.ok).toBe(true);
  if (again.ok) {
    expect(again.value.firstSolve).toBe(false);
  }
});

test('a partial substitution does not reveal unknown letters or plaintext', () => {
  const permutation = buildPermutation('test-secret');
  const item = fragment(SAMPLE);
  const attempt = withSwappedLetters(permutation, 'р', 'и');
  const result = decipherAttempt({
    fragment: item,
    permutation,
    knownLetters: ['п'],
    attempt,
    solved: false,
  });
  expect(result).toEqual({ ok: false, code: 'mismatch' });
  expect(JSON.stringify(result)).toBe('{"ok":false,"code":"mismatch"}');
});

test('known letters must match even when the full text still decodes', () => {
  const permutation = buildPermutation('test-secret');
  const item = fragment(SAMPLE);
  const attempt = withSwappedLetters(permutation, 'а', 'б');
  const result = decipherAttempt({
    fragment: item,
    permutation,
    knownLetters: ['а'],
    attempt,
    solved: false,
  });
  expect(result).toEqual({ ok: false, code: 'mismatch' });
  expect(JSON.stringify(result)).not.toContain(SAMPLE);
});
