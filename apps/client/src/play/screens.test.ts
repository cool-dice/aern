import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { createAudioBus, createMemorySink } from '../audio/bus';
import { applyLocale, noteDamage, PlayPanels } from './screens';
import { createPlaySession, enterWorld, pressKey } from './session';

test('inventory, chat, settings, and damage tones use the store', () => {
  const session = createPlaySession();
  enterWorld(session, 'lia');
  pressKey(session, 'KeyI');
  const inventory = renderToStaticMarkup(createElement(PlayPanels, { session }));
  expect(inventory).toContain('data-item="rusty_sword"');

  session.chatDraft = 'on the square';
  pressKey(session, 'Enter');
  expect(session.store.getState().log).toEqual(['on the square']);
  const chat = renderToStaticMarkup(createElement(PlayPanels, { session }));
  expect(chat).toContain('on the square');

  expect(applyLocale(session, 'en').locale).toBe('en');
  expect(session.locale).toBe('en');
  expect(applyLocale(session, 'zh').locale).toBe('ru');

  const sink = createMemorySink();
  const bus = createAudioBus(sink);
  const tone = noteDamage(bus);
  expect(tone.frequency).toBe(220);
  expect(sink.calls().some((call) => call.clipId === 'tone:damage')).toBe(true);
});

test('hack and trade open from the number keys', () => {
  const session = createPlaySession();
  enterWorld(session, 'lia');
  pressKey(session, 'Digit1');
  const hack = renderToStaticMarkup(createElement(PlayPanels, { session }));
  expect(hack.match(/data-cell=/g)?.length).toBe(16);
  expect(hack).toContain('data-password="4"');
  pressKey(session, 'Digit2');
  const trade = renderToStaticMarkup(createElement(PlayPanels, { session }));
  expect(trade).toContain('data-auction="live"');
  expect(trade).toContain('data-trade="accept"');

  pressKey(session, 'KeyC');
  const craft = renderToStaticMarkup(createElement(PlayPanels, { session }));
  expect(craft).toContain('data-craft="start"');
});
