import { initShowcase } from './showcase.js';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- служебная графика: спрайт встраиваем в страницу, чтобы <use href="#id"> брал шрифты и стили страницы ----------
fetch('assets/stickers.svg').then((r) => r.text()).then((svg) => {
  const box = document.createElement('div');
  box.hidden = true;
  box.innerHTML = svg;
  document.body.prepend(box);
});

// ---------- тема ----------
const themeBtn = document.querySelector('.theme');
const isLight = () => root.dataset.theme !== 'dark';  // по умолчанию светлая
function syncTheme() {
  const light = isLight();
  themeBtn.setAttribute('aria-checked', String(light));
  document.querySelector('meta[name="theme-color"]').content = light ? '#ecebe6' : '#050505';
}
themeBtn.addEventListener('click', () => {
  root.dataset.theme = isLight() ? 'dark' : 'light';
  try { localStorage.setItem('theme-v2', root.dataset.theme); } catch (e) {}
  syncTheme();
});
syncTheme();

// ---------- заголовки «пробиваются» сквозь шум ----------
const GLYPHS = '#%&@$*+=/\\|01';
function decode(el) {
  if (reduced) return;
  const nodes = [];
  const walk = (n) => n.childNodes.forEach((c) => (c.nodeType === 3 ? nodes.push([c, c.textContent]) : walk(c)));
  walk(el);
  const t0 = performance.now(), D = 700;
  (function tick(now) {
    const p = Math.min((now - t0) / D, 1);
    for (const [node, text] of nodes) {
      node.textContent = [...text].map((ch, i) => (/\s/.test(ch) || i / text.length < p * 1.15 - 0.15 ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
    }
    if (p < 1) requestAnimationFrame(tick);
    else for (const [node, text] of nodes) node.textContent = text;
  })(t0);
}

// ---------- появление при прокрутке ----------
const seen = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    en.target.classList.add('is-in');
    en.target.querySelectorAll('[data-decode]').forEach(decode);
    seen.unobserve(en.target);
  }
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el) => seen.observe(el));

// ---------- 3D-витрина: грузим, когда карточка близко ----------
function whenNear(el, fn, margin = '600px') {
  const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); fn(); } }, { rootMargin: margin });
  io.observe(el);
}
document.querySelectorAll('.product').forEach((a) => whenNear(a, () => initShowcase(a).catch(console.error)));
