import { MeshBuilder, colour, point, transform } from "./geometry.ts";
import { addTerrain, terrainHeight, pathCenter } from "./terrain.ts";
import { createFir } from "./vegetation.ts";
import {
  addBridge,
  addLantern,
  createCottage,
  cottageGlowPoints,
} from "./architecture.ts";
export { terrainHeight } from "./terrain.ts";

export interface WorldData {
  mesh: Float32Array;
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

export function createWorld(): WorldData {
  const mesh = new MeshBuilder(),
    glows: number[] = [],
    trees: number[] = [];
  addTerrain(mesh);
  let houseSeed = 0;
  for (const [start, rows] of [
    [-6, 4],
    [-720, 3],
    [-1510, 3],
  ]) {
    for (let row = 0; row < rows; row++)
      for (const side of [-1, 1]) {
        const seed = houseSeed++,
          z = start - row * 70 + (random(seed + 44) - 0.5) * 12;
        const x = side * (48 + (row % 2) * 18 + random(seed + 18) * 13),
          y = terrainHeight(x, z);
        const width = 17 + random(seed + 65) * 4,
          depth = width * 0.86,
          height = 27 + random(seed + 81) * 7;
        const placement = transform(
          [x, y, z],
          [0, side * 0.11 + (random(seed + 8) - 0.5) * 0.15, 0],
        );
        mesh.append(createCottage(width, depth, height, seed), placement);
        for (const source of cottageGlowPoints(width, depth, height)) {
          const p = point(placement, source);
          glows.push(...p, 1.9);
        }
        const lampX = side * 24,
          lampY = terrainHeight(lampX, z + 13);
        addLantern(mesh, lampX, lampY, z + 13);
        glows.push(lampX + 1.45, lampY + 5.15, z + 13, 2.3);
        mesh.ellipsoid(
          [x - side * width * 0.55, y + 0.65, z + depth * 0.37],
          [width * 0.43, 1.5, width * 0.2],
          colour(0xd7e2f0),
          12,
          6,
        );
      }
    for (const side of [-1, 1])
      for (let z = start + 25; z > start - rows * 70 + 15; z -= 9) {
        const x = side * 27 + pathCenter(z) * 0.5,
          y = terrainHeight(x, z);
        mesh.rod([x, y, z], [x, y + 2.5, z], 0.18, colour(0x70503a), 8);
        mesh.ellipsoid(
          [x, y + 2.57, z],
          [0.36, 0.2, 0.35],
          colour(0xe2e8f2),
          8,
          5,
        );
        for (const h of [0.85, 1.85]) {
          const nextY = terrainHeight(x, z - 9);
          mesh.rod(
            [x, y + h, z],
            [x, nextY + h, z - 9],
            0.15,
            colour(0x765239),
            7,
          );
          mesh.rod(
            [x, y + h + 0.16, z],
            [x, nextY + h + 0.16, z - 9],
            0.16,
            colour(0xdce5f0),
            7,
          );
        }
      }
  }
  for (const z of [-125, -1640]) {
    addBridge(mesh, z, terrainHeight(0, z));
    for (const side of [-1, 1]) {
      const x = side * 18,
        y = terrainHeight(x, z);
      addLantern(mesh, x, y, z);
      glows.push(x + 1.45, y + 5.15, z, 2.5);
    }
  }
  // Dense hillside forests reuse a small set of full 3D tree meshes.
  for (let i = 0; i < 11200; i++) {
    const side = i % 2 ? 1 : -1,
      z = 65 - random(i + 719) * 3000;
    const x = side * (34 + Math.pow(random(i + 45), 0.79) * 590);
    // Keep cottage entrances and the stream/path visible.
    if (
      Math.abs(x) < 110 &&
      ((z < 50 && z > -310) ||
        (z < -650 && z > -960) ||
        (z < -1440 && z > -1760))
    )
      continue;
    const scale = 0.57 + random(i + 347) * 0.9;
    trees.push(
      x,
      terrainHeight(x, z) - 0.15,
      z,
      scale,
      random(i + 44) * Math.PI * 2,
      i % 2,
    );
  }
  // Tall, snowy boughs frame the village entrance just like the reference.
  for (const [x, z, scale] of [
    [-34, 12, 1.9],
    [35, -8, 1.8],
    [-37, -53, 1.5],
    [39, -91, 1.45],
    [-30, -340, 1.55],
    [32, -410, 1.4],
  ]) {
    trees.push(
      x,
      terrainHeight(x, z) - 0.15,
      z,
      scale,
      random(x + z) * 6.28,
      Math.abs(x) % 2,
    );
  }
  // Loose clumps near the path give the flight depth without closing its corridor.
  for (let i = 0; i < 150; i++) {
    const z = -320 - i * 9.7,
      x = (i % 2 ? 1 : -1) * (32 + random(i + 511) * 28) + pathCenter(z) * 0.1;
    trees.push(
      x,
      terrainHeight(x, z) - 0.15,
      z,
      0.7 + random(i + 7) * 0.45,
      random(i + 3) * 6.28,
      i % 2,
    );
  }
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
  return {
    mesh: mesh.build(),
    treeMeshes,
    trees: new Float32Array(trees),
    lights: new Float32Array(glows),
  };
}
