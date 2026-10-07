import { ok, err, type Result } from './result';
import { hashSeed, mulberry32 } from './rng';

/**
 * Standard Russian alphabet, 33 letters. The set without ё has 32 letters;
 * ё stays in the alphabet so the key is a 33-way bijection, and encode folds ё to е.
 */
export const PLAIN_ALPHABET = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';

/** First 33 characters of the task glyph string (that literal is 34). No space. */
export const CIPHER_GLYPHS = '!#$%&()*+,-./0123456789:;<=>?@[]^';

export interface AncientFragment {
  id: string;
  plaintext: string;
  x: number;
  y: number;
  recipeId: string;
  password: string;
}

export interface KnownLetterPair {
  letter: string;
  glyph: string;
}

export interface RenderedFragment {
  ciphertext: string;
  knownLetters: KnownLetterPair[];
  solved: boolean;
  plaintext: string | null;
}

export interface DecipherSuccess {
  plaintext: string;
  solved: true;
  firstSolve: boolean;
}

function foldPlainChar(ch: string): string {
  const lower = ch.toLowerCase();
  if (lower === 'ё') {
    return 'е';
  }
  if (PLAIN_ALPHABET.includes(lower)) {
    return lower;
  }
  return ch;
}

function normalizePlain(text: string): string {
  let out = '';
  for (const ch of text) {
    out += foldPlainChar(ch);
  }
  return out;
}

export function buildPermutation(serverSecret: string): string {
  const rng = mulberry32(hashSeed(serverSecret));
  const glyphs = Array.from(CIPHER_GLYPHS);
  for (let i = glyphs.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const atI = glyphs[i];
    const atJ = glyphs[j];
    if (atI === undefined || atJ === undefined) {
      throw new Error('fisher-yates index out of range');
    }
    glyphs[i] = atJ;
    glyphs[j] = atI;
  }
  return glyphs.join('');
}

export function encodeAncient(plain: string, permutation: string): string {
  let out = '';
  for (const ch of plain) {
    if (ch === ' ') {
      out += ' ';
      continue;
    }
    const folded = foldPlainChar(ch);
    const index = PLAIN_ALPHABET.indexOf(folded);
    if (index < 0) {
      out += ch;
      continue;
    }
    const glyph = permutation[index];
    if (glyph === undefined) {
      throw new Error('permutation shorter than alphabet');
    }
    out += glyph;
  }
  return out;
}

export function decodeAncient(cipher: string, permutation: string): string {
  let out = '';
  for (const ch of cipher) {
    if (ch === ' ') {
      out += ' ';
      continue;
    }
    const index = permutation.indexOf(ch);
    if (index < 0) {
      out += ch;
      continue;
    }
    const letter = PLAIN_ALPHABET[index];
    if (letter === undefined) {
      out += ch;
      continue;
    }
    out += letter;
  }
  return out;
}

export function botRecord(fragment: {
  id: string;
  lore: string;
  x: number;
  y: number;
  recipeId: string;
  password: string;
}): {
  event: 'ancient_record';
  location: string;
  content: {
    lore: string;
    coordinates: { x: number; y: number };
    recipe: string;
    password: string;
  };
  confidence: 0.9;
} {
  return {
    event: 'ancient_record',
    location: fragment.id,
    content: {
      lore: fragment.lore,
      coordinates: { x: fragment.x, y: fragment.y },
      recipe: fragment.recipeId,
      password: fragment.password,
    },
    confidence: 0.9,
  };
}

export function renderFragment(input: {
  fragment: AncientFragment;
  permutation: string;
  knownLetters: readonly string[];
  solved: boolean;
  upy: number;
}): RenderedFragment {
  const { fragment, permutation, knownLetters, solved } = input;
  const ciphertext = encodeAncient(fragment.plaintext, permutation);
  const seen = new Set<string>();
  const pairs: KnownLetterPair[] = [];
  for (const known of knownLetters) {
    const letter = foldPlainChar(known);
    const index = PLAIN_ALPHABET.indexOf(letter);
    if (index < 0 || seen.has(letter)) {
      continue;
    }
    const glyph = permutation[index];
    if (glyph === undefined) {
      continue;
    }
    seen.add(letter);
    pairs.push({ letter, glyph });
  }
  return {
    ciphertext,
    knownLetters: pairs,
    solved,
    plaintext: solved ? fragment.plaintext : null,
  };
}

export function decipherAttempt(input: {
  fragment: AncientFragment;
  permutation: string;
  knownLetters: readonly string[];
  attempt: string;
  solved: boolean;
}): Result<DecipherSuccess, 'mismatch'> {
  const { fragment, permutation, knownLetters, attempt, solved } = input;
  for (const known of knownLetters) {
    const letter = foldPlainChar(known);
    const index = PLAIN_ALPHABET.indexOf(letter);
    if (index < 0) {
      continue;
    }
    if (attempt[index] !== permutation[index]) {
      return err('mismatch');
    }
  }
  const ciphertext = encodeAncient(fragment.plaintext, permutation);
  const decoded = decodeAncient(ciphertext, attempt);
  if (decoded !== normalizePlain(fragment.plaintext)) {
    return err('mismatch');
  }
  const value: DecipherSuccess = {
    plaintext: fragment.plaintext,
    solved: true,
    firstSolve: !solved,
  };
  return ok(value);
}
