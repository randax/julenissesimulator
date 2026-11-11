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
/** Smooth global centreline: its unequal wavelengths never repeat at chunk boundaries. */
export const valleyCenter = (z: number) =>
  Math.sin(z / 1370) * 105 + Math.sin(z / 610) * 44 + Math.sin(z / 2910) * 26;

export const valleyWidth = (z: number) =>
  180 + Math.sin(z / 1830 + 0.8) * 25 + Math.sin(z / 740) * 15;

export const valleyFloor = (z: number) =>
  6.5 + Math.sin(z / 1620 + 0.3) * 4.0 + Math.sin(z / 510) * 2.1;

/** Shared shader channels use physical global Z, never recycled render coordinates. */
export const TERRAIN_CHANNELS_GLSL = `
  float valleyCenterAt(float z){return sin(z/1370.0)*105.0+sin(z/610.0)*44.0+sin(z/2910.0)*26.0;}
  float valleyFloorAt(float z){return 6.5+sin(z/1620.0+.3)*4.0+sin(z/510.0)*2.1;}
  float streamCenterAt(float z){return valleyCenterAt(z)+sin(z/360.0)*15.0+sin(z/910.0)*7.0;}
  float pathCenterAt(float z){return streamCenterAt(z)+18.0+sin(z/470.0+.5)*9.0;}
`;

/** Clockwise from -Z, matching the sleigh's forward [sin(yaw), 0, -cos(yaw)]. */
export const valleyHeading = (z: number) => Math.atan2(
  -(Math.cos(z / 1370) * 105 / 1370 + Math.cos(z / 610) * 44 / 610 + Math.cos(z / 2910) * 26 / 2910),
  1,
);

export const streamCenter = (z: number) =>
  valleyCenter(z) + Math.sin(z / 360) * 15 + Math.sin(z / 910) * 7;
export const pathCenter = (z: number) =>
  streamCenter(z) + 18 + Math.sin(z / 470 + 0.5) * 9;

/** Continuous world-space terrain, sampled identically by rendering and physics. */
export function terrainHeight(x: number, z: number): number {
  const relativeX = x - valleyCenter(z);
  const channel = Math.abs(x - streamCenter(z));
  const floor = valleyFloor(z);
  const gentle = floor + Math.sin(relativeX * 0.022 + z * 0.006) * 0.8 +
    Math.sin(relativeX * 0.047 - z * 0.012) * 0.35 +
    (noise(x * 0.024, z * 0.024) - 0.5) * 0.7;
  const bank = Math.exp(-(((channel - 5.5) / 2.3) ** 2)) * 0.7;
  const bed = Math.exp(-((channel / 2.8) ** 2)) * 1.5;
  const side = relativeX < 0 ? -1 : 1;
  const edge = Math.abs(relativeX) - valleyWidth(z);
  const shoulder = smooth(0, 100, edge) * 103 +
    smooth(80, 320, edge) * 87 + smooth(260, 650, edge) * 38;
  const spine = 0.69 + noise(z * 0.0028, side * 7.1) * 0.48;
  const summits =
    Math.pow(0.5 + Math.sin(z * 0.0068 + side * 1.4) * 0.5, 3) * 111 +
    Math.pow(0.5 + Math.sin(z * 0.013 - side * 2.2 + relativeX * 0.003) * 0.5, 4) * 44;
  const buttresses = (1 - Math.abs(Math.sin(z * 0.032 + relativeX * 0.008 + side))) * 23;
  const gullies = Math.pow(Math.abs(Math.sin(z * 0.047 + relativeX * 0.014)), 2.5) * 24;
  const erosion =
    (noise(x * 0.018, z * 0.012) - 0.5) * 49 +
    Math.sin(edge * 0.11 + z * 0.015) * 5.5 +
    (noise(x * 0.08, z * 0.065) - 0.5) * 8 + buttresses - gullies;
  const cliff = Math.max(0, shoulder * (1 + (spine - 1) * smooth(24, 100, edge)) +
    summits * smooth(65, 250, edge) + erosion * smooth(0, 65, edge));
  const drift = smooth(22, 145, Math.abs(relativeX)) *
    (noise(x * 0.025, z * 0.025) * 2.5 + Math.sin(z * 0.017 + relativeX * 0.021) * 1.1);
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
  const ledges = 0.8 + Math.sin(y * 0.12 + x * 0.03 + z * 0.015) * 0.22 +
    (noise(x * 0.06, z * 0.045) - 0.5) * 0.32;
  const exposed = clamp(smooth(0.12, 0.5, 1 - up) * smooth(15, 55, y) * ledges);
  const base = mix(snow, pearl, smooth(0.65, 1, up) * 0.37);
  return mix(base, rock, exposed);
}

export function addTerrain(mesh: MeshBuilder, distant = false, tile = 0): void {
  const origin = tile * WORLD_TILE_LENGTH;
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
    xSteps.map((x) => [x, terrainHeight(x, z - origin), z] as Vec3),
  );
  const normals = zSteps.map((z) => xSteps.map((x) => normalAt(x, z - origin)));
  const colours = points.map((row, r) =>
    row.map((p, c) =>
      terrainTint([p[0], p[1], p[2] - origin], [p[0], p[1], p[2] - origin],
        [p[0], p[1], p[2] - origin], [normals[r][c], normals[r][c], normals[r][c]]),
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
    const z = -16 - hash(index + tile * 173, 17) * (WORLD_TILE_LENGTH - 32);
    const x = valleyCenter(z - origin) + side * (31 + hash(index + tile * 71, 5) * 130);
    const radius = 1.8 + hash(index, 21) * 4.3;
    const y = terrainHeight(x, z - origin);
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
