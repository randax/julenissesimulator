import {
  MeshBuilder,
  colour,
  normalize,
  cross,
  type Colour,
  type Vec3,
} from "./geometry.ts";

const snow = colour(0xdfe7f1);
const snowLight = colour(0xebedf0);
const snowShade = colour(0xc4d2e4);
const wood = colour(0x77503b);
const darkWood = colour(0x483328);
const redPaint = colour(0x984d40);
const carving = colour(0xe1c398);
const gold = colour(0xb8975e);
const glass = colour(0xffab52);

function chain(
  mesh: MeshBuilder,
  points: Vec3[],
  radius: number,
  tint: Colour,
  sides = 7,
) {
  for (let i = 1; i < points.length; i++)
    mesh.rod(points[i - 1], points[i], radius, tint, sides);
}

/** A smooth, irregular snow cornice following the entire edge, not separate snow balls. */
function snowCornice(
  mesh: MeshBuilder,
  points: Vec3[],
  radius: number,
  seed: number,
) {
  const rings = points.map((center, index) => {
    const before = points[Math.max(0, index - 1)],
      after = points[Math.min(points.length - 1, index + 1)];
    const tangent = normalize(
      after.map((value, i) => value - before[i]) as Vec3,
    );
    const u = normalize(
      cross(tangent, Math.abs(tangent[2]) < 0.8 ? [0, 0, 1] : [0, 1, 0]),
    );
    const v = cross(tangent, u),
      r = radius * (1 + 0.1 * Math.sin(index * 0.9 + seed));
    return Array.from({ length: 9 }, (_, side) => {
      const a = (side / 8) * Math.PI * 2;
      const normal = normalize(
        u.map((value, i) => value * Math.cos(a) + v[i] * Math.sin(a)) as Vec3,
      );
      return {
        position: center.map((value, i) => value + normal[i] * r) as Vec3,
        normal,
      };
    });
  });
  for (let index = 0; index < rings.length - 1; index++)
    for (let side = 0; side < 8; side++) {
      const a = rings[index][side],
        b = rings[index + 1][side],
        c = rings[index + 1][side + 1],
        d = rings[index][side + 1];
      mesh.surface(
        a.position,
        d.position,
        c.position,
        [a.normal, d.normal, c.normal],
        snowLight,
      );
      mesh.surface(
        a.position,
        c.position,
        b.position,
        [a.normal, c.normal, b.normal],
        snowLight,
      );
    }
}

function disc(
  mesh: MeshBuilder,
  center: Vec3,
  normal: Vec3,
  radius: number,
  tint: Colour,
  sides = 10,
) {
  const u = normalize(
    cross(normal, Math.abs(normal[1]) < 0.8 ? [0, 1, 0] : [1, 0, 0]),
  );
  const v = cross(normal, u);
  const rim = (angle: number): Vec3 =>
    center.map(
      (value, i) =>
        value + radius * (u[i] * Math.cos(angle) + v[i] * Math.sin(angle)),
    ) as Vec3;
  for (let i = 0; i < sides; i++)
    mesh.triangle(
      center,
      rim((i / sides) * Math.PI * 2),
      rim(((i + 1) / sides) * Math.PI * 2),
      tint,
    );
}

function log(
  mesh: MeshBuilder,
  a: Vec3,
  b: Vec3,
  radius: number,
  tint: Colour,
) {
  mesh.rod(a, b, radius, tint, 10);
  const axis = normalize(b.map((value, i) => value - a[i]) as Vec3);
  for (const [center, direction] of [
    [a, axis.map((value) => -value)],
    [b, axis],
  ] as [Vec3, Vec3][]) {
    disc(mesh, center, direction, radius, colour(0x98734e));
    const grainCenter = center.map(
      (value, index) => value + direction[index] * 0.018,
    ) as Vec3;
    disc(mesh, grainCenter, direction, radius * 0.4, colour(0x7b5a3f), 8);
  }
}

