// src/game/dungeonObjects.js — the creator's traps and triggers, working in the game (src/data/objects.js).
//
//   const T = createDungeonObjects(THREE, scene, dungeonMap, origin, shapes)
//   T.update(dt, time, player, hurt, enemies)   player: { pos, height, invulnerable }; hurt(points, why);
//                                     enemies: their units (src/game/enemies.js), which set off triggers and get hurt too
//
// Triggers (box trigger, pressure plate, trip wire) watch for the player, enemies or anyone (as set). When
// someone steps in or on one it fires; while they stay it fires again every `cooldown` seconds, or with a
// cooldown of 0 it holds on the whole time they're there. A "once only" trigger works the first time only.
// A fire is a short burst of every trap bound to it; holding keeps them going.
//
// Traps go off by their own timer, when anyone comes near, or from their triggers (`trigger`):
//   spikes      floor: a plate of spikes shoots up; wall: spikes stab out of the wall. Hurts on contact.
//   fireJet     floor: flame roars up from a grate; wall: flame shoots out of a nozzle. Burns while you're in it.
//   darts       a dart flies out of the wall each time it fires (one every 0.7 s while held).
//   blade       a pendulum blade on a chain swings across the passage while it's on, then settles.
//   collapse    the floor tile shakes and crumbles (you can't fall through yet; that needs holes in floors).
// Damage numbers are health points. Each trap only hurts you once per moment (a short cooldown per trap).
import { OBJECTS, normalOfRot, trapTrigger } from '../data/objects.js';
import { lineBlocked } from './physics.js';

const C = 10;
const BURST = { spikes: 1.1, fireJet: 1.6, darts: 0.05, blade: 3.2, collapse: 0.01 };   // how long a single fire keeps a trap on (s)
const HIT_COOL = { spikes: 0.8, fireJet: 0.5, blade: 0.9 };

