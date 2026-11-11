import { LAUNCH_APPROACH, ROUTE_LENGTH, WORLD_TILE_LENGTH } from "./route.ts";
import { terrainHeight } from "./terrain.ts";

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

/** Shared cottage geometry and delivery footprints for one rendered valley tile. */
export const HOUSE_LAYOUT: readonly HousePlacement[] = (() => {
  const houses: HousePlacement[] = [];
  for (const [start, rows] of [
    [-6, 4],
    [-720, 3],
    [-1510, 3],
  ]) {
    for (let row = 0; row < rows; row++) {
      for (const side of [-1, 1] as const) {
        const id = houses.length;
        const z = start - row * 70 + (random(id + 44) - 0.5) * 12;
        const x = side * (48 + (row % 2) * 18 + random(id + 18) * 13);
        const width = 17 + random(id + 65) * 4;
        houses.push({
          id,
          side,
          x,
          y: terrainHeight(x, z),
          z,
          width,
          depth: width * 0.86,
          height: 27 + random(id + 81) * 7,
          yaw: side * 0.11 + (random(id + 8) - 0.5) * 0.15,
        });
      }
    }
  }
  return houses;
})();

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
    for (const house of HOUSE_LAYOUT) {
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
