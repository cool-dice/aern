import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { createWikiService } from './service';

test('prose stays on the author side, primordial is sealed, and a vote replaces itself', () => {
  const service = createWikiService(createBus());
  const written = service.writeProse({
    articleId: 'fort',
    articleSide: 'light',
    authorId: 'lia',
    authorSide: 'light',
    text: 'The barrier is a wall.',
  });
  expect(written.ok).toBe(true);
  expect(service.read('fort')?.prose).toBe('The barrier is a wall.');

  expect(
    service.writeProse({
      articleId: 'fort',
      articleSide: 'light',
      authorId: 'ash',
      authorSide: 'dark',
      text: 'no',
    }),
  ).toEqual({ ok: false, code: 'side' });

  expect(
    service.writeProse({
      articleId: 'first',
      articleSide: 'primordial',
      authorId: 'lia',
      authorSide: 'light',
      text: 'no',
    }),
  ).toEqual({ ok: false, code: 'sealed' });

  expect(
    service.vote({
      articleId: 'fort',
      articleSide: 'light',
      readerId: 'lia',
      readerSide: 'light',
      value: 1,
    }).ok,
  ).toBe(true);
  const replaced = service.vote({
    articleId: 'fort',
    articleSide: 'light',
    readerId: 'lia',
    readerSide: 'light',
    value: -1,
  });
  expect(replaced).toEqual({ ok: true, value: { rating: -1, vote: -1 } });
});
