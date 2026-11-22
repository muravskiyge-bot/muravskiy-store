// Пять миров для невидимого человека. Он стоит на месте и шагает к +X, мир едет навстречу (-X).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------- текстуры из canvas ----------
function canvasTex(w, h, draw, { repeat, srgb = true, nearest = false } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  t.anisotropy = 8;
  return t;
}
function noise(ctx, w, h, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() * 255 | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}
function skyTex(stops) {
  return canvasTex(8, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}
function sign(text, { w = 512, h = 160, bg = '#111', fg = '#fff', font = '800 92px Unbounded, sans-serif', border } = {}) {
  return canvasTex(w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 10; ctx.strokeRect(10, 10, w - 20, h - 20); }
    ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
}
const std = (o) => new THREE.MeshStandardMaterial(o);

// ряд предметов, которые уезжают назад и появляются впереди
function conveyor(group, length) {
  const items = [];
  return {
    add(obj, x) { obj.position.x = x; group.add(obj); items.push(obj); return obj; },
    update(dx) {
      for (const o of items) {
        o.position.x -= dx;
        if (o.position.x < -length / 2) o.position.x += length;
      }
    },
  };
}

function shadowFloor(y = 0, size = 12, opacity = 0.35) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({ opacity }));
  m.rotation.x = -Math.PI / 2; m.position.y = y + 0.001; m.receiveShadow = true;
  return m;
}

function sunLight(color, intensity, pos) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.set(...pos);
  l.castShadow = true;
  l.shadow.mapSize.set(2048, 2048);
  Object.assign(l.shadow.camera, { left: -2, right: 2, top: 2.4, bottom: -0.4, near: 0.5, far: 20 });
  l.shadow.bias = -0.0004;
  l.shadow.normalBias = 0.02;
  l.target.position.set(0, 0.9, 0);
  return l;
}

// ---------- 1. Беговая дорожка: без фона, только свет ----------
function treadmill() {
  const g = new THREE.Group();
  const deck = 0.17;
  const metal = std({ color: 0x1a1b1f, roughness: 0.35, metalness: 0.7 });
  const alu = std({ color: 0xb9bcc4, roughness: 0.25, metalness: 1 });
  const rubber = std({ color: 0x111113, roughness: 0.9 });
  const beltTex = canvasTex(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#151517'; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { ctx.fillStyle = x % 16 ? '#1c1c1f' : '#18181a'; ctx.fillRect(x, 0, 4, h); }
    noise(ctx, w, h, 3000, 0.06);
  }, { repeat: [6, 1] });
  const belt = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.03, 0.56), std({ map: beltTex, roughness: 0.85 }));
  belt.position.y = deck - 0.015; belt.receiveShadow = true;
  const frame = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.13, 0.82, 4, 0.04), metal);
  frame.position.y = 0.075; frame.castShadow = frame.receiveShadow = true;
  for (const z of [-0.33, 0.33]) {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(1.95, 0.035, 0.11, 3, 0.012), alu);
    rail.position.set(-0.02, deck - 0.005, z); rail.receiveShadow = true; g.add(rail);
  }
  const hood = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.2, 0.84, 5, 0.07), metal);
  hood.position.set(1.02, 0.12, 0); hood.castShadow = true;
  const console_ = new THREE.Group();
  for (const z of [-0.36, 0.36]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.25, 20), alu);
    post.position.set(1.12, 0.72, z); post.rotation.z = 0.22; post.castShadow = true; console_.add(post);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.6, 16), rubber);
    handle.rotation.z = Math.PI / 2; handle.position.set(0.72, 1.12, z); console_.add(handle);
  }
  const screenTex = canvasTex(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4ff3e6'; ctx.font = '28px "Press Start 2P", monospace'; ctx.fillText('6.0', 18, 52);
    ctx.font = '12px "Press Start 2P", monospace'; ctx.fillText('KM/H', 120, 50); ctx.fillStyle = '#ff4fd8'; ctx.fillText('HR 92', 18, 80);
  }, { nearest: true });
  const panel = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.36, 0.86, 4, 0.04), metal);
  panel.position.set(0.98, 1.36, 0); panel.rotation.z = 0.5; panel.castShadow = true;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0.9, 1.4, 0); screen.rotation.set(0, -Math.PI / 2, 0); screen.rotateX(-0.5);
  console_.add(panel, screen);
  g.add(frame, belt, hood, console_, shadowFloor(0, 8, 0.45));

  const key = new THREE.SpotLight(0xffffff, 60, 12, 0.5, 0.6, 1.4);
  key.position.set(-0.6, 4.2, 2.4); key.target.position.set(0, 0.9, 0); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight(0x9fdcff, 1.6); rim.position.set(-3, 2.5, -3);
  const accent = new THREE.PointLight(0xff4fd8, 3, 4); accent.position.set(1.4, 0.5, 1.2);
  g.add(key, key.target, rim, accent);
  return {
    group: g, lift: deck, background: null, envIntensity: 0.55, exposure: 1,
    update(dx) { beltTex.offset.x += dx / 1.75 * 6 / 6; },
  };
}

