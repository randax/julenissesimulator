import test from "node:test";
import assert from "node:assert/strict";
import {
  chargePower,
  createAim,
  keyboardAim,
  makeThrowSource,
  pointerAim,
} from "./aim.ts";
import { createFlight, startFlight, stepFlight } from "./flight.ts";
import { LAUNCH_APPROACH } from "./route.ts";

const near = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${actual} differs from ${expected}`,
  );

test("pointer aiming maps the viewport to bounded throwing angles", () => {
  assert.deepEqual(createAim(), { yaw: 0.65, elevation: -0.25, power: 36 });
  near(pointerAim(0.5, 0.5).yaw, 0);
  near(pointerAim(0.5, 0.5).elevation, -0.2);
  assert.deepEqual(pointerAim(-10, -10), {
    yaw: -1.8,
    elevation: 0.55,
    power: 36,
  });
  assert.deepEqual(pointerAim(10, 10), {
    yaw: 1.8,
    elevation: -0.95,
    power: 36,
  });
  for (const value of Object.values(pointerAim(Number.NaN, Infinity)))
    assert.ok(Number.isFinite(value));
});

test("keyboard aiming uses bounded rates without mutating the previous aim", () => {
  const aim = Object.freeze(createAim());
  const moved = keyboardAim(aim, 1, 1, 0.1);
  near(moved.yaw, aim.yaw + 0.15);
  near(moved.elevation, aim.elevation + 0.08);
  assert.deepEqual(aim, createAim());
  assert.deepEqual(
    keyboardAim(aim, 100, -100, 50),
    keyboardAim(aim, 1, -1, 0.1),
  );
  for (const dt of [0, -1, Number.NaN, Infinity])
    assert.deepEqual(keyboardAim(aim, 1, 1, dt), aim);
  let extreme = { yaw: 100, elevation: -100, power: Infinity };
  extreme = keyboardAim(extreme, Number.NaN, Infinity, 0.1);
  assert.deepEqual(extreme, { yaw: 1.8, elevation: -0.95, power: 36 });
});

test("holding a throw increases power up to a finite maximum", () => {
  assert.equal(chargePower(0), 36);
  assert.equal(chargePower(0.425), 47);
  assert.equal(chargePower(0.85), 58);
  assert.equal(chargePower(50), 58);
  for (const duration of [-1, Number.NaN, Infinity])
    assert.equal(chargePower(duration), 36);
});

test("throws inherit actual forward, lateral and climbing carrier velocity", () => {
  const previous = startFlight(createFlight());
  const current = stepFlight(
    previous,
    { steer: 1, climb: 1, boost: true, brake: false },
    0.1,
  );
  const source = makeThrowSource(current, previous, 0.1);
  near(source.velocity[0], 60);
  near(source.velocity[1], 32);
  near(source.velocity[2], -current.speed / 3.6);
  assert.deepEqual(source.position, [
    current.x + 1.2,
    current.altitude + 3.1,
    LAUNCH_APPROACH - current.distance - 1.7,
  ]);
  const late = { ...current, distance: 9600 };
  assert.equal(
    makeThrowSource(late, null, 0.1).position[2],
    LAUNCH_APPROACH - 9600 - 1.7,
  );
});

test("respawns, replays, phase changes and invalid timing never impart teleport velocity", () => {
  const previous = { ...startFlight(createFlight()), distance: 500 };
  const moved = { ...previous, x: 3, altitude: 36, distance: 505 };
  const cases = [
    { ...moved, lives: 2 },
    { ...moved, distance: 0 },
    { ...moved, distance: 10000 },
    { ...moved, x: 100 },
    { ...moved, altitude: 100 },
  ];
  for (const current of cases) {
    const source = makeThrowSource(current, previous, 0.1);
    assert.deepEqual(source.velocity.slice(0, 2), [0, 0]);
    near(source.velocity[2], -current.speed / 3.6);
  }
  for (const dt of [0, -1, Number.NaN, Infinity])
    assert.deepEqual(
      makeThrowSource(moved, previous, dt).velocity.slice(0, 2),
      [0, 0],
    );
  assert.deepEqual(
    makeThrowSource({ ...moved, phase: "paused" }, previous, 0.1).velocity,
    [0, 0, 0],
  );
  assert.deepEqual(
    makeThrowSource(moved, { ...previous, phase: "ready" }, 0.1).velocity.slice(
      0,
      2,
    ),
    [0, 0],
  );
});
