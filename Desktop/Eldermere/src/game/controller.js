// src/game/controller.js — the first-person player: look, move, sprint, crouch, jump, gravity,
// stairs and slopes, with speed, jump height and stamina from the character's stats.
import { surfaceOf } from '../data/surfaces.js';
import { ROUTE_NODE, nearestOnRoute, routePoint, routeLength } from './traverse.js';
import { BODY, groundAt, resolveWalls, headroom, ceilingAt, slopeOf, ledgeAhead, edgeAhead, climbAhead, lineBlocked, wallNear, waterAt, clearAt } from './physics.js';
import { hasNode, treeState } from '../data/skillTrees.js';
import { effectiveMain, derived, train } from '../rpg/stats.js';

export const MOVE = {
  walk: 4.2,            // m/s at Speed 100 (a brisk game walk; 'walk' key slows to a stroll)
  sprint: 1.7,          // × walk
  crouch: 0.5,          // × walk
  stroll: 0.45,         // × walk, holding the walk key
  accel: 40, airAccel: 6, friction: 12,
  gravity: 22,          // a little heavier than real, as games do, so jumps feel crisp
  jumpHeight: 1.05,     // m at Strength 100
  sprintCost: 9, jumpCost: 12,        // stamina per second sprinting, per jump
  regenDelay: 0.8,                    // seconds after spending before stamina refills
  coyote: 0.1,          // seconds you can still jump after running off an edge
  buffer: 0.12,         // seconds a jump pressed just before landing is remembered
};

