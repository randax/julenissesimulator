# Integration with starefossen/nissekomm

The repository's inspected `package.json` uses Next.js 16 and React 19, and `src/app/layout.tsx` uses App Router with an `AppProvider`. This component works inside that existing layout and does not need changes to the provider or server configuration.

## Copy the component

Copy these production files into nissekomm, preserving their relative paths:

```text
src/components/sleigh/SleighSimulator.tsx
src/components/sleigh/sleigh.css
src/components/sleigh/flight.ts
src/components/sleigh/route.ts
src/components/sleigh/houses.ts
src/components/sleigh/aim.ts
src/components/sleigh/delivery.ts
src/components/sleigh/package-models.ts
src/components/sleigh/environment.ts
src/components/sleigh/journey-space.ts
src/components/sleigh/scene.ts
src/components/sleigh/camera.ts
src/components/sleigh/geometry.ts
src/components/sleigh/world.ts
src/components/sleigh/terrain.ts
src/components/sleigh/architecture.ts
src/components/sleigh/vegetation.ts
src/components/sleigh/shaders.ts
src/components/sleigh/models.ts
src/components/sleigh/characters.ts
src/components/sleigh/carriage.ts
src/components/sleigh/motion.ts
src/components/sleigh/audio.ts
src/components/sleigh/icons.tsx
```

The model module uses an explicit TypeScript import so it can also be exercised by the native Node test runner. Ensure the host's `tsconfig.json` contains `"allowImportingTsExtensions": true` inside `compilerOptions` (alongside its existing `noEmit: true`). No emitted JavaScript or server configuration changes are required.

The world and character models are procedural 3D meshes rendered with native WebGL. The world uses smooth snow and rocky terrain, carved log cottages, lattice windows, amber local lights, branch-based firs, and a cloudy blue-hour sky. Forests share near/middle/far geometry through instanced rendering, with a non-instanced fallback. No image files, model downloads, game-engine packages, or additional runtime dependencies are needed. The browser must support WebGL.

The `.test.ts` files use Node's native test runner. They are optional for integration; migrate their cases into nissekomm's existing Jest setup if desired. Do not copy this demo's package.json, Next configuration, app layout, global CSS, or hosting manifest over the host project's files.

## Add an App Router route

Create `src/app/slede/page.tsx`:

```tsx
import SleighSimulator from "@/components/sleigh/SleighSimulator";

export default function SledePage() {
  return <SleighSimulator />;
}
```

The component has its own `'use client'` boundary. Browser-only APIs are created in effects or user events, so the page can remain a Server Component. A dynamic import is not required. Visit `/slede`.

The simulator fills the viewport by default. If the host has a permanent header or needs a contained panel, supply a class and override its height:

```css
.nissekomm-sleigh {
  height: calc(100svh - 64px);
}
```

```tsx
<SleighSimulator className="nissekomm-sleigh" />
```

The component styles do not reset the host's `html`, `body`, or global typography. Input handlers act only when keyboard focus is inside the simulator. Animation frames, observers, listeners, audio, and GPU resources are cleaned up on unmount. The flight camera stays on the sleigh centerline directly behind its rear, showing Julius and his helper facing toward the reindeer. Actual lateral/vertical velocity and forward acceleration drive damped body banking, climb/descent pitch, sway and heave. The calm-movement setting reduces these amplitudes to 25%.

## Connect results to an existing host flow

Callbacks must originate in a Client Component:

```tsx
"use client";

import SleighSimulator from "@/components/sleigh/SleighSimulator";

export default function SledeMission() {
  return (
    <SleighSimulator
      onComplete={({ points, deliveredHouses, totalHouses, packagesThrown, elapsed, arrived }) => {
        // Call nissekomm's existing authenticated mission/result handler here.
        console.info({ points, deliveredHouses, totalHouses, packagesThrown, elapsed, arrived });
      }}
    />
  );
}
```

`onComplete` fires once per finished flight, including crashes, after the last airborne package has landed. It is not called on pause or returning to the workshop. `points` is the sum of each house's best proximity score (0–1,000 per house); `deliveredHouses` counts houses whose best landing is within 10 metres; `totalHouses` is currently 154; `packagesThrown` counts accepted throws. `elapsed` is flight simulation time in seconds, excluding the final package-settling period, and `arrived` distinguishes arrival from a crash. Client-provided scores are suitable for a family game; validate independently before using them for any consequential reward.

The game makes no external network requests after loading its own application bundle. Geometry is generated locally and sound is synthesised with Web Audio. The older generated PNGs are optional visual references and should not be copied for runtime integration.

The sleigh launches at 180 km/h, cruises at 230 km/h, boosts to 340 km/h, and brakes toward 100 km/h. `FLIGHT_SPEEDS` in `flight.ts` is the shared source of these values. The 18 km route, three lives, delivery physics and completion callback remain independent of rendering. A 250-metre approach puts the first houses ahead of the launch point without changing route progress. This is a screen-based 3D experience, not a WebXR/VR implementation.

The default journey lasts about 4 minutes 42 seconds at cruise. A three-minute day/night cycle and changing weather run from elapsed flight time, so pausing freezes them and restarting resets them. Settings offer automatic/day/night and automatic/clear/snow/showers; clear nights reveal the animated aurora. Scenery repeats seamlessly in 2.4 km tiles, with shared near/far geometry and local render coordinates.

## Delivery controls and scoring

Use the mouse or I/J/K/L to aim, then hold and release E or the left mouse button to charge and throw. Touch users drag the aiming pad and hold/release the throw button. Existing WASD/arrow steering, Shift boost, Space braking and P/Escape pause controls remain available.

Gold gift markers identify houses awaiting packages; a best landing within 10 metres turns a marker green. Scores use horizontal distance to the actual oriented house footprint. Roof hits earn 1,000 points, while ground landings fall off to zero at 30 metres. A new throw adds only the improvement over that house's previous best score.

A package inherits the sleigh's forward, lateral and vertical velocity at release. Gravity, wind and air drag then determine its flight; speed changes both travel distance and the available aiming window. The preview arc uses the same physics kernel as live packages, with the current wind held constant for prediction. Changing weather can therefore cause small differences during flight. Cargo is unlimited, with a throw cooldown and bounded active/landed package storage.

House geometry and collision footprints share `houses.ts`. Keep this module shared when changing the village layout, and preserve absolute world coordinates in `delivery.ts` so scenery recycling cannot move a package or change its target ID. Pausing freezes package physics and cancels a charged throw.

## Host verification

After copying, run nissekomm's existing lint/typecheck/build/test commands. This demo does not modify the remote nissekomm repository or add a link to its navigation.
