import { LAUNCH_APPROACH, ROUTE_LENGTH } from "./route.ts";
import { terrainHeight, valleyCenter, valleyWidth, valleyHeading } from "./terrain.ts";
import { stepFlightBody, type FlightWind } from "./flight-physics.ts";
import { DELIVERY_TARGETS } from "./houses.ts";
import { cottageRoofHeight } from "./delivery.ts";
import { point, transform, type Vec3 } from "./geometry.ts";
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
  /** Actual horizontal ground speed in km/h. */
  speed: number;
  /** Forward progress; world Z is LAUNCH_APPROACH - distance. */
  distance: number;
  lives: number;
  elapsed: number;
  /** Bank angle in radians; negative rolls into a right turn. */
  heading: number;
  /** Clockwise heading from -Z, nose-up pitch and yaw rate. */
  yaw: number;
  pitch: number;
  yawRate: number;
  /** Actual world velocity in m/s, shared with package launches. */
  velocity: Vec3;
  cooldown: number;
  outcome: null | "arrived" | "crashed";
}
export const FLIGHT_SPEEDS = { launch: 180, cruise: 230, boost: 340, brake: 100 } as const;
export const FLIGHT_CEILING = 260;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const alongCourse = (yaw: number, speed: number): Vec3 => [Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed];

export function createFlight(): FlightState {
  const x = valleyCenter(LAUNCH_APPROACH);
  return {
    phase: "ready", x, altitude: terrainHeight(x, LAUNCH_APPROACH) + 35,
    speed: 0, distance: 0, lives: 3, elapsed: 0, heading: 0,
    yaw: valleyHeading(LAUNCH_APPROACH), pitch: 0, yawRate: 0, velocity: [0, 0, 0],
    cooldown: 0, outcome: null,
  };
}
export function startFlight(state: FlightState): FlightState {
  return state.phase === "ready" ? {
    ...state, phase: "flying", speed: FLIGHT_SPEEDS.launch,
    velocity: alongCourse(state.yaw, FLIGHT_SPEEDS.launch / 3.6),
  } : state;
}
export function pauseFlight(state: FlightState): FlightState {
  return state.phase === "flying" ? { ...state, phase: "paused" } : state;
}
export function resumeFlight(state: FlightState): FlightState {
  return state.phase === "paused" ? { ...state, phase: "flying" } : state;
}

/** The carriage and reindeer use the same oriented roof surfaces as deliveries. */
function roofContact(x: number, y: number, z: number, yaw: number, pitch: number, bank: number): number | null {
  let top: number | null = null;
  const placement = transform([x, y, z], [pitch, -yaw, bank]);
  const bodies: Array<[Vec3, number]> = [
    [[0, 2, 0], 4], [[-4.5, 3.4, -17], 2.5],
    [[4.5, 3.4, -17], 2.5], [[0, 3.6, -23], 2.5],
  ];
  for (const [localBody, radius] of bodies) {
    const [px, py, pz] = point(placement, localBody);
    for (const house of DELIVERY_TARGETS) {
      const dx = px - house.x, dz = pz - house.z;
      if (Math.abs(dx) > house.width + house.depth || Math.abs(dz) > house.width + house.depth ||
        py - radius > house.y + house.height + 3 || py + radius < house.y) continue;
      const c = Math.cos(house.yaw), s = Math.sin(house.yaw);
      const localX = c * dx - s * dz, localZ = s * dx + c * dz;
      const w = house.width / 2 + 1.45, d = house.depth / 2 + 1.4;
      if (Math.abs(localX) > w + radius || Math.abs(localZ) > d + radius) continue;
      const roof = house.y + cottageRoofHeight(clamp(localX, -w, w), clamp(localZ, -d, d), house);
      if (py - radius < roof) top = Math.max(top ?? -Infinity, house.y + house.height + 12);
    }
  }
  return top;
}

/** Integrate forces, then resolve terrain/valley contact without teleport momentum. */
export function stepFlight(
  state: FlightState, input: FlightInput, dtSeconds: number,
  wind: FlightWind = { x: 0, z: 0 },
): FlightState {
  if (state.phase !== "flying" || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return state;
  const dt = Math.min(dtSeconds, 0.1);
  const target = input.brake ? FLIGHT_SPEEDS.brake : input.boost ? FLIGHT_SPEEDS.boost : FLIGHT_SPEEDS.cruise;
  const body = stepFlightBody({ velocity: state.velocity, yaw: state.yaw, pitch: state.pitch,
    bank: state.heading, yawRate: state.yawRate },
  { steer: input.steer, climb: input.climb, targetSpeed: target / 3.6 }, dt, wind);
  const distance = Math.min(ROUTE_LENGTH, state.distance + Math.max(0, -body.displacement[2]));
  const z = LAUNCH_APPROACH - distance;
  const center = valleyCenter(z), width = valleyWidth(z);
  let x = state.x + body.displacement[0];
  let altitude = Math.min(FLIGHT_CEILING, state.altitude + body.displacement[1]);
  let velocity = body.velocity;
  if (altitude === FLIGHT_CEILING && velocity[1] > 0) velocity = [velocity[0], 0, velocity[2]];
  let lives = state.lives;
  let cooldown = Math.max(0, state.cooldown - dt);
  let yaw = body.yaw, pitch = body.pitch, heading = body.bank, yawRate = body.yawRate;
  const roof = roofContact(x, altitude, z, yaw, pitch, heading);
  if (Math.abs(x - center) > width || altitude < terrainHeight(x, z) + 4 || roof !== null) {
    if (cooldown === 0) {
      lives = Math.max(0, lives - 1);
      cooldown = 2.5;
    }
    x = clamp(x, center - width * 0.5, center + width * 0.5);
    altitude = Math.max(altitude, terrainHeight(x, z) + 35, roof ?? -Infinity);
    yaw = valleyHeading(z);
    pitch = heading = yawRate = 0;
    velocity = alongCourse(yaw, Math.max(FLIGHT_SPEEDS.brake / 3.6, Math.hypot(velocity[0], velocity[2]) * 0.85));
  }
  const outcome = lives === 0 ? "crashed" : distance >= ROUTE_LENGTH ? "arrived" : null;
  return {
    ...state, phase: outcome ? "complete" : "flying", x, altitude, distance, lives,
    speed: Math.hypot(velocity[0], velocity[2]) * 3.6,
    elapsed: state.elapsed + dt, heading, yaw, pitch, yawRate, velocity, cooldown, outcome,
  };
}
