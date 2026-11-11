import {
  MeshBuilder,
  colour,
  cross,
  normalize,
  type Colour,
  type Vec3,
} from "./geometry.ts";

type FirDetail = "near" | "mid" | "far";
const pine = colour(0x203e37);
const needles = colour(0x2c4b42);
const trunk = colour(0x675044);
const powder = colour(0xe1e7ef);
const shadedSnow = colour(0xc3d4e5);
const random = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 71.7) * 43758.5453;
  return value - Math.floor(value);
};

function tint(base: Colour, amount: number): Colour {
  return base.map((value) => Math.min(1, value * amount)) as Colour;
}

/** A branch ribbon follows the weight of the snow, with a rounded upper surface. */
function snowyBough(
  mesh: MeshBuilder,
  root: Vec3,
  angle: number,
  length: number,
  seed: number,
  detail: FirDetail,
) {
  const direction: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
  const across: Vec3 = [-direction[2], 0, direction[0]];
  const reach = detail === "near" ? 5 : detail === "mid" ? 4 : 2;
  const crossSteps = detail === "near" ? 4 : 2;
  const widthScale = detail === "far" ? 0.43 : detail === "mid" ? 0.36 : 0.34;
  const bend = 0.23 + random(seed + 10) * 0.11;
  const snow = tint(
    seed % 4 === 0 ? shadedSnow : powder,
    0.97 + random(seed) * 0.06,
  );
  const widthAt = (s: number) =>
    Math.pow(Math.max(0, Math.sin(s * Math.PI)), 0.7) *
    length *
    widthScale *
    (0.92 + 0.08 * Math.sin(s * 17 + seed));
  const heightAt = (s: number) =>
    root[1] +
    Math.sin(s * Math.PI) * length * 0.075 -
    Math.pow(s, 1.4) * length * bend;
  const point = (s: number, side: number): Vec3 => {
    const crown =
      Math.pow(Math.max(0, Math.sin(s * Math.PI)), 0.6) *
      length *
      (detail === "far" ? 0.18 : 0.155) *
      Math.sqrt(Math.max(0, 1 - side * side));
    const drift = Math.sin(s * 5 + seed) * widthAt(s) * 0.07;
    return [
      root[0] +
        direction[0] * length * s +
        across[0] * (widthAt(s) * side + drift),
      heightAt(s) + crown + length * 0.025,
      root[2] +
        direction[2] * length * s +
        across[2] * (widthAt(s) * side + drift),
    ];
  };
  const normal = (s: number, side: number): Vec3 => {
    const start = point(Math.max(0, s - 0.01), side);
    const end = point(Math.min(1, s + 0.01), side);
    const left = point(s, Math.max(-1, side - 0.01));
    const right = point(s, Math.min(1, side + 0.01));
    const along: Vec3 = [
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2],
    ];
    const lateral: Vec3 = [
      right[0] - left[0],
      right[1] - left[1],
      right[2] - left[2],
    ];
    const n = normalize(cross(lateral, along));
    return n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
  };

  for (let row = 0; row < reach; row++) {
    const s = 0.025 + (row / reach) * 0.95;
    const sn = 0.025 + ((row + 1) / reach) * 0.95;
    for (let column = 0; column < crossSteps; column++) {
      const t = -1 + (column / crossSteps) * 2;
      const tn = -1 + ((column + 1) / crossSteps) * 2;
      const a = point(s, t),
        b = point(s, tn),
        c = point(sn, tn),
        d = point(sn, t);
      const na = normal(s, t),
        nb = normal(s, tn),
        nc = normal(sn, tn),
        nd = normal(sn, t);
      mesh.surface(a, b, c, [na, nb, nc], snow);
      mesh.surface(a, c, d, [na, nc, nd], snow);
    }
    // Snow wraps around the branch rather than disappearing from a low camera.
    const a = point(s, -1),
      b = point(s, 1),
      c = point(sn, 1),
      d = point(sn, -1);
    const down = (p: Vec3): Vec3 => [p[0], p[1] - length * 0.065, p[2]];
    const da = down(a),
      db = down(b),
      dc = down(c),
      dd = down(d);
    const leftNormal = normalize([-across[0], -0.3, -across[2]]);
    const rightNormal = normalize([across[0], -0.3, across[2]]);
    mesh.surface(a, d, dd, [normal(s, -1), normal(sn, -1), leftNormal], snow);
    mesh.surface(a, dd, da, [normal(s, -1), leftNormal, leftNormal], snow);
    mesh.surface(b, db, dc, [normal(s, 1), rightNormal, rightNormal], snow);
    mesh.surface(b, dc, c, [normal(s, 1), rightNormal, normal(sn, 1)], snow);
    mesh.quad(da, dd, dc, db, shadedSnow);
    if (detail !== "far" && row === 0) mesh.quad(a, da, db, b, shadedSnow);
    if (detail !== "far" && row === reach - 1)
      mesh.quad(d, c, dc, dd, shadedSnow);
  }

  if (detail === "far") return;
  const elbow: Vec3 = [
    root[0] + direction[0] * length * 0.52,
    heightAt(0.52) - length * 0.015,
    root[2] + direction[2] * length * 0.52,
  ];
  const tip: Vec3 = [
    root[0] + direction[0] * length,
    heightAt(1) - length * 0.02,
    root[2] + direction[2] * length,
  ];
  mesh.rod(root, elbow, length * 0.015, trunk, 4, length * 0.009);
  mesh.rod(elbow, tip, length * 0.009, needles, 4, length * 0.002);

  const featherCount = detail === "near" ? 4 : 2;
  for (let feather = 0; feather < featherCount; feather++) {
    const s = 0.25 + (feather / featherCount) * 0.58;
    const width = widthAt(s) * 1.035;
    const center: Vec3 = [
      root[0] + direction[0] * length * s,
      heightAt(s) - length * 0.035,
      root[2] + direction[2] * length * s,
    ];
    for (const side of [-1, 1]) {
      const base: Vec3 = [
        center[0] - direction[0] * length * 0.11,
        center[1] + length * 0.012,
        center[2] - direction[2] * length * 0.11,
      ];
      const end: Vec3 = [
        center[0] + across[0] * width * side + direction[0] * length * 0.11,
        center[1] - length * 0.075,
        center[2] + across[2] * width * side + direction[2] * length * 0.11,
      ];
      const low: Vec3 = [
        center[0] + direction[0] * length * 0.14,
        center[1] - length * 0.055,
        center[2] + direction[2] * length * 0.14,
      ];
      mesh.triangle(base, end, low, feather % 2 ? pine : needles);
      if (detail === "near") {
        const middle: Vec3 = [
          (center[0] + end[0]) * 0.5,
          center[1] - length * 0.025,
          (center[2] + end[2]) * 0.5,
        ];
        mesh.triangle(center, middle, end, needles);
        mesh.triangle(low, end, middle, pine);
      }
    }
  }
}

