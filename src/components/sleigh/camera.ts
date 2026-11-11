import type { FlightState } from "./flight";
import type { Vec3 } from "./geometry";

export function cameraPose(
  state: Pick<FlightState, "phase" | "x" | "altitude" | "distance">,
  narrow: boolean,
  previous: Vec3 | null,
  dt: number,
): { eye: Vec3; target: Vec3; shift: number } {
  const ready = state.phase === "ready";
  const desired: Vec3 = [
    state.x + (ready ? 13 : 0),
    state.altitude + (ready ? (narrow ? 17 : 12) : narrow ? 10 : 7),
    -state.distance + (ready ? (narrow ? 39 : 30) : narrow ? 29 : 22),
  ];
  const blend = 1 - Math.exp(-Math.max(0, Math.min(0.1, dt)) * 8);
  const eye: Vec3 = previous
    ? (previous.map(
        (value, index) => value + (desired[index] - value) * blend,
      ) as Vec3)
    : desired;
  // Flight stays directly behind the carriage even while steering. Height and
  // distance still ease smoothly; only the workshop preview uses an angled view.
  if (!ready) eye[0] = state.x;
  return {
    eye,
    target: [state.x, state.altitude + 1.8, -state.distance - 10],
    shift: ready && !narrow ? -0.34 : 0,
  };
}
