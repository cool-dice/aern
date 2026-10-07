import { Application, Container } from 'pixi.js';
import { DRAW_LAYER_ORDER, type DrawLayer } from './layers';

/** Runtime frame rate. Unit tests never start this ticker. */
export const SCENE_FPS = 60;

export interface InjectedRenderer {
  stage: Container;
  canvas?: unknown;
  ticker?: { maxFPS: number };
}

export interface SceneLayers {
  floor: Container;
  wall: Container;
  sprite: Container;
}

export interface SceneApp {
  stage: Container;
  world: Container;
  layers: SceneLayers;
  canvas: unknown;
}

export interface CreateApplicationOptions {
  width?: number;
  height?: number;
  /**
   * Skip `Application.init`. Unit tests pass a Container stage so no canvas
   * or WebGL context is created.
   */
  renderer?: InjectedRenderer;
}

/**
 * Pixi application for the isometric scene.
 * This module is not imported by unit tests. Without `renderer`, it refuses
 * to build a view when Vitest is running or when `document` is missing.
 *
 * `layers` is the equal-depth band order (floor, wall, sprite). Cell depth
 * still comes from `buildFrame`: add those sprites with their zIndex. Facing
 * does not rotate the world; the camera looks along world +x (east).
 */
export async function createApplication(options: CreateApplicationOptions = {}): Promise<SceneApp> {
  if (options.renderer) {
    const scene = mount(options.renderer.stage, options.renderer.canvas);
    if (options.renderer.ticker) {
      options.renderer.ticker.maxFPS = SCENE_FPS;
    }
    return scene;
  }

  if (process.env.VITEST === 'true' || typeof document === 'undefined') {
    throw new Error(
      'createApplication does not create a canvas without a browser document. Pass renderer.',
    );
  }

  const app = new Application();
  await app.init({
    width: options.width ?? 800,
    height: options.height ?? 600,
    background: '#111111',
    autoStart: true,
    preference: 'webgl',
  });
  app.ticker.maxFPS = SCENE_FPS;
  return mount(app.stage, app.canvas);
}

function mount(stage: Container, canvas: unknown): SceneApp {
  const world = new Container();
  world.label = 'world';
  world.sortableChildren = true;

  const layers = {} as Record<DrawLayer, Container>;
  for (const [index, name] of DRAW_LAYER_ORDER.entries()) {
    const layer = new Container();
    layer.label = name;
    layer.zIndex = index;
    layer.sortableChildren = true;
    layers[name] = layer;
  }

  world.addChild(layers.floor, layers.wall, layers.sprite);
  stage.sortableChildren = true;
  stage.addChild(world);

  return {
    stage,
    world,
    layers: {
      floor: layers.floor,
      wall: layers.wall,
      sprite: layers.sprite,
    },
    canvas,
  };
}
