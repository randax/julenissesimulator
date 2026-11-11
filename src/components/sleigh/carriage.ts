import {
  MeshBuilder,
  colour,
  cross,
  normalize,
  part,
  type Colour,
  type ModelPart,
  type Vec3,
} from "./geometry.ts";

const timber = colour(0x71452f),
  darkWood = colour(0x3d281f),
  honeyWood = colour(0x94704a);
const brass = colour(0xb89558),
  polished = colour(0xd0ad69),
  steel = colour(0x596269);
const leather = colour(0x553831),
  piping = colour(0x98705a),
  thread = colour(0xc2a081);
const plankTones = [
  0x70422d, 0x7d4b31, 0x6a402b, 0x795039, 0x6e432e, 0x84563b,
].map(colour);
const TAU = Math.PI * 2;

function chain(
  mesh: MeshBuilder,
  points: Vec3[],
  radius: number,
  tint: Colour,
  segments = 7,
) {
  for (let i = 1; i < points.length; i++)
    mesh.rod(points[i - 1], points[i], radius, tint, segments);
}
function oval(
  mesh: MeshBuilder,
  center: Vec3,
  radiusX: number,
  radiusY: number,
  tint: Colour,
  tube = 0.025,
  segments = 28,
) {
  const points: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    points.push([
      center[0] + Math.cos(a) * radiusX,
      center[1] + Math.sin(a) * radiusY,
      center[2],
    ]);
  }
  chain(mesh, points, tube, tint, 6);
}
function rivet(mesh: MeshBuilder, p: Vec3, radius = 0.045) {
  mesh.ellipsoid(p, [radius, radius, radius * 0.7], polished, 6, 3);
}

const widthAt = (z: number) =>
  2.46 +
  0.2 * Math.sin(((z + 3.4) / 6.8) * Math.PI) -
  0.34 * Math.pow(Math.max(0, -z) / 3.4, 4);
const rimAt = (z: number) =>
  2.65 +
  0.72 * Math.pow(Math.max(0, -z) / 3.4, 3) +
  0.09 * Math.pow(z / 3.4, 2);
