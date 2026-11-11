import { createWorld } from "./world.ts";

/** Build upcoming scenery off the animation thread; transfer geometry without copying it. */
self.onmessage = (event: MessageEvent<number>) => {
  const tile = event.data;
  try {
    const { mesh, farMesh, trees, lights } = createWorld(tile);
    self.postMessage({ tile, mesh, farMesh, trees, lights }, {
      transfer: [mesh.buffer, farMesh.buffer, trees.buffer, lights.buffer] as ArrayBuffer[],
    });
  } catch {
    self.postMessage({ tile, failed: true });
  }
};