// ---------- 2. Американская улица со звёздами на тротуаре ----------
function street() {
  const g = new THREE.Group();
  const L = 26;
  const walkTex = canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4a3a3d'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 9000, 0.1);
    ctx.strokeStyle = '#2f2427'; ctx.lineWidth = 6; ctx.strokeRect(0, 0, w, h);
    const star = (cx, cy, r) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.closePath();
    };
    star(256, 230, 170); ctx.fillStyle = '#ee8fa6'; ctx.fill(); ctx.lineWidth = 12; ctx.strokeStyle = '#d9b45a'; ctx.stroke();
    ctx.beginPath(); ctx.arc(256, 235, 48, 0, Math.PI * 2); ctx.strokeStyle = '#d9b45a'; ctx.lineWidth = 8; ctx.stroke();
    ctx.fillStyle = '#d9b45a'; ctx.font = '700 38px Onest, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('ВАШ САЙТ', 256, 470);
  }, { repeat: [L / 1.6, 1] });
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.6), std({ map: walkTex, roughness: 0.7 }));
  walk.rotation.x = -Math.PI / 2; walk.receiveShadow = true;
  const curb = new THREE.Mesh(new THREE.BoxGeometry(L, 0.15, 0.25), std({ color: 0xcfc6bd, roughness: 0.8 }));
  curb.position.set(0, -0.05, 0.92); curb.receiveShadow = true;
  const roadTex = canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2b2b30'; ctx.fillRect(0, 0, w, h); noise(ctx, w, h, 12000, 0.12);
    ctx.fillStyle = '#f2c23a'; ctx.fillRect(0, 150, 220, 14);
  }, { repeat: [L / 4, 1] });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(L, 6), std({ map: roadTex, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, -0.12, 3.9); road.receiveShadow = true;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(L, 6), std({ color: 0x5b4c4f, roughness: 0.9 }));
  back.rotation.x = -Math.PI / 2; back.position.set(0, -0.002, -3.6); back.receiveShadow = true;
  g.add(walk, curb, road, back);

  const conv = conveyor(g, L);
  const palette = ['#f5b8a8', '#9fd6cf', '#f6d98b', '#c7b5ec', '#f29b9b', '#a8c8f0'];
  const names = ['DINER', 'MOTEL', 'PIZZA', 'ДИЗАЙН', 'RECORDS', 'КОФЕ'];
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Group();
    const w = 3.4, hgt = 2.8 + (i % 3) * 0.9;
    const col = palette[i % palette.length];
    const facadeTex = canvasTex(256, 256, (ctx, W, H) => {
      ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); noise(ctx, W, H, 1500, 0.05);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(0, 0, W, 10);
      for (let y = 40; y < H - 100; y += 70) for (let x = 24; x < W - 40; x += 78) {
        ctx.fillStyle = '#3d4f63'; ctx.fillRect(x, y, 46, 44); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x, y, 46, 8);
      }
    });
    const body = new THREE.Mesh(new RoundedBoxGeometry(w, hgt, 1.8, 3, 0.06), std({ map: facadeTex, roughness: 0.8 }));
    body.position.set(0, hgt / 2, -4.2); body.castShadow = body.receiveShadow = true;
    const awn = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.08, 0.7), std({ color: i % 2 ? 0xe2574c : 0x2f6f8f, roughness: 0.6 }));
    awn.position.set(0, 1.55, -3.05); awn.rotation.x = 0.25; awn.castShadow = true;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), std({ color: 0x2c3440, roughness: 0.4, metalness: 0.3 }));
    door.position.set(-0.8, 0.7, -3.29);
    const signM = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.53), new THREE.MeshBasicMaterial({ map: sign(names[i % names.length], { bg: '#1b1b22', fg: palette[(i + 2) % 6], border: '#fff4' }), toneMapped: false }));
    signM.position.set(0.4, hgt - 0.7, -3.29);
    b.add(body, awn, door, signM);
    b.position.z = -1.4;
    conv.add(b, -L / 2 + i * (L / 8));
  }
  // пальмы и фонари на тротуаре
  const trunkMat = std({ color: 0x8a6a4a, roughness: 0.9 }), leafMat = std({ color: 0x3f8f4f, roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Group();
    let y = 0;
    for (let s = 0; s < 9; s++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.09 - s * 0.005, 0.11 - s * 0.005, 0.5, 10), trunkMat);
      seg.position.set(Math.sin(s * 0.3) * 0.12, y + 0.25, 0); seg.castShadow = true; p.add(seg); y += 0.48;
    }
    for (let k = 0; k < 8; k++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.32, 6, 1), leafMat);
      const pos = leaf.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) pos.setY(v, pos.getY(v) * (1 - Math.abs(pos.getX(v)) / 0.8) - (pos.getX(v) ** 2) * 0.25);
      leaf.geometry.translate(0.7, 0, 0); leaf.geometry.computeVertexNormals();
      leaf.position.set(0.25, y, 0); leaf.rotation.set(0.3, k * Math.PI / 4, -0.25); leaf.castShadow = true; p.add(leaf);
    }
    p.position.z = -1.6;
    conv.add(p, -L / 2 + i * (L / 4) + 2);
  }
  const lampMat = std({ color: 0x2a3b35, roughness: 0.5, metalness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const lamp = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 3, 12), lampMat); post.position.y = 1.5; post.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff0c0 })); head.position.y = 3.05;
    lamp.add(post, head); lamp.position.z = -0.75;
    conv.add(lamp, -L / 2 + i * (L / 3) + 5);
  }
  const hydrant = new THREE.Group();
  const red = std({ color: 0xc7372f, roughness: 0.45, metalness: 0.2 });
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 16), red); hb.position.y = 0.25;
  const hc = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), red); hc.position.y = 0.5;
  const hs = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 10), red); hs.rotation.x = Math.PI / 2; hs.position.y = 0.33;
  [hb, hc, hs].forEach((m) => { m.castShadow = true; hydrant.add(m); });
  hydrant.position.z = 0.55;
  conv.add(hydrant, 3);

  const sun = sunLight(0xffd2a1, 3.2, [3, 5, 4]);
  const hemi = new THREE.HemisphereLight(0xffd9c2, 0x6a4a5a, 1.2);
  g.add(sun, sun.target, hemi);
  return {
    group: g, lift: 0, envIntensity: 0.6, exposure: 1.05,
    background: skyTex([[0, '#6fa8dc'], [0.45, '#f7c59f'], [0.75, '#f49d8f'], [1, '#f49d8f']]),
    fog: [0xf4b89f, 9, 28],
    update(dx) { walkTex.offset.x += dx / 1.6; roadTex.offset.x += dx / 4; conv.update(dx); },
  };
}

