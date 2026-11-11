import { ROUTE_LENGTH } from "./route.ts";
export { ROUTE_LENGTH } from "./route.ts";

export type FlightPhase = "ready" | "flying" | "paused" | "complete";

export interface FlightInput {
  steer: number;
  climb: number;
  boost: boolean;
  brake: boolean;
}

export interface FlightState {
  phase: FlightPhase;
  x: number;
  altitude: number;
  /** Ground speed in km/h. */
  speed: number;
  distance: number;
  lives: number;
  elapsed: number;
  /** Bank angle in radians. */
  heading: number;
  /** Seconds of collision protection remaining. */
  cooldown: number;
  outcome: null | "arrived" | "crashed";
}

export const FLIGHT_SPEEDS = {
  launch: 180,
  cruise: 230,
  boost: 340,
  brake: 100,
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const axis = (value: number) =>
  Number.isFinite(value) ? clamp(value, -1, 1) : 0;

export function createFlight(): FlightState {
  return {
    phase: "ready",
    x: 0,
    altitude: 35,
    speed: 0,
    distance: 0,
    lives: 3,
    elapsed: 0,
    heading: 0,
    cooldown: 0,
    outcome: null,
  };
}

export function startFlight(state: FlightState): FlightState {
  return state.phase === "ready"
    ? { ...state, phase: "flying", speed: FLIGHT_SPEEDS.launch }
    : state;
}

export function pauseFlight(state: FlightState): FlightState {
  return state.phase === "flying" ? { ...state, phase: "paused" } : state;
}

export function resumeFlight(state: FlightState): FlightState {
  return state.phase === "paused" ? { ...state, phase: "flying" } : state;
}

/** Advance one frame. A stalled tab never advances more than a tenth of a second. */
export function stepFlight(
  state: FlightState,
  input: FlightInput,
  dtSeconds: number,
): FlightState {
  if (state.phase !== "flying" || !Number.isFinite(dtSeconds) || dtSeconds <= 0)
    return state;
  const dt = Math.min(dtSeconds, 0.1);
  const steer = axis(input.steer);
  const climb = axis(input.climb);
  const targetSpeed = input.brake
    ? FLIGHT_SPEEDS.brake
    : input.boost
      ? FLIGHT_SPEEDS.boost
      : FLIGHT_SPEEDS.cruise;
  const speed =
    state.speed + (targetSpeed - state.speed) * (1 - Math.exp(-dt * 1.8));
  const distance = Math.min(ROUTE_LENGTH, state.distance + (speed / 3.6) * dt);
  let x = clamp(state.x + steer * 60 * dt, -160, 160);
  let altitude = clamp(state.altitude + climb * 32 * dt, 0, 180);
  let lives = state.lives;
  let cooldown = Math.max(0, state.cooldown - dt);

  if (cooldown === 0 && (Math.abs(x) > 140 || altitude < 7)) {
    lives = Math.max(0, lives - 1);
    cooldown = 2.5;
    x = clamp(x, -125, 125);
    altitude = Math.max(altitude, 26);
  }

  const outcome =
    lives === 0 ? "crashed" : distance >= ROUTE_LENGTH ? "arrived" : null;
  return {
    ...state,
    phase: outcome ? "complete" : "flying",
    x,
    altitude,
    speed,
    distance,
    lives,
    elapsed: state.elapsed + dt,
    heading:
      state.heading + (-steer * 0.3 - state.heading) * (1 - Math.exp(-dt * 5)),
    cooldown,
    outcome,
  };
}
