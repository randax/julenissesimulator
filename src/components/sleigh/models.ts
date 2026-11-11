import {
  MeshBuilder,
  colour,
  part,
  type ModelPart,
  type Vec3,
} from "./geometry.ts";

import { createPassenger, type PassengerRig } from "./characters.ts";
import { createCarriage } from "./carriage.ts";
import { createMotion, stepMotion, type Kinematics } from "./motion.ts";

const fur = colour(0x9f8769),
  cream = colour(0xd5c8aa),
  dark = colour(0x302d28),
  gold = colour(0xc59b50);
function mesh(build: (m: MeshBuilder) => void, position: Vec3 = [0, 0, 0]) {
  const m = new MeshBuilder();
  build(m);
  return part(m.build(), position);
}
function chain(m: MeshBuilder, points: Vec3[], radius: number, tint = gold) {
  for (let i = 1; i < points.length; i++)
    m.rod(points[i - 1], points[i], radius, tint);
}

interface Deer {
  root: ModelPart;
  body: ModelPart;
  head: ModelPart;
  legs: { hip: ModelPart; knee: ModelPart }[];
  phase: number;
}
function reindeer(position: Vec3, phase: number): Deer {
  const body = mesh((m) => {
    m.ellipsoid([0, 2.6, 0], [0.84, 1.05, 1.7], fur, 18, 11);
    m.ellipsoid([0, 2.6, 1.16], [0.73, 0.84, 0.72], cream);
    m.ellipsoid([0, 2.78, 1.85], [0.19, 0.35, 0.24], cream);
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2;
      m.ellipsoid(
        [Math.cos(a) * 0.57, 2.57 + Math.sin(a) * 0.61, 1.64],
        [0.11, 0.2, 0.15],
        i % 3 ? cream : colour(0xc4b38e),
        7,
        5,
      );
    }
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++) {
        m.ellipsoid(
          [side * (0.43 - i * 0.025), 2.9 + i * 0.19, -1.4 - i * 0.045],
          [0.1, 0.27, 0.16],
          colour(0xb5a17e),
          7,
          5,
        );
      }
    m.ellipsoid([0, 3.35, -1.3], [0.53, 1.2, 0.63], fur);
    m.ellipsoid([0, 2.5, -1.12], [0.65, 0.82, 0.65], colour(0xbaa385));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2,
        b = ((i + 1) / 18) * Math.PI * 2;
      m.rod(
        [Math.cos(a) * 0.85, 2.62 + Math.sin(a) * 1.02, -0.4],
        [Math.cos(b) * 0.85, 2.62 + Math.sin(b) * 1.02, -0.4],
        0.075,
        dark,
      );
    }
    for (const side of [-1, 1]) {
      m.rod([side * 0.65, 3.1, -1.1], [side * 0.5, 2.05, -1.1], 0.09, dark);
      m.ellipsoid([side * 0.52, 2.35, -1.4], [0.14, 0.17, 0.14], gold, 8, 5);
    }
  });
  const head = mesh(
    (m) => {
      m.ellipsoid([0, 0, 0], [0.46, 0.61, 0.69], fur, 16, 10);
      m.ellipsoid([0, -0.21, -0.64], [0.34, 0.31, 0.6], colour(0xb49b7a));
      m.ellipsoid([0, -0.2, -1.14], [0.3, 0.2, 0.16], dark);
      for (const side of [-1, 1]) {
        m.ellipsoid([side * 0.59, 0.32, 0.06], [0.47, 0.13, 0.24], fur);
        m.ellipsoid([side * 0.42, 0.05, -0.3], [0.065, 0.085, 0.08], dark);
        const points: Vec3[] = [
          [side * 0.25, 0.48, 0.15],
          [side * 0.52, 1.0, 0.23],
          [side * 1.0, 1.55, 0.25],
          [side * 1.45, 2.12, 0.08],
          [side * 1.6, 2.65, -0.05],
        ];
        for (let i = 1; i < points.length; i++)
          m.rod(
            points[i - 1],
            points[i],
            0.11 - i * 0.015,
            colour(0x7d6f57),
            7,
            0.09 - i * 0.015,
          );
        for (let j = 1; j < 4; j++) {
          const p = points[j];
          chain(
            m,
            [
              p,
              [p[0] + side * 0.52, p[1] + 0.12, p[2] - 0.25],
              [p[0] + side * 0.68, p[1] + 0.58, p[2] - 0.4],
            ],
            0.055,
            colour(0x8e7e61),
          );
          chain(
            m,
            [
              p,
              [p[0] - side * 0.1, p[1] + 0.32, p[2] + 0.25],
              [p[0] - side * 0.25, p[1] + 0.65, p[2] + 0.28],
            ],
            0.045,
            colour(0x8e7e61),
          );
        }
      }
    },
    [0, 4.55, -1.72],
  );
  body.children.push(head);
  const legs: Deer["legs"] = [];
  for (const side of [-1, 1])
    for (const front of [-1, 1]) {
      const knee = mesh(
        (m) => {
          m.rod([0, 0, 0], [0, -1.05, -0.05], 0.105, fur);
          m.box([0, -1.12, -0.12], [0.32, 0.3, 0.43], dark);
        },
        [0, -0.95, 0],
      );
      const hip = mesh(
        (m) => {
          m.ellipsoid([0, -0.4, 0], [0.22, 0.66, 0.25], fur);
          m.rod([0, 0, 0], [0, -0.95, 0], 0.15, fur);
        },
        [side * 0.55, 2.2, front * 1.05],
      );
      hip.children.push(knee);
      body.children.push(hip);
      legs.push({ hip, knee });
    }
  return { root: part(null, position, [body]), body, head, legs, phase };
}

