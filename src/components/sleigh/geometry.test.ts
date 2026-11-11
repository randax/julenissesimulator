import test from "node:test";
import assert from "node:assert/strict";
import {
  MeshBuilder,
  STRIDE,
  colour,
  identity,
  lookAt,
  multiply,
  perspective,
  point,
  transform,
  type Mat4,
  type Vec3,
} from "./geometry.ts";

const near = (actual: number, expected: number, tolerance = 1e-5) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected}`,
  );
const vectorNear = (actual: Vec3, expected: Vec3) =>
  actual.forEach((value, index) => near(value, expected[index]));
const dot = (a: Vec3, b: Vec3) =>
  a.reduce((sum, value, index) => sum + value * b[index], 0);
const subtract = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const read = (data: Float32Array, offset: number): Vec3 => [
  data[offset],
  data[offset + 1],
  data[offset + 2],
];
const project = (matrix: Mat4, value: Vec3): Vec3 => {
  const transformed = point(matrix, value);
  const w =
    matrix[3] * value[0] +
    matrix[7] * value[1] +
    matrix[11] * value[2] +
    matrix[15];
  return transformed.map((component) => component / w) as Vec3;
};

test("hierarchical transforms rotate a child before placing it in the world", () => {
  const parent = transform([10, 2, -3], [0, Math.PI / 2, 0]);
  const child = transform([0, 0, -4]);
  vectorNear(point(multiply(parent, child), [0, 0, 0]), [6, 2, -3]);
  vectorNear(
    point(transform([5, -2, 7], [0, 0, Math.PI / 2], [2, 3, 4]), [1, 0, 0]),
    [5, 0, 7],
  );
  assert.deepEqual(multiply(identity(), parent), parent);
  assert.deepEqual(multiply(parent, identity()), parent);
});

test("lookAt places the eye at the origin and the target on the forward camera axis", () => {
  const eye: Vec3 = [12, 48, 32],
    target: Vec3 = [0, 36, -10];
  const view = lookAt(eye, target);
  vectorNear(point(view, eye), [0, 0, 0]);
  vectorNear(point(view, target), [
    0,
    0,
    -Math.hypot(...subtract(eye, target)),
  ]);
  const axes: Vec3[] = [
    [view[0], view[4], view[8]],
    [view[1], view[5], view[9]],
    [view[2], view[6], view[10]],
  ];
  axes.forEach((axis) => near(Math.hypot(...axis), 1));
  near(dot(axes[0], axes[1]), 0);
  near(dot(axes[1], axes[2]), 0);
  near(dot(axes[0], axes[2]), 0);
});

test("perspective maps clip planes and field of view to the expected screen bounds", () => {
  const fov = Math.PI / 3,
    aspect = 16 / 9,
    nearPlane = 0.4,
    farPlane = 2200;
  const projection = perspective(fov, aspect, nearPlane, farPlane);
  near(project(projection, [0, 0, -nearPlane])[2], -1);
  near(project(projection, [0, 0, -farPlane])[2], 1);
  const edge = project(projection, [
    Math.tan(fov / 2) * aspect,
    Math.tan(fov / 2),
    -1,
  ]);
  near(edge[0], 1);
  near(edge[1], 1);
});

test("box faces have finite interleaved data and outward unit normals", () => {
  const center: Vec3 = [3, -2, 5];
  const data = new MeshBuilder()
    .box(center, [4, 6, 8], colour(0xabcdef), 0.7)
    .build();
  assert.equal(data.length % (STRIDE * 3), 0);
  assert.ok(data.every(Number.isFinite));
  for (let offset = 0; offset < data.length; offset += STRIDE) {
    const normal = read(data, offset + 3);
    near(Math.hypot(...normal), 1);
    assert.ok(dot(normal, subtract(read(data, offset), center)) > 0);
    near(data[offset + 9], 0.7);
  }
});

test("rods retain outward normals on an arbitrary three-dimensional axis", () => {
  const start: Vec3 = [1, -2, 3],
    end: Vec3 = [4, 5, -6];
  const axis = subtract(end, start),
    lengthSquared = dot(axis, axis);
  const data = new MeshBuilder()
    .rod(start, end, 0.7, colour(0x886644), 12, 0.3)
    .build();
  for (let offset = 0; offset < data.length; offset += STRIDE) {
    const fromStart = subtract(read(data, offset), start),
      along = dot(fromStart, axis) / lengthSquared;
    const radial: Vec3 = fromStart.map(
      (value, index) => value - axis[index] * along,
    ) as Vec3;
    const normal = read(data, offset + 3);
    near(Math.hypot(...normal), 1);
    assert.ok(dot(normal, radial) > 0, "rod normal points into the cylinder");
  }
});

test("appended normals remain perpendicular to surfaces after non-uniform scaling", () => {
  const triangle = new MeshBuilder()
    .triangle([0, 0, 0], [1, 1, 0], [0, 1, 1], colour(0xffffff))
    .build();
  const data = new MeshBuilder()
    .append(triangle, transform([7, 3, -4], [0, 0.4, 0], [2, 1, 0.5]))
    .build();
  const normal = read(data, 3),
    a = read(data, 0),
    b = read(data, STRIDE),
    c = read(data, STRIDE * 2);
  near(Math.hypot(...normal), 1);
  near(dot(normal, subtract(b, a)), 0);
  near(dot(normal, subtract(c, a)), 0);
});

test("ellipsoids use smooth surface normals perpendicular to their curved tangents", () => {
  const center: Vec3 = [2, -1, 4],
    radii: Vec3 = [3, 1.2, 0.65];
  const data = new MeshBuilder()
    .ellipsoid(center, radii, colour(0xd8e4ed), 14, 9)
    .build();
  let curvedFaces = 0;
  for (let offset = 0; offset < data.length; offset += STRIDE) {
    const relative = subtract(read(data, offset), center),
      normal = read(data, offset + 3);
    const gradient = relative.map(
      (value, axis) => value / (radii[axis] * radii[axis]),
    ) as Vec3;
    const length = Math.hypot(...gradient);
    near(Math.hypot(...normal), 1);
    near(dot(normal, gradient) / length, 1);
    const tangent: Vec3 = [
      (-radii[0] * relative[2]) / radii[2],
      0,
      (radii[2] * relative[0]) / radii[0],
    ];
    near(dot(normal, tangent), 0);
    if (offset % (STRIDE * 3) === 0) {
      const nextNormal = read(data, offset + STRIDE + 3);
      if (Math.hypot(...subtract(normal, nextNormal)) > 0.01) curvedFaces++;
    }
  }
  assert.ok(
    curvedFaces > 20,
    "ellipsoid vertices still share flat face normals",
  );
});
