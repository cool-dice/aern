import { HACK_ALPHABET } from './models';

const ALPHABET = new Set<string>(HACK_ALPHABET);

/** 4×4 Keeper grid. Hint symbols that belong to A–H lead each row; the rest fill in order. */
export function hackGrid(passwordHint: string): string[][] {
  const hinted = [...passwordHint].filter((symbol) => ALPHABET.has(symbol));
  const cells: string[] = [];
  for (let index = 0; index < 16; index += 1) {
    const hintedSymbol = hinted[index];
    const fallback = HACK_ALPHABET[index % HACK_ALPHABET.length] ?? 'A';
    cells.push(hintedSymbol ?? fallback);
  }
  return [0, 1, 2, 3].map((row) => cells.slice(row * 4, row * 4 + 4));
}
