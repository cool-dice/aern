# Точка входа клиента и инструкция запуска

- id: `055`
- title: Точка входа клиента и инструкция запуска
- status: `pending`
- depends_on: `045`, `046`, `047`, `048`, `049`, `050`, `051`, `052`, `053`

## Цель

Собрать экран, который показывает меню и не пускает в мир без ответа сайдкара, и написать корневой README с командами тестов.

## Контекст

Артефакт 24: клиент не стартует мир, если сайдкар не запустился. В dev без бинарника сайдкара `pnpm --filter @rift/client dev` показывает меню и статус «сайдкар недоступен», кнопка «Играть» не вызывает сеть. Если переменная `VITE_SIDECAR_MOCK=1`, меню считает pong полученным и кнопка вызывает `POST` логин не автоматически: только переключает view-model на экран создания персонажа локально, без сервера. Сервер запускается отдельно.

Tauri: `apps/client/src-tauri` минимальный конфиг, окно грузит `http://localhost:5173` в dev. Не собирать инсталлятор в тестах. Если Tauri CLI нет в окружении, достаточно закоммитить `src-tauri/tauri.conf.json` и `src/main.rs` обёртки, которая при `cargo check` не обязательна в CI этой задачи. `cargo check` сайдкара уже есть. Для Tauri: если пакет не ставится, не блокировать задачу — конфиг JSON валиден, README говорит, что оболочка опциональна для юнит-тестов.

README корня на русском:

- что это за репозиторий (одна фраза),
- `pnpm install`, `pnpm test`, фильтры пакетов, `cargo test --manifest-path apps/sidecar/Cargo.toml`,
- `pnpm --filter @rift/server dev` и `pnpm --filter @rift/client dev`,
- docker compose только для ручного Postgres и Redis,
- юнит-тесты Docker не требуют,
- нет E2E.

Кнопка «Играть» использует view-model задачи 049. Связать в `App.tsx`.

## Решение противоречий

Обзор, пункт 20: mock-флаг только для dev. Прод-сборка Tauri без pong не открывает создание персонажа. Функция `canEnterWorld(pong: boolean, devMock: boolean): boolean` истинна только если pong или devMock.

## Файлы

- `apps/client/src/main.tsx` — заменить плейсхолдер на рендер `App`.
- `apps/client/src/App.tsx`
- `apps/client/src/boot.ts` — `canEnterWorld` без JSX
- `apps/client/src/boot.test.ts`
- `README.md` в корне репозитория
- `apps/client/src-tauri/tauri.conf.json` минимальный

Не добавлять Playwright.

## Интерфейсы

```ts
export function canEnterWorld(pong: boolean, devMock: boolean): boolean;
```

## Алгоритм

- false, false → false.
- true, false → true.
- false, true → true.
- App при false прячет создание персонажа: это следует из функции, тест функции достаточен. App.tsx не тестировать рендером.

## Тесты

Три случая `canEnterWorld`. Прогон `pnpm --filter @rift/client test` и серверных тестов, чтобы убедиться, что замена `main.tsx` не ломает tsc. Если клиентский tsconfig включает main.tsx, типчек зелёный.

## Definition of done

Корневой README содержит команды. `canEnterWorld(false, false)` ложно. Новых игровых формул нет.

## Зона правок

`apps/client/src/main.tsx`, `App.tsx`, `boot.ts`, `boot.test.ts`, `src-tauri/tauri.conf.json`, `/workspace/README.md`.

Не переписывать модули state, net, ui, render.
