import test from "node:test";
import assert from "node:assert/strict";
import {
  createFlight,
  startFlight,
  pauseFlight,
  resumeFlight,
  stepFlight,
  STAR_GATES,
  ROUTE_LENGTH,
  FLIGHT_SPEEDS,
} from "./flight.ts";
import type { FlightInput, FlightState } from "./flight.ts";
import { WORLD_TILE_LENGTH, ROUTE_STOPS, routeStopAt } from "./route.ts";

const idle: FlightInput = { steer: 0, climb: 0, boost: false, brake: false };
const flying = (overrides: Partial<FlightState> = {}) => ({
  ...startFlight(createFlight()),
  ...overrides,
});

test("start, pause, resume and reset keep the flight lifecycle consistent", () => {
  const initial = createFlight();
  assert.equal(initial.phase, "ready");
  assert.equal(stepFlight(initial, idle, 0.1), initial);
  const active = startFlight(initial);
  assert.equal(active.phase, "flying");
  assert.equal(active.speed, FLIGHT_SPEEDS.launch);
  assert.equal(initial.phase, "ready");
  const paused = pauseFlight(active);
  assert.equal(stepFlight(paused, { ...idle, boost: true }, 1), paused);
  assert.equal(resumeFlight(paused).phase, "flying");
  assert.deepEqual(createFlight(), initial);
});

test("elapsed time and distance advance deterministically and tab stalls are capped", () => {
  const state = flying();
  const frame = stepFlight(state, idle, 0.1);
  assert.ok(frame.distance > 0);
  assert.equal(frame.elapsed, 0.1);
  assert.deepEqual(stepFlight(state, idle, 60), frame);
  assert.deepEqual(stepFlight(state, idle, 0.1), frame);
  assert.equal(stepFlight(state, idle, Number.NaN), state);
});

test("a star is collected once when crossing its position inside both tolerances", () => {
  const gate = STAR_GATES[0];
  const before = flying({
    distance: gate.distance - 1,
    x: gate.x,
    altitude: gate.altitude,
  });
  const collected = stepFlight(before, idle, 0.1);
  assert.equal(collected.stars, 1);
  assert.equal(collected.nextGate, 1);
  assert.equal(stepFlight(collected, idle, 0.1).stars, 1);
  assert.equal(before.stars, 0);
});

test("missing a star consumes that gate without awarding it or losing a life", () => {
  const gate = STAR_GATES[0];
  const missed = stepFlight(
    flying({ distance: gate.distance - 1, altitude: 90 }),
    idle,
    0.1,
  );
  assert.equal(missed.nextGate, 1);
  assert.equal(missed.stars, 0);
  assert.equal(missed.lives, 3);
});

test("ground and route-edge collisions cost one life and protection prevents repeat damage", () => {
  for (const obstacle of [{ altitude: 1 }, { x: 145 }]) {
    const hit = stepFlight(flying(obstacle), idle, 0.1);
    assert.equal(hit.lives, 2);
    assert.equal(hit.cooldown, 2.5);
    const protectedHit = stepFlight({ ...hit, ...obstacle }, idle, 0.1);
    assert.equal(protectedHit.lives, 2);
    assert.ok(protectedHit.cooldown < hit.cooldown);
    const vulnerableHit = stepFlight(
      { ...protectedHit, cooldown: 0 },
      idle,
      0.1,
    );
    assert.equal(vulnerableHit.lives, 1);
  }
});

test("the last collision ends the flight and cannot advance further", () => {
  const lost = stepFlight(flying({ lives: 1, altitude: 0 }), idle, 0.1);
  assert.equal(lost.phase, "complete");
  assert.equal(lost.outcome, "crashed");
  assert.equal(lost.lives, 0);
  assert.equal(stepFlight(lost, idle, 0.1), lost);
});

test("arrival ends at the route length, retaining the result", () => {
  const arrived = stepFlight(
    flying({
      distance: ROUTE_LENGTH - 1,
      stars: 5,
      nextGate: STAR_GATES.length,
    }),
    idle,
    0.1,
  );
  assert.equal(arrived.distance, ROUTE_LENGTH);
  assert.equal(arrived.phase, "complete");
  assert.equal(arrived.outcome, "arrived");
  assert.equal(arrived.stars, 5);
  assert.equal(stepFlight(arrived, idle, 0.1), arrived);
});

test("axes are clamped, invalid axes are neutral, and braking overrides boost", () => {
  const state = flying();
  assert.deepEqual(
    stepFlight(state, { ...idle, steer: 99, climb: -99 }, 0.1),
    stepFlight(state, { ...idle, steer: 1, climb: -1 }, 0.1),
  );
  assert.deepEqual(
    stepFlight(state, { ...idle, steer: Number.NaN, climb: Infinity }, 0.1),
    stepFlight(state, idle, 0.1),
  );
  const boosted = stepFlight(state, { ...idle, boost: true }, 0.1);
  const braked = stepFlight(state, { ...idle, boost: true, brake: true }, 0.1);
  assert.ok(boosted.speed > state.speed);
  assert.ok(braked.speed < state.speed);
});

