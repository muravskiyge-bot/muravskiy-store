// Сумки на невидимом человеке: корпус сумки жёстко едет с торсом худи, ремень каждый кадр строится по ткани.
// Всё в координатах меша худи (группы вложены в hoodie.mesh): +y вверх, +z вперёд, +x к левому плечу.
//  1) по кадрам цикла — жёсткое движение торса (Хорн по точкам груди/спины относительно кадра 0);
//     вершины, которые от торса уходят далеко (рукава), в ремень и опору сумки не берём;
//  2) ремень — сечение худи наклонной плоскостью «плечо — противоположная талия»: из центра торса лучи в этой
//     плоскости, на каждом — самая внешняя точка ткани и пятно вершин вокруг неё; ремень натянут (провалы
//     складок перекрывает) и отстоит от ткани на половину толщины;
//  3) сумка прижата к ткани: на каждом кадре сдвиг наружу по самой выпуклой точке ткани под сумкой;
//  4) физика: набитая сумка тяжёлая — почти не болтается, идёт за телом с малым запаздыванием и быстро гасит
//     качание (затухание близко к критическому), зато на каждом шаге проседает и пружинит на ремне. Модель —
//     маятник с подвесом у верхней кромки (низ от тела/вбок) + вертикальная пружина ремня; в тело — не дальше FLAT.
import * as THREE from 'three';

// Модели — dev/prep_bags.py: начало в центре задней стенки, +z от тела. attach — точки крепления ремня (оттуда же).
// shoulder / waist — через какое плечо и к какой талии идёт ремень (кадр 0); at — где на петле сумка, градусы:
// 0 — плечо, 90 — грудь, −90 — спина. align: 'up' — верх сумки к плечу; 'level' — длинная сторона горизонтально,
// повернута на roll° (плюс — край +x модели вверх); drop — сдвиг вниз по оси сумки; tilt — до скольких градусов
// можно отвести низ от тела (подбирается сам); scale — по осям модели
export const BAG_FIT = {
  crossbody: {
    url: '../assets/models/crossbody.glb',
    shoulder: [-0.17, 1.45, 0], waist: [0.21, 1.0, 0], at: 88, align: 'up', drop: 0.0, clearance: 0.006, scale: [1, 1, 0.7],
    attach: [[-0.0257, 0.1488, 0.1503], [0.0791, -0.015, 0.1474]],
    strap: { width: 0.03, thick: 0.004, color: '#3a271c', roughness: 0.5 },
    swing: { hz: 2.6, damp: 0.6, gain: 0.55, max: 0.08, bounce: 0.6, bhz: 3.2 },   // прижата ремнём к груди
  },
  gymbag: {
    url: '../assets/models/gymbag.glb',
    shoulder: [-0.17, 1.45, 0], waist: [0.21, 1.0, 0], at: -95, matte: 0.85, align: 'level', roll: 25, drop: 0.15, tilt: 30, clearance: 0.008,
    attach: [[-0.2241, 0.0511, 0.1356], [0.2339, 0.0501, 0.1434]],   // после мешковатости (prep_bags.py)
    strap: { width: 0.038, thick: 0.003, color: '#1c1d21', roughness: 0.85 },
    swing: { hz: 1.8, damp: 0.55, gain: 0.75, max: 0.12, bounce: 0.75, bhz: 2.6 },  // тяжелее: ниже частота, больше осадка
  },
};
const FLAT = 0.02;          // насколько (рад) низ сумки может уйти внутрь, к телу

const RAYS = 90;            // лучей на петлю ремня
const RAY_R = 0.016;        // толщина луча: вершины ближе к нему — кандидаты
const PATCH_R = 0.022;      // пятно ткани вокруг точки ремня
const ARM_MOVE = 0.06;      // уход от торса больше этого за цикл — рукав

