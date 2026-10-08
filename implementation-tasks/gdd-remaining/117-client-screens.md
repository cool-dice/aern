# 117. Экраны на store

status: done

## Правило GDD

Артефакт 27. Инвентарь (I), крафт (C), квесты (Q), карта (M), чат (Enter), обмен, взлом, настройки монтируются и читают store, а не статичный превью. Клавиатура подписана через `actionFor`. Аудиошина подключена: без файлов клипов — тон осциллятора или уже существующий memory sink в тестах, в браузере — `OscillatorNode`, если контекст есть.

## Файлы

- `apps/client/src/play/screens.tsx`
- `apps/client/src/App.tsx`
- `apps/client/src/audio/bus.ts` — тон, если клипа нет
- `apps/client/src/play/screens.test.ts`

## Приёмка

- Переключение экрана клавишей меняет `screen` в сессии.
- Инвентарь показывает слоты из store.
- Чат пишет строку в `log` store.
- Настройки меняют локаль через `normalizeSettings`.
- `playTone` или эквивалент вызывается при событии урона, даже если сэмплов нет.

## Тесты

`pnpm --filter @rift/client test`.
