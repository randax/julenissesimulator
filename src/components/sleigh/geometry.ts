export type Vec3 = [number, number, number];
export type Colour = [number, number, number];
export type Mat4 = Float32Array;
export const STRIDE = 10;
export const colour = (hex: number): Colour => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];
export const identity = (): Mat4 =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
  return out;
}
export function transform(
  position: Vec3 = [0, 0, 0],
  rotation: Vec3 = [0, 0, 0],
  scale: Vec3 = [1, 1, 1],
): Mat4 {
  const [x, y, z] = rotation,
    cx = Math.cos(x),
    sx = Math.sin(x),
    cy = Math.cos(y),
    sy = Math.sin(y),
    cz = Math.cos(z),
    sz = Math.sin(z);
  const rx = new Float32Array([
    1,
    0,
    0,
    0,
    0,
    cx,
    sx,
    0,
    0,
    -sx,
    cx,
    0,
    0,
    0,
    0,
    1,
  ]);
  const ry = new Float32Array([
    cy,
    0,
    -sy,
    0,
    0,
    1,
    0,
    0,
    sy,
    0,
    cy,
    0,
    0,
    0,
    0,
    1,
  ]);
  const rz = new Float32Array([
    cz,
    sz,
    0,
    0,
    -sz,
    cz,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  ]);
  const m = multiply(multiply(ry, rx), rz);
  for (let i = 0; i < 3; i++)
    for (let r = 0; r < 3; r++) m[i * 4 + r] *= scale[i];
  m[12] = position[0];
  m[13] = position[1];
  m[14] = position[2];
  return m;
}
export const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function point(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
export function perspective(
  fov: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fov / 2),
    nf = 1 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ]);
}
export function lookAt(eye: Vec3, target: Vec3): Mat4 {
  const z = normalize([
      eye[0] - target[0],
      eye[1] - target[1],
      eye[2] - target[2],
    ]),
    x = normalize(cross([0, 1, 0], z)),
    y = cross(z, x);
  return new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -x.reduce((s, v, i) => s + v * eye[i], 0),
    -y.reduce((s, v, i) => s + v * eye[i], 0),
    -z.reduce((s, v, i) => s + v * eye[i], 0),
    1,
  ]);
}

