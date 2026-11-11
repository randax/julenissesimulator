import {
  MeshBuilder,
  colour,
  part,
  transform,
  type Colour,
  type ModelPart,
  type Vec3,
} from "./geometry.ts";

export interface PassengerRig {
  root: ModelPart;
  head: ModelPart;
  torso: ModelPart;
  leftArm: ModelPart;
  rightArm: ModelPart;
  scarf?: ModelPart;
}

const ivory = colour(0xe1d9c5);
const collar = colour(0xeee8d9);
const seam = colour(0xbeb39b);
const brass = colour(0xb99a60);
const sole = colour(0x302b26);

function mesh(
  build: (builder: MeshBuilder) => void,
  position: Vec3 = [0, 0, 0],
): ModelPart {
  const builder = new MeshBuilder();
  build(builder);
  return part(builder.build(), position);
}
function chain(
  builder: MeshBuilder,
  points: Vec3[],
  radius: number,
  tint: Colour,
  sides = 6,
) {
  for (let index = 1; index < points.length; index++) {
    builder.rod(points[index - 1], points[index], radius, tint, sides);
  }
}
function limb(
  builder: MeshBuilder,
  start: Vec3,
  end: Vec3,
  width: number,
  depth: number,
  tint: Colour,
  segments = 12,
) {
  const vector = end.map((value, index) => value - start[index]);
  const length = Math.hypot(...vector);
  const direction = vector.map((value) => value / length);
  const rotation: Vec3 = [
    Math.atan2(direction[2], direction[1]),
    0,
    -Math.asin(direction[0]),
  ];
  const center = start.map(
    (value, index) => (value + end[index]) * 0.5,
  ) as Vec3;
  const piece = new MeshBuilder()
    .ellipsoid([0, 0, 0], [width, length * 0.57, depth], tint, segments, 8)
    .build();
  builder.append(piece, transform(center, rotation));
}
function strap(
  builder: MeshBuilder,
  points: Vec3[],
  width: number,
  tint: Colour,
) {
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1],
      b = points[index];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = ((b[1] - a[1]) / length) * width * 0.5;
    const dy = (-(b[0] - a[0]) / length) * width * 0.5;
    builder.quad(
      [a[0] - dx, a[1] - dy, a[2]],
      [a[0] + dx, a[1] + dy, a[2]],
      [b[0] + dx, b[1] + dy, b[2]],
      [b[0] - dx, b[1] - dy, b[2]],
      tint,
    );
    for (const sign of [-1, 1]) {
      builder.rod(
        [a[0] + dx * sign, a[1] + dy * sign, a[2] + 0.006],
        [b[0] + dx * sign, b[1] + dy * sign, b[2] + 0.006],
        0.009,
        colour(0xa48a65),
        4,
      );
    }
  }
}
function buckle(builder: MeshBuilder, x: number, y: number, z: number) {
  builder.box([x, y, z], [0.19, 0.22, 0.035], brass);
  builder.box([x, y, z + 0.023], [0.12, 0.15, 0.026], colour(0x513e2d));
  builder.rod(
    [x - 0.065, y, z + 0.04],
    [x + 0.065, y, z + 0.04],
    0.012,
    brass,
    5,
  );
}

