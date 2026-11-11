/** One accelerated day lasts three minutes of active flight. */
export const DAY_CYCLE_SECONDS = 180;
export type TimeMode = "auto" | "day" | "night";
export type WeatherMode = "auto" | "clear" | "snow" | "storm";

export interface EnvironmentOptions {
  timeMode: TimeMode;
  weatherMode: WeatherMode;
}

export interface EnvironmentState {
  daylight: number;
  night: number;
  aurora: number;
  sunHeight: number;
  phase: number;
  cloudCover: number;
  snowfall: number;
  windX: number;
  windZ: number;
  fogDensity: number;
  temperature: number;
  clock: string;
  periodLabel: "Dag" | "Skumring" | "Natt" | "Daggry";
  weatherLabel: "Klart" | "Lett snø" | "Snøvær" | "Snøbyger";
  lightDirection: [number, number, number];
}

const TAU = Math.PI * 2;
const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const smooth = (min: number, max: number, value: number) => {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
};
const wave = (time: number, frequency: number, offset = 0) =>
  Math.sin((time % (TAU / frequency)) * frequency + offset);

const presets = {
  clear: { cloudCover: 0.12, snowfall: 0, wind: 2, fogDensity: 0.00028 },
  snow: { cloudCover: 0.5, snowfall: 0.55, wind: 6, fogDensity: 0.00055 },
  storm: { cloudCover: 0.9, snowfall: 1, wind: 14, fogDensity: 0.0009 },
} as const;

/**
 * Derived exclusively from simulation time: pausing freezes every value and
 * replaying from elapsed=0 recreates the same afternoon and weather sequence.
 */
export function getEnvironment(
  elapsedSeconds: number,
  options: Partial<EnvironmentOptions> = {},
): EnvironmentState {
  const time = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  const mode = options?.timeMode;
  const phase =
    mode === "day"
      ? 0.25
      : mode === "night"
        ? 0.75
        : (0.32 + (time % DAY_CYCLE_SECONDS) / DAY_CYCLE_SECONDS) % 1;
  const angle = phase * TAU;
  const sunHeight = Math.sin(angle);
  const daylight = smooth(-0.13, 0.22, sunHeight);
  const night = 1 - daylight;

  // A clear opening grows into snow showers, then clears during the first night.
  const storm = smooth(0.35, 0.92, (wave(time, TAU / 110, -0.6) + 1) / 2);
  const weatherMode = options?.weatherMode;
  const preset =
    weatherMode === "clear" || weatherMode === "snow" || weatherMode === "storm"
      ? presets[weatherMode]
      : null;
  const cloudCover = preset?.cloudCover ?? 0.12 + storm * 0.78;
  const snowfall = preset?.snowfall ?? storm;
  const baseWind = preset?.wind ?? 2 + storm * 12;
  const gustStrength = preset ? preset.snowfall : storm;
  const windX = clamp(
    baseWind +
      (wave(time, 0.65) + 1) * 0.3 +
      wave(time, 1.3, 0.4) * gustStrength * 2,
    2,
    16,
  );
  const windZ =
    -1.2 - gustStrength * 0.6 + wave(time, 0.23, 1.1) * (0.5 + gustStrength);
  const fogDensity = preset?.fogDensity ?? 0.00028 + storm * 0.00062;
  const cloudVisibility = 1 - smooth(0.18, 0.95, cloudCover) * 0.92;
  const aurora =
    smooth(0.55, 0.95, night) *
    cloudVisibility *
    (0.85 + wave(time, 0.07, 0.4) * 0.15);

  const periodLabel: EnvironmentState["periodLabel"] =
    night > 0.8
      ? "Natt"
      : sunHeight < 0.22
        ? Math.cos(angle) >= 0
          ? "Daggry"
          : "Skumring"
        : "Dag";
  const weatherLabel: EnvironmentState["weatherLabel"] =
    snowfall < 0.08
      ? "Klart"
      : snowfall < 0.35
        ? "Lett snø"
        : snowfall < 0.72
          ? "Snøvær"
          : "Snøbyger";
  const minutes = Math.floor(((phase * 24 + 6) % 24) * 60 + 1e-8);
  const clock = `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;

  // Blend between sun and moon through dusk, avoiding a sudden shadow-direction flip.
  const active = daylight * 2 - 1;
  const direction: [number, number, number] = [
    Math.cos(angle) * 0.8 * active,
    0.18 + Math.abs(sunHeight) * 0.9,
    0.36 * active,
  ];
  const length = Math.hypot(...direction);
  const lightDirection = direction.map((value) => value / length) as [
    number,
    number,
    number,
  ];

  return {
    daylight,
    night,
    aurora: clamp(aurora),
    sunHeight,
    phase,
    cloudCover,
    snowfall,
    windX,
    windZ,
    fogDensity,
    temperature: Math.round(
      clamp(-8 + Math.max(0, sunHeight) - night * 3 - snowfall * 2, -16, -4),
    ),
    clock,
    periodLabel,
    weatherLabel,
    lightDirection,
  };
}
