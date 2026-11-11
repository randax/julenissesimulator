# Visual references and procedural 3D assets

The current game builds its snowy world, wooden sleigh, Julius and his helper, and articulated reindeer from procedural meshes in `geometry.ts`, `world.ts` and `models.ts`. Native WebGL renders the scene with a third-person follow camera. Wrapped red, green and kraft-paper parcels, gold/green delivery-house markers, and accuracy-colored landing markers are procedural meshes in `package-models.ts`. Each 2.4 km section generates unique cottage, forest and terrain geometry from deterministic seeds and continuous global terrain coordinates. House placement is shared with collision and scoring data in `houses.ts`. `world-worker.ts` prepares upcoming sections in the background, while `world-stream.ts` downgrades and evicts section meshes; tree assets remain shared across sections. These models need no external textures, model files or game-engine packages.

The PNGs below are retained from the earlier sprite renderer as visual references only. The current 3D renderer does not load them, and they are not required when integrating the game.

These reference PNGs were generated with the built-in image generation tool for this project. Supplied television screenshots were visual references for palette, goggles, wood/brass materials, snowy village atmosphere and three-reindeer composition. They are not included in the shipped application.

## docs/reference-assets/snowfall-valley.png

Prompt: Cinematic wide 3D game environment inspired by Snøfall: a magical Norwegian alpine village in winter at blue hour, snowy firs framing the edges, wooden houses with steep snow-heavy roofs and warm amber windows, a small wooden bridge and winding path leading into a misty mountain valley. Scandinavian handmade storybook aesthetic, tangible stylised materials, cool desaturated teal-blue palette contrasting with golden lights, eye-level first-person travelling view, horizon at about 45%, clear foreground snow. No people, reindeer, sleigh, text, UI, logos, borders, modern buildings or moon in frame.

## docs/reference-assets/reindeer.png

Prompt: Single full-body reindeer viewed directly from behind, isolated on genuine transparent background. Tall tan-brown shaggy winter reindeer, cream rump, dark hooves, dark leather sleigh harness, four elegant legs in a midair running pose, upright neck and wide branching antlers. Stylised realistic 3D Nordic Christmas game visual, detailed fur with fine snow dust, cool blue-hour light, natural anatomy. Whole animal visible with margin, no face, ground, scene, text, sleigh, extending ropes, holiday accessories or red nose.

## docs/reference-assets/snow-fir.png

Prompt: Single tall Norwegian fir, heavily coated in powder snow, isolated on genuine transparent background. Organic irregular boughs weighed down by fresh snow, desaturated teal needles, ice-blue snow shadows and pale highlights from above left, a fully visible dark brown trunk. Dimensional cinematic Nordic Christmas game visual, detailed organic needles and snow texture. Whole tree visible, no ground, shadows outside tree, text or other objects.

The portrait and icons are code-native SVG; the interface uses CSS and SVG. Audio is procedural Web Audio. The briefing line attributed to Julius is original fictional dialogue written for this game, not a quoted line from the series.
