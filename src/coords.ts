import { config, floorY, W } from "./config.ts";

export const WORLD_SCALE = 0.01;

/** Map 2D game coordinates to Three.js world space (ground ≈ 0, up is +Y). */
export function gameToWorld(x: number, y: number, z = 0) {
  return {
    x: (x - W / 2) * WORLD_SCALE,
    y: (floorY - y) * WORLD_SCALE,
    z,
  };
}

export function gameWidthToWorld(width: number) {
  return width * WORLD_SCALE;
}

export function birdWorldX() {
  return gameToWorld(config.birdX, 0).x;
}