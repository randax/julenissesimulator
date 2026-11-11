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
- **P / Escape:** pause and resume.
- On touchscreens, hold the on-screen directional and speed controls.

The sleigh launches at 180 km/h and accelerates smoothly to a 230 km/h cruise. A straight 1.8 km route takes about 29 seconds at cruise or 20 seconds with sustained boost. Steering and climb rates are tuned for the faster pace. The sleigh banks into turns, pitches during climbs/descents, and settles with damped body motion; passengers brace while keeping their gaze forward.

Collect eight stars along the route. Stay above the ground and inside the valley; the sleigh has three lives. Flight ends on arrival or when all lives are lost. Sound is opt-in and generated locally with Web Audio. Leaving the browser tab automatically pauses the flight. The calm-movement setting reduces these body movements to a quarter of their usual amplitude.

## Integrate with nissekomm

See [docs/integration.md](docs/integration.md) for the file-copy recipe, an App Router page, and the completion callback. The game needs only React, React DOM, and browser APIs. It introduces no additional runtime dependencies into nissekomm, and the 3D world does not require raster assets or model downloads.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The 39 tests cover forward-facing passengers, damped banking/pitching, motion settling/pause/reset, rear-camera alignment at takeoff and during steering, 3D transforms, projection, surface normals, articulated animation, animation pause/speed transitions, and simulation lifecycle, frame timing, star collection/misses, collision protection, crash, arrival, bounded controls, sustained flight speeds and duration, and acceleration/braking. Browser verification should include desktop/mobile rendering, visible articulated reindeer motion, steering, pause/resume, modal keyboard focus, route display, and settings.

## Implementation

- `src/components/sleigh/SleighSimulator.tsx`: client UI, input, focus management, and animation lifecycle.
- `flight.ts`: deterministic immutable simulation and shared speed constants, independent of React and rendering.
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
