# 101. Команды каталога доходят до тика

status: pending

## Правило GDD

Артефакты 22 и 26: пространство действий — 64 id. Шаг — `step_<dir>`, бег — `run_<dir>`, атака — `attack_melee` и `attack_ranged`. Обзор: тик 100 мс. `action === 'move'` в каталоге нет. Адаптер `toSimCommand` обязан переводить id каталога в команду симуляции. Направления — восемь сторон домена (`n` … `nw`).

## Файлы

- `apps/server/src/sim/commands.ts` (новый)
- `apps/server/src/sim/commands.test.ts`
- `apps/server/src/compose.ts` — вызов адаптера, не фильтр `action === 'move'`

## Приёмка

- `step_e` → движение на восток, `running: false`.
- `run_nw` → движение на северо-запад, `running: true`.
- `attack_melee` / `attack_ranged` → атака с `melee` true/false, цель из `targetId`.
- Неизвестный id и битый dir → `null`, в тик не попадает.
- `entityId` берётся из `params.entityId`.

## Тесты

`pnpm --filter @rift/server test` — `commands.test.ts`.
