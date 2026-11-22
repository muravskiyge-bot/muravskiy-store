// Беговая дорожка: процедурная модель, лента едет назад со скоростью шага. Перед дорожки смотрит в +z
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const DECK_TOP = 0.2; // высота ленты над полом — на неё ставим ноги

function beltTexture() {
  // резина: мелкий шум + поперечные рёбра, чтобы было видно движение
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#26272b';
  g.fillRect(0, 0, s, s);
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  for (let y = 0; y < s; y += 8) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y, s, 2);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.fillRect(0, y + 2, s, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createTreadmill({ speed = 0.9 } = {}) {
  const group = new THREE.Group();
  const graphite = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.55, metalness: 0.3 });
  const alu = new THREE.MeshStandardMaterial({ color: 0x9a9ea6, roughness: 0.32, metalness: 0.9 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x232429, roughness: 0.42, metalness: 0 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.9 });

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };

  const L = 1.6, W = 0.52; // рабочая часть ленты
  add(new RoundedBoxGeometry(0.8, 0.1, 1.95, 3, 0.03), graphite, 0, 0.07, 0.05);
  for (const sx of [-1, 1]) {
    add(new RoundedBoxGeometry(0.12, 0.05, 1.7, 3, 0.015), alu, sx * 0.33, DECK_TOP - 0.01, 0);
    for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.035, 0.04, 0.03, 16), rubber, sx * 0.34, 0.015, sz * 0.85);
  }

  const tex = beltTexture();
  tex.repeat.set(1, L / 0.5);
  const belt = add(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), 0, DECK_TOP, 0);
  belt.rotation.x = -Math.PI / 2;
  belt.castShadow = false;
  for (const sz of [-1, 1]) {
    const roller = add(new THREE.CylinderGeometry(0.045, 0.045, W, 24), rubber, 0, DECK_TOP - 0.045, sz * (L / 2));
    roller.rotation.z = Math.PI / 2;
  }

  // кожух мотора спереди
  add(new RoundedBoxGeometry(0.8, 0.17, 0.32, 4, 0.05), plastic, 0, 0.2, 1.0);

  // стойки, поручни и консоль
  const postH = 1.05;
  for (const sx of [-1, 1]) {
    const post = add(new THREE.CylinderGeometry(0.028, 0.032, postH, 16), alu, sx * 0.36, 0.25 + postH / 2, 1.02);
    post.rotation.x = -0.12;
    const rail = add(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 16), rubber, sx * 0.37, 1.08, 0.78);
    rail.rotation.x = Math.PI / 2;
  }
  const console_ = add(new RoundedBoxGeometry(0.76, 0.06, 0.26, 4, 0.025), plastic, 0, 1.3, 1.06);
  console_.rotation.x = -0.55; // экраном к идущему
  // экран — единственный неоновый акцент
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.09),
    new THREE.MeshBasicMaterial({ color: 0x4ff3e6, toneMapped: false }),
  );
  screen.position.set(0, 0.031, 0);
  screen.rotation.x = -Math.PI / 2;
  console_.add(screen);

  const repeatLen = L / tex.repeat.y;
  function update(dt) {
    tex.offset.y -= (speed * dt) / repeatLen;
  }
  return { group, update, set speed(v) { speed = v; }, get speed() { return speed; } };
}
