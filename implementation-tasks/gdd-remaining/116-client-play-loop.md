# 116. Замкнутый клиентский цикл

status: done

## Правило GDD

Артефакт 27 и 30. Меню → регистрация/вход → создание персонажа (в UI прототипа человек и демон, правила знают все 8 рас) → мир. Сетка, WASD, атака, урон, смерть, труп, респавн. `App` использует store, net, подписку клавиатуры, HUD и кадр Pixi (`buildFrame`). Строка «сайдкар недоступен» — ключ i18n, не сырой литерал в разметке.

## Файлы

- `apps/client/src/play/session.ts`
- `apps/client/src/play/session.test.ts`
- `apps/client/src/App.tsx`
- `apps/client/src/i18n/ru.ts`, `en.ts`

## Приёмка

- Регистрация и логин собирают тела `POST /auth/register` и `/auth/login`.
- Создание персонажа шлёт расу `human` или `demon` и очки.
- `enterWorld` кладёт self в store.
- `KeyW/A/S/D` дают `step_n/w/s/e` относительно лица на восток (W — север экрана нет: W вперёд по facing). При facing `e`: W → `step_e`, S → `step_w`, A → `step_n`, D → `step_s`.
- Атака — `attack_melee` по текущей цели.
- Кадр `buildFrame` содержит спрайт `self`.
- `ui.sidecar.unavailable` есть в ru и en.

## Тесты

`pnpm --filter @rift/client test`. Playwright не добавлять.
