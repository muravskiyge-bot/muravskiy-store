// Кепка и очки на капюшоне: в head.json по кадру жёсткое движение макушки капюшона от кадра 0
// (координаты худи). Группу кладём внутрь меша худи, поэтому она наследует его сдвиг и поворот.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// посадка в кадре 0 худи: кепка под капюшоном (поверх он слишком большой и вытянут вперёд),
// наружу торчит козырёк, наклонённый на 8°; очки под козырьком
export const HEAD_FIT = {
  cap: { scale: 0.00095, top: 1.74, x: 0.045, z: 0.07, tilt: 8 },
  glasses: { scale: 0.0104, bottom: 1.545, x: 0.045, front: 0.165, tilt: 0 },
};

function place(obj, s, { x, z, y, yEdge, zEdge }) {
  obj.scale.setScalar(s);
  const holder = new THREE.Group();
  holder.add(obj);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder), c = box.getCenter(new THREE.Vector3());
  obj.position.set(x - c.x, y - (yEdge === 'max' ? box.max.y : box.min.y), z - (zEdge === 'max' ? box.max.z : c.z));
  return holder;
}

export async function loadHead(base, { cap: capUrl, glasses: glassesUrl }, fit = HEAD_FIT) {
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const [data, capG, glassesG] = await Promise.all([
    fetch(base + '.json').then((r) => r.json()),
    loader.loadAsync(capUrl),
    loader.loadAsync(glassesUrl),
  ]);
  const keys = data.M.map((a) => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), k = new THREE.Vector3();
    new THREE.Matrix4().fromArray(a).decompose(p, q, k);
    return { p, q };
  });

  const pivot = new THREE.Group();
  pivot.matrixAutoUpdate = false;
  const c = fit.cap, g = fit.glasses;
  const cap = place(capG.scene, c.scale, { x: c.x, z: c.z, y: c.top, yEdge: 'max' });
  const glasses = place(glassesG.scene, g.scale, { x: g.x, z: g.front, y: g.bottom, yEdge: 'min', zEdge: 'max' });
  // наклон вокруг центра макушки / переносицы
  for (const [h, t, at] of [[cap, c.tilt, [c.x, c.top - 0.05, c.z]], [glasses, g.tilt, [g.x, g.bottom + 0.02, g.front]]]) {
    if (!t) continue;
    const m = new THREE.Matrix4().makeTranslation(...at)
      .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(t)))
      .multiply(new THREE.Matrix4().makeTranslation(-at[0], -at[1], -at[2]));
    h.applyMatrix4(m);
  }
  // стёкла авиаторов в модели прозрачные (transmission) и на тёмном капюшоне не читаются — делаем тонированные с бликом
  glasses.traverse((o) => {
    if (o.isMesh && /Glass.tinted/.test(o.name + ' ' + (o.parent?.name || '')) || o.material?.name === 'PaletteMaterial002') {
      o.material = new THREE.MeshPhysicalMaterial({
        color: '#2a2622', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.86,
        side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.5,
      });
    }
  });
  pivot.add(cap, glasses);
  pivot.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });

  const nf = data.frames, duration = nf / 30;
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  function update(time) {
    const f = ((time / duration) % 1 + 1) % 1 * nf;
    const a = Math.floor(f) % nf, b = (a + 1) % nf, k = f - Math.floor(f);
    p.lerpVectors(keys[a].p, keys[b].p, k);
    q.slerpQuaternions(keys[a].q, keys[b].q, k);
    pivot.matrix.compose(p, q, one);
  }
  update(0);
  return { group: pivot, cap, glasses, update };
}
