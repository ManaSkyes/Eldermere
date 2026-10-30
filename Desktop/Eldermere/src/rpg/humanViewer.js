// src/rpg/humanViewer.js — step 1 test viewer for the morphable human.
// Builds the body, clothing shells and eyes, and wires the sliders.
import { macroWeights, DEFAULT_PARAMS } from './human.js';
import { labelFor, detailWeights } from './humanSliders.js';
import { createRig, applyPose, lookTwist, squatDrop } from './humanRig.js';
import { GARMENTS, makeGarment, fitGarment, fitHang, layerOver, makeShoes, fitShoes, HANG_SIZE } from './clothing.js';
import { makeSpringSkirt } from './springBones.js';
import { makeSkinDetail, SCAR_TYPES, DETAIL_DEFAULTS } from './skinDetail.js';
import { addCustomMorphs, addSpeciesTargets } from './customMorphs.js';
import { RACES, raceLayer } from './races.js';
import { createBodyState, resolveBody, BODY_PARTS, HUMAN } from './bodyState.js';
import { makeTail, makeCape } from './tailCape.js';
import { WEAPONS, weaponMaterials } from './weapons.js';
import { ITEMS, SLOTS, OUTFIT_PRESETS, createEquipment, traitsOf } from './equipment.js';
import { PARTS, placePart, partAnchors, partOptions, featherTexture, tube } from './attachments.js';
import { createHairGroom } from './hairGroom.js';
import { createLods } from './meshLod.js';
import { MOVES } from './moves.js';
import { comboLength, heavyLength, comboStep } from './combos.js';
import { SWORD_CLIPS, SWORD_STANCE, SHIELD_POSES } from './swordArts.js';
import { makeHair, DEFAULT_HAIR, BROW_STYLES, browDecal, browUVs, paintBrows, lashUVs, paintLashes } from './hair.js';
import { buildScalpGroom, GROOM_STYLE_NAMES } from './hairScalp.js';

