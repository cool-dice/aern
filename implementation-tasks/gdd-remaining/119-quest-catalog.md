# 119. Виды целей и три акта

status: done

## Правило GDD

Артефакт 15, виды по действию, которых не было в `QUEST_OBJECTIVE_KINDS`: сопровождение `escort`, защита `defend`, захват `capture`, расследование `investigate`, спасение `rescue`, диверсия `sabotage`, открытие `discover`, обучение `learn`, торговля `trade`, PvP `pvp`, лор `lore`. Уже есть kill, collect, gather, craft, deliver, visit, talk, hack, survive. Головоломка покрыта `hack`.

Артефакт 20.6: три акта на обеих сторонах. Акт I «Выживание» 1–20, акт II «Поиск» 20–40, акт III «Разлом» 40–50. Свет: форт людей. Тьма: обсидиановая башня. Мировой слой линейный. Имена ключей локализации `quest.<id>.name` обязательны в ru и en.

## Файлы

- `packages/domain/src/quests.ts`
- `packages/domain/src/quests.test.ts` — список видов расширяется, проверки счётчика остаются
- `packages/content/data/quests.json`
- `packages/content/locales/ru.json`, `en.json`

## Приёмка

- Каждый новый kind проходит `advance` как счётчик.
- В каталоге есть сюжетные квесты `act1_light`, `act1_dark`, `act2_light`, `act2_dark`, `act3_light`, `act3_dark` и хотя бы по одной цели новых видов.
- `loadCatalog` не падает на ссылках.

## Тесты

`pnpm --filter @rift/domain test` и `pnpm --filter @rift/content test`.