// поворот+сдвиг, переводящий точки A в B (Хорн, кватернион — собственный вектор 4×4 возведением в степень)
function rigid(A, B, idx) {
  const ca = new THREE.Vector3(), cb = new THREE.Vector3();
  for (const v of idx) { ca.x += A[v * 3]; ca.y += A[v * 3 + 1]; ca.z += A[v * 3 + 2]; cb.x += B[v * 3]; cb.y += B[v * 3 + 1]; cb.z += B[v * 3 + 2]; }
  ca.divideScalar(idx.length); cb.divideScalar(idx.length);
  const S = new Array(9).fill(0);
  for (const v of idx) {
    const a = [A[v * 3] - ca.x, A[v * 3 + 1] - ca.y, A[v * 3 + 2] - ca.z], b = [B[v * 3] - cb.x, B[v * 3 + 1] - cb.y, B[v * 3 + 2] - cb.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i * 3 + j] += a[i] * b[j];
  }
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = S;
  let M = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const c = Math.hypot(...M.flat());
  for (let i = 0; i < 4; i++) M[i][i] += c;                        // все собственные числа ≥ 0
  for (let it = 0; it < 16; it++) {                                 // M ← M², нормируя
    const R = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => M[i][0] * M[0][j] + M[i][1] * M[1][j] + M[i][2] * M[2][j] + M[i][3] * M[3][j]));
    const n = Math.hypot(...R.flat());
    M = R.map((r) => r.map((x) => x / n));
  }
  const w = [0, 1, 2, 3].map((i) => M[i][0] + M[i][1] * 1e-3 + M[i][2] * 1e-3 + M[i][3] * 1e-3);
  const q = new THREE.Quaternion(w[1], w[2], w[3], w[0]).normalize();
  const t = cb.clone().sub(ca.clone().applyQuaternion(q));
  return new THREE.Matrix4().compose(t, q, new THREE.Vector3(1, 1, 1));
}

