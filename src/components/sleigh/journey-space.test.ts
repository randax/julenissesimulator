import test from "node:test";
import assert from "node:assert/strict";
import { journeySpace, visibleTiles } from "./journey-space.ts";
import { WORLD_TILE_LENGTH, ROUTE_LENGTH } from "./route.ts";

test("every part of the long journey renders within one local terrain period", () => {
  for (let distance = 0; distance <= ROUTE_LENGTH; distance += 37) {
    const space = journeySpace(distance);
    assert.ok(space.distance >= 0 && space.distance < WORLD_TILE_LENGTH);
    assert.equal(space.origin + space.distance, distance);
    assert.equal(space.origin % WORLD_TILE_LENGTH, 0);
  }
});

test("rebasing the camera and a world point preserves their relative position at a seam", () => {
  const before = journeySpace(WORLD_TILE_LENGTH - 1),
    after = journeySpace(WORLD_TILE_LENGTH + 1, before.origin);
  const cameraBeforeZ = -before.distance + 22;
  const cameraAfterRebase = cameraBeforeZ + after.originDelta;
  const objectDistance = WORLD_TILE_LENGTH + 100;
  const objectBeforeZ = -objectDistance + before.origin,
    objectAfterZ = -objectDistance + after.origin;
  assert.equal(objectBeforeZ - cameraBeforeZ, objectAfterZ - cameraAfterRebase);
  assert.equal(after.originDelta, WORLD_TILE_LENGTH);
});

test("neighboring tiles cover the view without accumulating meshes as distance grows", () => {
  for (const distance of [0, 1, 2399, 2400, 7800, 18000]) {
    const frame = journeySpace(distance),
      tiles = visibleTiles(frame.distance, 5600, 100);
    assert.ok(tiles.length <= 4);
    assert.ok(tiles[0] * WORLD_TILE_LENGTH <= frame.distance - 100);
    assert.ok((tiles.at(-1)! + 1) * WORLD_TILE_LENGTH >= frame.distance + 5600);
  }
});
