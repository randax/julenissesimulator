import test from "node:test";
import assert from "node:assert/strict";
import {
  HOUSE_LAYOUT,
  DELIVERY_TARGETS,
  DELIVERY_TARGET_COUNT,
  targetsNear,
  sleighWorldZ,
} from "./houses.ts";
import { terrainHeight } from "./terrain.ts";
import { LAUNCH_APPROACH, ROUTE_LENGTH, WORLD_TILE_LENGTH } from "./route.ts";

test("the original twenty seeded cottages retain their placement and geometry", () => {
  assert.equal(HOUSE_LAYOUT.length, 20);
  assert.deepEqual(
    HOUSE_LAYOUT.map((house) => house.id),
    Array.from({ length: 20 }, (_, i) => i),
  );
  // Original village fixtures lock the seed sequence across all three settlements.
  for (const [index, x, z, width, height, yaw] of [
    [
      0, -50.794472863155534, -7.597945794273983, 20.406682099899626,
      29.337442824627942, -0.12516696684411727,
    ],
    [
      8, -53.76286729144317, -715.4900899833738, 20.864686102664564,
      27.476930726552382, -0.036669544149990546,
    ],
    [
      19, 48.094833540726995, -1649.6109367685567, 18.076365560933482,
      30.266214916977333, 0.07292811211424123,
    ],
  ]) {
    const house = HOUSE_LAYOUT[index];
    assert.deepEqual(
      [house.x, house.z, house.width, house.height, house.yaw],
      [x, z, width, height, yaw],
    );
  }
  for (const house of HOUSE_LAYOUT) {
    assert.equal(house.side, house.id % 2 ? 1 : -1);
    assert.equal(Math.sign(house.x), house.side);
    assert.equal(house.y, terrainHeight(house.x, house.z));
    assert.equal(house.depth, house.width * 0.86);
    assert.ok(house.z <= 0 && house.z >= -WORLD_TILE_LENGTH);
    assert.ok(house.width >= 17 && house.width < 21);
    assert.ok(house.height >= 27 && house.height < 34);
    assert.ok(Object.values(house).every(Number.isFinite));
  }
});

test("every delivery target is a unique rendered house within the journey", () => {
  assert.equal(DELIVERY_TARGET_COUNT, 154);
  assert.equal(DELIVERY_TARGET_COUNT, DELIVERY_TARGETS.length);
  assert.equal(
    new Set(DELIVERY_TARGETS.map((target) => target.id)).size,
    DELIVERY_TARGET_COUNT,
  );
  let previousDistance = 0;
  for (const target of DELIVERY_TARGETS) {
    const house = HOUSE_LAYOUT[target.localId];
    assert.equal(target.id, `${target.tile}:${house.id}`);
    assert.equal(target.z, house.z - target.tile * WORLD_TILE_LENGTH);
    assert.equal(target.distance, LAUNCH_APPROACH - target.z);
    assert.ok(
      target.distance >= previousDistance && target.distance <= ROUTE_LENGTH,
    );
    assert.ok(target.distance >= 0);
    assert.deepEqual(
      [
        target.x,
        target.y,
        target.width,
        target.depth,
        target.height,
        target.yaw,
        target.side,
      ],
      [
        house.x,
        house.y,
        house.width,
        house.depth,
        house.height,
        house.yaw,
        house.side,
      ],
    );
    assert.ok(Math.abs(target.y - terrainHeight(target.x, target.z)) < 1e-9);
    previousDistance = target.distance;
  }
  // The next tile must not silently reuse the previous cottage's scoring identity.
  for (const house of HOUSE_LAYOUT) {
    const first = DELIVERY_TARGETS.find(
      (target) => target.tile === 0 && target.localId === house.id,
    )!;
    const next = DELIVERY_TARGETS.find(
      (target) => target.tile === 1 && target.localId === house.id,
    )!;
    assert.notEqual(first.id, next.id);
    assert.ok(Math.abs(first.z - next.z - WORLD_TILE_LENGTH) < 1e-9);
  }
});

test("the launch run-up places the first village ahead of the sleigh", () => {
  assert.equal(sleighWorldZ(0), LAUNCH_APPROACH);
  assert.equal(sleighWorldZ(ROUTE_LENGTH), LAUNCH_APPROACH - ROUTE_LENGTH);
  assert.ok(
    DELIVERY_TARGETS[0].distance >= 250 && DELIVERY_TARGETS[0].distance < 270,
  );
  for (const progress of [0, 500, WORLD_TILE_LENGTH, ROUTE_LENGTH]) {
    for (const target of targetsNear(progress)) {
      assert.equal(
        target.z - sleighWorldZ(progress),
        progress - target.distance,
      );
    }
  }
});

test("nearby target windows include their boundaries and span tile seams", () => {
  const target = DELIVERY_TARGETS.find((target) => target.tile === 1)!;
  assert.deepEqual(targetsNear(target.distance, 0, 0), [target]);
  assert.ok(targetsNear(target.distance - 900).includes(target));
  assert.ok(targetsNear(target.distance + 200).includes(target));
  assert.ok(!targetsNear(target.distance - 901).includes(target));
  assert.ok(!targetsNear(target.distance + 201).includes(target));
  const progress = WORLD_TILE_LENGTH;
  assert.deepEqual(
    targetsNear(progress, 700, 500),
    DELIVERY_TARGETS.filter(
      (house) =>
        house.distance >= progress - 500 && house.distance <= progress + 700,
    ),
  );
});
