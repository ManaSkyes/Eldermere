// src/game/play.js — the play screen: the 3D scene, the player, the HUD and the pause menu.
// For now it runs the test grounds; later the same screen hosts the guild hall and dungeons.
import { createInput, ACTIONS, keyName, loadSettings, saveSettings } from './input.js';
import { createLodZoneScheduler } from '../gfx/lodZones.js';
import { createController, MOVE } from './controller.js';
import { testGroundsShapes, buildTestGrounds, testGroundsWater } from './testGrounds.js';
import { escapeHtml } from '../ui/util.js';
import { loadHuman } from '../rpg/human.js';
import { createMirror } from './mirror.js';
import { POTIONS, TEST_KIT } from '../data/potions.js';
import { createInventory, addMaterial, takeMaterial, countOf, addItem } from '../rpg/inventory.js';
import { bodyMods } from '../rpg/morphStats.js';
import { RACES as BODY_RACES } from '../rpg/races.js';
import { RACES as CREATION_RACES } from '../data/creation.js';
import { setBody, MAIN_STATS, derived, train, awardCombatXp, xpToNext } from '../rpg/stats.js';
import { startViewer } from '../rpg/humanViewer.js';
import { squatDrop } from '../rpg/humanRig.js';
import { createBook } from '../ui/book.js';
import { createAudio } from './audio.js';
import { createParticles } from '../gfx/particles.js';
import { MONSTERS, monsterSpec } from '../data/monsters.js';
import { buildCreature } from '../rpg/creature.js';
import { createSwingTrail } from '../gfx/swingTrail.js';
import { createHarvest } from './harvest.js';
import { learnKill, learnHit, known as knownBeast } from '../rpg/bestiary.js';
import { capacity, loadOf, encumbrance } from '../rpg/carry.js';
import { ITEMS } from '../rpg/equipment.js';
import { noiseOf, visibilityOf, stepAwareness, awarenessLabel, STEALTH } from '../rpg/stealth.js';
import { surfaceOf } from '../data/surfaces.js';
import { topAt, lineBlocked } from './physics.js';
import { testRoutes, buildRoutes, createSparkles, nearestOnRoute, ROUTE_NODE } from './traverse.js';
import { courseRoutes, courseHazards, courseCheckpoints, courseSentries, buildCourse, HAZARD } from './course.js';
import { createProjectiles } from './projectiles.js';
import { hasNode } from '../data/skillTrees.js';
import { createCombat } from './combat.js';
import { createDummies } from './dummies.js';
import { createMonsterActors } from './monsterActors.js';
import { createSpellcast } from './spellcast.js';
import { buildDungeonShapes, lightDungeon } from './dungeonBuild.js';
import { createDungeonObjects } from './dungeonObjects.js';
import { createEnemies } from './enemies.js';
import { OBJECTS, ENEMY_TYPES, variantOf, statsOf, migrateEnemies } from '../data/objects.js';
import { globalsOf, sunDirection } from '../data/globals.js';
import { createPostFX } from '../gfx/postfx.js';
import { ATMOSPHERE_DEFAULTS, applyAtmosphericHaze } from '../gfx/atmosphere.js';
import { runWorkerStressTest } from './workers/stressTest.js';
import { createSky } from '../gfx/sky.js';
import { createWeather, WEATHER, CLOUDS, FOG } from '../gfx/weather.js';
import { createWeathering } from '../gfx/weathering.js';
import { createReflections } from '../gfx/reflections.js';
import { learnSpell, preparedOf, preparedMax, togglePrepared, castProfile } from '../rpg/magic.js';
import { SPELLS, SPELL_CAST } from '../data/spells.js';
const SCHOOL_GLYPH = { fire: '✹', water: '≋', earth: '◆', wind: '❋', light: '☀', dark: '☾', lunar: '☽', holy: '✚' };

let humanCache = null;

// Standing height (m) from the saved body: the height slider, a little shorter on the feminine side.
function bodyHeight(appearance) {
  const p = appearance?.params; if (!p) return 1.75;
  return Math.max(1.35, Math.min(2.2, 1.76 + 0.4 * ((p.height ?? 0.5) - 0.5) - 0.1 * (p.fem ?? 0)));
}

