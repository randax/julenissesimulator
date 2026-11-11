import {
  MeshBuilder,
  colour,
  normalize,
  type Colour,
  type Vec3,
} from "./geometry.ts";
import { WORLD_TILE_LENGTH } from "./route.ts";

const snow = colour(0xd9e3f0);
const pearl = colour(0xe8eaf0);
const rock = colour(0x4e627d);
const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));
const smooth = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash = (x: number, y: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};
function noise(x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const sx = smooth(0, 1, x - ix),
    sz = smooth(0, 1, z - iz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz),
    c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}
const mix = (a: Colour, b: Colour, amount: number): Colour =>
  a.map((v, index) => v + (b[index] - v) * amount) as Colour;
const tilePhase = (z: number) => (z / WORLD_TILE_LENGTH) * Math.PI * 2;
export const streamCenter = (z: number) =>
  Math.sin(tilePhase(z) * 3) * 10 + Math.sin(tilePhase(z)) * 8;
export const pathCenter = (z: number) =>
  streamCenter(z) + 14 + Math.sin(tilePhase(z) * 5 + 0.5) * 7;

/** Quintic blending matches values and first derivatives at both tile edges. */
function periodicSample(z: number, sample: (localZ: number) => number): number {
  const localZ = -(
    ((-z % WORLD_TILE_LENGTH) + WORLD_TILE_LENGTH) %
    WORLD_TILE_LENGTH
  );
  const t = -localZ / WORLD_TILE_LENGTH;
  const blend = t * t * t * (t * (t * 6 - 15) + 10);
  return (
    sample(localZ) * (1 - blend) + sample(localZ + WORLD_TILE_LENGTH) * blend
  );
}

export function terrainHeight(x: number, z: number): number {
  return periodicSample(z, (localZ) => rawHeight(x, localZ));
}

/** A low flying corridor opens between cliff-backed, snow-laden valley sides. */
function rawHeight(x: number, z: number): number {
  const channel = Math.abs(x - streamCenter(z));
  const gentle =
    1.45 +
    Math.sin(x * 0.031 + z * 0.008) * 0.55 +
    Math.sin(x * 0.061 - z * 0.021) * 0.24 +
    (noise(x * 0.033, z * 0.033) - 0.5) * 0.65;
  const bank = Math.exp(-(((channel - 5.4) / 2.3) ** 2)) * 0.72;
  const bed = Math.exp(-((channel / 2.7) ** 2)) * 1.0;
  const side = x < 0 ? -1 : 1;
  const edge = Math.abs(x) - (151 + Math.sin(z * 0.0026 + side * 0.9) * 14);
  const shoulder =
    smooth(0, 94, edge) * 106 +
    smooth(75, 300, edge) * 84 +
    smooth(260, 650, edge) * 36;
  // Long spines and intervening saddles vary the skyline; shorter gullies cut the faces.
  const spine = 0.69 + noise(z * 0.0028, side * 7.1) * 0.48;
  const summits =
    Math.pow(0.5 + Math.sin(z * 0.0068 + side * 1.4) * 0.5, 3) * 111 +
    Math.pow(0.5 + Math.sin(z * 0.013 - side * 2.2 + x * 0.003) * 0.5, 4) * 44;
  const buttresses =
    (1 - Math.abs(Math.sin(z * 0.032 + x * 0.008 + side))) * 23;
  const gullies = Math.pow(Math.abs(Math.sin(z * 0.047 + x * 0.014)), 2.5) * 24;
  const erosion =
    (noise(x * 0.018, z * 0.012) - 0.5) * 49 +
    Math.sin(edge * 0.11 + z * 0.015) * 5.5 +
    (noise(x * 0.08, z * 0.065) - 0.5) * 8 +
    buttresses -
    gullies;
  const cliff = Math.max(
    0,
    shoulder * (1 + (spine - 1) * smooth(24, 100, edge)) +
      summits * smooth(65, 250, edge) +
      erosion * smooth(0, 65, edge),
  );
  const drift =
    smooth(22, 120, Math.abs(x)) *
    (noise(x * 0.025, z * 0.025) * 1.6 +
      Math.sin(z * 0.017 + x * 0.021) * 0.65);
  return gentle + bank - bed + drift + cliff;
}

