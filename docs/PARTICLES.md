# Particles — design guide (z47)

One shared GPU particle system for the whole map (src/gfx/particles.js). Every puff of smoke, haze and glow from
every monster is drawn in **one draw call**; spells, hits, fires and weather effects should use it too.

## How it works
- A ring buffer of particles (16k) on one instanced quad. A particle is written once when it's born (position or
  offset, velocity, birth, life, sizes, alpha, colour, additive flag, seed); the GPU works out where it is and how it
  looks every frame. Only the slots written that frame are uploaded.
- **cling** particles ride a skeleton segment: each body's segments (bone → bone, radius → radius) are written into a
  small float texture once a frame, and the particle reads its segment there. A body-shaped cloud follows the bones
  exactly with no per-particle CPU work. **trail** particles are born on the body and then left in the world.
- Premultiplied alpha, so dark smoke (normal blend) and glows (additive) share the one draw. Fog is read from the scene.
- A 2×2 atlas of soft puffs made at start (no files). Puffs fade out near the camera so nothing fills the screen.

## Cost controls
- Emission per body thins with distance (×1 under 15 m, ×0.55 to 35 m, ×0.25 to 70 m, ×0.08 beyond) and off screen
  (×0.15).
- Skipped by the puddle mirror and the weather's cover pass.

## API
- `attach({ anchors, puffs })` → handle (`scale`, `remove()`). Puffs: `{ on, mode, rate, life, size, sizeByRadius,
  color, alpha, add, rise, drift }`.
- `burst(pos, { n, life, size, color, alpha, add, speed, rise })` for one-off sprays.
- `update(dt, camera)` once a frame after bodies move (play.js does it before rendering; the Monster lab too).

## Using it for creatures (src/rpg/creature.js `shadePuffs`)
- Chains with an `aura` get a purple haze cloud, a dark heart and a violet core glow (spine 1–2). Other chains get
  smoke hugging the bones (radius × 1.8). Wing chains give off trailing wisps. Rates scale with `look.smoke`; the
  dissolve on death thins it via `uSmoke`.
