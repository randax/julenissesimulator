import { LAUNCH_APPROACH, ROUTE_LENGTH, WORLD_TILE_LENGTH } from "./route.ts";
import { terrainHeight, valleyCenter, valleyWidth, valleyHeading } from "./terrain.ts";

export interface HousePlacement {
  id: number;
  side: -1 | 1;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  yaw: number;
}

const random = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 19.19) * 43758.5453;
  return value - Math.floor(value);
};

const layouts = new Map<number, readonly HousePlacement[]>();

/** Irregular hamlets and isolated cabins use a unique deterministic seed per chunk. */
export function housesForTile(tile: number): readonly HousePlacement[] {
  const cached = layouts.get(tile);
  if (cached) return cached;
  const houses: HousePlacement[] = [];
  const seed = tile * 104729 + 6841;
  const count = 26 + Math.floor(random(seed + 5) * 11);
  const clusters = 3 + Math.floor(random(seed + 9) * 3);
  const centres = Array.from({ length: clusters }, (_, index) =>
    -(index + 0.35 + random(seed + index * 11) * 0.3) * WORLD_TILE_LENGTH / clusters);
  for (let attempt = 0; houses.length < count && attempt < 1600; attempt++) {
    const r = (offset: number) => random(seed + attempt * 37 + offset);
    const first = houses.length === 0;
    const cluster = Math.floor(r(3) * centres.length);
    const z = first ? -35 - r(8) * 35 : r(17) < 0.69
      ? centres[cluster] + (r(19) - 0.5) * (180 + r(21) * 180)
      : -65 - r(22) * (WORLD_TILE_LENGTH - 130);
    if (z > -28 || z < -WORLD_TILE_LENGTH + 28 || (tile < 0 && z < -2100)) continue;
    const globalZ = z - tile * WORLD_TILE_LENGTH;
    const side = (first && tile === 0 ? 1 : r(4) < 0.5 ? -1 : 1) as -1 | 1;
    const offset = side * (first && tile === 0 ? 55 + r(7) * 20 :
      43 + Math.pow(r(7), 0.9) * (valleyWidth(globalZ) - 75));
    const x = valleyCenter(globalZ) + offset;
    const width = 15 + r(31) * 10;
    const depth = width * (0.76 + r(32) * 0.23);
    const radius = Math.hypot(width / 2 + 1.5, depth / 2 + 1.5);
    if (houses.some((house) => Math.hypot(house.x - x, house.z - z) <
      radius + Math.hypot(house.width / 2 + 1.5, house.depth / 2 + 1.5) + 7)) continue;
    houses.push({
      id: houses.length, side, x, y: terrainHeight(x, globalZ), z, width, depth,
      height: 23 + r(33) * 13,
      yaw: -side * 1.1 - valleyHeading(globalZ) + (r(34) - 0.5) * 1.35,
    });
  }
  layouts.set(tile, houses);
  return houses;
}

/** Kept as the entrance chunk's layout for embedding consumers. */
export const HOUSE_LAYOUT = housesForTile(0);

export interface DeliveryTarget extends Omit<HousePlacement, "id"> {
  id: string;
  localId: number;
  tile: number;
  distance: number;
}

/** Physical world coordinates stay continuous while the renderer recycles tiles. */
export const DELIVERY_TARGETS: readonly DeliveryTarget[] = (() => {
  const targets: DeliveryTarget[] = [];
  for (
    let tile = -1;
    tile <= Math.ceil(ROUTE_LENGTH / WORLD_TILE_LENGTH);
    tile++
  ) {
    for (const house of housesForTile(tile)) {
      const z = house.z - tile * WORLD_TILE_LENGTH;
      const distance = LAUNCH_APPROACH - z;
      if (distance < 0 || distance > ROUTE_LENGTH) continue;
      targets.push({
        ...house,
        id: `${tile}:${house.id}`,
        localId: house.id,
        tile,
        z,
        distance,
      });
    }
  }
  return targets.sort((a, b) => a.distance - b.distance);
})();

export const DELIVERY_TARGET_COUNT = DELIVERY_TARGETS.length;

export function targetsNear(
  progress: number,
  ahead = 900,
  behind = 200,
): DeliveryTarget[] {
  return DELIVERY_TARGETS.filter((target) => {
    const relativeDistance = target.distance - progress;
    return relativeDistance >= -behind && relativeDistance <= ahead;
  });
}

export function sleighWorldZ(progress: number): number {
  return LAUNCH_APPROACH - progress;
}
