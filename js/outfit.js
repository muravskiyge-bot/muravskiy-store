// Невидимый человек: одежда из разных моделей, приведённая к одному телу (рост ~1.70 м, лицом к +Z, его левая рука — +X).
// Скелета у моделей нет, поэтому привязываем ткань к костям сами: вес вершины зависит от расстояния до капсулы кости.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const BASE = new URL('../assets/models/', import.meta.url);
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
export const loader = new GLTFLoader().setDRACOLoader(draco);

const J = {
  hips: [0, 0.98, 0], spine: [0, 1.1, 0], chest: [0, 1.28, 0], neck: [0, 1.46, 0], head: [0, 1.56, 0], headTop: [0, 1.72, 0],
  lShoulder: [0.17, 1.42, 0], lElbow: [0.2, 1.14, 0], lWrist: [0.22, 0.9, 0],
  rShoulder: [-0.17, 1.42, 0], rElbow: [-0.2, 1.14, 0], rWrist: [-0.22, 0.9, 0],
  lHip: [0.095, 0.94, 0], lKnee: [0.1, 0.52, 0.01], lAnkle: [0.1, 0.09, -0.02], lToe: [0.1, 0.02, 0.13],
  rHip: [-0.095, 0.94, 0], rKnee: [-0.1, 0.52, 0.01], rAnkle: [-0.1, 0.09, -0.02], rToe: [-0.1, 0.02, 0.13],
};
// кость: [родитель, конец сегмента, радиус капсулы, сжатие по X (торс шире, чем глубже)]
const BONES = {
  hips:      [null, 'spine', 0.15, 0.55],
  spine:     ['hips', 'chest', 0.15, 0.55],
  chest:     ['spine', 'neck', 0.16, 0.55],
  neck:      ['chest', 'head', 0.05, 1],
  head:      ['neck', 'headTop', 0.09, 1],
  lShoulder: ['chest', 'lElbow', 0.06, 1],
  lElbow:    ['lShoulder', 'lWrist', 0.05, 1],
  lWrist:    ['lElbow', null, 0.04, 1],
  rShoulder: ['chest', 'rElbow', 0.06, 1],
  rElbow:    ['rShoulder', 'rWrist', 0.05, 1],
  rWrist:    ['rElbow', null, 0.04, 1],
  lHip:      ['hips', 'lKnee', 0.085, 1],
  lKnee:     ['lHip', 'lAnkle', 0.065, 1],
  lAnkle:    ['lKnee', 'lToe', 0.05, 1],
  lToe:      ['lAnkle', null, 0.04, 1],
  rHip:      ['hips', 'rKnee', 0.085, 1],
  rKnee:     ['rHip', 'rAnkle', 0.065, 1],
  rAnkle:    ['rKnee', 'rToe', 0.05, 1],
  rToe:      ['rAnkle', null, 0.04, 1],
};
const NAMES = Object.keys(BONES);

export const SKELETON = {
  joints: J,
  segments: NAMES.filter((n) => BONES[n][1]).map((n) => [n, BONES[n][1]]).concat([['chest', 'lShoulder'], ['chest', 'rShoulder'], ['hips', 'lHip'], ['hips', 'rHip']]),
};

// y: какую грань рамки модели куда поставить; skin: гнётся по скелету; attach: жёстко едет за костью
export const GARMENTS = {
  pants:    { file: 'pants.glb', scale: 0.85, y: ['min', 0.07], skin: true },
  leather:  { file: 'pants-leather.glb', scale: 1.02, y: ['min', 0], skin: true },
  hoodie:   { file: 'hoodie.glb', scale: 0.01, y: ['max', 1.5], skin: true, arms: true },
  jacket:   { file: 'jacket.glb', scale: 1, y: ['max', 1.53], skin: true, arms: true },
  sneakerL: { file: 'sneakers.glb', scale: 0.078, rotY: -Math.PI / 2, y: ['min', 0], at: [0.1, null, 0.02], attach: 'lAnkle' },
  sneakerR: { file: 'sneakers.glb', scale: 0.078, rotY: -Math.PI / 2, mirror: true, y: ['min', 0], at: [-0.1, null, 0.02], attach: 'rAnkle' },
  cap:      { file: 'cap.glb', scale: 0.00105, y: ['max', 1.76], at: [0, null, 0.02], attach: 'head' },
  aviator:  { file: 'glasses-aviator.glb', scale: 0.0104, y: ['min', 1.56], at: [0, null, 0.115], zFront: true, attach: 'head' },
  watch:    { file: 'watch.glb', scale: 1, y: ['min', 0] },   // витрина; в примерочной часы на кисти — js/hands.js
  neon:     { file: 'glasses-neon.glb', scale: 0.00029, y: ['min', 1.555], at: [0, null, 0.115], zFront: true, attach: 'head' },
};

