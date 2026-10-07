# Каркас монорепозитория

- id: `001`
- title: Каркас монорепозитория
- status: `pending`
- depends_on: нет

## Цель

Создать пустой, собираемый монорепозиторий, в котором следующие задачи добавляют только исходники. Все манифесты зависимостей создаются здесь, чтобы параллельные задачи не правили один `package.json`.

## Контекст

Источник: `docs/gdd.v2/Артефакт 24. Архитектурные решения.md`, разделы 2 и 12. Стек: TypeScript (клиент и сервер), Rust (сайдкар), pnpm, Turborepo, Vitest, ESLint, Prettier, Fastify, React, PixiJS, Zustand, PostgreSQL, Redis. Node.js 20+. Этап 0 roadmap требует монорепозиторий, но CI и Grafana в эту задачу не входят (граница в `00-overview.md`).

## Решение противоречий

Инструмент миграций — Prisma, не Knex (обзор, решение 25 в списке обзора — пункт про Prisma). Версии зафиксировать так: `typescript` 5.6.3, `vitest` 2.1.4, `turbo` 2.1.3, `eslint` 9, `prettier` 3.3, `react` 18.3.1, `vite` 5.4, `pixi.js` 8.4, `zustand` 5, `fastify` 5.0, `ws` 8.18, `zod` 3.23, `bcryptjs` 2.4.3, `jsonwebtoken` 9.0.2, `ioredis` 5.4, `prisma` и `@prisma/client` 5.22. Сайдкар не получает llama.cpp и ONNX в `Cargo.toml` этой задачи: только `serde` и `serde_json`.

## Файлы

Создать:

- `package.json` — private, `"packageManager": "pnpm@9.12.2"`, скрипты `test`, `lint`, `typecheck`, `dev`, `build`.
- `pnpm-workspace.yaml` — `packages/*`, `apps/*`.
- `turbo.json` — pipeline `typecheck`, `lint`, `test`, `build`. `test` зависит от `^typecheck`.
- `tsconfig.base.json` — `strict`, `ES2022`, `moduleResolution: bundler`, `noUncheckedIndexedAccess`.
- `.npmrc` — `strict-peer-dependencies=true`.
- `.gitignore` — `node_modules`, `dist`, `target`, `.env`, `apps/server/prisma/*.db`.
- `.prettierrc.json`, `eslint.config.js` на корень.
- `packages/domain/package.json` — имя `@rift/domain`, `main` и `types` на `./src/index.ts`, скрипт `test`: `vitest run`.
- `packages/domain/tsconfig.json`, `packages/domain/vitest.config.ts`.
- `packages/domain/src/index.ts` — временный `export {}`. Задача `054` заменит файл целиком; до этого другие задачи его не трогают.
- `packages/protocol/package.json` — `@rift/protocol`. Аналогичные tsconfig и vitest. `src/index.ts` с `export {}`.
- `packages/content/package.json` — `@rift/content`, зависимость `@rift/domain` workspace. `src/index.ts` с `export {}`.
- `apps/server/package.json` — `@rift/server`, зависимости workspace domain, protocol, content плюс fastify, ws, zod, bcryptjs, jsonwebtoken, ioredis, prisma, @prisma/client. Скрипты `test`, `typecheck`, `dev`.
- `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`.
- `apps/server/src/main.ts` — временный `process.exit(0)` не писать. Пока файл отсутствует: задача `045` создаёт `main.ts`. В этой задаче только пустой `apps/server/src/.gitkeep`, чтобы пакет типизировался. `typecheck` сервера исключает отсутствие входа: `include` пустой папки допустим, если есть `src/empty.ts` с `export {}`. Создать `apps/server/src/empty.ts`.
- `apps/client/package.json` — `@rift/client`, react, react-dom, vite, zustand, pixi.js, workspace protocol и content. Скрипт `dev`: `vite`, `test`: `vitest run`.
- `apps/client/tsconfig.json`, `vite.config.ts`, `index.html` с `<div id="root">`, `src/main.tsx` пока только монтирует текст `boot` без игровых экранов. Задача `055` заменяет `main.tsx` и создаёт `App.tsx`. Чтобы не конфликтовать, эта задача создаёт `src/boot-placeholder.tsx` и `src/main.tsx` из одной строки импорта placeholder. Задача `055` — единственная, кто потом меняет `main.tsx`.
- `apps/client/src/vite-env.d.ts`.
- `apps/sidecar/Cargo.toml` — package `rift-sidecar`, edition 2021. `src/main.rs` печатает одну JSON-строку готовности и выходит. Задача `053` заменяет `main.rs`.

Не создавать: `.github/workflows`, Dockerfile приложения, Kubernetes, Playwright.

## Интерфейсы

Корневые скрипты:

- `pnpm test` → `turbo run test`
- `pnpm typecheck` → `turbo run typecheck`
- `pnpm lint` → `turbo run lint`

Vitest в каждом TS-пакете: `environment: 'node'`, `include: ['src/**/*.test.ts']`. Не подключать jsdom.

## Алгоритм

1. Манифесты перечисляют зависимости заранее, даже если исходников ещё нет.
2. `pnpm install` должен завершаться без сети повторно из локального store; первый запуск сеть использует. Это делает имплементатор задачи 001, не юнит-тесты.
3. Пакетные тесты: один файл `src/scaffold.test.ts` в domain, protocol, content, server, client, который ожидает `1 + 1 === 2`. Сайдкар: `cargo test` с пустым `#[test] fn crate_compiles()`.

## Тесты

- `packages/domain/src/scaffold.test.ts` — `expect(true).toBe(true)`.
- Аналогично в protocol, content, server, client.
- `apps/sidecar/src/lib.rs` с тестом компиляции, `main.rs` остаётся бинарём.

## Definition of done

- `pnpm install`, `pnpm typecheck`, `pnpm test`, `cargo test --manifest-path apps/sidecar/Cargo.toml` проходят.
- Ни один последующий пакет не требует правки чужого `package.json` для зависимостей из списка выше. Новую библиотеку добавлять нельзя без отдельного решения оркестратора.

## Зона правок

Корень репозитория, манифесты `packages/*` и `apps/*`, плейсхолдеры `src`. Не создавать игровую логику.
