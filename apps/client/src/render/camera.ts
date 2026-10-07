import type { Cell, Dir } from '@rift/domain/movement';

/**
 * Facing does not rotate the world in this version. The camera looks along
 * world +x, which is east. A turn changes later steps, not this projection.
 * Sprite facing is an image id suffix. `entity.image` is already chosen by the caller.
 */
export interface Camera {
  origin: Cell;
  facing: Dir;
  vision: number;
}

export function createCamera(origin: Cell, facing: Dir, vision: number): Camera {
  return {
    origin: { x: origin.x, y: origin.y },
    facing,
    vision,
  };
}

/** Offset from the camera cell. +x is east and +y is south. Facing is not applied. */
export function worldDelta(camera: Camera, cell: Cell): { dx: number; dy: number } {
  return {
    dx: cell.x - camera.origin.x,
    dy: cell.y - camera.origin.y,
  };
}
