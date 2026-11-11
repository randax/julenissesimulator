# Julius’ slede

A Norwegian-language, true 3D sleigh simulator inspired by the supplied Snøfall references. A third-person follow camera shows Julius and his helper riding in a wooden sleigh, pulled by three articulated reindeer through a snowy village and mountain valley. Built as a self-contained React client component with a Next.js App Router demo.

## Run

Node.js 22.6+ is required for the native TypeScript tests; Node.js 24 is recommended. The browser must support WebGL and module workers.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For the production static demo, run `npm run build` then `npm start`.

## Play

- **A/D / left/right arrows:** bank and turn. Release to level the sleigh; countersteer to change the course back.
- **W/S / up/down arrows:** pitch up/down to climb or descend.
- **Shift:** boost toward a 340 km/h airspeed. **Space:** airbrake toward 100 km/h.
- **Mouse / I, J, K, L:** aim the throw. I/K raise/lower the angle; J/L aim left/right.
- **Hold and release E / left mouse button:** charge and throw a package.
- **P / Escape:** pause and resume.
- On touchscreens, use the directional and speed controls, drag the aiming pad, and hold/release the throw button.

Aiming eases smoothly toward mouse or keyboard input. The outlined ground circle follows the snow and shows the predicted landing point; touch dragging keeps the current aim when you first press the pad.

The sleigh launches at 180 km/h and trims toward a 230 km/h cruise airspeed. The 18 km journey takes roughly five minutes, varying with course, wind, climbing and speed controls. Thrust, air-relative quadratic drag, lift, gravity and sideslip forces determine its velocity. Banking changes the actual course rather than sliding sideways; releasing the controls levels the bank and pitch while momentum and course continue. The rear camera follows that heading, and passengers brace while keeping their gaze forward.

Deliver packages to the marked houses along six route waypoints. The current generated route contains 218 delivery targets, derived from its unique village layouts. Gold gift markers show houses awaiting a delivery; successful deliveries turn them green. Each house can earn up to 1,000 points: a roof hit scores full points, and landings farther from its footprint score progressively less, down to zero at 30 metres. A landing within 10 metres counts as delivered. Only an improvement to a house's best score adds points, so repeated throws cannot farm the same landing.

The dotted arc and landing marker predict the current throw. Packages inherit the sleigh's forward, sideways and vertical velocity, then follow gravity, wind and air drag. Braking gives more time to aim; fast flybys carry packages farther and shorten the delivery window. Hold the throw control longer for more power. Cargo is unlimited, with a short cooldown and a bounded number of airborne packages. A 250-metre approach gives time to aim at the first houses.

Stay above the ground and inside the valley; the sleigh has three lives. Flight ends on arrival or when all lives are lost, then waits for airborne packages to settle before showing the final score. Sound is opt-in and generated locally with Web Audio. Leaving the browser tab automatically pauses the flight. The calm-movement setting reduces decorative body movement while preserving the flight course and physics.

## Weather and daylight

Automatic mode follows an accelerated 180-second day: the flight starts in the afternoon, moves through dusk and night, and returns to daylight. Clear nights show animated northern lights, stars and a moon. Weather changes smoothly between clear air, flurries and wind-driven snow showers, changing clouds, visibility, wind audio and a little sleigh buffeting.

Settings can also hold the world in **day** or **night**, and select **clear**, **snow**, or **showers**. The particle switch independently hides flakes. Pausing freezes the simulation clock, daylight, weather and aurora animation. Restarting resets the journey clock.

The route streams unique 2.4 km sections through a continuous, winding valley. Each section has its own irregular hamlets, isolated cabins and forest placement; terrain samples use global coordinates so neighboring sections join without repeating the same landscape. A module worker generates upcoming sections in the background. The renderer shares tree meshes, uses coarse distant terrain, downgrades detailed sections as they recede, evicts sections outside the visible range, and rebases GPU coordinates as the journey advances.

## Integrate with nissekomm