/** Anatomical features point along -Z; the rear camera sees cap seams and hair. */
function createHead(julius: boolean): ModelPart {
  const skin = colour(julius ? 0xd0ad8b : 0xc9a485);
  const shadowSkin = colour(julius ? 0xb78e71 : 0xb18a6e);
  const leather = colour(julius ? 0x68412d : 0x54453a);
  const leatherEdge = colour(julius ? 0x95704d : 0x80705b);
  return mesh(
    (builder) => {
      builder.ellipsoid(
        [0, -0.035, 0.005],
        [julius ? 0.445 : 0.415, 0.555, 0.395],
        skin,
        20,
        12,
      );
      builder.ellipsoid([0, -0.32, -0.12], [0.3, 0.255, 0.3], skin, 16, 9);
      for (const side of [-1, 1]) {
        builder.ellipsoid(
          [side * 0.265, -0.095, -0.265],
          [0.15, 0.19, 0.145],
          skin,
          12,
          8,
        );
        builder.ellipsoid(
          [side * 0.431, -0.035, -0.005],
          [0.082, 0.15, 0.09],
          skin,
          12,
          8,
        );
        builder.ellipsoid(
          [side * 0.453, -0.035, -0.055],
          [0.034, 0.085, 0.025],
          shadowSkin,
          8,
          5,
        );
      }
      // The shaped nose and cheeks remain visible in profile without a rear-facing face.
      builder.ellipsoid([0, -0.035, -0.369], [0.075, 0.18, 0.095], skin, 14, 9);
      builder.ellipsoid([0, -0.15, -0.465], [0.105, 0.095, 0.115], skin, 14, 9);
      for (const side of [-1, 1])
        builder.ellipsoid(
          [side * 0.064, -0.183, -0.519],
          [0.024, 0.018, 0.025],
          shadowSkin,
          7,
          4,
        );
      builder.ellipsoid(
        [0, -0.296, -0.355],
        [0.115, 0.025, 0.026],
        colour(0x906750),
        10,
        5,
      );

      // A fitted leather aviator cap, ear flaps and visible raised panel seams.
      builder.ellipsoid(
        [0, 0.315, 0.035],
        [0.475, 0.36, 0.435],
        leather,
        20,
        12,
      );
      for (const side of [-1, 1]) {
        builder.ellipsoid(
          [side * 0.432, 0.045, 0.055],
          [0.072, 0.32, 0.245],
          leather,
          12,
          8,
        );
        chain(
          builder,
          [
            [side * 0.46, 0.22, 0.23],
            [side * 0.48, -0.03, 0.21],
            [side * 0.46, -0.23, 0.11],
          ],
          0.018,
          leatherEdge,
        );
        builder.box(
          [side * 0.47, -0.12, -0.02],
          [0.045, 0.12, 0.15],
          leatherEdge,
        );
      }
      for (const lane of [-1, 0, 1]) {
        const points: Vec3[] = [];
        for (let step = 0; step <= 14; step++) {
          const angle = -0.8 + (step / 14) * Math.PI * 1.33;
          const x = lane * 0.235 * Math.cos(angle) * 0.65;
          points.push([
            x,
            0.315 + Math.sin(angle) * 0.365,
            0.035 + Math.cos(angle) * 0.438,
          ]);
        }
        chain(builder, points, 0.013, leatherEdge, 5);
        for (let stitch = 1; stitch < points.length; stitch += 2) {
          const p = points[stitch];
          builder.rod(
            [p[0] - 0.018, p[1] + 0.012, p[2]],
            [p[0] + 0.018, p[1] + 0.012, p[2]],
            0.006,
            colour(0xc3ae86),
            4,
          );
        }
      }
      // A dark strap wraps right around the cap; its buckle is visible from behind.
      for (let index = 0; index < 30; index++) {
        const a = (index / 30) * Math.PI * 2,
          b = ((index + 1) / 30) * Math.PI * 2;
        builder.rod(
          [Math.sin(a) * 0.469, 0.13, Math.cos(a) * 0.414],
          [Math.sin(b) * 0.469, 0.13, Math.cos(b) * 0.414],
          0.044,
          colour(0x302e28),
          6,
        );
      }
      builder.box([0.08, 0.13, 0.453], [0.21, 0.13, 0.035], brass);
      builder.box([0.08, 0.13, 0.474], [0.135, 0.075, 0.025], leather);
      builder.rod([0.08, 0.083, 0.49], [0.08, 0.175, 0.49], 0.009, brass, 4);

      for (const side of [-1, 1]) {
        const x = side * 0.207;
        builder.ellipsoid(
          [x, 0.112, -0.378],
          [0.226, 0.185, 0.112],
          brass,
          16,
          8,
        );
        builder.ellipsoid(
          [x, 0.112, -0.437],
          [0.197, 0.153, 0.078],
          colour(0x302f29),
          14,
          7,
        );
        builder.ellipsoid(
          [x, 0.112, -0.477],
          [0.177, 0.133, 0.051],
          colour(0x4a626a),
          16,
          8,
        );
        builder.ellipsoid(
          [x - side * 0.045, 0.157, -0.524],
          [0.046, 0.021, 0.008],
          colour(0xc4d6d5),
          8,
          5,
          0.13,
        );
        builder.box(
          [side * 0.435, 0.13, -0.24],
          [0.09, 0.11, 0.12],
          leatherEdge,
        );
        builder.ellipsoid(
          [side * 0.45, 0.13, -0.31],
          [0.025, 0.026, 0.026],
          brass,
          6,
          4,
        );
        builder.ellipsoid(
          [x, 0.304, -0.345],
          [0.19, 0.035, 0.054],
          colour(julius ? 0xd8d1bd : 0x827969),
          10,
          5,
        );
      }
      builder.rod(
        [-0.075, 0.12, -0.485],
        [0.075, 0.12, -0.485],
        0.027,
        brass,
        6,
      );

      const hair = colour(julius ? 0xe6e0cf : 0x96907d);
      // Hair sits below the cap at the nape and sides, not on the back as a false beard.
      for (let row = 0; row < 2; row++)
        for (let lock = 0; lock < 12; lock++) {
          const angle = -Math.PI * 0.57 + (lock / 11) * Math.PI * 1.14;
          builder.ellipsoid(
            [
              Math.sin(angle) * 0.405,
              -0.13 + row * 0.13,
              Math.cos(angle) * 0.35,
            ],
            [0.072, 0.1, 0.075],
            hair,
            7,
            4,
          );
        }
      if (julius) {
        const beard = colour(0xe7e1d0),
          highlight = colour(0xf0ead9);
        builder.ellipsoid(
          [0, -0.48, -0.205],
          [0.385, 0.455, 0.31],
          beard,
          16,
          10,
        );
        builder.ellipsoid(
          [0, -0.835, -0.205],
          [0.24, 0.4, 0.235],
          beard,
          14,
          9,
        );
        for (const side of [-1, 1]) {
          builder.ellipsoid(
            [side * 0.307, -0.255, -0.27],
            [0.16, 0.23, 0.195],
            beard,
            12,
            7,
          );
          builder.ellipsoid(
            [side * 0.152, -0.24, -0.515],
            [0.218, 0.085, 0.11],
            highlight,
            12,
            7,
          );
        }
        for (let lock = 0; lock < 19; lock++) {
          const x = ((lock - 9) / 9) * 0.31;
          const end = -0.98 - Math.cos(x * 4) * 0.2;
          chain(
            builder,
            [
              [x, -0.29, -0.46],
              [x * 0.95, -0.52, -0.52 - Math.cos(lock) * 0.018],
              [x * 0.67, -0.8, -0.46],
              [x * 0.32, end, -0.31],
            ],
            0.012,
            lock % 3 ? highlight : colour(0xcac4b3),
            5,
          );
        }
      } else {
        builder.ellipsoid(
          [0, -0.365, -0.23],
          [0.255, 0.105, 0.17],
          colour(0x9d9480),
          12,
          6,
        );
        for (const side of [-1, 1])
          builder.ellipsoid(
            [side * 0.105, -0.26, -0.37],
            [0.14, 0.035, 0.055],
            colour(0x887d67),
            10,
            5,
          );
        for (const side of [-1, 1])
          chain(
            builder,
            [
              [side * 0.25, -0.05, -0.365],
              [side * 0.29, -0.14, -0.35],
              [side * 0.27, -0.21, -0.34],
            ],
            0.008,
            shadowSkin,
            4,
          );
      }
    },
    [0, 2.13, 0],
  );
}

