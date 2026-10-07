/**
 * Colorblind mode. Same string union as task 049 (`none`, `protanopia`,
 * `deuteranopia`, `tritanopia`). Defined here so i18n does not import ui.
 */
export type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export type Locale = 'ru' | 'en';

export type FontScale = 1 | 1.25 | 1.5;

export type Contrast = 'normal' | 'high';

export interface Settings {
  locale: Locale;
  fontScale: FontScale;
  contrast: Contrast;
  subtitles: boolean;
  reduceMotion: boolean;
  colorblind: ColorblindMode;
}

/** Invalid fields roll back to these values. Normalization does not throw. */
export const defaultSettings: Settings = {
  locale: 'ru',
  fontScale: 1,
  contrast: 'normal',
  subtitles: false,
  reduceMotion: false,
  colorblind: 'none',
};

const COLORBLIND_MODES: readonly ColorblindMode[] = [
  'none',
  'protanopia',
  'deuteranopia',
  'tritanopia',
];

function isFontScale(value: unknown): value is FontScale {
  return value === 1 || value === 1.25 || value === 1.5;
}

function isContrast(value: unknown): value is Contrast {
  return value === 'normal' || value === 'high';
}

function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'en';
}

function isColorblindMode(value: unknown): value is ColorblindMode {
  return COLORBLIND_MODES.some((mode) => mode === value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Soft settings normalize. Out-of-range font scale, unknown contrast,
 * unknown colorblind mode, non-boolean toggles, and locales other than
 * ru/en (including `zh`) fall back to {@link defaultSettings}.
 */
export function normalizeSettings(input: Partial<Settings>): Settings {
  const raw = input as {
    locale?: unknown;
    fontScale?: unknown;
    contrast?: unknown;
    subtitles?: unknown;
    reduceMotion?: unknown;
    colorblind?: unknown;
  };

  return {
    locale: isLocale(raw.locale) ? raw.locale : defaultSettings.locale,
    fontScale: isFontScale(raw.fontScale) ? raw.fontScale : defaultSettings.fontScale,
    contrast: isContrast(raw.contrast) ? raw.contrast : defaultSettings.contrast,
    subtitles: isBoolean(raw.subtitles) ? raw.subtitles : defaultSettings.subtitles,
    reduceMotion: isBoolean(raw.reduceMotion) ? raw.reduceMotion : defaultSettings.reduceMotion,
    colorblind: isColorblindMode(raw.colorblind) ? raw.colorblind : defaultSettings.colorblind,
  };
}
