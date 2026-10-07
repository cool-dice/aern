export const MUTE_1H_MS = 3_600_000;
export const CHAT_BAN_MS = 7 * 86_400_000;

export type Sanction =
  | 'none'
  | 'mute_1h'
  | 'mute_24h'
  | 'chat_ban_7d'
  | 'account_ban_7d'
  | 'permanent';

const SPAM_WINDOW_MS = 10_000;
const IDENTICAL_SPAM_COUNT = 5;
const ANY_SPAM_COUNT = 8;
const CAPS_MIN_LENGTH = 8;
const AUTOMUTES_BEFORE_CHAT_BAN = 2;
const CHEAT_STRIKES_FOR_BAN = 3;

export function classifyMessage(input: {
  text: string;
  recentTexts: string[];
  recentMs: number[];
  nowMs: number;
  blacklist: string[];
  automutesIn24h: number;
}): Sanction {
  const punishable =
    isSpam(input.text, input.recentTexts, input.recentMs, input.nowMs) ||
    isCaps(input.text) ||
    hitsBlacklist(input.text, input.blacklist);
  if (!punishable) {
    return 'none';
  }
  if (input.automutesIn24h >= AUTOMUTES_BEFORE_CHAT_BAN) {
    return 'chat_ban_7d';
  }
  return 'mute_1h';
}

export function sanctionForCheatStrikes(strikesIn24h: number, repeatOffender: boolean): Sanction {
  if (!(strikesIn24h >= CHEAT_STRIKES_FOR_BAN)) {
    return 'none';
  }
  if (repeatOffender) {
    return 'permanent';
  }
  return 'account_ban_7d';
}

export function falseReportSanction(): Sanction {
  return 'mute_24h';
}

function isSpam(
  text: string,
  recentTexts: readonly string[],
  recentMs: readonly number[],
  nowMs: number,
): boolean {
  const recent = textsInWindow(recentTexts, recentMs, nowMs);
  const normalized = text.trim();
  let identical = 1;
  for (const prior of recent) {
    if (prior.trim() === normalized) {
      identical += 1;
    }
  }
  return identical >= IDENTICAL_SPAM_COUNT || recent.length + 1 >= ANY_SPAM_COUNT;
}

function textsInWindow(
  recentTexts: readonly string[],
  recentMs: readonly number[],
  nowMs: number,
): string[] {
  const limit = Math.min(recentTexts.length, recentMs.length);
  const inWindow: string[] = [];
  for (let index = 0; index < limit; index += 1) {
    const prior = recentTexts[index];
    const sentMs = recentMs[index];
    if (prior === undefined || sentMs === undefined) {
      continue;
    }
    const ageMs = nowMs - sentMs;
    if (ageMs >= 0 && ageMs <= SPAM_WINDOW_MS) {
      inWindow.push(prior);
    }
  }
  return inWindow;
}

function isCaps(text: string): boolean {
  if (text.length < CAPS_MIN_LENGTH) {
    return false;
  }
  let letters = 0;
  let upper = 0;
  for (const char of text) {
    if (char.toLowerCase() === char.toUpperCase()) {
      continue;
    }
    letters += 1;
    if (char === char.toUpperCase()) {
      upper += 1;
    }
  }
  if (letters === 0) {
    return false;
  }
  return upper * 10 > letters * 7;
}

function hitsBlacklist(text: string, blacklist: readonly string[]): boolean {
  const banned = new Set<string>();
  for (const entry of blacklist) {
    const word = entry.trim().toLowerCase();
    if (word.length > 0) {
      banned.add(word);
    }
  }
  if (banned.size === 0) {
    return false;
  }
  for (const token of text.split(' ')) {
    if (token.length > 0 && banned.has(token.toLowerCase())) {
      return true;
    }
  }
  return false;
}
