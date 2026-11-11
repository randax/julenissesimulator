import type { Vec3 } from "./geometry.ts";
import { DELIVERY_TARGETS, type DeliveryTarget } from "./houses.ts";
import { terrainHeight } from "./terrain.ts";

export interface Aim {
  yaw: number;
  elevation: number;
  power: number;
}

export interface ThrowSource {
  position: Vec3;
  velocity: Vec3;
}

export interface Wind {
  x: number;
  z: number;
}

export interface Parcel {
  id: number;
  position: Vec3;
  velocity: Vec3;
  age: number;
  landed: boolean;
  landedAt?: number;
  bounces: number;
  surfaceNormal?: Vec3;
  hitHouseId?: string;
}

export interface LandingEvent {
  packageId: number;
  houseId: string | null;
  distance: number | null;
  points: number;
  awarded: number;
  label: string;
}

export interface DeliveryState {
  packages: Parcel[];
  score: number;
  thrown: number;
  deliveries: number;
  houseScores: Record<string, {
    points: number;
    distance: number;
  }>;
  cooldown: number;
  lastLanding: LandingEvent | null;
  nextId: number;
}

export interface ThrowPrediction {
  points: Vec3[];
  landing: Vec3 | null;
  houseId: string | null;
  distance: number | null;
  pointsValue: number;
}

export const PACKAGE_RADIUS = 0.35;
export const THROW_COOLDOWN = 0.45;
export const MAX_IN_FLIGHT = 16;
export const DELIVERY_RADIUS = 30;
export const DELIVERED_DISTANCE = 10;

const GRAVITY = 9.81;
const DRAG = 0.08;
const MAX_FLIGHT_TIME = 14;
type Ground = (x: number, z: number) => number;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const finite = (n: number, fallback = 0) => Number.isFinite(n) ? n : fallback;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function createDelivery(): DeliveryState {
  return { packages: [], score: 0, thrown: 0, deliveries: 0, houseScores: {}, cooldown: 0, lastLanding: null, nextId: 1 };
}

function launch(source: ThrowSource, aim: Aim, id: number): Parcel {
  const yaw = clamp(finite(aim.yaw), -Math.PI, Math.PI);
  const elevation = clamp(finite(aim.elevation), -0.95, 0.65);
  const power = clamp(finite(aim.power, 36), 28, 60);
  const horizontal = Math.cos(elevation) * power;
  return {
    id, position: source.position.map((v) => finite(v)) as Vec3,
    velocity: [finite(source.velocity[0]) + Math.sin(yaw) * horizontal,
      finite(source.velocity[1]) + Math.sin(elevation) * power,
      finite(source.velocity[2]) - Math.cos(yaw) * horizontal],
    age: 0, landed: false, bounces: 0,
  };
}

export function throwPackage(state: DeliveryState, source: ThrowSource, aim: Aim): DeliveryState {
  if (state.cooldown > 1e-9 || state.packages.filter((p) => !p.landed).length >= MAX_IN_FLIGHT)
    return state;
  return { ...state, packages: [...state.packages, launch(source, aim, state.nextId)],
    nextId: state.nextId + 1, thrown: state.thrown + 1, cooldown: THROW_COOLDOWN };
}
/** Exact integration of gravity and horizontal linear drag toward the current wind. */
function integrate(position: Vec3, velocity: Vec3, wind: Wind, dt: number): {
  position: Vec3;
  velocity: Vec3;
} {
  const decay = Math.exp(-DRAG * dt);
  const travel = -Math.expm1(-DRAG * dt) / DRAG;
  return {
    position: [position[0] + wind.x * dt + (velocity[0] - wind.x) * travel,
      position[1] + velocity[1] * dt - GRAVITY * dt * dt / 2,
      position[2] + wind.z * dt + (velocity[2] - wind.z) * travel],
    velocity: [wind.x + (velocity[0] - wind.x) * decay, velocity[1] - GRAVITY * dt,
      wind.z + (velocity[2] - wind.z) * decay],
  };
}

