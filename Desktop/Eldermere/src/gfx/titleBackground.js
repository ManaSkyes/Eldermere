// src/gfx/titleBackground.js — night sky over Eldermere, a slow rune circle, and drifting gleam mites.
// Everything is drawn with code; nothing is loaded.

const RUNES_OUTER = 'ᛖᚹᛟᚲᛟ ᛚᚢᛗᛁᚾᛟ ᛫ ᛋᛖᚾᛋᚢᛗ ᛫ ᛗᛟᛞᚢᛚᛟ ᛫ ᛖᛗᛁᛏᛟ ᛫ ';
const RUNES_INNER = 'ᛖᛏᛖᚱᚾᚨ ᛞᛁᛋᛋᛟᛚᚢᛏᛁᛟ ᛫ ᚠᛚᚢᛏᛟ ᛫ ᛁᚾᚨᚾᛁᛋ ᛫ ';
const MITE_HUES = [150, 50, 210, 350, 275]; // green, yellow, blue, red, purple — the crystal dust colors

// Small seeded RNG so the skyline is the same every load.
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

export function startBackground(canvas) {
  const g = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1;
  let mode = 'title';
  let dim = 0; // animated toward target
  let stars = [], mites = [], skyline = null;

  function build() {
    const r = rng(7);
    stars = Array.from({ length: Math.round((W * H) / 3500) }, () => ({
      x: r() * W, y: r() * H * 0.75, s: r() * 1.4 + 0.3, p: r() * Math.PI * 2,
    }));
    mites = Array.from({ length: 70 }, () => ({
      x: r() * W, y: H * 0.45 + r() * H * 0.55,
      vx: (r() - 0.5) * 0.25, vy: (r() - 0.5) * 0.15,
      hue: MITE_HUES[Math.floor(r() * MITE_HUES.length)], p: r() * Math.PI * 2,
    }));
    skyline = buildSkyline(r);
  }

  // Far hills, the mountain with the city of Eldermere, near hills.
  function buildSkyline(r) {
    const off = document.createElement('canvas');
    off.width = W * dpr; off.height = H * dpr;
    const o = off.getContext('2d');
    o.scale(dpr, dpr);

    const ridge = (base, amp, freq, color, seedShift) => {
      o.fillStyle = color;
      o.beginPath(); o.moveTo(0, H);
      for (let x = 0; x <= W; x += 6) {
        const y = base
          + Math.sin(x * freq + seedShift) * amp
          + Math.sin(x * freq * 2.7 + seedShift * 3) * amp * 0.35;
        o.lineTo(x, y);
      }
      o.lineTo(W, H); o.fill();
    };

    ridge(H * 0.74, H * 0.03, 0.004, '#171a36', 1.3);

    // Mountain and city
    const mx = W * 0.72, peak = H * 0.5;
    o.fillStyle = '#121430';
    o.beginPath();
    o.moveTo(mx - W * 0.42, H);
    o.quadraticCurveTo(mx - W * 0.08, peak + 40, mx, peak);
    o.quadraticCurveTo(mx + W * 0.09, peak + 40, mx + W * 0.44, H);
    o.fill();
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const bx = mx - W * 0.12 + t * W * 0.24;
      const slope = Math.abs(bx - mx) / (W * 0.12);
      const baseY = peak + 18 + slope * slope * 70;
      const h = (16 + r() * 40) * (1.2 - slope * 0.6);
      const w = 6 + r() * 10;
      o.fillStyle = '#121430';
      o.fillRect(bx, baseY - h, w, h + 40);
      if (r() > 0.55) { o.beginPath(); o.moveTo(bx - 1, baseY - h); o.lineTo(bx + w / 2, baseY - h - 10); o.lineTo(bx + w + 1, baseY - h); o.fill(); }
      for (let k = 0; k < 3; k++) {
        if (r() > 0.5) {
          o.fillStyle = r() > 0.8 ? 'rgba(98,214,160,0.75)' : 'rgba(240,190,120,0.7)';
          o.fillRect(bx + 2 + r() * (w - 4), baseY - h + 4 + r() * (h - 8), 1.6, 2.2);
        }
      }
    }

    ridge(H * 0.86, H * 0.025, 0.006, '#0c0e22', 4.1);
    return off;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    build();
  }

  function drawRing(t, cx, cy, radius, text, dir, alpha) {
    g.save();
    g.translate(cx, cy);
    g.rotate(t * 0.00004 * dir);
    g.strokeStyle = `rgba(178,156,240,${0.35 * alpha})`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, radius + 16, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, radius - 14, 0, Math.PI * 2); g.stroke();
    g.font = `${Math.round(radius * 0.09)}px "Noto Sans Runic", serif`;
    g.fillStyle = `rgba(214,206,250,${0.55 * alpha})`;
    g.shadowColor = 'rgba(178,156,240,0.9)'; g.shadowBlur = 10;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const chars = [...text.repeat(3)];
    const n = chars.length;
    for (let i = 0; i < n; i++) {
      g.save();
      g.rotate((i / n) * Math.PI * 2);
      g.fillText(chars[i], 0, -radius);
      g.restore();
    }
    g.restore();
  }

  function frame(t) {
    // 'off' (in the game): draw nothing; the canvas is hidden and costs nothing
    if (mode === 'off') { canvas.style.visibility = 'hidden'; requestAnimationFrame(frame); return; }
    canvas.style.visibility = '';
    const target = mode === 'dim' ? 1 : 0;
    dim += (target - dim) * 0.05;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#080a1c');
    sky.addColorStop(0.6, '#1a1c44');
    sky.addColorStop(1, '#2a2350');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    for (const s of stars) {
      const tw = reduced ? 0.7 : 0.55 + Math.sin(t * 0.0012 + s.p) * 0.45;
      g.fillStyle = `rgba(230,232,250,${tw})`;
      g.fillRect(s.x, s.y, s.s, s.s);
    }

    // Moon
    const mx = W * 0.82, my = H * 0.16, mr = Math.min(W, H) * 0.05;
    const glow = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
    glow.addColorStop(0, 'rgba(220,221,240,0.25)'); glow.addColorStop(1, 'rgba(220,221,240,0)');
    g.fillStyle = glow; g.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    g.save();
    g.beginPath(); g.rect(0, 0, W, H); g.arc(mx + mr * 0.45, my - mr * 0.15, mr * 0.92, 0, Math.PI * 2);
    g.clip('evenodd');
    g.fillStyle = '#e6e7f2'; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    g.restore();

    // Rune circle behind the title
    const ringAlpha = 1 - dim * 0.75;
    const rcx = W * 0.5, rcy = H * 0.36, rr = Math.min(W, H) * 0.3;
    const tt = reduced ? 0 : t;
    drawRing(tt, rcx, rcy, rr, RUNES_OUTER, 1, ringAlpha);
    drawRing(tt, rcx, rcy, rr * 0.72, RUNES_INNER, -1.6, ringAlpha * 0.8);

    g.drawImage(skyline, 0, 0, W, H);

    // Gleam mites
    for (const m of mites) {
      if (!reduced) {
        m.x += m.vx + Math.sin(t * 0.0008 + m.p) * 0.15;
        m.y += m.vy + Math.cos(t * 0.0006 + m.p) * 0.1;
        if (m.x < -10) m.x = W + 10; if (m.x > W + 10) m.x = -10;
        if (m.y < H * 0.4) m.y = H + 10; if (m.y > H + 10) m.y = H * 0.4;
      }
      const a = 0.5 + Math.sin(t * 0.003 + m.p) * 0.4;
      g.fillStyle = `hsla(${m.hue},90%,70%,${a * 0.18})`;
      g.beginPath(); g.arc(m.x, m.y, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = `hsla(${m.hue},95%,80%,${a})`;
      g.fillRect(m.x - 0.8, m.y - 0.8, 1.6, 1.6);
    }

    if (dim > 0.01) {
      g.fillStyle = `rgba(8,10,28,${dim * 0.55})`;
      g.fillRect(0, 0, W, H);
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  // Redraw rune text once the runic font arrives.
  document.fonts?.load('20px "Noto Sans Runic"').catch(() => {});
  requestAnimationFrame(frame);

  return { setMode(m) { mode = m; } };
}