/** A framed pane whose timber lattice has actual depth in front of the glass. */
function windowPane(
  mesh: MeshBuilder,
  center: Vec3,
  width: number,
  height: number,
  side = false,
  outward = 1,
) {
  const point = (u: number, v: number, depth: number): Vec3 =>
    side
      ? [center[0] + depth * outward, center[1] + v, center[2] + u]
      : [center[0] + u, center[1] + v, center[2] + depth * outward];
  const box = (
    u: number,
    v: number,
    depth: number,
    w: number,
    h: number,
    d: number,
    tint: Colour,
    emission = 0,
  ) =>
    mesh.box(point(u, v, depth), side ? [d, h, w] : [w, h, d], tint, emission);
  box(0, 0, 0, width + 0.8, height + 0.85, 0.25, darkWood);
  box(0, 0, 0.18, width, height, 0.16, glass, 1.3);
  for (const x of [-width / 2 - 0.12, width / 2 + 0.12])
    box(x, 0, 0.31, 0.25, height + 0.75, 0.25, carving);
  for (const y of [-height / 2 - 0.15, height / 2 + 0.15])
    box(0, y, 0.31, width + 0.7, 0.3, 0.3, carving);
  const step = width * 0.48;
  // Clip diagonal bars at the frame so the diamond glazing reads from oblique angles.
  for (const direction of [-1, 1])
    for (let offset = -2; offset <= 2; offset++) {
      const c = offset * step;
      const points: [number, number][] = [];
      for (const u of [-width / 2, width / 2]) {
        const v = direction * u + c;
        if (Math.abs(v) <= height / 2 + 0.001) points.push([u, v]);
      }
      for (const v of [-height / 2, height / 2]) {
        const u = (v - c) / direction;
        if (Math.abs(u) < width / 2 - 0.001) points.push([u, v]);
      }
      if (points.length >= 2)
        mesh.rod(
          point(...points[0], 0.4),
          point(...points[1], 0.4),
          0.055,
          darkWood,
          4,
        );
    }
  box(0, 0, 0.44, 0.11, height, 0.1, carving);
  box(0, 0, 0.44, width, 0.11, 0.1, carving);
  box(0, -height / 2 - 0.4, 0.32, width + 1.05, 0.22, 0.95, wood);
  mesh.ellipsoid(
    point(0, -height / 2 - 0.21, 0.38),
    side ? [0.58, 0.25, width * 0.57] : [width * 0.57, 0.25, 0.58],
    snowLight,
    10,
    5,
  );
  box(0, height / 2 + 0.48, 0.18, width + 0.85, 0.16, 0.65, redPaint);
}

function hangingLantern(
  mesh: MeshBuilder,
  x: number,
  y: number,
  z: number,
  scale = 1,
) {
  mesh.box([x, y, z], [0.66 * scale, 1.02 * scale, 0.66 * scale], glass, 1.45);
  for (const side of [-1, 1])
    for (const end of [-1, 1])
      mesh.rod(
        [x + side * 0.38 * scale, y - 0.58 * scale, z + end * 0.38 * scale],
        [x + side * 0.38 * scale, y + 0.58 * scale, z + end * 0.38 * scale],
        0.045 * scale,
        darkWood,
        5,
      );
  mesh.box(
    [x, y - 0.6 * scale, z],
    [0.92 * scale, 0.15 * scale, 0.92 * scale],
    darkWood,
  );
  mesh.cone([x, y + 0.77 * scale, z], 0.72 * scale, 0.42 * scale, darkWood, 8);
  mesh.ellipsoid(
    [x, y + 0.98 * scale, z],
    [0.76 * scale, 0.24 * scale, 0.76 * scale],
    snowLight,
    10,
    5,
  );
  mesh.rod(
    [x, y + 1.03 * scale, z],
    [x, y + 1.6 * scale, z],
    0.06 * scale,
    darkWood,
    5,
  );
}