export function startViewer(THREE, human, ui) {
  addCustomMorphs(human); addSpeciesTargets(human);
  // ui.mode 'creator': player-facing controls in tabs (Body, Face, Hair, Skin), developer panels hidden,
  // the canvas sized by its own box (not the window), and a small API returned for the game
  const creator = ui.mode === 'creator';
  // ui.mode 'game': no renderer, camera or stage of its own. The game puts `root` in its own scene and
  // drives the pose with drive(); the viewer keeps the body, clothes, hair and their physics updated.
  const game = ui.mode === 'game';
  ui.presets = ui.presets || []; ui.views = ui.views || [];
  const changeListeners = []; let changeQueued = false;
  const emitChange = () => { if (changeQueued) return; changeQueued = true; requestAnimationFrame(() => { changeQueued = false; changeListeners.forEach(f => f()); }); };
  const canvas = ui.canvas;
  const renderer = game ? null : new THREE.WebGLRenderer({ canvas, antialias: true });
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x231812);
  scene.fog = new THREE.Fog(0x231812, 5, 11);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 50);
  scene.add(new THREE.HemisphereLight(0xffe8d4, 0x3a2a24, 0.55));
  const key = new THREE.DirectionalLight(0xffe2c8, 1.5); key.position.set(-1.4, 2.6, 2.2);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 2.2, bottom: -0.2 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.01; scene.add(key);
  const fill = new THREE.DirectionalLight(0xd8c8ff, 0.35); fill.position.set(2, 1.2, 1.5); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xa9c0ff, 0.85); rim.position.set(1.2, 2, -2.2); scene.add(rim);
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

  // ---- floor ----
  const fc = document.createElement('canvas'); fc.width = fc.height = 256;
  { const g = fc.getContext('2d'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#553826' : '#5e402c'; g.fillRect(0, i * 32, 256, 31); g.fillStyle = '#3a2618'; g.fillRect(0, i * 32 + 31, 256, 1); } }
  const ft = new THREE.CanvasTexture(fc); ft.encoding = THREE.sRGBEncoding; ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(4, 4);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // ---- character: one shared position buffer drives body and clothing ----
  const meta = human.meta, N = human.count;
  const root = new THREE.Group(); root.scale.setScalar(0.1); scene.add(root);   // data is in decimeters
  const posAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  // Skinning: the same bone influences drive the body and every clothing shell.
  const skinIndex = new THREE.Uint16BufferAttribute(meta.skinIndex, 4);
  const skinWeight = new THREE.Float32BufferAttribute(meta.skinWeight.map(w => w / 255), 4);
  const rig = createRig(THREE, meta);
  // Binding a mesh without a bind matrix makes three.js re-record the skeleton's rest pose from the
  // bones as they are right now. In first person the head bone is shrunk, so always record it full size.
  { const calc = rig.skeleton.calculateInverses.bind(rig.skeleton);
    rig.skeleton.calculateInverses = () => {
      const h = rig.byName.head, sc = h ? h.scale.x : 1;
      if (sc !== 1) { h.scale.setScalar(1); h.updateMatrixWorld(true); }
      calc();
      if (sc !== 1) { h.scale.setScalar(sc); h.updateMatrixWorld(true); }
    }; }
  rig.roots.forEach(b => root.add(b));
  const skinned = [];
  const makeSkinned = (geo, mat) => {
    geo.setAttribute('skinIndex', skinIndex); geo.setAttribute('skinWeight', skinWeight);
    const m = new THREE.SkinnedMesh(geo, mat); m.bind(rig.skeleton); m.frustumCulled = false; skinned.push(m); return m;
  };
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', posAttr);
  bodyGeo.setIndex(meta.bodyTris);
  const skinMat = new THREE.MeshPhysicalMaterial({ color: lin('#e8c4ae'), roughness: 0.55, sheen: lin('#ffe0d0'), skinning: true });
  const body = makeSkinned(bodyGeo, skinMat); body.castShadow = body.receiveShadow = true; root.add(body);
  // skin detail: freckles, moles, pigment patches, pore texture and scars (face and body separately)
  const skinDetail = makeSkinDetail(THREE, meta, skinMat, bodyGeo), detail = DETAIL_DEFAULTS();
  skinDetail.apply(detail);
  // shell fur / feathers: copies of the body pushed out from the skin (used by furred and feathered races)
  const SHELLS = 6;
  // the shells' own geometry: the body's vertex data, but only the triangles that can grow fur
  const shellGeo = new THREE.BufferGeometry();
  for (const [k, v] of Object.entries(bodyGeo.attributes)) shellGeo.setAttribute(k, v);
  shellGeo.setIndex(meta.bodyTris.slice(0, 3));
  let shellClothed = new Float32Array(meta.vertexCount), shellKey = '';
  const faceMaskArr = bodyGeo.attributes.faceMask.array;
  function updateShellTris(faceAmt, bodyAmt) {
    const key = faceAmt.toFixed(2) + bodyAmt.toFixed(2) + shellClothedVersion;
    if (key === shellKey) return; shellKey = key;
    const T = meta.bodyTris, keep = [];
    for (let t = 0; t < T.length; t += 3) {
      const a = T[t], b = T[t + 1], c = T[t + 2];
      if (shellClothed[a] && shellClothed[b] && shellClothed[c]) continue;               // under clothing
      const f = (faceMaskArr[a] + faceMaskArr[b] + faceMaskArr[c]) / 3;
      if ((f > 0.5 ? faceAmt : f < 0.05 ? bodyAmt : Math.max(faceAmt, bodyAmt)) < 0.02) continue;   // no covering here
      keep.push(a, b, c);
    }
    shellGeo.setIndex(keep.length ? keep : [0, 0, 0]);
  }
  let shellClothedVersion = 0;
  const shellMeshes = Array.from({ length: SHELLS }, (_, i) => {
    const m = new THREE.SkinnedMesh(shellGeo, skinDetail.shellMaterial(i, SHELLS));
    m.bind(rig.skeleton); m.frustumCulled = false; m.visible = false; m.castShadow = false; m.receiveShadow = true; m.userData.noLod = true;   // (the shells change their own triangle list)
    skinned.push(m); root.add(m); return m;
  });

  // Clothing: garments cut cleanly from the body surface, plus procedural shoes.
  const clothMat = (def) => new THREE.MeshStandardMaterial({ color: lin(def.color), roughness: def.material ? def.material.rough : 0.85, metalness: def.material ? def.material.metal : 0, side: THREE.DoubleSide, skinning: true });
  const skinnedPiece = (positions, tris, skinIndex, skinWeight, def) => {
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(positions, 3);
    geo.setAttribute('position', attr); geo.setIndex(tris);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    const m = new THREE.SkinnedMesh(geo, clothMat(def));
    m.bind(rig.skeleton); m.frustumCulled = false; m.castShadow = m.receiveShadow = true; skinned.push(m); root.add(m);
    return { geo, attr, mesh: m };
  };
  // garments are built the first time they're worn. key: a garment id, or 'id#horns' for a version with horn holes
  const garments = {};
  function getGarment(key) {
    if (garments[key]) return garments[key];
    const [id, variant] = key.split('#');
    let def = GARMENTS[id];
    if (variant === 'under' && def.hang) {
      // worn under chest armor: the loose skirt starts below the armor's lower edge
      const from = Math.min(def.hang.from, 0.6);
      def = { ...def, hang: { ...def.hang, from, ease: Math.min(def.hang.ease || 1.5, Math.max(0.6, from - def.hang.to - 0.2)) } };
    }
    if (variant === 'horns') {
      // holes where the horns grow (their anchors on the neutral head)
      const holes = anchors.horns.map(i => [meta.positions[i * 3], meta.positions[i * 3 + 1], meta.positions[i * 3 + 2]]);
      const f0 = def.field;
      def = { ...def, field: (x, y, z, w) => Math.min(f0(x, y, z, w), ...holes.map(h => Math.hypot(x - h[0], y - h[1], z - h[2]) - 0.32)) };
    }
    const g = makeGarment(meta, def);
    g.shell = skinnedPiece(g.positions, g.tris, g.skinIndex, g.skinWeight, def);
    if (g.hang) {
      // the skinned version carries the draped shape along with the skeleton (hidden);
      // what you see is that shape plus the spring bones' swing
      g.hangPiece = skinnedPiece(g.hang.positions, g.hang.tris, g.hang.skinIndex, g.hang.skinWeight, def);
      g.hangPiece.mesh.castShadow = false;
      g.springs = makeSpringSkirt(HANG_SIZE.rings, HANG_SIZE.seg);
      g.skinnedShape = new Float32Array(g.hang.positions.length);
      g.shown = new Float32Array(g.hang.positions.length);
      const geo = new THREE.BufferGeometry();
      g.simAttr = new THREE.BufferAttribute(g.shown, 3);
      geo.setAttribute('position', g.simAttr); geo.setIndex(g.hang.tris);
      g.simMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: lin(def.color), roughness: 0.85, side: THREE.DoubleSide }));
      g.simMesh.castShadow = g.simMesh.receiveShadow = true; g.simMesh.frustumCulled = false; root.add(g.simMesh);
      g.simGeo = geo;
    }
    g.shell.mesh.visible = false; g.id = id;
    return (garments[key] = g);
  }
  // ---- equipment: what's worn decides which garments show, inner to outer ----
  const gear = createEquipment(() => traitsOf(resolveBody(bodyState, layers)));
  let worn = [], gearRules = {};          // worn: garment keys, inner to outer
  function refreshWorn() {
    const t = traitsOf(resolveBody(bodyState, layers));
    gearRules = gear.rules();
    const chestArmor = !!gear.equipped().chest;
    worn = gear.garments().map(w => (w.item && ITEMS[w.item].rules && ITEMS[w.item].rules.horns === 'cutout' && t.horns) ? w.garment + '#horns'
      : (chestArmor && w.slot === 'top' && GARMENTS[w.garment].hang) ? w.garment + '#under' : w.garment);
    worn.forEach(getGarment);
  }
  const showOutfit = () => {
    refreshWorn();
    for (const [key, g] of Object.entries(garments)) {
      const on = worn.includes(key);
      g.shell.mesh.visible = on; if (g.hangPiece) { g.hangPiece.mesh.visible = false; g.simMesh.visible = on; }
    }
    if (typeof shoeMesh !== 'undefined') shoeMesh.visible = gear.hasShoes();
  };
  const shoes = makeShoes(meta);
  const shoeGeo = new THREE.BufferGeometry();
  const shoePos = new THREE.BufferAttribute(shoes.positions, 3), shoeCol = new THREE.BufferAttribute(shoes.colors, 3);
  shoeGeo.setAttribute('position', shoePos); shoeGeo.setAttribute('color', shoeCol); shoeGeo.setIndex(shoes.tris);
  shoeGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(shoes.skinIndex, 4));
  shoeGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(shoes.skinWeight, 4));
  const shoeMesh = new THREE.SkinnedMesh(shoeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, skinning: true }));
  shoeMesh.bind(rig.skeleton); shoeMesh.frustumCulled = false; shoeMesh.castShadow = shoeMesh.receiveShadow = true; skinned.push(shoeMesh); root.add(shoeMesh);
  const SHOE = { upper: lin('#5a3e2c'), sole: lin('#2a1d16') };

  // Eyes: our own eyeballs placed where the base mesh's eye helpers are.
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: irisTexture(THREE, '#9a6ee8'), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const eyes = ['L', 'R'].map(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), eyeMat); rig.byName[`eye.${s}`].add(e); return e; });

  // Limb capsules for cloth collision: bone pairs, with radii measured from the body.
  const LIMBS = [];
  // arms first, legs last: where a hand and a leg squeeze the same cloth, the leg wins
  for (const s of ['L', 'R']) LIMBS.push([`upperarm01.${s}`, `lowerarm01.${s}`, 1.1], [`lowerarm01.${s}`, `wrist.${s}`, 1.15], [`wrist.${s}`, `finger3-1.${s}`, 1.5]);
  for (const s of ['L', 'R']) LIMBS.push([`upperleg01.${s}`, `lowerleg01.${s}`, 1.08], [`lowerleg01.${s}`, `foot.${s}`, 1.1]);
  // upper body, for hair only
  LIMBS.push(['spine02', 'neck01', 0.75, 'hair']);
  // the torso, front to back (its depth, not its width), for keeping arms and held items out of it
  LIMBS.push(['spine05', 'spine02', 1.0, 'torso'], ['spine02', 'neck01', 1.0, 'torso']);
  for (const s of ['L', 'R']) LIMBS.push([`clavicle.${s}`, `upperarm01.${s}`, 0.9, 'hair']);
  const boneIdx = Object.fromEntries(meta.skeleton.map((b, i) => [b.name, i]));
  const limbVerts = LIMBS.map(([a]) => {
    const bi = boneIdx[a], out = [];
    for (let i = 0; i < meta.bodyVertexCount; i++) for (let k = 0; k < 4; k++) if (meta.skinIndex[i * 4 + k] === bi && meta.skinWeight[i * 4 + k] > 150) { out.push(i); break; }
    return out;
  });
  // radius at each end of every limb (thighs are much thicker at the hip than at the knee)
  const limbR = new Float32Array(LIMBS.length * 2);
  function measureLimbs(P) {
    LIMBS.forEach(([a, b, pad], li) => {
      const A = rig.worldHead(a), B = rig.worldHead(b), AB = B.clone().sub(A), L2 = AB.lengthSq() || 1e-6;
      const ends = [[], []];
      for (const i of limbVerts[li]) {
        const p = new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(A);
        const t = Math.max(0, Math.min(1, p.dot(AB) / L2));
        const rad = p.sub(AB.clone().multiplyScalar(t));
        ends[t < 0.5 ? 0 : 1].push(LIMBS[li][3] === 'torso' ? Math.abs(rad.z) : rad.length());
      }
      ends.forEach((d, e) => { d.sort((m, n) => m - n); limbR[li * 2 + e] = (d[Math.floor(d.length * 0.8)] || 0.3) * pad + 0.08; });
      // taper only gently: the far end keeps at least 90% of the near end (covers the cloth's point spacing)
      limbR[li * 2 + 1] = Math.max(limbR[li * 2 + 1], limbR[li * 2] * 0.9);
    });
  }
  const tmpV = new THREE.Vector3(), rootInv = new THREE.Matrix4();
  let innerThickness = 0, torsoThickness = 0.05;
  function capsules() {
    rootInv.copy(root.matrixWorld).invert();
    return LIMBS.map(([a, b], li) => {
      let pa = rig.byName[a].getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv);
      const pb = rig.byName[b].getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv);
      // thighs start a little below the hip joint, so they don't overlap the waistband
      if (a.startsWith('upperleg')) pa = pa.lerp(pb, 0.25);
      const inward = a.includes('arm') || a.includes('wrist');
      // legs also carry any inner layers (trousers), so leave room for them
      // legs: leave room for inner layers (trousers under a tunic)
      const tag = LIMBS[li][3];
      const extra = inward ? 0 : tag === 'torso' ? torsoThickness : innerThickness + 0.05;
      return { a: pa.toArray(), b: pb.toArray(), r: limbR[li * 2] + extra, r2: limbR[li * 2 + 1] + extra, inward, hair: LIMBS[li][3] === 'hair', torso: LIMBS[li][3] === 'torso' };
    });
  }
  // the body's own acceleration, in the character's space (decimetres/s²), smoothed and clamped: capes and skirts lag it
  const bodyAcc = [0, 0, 0], accP = new THREE.Vector3(), accV = new THREE.Vector3(), accW = new THREE.Vector3(), accT = new THREE.Vector3(), accQ = new THREE.Quaternion(); let accHave = false;
  function bodyAccel(dt) {
    if (!(dt > 1e-4)) return; root.updateMatrixWorld(true); root.getWorldPosition(accT);
    if (!accHave) { accP.copy(accT); accV.set(0, 0, 0); accHave = true; return; }
    const v = accT.clone().sub(accP).divideScalar(dt); accP.copy(accT);
    if (v.length() > 40) { accV.copy(v); return; }   // (a teleport)
    accW.copy(v).sub(accV).divideScalar(dt).clampLength(0, 30); accV.copy(v);
    root.getWorldQuaternion(accQ); accW.applyQuaternion(accQ.invert());
    const sc = 1 / Math.max(1e-3, root.getWorldScale(accT).x);
    for (let a = 0; a < 3; a++) bodyAcc[a] = bodyAcc[a] * 0.6 + accW.getComponent(a) * sc * 0.4;
  }
  function simulateCloth(dt) {
    const loose = worn.map(k => garments[k]).filter(g => g && g.springs);
    if (!loose.length) return;
    // room for what's worn around the legs under the loose cloth (trousers, greaves)
    innerThickness = worn.map(k => garments[k]).filter(g => g && !g.springs && (g.def.legs || ['shorts', 'trousers', 'boots'].includes(g.id))).reduce((t, g) => t + g.def.offset * 1.6, 0.03);
    root.updateMatrixWorld(true);
    const caps = capsules().filter(c => !c.hair && !c.torso);
    for (const g of loose) {
      const T = g.skinnedShape, m = g.hangPiece.mesh;
      for (let i = 0; i < T.length / 3; i++) { m.boneTransform(i, tmpV); T[i * 3] = tmpV.x; T[i * 3 + 1] = tmpV.y; T[i * 3 + 2] = tmpV.z; }
      g.springs.step(dt, T, caps, { ...(g.def.springs || {}), accel: bodyAcc });
      g.springs.apply(T, g.shown, g.hang.loose);
      g.simAttr.needsUpdate = true; g.simGeo.computeVertexNormals();
    }
  }

  // ---- player hair groom: fitted scalp surface, groom-native roots/strands, brows, lashes ----
  const hairData = makeHair(meta);
  let hairOn = true, hairColor = '#e6e1ea', hairTip = '#e6e1ea', hairBlend = 0, browColor = null;
  const hairSel = { main: 0, bangs: 0 };
  const brow = { style: 0, thickness: 0, arch: 0, tilt: 0, height: 0, length: 0 };
  const headBone = meta.skeleton.findIndex(b => b.name === 'head'), backBone = meta.skeleton.findIndex(b => b.name === 'spine01');
  const scalpPiece = skinnedPiece(hairData.scalp.positions, hairData.scalp.tris, hairData.scalp.skinIndex, hairData.scalp.skinWeight, hairColor);
  // The scalp cap is a quiet, dark base under the strand groom; root placement is generated
  // independently from its fitted surface triangles in hairScalp.js.
  scalpPiece.mesh.material.roughness = 0.62;
  // detail levels for the body and clothes by distance (src/rpg/meshLod.js: fewer triangles over the same vertices)
  const lods = createLods(THREE, () => skinned.filter(m => m.visible && !m.userData.noLod), [{ dist: 7, cell: 0.2 }, { dist: 18, cell: 0.42 }]);
  // the player strand groom: guide curves are simulated on the CPU; fine individual strands are moved on the GPU.
  const hairR = createHairGroom(THREE, { headBone, skeleton: rig.skeleton, bindMatrix: () => body.bindMatrix });
  const hairU = hairR.U;                                   // (uHairRoot, uHairTip, uHairBlend: the colour rows set them)
  let hairWind = [0, 0, 0];
  // the Hair lab (in the creator's hair section): the look (volume, density, curl, wave: the hair is grown again) and the
  // feel (follow, inertia, stiffness, damping, gravity: live)
  const hairLook = { volume: 1, coverage: 1, hairlineCoverage: 1, density: 1, curl: 1, wave: 0 }, hairPhys = { follow: 0.6, inertia: 0.3, stiffness: 1, damping: 1, gravity: 1 };
  let skinGlow = 1, labCombo = null;
  let labTest = null, labT = 0, labWind = 0, labInfo = null, rootBaseY = 0;
  const hairLen = { main: 0, bangs: 0 };       // independent main hairstyle and fringe lengths (-1..1)
  let hairHead = null;
  const dynamicSkinned = (mat) => {
    const geo = new THREE.BufferGeometry();
    const m = new THREE.SkinnedMesh(geo, mat); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; root.add(m);
    return m;
  };
  const groomMesh = hairR.mesh; root.add(groomMesh);
  // brows: a decal cut from the skin around the brows, with the brows painted into its texture
  const decal = browDecal(meta), browG = makeGarment(meta, decal.def);
  const browCanvas = document.createElement('canvas'); browCanvas.width = 1024; browCanvas.height = 460;
  const browTex = new THREE.CanvasTexture(browCanvas); browTex.encoding = THREE.sRGBEncoding; browTex.anisotropy = 4;
  const browPiece = skinnedPiece(browG.positions, browG.tris, browG.skinIndex, browG.skinWeight, '#ffffff');
  browPiece.geo.setAttribute('uv', new THREE.BufferAttribute(browUVs(meta, browG, decal), 2));
  browPiece.mesh.material = new THREE.MeshStandardMaterial({ map: browTex, transparent: true, depthWrite: false, roughness: 0.8, skinning: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  browPiece.mesh.castShadow = false;
  const browMat = browPiece.mesh.material;
  const repaintBrows = () => { paintBrows(browCanvas, decal, brow); browTex.needsUpdate = true; };
  const setGeo = (m, data, skin = data.skinHead) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(data.col, 3));
    g.setIndex(data.idx);
    const n = data.pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const w = skin ? skin[i] : 1; si[i * 4] = headBone; si[i * 4 + 1] = backBone; sw[i * 4] = w; sw[i * 4 + 1] = 1 - w; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (data.nrm && data.nrm.length) g.setAttribute('normal', new THREE.BufferAttribute(data.nrm, 3)); else g.computeVertexNormals();
    m.geometry.dispose(); m.geometry = g; m.bind(rig.skeleton, m.matrixWorld);
  };
  // lashes: the base mesh's own lash cards (upper and lower lids separately), sharing the body's
  // positions; they follow the head. Length is set through the texture: the card covers the
  // longest lash, and shorter settings stretch the texture so lashes end sooner.
  const lashInfo = lashUVs(meta), lashVerts = [...new Set(meta.lashes)];
  const lashSkinI = new Uint16Array(meta.skinIndex), lashSkinW = new Float32Array(meta.skinWeight.map(w => w / 255));
  for (const i of new Set(meta.lashes)) { lashSkinI.set([headBone, 0, 0, 0], i * 4); lashSkinW.set([1, 0, 0, 0], i * 4); }
  const lashCanvas = document.createElement('canvas'); lashCanvas.width = 512; lashCanvas.height = 128;
  const lash = { upper: 0, lower: -0.3, density: 0, thickness: 0, curl: 0, color: '#140f10' };
  const lashParts = ['upper', 'lower'].map(part => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', posAttr); geo.setIndex(lashInfo[part]);
    geo.setAttribute('uv', new THREE.BufferAttribute(lashInfo.uv, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(lashSkinI, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(lashSkinW, 4));
    const tex = new THREE.CanvasTexture(lashCanvas); tex.encoding = THREE.sRGBEncoding; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ map: tex, color: lin(lash.color), roughness: 0.6, side: THREE.DoubleSide, skinning: true, alphaTest: 0.35 }));
    m.bind(rig.skeleton); m.frustumCulled = false; skinned.push(m); root.add(m);
    return { part, mesh: m, tex };
  });
  function applyLashes() {
    paintLashes(lashCanvas, lash);
    for (const { part, mesh, tex } of lashParts) {
      // length 0.35..1 of the card; density: lashes per length of lid
      const len = Math.min(1, Math.max(0.3, 0.75 + 0.25 * lash[part])), dens = Math.exp(0.5 * lash.density) * (part === 'lower' ? 0.7 : 1);
      tex.repeat.set(dens, 1 / len); tex.offset.set(0, 1 - 1 / len); tex.needsUpdate = true;
      mesh.material.color.copy(lin(lash.color));
    }
  }
  applyLashes();
  // brows sit on the skin: nearest front-of-face point to (x, y)
  const faceIds = hairData.headIds.filter(i => meta.positions[i * 3 + 2] > 0.9);
  let hairBuilt = { key: null }, browKey = '';
  // each strand point is bound to its nearest head vertex (a grid lookup), so the hair can follow
  // head morphs without being regrown
  function bindToHead(pos, P) {
    const cell = 0.3, grid = new Map(), K = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
    for (const i of hairData.headIds) { const kk = K(Math.floor(P[i * 3] / cell), Math.floor(P[i * 3 + 1] / cell), Math.floor(P[i * 3 + 2] / cell)); (grid.get(kk) || grid.set(kk, []).get(kk)).push(i); }
    const n = pos.length / 3, out = new Uint32Array(n);
    for (let v = 0; v < n; v += 2) {                       // card vertices come in pairs across the strand
      const x = (pos[v * 3] + pos[v * 3 + 3]) / 2, y = (pos[v * 3 + 1] + pos[v * 3 + 4]) / 2, z = (pos[v * 3 + 2] + pos[v * 3 + 5]) / 2;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      let best = hairData.headIds[0], bd = 1e9;
      for (let r = 1; r <= 4 && bd === 1e9; r++)
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
          const L = grid.get(K(cx + a, cy + b, cz + c)); if (!L) continue;
          for (const i of L) { const d = (P[i * 3] - x) ** 2 + (P[i * 3 + 1] - y) ** 2 + (P[i * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = i; } }
        }
      out[v] = best; if (v + 1 < n) out[v + 1] = best;
    }
    return out;
  }
  function fitHair(P, Nrm, busy = false) {
    const eyesC = ['left', 'right'].map(sd => { const ids = meta.eyes[sd]; return [0, 1, 2].map(a => ids.reduce((t, i) => t + P[i * 3 + a], 0) / ids.length); });
    const hairShown = hairOn && gearRules.hair !== 'hide';
    scalpPiece.mesh.visible = hairShown; groomMesh.visible = hairShown;
    if (hairShown) {
      fitGarment(hairData.scalp, P, Nrm); scalpPiece.attr.needsUpdate = true; scalpPiece.geo.computeVertexNormals();
      const key = JSON.stringify([hairSel, hairLen, hairLook]);
      if (key !== hairBuilt.key) {
        // a new style or length: grow the hair (slow, ~0.5 s), then remember where it sits on the head
        const lengths = Object.fromEntries(Object.entries(hairLen).map(([k, v]) => [k, Math.exp(v * 0.69)]));
        const groomData = buildScalpGroom(hairData.scalp, hairData.headIds, P, Nrm, eyesC[0][1], hairSel, lengths, hairLook);
        groomMesh.updateMatrixWorld(true); hairR.build(groomData.guides, groomData.head, hairLook); hairR.info.coverage = groomData.coverage; Object.assign(hairR.sim.params, hairPhys); hairHead = groomData.head; labInfo?.();
        hairBuilt = { key, P: Float32Array.from(P) };
      } else {
        // the head changed shape: when the change settles, the hair is grown again for it (~0.3 s)
        let moved = 0; const HP = hairBuilt.P; for (const i of hairData.headIds) { moved = Math.max(moved, Math.abs(P[i * 3] - HP[i * 3]) + Math.abs(P[i * 3 + 1] - HP[i * 3 + 1]) + Math.abs(P[i * 3 + 2] - HP[i * 3 + 2])); if (moved > 1e-3) break; }
        if (moved > 1e-3 && !busy) { hairBuilt.key = null; fitHair(P, Nrm, busy); return; }
      }
    }
    // lash cards need their own normals (they're not part of the body's surface), or lighting turns them black
    // Lighting normals for the lash cards face forward (the usual trick for lashes): the upper
    // cards face down toward the eye, so their own normals left them unlit whatever the color.
    for (const lp of lashParts) {
      const g = lp.mesh.geometry;
      if (!g.attributes.normal) g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const nrm = g.attributes.normal.array;
      for (const i of lashVerts) { nrm[i * 3] = 0; nrm[i * 3 + 1] = 0.35; nrm[i * 3 + 2] = 0.94; }
      g.attributes.normal.needsUpdate = true;
    }
    fitGarment(browG, P, Nrm); browPiece.attr.needsUpdate = true; browPiece.geo.computeVertexNormals();
    const bk = JSON.stringify(brow); if (bk !== browKey) { browKey = bk; repaintBrows(); }
  }
  // Hair physics: the head's skinning matrix this frame (rest -> now, in the character's space)
  const headM = new THREE.Matrix4(), headMi = new THREE.Matrix4(), meshInv = new THREE.Matrix4();
  let hairSimulationEnabled = true; // game camera can pause simulation independently of temporary render visibility
  function simulateHair(dt) {
    if (!hairSimulationEnabled || !hairOn || gearRules.hair === 'hide' || !hairR.sim || !groomMesh.visible) return;   // hidden hair is paused and resets safely when shown again
    root.updateMatrixWorld(true);
    const bone = rig.skeleton.bones[headBone];
    meshInv.copy(groomMesh.matrixWorld).invert();
    headM.multiplyMatrices(meshInv, bone.matrixWorld).multiply(rig.skeleton.boneInverses[headBone]).multiply(groomMesh.bindMatrix);
    hairR.step(dt, groomMesh.matrixWorld, headM, capsules().filter(c => c.hair || c.torso), { wind: game ? hairWind : [labWind * 8, 0, labWind * 3], time: clock.elapsedTime });   // (neck, shoulders and back: arms and legs don't reach the hair)
  }
  // root and tip colors; brows follow the root color unless given their own
  function setHairColor(root, tip = root) {
    hairColor = root; hairTip = tip;
    hairU.uHairRoot.value.copy(lin(root)); hairU.uHairTip.value.copy(lin(tip));
    if (!browColor) browMat.color.copy(lin(root)).multiplyScalar(0.6);
    scalpPiece.mesh.material.color.copy(lin(root)).multiplyScalar(0.75);     // the base layer, a little darker than the hair over it
    if (pickers.root) { pickers.root.value = root; pickers.tip.value = tip; }
  }
  const pickers = {};

  const params = { ...DEFAULT_PARAMS };
  // ---- the body as data: every part tracked on its own (see bodyState.js) ----
  const speciesKey = (ri, si) => `${RACES[ri].id}:${RACES[ri].subraces[si].name.toLowerCase()}`;
  const layers = {};
  RACES.forEach((r, ri) => r.subraces.forEach((sb, si) => { layers[speciesKey(ri, si)] = raceLayer(ri, si); }));
  const bodyState = createBodyState();
  // which body part each vertex belongs to, from its bone weights (blends smoothly between parts)
  const boneToPart = name => {
    const b = name.replace(/[0-9]*(\.[LR])?$/, '').replace(/-$/, '');
    if (['head', 'jaw', 'eye', 'levator', 'oculi', 'orbicularis', 'oris', 'risorius', 'special', 'temporalis', 'tongue'].includes(b)) return 'face';
    if (b === 'neck') return 'neck';
    if (b === 'breast') return 'chest';
    // spine01 is the upper chest, spine05 just above the pelvis
    if (b === 'spine') { const k = parseInt(name.slice(5)) || 1; return k <= 2 ? 'torso' : k === 3 ? 'waist' : 'hips'; }
    if (b === 'pelvis' || b === 'root') return 'hips';
    if (['clavicle', 'shoulder', 'upperarm', 'lowerarm'].includes(b)) return 'arms';
    if (['wrist', 'metacarpal', 'finger1', 'finger2', 'finger3', 'finger4', 'finger5'].includes(b)) return 'hands';
    if (['upperleg', 'lowerleg'].includes(b)) return 'legs';
    return 'feet';
  };
  const SEX_PARTS = ['face', 'neck', 'chest', 'torso', 'waist', 'hips', 'arms', 'hands', 'legs', 'feet'];
  const bonePart = meta.skeleton.map(b => SEX_PARTS.indexOf(boneToPart(b.name)));
  const vertPartW = new Float32Array(meta.vertexCount * SEX_PARTS.length);
  for (let i = 0; i < meta.vertexCount; i++) {
    let tot = 0;
    for (let k = 0; k < 4; k++) { const w = meta.skinWeight[i * 4 + k] / 255; vertPartW[i * SEX_PARTS.length + bonePart[meta.skinIndex[i * 4 + k]]] += w; tot += w; }
    if (tot > 0) for (let j = 0; j < SEX_PARTS.length; j++) vertPartW[i * SEX_PARTS.length + j] /= tot;
  }
  let Pmasc = null;
  let lastFem = null;
  const race = { index: 0, sub: 0, strength: 1, styles: {}, partSize: 0, coverFace: 1, coverBody: 1, coverSize: 0, coverA: null, coverB: null, pupil: null, eyeColor: null, jaw: 0, furPattern: null, furDark: null, noseColor: null, luster: 0, furLength: 0 };
  // ---- species parts (attachments) ----
  const eyeY0 = meta.eyes.left.reduce((t, i) => t + meta.positions[i * 3 + 1], 0) / meta.eyes.left.length;
  const anchors = partAnchors(meta, eyeY0);
  gear.setAll(OUTFIT_PRESETS['Tank and shorts']); showOutfit();
  const partMats = {
    horn: new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.45, vertexColors: true, skinning: true }),
    skin: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, vertexColors: true, skinning: true, side: THREE.DoubleSide }),
    fin: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, vertexColors: true, skinning: true, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    membrane: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, vertexColors: true, skinning: true, side: THREE.DoubleSide }),
    feather: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true, skinning: true, side: THREE.DoubleSide, map: featherTexture(THREE), alphaTest: 0.4 }),
  };
  const partMeshes = {};
  let tailLook = () => {};                                  // set once the tail exists
  // the head's center, for sinking parts into it (between the ears, a little behind the eyes)
  const headCenter = P => { const a = anchors.catEars[0], b = anchors.catEars[1]; return [0, (P[a * 3 + 1] + P[b * 3 + 1]) / 2 - 0.55, (P[a * 3 + 2] + P[b * 3 + 2]) / 2 + 0.1]; };
  let lastEye = '', looksQueued = false;
  // colors, coverings and eyes only: cheap, no geometry is rebuilt
  function refreshLooks() {
    const L = resolveBody(bodyState, layers);
    partMats.horn.color.copy(lin(L.hornColor));
    // covering colors follow the skin unless picked
    const base = skinMat.color.clone();
    const cA = race.coverA ? lin(race.coverA) : base.clone().multiplyScalar(0.8), cB = race.coverB ? lin(race.coverB) : base.clone().multiplyScalar(1.2);
    const cv = L.cover ? { ...L.cover, pattern: race.furPattern ?? L.cover.pattern ?? 0, patternColor: race.furDark, noseColor: race.noseColor, luster: race.luster, face: L.cover.face * race.coverFace, body: L.cover.body * race.coverBody, size: (L.cover.size || 0) + race.coverSize } : null;
    skinDetail.setCover(cv, cA, cB);
    const shelled = cv && (cv.type === 'fur' || cv.type === 'feathers') && Math.max(cv.face, cv.body) > 0.02;
    shellMeshes.forEach(m => m.visible = !!shelled && !perf.off.shells);
    if (shelled) updateShellTris(cv.face, cv.body);
    if (shelled) skinDetail.setShells((cv.length || 0.08) * Math.exp(0.8 * race.furLength) * Math.min(1, 0.55 + Math.max(cv.face, cv.body) * 0.6), (cv.type === 'feathers' ? 22 : 70) * Math.exp(-0.7 * (cv.size || 0)));
    // eyes: the player's picks win; otherwise the species' eyes past half strength, else human
    const species = L.eyes;                                      // set when the eyes are mostly one species
    const pupil = race.pupil || (species ? species.pupil : 'round'), eyeCol = race.eyeColor || (species ? species.color : '#9a6ee8');
    // redraw into the same texture (swapping textures would recompile the eye's shader each time)
    if (pupil + eyeCol !== lastEye) { lastEye = pupil + eyeCol; const t = irisTexture(THREE, eyeCol, pupil); eyeMat.map.image = t.image; eyeMat.map.needsUpdate = true; }
    partMats.skin.color.copy(skinMat.color); partMats.fin.color.copy(skinMat.color).multiplyScalar(1.15);
    partMats.membrane.color.copy(race.coverA ? lin(race.coverA) : skinMat.color).multiplyScalar(0.9);
    partMats.feather.color.copy(race.coverA ? lin(race.coverA) : skinMat.color.clone().multiplyScalar(0.85));
    tailLook();
  }
  // color pickers fire continuously while dragging: apply at most once per frame
  let bodyQueued = false;
  // body changes from code (events, the console) rebuild once per frame
  function scheduleBodyUpdate() { if (bodyQueued) return; bodyQueued = true; requestAnimationFrame(() => { bodyQueued = false; update(); }); }
  function scheduleLooks() { if (looksQueued) return; looksQueued = true; requestAnimationFrame(() => { looksQueued = false; refreshLooks(); }); }
  function fitParts(P) {
    const L = resolveBody(bodyState, layers), k = Math.exp(0.6 * race.partSize);
    refreshLooks();
    for (const [id, part] of Object.entries(PARTS)) {
      const size = (gearRules.ears === 'hide' && /Ears$/.test(id)) ? 0 : (L.attach[id] || 0) * k;
      let m = partMeshes[id];
      if (size < 0.05) { if (m) m.visible = false; continue; }
      const sides = part.center ? [1] : [1, -1], pos = [], idx = [], col = [], uv = [];
      sides.forEach((side, si) => {
        const a = anchors[id][si], g = placePart(part, size, race.styles[part.styleOf || id] || 0, [part.center ? 0 : P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], side, headCenter(P));
        const base = pos.length / 3; pos.push(...g.pos); col.push(...g.col); idx.push(...g.idx.map(v => v + base)); if (g.uv) uv.push(...g.uv);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      if (uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const n = pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      const bone = part.bone ? meta.skeleton.findIndex(b => b.name === part.bone) : headBone;
      for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      if (!m) { m = partMeshes[id] = new THREE.SkinnedMesh(geo, partMats[part.material]); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; root.add(m); }
      else { m.geometry.dispose(); m.geometry = geo; }
      m.visible = !perf.off.parts; m.updateMatrixWorld(true); m.bind(rig.skeleton, m.matrixWorld);   // bind with its real place in the scene
    }
  }
  // ---- webbed fingers: a membrane between each pair of neighbouring fingers, skinned to both ----
  const webMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, skinning: true, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
  let webMesh = null;
  const webBone = name => meta.skeleton.findIndex(b => b.name === name);
  function fitWebbing() {
    const L = resolveBody(bodyState, layers), amt = gearRules.webbing === 'hide' ? 0 : Math.min(1, L.attach.webbing || 0);
    if (webMesh) webMesh.visible = amt > 0.05 && !perf.off.parts;
    if (amt <= 0.05) return;
    webMat.color.copy(skinMat.color).multiplyScalar(1.05);
    const pos = [], idx = [], si = [], sw = [], ROWS = 3, COLS = 4;
    for (const side of ['L', 'R']) for (let f = 1; f <= 4; f++) {
      // joints along both fingers: knuckle, middle, near the tip
      const jt = (n, k) => rig.worldHead(`finger${n}-${k}.${side}`);
      const A = [jt(f, 1), jt(f, 2), jt(f, 3)], B = [jt(f + 1, 1), jt(f + 1, 2), jt(f + 1, 3)];
      // how far up the fingers the web reaches grows with the amount; the edge dips between fingers
      const reach = 0.55 + 0.9 * amt;
      const base = pos.length / 3;
      for (let r = 0; r <= ROWS; r++) {
        const t = (r / ROWS) * reach, seg = Math.min(1, Math.floor(t)), ft = Math.min(1, t - seg);
        const a = A[seg].clone().lerp(A[seg + 1], ft), b = B[seg].clone().lerp(B[seg + 1], ft);
        for (let c = 0; c <= COLS; c++) {
          const u = c / COLS, dip = r === ROWS ? 0.35 * Math.sin(Math.PI * u) : 0;
          const p = a.clone().lerp(b, u);
          if (dip) { const knuck = A[0].clone().lerp(B[0], u); p.lerp(knuck, dip * 0.5); }
          pos.push(p.x, p.y, p.z);
          si.push(webBone(`finger${f}-${seg + 1}.${side}`), webBone(`finger${f + 1}-${seg + 1}.${side}`), 0, 0); sw.push(1 - u, u, 0, 0);
          if (r < ROWS && c < COLS) { const i0 = base + r * (COLS + 1) + c; idx.push(i0, i0 + 1, i0 + COLS + 1, i0 + 1, i0 + COLS + 2, i0 + COLS + 1); }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (!webMesh) { webMesh = new THREE.SkinnedMesh(geo, webMat); webMesh.frustumCulled = false; webMesh.castShadow = true; root.add(webMesh); }
    else { webMesh.geometry.dispose(); webMesh.geometry = geo; }
    webMesh.visible = !perf.off.parts; webMesh.updateMatrixWorld(true); webMesh.bind(rig.skeleton, webMesh.matrixWorld);
  }
  // ---- arm wings (Avian, Rito style): flight feathers along the back edge of each arm, skinned to the arm
  // bones so they follow every pose. With the arms out they form a wing; at rest they drape behind the arms.
  let armWingMesh = null;
  function fitArmWings() {
    const L = resolveBody(bodyState, layers), amt = Math.min(1.5, (L.attach.armWings || 0) * Math.exp(0.6 * race.partSize));
    if (armWingMesh) armWingMesh.visible = amt > 0.05 && !perf.off.parts;
    if (amt <= 0.05) return;
    const V = THREE.Vector3, spread = partOptions.spread;
    const pos = [], idx = [], col = [], uv = [], si = [], sw = [];
    const card = (r, d, side, len, w, shade, b0, b1, bw) => {
      const base = pos.length / 3, segs = 4, n = new V().crossVectors(side, d).normalize();
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, c = r.clone().addScaledVector(d, len * t).addScaledVector(n, -0.06 * len * t * t);
        const ww = w * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.25 + t)));
        const a = c.clone().addScaledVector(side, -ww / 2), b = c.clone().addScaledVector(side, ww / 2);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        const sh = shade * (1 - 0.25 * t); col.push(sh, sh, sh, sh, sh, sh); uv.push(0, t, 1, t);
        for (let k = 0; k < 2; k++) { si.push(b0, b1, 0, 0); sw.push(1 - bw, bw, 0, 0); }
        if (i < segs) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
    };
    for (const s of ['L', 'R']) {
      const J = n => rig.worldHead(`${n}.${s}`);
      const S = J('upperarm01'), E = J('lowerarm01'), W = J('wrist'), F = J('finger3-1'), T = J('finger3-3');
      const tip = T.clone().add(T.clone().sub(F).multiplyScalar(0.4));
      const pts = [S, E, W, tip], segL = [S.distanceTo(E), E.distanceTo(W), W.distanceTo(tip)], tot = segL.reduce((a, b) => a + b);
      const fore = segL[1];                         // feather lengths scale with the forearm, so they fit any body
      const bones = [['upperarm01', 'upperarm02'], ['lowerarm01', 'lowerarm02'], ['wrist', 'finger3-1']].map(p => p.map(b => webBone(`${b}.${s}`)));
      const at = u => {                             // point, arm direction and segment at u (0 shoulder .. 1 tip)
        let d = u * tot, k = 0; while (k < 2 && d > segL[k]) { d -= segL[k]; k++; }
        const f = Math.min(1, d / segL[k]), dir = pts[k + 1].clone().sub(pts[k]).normalize();
        return { p: pts[k].clone().lerp(pts[k + 1], f), dir, k, f };
      };
      // two rows: long flight feathers, then shorter coverts over their roots
      for (const [count, scale, shade, lift] of [[40, 1, 0.8, 0], [30, 0.5, 1, 0.015]]) {
        for (let i = 0; i < count; i++) {
          const u = 0.06 + 0.94 * i / (count - 1), { p, dir, k, f } = at(u);
          // trailing edge: backward, square to the arm, drooping a little
          const back = new V(0, -0.35, -1); back.addScaledVector(dir, -back.dot(dir)).normalize();
          // folded (spread 0): the feathers lie back along the arm toward the hand, like a resting Rito wing.
          // open (spread 1): square to the arm, with the primaries near the tip sweeping outward.
          const sweep = Math.max(0, (u - 0.62) / 0.38);
          const open = back.clone().lerp(dir, sweep * 0.55).normalize(), folded = back.clone().multiplyScalar(0.45).add(dir).normalize();
          const d = folded.clone().lerp(open, spread).normalize();
          const len = fore * amt * scale * (0.6 + 0.8 * Math.pow(u, 1.2) + 0.2 * sweep);
          const root = p.clone().addScaledVector(back, 0.04 * fore).addScaledVector(new V().crossVectors(dir, back).normalize(), lift * fore * (s === 'L' ? 1 : -1));
          const side = dir.clone().multiplyScalar(d.dot(back)).addScaledVector(back, -d.dot(dir)).normalize();   // in the wing plane, square to the feather
          card(root, d, side, len, fore * 0.3, shade, bones[k][0], bones[k][1], f);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (!armWingMesh) { armWingMesh = new THREE.SkinnedMesh(geo, partMats.feather); armWingMesh.frustumCulled = false; armWingMesh.castShadow = true; root.add(armWingMesh); }
    else { armWingMesh.geometry.dispose(); armWingMesh.geometry = geo; }
    armWingMesh.visible = !perf.off.parts; armWingMesh.updateMatrixWorld(true); armWingMesh.bind(rig.skeleton, armWingMesh.matrixWorld);
  }
  // ---- claws (Draconian, Avian): a curved, tapering claw on each fingertip, skinned to the last finger bone ----
  const clawMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.35, skinning: true, vertexColors: true });
  let clawMesh = null;
  // skin vertices of each fingertip bone, to find where the real fingertip is on the current body
  const tipVerts = {};
  for (const s of ['L', 'R']) for (let f = 1; f <= 5; f++) {
    const bi = webBone(`finger${f}-3.${s}`), out = [];
    for (let i = 0; i < meta.bodyVertexCount; i++) for (let k = 0; k < 4; k++) if (meta.skinIndex[i * 4 + k] === bi && meta.skinWeight[i * 4 + k] > 150) { out.push(i); break; }
    tipVerts[f + s] = out;
  }
  function fitClaws(P) {
    const L = resolveBody(bodyState, layers), amt = gearRules.claws === 'hide' ? 0 : Math.min(1.5, (L.attach.claws || 0) * Math.exp(0.6 * race.partSize));
    if (clawMesh) clawMesh.visible = amt > 0.05 && !perf.off.parts;
    if (amt <= 0.05) return;
    const pos = [], idx = [], col = [], si = [], sw = [];
    for (const s of ['L', 'R']) {
      const J = n => rig.worldHead(`${n}.${s}`);
      const across = J('finger5-1').sub(J('finger2-1')).normalize();
      for (let f = 1; f <= 5; f++) {
        const a = J(`finger${f}-2`), b = J(`finger${f}-3`), seg = b.clone().sub(a), len = seg.length(), dir = seg.clone().normalize();
        // the back of the finger (where a nail sits): square to the finger and the knuckle line; mirrored per side
        const up = new THREE.Vector3().crossVectors(dir, across).normalize().multiplyScalar(s === 'L' ? -1 : 1);
        // the fingertip: the furthest skin point along the finger; the claw grows from just behind it, on the nail side
        let tipD = 0, upD = 0;
        for (const i of tipVerts[f + s]) {
          const q = new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(b);
          tipD = Math.max(tipD, q.dot(dir)); upD = Math.max(upD, q.dot(up));
        }
        if (!tipD) tipD = len * 0.55;
        const base = b.clone().addScaledVector(dir, tipD - len * 0.3).addScaledVector(up, upD * 0.45);
        const cl = len * (0.9 + 0.5 * amt) * (f === 1 ? 0.85 : 1);
        // curve: out along the finger, then hooking down toward the palm
        const P0 = base, P1 = base.clone().addScaledVector(dir, cl * 0.5).addScaledVector(up, cl * 0.08);
        const P2 = base.clone().addScaledVector(dir, cl * 0.85).addScaledVector(up, -cl * 0.12), P3 = base.clone().addScaledVector(dir, cl).addScaledVector(up, -cl * 0.45);
        const path = Array.from({ length: 9 }, (_, i) => { const t = i / 8, m = 1 - t; const p = P0.clone().multiplyScalar(m * m * m).addScaledVector(P1, 3 * m * m * t).addScaledVector(P2, 3 * m * t * t).addScaledVector(P3, t * t * t); return [p.x, p.y, p.z]; });
        const g = tube(path, t => len * 0.26 * Math.sqrt(amt) * (1 - 0.95 * t), 8, t => 0.7 + 0.5 * t);
        const o = pos.length / 3; pos.push(...g.pos); col.push(...g.col); idx.push(...g.idx.map(v => v + o));
        const bi = webBone(`finger${f}-3.${s}`);
        for (let i = 0; i < g.pos.length / 3; i++) { si.push(bi, 0, 0, 0); sw.push(1, 0, 0, 0); }
      }
    }
    clawMat.color.set('#2a2420');
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (!clawMesh) { clawMesh = new THREE.SkinnedMesh(geo, clawMat); clawMesh.frustumCulled = false; clawMesh.castShadow = true; root.add(clawMesh); }
    else { clawMesh.geometry.dispose(); clawMesh.geometry = geo; }
    clawMesh.visible = !perf.off.parts; clawMesh.updateMatrixWorld(true); clawMesh.bind(rig.skeleton, clawMesh.matrixWorld);
  }
  // ---- tail (spring chain from the base of the spine) and cape (pinned cloth on the back) ----
  const tail = makeTail(THREE), cape = makeCape(THREE);
  root.add(tail.mesh, cape.mesh);
  tailLook = () => { tail.mat.color.copy(race.coverA ? lin(race.coverA) : skinMat.color).multiplyScalar(0.8); tail.mat.roughness = race.coverA ? 0.9 : 0.55; };
  tailLook();
  // the tail grows from the lower back, just above the cleft
  let tailVert = 0;
  { let best = 1e9; const P0 = meta.positions;
    for (let i = 0; i < meta.bodyVertexCount; i++) { const d = Math.hypot(P0[i * 3], (P0[i * 3 + 1] - 0.5) * 1.5, P0[i * 3 + 2] + 0.85); if (d < best) { best = d; tailVert = i; } } }
  const hipBone = rig.byName.root, chestBone = rig.byName.spine01, tmpM = new THREE.Matrix4(), hipM = new THREE.Matrix4(), chestM = new THREE.Matrix4();
  const charM = (bone, out) => out.copy(rootInv).multiply(bone.matrixWorld);
  function fitTailCape(P) {
    root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
    charM(hipBone, hipM); charM(chestBone, chestM);
    // tail: style weights from the body's species (tailReptile, tailCat, tailPig)
    const L = resolveBody(bodyState, layers), k = Math.exp(0.6 * race.partSize), w = {};
    for (const [key, id] of [['tailReptile', 'reptile'], ['tailCat', 'cat'], ['tailPig', 'pig']]) if (L.attach[key]) w[id] = L.attach[key] * k;
    const base = new THREE.Vector3(P[tailVert * 3], P[tailVert * 3 + 1], P[tailVert * 3 + 2] + 0.12).applyMatrix4(tmpM.copy(hipM).invert());
    tail.configure(w, [base.x, base.y, base.z]);
    tail.mesh.visible = tail.active && !perf.off.parts;
    // cape: from the back slot; it hangs over whatever is worn on the torso
    const back = gear.equipped().back, which = back && ITEMS[back].cape;
    const outer = worn.map(key => garments[key]).filter(g => g && ['tank', 'tunic', 'dress', 'robe', 'vestments', 'scholarRobe', 'jerkin', 'breastplate', 'pauldrons'].includes(g.id)).reduce((t, g) => t + g.def.offset * 1.3, 0.04);
    const sh = rig.worldHead('upperarm01.L');
    const extra = which ? worn.map(key => garments[key]).filter(Boolean).flatMap(g => g.hang ? [g.positions, g.hang.positions] : [g.positions]) : [];
    cape.fit(P, meta.bodyVertexCount, chestM, hipM, outer, sh.x, sh.y + 0.45, which, extra);
  }
  function stepTailCape(dt, t) {
    if (!tail.active && !cape.active) return;
    root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
    charM(hipBone, hipM); charM(chestBone, chestM);
    // legs only: swinging arms would yank the cloth around (games let arms pass through capes)
    const caps = capsules().filter(c => !c.hair && !c.inward && !c.torso);
    if (tail.active && !perf.off.parts) tail.step(dt, t, hipM, caps);
    if (cape.active) cape.step(dt, t, chestM, hipM, tail.active && !perf.off.parts ? caps.concat(tail.capsules()) : caps, bodyAcc);
  }
  // ---- weapons: held in the hands when drawn, on the hip or back when put away ----
  const weaponMats = weaponMaterials(THREE), weaponModels = {};
  let weaponsDrawn = false;
  const grip = {};                                          // per side: grip frame, palm normal, curl axis (rest, character space)
  const sheaths = {};                                       // 'hip', 'hipR', 'back', 'backShield': frames in character space
  const charOf = bone => new THREE.Matrix4().copy(rootInv).multiply(bone.matrixWorld);
  const restChar = {};
  // skin of each palm (the metacarpal bones), for finding the middle of the palm
  const palmVerts = { L: [], R: [] };
  for (const sd of ['L', 'R']) {
    const ids = [1, 2, 3, 4].map(k => boneIdx[`metacarpal${k}.${sd}`]);
    for (let i = 0; i < meta.bodyVertexCount; i++) { let w = 0; for (let k = 0; k < 4; k++) if (ids.includes(meta.skinIndex[i * 4 + k])) w += meta.skinWeight[i * 4 + k] / 255; if (w > 0.6) palmVerts[sd].push(i); }
  }                                      // bones' rest matrices in character space, measured when the body is fitted
  const frame = (X, Y, Z, p) => new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(p);
  function weaponModel(id) {
    if (!weaponModels[id]) { const g = WEAPONS[id].build(THREE, weaponMats); g.matrixAutoUpdate = false; g.visible = false; weaponModels[id] = g; }
    return weaponModels[id];
  }
  // put a model under a bone, at a frame given in character space (rest pose)
  function attachTo(model, boneName, M) {
    const bone = rig.byName[boneName];
    if (model.parent !== bone) bone.add(model);
    model.matrix.copy(restChar[boneName].clone().invert().multiply(M)); model.matrixWorldNeedsUpdate = true; model.visible = !perf.off.parts;
  }
  function fitWeapons(P) {
    root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
    for (const b of ['root', 'spine02', 'wrist.L', 'wrist.R', 'lowerarm01.L']) restChar[b] = charOf(rig.byName[b]);
    const V3 = THREE.Vector3;
    for (const s of ['L', 'R']) {
      const J = n => rig.worldHead(`${n}.${s}`);
      const W = J('wrist'), I = J('finger2-1'), K = J('finger5-1'), M3 = J('finger3-1'), T = J('finger1-2');
      const F = M3.clone().sub(W).normalize();
      const A = I.clone().sub(K); A.addScaledVector(F, -A.dot(F)).normalize();           // across the knuckles, toward the thumb
      const N = new V3().crossVectors(F, A).normalize();
      if (N.dot(T.clone().sub(W)) < 0) N.negate();                                     // the palm side
      // the grip sits at the middle of the palm: the centre of the palm's skin, moved out to just past the palm surface
      const C = new V3(); let cnt = 0, depth = 0;
      for (const i of palmVerts[s]) { C.x += P[i * 3]; C.y += P[i * 3 + 1]; C.z += P[i * 3 + 2]; cnt++; }
      C.multiplyScalar(1 / Math.max(1, cnt));
      for (const i of palmVerts[s]) depth = Math.max(depth, (P[i * 3] - C.x) * N.x + (P[i * 3 + 1] - C.y) * N.y + (P[i * 3 + 2] - C.z) * N.z);
      C.addScaledVector(N, depth + 0.1).addScaledVector(F, 0.15);
      // a real grip runs slightly diagonally across the palm, so the weapon leans forward of the fist
      const Y = A.clone().multiplyScalar(Math.cos(0.28)).addScaledVector(F, Math.sin(0.28)).normalize();
      const X = F.clone().addScaledVector(Y, -F.dot(Y)).normalize();
      // curl direction: rotating a finger about A must bring its tip toward the palm
      const sign = F.clone().applyAxisAngle(A, 0.5).dot(N) > 0 ? 1 : -1;
      // the thumb closes over the grip: about the axis square to it and the palm normal
      const TD = J('finger1-3').sub(J('finger1-2')).normalize(), TA = new V3().crossVectors(TD, N).normalize();
      const tsign = TD.clone().applyAxisAngle(TA, 0.5).dot(N) > 0 ? 1 : -1;
      grip[s] = { M: frame(X, Y, new V3().crossVectors(X, Y), C), A, N, F, sign, TA, tsign, C };
      if (s === 'L') { armLen.upper = J('upperarm01').distanceTo(J('lowerarm01')); armLen.fore = J('lowerarm01').distanceTo(C); }
      // forearm frame for a shield: the face out from the back of the forearm
      const E = J('lowerarm01'), D = W.clone().sub(E).normalize(), out = N.clone().negate(); out.addScaledVector(D, -out.dot(D)).normalize();
      grip[s].shield = frame(new V3().crossVectors(D, out), D, out, E.clone().lerp(W, 0.55).addScaledVector(out, 0.45));
    }
    // how far worn layers sit off the skin, so sheathed weapons sit outside them
    const outer = Math.min(0.6, 0.1 + worn.map(k => garments[k]).filter(Boolean).reduce((t, g) => t + g.def.offset, 0));
    torsoThickness = 0.05 + worn.map(k => garments[k]).filter(g => g && ['tank', 'tunic', 'dress', 'robe', 'vestments', 'scholarRobe', 'jerkin', 'breastplate'].includes(g.id)).reduce((t, g) => t + g.def.offset * 1.2, 0);
    let hx = 0, hy = 0.85, back = 1e9, backHip = 1e9;
    for (let i = 0; i < meta.bodyVertexCount; i++) {
      const y = meta.positions[i * 3 + 1];
      if (Math.abs(y - 0.85) < 0.25 && Math.abs(meta.positions[i * 3 + 2]) < 0.5) hx = Math.max(hx, Math.abs(P[i * 3]));
      if (Math.abs(meta.positions[i * 3]) < 0.4 && Math.abs(y - 3.3) < 0.3) back = Math.min(back, P[i * 3 + 2]);
    }
    const hipY = P[tailVert * 3 + 1] + 0.4;
    for (const [key, sx] of [['hip', 1], ['hipR', -1]]) {
      const Y = new V3(0.12 * sx, -1, -0.6).normalize(), Z0 = new V3(sx, 0, 0);
      const X = new V3().crossVectors(Y, Z0).normalize(), Z = new V3().crossVectors(X, Y);
      sheaths[key] = { M: frame(X, Y, Z, new V3(sx * (hx + outer + 0.12), hipY, 0.25).addScaledVector(Y, -1.3)), bone: 'root' };
    }
    const backP = new V3(0, 3.0, back - outer - 0.3 - (gear.equipped().back ? 0.45 : 0));   // over a cape, if one is worn
    { const Y = new V3(0.5, -1, 0).normalize(), Z = new V3(0, 0, -1), X = new V3().crossVectors(Y, Z);
      sheaths.back = { M: frame(X, Y, Z, backP), bone: 'spine02', diag: Y }; }
    { const Y = new V3(-0.5, -1, 0).normalize(), Z = new V3(0, 0, -1), X = new V3().crossVectors(Y, Z);       // a second back weapon crosses the first
      sheaths.back2 = { M: frame(X, Y, Z, backP.clone().add(new V3(0, 0, -0.22))), bone: 'spine02', diag: Y }; }
    sheaths.backShield = { M: frame(new V3(-1, 0, 0), new V3(0, 1, 0), new V3(0, 0, -1), backP.clone().add(new V3(0, -0.6, -0.5))), bone: 'spine02' };
    placeWeapons();
  }
  function placeWeapons() {
    for (const m of Object.values(weaponModels)) m.visible = false;
    const eq = gear.equipped();
    const ids = [...new Set([eq.mainHand, eq.offHand].filter(Boolean))];
    let backUsed = false;
    for (const item of ids) {
      const wid = ITEMS[item].weapon, w = WEAPONS[wid], model = weaponModel(wid);
      const off = ITEMS[item].slot === 'offHand' && !(ITEMS[item].slots || []).includes('mainHand') || w.hold === 'bow';
      const side = off ? 'L' : 'R';
      if (weaponsDrawn) {
        if (w.hold === 'shield') attachTo(model, 'lowerarm01.L', grip.L.shield);
        else attachTo(model, `wrist.${side}`, grip[side].M);
      } else {
        const sh = w.hold === 'shield' ? sheaths.backShield : w.sheath === 'back' ? (backUsed ? sheaths.back2 : (backUsed = true, sheaths.back)) : (off ? sheaths.hipR : sheaths.hip);
        const M = sh.M.clone();
        if (w.sheath === 'back' && w.hold !== 'shield') M.multiply(new THREE.Matrix4().makeTranslation(0, -w.center, 0));   // the weapon's middle on the back
        attachTo(model, sh.bone, M);
      }
    }
  }
  // ---- weapon poses and animations ----
  // Poses are arm directions (upper arm, forearm) per side in character space, plus where the weapon should
  // point (aim: the forearm twists to bring the grip around to it) and a turn of the upper body (yaw).
  // Left-side values are written for the left arm (x mirrored from the right).
  const READY = {
    one: { R: [[-0.12, -1, 0.15], [-0.05, -0.2, 1]], aimR: [0, 0.85, 0.5] },
    dagger: { R: [[-0.12, -1, 0.15], [-0.05, -0.25, 1]], aimR: [0, 0.4, 1] },
    two: { R: [[-0.12, -1, 0.3], [0.4, -0.05, 1]], L: [[0.15, -1, 0.35], [-0.45, 0.05, 1]], aimR: [0, 1, 0.35] },
    spear: { R: [[-0.2, -1, 0.1], [0.8, -0.3, 0.5]], L: [[0.2, -0.8, 0.6], [-0.15, -0.05, 1]], aimR: [0, 0.25, 1] },
    staff: { R: [[-0.15, -1, 0.15], [-0.05, -0.15, 1]], aimR: [0, 1, 0.05] },
    bow: { L: [[0.25, -1, 0.3], [0.15, -0.35, 1]], aimL: [0, 1, 0.25] },
  };
  const OFF_READY = {
    shield: { L: SHIELD_POSES.rest },                       // down by the side until it blocks or a move uses it (src/rpg/swordArts.js)
    one: { L: [[0.12, -1, 0.15], [0.05, -0.2, 1]], aimL: [0, 0.6, 0.8] },
  };
  const RELAXED = { R: [[-0.16, -1, 0.02], [-0.06, -1, 0.28]], L: [[0.16, -1, 0.02], [0.06, -1, 0.28]] };
  // attacks: keyframes over 0..1 of the duration; anything a key leaves out stays at the ready pose
  const ATTACKS = {
    one: { dur: 0.8, keys: [
      { t: 0.35, R: [[-0.75, 0.35, 0.1], [-0.2, 1, -0.35]], aimR: [-0.2, 0.6, -0.8], yaw: 0.3 },
      { t: 0.55, R: [[0.15, -0.5, 0.85], [0.75, -0.45, 0.5]], aimR: [0.9, -0.3, 0.4], yaw: -0.35 }] },
    // the mace's (and any one-hander's) backhand: across the body to the left, then sweeping back out right
    oneBack: { dur: 0.75, hit: [0.36, 0.6], keys: [
      { t: 0.33, R: [[0.35, 0.15, 0.6], [0.75, 0.45, -0.1]], aimR: [0.6, 0.55, -0.6], yaw: -0.35 },
      { t: 0.56, R: [[-0.6, -0.3, 0.75], [-0.85, -0.1, 0.5]], aimR: [-0.9, -0.2, 0.4], yaw: 0.3 }] },
    // overhead: raised high behind the head (held there while charging), then brought straight down
    oneOver: { dur: 0.9, hit: [0.4, 0.62], keys: [
      { t: 0.35, R: [[-0.2, 0.95, -0.1], [0, 0.55, -0.85]], aimR: [0, 0.25, -1], yaw: 0.05 },
      { t: 0.58, R: [[-0.1, -0.2, 1], [0, -0.6, 0.8]], aimR: [0, -0.7, 0.7], yaw: -0.05 }] },
    dagger: { dur: 0.55, keys: [
      { t: 0.3, R: [[-0.3, -0.7, -0.5], [0, -0.1, 1]], aimR: [0, 0.15, 1], yaw: 0.15 },
      { t: 0.5, R: [[-0.05, -0.15, 1], [0, 0, 1]], aimR: [0, 0.05, 1], yaw: -0.2 }] },
    two: { dur: 1.1, keys: [
      { t: 0.4, R: [[-0.35, 0.85, 0.15], [0.25, 1, -0.5]], L: [[0.35, 0.85, 0.15], [-0.25, 1, -0.5]], aimR: [0, 0.3, -1], yaw: 0.1 },
      { t: 0.6, R: [[-0.1, -0.3, 0.95], [0.3, -0.55, 1]], L: [[0.15, -0.3, 0.95], [-0.3, -0.55, 1]], aimR: [0, -0.25, 1], yaw: -0.1 }] },
    spear: { dur: 0.8, keys: [
      { t: 0.35, R: [[-0.25, -0.8, -0.5], [0.85, -0.1, 0.4]], L: [[0.2, -0.9, 0.3], [-0.1, -0.1, 1]], aimR: [0, 0.1, 1], yaw: 0.15 },
      { t: 0.55, R: [[-0.1, -0.4, 0.9], [0.75, 0, 0.65]], L: [[0.15, -0.2, 1], [-0.1, 0, 1]], aimR: [0, 0.05, 1], yaw: -0.2 }] },
    // the combo moves (src/rpg/combos.js): a thrust, a rising cut, a wide sweep for one hand; backhand, rising, sweep and
    // overhead for two hands; a sweep and an overhead for a spear; a backhand and a rising cut for a dagger
    oneThrust: { dur: 0.65, hit: [0.36, 0.58], keys: [
      { t: 0.32, R: [[-0.4, -0.55, -0.45], [0.05, -0.1, 1]], aimR: [0, 0, 1], yaw: 0.3 },
      { t: 0.52, R: [[-0.1, -0.12, 0.99], [0, -0.05, 1]], aimR: [0, -0.05, 1], yaw: -0.25 }] },
    oneRise: { dur: 0.75, keys: [
      { t: 0.33, R: [[-0.6, -0.7, 0.3], [-0.35, -0.85, 0.35]], aimR: [-0.3, -0.8, 0.5], yaw: 0.3 },
      { t: 0.55, R: [[0.15, 0.55, 0.8], [0.45, 0.75, 0.45]], aimR: [0.5, 0.8, 0.25], yaw: -0.3 }] },
    oneSweep: { dur: 0.8, keys: [
      { t: 0.35, R: [[-0.9, 0.05, 0.1], [-0.55, 0.1, -0.8]], aimR: [-0.6, 0, -0.8], yaw: 0.5 },
      { t: 0.58, R: [[0.35, 0, 0.92], [0.85, 0, 0.5]], aimR: [0.9, 0, 0.4], yaw: -0.55 }] },
    daggerBack: { dur: 0.5, keys: [
      { t: 0.3, R: [[0.2, -0.3, 0.9], [0.8, 0.1, 0.5]], aimR: [0.7, 0.2, 0.6], yaw: -0.25 },
      { t: 0.5, R: [[-0.55, -0.2, 0.8], [-0.85, -0.1, 0.4]], aimR: [-0.8, -0.1, 0.5], yaw: 0.25 }] },
    daggerRise: { dur: 0.55, keys: [
      { t: 0.3, R: [[-0.35, -0.85, 0.3], [0, -0.7, 0.7]], aimR: [0, -0.3, 1], yaw: 0.15 },
      { t: 0.5, R: [[-0.1, 0.2, 0.97], [0, 0.6, 0.8]], aimR: [0, 0.8, 0.5], yaw: -0.2 }] },
    twoBack: { dur: 1.1, keys: [
      { t: 0.4, R: [[0.3, 0.8, 0.2], [0.6, 0.9, -0.3]], L: [[0.5, 0.8, 0.2], [0.3, 0.9, -0.3]], aimR: [0.3, 0.4, -1], yaw: -0.35 },
      { t: 0.6, R: [[-0.4, -0.35, 0.85], [-0.6, -0.5, 0.65]], L: [[-0.1, -0.35, 0.9], [-0.4, -0.5, 0.75]], aimR: [-0.6, -0.3, 0.8], yaw: 0.35 }] },
    twoRise: { dur: 1.15, keys: [
      { t: 0.42, R: [[-0.5, -0.8, 0.2], [-0.2, -0.95, 0.2]], L: [[-0.1, -0.8, 0.35], [0.1, -0.95, 0.25]], aimR: [-0.2, -0.9, 0.4], yaw: 0.4 },
      { t: 0.62, R: [[0, 0.75, 0.65], [0.3, 0.9, 0.3]], L: [[0.3, 0.7, 0.65], [0.1, 0.9, 0.3]], aimR: [0.3, 0.9, 0.2], yaw: -0.35 }] },
    twoSweep: { dur: 1.2, keys: [
      { t: 0.42, R: [[-0.9, 0.15, -0.1], [-0.5, 0.2, -0.85]], L: [[-0.4, 0.1, 0.5], [-0.6, 0.2, -0.6]], aimR: [-0.6, 0.1, -0.8], yaw: 0.65 },
      { t: 0.64, R: [[0.45, 0, 0.88], [0.9, 0, 0.4]], L: [[0.8, 0, 0.5], [0.95, 0, 0.2]], aimR: [0.95, 0, 0.3], yaw: -0.7 }] },
    twoOver: { dur: 1.25, hit: [0.46, 0.66], keys: [
      { t: 0.42, R: [[-0.2, 0.95, -0.15], [0, 0.6, -0.8]], L: [[0.2, 0.95, -0.15], [0, 0.6, -0.8]], aimR: [0, 0.3, -1], yaw: 0.05 },
      { t: 0.62, R: [[-0.1, -0.35, 0.93], [0, -0.7, 0.7]], L: [[0.1, -0.35, 0.93], [0, -0.7, 0.7]], aimR: [0, -0.75, 0.6], yaw: -0.05 }] },
    spearSweep: { dur: 1.0, keys: [
      { t: 0.38, R: [[-0.8, -0.3, 0.3], [-0.2, -0.2, -0.95]], L: [[0.4, -0.6, 0.6], [0.6, -0.2, 0.75]], aimR: [-0.7, 0, -0.7], yaw: 0.55 },
      { t: 0.6, R: [[0.2, -0.3, 0.92], [0.7, -0.1, 0.7]], L: [[0.6, -0.4, 0.6], [0.9, 0, 0.3]], aimR: [0.9, 0, 0.4], yaw: -0.55 }] },
    spearOver: { dur: 1.1, hit: [0.42, 0.62], keys: [
      { t: 0.4, R: [[-0.3, 0.85, -0.3], [0.2, 0.7, -0.6]], L: [[0.2, 0.6, 0.6], [0, 0.5, 0.85]], aimR: [0, 0.6, -0.8], yaw: 0.1 },
      { t: 0.6, R: [[-0.15, -0.3, 0.94], [0, -0.55, 0.83]], L: [[0.15, -0.4, 0.9], [0, -0.6, 0.8]], aimR: [0, -0.6, 0.8], yaw: -0.1 }] },
    staff: null,                                             // uses the one-handed swing
    bow: { dur: 1.5, keys: [
      { t: 0.3, L: [[0.15, 0.05, 1], [0.05, 0.05, 1]], R: [[-0.25, 0.05, 1], [0.2, 0.05, 1]], aimL: [0, 1, 0] },
      { t: 0.7, L: [[0.15, 0.05, 1], [0.05, 0.05, 1]], R: [[-0.75, 0.1, 0.3], [0.95, 0.2, -0.2]], aimL: [0, 1, 0] },
      { t: 0.8, L: [[0.15, 0.05, 1], [0.05, 0.05, 1]], R: [[-0.85, 0.15, 0], [0.4, 0.1, -0.9]], aimL: [0, 1, 0] }] },
  };
  Object.assign(ATTACKS, SWORD_CLIPS);                     // the arming sword's own art (src/rpg/swordArts.js)
  const BLOCKS = {
    shield: { L: SHIELD_POSES.block },                     // flat in front of the chest, face to the enemy (src/rpg/swordArts.js)
    one: { R: [[-0.4, -0.3, 0.85], [0.6, 0.7, 0.4]], aimR: [1, 0.3, 0] },
    two: { R: [[-0.3, -0.2, 0.9], [0.6, 0.6, 0.4]], L: [[0.3, -0.2, 0.9], [-0.2, 0.6, 0.5]], aimR: [1, 0.2, 0] },
  };
  const combat = { action: null, block: 0, blocking: false };
  const holdType = item => {
    const w = item && WEAPONS[ITEMS[item].weapon]; if (!w) return null;
    const wid = ITEMS[item].weapon;
    if (w.pose) return w.pose;                    // a model can borrow another weapon's poses (a glaive holds like a spear)
    return w.hold === 'bow' ? 'bow' : w.hold === 'shield' ? 'shield' : wid === 'spear' ? 'spear' : wid === 'staff' ? 'staff' : wid.includes('dagger') ? 'dagger' : w.hold;
  };
  // the current hold: main-hand type and off-hand type
  function holds() {
    const eq = gear.equipped();
    const main = holdType(eq.mainHand), off = eq.offHand && eq.offHand !== eq.mainHand ? holdType(eq.offHand) : null;
    return { main: eq.offHand && ITEMS[eq.offHand].weapon === 'bow' ? 'bow' : main, off };
  }
  // the ready pose for what's held (as a full key: R, L, aims)
  function readyKey() {
    const h = holds(), k = { ...RELAXED };
    if (h.main) Object.assign(k, READY[h.main]);
    if (h.off) Object.assign(k, OFF_READY[h.off === 'shield' ? 'shield' : 'one']);
    if (['sword', 'shortsword'].includes(ITEMS[gear.equipped().mainHand]?.weapon)) Object.assign(k, SWORD_STANCE, h.off ? { L: k.L } : {});   // (the sword's bladed guard: full body)
    return k;
  }
  const lerpV = (a, b, u) => { const v = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  const lerpKey = (a, b, u) => {
    const out = {};
    for (const k of ['R', 'L']) out[k] = [lerpV(a[k][0], b[k][0], u), lerpV(a[k][1], b[k][1], u)];
    for (const k of ['aimR', 'aimL']) out[k] = a[k] && b[k] ? lerpV(a[k], b[k], u) : (u < 0.5 ? a[k] : b[k]);
    out.yaw = (a.yaw || 0) + ((b.yaw || 0) - (a.yaw || 0)) * u;
    for (const k of ['lean', 'squat', 'head']) out[k] = (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * u;   // (the everyday moves' body channels: src/rpg/moves.js)
    for (const k of ['hip', 'chest']) if (a[k] || b[k]) { const A = a[k] || [0, 0, 0, 0, 0], B = b[k] || [0, 0, 0, 0, 0]; out[k] = A.map((v, i) => v + ((B[i] || 0) - v) * u); }   // (full-body: src/rpg/swordArts.js)
    if (a.feet || b.feet) { out.feet = {}; for (const sd of ['L', 'R']) { const A = a.feet?.[sd] || [0, 0, 0], B = b.feet?.[sd] || [0, 0, 0]; out.feet[sd] = A.map((v, i) => v + (B[i] - v) * u); } }
    return out;
  };
  const smooth = u => u * u * (3 - 2 * u);
  // sample a keyframed action at time u (0..1); keys fill in from `base`
  function sampleKeys(keys, base, u) {
    const full = keys.map(k => ({ ...base, ...k }));
    if (u <= full[0].t) return lerpKey(full[0].from || base, full[0], smooth(u / Math.max(1e-3, full[0].t)));
    for (let i = 0; i < full.length - 1; i++) if (u <= full[i + 1].t) return lerpKey(full[i], full[i + 1], smooth((u - full[i].t) / (full[i + 1].t - full[i].t)));
    const last = full[full.length - 1]; return lerpKey(last, full[0].to || base, smooth((u - last.t) / Math.max(1e-3, 1 - last.t)));
  }
  // draw and sheathe: reach for where each weapon is carried, swap it at the middle, then settle
  function reachKey() {
    const eq = gear.equipped(), k = {};
    for (const item of new Set([eq.mainHand, eq.offHand].filter(Boolean))) {
      const w = WEAPONS[ITEMS[item].weapon], left = holdType(item) === 'shield' || w.hold === 'bow' || ITEMS[item].slot === 'offHand';
      const back = w.sheath === 'back' || w.hold === 'shield';
      const r = back ? [[-0.35, 0.9, -0.1], [0.3, 0.85, -0.5]] : [[0.15, -0.9, 0.35], [0.85, -0.3, 0.35]];
      if (left) k.L = r.map(v => [-v[0], v[1], v[2]]); else k.R = r;
    }
    return k;
  }
  function startAction(type, opts = {}) {
    if (combat.action) return false;
    if (type === 'move') { const M = MOVES[opts.move]; if (!M) return false;
      combat.action = { type, move: opts.move, t0: clock.elapsedTime, speed: opts.speed || 1, u: 0, fired: new Set(), onEvent: opts.onEvent || null, onEnd: opts.onEnd || null, loop: !!opts.loop }; return true; }
    const h = holds();
    if (type === 'attack' && (!weaponsDrawn || !h.main)) return false;
    if ((type === 'draw' && weaponsDrawn) || (type === 'sheathe' && !weaponsDrawn)) return false;
    if ((type === 'draw' || type === 'sheathe') && !h.main && !h.off) return false;
    combat.action = { type, t0: clock.elapsedTime, swapped: false, variant: opts.variant || 'light', hold: !!opts.hold, speed: opts.speed || 1, u: 0, hand: opts.hand || null };
    return true;
  }
  // which keyframed attack a variant uses for what's held: light (forehand), light2 (backhand), heavy (overhead)
  function attackFor(variant) {
    const h = holds().main;
    const A = (ATTACKS[variant] && variant !== 'staff' ? ATTACKS[variant] : null) || (variant === 'light2' && ATTACKS[h + 'Back']) || (variant === 'heavy' && ATTACKS[h + 'Over']) || ATTACKS[h] || ATTACKS.one;   // (a combo names its move outright: src/rpg/combos.js)
    return { ...A, hit: A.hit || [A.keys[0].t, Math.min(0.95, A.keys[1].t + 0.05)] };
  }
  // casting: hands gather in front of the chest while the spell is spoken (held until release), then the
  // casting hand thrusts forward to throw it. With a weapon drawn in the right hand, the left hand casts.
  const CAST = {
    gather: { R: [[-0.3, -0.75, 0.55], [0.45, 0.15, 0.9]], L: [[0.3, -0.75, 0.55], [-0.45, 0.15, 0.9]] },
    throwR: { R: [[-0.12, 0.08, 1], [-0.02, 0.12, 1]], L: [[0.25, -0.9, 0.2], [0.1, -0.5, 0.8]] },
    oneHandL: { L: [[0.35, -0.6, 0.7], [-0.3, 0.35, 0.9]] }, throwL: { L: [[0.12, 0.08, 1], [0.02, 0.12, 1]] },
    oneHandR: { R: [[-0.35, -0.6, 0.7], [0.3, 0.35, 0.9]], aimR: [0, 0.5, 1] }, throwOneR: { R: [[-0.12, 0.08, 1], [-0.02, 0.12, 1]], aimR: [0, 0.2, 1] },
  };
  const shieldKeys = new WeakMap();
  function actionPose(now) {
    const a = combat.action, ready = readyKey();
    if (a && a.type === 'cast') {
      // which hand casts: the game says (a focus in the right or the left hand); otherwise the free one
      const base = weaponsDrawn ? ready : { ...RELAXED }, hand = a.hand || (weaponsDrawn && !!holds().main ? 'L' : 'R');
      const one = weaponsDrawn;                                                  // something in hand: cast with one hand only
      const gather = { ...base, ...(one ? (hand === 'L' ? CAST.oneHandL : CAST.oneHandR) : CAST.gather) };
      const thrown = { ...base, ...(one ? (hand === 'L' ? CAST.throwL : CAST.throwOneR) : CAST.throwR) };
      if (a.hold) { const k = Math.min(1, (now - a.t0) / 0.25); a.u = 0; return lerpKey(base, gather, smooth(k)); }
      if (a.tr === undefined) a.tr = now;
      const u = (now - a.tr) / 0.45; a.u = u;
      if (u >= 1) { combat.action = null; return weaponsDrawn ? ready : null; }
      return u < 0.3 ? lerpKey(gather, thrown, smooth(u / 0.3)) : lerpKey(thrown, base, smooth((u - 0.3) / 0.7));
    }
    if (!a) return weaponsDrawn ? ready : null;
    if (a.type === 'move') return movePose(a, now, ready);
    if (a.type === 'attack') {
      const A = attackFor(a.variant), dur = A.dur / a.speed, wind = A.keys[0].t;
      if (a.hold) a.t0 = Math.min(a.t0, now) , a.t0 = Math.max(a.t0, now - wind * dur);   // charging: held at the wind-up
      let u = combat.scrub ?? (now - a.t0) / dur;
      if (a.hold) u = Math.min(u, wind);
      a.u = u; a.hit = A.hit; a.hits = A.hits || null; a.dur = dur;
      if (u >= 1) { combat.action = null; return ready; }
      const keys = holds().off === 'shield' ? (shieldKeys.get(A.keys) || shieldKeys.set(A.keys, A.keys.map(k => ({ ...k, L: k.Ls || SHIELD_POSES.guard }))).get(A.keys)) : A.keys;   // (the shield arm keeps working through the move)
      return sampleKeys(keys, ready, u);
    }
    const dur = 0.75, u = (now - a.t0) / dur;
    if (!a.swapped && u >= 0.5) { a.swapped = true; weaponsDrawn = a.type === 'draw'; placeWeapons(); syncDrawBtn(); }
    if (u >= 1) { combat.action = null; return weaponsDrawn ? readyKey() : null; }
    const relaxed = { ...RELAXED }, reach = { ...relaxed, ...reachKey() };
    const from = a.type === 'draw' ? relaxed : ready, to = a.type === 'draw' ? readyKey() : relaxed;
    return u < 0.5 ? lerpKey(from, reach, smooth(u / 0.5)) : lerpKey(reach, to, smooth((u - 0.5) / 0.5));
  }
  // ---- everyday moves (src/rpg/moves.js): drinking, picking up, opening, using ----
  const props = {};
  function propModel(kind) {
    if (props[kind]) return props[kind];
    const g = new THREE.Group(); g.matrixAutoUpdate = false;
    const M = (geo, color, o = {}) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.5, metalness: 0, transparent: !!o.a, opacity: o.a ?? 1 })); m.castShadow = true; g.add(m); return m; };
    if (kind === 'potion') {                                // a little round bottle: glass, the potion inside, a cork
      const glass = M(new THREE.SphereGeometry(0.42, 16, 12), 0xdfe8f0, { r: 0.08, a: 0.45 }); glass.position.y = 0.55;
      const liquid = M(new THREE.SphereGeometry(0.36, 14, 10), 0xc0306a, { r: 0.2 }); liquid.position.y = 0.52; g.userData.liquid = liquid;
      const neck = M(new THREE.CylinderGeometry(0.12, 0.15, 0.4, 10), 0xdfe8f0, { r: 0.08, a: 0.5 }); neck.position.y = 1.1;
      const cork = M(new THREE.CylinderGeometry(0.13, 0.12, 0.16, 8), 0x8a6a44, { r: 0.9 }); cork.position.y = 1.35;
    } else if (kind === 'food') {
      const loaf = M(new THREE.SphereGeometry(0.5, 12, 8), 0xb98a4e, { r: 0.85 }); loaf.scale.set(1, 0.65, 0.8); loaf.position.y = 0.4;
    } else {                                                 // a small pouch / item
      const b = M(new THREE.SphereGeometry(0.42, 10, 8), 0x7a5a3a, { r: 0.9 }); b.scale.set(1, 0.85, 0.75); b.position.y = 0.35;
      const tie = M(new THREE.CylinderGeometry(0.15, 0.2, 0.18, 8), 0x5a4028, { r: 0.9 }); tie.position.y = 0.72;
    }
    g.visible = false; return (props[kind] = g);
  }
  function hideProps() { for (const g of Object.values(props)) g.visible = false; }
  function movePose(a, now, ready) {
    const Mv = MOVES[a.move], dur = Mv.dur / a.speed;
    let u = combat.scrub ?? (now - a.t0) / dur;
    if (u >= 1 && a.loop) { a.t0 = now; a.fired.clear(); u = 0; }
    a.u = u; a.dur = dur;
    if (u >= 1) { combat.action = null; hideProps(); a.onEnd?.(); return weaponsDrawn ? ready : null; }
    for (const e of Mv.events || []) if (u >= e.t && !a.fired.has(e.name)) { a.fired.add(e.name); a.onEvent?.(e.name); }
    const P = Mv.prop;
    if (P) { const g = propModel(P.kind), on = u >= P.from && u <= P.to, side = P.hand || 'R';
      if (on && grip[side] && restChar[`wrist.${side}`]) { attachTo(g, `wrist.${side}`, grip[side].M); g.visible = true; if (g.userData.liquid) g.userData.liquid.scale.y = Math.max(0.15, 1 - Math.max(0, (u - 0.4) / 0.35)); }
      else g.visible = false; }
    const base = weaponsDrawn ? ready : { ...RELAXED };
    return sampleKeys(Mv.keys, base, Math.min(1, Math.max(0, u)));
  }
  // the legs' fold for the move playing now (before the pose is built, so the squat goes into the legs)
  function moveSquat(now) {
    const a = combat.action; if (!a || a.type !== 'move') return 0;
    const Mv = MOVES[a.move], u = Math.min(1, Math.max(0, combat.scrub ?? (now - a.t0) / (Mv.dur / a.speed)));
    return sampleKeys(Mv.keys, RELAXED, u).squat || 0;
  }
  // twist the forearm so the grip's axis comes around toward `dir` (character space)
  const wp = new THREE.Vector3(), rootQ = new THREE.Quaternion(), pq = new THREE.Quaternion();
  const posOf = name => rig.byName[name].getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv);
  function rotateBoneWorld(bone, axisChar, angle) {
    root.getWorldQuaternion(rootQ); bone.parent.getWorldQuaternion(pq);
    const ax = axisChar.clone().applyQuaternion(rootQ).applyQuaternion(pq.invert()).normalize();
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, angle));
    bone.updateMatrixWorld(true);
  }
  function aimWeapon(side, dir) {
    if (!grip[side] || !restChar[`wrist.${side}`]) return;
    rig.byName[`upperarm01.${side}`].updateMatrixWorld(true);
    const ax = posOf(`wrist.${side}`).sub(posOf(`lowerarm01.${side}`)).normalize();
    const local = restChar[`wrist.${side}`].clone().invert().multiply(grip[side].M);
    const m = rootInv.clone().multiply(rig.byName[`wrist.${side}`].matrixWorld).multiply(local);
    const Y = new THREE.Vector3().setFromMatrixColumn(m, 1).normalize(), D = new THREE.Vector3(...dir).normalize();
    Y.addScaledVector(ax, -Y.dot(ax)); D.addScaledVector(ax, -D.dot(ax));
    if (Y.lengthSq() < 1e-4 || D.lengthSq() < 1e-4) return;
    Y.normalize(); D.normalize();
    const ang = Math.max(-1.7, Math.min(1.7, Math.atan2(ax.dot(new THREE.Vector3().crossVectors(Y, D)), Y.dot(D))));
    rotateBoneWorld(rig.byName[`lowerarm02.${side}`], ax, ang);
    // then bend the wrist (up to ~55 degrees) for what the twist can't reach
    const m2 = rootInv.clone().multiply(rig.byName[`wrist.${side}`].matrixWorld).multiply(local);
    const Y2 = new THREE.Vector3().setFromMatrixColumn(m2, 1).normalize(), D2 = new THREE.Vector3(...dir).normalize();
    const bend = Math.min(0.95, Math.acos(Math.max(-1, Math.min(1, Y2.dot(D2))))), axis = new THREE.Vector3().crossVectors(Y2, D2);
    if (axis.lengthSq() > 1e-6 && bend > 0.02) rotateBoneWorld(rig.byName[`wrist.${side}`], axis.normalize(), bend);
  }
  // reach the left hand to a point (character space) with simple two-bone IK, elbow down and out
  function reachLeft(T) {
    const S = posOf('upperarm01.L'), l1 = armLen.upper, l2 = armLen.fore;
    const ST = T.clone().sub(S); let d = ST.length();
    d = Math.min(d, (l1 + l2) * 0.999); ST.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const bend = new THREE.Vector3(0.5, -1, -0.3); bend.addScaledVector(ST, -bend.dot(ST)).normalize();
    const E = S.clone().addScaledVector(ST, a).addScaledVector(bend, h);
    rig.aimArm('L', E.clone().sub(S), S.clone().addScaledVector(ST, d).sub(E));
    rig.byName['upperarm01.L'].updateMatrixWorld(true);
  }
  const armLen = { upper: 3, fore: 3 };
  // ---- full-body moves (src/rpg/swordArts.js): the pelvis, the spine, planted feet, the head held on the opponent ----
  let fullBodyK = 1;
  const IDLE_SQUARE = (Math.PI - 0.8) / 0.33;              // the idle's clock where the weight sits evenly on both feet (humanRig stance)
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), YA = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0), ZA = new THREE.Vector3(0, 0, 1);
  function bodyChannels(key, fb) {
    const H = key.hip || [0, 0, 0, 0, 0], C = key.chest || [0, 0, 0], rb = rig.roots[0];
    if (rb && fb > 0.001) {
      rb.position.x += H[0] * fb; rb.position.y -= H[1] * fb; rb.position.z += H[2] * fb;
      rb.quaternion.premultiply(qa.setFromAxisAngle(XA, H[4] * fb)).premultiply(qb.setFromAxisAngle(YA, H[3] * fb));
    }
    const sp = [['spine05', 0.3, 0.4], ['spine03', 0.35, 0.3], ['spine01', 0.35, 0.3]];
    for (const [n, kt, kl] of sp) { const b = rig.byName[n]; if (!b) continue; b.rotation.y += C[0] * kt; b.rotation.x += C[1] * kl; b.rotation.z += (C[2] || 0) * kt; }
    // the head stays on the opponent: turned back against the hips and chest, kept level
    const turn = H[3] * fb + C[0], tip = H[4] * fb + C[1];
    const n2 = rig.byName.neck02, hd = rig.byName.head;
    if (n2) { n2.rotation.y -= turn * 0.35; n2.rotation.x -= tip * 0.3; }
    if (hd) { hd.rotation.y -= turn * 0.5; hd.rotation.x -= tip * 0.4; }
  }
  const legV = { H: new THREE.Vector3(), T: new THREE.Vector3(), K: new THREE.Vector3(), d: new THREE.Vector3(), f: new THREE.Vector3() };
  const qg = new THREE.Quaternion(), qr = new THREE.Quaternion(), qp = new THREE.Quaternion(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  function plantFeet(feet, fb) {
    const rb = rig.roots[0]; if (!rb) return;
    root.getWorldQuaternion(qg); rb.getWorldQuaternion(qr);
    const rbInv = qg.clone().invert().multiply(qr).invert();                 // character space -> the pelvis's frame
    for (const sd of ['L', 'R']) {
      const f = feet[sd] || [0, 0, 0];
      const H0 = rig.worldHead(`upperleg01.${sd}`), K0 = rig.worldHead(`lowerleg01.${sd}`), A0 = rig.worldHead(`foot.${sd}`);
      const l1 = H0.distanceTo(K0), l2 = K0.distanceTo(A0);
      const H = legV.H.copy(posOf(`upperleg01.${sd}`)), T = legV.T.set(A0.x + f[0], A0.y, A0.z + f[1]);
      const dn = legV.d.copy(T).sub(H); let d = dn.length(); dn.normalize(); d = Math.min(d, (l1 + l2) * 0.999);
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const fw = legV.f.set(Math.sin(f[2] * 0.5), 0, Math.cos(f[2] * 0.5)); fw.addScaledVector(dn, -fw.dot(dn)); if (fw.lengthSq() < 1e-6) fw.set(0, 0, 1); fw.normalize();   // (the knee bends over the toes, half turned with the foot)
      const K = legV.K.copy(H).addScaledVector(dn, a).addScaledVector(fw, hh);
      const thigh = K.clone().sub(H).applyQuaternion(rbInv), shin = H.clone().addScaledVector(dn, d).sub(K).applyQuaternion(rbInv);
      const ul = rig.byName[`upperleg01.${sd}`], ll = rig.byName[`lowerleg01.${sd}`], u2 = rig.byName[`upperleg02.${sd}`], l2b = rig.byName[`lowerleg02.${sd}`];
      q0.copy(ul.quaternion); q1.copy(ll.quaternion);
      if (u2) u2.quaternion.slerp(qa.identity(), fb); if (l2b) l2b.quaternion.slerp(qa.identity(), fb);
      rig.aimLeg(sd, thigh, shin);
      if (fb < 0.999) { ul.quaternion.copy(q0.slerp(ul.quaternion, fb)); ll.quaternion.copy(q1.slerp(ll.quaternion, fb)); }
      // the foot flat on the ground, pointing where the key says
      const ft = rig.byName[`foot.${sd}`]; if (!ft) continue;
      ul.updateMatrixWorld(true); ft.parent.getWorldQuaternion(qp);
      const want = qg.clone().multiply(qa.setFromAxisAngle(YA, f[2]));
      ft.quaternion.slerp(qp.invert().multiply(want), fb);
    }
  }
  function weaponPose() {
    const k = actionPose(clock.elapsedTime);
    if (!k) return;
    const V = rig.V;
    // a block blends in and out
    const h = holds(), target = combat.blocking ? 1 : 0;
    combat.block += (target - combat.block) * 0.25;
    let key = k;
    if (combat.block > 0.01 && !combat.action) {
      const B = h.off === 'shield' ? BLOCKS.shield : h.main === 'two' || h.main === 'spear' || h.main === 'staff' ? BLOCKS.two : h.main ? BLOCKS.one : null;
      if (B) key = lerpKey(k, { ...k, ...B }, combat.block);
    }
    const fb = fullBodyK;                                    // (legs and hips: standing still only; moving, the stride keeps them)
    if (key.hip || key.chest) bodyChannels(key, fb);
    for (const sd of ['R', 'L']) rig.aimArm(sd, V(...key[sd][0]), V(...key[sd][1]));
    if (key.yaw) { const b = rig.byName.spine03; if (b) b.rotation.y += key.yaw * 0.6; const c = rig.byName.spine01; if (c) c.rotation.y += key.yaw * 0.4; }
    if (key.lean) { const b = rig.byName.spine03; if (b) b.rotation.x += key.lean * 0.5; const c = rig.byName.spine01; if (c) c.rotation.x += key.lean * 0.5; }
    if (key.head) { const b = rig.byName.head; if (b) b.rotation.x -= key.head * 0.6; const c = rig.byName.neck02; if (c) c.rotation.x -= key.head * 0.4; }
    root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
    if (key.feet && fb > 0.01) { plantFeet(key.feet, fb); root.updateMatrixWorld(true); }
    if (key.aimR && weaponsDrawn) aimWeapon('R', key.aimR);
    if (key.aimL && weaponsDrawn) aimWeapon('L', key.aimL);
    // two-handed: the left hand takes the handle below the right (or further up a spear's shaft)
    if (weaponsDrawn && ['two', 'spear'].includes(h.main) && !(combat.action && combat.action.type !== 'attack')) {
      const m = Object.entries(weaponModels).find(([id, mm]) => mm.visible && mm.parent === rig.byName['wrist.R']);
      if (m) {
        rig.byName['wrist.R'].updateMatrixWorld(true);
        const T = new THREE.Vector3(0, h.main === 'spear' ? 3.2 : -1.0, 0).applyMatrix4(rootInv.clone().multiply(m[1].matrixWorld));
        reachLeft(T);
      }
    }
    // fingers close around what each hand holds
    const curl = s => {
      const g = grip[s]; if (!g) return;
      const q = new THREE.Quaternion();
      for (let f = 2; f <= 5; f++) [1.45, 1.5, 0.95].forEach((a, i) => { const b = rig.byName[`finger${f}-${i + 1}.${s}`]; if (b) b.quaternion.copy(q.setFromAxisAngle(g.A, a * g.sign)); });
      [0.5, 0.6].forEach((a, i) => { const b = rig.byName[`finger1-${i + 2}.${s}`]; if (b) b.quaternion.copy(q.setFromAxisAngle(g.TA, a * g.tsign)); });
    };
    if (weaponsDrawn) {
      if (h.main && h.main !== 'bow') curl('R');
      if (h.main === 'bow' || (h.off && h.off !== 'shield') || ['two', 'spear'].includes(h.main)) curl('L');
    }
  }
  // ---- keep the arms (and what they hold) out of the body, armor, legs and sheathed weapons ----
  // Points along each arm (and its held item) that press into an obstacle push the arm around the shoulder
  // until they rest against it.
  const ARM_PTS = [['lowerarm01', 0.42], ['lowerarm02', 0.38], ['wrist', 0.32], ['finger3-1', 0.28]];
  function heldSamples(side) {
    const out = [];
    for (const [id, m] of Object.entries(weaponModels)) {
      if (!m.visible || m.parent !== rig.byName[`wrist.${side}`] && m.parent !== rig.byName[`lowerarm01.${side}`]) continue;
      const W = WEAPONS[id], M = rootInv.clone().multiply(m.matrixWorld);
      const pts = W.hold === 'shield' ? [[0, 0, 0.5, 0.3], ...Array.from({ length: 8 }, (_, k) => [3.1 * Math.cos(k * Math.PI / 4), 3.1 * Math.sin(k * Math.PI / 4), 0.5, 0.15])]
        : Array.from({ length: 5 }, (_, k) => [0, -1 + k * (W.center * 2 + 1) / 4, 0, 0.12]);
      for (const [x, y, z, r] of pts) out.push([new THREE.Vector3(x, y, z).applyMatrix4(M), r]);
    }
    return out;
  }
  function sheathObstacles() {
    const out = [];
    for (const [id, m] of Object.entries(weaponModels)) {
      if (!m.visible || m.parent !== rig.byName.root) continue;
      const M = rootInv.clone().multiply(m.matrixWorld), W = WEAPONS[id];
      out.push({ a: new THREE.Vector3(0, -1.2, 0).applyMatrix4(M).toArray(), b: new THREE.Vector3(0, W.center * 2, 0).applyMatrix4(M).toArray(), r: 0.3, r2: 0.25 });
    }
    return out;
  }
  // The correction is smoothed over time: obstacles (a sheathed weapon, armor) that the arm keeps brushing
  // would otherwise flip the push direction frame to frame and make the arm twitch.
  const armFix = { L: new THREE.Quaternion(), R: new THREE.Quaternion() }, qBase = new THREE.Quaternion(), qDelta = new THREE.Quaternion();
  function solveArms(dt = 1 / 60) {
    root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
    const obs = capsules().filter(c => !c.inward && !c.hair).concat(sheathObstacles());
    const push = new THREE.Vector3(), omega = new THREE.Vector3(), lever = new THREE.Vector3();
    for (const side of ['R', 'L']) {
      const ua = rig.byName[`upperarm01.${side}`]; qBase.copy(ua.quaternion);
      for (let it = 0; it < 3; it++) {
        const S = posOf(`upperarm01.${side}`);
        const samples = ARM_PTS.map(([n, r]) => [posOf(`${n}.${side}`), r]).concat(heldSamples(side));
        // the forearm's middle, between the elbow and wrist
        samples.push([posOf(`lowerarm01.${side}`).lerp(posOf(`wrist.${side}`), 0.5), 0.4]);
        omega.set(0, 0, 0); let any = false;
        for (const [p, r] of samples) {
          push.set(0, 0, 0);
          for (const c of obs) {
            const ax = c.a[0], ay = c.a[1], az = c.a[2], bx = c.b[0] - ax, by = c.b[1] - ay, bz = c.b[2] - az;
            const px = p.x - ax, py = p.y - ay, pz = p.z - az, L2 = bx * bx + by * by + bz * bz || 1e-6;
            const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / L2));
            const dx = px - bx * t, dy = py - by * t, dz = pz - bz * t, d = Math.hypot(dx, dy, dz) || 1e-6;
            const R = c.r + (c.r2 - c.r) * t + r;
            if (d < R) { const f = (R - d) / d; push.x += dx * f; push.y += dy * f; push.z += dz * f; }
          }
          if (push.lengthSq() < 1e-6) continue;
          any = true;
          lever.copy(p).sub(S); const L2 = lever.lengthSq() || 1;
          omega.add(new THREE.Vector3().crossVectors(lever, push).multiplyScalar(1 / L2));
        }
        if (!any) break;
        const ang = Math.min(0.35, omega.length());
        if (ang < 1e-4) break;
        rotateBoneWorld(rig.byName[`upperarm01.${side}`], omega.normalize(), ang);
      }
      // what the solve changed this frame, eased toward from last frame's correction
      qDelta.copy(qBase).invert().multiply(ua.quaternion);
      armFix[side].slerp(qDelta, 1 - Math.exp(-dt * 14));
      ua.quaternion.copy(qBase).multiply(armFix[side]);
    }
  }
  function syncDrawBtn() { if (typeof drawBtn !== 'undefined') { drawBtn.textContent = weaponsDrawn ? 'Put weapons away' : 'Draw weapons'; drawBtn.setAttribute('aria-pressed', weaponsDrawn); } }
  window.eldermereCombat = {
    draw: () => startAction('draw'), sheathe: () => startAction('sheathe'), attack: () => startAction('attack'),
    block: on => { combat.blocking = !!on; },
    scrub: u => { combat.scrub = u; },          // testing: freeze an attack at u (0..1), or null to play normally get drawn() { return weaponsDrawn; }, get busy() { return !!combat.action; },
  };
  const details = {};                                   // detail slider values by id
  let ground = 0, headY = 1.6;
  // ---- profiling: how long each stage of a rebuild takes, and frame times ----
  const perf = { stages: {}, frameMs: 0, fps: 0, off: {} };
  let tMark = 0; const mark = name => { const t = performance.now(); perf.stages[name] = t - tMark; tMark = t; };
  let lastUpd = 0, lastCloth = 0, settleTimer = 0, lastShoeBottom = 0;
  // full: a final, complete rebuild. Otherwise, when rebuilds come in quick succession (a slider being
  // dragged, a transformation playing), the costly refits run at a lower rate and once more at the end.
  function update(full = false) {
    tMark = performance.now(); const t0 = tMark;
    const busy = full !== true && t0 - lastUpd < 200; lastUpd = t0;
    clearTimeout(settleTimer); if (busy) settleTimer = setTimeout(() => update(true), 250);
    const doCloth = !busy || t0 - lastCloth > 220;
    // the masc/fem slider sets every part's sex; transformations can then move parts on their own
    if (params.fem !== lastFem) { lastFem = params.fem; bodyState.setSexAll(params.fem * 2 - 1); }
    // species, per-part sex and features come from the body state, on top of the player's sliders
    const R = resolveBody(bodyState, layers);
    // per-part sex: if the parts differ, build the masculine and feminine bodies and blend them per vertex
    const partSex = SEX_PARTS.map(id => (bodyState.parts[id].sex + 1) / 2);
    const mixed = partSex.some(v => Math.abs(v - partSex[0]) > 0.005);
    const effParams = { ...params, fem: mixed ? 1 : partSex[0], chestFem: mixed ? 1 : partSex[2] }, effDetails = { ...details };
    for (const [key, v] of Object.entries(R.macro)) effParams[key] = Math.min(1, Math.max(0, (effParams[key] ?? 0.5) + v));
    for (const [key, v] of Object.entries(R.details)) effDetails[key] = Math.min(1, Math.max(-1, (effDetails[key] || 0) + v));
    const W = detailWeights(meta.modifiers, effDetails, macroWeights(effParams));
    for (const [key, v] of Object.entries(R.custom)) W[key] = (W[key] || 0) + v;
    mark('resolve');
    let P = human.compute(W);
    if (mixed) {
      const Pf = Float32Array.from(P);
      const pm = { ...effParams, fem: 0, chestFem: 0 }, Wm = detailWeights(meta.modifiers, effDetails, macroWeights(pm));
      for (const [key, v] of Object.entries(R.custom)) Wm[key] = (Wm[key] || 0) + v;
      const Pm = human.compute(Wm), NP = SEX_PARTS.length;
      // the skeleton (where the head and every joint sit) follows the overall body sex; each
      // vertex's shape around its bones follows its own part. So a feminine face on a still
      // masculine body sits at the masculine body's height instead of sinking into the shoulders.
      const F = (bodyState.bodySex() + 1) / 2, SK = meta.skeleton, dJ = new Float32Array(SK.length * 3);
      SK.forEach((b, bi) => {
        const hv = Array.isArray(b.head) ? b.head : [b.head];
        for (const v of hv) for (let c = 0; c < 3; c++) dJ[bi * 3 + c] += (Pf[v * 3 + c] - Pm[v * 3 + c]) / hv.length;
      });
      for (let i = 0; i < meta.vertexCount; i++) {
        let f = 0; for (let j = 0; j < NP; j++) f += vertPartW[i * NP + j] * partSex[j];
        let sx = 0, sy = 0, sz = 0;
        for (let k = 0; k < 4; k++) { const w = meta.skinWeight[i * 4 + k] / 255, bi = meta.skinIndex[i * 4 + k] * 3; sx += w * dJ[bi]; sy += w * dJ[bi + 1]; sz += w * dJ[bi + 2]; }
        const o = i * 3, g = F - f;
        Pm[o] += (Pf[o] - Pm[o]) * f + g * sx; Pm[o + 1] += (Pf[o + 1] - Pm[o + 1]) * f + g * sy; Pm[o + 2] += (Pf[o + 2] - Pm[o + 2]) * f + g * sz;
      }
      P = Pm;
    }
    mark('morph');
    posAttr.array.set(P); posAttr.needsUpdate = true;
    bodyGeo.computeVertexNormals();
    if (shellGeo.attributes.normal !== bodyGeo.attributes.normal) shellGeo.setAttribute('normal', bodyGeo.attributes.normal);   // shells need the body's normals to grow outward
    mark('normals');
    const Nrm = bodyGeo.attributes.normal.array;
    let minY = 1e9, maxY = -1e9;
    for (let i = 0; i < meta.bodyVertexCount; i++) { const y = P[i * 3 + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const surface = Float32Array.from(P);                 // what each next layer drapes over
    if (doCloth) lastCloth = t0;
    if (doCloth) for (const key of worn) {
      const g = garments[key];
      fitGarment(g, surface, Nrm); layerOver(g, surface);
      // the loose part sits over the fitted part's lower edge and eases out from there
      if (g.hang) { fitHang(g, meta, surface); g.hangPiece.attr.needsUpdate = true; g.springs.reset(g.hang.positions); g.shown.set(g.hang.positions); g.simAttr.needsUpdate = true; }
      g.shell.attr.needsUpdate = true; g.shell.geo.computeVertexNormals();
    }
    const shoeBottom = doCloth ? (lastShoeBottom = fitShoes(shoes, P, SHOE.upper, SHOE.sole)) : lastShoeBottom;
    if (doCloth) { shoePos.needsUpdate = shoeCol.needsUpdate = true; shoeGeo.computeVertexNormals(); }
    mark('clothing');
    // refit the skeleton to the new shape and make it the bind pose
    rig.fit(P);
    root.updateMatrixWorld(true);
    rig.skeleton.calculateInverses();
    { const moved = !groomMesh.bindMatrix.equals(groomMesh.matrixWorld);
      for (const m of [...skinned, groomMesh]) { m.bindMatrix.copy(m.matrixWorld); m.bindMatrixInverse.copy(m.matrixWorld).invert(); }   // (the hair too: a stale bind put it a body-length off the head)
      if (moved) hairR.reset(); }   // (its physics starts again from the style only when the binding really moved)
    ['left', 'right'].forEach((side, n) => {
      const ids = meta.eyes[side];
      let x = 0, y = 0, z = 0, mn = 1e9, mx = -1e9;
      for (const i of ids) { x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; mn = Math.min(mn, P[i * 3]); mx = Math.max(mx, P[i * 3]); }
      eyes[n].position.set(x / ids.length, y / ids.length, z / ids.length).sub(rig.worldHead(n ? 'eye.R' : 'eye.L'));
      eyes[n].scale.setScalar((mx - mn) / 2);
    });
    measureLimbs(P);
    mark('skeleton');
    // skin under the worn clothing (and shoes): shell fur and feathers skip it
    if (doCloth) {
      const clothed = new Float32Array(meta.vertexCount);
      for (const key of worn) for (const v of garments[key].verts) if (!v.inner) { clothed[v.a] = 1; clothed[v.b] = 1; }
      for (let i = 0; i < meta.bodyVertexCount; i++) if (meta.positions[i * 3 + 1] < -6.9) clothed[i] = 1;
      // close the mask (grow four rings, shrink three back): fills seams and waistband gaps between garments
      // without pushing the garment edges outward, then one ring of margin so tips never poke out at an edge
      const T = meta.bodyTris;
      const grow = () => { const was = clothed.slice(); for (let t = 0; t < T.length; t += 3) if (was[T[t]] || was[T[t + 1]] || was[T[t + 2]]) clothed[T[t]] = clothed[T[t + 1]] = clothed[T[t + 2]] = 1; };
      const shrink = () => { const was = clothed.slice(); for (let t = 0; t < T.length; t += 3) if (!was[T[t]] || !was[T[t + 1]] || !was[T[t + 2]]) clothed[T[t]] = clothed[T[t + 1]] = clothed[T[t + 2]] = 0; };
      for (let k = 0; k < 4; k++) grow();
      for (let k = 0; k < 3; k++) shrink();
      skinDetail.setClothed(clothed); shellClothed = clothed; shellClothedVersion++;
    }
    if (!perf.off.hair) fitHair(P, Nrm, busy);
    mark('hair');
    fitParts(P);
    fitWebbing(); fitArmWings(); fitClaws(P); fitTailCape(P); fitWeapons(P);
    mark('parts');
    perf.stages.total = performance.now() - t0;
    ground = -shoeBottom;
    root.position.y = ground * 0.1; rootBaseY = root.position.y;
    headY = (maxY + ground) * 0.1;
    emitChange();
  }
  update();

  // ---- UI ----
  const SL = [
    ['Body', [['fem', 'Masc. ↔ Fem.', 0, 1], ['age', 'Age', 0, 1], ['muscle', 'Muscle', 0, 1], ['weight', 'Weight', 0, 1], ['height', 'Height', 0, 1], ['proportions', 'Proportions', 0, 1]]],
    ['Chest', [['bust', 'Size', 0, 1], ['firmness', 'Firmness', 0, 1], ['bustY', 'Height', -1, 1], ['bustSpace', 'Spacing', -1, 1], ['bustShape', 'Shape', -1, 1]]],
  ];
  let queued = false;
  const request = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } };
  const sliders = {}, rows = [];
  // every control registers how to go back to its default; a section's Reset runs the ones inside it.
  // Defaults are the race's and gender's: race and species shapes sit on top of the sliders, so a
  // slider's default is its neutral value, and the body sliders take the starting gender and age.
  const resetters = [];
  const paramDefaults = { ...DEFAULT_PARAMS };
  const makeRow = (parent, label, mn, mx, get, set, defFn) => {
    const row = document.createElement('label'); row.className = 'row'; row.innerHTML = `<span>${label}</span>`;
    const r = document.createElement('input'); r.type = 'range'; r.min = mn; r.max = mx; r.step = 0.01; r.value = get();
    const reset = () => { const v = defFn ? defFn() : parseFloat(r.defaultValue); r.value = v; set(v); };
    r.oninput = () => { set(parseFloat(r.value)); request(); };
    r.ondblclick = () => { reset(); request(); };
    row.appendChild(r); parent.appendChild(row); rows.push({ row, r, label: label.toLowerCase(), reset });
    resetters.push({ el: row, fn: reset });
    return r;
  };
  // A range control paired with a precise numeric field: drag for broad changes, type for exact values.
  const makeNumberRow = (parent, label, mn, mx, step, get, set, defFn) => {
    const row = document.createElement('label'); row.className = 'row'; row.innerHTML = `<span>${label}</span>`;
    const r = document.createElement('input'); r.type = 'range'; r.min = mn; r.max = mx; r.step = step; r.value = get();
    const n = document.createElement('input'); n.type = 'number'; n.min = mn; n.max = mx; n.step = step; n.value = get();
    n.style.cssText = 'width:5.5rem;min-width:5.5rem;margin-left:0.45rem';
    const apply = value => { const v = Number(value); if (!Number.isFinite(v)) return; const clamped = Math.max(mn, Math.min(mx, v)); r.value = n.value = clamped; set(clamped); request(); };
    r.oninput = () => apply(r.value);
    n.onchange = () => apply(n.value);
    const reset = () => { const v = defFn ? defFn() : parseFloat(r.defaultValue); r.value = n.value = v; set(v); };
    r.ondblclick = n.ondblclick = () => { reset(); request(); };
    row.appendChild(r); row.appendChild(n); parent.appendChild(row); rows.push({ row, r, label: label.toLowerCase(), reset });
    resetters.push({ el: row, fn: reset });
    return { range: r, number: n };
  };
  const colorRow = (parent, label, get, set) => {
    const row = document.createElement('label'); row.className = 'row'; row.innerHTML = `<span>${label}</span>`;
    const c = document.createElement('input'); c.type = 'color'; c.value = get(); c.className = 'pick';
    const initial = c.value;
    c.oninput = () => set(c.value);
    row.appendChild(c); parent.appendChild(row);
    resetters.push({ el: row, fn: () => { c.value = initial; set(initial); } });
    return c;
  };
  const runResets = (scope) => { for (const x of resetters) if (!scope || scope.contains(x.el)) x.fn(); scheduleLooks(); update(); };
  // search across every slider
  const search = document.createElement('input');
  search.type = 'search'; search.placeholder = 'Find a slider…'; search.className = 'search'; search.setAttribute('aria-label', 'Find a slider');
  ui.controls.appendChild(search);
  const tools = document.createElement('div'); tools.className = 'btns tools';
  const resetAll = document.createElement('button'); resetAll.textContent = 'Reset all';
  tools.appendChild(resetAll); ui.controls.appendChild(tools);

  // creator tabs: which section goes where (sections not listed are developer panels, hidden)
  const TAB_OF = {
    Body: 'Body', Chest: 'Body', Measurements: 'Body', Torso: 'Body', 'Arms and hands': 'Body', 'Hips and legs': 'Body', Feet: 'Body', Neck: 'Body',
    Head: 'Face', Eyes: 'Face', Brows: 'Face', Nose: 'Face', Mouth: 'Face', Ears: 'Face', 'Cheeks and chin': 'Face', Lashes: 'Face', 'Brow hair': 'Face',
    Hair: 'Hair', Skin: 'Skin', 'Skin details': 'Skin', Race: 'Skin',
    Pose: 'Motion', Equipment: 'Motion',   // (the Animation lab and its weapons: for trying moves and combos while making the character)
  };
  const RENAME = { Race: 'Species features', Skin: 'Skin tone' };
  const tabPanes = {}, hiddenBin = document.createElement('div');
  if (creator) {
    const bar = document.createElement('div'); bar.className = 'btns tabs'; bar.setAttribute('role', 'tablist');
    ui.controls.insertBefore(bar, search);
    for (const t of ['Body', 'Face', 'Hair', 'Skin', 'Motion']) {
      const b = document.createElement('button'); b.textContent = t; b.setAttribute('role', 'tab'); b.setAttribute('aria-pressed', t === 'Body');
      const pane = document.createElement('div'); pane.className = 'tab-pane'; pane.hidden = t !== 'Body';
      b.onclick = () => { for (const [k, pn] of Object.entries(tabPanes)) pn.hidden = k !== t; bar.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); view = t === 'Body' || t === 'Motion' ? 'full' : 'face'; zoom = view === 'face' ? 1 : 0; lastView = view; };
      bar.appendChild(b); tabPanes[t] = pane; ui.controls.appendChild(pane);
    }
  }
  const sections = [];
  const section = (title, open) => {
    const d = document.createElement('details'); d.open = open;
    const sm = document.createElement('summary'); sm.textContent = creator ? (RENAME[title] || title) : title; d.appendChild(sm);
    const rb = document.createElement('button'); rb.className = 'sec-reset'; rb.textContent = 'Reset'; rb.title = `Reset ${sm.textContent} to your race's and gender's default`;
    rb.onclick = e => { e.preventDefault(); e.stopPropagation(); runResets(d); };
    sm.appendChild(rb);
    (creator ? (TAB_OF[title] ? tabPanes[TAB_OF[title]] : hiddenBin) : ui.controls).appendChild(d); sections.push(d); return d;
  };
  for (const [title, list] of SL) {
    const d = section(title, true);
    for (const [k, label, mn, mx] of list) sliders[k] = makeRow(d, label, mn, mx, () => params[k], v => { params[k] = v; }, () => paramDefaults[k]);
  }
  const bySection = {};
  for (const m of meta.modifiers) (bySection[m.section] = bySection[m.section] || []).push(m);
  for (const [title, mods] of Object.entries(bySection)) {
    const d = section(title, false);
    for (const m of mods) { details[m.id] = 0; makeRow(d, labelFor(m.id), m.signed ? -1 : 0, 1, () => details[m.id], v => { details[m.id] = v; }, () => 0); }
  }
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    for (const x of rows) x.row.hidden = q && !x.label.includes(q) && !(x.row.closest('details').firstChild.textContent.toLowerCase().includes(q));
    if (q) sections.forEach(d => { d.open = [...d.querySelectorAll('.row')].some(r => !r.hidden); });
  };
  resetAll.onclick = () => runResets(creator ? ui.controls : null);

  const hairSec = section('Hair', true);
  const pressRow = (parent, items, current, onPick) => {
    const row = document.createElement('div'); row.className = 'btns'; row.style.marginBottom = '0.35rem';
    items.forEach((label, i) => {
      const b = document.createElement('button'); b.textContent = label; b.setAttribute('aria-pressed', i === current);
      b.onclick = () => { onPick(i); row.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
      row.appendChild(b);
    });
    parent.appendChild(row);
    resetters.push({ el: row, fn: () => { onPick(current); row.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', i === current)); } });
  };
  const label = (parent, text) => { const l = document.createElement('div'); l.textContent = text; l.style.cssText = 'color:var(--muted);margin:0.4rem 0 0.2rem'; parent.appendChild(l); };
  pressRow(hairSec, ['Hair', 'Bald'], 0, i => { hairOn = i === 0; update(); });
  label(hairSec, 'Main hairstyle');
  pressRow(hairSec, GROOM_STYLE_NAMES.main, hairSel.main, i => { hairSel.main = i; update(); });
  makeRow(hairSec, 'Main hair length', -1, 1, () => hairLen.main, v => { hairLen.main = v; });
  label(hairSec, 'Bangs style');
  pressRow(hairSec, GROOM_STYLE_NAMES.bangs, hairSel.bangs, i => { hairSel.bangs = i; update(); });
  makeRow(hairSec, 'Bangs length', -1, 1, () => hairLen.bangs, v => { hairLen.bangs = v; });
  label(hairSec, 'Color');
  const hc = document.createElement('div'); hc.className = 'sw'; hc.style.marginTop = '0.5rem';
  for (const c of ['#e6e1ea', '#e8d6a8', '#b07a3e', '#8a3b24', '#5a3a26', '#2a1d18', '#121012']) {
    const b = document.createElement('button'); b.style.setProperty('--c', c); b.setAttribute('aria-label', 'Hair color ' + c); b.onclick = () => setHairColor(c); hc.appendChild(b);
  }
  hairSec.appendChild(hc);
  pickers.root = colorRow(hairSec, 'Root color', () => hairColor, v => setHairColor(v, hairTip));
  pickers.tip = colorRow(hairSec, 'Tip color', () => hairTip, v => setHairColor(hairColor, v));
  makeRow(hairSec, 'Tip blend', -1, 1, () => hairBlend, v => { hairBlend = v; hairU.uHairBlend.value = 0.55 - 0.4 * v; });

  // ---- Hair lab: look, feel, motion tests, detail levels ----
  label(hairSec, 'Hair lab — look');
  makeRow(hairSec, 'Scalp coverage', 0, 1, () => hairLook.coverage, v => { hairLook.coverage = v; });
  makeRow(hairSec, 'Hairline coverage', 0, 1, () => hairLook.hairlineCoverage, v => { hairLook.hairlineCoverage = v; });
  makeNumberRow(hairSec, 'Strand density (×)', 0.1, 100, 0.1, () => hairLook.density, v => { hairLook.density = v; });
  makeRow(hairSec, 'Volume', 0.6, 1.6, () => hairLook.volume, v => { hairLook.volume = v; });
  makeRow(hairSec, 'Curl', 0, 3, () => hairLook.curl, v => { hairLook.curl = v; });
  makeRow(hairSec, 'Wave', 0, 1, () => hairLook.wave, v => { hairLook.wave = v; });
  label(hairSec, 'Hair lab — movement');
  const phys = (lab, k, mn, mx) => makeRow(hairSec, lab, mn, mx, () => hairPhys[k], v => { hairPhys[k] = v; if (hairR.sim) hairR.sim.params[k] = v; });
  phys('Follow turns', 'follow', 0, 1); phys('Inertia', 'inertia', 0, 1); phys('Stiffness', 'stiffness', 0.3, 1.6); phys('Damping', 'damping', 0.3, 2.5); phys('Gravity', 'gravity', 0, 2);
  makeRow(hairSec, 'Test wind', 0, 2, () => labWind, v => { labWind = v; });
  pressRow(hairSec, ['Shake head', 'Turn', 'Jump', 'Run'], -1, i => { labTest = { kind: ['shake', 'turn', 'jump', 'run'][i], t0: clock.elapsedTime, len: i === 3 ? 4 : 3 }; });
  label(hairSec, 'Detail level (what a distant camera sees)');
  pressRow(hairSec, ['Auto', 'Near', 'Mid', 'Far'], 0, i => { hairR.lodForce = i === 0 ? null : 3 - i; });
  const labOut = document.createElement('div'); labOut.style.cssText = 'color:var(--muted);font-size:0.85em;margin:0.3rem 0'; hairSec.appendChild(labOut);
  labInfo = () => { const f = hairR.info; if (f) labOut.textContent = `${f.strands.toLocaleString()} strands · ${(f.tris / 1000).toFixed(1)}k tris · ${f.guides} guides · scalp ${f.coverage?.roots ?? f.guides} roots`; };
  labInfo();
  setHairColor(hairColor);
  const detailSec = section('Skin details', false);
  for (const [region, title] of [['face', 'Face'], ['body', 'Body']]) {
    label(detailSec, title);
    for (const [k, lab, mn] of [
      ['freckles', 'Freckles', 0], ['freckleSize', 'Freckle size', -1], ['freckleCluster', 'Clustering', 0], ['freckleX', 'Freckles ↔', -1], ['freckleY', 'Freckles ↕', -1],
      ['moles', 'Moles', 0], ['moleSize', 'Mole size', -1], ['moleX', 'Moles ↔', -1], ['moleY', 'Moles ↕', -1],
      ['patches', 'Patches', 0], ['patchSize', 'Patch size', -1], ['patchX', 'Patches ↔', -1], ['patchY', 'Patches ↕', -1],
      ['texture', 'Skin texture', 0], ['textureScale', 'Texture scale', -1]]) {
      makeRow(detailSec, lab, mn, 1, () => detail[region][k], v => { detail[region][k] = v; skinDetail.apply(detail); });
    }
    for (const [k, lab] of [['freckleColor', 'Freckle color'], ['moleColor', 'Mole color'], ['patchColor', 'Patch color'], ['scarColor', 'Scar color']]) {
      colorRow(detailSec, lab, () => detail[region][k], v => { detail[region][k] = v; skinDetail.apply(detail); });
    }

  }
  // ---- scars: pick a shape, click the character to place it, then adjust ----
  label(detailSec, 'Scars');
  const scarHint = document.createElement('div'); scarHint.style.cssText = 'color:var(--muted);font-size:0.9em;margin:0.2rem 0';
  scarHint.textContent = 'Pick a shape, then click on the character.';
  detailSec.appendChild(scarHint);
  let placing = null, selected = -1;                       // placing: { type } (stays on) or { move: index } (one click)
  const shapeRow = document.createElement('div'); shapeRow.className = 'btns'; shapeRow.style.marginBottom = '0.35rem';
  const shapeBtns = SCAR_TYPES.map((t, i) => {
    const b = document.createElement('button'); b.textContent = t.name; b.setAttribute('aria-pressed', 'false');
    b.onclick = () => setPlacing(placing && placing.type === i ? null : { type: i });
    shapeRow.appendChild(b); return b;
  });
  detailSec.appendChild(shapeRow);
  function setPlacing(p) {
    placing = p;
    shapeBtns.forEach((b, i) => b.setAttribute('aria-pressed', !!(p && p.type === i)));
    if (typeof moveB !== 'undefined') moveB.setAttribute('aria-pressed', !!(p && p.move !== undefined));
    scarHint.textContent = !p ? 'Pick a shape, then click on the character.'
      : p.move !== undefined ? 'Click on the character to move the selected scar.'
      : `Click on the character to place ${SCAR_TYPES[p.type].name.toLowerCase()} scars. Click the shape again to stop.`;
  }
  const scarList = document.createElement('div'); scarList.className = 'btns'; detailSec.appendChild(scarList);
  const scarEdit = document.createElement('div'); detailSec.appendChild(scarEdit);
  const scarRows = [['size', 'Size'], ['angle', 'Rotation'], ['width', 'Width']].map(([k, lab]) =>
    makeRow(scarEdit, lab, k === 'angle' ? -3.14 : -1, k === 'angle' ? 3.14 : 1, () => 0, v => { if (selected >= 0) { detail.scars[selected][k] = v; skinDetail.apply(detail); } }));
  const scarTools = document.createElement('div'); scarTools.className = 'btns'; scarEdit.appendChild(scarTools);
  const moveB = document.createElement('button'); moveB.textContent = 'Move'; moveB.setAttribute('aria-pressed', 'false');
  moveB.onclick = () => setPlacing(placing && placing.move !== undefined ? null : { move: selected });
  const delB = document.createElement('button'); delB.textContent = 'Remove'; delB.onclick = () => { detail.scars.splice(selected, 1); selected = -1; setPlacing(null); refreshScars(); skinDetail.apply(detail); };
  scarTools.append(moveB, delB);
  function refreshScars() {
    scarList.innerHTML = '';
    detail.scars.forEach((sc, i) => {
      const b = document.createElement('button'); b.textContent = `${i + 1}. ${SCAR_TYPES[sc.type].name}`; b.setAttribute('aria-pressed', i === selected);
      b.onclick = () => { selected = i; if (placing && placing.type !== undefined) setPlacing(null); refreshScars(); };
      scarList.appendChild(b);
    });
    scarEdit.hidden = selected < 0;
    if (selected >= 0) { const sc = detail.scars[selected]; scarRows[0].value = sc.size; scarRows[1].value = sc.angle; scarRows[2].value = sc.width; }
  }
  refreshScars();
  // picking: the body vertex under the cursor, using the posed body you see
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), sv = new THREE.Vector3();
  function pickBodyVertex(ev) {
    const r = canvas.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
    const o = ray.ray.origin.clone().applyMatrix4(inv), d = ray.ray.direction.clone().transformDirection(inv);
    let best = -1, bestT = 1e9;
    for (let i = 0; i < meta.bodyVertexCount; i++) {
      body.boneTransform(i, sv);
      const t = sv.clone().sub(o).dot(d);
      if (t < 0) continue;
      const dist = sv.clone().sub(o).sub(d.clone().multiplyScalar(t)).length();
      if (dist < 0.06 && t < bestT) { bestT = t; best = i; }
    }
    return best;
  }
  // a click places (not the end of a drag to turn the model)
  let downAt = null;
  canvas.addEventListener('pointerdown', ev => { downAt = [ev.clientX, ev.clientY]; });
  canvas.addEventListener('click', ev => {
    if (!placing || !downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
    const v = pickBodyVertex(ev);
    if (v < 0) { scarHint.textContent = 'That missed the body; try again.'; return; }
    if (placing.move !== undefined) {
      if (detail.scars[placing.move]) { detail.scars[placing.move].at = v; selected = placing.move; }
      setPlacing(null);
    } else {
      detail.scars.push({ type: placing.type, at: v, size: 0, angle: 0, width: 0 }); selected = detail.scars.length - 1;
    }
    refreshScars(); skinDetail.apply(detail);
  });
  // ---- body parts: per-part species and sex, the way story events will change them ----
  const partsSec = section('Body parts', false);
  const pick = (opts, cur) => { const sel = document.createElement('select'); sel.className = 'pick'; for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); } sel.value = cur; return sel; };
  const partSel = pick([['*', 'All parts'], ...Object.entries(BODY_PARTS).map(([id, d]) => [id, d.name + (d.visible === false ? ' (data only)' : '')])], 'ears');
  const eachPart = (fn) => (partSel.value === '*' ? Object.keys(BODY_PARTS) : [partSel.value]).forEach(fn);
  const specSel = pick(Object.keys(layers).map(k => [k, k.replace(':', ' · ')]), 'therian:feline');
  partsSec.append(partSel, specSel);
  const amtRow = makeRow(partsSec, 'Species amount', 0, 1, () => 0, v => eachPart(id => bodyState.setSpecies(id, specSel.value, v)));
  const sexRow = makeRow(partsSec, 'Part sex (masc ↔ fem)', -1, 1, () => 0, v => eachPart(id => bodyState.setSex(id, v)));
  const sizeRow = makeRow(partsSec, 'Part size', -1, 1, () => 0, v => eachPart(id => bodyState.setSize(id, v)));
  const readout = document.createElement('pre'); readout.style.cssText = 'white-space:pre-wrap;font-size:0.85em;color:var(--muted);margin:0.4rem 0';
  partsSec.appendChild(readout);
  const syncPartRows = () => {
    const p = bodyState.get(partSel.value === '*' ? 'torso' : partSel.value);
    amtRow.value = p.species[specSel.value] || 0; sexRow.value = p.sex; sizeRow.value = p.size;
    const t = bodyState.totals();
    const comp = Object.entries(t.species).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0.005).map(([k, v]) => `  ${k.replace(':', ' · ')}: ${(v * 100).toFixed(1)}%`).join('\n');
    readout.textContent = `${partSel.value === '*' ? 'All parts (torso shown)' : BODY_PARTS[partSel.value].name}: ` + Object.entries(p.species).map(([k, v]) => `${k.split(':')[1]} ${(v * 100).toFixed(0)}%`).join(', ') +
      `\n\nWhole body:\n${comp}\n  sex score: ${t.sex.toFixed(2)} (−1 masc … +1 fem)`;
  };
  partSel.onchange = syncPartRows; specSel.onchange = () => { syncPartRows(); syncAllParts(); };
  syncPartRows();

  // ---- transformation lab: simulate what events will do, with the same API ----
  label(partsSec, 'Simulate a transformation (to the species picked above)');
  // the order a transformation spreads through the body: [part, start, end] along the progress
  const ORDER = [['eyes', 0, 0.2], ['ears', 0.05, 0.3], ['skinFace', 0.1, 0.4], ['muzzle', 0.15, 0.5], ['voice', 0.2, 0.5],
    ['face', 0.25, 0.55], ['head', 0.3, 0.65], ['horns', 0.35, 0.7], ['hair', 0.4, 0.75], ['hands', 0.4, 0.7], ['skinBody', 0.45, 0.8],
    ['neck', 0.5, 0.8], ['arms', 0.5, 0.8], ['chest', 0.55, 0.85], ['torso', 0.55, 0.9], ['waist', 0.6, 0.9], ['hips', 0.6, 0.9],
    ['nether', 0.65, 0.9], ['legs', 0.65, 0.95], ['feet', 0.7, 1], ['tail', 0.7, 1], ['wings', 0.75, 1]];
  let tfAll = false;                                   // all parts at once, or spreading through the body
  const stage = (q, a, b) => tfAll ? q : Math.min(1, Math.max(0, (q - a) / (b - a)));
  let tfProgress = 0, sexProgress = 0;
  const tfRow = makeRow(partsSec, 'Transformation progress', 0, 1, () => tfProgress, v => {
    tfProgress = v; for (const [part, a, b] of ORDER) bodyState.setSpecies(part, specSel.value, stage(v, a, b));
  });
  const SEX_ORDER = [['face', 0, 0.4], ['voice', 0.05, 0.45], ['chest', 0.1, 0.5], ['head', 0.15, 0.55], ['hips', 0.25, 0.65], ['waist', 0.3, 0.7],
    ['neck', 0.35, 0.75], ['nether', 0.4, 0.8], ['torso', 0.45, 0.85], ['arms', 0.5, 0.9], ['hands', 0.55, 0.9], ['legs', 0.55, 0.95], ['feet', 0.6, 1]];
  let sexToFem = true;
  makeRow(partsSec, 'Sex transformation', 0, 1, () => sexProgress, v => {
    sexProgress = v; for (const [part, a, b] of SEX_ORDER) { const t = stage(v, a, b); bodyState.setSex(part, sexToFem ? -1 + 2 * t : 1 - 2 * t); }
  });
  pressRow(partsSec, ['Masc → fem', 'Fem → masc'], 0, i => { sexToFem = i === 0; });
  pressRow(partsSec, ['Part by part', 'All at once'], 0, i => { tfAll = i === 1; });
  const tfBtns = document.createElement('div'); tfBtns.className = 'btns'; tfBtns.style.margin = '0.3rem 0';
  const sexRowEl = [...partsSec.querySelectorAll('.row')].find(r => r.textContent.trim() === 'Sex transformation').querySelector('input');
  let playing = null;
  // play a transformation over 8 seconds: species, sex, or both together
  const playBtns = [['Play species', [tfRow]], ['Play sex', [sexRowEl]], ['Play both', [tfRow, sexRowEl]]].map(([label, rowsToPlay]) => {
    const b = document.createElement('button'); b.textContent = label;
    b.onclick = () => {
      const was = playing && playing.b === b;
      if (playing) { cancelAnimationFrame(playing.id); playing.b.textContent = playing.label; playing = null; }
      if (was) return;
      const t0 = performance.now(), from = rowsToPlay.map(r => (parseFloat(r.value) >= 1 ? 0 : parseFloat(r.value)));
      b.textContent = 'Stop';
      const step = now => {
        let done = true;
        rowsToPlay.forEach((r, k) => { const v = Math.min(1, from[k] + (now - t0) / 8000); r.value = v; r.dispatchEvent(new Event('input')); if (v < 1) done = false; });
        if (!done) playing.id = requestAnimationFrame(step); else { b.textContent = label; playing = null; }
      };
      playing = { b, label, id: requestAnimationFrame(step) };
    };
    return b;
  });
  const resetB = document.createElement('button'); resetB.textContent = 'Reset to human';
  resetB.onclick = () => { if (playing) { cancelAnimationFrame(playing.id); playing.b.textContent = playing.label; playing = null; } tfRow.value = 0; tfRow.dispatchEvent(new Event('input')); bodyState.preset(HUMAN, 1); };
  tfBtns.append(...playBtns, resetB); partsSec.appendChild(tfBtns);
  // one slider per part for the picked species, kept in sync with every change
  label(partsSec, 'Each part (picked species)');
  const allRows = {};
  for (const [id, d] of Object.entries(BODY_PARTS)) {
    allRows[id] = makeRow(partsSec, d.name + (d.visible === false ? ' (data)' : ''), 0, 1, () => 0, v => bodyState.setSpecies(id, specSel.value, v));
  }
  function syncAllParts() { for (const [id, r] of Object.entries(allRows)) if (document.activeElement !== r) r.value = bodyState.species(id, specSel.value); }
  // the readouts refresh once per frame, however many parts changed
  let syncQueued = false;
  bodyState.on('change', () => { if (syncQueued) return; syncQueued = true; requestAnimationFrame(() => { syncQueued = false; syncPartRows(); syncAllParts(); }); });
  syncAllParts();
  // ---- performance: what costs what, and switches to rule things out one at a time ----
  const perfSec = section('Performance', false);
  const perfOut = document.createElement('pre'); perfOut.style.cssText = 'white-space:pre-wrap;font-size:0.85em;color:var(--muted);margin:0.3rem 0';
  perfSec.appendChild(perfOut);
  const toggles = [['hair', 'Hair'], ['hairSim', 'Hair physics'], ['cloth', 'Cloth physics'], ['shells', 'Fur and feather shells'], ['shadows', 'Shadows'], ['parts', 'Species parts']];
  const tg = document.createElement('div'); tg.className = 'btns';
  for (const [k, lab] of toggles) {
    const b = document.createElement('button'); b.textContent = lab; b.setAttribute('aria-pressed', 'true');
    b.onclick = () => { perf.off[k] = !perf.off[k]; b.setAttribute('aria-pressed', !perf.off[k]); applyPerfToggles(); };
    tg.appendChild(b);
  }
  perfSec.appendChild(tg);
  function applyPerfToggles() {
    for (const m of [groomMesh, scalpPiece.mesh]) m.visible = hairOn && gearRules.hair !== 'hide' && !perf.off.hair;
    if (renderer) renderer.shadowMap.enabled = !perf.off.shadows;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    for (const m of Object.values(partMeshes)) m.visible = m.visible && !perf.off.parts;
    refreshLooks(); if (!perf.off.hair) update();
  }
  setInterval(() => {
    if (!perfSec.open || !renderer) return;
    const st = Object.entries(perf.stages).map(([k, v]) => `  ${k.padEnd(9)} ${v.toFixed(1)} ms`).join('\n');
    const info = renderer.info;
    perfOut.textContent = `FPS ${perf.fps.toFixed(0)} (frame ${perf.frameMs.toFixed(1)} ms)\n  render   ${(perf.renderMs || 0).toFixed(1)} ms   draw calls ${info.render.calls}, triangles ${(info.render.triangles / 1000).toFixed(0)}k\n  cloth ${(perf.clothMs || 0).toFixed(1)} ms   hair physics ${(perf.hairSimMs || 0).toFixed(1)} ms   tail/cape ${(perf.tailCapeMs || 0).toFixed(1)} ms\nLast rebuild (any slider or transformation):\n${st}`;
  }, 500);
  const lashSec = section('Lashes', false);
  for (const [k, lab] of [['upper', 'Upper length'], ['lower', 'Lower length'], ['density', 'Density'], ['thickness', 'Thickness'], ['curl', 'Curl']]) {
    makeRow(lashSec, lab, -1, 1, () => lash[k], v => { lash[k] = v; applyLashes(); });
  }
  const lc = document.createElement('div'); lc.className = 'sw'; lc.style.marginTop = '0.4rem';
  for (const c of ['#140f10', '#3a2618', '#6b4a30', '#8a3b24', '#d8cfc4', 'hair']) {
    const b = document.createElement('button'); b.style.setProperty('--c', c === 'hair' ? 'conic-gradient(#e8d6a8, #5a3a26, #121012, #e8d6a8)' : c);
    b.setAttribute('aria-label', c === 'hair' ? 'Lashes match hair color' : 'Lash color ' + c);
    b.onclick = () => { lash.color = c === 'hair' ? hairColor : c; applyLashes(); if (lashPick) lashPick.value = lash.color; };
    lc.appendChild(b);
  }
  lashSec.appendChild(lc);
  const lashPick = colorRow(lashSec, 'Lash color', () => lash.color, v => { lash.color = v; applyLashes(); });
  const browSec = section('Brow hair', false);
  colorRow(browSec, 'Brow color', () => '#5a4636', v => { browColor = v; browMat.color.copy(lin(v)); });
  pressRow(browSec, BROW_STYLES.map(b => b.name), 0, i => { brow.style = i; update(); });
  for (const [k, lab] of [['thickness', 'Thickness'], ['arch', 'Arch'], ['tilt', 'Tilt'], ['height', 'Height'], ['length', 'Length']]) {
    makeRow(browSec, lab, -1, 1, () => brow[k], v => { brow[k] = v; });
  }
  const skins = ['#f6e0d2', '#e8c4ae', '#d6a888', '#b98563', '#8d5b3d', '#62402b'];
  const sw = document.createElement('div'); sw.className = 'sw';
  const skinSec = section('Skin', true);
  skins.forEach(c => { const b = document.createElement('button'); b.style.setProperty('--c', c); b.setAttribute('aria-label', c); b.onclick = () => skinMat.color.copy(lin(c)); sw.appendChild(b); });
  skinSec.appendChild(sw);
  makeRow(skinSec, 'Translucency', 0, 1.6, () => skinGlow, v => { skinGlow = v; skinDetail.setTranslucency(v); }, () => 1);   // (light through the skin: a soft, warm shadow line)
  ui.presets.forEach(b => b.addEventListener('click', () => {
    const target = b.dataset.preset === 'male' ? 0 : 1;
    const from = params.fem, t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 900), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      params.fem = from + (target - from) * e; sliders.fem.value = params.fem; update();
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }));

  // ---- race ----
  const raceSec = section('Race', true);
  if (!creator) ui.controls.insertBefore(raceSec, ui.controls.querySelector('details'));
  const subWrap = document.createElement('div'), skinWrap = document.createElement('div'), partsNote = document.createElement('div');
  partsNote.style.cssText = 'color:var(--muted);font-size:0.9em;margin:0.3rem 0';
  const raceRow = document.createElement('div'); raceRow.className = 'btns'; raceRow.style.marginBottom = '0.35rem';
  RACES.forEach((r, i) => {
    const b = document.createElement('button'); b.textContent = r.name; b.setAttribute('aria-pressed', i === race.index);
    b.onclick = () => { race.index = i; race.sub = 0; raceRow.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); buildSubs(); applyRacePreset(); };
    raceRow.appendChild(b);
  });
  raceSec.append(raceRow, subWrap);
  // a race is a preset: it sets every part's species to that race at this strength
  function applyRacePreset() { bodyState.preset(speciesKey(race.index, race.sub), race.strength); update(); }
  makeRow(raceSec, 'Race strength', 0, 1, () => race.strength, v => { race.strength = v; bodyState.preset(speciesKey(race.index, race.sub), v); });
  makeRow(raceSec, 'Part size', -1, 1, () => race.partSize, v => { race.partSize = v; });
  makeRow(raceSec, 'Feather spread', 0, 1, () => partOptions.spread, v => { partOptions.spread = v; });
  makeRow(raceSec, 'Covering: face', 0, 1, () => race.coverFace, v => { race.coverFace = v; });
  makeRow(raceSec, 'Covering: body', 0, 1, () => race.coverBody, v => { race.coverBody = v; });
  makeRow(raceSec, 'Covering size', -1, 1, () => race.coverSize, v => { race.coverSize = v; });
  colorRow(raceSec, 'Covering color', () => '#8a7a60', v => { race.coverA = v; scheduleLooks(); });
  colorRow(raceSec, 'Covering accent', () => '#c8b898', v => { race.coverB = v; scheduleLooks(); });
  makeRow(raceSec, 'Covering luster', -1, 1, () => race.luster, v => { race.luster = v; scheduleLooks(); });
  makeRow(raceSec, 'Fur length', -1, 1, () => race.furLength, v => { race.furLength = v; scheduleLooks(); });
  const furL = document.createElement('div'); furL.textContent = 'Fur pattern'; furL.style.cssText = 'color:var(--muted);margin:0.4rem 0 0.2rem'; raceSec.appendChild(furL);
  pressRow(raceSec, ['Race default', 'Solid', 'Tabby', 'Spotted', 'Points', 'Tuxedo'], 0, i => { race.furPattern = i === 0 ? null : i - 1; scheduleLooks(); });
  colorRow(raceSec, 'Pattern color', () => '#3a2a1e', v => { race.furDark = v; scheduleLooks(); });
  colorRow(raceSec, 'Nose color', () => '#c07878', v => { race.noseColor = v; scheduleLooks(); });
  const pupilL = document.createElement('div'); pupilL.textContent = 'Pupils'; pupilL.style.cssText = 'color:var(--muted);margin:0.4rem 0 0.2rem'; raceSec.appendChild(pupilL);
  pressRow(raceSec, ['Race default', 'Round', 'Slit', 'Horizontal', 'Wide'], 0, i => { race.pupil = [null, 'round', 'slit', 'horizontal', 'wide'][i]; scheduleLooks(); });
  colorRow(raceSec, 'Eye color', () => '#9a6ee8', v => { race.eyeColor = v; scheduleLooks(); });
  makeRow(raceSec, 'Mouth open', 0, 1, () => race.jaw, v => { race.jaw = v; rig.info.jaw = v; });
  const styleWrap = document.createElement('div'); raceSec.appendChild(styleWrap);
  // a style picker for each part the current race has that comes in styles
  function buildStyles() {
    styleWrap.innerHTML = '';
    const L = raceLayer(race.index, race.sub);
    for (const id of Object.keys(L.attach)) {
      const part = PARTS[id]; if (!part || !part.styles) continue;
      const l = document.createElement('div'); l.textContent = part.name + ' style'; l.style.cssText = 'color:var(--muted);margin:0.4rem 0 0.2rem';
      styleWrap.appendChild(l);
      pressRow(styleWrap, part.styles, race.styles[id] || 0, i => { race.styles[id] = i; update(); });
    }
  }
  raceSec.append(skinWrap, partsNote);
  function buildSubs() {
    subWrap.innerHTML = ''; skinWrap.innerHTML = '';
    const row = document.createElement('div'); row.className = 'btns'; row.style.marginBottom = '0.35rem';
    RACES[race.index].subraces.forEach((s, i) => {
      const b = document.createElement('button'); b.textContent = s.name; b.setAttribute('aria-pressed', i === race.sub);
      b.onclick = () => { race.sub = i; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); buildSkins(); applyRacePreset(); };
      row.appendChild(b);
    });
    subWrap.appendChild(row); buildSkins();
  }
  function buildSkins() {
    skinWrap.innerHTML = '';
    const L = raceLayer(race.index, race.sub), sw = document.createElement('div'); sw.className = 'sw';
    L.skins.forEach(c => { const b = document.createElement('button'); b.style.setProperty('--c', c); b.setAttribute('aria-label', 'Skin ' + c); b.onclick = () => skinMat.color.copy(lin(c)); sw.appendChild(b); });
    skinWrap.appendChild(sw);
    skinMat.color.copy(lin(L.skins[Math.min(1, L.skins.length - 1)]));
    resetters.push({ el: sw, fn: () => skinMat.color.copy(lin(L.skins[Math.min(1, L.skins.length - 1)])) });
    if (typeof buildStyles === 'function') buildStyles();
    partsNote.textContent = L.parts.length ? `Coming next for this race: ${[...new Set(L.parts)].join(', ')}.` : '';
  }
  buildSubs();

  // ---- poses ----
  let pose = 'idle';
  const poseSec = section('Pose', true);
  const pb = document.createElement('div'); pb.className = 'btns';
  for (const [id, label] of [['apose', 'A-pose'], ['relaxed', 'Relaxed'], ['idle', 'Idle'], ['walk', 'Walk'], ['wave', 'Wave']]) {
    const b = document.createElement('button'); b.textContent = label; b.setAttribute('aria-pressed', id === pose);
    b.onclick = () => { pose = id; pb.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
    pb.appendChild(b);
  }
  poseSec.appendChild(pb);
  // ---- Animation lab: every everyday move (src/rpg/moves.js), at any speed, looped or scrubbed by hand ----
  { const lab = document.createElement('div'); lab.style.cssText = 'margin-top:0.6rem';
    lab.innerHTML = '<div style="color:var(--muted);margin:0.2rem 0">Animation lab</div>'; poseSec.appendChild(lab);
    const mb = document.createElement('div'); mb.className = 'btns'; lab.appendChild(mb);
    let speed = 1, loop = false;
    for (const [id, M] of Object.entries(MOVES)) { const b = document.createElement('button'); b.textContent = M.name; b.onclick = () => { if (combat.action) { combat.action = null; hideProps(); } combat.scrub = null; startAction('move', { move: id, speed, loop }); }; mb.appendChild(b); }
    makeRow(lab, 'Speed', 0.2, 2, () => speed, v => { speed = v; if (combat.action?.type === 'move') combat.action.speed = v; }, () => 1);
    makeRow(lab, 'Scrub', 0, 1, () => 0, v => { const a = combat.action; if (a?.type === 'move') combat.scrub = v; });
    // combo preview: the weapon in hand, at a chosen skill — the light chain, the heavy chain, or a mixed one (L L H L L H…)
    let cSkill = 100; const cl = document.createElement('div'); cl.style.cssText = 'color:var(--muted);margin:0.5rem 0 0.2rem'; cl.textContent = 'Combos (the weapon in hand)'; lab.appendChild(cl);
    const cOut = document.createElement('div'); cOut.style.cssText = 'color:var(--muted);font-size:0.85em';
    const showLen = () => { const id = gear.equipped().mainHand, w = id && ITEMS[id]?.weapon; cOut.textContent = w ? `${ITEMS[id].name}: ${comboLength(w, cSkill)} light hits · ${heavyLength(comboLength(w, cSkill))} heavy at skill ${Math.round(cSkill)}` : 'Put a weapon in the main hand (Equipment) to preview its combos.'; };
    makeRow(lab, 'Skill', 100, 5000, () => cSkill, v => { cSkill = v; showLen(); }, () => 100);
    pressRow(lab, ['Light chain', 'Heavy chain', 'Mixed'], -1, i => {
      const id = gear.equipped().mainHand, w = id && ITEMS[id]?.weapon; showLen(); if (!w) return;
      const len = comboLength(w, cSkill), hold = holds().main || 'one', steps = [];
      if (i === 0) for (let k = 0; k < len; k++) steps.push(comboStep(hold, 'light', k, len, w));
      else if (i === 1) { const h = heavyLength(len); for (let k = 0; k < h; k++) steps.push(comboStep(hold, 'heavy', k, h, w)); }
      else for (let k = 0; k < len; k++) { const H = k % 3 === 2; const S = comboStep(hold, H ? 'heavy' : 'light', k, len, w); steps.push(S); if (H && !S.continues) break; }
      labCombo = { steps, idx: 0 }; combat.scrub = null; if (combat.action) combat.action = null; hideProps();
      if (!weaponsDrawn) startAction('draw');
    });
    lab.appendChild(cOut); showLen();
    pressRow(lab, ['Play once', 'Loop', 'Stop'], 0, i => { if (i === 2) { combat.action = null; combat.scrub = null; hideProps(); } else { loop = i === 1; if (combat.action?.type === 'move') combat.action.loop = loop; combat.scrub = null; } }); }
  // ---- equipment: a picker per slot, quick outfits, and what the gear adds up to ----
  const gearSec = section('Equipment', true);
  const gearMsg = document.createElement('p'); gearMsg.style.cssText = 'margin:0.3rem 0;font-size:0.85em;color:#e8b070;min-height:1.1em';
  const gearStats = document.createElement('p'); gearStats.style.cssText = 'margin:0.3rem 0;font-size:0.85em;color:var(--muted)';
  const ob = document.createElement('div'); ob.className = 'btns';
  for (const label of Object.keys(OUTFIT_PRESETS)) {
    const b = document.createElement('button'); b.textContent = label; b.setAttribute('aria-pressed', label === 'Tank and shorts');
    b.onclick = () => {
      const fails = gear.setAll(OUTFIT_PRESETS[label]);
      gearMsg.textContent = fails.join(' ');
      ob.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    };
    ob.appendChild(b);
  }
  gearSec.appendChild(ob);
  const slotSel = {};
  for (const [slot, def] of Object.entries(SLOTS)) {
    const items = Object.entries(ITEMS).filter(([, it]) => (it.slots || [it.slot]).includes(slot) && it.slot === slot);
    const sel = pick([['', '—'], ...items.map(([id, it]) => [id, it.name])], '');
    const row = document.createElement('label'); row.className = 'row';
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:0.5rem';
    const span = document.createElement('span'); span.textContent = def.name; row.append(span, sel);
    sel.onchange = () => {
      if (!sel.value) { gear.unequip(slot); gearMsg.textContent = ''; return; }
      const r = gear.equip(sel.value);
      gearMsg.textContent = r.ok ? '' : r.reason;
      if (!r.ok) syncGearUI();
    };
    slotSel[slot] = sel; gearSec.appendChild(row);
  }
  const drawBtn = document.createElement('button'); drawBtn.textContent = 'Draw weapons';
  drawBtn.onclick = () => startAction(weaponsDrawn ? 'sheathe' : 'draw');
  const atkBtn = document.createElement('button'); atkBtn.textContent = 'Attack'; atkBtn.onclick = () => startAction('attack');
  const blkBtn = document.createElement('button'); blkBtn.textContent = 'Block (hold)';
  blkBtn.onpointerdown = () => { combat.blocking = true; }; for (const e of ['pointerup', 'pointerleave']) blkBtn.addEventListener(e, () => { combat.blocking = false; });
  const drawRow = document.createElement('div'); drawRow.className = 'btns'; drawRow.style.marginTop = '0.4rem'; drawRow.append(drawBtn, atkBtn, blkBtn);
  gearSec.append(drawRow, gearStats, gearMsg);
  function syncGearUI() {
    const eq = gear.equipped();
    for (const [slot, sel] of Object.entries(slotSel)) sel.value = eq[slot] && ITEMS[eq[slot]].slot === slot ? eq[slot] : '';
    // a dress fills the bottoms too
    if (eq.bottom && ITEMS[eq.bottom].slot !== 'bottom') { slotSel.bottom.value = ''; slotSel.bottom.title = `Filled by ${ITEMS[eq.bottom].name}`; }
    const st = gear.stats();
    gearStats.textContent = `Armor ${st.armor} · Weight ${st.weight}` + (st.weapon ? ` · ${st.weapon.name}: damage ${st.weapon.damage}, ${st.weapon.speed}/s` : '') + (st.block ? ` · Block ${Math.round(st.block * 100)}%` : '');
  }
  gear.on('change', e => {
    if (e.removed) gearMsg.textContent = e.removed.map(r => `Took off: ${r.reason}`).join(' ');
    syncGearUI(); showOutfit(); update();
  });
  syncGearUI();
  // a transformation can make worn gear stop fitting (horns through a great helm): take it off
  bodyState.on('change', () => gear.validate());
  window.eldermereGear = gear;
  if (!creator) { ui.controls.insertBefore(poseSec, ui.controls.querySelector('details')); ui.controls.insertBefore(gearSec, poseSec.nextSibling); }

  // ---- camera & interaction ----
  let rotY = 0.3, dragging = false, lastX = 0, view = 'full';
  ui.views.forEach(b => b.addEventListener('click', () => { view = b.dataset.view; ui.views.forEach(x => x.setAttribute('aria-pressed', x === b)); }));
  canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (dragging) { rotY += (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  const resize = () => {
    const w = creator ? canvas.clientWidth || 300 : innerWidth, hh = creator ? canvas.clientHeight || 400 : innerHeight;
    if (!renderer) return;
    renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();
  if (creator && typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas);
  const camPos = new THREE.Vector3(0, 1, 4), camLook = new THREE.Vector3(0, 0.9, 0), clock = new THREE.Clock();
  let running = true;
  // problems are shown to the player (ui.onError) instead of silently freezing or blanking the view
  let lastErr = '';
  const report = (msg) => { if (msg === lastErr) return; lastErr = msg; if (msg) console.error('[viewer]', msg); if (ui.onError) ui.onError(msg); };
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); report('the graphics context was lost; restoring…'); });
  canvas.addEventListener('webglcontextrestored', () => { report(''); update(true); });
  // zoom: 0 full body .. 1 face; the wheel moves continuously between (and a little past) them
  let zoom = 0, zoomCur = 0;
  const drive = { pose: 'idle', time: 0, gait: 0, hideHead: false };          // game mode: set by the game
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(-0.35, Math.min(1.1, zoom - e.deltaY * 0.0012)); view = zoom > 0.5 ? 'face' : 'full'; }, { passive: false });
  const fullP = new THREE.Vector3(), fullL = new THREE.Vector3(), faceP = new THREE.Vector3(), faceL = new THREE.Vector3();
  let lastView = view;
  (function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, clock.getDelta());
    try {
      if (!game && labCombo && !combat.action && weaponsDrawn) {   // the creator's combo preview: the next step as each ends
        const S = labCombo.steps[labCombo.idx++]; if (!S) labCombo = null; else startAction('attack', { variant: S.attack, speed: S.speed * (ITEMS[gear.equipped().mainHand]?.speed || 1) });
      }
      if (!game) {                                          // the creator: still, unless a Hair lab test is moving it
        labT = 0; let ty = 0, turn = 0;
        if (labTest) { const t = clock.elapsedTime - labTest.t0, k = Math.max(0, 1 - t / labTest.len);
          if (t > labTest.len) labTest = null;
          else if (labTest.kind === 'turn') turn = Math.sin(t * 3.2) * 1.1 * k;
          else if (labTest.kind === 'jump') ty = Math.max(0, Math.sin(t * Math.PI / 0.6)) * (t < 2.4 ? 3 : 0);
          else if (labTest.kind === 'run') labT = t; }
        root.rotation.y = rotY + turn; root.position.y = rootBaseY + ty * 0.1; }
      rig.info.walkDir = game ? drive.dir || 0 : 0;
      rig.info.armOut = worn.reduce((m, k) => Math.max(m, garments[k] && garments[k].def.hang ? garments[k].def.hang.flare * 0.12 : 0), 0);
      const mvSq = moveSquat(clock.elapsedTime);
      fullBodyK += (((!game || drive.pose === 'idle') ? 1 : 0) - fullBodyK) * Math.min(1, dt * 8);
      applyPose(rig, game ? drive.pose : (labTest?.kind === 'run' ? 'walk' : pose), game ? (weaponsDrawn && drive.pose === 'idle' ? IDLE_SQUARE : drive.time) /* (weapons out: no weight-shifting idle under the fighting stance) */ : pose === 'walk' ? clock.elapsedTime / 1.1 : pose === 'wave' ? clock.elapsedTime : labT /* (the creator holds still: no idle sway — the hair lab's tests move it on purpose) */, game ? drive.gait : 0, game ? drive.amount ?? 1 : 1, game ? drive.blend ?? 1 : 1, game ? drive.idleT ?? 0 : 0, (game ? drive.squat ?? 0 : 0) + mvSq); if (mvSq > 0.01 && rig.roots[0]) rig.roots[0].position.y -= squatDrop(Math.min(1.2, mvSq)) * ground * 0.98;   /* (a move's squat lowers the hips so the feet stay down) */ if (game && drive.look) lookTwist(rig, drive.look.twist || 0, drive.look.pitch || 0); if (!game && labTest?.kind === 'shake') { const t = clock.elapsedTime - labTest.t0, h = rig.byName.head; if (h) h.rotation.y += Math.sin(t * 9) * 0.45 * Math.max(0, 1 - t / labTest.len); } weaponPose(); if (!(game && (drive.pose === 'sit' || drive.pose === 'climb' || drive.pose === 'swim' || drive.pose === 'slide' || drive.pose === 'hang' || drive.pose === 'roll' || drive.pose === 'wallclimb' || drive.pose === 'climbleap' || drive.pose === 'wallkick' || drive.pose === 'pole' || drive.pose === 'tightrope' || drive.pose === 'perch' || drive.pose === 'wallhug' || drive.pose === 'twirl' || drive.pose === 'ropecrouch' || drive.pose === 'wireslide' || drive.pose === 'wallrun' || drive.pose === 'wallup'))) solveArms(dt); else { armFix.L.identity(); armFix.R.identity(); }   // seated poses rest the hands on the legs on purpose
      // first person: the game hides the head only for its own camera's render (showHead), so the body,
      // hair physics and every other view (mirrors) always work with a full-size head
      bodyAccel(dt);
      const fs = performance.now();
      if (!perf.off.cloth) simulateCloth(Math.min(dt, 1 / 30));
      const fc = performance.now();
      if (!perf.off.hairSim && !perf.off.hair) simulateHair(Math.min(dt, 1 / 30));
      const fh = performance.now();
      if (!perf.off.cloth) stepTailCape(Math.min(dt, 1 / 30), clock.elapsedTime);
      const ft = performance.now();
      perf.clothMs = fc - fs; perf.hairSimMs = fh - fc; perf.tailCapeMs = ft - fh;
    } catch (err) { report(err.message || String(err)); }
    if (game) return;
    // camera: buttons and tabs set the view; the wheel zooms anywhere between
    if (view !== lastView) { zoom = view === 'face' ? 1 : 0; lastView = view; }
    zoomCur += (zoom - zoomCur) * (1 - Math.exp(-dt * 8));
    const narrow = creator || innerWidth <= 720, H = Number.isFinite(headY) ? headY : 1.6;
    fullP.set(narrow ? 0 : 0.45, H * 0.56, H * 2.35); fullL.set(narrow ? 0 : 0.45, H * 0.5, 0);   // (the whole figure in frame, head to feet, centred)
    faceP.set(narrow ? 0 : 0.07, H - 0.11, 0.7); faceL.set(narrow ? 0 : 0.07, H - 0.12, 0);
    const z = Math.max(0, Math.min(1, zoomCur)), e = z * z * (3 - 2 * z);
    const tp = fullP.clone().lerp(faceP, e), tl = fullL.clone().lerp(faceL, z);
    if (zoomCur < 0) tp.sub(tl).multiplyScalar(1 - zoomCur * 1.2).add(tl);            // further out than full body
    if (zoomCur > 1) tp.sub(tl).multiplyScalar(1 - (zoomCur - 1) * 1.6).add(tl);      // closer than the face view
    const k = 1 - Math.exp(-dt * 6); camPos.lerp(tp, k); camLook.lerp(tl, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    const fr = performance.now();
    try { renderer.render(scene, camera); } catch (err) { report(err.message || String(err)); }
    perf.renderMs = performance.now() - fr;
    perf.frameMs = perf.frameMs * 0.9 + dt * 1000 * 0.1; perf.fps = 1000 / Math.max(1, perf.frameMs);
  })();
  window.eldermereBody = bodyState; window.eldermerePerf = perf;                        // for testing events from the console
  bodyState.on('change', () => scheduleBodyUpdate());
  // creator: race comes from the creation steps; keep only the look controls in the species panel
  if (creator) {
    raceRow.hidden = true; subWrap.hidden = true; partsNote.hidden = true;
    for (const x of rows) if (['race strength', 'mouth open', 'feather spread'].includes(x.label)) x.row.hidden = true;
  }
  let sexAnim = 0;
  const api = {
    params, update, scene, root, rig, body: bodyState, gear,
    // creation race ids; lineage by index (creation and viewer lists share their order)
    setRace(raceId, subIndex = 0) {
      const ri = RACES.findIndex(r => r.id === raceId); if (ri < 0) return;
      race.index = ri; race.sub = Math.min(subIndex, RACES[ri].subraces.length - 1); race.strength = 1;
      try { buildSubs(); applyRacePreset(); } catch (err) { report(err.message || String(err)); }
    },
    // 0 masculine .. 1 feminine, eased over a moment
    setBodySex(target) {
      const from = params.fem, t0 = performance.now(), id = ++sexAnim;
      const step = () => {
        if (id !== sexAnim) return;
        const t = Math.min(1, (performance.now() - t0) / 700), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        params.fem = from + (target - from) * e; api.syncSliders(); update();
        if (t < 1) requestAnimationFrame(step);
      };
      step();
    },
    // what stats read: the sliders, overall body sex (-1 masc .. 1 fem) and species shares
    // the starting gender's body and age, used by Reset
    setDefaults(o) { Object.assign(paramDefaults, o); },
    syncSliders() { for (const [k, r] of Object.entries(sliders)) r.value = params[k]; },
    morph: () => ({ params: { ...params }, details: { ...details }, bodySex: bodyState.bodySex(), totals: bodyState.totals(), raceId: RACES[race.index].id }),
    onChange(fn) { changeListeners.push(fn); },
    equip(ids) { return gear.setAll(ids); },
    setView(v) { view = v; zoom = v === 'face' ? 1 : 0; lastView = v; },
    // the look, for the save file
    save() {
      return {
        version: 1, params: { ...params }, details: { ...details }, body: bodyState.toJSON(),
        race: { index: race.index, sub: race.sub, id: RACES[race.index].id, styles: { ...race.styles }, partSize: race.partSize, coverFace: race.coverFace, coverBody: race.coverBody,
          coverSize: race.coverSize, coverA: race.coverA, coverB: race.coverB, pupil: race.pupil, eyeColor: race.eyeColor, furPattern: race.furPattern, furDark: race.furDark,
          noseColor: race.noseColor, luster: race.luster, furLength: race.furLength },
        skin: '#' + skinMat.color.clone().convertLinearToSRGB().getHexString(), skinGlow,
        hair: { on: hairOn, sel: { ...hairSel }, len: { ...hairLen }, look: { ...hairLook }, phys: { ...hairPhys }, color: hairColor, tip: hairTip, blend: hairBlend, brow: { ...brow }, browColor },
        gear: gear.equipped(),
      };
    },
    dispose() { running = false; if (renderer) { renderer.dispose(); renderer.forceContextLoss(); } },
    // set one body slider (0..1) and rebuild
    setParam(k, v) { if (k === 'fem') return; params[k] = Math.max(0, Math.min(1, v)); api.syncSliders(); update(); },
    // show or hide the head right now. A first-person game hides it just for its own camera's render,
    // then shows it again, so hair physics, shadows from other views and mirrors see a normal head.
    get perf() { return perf; },
    // the hair: detail by distance (metres from the camera to the head), the wind on it (world units per second)
    // everyday moves (src/rpg/moves.js): act('drink', { onEvent(name), onEnd() }) — false if busy
    // testing: hold an attack at a point (u 0..1) — scrubAttack('swFendente', 0.45); scrubAttack(null) lets go. setTurn: the creator's turntable angle
    scrubAttack(variant, u) { if (!variant) { combat.scrub = null; combat.action = null; return; } if (!weaponsDrawn) { weaponsDrawn = true; placeWeapons(); } if (!combat.action || combat.action.variant !== variant) { combat.action = null; startAction('attack', { variant }); } combat.scrub = u; },
    setTurn(a) { rotY = a; },
    act(name, opts = {}) { return startAction('move', { move: name, ...opts }); }, stopAct() { if (combat.action?.type === 'move') { combat.action = null; hideProps(); } },
    get moves() { return Object.entries(MOVES).map(([id, m]) => ({ id, name: m.name, dur: m.dur })); },
    hairLOD(d) { hairR.lod(d); }, setHairSimulationEnabled(on) { hairSimulationEnabled = !!on; }, bodyLOD(d) { lods.set(d); }, get bodyLevel() { return lods.level; }, hairDebug: () => ({ info: hairR.info, lod: hairR.lodLevel, vis: groomMesh.visible, sim: hairR.sim?.dbg?.(), parent: groomMesh.parent?.type, draw: groomMesh.geometry.drawRange }), setWind(x, y, z) { hairWind = [x, y, z]; }, get hairInfo() { return hairR.info; },   // (timings: clothMs, hairSimMs — the game's performance panel shows them)
    showHead(on) {
      const h = rig.byName.head; if (!h) return;
      h.scale.setScalar(on ? 1 : 0.001); h.updateMatrixWorld(true);
      groomMesh.visible = on && hairOn && gearRules.hair !== 'hide'; scalpPiece.mesh.visible = groomMesh.visible;
    },
    // game mode: the pose ('idle', 'walk', ...), its clock (advance it with stride for walking), and
    // whether the head is hidden for a first-person camera
    drive(o) { Object.assign(drive, o); },
    // a body that's got itself in a twist: drop whatever action it's in, every bone back to rest, the hair, tail and cape
    // started again from where the body is now
    resetPose() { combat.action = null; combat.block = 0; combat.blocking = false; combat.scrub = null; rig.resetPose(); tail.reset(); cape.reset(); hairR.reset?.(); settleTimer = 0; },
    // game combat: draw/sheathe, attacks (variant 'light' | 'light2' | 'heavy'; hold: wait at the wind-up
    // until release()), block, and the current action's progress for hit timing
    combat: {
      draw: () => startAction('draw'), sheathe: () => startAction('sheathe'),
      attack: (opts = {}) => startAction('attack', opts),
      release() { const a = combat.action; if (a && a.hold) { a.hold = false; } },
      // casting a spell: hands gather (held) until throwCast(), then the throw; cancelCast() lets it go
      cast: (o = {}) => startAction('cast', { hold: true, hand: o.hand || null }),
      throwCast() { const a = combat.action; if (a && a.type === 'cast') a.hold = false; },
      cancelCast() { if (combat.action && combat.action.type === 'cast') combat.action = null; },
      get castHand() { return weaponsDrawn && !!holds().main ? 'L' : 'R'; },
      // where a hand is in the world (the middle of the palm, roughly), for a spell's glow
      handPos(side = 'R', out = new THREE.Vector3()) { const b = rig.byName[`wrist.${side}`]; if (!b) return out; b.getWorldPosition(out); return out; },
      block(on) { combat.blocking = !!on; },
      get drawn() { return weaponsDrawn; }, get busy() { return !!combat.action; }, get hold() { return holds().main; },
      get action() { const a = combat.action; return a ? { type: a.type, variant: a.variant, u: a.u ?? 0, hit: a.hit, dur: a.dur, hold: a.hold } : null; },
      get blockK() { return combat.block; },
      scrub(u) { combat.scrub = u; },                 // testing: hold the current attack at u (0..1), or null
      // the main-hand weapon's striking part in the world: from just past the hand (the forte) to the tip (for the
      // swing trail); false when nothing's drawn in the right hand
      blade(base, tip) {
        const e = Object.entries(weaponModels).find(([, mm]) => mm.visible && mm.parent === rig.byName['wrist.R']); if (!e) return false;
        const [id, m] = e; if (WEAPONS[id].hold === 'shield' || WEAPONS[id].hold === 'bow') return false;
        if (m.userData.tipY == null) { const bb = new THREE.Box3(); m.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrix)); } }); m.userData.tipY = bb.max.y; m.userData.baseY = Math.max(0.6, bb.max.y * 0.3); }
        base.set(0, m.userData.baseY, 0).applyMatrix4(m.matrixWorld); tip.set(0, m.userData.tipY, 0).applyMatrix4(m.matrixWorld); return true;
      },
    },
    // standing height to the crown (including horns or ears), in meters
    crownHeight: () => (Number.isFinite(headY) ? headY : 1.75),
    // eye height above the soles, in meters: the head bone sits at the base of the skull, the eyes ~9 cm up
    eyeHeight() {
      const h = rig.byName.head; if (!h) return 1.65;
      const p = new THREE.Vector3(); h.getWorldPosition(p); root.worldToLocal(p);
      return (p.y + ground) * 0.1 + 0.09;
    },
    // how far up the model must sit so its soles touch the floor, in meters
    groundOffset: () => ground * 0.1,
    // restore a saved look (the object save() returns)
    load(a) {
      if (!a) return;
      try {
        if (a.race) {
          race.index = a.race.index ?? race.index; race.sub = a.race.sub ?? 0; race.strength = 1;
          buildSubs();
          for (const k of ['partSize', 'coverFace', 'coverBody', 'coverSize', 'coverA', 'coverB', 'pupil', 'eyeColor', 'furPattern', 'furDark', 'noseColor', 'luster', 'furLength'])
            if (a.race[k] !== undefined) race[k] = a.race[k];
          if (a.race.styles) Object.assign(race.styles, a.race.styles);
        }
        if (a.body) bodyState.load(a.body);
        if (a.params) Object.assign(params, a.params);
        if (a.details) { for (const k of Object.keys(details)) delete details[k]; Object.assign(details, a.details); }
        if (a.skin) skinMat.color.copy(lin(a.skin));
        if (a.skinGlow != null) { skinGlow = a.skinGlow; skinDetail.setTranslucency(skinGlow); }
        if (a.hair) {
          hairOn = a.hair.on ?? hairOn;
          const savedSel = a.hair.sel || {};
          if (savedSel.main != null || savedSel.bangs != null) Object.assign(hairSel, savedSel);
          else { hairSel.main = savedSel.back === 3 ? 0 : 1; hairSel.bangs = savedSel.bangs ?? 0; }
          const savedLen = a.hair.len || {};
          if (savedLen.main != null || savedLen.bangs != null) Object.assign(hairLen, savedLen);
          else { hairLen.main = savedLen.back ?? savedLen.top ?? 0; hairLen.bangs = savedLen.bangs ?? 0; }
          Object.assign(hairLook, a.hair.look || {}); Object.assign(hairPhys, a.hair.phys || {}); if (hairR.sim) Object.assign(hairR.sim.params, hairPhys);
          hairBlend = a.hair.blend ?? hairBlend;
          setHairColor(a.hair.color ?? hairColor, a.hair.tip ?? a.hair.color ?? hairTip);
          if (a.hair.brow) Object.assign(brow, a.hair.brow); browColor = a.hair.browColor ?? browColor;
        }
        if (a.gear) gear.setAll([...new Set(Object.values(a.gear))]);
        api.syncSliders(); refreshLooks(); update(true);
      } catch (err) { report('could not restore the saved look: ' + (err.message || err)); }
    },
  };
  (window.__viewers ||= []).push(api);   // (for testing from the console)
  return api;
}

