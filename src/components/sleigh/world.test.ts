import test from "node:test";
import assert from "node:assert/strict";
import { STRIDE } from "./geometry.ts";
import { createWorld, terrainHeight } from "./world.ts";
import { streamCenter, pathCenter } from "./terrain.ts";
import { WORLD_TILE_LENGTH, ROUTE_LENGTH } from "./route.ts";

// World generation is deterministic and expensive enough to share across the checks.
const world = createWorld();

test("the world keeps finite triangle data and detailed trees in a shared mesh budget", () => {
  assert.equal(world.mesh.length % (STRIDE * 3), 0);
  assert.ok(world.mesh.every(Number.isFinite));
  const triangles = world.mesh.length / (STRIDE * 3);
  assert.ok(
    triangles > 0 && triangles < 500_000,
    "static geometry exceeds its budget",
  );
  assert.equal(world.farMesh.length % (STRIDE * 3), 0);
  assert.ok(world.farMesh.every(Number.isFinite));
  assert.ok(
    world.farMesh.length > 0 && world.farMesh.length < world.mesh.length / 4,
    "distant repeats should retain terrain without detailed village geometry",
  );
  assert.equal(world.treeMeshes.length, 8);
  world.treeMeshes.forEach((mesh) => {
    assert.equal(mesh.length % (STRIDE * 3), 0);
    assert.ok(mesh.every(Number.isFinite));
    const count = mesh.length / (STRIDE * 3);
    assert.ok(
      count > 0 && count < 50_000,
      "a shared tree mesh exceeds its budget",
    );
  });
  assert.ok(
    world.treeMeshes[6].length < world.treeMeshes[0].length,
    "distant crowns must cost less than nearby trees",
  );
});

test("tree instances are rooted on terrain and lights have valid placements", () => {
  assert.equal(world.trees.length % 6, 0);
  assert.ok(world.trees.every(Number.isFinite));
  assert.ok(
    world.trees.length / 6 > 1_000,
    "the hillside forest should use shared instances",
  );
  for (let offset = 0; offset < world.trees.length; offset += 6) {
    const [x, y, z, scale, angle, variant] = world.trees.slice(
      offset,
      offset + 6,
    );
    assert.ok(Math.abs(x) < 1_000 && z >= -WORLD_TILE_LENGTH && z <= 0);
    assert.ok(scale > 0 && scale <= 3);
    assert.ok(angle >= 0 && angle <= Math.PI * 2 + 0.001);
    assert.ok(Number.isInteger(variant) && variant >= 0 && variant < 2);
    assert.ok(
      Math.abs(y - (terrainHeight(x, z) - 0.15)) < 0.02,
      "a tree floats above its terrain root",
    );
  }
  assert.equal(world.lights.length % 4, 0);
  assert.ok(world.lights.length > 0 && world.lights.every(Number.isFinite));
  for (let offset = 0; offset < world.lights.length; offset += 4) {
    assert.ok(world.lights[offset + 3] > 0 && world.lights[offset + 3] <= 10);
  }
});

test("the full flight corridor remains below the simulation's safe minimum altitude", () => {
  for (let x = -110; x <= 110; x += 10) {
    for (let z = 0; z >= -WORLD_TILE_LENGTH; z -= 25) {
      const height = terrainHeight(x, z);
      assert.ok(
        height > -1 && height < 7,
        `terrain at ${x}, ${z} intrudes into the safe flying corridor`,
      );
    }
  }
});

test("terrain and scenery coordinates join continuously across reusable tile edges", () => {
  const epsilon = 0.01;
  for (const x of [-900, -350, -100, 0, 100, 350, 900]) {
    const edge = terrainHeight(x, 0);
    assert.ok(Math.abs(edge - terrainHeight(x, -WORLD_TILE_LENGTH)) < 1e-9);
    const before = (edge - terrainHeight(x, -epsilon)) / epsilon;
    const after = (terrainHeight(x, epsilon) - edge) / epsilon;
    assert.ok(
      Math.abs(before - after) < 0.02,
      `terrain normal jumps at x=${x}`,
    );
    for (const z of [-17, -640, -WORLD_TILE_LENGTH + 1]) {
      assert.ok(
        Math.abs(
          terrainHeight(x, z) - terrainHeight(x, z - WORLD_TILE_LENGTH),
        ) < 1e-8,
      );
    }
  }
  for (const center of [streamCenter, pathCenter]) {
    assert.ok(Math.abs(center(0) - center(-WORLD_TILE_LENGTH)) < 1e-9);
    const before = (center(0) - center(-epsilon)) / epsilon;
    const after = (center(epsilon) - center(0)) / epsilon;
    assert.ok(Math.abs(before - after) < 0.001);
  }
});

test("the full longer journey retains a low corridor through every repeated tile", () => {
  for (const x of [-110, -60, 0, 60, 110]) {
    for (let distance = 0; distance <= ROUTE_LENGTH; distance += 40) {
      const height = terrainHeight(x, -distance);
      assert.ok(
        height > -1 && height < 7,
        `corridor blocked at ${x}, ${distance}`,
      );
    }
  }
});

test("full and distant terrain meshes share the same tile-end seam vertices", () => {
  const edge = (mesh: Float32Array, z: number) => {
    const vertices = new Map<number, number[]>();
    for (let offset = 0; offset < mesh.length; offset += STRIDE) {
      const x = mesh[offset];
      if (
        mesh[offset + 2] !== z ||
        Math.abs(mesh[offset + 1] - terrainHeight(x, z)) > 0.001
      )
        continue;
      vertices.set(x, Array.from(mesh.slice(offset + 3, offset + 9)));
    }
    return vertices;
  };
  const fullStart = edge(world.mesh, 0),
    fullEnd = edge(world.mesh, -WORLD_TILE_LENGTH);
  const distantStart = edge(world.farMesh, 0),
    distantEnd = edge(world.farMesh, -WORLD_TILE_LENGTH);
  assert.ok(fullStart.size > 100);
  assert.equal(fullStart.size, fullEnd.size);
  assert.equal(fullStart.size, distantStart.size);
  assert.equal(fullStart.size, distantEnd.size);
  for (const [x, expected] of fullStart) {
    for (const candidate of [
      fullEnd.get(x),
      distantStart.get(x),
      distantEnd.get(x),
    ]) {
      assert.ok(candidate);
      expected.forEach((value, index) =>
        assert.ok(Math.abs(value - candidate[index]) < 1e-5),
      );
    }
  }
});