function hullPoint(side: number, z: number, u: number, inset = 0): Vec3 {
  const radius =
    widthAt(z) * (0.69 + 0.31 * Math.sin((u * Math.PI) / 2)) - inset;
  return [side * radius, 1.02 + u * (rimAt(z) - 1.02), z];
}
function hullNormal(side: number, z: number, u: number): Vec3 {
  const below = hullPoint(side, z, Math.max(0, u - 0.002)),
    above = hullPoint(side, z, Math.min(1, u + 0.002));
  const before = hullPoint(side, z - 0.002, u),
    after = hullPoint(side, z + 0.002, u);
  const up = above.map((value, i) => value - below[i]) as Vec3;
  const along = after.map((value, i) => value - before[i]) as Vec3;
  const n = normalize(cross(up, along));
  return side > 0 ? n : (n.map((value) => -value) as Vec3);
}
function curvedHull(mesh: MeshBuilder) {
  mesh.box([0, 1.15, 0], [3.75, 0.36, 6.7], darkWood);
  // Each timber strake follows the boat-like cross section and the rising prow.
  const rows = 6,
    steps = 28;
  for (const side of [-1, 1])
    for (let row = 0; row < rows; row++)
      for (let step = 0; step < steps; step++) {
        const z = -3.4 + (step / steps) * 6.8,
          zn = -3.4 + ((step + 1) / steps) * 6.8;
        const u = row / rows,
          un = (row + 1) / rows;
        for (const inset of [0, 0.15]) {
          let points = [
            hullPoint(side, z, u, inset),
            hullPoint(side, z, un, inset),
            hullPoint(side, zn, un, inset),
            hullPoint(side, zn, u, inset),
          ];
          let normals = [
            hullNormal(side, z, u),
            hullNormal(side, z, un),
            hullNormal(side, zn, un),
            hullNormal(side, zn, u),
          ];
          if (inset) {
            normals = normals.map((n) => n.map((value) => -value) as Vec3);
            points = [points[0], points[3], points[2], points[1]];
            normals = [normals[0], normals[3], normals[2], normals[1]];
          }
          if (side < 0) {
            points = [points[0], points[3], points[2], points[1]];
            normals = [normals[0], normals[3], normals[2], normals[1]];
          }
          mesh.surface(
            points[0],
            points[1],
            points[2],
            [normals[0], normals[1], normals[2]],
            inset ? timber : plankTones[row],
          );
          mesh.surface(
            points[0],
            points[2],
            points[3],
            [normals[0], normals[2], normals[3]],
            inset ? timber : plankTones[row],
          );
        }
      }
  for (const side of [-1, 1]) {
    for (let row = 1; row < rows; row++) {
      const points: Vec3[] = [];
      for (let step = 0; step <= 14; step++) {
        const p = hullPoint(side, -3.4 + (step / 14) * 6.8, row / rows);
        p[0] += side * 0.012;
        points.push(p);
      }
      chain(mesh, points, 0.018, darkWood, 4);
    }
    const rim: Vec3[] = [],
      innerRim: Vec3[] = [];
    for (let step = 0; step <= 32; step++) {
      const z = -3.4 + (step / 32) * 6.8,
        p = hullPoint(side, z, 1);
      rim.push(p);
      innerRim.push([p[0] - side * 0.13, p[1] - 0.09, p[2]]);
    }
    chain(mesh, rim, 0.09, brass, 8);
    chain(mesh, innerRim, 0.04, honeyWood, 6);
    for (const z of [-2.8, -0.95, 1.1, 2.9])
      for (const u of [0.17, 0.36, 0.55, 0.74, 0.92]) {
        const p = hullPoint(side, z, u);
        p[0] += side * 0.035;
        rivet(mesh, p, 0.036);
      }
    // Fine cast scrollwork is raised slightly proud of the timber side panels.
    for (const originZ of [-1.35, 1.15]) {
      const points: Vec3[] = [];
      for (let i = 0; i <= 30; i++) {
        const angle = (i / 30) * Math.PI * 3.6,
          radius = 0.35 * (1 - i / 42);
        const z = originZ + Math.cos(angle) * radius;
        points.push([
          side * (widthAt(z) * 0.98 + 0.04),
          2.08 + Math.sin(angle) * radius * 0.8,
          z,
        ]);
      }
      chain(mesh, points, 0.025, polished, 5);
    }
  }
  // Deck boards remain visible around the passengers' feet and cargo.
  for (let strip = 0; strip < 10; strip++)
    mesh.box(
      [-1.93 + strip * 0.43, 1.4, -0.02],
      [0.405, 0.12, 6.3],
      strip % 2 ? timber : honeyWood,
    );
}

