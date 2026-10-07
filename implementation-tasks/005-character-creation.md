# Расы и создание персонажа

- id: `005`
- title: Расы и создание персонажа
- status: `done`
- depends_on: `002`, `004`

## Цель

Собрать черновик персонажа: раса, контроллер, очки, чистота, внешность, стартовые языки. Без записи в БД.

## Контекст

Артефакты 2 и 14. Все расы имеют сумму модификаторов +6. Люди и демоны: +1 ко всем. Остальные: два +2, один +3, один −2, один +1, один 0.

| Раса | id | Сторона | body | reaction | accuracy | will | perception | technique |
|---|---|---|---|---|---|---|---|---|
| Люди | `human` | light | +1 | +1 | +1 | +1 | +1 | +1 |
| Демоны | `demon` | dark | +1 | +1 | +1 | +1 | +1 | +1 |
| Эльфы | `elf` | light | −2 | +3 | +1 | +2 | +2 | 0 |
| Тёмные эльфы | `dark_elf` | dark | +2 | +3 | +1 | −2 | +2 | 0 |
| Дварфы | `dwarf` | light | +3 | −2 | 0 | +1 | +2 | +2 |
| Гоблины | `goblin` | dark | −2 | +2 | +1 | 0 | +2 | +3 |
| Тролли | `troll` | light | +3 | +1 | −2 | +2 | 0 | +2 |
| Огры | `ogre` | dark | +3 | −2 | 0 | +2 | +1 | +2 |

Сторона персонажа = `player → light`, `bot → dark`. Создать расу чужой стороны нельзя. Внешность косметическая и не влияет на статы. Имя — отдельная проверка.

Чистый выбирается при создании. Кап 25. Стартовый язык: светлые — `common_light` УПЯ 100, `common_dark` 0, `ancient` 0. Тёмные — зеркально.

Стартовые предметы выдаёт сервис инвентаря (задача `032`), не эта функция. Здесь только статы и языки.

Пример 1 артефакта 14. Люди, очки body 10, reaction 5, accuracy 5, остальные 0. После +1: body 16, reaction 11, accuracy 11, will 6, perception 6, technique 6.

Пример 2. Дварф, очки body 10, technique 5, will 5. Итог: body 18, reaction 3, accuracy 5, will 11, perception 7, technique 12.

## Решение противоречий

Бонусы рас из `docs/gdd.v1.md` не использовать. Лимит 10 — очки, не итог стата (обзор, пункт 7). В прототипе создаются только `human` для игрока и `demon` для бота; фильтр `playable` применяет сервис по каталогу, а эта функция принимает любую из 8 рас, если сторона совпала. Так тесты покрывают таблицу целиком.

## Файлы

- `packages/domain/src/character.ts`
- `packages/domain/src/character.test.ts`

## Интерфейсы

```ts
export type Controller = 'player' | 'bot';
export type SideId = 'light' | 'dark';
export type RaceId = 'human' | 'demon' | 'elf' | 'dark_elf' | 'dwarf' | 'goblin' | 'troll' | 'ogre';

export interface RaceDef {
  id: RaceId;
  side: SideId;
  modifiers: StatBlock;
}

export const RACES: readonly RaceDef[];

export interface Appearance {
  skin: string;
  hair: string;
  eyes: string;
  horns: boolean;
  ears: string;
  tattoos: string;
  scars: string;
  heightCm: number;
  build: string;
}

export interface CharacterDraft {
  raceId: RaceId;
  controller: Controller;
  side: SideId;
  clean: boolean;
  name: string;
  appearance: Appearance;
  points: StatBlock;
  unspent: number;
  stats: StatBlock;
  languages: Record<'common_light' | 'common_dark' | 'ancient', number>;
  level: 1;
  experience: 0;
}

export type CreateError =
  | 'name'
  | 'race_side'
  | 'points_total'
  | 'points_stat'
  | 'points_negative'
  | 'appearance';

export function sideOf(controller: Controller): SideId;
export function createCharacter(input: {
  raceId: RaceId;
  controller: Controller;
  clean: boolean;
  name: string;
  appearance: Appearance;
  points: StatBlock;
}): Result<CharacterDraft, CreateError>;

export function finalStat(pointsInStat: number, racial: number, clean: boolean): number;
```

`finalStat` = `min(clean ? 25 : 20, 5 + pointsInStat + racial)`.

Имя: длина 3–16 символов Unicode-букв, цифр и пробела, без пробелов по краям, без двух пробелов подряд. Регистр сохраняется. Уникальность имени — забота репозитория, не этой функции.

Рост `heightCm` от 120 до 250 включительно. Остальные поля внешности — непустые строки до 32 символов. `horns` свободный boolean.

## Алгоритм

1. `sideOf(controller)` сравнивается с `race.side`. Иначе `race_side`.
2. Сумма очков должна быть ровно 20. Иначе `points_total`.
3. Каждое значение очков — целое 0..10. Иначе `points_stat` или `points_negative`.
4. Итог стата через `finalStat`.
5. Языки как в контексте.
6. `unspent` при создании 0, потому что сумма ровно 20. Позже уровень даёт новые очки (задача `014`).

## Тесты

- оба примера из контекста.
- сумма модификаторов каждой расы равна 6.
- игрок + `demon` → `race_side`. Бот + `human` → `race_side`. Бот + `goblin` успешен.
- 21 очко и 19 очков отвергаются. 11 очков в один стат отвергаются.
- чистый человек с body-очками 10 получает итог `min(25, 16) = 16`, кап не мешает. Смоделировать стат `5+10+12` через `finalStat(10, 12, false)` → 20 и `finalStat(10, 12, true)` → 25.
- имя `Ab` и `  Имя` отвергаются. `Лиа` принимается.
- языки светлого: 100 / 0 / 0.

## Definition of done

Таблица восьми рас зашита константой `RACES`, не читается из JSON. Каталог контента может дублировать её для сервера, но домен не зависит от JSON.

## Зона правок

`packages/domain/src/character.ts` и тест.
