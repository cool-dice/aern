# Валидация команд

- id: `042`
- title: Валидация команд
- status: `pending`
- depends_on: `030`, `003`, `010`, `012`

## Цель

Отклонить невозможную команду до симуляции: подпись не здесь, здесь игровые проверки.

## Контекст

Артефакты 5, 23, 24. Проверки: ОД, дистанция, линия видимости, кулдаун, патроны или предмет, цель жива, зона PvP, стан и downed, перегруз на бег, НН не блокирует пассивку отдельно — если `neuroshock`, активные `ability_*` запрещены. Дубликат `commandId` — ответственность шлюза, но функция `seenCommand(id)` тоже экспортируется из этого файла, чтобы шлюз её не копировал. Хранилище seen — набор в памяти мира на сессию.

Коды отказа: `no_od`, `range`, `los`, `cooldown`, `resources`, `target`, `safe`, `status`, `weight`, `nn`, `duplicate`, `unknown_action`.

Подозрительность: 5 отказов за 60 секунд → событие не шины, а флаг `cheatStrike: true` в результате, без бана. Бан решит модерация по счётчику.

Лаг: атака передаёт `issuedAtMs`. Валидатор выбирает снимок не старше 500 мс и проверяет дистанцию по нему. Применение урона всё равно к текущим HP в симуляторе; эта задача только говорит `ok` или отказ. Если снимок старше 500 мс — проверять текущее состояние и код не менять на ошибку (команда уже отсечена как stale шлюзом).

## Решение противоречий

Шлюз (`043`) вызывает эту функцию. Общий файл только `sim/validate.ts`.

## Файлы

- `apps/server/src/sim/validate.ts`
- `apps/server/src/sim/validate.test.ts`

## Интерфейсы

```ts
export function validateCommand(input: {
  action: string;
  commandId: string;
  seen: Set<string>;
  od: number;
  odCost: number;
  distance: number;
  range: number;
  los: boolean;
  cooldownReady: boolean;
  hasResource: boolean;
  targetAlive: boolean;
  safeZone: boolean;
  pvpOpen: boolean;
  stunned: boolean;
  downed: boolean;
  running: boolean;
  overloaded: boolean;
  neuroshock: boolean;
  recentRejects: number;
}): Result<{ cheatStrike: boolean }, string>;
```

При успехе `seen` не мутировать: вернуть новый набор через отдельную функцию `rememberCommand(seen, id): Set<string>` иммутабельно (копия). `validateCommand` при duplicate не добавляет. Тест проверяет, что входной Set не вырос. Значит функция не должна писать в Set. Флаг duplicate если `seen.has`.

## Алгоритм

Порядок проверок фиксирован: duplicate, unknown_action, status (stunned или downed), safe, nn (ability при neuroshock), weight (run при overload), cooldown, resources, target, los, range, no_od. Первая ошибка возвращается. `cheatStrike` true если `recentRejects >= 4` (этот отказ пятый).

Атака в сейфе без pvpOpen → safe. Переход `portal` не проверяет ОД.

`unknown_action`, если action не из списка 64 и не из серверных `move` (алиас не вводить: движение — `step_*` и `run_*`).

## Тесты

- каждый код хотя бы одним кейсом, остальные поля валидны.
- пятый отказ `recentRejects` 4 даёт cheatStrike true вместе с ошибкой.
- успешная команда cheatStrike false.
- входной Set той же длины после вызова.
- ability при neuroshock → nn.
- бег при перегрузе → weight.
- дистанция 11 range 10 → range.
- ОД 0 стоимость 1 → no_od.

## Definition of done

Функция чистая.

## Зона правок

`apps/server/src/sim/validate.ts` и тест. Не править `tick.ts`.
