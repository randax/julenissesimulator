import test from "node:test";
import assert from "node:assert/strict";
import { stepFlightBody, type FlightBody, type FlightForcing } from "./flight-physics.ts";

const initial = (): FlightBody => ({velocity:[0,0,-50],yaw:0,pitch:0,bank:0,yawRate:0});
const cruise: FlightForcing = {steer:0,climb:0,targetSpeed:230/3.6};
const simulate = (body:FlightBody, input:FlightForcing, seconds:number, fps=60, wind={x:0,z:0}) => {
  const position=[0,0,0];
  for(let frame=0;frame<Math.round(seconds*fps);frame++) {
    const next=stepFlightBody(body,input,1/fps,wind);
    next.displacement.forEach((value,axis)=>{position[axis]+=value;});
    body=next;
  }
  return {body,position};
};
const near=(actual:number,expected:number,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);

test("banked steering changes course through acceleration rather than instant strafing",()=>{
  const first=stepFlightBody(initial(),{...cruise,steer:1},0.1);
  assert.ok(first.bank<0 && first.yaw>0 && first.yawRate>0);
  assert.ok(first.displacement[0]>0 && first.displacement[0]<0.1);
  const right=simulate(initial(),{...cruise,steer:1},2);
  const left=simulate(initial(),{...cruise,steer:-1},2);
  assert.ok(right.body.velocity[0]>10 && right.position[0]>5);
  near(right.body.velocity[0],-left.body.velocity[0]);
  near(right.body.yaw,-left.body.yaw);
});

test("releasing the reins levels bank while retaining heading and momentum",()=>{
  const turn=simulate(initial(),{...cruise,steer:1},1.5).body;
  const release=stepFlightBody(turn,cruise,1/60);
  assert.ok(release.velocity[0]>turn.velocity[0]*0.98);
  assert.ok(release.displacement[0]>0);
  const settled=simulate(turn,cruise,2).body;
  assert.ok(Math.abs(settled.bank)<0.002);
  assert.ok(settled.yaw>turn.yaw && settled.velocity[0]>0);
});

test("gravity and lift trim preserve level flight while low airspeed loses height",()=>{
  const level=simulate(initial(),cruise,5);
  near(level.position[1],0);
  near(level.body.velocity[1],0);
  const stalled=stepFlightBody({...initial(),velocity:[0,0,0]},{...cruise,targetSpeed:0},0.1);
  assert.ok(stalled.velocity[1]<-0.8 && stalled.displacement[1]<0);
});

test("pitch changes lift gradually and climb velocity settles after release",()=>{
  const first=stepFlightBody(initial(),{...cruise,climb:1},1/60);
  assert.ok(first.velocity[1]>0 && first.velocity[1]<0.1);
  const climb=simulate(initial(),{...cruise,climb:1},2);
  const dive=simulate(initial(),{...cruise,climb:-1},2);
  assert.ok(climb.position[1]>8 && climb.body.velocity[1]>8);
  assert.ok(dive.position[1]<-8 && dive.body.velocity[1]<-5);
  const release=stepFlightBody(climb.body,cruise,1/60);
  assert.ok(release.velocity[1]>climb.body.velocity[1]*0.95);
  assert.ok(Math.abs(simulate(climb.body,cruise,5).body.velocity[1])<0.15);
});

test("quadratic drag reaches throttle trim and airbrakes shed speed gradually",()=>{
  for(const speed of [230,340]) {
    const result=simulate(initial(),{...cruise,targetSpeed:speed/3.6},30).body;
    near(Math.hypot(result.velocity[0],result.velocity[2])*3.6,speed,0.01);
  }
  const fast={...initial(),velocity:[0,0,-340/3.6] as [number,number,number]};
  const first=stepFlightBody(fast,{...cruise,targetSpeed:100/3.6},1/60);
  assert.ok(-first.velocity[2]>100/3.6 && -first.velocity[2]<340/3.6);
  const stopped=simulate(fast,{...cruise,targetSpeed:100/3.6},10).body;
  near(-stopped.velocity[2]*3.6,100,0.2);
});

test("wind acts through air-relative drag and produces persistent sideways drift",()=>{
  const calm=simulate(initial(),cruise,8);
  const windy=simulate(initial(),cruise,8,60,{x:15,z:0});
  assert.ok(windy.position[0]>60 && windy.body.velocity[0]>12);
  near(calm.position[0],0);
  near(windy.body.yaw,0);
});

test("substeps keep force integration consistent across render frame rates",()=>{
  for(const input of [cruise,{...cruise,steer:.6,climb:.4}]) {
    const slow=simulate(initial(),input,2,30,{x:4,z:-2});
    const fast=simulate(initial(),input,2,120,{x:4,z:-2});
    slow.position.forEach((value,axis)=>near(value,fast.position[axis]));
    slow.body.velocity.forEach((value,axis)=>near(value,fast.body.velocity[axis]));
    near(slow.body.yaw,fast.body.yaw);
  }
});

test("invalid forcing remains finite and stalled frames cannot skip the simulation",()=>{
  const source=initial();
  const bad=stepFlightBody(source,{steer:Number.NaN,climb:Infinity,targetSpeed:Infinity},1,{x:NaN,z:Infinity});
  assert.ok([...bad.velocity,...bad.displacement,bad.yaw,bad.pitch,bad.bank].every(Number.isFinite));
  const capped=stepFlightBody(source,cruise,.1);
  assert.deepEqual(stepFlightBody(source,cruise,10),capped);
  const frozen=stepFlightBody(source,cruise,0);
  assert.deepEqual(frozen.velocity,source.velocity);
  assert.deepEqual(frozen.displacement,[0,0,0]);
  assert.deepEqual(source,initial());
});
