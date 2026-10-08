# 103. Смерть, труп, подъём, респавн

status: done

## Правило GDD

Артефакты 5 и 7, домен `death.ts`: 0 HP → `fallDown` (downed). Труп живёт `CORPSE_MS` (2 часа). Квестовый предмет забирает только `questOwnerId`. `revive` возвращает 30% HP, пока труп не истёк. `respawnAtBind` поднимает у привязки с полным HP. Лут трупа монстра — таблица `rollLoot`, не пустой список.

## Файлы

- `apps/server/src/sim/tick.ts` — после урона и статусов вызывать `fallDown`
- `apps/server/src/sim/lifecycle.ts` — revive, respawn, loot
- `apps/server/src/sim/lifecycle.test.ts`

## Приёмка

- Атака, снимающая HP до 0, переводит цель в `downed` и кладёт труп.
- Чужой не забирает квестовый стак (`code: quest`).
- Владелец забирает. Истёкший труп — `expired`.
- `respawn` возвращает сущность на клетку привязки, `phase: online`, HP = max.

## Тесты

`pnpm --filter @rift/server test` — `lifecycle.test.ts`. Числа `CORPSE_MS` и `REVIVE_HP_RATIO` не менять.