function rearPoint(x: number, u: number): Vec3 {
  const top = 2.62 + 0.18 * Math.pow(x / 2.48, 2);
  return [x, 1.07 + u * (top - 1.07), 3.36 + 0.24 * (1 - Math.pow(x / 2.5, 2))];
}
function rearBoard(mesh: MeshBuilder) {
  const columns = 24,
    rows = 6;
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const x = -2.48 + (column / columns) * 4.96,
        xn = -2.48 + ((column + 1) / columns) * 4.96,
        u = row / rows,
        un = (row + 1) / rows;
      const a = rearPoint(x, u),
        b = rearPoint(xn, u),
        c = rearPoint(xn, un),
        d = rearPoint(x, un);
      const normal = (px: number): Vec3 => normalize([px * 0.077, 0, 1]);
      mesh.surface(
        a,
        b,
        c,
        [normal(x), normal(xn), normal(xn)],
        plankTones[(row + 1) % plankTones.length],
      );
      mesh.surface(
        a,
        c,
        d,
        [normal(x), normal(xn), normal(x)],
        plankTones[(row + 1) % plankTones.length],
      );
      mesh.quad(
        [a[0], a[1], a[2] - 0.16],
        [d[0], d[1], d[2] - 0.16],
        [c[0], c[1], c[2] - 0.16],
        [b[0], b[1], b[2] - 0.16],
        timber,
      );
    }
  for (const u of [0, 1]) {
    const points: Vec3[] = [];
    for (let column = 0; column <= 32; column++)
      points.push(rearPoint(-2.48 + (column / 32) * 4.96, u));
    chain(mesh, points, u ? 0.075 : 0.055, brass, 8);
  }
  for (let row = 1; row < rows; row++) {
    const points: Vec3[] = [];
    for (let column = 0; column <= 16; column++) {
      const p = rearPoint(-2.48 + (column / 16) * 4.96, row / rows);
      p[2] += 0.013;
      points.push(p);
    }
    chain(mesh, points, 0.018, darkWood, 4);
  }
  // Rear emblem reads from the centered chase camera: an inlaid Nordic star.
  mesh.ellipsoid([0, 1.92, 3.64], [0.47, 0.43, 0.055], darkWood, 20, 8);
  oval(mesh, [0, 1.92, 3.705], 0.46, 0.42, brass, 0.027, 32);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU,
      dx = Math.cos(angle),
      dy = Math.sin(angle),
      length = i % 2 ? 0.27 : 0.35;
    mesh.rod(
      [dx * 0.08, 1.92 + dy * 0.08, 3.72],
      [dx * length, 1.92 + dy * length, 3.72],
      0.024,
      polished,
      5,
    );
    if (i % 2 === 0)
      for (const sign of [-1, 1])
        mesh.rod(
          [dx * length * 0.72, 1.92 + dy * length * 0.72, 3.72],
          [
            dx * length * 0.49 - dy * 0.08 * sign,
            1.92 + dy * length * 0.49 + dx * 0.08 * sign,
            3.72,
          ],
          0.017,
          polished,
          4,
        );
  }
  for (const side of [-1, 1]) {
    const scroll: Vec3[] = [];
    for (let i = 0; i <= 38; i++) {
      const t = i / 38,
        angle = t * Math.PI * 3.4,
        radius = 0.31 * (1 - t * 0.72),
        x = side * (1.03 + Math.cos(angle) * radius);
      scroll.push([x, 1.91 + Math.sin(angle) * radius, 3.64 - 0.038 * x * x]);
    }
    chain(mesh, scroll, 0.024, brass, 5);
    for (const y of [1.27, 2.37]) {
      mesh.box([side * 2.26, y, 3.4], [0.23, 0.34, 0.1], brass);
      rivet(mesh, [side * 2.26, y + 0.1, 3.47], 0.035);
      rivet(mesh, [side * 2.26, y - 0.1, 3.47], 0.035);
    }
  }
}

function runners(mesh: MeshBuilder) {
  const runner: Vec3[] = [];
  for (let i = 0; i <= 16; i++) runner.push([0, 0.1, 4.2 - (i / 16) * 8.05]);
  for (let i = 1; i <= 30; i++) {
    const angle = -Math.PI / 2 + (i / 30) * Math.PI * 1.1;
    runner.push([
      0,
      0.9 + Math.sin(angle) * 0.8,
      -3.85 - Math.cos(angle) * 1.6,
    ]);
  }
  for (const side of [-1, 1]) {
    const points = runner.map(([x, y, z]) => [x + side * 2.88, y, z] as Vec3);
    chain(mesh, points, 0.12, steel, 10);
    chain(
      mesh,
      points.map(([x, y, z]) => [x + side * 0.075, y + 0.085, z] as Vec3),
      0.035,
      polished,
      6,
    );
    for (const z of [-2.45, 1.9]) {
      mesh.rod([side * 2.88, 0.19, z], [side * 2.43, 1.2, z], 0.14, brass, 10);
      mesh.rod(
        [side * 2.88, 0.22, z - 0.36],
        [side * 2.43, 1.15, z + 0.32],
        0.07,
        steel,
        7,
      );
      mesh.box([side * 2.88, 0.24, z], [0.38, 0.13, 0.65], steel);
      for (const offset of [-0.21, 0.21])
        rivet(mesh, [side * 2.88, 0.33, z + offset], 0.047);
      mesh.box([side * 2.45, 1.12, z], [0.28, 0.38, 0.46], brass);
    }
    mesh.rod(
      [side * 2.85, 0.4, -2.45],
      [side * 1.93, 1.12, 1.9],
      0.075,
      steel,
      8,
    );
  }
  for (const z of [-2.45, 1.9]) {
    mesh.rod([-2.87, 0.34, z], [2.87, 0.34, z], 0.1, steel, 8);
    mesh.rod([-2.4, 1.05, z], [2.4, 1.05, z], 0.105, timber, 8);
  }
}