/** Geometry-only fir: irregular drooping fronds carry continuous pillows of snow. */
export function createFir(
  height: number,
  seed: number,
  detail: FirDetail,
): Float32Array {
  const mesh = new MeshBuilder();
  const levels = detail === "near" ? 8 : detail === "mid" ? 6 : 5;
  const branches = detail === "near" ? 6 : detail === "mid" ? 5 : 3;
  const leanX = (random(seed + 3) - 0.5) * height * 0.045;
  const leanZ = (random(seed + 7) - 0.5) * height * 0.035;
  const base: Vec3 = [0, 0, 0],
    top: Vec3 = [leanX, height, leanZ];
  mesh.rod(
    base,
    top,
    height * 0.022,
    trunk,
    detail === "near" ? 9 : 5,
    height * 0.003,
  );
  for (let level = 0; level < levels; level++) {
    const proportion = level / levels;
    const y = height * (0.16 + proportion * 0.79);
    const radius = height * (0.29 * Math.pow(1 - proportion, 0.85) + 0.018);
    const angleOffset = level * 1.27 + random(seed + level) * 0.8;
    for (let branch = 0; branch < branches; branch++) {
      const angle =
        angleOffset +
        (branch / branches) * Math.PI * 2 +
        (random(seed * 73 + branch + level * 9) - 0.5) * 0.22;
      const length =
        radius * (0.79 + random(seed + branch * 17 + level * 31) * 0.3);
      const root: Vec3 = [
        leanX * proportion,
        y + (random(seed + branch * 7 + level) - 0.5) * height * 0.025,
        leanZ * proportion,
      ];
      snowyBough(
        mesh,
        root,
        angle,
        length,
        seed * 47 + level * 7 + branch,
        detail,
      );
    }
    // Interlocking snow in the inner crown keeps distant trees from becoming
    // bare crosses when their thin individual fronds fall below pixel size.
    const coreHeight =
      level === levels - 1
        ? height * 0.99 - y
        : ((height * 0.79) / levels) * 0.64;
    mesh.ellipsoid(
      [leanX * proportion, y - height * 0.015, leanZ * proportion],
      [radius * 0.26, coreHeight, radius * 0.26],
      level % 2 ? powder : shadedSnow,
      4,
      3,
    );
  }
  // Small asymmetric top fronds finish the leader without a conical cap.
  for (let i = 0; i < (detail === "far" ? 1 : 3); i++) {
    snowyBough(
      mesh,
      [leanX, height * 0.945, leanZ],
      i * 2.1 + seed,
      height * 0.075,
      seed + i,
      "far",
    );
  }
  return mesh.build();
}