interface Plane {
  normal: Vec3;
  limit: number;
}

interface Collider {
  target: DeliveryTarget;
  planes: Plane[];
  c: number;
  s: number;
  radius: number;
  roof: boolean;
}

interface Hit {
  time: number;
  normal: Vec3;
  house: DeliveryTarget;
  penetration: number;
}

const colliderCache = new WeakMap<readonly DeliveryTarget[], Collider[]>();
function colliders(targets: readonly DeliveryTarget[]): Collider[] {
  const cached = colliderCache.get(targets);
  if (cached)
    return cached;
  const result = targets.flatMap((target) => {
    const halfWidth = target.width / 2, halfDepth = target.depth / 2;
    const wallHeight = target.height * 0.51;
    const roofWidth = halfWidth + 1.45, roofDepth = halfDepth + 1.4;
    const box: Plane[] = [
      { normal: [1, 0, 0], limit: halfWidth }, { normal: [-1, 0, 0], limit: halfWidth },
      { normal: [0, 0, 1], limit: halfDepth }, { normal: [0, 0, -1], limit: halfDepth },
      { normal: [0, 1, 0], limit: wallHeight }, { normal: [0, -1, 0], limit: 0 },
    ];
    return [box, []].map((planes, index) => ({ target, c: Math.cos(target.yaw), s: Math.sin(target.yaw), roof: index === 1,
      radius: Math.hypot(roofWidth, roofDepth) + PACKAGE_RADIUS,
      planes: planes.map(({ normal, limit }) => ({ normal, limit: limit + PACKAGE_RADIUS * Math.hypot(...normal) })),
    }));
  });
  colliderCache.set(targets, result);
  return result;
}

function local(point: Vec3, collider: Collider): Vec3 {
  const x = point[0] - collider.target.x, z = point[2] - collider.target.z;
  return [collider.c * x - collider.s * z, point[1] - collider.target.y, collider.s * x + collider.c * z];
}
/** This is the sculpted snow surface used by createCottage in architecture.ts. */
function roofHeight(x: number, z: number, house: DeliveryTarget): number {
  const eave = house.width / 2 + 1.45;
  const round = 1.25;
  const normalized = (Math.sqrt(x * x + round * round) - round) /
    (Math.sqrt(eave * eave + round * round) - round);
  return house.height * 0.51 + 1.25 + house.height * 0.49 * (1 - normalized) +
    0.65 * Math.sin(Math.PI * x / eave) ** 2 +
    0.2 * Math.sin(z * 0.45 + house.localId) + 0.13 * Math.cos(x * 0.65 + z * 0.2);
}

