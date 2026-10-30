// src/rpg/hairGroom.js — player strand groom renderer.
// Authored guide curves drive multiple fine, individually shaded strand ribbons. The CPU simulates
// guides only; the GPU applies their motion to every strand. This replaces the old broad, textured
// card renderer while retaining the existing hairstyle authoring data during the transition.
import { makeGuideSim } from './hairPhysics.js';

const SEG = 14;
const VERT_PARS = `attribute vec2 hairRef; attribute vec3 hairT; attribute vec3 hairSide;
  uniform sampler2D uHairOff; uniform vec2 uHairOffSize; uniform float uHairWiden;
  varying vec3 vHairT; varying float vHairN; varying float vHairAlong;
  vec3 hairOffAt(float s) { return texture2D(uHairOff, (vec2(s, hairRef.x) + 0.5) / uHairOffSize).xyz; }`;
const VERT_BEGIN = `#include <begin_vertex>
  { float hs = hairRef.y; vec3 o0 = hairOffAt(hs), o1 = hairOffAt(min(hs + 1.0, ${SEG}.0));
    transformed += o0 + hairSide * (uHairWiden - 1.0); vHairAlong = 1.0 - hs / ${SEG}.0;
    hairTan = hairT + (hs < ${SEG}.0 ? o1 - o0 : vec3(0.0)); }`;

