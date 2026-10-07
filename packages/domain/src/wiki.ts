import { err, ok, type Result } from './result';

export type WikiArticleSide = 'light' | 'dark' | 'primordial';
export type WikiReaderSide = 'light' | 'dark';
export type WikiVoteValue = 1 | -1;

export interface WikiBotEntry {
  action: string;
  from: string;
  result: string;
  tags: string[];
  confidence: number;
  author: string;
}

export function readWiki(
  articleSide: WikiArticleSide,
  readerSide: WikiReaderSide,
): Result<true, 'side'> {
  if (articleSide === 'primordial' || articleSide === readerSide) {
    return ok(true);
  }
  return err('side');
}

export function writeProse(
  articleSide: WikiArticleSide,
  authorSide: WikiReaderSide,
  text: string,
): Result<{ text: string }, 'side' | 'sealed' | 'empty'> {
  const access = editAccess(articleSide, authorSide);
  if (!access.ok) {
    return err(access.code);
  }
  if (text.length < 1) {
    return err('empty');
  }
  return ok({ text });
}

export function writeBotEntry(
  articleSide: WikiArticleSide,
  authorSide: WikiReaderSide,
  entry: WikiBotEntry,
): Result<WikiBotEntry, 'side' | 'sealed' | 'shape'> {
  const access = editAccess(articleSide, authorSide);
  if (!access.ok) {
    return err(access.code);
  }
  if (!isBotEntry(entry)) {
    return err('shape');
  }
  return ok({
    action: entry.action,
    from: entry.from,
    result: entry.result,
    tags: [...entry.tags],
    confidence: entry.confidence,
    author: entry.author,
  });
}

export function vote(
  articleSide: WikiArticleSide,
  readerSide: WikiReaderSide,
  previous: number | null,
  value: WikiVoteValue,
): Result<{ ratingDelta: number; vote: WikiVoteValue }, 'side' | 'sealed'> {
  const access = editAccess(articleSide, readerSide);
  if (!access.ok) {
    return err(access.code);
  }
  return ok({
    ratingDelta: value - (previous ?? 0),
    vote: value,
  });
}

function editAccess(
  articleSide: WikiArticleSide,
  actorSide: WikiReaderSide,
): Result<true, 'side' | 'sealed'> {
  if (articleSide === 'primordial') {
    return err('sealed');
  }
  if (articleSide !== actorSide) {
    return err('side');
  }
  return ok(true);
}

function isBotEntry(entry: WikiBotEntry): boolean {
  return (
    typeof entry.action === 'string' &&
    entry.action.length > 0 &&
    typeof entry.from === 'string' &&
    entry.from.length > 0 &&
    typeof entry.result === 'string' &&
    entry.result.length > 0 &&
    typeof entry.author === 'string' &&
    entry.author.length > 0 &&
    Array.isArray(entry.tags) &&
    entry.tags.every((tag) => typeof tag === 'string') &&
    typeof entry.confidence === 'number' &&
    Number.isFinite(entry.confidence)
  );
}