function upholstery(mesh: MeshBuilder) {
  mesh.box([0, 1.65, -0.12], [4.45, 0.38, 1.95], darkWood);
  for (const x of [-1.1, 1.1]) {
    mesh.ellipsoid([x, 1.84, -0.17], [1.065, 0.235, 0.82], leather, 22, 10);
    mesh.ellipsoid([x, 2.52, 0.52], [1.025, 0.68, 0.225], leather, 20, 10);
    oval(mesh, [x, 2.52, 0.754], 0.96, 0.61, piping, 0.025, 32);
    const seatRim: Vec3[] = [];
    for (let i = 0; i <= 38; i++) {
      const a = (i / 38) * TAU;
      seatRim.push([x + Math.cos(a) * 1.01, 1.9, -0.17 + Math.sin(a) * 0.77]);
    }
    chain(mesh, seatRim, 0.025, piping, 6);
    for (const dx of [-0.48, 0, 0.48])
      for (const dy of [-0.27, 0.18]) {
        mesh.ellipsoid(
          [x + dx, 2.52 + dy, 0.759],
          [0.058, 0.058, 0.028],
          darkWood,
          8,
          4,
        );
        for (const sign of [-1, 1])
          mesh.rod(
            [x + dx - 0.22, 2.52 + dy + sign * 0.19, 0.74],
            [x + dx + 0.22, 2.52 + dy - sign * 0.19, 0.74],
            0.012,
            piping,
            4,
          );
      }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU,
        b = a + 0.045;
      mesh.rod(
        [x + Math.cos(a) * 0.93, 2.52 + Math.sin(a) * 0.58, 0.762],
        [x + Math.cos(b) * 0.93, 2.52 + Math.sin(b) * 0.58, 0.762],
        0.008,
        thread,
        4,
      );
    }
  }
}

function cargo(mesh: MeshBuilder) {
  const sack = colour(0x8e7854),
    seam = colour(0xb09a71),
    strap = colour(0x51382a);
  mesh.ellipsoid([0.85, 1.98, 2.0], [1.0, 0.81, 0.76], sack, 20, 12);
  mesh.ellipsoid([0.79, 2.65, 1.99], [0.38, 0.28, 0.34], sack, 14, 8);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU,
      points: Vec3[] = [];
    for (let j = 0; j <= 10; j++) {
      const t = 0.18 + (j / 10) * 2.5;
      points.push([
        0.85 + Math.cos(a) * Math.sin(t) * 1.015,
        1.98 + Math.cos(t) * 0.82,
        2 + Math.sin(a) * Math.sin(t) * 0.78,
      ]);
    }
    chain(mesh, points, 0.012, i % 2 ? seam : colour(0x7a6547), 4);
  }
  oval(mesh, [0.79, 2.66, 2.29], 0.22, 0.08, strap, 0.035, 20);
  chain(
    mesh,
    [
      [0.77, 2.67, 2.29],
      [0.55, 2.5, 2.42],
      [0.49, 2.35, 2.41],
    ],
    0.025,
    seam,
    5,
  );
  chain(
    mesh,
    [
      [0.81, 2.67, 2.29],
      [1.03, 2.52, 2.39],
      [1.12, 2.38, 2.33],
    ],
    0.025,
    seam,
    5,
  );
  for (const [x, y, z, w, h, d, tint] of [
    [-1.12, 1.82, 2.15, 1.28, 0.84, 1.1, colour(0x6b3031)],
    [-1.2, 2.51, 2.08, 0.9, 0.52, 0.86, colour(0x3d5d50)],
    [-0.18, 1.65, 2.75, 0.63, 0.5, 0.63, colour(0xa0885e)],
  ] as [number, number, number, number, number, number, Colour][]) {
    mesh.box([x, y, z], [w, h, d], tint);
    mesh.box([x, y + h / 2 + 0.018, z], [w + 0.04, 0.045, d + 0.04], tint);
    mesh.box([x, y, z + d / 2 + 0.018], [0.12, h, 0.035], brass);
    mesh.box([x, y + h / 2 + 0.05, z], [0.12, 0.025, d + 0.07], brass);
    mesh.box([x, y + h / 2 + 0.052, z], [w + 0.07, 0.025, 0.12], brass);
    for (const side of [-1, 1]) {
      const bow: Vec3[] = [];
      for (let i = 0; i <= 18; i++) {
        const a = (i / 18) * TAU;
        bow.push([
          x + side * 0.16 + Math.cos(a) * 0.16,
          y + h / 2 + 0.12 + Math.sin(a) * 0.07,
          z + Math.sin(a) * 0.1,
        ]);
      }
      chain(mesh, bow, 0.025, polished, 5);
    }
  }
  // A broad leather cargo belt and a brass tongue buckle secure the load.
  chain(
    mesh,
    [
      [-1.85, 1.48, 2.84],
      [-1.85, 2.3, 2.84],
      [-1.48, 2.87, 2.84],
      [-0.63, 2.88, 2.84],
      [-0.44, 2.28, 2.84],
    ],
    0.055,
    strap,
    6,
  );
  mesh.box([-1.26, 2.9, 2.84], [0.32, 0.045, 0.22], brass);
  mesh.box([-1.26, 2.93, 2.84], [0.2, 0.025, 0.12], darkWood);
}

