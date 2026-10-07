# Rust-сайдкар: IPC и mock-policy

- id: `053`
- title: Rust-сайдкар: IPC и mock-policy
- status: `pending`
- depends_on: `001`, `026`

## Цель

Процесс читает JSON-строки из stdin и пишет JSON-строки в stdout: ping, encode-заглушка не дублирует TS, выбор действия mock-policy из 64 id.

## Контекст

Артефакты 22 и 24. IPC stdin/stdout JSON. Policy 10 млн параметров в старте не загружается. Ответ mock: если в запросе `hpRatio < 0.3` и `use_item` допустим — он, иначе если враг ближе 2 — `attack_melee`, иначе `step_n`, если он в `legal`, иначе первый legal, иначе ошибка `none`.

Порядок `ACTION_IDS` скопировать в `src/actions.rs` точно из задачи 026. Тест Rust сверяет длину 64, индекс 0 `step_n`, индекс 16 `wait`, последний `scan`.

Протокол строк:

Запрос: `{"type":"ping"}` → `{"type":"pong"}`.

Запрос: `{"type":"decide","legal":["step_n"],"hpRatio":1.0,"nearestEnemy":null}` → `{"type":"action","id":"step_n","source":"mock"}`.

Неизвестный type → `{"type":"error","code":"unknown"}`.

Битый JSON → `{"type":"error","code":"json"}`.

Процесс не выходит после одной команды: цикл до EOF. В тесте вызывать функции библиотеки, не процесс. `main.rs` только цикл.

Таймаут 200 мс — забота сервера, не сайдкара.

Если когда-нибудь модель не найдена, ответ `{"type":"error","code":"model"}` из ветки `decide` при флаге `require_model: true`. По умолчанию флаг false, mock работает. Клиент Tauri считает процесс живым, пока pong приходит. Это выполняет требование «без сайдкара клиент не входит в мир» на уровне задачи 055, не убивая тесты.

## Решение противоречий

Обзор, пункт 20. Веса не скачивать.

## Файлы

- `apps/sidecar/src/lib.rs`
- `apps/sidecar/src/actions.rs`
- `apps/sidecar/src/main.rs`
- `apps/sidecar/Cargo.toml` уже есть, добавить только если не хватает serde. Манифест создан в 001 с serde: если 001 добавил зависимости, не менять версии. Если serde забыт — добавить serde и serde_json с default features. Это единственное допустимое изменение манифеста.

## Интерфейсы

Rust-функции `handle_line(line: &str) -> String` и `decide(legal, hp_ratio, nearest) -> Result<String, ()>`.

## Алгоритм

- handle_line trim, одна JSON-значение на строку.
- decide не использует rng.

## Тесты

cargo test:

- ping → pong.
- битый json → code json.
- низкое hp и legal use_item → use_item.
- пустой legal → error none внутри decide, а handle_line для decide с пустым legal → `{"type":"error","code":"none"}`.
- список действий длиной 64, якоря индексов.
- два вызова decide с теми же аргументами равны.

## Definition of done

`cargo test` зелёный без GPU и без сети. В коде нет URL.

## Зона правок

`apps/sidecar/**`. Не трогать TS.