// ---------- 3. Каменный век ----------
function stone() {
  const g = new THREE.Group();
  const L = 30;
  const dirtTex = canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#b58a5a'; ctx.fillRect(0, 0, w, h); noise(ctx, w, h, 30000, 0.12);
    for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(80,55,30,${0.1 + Math.random() * 0.2})`; ctx.beginPath(); ctx.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 3 + Math.random() * 8, Math.random() * 3, 0, Math.PI * 2); ctx.fill(); }
  }, { repeat: [L / 3, 4] });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(L, 12, 60, 24), std({ map: dirtTex, roughness: 0.95 }));
  const gp = ground.geometry.attributes.position;
  for (let i = 0; i < gp.count; i++) { const y = gp.getY(i); if (Math.abs(y) > 1.2) gp.setZ(i, Math.sin(gp.getX(i) * 0.7) * 0.15 * (Math.abs(y) - 1.2)); }
  ground.geometry.computeVertexNormals();
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  g.add(ground);
  const conv = conveyor(g, L);
  const rockMat = std({ color: 0x8b7d6b, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 12; i++) {
    const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + Math.random() * 0.9, 1), rockMat);
    const p = r.geometry.attributes.position;
    const seed = Math.random() * 10, sy = 0.5 + Math.random() * 0.3;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
      const k = 1 + 0.18 * Math.sin(x * 4.1 + seed) * Math.cos(z * 3.7 - seed) + 0.1 * Math.sin(y * 6 + seed);
      p.setXYZ(v, x * k, y * k * sy, z * k);
    }
    r.geometry.computeVertexNormals();
    r.position.set(0, 0.1, (i % 2 ? -1 : 1) * (1.6 + Math.random() * 2.5));
    r.rotation.y = Math.random() * 6; r.castShadow = r.receiveShadow = true;
    conv.add(r, -L / 2 + i * (L / 12) + Math.random());
  }
  const fernMat = std({ color: 0x4f7a2e, roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 10; i++) {
    const f = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22, 6, 1), fernMat);
      const pos = leaf.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) pos.setY(v, pos.getY(v) * (1 - Math.abs(pos.getX(v)) / 0.5) - (pos.getX(v) ** 2) * 0.5);
      leaf.geometry.translate(0.45, 0, 0); leaf.geometry.computeVertexNormals();
      leaf.rotation.set(0, k * 0.9, 0.6); leaf.position.y = 0.05; leaf.castShadow = true; f.add(leaf);
    }
    f.position.z = (i % 2 ? -1 : 1) * (1.2 + Math.random() * 1.5);
    f.scale.setScalar(0.7 + Math.random() * 0.8);
    conv.add(f, -L / 2 + i * (L / 10) + 1.4);
  }
  // гигантские деревья-хвощи вдали
  const trunk = std({ color: 0x6b4f33, roughness: 0.9 });
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Group();
    const h = 4 + Math.random() * 2;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, h, 10), trunk); tr.position.y = h / 2; tr.castShadow = true;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 9), std({ color: 0x3e6b2b, roughness: 0.9, flatShading: true })); crown.position.y = h + 0.3; crown.castShadow = true;
    t.add(tr, crown); t.position.z = -4.5 - Math.random() * 2;
    conv.add(t, -L / 2 + i * (L / 5));
  }
  const volcano = new THREE.Mesh(new THREE.ConeGeometry(9, 7, 40, 1, true), std({ color: 0x5a4636, roughness: 1, flatShading: true }));
  volcano.position.set(4, 3.2, -24);
  const lava = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: 0xff6a2a, toneMapped: false }));
  lava.rotation.x = -Math.PI / 2; lava.position.set(4, 6.4, -24);
  const smoke = [];
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x9a8f88, roughness: 1, transparent: true, opacity: 0.6 });
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), smokeMat); s.userData.t = i / 6; g.add(s); smoke.push(s); }
  g.add(volcano, lava);
  const sun = sunLight(0xffc68a, 3, [-2, 5, 3]);
  g.add(sun, sun.target, new THREE.HemisphereLight(0xffd8a8, 0x6b4a2a, 1.1));
  return {
    group: g, lift: 0, envIntensity: 0.5, exposure: 1,
    background: skyTex([[0, '#e8a76a'], [0.5, '#f3c98d'], [1, '#d99a62']]),
    fog: [0xe9b37e, 10, 40],
    update(dx, dt) {
      dirtTex.offset.x += dx / 3; conv.update(dx);
      for (const s of smoke) {
        s.userData.t = (s.userData.t + dt * 0.05) % 1;
        const t = s.userData.t;
        s.position.set(4 + t * 3, 7 + t * 8, -24); s.scale.setScalar(1 + t * 3); s.material.opacity = 0.55 * (1 - t);
      }
    },
  };
}

// ---------- 4. Киберпанк ----------
function cyber() {
  const g = new THREE.Group();
  const L = 28;
  const wetTex = canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#0c0b12'; ctx.fillRect(0, 0, w, h); noise(ctx, w, h, 20000, 0.08);
    ctx.fillStyle = '#ff4fd8'; for (let x = 0; x < w; x += 128) ctx.fillRect(x, 250, 60, 6);
  }, { repeat: [L / 4, 2] });
  const roughTex = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#555'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 5 + Math.random() * 15, 0, 0, Math.PI * 2); ctx.fill(); }
  }, { repeat: [L / 4, 2], srgb: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(L, 8), std({ map: wetTex, roughnessMap: roughTex, roughness: 0.6, metalness: 0.5 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  g.add(ground);
  const conv = conveyor(g, L);
  const neon = ['#ff4fd8', '#4ff3e6', '#a66bff', '#ffb84f'];
  const words = ['НЕОН', '24/7', 'ШАУРМА', 'ОТЕЛЬ', 'CYBER', 'КОД', 'БАР', 'ПИКСЕЛЬ'];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group();
    const h = 6 + (i % 4) * 2.5, w = 2.6 + (i % 3) * 0.6;
    const winTex = canvasTex(128, 256, (ctx, W, H) => {
      ctx.fillStyle = '#0d0e16'; ctx.fillRect(0, 0, W, H);
      for (let y = 6; y < H; y += 14) for (let x = 6; x < W; x += 14) if (Math.random() > 0.55) { ctx.fillStyle = Math.random() > 0.8 ? neon[(Math.random() * 4) | 0] : '#f5d9a0'; ctx.globalAlpha = 0.5 + Math.random() * 0.5; ctx.fillRect(x, y, 7, 9); }
      ctx.globalAlpha = 1;
    });
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.repeat.set(w / 2.2, h / 4.4);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.2), std({ color: 0x14151d, roughness: 0.7, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55, map: winTex }));
    body.position.set(0, h / 2, -3.1); body.castShadow = true;
    const c = neon[i % 4];
    const sgn = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 2), new THREE.MeshBasicMaterial({ map: sign(words[i % words.length], { w: 160, h: 512, bg: 'rgba(0,0,0,0)', fg: c, font: '700 70px Tiny5, sans-serif' }), transparent: true, toneMapped: false }));
    sgn.material.map.center.set(0.5, 0.5); sgn.material.map.rotation = -Math.PI / 2;
    sgn.position.set(w / 2 - 0.3, 4.2, -1.95);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
    tube.position.set(0, 1.9, -1.98);
    const glow = new THREE.PointLight(c, 6, 5, 1.6); glow.position.set(0, 1.7, -1.4);
    b.add(body, sgn, tube, glow);
    conv.add(b, -L / 2 + i * (L / 9));
    const far = new THREE.Mesh(new THREE.BoxGeometry(3, 14 + (i % 3) * 5, 3), std({ color: 0x0c0c14, roughness: 0.8, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.25, map: winTex }));
    far.position.set(0, far.geometry.parameters.height / 2, -11);
    conv.add(far, -L / 2 + i * (L / 9) + 1.5);
  }
  // капли дождя
  const N = 900;
  const rainGeo = new THREE.BufferGeometry();
  const rp = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 14, y = Math.random() * 7, z = (Math.random() - 0.5) * 8; rp.set([x, y, z, x - 0.03, y - 0.28, z], i * 6); }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.35 }));
  g.add(rain);
  const moon = new THREE.DirectionalLight(0x7a8cff, 1.4); moon.position.set(-2, 6, 3); moon.castShadow = true;
  Object.assign(moon.shadow.camera, { left: -2, right: 2, top: 2.4, bottom: -0.4 }); moon.shadow.mapSize.set(1024, 1024); moon.shadow.normalBias = 0.02;
  const pink = new THREE.PointLight(0xff4fd8, 14, 6, 1.5); pink.position.set(-1.6, 1.8, 1.6);
  const cyan = new THREE.PointLight(0x4ff3e6, 12, 6, 1.5); cyan.position.set(1.8, 1.2, 1.4);
  g.add(moon, moon.target, pink, cyan, new THREE.HemisphereLight(0x4a3a8a, 0x0a0a12, 0.5));
  return {
    group: g, lift: 0, envIntensity: 0.25, exposure: 1.1,
    background: skyTex([[0, '#07060f'], [0.6, '#1b0f2e'], [1, '#3a1240']]),
    fog: [0x1a0f2a, 6, 22],
    update(dx, dt) {
      wetTex.offset.x += dx / 4; roughTex.offset.x += dx / 4; conv.update(dx);
      const a = rainGeo.attributes.position;
      for (let i = 0; i < N; i++) {
        let y = a.getY(i * 2) - dt * 9;
        if (y < 0) y += 7;
        a.setY(i * 2, y); a.setY(i * 2 + 1, y - 0.28);
      }
      a.needsUpdate = true;
    },
  };
}

// ---------- 5. Космос: Луна, низкая гравитация ----------
function space() {
  const g = new THREE.Group();
  const L = 30;
  const moonTex = canvasTex(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#8d8d92'; ctx.fillRect(0, 0, w, h); noise(ctx, w, h, 60000, 0.1);
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 4 + Math.random() ** 3 * 70;
      const gr = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      gr.addColorStop(0, 'rgba(40,40,45,.45)'); gr.addColorStop(0.8, 'rgba(60,60,65,.2)'); gr.addColorStop(1, 'rgba(230,230,235,.35)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }, { repeat: [L / 6, 2] });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(L, 14, 80, 30), std({ map: moonTex, roughness: 1, bumpMap: moonTex, bumpScale: 2 }));
  const gp = ground.geometry.attributes.position;
  for (let i = 0; i < gp.count; i++) { const y = gp.getY(i); if (Math.abs(y) > 1) gp.setZ(i, (Math.sin(gp.getX(i) * 0.5 + y) * 0.2 + Math.cos(gp.getX(i) * 1.3) * 0.1) * Math.min(1, Math.abs(y) - 1)); }
  ground.geometry.computeVertexNormals();
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  g.add(ground);
  const conv = conveyor(g, L);
  const rockMat = std({ color: 0x77777c, roughness: 1, flatShading: true });
  for (let i = 0; i < 10; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15 + Math.random() * 0.5, 0), rockMat);
    r.position.set(0, 0.05, (i % 2 ? -1 : 1) * (1.3 + Math.random() * 3)); r.castShadow = true;
    conv.add(r, -L / 2 + i * (L / 10));
  }
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.8, 8), std({ color: 0xdddddd, metalness: 1, roughness: 0.3 })); pole.position.y = 0.9;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ map: sign('GM', { w: 256, h: 160, bg: '#111', fg: '#4ff3e6', font: '28px "Press Start 2P", monospace', border: '#ff4fd8' }), side: THREE.DoubleSide }));
  cloth.position.set(0.4, 1.55, 0);
  flag.add(pole, cloth); flag.position.z = -1.6;
  conv.add(flag, 6);
  // звёзды
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(3000 * 3);
  for (let i = 0; i < 3000; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(60); v.y = Math.abs(v.y) * 0.9 + 2; sp.set(v.toArray(), i * 3); }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, sizeAttenuation: true, fog: false }));
  // Земля над горизонтом
  const earthTex = canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1f5fa8'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { ctx.fillStyle = i % 3 ? '#3f8f4f' : '#c9b37a'; ctx.beginPath(); ctx.ellipse(Math.random() * w, 40 + Math.random() * (h - 80), 20 + Math.random() * 60, 10 + Math.random() * 30, Math.random() * 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.filter = 'blur(3px)'; ctx.fillStyle = 'rgba(255,255,255,.3)'; for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 50, 3 + Math.random() * 4, 0, 0, Math.PI * 2); ctx.fill(); } ctx.filter = 'none';
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(4, 48, 32), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.8, fog: false }));
  earth.position.set(-14, 7.5, -42);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(4.25, 48, 32), new THREE.MeshBasicMaterial({ color: 0x6fb6ff, transparent: true, opacity: 0.18, side: THREE.BackSide, fog: false }));
  atm.position.copy(earth.position);
  g.add(stars, earth, atm);
  const sun = sunLight(0xffffff, 4, [4, 3, 2]);
  g.add(sun, sun.target, new THREE.HemisphereLight(0x8ea0c0, 0x111111, 0.35));
  return {
    group: g, lift: 0, envIntensity: 0.3, exposure: 1,
    background: new THREE.Color(0x020308), style: { stride: 1.15, bounce: 3.2, swagger: 0.6, speed: 0.62 },
    update(dx, dt) { moonTex.offset.x += dx / 6; conv.update(dx); earth.rotation.y += dt * 0.03; },
  };
}

export const WORLDS = {
  treadmill: { label: 'Беговая', build: treadmill },
  street: { label: 'Улица', build: street },
  stone: { label: 'Каменный век', build: stone },
  cyber: { label: 'Киберпанк', build: cyber },
  space: { label: 'Космос', build: space },
};

// ---------- аксессуары, которые делаем сами ----------
export function makeAccessories() {
  const acc = {};
  // дубина
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.022 + 0.06 * t ** 1.6 + Math.sin(t * 19) * 0.006, t * 0.62)); }
  const clubGeo = new THREE.LatheGeometry(pts, 14);
  const cp = clubGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) { const k = 1 + (Math.sin(cp.getY(i) * 40 + Math.atan2(cp.getZ(i), cp.getX(i)) * 3) * 0.08); cp.setX(i, cp.getX(i) * k); cp.setZ(i, cp.getZ(i) * k); }
  clubGeo.computeVertexNormals();
  const woodTex = canvasTex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) { ctx.fillStyle = `rgba(${40 + Math.random() * 40},${25 + Math.random() * 20},10,.35)`; ctx.fillRect(x, 0, 2, h); }
    noise(ctx, w, h, 4000, 0.15);
  });
  const club = new THREE.Mesh(clubGeo, std({ map: woodTex, roughness: 0.85 }));
  club.castShadow = true;
  acc.club = { obj: club, bone: 'rWrist', pos: [0, -0.06, 0.03], rot: [Math.PI * 0.95, 0, 0.1] };
  // цепь
  const chain = new THREE.Group();
  const gold = std({ color: 0xd9b45a, roughness: 0.22, metalness: 1 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, 6, 12), gold);
    link.position.set(Math.sin(a) * 0.1, -Math.max(0, Math.cos(a)) * 0.09, Math.cos(a) * 0.085 + 0.02);
    link.rotation.set(0, a, i % 2 ? Math.PI / 2 : 0); link.castShadow = true;
    chain.add(link);
  }
  acc.chain = { obj: chain, bone: 'chest', pos: [0, 0.12, 0.05], rot: [0.25, 0, 0] };
  // стакан кофе
  const cup = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.033, 0.14, 24), std({ color: 0xf2ece2, roughness: 0.8 }));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.016, 24), std({ color: 0x2b2b2b, roughness: 0.5 })); lid.position.y = 0.075;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.0405, 0.037, 0.06, 24), std({ color: 0xb07a4a, roughness: 0.9 }));
  cup.add(paper, lid, sleeve); cup.traverse((m) => { m.castShadow = true; });
  acc.coffee = { obj: cup, bone: 'lWrist', pos: [0.02, -0.06, 0.04], rot: [0, 0, 0] };
  // наушники для зала
  const phones = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.009, 8, 32, Math.PI), std({ color: 0x1b1b1f, roughness: 0.4 }));
  band.rotation.y = Math.PI / 2;
  for (const s of [-1, 1]) { const cupM = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 24), std({ color: 0x18181c, roughness: 0.35 })); cupM.rotation.z = Math.PI / 2; cupM.position.set(s * 0.1, 0, 0); phones.add(cupM); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.004, 6, 24), new THREE.MeshBasicMaterial({ color: 0x4ff3e6, toneMapped: false })); ring.rotation.y = Math.PI / 2; ring.position.set(s * 0.117, 0, 0); phones.add(ring); }
  phones.add(band);
  acc.phones = { obj: phones, bone: 'head', pos: [0, 0.07, -0.005], rot: [0, 0, 0] };
  // каменные очки
  const sg = new THREE.Group();
  const obs = std({ color: 0x1a1714, roughness: 0.25, metalness: 0.2 });
  const st = std({ color: 0x7d6e5c, roughness: 1, flatShading: true });
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.01, 7), obs); lens.rotation.x = Math.PI / 2; lens.position.set(s * 0.035, 0, 0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.008, 5, 7), st); rim.position.set(s * 0.035, 0, 0);
    sg.add(lens, rim);
  }
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 6), std({ color: 0xe8dcc2, roughness: 0.6 })); bone.rotation.z = Math.PI / 2; sg.add(bone);
  acc.stoneGlasses = { obj: sg, bone: 'head', pos: [0, 0.03, 0.115], rot: [0, 0, 0] };
  // светящаяся полоса на кепке
  const led = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.004, 6, 48, Math.PI * 1.1), new THREE.MeshBasicMaterial({ color: 0x4ff3e6, toneMapped: false }));
  led.rotation.set(Math.PI / 2, 0, -Math.PI * 0.05 + Math.PI * 0.95);
  acc.led = { obj: led, bone: 'head', pos: [0, 0.12, 0.005], rot: [Math.PI / 2 + 0.12, 0, Math.PI * 0.95] };
  // шлем-пузырь
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 32), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transmission: 1, thickness: 0.01, ior: 1.3, transparent: true, opacity: 0.35, envMapIntensity: 1.5 }));
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 12, 40), std({ color: 0xdcdcdc, roughness: 0.3, metalness: 0.8 })); collar.rotation.x = Math.PI / 2; collar.position.y = -0.13;
  const hg = new THREE.Group(); hg.add(helmet, collar);
  acc.helmet = { obj: hg, bone: 'head', pos: [0, 0.07, 0.01], rot: [0, 0, 0] };
  return acc;
}

export const WORLD_ACCESSORIES = {
  treadmill: ['phones'],
  street: ['chain', 'coffee'],
  stone: ['club', 'stoneGlasses'],
  cyber: ['led'],
  space: ['helmet'],
};
// какие вещи из моделей видны в каждом мире
export const WORLD_WEAR = {
  treadmill: ['pants', 'sneakerL', 'sneakerR', 'hoodie', 'jacket', 'cap', 'aviator'],
  street: ['pants', 'sneakerL', 'sneakerR', 'hoodie', 'jacket', 'cap', 'aviator'],
  stone: ['pants', 'sneakerL', 'sneakerR', 'hoodie', 'jacket', 'cap'],
  cyber: ['leather', 'hoodie', 'jacket', 'cap', 'neon'],
  space: ['pants', 'sneakerL', 'sneakerR', 'hoodie', 'jacket', 'cap', 'aviator'],
};
