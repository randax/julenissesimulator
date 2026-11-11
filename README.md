# Julius’ slede

A Norwegian-language, true 3D sleigh simulator inspired by the supplied Snøfall references. A third-person follow camera shows Julius and his helper riding in a wooden sleigh, pulled by three articulated reindeer through a snowy village and mountain valley. Built as a self-contained React client component with a Next.js App Router demo.

## Run

Node.js 22.6+ is required for the native TypeScript tests; Node.js 24 is recommended. The browser must support WebGL.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For the production static demo, run `npm run build` then `npm start`.

## Play

- **WASD / arrows:** steer left/right and climb/descend.
- **Shift:** boost to 340 km/h. **Space:** brake toward 100 km/h.
- **Mouse / I, J, K, L:** aim the throw. I/K raise/lower the angle; J/L aim left/right.
- **Hold and release E / left mouse button:** charge and throw a package.
- **P / Escape:** pause and resume.
- On touchscreens, use the directional and speed controls, drag the aiming pad, and hold/release the throw button.

The sleigh launches at 180 km/h and accelerates smoothly to a 230 km/h cruise. The 18 km journey takes about 4 minutes 42 seconds at cruise or 3 minutes 11 seconds with sustained boost. Steering and climb rates are tuned for the faster pace. The sleigh banks into turns, pitches during climbs/descents, and settles with damped body motion; passengers brace while keeping their gaze forward.

Deliver packages to the 154 marked houses along six route waypoints. Gold gift markers show houses awaiting a delivery; successful deliveries turn them green. Each house can earn up to 1,000 points: a roof hit scores full points, and landings farther from its footprint score progressively less, down to zero at 30 metres. A landing within 10 metres counts as delivered. Only an improvement to a house's best score adds points, so repeated throws cannot farm the same landing.

The dotted arc and landing marker predict the current throw. Packages inherit the sleigh's forward, sideways and vertical velocity, then follow gravity, wind and air drag. Braking gives more time to aim; fast flybys carry packages farther and shorten the delivery window. Hold the throw control longer for more power. Cargo is unlimited, with a short cooldown and a bounded number of airborne packages. A 250-metre approach gives time to aim at the first houses.

Stay above the ground and inside the valley; the sleigh has three lives. Flight ends on arrival or when all lives are lost, then waits for airborne packages to settle before showing the final score. Sound is opt-in and generated locally with Web Audio. Leaving the browser tab automatically pauses the flight. The calm-movement setting reduces these body movements to a quarter of their usual amplitude.

## Weather and daylight

Automatic mode follows an accelerated 180-second day: the flight starts in the afternoon, moves through dusk and night, and returns to daylight. Clear nights show animated northern lights, stars and a moon. Weather changes smoothly between clear air, flurries and wind-driven snow showers, changing clouds, visibility, wind audio and a little sleigh buffeting.

Settings can also hold the world in **day** or **night**, and select **clear**, **snow**, or **showers**. The particle switch independently hides flakes. Pausing freezes the simulation clock, daylight, weather and aurora animation. Restarting resets the journey clock.

The detailed valley is reused as seamless 2.4 km terrain tiles, with shared neighboring geometry, coarse far ridges and camera-coordinate rebasing. The renderer does not build an 18 km mesh or accumulate geometry as you travel.

## Integrate with nissekomm

See [docs/integration.md](docs/integration.md) for the file-copy recipe, an App Router page, and the completion callback. The game needs only React, React DOM, and browser APIs. It introduces no additional runtime dependencies into nissekomm, and the 3D world does not require raster assets or model downloads.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The tests cover aiming and charging, inherited throw velocity, package trajectories and collisions, proximity scoring and repeated-house improvements, shared house placement, and the existing camera, model, motion, environment and flight behavior. Browser verification should include desktop/mobile aiming and throwing, visible trajectories and delivery feedback, speed-dependent landing changes, pause/resume, final airborne deliveries, modal keyboard focus, route display, and settings.

## Implementation

- `src/components/sleigh/SleighSimulator.tsx`: client UI, input, focus management, and animation lifecycle.
- `flight.ts`: deterministic immutable simulation and shared speed constants, independent of React and rendering.
- `route.ts`: 18 km distance, launch approach, waypoints and shared terrain period.
- `houses.ts`: shared cottage placements and continuous delivery targets used by rendering and physics.
- `aim.ts`: pointer/keyboard aiming, charging and carrier velocity at release.
- `delivery.ts`: package physics, trajectory prediction, house collisions and proximity scoring.
- `package-models.ts`: wrapped parcels, house gift markers and landing markers.
- `environment.ts`: deterministic weather/daylight/aurora state from elapsed flight time.
- `journey-space.ts`: bounded GPU coordinates and neighboring tile selection.
- `geometry.ts`: 3D geometry and matrix helpers.
- `world.ts`: village layout, shared forest geometry, tree placement and warm-light positions.
- `terrain.ts`: smooth drifted terrain, rocky mountain ridges, stream and path coordinates.
- `architecture.ts`: carved timber cottages, thick snow roofs, lattice windows, bridges and lanterns.
- `vegetation.ts`: branch-based firs and rounded snow cushions at three branch detail levels, plus coarse distant crowns.
- `shaders.ts`: snow grain, timber surfaces, amber illumination, clouds, fog, shadow and glow shaders.
- `models.ts`: articulated team, passenger bracing and complete sleigh rig.
- `characters.ts`: detailed forward-facing Julius/helper meshes, aviator gear and clothing.
- `carriage.ts`: curved planked hull, carved trim, leather upholstery and runner hardware.
- `motion.ts`: bounded damped roll, pitch, sway and heave from actual movement.
- `scene.ts`: native WebGL rendering, lighting and atmosphere.
- `camera.ts`: centered rear flight camera, with smooth height/distance tracking.
- `audio.ts`: synthesised wind and bells with cleanup.
- `sleigh.css`: styles scoped to the simulator.

The renderer uses 3D geometry rather than a projected background image. It follows the supplied blue-hour village reference with dense snowy mountain forests, rounded snow, carved log cottages, amber window light and a soft peach horizon. This is a screen-based game; stereoscopic VR, WebXR and per-tree physical collision are not implemented. Ground and valley boundaries determine damage. Character models and SVG portraits are original stylised interpretations; no television stills or series audio are used. Scores are kept in memory; the host can persist results through `onComplete`.

The earlier generated PNGs in `docs/reference-assets/` are retained as visual references only and are not consumed by the 3D renderer. Prompt records are in [docs/assets.md](docs/assets.md).

The development lint dependency tree currently has a moderate minimatch advisory. `npm audit fix` does not resolve it within the published compatible dependency ranges. The production dependency tree is checked separately.
