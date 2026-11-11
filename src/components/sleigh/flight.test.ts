import test from "node:test";
import assert from "node:assert/strict";
import { createFlight, startFlight, pauseFlight, resumeFlight, stepFlight,
  ROUTE_LENGTH, FLIGHT_SPEEDS, FLIGHT_CEILING, type FlightInput, type FlightState } from "./flight.ts";
import { WORLD_TILE_LENGTH, LAUNCH_APPROACH, ROUTE_STOPS, routeStopAt } from "./route.ts";
import { terrainHeight, valleyCenter, valleyWidth } from "./terrain.ts";

const idle: FlightInput = {steer:0,climb:0,boost:false,brake:false};
const flying=(overrides:Partial<FlightState>={}):FlightState=>{
  const state={...startFlight(createFlight()),...overrides};
  if(overrides.speed!==undefined && !overrides.velocity)
    state.velocity=[Math.sin(state.yaw)*state.speed/3.6,0,-Math.cos(state.yaw)*state.speed/3.6];
  return state;
};
const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
function followValley(state:FlightState,boost=false):FlightInput {
  const desired=Math.atan2(valleyCenter(LAUNCH_APPROACH-state.distance-130)-state.x,130);
  return {...idle,boost,steer:clamp((desired-state.yaw)*4-state.yawRate*1.5,-1,1)};
}

test("start, pause, resume and reset preserve physical flight state",()=>{
  const initial=createFlight();
  assert.equal(initial.phase,"ready");
  assert.equal(stepFlight(initial,idle,.1),initial);
  assert.equal(initial.x,valleyCenter(LAUNCH_APPROACH));
  assert.ok(initial.altitude>terrainHeight(initial.x,LAUNCH_APPROACH)+30);
  const active=startFlight(initial);
  assert.equal(active.phase,"flying");
  assert.equal(active.speed,FLIGHT_SPEEDS.launch);
  assert.ok(Math.abs(Math.hypot(active.velocity[0],active.velocity[2])*3.6-FLIGHT_SPEEDS.launch)<1e-9);
  assert.equal(initial.phase,"ready");
  const turning=stepFlight(active,{...idle,steer:1,climb:1},.1);
  const paused=pauseFlight(turning);
  assert.equal(stepFlight(paused,{...idle,boost:true},1,{x:12,z:4}),paused);
  assert.deepEqual(resumeFlight(paused).velocity,turning.velocity);
  assert.deepEqual(createFlight(),initial);
});

test("elapsed time and displacement are deterministic and stalled tabs are capped",()=>{
  const state=flying();
  const frame=stepFlight(state,idle,.1);
  assert.ok(frame.distance>0);
  assert.equal(frame.elapsed,.1);
  assert.deepEqual(stepFlight(state,idle,60),frame);
  assert.deepEqual(stepFlight(state,idle,.1),frame);
  for(const duration of [Number.NaN,Infinity,0,-1]) assert.equal(stepFlight(state,idle,duration),state);
});

test("terrain and curved-valley contacts recover safely without teleport velocity",()=>{
  const z=LAUNCH_APPROACH;
  for(const obstacle of [
    {altitude:terrainHeight(valleyCenter(z),z)-1},
    {x:valleyCenter(z)+valleyWidth(z)+10},
  ]) {
    const hit=stepFlight(flying({...obstacle,velocity:[20,-10,-50]}),idle,.1);
    assert.equal(hit.lives,2);
    assert.equal(hit.cooldown,2.5);
    assert.equal(hit.heading,0);
    assert.equal(hit.pitch,0);
    assert.equal(hit.yawRate,0);
    assert.equal(hit.velocity[1],0);
    const worldZ=LAUNCH_APPROACH-hit.distance;
    assert.ok(hit.altitude>=terrainHeight(hit.x,worldZ)+34.9);
    assert.ok(Math.abs(hit.x-valleyCenter(worldZ))<valleyWidth(worldZ));
    const protectedHit=stepFlight({...hit,...obstacle},idle,.1);
    assert.equal(protectedHit.lives,2);
    assert.ok(protectedHit.cooldown<hit.cooldown);
    assert.ok(protectedHit.altitude>terrainHeight(protectedHit.x,LAUNCH_APPROACH-protectedHit.distance)+4);
    const vulnerable=stepFlight({...protectedHit,...obstacle,cooldown:0},idle,.1);
    assert.equal(vulnerable.lives,1);
  }
});

