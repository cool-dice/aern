# Разлом

Монорепозиторий прототипа: чистые правила игры, сервер, клиент и mock-сайдкар без весов модели.

## Установка

```bash
corepack pnpm install
```

## Юнит-тесты

Тесты не слушают порты, не ходят в сеть и не требуют Docker. E2E-тестов нет.

```bash
corepack pnpm test
corepack pnpm --filter @rift/domain test
corepack pnpm --filter @rift/content test
corepack pnpm --filter @rift/protocol test
corepack pnpm --filter @rift/server test
corepack pnpm --filter @rift/client test
cargo test --manifest-path apps/sidecar/Cargo.toml
```

Оболочка Tauri для этих команд не нужна. Инсталлятор не собирается.

## Ручной запуск

Эти команды не входят в тесты. `docker compose` поднимает только PostgreSQL 16 (pgvector) и Redis 7 для ручного сервера.

```bash
docker compose up
corepack pnpm --filter @rift/server dev
corepack pnpm --filter @rift/client dev
```

Клиент в dev без бинарника сайдкара показывает меню и статус «сайдкар недоступен». Кнопка «Играть» сеть не вызывает. `VITE_SIDECAR_MOCK=1` действует только в dev: меню считает pong полученным и локально открывает создание персонажа, без `POST` логина. Сервер запускается отдельно.

Клиент процесс сайдкара не порождает. Если сайдкар молчит дольше 200 мс, модуль AI на сервере подставляет utility AI.

## Сайдкар

Mock читает одну JSON-строку из stdin и пишет одну JSON-строку в stdout. Сети и весов нет.

- `{"type":"ping"}` → `{"type":"pong"}`
- `{"type":"decide","legal":["step_n"],"hpRatio":1.0,"nearestEnemy":null}` → `{"type":"action","id":"step_n","source":"mock"}`
- `{"type":"encode"}` → `{"type":"encoded","source":"stub",...}`

`require_model: true` отвечает ошибкой `model`: в репозитории нет модели.
