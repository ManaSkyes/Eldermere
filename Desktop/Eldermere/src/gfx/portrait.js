// src/gfx/portrait.js — procedural bust portrait. No image assets.
// look: { face:{w,h,ears,skin,horns,tusks,shoulders}, race, subrace, gender, cls, width,
//         skin, hair, eyes, hairStyle, facial, marking }

const W = 240, H = 280;

// ---------- color helpers ----------
const hexToRgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgb = c => `rgb(${c.map(v => Math.max(0, Math.min(255, Math.round(v)))).join(',')})`;
const shade = (hex, amt) => rgb(hexToRgb(hex).map(v => v + amt * 255));
const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgb(A.map((v, i) => v + (B[i] - v) * t)); };
const rgba = (hex, a) => { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

// Outfit per class: base color, trim color, style.
const OUTFITS = {
  none:          { base: '#4a3a2e', trim: '#7d6650', style: 'plain' },
  soldier:       { base: '#5c6470', trim: '#aab3c0', style: 'armor' },
  barbarian:     { base: '#4b3526', trim: '#8a6a4a', style: 'fur' },
  scout:         { base: '#34452f', trim: '#6f8a5a', style: 'plain' },
  rogue:         { base: '#23232e', trim: '#4f4f66', style: 'scarf' },
  mage:          { base: '#3a2d63', trim: '#b29cf0', style: 'robe' },
  cleric:        { base: '#d9d8e6', trim: '#b29cf0', style: 'vestment' },
  spellblade:    { base: '#2d2f45', trim: '#9b7fe6', style: 'armor' },
  medic:         { base: '#d6cfbf', trim: '#5c9a6e', style: 'plain' },
  doctor:        { base: '#2f4a40', trim: '#cfc6a8', style: 'robe' },
  hunter:        { base: '#5a4230', trim: '#9a8264', style: 'fur' },
  artisan:       { base: '#6a4a32', trim: '#3a2a20', style: 'apron' },
  merchantClass: { base: '#7a2e2e', trim: '#d9b25a', style: 'plain' },
  scholar:       { base: '#2a3150', trim: '#c9b98a', style: 'robe' },
};

export function drawPortrait(canvas, look) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);

  const F = look.face;
  const fem = look.gender === 'female';
  const type = F.skin || 'skin';
  const isDrac = look.race === 'draconian';
  const isPisc = look.race === 'piscine';
  const isAvian = look.subrace === 'avian';
  const isFur = type === 'fur';
  const skin = look.skin;

  // ---------- proportions ----------
  const fw = F.w, fh = F.h;
  const cx = 120, cy = 116 + (1 - fh) * 24;
  const rx = 40 * fw * (fem ? 0.94 : 1);
  const ry = 50 * fh * (fem ? 0.97 : 1);
  const jawW = rx * (fem ? 0.72 : 0.9) * (F.tusks ? 1.06 : 1);
  const jawY = cy + ry * (fem ? 0.55 : 0.6);
  const chinW = rx * (fem ? 0.24 : 0.4);
  const chinY = cy + ry;
  const shoulderW = 86 * look.width * (F.shoulders || 1) * (fem ? 0.88 : 1);
  const neckW = (fem ? 12 : 16) * fw * (look.width > 1.1 ? 1.15 : 1);
  const eyeY = cy + 2, eyeDx = 16 * fw;
  const mouthY = cy + ry * 0.66;

  const headPath = () => {
    g.beginPath();
    g.moveTo(cx - rx, cy);
    g.ellipse(cx, cy, rx, ry * 0.98, 0, Math.PI, 0);
    g.quadraticCurveTo(cx + rx, cy + ry * 0.35, cx + jawW, jawY);
    g.quadraticCurveTo(cx + chinW * 1.3, chinY - 2, cx + chinW, chinY - 1);
    g.quadraticCurveTo(cx, chinY + 3, cx - chinW, chinY - 1);
    g.quadraticCurveTo(cx - chinW * 1.3, chinY - 2, cx - jawW, jawY);
    g.quadraticCurveTo(cx - rx, cy + ry * 0.35, cx - rx, cy);
    g.closePath();
  };

  // ---------- 1. backdrop ----------
  const halo = g.createRadialGradient(cx, cy - 10, 10, cx, cy, 115);
  halo.addColorStop(0, 'rgba(178,156,240,0.22)');
  halo.addColorStop(1, 'rgba(178,156,240,0)');
  g.fillStyle = halo; g.fillRect(0, 0, W, H);

  const hasHair = !isDrac && !isAvian;
  const hair = look.hair;

  // ---------- 2. hair behind the body ----------
  if (hasHair && look.hairStyle === 'long') {
    g.fillStyle = shade(hair, -0.1);
    g.beginPath();
    g.moveTo(cx - rx - 10, cy - ry * 0.4);
    g.quadraticCurveTo(cx - rx - 22, cy + ry * 1.2, cx - rx - (fem ? 18 : 6), cy + ry * (fem ? 2.1 : 1.5));
    g.lineTo(cx + rx + (fem ? 18 : 6), cy + ry * (fem ? 2.1 : 1.5));
    g.quadraticCurveTo(cx + rx + 22, cy + ry * 1.2, cx + rx + 10, cy - ry * 0.4);
    g.closePath(); g.fill();
  }
  if (isAvian && look.hairStyle === 'plume') drawPlume(true);

  // ---------- 3. outfit ----------
  drawOutfit();

  // ---------- 4. neck ----------
  g.fillStyle = shade(skin, -0.1);
  g.fillRect(cx - neckW, jawY - 10, neckW * 2, chinY - jawY + 46);
  if (!fem && !isAvian) {
    g.strokeStyle = shade(skin, -0.2); g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, chinY + 20, 4, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  }
  if (isPisc) {
    g.strokeStyle = shade(skin, -0.3); g.lineWidth = 1.5;
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(cx + side * (neckW + 6), chinY + 12 + i * 6, 6, side > 0 ? Math.PI * 0.8 : -Math.PI * 0.2, side > 0 ? Math.PI * 1.2 : Math.PI * 0.2);
      g.stroke();
    }
  }

  // ---------- 5. side ears ----------
  drawSideEars();

  // ---------- 6. head + texture ----------
  const grad = g.createRadialGradient(cx - rx * 0.35, cy - ry * 0.45, 4, cx, cy, ry * 1.35);
  grad.addColorStop(0, shade(skin, 0.09));
  grad.addColorStop(1, shade(skin, -0.12));
  g.fillStyle = grad; headPath(); g.fill();

  g.save(); headPath(); g.clip();
  if (isDrac) texScales(skin, 0.15, 6);
  else if (isPisc) texScales(skin, 0.45, 5);
  else if (isAvian) texFeathers(skin);
  else if (isFur) texFur(skin);
  // jaw shadow for definition
  const js = g.createLinearGradient(0, jawY - 10, 0, chinY);
  js.addColorStop(0, 'rgba(0,0,0,0)'); js.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = js; g.fillRect(0, jawY - 10, W, chinY - jawY + 12);
  if (isFur || isAvian) {
    g.fillStyle = shade(skin, 0.2);
    g.beginPath(); g.ellipse(cx, mouthY - 4, rx * 0.46, ry * 0.3, 0, 0, Math.PI * 2); g.fill();
  }
  // cheek blush / contour
  if (!isDrac) {
    for (const side of [-1, 1]) {
      const c = g.createRadialGradient(cx + side * rx * 0.55, cy + ry * 0.3, 1, cx + side * rx * 0.55, cy + ry * 0.3, 14);
      c.addColorStop(0, fem ? 'rgba(220,110,120,0.18)' : 'rgba(0,0,0,0.08)');
      c.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = c; g.fillRect(0, 0, W, H);
    }
  }
  g.restore();

  // ---------- 7. markings ----------
  drawMarking();

  // ---------- 8. eyes & brows ----------
  drawEyes();

  // ---------- 9. nose, mouth, tusks ----------
  drawNoseMouth();

  // ---------- 10. facial hair, then tusks over it ----------
  drawFacialHair();
  drawTusks();

  // ---------- 11. top ears ----------
  drawTopEars(false);

  // ---------- 12. hair / horns / crest ----------
  if (isDrac) drawHorns();
  else if (isAvian) drawCrest();
  else drawHairFront();
  drawTopEars(true);

  // =========================================================
  function drawOutfit() {
    const o = OUTFITS[look.cls] || OUTFITS.none;
    const sy = chinY + 24;
    g.fillStyle = o.base;
    g.beginPath();
    g.moveTo(cx - shoulderW, H);
    g.quadraticCurveTo(cx - shoulderW, sy, cx - neckW - 10, sy - 6);
    g.lineTo(cx + neckW + 10, sy - 6);
    g.quadraticCurveTo(cx + shoulderW, sy, cx + shoulderW, H);
    g.closePath(); g.fill();

    // shading on the sides
    const sg = g.createLinearGradient(cx - shoulderW, 0, cx + shoulderW, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0.25)'); sg.addColorStop(0.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = sg; g.fill();

    g.strokeStyle = o.trim; g.lineWidth = 2.5; g.lineCap = 'round';
    const neckDepth = fem ? 40 : 30;
    if (o.style === 'robe') {
      g.beginPath(); g.moveTo(cx - neckW - 6, sy - 4); g.lineTo(cx - 4, H); g.stroke();
      g.beginPath(); g.moveTo(cx + neckW + 6, sy - 4); g.lineTo(cx + 4, H); g.stroke();
      g.fillStyle = shade(o.base, -0.06);
      g.beginPath(); g.moveTo(cx - neckW - 8, sy - 6); g.lineTo(cx - neckW - 2, sy - 18); g.lineTo(cx + neckW + 2, sy - 18); g.lineTo(cx + neckW + 8, sy - 6); g.fill();
    } else if (o.style === 'vestment') {
      g.beginPath(); g.moveTo(cx - neckW - 4, sy - 4); g.quadraticCurveTo(cx, sy + 26, cx + neckW + 4, sy - 4); g.stroke();
      // crescent emblem
      g.save(); g.shadowColor = o.trim; g.shadowBlur = 8;
      g.fillStyle = o.trim;
      g.beginPath(); g.arc(cx, sy + 44, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = o.base; g.beginPath(); g.arc(cx + 4, sy + 42, 8, 0, Math.PI * 2); g.fill();
      g.restore();
    } else if (o.style === 'scarf') {
      g.fillStyle = o.trim;
      g.beginPath(); g.ellipse(cx, sy + 2, neckW + 16, 12, 0, 0, Math.PI * 2); g.fill();
    } else if (o.style === 'apron') {
      g.beginPath(); g.moveTo(cx - neckW - 4, sy - 2); g.lineTo(cx, sy + neckDepth); g.lineTo(cx + neckW + 4, sy - 2); g.stroke();
      g.fillStyle = o.trim; g.fillRect(cx - shoulderW * 0.45, sy + 34, shoulderW * 0.9, H);
      g.strokeStyle = '#2a1e16'; g.beginPath(); g.moveTo(cx - shoulderW * 0.45, sy + 34); g.lineTo(cx - neckW, sy - 4); g.moveTo(cx + shoulderW * 0.45, sy + 34); g.lineTo(cx + neckW, sy - 4); g.stroke();
    } else {
      g.beginPath(); g.moveTo(cx - neckW - 6, sy - 4); g.lineTo(cx, sy + neckDepth); g.lineTo(cx + neckW + 6, sy - 4); g.stroke();
    }

    if (o.style === 'armor') {
      for (const side of [-1, 1]) {
        const px = cx + side * shoulderW * 0.72;
        const pg = g.createRadialGradient(px - side * 6, sy + 2, 2, px, sy + 10, 34);
        pg.addColorStop(0, shade(o.trim, 0.1)); pg.addColorStop(1, shade(o.base, -0.05));
        g.fillStyle = pg;
        g.beginPath(); g.ellipse(px, sy + 14, shoulderW * 0.36, 22, side * 0.25, Math.PI, 0); g.fill();
        g.strokeStyle = o.trim; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(px, sy + 18, shoulderW * 0.3, 14, side * 0.25, Math.PI * 1.05, -0.05); g.stroke();
      }
    }
    if (o.style === 'fur') {
      const r = rng(31);
      for (let i = 0; i < 70; i++) {
        const t = r();
        const x = cx - shoulderW * 0.85 + t * shoulderW * 1.7;
        const y = sy - 4 + Math.abs(t - 0.5) * 18 + r() * 10;
        g.fillStyle = r() > 0.5 ? o.trim : shade(o.trim, -0.12);
        g.beginPath(); g.ellipse(x, y, 7, 10, r() - 0.5, 0, Math.PI * 2); g.fill();
      }
    }
    if (fem && o.style !== 'armor' && o.style !== 'fur' && o.style !== 'scarf') {
      // collarbone hint
      g.strokeStyle = rgba(skin, 0.5); g.lineWidth = 1.2;
      for (const side of [-1, 1]) {
        g.beginPath(); g.moveTo(cx + side * 5, sy + 6); g.quadraticCurveTo(cx + side * 14, sy + 2, cx + side * 22, sy + 4); g.stroke();
      }
    }
  }

  function drawSideEars() {
    const ears = F.ears;
    for (const side of [-1, 1]) {
      const ex = cx + side * (rx - 3);
      g.fillStyle = shade(skin, -0.05);
      g.beginPath();
      if (ears === 'pointed' || ears === 'halfPointed') {
        const len = ears === 'pointed' ? (look.subrace === 'dark' ? 34 : 28) : 14;
        g.moveTo(ex, cy - 6);
        g.quadraticCurveTo(ex + side * len * 0.6, cy - 12 - len * 0.4, ex + side * len, cy - 10 - len * 0.6);
        g.quadraticCurveTo(ex + side * len * 0.5, cy + 6, ex, cy + 16);
        g.fill();
        g.strokeStyle = shade(skin, -0.2); g.lineWidth = 1;
        g.beginPath(); g.moveTo(ex + side * 3, cy + 6); g.quadraticCurveTo(ex + side * len * 0.4, cy - 4, ex + side * len * 0.8, cy - 8 - len * 0.5); g.stroke();
      } else if (ears === 'round' || ears === 'beast') {
        g.ellipse(ex + side * 2, cy + 4, 8, 13, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = shade(skin, -0.2); g.lineWidth = 1;
        g.beginPath(); g.ellipse(ex + side * 3, cy + 4, 4, 8, 0, side > 0 ? -1.2 : 1.9, side > 0 ? 1.2 : 4.4); g.stroke();
      } else if (ears === 'fins') {
        g.fillStyle = mix(skin, '#a8d8e8', 0.4);
        g.globalAlpha = 0.85;
        g.moveTo(ex, cy - 10);
        g.lineTo(ex + side * 30, cy - 22);
        g.lineTo(ex + side * 26, cy - 6);
        g.lineTo(ex + side * 30, cy + 8);
        g.lineTo(ex + side * 22, cy + 18);
        g.lineTo(ex, cy + 16);
        g.closePath(); g.fill(); g.globalAlpha = 1;
        g.strokeStyle = shade(skin, -0.1); g.lineWidth = 1.3;
        for (const [tx, ty] of [[30, -22], [26, -6], [30, 8], [22, 18]]) {
          g.beginPath(); g.moveTo(ex, cy + 2); g.lineTo(ex + side * tx, cy + ty); g.stroke();
        }
      } else if (ears === 'feathers') {
        for (let i = 0; i < 4; i++) {
          g.fillStyle = shade(skin, -0.05 - i * 0.04);
          g.beginPath();
          g.ellipse(ex + side * (6 + i * 4), cy - 4 + i * 5, 12, 4, side * (0.5 + i * 0.15), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  function drawTopEars(front) {
    const ears = F.ears;
    if (ears !== 'cat' && ears !== 'boar') return;
    for (const side of [-1, 1]) {
      const bx = cx + side * rx * 0.62, by = cy - ry * 0.72;
      if (ears === 'cat') {
        if (!front) continue;
        g.fillStyle = skin;
        g.beginPath(); g.moveTo(bx - 14, by + 8); g.lineTo(bx + side * 8, by - 34); g.lineTo(bx + 16, by + 6); g.closePath(); g.fill();
        g.fillStyle = mix(skin, '#e8a0a8', 0.55);
        g.beginPath(); g.moveTo(bx - 7, by + 4); g.lineTo(bx + side * 7, by - 24); g.lineTo(bx + 9, by + 3); g.closePath(); g.fill();
      } else {
        if (front) continue;
        g.fillStyle = shade(skin, -0.05);
        g.beginPath();
        g.moveTo(bx - 10, by + 2);
        g.quadraticCurveTo(bx + side * 30, by - 22, bx + side * 34, by + 6);
        g.quadraticCurveTo(bx + side * 18, by + 10, bx + 10 * side, by + 14);
        g.closePath(); g.fill();
        g.fillStyle = mix(skin, '#c88a8a', 0.4);
        g.beginPath(); g.ellipse(bx + side * 16, by - 2, 7, 4, side * -0.5, 0, Math.PI * 2); g.fill();
      }
    }
  }

  function texScales(color, minEdge, step) {
    g.strokeStyle = shade(color, -0.22); g.lineWidth = 1;
    for (let y = cy - ry; y < chinY + 4; y += step) {
      const row = Math.round((y - cy) / step);
      for (let x = cx - rx; x < cx + rx; x += step * 1.6) {
        const xx = x + (row % 2 ? step * 0.8 : 0);
        const d = Math.hypot((xx - cx) / rx, (y - cy + 6) / ry);
        const a = Math.max(0, Math.min(1, (d - minEdge) * 1.6));
        if (a <= 0.02) continue;
        g.globalAlpha = a * 0.6;
        g.beginPath(); g.arc(xx, y, step * 0.8, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      }
    }
    g.globalAlpha = 1;
    // a lighter band down the center, like belly scales
    if (isDrac) {
      const b = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
      b.addColorStop(0, 'rgba(255,255,255,0)'); b.addColorStop(0.5, 'rgba(255,240,200,0.12)'); b.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = b; g.fillRect(cx - rx, mouthY - 10, rx * 2, ry);
    }
  }

  function texFur(color) {
    const r = rng(11);
    g.lineWidth = 1.2; g.lineCap = 'round';
    for (let i = 0; i < 420; i++) {
      const x = cx - rx + r() * rx * 2, y = cy - ry + r() * ry * 2;
      const ang = Math.atan2(y - (cy - 10), x - cx) + (r() - 0.5) * 0.6;
      const len = 3 + r() * 5;
      g.strokeStyle = r() > 0.45 ? `rgba(0,0,0,${0.12 + r() * 0.1})` : `rgba(255,255,255,${0.08 + r() * 0.08})`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
    }
  }

  function texFeathers(color) {
    const r = rng(23);
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.55 + r() * 0.5;
      const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
      g.fillStyle = r() > 0.5 ? shade(color, -0.12) : shade(color, 0.06);
      g.beginPath(); g.ellipse(x, y, 9, 3.5, a + Math.PI / 2 + (r() - 0.5) * 0.4, 0, Math.PI * 2); g.fill();
    }
  }

  function drawMarking() {
    const m = look.marking;
    if (!m || m === 'none') return;
    if (m === 'freckles') {
      const r = rng(5);
      g.fillStyle = rgba('#5a3020', 0.45);
      for (let i = 0; i < 26; i++) {
        const side = i % 2 ? 1 : -1;
        g.beginPath(); g.arc(cx + side * (8 + r() * 22), cy + 10 + r() * 14, 0.9 + r() * 0.7, 0, Math.PI * 2); g.fill();
      }
    } else if (m === 'scar') {
      g.strokeStyle = mix(skin, '#e0a0a0', 0.5); g.lineWidth = 2.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - eyeDx - 6, eyeY - 18); g.lineTo(cx - eyeDx + 8, eyeY + 22); g.stroke();
      g.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const t = i / 3, x = cx - eyeDx - 6 + t * 14, y = eyeY - 18 + t * 40;
        g.beginPath(); g.moveTo(x - 3, y + 1); g.lineTo(x + 3, y - 1); g.stroke();
      }
    } else if (m === 'crescent') {
      g.save(); g.shadowColor = '#b29cf0'; g.shadowBlur = 10;
      g.fillStyle = '#d8ccff';
      g.beginPath(); g.arc(cx, cy - ry * 0.48, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = shade(skin, 0.05);
      g.beginPath(); g.arc(cx + 3, cy - ry * 0.5, 5.4, 0, Math.PI * 2); g.fill();
      g.restore();
    } else if (m === 'paint') {
      g.strokeStyle = 'rgba(160,40,40,0.75)'; g.lineWidth = 3; g.lineCap = 'round';
      for (const side of [-1, 1]) for (let i = 0; i < 2; i++) {
        g.beginPath(); g.moveTo(cx + side * (12 + i * 7), eyeY + 10); g.lineTo(cx + side * (16 + i * 7), eyeY + 26); g.stroke();
      }
    }
  }

  function drawEyes() {
    const slit = isDrac || F.ears === 'cat';
    const big = isPisc;
    for (const side of [-1, 1]) {
      const ex = cx + side * eyeDx;
      const ew = big ? 9 : fem ? 8.5 : 8, eh = big ? 6 : fem ? 5 : 4.2;
      // socket shadow
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.beginPath(); g.ellipse(ex, eyeY - 1, ew + 3, eh + 3, 0, 0, Math.PI * 2); g.fill();
      // white (almond)
      g.fillStyle = isPisc ? '#1a1f30' : 'rgba(242,240,248,0.95)';
      g.beginPath();
      g.moveTo(ex - ew, eyeY);
      g.quadraticCurveTo(ex, eyeY - eh * 1.6 - (fem ? 1 : 0), ex + ew, eyeY - side * (fem ? 1.5 : 0.5));
      g.quadraticCurveTo(ex, eyeY + eh * 1.3, ex - ew, eyeY);
      g.fill();
      g.save(); g.clip();
      g.shadowColor = look.eyes; g.shadowBlur = 8;
      g.fillStyle = look.eyes;
      const ir = big ? 5 : 4;
      g.beginPath(); g.arc(ex, eyeY, ir, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#0e0e1c';
      g.beginPath();
      if (slit) g.ellipse(ex, eyeY, 1.1, ir * 0.9, 0, 0, Math.PI * 2);
      else g.arc(ex, eyeY, big ? 2.6 : 1.7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath(); g.arc(ex - 1.5, eyeY - 1.5, 1, 0, Math.PI * 2); g.fill();
      g.restore();
      // upper lid line
      g.strokeStyle = fem ? '#1e1a24' : shade(skin, -0.35); g.lineWidth = fem ? 1.8 : 1.3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - ew, eyeY);
      g.quadraticCurveTo(ex, eyeY - eh * 1.6 - (fem ? 1 : 0), ex + ew, eyeY - side * (fem ? 1.5 : 0.5)); g.stroke();
      if (fem) {
        g.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const lx = ex + side * (ew - 1 - i * 2.5), ly = eyeY - side * 1 - eh * (0.5 + i * 0.25);
          g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + side * 3, ly - 3); g.stroke();
        }
      }

      // brows
      const browY = eyeY - (fem ? 11 : 10);
      if (isDrac) {
        g.strokeStyle = shade(skin, -0.2); g.lineWidth = 5;
        g.beginPath(); g.moveTo(ex - side * 9, browY + 1); g.quadraticCurveTo(ex, browY - 3, ex + side * 11, browY - 1); g.stroke();
      } else {
        g.strokeStyle = isAvian ? shade(hair, -0.05) : shade(hair, -0.08);
        g.lineWidth = fem ? 2.2 : 3.6;
        g.beginPath();
        g.moveTo(ex - side * 8, browY + (fem ? 1 : 0));
        if (fem) g.quadraticCurveTo(ex + side * 2, browY - 4, ex + side * 10, browY - 1);
        else g.quadraticCurveTo(ex + side * 2, browY - 2, ex + side * 10, browY);
        g.stroke();
      }
    }
  }

  function drawNoseMouth() {
    const nY = eyeY + 18;
    g.lineCap = 'round';
    if (isDrac) {
      g.fillStyle = shade(skin, -0.35);
      for (const side of [-1, 1]) { g.beginPath(); g.ellipse(cx + side * 4, nY, 1.2, 2.6, side * 0.5, 0, Math.PI * 2); g.fill(); }
    } else if (F.ears === 'cat') {
      g.fillStyle = mix(skin, '#6a3a40', 0.6);
      g.beginPath(); g.moveTo(cx - 5, nY - 3); g.lineTo(cx + 5, nY - 3); g.lineTo(cx, nY + 2); g.closePath(); g.fill();
      g.strokeStyle = shade(skin, -0.35); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(cx, nY + 2); g.lineTo(cx, nY + 7); g.stroke();
      g.beginPath(); g.arc(cx - 4, nY + 7, 4, 0, Math.PI * 0.9); g.stroke();
      g.beginPath(); g.arc(cx + 4, nY + 7, 4, Math.PI * 0.1, Math.PI); g.stroke();
      // whisker dots
      g.fillStyle = shade(skin, -0.3);
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx + side * (10 + i * 3), nY + 3 + i * 2, 0.9, 0, Math.PI * 2); g.fill(); }
      return;
    } else if (F.ears === 'boar') {
      g.fillStyle = mix(skin, '#8a5a50', 0.5);
      g.beginPath(); g.ellipse(cx, nY + 2, 10, 6.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a1a18';
      for (const side of [-1, 1]) { g.beginPath(); g.ellipse(cx + side * 3.5, nY + 2, 1.6, 2.4, 0, 0, Math.PI * 2); g.fill(); }
    } else if (isAvian) {
      g.fillStyle = '#c9a23a';
      g.beginPath(); g.moveTo(cx - 6, nY - 6); g.quadraticCurveTo(cx, nY - 10, cx + 6, nY - 6); g.lineTo(cx, nY + 6); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.stroke();
    } else {
      g.strokeStyle = shade(skin, -0.25); g.lineWidth = fem ? 1.5 : 2;
      g.beginPath(); g.moveTo(cx - 1, eyeY + 6); g.quadraticCurveTo(cx - 4, nY - 2, cx - 4, nY);
      g.quadraticCurveTo(cx, nY + 3, cx + 4, nY); g.stroke();
    }

    // mouth
    const mw = fem ? 9 : 10;
    if (fem && !isAvian) {
      const lip = mix(skin, '#b04a5e', isDrac ? 0.15 : 0.4);
      g.fillStyle = lip;
      g.beginPath();
      g.moveTo(cx - mw, mouthY);
      g.quadraticCurveTo(cx - 3, mouthY - 4, cx, mouthY - 2);
      g.quadraticCurveTo(cx + 3, mouthY - 4, cx + mw, mouthY);
      g.quadraticCurveTo(cx, mouthY + 7, cx - mw, mouthY);
      g.fill();
      g.strokeStyle = shade(skin, -0.35); g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - mw, mouthY); g.quadraticCurveTo(cx, mouthY + 1.5, cx + mw, mouthY); g.stroke();
    } else {
      g.strokeStyle = shade(skin, -0.32); g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - mw, mouthY); g.quadraticCurveTo(cx, mouthY + 2.5, cx + mw, mouthY); g.stroke();
      g.strokeStyle = shade(skin, -0.12); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx - 5, mouthY + 6); g.quadraticCurveTo(cx, mouthY + 8, cx + 5, mouthY + 6); g.stroke();
    }

  }

  function drawTusks() {
    const mw = fem ? 9 : 10;
    if (F.tusks) {
      g.fillStyle = '#efe6cf'; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + side * (mw - 2), mouthY + 2);
        g.quadraticCurveTo(cx + side * (mw + 6), mouthY - 6, cx + side * (mw + 4), mouthY - 16);
        g.quadraticCurveTo(cx + side * (mw + 2), mouthY - 4, cx + side * (mw - 6), mouthY + 1);
        g.closePath(); g.fill(); g.stroke();
      }
    }
  }

  function drawFacialHair() {
    const f = look.facial;
    if (!f || f === 'none' || fem || isDrac || isAvian || isPisc) return;
    g.fillStyle = hair;
    if (f === 'stubble') {
      g.save(); headPath(); g.clip();
      const r = rng(9);
      g.fillStyle = rgba(hair, 0.5);
      for (let i = 0; i < 500; i++) {
        const x = cx - rx + r() * rx * 2, y = mouthY - 14 + r() * (chinY - mouthY + 16);
        const inMouth = Math.abs(x - cx) < 10 && Math.abs(y - mouthY) < 3;
        const onJaw = y > cy + ry * 0.3 && (Math.abs(x - cx) > rx * 0.55 || y > mouthY - 8);
        if (onJaw && !inMouth) g.fillRect(x, y, 0.9, 0.9);
      }
      g.restore();
    } else if (f === 'goatee') {
      g.beginPath();
      g.moveTo(cx - 9, mouthY + 4); g.quadraticCurveTo(cx, mouthY + 24, cx + 9, mouthY + 4);
      g.quadraticCurveTo(cx, mouthY + 9, cx - 9, mouthY + 4); g.fill();
      g.beginPath(); g.moveTo(cx - 11, mouthY - 2); g.quadraticCurveTo(cx, mouthY - 9, cx + 11, mouthY - 2);
      g.quadraticCurveTo(cx, mouthY - 4, cx - 11, mouthY - 2); g.fill();
    } else if (f === 'beard') {
      g.beginPath();
      g.moveTo(cx - rx + 1, cy + 6);
      g.quadraticCurveTo(cx - rx, cy + ry * 0.4, cx - jawW, jawY);
      g.quadraticCurveTo(cx - chinW * 1.4, chinY + 16, cx, chinY + 20);
      g.quadraticCurveTo(cx + chinW * 1.4, chinY + 16, cx + jawW, jawY);
      g.quadraticCurveTo(cx + rx, cy + ry * 0.4, cx + rx - 1, cy + 6);
      g.lineTo(cx + rx - 8, cy + 10);
      g.quadraticCurveTo(cx + 14, mouthY - 8, cx, mouthY - 6);
      g.quadraticCurveTo(cx - 14, mouthY - 8, cx - rx + 8, cy + 10);
      g.closePath(); g.fill();
      g.fillStyle = shade(skin, -0.32);
      g.beginPath(); g.ellipse(cx, mouthY + 1, 7, 2, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba('#ffffff', 0.12); g.lineWidth = 1;
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx + i * 6, mouthY + 6); g.lineTo(cx + i * 5, chinY + 14); g.stroke(); }
    }
  }

  function hairCap(sideDrop, fringeDepth) {
    const top = cy - ry;
    g.beginPath();
    g.moveTo(cx - rx - 3, cy + sideDrop);
    g.quadraticCurveTo(cx - rx - 4, top - 12, cx, top - 11);
    g.quadraticCurveTo(cx + rx + 4, top - 12, cx + rx + 3, cy + sideDrop);
    g.lineTo(cx + rx - 3, cy - 6);
    g.quadraticCurveTo(cx + rx - 10, top + fringeDepth, cx + 8, top + fringeDepth - 2);
    g.quadraticCurveTo(cx - rx * 0.5, top + fringeDepth + 8, cx - rx + 2, cy - 4);
    g.closePath();
  }

  function drawHairFront() {
    const st = look.hairStyle;
    const top = cy - ry;
    g.fillStyle = hair;
    if (st === 'shaved') {
      g.save(); headPath(); g.clip();
      g.fillStyle = rgba(hair, 0.45);
      g.beginPath(); g.ellipse(cx, cy - 4, rx + 2, ry * 0.98, 0, Math.PI, 0); g.lineTo(cx + rx, cy - ry * 0.35); g.lineTo(cx - rx, cy - ry * 0.35); g.fill();
      g.restore();
      return;
    }
    if (st === 'messy') {
      g.beginPath();
      g.moveTo(cx - rx - 4, cy);
      const spikes = 10;
      for (let i = 0; i <= spikes; i++) {
        const t = i / spikes;
        const x = cx - rx - 4 + t * (rx * 2 + 8);
        const yBase = top + 20 + Math.pow(Math.abs(t - 0.5) * 2, 2) * 30;
        g.lineTo(x - 6, yBase);
        g.lineTo(x + (i % 3 - 1) * 3, yBase - 16 - (i % 2) * 7);
      }
      g.lineTo(cx + rx + 4, cy);
      g.quadraticCurveTo(cx + rx + 2, top - 8, cx, top - 10);
      g.quadraticCurveTo(cx - rx - 2, top - 8, cx - rx - 4, cy);
      g.fill();
    } else {
      const long = st === 'long';
      hairCap(long ? 24 : st === 'short' ? 2 : -4, st === 'tied' || st === 'braid' ? 14 : fem ? 26 : 22);
      g.fill();
      if (long) {
        // locks framing the face
        for (const side of [-1, 1]) {
          g.beginPath();
          g.moveTo(cx + side * (rx + 3), cy - 10);
          g.quadraticCurveTo(cx + side * (rx + 8), cy + ry * 0.9, cx + side * (rx - 2), chinY + (fem ? 40 : 20));
          g.quadraticCurveTo(cx + side * (rx - 10), cy + ry * 0.6, cx + side * (rx - 6), cy - 6);
          g.closePath(); g.fill();
        }
      }
      if (st === 'tied') {
        g.beginPath(); g.arc(cx + rx * 0.15, top - 14, 13, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#7a6040'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(cx + rx * 0.15, top - 2, 6, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      }
      if (st === 'braid') {
        let bx = cx + rx - 4, by = cy + 10;
        for (let i = 0; i < 7; i++) {
          g.fillStyle = i % 2 ? shade(hair, -0.1) : hair;
          g.beginPath(); g.ellipse(bx + (i % 2 ? 3 : -3), by, 7 - i * 0.4, 9, 0.2, 0, Math.PI * 2); g.fill();
          by += 13; bx += 2;
        }
        g.fillStyle = '#7a6040'; g.fillRect(bx - 5, by - 6, 10, 4);
      }
    }
  }

  function drawHorns() {
    const bone = '#e2d6bc';
    const st = look.hairStyle;
    const top = cy - ry;
    const hornFill = (x0, y0) => {
      const hg = g.createLinearGradient(x0, y0, x0, y0 - 60);
      hg.addColorStop(0, shade(skin, -0.1)); hg.addColorStop(0.35, bone); hg.addColorStop(1, '#f6f0e2');
      return hg;
    };
    for (const side of [-1, 1]) {
      const hx = cx + side * rx * 0.55, hy = top + ry * 0.22;
      g.fillStyle = hornFill(hx, hy);
      g.beginPath();
      if (st === 'ram') {
        g.strokeStyle = hornFill(hx, hy); g.lineWidth = 11; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(hx, hy);
        g.bezierCurveTo(hx + side * 30, hy - 30, hx + side * 46, hy + 10, hx + side * 30, hy + 26);
        g.quadraticCurveTo(hx + side * 18, hy + 34, hx + side * 22, hy + 16);
        g.stroke();
        continue;
      } else if (st === 'crown') {
        for (let i = 0; i < 3; i++) {
          const bx = cx + side * (6 + i * 13), by = top + 4 + i * 6;
          g.moveTo(bx - 5, by + 6); g.lineTo(bx + side * 4, by - 20 + i * 4); g.lineTo(bx + 5, by + 6);
        }
      } else {
        g.moveTo(hx - 7, hy + 6);
        g.bezierCurveTo(hx + side * 10, hy - 20, hx + side * 30, hy - 34, hx + side * 52, hy - 40);
        g.bezierCurveTo(hx + side * 30, hy - 22, hx + side * 18, hy - 6, hx + 8, hy + 8);
        g.closePath();
      }
      g.fill();
    }
    // forehead ridge scales
    g.fillStyle = shade(skin, -0.15);
    for (let i = -2; i <= 2; i++) {
      g.beginPath(); g.ellipse(cx + i * 7, top + 10 + Math.abs(i) * 2, 4, 6, 0, 0, Math.PI * 2); g.fill();
    }
  }

  function drawPlume(back) {
    if (!back) return;
    g.fillStyle = shade(hair, -0.05);
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse(cx + 14 + i * 8, cy - ry * 0.5 + i * 18, 8, 26, -0.6 + i * 0.1, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawCrest() {
    const st = look.hairStyle;
    const top = cy - ry;
    // feather cap
    g.fillStyle = shade(skin, -0.06);
    g.beginPath(); g.ellipse(cx, cy - 4, rx + 3, ry, 0, Math.PI, 0); g.lineTo(cx + rx, cy - ry * 0.3);
    g.quadraticCurveTo(cx, top + 26, cx - rx, cy - ry * 0.3); g.fill();
    const count = st === 'crest' ? 7 : 5;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      g.fillStyle = i % 2 ? hair : shade(hair, -0.12);
      g.beginPath();
      if (st === 'crest') {
        const ang = -0.7 + t * 1.4;
        g.ellipse(cx + Math.sin(ang) * 18, top - 10 - Math.cos(ang) * 14, 5, 22, ang, 0, Math.PI * 2);
      } else if (st === 'swept') {
        g.ellipse(cx + 10 + t * 16, top + 2 + t * 8, 5, 24, 1.1 + t * 0.2, 0, Math.PI * 2);
      } else {
        g.ellipse(cx + 8 + t * 20, top - 4 + t * 6, 6, 20, 0.6 + t * 0.4, 0, Math.PI * 2);
      }
      g.fill();
    }
  }
}
