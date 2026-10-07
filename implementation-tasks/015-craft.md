# Крафт, навыки и разбор

- id: `015`
- title: Крафт, навыки и разбор
- status: `pending`
- depends_on: `002`, `007`, `018`

## Цель

Проверить рецепт, списать материалы, бросить грейд, начислить опыт навыка и посчитать разбор.

## Контекст

Артефакт 10. Пять веток: `weaponsmith`, `armorer`, `biotech`, `mechanic`, `alchemist`. Уровень навыка 1..10. Открытие 1: 500 золота и учитель. Уровни 2–9: опыт крафта. Уровень 10: 5000 золота и учитель, опыт тоже должен быть набран.

Опыт за результат: common 1, rare 3, epic 10, unique 50.

Пороги опыта на следующий уровень (опыт внутри уровня, не суммарный):

| Уровень | До следующего |
|---|---|
| 1 | 10 |
| 2 | 25 |
| 3 | 50 |
| 4 | 100 |
| 5 | 200 |
| 6 | 350 |
| 7 | 550 |
| 8 | 800 |
| 9 | 1100 |

Шансы грейда, проценты, сумма 100:

| Навык | common | rare | epic | unique |
|---|---|---|---|---|
| 1 | 70 | 20 | 8 | 2 |
| 2 | 65 | 22 | 10 | 3 |
| 3 | 60 | 24 | 12 | 4 |
| 4 | 55 | 25 | 14 | 6 |
| 5 | 50 | 25 | 16 | 9 |
| 6 | 45 | 25 | 18 | 12 |
| 7 | 40 | 24 | 20 | 16 |
| 8 | 35 | 23 | 22 | 20 |
| 9 | 30 | 22 | 24 | 24 |
| 10 | 25 | 20 | 25 | 30 |

Максимальный уровень предмета = навык × 5.

Уникальный бросок без уникального компонента в рецепте становится epic, компонент не требуется и не тратится. Если компонент в рецепте есть и бросок unique — компонент тратится. Если бросок не unique — компонент не тратится.

Качество материалов: `normal` без сдвига. `cleaned`: −5 п.п. с common (не ниже 0), +5 к rare. `pure`: −10 с common (не ниже 0), +5 rare, +5 epic. Unique-колонка не растёт от качества. После сдвига нормализовать не нужно, сумма может быть 100, если снимали с common достаточно. Если common меньше снимаемого, снять сколько есть, добавку сделать полной (сумма может превысить 100 — тогда бросок `nextInt(10000)` сравнивать с накопленными порогами, масштабированными на сумму весов). Проще: работать в базисных пунктах из 10000 (процент × 100).

Время крафта, если рецепт не задал своё: расходники и патроны 5 минут, common 10, rare 30, epic 60, unique 120. Реликтовый рецепт без явного времени: 90 минут, уникальный реликт 120. Ускорение: доплата 50% стоимости материалов золотом (стоимость считает задача 018 функцией `materialGold`, здесь её вызвать) делит оставшееся время на 2 один раз. Второй раз нельзя.

Разбор: 30% каждого материала, округление вниз, минимум 0. Уникальные не разбираются. Время разбора 10% времени крафта, минимум 1 минута. Только город или хаб, не бой.

Не крафтятся: отголоски, пути, ресурс `relic_shard` как выход рецепта. Если рецепт помечен `forbidden`, отказ.

УПЯ языка рецепта < 60 → отказ. Язык передаётся числом.

Станция должна совпадать: weaponsmith `forge`, armorer `bench`, biotech `lab`, mechanic `workshop`, alchemist `alchemy`.

Прототип включает только 8 рецептов флагом на рецепте; домен крафтит любой разрешённый рецепт. Фильтр UI — задача `049`.

## Решение противоречий

Времена крафта назначены здесь (обзор, пункт 25). Восемь рецептов прототипа не сужают таблицу шансов.

Зависимость от `018`: импортировать только `materialGold(materials) : number`. Если цикл импорта мешает, продублировать вызов через аргумент `materialCostGold: number`, который передаёт сервис, и не импортировать economy. Так и сделать: аргумент, без импорта `economy.ts`. Зависимость задачи от 018 остаётся, потому что смысл 50% определён там, но файл craft.ts не импортирует economy.ts. Оркестратору: файлы не пересекаются, зависимость логическая.

## Файлы

- `packages/domain/src/craft.ts`
- `packages/domain/src/craft.test.ts`

## Интерфейсы