function normalAt(x: number, z: number): Vec3 {
  const step = 0.7;
  return normalize([
    terrainHeight(x - step, z) - terrainHeight(x + step, z),
    step * 2,
    terrainHeight(x, z - step) - terrainHeight(x, z + step),
  ]);
}
function terrainTint(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  normals: [Vec3, Vec3, Vec3],
): Colour {
  const x = (a[0] + b[0] + c[0]) / 3,
    y = (a[1] + b[1] + c[1]) / 3,
    z = (a[2] + b[2] + c[2]) / 3;
  const up = (normals[0][1] + normals[1][1] + normals[2][1]) / 3;
  const ledges = periodicSample(
    z,
    (localZ) =>
      0.8 +
      Math.sin(y * 0.12 + x * 0.03 + localZ * 0.015) * 0.22 +
      (noise(x * 0.06, localZ * 0.045) - 0.5) * 0.32,
  );
  const exposed = clamp(smooth(0.12, 0.5, 1 - up) * smooth(15, 55, y) * ledges);
  const base = mix(snow, pearl, smooth(0.65, 1, up) * 0.37);
  return mix(base, rock, exposed);
}

export function addTerrain(mesh: MeshBuilder, distant = false): void {
  const positiveX: number[] = [];
  for (let x = 0; x <= 184; x += 8) positiveX.push(x);
  for (let x = 192; x <= 600; x += 8) positiveX.push(x);
  for (let x = 670; x <= 1300; x += 70) positiveX.push(x);
  const xSteps = [
    ...positiveX
      .slice(1)
      .reverse()
      .map((x) => -x),
    ...positiveX,
  ];
  const zSteps: number[] = [];
  const longitudinalStep = distant ? 48 : 12;
  for (let z = 0; z > -WORLD_TILE_LENGTH; z -= longitudinalStep) zSteps.push(z);
  zSteps.push(-WORLD_TILE_LENGTH);
  const points = zSteps.map((z) =>
    xSteps.map((x) => [x, terrainHeight(x, z), z] as Vec3),
  );
  const normals = zSteps.map((z) => xSteps.map((x) => normalAt(x, z)));
  const colours = points.map((row, r) =>
    row.map((p, c) =>
      terrainTint(p, p, p, [normals[r][c], normals[r][c], normals[r][c]]),
    ),
  );
  for (let row = 0; row < zSteps.length - 1; row++) {
    for (let column = 0; column < xSteps.length - 1; column++) {
      const a = points[row][column],
        b = points[row][column + 1],
        c = points[row + 1][column + 1],
        d = points[row + 1][column];
      const na = normals[row][column],
        nb = normals[row][column + 1],
        nc = normals[row + 1][column + 1],
        nd = normals[row + 1][column];
      const first: [Vec3, Vec3, Vec3] = [na, nb, nc],
        second: [Vec3, Vec3, Vec3] = [na, nc, nd];
      mesh.surfaceColours(a, b, c, first, [
        colours[row][column],
        colours[row][column + 1],
        colours[row + 1][column + 1],
      ]);
      mesh.surfaceColours(a, c, d, second, [
        colours[row][column],
        colours[row + 1][column + 1],
        colours[row + 1][column],
      ]);
    }
  }
  // Ice and compressed tracks are shaded directly on this continuous surface.
  if (distant) return;
  // Half-buried stones retain a visible dark underside beneath thick rounded caps.
  for (let index = 0; index < 88; index++) {
    const side = index % 2 ? -1 : 1;
    const x = side * (31 + hash(index, 5) * 130),
      z = -16 - hash(index, 17) * (WORLD_TILE_LENGTH - 32);
    const radius = 1.8 + hash(index, 21) * 4.3;
    const y = terrainHeight(x, z);
    mesh.ellipsoid(
      [x, y - radius * 0.22, z],
      [radius, radius * 0.61, radius * 0.82],
      colour(0x6f8095),
      9,
      6,
    );
    mesh.ellipsoid(
      [x - radius * 0.05, y + radius * 0.21, z],
      [radius * 1.04, radius * 0.36, radius * 0.84],
      pearl,
      12,
      7,
    );
  }
}