export const WORLD_OUTFITS = {
  treadmill: ['pants', 'sneakerL', 'sneakerR', 'hoodie', 'jacket', 'cap', 'aviator'],
  street:    ['pants', 'sneakerL', 'sneakerR', 'hoodie', 'jacket', 'cap', 'aviator'],
  stone:     ['pants', 'sneakerL', 'sneakerR', 'hoodie', 'jacket', 'cap', 'aviator'],
  cyber:     ['leather', 'hoodie', 'jacket', 'cap', 'neon'],
  space:     ['pants', 'sneakerL', 'sneakerR', 'hoodie', 'jacket', 'cap', 'aviator'],
};

const cache = new Map();
function loadFile(file) {
  if (!cache.has(file)) cache.set(file, loader.loadAsync(new URL(file, BASE).href));
  return cache.get(file);
}

// модель, поставленная на тело; трансформы ещё не запечены
async function placeGarment(name) {
  const g = GARMENTS[name];
  const gltf = await loadFile(g.file);
  const obj = gltf.scene.clone(true);
  const holder = new THREE.Group();
  holder.name = name;
  obj.scale.setScalar(g.scale);
  if (g.mirror) obj.scale.x *= -1;
  if (g.rotY) obj.rotation.y = g.rotY;
  holder.add(obj);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  const at = g.at || [0, null, 0];
  obj.position.x += (at[0] ?? 0) - c.x;
  obj.position.z += (at[2] ?? 0) - (g.zFront ? box.max.z : c.z);
  obj.position.y += g.y[1] - (g.y[0] === 'min' ? box.min.y : box.max.y);
  holder.updateMatrixWorld(true);
  // запекаем всё в координаты тела: дальше и скелет, и принт работают в метрах тела
  const meshes = [];
  obj.traverse((m) => { if (m.isMesh) meshes.push(m); });
  holder.remove(obj);
  for (const m of meshes) {
    const geom = m.geometry.clone().applyMatrix4(m.matrixWorld);
    if (m.matrixWorld.determinant() < 0) flipWinding(geom);
    const mesh = new THREE.Mesh(geom, dressMaterial(name, m.material.clone()));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    holder.add(mesh);
  }
  return holder;
}

function flipWinding(geom) {
  const ix = geom.index;
  if (!ix) return;
  for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i); ix.setX(i, ix.getX(i + 2)); ix.setX(i + 2, t); }
}

// ---------- Материалы: белая куртка, тёмное худи с принтом ----------
let printTexture = null;
export function setPrint(texture) { printTexture = texture; }

function dressMaterial(name, mat) {
  mat.side = THREE.DoubleSide;
  if (name === 'jacket') {
    mat.color.set(0xf1f0ec);
    mat.roughness = 0.42;
    mat.metalness = 0;
    if ('sheen' in mat) mat.sheen = 0;
  }
  if (name === 'watch') {
    // в модели все материалы BLEND + светятся сами (emissive) — рябь сортировки и засвет под цветными лампами.
    // Прозрачным остаётся только стекло (материал 1001: стекло циферблата и крышки), без записи глубины
    const glass = mat.name === '1001';
    mat.transparent = glass; mat.depthWrite = !glass; mat.side = glass ? THREE.DoubleSide : THREE.FrontSide;
    mat.emissive?.set(0); mat.emissiveMap = null;
  }
  if (name === 'hoodie') {
    mat.roughness = 0.88;
    mat.metalness = 0;
    mat.roughnessMap = null; // в исходнике ткань блестела, как кожа
    mat.metalnessMap = null;
    mat.userData.tint = { value: new THREE.Color(0x1f2128) };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTint = mat.userData.tint;
      sh.uniforms.uPrint = { value: printTexture || (printTexture = makePrintTexture()) };
      sh.uniforms.uPrintBox = { value: new THREE.Vector4(-0.11, 1.1, 0.11, 1.32) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRest;\nuniform vec3 uTint;\nuniform sampler2D uPrint;\nuniform vec4 uPrintBox;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = uTint * (0.45 + 1.1 * lum);
          vec4 printCol = vec4(0.0);
          vec2 puv = (vRest.xy - uPrintBox.xy) / (uPrintBox.zw - uPrintBox.xy);
          if (vRest.z > 0.03 && puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) {
            if (lum < 0.22) diffuseColor.rgb = uTint * (0.45 + 1.1 * 0.36); // прячем чужой логотип, складки остаются
            printCol = texture2D(uPrint, puv);
            diffuseColor.rgb = mix(diffuseColor.rgb, printCol.rgb, printCol.a);
          }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += printCol.rgb * printCol.a * 0.35;');
    };
    mat.emissiveMap = null;
    mat.emissive.set(0x000000);
  }
  return mat;
}