function roofContact(position: Vec3, velocity: Vec3, wind: Wind, dt: number, collider: Collider): Hit | null {
  const start = local(position, collider);
  const end = local(integrate(position, velocity, wind, dt).position, collider);
  const house = collider.target;
  let enter = 0, exit = 1;
  let sideNormal: Vec3 | null = null;
  for (const [axis, extent] of [[0, house.width / 2 + 1.45], [2, house.depth / 2 + 1.4]]) {
    const limit = extent + PACKAGE_RADIUS;
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < 1e-12) {
      if (Math.abs(start[axis]) > limit)
        return null;
      continue;
    }
    const a = (-limit - start[axis]) / delta, b = (limit - start[axis]) / delta;
    const near = Math.min(a, b), far = Math.max(a, b);
    if (near > enter) {
      enter = near;
      sideNormal = axis === 0 ? [delta > 0 ? -1 : 1, 0, 0] : [0, 0, delta > 0 ? -1 : 1];
    }
    exit = Math.min(exit, far);
  }
  if (enter > exit || exit < 0 || enter > 1)
    return null;
  const sample = (t: number) => {
    const point = local(integrate(position, velocity, wind, t).position, collider);
    const dx = (roofHeight(point[0] + 0.05, point[2], house) - roofHeight(point[0] - 0.05, point[2], house)) / 0.1;
    const dz = (roofHeight(point[0], point[2] + 0.05, house) - roofHeight(point[0], point[2] - 0.05, house)) / 0.1;
    const normal: Vec3 = [-dx, 1, -dz];
    const length = Math.hypot(...normal);
    return { point, normal: normal.map((v) => v / length) as Vec3,
      clearance: point[1] - roofHeight(point[0], point[2], house) - PACKAGE_RADIUS * length };
  };
  let time = Math.max(0, enter) * dt;
  const previous = sample(time);
  let normal = previous.normal;
  let penetration = 0;
  if (previous.clearance <= 0) {
    if (previous.point[1] < house.height * 0.51 - PACKAGE_RADIUS)
      return null;
    normal = sideNormal ?? normal;
    penetration = sideNormal ? 0 : -previous.clearance * normal[1];
  }
  else {
    let found = false;
    // Samples also detect a fast parcel cutting over the rounded ridge between two positive endpoints.
    const startTime = time;
    for (let i = 1; i <= 4; i++) {
      const nextTime = startTime + (Math.min(1, exit) * dt - startTime) * i / 4;
      const next = sample(nextTime);
      if (next.clearance <= 0) {
        let lo = time, hi = nextTime;
        for (let iteration = 0; iteration < 18; iteration++) {
          const mid = (lo + hi) / 2;
          if (sample(mid).clearance > 0)
            lo = mid;
          else
            hi = mid;
        }
        time = hi;
        normal = sample(time).normal;
        found = true;
        break;
      }
      time = nextTime;
    }
    if (!found)
      return null;
  }
  return { time, house, penetration, normal: [collider.c * normal[0] + collider.s * normal[2], normal[1],
      -collider.s * normal[0] + collider.c * normal[2]] };
}
/** Swept sphere against the cottage walls and pitched roof, including rotated houses. */
function houseHit(position: Vec3, velocity: Vec3, wind: Wind, dt: number, buildings: Collider[]): Hit | null {
  const end = integrate(position, velocity, wind, dt).position;
  let first: Hit | null = null;
  for (const collider of buildings) {
    const house = collider.target;
    const margin = collider.radius + Math.hypot(end[0] - position[0], end[2] - position[2]);
    if (Math.abs(position[0] - house.x) > margin || Math.abs(position[2] - house.z) > margin ||
      Math.min(position[1], end[1]) > house.y + house.height + 3)
      continue;
    if (collider.roof) {
      const hit = roofContact(position, velocity, wind, dt, collider);
      if (hit && (!first || hit.time < first.time))
        first = hit;
      continue;
    }
    const startLocal = local(position, collider), endLocal = local(end, collider);
    let enter = 0, exit = 1, entering: Plane | null = null;
    let inside = true, nearest: Plane | null = null, depth = Infinity;
    for (const plane of collider.planes) {
      const a = dot(plane.normal, startLocal) - plane.limit;
      const b = dot(plane.normal, endLocal) - plane.limit;
      const length = Math.hypot(...plane.normal);
      if (a > 1e-8)
        inside = false;
      if (-a / length < depth) {
        depth = -a / length;
        nearest = plane;
      }
      if (a > 0 && b > 0) {
        enter = Infinity;
        break;
      }
      if (a > b && a > 0) {
        const t = a / (a - b);
        if (t > enter) {
          enter = t;
          entering = plane;
        }
      }
      else if (b > a && b > 0)
        exit = Math.min(exit, -a / (b - a));
    }
    if (enter > exit || enter > 1)
      continue;
    const plane = inside ? nearest : entering;
    if (!plane)
      continue;
    let time = inside ? 0 : enter * dt;
    if (!inside && dot(plane.normal, endLocal) <= plane.limit) {
      let lo = 0, hi = dt;
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (dot(plane.normal, local(integrate(position, velocity, wind, mid).position, collider)) > plane.limit)
          lo = mid;
        else
          hi = mid;
      }
      time = hi;
    }
    const n = plane.normal, length = Math.hypot(...n);
    const normal: Vec3 = [(collider.c * n[0] + collider.s * n[2]) / length, n[1] / length,
      (-collider.s * n[0] + collider.c * n[2]) / length];
    if (!first || time < first.time)
      first = { time, normal, house, penetration: inside ? Math.max(0, depth) : 0 };
  }
  return first;
}

