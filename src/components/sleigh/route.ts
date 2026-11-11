/** The rendered valley is recycled in seamless tiles along this longer journey. */
export const WORLD_TILE_LENGTH = 2400;
/** World-space run-up before the first delivery village. */
export const LAUNCH_APPROACH = 250;
export const ROUTE_LENGTH = 18000;

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
