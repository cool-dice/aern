# JSON-каталоги прототипа и полного справочника

- id: `029`
- title: JSON-каталоги прототипа и полного справочника
- status: `done`
- depends_on: `005`, `007`, `009`, `015`, `016`, `021`

## Цель

Положить в репозиторий данные, которые домен считает аргументами: расы, предметы, рецепты, монстры, лут, квесты, мир, флаги прототипа. Загрузчик проверяет ссылки и не ходит в сеть.

## Контекст

Числа брать из артефактов, не выдумывать урон оружия:

- Расы и модификаторы — задача `005`, продублировать в `races.json` для сервера.
- Оружие и броня — таблицы артефакта 8. Каждая строка: id snake_case от русского имени (`rusty_sword` для «Ржавый меч»), grade, damage или armor, weightKg, range, ammo, requirements, bonuses как в таблице, slot, twoHanded для двуручного топора, рельсотрона, гранатомёта, щита.
- Ядра — 10 строк артефакта 6/8, id: `core_berserk`, `core_ghost`, `core_titan`, `core_sniper`, `core_necromancer`, `core_medic`, `core_tech`, `core_scout`, `core_engineer`, `core_first_engineer`.
- Рецепты — все строки артефакта 10. Поля: id, skill, station, itemId, minLevel, maxLevel, materials, unique, kind `item|consumable|relic`. Восемь прототипных рецептов с `prototype: true`: `rusty_sword`, `bow`, `leather_hood`, `leather_jacket`, `spore_relic`, `plate_relic`, `healing_draught`, `antidote`. Это набор артефакта 30 (оружейник 2, бронник 2, биотех 1, механик 1, алхимик 2), не набор v1.
- Монстры — 30 строк бестиария плюс `keeper_patrol` (уровень 12–20, HP 80, урон 14, броня 8, точность 10, уклонение 6, тип solo) и `keeper_enhanced` (уровень 50, HP 1000, урон 35, броня 18, 3 фазы) и `keeper_enhanced_prototype` (уровень 20, HP 400, урон 18, броня 8, 2 фазы: вторая с 50% HP, урон ×1.5). Прототип спавнит только крысу, бандита, киборг-пса, дрон-разведчика, патрульного хранителя и прототипного босса. Пометить их `prototype: true`.
- Лут-записи боссов из артефакта 11 раздела 8 перенести как массивы шансов. Усиленный хранитель прототипа использует урезанную таблицу: золото по формуле boss, metal 1.0 qty 3–5, relic_shard 0.5 qty 1, echo grade1 0.3. Без уникального компонента уровня 50.
- Мир — `prototypeWorld()` id из задачи 021, плюс координаты x,y целые: форт 0,0; ребро 10,0; хаб света 20,0; данж света 30,0; рудник 0,10; роща 0,-10; барьер 40,0; зеркало тьмы с y=100. Регионы: `plains` уровни 1–5 свет, `lava` 1–5 тьма.
- Квесты прототипа, все `prototype: true`:
  1. `tutorial` story, 10 целей-счётчиков: wake, look, steps 10, talk, equip, kill 1 rat, loot, inventory, craft 1, bind. Награда easy.
  2. `kill_rats` kill 5, normal, ежедневный нет, повторяемый.
  3. `gather_start` собрать 3 metal на свете или 3 spores на тьме — два id `gather_metal`, `gather_spores`.
  4. `first_craft` скрафтить 1 предмет, easy.
  5. `visit_hub` посетить свой хаб, easy.
- Флаги `features.json`: `playableRaces: ["human","demon"]`, `auction: "stub"`, `mail: "stub"`, `guild: "stub"`, `titles: "stub"`, `languages: ["ru","en"]`.
- Фрагмент древнего `fragment_rift_01`: lore «предтечи открыли разлом в изначальном городе», координаты 40,0, recipe `energy_blade`, password `X7#9@!`. Точка в конце не ставится: `.` входит в ключ `CIPHER_GLYPHS` (`!#$%&()*+,-./0123456789:;<=>?@[]^`, 33 знака, без `_` и без пробела), поэтому символ `.` в открытом тексте не проходит круг encode/decode. Верхний регистр тоже не проходит круг: перед шифром он складывается в нижний, `ё` складывается в `е`. Хранимый текст уже в этом виде.
- Стартовый набор: оружие `rusty_sword` уровня 1, броня торса `leather_jacket` уровня 1, 3 `bandage` (лечение 15 HP, вес 0.1, ОД 1), 20 `ammo_light`.

Локализация имён предметов — ключи `item.<id>.name` в `packages/content/locales/ru.json` и `en.json` для прототипных id и рас. Полные 500 ключей не писать: все id каталога должны иметь ru и en имя, даже если en — транслит snake_case словами.

## Решение противоречий

Обзор, пункт 13. Каталог полный, прототип — флаги. Босс 20 уровня не затирает строку 50 уровня.

## Файлы

- `packages/content/data/*.json` перечисленные выше
- `packages/content/locales/ru.json`, `en.json`
- `packages/content/src/load.ts`
- `packages/content/src/load.test.ts`
- `packages/content/src/index.ts` экспортирует `loadCatalog`

## Интерфейсы

```ts
export interface Catalog { /* поля по файлам */ }
export function loadCatalog(rootDir: string): Catalog;
```

В тестах передавать путь к `packages/content/data` через `import.meta.url`, не через сеть. Проверка: каждый recipe.itemId есть в предметах, каждый prototype recipe помечен, playable races ⊆ races, мир содержит все id задачи 021, у каждого монстра hp > 0, сумма не нужна. Дубликаты id бросают Error при загрузке.

`loadCatalog` читает ФС. Это единственный IO пакета content. Домен JSON не читает.

## Тесты

- загрузка фикстур репозитория успешна.
- число рас 8, прототипных рецептов 8, прототипных монстров 5 плюс прототипный босс.
- неизвестный itemId в подменённой строке (сконструировать объект в тесте функцией `assertRefs`) даёт ошибку. Вынести `assertRefs(catalog)` и вызвать на битом клоне.
- `keeper_enhanced` уровень 50 и `keeper_enhanced_prototype` уровень 20 оба существуют.
- features.auction === `stub`.

## Definition of done

`pnpm --filter @rift/content test` зелёный без сервера.

## Зона правок

Только `packages/content/**`.
