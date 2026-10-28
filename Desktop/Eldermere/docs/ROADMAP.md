# Eldermere — next upgrades (roadmap, 24 Oct 2026)

Order: Water v2 → Bridges → Foliage (trees) → Sky and time of day (done 25-Oct-t, docs/SKY_WEATHER.md) → Weather (done 25-Oct-u; surfaces 25-Oct-y; rain detail, temperature, weather light 25-Oct-z) → Roughness/relief (done 25-Oct-z2) → Snow rework (next: height map for all snow, voxels close up round the player) → Lighting (sun/sky with weather started 25-Oct-z; many lights later; window glow after the building pass) → Building tool → Model pass (guild and building variants later).

## Decisions (24 Oct)
- Water: realistic look (FFX-level: depth colour, reflections, foam), not stylised.
- Bridges: stone arch (town), timber (rural), multi-arch (long spans) for now; variants later.
- Day length: a manual key to step the time for testing, for now.
- Weather: an RNG cycle with durations set in the world variables, like a looping planner; quests and story can
  also set it.
- Rivers and swimming: crossing or being swept away depends on the character. Faster current and worse
  conditions drain stamina faster; at 0 stamina the player takes health damage. Still water: stamina refills
  normally; slow: no refill, slight drain; faster: more drain.
- Guild and building variants: later (includes the guild hall stair fix).

## 1. Water v2 — DONE (build 24-Oct-z)
- Per-body mesh on a 1 m grid; per corner depth, shore distance, current (parabolic profile across the stream).
- Shader (src/gfx/water.js): depth colour, flow-map ripples + wind layer, sky reflection, sun glint, shore and
  fast-shallow foam, sky-driven light.
- Swimming uses the same current field; stamina rules above; swept-away damage.
- Smooth shores, waterfalls and rapids: DONE (24-Oct-za). Rock cliffs (climbable) and proper waterfall sheets: DONE (24-Oct-zb). Spray/mist particles, water sound, clutter painting: DONE (24-Oct-zf). Still to do: overhangs/caves behind falls.
- Bridges must avoid piers in falls and rapids (B.falls, roughness from src/data/water.js).

## 2. Bridges (auto, from roads) — FIRST VERSION DONE (24-Oct-zm)
- Still to do: piers avoiding falls and rapids, cutwaters and foam round piers, a creator toggle and style choice per
  bridge, abutment walls at the ends.
- A road stretch that crosses water or a drop beyond 3 m becomes a bridge automatically.
- Styles above; piers in the water (water flows round them); deck keeps pavements and parapets.
- Rivers stop being cut under roads: water passes under the bridge; the player can swim under.

## 3. Lighting and day/night (PS2 step method)
- 4–8 fixed lighting phases; nothing changes between them; ~10–20 s cross-fade at each boundary.
- Each phase: sun angle/colour, ambient, fog, sky, lamp strength. Lamps and windows on at dusk.
- Manual key to step to the next phase (testing). Maps can lock a phase.

## 4. Weather and world reactions
- States: clear, overcast, rain, storm, fog, snow; RNG cycle with durations in world variables; quest overrides.
- Wetness builds and dries: dark wet surfaces, shine, puddles in low spots.
- Drains fill and overflow; rivers rise and speed up (feeds st.waterRough for swimming); lakes rise slower.
- Snow builds on top faces where the temperature layer allows.

## 5. Foliage — TREE SYSTEM (25-Oct-o): grown species, leaf-card crowns, impostors, ~30 draw calls for all trees. SECOND PASS (25-Oct-k): detailed trees/bushes, grass patches with 3 LODs to ~95 m, fade-in, frustum culling, underwater plants, two-layer wind (shader formula far, spring grid near with player push), weather-ready API (foliage.wind / pushers), plants on the drawn ground and off roads; still to do: weather driving the wind, wet/snow reactions, more species, clutter upgrades
- From the existing foliage paint layer: grass, flowers, bushes, trees by climate/moisture, reeds by water.
- Instanced per chunk, culling/LOD, wind sway, wet/snow reactions; collision for trunks only.

## 6. Model upgrade pass
- Placeholders and weaker buildings, in batches.