export async function loadBags(hoodie, names, fit = BAG_FIT) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const models = await Promise.all(names.map((n) => loader.loadAsync(fit[n].url)));

  // кадры худи (без сгиба локтей — он меняет только предплечья)
  const nf = hoodie.frames, pos = hoodie.mesh.geometry.attributes.position, nrm = hoodie.mesh.geometry.attributes.normal;
  const nv = pos.count, F = [];
  for (let f = 0; f < nf; f++) { hoodie.update(f * hoodie.duration / nf); F.push(pos.array.slice()); }
  hoodie.update(0);
  const P0 = F[0], N0 = nrm.array.slice();

  // торс: грудь и спина между поясом и плечами
  const torso = [];
  for (let v = 0; v < nv; v++) if (P0[v * 3 + 1] > 1.0 && P0[v * 3 + 1] < 1.38 && Math.abs(P0[v * 3] - 0.02) < 0.14) torso.push(v);
  const T = F.map((Pf) => rigid(P0, Pf, torso));
  const Tinv = T.map((m) => m.clone().invert());
  const arm = new Uint8Array(nv), tmp = new THREE.Vector3();
  for (let f = 1; f < nf; f++) {
    for (let v = 0; v < nv; v++) {
      if (arm[v]) continue;
      tmp.fromArray(F[f], v * 3).applyMatrix4(Tinv[f]);
      if (tmp.distanceToSquared(new THREE.Vector3().fromArray(P0, v * 3)) > ARM_MOVE ** 2) arm[v] = 1;
    }
  }
  const torsoKeys = T.map((m) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(); m.decompose(p, q, new THREE.Vector3()); return { p, q }; });

  const bags = {};
  names.forEach((name, bi) => {
    const cfg = fit[name];
    const model = models[bi].scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      // ткань, а не пластик: на изогнутой (мешковатой) стенке глянец отражал тёмный пол полосой
      if (cfg.matte) { o.material.roughness = Math.max(o.material.roughness ?? 1, cfg.matte); o.material.metalness = 0; o.material.roughnessMap = null; o.material.metalnessMap = null; }
    });
    const sc = new THREE.Vector3(...(cfg.scale || [1, 1, 1]));
    model.scale.copy(sc);
    const box = new THREE.Box3().setFromObject(model);

    // петля ремня в кадре 0: лучи из центра торса в плоскости «плечо — талия»
    const sh = new THREE.Vector3(...cfg.shoulder), wa = new THREE.Vector3(...cfg.waist);
    const C = sh.clone().add(wa).multiplyScalar(0.5); C.z = -0.02;
    const u = sh.clone().sub(wa).normalize(), fz = new THREE.Vector3(0, 0, 1);
    fz.sub(u.clone().multiplyScalar(fz.dot(u))).normalize();
    const loop = [];
    for (let r = 0; r < RAYS; r++) {
      const th = (r / RAYS) * Math.PI * 2;
      const d = u.clone().multiplyScalar(Math.cos(th)).addScaledVector(fz, Math.sin(th));
      let best = -1, bs = 0;
      for (let v = 0; v < nv; v++) {
        if (arm[v]) continue;
        tmp.fromArray(P0, v * 3).sub(C);
        const s = tmp.dot(d);
        if (s <= bs) continue;
        if (tmp.addScaledVector(d, -s).lengthSq() < RAY_R ** 2) { best = v; bs = s; }
      }
      if (best < 0) continue;
      const hit0 = new THREE.Vector3().fromArray(P0, best * 3);
      if (loop.length && loop.at(-1).p.distanceTo(hit0) < 0.012) continue;   // тот же участок ткани
      const hit = new THREE.Vector3().fromArray(P0, best * 3), patch = [];
      for (let v = 0; v < nv; v++) {
        if (arm[v]) continue;
        tmp.fromArray(P0, v * 3);
        if (tmp.distanceToSquared(hit) > PATCH_R ** 2 || tmp.sub(C).dot(d) < bs - 0.012) continue;
        patch.push(v);
      }
      loop.push({ th, patch, p: hit });
    }
    if (loop.length > 1 && loop[0].p.distanceTo(loop.at(-1).p) < 0.012) loop.pop();
    const patchPoint = (patch, P, N, out, n) => {
      out.set(0, 0, 0); n.set(0, 0, 0);
      for (const v of patch) { out.x += P[v * 3]; out.y += P[v * 3 + 1]; out.z += P[v * 3 + 2]; n.x += N[v * 3]; n.y += N[v * 3 + 1]; n.z += N[v * 3 + 2]; }
      return out.divideScalar(patch.length), n.normalize();
    };

    // посадка сумки в кадре 0: на петле в точке at, спиной к ткани
    const atTh = THREE.MathUtils.degToRad(cfg.at < 0 ? cfg.at + 360 : cfg.at);
    let ai = 0;
    loop.forEach((l, i) => { if (Math.abs(l.th - atTh) < Math.abs(loop[ai].th - atTh)) ai = i; });
    const p = new THREE.Vector3(), z = new THREE.Vector3();
    patchPoint(loop[ai].patch, P0, N0, p, z);
    // нормаль пятна может смотреть внутрь (изнанка) — наружу = от центра петли
    if (z.dot(p.clone().sub(C)) < 0) z.negate();
    // оси сумки по нормали спины сумки z; второй проход — z по средней нормали ткани под сумкой,
    // чтобы сумка легла на грудь/спину целиком, а не на касательную в одной точке
    const basis = (z) => {
      let x, y;
      if (cfg.align === 'up') {
        y = u.clone().sub(z.clone().multiplyScalar(u.dot(z))).normalize();
        x = new THREE.Vector3().crossVectors(y, z);
      } else {
        x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), z).normalize();
        x.applyAxisAngle(z, THREE.MathUtils.degToRad(cfg.roll || 0));
        y = new THREE.Vector3().crossVectors(z, x);
      }
      return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p.x, p.y - cfg.drop, p.z);
    };
    // ткань под сумкой (в пределах задней стенки, кадр 0)
    const under = (Binv) => {
      const out = [];
      for (let v = 0; v < nv; v++) {
        if (arm[v]) continue;
        tmp.fromArray(P0, v * 3).applyMatrix4(Binv);
        if (tmp.x > box.min.x && tmp.x < box.max.x && tmp.y > box.min.y && tmp.y < box.max.y && tmp.z > -0.15 && tmp.z < 0.1) out.push(v);
      }
      return out;
    };
    let B0 = basis(z), foot = under(B0.clone().invert());
    const zn = new THREE.Vector3(), nv3 = new THREE.Vector3();
    for (const v of foot) {
      nv3.fromArray(N0, v * 3);
      if (nv3.dot(tmp.fromArray(P0, v * 3).sub(C)) < 0) nv3.negate();
      zn.add(nv3);
    }
    // тяжёлая сумка висит отвесно: спина сумки — по нормали ткани в точке, без наклона
    if (cfg.align === 'level') { z.y = 0; B0 = basis(z.normalize()); } else B0 = basis(zn.normalize());

    // на каждом кадре — насколько ткань под сумкой выступает за заднюю стенку (в осях сумки). Берём 96-й
    // перцентиль, а не максимум: единичные складки, ушедшие на пару мм внутрь, закрыты самой сумкой
    const rawFor = (B, foot) => F.map((Pf, f) => {
      const inv = T[f].clone().multiply(B).invert();
      const zs = foot.map((v) => tmp.fromArray(Pf, v * 3).applyMatrix4(inv).z).sort((p, q) => q - p);
      return zs[Math.floor(zs.length * 0.04)];
    });
    // наклон вокруг верхней кромки: низ сумки отходит от спины (подол/таз выступают), верх прижат к ткани.
    // Перебором — угол с наименьшим отступом за цикл, лишний градус штрафуется
    let tilt = 0;
    if (cfg.tilt) {
      const top = box.max.y;
      const tilted = (deg) => B0.clone().multiply(new THREE.Matrix4().makeTranslation(0, top, 0))
        .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(-deg))).multiply(new THREE.Matrix4().makeTranslation(0, -top, 0));
      let best = Infinity;
      for (let deg = 0; deg <= cfg.tilt; deg += 2) {
        const B = tilted(deg), cost = Math.max(...rawFor(B, under(B.clone().invert()))) + deg * 0.001;
        if (cost < best) { best = cost; tilt = deg; }
      }
      B0 = tilted(tilt);
    }
    const B0inv = B0.clone().invert();
    foot = under(B0inv);
    const raw = rawFor(B0, foot);
    // по кругу цикла: максимум в окне ±2 кадра, потом среднее — гладко и не ниже ткани
    const mx = raw.map((_, f) => Math.max(...[-2, -1, 0, 1, 2].map((k) => raw[(f + k + nf) % nf])));
    const push = mx.map((_, f) => [-2, -1, 0, 1, 2].reduce((s, k) => s + mx[(f + k + nf) % nf], 0) / 5 + cfg.clearance);

    // ремень — точки петли, не закрытые сумкой; концы — к креплениям, ближнее к ближнему
    const inBag = (q) => { tmp.copy(q).applyMatrix4(B0inv); return tmp.x > box.min.x - 0.02 && tmp.x < box.max.x + 0.02 && tmp.y > box.min.y - 0.02 && tmp.y < box.max.y + 0.02 && tmp.z > -0.12; };
    const free = loop.map((l) => !inBag(l.p));
    let start = free.findIndex((ok, i) => ok && !free[(i - 1 + loop.length) % loop.length]);
    if (start < 0) start = 0;
    const run = [];
    for (let k = 0; k < loop.length && free[(start + k) % loop.length]; k++) run.push(loop[(start + k) % loop.length]);
    const att = cfg.attach.map((a) => new THREE.Vector3(...a).multiply(sc));
    const attW = att.map((a) => a.clone().applyMatrix4(B0));
    if (attW[0].distanceTo(run[0].p) + attW[1].distanceTo(run.at(-1).p) > attW[1].distanceTo(run[0].p) + attW[0].distanceTo(run.at(-1).p)) att.reverse();

    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.add(model);
    hoodie.mesh.add(holder);
    const strap = makeStrap(cfg.strap, run.length + 2);
    hoodie.mesh.add(strap.mesh);
    // маятник: подвес — середина верхней кромки, длина — до центра сумки
    const pivot = new THREE.Vector3(0, box.max.y, (box.min.z + box.max.z) / 2);
    const swing = { pivot, L: Math.max(0.08, (box.max.y - box.min.y) * 0.6), ax: 0, az: 0, wx: 0, wz: 0, dy: 0, wy: 0, prev: null, vprev: null };
    bags[name] = { holder, strap, run, att, B0, push, cfg, swing, group: holder, visible: true,
      info: { box: [box.min.toArray(), box.max.toArray()], loop: loop.map((l) => [+l.th.toFixed(2), l.patch.length, ...l.p.toArray().map((x) => +x.toFixed(3))]), free, raw, push, tilt, foot: foot.length, arm: arm.reduce((s, x) => s + x, 0), B0: B0.elements.map((x) => +x.toFixed(3)) } };
  });

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Pv = new THREE.Vector3(), Cw = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const pts = [], nrms = [], sm = [], smn = [];
  const base = new THREE.Matrix4(), rot = new THREE.Matrix4(), pw = new THREE.Vector3(), v = new THREE.Vector3(), acc = new THREE.Vector3();
  const xb = new THREE.Vector3(), zb = new THREE.Vector3();
  let lastTime = null;
  // шаг маятника: ускорение подвеса (в осях худи, человек на месте — дорожка едет) раскачивает углы
  // выход за предел мягкой зоны (последние 30% диапазона) — квадратично растущая сила к центру
  const soft = (x, lo, hi) => {
    const m = 0.3 * (hi - lo) / 2;
    if (x > hi - m) return ((x - (hi - m)) / m) ** 2;
    if (x < lo + m) return -((((lo + m) - x) / m) ** 2);
    return 0;
  };
  function swingStep(bag, dt) {
    const s = bag.swing, c = bag.cfg.swing || { hz: 2, damp: 0.5, gain: 0.6, max: 0.1, bounce: 0.6, bhz: 3 };
    pw.copy(s.pivot).applyMatrix4(base);
    if (!s.prev || dt <= 0) { s.prev = pw.clone(); s.vprev = null; return; }
    v.subVectors(pw, s.prev).divideScalar(dt); s.prev.copy(pw);
    if (!s.vprev) { s.vprev = v.clone(); return; }
    acc.subVectors(v, s.vprev).divideScalar(dt); s.vprev.copy(v);
    if (acc.length() > 60) acc.setLength(60);                   // рывок времени (вкладка спала) — не взрываться
    xb.setFromMatrixColumn(base, 0).normalize(); zb.setFromMatrixColumn(base, 2).normalize();
    const w0 = 2 * Math.PI * c.hz, k = w0 * w0, d = 2 * c.damp * w0;
    // на инерцию низ отстаёт: ускорение подвеса вперёд по zb -> низ уходит назад (−ax)
    const fx = -c.gain * acc.dot(zb) / s.L, fz = -c.gain * acc.dot(xb) / s.L;
    // ремень тянется: вертикальное ускорение плеч (шаг) -> сумка отстаёт по высоте и пружинит
    const wb = 2 * Math.PI * c.bhz, kb = wb * wb, db = 2 * 0.35 * wb, fy = -c.bounce * acc.y;
    for (let i = 0, n = Math.ceil(dt / 0.004); i < n; i++) {    // мелкие шаги — устойчиво при любом fps
      const h = dt / n;
      s.wx += (fx - k * s.ax - d * s.wx) * h; s.ax += s.wx * h;
      s.wz += (fz - k * s.az - d * s.wz) * h; s.az += s.wz * h;
      // мягкие упоры: у края жёсткость растёт, до жёсткой стенки пружина не доходит
      s.wx -= (soft(s.ax, -FLAT, c.max) * 400) * h;
      s.wz -= (soft(s.az, -c.max, c.max) * 400) * h;
      s.wy += (fy - kb * s.dy - db * s.wy) * h - soft(s.dy, -0.02, 0.012) * 4e4 * h; s.dy += s.wy * h;
      if (s.ax < -FLAT) { s.ax = -FLAT; s.wx = Math.max(s.wx, 0); }   // в тело — всё-таки никогда
    }
  }
  function update(time) {
    const dt = lastTime === null ? 0 : THREE.MathUtils.clamp(time - lastTime, 0, 0.05);
    lastTime = time;
    const fr = ((time / hoodie.duration) % 1 + 1) % 1 * nf;
    const a = Math.floor(fr) % nf, b = (a + 1) % nf, k = fr - Math.floor(fr);
    Pv.lerpVectors(torsoKeys[a].p, torsoKeys[b].p, k);
    Q.slerpQuaternions(torsoKeys[a].q, torsoKeys[b].q, k);
    M.compose(Pv, Q, one);
    Cw.set(0, 1.2, -0.02).applyMatrix4(M);
    const P = pos.array, N = nrm.array;
    for (const bag of Object.values(bags)) {
      bag.holder.visible = bag.strap.mesh.visible = bag.visible;
      if (!bag.visible) {   // снятая сумка: при следующем надевании физика начинается с покоя, без рывка
        Object.assign(bag.swing, { prev: null, vprev: null, ax: 0, az: 0, dy: 0, wx: 0, wz: 0, wy: 0 });
        continue;
      }
      const push = bag.push[a] + (bag.push[b] - bag.push[a]) * k;
      base.copy(M).multiply(bag.B0).multiply(new THREE.Matrix4().makeTranslation(0, 0, push));
      swingStep(bag, dt);
      // поворот вокруг подвеса: +ax — низ от тела (по +z сумки), az — низ вбок (по +x)
      const sw = bag.swing;
      rot.makeTranslation(sw.pivot.x, sw.pivot.y + sw.dy, sw.pivot.z)
        .multiply(new THREE.Matrix4().makeRotationX(-sw.ax)).multiply(new THREE.Matrix4().makeRotationZ(sw.az))
        .multiply(new THREE.Matrix4().makeTranslation(-sw.pivot.x, -sw.pivot.y, -sw.pivot.z));
      bag.holder.matrix.copy(base).multiply(rot);
      bag.holder.matrixWorldNeedsUpdate = true;
      const bz = new THREE.Vector3().setFromMatrixColumn(bag.holder.matrix, 2).normalize();
      // точки ремня: крепление, ткань (с отступом), крепление
      const n = bag.run.length + 2;
      while (pts.length < n) { pts.push(new THREE.Vector3()); nrms.push(new THREE.Vector3()); }
      pts[0].copy(bag.att[0]).applyMatrix4(bag.holder.matrix); nrms[0].copy(bz);
      bag.run.forEach((l, i) => {
        const q = pts[i + 1], nn = nrms[i + 1];
        q.set(0, 0, 0); nn.set(0, 0, 0);
        for (const v of l.patch) { q.x += P[v * 3]; q.y += P[v * 3 + 1]; q.z += P[v * 3 + 2]; nn.x += N[v * 3]; nn.y += N[v * 3 + 1]; nn.z += N[v * 3 + 2]; }
        q.divideScalar(l.patch.length);
        if (nn.normalize().dot(tmp.copy(q).sub(Cw)) < 0) nn.negate();   // наружу — от оси торса
      });
      pts[n - 1].copy(bag.att[1]).applyMatrix4(bag.holder.matrix); nrms[n - 1].copy(bz);
      // ткань рябит — сглаживаем точки и нормали вдоль ремня (концы на креплениях не трогаем)
      for (let it = 0; it < 2; it++) {
        for (let i = 1; i < n - 1; i++) {
          sm[i] = sm[i] || new THREE.Vector3(); smn[i] = smn[i] || new THREE.Vector3();
          sm[i].copy(pts[i - 1]).add(pts[i + 1]).multiplyScalar(0.25).addScaledVector(pts[i], 0.5);
          smn[i].copy(nrms[i - 1]).add(nrms[i + 1]).addScaledVector(nrms[i], 2).normalize();
        }
        for (let i = 1; i < n - 1; i++) { pts[i].copy(sm[i]); nrms[i].copy(smn[i]); }
      }
      // натяжение: точку в провале между соседями поднимаем к хорде
      for (let it = 0; it < 4; it++) {
        for (let i = 1; i < n - 1; i++) {
          tmp.copy(pts[i - 1]).add(pts[i + 1]).multiplyScalar(0.5);
          const h = tmp.sub(pts[i]).dot(nrms[i]);
          if (h > 0) pts[i].addScaledVector(nrms[i], h);
        }
      }
      const off = bag.cfg.strap.thick / 2 + 0.005;
      for (let i = 1; i < n - 1; i++) pts[i].addScaledVector(nrms[i], off);
      bag.strap.set(pts.slice(0, n), nrms.slice(0, n));
    }
  }
  update(0);
  return { bags, update };
}

