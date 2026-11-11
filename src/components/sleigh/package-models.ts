import {
  MeshBuilder,
  STRIDE,
  colour,
  type Colour,
  type Vec3,
} from "./geometry.ts";

const GOLD = colour(0xe8bd72);
const GREEN = colour(0x90d6a9);
const ROSE = colour(0xe89b9b);

function ring(
  mesh: MeshBuilder,
  radius: number,
  height: number,
  thickness: number,
  tint: Colour,
) {
  const segments = 40;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    mesh.rod(
      [Math.cos(a) * radius, height, Math.sin(a) * radius],
      [Math.cos(b) * radius, height, Math.sin(b) * radius],
      thickness,
      tint,
      5,
    );
  }
}

function finishGuide(mesh: MeshBuilder): Float32Array {
  const vertices = mesh.build();
  for (let offset = STRIDE - 1; offset < vertices.length; offset += STRIDE)
    vertices[offset] = 1;
  return vertices;
}

function bow(mesh: MeshBuilder, tint: Colour) {
  for (const side of [-1, 1]) {
    const ribbonPoint = (angle: number, edge: number): Vec3 => [
      side * 0.12 * (1 - Math.cos(angle)),
      0.375 + Math.sin(angle / 2) * 0.11,
      Math.sin(angle) * 0.075 + edge * 0.018,
    ];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const b = ((i + 1) / 14) * Math.PI * 2;
      const p = ribbonPoint(a, -1);
      const q = ribbonPoint(a, 1);
      const r = ribbonPoint(b, 1);
      const s = ribbonPoint(b, -1);
      mesh.quad(p, q, r, s, tint).quad(s, r, q, p, tint);
    }
  }
  mesh.ellipsoid([0, 0.386, 0], [0.048, 0.035, 0.043], tint, 8, 4);
}

/** The 70 cm parcel body matches the delivery physics collision box. */
export function createPackageMeshes(): Float32Array[] {
  return [
    { paper: colour(0x943f39), ribbon: GOLD, lid: colour(0xab5047) },
    {
      paper: colour(0x31594c),
      ribbon: colour(0xe1cfac),
      lid: colour(0x3e6a59),
    },
    {
      paper: colour(0xb28b60),
      ribbon: colour(0x813d36),
      lid: colour(0xc09a6f),
    },
  ].map(({ paper, ribbon, lid }) => {
    const mesh = new MeshBuilder();
    mesh.box([0, 0, 0], [0.7, 0.7, 0.7], paper);
    mesh.box([0, 0.321, 0], [0.704, 0.058, 0.704], lid);
    for (const side of [-1, 1]) {
      mesh.box([side * 0.353, 0, 0], [0.012, 0.7, 0.085], ribbon);
      mesh.box([0, 0, side * 0.353], [0.085, 0.7, 0.012], ribbon);
      mesh.box([0, side * 0.354, 0], [0.085, 0.012, 0.708], ribbon);
      mesh.box([0, side * 0.354, 0], [0.708, 0.012, 0.085], ribbon);
    }
    bow(mesh, ribbon);
    mesh.rod([0.034, 0.391, 0.01], [0.15, 0.369, 0.155], 0.006, GOLD, 5);
    mesh.box([0.173, 0.365, 0.189], [0.085, 0.012, 0.12], GOLD);
    mesh.box([0.173, 0.373, 0.208], [0.045, 0.005, 0.008], colour(0x7b583b));
    return mesh.build();
  });
}

/** Local origin is the marker centre, positioned above a house by the scene. */
export function createHouseMarker(delivered: boolean): Float32Array {
  const mesh = new MeshBuilder();
  const tint = delivered ? GREEN : GOLD;
  const half = 0.45;
  for (const side of [-1, 1]) {
    for (const other of [-1, 1]) {
      mesh.rod(
        [-half, side * half, other * half],
        [half, side * half, other * half],
        0.026,
        tint,
        5,
      );
      mesh.rod(
        [side * half, -half, other * half],
        [side * half, half, other * half],
        0.026,
        tint,
        5,
      );
      mesh.rod(
        [side * half, other * half, -half],
        [side * half, other * half, half],
        0.026,
        tint,
        5,
      );
    }
    mesh.rod([0, -half, side * half], [0, half, side * half], 0.035, tint, 5);
  }
  mesh.rod([-half, half, 0], [half, half, 0], 0.035, tint, 5);
  mesh.rod([0, half, -half], [0, half, half], 0.035, tint, 5);
  for (const side of [-1, 1]) {
    mesh.rod([0, 0.47, 0], [side * 0.22, 0.66, 0], 0.03, tint, 5);
    mesh.rod([side * 0.22, 0.66, 0], [side * 0.29, 0.49, 0], 0.03, tint, 5);
    mesh.rod([side * 0.29, 0.49, 0], [0, 0.47, 0], 0.03, tint, 5);
  }
  ring(mesh, 2, -0.5, 0.035, tint);
  return finishGuide(mesh);
}

/** A terrain-following reticle with a dark outline so it stays readable on snow. */
export function createLandingMarker(
  kind: "perfect" | "close" | "miss",
  heightAt: (x: number, z: number) => number = () => 0,
  radius = 7.5,
): Float32Array {
  const mesh = new MeshBuilder();
  const tint = kind === "perfect" ? GREEN : kind === "close" ? GOLD : ROSE;
  const outline = colour(0x163848);
  const white = colour(0xfff0cf);
  const point = (x: number, z: number, lift: number): Vec3 => [
    x, heightAt(x, z) + lift, z,
  ];
  const band = (r: number, width: number, colour: Colour, lift: number) => {
    for (let i = 0; i < 64; i++) {
      const a = i * Math.PI / 32, b = (i + 1) * Math.PI / 32;
      const inner = r - width / 2, outer = r + width / 2;
      mesh.quad(
        point(Math.cos(a) * inner, Math.sin(a) * inner, lift),
        point(Math.cos(b) * inner, Math.sin(b) * inner, lift),
        point(Math.cos(b) * outer, Math.sin(b) * outer, lift),
        point(Math.cos(a) * outer, Math.sin(a) * outer, lift),
        colour, 1,
      );
    }
  };
  band(radius, radius * 0.13, outline, 0.18);
  band(radius, radius * 0.055, tint, 0.24);
  band(radius * 0.32, radius * 0.065, outline, 0.18);
  band(radius * 0.32, radius * 0.025, tint, 0.24);
  const cross = (width: number, tint: Colour, lift: number) => {
    const length = radius * 0.48;
    mesh.quad(point(-length, -width, lift), point(-length, width, lift),
      point(length, width, lift), point(length, -width, lift), tint, 1);
    mesh.quad(point(-width, -length, lift), point(-width, length, lift),
      point(width, length, lift), point(width, -length, lift), tint, 1);
  };
  cross(radius * 0.045, outline, 0.18);
  cross(radius * 0.014, white, 0.3);
  return mesh.build();
}
