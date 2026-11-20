/* 3D-printed zeolite monoliths: page logic and real-time 3D tour.
   All numbers come from data.js (generated from the corrected GC workbook). */
{
'use strict';
const D = window.SDP_DATA;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const PI = Math.PI, TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const eio = t => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eout = t => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
let seed = 20261120;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const runOf = (k, T) => D[k].runs.find(r => r.T === T);
const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2);
const NB = ' ';

const SAMPLES = {
  parent: { name: 'Parent ZSM‑5', note: 'crushed grains', col: '#3b3430' },
  zr1a: { name: 'ZR‑1A', note: '70/30, 80 % infill', col: '#ffa06b' },
  zr2a: { name: 'ZR‑2A', note: '80/20, 80 % infill', col: '#ff5a1f' },
  zr2b: { name: 'ZR‑2B', note: '80/20, 60 % infill', col: '#b8340b' },
  blank: { name: 'No catalyst', note: 'empty tube', col: '#cfc5bb' },
  rb: { name: 'Red bentonite', note: 'clay alone', col: '#b97e5b' }
};
const CATS = [
  { k: 'prop', name: 'Propylene', col: '#ff5a1f', ink: '#1a0b05' },
  { k: 'eth', name: 'Ethylene', col: '#6f93b8', ink: '#fff' },
  { k: 'but', name: 'Butenes', col: '#d9a93f', ink: '#1a0b05' },
  { k: 'dry', name: 'Dry gas', col: '#a1978f', ink: '#1a0b05' },
  { k: 'other', name: 'Other', col: '#5f5650', ink: '#fff' }
];
const ZSM = ['parent', 'zr1a', 'zr2a', 'zr2b'];

/* ---------- Toolpath of the printed piece (from the Cura settings) ---------- */
const PIECE = { rOut: 5.05, rIn: 3.85, clip: 3.4, lw: 1.2, layers: 15 };
const BANDS = new Set([2, 3, 5, 6, 9, 10, 12, 13]); // 4 zigzag bands of 2 layers, as in the Cura cutting meshes
const ZIG = 90 - 22; // Cura measures infill line directions from the Y axis
function layerSegs(L, dens) {
  const S = [];
  const ring = (r, n) => {
    const a0 = L * 0.61 + (r < 4.5 ? 0.3 : 0);
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU, b = a0 + (i + 1) / n * TAU;
      S.push([r * Math.cos(a), r * Math.sin(a), r * Math.cos(b), r * Math.sin(b), 0]);
    }
  };
  ring(PIECE.rOut, 56);
  ring(PIECE.rIn, 44);
  const fam = (deg, sp, zig) => {
    const a = deg * D2R, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, c = PIECE.clip, out = [];
    const km = Math.ceil(c / sp);
    for (let k = -km; k <= km; k++) {
      const o = k * sp;
      if (Math.abs(o) > c - 0.3) continue;
      const h = Math.sqrt(c * c - o * o);
      out.push([nx * o - dx * h, ny * o - dy * h, nx * o + dx * h, ny * o + dy * h]);
    }
    out.forEach((s, i) => {
      const f = i % 2 ? [s[2], s[3], s[0], s[1]] : s;
      S.push([f[0], f[1], f[2], f[3], 1]);
      if (zig && i < out.length - 1) {
        const n = out[i + 1];
        const st = (i + 1) % 2 ? [n[2], n[3]] : [n[0], n[1]];
        S.push([f[2], f[3], st[0], st[1], 1]);
      }
    });
  };
  if (BANDS.has(L)) fam(ZIG, PIECE.lw / dens, true);
  else { const sp = PIECE.lw / dens * 2; fam(45, sp, false); fam(135, sp, false); }
  return S;
}
function topSVG(dens, band) {
  const ln = layerSegs(band ? 2 : 0, dens).filter(s => s[4] === 1)
    .map(s => `<line x1="${s[0].toFixed(2)}" y1="${(-s[1]).toFixed(2)}" x2="${s[2].toFixed(2)}" y2="${(-s[3]).toFixed(2)}"/>`).join('');
  return `<circle r="5.75" class="tv-bg"/><g class="tv-f"><circle r="${PIECE.rOut}"/><circle r="${PIECE.rIn}"/>${ln}</g>`;
}
function grainsSVG() {
  let s = 41;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pts = [];
  let tries = 0, out = '';
  while (pts.length < 70 && tries < 8000) {
    tries++;
    const R = 0.4 + r() * 0.32, a = r() * TAU, d = Math.sqrt(r()) * (5.45 - R);
    const x = d * Math.cos(a), y = d * Math.sin(a);
    if (pts.some(p => Math.hypot(p[0] - x, p[1] - y) < p[2] + R + 0.07)) continue;
    pts.push([x, y, R]);
  }
  for (const [x, y, R] of pts) {
    const n = 5 + Math.floor(r() * 3), rot = r() * TAU;
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = rot + i / n * TAU, rr = R * (0.72 + r() * 0.32);
      d += (i ? 'L' : 'M') + (x + rr * Math.cos(a)).toFixed(2) + ' ' + (y + rr * Math.sin(a)).toFixed(2);
    }
    out += `<path d="${d}Z"/>`;
  }
  return `<circle r="5.75" class="tv-bg"/><g fill="#e4d5c1">${out}</g>`;
}

/* ---------- Static drawings ---------- */
try {
  $$('.tvs').forEach(sv => { sv.innerHTML = topSVG(+sv.dataset.d, sv.dataset.b === '1'); });
  const lat = $('#latticeSvg'); if (lat) lat.innerHTML = topSVG(0.8, false);
  const gr = $('#grainsSvg'); if (gr) gr.innerHTML = grainsSVG();
  const fb = $('#fallbackSvg'); if (fb) fb.innerHTML = topSVG(0.8, false);
} catch (e) { console.warn(e); }

/* ---------- Nav ---------- */
try {
  const nav = $('#nav'), hero = $('#top');
  const onScroll = () => nav.classList.toggle('solid', window.scrollY > hero.offsetHeight - 70);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
} catch (e) { console.warn(e); }

/* ---------- Test rig ---------- */
const ICON = {
  n2: '<svg viewBox="0 0 30 30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="8" width="10" height="19" rx="4"/><path d="M13 8V5h4v3M15 5V2.5M11.5 3h7"/></svg>',
  sat: '<svg viewBox="0 0 30 30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4v16a4 4 0 0 0 8 0V4M8 4h14M11 13h8"/><circle cx="15" cy="18" r="1.1"/><circle cx="13.6" cy="15.2" r=".8"/><circle cx="16.4" cy="9.5" r=".8"/></svg>',
  rx: '<svg viewBox="0 0 30 30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="11" width="16" height="12" rx="2"/><path d="M2 17h26M11 5.5c1 1 1 2.2 0 3.2M15 5c1 1 1 2.2 0 3.2M19 5.5c1 1 1 2.2 0 3.2"/></svg>',
  bag: '<svg viewBox="0 0 30 30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10h14l-1.5 16h-11z"/><path d="M13 10V6h4v4M15 6V3"/></svg>',
  gc: '<svg viewBox="0 0 30 30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="22" height="20" rx="3"/><path d="M7 21h2l2-9 2 9h2l2-12 2 12h4"/></svg>'
};
const RIG = [
  { id: 'n2', name: 'N₂ feed', short: 'N₂ feed', sub: 'flow controller', figs: [['100', 'mL/min of N₂']],
    text: 'A flow controller keeps the nitrogen (N₂) flow steady. Before each test we activate the catalyst: air flows over it (about 100 mL/min) while it heats to 500 °C at 10 °C per minute. Then N₂ flushes it for 15–30 minutes.' },
  { id: 'sat', name: 'Saturator', short: 'Saturator', sub: 'n‑heptane, −3 °C', img: 'chiller.jpg', alt: 'Julabo chiller with the glass n-heptane saturator on top', figs: [['−3 °C', 'saturator temperature']],
    text: 'The N₂ bubbles through liquid n‑heptane, kept at about −3 °C by a chiller. It picks up n‑heptane vapour and carries it to the reactor. A bypass lets the N₂ skip the saturator.' },
  { id: 'rx', name: 'Reactor', short: 'Reactor', sub: 'quartz tube furnace', img: 'furnace.jpg', img2: 'tube.jpg', alt: 'Tube furnace holding the quartz reactor tube', alt2: 'Packed quartz tube next to a ruler', figs: [['0.4 g', 'catalyst'], ['500–600 °C', 'test temperatures']],
    text: 'A quartz glass tube, about 10 mm inside, sits in a tube furnace. In the direction of the gas: SiC grains to warm the gas, the catalyst, then glass beads, with glass wool between the layers. Each catalyst is tested at 500, then 550, then 600 °C, heating 10 °C per minute in between.',
    pc: 'A pressure gauge sits before the reactor. A soap‑bubble flowmeter checks the flow after it.' },
  { id: 'bag', name: 'Gas bag', short: 'Gas bag', sub: 'sampling', figs: [['0.5 L', 'gas bag'], ['≈10 min', 'at each temperature']],
    text: 'About 10 minutes after reaching each temperature, we collect the gas leaving the reactor in a 0.5 L gas bag. We flush the syringe and the bag between samples.' },
  { id: 'gc', name: 'GC‑2014', short: 'GC', sub: 'measures the gases', img: 'gc.jpg', alt: 'Shimadzu GC-2014 gas chromatograph', figs: [['0.5 mL', 'injected']],
    text: 'We inject 0.5 mL of the gas into a Shimadzu GC‑2014 gas chromatograph. Helium carries it through a long column that separates the gases, and a flame detector (FID) measures each one. A standard gas with 7 known gases lets us turn the peaks into amounts.' }
];
try {
  const route = $('#route'), panel = $('#panel');
  route.insertAdjacentHTML('beforeend', RIG.map(s => `<button class="st" type="button" data-id="${s.id}" aria-pressed="false"><span class="ic">${ICON[s.id]}</span><span>${s.short}</span><small>${s.sub}</small></button>`).join(''));
  const show = id => {
    const s = RIG.find(x => x.id === id);
    $$('.st', route).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    const figs = s.figs.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    const pic = s.img
      ? `<div class="pimg"><img src="${s.img}" alt="${s.alt}" loading="lazy" decoding="async">${s.img2 ? `<img class="tube" src="${s.img2}" alt="${s.alt2}" loading="lazy" decoding="async">` : ''}</div>`
      : `<div class="pimg ill">${ICON[s.id].replace('<svg ', '<svg style="width:min(200px,60%);height:auto" ')}</div>`;
    panel.innerHTML = `${pic}<div class="ptxt"><h3>${s.name}</h3><div class="figs">${figs}</div><p>${s.text}</p>${s.pc ? `<p class="pc">${s.pc}</p>` : ''}</div>`;
  };
  route.addEventListener('click', e => { const b = e.target.closest('.st'); if (b) show(b.dataset.id); });
  show('rx');
} catch (e) { console.warn(e); }

/* ---------- Results ---------- */
const METRICS = [
  { k: 'prop', t: 'Propylene', pct: true, max: 36, def: 'Share of propylene (C₃H₆) in the products, in mol %. Unreacted n‑heptane is not counted.' },
  { k: 'eth', t: 'Ethylene', pct: true, max: 55, def: 'Share of ethylene (C₂H₄) in the products, in mol %.' },
  { k: 'dry', t: 'Dry gas', pct: true, max: 32, def: 'Methane + ethane, in mol % of the products. Lower is better.' },
  { k: 'pe', t: 'P/E ratio', pct: false, max: 1.8, def: 'Propylene ÷ ethylene. Higher means more propylene for each ethylene.' },
  { k: 'conv', t: 'Conversion', pct: true, max: 100, def: 'How much of the n‑heptane reacted: 100 − the n‑heptane mol % left in the gas.' }
];
const sel = { m: 'prop', T: 500 };
const fmtM = (m, v) => m.pct ? f1(v) + NB + '%' : f2(v);

