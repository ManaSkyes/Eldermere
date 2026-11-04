# Azure Sky research and Eldermere lighting

## Imported source textures

Unmodified sky and cloud PNGs from the installed Azure Sky package are kept under `art/azure_sky/`:

- `DynamicCloud.png`: four-channel noise/detail input for the moving cloud shader; it is not a finished cloud image.
- `StaticClouds/`: cloud layer maps and coverage inputs, intended to be decoded by a shader.
- `Sun.png`, `Moon.png`, `Starfield.png`, `Constellation.png`: celestial/sky lookup art.

The large equirectangular maps are 8192 x 4096 (moon, starfield, constellation); the sun is 4096 x 2048. The dynamic noise and most static cloud maps are 4096 wide. Preserve these copies as source masters. Make any resized or GPU-compressed runtime derivatives in a separate folder so the masters remain intact. Do not display the packed cloud/noise maps as ordinary sky images.

## What we are keeping

`src/gfx/sky.js` renders a sky dome, sun/moon/stars, aurora, lightning glow, and Eldermere's procedural cloud forms. It blends eight authored time-of-day looks. `src/gfx/weather.js` supplies cloud type and coverage, wind drift, tinting, storms, and weather transitions. Keep these systems authoritative. Azure cloud rendering is dropped because it looked worse than Eldermere's current clouds. The imported package textures remain source references and are not used by the runtime.

## Rendering work, in stages

### 1. Atmospheric scattering controls

Replace the current simple sky gradient only behind a developer toggle. Add a lightweight Rayleigh/Mie approximation to the dome using view direction, sun direction, wavelength/color weights, and exponential optical-depth extinction. Azure's useful ideas are its separate Rayleigh and Mie coefficients/colors, forward-scattering phase response, and exponential extinction; avoid copying Unity-specific plumbing. Couple its sun direction to Eldermere's current time-of-day state. Expose a small tuning set: scattering strength, Rayleigh/Mie balance, horizon haze, and exposure. Keep map fog and interior lighting independent.

### 2. Volumetric light prototype

Begin with an opt-in, low-resolution sun-shaft pass that uses scene depth to stop light behind nearby geometry. Azure's shader suggests useful ingredients: a density integral along the view ray, a forward-scattering phase term, and distance extinction. Compare a short fixed-step integration with a cheaper screen-space radial pass; use the lowest-cost version that gives a stable result. Respect weather/cloud cover and fade at night. Keep it off by default until its frame cost is measured on the target scene.

### 3. Live sky and cloud tuning

Extend the existing F8 controls instead of creating another panel. Keep current weather/cloud type and coverage controls; add grouped advanced sliders for cloud density/detail, drift speed, and scattering. Add a reset-to-weather/default action. Save tuning only in the active debug session at first; promote settings to map data only after the controls and rendering settle. The sky lab should expose the same controls for repeatable visual comparison.

## Other Azure methods to evaluate

- **Weather transitions:** compare Azure's property-group/preset interpolation with Eldermere's current weather state easing. Keep Eldermere's existing per-frame accumulated particle travel, which prevents rain/snow from jumping when wind changes.
- **Local weather zones:** Azure blends a zone's preset by distance to the zone boundary and supports ordered zones. This could improve map transitions (for example, entering a sheltered valley or a magical clearing), but only if the game needs weather to vary within one outdoor map. Eldermere's current global weather remains simpler and already works well.
- **Cloud lighting:** test Azure's use of sun/moon scattering and cloud extinction against Eldermere's current sun-side lighting and storm darkening.
- **Celestial timing:** Azure exposes latitude/longitude and a time curve, with a simple mode that continuously rotates the sun and moon. This could improve continuous shadow motion and support latitude/season features; keep the eight authored looks as the current art direction unless smoother celestial motion is desired.
- **Weather curves and groups:** Azure evaluates preset curves/gradients by time and can ramp groups at different rates. That is useful if Eldermere later needs weather properties to change at different speeds, but a full property-binding framework would add complexity without a current need.
- **Volumetric density:** adapt the math and tune ranges, not Unity render-pipeline dependencies.

## Suggested order

1. Preview the imported maps in the sky lab and choose a cloud/celestial subset.
2. Add texture-driven clouds behind a toggle and tune them against existing weather presets.
3. Add the atmospheric scattering controls and compare dawn, noon, dusk, night, overcast, and storm.
4. Prototype the depth-aware volumetric pass and check frame time before expanding it.
5. Decide which controls become normal game settings and which remain debug/creator tools.

## Current decisions

- The local weather zone preview in `sky-lab.html` fades one zone weather against clear weather and restores the selected global weather outside the marked area. It is a visual prototype, not the final multi-preset blending model. The later weather scheduler should own the separate transition speeds and combine full weather profiles spatially.
- Keep the current fixed sun/moon positions for performance and stable shadows. Revisit continuous motion only as a separate, measured option.

## Prototype status

- Azure's cloud renderer and preview controls were removed after visual comparison. The sky lab and F8 panel now control the density of Eldermere's procedural cloud layer directly; weather cover and cloud type remain the primary weather controls.
- The sky lab has an opt-in analytic Rayleigh/Mie scattering layer with strength and coefficient controls. The F8 panel also exposes it, plus a low-resolution depth-aware sun-shaft pass. These remain off by default; sun shafts require the post-processing path.
- The first cloud comparison made the sky too white, and the first correction hid most clouds. The final preview mask uses the packed texture's red/green noise channels directly, remaps coverage with weather cover and the density slider, and caps opacity. The original maps remain unchanged.
- A local weather zone marker in the lab fades a selected zone weather against clear weather. Full preset-to-preset mixing and scheduler integration remain later work.
- Volumetric light is still at the design stage. Prototype it after comparing cloud and scattering looks, then measure the depth-aware pass before considering it for normal play.