function groundTime(position: Vec3, velocity: Vec3, wind: Wind, dt: number, ground: Ground): number | null {
  const clearance = (t: number) => {
    const p = integrate(position, velocity, wind, t).position;
    return p[1] - finite(ground(p[0], p[2])) - PACKAGE_RADIUS;
  };
  if (clearance(0) <= 0)
    return 0;
  if (clearance(dt) > 0)
    return null;
  let lo = 0, hi = dt;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (clearance(mid) > 0)
      lo = mid;
    else
      hi = mid;
  }
  return hi;
}

function advance(parcel: Parcel, wind: Wind, dt: number, buildings: Collider[], ground: Ground): Parcel {
  if (parcel.landed)
    return { ...parcel, age: parcel.age + dt };
  let result: Parcel = { ...parcel, position: [...parcel.position], velocity: [...parcel.velocity] };
  let remaining = Math.min(dt, Math.max(0, MAX_FLIGHT_TIME - parcel.age));
  while (remaining > 1e-9 && !result.landed) {
    let step = Math.min(0.02, remaining);
    // A collision may consume only part of a substep; finish its remainder after the bounce.
    for (let contact = 0; step > 1e-9 && contact < 8; contact++) {
      const groundHit = groundTime(result.position, result.velocity, wind, step, ground);
      const house = houseHit(result.position, result.velocity, wind, step, buildings);
      if (groundHit !== null && (!house || groundHit <= house.time)) {
        const impact = integrate(result.position, result.velocity, wind, groundHit);
        impact.position[1] = finite(ground(impact.position[0], impact.position[2])) + PACKAGE_RADIUS;
        result = { ...result, ...impact, landed: true, landedAt: result.age + groundHit, surfaceNormal: [0, 1, 0], velocity: [0, 0, 0] };
        break;
      }
      if (!house) {
        result = { ...result, ...integrate(result.position, result.velocity, wind, step) };
        break;
      }
      const impact = integrate(result.position, result.velocity, wind, house.time);
      result = { ...result, ...impact };
      if (house.normal[1] > 0.2 && result.velocity[1] <= 0) {
        result.position = result.position.map((v, i) => v + house.normal[i] * house.penetration) as Vec3;
        result = { ...result, landed: true, landedAt: result.age + house.time,
          surfaceNormal: house.normal, hitHouseId: house.house.id, velocity: [0, 0, 0] };
        break;
      }
      const inward = Math.min(0, dot(result.velocity, house.normal));
      result.velocity = result.velocity.map((v, i) => v - 1.15 * inward * house.normal[i]) as Vec3;
      result.position = result.position.map((v, i) => v + house.normal[i] * (house.penetration + 0.003)) as Vec3;
      result.bounces++;
      step -= house.time;
    }
    const elapsed = Math.min(0.02, remaining);
    result.age += elapsed;
    remaining -= elapsed;
  }
  if (!result.landed && result.age >= MAX_FLIGHT_TIME - 1e-8) {
    result.position[1] = finite(ground(result.position[0], result.position[2])) + PACKAGE_RADIUS;
    result = { ...result, landed: true, landedAt: result.age, velocity: [0, 0, 0], surfaceNormal: [0, 1, 0] };
  }
  return result;
}
/** Horizontal distance from the parcel's surface to the actual oriented cottage footprint. */
export function distanceToHouse(position: Vec3, house: DeliveryTarget): number {
  const x = position[0] - house.x, z = position[2] - house.z;
  const c = Math.cos(house.yaw), s = Math.sin(house.yaw);
  return Math.max(0, Math.hypot(Math.max(0, Math.abs(c * x - s * z) - house.width / 2), Math.max(0, Math.abs(s * x + c * z) - house.depth / 2)) - PACKAGE_RADIUS);
}