test("the last collision ends the flight and freezes its physics",()=>{
  const lost=stepFlight(flying({lives:1,altitude:0}),idle,.1);
  assert.equal(lost.phase,"complete");
  assert.equal(lost.outcome,"crashed");
  assert.equal(lost.lives,0);
  assert.equal(stepFlight(lost,idle,.1),lost);
});

test("arrival ends at route length and retains the physical result",()=>{
  const distance=ROUTE_LENGTH-1,z=LAUNCH_APPROACH-distance;
  const arrived=stepFlight(flying({distance,x:valleyCenter(z),altitude:terrainHeight(valleyCenter(z),z)+45}),idle,.1);
  assert.equal(arrived.distance,ROUTE_LENGTH);
  assert.equal(arrived.phase,"complete");
  assert.equal(arrived.outcome,"arrived");
  assert.equal(stepFlight(arrived,idle,.1),arrived);
});

test("axes clamp, invalid axes remain neutral, and braking overrides boost",()=>{
  const state=flying();
  assert.deepEqual(stepFlight(state,{...idle,steer:99,climb:-99},.1),stepFlight(state,{...idle,steer:1,climb:-1},.1));
  assert.deepEqual(stepFlight(state,{...idle,steer:NaN,climb:Infinity},.1),stepFlight(state,idle,.1));
  const boosted=stepFlight(state,{...idle,boost:true},.1);
  const braked=stepFlight(state,{...idle,boost:true,brake:true},.1);
  assert.ok(boosted.speed>state.speed);
  assert.ok(braked.speed<state.speed);
});

test("the winding route remains traversable at cruise and boost",()=>{
  for(const [boost,target,minDuration,maxDuration] of [[false,230,280,305],[true,340,190,210]] as const) {
    let state=flying(),frames=0;
    while(state.phase==="flying"&&frames++<24000) state=stepFlight(state,followValley(state,boost),1/60);
    assert.equal(state.outcome,"arrived");
    assert.equal(state.distance,ROUTE_LENGTH);
    assert.equal(state.lives,3);
    assert.ok(Math.abs(state.speed-target)<1);
    assert.ok(state.elapsed>minDuration&&state.elapsed<maxDuration,`unexpected journey time ${state.elapsed}`);
  }
});

test("boost accelerates smoothly and airbrakes settle at their lower trim speed",()=>{
  const first=stepFlight(flying(),{...idle,boost:true},1/60);
  assert.ok(first.speed>180&&first.speed<340);
  let state=flying({speed:340});
  for(let frame=0;frame<600;frame++) state=stepFlight(state,{...followValley(state),boost:true,brake:true},1/60);
  assert.ok(Math.abs(state.speed-100)<.3);
  assert.ok(state.distance<(340/3.6)*state.elapsed);
});

test("steering and climbing apply gradual acceleration and preserve momentum on release",()=>{
  const before=flying({yaw:0,velocity:[0,0,-50]});
  const first=stepFlight(before,{...idle,steer:1,climb:1},.1);
  assert.ok(first.x>before.x&&first.x<before.x+.1);
  assert.ok(first.altitude>before.altitude&&first.altitude<before.altitude+.1);
  assert.ok(first.yaw>before.yaw&&first.heading<0&&first.pitch>0);
  const released=stepFlight(first,idle,1/60);
  assert.ok(released.velocity[0]>first.velocity[0]*.9);
  assert.ok(released.velocity[1]>first.velocity[1]*.9);
});

