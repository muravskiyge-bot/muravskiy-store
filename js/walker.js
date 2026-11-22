// Окно с невидимым человеком: миры, походка, снимаемые вещи
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadOutfit } from './outfit.js';
import { WORLDS, WORLD_WEAR, WORLD_ACCESSORIES, makeAccessories } from './worlds.js';

const ALL = ['pants', 'leather', 'sneakerL', 'sneakerR', 'hoodie', 'jacket', 'cap', 'aviator', 'neon'];
// по клику снимаем вещь целиком: оба кеда, любые штаны, любые очки
const KIND = { pants: 'pants', leather: 'pants', sneakerL: 'shoes', sneakerR: 'shoes', hoodie: 'hoodie', jacket: 'jacket', cap: 'cap', aviator: 'glasses', neon: 'glasses' };
export const KIND_LABEL = { jacket: 'Куртка', hoodie: 'Худи', pants: 'Штаны', shoes: 'Кеды', cap: 'Кепка', glasses: 'Очки' };

export async function initWalker({ canvas, pixels, onProgress, onRemovedChange }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 120);

  onProgress?.(0.15);
  const outfit = await loadOutfit({ only: ALL });
  onProgress?.(0.85);
  const man = new THREE.Group();
  man.rotation.y = Math.PI / 2;
  man.add(outfit.root);
  scene.add(man);
  const acc = makeAccessories();
  for (const a of Object.values(acc)) {
    a.obj.position.set(...a.pos);
    a.obj.rotation.set(...a.rot);
    a.obj.visible = false;
    outfit.bones[a.bone].add(a.obj);
  }

  const removed = new Set();
  const built = {};
  let world = null, worldName = null;

  function wearFor(name) {
    const wear = new Set(WORLD_WEAR[name]);
    for (const g of ALL) {
      const part = outfit.parts[g];
      const on = wear.has(g) && !removed.has(KIND[g]);
      part.visible = on;
      part.scale.setScalar(1);
      part.position.set(0, 0, 0);
      part.rotation.set(0, 0, 0);
    }
    for (const [k, a] of Object.entries(acc)) a.obj.visible = WORLD_ACCESSORIES[name].includes(k);
  }

  function applyWorld(name) {
    if (world) scene.remove(world.group);
    world = built[name] ||= WORLDS[name].build();
    worldName = name;
    scene.add(world.group);
    scene.background = world.background;
    scene.fog = world.fog ? new THREE.Fog(...world.fog) : null;
    scene.environmentIntensity = world.envIntensity;
    renderer.toneMappingExposure = world.exposure;
    man.position.y = world.lift;
    wearFor(name);
  }

  // ---------- пиксельный переход между мирами ----------
  const px = pixels.getContext('2d');
  function pixelWipe(midway) {
    return new Promise((resolve) => {
      const r = pixels.getBoundingClientRect();
      pixels.width = Math.ceil(r.width / 2); pixels.height = Math.ceil(r.height / 2);
      const size = 28, cols = Math.ceil(pixels.width / size), rows = Math.ceil(pixels.height / size);
      const order = Array.from({ length: cols * rows }, (_, i) => [i, Math.random() * 0.6 + ((i % cols) / cols) * 0.4]);
      const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0b0b10';
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--neon').trim() || '#4ff3e6';
      const t0 = performance.now(), D = 420;
      let swapped = false;
      (function frame(now) {
        const t = (now - t0) / D;
        px.clearRect(0, 0, pixels.width, pixels.height);
        for (const [i, d] of order) {
          const k = t < 1 ? t : 2 - t;
          if (k > d) {
            px.fillStyle = d > 0.93 ? accent : color;
            px.fillRect((i % cols) * size, Math.floor(i / cols) * size, size + 1, size + 1);
          }
        }
        if (t >= 1 && !swapped) { swapped = true; midway(); }
        if (t < 2) requestAnimationFrame(frame); else { px.clearRect(0, 0, pixels.width, pixels.height); resolve(); }
      })(t0);
    });
  }

  // ---------- снимаем вещи по клику ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitKind(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = ALL.filter((g) => outfit.parts[g].visible).map((g) => outfit.parts[g]);
    const hit = ray.intersectObjects(targets, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && !KIND[o.name]) o = o.parent;
    return o ? KIND[o.name] : null;
  }
  function takeOff(kind) {
    removed.add(kind);
    for (const g of ALL) {
      if (KIND[g] !== kind || !outfit.parts[g].visible) continue;
      const p = outfit.parts[g];
      const dir = Math.random() > 0.5 ? 1 : -1;
      gsap.to(p.position, { y: 2.6, z: dir * 0.8, duration: 0.7, ease: 'power2.in' });
      gsap.to(p.rotation, { z: dir * 1.2, duration: 0.7, ease: 'power2.in' });
      gsap.to(p.scale, { x: 0.2, y: 0.2, z: 0.2, duration: 0.7, ease: 'power2.in', onComplete: () => { p.visible = false; } });
    }
    onRemovedChange?.([...removed]);
  }
  function putOn(kind) {
    removed.delete(kind);
    const wear = new Set(WORLD_WEAR[worldName]);
    for (const g of ALL) {
      if (KIND[g] !== kind || !wear.has(g)) continue;
      const p = outfit.parts[g];
      gsap.killTweensOf([p.position, p.rotation, p.scale]);
      p.visible = true;
      p.position.set(0, 2.2, 0); p.rotation.set(0, 0, 0); p.scale.setScalar(0.3);
      gsap.to(p.position, { y: 0, duration: 0.6, ease: 'back.out(1.4)' });
      gsap.to(p.scale, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'back.out(1.4)' });
    }
    onRemovedChange?.([...removed]);
  }
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const k = hitKind(e);
    if (k) takeOff(k);
  });
  const pointer = new THREE.Vector2();
  let lastHover = 0;
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    if (e.pointerType === 'mouse' && performance.now() - lastHover > 80) {
      lastHover = performance.now();
      canvas.style.cursor = hitKind(e) ? 'pointer' : '';
    }
  });

  // ---------- кадр ----------
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let running = false, phase = 0, last = performance.now();
  const cam = new THREE.Vector2();
  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const style = world.style || {};
    const speed = (style.speed ?? 1) * (reduced ? 0.35 : 1);
    phase += dt * Math.PI * 2 * 0.92 * speed;
    outfit.pose(phase, style);
    world.update(dt * 1.45 * speed * (style.stride ?? 1), dt);
    // камера чуть следует за мышью, на узком экране отходит дальше
    cam.lerp(pointer, 0.04);
    const narrow = camera.aspect < 0.8;
    const far = narrow ? 1.75 : camera.aspect < 1.2 ? 1.25 : 1;
    camera.position.set((narrow ? 0.55 : 1.25) + cam.x * 0.6, 1.2 + man.position.y - cam.y * 0.25, 4.3 * far);
    camera.lookAt(narrow ? 0.05 : 0.25, 0.9 + man.position.y * 0.8, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
  function stop() { running = false; }
  new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop()), { threshold: 0.05 }).observe(canvas);

  applyWorld('treadmill');
  onProgress?.(1);
  start();

  let busy = false;
  return {
    async setWorld(name) {
      if (busy || name === worldName) return false;
      busy = true;
      await pixelWipe(() => applyWorld(name));
      busy = false;
      return true;
    },
    putOn, takeOff,
    putAllOn() { [...removed].forEach(putOn); },
    get world() { return worldName; },
    get busy() { return busy; },
  };
}