export function startPlay(root, save, { onExit }) {
  const THREE = globalThis.THREE;
  let running = true;
  const character = save.stats;
  root.innerHTML = `
    <section class="play">
      <canvas class="play-canvas"></canvas>
      <div class="hud" aria-hidden="true">
        <div class="underwater"></div>
        <div class="blinded"></div>
        <div class="crosshair"></div>
        <div class="combo-ring"><i class="combo-target"></i><i class="combo-wave"></i></div>
        <div class="hud-vitals"><div class="bar stamina" title="Stamina"><svg viewBox="0 0 20 72"><defs><clipPath id="clip-stamina"><path d="M4 6h12v56a6 6 0 0 1 -12 0z"/></clipPath></defs><path class="glass" d="M4 6h12v56a6 6 0 0 1 -12 0z"/><g clip-path="url(#clip-stamina)"><rect class="liquid" x="0" y="0" width="20" height="72" fill="#e8c64a"/></g><path class="outline" d="M4 6h12v56a6 6 0 0 1 -12 0z"/><rect class="cork" x="2.5" y="1" width="15" height="6" rx="1.5"/><path class="shine" d="M7 12v44"/></svg></div><div class="bar shadow" title="Hidden"><svg viewBox="0 0 20 72"><defs><clipPath id="clip-shadow"><path d="M4 6h12v56a6 6 0 0 1 -12 0z"/></clipPath><linearGradient id="liq-shadow" x1="0" x2="1"><stop offset="0" stop-color="#1a1430"/><stop offset="0.5" stop-color="#5a4a8a"/><stop offset="1" stop-color="#1a1430"/></linearGradient></defs><path class="glass" d="M4 6h12v56a6 6 0 0 1 -12 0z"/><g clip-path="url(#clip-shadow)"><rect class="liquid" x="0" y="0" width="20" height="72" fill="url(#liq-shadow)"/><rect class="detect" x="8" y="0" width="4" height="72" fill="#ff4a3a"/></g><path class="outline" d="M4 6h12v56a6 6 0 0 1 -12 0z"/><rect class="cork" x="2.5" y="1" width="15" height="6" rx="1.5"/><path class="shine" d="M7 12v44"/></svg></div><div class="bar breath" hidden title="Breath"><svg viewBox="0 0 20 72"><defs><clipPath id="clip-breath"><path d="M4 6h12v56a6 6 0 0 1 -12 0z"/></clipPath></defs><path class="glass" d="M4 6h12v56a6 6 0 0 1 -12 0z"/><g clip-path="url(#clip-breath)"><rect class="liquid" x="0" y="0" width="20" height="72" fill="#9fe0f0"/></g><path class="outline" d="M4 6h12v56a6 6 0 0 1 -12 0z"/><rect class="cork" x="2.5" y="1" width="15" height="6" rx="1.5"/><path class="shine" d="M7 12v44"/></svg></div><div class="flasks"><div class="bar mp" title="Mana"><svg viewBox="0 0 60 80"><defs><clipPath id="clip-mp"><path d="M23 7h14v18a25 25 0 1 1 -14 0z"/></clipPath><linearGradient id="liq-mp" x1="0" x2="1"><stop offset="0" stop-color="#24357a"/><stop offset="0.45" stop-color="#5a7fe8"/><stop offset="1" stop-color="#24357a"/></linearGradient></defs><path class="glass" d="M23 7h14v18a25 25 0 1 1 -14 0z"/><g clip-path="url(#clip-mp)"><rect class="liquid" x="0" y="0" width="60" height="80" fill="url(#liq-mp)"/><rect class="surface" x="0" y="0" width="60" height="2.5"/></g><path class="outline" d="M23 7h14v18a25 25 0 1 1 -14 0z"/><rect class="cork" x="21" y="2" width="18" height="7" rx="2"/><path class="shine" d="M15 44a17 17 0 0 1 9 -12"/></svg><small class="num"></small></div><div class="bar hp" title="Health"><svg viewBox="0 0 60 80"><defs><clipPath id="clip-hp"><path d="M23 7h14v18a25 25 0 1 1 -14 0z"/></clipPath><linearGradient id="liq-hp" x1="0" x2="1"><stop offset="0" stop-color="#6a1612"/><stop offset="0.45" stop-color="#d8483e"/><stop offset="1" stop-color="#6a1612"/></linearGradient></defs><path class="glass" d="M23 7h14v18a25 25 0 1 1 -14 0z"/><g clip-path="url(#clip-hp)"><rect class="liquid" x="0" y="0" width="60" height="80" fill="url(#liq-hp)"/><rect class="surface" x="0" y="0" width="60" height="2.5"/></g><path class="outline" d="M23 7h14v18a25 25 0 1 1 -14 0z"/><rect class="cork" x="21" y="2" width="18" height="7" rx="2"/><path class="shine" d="M15 44a17 17 0 0 1 9 -12"/></svg><small class="num"></small></div></div><div class="hud-spell" hidden><i class="rune"></i><span><b></b><small></small></span></div><span class="hud-rest">Resting · regeneration ×3</span></div>
        <div class="hud-stealth" title="How far your noise carries, and whether the sentry has noticed you"><span class="eye"></span><div class="noise"><i></i></div><small></small></div>
        <div class="hurt"></div>
        <div class="hud-debug"></div>
        <div class="hud-note"></div>
        <div class="hud-toast"></div>
        <div class="hud-prompt"></div>
        <ol class="hotbar"></ol>
      </div>
      <div class="pause" role="dialog" aria-label="Paused">
        <div class="pause-box">
          <h2>${escapeHtml(save.name)}</h2>
          <p class="muted pause-where">Test grounds · build 25-Oct-z74 (monsters, part 3: the Umbrafiend and the Nocturian bat in the game — spawn them from the F8 panel; damage types and resistances, hit zones, poise and staggers, knockdowns and launches, their attacks blockable (a perfect block makes them recoil, a deflect staggers them), shadow bullets, and the bat's screech that darkens your sight and muffles your hearing · every shortsword move deals slash, pierce or blunt · z44: rain performance: the puddle mirror keeps its lists of what to leave out instead of walking the whole scene every frame, and drops small far things it would only show as a few pixels; the weather's cover and lamp-shadow passes no longer walk the whole scene when they run (a hitch every few seconds); less garbage per frame in the rain · Guard push moves to the Guardian side · z43: one swing reaches 1–2 foes with a shortsword (thrusts one, the whirling cut five), nearest the blade first · skill gains halved again · Shortsword tree part 2: timing nodes in every rank, more core passives, ranked actives, follow-ups — Extended lunge / Closing strike slash after Closing thrust, Rising slash or Guard push after Hamstring cut, Tornado jab / Sky piercer after Whirling cut — Thousand cuts is a held flurry, the guard side needs no shield (tap counter: Winding thrust, hold counter: Rush) · z42: skill gains cut to a tenth: perfect hits and perfect blocks give the full amount, ordinary ones half, training dummies a tenth · recovery after a combo ends or breaks: the main hand waits a moment (the reticle dims) · whirling cut and other specials now fire after the last light of a short chain · weapons out: no weight-shifting idle under the stance · the tree shows your max combo · z41: Shortsword skill tree: the arming sword now trains Shortsword; Striker (left) — perfect-combo passives and specials that take over the heavy by combo position: closing thrust (no lights), pommel strike (1), hamstring cut (2), whirling cut (3), thousand cuts (4+), Flowing steel extender; Guardian (right) — perfect-block window, braced blocks, shield rush and winding thrust counters, deflect, hold the line, Unbroken guard extender; side choices lock their counterpart, passive for passive, active for active · z40: the block holds the shield flat in front of the chest, face to the enemy; the perfect sound rebuilt from the clean clip — a slow glassy swell that cuts off · z39: perfect sound: slower swell at the clip's real timing, with a low ~495 Hz body under the shimmer · z38: the perfect sound remade after Phantasy Star Universe's just-attack shimmer · z37: the raised shield is held out at arm's length — no longer clips the face; the perfect chime is a softer, lower metallic ting · z36: perfect combos: press the next attack as the reticle's ring meets the target ring (the end of the swing) for +20–50% damage — daggers the tightest window and biggest bonus, great weapons the loosest; early carries the chain on without it, late ends it; a chime on a perfect press and a perfect block · ready pose: the sword carried low at the hip, the shield down by the side until you block · z35: shield arm: held forward-left and angled, covering the left side and face; it rises over the head as the sword chambers, tucks in as cuts land, swings clear of backhands, leads thrusts · guard counter: block on the shield or the blade, then attack while the guard is up — a riposte, or a shield bash and cut; a short window (longer after a perfect block), costs stamina, 2 s cooldown · blocks now let some damage through: shields stop more and absorb more stamina than a blade guard · z34: arming sword: whole-body fencing art — guard stance with feet planted, hips and shoulders turn into each cut, steps, passes and lunges; light chain fendente · riverso · punta · sottano · mezano, finisher passing cut; heavy chain of committed cuts and a lunging thrust · z33: weapon combos: 2 hits to start, growing with skill to 10/8/6/5–4; light, heavy and mixed chains with new moves; combo preview in the creator's Animation lab · z32: third person: the camera circles you freely, you run the way the keys point and the body turns to it, the head leads the turn and glances toward the camera; weapons out or a spell readied: face the camera and strafe · everyday moves: drinking a potion plays (the potion takes hold as it's swallowed); Animation lab in the creator · z31: capes and skirts lag the body when it speeds up, stops or lands · z30: hair no longer lost when the body updates (bald in levels, broken after Bald → Hair); the body and clothes get detail levels by distance; skin lets light through (soft warm shadow line, Translucency slider); hair status and shader errors in the F8 panel · z29: hair bound like the body — it no longer drifts off the head or vanishes when regrown in a level; turning on the spot carried, only 10% swings; hair detail steps further out with a margin (no flicker); the creator's character fills the left side · z28: hair: steady running no longer streams it back, only speeding up / stopping throws it; heavy ends damped; Hair lab in the creator; Edit look on saved characters; the creator holds still · z27: new hair: wide layered cards round simulated guides, moved on the GPU; strand highlights; detail by distance; realistic settling physics with inertia, wind and body collisions · z26: surfaces skip all the weather work when it's dry and clear; the ground's shader works out its rock, shore and grass once instead of four times; Measure each part splits out your hair, your shadow and the far shadows · z25: far shadows out to ~170 m (a second, coarser map, redrawn every second); near shadows sit ahead of you; Measure each part in the performance panel · z24: mouse wheel zooms the camera in and out — all the way in is first person · z23: third person: the camera's wall check tests only nearby shapes — ~9 ms a frame saved · z22: the performance panel breaks the game's time down by part, and times the GPU properly · z21: lamp shadows: each lit lamp has its own shadow cube — no more dark patches on walls, jagged alley shadows or stray squares; characters are lit by the lamps · z20: wall lanterns glow all round and aren't hidden by their own eave; street lamps brighter, wider, 18 m, steady (burning lamps keep their place); the book no longer recompiles every shader on first open; hair cards cast no shadow and skip the puddle mirror · z19: street lamps: a cone of light down, blocked by buildings, many lit ahead of you, dimmed by weather; no lamp within 5 m of another light; cliff rock relief; lamps glow and light the ground right across a plaza; cloud shadows; slip cooldowns; sand lies thicker, dust piles on windward walls; props get grain and relief; snow stutters fixed; snow surface fixed to the world — no swimming as you move; snow drifts against walls, planters and posts; no bare patches; dust on walls, by storm strength; the snow surface covers the whole snowy area — no box round you; snow spreads in under eaves and up to walls; rain fills puddles by how hard it falls; dust and sand storms coat everything, wind and rain clear it; snow you can stand in: a real snow surface round you that drops over edges and holds your prints and trenches; snow builds up over an hour, half of it in minutes; prints fill in only while it snows)</p>
          <div class="pause-main">
            <button class="btn" data-act="resume">Click to play</button>
            <button class="btn ghost" data-act="controls">Controls</button>
            <button class="btn ghost" data-act="exit">Leave the test grounds</button>
          </div>
          <div class="pause-controls" hidden></div>
        </div>
      </div>
    </section>`;
  const $ = s => root.querySelector(s);
  const canvas = $('.play-canvas'), pause = $('.pause'), dbg = $('.hud-debug'), bar = $('.bar.stamina'), note = $('.hud-note');
  const toastEl = $('.hud-toast'), hotbarEl = $('.hotbar');

  // ---- scene ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const settings = loadSettings();
  // render scale: 1 = the screen's real pixels (capped at 1.5x on high-density screens); lower is faster
  const applyScale = () => renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5) * (settings.renderScale ?? 1));
  applyScale();
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // two shadow maps for the sun (near, far): every lit material reads them as one (see sunFar below)
  if (!THREE.ShaderChunk.shadowmap_pars_fragment.includes('wxSunShadow')) {
    const SC = THREE.ShaderChunk, rd = i => `getShadow( directionalShadowMap[ ${i} ], directionalLightShadows[ ${i} ].shadowMapSize, directionalLightShadows[ ${i} ].shadowBias, directionalLightShadows[ ${i} ].shadowRadius, vDirectionalShadowCoord[ ${i} ] )`;
    SC.shadowmap_pars_fragment += `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
float wxSunShadow() { vec4 c = vDirectionalShadowCoord[ 0 ]; vec3 p = c.xyz / c.w; vec2 e = min(p.xy, 1.0 - p.xy);
  float fN = smoothstep(0.0, 0.06, min(e.x, e.y)); if (p.z > 1.0) fN = 0.0; float sN = 1.0, sF = 1.0;
  if (fN > 0.0) sN = ${rd(0)};
  if (fN < 1.0) sF = ${rd(1)};
  return mix(sF, sN, fN); }
#endif`;
    const line = 'directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
    if (SC.lights_fragment_begin.includes(line)) SC.lights_fragment_begin = SC.lights_fragment_begin.replace(line, `#if NUM_DIR_LIGHT_SHADOWS > 1 && UNROLLED_LOOP_INDEX == 0
		directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? wxSunShadow() : 1.0;
		#elif NUM_DIR_LIGHT_SHADOWS > 1 && UNROLLED_LOOP_INDEX == 1
		#else
		${line}
		#endif`);
    const mline = 'shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
    if (SC.shadowmask_pars_fragment.includes(mline)) SC.shadowmask_pars_fragment = SC.shadowmask_pars_fragment.replace(mline, `#if NUM_DIR_LIGHT_SHADOWS > 1 && UNROLLED_LOOP_INDEX == 0
		shadow *= receiveShadow ? wxSunShadow() : 1.0;
		#elif NUM_DIR_LIGHT_SHADOWS > 1 && UNROLLED_LOOP_INDEX == 1
		#else
		${mline}
		#endif`);
  }
  // glow and colour grading (src/gfx/postfx.js): with it on, its last pass does the tone mapping
  const fx = createPostFX(THREE, renderer);
  const applyFx = () => { renderer.toneMapping = settings.postfx !== false ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping; };
  applyFx();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9fc3e6'); const worldFog = new THREE.Fog('#b9d3ea', 40, 110); scene.fog = worldFog;
  // Prototype settings stay off by default so existing players keep the current look until the haze is tested.
  const atmosphereSettings = { ...ATMOSPHERE_DEFAULTS };
  const hemi = new THREE.HemisphereLight('#dbe9ff', '#5d6b4a', 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 1.25); sun.position.set(18, 30, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 90 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;   // (normal bias: no dark acne patches on flat faces lit at a slant)
  // the far shadows: a second, coarser shadow map of the sun out to ~170 m (sunFar gives no light of its own: its map is
  // read through the sun's — near map close by, far map beyond, faded across the near map's edge). The far map is
  // redrawn only when you've moved 15 m or a second has passed.
  const sunFar = new THREE.DirectionalLight('#ffffff', 0); sunFar.castShadow = true;
  sunFar.shadow.mapSize.set(2048, 2048); Object.assign(sunFar.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 1, far: 420 }); sunFar.shadow.bias = -0.0015; sunFar.shadow.normalBias = 0.2;
  sunFar.shadow.autoUpdate = false; let farAt = { x: 1e9, z: 1e9, t: -1e9 };
  scene.add(sun, sun.target, sunFar, sunFar.target);
  // play-testing a dungeon from the dungeon creator (index.html?playtest): the map alone (the test grounds' field,
  // course, racks, mirror and sentries are only built when there's no map)
  const DUNGEON_ORIGIN = { x: 200, y: 0, z: -120 };
  const playtest = new URLSearchParams(location.search).has('playtest') ? (() => { try { return JSON.parse(localStorage.getItem('eldermere.playtest')); } catch { return null; } })() : null;
  if (playtest) migrateEnemies(playtest.objects);   // (old maps' enemy archetypes → the monster groups)
  const dungeon = playtest ? buildDungeonShapes(playtest, DUNGEON_ORIGIN) : null;
  const TG = !dungeon;                                                                      // the test grounds, when no map is being played
  const shapes = TG ? testGroundsShapes() : [];
  if (dungeon) shapes.push(...dungeon.shapes);
  // training dummies beside the weapon rack, to try weapons (and spells) on
  const dummies = createDummies(THREE, scene, TG ? [{ x: 5.5, z: 8.5, yaw: 2.6 }, { x: 7.5, z: 6.5, yaw: 2.2 }, { x: 4.0, z: 11.0, yaw: 2.9 }] : []);
  shapes.push(...dummies.shapes);
  buildTestGrounds(THREE, scene, shapes, dungeon?.decor || [], dungeon?.pathSurfaces || [], dungeon?.groundSplat || null, { field: TG });
  // the map's global settings from the creator's Global tab (src/data/globals.js)
  const G = globalsOf(playtest);
  const dungeonObjs = dungeon ? createDungeonObjects(THREE, scene, playtest, DUNGEON_ORIGIN, shapes) : null;   // its traps and triggers
  const enemies = dungeon ? createEnemies(THREE, scene, playtest, DUNGEON_ORIGIN, shapes, { floatText: (...a) => dummies.floatText(...a) }) : null;   // and its enemies
  // the new monsters (docs/MONSTERS.md; the F8 panel spawns them in front of you for now)
  const particles = createParticles(THREE, scene);
  const swingTrail = createSwingTrail(THREE, scene); const trailB = new THREE.Vector3(), trailT = new THREE.Vector3();   // (the pale ghost of your swings)   // (one draw for every monster's smoke: src/gfx/particles.js)
  const monsters = createMonsterActors(THREE, scene, { particles, shapes, floatText: (...a) => dummies.floatText(...a), audio: { monster: (...a) => audio.monster(...a) } });
  const allTargets = () => (enemies ? dummies.targets.concat(enemies.targets) : dummies.targets).concat(monsters.nearTargets);   // what weapons and spells can hit (monsters: only those within 40 m — 300 on a map shouldn't cost every swing)
  const dungeonLights = dungeon ? lightDungeon(THREE, scene, dungeon, { pool: G.lights, color: G.torchColor, bright: G.torchBright, range: G.torchRange }) : null;
  dungeonLights?.foliage?.bake(renderer);                                                   // the trees' impostor pictures, taken once
  // ---- the sky and the light ----
  // Outdoors (the test grounds, and any map whose kind is outdoors) the sky follows the time of day: eight core looks
  // through the 24 hours, easing from one to the next (src/gfx/sky.js), lamps lit from dusk to dawn. A map that's
  // underground or indoors keeps its own fixed light from the creator's Global tab, inside its bounds. Underwater
  // tints the fog on top of either.
  const OUTDOOR = !dungeon || G.kind === 'outdoor';
  const sky = createSky(THREE, scene, { hour: dungeon ? G.hour : 12, cycle: dungeon ? G.timeCycle !== false : true, dayMinutes: G.dayMinutes || 24, blend: G.phaseBlend ?? 20, view: dungeon ? Math.max(G.view, 60) : 300, fogScale: dungeon ? Math.max(0.4, (G.fogFar || 220) / 240) : 1 });
  sky.onPhase = ph => { dungeonLights?.setLamps(ph.look.lamps); };
  dungeonLights?.setLamps(OUTDOOR ? sky.state.lamps : true);
  // the weather (src/gfx/weather.js): outdoors only; the map's own weather to begin with (the creator's Global tab)
  const weather = OUTDOOR ? createWeather(THREE, scene, { sky, foliage: dungeonLights?.foliage, audio: { thunder: d => audio.thunder(d), weather: l => audio.weather(l) } })   /* (audio is made further down) */ : null;
  if (weather && dungeonLights?.foliage?.wind) { const a = (G.windDir ?? 270) * Math.PI / 180; dungeonLights.foliage.wind.dirX = -Math.sin(a); dungeonLights.foliage.wind.dirZ = Math.cos(a); }   // (from the north: blowing toward +z)
  if (weather) {                                                                             // the layers the map takes over from its weather
    if (dungeon && CLOUDS[G.clouds]) weather.clouds = { type: G.clouds, cover: G.cloudCover != null ? G.cloudCover / 100 : undefined };
    if (dungeon && G.windStrength != null && G.windStrength !== '' && G.windAuto === false) weather.wind = { strength: G.windStrength / 50 };
    { const fl = G.fogAuto === false && (!G.fogLevel || G.fogLevel === 'auto') ? 'normal' : G.fogLevel;   // (older maps: 'fog with the weather' unticked)
      if (dungeon && fl && fl !== 'auto') weather.fog = FOG[fl] ?? (G.fogThickness ?? 50) / 50; }
    if (dungeon && G.tempAuto === false) weather.temp = G.temperature ?? 15;
    if (dungeon && G.aurora && G.aurora !== 'auto') weather.aurora = G.aurora === 'on' ? 1 : 0;
    weather.set(dungeon ? (G.weather || 'clear') : 'clear', dungeon ? (G.weatherStrength ?? 50) / 50 : 1, 0.01);
  }
  // what the weather does to surfaces (src/gfx/weathering.js): wet, puddles, snow lying; rain and snow stopped by roofs and trees
  const weathering = weather ? createWeathering(THREE, renderer, scene) : null;
  if (weathering) { weathering.weatherizeScene(scene); weathering.lampLitScene(scene); weather.useCover(weathering);
  }
  // puddle reflections (src/gfx/reflections.js): mirror view, screen-space or off — the Reflections option
  const reflections = weathering ? createReflections(THREE, renderer, scene, weathering, fx) : null; if (reflections) reflections.mode = settings.reflections || 'planar';
  let reflY = null;
  // what a footstep sounds like: the ground's own kind (the painted ground: grass, dirt, sand, gravel, mud, rock, snow,
  // cobbles), then the weather on it — wet, a puddle now and then while there are puddles, snow lying (its depth read
  // from the snow map under your feet; streets keep less of it)
  const SPLAT_SOUND = { 1: 'grass', 2: 'dirt', 3: 'stone', 4: 'sand', 5: 'gravel', 6: 'mud', 7: 'snow', 8: 'stone', 9: 'grass' };
  // what the weather has done to the ground under you, for movement (src/game/controller.js st.env): the snow's depth
  // (read from the snow map 5 times a second; trodden prints keep less), ice (frozen puddles and wet stone — a puddle
  // is somewhere about, so the chance grows with how many there are; grass barely ices), wet
  let envT = 0;
  function groundEnv(dt) {
    const st = player.state; envT -= dt; if (envT > 0) return; envT = 0.2;
    const ws = weathering.state, onGrass = st.groundShape?.terrain && !st.groundShape?.path;
    const sd = weathering.snowAt(st.pos.x, st.pos.z), iceK = ws.ice * Math.min(1, ws.puddle * 0.7 + ws.wet * 0.45) * (onGrass ? 0.25 : 1);
    st.env = { snow: sd, ice: sd > 0.04 ? iceK * 0.3 : iceK, wet: ws.ice > 0.3 ? 0 : ws.wet };
  }
  let footSide = 1;
  function underfoot() {
    const st = player.state; let sound = surfaceOf(st.surface).sound; const gs = dungeon?.groundSplat;
    if (st.groundShape?.terrain && gs) { const i = Math.floor(st.pos.x - gs.x), j = Math.floor(st.pos.z - gs.z);
      if (i >= 0 && j >= 0 && i < gs.w && j < gs.h) { const o = (j * gs.w + i) * 4, k = gs.data[o]; sound = SPLAT_SOUND[k] || (gs.data[o + 2] < 40 ? 'snow' : 'grass'); } }
    if (weathering) { footSide = -footSide; weathering.footstep(st.pos.x, st.pos.z, Math.atan2(-Math.cos(st.yaw), -Math.sin(st.yaw)), footSide, st.env?.snow); }   // a print in the snow
    const opts = {}; if (weathering && sound !== 'water') {
      const sd = weathering.snowAt(st.pos.x, st.pos.z);   // (the map already holds each surface's share)
      opts.snow = sound === 'snow' ? Math.max(sd, 0.05) : sd; opts.wet = weathering.state.wet; opts.splash = Math.random() < weathering.state.puddle * 0.4 + weathering.state.gutter * 0.08 && sd < 0.015;
    }
    return [sound === 'snow' ? 'grass' : sound, acoustics(), opts];
  }
  // (underground and indoors: always lit)
  const FIXED = { bg: G.background, fog: G.fogColor, near: G.fogNear, far: G.fogFar, hemi: [G.ambient, G.ambientGround, G.ambientStrength], sun: G.sun ? G.sunStrength : 0, sunColor: G.sunColor, sunDir: sunDirection(G.hour), view: Math.max(G.view, 10), shadows: G.sun && G.shadows, bloom: G.bloom, grade: G.grade };
  const skyRegions = dungeon && !OUTDOOR ? [{ min: dungeon.bounds.min, max: dungeon.bounds.max }] : [];
  const inBox = (r, p) => p.x > r.min[0] && p.x < r.max[0] && p.y > r.min[1] && p.y < r.max[1] && p.z > r.min[2] && p.z < r.max[2];
  let skyNow = null, waterT = 0, viewNow = 0, shadowNow = null;
  function applySky(p, wet) {
    const fixed = skyRegions.some(r => inBox(r, p)), S = sky.state;
    sky.dome.visible = !fixed;
    if (fixed) {
      if (skyNow !== FIXED) { skyNow = FIXED; scene.background.set(FIXED.bg); hemi.color.set(FIXED.hemi[0]); hemi.groundColor.set(FIXED.hemi[1]); hemi.intensity = FIXED.hemi[2]; sun.intensity = FIXED.sun; sun.color.set(FIXED.sunColor); }
    } else {
      skyNow = { hemi: [S.hemiSky, S.hemiGround, S.hemi[2]], sunDir: S.sunDir, bloom: S.bloom, grade: S.grade, view: S.view, shadows: true };
      scene.background.copy(S.horizon); hemi.color.copy(S.hemiSky); hemi.groundColor.copy(S.hemiGround); hemi.intensity = S.hemi[2]; sun.intensity = S.sun; sun.color.copy(S.sunColor);
    }
    const view = fixed ? FIXED.view : S.view; if (view !== viewNow) { viewNow = view; camera.far = view; camera.updateProjectionMatrix(); }
    const sh = (fixed ? FIXED.shadows : true) && settings.shadows !== false; if (sh !== shadowNow) { shadowNow = sh; sun.castShadow = sh; }
    MOVE.gravity = 22 * (G.gravity ?? 1);
    if (wet) { worldFog.color.set('#1f5f7a'); worldFog.near = 0.5; worldFog.far = 14; }
    else if (fixed) { worldFog.color.set(FIXED.fog); worldFog.near = FIXED.near; worldFog.far = FIXED.far; }
    else { worldFog.color.copy(S.fog); worldFog.near = S.near; worldFog.far = S.far; }
    // The prototype only extends ordinary outdoor visibility; water, interiors, and stronger local fog retain priority.
    applyAtmosphericHaze(worldFog, atmosphereSettings, { fixed, wet, outdoor: OUTDOOR });
    // a screech's darkness on you: you see a tenth as far (the fog closes in, dark), less as it wears off
    if (blind.k > 0.001) { const k = blind.k, sight = blind.sight; worldFog.far = worldFog.far * (1 - k + k * sight); worldFog.near = Math.min(worldFog.near, worldFog.far * 0.25); worldFog.color.lerp(blind.col, k * 0.85); }
    // Removing scene.fog disables the fog shader path entirely, unlike pushing its near/far distances out of view.
    scene.fog = probe.fogOff ? null : worldFog;
  }
  // ---- what monsters' auras lay on you: less sight, less hearing (src/game/monsterActors.js debuff) ----
  const blind = { k: 0, t: 0, sight: 1, hearing: 1, col: new THREE.Color('#05030a') };
  function debuff(effect, why) {
    blind.t = Math.max(blind.t, effect.seconds || 6); blind.sight = Math.min(blind.sight < 1 && blind.t > 0 ? blind.sight : 1, effect.sight ?? 1); blind.hearing = Math.min(blind.hearing < 1 && blind.t > 0 ? blind.hearing : 1, effect.hearing ?? 1);
    toast(`${why}: you can barely see or hear.`);
  }
  const routes = TG ? testRoutes().concat(courseRoutes()) : []; if (TG) buildRoutes(THREE, scene, routes);       // the thief's routes (src/game/traverse.js), the course's too
  const course = TG ? buildCourse(THREE, scene) : { update() {} }, hazards = TG ? courseHazards() : [], checkpoints = TG ? courseCheckpoints() : [];
  if (dungeon) { hazards.push(...dungeon.hazards); checkpoints.push(...dungeon.checkpoints); }
  const projectiles = createProjectiles(THREE, scene, shapes);
  const sparkles = createSparkles(THREE, scene);
  // water: a see-through surface (only the top: box sides would z-fight with pool walls and flicker);
  // underwater, the blue fog does the rest
  const water = TG ? testGroundsWater() : [];
  const waterMat = new THREE.MeshStandardMaterial({ color: '#2f7fa6', transparent: true, opacity: 0.55, roughness: 0.12, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  for (const w of water) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.max[0] - w.min[0] - 0.02, w.max[2] - w.min[2] - 0.02), waterMat);
    m.rotation.x = -Math.PI / 2; m.position.set((w.min[0] + w.max[0]) / 2, w.max[1], (w.min[2] + w.max[2]) / 2); m.renderOrder = 2; scene.add(m);
  }
  if (dungeon) water.push(...dungeon.swim);                                       // the town's canals: swimmable (drawn by lightDungeon)
  // a full-length mirror a few steps ahead of where you start
  const mirror = createMirror(THREE, 1.2, 2.1);
  { const g = new THREE.Group(), frame = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.6 });
    mirror.mesh.position.set(0, 1.15, 0.03); g.add(mirror.mesh);
    for (const [w, h, x, y] of [[1.4, 0.1, 0, 2.25], [1.4, 0.1, 0, 0.05], [0.1, 2.3, -0.65, 1.15], [0.1, 2.3, 0.65, 1.15]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), frame); m.position.set(x, y, 0); m.castShadow = true; g.add(m); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 0.04), frame); back.position.set(0, 1.15, -0.03); g.add(back);
    g.position.set(-2.6, 0, 4.6); g.rotation.y = Math.atan2(0 - g.position.x, 0 - g.position.z); if (TG) scene.add(g);   // its glass (+Z) faces the start
    const c = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y), hw = 0.75, hd = 0.12;          // collision: a box around it
    const xs = [-hw, hw].flatMap(x => [-hd, hd].map(z => g.position.x + x * c + z * sn)), zs = [-hw, hw].flatMap(x => [-hd, hd].map(z => g.position.z - x * sn + z * c));
    if (TG) shapes.push({ type: 'box', min: [Math.min(...xs), 0, Math.min(...zs)], max: [Math.max(...xs), 2.3, Math.max(...zs)] }); }
  // a weapon rack with every weapon, for testing (E to open)
  const RACK = { x: 2.6, z: 4.6 };
  { const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#7a5434', roughness: 0.7 }), metal = new THREE.MeshStandardMaterial({ color: '#9aa0a8', metalness: 0.8, roughness: 0.35 });
    const add = (w, h, d, x, y, z, m = wood) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    add(0.1, 1.5, 0.1, -0.8, 0.75, 0); add(0.1, 1.5, 0.1, 0.8, 0.75, 0); add(1.7, 0.08, 0.14, 0, 1.35, 0); add(1.7, 0.08, 0.3, 0, 0.25, 0.05);
    for (let i = 0; i < 6; i++) { const x = -0.6 + i * 0.24; add(0.04, 1.1, 0.04, x, 0.85, 0.06, i % 2 ? metal : wood); add(0.12, 0.1 + (i % 3) * 0.06, 0.1, x, 1.42, 0.06, metal); }
    add(0.9, 0.5, 0.5, 0, 0.25, 0.55, wood);                                          // the chest in front
    g.position.set(RACK.x, 0, RACK.z); g.rotation.y = Math.atan2(-RACK.x, -RACK.z); if (TG) scene.add(g);
    if (TG) shapes.push({ type: 'box', min: [RACK.x - 0.95, 0, RACK.z - 0.95], max: [RACK.x + 0.95, 1.5, RACK.z + 0.95] }); }
  // a rack of magic focuses (staff, wand, orb, spellbook, bracelet), and a bookshelf of spells to learn
  const FRACK = { x: 4.9, z: 2.4 }, SHELF = { x: -4.9, z: 2.4 };
  { const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#5c3d5e', roughness: 0.7 }), glow = new THREE.MeshStandardMaterial({ color: '#9fd0ff', emissive: '#3a78c8', emissiveIntensity: 0.8 });
    const add = (geo, m, x, y, z) => { const b = new THREE.Mesh(geo, m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    add(new THREE.BoxGeometry(0.1, 1.5, 0.1), wood, -0.75, 0.75, 0); add(new THREE.BoxGeometry(0.1, 1.5, 0.1), wood, 0.75, 0.75, 0); add(new THREE.BoxGeometry(1.6, 0.08, 0.16), wood, 0, 1.35, 0); add(new THREE.BoxGeometry(1.6, 0.08, 0.3), wood, 0, 0.3, 0.05);
    for (let i = 0; i < 4; i++) { const x = -0.5 + i * 0.33; add(new THREE.CylinderGeometry(0.025, 0.03, 1.2, 6), wood, x, 0.9, 0.06); add(new THREE.SphereGeometry(0.06, 10, 8), glow, x, 1.52, 0.06); }
    g.position.set(FRACK.x, 0, FRACK.z); g.rotation.y = Math.atan2(-FRACK.x, -FRACK.z); if (TG) scene.add(g);
    if (TG) shapes.push({ type: 'box', min: [FRACK.x - 0.85, 0, FRACK.z - 0.85], max: [FRACK.x + 0.85, 1.5, FRACK.z + 0.85] }); }
  { const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#6a4a30', roughness: 0.8 });
    const add = (w, h, d, x, y, z, m = wood) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    add(0.08, 2.0, 0.4, -0.8, 1.0, 0); add(0.08, 2.0, 0.4, 0.8, 1.0, 0); add(1.68, 2.0, 0.04, 0, 1.0, -0.18); add(1.68, 0.06, 0.4, 0, 2.0, 0);
    const cols = ['#7a2a24', '#2a4a7a', '#3a6a34', '#7a6a24', '#4a2a6a', '#8a4a20', '#2a6a6a', '#5a3a2a'];
    for (let r = 0; r < 4; r++) {
      const y = 0.06 + r * 0.48; add(1.6, 0.04, 0.38, 0, y, 0);
      let x = -0.74; while (x < 0.7) { const w = 0.05 + Math.random() * 0.05, h = 0.26 + Math.random() * 0.12; add(w, h, 0.26, x + w / 2, y + 0.02 + h / 2, 0.02, new THREE.MeshStandardMaterial({ color: cols[Math.floor(Math.random() * cols.length)], roughness: 0.9 })); x += w + 0.008; }
    }
    g.position.set(SHELF.x, 0, SHELF.z); g.rotation.y = Math.atan2(-SHELF.x, -SHELF.z); if (TG) scene.add(g);
    if (TG) shapes.push({ type: 'box', min: [SHELF.x - 0.75, 0, SHELF.z - 0.75], max: [SHELF.x + 0.75, 2.0, SHELF.z + 0.75] }); }
  // ---- sentries: listeners for Sneak. They hear your noise and see you in front of them; the course's sweep
  // their gaze and shoot arrows once they've spotted you (src/game/projectiles.js). ----
  const sentries = [];
  function makeSentry(def, body) {
    const s = { ...def, baseYaw: def.yaw, perception: def.perception ?? 1, awareness: 0, cool: 1, lost: 0 };
    const g = new THREE.Group(), stone = new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 0.9 });
    if (body) { const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 1.5, 12), stone); torso.position.y = -0.97; torso.castShadow = true; g.add(torso); }
    s.headMat = new THREE.MeshStandardMaterial({ color: '#5fbf6a', emissive: '#1d3a20', roughness: 0.5 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), s.headMat); g.add(head);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 8), stone); nose.rotation.x = -Math.PI / 2; nose.position.set(0, 0, -0.28); g.add(nose);   // which way it looks
    if (def.shoots) { const bow = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 4, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#5b4632' })); bow.rotation.z = Math.PI / 2; bow.position.set(0.25, -0.1, -0.2); g.add(bow); }
    g.position.set(s.x, s.y, s.z); g.rotation.y = s.yaw; scene.add(g); s.group = g; sentries.push(s); return s;
  }
  const sentry = TG ? makeSentry({ id: 'test', x: 0, y: 1.72, z: 40, yaw: 0 }, true) : null;
  if (TG) { shapes.push({ type: 'box', min: [sentry.x - 0.35, 0, sentry.z - 0.35], max: [sentry.x + 0.35, 1.9, sentry.z + 0.35] }); for (const d of courseSentries()) makeSentry(d, false); }
  const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 300), camDir = new THREE.Vector3(), mirrorAt = new THREE.Vector3();
  const applyShadows = () => { renderer.shadowMap.enabled = settings.shadows !== false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); };
  applyShadows();

  // ---- player ----
  const input = createInput(canvas, { fullscreen: () => settings.fullscreen !== false, root: $('.play') });
  let loadFactor = 1, carryInfo = { kg: 0, cap: 40, gearKg: 0 };                                 // movement from what you carry (src/rpg/carry.js), updated when the pack changes
  // The player only ever touches shapes near it, so it gets a short list of them, refreshed every frame from a grid
  // of the map's (static) shapes, plus every other shape (the test grounds' own, the dummies: few, and some move).
  // With a big town (thousands of boxes: buildings, roads, the ground's columns) this keeps the frame rate up.
  const nearShapes = shapes.slice(), statics = new Set(dungeon ? dungeon.shapes : []), GRID = 8, grid = new Map();
  for (const s of statics) { if (!s.min) continue; for (let i = Math.floor(s.min[0] / GRID); i <= Math.floor(s.max[0] / GRID); i++) for (let j = Math.floor(s.min[2] / GRID); j <= Math.floor(s.max[2] / GRID); j++) { const k = i * 65536 + j; (grid.get(k) || grid.set(k, []).get(k)).push(s); } }
  let others = [], othersLen = -1, stamp = 0;
  const refreshNear = (x, z, r = 12) => {
    if (shapes.length !== othersLen) { others = shapes.filter(s => !statics.has(s)); othersLen = shapes.length; }
    nearShapes.length = 0; stamp++;
    for (const s of others) nearShapes.push(s);
    for (let i = Math.floor((x - r) / GRID); i <= Math.floor((x + r) / GRID); i++) for (let j = Math.floor((z - r) / GRID); j <= Math.floor((z + r) / GRID); j++)
      for (const s of grid.get(i * 65536 + j) || []) if (s._near !== stamp) { s._near = stamp; nearShapes.push(s); }
  };
  // the shapes in a box (monsters: their ground, sight and walls) — from the same grid; the list is reused, use it at once
  const qOut = []; let qStamp = 0;
  const shapesIn = (x0, z0, x1, z1) => {
    if (shapes.length !== othersLen) { others = shapes.filter(s => !statics.has(s)); othersLen = shapes.length; }
    qOut.length = 0; qStamp++; for (const s of others) qOut.push(s);
    for (let i = Math.floor(x0 / GRID); i <= Math.floor(x1 / GRID); i++) for (let j = Math.floor(z0 / GRID); j <= Math.floor(z1 / GRID); j++)
      for (const s of grid.get(i * 65536 + j) || []) if (s._q !== qStamp) { s._q = qStamp; qOut.push(s); }
    return qOut;
  };
  monsters.shapesIn = shapesIn;
  // the map's swarms and packs (Object mode): `count` monsters each, round the spot, with its patrol and stats
  if (playtest) for (const o of playtest.objects || []) {
    if (OBJECTS[o.type]?.cat !== 'enemy') continue; const v = variantOf(o); if (!v?.monster) continue;
    const st = statsOf(o), base = ENEMY_TYPES[o.type], n = Math.max(1, o.count || 1), y = DUNGEON_ORIGIN.y + (o.layer || 0) * 10, yaw = -(o.rot || 0) * Math.PI / 180;
    const group = { id: o.id, place: o, origin: DUNGEON_ORIGIN };
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, r = n === 1 ? 0 : 0.8 + 0.6 * Math.sqrt(i);
      (monsters.spawn(v.monster, { x: DUNGEON_ORIGIN.x + o.x + Math.cos(a) * r, y, z: DUNGEON_ORIGIN.z + o.z + Math.sin(a) * r, yaw, level: st.level, scale: MONSTERS[v.monster]?.levels ? {} : { hp: st.hp / base.hp, speed: st.speed / base.speed, sight: st.sight / base.sight, damage: st.damage / base.damage }, group }));   // (a monster with a level chart takes its numbers from its level)
    }
  }
  // where you start (and come back to if you fall off the world): the map's entrance (or its first piece), or the
  // test grounds' middle
  const startAt = (() => { if (!dungeon) return { x: 0, y: 0, z: 0, yaw: Math.PI * 0.85 };
    const sp = dungeon.spawn || (() => { const k = Object.keys(playtest.cells)[0]; if (!k) return null; const [x, y, l] = k.split(',').map(Number); return { x: DUNGEON_ORIGIN.x + x * 10 + 5, y: l * 10 + 30, z: DUNGEON_ORIGIN.z + y * 10 + 5, yaw: 0 }; })();
    return sp ? { x: sp.x, y: sp.y + 0.5, z: sp.z, yaw: sp.yaw ?? 0 } : { x: (dungeon.bounds.min[0] + dungeon.bounds.max[0]) / 2, y: dungeon.bounds.max[1] + 1, z: (dungeon.bounds.min[2] + dungeon.bounds.max[2]) / 2, yaw: 0 }; })();   // (no pieces: the middle of the map, on top)
  const player = createController(character, nearShapes, { start: startAt, yaw: startAt.yaw, height: bodyHeight(save.appearance), load: () => loadFactor, carry: () => carryInfo, water, routes, canInteract: () => !nearRack() });
  // melee: draw/sheathe, attacks, blocking, hits (src/game/combat.js); the body plays the swings
  const combat = createCombat({ character, player, body: () => body,
    onSwing: v => audio.swing(v === 'heavy'),
    onPerfect: kind => { audio.perfect(kind); comboHud.flash(); },
    onHit: (t, info) => { audio.impact(Math.min(2, 0.5 + info.stagger), t.material); if (info.counter) dummies.floatText?.('Counter', { x: t.pos.x, y: t.pos.y + (t.height || 1.8) + 0.3, z: t.pos.z }, '#ffd27a'); },
    castLayout: () => spells.layout() });

  const eyeMarker = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3366' })); eyeMarker.visible = false; scene.add(eyeMarker);
  // ---- your body, seen when you look down ----
  // The character model in game mode: same body, clothes and gear as the creator, the head hidden so
  // the camera can sit at the eyes. It loads in the background; you can move before it arrives.
  let body = null, walkClock = 0, lastStep = 0, swimK = 0, thirdPerson = false, moveK = 0, airK = 0, gaitK = 0, landT = 9, landAmp = 0, climbK = 0, climbLean = 0, climbYaw = 0, wasClimbing = false, ropeK = 0, hugClock = 0, routeT = 9, routeAmp = 0;
  // the hips turn separately from where you look (head, then chest, then the whole body); see placeBody
  let bodyYaw = 0, wasFree = false, turnInPlace = false, backK = 0, turnK = 0, turnClock = 0, upClock = 0, upK = 0;
  // ---- sound ----
  const audio = createAudio(); audio.setVolume(settings.volume ?? 0.8);
  // what the sounds need to know about the body: weight, size and voice
  function acoustics() {
    if (!body) return { mass: 70, size: 1, fem: 0.5 };
    const p = body.params, size = Math.max(0.6, Math.min(1.5, body.crownHeight() / 1.75));
    return { mass: 70 * Math.pow(size, 3) * (0.75 + 0.5 * (p.weight ?? 0.5)) * (0.9 + 0.25 * (p.muscle ?? 0.5)), size, fem: (body.body.bodySex() + 1) / 2 };
  }
  note.textContent = 'Loading your body…';
  (async () => {
    humanCache = humanCache || await loadHuman('data/human/');
    if (!running) return;
    body = startViewer(THREE, humanCache, { canvas: document.createElement('canvas'), controls: document.createElement('div'), mode: 'game' });
    body.load(save.appearance);
    body.drive({ pose: 'idle' });
    weathering?.lampLitScene(body.root);   // (the lamps light you too)
    body.root.traverse(o => { if (o.isMesh) { o.castShadow = !o.userData.hairCards; o.frustumCulled = false; if (o.userData.hairCards) o.userData.noReflect = true; } });   // (the hair cards: no shadow — the scalp casts it — and not in the puddles' mirror)
    scene.add(body.root);
    setTimeout(() => { if (body) player.setHeight(Math.max(1.3, Math.min(2.4, body.eyeHeight() / 0.93))); }, 400);   // the camera at the model's eyes
    note.textContent = ''; updateLoad();
  })().catch(err => { console.error(err); note.textContent = 'Your body could not load; movement still works.'; });
  const rollAxis = new THREE.Vector3(), rollDir = new THREE.Vector3(), rollQ = new THREE.Quaternion(), yawQ = new THREE.Quaternion(), upV = new THREE.Vector3(0, 1, 0), rollOff = new THREE.Vector3();
  let headTw = 0, headPt = 0;
  function placeBody(dt) {
    if (!body) return;
    const st = player.state, hs = Math.hypot(st.vel.x, st.vel.z);
    const prevFree = wasFree; wasFree = false; body.drive({ look: null, dir: 0 });
    // the body stands a little behind the eyes, easing further back as you look down (as if the neck
    // bent forward), so you see your chest, legs and feet but never the inside of the neck
    // Crouching folds the chest forward under the eyes, so in first person the body also eases back with the
    // crouch (and with a landing's dip) to keep the camera out of it
    const back = thirdPerson ? 0 : 0.1 + 0.2 * Math.min(1, Math.max(0, -st.pitch) / 1.4) + 0.24 * st.crouch + 0.2 * landAmp * (landT < 0.5 ? 1 : 0),   /* (third person: the body stands on its spot, wherever the camera circles) */ fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
    body.root.position.set(st.pos.x - fx * back, st.pos.y + (st.stepOffset || 0) + body.groundOffset() - st.crouch * 0.45, st.pos.z - fz * back);
    body.root.rotation.set(0, st.yaw + Math.PI, 0, 'YXZ');      // the model faces +Z; the player faces -Z at yaw 0
    if (st.move) { body.root.visible = true; body.drive({ pose: 'climb', time: st.move.t, gait: st.move.type === 'vault' ? 1 : 0 }); return; }
    if (st.hang) {                                                   // hanging: against the wall, arms up
      body.root.visible = true;
      const reach = body.crownHeight() * 1.22;                     // hands overhead: about 1.22× the body's height above the feet
      body.root.position.set(st.pos.x - st.hang.dx * 0.05, st.hang.top - reach + body.groundOffset(), st.pos.z - st.hang.dz * 0.05);
      body.root.rotation.set(0, Math.atan2(-st.hang.dx, -st.hang.dz) + Math.PI, 0, 'YXZ');
      body.drive({ pose: 'hang', time: performance.now() / 900, gait: Math.max(-1, Math.min(1, (st.shimmyV || 0))) }); return;
    }
    if (st.trav) {                                                   // on a thief's route
      const T = st.trav, r = T.r, fem = (body.body.bodySex() + 1) / 2; body.root.visible = true;
      if (T.trans) {                                                 // moving onto or between routes: climbing up, lowering down, or a hop
        const X = T.trans, u = X.t;
        body.root.position.set(st.pos.x, st.pos.y + body.groundOffset(), st.pos.z);
        body.root.rotation.set(0, (X.side ? Math.atan2(-X.side.x, -X.side.z) : st.yaw) + Math.PI, 0, 'YXZ');
        if (X.pose === 'up') body.drive({ pose: 'climb', time: u, gait: 0 });
        else if (X.pose === 'down') body.drive({ pose: 'climb', time: 1 - u, gait: 0 });
        else body.drive({ pose: 'twirl', time: Math.min(1, u * 0.8 + 0.1) });
        return;
      }
      routeT += dt; const dip = routeT < 0.08 ? routeT / 0.08 : Math.exp(-(routeT - 0.08) * 6), rland = routeAmp * dip;   // landing on it: a quick dip, back up
      if (T.kind === 'pole') {
        body.root.position.set(st.pos.x, st.pos.y + body.groundOffset(), st.pos.z);
        body.root.rotation.set(0, Math.atan2(r.x - st.pos.x, r.z - st.pos.z), 0, 'YXZ');
        body.drive({ pose: 'pole', time: st.bob * 0.5 });
      } else if (T.kind === 'rope' && T.slide) {
        // sliding down a wire: hands on it, leaning back with the feet forward down the slope
        const d = { x: r.b[0] - r.a[0], y: r.b[1] - r.a[1], z: r.b[2] - r.a[2] }, hl = Math.hypot(d.x, d.z), dir = T.slide;   // +1 toward b
        const yaw = Math.atan2(d.x * dir, d.z * dir), lean = 0.45, reach = body.crownHeight() * 1.18;
        const wire = { x: st.pos.x, y: st.pos.y + player.height * 1.15, z: st.pos.z };             // the point on the wire above you
        // pivot at the feet: tilting back moves the hands back, so place the feet ahead of the hands
        const fx = d.x * dir / hl, fz = d.z * dir / hl;
        body.root.position.set(wire.x + fx * reach * Math.sin(lean), wire.y - reach * Math.cos(lean) + body.groundOffset(), wire.z + fz * reach * Math.sin(lean));
        body.root.rotation.set(-lean, yaw, 0, 'YXZ');
        body.drive({ pose: 'wireslide', time: performance.now() / 1000 });
      } else if ((T.kind === 'pipe' || T.kind === 'rope') && T.hang) {
        const d = { x: r.b[0] - r.a[0], z: r.b[2] - r.a[2] }, pyaw = Math.atan2(d.x, d.z);
        const across = pyaw + Math.PI / 2 * (Math.sin(st.yaw - pyaw) > 0 ? -1 : 1);       // face across the pipe, the side you look from
        body.root.position.set(st.pos.x, st.pos.y + body.groundOffset(), st.pos.z);
        body.root.rotation.set(0, T.slide ? pyaw + (T.slide > 0 ? 0 : Math.PI) : across, 0, 'YXZ');
        body.drive({ pose: 'hang', time: performance.now() / 900, gait: T.slide ? 0 : Math.max(-1, Math.min(1, (T.moving ? 1 : 0) * (T.dir || 0))) });
      } else if (T.kind === 'rope' || T.kind === 'pipe') {           // walking on top of a rope or pipe
        const d = { x: r.b[0] - r.a[0], z: r.b[2] - r.a[2] }, ryaw = Math.atan2(d.x, d.z);
        body.root.position.set(st.pos.x, st.pos.y + body.groundOffset(), st.pos.z);
        body.root.rotation.set(0, ryaw + ((T.dir || 1) > 0 ? 0 : Math.PI), 0, 'YXZ');
        if (T.moving) walkClock += dt * (T.run ? 1.6 : T.low ? 0.9 : 0.8); ropeK += ((T.moving ? 1 : 0) - ropeK) * Math.min(1, dt * 6);
        if (T.low) {                                                  // crouched low on it
          body.root.position.y -= squatDrop(1.2) * body.crownHeight() * 0.47;
          body.drive({ pose: 'ropecrouch', time: walkClock * 2, gait: ropeK, idleT: performance.now() / 1000 });
        } else {
          body.root.position.y -= squatDrop(Math.min(1.15, rland)) * body.crownHeight() * 0.47;
          body.drive({ pose: 'tightrope', time: walkClock, gait: 0, amount: 1, blend: ropeK, idleT: performance.now() / 1000, squat: Math.min(1.15, rland) });
        }
      } else if (T.kind === 'spire') {
        const sq = Math.min(1.35, 1.2 + rland * 0.4);
        body.root.position.set(st.pos.x, st.pos.y + body.groundOffset() - squatDrop(sq) * body.crownHeight() * 0.47, st.pos.z);
        body.root.rotation.set(0, st.yaw + Math.PI, 0, 'YXZ');
        body.drive({ pose: 'perch', time: performance.now() / 1000, amount: fem, squat: sq });
      } else if (T.kind === 'hug') {
        body.root.position.set(st.pos.x + T.n.x * 0.02, st.pos.y + body.groundOffset() - squatDrop(st.crouch * 0.8) * body.crownHeight() * 0.47, st.pos.z + T.n.z * 0.02);
        body.root.rotation.set(0, Math.atan2(T.n.x, T.n.z), 0, 'YXZ');                    // back to the wall, facing out
        if (T.moving) hugClock += dt * 1.6;
        body.drive({ pose: 'wallhug', time: hugClock, gait: T.moving ? (T.dir || 1) : 0, squat: st.crouch * 0.8 });
      }
      return;
    }
    if (st.climb) {                                                  // on a climbing wall: facing it, hands and feet working
      body.root.visible = true; const cn = st.climb.n;
      body.root.position.set(st.pos.x + cn.x * 0.02, st.pos.y + body.groundOffset(), st.pos.z + cn.z * 0.02);
      // on natural rock the body turns and tilts with the face: leaning in on a slab, back under an overhang
      const n3 = st.climb.n3, yaw = n3 ? Math.atan2(n3.x, n3.z) + Math.PI : Math.atan2(cn.x, cn.z) + Math.PI;
      const lean = n3 ? Math.asin(Math.max(-0.9, Math.min(0.9, n3.y))) : 0;
      if (!wasClimbing) { climbLean = lean; climbYaw = yaw; } wasClimbing = true;
      climbLean += (lean - climbLean) * Math.min(1, dt * 8); climbYaw = n3 ? climbYaw + Math.atan2(Math.sin(yaw - climbYaw), Math.cos(yaw - climbYaw)) * Math.min(1, dt * 8) : yaw;
      body.root.rotation.set(climbLean, climbYaw, 0, 'YXZ');
      climbK += ((input.held('forward') || input.held('back') || input.held('left') || input.held('right') ? 1 : 0) - climbK) * Math.min(1, dt * 6);
      const L = st.climb.leap;
      if (L && L.p !== undefined) { body.drive({ pose: 'climbleap', time: L.p, gait: L.side || 0, amount: L.a, blend: L.b }); return; }
      body.drive({ pose: 'wallclimb', time: st.bob * 0.5, gait: climbK }); return;
    }
    wasClimbing = false;
    body.root.visible = !st.roll || thirdPerson;                                   // a roll is shown by the camera; the body would surround it
    if (st.roll) {
      // tucked, the whole body turns once through the roll around its middle: forward rolls tip forward,
      // back rolls back, side rolls sideways (the axis is across the roll's direction)
      const r = st.roll, u = Math.min(1, r.t / r.dur), ang = Math.PI * 2 * (u * u * (3 - 2 * u));
      const hc = body.crownHeight() * (0.5 - 0.3 * Math.min(1, Math.sin(Math.PI * u) * 1.6));   // the body's centre: low while tucked
      rollAxis.set(0, 1, 0).cross(rollDir.set(r.dx, 0, r.dz)).normalize();
      rollQ.setFromAxisAngle(rollAxis, ang).multiply(yawQ.setFromAxisAngle(upV, st.yaw + Math.PI));
      body.root.quaternion.copy(rollQ);
      // the model's origin sits groundOffset above its feet (about hip height), so the centre is hc − that above it
      rollOff.set(0, hc - body.groundOffset(), 0).applyQuaternion(rollQ.clone().multiply(yawQ.clone().invert()));
      body.root.position.set(st.pos.x, st.pos.y + hc - rollOff.y, st.pos.z);
      body.root.position.x -= rollOff.x; body.root.position.z -= rollOff.z;
      body.drive({ pose: 'roll', time: u }); return;
    }
    if (st.slideRun) {
      body.root.position.y += st.crouch * 0.45;                                    // the slide pose sets its own height
      body.drive({ pose: 'slide', time: st.slideRun.t, gait: 0 }); return;
    }
    if (st.swimming) {
      // swimming forward lays the body out flat (and head-down when diving); treading stays upright.
      // The body pivots at its feet, so it's moved back and up to put the chest under the camera.
      const sp3 = Math.hypot(st.vel.x, st.vel.y, st.vel.z), target = Math.min(1, sp3 / 1.1);
      swimK += (target - swimK) * Math.min(1, dt * 3);
      const tilt = swimK * Math.max(0.9, Math.min(2.3, 1.42 - (st.underwater ? st.pitch : Math.min(0, st.pitch) * 0.3)));
      const h = player.height, backS = 0.15 + swimK * h * 0.72, up = swimK * h * 0.42;
      body.root.position.set(st.pos.x - fx * backS, st.pos.y + body.groundOffset() + up, st.pos.z - fz * backS);
      body.root.rotation.set(tilt, st.yaw + Math.PI, 0, 'YXZ');
      body.drive({ pose: 'swim', time: st.bob, gait: swimK });
      return;
    }
    swimK = 0;
    if (st.sit > 0.02) { body.drive({ pose: 'sit', gait: (body.body.bodySex() + 1) / 2, amount: st.sit, time: performance.now() / 1000 }); return; }
    if (window.eldermerePlay?.debugGait) { const g = window.eldermerePlay.debugGait; if (g.lean) body.root.rotation.x = g.lean; body.drive({ pose: g.pose || 'walk', ...g }); return; }   // testing: hold a gait
    // Starting off and stopping ease between the standing pose and the stride (about a fifth of a second
    // in, a quarter out). Stopping, the stride finishes its step (the legs settle to passing each other)
    // and the run/walk mix eases down instead of snapping. In the air, a jump pose by vertical speed;
    // landing, a squat that sinks with the impact and springs back. Crouching squats too.
    const fem = (body.body.bodySex() + 1) / 2, idleT = performance.now() / 1000;
    const inAir = !st.onGround && !st.wallRun && !st.wallClimb && !st.sliding;
    const moving = (st.onGround || st.wallRun) && hs > 0.4;
    moveK += ((moving ? 1 : 0) - moveK) * Math.min(1, dt * (moving ? 6 : 4.5));
    airK += ((inAir ? 1 : 0) - airK) * Math.min(1, dt * (inAir ? 9 : 12));
    const gaitT = Math.max(0, Math.min(1, (hs - 2.6) / 3.4));
    gaitK += (gaitT - gaitK) * Math.min(1, dt * (moving ? 6 : 3));
    // the squat: crouch, plus a landing that dips fast and recovers over about a third of a second
    landT += dt; const landEnv = landT < 0.07 ? landT / 0.07 : Math.exp(-(landT - 0.07) * 7);
    const squat = Math.min(1.15, st.crouch * 0.95 + landAmp * landEnv);
    const legLen = body.crownHeight() * 0.47;
    body.root.position.y -= squatDrop(squat) * legLen - st.crouch * 0.45;      // replaces the plain crouch drop above with the legs' real fold
    if (st.wallClimb) {
      // running straight up a wall: facing it, feet planting on it in turn, hands slapping it up above
      const n = st.wallClimb.n; upK = Math.min(1, upK + dt * 9);
      upClock += dt * Math.max(1.5, st.vel.y) / 1.1;                         // a step about every half metre climbed
      body.root.position.set(st.pos.x + n.x * 0.12, st.pos.y + body.groundOffset(), st.pos.z + n.z * 0.12);   // a little off the wall, feet on it
      body.root.rotation.set(0.22 * upK, Math.atan2(-n.x, -n.z), 0, 'YXZ');   // facing the wall (the model faces +Z), leaning into it
      body.drive({ pose: 'wallup', time: upClock, amount: st.wallClimb.t / st.wallClimb.max, blend: upK });
      return;
    }
    upK = 0;
    if (st.wallRun) {
      // a wall run, Mirror's Edge style: running stride with the feet on the wall, the body leaning away from it,
      // the arm nearest the wall reaching forward along it, the other pumping
      const n = st.wallRun.n, rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw), side = n.x * rx + n.z * rz > 0 ? 1 : -1;   // +1: the wall is on your left
      const lean = 0.38 * Math.min(1, st.wallRun.t / 0.12);
      body.root.position.set(st.pos.x - n.x * 0.12, st.pos.y + body.groundOffset(), st.pos.z - n.z * 0.12);
      body.root.rotation.set(0, st.yaw + Math.PI, side * lean, 'YXZ');
      walkClock += dt * hs / 3.8;
      body.drive({ pose: 'wallrun', time: walkClock, gait: 1, amount: (body.body.bodySex() + 1) / 2, blend: 1, idleT: side });
      return;
    }
    if (st.twirl && st.twirl.mini) {                                 // a little hop onto something right in front of you
      const u = Math.min(1, st.twirl.t / st.twirl.dur);
      body.drive({ pose: 'air', time: performance.now() / 1000, gait: 1 - 2 * u, amount: (body.body.bodySex() + 1) / 2, blend: 1, squat: 0.25 }); return;
    }
    if (st.twirl) {                                                  // twirling onto a route: one fast spin, balled up
      const u = Math.min(1, st.twirl.t / st.twirl.dur), spin = Math.min(1, u / 0.8), e = 1 - Math.pow(1 - spin, 2);   // one turn, settling as you arrive
      body.root.rotation.set(0, st.yaw + Math.PI + Math.PI * 2 * e, 0, 'YXZ');
      body.drive({ pose: 'twirl', time: 0.15 + 0.7 * u }); return;
    }
    if (st.wallKick && inAir) {                                      // a wall jump: the kick, then into the air pose
      const k = st.wallKick, u = k.t / 0.55;
      body.drive({ pose: 'wallkick', time: u, gait: k.side, amount: k.mode === 'side' ? 0 : k.mode === 'front' ? 1 : 2 }); return;
    }
    // ---- where the hips face, apart from where you look ----
    // Standing, looking around turns the head first, then the chest; past about 85° the feet step round
    // to face the look again. Moving, the hips face the way you're going (up to 75° off your look: a
    // diagonal or crabbing walk) and the chest twists back toward the look; moving away from the look,
    // you walk backward instead of turning your back. Movement keys always go by the look.
    const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
    if (!prevFree) { bodyYaw = st.yaw; turnInPlace = false; }
    wasFree = true;
    // Weapons drawn (combat stance): the body squares up to the look and the legs step whichever way you
    // move: sideways, backward, diagonally (a true strafe).
    let backing = false, strideDir = 0;
    const armed = combat.drawn || !!spells.readied;
    // Third person, weapons away: the camera is free (it orbits you all the way round) and you run the way the keys
    // point, relative to the camera — the body turns to face where it's going, never backing up; the head leads
    // into a turn and, standing, glances toward where the camera looks (within reason)
    const free3 = thirdPerson && !armed;
    let lookTw = null, lookP = null;
    if (free3) {
      if (moving || (inAir && hs > 1.5)) {
        const want = Math.atan2(-st.vel.x, -st.vel.z), d = wrapA(want - bodyYaw);
        bodyYaw += d * Math.min(1, dt * (inAir ? 4 : 10));
        lookTw = Math.max(-0.9, Math.min(0.9, d * 0.9)); lookP = 0;
      } else {
        const d = wrapA(st.yaw - bodyYaw);
        lookTw = Math.abs(d) < 1.75 ? Math.max(-1.1, Math.min(1.1, d * 0.75)) : 0; lookP = Math.abs(d) < 1.75 ? Math.max(-0.5, Math.min(0.5, st.pitch * 0.5)) : 0;
      }
      turnInPlace = false;
    } else if (moving || (inAir && hs > 1.5)) {
      const f = st.vel.x * fx + st.vel.z * fz, r = st.vel.x * Math.cos(st.yaw) - st.vel.z * Math.sin(st.yaw);
      let rel = Math.atan2(r, f);                                          // + : moving to the right of the look
      if (armed) { strideDir = -rel; bodyYaw += wrapA(st.yaw - bodyYaw) * Math.min(1, dt * 12); }
      else {
        if (Math.abs(rel) > 1.9 && !inAir) { backing = true; rel = wrapA(rel - Math.PI); }
        rel = Math.max(-1.3, Math.min(1.3, rel));
        bodyYaw += wrapA(st.yaw - rel - bodyYaw) * Math.min(1, dt * 9);
      }
      turnInPlace = false;
    } else if (!free3) {
      const d = wrapA(st.yaw - bodyYaw);
      if (Math.abs(d) > (armed ? 0.4 : 1.5)) turnInPlace = true;           // head and chest are turned as far as they go (armed: keep square to the look)
      if (turnInPlace) { bodyYaw += Math.sign(d) * Math.min(Math.abs(d), dt * 4.5); if (Math.abs(d) < 0.12) turnInPlace = false; }
    }
    backK += ((backing ? 1 : 0) - backK) * Math.min(1, dt * 8);
    turnK += ((turnInPlace ? 1 : 0) - turnK) * Math.min(1, dt * 10);
    body.root.rotation.y = bodyYaw + Math.PI;
    // (the head's turn eases, so it swings round rather than snapping)
    { const tw = lookTw ?? wrapA(st.yaw - bodyYaw), pt = lookP ?? Math.max(-0.9, Math.min(0.9, st.pitch)); headTw += wrapA(tw - headTw) * Math.min(1, dt * (free3 ? 7 : 30)); headPt += (pt - headPt) * Math.min(1, dt * (free3 ? 7 : 30)); }
    body.drive({ look: { twist: headTw, pitch: headPt }, dir: strideDir });
    if (airK > 0.02 && inAir) {
      body.drive({ pose: 'air', time: idleT, gait: st.vel.y / 6, amount: fem, blend: Math.max(airK, moveK), idleT, squat: squat * 0.5 });
      return;
    }
    if (moveK > 0.02) {
      // the walk eases into a run with speed, and strides lengthen with it, so the legs keep a natural
      // cadence (about 1.3 strides a second strolling, under 2 at a full sprint) and the feet don't skate
      const stride = 1.5 + 2.3 * gaitK;
      if (moving) walkClock += dt * hs / stride * (backK > 0.5 ? -0.85 : 1);   // backing up: the stride runs in reverse
      else { const to = Math.round(walkClock * 2) / 2; walkClock += (to - walkClock) * Math.min(1, dt * 7); }   // finish the step
      body.drive({ pose: 'walk', time: walkClock, gait: gaitK, amount: fem, blend: moveK, idleT, squat });
      // a footfall twice per stride
      const n = Math.floor(walkClock * 2 + 0.25);
      if (moving && n !== lastStep) { lastStep = n; { const [sf, ac, o] = underfoot(); audio.step(sf, ac, { ...o, speed: hs / 7, soft: st.crouching || input.held('walk') }); } }
    }
    else if (turnK > 0.02) {
      // turning on the spot: small steps round, finishing the step as the turn ends
      if (turnInPlace) turnClock += dt * 1.9; else { const to = Math.round(turnClock * 2) / 2; turnClock += (to - turnClock) * Math.min(1, dt * 8); }
      body.drive({ pose: 'walk', time: turnClock, gait: 0, amount: fem, blend: 0.45 * turnK, idleT, squat });
      const n = Math.floor(turnClock * 2 + 0.25);
      if (turnInPlace && n !== lastStep) { lastStep = n; { const [sf, ac, o] = underfoot(); audio.step(sf, ac, { ...o, speed: 0.15, soft: true }); } }
    }
    else body.drive({ pose: 'idle', time: idleT, amount: fem, squat });
  }

  // Third person (M): the camera pulls back behind your shoulder along your view, stopping short of walls.
  const tpDir = new THREE.Vector3(), tpRight = new THREE.Vector3();
  function solidAt(x, y, z) {
    for (const s of shapes) if (x > s.min[0] && x < s.max[0] && z > s.min[2] && z < s.max[2] && y > s.min[1] && y < topAt(s, x, z)) return true;
    return false;
  }
  const tpNear = []; let tpWant = 0, tpCur = 0, tpLast = 3.2, tpDt = 0.016;
  // the mouse wheel: in and out between first person and a camera up to 7 m behind you (M still switches between the two)
  canvas.addEventListener('wheel', e => { if (!input.locked || wheel.open) return; e.preventDefault();
    const out = e.deltaY > 0, cur = thirdPerson ? tpWant : 0;
    let n = out ? (cur === 0 ? 1.4 : Math.min(7, cur * 1.2)) : (cur <= 1.45 ? 0 : cur / 1.2);
    if (n === 0) { if (thirdPerson) { thirdPerson = false; } tpWant = 0; }
    else { if (!thirdPerson) { thirdPerson = true; tpCur = 0.8; } tpWant = n; tpLast = n; } }, { passive: false });
  function placeThirdPerson() {
    camera.getWorldDirection(tpDir); tpRight.set(Math.cos(player.state.yaw), 0, -Math.sin(player.state.yaw));
    tpCur += (tpWant - tpCur) * Math.min(1, tpDt * 10); const D = Math.max(0.6, tpCur);   // the arm's length, eased toward the wheel's choice
    const e = camera.position; let d = D;
    // only the shapes within reach of the camera's arm are tested (testing all of a town's shapes at every step cost ~9 ms a frame)
    tpNear.length = 0; for (const s of shapes) if (s.max[0] > e.x - D - 0.4 && s.min[0] < e.x + D + 0.4 && s.max[2] > e.z - D - 0.4 && s.min[2] < e.z + D + 0.4 && s.max[1] > e.y - D - 0.4 && s.min[1] < e.y + D + 0.4) tpNear.push(s);
    for (let k = 0.3; k <= D; k += 0.15) { const s = 0.35 * Math.min(1, k / 3.2), x = e.x - tpDir.x * k + tpRight.x * s, y = e.y - tpDir.y * k, z = e.z - tpDir.z * k + tpRight.z * s;
      let hit = false; for (const q of tpNear) if (x > q.min[0] && x < q.max[0] && z > q.min[2] && z < q.max[2] && y > q.min[1] && y < topAt(q, x, z)) { hit = true; break; }
      if (hit) { d = Math.max(0.3, k - 0.25); break; } }
    camera.position.addScaledVector(tpDir, -d).addScaledVector(tpRight, 0.35 * Math.min(1, d / 3.2)); camera.position.y += 0.15;
  }
  const resize = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fx.setSize(); };
  addEventListener('resize', resize); resize();

  // ---- pause and controls ----
  const probe = { on: false, open: false, sync: true, lamps: true, crystals: true, shadows: true, bshadow: true, trees: true, small: true, batinst: true, umbraParts: true, umbra2weight: true, buildings: true, ground: true, water: true, glow: true, fogOff: false, bloomOff: false, blurOff: false, toneMapOff: false, gradeOff: false, vignetteOff: false, scale: 1 };
  const showPause = on => { pause.hidden = !on; root.querySelector('.play').classList.toggle('is-paused', on); };
  input.on('lock', () => { probe.open = false; showPause(false); audio.start(); });
  input.on('unlock', () => { if (invOpen || probe.open) return; showPause(true); showControls(false); });
  $('[data-act=resume]').onclick = () => input.lock();
  canvas.addEventListener('click', () => { if (!input.locked) input.lock(); });
  $('[data-act=exit]').onclick = () => { if (body) save.appearance = body.save(); stop(); onExit(); };
  $('[data-act=controls]').onclick = () => showControls(true);
  function showControls(on) {
    const box = $('.pause-controls'); box.hidden = !on; $('.pause-main').hidden = on;
    if (!on) return;
    const b = input.bindings;
    box.innerHTML = `
      <table class="binds"><tbody>${Object.entries(ACTIONS).map(([a, d]) => `
        <tr><th>${d.name}</th>${[0, 1].map(i => `<td><button class="bind" data-a="${a}" data-i="${i}">${keyName(b[a]?.[i])}</button></td>`).join('')}</tr>`).join('')}
      </tbody></table>
      <p class="muted small">Click a key, then press the new key or mouse button. Esc cancels. Escape itself always pauses.</p>
      <label class="setting">Mouse sensitivity <input type="range" min="0.2" max="3" step="0.05" data-s="sensitivity" value="${settings.sensitivity}"><output>${settings.sensitivity.toFixed(2)}</output></label>
      <label class="setting">Field of view <input type="range" min="60" max="110" step="1" data-s="fov" value="${settings.fov}"><output>${settings.fov}°</output></label>
      <label class="setting">Render scale <input type="range" min="0.5" max="1" step="0.05" data-s="renderScale" value="${settings.renderScale ?? 1}"><output>${Math.round((settings.renderScale ?? 1) * 100)}%</output></label>
      <label class="setting">Volume <input type="range" min="0" max="1" step="0.05" data-s="volume" value="${settings.volume ?? 0.8}"><output>${Math.round((settings.volume ?? 0.8) * 100)}%</output></label>
      <label class="setting">Head bob <input type="range" min="0" max="2" step="0.1" data-s="headBob" value="${settings.headBob ?? 1}"><output>${(settings.headBob ?? 1).toFixed(2)}</output></label>
      <label class="setting check"><input type="checkbox" data-s="fullscreen" ${settings.fullscreen !== false ? 'checked' : ''}> Fullscreen while playing (lets the game keep Ctrl+W, Ctrl+T and other browser shortcuts)</label>
      <label class="setting">Reflections <select data-s="reflections">${[['planar', 'Mirror view (sharp, the level you stand on)'], ['ssr', 'Screen-space (any height, on-screen things only)'], ['off', 'Off (sky colour only)']].map(([v, n]) => `<option value="${v}" ${(settings.reflections || 'planar') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="setting check"><input type="checkbox" data-s="shadows" ${settings.shadows !== false ? 'checked' : ''}> Shadows</label>
      <label class="setting check"><input type="checkbox" data-s="postfx" ${settings.postfx !== false ? 'checked' : ''}> Glow and colour grading</label>
      <label class="setting check"><input type="checkbox" data-s="invertY" ${settings.invertY ? 'checked' : ''}> Invert mouse Y</label>
      <label class="setting check"><input type="checkbox" data-s="toggleCrouch" ${settings.toggleCrouch ? 'checked' : ''}> Crouch toggles</label>
      <label class="setting check"><input type="checkbox" data-s="toggleSprint" ${settings.toggleSprint ? 'checked' : ''}> Sprint toggles</label>
      <div class="btns"><button class="btn ghost" data-act="reset-keys">Reset keys</button><button class="btn" data-act="back">Back</button></div>`;
    box.querySelectorAll('.bind').forEach(btn => btn.onclick = () => {
      btn.textContent = 'Press a key…'; btn.classList.add('listening');
      input.rebind(btn.dataset.a, +btn.dataset.i, () => showControls(true));
    });
    box.querySelectorAll('[data-s]').forEach(el => el.oninput = () => {
      const k = el.dataset.s; settings[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : +el.value;
      if (el.tagName !== 'SELECT' && el.nextElementSibling?.tagName === 'OUTPUT') el.nextElementSibling.textContent = k === 'fov' ? `${settings.fov}°` : k === 'renderScale' ? `${Math.round(settings[k] * 100)}%` : settings[k].toFixed(2);
      if (k === 'volume') { audio.setVolume(settings.volume); el.nextElementSibling.textContent = `${Math.round(settings.volume * 100)}%`; }
      if (k === 'fov') { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
      if (k === 'renderScale') { applyScale(); resize(); }
      if (k === 'shadows') applyShadows();
      if (k === 'postfx') applyFx();
      if (k === 'reflections' && reflections) reflections.mode = settings.reflections;
      saveSettings(settings);
    });
    box.querySelector('[data-act=reset-keys]').onclick = () => { input.resetBindings(); showControls(true); };
    box.querySelector('[data-act=back]').onclick = () => showControls(false);
  }
  showPause(true);

  // ---- pack, hotbar and potions ----
  const inv = save.inventory || (save.inventory = createInventory());
  const noJump = new Proxy(input, { get(t, k) { if (k === 'pressed' || k === 'held') return a => a === 'jump' ? false : t[k](a); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const harvest = createHarvest({ THREE, scene, monsters, character, inv, input, promptEl: { set textContent(v) { promptEl.textContent = v; } }, toast: m => toast(m), keyName, audio });   // (skinning bodies: src/game/harvest.js)
  const TEST_COUNT = 20;
  for (const id of TEST_KIT) { const n = countOf(inv, id); if (n < TEST_COUNT) addMaterial(inv, id, 50, TEST_COUNT - n, true); }   // test kit: topped up to twenty of every potion each visit
  const hotbar = save.hotbar || (save.hotbar = ['sex.fem', 'sex.masc', 'param.height.up', 'param.height.down', 'param.muscle.up', 'param.bust.up', 'race.elf:nature', 'race.therian:feline', 'race.human:common']);
  let toastTimer = 0;
  const toast = msg => { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2600); };
  const itemName = id => POTIONS[id]?.name ?? id;
  function renderHotbar() {
    hotbarEl.innerHTML = hotbar.map((id, i) => {
      const sp = id?.startsWith('spell:') ? SPELLS[id.slice(6)] : null;
      if (sp) {                                                                 // a spell: hold its number to speak it
        const ready = preparedOf(character).includes(sp.id);
        return `<li data-i="${i}" class="spell ${ready ? '' : 'out'}" title="${escapeHtml(sp.name)}${ready ? ' (hold to cast)' : ' (not prepared)'}"><span class="key">${i + 1}</span><i class="rune s-${sp.school}">${escapeHtml(SCHOOL_GLYPH[sp.school] || '✦')}</i><b>${sp.mana}</b></li>`;
      }
      const n = id ? countOf(inv, id) : 0, p = POTIONS[id];
      return `<li data-i="${i}" class="${id ? '' : 'empty'} ${id && !n ? 'out' : ''}" title="${id ? escapeHtml(itemName(id)) : 'Empty'}">
        <span class="key">${i + 1}</span>${p ? `<i class="flask" style="--c:${p.color}"></i><b>${n}</b>` : ''}</li>`;
    }).join('');
    hotbarEl.querySelectorAll('li').forEach(li => {
      li.ondragover = e => e.preventDefault();
      li.ondrop = e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (POTIONS[id] || (id.startsWith('spell:') && id.slice(6) in (character.spells || {}))) { hotbar[+li.dataset.i] = id; renderHotbar(); } };
      li.oncontextmenu = e => { e.preventDefault(); hotbar[+li.dataset.i] = null; renderHotbar(); };
      li.onclick = () => { const id = hotbar[+li.dataset.i]; if (!input.locked && id && !id.startsWith('spell:')) drink(id); };
    });
  }
  // Drinking: the body changes, then stats follow the new body (natural limits move; progress is kept).
  // Drinking: the body changes over a few seconds, then stats follow the new body (natural limits
  // move; progress is kept). Another potion mid-change carries on from wherever the body is.
  const TRANSFORM_SECONDS = 3;
  let morph = null;                                  // { from, to, t } while a change plays
  const PARAMS = ['height', 'muscle', 'weight', 'bust', 'proportions'];
  const snapshot = () => ({ body: body.body.toJSON(), params: Object.fromEntries(PARAMS.map(k => [k, body.params[k]])) });
  function blendBody(a, b, u) {
    const parts = {};
    for (const [id, pa] of Object.entries(a.body.parts)) {
      const pb = b.body.parts[id] || pa, sp = {};
      for (const key of new Set([...Object.keys(pa.species), ...Object.keys(pb.species)])) sp[key] = (pa.species[key] || 0) * (1 - u) + (pb.species[key] || 0) * u;
      parts[id] = { species: sp, sex: pa.sex + (pb.sex - pa.sex) * u, size: pa.size + (pb.size - pa.size) * u, traits: { ...pb.traits } };
    }
    return { body: { parts }, params: Object.fromEntries(PARAMS.map(k => [k, a.params[k] + (b.params[k] - a.params[k]) * u])) };
  }
  function showBody(state) { Object.assign(body.params, state.params); body.body.load(state.body); }   // load() rebuilds once next frame
  function stepMorph(dt) {
    if (!morph || !body) return;
    morph.t = Math.min(1, (performance.now() - morph.t0) / (TRANSFORM_SECONDS * 1000));   // by the clock, so a slow frame doesn't stretch it
    const u = morph.t < 0.5 ? 2 * morph.t * morph.t : 1 - Math.pow(-2 * morph.t + 2, 2) / 2;      // ease in and out
    morph.u = u; showBody(blendBody(morph.from, morph.to, u));
    if (morph.t >= 1) { morph = null; bodySettled(); }
  }
  function bodySettled() {
    const m = body.morph(), bm = bodyMods(m, BODY_RACES, CREATION_RACES);
    setBody(character, Object.fromEntries(MAIN_STATS.map(st => [st, 100 + (bm.main[st] || 0)])));
    setTimeout(() => { if (body) player.setHeight(Math.max(1.3, Math.min(2.4, body.eyeHeight() / 0.93))); }, 300);
    updateLoad(); if (book.isOpen) book.render();
  }
  function drink(id) {
    const p = POTIONS[id]; if (!p) return;
    if (!body) return toast('Your body is still loading.');
    if (body.combat?.busy && body.combat.action?.type === 'move') return;          // (already drinking or busy with a move)
    if (!takeMaterial(inv, id, 1)) return toast(`No ${p.name} left.`);
    renderHotbar();
    // the drink: the bottle to the lips, and the potion takes hold as it's swallowed (straight away if the hands are busy)
    if (!body.act?.('drink', { onEvent: n => { if (n === 'drink') quaff(p); } })) quaff(p);
  }
  function quaff(p) {
    // where the body is now, and where this potion takes it (on top of any change still playing)
    const now = morph ? blendBody(morph.from, morph.to, morph.u || 0) : snapshot();
    if (morph) showBody(morph.to);
    p.apply({ body: body.body, params: body.params, setParam: (k, v) => { body.params[k] = Math.max(0, Math.min(1, v)); } }, { vitals, character });
    const to = snapshot();
    showBody(now);
    morph = { from: now, to, t: 0, t0: performance.now() };
    toast(`${p.name}: ${p.text}`);
    renderHotbar(); if (book.isOpen) book.render();
  }
  // ---- the character book (Tab / I) ----
  // the starting kit's carried items (tool kits) go in the pack on the first visit
  if (!save.packed) { for (const id of save.gear || []) if (ITEMS[id]?.carried) addItem(inv, { id }); save.packed = true; }
  const book = createBook($('.play'), { character, inv, body: () => body, hotbar, toast,
    onUse: id => drink(id), onChange: () => { updateLoad(); renderHotbar(); }, onClose: () => closeInventory() });
  function updateLoad() {
    const worn = body ? body.gear.equipped() : {}, kg = loadOf(inv, worn).kg, cap = capacity(character).kg;
    loadFactor = encumbrance(kg, cap);
    carryInfo = { kg, cap, gearKg: loadOf({ items: [], stacks: {} }, worn).kg };
  }
  let invOpen = false;
  function openInventory(tab) { invOpen = true; input.unlock(); book.open(tab); showPause(false); }
  function closeInventory() { invOpen = false; book.close(); rackEl.hidden = true; renderHotbar(); input.lock(); }
  // ---- the weapon rack ----
  const rackEl = document.createElement('div'); rackEl.className = 'rack-wrap'; rackEl.hidden = true; $('.play').appendChild(rackEl);
  const promptEl = $('.hud-prompt');
  // things to use with E: the weapon rack, the focus rack, the spell bookshelf
  const STATIONS = [
    { at: RACK, name: 'open the weapon rack', open: () => openRack() },
    { at: FRACK, name: 'open the focus rack', open: () => openRack('focus') },
    { at: SHELF, name: 'browse the spell books', open: () => openShelf() },
  ];
  function nearStation() {
    const st = player.state;
    for (const s of STATIONS) {
      const dx = s.at.x - st.pos.x, dz = s.at.z - st.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.6 && (-Math.sin(st.yaw) * dx - Math.cos(st.yaw) * dz) / d > 0.5) return s;      // close, and facing it
    }
    return null;
  }
  const nearRack = () => !!nearStation();
  function openRack(kind = 'weapons') {
    invOpen = true; input.unlock(); showPause(false);
    const groups = {}, focus = kind === 'focus';
    for (const [id, it] of Object.entries(ITEMS)) {
      if (focus ? it.focus : it.damage && !it.carried) (groups[focus ? 'Magic focuses' : it.skill || 'other'] ||= []).push([id, it]);
    }
    const trainList = focus ? ['fire', 'attunement', 'incantation', 'voiceless', 'manaControl'] : ['sneak', 'athletics', 'climbing', 'swimming', 'mace'];
    rackEl.innerHTML = `<div class="book rack" role="dialog" aria-label="${focus ? 'Focus rack' : 'Weapon rack'}"><div class="pages"><section class="cell-p">
      <header class="tree-head"><h3>${focus ? 'Focus rack' : 'Weapon rack'}</h3><span class="hint">${focus ? 'A focus in hand (or on the wrist) makes spells stronger and safer until you master them past 100. ' : ''}Take one into your pack, then wear it from the Character page (Tab). Test grounds only.</span></header>
      <div class="rack-train"><b>Test training:</b> ${trainList.map(sk => `<button class="btn ghost small" data-train="${sk}">+100 ${sk[0].toUpperCase() + sk.slice(1)} (${Math.floor(character.skills[sk] ?? 100)})</button>`).join(' ')}</div>
      <div class="rack-grid">${Object.entries(groups).map(([sk, list]) => `<div class="rack-g"><h4>${escapeHtml(sk.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()))}</h4>${list.map(([id, it]) =>
        `<button class="rack-item" data-take="${id}"><b>${escapeHtml(it.name)}</b><small>${it.damage ? `dmg ${it.damage} · spd ${it.speed} · reach ${it.reach}` : `focus: ${it.focus} · ${it.slot === 'wrist' ? 'worn on the wrist' : it.slot === 'offHand' ? 'off hand' : 'main hand'}`}${it.weight ? ` · ${it.weight} kg` : ''}</small></button>`).join('')}</div>`).join('')}</div>
      </section></div><button class="book-close" title="Close (E or Esc)">×</button></div>`;
    rackEl.hidden = false;
    rackEl.querySelector('.book-close').onclick = () => closeInventory();
    rackEl.querySelectorAll('[data-train]').forEach(b => b.onclick = () => { const sk = b.dataset.train; character.skills[sk] = (character.skills[sk] ?? 100) + 100; openRack(kind); toast(`${sk[0].toUpperCase() + sk.slice(1)} ${Math.floor(character.skills[sk])}: spend the new points in its tree (Tab → Skill trees).`); });
    rackEl.querySelectorAll('[data-take]').forEach(b => b.onclick = () => { addItem(inv, { id: b.dataset.take }); updateLoad(); toast(`${ITEMS[b.dataset.take].name} added to your pack.`); });
  }
  // the spell bookshelf: every spell there is, by school; study one to learn it (test shelf: you start it at
  // mastery 25 so it can be tried), and practice to push mastery along for testing
  function openShelf() {
    invOpen = true; input.unlock(); showPause(false);
    const bySchool = {};
    for (const sp of Object.values(SPELLS)) (bySchool[sp.school] ||= []).push(sp);
    const prep = preparedOf(character), pmax = preparedMax(character);
    rackEl.innerHTML = `<div class="book rack shelf" role="dialog" aria-label="Spell bookshelf"><div class="pages"><section class="cell-p">
      <header class="tree-head"><h3>Spell bookshelf</h3><span class="hint">Study a book to learn its spell, then prepare it (Magic page, or here). Prepared: ${prep.length} of ${pmax}. Test grounds only: studied spells start at mastery 25.</span></header>
      <div class="rack-grid">${Object.entries(bySchool).map(([sc, list]) => `<div class="rack-g"><h4>${escapeHtml(sc[0].toUpperCase() + sc.slice(1))}</h4>${list.map(sp => {
        const knows = sp.id in (character.spells || {}), lv = character.spells?.[sp.id] ?? 0, on = prep.includes(sp.id);
        return `<div class="rack-item spellbook-item ${knows ? 'known' : ''}" data-spell="${sp.id}" draggable="${knows}"><b>${escapeHtml(sp.name)}</b>
          <small>difficulty ${sp.difficulty} · ${sp.mana} MP · ${sp.castTime} s${SPELL_CAST[sp.id] ? '' : ' · no field effect yet'}</small><small class="desc">${escapeHtml(sp.description)}</small>
          <span class="acts">${knows ? `<small>mastery ${Math.floor(lv)}</small> <button class="prep-btn ${on ? 'on' : ''}" data-prepare="${sp.id}">${on ? '✦ Prepared' : 'Prepare'}</button> <button class="prep-btn" data-practice="${sp.id}">+25 mastery</button>` : `<button class="prep-btn" data-study="${sp.id}">Study</button>`}</span></div>`; }).join('')}</div>`).join('')}</div>
      </section></div><button class="book-close" title="Close (E or Esc)">×</button></div>`;
    rackEl.hidden = false;
    rackEl.querySelector('.book-close').onclick = () => closeInventory();
    rackEl.querySelectorAll('[data-study]').forEach(b => b.onclick = () => { const id = b.dataset.study; learnSpell(character, id, 'scroll'); character.spells[id] = Math.max(character.spells[id], 25); const r = togglePrepared(character, id); toast(`Learned ${SPELLS[id].name}${r.ok ? ' and prepared it' : ''}.`); openShelf(); });
    rackEl.querySelectorAll('[data-prepare]').forEach(b => b.onclick = () => { const r = togglePrepared(character, b.dataset.prepare); if (!r.ok) toast(r.reason); openShelf(); });
    rackEl.querySelectorAll('[data-practice]').forEach(b => b.onclick = () => { const id = b.dataset.practice; character.spells[id] = Math.min(1000, (character.spells[id] ?? 0) + 25); openShelf(); });
    rackEl.querySelectorAll('[data-spell]').forEach(li => { li.ondragstart = e => e.dataTransfer.setData('text/plain', 'spell:' + li.dataset.spell); });
  }
  addEventListener('keydown', e => { if (!rackEl.hidden && (e.code === 'Escape' || input.bindings.interact.includes(e.code))) { e.preventDefault(); closeInventory(); } });
  const invKeys = e => {
    if (!invOpen) return;
    if (input.bindings.inventory.includes(e.code) || e.code === 'Escape') { e.preventDefault(); closeInventory(); return; }
    const k = Object.keys(input.bindings).find(a => a.startsWith('hotbar') && input.bindings[a].includes(e.code));
    if (k) {                                                                     // hover a potion or a known spell and press a number to put it on the hotbar
      e.preventDefault(); const hov = document.querySelector('.book [data-potion]:hover, .book [data-spell]:hover');
      if (hov?.dataset.potion) { hotbar[+k.slice(6) - 1] = hov.dataset.potion; renderHotbar(); }
      else if (hov?.dataset.spell && hov.dataset.spell in (character.spells || {})) { hotbar[+k.slice(6) - 1] = 'spell:' + hov.dataset.spell; renderHotbar(); toast(`${SPELLS[hov.dataset.spell].name} on slot ${k.slice(6)}.`); }
    }
  };
  addEventListener('keydown', invKeys);
  renderHotbar();

  // ---- health and mana ----
  // Current HP and MP live in the save; they refill at the derived rates (src/rpg/stats.js), tripled
  // while resting. Camps will add their own bonus later.
  const REST = { sitting: 3 };
  const vitals = save.vitals || (save.vitals = { hp: derived(character).maxHp, mp: derived(character).maxMp });
  const blindEl = $('.blinded');
  const shadowBar = $('.bar.shadow'), hpBar = $('.bar.hp'), mpBar = $('.bar.mp'), restEl = $('.hud-rest'), breathBar = $('.bar.breath'), underEl = $('.underwater');
  const fill = (el, f) => el.style.setProperty('--f', Math.max(0, Math.min(1, f)).toFixed(3));   // how full a vial is (0..1)
  const hurtEl = $('.hurt');
  function hurt(frac, msg) {
    const d = derived(character); vitals.hp = Math.max(0, vitals.hp - d.maxHp * frac);
    hurtEl.classList.remove('on'); void hurtEl.offsetWidth; hurtEl.classList.add('on');
    if (msg) toast(`${msg}: −${Math.round(d.maxHp * frac)} health`);
  }
  // ---- noise and the sentry (src/rpg/stealth.js) ----
  const stealthEl = $('.hud-stealth'), noiseBar = $('.hud-stealth .noise i'), eyeEl = $('.hud-stealth .eye'), stealthTxt = $('.hud-stealth small');
  function stealth(dt) {
    const st = player.state, hs = Math.hypot(st.vel.x, st.vel.z), moving = hs > 0.3 || !!st.move || !!st.roll;
    const a = acoustics(), who = { crouching: st.crouching, moving: moving || !!(st.trav && st.noise > 0), character, route: st.trav?.kind || null };
    const noise = noiseOf(st.noise + st.noiseSpike, { ...who, mass: a.mass, gearKg: carryInfo.gearKg });
    const visibility = visibilityOf(who); // one player visibility calculation per frame, shared by every listener
    st.loudness = noise; st.visibility = visibility;   // (enemies use these too: src/game/enemies.js)
    // each sentry: line of sight from its eyes to your head or chest (crouching lowers both), its gaze sweeping
    const ph = player.height * (1 - 0.35 * st.crouch), time = performance.now() / 1000;
    const head = { x: st.pos.x, y: st.pos.y + ph * 0.88, z: st.pos.z }, chest = { x: st.pos.x, y: st.pos.y + ph * 0.6, z: st.pos.z };
    const vanished = (st.vanish || 0) > 0 && hasNode(character, 'sneak', 'vanish');                    // Vanish: unseen, nearly silent
    let worst = null, worstR = null;
    for (const s of sentries) {
      if (s.sweep) { s.yaw = s.baseYaw + s.sweep * Math.sin(time * 2 * Math.PI / s.period); s.group.rotation.y = s.yaw; }
      const dist = Math.hypot(st.pos.x - s.x, st.pos.z - s.z);
      if (dist > 60) { s.awareness = Math.max(0, s.awareness - 0.12 * dt); continue; }
      const eye = { x: s.x, y: s.y, z: s.z }, off = 0.55 / Math.max(0.5, dist);                       // start just outside its own head
      eye.x += (st.pos.x - s.x) * off; eye.z += (st.pos.z - s.z) * off;
      const seen = !lineBlocked(shapes, eye, head) || !lineBlocked(shapes, eye, chest);
      // Cloaked dodge (Sneak): mid-roll you can't be seen or heard by anyone who hasn't already spotted you
      const cloaked = (!!st.roll && hasNode(character, 'sneak', 'cloakedDodge') && s.awareness < 1) || vanished;
      const r = stepAwareness(s, { x: st.pos.x, y: st.pos.y + player.height * 0.8, z: st.pos.z, noise: cloaked ? (vanished ? noise * 0.3 : 0) : noise, visibility, seen: seen && !cloaked, open: seen }, dt);
      const col = s.awareness >= 1 ? '#e04848' : s.awareness >= STEALTH.suspicious ? '#e0b848' : '#5fbf6a';
      s.headMat.color.set(col); s.headMat.emissive.set(col).multiplyScalar(0.35);
      // spotted: it turns to face you and shoots while it can see you (an arrow every 1.4 s)
      if (s.shoots) {
        s.cool = Math.max(0, s.cool - dt);
        if (s.awareness >= 1 && seen && !cloaked) {
          s.lost = 0; s.yaw = Math.atan2(-(st.pos.x - s.x), -(st.pos.z - s.z)); s.group.rotation.y = s.yaw; s.baseYaw = s.yaw;
          if (s.cool <= 0) { s.cool = 1.4; projectiles.fire({ x: eye.x, y: s.y - 0.05, z: eye.z }, chest, { lead: st.vel }); audio.leap?.({ mass: 40, size: 0.8, fem: 0.2 }); }
        } else if (s.awareness >= 1) { s.lost += dt; if (s.lost > 3) s.awareness = 0.9; }                // lost you: back to looking
      }
      if (!worst || s.awareness > worst.awareness || (s.awareness === worst.awareness && dist < Math.hypot(st.pos.x - worst.x, st.pos.z - worst.z))) { worst = s; worstR = r; }
    }
    const nearest = worst || sentry, rr = worstR || { sight: 0, hearing: 0 };
    noiseBar.style.width = `${Math.min(100, noise / 20 * 100)}%`;
    const aw = nearest ? nearest.awareness : 0; eyeEl.style.setProperty('--a', aw.toFixed(2)); eyeEl.dataset.state = awarenessLabel(aw);   // (no sentries at all on a map without any)
    // shown only while you're sneaking (crouched), or something has noticed you
    const noticed = sentries.some(x => x.awareness > 0.01) || rr.sight > 0 || rr.hearing > 0;
    stealthEl.classList.toggle('on', !!(st.crouching || noticed || vanished));
    stealthTxt.textContent = `${noise.toFixed(1)} m${vanished ? ' · vanished' : ''} · sentry: ${awarenessLabel(aw).toLowerCase()}${rr.sight > 0 ? ' (sees you)' : rr.hearing > 0 ? ' (hears you)' : ''}`;
  }
  // ---- the course: hazards, checkpoints, respawning, the timer ----
  let activeCp = dungeon?.spawn?.checkpoint ? checkpoints.find(c => c.id === dungeon.spawn.checkpoint) : null, poisonT = 0, spikeCool = 0, runT = null, runTime = 0;
  // ---- spells: hold Q to speak the readied spell, F to cast it voiceless, Z to ready the next ----
  const spells = createSpellcast({ onNoise: (at, r, kind) => { enemies?.noise(at, r, kind); if (kind === 'spell') weather?.crystallize({ x: player.state.pos.x, y: player.state.pos.y, z: player.state.pos.z }); },   /* (a spell in a strong magic flare-up grows crystals: src/gfx/weather.js) */ THREE, scene, shapes, character, player, body: () => body, vitals, audio, hurtPlayer: (f, m) => hurt(f, m), toast });
  const castEl = document.createElement('div'); castEl.className = 'hud-cast'; castEl.hidden = true; castEl.innerHTML = '<span></span><i><b></b></i>'; $('.play').appendChild(castEl);
  function castHud(c) {
    castEl.hidden = !c; if (!c) return;
    castEl.querySelector('span').textContent = `${c.name}${c.mode === 'voiceless' ? ' (voiceless)' : ''}`; castEl.querySelector('b').style.width = `${c.k * 100}%`;
  }
  // ---- the spell wheel: hold Q, move the mouse toward a spell, let go to ready it ----
  // It holds your prepared spells round a ring that grows with how many there are (up to 30).
  const wheelEl = document.createElement('div'); wheelEl.className = 'spell-wheel'; wheelEl.hidden = true; $('.play').appendChild(wheelEl);
  const readiedEl = document.createElement('div'); readiedEl.className = 'hud-readied'; $('.play').appendChild(readiedEl);
  const wheel = { open: false, vx: 0, vy: 0, sel: -1, list: [] };
  function wheelRender() {
    const n = wheel.list.length, R = Math.max(70, 28 + n * 11), size = n > 18 ? 42 : n > 10 ? 50 : 58;
    wheelEl.style.setProperty('--R', `${R}px`);
    const cur = wheel.list[wheel.sel], sp = cur && SPELLS[cur], pr = sp && castProfile(character, sp, { focus: !!body?.gear.stats().focus });
    wheelEl.innerHTML = `<div class="ring" style="width:${R * 2 + size}px;height:${R * 2 + size}px"></div>` + (n ? wheel.list.map((id, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n, x = Math.cos(a) * R, y = Math.sin(a) * R, S = SPELLS[id];
      return `<div class="wslot ${i === wheel.sel ? 'on' : ''} ${SPELL_CAST[id] ? '' : 'inert'}" style="width:${size}px;height:${size}px;transform:translate(${x - size / 2}px,${y - size / 2}px)"><i class="rune s-${S.school}">${SCHOOL_GLYPH[S.school] || '✦'}</i><small>${escapeHtml(S.name)}</small></div>`;
    }).join('') : '') + `<div class="wcenter">${sp ? `<b>${escapeHtml(sp.name)}</b><small>${Math.ceil(pr.mana)} MP · ${pr.castTime.toFixed(1)} s${SPELL_CAST[cur] ? '' : ' · no field effect yet'}</small>` : n ? '<small>Move the mouse toward a spell</small>' : '<small>No spells prepared. Prepare them on the Magic page (Tab).</small>'}</div>`;
  }
  function wheelUpdate() {
    const want = input.locked && input.held('spellWheel') && !invOpen;
    if (want && !wheel.open) {
      wheel.open = true; wheel.vx = wheel.vy = 0; wheel.list = [...preparedOf(character)]; wheel.sel = wheel.list.indexOf(spells.readied);
      wheelEl.hidden = false; wheelRender();
    }
    if (!wheel.open) return;
    const l = input.takeLook();                                                 // the mouse picks on the wheel instead of turning the view
    wheel.vx += l.dx; wheel.vy += l.dy; const len = Math.hypot(wheel.vx, wheel.vy);
    if (len > 90) { wheel.vx *= 90 / len; wheel.vy *= 90 / len; }
    const n = wheel.list.length;
    if (n && len > 22) {
      const a = Math.atan2(wheel.vy, wheel.vx), step = 2 * Math.PI / n;
      const i = ((Math.round((a + Math.PI / 2) / step) % n) + n) % n;
      if (i !== wheel.sel) { wheel.sel = i; wheelRender(); }
    }
    if (!want) {
      wheel.open = false; wheelEl.hidden = true;
      const id = wheel.list[wheel.sel];
      if (id) { spells.readied = id; toast(`Readied: ${SPELLS[id].name}`); }
    }
  }
  const timerEl = document.createElement('div'); timerEl.className = 'hud-timer'; timerEl.hidden = true; $('.play').appendChild(timerEl);
  const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  function respawn(cp, msg) {
    const st = player.state, d = derived(character);
    const at = cp?.spawn || cp || (dungeon?.spawn) || startAt;
    Object.assign(st.pos, { x: at.x, y: at.y + 0.05, z: at.z }); st.vel.x = st.vel.y = st.vel.z = 0;
    st.hang = st.climb = st.trav = st.move = st.roll = st.slideRun = st.twirl = st.wallRun = st.wallClimb = null; st.onGround = false; st.fallFrom = st.pos.y; st.breath = 1;
    vitals.hp = Math.max(vitals.hp, d.maxHp * 0.6); poisonT = 0; projectiles.clear();
    for (const s of sentries) { s.awareness = 0; s.lost = 0; }
    enemies?.reset();
    if (msg) toast(msg);
  }
  let sneakXp = 0;
  function courseUpdate(dt) {
    const courseT0 = performance.now(); let monsterMs = 0;
    { const st = player.state;
    const mT0 = performance.now();
    if (input.pressed?.('resetPose')) { body?.resetPose?.(); combat.reset?.(); toast?.('Pose reset.'); }   // (K: a body in a twist, back to standing)
    monsters.update(dt, { pos: st.pos, height: player.height, loudness: st.loudness ?? 0, visibility: st.visibility ?? 1 }, { hurt: (pts, why) => { if (!st.invulnerable) hurt(Math.min(1, pts / Math.max(1, derived(character).maxHp)), why); },
      tryBlock: (dx, dz, pw) => { if (st.invulnerable) return { through: 0 }; const b = combat.tryBlock(dx, dz, pw); if (b) audio.block(pw); return b; }, debuff, ear: camera,
      killed: A => { const first = !knownBeast(character, A.id); learnKill(character, A.id, { level: A.level ?? null, hp: A.maxHp }); if (first) toast(`New bestiary entry: ${A.M.name}`); },
      struck: (A, type) => learnHit(character, A.id, type),
      xp: (n, A) => { const up = awardCombatXp(character, n, 'kill'); dummies.floatText(`+${n} exp`, { x: A.target.pos.x, y: A.target.pos.y + A.target.height + 0.8, z: A.target.pos.z }, '#9ad8ff'); if (up) toast(`Level up! You're level ${character.level} — ${character.unspentPoints} point${character.unspentPoints === 1 ? '' : 's'} to spend.`); } });   // (killing a monster: combat exp for your character level)
    monsterMs = performance.now() - mT0;
    if (probe.on) probeLaps['Monsters (AI + motion)'] = (probeLaps['Monsters (AI + motion)'] || 0) * 0.9 + monsterMs * 0.1;
    // the darkness easing in and out; your ears muffled with it
    { blind.t = Math.max(0, blind.t - dt); const goal = blind.t > 0 ? 1 : 0; blind.k += (goal - blind.k) * Math.min(1, dt * (goal ? 3 : 0.8)); if (blind.k < 0.002 && !goal) { blind.sight = 1; blind.hearing = 1; }
      blindEl.style.opacity = (blind.k * 0.75).toFixed(3); audio.muffle?.(blind.k * (1 - blind.hearing) * 2); }
    }
    const st = player.state, d = derived(character), feet = st.pos;
    // hazards
    spikeCool = Math.max(0, spikeCool - dt);
    let inPoison = false;
    for (const h of hazards) {
      if (feet.x < h.min[0] || feet.x > h.max[0] || feet.z < h.min[2] || feet.z > h.max[2] || feet.y > h.max[1] || feet.y + player.height < h.min[1]) continue;
      if (h.kind === 'lava') { hurt(HAZARD.lava.dmg, 'Burned in the lava'); if (vitals.hp > 0) respawn(activeCp, `Back to ${activeCp ? activeCp.name : 'the start'}.`); return; }
      if (h.kind === 'pit') { if (vitals.hp > 0) { vitals.hp = 0; toast('You fell into the pit'); } return; }   // the stakes: dead
      if (h.kind === 'poison') inPoison = true;
      if (h.kind === 'spikes' && spikeCool <= 0 && !st.invulnerable) { spikeCool = HAZARD.spikes.cool; hurt(HAZARD.spikes.dmg, 'Spikes'); st.vel.y = HAZARD.spikes.bounce; st.onGround = false; }
    }
    if (inPoison) poisonT = HAZARD.poison.linger;                                   // poison: while in it, and a while after
    if (poisonT > 0) { poisonT -= dt; vitals.hp = Math.max(0, vitals.hp - d.maxHp * HAZARD.poison.dps * dt); }
    poisonEl.classList.toggle('on', poisonT > 0);
    // arrows
    for (const hit of projectiles.update(dt, { pos: st.pos, height: player.height, invulnerable: st.invulnerable })) {
      const bl = hit.v && combat.tryBlock(-hit.v.x, -hit.v.z, 0.8);
      if (bl) { audio.block(0.8); if (bl.through > 0) hurt(hit.dmg * bl.through, 'Arrow'); continue; }      // caught on your guard (a little may get past)
      hurt(hit.dmg, 'Arrow');
    }
    // checkpoints: touch one to make it yours; the start begins the clock as you leave it, the finish stops it
    for (const cp of checkpoints) {
      const near = Math.hypot(feet.x - cp.x, feet.z - cp.z) < (cp.r || 2) && Math.abs(feet.y - cp.y) < 1.5;
      if (!near) continue;
      if (cp.finish) { if (runT !== null) { runTime = performance.now() / 1000 - runT; runT = null; const best = save.courseBest; if (!best || runTime < best) save.courseBest = runTime; toast(`FINISH · ${fmt(runTime)}${!best || runTime < best ? ' · new best!' : ` · best ${fmt(best)}`}`); } }
      if (activeCp !== cp) { activeCp = cp; if (!cp.finish && !cp.start) toast(`Checkpoint: ${cp.name}`); if (cp.start) { runT = null; timerEl.hidden = false; timerEl.textContent = `Course · best ${save.courseBest ? fmt(save.courseBest) : '—'}`; } }
    }
    if (activeCp?.start && runT === null && feet.z < -60.3) runT = performance.now() / 1000;          // over the start line
    if (runT !== null) { timerEl.hidden = false; timerEl.textContent = `${fmt(performance.now() / 1000 - runT)}${save.courseBest ? ` · best ${fmt(save.courseBest)}` : ''}`; }
    course.update(performance.now() / 1000, activeCp?.id);
    const lightOnYou = dungeonLights ? dungeonLights.lightAt(new THREE.Vector3(st.pos.x, st.pos.y + player.height * 0.6, st.pos.z)) + (skyNow?.hemi?.[2] ?? 0.5) * 3 : 1;
    { // the shadow flask: how hidden you are right now (light on you × how you're moving and Sneak), fuller = harder to see
      const seenK = Math.min(1, Math.max(0.12, lightOnYou)) * (st.visibility ?? 1), hidden = 1 - seenK;
      shadowBar.style.setProperty('--f', hidden.toFixed(3));
      shadowBar.title = `Hidden ${Math.round(hidden * 100)}% · light on you ${Math.min(1, lightOnYou).toFixed(2)} · stance and Sneak ×${(st.visibility ?? 1).toFixed(2)} (enemies see you within their vision × ${seenK.toFixed(2)})`;
    }
    const eres = enemies?.update(dt, { pos: st.pos, height: player.height, invulnerable: st.invulnerable, loudness: st.loudness || 0, light: lightOnYou, visibility: st.visibility ?? 1, sneak: character.skills?.sneak ?? 0 }, { pits: hazards.filter(h => h.kind === 'pit'), hurt: (pts, why) => hurt(Math.min(1, pts / Math.max(1, d.maxHp)), why), tryBlock: (dx, dz, pw) => { const b = combat.tryBlock(dx, dz, pw); if (b) audio.block(pw); return b; } });
    if (eres) {
      // the flask's red core: the most any enemy has on you (half: suspicious; full: hunting you)
      shadowBar.style.setProperty('--d', eres.detection.toFixed(3));
      shadowBar.classList.toggle('hunted', eres.detection > 0.5);
      // Sneak grows from being near enemies who don't know you're there (more the more hidden you stay), and from
      // slipping away from ones who were hunting you
      const hidden = 1 - Math.min(1, Math.max(0.12, lightOnYou)) * (st.visibility ?? 1);
      if (eres.unaware && st.crouching) { sneakXp += dt * Math.min(3, eres.unaware) * (0.3 + hidden) * (1 - eres.detection); }
      if (eres.escaped && hidden > 0.4) { sneakXp += 4 * eres.escaped; toast(eres.escaped > 1 ? 'They lost you.' : 'It lost you.'); }
      if (sneakXp >= 1) { train(character, 'sneak', sneakXp * 0.6, { stats: ['dexterity'], approach: true }); sneakXp = 0; }
    }
    dungeonObjs?.update(dt, performance.now() / 1000, { pos: st.pos, height: player.height, invulnerable: st.invulnerable }, (pts, why) => hurt(Math.min(1, pts / Math.max(1, d.maxHp)), why), enemies?.units || []);
    if (probe.on) {
      const otherMs = Math.max(0, performance.now() - courseT0 - monsterMs);
      probeLaps['World update overhead (excluding monsters)'] = (probeLaps['World update overhead (excluding monsters)'] || 0) * 0.9 + otherMs * 0.1;
    }
  }
  // the combo timing ring round the reticle: a wave grows out from the middle and meets the target ring at the moment the
  // next press is perfect (src/game/combat.js timing); the target ring thickens across the window; a soft glow on a hit
  const crossEl = $('.crosshair');
  const comboHud = (() => {
    const el = $('.combo-ring'), wave = el?.querySelector('.combo-wave'), tgt = el?.querySelector('.combo-target');
    let glow = 0, vis = 0;
    return {
      update(T) {
        if (!el) return;
        vis += ((T ? 1 : 0) - vis) * 0.3; glow = Math.max(0, glow - 0.05);
        el.style.opacity = (vis * 0.9).toFixed(3);
        if (T) {
          const inWin = Math.abs(T.k - 1) <= T.win;
          wave.style.transform = `scale(${Math.min(1.35, Math.max(0.05, T.k)).toFixed(3)})`;
          wave.style.opacity = T.k > 1 ? Math.max(0, 1 - (T.k - 1) / Math.max(0.02, T.win)).toFixed(3) : '1';
          tgt.classList.toggle('on', inWin);
        }
        tgt.style.boxShadow = glow > 0 ? `0 0 ${(8 * glow).toFixed(1)}px rgba(255,214,120,${(0.8 * glow).toFixed(2)})` : '';
      },
      flash() { glow = 1; },
    };
  })();
  const poisonEl = document.createElement('div'); poisonEl.className = 'poisoned'; $('.play').appendChild(poisonEl);
  function regen(dt) {
    const d = derived(character), mul = player.state.sitting ? REST.sitting : 1;
    if (vitals.hp <= 0) {                     // down: wake at your last checkpoint (or the start) at full health (no real death yet)
      if (dungeon && G.respawn === 'start') activeCp = dungeon.spawn?.checkpoint ? checkpoints.find(c => c.id === dungeon.spawn.checkpoint) : null;   // this map sends you back to the start
      vitals.hp = d.maxHp; respawn(activeCp, activeCp ? `You fell · back to ${activeCp.name}.` : 'You fell, and come to back at the start.');
    }
    vitals.hp = Math.min(d.maxHp, vitals.hp + d.hpRegen * mul * dt);
    vitals.mp = Math.min(d.maxMp, vitals.mp + d.mpRegen * mul * dt);
    fill(hpBar, vitals.hp / d.maxHp); fill(mpBar, d.maxMp ? vitals.mp / d.maxMp : 0);
    hpBar.querySelector('.num').textContent = Math.floor(vitals.hp); mpBar.querySelector('.num').textContent = Math.floor(vitals.mp);
    hpBar.title = `Health ${Math.floor(vitals.hp)} / ${Math.floor(d.maxHp)} (+${(d.hpRegen * mul).toFixed(1)}/s)`;
    mpBar.title = `Mana ${Math.floor(vitals.mp)} / ${Math.floor(d.maxMp)} (+${(d.mpRegen * mul).toFixed(2)}/s)`;
    restEl.classList.toggle('on', player.state.sitting);
    // drowning: out of breath underwater, health drains (8% of max a second)
    const st = player.state;
    if (st.drowning) vitals.hp = Math.max(0, vitals.hp - d.maxHp * 0.08 * dt);
    if (st.sweptHurt) vitals.hp = Math.max(0, vitals.hp - d.maxHp * Math.min(0.06, 0.02 * st.sweptHurt) * dt);   // swept along by a current, out of stamina
    breathBar.hidden = st.breath >= 0.999 && !st.underwater;
    fill(breathBar, st.breath); breathBar.classList.toggle('exhausted', st.breath < 0.25);
  }

  // ---- loop ----
  let last = performance.now(), fpsT = 0, frames = 0, fps = 0;
  // F8: the performance panel, for finding what costs frames on your machine. Switch anything off on its own and watch
  // the fps, frame time, draw calls and triangles (a frame's, shadows included). F8 opens it and frees the mouse;
  // click the game to play on with it showing; F8 again (or Escape) closes it and puts everything back on.
  const probeInfo = { calls: 0, tris: 0, mainCalls: 0, otherCalls: 0, ms: 0, gpuSamples: { main: [], reflection: [] } }, probeAcc = { calls: 0, tris: 0, mainCalls: 0 };
  // Live traversal capture: bounded per-frame samples while the player explores normally.
  const traversalCapture = { on: false, started: 0, samples: [], distance: 0, lastPos: null, report: '', dropped: 0, maxSamples: 18000, stage: '', renderCallMs: 0, lastCameraQ: null, shadowMapHook: false, frameId: 0, glActivity: { available: [], calls: {}, ms: {} }, frameGl: null };
  // Repeatable A/B: stationary camera sweep, first with normal foliage culling, then with foliage culling frozen.
  const foliageBufferTest = { active: false, phase: 'idle', started: 0, startYaw: 0, durationMs: 18000, button: null, status: null };
  // Manual F7 switch for isolating foliage culling outside the timed F8 A/B test.
  const foliageCullFreeze = { frozen: false, button: null, status: null };
  const lodZoneScheduler = createLodZoneScheduler();
  const refreshFoliageFreezeControl = () => {
    if (foliageCullFreeze.button) foliageCullFreeze.button.textContent = foliageCullFreeze.frozen ? 'Resume Foliage Culling' : 'Freeze Foliage Culling';
    if (foliageCullFreeze.status) foliageCullFreeze.status.textContent = foliageCullFreeze.frozen ? 'FROZEN · retaining the last foliage layout' : 'Active · foliage visibility updates normally';
  };
  // shader errors, kept for the performance panel (a material that fails to compile simply isn't drawn — the panel says which)
  if (!console.__eldShader) { const ce = console.error.bind(console); console.__eldShader = true; console.error = (...a) => { const t = String(a[0] || ''); if (/shader error|THREE\.WebGLProgram/i.test(t)) probeInfo.shaderErr = t.slice(0, 600); ce(...a); }; }
  // a frame's draw calls and triangles: added up after every render (the glow pass renders several times a frame). The
  // renderer's own counter is left to reset itself each render, as three.js expects (it also uses it to update
  // skinned bodies and buffers once per frame: stopping it broke the drawing)
  { const r0 = renderer.render.bind(renderer); renderer.render = (sc, cm) => {
    const timed = traversalCapture.on, t0 = timed ? performance.now() : 0;
    r0(sc, cm);
    if (timed) { const elapsed = performance.now() - t0; traversalCapture.renderCallMs += elapsed; const key = traversalCapture.stage === 'reflections' ? 'reflectionCallsMs' : traversalCapture.stage === 'main+postFX' ? 'mainCallsMs' : 'otherCallsMs'; traversalCapture.frameStages[key] = (traversalCapture.frameStages[key] || 0) + elapsed; }
    if (probe.on || traversalCapture.on) { const calls = renderer.info.render.calls; probeAcc.calls += calls; probeAcc.tris += renderer.info.render.triangles; if (sc === scene) probeAcc.mainCalls += calls; }
  }; }
  // Optional GL activity probes for traversal capture. These wrap existing WebGL entry points only
  // to count/timestamp synchronous calls; rendering arguments and return values are passed through.
  // Not every browser/context allows methods to be replaced, so report only hooks that installed.
  {
    const gl = renderer.getContext();
    const glMethods = [
      ['compileShader', 'shaderCompile'], ['linkProgram', 'programLink'],
      ['texImage2D', 'textureUpload'], ['texSubImage2D', 'textureUpload'],
      ['compressedTexImage2D', 'textureUpload'], ['compressedTexSubImage2D', 'textureUpload'],
      ['copyTexImage2D', 'textureUpload'], ['copyTexSubImage2D', 'textureUpload'],
      ['bufferData', 'bufferUpload'], ['bufferSubData', 'bufferUpload']
    ];
    for (const [method, category] of glMethods) {
      try {
        const original = gl[method];
        if (typeof original !== 'function') continue;
        gl[method] = function (...args) {
          const capture = traversalCapture.on, t0 = capture ? performance.now() : 0;
          try { return original.apply(gl, args); }
          finally {
            if (capture && traversalCapture.frameGl) {
              const elapsed = performance.now() - t0, f = traversalCapture.frameGl;
              f.glCalls[category] = (f.glCalls[category] || 0) + 1;
              f.glMs[category] = (f.glMs[category] || 0) + elapsed;
            }
          }
        };
        if (gl[method] !== original) traversalCapture.glActivity.available.push(method);
      } catch (_) { /* Some WebGL implementations expose non-writable methods. */ }
    }
  }
  // Time the actual shadow-map update when this Three.js build exposes its internal renderer hook.
  if (renderer.shadowMap && typeof renderer.shadowMap.render === 'function' && !renderer.shadowMap.__eldTimed) {
    const sm = renderer.shadowMap, renderShadows = sm.render.bind(sm); sm.__eldTimed = true; traversalCapture.shadowMapHook = true;
    sm.render = (...args) => { const timed = traversalCapture.on, t0 = timed ? performance.now() : 0; const out = renderShadows(...args); if (timed) traversalCapture.frameStages.shadowMapMs += performance.now() - t0; return out; };
  }
  const probeEl = document.createElement('div'); probeEl.className = 'perf-probe'; probeEl.hidden = true;
  probeEl.style.cssText = 'position:absolute;top:40px;left:12px;z-index:40;background:rgba(14,16,40,.92);color:#e8e4f4;font:13px/1.5 system-ui,sans-serif;padding:10px 14px;border-radius:8px;border:1px solid #5a5490;min-width:230px;max-width:min(620px,calc(100vw - 24px));max-height:82vh;overflow:auto;pointer-events:auto';
  const PROBE_ROWS = [['lamps', 'Lamp and torch lights'], ['crystals', 'Crystal and checkpoint lights'], ['shadows', 'Sun shadows'], ['bshadow', 'Buildings cast shadows'], ['trees', 'Trees and bushes'], ['small', 'Grass, flowers, reeds'], ['batinst', 'Instanced reserve bats'], ['umbraParts', 'Instanced Umbrafiend details'], ['umbra2weight', 'Two-influence Umbrafiend skinning'], ['buildings', 'Buildings, props, rocks'], ['ground', 'Ground and roads'], ['water', 'Water'], ['glow', 'Glow pass']];
  probeEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><b>Performance (F8)</b><span style="display:flex;gap:5px"><button type="button" data-copy-data style="cursor:pointer;white-space:nowrap">Copy data to clipboard</button><button type="button" data-full-toggle style="cursor:pointer;white-space:nowrap">Full Monitor ▾</button></span></div><div class="pp-stats" style="margin:4px 0 8px;font-variant-numeric:tabular-nums"></div><section class="pp-full" hidden style="border-top:1px solid #5a5490;padding-top:8px;margin:8px 0"><b>Full performance monitor</b><div class="pp-full-content" style="font-size:12px;line-height:1.45;margin-top:6px"></div></section>` +
    PROBE_ROWS.map(([k, t]) => `<label style="display:block;cursor:pointer"><input type="checkbox" data-p="${k}" checked> ${t}</label>`).join('') +
    `<details open style="margin-top:7px;border-top:1px solid #5a5490;padding-top:5px"><summary style="cursor:pointer">Post-processing diagnostics (A/B)</summary>` +
    [['fogOff','World / area fog shader'],['bloomOff','Bloom extraction + blur'],['blurOff','Bloom blur only'],['toneMapOff','ACES tone mapping'],['gradeOff','Color grade'],['vignetteOff','Vignette']].map(([k,t]) => `<label style="display:block;cursor:pointer"><input type="checkbox" data-fx="${k}" ${probe[k] ? 'checked' : ''}> Disable ${t}</label>`).join('') + `</details><div style="opacity:.8;font-size:11px;margin:3px 0 6px">World / area fog is a scene shader path, separate from postFX; disabling it removes scene.fog entirely. PostFX toggles require Glow pass ON. “Measure each part” runs a timed A/B for every switch; pass timings below are CPU submission estimates, not GPU timings.</div>` +
    `<details style="margin-top:7px;border-top:1px solid #5a5490;padding-top:5px"><summary style="cursor:pointer">Atmospheric haze prototype (A/B)</summary><div style="font-size:11px;opacity:.85;margin:3px 0 5px">Extends the existing outdoor fog range; preserves the sky, weather color, indoor fog, and strong local fog. This is a tuning prototype, not volumetric scattering.</div><label style="display:block;cursor:pointer"><input type="checkbox" data-atmosphere="enabled"> Enable far-distance haze</label><label style="display:block;margin-top:4px">Start distance <input type="range" data-atmosphere="start" min="80" max="280" step="5" value="140" style="width:110px;vertical-align:middle"> <span data-atmosphere-value="start">140</span></label><label style="display:block">End distance <input type="range" data-atmosphere="end" min="180" max="450" step="10" value="360" style="width:110px;vertical-align:middle"> <span data-atmosphere-value="end">360</span></label><label style="display:block">Strength <input type="range" data-atmosphere="strength" min="0" max="1" step="0.05" value="0.35" style="width:110px;vertical-align:middle"> <span data-atmosphere-value="strength">0.35</span></label></details>` +
    `<label style="display:block;margin-top:6px;cursor:pointer" title="Uses an asynchronous GPU timer query when supported; otherwise falls back to a CPU readback wait, which adds more overhead"><input type="checkbox" data-p="sync" checked> Measure GPU time (adds overhead)</label>` +
    `<div style="margin-top:6px">Spawn in front of you: ${Object.entries(MONSTERS).map(([k, M]) => `<button data-spawn="${k}" style="cursor:pointer">${M.name}</button>`).join(' ')}</div>` +
    `<button type="button" data-bench style="margin-top:6px;cursor:pointer">Measure each part (about 30 s — stand still)</button><pre class="pp-bench" style="white-space:pre-wrap;font-size:12px;margin:4px 0 0"></pre>` +`<div style="margin-top:10px;padding-top:8px;border-top:1px solid #5a5490"><b>Scenario benchmark</b><div style="font-size:11px;opacity:.85">Benchmarks the currently loaded map. Applies a repeatable time/weather/surface preset, warms up, measures, then restores your previous settings.</div><label style="display:block;margin:5px 0">Preset <select data-scenario><option value="clear-noon">Clear · noon</option><option value="late-clear">Clear · late afternoon</option><option value="night">Clear · night lighting</option><option value="rain">Rainstorm · maximum puddles</option><option value="snow">Snowstorm · maximum snow</option><option value="fog">Thick fog · afternoon</option></select></label><button type="button" data-scenario-run>Run scenario benchmark</button> <button type="button" data-scenario-copy disabled>Copy benchmark report</button><div class="pp-scenario-status" style="font-size:12px;margin-top:4px">Ready. Keep the camera still for comparable results.</div><pre class="pp-scenario-report" style="white-space:pre-wrap;font-size:12px;margin:4px 0 0"></pre></div>` +
    `<details open style="margin-top:10px;border-top:1px solid #5a5490;padding-top:7px"><summary style="cursor:pointer">Foliage buffer A/B test</summary><p style="font-size:11px;opacity:.85;margin:4px 0">One click runs a repeatable stationary camera sweep: 2 s warm-up, then 8 s normal foliage culling and 8 s with culling frozen. Each phase spins at 4x the original speed (four 360° turns per phase). The player stays still. The frozen phase retains the current foliage layout, so compare performance rather than visual correctness.</p><button type="button" data-foliage-test style="cursor:pointer">Run foliage buffer test</button> <span data-foliage-test-status style="font-size:11px">Ready · about 18 seconds</span></details><details open style="margin-top:10px;border-top:1px solid #5a5490;padding-top:7px"><summary style="cursor:pointer">Live traversal capture</summary><p style="font-size:11px;opacity:.85;margin:4px 0">Start capture, close or leave the monitor open, then sprint across the largest terrain you can. Stop to report frame-time spikes, CPU/render timings, draw load, and distance travelled. Captures up to 5 minutes.</p><button type="button" data-traverse-start style="cursor:pointer">Start live capture</button> <button type="button" data-traverse-stop style="cursor:pointer" disabled>Stop &amp; report</button> <button type="button" data-traverse-copy style="cursor:pointer" disabled>Copy report</button><div data-traverse-status style="font-size:11px;margin-top:4px">Ready</div><pre data-traverse-report style="white-space:pre-wrap;font-size:12px;margin:5px 0 0">No traversal captured yet.</pre></details>` +
    `<details open style="margin-top:10px;border-top:1px solid #5a5490;padding-top:7px"><summary style="cursor:pointer">Worker pool stress test</summary><p style="font-size:11px;opacity:.85;margin:4px 0">Runs the same deterministic CPU workload across different worker counts. Keep the camera still; results measure worker throughput, not full game speedup.</p><button type="button" data-worker-stress style="cursor:pointer">Run worker stress test</button> <span data-worker-stress-status style="font-size:11px">Ready</span><pre data-worker-stress-report style="white-space:pre-wrap;font-size:12px;margin:5px 0 0">No test run yet.</pre></details>` +
    `<label style="display:block;margin-top:6px">Time <input type="range" data-hour min="0" max="24" step="0.25" style="width:120px;vertical-align:middle"> <span class="pp-hour"></span></label>` +
    `<label style="display:block;cursor:pointer"><input type="checkbox" data-cycle checked> Time passes</label>` +
    `<label style="display:block;margin-top:6px">Weather <select data-wx>${Object.entries(WEATHER).map(([k, w]) => k === 'magic' ? ['low', 'medium', 'high'].map(l => `<option value="magic_${l}">${w.name} (${l})</option>`).join('') : `<option value="${k}">${w.name}</option>`).join('')}</select> <input type="range" data-wxs min="0.1" max="1.5" step="0.05" value="1" style="width:70px;vertical-align:middle"></label>` +
    `<label style="display:block">Clouds <select data-cl><option value="auto">With the weather</option>${Object.entries(CLOUDS).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join('')}</select> <input type="range" data-clc min="0" max="1" step="0.02" value="0.5" style="width:70px;vertical-align:middle"></label>` +
    `<label style="display:block"><input type="checkbox" data-wa checked> Wind with the weather · <input type="range" data-ws min="0" max="2" step="0.05" value="0.5" style="width:80px;vertical-align:middle"></label>` +
    `<label style="display:block">Fog <select data-fl><option value="auto">With the weather</option><option value="thin">Thin</option><option value="normal">Normal</option><option value="thick">Thick</option></select> · Aurora <select data-au><option value="auto">With the weather</option><option value="off">Never</option><option value="on">On</option></select></label>` +
    `<label style="display:block">Surfaces <select data-sf><option value="auto">With the weather</option><option value="dry">Dry</option><option value="wet">Wet</option><option value="puddles">Puddles</option><option value="snow1">Snow (light)</option><option value="snow2">Snow (deep)</option><option value="ice">Ice</option><option value="dust">Dust</option></select> · <input type="checkbox" data-ta checked> Temp auto <input type="range" data-tv min="-20" max="40" step="1" value="15" style="width:70px;vertical-align:middle"> </label>` +
    `<label style="display:block;margin-top:6px">Resolution <select data-p="scale"><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option><option value="0.25">25%</option></select></label>`;
  // F8 owns its button palette: !important also beats global button rules that otherwise make labels unreadable.
  const styleProbeButton = b => { b.style.setProperty('color', '#f4f0ff', 'important'); b.style.setProperty('background-color', 'rgba(90,84,144,.42)', 'important'); b.style.setProperty('border', '1px solid #9384d4', 'important'); b.style.setProperty('border-radius', '4px', 'important'); b.style.setProperty('padding', '4px 7px', 'important'); b.style.setProperty('font', 'inherit', 'important'); b.style.setProperty('text-shadow', '0 1px 2px #171329', 'important'); b.style.setProperty('opacity', '1', 'important'); };
  probeEl.querySelectorAll('button').forEach(styleProbeButton);
  probeEl.querySelectorAll('button').forEach(b => { if (!b.textContent.trim()) console.warn('F8 monitor button is missing a text label:', b); });
  root.querySelector('.play').appendChild(probeEl);
  const assignmentEl = document.createElement('div');
  assignmentEl.hidden = true;
  assignmentEl.style.cssText = 'position:absolute;top:40px;right:12px;z-index:41;background:rgba(14,16,40,.96);color:#e8e4f4;font:13px/1.5 system-ui,sans-serif;padding:12px 14px;border-radius:8px;border:1px solid #8b78cf;min-width:280px;max-width:min(430px,calc(100vw - 24px));max-height:82vh;overflow:auto;pointer-events:auto';
  assignmentEl.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px"><b>Worker Assignment Lab (F7)</b><button type="button" data-assignment-reset>Reset</button></div>
    <p style="font-size:11px;opacity:.85">Assignments change execution where a real worker route exists. Worker results are applied to Three.js buffers on the main thread.</p>
    <label style="display:block;margin:8px 0">Tree visibility + LOD <select data-assignment="trees"><option value="main">Main thread</option><option value="worker">Worker pool</option><option value="auto">Auto</option></select></label>
    <label style="display:block;margin:8px 0">Worker count <select data-assignment-workers><option value="1">1 worker</option><option value="2" selected>2 workers</option><option value="4">4 workers</option><option value="6">6 workers</option><option value="8">8 workers</option><option value="12">12 workers</option></select></label>
    <div style="font-size:11px;opacity:.8">Tree culling is split into 1,024-tree chunks. Changing worker count rebuilds the pool after the current batch completes.</div>
    <div style="margin:12px 0;padding-top:9px;border-top:1px solid #5a5490"><b>Player-centred LOD spheres</b><p style="font-size:11px;opacity:.85;margin:4px 0">Configure concentric distance bands independently of camera direction. Policy controls are live; renderer routing is the next migration step.</p><div data-lod-zones></div><div data-lod-zone-error style="font-size:11px;color:#ffb0a8;white-space:pre-wrap"></div><div data-lod-zone-status style="font-size:11px;opacity:.8;margin-top:5px">Policy loaded · renderer routing pending</div><button type="button" data-lod-zone-reset>Reset LOD zones</button></div>
    <div data-assignment-tree-status style="font-size:11px;padding:6px;background:rgba(255,255,255,.05);border-radius:4px;white-space:pre-wrap">Waiting for tree system…</div>
    <label style="display:block;margin:8px 0;opacity:.7">Terrain / procedural geometry <select disabled><option>Main thread · not routed yet</option></select></label>
    <label style="display:block;margin:8px 0;opacity:.7">World generation <select disabled><option>Main thread · not routed yet</option></select></label>
    <label style="display:block;margin:8px 0;opacity:.7">Three.js scene + WebGL uploads <select disabled><option>Main thread required</option></select></label>
    <div style="font-size:11px;opacity:.8;margin-top:8px">Worker routing status: <span data-assignment-pool>Not started</span></div>
    <div style="margin-top:12px;padding-top:9px;border-top:1px solid #5a5490"><b>Foliage culling test</b><p style="font-size:11px;opacity:.85;margin:4px 0">Freeze visibility/LOD updates and keep the last foliage layout on screen. This is a diagnostic mode; plants may remain visible when they normally would be culled.</p><button type="button" data-foliage-freeze>Freeze Foliage Culling</button><div data-foliage-freeze-status style="font-size:11px;margin-top:5px">Active · foliage visibility updates normally</div></div>
    <p style="font-size:11px;opacity:.8">Worker mode can leave the previous tree layout visible while culling runs. If a worker fails, the route falls back to the main thread and reports the error.</p>`;
  root.querySelector('.play').appendChild(assignmentEl);
  assignmentEl.querySelectorAll('button').forEach(styleProbeButton);
  foliageCullFreeze.button = assignmentEl.querySelector('[data-foliage-freeze]');
  foliageCullFreeze.status = assignmentEl.querySelector('[data-foliage-freeze-status]');
  refreshFoliageFreezeControl();
  foliageCullFreeze.button.addEventListener('click', () => {
    foliageCullFreeze.frozen = !foliageCullFreeze.frozen;
    refreshFoliageFreezeControl();
  });
  const lodZoneContainer = assignmentEl.querySelector('[data-lod-zones]');
  const renderLodZoneControls = () => {
    lodZoneContainer.innerHTML = '';
    lodZoneScheduler.snapshot().zones.forEach(z => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:42px 1fr 1fr;gap:5px;align-items:center;margin:7px 0;padding:6px;background:rgba(255,255,255,.045);border-radius:4px';
      row.innerHTML = '<label style="font-size:11px"><input type="checkbox" data-enabled> LOD ' + z.id + '</label>' +
        '<label style="font-size:11px">Radius (m)<input data-radius type="number" min="1" max="10000" step="5" value="' + z.radius + '" style="width:100%;box-sizing:border-box"></label>' +
        '<label style="font-size:11px">Every N frames<input data-interval type="number" min="1" max="10000" value="' + z.interval + '" style="width:100%;box-sizing:border-box"></label>' +
        '<label style="grid-column:2/4;font-size:11px">Worker assignment<select data-worker style="width:100%"><option value="main">Main thread</option><option value="worker-1">Worker 1</option><option value="worker-2">Worker 2</option><option value="worker-3">Worker 3</option><option value="worker-4">Worker 4</option><option value="worker-5">Worker 5</option><option value="worker-6">Worker 6</option><option value="auto">Auto</option></select></label>';
      row.querySelector('[data-enabled]').checked = z.enabled;
      row.querySelector('[data-worker]').value = z.assignment;
      lodZoneContainer.appendChild(row);
    });
    const apply = () => {
      try {
        const next = Array.from(lodZoneContainer.children).map((row, i) => {
          const prior = lodZoneScheduler.snapshot().zones[i];
          return { ...prior, enabled: row.querySelector('[data-enabled]').checked,
            radius: Number(row.querySelector('[data-radius]').value),
            interval: Number(row.querySelector('[data-interval]').value),
            assignment: row.querySelector('[data-worker]').value };
        });
        const policy = lodZoneScheduler.configure(next);
        dungeonLights?.foliage?.setLodZonePolicy?.(policy);
        assignmentEl.querySelector('[data-lod-zone-error]').textContent = '';
        assignmentEl.querySelector('[data-lod-zone-status]').textContent = 'Policy applied · small-foliage LOD buffers scheduled';
      } catch (error) {
        assignmentEl.querySelector('[data-lod-zone-error]').textContent = error?.message || String(error);
      }
    };
    lodZoneContainer.querySelectorAll('input,select').forEach(el => el.addEventListener('change', apply));
  };
  renderLodZoneControls();
  assignmentEl.querySelector('[data-lod-zone-reset]').addEventListener('click', () => {
    const policy = lodZoneScheduler.reset();
    dungeonLights?.foliage?.setLodZonePolicy?.(policy);
    assignmentEl.querySelector('[data-lod-zone-error]').textContent = '';
    assignmentEl.querySelector('[data-lod-zone-status]').textContent = 'Defaults restored · small-foliage LOD buffers scheduled';
    renderLodZoneControls();
  });
  assignmentEl.querySelector('[data-assignment="trees"]').addEventListener('change', e => dungeonLights?.foliage?.setWorkerMode(e.target.value));
  assignmentEl.querySelector('[data-assignment-workers]').addEventListener('change', e => dungeonLights?.foliage?.setWorkerCount?.(Number(e.target.value)));
  assignmentEl.querySelector('[data-assignment-reset]').addEventListener('click', () => {
    assignmentEl.querySelector('[data-assignment="trees"]').value = 'main';
    assignmentEl.querySelector('[data-assignment-workers]').value = '2';
    dungeonLights?.foliage?.setWorkerCount?.(2);
    dungeonLights?.foliage?.setWorkerMode('main');
  });
  let assignmentRefreshAt = 0;
  const refreshAssignmentPanel = () => {
    if (assignmentEl.hidden || performance.now() < assignmentRefreshAt) return;
    assignmentRefreshAt = performance.now() + 350;
    const foliage = dungeonLights?.foliage, state = foliage?.workerState, mode = foliage?.workerMode || 'main';
    assignmentEl.querySelector('[data-assignment-tree-status]').textContent = foliage
      ? `Assignment: ${mode.toUpperCase()} · Status: ${state?.status || 'idle'}\nWorkers: ${state?.workerCount || foliage?.workerCount || 2} · chunk size: ${state?.chunkSize || 1024}\nBatch wall time: ${(state?.lastMs || 0).toFixed(2)} ms · avg queue wait: ${(state?.queueMs || 0).toFixed(2)} ms\nSum worker CPU: ${(state?.workerMs || 0).toFixed(2)} ms · dispatch/clone: ${(state?.dispatchMs || 0).toFixed(2)} ms · apply buffers: ${(state?.applyMs || 0).toFixed(2)} ms · batches: ${state?.jobs || 0}${state?.error ? '\\nError: ' + state.error : ''}`
      : 'No foliage/tree system on this map.';
    assignmentEl.querySelector('[data-assignment-pool]').textContent = state?.error || state?.status || 'Main thread (default)';
    const select = assignmentEl.querySelector('[data-assignment="trees"]');
    if (select.value !== mode) select.value = mode;
    const workerSelect = assignmentEl.querySelector('[data-assignment-workers]');
    const workerCount = state?.workerCount || foliage?.workerCount || 2;
    if (Number(workerSelect.value) !== workerCount) workerSelect.value = String(workerCount);
  };
  const probeKeyHandler = e => {
    if (e.code === 'F7') {
      e.preventDefault(); assignmentEl.hidden = !assignmentEl.hidden;
      if (!assignmentEl.hidden) { input.unlock(); showPause(false); refreshAssignmentPanel(); }
      else if (!probe.on) input.lock();
      return;
    }
    if (e.code === 'Escape' && !assignmentEl.hidden) {
      e.preventDefault(); assignmentEl.hidden = true;
      if (!probe.on) input.lock();
    }
  };
  addEventListener('keydown', probeKeyHandler);

  probeEl.querySelector('[data-full-toggle]').addEventListener('click', () => {
    const full = probeEl.querySelector('.pp-full');
    full.hidden = !full.hidden;
    probeEl.querySelector('[data-full-toggle]').textContent = full.hidden ? 'Full Monitor ▾' : 'Compact Monitor ▴';
  });
  probeEl.querySelector('[data-copy-data]').addEventListener('click', async () => {
    const button = probeEl.querySelector('[data-copy-data]');
    const lines = ['Eldermere performance data', new Date().toLocaleString(), '', probeEl.querySelector('.pp-stats').innerText];
    const full = probeEl.querySelector('.pp-full');
    if (!full.hidden) lines.push('', 'Full performance monitor', full.querySelector('.pp-full-content').innerText);
    const benchText = probeEl.querySelector('.pp-bench').innerText.trim();
    if (benchText) lines.push('', 'Measure each part', benchText);
    if (workerStressReport) lines.push('', 'Worker pool stress test', probeEl.querySelector('[data-worker-stress-report]').innerText);
    lines.push('', 'Feature switches');
    for (const [key, label] of PROBE_ROWS) {
      const input = probeEl.querySelector(`[data-p="${key}"]`);
      lines.push(`${label}: ${input?.checked ? 'ON' : 'OFF'}`);
    }
    lines.push(`Measure GPU time: ${probeEl.querySelector('[data-p="sync"]').checked ? 'ON' : 'OFF'}`);
    lines.push('', 'Post-processing diagnostics');
    for (const [key, label] of [['fogOff','World / area fog shader'],['bloomOff','Bloom extraction + blur'],['blurOff','Bloom blur only'],['toneMapOff','ACES tone mapping'],['gradeOff','Color grade'],['vignetteOff','Vignette']]) lines.push(`${label}: ${probe[key] ? 'DISABLED' : 'enabled'}`);
    lines.push(`Atmospheric haze prototype: ${atmosphereSettings.enabled ? 'ON' : 'OFF'} · start ${atmosphereSettings.start} · end ${atmosphereSettings.end} · strength ${atmosphereSettings.strength}`);
    lines.push('', 'Post-processing pass timings (CPU submission; not GPU)');
    for (const [name, q] of Object.entries(fx.passStats || {})) lines.push(`${name}: ${q.avgMs.toFixed(3)} ms · ${q.calls} calls · ${q.triangles} triangles`);
    const copyText = lines.join('\n');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(copyText);
      else {
        const area = document.createElement('textarea');
        area.value = copyText; area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.appendChild(area); area.select();
        const ok = document.execCommand('copy'); area.remove();
        if (!ok) throw new Error('Clipboard copy was blocked');
      }
      button.textContent = 'Copied!';
      setTimeout(() => { if (button.isConnected) button.textContent = 'Copy data to clipboard'; }, 1600);
    } catch (err) {
      button.textContent = 'Copy failed — select data manually';
      setTimeout(() => { if (button.isConnected) button.textContent = 'Copy data to clipboard'; }, 2400);
      console.warn('Could not copy performance data to clipboard', err);
    }
  });
  const fullMonitorHtml = () => {
    const counts = { objects: 0, visible: 0, meshes: 0, instanced: 0, activeInstanced: 0, instances: 0, treeBatches: 0, treeInstances: 0, foliageBatches: 0, foliageInstances: 0, batBatches: 0, batInstances: 0, skinned: 0, shadowCasters: 0, lights: 0, point: 0, directional: 0, spot: 0, lampLights: 0, crystalLights: 0, buildings: 0, ground: 0, water: 0, sprites: 0, lines: 0 };
    const visit = (o, parentVisible = true) => { counts.objects++; const visible = parentVisible && o.visible; if (visible) { counts.visible++; if (o.isMesh) { counts.meshes++; if (o.isInstancedMesh) { counts.instanced++; if (o.count > 0) counts.activeInstanced++; counts.instances += o.count || 0; if (o.userData?.canopy) { counts.treeBatches++; counts.treeInstances += o.count || 0; } if (o.userData?.noCover) { counts.foliageBatches++; counts.foliageInstances += o.count || 0; } if (o.userData?.instancedBatSwarm) { counts.batBatches++; if (o.name.includes('bodies')) counts.batInstances = o.count || 0; } } if (o.isSkinnedMesh) counts.skinned++; if (o.castShadow) counts.shadowCasters++; } if (o.isLight) { counts.lights++; if (o.isPointLight) { counts.point++; const hex = o.color?.getHexString(); if (hex === '6fb6ff' || hex === '8ac8ff') counts.crystalLights++; else counts.lampLights++; } else if (o.isDirectionalLight) counts.directional++; else if (o.isSpotLight) counts.spot++; } if (o.userData?.probe === 'buildings') counts.buildings++; else if (o.userData?.probe === 'ground') counts.ground++; else if (o.userData?.probe === 'water') counts.water++; if (o.isSprite) counts.sprites++; if (o.isLine || o.isLineSegments) counts.lines++; } for (const child of o.children || []) visit(child, visible); }; visit(scene);
    const rows = [
      ['Lamp / torch lights', probe.lamps ? 'Enabled · ' + counts.lampLights + ' visible point lights' : 'Disabled'], ['Crystal / checkpoint lights', probe.crystals ? 'Enabled · ' + counts.crystalLights + ' visible point lights' : 'Disabled'],
      ['Sun shadow rendering', probe.shadows && sun.castShadow ? 'Enabled' : 'Disabled'], ['Building shadow casting', probe.bshadow ? 'Enabled' : 'Disabled'],
      ['Trees and bushes', !probe.trees ? 'Disabled' : counts.treeInstances ? 'Instanced · ' + counts.treeInstances + ' visible LOD instances' : 'Instanced renderer · no trees in range'], ['Grass, flowers and reeds', !probe.small ? 'Disabled' : counts.foliageInstances ? 'Instanced · ' + counts.foliageInstances + ' visible LOD instances' : 'Instanced renderer · no small plants in range'], ['Reserve bat instancing', probe.batinst ? (counts.batInstances ? 'Enabled · ' + counts.batInstances + ' proxy bats' : 'Enabled · no reserve bats currently visible') : 'Disabled · full creature models used'],
      ['Instanced Umbrafiend details', probe.umbraParts ? 'Enabled' : 'Disabled'], ['Umbrafiend skinning variant', probe.umbra2weight ? 'Two-influence shader' : 'Standard four-influence shader'],
      ['Buildings, props and rocks', !probe.buildings ? 'Disabled' : counts.buildings ? 'Enabled · ' + counts.buildings + ' tagged objects' : 'Enabled · no tagged objects'], ['Ground and roads', !probe.ground ? 'Disabled' : counts.ground ? 'Enabled · ' + counts.ground + ' tagged objects' : 'Enabled · no tagged objects'], ['Water', !probe.water ? 'Disabled' : counts.water ? 'Enabled · ' + counts.water + ' tagged objects' : 'Enabled · no tagged objects'],
      ['Glow / post-processing', probe.glow ? 'Enabled' : 'Disabled'], ['World / area fog', probe.fogOff ? 'Disabled (diagnostic)' : 'Enabled'], ['Bloom extraction + blur', probe.bloomOff ? 'Disabled' : 'Enabled'], ['Bloom blur', probe.blurOff ? 'Disabled' : 'Enabled'], ['ACES tone mapping', probe.toneMapOff ? 'Disabled (diagnostic)' : 'Enabled'], ['Color grade', probe.gradeOff ? 'Disabled' : 'Enabled'], ['Vignette', probe.vignetteOff ? 'Disabled' : 'Enabled'], ['Puddle reflections', reflections && reflections.mode !== 'off' ? reflections.mode : 'Off'],
      ['Post-processing path', settings.postfx !== false && !fx.probeOff ? 'Enabled' : 'Bypassed'], ['Tone-mapping route', settings.postfx !== false && !fx.probeOff ? 'Custom ACES in postFX' : 'Three.js ACESFilmicToneMapping'], ['Atmospheric haze prototype', atmosphereSettings.enabled ? `Enabled · ${atmosphereSettings.start}–${atmosphereSettings.end} · strength ${atmosphereSettings.strength}` : 'Disabled'], ['Render scale', (probe.scale * (settings.renderScale ?? 1) * 100).toFixed(0) + '%'],
      ['GPU timing method', tq ? 'Separate asynchronous timer queries: main scene + postFX, and reflections; rolling median of up to 30 valid samples' : probe.sync ? 'CPU readback wait (not pure GPU time)' : 'Not measured'],
      ['GPU main + postFX', Number.isFinite(probeInfo.gpuMain) ? probeInfo.gpuMain.toFixed(2) + ' ms median · ' + probeInfo.gpuSamples.main.length + ' samples' : 'Waiting for valid samples'],
      ['GPU reflections', Number.isFinite(probeInfo.gpuReflection) ? probeInfo.gpuReflection.toFixed(2) + ' ms median · ' + probeInfo.gpuSamples.reflection.length + ' samples' : 'Waiting for valid samples']
    ];
    const timings = Object.entries(probeLaps).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<tr><td>'+k+'</td><td style="text-align:right;font-variant-numeric:tabular-nums">'+v.toFixed(2)+' ms</td></tr>').join('');
    const fxTimings = Object.entries(fx.passStats || {}).map(([k,v])=>'<tr><td>'+k+'</td><td style="text-align:right;font-variant-numeric:tabular-nums">'+v.avgMs.toFixed(3)+' ms</td><td style="text-align:right">'+v.calls+' calls</td><td style="text-align:right">'+v.triangles+' tris</td></tr>').join('');
    const stateRows = rows.map(([k,v])=>'<tr><td>'+k+'</td><td style="text-align:right">'+v+'</td></tr>').join('');
    const tiles = [['Scene objects',counts.objects],['Visible objects',counts.visible],['Visible meshes',counts.meshes],['Instanced mesh objects',counts.instanced],['Active instance batches',counts.activeInstanced],['Instances in active batches',counts.instances],['Tree LOD batches',counts.treeBatches],['Tree instances across LODs',counts.treeInstances],['Small-foliage batches',counts.foliageBatches],['Small-foliage instances across LODs',counts.foliageInstances],['Bat proxy batches',counts.batBatches],['Reserve bat proxies',counts.batInstances],['Skinned meshes',counts.skinned],['Shadow-casting meshes',counts.shadowCasters],['Visible lights',counts.lights],['Point lights',counts.point],['Directional lights',counts.directional],['Spot lights',counts.spot],['Sprites',counts.sprites],['Line objects',counts.lines],['Geometries in memory',renderer.info.memory.geometries],['Textures in memory',renderer.info.memory.textures],['Shader programs',renderer.info.programs?.length ?? '—']];
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:5px;margin-bottom:8px">'+tiles.map(([k,v])=>'<div style="background:rgba(90,84,144,.18);padding:5px 7px;border-radius:4px"><span style="opacity:.8">'+k+'</span><br><b>'+v+'</b></div>').join('')+'</div>'+
      '<b>Feature switches</b><table style="width:100%;border-collapse:collapse;margin:3px 0 9px">'+stateRows+'</table>'+
      '<b>CPU time by game subsystem</b><div style="opacity:.8">Smoothed time between measured checkpoints. These rows are partial timings, not a sum of all CPU work.</div><table style="width:100%;border-collapse:collapse;margin:3px 0 9px">'+(timings||'<tr><td>Collecting samples…</td></tr>')+'</table>'+
      '<b>GPU timing interpretation</b><div style="opacity:.8">GPU timings are separate asynchronous timer-query medians over up to 30 valid samples. Main scene + postFX excludes the puddle-reflection update; reflections are shown separately. Samples from a previous diagnostic toggle are discarded. Per-pass postFX values below remain CPU submission timings, not GPU timings.</div>' +
      '<b>Post-processing pass CPU submission timings</b><div style="opacity:.8">These are CPU wall-time around renderer calls, not GPU execution time; use the A/B benchmark below to estimate GPU savings.</div><table style="width:100%;border-collapse:collapse;margin:3px 0 9px"><tr><th align="left">Pass</th><th>CPU ms</th><th>Calls</th><th>Triangles</th></tr>'+(fxTimings||'<tr><td>Collecting samples…</td></tr>')+'</table>'+ 
      '<b>Reading the numbers</b><div style="opacity:.8">Draw calls and triangles accumulate across intercepted render calls. Main-scene passes include repeated renders of the game scene (for example, glow/post-processing); other scenes are insets/previews. These are pass totals, not unique objects or a single-pass count. CPU game time is update work before rendering; sending draws is CPU time in the render path. GPU time is only a true GPU measurement when a valid timer-query result is available. “Measure each part” switches features off one at a time to estimate their impact.</div>';
  };
  const isCrystalLight = o => o.color && (o.color.getHexString() === '6fb6ff' || o.color.getHexString() === '8ac8ff');
  const applyProbe = () => {
    scene.traverse(o => {
      if (o.isPointLight) o.visible = isCrystalLight(o) ? probe.crystals : probe.lamps;
      const c = o.userData?.probe; if (!c) return;
      if (c === 'buildings') { o.visible = probe.buildings; o.castShadow = probe.bshadow; } else if (c === 'ground') o.visible = probe.ground; else if (c === 'water') o.visible = probe.water;
    });
    sun.castShadow = probe.shadows;
    monsters.setBatInstancing(probe.batinst);
    monsters.setUmbrafiendPartInstancing(probe.umbraParts);
    monsters.setUmbrafiendSkinningVariant(probe.umbra2weight);
    const fl = dungeonLights?.foliage; if (fl) { fl.hideBig = !probe.trees; fl.hideSmall = !probe.small; fl.dirty = true; }
    fx.probeOff = !probe.glow;
    scene.fog = probe.fogOff ? null : worldFog;
    // When the monitor bypasses the custom postFX path, restore Three.js ACES so the comparison doesn't silently remove tone mapping too.
    renderer.toneMapping = settings.postfx !== false && probe.glow ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    fx.probe.bloomOff = probe.bloomOff; fx.probe.blurOff = probe.blurOff; fx.probe.toneMapOff = probe.toneMapOff; fx.probe.gradeOff = probe.gradeOff; fx.probe.vignetteOff = probe.vignetteOff;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5) * (settings.renderScale ?? 1) * probe.scale);
  };
  let workerStressReport = null;
  const traversalStatus = probeEl.querySelector('[data-traverse-status]');
  const traversalReportEl = probeEl.querySelector('[data-traverse-report]');
  const traversalStartBtn = probeEl.querySelector('[data-traverse-start]');
  const traversalStopBtn = probeEl.querySelector('[data-traverse-stop]');
  const traversalCopyBtn = probeEl.querySelector('[data-traverse-copy]');
  const traversalStats = (key) => { const a = traversalCapture.samples.map(q => q[key]).filter(Number.isFinite); return { median: sortedMedian(a), p95: percentile95(a), max: a.length ? Math.max(...a) : NaN, mean: a.length ? a.reduce((x,y)=>x+y,0)/a.length : NaN }; };
  const finishTraversalCapture = () => {
    if (!traversalCapture.on && !traversalCapture.samples.length) return;
    traversalCapture.on = false;
    const foliageDiag = dungeonLights?.foliage?.diagnostics;
    if (foliageDiag) foliageDiag.enabled = false;
    const foliageLine = foliageDiag
      ? `Foliage culling: ${foliageDiag.calls} recalculations · ${foliageDiag.skipped} skipped checks · ${foliageDiag.calls ? (foliageDiag.totalMs / foliageDiag.calls).toFixed(2) : '0.00'} ms avg / ${foliageDiag.maxMs.toFixed(2)} ms max · ${foliageDiag.totalMs.toFixed(1)} ms total · scan ${foliageDiag.scanMs.toFixed(1)} ms · buffer prep ${foliageDiag.bufferMs.toFixed(1)} ms · ${foliageDiag.instances.toLocaleString()} visible LOD instances · cells ${foliageDiag.cellsVisited || 0}/${foliageDiag.cellsTested || 0} visited/tested · ${foliageDiag.instancesTested || 0} tree instances checked`
      : 'Foliage culling: diagnostics unavailable';
    const a = traversalCapture.samples, duration = a.length ? (a[a.length - 1].t - a[0].t) / 1000 : 0;
    const stageSummary = key => { const vals = a.map(q => q[key]).filter(Number.isFinite); return vals.length ? `median ${fmtMs(sortedMedian(vals))} · p95 ${fmtMs(percentile95(vals))} · max ${fmtMs(Math.max(...vals))}` : 'no samples'; };
    const hitches = a.filter(q => q.frameMs >= 25).sort((x,y) => y.frameMs - x.frameMs).slice(0, 12);
    const hitchLines = hitches.map(q => { const glFmt = (key) => `${q.glCalls?.[key] || 0} calls/${(q.glMs?.[key] || 0).toFixed(2)}ms`; return `  ${q.elapsed.toFixed(1)}s · frame ${q.frameMs.toFixed(1)} ms · logic ${q.logicMs.toFixed(1)} · ${traversalCapture.shadowMapHook ? `shadow maps ${(q.shadowMapMs||0).toFixed(1)}` : 'shadow maps n/a'} · reflection update ${q.reflectionUpdateMs.toFixed(1)} · main+postFX ${q.mainRenderMs.toFixed(1)} · renderer calls ${q.renderCallMs.toFixed(1)} (main ${(q.mainCallsMs||0).toFixed(1)}, reflection ${(q.reflectionCallsMs||0).toFixed(1)}, other ${(q.otherCallsMs||0).toFixed(1)}) · turn ${q.turnDeg.toFixed(1)}° · ${q.calls} calls · ${Math.round(q.tris).toLocaleString()} tris · GPU main ${Number.isFinite(q.gpuMainMs) ? q.gpuMainMs.toFixed(2)+'ms' : 'pending/n/a'} · GPU reflection ${Number.isFinite(q.gpuReflectionMs) ? q.gpuReflectionMs.toFixed(2)+'ms' : 'pending/n/a'} · shaders compile ${glFmt('shaderCompile')} · link ${glFmt('programLink')} · tex upload ${glFmt('textureUpload')} · buffer upload ${glFmt('bufferUpload')} · programs ${q.programsBefore}→${q.programsAfter} (Δ${q.programDelta}) · geom Δ${q.geometriesDelta} · tex Δ${q.texturesDelta}`; });
    const f = traversalStats('frameMs'), logic = traversalStats('logicMs'), submit = traversalStats('submitMs');
    const slow33 = a.filter(q => q.frameMs >= 33.3).length, slow50 = a.filter(q => q.frameMs >= 50).length;
    const worst = a.reduce((m,q)=>!m || q.frameMs > m.frameMs ? q : m, null);
    const calls = traversalStats('calls'), tris = traversalStats('tris');
    const buckets = [];
    for (let start = 0; start < duration; start += 10) {
      const q = a.filter(v => v.t / 1000 >= start && v.t / 1000 < start + 10);
      if (!q.length) continue;
      const times = q.map(v=>v.frameMs), bucketDuration = Math.max(0.001, Math.min(start + 10, duration) - start);
      buckets.push(`${String(start).padStart(3)}–${String(Math.min(start+10,duration)).padStart(3)}s: ${q.length} frames · ${(q.length / bucketDuration).toFixed(1)} observed FPS · p95 ${percentile95(times).toFixed(1)} ms · ${q.filter(v=>v.frameMs>=33.3).length} frames ≥33 ms`);
    }
    const mem = performance.memory ? `JS heap: ${(performance.memory.usedJSHeapSize/1048576).toFixed(1)} / ${(performance.memory.jsHeapSizeLimit/1048576).toFixed(0)} MB used/limit (Chromium estimate)` : 'JS heap: browser does not expose performance.memory';
    traversalCapture.report = [
      'ELDERMERE LIVE TRAVERSAL CAPTURE', new Date().toLocaleString(),
      `Duration: ${duration.toFixed(1)} s · samples: ${a.length}${traversalCapture.dropped ? ` · dropped samples: ${traversalCapture.dropped}` : ''}`,
      `Distance travelled: ${traversalCapture.distance.toFixed(1)} m · average movement speed: ${duration > 0 ? (traversalCapture.distance/duration).toFixed(2) : '0.00'} m/s`,
      `Observed average FPS: ${duration > 0 ? (a.length / duration).toFixed(1) : '—'} · frame interval: median ${fmtMs(f.median)} · p95 ${fmtMs(f.p95)} · worst ${fmtMs(f.max)}`,
      `Hitches: ${slow33} frames ≥33.3 ms · ${slow50} frames ≥50 ms · worst at ${worst ? `${worst.elapsed.toFixed(1)} s, position (${worst.x.toFixed(1)}, ${worst.y.toFixed(1)}, ${worst.z.toFixed(1)})` : '—'}`,
      `Game-update CPU: median ${fmtMs(logic.median)} · p95 ${fmtMs(logic.p95)} · worst ${fmtMs(logic.max)}`,
      `Render submission CPU: median ${fmtMs(submit.median)} · p95 ${fmtMs(submit.p95)} · worst ${fmtMs(submit.max)}`,
      foliageLine,
      `Render-stage CPU (whole stage, includes renderer submission): reflection update ${stageSummary('reflectionUpdateMs')} · main+postFX ${stageSummary('mainRenderMs')}`,
      `Shadow-map update CPU: ${traversalCapture.shadowMapHook ? stageSummary('shadowMapMs') : 'hook unavailable in this renderer build'}`,
      `GL instrumentation hooks: ${traversalCapture.glActivity.available.length ? traversalCapture.glActivity.available.join(', ') : 'none installed'}`,
      `Hitch-frame GL timings are CPU time around WebGL calls (not GPU execution); program/geometry/texture deltas are renderer-info counts, not proof of compilation/upload cost.`,
      `Renderer.render() CPU summed across calls: ${stageSummary('renderCallMs')} (main ${stageSummary('mainCallsMs')}; reflection ${stageSummary('reflectionCallsMs')}; other ${stageSummary('otherCallsMs')})`,
      `Draw calls/frame: median ${Number.isFinite(calls.median)?Math.round(calls.median):'—'} · p95 ${Number.isFinite(calls.p95)?Math.round(calls.p95):'—'} · max ${Number.isFinite(calls.max)?Math.round(calls.max):'—'}`,
      `Triangles/frame across render passes: median ${Number.isFinite(tris.median)?Math.round(tris.median).toLocaleString():'—'} · p95 ${Number.isFinite(tris.p95)?Math.round(tris.p95).toLocaleString():'—'} · max ${Number.isFinite(tris.max)?Math.round(tris.max).toLocaleString():'—'}`,
      `GPU timer-query median: main + postFX ${probeInfo.gpuSamples.main.length ? fmtMs(sortedMedian(probeInfo.gpuSamples.main)) : 'no valid samples'} (${probeInfo.gpuSamples.main.length} samples) · reflections ${probeInfo.gpuSamples.reflection.length ? fmtMs(sortedMedian(probeInfo.gpuSamples.reflection)) : 'no valid samples'} (${probeInfo.gpuSamples.reflection.length} samples)`,
      mem, '', 'Foliage A/B phase comparison (same stationary camera sweep at 4x speed: four full rotations per 8-second phase; frozen phase skips foliage.cull and retains the prior foliage layout):', ...['warmup','baseline-spin','frozen-spin'].map(phase => { const q = a.filter(v => v.testPhase === phase); if (!q.length) return `  ${phase}: no samples`; const fm = q.map(v=>v.frameMs), sm = q.map(v=>v.submitMs), bu = q.map(v=>v.glMs?.bufferUpload || 0), bc = q.map(v=>v.glCalls?.bufferUpload || 0), gpu = q.map(v=>v.gpuMainMs).filter(Number.isFinite); const seconds = Math.max(.001, (q[q.length-1].t-q[0].t)/1000); return `  ${phase}: ${q.length} frames · ${(q.length / seconds).toFixed(1)} observed FPS · frame p95 ${percentile95(fm).toFixed(1)} ms · render submission p95 ${percentile95(sm).toFixed(1)} ms · buffer-upload CPU median ${sortedMedian(bu).toFixed(2)} ms / p95 ${percentile95(bu).toFixed(2)} ms · buffer-upload calls median ${sortedMedian(bc).toFixed(0)} · GPU median ${gpu.length ? sortedMedian(gpu).toFixed(2)+' ms' : 'pending/n/a'} · hitches ≥33.3 ms ${q.filter(v=>v.frameMs>=33.3).length}`; }), '', 'Worst frames ≥25 ms (stage timings are CPU wall time, not isolated GPU time):', ...(hitchLines.length ? hitchLines : ['  No frames ≥25 ms']), '', '10-second timeline:', ...(buckets.length ? buckets : ['No timeline samples']), '',
      'Interpretation: observed average FPS is sample count divided by capture duration; it is more representative of sustained throughput than the reciprocal of median frame interval. Frame interval includes waiting for refresh and possible GPU stalls. Game-update CPU and render-submission CPU are separate measured portions, not a complete sum. Draw calls/triangles count all intercepted render passes. This capture does not by itself attribute a hitch to terrain generation unless a matching terrain build log appears in the console.'
    ].join('\n');
    traversalReportEl.textContent = traversalCapture.report;
    traversalStatus.textContent = `Complete · ${duration.toFixed(1)} s · ${a.length} frames · ${slow50} severe hitches`;
    traversalStartBtn.disabled = false; traversalStopBtn.disabled = true; traversalCopyBtn.disabled = false;
    if (!foliageBufferTest.active) foliageBufferTest.button.disabled = false;
  };
  traversalStartBtn.addEventListener('click', () => {
    dungeonLights?.foliage?.resetDiagnostics?.();
    if (dungeonLights?.foliage?.diagnostics) dungeonLights.foliage.diagnostics.enabled = true;
    traversalCapture.on = true; traversalCapture.started = performance.now(); traversalCapture.samples = []; traversalCapture.distance = 0; traversalCapture.lastPos = null; traversalCapture.report = ''; traversalCapture.dropped = 0; traversalCapture.lastCameraQ = camera.quaternion.clone(); traversalCapture.stage = ''; traversalCapture.renderCallMs = 0;
    traversalReportEl.textContent = 'Capturing… Run across the terrain, then press Stop & report.';
    traversalStatus.textContent = 'CAPTURING · move through the world normally'; traversalStartBtn.disabled = true; traversalStopBtn.disabled = false; traversalCopyBtn.disabled = true;
  });
  traversalStopBtn.addEventListener('click', finishTraversalCapture);
  foliageBufferTest.button = probeEl.querySelector('[data-foliage-test]');
  foliageBufferTest.status = probeEl.querySelector('[data-foliage-test-status]');
  foliageBufferTest.button.addEventListener('click', () => {
    if (foliageBufferTest.active || traversalCapture.on || bench.on || scenarioBench.on) return;
    const foliage = dungeonLights?.foliage;
    if (!foliage) { foliageBufferTest.status.textContent = 'Unavailable: this scene has no foliage system.'; return; }
    foliage.resetDiagnostics?.(); if (foliage.diagnostics) foliage.diagnostics.enabled = true;
    // The automated A/B owns its own baseline/frozen phases; don't let the manual F7 toggle contaminate it.
    foliageCullFreeze.frozen = false; refreshFoliageFreezeControl();
    foliageBufferTest.active = true; foliageBufferTest.phase = 'warmup'; foliageBufferTest.started = performance.now(); foliageBufferTest.startYaw = camera.rotation.y;
    traversalCapture.on = true; traversalCapture.started = foliageBufferTest.started; traversalCapture.samples = []; traversalCapture.distance = 0; traversalCapture.lastPos = null; traversalCapture.report = ''; traversalCapture.dropped = 0; traversalCapture.lastCameraQ = camera.quaternion.clone(); traversalCapture.stage = ''; traversalCapture.renderCallMs = 0;
    foliageBufferTest.button.disabled = true; foliageBufferTest.status.textContent = 'Running · warm-up (2 s)…';
    traversalReportEl.textContent = 'Automated foliage A/B test running. Results will appear in the Live traversal capture report.';
    traversalStatus.textContent = 'CAPTURING · automated stationary camera sweep'; traversalStartBtn.disabled = true; traversalStopBtn.disabled = true; traversalCopyBtn.disabled = true;
  });
  traversalCopyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(traversalCapture.report); traversalStatus.textContent = 'Report copied to clipboard.'; }
    catch { traversalReportEl.focus?.(); traversalStatus.textContent = 'Clipboard blocked; select and copy the report text below.'; }
  });
  probeEl.querySelector('[data-worker-stress]').addEventListener('click', async event => {
    const button = event.currentTarget, status = probeEl.querySelector('[data-worker-stress-status]'), output = probeEl.querySelector('[data-worker-stress-report]');
    button.disabled = true; status.textContent = 'Running…'; output.textContent = 'Starting workers and warming up…';
    try {
      workerStressReport = await runWorkerStressTest();
      const rows = workerStressReport.results.map(r => `  ${r.workers} worker(s): median ${r.elapsedMs.toFixed(1)} ms [${r.samplesMs.join(', ')}] · ${r.iterationsPerSecond.toLocaleString()} iterations/s · ${r.speedupVsFirst}× vs first · startup ${r.initMs.toFixed(1)} ms · warm-up ${r.warmupMs.toFixed(1)} ms · checksum ${r.valid ? 'PASS' : 'FAIL'}`);
      output.textContent = [
        `Logical processors reported: ${workerStressReport.hardwareConcurrency ?? 'unknown'}`,
        `Recommended pool size: ${workerStressReport.recommendedWorkers}`,
        `Work per run: ${workerStressReport.totalIterations.toLocaleString()} iterations`,
        ...rows,
        '',
        workerStressReport.note,
      ].join('\n');
      status.textContent = workerStressReport.results.every(r => r.valid) ? 'Complete · checksums passed' : 'Warning · validation failed';
    } catch (error) {
      workerStressReport = { error: error?.message || String(error) };
      output.textContent = `Worker test failed: ${workerStressReport.error}\nCheck the browser console and whether this page is served in a context that permits module workers.`;
      status.textContent = 'Failed';
    } finally { button.disabled = false; }
  });
  probeEl.addEventListener('change', e => { if (e.target.dataset.p !== undefined || e.target.dataset.fx !== undefined) resetGpuSamples(); });
  probeEl.addEventListener('input', e => { if (e.target.dataset.hour !== undefined) sky.setHour(+e.target.value, true); });
  probeEl.addEventListener('change', e => { if (e.target.dataset.cycle !== undefined) sky.cycle = e.target.checked; });
  probeEl.addEventListener('change', e => { if ((e.target.dataset.wx !== undefined || e.target.dataset.wxs !== undefined) && weather) weather.set(probeEl.querySelector('[data-wx]').value, +probeEl.querySelector('[data-wxs]').value, 8); });
  probeEl.addEventListener('input', e => { if (!weather) return; const q = k => probeEl.querySelector(`[data-${k}]`), ds = e.target.dataset;
    if (ds.cl !== undefined || ds.clc !== undefined) { weather.clouds = q('cl').value === 'auto' ? null : { type: q('cl').value, cover: ds.clc !== undefined ? +q('clc').value : undefined }; weather.retarget(4); }
    if (ds.wa !== undefined || ds.ws !== undefined) { if (ds.ws !== undefined) q('wa').checked = false; weather.wind = q('wa').checked ? null : { strength: +q('ws').value }; weather.retarget(3); }
    if (ds.fl !== undefined) { weather.fog = q('fl').value === 'auto' ? null : q('fl').value; weather.retarget(3); }
    if (ds.sf !== undefined && weathering) weathering.force = { auto: null, dry: { wet: 0, puddle: 0, gutter: 0, snow: 0 }, wet: { wet: 1, puddle: 0, gutter: 0, snow: 0 }, puddles: { wet: 1, puddle: 1, gutter: 1, snow: 0 }, snow1: { wet: 0.2, puddle: 0, snow: 0.45 }, snow2: { wet: 0.3, puddle: 0, snow: 1 }, ice: { wet: 1, puddle: 0.8, gutter: 0.6, snow: 0, ice: 1 }, dust: { wet: 0, puddle: 0, gutter: 0, snow: 0, ice: 0, dust: 1 } }[q('sf').value];
    if (ds.ta !== undefined || ds.tv !== undefined) { if (ds.tv !== undefined) q('ta').checked = false; weather.temp = q('ta').checked ? null : +q('tv').value; }
    if (ds.au !== undefined) { weather.aurora = q('au').value === 'auto' ? null : q('au').value === 'on' ? 1 : 0; weather.retarget(4); } });
  probeEl.addEventListener('change', e => { const k = e.target.dataset.p; if (!k) return; probe[k] = k === 'scale' ? +e.target.value : e.target.checked; if (k !== 'sync') applyProbe(); });
  const syncAtmosphereControls = () => {
    const get = k => probeEl.querySelector(`[data-atmosphere="${k}"]`);
    for (const k of ['start', 'end', 'strength']) {
      const value = probeEl.querySelector(`[data-atmosphere-value="${k}"]`);
      if (value) value.textContent = k === 'strength' ? atmosphereSettings[k].toFixed(2) : String(atmosphereSettings[k]);
    }
    const start = get('start'), end = get('end');
    if (start && end) {
      end.min = String(+start.value + 10);
      if (+end.value < +end.min) { end.value = end.min; atmosphereSettings.end = +end.value; }
    }
    const enabled = get('enabled');
    if (enabled) enabled.checked = atmosphereSettings.enabled;
  };
  const updateAtmosphereControl = e => {
    const k = e.target.dataset.atmosphere;
    if (!k) return;
    if (k === 'enabled') atmosphereSettings.enabled = e.target.checked;
    else if (k === 'start' || k === 'end' || k === 'strength') atmosphereSettings[k] = +e.target.value;
    syncAtmosphereControls();
    resetGpuSamples();
  };
  syncAtmosphereControls();
  probeEl.addEventListener('input', updateAtmosphereControl);
  probeEl.addEventListener('change', updateAtmosphereControl);

  probeEl.addEventListener('change', e => { const k = e.target.dataset.fx; if (!k) return; probe[k] = e.target.checked; applyProbe(); });
  const closeProbe = () => { if (scenarioBench?.on) restoreScenarioState(); probe.on = probe.open = false; probe.sync = true; probeEl.hidden = true; probeEl.querySelector('.pp-full').hidden = true; probeEl.querySelector('[data-full-toggle]').textContent = 'Full Monitor ▾'; for (const r of PROBE_ROWS) probe[r[0]] = true; for (const k of ['fogOff','bloomOff','blurOff','toneMapOff','gradeOff','vignetteOff']) probe[k] = false; probe.scale = 1; probeEl.querySelectorAll('input').forEach(i => { if (i.dataset.p) i.checked = true; if (i.dataset.fx) i.checked = false; }); probeEl.querySelector('select').value = '1'; applyProbe(); input.lock(); };
  addEventListener('keydown', e => {
    // Capture immediately with '=' while the monitor is active, without needing to click the panel.
    // Use the physical Equal key so the shortcut works regardless of Shift / keyboard layout.
    if (e.code === 'Equal' && probe.on && !probeEl.hidden) {
      const target = e.target;
      if (target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      probeEl.querySelector('[data-copy-data]')?.click();
      return;
    }
    if (e.code === 'Escape' && probe.on && !input.locked) { e.preventDefault(); closeProbe(); return; }
    if (e.code !== 'F8') return; e.preventDefault();
    if (!probe.on) { probe.on = probe.open = true; probeEl.hidden = false; input.unlock(); showPause(false); }
    else if (input.locked) { probe.open = true; input.unlock(); showPause(false); }
    else closeProbe();
  });
  // The book's figure box: the character drawn into that part of the canvas, face on, head included.
  const figCam = new THREE.PerspectiveCamera(26, 1, 0.1, 50), figBg = new THREE.Color('#2b2433');
  function renderFigure() {
    const r = book.portraitRect(); if (!r || r.width < 4) return;
    const cr = canvas.getBoundingClientRect(), x = r.left - cr.left, y = cr.bottom - r.bottom;
    const st = player.state, a = st.yaw + book.turn, p = body.root.position, hgt = body.crownHeight();
    figCam.aspect = r.width / r.height; figCam.updateProjectionMatrix();
    const dist = (hgt * 0.6) / Math.tan(13 * Math.PI / 180) / Math.min(1, figCam.aspect * 1.4);
    const fy = st.pos.y;                               // the floor under the player
    figCam.position.set(p.x - Math.sin(a) * dist, fy + hgt * 0.55, p.z - Math.cos(a) * dist); figCam.lookAt(p.x, fy + hgt * 0.53, p.z);
    const bg = scene.background, fog = scene.fog, fn = fog?.near, ff = fog?.far; scene.background = figBg; if (fog) { fog.near = 1e4; fog.far = 2e4; }   // (fog pushed away, not removed: removing it changes every shader)
    // drawn like the scene itself (with the glow pass on: linear, into a picture, graded onto the screen) — a different
    // way (tone-mapped straight to the screen) made every shader in the level compile again the first time the book opened
    if (settings.postfx !== false && !fx.probeOff) fx.renderInset(scene, figCam, x, y, r.width, r.height);
    else { renderer.setScissorTest(true); renderer.setScissor(x, y, r.width, r.height); renderer.setViewport(x, y, r.width, r.height); renderer.render(scene, figCam); renderer.setScissorTest(false); }
    renderer.setViewport(0, 0, cr.width, cr.height);
    scene.background = bg; if (fog) { fog.near = fn; fog.far = ff; }
  }
  // The Bestiary's creature: built once per page into its own little lit scene, turned by dragging (and slowly by itself)
  const beast = { id: null, C: null, scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(30, 1, 0.05, 200), spin: 0, size: 1, mid: new THREE.Vector3() };
  beast.scene.background = new THREE.Color('#2b2433');
  beast.scene.add(new THREE.HemisphereLight('#fff4e0', '#3a3040', 0.9)); { const d = new THREE.DirectionalLight('#ffffff', 1.1); d.position.set(3, 5, 4); beast.scene.add(d); }
  function renderBeast(dt) {
    const id = book.beastId, r = book.beastRect(); if (!id || !r || r.width < 4) return;
    if (beast.id !== id) {
      if (beast.C) { beast.scene.remove(beast.C.root); beast.C.root.traverse(o => { if (o.isMesh) o.material?.dispose?.(); }); }
      beast.id = id; beast.C = null;
      try { beast.C = buildCreature(THREE, monsterSpec(id).spec); } catch (e) { console.warn('bestiary model', e); return; }
      beast.scene.add(beast.C.root); beast.C.sync?.();
      const box = new THREE.Box3().setFromObject(beast.C.root); box.getCenter(beast.mid); beast.size = Math.max(0.3, box.getSize(new THREE.Vector3()).length());
    }
    if (!beast.C) return;
    beast.spin += dt * 0.25; beast.C.root.rotation.y = beast.spin + book.turn; beast.C.sync?.();
    const cr = canvas.getBoundingClientRect(), x = r.left - cr.left + 6, y = cr.bottom - r.bottom + 6, w = r.width - 12, h = r.height - 12;
    beast.cam.aspect = w / h; beast.cam.updateProjectionMatrix();
    const dist = beast.size * 0.62 / Math.tan(15 * Math.PI / 180) / Math.min(1, beast.cam.aspect);
    beast.cam.position.set(beast.mid.x + dist * 0.75, beast.mid.y + dist * 0.3, beast.mid.z + dist * 0.6); beast.cam.lookAt(beast.mid);
    renderer.setScissorTest(true); renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h); renderer.render(beast.scene, beast.cam); renderer.setScissorTest(false);
    renderer.setViewport(0, 0, cr.width, cr.height);
  }
  // the performance panel's breakdown of the game's own time (each part since the one before; smoothed)
  const probeLaps = {}; let lapT = 0;
  const lap = k => { if (!probe.on) return; const n = performance.now(); probeLaps[k] = (probeLaps[k] || 0) * 0.9 + (n - lapT) * 0.1; lapT = n; };
  // the GPU's own time for the frame, where the browser offers it (a timer query); otherwise the CPU waits for the GPU
  // with a one-pixel read (a real wait: gl.finish() doesn't wait in most browsers)
  const glc = renderer.getContext(), tq = glc.getExtension && glc.getExtension('EXT_disjoint_timer_query_webgl2'), tqList = [], px1 = new Uint8Array(4);
  const gpuModeKey = () => [...PROBE_ROWS.map(([k]) => probe[k]), probe.fogOff, probe.bloomOff, probe.blurOff, probe.toneMapOff, probe.gradeOff, probe.vignetteOff, probe.scale, atmosphereSettings.enabled, atmosphereSettings.start, atmosphereSettings.end, atmosphereSettings.strength].join(':');
  const resetGpuSamples = () => { probeInfo.gpuSamples.main.length = 0; probeInfo.gpuSamples.reflection.length = 0; probeInfo.gpu = 0; probeInfo.gpuMain = 0; probeInfo.gpuReflection = 0; };
  const median = values => { if (!values.length) return NaN; const a = [...values].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const startGpuQuery = bucket => {
    if ((!probe.on && !traversalCapture.on) || (!probe.sync && !traversalCapture.on) || !tq || tqList.length >= (traversalCapture.on ? 48 : 8)) return null;
    const q = glc.createQuery(); glc.beginQuery(tq.TIME_ELAPSED_EXT, q);
    return { q, bucket, mode: gpuModeKey(), captureFrameId: traversalCapture.on ? traversalCapture.frameId : null, benchAcc: bench.on && bench.n > 40 ? bench.acc : null };
  };
  const endGpuQuery = item => { if (item) { glc.endQuery(tq.TIME_ELAPSED_EXT); tqList.push(item); } };
  // "Measure each part": each part of the scene switched off in turn for a moment, the GPU's and the CPU's time
  // measured with and without it — what each one costs, in one table
  const bench = { on: false, i: -1, n: 0, acc: null, res: [], base: null, hideBody: false };
  const scenarioBench = { on: false, phase: 'idle', frame: 0, logic: [], submit: [], frameMs: [], calls: [], tris: [], report: '', saved: null, clearRestoreForce: false, restoreForce: null, restoreForceDelay: 0 };
  const BENCH = [
    ...PROBE_ROWS.map(([k, t]) => ({ name: t, off: () => { probe[k] = false; applyProbe(); }, on: () => { probe[k] = true; applyProbe(); } })),
    { name: 'World / area fog', off: () => { probe.fogOff = true; applyProbe(); }, on: () => { probe.fogOff = false; applyProbe(); } },
    { name: 'PostFX: bloom extraction + blur', off: () => { probe.bloomOff = true; applyProbe(); }, on: () => { probe.bloomOff = false; applyProbe(); } },
    { name: 'PostFX: blur only', off: () => { probe.blurOff = true; applyProbe(); }, on: () => { probe.blurOff = false; applyProbe(); } },
    { name: 'PostFX: ACES tone mapping', off: () => { probe.toneMapOff = true; applyProbe(); }, on: () => { probe.toneMapOff = false; applyProbe(); } },
    { name: 'PostFX: color grade', off: () => { probe.gradeOff = true; applyProbe(); }, on: () => { probe.gradeOff = false; applyProbe(); } },
    { name: 'PostFX: vignette', off: () => { probe.vignetteOff = true; applyProbe(); }, on: () => { probe.vignetteOff = false; applyProbe(); } },
    { name: 'Puddle reflections', off: () => { bench.rm = reflections?.mode; if (reflections) reflections.mode = 'off'; }, on: () => { if (reflections) reflections.mode = bench.rm; } },
    { name: 'Lamp light on surfaces', off: () => { if (weathering) weathering.lampsOff = true; }, on: () => { if (weathering) weathering.lampsOff = false; } },
    { name: 'Your character', off: () => { bench.hideBody = true; }, on: () => { bench.hideBody = false; } },
    { name: '· its hair', off: () => { bench.hideHair = true; }, on: () => { bench.hideHair = false; } },
    { name: '· its shadow', off: () => { bench.noBodyShadow = true; }, on: () => { bench.noBodyShadow = false; body?.root.traverse(o => { if (o.isMesh) o.castShadow = !o.userData.hairCards; }); } },
    { name: 'Far shadows', off: () => { bench.farOff = true; }, on: () => { bench.farOff = false; } },
  ];
  const benchEl = () => probeEl.querySelector('.pp-bench');
  const scenarioStatus = () => probeEl.querySelector('.pp-scenario-status');
  const scenarioReportEl = () => probeEl.querySelector('.pp-scenario-report');
  const scenarioCopyButton = () => probeEl.querySelector('[data-scenario-copy]');
  const scenarioPresets = {
    'clear-noon': { label: 'Clear · noon', hour: 12, weather: 'clear', strength: 1, surface: 'dry', temp: 15 },
    'late-clear': { label: 'Clear · late afternoon', hour: 17, weather: 'clear', strength: 1, surface: 'dry', temp: 15 },
    night: { label: 'Clear · night lighting', hour: 22, weather: 'clear', strength: 1, surface: 'dry', temp: 8 },
    rain: { label: 'Rainstorm · maximum puddles', hour: 16, weather: 'downpour', strength: 1.5, surface: 'puddles', temp: 12 },
    snow: { label: 'Snowstorm · maximum snow', hour: 12, weather: 'snow', strength: 1.5, surface: 'snow2', temp: -5 },
    fog: { label: 'Thick fog · afternoon', hour: 16, weather: 'fog', strength: 1, surface: 'dry', temp: 12, fog: 'thick' },
  };
  const surfacePresets = {
    dry: { wet: 0, puddle: 0, gutter: 0, snow: 0, ice: 0, dust: 0 },
    puddles: { wet: 1, puddle: 1, gutter: 1, snow: 0, ice: 0, dust: 0 },
    snow2: { wet: 0.3, puddle: 0, gutter: 0, snow: 1, ice: 0, dust: 0 },
  };
  const sortedMedian = values => {
    const a = values.filter(Number.isFinite).slice().sort((x, y) => x - y);
    if (!a.length) return NaN;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const percentile95 = values => {
    const a = values.filter(Number.isFinite).slice().sort((x, y) => x - y);
    return a.length ? a[Math.min(a.length - 1, Math.ceil(a.length * 0.95) - 1)] : NaN;
  };
  const fmtMs = n => Number.isFinite(n) ? `${n.toFixed(2)} ms` : 'unavailable';
  const saveScenarioState = () => ({
    hour: sky.hour, cycle: sky.cycle, wx: { ...(weather.state || { kind: 'clear', strength: 1 }) },
    clouds: weather.clouds == null ? null : { ...weather.clouds },
    wind: weather.wind == null ? null : { ...weather.wind },
    fog: weather.fog, aurora: weather.aurora, temp: weather.temp,
    surface: weathering ? { ...weathering.state } : {},
    force: weathering?.force == null ? null : { ...weathering.force },
    reflectionMode: reflections?.mode || settings.reflections || 'planar',
    ui: Object.fromEntries(['wx','wxs','cl','clc','wa','ws','fl','au','sf','ta','tv','cycle','hour'].map(k => {
      const el = probeEl.querySelector(`[data-${k}]`); return [k, el ? (el.type === 'checkbox' ? el.checked : el.value) : null];
    })),
    sync: probe.sync,
  });
  const restoreScenarioState = () => {
    const B = scenarioBench, old = B.saved;
    if (!old) { B.on = false; B.phase = 'idle'; return; }
    sky.cycle = false;
    sky.setHour(old.hour, true);
    weather.set(old.wx.kind || 'clear', old.wx.strength ?? 1, 0.2);
    weather.clouds = old.clouds; weather.wind = old.wind; weather.fog = old.fog; weather.aurora = old.aurora; weather.temp = old.temp;
    weather.retarget(0.2);
    if (weathering) {
      Object.assign(weathering.state, old.surface || {});
      // One forced update restores the snow-depth texture as well as surface uniforms.
      weathering.force = { ...(old.surface || {}) };
      B.clearRestoreForce = true; B.restoreForce = old.force; B.restoreForceDelay = 2;
    }
    sky.cycle = old.cycle;
    if (reflections) reflections.mode = old.reflectionMode || 'planar';
    for (const [k, value] of Object.entries(old.ui || {})) {
      const el = probeEl.querySelector(`[data-${k}]`);
      if (el && value != null) { if (el.type === 'checkbox') el.checked = !!value; else el.value = value; }
    }
    probe.sync = old.sync;
    B.on = false; B.phase = 'idle'; B.saved = null;
    probeEl.querySelector('[data-scenario-run]').disabled = false;
    scenarioStatus().textContent = 'Benchmark complete. Original time, weather, and surface settings restored.';
    resetGpuSamples();
  };
  const startScenarioBenchmark = () => {
    const B = scenarioBench;
    if (B.on || bench.on || !weather || !sky || !weathering) {
      scenarioStatus().textContent = 'Cannot start: finish the other benchmark first, and make sure weather/surface systems are available.';
      return;
    }
    const preset = scenarioPresets[probeEl.querySelector('[data-scenario]').value] || scenarioPresets['clear-noon'];
    B.saved = saveScenarioState();
    B.on = true; B.phase = 'warmup'; B.frame = 0;
    B.logic = []; B.submit = []; B.frameMs = []; B.calls = []; B.tris = [];
    B.report = ''; B.clearRestoreForce = false; B.restoreForce = null; B.restoreForceDelay = 0;
    probe.sync = true; sky.cycle = false; sky.setHour(preset.hour, true);
    weather.set(preset.weather, preset.strength, 0.15);
    weather.clouds = null; weather.wind = null; weather.fog = preset.fog || null; weather.aurora = null; weather.temp = preset.temp;
    weather.retarget(0.15);
    weathering.force = { ...surfacePresets[preset.surface] };
    // A puddle benchmark must actually exercise the mirror pass even if the player's saved option is Off/SSR.
    // Snow intentionally suppresses puddle reflections in reflections.js while the snow layer covers the ground.
    if (preset.surface === 'puddles' && reflections) reflections.mode = 'planar';
    const q = k => probeEl.querySelector(`[data-${k}]`);
    q('hour').value = preset.hour; q('cycle').checked = false;
    q('wx').value = preset.weather; q('wxs').value = preset.strength;
    q('cl').value = 'auto'; q('wa').checked = true; q('fl').value = preset.fog || 'auto'; q('au').value = 'auto';
    q('sf').value = preset.surface; q('ta').checked = false; q('tv').value = preset.temp;
    probeEl.querySelector('[data-scenario-run]').disabled = true;
    scenarioCopyButton().disabled = true;
    scenarioReportEl().textContent = '';
    scenarioStatus().textContent = `Preparing ${preset.label}: setting weather/surfaces instantly, warming shaders and reflections…`;
    resetGpuSamples();
  };
  probeEl.querySelector('[data-scenario-run]').addEventListener('click', startScenarioBenchmark);
  probeEl.querySelector('[data-scenario-copy]').addEventListener('click', async () => {
    const button = scenarioCopyButton();
    if (!scenarioBench.report) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(scenarioBench.report);
      else {
        const area = document.createElement('textarea'); area.value = scenarioBench.report;
        area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area);
        area.select(); const ok = document.execCommand('copy'); area.remove();
        if (!ok) throw new Error('Clipboard copy was blocked');
      }
      button.textContent = 'Copied!';
      setTimeout(() => { if (button.isConnected) button.textContent = 'Copy benchmark report'; }, 1600);
    } catch (err) {
      button.textContent = 'Copy failed — select report manually';
      console.warn('Could not copy scenario benchmark report', err);
    }
  });
  probeEl.addEventListener('click', e => { const id = e.target.dataset?.spawn; if (!id) return; const st = player.state, fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
    monsters.spawn(id, { x: st.pos.x + fx * 8, y: st.pos.y, z: st.pos.z + fz * 8, yaw: Math.atan2(-fx, -fz) }); });
  probeEl.addEventListener('click', e => { if (e.target.dataset.bench === undefined || bench.on || scenarioBench.on) return;
    Object.assign(bench, { on: true, i: -1, n: 0, acc: { l: 0, s: 0, g: 0, gk: 0, gr: 0, grk: 0, k: 0 }, res: [], sync: probe.sync }); probe.sync = true; resetGpuSamples(); benchEl().textContent = 'Measuring…'; });
  function benchStep(logic, submit) {
    const B = bench; B.n++; if (B.n > 40 && B.n < 130) { B.acc.l += logic; B.acc.s += submit; B.acc.k++; }
    if (B.n < 130 || (tq && tqList.some(item => item.benchAcc === B.acc))) return;
    const a = B.acc, r = { l: a.l / a.k, s: a.s / a.k, g: a.gk ? a.g / a.gk + (a.grk ? a.gr / a.grk : 0) : NaN, gm: a.gk ? a.g / a.gk : NaN, gr: a.grk ? a.gr / a.grk : NaN };
    if (B.i === -1) B.base = r; else { BENCH[B.i].on(); if (B.i < BENCH.length) B.res.push({ name: BENCH[B.i].name, ...r }); }
    B.i++; B.n = 0; B.acc = { l: 0, s: 0, g: 0, gk: 0, gr: 0, grk: 0, k: 0 };
    if (B.i >= BENCH.length) { B.on = false; probe.sync = B.sync; const b = B.base, f = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
      benchEl().textContent = `Baseline: GPU main+postFX ${b.gm.toFixed(2)} ms · reflections ${b.gr.toFixed(2)} ms · combined ${b.g.toFixed(2)} ms\nCPU ${(b.l + b.s).toFixed(2)} ms (game ${b.l.toFixed(2)}, sending ${b.s.toFixed(2)})\nWhat switching each off saves (positive = faster):\n` +
        B.res.map(q => ({ ...q, dg: b.g - q.g, dgm: b.gm - q.gm, dgr: b.gr - q.gr, dc: b.l + b.s - q.l - q.s })).sort((p, q) => (q.dg + q.dc) - (p.dg + p.dc)).map(q => `${q.name}: GPU ${f(q.dg)} ms (main ${f(q.dgm)}, reflections ${f(q.dgr)}) · CPU ${f(q.dc)} ms`).join('\n');
      return; }
    BENCH[B.i].off(); benchEl().textContent = `Measuring… ${B.i + 1} / ${BENCH.length}: ${BENCH[B.i].name}`;
  }
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const cpu0 = performance.now(); lapT = cpu0;
    if (traversalCapture.on) { traversalCapture.frameId++; traversalCapture.frameStages = { reflectionUpdateMs: 0, mainRenderMs: 0, shadowMapMs: 0, mainCallsMs: 0, reflectionCallsMs: 0, otherCallsMs: 0 }; traversalCapture.renderCallMs = 0; traversalCapture.frameGl = { glCalls: {}, glMs: {}, programsBefore: renderer.info.programs?.length ?? -1, geometriesBefore: renderer.info.memory.geometries, texturesBefore: renderer.info.memory.textures }; }
    if (dungeon) dungeonLights.update(now / 1000, player.state.pos, Math.min(0.1, (now - (frame.lastT || now)) / 1000), camera.getWorldDirection(camDir), activeCp?.id); frame.lastT = now;

    const rawFrameMs = Math.max(0, now - last); const dt = Math.min(0.05, rawFrameMs / 1000); last = now;
    lap('Lamps and torches');
    if (input.locked) {
      for (let i = 1; i <= 9; i++) if (input.pressed('hotbar' + i) && hotbar[i - 1]) { const id = hotbar[i - 1]; if (id.startsWith('spell:')) spells.request(id.slice(6), 'hotbar' + i); else drink(id); }
      if (input.pressed('inventory')) openInventory();
      if (input.pressed('checkpoint') && activeCp) respawn(activeCp, `Back to ${activeCp.name}.`);
      if (input.pressed('view')) { thirdPerson = !thirdPerson; tpWant = thirdPerson ? tpLast : 0; if (thirdPerson) tpCur = Math.max(tpCur, 0.8); toast(thirdPerson ? 'Third-person view' : 'First-person view'); }
      if (input.pressed('interact') && nearStation()) nearStation().open();
      wheelUpdate();
      combat.update(dt, input, allTargets(), true);
      comboHud.update(combat.timing);
      crossEl?.classList.toggle('recover', combat.recovering);
      castHud(spells.update(dt, input, allTargets(), true));
      // fixed small steps keep collisions solid at low frame rates
      const steps = Math.ceil(dt / 0.0084);
      refreshNear(player.state.pos.x, player.state.pos.z);
      if (weathering) groundEnv(dt);                                                     // the weather underfoot: snow depth, ice, wet (movement reads it)
      const pin = harvest.busy ? noJump : input;   // (while skinning, Space is the skill check, not a jump)
      for (let i = 0; i < steps; i++) player.update(dt / steps, pin, settings);
    }
    harvest.tap = input.pressed('jump');   // (read before the frame's presses are cleared)
    input.endFrame();
    lap('Moving, combat, spells');
    dummies.update(dt);
    if (!input.locked) { castHud(spells.update(dt, input, allTargets(), false)); if (wheel.open) wheelUpdate(); }
    { const r = spells.readied, lay = spells.layout(), box = $('.hud-spell'); box.hidden = !r; readiedEl.hidden = true;
      if (r && box.dataset.id !== r + !!lay) { const sp = SPELLS[r], pr = castProfile(character, sp, { focus: !!body?.gear.stats().focus }); box.dataset.id = r + !!lay;
        box.querySelector('.rune').className = `rune s-${sp.school}`; box.querySelector('.rune').textContent = SCHOOL_GLYPH[sp.school] || '✦';
        box.querySelector('b').textContent = sp.name; box.querySelector('small').textContent = lay ? `${Math.ceil(pr.mana)} MP · Q to change` : 'no focus in hand';
        box.classList.toggle('nofocus', !lay); } }
    { const ns = input.locked && !wheel.open && nearStation(); promptEl.textContent = ns ? `${keyName(input.bindings.interact[0])}: ${ns.name}` : ''; }
    regen(dt);
    if (input.locked) stealth(dt);
    lap('Stealth');
    if (input.locked) courseUpdate(dt);
    lap('World update total (incl. monsters)');
    { // sparkles on the routes you can use, near you (not the one you're on)
      const st = player.state, chest = { x: st.pos.x, y: st.pos.y + player.height * 0.6, z: st.pos.z }, pts = [];
      for (const r of routes) {
        if (st.trav?.r === r || (st.trav?.kind === 'hug' && r.kind === 'edge') || !hasNode(character, 'sneak', ROUTE_NODE[r.kind])) continue;
        const N = nearestOnRoute(r, chest); if (N.dist > 9) continue;
        pts.push({ ...N.point, y: N.point.y + (r.kind === 'edge' ? 0.15 : r.kind === 'spire' ? 0.25 : 0), d: N.dist });
      }
      pts.sort((p, q) => p.d - q.d); sparkles.update(pts, now / 1000);
    }
    // running water: how loud each kind is here, and from which side (src/game/ground.js lays out the sources)
    if (dungeon?.waterSounds?.length && (waterT = (waterT || 0) + dt) > 0.12) {
      waterT = 0; const p = player.state.pos, rx = Math.cos(player.state.yaw), rz = -Math.sin(player.state.yaw), L = { river: 0, rough: 0, fall: 0, gurgle: 0 }, Pn = { river: 0, rough: 0, fall: 0, gurgle: 0 }, RR = { river: 7, rough: 8, fall: 12, gurgle: 5 };
      for (const w of dungeon.waterSounds) { const dx = w.x - p.x, dy = w.y - p.y, dz = w.z - p.z, d = Math.hypot(dx, dy * 0.7, dz); if (d > RR[w.kind] * 3) continue; const v = w.s / (1 + (d / RR[w.kind]) ** 2); L[w.kind] += v; Pn[w.kind] += v * (dx * rx + dz * rz) / Math.max(1, d); }
      for (const k in L) { Pn[k] = L[k] > 0 ? Pn[k] / L[k] : 0; L[k] = 1 - Math.exp(-L[k]); }
      audio.water(L, Pn);
    }
    for (const e of player.state.events.splice(0)) {
      if (e.type === 'jump') audio.jump(acoustics());
      else if (e.type === 'land') { audio.land(acoustics(), e.impact, surfaceOf(player.state.surface).sound); landT = 0; landAmp = Math.min(0.85, 0.12 + e.impact / 16); }
      else if (e.type === 'splash') audio.splash(acoustics(), e.impact);
      else if (e.type === 'slide') audio.slide(acoustics(), surfaceOf(player.state.surface).sound);
      else if (e.type === 'slip') { audio.slide(acoustics(), 'stone'); toast?.(e.ice ? 'Your feet go out from under you on the ice' : 'You slip'); }
      else if (e.type === 'fall') hurt(e.dmg, `Fell ${e.height.toFixed(1)} m${e.rolled ? ' (rolled out: half damage)' : ''}`);
      else if (e.type === 'roll') audio.roll(acoustics());
      else if (e.type === 'leap' || e.type === 'twirl') audio.leap(acoustics());
      else if (e.type === 'vanish') toast('Vanished: unseen for 4 s while you stay crouched.');
      else if (e.type === 'route') { routeT = 0; routeAmp = e.fromAir ? 0.7 : 0.2; }
      else if (e.type === 'slip') { audio.slide(acoustics(), 'stone'); toast('You slip!'); }
      else if (e.type === 'stroke') audio.stroke(acoustics(), e.hard, e.under);
    }
    lap('Sparkles, sounds, events');
    stepMorph(dt);
    body?.setHairSimulationEnabled(thirdPerson); // first-person view hides the head only during rendering, so use camera mode, not mesh visibility
    placeBody(dt); if (bench.hideBody && body) body.root.visible = false;
    if (input.locked) harvest.update(dt, player.state, body); else harvest.cancel();   // (a body to skin: the prompt, the knife, the skill checks)
    // the swing's ghost: laid down while the blow is live (a little before its hit window to a little after)
    { const A = body?.combat?.action, live = A && A.type === 'attack' && !A.hold && (!A.hit || (A.u >= A.hit[0] - 0.14 && A.u <= A.hit[1] + 0.08));
      swingTrail.update(dt, live && settings.swingTrails !== false && body.combat.blade(trailB, trailT) ? { base: trailB, tip: trailT } : null, combat.swingType); }
    if (body && (bench.hideHair || bench.noBodyShadow)) body.root.traverse(o => { if (!o.isMesh) return; if (bench.hideHair && o.userData.hairCards) o.visible = false; if (bench.noBodyShadow) o.castShadow = false; });
    lap('Your body (pose)');
    player.applyCamera(camera, settings.headBob ?? 1);
    tpDt = dt; if (thirdPerson) placeThirdPerson();
    if (foliageBufferTest.active) {
      const elapsed = performance.now() - foliageBufferTest.started;
      foliageBufferTest.phase = elapsed < 2000 ? 'warmup' : elapsed < 10000 ? 'baseline-spin' : 'frozen-spin';
      if (foliageBufferTest.phase === 'warmup') camera.rotation.y = foliageBufferTest.startYaw;
      else { const phaseElapsed = foliageBufferTest.phase === 'baseline-spin' ? elapsed - 2000 : elapsed - 10000; camera.rotation.y = foliageBufferTest.startYaw + (phaseElapsed / 8000) * Math.PI * 2 * 4; }
      foliageBufferTest.status.textContent = foliageBufferTest.phase === 'warmup' ? 'Running · warm-up (2 s)…' : foliageBufferTest.phase === 'baseline-spin' ? `Running · normal culling (${Math.min(8, (elapsed - 2000) / 1000).toFixed(1)} / 8 s)` : `Running · culling frozen (${Math.min(8, (elapsed - 10000) / 1000).toFixed(1)} / 8 s)`;
    }
    if (body?.hairLOD) { const st = player.state, cd = thirdPerson ? Math.hypot(camera.position.x - st.pos.x, camera.position.y - st.pos.y - player.height * 0.95, camera.position.z - st.pos.z) : 0;
      body.hairLOD(cd); body.bodyLOD?.(cd);   // (the hair's and the body's detail by how far the camera is from you)
      const wv = weather?.windNow || 0, wd = sky?.weather?.windDir || [1, 0]; body.setWind(wd[0] * wv * 6, 0, wd[1] * wv * 6); }
    if (window.eldermerePlay?.debugCam) {     // testing: look at the player from outside
      const d = window.eldermerePlay.debugCam, st = player.state;
      eyeMarker.position.copy(camera.position); eyeMarker.visible = true;
      camera.position.set(st.pos.x + d[0], st.pos.y + d[1], st.pos.z + d[2]); camera.lookAt(st.pos.x, st.pos.y + (d[3] ?? 1.1), st.pos.z);
    } else eyeMarker.visible = false;
    { const sd = skyNow?.sunDir || { x: 0.6, y: 1, z: 0.4 }, k = 30 / Math.max(0.1, sd.y);          // the sun from the region's time of day
      camera.getWorldDirection(camDir); const fl = Math.hypot(camDir.x, camDir.z) || 1, ax = camera.position.x + camDir.x / fl * 18, az = camera.position.z + camDir.z / fl * 18;   // (the near box sits ahead of you: 22 m behind, 58 m ahead — where you look)
      const tx = 80 / 2048, cx = Math.round(ax / tx) * tx, cy = Math.round(camera.position.y / tx) * tx, cz = Math.round(az / tx) * tx;   // the shadow box follows in whole texels: no shimmer as you move
      sun.position.set(cx + sd.x * k, cy + 30, cz + sd.z * k); sun.target.position.set(cx, cy, cz);
      sunFar.castShadow = sun.castShadow && !bench.farOff; sunFar.visible = sun.visible;
      const cp = camera.position; if (Math.hypot(cp.x - farAt.x, cp.z - farAt.z) > 15 || now / 1000 - farAt.t > 1) {
        farAt = { x: cp.x, z: cp.z, t: now / 1000 }; const ft = 340 / 2048, fx0 = Math.round(cp.x / ft) * ft, fy0 = Math.round(cp.y / ft) * ft, fz0 = Math.round(cp.z / ft) * ft, kf = 200 / Math.max(0.1, sd.y);
        sunFar.position.set(fx0 + sd.x * kf, fy0 + 200, fz0 + sd.z * kf); sunFar.target.position.set(fx0, fy0, fz0); sunFar.updateMatrixWorld(); sunFar.target.updateMatrixWorld(); sunFar.shadow.needsUpdate = true; } }
    lap('Camera');
    weather?.update(dt, camera, now / 1000);                                                 // the weather, then the time of day under it
    lap('Weather (rain, clouds)');
    if (weathering && dungeonLights?.litLamps) weathering.setLamps(dungeonLights.litLamps);
    if (weathering && (frame.llT = (frame.llT || 0) + dt) > 2) { frame.llT = 0; weathering.lampLitScene(scene); }   // (new bodies and new gear: lit by the lamps too)   // the street lamps' light on the surfaces
    if (weathering) { const f = weather.falling; weathering.update(dt, camera, { rain: f.rain, rainK: f.rainK, snow: f.snow, sand: f.sand, sandCol: f.sandCol, sandHeavy: f.sandHeavy, skyColor: sky.state.fog, t: now / 1000, temp: weather.temperature, sun: sky.state.sun, wind: weather.windNow, windDir: sky.weather.windDir, cover: sky.weather.cover, sunDir: sky.state.sunDir }); }
    lap('Surfaces (snow, wet, lamp shadows)');
    sky.update(dt, camera, now / 1000);                                                      // the time of day (src/gfx/sky.js)
    lap('Sky');
    { const cp = camera.position, wv = water.find(w => cp.x > w.min[0] && cp.x < w.max[0] && cp.z > w.min[2] && cp.z < w.max[2] && cp.y < w.max[1] && cp.y > w.min[1] - 0.5);
      underEl.classList.toggle('on', !!wv);
      applySky(cp, !!wv); }
    camera.updateMatrixWorld();
    if (TG && camera.position.distanceToSquared(mirror.mesh.getWorldPosition(mirrorAt)) < 30 * 30) mirror.render(renderer, scene, camera);   // only when you're near enough to see it           // the mirror shows your whole self, face included
    lap('Mirror');
    if (!thirdPerson) body?.showHead(false);           // your own eyes don't see your head...
    if (probe.on || traversalCapture.on) { probeAcc.calls = 0; probeAcc.tris = 0; probeAcc.mainCalls = 0; }
    if (dungeonLights?.foliage && !foliageCullFreeze.frozen && !(foliageBufferTest.active && foliageBufferTest.phase === 'frozen-spin')) dungeonLights.foliage.cull(camera);
    refreshAssignmentPanel();                         // trees to their levels of detail (src/gfx/trees.js)
    lap('Trees (detail levels)');
    const cpu1 = performance.now();
    const reflectionQuery = startGpuQuery('reflection');
    const stageReflectionStart = traversalCapture.on ? performance.now() : 0;
    if (traversalCapture.on) traversalCapture.stage = 'reflections';
    if (reflections) { const st = player.state, gs = st.groundShape;                       // the puddles' mirror: the street / ground level you're on — standing on a crate, a step or a wall doesn't move it
      if (st.onGround && (reflY == null || gs?.terrain || gs?.path || Math.abs(st.pos.y - reflY) > 2.5)) reflY = st.pos.y;
      reflections.update(camera, reflY ?? st.pos.y); }
    if (traversalCapture.on) { traversalCapture.frameStages.reflectionUpdateMs = performance.now() - stageReflectionStart; traversalCapture.stage = ''; }
    endGpuQuery(reflectionQuery);
    { const t0 = performance.now(); particles.update(dt, camera); if (probe.on) probeLaps['Particles'] = (probeLaps['Particles'] || 0) * 0.9 + (performance.now() - t0) * 0.1; }
    const mainQuery = startGpuQuery('main');
    const stageMainStart = traversalCapture.on ? performance.now() : 0;
    if (traversalCapture.on) traversalCapture.stage = 'main+postFX';
    if (settings.postfx !== false && !fx.probeOff) fx.render(scene, camera, { bloom: skyNow?.bloom ?? 0.5, grade: skyNow?.grade || 'warm' }); else renderer.render(scene, camera);
    if (traversalCapture.on) { traversalCapture.frameStages.mainRenderMs = performance.now() - stageMainStart; traversalCapture.stage = ''; }
    endGpuQuery(mainQuery);
    body?.showHead(true);                              // ...but everything else (hair physics, mirrors) does
    const cpu2 = performance.now();
    while (tqList.length && glc.getQueryParameter(tqList[0].q, glc.QUERY_RESULT_AVAILABLE)) {
      const item = tqList.shift();
      if (!glc.getParameter(tq.GPU_DISJOINT_EXT)) {
        const gv = glc.getQueryParameter(item.q, glc.QUERY_RESULT) / 1e6;
        if (item.mode === gpuModeKey()) {
          if (item.captureFrameId != null) { const captured = traversalCapture.samples.find(q => q.frameId === item.captureFrameId); if (captured) captured[item.bucket === 'main' ? 'gpuMainMs' : 'gpuReflectionMs'] = gv; }
          const samples = probeInfo.gpuSamples[item.bucket]; samples.push(gv); if (samples.length > 30) samples.shift();
          probeInfo.gpuMain = median(probeInfo.gpuSamples.main); probeInfo.gpuReflection = median(probeInfo.gpuSamples.reflection);
          probeInfo.gpu = (Number.isFinite(probeInfo.gpuMain) ? probeInfo.gpuMain : 0) + (Number.isFinite(probeInfo.gpuReflection) ? probeInfo.gpuReflection : 0);
        }
        if (item.benchAcc) { if (item.bucket === 'main') { item.benchAcc.g += gv; item.benchAcc.gk++; } else { item.benchAcc.gr += gv; item.benchAcc.grk++; } }
      }
      glc.deleteQuery(item.q);
    }
    if (probe.on) { probeInfo.logic = (probeInfo.logic || 0) * 0.9 + (cpu1 - cpu0) * 0.1; probeInfo.submit = (probeInfo.submit || 0) * 0.9 + (cpu2 - cpu1) * 0.1; if (probe.sync) { if (!tq) glc.readPixels(0, 0, 1, 1, glc.RGBA, glc.UNSIGNED_BYTE, px1); } probeInfo.gpuWait = (probeInfo.gpuWait || 0) * 0.9 + (performance.now() - cpu2) * 0.1; }
    if (scenarioBench.on) {
      const B = scenarioBench;
      B.frame++;
      if (B.phase === 'warmup' && B.frame >= 120) {
        B.phase = 'measure'; B.frame = 0;
        B.logic = []; B.submit = []; B.frameMs = []; B.calls = []; B.tris = [];
        resetGpuSamples();
        scenarioStatus().textContent = 'Measuring 180 frames after warm-up…';
      } else if (B.phase === 'measure') {
        B.logic.push(cpu1 - cpu0); B.submit.push(cpu2 - cpu1); B.frameMs.push(rawFrameMs);
        B.calls.push(probeAcc.calls); B.tris.push(probeAcc.tris);
        if (B.frame >= 180) {
          const preset = scenarioPresets[probeEl.querySelector('[data-scenario]').value] || scenarioPresets['clear-noon'];
          const mainGpu = sortedMedian(probeInfo.gpuSamples.main), reflGpu = sortedMedian(probeInfo.gpuSamples.reflection);
          const cpuGame = sortedMedian(B.logic), cpuSend = sortedMedian(B.submit);
          const triMedian = sortedMedian(B.tris);
          B.report = [
            'ELDERMERE SCENARIO BENCHMARK',
            new Date().toLocaleString(),
            'Map: currently loaded map (not changed by benchmark)',
            `Scenario: ${preset.label}`,
            `Time: ${String(Math.floor(preset.hour)).padStart(2, '0')}:${String(Math.floor(preset.hour % 1 * 60)).padStart(2, '0')}`,
            `Weather: ${preset.weather} · intensity ${preset.strength}`,
            `Atmospheric haze prototype: ${atmosphereSettings.enabled ? `ON · start ${atmosphereSettings.start} · end ${atmosphereSettings.end} · strength ${atmosphereSettings.strength}` : 'OFF'}`,
            `Surface: ${preset.surface} · instant forced state`,
            `Reflections: ${preset.surface === 'puddles' ? 'planar mirror forced on for this test' : preset.surface === 'snow2' ? 'suppressed by snow cover (expected)' : (reflections?.mode || 'unavailable')}`,
            'Warm-up: 120 frames · measured: 180 frames',
            '',
            'PERFORMANCE (median / 95th percentile)',
            `Frame delta: ${fmtMs(sortedMedian(B.frameMs))} / ${fmtMs(percentile95(B.frameMs))}`,
            `CPU game: ${fmtMs(cpuGame)} / ${fmtMs(percentile95(B.logic))}`,
            `CPU draw submission: ${fmtMs(cpuSend)} / ${fmtMs(percentile95(B.submit))}`,
            `GPU main scene + postFX: ${fmtMs(mainGpu)}`,
            `GPU reflections: ${fmtMs(reflGpu)}`,
            `GPU measured total: ${fmtMs(Number.isFinite(mainGpu) && Number.isFinite(reflGpu) ? mainGpu + reflGpu : NaN)}`,
            `Draw calls per frame: ${Math.round(sortedMedian(B.calls))} median`,
            `Triangles per frame: ${Number.isFinite(triMedian) ? (triMedian / 1e6).toFixed(3) + 'M median' : 'unavailable'}`,
            `GPU timer samples: main ${probeInfo.gpuSamples.main.length}, reflections ${probeInfo.gpuSamples.reflection.length}`,
            '',
            'Notes: GPU values are asynchronous timer-query measurements when supported. CPU draw-submission time is not GPU time. FPS may be capped; compare timings with the same map, camera, resolution, and character/creature state.'
          ].join('\n');
          scenarioReportEl().textContent = B.report;
          scenarioCopyButton().disabled = false;
          scenarioStatus().textContent = 'Measurements collected. Restoring your original conditions…';
          restoreScenarioState();
        }
      }
    }
    if (scenarioBench.clearRestoreForce && weathering) {
      scenarioBench.restoreForceDelay--;
      if (scenarioBench.restoreForceDelay <= 0) {
        weathering.force = scenarioBench.restoreForce;
        scenarioBench.clearRestoreForce = false; scenarioBench.restoreForce = null;
      }
    }
    if (bench.on) benchStep(cpu1 - cpu0, cpu2 - cpu1);
    if (book.isOpen && body) renderFigure();
    if (book.isOpen) renderBeast(dt);
    const st = player.state, S = player.stats();
    bar.style.setProperty('--f', Math.max(0, Math.min(1, st.stamina / S.maxStamina)).toFixed(3));
    bar.classList.toggle('exhausted', st.exhausted);
    frames++; fpsT += dt; if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
    if (traversalCapture.on) {
      const pos = player.state.pos, nowMs = performance.now(), t = nowMs - traversalCapture.started;
      if (traversalCapture.lastPos) traversalCapture.distance += Math.hypot(pos.x - traversalCapture.lastPos.x, pos.z - traversalCapture.lastPos.z);
      traversalCapture.lastPos = { x: pos.x, z: pos.z };
      const turnDot = traversalCapture.lastCameraQ ? Math.max(-1, Math.min(1, Math.abs(camera.quaternion.dot(traversalCapture.lastCameraQ)))) : 1;
      const turnDeg = 2 * Math.acos(turnDot) * 180 / Math.PI;
      if (traversalCapture.lastCameraQ) traversalCapture.lastCameraQ.copy(camera.quaternion); else traversalCapture.lastCameraQ = camera.quaternion.clone();
      const stages = traversalCapture.frameStages || {}, glf = traversalCapture.frameGl || { glCalls: {}, glMs: {}, programsBefore: -1, geometriesBefore: 0, texturesBefore: 0 };
      const programsAfter = renderer.info.programs?.length ?? -1;
      if (traversalCapture.samples.length < traversalCapture.maxSamples) {
        traversalCapture.samples.push({ frameId: traversalCapture.frameId, gpuMainMs: NaN, gpuReflectionMs: NaN, t, elapsed: t / 1000, frameMs: rawFrameMs, logicMs: cpu1 - cpu0, submitMs: cpu2 - cpu1, reflectionUpdateMs: stages.reflectionUpdateMs || 0, mainRenderMs: stages.mainRenderMs || 0, shadowMapMs: stages.shadowMapMs || 0, renderCallMs: traversalCapture.renderCallMs || 0, mainCallsMs: stages.mainCallsMs || 0, reflectionCallsMs: stages.reflectionCallsMs || 0, otherCallsMs: stages.otherCallsMs || 0, turnDeg, calls: probeAcc.calls, tris: probeAcc.tris, programsBefore: glf.programsBefore, programsAfter, programDelta: glf.programsBefore >= 0 && programsAfter >= 0 ? programsAfter - glf.programsBefore : 0, geometriesDelta: renderer.info.memory.geometries - glf.geometriesBefore, texturesDelta: renderer.info.memory.textures - glf.texturesBefore, glCalls: { ...glf.glCalls }, glMs: { ...glf.glMs }, testPhase: foliageBufferTest.active ? foliageBufferTest.phase : null, x: pos.x, y: pos.y, z: pos.z });
      } else { traversalCapture.dropped++; finishTraversalCapture(); }
      traversalCapture.frameGl = null;
      if (foliageBufferTest.active && t >= foliageBufferTest.durationMs) {
        foliageBufferTest.active = false; foliageBufferTest.phase = 'complete'; camera.rotation.y = foliageBufferTest.startYaw;
        finishTraversalCapture(); foliageBufferTest.button.disabled = false; foliageBufferTest.status.textContent = 'Complete · compare baseline-spin vs frozen-spin in the report.';
      } else if (t >= 300000 && traversalCapture.on) finishTraversalCapture();
      else if (traversalCapture.on) traversalStatus.textContent = `CAPTURING · ${(t/1000).toFixed(0)} s · ${traversalCapture.samples.length} frames · ${traversalCapture.distance.toFixed(0)} m travelled`;
    }
    if (probe.on) { probeInfo.calls = probeAcc.calls; probeInfo.tris = probeAcc.tris; probeInfo.mainCalls = probeAcc.mainCalls; probeInfo.otherCalls = Math.max(0, probeAcc.calls - probeAcc.mainCalls); probeInfo.ms = probeInfo.ms * 0.9 + dt * 1000 * 0.1;
      if (frames === 0) { let pl = 0; scene.traverse(o => { if (o.isPointLight && o.visible) pl++; }); { const hh = sky.hour, hi = probeEl.querySelector('[data-hour]'); if (document.activeElement !== hi) hi.value = hh; probeEl.querySelector('.pp-hour').textContent = `${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.floor(hh % 1 * 60)).padStart(2, '0')} · ${sky.state.phase.name}`; }
        probeEl.querySelector('.pp-stats').innerHTML = `<b style="font-size:16px">${fps} fps</b> · ${probeInfo.ms.toFixed(1)} ms<br>${probeInfo.calls} draw calls (main-scene passes ${probeInfo.mainCalls} · other scenes ${probeInfo.otherCalls}) · ${(probeInfo.tris / 1e6).toFixed(2)}M triangles<br>CPU: game ${(probeInfo.logic || 0).toFixed(1)} ms · sending draws ${(probeInfo.submit || 0).toFixed(1)} ms${probe.sync ? (tq ? ` · GPU ${(Number.isFinite(probeInfo.gpu) ? probeInfo.gpu : 0).toFixed(2)} ms total (median: main/postFX ${(Number.isFinite(probeInfo.gpuMain) ? probeInfo.gpuMain : 0).toFixed(2)} + reflections ${(Number.isFinite(probeInfo.gpuReflection) ? probeInfo.gpuReflection : 0).toFixed(2)}; ${probeInfo.gpuSamples.main.length}/${probeInfo.gpuSamples.reflection.length} samples)` : ` · waiting on GPU ${(probeInfo.gpuWait || 0).toFixed(1)} ms`) : ''}<br>(left over: ${Math.max(0, probeInfo.ms - (probeInfo.logic || 0) - (probeInfo.submit || 0) - (probe.sync && !tq ? probeInfo.gpuWait || 0 : 0)).toFixed(1)} ms, waiting for the next screen refresh or the GPU)<br>${pl} point lights in the shaders · ${renderer.info.programs.length} shaders${weathering ? `<br>${weather.temperature.toFixed(0)}°C · wet ${(weathering.state.wet * 100) | 0}% · puddles ${(weathering.state.puddle * 100) | 0}% · gutters ${(weathering.state.gutter * 100) | 0}% · snow ${(weathering.state.snow * 100) | 0}% · dust ${(weathering.state.dust * 100) | 0}%` : ''}<br><span style="opacity:.8;font-size:12px">Game time by part: ${Object.entries(probeLaps).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')}${body?.perf ? `<br>Body (its own loop): cloth ${(body.perf.clothMs || 0).toFixed(1)} · hair ${(body.perf.hairSimMs || 0).toFixed(1)} · tail/cape ${(body.perf.tailCapeMs || 0).toFixed(1)} ms` : ''}</span>${body?.hairDebug ? (() => { const h = body.hairDebug(); return `<br><span style="opacity:.8;font-size:12px">Hair: ${h.info ? `${h.info.cards} cards, ${h.info.guides} guides` : 'not grown'} · ${h.vis ? 'shown' : 'hidden'} · detail ${h.lod} · body detail ${body.bodyLevel ?? 0}</span>`; })() : ''}${probeInfo.shaderErr ? `<br><span style="color:#ff8a8a;font-size:12px">Shader error: ${probeInfo.shaderErr.replace(/</g, '&lt;')}</span>` : ''}`; if (!probeEl.querySelector('.pp-full').hidden) probeEl.querySelector('.pp-full-content').innerHTML = fullMonitorHtml(); } }
    dbg.textContent = `${fps} fps · ${Math.hypot(st.vel.x, st.vel.z).toFixed(1)} m/s${st.sprinting ? ' · sprint' : ''}${st.crouching ? ' · crouch' : ''}${st.sitting ? ' · sitting' : ''}${st.onGround ? '' : ' · air'}${loadFactor < 1 ? ' · overloaded' : ''}`;
  }
  requestAnimationFrame(frame);

  // a stray Ctrl+W outside fullscreen asks before closing the page instead of losing the game
  const guardClose = e => { e.preventDefault(); e.returnValue = ''; };
  addEventListener('beforeunload', guardClose);
  function stop() {
    removeEventListener('beforeunload', guardClose);
    removeEventListener('keydown', probeKeyHandler);
    running = false; input.unlock(); input.dispose(); removeEventListener('resize', resize); removeEventListener('keydown', invKeys);
    mirror.dispose(); audio.dispose();
    if (body) { scene.remove(body.root); body.dispose(); body = null; }
    renderer.dispose(); renderer.forceContextLoss();
  }
  // for testing: drive the player without pointer lock
  window.eldermerePlay = { monsters, particles, swingTrail, harvest, inv, debuff, audio, get thirdPerson() { return thirdPerson; }, set thirdPerson(v) { thirdPerson = v; tpWant = v ? tpLast : 0; tpCur = v ? tpLast : 0; }, sun, sunFar, player, input, scene, camera, renderer, sky, weather, weathering, reflections, settings, get enemies() { return enemies; }, stop, drink, openInventory, openRack, vitals, get body() { return body; }, character, inv, sentry, sentries, projectiles, routes, hazards, combat, dummies, spells, get poisonT() { return poisonT; }, setThirdPerson(v) { thirdPerson = v; } };
  return { stop };
}
