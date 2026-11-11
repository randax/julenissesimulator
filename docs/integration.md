# Integration with starefossen/nissekomm

The repository's inspected `package.json` uses Next.js 16 and React 19, and `src/app/layout.tsx` uses App Router with an `AppProvider`. This component works inside that existing layout and does not need changes to the provider or server configuration.

## Copy the component

Copy these production files into nissekomm, preserving their relative paths:

```text
src/components/sleigh/SleighSimulator.tsx
src/components/sleigh/sleigh.css
src/components/sleigh/flight.ts
src/components/sleigh/flight-physics.ts
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
src/components/sleigh/world-stream.ts
src/components/sleigh/world-worker.ts
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

The world and character models are procedural 3D meshes rendered with native WebGL. The world uses smooth snow and rocky terrain, carved log cottages, lattice windows, amber local lights, branch-based firs, and a cloudy blue-hour sky. Forests share near/middle/far geometry through instanced rendering, with a non-instanced fallback. No image files, model downloads, game-engine packages, or additional runtime dependencies are needed. The browser must support WebGL; module workers keep scenery generation off the animation thread. Copy `world-worker.ts` with the other component sources: the renderer creates it with `new Worker(new URL("./world-worker.ts", import.meta.url), { type: "module" })`, which Next.js 16 bundles as a separate worker entry. No worker URL, external service or additional package is required.

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

The component styles do not reset the host's `html`, `body`, or global typography. Input handlers act only when keyboard focus is inside the simulator. Animation frames, observers, listeners, audio, the world-generation worker, and GPU resources are cleaned up on unmount. The flight camera stays behind the sleigh along its actual heading, showing Julius and his helper facing toward the reindeer. Physical bank and pitch drive the flight pose, with damped sway, heave and passenger bracing layered on top. Calm movement reduces decorative motion without changing the flight physics or course.

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

`onComplete` fires once per finished flight, including crashes, after the last airborne package has landed. It is not called on pause or returning to the workshop. `points` is the sum of each house's best proximity score (0–1,000 per house); `deliveredHouses` counts houses whose best landing is within 10 metres; `totalHouses` comes from `DELIVERY_TARGET_COUNT` in `houses.ts` (currently 218 for the generated route); `packagesThrown` counts accepted throws. `elapsed` is flight simulation time in seconds, excluding the final package-settling period, and `arrived` distinguishes arrival from a crash. Client-provided scores are suitable for a family game; validate independently before using them for any consequential reward.

The game makes no external network requests after loading its own application bundle. Geometry is generated locally and sound is synthesised with Web Audio. The older generated PNGs are optional visual references and should not be copied for runtime integration.

The sleigh launches at 180 km/h and trims toward a 230 km/h cruise airspeed, 340 km/h while boosting, or 100 km/h while airbraking. Actual ground speed also depends on wind, course and flight forces. `FLIGHT_SPEEDS` in `flight.ts` is the shared source of these values. The 18 km route, three lives, delivery physics and completion callback remain independent of rendering. A 250-metre approach puts the first houses ahead of the launch point without changing route progress. This is a screen-based 3D experience, not a WebXR/VR implementation.

The default journey lasts roughly five minutes, varying with course, weather, climbing and speed controls. A three-minute day/night cycle and changing weather run from elapsed flight time, so pausing freezes them and restarting resets them. Settings offer automatic/day/night and automatic/clear/snow/showers; clear nights reveal the animated aurora. The world streams unique 2.4 km sections over continuous global terrain. Irregular cottage layouts and forest placement vary per section; distant sections use coarse terrain, detailed sections are downgraded as they recede, and off-screen meshes are evicted. Tree meshes are shared, upcoming geometry is generated in a module worker, and rendering uses rebased local coordinates.

## Delivery controls and scoring

Use the mouse or I/J/K/L to aim, then hold and release E or the left mouse button to charge and throw. Touch users drag the aiming pad and hold/release the throw button. A/D or left/right bank and turn the sleigh; W/S or up/down pitch it to climb or descend. Releasing the controls levels bank and pitch while retaining course and momentum, so returning to the original course requires countersteering. Shift boosts, Space applies the airbrake, and P/Escape pauses.

Gold gift markers identify houses awaiting packages; a best landing within 10 metres turns a marker green. Scores use horizontal distance to the actual oriented house footprint. Roof hits earn 1,000 points, while ground landings fall off to zero at 30 metres. A new throw adds only the improvement over that house's previous best score.

Aiming uses frame-rate-independent damping, with the same smoothed angle used for preview and release. The preview updates every animation frame, and a large outlined circle follows the terrain at the predicted landing point. Touch-pad drags are relative to the aim at contact.

A package inherits the sleigh's actual world velocity at release, including sideways and vertical momentum. The launch origin and local aim rotate with the sleigh's heading, keeping the preview and release aligned during a turn. Gravity, wind and air drag then determine its flight; speed changes both travel distance and the available aiming window. The preview arc uses the same physics kernel as live packages, with the current wind held constant for prediction. Changing weather can therefore cause small differences during flight. Cargo is unlimited, with a throw cooldown and bounded active/landed package storage.

House geometry and collision footprints share the per-section layouts in `houses.ts`. Keep this module shared when changing the village layout, and preserve absolute world coordinates in `delivery.ts` so streaming and coordinate rebasing cannot move a package or change its target ID. Pausing freezes package physics and cancels a charged throw.

## Flight model

`flight-physics.ts` integrates thrust, air-relative quadratic drag, airbraking, lift, gravity and sideslip damping in substeps of at most 1/240 second. Bank creates a turn rate and changes the world velocity; pitch changes available climb force. `FlightState.velocity`, `yaw`, `pitch` and bank carry the actual state into rendering, camera tracking and package launches. Weather wind is passed into both the flight and package kernels.

`flight.ts` resolves the resulting movement against terrain, cottage roofs and the winding valley boundary. The carriage and all three reindeer use body probes transformed by yaw, pitch and bank, sharing the roof surface used for package collisions. Contact below four metres of ground clearance costs a life and recovers the sleigh above the snow with safe forward velocity. Altitude is capped at 260 metres. Yaw is bounded to ±1.25 radians from the route direction to keep progress forward; this is a force-based delivery model with lift trim rather than an unrestricted aircraft simulator.

## Host verification

After copying, run nissekomm's existing lint/typecheck/build/test commands. This demo does not modify the remote nissekomm repository or add a link to its navigation.
