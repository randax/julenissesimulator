import test from "node:test";
import assert from "node:assert/strict";
import { WorldStream } from "./world-stream.ts";
import type { WorldData } from "./world.ts";

function fixture() {
  const generated: Array<[number, string]> = [];
  const released: Float32Array[] = [];
  const sharedTrees = [new Float32Array([17])];
  const stream = new WorldStream((mesh) => released.push(mesh), (tile = 0, detail = "full") => {
    generated.push([tile, detail]);
    const farMesh = new Float32Array([tile, 1]);
    return {
      mesh: detail === "full" ? new Float32Array([tile, 2]) : farMesh,
      farMesh, treeMeshes: sharedTrees,
      trees: new Float32Array(detail === "full" ? [1] : []),
      lights: new Float32Array(detail === "full" ? [2] : []),
    } satisfies WorldData;
  });
  return {stream, generated, released, sharedTrees};
}

test("visible sections retain distinct meshes and upgrade far terrain only once", () => {
  const {stream, generated, released} = fixture();
  stream.beginFrame();
  const horizon = stream.get(2);
  assert.equal(stream.get(2), horizon);
  const village = stream.get(2, true);
  assert.notEqual(village.mesh, horizon.mesh);
  assert.equal(stream.get(2), village);
  assert.notEqual(stream.get(3, true).mesh, village.mesh);
  assert.deepEqual(generated, [[2,"far"],[2,"full"],[3,"full"]]);
  assert.deepEqual(released, [horizon.mesh]);
});

test("departed chunks release geometry and far-only chunks shed detailed assets", () => {
  const {stream, released, sharedTrees} = fixture();
  stream.beginFrame();
  const departing = stream.get(0, true), retained = stream.get(1, true);
  stream.endFrame();
  stream.beginFrame();
  stream.get(1);
  stream.endFrame();
  assert.ok(released.includes(departing.mesh) && released.includes(departing.farMesh));
  assert.ok(released.includes(retained.mesh));
  assert.ok(!released.includes(retained.farMesh));
  const horizon = stream.get(1);
  assert.equal(horizon.mesh, retained.farMesh);
  assert.equal(horizon.trees.length, 0);
  assert.equal(horizon.lights.length, 0);
  assert.equal(horizon.treeMeshes, sharedTrees);
  stream.clear();
  assert.ok(released.includes(retained.farMesh));
  assert.ok(!released.includes(sharedTrees[0]));
});

test("a full journey never accumulates invisible chunk geometry", () => {
  const {stream, generated, released} = fixture();
  for (let tile = 0; tile < 9; tile++) {
    stream.beginFrame();
    stream.get(tile, true);
    stream.get(tile + 1);
    stream.endFrame();
    // At most the current detailed mesh/far pair and the next horizon remain.
    const generatedArrays = generated.reduce((sum, [,detail]) => sum + (detail === "full" ? 2 : 1), 0);
    assert.equal(generatedArrays - released.length, 3);
  }
  stream.clear();
  assert.equal(new Set(released).size, released.length);
});


test("background scenery replaces a horizon without synchronous regeneration", () => {
  const {stream, generated, released, sharedTrees} = fixture();
  stream.beginFrame();
  const old = stream.get(3);
  const ready: WorldData = {
    mesh: new Float32Array([3, 2]), farMesh: new Float32Array([3, 1]),
    trees: new Float32Array([4]), lights: new Float32Array([5]), treeMeshes: sharedTrees,
  };
  stream.provide(3, ready);
  assert.equal(stream.get(3, true), ready);
  assert.ok(stream.hasDetailed(3));
  assert.deepEqual(generated, [[3, "far"]]);
  assert.deepEqual(released, [old.mesh]);
  stream.endFrame();
  assert.equal(stream.get(3, true), ready);
});