// пиксельный принт: огранённый камень (привет «Осколку») и монограмма
export function makePrintTexture() {
  const art = [
    '................',
    '....########....',
    '...#cc#cc#cc#...',
    '..#cccc##cccc#..',
    '.##############.',
    '..#pp#pppp#pp#..',
    '...#pp#pp#pp#...',
    '....#pp##pp#....',
    '.....#pppp#.....',
    '......#pp#......',
    '.......##.......',
    '..###...#...#...',
    '.#......##.##...',
    '.#.##...#.#.#...',
    '.#..#...#...#...',
    '..##....#...#...',
  ];
  const px = 16, size = art.length * px;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const colors = { '#': '#e9e6ff', c: '#4ff3e6', p: '#ff4fd8' };
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!colors[ch]) return;
    ctx.fillStyle = colors[ch];
    ctx.fillRect(x * px, y * px, px, px);
  }));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

export async function loadGarment(name) { return placeGarment(name); }

// куда смотрят рукава именно этой модели: главная ось вершин рукава
function sleeveJoints(positions, side) {
  const sh = new THREE.Vector3(...J[side + 'Shoulder']);
  const pts = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    v.fromArray(positions, i);
    const x = side === 'l' ? v.x : -v.x;
    if (x > 0.24 && v.y > 0.8) pts.push(v.clone());
  }
  if (pts.length < 50) return null;
  const mean = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const dir = mean.clone().sub(sh).normalize();
  let tMax = 0;
  for (const p of pts) tMax = Math.max(tMax, p.clone().sub(sh).dot(dir));
  tMax = Math.min(tMax, 0.62);
  return {
    [side + 'Elbow']: sh.clone().addScaledVector(dir, tMax * 0.5).toArray(),
    [side + 'Wrist']: sh.clone().addScaledVector(dir, tMax * 0.95).toArray(),
  };
}

function makeSkeleton(joints) {
  const bones = {};
  for (const n of NAMES) {
    const b = new THREE.Bone();
    b.name = n;
    bones[n] = b;
  }
  for (const n of NAMES) {
    const parent = BONES[n][0];
    const p = new THREE.Vector3(...joints[n]);
    if (parent) {
      p.sub(new THREE.Vector3(...joints[parent]));
      bones[parent].add(bones[n]);
    }
    bones[n].position.copy(p);
  }
  return bones;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
function capsuleDist(p, a, b, r, sx) {
  _p.set(p.x * sx, p.y, p.z); _a.set(a.x * sx, a.y, a.z); _b.set(b.x * sx, b.y, b.z);
  _ab.subVectors(_b, _a);
  const t = THREE.MathUtils.clamp(_ap.subVectors(_p, _a).dot(_ab) / Math.max(_ab.lengthSq(), 1e-8), 0, 1);
  return Math.max(0, _p.distanceTo(_a.addScaledVector(_ab, t)) - r);
}

function skinGeometry(geom, joints) {
  const pos = geom.attributes.position;
  const n = pos.count;
  const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
  const segs = NAMES.map((name, i) => {
    const [, end, r, sx] = BONES[name];
    const a = new THREE.Vector3(...joints[name]);
    const b = end ? new THREE.Vector3(...joints[end]) : a.clone();
    const side = name[0] === 'l' ? 1 : name[0] === 'r' ? -1 : 0;
    return { i, a, b, r, sx, side };
  });
  const v = new THREE.Vector3();
  const cand = new Array(segs.length);
  for (let k = 0; k < n; k++) {
    v.fromBufferAttribute(pos, k);
    for (let s = 0; s < segs.length; s++) {
      const sg = segs[s];
      let w = 1 / Math.pow(capsuleDist(v, sg.a, sg.b, sg.r, sg.sx) + 0.012, 4);
      // левая штанина не должна ехать за правой ногой
      if (sg.side && v.x * sg.side < -0.03) w *= 0.001;
      cand[s] = [sg.i, w];
    }
    cand.sort((x, y) => y[1] - x[1]);
    let sum = 0;
    for (let j = 0; j < 4; j++) sum += cand[j][1];
    for (let j = 0; j < 4; j++) { idx[k * 4 + j] = cand[j][0]; wts[k * 4 + j] = cand[j][1] / sum; }
  }
  geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
}

// одежда → SkinnedMesh со своим скелетом (у куртки и худи рукава смотрят по-разному)
function rigGarment(holder, g) {
  const meshes = [];
  holder.traverse((m) => { if (m.isMesh) meshes.push(m); });
  const geoms = meshes.map((m) => m.geometry);
  const joints = { ...J };
  const rest = {};
  if (g.arms) {
    const all = geoms.flatMap((gm) => Array.from(gm.attributes.position.array));
    for (const side of ['l', 'r']) Object.assign(joints, sleeveJoints(all, side));
  }
  for (const side of ['l', 'r']) {
    rest[side] = new THREE.Vector3(...joints[side + 'Elbow']).sub(new THREE.Vector3(...joints[side + 'Shoulder'])).normalize();
  }
  const bones = makeSkeleton(joints);
  const skeleton = new THREE.Skeleton(NAMES.map((nm) => bones[nm]));
  const out = new THREE.Group();
  out.name = holder.name;
  out.add(bones.hips);
  out.updateMatrixWorld(true);
  meshes.forEach((m, i) => {
    skinGeometry(geoms[i], joints);
    const sm = new THREE.SkinnedMesh(geoms[i], m.material);
    sm.frustumCulled = false;
    sm.castShadow = true;
    out.add(sm);
    sm.bind(skeleton);
  });
  return { group: out, bones, rest };
}

// ---------- Походка ----------
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), e = new THREE.Euler();
const DOWN = { l: new THREE.Vector3(Math.sin(0.2), -Math.cos(0.2), 0.04).normalize(), r: new THREE.Vector3(-Math.sin(0.2), -Math.cos(0.2), 0.04).normalize() };