function irisTexture(THREE, hex, pupil = 'round') {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#f4f0ee'; g.fillRect(0, 0, 512, 256);
  const cx = 128, cy = 128, r = pupil === 'wide' ? 58 : 38, c = new THREE.Color(hex);
  const dark = '#' + c.clone().multiplyScalar(0.35).getHexString(), light = '#' + c.clone().lerp(new THREE.Color(1, 1, 1), 0.35).getHexString();
  const ig = g.createRadialGradient(cx, cy, 6, cx, cy, r);
  ig.addColorStop(0, light); ig.addColorStop(0.55, hex); ig.addColorStop(0.92, dark); ig.addColorStop(1, 'rgba(20,15,15,0.9)');
  g.fillStyle = ig; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0c0a0c'; g.beginPath();
  // pupil shapes: round, a vertical slit (cats, reptiles), horizontal (goats, boars), or wide (birds, fish)
  if (pupil === 'slit') g.ellipse(cx, cy, 4, 30, 0, 0, Math.PI * 2);
  else if (pupil === 'horizontal') g.ellipse(cx, cy, 24, 7, 0, 0, Math.PI * 2);
  else if (pupil === 'wide') g.arc(cx, cy, 20, 0, Math.PI * 2);
  else g.arc(cx, cy, 12, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
}