// ремень — плоская лента: кривая через точки, в каждом сечении 4 грани (верх, низ, два ребра)
function makeStrap({ width, thick, color, roughness }, nPts) {
  const SEG = Math.max(60, nPts * 4), RING = 8;
  const geo = new THREE.BufferGeometry();
  const P = new Float32Array((SEG + 1) * RING * 3), N = new Float32Array((SEG + 1) * RING * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let s = 0; s < SEG; s++) {
    for (let f = 0; f < 4; f++) {
      const a = s * RING + f * 2, b = a + 1, c = a + RING, d = b + RING;
      idx.push(a, c, b, b, c, d);
    }
  }
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 1);
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.frustumCulled = false;

  const curve = new THREE.CatmullRomCurve3([], false, 'centripetal'), ncurve = new THREE.CatmullRomCurve3([], false, 'centripetal');
  const c = new THREE.Vector3(), t = new THREE.Vector3(), n = new THREE.Vector3(), bv = new THREE.Vector3(), q = new THREE.Vector3();
  const hw = width / 2, ht = thick / 2;
  // грани: [смещение по n, по b] для двух вершин и нормаль
  const faces = [[[ht, -hw], [ht, hw], 'n'], [[ht, hw], [-ht, hw], 'b'], [[-ht, hw], [-ht, -hw], '-n'], [[-ht, -hw], [ht, -hw], '-b']];
  function set(points, normals) {
    curve.points = points;
    ncurve.points = points.map((p, i) => p.clone().addScaledVector(normals[i], 0.05));
    for (let s = 0; s <= SEG; s++) {
      const u = s / SEG;
      curve.getPoint(u, c); curve.getTangent(u, t);
      ncurve.getPoint(u, n); n.sub(c); n.sub(q.copy(t).multiplyScalar(n.dot(t))).normalize();
      bv.crossVectors(t, n);
      faces.forEach(([v1, v2, axis], f) => {
        const fn = axis === 'n' ? n : axis === '-n' ? q.copy(n).negate() : axis === 'b' ? bv : q.copy(bv).negate();
        [v1, v2].forEach(([on, ob], j) => {
          const i = (s * RING + f * 2 + j) * 3;
          P[i] = c.x + n.x * on + bv.x * ob; P[i + 1] = c.y + n.y * on + bv.y * ob; P[i + 2] = c.z + n.z * on + bv.z * ob;
          N[i] = fn.x; N[i + 1] = fn.y; N[i + 2] = fn.z;
        });
      });
    }
    geo.attributes.position.needsUpdate = geo.attributes.normal.needsUpdate = true;
  }
  return { mesh, set };
}