See [docs/integration.md](docs/integration.md) for the file-copy recipe, an App Router page, and the completion callback. The game needs only React, React DOM, and browser APIs. It introduces no additional runtime dependencies into nissekomm, and the 3D world does not require raster assets or model downloads.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The tests cover aiming and charging, inherited throw velocity, package trajectories and collisions, proximity scoring and repeated-house improvements, shared house placement, unique section generation and streaming, force-based flight and wind response, terrain contact, and the existing camera, model, motion and environment behavior. Browser verification should include desktop/mobile aiming and throwing, visible trajectories and delivery feedback, speed-dependent landing changes, pause/resume, final airborne deliveries, modal keyboard focus, route display, and settings.

## Implementation

- `src/components/sleigh/SleighSimulator.tsx`: client UI, input, focus management, and animation lifecycle.
- `flight.ts`: flight lifecycle, route progress, terrain contact, recovery and shared speed constants.
- `flight-physics.ts`: 240 Hz force integration, world velocity, bank-driven turns, pitch, thrust, lift and drag.
- `route.ts`: 18 km distance, launch approach, waypoints and section length.
- `houses.ts`: deterministic irregular cottage layouts per section and shared delivery targets for rendering and physics.
- `aim.ts`: pointer/keyboard aiming, charging and carrier velocity at release.
- `delivery.ts`: package physics, trajectory prediction, house collisions and proximity scoring.
- `package-models.ts`: wrapped parcels, house gift markers and landing markers.
- `environment.ts`: deterministic weather/daylight/aurora state from elapsed flight time.
- `journey-space.ts`: bounded GPU coordinates and neighboring tile selection.
- `geometry.ts`: 3D geometry and matrix helpers.
- `world.ts`: unique section geometry, shared forest meshes, tree placement and warm-light positions.
- `world-stream.ts`: visible section retention, detail downgrade and mesh eviction.
- `world-worker.ts`: background generation of upcoming section geometry.
- `terrain.ts`: continuous global snow terrain, winding valley, rocky ridges, stream and path coordinates.
- `architecture.ts`: carved timber cottages, thick snow roofs, lattice windows, bridges and lanterns.
- `vegetation.ts`: branch-based firs and rounded snow cushions at three branch detail levels, plus coarse distant crowns.
- `shaders.ts`: snow grain, timber surfaces, amber illumination, clouds, fog, shadow and glow shaders.
- `models.ts`: articulated team, passenger bracing and complete sleigh rig.
- `characters.ts`: detailed forward-facing Julius/helper meshes, aviator gear and clothing.
- `carriage.ts`: curved planked hull, carved trim, leather upholstery and runner hardware.
- `motion.ts`: bounded damped roll, pitch, sway and heave from actual movement.
- `scene.ts`: native WebGL rendering, lighting and atmosphere.
- `camera.ts`: rear camera aligned with the actual flight heading, with smooth height/distance tracking.
- `audio.ts`: synthesised wind and bells with cleanup.
- `sleigh.css`: styles scoped to the simulator.

The renderer uses 3D geometry rather than a projected background image. It follows the supplied blue-hour village reference with dense snowy mountain forests, rounded snow, carved log cottages, amber window light and a soft peach horizon. This is a screen-based game; stereoscopic VR, WebXR and per-tree physical collision are not implemented. Terrain contact below four metres of clearance, cottage roofs and valley boundaries determine damage, followed by safe recovery above the obstacle. Flight altitude is capped at 260 metres. Course yaw is bounded to ±1.25 radians from the route direction, keeping this a forward delivery flight rather than a full six-degree-of-freedom aircraft simulator. Character models and SVG portraits are original stylised interpretations; no television stills or series audio are used. Scores are kept in memory; the host can persist results through `onComplete`.

The earlier generated PNGs in `docs/reference-assets/` are retained as visual references only and are not consumed by the 3D renderer. Prompt records are in [docs/assets.md](docs/assets.md).

The development lint dependency tree currently has a moderate minimatch advisory. `npm audit fix` does not resolve it within the published compatible dependency ranges. The production dependency tree is checked separately.