export interface SleighRig {
  root: ModelPart;
  carriage: ModelPart;
  passengers: readonly PassengerRig[];
  reset: (time?: number) => void;
  update: (
    time: number,
    speed: number,
    bank: number,
    flying: boolean,
    gentle: boolean,
    movement?: Kinematics,
  ) => void;
}
export function createSleighRig(): SleighRig {
  const carriage = createCarriage();
  const julius = createPassenger(true, [-1.05, 2.0, -0.4]),
    helper = createPassenger(false, [1.05, 2.0, -0.4]);
  carriage.children.push(julius.root, helper.root);
  const team = [
    reindeer([-4.5, 0.4, -17], 0),
    reindeer([4.5, 0.4, -17], 1.7),
    reindeer([0, 0.6, -23], 0.8),
  ];
  const reins = mesh((m) => {
    for (const [x, z] of [
      [-4.5, -17],
      [4.5, -17],
      [0, -23],
    ])
      for (const side of [-1, 1])
        chain(
          m,
          [
            [side * 1.4, 2.8, -1.5],
            [side * 1.8, 2.0, -6],
            [x + side * 0.58, 2.4, z + 1],
            [x + side * 0.58, 3.0, z - 0.4],
          ],
          0.045,
          dark,
        );
  });
  const root = part(
    null,
    [0, 0, 0],
    [carriage, reins, ...team.map((deer) => deer.root)],
  );
  let gaitTime = 0,
    lastTime = 0,
    motion = createMotion();
  return {
    root,
    carriage,
    passengers: [julius, helper],
    reset(time = 0) {
      motion = createMotion();
      gaitTime = 0;
      lastTime = time;
      root.rotation = [0, 0, 0];
      carriage.position = [0, 0, 0];
    },
    update(time, speed, bank, flying, gentle, movement) {
      const dt = Math.max(0, Math.min(0.1, time - lastTime));
      const input = movement ?? {
        lateralVelocity: flying ? (-bank / 0.3) * 60 : 0,
        verticalVelocity: 0,
        forwardAcceleration: 0,
      };
      motion = stepMotion(motion, input, dt, gentle);
      const cadence = flying ? 5.8 + speed * 0.012 : 1.6;
      if (time < lastTime) gaitTime = 0;
      gaitTime += Math.max(0, Math.min(0.1, time - lastTime)) * cadence;
      lastTime = time;
      root.rotation[0] = motion.pitch;
      root.rotation[2] = motion.roll;
      carriage.position[0] = motion.sway;
      carriage.position[1] =
        motion.heave + (gentle ? 0 : Math.sin(time * 2.5) * 0.025);
      carriage.rotation[0] = gentle ? 0 : Math.sin(time * 3.2) * 0.006;
      carriage.rotation[2] = gentle ? 0 : Math.sin(time * 2.1) * 0.008;
      for (const passenger of [julius, helper]) {
        passenger.torso.rotation[0] = -motion.pitch * 0.2;
        passenger.torso.rotation[2] = -motion.roll * 0.28;
        passenger.head.rotation[0] =
          -motion.pitch * 0.65 + (gentle ? 0 : Math.sin(time * 1.8) * 0.008);
        passenger.head.rotation[1] = 0;
        passenger.head.rotation[2] = -motion.roll * 0.6;
        passenger.leftArm.rotation[0] = motion.pitch * 0.12;
        passenger.rightArm.rotation[0] = motion.pitch * 0.12;
        passenger.leftArm.rotation[2] = motion.roll * 0.08;
        passenger.rightArm.rotation[2] = motion.roll * 0.08;
        if (passenger.scarf)
          passenger.scarf.rotation[0] =
            (gentle ? 0.25 : 1) *
            (-Math.min(speed / 230, 1.5) * 0.12 + Math.sin(time * 5.2) * 0.035);
      }
      for (const deer of team) {
        const cycle = gaitTime + deer.phase;
        deer.body.position[1] = Math.sin(cycle * 2) * 0.16;
        deer.body.rotation[0] = Math.sin(cycle) * 0.025;
        deer.head.rotation[0] = Math.sin(cycle + 0.6) * 0.07;
        deer.head.rotation[2] = Math.sin(cycle * 0.5) * 0.035;
        deer.legs.forEach(({ hip, knee }, index) => {
          const gait = cycle + (index === 0 || index === 3 ? 0 : Math.PI);
          hip.rotation[0] = Math.sin(gait) * 0.72;
          knee.rotation[0] = 0.2 + Math.max(0, Math.sin(gait + 1.0)) * 0.9;
        });
        deer.root.rotation[2] = -motion.roll * 0.15;
        deer.root.rotation[0] = -motion.pitch * 0.12;
      }
    },
  };
}