/** Rounded log walls and sculpted roof snow keep the cottage dimensional at sleigh height. */
export function createCottage(
  width: number,
  depth: number,
  height: number,
  seed: number,
): Float32Array {
  const mesh = new MeshBuilder();
  const wallHeight = height * 0.51,
    rise = height - wallHeight;
  const halfWidth = width / 2,
    halfDepth = depth / 2;
  const eave = halfWidth + 1.45,
    roofDepth = halfDepth + 1.4;
  mesh.box([0, wallHeight / 2, 0], [width, wallHeight, depth], darkWood);
  const courses = Math.max(7, Math.round(wallHeight / 1.12));
  const spacing = wallHeight / courses,
    radius = spacing * 0.52;
  for (let course = 0; course < courses; course++) {
    const y = spacing * (course + 0.5);
    const tint = colour(
      [0x80553d, 0x76503a, 0x895d42, 0x704934][(course + seed) % 4],
    );
    for (const side of [-1, 1]) {
      log(
        mesh,
        [-halfWidth - 0.6, y, side * halfDepth],
        [halfWidth + 0.6, y, side * halfDepth],
        radius,
        tint,
      );
      // Alternating projection at corner joints gives a real interlocking log silhouette.
      mesh.rod(
        [side * halfWidth, y, -halfDepth - 0.65],
        [side * halfWidth, y, halfDepth + 0.65],
        radius,
        tint,
        10,
      );
      disc(
        mesh,
        [side * halfWidth, y, halfDepth + 0.66],
        [0, 0, 1],
        radius,
        colour(0x9b7853),
      );
      disc(
        mesh,
        [side * halfWidth, y, -halfDepth - 0.66],
        [0, 0, -1],
        radius,
        colour(0x9b7853),
      );
    }
  }
  mesh.box([0, 0.28, 0], [width + 0.9, 0.55, depth + 0.9], colour(0x737d81));
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? -1 : 1;
    mesh.ellipsoid(
      [side * (halfWidth - 0.4), 0.3, -halfDepth + (i / 8) * depth],
      [0.65, 0.5, 0.85],
      colour(0x7d8586),
      7,
      4,
    );
  }
  // Timber boards fill the steep gable beneath the continuous curved snow roof.
  for (const end of [-1, 1]) {
    const z = end * (halfDepth + 0.08);
    mesh.triangle(
      [-halfWidth, wallHeight, z],
      [halfWidth, wallHeight, z],
      [0, height, z],
      colour(0x704b38),
    );
    for (let x = -halfWidth + 0.5; x < halfWidth; x += 0.7) {
      const top = wallHeight + rise * (1 - Math.abs(x) / halfWidth);
      mesh.box(
        [x, (wallHeight + top) / 2, z + end * 0.08],
        [0.07, Math.max(0.1, top - wallHeight), 0.08],
        darkWood,
      );
    }
    for (const side of [-1, 1]) {
      const bottom: Vec3 = [
        side * (halfWidth + 0.55),
        wallHeight - 0.35,
        z + end * 1.55,
      ];
      const peak: Vec3 = [0, height + 0.3, z + end * 1.55];
      const insideBottom: Vec3 = [
        side * (halfWidth - 0.12),
        wallHeight + 0.22,
        bottom[2],
      ];
      const insidePeak: Vec3 = [0, height - 0.75, peak[2]];
      mesh.quad(bottom, peak, insidePeak, insideBottom, redPaint);
      mesh.rod(bottom, peak, 0.31, redPaint, 8);
      mesh.rod(
        [bottom[0] * 0.93, bottom[1] + 0.15, bottom[2] + end * 0.1],
        [0, peak[1] - 0.4, peak[2] + end * 0.1],
        0.115,
        carving,
        6,
      );
      for (let ornament = 1; ornament < 5; ornament++) {
        const t = ornament / 5;
        const x = bottom[0] * (1 - t),
          y = bottom[1] + (peak[1] - bottom[1]) * t;
        const angle = side * 0.8;
        const loop: Vec3[] = [];
        for (let i = 0; i <= 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          loop.push([
            x + Math.cos(a) * 0.46 + Math.sin(a) * Math.sin(angle) * 0.2,
            y + Math.sin(a) * 0.46,
            z + end * 1.74,
          ]);
        }
        chain(mesh, loop, 0.08, carving, 4);
      }
    }
    // A cream/gold rosette and red carved vines give the attic gable a readable motif.
    const faceZ = z + end * 0.66,
      rosetteY = wallHeight + rise * 0.75,
      rosetteRadius = width * 0.066;
    disc(
      mesh,
      [0, rosetteY, faceZ],
      [0, 0, end],
      rosetteRadius * 1.22,
      redPaint,
      12,
    );
    const star: Vec3[] = [];
    for (let i = 0; i <= 12; i++) {
      const angle = (i / 12) * Math.PI * 2,
        r = i % 2 ? rosetteRadius * 0.42 : rosetteRadius;
      star.push([
        Math.sin(angle) * r,
        rosetteY + Math.cos(angle) * r,
        faceZ + end * 0.06,
      ]);
    }
    chain(mesh, star, 0.08, carving, 5);
    mesh.ellipsoid(
      [0, rosetteY, faceZ + end * 0.13],
      [0.16, 0.16, 0.12],
      gold,
      6,
      4,
    );
    for (const side of [-1, 1]) {
      const vine: Vec3[] = [];
      for (let i = 0; i <= 14; i++) {
        const angle = -1.1 + (i / 14) * Math.PI * 2,
          r = 0.83 * (1 - i / 23);
        vine.push([
          side * (width * 0.17 + Math.cos(angle) * r),
          wallHeight + rise * 0.39 + Math.sin(angle) * r,
          faceZ,
        ]);
      }
      chain(mesh, vine, 0.09, carving, 5);
      mesh.rod(
        [side * width * 0.18, wallHeight + 0.15, faceZ],
        [side * width * 0.18, wallHeight + rise * 0.3, faceZ],
        0.1,
        redPaint,
        6,
      );
    }
    // Two curled ridge finials echo the carved roofs of the reference village.
    for (const side of [-1, 1]) {
      const curl: Vec3[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = -0.5 + (i / 12) * Math.PI * 1.7;
        const r = 0.82 * (1 - i / 18);
        curl.push([
          side * (0.15 + Math.cos(a) * r),
          height + 0.8 + Math.sin(a) * r + (i / 12) * 0.7,
          z + end * 0.38,
        ]);
      }
      mesh.rod([0, height - 0.2, z], curl[0], 0.15, wood, 7);
      chain(mesh, curl, 0.13, wood);
    }
  }
  const roofHeight = (x: number, z: number) => {
    const round = 1.25,
      normalized =
        (Math.sqrt(x * x + round * round) - round) /
        (Math.sqrt(eave * eave + round * round) - round);
    return (
      wallHeight +
      1.25 +
      rise * (1 - normalized) +
      0.65 * Math.sin((Math.PI * x) / eave) ** 2 +
      0.2 * Math.sin(z * 0.45 + seed) +
      0.13 * Math.cos(x * 0.65 + z * 0.2)
    );
  };
  const roofNormal = (x: number, z: number): Vec3 =>
    normalize([
      roofHeight(x - 0.05, z) - roofHeight(x + 0.05, z),
      0.1,
      roofHeight(x, z - 0.05) - roofHeight(x, z + 0.05),
    ]);
  const stepX = (eave * 2) / 24,
    stepZ = (roofDepth * 2) / 9;
  for (let ix = 0; ix < 24; ix++)
    for (let iz = 0; iz < 9; iz++) {
      const x = -eave + ix * stepX,
        nx = x + stepX,
        z = -roofDepth + iz * stepZ,
        nz = z + stepZ;
      const a: Vec3 = [x, roofHeight(x, z), z],
        b: Vec3 = [nx, roofHeight(nx, z), z],
        c: Vec3 = [nx, roofHeight(nx, nz), nz],
        d: Vec3 = [x, roofHeight(x, nz), nz];
      const normals = [
        roofNormal(x, z),
        roofNormal(nx, z),
        roofNormal(nx, nz),
        roofNormal(x, nz),
      ];
      mesh.surface(a, d, c, [normals[0], normals[3], normals[2]], snow);
      mesh.surface(a, c, b, [normals[0], normals[2], normals[1]], snow);
      if (iz === 0 || iz === 8) {
        const aa = iz === 0 ? a : d,
          bb = iz === 0 ? b : c;
        mesh.quad(
          aa,
          bb,
          [bb[0], bb[1] - 1.2, bb[2]],
          [aa[0], aa[1] - 1.2, aa[2]],
          snowShade,
        );
      }
    }
  // Continuous rounded snow edges avoid a regular row of disconnected pillow shapes.
  for (const side of [-1, 1]) {
    const edge: Vec3[] = [];
    for (let i = 0; i <= 12; i++) {
      const z = -roofDepth + (i / 12) * roofDepth * 2;
      edge.push([side * eave, roofHeight(side * eave, z) - 0.24, z]);
    }
    snowCornice(mesh, edge, 0.69, seed + side);
  }
  for (const end of [-1, 1]) {
    const edge: Vec3[] = [];
    for (let i = 0; i <= 24; i++) {
      const x = -eave + (i / 24) * eave * 2,
        z = end * roofDepth;
      edge.push([x, roofHeight(x, z) - 0.12, z]);
    }
    snowCornice(mesh, edge, 0.58, seed + end * 3);
  }
  for (const end of [-1, 1])
    for (const side of [-1, 1])
      windowPane(
        mesh,
        [
          side * width * 0.265,
          wallHeight * 0.6,
          end * (halfDepth + radius + 0.12),
        ],
        width * 0.205,
        wallHeight * 0.31,
        false,
        end,
      );
  for (const side of [-1, 1])
    windowPane(
      mesh,
      [side * (halfWidth + radius + 0.17), wallHeight * 0.59, -depth * 0.15],
      depth * 0.2,
      wallHeight * 0.3,
      true,
      side,
    );
  windowPane(
    mesh,
    [0, wallHeight + rise * 0.36, halfDepth + 0.22],
    width * 0.13,
    rise * 0.3,
  );
  // Front door, carved arch and snow-dusted steps.
  const doorWidth = width * 0.18,
    doorHeight = wallHeight * 0.53,
    doorZ = halfDepth + radius + 0.18;
  mesh.box(
    [0, doorHeight / 2 + 0.4, doorZ],
    [doorWidth, doorHeight, 0.35],
    colour(0x533c2d),
  );
  for (let i = 0; i < 5; i++)
    mesh.box(
      [
        -doorWidth * 0.4 + i * doorWidth * 0.2,
        doorHeight / 2 + 0.4,
        doorZ + 0.21,
      ],
      [0.07, doorHeight - 0.2, 0.08],
      wood,
    );
  for (const side of [-1, 1])
    mesh.rod(
      [side * doorWidth * 0.56, 0.35, doorZ + 0.32],
      [side * doorWidth * 0.56, doorHeight + 0.55, doorZ + 0.32],
      0.15,
      carving,
      7,
    );
  const arch: Vec3[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    arch.push([
      Math.cos(a) * doorWidth * 0.56,
      doorHeight + 0.5 + Math.sin(a) * 0.65,
      doorZ + 0.32,
    ]);
  }
  chain(mesh, arch, 0.16, carving, 6);
  mesh.ellipsoid(
    [doorWidth * 0.31, doorHeight * 0.53, doorZ + 0.47],
    [0.13, 0.13, 0.13],
    gold,
    7,
    4,
  );
  for (let i = 0; i < 3; i++) {
    mesh.box(
      [0, 0.3 + i * 0.3, doorZ + 2 - i * 0.55],
      [doorWidth + 1.2 - i * 0.15, 0.55, 1.3],
      colour(0x737e82),
    );
    mesh.ellipsoid(
      [0, 0.59 + i * 0.3, doorZ + 2 - i * 0.55],
      [(doorWidth + 1.2 - i * 0.15) / 2, 0.14, 0.65],
      snowLight,
      8,
      4,
    );
  }
  const chimneyX = -width * 0.25,
    chimneyZ = -depth * 0.18,
    chimneyY = roofHeight(chimneyX, chimneyZ);
  mesh.box(
    [chimneyX, chimneyY + 1.1, chimneyZ],
    [1.45, 4.4, 1.55],
    colour(0x766b61),
  );
  for (let y = chimneyY - 0.6; y < chimneyY + 3; y += 0.65)
    mesh.box(
      [chimneyX, y, chimneyZ + 0.8],
      [1.45, 0.06, 0.04],
      colour(0x484a46),
    );
  mesh.ellipsoid(
    [chimneyX, chimneyY + 3.35, chimneyZ],
    [1.1, 0.35, 1.15],
    snowLight,
    10,
    5,
  );
  hangingLantern(mesh, doorWidth * 0.88, doorHeight * 0.86, doorZ + 1.0, 0.85);
  mesh.rod(
    [doorWidth * 0.88, doorHeight * 0.86 + 1.3, doorZ],
    [doorWidth * 0.88, doorHeight * 0.86 + 1.3, doorZ + 1],
    0.075,
    darkWood,
    6,
  );
  return mesh.build();
}

