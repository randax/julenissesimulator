/** The rendered valley is recycled in seamless tiles along this longer journey. */
export const WORLD_TILE_LENGTH = 2400;
export const ROUTE_LENGTH = 18000;

export interface StarGate {
  distance: number;
  x: number;
  altitude: number;
}

const gatePattern: readonly Omit<StarGate, "distance">[] = [
  { x: 0, altitude: 35 },
  { x: -35, altitude: 45 },
  { x: 40, altitude: 60 },
  { x: 0, altitude: 80 },
  { x: -55, altitude: 65 },
  { x: 45, altitude: 50 },
  { x: 20, altitude: 70 },
  { x: 0, altitude: 35 },
];

export const STAR_GATES: readonly StarGate[] = Array.from(
  { length: 60 },
  (_, index) => ({
    distance: 180 + index * 300,
    ...gatePattern[index % gatePattern.length],
  }),
);

export interface RouteStop {
  distance: number;
  name: string;
  description: string;
}

export const ROUTE_STOPS: readonly RouteStop[] = [
  { distance: 0, name: "Snøfall", description: "Her begynner eventyret" },
  {
    distance: 3000,
    name: "Den stille skogen",
    description: "Over snøtunge grantrær",
  },
  { distance: 6000, name: "Fjellpasset", description: "Mellom vinterfjellene" },
  { distance: 9000, name: "Vinterdalen", description: "Langs den frosne elva" },
  {
    distance: 13000,
    name: "Nordlysdalen",
    description: "Under himmelens farger",
  },
  {
    distance: ROUTE_LENGTH,
    name: "Hjem til Snøfall",
    description: "En trygg landing",
  },
];

/** Return the current waypoint, keeping out-of-range or invalid progress safe. */
export function routeStopAt(distance: number): RouteStop {
  const progress = Number.isNaN(distance) ? 0 : distance;
  for (let index = ROUTE_STOPS.length - 1; index >= 0; index--) {
    if (progress >= ROUTE_STOPS[index].distance) return ROUTE_STOPS[index];
  }
  return ROUTE_STOPS[0];
}