export function scoreForDistance(distance: number): number {
  if (!Number.isFinite(distance))
    return 0;
  return Math.round(1000 * Math.max(0, 1 - Math.max(0, distance) / DELIVERY_RADIUS) ** 2);
}

function landingResult(parcel: Parcel, targets: readonly DeliveryTarget[]): {
  houseId: string | null;
  distance: number | null;
  pointsValue: number;
} {
  let houseId: string | null = null, distance = Infinity;
  for (const target of targets) {
    const current = target.id === parcel.hitHouseId ? 0 : distanceToHouse(parcel.position, target);
    if (current < distance) {
      distance = current;
      houseId = target.id;
    }
  }
  return { houseId, distance: houseId === null ? null : distance, pointsValue: scoreForDistance(distance) };
}

export function stepDelivery(state: DeliveryState, wind: Wind, dt: number, targets: readonly DeliveryTarget[] = DELIVERY_TARGETS, ground: Ground = terrainHeight): DeliveryState {
  if (!Number.isFinite(dt) || dt <= 0)
    return state;
  dt = Math.min(dt, 0.1);
  const safeWind = { x: finite(wind.x), z: finite(wind.z) };
  const buildings = colliders(targets);
  let score = state.score, lastLanding = state.lastLanding;
  const houseScores = { ...state.houseScores };
  const packages = state.packages.map((parcel) => {
    const next = advance(parcel, safeWind, dt, buildings, ground);
    if (!parcel.landed && next.landed) {
      const landing = landingResult(next, targets);
      const previous = landing.houseId ? houseScores[landing.houseId] : undefined;
      const awarded = Math.max(0, landing.pointsValue - (previous?.points ?? 0));
      if (landing.houseId && landing.distance !== null && landing.distance <= DELIVERY_RADIUS &&
        (!previous || landing.distance < previous.distance)) {
        houseScores[landing.houseId] = { points: landing.pointsValue, distance: landing.distance };
      }
      score += awarded;
      lastLanding = { packageId: parcel.id, houseId: landing.houseId, distance: landing.distance,
        points: landing.pointsValue, awarded,
        label: landing.distance !== null && landing.distance <= 1 ? "Perfekt!" :
          landing.distance !== null && landing.distance <= DELIVERED_DISTANCE ? "God levering!" :
            landing.pointsValue > 0 ? "Nesten fremme" : "Bom" };
    }
    return next;
  }).filter((parcel) => !parcel.landed || parcel.age - (parcel.landedAt ?? parcel.age) <= 12);
  let decorations = 0;
  const retained = packages.reverse().filter((parcel) => !parcel.landed || ++decorations <= 24).reverse();
  return { ...state, packages: retained, score, houseScores, lastLanding,
    deliveries: Object.values(houseScores).filter((best) => best.distance <= DELIVERED_DISTANCE).length,
    cooldown: Math.max(0, state.cooldown - dt) };
}

export function predictThrow(source: ThrowSource, aim: Aim, wind: Wind, targets: readonly DeliveryTarget[] = DELIVERY_TARGETS, ground: Ground = terrainHeight): ThrowPrediction {
  let parcel = launch(source, aim, 0);
  const points: Vec3[] = [[...parcel.position]];
  const safeWind = { x: finite(wind.x), z: finite(wind.z) };
  const buildings = colliders(targets);
  while (!parcel.landed && parcel.age < MAX_FLIGHT_TIME + 0.1) {
    parcel = advance(parcel, safeWind, 0.06, buildings, ground);
    points.push([...parcel.position]);
  }
  return { points, landing: parcel.landed ? [...parcel.position] : null, ...landingResult(parcel, targets) };
}