export function addLantern(
  mesh: MeshBuilder,
  x: number,
  y: number,
  z: number,
): void {
  log(mesh, [x, y, z], [x, y + 6.4, z], 0.18, darkWood);
  const crook: Vec3[] = [
    [x, y + 6.4, z],
    [x + 0.3, y + 6.8, z],
    [x + 0.9, y + 6.85, z],
    [x + 1.45, y + 6.55, z],
  ];
  chain(mesh, crook, 0.12, darkWood);
  hangingLantern(mesh, x + 1.45, y + 5.15, z, 1);
}

export function addBridge(mesh: MeshBuilder, z: number, ground: number): void {
  const half = 15,
    width = 6.4;
  const arch = (x: number) =>
    ground + 1.4 + 2.7 * Math.max(0, 1 - (x / half) ** 2);
  const deck = (x: number, depth: number): Vec3 => [x, arch(x), z + depth];
  for (let i = 0; i < 20; i++) {
    const x = -half + i * 1.5,
      nx = x + 1.5;
    const y = arch(x + 0.75);
    mesh.box([x + 0.75, y, z], [1.46, 0.65, width], wood);
    const normal: Vec3 = normalize([(x / (half * half)) * 5.4, 1, 0]);
    const nextNormal: Vec3 = normalize([(nx / (half * half)) * 5.4, 1, 0]);
    const a = deck(x, -width / 2 - 0.2),
      b = deck(nx, -width / 2 - 0.2),
      c = deck(nx, width / 2 + 0.2),
      d = deck(x, width / 2 + 0.2);
    for (const p of [a, b, c, d]) p[1] += 0.55;
    mesh.surface(a, d, c, [normal, normal, nextNormal], snow);
    mesh.surface(a, c, b, [normal, nextNormal, nextNormal], snow);
    if (i % 2 === 0)
      for (const side of [-1, 1]) {
        mesh.rod(
          [x, y + 0.2, z + side * 2.85],
          [x, y + 3.0, z + side * 2.85],
          0.17,
          darkWood,
          8,
        );
        mesh.ellipsoid(
          [x, y + 3.05, z + side * 2.85],
          [0.3, 0.16, 0.3],
          snowLight,
          8,
          4,
        );
      }
    for (const side of [-1, 1]) {
      mesh.rod(
        [x, arch(x) + 2.8, z + side * 2.85],
        [nx, arch(nx) + 2.8, z + side * 2.85],
        0.2,
        wood,
        8,
      );
      mesh.rod(
        [x, arch(x) + 3.02, z + side * 2.85],
        [nx, arch(nx) + 3.02, z + side * 2.85],
        0.15,
        snow,
        7,
      );
      mesh.rod(
        [x, arch(x) + 1.35, z + side * 2.85],
        [nx, arch(nx) + 1.35, z + side * 2.85],
        0.13,
        wood,
        6,
      );
    }
  }
  for (const side of [-1, 1])
    for (let i = 0; i < 5; i++) {
      mesh.ellipsoid(
        [side * 13.8, ground + 0.3 + i * 0.43, z],
        [2.3 - i * 0.08, 0.55, width * 0.48],
        colour(i % 2 ? 0x87919a : 0x919ca4),
        8,
        4,
      );
    }
}

/** Local glass centers for the renderer's subtle amber light halos. */
export function cottageGlowPoints(
  width: number,
  depth: number,
  height: number,
): Vec3[] {
  const wallHeight = height * 0.51,
    rise = height - wallHeight;
  const courses = Math.max(7, Math.round(wallHeight / 1.12));
  const radius = (wallHeight / courses) * 0.52,
    doorWidth = width * 0.18,
    doorHeight = wallHeight * 0.53;
  const points: Vec3[] = [];
  for (const end of [-1, 1])
    for (const side of [-1, 1])
      points.push([
        side * width * 0.265,
        wallHeight * 0.6,
        end * (depth / 2 + radius + 0.3),
      ]);
  for (const side of [-1, 1])
    points.push([
      side * (width / 2 + radius + 0.35),
      wallHeight * 0.59,
      -depth * 0.15,
    ]);
  points.push([0, wallHeight + rise * 0.36, depth / 2 + 0.4]);
  points.push([doorWidth * 0.88, doorHeight * 0.86, depth / 2 + radius + 1.18]);
  return points;
}
