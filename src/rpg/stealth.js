// src/rpg/stealth.js — how loud and how visible the player is, and how fast someone notices.
//
// Noise is a radius in metres: roughly how far an attentive listener hears you right now.
//   raw   from the controller (st.noise steady + st.noiseSpike from jumps, landings, rolls, vaults…),
//         already scaled by the surface underfoot (src/data/surfaces.js)
//   × weight   heavier bodies are louder: (mass / 70 kg)^0.4
//   × gear     sheathed weapons and worn gear rattle as you move: +3% per kg worn
//   × Sneak    practice quiets you: crouched (Sneak / 100)^-0.3, standing (Sneak / 100)^-0.15
// Big movement is loud by default: a sprint carries ~12 m, a jump ~8 m, a hard landing 20 m+, while a
// crouched creep is ~1.5 m.
//
// Detection: a listener's awareness climbs from 0 to 1 (unaware → suspicious at 0.3 → detected at 1).
//   hearing  only inside your noise radius: (1 − distance ÷ radius) × 1.5 per second. Through walls
//            (no straight line between you) the radius is halved.
//   sight    needs a clear line from its eyes to your head or chest, inside a 120° cone and its sight
//            range (25 m × visibility): closer is faster. Crouching halves visibility, standing still
//            takes off 40%, Sneak takes off more.
//   Awareness falls back slowly (0.12/s) when nothing is noticed.
import { hasNode } from '../data/skillTrees.js';
export const STEALTH = { gearPerKg: 0.03, sight: 25, cone: Math.cos(Math.PI / 3), decay: 0.12, suspicious: 0.3, hearRate: 1.5, muffled: 0.5 };

const skill = c => Math.max(1, c?.skills?.sneak ?? 100) / 100;

// route: the thief's route you're on (src/game/traverse.js), if any: moving along one is quiet
export function noiseOf(raw, { mass = 70, gearKg = 0, crouching = false, moving = true, character, route = null } = {}) {
  if (raw <= 0) return 0;
  const soft = crouching ? Math.pow(0.9, character?.skillTrees?.sneak?.nodes?.softSteps ?? 0) : 1;   // Soft steps
  raw *= soft * (route ? 0.6 : 1);
  const weight = Math.pow(Math.max(20, mass) / 70, 0.4);
  const gear = moving ? 1 + STEALTH.gearPerKg * gearKg : 1;
  const sneak = Math.pow(skill(character), crouching ? -0.3 : -0.15);
  return raw * weight * gear * Math.max(0.2, sneak);
}

// On a route you're up out of the way: 75% as visible; hugging a wall half (a quarter with Wall shadow).
// Stillness and Unseen (Sneak, Shadow side) help further.
export function visibilityOf({ crouching = false, moving = true, character, route = null } = {}) {
  const sn = id => hasNode(character, 'sneak', id), still = character?.skillTrees?.sneak?.nodes?.stillness ?? 0;
  const onRoute = route === 'hug' ? (sn('wallShadow') ? 0.25 : 0.5) : route ? 0.75 : 1;
  return (crouching ? 0.5 * (sn('unseen') ? 0.7 : 1) : 1) * (moving ? 1 : 0.6 * Math.pow(0.8, still)) * onRoute * Math.max(0.3, Math.pow(skill(character), -0.2));
}

// listener: { x, y, z, yaw (facing, radians, -Z at 0), perception (1 = average), awareness }
// player: { x, y, z, noise (m), visibility, seen (a clear line of sight), open (sound isn't blocked) }
export function detectRate(listener, player) {
  const dx = player.x - listener.x, dz = player.z - listener.z, d = Math.max(0.5, Math.hypot(dx, dz, player.y - listener.y));
  const per = listener.perception ?? 1, radius = player.noise * per * (player.open === false ? STEALTH.muffled : 1);
  const hearing = d < radius ? (1 - d / radius) * STEALTH.hearRate : 0;
  const fx = -Math.sin(listener.yaw), fz = -Math.cos(listener.yaw), inCone = (dx * fx + dz * fz) / Math.hypot(dx, dz || 1e-6) > STEALTH.cone;
  const range = STEALTH.sight * player.visibility * per;
  const sight = player.seen !== false && inCone && d < range ? (1 - d / range) * 1.2 : 0;
  return { rate: hearing + sight, hearing, sight };
}

export function stepAwareness(listener, player, dt) {
  const r = detectRate(listener, player);
  listener.awareness = Math.max(0, Math.min(1, (listener.awareness || 0) + (r.rate > 0 ? r.rate * dt : -STEALTH.decay * dt)));
  return r;
}
export const awarenessLabel = a => a >= 1 ? 'Detected' : a >= STEALTH.suspicious ? 'Suspicious' : 'Unaware';