export function poseRig(rig, phase, style = {}) {
  const { stride = 1, bounce = 1, swagger = 1 } = style;
  const b = rig.bones;
  const s = Math.sin(phase), c = Math.cos(phase);
  const thighL = -0.42 * stride * s, thighR = 0.42 * stride * s;
  const kneeL = 0.06 + 0.95 * stride * Math.max(0, c) ** 2;
  const kneeR = 0.06 + 0.95 * stride * Math.max(0, -c) ** 2;
  b.hips.position.y = J.hips[1] + 0.014 * bounce * Math.cos(2 * phase) - 0.006;
  b.hips.rotation.set(0.03, 0.09 * swagger * s, 0.025 * swagger * c);
  b.spine.rotation.set(0.02, -0.05 * swagger * s, -0.012 * swagger * c);
  b.chest.rotation.set(0.02, -0.07 * swagger * s, -0.012 * swagger * c);
  b.neck.rotation.set(-0.03, 0.06 * swagger * s, 0);
  b.head.rotation.set(-0.02, 0.03 * swagger * s, 0);
  b.lHip.rotation.set(thighL, 0, 0);
  b.rHip.rotation.set(thighR, 0, 0);
  b.lKnee.rotation.set(kneeL, 0, 0);
  b.rKnee.rotation.set(kneeR, 0, 0);
  b.lAnkle.rotation.set(-(thighL + kneeL) * 0.55 + 0.12 * Math.max(0, -s), 0, 0);
  b.rAnkle.rotation.set(-(thighR + kneeR) * 0.55 + 0.12 * Math.max(0, s), 0, 0);
  for (const side of ['l', 'r']) {
    const swing = (side === 'l' ? 1 : -1) * 0.34 * stride * s; // рука идёт навстречу ноге
    qa.setFromUnitVectors(rig.rest[side], DOWN[side]);
    qb.setFromEuler(e.set(-swing, 0, 0));
    b[side + 'Shoulder'].quaternion.copy(qb).multiply(qa);
    const bend = 0.25 + 0.2 * Math.max(0, side === 'l' ? -s : s);
    qb.setFromEuler(e.set(-bend, 0, 0));
    b[side + 'Elbow'].quaternion.copy(qa).invert().multiply(qb).multiply(qa);
  }
}

export async function loadOutfit({ only, world = 'treadmill' } = {}) {
  const names = only || WORLD_OUTFITS[world];
  const root = new THREE.Group();
  const master = makeSkeleton(J);
  const masterRig = { bones: master, rest: { l: new THREE.Vector3(0.03, -0.28, 0).normalize(), r: new THREE.Vector3(-0.03, -0.28, 0).normalize() } };
  root.add(master.hips);
  root.updateMatrixWorld(true);
  const rigs = [masterRig];
  const parts = {};
  const holders = await Promise.all(names.map(placeGarment));
  holders.forEach((h, i) => {
    const g = GARMENTS[names[i]];
    if (g.skin) {
      const rig = rigGarment(h, g);
      rigs.push(rig);
      root.add(rig.group);
      parts[names[i]] = rig.group;
    } else {
      // обёртка в пространстве кости: её можно двигать, не теряя посадки вещи
      const wrap = new THREE.Group();
      wrap.name = names[i];
      (g.attach ? master[g.attach] : root).add(wrap);
      wrap.updateMatrixWorld(true);
      wrap.attach(h);
      parts[names[i]] = wrap;
    }
  });
  return {
    root, parts, bones: master,
    pose(phase, style) { for (const r of rigs) poseRig(r, phase, style); },
  };
}
