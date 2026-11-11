import test from "node:test";
import assert from "node:assert/strict";
import { createLandingMarker } from "./package-models.ts";
import { STRIDE } from "./geometry.ts";
import { terrainHeight } from "./terrain.ts";

test("the landing circle is large enough to read from the chase camera", () => {
  for (const kind of ["perfect", "close", "miss"] as const) {
    const mesh = createLandingMarker(kind);
    assert.ok(mesh.every(Number.isFinite));
    assert.equal(mesh.length % (STRIDE * 3), 0);
    let radius = 0;
    for (let i = 0; i < mesh.length; i += STRIDE) {
      radius = Math.max(radius, Math.hypot(mesh[i], mesh[i + 2]));
      assert.ok(mesh[i + 9] >= 1);
    }
    assert.ok(radius >= 7.5 && radius < 9, `expected a visible ground ring, got ${radius}`);
    assert.ok(mesh.length / (STRIDE * 3) < 1000);
  }
});

test("the ground circle follows terrain at every vertex, including tile seams", () => {
  for (const z of [-2399, -2401, -9599]) {
    const surface = (x: number, localZ: number) => terrainHeight(43 + x, z + localZ);
    const mesh = createLandingMarker("close", surface);
    for (let i = 0; i < mesh.length; i += STRIDE) {
      const clearance = mesh[i + 1] - surface(mesh[i], mesh[i + 2]);
      assert.ok(clearance > 0.1 && clearance < 0.5, `ring clips the terrain: ${clearance}`);
    }
  }
});
