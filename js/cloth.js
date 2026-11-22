// Запечённая симуляция ткани: цикл кадров из Blender, проигрываем с плавным переходом между кадрами
import * as THREE from 'three';

// кадры цикла: позиции и нормали (Float32, кадр за кадром), индексы, UV
async function decodeLoop(base) {
  const [meta, buf] = await Promise.all([
    fetch(base + '.json').then((r) => r.json()),
    fetch(base + '.z').then((r) => new Response(r.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()),
  ]);
  const { vertices: nv, indices: ni, frames: nf, fps, min, max, quant } = meta;
  let off = 0;
  const index = new Uint32Array(buf, off, ni); off += ni * 4;
  const uv = new Float32Array(buf.slice(off, off + nv * 8)); off += nv * 8;
  const delta = new Int16Array(buf.slice(off, off + nf * nv * 6));

  // кадры лежат как остаток от предсказания q[f] = 2q[f-1] - q[f-2], координаты по плоскостям x…, y…, z…
  const P = new Float32Array(nf * nv * 3), N = new Float32Array(nf * nv * 3);
  const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const plane = nv * 3;
  const q = new Int32Array(nf * plane);
  for (let f = 0; f < nf; f++) {
    for (let i = 0; i < plane; i++) {
      const j = f * plane + i;
      const p = f === 0 ? 0 : f === 1 ? q[j - plane] : 2 * q[j - plane] - q[j - 2 * plane];
      q[j] = delta[j] + p;
      const c = (i / nv) | 0, v = i - c * nv;
      P[f * plane + v * 3 + c] = min[c] + (q[j] * quant / 65535) * span[c];
    }
  }

  // нормали считаем сами; вершины на швах UV с одной позицией сшиваем, чтобы не было рубцов
  const weld = new Uint32Array(nv), seen = new Map();
  for (let v = 0; v < nv; v++) {
    const key = `${q[v]},${q[nv + v]},${q[2 * nv + v]}`;
    if (!seen.has(key)) seen.set(key, v);
    weld[v] = seen.get(key);
  }
  for (let f = 0; f < nf; f++) {
    const o = f * plane;
    for (let t = 0; t < ni; t += 3) {
      const a = o + index[t] * 3, b = o + index[t + 1] * 3, c = o + index[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (let k = 0; k < 3; k++) {
        const w = o + weld[index[t + k]] * 3;
        N[w] += nx; N[w + 1] += ny; N[w + 2] += nz;
      }
    }
    for (let v = 0; v < nv; v++) {
      const w = o + weld[v] * 3, d = o + v * 3;
      const len = Math.hypot(N[w], N[w + 1], N[w + 2]) || 1;
      if (weld[v] === v) { N[d] /= len; N[d + 1] /= len; N[d + 2] /= len; }
    }
    for (let v = 0; v < nv; v++) {
      if (weld[v] === v) continue;
      const w = o + weld[v] * 3, d = o + v * 3;
      N[d] = N[w]; N[d + 1] = N[w + 1]; N[d + 2] = N[w + 2];
    }
  }
  return { P, N, index, uv, nv, nf, fps, min, max };
}

// alt — тот же цикл с другой посадкой (худи с согнутыми локтями, dev/elbow.py): вершины, которые в нём сдвинуты,
// плавно смешиваются с основой, отдельно для левой (+x) и правой стороны — setAlt('left'|'right', вкл/выкл)
export async function loadClothLoop(base, { color = '#2a2c33', fabric, fabricRepeat = 6.8, map, roughness = 0.92, sheen = 0.6, alt } = {}) {
  const [{ P, N, index, uv, nv, nf, fps, min, max }, A] = await Promise.all([decodeLoop(base), alt ? decodeLoop(alt) : null]);

  const geo = new THREE.BufferGeometry();
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const position = new THREE.BufferAttribute(P.slice(0, nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const normal = new THREE.BufferAttribute(N.slice(0, nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', position);
  geo.setAttribute('normal', normal);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2), 1.2);

  const mat = new THREE.MeshPhysicalMaterial({
    color, roughness, metalness: 0, side: THREE.DoubleSide,
    sheen, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25),
  });
  // изнанка (внутри капюшона, в рукавах) — как подкладка в тени: без блеска и бликов окружения,
  // иначе по краям проёма светятся голубоватые «стеклянные» полосы
  mat.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb *= 0.55;')
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
if (!gl_FrontFacing) {
  material.specularColor *= 0.15;
  material.specularF90 *= 0.15;
  #ifdef USE_SHEEN
  material.sheenColor *= 0.15;
  #endif
}`);
  };
  if (fabric) {
    const tex = await new THREE.TextureLoader().loadAsync(fabric);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(fabricRepeat, fabricRepeat);
    mat.bumpMap = tex;
    mat.bumpScale = 0.6;
  }
  if (map) {
    const tex = await new THREE.TextureLoader().loadAsync(map);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false; // UV из glTF
    tex.anisotropy = 8;
    mat.map = tex;
  }
  const mesh = new THREE.Mesh(geo, mat);

  // вершины, сдвинутые в alt хотя бы на одном кадре (> 1 мм), и сторона по кадру 0
  const moved = [], side = [];
  if (A) {
    for (let v = 0; v < nv; v++) {
      let d = 0;
      for (let f = 0; f < nf && d < 1e-6; f++) {
        const o = f * nv * 3 + v * 3;
        d = Math.max(d, (A.P[o] - P[o]) ** 2 + (A.P[o + 1] - P[o + 1]) ** 2 + (A.P[o + 2] - P[o + 2]) ** 2);
      }
      if (d >= 1e-6) { moved.push(v); side.push(P[v * 3] > 0 ? 0 : 1); }
    }
  }
  const altTarget = [0, 0], altNow = [0, 0];   // 0 — левая, 1 — правая
  const ease = (t) => t * t * (3 - 2 * t);

  const duration = nf / fps;
  let last = null;
  function update(time) {
    const f = ((time / duration) % 1 + 1) % 1 * nf;
    const a = Math.floor(f) % nf, b = (a + 1) % nf, k = f - Math.floor(f);
    const pa = a * nv * 3, pb = b * nv * 3, p = position.array, n = normal.array;
    for (let i = 0; i < nv * 3; i++) {
      p[i] = P[pa + i] + (P[pb + i] - P[pa + i]) * k;
      n[i] = N[pa + i] + (N[pb + i] - N[pa + i]) * k;
    }
    if (A) {
      // сгиб/разгиб за ~0.45 с; время может прыгать (пауза, ?t=) — шаг ограничен
      const dt = last === null ? 1 : Math.min(Math.max(time - last, 0), 0.1);
      last = time;
      for (let s = 0; s < 2; s++) {
        const step = dt / 0.45;
        altNow[s] = altTarget[s] > altNow[s] ? Math.min(altTarget[s], altNow[s] + step) : Math.max(altTarget[s], altNow[s] - step);
      }
      const w = [ease(altNow[0]), ease(altNow[1])];
      if (w[0] > 0 || w[1] > 0) {
        for (let j = 0; j < moved.length; j++) {
          const ws = w[side[j]];
          if (!ws) continue;
          const i0 = moved[j] * 3;
          for (let c = 0; c < 3; c++) {
            const i = i0 + c;
            const ap = A.P[pa + i] + (A.P[pb + i] - A.P[pa + i]) * k, an = A.N[pa + i] + (A.N[pb + i] - A.N[pa + i]) * k;
            p[i] += (ap - p[i]) * ws;
            n[i] += (an - n[i]) * ws;
          }
        }
      }
    }
    position.needsUpdate = normal.needsUpdate = true;
  }
  // instant — без анимации (первый кадр, скриншоты с ?t=)
  function setAlt(which, on, instant = false) {
    const s = which === 'left' ? 0 : 1;
    altTarget[s] = on ? 1 : 0;
    if (instant) altNow[s] = altTarget[s];
  }
  const altWeight = (which) => ease(altNow[which === 'left' ? 0 : 1]);
  update(0);
  return { mesh, update, duration, frames: nf, setAlt, altWeight };
}
