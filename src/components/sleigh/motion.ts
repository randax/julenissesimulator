/** World-space movement observed by the renderer, in m/s and m/s². */
export interface Kinematics {
  lateralVelocity: number;
  verticalVelocity: number;
  forwardAcceleration: number;
}

export interface MotionState {
  roll: number;
  pitch: number;
  sway: number;
  heave: number;
  rollVelocity: number;
  pitchVelocity: number;
  swayVelocity: number;
  heaveVelocity: number;
}

export function createMotion(): MotionState {
  return {
    roll: 0,
    pitch: 0,
    sway: 0,
    heave: 0,
    rollVelocity: 0,
    pitchVelocity: 0,
    swayVelocity: 0,
    heaveVelocity: 0,
  };
}

const finite = (value: number) => (Number.isFinite(value) ? value : 0);
const clamp = (value: number, limit: number) =>
  Math.max(-limit, Math.min(limit, value));

/** Exact critically damped response for a target held constant over this frame. */
function spring(
  value: number,
  velocity: number,
  target: number,
  frequency: number,
  limit: number,
  dt: number,
): [number, number] {
  const displacement = clamp(finite(value), limit) - target;
  const speed = finite(velocity);
  const coefficient = speed + frequency * displacement;
  const decay = Math.exp(-frequency * dt);
  const position = target + (displacement + coefficient * dt) * decay;
  const nextVelocity = (speed - frequency * coefficient * dt) * decay;
  const bounded = clamp(position, limit);
  return [
    bounded,
    bounded !== position && bounded * nextVelocity > 0 ? 0 : nextVelocity,
  ];
}

/**
 * Bank into lateral movement and raise the nose while climbing. The -Z-facing
 * sleigh uses negative Z roll for a right turn and positive X pitch to climb.
 */
export function stepMotion(
  state: MotionState,
  input: Kinematics,
  dtSeconds: number,
  gentle = false,
): MotionState {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return state;
  const dt = Math.min(dtSeconds, 0.1);
  const lateral = clamp(finite(input.lateralVelocity) / 60, 1);
  const vertical = clamp(finite(input.verticalVelocity) / 32, 1);
  const acceleration = clamp(finite(input.forwardAcceleration) / 20, 1);
  const amplitude = gentle ? 0.25 : 1;
  const [roll, rollVelocity] = spring(
    state.roll,
    state.rollVelocity,
    -lateral * 0.36 * amplitude,
    8,
    0.45,
    dt,
  );
  const [pitch, pitchVelocity] = spring(
    state.pitch,
    state.pitchVelocity,
    (vertical * 0.26 + acceleration * 0.05) * amplitude,
    6.5,
    0.34,
    dt,
  );
  const [sway, swayVelocity] = spring(
    state.sway,
    state.swayVelocity,
    -lateral * 0.12 * amplitude,
    7,
    0.18,
    dt,
  );
  const [heave, heaveVelocity] = spring(
    state.heave,
    state.heaveVelocity,
    (vertical * 0.06 + acceleration * 0.02) * amplitude,
    6,
    0.12,
    dt,
  );
  return {
    roll,
    pitch,
    sway,
    heave,
    rollVelocity,
    pitchVelocity,
    swayVelocity,
    heaveVelocity,
  };
}