test("cruise and boost move through the full route at their advertised speeds", () => {
  for (const [input, target, minDuration, maxDuration] of [
    [idle, FLIGHT_SPEEDS.cruise, 281, 284],
    [{ ...idle, boost: true }, FLIGHT_SPEEDS.boost, 190, 193],
  ] as const) {
    let state = flying();
    let frames = 0;
    while (state.phase === "flying" && frames++ < 24_000) {
      state = stepFlight(state, input, 1 / 60);
    }
    assert.equal(state.outcome, "arrived");
    assert.equal(state.distance, ROUTE_LENGTH);
    assert.equal(state.lives, 3);
    assert.ok(Math.abs(state.speed - target) < 0.01);
    assert.ok(state.elapsed > minDuration && state.elapsed < maxDuration);
  }
});

test("acceleration is smooth and braking settles at the lower speed", () => {
  const launched = flying();
  const first = stepFlight(launched, { ...idle, boost: true }, 1 / 60);
  assert.ok(first.speed > FLIGHT_SPEEDS.launch);
  assert.ok(first.speed < FLIGHT_SPEEDS.boost);
  let state = flying({ speed: FLIGHT_SPEEDS.boost });
  for (let i = 0; i < 300; i++) {
    state = stepFlight(state, { ...idle, boost: true, brake: true }, 1 / 60);
  }
  assert.ok(Math.abs(state.speed - FLIGHT_SPEEDS.brake) < 0.1);
  assert.ok(state.distance < (FLIGHT_SPEEDS.boost / 3.6) * state.elapsed);
});

test("lateral and vertical controls remain responsive at faster flight speeds", () => {
  const state = stepFlight(flying(), { ...idle, steer: 1, climb: 1 }, 0.1);
  assert.equal(state.x, 6);
  assert.equal(state.altitude, 38.2);
  assert.equal(state.lives, 3);
});

test("the longer route distributes reachable star gates across the full journey", () => {
  assert.equal(ROUTE_LENGTH, 18000);
  assert.equal(WORLD_TILE_LENGTH, 2400);
  assert.equal(STAR_GATES.length, 60);
  assert.deepEqual(STAR_GATES[0], { distance: 180, x: 0, altitude: 35 });
  assert.equal(STAR_GATES.at(-1)?.distance, 17880);
  STAR_GATES.forEach((gate, index) => {
    assert.ok(gate.distance > 0 && gate.distance < ROUTE_LENGTH);
    assert.ok(Math.abs(gate.x) <= 55);
    assert.ok(gate.altitude >= 35 && gate.altitude <= 80);
    assert.ok(Object.values(gate).every(Number.isFinite));
    if (index === 0) return;
    const previous = STAR_GATES[index - 1];
    const availableTime =
      (gate.distance - previous.distance) / (FLIGHT_SPEEDS.boost / 3.6);
    assert.equal(gate.distance - previous.distance, 300);
    assert.ok(Math.abs(gate.x - previous.x) / 60 < availableTime);
    assert.ok(Math.abs(gate.altitude - previous.altitude) / 32 < availableTime);
  });
});

test("passing the old finish line keeps the longer flight running", () => {
  const state = stepFlight(flying({ distance: 1800, nextGate: 6 }), idle, 0.1);
  assert.equal(state.phase, "flying");
  assert.equal(state.outcome, null);
  assert.ok(state.distance > 1800 && state.distance < ROUTE_LENGTH);
  const finalGate = STAR_GATES.at(-1)!;
  const collected = stepFlight(
    flying({
      distance: finalGate.distance - 1,
      nextGate: STAR_GATES.length - 1,
      x: finalGate.x,
      altitude: finalGate.altitude,
    }),
    idle,
    0.1,
  );
  assert.equal(collected.stars, 1);
  assert.equal(collected.nextGate, STAR_GATES.length);
  assert.equal(collected.phase, "flying");
});

test("route waypoints track progress and clamp to the start or home", () => {
  assert.equal(ROUTE_STOPS.length, 6);
  assert.equal(routeStopAt(-100), ROUTE_STOPS[0]);
  assert.equal(routeStopAt(Number.NaN), ROUTE_STOPS[0]);
  assert.equal(routeStopAt(-Infinity), ROUTE_STOPS[0]);
  ROUTE_STOPS.forEach((stop, index) => {
    assert.equal(routeStopAt(stop.distance), stop);
    if (index > 0) {
      assert.ok(stop.distance > ROUTE_STOPS[index - 1].distance);
      assert.equal(routeStopAt(stop.distance - 0.01), ROUTE_STOPS[index - 1]);
    }
  });
  assert.equal(routeStopAt(ROUTE_LENGTH + 5000), ROUTE_STOPS.at(-1));
  assert.equal(routeStopAt(Infinity), ROUTE_STOPS.at(-1));
});