test("wind changes ground motion while physical integration remains frame-rate independent",()=>{
  const run=(fps:number,wind={x:0,z:0})=>{
    let state=flying();
    for(let frame=0;frame<fps*2;frame++) state=stepFlight(state,{...idle,steer:.3,climb:.2},1/fps,wind);
    return state;
  };
  const calm=run(60),windy=run(60,{x:10,z:-3});
  assert.ok(windy.x>calm.x+3);
  assert.ok(windy.distance>calm.distance+1);
  const slow=run(30,{x:4,z:-2}),fast=run(120,{x:4,z:-2});
  for(const key of ["x","altitude","distance","yaw","pitch","heading","speed"] as const)
    assert.ok(Math.abs(slow[key]-fast[key])<1e-7,`frame-dependent ${key}`);
});

test("the ceiling removes outward vertical momentum without damage",()=>{
  const state=stepFlight(flying({altitude:FLIGHT_CEILING-.1,velocity:[0,25,-60]}),{...idle,climb:1},.1);
  assert.equal(state.altitude,FLIGHT_CEILING);
  assert.equal(state.velocity[1],0);
  assert.equal(state.lives,3);
});

test("route waypoints preserve the long journey and safely clamp progress",()=>{
  assert.equal(ROUTE_LENGTH,18000);
  assert.equal(WORLD_TILE_LENGTH,2400);
  assert.equal(LAUNCH_APPROACH,250);
  assert.equal(ROUTE_STOPS.length,6);
  for(const value of [-100,Number.NaN,-Infinity]) assert.equal(routeStopAt(value),ROUTE_STOPS[0]);
  ROUTE_STOPS.forEach((stop,index)=>{
    assert.equal(routeStopAt(stop.distance),stop);
    if(index>0){assert.ok(stop.distance>ROUTE_STOPS[index-1].distance);assert.equal(routeStopAt(stop.distance-.01),ROUTE_STOPS[index-1]);}
  });
  assert.equal(routeStopAt(ROUTE_LENGTH+5000),ROUTE_STOPS.at(-1));
  assert.equal(routeStopAt(Infinity),ROUTE_STOPS.at(-1));
});


test("sleigh and reindeer contact the rendered cottage roofs and recover above them", async () => {
  const { DELIVERY_TARGETS } = await import("./houses.ts");
  const house = DELIVERY_TARGETS[0];
  const state = flying({
    x: house.x, distance: LAUNCH_APPROACH - house.z,
    altitude: house.y + house.height - 1, yaw: 0, velocity: [0, 0, -30], speed: 108,
  });
  const hit = stepFlight(state, idle, 1 / 60);
  assert.equal(hit.lives, 2);
  assert.ok(hit.altitude >= house.y + house.height + 10);
  assert.ok(hit.velocity.every(Number.isFinite));
  const protectedHit = stepFlight({ ...state, cooldown: 1 }, idle, 1 / 60);
  assert.equal(protectedHit.lives, 3);
  assert.ok(protectedHit.altitude >= house.y + house.height + 10);
});

test("pitching the leading reindeer into a cottage roof causes contact", async () => {
  const { DELIVERY_TARGETS } = await import("./houses.ts");
  const { cottageRoofHeight } = await import("./delivery.ts");
  const house = DELIVERY_TARGETS.find((target) => target.id === "0:0")!;
  const state = flying({
    x: house.x, distance: LAUNCH_APPROACH - house.z - 23,
    altitude: house.y + cottageRoofHeight(0, 0, house) + 3,
    yaw: 0, pitch: -0.32, velocity: [0, -5, -50], speed: 180,
  });
  const hit = stepFlight(state, { ...idle, climb: -1 }, 0.001);
  assert.equal(hit.lives, 2);
  assert.ok(hit.altitude > house.y + house.height + 9);
});
