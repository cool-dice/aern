# 118. Наблюдение 896 и mock-сайдкар

status: done

## Правило GDD

Артефакты 22 и 24. Вектор длины 896. Сервер собирает его из мира через `encodeObservation`. Сайдкар на `encode` возвращает числовой массив этой длины, не только раскладку блоков. Молчание дольше 200 мс — utility AI (уже в модуле AI). Весов в репозитории нет: `require_model: true` остаётся ошибкой `model`. Клиент умеет породить mock-процесс или говорить JSON-протоколом.

## Файлы

- `apps/sidecar/src/lib.rs`
- `apps/server/src/modules/ai/observe.ts`
- `apps/server/src/modules/ai/observe.test.ts`
- `apps/client/src/play/sidecar.ts`

## Приёмка

- `encode` без вектора отвечает `values.length === 896` и `source: "mock"`.
- Если клиент прислал `observation`, сайдкар обрезает/дополняет до 896 и клипует в `[0, 1]`.
- `observeEntity` на мире с игроком и крысой даёт 896 чисел, блок actors не весь нулевой.
- `spawnMockSidecar` описывает команду `cargo run` и обмен ping; в юнит-тесте процесс не обязателен, если протокол покрыт строкой JSON.

## Тесты

`cargo test --manifest-path apps/sidecar/Cargo.toml` и `pnpm --filter @rift/server test`.
