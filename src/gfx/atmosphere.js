// src/gfx/atmosphere.js — lightweight atmospheric-perspective controls for the current scene fog.
// This is a deliberately conservative first step: it extends the existing fog range rather than
// introducing a second fog shader. Weather, water, indoor fog, and gameplay visibility remain authoritative.
export const ATMOSPHERE_DEFAULTS = Object.freeze({
  enabled: false,
  start: 140,
  end: 360,
  strength: 0.35,
});

// Apply a subtle far-distance haze by moving the existing linear-fog range toward a longer range.
// The fog keeps its current sky/weather color, so the horizon blend follows the time of day.
// Stronger local fog (whose far distance is before the haze start) is left alone.
export function applyAtmosphericHaze(fog, settings = ATMOSPHERE_DEFAULTS, { fixed = false, wet = false, outdoor = true } = {}) {
  if (!fog || !settings.enabled || fixed || wet || !outdoor) return;
  const start = Math.max(1, Number(settings.start) || ATMOSPHERE_DEFAULTS.start);
  const end = Math.max(start + 1, Number(settings.end) || ATMOSPHERE_DEFAULTS.end);
  const strength = Math.max(0, Math.min(1, Number(settings.strength) || 0));
  if (strength <= 0 || fog.far <= start) return;

  const baseNear = fog.near;
  const baseFar = fog.far;
  fog.near = baseNear + (Math.max(baseNear, start) - baseNear) * strength;
  fog.far = baseFar + (Math.max(baseFar, end) - baseFar) * strength;
}
