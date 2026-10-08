import { expect, test } from 'vitest';
import { en } from './en';
import { ru } from './ru';
import { defaultSettings, normalizeSettings } from './settings';
import { pluralRu, t } from './translate';

test('t ru ui.menu.play is Играть and en is Play', () => {
  expect(t('ru', 'ui.menu.play')).toBe('Играть');
  expect(t('en', 'ui.menu.play')).toBe('Play');
});

test('menu, brand, and prototype race names', () => {
  expect(t('ru', 'ui.menu.settings')).toBe('Настройки');
  expect(t('en', 'ui.menu.settings')).toBe('Settings');
  expect(t('ru', 'ui.menu.exit')).toBe('Выход');
  expect(t('en', 'ui.menu.exit')).toBe('Exit');
  expect(t('ru', 'ui.brand')).toBe('Разлом');
  expect(t('en', 'ui.brand')).toBe('Rift');
  expect(t('ru', 'race.human')).toBe('Люди');
  expect(t('en', 'race.human')).toBe('Humans');
  expect(t('ru', 'race.demon')).toBe('Демоны');
  expect(t('en', 'race.demon')).toBe('Demons');
});

test('unknown key is returned as the key', () => {
  expect(t('ru', 'missing.key')).toBe('missing.key');
  expect(t('en', 'no.such')).toBe('no.such');
  expect(t('ru', 'toString')).toBe('toString');
  expect(t('en', 'constructor')).toBe('constructor');
});

test('{name} is substituted once and missing placeholders stay', () => {
  const catalog = { 'ui.hello': 'Привет, {name}', 'ui.score': '{name}:{count}' };
  expect(t('ru', 'ui.hello', { name: 'Ара' }, catalog)).toBe('Привет, Ара');
  expect(t('en', 'ui.hello', { name: 'Ara' }, { 'ui.hello': 'Hello, {name}' })).toBe('Hello, Ara');
  expect(t('ru', 'ui.hello', undefined, catalog)).toBe('Привет, {name}');
  expect(t('ru', 'ui.score', { name: 'Ара', count: 3 }, catalog)).toBe('Ара:3');
  expect(t('en', 'ui.icu', undefined, { 'ui.icu': '{count, plural, one {#} other {#}}' })).toBe(
    '{count, plural, one {#} other {#}}',
  );
});

test('escaped braces are not placeholders', () => {
  expect(t('ru', 'ui.literal', { name: 'Ара' }, { 'ui.literal': '\\{name\\}' })).toBe('{name}');
});

test('custom catalog does not have to repeat menu keys', () => {
  const items = { 'item.rusty_sword.name': 'Ржавый меч' };
  expect(t('ru', 'item.rusty_sword.name', undefined, items)).toBe('Ржавый меч');
  expect(t('en', 'ui.menu.play', undefined, items)).toBe('Play');
  expect(t('ru', 'item.missing.name', undefined, items)).toBe('item.missing.name');
});

test('custom catalog overrides the default key', () => {
  expect(t('ru', 'ui.menu.play', undefined, { 'ui.menu.play': 'Старт' })).toBe('Старт');
});

test('ru and en catalogs expose the same keys', () => {
  expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
});

test('plural 1/2/5/11/21 and the rest of the Russian rule', () => {
  const forms = {
    one: '{count} крыса',
    few: '{count} крысы',
    many: '{count} крыс',
    other: '{count} other',
  };
  expect(pluralRu(1, forms)).toBe('1 крыса');
  expect(pluralRu(2, forms)).toBe('2 крысы');
  expect(pluralRu(3, forms)).toBe('3 крысы');
  expect(pluralRu(4, forms)).toBe('4 крысы');
  expect(pluralRu(5, forms)).toBe('5 крыс');
  expect(pluralRu(11, forms)).toBe('11 крыс');
  expect(pluralRu(12, forms)).toBe('12 крыс');
  expect(pluralRu(14, forms)).toBe('14 крыс');
  expect(pluralRu(21, forms)).toBe('21 крыса');
  expect(pluralRu(22, forms)).toBe('22 крысы');
  expect(pluralRu(31, forms)).toBe('31 крыса');
  expect(pluralRu(111, forms)).toBe('111 крыс');
  expect(pluralRu(0, forms)).toBe('0 крыс');
  expect(pluralRu(-1, forms)).toBe('-1 крыса');
});

test('plural substitutes {count} and ignores other', () => {
  expect(pluralRu(1, { one: 'один', few: 'несколько', many: 'много', other: 'иное' })).toBe('один');
  expect(pluralRu(5, { one: '{count}', few: '{count}', many: 'много {count}' })).toBe('много 5');
});

test('fontScale 2 normalizes to 1 and valid scales stay', () => {
  expect(normalizeSettings({ fontScale: 2 as 1 }).fontScale).toBe(1);
  expect(normalizeSettings({ fontScale: 1 }).fontScale).toBe(1);
  expect(normalizeSettings({ fontScale: 1.25 }).fontScale).toBe(1.25);
  expect(normalizeSettings({ fontScale: 1.5 }).fontScale).toBe(1.5);
  expect(normalizeSettings({ fontScale: '1.25' as unknown as 1 }).fontScale).toBe(1);
});

test('locale zh normalizes to ru and en is kept', () => {
  expect(normalizeSettings({ locale: 'zh' as 'ru' }).locale).toBe('ru');
  expect(normalizeSettings({ locale: 'zh-CN' as 'ru' }).locale).toBe('ru');
  expect(normalizeSettings({ locale: 'en' }).locale).toBe('en');
  expect(normalizeSettings({}).locale).toBe('ru');
});

test('other settings fields roll back softly', () => {
  expect(normalizeSettings({})).toEqual(defaultSettings);
  expect(
    normalizeSettings({
      contrast: 'high',
      subtitles: true,
      reduceMotion: true,
      colorblind: 'deuteranopia',
      locale: 'en',
      fontScale: 1.5,
    }),
  ).toEqual({
    contrast: 'high',
    subtitles: true,
    reduceMotion: true,
    colorblind: 'deuteranopia',
    locale: 'en',
    fontScale: 1.5,
  });
  expect(
    normalizeSettings({
      contrast: 'ultra' as 'normal',
      subtitles: 'yes' as unknown as boolean,
      reduceMotion: 1 as unknown as boolean,
      colorblind: 'monochrome' as 'none',
      fontScale: 2 as 1,
      locale: 'zh' as 'ru',
    }),
  ).toEqual(defaultSettings);
  for (const mode of ['none', 'protanopia', 'deuteranopia', 'tritanopia'] as const) {
    expect(normalizeSettings({ colorblind: mode }).colorblind).toBe(mode);
  }
});
