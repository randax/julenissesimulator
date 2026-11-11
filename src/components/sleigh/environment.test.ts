import test from "node:test";
import assert from "node:assert/strict";
import { DAY_CYCLE_SECONDS, getEnvironment } from "./environment.ts";

const near = (a: number, b: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);

test("automatic flight starts in daylight, passes through night, and returns to daylight", () => {
  const start = getEnvironment(0);
  assert.equal(start.periodLabel, "Dag");
  assert.ok(start.daylight > 0.99);
  assert.equal(start.aurora, 0);
  assert.equal(start.clock, "13:40");
  const dusk = getEnvironment(32.4);
  assert.equal(dusk.periodLabel, "Skumring");
  assert.ok(dusk.daylight > 0 && dusk.daylight < 1);
  const night = getEnvironment(70);
  assert.equal(night.periodLabel, "Natt");
  assert.ok(night.night > 0.99 && night.aurora > 0.6);
  const dawn = getEnvironment(122.4);
  assert.equal(dawn.periodLabel, "Daggry");
  const nextDay = getEnvironment(DAY_CYCLE_SECONDS);
  near(nextDay.phase, start.phase);
  near(nextDay.daylight, start.daylight);
  assert.equal(nextDay.clock, start.clock);
});

test("time overrides expose a clear aurora night and never show aurora in daytime", () => {
  for (const elapsed of [0, 20, 70, 200, 280]) {
    const day = getEnvironment(elapsed, {
      timeMode: "day",
      weatherMode: "clear",
    });
    assert.equal(day.daylight, 1);
    assert.equal(day.aurora, 0);
    assert.equal(day.clock, "12:00");
    const night = getEnvironment(elapsed, {
      timeMode: "night",
      weatherMode: "clear",
    });
    assert.equal(night.night, 1);
    assert.ok(night.aurora > 0.69);
    assert.equal(night.clock, "00:00");
  }
});

test("weather presets control cloud, snow, fog and aurora visibility", () => {
  const clear = getEnvironment(12, { timeMode: "night", weatherMode: "clear" });
  const snow = getEnvironment(12, { timeMode: "night", weatherMode: "snow" });
  const storm = getEnvironment(12, { timeMode: "night", weatherMode: "storm" });
  assert.equal(clear.snowfall, 0);
  assert.equal(clear.cloudCover, 0.12);
  assert.equal(clear.weatherLabel, "Klart");
  assert.equal(snow.snowfall, 0.55);
  assert.equal(snow.weatherLabel, "Snøvær");
  assert.equal(storm.snowfall, 1);
  assert.equal(storm.weatherLabel, "Snøbyger");
  assert.ok(
    clear.fogDensity < snow.fogDensity && snow.fogDensity < storm.fogDensity,
  );
  assert.ok(clear.aurora > snow.aurora && snow.aurora > storm.aurora);
  assert.ok(clear.windX < snow.windX && snow.windX < storm.windX);
});

test("weather changes smoothly, gusts over time, and remains within rendering bounds", () => {
  let previous = getEnvironment(0);
  let lowSnow = 1,
    highSnow = 0;
  const winds = new Set<number>();
  for (let elapsed = 0; elapsed <= 300; elapsed += 0.25) {
    const state = getEnvironment(elapsed);
    for (const key of [
      "daylight",
      "night",
      "aurora",
      "phase",
      "cloudCover",
      "snowfall",
    ] as const)
      assert.ok(state[key] >= 0 && state[key] <= 1, key);
    assert.ok(state.sunHeight >= -1 && state.sunHeight <= 1);
    assert.ok(state.windX >= 2 && state.windX <= 16);
    assert.ok(Number.isFinite(state.windZ));
    assert.ok(state.fogDensity >= 0.00025 && state.fogDensity <= 0.001);
    assert.ok(
      Number.isInteger(state.temperature) &&
        state.temperature >= -16 &&
        state.temperature <= -4,
    );
    assert.match(state.clock, /^\d{2}:\d{2}$/);
    near(Math.hypot(...state.lightDirection), 1);
    assert.ok(state.lightDirection[1] > 0);
    assert.ok(Math.abs(state.cloudCover - previous.cloudCover) < 0.04);
    assert.ok(Math.abs(state.snowfall - previous.snowfall) < 0.04);
    assert.ok(Math.abs(state.daylight - previous.daylight) < 0.07);
    lowSnow = Math.min(lowSnow, state.snowfall);
    highSnow = Math.max(highSnow, state.snowfall);
    winds.add(Math.round(state.windX * 10));
    previous = state;
  }
  assert.ok(lowSnow < 0.01 && highSnow > 0.99);
  assert.ok(winds.size > 20, "wind must contain changing gusts");
});

test("the simulation clock makes paused frames and replays deterministic", () => {
  const options = { timeMode: "auto", weatherMode: "auto" } as const;
  const paused = getEnvironment(84.25, options);
  assert.deepEqual(getEnvironment(84.25, options), paused);
  assert.notDeepEqual(getEnvironment(85.25, options), paused);
  assert.deepEqual(getEnvironment(0, options), getEnvironment(0, options));
});

test("invalid time and runtime mode values cannot produce invalid environment data", () => {
  for (const time of [Number.NaN, Infinity, -Infinity, -1])
    assert.deepEqual(getEnvironment(time), getEnvironment(0));
  for (const time of [1e20, Number.MAX_VALUE]) {
    const environment = getEnvironment(time);
    assert.ok(environment.lightDirection.every(Number.isFinite));
    for (const value of Object.values(environment))
      if (typeof value === "number") assert.ok(Number.isFinite(value));
  }
  const invalid = {
    timeMode: "invalid",
    weatherMode: "invalid",
  } as unknown as Parameters<typeof getEnvironment>[1];
  assert.deepEqual(getEnvironment(12, invalid), getEnvironment(12));
});
