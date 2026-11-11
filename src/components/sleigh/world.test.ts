import test from "node:test";
import assert from "node:assert/strict";
import { STRIDE } from "./geometry.ts";
import { createWorld, terrainHeight } from "./world.ts";

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
    assert.ok(Math.abs(x) < 1_000 && z > -4_000 && z < 200);
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
    for (let z = 0; z >= -1800; z -= 25) {
      const height = terrainHeight(x, z);
      assert.ok(
        height > -1 && height < 7,
        `terrain at ${x}, ${z} intrudes into the safe flying corridor`,
      );
    }
  }
});
