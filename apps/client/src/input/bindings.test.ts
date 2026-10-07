import { expect, test } from 'vitest';
import {
  DEFAULT_BINDINGS,
  actionFor,
  conflicts,
  facingFromDelta,
  pointerDelta,
  rebind,
  resetBindings,
} from './index';

test('KeyW is move_forward', () => {
  expect(actionFor(DEFAULT_BINDINGS, 'KeyW')).toBe('move_forward');
  expect(actionFor(DEFAULT_BINDINGS, 'KeyW')).not.toBe('step_n');
});

test('default bindings cover world keys and leave arrows and equipment unbound', () => {
  expect(DEFAULT_BINDINGS).toEqual({
    move_forward: 'KeyW',
    move_left: 'KeyA',
    move_back: 'KeyS',
    move_right: 'KeyD',
    interact: 'KeyE',
    attack: 'MouseLeft',
    aim: 'MouseRight',
    ability_1: 'Digit1',
    ability_2: 'Digit2',
    ability_3: 'Digit3',
    target: 'Tab',
    inventory: 'KeyI',
    assembly: 'KeyP',
    craft: 'KeyC',
    quests: 'KeyQ',
    guild: 'KeyG',
    map: 'KeyM',
    chat: 'Enter',
    menu: 'Escape',
  });
  expect(actionFor(DEFAULT_BINDINGS, 'KeyE')).toBe('interact');
  expect(actionFor(DEFAULT_BINDINGS, 'KeyQ')).toBe('quests');
  expect(actionFor(DEFAULT_BINDINGS, 'ArrowUp')).toBeNull();
  expect(actionFor(DEFAULT_BINDINGS, 'ArrowLeft')).toBeNull();
  expect(Object.keys(DEFAULT_BINDINGS)).not.toContain('equipment');
  expect(conflicts(DEFAULT_BINDINGS)).toEqual([]);
});

test('rebind KeyE onto map and leave KeyM only when that binding is not removed', () => {
  const next = rebind(DEFAULT_BINDINGS, 'map', 'KeyE');

  expect(actionFor(next, 'KeyE')).toBe('map');
  expect(next.interact).toBeUndefined();
  expect(Object.entries(next).filter(([, key]) => key === 'KeyE')).toEqual([['map', 'KeyE']]);
  expect(actionFor(next, 'KeyM')).toBeNull();
  expect(conflicts(next)).toEqual([]);
  expect(DEFAULT_BINDINGS.interact).toBe('KeyE');

  const kept = rebind(DEFAULT_BINDINGS, 'chat', 'KeyF');
  expect(kept.map).toBe('KeyM');
  expect(actionFor(kept, 'KeyM')).toBe('map');
  expect(actionFor(kept, 'KeyE')).toBe('interact');
});

test('conflicts lists a key shared by two actions on a hand-built map', () => {
  const broken: Record<string, string> = {
    interact: 'KeyE',
    map: 'KeyE',
    move_forward: 'KeyW',
  };
  expect(conflicts(broken)).toEqual(['KeyE']);

  const fixed = rebind(broken, 'map', 'KeyE');
  expect(conflicts(fixed)).toEqual([]);
  expect(fixed.map).toBe('KeyE');
  expect(fixed.interact).toBeUndefined();
  expect(actionFor(fixed, 'KeyW')).toBe('move_forward');
});

test('reset restores KeyE to interact', () => {
  const changed = rebind(DEFAULT_BINDINGS, 'map', 'KeyE');
  expect(actionFor(changed, 'KeyE')).toBe('map');

  const restored = resetBindings();
  expect(actionFor(restored, 'KeyE')).toBe('interact');
  expect(restored).toEqual(DEFAULT_BINDINGS);
  expect(restored).not.toBe(DEFAULT_BINDINGS);
});

test('facingFromDelta uses atan2 sectors and a 15 degree deadzone', () => {
  expect(facingFromDelta(0)).toBe('e');
  expect(facingFromDelta(90)).toBe('n');
  expect(facingFromDelta(10)).toBeNull();
  expect(facingFromDelta(-10)).toBeNull();
  expect(facingFromDelta(14)).toBeNull();
  expect(facingFromDelta(15)).toBe('e');
  expect(facingFromDelta(45)).toBe('ne');
  expect(facingFromDelta(135)).toBe('nw');
  expect(facingFromDelta(180)).toBe('w');
  expect(facingFromDelta(-90)).toBe('s');
  expect(facingFromDelta(-45)).toBe('se');
  expect(facingFromDelta(270)).toBe('s');
  expect(facingFromDelta(360)).toBe('e');
  expect(facingFromDelta(Number.NaN)).toBeNull();
});

test('pointerDelta accumulates degrees until the facing threshold', () => {
  const first = pointerDelta(0, 10);
  expect(first).toEqual({ degrees: 10, facing: null });

  const east = pointerDelta(first.degrees, 5);
  expect(east).toEqual({ degrees: 15, facing: 'e' });

  const north = pointerDelta(east.degrees, 75);
  expect(north).toEqual({ degrees: 90, facing: 'n' });

  expect(pointerDelta(0, -90)).toEqual({ degrees: -90, facing: 's' });
});
