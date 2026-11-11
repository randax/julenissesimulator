import { WORLD_TILE_LENGTH } from "./route.ts";

/** Keep GPU coordinates near the sleigh while the simulation retains full distance. */
export function journeySpace(distance: number, previousOrigin = 0) {
  const safe = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const origin = Math.floor(safe / WORLD_TILE_LENGTH) * WORLD_TILE_LENGTH;
  return {
    origin,
    distance: safe - origin,
    originDelta: origin - previousOrigin,
  };
}

export function visibleTiles(
  distance: number,
  ahead: number,
  behind = 100,
): number[] {
  const first = Math.floor((distance - behind) / WORLD_TILE_LENGTH),
    last = Math.floor((distance + ahead) / WORLD_TILE_LENGTH);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
