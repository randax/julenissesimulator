import test from "node:test";
import assert from "node:assert/strict";
import { createDelivery, throwPackage, stepDelivery, predictThrow, scoreForDistance, distanceToHouse, PACKAGE_RADIUS, MAX_IN_FLIGHT, type DeliveryState, type Parcel, type ThrowSource, } from "./delivery.ts";
import type { DeliveryTarget } from "./houses.ts";
import type { Vec3 } from "./geometry.ts";
const calm = { x: 0, z: 0 };
const flat = () => 0;
const source: ThrowSource = { position: [0, 35, 0], velocity: [0, 0, -30] };
const aim = { yaw: 0.6, elevation: -0.35, power: 40 };
const house = (overrides: Partial<DeliveryTarget> = {}): DeliveryTarget => ({
  id: "cottage", localId: 0, tile: 0, distance: 60, side: 1,
  x: 0, y: 0, z: -60, width: 20, depth: 18, height: 30, yaw: 0, ...overrides,
});
function injected(position: Vec3, velocity: Vec3, extra: Partial<Parcel> = {}): DeliveryState {
  return { ...createDelivery(), thrown: 1, nextId: 2,
    packages: [{ id: 1, position, velocity, age: 0, landed: false, bounces: 0, ...extra }] };
}

function finish(state: DeliveryState, targets: readonly DeliveryTarget[] = [], dt = 1 / 60, wind = calm): DeliveryState {
  for (let i = 0; state.packages.some((p) => !p.landed) && i < Math.ceil(15 / dt); i++) {
    state = stepDelivery(state, wind, dt, targets, flat);
  }
  assert.ok(state.packages.every((p) => p.landed), "every parcel must resolve");
  return state;
}

const near = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);

test("launch inherits every component of sleigh momentum and clamps the aimed impulse", () => {
  const state = throwPackage(createDelivery(), { position: [1, 35, 4], velocity: [8, 3, -80] }, { yaw: Math.PI / 2, elevation: 0, power: 500 });
  assert.deepEqual(state.packages[0].position, [1, 35, 4]);
  near(state.packages[0].velocity[0], 68);
  near(state.packages[0].velocity[1], 3);
  near(state.packages[0].velocity[2], -80);
  assert.equal(state.thrown, 1);
  assert.equal(state.nextId, 2);
});

test("free flight uses exact gravity and exponential air drag", () => {
  const next = stepDelivery(injected([0, 100, 0], [12, 5, -30]), calm, 0.1, [], flat).packages[0];
  near(next.position[1], 100 + 5 * 0.1 - 9.81 * 0.1 ** 2 / 2);
  near(next.velocity[1], 5 - 9.81 * 0.1);
  near(next.position[0], 12 * (1 - Math.exp(-0.008)) / 0.08);
  near(next.velocity[2], -30 * Math.exp(-0.008));
});

test("faster sleighs require a shorter release window to land near the same house", () => {
  const landings = [20, 100].map((speed) => predictThrow({ position: [0, 35, 0], velocity: [0, 0, -speed] }, { yaw: Math.PI / 2, elevation: -0.5, power: 40 }, calm, [], flat).landing!);
  assert.ok(landings[1][2] < landings[0][2] - 80);
  const timingWindow = (speed: number) => {
    const target = house({ x: landings[speed === 20 ? 0 : 1][0], z: landings[speed === 20 ? 0 : 1][2], width: 1, depth: 1 });
    return Array.from({ length: 81 }, (_, i) => (i - 40) * 0.01).filter((delay) => {
      const landing = predictThrow({ position: [0, 35, -speed * delay], velocity: [0, 0, -speed] }, { yaw: Math.PI / 2, elevation: -0.5, power: 40 }, calm, [], flat).landing!;
      return distanceToHouse(landing, target) <= 2;
    }).length;
  };
  assert.ok(timingWindow(100) < timingWindow(20) / 2);
});

