import type { FlightState } from "./flight";
import type { Vec3 } from "./geometry";

type CameraFlight = Pick<FlightState, "phase" | "x" | "altitude" | "distance"> & {
  yaw?: number;
};

export function cameraPose(
  state: CameraFlight,
  narrow: boolean,
  previous: Vec3 | null,
  dt: number,
): { eye: Vec3; target: Vec3; shift: number } {
  const ready = state.phase === "ready";
  const yaw = Number.isFinite(state.yaw) ? state.yaw! : 0;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const back = ready ? (narrow ? 39 : 30) : narrow ? 29 : 22;
  const side = ready ? 13 : 0;
  const desired: Vec3 = [
    state.x + cos * side - sin * back,
    state.altitude + (ready ? (narrow ? 17 : 12) : narrow ? 10 : 7),
    -state.distance + sin * side + cos * back,
  ];
  const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
  const blend = 1 - Math.exp(-seconds * 8);
  const eye: Vec3 = previous
    ? (previous.map(
        (value, index) => value + (desired[index] - value) * blend,
      ) as Vec3)
    : desired;
  // Keep the camera on the actual rear axis while height and following distance
  // settle smoothly. This prevents an oblique side view during a banked turn.
  if (!ready) {
    const easedBack = Math.max(
      narrow ? 18 : 15,
      Math.min(narrow ? 55 : 45,
        -sin * (eye[0] - state.x) + cos * (eye[2] + state.distance)),
    );
    eye[0] = state.x - sin * easedBack;
    eye[2] = -state.distance + cos * easedBack;
  }
  return {
    eye,
    target: [
      state.x + sin * 10,
      state.altitude + 1.8,
      -state.distance - cos * 10,
    ],
    shift: ready && !narrow ? -0.34 : 0,
  };
}
