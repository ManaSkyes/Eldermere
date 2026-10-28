// src/game/dummies.js — training dummies: straw men on posts to hit. Each takes blows (rocking with
// their force, a number floating up with the damage), shows how much it has taken in the last few
// seconds, and never breaks. They're targets for src/game/combat.js (and later spells).
//
//   const D = createDummies(THREE, scene, spots)   spots: [{ x, z, yaw }]
//   D.targets      the targets, for combat
//   D.update(dt)   rocking, floating numbers
//   D.shapes       solid posts, for the physics

export function createDummies(THREE, scene, spots) {
  const straw = new THREE.MeshStandardMaterial({ color: '#c8a85e', roughness: 1 }), wood = new THREE.MeshStandardMaterial({ color: '#6b4f33', roughness: 0.9 });
  const sack = new THREE.MeshStandardMaterial({ color: '#a88c62', roughness: 1 });
  const floats = [], targets = [], shapes = [];
  // floating damage numbers: one canvas sprite each, rising and fading over a second
  function floatText(text, pos, color = '#ffffff') {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const g = cv.getContext('2d');
    g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(text, 64, 32); g.fillStyle = color; g.fillText(text, 64, 32);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
    sp.scale.set(0.6, 0.3, 1); sp.position.set(pos.x + (Math.random() - 0.5) * 0.3, pos.y, pos.z + (Math.random() - 0.5) * 0.3); sp.renderOrder = 10; scene.add(sp);
    floats.push({ sp, t: 0 });
  }
  for (const s of spots) {
    const g = new THREE.Group(), rock = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 8), wood); post.position.y = 0.45; g.add(post);
    rock.position.y = 0.85; g.add(rock);                                                // rocks from the top of the post
    const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.75, 10), straw); bodyM.position.y = 0.4; rock.add(bodyM);
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), wood); arms.rotation.z = Math.PI / 2; arms.position.y = 0.6; rock.add(arms);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), sack); head.position.y = 0.95; rock.add(head);
    for (const m of [post, bodyM, arms, head]) { m.castShadow = true; m.receiveShadow = true; }
    g.position.set(s.x, 0, s.z); g.rotation.y = s.yaw || 0; scene.add(g);
    shapes.push({ type: 'box', min: [s.x - 0.12, 0, s.z - 0.12], max: [s.x + 0.12, 0.9, s.z + 0.12], surface: 'wood' });
    const t = {
      kind: 'dummy', pos: { x: s.x, y: 0, z: s.z }, radius: 0.28, height: 1.95, alive: true, material: 'wood',
      sway: { x: 0, z: 0, vx: 0, vz: 0 }, recent: 0, recentT: 9,
      hit(dmg, info) {
        // knocked away from the attacker, harder for a bigger stagger
        const dx = this.pos.x - (info.from?.x ?? this.pos.x), dz = this.pos.z - (info.from?.z ?? this.pos.z), l = Math.hypot(dx, dz) || 1;
        const k = Math.min(4, 1 + (info.stagger || 0) * 1.5);
        this.sway.vx += dx / l * k; this.sway.vz += dz / l * k;
        this.recent = (this.recentT < 3 ? this.recent : 0) + dmg; this.recentT = 0;
        floatText(dmg >= 10 ? Math.round(dmg) : dmg.toFixed(1), { x: this.pos.x, y: 2.1, z: this.pos.z }, info.charged > 0.9 ? '#ffd24a' : info.kind === 'fire' ? '#ff8a3a' : '#ffffff');
      },
    };
    t.rock = rock; t.group = g; targets.push(t);
  }
  return {
    targets, shapes,
    // the damage a dummy has taken in the last few seconds (for a readout)
    recentOf: t => t.recentT < 3 ? t.recent : 0,
    update(dt) {
      for (const t of targets) {
        const s = t.sway;
        // a damped spring back to upright; tilt about the post's top
        s.vx += (-s.x * 40 - s.vx * 5) * dt; s.vz += (-s.z * 40 - s.vz * 5) * dt;
        s.x += s.vx * dt; s.z += s.vz * dt;
        s.x = Math.max(-0.6, Math.min(0.6, s.x)); s.z = Math.max(-0.6, Math.min(0.6, s.z));
        const yaw = t.group.rotation.y, c = Math.cos(yaw), sn = Math.sin(yaw);
        const lx = s.x * c - s.z * sn, lz = s.x * sn + s.z * c;                      // into the dummy's own frame
        t.rock.rotation.set(lz, 0, -lx);
        t.recentT += dt;
      }
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i]; f.t += dt; f.sp.position.y += dt * 0.8; f.sp.material.opacity = Math.max(0, 1 - f.t);
        if (f.t > 1) { scene.remove(f.sp); f.sp.material.map.dispose(); f.sp.material.dispose(); floats.splice(i, 1); }
      }
    },
    floatText,
  };
}
