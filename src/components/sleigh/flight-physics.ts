import type { Vec3 } from "./geometry.ts";

export interface FlightBody {
  velocity: Vec3;
  /** Clockwise course from -Z. Positive yaw points toward +X. */
  yaw: number;
  /** Nose-up angle. */
  pitch: number;
  /** Right turns use negative Z roll on the -Z-facing sleigh. */
  bank: number;
  yawRate: number;
}
export interface FlightForcing {
  steer: number;
  climb: number;
  /** Trim airspeed in metres per second. */
  targetSpeed: number;
}
export interface FlightWind { x: number; z: number }

export const FLIGHT_GRAVITY = 9.81;
const DRAG = 0.004;
const MAX_YAW = 1.25;
const STEP = 1 / 240;
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;
const response = (value: number, target: number, frequency: number, dt: number) =>
  target + (value - target) * Math.exp(-frequency * dt);

/**
 * Force-based flight for a magical, lift-trimmed sleigh. Reindeer provide thrust
 * and sustained lift; bank supplies centripetal acceleration, while air-relative
 * quadratic drag and sideslip damping retain inertia without instant strafing.
 */
export function stepFlightBody(
  initial: FlightBody,
  controls: FlightForcing,
  seconds: number,
  wind: FlightWind = { x: 0, z: 0 },
): FlightBody & { displacement: Vec3 } {
  const body: FlightBody = {
    velocity: initial.velocity.map((value) => finite(value)) as Vec3,
    yaw: clamp(finite(initial.yaw), -MAX_YAW, MAX_YAW),
    pitch: clamp(finite(initial.pitch), -0.4, 0.4),
    bank: clamp(finite(initial.bank), -0.65, 0.65),
    yawRate: clamp(finite(initial.yawRate), -0.6, 0.6),
  };
  const displacement: Vec3 = [0, 0, 0];
  const duration = clamp(finite(seconds), 0, 0.1);
  const steer = clamp(finite(controls.steer), -1, 1);
  const climb = clamp(finite(controls.climb), -1, 1);
  const targetSpeed = clamp(finite(controls.targetSpeed, 230 / 3.6), 0, 110);
  const air = [clamp(finite(wind.x), -30, 30), 0, clamp(finite(wind.z), -30, 30)];
  const steps = Math.max(1, Math.ceil(duration / STEP - 1e-9));
  const dt = duration / steps;
  for (let index = 0; index < steps; index++) {
    const relative: Vec3 = [body.velocity[0] - air[0], body.velocity[1], body.velocity[2] - air[2]];
    const airspeed = Math.hypot(relative[0], relative[2]);
    const authority = clamp(airspeed / 45, 0.35, 1.4);
    body.bank = response(body.bank, -steer * 0.58, 3.2 * authority, dt);
    body.pitch = response(body.pitch, climb * 0.32, 3.4 * authority, dt);
    const turn = -FLIGHT_GRAVITY * Math.tan(body.bank) / Math.max(airspeed, 22) * 1.85;
    body.yawRate = response(body.yawRate, turn, 3.4, dt);
    const oldYaw = body.yaw;
    body.yaw = clamp(body.yaw + body.yawRate * dt, -MAX_YAW, MAX_YAW);
    const actualTurnRate = dt ? (body.yaw - oldYaw) / dt : 0;
    if (body.yaw !== oldYaw + body.yawRate * dt) body.yawRate = actualTurnRate;
    const forward: Vec3 = [Math.sin(body.yaw), 0, -Math.cos(body.yaw)];
    const right: Vec3 = [Math.cos(body.yaw), 0, Math.sin(body.yaw)];
    const along = relative[0] * forward[0] + relative[2] * forward[2];
    const slip = relative[0] * right[0] + relative[2] * right[2];
    const drag = targetSpeed < 35 ? DRAG * 3 : DRAG;
    const thrust = drag * targetSpeed * targetSpeed;
    const turning = Math.max(0, along) * actualTurnRate - slip * 0.85;
    const inducedDrag = 0.0012 * (body.bank * body.bank + body.pitch * body.pitch) * airspeed;
    // Lift is trimmed against gravity at normal operating speeds. Below trim,
    // lift fades; pitch and airspeed determine the available climb force.
    const trimLift = FLIGHT_GRAVITY * clamp((airspeed / 24) ** 2, 0, 1);
    const lift = clamp(trimLift + body.pitch * airspeed * 0.75 + thrust * Math.sin(body.pitch) * 0.25, 0, 36);
    const acceleration: Vec3 = [
      forward[0] * thrust * Math.cos(body.pitch) + right[0] * turning - (drag * airspeed + inducedDrag) * relative[0],
      lift - FLIGHT_GRAVITY - body.velocity[1] * (1 + Math.abs(body.velocity[1]) * 0.012),
      forward[2] * thrust * Math.cos(body.pitch) + right[2] * turning - (drag * airspeed + inducedDrag) * relative[2],
    ];
    for (let axis = 0; axis < 3; axis++) {
      displacement[axis] += body.velocity[axis] * dt + acceleration[axis] * dt * dt / 2;
      body.velocity[axis] += acceleration[axis] * dt;
    }
  }
  return { ...body, displacement };
}