export function createDungeonObjects(THREE, scene, d, origin, shapes) {
  const objs = (d.objects || []).filter(o => OBJECTS[o.type]);
  const byId = Object.fromEntries(objs.map(o => [o.id, o]));
  const W = (x, y, z) => new THREE.Vector3(origin.x + x, origin.y + y, origin.z + z);
  const floorY = o => o.layer * C;
  // an object's frame: where it stands, its local across (ux, uz) and front (fx, fz)
  const frame = o => { const a = (o.rot || 0) * Math.PI / 180; return { c: W(o.x, floorY(o), o.z), ux: Math.cos(a), uz: Math.sin(a), fx: Math.sin(a), fz: -Math.cos(a) }; };
  // the player's position in an object's local frame (lx across, lz toward its front)
  const local = (f, p) => { const dx = p.x - f.c.x, dz = p.z - f.c.z; return { lx: dx * f.ux + dz * f.uz, lz: dx * f.fx + dz * f.fz, y: p.y - f.c.y }; };

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, ...extra });
  const iron = mat('#4a4744', { metalness: 0.7, roughness: 0.4 }), steel = mat('#b8bcc2', { metalness: 0.9, roughness: 0.25 }), brass = mat('#a8803a', { metalness: 0.8, roughness: 0.35 });
  const stone = mat('#7a7468', { metalness: 0, roughness: 0.9 }), rope = mat('#c8b890', { metalness: 0, roughness: 1 });
  const add = (geo, m, pos, parent = scene) => { const mesh = new THREE.Mesh(geo, m); mesh.position.copy(pos); mesh.castShadow = true; parent.add(mesh); return mesh; };
  const flameTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30); grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.3, 'rgba(255,190,80,0.9)'); grd.addColorStop(0.65, 'rgba(255,90,20,0.4)'); grd.addColorStop(1, 'rgba(255,40,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
  })();
  const glow = new THREE.PointLight('#ff8a30', 0, 9, 1.6); scene.add(glow);   // one light, on whichever fire trap is burning nearest you

  // ---- triggers ----
  const triggers = objs.filter(o => OBJECTS[o.type].cat === 'trigger').map(o => {
    const f = frame(o), t = OBJECTS[o.type], T = { o, f, inside: false, timer: 0, done: false, held: false, mesh: null };
    if (o.type === 'pressurePlate') {
      const g = new THREE.Group(); g.position.copy(f.c); g.rotation.y = -(o.rot || 0) * Math.PI / 180; scene.add(g);
      add(new THREE.BoxGeometry(t.w + 0.1, 0.03, t.d + 0.1), iron, new THREE.Vector3(0, 0.015, 0), g);
      T.mesh = add(new THREE.BoxGeometry(t.w, 0.08, t.d), stone, new THREE.Vector3(0, 0.05, 0), g);
    } else if (o.type === 'tripwire') {
      const len = o.w || t.w, g = new THREE.Group(); g.position.copy(f.c); g.rotation.y = -(o.rot || 0) * Math.PI / 180; scene.add(g);
      const wire = add(new THREE.CylinderGeometry(0.008, 0.008, len, 4), rope, new THREE.Vector3(0, 0.25, 0), g); wire.rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.32, 0.06), iron, new THREE.Vector3(s * (len / 2 - 0.03), 0.16, 0), g);
      T.wire = wire;
    }
    return T;
  });
  function occupied(T, p, height) {
    const o = T.o, t = OBJECTS[o.type], L = local(T.f, p);
    if (o.type === 'zone') return Math.abs(L.lx) <= (o.w ?? t.w) / 2 && Math.abs(L.lz) <= (o.d ?? t.d) / 2 && L.y > -0.5 && L.y < (o.h ?? 2.5);
    if (o.type === 'pressurePlate') return Math.abs(L.lx) <= t.w / 2 + 0.15 && Math.abs(L.lz) <= t.d / 2 + 0.15 && L.y > -0.3 && L.y < 0.35;
    if (o.type === 'tripwire') return Math.abs(L.lx) <= (o.w || t.w) / 2 && Math.abs(L.lz) <= 0.3 && L.y < 0.25 && L.y + height > 0.25;
    return false;
  }

  // ---- traps ----
  const traps = objs.filter(o => OBJECTS[o.type].cat === 'trap').map(o => {
    const t = OBJECTS[o.type], wall = o.mount === 'wall', f = frame(o), h = o.h ?? t.wallH ?? 1;
    const T = { o, t, f, wall, h, burst: 0, held: false, cool: Math.random() * (o.interval ?? 3), hitCool: 0, k: 0, mode: trapTrigger(o), parts: {} };
    const g = new THREE.Group(); g.position.copy(f.c); g.rotation.y = -(o.rot || 0) * Math.PI / 180; scene.add(g); T.g = g;
    // in the group: x across, -z toward the front (out of the wall for wall traps), y up from the floor
    if (o.type === 'spikes') {
      const spike = new THREE.ConeGeometry(0.06, 0.6, 6), m = new THREE.Group(); g.add(m); T.parts.spikes = m;
      if (wall) {
        add(new THREE.BoxGeometry(t.wallW || 2, 0.7, 0.05), iron, new THREE.Vector3(0, h, -0.025), g);
        spike.rotateX(-Math.PI / 2); spike.translate(0, 0, -0.3);
        for (let x = -(t.wallW || 2) / 2 + 0.2; x <= (t.wallW || 2) / 2 - 0.15; x += 0.3) for (const y of [h - 0.18, h + 0.18]) add(spike, steel, new THREE.Vector3(x, y, 0), m);
      } else {
        add(new THREE.BoxGeometry(t.w, 0.04, t.d), iron, new THREE.Vector3(0, 0.02, 0), g);
        spike.translate(0, 0.3, 0);
        for (let x = -t.w / 2 + 0.2; x < t.w / 2; x += 0.35) for (let z = -t.d / 2 + 0.2; z < t.d / 2; z += 0.35) add(spike, steel, new THREE.Vector3(x, 0, z), m);
      }
    } else if (o.type === 'fireJet') {
      if (wall) { add(new THREE.CylinderGeometry(0.14, 0.18, 0.3, 8), brass, new THREE.Vector3(0, h, -0.15), g).rotation.x = Math.PI / 2; add(new THREE.BoxGeometry(0.5, 0.5, 0.06), iron, new THREE.Vector3(0, h, -0.03), g); }
      else { add(new THREE.BoxGeometry(t.w, 0.05, t.d), iron, new THREE.Vector3(0, 0.025, 0), g); for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.05, 0.06, t.d * 0.9), brass, new THREE.Vector3(i * t.w / 6, 0.03, 0), g); }
      T.flames = Array.from({ length: 28 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); s.visible = false; scene.add(s); return { s, life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() }; });
      T.emit = 0;
    } else if (o.type === 'darts') {
      add(new THREE.BoxGeometry(t.w, 0.3, 0.06), iron, new THREE.Vector3(0, h, -0.03), g);
      for (const x of [-0.15, 0, 0.15]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 6), mat('#111111'), new THREE.Vector3(x, h, -0.06), g).rotation.x = Math.PI / 2;
      T.darts = []; T.next = 0;
    } else if (o.type === 'blade') {
      const pivotY = 3.6, L = 2.6, piv = new THREE.Group(); piv.position.set(0, pivotY, 0); g.add(piv); T.parts.pivot = piv; T.L = L; T.pivotY = pivotY; T.phase = 0; T.amp = 0;
      add(new THREE.BoxGeometry(0.5, 0.15, 0.5), iron, new THREE.Vector3(0, pivotY + 0.1, 0), g);
      // hung from the ceiling: a chain up to whatever's overhead (tall rooms get a long one)
      let ceil = Infinity; const fy = f.c.y;
      for (const b of shapes) if (f.c.x >= b.min[0] && f.c.x <= b.max[0] && f.c.z >= b.min[2] && f.c.z <= b.max[2] && b.min[1] > fy + pivotY && b.min[1] < ceil) ceil = b.min[1];
      if (isFinite(ceil) && ceil - fy - pivotY > 0.2) { const len = ceil - fy - pivotY - 0.15; add(new THREE.CylinderGeometry(0.035, 0.035, len, 6), iron, new THREE.Vector3(0, pivotY + 0.15 + len / 2, 0), g); }
      add(new THREE.CylinderGeometry(0.03, 0.03, L, 6), iron, new THREE.Vector3(0, -L / 2, 0), piv);
      const blade = new THREE.Shape(); blade.moveTo(-0.7, 0); blade.quadraticCurveTo(0, -0.55, 0.7, 0); blade.lineTo(0.5, 0.12); blade.quadraticCurveTo(0, -0.25, -0.5, 0.12); blade.lineTo(-0.7, 0);
      const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.04, bevelEnabled: false }); bg.translate(0, 0, -0.02); bg.rotateY(Math.PI / 2);   // swings side to side, so its edge cuts across
      const bm = add(bg, steel, new THREE.Vector3(0, -L, 0), piv); bm.rotation.y = Math.PI / 2;
    } else if (o.type === 'collapse') {
      T.tile = add(new THREE.BoxGeometry(t.w - 0.05, 0.12, t.d - 0.05), stone, new THREE.Vector3(0, 0.03, 0), g);
      const crack = mat('#2a2622', { metalness: 0, roughness: 1 });
      for (let i = 0; i < 4; i++) { const c = add(new THREE.BoxGeometry(t.w * 0.7, 0.01, 0.03), crack, new THREE.Vector3(0, 0.095, -t.d / 3 + i * t.d / 4.5), g); c.rotation.y = (i - 1.5) * 0.4; }
      T.gone = 0;
    }
    return T;
  });

  // fire: a trap goes on for a burst; hold: stays on while held
  const fire = T => { T.burst = Math.max(T.burst, BURST[T.o.type] ?? 1); if (T.o.type === 'darts') shootDart(T); if (T.o.type === 'collapse' && !T.gone) T.gone = 0.001; };
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function shootDart(T) {
    const f = T.f, p = W(T.o.x, floorY(T.o) + T.h, T.o.z).addScaledVector(new THREE.Vector3(f.fx, 0, f.fz), 0.1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), iron); m.rotation.order = 'YXZ'; m.rotation.y = -(T.o.rot || 0) * Math.PI / 180; m.rotation.x = Math.PI / 2;
    m.position.copy(p); scene.add(m); T.darts.push({ m, p, v: new THREE.Vector3(f.fx, 0, f.fz).multiplyScalar(26), life: 1.2, stuck: 0 });
  }

  let glowBest = null;
  const whoMatches = (who, b) => who === 'anyone' || (who === 'enemies' ? b.who === 'enemies' : b.who === 'player');
  // others: enemies (src/game/enemies.js units). Every body can set off triggers (as the trigger allows), walk
  // near traps, and get hurt by them: { pos, height, invulnerable, who, key, hurt(points, why, from) }
  function update(dt, time, player, hurt, others = []) {
    const bodies = [{ pos: player.pos, height: player.height, invulnerable: player.invulnerable, who: 'player', key: 'player', hurt: (pts, why) => hurt(pts, why) }];
    for (const u of others) if (u.alive) bodies.push({ pos: u.pos, height: u.height, invulnerable: false, who: 'enemies', key: u, hurt: (pts, why, from) => u.hit(pts, { from, kind: why === 'Burned' ? 'fire' : 'trap', stagger: 0.5 }) });
    const p = player.pos;
    // triggers
    for (const T of traps) T.held = false;
    for (const G of triggers) {
      const o = G.o, occ = !G.done && bodies.some(b => whoMatches(o.who || 'player', b) && occupied(G, b.pos, b.height)), cd = o.cooldown ?? o.delay ?? 2, once = o.rearm === 'once';
      const bound = traps.filter(T => (T.o.triggers || []).includes(o.id) && T.mode === 'linked');
      if (occ && !G.inside) { if (cd > 0 || once) bound.forEach(fire); G.timer = cd; }
      else if (occ && cd > 0 && !once) { G.timer -= dt; if (G.timer <= 0) { bound.forEach(fire); G.timer = cd; } }
      G.held = occ && cd === 0;
      if (G.held) for (const T of bound) T.held = true;
      if (!occ && G.inside && once) G.done = true;
      G.inside = occ;
      if (G.mesh) G.mesh.position.y += ((occ ? 0.02 : 0.05) - G.mesh.position.y) * Math.min(1, dt * 12);   // a plate sinks under whoever's on it
      if (G.wire) G.wire.position.y = 0.25 - (occ ? 0.05 : 0);
    }
    // traps
    glowBest = null; let glowD = 1e9;
    for (const T of traps) {
      const o = T.o;
      if (T.mode === 'timer') { T.cool -= dt; if (T.cool <= 0) { fire(T); T.cool = o.interval ?? 3; } }
      else if (T.mode === 'near') { T.cool -= dt; if (T.cool <= 0 && bodies.some(b => Math.hypot(b.pos.x - T.f.c.x, b.pos.z - T.f.c.z) < (o.radius ?? 3) && Math.abs(b.pos.y - T.f.c.y) < 3)) { fire(T); T.cool = o.interval ?? 3; } }
      T.burst = Math.max(0, T.burst - dt);
      const on = T.held || T.burst > 0, dmg = o.damage ?? T.t.dmg ?? 10;
      T.hitCools ||= new Map(); for (const [k, v] of T.hitCools) { if (v - dt <= 0) T.hitCools.delete(k); else T.hitCools.set(k, v - dt); }
      // hurt every body this trap's danger zone (test) holds, each at most once per moment
      const strike = (test, why, cool) => { if (dmg <= 0) return; for (const b of bodies) { if (b.invulnerable || T.hitCools.has(b.key)) continue; const L = local(T.f, b.pos); if (test(L, b.height)) { b.hurt(dmg, why, { x: T.f.c.x, z: T.f.c.z }); T.hitCools.set(b.key, cool); } } };
      if (o.type === 'spikes') {
        T.k += ((on ? 1 : 0) - T.k) * Math.min(1, dt * (on ? 18 : 4));
        if (T.wall) T.parts.spikes.position.z = (1 - T.k) * 0.62;            // back into the wall when off
        else T.parts.spikes.position.y = -0.62 * (1 - T.k);
        if (T.k > 0.5) strike(T.wall ? (L, h) => Math.abs(L.lx) < (T.t.wallW || 2) / 2 && L.lz > 0 && L.lz < 0.75 * T.k + 0.3 && L.y < T.h + 0.4 && L.y + h > T.h - 0.4
          : L => Math.abs(L.lx) < T.t.w / 2 && Math.abs(L.lz) < T.t.d / 2 && L.y < 0.55 * T.k && L.y > -0.3, 'Spikes', HIT_COOL.spikes);
      } else if (o.type === 'fireJet') {
        const len = T.wall ? 3.5 : 3.2, dir = T.wall ? new THREE.Vector3(T.f.fx, 0, T.f.fz) : new THREE.Vector3(0, 1, 0), base = W(o.x, floorY(o) + (T.wall ? T.h : 0.05), o.z).addScaledVector(dir, T.wall ? 0.3 : 0);
        if (on) { T.emit += dt * 60; while (T.emit > 1) { T.emit--; const q = T.flames.find(x => x.life <= 0); if (!q) break; q.life = 0.5; q.p.copy(base); q.v.copy(dir).multiplyScalar(len / 0.5 * (0.8 + Math.random() * 0.3)).add(tmpA.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2)); } }
        for (const q of T.flames) {
          if (q.life <= 0) { q.s.visible = false; continue; }
          q.life -= dt; q.p.addScaledVector(q.v, dt); const a = 1 - q.life / 0.5;
          q.s.visible = true; q.s.position.copy(q.p); q.s.material.opacity = Math.min(0.6, (1 - a) * 1.1); const sc = 0.35 + a * 1.1; q.s.scale.set(sc, sc, 1);
        }
        if (on) strike(T.wall ? (L, h) => Math.abs(L.lx) < 0.6 && L.lz > 0.2 && L.lz < len && L.y < T.h + 0.6 && L.y + h > T.h - 0.6
          : L => Math.abs(L.lx) < 0.6 && Math.abs(L.lz) < 0.6 && L.y < len && L.y > -0.3, 'Burned', HIT_COOL.fireJet);
        if (on) { const dd = Math.hypot(p.x - base.x, p.z - base.z); if (dd < glowD) { glowD = dd; glowBest = base.clone().addScaledVector(dir, len * 0.4); } }
      } else if (o.type === 'darts') {
        if (T.held) { T.next -= dt; if (T.next <= 0) { shootDart(T); T.next = 0.7; } } else T.next = 0;
        for (let i = T.darts.length - 1; i >= 0; i--) {
          const a = T.darts[i];
          if (a.stuck) { a.stuck -= dt; if (a.stuck <= 0) { scene.remove(a.m); T.darts.splice(i, 1); } continue; }
          a.life -= dt; tmpB.copy(a.p).addScaledVector(a.v, dt);
          // whoever's closest to the dart's path this step, at body height, takes it
          const sx = tmpB.x - a.p.x, sz = tmpB.z - a.p.z, sl = sx * sx + sz * sz || 1;
          let hitB = null, hitT = 2;
          for (const b of bodies) {
            const tt = Math.max(0, Math.min(1, ((b.pos.x - a.p.x) * sx + (b.pos.z - a.p.z) * sz) / sl)), cx = a.p.x + sx * tt, cz = a.p.z + sz * tt;
            if (Math.hypot(b.pos.x - cx, b.pos.z - cz) < (b.who === 'player' ? 0.35 : (b.key.radius || 0.35)) && a.p.y > b.pos.y && a.p.y < b.pos.y + b.height && !b.invulnerable && tt < hitT) { hitB = b; hitT = tt; }
          }
          if (hitB) { if (dmg > 0) hitB.hurt(dmg, 'Dart', { x: a.p.x, z: a.p.z }); scene.remove(a.m); T.darts.splice(i, 1); continue; }
          if (a.life <= 0 || lineBlocked(shapes, a.p, tmpB)) { a.stuck = 3; continue; }
          a.p.copy(tmpB); a.m.position.copy(a.p);
        }
      } else if (o.type === 'blade') {
        T.amp += ((on ? 1 : 0) - T.amp) * Math.min(1, dt * (on ? 2.5 : 0.8));
        T.phase += dt * 2.4; const th = T.amp * 0.72 * Math.sin(T.phase);
        T.parts.pivot.rotation.z = th;
        const bx = Math.sin(th) * T.L, by = T.pivotY - Math.cos(th) * T.L;   // the blade's middle, in the trap's frame
        if (T.amp > 0.15) strike((L, h) => Math.abs(L.lx - bx) < 0.5 && Math.abs(L.lz) < 0.45 && L.y < by + 0.4 && L.y + h > by - 0.4, 'Blade', HIT_COOL.blade);
      } else if (o.type === 'collapse') {
        if (T.gone > 0) {
          T.gone += dt; const g = T.gone;
          if (g < 0.8) { T.tile.position.x = Math.sin(g * 60) * 0.03; T.tile.position.y = 0.03; T.tile.visible = true; }
          else if (g < 2.2) { T.tile.position.x = 0; T.tile.position.y = 0.03 - (g - 0.8) * (g - 0.8) * 5; }
          else { T.tile.visible = false; if (g > 8) { T.gone = 0; T.tile.visible = true; T.tile.position.set(0, 0.03, 0); } }   // back after a while
        }
      }
    }
    if (glowBest) { glow.position.copy(glowBest); glow.intensity = 1.3 + Math.random() * 0.3; } else glow.intensity = 0;
    void time;
  }
  return { update, traps, triggers, byId };
}
