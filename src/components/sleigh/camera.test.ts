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
