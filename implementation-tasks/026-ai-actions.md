# Вектор восприятия и пространство действий

- id: `026`
- title: Вектор восприятия и пространство действий
- status: `pending`
- depends_on: `002`, `004`

## Цель

Собрать вектор длины 896 и перечень 64 действий, плюс детерминированный utility-фолбэк без нейросети.

## Контекст

Артефакт 22.

Блоки: self 64, space 128 (8×8), actors 256 (16×16 чисел), objects 128 (16×8), events 64, quests 64, economy 32, guild 32, memory 128. Сумма 896.

Кодирование относительно бота. Клетка сетки: 2 числа (тип клетки 0..1 нормализованный id, занятость 0..1). 8×8×2 = 128. Существо: 16 чисел — тип, hp/max, дистанция/20 обрезка до 1, враждебность 0/0.5/1, ещё 12 нулей. 16 существ. Объект: 8 чисел, 16 объектов. Остальные блоки: вызывающий передаёт уже обрезанные массивы нужной длины, функция проверяет длину и подставляет нули если короче, обрезает если длиннее.

Действия ровно 64 id в фиксированном порядке:

- движение: step_n, step_ne, step_e, step_se, step_s, step_sw, step_w, step_nw (8)
- бег: run_n … run_nw (8)
- wait (1)
- бой: attack_melee, attack_ranged, aim, ability_1, ability_2, ability_3, dodge (7)
- взаимодействие: take, drop, use, open, hack, talk (6)
- инвентарь: swap_weapon, swap_armor, use_item, discard (4)
- крафт: station, recipe, craft_start, craft_boost (4)
- торговля: auction_open, auction_list, auction_buy, auction_sell, trade (5)
- квесты: quest_accept, quest_abandon, quest_turnin (3)
- гильдия: guild_join, guild_leave, guild_create, guild_invite, guild_vote, guild_war (6)
- социальное: chat, mail, title (3)
- системное: bind, portal, rest, sleep (4)

Сумма 8+8+1+7+6+4+4+5+3+6+3+4 = 59. Не хватает 5. Добавить: `reload`, `crawl`, `party_invite`, `loot_corpse`, `scan`. Итого 64. Порядок константы `ACTION_IDS` — закон для сайдкара.

Utility: если hp/max < 0.3 и есть `use_item` в допустимых — выбрать его. Иначе если враг ближе 2 клеток и ОД ≥ 1 — `attack_melee`. Иначе если враг в радиусе оружия — `attack_ranged`. Иначе шаг в сторону ближайшего квестового объекта или на север `step_n`, если целей нет. Функция получает список допустимых id и не возвращает недопустимый. Если список пуст — `wait`, даже если его нет в списке? Нет: вернуть первый элемент списка. Если список пуст — ошибка `none`.

Память: лимит 10_000 записей на бота — константа `MEMORY_CAP`. Рабочая память 10 событий — константа `WORKING_MEMORY`. Вектор памяти на входе уже посчитан сервером (нули в тестах).

## Решение противоречий

Таблица артефакта 22 не даёт ровно 64 имён. Пять добавленных id зафиксированы здесь и в сайдкаре. Менять порядок нельзя.

## Файлы

- `packages/domain/src/ai.ts`
- `packages/domain/src/ai.test.ts`

## Интерфейсы

```ts
export const ACTION_IDS: readonly string[]; // length 64
export function encodeObservation(partial: {
  self: number[];
  grid: number[];
  actors: number[];
  objects: number[];
  events: number[];
  quests: number[];
  economy: number[];
  guild: number[];
  memory: number[];
}): number[];

export function utilityAction(input: {
  legal: string[];
  hp: number;
  maxHp: number;
  od: number;
  nearestEnemy: number | null;
  weaponRange: number;
}): Result<string, 'none'>;
```

## Алгоритм

- Длина результата ровно 896. Значения вне 0..1 клипать, кроме случаев, где кодировщик ещё не нормализовал: клипать всё в [0, 1].
- NaN заменять на 0.
- `ACTION_IDS[i]` стабилен. Тест сверяет длину и уникальность и несколько якорей: индекс 0 `step_n`, индекс 16 `wait`, последний `scan`.

## Тесты

- сумма блоков 896, пустые массивы дают нулевой вектор длины 896.
- лишний элемент отрезается, клип 2 → 1, клип −1 → 0.
- utility при hp 10/100 и legal use_item → use_item.
- hp полное, враг на 1, od 1 → attack_melee.
- враг на 5, weaponRange 4, od 1 → шаг step_n если он legal, иначе первый legal.
- пустой legal → `none`.
- 64 уникальных id.

## Definition of done

Сайдкар позже импортирует тот же список из комментария в задаче 053: продублировать массив в Rust вручную, не через FFI. Тест TS — источник истины порядка.

## Зона правок

`packages/domain/src/ai.ts` и тест.
