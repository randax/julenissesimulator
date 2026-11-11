import type { CSSProperties } from "react";
export type IconName =
  | "snow"
  | "sound"
  | "muted"
  | "expand"
  | "arrow"
  | "star"
  | "compass"
  | "pause"
  | "play"
  | "close"
  | "help"
  | "settings"
  | "wind"
  | "back"
  | "check"
  | "sled"
  | "chevron";
const paths: Record<IconName, React.ReactNode> = {
  snow: (
    <>
      <path d="M12 2v20M3.34 7l17.32 10M3.34 17L20.66 7M8 4l4 3 4-3M8 20l4-3 4 3M3.6 11l4.6-1.9-.6-4.9M20.4 13l-4.6 1.9.6 4.9M3.6 13l4.6 1.9-.6 4.9M20.4 11l-4.6-1.9.6-4.9" />
    </>
  ),
  sound: (
    <>
      <path d="M11 4L5 9H2v6h3l6 5zM15 8a6 6 0 010 8M18 4a11 11 0 010 16" />
    </>
  ),
  muted: (
    <>
      <path d="M11 4L5 9H2v6h3l6 5zM16 9l6 6m0-6l-6 6" />
    </>
  ),
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  arrow: <path d="M4 12h16m-6-6l6 6-6 6" />,
  star: (
    <path d="M12 2l3 6.8 7.4.8-5.5 5 1.6 7.4-6.5-3.8L5.5 22l1.6-7.4-5.5-5L9 8.8z" />
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M16 8l-2.5 5.5L8 16l2.5-5.5z" />
    </>
  ),
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  play: <path d="M8 4l12 8-12 8z" />,
  close: <path d="M6 6l12 12M6 18L18 6" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 8a3 3 0 016 0c0 2-3 2-3 5m0 3v.5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" />
      <circle cx="16" cy="17" r="3" />
    </>
  ),
  wind: (
    <>
      <path d="M3 8h12c5 0 5-6 1-6M3 12h16c4 0 4 6 0 6M3 16h7c4 0 4 6 0 6" />
    </>
  ),
  back: <path d="M20 12H4m6-6l-6 6 6 6" />,
  check: <path d="M5 12l4 4L20 5" />,
  sled: (
    <>
      <path d="M3 6c1 6 9 8 16 2l2-4M7 11v6m10-6v6M2 18h17c3 0 4-2 3-4M5 6h7" />
    </>
  ),
  chevron: <path d="M8 5l7 7-7 7" />,
};
export function Icon({
  name,
  size = 20,
  style,
  className,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
export function JuliusPortrait() {
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <defs>
        <radialGradient id="portrait-bg">
          <stop stopColor="#655c47" />
          <stop offset="1" stopColor="#262f2c" />
        </radialGradient>
      </defs>
      <circle cx="40" cy="40" r="39" fill="url(#portrait-bg)" />
      <path d="M12 80Q9 51 40 49Q70 52 69 80" fill="#bcb7a3" />
      <path d="M27 44Q17 51 26 66L39 77 53 63Q63 49 51 40" fill="#eee8d6" />
      <ellipse cx="40" cy="35" rx="17" ry="21" fill="#c9aa83" />
      <path d="M22 33Q16 6 39 7Q65 8 58 36L51 26 24 29" fill="#604331" />
      <path
        d="M24 23Q40 9 56 24"
        fill="none"
        stroke="#88664a"
        strokeWidth="4"
      />
      <path d="M21 31h38" stroke="#252d2a" strokeWidth="7" />
      <rect
        x="23"
        y="24"
        width="15"
        height="13"
        rx="4"
        fill="#8a9d95"
        stroke="#aa9b7d"
        strokeWidth="2"
      />
      <rect
        x="42"
        y="24"
        width="15"
        height="13"
        rx="4"
        fill="#8a9d95"
        stroke="#aa9b7d"
        strokeWidth="2"
      />
      <path d="M39 30h3M26 43q14 9 28 0-2 28-15 29-14-4-13-29" fill="#f0e8d6" />
      <path d="M31 45q8-6 18 0" fill="none" stroke="#d9d2c0" strokeWidth="4" />
      <path
        d="M35 42q6 4 11 0"
        fill="none"
        stroke="#99775a"
        strokeWidth="1.5"
      />
      <path
        d="M23 27l9-1m12 1 8-1"
        stroke="#d9e5da"
        strokeWidth="1.5"
        opacity=".7"
      />
    </svg>
  );
}
