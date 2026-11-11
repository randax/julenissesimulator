import type { Aim, ThrowSource } from "./delivery.ts";
import type { FlightState } from "./flight.ts";
import { LAUNCH_APPROACH } from "./route.ts";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

export function createAim(): Aim {
  return { yaw: 0.65, elevation: -0.25, power: 36 };
}

export function pointerAim(xNormalized: number, yNormalized: number): Aim {
  return {
    yaw: clamp((finite(xNormalized, 0.5) - 0.5) * Math.PI * 1.15, -1.8, 1.8),
    elevation: clamp(0.55 - finite(yNormalized, 0.5) * 1.5, -0.95, 0.55),
    power: 36,
  };
}

export function keyboardAim(
  aim: Aim,
  horizontal: number,
  vertical: number,
  dt: number,
): Aim {
  const seconds = clamp(finite(dt), 0, 0.1);
  return {
    yaw: clamp(
      finite(aim.yaw, 0.65) + clamp(finite(horizontal), -1, 1) * 1.5 * seconds,
      -1.8,
      1.8,
    ),
    elevation: clamp(
      finite(aim.elevation, -0.25) +
        clamp(finite(vertical), -1, 1) * 0.8 * seconds,
      -0.95,
      0.55,
    ),
    power: clamp(finite(aim.power, 36), 36, 58),
  };
}

export function chargePower(heldSeconds: number): number {
  return 36 + 22 * clamp(finite(heldSeconds) / 0.85, 0, 1);
}

/** Use physical flight coordinates so recycling the scenery cannot move a throw. */
export function makeThrowSource(
  current: FlightState,
  previous: FlightState | null,
  dt: number,
): ThrowSource {
  let lateral = 0;
  let vertical = 0;
  if (
    previous &&
    current.phase === "flying" &&
    previous.phase === "flying" &&
    current.lives === previous.lives &&
    Number.isFinite(dt) &&
    dt > 0 &&
    current.distance >= previous.distance &&
    current.distance - previous.distance <=
      (Math.max(finite(current.speed), finite(previous.speed), 0) / 3.6) * dt +
        1e-6
  ) {
    const dx = (current.x - previous.x) / dt;
    const dy = (current.altitude - previous.altitude) / dt;
    // Larger jumps cannot come from the flight controls; they are respawns/replays.
    if (
      Number.isFinite(dx) &&
      Number.isFinite(dy) &&
      Math.abs(dx) <= 60 + 1e-6 &&
      Math.abs(dy) <= 32 + 1e-6
    ) {
      lateral = dx;
      vertical = dy;
    }
  }
  return {
    position: [
      finite(current.x) + 1.2,
      finite(current.altitude) + 3.1,
      LAUNCH_APPROACH - finite(current.distance) - 1.7,
    ],
    velocity: [
      lateral,
      vertical,
      current.phase === "flying" ? -finite(current.speed) / 3.6 : 0,
    ],
  };
}
