# Языки и УПЯ

- id: `006`
- title: Языки и УПЯ
- status: `pending`
- depends_on: `002`

## Цель

Считать понимание языка, искажение текста и прибавку УПЯ от учёбы, книги, руин и пассивного соседства.

## Контекст

`docs/gdd.v2/Артефакт 3. Языки и УПЯ.md`.

Языки: `common_light`, `common_dark`, `ancient`. УПЯ 0..100 на каждый.

Шкала отображения, доля заменяемых символов:

| УПЯ | Доля замены |
|---|---|
| 0–10 | 0.90 |
| 11–30 | 0.60 |
| 31–60 | 0.30 |
| 61–85 | 0.10 |
| 86–100 | 0 |

Прирост:

| Метод | Прирост | Условие |
|---|---|---|
| Пассивно | +1 | 2 часа онлайн рядом с носителем |
| Сделка или квест | +2 | успешное взаимодействие |
| Учитель | +5 | 1 час, 100 золота, не выше 80, 1 раз в реальные сутки на язык |
| Книга | +3 | 10 минут чтения, книга исчезает, язык книги должен совпадать |
| Руины, успех | +10 | мини-игра, 3 попытки, одноразово |
| Руины, провал | +1 | |

Крафт по рецепту на языке доступен при УПЯ ≥ 60. Квест NPC: УПЯ 0–30 — отказ (`quest_language`), 31–60 — квест доступен с флагом `garbled`, 61–100 — полный текст.

Чат: УПЯ слушателя к языку отправителя 0 — исходный текст без подстановки перевода. УПЯ 100 — вызывающий код подставляет уже переведённую строку, эта функция только помечает `mode: 'translated'`. Промежуточные значения искажают исходный текст. Гильдейский и групповой каналы язык не проверяют; это решает задача `022`, передавая `bypass: true`.

Цифры и пробелы не заменяются. Заменяется каждый другой символ с вероятностью доли, детерминированно от ГПСЧ. Символ замены — `?`.

## Решение противоречий

Границы шкалы v1 (0–30, 30–60, 60–85, 85–100) проигрывают таблице артефакта 3 с порогами 10/30/60/85. Граница включается в нижний диапазон: УПЯ 10 → 90%, УПЯ 11 → 60%, УПЯ 30 → 60%, УПЯ 31 → 30%, УПЯ 60 → 30%, УПЯ 61 → 10%, УПЯ 85 → 10%, УПЯ 86 → 0%, УПЯ 100 → режим перевода, замен 0.

Пассивные 2 часа и час учителя — онлайн-время персонажа (артефакт 7), параметр `onlineMs`, не настенные часы.

## Файлы

- `packages/domain/src/language.ts`
- `packages/domain/src/language.test.ts`

## Интерфейсы

```ts
export type LanguageId = 'common_light' | 'common_dark' | 'ancient';

export interface UpyState {
  values: Record<LanguageId, number>;
  lastLessonMs: Partial<Record<LanguageId, number>>;
}

export type UpyGain = 'passive' | 'interaction' | 'teacher' | 'book' | 'ruins_success' | 'ruins_fail';

export function clampUpy(value: number): number;
export function replacementRate(upy: number): number;
export function garble(text: string, upy: number, rng: Rng): string;
export function chatPresentation(
  text: string,
  listenerUpy: number,
  translated: string,
  rng: Rng,
): { mode: 'raw' | 'garbled' | 'translated'; text: string };

export function canCraftLanguage(upy: number): boolean;
export function questLanguageAccess(upy: number): 'deny' | 'garbled' | 'full';

export function gainUpy(input: {
  state: UpyState;
  language: LanguageId;
  gain: UpyGain;
  nowMs: number;
  onlineMsSinceLastPassive: number;
  gold: number;
}): Result<{ state: UpyState; gold: number; consumedBook: boolean }, 'cap' | 'gold' | 'cooldown' | 'not_ready'>;
```

## Алгоритм

- Потолок всегда 100. Учитель не поднимает выше 80: если текущее ≥ 80, ошибка `cap`. Если 78, прирост +2 до 80, не +5.
- Учитель списывает 100 золота. Не хватает — `gold`, состояние не меняется.
- Кулдаун учителя: `lastLessonMs` того же языка ближе 24 часов (`86_400_000` мс) — `cooldown`.
- Пассив: если `onlineMsSinceLastPassive < 7_200_000` — `not_ready`. Иначе +1 и вызывающий код сам обнуляет счётчик; функция не хранит остаток, при успехе ожидает, что счётчик сбросит сервис.
- Книга: +3, `consumedBook: true`. Остальные методы `consumedBook: false`.
- `garble` при доле 0 возвращает исходную строку и не трогает rng. При доле > 0 для каждого заменяемого символа берёт `rng.nextUnit() < rate`.
- УПЯ 100 в `chatPresentation` игнорирует `text` и возвращает `translated` с `mode: 'translated'`. УПЯ 0 возвращает `text` и `mode: 'raw'` без замен (артефакт 3: «сообщение выводится на языке отправителя»). УПЯ 1..99 — `garble`.

## Тесты

- пороги 0, 10, 11, 30, 31, 60, 61, 85, 86, 100 дают доли 0.9, 0.9, 0.6, 0.6, 0.3, 0.3, 0.1, 0.1, 0, 0.
- `garble('Ab 1', 0, seed)` заменяет буквы и не заменяет пробел и цифру; повтор того же seed даёт ту же строку.
- УПЯ 100 не вызывает замену: передать rng, который бросает при `nextUnit`, и убедиться, что перевода достаточно.
- учитель с 100 золота поднимает 0 → 5 и ставит `lastLessonMs`. Повтор сразу → `cooldown`. Золото 99 → `gold` и значение не меняется.
- учитель при 78 → 80. При 80 → `cap`.
- книга 97 → 100.
- `canCraftLanguage(59)` false, `60` true.
- `questLanguageAccess(30)` → `deny`, `31` → `garbled`, `61` → `full`.

## Definition of done

Искажение детерминировано. Золото и кулдаун не меняют состояние при ошибке.

## Зона правок

`packages/domain/src/language.ts` и тест.
