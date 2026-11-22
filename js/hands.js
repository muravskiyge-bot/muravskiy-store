// Кисти невидимого человека: трек манжет худи (dev/elbow.py -> assets/anim/hands.json).
// На каждую руку — опора (Object3D) в координатах меша худи; рука прямая или согнутая — смешиваем два трека
// по весу сгиба из cloth.js (hoodie.altWeight). Базис трека: x — наружу от тела, y — вдоль предплечья к локтю, z = x × y.
import * as THREE from 'three';

const v = (a, i) => new THREE.Vector3(a[i], a[i + 1], a[i + 2]);

export async function loadHands(url, hoodie) {
  const H = await fetch(url).then((r) => r.json());
  const nf = H.frames, duration = nf / H.fps;
  const anchors = { left: new THREE.Object3D(), right: new THREE.Object3D() };
  for (const a of Object.values(anchors)) { a.matrixAutoUpdate = false; hoodie.mesh.add(a); }

  // поза трека на кадре с долей k к следующему: позиция и оси x, y
  function pose(track, a, b, k) {
    const pa = track.pos[a], pb = track.pos[b], ba = track.basis[a], bb = track.basis[b];
    const p = new THREE.Vector3(...pa).lerp(new THREE.Vector3(...pb), k);
    const x = v(ba, 0).lerp(v(bb, 0), k), y = v(ba, 3).lerp(v(bb, 3), k);
    return { p, x, y };
  }
  function update(time) {
    const f = ((time / duration) % 1 + 1) % 1 * nf;
    const a = Math.floor(f) % nf, b = (a + 1) % nf, k = f - Math.floor(f);
    for (const side of ['left', 'right']) {
      const w = hoodie.altWeight(side);
      const s = pose(H[side + '0'], a, b, k), t = pose(H[side], a, b, k);
      const p = s.p.lerp(t.p, w), y = s.y.lerp(t.y, w).normalize();
      const x = s.x.lerp(t.x, w); x.sub(y.clone().multiplyScalar(x.dot(y))).normalize();
      const z = new THREE.Vector3().crossVectors(x, y);
      anchors[side].matrix.makeBasis(x, y, z).setPosition(p);
      anchors[side].matrixWorldNeedsUpdate = true;
    }
  }
  update(0);
  return { anchors, update };
}

// Посадка вещей в опоре кисти (метры; опора — центр манжеты). Кисть невидима: ладонь ~8–10 см дальше манжеты по −y.
// side: для правой руки z смотрит назад, для левой — вперёд (z = x × y), поэтому «вперёд» = z * fwd
export const HOLD_FIT = {
  // стакан: точка кисти — grip по предплечью от манжеты; от неё стакан висит в координатах тела (не руки): крышка на hang
  // ниже кисти, на fwd вперёд и out наружу — при любом наклоне предплечья не упирается в часы и не улетает вперёд
  coffee: { side: 'left', grip: 0.07, out: 0.0, fwd: 0.02, hang: 0.005, upright: true },
  watch: { side: 'left', grip: 0.025, out: 0, fwd: 0 },            // на запястье сразу за манжетой, циферблат наружу
};

export async function loadHeld(anchors, urls, fit = HOLD_FIT) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const items = {};
  await Promise.all(Object.entries(urls).map(async ([name, url]) => {
    const g = (await loader.loadAsync(url)).scene;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const f = fit[name], fw = f.side === 'left' ? 1 : -1;
    const holder = new THREE.Group();
    if (f.upright) holder.position.set(0, -f.grip, 0);
    else holder.position.set(f.out, -f.grip, f.fwd * fw);
    if (name === 'watch') {
      // модель: ось запястья ±x, циферблат +y  ->  ось вдоль предплечья (y опоры), циферблат наружу (x опоры)
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)));
    }
    holder.add(g);
    anchors[f.side].add(holder);
    items[name] = { group: holder, model: g, fit: f };
  }));
  // вертикальные вещи: поворот опоры снимаем, смещение задаём в осях худи (y — вверх, z — вперёд, x — к левому плечу)
  const q = new THREE.Quaternion(), m = new THREE.Matrix4(), off = new THREE.Vector3();
  function update() {
    for (const it of Object.values(items)) {
      const f = it.fit;
      if (!f.upright) continue;
      m.extractRotation(it.group.parent.matrix); q.setFromRotationMatrix(m).invert();
      it.model.quaternion.copy(q);
      const h = 0.15;  // высота стакана, дно в 0 модели
      off.set(f.out * (f.side === 'left' ? 1 : -1), -f.hang - h, f.fwd);
      it.model.position.copy(off.applyQuaternion(q));
    }
  }
  return { items, update };
}