export function createController(character, shapes, opts = {}) {
  const st = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: opts.yaw ?? Math.PI, pitch: 0,
    onGround: false, crouch: 0, crouching: false, sitting: false, sit: 0, sprinting: false, stamina: 0, exhausted: false, sinceSpend: 9,
    bob: 0, sprintDist: 0, events: [], surface: 'grass', swimming: false, wade: 0, breath: 1, underwater: false, swimDist: 0, move: null, wallN: null, wallT: 9, wallRun: null, wjCool: 0, lastGround: null, sinceGround: 0, jumpQueued: 9 };
  Object.assign(st.pos, opts.start || {});
  { const g = groundAt(shapes, st.pos.x, st.pos.z, st.pos.y + 0.5); if (g.shape) { st.pos.y = g.y; st.onGround = true; } }   // start standing
  let height = opts.height ?? BODY.height;              // standing height from the character's body
  // Everything movement does comes from stats (see docs/CONTROLS.md):
  //   walk speed   Speed                          sprint   Speed, Athletics, Dexterity (footwork)
  //   jump height  Strength, Dexterity, Athletics stamina  Endurance (max), Endurance + Speed (refill)
  //   sprint cost  Endurance and Athletics (fitter bodies spend less)
  const stats = () => {
    const m = effectiveMain(character), d = derived(character), ath = (character.skills.athletics ?? 100) / 100;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const load = opts.load ? opts.load() : 1;           // carrying more than you can: slower, and no sprinting past a quarter over
    const speedMul = clamp(Math.sqrt(m.speed / 100), 0.5, 2.5) * load;
    const sprintMul = clamp(MOVE.sprint * Math.pow(ath, 0.12) * Math.pow(m.dexterity / 100, 0.08), 1.3, 2.4);
    const jumpMul = clamp(Math.pow(m.strength / 100, 0.35) * Math.pow(m.dexterity / 100, 0.1) * Math.pow(ath, 0.1), 0.6, 2.2);
    const maxStamina = d.maxStamina * (1 + (ath - 1) * 0.15);
    const sprintCost = MOVE.sprintCost * Math.pow(100 / Math.max(1, m.endurance), 0.5) * Math.pow(1 / ath, 0.25);
    return { speedMul, sprintMul: load < 0.84 ? 1 : sprintMul, jumpMul: jumpMul * Math.max(0.5, load), maxStamina, regen: d.staminaRegen * Math.pow(ath, 0.35), sprintCost, load };   // fitter: refills faster (Athletics 300: about 1.5×)
  };
  st.stamina = stats().maxStamina;
  // what you carry, as a fraction of what you can (src/rpg/carry.js): heavy packs sink you in water,
  // slow your climbing and tire your grip
  const loadFrac = () => { const c = opts.carry ? opts.carry() : null; return c && c.cap > 0 ? Math.max(0, c.kg / c.cap) : 0; };
  const climbSlow = () => 1 + 0.6 * Math.min(1.5, loadFrac());
  const gripCost = () => Math.pow(0.85, treeState(character, 'athletics').nodes.grip || 0);
  // ---- noise (see src/rpg/stealth.js) ----
  // st.noise: how far (m) the body's sound carries this moment, before surface, weight, gear and Sneak.
  // A steady part from how you're moving, plus spikes from jumps, landings and athletics moves.
  st.noise = 0; st.noiseSpike = 0;
  const spike = (m, onGround = true) => { st.noiseSpike = Math.max(st.noiseSpike, m * (onGround ? surfaceOf(st.surface).noise : 1)); };
  // ---- falls ----
  // A fall hurts past a safe height: 4 m, plus 3 m per rank of Featherfall. 6% of max health per metre
  // beyond it. Shallow water softens it; pressing dodge just before landing rolls out of it for half.
  const FALL = { safe: 4, perRank: 3, perMetre: 0.06 };
  st.fallFrom = st.pos.y;
  let crouchToggle = false, sprintToggle = false;

  // ---- athletics moves (src/data/skillTrees.js, athletics tree) ----
  // Vault and clamber are known from the start; wall jump, quick climb and wall run are bought.
  // Every move is faster with more Athletics.
  const ATH = { vaultReach: 0.58, clamberReach: 1.0, quickReach: 1.25, vaultTime: 0.45, clamberTime: 1.3, vaultCost: 6, clamberCost: 15, wallJumpCost: 10, wallRunCost: 10 };
  // Movement trains Athletics and Swimming at the usual (active) pace, but only a small share spills into
  // Strength, Endurance and the rest: you're moving all the time, so the full spill built bodies in minutes
  // (about 400 points an hour). With this share, an hour of hard parkour or swimming adds about 7 Endurance
  // at average, less the closer you are to your body's limit (see docs/STATS.md).
  const MOVE_STAT_SHARE = 0.02;
  // Moving around builds Endurance only (not Strength), tapering toward the body's limit.
  const trainMove = (skill, amount) => train(character, skill, amount, { statScale: MOVE_STAT_SHARE, stats: ['endurance'], approach: true });
  // how steep the ground under you is (degrees): a ramp's own slope, else from the ground's height around you
  const slopeHere = () => { const g = st.groundShape; if (g?.rise) return slopeOf(g) * 180 / Math.PI;
    const h = (dx, dz) => { const r = groundAt(shapes, st.pos.x + dx, st.pos.z + dz, st.pos.y + 0.6); return r.shape ? r.y : st.pos.y; };
    const dd = (a, b) => Math.abs(a - b) > 0.3 ? 0 : a - b, gx = dd(h(0.4, 0), h(-0.4, 0)) / 0.8, gz = dd(h(0, 0.4), h(0, -0.4)) / 0.8;   /* (a step, a kerb, isn't a slope) */ return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI; };
  const athSpeed = () => Math.max(0.7, Math.min(2.5, Math.sqrt((character.skills.athletics ?? 100) / 100)));
  const has = id => hasNode(character, 'athletics', id);
  const pay = n => { if (st.stamina < n * 0.5) return false; st.stamina = Math.max(0, st.stamina - n); st.sinceSpend = 0; return true; };
  // try a vault or clamber toward (dx, dz); returns true if one started
  // fromY: the height reach is measured from (the takeoff, while still rising from a jump at a wall)
  // Facing rules: climbing (clamber, running up) only toward what you face; a vault works ahead or to
  // the side, never behind you.
  const facingDot = (dx, dz) => dx * -Math.sin(st.yaw) + dz * -Math.cos(st.yaw);
  function tryTraverse(dx, dz, inAir, fromY = st.pos.y, jumpedAt = false) {
    const face = facingDot(dx, dz); if (face < -0.2) return false;
    const L = ledgeAhead(shapes, st.pos.x, st.pos.z, dx, dz, st.pos.y, height, inAir ? 0.35 : 0.9); if (!L) return false;
    L.h = L.top - fromY;
    const quick = has('quickClimb'), sp = athSpeed();
    if ((!inAir || jumpedAt) && L.h <= height * ATH.vaultReach && (L.beyond || L.deep)) {
      if (!pay(ATH.vaultCost)) return false;
      // a vault carries you forward at your own speed (at least a brisk jog): up over the top and out the far
      // side still moving, then you drop and land under ordinary physics. Onto a deep block, you end on top.
      const hs = Math.max(Math.hypot(st.vel.x, st.vel.z), 3.6 * Math.sqrt(sp)) / (1 + 0.3 * Math.min(1.5, loadFrac()));
      const to = L.deep ? { x: L.inX, z: L.inZ, y: L.top } : { x: L.beyond.x, z: L.beyond.z, y: L.top + 0.08 };
      const dist = Math.hypot(to.x - st.pos.x, to.z - st.pos.z);
      st.move = { type: 'vault', t: 0, dur: Math.max(0.22, dist / hs), from: { ...st.pos }, to, peak: L.top + 0.22, keep: hs * (has('freeRunner') ? 1 : 0.9), dx, dz, airOut: !L.deep };
      spike(7); trainMove('athletics', 0.3); return true;
    }
    if (face > 0.7 && L.deep && L.h <= height * (quick ? ATH.quickReach : ATH.clamberReach) && (!inAir || quick || jumpedAt)) {
      if (!pay(ATH.clamberCost * gripCost())) return false;
      st.move = { type: 'clamber', t: 0, dur: ATH.clamberTime / sp / (quick ? 2 : 1) * climbSlow(), from: { ...st.pos }, to: { x: L.inX, z: L.inZ, y: L.top }, dx, dz };
      spike(6); trainMove('athletics', 0.5); return true;
    }
    return false;
  }
  // Grabbing reaches well ahead of you (about 1.1 m) but only straight in front, and pulls you in to
  // the edge, Mirror's Edge style.
  function grabLedge(dirs, bonus = 0, climb = true, canHang = true) {
    for (const [dx, dz] of dirs) if (grabLedgeDir(dx, dz, bonus, climb, canHang)) return true;
    return false;
  }
  // bonus: extra reach (× height), e.g. right after running up or along a wall
  // climb: true pulls straight up when it can (moving into the ledge, or carried by a wall run); otherwise,
  // or when the ledge is out of clamber reach or too thin to stand on, you catch the edge and hang
  function grabLedgeDir(dx, dz, bonus = 0, climb = true, canHang = true) {
    if ((st.grabCool || 0) > 0) return false;
    const L = ledgeAhead(shapes, st.pos.x, st.pos.z, dx, dz, st.pos.y, height, 1.1);      // reaches about 1.1 m ahead
    if (climb && L && L.deep && L.top >= st.pos.y + 0.1) {
      const quick = has('quickClimb'), cat = has('ledgeCatch');
      const fromJump = L.top - (st.takeoffY ?? st.pos.y) <= height * ((quick ? ATH.quickReach : ATH.clamberReach) + bonus) && st.vel.y > -4;
      // Cat's catch reaches well above you (arms overhead plus a pull): 1.5× your height
      const reachUp = (quick || cat) && L.top - st.pos.y <= height * ((cat ? 1.5 : 1.25) + bonus) && (cat || st.vel.y > -1.5);
      if ((fromJump || reachUp) && pay(ATH.clamberCost * gripCost())) {
        const carry = Math.hypot(st.vel.x, st.vel.z);
        st.move = { type: 'clamber', t: 0, dur: ATH.clamberTime / athSpeed() / (quick ? 2 : 1) * climbSlow(), from: { ...st.pos }, to: { x: L.inX, z: L.inZ, y: L.top }, dx, dz,
          keep: Math.min(carry, MOVE.walk * 1.2) * (has('freeRunner') ? 1 : 0.6) };
        spike(6); trainMove('athletics', 0.5); return true;
      }
    }
    return canHang && tryHang(dx, dz, bonus);
  }
  // Catch any edge your hands reach: arms overhead are about 1.3× your height above your feet (1.5× with
  // Cat's catch, which also catches you falling fast). Thin edges work: lips, fence and wall tops.
  // You only hang where there's a drop below you; anything you could stand under is climbed or vaulted.
  function tryHang(dx, dz, bonus = 0) {
    const cat = has('ledgeCatch');
    if (!cat && st.vel.y < -4) return false;
    const E = edgeAhead(shapes, st.pos.x, st.pos.z, dx, dz, st.pos.y, height, 0.9, height * ((cat ? 1.5 : 1.3) + bonus));
    if (!E || E.top < st.pos.y + height * 0.9) return false;
    const hangY = E.top - height * HANG.reach, hx = st.pos.x + dx * E.dist, hz = st.pos.z + dz * E.dist;
    const under = groundAt(shapes, hx, hz, hangY + 0.05);
    if (under.shape && under.y >= hangY - 0.05) return false;
    st.hang = { top: E.top, dx, dz, t: 0 }; st.pos.x = hx; st.pos.z = hz; st.pos.y = hangY;
    st.vel.x = st.vel.y = st.vel.z = 0; st.wallRun = null; st.wallClimb = null; spike(4, false); trainMove('athletics', 0.2);
    return true;
  }
  // ---- climbing (Climbing skill and tree; surfaces in src/data/surfaces.js) ----
  // Hold jump in the air facing a climbable wall (or press jump standing at one) to grab on. On the wall the
  // keys are relative to it: forward/back climb up and down, left/right move across. Crouch lets go, back +
  // jump kicks off. Reaching the top pulls you over when there's room to stand.
  // Grip: (Climbing/100)^0.35 against each surface's difficulty (vines 0.5, rough stone 0.8, wet stone 1.5,
  // ice 2.4). Past your grip you slip now and then: a drop and a stamina cost; out of stamina you fall.
  const CLIMB = { speed: 1.0, drain: 4, hold: 1.5, slipRate: 0.35, slipDrop: 0.8, slipCost: 6 };
  const hasC = id => hasNode(character, 'climbing', id), rankC = id => character.skillTrees?.climbing?.nodes?.[id] ?? 0;
  const climbOf = sh => surfaceOf(sh?.surface).climb;
  const isClimbable = sh => !!climbOf(sh);
  const climbGrip = () => Math.pow(Math.max(1, character.skills.climbing ?? 100) / 100, 0.35);
  const trainClimb = amount => train(character, 'climbing', amount, { statScale: MOVE_STAT_SHARE, stats: ['strength', 'endurance'], approach: true });
  // a hold for the hands: a climbable face ahead covering the hands' height (about 0.75–0.95 of your height
  // above your feet at y), up to maxAhead from the body. On natural rock the face steps in and out; climbing
  // follows it by snapping to whatever the hands find.
  const handProbe = (x, z, dx, dz, y, maxAhead = 0.75) => climbAhead(shapes, x, z, dx, dz, y, height, maxAhead, isClimbable, [y + height * 0.75, y + height * 0.95]);
  // what's ahead of the hands: a hold, or something that isn't climbable in the way first (a shelf overhead,
  // smooth rock). { hold, block }
  const notClimbable = sh => !isClimbable(sh);
  // Probed from a point a metre back from the body, so rock bulging out toward you is found (and followed
  // outward) instead of being missed or climbed into.
  const PROBE_BACK = 1.0;
  const probe = (x, z, dx, dz, y, test, band, ahead) => {
    const r = climbAhead(shapes, x - dx * PROBE_BACK, z - dz * PROBE_BACK, dx, dz, y, height, ahead + PROBE_BACK, test, band);
    if (r) r.dist -= PROBE_BACK; return r;
  };
  function holdAt(x, z, dx, dz, y) {
    const band = [y + height * 0.75, y + height * 0.95];
    const hold = probe(x, z, dx, dz, y, isClimbable, band, 0.75);
    const bandB = [band[0], y + height * 1.04];                           // in the way: up to just over the head
    let block = probe(x, z, dx, dz, y, notClimbable, bandB, 0.75);
    // directly overhead counts too (a shelf sticking out over you): anything solid over the body at hand height
    for (const sh of shapes) if (!isClimbable(sh) && sh.max[1] > bandB[0] && sh.min[1] < bandB[1] && x > sh.min[0] - 0.2 && x < sh.max[0] + 0.2 && z > sh.min[2] - 0.2 && z < sh.max[2] + 0.2) { block = { shape: sh, dist: -1 }; break; }
    if (block && (!hold || block.dist < hold.dist - 0.05)) return { hold: null, block };
    return { hold, block: null };
  }
  // stand on top of a shape (a shelf) from below it: the nearest spot on its top with room for the body,
  // working outward from the wall
  function standOn(sh, nx, nz) {
    for (let k = 0; k <= 12; k++) {
      const x = Math.max(sh.min[0] + 0.3, Math.min(sh.max[0] - 0.3, st.pos.x + nx * k * 0.1)), z = Math.max(sh.min[2] + 0.3, Math.min(sh.max[2] - 0.3, st.pos.z + nz * k * 0.1));
      if (clearAt(shapes, x, z, sh.max[1], height)) return { x, z };
    }
    return null;
  }
  function tryClimb(dx, dz) {
    if ((st.grabCool || 0) > 0) return false;
    const C = holdAt(st.pos.x, st.pos.z, dx, dz, st.pos.y).hold;
    if (!C || C.dist > 0.5 || (C.n.x * -dx + C.n.z * -dz) < 0.6) return false;   // in reach and roughly facing it
    // grabbing on while falling: you skid down the face before your grip holds (further on slick rock, less
    // with skill); a fast fall costs stamina as you brake
    const fallV = Math.max(0, -st.vel.y);
    st.climb = { shape: C.shape, n: C.n, t: 0, dist: 0, slip: 0, leap: null, skid: fallV > 2.5 ? fallV : 0 };
    if (C.shape.field) {                                                   // natural rock: climb on the surface itself
      const F = C.shape.field; st.climb.field = F; st.climb.u = Math.max(F.u0, Math.min(F.u1, F.uOf ? F.uOf(st.pos.x, st.pos.z) : st.pos.x)); st.climb.v = st.pos.y + height * FIELD_GRIP;
      placeOnField(st.climb); st.vel.x = st.vel.y = st.vel.z = 0; st.wallRun = null; st.wallClimb = null; st.onGround = false; spike(4, false); return true;
    }
    st.pos.x -= C.n.x * C.dist - C.n.x * 0.02; st.pos.z -= C.n.z * C.dist - C.n.z * 0.02;   // against the face
    st.vel.x = st.vel.y = st.vel.z = 0; st.wallRun = null; st.wallClimb = null; st.onGround = false;
    spike(4, false); return true;
  }
  // A climbing leap (Dyno, Side leap) in three beats, Conan Exiles style: coil (feet up, arms pull you in,
  // a dip toward the rock) · spring (legs drive, arms reach, the body flies to the new hold) · catch (hands
  // bite, a little sag, feet find the rock). Returns how far along the flight is (0..1) and the dip/sag (m).
  const LEAP = { coil: 0.17, settle: 0.18 };
  function leapStep(L, dt) {
    L.el = (L.el || 0) + dt; const T = LEAP.coil + L.dur + LEAP.settle;
    L.p = Math.min(1, L.el / T); L.a = LEAP.coil / T; L.b = (LEAP.coil + L.dur) / T;
    if (L.el < LEAP.coil) return { e: 0, dip: 0.13 * Math.sin(Math.PI / 2 * L.el / LEAP.coil), done: false };
    const k = Math.min(1, (L.el - LEAP.coil) / L.dur);
    if (k < 1) return { e: 1 - (1 - k) * (1 - k), dip: 0.13 * (1 - k) * (1 - k), done: false };
    const s = (L.el - LEAP.coil - L.dur) / LEAP.settle;
    return { e: 1, dip: 0.07 * Math.sin(Math.PI * Math.min(1, s)), done: s >= 1 };
  }
  function climbUpdate(dt, input, S) {
    if (st.climb.field) return fieldUpdate(dt, input, S);
    const c = st.climb, sf = climbOf(c.shape) || { difficulty: 1, speed: 1, drain: 1, slip: 1 }; c.t += dt;
    const dx = -c.n.x, dz = -c.n.z, tx = -dz, tz = dx;                        // into the wall, and to the right along it
    st.vel.x = st.vel.y = st.vel.z = 0; st.onGround = false; st.sliding = false; st.sinceGround = 0; st.fallFrom = st.pos.y;
    st.surface = c.shape.surface;
    const grip = climbGrip(), lf = loadFrac();
    const up = (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0), side = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    const moving = !!(up || side) && !c.slip && !c.leap;
    // stamina: moving costs more on harder surfaces, holding still a little (nothing on easy ones with Resting hold)
    const hard = hasC('overhang') ? Math.min(1, sf.drain) : sf.drain;
    const costMul = gripCost() * Math.pow(0.85, rankC('enduring')) * (1 + lf) / Math.sqrt(grip);
    const drain = moving ? CLIMB.drain * hard * costMul : (hasC('restHold') && sf.difficulty <= 0.8 ? 0 : CLIMB.hold * hard * costMul * Math.pow(0.8, rankC('steadyHold')));
    st.stamina = Math.max(0, st.stamina - drain * dt); st.sinceSpend = 0;
    const letGo = (push = 0.5) => { st.climb = null; st.grabCool = 0.45; st.vel.x = c.n.x * push; st.vel.z = c.n.z * push; };
    if (st.stamina <= 0) { letGo(0.3); return; }
    if (input.pressed('crouch')) { letGo(); return; }
    // kick off backward
    if (input.pressed('jump') && up < 0) {
      // anyone can hop off; Push off throws you twice as far, and holding jump catches a wall you're thrown at
      const po = hasC('pushOff') && pay(8), far = po ? 2 : 1;
      letGo(4.5 * far); st.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight * S.jumpMul) * (0.75 + 0.15 * far);
      if (po) { st.grabCool = 0.12; st.climbFly = { x: c.n.x, z: c.n.z, t: 1.2 }; }
      spike(8, false); st.events.push({ type: po ? 'leap' : 'jump' }); return;
    }
    // a skid after catching on mid-fall: braking down the face
    if (c.skid > 0) {
      const decel = 14 * Math.min(2.5, grip) / (sf.difficulty + 0.3) * (hasC('catchSlip') ? 1.4 : 1);
      const ny = st.pos.y - c.skid * dt, g = groundAt(shapes, st.pos.x, st.pos.z, st.pos.y);
      st.stamina = Math.max(0, st.stamina - c.skid * 0.8 * dt);
      if (g.shape && ny <= g.y + 0.02) {                     // hit the ground still skidding: land with what's left
        st.pos.y = g.y + 0.03; st.vel.y = -c.skid; st.fallFrom = st.pos.y + c.skid * c.skid / (2 * MOVE.gravity); st.climb = null; return;
      }
      const P = holdAt(st.pos.x, st.pos.z, dx, dz, ny);
      if (!P.hold) { st.climb = null; st.vel.y = -c.skid; st.fallFrom = st.pos.y + c.skid * c.skid / (2 * MOVE.gravity); st.grabCool = 0.3; return; }   // skidded off the holds
      st.pos.y = ny; st.pos.x += dx * (P.hold.dist - 0.02); st.pos.z += dz * (P.hold.dist - 0.02);
      c.skid = Math.max(0, c.skid - decel * dt); st.noise = 6; if (c.skid === 0) spike(4, false);
      return;
    }
    // a slip in progress: sliding down a little, then you catch yourself
    if (c.slip > 0) {
      c.slip = Math.max(0, c.slip - dt); const drop = CLIMB.slipDrop * (hasC('catchSlip') ? 0.5 : 1) / 0.3;
      const ny = st.pos.y - drop * dt, g = groundAt(shapes, st.pos.x, st.pos.z, st.pos.y);
      if (g.shape && ny <= g.y) { st.pos.y = g.y; st.climb = null; st.onGround = true; return; }
      st.pos.y = ny; return;
    }
    // a leap (Dyno up, Side leap across) in progress
    if (c.leap) {
      const L = c.leap, { e, dip, done } = leapStep(L, dt);
      st.pos.x = L.from.x + (L.to.x - L.from.x) * e; st.pos.y = L.from.y + (L.to.y - L.from.y) * e - dip; st.pos.z = L.from.z + (L.to.z - L.from.z) * e;
      if (done) c.leap = null; return;
    }
    // leaps
    if (input.pressed('jump')) {
      const onWall = (x, y, z) => handProbe(x, z, dx, dz, y, 0.6);
      if (side && hasC('wallLeap') && pay(10)) {
        // the furthest wall within 3 m to that side (more of this one, or the next across a gap); nothing
        // there, and you leap off into the air that way, ready to catch whatever you reach (hold jump)
        st.events.push({ type: 'leap' }); spike(7, false); trainClimb(0.5);
        for (let d = 3; d >= 0.5; d -= 0.25) {
          const x = st.pos.x + tx * side * d, z = st.pos.z + tz * side * d, C = onWall(x, st.pos.y, z);
          if (C && !wallBetween(st.pos, x, z)) { c.leap = { t: 0, side, dur: 0.22 + 0.06 * d, from: { ...st.pos }, to: { x: x + dx * (C.dist - 0.02), y: st.pos.y + 0.25, z: z + dz * (C.dist - 0.02) } }; c.shape = C.shape; return; }
        }
        st.climb = null; st.grabCool = 0.15; st.climbFly = { x: tx * side, z: tz * side, face: { x: dx, z: dz }, t: 1.0 };
        st.vel.x = tx * side * 5 - c.n.x * 0.4; st.vel.z = tz * side * 5 - c.n.z * 0.4; st.vel.y = 3.5; return;
      } else if (hasC('dyno') && pay(12)) {
        let best = null;                                                     // the highest hold within 1.5 m above
        for (let h = 0.25; h <= 1.5; h += 0.25) { const H = handProbe(st.pos.x, st.pos.z, dx, dz, st.pos.y + h); if (H) best = { h, H }; else break; }
        if (best) { c.leap = { t: 0, side: 0, dur: 0.3, from: { ...st.pos }, to: { x: st.pos.x + dx * (best.H.dist - 0.02), y: st.pos.y + best.h, z: st.pos.z + dz * (best.H.dist - 0.02) } }; c.shape = best.H.shape; spike(6, false); trainClimb(0.5); }
        return;
      }
    }
    // Slick walls (wet stone, ice) pull you down whenever you aren't climbing up: you sink slowly while holding
    // still or moving across, faster when climbing down. Grip slows it (half at Climbing ~1000); Wet grip and
    // Ice climber halve it on their surface; Unfalling stops it.
    if (sf.slide && up <= 0 && !hasC('neverFall')) {
      let rate = sf.slide * Math.max(0.15, 1 - (grip - 1) * 0.4);
      if (sf.wet && hasC('wetGrip')) rate *= 0.5; if (sf.ice && hasC('iceClimber')) rate *= 0.5;
      const ny = st.pos.y - rate * dt, g = groundAt(shapes, st.pos.x, st.pos.z, st.pos.y + 0.05);
      if (g.shape && ny <= g.y + 0.02) { st.pos.y = g.y; st.climb = null; st.onGround = true; return; }
      st.pos.y = ny; c.sinking = rate;
    } else c.sinking = 0;
    if (!moving) return;
    // slipping: chance per second past your grip (half while holding still, which we aren't here)
    // past your grip you slip more and more; vines can tear however good you are (a small chance, less with grip)
    let slip = (Math.max(0, sf.difficulty - grip) * CLIMB.slipRate * sf.slip + (sf.baseSlip || 0) / grip) * Math.pow(0.8, rankC('chalk'));
    if (sf.wet && hasC('wetGrip')) slip *= 0.5; if (sf.ice && hasC('iceClimber')) slip *= 0.5; if (hasC('neverFall')) slip = 0;
    if (Math.random() < slip * dt) {
      c.slip = 0.3; st.stamina = Math.max(0, st.stamina - CLIMB.slipCost * (hasC('catchSlip') ? 0.5 : 1)); spike(5, false); st.events.push({ type: 'slip' }); return;
    }
    // move along the wall
    const sp = CLIMB.speed * (0.75 + 0.25 * Math.min(3, grip)) * (hasC('lizard') ? 1.2 : sf.speed) * (sf.ice && hasC('iceClimber') ? 1.3 : 1)
      * (1 + 0.1 * rankC('quickHands')) * (hasC('spider') ? 1.3 : 1) / climbSlow();
    const len = Math.hypot(up, side), my = up / len * sp * dt, ms = side / len * sp * dt;
    let ny = st.pos.y + my, nx = st.pos.x + tx * ms, nz = st.pos.z + tz * ms;
    // down to the ground: step off
    const g = groundAt(shapes, st.pos.x, st.pos.z, st.pos.y + 0.05);
    if (my < 0 && g.shape && ny <= g.y + 0.02) { st.pos.y = g.y; st.climb = null; st.onGround = true; return; }
    if (ms && blockedAlong(Math.sign(side), Math.abs(ms))) { nx = st.pos.x; nz = st.pos.z; }
    // the hands need a hold where you're going: follow the face in and out as it steps
    let P = holdAt(nx, nz, dx, dz, ny);
    if (!P.hold && ms) { nx = st.pos.x; nz = st.pos.z; P = holdAt(nx, nz, dx, dz, ny); }    // the face ends to that side
    // nothing straight up or down: reach for a hold a little to either side and drift toward it
    if (!P.hold && !P.block && my) {
      for (const off of [0.3, -0.3, 0.6, -0.6]) {
        const ox = st.pos.x + tx * off, oz = st.pos.z + tz * off, Q = holdAt(ox, oz, dx, dz, ny);
        if (Q.hold && !blockedAlong(Math.sign(off), Math.abs(off))) { const k = Math.min(1, sp * dt / Math.abs(off)); nx = st.pos.x + tx * off * k; nz = st.pos.z + tz * off * k; P = holdAt(nx, nz, dx, dz, ny); break; }
      }
    }
    const H = P.hold;
    if (!H) {
      if (my > 0) {
        const mantle = to => {
          st.move = { type: 'clamber', t: 0, dur: (hasC('fluidClimb') ? 0.25 : ATH.clamberTime / athSpeed()) * climbSlow(), from: { ...st.pos }, to, dx, dz, keep: hasC('fluidClimb') ? 2 : 0 };
          st.climb = null; spike(6); trainClimb(1);
        };
        // something in the way overhead (a shelf): up onto it if it's within reach
        // A shelf overhead: reach out round its front edge first, then pull up onto it (not through it)
        const B = P.block;
        if (B && B.shape.max[1] - st.pos.y <= height * 1.4) {
          const sh = B.shape, at = standOn(sh, c.n.x, c.n.z);
          if (at) {
            const via = { x: st.pos.x, y: Math.min(st.pos.y, sh.min[1] - height - 0.02), z: st.pos.z };
            if (c.n.x) via.x = (c.n.x > 0 ? sh.max[0] : sh.min[0]) + c.n.x * (BODY.radius + 0.12);
            if (c.n.z) via.z = (c.n.z > 0 ? sh.max[2] : sh.min[2]) + c.n.z * (BODY.radius + 0.12);
            mantle({ x: at.x, z: at.z, y: sh.max[1] }); st.move.via = via; st.move.dur *= 1.4; return;
          }
        }
        // nothing above for the hands: the top. Pull over onto it if there's room to stand
        const E = !B && edgeAhead(shapes, st.pos.x, st.pos.z, dx, dz, st.pos.y, height, 1.2, height * 1.4);
        if (E && E.stand) { mantle({ x: E.stand.x, z: E.stand.z, y: E.stand.y ?? E.top }); return; }
      }
      return;                                              // no hold that way (smooth rock, an overhang out of reach): stay put
    }
    { const snap = Math.max(-2.5 * dt, Math.min(2.5 * dt, H.dist - 0.02)); nx += dx * snap; nz += dz * snap; } c.shape = H.shape;   // ease in and out with the rock
    const moved = Math.hypot(nx - st.pos.x, ny - st.pos.y, nz - st.pos.z);
    st.pos.x = nx; st.pos.y = ny; st.pos.z = nz;
    c.dist += moved; st.bob += moved * 2; st.noise = 2.5 * surfaceOf(c.shape.surface).noise;
    if (c.dist >= 2) { c.dist -= 2; trainClimb(0.5 + sf.difficulty * 0.5); }
  }
  // ---- climbing natural rock (a surface field, e.g. src/game/cliff.js) ----
  // The climber holds the surface at chest height (u along it, v up it) and stays pressed to it, turned and
  // tilted to face it: over bulges, into hollows, up the underside of an overhang. Speed is measured along the
  // rock, so steep bulges take longer. The rest is as on any wall: grip and slips, slick rock pulling you down,
  // skids, leaps, shelves and pulling over the top.
  const FIELD_GRIP = 0.62, FIELD_OFF = BODY.radius + 0.06;
  function placeOnField(c, u = c.u, v = c.v) {
    const F = c.field, p = F.point(u, v), n = F.normal(u, v);
    c.n3 = n; c.n = { x: -F.into.x, z: -F.into.z };
    st.pos.x = p.x + n.x * FIELD_OFF; st.pos.z = p.z + n.z * FIELD_OFF; st.pos.y = p.y + n.y * FIELD_OFF - height * FIELD_GRIP;
  }
  // is (u, v) somewhere you can hold: on the rock, climbable, nothing solid in the way (a shelf), not past the top?
  function fieldFree(c, u, v) {
    const F = c.field;
    if (u < F.u0 || u > F.u1 || v < (F.bot ? Math.min(F.bot(u), F.v1) : F.v0)) return 'edge';   // (a terrain cliff's foot and top vary along it)
    if (v + height * 0.33 > (F.top ? F.top(u) : F.v1)) return 'top';
    if (!climbOf({ surface: F.material(u, v) })) return 'smooth';
    const p = F.point(u, v), n = F.normal(u, v), x = p.x + n.x * FIELD_OFF, z = p.z + n.z * FIELD_OFF, y = p.y + n.y * FIELD_OFF - height * FIELD_GRIP;
    for (const sh of shapes) if (!sh.field && !isClimbable(sh) && sh.max[1] > y + height * 0.5 && sh.min[1] < y + height * 1.04 && x > sh.min[0] - 0.25 && x < sh.max[0] + 0.25 && z > sh.min[2] - 0.25 && z < sh.max[2] + 0.25) return { block: sh };
    return null;
  }
  function fieldUpdate(dt, input, S) {
    const c = st.climb, F = c.field; c.t += dt;
    const sf = climbOf({ surface: F.material(c.u, c.v) }) || { difficulty: 1, speed: 1, drain: 1, slip: 1 };
    st.vel.x = st.vel.y = st.vel.z = 0; st.onGround = false; st.sliding = false; st.sinceGround = 0; st.fallFrom = st.pos.y;
    st.surface = F.material(c.u, c.v);
    const grip = climbGrip(), lf = loadFrac(), dx = F.into.x, dz = F.into.z;
    const up = (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0), side = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    const moving = !!(up || side) && !c.slip && !c.leap && !c.skid;
    const hard = hasC('overhang') ? Math.min(1, sf.drain) : sf.drain, n3 = F.normal(c.u, c.v);
    // overhangs are harder: the more the rock faces down, the more it costs to hang on
    const steep = 1 + Math.max(0, -n3.y) * 1.5;
    const costMul = gripCost() * Math.pow(0.85, rankC('enduring')) * (1 + lf) / Math.sqrt(grip) * steep;
    const drain = moving ? CLIMB.drain * hard * costMul : (hasC('restHold') && sf.difficulty <= 0.8 && steep < 1.2 ? 0 : CLIMB.hold * hard * costMul * Math.pow(0.8, rankC('steadyHold')));
    st.stamina = Math.max(0, st.stamina - drain * dt); st.sinceSpend = 0;
    // leaving the rock: if the body ended up inside the cliff's collision (the drawn rock bulges and recedes, the
    // collision is blockier), step it straight out from the face until it's clear, so it never pops out behind
    const exitRock = () => { if (!F.uOf) return; for (let k = 0; k <= 40; k++) { const x = st.pos.x - F.into.x * k * 0.1, z = st.pos.z - F.into.z * k * 0.1; if (clearAt(shapes, x, z, st.pos.y, height)) { st.pos.x = x; st.pos.z = z; return; } } };
    const letGo = (push = 0.5) => { exitRock(); st.climb = null; st.grabCool = 0.45; st.vel.x = n3.x * push; st.vel.z = n3.z * push; st.vel.y = Math.min(0, n3.y * push); };
    const offRock = (v0) => { exitRock(); st.climb = null; st.vel.y = -v0; st.fallFrom = st.pos.y + v0 * v0 / (2 * MOVE.gravity); st.grabCool = 0.3; };
    const ground = () => { const g = groundAt(shapes, st.pos.x, st.pos.z, st.pos.y + 0.05); return g.shape ? g.y : -Infinity; };
    if (st.stamina <= 0) { letGo(0.3); return; }
    if (input.pressed('crouch')) { letGo(); return; }
    if (input.pressed('jump') && up < 0) {                                  // kick off, along the rock's normal
      const po = hasC('pushOff') && pay(8), far = po ? 2 : 1;
      letGo(4.5 * far); st.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight * S.jumpMul) * (0.75 + 0.15 * far);
      if (po) { st.grabCool = 0.12; st.climbFly = { x: n3.x, z: n3.z, t: 1.2 }; }
      spike(8, false); st.events.push({ type: po ? 'leap' : 'jump' }); return;
    }
    // sliding down the rock (skid after a catch, a slip, or slick rock): v goes down, the body follows the face
    const sinkTo = (dv) => {
      const nv = c.v - dv;
      if (fieldFree(c, c.u, nv) === 'edge' || nv - height * FIELD_GRIP <= ground() + 0.02) { placeOnField(c, c.u, Math.max(nv, F.v0)); return 'ground'; }
      if (fieldFree(c, c.u, nv)) return 'off';
      c.v = nv; placeOnField(c); return null;
    };
    if (c.skid > 0) {
      const decel = 14 * Math.min(2.5, grip) / (sf.difficulty + 0.3) * (hasC('catchSlip') ? 1.4 : 1);
      st.stamina = Math.max(0, st.stamina - c.skid * 0.8 * dt);
      const r = sinkTo(c.skid * dt);
      if (r === 'ground') { const g = ground(); if (g > -Infinity) st.pos.y = Math.max(st.pos.y, g + 0.03); offRock(c.skid); return; }
      if (r === 'off') { offRock(c.skid); return; }
      c.skid = Math.max(0, c.skid - decel * dt); st.noise = 6; return;
    }
    if (c.slip > 0) {
      c.slip = Math.max(0, c.slip - dt);
      const r = sinkTo(CLIMB.slipDrop * (hasC('catchSlip') ? 0.5 : 1) / 0.3 * dt);
      if (r === 'ground') { exitRock(); st.climb = null; st.onGround = true; } else if (r === 'off') offRock(2);
      return;
    }
    if (c.leap) {
      const L = c.leap, { e, dip, done } = leapStep(L, dt);
      placeOnField(c, L.u0 + (L.u1 - L.u0) * e, L.v0 + (L.v1 - L.v0) * e - dip);
      if (done) { c.u = L.u1; c.v = L.v1; c.leap = null; } return;
    }
    if (input.pressed('jump')) {
      const ts = -1;                                                        // 'right' (facing the rock) runs toward -u here
      if (side && hasC('wallLeap') && pay(10)) {
        st.events.push({ type: 'leap' }); spike(7, false); trainClimb(0.5);
        for (let d = 3; d >= 0.5; d -= 0.25) { const u1 = c.u + side * ts * d; if (!fieldFree(c, u1, c.v + 0.25)) { c.leap = { t: 0, side, dur: 0.22 + 0.06 * d, u0: c.u, v0: c.v, u1, v1: c.v + 0.25 }; return; } }
        st.climb = null; st.grabCool = 0.15; st.climbFly = { x: side * ts, z: 0, face: { x: dx, z: dz }, t: 1.0 };
        st.vel.x = side * ts * 5 + n3.x * 0.4; st.vel.z = n3.z * 0.4; st.vel.y = 3.5; return;
      } else if (hasC('dyno') && pay(12)) {
        let best = 0; for (let h = 0.25; h <= 1.5; h += 0.25) { if (!fieldFree(c, c.u, c.v + h)) best = h; else break; }
        if (best) { c.leap = { t: 0, side: 0, dur: 0.3, u0: c.u, v0: c.v, u1: c.u, v1: c.v + best }; spike(6, false); trainClimb(0.5); }
        return;
      }
    }
    // slick rock pulls you down when you aren't climbing up
    if (sf.slide && up <= 0 && !hasC('neverFall')) {
      let rate = sf.slide * Math.max(0.15, 1 - (grip - 1) * 0.4);
      if (sf.wet && hasC('wetGrip')) rate *= 0.5; if (sf.ice && hasC('iceClimber')) rate *= 0.5;
      const r = sinkTo(rate * dt); if (r === 'ground') { exitRock(); st.climb = null; st.onGround = true; return; } if (r === 'off') { offRock(rate); return; }
    }
    if (!moving) return;
    let slip = (Math.max(0, sf.difficulty - grip) * CLIMB.slipRate * sf.slip + (sf.baseSlip || 0) / grip) * Math.pow(0.8, rankC('chalk')) * steep;
    if (sf.wet && hasC('wetGrip')) slip *= 0.5; if (sf.ice && hasC('iceClimber')) slip *= 0.5; if (hasC('neverFall')) slip = 0;
    if (Math.random() < slip * dt) { c.slip = 0.3; st.stamina = Math.max(0, st.stamina - CLIMB.slipCost * (hasC('catchSlip') ? 0.5 : 1)); spike(5, false); st.events.push({ type: 'slip' }); return; }
    // move along the rock: the step is measured on the surface, so it takes longer over a steep bulge
    const sp = CLIMB.speed * (0.75 + 0.25 * Math.min(3, grip)) * (hasC('lizard') ? 1.2 : sf.speed) * (sf.ice && hasC('iceClimber') ? 1.3 : 1)
      * (1 + 0.1 * rankC('quickHands')) * (hasC('spider') ? 1.3 : 1) / climbSlow();
    const len = Math.hypot(up, side), step = sp * dt / len;
    const dv = up * step / Math.hypot(1, n3.dv), du = -side * step / Math.hypot(1, n3.du);   // right (facing the rock) is −u
    let nu = c.u + du, nv = c.v + dv;
    let why = fieldFree(c, nu, nv);
    if (why && du && dv) { if (!fieldFree(c, c.u, nv)) { nu = c.u; why = null; } else if (!fieldFree(c, nu, c.v)) { nv = c.v; why = null; } }   // slide along what stops you
    if (why) {
      if (up > 0 && (why === 'top' || why.block)) {
        const mantle = (to, via) => {
          st.move = { type: 'clamber', t: 0, dur: (hasC('fluidClimb') ? 0.25 : ATH.clamberTime / athSpeed()) * climbSlow() * (via ? 1.4 : 1), from: { ...st.pos }, to, dx, dz, keep: hasC('fluidClimb') ? 2 : 0, via };
          st.climb = null; spike(6); trainClimb(1);
        };
        if (why.block && why.block.max[1] - st.pos.y <= height * 1.4) {      // a shelf overhead: round its edge, then up onto it
          const sh = why.block, at = standOn(sh, -dx, -dz);
          if (at) {
            const via = { x: st.pos.x, y: Math.min(st.pos.y, sh.min[1] - height - 0.02), z: st.pos.z };
            if (dx) via.x = (dx < 0 ? sh.max[0] : sh.min[0]) - dx * (BODY.radius + 0.12);
            if (dz) via.z = (dz < 0 ? sh.max[2] : sh.min[2]) - dz * (BODY.radius + 0.12);
            mantle({ x: at.x, z: at.z, y: sh.max[1] }, via); return;
          }
        }
        if (why === 'top') {                                                 // over the top onto the plateau
          const E = edgeAhead(shapes, st.pos.x, st.pos.z, dx, dz, st.pos.y, height, 1.6, height * 1.4);
          if (E && E.stand) { mantle({ x: E.stand.x, z: E.stand.z, y: E.stand.y ?? E.top }); return; }
        }
      }
      return;                                                                // smooth rock, the end of the face, no room: stay put
    }
    // stepping down onto the ground at the foot of the cliff
    const p = F.point(nu, nv), n = F.normal(nu, nv), feet = p.y + n.y * FIELD_OFF - height * FIELD_GRIP;
    if (dv < 0 && feet <= ground() + 0.02) { placeOnField(c, nu, nv); st.pos.y = Math.max(st.pos.y, ground()); exitRock(); st.climb = null; st.onGround = true; return; }
    const ox = st.pos.x, oy = st.pos.y, oz = st.pos.z;
    c.u = nu; c.v = nv; placeOnField(c);
    const moved = Math.hypot(st.pos.x - ox, st.pos.y - oy, st.pos.z - oz);
    c.dist += moved; st.bob += moved * 2; st.noise = 2.5 * surfaceOf(st.surface).noise;
    if (c.dist >= 2) { c.dist -= 2; trainClimb(0.5 + sf.difficulty * 0.5); }
  }
  // anything solid between here and (x, z) at chest height (so a leap never passes through a wall)
  function wallBetween(p, x, z) {
    return lineBlocked(shapes.filter(sh => sh !== st.climb?.shape), { x: p.x, y: p.y + height * 0.6, z: p.z }, { x, y: p.y + height * 0.6, z });
  }
  function blockedAlong(sgn, d) {
    const c = st.climb; if (!c) return false;
    const tx = c.n.z, tz = -c.n.x;                                        // right along the wall (facing it)
    const x = st.pos.x + tx * sgn * d + c.n.x * 0.04, z = st.pos.z + tz * sgn * d + c.n.z * 0.04;
    const w = resolveWalls(shapes, x, z, st.pos.y, height);
    return Math.abs((w.x - x) * tx + (w.z - z) * tz) > 0.005;
  }
  // ---- thief's routes (src/game/traverse.js; Sneak tree) ----
  // Press E near a sparkling route (or hold jump in the air close to one) to take it. On a route the movement
  // keys work along it, from where you're looking. Jump leaps off (toward where you look), crouch lets go.
  //   pole: forward/back climb, left/right circle round it; a spire on top to perch on
  //   pipe: hang and shimmy · rope: walk it (crouch on a downhill wire to slide, with Wire slide)
  //   spire: perch; jump to leap (Spire hop: higher) · hug: back to a wall, sidle along it (ledges too narrow to walk)
  // Moving on a route is quiet and hard to see (play.js stealth), and trains Sneak (and Athletics, for the hybrid ones).
  const routes = opts.routes || [];
  const hasN = id => hasNode(character, 'sneak', id);
  const routeOk = r => hasN(ROUTE_NODE[r.kind]);
  const trainSneak = (amount, hybrid) => { train(character, 'sneak', amount, { statScale: MOVE_STAT_SHARE, stats: ['dexterity'], approach: true }); if (hybrid) trainMove('athletics', amount * 0.5); };
  const TRAV = { snap: 1.4, snapAir: 2.0, pole: 1.3, spin: 2.2, pipe: 1.1, rope: 0.55, hug: 1.5, hugGap: 0.2 };
  // the nearest usable route in reach of the body (chest height), or a wall to hug
  // where a twirl aims: feet onto ropes, pipes and spires (you land on top of them)
  function twirlTarget(r) {
    const chest = { x: st.pos.x, y: st.pos.y + height * 0.6, z: st.pos.z }, N = nearestOnRoute(r, chest), p = N.point;
    if (r.kind === 'pole') return { x: p.x, y: p.y - height * 0.6, z: p.z };
    return { x: p.x, y: p.y + 0.05, z: p.z };
  }
  function findRoute(inAir, reachOverride) {
    const reach = (reachOverride ?? (inAir ? TRAV.snapAir : TRAV.snap)) * (hasN('shadowDancer') ? 2 : 1);
    const chest = { x: st.pos.x, y: st.pos.y + height * 0.6, z: st.pos.z }, feet = { x: st.pos.x, y: st.pos.y, z: st.pos.z };
    let best = null;
    for (const r of routes) {
      if (!routeOk(r) || r.kind === 'edge') continue;
      // feet to a rope or spire (you land on them), hands to a pipe, chest to a pole
      if (reachOverride && r.kind === 'pole') continue;                       // no twirling onto poles: just grab them
      if (r === st.lastRoute?.r) continue;                                     // the one you just left, until you're clear of it
      let from = reachOverride ? chest : r.kind === 'spire' ? feet : chest;   // a twirl looks from the chest
      let N = nearestOnRoute(r, from);
      if (reachOverride) {                                                     // precision jumps only go where you're looking: in front of you
        const tx = N.point.x - st.pos.x, tz = N.point.z - st.pos.z, tl = Math.hypot(tx, tz);
        if (tl > 0.4 && (tx * -Math.sin(st.yaw) + tz * -Math.cos(st.yaw)) / tl < 0.55) continue;
      }
      if (!reachOverride && (r.kind === 'rope' || r.kind === 'pipe')) {      // stand on it (feet) or hang from it (hands): whichever is nearer
        const Nf = nearestOnRoute(r, feet), Nh = nearestOnRoute(r, { ...chest, y: st.pos.y + height * 1.1 });
        N = Nf.dist <= Nh.dist ? Nf : Nh;
      }
      if (r.kind === 'spire' && !reachOverride) {
        if (!inAir && st.pos.y < r.y - 0.6) continue;                         // spires are landed on from above or beside
        // passing over a spire catches it: measured across, as long as you're no more than 2 m above its tip
        if (st.pos.y >= r.y - 0.4) N.dist = Math.hypot(st.pos.x - r.x, st.pos.z - r.z) + Math.max(0, st.pos.y - r.y - 2);
      }
      if (N.dist < reach && (!best || N.dist < best.N.dist)) best = { r, N };
    }
    return best;
  }
  function takeRoute(r, N, how = null) {
    const T0air = !st.onGround && !st.trav, from = { ...st.pos }, wasOn = !!st.trav;
    st.trav = { r, kind: r.kind, s: N.s, t: 0, dist: 0, ang: Math.atan2(st.pos.z - (r.z ?? 0), st.pos.x - (r.x ?? 0)), slide: 0 };
    st.vel.x = st.vel.y = st.vel.z = 0; st.wallRun = null; st.wallClimb = null; st.slideRun = null; st.onGround = false;
    if (r.kind === 'spire') st.trav.s = 0;
    // ropes and pipes: on top if you come from above (and can balance), hanging below if you come from under it
    if (r.kind === 'rope' || r.kind === 'pipe') {
      const p = nearestOnRoute(r, st.pos).point, below = st.pos.y < p.y - 0.5;
      st.trav.hang = below ? hasN('poleRunner') : !hasN('tightrope');
    }
    placeOnRoute(); spike(2, false); st.events.push({ type: 'route', kind: r.kind, fromAir: !!st.twirl || T0air }); st.twirl = null;
    // moving from one route to another (or a quick grab from nearby): a short animated hop to the new spot
    if (how || wasOn) startTrans(from, how || 'hop');
  }
  function hugWall() {
    const w = wallNear(shapes, st.pos.x, st.pos.z, st.pos.y, height, 0.45);
    if (!w || !st.onGround) return false;
    st.trav = { kind: 'hug', n: { x: w.x, z: w.z }, t: 0, dist: 0 };
    st.pos.x -= w.x * (w.d - (TRAV.hugGap - BODY.radius)) ; st.pos.z -= w.z * (w.d - (TRAV.hugGap - BODY.radius));
    st.vel.x = st.vel.z = 0; spike(1); return true;
  }
  function placeOnRoute() {
    const T = st.trav, r = T.r;
    if (T.kind === 'pole') { const off = r.r + 0.3; st.pos.x = r.x + Math.cos(T.ang) * off; st.pos.z = r.z + Math.sin(T.ang) * off; st.pos.y = T.s; }
    else if (T.kind === 'pipe' || T.kind === 'rope') { const p = routePoint(r, T.s); st.pos.x = p.x; st.pos.z = p.z; st.pos.y = p.y - (T.slide ? height * 1.15 : T.hang ? height * 1.22 : 0); }
    else if (T.kind === 'spire') { st.pos.x = r.x; st.pos.z = r.z; st.pos.y = r.y; }
  }
  const leaveRoute = () => { st.lastRoute = st.trav?.r ? { r: st.trav.r, t: 0 } : null; st.trav = null; st.grabCool = 0.35; };
  // an animated move from `from` to where the route has just put you: a hop (between routes), a climb up
  // (hanging → on top, going round the side), or a drop (on top → hanging, round the side)
  function startTrans(from, pose) {
    const T = st.trav, to = { ...st.pos }, d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (d < 0.12) return;
    let side = null;
    if ((pose === 'up' || pose === 'down') && T.r?.a) {                    // go round the rope or pipe, not through it
      const L = routeLength(T.r), dx = (T.r.b[0] - T.r.a[0]) / L, dz = (T.r.b[2] - T.r.a[2]) / L, sg = Math.sin(st.yaw) * dz - Math.cos(st.yaw) * -dx > 0 ? 1 : -1;
      side = { x: -dz * 0.45 * sg, z: dx * 0.45 * sg };
    }
    T.trans = { t: 0, dur: pose === 'up' ? 0.55 : pose === 'down' ? 0.4 : Math.max(0.25, Math.min(0.6, d / 3.5)), from, to, pose, side, arc: pose === 'hop' ? Math.min(0.5, 0.2 + d * 0.15) : 0 };
    st.pos.x = from.x; st.pos.y = from.y; st.pos.z = from.z;
  }
  function stepTrans(dt) {
    const T = st.trav, X = T.trans; X.t = Math.min(1, X.t + dt / X.dur);
    const u = X.t, e = u * u * (3 - 2 * u), a = X.from, b = X.to;
    let y = a.y + (b.y - a.y) * e + Math.sin(Math.PI * u) * X.arc;
    if (X.pose === 'up') y = a.y + (b.y - a.y) * Math.min(1, u / 0.7) ** 0.8;              // haul up, then onto it
    if (X.pose === 'down') y = a.y + (b.y - a.y) * Math.max(0, (u - 0.25) / 0.75) ** 1.3;   // swing off the side, then lower
    const sw = X.side ? Math.sin(Math.PI * u) : 0;
    st.pos.x = a.x + (b.x - a.x) * e + (X.side ? X.side.x * sw : 0); st.pos.z = a.z + (b.z - a.z) * e + (X.side ? X.side.z * sw : 0); st.pos.y = y;
    st.vel.x = st.vel.y = st.vel.z = 0; st.fallFrom = st.pos.y;
    if (X.t >= 1) { T.trans = null; placeOnRoute(); }
  }
  // moving straight on to another route from where you are (the top of a pole, the end of a pipe…):
  // the nearest usable one within reach of point p, other than the one you're on
  function transferNear(p, reach, kinds) {
    let best = null;
    for (const r of routes) {
      if (r === st.trav?.r || !routeOk(r) || r.kind === 'edge' || (kinds && !kinds.includes(r.kind))) continue;
      const N = nearestOnRoute(r, p); if (N.dist < reach && (!best || N.dist < best.N.dist)) best = { r, N };
    }
    if (!best) return false;
    if (best.r.kind === 'pole') best.N.s = Math.min(best.r.y1 - height * 0.9, Math.max(best.r.y0, p.y - height * 1.1));
    takeRoute(best.r, best.N); return true;
  }
  function travUpdate(dt, input, S, wx, wz, len) {
    const T = st.trav; T.t += dt;
    if (T.trans) { stepTrans(dt); return; }
    // E on a route takes another one in reach (pole to pipe, rope to spire...)
    if (T.kind !== 'hug' && input.pressed('interact')) { const R = findRoute(false); if (R && R.r !== T.r) { takeRoute(R.r, R.N); return; } }
    st.vel.y = 0; st.sinceGround = 0; st.fallFrom = st.pos.y; st.sliding = false;
    const fdx = -Math.sin(st.yaw), fdz = -Math.cos(st.yaw);
    const slow = hasN('catBalance') ? 1.8 : 1, lf = 1 / climbSlow();
    let moved = 0;
    const leap = (mul = 1, upMul = 1) => {                                   // jump off toward where you're looking
      const k = mul * (T.kind === 'pole' || T.kind === 'pipe' ? (hasN('poleSwing') ? 1.5 : 1) : T.kind === 'spire' ? (hasN('spireHop') ? 1.3 : 1) : 1);
      leaveRoute(); st.onGround = false;
      const hv = T.kind === 'spire' ? 5 : 4.5;                              // a spire leap launches you out (Ninja spire jump)
      st.vel.x = fdx * hv * k; st.vel.z = fdz * hv * k; st.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight * S.jumpMul) * upMul * Math.sqrt(k);
      st.events.push({ type: 'jump' }); spike(5, false); pay(MOVE.jumpCost * 0.5);
    };
    if (T.kind === 'hug') {
      const n = T.n, tx = -n.z, tz = n.x;                                    // along the wall
      st.onGround = true; st.crouching = st.crouching;
      if (input.pressed('jump')) { leaveRoute(); st.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight * S.jumpMul); st.vel.x = n.x * 2; st.vel.z = n.z * 2; st.onGround = false; st.events.push({ type: 'jump' }); return; }
      // S on a narrow ledge (a drop in front of you): lower yourself to hang from its edge, facing the wall
      // (not while S is moving you along the wall, looking along it)
      if (input.pressed('back') && !(len && Math.abs(wx * tx + wz * tz) > 0.5)) {
        const fy = groundAt(shapes, st.pos.x + n.x * 0.6, st.pos.z + n.z * 0.6, st.pos.y + 0.05);
        if (!fy.shape || fy.y < st.pos.y - 1.2) {
          // the ledge's front edge: from the wall outward, the last point still at ledge height
          let edge = -TRAV.hugGap + 0.02, seen = false;
          for (let d = -TRAV.hugGap + 0.01; d <= 0.6; d += 0.02) { const g = groundAt(shapes, st.pos.x + n.x * d, st.pos.z + n.z * d, st.pos.y + 0.05, 0.001); const on = g.shape && g.y > st.pos.y - 0.1; if (on) { edge = d; seen = true; } else if (seen) break; }
          const hx = st.pos.x + n.x * (edge + BODY.radius + 0.02), hz = st.pos.z + n.z * (edge + BODY.radius + 0.02);
          st.move = { type: 'drop', t: 0, dur: 0.45, from: { ...st.pos }, to: { x: hx, y: st.pos.y - height * HANG.reach, z: hz }, dx: -n.x, dz: -n.z, nx: n.x, nz: n.z, keep: 0,
            thenHang: { top: st.pos.y, dx: -n.x, dz: -n.z, t: 0 } };
          st.trav = null; spike(3); return;
        }
      }
      if (input.pressed('interact') || (len && (wx * n.x + wz * n.z) > 0.7)) { leaveRoute(); return; }   // step away from the wall
      const along = len ? wx * tx + wz * tz : 0;
      if (Math.abs(along) > 0.3) {
        const sp = TRAV.hug * (st.crouching ? 0.75 : 1) * Math.sign(along) * lf * dt, nx = st.pos.x + tx * sp, nz = st.pos.z + tz * sp;
        const w = wallNear(shapes, nx, nz, st.pos.y, height, 0.4);
        const g = groundAt(shapes, nx, nz, st.pos.y + 0.05, 0.2);         // toes on a ledge as narrow as 10 cm
        // the wall has to carry on behind you, and there has to be something underfoot (a ledge will do)
        if (w && (w.x * n.x + w.z * n.z) > 0.97 && g.shape && Math.abs(g.y - st.pos.y) <= BODY.stepHeight) {   // (a corner turns the normal: that's the end)
          st.pos.x = nx - w.x * (w.d - (TRAV.hugGap - BODY.radius)); st.pos.z = nz - w.z * (w.d - (TRAV.hugGap - BODY.radius)); st.pos.y = g.y; moved = Math.abs(sp);
          T.dir = Math.sign(along);
        }
      }
      st.noise = moved ? (hasN('ghostWalker') ? 0 : 0.8) : 0; st.bob += moved * 3;
    } else if (T.kind === 'pole') {
      const r = T.r, up = input.held('forward') ? 1 : input.held('back') ? -1 : 0, spin = input.held('right') ? 1 : input.held('left') ? -1 : 0;
      if (input.pressed('jump')) { leap(); return; }
      if (input.pressed('crouch')) { leaveRoute(); return; }
      const top = r.y1 - height * 0.9;
      let ny = T.s + up * TRAV.pole * lf * dt;
      if (up > 0 && ny >= top) {
        // at the top: straight on to a spire on it, a pipe or wire leaving it, anything you can perch on or hang from
        if (transferNear({ x: r.x, y: r.y1, z: r.z }, 1.5)) return;
        ny = top;
      }
      const g = groundAt(shapes, st.pos.x, st.pos.z, st.pos.y + 0.05);
      if (up < 0 && g.shape && ny <= g.y) { st.pos.y = g.y; leaveRoute(); st.onGround = true; return; }
      moved = Math.abs(ny - T.s) + Math.abs(spin * TRAV.spin * dt * (r.r + 0.3));
      T.s = ny; T.ang += spin * TRAV.spin * dt; placeOnRoute();
      st.stamina = Math.max(0, st.stamina - (up ? 3 : 1) * gripCost() * (1 + loadFrac()) * dt); st.sinceSpend = 0;
      if (st.stamina <= 0) { leaveRoute(); return; }
      st.noise = moved > 0 ? (hasN('ghostWalker') ? 0 : 1.2) : 0; st.bob += moved * 2;
    } else if (T.kind === 'pipe' || T.kind === 'rope') {
      const r = T.r, L = routeLength(r), d = [(r.b[0] - r.a[0]) / L, (r.b[1] - r.a[1]) / L, (r.b[2] - r.a[2]) / L], hl = Math.hypot(d[0], d[2]) || 1;
      // along the route from the keys and where you look; on a slope, uphill is slower
      let along = len ? (wx * d[0] + wz * d[2]) / hl : 0;
      if (Math.abs(along) < 0.3) along = 0;
      if (input.pressed('jump')) { leap(1, T.hang ? 0.8 : 1); return; }
      // W / S (when they aren't moving you along it): climb up to walk on top, or drop to hang below
      if (!along && !T.slide) {
        if (T.hang && input.pressed('forward') && hasN('tightrope')) { const f = { ...st.pos }; T.hang = false; placeOnRoute(); startTrans(f, 'up'); spike(3, false); return; }
        if (!T.hang && input.pressed('back') && hasN('poleRunner')) { const f = { ...st.pos }; T.hang = true; T.low = false; placeOnRoute(); startTrans(f, 'down'); spike(3, false); return; }
      }
      const downhill = Math.abs(d[1]) > 0.1 && (along === 0 || Math.sign(along) === Math.sign(-d[1]));
      if (T.kind === 'rope' && !T.hang && !T.slide && input.pressed('crouch') && hasN('ropeSlide') && downhill && (!hasN('wireRunner') || along)) { T.slide = Math.sign(-d[1]); T.speed = Math.max(1, T.run ? 5 : 1); T.low = false; placeOnRoute(); st.events.push({ type: 'slide' }); return; }
      // Wire runner: crouch moves you low and silent along the wire instead of letting go (crouch again to stand)
      if (!T.hang && !T.slide && input.pressed('crouch')) { T.low = !T.low; return; }       // crouch low on it (again to stand)
      if (input.pressed('crouch')) { leaveRoute(); return; }
      T.run = !T.hang && !T.low && hasN('wireRunner') && input.held('sprint') && along !== 0 && st.stamina > 0;
      if (T.run) { st.stamina = Math.max(0, st.stamina - S.sprintCost * dt); st.sinceSpend = 0; }
      let ds;
      if (T.slide) { T.speed = Math.min(12, T.speed + MOVE.gravity * Math.abs(d[1]) * dt); ds = T.slide * T.speed * dt / L; }   // sliding down a wire, hanging under it
      else ds = Math.sign(along) * (T.hang ? TRAV.pipe : MOVE.walk * TRAV.rope * (T.run ? 2.6 : T.low ? (hasN('wireRunner') ? 0.7 : 0.5) : 1)) * slow * lf * (1 - 0.35 * Math.max(0, Math.sign(along) * d[1])) * dt / L;
      let ns = T.s + ds;
      if (ns < 0 || ns > 1) {
        // off the end: a rope lets you step off onto what's there (a wire slide flings you on with its speed);
        // a pipe just ends
        if (T.hang || T.kind === 'pipe') {
          const end = ns < 0 ? r.a : r.b;                                      // a pipe's end: onto a pole or drainpipe there
          if (transferNear({ x: end[0], y: end[1] - height * 0.3, z: end[2] }, 0.9, ['pole'])) return;
          ns = Math.max(0, Math.min(1, ns));
        }
        else {
          const end = ns < 0 ? r.a : r.b, sg = ns < 0 ? -1 : 1, v = T.slide ? T.speed : MOVE.walk * TRAV.rope;
          st.pos.x = end[0] + d[0] * sg * 0.3; st.pos.z = end[2] + d[2] * sg * 0.3; st.pos.y = end[1] + 0.05;
          leaveRoute(); st.vel.x = d[0] * sg * v; st.vel.z = d[2] * sg * v; st.onGround = false; return;
        }
      }
      moved = Math.abs(ns - T.s) * L; T.s = ns; placeOnRoute();
      if (T.hang) { st.stamina = Math.max(0, st.stamina - 2 * gripCost() * (1 + loadFrac()) * dt); st.sinceSpend = 0; if (st.stamina <= 0) { leaveRoute(); return; } }
      st.noise = moved > 0 ? (hasN('ghostWalker') || (T.low && hasN('wireRunner')) ? 0 : T.low ? 0.5 : T.slide ? 4 : T.run ? 3 : 1) : 0; st.bob += moved * 2.2; st.crouch += ((T.low ? 1 : 0) - st.crouch) * Math.min(1, dt * 10);
      T.dir = Math.sign(ds) || T.dir || 1;
    } else if (T.kind === 'spire') {
      if (input.pressed('jump')) { leap(1.15, 1.15); return; }
      // back (or crouch) on a spire that tops a pole: down onto the pole instead of letting go
      if ((input.held('back') || input.pressed('crouch')) && transferNear({ x: T.r.x, y: T.r.y - 0.4, z: T.r.z }, 0.5, ['pole'])) return;
      if (input.pressed('crouch')) { leaveRoute(); return; }
      placeOnRoute(); st.noise = 0;
    }
    T.moving = moved > 0;                                                  // for the animations (silent movement still animates)
    if (moved) { T.dist += moved; if (T.dist >= 3) { T.dist -= 3; trainSneak(0.6, T.kind !== 'hug'); } }
  }
  // ---- ledge hang and shimmy ----
  // Hanging: forward or jump pulls up; left/right shimmy along the edge (as long as it continues); back
  // or crouch lets go. Back + jump kicks away from the wall (with Wall jump). Grip tires slowly (Iron grip
  // and a light pack help); when stamina runs out you fall.
  const HANG = { reach: 1.2, shimmy: 0.9, drain: 2.5 };
  function hangUpdate(dt, input, S) {
    const hg = st.hang; hg.t += dt;
    const fdx = -Math.sin(st.yaw), fdz = -Math.cos(st.yaw), rx = -fdz, rz = fdx;      // where you face, and your right
    const tx = -hg.dz, tz = hg.dx;                                                     // along the edge (to the right, facing the wall)
    st.vel.x = st.vel.y = st.vel.z = 0; st.onGround = false; st.sliding = false; st.fallFrom = st.pos.y; st.sinceGround = 0;
    st.stamina = Math.max(0, st.stamina - HANG.drain * gripCost() * (1 + loadFrac()) * dt); st.sinceSpend = 0;
    // keys are relative to the wall, not the camera: forward = up, back = off, left/right = along the edge
    // (as you face the wall), wherever you're looking
    const into = (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0), along = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    const letGo = (push = 0.6) => { st.hang = null; st.grabCool = 0.45; st.vel.x = -hg.dx * push; st.vel.z = -hg.dz * push; };
    if (st.stamina <= 0) { letGo(0.3); return; }
    if (input.pressed('jump') && into < -0.5 && has('wallJump') && pay(ATH.wallJumpCost)) {      // kick off backward
      letGo(5); st.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight * S.jumpMul) * 0.8; spike(8, false); st.events.push({ type: 'jump' }); return;
    }
    if (input.pressed('crouch') || (into < -0.5 && hg.t > 0.25)) { letGo(); return; }
    if ((input.pressed('jump') || into > 0.5) && hg.t > 0.15) {                          // pull up
      // onto the top if there's room to stand, otherwise over a thin wall to the far side
      const E = edgeAhead(shapes, st.pos.x, st.pos.z, hg.dx, hg.dz, st.pos.y, height, 0.5, height * 1.4);
      const dur = ATH.clamberTime / athSpeed() / (has('quickClimb') ? 2 : 1) * climbSlow();
      // a ledge too narrow to stand on, with a wall behind it: pull up into a wall hug on it (Sneak: Wall hug)
      if (E && !E.stand && !E.over && E.thick < 0.45 && hasN('wallHug') && Math.abs(E.top - hg.top) < 0.3) {
        const back = E.dist + BODY.radius + E.thick, w = wallNear(shapes, st.pos.x + hg.dx * (back - 0.15), st.pos.z + hg.dz * (back - 0.15), E.top, height, 0.4);
        if (w && pay(ATH.clamberCost * gripCost() * 0.7)) {
          const tx = st.pos.x + hg.dx * (back - TRAV.hugGap), tz = st.pos.z + hg.dz * (back - TRAV.hugGap);
          st.move = { type: 'clamber', t: 0, dur: dur * 0.8, from: { ...st.pos }, to: { x: tx, z: tz, y: E.top }, dx: hg.dx, dz: hg.dz, keep: 0, thenHug: { x: -hg.dx, z: -hg.dz } };
          st.hang = null; spike(4); return;
        }
      }
      if (E && E.top - hg.top > -0.3 && E.top - hg.top < 1.0 && (E.stand || E.over) && pay(   /* (up to a step above the hold: a roof's eave over the wall top) */ATH.clamberCost * gripCost() * 0.7)) {
        if (E.stand) st.move = { type: 'clamber', t: 0, dur, from: { ...st.pos }, to: { x: E.stand.x, z: E.stand.z, y: E.stand.y ?? E.top }, dx: hg.dx, dz: hg.dz, keep: 0 };
        else {
          const md = E.dist + BODY.radius + E.thick / 2;
          // pull up onto it, then step off the far edge (ending just past it, at the top) and drop naturally
          const fd = E.dist + E.thick + 0.08 + BODY.radius * 1.6;   // far enough past the far face that the feet are off it (thick is in 5 cm steps)
          st.move = { type: 'over', t: 0, dur: dur * 1.2, from: { ...st.pos }, mid: { x: st.pos.x + hg.dx * md, z: st.pos.z + hg.dz * md, y: E.top },
            to: { x: st.pos.x + hg.dx * fd, z: st.pos.z + hg.dz * fd, y: E.top + 0.05 }, dx: hg.dx, dz: hg.dz, keep: 1.2, airOut: true };
        }
        st.hang = null; spike(6); trainMove('athletics', 0.4); return;
      }
    }
    st.shimmyV = (st.shimmyV || 0) * Math.exp(-dt * 6);
    if (Math.abs(along) > 0.3) {                                                          // shimmy
      const sgn = Math.sign(along), step = HANG.shimmy * athSpeed() * (1 - 0.35 * Math.min(1, loadFrac())) * dt;
      const nx = st.pos.x + tx * sgn * step, nz = st.pos.z + tz * sgn * step;
      // the edge has to carry on (at the same height), and nothing can be in the way to the side
      const L = edgeAhead(shapes, nx - hg.dx * 0.1, nz - hg.dz * 0.1, hg.dx, hg.dz, st.pos.y, height, 0.5, height * 1.4);
      const w = resolveWalls(shapes, nx - hg.dx * 0.03, nz - hg.dz * 0.03, st.pos.y, height);
      const blocked = Math.abs((w.x - (nx - hg.dx * 0.03)) * tx + (w.z - (nz - hg.dz * 0.03)) * tz) > 0.005;
      if (L && Math.abs(L.top - hg.top) < 0.15 && !blocked) {
        st.pos.x = nx - hg.dx * 0.1 + hg.dx * L.dist; st.pos.z = nz - hg.dz * 0.1 + hg.dz * L.dist;
        st.shimmyV = sgn; st.bob += step * 3; st.noise = 1.5;
        st.stamina = Math.max(0, st.stamina - 2 * gripCost() * dt);
      }
    }
  }
  // ---- water (src/game/physics.js waterAt; volumes from opts.water) ----
  // Wading: water up to the chest slows you (down to about half speed). Deeper, you swim: in any
  // direction you look (look down to dive), jump to rise, crouch to sink, sprint to swim hard (stamina).
  // You float with your eyes just above the surface. Underwater, breath runs down; when it's gone you
  // drown (play.js takes health). Swimming skill makes you faster and lets you hold your breath longer;
  // Endurance helps both.
  const SWIM = { speed: 1.9, sprint: 1.6, accel: 5, drag: 2.2, chest: 0.62, float: 0.82, breathSec: 25, sprintCost: 12 };
  const swimSkill = () => (character.skills.swimming ?? 100) / 100;
  // Skill helps with diminishing returns and a cap: +20% per doubling of Swimming over 100, at most 2×
  // (Swimming 200: 1.2×, 1000: 1.66×, 5000+: 2×). Breath likewise: +30% per doubling, at most 3×.
  const skillCurve = (per, cap) => Math.min(cap, 1 + per * Math.log2(Math.max(1, swimSkill())));
  // swimming tree (src/data/skillTrees.js)
  const hasS = id => hasNode(character, 'swimming', id), rankS = id => character.skillTrees?.swimming?.nodes?.[id] ?? 0;
  const breathMax = () => SWIM.breathSec * Math.sqrt(effectiveMain(character).endurance / 100) * skillCurve(0.3, 3)
    * (1 + 0.1 * rankS('steadyBreath')) * (1 + 0.2 * rankS('deepLungs')) * (hasS('deepBreath') ? 3 : 1);
  function swimUpdate(dt, input, settings, S, wv, fx, fz) {
    st.onGround = false; st.sliding = false; st.wallRun = null; st.wallClimb = null; st.crouch += (0 - st.crouch) * Math.min(1, dt * 10);
    const floatY = wv.top - height * SWIM.float, deep = st.pos.y < floatY - 0.25;
    // where you're steering: along your view (pitch included) when under, flat on the surface
    const cp = Math.cos(st.pitch), sp = Math.sin(st.pitch), sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
    const fwd = [-sy * cp, sp, -cy * cp], right = [cy, 0, -sy];
    // near the surface, looking a little down doesn't drag you under: only a clear look down (past ~25°) dives
    const surfaceHold = st.pos.y > floatY - 1.2 && sp > -0.42;
    let w = [right[0] * fx - fwd[0] * fz, surfaceHold ? 0 : -fwd[1] * fz, right[2] * fx - fwd[2] * fz];
    if (input.held('jump')) w[1] += 1; if (input.held('crouch')) w[1] -= 1;
    const wl = Math.hypot(...w); if (wl > 1) w = w.map(v => v / wl);
    const hard = input.held('sprint') && wl > 0.1 && st.stamina > 0 && !st.exhausted; st.swimHard = hard;
    if (hard) { st.stamina = Math.max(0, st.stamina - SWIM.sprintCost * (hasS('efficientKick') ? 0.7 : 1) * dt); st.sinceSpend = 0; if (!st.stamina) st.exhausted = true; }
    // Surface dive: crouch at the surface to plunge. Dolphin kick: start a hard swim underwater with a burst.
    st.diveT = Math.max(0, (st.diveT || 0) - dt);
    if (!deep && input.pressed('crouch') && hasS('surfaceDive')) { st.diveT = 0.9; st.events.push({ type: 'stroke', hard: true }); }
    st.kickT = Math.max(0, (st.kickT || 0) - dt); st.kickCool = Math.max(0, (st.kickCool || 0) - dt);
    if (deep && input.pressed('sprint') && hasS('dolphinKick') && st.kickCool <= 0 && pay(10)) { st.kickT = 0.6; st.kickCool = 1.5; st.events.push({ type: 'stroke', hard: true, under: true }); }
    const speed = SWIM.speed * skillCurve(0.2, 2) * Math.min(1.5, Math.sqrt(effectiveMain(character).strength / 100)) * (1 + 0.05 * rankS('strongStroke'))
      * (hard ? SWIM.sprint * (1 + 0.08 * rankS('racingStroke')) : 1) * (st.kickT > 0 ? 1.8 : 1) * S.load;
    // Porpoise: swimming hard at the surface, jump to leap forward out of the water
    if (st.pos.y > floatY - 0.6 && hard && input.pressed('jump') && hasS('porpoise') && pay(8)) {
      const hs = Math.max(speed * 1.6, 4); st.vel.x = -sy * hs; st.vel.z = -cy * hs; st.vel.y = 8.5; st.leapT = 0.5;   // clears the water by about your body length
      st.pos.y = floatY + 0.15; spike(10, false); st.events.push({ type: 'splash', impact: 2 }); return;
    }
    // neutral buoyancy: you hold your depth (a surface dive plunges for a moment). Over 30% of your carrying
    // capacity you sink: at full load about 1.3 m/s, so staying up means treading (jump) and tiring.
    const sink = Math.max(0, loadFrac() - 0.3) * 1.8;
    if (sink > 0 && input.held('jump')) { st.stamina = Math.max(0, st.stamina - sink * 8 * dt); st.sinceSpend = 0; }
    const rise = st.diveT > 0 ? -3 : -sink;
    const target = [w[0] * speed, (st.diveT > 0 ? 0 : w[1] * speed) + rise, w[2] * speed];
    for (let i = 0; i < 3; i++) st.vel[['x', 'y', 'z'][i]] += (target[i] - st.vel[['x', 'y', 'z'][i]]) * Math.min(1, SWIM.accel * dt);
    // at the surface you bob at float height
    st.noise = hard ? 8 : wl > 0.1 ? 3 : 0.5;
    if (!deep && w[1] >= -0.1 && st.diveT <= 0) st.vel.y += ((floatY - st.pos.y) * 9 - st.vel.y * 3) * dt + Math.sin(performance.now() / 600) * 0.15 * dt;
    // move and collide (walls, the bottom); you can't swim up out of the water
    let nx = st.pos.x + st.vel.x * dt, nz = st.pos.z + st.vel.z * dt;
    const wc = resolveWalls(shapes, nx, nz, st.pos.y, height); nx = wc.x; nz = wc.z;
    let ny = Math.min(st.pos.y + st.vel.y * dt, floatY + 0.12);
    const gr = groundAt(shapes, nx, nz, Math.max(ny, st.pos.y));
    if (gr.shape && ny < gr.y) { ny = gr.y; if (st.vel.y < 0) st.vel.y = 0; }
    const moved = Math.hypot(nx - st.pos.x, ny - st.pos.y, nz - st.pos.z);
    st.pos.x = nx; st.pos.y = ny; st.pos.z = nz; st.takeoffY = st.pos.y;
    st.swimDist += moved; if (st.swimDist >= 5) { st.swimDist -= 5; trainMove('swimming', hard ? 1.5 : 1); }
    // strokes, for sound and the arms
    st.bob += dt * (0.6 + Math.hypot(st.vel.x, st.vel.y, st.vel.z) * 0.9);
    if (Math.floor(st.bob) !== st.lastStroke) { st.lastStroke = Math.floor(st.bob); if (moved > 0.005) st.events.push({ type: 'stroke', hard, under: deep }); }
    // stamina refills (slowly) while treading water
    // the current: in still water stamina refills; in a slow current it neither refills nor drains much; faster,
    // it drains (more for a weak swimmer, and in rough conditions: st.waterRough, set by the weather later). Out of
    // stamina in a current you're swept along and take damage (st.sweptHurt: play.js takes health)
    const cur = wv?.flow ? Math.hypot(wv.flow.x, wv.flow.z) : 0, rough = st.waterRough ?? 1;
    const pull = Math.max(0, cur * rough - 0.15);
    if (pull > 0) { st.stamina = Math.max(0, st.stamina - 4 * Math.pow(pull, 1.3) / skillCurve(0.25, 2) * dt); st.sinceSpend = 0; if (!st.stamina) st.exhausted = true; }
    st.sweptHurt = pull > 0.2 && st.stamina <= 0 ? pull : 0;
    if (!hard && pull <= 0) { st.sinceSpend += dt; if (st.sinceSpend > MOVE.regenDelay) st.stamina = Math.min(S.maxStamina, st.stamina + S.regen * (hasS('treadEasy') ? 1 : 0.5) * dt); if (st.exhausted && st.stamina > S.maxStamina * 0.25) st.exhausted = false; }
  }
  // play out a vault or clamber: the body follows a path, physics resumes at the end
  function stepMove(dt) {
    const m = st.move; m.t = Math.min(1, m.t + dt / m.dur); const u = m.t;
    if (m.type === 'vault') {
      // steady forward motion; the body rises quickly to clear the top, then eases to the exit height
      const a = m.from, b = m.to;
      st.pos.x = a.x + (b.x - a.x) * u; st.pos.z = a.z + (b.z - a.z) * u;
      const rise = Math.min(1, u / 0.45), up = 1 - (1 - rise) * (1 - rise);
      st.pos.y = u < 0.45 ? a.y + (m.peak - a.y) * up : m.peak + (b.y - m.peak) * ((u - 0.45) / 0.55) ** 2;
    } else if (m.type === 'drop') {
      // lowering yourself off a ledge to hang from it: step out a little, then down
      const a = m.from, b = m.to, e = u * u * (3 - 2 * u), out = Math.sin(Math.PI * u) * 0.15;
      st.pos.x = a.x + (b.x - a.x) * e + m.nx * out; st.pos.z = a.z + (b.z - a.z) * e + m.nz * out; st.pos.y = a.y + (b.y - a.y) * Math.pow(u, 1.5);
    } else if (m.type === 'over') {
      // pull up onto a thin wall, then swing over and drop to the far side
      const a = m.from, c = m.mid, b = m.to, sm = v => v * v * (3 - 2 * v);
      if (u < 0.55) { const e = sm(u / 0.55); st.pos.y = a.y + (c.y + 0.05 - a.y) * e; st.pos.x = a.x + (c.x - a.x) * e * e; st.pos.z = a.z + (c.z - a.z) * e * e; }
      else { const v = (u - 0.55) / 0.45, e = v * v * (3 - 2 * v); st.pos.x = c.x + (b.x - c.x) * e; st.pos.z = c.z + (b.z - c.z) * e; st.pos.y = c.y + 0.05 + Math.sin(Math.PI * v) * 0.12; }
    } else {
      // round a shelf's edge first (out and a little down, clear of it), then the usual haul
      if (m.via && u < 0.35) { const e = u / 0.35, s2 = e * e * (3 - 2 * e); st.pos.x = m.from.x + (m.via.x - m.from.x) * s2; st.pos.y = m.from.y + (m.via.y - m.from.y) * s2; st.pos.z = m.from.z + (m.via.z - m.from.z) * s2; st.vel.x = st.vel.y = st.vel.z = 0; return; }
      const u2 = m.via ? (u - 0.35) / 0.65 : u;
      // haul up to the edge (most of the time), then roll forward onto the top
      const up = Math.min(1, u2 / 0.7), fw = Math.max(0, (u2 - 0.7) / 0.3), a = m.via || m.from, b = m.to;
      const eu = up * up * (3 - 2 * up), ef = fw * fw * (3 - 2 * fw);
      st.pos.y = a.y + (b.y + 0.02 - a.y) * eu;
      const eo = m.via ? 0 : 0.12, edgeX = a.x + m.dx * eo, edgeZ = a.z + m.dz * eo;   // round a shelf: already at its edge
      st.pos.x = edgeX + (b.x - edgeX) * ef; st.pos.z = edgeZ + (b.z - edgeZ) * ef;
    }
    st.vel.x = st.vel.z = 0; st.vel.y = 0;
    if (u >= 1) {
      st.pos.x = m.to.x; st.pos.y = m.to.y; st.pos.z = m.to.z;
      st.vel.x = m.dx * (m.keep || 0); st.vel.z = m.dz * (m.keep || 0);         // carry speed out of the move
      // over a rail or a thin wall you leave it in the air and fall the rest of the way yourself
      if (m.airOut) { st.onGround = false; st.vel.y = m.type === 'over' ? 0 : -0.5; st.fallFrom = st.pos.y; st.sinceGround = 9; }
      else st.onGround = true;
      if (m.thenHug) {                                                         // onto a narrow ledge: hugging the wall, at hugging distance from it
        st.vel.x = st.vel.z = 0; st.trav = { kind: 'hug', n: m.thenHug, t: 0, dist: 0 };
        const w = wallNear(shapes, st.pos.x, st.pos.z, st.pos.y, height, 0.6);
        if (w) { st.pos.x -= w.x * (w.d - (TRAV.hugGap - BODY.radius)); st.pos.z -= w.z * (w.d - (TRAV.hugGap - BODY.radius)); st.trav.n = { x: w.x, z: w.z }; }
      }
      if (m.thenHang) { st.vel.x = st.vel.z = 0; st.onGround = false; st.hang = m.thenHang; }                    // off a narrow ledge: hanging from it
      st.move = null; if (!m.airOut) st.events.push({ type: 'land', impact: m.type === 'vault' ? 3 : 2 });
    }
  }

  const hs0Now = () => Math.hypot(st.vel.x, st.vel.z) || 1e-6;
  function update(dt, input, settings) {
    const S = stats();
    st.wjCool = Math.max(0, st.wjCool - dt); if (st.wallKick) { st.wallKick.t += dt; if (st.wallKick.t > 0.55) st.wallKick = null; } st.afterUp = Math.max(0, (st.afterUp || 0) - dt); st.afterRun = Math.max(0, (st.afterRun || 0) - dt);
    // ---- look ----
    const l = input.takeLook(), sens = 0.0022 * (settings.sensitivity ?? 1);
    st.yaw -= l.dx * sens;
    st.pitch = Math.max(-1.5, Math.min(1.5, st.pitch - l.dy * sens * (settings.invertY ? -1 : 1)));

    st.noiseSpike *= Math.exp(-dt * 2.5); st.noise = 0;           // spikes fade over about a second
    if (st.climbFly) { st.climbFly.t -= dt; if (st.onGround || st.climbFly.t <= 0) st.climbFly = null; }
    if (st.lastRoute) {                                                       // forget the route you left once you're clear of it (or have landed)
      st.lastRoute.t += dt; const N = nearestOnRoute(st.lastRoute.r, { x: st.pos.x, y: st.pos.y + height * 0.5, z: st.pos.z });
      if (N.dist > 1.6 || (st.onGround && st.lastRoute.t > 0.3) || st.lastRoute.t > 1.5) st.lastRoute = null;
    }
    st.grabCool = Math.max(0, (st.grabCool || 0) - dt); st.rollBuf = (st.rollBuf ?? 9) + dt;
    if (st.move) { stepMove(dt); st.sinceGround = 0; st.fallFrom = st.pos.y; st.noise = 4; return st; }
    if (st.hang) { hangUpdate(dt, input, S); return st; }
    if (st.climb) { climbUpdate(dt, input, S); return st; }
    // Vanish (Sneak 5001): crouched, drop out of sight for 4 s (40 stamina); standing up ends it
    st.vanish = Math.max(0, (st.vanish || 0) - dt); if (!st.crouching && !st.trav) st.vanish = 0;
    if (input.pressed('vanish') && hasN('vanish') && st.crouching && st.vanish <= 0 && pay(40)) { st.vanish = 4; st.events.push({ type: 'vanish' }); }
    if (st.trav) {
      let fx = 0, fz = 0; if (input.held('forward')) fz -= 1; if (input.held('back')) fz += 1; if (input.held('left')) fx -= 1; if (input.held('right')) fx += 1;
      const ln = Math.hypot(fx, fz) || 1, sn = Math.sin(st.yaw), cs = Math.cos(st.yaw);
      travUpdate(dt, input, S, (fx * cs + fz * sn) / ln, (-fx * sn + fz * cs) / ln, fx || fz ? 1 : 0);
      if (st.trav || st.move || st.climb) return st;
    }
    // ---- twirl onto a route (Sly style) ----
    // Mid-air, press E (or jump) with a usable route within a few metres: a spinning boost that carries you onto
    // it. You land on it as soon as you're close.
    if (st.twirl) {
      // flying the twirl: along an arc from where you jumped to the landing spot, then onto the route
      const tw = st.twirl; tw.t += dt; const u = Math.min(1, tw.t / tw.dur), e = u * (2 - u) * 0.35 + u * 0.65, a = tw.from, b = tw.to;
      st.pos.x = a.x + (b.x - a.x) * e; st.pos.z = a.z + (b.z - a.z) * e;
      st.pos.y = a.y + (b.y - a.y) * u + tw.lift * 4 * u * (1 - u);
      st.vel.x = (b.x - a.x) / tw.dur; st.vel.z = (b.z - a.z) / tw.dur; st.vel.y = (b.y - a.y) / tw.dur + tw.lift * 4 * (1 - 2 * u) / tw.dur;
      st.onGround = false; st.fallFrom = st.pos.y;
      if (u >= 1) { const r = tw.r, N = nearestOnRoute(r, st.pos); takeRoute(r, N); if (st.trav && (r.kind === 'rope' || r.kind === 'pipe')) { st.trav.hang = !hasN('tightrope'); placeOnRoute(); } }
      return st;
    } else if (!st.onGround && !st.trav && (input.pressed('interact') || input.pressed('jump')) && (st.grabCool || 0) <= 0) {
      const R = findRoute(true, 4.5);
      // a ledge in reach ahead is grabbed (hold jump), not twirled at
      const fx2 = -Math.sin(st.yaw), fz2 = -Math.cos(st.yaw), Lh = ledgeAhead(shapes, st.pos.x, st.pos.z, fx2, fz2, st.pos.y, height, 1.1);
      const ledgeNear = Lh && Lh.top - st.pos.y < height * 1.5;
      if (R && !ledgeNear && R.N.dist >= (R.r.kind === 'spire' ? 1.3 : 0.9)) {
        const P = twirlTarget(R.r), up = P.y - st.pos.y;
        if (up < 4.2) {                                                       // (a twirl lifts you up to about 4 m)
          // an arc from here to the landing spot, peaking a little above whichever end is higher
          const to = { ...P, y: P.y }, from = { ...st.pos }, dist = Math.hypot(to.x - from.x, to.z - from.z);
          // already right there (within about 2.8 m of your chest): just a little hop, no spin
          const close = Math.hypot(to.x - from.x, to.y - (from.y + height * 0.6), to.z - from.z) < 2.8;   // measured from the chest, like reaching
          const lift = close ? 0.25 + Math.max(0, up) * 0.2 : 0.5 + Math.max(0, up) * 0.35 + dist * 0.06;
          const dur = close ? 0.28 + Math.max(0, up) * 0.05 : Math.max(0.45, Math.min(0.95, 0.35 + dist * 0.09 + Math.max(0, up) * 0.06));
          st.twirl = { t: 0, r: R.r, from, to, lift, dur, mini: close };
          st.jumpQueued = 9; pay(st.twirl.mini ? 2 : 4); spike(st.twirl.mini ? 2 : 4, false); st.events.push({ type: st.twirl.mini ? 'jump' : 'twirl' }); return st;
        }
      }
    }
    // walking onto a rope or pipe at its end, or coming down on one: you step onto it (if you can balance)
    if (hasN('tightrope') && (st.grabCool || 0) <= 0 && st.vel.y <= 0.5) {
      for (const r of routes) {
        if ((r.kind !== 'rope' && r.kind !== 'pipe') || r === st.lastRoute?.r) continue;
        const N = nearestOnRoute(r, st.pos);
        if (N.dist < 0.4 && st.pos.y >= N.point.y - 0.3 && (!st.onGround || (input.held('forward') || input.held('back') || input.held('left') || input.held('right')))) {
          takeRoute(r, N); if (st.trav) { st.trav.hang = false; placeOnRoute(); } return st;
        }
      }
    }
    // take a route: E near one (or a wall to hug), or holding jump in the air close to one
    if ((st.grabCool || 0) <= 0 && ((input.pressed('interact') && (!opts.canInteract || opts.canInteract())) || (!st.onGround && input.held('jump') && st.vel.y < 1))) {
      const inAir = !st.onGround, R = findRoute(inAir);
      if (R && (input.pressed('interact') || R.N.dist < (R.r.kind === 'spire' ? 1.3 : 0.9))) { takeRoute(R.r, R.N); return st; }
      if (input.pressed('interact') && hasN('wallHug') && hugWall()) return st;
    }
    // ---- water ----
    const wv = waterAt(opts.water, st.pos.x, st.pos.z, st.pos.y), depth = wv ? Math.max(0, wv.top - st.pos.y) : 0;
    const wasSwimming = st.swimming, wasWet = st.wade > 0.05 || st.swimming;
    if (wv?.flow && depth > 0.2) {                                                          // a river's current carries you along (fully when swimming, less when wading)
      const k = Math.min(1, depth / (height * SWIM.chest)) * (st.onGround && !st.swimming ? 0.5 : 1);
      const w2 = resolveWalls(shapes, st.pos.x + wv.flow.x * k * dt, st.pos.z + wv.flow.z * k * dt, st.pos.y, height); st.pos.x = w2.x; st.pos.z = w2.z;
    }
    st.leapT = Math.max(0, (st.leapT || 0) - dt);
    st.swimming = !!wv && depth > height * SWIM.chest && st.leapT <= 0; if (!st.swimming) st.sweptHurt = 0;
    st.wade = wv && !st.swimming ? Math.min(1, depth / (height * SWIM.chest)) : 0;
    if (wv && !wasWet && depth > 0.1 && st.vel.y < -2) { spike(6 - st.vel.y, false); st.events.push({ type: 'splash', impact: -st.vel.y }); if (st.swimming) st.vel.y *= 0.35; }
    // breath: the eyes under the surface
    const eyes = st.pos.y + height * 0.93; st.underwater = !!wv && eyes < wv.top;
    const bm = breathMax(); st.breathMax = bm;
    const calm = hasS('calmHeart') && !st.swimHard ? 0.75 : 1;           // Calm heart: breath drains slower when not swimming hard
    st.breath = st.underwater ? Math.max(0, st.breath - dt / bm * calm) : Math.min(1, st.breath + dt * 0.5);
    st.gasp = st.underwater && st.breath <= 0 ? (st.gasp || 0) + dt : 0;          // Last gasp: a few seconds' grace
    st.drowning = st.underwater && st.breath <= 0 && st.gasp > (hasS('lastGasp') ? 6 : 0);
    if (st.swimming) {
      let fx0 = 0, fz0 = 0;
      if (input.held('forward')) fz0 -= 1; if (input.held('back')) fz0 += 1; if (input.held('left')) fx0 -= 1; if (input.held('right')) fx0 += 1;
      st.sitting = false; st.sit = 0;
      // climbing out: hold jump at the edge, facing it
      if (input.held('jump') && !st.underwater && grabLedge([[-Math.sin(st.yaw), -Math.cos(st.yaw)]], hasS('leapOut') ? 0.25 : 0, true, false)) return st;   // Leap out: more reach
      swimUpdate(dt, input, settings, S, wv, fx0, fz0); st.fallFrom = st.pos.y;
      if (wasSwimming !== st.swimming) st.events.push({ type: 'enterWater' });
      return st;
    }
    if (wasSwimming && !st.swimming && st.leapT <= 0) st.vel.y = Math.min(st.vel.y, 2);     // standing up out of deep water (not a porpoise leap)
    // ---- intent ----
    let fx = 0, fz = 0;
    if (input.held('forward')) fz -= 1; if (input.held('back')) fz += 1;
    if (input.held('left')) fx -= 1; if (input.held('right')) fx += 1;
    let len = Math.hypot(fx, fz); if (len) { fx /= len; fz /= len; }
    const sin = Math.sin(st.yaw), cos = Math.cos(st.yaw);
    let wx = fx * cos + fz * sin, wz = -fx * sin + fz * cos;          // world direction

    // sit: on the ground only; moving or jumping stands you back up. Resting triples regeneration (play.js).
    if (input.pressed('sit') && st.onGround) st.sitting = !st.sitting;
    if (st.sitting && (len || input.pressed('jump') || !st.onGround)) st.sitting = false;
    st.sit += ((st.sitting ? 1 : 0) - st.sit) * Math.min(1, dt * 5);
    if (st.sitting) { wx = wz = 0; len = 0; }
    // ---- slide: crouch while running fast ----
    // On flat ground or uphill you slide until you stop; downhill you keep (and gain) speed. Jump out of a
    // slide to keep its momentum. Crouch height the whole way.
    { const hs0 = Math.hypot(st.vel.x, st.vel.z);
      // momentum-based: holding crouch while fast on the ground slides, so landing from a jump with crouch held
      // carries straight into a slide
      if (!st.slideRun && !st.roll && st.onGround && input.held('crouch') && hs0 > MOVE.walk * S.speedMul * 1.1) {
        st.slideRun = { t: 0 }; spike(9); st.events.push({ type: 'slide' }); trainMove('athletics', 0.1);
      } }
    // ---- slipping: each step on slick ground (st.env from play.js) is a roll against a chance set by how slick it is,
    // how steep, and your Athletics (0 → 5000, straight between). Per step:
    //                     flat   shallow (~15°)   steep (30°+)
    //   wet / snow   0:   10%    50%              80%          5000:  0%   1%   2%
    //   ice          0:   50%    80%              100%         5000:  3%   6%   9%
    // scaled by how wet / snowy / icy it is there. A slip throws you into a slide that holds for a moment.
    { const env = st.env || { ice: 0, wet: 0, snow: 0 }, hs0 = Math.hypot(st.vel.x, st.vel.z);
      st.slipCool = Math.max(0, (st.slipCool || 0) - dt);                                 // (after a slip: 20 s before the next on wet ground or snow, 10 s on ice — nobody spends all their time on the ground)
      if (st.onGround && !st.slideRun && !st.roll && hs0 > 0.6 && st.slipCool <= 0) {
        st.stepDist = (st.stepDist || 0) + hs0 * dt;
        if (st.stepDist > 0.75) { st.stepDist = 0;
          const slickW = Math.min(1, env.wet + Math.min(1, env.snow / 0.05)) * (env.ice > 0.3 ? 0 : 1), slickI = Math.min(1, env.ice);
          if (slickW > 0.02 || slickI > 0.02) {
            const sl = slopeHere(), k = Math.min(1, (character.skills.athletics ?? 100) / 5000);
            const lerp3 = (f, sh, stp) => sl < 15 ? f + (sh - f) * sl / 15 : sh + (stp - sh) * Math.min(1, (sl - 15) / 15);
            const pw = lerp3(0.10, 0.50, 0.80) * (1 - k) + lerp3(0, 0.01, 0.02) * k, pi = lerp3(0.50, 0.80, 1.0) * (1 - k) + lerp3(0.03, 0.06, 0.09) * k;
            const p = Math.max(pw * slickW, pi * slickI);
            if (Math.random() < p) { st.slipCool = pi * slickI >= pw * slickW ? 10 : 20; st.slideRun = { t: 0, forced: true }; const m = Math.max(1.05, (MOVE.walk * S.speedMul * 1.2) / Math.max(0.1, hs0)); st.vel.x *= m; st.vel.z *= m; spike(6); st.events.push({ type: 'slip', ice: slickI > slickW }); } }
        } } else if (!st.onGround) st.stepDist = 0; }
    // ---- dodge roll (Athletics, Combatant side): Q by default ----
    st.rollCool = Math.max(0, (st.rollCool || 0) - dt);
    if (st.roll) {
      st.roll.t += dt; st.invulnerable = st.roll.t < 0.32;
      if (st.roll.t >= st.roll.dur) {
        // a roll with crouch held flows straight into a slide
        if (input.held('crouch') && st.onGround) {
          const v = Math.max(st.roll.carry, st.roll.v * 0.65, MOVE.walk * S.speedMul * 1.15);
          st.vel.x = st.roll.dx * v; st.vel.z = st.roll.dz * v; st.slideRun = { t: 0 }; st.events.push({ type: 'slide' });
        }
        st.roll = null; st.invulnerable = false;
      }
    } else if (input.pressed('dodge') && !st.onGround) st.rollBuf = 0;                  // remembered for a roll out of a landing
    else if (input.pressed('dodge') && st.onGround && st.rollCool <= 0 && has('dodgeRoll') && pay(15)) {
      const d = len ? [wx, wz] : [Math.sin(st.yaw), Math.cos(st.yaw)];              // no direction held: roll back
      // keeps your momentum: the roll goes at least as fast as you were already moving that way
      const carry = Math.max(0, st.vel.x * d[0] + st.vel.z * d[1]), v = Math.max(6.2 * Math.sqrt(athSpeed()), carry * 1.05);
      const fdx = -Math.sin(st.yaw), fdz = -Math.cos(st.yaw);
      st.roll = { t: 0, dur: 0.45, dx: d[0], dz: d[1], v, carry, fwd: d[0] * fdx + d[1] * fdz, side: d[0] * -fdz + d[1] * fdx }; st.rollCool = 0.6; st.slideRun = null;
      spike(hasN('cloakedDodge') ? 1.5 : 9);   // Cloaked dodge (Sneak): a quiet roll
      st.events.push({ type: 'roll' }); trainMove('athletics', 0.2);
    }
    if (settings.toggleCrouch) { if (input.pressed('crouch')) crouchToggle = !crouchToggle; } else crouchToggle = input.held('crouch');
    if (settings.toggleSprint) { if (input.pressed('sprint')) sprintToggle = !sprintToggle; if (!len) sprintToggle = false; } else sprintToggle = input.held('sprint');
    // standing back up needs room above
    const curH = BODY.crouchHeight + (height - BODY.crouchHeight) * (1 - st.crouch);
    if (crouchToggle || st.slideRun || st.roll) st.crouching = true;
    else if (st.crouching && headroom(shapes, st.pos.x, st.pos.z, st.pos.y, height)) st.crouching = false;
    st.crouch += ((st.crouching ? 1 : 0) - st.crouch) * Math.min(1, dt * 10);

    // ---- stamina ----
    const wantsSprint = sprintToggle && len > 0 && fz <= 0.1 && !st.crouching && st.onGround;
    if (st.exhausted && st.stamina > S.maxStamina * 0.25) st.exhausted = false;
    st.sprinting = wantsSprint && !st.exhausted && st.stamina > 0;
    if (st.sprinting) { st.stamina -= S.sprintCost * dt; st.sinceSpend = 0; if (st.stamina <= 0) { st.stamina = 0; st.exhausted = true; } }
    else if (st.slideRun || st.roll) st.sinceSpend = 0;                     // no recovery mid-slide or mid-roll
    else { st.sinceSpend += dt; if (st.sinceSpend > MOVE.regenDelay) st.stamina = Math.min(S.maxStamina, st.stamina + S.regen * dt * (st.sitting ? 3 : 1)); }

    // ---- horizontal movement ----
    let speed = MOVE.walk * S.speedMul * (1 - (hasS('fluid') ? 0.25 : 0.5) * st.wade) * (st.onGround ? surfaceOf(st.surface).speed : 1);
    // the weather underfoot (st.env, set by play.js from src/gfx/weathering.js): snow drags at you, the deeper the
    // slower (knee-deep: about half speed); ice and wet stone take your footing
    const env = st.env || { snow: 0, ice: 0, wet: 0 }, snowDrag = Math.min(1, env.snow / 0.45), slick = Math.min(1, env.ice + env.wet * 0.15);
    if (st.onGround) speed *= 1 - snowDrag * 0.55;   // wading: down to half speed at chest depth (Fluid motion: three quarters)
    if (st.sprinting) speed *= S.sprintMul; else if (st.crouching) speed *= MOVE.crouch; else if (input.held('walk')) speed *= MOVE.stroll;
    speed *= (st.combatSlow ?? 1) * (st.castSlow ?? 1);                // swinging, guarding (src/game/combat.js) or casting (spellcast.js)
    const tx = wx * speed, tz = wz * speed;
    // Air control grows with Athletics (passive, no node): more push in the air, (ath/100)^0.4, so 1.0× at
    // 100, 1.3× at 200, 2.5× at 1000, capped at 4× (about Athletics 3200).
    const airCtl = Math.min(4, Math.pow(Math.max(1, character.skills.athletics ?? 100) / 100, 0.4));
    const a = st.onGround ? MOVE.accel * (1 - 0.7 * Math.min(1, env.ice)) : MOVE.airAccel * airCtl;   // (on ice you can't push off or stop quickly)
    const ax = tx - st.vel.x, az = tz - st.vel.z, al = Math.hypot(ax, az), step = a * dt;
    if (al > 0 && !st.slideRun && !st.roll) {
      const h0 = Math.hypot(st.vel.x, st.vel.z), k = Math.min(1, step / al); st.vel.x += ax * k; st.vel.z += az * k;
      // in the air you steer but don't brake: momentum from a sprint, slide or roll carries through a jump,
      // unless you push against your motion
      if (!st.onGround && h0 > 0.1 && !(len && (wx * st.vel.x + wz * st.vel.z) / h0 < -0.3)) {
        const h1 = Math.hypot(st.vel.x, st.vel.z), cap = Math.max(h0, speed);    // keep momentum, but steering never adds speed past it
        if (h1 > 1e-6 && (h1 < h0 || h1 > cap)) { const k2 = (h1 < h0 ? h0 : cap) / h1; st.vel.x *= k2; st.vel.z *= k2; }
      }
      // Skilled athletes also curve their momentum in the air: the speed you carry turns toward where you
      // steer (up to ~1.6 rad/s at 4× air control, none at Athletics 100), keeping its size
      if (!st.onGround && len && h0 > 0.5 && airCtl > 1 && !st.wallRun && !st.wallClimb) {
        const turn = 0.55 * (airCtl - 1) * dt, cur = Math.atan2(st.vel.z, st.vel.x), want = Math.atan2(wz, wx);
        let dA = want - cur; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
        if (Math.abs(dA) < 2.2) {                                 // steering, not pulling straight back (that brakes)
          const na = cur + Math.max(-turn, Math.min(turn, dA)), hh = Math.hypot(st.vel.x, st.vel.z);
          st.vel.x = Math.cos(na) * hh; st.vel.z = Math.sin(na) * hh;
        }
      }
    }
    if (st.onGround && !len && !st.slideRun && !st.roll) { const f = Math.max(0, 1 - MOVE.friction * (1 - 0.8 * Math.min(1, env.ice)) * (1 + snowDrag) * dt); st.vel.x *= f; st.vel.z *= f; }
    if (st.roll) { const rv = Math.max(st.roll.carry, st.roll.v * (1 - 0.35 * st.roll.t / st.roll.dur)); st.vel.x = st.roll.dx * rv; st.vel.z = st.roll.dz * rv; }
    else if (st.slideRun) {
      // sliding: friction against the motion, gravity along a slope
      st.slideRun.t += dt;
      const g = st.groundShape, slope = g ? slopeOf(g) : 0, dn = g && g.rise ? { '+x': [-1, 0], '-x': [1, 0], '+z': [0, -1], '-z': [0, 1] }[g.rise] : [0, 0];
      const hs1 = Math.hypot(st.vel.x, st.vel.z) || 1e-6, ux = st.vel.x / hs1, uz = st.vel.z / hs1;
      if (st.onGround) {
        st.vel.x += dn[0] * MOVE.gravity * Math.sin(slope) * dt; st.vel.z += dn[1] * MOVE.gravity * Math.sin(slope) * dt;         // downhill pull
        const fr = Math.min(hs1, 0.2 * surfaceOf(st.surface).grip * (1 - 0.35 * Math.min(1, env.wet) - 0.55 * Math.min(1, env.ice) + 2.2 * snowDrag) * MOVE.gravity * Math.cos(slope) * dt);   /* wet stone slides further, ice much further; snow stops you */ st.vel.x -= ux * fr; st.vel.z -= uz * fr;            // friction (about 4.4 m/s² on the flat)
        if (len) { const turn = 2.2 * dt; st.vel.x += (wx * hs1 - st.vel.x) * turn * 0.25; st.vel.z += (wz * hs1 - st.vel.z) * turn * 0.25; }   // a little steering
      }
      const hs2 = Math.hypot(st.vel.x, st.vel.z); if (hs2 > 20) { st.vel.x *= 20 / hs2; st.vel.z *= 20 / hs2; }
      if (st.onGround && hs2 < MOVE.walk * S.speedMul * (st.slideRun.forced ? 0.35 : 1)) st.slideRun = null;   // (a slip on ice runs on until you've nearly stopped)      // slowed to walking speed: back on your feet (crouch-walking if crouch is still held)
      else if (st.onGround && st.slideRun.t > (st.slideRun.forced ? 0.7 : 0.25) && !input.held('crouch') && !crouchToggle && headroom(shapes, st.pos.x, st.pos.z, st.pos.y, height)) { st.slideRun = null; st.crouching = false; }   // let go of crouch with room overhead: up and running, keeping the speed
    }

    // ---- vault, clamber, wall jump (before an ordinary jump) ----
    if (st.onGround) { st.wallRunUsed = false; st.airJumped = false; st.takeoffY = st.pos.y; st.wallClimb = null; }
    // a wall within reach of the body, for wall jumps and wall runs
    const wn = st.onGround ? null : wallNear(shapes, st.pos.x, st.pos.z, st.pos.y, height, 0.3);
    if (wn) { st.wallN = { x: wn.x, z: wn.z }; st.wallT = 0; st.wallShape = wn.shape; st.wallAt = { x: st.pos.x, z: st.pos.z }; }
    // No bouncing up one wall: you can't kick off the same surface twice in a row. Landing (or kicking off a
    // different wall) frees it. A wall made of several pieces (rock columns) counts as one surface: same facing,
    // close to where you last kicked.
    if (st.onGround) st.lastKick = null;
    const sameWall = () => { const k = st.lastKick; if (!k || !st.wallN) return false;
      return k.shape === st.wallShape || ((k.n.x * st.wallN.x + k.n.z * st.wallN.z) > 0.9 && Math.hypot(st.pos.x - k.x, st.pos.z - k.z) < 1.5); };
    const markKick = n => { st.lastKick = { shape: st.wallShape, n: { x: n.x, z: n.z }, x: st.pos.x, z: st.pos.z }; };
    // Holding jump in the air grabs a ledge in front of you; let go and you just fly past, keeping your
    // momentum. Clamber reaches what you could from where you jumped; Quick climb and Cat's catch also
    // grab ledges from anywhere in the air (Cat's catch even while falling).
    if (!st.onGround && input.held('jump')) {
      // only straight ahead: where you're facing, and where you're moving if that's close to it (so a wall
      // beside you is left free for a wall run)
      const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), dirs = [[fx, fz]];
      if (len && wx * fx + wz * fz > 0.9) dirs.push([wx, wz]);
      // just after running up a wall: a little extra reach for everyone, so 90% of the way up still makes it
      // moving into the ledge (or carried up a wall) pulls straight up; otherwise you catch it and hang
      const climbOn = !!st.wallClimb || st.afterUp > 0 || (len > 0 && wx * fx + wz * fz > 0.5);
      if (grabLedge(dirs, st.wallClimb || st.afterUp > 0 ? 0.2 : 0, climbOn)) { st.wallClimb = null; st.afterUp = 0; return st; }
      if (tryClimb(fx, fz)) return st;                                 // a climbable wall: grab on
      // after a side leap or push off: catch a wall where you were thrown (the way you flew, or the face you
      // left from, whichever way you're looking)
      if (st.climbFly && st.climbFly.t > 0) {
        const cf = st.climbFly;
        if (tryClimb(cf.x, cf.z) || (cf.face && tryClimb(cf.face.x, cf.face.z))) { st.climbFly = null; return st; }
      }
      // Cat's catch at the end of a wall run: grab the top of the wall you were running along
      // Cat's catch on a wall run: holding jump while running along a wall (or just after) grabs its top
      const runN = st.wallRun && st.wallRun.t > 0.15 ? st.wallRun.n : st.afterRun > 0 ? st.afterRun_n : null;
      if (runN && has('ledgeCatch') && grabLedge([[-runN.x, -runN.z]], 0.1, true)) { st.wallRun = null; st.afterRun = 0; return st; }
      // running straight at a wall with jump held: run up it (Wall run), once per jump
      if (wn && len && has('wallRun') && !st.wallRunUsed && !sameWall() && (wx * -wn.x + wz * -wn.z) > 0.7 && (fx * -wn.x + fz * -wn.z) > 0.7 && st.stamina > 5 && st.vel.y > -3) {   // moving and facing into it
        st.wallClimb = { t: 0, n: { x: wn.x, z: wn.z }, max: 0.55 * Math.sqrt(athSpeed()) }; st.wallRunUsed = true;
      }
    }
    // ---- running up a wall ----
    if (st.wallClimb) {
      const r = st.wallClimb; r.t += dt;
      if (st.onGround || !input.held('jump') || r.t > r.max || st.wallT > 0.15 || st.stamina <= 0) { st.wallClimb = null; st.afterUp = 0.4; }
      else {
        st.vel.y = 5.2 * (1 - 0.4 * r.t / r.max); st.vel.x = -r.n.x * 1; st.vel.z = -r.n.z * 1;     // up, pressed to the wall
        st.takeoffY = st.pos.y;                                     // a ledge in reach from up here can be clambered
        st.stamina = Math.max(0, st.stamina - ATH.wallRunCost * 1.5 * dt); st.sinceSpend = 0; trainMove('athletics', 0.2 * dt);
      }
    }
    if (input.pressed('jump') && st.onGround && !st.crouching && st.sit < 0.3 && tryClimb(-Math.sin(st.yaw), -Math.cos(st.yaw))) return st;   // standing at a climbable wall: step onto it
    if (input.pressed('jump') && !st.crouching && st.sit < 0.3) {
      if (len && fz <= 0.1 && tryTraverse(wx, wz, !st.onGround)) { st.jumpQueued = 9; return st; }
      // a wall jump kicks you away, so it only fires when you aren't facing into the wall (or while
      // running along one); facing the wall, jump means grab or run up it (handled above while held)
      const facingWall = st.wallN && (-Math.sin(st.yaw) * -st.wallN.x + -Math.cos(st.yaw) * -st.wallN.z) > 0.5 && (!len || (wx * -st.wallN.x + wz * -st.wallN.z) > 0.3);
      // head-on kick-off: facing a wall you're touching (or running up), jump kicks you back off it with both feet
      const headOn = !st.onGround && st.wallN && facingWall && (st.wallClimb || st.wallT < 0.15) && has('wallJump') && st.wjCool <= 0 && !sameWall();
      if (headOn && pay(ATH.wallJumpCost)) {
        const n = st.wallClimb ? st.wallClimb.n : st.wallN;
        st.vel.x = n.x * 6; st.vel.z = n.z * 6; st.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight * S.jumpMul) * 0.9;
        st.wallClimb = null; st.wallRunUsed = false; st.wjCool = 0.15; st.wallT = 9; st.jumpQueued = 9; st.afterUp = 0;
        st.wallKick = { t: 0, side: 0, mode: 'front' }; markKick(n);
        spike(10, false); st.events.push({ type: 'jump' }); train(character, 'athletics', 0.5);
      } else if (!st.onGround && st.wallN && !sameWall() && (st.wallRun || (!facingWall && st.wallT < 0.15 && has('wallJump') && st.wjCool <= 0 && pay(ATH.wallJumpCost)))) {
        // kick off the wall: away from it, upward, keeping some of the speed along it
        const n = st.wallRun ? st.wallRun.n : st.wallN;
        // which way the wall is from the body, for the kick animation: left/right (side), or behind
        const rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw), fwx = -Math.sin(st.yaw), fwz = -Math.cos(st.yaw);
        const sideDot = n.x * rx + n.z * rz, backDot = -(n.x * fwx + n.z * fwz);   // wall to the left pushes you right (+sideDot)
        st.wallKick = Math.abs(sideDot) >= Math.abs(backDot) * 0.8 ? { t: 0, side: sideDot > 0 ? 1 : -1, mode: 'side' } : { t: 0, side: 0, mode: 'back' };
        st.vel.x = st.vel.x * 0.5 + n.x * 5.5; st.vel.z = st.vel.z * 0.5 + n.z * 5.5; markKick(n);
        st.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight * S.jumpMul) * 0.95;
        st.wallRun = null; st.wallRunUsed = false; st.wjCool = 0.15; st.wallT = 9; st.jumpQueued = 9;
        spike(10, false); st.events.push({ type: 'jump' }); trainMove('athletics', 0.5);
      } else if (!st.onGround && st.sinceGround > MOVE.coyote && has('skywalker') && !st.airJumped && pay(MOVE.jumpCost)) {
        // Skywalker: a second jump in mid-air, once per time off the ground
        st.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight * S.jumpMul) * 0.9; st.airJumped = true; st.jumpQueued = 9;
        if (len) { const hs = Math.max(Math.hypot(st.vel.x, st.vel.z), MOVE.walk * S.speedMul); st.vel.x = wx * hs; st.vel.z = wz * hs; }   // redirect toward where you're steering
        spike(8, false); st.events.push({ type: 'jump' }); trainMove('athletics', 0.3);
      }
    }
    // ---- wall run ----
    if (st.wallRun) {
      const r = st.wallRun; r.t += dt;
      if (st.onGround || st.wallT > 0.12 || r.t > r.max || !input.held('sprint') || st.stamina <= 0) { st.wallRun = null; st.afterRun = 0.4; st.afterRun_n = r.n; }
      else {
        st.stamina = Math.max(0, st.stamina - ATH.wallRunCost * dt); st.sinceSpend = 0;
        const vn = st.vel.x * r.n.x + st.vel.z * r.n.z; st.vel.x -= r.n.x * (vn + 1); st.vel.z -= r.n.z * (vn + 1);   // hug the wall
        st.takeoffY = st.pos.y;                                     // a ledge in reach from the wall run can be grabbed
        trainMove('athletics', 0.2 * dt);
      }
    } else if (!st.onGround && !st.wallRunUsed && st.wallN && st.wallT < 0.1 && input.held('sprint') && has('wallRun') && st.stamina > 5) {
      const hs = Math.hypot(st.vel.x, st.vel.z);
      if (hs > 3 && st.vel.y < 2.5 && Math.abs((st.vel.x * st.wallN.x + st.vel.z * st.wallN.z) / hs) < 0.6 && Math.abs(-Math.sin(st.yaw) * st.wallN.x - Math.cos(st.yaw) * st.wallN.z) < 0.6) {   // moving and facing along it   // along it, not into it, near the top of the jump
        const mom = treeState(character, 'athletics').nodes.momentum || 0;
        st.wallRun = { t: 0, n: { ...st.wallN }, max: 1.1 * (1 + 0.3 * mom) * Math.sqrt(athSpeed()) };
        st.vel.y = Math.min(Math.max(st.vel.y, 1.2), 1.6); st.wallRunUsed = true;   // a slight rise, then a slow sink along the wall
      }
    }
    // ---- jump ----
    if (input.pressed('jump')) st.jumpQueued = 0; else st.jumpQueued += dt;
    st.sinceGround = st.onGround ? 0 : st.sinceGround + dt;
    if (st.jumpQueued <= MOVE.buffer && st.sinceGround <= MOVE.coyote && st.vel.y <= 0.01 && (!st.crouching || st.slideRun) && st.sit < 0.3 && st.stamina >= MOVE.jumpCost * 0.5) {
      st.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight * S.jumpMul * (1 - 0.6 * st.wade));
      st.onGround = false; st.jumpQueued = 9; st.sinceGround = 9; if (st.slideRun) { st.slideRun = null; st.crouching = false; } st.stamina = Math.max(0, st.stamina - MOVE.jumpCost); st.sinceSpend = 0;
      spike(8); trainMove('athletics', 0.3); st.events.push({ type: 'jump' });
    }
    if (!st.wallClimb) st.vel.y -= MOVE.gravity * dt * (st.wallRun ? 0.25 : 1);

    // ---- move and collide ----
    const h = curH;
    let nx = st.pos.x + st.vel.x * dt, nz = st.pos.z + st.vel.z * dt;
    const w = resolveWalls(shapes, nx, nz, st.pos.y, h);
    // remember the last wall touched (its outward direction), for wall jumps and wall runs
    if (w.hit) { const px = w.x - nx, pz = w.z - nz, pl = Math.hypot(px, pz); if (pl > 1e-6) { st.wallN = { x: px / pl, z: pz / pl }; st.wallT = 0; } } else st.wallT += dt;
    if (w.hit) {   // kill velocity into the wall so you slide along it
      const px = w.x - nx, pz = w.z - nz, pl = Math.hypot(px, pz);
      if (pl > 1e-6) { const d = (st.vel.x * px + st.vel.z * pz) / pl; if (d < 0) { st.vel.x -= px / pl * d; st.vel.z -= pz / pl * d; } }
    }
    nx = w.x; nz = w.z;
    let ny = st.pos.y + st.vel.y * dt;
    const ceil = ceilingAt(shapes, nx, nz, st.pos.y + h);
    if (st.vel.y > 0 && ny + h > ceil) { ny = ceil - h; st.vel.y = 0; }
    // ground: step up while walking, snap down while walking downhill, land when falling
    const gr = groundAt(shapes, nx, nz, Math.max(ny, st.pos.y));
    const snap = (st.onGround || st.sliding) && st.vel.y <= 0 ? BODY.stepHeight : 0;
    if (gr.shape && ny <= gr.y + 1e-3 + snap && st.vel.y <= 0.01) {
      const slope = slopeOf(gr.shape);
      if (slope > BODY.maxSlope) {
        // too steep: slide down the slope. You can steer sideways but not climb: any push uphill is removed.
        ny = gr.y; st.onGround = false; st.sliding = true;
        const dir = { '+x': [-1, 0], '-x': [1, 0], '+z': [0, -1], '-z': [0, 1] }[gr.shape.rise];
        const up = st.vel.x * -dir[0] + st.vel.z * -dir[1];
        if (up > 0) { st.vel.x += dir[0] * up; st.vel.z += dir[1] * up; }
        st.vel.x += dir[0] * MOVE.gravity * Math.sin(slope) * Math.cos(slope) * dt * 2; st.vel.z += dir[1] * MOVE.gravity * Math.sin(slope) * Math.cos(slope) * dt * 2;
        st.vel.y = 0;
      } else {
        // a step up or down while walking: the body snaps to the new height, but the camera eases
        // there (stepOffset), so stairs and rough ground feel like climbing instead of jolting.
        // Smooth slopes change height a little every step and never trip it.
        const dy = gr.y - st.pos.y;
        if (st.onGround && Math.abs(dy) > 0.04 && Math.abs(dy) <= BODY.stepHeight + 0.01) st.stepOffset = Math.max(-0.5, Math.min(0.5, (st.stepOffset || 0) - dy));
        const landing = !st.onGround, impact = -st.vel.y;
        if (landing && impact > 2 && st.wade < 0.2) st.events.push({ type: 'land', impact });   // touched down from a fall or jump (water softens it)
        ny = gr.y; st.vel.y = 0; st.onGround = true; st.sliding = false; st.groundShape = gr.shape; st.surface = st.wade > 0.03 ? 'water' : gr.shape.surface || 'stone';
        if (landing) {
          if (impact > 2) spike(Math.min(30, 3 + impact * 1.6) * (hasN('lightFeet') ? 0.5 : 1));   // Light feet (Sneak): quieter landings
          const fall = (st.fallFrom ?? ny) - ny, ranks = treeState(character, 'athletics').nodes.featherfall || 0, over = fall - FALL.safe - FALL.perRank * ranks;
          const rolled = st.rollBuf < 0.3 && has('dodgeRoll') && hs0Now() > 0.5;
          if (over > 0) {
            const dmg = over * FALL.perMetre * (1 - st.wade) * (rolled ? 0.5 : 1);
            if (dmg > 0) st.events.push({ type: 'fall', dmg, height: fall, rolled });
          }
          if (rolled && st.rollCool <= 0) {                // roll out of the landing, keeping your speed
            const v0 = hs0Now(), dx0 = st.vel.x / v0, dz0 = st.vel.z / v0, fdx = -Math.sin(st.yaw), fdz = -Math.cos(st.yaw);
            st.roll = { t: 0, dur: 0.45, dx: dx0, dz: dz0, v: Math.max(5, v0), carry: v0, fwd: dx0 * fdx + dz0 * fdz, side: dx0 * -fdz + dz0 * fdx }; st.rollCool = 0.6; st.rollBuf = 9;
            st.events.push({ type: 'roll' });
          }
        }
      }
    } else { st.onGround = false; st.sliding = false; }
    if (st.onGround || st.wallRun || st.wallClimb) st.fallFrom = ny; else st.fallFrom = Math.max(st.fallFrom ?? ny, ny);
    if (ny < -80) { ny = 5; nx = opts.start?.x ?? 0; nz = opts.start?.z ?? 0; st.vel.x = st.vel.y = st.vel.z = 0; }   // fell off the world
    const moved = Math.hypot(nx - st.pos.x, nz - st.pos.z);
    st.pos.x = nx; st.pos.y = ny; st.pos.z = nz;

    st.stepOffset = (st.stepOffset || 0) * Math.exp(-dt * 11);       // the camera catches up in about a quarter second
    // ---- athletics from running ----
    if (st.sprinting) { st.sprintDist += moved; if (st.sprintDist >= 10) { st.sprintDist -= 10; trainMove('athletics', 1); } }
    // ---- head bob ----
    const hs = Math.hypot(st.vel.x, st.vel.z);
    if (st.onGround && hs > 0.3) st.bob += dt * hs * 2.1; else st.bob *= 0.9;
    // steady noise from how you're moving (metres it carries, before Sneak, weight and gear)
    const sf = surfaceOf(st.surface).noise;
    if (st.wallRun) st.noise = 12; else if (st.wallClimb) st.noise = 10;
    else if (st.slideRun) st.noise = 10 * sf;
    else if (st.onGround && hs > 0.3) st.noise = (st.sprinting ? 12 : st.crouching ? 1.5 : hs < MOVE.walk * 0.6 ? 3 : 5) * Math.min(1.4, hs / Math.max(1, speed || hs)) * sf;
    return st;
  }

  // Camera: eyes a little below the top of the head, with a gentle bob.
  function applyCamera(cam, bobScale = 1) {
    // sitting: eyes at about 55% of standing height (cross-legged on the floor)
    const h = (BODY.crouchHeight + (height - BODY.crouchHeight) * (1 - st.crouch)) * (1 - 0.45 * st.sit) * (st.roll ? 1 - 0.18 * Math.sin(Math.PI * st.roll.t / st.roll.dur) : 1);
    // a faint bob (about 7 mm at a sprint, no roll): enough to feel steps, not enough to make anyone ill.
    // bobScale (the Head bob setting) scales it; 0 turns it off.
    const hs = Math.hypot(st.vel.x, st.vel.z), amp = st.onGround ? Math.min(1, hs / 7) * 0.007 * (bobScale ?? 1) : 0;
    cam.position.set(st.pos.x, st.pos.y + (st.stepOffset || 0) + h * 0.93 + Math.sin(st.bob * 2) * amp, st.pos.z);
    // lean away from the wall while running along it
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), side = st.wallRun ? Math.sign(fx * st.wallRun.n.z - fz * st.wallRun.n.x) : 0;
    st.rollAngle = (st.rollAngle || 0) + (side * 0.09 - (st.rollAngle || 0)) * 0.12;      // (not st.roll: that's the dodge roll)
    // a dodge roll tips the view the way you roll: forward rolls nod down, backward rolls tip up, side rolls tilt
    let rp = 0, rr = 0;
    if (st.roll) { const k = Math.sin(Math.PI * Math.min(1, st.roll.t / st.roll.dur)); rp = -0.18 * k * st.roll.fwd; rr = -0.12 * k * st.roll.side; }
    cam.rotation.set(Math.max(-1.55, Math.min(1.55, st.pitch + rp)), st.yaw, (st.rollAngle || 0) + rr, 'YXZ');
  }
  return { state: st, update, applyCamera, stats, get height() { return height; }, setHeight(h) { height = h; } };
}