function drawDB() {
  const svg = $('#dbSvg'); if (!svg) return;
  const W = svg.clientWidth, H = svg.clientHeight; if (!W || !H) return;
  const narrow = W < 520;
  const ml = narrow ? 64 : 80, mr = narrow ? 82 : 104, mt = 8, mb = 34;
  const x0 = 10, x1 = 35, pw = W - ml - mr;
  const X = v => ml + (v - x0) / (x1 - x0) * pw;
  const temps = [500, 550, 600], rh = (H - mt - mb) / temps.length;
  let s = '';
  const ticks = narrow ? [10, 20, 30] : [10, 15, 20, 25, 30, 35];
  ticks.forEach(t => { s += `<line x1="${X(t)}" x2="${X(t)}" y1="${mt}" y2="${H - mb + 4}" stroke="#ece5dd"/><text x="${X(t)}" y="${H - 10}" text-anchor="middle">${t}${t === ticks[ticks.length - 1] ? NB + '%' : ''}</text>`; });
  temps.forEach((T, i) => {
    const y = mt + rh * (i + 0.5);
    const p = runOf('parent', T).prop;
    const pr = ['zr1a', 'zr2a', 'zr2b'].map((k, j) => ({ k, v: runOf(k, T).prop, dy: (j - 1) * 7 }));
    const mx = Math.max(...pr.map(o => o.v)), mn = Math.min(...pr.map(o => o.v));
    s += `<text class="tl" x="${ml - 16}" y="${y + 5}" text-anchor="end">${T}${NB}°C</text>`;
    s += `<line x1="${X(p)}" x2="${X(mx)}" y1="${y}" y2="${y}" stroke="#f6d6c6" stroke-width="12" stroke-linecap="round"/>`;
    s += `<circle cx="${X(p)}" cy="${y}" r="8" fill="${SAMPLES.parent.col}" stroke="#fff" stroke-width="2"/>`;
    pr.forEach(o => { s += `<circle cx="${X(o.v)}" cy="${y + o.dy}" r="7" fill="${SAMPLES[o.k].col}" stroke="#fff" stroke-width="2"><title>${SAMPLES[o.k].name}: ${f1(o.v)} %</title></circle>`; });
    s += `<text class="vl" x="${X(p) - 15}" y="${y + 5}" text-anchor="end" style="fill:#3b3430">${f1(p)}</text>`;
    s += `<text class="vl" x="${X(mx) + 15}" y="${y + 5}" style="fill:#c2410c">${f1(mn)}–${f1(mx)}</text>`;
  });
  svg.innerHTML = s;
}
function renderBars() {
  const m = METRICS.find(x => x.k === sel.m);
  const keys = sel.m === 'conv' ? [...ZSM, 'blank'] : ZSM;
  const box = $('#bars');
  box.innerHTML = keys.map(k => {
    const v = runOf(k, sel.T)[sel.m];
    return `<div class="brow"><div class="nm">${SAMPLES[k].name}<small>${SAMPLES[k].note}</small></div><div class="tr"><b style="width:0;background:${SAMPLES[k].col}" data-w="${clamp(v / m.max * 100, 0, 100).toFixed(2)}"></b></div><div class="v">${fmtM(m, v)}</div></div>`;
  }).join('');
  requestAnimationFrame(() => $$('b[data-w]', box).forEach(b => { b.style.width = b.dataset.w + '%'; }));
  $('#mdef').textContent = m.def + ' At ' + sel.T + NB + '°C.';
  $$('button', $('#metricTabs')).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === sel.m)));
  $$('button', $('#tempTabs')).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.t === sel.T)));
}
function renderStacks() {
  $('#mixHint').textContent = `What came out at ${sel.T}${NB}°C (mol${NB}% of the products).`;
  $('#stacks').innerHTML = ZSM.map(k => {
    const r = runOf(k, sel.T);
    const segs = CATS.map(c => { const v = r[c.k]; return `<b style="width:${v.toFixed(3)}%;background:${c.col};color:${c.ink}" title="${c.name}: ${f1(v)} %">${v >= 13 ? f1(v) : ''}</b>`; }).join('');
    return `<div class="srow"><div class="nm" style="font-weight:600;font-size:15px">${SAMPLES[k].name}</div><div class="stack" role="img" aria-label="${SAMPLES[k].name}: ${CATS.map(c => c.name + ' ' + f1(r[c.k]) + ' percent').join(', ')}">${segs}</div></div>`;
  }).join('');
}
function renderTable() {
  const order = ['parent', 'zr1a', 'zr2a', 'zr2b', 'blank', 'rb'];
  const na = x => x == null ? 'n/a' : x;
  let h = '<thead><tr><th>Sample</th><th>°C</th><th>Conversion %</th><th>Ethylene</th><th>Propylene</th><th>Butenes</th><th>TLO</th><th>Dry gas</th><th>BTX</th><th>P/E</th><th>O/P</th><th>CMR</th></tr></thead><tbody>';
  order.forEach(k => D[k].runs.forEach((r, i) => {
    h += `<tr${i === 0 ? ' class="grp"' : ''}><td>${i === 0 ? SAMPLES[k].name : ''}</td><td>${r.T}</td><td>${f1(r.conv)}</td><td>${f1(r.eth)}</td><td>${f1(r.prop)}</td><td>${f1(r.but)}</td><td>${f1(r.tlo)}</td><td>${f1(r.dry)}</td><td>${f1(r.btx)}</td><td>${r.pe == null ? 'n/a' : f2(r.pe)}</td><td>${f2(r.op)}</td><td>${na(r.cmr)}</td></tr>`;
  }));
  $('#table').innerHTML = h + '</tbody>';
}
try {
  $('#dbLegend').innerHTML = ZSM.map(k => `<li><i style="background:${SAMPLES[k].col}"></i>${SAMPLES[k].name}</li>`).join('');
  $('#metricTabs').innerHTML = METRICS.map(m => `<button type="button" data-m="${m.k}" aria-pressed="false">${m.t}</button>`).join('');
  $('#tempTabs').innerHTML = [500, 550, 600].map(T => `<button type="button" data-t="${T}" aria-pressed="false">${T}${NB}°C</button>`).join('');
  $('#keys').innerHTML = CATS.map(c => `<li><i style="background:${c.col}"></i>${c.name}</li>`).join('') + '<li>Dry gas = methane + ethane. Other = propane, butanes, C₅ and aromatics.</li>';
  $('#metricTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { sel.m = b.dataset.m; renderBars(); } });
  $('#tempTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { sel.T = +b.dataset.t; renderBars(); renderStacks(); } });
  renderBars(); renderStacks(); renderTable();
  const dbo = new ResizeObserver(drawDB); dbo.observe($('#dbSvg'));
  drawDB();
} catch (e) { console.warn(e); }

/* ================= 3D ================= */
let GL = null;
const noGL = e => { console.warn('3D disabled:', e); document.documentElement.classList.add('no-gl'); };
const boot3D = () => { try { GL = init3D(); } catch (e) { noGL(e); } };
if (window.THREE) boot3D();
else {
  const s = document.createElement('script');
  s.src = 'https://unpkg.com/three@0.149.0/build/three.min.js';
  s.onload = boot3D; s.onerror = () => noGL('three.js could not load');
  document.head.appendChild(s);
}
$$('[data-tour]').forEach(b => b.addEventListener('click', () => { if (GL) GL.start(); }));

function init3D() {
  const T = window.THREE;
  if (!T || !T.WebGLRenderer) throw new Error('three.js not loaded');
  if (T.ColorManagement && 'legacyMode' in T.ColorManagement) T.ColorManagement.legacyMode = false;
  const stage = $('#stage'), canvas = $('#gl'), heroEl = $('#top'), tourEl = $('#tour'), flashEl = $('#flash');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(34, 1, 0.1, 4000);
  const C = h => new T.Color(h);
  const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
  const M4 = new T.Matrix4(), o3 = new T.Object3D();

  /* textures */
  function radial(stops, size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  }
  const glowT = radial([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,.55)'], [0.45, 'rgba(255,255,255,.14)'], [1, 'rgba(255,255,255,0)']], 128);
  const dotT = radial([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.9)'], [0.65, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']], 64);
  const mkSprite = (col, s, op) => {
    const m = new T.Sprite(new T.SpriteMaterial({ map: glowT, color: C(col), transparent: true, opacity: op, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    m.scale.setScalar(s); return m;
  };

  /* environment light (soft studio with a warm key and an ember rim) */
  {
    const s = new T.Scene();
    const g = new T.SphereGeometry(60, 32, 16), pos = g.attributes.position, cols = [];
    const top = C('#140c08'), mid = C('#3b2416'), bot = C('#0d0806'), tmp = new T.Color();
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 60; tmp.copy(mid).lerp(y > 0 ? top : bot, Math.abs(y)); cols.push(tmp.r, tmp.g, tmp.b); }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    s.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const panel = (w, h, col, k, x, y, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: C(col).multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
    panel(34, 20, '#fff2e4', 3.2, -26, 30, 26);
    panel(16, 34, '#ff6a2a', 3.6, 30, 6, -24);
    panel(46, 10, '#a9bccc', 0.7, 0, -22, 34);
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(s, 0.04).texture;
    pm.dispose();
  }
  const hemi = new T.HemisphereLight(C('#ffe6cf'), C('#1c0f08'), 0.32); scene.add(hemi);
  const key = new T.DirectionalLight(C('#fff1e3'), 2.0); key.position.set(-34, 46, 30); scene.add(key);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  { const sc = key.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 20; sc.far = 120; sc.updateProjectionMatrix(); }
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.04;
  const rim = new T.PointLight(C('#ff5a1f'), 0, 80, 2); scene.add(rim);
  const acc = new T.PointLight(C('#ffb07a'), 0, 30, 2); scene.add(acc);

  /* worlds */
  const W = {};
  ['macro', 'micro', 'nano', 'surf', 'paste', 'bake', 'rig', 'gc', 'bars'].forEach(k => { W[k] = new T.Group(); W[k].visible = false; scene.add(W[k]); });
  const ATMO = { macro: [null, '#140d0a', 0.0016], micro: ['#1d130e', '#1d130e', 0.034], nano: ['#0c0806', '#0c0806', 0.026], surf: ['#0f0a07', '#0f0a07', 0.02], paste: ['#17100c', '#17100c', 0.003], bake: ['#120c09', '#120c09', 0.003], rig: ['#15100d', '#15100d', 0.0007], gc: ['#0d0a08', '#0d0a08', 0.004], bars: ['#140d0a', '#140d0a', 0.003] };
  const FOGS = {}, BGS = {};
  for (const k in ATMO) { FOGS[k] = new T.FogExp2(C(ATMO[k][1]), ATMO[k][2]); BGS[k] = ATMO[k][0] ? C(ATMO[k][0]) : null; }
  let world = '';
  function setWorld(w) { world = w; for (const k in W) W[k].visible = (k === w); scene.background = BGS[w]; scene.fog = FOGS[w]; }

  /* ---------- MACRO: the printed piece ---------- */
  const piece = new T.Group(); W.macro.add(piece);
  const CAL = C('#ebdfcd'), WET = C('#a59a8c');
  const clay = new T.MeshStandardMaterial({ color: CAL.clone(), roughness: 0.88, metalness: 0, envMapIntensity: 0.45, emissive: C('#ff4a14'), emissiveIntensity: 0 });
  const filGeo = new T.CylinderGeometry(1, 1, 1, 12, 1, true);
  function filMat(s, y, f, out) {
    const x0 = s[0], z0 = -s[1];
    let dx = s[2] - s[0], dz = -(s[3] - s[1]);
    const len = Math.hypot(dx, dz) || 1e-6; dx /= len; dz /= len;
    const L = len * f + 0.34, cx = x0 + dx * len * f / 2, cz = z0 + dz * len * f / 2;
    out.set(-dz * 0.6, dx * L, 0, cx, 0, 0, 0.5, y, dx * 0.6, dz * L, 0, cz, 0, 0, 0, 1);
    return out;
  }
  const layers = [], path = [];
  let pathLen = 0;
  const jit = new T.Color();
  for (let L = 0; L < PIECE.layers; L++) {
    const segs = layerSegs(L, 0.8), y = L + 0.5 - PIECE.layers / 2;
    const im = new T.InstancedMesh(filGeo, clay, segs.length);
    im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
    segs.forEach((s, i) => {
      im.setMatrixAt(i, filMat(s, y, 1, M4));
      jit.setRGB(0.9 + rnd() * 0.1, 0.9 + rnd() * 0.1, 0.9 + rnd() * 0.1); im.setColorAt(i, jit);
      const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
      path.push({ L, i, s, y, a: pathLen, len }); pathLen += len;
    });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    im.userData.n = segs.length;
    const base = im.instanceColor.array.slice(), ao = base.slice(), dep = PIECE.layers - 1 - L;
    segs.forEach((s, i) => { const f = s[4] === 1 ? Math.max(0.3, 1 - 0.22 * dep) : (Math.hypot(s[0], s[1]) < 4.5 ? Math.max(0.55, 1 - 0.1 * dep) : 1); for (let c = 0; c < 3; c++) ao[i * 3 + c] *= f; });
    im.userData.base = base; im.userData.ao = ao;
    piece.add(im); layers.push(im);
  }
  let partial = -1;
  const tip = V();
  function restorePartial() {
    if (partial < 0) return;
    const q = path[partial];
    layers[q.L].setMatrixAt(q.i, filMat(q.s, q.y, 1, M4)); layers[q.L].instanceMatrix.needsUpdate = true; partial = -1;
  }
  function setPrint(p) {
    if (p <= 0) { restorePartial(); layers.forEach(l => { l.count = 0; }); const s = path[0].s; return tip.set(s[0], path[0].y + 0.55, -s[1]); }
    const target = p * pathLen;
    let lo = 0, hi = path.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (path[mid].a <= target) lo = mid; else hi = mid - 1; }
    const cur = path[lo], f = p >= 1 ? 1 : clamp((target - cur.a) / cur.len, 0, 1);
    if (partial !== lo) restorePartial();
    layers[cur.L].setMatrixAt(cur.i, filMat(cur.s, cur.y, Math.max(f, 0.001), M4)); layers[cur.L].instanceMatrix.needsUpdate = true;
    partial = f < 1 ? lo : -1;
    for (let L = 0; L < layers.length; L++) layers[L].count = L < cur.L ? layers[L].userData.n : (L === cur.L ? cur.i + 1 : 0);
    const s = cur.s;
    return tip.set(s[0] + (s[2] - s[0]) * f, cur.y + 0.55, -(s[1] + (s[3] - s[1]) * f));
  }
  function fullPiece() { restorePartial(); layers.forEach(l => { l.count = l.userData.n; l.position.y = 0; }); }
  let aoOn = null;
  function setAO(on) { if (aoOn === on) return; aoOn = on; layers.forEach(l => { l.instanceColor.array.set(on ? l.userData.ao : l.userData.base); l.instanceColor.needsUpdate = true; }); }

  /* nozzle, bed, glow, embers */
  const metal = new T.MeshStandardMaterial({ color: C('#c9ccd0'), metalness: 1, roughness: 0.3, envMapIntensity: 1.3 });
  const nozzle = new T.Group();
  { const cone = new T.Mesh(new T.CylinderGeometry(2.0, 0.6, 4.2, 28), metal); cone.position.y = 2.1;
    const nut = new T.Mesh(new T.CylinderGeometry(3.4, 3.4, 2.2, 6), metal); nut.position.y = 5.3;
    nozzle.add(cone, nut); nozzle.traverse(o => { o.castShadow = true; }); }
  W.macro.add(nozzle);
  const bedTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#3b2c22'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { const v = Math.floor(rnd() * 50); g.fillStyle = `rgba(${110 + v},${84 + v},${62 + v},${(0.05 + rnd() * 0.12).toFixed(3)})`; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2.5, 1 + rnd() * 2.5); }
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 2); return t;
  })();
  const bed = new T.Mesh(new T.BoxGeometry(70, 2, 70), new T.MeshStandardMaterial({ map: bedTex, roughness: 0.95, metalness: 0 }));
  bed.position.y = -PIECE.layers / 2 - 1; bed.receiveShadow = true; W.macro.add(bed);
  const floor = new T.Mesh(new T.PlaneGeometry(80, 80), new T.ShadowMaterial({ color: C('#000000'), opacity: 0.38 }));
  floor.rotation.x = -PI / 2; floor.position.y = -PIECE.layers / 2 - 2.2; floor.receiveShadow = true; W.macro.add(floor);
  const halo = mkSprite('#ff6a2a', 72, 0.3); halo.position.set(0, 0, -14); W.macro.add(halo);
  const NE = 140, ePos = new Float32Array(NE * 3), eSp = new Float32Array(NE);
  for (let i = 0; i < NE; i++) { const a = rnd() * TAU, r = 7 + rnd() * 17; ePos[i * 3] = Math.cos(a) * r; ePos[i * 3 + 1] = -13 + rnd() * 28; ePos[i * 3 + 2] = Math.sin(a) * r - 4; eSp[i] = 0.6 + rnd() * 1.8; }
  const eGeo = new T.BufferGeometry(); eGeo.setAttribute('position', new T.BufferAttribute(ePos, 3));
  const embers = new T.Points(eGeo, new T.PointsMaterial({ map: dotT, color: C('#ff8a4c'), size: 0.55, transparent: true, opacity: 0.75, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true }));
  embers.frustumCulled = false; W.macro.add(embers);

  /* reactor: tube, bed packing, furnace */
  const rx = new T.Group(); W.macro.add(rx);
  const glass = new T.MeshStandardMaterial({ color: C('#eaf4f7'), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.15, envMapIntensity: 2.4, depthWrite: false, side: T.DoubleSide });
  { const tube = new T.Mesh(new T.CylinderGeometry(6, 6, 190, 56, 1, true), glass); tube.rotation.z = PI / 2; rx.add(tube);
    [-95, 95].forEach(x => { const r = new T.Mesh(new T.TorusGeometry(5.5, 0.5, 8, 48), glass); r.position.x = x; r.rotation.y = PI / 2; rx.add(r); }); }
  const sicN = 520, sic = new T.InstancedMesh(new T.IcosahedronGeometry(0.62, 0), new T.MeshStandardMaterial({ color: C('#2a2a30'), metalness: 0.7, roughness: 0.3, flatShading: true, envMapIntensity: 1.6 }), sicN);
  for (let i = 0; i < sicN; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * 4.4; o3.position.set(-47 + rnd() * 30, Math.cos(a) * r, Math.sin(a) * r); o3.rotation.set(rnd() * TAU, rnd() * TAU, rnd() * TAU); o3.scale.set(0.8 + rnd() * 0.6, 0.7 + rnd() * 0.5, 0.8 + rnd() * 0.6); o3.updateMatrix(); sic.setMatrixAt(i, o3.matrix); }
  sic.frustumCulled = false; rx.add(sic);
  const bdN = 150, beads = new T.InstancedMesh(new T.SphereGeometry(1, 16, 12), new T.MeshStandardMaterial({ color: C('#d4e2e8'), metalness: 0.1, roughness: 0.06, envMapIntensity: 2.6 }), bdN);
  for (let i = 0; i < bdN; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * 3.9; o3.position.set(13.8 + rnd() * 18.6, Math.cos(a) * r, Math.sin(a) * r); o3.rotation.set(0, 0, 0); o3.scale.setScalar(0.95 + rnd() * 0.2); o3.updateMatrix(); beads.setMatrixAt(i, o3.matrix); }
  beads.frustumCulled = false; rx.add(beads);
  {
    const wp = [];
    const plug = (x0, x1, n) => { for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * 3.6; const px = x0 + rnd() * (x1 - x0), py = Math.cos(a) * r, pz = Math.sin(a) * r; const d = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.6 + rnd() * 1.0); wp.push(px, py, pz, px + d.x, py + d.y, pz + d.z); } };
    plug(-53, -47, 170); plug(-17, -8.6, 230); plug(8.6, 13.2, 170); plug(33, 38, 170);
    const wg = new T.BufferGeometry(); wg.setAttribute('position', new T.Float32BufferAttribute(wp, 3));
    rx.add(new T.LineSegments(wg, new T.LineBasicMaterial({ color: C('#ffffff'), transparent: true, opacity: 0.5 })));
  }
  { const rod = new T.Mesh(new T.CylinderGeometry(4.6, 4.6, 46, 32), new T.MeshStandardMaterial({ color: C('#dcebf0'), roughness: 0.04, metalness: 0, transparent: true, opacity: 0.35, envMapIntensity: 2.2 })); rod.rotation.z = PI / 2; rod.position.x = 61; rx.add(rod); }
  const furn = new T.Group(); rx.add(furn);
  const insul = new T.MeshStandardMaterial({ color: C('#ece5da'), roughness: 1, metalness: 0, side: T.DoubleSide });
  const shellM = new T.MeshStandardMaterial({ color: C('#9a9fa5'), roughness: 0.42, metalness: 0.55, side: T.DoubleSide });
  const half = (r, len, mat, upper) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 48, 1, true, upper ? 0 : PI, PI), mat); m.rotation.z = PI / 2; return m; };
  const FL = 112, RI = 22, RO = 29;
  furn.add(half(RI, FL, insul, false), half(RO, FL, shellM, false));
  [-FL / 2, FL / 2].forEach(x => { const w = new T.Mesh(new T.RingGeometry(6.4, RO, 48, 1, PI, PI), insul); w.rotation.y = PI / 2; w.position.x = x; furn.add(w); });
  [1, -1].forEach(sg => { const p = new T.Mesh(new T.PlaneGeometry(FL, RO - RI), insul); p.rotation.x = -PI / 2; p.position.set(0, 0, sg * (RI + RO) / 2); furn.add(p); });
  const coilM = new T.MeshStandardMaterial({ color: C('#3a2318'), roughness: 0.6, metalness: 0.2, emissive: C('#ff4a12'), emissiveIntensity: 0 });
  { const cg = new T.TorusGeometry(RI - 0.9, 0.75, 8, 64, PI); for (let k = 0; k < 6; k++) { const c = new T.Mesh(cg, coilM); c.rotation.set(0, PI / 2, PI); c.position.x = -46 + k * 18.4; furn.add(c); } }
  const furnGlow = [];
  for (let k = 0; k < 5; k++) { const s = mkSprite('#ff5a1f', 46, 0); s.position.set(-40 + k * 20, -13, 0); furn.add(s); furnGlow.push(s); }
  {
    const lidPivot = new T.Group(); lidPivot.position.set(0, 0, -RO); furn.add(lidPivot);
    const lid = new T.Group(); lid.position.set(0, 0, RO); lidPivot.add(lid);
    lid.add(half(RI, FL, insul, true), half(RO, FL, shellM, true));
    [-FL / 2, FL / 2].forEach(x => { const w = new T.Mesh(new T.RingGeometry(6.4, RO, 48, 1, 0, PI), insul); w.rotation.y = PI / 2; w.position.x = x; lid.add(w); });
    [1, -1].forEach(sg => { const p = new T.Mesh(new T.PlaneGeometry(FL, RO - RI), insul); p.rotation.x = PI / 2; p.position.set(0, 0, sg * (RI + RO) / 2); lid.add(p); });
    lidPivot.rotation.x = -1.95;
    const base = new T.Mesh(new T.BoxGeometry(FL + 14, 34, 70), new T.MeshStandardMaterial({ color: C('#b9bec3'), roughness: 0.55, metalness: 0.25 })); base.position.y = -RO - 17; furn.add(base);
    const pnl = new T.Mesh(new T.PlaneGeometry(92, 16), new T.MeshStandardMaterial({ color: C('#2a2d31'), roughness: 0.5, metalness: 0.2 })); pnl.position.set(0, -RO - 19, 35.1); furn.add(pnl);
    for (let k = 0; k < 3; k++) { const d = new T.Mesh(new T.PlaneGeometry(7, 3.2), new T.MeshBasicMaterial({ color: C('#ff2b1c') })); d.position.set(-36 + k * 11, -RO - 15.5, 35.2); furn.add(d); }
  }
  /* gas flow through the tube */
  const NF = 420, fPos = new Float32Array(NF * 3), fCol = new Float32Array(NF * 3), fSp = new Float32Array(NF);
  for (let i = 0; i < NF; i++) { fPos[i * 3] = -95 + rnd() * 190; const a = rnd() * TAU, r = Math.sqrt(rnd()) * 4.6; fPos[i * 3 + 1] = Math.cos(a) * r; fPos[i * 3 + 2] = Math.sin(a) * r; fSp[i] = 0.7 + rnd() * 0.6; }
  const fGeo = new T.BufferGeometry(); fGeo.setAttribute('position', new T.BufferAttribute(fPos, 3)); fGeo.setAttribute('color', new T.BufferAttribute(fCol, 3));
  const flowMat = new T.PointsMaterial({ map: dotT, size: 1.7, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true, fog: false });
  const flow = new T.Points(fGeo, flowMat); flow.frustumCulled = false; rx.add(flow);
  const COOL = C('#a9cdfc'), HOT = C('#ff7a3d'), tmpC = new T.Color();
  function updFlow(dt) {
    for (let i = 0; i < NF; i++) {
      let x = fPos[i * 3];
      const inBed = x > -53 && x < 38;
      x += 26 * fSp[i] * (inBed ? 0.42 : 1) * dt;
      if (x > 95) x = -95;
      fPos[i * 3] = x;
      if (inBed) {
        fPos[i * 3 + 1] += (rnd() - 0.5) * 0.25; fPos[i * 3 + 2] += (rnd() - 0.5) * 0.25;
        const rr = Math.hypot(fPos[i * 3 + 1], fPos[i * 3 + 2]); if (rr > 4.7) { fPos[i * 3 + 1] *= 4.7 / rr; fPos[i * 3 + 2] *= 4.7 / rr; }
      }
      tmpC.copy(COOL).lerp(HOT, sm(seg(x, 0, 9)));
      fCol[i * 3] = tmpC.r; fCol[i * 3 + 1] = tmpC.g; fCol[i * 3 + 2] = tmpC.b;
    }
    fGeo.attributes.position.needsUpdate = true; fGeo.attributes.color.needsUpdate = true;
  }

  /* ---------- MICRO: zeolite crystals and clay ---------- */
  const coffin = new T.LatheGeometry([new T.Vector2(0, -4.6), new T.Vector2(1.45, -3.0), new T.Vector2(1.45, 3.0), new T.Vector2(0, 4.6)], 6);
  const crysM = new T.MeshStandardMaterial({ color: C('#f3eee6'), roughness: 0.3, metalness: 0, flatShading: true, envMapIntensity: 1.15 });
  const NCR = 130, crys = new T.InstancedMesh(coffin, crysM, NCR); crys.frustumCulled = false; W.micro.add(crys);
  let nc = 0;
  const putC = (x, y, z, ax, ay, az, s, order) => { o3.position.set(x, y, z); o3.rotation.set(ax, ay, az, order || 'XYZ'); o3.scale.setScalar(s); o3.updateMatrix(); crys.setMatrixAt(nc++, o3.matrix); };
  const TARGET = V(0, -0.4, -13), LBL_CRY = V(6.2, 2.6, 15), LBL_PL = V(-5.2, -2.6, 22);
  putC(LBL_CRY.x, LBL_CRY.y, LBL_CRY.z, 0.5, 0.9, 1.2, 1.3);
  while (nc < NCR) {
    const x = (rnd() * 2 - 1) * 26, y = (rnd() * 2 - 1) * 16, z = -36 + rnd() * 84;
    if (Math.hypot(x, y) < 4.6 && z > -9) continue;
    if (Math.hypot(x - TARGET.x, y - TARGET.y, z - TARGET.z) < 6) continue;
    if (Math.hypot(x - LBL_CRY.x, y - LBL_CRY.y, z - LBL_CRY.z) < 4.5) continue;
    putC(x, y, z, rnd() * TAU, rnd() * TAU, rnd() * TAU, 0.65 + rnd() * 0.8);
  }
  crys.instanceMatrix.needsUpdate = true;
  const NPL = 220, plates = new T.InstancedMesh(new T.CylinderGeometry(1.9, 1.9, 0.14, 6), new T.MeshStandardMaterial({ color: C('#b97e5b'), roughness: 0.82, metalness: 0, flatShading: true }), NPL);
  plates.frustumCulled = false; W.micro.add(plates);
  let npl = 0;
  const putP = (x, y, z, s, rxx, ryy, rzz) => { o3.position.set(x, y, z); o3.rotation.set(rxx, ryy, rzz, 'XYZ'); o3.scale.set(s, 1, s); o3.updateMatrix(); plates.setMatrixAt(npl++, o3.matrix); };
  putP(LBL_PL.x, LBL_PL.y, LBL_PL.z, 1.3, 1.2, 0.3, 0.2);
  for (let k = 0; k < 4; k++) putP(LBL_PL.x + (rnd() - 0.5) * 3.4, LBL_PL.y + (rnd() - 0.5) * 3.4, LBL_PL.z + (rnd() - 0.5) * 3.4, 0.8 + rnd() * 0.5, rnd() * TAU, rnd() * TAU, rnd() * TAU);
  while (npl < NPL) {
    const x = (rnd() * 2 - 1) * 26, y = (rnd() * 2 - 1) * 16, z = -36 + rnd() * 84;
    if (Math.hypot(x, y) < 3.8 && z > -9) continue;
    if (Math.hypot(x - TARGET.x, y - TARGET.y, z - TARGET.z) < 5) continue;
    putP(x, y, z, 0.6 + rnd() * 0.9, rnd() * TAU, rnd() * TAU, rnd() * TAU);
  }
  plates.instanceMatrix.needsUpdate = true;
  const NM = 320, mPos = new Float32Array(NM * 3), mCol = new Float32Array(NM * 3);
  for (let i = 0; i < NM; i++) { mPos[i * 3] = (rnd() * 2 - 1) * 24; mPos[i * 3 + 1] = (rnd() * 2 - 1) * 15; mPos[i * 3 + 2] = -36 + rnd() * 84; const c = rnd() < 0.3 ? HOT : COOL; mCol[i * 3] = c.r; mCol[i * 3 + 1] = c.g; mCol[i * 3 + 2] = c.b; }
  const mGeo = new T.BufferGeometry(); mGeo.setAttribute('position', new T.BufferAttribute(mPos, 3)); mGeo.setAttribute('color', new T.BufferAttribute(mCol, 3));
  const microGas = new T.Points(mGeo, new T.PointsMaterial({ map: dotT, size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true }));
  microGas.frustumCulled = false; W.micro.add(microGas);
  function updMicroGas(dt) {
    for (let i = 0; i < NM; i++) { let z = mPos[i * 3 + 2] - 1.4 * dt; mPos[i * 3] += (rnd() - 0.5) * 0.08; mPos[i * 3 + 1] += (rnd() - 0.5) * 0.08; if (z < -36) z = 48; mPos[i * 3 + 2] = z; }
    mGeo.attributes.position.needsUpdate = true;
  }

  /* ---------- NANO: a ZSM-5 straight channel (10-ring) with one acid site ---------- */
  const _y = V(), _x = V(), _z = V(), UP = V(0, 1, 0), AXX = V(1, 0, 0);
  function bondM(a, b, r, out) {
    _y.subVectors(b, a); const L = _y.length() || 1e-6; _y.multiplyScalar(1 / L);
    _x.crossVectors(Math.abs(_y.y) < 0.95 ? UP : AXX, _y).normalize();
    _z.crossVectors(_x, _y);
    out.set(_x.x * r, _y.x * L, _z.x * r, (a.x + b.x) / 2, _x.y * r, _y.y * L, _z.y * r, (a.y + b.y) / 2, _x.z * r, _y.z * L, _z.z * r, (a.z + b.z) / 2, 0, 0, 0, 1);
    return out;
  }
  const COLS = { Si: C('#e3cf9f'), O: C('#cf4636'), Al: C('#a58fe8'), H: C('#ffffff'), C: C('#5a5a61') };
  const NRG = 30, RT = 4.4, ROX = 4.85, DZ = 2.7, Z0 = 6;
  const Tp = [];
  for (let i = 0; i < NRG; i++) { Tp.push([]); for (let k = 0; k < 10; k++) { const a = TAU * k / 10 + (i % 2) * PI / 10; Tp[i].push(V(RT * Math.cos(a), RT * Math.sin(a), Z0 - i * DZ)); } }
  const SITE = { i: 7, k: 8 };
  const lat = [], latB = [];
  let siteO = null, siteAl = null, oxyLbl = null;
  const outward = (m, R) => { const r = Math.hypot(m.x, m.y); m.x *= R / r; m.y *= R / r; return m; };
  for (let i = 0; i < NRG; i++) for (let k = 0; k < 10; k++) { const isAl = i === SITE.i && k === SITE.k; lat.push([Tp[i][k], 0.62, isAl ? COLS.Al : COLS.Si]); if (isAl) siteAl = Tp[i][k]; }
  for (let i = 0; i < NRG; i++) for (let k = 0; k < 10; k++) {
    const a = Tp[i][k], b = Tp[i][(k + 1) % 10];
    const o = outward(a.clone().add(b).multiplyScalar(0.5), ROX);
    lat.push([o, 0.44, COLS.O]); latB.push([a, o], [o, b]);
    if (i === SITE.i && k === SITE.k) siteO = o;
    if (i === 3 && k === 3) oxyLbl = o;
    if (i < NRG - 1) {
      const p = i % 2 === 0 ? Tp[i + 1][k] : Tp[i + 1][(k + 1) % 10];
      const o2 = outward(a.clone().add(p).multiplyScalar(0.5), ROX + 0.15);
      lat.push([o2, 0.44, COLS.O]); latB.push([a, o2], [o2, p]);
    }
  }
  const inwardO = V(-siteO.x, -siteO.y, 0).normalize();
  const siteH = siteO.clone().addScaledVector(inwardO.clone().multiplyScalar(0.86).add(V(0, 0, 0.5)).normalize(), 0.98);
  lat.push([siteH, 0.34, COLS.H]); latB.push([siteO, siteH]);
  const latAtoms = new T.InstancedMesh(new T.SphereGeometry(1, 12, 9), new T.MeshStandardMaterial({ roughness: 0.38, metalness: 0.05, envMapIntensity: 1.1 }), lat.length);
  const latBonds = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 8, 1, true), new T.MeshStandardMaterial({ color: C('#cbbfae'), roughness: 0.5, metalness: 0.1 }), latB.length);
  lat.forEach(([p, r, c], i) => { M4.makeScale(r, r, r); M4.setPosition(p); latAtoms.setMatrixAt(i, M4); latAtoms.setColorAt(i, c); });
  latB.forEach(([a, b], i) => latBonds.setMatrixAt(i, bondM(a, b, 0.13, M4)));
  latAtoms.instanceMatrix.needsUpdate = true; latAtoms.instanceColor.needsUpdate = true; latBonds.instanceMatrix.needsUpdate = true;
  latAtoms.frustumCulled = latBonds.frustumCulled = false;
  W.nano.add(latAtoms, latBonds);
  const siteGlow = mkSprite('#ffd0a8', 3.2, 0.6); siteGlow.position.copy(siteH); W.nano.add(siteGlow);
  const burst = mkSprite('#ffe2c8', 1, 0); W.nano.add(burst);

  /* ---------- molecules (shared instanced meshes) ---------- */
  const AT_CAP = 900, BD_CAP = 1400;
  const molGroup = new T.Group();
  const molA = new T.InstancedMesh(new T.SphereGeometry(1, 14, 10), new T.MeshStandardMaterial({ roughness: 0.28, metalness: 0.05, envMapIntensity: 1.2 }), AT_CAP);
  const molB = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 10, 1, true), new T.MeshStandardMaterial({ color: C('#d9d1c7'), roughness: 0.45, metalness: 0.1 }), BD_CAP);
  molA.setColorAt(0, COLS.C); molA.frustumCulled = molB.frustumCulled = false; molA.count = 0; molB.count = 0;
  molGroup.add(molA, molB);
  let na = 0, nb = 0;
  function pA(p, r, c) { if (na >= AT_CAP) return; M4.makeScale(r, r, r); M4.setPosition(p); molA.setMatrixAt(na, M4); molA.setColorAt(na, c); na++; }
  function pB(a, b, r) { if (nb >= BD_CAP || r < 0.004) return; molB.setMatrixAt(nb, bondM(a, b, r, M4)); nb++; }
  function flushMol() { molA.count = na; molB.count = nb; molA.instanceMatrix.needsUpdate = true; molA.instanceColor.needsUpdate = true; molB.instanceMatrix.needsUpdate = true; na = 0; nb = 0; }
  function hydro(c, nbrs, sp2, N) {
    const d = nbrs.map(q => q.clone().sub(c).normalize()), out = [];
    if (sp2) {
      if (d.length === 1) { out.push(d[0].clone().applyAxisAngle(N, TAU / 3), d[0].clone().applyAxisAngle(N, -TAU / 3)); }
      else if (d.length === 2) out.push(d[0].clone().add(d[1]).normalize().negate());
    } else if (d.length === 2) {
      const b = d[0].clone().add(d[1]).normalize().negate(), n = d[0].clone().cross(d[1]).normalize(), a = 54.75 * D2R;
      out.push(b.clone().multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a)), b.clone().multiplyScalar(Math.cos(a)).addScaledVector(n, -Math.sin(a)));
    } else if (d.length === 1) {
      const ax = d[0].clone().negate();
      const p1 = N.clone().addScaledVector(ax, -N.dot(ax)); if (p1.lengthSq() < 1e-6) p1.set(1, 0, 0); p1.normalize();
      const p2 = ax.clone().cross(p1), a = (180 - 109.47) * D2R;
      for (let k = 0; k < 3; k++) { const ph = k * TAU / 3; const perp = p1.clone().multiplyScalar(Math.cos(ph)).addScaledVector(p2, Math.sin(ph)); out.push(ax.clone().multiplyScalar(Math.cos(a)).addScaledVector(perp, Math.sin(a))); }
    } else [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].forEach(v => out.push(V(v[0], v[1], v[2]).normalize()));
    return out.map(u => c.clone().addScaledVector(u, 1.09));
  }
  function chainMol(n, orders, startDown) {
    const atoms = [], bonds = [], Cs = [], a32 = 32 * D2R;
    let p = V();
    for (let j = 0; j < n; j++) {
      if (j > 0) { const L = orders[j - 1] === 2 ? 1.34 : 1.53; const up = ((j - 1) % 2 === 0) !== !!startDown; p = p.clone().add(V(Math.cos(a32) * L, (up ? 1 : -1) * Math.sin(a32) * L, 0)); }
      Cs.push(p); atoms.push({ e: 'C', p });
    }
    const cen = V(); Cs.forEach(c => cen.add(c)); cen.multiplyScalar(1 / n); Cs.forEach(c => c.sub(cen));
    for (let j = 0; j < n - 1; j++) bonds.push([j, j + 1, orders[j] || 1]);
    const N = V(0, 0, 1);
    for (let j = 0; j < n; j++) {
      const nbrs = []; if (j > 0) nbrs.push(Cs[j - 1]); if (j < n - 1) nbrs.push(Cs[j + 1]);
      const sp2 = (j > 0 && orders[j - 1] === 2) || (j < n - 1 && orders[j] === 2);
      hydro(Cs[j], nbrs, sp2, N).forEach(h => { atoms.push({ e: 'H', p: h, c: j }); bonds.push([j, atoms.length - 1, 1]); });
    }
    return { atoms, bonds };
  }
  const wp = []; for (let i = 0; i < 40; i++) wp.push(V());
  const _n = V(), _v = V(), _w = V(), _u = V();
  function drawRigid(tpl, pos, quat, s, ccol) {
    const A = tpl.atoms;
    for (let i = 0; i < A.length; i++) { wp[i].copy(A[i].p).multiplyScalar(s).applyQuaternion(quat).add(pos); pA(wp[i], (A[i].e === 'C' ? 0.56 : 0.34) * s, A[i].e === 'C' ? ccol : COLS.H); }
    _n.set(0, 0, 1).applyQuaternion(quat);
    for (const [a, b, o] of tpl.bonds) {
      if (o === 2) {
        _v.subVectors(wp[b], wp[a]).cross(_n).normalize().multiplyScalar(0.17 * s);
        _w.copy(wp[a]).add(_v); _u.copy(wp[b]).add(_v); pB(_w, _u, 0.085 * s);
        _w.copy(wp[a]).sub(_v); _u.copy(wp[b]).sub(_v); pB(_w, _u, 0.085 * s);
      } else pB(wp[a], wp[b], 0.13 * s);
    }
  }

  /* heptane -> propylene + butane, atom by atom (23 atoms are conserved) */
  const HEP = chainMol(7, [1, 1, 1, 1, 1, 1], false);
  const PRO = chainMol(3, [1, 2], false), BUT = chainMol(4, [1, 1, 1], true);
  const cenOf = idx => { const c = V(); idx.forEach(j => c.add(HEP.atoms[j].p)); return c.multiplyScalar(1 / idx.length); };
  const cP = cenOf([0, 1, 2]), cB = cenOf([3, 4, 5, 6]);
  const U = [], BU = [];
  for (let j = 0; j < 7; j++) U.push({ s: HEP.atoms[j].p.clone(), e: (j < 3 ? PRO.atoms[j].p.clone().add(cP) : BUT.atoms[j - 3].p.clone().add(cB)), el: 'C', fr: j < 3 ? 'P' : 'B' });
  const hepH = c => HEP.atoms.filter(a => a.e === 'H' && a.c === c).map(a => a.p);
  const prodH = (tpl, c, off) => tpl.atoms.filter(a => a.e === 'H' && a.c === c).map(a => a.p.clone().add(off));
  const match = (S, E) => { const used = new Set(); return S.map(s => { let bi = -1, bd = 1e9; E.forEach((e, i) => { if (used.has(i)) return; const d = s.distanceTo(e); if (d < bd) { bd = d; bi = i; } }); used.add(bi); return [s, E[bi]]; }); };
  BU.push([0, 1, 'keep'], [1, 2, 'keep'], [1, 2, 'pi'], [2, 3, 'break'], [3, 4, 'keep'], [4, 5, 'keep'], [5, 6, 'keep']);
  const addH = (s, e, fr, c) => { U.push({ s: s.clone(), e: e.clone(), el: 'H', fr }); BU.push([c, U.length - 1, 'keep']); };
  match(hepH(0), prodH(PRO, 0, cP)).forEach(([s, e]) => addH(s, e, 'P', 0));
  match(hepH(2), prodH(PRO, 2, cP)).forEach(([s, e]) => addH(s, e, 'P', 2));
  let HT = -1;
  {
    const S = hepH(1), E = prodH(PRO, 1, cP)[0];
    const keepI = S[0].distanceTo(E) <= S[1].distanceTo(E) ? 0 : 1;
    addH(S[keepI], E, 'P', 1);
    const BH0 = prodH(BUT, 0, cB), c2 = HEP.atoms[2].p;
    let bi = 0; BH0.forEach((p, i) => { if (p.distanceTo(c2) < BH0[bi].distanceTo(c2)) bi = i; });
    U.push({ s: S[1 - keepI].clone(), e: BH0[bi].clone(), el: 'H', fr: 'B' }); HT = U.length - 1;
    BU.push([1, HT, 'hOld'], [3, HT, 'hNew']);
    match(hepH(3), BH0.filter((_, i) => i !== bi)).forEach(([s, e]) => addH(s, e, 'B', 3));
  }
  [[4, 1], [5, 2], [6, 3]].forEach(([hc, bc]) => match(hepH(hc), prodH(BUT, bc, cB)).forEach(([s, e]) => addH(s, e, 'B', hc)));
  const PV = HEP.atoms[2].p.clone().add(HEP.atoms[3].p).multiplyScalar(0.5);
  const inwardH = V(-siteH.x, -siteH.y, 0).normalize();
  const DOCK = siteH.clone().addScaledVector(inwardH, 2.3);
  const qDock = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(V(0, 0, -1), inwardH.clone(), V(0, 0, -1).cross(inwardH.clone())));
  const START = V(DOCK.x * 0.25, DOCK.y * 0.25, DOCK.z - 46);
  const lp = U.map(() => V()), wq = U.map(() => V());
  const qA = new T.Quaternion(), qR = new T.Quaternion(), mpos = V(), tv = V(), tv2 = V();
  const AXP = V(0.3, 1, 0.4).normalize(), AXB = V(-0.5, 0.2, 1).normalize(), XAX = V(1, 0, 0);
  const cenW = { hep: V(), pro: V(), but: V() };
  function crackFrame(t) {
    const ap = eout(seg(t, 0.4, 4.6));
    mpos.lerpVectors(START, DOCK, ap);
    mpos.x += Math.sin(t * 1.3) * 0.35 * (1 - ap); mpos.y += Math.cos(t * 1.1) * 0.35 * (1 - ap);
    qA.setFromAxisAngle(XAX, (1 - ap) * 5.5 + Math.sin(t * 2.0) * 0.06); qR.copy(qDock).multiply(qA);
    const u = sm(seg(t, 5.15, 6.05));
    const vib = t > 4.4 && t < 5.3 ? Math.sin(t * 60) * 0.06 * seg(t, 4.4, 5.1) : 0;
    const sep = eio(seg(t, 5.9, 11.5));
    cenW.hep.set(0, 0, 0); cenW.pro.set(0, 0, 0); cenW.but.set(0, 0, 0);
    for (let i = 0; i < U.length; i++) {
      const a = U[i];
      lp[i].lerpVectors(a.s, a.e, u);
      if (a.fr === 'B') lp[i].x += vib + 0.5 * seg(t, 5.1, 5.6);
      if (i === HT) lp[i].y += Math.sin(PI * u) * 1.1;
      if (sep > 0) {
        const P = a.fr === 'P', c = P ? cP : cB;
        tv.copy(lp[i]).sub(c);
        qA.setFromAxisAngle(P ? AXP : AXB, sep * (P ? 2.2 : -1.6));
        tv.applyQuaternion(qA).add(c);
        tv.x += P ? -sep * 3.5 : sep * 8.5;
        tv.y += (P ? 2.0 : 0.8) * sep;
        lp[i].copy(tv);
      }
      wq[i].copy(lp[i]).sub(PV).applyQuaternion(qR).add(mpos);
      if (a.el === 'C') { cenW.hep.add(wq[i]); (a.fr === 'P' ? cenW.pro : cenW.but).add(wq[i]); }
    }
    cenW.hep.multiplyScalar(1 / 7); cenW.pro.multiplyScalar(1 / 3); cenW.but.multiplyScalar(1 / 4);
    for (let i = 0; i < U.length; i++) pA(wq[i], U[i].el === 'C' ? 0.56 : 0.34, U[i].el === 'C' ? COLS.C : COLS.H);
    const brk = 1 - seg(t, 5.12, 5.42), pi = seg(t, 5.5, 6.0), hOld = 1 - seg(t, 5.15, 5.45), hNew = seg(t, 5.7, 6.05);
    for (const [ia, ib, kind] of BU) {
      const A = wq[ia], B = wq[ib];
      if (kind === 'pi') {
        if (pi <= 0) continue;
        _n.subVectors(wq[1], wq[0]).cross(tv2.subVectors(wq[2], wq[1])).normalize();
        _v.subVectors(B, A).cross(_n).normalize().multiplyScalar(0.3);
        _w.copy(A).add(_v); _u.copy(B).add(_v); pB(_w, _u, 0.085 * pi);
        continue;
      }
      pB(A, B, 0.13 * (kind === 'break' ? brk : kind === 'hOld' ? hOld : kind === 'hNew' ? hNew : 1));
    }
    const bt = seg(t, 5.15, 5.85);
    burst.position.copy(wq[2]).add(wq[3]).multiplyScalar(0.5);
    burst.scale.setScalar(1 + bt * 10); burst.material.opacity = bt > 0 && bt < 1 ? (1 - bt) * 0.95 : 0;
    const boost = seg(t, 4.3, 5.1) * (1 - seg(t, 5.4, 6.4));
    siteGlow.material.opacity = 0.45 + 0.15 * Math.sin(t * 3) + boost * 0.5;
    siteGlow.scale.setScalar(3.2 + boost * 2.5);
    acc.intensity = 1.2 + boost * 3;
  }

  /* ---------- SURFACE: crystal face with pore mouths, products leaving ---------- */
  { const sf = new T.Mesh(new T.PlaneGeometry(220, 220), new T.MeshStandardMaterial({ color: C('#1c130e'), roughness: 0.9, metalness: 0 })); sf.rotation.x = -PI / 2; W.surf.add(sf); }
  const pores = [];
  for (let r = -9; r <= 6; r++) for (let c = -8; c <= 8; c++) pores.push([c * 6.4 + (Math.abs(r) % 2) * 3.2, r * 6.0]);
  const rings = new T.InstancedMesh(new T.TorusGeometry(1.55, 0.42, 8, 22), new T.MeshStandardMaterial({ color: C('#d9c49b'), roughness: 0.4, metalness: 0.05 }), pores.length);
  const discs = new T.InstancedMesh(new T.CircleGeometry(1.25, 24), new T.MeshBasicMaterial({ color: C('#ff6a2a'), transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false }), pores.length);
  pores.forEach(([x, z], i) => { o3.position.set(x, 0.05, z); o3.rotation.set(-PI / 2, 0, 0); o3.scale.setScalar(1); o3.updateMatrix(); rings.setMatrixAt(i, o3.matrix); o3.position.y = 0.08; o3.updateMatrix(); discs.setMatrixAt(i, o3.matrix); });
  rings.frustumCulled = discs.frustumCulled = false; W.surf.add(rings, discs);
  const visPores = pores.filter(([x, z]) => Math.abs(x) < 20 && z > -22 && z < 9);
  const TPL = { prop: chainMol(3, [1, 2]), eth: chainMol(2, [2]), but: chainMol(4, [2, 1, 1]), dry: chainMol(1, []), other: chainMol(3, [1, 1]) };
  const CATCOL = {}; CATS.forEach(c => { CATCOL[c.k] = C(c.col); });
  const mixSel = { k: 'zr2b', T: 500 };
  const prodMols = [];
  let spawnAcc = 0;
  function spawnMol() {
    const r = runOf(mixSel.k, mixSel.T), w = CATS.map(c => Math.max(0, r[c.k]));
    let x = rnd() * w.reduce((a, b) => a + b, 0), ci = 0;
    while (ci < w.length - 1 && x > w[ci]) { x -= w[ci]; ci++; }
    const cat = CATS[ci].k, pr = visPores[Math.floor(rnd() * visPores.length)];
    prodMols.push({ cat, tpl: TPL[cat], p: V(pr[0], 0.3, pr[1]), v: V((rnd() - 0.5) * 0.9, 2.4 + rnd() * 1.5, 0.4 + rnd() * 0.9), q: new T.Quaternion().setFromEuler(new T.Euler(rnd() * TAU, rnd() * TAU, rnd() * TAU)), ax: V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), w: (rnd() - 0.5) * 2.4, age: 0, life: 6 + rnd() * 2.5 });
  }
  const qS = new T.Quaternion();
  function surfFrame(dt, draw) {
    spawnAcc += dt * 10;
    while (spawnAcc > 1) { spawnAcc -= 1; if (prodMols.length < 72) spawnMol(); }
    for (let i = prodMols.length - 1; i >= 0; i--) {
      const m = prodMols[i]; m.age += dt;
      if (m.age > m.life) { prodMols.splice(i, 1); continue; }
      m.p.addScaledVector(m.v, dt); qS.setFromAxisAngle(m.ax, m.w * dt); m.q.premultiply(qS);
      if (draw) drawRigid(m.tpl, m.p, m.q, Math.min(1, m.age / 0.5) * Math.min(1, (m.life - m.age) / 0.7), CATCOL[m.cat]);
    }
  }

  /* ================= new scenes for the longer tour ================= */
  const benchM = new T.MeshStandardMaterial({ color: C('#302a25'), roughness: 0.82, metalness: 0.05 });
  const whiteM = new T.MeshStandardMaterial({ color: C('#e9eaec'), roughness: 0.55, metalness: 0.05, envMapIntensity: 0.35 });
  const darkM = new T.MeshStandardMaterial({ color: C('#25272b'), roughness: 0.5, metalness: 0.3 });
  const clearM = new T.MeshStandardMaterial({ color: C('#e8f1f5'), roughness: 0.08, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide, envMapIntensity: 2 });
  const DRY = C('#cbbfaf');
  const _q3 = V(), _q4 = V();
  function setShadow(s) { const sc = key.shadow.camera; sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.updateProjectionMatrix(); }
  function textTex(main, col) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 84; const fnt = () => `800 ${fs}px Archivo, 'Arial Narrow', Arial, sans-serif`; g.font = fnt();
    while (g.measureText(main).width > 480 && fs > 36) { fs -= 4; g.font = fnt(); }
    g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(14,9,6,.9)'; g.strokeText(main, 256, 66);
    g.fillStyle = col || '#f3ece2'; g.fillText(main, 256, 66);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  }

  /* ---------- PRINTER: white base and tower, moving arm, print head with a paste tube ---------- */
  const printer = new T.Group(); W.macro.add(printer);
  const BY = -PIECE.layers / 2 - 2;
  {
    const base = new T.Mesh(new T.BoxGeometry(84, 12, 84), whiteM); base.position.y = BY - 6; base.receiveShadow = true; printer.add(base);
    const tower = new T.Mesh(new T.BoxGeometry(40, 112, 14), whiteM); tower.position.set(0, BY - 12 + 56, -49); printer.add(tower);
    const slot = new T.Mesh(new T.PlaneGeometry(24, 92), darkM); slot.position.set(0, BY + 48, -41.9); printer.add(slot);
    const lcd = new T.Mesh(new T.PlaneGeometry(13, 6.5), new T.MeshBasicMaterial({ color: C('#6aa6ff') })); lcd.position.set(27, BY - 6, 42.06); printer.add(lcd);
  }
  const carriage = new T.Mesh(new T.BoxGeometry(14, 11, 4), darkM); printer.add(carriage);
  const arm = new T.Mesh(new T.BoxGeometry(6, 5, 52), whiteM); arm.castShadow = true; printer.add(arm);
  const pasteIn = new T.Mesh(new T.CylinderGeometry(3.15, 3.15, 1, 24), new T.MeshStandardMaterial({ color: C('#a99d8f'), roughness: 0.6, metalness: 0 }));
  const piston = new T.Mesh(new T.CylinderGeometry(3.3, 3.3, 1.4, 24), whiteM);
  {
    const body = new T.Mesh(new T.BoxGeometry(9, 16, 9), whiteM); body.position.y = 14.4; body.castShadow = true;
    const motor = new T.Mesh(new T.BoxGeometry(8.4, 8.4, 8.4), darkM); motor.position.y = 26.6; motor.castShadow = true;
    const tube = new T.Mesh(new T.CylinderGeometry(3.6, 3.6, 30, 32, 1, true), clearM); tube.rotation.z = PI / 2; tube.position.set(-19.5, 17, 0);
    const capG = new T.CylinderGeometry(4.1, 4.1, 1.6, 32);
    [-4.9, -34.1].forEach(x => { const c = new T.Mesh(capG, whiteM); c.rotation.z = PI / 2; c.position.set(x, 17, 0); nozzle.add(c); });
    pasteIn.rotation.z = PI / 2; piston.rotation.z = PI / 2; pasteIn.position.y = 17; piston.position.y = 17;
    nozzle.add(body, motor, tube, pasteIn, piston);
  }
  function updPrinter(p) {
    const n = nozzle.position, ay = n.y + 15;
    carriage.position.set(n.x, ay, -40); arm.position.set(n.x, ay, -13);
    const L = lerp(26, 6, p);
    pasteIn.scale.y = L; pasteIn.position.x = -5.7 - L / 2; piston.position.x = -6.4 - L;
  }

  /* ---------- PASTE: ZSM-5 powder, red bentonite clay and water in a bowl ---------- */
  const PT = { z0: 0.5, z1: 3.4, c0: 3.6, c1: 5.6, w0: 6.0, w1: 7.6, m0: 7.6, m1: 11.6, d0: 10.6, d1: 12.4 };
  const pst = {};
  {
    const g = W.paste;
    const bench = new T.Mesh(new T.BoxGeometry(170, 4, 120), benchM); bench.position.y = -7; bench.receiveShadow = true; g.add(bench);
    const prof = [[0, -5], [8, -5], [12, -3], [14, 2], [14.6, 4], [14, 4.3], [13.2, 2], [11.2, -2.6], [7.5, -4.2], [0, -4.2]].map(([x, y]) => new T.Vector2(x, y));
    const bowl = new T.Mesh(new T.LatheGeometry(prof, 64), new T.MeshStandardMaterial({ color: C('#eef0f2'), roughness: 0.22, metalness: 0, side: T.DoubleSide, envMapIntensity: 1.2 }));
    bowl.castShadow = true; bowl.receiveShadow = true; g.add(bowl);
    const Rin = y => (y < -2.6 ? lerp(7.5, 11.2, (y + 4.2) / 1.6) : lerp(11.2, 13.2, (y + 2.6) / 4.6));
    const NP = 760, nz = Math.round(NP * 0.8);
    pst.parts = new T.InstancedMesh(new T.IcosahedronGeometry(0.46, 1), new T.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), NP);
    pst.parts.frustumCulled = false; pst.parts.castShadow = true; pst.parts.receiveShadow = true; g.add(pst.parts);
    pst.P = [];
    for (let i = 0; i < NP; i++) {
      const s = i < nz ? 0 : 1, y = -3.9 + Math.pow(rnd(), 1.5) * 3.2, r = Math.sqrt(rnd()) * (Rin(y) - 0.8), a = rnd() * TAU;
      const t0 = s === 0 ? lerp(PT.z0, PT.z1 - 0.7, i / nz) : lerp(PT.c0, PT.c1 - 0.7, (i - nz) / (NP - nz));
      pst.P.push({ s, t0, fx: (s ? 5 : -5) + (rnd() - 0.5) * 1.4, fz: -2 + (rnd() - 0.5) * 1.4, fy: 38 + rnd() * 3, a, r, y, sp: 0.8 + rnd() * 0.5 });
    }
    pst.cZ = C('#f2efe8'); pst.cR = C('#9a5638'); pst.cP = C('#b3a291'); pst.tc = new T.Color();
    pst.parts.setColorAt(0, pst.cZ);
    const NW = 90;
    pst.water = new T.InstancedMesh(new T.SphereGeometry(0.38, 10, 8), new T.MeshStandardMaterial({ color: C('#8fc6ec'), roughness: 0.08, metalness: 0, transparent: true, opacity: 0.85 }), NW);
    pst.water.frustumCulled = false; g.add(pst.water);
    pst.W = []; for (let i = 0; i < NW; i++) pst.W.push({ t0: lerp(PT.w0, PT.w1 - 0.5, i / NW), x: (rnd() - 0.5) * 0.8, z: 3 + (rnd() - 0.5) * 0.8 });
    const domeProf = [[0, 0], [7.2, 0], [10.6, 1.4], [11.5, 2.6], [10.5, 3.5], [6, 4.0], [0, 4.1]].map(([x, y]) => new T.Vector2(x, y));
    pst.dome = new T.Mesh(new T.LatheGeometry(domeProf, 64), new T.MeshStandardMaterial({ color: pst.cP.clone(), roughness: 0.55, metalness: 0 }));
    pst.dome.position.y = -4.2; pst.dome.receiveShadow = true; pst.dome.castShadow = true; g.add(pst.dome);
    pst.tool = new T.Mesh(new T.BoxGeometry(1.4, 26, 0.5), metal); pst.tool.castShadow = true; g.add(pst.tool);
  }
  function pasteFrame(t) {
    const { parts, P, water } = pst;
    const mixU = seg(t, PT.m0, PT.m1), swirl = eio(mixU) * 4.2, blend = sm(seg(t, PT.m0 + 0.4, PT.m1 - 0.4)), shrink = 1 - sm(seg(t, PT.d0 + 0.2, PT.d1));
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      if (t < q.t0 || shrink <= 0) { M4.makeScale(0, 0, 0); parts.setMatrixAt(i, M4); continue; }
      const u = seg(t, q.t0, q.t0 + 0.75);
      const ang = q.a + swirl * (1.3 - q.r / 14) * q.sp, rr = q.r * (1 - 0.15 * Math.sin(PI * mixU));
      _q3.set(lerp(q.fx, rr * Math.cos(ang), Math.pow(u, 1.6)), lerp(q.fy, q.y, u * u), lerp(q.fz, rr * Math.sin(ang), Math.pow(u, 1.6)));
      M4.makeScale(shrink, shrink, shrink); M4.setPosition(_q3); parts.setMatrixAt(i, M4);
      pst.tc.copy(q.s ? pst.cR : pst.cZ).lerp(pst.cP, blend); parts.setColorAt(i, pst.tc);
    }
    parts.instanceMatrix.needsUpdate = true; parts.instanceColor.needsUpdate = true;
    for (let i = 0; i < pst.W.length; i++) {
      const w = pst.W[i], u = seg(t, w.t0, w.t0 + 0.55), s = t < w.t0 || u >= 1 ? 0 : 1;
      _q3.set(w.x, lerp(32, -2.5, u * u), w.z); M4.makeScale(s, s * 1.4, s); M4.setPosition(_q3); water.setMatrixAt(i, M4);
    }
    water.instanceMatrix.needsUpdate = true;
    pst.dome.visible = t > PT.d0; pst.dome.scale.set(1, Math.max(0.001, sm(seg(t, PT.d0, PT.d1 - 0.2))), 1);
    pst.tool.visible = t > PT.m0 - 0.2 && t < PT.m1 + 0.2;
    const ta = (t - PT.m0) * 2.6;
    pst.tool.position.set(Math.cos(ta) * 4.5, 8.5, Math.sin(ta) * 4.5); pst.tool.rotation.set(0.32 * Math.sin(ta), 0, -0.32 * Math.cos(ta));
  }

  /* ---------- DRY + BAKE: bench for drying, then the inside of the muffle furnace ---------- */
  const bk = {};
  {
    const g = W.bake, fy = -PIECE.layers / 2 - 1.6;
    bk.bench = new T.Mesh(new T.BoxGeometry(150, 4, 110), benchM); bk.bench.position.y = fy - 2; bk.bench.receiveShadow = true; g.add(bk.bench);
    const tile = new T.Mesh(new T.BoxGeometry(26, 1.6, 26), new T.MeshStandardMaterial({ color: C('#d8d1c6'), roughness: 0.9 })); tile.position.y = fy + 0.8; tile.receiveShadow = true; tile.castShadow = true; g.add(tile);
    bk.room = new T.Group(); g.add(bk.room);
    bk.wallM = new T.MeshStandardMaterial({ color: C('#d2c7b8'), roughness: 1, metalness: 0, side: T.BackSide, emissive: C('#ff3a0a'), emissiveIntensity: 0 });
    const box = new T.Mesh(new T.BoxGeometry(76, 50, 60), bk.wallM); box.position.set(0, fy - 0.2 + 25, -6); box.receiveShadow = true; bk.room.add(box);
    bk.rodM = new T.MeshStandardMaterial({ color: C('#4a2a1c'), roughness: 0.6, emissive: C('#ff4a12'), emissiveIntensity: 0 });
    const rodG = new T.CylinderGeometry(0.9, 0.9, 54, 12);
    [-1, 1].forEach(sx => [4, 12, 20, 28, 36].forEach(y => { const r = new T.Mesh(rodG, bk.rodM); r.rotation.x = PI / 2; r.position.set(sx * 36.4, fy + y, -6); bk.room.add(r); }));
    const steel = new T.MeshStandardMaterial({ color: C('#8d9298'), roughness: 0.4, metalness: 0.6 });
    const fz = 24.4, fr = [[80, 3, 0, fy + 50.5], [80, 3, 0, fy - 1.5], [3, 55, -39.5, fy + 24.5], [3, 55, 39.5, fy + 24.5]];
    fr.forEach(([w, h, x, y]) => { const m = new T.Mesh(new T.BoxGeometry(w, h, 3), steel); m.position.set(x, y, fz); bk.room.add(m); });
  }

  /* ---------- RIG: the whole test setup ---------- */
  const rg = {};
  {
    const g = W.rig;
    const bench = new T.Mesh(new T.BoxGeometry(420, 4, 90), benchM); bench.position.set(5, -2, -4); g.add(bench);
    const greyM = new T.MeshStandardMaterial({ color: C('#5b6168'), roughness: 0.45, metalness: 0.5 });
    const cyl = new T.Group(); cyl.position.set(-150, 0, -12); g.add(cyl);
    { const body = new T.Mesh(new T.CylinderGeometry(9, 9, 108, 32), greyM); body.position.y = 54; cyl.add(body);
      const top = new T.Mesh(new T.SphereGeometry(9, 32, 16, 0, TAU, 0, PI / 2), greyM); top.position.y = 108; cyl.add(top);
      const band = new T.Mesh(new T.CylinderGeometry(9.15, 9.15, 10, 32), whiteM); band.position.y = 96; cyl.add(band);
      const neck = new T.Mesh(new T.CylinderGeometry(2.2, 2.2, 10, 16), metal); neck.position.y = 120; cyl.add(neck);
      const reg = new T.Mesh(new T.BoxGeometry(7, 7, 7), metal); reg.position.y = 127; cyl.add(reg);
      const gauge = new T.Mesh(new T.CylinderGeometry(3, 3, 1.5, 24), whiteM); gauge.rotation.x = PI / 2; gauge.position.set(0, 132, 3.6); cyl.add(gauge); }
    { const m = new T.Mesh(new T.BoxGeometry(16, 20, 8), whiteM); m.position.set(-108, 30, -4); g.add(m);
      const d = new T.Mesh(new T.PlaneGeometry(9, 4), new T.MeshBasicMaterial({ color: C('#62e08a') })); d.position.set(-108, 33, 0.06); g.add(d); }
    { const chl = new T.Mesh(new T.BoxGeometry(40, 42, 40), whiteM); chl.position.set(-60, 21, -6); g.add(chl);
      const grill = new T.Mesh(new T.PlaneGeometry(24, 14), darkM); grill.position.set(-60, 14, 14.05); g.add(grill);
      const p = new T.Mesh(new T.PlaneGeometry(24, 8), darkM); p.position.set(-60, 34, 14.05); g.add(p);
      const d = new T.Mesh(new T.PlaneGeometry(8, 3.6), new T.MeshBasicMaterial({ color: C('#69b7ff') })); d.position.set(-64, 34, 14.1); g.add(d);
      const vessel = new T.Mesh(new T.CylinderGeometry(5.5, 5.5, 26, 32, 1, true), glass); vessel.position.set(-60, 55, -6); g.add(vessel);
      const liq = new T.Mesh(new T.CylinderGeometry(5.1, 5.1, 15, 32), new T.MeshStandardMaterial({ color: C('#bfe3f5'), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.5 })); liq.position.set(-60, 49.5, -6); g.add(liq); }
    rg.furn = furn.clone(); rg.furn.scale.setScalar(0.5); rg.furn.position.set(10, 31.5, 0); g.add(rg.furn);
    { const tb = new T.Mesh(new T.CylinderGeometry(3, 3, 96, 32, 1, true), glass); tb.rotation.z = PI / 2; tb.position.set(10, 31.5, 0); g.add(tb);
      const cat = new T.Mesh(new T.CylinderGeometry(2.5, 2.5, 5, 24), new T.MeshStandardMaterial({ color: CAL, roughness: 0.9 })); cat.rotation.z = PI / 2; cat.position.set(10, 31.5, 0); g.add(cat); }
    rg.bag = new T.Mesh(new T.SphereGeometry(1, 32, 16), new T.MeshStandardMaterial({ color: C('#f1f3f4'), roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.9 })); rg.bag.position.set(98, 26, 0); g.add(rg.bag);
    { const b = new T.Mesh(new T.BoxGeometry(54, 58, 46), new T.MeshStandardMaterial({ color: C('#dfe2e5'), roughness: 0.5, metalness: 0.05 })); b.position.set(156, 29, -8); g.add(b);
      const seam = new T.Mesh(new T.PlaneGeometry(35, 49), darkM); seam.position.set(148, 27, 15.03); g.add(seam);
      const door = new T.Mesh(new T.PlaneGeometry(34, 48), new T.MeshStandardMaterial({ color: C('#eef0f2'), roughness: 0.45, envMapIntensity: 0.6 })); door.position.set(148, 27, 15.06); g.add(door);
      const pc = document.createElement('canvas'); pc.width = 128; pc.height = 512; const pg = pc.getContext('2d');
      pg.fillStyle = '#1c1e22'; pg.fillRect(0, 0, 128, 512);
      pg.fillStyle = '#3a3d43'; for (let r = 0; r < 7; r++) for (let k = 0; k < 4; k++) pg.fillRect(18 + k * 24, 210 + r * 26, 18, 16);
      const pt = new T.CanvasTexture(pc); pt.encoding = T.sRGBEncoding;
      const panel = new T.Mesh(new T.PlaneGeometry(15, 56), new T.MeshStandardMaterial({ map: pt, roughness: 0.5, metalness: 0.1 })); panel.position.set(174.5, 29, 15.05); g.add(panel);
      rg.screen = new T.Mesh(new T.PlaneGeometry(11, 13), new T.MeshBasicMaterial({ color: C('#22302f') })); rg.screen.position.set(174.5, 46, 15.08); g.add(rg.screen);
      const inj = new T.Mesh(new T.CylinderGeometry(2, 2, 5, 16), metal); inj.position.set(140, 60.5, -2); g.add(inj); }
    rg.syr = new T.Group(); g.add(rg.syr);
    { const barrel = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 10, 16), new T.MeshStandardMaterial({ color: C('#eef4f6'), roughness: 0.1, transparent: true, opacity: 0.75 })); barrel.position.y = 5; rg.syr.add(barrel);
      const needle = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 6, 8), metal); needle.position.y = -3; rg.syr.add(needle); }
    const Pt = (x, y, z) => V(x, y, z);
    const segs = [
      new T.CatmullRomCurve3([Pt(-150, 127, -9), Pt(-150, 127, 4), Pt(-130, 60, 4), Pt(-116, 30, 0)]),
      new T.LineCurve3(Pt(-116, 30, 0), Pt(-100, 30, 0)),
      new T.CatmullRomCurve3([Pt(-100, 30, 0), Pt(-86, 70, 0), Pt(-66, 74, -6), Pt(-60, 66, -6)]),
      new T.LineCurve3(Pt(-60, 66, -6), Pt(-60, 44, -6)),
      new T.LineCurve3(Pt(-60, 44, -6), Pt(-57, 66, -6)),
      new T.CatmullRomCurve3([Pt(-57, 66, -6), Pt(-50, 72, -2), Pt(-44, 40, 0), Pt(-38, 31.5, 0)]),
      new T.LineCurve3(Pt(-38, 31.5, 0), Pt(58, 31.5, 0)),
      new T.CatmullRomCurve3([Pt(58, 31.5, 0), Pt(72, 34, 0), Pt(84, 44, 0), Pt(94, 40, 0)])
    ];
    rg.path = new T.CurvePath(); segs.forEach(s => rg.path.add(s));
    [0, 2, 5, 7].forEach(i => g.add(new T.Mesh(new T.TubeGeometry(segs[i], 64, 0.6, 8, false), metal)));
    const near = p => { let best = 0, bd = 1e9; for (let i = 0; i <= 400; i++) { const d = rg.path.getPointAt(i / 400).distanceTo(p); if (d < bd) { bd = d; best = i / 400; } } return best; };
    rg.uOut = near(Pt(58, 31.5, 0));
    rg.comps = [
      { id: 'cyl', text: 'N₂ cylinder', p: Pt(-150, 100, -3), u: 0 },
      { id: 'mfc', text: 'Flow controller', p: Pt(-108, 44, -4), u: near(Pt(-108, 30, 0)) },
      { id: 'sat', text: 'n‑heptane at −3 °C', p: Pt(-60, 72, -6), u: near(Pt(-60, 55, -6)) },
      { id: 'fur', text: 'Furnace with our catalyst', p: Pt(10, 62, 0), u: near(Pt(10, 31.5, 0)) },
      { id: 'bag', text: 'Gas bag', p: Pt(98, 47, 0), u: 0.98 }
    ];
    const NG = 90; rg.NG = NG;
    rg.pos = new Float32Array(NG * 3); rg.col = new Float32Array(NG * 3);
    const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.BufferAttribute(rg.pos, 3)); gg.setAttribute('color', new T.BufferAttribute(rg.col, 3));
    rg.gas = new T.Points(gg, new T.PointsMaterial({ map: dotT, size: 4.4, vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, sizeAttenuation: true, fog: false }));
    rg.gas.renderOrder = 5;
    rg.gas.frustumCulled = false; g.add(rg.gas);
    const NB2 = 36; rg.NB = NB2; rg.bpos = new Float32Array(NB2 * 3); rg.bsd = [];
    for (let i = 0; i < NB2; i++) rg.bsd.push([(rnd() - 0.5) * 6, rnd(), (rnd() - 0.5) * 6, 0.6 + rnd() * 0.8]);
    const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.BufferAttribute(rg.bpos, 3));
    rg.bub = new T.Points(bg, new T.PointsMaterial({ map: dotT, size: 1.6, color: C('#ffffff'), transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true }));
    rg.bub.frustumCulled = false; g.add(rg.bub);
  }
  const RG0 = 2.2, RG1 = 14.0;
  const rgFront = t => 1.06 * seg(t, RG0, RG1);
  const rgReach = u => RG0 + (u / 1.06) * (RG1 - RG0);
  function rigFrame(t) {
    const front = rgFront(t);
    for (let i = 0; i < rg.NG; i++) {
      const u = front - i * 0.0112;
      if (u < 0 || u > 1) { rg.pos[i * 3 + 1] = -999; continue; }
      rg.path.getPointAt(u, _q3);
      rg.pos[i * 3] = _q3.x; rg.pos[i * 3 + 1] = _q3.y; rg.pos[i * 3 + 2] = _q3.z;
      tmpC.copy(COOL).lerp(HOT, sm(seg(u, rg.uOut - 0.2, rg.uOut)));
      rg.col[i * 3] = tmpC.r; rg.col[i * 3 + 1] = tmpC.g; rg.col[i * 3 + 2] = tmpC.b;
    }
    rg.gas.geometry.attributes.position.needsUpdate = true; rg.gas.geometry.attributes.color.needsUpdate = true;
    const bubOn = front > rg.comps[2].u;
    for (let i = 0; i < rg.NB; i++) {
      const b = rg.bsd[i], y = ((b[1] + t * b[3] * 0.6) % 1);
      rg.bpos[i * 3] = -60 + b[0] * 0.7; rg.bpos[i * 3 + 1] = bubOn ? 43 + y * 13 : -999; rg.bpos[i * 3 + 2] = -6 + b[2] * 0.7;
    }
    rg.bub.geometry.attributes.position.needsUpdate = true;
    const inf = seg(front, 0.95, 1.06);
    rg.bag.scale.set(12 + 2 * inf, 15 + 3 * inf, 2 + 4.5 * inf);
    const st = seg(t, 14.4, 16.2);
    rg.syr.visible = t > 14.2 && t < 17.2;
    rg.syr.position.set(lerp(98, 140, st), 48 + Math.sin(PI * st) * 22 - 2 * seg(t, 16.2, 16.7), lerp(0, -2, st));
    rg.screen.material.color.set(t > 16.8 ? '#a6e3d5' : '#22302f');
  }
  const rgA = V(), rgB = V();
  function rigCam(t) {
    const f = rgFront(t);
    rgA.set(0, 0, 0);
    for (let k = 0; k < 8; k++) { rg.path.getPointAt(clamp(f - 0.02 - k * 0.012, 0, 1), rgB); rgA.add(rgB); }
    rgA.multiplyScalar(1 / 8); rgA.y = lerp(rgA.y, 42, 0.5); rgA.z = 0;
    const w0 = 1 - sm(seg(t, 0.8, RG0 + 0.6)), w1 = sm(seg(t, 14.0, 15.4)), w2 = sm(seg(t, 16.4, 19));
    rgA.lerp(rgB.set(122, 42, 0), w1).lerp(rgB.set(150, 40, -4), w2).lerp(rgB.set(14, 50, 0), w0);
    const th = Math.tan(camera.fov * D2R / 2);
    const fol = 64 / (th * Math.min(asp, 1.25)), wide = Math.min(900, 205 / (th * Math.min(asp, 1.7)));
    const d = lerp(lerp(fol, fol * 1.12, w1) * lerp(1, 0.8, w2), wide, w0);
    camera.position.set(rgA.x - 0.14 * d, rgA.y + 0.2 * d, rgA.z + d);
    camera.lookAt(rgA);
  }

  /* ---------- GC: coiled column inside the oven, bands separating, flame detector ---------- */
  const GCD = window.SDP_GC, GC_T = 23, GC_T0 = 1.8, GC_T1 = 13.3;
  const gcHmax = Math.max(...GCD.peaks.map(p => p[1]));
  const gcw = { flare: 0 };
  {
    const g = W.gc;
    const body = new T.Mesh(new T.BoxGeometry(70, 56, 46), new T.MeshStandardMaterial({ color: C('#7d838a'), roughness: 0.5, metalness: 0.5, envMapIntensity: 0.45, side: T.BackSide })); body.position.set(0, 4, -8); g.add(body);
    gcw.fan = new T.Group(); gcw.fan.position.set(0, 0, -30.6); g.add(gcw.fan);
    { const hub = new T.Mesh(new T.CylinderGeometry(2.4, 2.4, 1, 20), darkM); hub.rotation.x = PI / 2; gcw.fan.add(hub);
      for (let k = 0; k < 6; k++) { const bl = new T.Mesh(new T.BoxGeometry(2.6, 8.5, 0.4), darkM); bl.position.set(Math.cos(k * TAU / 6) * 5.6, Math.sin(k * TAU / 6) * 5.6, 0.2); bl.rotation.z = k * TAU / 6 - PI / 2 + 0.35; gcw.fan.add(bl); } }
    class Helix extends T.Curve { getPoint(u, out) { const o = out || new T.Vector3(); const th = u * TAU * 8.5; return o.set(13 * Math.cos(th), 8 - u * 17, -8 + 13 * Math.sin(th)); } }
    gcw.helix = new Helix();
    const colM = new T.MeshStandardMaterial({ color: C('#a2602c'), roughness: 0.35, metalness: 0.2, emissive: C('#3a1a08'), emissiveIntensity: 0.3 });
    g.add(new T.Mesh(new T.TubeGeometry(gcw.helix, 900, 0.34, 8, false), colM));
    gcw.inj = V(24, 20, -8); gcw.det = V(-24, 20, -8);
    g.add(new T.Mesh(new T.TubeGeometry(new T.LineCurve3(gcw.inj, gcw.helix.getPoint(0)), 4, 0.34, 8, false), colM));
    g.add(new T.Mesh(new T.TubeGeometry(new T.LineCurve3(gcw.helix.getPoint(1), gcw.det), 4, 0.34, 8, false), colM));
    const ib = new T.Mesh(new T.CylinderGeometry(2.4, 2.4, 6, 20), metal); ib.position.copy(gcw.inj).add(V(0, 3, 0)); g.add(ib);
    const db = new T.Mesh(new T.CylinderGeometry(2.4, 2.4, 6, 20), metal); db.position.copy(gcw.det).add(V(0, 3, 0)); g.add(db);
    gcw.flame = mkSprite('#9cc8ff', 5, 0.5); gcw.flame.position.copy(gcw.det).add(V(0, 8, 0)); g.add(gcw.flame);
    const colFor = n => (n === 'C3=' ? '#ff6a2a' : n === 'C2=' ? '#7fa6cc' : n === 'C4=' ? '#e0b04a' : n === 'C1' || n === 'C2' ? '#ece6df' : n === 'C7' ? '#c7a6ff' : '#cdbba8');
    gcw.bands = GCD.peaks.map(p => { const s = mkSprite(colFor(p[3]), 1.8 + 3.6 * Math.sqrt(p[1] / gcHmax), 0); g.add(s); return { s, w: Math.sqrt(p[1] / gcHmax), te: GC_T0 + p[0] * (GC_T1 - GC_T0) / GC_T }; });
    const NHe = 70; gcw.NHe = NHe; gcw.hp = new Float32Array(NHe * 3);
    const hg = new T.BufferGeometry(); hg.setAttribute('position', new T.BufferAttribute(gcw.hp, 3));
    gcw.he = new T.Points(hg, new T.PointsMaterial({ map: dotT, size: 0.9, color: C('#dfe9ff'), transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true }));
    gcw.he.frustumCulled = false; g.add(gcw.he);
  }
  function gcFrame(t, dt) {
    let flare = 0;
    for (const b of gcw.bands) {
      if (t < GC_T0) { b.s.position.copy(gcw.inj); b.s.material.opacity = 0; continue; }
      const f = seg(t, GC_T0, b.te);
      if (f < 1) { gcw.helix.getPoint(f, b.s.position); b.s.material.opacity = 0.95; }
      else { const a = seg(t, b.te, b.te + 0.45); b.s.position.copy(gcw.det).add(_q3.set(0, 8 * a, 0)); b.s.material.opacity = 0.95 * (1 - a); flare += b.w * Math.max(0, 1 - Math.abs(t - b.te - 0.15) / 0.35); }
    }
    gcw.flare = Math.min(1, flare * 1.6);
    gcw.flame.material.opacity = 0.45 + 0.55 * gcw.flare;
    gcw.flame.scale.setScalar(5 + 9 * gcw.flare);
    for (let i = 0; i < gcw.NHe; i++) { gcw.helix.getPoint(((i / gcw.NHe) + t * 0.07) % 1, _q3); gcw.hp[i * 3] = _q3.x; gcw.hp[i * 3 + 1] = _q3.y; gcw.hp[i * 3 + 2] = _q3.z; }
    gcw.he.geometry.attributes.position.needsUpdate = true;
    gcw.fan.rotation.z -= dt * 9;
    return clamp((t - GC_T0) / (GC_T1 - GC_T0) * GC_T, 0, GC_T);
  }

  /* ---------- BARS: propylene share at 500, 550 and 600 °C ---------- */
  const bw = { bars: [], ready: false };
  {
    const g = W.bars;
    const fl = new T.Mesh(new T.PlaneGeometry(320, 240), new T.MeshStandardMaterial({ color: C('#1d150f'), roughness: 0.92 })); fl.rotation.x = -PI / 2; fl.receiveShadow = true; g.add(fl);
    ZSM.forEach((k, i) => {
      const col = k === 'parent' ? '#8a7f77' : SAMPLES[k].col;
      const m = new T.Mesh(new T.BoxGeometry(8, 1, 8), new T.MeshStandardMaterial({ color: C(col), roughness: 0.36, metalness: 0.05, emissive: C(col), emissiveIntensity: 0 }));
      m.position.set((i - 1.5) * 11, 0.5, 0); m.castShadow = true; m.receiveShadow = true; g.add(m);
      const val = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
      const nm = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false, fog: false })); nm.position.set((i - 1.5) * 11, 1.0, 12);
      g.add(val, nm); bw.bars.push({ k, m, val, nm, tex: {} });
    });
  }
  function barsTex() {
    const s = portrait() ? 13 : 11;
    bw.bars.forEach(b => { b.val.scale.set(s, s / 4, 1); b.nm.scale.set(s, s / 4, 1); });
    if (bw.ready) return; bw.ready = true;
    bw.bars.forEach(b => {
      b.nm.material.map = textTex(b.k === 'parent' ? 'Parent' : SAMPLES[b.k].name, '#f3ece2'); b.nm.material.needsUpdate = true;
      [500, 550, 600].forEach(TT => { b.tex[TT] = textTex(f1(runOf(b.k, TT).prop) + NB + '%', b.k === 'parent' ? '#d9cfc6' : '#ffb48d'); });
    });
  }
  const BAR_TS = [[500, 0.6], [550, 4.4], [600, 8.4]];
  function barsFrame(t) {
    let si = 0; for (let i = 1; i < 3; i++) if (t >= BAR_TS[i][1]) si = i;
    const TT = BAR_TS[si][0], t0 = BAR_TS[si][1];
    const best = ZSM.reduce((a, k) => (runOf(k, TT).prop > runOf(a, TT).prop ? k : a), ZSM[0]);
    bw.bars.forEach((b, i) => {
      const target = runOf(b.k, TT).prop * 0.9, prev = si === 0 ? 0 : runOf(b.k, BAR_TS[si - 1][0]).prop * 0.9;
      const h = Math.max(0.01, lerp(prev, target, eio(seg(t, t0 + i * 0.12, t0 + 1.2 + i * 0.12))));
      b.m.scale.y = h; b.m.position.y = h / 2;
      b.m.material.emissiveIntensity = b.k === best ? 0.32 * sm(seg(t, t0 + 1.7, t0 + 2.4)) : 0;
      if (b.val.material.map !== b.tex[TT]) { b.val.material.map = b.tex[TT]; b.val.material.needsUpdate = true; }
      b.val.position.set(b.m.position.x, h + 2.4, 0);
      b.val.material.opacity = sm(seg(t, t0 + 1.0, t0 + 1.6));
    });
    return TT;
  }

  /* ---------- camera helpers ---------- */
  let asp = 1;
  const fitM = r => Math.max(1, r / asp) / Math.max(1, r / 1.6);
  const cr = (p0, p1, p2, p3, u) => { const u2 = u * u, u3 = u2 * u; return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); };
  const cP_ = V(), cL_ = V();
  function camPath(keys, t, fit, ease) {
    const n = keys.length, t0 = keys[0].t, tN = keys[n - 1].t, s0 = seg(t, t0, tN);
    const tau = t0 + lerp(s0, eio(s0), ease == null ? 1 : ease) * (tN - t0);
    let j = 0; while (j < n - 2 && tau > keys[j + 1].t) j++;
    const k0 = keys[Math.max(0, j - 1)], k1 = keys[j], k2 = keys[Math.min(n - 1, j + 1)], k3 = keys[Math.min(n - 1, j + 2)];
    const u = clamp((tau - k1.t) / Math.max(1e-6, k2.t - k1.t), 0, 1);
    for (let a = 0; a < 3; a++) { cP_.setComponent(a, cr(k0.p[a], k1.p[a], k2.p[a], k3.p[a], u)); cL_.setComponent(a, cr(k0.l[a], k1.l[a], k2.l[a], k3.l[a], u)); }
    if (fit) { const r = cr(k0.r, k1.r, k2.r, k3.r, u); cP_.sub(cL_).multiplyScalar(fitM(r)).add(cL_); }
    camera.position.copy(cP_); camera.lookAt(cL_);
  }
  const tg = V();
  function orbitCam(az, el, r, sr) { const R = r * fitM(sr); camera.position.set(tg.x + R * Math.cos(el) * Math.sin(az), tg.y + R * Math.sin(el), tg.z + R * Math.cos(el) * Math.cos(az)); camera.lookAt(tg); }
  function setFov(f) { if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } }

  /* ---------- tour UI ---------- */
  const capEl = $('#cap'), capT = $('#capT'), capP = $('#capP'), eqEl = $('#eq'), scaleEl = $('#tScale'), tempEl = $('#tTemp'), tempV = $('#tTempV');
  const mixEl = $('#mix'), ctrlEl = $('#tCtrl'), progEl = $('#prog'), lblBox = $('#lbls'), playBtn = $('#tPlay');
  let tempTxt = null;
  function tempShow(s) { if (s === tempTxt) return; tempTxt = s; tempEl.hidden = !s; if (s) tempV.textContent = s; }

  const infoEl = $('#tInfo'), chartEl = $('#tChart'), chartSvg = $('#tChartSvg');
  let infoTxt = null, lblTop = 96;
  function infoShow(s) { if (s === infoTxt) return; infoTxt = s; infoEl.hidden = !s; if (s) infoEl.textContent = s; }
  const GCL = [['methane', 'Methane'], ['ethane', 'Ethane'], ['ethylene', 'Ethylene'], ['propane', 'Propane'], ['propylene', 'Propylene'], ['butane', 'Butane'], ['butenes', 'Butenes'], ['n-heptane', 'n‑Heptane']];
  const gch = { X: null, clip: null, cur: null };
  const gcSig = m => { let v = 0; for (const p of GCD.peaks) { const d = (m - p[0]) / p[2]; if (d > -8 && d < 8) v += p[1] * Math.exp(-0.5 * d * d); } return v; };
  function chartOn(on) {
    chartEl.hidden = !on; lblTop = 96; gch.X = null;
    if (!on) return;
    const w = chartSvg.clientWidth, h = chartSvg.clientHeight; if (!w || !h) return;
    const ml = 6, mr = 8, mt = 4, mb = 20, pw = Math.floor(w - ml - mr), ph = h - mt - mb, base = mt + ph;
    const kk = Math.min(0.56, Math.max(0.3, (ph - 62) / ph)), X = m => ml + m / GC_T * pw, Y = v => base - v / gcHmax * ph * kk;
    let d = `M${ml} ${base}`;
    for (let px = 0; px <= pw; px++) {
      const a = px / pw * GC_T, b = (px + 1) / pw * GC_T;
      let v = Math.max(gcSig(a), gcSig((a + b) / 2));
      for (const p of GCD.peaks) if (p[0] >= a && p[0] < b) v = Math.max(v, gcSig(p[0]));
      d += `L${(ml + px).toFixed(1)} ${Y(v).toFixed(1)}`;
    }
    let s = `<defs><linearGradient id="gcG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a1f" stop-opacity=".6"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></linearGradient><clipPath id="gcC"><rect id="gcCR" x="0" y="-80" width="0" height="${h + 100}"/></clipPath></defs>`;
    s += `<line x1="${ml}" x2="${ml + pw}" y1="${base}" y2="${base}" stroke="rgba(243,236,226,.35)"/>`;
    [0, 5, 10, 15, 20].forEach(m => { s += `<line x1="${X(m).toFixed(1)}" x2="${X(m).toFixed(1)}" y1="${base}" y2="${base + 4}" stroke="rgba(243,236,226,.35)"/><text x="${X(m).toFixed(1)}" y="${base + 16}" text-anchor="middle" class="ax">${m}${m === 20 ? NB + 'min' : ''}</text>`; });
    s += `<g clip-path="url(#gcC)"><path d="${d}L${ml + pw} ${base}Z" fill="url(#gcG)"/><path d="${d}" fill="none" stroke="#ffd2b8" stroke-width="1.4" stroke-linejoin="round"/>`;
    GCL.forEach(([nm, txt]) => {
      const ps = GCD.peaks.filter(p => p[4] === nm); if (!ps.length) return;
      const pk = ps.reduce((a, p) => (p[1] > a[1] ? p : a));
      s += `<text transform="translate(${(X(pk[0]) + 4).toFixed(1)} ${(Y(gcSig(pk[0])) - 5).toFixed(1)}) rotate(-90)" class="${nm === 'propylene' ? 'pk hot' : 'pk'}">${txt}</text>`;
    });
    s += `</g><line id="gcCur" x1="0" x2="0" y1="${mt}" y2="${base}" stroke="#fff" stroke-opacity=".6" stroke-dasharray="3 3"/>`;
    chartSvg.innerHTML = s;
    gch.X = X; gch.clip = chartSvg.querySelector('#gcCR'); gch.cur = chartSvg.querySelector('#gcCur');
    if (portrait()) lblTop = chartEl.getBoundingClientRect().bottom + 6;
  }
  function drawChart(m) {
    if (!gch.X) return;
    const x = gch.X(m);
    gch.clip.setAttribute('width', (x + 1).toFixed(1));
    gch.cur.setAttribute('x1', x.toFixed(1)); gch.cur.setAttribute('x2', x.toFixed(1));
    gch.cur.style.opacity = m > 0 && m < GC_T ? 1 : 0;
  }
  const LBL = {};
  function lbl(id, text, cls, side) {
    let o = LBL[id];
    if (!o) { const el = document.createElement('div'); el.className = 'lbl' + (cls ? ' ' + cls : ''); el.innerHTML = '<i></i><span></span>'; lblBox.appendChild(el); o = LBL[id] = { el, sp: el.querySelector('span'), p: V(), on: false, side: side || '' }; }
    o.sp.textContent = text; return o;
  }
  function clearLabels() { for (const k in LBL) { LBL[k].on = false; LBL[k].el.style.opacity = 0; } }
  const _pv = V();
  function updLabels() {
    const w = lblBox.clientWidth, h = lblBox.clientHeight;
    for (const k in LBL) {
      const o = LBL[k];
      if (!o.on) { if (o.el.style.opacity !== '0') o.el.style.opacity = 0; continue; }
      _pv.copy(o.p).project(camera);
      const x = (_pv.x + 1) / 2 * w, y = (1 - _pv.y) / 2 * h;
      const vis = _pv.z < 1 && x > 10 && x < w - 10 && y > lblTop && y < h - 30;
      o.el.style.opacity = vis ? 1 : 0;
      o.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      const left = o.side === 'l' ? x > 170 : o.side === 'r' ? x > w - 170 : x > w * 0.6;
      o.el.classList.toggle('l', left);
    }
  }

  /* ---------- chapters ---------- */
  const RX_KEYS = [
    { t: 0, p: [12, 30, 78], l: [-4, 0, 0], r: 1.5 },
    { t: 2.8, p: [30, 112, 178], l: [0, -10, 0], r: 1.9 },
    { t: 6.4, p: [-30, 42, 104], l: [-5, -2, 0], r: 1.7 },
    { t: 8.8, p: [6, 10, 32], l: [0, 0, 0], r: 0.9 },
    { t: 11.0, p: [1.2, 3.0, 7.6], l: [0.4, 1.2, 4.5], r: 0.6 }
  ];
  const MI_KEYS = [
    { t: 0, p: [3, 2.5, 46], l: [0, 0, 20] },
    { t: 3.5, p: [-1.5, 1, 24], l: [0, -0.2, 0] },
    { t: 7.6, p: [0.6, -0.5, -6], l: [0.8, -0.6, -30] }
  ];
  const NA_KEYS = [
    { t: 0, p: [0, 0, 22], l: [0, 0, 0] },
    { t: 4.2, p: [-1.0, 0.8, DOCK.z + 13], l: [DOCK.x, DOCK.y, DOCK.z] },
    { t: 6.2, p: [-2.1, 1.5, DOCK.z + 7.0], l: [DOCK.x, DOCK.y, DOCK.z - 0.5] },
    { t: 11.5, p: [-2.0, 1.5, DOCK.z + 10.5], l: [DOCK.x * 0.6, DOCK.y * 0.6, DOCK.z - 1] }
  ];
  const PA_KEYS = [
    { t: 0, p: [4, 50, 78], l: [0, 9, 0], r: 0.75 },
    { t: 6.2, p: [-22, 40, 52], l: [0, 1, 0], r: 0.75 },
    { t: 14, p: [20, 32, 42], l: [0, -1.5, 0], r: 0.75 }
  ];
  const PR_KEYS = [
    { t: 0, p: [80, 70, 170], l: [0, 22, -16], r: 0.75 },
    { t: 3.4, p: [40, 24, 72], l: [0, 2, -2], r: 0.7 },
    { t: 8.6, p: [30, 16, 52], l: [0, 0, 0], r: 0.62 },
    { t: 13.6, p: [-16, 12, 50], l: [0, -1, 0], r: 0.62 },
    { t: 17, p: [38, 26, 30], l: [0, -2.5, 0], r: 0.62 }
  ];
  const BK_KEYS = [
    { t: 0, p: [14, 20, 92], l: [0, 3, -6], r: 0.9 },
    { t: 5.6, p: [-10, 8, 52], l: [0, -1, -2], r: 0.75 },
    { t: 11.5, p: [16, 10, 40], l: [0, -1.5, 0], r: 0.62 }
  ];
  const GC_KEYS = [
    { t: 0, p: [6, 16, 120], l: [0, 4, -8], r: 0.9 },
    { t: 2.6, p: [30, 18, 58], l: [10, 8, -8], r: 0.75 },
    { t: 8.5, p: [-6, 6, 62], l: [-2, 0, -8], r: 0.8 },
    { t: 13.4, p: [-30, 26, 50], l: [-18, 14, -8], r: 0.7 },
    { t: 16, p: [4, 14, 104], l: [0, 4, -8], r: 0.9 }
  ];
  const NIGHT = C('#07090f'), DAYC = C('#2d221b');
  const portrait = () => asp < 0.9;
  const LAB_PASTE = [['lz', 'ZSM‑5 zeolite', -5, PT.z0, PT.z1 + 0.3], ['lc', 'Red bentonite clay', 5, PT.c0, PT.c1 + 0.3], ['lw', 'Water', 0, PT.w0, PT.w1 + 0.2]];
  const CH = [
    { id: 'paste', world: 'paste', dur: 14, scale: 'Mix: 80 % ZSM‑5, 20 % clay',
      caps: [[0, 'Make the paste', 'We start with ZSM‑5 zeolite powder. This is the catalyst.'],
        [PT.c0 - 0.1, 'Make the paste', 'We add red bentonite clay. It works like glue and holds the zeolite together.'],
        [PT.w0, 'Make the paste', 'Then water. We mix and knead it into a soft paste, then let it rest for 2 days.'],
        [PT.d0, 'Make the paste', 'ZR‑2A and ZR‑2B use 80 % zeolite and 20 % clay. ZR‑1A has more clay: 70 % and 30 %.']],
      enter() {
        camera.near = 1; key.intensity = 2.3; setShadow(22); rim.position.set(20, 16, -24); rim.intensity = 1.2; rim.distance = 120;
        setFov(portrait() ? 44 : 36);
        LAB_PASTE.forEach(([id, txt, x]) => { lbl(id, txt, '', x < 0 ? 'l' : x > 0 ? 'r' : '').p.set(x, 16, x ? -2 : 3); });
        lbl('lp', 'Paste').p.set(0, 0.6, 0);
      },
      update(t) {
        pasteFrame(t);
        LAB_PASTE.forEach(([id, , , a, b]) => { LBL[id].on = t > a + 0.3 && t < b; });
        LBL.lp.on = t > PT.d1 - 0.4;
        camPath(PA_KEYS, t, true, 0.3);
      } },
    { id: 'print', world: 'macro', dur: 17, scale: 'Real size: about 11 mm across',
      caps: [[0, '3D print it', 'The paste goes into our clay printer. It pushes the paste out through a 1.2 mm nozzle.'],
        [5.4, '3D print it', 'It builds the piece one 1 mm layer at a time: two round walls with a grid inside.'],
        [11.0, '3D print it', 'The grid leaves open channels from top to bottom, so gas can flow straight through.']],
      enter() {
        camera.near = 1; bed.visible = true; nozzle.visible = true; printer.visible = true;
        clay.color.copy(WET); clay.roughness = 0.62; setAO(false); setPrint(0);
        key.intensity = 2.2; rim.position.set(14, 10, -18); rim.intensity = 0.25; rim.distance = 90;
        setFov(portrait() ? 40 : 34); setShadow(16);
        lbl('noz', 'Nozzle: 1.2 mm', '', 'r'); lbl('tube', 'Paste', '', 'l');
      },
      update(t) {
        const p = seg(t, 2.6, 13.4), tp = setPrint(p), lift = sm(seg(t, 13.6, 15.2));
        nozzle.position.set(tp.x, tp.y + lift * 22, tp.z - lift * 8);
        updPrinter(p);
        infoShow(`Layer ${p >= 1 ? 15 : clamp(Math.round(tp.y + 6.45), 0, 14) + 1} of 15`);
        LBL.noz.on = t > 3.2 && t < 9.6; LBL.noz.p.copy(nozzle.position).add(_q4.set(0, 1.2, 0));
        LBL.tube.on = t > 0.9 && t < 6.5; LBL.tube.p.copy(nozzle.position).add(_q4.set(-14, 20.6, 0));
        camPath(PR_KEYS, t, true, 0.25);
      } },
    { id: 'dry', world: 'bake', dur: 7, scale: 'Real size: about 11 mm across',
      caps: [[0, 'Dry it', 'First, the wet piece dries in air for 48 hours.']],
      enter() {
        camera.near = 1; W.bake.add(piece); bk.bench.visible = true; bk.room.visible = false;
        clay.color.copy(WET); clay.roughness = 0.7;
        setShadow(16); setFov(portrait() ? 40 : 34);
      },
      update(t) {
        const u = seg(t, 0.5, 6.2), ph = -0.25 + u * (2 * TAU + 1.45), s = Math.sin(ph), day = sm(clamp(s * 2.5, 0, 1));
        key.position.set(Math.cos(ph) * 64, Math.max(s, -0.15) * 64 + 8, 24); key.intensity = 2.6 * day;
        hemi.intensity = 0.1 + 0.26 * day;
        BGS.bake.copy(NIGHT).lerp(DAYC, day); FOGS.bake.color.copy(BGS.bake);
        clay.color.copy(WET).lerp(DRY, sm(u));
        infoShow(`Drying in air: ${Math.round(48 * u)} h`);
        tg.set(0, -1.5, 0); orbitCam(-0.45 + t * 0.09, 0.5, 46, 0.62);
      } },
    { id: 'bake', world: 'bake', dur: 11.5, scale: 'Inside the furnace',
      caps: [[0, 'Bake it', 'Then a furnace heats it slowly, 3 °C per minute, up to 650 °C.'],
        [5.2, 'Bake it', 'It stays at 650 °C for 3 hours, then cools down inside the furnace.'],
        [8.6, 'Bake it', 'This is called calcination. The baked clay holds the zeolite together, so the piece is strong.']],
      enter() {
        camera.near = 1; W.bake.add(piece); bk.bench.visible = false; bk.room.visible = true;
        BGS.bake.set('#120c09'); FOGS.bake.color.set('#120c09');
        clay.color.copy(DRY); clay.roughness = 0.85;
        key.intensity = 0.55; setShadow(16);
        acc.position.set(0, 10, 2); acc.distance = 150;
        setFov(portrait() ? 46 : 36);
      },
      update(t) {
        const up = sm(seg(t, 0.8, 5.0)), cool = sm(seg(t, 7.6, 10.6)), heat = up * (1 - cool);
        const Tc = t < 5.0 ? lerp(25, 650, up) : t < 7.6 ? 650 : lerp(650, 30, cool);
        tempShow(Math.round(Tc) + NB + '°C');
        infoShow(t < 5.0 ? 'Heating: 3 °C per min' : t < 7.6 ? 'Holding: 3 hours' : 'Cooling down');
        bk.rodM.emissiveIntensity = heat * 2.8; bk.wallM.emissiveIntensity = heat * 0.3; acc.intensity = heat * 3.4;
        clay.emissiveIntensity = heat * 0.5; clay.color.copy(DRY).lerp(CAL, sm(seg(t, 5.0, 8.4)));
        camPath(BK_KEYS, t, true, 0.3);
      } },
    { id: 'rig', world: 'rig', dur: 19, scale: 'Our test setup (simplified)',
      caps: [[0, 'Our test setup', 'Nitrogen gas (N₂) flows from a cylinder at 100 mL/min. A flow controller keeps it steady.'],
        [rgReach(rg.comps[2].u) - 0.6, 'Our test setup', 'The N₂ bubbles through cold liquid n‑heptane (−3 °C) and picks up n‑heptane vapour.'],
        [rgReach(rg.comps[3].u) - 1.0, 'Our test setup', 'The gas flows through our catalyst in the hot furnace. Then it fills a gas bag.'],
        [14.2, 'Our test setup', 'We take 0.5 mL of gas from the bag with a syringe and inject it into the GC.']],
      enter() {
        camera.near = 3; key.intensity = 1.8; acc.position.set(10, 40, 30); acc.distance = 160; acc.intensity = 1.6;
        coilM.emissiveIntensity = 2.2; furnGlow.forEach(s => { s.material.opacity = 0.4; });
        setFov(portrait() ? 46 : 36);
        rg.comps.forEach(c => { lbl('rg' + c.id, c.text, c.id === 'fur' ? 'hot' : '').p.copy(c.p); });
        lbl('rggc', 'GC').p.set(156, 66, -8);
      },
      update(t) {
        rigFrame(t);
        const f = rgFront(t);
        tempShow(f > rg.comps[3].u - 0.05 ? '500' + NB + '°C' : null);
        rg.comps.forEach(c => { LBL['rg' + c.id].on = t > RG0 - 0.4 && f >= c.u - 0.01; });
        LBL.rggc.on = t > 14.6;
        rigCam(t);
      } },
    { id: 'react', world: 'macro', dur: 11, scale: 'Quartz tube, about 10 mm inside',
      caps: [[0, 'Inside the reactor', 'Our catalyst (0.4 g) sits in a quartz glass tube, between SiC grains and glass beads.'],
        [3.4, 'Inside the reactor', 'The furnace heats it to 500 °C. Gas with n‑heptane flows through the catalyst.'],
        [7.0, 'Inside the reactor', 'The gas leaving the catalyst carries the cracked products. We tested at 500, 550 and 600 °C.']],
      enter() {
        rx.visible = true; setAO(true);
        piece.rotation.set(0, 0, -PI / 2);
        flowMat.opacity = 0; coilM.emissiveIntensity = 0; furnGlow.forEach(s => { s.material.opacity = 0; });
        key.intensity = 1.6; acc.position.set(0, -12, 0); acc.distance = 120;
        setFov(34);
      },
      update(t, dt) {
        const heat = sm(seg(t, 1.2, 4.6)) * (1 + 0.15 * seg(t, 7, 10.5));
        coilM.emissiveIntensity = heat * 2.4; furnGlow.forEach(s => { s.material.opacity = heat * 0.42; }); acc.intensity = heat * 2.2;
        flowMat.opacity = sm(seg(t, 3.2, 4.6)) * 0.95; if (flowMat.opacity > 0) updFlow(dt);
        tempShow(t > 1.2 ? (t < 4.6 ? Math.round(lerp(25, 500, sm(seg(t, 1.2, 4.6)))) : t < 7.6 ? 500 : t < 9.2 ? 550 : 600) + NB + '°C' : null);
        camPath(RX_KEYS, t, true, 0.25);
      } },
    { id: 'wall', world: 'micro', dur: 7.6, scale: 'About 1,000× closer',
      caps: [[0, 'Zoom into the wall', 'The wall is made of tiny ZSM‑5 crystals glued together by clay. Gas moves through the gaps.']],
      enter() {
        key.intensity = 1.5; rim.position.set(14, 10, -8); rim.intensity = 2.2; rim.distance = 70;
        setFov(portrait() ? 58 : 48);
        lbl('cry', 'ZSM‑5 crystal').p.copy(LBL_CRY); lbl('pl', 'Bentonite clay').p.copy(LBL_PL);
      },
      update(t, dt) { LBL.cry.on = t > 1.0 && t < 6.0; LBL.pl.on = t > 1.6 && t < 6.0; updMicroGas(dt); camPath(MI_KEYS, t, false); } },
    { id: 'crack', world: 'nano', dur: 11.5, scale: 'About 1,000,000× closer',
      caps: [[0, 'Inside a zeolite pore', 'ZSM‑5 is full of tiny tunnels, about 0.55 nm wide. That is about 100,000 times thinner than a hair.'],
        [2.4, 'The acid site', 'Next to each aluminium atom there is an H⁺. This acid site is where the cracking happens.'],
        [5.2, 'Cracked!', 'The acid site breaks n‑heptane into smaller molecules, like propylene and butane. Then it is ready for the next one.']],
      enter() {
        W.nano.add(molGroup);
        key.intensity = 1.3; rim.position.set(-6, 6, -20); rim.intensity = 1.2; rim.distance = 60; acc.position.copy(siteH); acc.distance = 14;
        setFov(portrait() ? 64 : 52);
        lbl('si', 'Silicon (Si)').p.copy(Tp[3][2]); lbl('o', 'Oxygen (O)').p.copy(oxyLbl);
        lbl('al', 'Aluminium (Al)', '', 'l').p.copy(siteAl); lbl('h', 'Acid site (H⁺)', 'hot', 'r').p.copy(siteH);
        lbl('hep', 'n‑heptane, C₇H₁₆', '', 'l'); lbl('pro', 'Propylene, C₃H₆', 'hot', 'l'); lbl('but', 'Butane, C₄H₁₀', '', 'r');
      },
      update(t) {
        crackFrame(t); flushMol();
        LBL.si.on = LBL.o.on = t > 0.6 && t < 3.4;
        LBL.al.on = t > 2.4 && t < 5.0; LBL.h.on = t > 2.4;
        LBL.hep.on = t > 1.2 && t < 5.1; LBL.hep.p.copy(cenW.hep);
        LBL.pro.on = LBL.but.on = t > 6.2; LBL.pro.p.copy(cenW.pro); LBL.but.p.copy(cenW.but);
        eqEl.hidden = t < 5.7;
        camPath(NA_KEYS, t, false);
      } },
    { id: 'gc', world: 'gc', dur: 16, scale: 'Inside the GC oven', view: 'chart',
      caps: [[0, 'Measure with the GC', 'Inside the GC, helium carries our gas sample through a long, thin coiled column.'],
        [5.0, 'Measure with the GC', 'Small molecules come out first and bigger ones later. A flame detector makes a peak for each one.'],
        [10.6, 'Our real GC result', 'This is ZR‑2B at 500 °C. The biggest peak is propylene, the product we want.']],
      enter() {
        camera.near = 1; key.intensity = 1.3; acc.position.copy(gcw.det).add(_q4.set(0, 9, 4)); acc.distance = 60;
        setFov(portrait() ? 50 : 40);
        chartOn(true); drawChart(0);
        lbl('ginj', 'Sample in', '', 'r').p.copy(gcw.inj).add(_q4.set(0, 6.5, 0));
        lbl('gcol', 'Coiled column', '', 'r').p.set(13, -2, -8);
        lbl('gdet', 'Flame detector', 'hot', 'l').p.copy(gcw.det).add(_q4.set(0, 6.5, 0));
      },
      update(t, dt) {
        const m = gcFrame(t, dt); drawChart(m); infoShow(`GC time: ${f1(m)} min`);
        acc.intensity = gcw.flare * 3;
        LBL.ginj.on = t > 0.6 && t < 7; LBL.gcol.on = t > 2.5 && t < 9; LBL.gdet.on = t > 4;
        camPath(GC_KEYS, t, true, 0.3);
      } },
    { id: 'result', world: 'bars', dur: 13, scale: 'Measured by our GC',
      caps: [[0, 'The result', 'Propylene share of the products at 500 °C. All three printed catalysts beat the parent ZSM‑5.'],
        [BAR_TS[1][1], 'The result', 'At 550 °C, the printed catalysts still make more propylene than the parent.'],
        [BAR_TS[2][1], 'The result', `At 600 °C too. Our best result: ZR‑2B at 500 °C, with ${f1(runOf('zr2b', 500).prop)} % propylene.`]],
      enter() {
        camera.near = 1; key.position.set(-30, 60, 50); key.intensity = 2.0; setShadow(40);
        setFov(portrait() ? 46 : 36); barsTex();
      },
      update(t) {
        const TT = barsFrame(t); tempShow(TT + NB + '°C');
        const d = portrait() ? 150 : 96, a = -0.3 + t * 0.045;
        camera.position.set(Math.sin(a) * d, 0.3 * d, Math.cos(a) * d); camera.lookAt(0, 13, 0);
      } },
    { id: 'mix', world: 'surf', dur: Infinity, scale: 'Measured by our GC', view: 'mix',
      caps: [],
      enter() {
        W.surf.add(molGroup);
        key.intensity = 1.6; rim.position.set(-10, 6, -12); rim.intensity = 1.5; rim.distance = 80;
        setFov(portrait() ? 50 : 42);
        prodMols.length = 0; for (let k = 0; k < 100; k++) surfFrame(1 / 15, false);
        renderMix();
      },
      update(t, dt) {
        surfFrame(dt, true); flushMol();
        if (portrait()) { camera.position.set(Math.sin(t * 0.15) * 2, 13 + Math.sin(t * 0.1) * 0.6, 31); camera.lookAt(0, 8.5, -4); }
        else { camera.position.set(Math.sin(t * 0.15) * 2.5, 19 + Math.sin(t * 0.1), 25); camera.lookAt(0, 5.5, -2); }
      } }
  ];

  /* mix panel */
  const mixCat = $('#mixCat'), mixTemp = $('#mixTemp'), mixBars = $('#mixBars');
  mixCat.innerHTML = ZSM.map(k => `<button type="button" data-k="${k}" aria-pressed="false">${SAMPLES[k].name}</button>`).join('');
  mixTemp.innerHTML = [500, 550, 600].map(Tt => `<button type="button" data-t="${Tt}" aria-pressed="false">${Tt}${NB}°C</button>`).join('');
  mixBars.innerHTML = CATS.map(c => `<div class="mrow"><span class="nm"><i style="background:${c.col}"></i>${c.name}</span><span class="tr"><b style="width:0;background:${c.col}"></b></span><span class="v">0</span></div>`).join('');
  function renderMix() {
    const r = runOf(mixSel.k, mixSel.T);
    $$('button', mixCat).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === mixSel.k)));
    $$('button', mixTemp).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.t === mixSel.T)));
    $$('.mrow', mixBars).forEach((row, i) => { const v = r[CATS[i].k]; row.querySelector('b').style.width = clamp(v / 52 * 100, 0, 100).toFixed(2) + '%'; row.querySelector('.v').textContent = f1(v) + NB + '%'; });
    $('#mixConv').textContent = `${SAMPLES[mixSel.k].name} at ${mixSel.T}${NB}°C: ${f1(r.conv)}${NB}% of the n‑heptane reacted. The bars show each product’s share (mol${NB}%). The flying molecules are propylene, ethylene, butene, methane and propane.`;
  }
  mixCat.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { mixSel.k = b.dataset.k; renderMix(); } });
  mixTemp.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { mixSel.T = +b.dataset.t; renderMix(); } });

  /* progress */
  progEl.style.setProperty('--n', CH.length);
  progEl.innerHTML = CH.map((c, i) => `<button type="button" data-i="${i}" aria-label="Go to step ${i + 1}"><i><b></b></i></button>`).join('');
  const progB = $$('b', progEl);
  progEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) goCh(+b.dataset.i, true); });

  /* ---------- state ---------- */
  let mode = 'hero', ch = 0, chT = 0, paused = false, trans = false, capI = -1, entered = -1;
  let heroT = 0, rotY = 0.6, rotV = 0, dragging = false, lastX = 0, introDone = RM;
  let HL = { d: 60, ox: 0, oy: 0, Wd: 1, Hd: 1 };

  function resetScene() {
    W.macro.add(piece); piece.position.set(0, 0, 0); piece.rotation.set(0, 0, 0); fullPiece(); setAO(true);
    clay.color.copy(CAL); clay.emissiveIntensity = 0; clay.roughness = 0.88;
    key.position.set(-34, 46, 30); key.intensity = 2.0; setShadow(13); hemi.intensity = 0.32;
    rim.intensity = 0; acc.intensity = 0;
    bed.visible = false; nozzle.visible = false; printer.visible = false; rx.visible = false; halo.visible = false; embers.visible = false; floor.visible = false;
    if (molGroup.parent) molGroup.parent.remove(molGroup);
    infoShow(null); chartOn(false); camera.near = 0.1;
  }
  function heroState() {
    resetScene(); setWorld('macro');
    halo.visible = true; embers.visible = !RM; floor.visible = true;
    piece.rotation.set(0, rotY, 0);
    key.intensity = 2.5; rim.position.set(17, 3, -11); rim.intensity = 7; rim.distance = 60;
    setFov(34);
  }
  function heroLayout() {
    const hr = stage.getBoundingClientRect(), Wd = hr.width, Hd = hr.height;
    if (!Wd || !Hd) return;
    const t = $('#heroTop').getBoundingClientRect(), b = $('#heroBot').getBoundingClientRect();
    const T_ = { r: t.right - hr.left, t: t.top - hr.top, b: t.bottom - hr.top }, B_ = { r: b.right - hr.left, t: b.top - hr.top };
    const textR = Math.max(T_.r, B_.r), textT = Math.min(T_.t, B_.t);
    const regs = [
      { x0: textR + 24, x1: Wd - 20, y0: 64, y1: Hd - 24 },
      { x0: 12, x1: Wd - 12, y0: T_.b + 6, y1: B_.t - 40, hint: true },
      { x0: 12, x1: Wd - 12, y0: 64, y1: textT - 12 }
    ];
    let best = null, bs = 0;
    for (const g of regs) { const rw = g.x1 - g.x0, rh = g.y1 - g.y0; if (rw < 90 || rh < 90) continue; const s = Math.min(rw / 15, rh / 19.5); if (s > bs) { bs = s; best = g; } }
    if (!best) { best = { x0: 0, x1: Wd, y0: 0, y1: Hd }; bs = Math.min(Wd / 15, Hd / 19.5); }
    const px = Math.min(bs, 32), cx = (best.x0 + best.x1) / 2, cy = (best.y0 + best.y1) / 2;
    HL = { d: Hd / (2 * px * Math.tan(34 * D2R / 2)), ox: -(cx - Wd / 2), oy: -(cy - Hd / 2), Wd, Hd };
    heroEl.style.setProperty('--hintY', Math.round(best.hint ? B_.t - 34 : Hd - 40) + 'px');
  }
  function heroUpdate(dt) {
    heroT += dt;
    if (!introDone) {
      let all = true;
      layers.forEach((l, L) => { const k = eio(seg(heroT, 0.15 + L * 0.055, 0.9 + L * 0.055)); l.position.y = (1 - k) * 36; if (k < 1) all = false; });
      if (all) introDone = true;
    }
    if (!dragging) { rotV *= Math.pow(0.04, dt); rotY += ((RM ? 0 : 0.28) + rotV) * dt; }
    piece.rotation.y = rotY;
    if (embers.visible) {
      for (let i = 0; i < NE; i++) { let y = ePos[i * 3 + 1] + eSp[i] * dt; if (y > 15) y = -13; ePos[i * 3 + 1] = y; ePos[i * 3] += Math.sin(heroT * 0.7 + i) * 0.01; }
      eGeo.attributes.position.needsUpdate = true;
    }
    halo.material.opacity = 0.28 + 0.04 * Math.sin(heroT * 1.3);
    const e = 24 * D2R;
    camera.position.set(0, HL.d * Math.sin(e), HL.d * Math.cos(e)); camera.lookAt(0, 0, 0);
    camera.setViewOffset(HL.Wd, HL.Hd, HL.ox, HL.oy, HL.Wd, HL.Hd);
  }
  function viewOffset() {
    const v = CH[ch].view, w = stage.clientWidth, h = stage.clientHeight;
    if (v === 'mix') { if (w >= 900) camera.setViewOffset(w, h, 200, 0, w, h); else camera.setViewOffset(w, h, 0, h * 0.27, w, h); }
    else if (v === 'chart') { if (w >= 900) camera.setViewOffset(w, h, 230, 0, w, h); else camera.setViewOffset(w, h, 0, -h * 0.06, w, h); }
    else camera.clearViewOffset();
  }
  function applyUI() {
    const c = CH[ch];
    scaleEl.textContent = c.scale;
    const isMix = c.id === 'mix';
    mixEl.hidden = !isMix; ctrlEl.hidden = isMix; capEl.hidden = isMix; eqEl.hidden = true; tempShow(null);
    $('#tPrev').disabled = ch === 0;
    viewOffset();
  }
  function setCap(i, immediate) {
    const c = CH[ch].caps[i]; if (!c) return;
    const put = () => { capT.textContent = c[1]; capP.textContent = c[2]; capEl.classList.remove('swap'); };
    if (immediate || RM) put(); else { capEl.classList.add('swap'); setTimeout(put, 200); }
  }
  function goCh(i, fl) {
    i = clamp(i, 0, CH.length - 1);
    const run = () => { ch = i; entered = i; chT = 0; capI = -1; clearLabels(); resetScene(); setWorld(CH[i].world); CH[i].enter(); applyUI(); };
    if (fl && !RM) {
      trans = true; flashEl.classList.add('on');
      setTimeout(() => { run(); requestAnimationFrame(() => requestAnimationFrame(() => { flashEl.classList.remove('on'); trans = false; })); }, 280);
    } else run();
  }
  function setPlay() {
    playBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    $('#tPlayIc').innerHTML = paused ? '<path d="M4 2l10 6-10 6z" fill="currentColor"/>' : '<path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor"/>';
  }
  function frame(dt) {
    if (mode === 'hero') { heroUpdate(dt); return; }
    if (entered !== ch) return;
    const c = CH[ch];
    if (!paused && !trans) chT += dt;
    c.update(Math.min(chT, c.dur), dt);
    let ci = -1; c.caps.forEach((cp, i) => { if (chT >= cp[0]) ci = i; });
    if (ci !== capI) { setCap(ci, capI === -1); capI = ci; }
    progB.forEach((b, i) => { const w = i < ch ? 100 : i > ch ? 0 : (isFinite(c.dur) ? Math.min(100, chT / c.dur * 100) : 100); b.style.width = w.toFixed(1) + '%'; });
    if (chT >= c.dur && !trans) goCh(ch + 1, true);
  }

  /* ---------- loop ---------- */
  let raf = 0, last = 0, heroVis = true, dead = false;
  const active = () => !dead && !document.hidden && (mode === 'tour' || heroVis);
  function kick() { if (active() && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  const pf = { n: 0, acc: 0, step: 0 };
  function perf(dt) {
    if (pf.step >= 2) return;
    pf.n++; if (pf.n <= 30) return;
    pf.acc += dt;
    if (pf.n >= 110) {
      const avg = pf.acc / (pf.n - 30);
      if (avg > 1 / 34 && DPR > 1) { DPR = Math.max(1, DPR - 0.5); renderer.setPixelRatio(DPR); resize(); pf.step++; } else pf.step = 2;
      pf.n = 0; pf.acc = 0;
    }
  }
  function loop(now) {
    raf = 0;
    if (!active()) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    try { frame(dt); } catch (e) { console.warn(e); }
    renderer.render(scene, camera);
    if (mode === 'tour') updLabels();
    perf(dt);
    raf = requestAnimationFrame(loop);
  }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; asp = camera.aspect; camera.updateProjectionMatrix();
    if (mode === 'hero') heroLayout(); else { viewOffset(); if (!chartEl.hidden) chartOn(true); }
  }
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (mode === 'hero') heroLayout(); });
  new IntersectionObserver(es => { heroVis = es[es.length - 1].isIntersecting; kick(); }, { threshold: 0 }).observe(heroEl);
  document.addEventListener('visibilitychange', kick);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); dead = true; document.documentElement.classList.add('no-gl'); if (mode === 'tour') end(); });

  /* hero drag */
  canvas.addEventListener('pointerdown', e => { if (mode !== 'hero') return; dragging = true; lastX = e.clientX; rotV = 0; });
  window.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; rotY += dx * 0.009; rotV = clamp(dx * 0.5, -6, 6); });
  const endDrag = () => { dragging = false; };
  window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);

  /* tour controls */
  function start() {
    if (mode === 'tour' || dead) return;
    mode = 'tour'; dragging = false; entered = -1;
    document.body.classList.add('touring'); stage.classList.add('full'); tourEl.hidden = false;
    camera.clearViewOffset(); resize();
    paused = false; setPlay();
    goCh(0, true); kick();
    setTimeout(() => { const n = $('#tNext'); if (n) n.focus({ preventScroll: true }); }, 60);
  }
  function end(target) {
    mode = 'hero';
    document.body.classList.remove('touring'); stage.classList.remove('full'); tourEl.hidden = true;
    clearLabels(); heroState(); resize(); heroLayout();
    if (target) { const el = document.getElementById(target); if (el) el.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' }); }
    else { const b = $('#startBtn'); if (b) b.focus({ preventScroll: true }); }
    kick();
  }
  $('#tClose').addEventListener('click', () => end());
  $('#tNext').addEventListener('click', () => goCh(ch + 1, true));
  $('#tPrev').addEventListener('click', () => goCh(ch - 1, true));
  playBtn.addEventListener('click', () => { paused = !paused; setPlay(); });
  $('#mixRes').addEventListener('click', () => end('results'));
  $('#mixReplay').addEventListener('click', () => goCh(0, true));
  document.addEventListener('keydown', e => {
    if (mode !== 'tour') return;
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goCh(ch + 1, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goCh(ch - 1, true); }
    else if (e.key === ' ' && document.activeElement && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); paused = !paused; setPlay(); }
  });

  heroState(); resize(); heroLayout(); kick();
  return { start, end };
}
}
