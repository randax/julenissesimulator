import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { once } from "node:events";

// Adapt only the platform messaging API; run the actual browser worker module.
const bridge = `
  import {parentPort,workerData} from 'node:worker_threads';
  globalThis.self={onmessage:null,postMessage:(value,options)=>parentPort.postMessage(value,options?.transfer)};
  parentPort.on('message',value=>self.onmessage({data:value}));
  await import(workerData.module);
  parentPort.postMessage({ready:true});
`;

test("the scenery worker transfers two successive unique sections without detaching shared assets", {timeout: 15000}, async () => {
  const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(bridge)}`), {
    workerData: {module: new URL("./world-worker.ts", import.meta.url).href},
  });
  try {
    await once(worker, "message");
    let firstSample: number[] | undefined;
    for (const tile of [1, 2]) {
      const response = once(worker, "message");
      worker.postMessage(tile);
      const [section] = await response;
      assert.equal(section.tile, tile);
      assert.ok(!section.failed);
      assert.ok(section.mesh instanceof Float32Array && section.mesh.length > 1000);
      assert.ok(section.farMesh instanceof Float32Array && section.farMesh.length > 1000);
      assert.ok(section.trees.length > 1000 && section.lights.length > 0);
      const sample = Array.from(section.mesh.slice(0, 30)) as number[];
      assert.ok(sample.every(Number.isFinite));
      if (firstSample) assert.notDeepEqual(sample, firstSample);
      firstSample = sample;
    }
  } finally {
    await worker.terminate();
  }
});
