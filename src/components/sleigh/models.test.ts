import test from "node:test";
import assert from "node:assert/strict";
import { createSleighRig } from "./models.ts";
import type { ModelPart } from "./geometry.ts";

function deerBodies(root: ModelPart) {
  const deer = root.children.filter((child) => child.position[2] < -10);
  assert.equal(
    deer.length,
    3,
    "the sleigh should have a team of three reindeer",
  );
  return deer.map((animal) => animal.children[0]);
}
function joints(root: ModelPart) {
  return deerBodies(root).map((body) => {
    const hips = body.children.filter((child) => child.children.length === 1);
    assert.equal(hips.length, 4, "each reindeer needs four articulated legs");
    return hips.flatMap((hip) => [hip, hip.children[0]]);
  });
}
const gaitPose = (root: ModelPart) =>
  joints(root).map((animal) => animal.map((joint) => [...joint.rotation]));
const allNodes = (root: ModelPart): ModelPart[] => [
  root,
  ...root.children.flatMap(allNodes),
];

test("the sleigh carries two passengers and a complete finite three-reindeer model", () => {
  const { root } = createSleighRig();
  assert.equal(
    root.children[0].children.length,
    2,
    "both Julius and his helper must be in the carriage",
  );
  joints(root);
  for (const node of allNodes(root)) {
    assert.ok(node.position.every(Number.isFinite));
    assert.ok(node.rotation.every(Number.isFinite));
    if (node.mesh) assert.ok(node.mesh.every(Number.isFinite));
  }
});

test("flight animation changes hip and knee articulation, with distinct team phases", () => {
  const rig = createSleighRig();
  rig.update(0, 230, 0, true, false);
  const before = gaitPose(rig.root);
  rig.update(0.08, 230, 0, true, false);
  const after = gaitPose(rig.root);
  assert.notDeepEqual(after, before);
  after.forEach((animal, index) => {
    assert.ok(
      animal.some(
        (rotation, joint) =>
          Math.abs(rotation[0] - before[index][joint][0]) > 0.1,
      ),
    );
    assert.notDeepEqual(
      animal,
      after[(index + 1) % after.length],
      "the entire team must not move in lockstep",
    );
  });
});

test("a frozen animation timestamp preserves the pose when the flight pauses", () => {
  const rig = createSleighRig();
  rig.update(0.1, 230, 0.1, true, false);
  const before = allNodes(rig.root).map((node) => ({
    position: [...node.position],
    rotation: [...node.rotation],
  }));
  rig.update(0.1, 230, 0.1, true, false);
  assert.deepEqual(
    allNodes(rig.root).map((node) => ({
      position: [...node.position],
      rotation: [...node.rotation],
    })),
    before,
  );
});

test("changing speed updates cadence without teleporting the leg pose", () => {
  const rig = createSleighRig();
  for (let frame = 0; frame <= 300; frame++)
    rig.update(frame / 10, 230, 0, true, false);
  const before = gaitPose(rig.root);
  rig.update(30, 340, 0, true, false);
  assert.deepEqual(
    gaitPose(rig.root),
    before,
    "speed alone must not move joints at a frozen timestamp",
  );
  rig.update(30.01, 340, 0, true, false);
  const after = gaitPose(rig.root);
  after.forEach((animal, index) =>
    animal.forEach((rotation, joint) => {
      assert.ok(
        Math.abs(rotation[0] - before[index][joint][0]) < 0.2,
        "a single short frame caused a large animation jump",
      );
    }),
  );
});

test("animation is consistent across equivalent frame subdivisions", () => {
  const single = createSleighRig(),
    subdivided = createSleighRig();
  single.update(0, 230, 0, true, false);
  subdivided.update(0, 230, 0, true, false);
  single.update(0.1, 230, 0, true, false);
  for (const time of [0.02, 0.04, 0.06, 0.08, 0.1])
    subdivided.update(time, 230, 0, true, false);
  const a = gaitPose(single.root),
    b = gaitPose(subdivided.root);
  a.forEach((animal, deer) =>
    animal.forEach((rotation, joint) =>
      rotation.forEach((value, axis) => {
        assert.ok(Math.abs(value - b[deer][joint][axis]) < 1e-10);
      }),
    ),
  );
});

import {
  identity,
  multiply,
  normalize,
  point,
  STRIDE,
  transform,
  type Vec3,
} from "./geometry.ts";

function directionThrough(parts: ModelPart[], local: Vec3): Vec3 {
  const matrix = parts.reduce(
    (parent, node) => multiply(parent, transform(node.position, node.rotation)),
    identity(),
  );
  const origin = point(matrix, [0, 0, 0]),
    end = point(matrix, local);
  return normalize(end.map((value, axis) => value - origin[axis]) as Vec3);
}

