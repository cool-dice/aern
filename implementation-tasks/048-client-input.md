# Ввод и ребинд

- id: `048`
- title: Ввод и ребинд
- status: `done`
- depends_on: `001`

## Цель

Превратить коды клавиш в игровые действия и сохранить ребинд без конфликтов.

## Контекст

Артефакт 27. По умолчанию: W A S D движение, E взаимодействие, ЛКМ атака, ПКМ прицел, 1 2 3 способности, Tab цель, I инвентарь, P сборка, C крафт, Q квесты, G гильдия, M карта, Enter чат, Esc меню. Стрелки — опциональный поворот, по умолчанию не назначены. Мировой E не открывает экипировку.

Ребинд: новое назначение снимает клавишу с предыдущего действия. Конфликт функция `conflicts(bindings)` возвращает список клавиш с двумя действиями; после `rebind` список пуст.

Сброс к `DEFAULT_BINDINGS`.

Мышь: `pointerDelta` копит градусы, порог 15° на поворот на одну из 8 граней. Функция `facingFromDelta(degrees)`.

## Решение противоречий

Обзор, пункт 21.

## Файлы

- `apps/client/src/input/bindings.ts`
- `apps/client/src/input/bindings.test.ts`

## Интерфейсы

```ts
export const DEFAULT_BINDINGS: Record<string, string>;
export function rebind(map: Record<string, string>, action: string, key: string): Record<string, string>;
export function actionFor(map: Record<string, string>, key: string): string | null;
export function conflicts(map: Record<string, string>): string[];
export function facingFromDelta(degrees: number): Dir | null;
```

## Алгоритм

- Клавиши хранятся как `KeyW`, `KeyE`, `MouseLeft`, `MouseRight`.
- `rebind` копирует объект, удаляет старые действия с этой клавишей, ставит новое.
- `facingFromDelta`: |deg| < 15 → null. Иначе 8 секторов по 45°, 0° — восток, против часовой к северу (стандарт atan2). Зафиксировать в тесте: 0 → e, 90 → n.

## Тесты

- KeyW → move_forward (имя действия `move_forward`, не `step_n`; перевод в направление делает сцена от facing).
- rebind E на карту: E больше не interact, M ещё карта если не снята. После rebind KeyE только map. interact без клавиши, пока не назначат.
- conflicts на ручной порче карты с двумя значениями: функция смотрит значения, дубликат ключа в объекте невозможен, поэтому conflicts ищет два action с одной key. Передать map, собранный не через rebind.
- reset возвращает KeyE interact.
- facing 0 → e, 90 → n, 10 → null.

## Definition of done

Нет подписки на `window` в тестируемом файле. Подписка, если нужна, в `install.ts`, тест её не импортирует.

## Зона правок

`apps/client/src/input/**`.