test("aim angle, charge, inherited vertical velocity and weather alter the landing", () => {
  const base = predictThrow(source, aim, calm, [], flat).landing!;
  const strong = predictThrow(source, { ...aim, power: 58 }, calm, [], flat).landing!;
  const wind = predictThrow(source, aim, { x: 24, z: 0 }, [], flat).landing!;
  const climbing = predictThrow({ ...source, velocity: [0, 12, -30] }, aim, calm, [], flat).landing!;
  const turned = predictThrow(source, { ...aim, yaw: -0.6 }, calm, [], flat).landing!;
  assert.ok(strong[0] > base[0]);
  assert.ok(wind[0] > base[0]);
  assert.ok(climbing[2] < base[2]);
  assert.ok(turned[0] < 0);
  near(base[1], PACKAGE_RADIUS);
});

test("scores decrease smoothly to zero at thirty metres from the oriented footprint", () => {
  assert.equal(scoreForDistance(0), 1000);
  assert.equal(scoreForDistance(15), 250);
  assert.equal(scoreForDistance(30), 0);
  assert.equal(scoreForDistance(Infinity), 0);
  for (let d = 0; d < 30; d += 0.1)
    assert.ok(scoreForDistance(d) >= scoreForDistance(d + 0.1));
  const target = house({ x: 0, z: 0, width: 20, depth: 10, yaw: Math.PI / 2 });
  near(distanceToHouse([6 + PACKAGE_RADIUS, 100, 0], target), 1);
  near(distanceToHouse([0, 100, 10 + PACKAGE_RADIUS], target), 0);
});

test("only improvements add points, and each sufficiently close house counts once", () => {
  const target = house({ z: 0 });
  let state = createDelivery();
  const drop = (distance: number) => {
    const id = state.nextId;
    state = { ...state, nextId: id + 1, packages: [...state.packages,
        { id, position: [target.width / 2 + PACKAGE_RADIUS + distance, PACKAGE_RADIUS + 0.001, 0],
          velocity: [0, -1, 0], age: 0, landed: false, bounces: 0 }] };
    state = stepDelivery(state, calm, 0.02, [target], flat);
  };
  drop(15);
  assert.equal(state.score, 250);
  assert.equal(state.deliveries, 0);
  drop(5);
  assert.equal(state.score, scoreForDistance(5));
  assert.equal(state.deliveries, 1);
  drop(8);
  assert.equal(state.lastLanding!.awarded, 0);
  assert.equal(state.score, scoreForDistance(5));
  drop(0);
  assert.equal(state.score, 1000);
  drop(0);
  assert.equal(state.score, 1000);
  assert.equal(state.deliveries, 1);
});

test("descending roof impacts stop on the roof and earn a perfect delivery", () => {
  const target = house({ z: 0 });
  const state = finish(injected([0, 55, 0], [0, -8, 0]), [target]);
  const parcel = state.packages[0];
  assert.ok(parcel.position[1] > 20 && parcel.position[1] < 35);
  // The rendered ridge is height + 1.25m of snow + 0.13m variation, with a slight Z slope.
  near(parcel.position[1], 30 + 1.25 + 0.13 + PACKAGE_RADIUS * Math.hypot(1, 0.09), 0.0001);
  assert.ok(parcel.surfaceNormal![1] > 0.2);
  assert.equal(state.score, 1000);
  assert.equal(state.lastLanding!.distance, 0);
});

test("fast wall impacts bounce instead of tunnelling or sticking above the ground", () => {
  const target = house({ z: 0, yaw: 0.32 });
  let state = injected([-25, 8, 0], [170, 0, 0]);
  let bounced = false;
  for (let i = 0; i < 50 && !state.packages[0].landed; i++) {
    state = stepDelivery(state, calm, 0.1, [target], flat);
    if (state.packages[0].bounces > 0)
      bounced = true;
  }
  assert.ok(bounced);
  assert.ok(state.packages[0].landed);
  near(state.packages[0].position[1], PACKAGE_RADIUS);
  assert.ok(state.packages[0].position[0] < 0);
});

