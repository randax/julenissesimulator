import test from "node:test";
import assert from "node:assert/strict";
import { cameraPose } from "./camera.ts";
import { lookAt, point } from "./geometry.ts";
import type { Vec3 } from "./geometry.ts";

const flight = { phase: "flying" as const, x: 0, altitude: 35, distance: 180 };

function rearView(eye: Vec3, target: Vec3, x: number, distance: number) {
  assert.equal(eye[0], x, "camera must be on the sleigh centerline");
  assert.equal(target[0], x, "view must aim straight forward");
  assert.ok(eye[2] > -distance, "camera must be behind the rear of the sleigh");
  assert.ok(target[2] < -distance, "camera must look toward the reindeer");
  const view = lookAt(eye, target);
  const left = point(view, [x - 2.6, 37, -distance + 3.3]);
  const right = point(view, [x + 2.6, 37, -distance + 3.3]);
  assert.ok(
    Math.abs(left[0] + right[0]) < 1e-5,
    "rear board must be horizontally symmetric",
  );
}

test("flight starts directly behind the sleigh on desktop and mobile", () => {
  for (const narrow of [false, true]) {
    const pose = cameraPose(flight, narrow, null, 1 / 60);
    rearView(pose.eye, pose.target, flight.x, flight.distance);
    assert.equal(pose.shift, 0);
  }
});

test("takeoff removes the angled preview immediately", () => {
  const preview = cameraPose(
    { ...flight, phase: "ready", distance: 0 },
    false,
    null,
    0,
  );
  assert.notEqual(preview.eye[0], flight.x);
  const pose = cameraPose(
    { ...flight, distance: 0 },
    false,
    preview.eye,
    1 / 60,
  );
  rearView(pose.eye, pose.target, 0, 0);
});

test("steering never lets the flight camera drift to the side", () => {
  let previous = cameraPose(flight, false, null, 0).eye;
  for (const x of [10, 55, -30, -100, 0]) {
    const pose = cameraPose({ ...flight, x }, false, previous, 1 / 60);
    rearView(pose.eye, pose.target, x, flight.distance);
    previous = pose.eye;
  }
});


test("banked turns keep the chase camera centered on the sleigh's actual rear axis", () => {
  for (const narrow of [false, true]) {
    let previous = cameraPose(flight, narrow, null, 0).eye;
    for (const yaw of [0.2, 0.7, 1.2, -0.4, -1.1, 0]) {
      const state = { ...flight, x: 32, altitude: 60, distance: 500, yaw };
      const pose = cameraPose(state, narrow, previous, 1 / 60);
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const eyeOffset = [pose.eye[0] - state.x, pose.eye[2] + state.distance];
      const targetOffset = [pose.target[0] - state.x, pose.target[2] + state.distance];
      assert.ok(-sin * eyeOffset[0] + cos * eyeOffset[1] > 0, "camera must remain behind");
      assert.ok(sin * targetOffset[0] - cos * targetOffset[1] > 0, "camera must look forward");
      assert.ok(Math.abs(cos * eyeOffset[0] + sin * eyeOffset[1]) < 1e-9, "camera drifts sideways");
      assert.ok(Math.abs(cos * targetOffset[0] + sin * targetOffset[1]) < 1e-9, "target drifts sideways");
      const view = lookAt(pose.eye, pose.target);
      const rearCorner = (side: number): Vec3 => [
        state.x - sin * 3.3 + cos * side * 2.6,
        state.altitude + 2,
        -state.distance + cos * 3.3 + sin * side * 2.6,
      ];
      const left = point(view, rearCorner(-1)), right = point(view, rearCorner(1));
      assert.ok(Math.abs(left[0] + right[0]) < 1e-4, "rear board must stay symmetric while turning");
      assert.equal(pose.shift, 0);
      previous = pose.eye;
    }
  }
});

test("invalid heading and frozen timing leave a finite, bounded rear view", () => {
  const previous: Vec3 = [1000, 80, 1000];
  for (const yaw of [Number.NaN, Infinity, -Infinity]) {
    const pose = cameraPose({ ...flight, yaw }, false, previous, Number.NaN);
    assert.ok(pose.eye.every(Number.isFinite));
    assert.ok(pose.target.every(Number.isFinite));
    assert.equal(pose.eye[0], flight.x);
    assert.ok(pose.eye[2] + flight.distance <= 45);
  }
});
