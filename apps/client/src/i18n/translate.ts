import { en } from './en';
import { ru } from './ru';
import type { Locale } from './settings';

export type { Locale };

const defaultCatalogs: Record<Locale, Record<string, string>> = { ru, en };

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const ESCAPED_OPEN = '\u0000{';
const ESCAPED_CLOSE = '\u0000}';

/**
 * Replaces `{name}` placeholders. One pass, so values are not expanded again
 * and ICU fragments such as `{count, plural, ...}` stay literal.
 * `\{` and `\}` are escaped braces.
 */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  const masked = template.replace(/\\\{/g, ESCAPED_OPEN).replace(/\\\}/g, ESCAPED_CLOSE);
  const filled = masked.replace(PLACEHOLDER, (match, name: string) => {
    if (vars !== undefined && Object.prototype.hasOwnProperty.call(vars, name)) {
      const value = vars[name];
      if (value !== undefined) return String(value);
    }
    return match;
  });
  return filled.replaceAll(ESCAPED_OPEN, '{').replaceAll(ESCAPED_CLOSE, '}');
}

function defaultCatalog(locale: Locale): Record<string, string> | undefined {
  if (locale === 'ru') return defaultCatalogs.ru;
  if (locale === 'en') return defaultCatalogs.en;
  return undefined;
}

function ownString(
  catalog: Readonly<Record<string, string>> | undefined,
  key: string,
): string | undefined {
  if (catalog === undefined || !Object.prototype.hasOwnProperty.call(catalog, key))
    return undefined;
  const value = catalog[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Looks up `key` in `catalog` when given, then in the locale default
 * (menu and races). A missing key is returned unchanged.
 */
export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
  catalog?: Readonly<Record<string, string>>,
): string {
  const custom = ownString(catalog, key);
  const template = custom !== undefined ? custom : ownString(defaultCatalog(locale), key);
  if (template === undefined) return key;
  return interpolate(template, vars);
}

/**
 * Russian plural category. `other` is accepted on the forms object and ignored.
 * Absolute value keeps the same bucket for negative counts; the rule itself is
 * n % 10 == 1 and n % 100 != 11 → one; n % 10 in 2..4 and n % 100 not in 12..14 → few;
 * otherwise many.
 */
function ruPluralCategory(n: number): 'one' | 'few' | 'many' {
  const value = Math.abs(n);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}

export function pluralRu(
  n: number,
  forms: { one: string; few: string; many: string; other?: string },
): string {
  const category = ruPluralCategory(n);
  return interpolate(forms[category], { count: n });
}