function createArm(julius: boolean, side: number): ModelPart {
  const sleeve = colour(julius ? 0xded6c3 : 0xe2dccb),
    glove = colour(julius ? 0x6c4c32 : 0x77776b);
  return mesh(
    (builder) => {
      const elbow: Vec3 = [side * 0.1, -0.65, -0.5],
        wrist: Vec3 = [side * 0.025, -0.55, -1.12];
      limb(builder, [0, 0, 0], elbow, 0.207, 0.215, sleeve, 14);
      builder.ellipsoid(elbow, [0.205, 0.21, 0.215], sleeve, 12, 7);
      limb(builder, elbow, wrist, 0.173, 0.18, sleeve, 14);
      for (let fold = 0; fold < 3; fold++) {
        const y = -0.29 - fold * 0.105,
          z = -0.25 - fold * 0.075;
        chain(
          builder,
          [
            [side * 0.16, y + 0.015, z + 0.085],
            [side * 0.23, y - 0.025, z],
            [side * 0.16, y - 0.075, z - 0.085],
          ],
          0.014,
          seam,
          5,
        );
      }
      builder.ellipsoid(
        [wrist[0], wrist[1], wrist[2] + 0.06],
        [0.18, 0.16, 0.12],
        collar,
        12,
        6,
      );
      builder.ellipsoid(
        [wrist[0], wrist[1] - 0.015, wrist[2] - 0.14],
        [0.158, 0.138, 0.22],
        glove,
        14,
        8,
      );
      builder.ellipsoid(
        [wrist[0] - side * 0.12, wrist[1] + 0.015, wrist[2] - 0.17],
        [0.07, 0.075, 0.13],
        glove,
        10,
        6,
      );
      for (let finger = 0; finger < 4; finger++) {
        const x = wrist[0] + (finger - 1.5) * 0.065;
        chain(
          builder,
          [
            [x, wrist[1] - 0.025, wrist[2] - 0.24],
            [x, wrist[1] - 0.09, wrist[2] - 0.3],
            [x, wrist[1] - 0.15, wrist[2] - 0.24],
          ],
          0.029,
          glove,
          5,
        );
        builder.rod(
          [x - 0.018, wrist[1] + 0.07, wrist[2] - 0.1],
          [x + 0.018, wrist[1] + 0.07, wrist[2] - 0.1],
          0.006,
          colour(0xa69a7e),
          4,
        );
      }
      builder.rod([-0.01, -0.39, -0.87], [0.075, -0.41, -0.88], 0.009, seam, 4);
    },
    [side * (julius ? 0.56 : 0.52), 1.49, -0.005],
  );
}

