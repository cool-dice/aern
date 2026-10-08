import {
  vote,
  writeBotEntry,
  writeProse,
  type WikiArticleSide,
  type WikiBotEntry,
  type WikiReaderSide,
  type WikiVoteValue,
} from '@rift/domain/wiki';
import { err, ok, type Result } from '@rift/domain/result';
import type { Bus } from '../../shared/bus';

interface Article {
  id: string;
  side: WikiArticleSide;
  prose: string;
  votes: Map<string, WikiVoteValue>;
}

export interface WikiService {
  writeProse(input: {
    articleId: string;
    articleSide: WikiArticleSide;
    authorId: string;
    authorSide: WikiReaderSide;
    text: string;
  }): Result<{ text: string }, string>;
  writeBot(input: {
    articleId: string;
    articleSide: WikiArticleSide;
    authorSide: WikiReaderSide;
    entry: WikiBotEntry;
  }): Result<WikiBotEntry, string>;
  vote(input: {
    articleId: string;
    articleSide: WikiArticleSide;
    readerId: string;
    readerSide: WikiReaderSide;
    value: WikiVoteValue;
  }): Result<{ rating: number; vote: WikiVoteValue }, string>;
  read(articleId: string): { prose: string; rating: number } | null;
}

export function createWikiService(bus: Bus): WikiService {
  const articles = new Map<string, Article>();

  function article(id: string, side: WikiArticleSide): Article {
    const found = articles.get(id);
    if (found !== undefined) {
      return found;
    }
    const created: Article = { id, side, prose: '', votes: new Map() };
    articles.set(id, created);
    return created;
  }

  return {
    writeProse(input) {
      const written = writeProse(input.articleSide, input.authorSide, input.text);
      if (!written.ok) {
        return err(written.code);
      }
      const row = article(input.articleId, input.articleSide);
      row.prose = written.value.text;
      bus.emit('wiki.written', { articleId: input.articleId, authorId: input.authorId });
      return ok({ text: row.prose });
    },
    writeBot(input) {
      const written = writeBotEntry(input.articleSide, input.authorSide, input.entry);
      if (!written.ok) {
        return err(written.code);
      }
      return ok(written.value);
    },
    vote(input) {
      const row = article(input.articleId, input.articleSide);
      const previous = row.votes.get(input.readerId) ?? null;
      const cast = vote(input.articleSide, input.readerSide, previous, input.value);
      if (!cast.ok) {
        return err(cast.code);
      }
      row.votes.set(input.readerId, cast.value.vote);
      let rating = 0;
      for (const value of row.votes.values()) {
        rating += value;
      }
      return ok({ rating, vote: cast.value.vote });
    },
    read(articleId) {
      const row = articles.get(articleId);
      if (row === undefined) {
        return null;
      }
      let rating = 0;
      for (const value of row.votes.values()) {
        rating += value;
      }
      return { prose: row.prose, rating };
    },
  };
}