test("prediction and actual constant-weather flight agree across frame rates", () => {
  const weather = { x: 13, z: -4 };
  const prediction = predictThrow(source, aim, weather, [], flat);
  const slow = finish(throwPackage(createDelivery(), source, aim), [], 1 / 30, weather);
  const fast = finish(throwPackage(createDelivery(), source, aim), [], 1 / 120, weather);
  for (let axis = 0; axis < 3; axis++) {
    near(slow.packages[0].position[axis], fast.packages[0].position[axis], 0.0001);
    near(slow.packages[0].position[axis], prediction.landing![axis], 0.0001);
  }
});

test("roof and wall collision outcomes stay stable across frame rates", () => {
  const targets = [house({ z: 0, yaw: 0.2 })];
  for (const [position, velocity] of [
    [[3, 55, 0], [3, -8, 0]], [[-25, 8, 0], [170, 0, 0]],
  ] as [
    Vec3,
    Vec3
  ][]) {
    const slow = finish(injected(position, velocity), targets, 1 / 30);
    const fast = finish(injected(position, velocity), targets, 1 / 120);
    for (let axis = 0; axis < 3; axis++)
      near(slow.packages[0].position[axis], fast.packages[0].position[axis], 0.01);
    assert.equal(slow.score, fast.score);
    assert.equal(slow.deliveries, fast.deliveries);
  }
});

test("cooldown and active limits bound throws, while old decorations expire", () => {
  let state = throwPackage(createDelivery(), source, aim);
  assert.equal(throwPackage(state, source, aim), state);
  for (let i = 0; i < 5; i++)
    state = stepDelivery(state, calm, 0.1, [], flat);
  assert.equal(throwPackage(state, source, aim).thrown, 2);
  const active = Array.from({ length: MAX_IN_FLIGHT }, (_, id) => ({ ...state.packages[0], id, landed: false }));
  const full = { ...state, packages: active, cooldown: 0 };
  assert.equal(throwPackage(full, source, aim), full);
  const old = injected([0, PACKAGE_RADIUS, 0], [0, 0, 0], { landed: true, age: 13, landedAt: 0 });
  assert.equal(stepDelivery(old, calm, 0.1, [], flat).packages.length, 0);
  const many = { ...old, packages: Array.from({ length: 40 }, (_, id) => ({ ...old.packages[0], id, age: 1, landedAt: 0 })) };
  assert.equal(stepDelivery(many, calm, 0.1, [], flat).packages.length, 24);
});

test("pause, invalid inputs and flight timeout remain finite and resolve", () => {
  const state = createDelivery();
  assert.equal(stepDelivery(state, calm, 0), state);
  assert.equal(stepDelivery(state, calm, NaN), state);
  const bad = throwPackage(state, { position: [NaN, Infinity, 0], velocity: [Infinity, NaN, 0] }, { yaw: NaN, power: NaN, elevation: Infinity });
  assert.ok(bad.packages[0].position.every(Number.isFinite));
  assert.ok(bad.packages[0].velocity.every(Number.isFinite));
  const timeout = finish(injected([0, 2000, 0], [0, 100, -20]), [], 0.1);
  near(timeout.packages[0].position[1], PACKAGE_RADIUS);
  assert.ok(timeout.packages[0].age < 14.2);
});

test("prediction shares the exact timeout endpoint with live simulation", () => {
  const high = { position: [0, 2000, 0] as Vec3, velocity: [4, 100, -90] as Vec3 };
  const prediction = predictThrow(high, aim, calm, [], flat);
  const actual = finish(throwPackage(createDelivery(), high, aim), [], 1 / 120);
  for (let axis = 0; axis < 3; axis++) near(actual.packages[0].position[axis], prediction.landing![axis], 0.0001);
});