/** Interleaved position, normal, colour and emission. Geometry is shared by all render paths. */
export class MeshBuilder {
  private values: number[] = [];
  triangle(a: Vec3, b: Vec3, c: Vec3, tint: Colour, emission = 0) {
    const n = normalize(
      cross(
        [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
        [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
      ),
    );
    for (const p of [a, b, c]) this.values.push(...p, ...n, ...tint, emission);
    return this;
  }
  surface(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    normals: [Vec3, Vec3, Vec3],
    tint: Colour,
    emission = 0,
  ) {
    [a, b, c].forEach((p, index) =>
      this.values.push(...p, ...normalize(normals[index]), ...tint, emission),
    );
    return this;
  }
  surfaceColours(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    normals: [Vec3, Vec3, Vec3],
    tints: [Colour, Colour, Colour],
    emission = 0,
  ) {
    [a, b, c].forEach((p, index) =>
      this.values.push(
        ...p,
        ...normalize(normals[index]),
        ...tints[index],
        emission,
      ),
    );
    return this;
  }
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, tint: Colour, emission = 0) {
    this.triangle(a, b, c, tint, emission);
    this.triangle(a, c, d, tint, emission);
    return this;
  }
  box(center: Vec3, size: Vec3, tint: Colour, emission = 0) {
    const [x, y, z] = center,
      [w, h, d] = size.map((v) => v / 2);
    const p: Vec3[] = [
      [-w, -h, -d],
      [w, -h, -d],
      [w, h, -d],
      [-w, h, -d],
      [-w, -h, d],
      [w, -h, d],
      [w, h, d],
      [-w, h, d],
    ].map((v) => [v[0] + x, v[1] + y, v[2] + z]);
    for (const [a, b, c, d] of [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [3, 7, 6, 2],
      [0, 1, 5, 4],
    ])
      this.quad(p[a], p[b], p[c], p[d], tint, emission);
    return this;
  }
  ellipsoid(
    center: Vec3,
    radii: Vec3,
    tint: Colour,
    segments = 10,
    rings = 6,
    emission = 0,
  ) {
    const v = (theta: number, phi: number): Vec3 => [
      center[0] + Math.sin(phi) * Math.cos(theta) * radii[0],
      center[1] + Math.cos(phi) * radii[1],
      center[2] + Math.sin(phi) * Math.sin(theta) * radii[2],
    ];
    for (let r = 0; r < rings; r++)
      for (let s = 0; s < segments; s++) {
        const t = (s / segments) * Math.PI * 2,
          tn = ((s + 1) / segments) * Math.PI * 2,
          p = (r / rings) * Math.PI,
          pn = ((r + 1) / rings) * Math.PI;
        const points = [v(t, p), v(tn, p), v(tn, pn), v(t, pn)];
        const normals = points.map((point) =>
          normalize(
            point.map(
              (value, index) =>
                (value - center[index]) /
                Math.max(1e-8, radii[index] * radii[index]),
            ) as Vec3,
          ),
        );
        this.surface(
          points[0],
          points[1],
          points[2],
          [normals[0], normals[1], normals[2]],
          tint,
          emission,
        );
        this.surface(
          points[0],
          points[2],
          points[3],
          [normals[0], normals[2], normals[3]],
          tint,
          emission,
        );
      }
    return this;
  }
  cone(
    center: Vec3,
    radius: number,
    height: number,
    tint: Colour,
    segments = 9,
    topRadius = 0,
    emission = 0,
  ) {
    const [x, y, z] = center;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2,
        b = ((s + 1) / segments) * Math.PI * 2;
      const p: Vec3 = [
          x + Math.cos(a) * radius,
          y - height / 2,
          z + Math.sin(a) * radius,
        ],
        q: Vec3 = [
          x + Math.cos(b) * radius,
          y - height / 2,
          z + Math.sin(b) * radius,
        ],
        r: Vec3 = [
          x + Math.cos(b) * topRadius,
          y + height / 2,
          z + Math.sin(b) * topRadius,
        ],
        t: Vec3 = [
          x + Math.cos(a) * topRadius,
          y + height / 2,
          z + Math.sin(a) * topRadius,
        ];
      this.quad(p, t, r, q, tint, emission);
      this.triangle([x, y - height / 2, z], p, q, tint, emission);
      if (topRadius > 0)
        this.triangle([x, y + height / 2, z], r, t, tint, emission);
    }
    return this;
  }
  rod(
    a: Vec3,
    b: Vec3,
    radius: number,
    tint: Colour,
    segments = 7,
    tipRadius = radius,
  ) {
    const axis = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
      u = normalize(
        cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]),
      ),
      v = cross(axis, u);
    const rim = (p: Vec3, r: number, t: number): Vec3 => [
      p[0] + r * (u[0] * Math.cos(t) + v[0] * Math.sin(t)),
      p[1] + r * (u[1] * Math.cos(t) + v[1] * Math.sin(t)),
      p[2] + r * (u[2] * Math.cos(t) + v[2] * Math.sin(t)),
    ];
    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * Math.PI * 2,
        tn = ((i + 1) / segments) * Math.PI * 2;
      this.quad(
        rim(a, radius, t),
        rim(a, radius, tn),
        rim(b, tipRadius, tn),
        rim(b, tipRadius, t),
        tint,
      );
    }
    return this;
  }
  append(mesh: Float32Array, matrix: Mat4 = identity()) {
    // The inverse transpose preserves perpendicular normals under non-uniform scaling.
    const [a, d, g, b, e, h, c, f, i] = [
      matrix[0],
      matrix[1],
      matrix[2],
      matrix[4],
      matrix[5],
      matrix[6],
      matrix[8],
      matrix[9],
      matrix[10],
    ];
    const cofactors = [
      e * i - f * h,
      f * g - d * i,
      d * h - e * g,
      c * h - b * i,
      a * i - c * g,
      b * g - a * h,
      b * f - c * e,
      c * d - a * f,
      a * e - b * d,
    ];
    const determinant = a * cofactors[0] + b * cofactors[1] + c * cofactors[2];
    const inverse = determinant === 0 ? 0 : 1 / determinant;
    for (let offset = 0; offset < mesh.length; offset += STRIDE) {
      const p = point(matrix, [
        mesh[offset],
        mesh[offset + 1],
        mesh[offset + 2],
      ]);
      const x = mesh[offset + 3],
        y = mesh[offset + 4],
        z = mesh[offset + 5];
      const n = normalize([
        (cofactors[0] * x + cofactors[1] * y + cofactors[2] * z) * inverse,
        (cofactors[3] * x + cofactors[4] * y + cofactors[5] * z) * inverse,
        (cofactors[6] * x + cofactors[7] * y + cofactors[8] * z) * inverse,
      ]);
      this.values.push(
        ...p,
        ...n,
        mesh[offset + 6],
        mesh[offset + 7],
        mesh[offset + 8],
        mesh[offset + 9],
      );
    }
    return this;
  }
  build() {
    return new Float32Array(this.values);
  }
}
export interface ModelPart {
  mesh: Float32Array | null;
  position: Vec3;
  rotation: Vec3;
  children: ModelPart[];
}
export function part(
  mesh: Float32Array | null = null,
  position: Vec3 = [0, 0, 0],
  children: ModelPart[] = [],
): ModelPart {
  return { mesh, position, rotation: [0, 0, 0], children };
}
