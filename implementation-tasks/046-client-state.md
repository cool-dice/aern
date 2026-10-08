# Клиентское состояние

- id: `046`
- title: Клиентское состояние
- status: `done`
- depends_on: `001`, `003`

## Цель

Zustand-стор персонажа, мира и предсказанной позиции. Без React-экранов.

## Контекст

Артефакт 24: Zustand. Канал state приходит пакетом. Стор не ходит в сеть.

Поля: `self` (hp, maxHp, od, odLimit, cell, facing, phase, level, gold), `entities` по id, `inventory`, `log` последних 20 системных строк, `connected`.

`applySnapshot` заменяет серверные поля. Предсказанные шаги хранятся отдельно и не затирают hp.

## Решение противоречий

Нет.

## Файлы

- `apps/client/src/state/store.ts`
- `apps/client/src/state/store.test.ts`

Тест импортирует store без рендера. Zustand можно вызвать `getState()` в node.

## Интерфейсы

```ts
export interface ClientState {
  self: { id: string; hp: number; maxHp: number; od: number; cell: { x: number; y: number }; facing: string; phase: string; level: number; gold: number } | null;
  entities: Record<string, { id: string; cell: { x: number; y: number } }>;
  connected: boolean;
  applySnapshot(snapshot: unknown): void;
  setConnected(v: boolean): void;
  pushLog(line: string): void;
}
export function createClientStore(): ClientState; // если useStore неудобен в тесте, фабрика без хуков
```

Если используется `create` из zustand, тест берёт `useClient.getState()`.

## Алгоритм

- Неизвестный snapshot без `self` оставляет self null и не бросает.
- pushLog обрезает до 20.
- applySnapshot с hp 0 ставит phase как в снимке, не вычисляет смерть сам.

## Тесты

- снимок меняет gold и cell.
- 25 логов → длина 20, остаётся последний.
- setConnected false.

## Definition of done

Нет импорта pixi и react-dom в `state/`.

## Зона правок

`apps/client/src/state/**`. Не трогать `main.tsx`.
