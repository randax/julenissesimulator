import test from "node:test";
import assert from "node:assert/strict";
import {
  HOUSE_LAYOUT, housesForTile, DELIVERY_TARGETS, DELIVERY_TARGET_COUNT,
  targetsNear, sleighWorldZ,
} from "./houses.ts";
import { terrainHeight, valleyCenter, valleyWidth } from "./terrain.ts";
import { LAUNCH_APPROACH, ROUTE_LENGTH, WORLD_TILE_LENGTH } from "./route.ts";

test("each chunk scatters distinct, deterministic hamlets across the winding valley", () => {
  assert.equal(HOUSE_LAYOUT, housesForTile(0));
  const signatures = new Set<string>();
  for (let tile = 0; tile <= 8; tile++) {
    const houses = housesForTile(tile);
    assert.equal(housesForTile(tile), houses);
    assert.ok(houses.length >= 26 && houses.length <= 36);
    assert.deepEqual(houses.map((house) => house.id), Array.from({ length: houses.length }, (_, i) => i));
    const offsets: number[] = [];
    for (const house of houses) {
      const globalZ = house.z - tile * WORLD_TILE_LENGTH;
      const offset = house.x - valleyCenter(globalZ);
      assert.equal(Math.sign(offset), house.side);
      assert.equal(house.y, terrainHeight(house.x, globalZ));
      assert.ok(Math.abs(offset) > 40 && Math.abs(offset) < valleyWidth(globalZ) - 20);
      assert.ok(house.z < -25 && house.z > -WORLD_TILE_LENGTH + 25);
      assert.ok(house.width >= 15 && house.width < 25 && house.height >= 23 && house.height < 36);
      assert.ok(Object.values(house).every(Number.isFinite));
      offsets.push(offset);
    }
    assert.ok(Math.max(...offsets) - Math.min(...offsets) > 180);
    assert.ok(new Set(houses.map((house) => Math.round(house.z))).size > houses.length * 0.85,
      "cottages must not form paired rows at matching longitudinal positions");
    signatures.add(JSON.stringify(houses.map(({ x, z, width, yaw }) => [x, z, width, yaw])));
  }
  assert.equal(signatures.size, 9, "neighboring scenery chunks must not reuse a village layout");
});

test("cottages leave physical gaps around their rotated footprints and tile edges", () => {
  for (let tile = -1; tile <= 8; tile++) {
    const houses = housesForTile(tile);
    for (let i = 0; i < houses.length; i++) {
      const a = houses[i];
      const radiusA = Math.hypot(a.width / 2 + 1.5, a.depth / 2 + 1.5);
      assert.ok(-a.z > radiusA && a.z + WORLD_TILE_LENGTH > radiusA);
      for (const b of houses.slice(i + 1)) {
        const radiusB = Math.hypot(b.width / 2 + 1.5, b.depth / 2 + 1.5);
        assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= radiusA + radiusB + 7);
      }
    }
  }
});

test("every delivery target matches a unique rendered cottage in its own chunk", () => {
  assert.equal(DELIVERY_TARGET_COUNT, DELIVERY_TARGETS.length);
  assert.ok(DELIVERY_TARGET_COUNT > 200 && DELIVERY_TARGET_COUNT < 300);
  assert.equal(new Set(DELIVERY_TARGETS.map((target) => target.id)).size, DELIVERY_TARGET_COUNT);
  let previousDistance = 0;
  for (const target of DELIVERY_TARGETS) {
    const house = housesForTile(target.tile)[target.localId];
    assert.equal(target.id, `${target.tile}:${house.id}`);
    assert.equal(target.z, house.z - target.tile * WORLD_TILE_LENGTH);
    assert.equal(target.distance, LAUNCH_APPROACH - target.z);
    assert.ok(target.distance >= previousDistance && target.distance <= ROUTE_LENGTH);
    for (const key of ["x", "y", "width", "depth", "height", "yaw", "side"] as const)
      assert.equal(target[key], house[key]);
    assert.ok(Math.abs(target.y - terrainHeight(target.x, target.z)) < 1e-9);
    previousDistance = target.distance;
  }
});

test("the run-up puts the first scattered cottage ahead and nearby targets span chunk seams", () => {
  assert.equal(sleighWorldZ(0), LAUNCH_APPROACH);
  assert.equal(sleighWorldZ(ROUTE_LENGTH), LAUNCH_APPROACH - ROUTE_LENGTH);
  assert.ok(DELIVERY_TARGETS[0].distance >= 250 && DELIVERY_TARGETS[0].distance < 330);
  const target = DELIVERY_TARGETS.find((target) => target.tile === 1)!;
  assert.deepEqual(targetsNear(target.distance, 0, 0), [target]);
  assert.ok(targetsNear(target.distance - 900).includes(target));
  assert.ok(targetsNear(target.distance + 200).includes(target));
  assert.ok(!targetsNear(target.distance - 901).includes(target));
  assert.ok(!targetsNear(target.distance + 201).includes(target));
  for (const progress of [0, 500, WORLD_TILE_LENGTH, ROUTE_LENGTH]) {
    for (const target of targetsNear(progress))
      assert.ok(Math.abs(target.z - sleighWorldZ(progress) - (progress - target.distance)) < 1e-9);
  }
});