export function createHairGroom(THREE, { headBone, skeleton, bindMatrix = null }) {
  const U = {
    uHairOff: { value: null },
    uHairOffSize: { value: new THREE.Vector2(SEG + 1, 1) },
    uHairWiden: { value: 1 },
    uHairRoot: { value: new THREE.Color(1, 1, 1) },
    uHairTip: { value: new THREE.Color(1, 1, 1) },
    uHairBlend: { value: 0.55 },
  };
  const patchVertex = (shader, withLighting = true) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS + '\nvec3 hairTan = vec3(0.0, -1.0, 0.0);')
      .replace('#include <begin_vertex>', VERT_BEGIN);
    if (withLighting) shader.vertexShader = shader.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
      #ifdef USE_SKINNING
        vHairT = normalize((modelViewMatrix * (skinMatrix * vec4(hairTan, 0.0))).xyz);
      #else
        vHairT = normalize((modelViewMatrix * vec4(hairTan, 0.0)).xyz);
      #endif
      vHairN = fract(sin(dot(hairRef, vec2(12.9898, 78.233)) + hairT.x * 91.7) * 43758.5);`);
  };

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.43, metalness: 0,
    skinning: true,
  });
  material.onBeforeCompile = shader => {
    patchVertex(shader);
    const spec = '\n reflectedLight.directSpecular += groomSpec(directLight.direction, directLight.color, geometry.normal, geometry.viewDir);';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uHairRoot; uniform vec3 uHairTip; uniform float uHairBlend;
        varying vec3 vHairT; varying float vHairN; varying float vHairAlong; vec3 groomBase = vec3(1.0);
        vec3 groomSpec(vec3 L, vec3 col, vec3 N, vec3 V) {
          vec3 T = normalize(vHairT), H = normalize(L + V);
          float shift = (vHairN - 0.5) * 0.2;
          vec3 T1 = normalize(T + N * (-0.05 + shift));
          vec3 T2 = normalize(T + N * (0.13 + shift));
          float d1 = dot(T1, H), d2 = dot(T2, H);
          float align = smoothstep(-1.0, 0.0, dot(T, H));
          float sharp = pow(max(0.0, 1.0 - d1 * d1), 72.0);
          float broad = pow(max(0.0, 1.0 - d2 * d2), 12.0);
          float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
          return col * align * wrap * (sharp * 0.34 + broad * 0.2 * groomBase);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        groomBase = mix(uHairRoot, uHairTip, smoothstep(uHairBlend - 0.22, uHairBlend + 0.22, vHairAlong));
        diffuseColor.rgb *= groomBase;`)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin
        .split('RE_Direct( directLight, geometry, material, reflectedLight );')
        .join('RE_Direct( directLight, geometry, material, reflectedLight );' + spec));
  };
  material.customProgramCacheKey = () => 'playerHairGroom1';

  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, skinning: true, side: THREE.DoubleSide,
  });
  depthMaterial.onBeforeCompile = shader => patchVertex(shader, false);
  depthMaterial.customProgramCacheKey = () => 'playerHairGroom1Depth';

  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = depthMaterial;
  mesh.userData.playerHairGroom = true;

  let sim = null, offTexture = null, offData = null, guideCount = 0, info = null;
  let lodNow = -1, lodForce = null;
  const drawCounts = [0, 0, 0];

  function build(guides, head, look = {}) {
    guideCount = guides.length;
    const strandLayers = [[], [], []];
    const density = Math.max(0, Math.min(1, look.density ?? 1));
    let seed = 31;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const volume = look.volume ?? 1;

    // Layer ordering lets distance LOD omit complete strands without rebuilding the groom.
    for (let layer = 0; layer < 3; layer++) {
      for (let gi = 0; gi < guideCount; gi++) {
        const guide = guides[gi];
        if (!guide || !guide.points || guide.points.length !== SEG + 1) continue;
        const baseCount = layer === 0 ? 1 : layer === 1 ? 6 : (random() < 0.3 ? 8 : random() < 0.35 ? 4 : 0);
        const scaled = baseCount * density;
        const count = Math.floor(scaled) + (random() < scaled - Math.floor(scaled) ? 1 : 0);
        const total = Math.max(1, Math.round(10.8 * density));
        for (let j = 0; j < count; j++) {
          const strandIndex = (layer === 0 ? 0 : layer === 1 ? 1 + j : 7 + j);
          strandLayers[layer].push({ gi, strandIndex, strandTotal: total, width: guide.width || 0.08, tone: guide.tone || 1, center: guide.center || head.C, seed: random() });
        }
      }
    }

    const all = [...strandLayers[0], ...strandLayers[1], ...strandLayers[2]];
    const vertexCount = all.length * (SEG + 1) * 2;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const colors = new Float32Array(vertexCount * 3);
    const refs = new Float32Array(vertexCount * 2);
    const tangents = new Float32Array(vertexCount * 3);
    const sides = new Float32Array(vertexCount * 3);
    const indices = [];
    let vertex = 0;
    const C = head.C, Rad = head.Rad;

    const outwardAt = (p, center) => {
      const q = [(p[0] - center[0]) / Rad[0], (p[1] - center[1]) / Rad[1] * 0.8, (p[2] - center[2]) / Rad[2]];
      const length = Math.hypot(...q) || 1;
      return q.map(v => v / length);
    };

    const layerIndexEnds = [];
    for (let layer = 0; layer < 3; layer++) {
      for (const strand of strandLayers[layer]) {
        const guide = guides[strand.gi], pts = guide.points;
        const strandBase = vertex;
        const phase = strand.seed * Math.PI * 2;
        const angle = (strand.strandIndex / Math.max(1, strand.strandTotal)) * Math.PI * 2 + phase * 0.12;
        const strandWidth = Math.max(0.0008, strand.width * 0.06 * volume) * (0.78 + strand.seed * 0.42);
        const radialOffset = strand.width * 0.22 * volume;
        for (let s = 0; s <= SEG; s++) {
          const p = pts[s], prev = pts[Math.max(0, s - 1)], next = pts[Math.min(SEG, s + 1)];
          let tangent = [next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]];
          const tl = Math.hypot(...tangent) || 1;
          tangent = tangent.map(v => v / tl);
          const outward = outwardAt(p, strand.center || C);
          let side = [
            tangent[1] * outward[2] - tangent[2] * outward[1],
            tangent[2] * outward[0] - tangent[0] * outward[2],
            tangent[0] * outward[1] - tangent[1] * outward[0],
          ];
          const sl = Math.hypot(...side) || 1;
          side = side.map(v => v / sl);
          const radial = [
            outward[0] * Math.cos(angle) + side[0] * Math.sin(angle),
            outward[1] * Math.cos(angle) + side[1] * Math.sin(angle),
            outward[2] * Math.cos(angle) + side[2] * Math.sin(angle),
          ];
          const center = [
            p[0] + radial[0] * radialOffset,
            p[1] + radial[1] * radialOffset,
            p[2] + radial[2] * radialOffset,
          ];
          // Each strand is its own fine ribbon, not a broad textured card. It tapers almost to a point.
          const f = s / SEG;
          const halfWidth = strandWidth * (1 - 0.94 * Math.pow(f, 1.35)) * 0.5;
          const widthDir = [
            tangent[1] * radial[2] - tangent[2] * radial[1],
            tangent[2] * radial[0] - tangent[0] * radial[2],
            tangent[0] * radial[1] - tangent[1] * radial[0],
          ];
          const wl = Math.hypot(...widthDir) || 1;
          for (let edge = 0; edge < 2; edge++) {
            const sign = edge ? 1 : -1;
            const half = halfWidth * sign;
            const offset = [
              widthDir[0] / wl * half,
              widthDir[1] / wl * half,
              widthDir[2] / wl * half,
            ];
            positions.set([center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]], vertex * 3);
            sides.set(offset, vertex * 3);
            normals.set(radial, vertex * 3);
            tangents.set(tangent, vertex * 3);
            refs[vertex * 2] = strand.gi;
            refs[vertex * 2 + 1] = s;
            uvs[vertex * 2] = edge;
            uvs[vertex * 2 + 1] = 1 - f;
            const shade = strand.tone * (0.88 + 0.12 * strand.seed) * (1 - 0.08 * f);
            colors[vertex * 3] = colors[vertex * 3 + 1] = colors[vertex * 3 + 2] = shade;
            vertex++;
          }
          if (s < SEG) {
            const a = strandBase + s * 2;
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          }
        }
      }
      layerIndexEnds.push(indices.length);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('hairRef', new THREE.BufferAttribute(refs, 2));
    geometry.setAttribute('hairT', new THREE.BufferAttribute(tangents, 3));
    geometry.setAttribute('hairSide', new THREE.BufferAttribute(sides, 3));
    const skinIndex = new Uint16Array(vertexCount * 4), skinWeight = new Float32Array(vertexCount * 4);
    for (let i = 0; i < vertexCount; i++) { skinIndex[i * 4] = headBone; skinWeight[i * 4] = 1; }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    geometry.setIndex(vertexCount > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    mesh.bind(skeleton, bindMatrix ? bindMatrix() : mesh.matrixWorld);

    drawCounts[0] = layerIndexEnds[0];
    drawCounts[1] = layerIndexEnds[1];
    drawCounts[2] = layerIndexEnds[2];

    offData = new Float32Array(Math.max(1, guideCount) * (SEG + 1) * 4);
    if (offTexture) offTexture.dispose();
    offTexture = new THREE.DataTexture(offData, SEG + 1, Math.max(1, guideCount), THREE.RGBAFormat, THREE.FloatType);
    offTexture.needsUpdate = true;
    U.uHairOff.value = offTexture;
    U.uHairOffSize.value.set(SEG + 1, Math.max(1, guideCount));
    sim = makeGuideSim(guides, head);
    lod(0);
    info = {
      guides: guideCount,
      strands: all.length,
      cards: 0,
      triangles: indices.length / 3,
      tris: indices.length / 3,
      layers: strandLayers.map(layer => layer.length),
    };
    return info;
  }

  function lod(distance) {
    const current = lodNow < 0 ? 2 : lodNow;
    const nearExit = current === 2 ? 5.5 : 5;
    const midExit = current >= 1 ? 15 : 13.5;
    const level = lodForce ?? (distance < nearExit ? 2 : distance < midExit ? 1 : 0);
    if (level !== lodNow) {
      lodNow = level;
      mesh.geometry.setDrawRange(0, drawCounts[level]);
      U.uHairWiden.value = level === 0 ? 1.3 : level === 1 ? 1.12 : 1;
    }
  }

  function step(dt, meshWorld, headMatrix, capsules, options = {}) {
    if (!sim || !guideCount) return;
    sim.step(dt, meshWorld, headMatrix, capsules, options);
    sim.write(offData);
    offTexture.needsUpdate = true;
  }

  function colors(rootColor, tipColor, blend) {
    U.uHairRoot.value.copy(rootColor);
    U.uHairTip.value.copy(tipColor);
    if (blend != null) U.uHairBlend.value = blend;
  }

  return {
    mesh, build, step, lod, colors, U,
    set lodForce(value) { lodForce = value; lodNow = -1; lod(0); },
    get info() { return info; },
    get lodLevel() { return lodNow; },
    get sim() { return sim; },
    reset: () => sim?.reset(),
  };
}