function lantern(mesh: MeshBuilder, x: number) {
  const y = 2.98,
    z = -2.77;
  mesh.rod([x, y - 0.3, z], [x, y + 0.6, z], 0.04, brass, 7);
  mesh.box([x, y, z], [0.31, 0.48, 0.31], colour(0xffb657), 1.3);
  for (const side of [-1, 1])
    for (const end of [-1, 1])
      mesh.rod(
        [x + side * 0.18, y - 0.3, z + end * 0.18],
        [x + side * 0.18, y + 0.3, z + end * 0.18],
        0.027,
        brass,
        5,
      );
  mesh.box([x, y - 0.31, z], [0.44, 0.07, 0.44], brass);
  mesh.cone([x, y + 0.39, z], 0.32, 0.22, brass, 10);
  oval(mesh, [x, y + 0.59, z], 0.1, 0.13, brass, 0.022, 16);
}

/** A single detailed carriage mesh; passenger rigs are attached by the animation owner. */
export function createCarriage(): ModelPart {
  const mesh = new MeshBuilder();
  curvedHull(mesh);
  rearBoard(mesh);
  runners(mesh);
  upholstery(mesh);
  cargo(mesh);
  // Curved front coaming supports handmade brass flight controls and rein guides.
  const coaming: Vec3[] = [];
  for (let i = 0; i <= 28; i++) {
    const x = -2.1 + (i / 28) * 4.2;
    coaming.push([
      x,
      2.88 - 0.17 * (1 - (x / 2.1) ** 2),
      -3.35 - 0.23 * (1 - (x / 2.1) ** 2),
    ]);
  }
  chain(mesh, coaming, 0.14, timber, 10);
  chain(
    mesh,
    coaming.map(([x, y, z]) => [x, y + 0.1, z] as Vec3),
    0.042,
    polished,
    6,
  );
  for (const x of [-1.48, 1.48]) {
    oval(mesh, [x, 2.73, -3.55], 0.12, 0.15, brass, 0.033, 20);
    mesh.rod([x, 2.72, -3.34], [x, 2.41, -2.97], 0.07, brass, 8);
  }
  mesh.box([0, 2.58, -2.9], [0.73, 0.1, 0.52], brass);
  mesh.rod([0.18, 2.62, -2.95], [0.18, 3.08, -2.82], 0.06, steel, 8);
  mesh.ellipsoid([0.18, 3.1, -2.82], [0.12, 0.1, 0.12], honeyWood, 12, 6);
  mesh.ellipsoid([-0.18, 2.69, -2.88], [0.18, 0.045, 0.18], darkWood, 14, 6);
  for (const side of [-1, 1]) lantern(mesh, side * 2.15);
  return part(mesh.build());
}
