import { MeshBuilder, colour, point, transform } from "./geometry.ts";
import { addTerrain, terrainHeight, pathCenter, streamCenter, valleyCenter } from "./terrain.ts";
import { createFir } from "./vegetation.ts";
import { WORLD_TILE_LENGTH } from "./route.ts";
import { housesForTile } from "./houses.ts";
import {
  addBridge,
  addLantern,
  createCottage,
  cottageGlowPoints,
} from "./architecture.ts";
export { terrainHeight } from "./terrain.ts";

export interface WorldData {
  mesh: Float32Array;
  /** Unique terrain-only chunk used beyond the detailed village draw range. */
  farMesh: Float32Array;
  /** Two shape variants for near, middle, far and distant ridge detail. */
  treeMeshes: Float32Array[];
  /** x,y,z,scale,rotation,variant; uploaded as shared instances by the renderer. */
  trees: Float32Array;
  /** x,y,z,glow radius multiplier. */
  lights: Float32Array;
}
const random = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 19.19) * 43758.5453;
  return value - Math.floor(value);
};

let sharedTreeMeshes: Float32Array[] | null = null;
function forestMeshes(): Float32Array[] {
  if (sharedTreeMeshes) return sharedTreeMeshes;
  const treeMeshes: Float32Array[] = [];
  for (const detail of ["near", "mid", "far"] as const)
    for (const variant of [3, 19])
      treeMeshes.push(createFir(20, variant, detail));
  // At ridge distance, closed snowy crowns read clearly without duplicating
  // thousands of tiny branch surfaces that occupy less than a pixel.
  for (const seed of [3, 19]) {
    const crown = new MeshBuilder();
    crown.rod([0, 0, 0], [0, 18.6, 0], 0.25, colour(0x635344), 4, 0.05);
    for (const [y, r, h] of [
      [4.8, 4.8, 3.5],
      [9.1, 4.0, 3.2],
      [13.1, 2.9, 2.9],
      [16.6, 1.7, 2.5],
    ]) {
      crown.ellipsoid(
        [Math.sin(seed + y) * 0.2, y, Math.cos(y) * 0.2],
        [r, h, r * 0.9],
        colour(0xd4e0ee),
        5,
        3,
      );
    }
    treeMeshes.push(crown.build());
  }
  sharedTreeMeshes = treeMeshes;
  return treeMeshes;
}

/** Each chunk has its own world seed; mesh Z remains local for bounded GPU coordinates. */
export function createWorld(tile = 0, detail: "full" | "far" = "full"): WorldData {
  const origin = tile * WORLD_TILE_LENGTH;
  const farTerrain = new MeshBuilder();
  addTerrain(farTerrain, true, tile);
  const farMesh = farTerrain.build();
  const treeMeshes = forestMeshes();
  if (detail === "far") return {
    mesh: farMesh, farMesh, treeMeshes, trees: new Float32Array(), lights: new Float32Array(),
  };
  const mesh = new MeshBuilder(), glows: number[] = [], trees: number[] = [];
  addTerrain(mesh, false, tile);
  const houses = housesForTile(tile);
  const seed = tile * 104729 + 521;
  for (const { id, side, x, y, z, width, depth, height, yaw } of houses) {
    const placement = transform([x, y, z], [0, yaw, 0]);
    mesh.append(createCottage(width, depth, height, id), placement);
    for (const source of cottageGlowPoints(width, depth, height)) {
      const p = point(placement, source);
      glows.push(...p, 1.9);
    }
    const lampZ = z + 13;
    const lampX = pathCenter(lampZ - origin) + side * (10 + random(seed + id * 7) * 8);
    const lampY = terrainHeight(lampX, lampZ - origin);
    addLantern(mesh, lampX, lampY, lampZ);
    glows.push(lampX + 1.45, lampY + 5.15, lampZ, 2.3);
    mesh.ellipsoid([x - side * width * 0.55, y + 0.65, z + depth * 0.37],
      [width * 0.43, 1.5, width * 0.2], colour(0xd7e2f0), 12, 6);
    // Short hand-built fences follow the curved lane at a few hamlet entrances.
    if (id % 3 !== 0) continue;
    for (let fenceZ = z - 22; fenceZ <= z + 14; fenceZ += 9) {
      const fenceX = pathCenter(fenceZ - origin) + side * 10;
      const nextX = pathCenter(fenceZ + 9 - origin) + side * 10;
      const ground = terrainHeight(fenceX, fenceZ - origin);
      const nextGround = terrainHeight(nextX, fenceZ + 9 - origin);
      mesh.rod([fenceX, ground, fenceZ], [fenceX, ground + 2.5, fenceZ], 0.18, colour(0x70503a), 7);
      mesh.ellipsoid([fenceX, ground + 2.57, fenceZ], [0.36, 0.2, 0.35], colour(0xe2e8f2), 7, 4);
      for (const h of [0.85, 1.85]) {
        mesh.rod([fenceX, ground + h, fenceZ], [nextX, nextGround + h, fenceZ + 9], 0.15, colour(0x765239), 6);
        mesh.rod([fenceX, ground + h + 0.16, fenceZ], [nextX, nextGround + h + 0.16, fenceZ + 9], 0.16, colour(0xdce5f0), 6);
      }
    }
  }
  for (let index = 0; index < 2 + Math.floor(random(seed + 15) * 2); index++) {
    const z = -160 - (index + random(seed + index * 19) * 0.4) * 670;
    const x = streamCenter(z - origin), y = terrainHeight(x, z - origin);
    const bridge = new MeshBuilder();
    addBridge(bridge, z, y);
    mesh.append(bridge.build(), transform([x, 0, 0]));
    for (const side of [-1, 1]) {
      const lampX = x + side * 18;
      const lampY = terrainHeight(lampX, z - origin);
      addLantern(mesh, lampX, lampY, z);
      glows.push(lampX + 1.45, lampY + 5.15, z, 2.5);
    }
  }
  const candidateCount = 7800 + Math.floor(random(seed + 97) * 3400);
  for (let i = 0; i < candidateCount; i++) {
    const r = (offset: number) => random(seed + i * 23 + offset);
    const side = r(2) < 0.5 ? -1 : 1;
    const z = -r(3) * WORLD_TILE_LENGTH;
    const globalZ = z - origin;
    const relativeX = side * (34 + Math.pow(r(4), 0.79) * 590);
    const x = valleyCenter(globalZ) + relativeX;
    const meadow = 0.52 + Math.sin(globalZ / 380 + relativeX / 210) * 0.29;
    if (Math.abs(relativeX) < 140 && r(5) > meadow) continue;
    const scale = 0.55 + r(6) * 0.95;
    if (Math.abs(x - pathCenter(globalZ)) < 10 || Math.abs(x - streamCenter(globalZ)) < 8 ||
      houses.some((house) => Math.hypot(x - house.x, z - house.z) <
        Math.hypot(house.width / 2 + 1.5, house.depth / 2 + 1.5) + scale * 5 + 6)) continue;
    trees.push(x, terrainHeight(x, globalZ) - 0.15, z, scale, r(7) * Math.PI * 2, i % 2);
  }
  return { mesh: mesh.build(), farMesh, treeMeshes,
    trees: new Float32Array(trees), lights: new Float32Array(glows) };
}
