import test from "node:test";
import assert from "node:assert/strict";
import { createMotion, stepMotion } from "./motion.ts";
import type { Kinematics, MotionState } from "./motion.ts";

const idle: Kinematics = {
  lateralVelocity: 0,
  verticalVelocity: 0,
  forwardAcceleration: 0,
};
const near = (actual: number, expected: number, tolerance = 1e-10) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} differs from ${expected}`,
  );
function hold(
  input: Kinematics,
  seconds = 1,
  initial = createMotion(),
  gentle = false,
) {
  let state = initial;
  for (let frame = 0; frame < Math.round(seconds * 100); frame++)
    state = stepMotion(state, input, 0.01, gentle);
  return state;
}

test("the sleigh banks into left and right movement with a gradual response", () => {
  const initial = Object.freeze(createMotion());
  const first = stepMotion(initial, { ...idle, lateralVelocity: 60 }, 1 / 60);
  assert.ok(first.roll < 0 && first.roll > -0.36);
  assert.ok(first.sway < 0);
  assert.deepEqual(
    initial,
    createMotion(),
    "the previous motion state was mutated",
  );
  assert.notEqual(first, initial);
  const right = hold({ ...idle, lateralVelocity: 60 });
  const left = hold({ ...idle, lateralVelocity: -60 });
  assert.ok(right.roll < -0.35);
  assert.ok(left.roll > 0.35);
  near(left.roll, -right.roll);
  near(left.sway, -right.sway);
});

test("climbing raises the nose, descending lowers it, and acceleration adds a bounded pitch response", () => {
  const climb = hold({ ...idle, verticalVelocity: 32 });
  const dive = hold({ ...idle, verticalVelocity: -32 });
  assert.ok(climb.pitch > 0.25 && climb.heave > 0);
  assert.ok(dive.pitch < -0.25 && dive.heave < 0);
  near(climb.pitch, -dive.pitch);
  const accelerate = hold({ ...idle, forwardAcceleration: 20 });
  const brake = hold({ ...idle, forwardAcceleration: -20 });
  assert.ok(accelerate.pitch > 0 && accelerate.pitch < 0.051);
  assert.ok(brake.pitch < 0 && brake.pitch > -0.051);
});

test("releasing controls settles smoothly back to level", () => {
  const moving = hold({
    lateralVelocity: 60,
    verticalVelocity: 32,
    forwardAcceleration: 20,
  });
  const released = stepMotion(moving, idle, 0.01);
  assert.ok(Math.abs(released.roll) < Math.abs(moving.roll));
  assert.ok(Math.abs(released.roll) > Math.abs(moving.roll) * 0.9);
  const settled = hold(idle, 2, moving);
  for (const value of Object.values(settled))
    assert.ok(Math.abs(value) < 0.001);
});

test("pause timestamps do not move the pose and stalled frames are capped", () => {
  const state = hold({ ...idle, lateralVelocity: 60 }, 0.3);
  for (const dt of [0, -1, Number.NaN, Infinity])
    assert.equal(stepMotion(state, idle, dt), state);
  assert.deepEqual(stepMotion(state, idle, 50), stepMotion(state, idle, 0.1));
});

test("extreme movement and invalid inputs stay finite and inside the pose limits", () => {
  let state = createMotion();
  const inputs: Kinematics[] = [
    {
      lateralVelocity: Number.MAX_VALUE,
      verticalVelocity: Number.MAX_VALUE,
      forwardAcceleration: Number.MAX_VALUE,
    },
    {
      lateralVelocity: -Number.MAX_VALUE,
      verticalVelocity: -Number.MAX_VALUE,
      forwardAcceleration: -Number.MAX_VALUE,
    },
    {
      lateralVelocity: Infinity,
      verticalVelocity: Number.NaN,
      forwardAcceleration: -Infinity,
    },
  ];
  for (let frame = 0; frame < 600; frame++) {
    state = stepMotion(
      state,
      inputs[Math.floor(frame / 7) % inputs.length],
      0.1,
    );
    assert.ok(Object.values(state).every(Number.isFinite));
    for (const [key, limit] of [
      ["roll", 0.45],
      ["pitch", 0.34],
      ["sway", 0.18],
      ["heave", 0.12],
    ] as const)
      assert.ok(Math.abs(state[key]) <= limit);
  }
  assert.deepEqual(stepMotion(createMotion(), inputs[2], 0.1), createMotion());
});

test("constant movement gives the same response across equivalent frame subdivisions", () => {
  const input = {
    lateralVelocity: -41,
    verticalVelocity: 19,
    forwardAcceleration: -7,
  };
  const single = stepMotion(createMotion(), input, 0.1);
  let divided = createMotion();
  for (let frame = 0; frame < 5; frame++)
    divided = stepMotion(divided, input, 0.02);
  for (const key of Object.keys(single) as (keyof MotionState)[])
    near(single[key], divided[key]);
});

test("gentle mode reduces movement without changing its direction", () => {
  const input = {
    lateralVelocity: 60,
    verticalVelocity: 32,
    forwardAcceleration: 20,
  };
  const normal = hold(input);
  const gentle = hold(input, 1, createMotion(), true);
  for (const key of Object.keys(normal) as (keyof MotionState)[])
    near(gentle[key], normal[key] * 0.25);
});
