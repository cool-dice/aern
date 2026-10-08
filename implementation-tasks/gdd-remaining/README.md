# Оставшиеся задачи по полному GDD

Статус на момент списка: код на `c25c312` закрывает доменные формулы, но игровой цикл, тик, сервисы аукциона/почты/гильдий/титулов, Prisma и клиент остаются заглушками прототипа. Этот список отменяет заглушки из `implementation-tasks/00-overview.md` (пункт 16 и клиент «только меню»), где они противоречат полному GDD v2. Числовые решения обзора сохраняются: v2 важнее v1, гнёзда реликтов 1/2/3/3, сторона не хранится, прогресс в `quest_progress`, членство в `guild_members`, тик 10 Гц, урон от стата точности, попадание от `accuracy + floor(perception/2)`, 0 ОД — уклонения нет.

Вне кода только то, чего нет как бинарника: живой листинг Steam и обученные веса GPU. Для них есть расписание и IPC, но не `feature_stub` геймплея.

| id | Файл | Статус |
|---|---|---|
| 101 | [101-sim-commands.md](101-sim-commands.md) | done |
| 102 | [102-populated-world.md](102-populated-world.md) | done |
| 103 | [103-death-corpse.md](103-death-corpse.md) | done |
| 104 | [104-bestiary-fights.md](104-bestiary-fights.md) | done |
| 105 | [105-season-weather.md](105-season-weather.md) | done |
| 106 | [106-xp-quests.md](106-xp-quests.md) | done |
| 107 | [107-neuroshock-mutation.md](107-neuroshock-mutation.md) | done |
| 108 | [108-gathering-module.md](108-gathering-module.md) | done |
| 109 | [109-hack-module.md](109-hack-module.md) | done |
| 110 | [110-wiki-module.md](110-wiki-module.md) | done |
| 111 | [111-relic-build-module.md](111-relic-build-module.md) | done |
| 112 | [112-guild-live.md](112-guild-live.md) | done |
| 113 | [113-auction-live.md](113-auction-live.md) | done |
| 114 | [114-mail-titles.md](114-mail-titles.md) | done |
| 115 | [115-prisma-repositories.md](115-prisma-repositories.md) | done |
| 116 | [116-client-play-loop.md](116-client-play-loop.md) | done |
| 117 | [117-client-screens.md](117-client-screens.md) | done |
| 118 | [118-sidecar-observation.md](118-sidecar-observation.md) | pending |
| 119 | [119-quest-catalog.md](119-quest-catalog.md) | pending |
| 120 | [120-hack-grid.md](120-hack-grid.md) | done |
