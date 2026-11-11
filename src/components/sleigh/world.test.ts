import test from "node:test";
import assert from "node:assert/strict";
import { STRIDE } from "./geometry.ts";
import { createWorld, terrainHeight } from "./world.ts";
import { streamCenter, pathCenter, valleyCenter, valleyWidth, valleyHeading, valleyFloor } from "./terrain.ts";
import { housesForTile } from "./houses.ts";
import { WORLD_TILE_LENGTH, ROUTE_LENGTH } from "./route.ts";

const world = createWorld();
const next = createWorld(1);
const far = createWorld(2, "far");

test("unique world chunks stay finite and reuse one set of forest asset meshes", () => {
  for (const chunk of [world, next]) {
    assert.equal(chunk.mesh.length % (STRIDE * 3), 0);
    assert.ok(chunk.mesh.every(Number.isFinite));
    assert.ok(chunk.mesh.length / (STRIDE * 3) < 650_000);
    assert.equal(chunk.farMesh.length % (STRIDE * 3), 0);
    assert.ok(chunk.farMesh.every(Number.isFinite));
    assert.ok(chunk.farMesh.length > 0 && chunk.farMesh.length < chunk.mesh.length / 4);
  }
  assert.equal(world.treeMeshes, next.treeMeshes);
  assert.equal(world.treeMeshes, far.treeMeshes);
  assert.equal(world.treeMeshes.length, 8);
  world.treeMeshes.forEach((mesh) => {
    assert.equal(mesh.length % (STRIDE * 3), 0);
    assert.ok(mesh.every(Number.isFinite));
    assert.ok(mesh.length / (STRIDE * 3) < 50_000);
  });
  assert.ok(world.treeMeshes[6].length < world.treeMeshes[0].length);
  assert.equal(far.mesh, far.farMesh);
  assert.equal(far.trees.length, 0);
  assert.equal(far.lights.length, 0);
  assert.notDeepEqual(world.trees.slice(0, 60), next.trees.slice(0, 60));
});

test("trees follow physical terrain and keep cottage clearings free", () => {
  for (const [tile, chunk] of [[0, world], [1, next]] as const) {
    assert.equal(chunk.trees.length % 6, 0);
    assert.ok(chunk.trees.length / 6 > 1000 && chunk.trees.length / 6 < 11200);
    assert.ok(chunk.trees.every(Number.isFinite));
    for (let offset = 0; offset < chunk.trees.length; offset += 6) {
      const [x, y, z, scale, angle, variant] = chunk.trees.slice(offset, offset + 6);
      assert.ok(Math.abs(x) < 1000 && z >= -WORLD_TILE_LENGTH && z <= 0);
      assert.ok(scale > 0 && scale <= 3);
      assert.ok(angle >= 0 && angle <= Math.PI * 2 + 0.001);
      assert.ok(Number.isInteger(variant) && variant >= 0 && variant < 2);
      assert.ok(Math.abs(y - (terrainHeight(x, z - tile * WORLD_TILE_LENGTH) - 0.15)) < 0.02);
      for (const house of housesForTile(tile)) {
        const radius = Math.hypot(house.width / 2 + 1.5, house.depth / 2 + 1.5);
        assert.ok(Math.hypot(x - house.x, z - house.z) > radius + scale * 5 + 5.99);
      }
    }
    assert.equal(chunk.lights.length % 4, 0);
    assert.ok(chunk.lights.length > 0 && chunk.lights.every(Number.isFinite));
    for (let i = 3; i < chunk.lights.length; i += 4) assert.ok(chunk.lights[i] > 0 && chunk.lights[i] <= 10);
  }
});

test("the valley bends through varied but flyable rolling floors", () => {
  const centres: number[] = [], floors: number[] = [];
  for (let distance = 0; distance <= ROUTE_LENGTH; distance += 40) {
    const z = -distance, centre = valleyCenter(z);
    centres.push(centre); floors.push(valleyFloor(z));
    assert.ok(valleyWidth(z) >= 140 && valleyWidth(z) <= 220);
    assert.ok(Math.abs(valleyHeading(z)) < 0.25);
    for (const offset of [-110, -60, 0, 60, 110]) {
      const height = terrainHeight(centre + offset, z);
      assert.ok(height > -2 && height < 21, `rolling floor blocked at ${offset}, ${distance}: ${height}`);
    }
  }
  assert.ok(Math.max(...centres) - Math.min(...centres) > 200);
  assert.ok(Math.max(...floors) - Math.min(...floors) > 8);
});

test("global terrain channels and normals remain continuous without periodic repetition", () => {
  const epsilon = 0.01;
  for (const z of [0, -2400, -4800, -9600, -16800]) {
    for (const x of [-900, -350, -100, 0, 100, 350, 900]) {
      const centre = terrainHeight(x, z);
      const before = (centre - terrainHeight(x, z - epsilon)) / epsilon;
      const after = (terrainHeight(x, z + epsilon) - centre) / epsilon;
      assert.ok(Math.abs(before - after) < 0.03, `terrain normal jumps at ${x}, ${z}`);
    }
    for (const channel of [streamCenter, pathCenter, valleyCenter, valleyFloor]) {
      const before = (channel(z) - channel(z - epsilon)) / epsilon;
      const after = (channel(z + epsilon) - channel(z)) / epsilon;
      assert.ok(Math.abs(before - after) < 0.001);
    }
  }
  assert.ok(Math.abs(valleyCenter(-17) - valleyCenter(-17 - WORLD_TILE_LENGTH)) > 30);
  assert.ok(Math.abs(terrainHeight(400, -500) - terrainHeight(400, -500 - WORLD_TILE_LENGTH)) > 10);
});

function edge(mesh: Float32Array, localZ: number, tile: number) {
  const vertices = new Map<number, number[]>();
  for (let i = 0; i < mesh.length; i += STRIDE) {
    const x = mesh[i];
    if (mesh[i + 2] !== localZ || Math.abs(mesh[i + 1] - terrainHeight(x, localZ - tile * WORLD_TILE_LENGTH)) > 0.001) continue;
    vertices.set(x, Array.from(mesh.slice(i + 1, i + 9)));
  }
  return vertices;
}

test("neighboring full and far chunks share exact border heights, normals and colours", () => {
  const expected = edge(world.mesh, -WORLD_TILE_LENGTH, 0);
  const candidates = [edge(world.farMesh, -WORLD_TILE_LENGTH, 0), edge(next.mesh, 0, 1), edge(next.farMesh, 0, 1)];
  assert.ok(expected.size > 100);
  for (const candidate of candidates) {
    assert.equal(candidate.size, expected.size);
    for (const [x, values] of expected) {
      const actual = candidate.get(x)!;
      values.forEach((value, index) => {
        if (index !== 1) assert.ok(Math.abs(value - actual[index]) < 1e-5, `seam differs at ${x}, ${index}`);
      });
    }
  }
});
