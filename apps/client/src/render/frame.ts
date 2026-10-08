import { chebyshev, type Cell, type Dir } from '@rift/domain/movement';
import { createCamera, worldDelta, type Camera } from './camera';
import { visionCells, withinVision } from './cull';
import { FLOOR_Z, projectIso, SPRITE_Z } from './iso';
import { compareDrawOrder, distanceZIndex, type DrawLayer } from './layers';

export interface SpriteDesc {
  id: string;
  image: string;
  x: number;
  y: number;
  zIndex: number;
}

export interface FrameInput {
  origin: Cell;
  facing: Dir;
  vision: number;
  blocked: Cell[];
  entities: { id: string; cell: Cell; image: string }[];
}

interface Draft extends SpriteDesc {
  layer: DrawLayer;
}

/**
 * Visible floor, walls, and actors around the camera.
 * Facing does not rotate the projection; see `createCamera`.
 * The returned list is far-first. Nearer sprites have a higher zIndex.
 */
export function buildFrame(input: FrameInput): SpriteDesc[] {
  const camera = createCamera(input.origin, input.facing, input.vision);
  const blocked = new Set(input.blocked.map(cellKey));
  const drafts: Draft[] = [];

  for (const cell of visionCells(camera.origin, camera.vision)) {
    const layer: DrawLayer = blocked.has(cellKey(cell)) ? 'wall' : 'floor';
    drafts.push(place(camera, cell, layer, `${layer}:${cell.x},${cell.y}`, layer, FLOOR_Z));
  }

  for (const entity of input.entities) {
    if (entity.id === 'self' || sameCell(entity.cell, camera.origin)) {
      continue;
    }
    if (!withinVision(camera.origin, entity.cell, camera.vision)) {
      continue;
    }
    drafts.push(place(camera, entity.cell, 'sprite', entity.id, entity.image, SPRITE_Z));
  }

  drafts.push(place(camera, camera.origin, 'sprite', 'self', `self_${camera.facing}`, SPRITE_Z));

  drafts.sort(compareDrawOrder);
  return drafts.map(toSprite);
}

function place(
  camera: Camera,
  cell: Cell,
  layer: DrawLayer,
  id: string,
  image: string,
  z: number,
): Draft {
  const delta = worldDelta(camera, cell);
  const point = projectIso(delta.dx, delta.dy, z);
  return {
    id,
    image,
    x: point.x,
    y: point.y,
    zIndex: distanceZIndex(chebyshev(camera.origin, cell)),
    layer,
  };
}

function toSprite(draft: Draft): SpriteDesc {
  return {
    id: draft.id,
    image: draft.image,
    x: draft.x,
    y: draft.y,
    zIndex: draft.zIndex,
  };
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}
