# 120. Сетка взлома 4×4

status: done

## Правило GDD

Артефакт 27, раздел 19. Сетка 4×4. Алфавит A–H. Три попытки. Сложность «база − техника/2». Подсказка — быки (символы на своих местах). Без колоды экран заблокирован.

## Файлы

- `apps/client/src/ui/screens.tsx` — `HackScreen` рисует 16 клеток
- `apps/client/src/ui/hack-grid.ts`
- `apps/client/src/ui/hack-grid.test.ts`

## Приёмка

- `hackGrid(passwordHint)` возвращает 4 ряда по 4 символа из алфавита.
- Модель `hackModel` по-прежнему `rows: 4`, `cols: 4`.
- Экран содержит `data-cell` для каждой клетки и поле ввода из 4 символов.

## Тесты

`pnpm --filter @rift/client test`.
