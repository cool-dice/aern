import { chebyshev, type Cell } from '@rift/domain/movement';
import { expect, test } from 'vitest';
import { buildFrame, type FrameInput, type SpriteDesc } from './frame';

function cell(x: number, y: number): Cell {
  return { x, y };
}

function scene(partial: Partial<FrameInput> & Pick<FrameInput, 'vision'>): FrameInput {
  return {
    origin: partial.origin ?? cell(0, 0),
    facing: partial.facing ?? 'e',
    vision: partial.vision,
    blocked: partial.blocked ?? [],
    entities: partial.entities ?? [],
  };
}

function sprite(frame: SpriteDesc[], id: string): SpriteDesc {
  const found = frame.find((item) => item.id === id);
  expect(found).toBeDefined();
  if (!found) {
    throw new Error(`missing sprite ${id}`);
  }
  return found;
}

test('entity past vision is absent', () => {
  const origin = cell(0, 0);
  const vision = 2;
  const outside = cell(3, 0);
  expect(chebyshev(origin, outside)).toBe(vision + 1);

  const frame = buildFrame(
    scene({
      origin,
      vision,
      entities: [{ id: 'wanderer', cell: outside, image: 'mob_e' }],
    }),
  );

  expect(frame.some((item) => item.id === 'wanderer')).toBe(false);
});

test('entity at the vision radius is present', () => {
  const origin = cell(10, 20);
  const vision = 2;
  const edge = cell(12, 22);
  expect(chebyshev(origin, edge)).toBe(vision);

  const frame = buildFrame(
    scene({
      origin,
      vision,
      facing: 'sw',
      entities: [{ id: 'edge', cell: edge, image: 'mob_sw' }],
    }),
  );

  expect(sprite(frame, 'edge')).toEqual({
    id: 'edge',
    image: 'mob_sw',
    x: (2 - 2) * 32,
    y: (2 + 2) * 16 - 16,
    zIndex: -vision,
  });
});

test('a farther wall has a smaller zIndex than a nearer wall', () => {
  const frame = buildFrame(
    scene({
      vision: 4,
      blocked: [cell(4, 0), cell(1, 0), cell(9, 9)],
    }),
  );

  const far = sprite(frame, 'wall:4,0');
  const near = sprite(frame, 'wall:1,0');
  expect(far.zIndex).toBeLessThan(near.zIndex);
  expect(far).toEqual({ id: 'wall:4,0', image: 'wall', x: 128, y: 64, zIndex: -4 });
  expect(near).toEqual({ id: 'wall:1,0', image: 'wall', x: 32, y: 16, zIndex: -1 });
  expect(frame.indexOf(far)).toBeLessThan(frame.indexOf(near));
  expect(frame.some((item) => item.id === 'wall:9,9')).toBe(false);
  expect(frame.some((item) => item.id === 'floor:1,0')).toBe(false);
});

test('self is in the frame once, at the projected origin', () => {
  const frame = buildFrame(
    scene({
      vision: 1,
      facing: 'ne',
      entities: [
        { id: 'self', cell: cell(1, 0), image: 'duplicate_self' },
        { id: 'occupant', cell: cell(0, 0), image: 'player_ne' },
        { id: 'neighbor', cell: cell(1, 0), image: 'mob_e' },
      ],
    }),
  );

  expect(frame.filter((item) => item.id === 'self')).toEqual([
    { id: 'self', image: 'self_ne', x: 0, y: -16, zIndex: 0 },
  ]);
  expect(frame.some((item) => item.id === 'occupant')).toBe(false);
  expect(sprite(frame, 'neighbor').image).toBe('mob_e');

  const ground = sprite(frame, 'floor:0,0');
  expect(ground).toEqual({ id: 'floor:0,0', image: 'floor', x: 0, y: 0, zIndex: 0 });
  expect(frame.indexOf(ground)).toBeLessThan(frame.indexOf(sprite(frame, 'self')));
  expect(frame.indexOf(sprite(frame, 'floor:1,0'))).toBeLessThan(
    frame.indexOf(sprite(frame, 'neighbor')),
  );
});

test('the same scene is deeply equal and facing does not move the world', () => {
  const input = scene({
    origin: cell(5, -2),
    facing: 'nw',
    vision: 1,
    blocked: [cell(6, -2), cell(5, -1)],
    entities: [
      { id: 'a', cell: cell(4, -2), image: 'a_nw' },
      { id: 'b', cell: cell(5, -3), image: 'b_n' },
    ],
  });

  const first = buildFrame(input);
  const second = buildFrame(input);
  expect(first).toEqual(second);
  expect(first).not.toBe(second);

  for (let i = 1; i < first.length; i += 1) {
    const previous = first[i - 1];
    const current = first[i];
    if (!previous || !current) {
      throw new Error('missing sprite');
    }
    expect(previous.zIndex).toBeLessThanOrEqual(current.zIndex);
  }

  const turned = buildFrame({ ...input, facing: 'e' });
  const placed = (frame: SpriteDesc[]) =>
    frame.map((item) => ({ id: item.id, x: item.x, y: item.y, zIndex: item.zIndex }));
  expect(placed(first)).toEqual(placed(turned));
  expect(sprite(first, 'self').image).toBe('self_nw');
  expect(sprite(turned, 'self').image).toBe('self_e');
});