test("both passengers keep looking forward through idle, turns, climbs and descents", () => {
  const rig = createSleighRig();
  const scenarios = [
    { flying: false, bank: 0, lateralVelocity: 0, verticalVelocity: 0 },
    { flying: true, bank: 0, lateralVelocity: 0, verticalVelocity: 0 },
    { flying: true, bank: 0.3, lateralVelocity: -60, verticalVelocity: 0 },
    { flying: true, bank: -0.3, lateralVelocity: 60, verticalVelocity: 0 },
    { flying: true, bank: 0, lateralVelocity: 0, verticalVelocity: 32 },
    { flying: true, bank: 0, lateralVelocity: 0, verticalVelocity: -32 },
  ];
  let time = 0;
  for (const scenario of scenarios) {
    for (let frame = 0; frame < 15; frame++) {
      time += 1 / 30;
      rig.update(
        time,
        scenario.flying ? 230 : 0,
        scenario.bank,
        scenario.flying,
        false,
        {
          lateralVelocity: scenario.lateralVelocity,
          verticalVelocity: scenario.verticalVelocity,
          forwardAcceleration: 0,
        },
      );
      for (const passenger of rig.passengers) {
        const gaze = directionThrough(
          [
            rig.root,
            rig.carriage,
            passenger.root,
            passenger.torso,
            passenger.head,
          ],
          [0, 0, -1],
        );
        assert.ok(
          gaze[2] < -0.98,
          "a passenger turned toward the camera instead of following the flight path",
        );
        assert.ok(Math.abs(gaze[0]) < 0.15 && Math.abs(gaze[1]) < 0.15);
      }
    }
  }
});

test("the rendered sleigh banks and pitches with movement, then resets to neutral", () => {
  for (const movement of [
    { lateralVelocity: 60, verticalVelocity: 0, rollSign: -1, pitchSign: 0 },
    { lateralVelocity: -60, verticalVelocity: 0, rollSign: 1, pitchSign: 0 },
    { lateralVelocity: 0, verticalVelocity: 32, rollSign: 0, pitchSign: 1 },
    { lateralVelocity: 0, verticalVelocity: -32, rollSign: 0, pitchSign: -1 },
  ]) {
    const rig = createSleighRig();
    for (let frame = 1; frame <= 18; frame++) {
      rig.update(frame / 60, 230, 0, true, false, {
        ...movement,
        forwardAcceleration: 0,
      });
    }
    const right = directionThrough([rig.root, rig.carriage], [1, 0, 0]);
    const forward = directionThrough([rig.root, rig.carriage], [0, 0, -1]);
    if (movement.rollSign) {
      assert.ok(rig.root.rotation[2] * movement.rollSign > 0.05);
      assert.ok(
        right[1] * movement.rollSign > 0.05,
        "the carriage's visible bank opposed the requested turn",
      );
    }
    if (movement.pitchSign) {
      assert.ok(rig.root.rotation[0] * movement.pitchSign > 0.05);
      assert.ok(
        forward[1] * movement.pitchSign > 0.05,
        "the carriage's nose tilted against the vertical movement",
      );
    }
    rig.reset(1);
    assert.deepEqual(rig.root.rotation, [0, 0, 0]);
    assert.deepEqual(rig.carriage.position, [0, 0, 0]);
    rig.update(1 + 1 / 60, 0, 0, false, false, {
      lateralVelocity: 0,
      verticalVelocity: 0,
      forwardAcceleration: 0,
    });
    assert.deepEqual(
      rig.root.rotation,
      [0, 0, 0],
      "stored spring momentum survived the reset",
    );
  }
});

test("both heads place their blue goggle lenses on the forward side of the face", () => {
  const rig = createSleighRig();
  for (const passenger of rig.passengers) {
    assert.ok(passenger.head.mesh);
    const lenses: Vec3[] = [];
    for (
      let offset = 0;
      offset < passenger.head.mesh.length;
      offset += STRIDE
    ) {
      const mesh = passenger.head.mesh,
        red = mesh[offset + 6],
        green = mesh[offset + 7],
        blue = mesh[offset + 8];
      // Blue glass is visually distinct from the skin, brass rims and leather cap.
      if (blue > red * 1.2 && green > red * 1.1)
        lenses.push([mesh[offset], mesh[offset + 1], mesh[offset + 2]]);
    }
    assert.ok(lenses.length > 0, "the head has no blue flight goggles");
    assert.ok(
      lenses.every((vertex) => vertex[2] < -0.35),
      "a goggle lens was authored on the back of the head",
    );
    assert.ok(lenses.some((vertex) => vertex[0] < -0.2));
    assert.ok(lenses.some((vertex) => vertex[0] > 0.2));
  }
});
