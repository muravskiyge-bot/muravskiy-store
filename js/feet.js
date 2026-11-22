// Кеды на запечённых стопах: в feet.json по кадру матрица смещения каждой стопы от позы покоя
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const SHOE_SCALE = 0.078;   // как в v1
// центр кеда в позе покоя и разворот носка наружу. z и разворот — по стопе манекена (body-debug),
// x — по центру низа штанины: штанины сидят ближе к оси тела, чем ноги манекена (L на 5 см, R на 2.3 см)
const FOOT = { L: { x: 0.130, z: 0.045, yaw: 11.1 }, R: { x: -0.160, z: 0.066, yaw: -9.3 } }; // z +4.5 см к носку по отзыву

export async function loadFeet(base, shoeUrl) {
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
  const [data, gltf] = await Promise.all([
    fetch(base + '.json').then((r) => r.json()),
    new GLTFLoader().setDRACOLoader(draco).loadAsync(shoeUrl),
  ]);
  const nf = data.frames;
  const keys = {};
  for (const s of ['L', 'R']) {
    keys[s] = data[s].map((a) => {
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), k = new THREE.Vector3();
      new THREE.Matrix4().fromArray(a).decompose(p, q, k);
      return { p, q };
    });
  }

  const group = new THREE.Group();
  const shoes = {};
  for (const s of ['L', 'R']) {
    // поза покоя: кед подошвой на пол под щиколоткой манекена
    const shoe = gltf.scene.clone(true);
    shoe.scale.setScalar(SHOE_SCALE);
    if (s === 'R') shoe.scale.z *= -1; // зеркало поперёк стопы: после поворота на -90° локальная z модели — лево-право
    shoe.rotation.y = -Math.PI / 2;
    shoe.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    const holder = new THREE.Group();
    holder.add(shoe);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder), c = box.getCenter(new THREE.Vector3());
    shoe.position.set(-c.x, -box.min.y, -c.z);
    holder.position.set(FOOT[s].x, 0, FOOT[s].z);
    holder.rotation.y = THREE.MathUtils.degToRad(FOOT[s].yaw);
    const pivot = new THREE.Group();
    pivot.matrixAutoUpdate = false;
    pivot.add(holder);
    group.add(pivot);
    shoes[s] = pivot;
  }

  const p = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const duration = nf / 30;
  function update(time) {
    const f = ((time / duration) % 1 + 1) % 1 * nf;
    const a = Math.floor(f) % nf, b = (a + 1) % nf, k = f - Math.floor(f);
    for (const s of ['L', 'R']) {
      p.lerpVectors(keys[s][a].p, keys[s][b].p, k);
      q.slerpQuaternions(keys[s][a].q, keys[s][b].q, k);
      shoes[s].matrix.compose(p, q, one);
    }
  }
  update(0);
  return { group, update };
}