/** Seated clothing and limbs share the forward (-Z) orientation of the reindeer. */
export function createPassenger(julius: boolean, position: Vec3): PassengerRig {
  const cloth = colour(julius ? 0xded6c3 : 0xe4ddca),
    leather = colour(julius ? 0x69492e : 0x75694f),
    pants = colour(julius ? 0x61574a : 0x6d6b60),
    boot = colour(0x4a382b);
  const torso = mesh((builder) => {
    const width = julius ? 0.56 : 0.5;
    builder.ellipsoid([0, 1.04, 0.015], [width, 0.77, 0.395], cloth, 18, 11);
    builder.ellipsoid(
      [0, 0.47, 0.015],
      [width * 0.91, 0.4, 0.405],
      cloth,
      16,
      9,
    );
    builder.ellipsoid([0, 0.25, 0.005], [0.49, 0.24, 0.405], pants, 16, 8);
    builder.ellipsoid([0, 1.72, -0.015], [0.33, 0.145, 0.3], collar, 16, 8);
    builder.ellipsoid(
      [0, 1.83, -0.015],
      [0.215, 0.18, 0.21],
      colour(julius ? 0xd0ad8b : 0xc9a485),
      14,
      8,
    );
    if (!julius) {
      for (const side of [-1, 1]) {
        builder.ellipsoid(
          [side * 0.19, 1.02, -0.325],
          [0.225, 0.6, 0.105],
          colour(0x77776a),
          14,
          8,
        );
        chain(
          builder,
          [
            [side * 0.36, 1.56, -0.23],
            [side * 0.22, 1.29, -0.44],
            [side * 0.29, 0.86, -0.4],
          ],
          0.065,
          collar,
          7,
        );
      }
      chain(
        builder,
        [
          [0, 1.58, 0.398],
          [0, 1.0, 0.425],
          [0, 0.38, 0.407],
        ],
        0.012,
        seam,
        5,
      );
      builder.box([0, 0.65, 0.424], [0.65, 0.075, 0.025], colour(0xb4ab94));
      for (const side of [-1, 1]) {
        chain(
          builder,
          [
            [side * 0.38, 0.73, -0.3],
            [side * 0.39, 0.55, -0.33],
            [side * 0.32, 0.38, -0.35],
          ],
          0.014,
          seam,
          5,
        );
        builder.box([side * 0.37, 0.52, -0.365], [0.17, 0.055, 0.025], collar);
      }
    }
    // Front placket, buttons and folded collar points.
    builder.box(
      [0, 1.09, -0.39],
      [0.075, 0.99, 0.025],
      julius ? collar : colour(0x62685c),
    );
    for (let button = 0; button < 5; button++)
      builder.ellipsoid(
        [0, 0.68 + button * 0.18, -0.42],
        [0.027, 0.027, 0.016],
        julius ? colour(0x9b8a69) : brass,
        7,
        4,
      );
    for (const side of [-1, 1]) {
      builder.triangle(
        [side * 0.04, 1.73, -0.28],
        [side * 0.32, 1.64, -0.26],
        [side * 0.16, 1.39, -0.41],
        collar,
      );
      builder.triangle(
        [side * 0.04, 1.73, -0.3],
        [side * 0.16, 1.39, -0.43],
        [side * 0.18, 1.65, -0.38],
        ivory,
      );
      if (julius) {
        const back: Vec3[] = [
          [side * 0.3, 1.64, 0.27],
          [side * 0.33, 1.28, 0.384],
          [side * 0.27, 0.57, 0.401],
          [side * 0.22, 0.39, 0.38],
        ];
        strap(builder, back, 0.14, leather);
        buckle(builder, side * 0.295, 0.79, 0.427);
        strap(
          builder,
          [
            [side * 0.3, 1.64, -0.25],
            [side * 0.31, 1.3, -0.372],
            [side * 0.25, 0.55, -0.392],
          ],
          0.13,
          leather,
        );
      }
      // Seat, bent knees and ankle boots are built as connected anatomical forms.
      const hip: Vec3 = [side * 0.28, 0.25, -0.06],
        knee: Vec3 = [side * 0.32, 0.04, -0.72],
        ankle: Vec3 = [side * 0.33, -0.64, -0.93];
      limb(builder, hip, knee, 0.225, 0.22, pants, 14);
      builder.ellipsoid(knee, [0.205, 0.21, 0.23], pants, 12, 7);
      limb(builder, knee, ankle, 0.155, 0.17, pants, 14);
      chain(
        builder,
        [
          [side * 0.45, 0.2, -0.32],
          [side * 0.47, -0.02, -0.72],
          [side * 0.44, -0.55, -0.93],
        ],
        0.012,
        colour(0x908979),
        4,
      );
      builder.ellipsoid(
        [side * 0.33, -0.65, -0.93],
        [0.19, 0.275, 0.225],
        boot,
        14,
        8,
      );
      builder.ellipsoid(
        [side * 0.33, -0.78, -1.14],
        [0.23, 0.17, 0.38],
        boot,
        16,
        8,
      );
      builder.box([side * 0.33, -0.93, -1.13], [0.45, 0.07, 0.72], sole);
      builder.rod(
        [side * 0.14, -0.875, -1.27],
        [side * 0.52, -0.875, -1.27],
        0.016,
        colour(0x8d7754),
        6,
      );
      for (let lace = 0; lace < 3; lace++)
        builder.rod(
          [side * 0.33 - 0.085, -0.57 - lace * 0.055, -1.125 - lace * 0.025],
          [side * 0.33 + 0.085, -0.6 - lace * 0.055, -1.135 - lace * 0.025],
          0.008,
          colour(0xbaa887),
          4,
        );
      // Small shoulder and waist folds are visible from the chase camera.
      for (let fold = 0; fold < 3; fold++)
        chain(
          builder,
          [
            [side * 0.39, 1.42 - fold * 0.16, 0.24],
            [side * 0.48, 1.35 - fold * 0.16, 0.2],
            [side * 0.49, 1.26 - fold * 0.16, 0.13],
          ],
          0.013,
          seam,
          5,
        );
    }
    if (julius) {
      builder.box([0, 0.4, 0.391], [0.84, 0.085, 0.035], leather);
      builder.rod([-0.35, 1.26, 0.4], [0.35, 1.26, 0.4], 0.012, seam, 5);
    }
  });
  const head = createHead(julius),
    leftArm = createArm(julius, -1),
    rightArm = createArm(julius, 1);
  let scarf: ModelPart | undefined;
  if (!julius) {
    scarf = mesh(
      (builder) => {
        const wool = colour(0x60695d);
        builder.ellipsoid([0, 0, 0], [0.34, 0.12, 0.3], wool, 16, 7);
        builder.ellipsoid(
          [-0.13, -0.09, -0.255],
          [0.13, 0.16, 0.12],
          wool,
          12,
          7,
        );
        const left: Vec3[] = [
          [0.19, -0.025, 0.1],
          [0.3, -0.22, 0.34],
          [0.25, -0.42, 0.53],
          [0.3, -0.54, 0.64],
        ];
        const right: Vec3[] = [
          [0.38, -0.025, 0.1],
          [0.48, -0.22, 0.34],
          [0.43, -0.42, 0.53],
          [0.46, -0.54, 0.64],
        ];
        for (let i = 0; i < left.length - 1; i++)
          builder.quad(left[i], right[i], right[i + 1], left[i + 1], wool);
        for (let fringe = 0; fringe < 5; fringe++)
          builder.rod(
            [0.3 + fringe * 0.038, -0.54, 0.64],
            [0.3 + fringe * 0.038, -0.62, 0.66],
            0.007,
            colour(0x949783),
            4,
          );
      },
      [0, 1.78, 0],
    );
  }
  torso.children.push(head, leftArm, rightArm);
  if (scarf) torso.children.push(scarf);
  return {
    root: part(null, position, [torso]),
    head,
    torso,
    leftArm,
    rightArm,
    scarf,
  };
}
