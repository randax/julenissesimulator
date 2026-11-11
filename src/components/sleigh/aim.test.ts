import test from "node:test";
import assert from "node:assert/strict";
import {
  chargePower,
  createAim,
  keyboardAim,
  makeThrowSource,
  pointerAim,
  smoothAim,
  dragAim,
  worldThrowAim,
} from "./aim.ts";
import { createFlight, startFlight } from "./flight.ts";
import { LAUNCH_APPROACH } from "./route.ts";
import { createDelivery, throwPackage } from "./delivery.ts";

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

test("throws inherit explicit world velocity and originate from the rotated helper seat", () => {
  const previous = startFlight(createFlight());
  const current = {
    ...previous, yaw: 0.55, velocity: [26, 8, -61] as [number, number, number],
    x: previous.x + 1.2, altitude: previous.altitude + 0.4, distance: 3.1, elapsed: 0.05,
    speed: Math.hypot(26, 61) * 3.6,
  };
  const source = makeThrowSource(current, previous, 0.05);
  assert.deepEqual(source.velocity, current.velocity);
  assert.notEqual(source.velocity, current.velocity, "the source must not alias mutable velocity storage");
  near(source.position[0], current.x + Math.cos(current.yaw) * 1.2 + Math.sin(current.yaw) * 1.7);
  near(source.position[1], current.altitude + 3.1);
  near(source.position[2], LAUNCH_APPROACH - current.distance + Math.sin(current.yaw) * 1.2 - Math.cos(current.yaw) * 1.7);
  const late = { ...current, distance: 9600, yaw: 0 };
  near(makeThrowSource(late, null, 0.1).position[2], LAUNCH_APPROACH - 9600 - 1.7);
});

test("respawns, replays, phase changes and invalid timing suppress lateral and vertical momentum", () => {
  const previous = {
    ...startFlight(createFlight()), distance: 500, elapsed: 10, yaw: 0.4,
    velocity: [20, 2, -46] as [number, number, number],
  };
  const moved = {
    ...previous, x: 3, altitude: 36, distance: 505, elapsed: 10.1,
    velocity: [25, 10, -45] as [number, number, number],
  };
  const safeVelocity = [Math.sin(moved.yaw) * moved.speed / 3.6, 0, -Math.cos(moved.yaw) * moved.speed / 3.6];
  const cases = [
    { ...moved, lives: 2 },
    { ...moved, distance: 0 },
    { ...moved, distance: 10000 },
    { ...moved, x: 100 },
    { ...moved, altitude: 100 },
    { ...moved, elapsed: 0 },
    { ...moved, velocity: [Number.NaN, 0, -50] as [number, number, number] },
  ];
  for (const current of cases) {
    const source = makeThrowSource(current, previous, 0.1);
    source.velocity.forEach((value, index) => near(value, safeVelocity[index]));
  }
  for (const dt of [0, -1, Number.NaN, Infinity, 50]) {
    makeThrowSource(moved, previous, dt).velocity.forEach((value, index) => near(value, safeVelocity[index]));
  }
  assert.deepEqual(makeThrowSource({ ...moved, phase: "paused" }, previous, 0.1).velocity, [0, 0, 0]);
  makeThrowSource(moved, { ...previous, phase: "ready" }, 0.1).velocity.forEach((value, index) => near(value, safeVelocity[index]));
});

test("a forward throw follows the actual sleigh heading while retaining world momentum", () => {
  const aim = { yaw: 0, elevation: 0, power: 36 };
  const source = { position: [0, 35, 0] as [number, number, number], velocity: [10, 2, -45] as [number, number, number] };
  const turned = worldThrowAim(aim, Math.PI / 2);
  const parcel = throwPackage(createDelivery(), source, turned).packages[0];
  near(parcel.velocity[0], 46);
  near(parcel.velocity[1], 2);
  near(parcel.velocity[2], -45);
  near(worldThrowAim({ ...aim, yaw: -0.4 }, 0.7).yaw, 0.3);
  for (const yaw of [-100, -Math.PI, 0, Math.PI, 100, Number.NaN, Infinity]) {
    const result = worldThrowAim(aim, yaw);
    assert.ok(result.yaw >= -Math.PI && result.yaw <= Math.PI);
    assert.equal(result.elevation, aim.elevation);
    assert.equal(result.power, aim.power);
  }
  assert.deepEqual(aim, { yaw: 0, elevation: 0, power: 36 });
});


test("pointer target changes settle smoothly without snapping or overshooting", () => {
  const start = createAim();
  const target = pointerAim(0.05, 0.1);
  let actual = start;
  for (let frame = 0; frame < 24; frame++) {
    const next = smoothAim(actual, target, 1 / 60);
    assert.ok(next.yaw < actual.yaw && next.yaw > target.yaw);
    assert.ok(next.elevation > actual.elevation && next.elevation < target.elevation);
    if (frame === 0) assert.ok(Math.abs(next.yaw - start.yaw) < Math.abs(target.yaw - start.yaw) / 3);
    actual = next;
  }
  assert.ok(Math.abs(actual.yaw - target.yaw) < 0.01);
  assert.deepEqual(start, createAim());
});

test("aim damping is frame-rate independent and frozen during pause", () => {
  const target = pointerAim(0.9, 0.8);
  const run = (fps: number) => {
    let aim = createAim();
    for (let i = 0; i < fps / 5; i++) aim = smoothAim(aim, target, 1 / fps);
    return aim;
  };
  near(run(30).yaw, run(120).yaw);
  near(run(30).elevation, run(120).elevation);
  const start = createAim();
  for (const dt of [0, -1, Number.NaN, Infinity]) assert.deepEqual(smoothAim(start, target, dt), start);
  const safe = smoothAim(start, {yaw: Infinity, elevation: Number.NaN, power: 36}, 0.02);
  assert.ok(Object.values(safe).every(Number.isFinite));
});

test("touch dragging starts from the existing aim and clamps at the aim limits", () => {
  const start = Object.freeze(createAim());
  assert.deepEqual(dragAim(start, 0, 0), start);
  const next = dragAim(start, 0.1, -0.1);
  assert.ok(next.yaw > start.yaw && next.elevation > start.elevation);
  assert.deepEqual(dragAim(start, 100, -100), {yaw: 1.8, elevation: 0.55, power: 36});
  assert.deepEqual(dragAim(start, Number.NaN, Infinity), start);
});