```ts
export type CraftSkill = 'weaponsmith' | 'armorer' | 'biotech' | 'mechanic' | 'alchemist';
export type StationId = 'forge' | 'bench' | 'lab' | 'workshop' | 'alchemy';

export interface SkillState { level: 1|2|3|4|5|6|7|8|9|10; xp: number }

export function gradeWeights(level: number, quality: 'normal' | 'cleaned' | 'pure'): Record<GradeId, number>;
export function rollGrade(weights: Record<GradeId, number>, rng: Rng): GradeId;
export function craftDurationMs(grade: GradeId, kind: 'item' | 'consumable' | 'relic'): number;
export function maxItemLevel(skillLevel: number): number;

export function startCraft(input: {
  skill: SkillState;
  station: StationId;
  recipeSkill: CraftSkill;
  recipeStation: StationId;
  languageUpy: number;
  inCityOrHub: boolean;
  inCombat: boolean;
  requestedItemLevel: number;
  materials: Record<string, number>;
  need: Record<string, number>;
  uniqueComponent: boolean;
  hasUniqueComponent: boolean;
  forbidden: boolean;
  materialCostGold: number;
  gold: number;
  accelerate: boolean;
  alreadyAccelerated: boolean;
  rng: Rng;
  nowMs: number;
}): Result<{
  skill: SkillState;
  grade: GradeId;
  itemLevel: number;
  materials: Record<string, number>;
  gold: number;
  readyAtMs: number;
  accelerated: boolean;
}, 'zone' | 'combat' | 'station' | 'language' | 'level' | 'materials' | 'forbidden' | 'gold' | 'accelerate'>;

export function salvage(input: {
  grade: GradeId;
  need: Record<string, number>;
  craftMs: number;
  inCityOrHub: boolean;
}): Result<{ materials: Record<string, number>; durationMs: number }, 'unique' | 'zone'>;

export function trainSkill(skill: SkillState, grade: GradeId): SkillState;
export function buySkillLevel(skill: SkillState, gold: number, teacher: boolean, target: 1 | 10):
  Result<{ skill: SkillState; gold: number }, 'gold' | 'teacher' | 'xp' | 'level'>;
```

## Алгоритм

- `rollGrade`: накопить веса в порядке common, rare, epic, unique. `roll = rng.nextInt(sum)`. Попасть в корзину.
- Уникальный результат без компонента заменяется на epic до возврата.
- Материалы списываются все из `need`, кроме уникального компонента, если итог не unique.
- Уровень предмета выше `maxItemLevel` или вне вилки рецепта — вилку передаёт вызывающий уже проверенной? Нет, аргументы `requestedItemLevel` и проверка `1..maxItemLevel(skill.level)`. Вилка рецепта: дополнительные поля `recipeMin` и `recipeMax`. Добавить их. Вне вилки → `level`.
- `trainSkill` прибавляет опыт и поднимает уровень, пока хватает порога и уровень < 10. На 9 уровне опыт копится до 1100, но уровень 10 не берётся опытом: остановиться на 9 с xp, излишек сохранить, `buySkillLevel` потребует xp ≥ 1100, учителя и 5000 золота, затем level 10 и xp 0.
- Открытие: skill отсутствует. Модель: level 1 xp 0 стоит 500 и учителя. Функция `buySkillLevel` при target 1 из специального пустого состояния. Добавить `SkillState | null`. null + target 1 → level 1. target 10 с level 9 и достаточным xp.

## Тесты

- веса навыка 1 normal: 70/20/8/2. cleaned: 65/25/8/2. pure: 60/25/13/2.
- навык 10 pure: common 15, rare 25, epic 30, unique 30.
- seed, который попадает в последнюю корзину 2% навыка 1, даёт unique. Без компонента результат epic.
- уровень предмета 6 при навыке 1 → ошибка (макс 5).
- УПЯ 59 → `language`. Не та станция → `station`. Бой → `combat`.
- ускорение списывает `floor(materialCostGold * 0.5)` дополнительно и делит время common 10 мин пополам. Повтор → `accelerate`.
- разбор unique → ошибка. Разбор need `{metal: 5}` → `{metal: 1}` потому что floor(1.5) = 1. Время 10% от 600_000 мс = 60_000, что больше 60_000 минимума.
- опыт common копит 1. Десять обычных крафтов с уровня 1 поднимают на 2 и xp 0.
- покупка 10 без учителя → ошибка, золото не списано.

## Definition of done

Таблица шансов всех 10 уровней покрыта тестом снимком весов normal.

## Зона правок

`packages/domain/src/craft.ts` и тест. Не импортировать `economy.ts`.
