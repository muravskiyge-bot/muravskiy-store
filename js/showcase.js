// Витрина: вещь можно только наклонить (не крутить на 360°) и посмотреть под разным светом
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadGarment } from './outfit.js';
import { loadClothLoop } from './cloth.js';

const ITEMS = {
  // худи ровно то, что на манекене в примерочной: кадр запечённой ткани (assets/anim/hoodie), тот же цвет и фактура
  hoodie: { cloth: 'assets/anim/hoodie', color: '#2a2c33', fabric: 'assets/anim/fabric.jpg', yaw: 0.3, pitch: 0.04, fit: 0.92 },
  sneaker: { garment: 'sneakerL', yaw: -0.75, pitch: 0.28, neon: 0.6, exposure: 0.72 },   // белые вещи под неоном слабее
  watch: { garment: 'watch', yaw: 0.35, pitch: 0.2, rotX: Math.PI / 2, fit: 0.78 },   // циферблат к зрителю; габарит почти куб — кадр шире
  pants: { garment: 'pants', yaw: 0.3, pitch: 0.02, fit: 0.95 },
  cap: { garment: 'cap', yaw: -0.6, pitch: 0.22, fit: 0.85, neon: 0.6, exposure: 0.85 },
  glasses: { garment: 'aviator', yaw: 0.35, pitch: 0.12, fit: 0.9 },
};
const LIGHTS = {
  // на чёрной карточке: окружение слабее (белые кеды и кепка засвечивались), контровой свет обрисовывает силуэт
  studio: { env: 0.45, key: [0xffffff, 2.1], rim: [0xdfe8ff, 2.2], pink: 0, cyan: 0 },
  sunset: { env: 0.18, key: [0xff9d52, 3.0], rim: [0x5d7bff, 2.6], pink: 0, cyan: 0 },
  neon: { env: 0.05, key: [0xffffff, 0], rim: [0xffffff, 0], pink: 20, cyan: 9 },
};
const TILT_Y = 0.34, TILT_X = 0.16; // ~20° и ~9°

export async function initShowcase(article) {
  const canvas = article.querySelector('.product__canvas');
  const cfg = ITEMS[article.dataset.item];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.AgXToneMapping;   // мягче держит светлые вещи, чем ACES
  renderer.toneMappingExposure = 0.95 * (cfg.exposure ?? 1);   // белые вещи (кеды, кепка) тише — не засвечиваются
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);

  const item = cfg.cloth
    ? new THREE.Group().add((await loadClothLoop(cfg.cloth, { color: cfg.color, fabric: cfg.fabric })).mesh)
    : await loadGarment(cfg.garment);
  // двусторонняя ткань затеняла сама себя чёрными пятнами: тень считаем по изнанке
  item.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (cfg.cloth) o.material.shadowSide = THREE.BackSide; } });
  if (cfg.rotX) { item.rotation.x = cfg.rotX; item.updateMatrixWorld(true); }
  const box = new THREE.Box3().setFromObject(item);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  item.position.sub(center);
  const pivot = new THREE.Group();
  pivot.add(item);
  scene.add(pivot);
  const R = Math.max(size.x, size.y, size.z);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R * 10, R * 10), new THREE.ShadowMaterial({ opacity: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -size.y / 2 - R * 0.04;
  floor.receiveShadow = true;
  scene.add(floor);

  const key = new THREE.DirectionalLight(0xffffff, LIGHTS.studio.key[1]);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 0.01, far: R * 10 });
  key.shadow.normalBias = 0.01;
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.2);
  rim.position.set(-R * 2, R, -R * 2);
  const pink = new THREE.PointLight(0xff1900, 0, R * 6, 1.4);   // фирменный красный
  const cyan = new THREE.PointLight(0x2a9dff, 0, R * 6, 1.4);
  pink.position.set(-R * 1.1, R * 0.3, R * 0.9);
  cyan.position.set(R * 1.1, -R * 0.1, R * 0.9);
  scene.add(key, rim, pink, cyan);
  // неоновые лампы стоят на расстоянии ~R: у мелкой вещи (часы 8 см против худи 70 см) свет в десятки раз ярче — уравниваем
  const neonScale = Math.pow(R / 0.7, 1.4) * (cfg.neon ?? 1);

  let target = LIGHTS.studio;
  scene.environmentIntensity = LIGHTS.studio.env;
  const tmpColor = new THREE.Color();
  article.querySelectorAll('[data-light]').forEach((btn) => btn.addEventListener('click', () => {
    target = LIGHTS[btn.dataset.light];
    article.querySelectorAll('[data-light]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  }));

  // наклон за курсором или пальцем, с пружиной обратно
  const aim = new THREE.Vector2(), tilt = new THREE.Vector2(), vel = new THREE.Vector2();
  let dragging = false, touched = false;
  const setAim = (e) => {
    const r = canvas.getBoundingClientRect();
    aim.set(THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1), THREE.MathUtils.clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1));
  };
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || dragging) setAim(e);
    if (!touched) { touched = true; article.querySelector('.product__hint').style.opacity = 0; }
  });
  canvas.addEventListener('pointerdown', (e) => { dragging = true; setAim(e); });
  addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointerleave', () => { if (!dragging) aim.set(0, 0); });
  canvas.addEventListener('pointercancel', () => { dragging = false; aim.set(0, 0); });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = (R * 0.62 / (cfg.fit || 1)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect);
    camera.position.set(0, R * 0.08, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let running = false, last = performance.now(), t = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now; t += dt;
    // пружина: быстро тянется к цели и мягко успокаивается
    vel.x += ((aim.x * TILT_Y - tilt.x) * 90 - vel.x * 14) * dt;
    vel.y += ((aim.y * TILT_X - tilt.y) * 90 - vel.y * 14) * dt;
    tilt.addScaledVector(vel, dt);
    pivot.rotation.set(cfg.pitch + tilt.y + Math.sin(t * 0.9) * 0.012, cfg.yaw + tilt.x + Math.sin(t * 0.6) * 0.03, 0);
    // свет плывёт к выбранному режиму и чуть следует за курсором
    const k = 1 - Math.exp(-dt * 4);
    scene.environmentIntensity += (target.env - scene.environmentIntensity) * k;
    key.color.lerp(tmpColor.set(target.key[0]), k); key.intensity += (target.key[1] - key.intensity) * k;
    rim.color.lerp(tmpColor.set(target.rim[0]), k); rim.intensity += (target.rim[1] - rim.intensity) * k;
    pink.intensity += (target.pink * neonScale - pink.intensity) * k;
    cyan.intensity += (target.cyan * neonScale - cyan.intensity) * k;
    key.position.set(R * (1.2 + aim.x * 0.8), R * (1.8 - aim.y * 0.4), R * 2);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  new IntersectionObserver(([en]) => {
    if (en.isIntersecting && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    else if (!en.isIntersecting) running = false;
  }, { rootMargin: '100px' }).observe(canvas);
}
