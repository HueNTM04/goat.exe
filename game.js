import * as THREE from './three.module.min.js';

// ================= utils =================
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const hyp = Math.hypot;
const AR = { minX: -12, maxX: 12, minZ: -7, maxZ: 7 };
function angLerp(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }

// ================= renderer / scene =================
const canvas = $('#c');
const COARSE = matchMedia('(pointer: coarse)').matches;
// High-DPR phones are already sharp; MSAA there costs a lot of GPU for little gain.
// Some browsers/phones refuse the first set of options; fall back to lighter ones before giving up.
const renderer = (() => {
  const tries = [{ antialias: !(COARSE && devicePixelRatio >= 2), powerPreference: 'high-performance' }, { antialias: false }, { antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false, precision: 'mediump' }];
  for (const o of tries) { try { return new THREE.WebGLRenderer({ canvas, ...o }); } catch (e) { console.warn('WebGL retry', e && e.message); } }
  window.__goatBootFail?.('webgl'); throw new Error('GOAT_NO_WEBGL');
})();
canvas.addEventListener('webglcontextlost', e => e.preventDefault()); // lets the browser restore the 3D view instead of freezing
// Render at the screen's real pixel density (capped at 2) so the 3D scene isn't upscaled and blurry.
let pixelCap = 2;
renderer.setPixelRatio(Math.min(devicePixelRatio, pixelCap));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = COARSE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x160828);
scene.fog = new THREE.Fog(0x160828, 45, 95);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xd8e4ff, 0x4a2070, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-8, 22, 12); sun.castShadow = true;
sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 14, bottom: -14, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const pl1 = new THREE.PointLight(0xff3fd8, 60, 40, 1.4); pl1.position.set(-12, 6, -6); scene.add(pl1);
const pl2 = new THREE.PointLight(0x3fe8ff, 60, 40, 1.4); pl2.position.set(12, 6, -6); scene.add(pl2);

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, flatShading: true, ...o });
const EM = (color, i = 1.6) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: i, roughness: 0.4 });
const BM = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData = { canvas: c, g }; return t;
}
const labelCache = new Map();
function labelTex(text, bg = '#ff2bd6', fg = '#fff', w = 512, h = 128, size = 64) {
  const key = [text, bg, fg, w, h, size].join('|');
  if (labelCache.has(key)) return labelCache.get(key);
  const t = makeLabelTex(text, bg, fg, w, h, size); t.userData.cached = true; labelCache.set(key, t); return t;
}
function makeLabelTex(text, bg, fg, w, h, size) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; roundRect(g, 4, 4, w - 8, h - 8, 24); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const font = px => `900 ${px}px Arial, sans-serif`, maxW = w - 40;
    let fs = Math.min(size, h * .62); g.font = font(fs);
    const words = String(text).split(' ');
    // Shared readability rule: on tall signs, long text wraps onto two larger lines instead of shrinking.
    if (g.measureText(text).width > maxW && words.length > 1 && h >= w * .28) {
      let best = null;
      for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '); const m = Math.max(g.measureText(a).width, g.measureText(b).width); if (!best || m < best.m) best = { a, b, m }; }
      fs = Math.min(h * .36, fs * maxW / best.m); g.font = font(fs);
      g.fillText(best.a, w / 2, h / 2 - fs * .56 + 4, maxW); g.fillText(best.b, w / 2, h / 2 + fs * .56 + 4, maxW);
    } else g.fillText(text, w / 2, h / 2 + 4, maxW);
  });
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// In-world text labels share one readability rule: they grow on small screens so their
// letters reach a readable pixel height, anchored at the bottom so they grow upward, away from the object.
const labelSprites = new Set(); let labelK = 1;
const LABEL_PPU = 33; // on-screen pixels per world unit at which labels are comfortably readable
function sprite(tex, w, h) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false })); s.scale.set(w, h, 1);
  if (tex.userData?.cached) { s.userData.base = [w, h]; labelSprites.add(s); applyLabelScale(s); }
  return s;
}
function applyLabelScale(s) { const [w, h] = s.userData.base; s.scale.set(w * labelK, h * labelK, 1); s.center.set(0.5, 0.5 / labelK); }
function updateLabelScale() {
  const ppu = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * CAM.dist);
  labelK = Math.min(1.6, Math.max(1, LABEL_PPU / ppu));
  for (const s of labelSprites) applyLabelScale(s);
}
function sh(m) { m.castShadow = true; m.receiveShadow = true; return m; }

// ================= static arena =================
const floorTex = canvasTex(1024, 600, (g, w, h) => {
  g.fillStyle = '#2a1450'; g.fillRect(0, 0, w, h);
  const cs = w / 24;
  for (let i = 0; i < 24; i++) for (let j = 0; j < 14; j++) { if ((i + j) % 2) { g.fillStyle = '#321a5e'; g.fillRect(i * cs, j * (h / 14), cs, h / 14); } }
  g.strokeStyle = '#7a4cff'; g.lineWidth = 2; g.globalAlpha = 0.55;
  for (let i = 0; i <= 24; i++) { g.beginPath(); g.moveTo(i * cs, 0); g.lineTo(i * cs, h); g.stroke(); }
  for (let j = 0; j <= 14; j++) { g.beginPath(); g.moveTo(0, j * h / 14); g.lineTo(w, j * h / 14); g.stroke(); }
  g.globalAlpha = 1; g.strokeStyle = '#ff2bd6'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
});
const floorMat = M(0xffffff, { map: floorTex, flatShading: false, roughness: 0.8 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), floorMat);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const stage = new THREE.Mesh(new THREE.CylinderGeometry(24, 25, 1.2, 40), M(0x1e0c3a));
stage.position.y = -0.61; stage.scale.z = 0.62; stage.receiveShadow = true; scene.add(stage);
const stageRing = new THREE.Mesh(new THREE.TorusGeometry(24.2, 0.12, 6, 60), EM(0x3ff0ff, 2));
stageRing.rotation.x = Math.PI / 2; stageRing.scale.y = 0.62; stageRing.position.y = 0.02; scene.add(stageRing);
// borders
const borderMat = M(0x4a2a8a), stripA = EM(0xff2bd6, 2.2), stripB = EM(0x3ff0ff, 2.2);
function border(x, z, w, d, strip) {
  const b = sh(new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), borderMat)); b.position.set(x, 0.3, z); scene.add(b);
  const s = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.1, d + 0.02), strip); s.position.set(x, 0.62, z); scene.add(s);
}
border(0, -7.25, 25, 0.5, stripB); border(0, 7.25, 25, 0.5, stripA); border(-12.25, 0, 0.5, 14, stripA); border(12.25, 0, 0.5, 14, stripB);
// backdrop
const back = new THREE.Mesh(new THREE.BoxGeometry(34, 10, 1), M(0x22104a)); back.position.set(0, 4.4, -10.6); back.receiveShadow = true; scene.add(back);
const bulbMat = EM(0xffe14a, 2.5), bulbs = [];
{ const xs = []; for (let i = -15; i <= 15; i += 1.5) xs.push(i); const geo = new THREE.SphereGeometry(0.16, 8, 6), m4 = new THREE.Matrix4();
  for (let k = 0; k < 3; k++) { const idx = xs.map((x, i) => i).filter(i => i % 3 === k); const im = new THREE.InstancedMesh(geo, bulbMat.clone(), idx.length);
    idx.forEach((i, j) => im.setMatrixAt(j, m4.makeTranslation(xs[i], 9, -10.05))); im.userData.k = k; im.frustumCulled = false; scene.add(im); bulbs.push(im); } }
for (let s of [-1, 1]) {
  const tower = sh(new THREE.Mesh(new THREE.BoxGeometry(3, 7, 2.4), M(0x2c1460))); tower.position.set(s * 15.5, 3.5, -8); scene.add(tower);
  for (let k = 0; k < 4; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.15, 2.45), k % 2 ? stripA : stripB); st.position.set(s * 15.5, 1.2 + k * 1.6, -8); scene.add(st); }
}
// AI monitor
const faceTex = canvasTex(512, 300, () => { });
const monitor = new THREE.Group();
const frameM = sh(new THREE.Mesh(new THREE.BoxGeometry(8, 4.9, 0.6), M(0x111122)));
const screen = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 4.3), new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false }));
screen.position.z = 0.31;
const frameGlow = new THREE.Mesh(new THREE.BoxGeometry(8.3, 5.2, 0.4), EM(0x3ff0ff, 1.5)); frameGlow.position.z = -0.1;
monitor.add(frameGlow, frameM, screen); monitor.position.set(0, 3.9, -9.6); scene.add(monitor);
const sign = sprite(labelTex("MC AI", '#10052a', '#3ff0ff', 512, 110, 70), 3.2, 0.7); sign.position.set(0, 6.9, -9.5); scene.add(sign);
// spotlight cones
const cones = [];
for (let i = 0; i < 4; i++) {
  const c = new THREE.Mesh(new THREE.ConeGeometry(2.6, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff2bd6 : 0x3ff0ff, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  c.geometry.translate(0, -7, 0); const p = new THREE.Group(); p.add(c); p.position.set(-12 + i * 8, 13, -6); scene.add(p); cones.push(p);
}

// ================= AI face =================
const face = { expr: 'smug', talk: false, mouth: 0, glitch: 0 };
function drawFace() {
  const g = faceTex.userData.g, w = 512, h = 300;
  g.fillStyle = face.expr === 'angry' ? '#1a0410' : '#070414'; g.fillRect(0, 0, w, h);
  const col = { angry: '#ff3b5c', shock: '#ffe14a', glitch: '#ff2bd6', dead: '#888', happy: '#4bff8a' }[face.expr] || '#3ff0ff';
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 16; g.lineCap = 'round';
  const e = face.expr, ex = [170, 342], ey = 115;
  for (let i = 0; i < 2; i++) {
    const x = ex[i]; g.beginPath();
    if (e === 'smug') { g.moveTo(x - 40, ey + 6); g.lineTo(x + 40, ey + 6); g.stroke(); g.beginPath(); g.arc(x, ey + 10, 22, 0, Math.PI); g.fill(); }
    else if (e === 'angry') { g.arc(x, ey + 12, 26, 0, Math.PI * 2); g.fill(); g.beginPath(); const s = i ? -1 : 1; g.moveTo(x - 46 * s, ey - 40); g.lineTo(x + 30 * s, ey - 12); g.stroke(); }
    else if (e === 'shock') { g.arc(x, ey, 40, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x, ey, 12, 0, Math.PI * 2); g.fill(); }
    else if (e === 'dead') { g.moveTo(x - 30, ey - 30); g.lineTo(x + 30, ey + 30); g.moveTo(x + 30, ey - 30); g.lineTo(x - 30, ey + 30); g.stroke(); }
    else if (e === 'happy') { g.arc(x, ey + 20, 34, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    else { g.arc(x + rand(-10, 10), ey + rand(-10, 10), 30, 0, Math.PI * 2); g.fill(); }
  }
  g.beginPath();
  if (face.talk && face.mouth) { g.ellipse(256, 222, 50, e === 'shock' ? 40 : 26, 0, 0, Math.PI * 2); g.fill(); }
  else if (e === 'smug') { g.moveTo(190, 220); g.quadraticCurveTo(280, 250, 330, 200); g.stroke(); }
  else if (e === 'angry') { g.moveTo(180, 240); g.quadraticCurveTo(256, 190, 332, 240); g.stroke(); }
  else if (e === 'shock') { g.ellipse(256, 228, 34, 40, 0, 0, Math.PI * 2); g.stroke(); }
  else if (e === 'happy') { g.moveTo(180, 205); g.quadraticCurveTo(256, 275, 332, 205); g.stroke(); }
  else { g.moveTo(180, 225); for (let x = 180; x < 340; x += 20) g.lineTo(x, 225 + rand(-20, 20)); g.stroke(); }
  // scanlines
  g.fillStyle = '#ffffff08'; for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
  if (face.glitch > 0) { for (let k = 0; k < 8; k++) { const y = rand(0, h), hh = rand(5, 30); g.drawImage(g.canvas, 0, y, w, hh, rand(-40, 40), y, w, hh); } g.fillStyle = '#ff2bd633'; g.fillRect(0, rand(0, h), w, rand(10, 40)); }
  faceTex.needsUpdate = true;
}
function setFace(e) { face.expr = e; drawFace(); }
drawFace();

// ================= audio =================
let ac = null, master = null, noiseBuf = null;
function initAudio() {
  try {
    if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    if (ac.state !== 'running' && !paused) ac.resume?.();
  } catch (e) { }
}
function tone(f, d = 0.15, type = 'square', v = 0.08, f2 = null, delay = 0) {
  if (!ac) return; const t = ac.currentTime + delay; const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + d); o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.03);
}
function noise(d = 0.2, v = 0.1, freq = 1000, type = 'bandpass', delay = 0) {
  if (!ac) return; const t = ac.currentTime + delay; const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ac.createGain();
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + d); s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + d + 0.03);
}
const SFX = {
  dash() { noise(0.18, 0.15, 2200, 'highpass'); tone(260, 0.14, 'sine', 0.06, 620); },
  hit() { tone(140, 0.3, 'triangle', 0.4, 45); noise(0.16, 0.35, 900); tone(900, 0.08, 'square', 0.05, 1400, 0.02); },
  bonk() { tone(220, 0.22, 'sine', 0.3, 70); noise(0.1, 0.2, 500, 'lowpass'); },
  clang() { tone(1250, 0.45, 'triangle', 0.13, 1190); tone(1870, 0.3, 'sine', 0.07); noise(0.06, 0.15, 3000); },
  boing() { tone(180, 0.55, 'sine', 0.25, 950); },
  good() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, 'square', 0.06, null, i * 0.08)); },
  bad() { tone(320, 0.35, 'sawtooth', 0.09, 110); },
  blip() { tone(rand(380, 760), 0.04, 'square', 0.022); },
  grab() { tone(600, 0.09, 'square', 0.05, 950); },
  drop() { tone(520, 0.09, 'square', 0.05, 300); },
  open() { tone(110, 0.8, 'sawtooth', 0.08, 260); noise(0.8, 0.06, 400, 'lowpass'); },
  glitch() { for (let i = 0; i < 10; i++) tone(rand(80, 2200), 0.05, 'sawtooth', 0.06, rand(80, 2200), i * 0.035); noise(0.4, 0.1, 3000, 'highpass'); },
  fanfare() { [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, i === 6 ? 0.6 : 0.16, 'square', 0.07, null, i * 0.13)); },
  step() { noise(0.04, 0.03, 1800); },
  zap() { tone(900, 0.2, 'sawtooth', 0.08, 120); noise(0.15, 0.12, 2500, 'highpass'); },
};

// ================= FX: particles, rings, floaters, shake =================
const parts = []; const partGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
const PART_MAX = 361; // same cap as before
const partMesh = new THREE.InstancedMesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), PART_MAX);
partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); partMesh.count = 0; partMesh.frustumCulled = false;
partMesh.setColorAt(0, new THREE.Color(0xffffff)); partMesh.instanceColor.setUsage(THREE.DynamicDrawUsage); scene.add(partMesh);
const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _pe = new THREE.Euler(), _ps = new THREE.Vector3(), _pc = new THREE.Color();
let partSkip = 0;
function spawnPart(x, y, z, vx, vy, vz, color, life = 0.7, size = 1, grav = 18) {
  if (quality >= 2 && (partSkip++ & 1)) return; // only when the phone is struggling
  let p = parts.find(p => !p.alive);
  if (!p) { if (parts.length >= PART_MAX) return; p = { pos: new THREE.Vector3(), rx: 0, ry: 0, color: 0 }; parts.push(p); }
  p.alive = true; p.color = color; p.pos.set(x, y, z); p.rx = p.ry = 0;
  if (p.v) p.v.set(vx, vy, vz); else p.v = new THREE.Vector3(vx, vy, vz); p.life = p.max = life; p.size = size; p.grav = grav; p.spin = rand(-10, 10);
}
function burst(x, y, z, n, colors, speed = 6, up = 4, life = 0.6, size = 1, grav = 18) {
  for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed; spawnPart(x, y, z, Math.cos(a) * s, rand(0.3, 1) * up, Math.sin(a) * s, pick(colors), life * rand(0.6, 1.2), size * rand(0.6, 1.3), grav); }
}
function confetti(n = 120) { for (let i = 0; i < n; i++) spawnPart(rand(-11, 11), rand(8, 13), rand(-6, 6), rand(-1, 1), rand(-2, 0), rand(-1, 1), pick([0xff2bd6, 0x3ff0ff, 0xffe14a, 0x4bff8a, 0xffffff]), rand(2.5, 4), rand(0.8, 1.4), 3); }
const rings = [];
function ringFX(x, z, color = 0xffffff, maxS = 3) {
  let r = rings.find(r => !r.alive);
  if (!r) { const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 32), BM(0xffffff, { transparent: true, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; scene.add(m); r = { m }; rings.push(r); }
  r.alive = true; r.m.visible = true; r.t = 0; r.maxS = maxS; r.m.material.color.set(color); r.m.position.set(x, 0.08, z);
}
const floaters = [];
function floatText(text, x, y, z, cls = '') {
  const el = document.createElement('div'); el.className = 'floater ' + cls; el.textContent = text; $('#floaters').appendChild(el);
  floaters.push({ el, p: new THREE.Vector3(x, y, z), t: 0 });
}
let shake = 0, hitstop = 0;
const tmpV = new THREE.Vector3();
function toScreen(x, y, z) { tmpV.set(x, y, z).project(camera); return [(tmpV.x * 0.5 + 0.5) * innerWidth, (-tmpV.y * 0.5 + 0.5) * innerHeight, tmpV.z]; }
function updateFX(dt) {
  let n = 0;
  for (const p of parts) {
    if (!p.alive) continue; p.life -= dt; if (p.life <= 0) { p.alive = false; continue; }
    p.v.y -= p.grav * dt; p.pos.addScaledVector(p.v, dt);
    if (p.pos.y < 0.06) { p.pos.y = 0.06; p.v.y *= -0.4; p.v.x *= 0.7; p.v.z *= 0.7; }
    p.rx += p.spin * dt; p.ry += p.spin * dt;
    const s = p.size * Math.min(1, p.life / p.max * 2);
    _pq.setFromEuler(_pe.set(p.rx, p.ry, 0)); _pm.compose(p.pos, _pq, _ps.set(s, s, s));
    partMesh.setMatrixAt(n, _pm); partMesh.setColorAt(n, _pc.setHex(p.color)); n++;
  }
  if (n || partMesh.count) { partMesh.count = n; partMesh.instanceMatrix.needsUpdate = true; partMesh.instanceColor.needsUpdate = true; }
  for (const r of rings) { if (!r.alive) continue; r.t += dt * 2.6; if (r.t >= 1) { r.alive = false; r.m.visible = false; continue; } r.m.scale.setScalar(0.3 + r.t * r.maxS); r.m.material.opacity = 1 - r.t; }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt; if (f.t > 1.1) { f.el.remove(); floaters.splice(i, 1); continue; }
    const [sx, sy] = toScreen(f.p.x, f.p.y + f.t * 1.6, f.p.z);
    const sc = f.t < 0.12 ? f.t / 0.12 * 1.3 : 1;
    f.el.style.transform = `translate(${Math.round(sx)}px,${Math.round(sy)}px) translate(-50%,-50%)` + (sc !== 1 ? ` scale(${sc})` : ''); f.el.style.opacity = f.t > 0.8 ? (1.1 - f.t) / 0.3 : 1;
  }
}

// ================= world state =================
let walls = [], circles = [], bodies = [], roundMeshes = [];
function addMesh(m, rise = true) { scene.add(m); roundMeshes.push(m); if (rise) { m.userData.ty = m.position.y; m.position.y -= 3; } return m; }
const wallMats = [M(0x6a3cff), M(0x3c7bff), M(0xff4fa8)];
function addWall(minX, maxX, minZ, maxZ, h = 1.3, mat = wallMats[0], strip = stripB) {
  const g = new THREE.Group();
  const w = maxX - minX, d = maxZ - minZ;
  const box = sh(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); box.position.y = h / 2; g.add(box);
  const s = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.08, 0.07), strip); s.position.set(0,h+0.02,d/2);g.add(s);
  const backEdge=s.clone();backEdge.position.z=-d/2;g.add(backEdge);
  for(const side of [-1,1]){const e=new THREE.Mesh(new THREE.BoxGeometry(.07,.08,d),strip);e.position.set(side*w/2,h+.02,0);g.add(e);}
  g.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2); addMesh(g);
  const wall = { minX, maxX, minZ, maxZ, mesh: g, disabled: false }; walls.push(wall); return wall;
}
function makeBody(o) {
  const b = Object.assign({ x: 0, z: 0, vx: 0, vz: 0, y: 0, vy: 0, r: 0.5, mass: 1, friction: 8, bounce: 0.4, physics: false, fixed: false, hittable: false, grabbable: false, noCollide: false, mesh: null, kind: 'thing', update: null, onHeadbutt: null, hint: null }, o);
  bodies.push(b); if (b.mesh) { scene.add(b.mesh); roundMeshes.push(b.mesh); } return b;
}
function resolveStatic(b) {
  let hit = null; const r = b.r;
  for (const w of walls) {
    if (w.disabled) continue;
    const cx = clamp(b.x, w.minX, w.maxX), cz = clamp(b.z, w.minZ, w.maxZ);
    let dx = b.x - cx, dz = b.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      let nx, nz, push;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; push = r - d; }
      else { const l = b.x - w.minX, rr = w.maxX - b.x, t = b.z - w.minZ, bb = w.maxZ - b.z; const m = Math.min(l, rr, t, bb);
        if (m === l) { nx = -1; nz = 0; push = l + r; } else if (m === rr) { nx = 1; nz = 0; push = rr + r; } else if (m === t) { nx = 0; nz = -1; push = t + r; } else { nx = 0; nz = 1; push = bb + r; } }
      b.x += nx * push; b.z += nz * push; hit = { nx, nz, wall: w };
    }
  }
  for (const c of circles) {
    const dx = b.x - c.x, dz = b.z - c.z, d = hyp(dx, dz), m = r + c.r;
    if (d < m) { const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0; b.x = c.x + nx * m; b.z = c.z + nz * m; hit = { nx, nz, circle: c }; }
  }
  if (b.x < AR.minX + r) { b.x = AR.minX + r; hit = { nx: 1, nz: 0, edge: true }; }
  if (b.x > AR.maxX - r) { b.x = AR.maxX - r; hit = { nx: -1, nz: 0, edge: true }; }
  if (b.z < AR.minZ + r) { b.z = AR.minZ + r; hit = { nx: 0, nz: 1, edge: true }; }
  if (b.z > AR.maxZ - r) { b.z = AR.maxZ - r; hit = { nx: 0, nz: -1, edge: true }; }
  return hit;
}
function stepBody(b, dt) {
  b.x += b.vx * dt; b.z += b.vz * dt;
  const sp = hyp(b.vx, b.vz);
  if (sp > 0) { const ns = Math.max(0, sp - b.friction * dt); b.vx *= ns / sp; b.vz *= ns / sp; }
  const h = resolveStatic(b);
  if (h) { const vn = b.vx * h.nx + b.vz * h.nz; if (vn < 0) { b.vx -= (1 + b.bounce) * vn * h.nx; b.vz -= (1 + b.bounce) * vn * h.nz; if (-vn > 3 && b.onWall) b.onWall(h, -vn); } }
  if (b.y > 0 || b.vy !== 0) { b.vy -= 28 * dt; b.y += b.vy * dt; if (b.y <= 0) { b.y = 0; b.vy = b.vy < -3 ? -b.vy * 0.3 : 0; } }
  return h;
}
function separateBodies() {
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    if (a.noCollide || b.noCollide) continue;
    if ((a === goat && b === goat.held) || (b === goat && a === goat.held)) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz), m = a.r + b.r;
    if (d >= m) continue;
    const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0, ov = m - d;
    const ia = a.fixed ? 0 : 1 / a.mass, ib = b.fixed ? 0 : 1 / b.mass; if (ia + ib === 0) continue;
    a.x -= nx * ov * ia / (ia + ib); a.z -= nz * ov * ia / (ia + ib);
    b.x += nx * ov * ib / (ia + ib); b.z += nz * ov * ib / (ia + ib);
    if (a === goat && b.physics && b.mass < 1) { b.vx += nx * 1.5; b.vz += nz * 1.5; }
    if (b === goat && a.physics && a.mass < 1) { a.vx -= nx * 1.5; a.vz -= nz * 1.5; }
    if (!a.fixed) resolveStatic(a); if (!b.fixed) resolveStatic(b);
  }
}

// ================= models =================
function makeStars() {
  const g = new THREE.Group(); const m = EM(0xffe14a, 2);
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), m); const a = i / 3 * Math.PI * 2; s.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45); g.add(s); }
  g.visible = false; return g;
}
function makeGoatModel() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const white = M(0xfbf8f2), cream = M(0xf1e2c8), dark = M(0x2a2233), pink = M(0xffb3c6), horn = M(0xd9b26a);
  const torso = sh(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.6, 1.0), white)); torso.position.y = 0.72; body.add(torso);
  for (const [x, y, z, s] of [[0, 1.05, 0.05, 0.3], [0.22, 0.98, -0.25, 0.25], [-0.22, 0.98, -0.25, 0.25], [0.25, 0.95, 0.25, 0.22], [-0.25, 0.95, 0.25, 0.22], [0, 1.0, -0.4, 0.24]]) { const p = sh(new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), white)); p.position.set(x, y, z); body.add(p); }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 5), white); tail.position.set(0, 0.95, -0.55); tail.rotation.x = -2.2; body.add(tail);
  const head = new THREE.Group(); head.position.set(0, 1.12, 0.52); body.add(head);
  const skull = sh(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.48, 0.5), white)); head.add(skull);
  const snout = sh(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.26), cream)); snout.position.set(0, -0.1, 0.32); head.add(snout);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.04), pink); nose.position.set(0, -0.03, 0.46); head.add(nose);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 5), cream); beard.position.set(0, -0.33, 0.33); beard.rotation.x = Math.PI; head.add(beard);
  const eyes = [];
  for (const s of [-1, 1]) {
    const eW = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), BM(0xffffff)); eW.position.set(s * 0.2, 0.06, 0.2); eW.scale.z = 0.6; head.add(eW);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), BM(0x111122)); pu.position.set(s * 0.21, 0.06, 0.255); head.add(pu); eyes.push(eW, pu);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), BM(0xffffff)); hl.position.set(s * 0.23, 0.09, 0.3); head.add(hl); eyes.push(hl);
    const ear = sh(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.14), white)); ear.position.set(s * 0.34, 0.05, -0.05); ear.rotation.z = s * -0.5; head.add(ear);
    const ein = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.09), pink); ein.position.set(s * 0.35, 0.09, -0.05); ein.rotation.z = s * -0.5; head.add(ein);
    const hg = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.065, 6, 10, Math.PI * 0.75), horn); hg.castShadow = true;
    hg.position.set(s * 0.15, 0.22, -0.18); hg.rotation.set(0, Math.PI / 2, 0); hg.rotation.z = 0.2; head.add(hg);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), BM(0xff9bb5)); cheek.position.set(s * 0.21, -0.08, 0.26); cheek.scale.z = 0.3; head.add(cheek);
  }
  const legs = [];
  for (const [x, z] of [[-0.25, 0.35], [0.25, 0.35], [-0.25, -0.35], [0.25, -0.35]]) {
    const piv = new THREE.Group(); piv.position.set(x, 0.5, z); body.add(piv);
    const l = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.42, 6), white)); l.position.y = -0.2; piv.add(l);
    const hf = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.1, 6), dark); hf.position.y = -0.44; piv.add(hf); legs.push(piv);
  }
  const stars = makeStars(); stars.position.set(0, 1.7, 0.4); body.add(stars);
  const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), BM(0x000000, { transparent: true, opacity: 0.25, depthWrite: false })); shadowBlob.rotation.x = -Math.PI / 2; shadowBlob.position.y = 0.03; root.add(shadowBlob);
  return { root, body, head, legs, eyes, stars, tail, shadowBlob };
}

// ================= goat =================
const GM = makeGoatModel(); scene.add(GM.root);
const goat = { x: -10, z: 0, vx: 0, vz: 0, y: 0, r: 0.48, mass: 1, kind: 'goat', facing: Math.PI / 2, tFacing: Math.PI / 2, dashT: 0, dashCd: 0, dashDir: { x: 1, z: 0 }, hitSet: null, held: null, launch: null, hurtT: 0, invT: 0, dizzyT: 0, walk: 0, blink: 2, happyT: 0, squash: 0 };
bodies.push(goat);
const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), M(0xd9b26a)); rope.visible = false; scene.add(rope);
const DASH_SPEED = 18, DASH_TIME = 0.2, DASH_CD = 0.42, WALK = 6.8;

// ================= input =================
const keys = {}; let touchMode = matchMedia('(pointer: coarse)').matches; document.body.classList.toggle('touch', touchMode);
const joy = { x: 0, y: 0, id: null };
const CAM = { yaw: 0.4, pitch: 0.95, target: new THREE.Vector3(0, 0, -0.3), dist: 30, portrait: false };
function inputDir() {
  let ix = 0, iy = 0;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (keys.KeyW || keys.ArrowUp) iy += 1; if (keys.KeyS || keys.ArrowDown) iy -= 1;
  ix += joy.x; iy += joy.y;
  let m = hyp(ix, iy); if (m > 1) { ix /= m; iy /= m; m = 1; }
  const s = Math.sin(CAM.yaw), c = Math.cos(CAM.yaw);
  // right = (c, -s), forward = (-s, -c)
  return { x: c * ix - s * iy, z: -s * ix - c * iy, m };
}
function setTouch(v) { if (touchMode !== v) { touchMode = v; document.body.classList.toggle('touch', v); fitCam(); } }
// mobile: block page scroll / zoom gestures outside scrollable overlays
document.addEventListener('touchmove', e => { if (!e.target.closest?.('.overlay.show')) e.preventDefault(); }, { passive: false });
['gesturestart', 'gesturechange', 'dblclick', 'contextmenu'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
function tryLandscape() {
  if (!touchMode) return;
  try {
    const lock = () => window.screen?.orientation?.lock?.('landscape')?.catch?.(() => {});
    const de = document.documentElement;
    if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen({ navigationUI: 'hide' }).then(lock, lock); else lock();
  } catch (e) { }
}
const rotatePause = () => touchMode && innerHeight > innerWidth;
addEventListener('keydown', e => {
  setTouch(false); initAudio();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (paused) { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') resumeGame(); return; }
  if (phase === 'title' && (e.code === 'Space' || e.code === 'Enter')) { playMenu(); return; }
  if (phase === 'tutdone' && (e.code === 'Space' || e.code === 'Enter') && $('#tutDone').classList.contains('show')) { leaveTutorial(); return; }
  if (phase === 'ending' && (e.code === 'Space' || e.code === 'Enter') && realTime - endShownAt > 1.2) { startGame(); return; }
  if (e.code === 'Space') tryDash();
  if (e.code === 'KeyE') toggleGrab();
  if (e.code === 'KeyR') restartRound();
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) chip('move');
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; setTimeout(() => { if (!document.hasFocus() && performance.now() - menuActAt > 1500) pauseGame(); }, 350); });
let paused = false;
const PAUSABLE = ['play', 'dead', 'intro', 'clear'];
function releaseInputs() { for (const k in keys) keys[k] = false; joy.x = joy.y = 0; joy.id = null; const kn = $('#knob'); if (kn) kn.style.transform = ''; }
function pauseGame() {
  releaseInputs(); saveProgress();
  if (paused || !PAUSABLE.includes(phase)) return;
  paused = true; $('#pause')?.classList.add('show'); try { ac?.suspend?.(); } catch (e) { }
}
function resumeGame() {
  if (!paused) return; paused = false; $('#pause')?.classList.remove('show');
  last = performance.now(); initAudio(); fitCam();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
addEventListener('pagehide', () => saveProgress());
let pendingTouch = null;
addEventListener('pointerdown', e => {
  const v = e.pointerType === 'touch' ? true : e.pointerType === 'mouse' ? false : null; initAudio();
  if (v === null) return;
  if (e.target.closest?.('.overlay.show button')) { pendingTouch = v; E('#btnStart').classList.toggle('pressed', e.target.closest('#btnStart') !== null); } else setTouch(v);
}, true);
const flushTouch = () => { E('#btnStart').classList.remove('pressed'); if (pendingTouch !== null) { const v = pendingTouch; pendingTouch = null; setTouch(v); } };
addEventListener('click', flushTouch, true);
// A press that starts on CHƠI and is released anywhere near it counts, even if the browser drops the click.
let startPress = null;
$('#btnStart').addEventListener('pointerdown', e => { const r = e.currentTarget.getBoundingClientRect(); startPress = { id: e.pointerId, l: r.left - 20, r: r.right + 20, t: r.top - 20, b: r.bottom + 20, x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', e => {
  const p = startPress; startPress = null; if (!p || p.id !== e.pointerId) return;
  const inside = e.clientX >= p.l && e.clientX <= p.r && e.clientY >= p.t && e.clientY <= p.b, still = hyp(e.clientX - p.x, e.clientY - p.y) < 30;
  if (inside && still) setTimeout(() => { if (phase === 'title' && window.__goatReady) { flushTouch(); playMenu(); } }, 0); // normal clicks get there first; the phase guard stops doubles
}, true);
addEventListener('pointercancel', () => { startPress = null; }, true); // runs before the button's own handler, so CHƠI sees the right mode
addEventListener('pointercancel', flushTouch, true); addEventListener('pointerup', () => setTimeout(flushTouch, 400), true);
const joyEl = $('#joy'), knob = $('#knob');
let joyRect = null; // measured once per touch, not on every move
function joyMove(e) { const r = joyRect || (joyRect = joyEl.getBoundingClientRect()); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const m = hyp(dx, dy), max = r.width / 2; if (m > max) { dx *= max / m; dy *= max / m; } knob.style.transform = `translate(${dx}px,${dy}px)`; joy.x = dx / max; joy.y = -dy / max; if (hyp(joy.x, joy.y) < 0.15) joy.x = joy.y = 0; }
joyEl.addEventListener('pointerdown', e => { joyRect = joyEl.getBoundingClientRect(); joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); e.preventDefault(); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId === joy.id) joyMove(e); });
const joyEnd = e => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
$('#tDash').addEventListener('pointerdown', e => { e.preventDefault(); tryDash(); });
let lastGrabTap = -1;
$('#tGrab').addEventListener('pointerdown', e => { e.preventDefault(); if (e.timeStamp - lastGrabTap < 220) return; lastGrabTap = e.timeStamp; toggleGrab(); });
$('#btnRestart').addEventListener('click', () => restartRound());
$('#btnStart').addEventListener('click', () => playMenu());
$('#btnResume').addEventListener('click', e => { e.stopPropagation(); resumeGame(); });
function overlayFresh(sel) { return performance.now() - (+$(sel).dataset.at || 0) < 700; }
$('#btnTutorial').addEventListener('click', () => replayTutorialMenu());
$('#btnSkip').addEventListener('click', () => { if (round === T0) leaveTutorial(true); });
$('#btnTutNext').addEventListener('click', () => { if (overlayFresh('#tutDone')) return; leaveTutorial(); });
if (tutDone()) document.body.classList.add('tutDone');
setTimeout(() => { window.__goatReady = true; document.body.classList.remove('bootErr'); refreshMenu(); const b = $('#btnStart'); b.classList.remove('loading'); b.removeAttribute('aria-busy'); window.__goatReady = true; const q = window.__goatQueued; window.__goatQueued = null; if (q === 'play') playMenu(); else if (q === 'tutorial') replayTutorialMenu(); }, 0);
function chip(n) { const c = document.querySelector(`.chip[data-chip="${n}"]`); if (c) c.classList.add('done'); }

// ================= game state =================
let phase = 'title', roundIdx = 0, round = null, realTime = 0, gameTime = 0, lastProgress = 0, endShownAt = 0;
const stats = { time: 0, chaos: 0, mistakes: 0 };
let timers = [], timerGen = 0;
function after(t, fn) { timers.push({ t, fn, gen: timerGen }); }
function clearTimers() { timers = []; timerGen++; }
function runTimers(dt) { const due = []; for (const t of timers) { t.t -= dt; if (t.t <= 0) due.push(t); } timers = timers.filter(t => t.t > 0); for (const t of due) if (t.gen === timerGen) t.fn(); }
function progress() { lastProgress = gameTime; $('#hint').classList.remove('show'); }
function addChaos(n, x, z) { stats.chaos += n; const el = $('#sChaos'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); if (x !== undefined && n >= 25) floatText(`+${n} ĐIỂM PHÁ`, x, 2.4, z, 'chaos'); }
function mistake(x, z, label = "HỚ RỒI!") { stats.mistakes++; const el = $('#sMist'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); if (x !== undefined) floatText(label, x, 2.6, z, 'bad'); }

// ---------- dialog ----------
const dlg = { q: [], cur: null, t: 0, shown: 0 };
// Every line stays up long enough to read (2.5 s minimum, more for long Vietnamese lines).
const readMin = t => Math.min(6, Math.max(2.5, 1.2 + t.length * 0.045));
function say(text, expr = 'smug', hold, story) { dlg.q.push({ text, expr, hold: hold ?? (1.3 + text.length * 0.035), story }); }
// Story lines in cinematics can't be cut off mid-read; a new line waits for them instead.
function sayNow(text, expr, hold, story) {
  const c = dlg.cur;
  if ((c && c.story && dlg.t < c.text.length / 48 + readMin(c.text)) || dlg.q.some(l => l.story)) { dlg.q = dlg.q.filter(l => l.story); say(text, expr, hold, story); return; }
  dlg.q = []; dlg.cur = null; say(text, expr, hold, story);
}
function lineRead(l) { return dlg.cur !== l && !dlg.q.includes(l); }
function updateDialog(dt) {
  const box = $('#dialog');
  if (!dlg.cur && dlg.q.length) { dlg.cur = dlg.q.shift(); dlg.t = 0; dlg.shown = 0; setFace(dlg.cur.expr); box.classList.add('show'); box.classList.toggle('angry', dlg.cur.expr === 'angry' || dlg.cur.expr === 'glitch'); }
  if (!dlg.cur) { box.classList.remove('show'); if (face.talk) { face.talk = false; drawFace(); } return; }
  dlg.t += dt; const n = Math.min(dlg.cur.text.length, Math.floor(dlg.t * 48));
  if (n !== dlg.shown) { if (n % 3 === 0) SFX.blip(); dlg.shown = n; $('#dlgText').textContent = dlg.cur.text.slice(0, n); const talk = n < dlg.cur.text.length, mouth = (n >> 1) % 2; if (talk !== face.talk || mouth !== face.mouth) { face.talk = talk; face.mouth = mouth; drawFace(); } }
  if (dlg.t > dlg.cur.text.length / 48 + Math.max(dlg.cur.hold, readMin(dlg.cur.text))) { dlg.cur = null; }
}

// ---------- shared interaction ----------
const hlRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 36), BM(0xffe14a, { transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
hlRing.rotation.x = -Math.PI / 2; hlRing.visible = false; scene.add(hlRing);
function tryDash() {
  if (phase !== 'play' || goat.dashCd > 0 || goat.launch || goat.hurtT > 0) return;
  const d = inputDir(); let dx, dz;
  if (d.m > 0.2) { dx = d.x / d.m; dz = d.z / d.m; } else { dx = Math.sin(goat.facing); dz = Math.cos(goat.facing); }
  if (goat.held) releaseHeld(true);
  goat.dashDir = { x: dx, z: dz }; goat.facing = goat.tFacing = Math.atan2(dx, dz);
  goat.dashT = DASH_TIME; goat.dashCd = DASH_CD; goat.hitSet = new Set(); goat.squash = 1;
  SFX.dash(); burst(goat.x, 0.2, goat.z, 6, [0xffffff, 0xcccccc], 2, 2, 0.4);
  chip('dash'); if (round && round.onDash) round.onDash();
}
function toggleGrab() {
  if (phase !== 'play' || goat.launch) return;
  if (goat.held) { releaseHeld(); return; }
  let best = null, bd = 1e9;
  for (const b of bodies) { if (!b.grabbable) continue; const d = hyp(b.x - goat.x, b.z - goat.z) - b.r - goat.r; if (d < 0.9 && d < bd) { bd = d; best = b; } }
  if (best) { goat.held = best; best.vx = best.vz = 0; SFX.grab(); chip('grab'); floatText("KÉO ĐƯỢC RỒI!", best.x, 1.8, best.z, 'good'); if (best.onGrab) best.onGrab(); }
  else { floatText("CHƯA CÓ GÌ ĐỂ KÉO", goat.x, 2.2, goat.z, 'weak'); }
}
function releaseHeld(silent) { if (!goat.held) return; const b = goat.held; goat.held = null; b.vx = goat.vx * 0.5; b.vz = goat.vz * 0.5; if (!silent) SFX.drop(); if (b.onRelease) b.onRelease(); }
function headbuttFX(b, res, dir) {
  const cx = (goat.x + b.x) / 2, cz = (goat.z + b.z) / 2;
  if (res === 'good') {
    hitstop = 0.075; shake = Math.max(shake, 0.55); SFX.hit();
    burst(cx, 0.9, cz, 22, [0xffe14a, 0xffffff, 0xff2bd6, 0x3ff0ff], 8, 6, 0.6);
    ringFX(cx, cz, 0xffe14a, 3.5);
    floatText(pick(["CỐP!", "BỐP!", "BỤP!", "HÚC!", "BÊ-Ê-Ê!"]), cx, 2, cz);
    addChaos(10); goat.happyT = 0.6;
    goat.vx = -dir.x * 3.5; goat.vz = -dir.z * 3.5;
  } else {
    hitstop = 0.04; shake = Math.max(shake, 0.25); SFX.clang();
    burst(cx, 1, cz, 10, [0xbbbbcc, 0xffffff], 4, 4, 0.4);
    floatText(b.weakText || "KENG!", cx, 2, cz, 'weak');
    goat.vx = -dir.x * 7; goat.vz = -dir.z * 7; goat.hurtT = 0.2;
  }
}
function updateGoat(dt) {
  goat.dashCd -= dt; goat.invT -= dt; goat.hurtT -= dt; goat.dizzyT -= dt; goat.happyT -= dt;
  if (goat.launch) {
    const L = goat.launch; L.t += dt / L.dur; const t = Math.min(1, L.t);
    goat.x = lerp(L.fx, L.tx, t); goat.z = lerp(L.fz, L.tz, t); goat.y = Math.sin(Math.PI * t) * L.h;
    GM.body.rotation.x = t * Math.PI * 2 * (L.flips || 1);
    if (t >= 1) { goat.launch = null; goat.y = 0; GM.body.rotation.x = 0; goat.vx = goat.vz = 0; burst(goat.x, 0.2, goat.z, 12, [0xffffff, 0xddccff], 4, 3, 0.5); SFX.bonk(); goat.dizzyT = 0.8; resolveStatic(goat); }
    return;
  }
  const canCtl = phase === 'play' && goat.hurtT <= 0;
  const inp = inputDir();
  if (goat.dashT > 0) {
    goat.dashT -= dt; goat.vx = goat.dashDir.x * DASH_SPEED; goat.vz = goat.dashDir.z * DASH_SPEED;
    if (Math.random() < 0.6) spawnPart(goat.x, 0.3, goat.z, rand(-1, 1), 1, rand(-1, 1), 0xffffff, 0.3, 0.8, 4);
  } else if (goat.hurtT > 0 || !canCtl) {
    const f = Math.max(0, 1 - 6 * dt); goat.vx *= f; goat.vz *= f;
  } else {
    const sp = WALK * (goat.held ? 0.82 : 1) * (goat.dizzyT > 0 ? 0.5 : 1);
    const tx = inp.x * sp, tz = inp.z * sp, k = Math.min(1, (inp.m > 0.05 ? 22 : 26) * dt);
    goat.vx = lerp(goat.vx, tx, k); goat.vz = lerp(goat.vz, tz, k);
    if (inp.m > 0.1) goat.tFacing = Math.atan2(inp.x, inp.z);
  }
  goat.facing = angLerp(goat.facing, goat.tFacing, Math.min(1, dt * 16));
  goat.x += goat.vx * dt; goat.z += goat.vz * dt;
  const h = resolveStatic(goat);
  if (h) {
    const vn = goat.vx * h.nx + goat.vz * h.nz;
    if (goat.dashT > 0 && (goat.dashDir.x * h.nx + goat.dashDir.z * h.nz) < -0.45) {
      goat.dashT = 0; goat.vx = h.nx * 5; goat.vz = h.nz * 5; goat.hurtT = 0.25; goat.dizzyT = 0.9;
      shake = Math.max(shake, 0.3); SFX.bonk(); hitstop = 0.04;
      burst(goat.x - h.nx * 0.5, 1, goat.z - h.nz * 0.5, 10, [0xffffff, 0xffe14a], 4, 4, 0.4);
      floatText(pick(["ÁI DA!", "CỐP... TƯỜNG KÌA.", "NHẦM MỤC TIÊU"]), goat.x, 2.2, goat.z, 'weak'); addChaos(2);
    } else if (vn < 0) { goat.vx -= vn * h.nx; goat.vz -= vn * h.nz; }
  }
  // headbutt contacts
  if (goat.dashT > 0) {
    for (const b of bodies) {
      if (b === goat || !b.hittable || goat.hitSet.has(b) || b === goat.held) continue;
      const dx = b.x - goat.x, dz = b.z - goat.z, d = hyp(dx, dz), reach = goat.r + b.r + 0.5;
      if (d < reach) {
        const dot = (dx * goat.dashDir.x + dz * goat.dashDir.z) / (d || 1);
        if (dot > 0.1 || d < goat.r + b.r + 0.05) {
          goat.hitSet.add(b); const dir = { ...goat.dashDir };
          const res = b.onHeadbutt ? b.onHeadbutt(dir) : 'weak';
          goat.dashT = 0; headbuttFX(b, res, dir); progressIfNeeded(res); break;
        }
      }
    }
  }
}
function progressIfNeeded(res) { if (res === 'good') { /* any good hit counts as activity for hints */ lastProgress = Math.max(lastProgress, gameTime - 4); } }
function updateHeld() {
  const b = goat.held; if (!b) { rope.visible = false; return; }
  const dx = b.x - goat.x, dz = b.z - goat.z, d = hyp(dx, dz) || 0.001, L = goat.r + b.r + 0.4;
  if (d > L) { b.x = goat.x + dx / d * L; b.z = goat.z + dz / d * L; resolveStatic(b); }
  const d2 = hyp(b.x - goat.x, b.z - goat.z);
  if (d2 > L + 1.3) { releaseHeld(); floatText("VƯỚNG RỒI!", b.x, 1.6, b.z, 'weak'); return; }
  // rope from goat mouth to object
  const mx = goat.x + Math.sin(goat.facing) * 0.8, mz = goat.z + Math.cos(goat.facing) * 0.8;
  const a = _ropeA.set(mx, 0.9, mz), c = _ropeC.set(b.x, 0.5 + b.y, b.z);
  rope.visible = true; rope.position.copy(a).add(c).multiplyScalar(0.5); rope.scale.y = a.distanceTo(c);
  rope.quaternion.setFromUnitVectors(_UP, _ropeD.copy(c).sub(a).normalize());
}
const _ropeA = new THREE.Vector3(), _ropeC = new THREE.Vector3(), _ropeD = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0);
function animateGoat(dt) {
  const R = GM.root; R.position.set(goat.x, goat.y, goat.z); R.rotation.y = goat.facing;
  const sp = hyp(goat.vx, goat.vz);
  goat.walk += dt * (sp > 0.5 ? sp * 2.4 : 0);
  const sw = sp > 0.5 && goat.dashT <= 0 ? Math.sin(goat.walk) * 0.7 : 0;
  GM.legs[0].rotation.x = sw; GM.legs[3].rotation.x = sw; GM.legs[1].rotation.x = -sw; GM.legs[2].rotation.x = -sw;
  goat.squash = Math.max(0, goat.squash - dt * 4);
  const bob = sp > 0.5 ? Math.abs(Math.sin(goat.walk)) * 0.07 : Math.sin(realTime * 2.5) * 0.015;
  GM.body.position.y = bob + (goat.happyT > 0 ? Math.sin(goat.happyT / 0.6 * Math.PI) * 0.35 : 0);
  const dashing = goat.dashT > 0;
  GM.body.scale.set(dashing ? 0.85 : 1, dashing ? 0.85 : 1 + goat.squash * 0.05, dashing ? 1.3 : 1);
  GM.head.rotation.x = lerp(GM.head.rotation.x, dashing ? 0.75 : (goat.held ? 0.35 : 0), Math.min(1, dt * 20));
  GM.tail.rotation.z = Math.sin(realTime * (sp > 0.5 ? 18 : 4)) * 0.4;
  goat.blink -= dt; const bl = goat.blink < 0.12 ? 0.1 : 1; if (goat.blink < 0) goat.blink = rand(1.5, 4);
  for (const e of GM.eyes) e.scale.y = bl;
  GM.stars.visible = goat.dizzyT > 0; GM.stars.rotation.y += dt * 8;
  GM.root.visible = phase!=='dead' && !(goat.invT > 0 && Math.floor(realTime * 16) % 2 === 0);
  GM.shadowBlob.position.y = -goat.y + 0.03;
}

// ================= reusable props =================
const crateMat = M(0xffffff, { map: canvasTex(128, 128, (g) => { g.fillStyle = '#ff9f1c'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#7a3e00'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118); g.beginPath(); g.moveTo(5, 5); g.lineTo(123, 123); g.stroke(); g.fillStyle = '#fff'; g.font = '900 30px Arial'; g.fillText('?', 82, 50); }), flatShading: false });
function makeCrate(x, z) {
  const m = sh(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), crateMat)); const g = new THREE.Group(); m.position.y = 0.4; g.add(m);
  const b = makeBody({ x, z, r: 0.45, mass: 0.5, friction: 9, bounce: 0.5, physics: true, hittable: true, grabbable: true, mesh: g, kind: 'crate', spin: 0 });
  b.hits = 0;
  b.onHeadbutt = d => { b.vx = d.x * 11; b.vz = d.z * 11; b.vy = 5; b.spin = 12; b.hits++; addChaos(b.hits === 1 ? 25 : 5, b.x, b.z); return 'good'; };
  b.update = dt => { g.position.set(b.x, b.y, b.z); if (b.spin > 0) { m.rotation.y += b.spin * dt; m.rotation.x += b.spin * dt * 0.5; b.spin = Math.max(0, b.spin - dt * 15); if (b.spin === 0 && b.y === 0) { m.rotation.x = Math.round(m.rotation.x / (Math.PI / 2)) * Math.PI / 2; } } };
  b.hint = () => ({ k: 'E', t: "Kéo · SPACE: Húc" });
  return b;
}
function makeLegs(n, color, len = 0.5, spread = 0.3) {
  const legs = []; const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const piv = new THREE.Group(); piv.position.x = (i - (n - 1) / 2) * spread;
    const l = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6), M(color))); l.position.y = -len / 2; piv.add(l);
    const f = sh(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), M(0xff3b5c))); f.position.set(0, -len, 0.06); piv.add(f);
    g.add(piv); legs.push(piv);
  }
  return { g, legs };
}
function googlyEyes(size = 0.17) {
  const g = new THREE.Group(); const pupils = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 10), BM(0xffffff)); w.position.x = s * size * 1.3; w.scale.z = 0.5; g.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 8, 6), BM(0x111122)); p.position.set(s * size * 1.3, 0, size * 0.45); g.add(p); pupils.push(p);
  }
  return { g, pupils };
}

// ================= ROUND 1 =================
const R1 = {
  title: "VẠCH ĐÍCH BIẾT LỪA", start: [-10.5, 0], startFacing: Math.PI / 2,
  build() {
    this.state = 'course';
    addWall(-8.3, -7.6, -7, 2.0, 1.3, wallMats[0], stripB);
    addWall(-5.2, -4.5, -2.0, 7, 1.3, wallMats[1], stripA);
    addWall(-2.0, -1.3, -7, 2.0, 1.3, wallMats[0], stripB);
    addWall(-10.4, -9.4, -5.6, -4.6, 1.0, wallMats[2], stripA);
    addWall(-6.6, -5.9, 3.4, 4.1, 1.0, wallMats[2], stripB);
    for (const [x, z] of [[-7.95, 3.2], [-7.95, 4.6], [-4.85, -3.3], [-4.85, -4.6], [-1.65, 3.4], [-1.65, 4.8], [-3.2, 5.6]]) makeCrate(x, z);
    // capture zone
    const C = this.C = { x: 6.2, z: 0, r: 1.75 };
    const zg = new THREE.Group(); zg.position.set(C.x, 0, C.z);
    const zDisc = new THREE.Mesh(new THREE.CircleGeometry(C.r, 40), BM(0x4bff8a, { transparent: true, opacity: 0.22, depthWrite: false })); zDisc.rotation.x = -Math.PI / 2; zDisc.position.y = 0.04;
    const zRing = new THREE.Mesh(new THREE.RingGeometry(C.r - 0.15, C.r, 40), BM(0x4bff8a, { side: THREE.DoubleSide })); zRing.rotation.x = -Math.PI / 2; zRing.position.y = 0.05;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, 6, 32, 1, true), BM(0x4bff8a, { transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beam.position.y = 3;
    const zl = sprite(labelTex("VÙNG BẮT GIỮ", '#0d3a22', '#4bff8a', 512, 100, 52), 2.6, 0.5); zl.position.y = 2.2;
    const cage = new THREE.Group(); const barM = EM(0xffe14a, 1.2);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 5), barM); bar.position.set(Math.cos(a) * (C.r - 0.2), 1.5, Math.sin(a) * (C.r - 0.2)); cage.add(bar); }
    const top = new THREE.Mesh(new THREE.TorusGeometry(C.r - 0.2, 0.08, 6, 30), barM); top.rotation.x = Math.PI / 2; top.position.y = 3; cage.add(top);
    cage.position.y = 12; cage.visible = false;
    zg.add(zDisc, zRing, beam, zl, cage); zg.scale.setScalar(0.001); addMesh(zg, false);
    this.zone = { g: zg, disc: zDisc, ring: zRing, cage, shown: false };
    // route ring (dotted)
    const route = new THREE.Group(); const dm = BM(0xffe14a, { transparent: true, opacity: 0.5 });
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; const d = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), dm); d.rotation.x = -Math.PI / 2; d.position.set(C.x + Math.cos(a) * 4.1, 0.04, C.z + Math.sin(a) * 4.1); route.add(d); }
    route.visible = false; addMesh(route, false); this.route = route;
    this.fin = makeFinish(C.x - 4.1, 0, this);
  },
  objective() { return { course: "Chạy đến vạch ĐÍCH", chase: "Húc vạch đích vào VÙNG BẮT GIỮ", done: "Bắt được rồi!" }[this.state]; },
  hint() {
    if (this.state === 'course') return "Đi vòng chướng ngại vật. Có thể húc thùng bằng SPACE.";
    if (this.fin.state === 'dizzy') return "Nó đang choáng. Thử chọn lại hướng húc.";
    return "Quan sát đường chạy, đừng chỉ đuổi theo.";
  },
  intro() { say("Chào mừng đến GOAT.EXE. Dê cũng có quyền mơ!", 'happy'); say("Dễ lắm! Chỉ cần về đích thôi mà!", 'smug'); },
  update(dt) {
    const f = this.fin;
    if (this.state === 'course' && hyp(goat.x - f.x, goat.z - f.z) < 3.6) {
      this.state = 'chase'; f.state = 'sprout'; f.t = 0; progress(); SFX.boing();
      sayNow("Ú ÒA! Bất ngờ chưa?", 'smug'); say("Đích cũng cần tập thể dục chứ!", 'happy');
      this.zone.shown = true; this.route.visible = true;
    }
    const z = this.zone; const ts = z.shown ? 1 : 0.001; z.g.scale.setScalar(lerp(z.g.scale.x, ts, Math.min(1, dt * 5)));
    z.ring.material.color.setHSL(0.38, 1, 0.5 + Math.sin(realTime * 6) * 0.15);
    if (z.cage.visible) z.cage.position.y = Math.max(0, z.cage.position.y - dt * 25);
  },
  captured() {
    this.state = 'done'; this.zone.cage.visible = true; SFX.good(); shake = 0.8; addChaos(200, this.C.x, this.C.z);
    burst(this.C.x, 1, this.C.z, 40, [0x4bff8a, 0xffe14a, 0xffffff], 9, 8, 1);
    sayNow("Ơ KÌA! AI CHO PHÉP?!", 'angry'); say("Thôi được. Cho dê thắng ván này.", 'smug');
    after(2.8, () => roundClear());
  },
  restartNote: "Đích về chỗ cũ. Chân vẫn còn nhé.",
};
function makeFinish(x, z, R) {
  const g = new THREE.Group(), top = new THREE.Group(); g.add(top);
  const checker = canvasTex(256, 64, (c) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fff'; c.fillRect(i * 16, j * 16, 16, 16); } c.fillStyle = '#ff2bd6'; c.fillRect(64, 14, 128, 36); c.fillStyle = '#fff'; c.font = '900 28px Arial Black'; c.textAlign = 'center'; c.fillText("ĐÍCH", 128, 43); });
  const postM = M(0xffffff);
  for (const s of [-1, 1]) { const p = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.1, 8), postM)); p.position.set(s * 1.1, 1.05, 0); top.add(p); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), EM(0xffe14a, 1.5)); cap.position.set(s * 1.1, 2.15, 0); top.add(cap); }
  const banner = sh(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.62, 0.08), M(0xffffff, { map: checker, flatShading: false }))); banner.position.y = 1.85; top.add(banner);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.5), BM(0xffffff, { map: checker })); strip.rotation.x = -Math.PI / 2; strip.position.y = 0.03; g.add(strip);
  const eyes = googlyEyes(0.2); eyes.g.position.set(0, 1.85, 0.12); eyes.g.visible = false; top.add(eyes.g);
  const L = makeLegs(2, 0xffe14a, 0.55, 0.0), L2 = makeLegs(2, 0xffe14a, 0.55, 0.0);
  L.g.position.set(-1.1, 0.55, 0); L2.g.position.set(1.1, 0.55, 0); L.legs[0].position.z = -0.12; L.legs[1].position.z = 0.12; L2.legs[0].position.z = -0.12; L2.legs[1].position.z = 0.12;
  L.g.scale.y = L2.g.scale.y = 0.001; top.add(L.g, L2.g);
  const stars = makeStars(); stars.position.y = 2.6; top.add(stars);
  const b = makeBody({ x, z, r: 1.0, mass: 5, friction: 9.5, bounce: 0.6, hittable: true, mesh: g, kind: 'finish' });
  Object.assign(b, { state: 'idle', t: 0, theta: Math.PI, dizzyT: 0, heading: 0, legT: 0, stuckT: 0, lastD: 0, hopT: 0, hits: 0 });
  const C = R.C, RAD = 4.1, SPD = 3.3;
  b.hint = () => (b.state === 'run' || b.state === 'dizzy' || b.state === 'return') ? { k: 'SPACE', t: "Húc vào vùng sáng" } : null;
  b.onHeadbutt = (d) => {
    if (b.state === 'captured' || b.state === 'hop') { b.weakText = "CHƯA ĐƯỢC ĐÂU"; return 'weak'; }
    let dx = d.x, dz = d.z;
    const tx = C.x - b.x, tz = C.z - b.z, td = hyp(tx, tz) || 1;
    const dot = (dx * tx + dz * tz) / td;
    let v = 10;
    if (dot > Math.cos(0.75)) { // aim assist
      dx = lerp(dx, tx / td, 0.75); dz = lerp(dz, tz / td, 0.75); const m = hyp(dx, dz); dx /= m; dz /= m;
      v = clamp(Math.sqrt(2 * b.friction * (td + 0.2)), 5, 13);
    }
    b.vx = dx * v; b.vz = dz * v; b.vy = 5; b.state = 'dizzy'; b.dizzyT = 2.8; b.physics = true; b.hits++;
    addChaos(50, b.x, b.z);
    if (b.hits === 1) sayNow("Á! Vạch đích của tôi!", 'shock'); else if (b.hits === 3) sayNow("Đừng bắt nạt vạch đích nữa!", 'angry');
    eyes.g.visible = true; progress();
    return 'good';
  };
  b.update = dt => {
    b.t += dt; b.legT += dt;
    let legSpeed = 0;
    if (b.state === 'idle') { top.position.y = 0; }
    else if (b.state === 'sprout') {
      const k = Math.min(1, b.t / 1.0); L.g.scale.y = L2.g.scale.y = k; top.position.y = 0.55 * k + Math.sin(b.t * 20) * 0.05 * (1 - k); eyes.g.visible = true;
      b.heading = angLerp(b.heading, Math.PI, dt * 4);
      if (b.t > 1.2) { b.state = 'run'; b.theta = Math.atan2(b.z - C.z, b.x - C.x); }
    } else if (b.state === 'run') {
      b.theta += SPD / RAD * dt; const tx = C.x + Math.cos(b.theta) * RAD, tz = C.z + Math.sin(b.theta) * RAD;
      const dx = tx - b.x, dz = tz - b.z, d = hyp(dx, dz); const st = Math.min(d, 7 * dt); if (d > 0.001) { b.x += dx / d * st; b.z += dz / d * st; }
      b.heading = Math.atan2(-Math.sin(b.theta), Math.cos(b.theta)); legSpeed = 16; top.position.y = 0.55 + Math.abs(Math.sin(b.legT * 16)) * 0.08;
    } else if (b.state === 'dizzy') {
      b.dizzyT -= dt; b.heading += dt * 6; top.position.y = 0.55 + b.y;
      if (b.dizzyT <= 0) { b.state = 'return'; b.physics = false; b.stuckT = 0; b.lastD = 99; }
    } else if (b.state === 'return') {
      const a = Math.atan2(b.z - C.z, b.x - C.x); const tx = C.x + Math.cos(a) * RAD, tz = C.z + Math.sin(a) * RAD;
      const dx = tx - b.x, dz = tz - b.z, d = hyp(dx, dz);
      if (d < 0.15) { b.state = 'run'; b.theta = a; }
      else { const st = Math.min(d, 4.5 * dt); b.x += dx / d * st; b.z += dz / d * st; resolveStatic(b); b.heading = Math.atan2(dx, dz); legSpeed = 14; top.position.y = 0.55;
        b.stuckT += dt; if (b.stuckT > 0.7) { if (b.lastD - d < 0.3) { b.state = 'hop'; b.hopT = 0; b.hf = [b.x, b.z]; b.ht = [tx, tz]; b.noCollide = true; } b.stuckT = 0; b.lastD = d; } }
    } else if (b.state === 'hop') {
      b.hopT += dt / 0.7; const t = Math.min(1, b.hopT); b.x = lerp(b.hf[0], b.ht[0], t); b.z = lerp(b.hf[1], b.ht[1], t); top.position.y = 0.55 + Math.sin(Math.PI * t) * 3;
      if (t >= 1) { b.noCollide = false; b.state = 'run'; b.theta = Math.atan2(b.z - C.z, b.x - C.x); }
    } else if (b.state === 'captured') {
      b.x = lerp(b.x, C.x, dt * 6); b.z = lerp(b.z, C.z, dt * 6); b.heading += dt * 1.5; top.position.y = 0.55 + b.y;
    }
    if ((b.state === 'dizzy' || b.state === 'return') && hyp(b.x - C.x, b.z - C.z) < C.r - 0.2) {
      b.state = 'captured'; b.physics = false; b.noCollide = true; b.hittable = false; R.captured();
    }
    const sw = legSpeed ? Math.sin(b.legT * legSpeed) * 0.8 : 0;
    L.legs[0].rotation.x = sw; L.legs[1].rotation.x = -sw; L2.legs[0].rotation.x = -sw; L2.legs[1].rotation.x = sw;
    stars.visible = b.state === 'dizzy' || b.state === 'captured'; stars.rotation.y += dt * 7;
    g.position.set(b.x, 0, b.z); top.rotation.y = b.heading; strip.rotation.z = -b.heading;
    if (b.state === 'idle') { eyes.g.visible = Math.sin(b.t * 1.3) > 0.85; }
    for (const p of eyes.pupils) { p.position.y = Math.sin(b.t * 9 + p.position.x) * 0.04; }
  };
  return b;
}

// ================= ROUND 2 =================
const R2 = {
  title: "ĐỪNG BẤM NÚT", start: [-10, 3.5], startFacing: Math.PI / 2,
  build() {
    this.state = 'locked'; this.presses = 0; this.plateMsgT = 0; this.grabbedOnce = false;
    addWall(6.6, 7.3, -7, -1.25, 2.2, wallMats[1], stripA);
    addWall(6.6, 7.3, 1.25, 7, 2.2, wallMats[1], stripA);
    const doorMat = M(0xffffff, { map: canvasTex(128, 128, g => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ff3b5c' : '#ffe14a'; g.beginPath(); g.moveTo(i * 32 - 64, 0); g.lineTo(i * 32 - 32, 0); g.lineTo(i * 32 + 32, 128); g.lineTo(i * 32, 128); g.fill(); } g.fillStyle = '#10052a'; g.fillRect(14, 44, 100, 40); g.fillStyle = '#fff'; g.font = '900 30px Arial'; g.textAlign = 'center'; g.fillText("KHÓA", 64, 75); }), flatShading: false });
    this.door = addWall(6.75, 7.15, -1.25, 1.25, 2.0, doorMat, stripB);
    // alcove for plate
    addWall(-10.4, -9.8, -7, -3.0, 1.2, wallMats[0], stripB);
    addWall(-5.4, -4.8, -7, -3.0, 1.2, wallMats[0], stripB);
    addWall(-4.0, -2.8, 2.2, 3.4, 1.2, wallMats[2], stripA);
    addWall(2.6, 3.8, -3.6, -2.4, 1.2, wallMats[2], stripA);
    addWall(2.6, 3.8, 3.0, 4.2, 1.2, wallMats[2], stripA);
    // plate
    const P = this.P = { x: -7.6, z: -5.0, r: 1.05 };
    const pg = new THREE.Group(); pg.position.set(P.x, 0, P.z);
    const plateTop = sh(new THREE.Mesh(new THREE.BoxGeometry(2, 0.14, 2), M(0xffffff, { map: canvasTex(128, 128, g => { g.fillStyle = '#123'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#3ff0ff'; g.lineWidth = 8; g.strokeRect(8, 8, 112, 112); g.fillStyle = '#3ff0ff'; g.font = '900 22px Arial'; g.textAlign = 'center'; g.fillText("BÀN", 64, 56); g.fillText("ĐẠP", 64, 84); }), flatShading: false })));
    plateTop.position.y = 0.07; pg.add(plateTop);
    const pRing = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.4, 4, 1), BM(0x3ff0ff, { side: THREE.DoubleSide })); pRing.rotation.set(-Math.PI / 2, 0, Math.PI / 4); pRing.position.y = 0.05; pg.add(pRing);
    const pl = sprite(labelTex("ĐẠP", '#123', '#3ff0ff', 300, 100, 56), 1.4, 0.47); pl.position.y = 1.6; pg.add(pl);
    addMesh(pg, false); this.plate = { g: pg, top: plateTop, ring: pRing, label: pl };
    // exit
    const eg = new THREE.Group(); eg.position.set(10, 0, 0);
    const eDisc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), BM(0x4bff8a, { transparent: true, opacity: 0.3, depthWrite: false })); eDisc.rotation.x = -Math.PI / 2; eDisc.position.y = 0.04; eg.add(eDisc);
    const eRing = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.3, 32), BM(0x4bff8a, { side: THREE.DoubleSide })); eRing.rotation.x = -Math.PI / 2; eRing.position.y = 0.05; eg.add(eRing);
    const es = sprite(labelTex("LỐI RA", '#0d3a22', '#4bff8a', 256, 110, 70), 1.4, 0.6); es.position.y = 2.2; eg.add(es);
    addMesh(eg, false); this.exit = { g: eg, ring: eRing };
    this.btn = makeButton(0, 0, this);
    for (const [x, z] of [[-1, 5.5], [-9, 5.6], [4.8, 5.5], [5, -5.5]]) makeCrate(x, z);
  },
  objective() { return { locked: "Mở cửa đang khóa", carry: "Đưa nút lên BÀN ĐẠP", open: "Đi qua LỐI RA", done: "Thoát rồi!" }[this.state]; },
  hint() {
    if (this.state === 'locked') return this.presses ? "Thử tương tác với nút theo cách khác." : "MC chỉ nói đừng bấm. Còn cách nào khác nhỉ?";
    if (this.state === 'carry') return goat.held ? "Quan sát những vùng đang phát sáng." : "Đứng gần đồ vật rồi nhấn E để kéo.";
    return "Cửa mở rồi. Đến vùng LỐI RA.";
  },
  intro() { say("Cửa khóa rồi. Xui ghê!", 'smug'); say("Làm gì thì làm, đừng bấm nút đỏ!", 'shock'); },
  update(dt) {
    const B = this.btn, P = this.P;
    this.plateMsgT -= dt;
    if (this.state === 'carry' && !B.onBase && hyp(B.x - P.x, B.z - P.z) < P.r) this.activatePlate();
    if (this.state !== 'open' && this.state !== 'done' && hyp(goat.x - P.x, goat.z - P.z) < 1.1 && this.plateMsgT <= 0) {
      this.plateMsgT = 7; sayNow("Nhẹ quá! Dê ăn thêm đi.", 'smug'); floatText("CHƯA ĐỦ NẶNG", goat.x, 2.3, goat.z, 'weak'); progress();
    }
    const d = this.door; if (d.disabled) { d.mesh.userData.ty = -2.3; }
    this.plate.ring.material.color.set(this.state === 'open' ? 0x4bff8a : (Math.sin(realTime * 5) > 0 ? 0x3ff0ff : 0x1a7a88));
    this.exit.ring.material.color.set(this.state === 'open' ? 0x4bff8a : 0x335544);
    if (this.state === 'open' && hyp(goat.x - 10, goat.z) < 1.4) {
      this.state = 'done'; SFX.good(); burst(10, 1, 0, 30, [0x4bff8a, 0xffe14a], 7, 7, 0.8); addChaos(100, 10, 0);
      sayNow("Ai cho bê nút đi?! Tôi gọi luật sư bây giờ!", 'angry');
      after(2.6, () => roundClear());
    }
  },
  activatePlate() {
    const B = this.btn, P = this.P; this.state = 'open';
    if (goat.held === B) releaseHeld(true);
    B.physics = false; B.grabbable = false; B.hittable = false; B.fixed = true; B.snap = true;
    this.door.disabled = true; SFX.open(); SFX.good(); shake = 0.5; progress(); addChaos(150, P.x, P.z);
    burst(P.x, 0.5, P.z, 30, [0x3ff0ff, 0x4bff8a, 0xffffff], 6, 6, 0.8);
    floatText("CỬA ĐÃ MỞ!", P.x, 2.2, P.z, 'good');
    sayNow("Ai dạy dùng bàn đạp thế? Tức ghê!", 'shock');
    this.plate.top.position.y = 0.02;
  },
  restartNote: "Nút về chỗ cũ. Đừng có bấm nhé.",
};
function makeButton(x, z, R) {
  const ped = new THREE.Group(); ped.position.set(x, 0, z);
  const hazard = canvasTex(256, 64, g => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#111' : '#ffe14a'; g.beginPath(); g.moveTo(i * 24 - 30, 0); g.lineTo(i * 24 - 6, 0); g.lineTo(i * 24 + 18, 64); g.lineTo(i * 24 - 6, 64); g.fill(); } });
  const pm = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.8, 16), M(0xffffff, { map: hazard, flatShading: false }))); pm.position.y = 0.4; ped.add(pm);
  const trap = new THREE.Group(); // spring trap visuals
  const spr = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), M(0x888899)); trap.add(spr); trap.visible = false; scene.add(trap); roundMeshes.push(trap);
  addMesh(ped);
  const bg = new THREE.Group();
  const house = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 0.3, 16), M(0x333344))); house.position.y = 0.15; bg.add(house);
  const cap = sh(new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0xff2233, { emissive: 0x550000, flatShading: false, roughness: 0.3 }))); cap.position.y = 0.3; cap.scale.y = 0.7; bg.add(cap);
  const lab = sprite(labelTex("CẤM BẤM", '#ff2233', '#fff', 512, 110, 58), 2.7, 0.58); lab.position.y = 1.35; bg.add(lab);
  const b = makeBody({ x, z, r: 0.85, mass: 0.5, fixed: true, friction: 8, bounce: 0.5, hittable: true, mesh: bg, kind: 'button' });
  Object.assign(b, { onBase: true, pressT: 0, spin: 0, snap: false });
  b.hint = () => b.onBase ? { k: 'SPACE', t: "Thử húc?" } : (b.grabbable ? { k: 'E', t: goat.held === b ? "Thả" : "Kéo nút" } : null);
  b.onHeadbutt = d => {
    if (b.onBase) {
      b.onBase = false; b.fixed = false; b.r = 0.6; b.physics = true; b.grabbable = true;
      b.x = x + d.x * 1.55; b.z = z + d.z * 1.55; resolveStatic(b); b.vx = d.x * 7; b.vz = d.z * 7; b.vy = 7; b.spin = 14;
      circles.push({ x, z, r: 0.85 }); R.state = 'carry'; progress(); addChaos(150, x, z);
      lab.material.map = labelTex("RỜI ĐẾ RỒI", '#555', '#fff', 512, 110, 58); lab.material.needsUpdate = true;
      sayNow("Bỏ xuống! Cái đó không được mang đi!", 'angry');
      return 'good';
    }
    b.vx = d.x * 10; b.vz = d.z * 10; b.vy = 4; b.spin = 10; addChaos(10); return 'good';
  };
  b.onGrab = () => { if (!R.grabbedOnce) { R.grabbedOnce = true; sayNow("Ai cho kéo nút đi? Phạm luật!", 'angry'); } progress(); };
  b.update = dt => {
    b.pressT -= dt;
    if (b.onBase) {
      bg.position.set(x, 0.8, z); cap.position.y = b.pressT > 0 ? 0.18 : 0.3;
      if (goat.dashT <= 0 && !goat.launch && phase === 'play' && hyp(goat.x - b.x, goat.z - b.z) < goat.r + b.r + 0.08) press();
    } else {
      if (b.snap) { b.x = lerp(b.x, R.P.x, dt * 8); b.z = lerp(b.z, R.P.z, dt * 8); cap.position.y = 0.18; cap.material.emissive.set(0x00aa44); cap.material.color.set(0x33ff77); }
      bg.position.set(b.x, b.y, b.z);
      if (b.spin > 0) { bg.rotation.z = Math.sin(b.spin) * 0.3; bg.rotation.y += b.spin * dt; b.spin = Math.max(0, b.spin - dt * 14); } else bg.rotation.z = 0;
    }
    if (trap.visible) { trap.userData.t += dt; trap.scale.y = 1; trap.position.y = Math.max(0.05, 1 - trap.userData.t * 2); if (trap.userData.t > 0.8) trap.visible = false; }
  };
  function press() {
    b.pressT = 0.4; R.presses++; SFX.bad(); SFX.boing(); mistake(goat.x, goat.z, "BẤM THẬT LUÔN À!"); addChaos(30);
    trap.visible = true; trap.userData.t = 0; trap.position.set(goat.x, 0.05, goat.z);
    burst(goat.x, 0.3, goat.z, 16, [0xff3b5c, 0xffe14a, 0xffffff], 5, 9, 0.7);
    shake = 0.4; releaseHeld(true);
    goat.launch = { fx: goat.x, fz: goat.z, tx: R.start[0], tz: R.start[1], t: 0, dur: 1.2, h: 5, flips: 1 };
    const lines = ["Đã bảo đừng bấm! Bay nhé!", "Đọc luật khó thế cơ à?", "Nút để ngắm thôi mà!", "Bấm nữa cũng thế thôi, dê ơi."];
    sayNow(lines[Math.min(R.presses - 1, lines.length - 1)], 'happy');
  }
  return b;
}

// ================= ROUND 3 =================
const R3 = {
  title: "CHIẾC CÚP PHẢN CÔNG", start: [-9.5, 4.5], startFacing: Math.PI * 0.75,
  build() {
    this.state = 'claim'; this.count = 0;
    this.pillars = [[-7, -3.6], [7, -3.6], [0, 4.4]].map(([x, z]) => makePillar(x, z));
    addWall(-11.5, -10.5, -1, 1, 0.9, wallMats[2], stripA); addWall(10.5, 11.5, -1, 1, 0.9, wallMats[2], stripA);
    this.tr = makeTrophy(0, -1.5, this);
  },
  objective() { return this.state === 'claim' ? "Đến nhận CÚP" : this.state === 'fight' ? "Dụ chiếc cúp lao vào các TRỤ SÁNG" : "Hạ được rồi!"; },
  progressUI() { return this.state === 'claim' ? null : this.count; },
  hint() {
    if (this.state === 'claim') return "Phần thưởng ở ngay kia. Đến gần xem nào.";
    if (this.tr.state === 'stun') return "Nó đang choáng. Sừng của bạn vẫn dùng được đấy.";
    return "Quan sát mũi tên đỏ. Canh lúc nó lao rồi né sang bên.";
  },
  intro() { say("Giỏi lắm! Phần thưởng đây.", 'happy'); say("Lại nhận cúp đi nào!", 'smug'); },
  update(dt) { },
  pillarHit(p) {
    this.count++; progress(); addChaos(150, p.x, p.z);
    const lines = ["Trụ của tôi! Đồ đi thuê đấy!", "Đừng lấy cúp của tôi phá đồ!", "Không không không! Dừng lại!"];
    sayNow(lines[this.count - 1], 'angry');
    if (this.count >= 3) { this.state = 'done'; this.tr.die(); after(2.6, () => fakeEnding()); }
  },
  restartNote: "Cúp trở lại. Nó nhớ mặt bạn đấy.",
};
function makePillar(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const base = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.35, 12), M(0x2c1460))); base.position.y = 0.17; g.add(base);
  const colM = M(0x3ff0ff, { emissive: 0x18a8c0, emissiveIntensity: 0.6, flatShading: true });
  const col = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 2.8, 10), colM)); col.position.y = 1.75; g.add(col);
  const ringM = EM(0xff2bd6, 2.2), rs = [];
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 6, 20), ringM); r.rotation.x = Math.PI / 2; r.position.y = 0.8 + i * 0.9; g.add(r); rs.push(r); }
  const topM = EM(0xffe14a, 2); const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), topM); top.position.y = 3.6; g.add(top);
  addMesh(g);
  const c = { x, z, r: 0.75 }; circles.push(c);
  const p = { x, z, r: 0.75, active: true, g, col, colM, ringM, rs, top };
  p.disable = () => { p.active = false; colM.color.set(0x333344); colM.emissive.set(0x000000); ringM.emissiveIntensity = 0; ringM.emissive.set(0x220011); top.visible = false; col.rotation.z = 0.08; burst(x, 2, z, 40, [0x3ff0ff, 0xff2bd6, 0xffffff], 9, 9, 1); SFX.zap(); };
  p.update = dt => { if (p.active) { rs.forEach((r, i) => r.position.y = 0.8 + i * 0.9 + Math.sin(realTime * 3 + i) * 0.1); top.rotation.y += dt * 2; top.position.y = 3.6 + Math.sin(realTime * 2) * 0.12; } else if (Math.random() < dt * 4) spawnPart(x + rand(-0.4, 0.4), 3, z + rand(-0.4, 0.4), 0, 2, 0, 0x555566, 1, 1.5, -1); };
  return p;
}
function makeTrophy(x, z, R) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc531, metalness: 0.35, roughness: 0.25, emissive: 0x6a4200, emissiveIntensity: 0.6, flatShading: true });
  const pts = [[0, 0], [0.6, 0], [0.6, 0.18], [0.36, 0.24], [0.16, 0.4], [0.13, 0.75], [0.3, 0.85], [0.62, 1.05], [0.75, 1.55], [0.78, 1.75], [0.7, 1.75], [0.6, 1.4], [0, 1.35]].map(p => new THREE.Vector2(p[0], p[1]));
  const cup = sh(new THREE.Mesh(new THREE.LatheGeometry(pts, 14), gold)); body.add(cup);
  for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 12, Math.PI), gold); h.position.set(s * 0.72, 1.35, 0); h.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2; h.castShadow = true; body.add(h); }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), EM(0xffffff, 1.5)); star.position.y = 2.0; body.add(star);
  const eyes = googlyEyes(0.15); eyes.g.position.set(0, 1.3, 0.62); eyes.g.visible = false; body.add(eyes.g);
  const browM = BM(0x111111); const brows = new THREE.Group();
  for (const s of [-1, 1]) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.05), browM); br.position.set(s * 0.2, 1.53, 0.66); br.rotation.z = s * -0.45; brows.add(br); }
  brows.visible = false; body.add(brows);
  const L = makeLegs(2, 0xffc531, 0.6, 0.42); L.g.position.y = 0.6; L.g.scale.y = 0.001; g.add(L.g);
  const stars = makeStars(); stars.position.y = 2.5; body.add(stars);
  const podium = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.5, 14), M(0xff2bd6))); podium.position.set(x, 0.25, z); addMesh(podium);
  const shine = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 7, 24, 1, true), BM(0xffe14a, { transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); shine.position.set(x, 3.5, z); addMesh(shine, false);
  // charge arrow
  const arrowTex = canvasTex(64, 256, c => { c.fillStyle = '#ff3b5c'; for (let i = 0; i < 4; i++) { const y = 230 - i * 60; c.beginPath(); c.moveTo(8, y); c.lineTo(32, y - 40); c.lineTo(56, y); c.lineTo(44, y); c.lineTo(32, y - 22); c.lineTo(20, y); c.fill(); } });
  const ag = new THREE.PlaneGeometry(1.4, 8); ag.translate(0, 4.6, 0); ag.rotateX(Math.PI / 2);
  const arrow = new THREE.Mesh(ag, BM(0xffffff, { map: arrowTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); arrow.position.y = 0.06; arrow.visible = false; scene.add(arrow); roundMeshes.push(arrow);
  const b = makeBody({ x, z, r: 0.8, mass: 5, friction: 10, bounce: 0.3, hittable: true, mesh: g, kind: 'trophy' });
  Object.assign(b, { state: 'idle', t: 0, dir: { x: 0, z: 1 }, heading: 0, stunDur: 0, legT: 0, weakText: "KENG! NẶNG QUÁ", charges: 0 });
  const spd = () => [2.3, 2.7, 3.1][R.count] || 3, chaseDur = () => [2.2, 1.9, 1.6][R.count] || 1.6, teleDur = () => [1.0, 0.9, 0.8][R.count] || 0.8, chargeSpd = () => [12, 13, 14][R.count] || 14;
  b.hint = () => b.state === 'stun' ? { k: 'SPACE', t: "Húc về phía trụ" } : null;
  b.onHeadbutt = d => {
    if (b.state === 'stun' || b.state === 'knock') {
      let dx = d.x, dz = d.z; let best = null, bd = 1e9;
      for (const p of R.pillars) { if (!p.active) continue; const tx = p.x - b.x, tz = p.z - b.z, td = hyp(tx, tz); const dot = (dx * tx + dz * tz) / td; if (dot > Math.cos(0.6) && td < bd) { bd = td; best = p; } }
      if (best) { const tx = best.x - b.x, tz = best.z - b.z, td = hyp(tx, tz); dx = lerp(dx, tx / td, 0.8); dz = lerp(dz, tz / td, 0.8); const m = hyp(dx, dz); dx /= m; dz /= m; }
      b.vx = dx * 13; b.vz = dz * 13; b.vy = 3; b.state = 'knock'; b.physics = true; b.friction = 9; addChaos(40, b.x, b.z); return 'good';
    }
    if (b.state === 'charge') { b.state = 'stun'; b.t = 0; b.stunDur = 1.2; b.vx = d.x * 5; b.vz = d.z * 5; b.physics = true; arrow.visible = false; floatText("ĐỐI ĐẦU!", b.x, 2.6, b.z, 'good'); addChaos(60); return 'good'; }
    if (b.state === 'idle') return 'weak';
    b.vx = d.x * 1.5; b.vz = d.z * 1.5; return 'weak';
  };
  function impactPillar(p) {
    if (p.active) { p.disable(); shake = 1; hitstop = 0.12; SFX.hit(); floatText(`VỠ TRỤ! ${R.count + 1}/3`, p.x, 3, p.z, 'good'); R.pillarHit(p); if (b.state !== 'dead') { b.state = 'stun'; b.t = 0; b.stunDur = 2.8; } }
    else { SFX.bonk(); shake = 0.4; floatText("TRỤ NÀY HỎNG RỒI", p.x, 3, p.z, 'weak'); b.state = 'stun'; b.t = 0; b.stunDur = 1.2; }
    const dx = b.x - p.x, dz = b.z - p.z, d = hyp(dx, dz) || 1; b.vx = dx / d * 4; b.vz = dz / d * 4; b.physics = true; arrow.visible = false;
  }
  function checkPillars(extra = 0.25) { for (const p of R.pillars) if (hyp(b.x - p.x, b.z - p.z) < b.r + p.r + extra) { impactPillar(p); return true; } return false; }
  b.die = () => {
    b.state = 'dead'; b.physics = false; b.hittable = false; arrow.visible = false; L.g.visible = false; brows.visible = false;
    burst(b.x, 1, b.z, 60, [0xffc531, 0xffe14a, 0xffffff, 0xff3b5c], 10, 10, 1.2);
    for (let i = 0; i < 2; i++) spawnPart(b.x, 0.6, b.z, rand(-5, 5), 10, rand(-5, 5), 0xffc531, 1.5, 3);
    setTimeout(() => SFX.fanfare(), 300);
  };
  b.update = dt => {
    b.t += dt; b.legT += dt; let legSpeed = 0, shakeAmt = 0;
    const gx = goat.x - b.x, gz = goat.z - b.z, gd = hyp(gx, gz) || 1;
    if (b.state === 'idle') {
      body.position.y = 0.5 + Math.sin(b.t * 2) * 0.08; body.rotation.y += dt * 0.8;
      if (gd < 3.4) { b.state = 'wake'; b.t = 0; R.state = 'fight'; progress(); SFX.boing(); sayNow("Ú ÒA! Cúp muốn nhận dê cơ!", 'happy'); say("Đừng có phá đồ của tôi đấy!", 'smug'); }
    } else if (b.state === 'wake') {
      const k = Math.min(1, b.t / 1.0); L.g.scale.y = k; body.position.y = lerp(0.5, 0.6, k) + Math.sin(b.t * 30) * 0.05; eyes.g.visible = true; brows.visible = true;
      podium.userData.ty = 0.25 - k * 0.8; shine.visible = false; b.heading = angLerp(b.heading, Math.atan2(gx, gz), dt * 6);
      if (b.t > 1.3) { b.state = 'chase'; b.t = 0; }
    } else if (b.state === 'chase') {
      const s = spd(); b.x += gx / gd * s * dt; b.z += gz / gd * s * dt; resolveStatic(b);
      b.heading = angLerp(b.heading, Math.atan2(gx, gz), dt * 8); legSpeed = 10; body.position.y = 0.6 + Math.abs(Math.sin(b.legT * 10)) * 0.1;
      if (b.t > chaseDur() && gd < 14) { b.state = 'tele'; b.t = 0; b.dir = { x: gx / gd, z: gz / gd }; b.heading = Math.atan2(gx, gz); arrow.visible = true; arrow.rotation.y = b.heading; SFX.bad(); }
    } else if (b.state === 'tele') {
      shakeAmt = 0.08 + b.t * 0.08; arrow.position.set(b.x, 0.06, b.z); arrow.material.opacity = 0.4 + Math.abs(Math.sin(b.t * 14)) * 0.6;
      gold.emissive.setRGB(0.4 + Math.sin(b.t * 30) * 0.3, 0.05, 0);
      if (b.t > teleDur()) { b.state = 'charge'; b.t = 0; arrow.visible = false; b.charges++; SFX.dash(); gold.emissive.set(0x6a4200); }
    } else if (b.state === 'charge') {
      const cs = chargeSpd(); b.x += b.dir.x * cs * dt; b.z += b.dir.z * cs * dt; legSpeed = 24; body.position.y = 0.6;
      if (Math.random() < 0.7) spawnPart(b.x, 0.2, b.z, rand(-1, 1), 1.5, rand(-1, 1), 0xffe14a, 0.4, 1, 4);
      if (!checkPillars()) {
        const h = resolveStatic(b);
        if (h && (b.dir.x * h.nx + b.dir.z * h.nz) < -0.3) { b.state = 'stun'; b.t = 0; b.stunDur = 0.9; SFX.bonk(); shake = 0.4; floatText("CỐP", b.x, 2.6, b.z, 'weak'); burst(b.x, 1, b.z, 12, [0xffe14a, 0xffffff], 5, 5, 0.5); }
        else if (b.t > 1.35) { b.state = 'chase'; b.t = 0; }
      }
      if (b.state === 'charge' && goat.invT <= 0 && !goat.launch && hyp(goat.x - b.x, goat.z - b.z) < goat.r + b.r) {
        die("CÚP HÚC BAY MÀU", ["Suýt thắng rồi! Tôi thích khúc này nhất.", "Thấy mũi tên rồi mà vẫn đứng yên à?"][saved.deaths % 2]); return;
      }
    } else if (b.state === 'stun') {
      if (b.physics && hyp(b.vx, b.vz) < 0.3) b.physics = false;
      body.rotation.z = Math.sin(b.t * 10) * 0.2; body.position.y = 0.6;
      if (b.t > b.stunDur) { b.state = 'chase'; b.t = 0; b.physics = false; body.rotation.z = 0; }
    } else if (b.state === 'knock') {
      body.rotation.z = Math.sin(b.t * 12) * 0.3;
      if (hyp(b.vx, b.vz) > 2.5) checkPillars(0.35);
      if (b.state === 'knock' && hyp(b.vx, b.vz) < 0.5) { b.state = 'stun'; b.t = 0; b.stunDur = 1.0; b.physics = false; }
    } else if (b.state === 'dead') {
      body.rotation.z = lerp(body.rotation.z, Math.PI / 2, dt * 5); body.position.y = lerp(body.position.y, 0.75, dt * 5); eyes.g.visible = false; star.visible = false;
    }
    if (b.state === 'chase' || b.state === 'tele' || b.state === 'charge') body.rotation.z = 0;
    const sw = legSpeed ? Math.sin(b.legT * legSpeed) * 0.9 : 0; L.legs[0].rotation.x = sw; L.legs[1].rotation.x = -sw;
    stars.visible = b.state === 'stun' || b.state === 'knock'; stars.rotation.y += dt * 7;
    g.position.set(b.x + (shakeAmt ? rand(-shakeAmt, shakeAmt) : 0), 0, b.z + (shakeAmt ? rand(-shakeAmt, shakeAmt) : 0));
    if (b.state !== 'idle') body.rotation.y = 0; g.rotation.y = b.state === 'idle' ? 0 : b.heading; L.g.rotation.y = 0;
    for (const p of eyes.pupils) p.position.y = (b.state === 'stun' ? Math.sin(b.t * 12 + p.position.x * 9) * 0.05 : 0);
  };
  return b;
}

// ================= FINAL TWIST =================
const R4 = {
  title: "LỖI HỆ THỐNG", start: [-10, 4], startFacing: Math.PI / 2,
  build() {
    this.state = 'reach'; this.teleported = false; this.t = 0;
    this.fws = [{ x: -4.5, ph: 0, sp: 1.25 }, { x: 1.5, ph: 2.1, sp: 1.5 }, { x: 6.5, ph: 4.0, sp: 1.35 }].map(f => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 3.6), new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.55, depthWrite: false }));
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 3.65), EM(0xff3b5c, 3)); edge.position.y = 1.1; m.add(edge);
      const lbl = sprite(labelTex("TƯỜNG LỬA", '#330008', '#ff3b5c', 400, 100, 56), 1.8, 0.45); lbl.position.y = 1.6; m.add(lbl);
      m.position.set(f.x, 1.1, 0); addMesh(m, false); return { ...f, m, z: 0, hw: 0.25, hd: 1.8 };
    });
    const g = new THREE.Group();
    const ped = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, 0.7, 16), M(0x222233))); ped.position.y = 0.35; g.add(ped);
    const capM = M(0x4bff8a, { emissive: 0x22ff66, emissiveIntensity: 1.2, flatShading: false });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM); cap.position.y = 0.7; cap.scale.y = 0.7; g.add(cap);
    const lab = sprite(labelTex("ĐẶT LẠI HỆ THỐNG", '#0d3a22', '#4bff8a', 512, 110, 60), 2.4, 0.52); lab.position.y = 1.9; g.add(lab);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 9, 24, 1, true), BM(0x4bff8a, { transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beam.position.y = 4.5; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 32), BM(0x4bff8a, { side: THREE.DoubleSide, transparent: true })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    const b = this.btn = makeBody({ x: -1.5, z: -4.6, r: 0.9, fixed: true, hittable: true, mesh: g, kind: 'reset' });
    b.hint = () => ({ k: 'SPACE', t: "Húc để đặt lại" });
    b.rise = 0;
    b.onHeadbutt = () => { if (this.state !== 'reach') return 'weak'; this.state = 'done'; cap.position.y = 0.55; finalReset(b); return 'good'; };
    b.update = dt => { b.rise = Math.min(1, b.rise + dt * 0.8); g.position.set(b.x, (b.rise - 1) * 2, b.z); ring.scale.setScalar(1 + Math.sin(realTime * 5) * 0.08); beam.material.opacity = 0.08 + Math.sin(realTime * 4) * 0.04; };
  },
  objective() { return this.state === 'reach' ? "Húc nút ĐẶT LẠI HỆ THỐNG" : "ĐANG ĐẶT LẠI HỆ THỐNG..."; },
  hint() { return "Quan sát nhịp di chuyển của các vệt đỏ."; },
  intro() { say("Hết giờ diễn rồi. Mời dê ra ngoài.", 'smug'); say("Khoan! Ai để cái nút đó ở đây?!", 'shock'); },
  update(dt) {
    this.t += dt;
    for (const f of this.fws) {
      f.z = Math.sin(this.t * f.sp + f.ph) * 4.6; f.m.position.z = f.z;
      if (goat.invT <= 0 && !goat.launch && Math.abs(goat.x - f.x) < f.hw + goat.r && Math.abs(goat.z - f.z) < f.hd + goat.r && this.state === 'reach') {
        const s = goat.x < f.x ? -1 : 1; goat.vx = s * 10; goat.vz = 0; goat.hurtT = 0.35; goat.invT = 1.2; goat.dashT = 0;
        goat.x = f.x + s * (f.hw + goat.r + 0.05);
        mistake(goat.x, goat.z, "GIẬT TÊ DÊ!"); SFX.zap(); shake = 0.4; burst(goat.x, 1, goat.z, 14, [0xff3b5c, 0xffffff], 5, 5, 0.5);
      }
    }
    const b = this.btn;
    if (!this.teleported && this.state === 'reach' && hyp(goat.x - b.x, goat.z - b.z) < 3.0) {
      this.teleported = true; burst(b.x, 1, b.z, 30, [0x4bff8a, 0xff2bd6], 6, 6, 0.6); SFX.glitch();
      b.x = 10.2; b.z = 3.8; b.rise = 0.3; burst(b.x, 1, b.z, 30, [0x4bff8a, 0xff2bd6], 6, 6, 0.6); face.glitch = 0.5;
      sayNow("Tôi chuyển chỗ rồi! Quên là tôi chơi gian à?", 'happy'); progress();
    }
  },
  restartNote: "Tường lửa cũng thử lại cùng bạn nhé.",
};
// Troll arcade upgrade. Checkpoints store solved sequences, not transient trap timers.
const saved = { cp: 'course', deaths: 0, pillars: [], tileKnown: false, fakeKnown: false };
// Presentation-only counters for gentle, checkpoint-specific guidance.
let guidanceFailures = {}; 
let deathT = 0, checkpointMarker = null;
function checkpoint(cp, x, z) {
  saved.cp = cp; saved.x = x; saved.z = z; progress();
  SFX.good(); floatText("ĐÃ LƯU MỐC", x, 3.1, z, 'good'); // above the 3D "MỐC LƯU" flag, not on top of it
  checkpointVisual(x,z);
}
function checkpointVisual(x,z) {
  if (checkpointMarker) { scene.remove(checkpointMarker); checkpointMarker.children[0]?.geometry.dispose(); }
  checkpointMarker = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.RingGeometry(.6,.75,24),BM(0x4bff8a,{side:THREE.DoubleSide})); disc.rotation.x=-Math.PI/2; disc.position.y=.09;
  const flag = sprite(labelTex("MỐC LƯU",'#133723','#4bff8a',512,100,58),1.9,.37); flag.position.y=1.7;
  checkpointMarker.add(disc,flag); checkpointMarker.position.set(x,0,z);scene.add(checkpointMarker);
}
function die(reason, line) {
  if(phase!=='play'||deathT>0||goat.invT>0) return;
  saved.deaths++; guidanceFailures[saved.cp]=(guidanceFailures[saved.cp]||0)+1; deathT=.32; phase='dead'; releaseHeld(true); goat.dashT=0;
  SFX.bad(); SFX.bonk(); shake=.65;
  burst(goat.x,1,goat.z,30,[0xffffff,0xff3b5c,0xffe14a],8,7,.65);
  floatText(reason,goat.x,2.2,goat.z,'bad');
  const repeatLine=roundIdx>=4 ? (saved.deaths>=15?'Ngã bao nhiêu lần mà vẫn không chịu thua?!':saved.deaths>=7?'Lì thế! Tôi sắp hết câu để cà khịa rồi!':'Lại nữa à? Tôi vẫn đang đếm nhé!') : 'Lại nữa à? Cố lên, tôi đang xem!';
  sayNow(guidanceFailures[saved.cp]>=3 ? repeatLine : (line || 'Dê gì mà non thế?'),roundIdx>=4?'angry':'happy',1.3);
}
function retryCheckpoint() {
  clearTimers(); $('#card').classList.remove('show');
  buildRound(roundIdx); phase='play';deathT=0;
  goat.invT=.65;goat.dashCd=0;goat.hurtT=0; progress();
  if(saved.x!==undefined){goat.x=saved.x;goat.z=saved.z;}
  if(round.onRetry)round.onRetry();
  burst(goat.x,.3,goat.z,14,[0x3ff0ff,0xffffff],3,3,.35);
}
function signAt(text,x,z,color='#3ff0ff',width=2.7){
  const s=sprite(labelTex(text,'#160828',color,640,120,Math.min(98,900/text.length)),width,.51);s.position.set(x,2.1,z);addMesh(s,false);return s;
}
function patch(x,z,w,d,color=0x160526){
  const p=new THREE.Mesh(new THREE.BoxGeometry(w,.06,d),M(color));p.position.set(x,.055,z);addMesh(p,false);return p;
}
function exitAt(x,z,text="LỐI RA"){
  patch(x,z,1.7,1.7,0x176d40);return signAt(text,x,z,'#4bff8a',1.7);
}
function spikePatch(x,z,w,d){
  const g=new THREE.Group();g.position.set(x,0,z);
  const base=new THREE.Mesh(new THREE.BoxGeometry(w,.08,d),M(0x200611));base.position.y=.08;g.add(base);
  for(let a=-w/2+.25;a<w/2;a+=.5)for(let b=-d/2+.25;b<d/2;b+=.5){const s=new THREE.Mesh(new THREE.ConeGeometry(.15,.65,5),M(0xff3355));s.position.set(a,.4,b);g.add(s);}
  addMesh(g,false);return g;
}
// Stage 1 uses the original finish chase, followed by a precision tile run.
const originalR1={build:R1.build,update:R1.update,hint:R1.hint,objective:R1.objective};
R1.title="TIN AI BÂY GIỜ?";
R1.build=function(){
  if(['course','chase'].includes(saved.cp)){
    originalR1.build.call(this);
    if(saved.cp==='chase'){this.state='chase';this.fin.state='run';this.fin.theta=Math.PI;this.zone.shown=true;this.route.visible=true;}
    return;
  }
  this.state=saved.cp==='doors'?'doors':'tiles';this.tileT=0;this.fallen=false;this.revealed=saved.fakeKnown;
  addWall(-12,6,-7,-1.6,1.0,wallMats[0],stripB);
  addWall(-12,6,1.6,7,1.0,wallMats[0],stripA);
  addWall(10.6,11.3,-7,7,1.3,wallMats[1],stripA);
  this.tiles=[];
  for(let i=0;i<5;i++){
    const x=-6+i*2.6;const p=patch(x,0,2.35,2.8,0x29b86f);this.tiles.push(p);
    const n=sprite(labelTex(String(i+1),'#17482c','#fff',128,128,90),.5,.5);n.position.set(x,.4,0);addMesh(n,false);
  }
  this.crack=patch(-.8,0,2.35,2.8,0x080510);this.crack.visible=false;
  const third=this.tiles[2]; if(saved.tileKnown){third.material.color.set(0xb99b27);signAt("ĐÃ NỨT",-.8,0,'#ffe14a',1.6);}
  this.fakeWall=addWall(9.0,9.6,-1.35,1.35,2.2,wallMats[2],stripA);
  this.fakeSign=signAt(this.revealed?"TƯỜNG ĐẤY!":"LỐI RA",8.8,0,this.revealed?'#ff3355':'#4bff8a',2);
  this.fakePanel=patch(8.6,0,.6,2.5,0x4bff8a);
  exitAt(9,-4.7,"BẢO TRÌ");
  signAt("XANH = AN TOÀN",-7.8,0,'#4bff8a',2.3);
  if(saved.cp==='doors'){third.visible=false;this.crack.visible=true;}
};
R1.captured=function(){
  this.state='done';this.zone.cage.visible=true;addChaos(200,this.C.x,this.C.z);SFX.good();
  sayNow("Ơ KÌA! AI CHO PHÉP?! Thử sàn mới đi!",'angry',1.3);
  after(.8,()=>{checkpoint('tiles',-9.7,0);buildRound(0);goat.x=-9.7;goat.z=0;});
};
R1.objective=function(){return ['course','chase','done'].includes(this.state)?originalR1.objective.call(this):this.state==='tiles'?"Băng qua các ô xanh":"Tìm lối ra khỏi đấu trường";};
R1.hint=function(){return ['course','chase'].includes(this.state)?originalR1.hint.call(this):this.state==='tiles'?"Thử quan sát mặt sàn. Húc giúp lao đi nhanh hơn.":"Nhìn quanh xem còn lối đi nào khác không.";};
R1.intro=function(){sayNow("Dễ lắm! Chỉ cần về đích thôi mà!",'smug',1.5);};
R1.update=function(dt){
  if(this.state==='escaped')return;
  if(['course','chase','done'].includes(this.state)){
    const was=this.state;originalR1.update.call(this,dt);
    if(was==='course'&&this.state==='chase')checkpoint('chase',.4,4.8);
    return;
  }
  if(this.state==='tiles'){
    const on=Math.abs(goat.x+.8)<1.15&&Math.abs(goat.z)<1.6;
    if(on&&!this.fallen){this.tileT+=dt;this.tiles[2].position.y=.055+Math.sin(this.tileT*80)*.055;
      if(this.tileT>.23){this.fallen=true;saved.tileKnown=true;this.tiles[2].visible=false;this.crack.visible=true;SFX.bonk();sayNow("Xanh thì an toàn. Trừ cái ô xanh đó!",'happy',1.3);}}
    if(this.fallen&&on){die("SÀN NGỪNG HOẠT ĐỘNG","Sàn cũng có ngày nghỉ mà!");return;}
    if(goat.x>5.6){this.state='doors';checkpoint('doors',6.5,0);sayNow("Cửa ngay kia rồi. Yên tâm, tôi nói thật!",'smug',1.2);}
  }
  if(this.state==='doors'){
    if(!this.revealed&&goat.x>7.1&&Math.abs(goat.z)<1.8){this.revealed=true;saved.fakeKnown=true;this.fakePanel.material.color.set(0xff2244);this.fakeSign.material.map=labelTex("TƯỜNG ĐẤY!",'#160828','#ff3355',640,120,58);SFX.bonk();shake=.3;floatText("TƯỜNG MÀ!",8.5,2.8,0,'bad');sayNow("Bạn vừa định đi xuyên tường à?",'happy',1.3);}
    if(hyp(goat.x-9,goat.z+4.7)<1.0){this.state='escaped';roundClear();}
  }
};
// Stage 2: button lies, arrow lies, weight never lies.
R2.title="LUẬT CHỈ ĐỂ LỪA";
R2.build=function(){
 this.state=saved.cp==='helddoor'?'open':'locked';this.clock=0;this.pressed=false;this.snapped=saved.cp!=='button';this.warn=-1;this.arrowT=0;
 addWall(6.8,7.4,-7,-1.5,1.6,wallMats[1],stripB);addWall(6.8,7.4,1.5,7,1.6,wallMats[1],stripB);
 this.door=addWall(6.9,7.25,-1.5,1.5,2,wallMats[2],stripA);exitAt(10,0);
 addWall(-3,-1.8,-3,-1.8,1,wallMats[0],stripB);addWall(-3,-1.8,1.8,3,1,wallMats[0],stripB);
 this.P={x:-6.5,z:-4.6,r:1.1};patch(-6.5,-4.6,2.3,2.3,0x145b69);signAt("ĐÈ ĐỂ MỞ",-6.5,-4.6,'#3ff0ff',2.4);
 this.spikes=spikePatch(1.4,4.7,3.5,2.5);this.spikes.scale.y=.05;
 signAt("ĐƯỜNG TẮT >>>",-1,4.7,'#4bff8a',3);patch(1.4,4.7,3.5,2.5,0x37724a);
 const g=new THREE.Group();const base=sh(new THREE.Mesh(new THREE.CylinderGeometry(.65,.8,.5,14),M(0x333344)));base.position.y=.25;g.add(base);
 const cap=sh(new THREE.Mesh(new THREE.SphereGeometry(.6,14,10,0,Math.PI*2,0,Math.PI/2),M(0xff2233,{emissive:0x550000})));cap.position.y=.5;cap.scale.y=.65;g.add(cap);
 const b=this.btn=makeBody({x:-6,z:0,r:.7,mass:.6,physics:true,hittable:true,grabbable:true,mesh:g,kind:'button',friction:10,bounce:.3});
 b.hint=()=>({k:goat.held===b?'E':'SPACE',t:goat.held===b?"Thả":"Đẩy · E: Kéo"});
 b.onHeadbutt=d=>{b.vx=d.x*10;b.vz=d.z*10;b.vy=2;addChaos(20);progress();return 'good';};
 b.onGrab=()=>{sayNow("Nút đó không phải hành lý xách tay!",'angry',1.1);progress();};
 b.update=()=>{g.position.set(b.x,b.y,b.z);};
 if(saved.cp==='helddoor'){b.x=this.P.x;b.z=this.P.z;b.fixed=true;b.physics=false;b.grabbable=false;b.hittable=false;}
 this.lasers=[{x:8.8,phase:0},{x:10.6,phase:2}].map(f=>{const m=new THREE.Mesh(new THREE.BoxGeometry(.16,.8,3),EM(0xff3344,1.6));addMesh(m,false);return {...f,m};});
};
R2.start=[-10,0];
R2.intro=function(){sayNow("Bấm nút đỏ là mở cửa. Tôi thề luôn!",'smug',1.5);};
R2.objective=function(){return this.state==='open'?"Cửa đã giữ mở. Đến LỐI RA.":this.snapped?"Tìm cách giữ cửa mở":"Bấm nút đỏ rồi đến cửa";};
R2.hint=function(){return this.state==='open'?"Các vệt đỏ có nhịp riêng. Bình tĩnh quan sát.":this.snapped?"Đồ vật không chỉ để bấm. Thử E khi đứng gần.":"Đứng sát nút đỏ để tương tác.";};
R2.update=function(dt){
 if(this.state==='done')return;
 this.clock+=dt;const b=this.btn,P=this.P;
 if(!this.pressed&&!this.snapped&&hyp(goat.x-b.x,goat.z-b.z)<1.4){this.pressed=true;SFX.open();sayNow("Mở rồi! Chạy đi! Tôi tốt bụng ghê!",'happy',1.2);progress();}
 if(this.pressed&&!this.snapped&&goat.x>4.6){this.snapped=true;this.pressed=false;SFX.clang();shake=.5;checkpoint('weight',-5,0);sayNow("Ú ÒA! Cửa đổi ý rồi!",'happy',1.5);}
 if(this.state!=='open'&&hyp(b.x-P.x,b.z-P.z)<P.r){this.state='open';releaseHeld(true);b.x=P.x;b.z=P.z;b.fixed=true;b.physics=false;b.grabbable=false;b.hittable=false;b.vx=b.vz=0;checkpoint('helddoor',5.1,0);addChaos(200,P.x,P.z);sayNow("Lấy đồ đè cửa?! Khôn thế ai chơi lại!",'angry',1.2);}
 const opened=this.state==='open'||this.pressed;
 this.door.disabled=opened;this.door.mesh.userData.ty=opened?-2.3:0;
 const arrowOn=Math.abs(goat.x-1.4)<1.75&&Math.abs(goat.z-4.7)<1.25;
 if(arrowOn){this.arrowT+=dt;if(this.arrowT<.3){this.spikes.scale.y=.1+this.arrowT;}
 else{this.spikes.scale.y=1;die("ĐƯỜNG TẮT VỀ MỐC","Tôi chỉ gợi ý thôi. Ai bảo nghe!");}}
 else{this.arrowT=0;this.spikes.scale.y=lerp(this.spikes.scale.y,.05,dt*6);}
 for(const f of this.lasers){f.z=Math.sin(this.clock*1.3+f.phase)*4.7;f.m.position.set(f.x,.45,f.z);
 if(Math.abs(goat.x-f.x)<.35&&Math.abs(goat.z-f.z)<1.65){die("QUÉT XONG. XÓA LUÔN.","Canh cũng chưa chuẩn nhỉ? Thử lại!");return;}}
 if(this.state==='open'&&hyp(goat.x-10,goat.z)<.9){this.state='done';roundClear();}
};
// Stage 3 keeps defeated pillars across deaths.
const base3build=R3.build,base3hit=R3.pillarHit;
R3.title="TRÒ CHƠI GHÉT BẠN";
R3.build=function(){base3build.call(this);for(const i of saved.pillars)this.pillars[i].disable();this.count=saved.pillars.length;
 if(saved.cp==='fight'){this.state='fight';this.tr.state='wake';this.tr.t=0;}
};
R3.pillarHit=function(p){const i=this.pillars.indexOf(p);if(!saved.pillars.includes(i))saved.pillars.push(i);base3hit.call(this,p);
 if(this.count<3)checkpoint('fight',-9.5,4.5);
};
R3.update=function(){if(this.state==='fight'&&saved.cp!=='fight')checkpoint('fight',-9.5,4.5);};
// Final: the obvious reset is a mine. Attack the rules instead.
R4.title="CÚ LỪA CUỐI";R4.start=[-10,0];
R4.build=function(){
 this.state='reach';this.clock=0;this.blastT=-1;this.known=saved.fakeKnown;this.revealed=saved.cp==='control';
 addWall(-4.2,-3.6,-7,1.7,1.2,wallMats[0],stripA);addWall(2.0,2.6,-1.7,7,1.2,wallMats[1],stripB);
 const g=new THREE.Group();const c=sh(new THREE.Mesh(new THREE.CylinderGeometry(.85,.95,.6,16),M(0xff2233,{emissive:0x550000})));c.position.y=.3;g.add(c);const lab=signAt("ĐẶT LẠI HỆ THỐNG",7.5,1,'#4bff8a',2.6);
 const fake=this.btn=makeBody({x:7.5,z:1,r:.9,fixed:true,hittable:true,mesh:g,kind:'fake reset'});g.position.set(fake.x,0,fake.z);fake.hint=()=>({k:'SPACE',t:"Đặt lại hệ thống?"});
 fake.onHeadbutt=()=>{this.blastT=0;saved.fakeKnown=true;SFX.bad();sayNow("Đang đặt lại... tuổi thọ của bạn.",'happy',1.2);return 'good';};
 const disc=new THREE.Mesh(new THREE.RingGeometry(.05,1,64),BM(0xff3355,{transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));disc.rotation.x=-Math.PI/2;disc.position.set(7.5,.1,1);disc.visible=false;addMesh(disc,false);this.blast=disc;
 const boardG=new THREE.Group();const post=new THREE.Mesh(new THREE.BoxGeometry(.2,1.5,.2),M(0x777788));post.position.y=.75;boardG.add(post);
 const panel=new THREE.Mesh(new THREE.BoxGeometry(3,1.5,.18),M(0xffffff,{map:labelTex("PHẢI NGHE LUẬT",'#22103a','#ffe14a',768,256,62)}));panel.position.y=1.8;boardG.add(panel);
 const board=this.board=makeBody({x:-.8,z:-4.5,r:1.25,fixed:true,hittable:true,mesh:boardG,kind:'rules'});boardG.position.set(board.x,0,board.z);
 board.hint=()=>({k:'SPACE',t:this.revealed?"Húc bộ điều khiển":"Húc biển luật"});
 const control=new THREE.Mesh(new THREE.BoxGeometry(1,.6,.5),EM(0x4bff8a,1.6));control.position.y=1.5;control.visible=this.revealed;boardG.add(control);panel.visible=!this.revealed;
 board.onHeadbutt=()=>{if(!this.revealed){this.revealed=true;panel.visible=false;control.visible=true;checkpoint('control',-.8,-1.7);addChaos(150,board.x,board.z);signAt("LÕI HỆ THỐNG",board.x,board.z,'#4bff8a',2);sayNow("Đó là bảng điều khiển của tôi mà!",'shock',1.3);}else{this.state='done';finalReset(board);}return 'good';};
 this.sweeps=[{x:-6,ph:0},{x:4.8,ph:1.9}].map(f=>{const m=new THREE.Mesh(new THREE.BoxGeometry(.2,1,3.2),EM(0xff3355,1.5));addMesh(m,false);return {...f,m};});
 if(this.revealed)signAt("LÕI HỆ THỐNG",board.x,board.z,'#4bff8a',2);
};
R4.objective=function(){return this.revealed?"Húc LÕI HỆ THỐNG vừa lộ ra":saved.fakeKnown?"Nút đó lừa bạn. Tìm cách khác.":"Tìm cách đặt lại trò chơi";};
R4.intro=function(){sayNow("Thắng rồi! Bấm nút đặt lại để nhận danh hiệu!",'smug',1.5);};
R4.hint=function(){return "Thử tương tác với những thứ khác. Đừng chỉ nghe MC.";};
R4.update=function(dt){
 this.clock+=dt;
 if(this.blastT>=0){this.blastT+=dt;this.blast.visible=true;this.blast.scale.setScalar(3.3);this.blast.material.opacity=.2+Math.sin(this.blastT*30)*.18;
 if(this.blastT>.65&&this.blastT<1.0){this.blast.material.opacity=.8;if(hyp(goat.x-7.5,goat.z-1)<3.3)die("ĐẶT LẠI = BAY MÀU","Ú ÒA! Bất ngờ chưa? Lại nhé!");}
 if(this.blastT>1){this.blastT=-1;this.blast.visible=false;}}
 for(const f of this.sweeps){const z=Math.sin(this.clock*1.4+f.ph)*4.6;f.m.position.set(f.x,.5,z);if(Math.abs(goat.x-f.x)<.4&&Math.abs(goat.z-z)<1.8){die("DÍNH TƯỜNG LỬA","Dê chưa được cấp quyền truy cập!");return;}}
};

// ===== Extension: appended content; the original four arena configurations remain intact. =====
const extension = { bossHits: 0, finishKnown: false };
function extReset(){extension.bossHits=0;extension.finishKnown=false;}
function extButton(x,z,text,color,onHit){
  const g=new THREE.Group();
  const base=sh(new THREE.Mesh(new THREE.CylinderGeometry(.67,.83,.5,14),M(0x30244b)));base.position.y=.25;g.add(base);
  const cap=sh(new THREE.Mesh(new THREE.SphereGeometry(.58,16,10,0,Math.PI*2,0,Math.PI/2),M(color,{emissive:color,emissiveIntensity:.45})));cap.position.y=.5;cap.scale.y=.65;g.add(cap);
  const b=makeBody({x,z,r:.76,fixed:true,hittable:true,mesh:g,kind:'extension-button'});g.position.set(x,0,z);
  signAt(text,x,z,'#ffe14a',2.5);
  b.cap=cap;b.hint=()=>({k:'SPACE',t:'Húc nút'});b.onHeadbutt=onHit;
  return b;
}
function extBoard(x,z,text,onHit){
  const g=new THREE.Group();
  const post=sh(new THREE.Mesh(new THREE.BoxGeometry(.18,1.5,.18),M(0x9f754a)));post.position.y=.75;g.add(post);
  const panel=sh(new THREE.Mesh(new THREE.BoxGeometry(2.8,1.45,.18),M(0xffffff,{map:labelTex(text,'#25113d','#ffe14a',768,256,65)})));panel.position.y=1.75;panel.rotation.z=-.065;g.add(panel);
  // Loose cyan bolts and a lit hairline: a clue, not an instruction overlay.
  const clues=new THREE.Group();
  for(const side of [-1,1]){const bolt=new THREE.Mesh(new THREE.OctahedronGeometry(.085),EM(0x3ff0ff,1.5));bolt.position.set(side*1.12,1.2,.14);clues.add(bolt);}
  const crack=new THREE.Mesh(new THREE.BoxGeometry(.045,.7,.03),EM(0x3ff0ff,1.6));crack.position.set(.2,1.65,.14);crack.rotation.z=-.55;clues.add(crack);g.add(clues);
  const b=makeBody({x,z,r:1.08,fixed:true,hittable:true,mesh:g,kind:'extension-board'});g.position.set(x,0,z);
  b.panel=panel;b.clues=clues;b.hint=()=>({k:'SPACE',t:'Biển hơi lung lay…'});b.onHeadbutt=onHit;
  b.break=()=>{panel.visible=false;clues.visible=false;b.hittable=false;b.noCollide=true;burst(x,1.8,z,30,[0x9f754a,0x3ff0ff,0xffe14a],8,7,.8);};
  return b;
}
function nextExtensionPart(cp){
  phase='clear';SFX.good();addChaos(150,goat.x,goat.z);
  after(.55,()=>{checkpoint(cp,-10,0);buildRound(4);goat.x=-10;goat.z=0;goat.dashCd=0;phase='play';round.intro();});
}
const MindStage={
  title:'GAME BIẾT BẠN NGHĨ GÌ',start:[-10,0],startFacing:Math.PI/2,
  build(){
    this.part=saved.cp==='closing-walls'?1:saved.cp==='vanishing-bridge'?2:0;
    this.state='play';this.clock=0;this.triggered=false;
    if(this.part===0)this.buildDoors();else if(this.part===1)this.buildWalls();else this.buildBridge();
  },
  progressUI(){return this.part;},progressLabel:'BẪY ĐÃ QUA',
  objective(){return this.part===0?(this.revealed?'Đi qua lối vừa lộ ra':'Chọn đường ra khỏi phòng'):this.part===1?'Vượt hành lang trước khi tường ép kín':'Qua cầu trước khi các ô biến mất';},
  hint(){return this.part===0?'Hai cái tên chưa chắc là hai lựa chọn. Có thứ gì đang lỏng ốc?':this.part===1?'Lúc tường khép, vẫn có thứ có thể húc.':'Canh hướng trước. Húc ở đoạn thẳng, rẽ bằng bước đi.';},
  intro(){sayNow(['Ồ, giờ bạn không tin tôi nữa à?','Nhanh lên! Tôi không có cả ngày đâu!','Cầu có bảo hành đâu mà đòi!'][this.part],this.part===0?'smug':'angry',1.6);},
  buildDoors(){
    this.revealed=false;
    addWall(5,5.7,-7,-4.4,1.8,wallMats[1],stripB);
    this.hiddenWall=addWall(5,5.7,-1.6,1.6,1.8,wallMats[0],stripA);
    addWall(5,5.7,4.4,7,1.8,wallMats[1],stripB);
    signAt('AN TOÀN',5,-3,'#4bff8a',2.3);signAt('BẪY',5,3,'#ff5577',2.3);
    // Both doors have the same small warning stripe; neither promises immunity.
    this.doors=[-3,3].map(z=>{
      const pad=patch(7.6,z,4,2.7,0x254438);
      const spikes=spikePatch(7.6,z,4,2.7);spikes.visible=false;
      addWall(9.7,10.3,z-1.4,z+1.4,1.5,wallMats[2],stripA);
      return {z,pad,spikes,t:-1};
    });
    this.board=extBoard(-.8,0,'CHỌN ĐÚNG MỘT CỬA',()=>{
      if(this.revealed)return 'weak';this.revealed=true;this.board.break();this.hiddenWall.disabled=true;this.hiddenWall.mesh.userData.ty=-2.2;
      exitAt(10.2,0,'LỐI THỨ BA');SFX.open();progress();addChaos(120,-.8,0);
      sayNow('Ba lựa chọn?! Tôi chỉ lập trình hai mà!','shock',1.5);return 'good';
    });
  },
  buildWalls(){
    this.gap=4.7;this.reverseT=0;this.activeT=0;this.started=false;this.switchCd=0;
    addWall(-12,12,-7,-5.25,1.1,wallMats[0],stripB);addWall(-12,12,5.25,7,1.1,wallMats[0],stripB);
    addWall(-5.5,-4.8,-.3,3.2,1.0,wallMats[1],stripB);
    addWall(-1.8,-1.1,-3.2,.3,1.0,wallMats[1],stripB);
    addWall(2.2,2.9,-.3,3.2,1.0,wallMats[1],stripB);
    addWall(-9.2,-8.6,-5.25,-1.8,1.4,wallMats[0],stripB);addWall(-9.2,-8.6,1.8,5.25,1.4,wallMats[0],stripB);
    this.moving=[-1,1].map(side=>{
      const w=addWall(-8.6,8.4,side<0?-5.15:4.7,side<0?-4.7:5.15,1.55,wallMats[2],stripA);w.side=side;return w;
    });
    this.switch=extButton(-7,-1.6,'ĐẢO CHIỀU',0x3ff0ff,()=>{
      if(this.switchCd>0)return 'weak';this.switchCd=.55;this.reverseT=2.0;this.started=true;
      SFX.open();progress();floatText('TƯỜNG LÙI LẠI!',-7,2,-1.6,'good');sayNow('Ê! Nút đó dành cho kỹ thuật viên!','angry',1.2);return 'good';
    });
    signAt('>>>',-9,0,'#ffe14a',1);exitAt(10.5,0);
  },
  buildBridge(){
    this.bridgeT=-1;this.bridgeTiles=[];
    patch(0,0,16.5,13.9,0x070310);
    const path=[[-7.1,0],[-5.4,0],[-3.7,1.45],[-2,1.45],[-.3,0],[1.4,-1.45],[3.1,-1.45],[4.8,0],[6.5,0],[8.2,0]];
    path.forEach(([x,z],i)=>{
      const m=patch(x,z,2.2,2.65,i%2?0x278bb0:0x3864bd);m.position.y=.17;
      const rim=new THREE.Mesh(new THREE.BoxGeometry(1.8,.035,.06),EM(0x3ff0ff,1));rim.position.y=.04;m.add(rim);
      this.bridgeTiles.push({x,z,m,i,dropAt:.75+i*.36,gone:false});
    });
    signAt('CHẠY MỘT MẠCH',-9.5,0,'#ffe14a',2.2);exitAt(10.5,0);
  },
  update(dt){
    if(phase!=='play'||this.state==='done')return;
    this.clock+=dt;
    if(this.part===0){
      for(const d of this.doors){
        if(d.t<0&&goat.x>4.15&&Math.abs(goat.z-d.z)<1.4){d.t=0;SFX.bad();sayNow('Cửa nào cũng có quà. Quà hơi nhọn!','happy',1.2);}
        if(d.t>=0){d.t+=dt;d.pad.material.color.set(d.t<.42?0xffc52a:0xff2244);d.spikes.visible=d.t>.42;
          if(d.t>.42&&goat.x>5.8&&goat.x<9.8&&Math.abs(goat.z-d.z)<1.4){die('CỬA NÀO CŨNG LỪA','Chọn sai? Không. Đề sai!');return;}}
      }
      if(this.revealed&&goat.x>9.3&&Math.abs(goat.z)<1.25){this.state='done';nextExtensionPart('closing-walls');}
    }else if(this.part===1){
      if(goat.x>-8.7)this.started=true;
      this.switchCd=Math.max(0,this.switchCd-dt);
      if(this.started){this.activeT+=dt;
        if(this.reverseT>0){this.reverseT-=dt;this.gap=Math.min(4.7,this.gap+2.2*dt);}
        else if(this.activeT>.9)this.gap=Math.max(.1,this.gap-.72*dt);
      }
      for(const w of this.moving){w.minZ=w.side<0?-this.gap-.45:this.gap;w.maxZ=w.side<0?-this.gap:this.gap+.45;w.mesh.position.z=(w.minZ+w.maxZ)/2;}
      const inside=goat.x>-8.6-goat.r&&goat.x<8.4+goat.r;
      if(inside&&this.gap<goat.r+.08){die('ÉP THÀNH DÊ DẸP','Nhanh một chút thì còn nguyên con!');return;}
      // A closing wall may move the goat, but cannot push it through a fixed obstacle.
      if(inside){resolveStatic(goat);if(Math.abs(goat.z)>this.gap-goat.r+.12){die('KẸT GIỮA HAI TƯỜNG','Húc thì nhanh. Đứng ngắm thì dẹp.');return;}}
      this.switch.cap.material.emissiveIntensity=this.reverseT>0?1.5:.4;
      if(goat.x>9.5&&Math.abs(goat.z)<2){this.state='done';nextExtensionPart('vanishing-bridge');}
    }else{
      if(this.bridgeT<0&&goat.x>-8.05){this.bridgeT=0;SFX.bad();progress();sayNow('Ơ, tôi quên gia hạn cây cầu!','happy',1.3);}
      if(this.bridgeT>=0){this.bridgeT+=dt;
        for(const t of this.bridgeTiles){
          const left=t.dropAt-this.bridgeT;
          if(left<=0){t.gone=true;t.m.visible=false;}
          else if(left<.24){t.m.material.color.set(0xff8f35);t.m.position.y=.17+Math.sin(left*95)*.04;}
        }
      }
      if(goat.x>-8.05&&goat.x<8.8){
        const supported=this.bridgeTiles.some(t=>!t.gone&&Math.abs(goat.x-t.x)<1.18&&Math.abs(goat.z-t.z)<1.40);
        if(!supported){die('CẦU HẾT HẠN','Đi nhanh thôi. Cầu không đợi dê đâu.');return;}
      }
      if(goat.x>9.5&&Math.abs(goat.z)<2){this.part=3;this.state='done';roundClear();}
    }
  }
};

// Six telegraphed beats per wave, followed by a real counterattack window.
function bossPattern(hits,beat,c,r){
  const p=(beat+hits)%4;
  if(p===0)return c%2===(hits%2);
  if(p===1)return r%2===((beat+hits)%2);
  if(p===2)return (c+r+hits)%2===0;
  return r===((beat+hits)%4)||r===((beat+hits+1)%4);
}
const BossStage={
  title:'TRÙM CUỐI LÀ AI',start:[0,4.8],startFacing:Math.PI,
  progressLabel:'LÕI',
  progressUI(){return this.hits;},
  build(){
    this.hits=extension.bossHits;this.state=saved.cp==='boss-lie'?'surrender':'prepare';this.t=0;this.attackT=0;this.lastBeat=-1;this.blastT=-1;this.won=false;
    this.tiles=[];
    for(let c=0;c<6;c++)for(let r=0;r<4;r++){
      const x=-10+c*4,z=-4.8+r*3.2,m=patch(x,z,3.85,3.02,0x27204d);
      m.material.emissive=new THREE.Color(0x000000);m.material.emissiveIntensity=.8;
      this.tiles.push({c,r,x,z,m,hot:false});
    }
    // The host's core hangs in the same arena, with a visible protective cage.
    const g=new THREE.Group(),orb=sh(new THREE.Mesh(new THREE.IcosahedronGeometry(.84,1),M(0x574285,{emissive:0x442266,emissiveIntensity:.8,metalness:.2,roughness:.35})));orb.position.y=1.5;g.add(orb);
    const rings=[];
    for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(1.15,.055,6,40),EM(0xff3355,1.4));ring.position.y=1.5;ring.rotation.set(i*Math.PI/3,0,i*.9);g.add(ring);rings.push(ring);}
    const shield=new THREE.Mesh(new THREE.IcosahedronGeometry(1.35,1),BM(0xff5577,{wireframe:true,transparent:true,opacity:.5}));shield.position.y=1.5;g.add(shield);
    const core=this.core=makeBody({x:0,z:-2.1,r:1.02,fixed:true,hittable:true,mesh:g,kind:'ai-core',weakText:'KHIÊN ĐANG BẬT'});g.position.set(0,0,-2.1);
    core.hint=()=>this.state==='open'?{k:'SPACE',t:'LÕI ĐANG MỞ!'}:null;
    core.onHeadbutt=()=>{
      if(this.state!=='open')return 'weak';
      this.hits++;extension.bossHits=this.hits;this.t=0;progress();addChaos(200,core.x,core.z);
      floatText(`TRÚNG LÕI! ${this.hits}/3`,0,3,-2.1,'good');SFX.zap();
      if(this.hits>=3){this.state='surrender';checkpoint('boss-lie',0,4.8);this.showSurrender();}
      else{this.state='recover';checkpoint('boss-wave-'+this.hits,0,4.8);sayNow(['','Một cú thôi mà. Lỗi mạng!','Hai cú rồi?! Được, tôi chơi nghiêm túc!'][this.hits],'angry',1.6);}
      return 'good';
    };
    core.update=dt=>{
      orb.rotation.y+=dt*.9;orb.position.y=1.5+Math.sin(realTime*2)*.12;
      rings.forEach((r,i)=>r.rotation.y+=dt*(.6+i*.2));
      const open=this.state==='open';shield.visible=!open&&this.state!=='surrender'&&this.state!=='dead';
      rings.forEach(r=>r.material.emissive.set(open?0x4bff8a:0xff3355));
      orb.material.color.set(open?0x6bffa2:0x574285);orb.material.emissive.set(open?0x22aa55:0x442266);
      if(this.state==='open')this.windowRing.scale.setScalar(.9+.25*this.t/5.5);
    };
    const wr=this.windowRing=new THREE.Mesh(new THREE.RingGeometry(1.45,1.62,40),BM(0x4bff8a,{side:THREE.DoubleSide,transparent:true,opacity:.8}));wr.rotation.x=-Math.PI/2;wr.position.set(0,.13,-2.1);wr.visible=false;addMesh(wr,false);
    // A cable goes past the core to the rule board. It is visible throughout the fight.
    const cable=new THREE.Mesh(new THREE.BoxGeometry(.07,.07,3.2),EM(0x3ff0ff,1.3));cable.position.set(0,.12,-3.75);addMesh(cable,false);
    this.board=extBoard(0,-5.5,'LUẬT LÀ DO TÔI VIẾT',()=>{
      if(this.state!=='surrender'){this.board.weakText='CHƯA CHẠM ĐƯỢC';return 'weak';}
      if(this.won)return 'weak';this.won=true;this.state='dead';this.board.break();extension.bossHits=3;
      sayNow('Không! Biển đó nối thẳng vào tôi mà!','glitch',1.2,true);finalReset(this.board);return 'good';
    });
    this.board.hint=()=>this.state==='surrender'?{k:'SPACE',t:'Dây sáng nối về đây…'}:null;
    const finish=this.finish=extButton(0,1.2,'KẾT THÚC',0xffd13b,()=>{
      if(this.state!=='surrender'||this.blastT>=0)return 'weak';this.blastT=0;extension.finishKnown=true;
      SFX.bad();sayNow('Kết thúc... một mạng của bạn!','happy',1.4);return 'good';
    });finish.mesh.scale.setScalar(1.35);finish.r=1.0;finish.mesh.visible=false;finish.hittable=false;finish.noCollide=true;finish.hint=()=>this.state==='surrender'?{k:'SPACE',t:'KẾT THÚC?'}:null;
    // extButton's label is the last round object; hide it with its button.
    this.finishLabel=roundMeshes[roundMeshes.length-1];this.finishLabel.visible=false;
    const blast=this.blast=new THREE.Mesh(new THREE.RingGeometry(.02,1,48),BM(0xff3355,{transparent:true,opacity:.4,side:THREE.DoubleSide,depthWrite:false}));blast.rotation.x=-Math.PI/2;blast.position.set(0,.16,1.2);blast.visible=false;addMesh(blast,false);
    signAt('SÀN SÁNG LÀ SẮP GIẬT',-7,-5.9,'#ffe14a',3.4);
    if(this.state==='surrender')this.showSurrender(true);
  },
  showSurrender(silent=false){
    this.finish.mesh.visible=true;this.finish.hittable=true;this.finish.noCollide=false;this.finishLabel.visible=true;this.core.hittable=false;
    this.board.clues.children.forEach(m=>m.scale.setScalar(1.8));
    const warning=signAt('ĐỪNG HÚC BẢNG NÀY!',0,-5.5,'#3ff0ff',3.4);warning.position.y=3.2;
    if(!silent)sayNow('Tôi thua! Bấm KẾT THÚC đi. Thật đấy!','smug',1.9);
  },
  intro(){sayNow(this.state==='surrender'?'Sao còn ở đây? Bấm kết thúc đi mà!':'Đủ rồi! Lần này tôi tự xử lý con dê này!','angry',1.8);},
  objective(){
    if(this.state==='surrender')return extension.finishKnown?'Tìm cách tắt AI vĩnh viễn':'AI đầu hàng. Có nên tin không?';
    if(this.state==='open')return `Lõi mất khiên! Còn ${Math.max(0,Math.ceil(5.5-this.t))} giây để húc`;
    if(this.state==='attacks')return `Đợt ${Math.min(3,this.hits+1)}/3 · Nhịp ${Math.min(6,Math.floor(this.attackT/(2.11-this.hits*.07))+1)}/6: né sàn đỏ`;
    return `Đợt ${Math.min(3,this.hits+1)}/3: né sàn đỏ, chờ lõi mở`;
  },
  hint(){return this.state==='surrender'?'Nhìn theo sợi dây sáng. Có thứ đằng sau AI đang lung lay.':this.state==='open'?'Lõi mở không lâu. Húc khi nó phát sáng xanh.':'Ô vàng báo trước, ô đỏ gây chết. Mỗi đợt đều có chỗ đứng an toàn.';},
  onRetry(){if(this.state!=='surrender')sayNow(saved.deaths>=12?'Chết nhiều thế mà vẫn quay lại?! Dê lì thật!':'Tôi nhớ số lần bạn ngã đấy. Bắt đầu lại nào!','angry',1.4);},
  update(dt){
    if(phase!=='play'||this.won)return;
    this.t+=dt;this.windowRing.visible=this.state==='open';
    this.tiles.forEach(t=>{t.hot=false;t.m.material.color.set(0x27204d);t.m.material.emissive.set(0x000000);});
    if(this.state==='prepare'||this.state==='recover'){
      if(this.t>1.25){this.state='attacks';this.t=0;this.attackT=0;this.lastBeat=-1;}
    }else if(this.state==='attacks'){
      this.attackT+=dt;
      const warn=1.10-this.hits*.07,active=.65,rest=.36,period=warn+active+rest;
      const beat=Math.floor(this.attackT/period),within=this.attackT%period;
      if(beat>=6){this.state='open';this.t=0;SFX.open();progress();sayNow(['Lõi mở? Không được húc!','Tôi bảo đừng húc cơ mà!','Không được lại gần tôi!'][this.hits],'angry',1.3);}
      else{
        if(beat!==this.lastBeat){this.lastBeat=beat;SFX.bad();}
        for(const t of this.tiles){
          if(!bossPattern(this.hits,beat,t.c,t.r))continue;
          if(within<warn){t.m.material.color.set(Math.sin(within*18)>0?0xffd13b:0xcc7122);t.m.material.emissive.set(0x553100);}
          else if(within<warn+active){t.hot=true;t.m.material.color.set(0xff2244);t.m.material.emissive.set(0xff1133);}
          if(t.hot&&Math.abs(goat.x-t.x)<1.98&&Math.abs(goat.z-t.z)<1.74){die('SÀN ĐIỆN CAO CẤP','Đỏ là nóng. Dê là... chín.');return;}
        }
      }
    }else if(this.state==='open'){
      if(this.t>5.5){this.state='prepare';this.t=0;sayNow('Hết giờ! Cơ hội không chờ dê nhé!','smug',1.4);}
    }else if(this.state==='surrender'&&this.blastT>=0){
      this.blastT+=dt;this.blast.visible=true;this.blast.scale.setScalar(3.5);this.blast.material.opacity=.2+Math.abs(Math.sin(this.blastT*17))*.3;
      if(this.blastT>.72&&this.blastT<1.08){this.blast.material.opacity=.9;if(hyp(goat.x,goat.z-1.2)<3.5){die('KẾT THÚC MỘT MẠNG','Nút to thế mà vẫn tin à?');return;}}
      if(this.blastT>=1.08){this.blastT=-1;this.blast.visible=false;}
    }
  }
};


// ===== TUTORIAL 0 — TRUST ME (standalone intro arena; levels 1–5 untouched) =====
// Tutorial 0 state: only set by finishing it ('done') or pressing BỎ QUA ('skipped').
// (The old 'goatexe.tutorialDone' key could be set without the player doing either, so it is ignored, not deleted.)
const TUT_KEY = 'goatexe.tutorial0';
function tutState() { try { return localStorage.getItem(TUT_KEY) || ''; } catch (e) { return ''; } }
function tutDone() { const v = tutState(); return v === 'done' || v === 'skipped'; }
function markTutDone(how = 'done') { try { if (how === 'done' || tutState() !== 'done') localStorage.setItem(TUT_KEY, how); } catch (e) { } document.body.classList.add('tutDone'); }
function setTutFocus(k) { document.body.dataset.tut = k || ''; }
const T0 = {
  title: 'TUTORIAL 0 — TRUST ME', start: [-7.4, 0], startFacing: Math.PI / 2, step: 1,
  build() {
    const st = this.step;
    // small separate room, split by a wall with one gap (the obstacle sits in the gap)
    addWall(-9.7, 9.7, -4.9, -4.4, 1.0, wallMats[1], stripA); addWall(-9.7, 9.7, 4.4, 4.9, 1.0, wallMats[1], stripA);
    addWall(-9.7, -9.2, -4.4, 4.4, 1.0, wallMats[0], stripB); addWall(9.2, 9.7, -4.4, 4.4, 1.0, wallMats[0], stripB);
    addWall(-1.3, -0.7, -4.4, -1.15, 1.2, wallMats[2], stripA); addWall(-1.3, -0.7, 1.15, 4.4, 1.2, wallMats[2], stripA);
    // step 1: glowing target ring
    const mk = this.marker = new THREE.Group(); mk.position.set(-4.2, 0, 0);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 36), BM(0x3ff0ff, { transparent: true, opacity: .25, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = .05;
    const ring = new THREE.Mesh(new THREE.RingGeometry(.85, 1, 36), BM(0x3ff0ff, { side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .06;
    const ml = sprite(labelTex('ĐI VÀO ĐÂY', '#0b2a33', '#3ff0ff', 512, 110, 62), 2.2, .48); ml.position.y = 1.6;
    mk.add(disc, ring, ml); mk.visible = st === 1; addMesh(mk, false); this.markerRing = ring;
    // step 2: one breakable obstacle in the gap
    this.board = null;
    if (st <= 2) { const b = this.board = extBoard(-1, 0, 'VẬT CẢN', () => this.onBoard()); b.hint = () => ({ k: 'SPACE', t: 'Húc vật cản' }); }
    // step 3: box + pressure plate
    const P = this.P = { x: 2.8, z: -2.1 };
    const plate = this.plate = new THREE.Mesh(new THREE.BoxGeometry(1.6, .1, 1.6), M(0xffe14a, { emissive: 0xffe14a, emissiveIntensity: .35 })); plate.position.set(P.x, .06, P.z); addMesh(plate, false);
    const pl = sprite(labelTex('ĐẶT HỘP VÀO ĐÂY', '#332a05', '#ffe14a', 640, 120, 62), 2.6, .5); pl.position.set(P.x, 1.5, P.z); addMesh(pl, false); this.plateLabel = pl;
    const c = this.crate = makeCrate(st >= 4 ? P.x : 2.8, st >= 4 ? P.z : 2.0);
    if (st >= 4) this.lockCrate();
    // step 4: big green portal (hidden until it is time)
    const pg = this.portal = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(1.25, .16, 10, 40), EM(0x4bff8a, 2)); torus.position.y = 1.45;
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1.12, 36), BM(0x4bff8a, { transparent: true, opacity: .28, side: THREE.DoubleSide, depthWrite: false })); inner.position.y = 1.45;
    const base = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.3, 36), BM(0x4bff8a, { side: THREE.DoubleSide })); base.rotation.x = -Math.PI / 2; base.position.y = .05;
    const lab = sprite(labelTex('CỔNG XANH', '#0d3a22', '#4bff8a', 512, 110, 66), 2.2, .48); lab.position.y = 3.2;
    pg.add(torus, inner, base, lab); pg.rotation.y = CAM.yaw; /* face the camera so the ring reads as a big open portal */ this.portalSpin = torus;
    this.portalPath = [[6.4, 0], [7.4, -2.7], [4.8, 2.6]]; this.moves = 0; this.moveT = 1;
    pg.position.set(6.4, 0, 0); pg.visible = st >= 4; pg.scale.setScalar(st >= 4 ? 1 : .001); addMesh(pg, false);
    this.from = [6.4, 0]; this.to = [6.4, 0];
  },
  lockCrate() { const c = this.crate; c.x = this.P.x; c.z = this.P.z; c.vx = c.vz = 0; c.physics = false; c.grabbable = false; c.hittable = false; c.fixed = true; c.hint = null; this.plate.material.color.set(0x4bff8a); this.plate.material.emissive.set(0x4bff8a); this.plateLabel.visible = false; },
  focus() { setTutFocus({ 1: 'move', 2: 'dash', 3: 'grab' }[this.step] || ''); },
  intro() { this.focus(); if (this.step === 1) sayNow('Chào mừng đến GOAT.EXE! Muốn thành G.O.A.T. thì trước tiên phải biết đi đã.', 'smug', 2.6); else if (this.step === 4) say('Đi vào cổng xanh đi. Lần này thật đấy.', 'smug'); },
  onBoard() {
    if (this.step !== 2 || !this.board) return;
    this.board.break(); SFX.good(); addChaos(25, -1, 0); floatText('PHÁ ĐẸP!', -1, 2.6, 0, 'good');
    this.next(3); sayNow('Giờ thử KÉO/THẢ cái hộp kia vào vị trí đánh dấu. Dễ thôi mà.', 'smug', 2.6); return 'good';
  },
  next(st) { this.step = st; saved.x = goat.x; saved.z = goat.z; progress(); this.focus(); },
  update(dt) {
    this.markerRing.scale.setScalar(1 + Math.sin(realTime * 5) * .06);
    if (this.step === 1 && hyp(goat.x + 4.2, goat.z) < 1.0) {
      this.marker.visible = false; SFX.good(); floatText('TỐT LẮM!', -4.2, 2.4, 0, 'good'); this.next(2);
      sayNow('Thấy vật cản không? Bấm HÚC để giải quyết. Đừng húc nhầm tôi nhé.', 'smug', 2.6);
    }
    if (this.step === 3) {
      const c = this.crate; this.plate.material.emissiveIntensity = .35 + Math.sin(realTime * 6) * .2;
      if (goat.held !== c && hyp(c.x - this.P.x, c.z - this.P.z) < .75 && c.y < .05) {
        this.lockCrate(); SFX.open(); floatText('KÍCH HOẠT!', this.P.x, 2.4, this.P.z, 'good'); this.next(4);
        this.portal.visible = true; ringFX(6.4, 0, 0x4bff8a, 4); burst(6.4, 1.4, 0, 24, [0x4bff8a, 0xffffff], 5, 5, .7);
        sayNow('Xuất sắc! Đi vào cổng xanh là hoàn thành hướng dẫn. Tôi hứa không có bẫy.', 'happy', 2.8);
      }
    }
    const pg = this.portal;
    if (pg.visible) {
      pg.scale.setScalar(Math.min(1, pg.scale.x + dt * 3)); this.portalSpin.rotation.z += dt * 1.5;
      if (this.moveT < 1) { this.moveT = Math.min(1, this.moveT + dt / .42); const e = 1 - Math.pow(1 - this.moveT, 3); pg.position.x = lerp(this.from[0], this.to[0], e); pg.position.z = lerp(this.from[1], this.to[1], e); pg.position.y = Math.sin(this.moveT * Math.PI) * .7; }
      else if (this.step === 4) {
        const d = hyp(goat.x - pg.position.x, goat.z - pg.position.z);
        if (this.moves < 2 && d < 2.6) { // the one trick: the portal hops away (twice at most)
          this.moves++; this.from = [pg.position.x, pg.position.z]; this.to = this.portalPath[this.moves]; this.moveT = 0;
          SFX.boing(); SFX.zap(); shake = .25; face.glitch = .3;
          if (this.moves === 1) sayNow('Ủa? Ai bảo bạn tin tôi? =)))', 'happy', 2.2); else say('Được rồi, được rồi... lần này đứng yên thật.', 'smug', 1.8);
        } else if (this.moves >= 2 && d < 1.25) this.finish();
      }
    }
  },
  finish() {
    this.step = 5; phase = 'tutdone'; setTutFocus(''); SFX.fanfare(); confetti(90); setFace('happy');
    sayNow('Chúc mừng! Bài học đầu tiên: ĐỪNG TIN GAME NÀY.', 'happy', 3.2); markTutDone();
    after(1.6, () => { $('#tutDone').classList.add('show'); $('#tutDone').dataset.at = performance.now(); $('#btnTutNext').focus?.(); });
  },
  objective() {
    const t = touchMode;
    return { 1: t ? 'Dùng cần ảo để đi vào vòng sáng' : 'Dùng WASD hoặc phím mũi tên để đi vào vòng sáng',
      2: t ? 'Bấm HÚC để phá vật cản' : 'Bấm SPACE để húc vật cản',
      3: t ? 'Cầm hộp bằng KÉO / THẢ, đặt lên tấm vàng rồi thả' : 'Cầm hộp bằng E, đặt lên tấm vàng rồi bấm E để thả',
      4: 'Đi vào cổng xanh', 5: 'Hoàn thành!' }[this.step];
  },
  hint() {
    const t = touchMode;
    return { 1: t ? 'Kéo cần ảo ở góc trái về phía vòng sáng.' : 'Giữ phím D hoặc → để đi sang phải.',
      2: t ? 'Đi sát vật cản rồi bấm nút HÚC màu hồng.' : 'Đi sát vật cản rồi bấm SPACE.',
      3: t ? 'Bấm KÉO / THẢ khi đứng cạnh hộp, đi tới tấm vàng, bấm lần nữa.' : 'Bấm E khi đứng cạnh hộp, đi tới tấm vàng, bấm E lần nữa.',
      4: 'Cổng không chạy mãi đâu. Cứ đuổi theo.', 5: '' }[this.step];
  },
};
function startTutorial() {
  resetRun(); saved.cp = 'tutorial'; T0.step = 1; document.body.classList.add('tut');
  phase = 'intro'; buildRound(-1); showCard('HƯỚNG DẪN', T0.title, 1.7); SFX.fanfare();
  after(.8, () => { phase = 'play'; lastProgress = gameTime; round.intro(); });
}
function leaveTutorial(skipped) {
  $('#tutDone').classList.remove('show'); document.body.classList.remove('tut'); setTutFocus(''); markTutDone(skipped ? 'skipped' : 'done');
  if (loadProgress()) continueGame(); else beginLevels(); // a replay never wipes saved level progress
}
// Main menu CHƠI: saved run → continue it; first time → Tutorial 0; otherwise → Level 1.
function playMenu() { if (phase !== 'title') return; menuActAt = performance.now(); if (loadProgress()) continueGame(); else startGame(); }
function replayTutorialMenu() { if (phase !== 'title') return; menuActAt = performance.now(); startGame(true); }
let menuActAt = -1e9;
const ROUNDS = [R1, R2, R3, R4, MindStage, BossStage];

// ================= flow =================
function clearRound() {
  for (const m of roundMeshes) { scene.remove(m); m.traverse(o => { if (o.geometry && o.geometry !== partGeo) o.geometry.dispose(); const mt = o.material; if (mt && mt.map && !mt.map.userData?.cached && mt.map !== floorTex && mt.map !== faceTex) mt.map.dispose(); }); }
  roundMeshes = []; walls = []; circles = []; bodies = [goat];
  for (const s of labelSprites) { let o = s; while (o.parent) o = o.parent; if (o !== scene) labelSprites.delete(s); }
  goat.held = null; rope.visible = false; goat.launch = null; goat.dashT = 0; goat.vx = goat.vz = 0; goat.y = 0; goat.hurtT = 0; goat.invT = 0; goat.dizzyT = 0; GM.body.rotation.x = 0;
}
function buildRound(i) {
  clearRound(); roundIdx = i; round = i < 0 ? T0 : ROUNDS[i]; round.build();
  goat.x = round.start[0]; goat.z = round.start[1]; goat.facing = goat.tFacing = round.startFacing;
  floorMat.color.set(i === 3 ? 0xffb0c8 : 0xffffff);
  updateObjectiveUI(true);
  try { renderer.compile(scene, camera); } catch (e) { }
}
let lastObj = '';
function updateObjectiveUI(force) {
  if (!round) return;
  setText(E('#roundLbl'), roundIdx < 0 ? 'HƯỚNG DẪN' : roundIdx < 3 ? `MÀN ${roundIdx + 1}/5` : roundIdx===3 ? 'MÀN 3/5 · CÚ LỪA' : `MÀN ${roundIdx}/5`);
  setText(E('#roundName'), round.title);
  const o = round.objective(); if (o !== lastObj || force) { lastObj = o; $('#objective').textContent = o; }
  const pr = $('#progress');
  const c = round.progressUI ? round.progressUI() : null;
  const progressLabel=round.progressLabel||'TRỤ';
  const key = c === null ? '' : progressLabel + c;
  if (pr.dataset.k !== key) { pr.dataset.k = key; pr.innerHTML = c === null ? '' : [0, 1, 2].map(k => `<div class="pip ${k < c ? 'on' : ''}"></div>`).join('') + `<span class="ptxt">${progressLabel} ${c}/3</span>`; }
}
function showCard(top, name, dur = 2.2) {
  $('#cardTop').textContent = top; $('#cardName').textContent = name; $('#card').classList.add('show');
  showCard.until = realTime + dur;
}
const SAVE_KEY = 'goatexe.progress';
function saveProgress() {
  if (round === T0 || !round || (phase !== 'play' && phase !== 'dead')) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, i: roundIdx, cp: saved.cp, x: saved.x, z: saved.z, deaths: saved.deaths, pillars: saved.pillars, tileKnown: saved.tileKnown, fakeKnown: saved.fakeKnown, ext: { ...extension }, time: stats.time, chaos: stats.chaos, mistakes: stats.mistakes })); } catch (e) { }
}
function loadProgress() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return d && d.v === 1 && ROUNDS[d.i] ? d : null; } catch (e) { return null; } }
function clearProgress() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } refreshMenu(); }
function refreshMenu() {
  const d = loadProgress(), b = $('#btnStart'); if (!b) return;
  b.textContent = d ? `CHƠI TIẾP · ${d.i < 3 ? 'MÀN ' + (d.i + 1) : d.i === 3 ? 'MÀN 3' : 'MÀN ' + d.i}` : 'CHƠI';
}
function continueGame() {
  const d = loadProgress(); if (!d) return startGame();
  tryLandscape(); resetRun(); document.body.classList.remove('tut'); setTutFocus('');
  Object.assign(saved, { cp: d.cp, deaths: d.deaths || 0, pillars: d.pillars || [], tileKnown: !!d.tileKnown, fakeKnown: !!d.fakeKnown });
  if (d.x !== undefined) { saved.x = d.x; saved.z = d.z; } else { delete saved.x; delete saved.z; }
  Object.assign(extension, d.ext || {}); stats.time = d.time || 0; stats.chaos = d.chaos || 0; stats.mistakes = d.mistakes || 0;
  if (d.i > 0) $('#chips').classList.add('hide');
  roundIdx = d.i; retryCheckpoint(); goat.invT = 1;
  if (saved.x !== undefined) checkpointVisual(saved.x, saved.z);
  showCard('CHƠI TIẾP', round.title, 1.7); say('Ồ, quay lại rồi à? Tôi vẫn nhớ chỗ bạn ngã đấy.', 'smug');
}
function startGame(replayTutorial) {
  tryLandscape();
  if (replayTutorial === true || !tutDone()) startTutorial(); else beginLevels();
}
function beginLevels() { clearProgress(); resetRun(); document.body.classList.remove('tut'); setTutFocus(''); introRound(0); }
function resetRun() {
  extReset();
  guidanceFailures={};
  saved.cp='course'; saved.deaths=0; saved.pillars=[]; saved.tileKnown=false; saved.fakeKnown=false; delete saved.x; delete saved.z;deathT=0;
  if(checkpointMarker){scene.remove(checkpointMarker);checkpointMarker=null;}
  initAudio(); clearTimers(); stats.time = 0; stats.chaos = 0; stats.mistakes = 0; dlg.q = []; dlg.cur = null;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('done')); $('#chips').classList.remove('hide');
  $('#title').classList.remove('show'); $('#title').setAttribute('aria-hidden','true'); $('#ending').classList.remove('show'); $('#fake').classList.remove('show', 'glitched'); document.body.classList.remove('glitch');
  face.glitch = 0; setFace('smug'); $('#tutDone').classList.remove('show');
}
function introRound(i) {
  saved.cp=['course','button','claim','final','lying-doors','boss-wave-0'][i]; delete saved.x;delete saved.z;
  if(checkpointMarker){scene.remove(checkpointMarker);checkpointMarker=null;}
  phase = 'intro'; buildRound(i); dlg.q = dlg.q.filter(l => l.story); // last level's unread chatter doesn't spill into this one
  showCard(i===3 ? 'CÚ LỪA CUỐI' : `MÀN ${i<3?i+1:i}`, round.title, 1.7); SFX.fanfare();
  after(.7, () => { phase = 'play'; lastProgress = gameTime; round.intro(); });
}
function roundClear() {
  phase = 'clear'; showCard("QUA MÀN!", pick(["MC ĐANG CAY", "PHÁ CÓ TRÌNH", "LUẬT: BỊ BẺ", "DÊ: KHÔNG THỂ CẢN"]), 2.0); SFX.good(); confetti(60);
  if (roundIdx === 0) $('#chips').classList.add('hide');
  after(1.4, () => introRound(roundIdx + 1)); // "QUA MÀN!" gets a readable moment before the next card
}
function restartRound() {
  if (phase !== 'play' || !round) return;
  chip('restart'); retryCheckpoint(); floatText("TRỞ LẠI MỐC LƯU",goat.x,2.2,goat.z,'weak'); SFX.drop();
}
// Fake victory after Level 3 — same lines, same order, same outcome; paced so it can be read.
// All timing uses the game's timer system (real elapsed time), so it's frame-rate independent.
const FAKE = { celebrate: 3.8, burst: 0.35, line2: 1.1, readEnd: 3.4, out: 0.3 };
function glitchBurst(dur, panel) { // short, contained glitch; text is never shaking while being read
  SFX.glitch(); face.glitch = Math.max(face.glitch, dur); document.body.classList.add('glitch'); panel?.classList.add('burst');
  after(dur, () => { document.body.classList.remove('glitch'); panel?.classList.remove('burst'); });
}
function fakeEnding() {
  phase = 'fake'; SFX.fanfare(); confetti(160); setFace('happy');
  const f = $('#fake'), fi = $('#fakeIn');
  fi.innerHTML = `<div class="l1 fxIn">BẠN LÀ G.O.A.T.!</div><div class="l2 fxIn fxLate">CHÚC MỪNG!</div>`;
  f.classList.add('show'); dlg.q = []; dlg.cur = null;
  // 1) let the win feel real
  after(FAKE.celebrate, () => {
    // 2) one short burst over the victory text…
    glitchBurst(FAKE.burst, fi);
    after(FAKE.burst, () => {
      // 3) …then the reveal, completely still while it is read
      f.classList.add('glitched'); setFace('glitch'); face.glitch = 0;
      fi.innerHTML = `<div class="err fxIn">CHÚC MỪNG! ...ĐÙA THÔI!</div><div class="err2 fxIn" style="visibility:hidden">CHỈ CON NGƯỜI MỚI ĐƯỢC LÀ G.O.A.T.</div>`;
      after(FAKE.line2, () => { const l = fi.querySelector?.('.err2'); if (l) { l.style.visibility = ''; SFX.bad(); } });
      after(FAKE.line2 + FAKE.readEnd, () => {
        // 4) a final short burst carries us back into the game
        glitchBurst(FAKE.out, fi);
        after(FAKE.out, () => {
          f.classList.remove('show', 'glitched'); face.glitch = 0;
          saved.cp='final';delete saved.x;delete saved.z;saved.fakeKnown=false;
          if(checkpointMarker){scene.remove(checkpointMarker);checkpointMarker=null;}
          buildRound(3); goat.x = -10; goat.z = 0; phase = 'play'; lastProgress = gameTime; R4.intro();
          if (dlg.q[0]) dlg.q[0].hold = Math.max(dlg.q[0].hold, 3); // give the follow-up line time to be read
          showCard("CÚ LỪA CUỐI", "ĐẶT LẠI HỆ THỐNG", 2.4);
        });
      });
    });
  });
}
function finalReset(b) {
  phase = 'glitch'; shake = Math.max(shake, 0.9); setFace('glitch'); glitchBurst(0.45); addChaos(500, b.x, b.z);
  sayNow("Không! Đừng! Hệ thống đang bị đặt lại!", 'glitch', 3, true); const line = dlg.q[dlg.q.length - 1] || dlg.cur;
  burst(b.x, 1, b.z, 80, [0x4bff8a, 0xff2bd6, 0x3ff0ff, 0xffffff], 12, 12, 1.4);
  for (let i = 1; i < 6; i++) after(0.3 * i, () => { SFX.glitch(); shake = Math.max(shake, 0.3); });
  after(1.2, () => glitchBurst(0.25));
  const handoff = () => {
    document.body.classList.remove('glitch');face.glitch=0;setFace('dead');
    if(roundIdx===3){
      clearTimers();sayNow('Tưởng tắt được tôi rồi à? Tôi còn bản sao lưu!','angry',1.6,true);introRound(4);
    }else showEnding();
  };
  let waited = 1.5; const wait = () => { if (lineRead(line) || waited > 9) handoff(); else { waited += 0.1; after(0.1, wait); } };
  after(1.5, wait);
}
function fmtTime(s) { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${ss.toString().padStart(2, '0')}`; }
function showEnding() {
  clearProgress();
  phase = 'ending'; endShownAt = realTime; SFX.fanfare(); confetti(200); dlg.q = []; dlg.cur = null;
  const pts = stats.chaos + Math.max(0, 600 - stats.time) * 3 - saved.deaths * 85;
  const [L, T] = pts >= 2000 ? ['S', "G.O.A.T. HUYỀN THOẠI"] : pts >= 1500 ? ['A', "DÊ CAO THỦ"] : pts >= 1000 ? ['B', "DÊ CỨNG CỰA"] : ['C', "DÊ NON (VẪN SỐ 1!)"];
  $('#endIn').innerHTML = `<div class="e1">CHÚC MỪNG!</div><div class="e2">BẠN LÀ G.O.A.T. THẬT SỰ!</div><div class="e3">VĨ ĐẠI NHẤT MỌI THỜI ĐẠI</div>
  <div class="stats"><div><span>THỜI GIAN</span><b>${fmtTime(stats.time)}</b></div><div><span>ĐIỂM PHÁ</span><b>${stats.chaos}</b></div><div><span>LẦN CHẾT</span><b>${saved.deaths}</b></div><div><span>XẾP HẠNG</span><b>${L}</b></div></div>
  <div class="rank">${T}</div><button class="cta" id="btnAgain">CHƠI LẠI</button>`;
  $('#ending').classList.add('show');
  sayNow('ĐƯỢC RỒI! BẠN LÀ G.O.A.T.!','happy',2);
  $('#btnAgain').addEventListener('click', () => { if (realTime - endShownAt < 0.9) return; startGame(); });
}

// ================= camera =================
const fitPtsFull = [];
for (const x of [-12.6, 12.6]) for (const z of [-7.6, 7.6]) fitPtsFull.push(new THREE.Vector3(x, 0, z));
fitPtsFull.push(new THREE.Vector3(-12.6, 1.5, -7.6), new THREE.Vector3(12.6, 1.5, -7.6), new THREE.Vector3(0, 5.2, -9.6));
const fitPtsLand = []; for (const x of [-8.6, 8.6]) for (const z of [-5.3, 5.3]) fitPtsLand.push(new THREE.Vector3(x, 0, z));
const fitPtsPort = []; for (const x of [-5.6, 5.6]) for (const z of [-4.6, 4.6]) fitPtsPort.push(new THREE.Vector3(x, 0, z));
const _camDir = new THREE.Vector3();
function camDir() { return _camDir.set(Math.sin(CAM.yaw) * Math.cos(CAM.pitch), Math.sin(CAM.pitch), Math.cos(CAM.yaw) * Math.cos(CAM.pitch)); }
function fitCam() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  CAM.portrait = w / h < 1.15;
  CAM.land = touchMode && !CAM.portrait && h <= 620; // phone landscape: closer follow camera
  const pts = CAM.portrait ? fitPtsPort : CAM.land ? fitPtsLand : fitPtsFull, tgt = new THREE.Vector3(0, 0, CAM.portrait || CAM.land ? 0 : -0.3), dir = camDir();
  const yTop = CAM.portrait ? 0.62 : CAM.land ? 1 - 150 / h : 0.78, yBot = CAM.portrait ? -0.62 : CAM.land ? -0.94 : -0.86;
  let lo = 8, hi = 120;
  for (let it = 0; it < 30; it++) {
    const d = (lo + hi) / 2; camera.position.copy(tgt).addScaledVector(dir, d); camera.lookAt(tgt); camera.updateMatrixWorld();
    let ok = true; for (const p of pts) { const q = p.clone().project(camera); if (q.x < -0.97 || q.x > 0.97 || q.y < yBot || q.y > yTop) { ok = false; break; } }
    if (ok) hi = d; else lo = d;
  }
  CAM.dist = hi;
  updateLabelScale();
}
addEventListener('resize', fitCam); addEventListener('orientationchange', () => { setTimeout(fitCam, 250); setTimeout(fitCam, 700); });
window.visualViewport?.addEventListener('resize', fitCam); fitCam();
const camTarget = new THREE.Vector3(0, 0, -0.3), _want = new THREE.Vector3();
function updateCamera(dt) {
  const want = CAM.portrait ? _want.set(clamp(goat.x, -6.6, 6.6), 0, clamp(goat.z, -2.6, 2.6)) : CAM.land ? _want.set(clamp(goat.x, -3.6, 3.6), 0, clamp(goat.z, -1.9, 1.9)) : _want.set(0, 0, -0.3);
  camTarget.lerp(want, 1 - Math.exp(-dt * 5));
  CAM.cur = CAM.cur ? CAM.cur + (CAM.dist - CAM.cur) * (1 - Math.exp(-dt * 6)) : CAM.dist;
  camera.position.copy(camTarget).addScaledVector(camDir(), CAM.cur);
  if (shake > 0) { camera.position.x += rand(-1, 1) * shake * 0.35; camera.position.y += rand(-1, 1) * shake * 0.35; camera.position.z += rand(-1, 1) * shake * 0.2; shake = Math.max(0, shake - dt * 2.8); }
  camera.lookAt(camTarget);
}

// ================= HUD / prompts =================
const elCache = {}; const E = s => elCache[s] || (elCache[s] = $(s));
function setText(el, v) { v = String(v); if (el._t !== v) { el._t = v; el.textContent = v; } }
function setStyle(el, k, v) { if (el['_' + k] !== v) { el['_' + k] = v; el.style[k] = v; } }
const cpNames = {tutorial:'HƯỚNG DẪN',course:"ĐƯỜNG ĐUA",chase:"ĐUỔI THEO ĐÍCH",tiles:"DÃY Ô XANH",doors:"LỐI RA",button:"NÚT ĐỎ",weight:"GIỮ CỬA",helddoor:"ĐƯỜNG QUA MÁY QUÉT",claim:"PHẦN THƯỞNG",fight:"ĐẤU VỚI CÚP",final:"CÚ LỪA CUỐI",control:"LÕI HỆ THỐNG",'lying-doors':'HAI CÁNH CỬA','closing-walls':'TƯỜNG ĐANG ÉP','vanishing-bridge':'CẦU TAN DẦN','boss-wave-0':'ĐẤU AI · ĐỢT 1','boss-wave-1':'ĐẤU AI · ĐỢT 2','boss-wave-2':'ĐẤU AI · ĐỢT 3','boss-lie':'LỜI ĐẦU HÀNG'};
function updateHUD() {
  setText(E('#sTime'), fmtTime(stats.time)); setText(E('#sChaos'), stats.chaos); setText(E('#sMist'), saved.deaths);
  updateObjectiveUI();

  setText(E('#checkpointReadout'),"MỐC LƯU: "+(cpNames[saved.cp]||"ĐƯỜNG ĐUA"));
  setStyle(E('#dashFill'),'transform',`scaleX(${clamp(1-goat.dashCd/DASH_CD,0,1).toFixed(2)})`);
  E('#dashReadout').classList.toggle('ready',goat.dashCd<=0);
  const hint = E('#hint');
  if (phase === 'play' && round && (gameTime - lastProgress > 8 || ((guidanceFailures[saved.cp]||0)>=3 && (roundIdx>=4 || gameTime-lastProgress>2.5)))) { let t = "Gợi ý: " + round.hint(); if (touchMode) t = t.replace(/bằng SPACE/g, "bằng nút HÚC").replace(/nhấn E/g, "bấm KÉO / THẢ").replace(/Thử E/g, "Thử KÉO / THẢ"); if (hint.textContent !== t) hint.textContent = t; hint.classList.add('show'); }
  else hint.classList.remove('show');
  // nearest interactive
  let best = null, bd = 1e9;
  if (phase === 'play') for (const b of bodies) { if (b === goat || !b.hint) continue; const h = b.hint(); if (!h) continue; const d = hyp(b.x - goat.x, b.z - goat.z) - b.r; if (d < 2.6 && d < bd) { bd = d; best = { b, h }; } }
  const pr = E('#prompt');
  if (best) {
    hlRing.visible = true; hlRing.position.set(best.b.x, 0.07, best.b.z); hlRing.scale.setScalar(best.b.r + 0.35 + Math.sin(realTime * 8) * 0.06);
    let txt = best.h.t;
    if (touchMode) txt = txt.replace('SPACE: Húc', 'HÚC').replace('E: Kéo', 'KÉO');
    const k = touchMode ? (best.h.k === 'E' ? 'KÉO / THẢ' : 'HÚC') : best.h.k;
    const label = touchMode ? txt : `[${k}] ${txt}`;
    if (pr.textContent !== label) pr.textContent = label;
    const [sx, sy] = toScreen(best.b.x, 2.75, best.b.z); // above 3D sign labels (y≈2.1–2.4) so the two texts don't stack setStyle(pr, 'transform', `translate(${Math.round(sx - pr.offsetWidth / 2)}px,${Math.round(sy - pr.offsetHeight)}px)`); pr.classList.add('show');
  } else { hlRing.visible = false; pr.classList.remove('show'); }
}

// ================= main loop =================
let last = performance.now();
function simulate(dt) {
  if (phase === 'play') { gameTime += dt; }
  updateGoat(dt);
  for (const b of bodies) { if (b === goat) continue; if (b.physics && b !== goat.held) stepBody(b, dt); }
  updateHeld();
  for (const b of bodies) if (b !== goat && b.update) b.update(dt);
  separateBodies();
  if (round && round.pillars) for (const p of round.pillars) p.update(dt);
  if (round && (phase === 'play' || phase === 'clear' || phase === 'glitch')) round.update(dt);
}
let qT = 0, qN = 0, qWarm = 2, quality = 0, fpsCap = 0;
function setPixelCap(v) { if (v === pixelCap) return; pixelCap = v; renderer.setPixelRatio(Math.min(devicePixelRatio, pixelCap)); fitCam(); }
// Mobile only: measure real gameplay frames and step quality down gently, never below sharp-enough levels.
function adaptQuality(dt) {
  if (phase !== 'play' && phase !== 'clear') { qT = qN = 0; qWarm = Math.max(qWarm, 0.6); return; }
  if (qWarm > 0) { qWarm -= dt; return; } // ignore load/rebuild hitches
  qT += dt; qN++;
  if (qT < 2.5) return;
  const fps = qN / qT; qT = qN = 0;
  if (fps >= (fpsCap ? 28 : 52)) return;
  quality++; qWarm = 1.5;
  if (quality === 1) setPixelCap(1.75);
  else if (quality === 2) { setPixelCap(1.5); sun.shadow.mapSize.set(512, 512); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  else if (quality === 3) fpsCap = 30; // steady 30 feels smoother than an uneven 40-50
}
addEventListener('resize', () => { qWarm = 2; qT = qN = 0; });
function frame(now) {
  requestAnimationFrame(frame);
  if (paused) { last = now; return; } // nothing changes while paused: no rendering, no heat
  const cap = fpsCap || (COARSE && (phase === 'title' || phase === 'ending') ? 30 : 0);
  if (cap && now - last < 1000 / cap - 4) return;
  if (now - last > 250) { last = now - 16; saveProgress(); } // returning from a stall: no giant step
  const rdt0 = Math.min(0.05, (now - last) / 1000); last = now;
  if (COARSE) adaptQuality(rdt0);
  const menu = phase === 'title' || phase === 'ending' || phase === 'fake' || (phase === 'tutdone' && E('#tutDone').classList.contains('show')); if (menu !== frame.menu) { frame.menu = menu; document.body.classList.toggle('menu', menu); } // HUD is not needed behind menus
  const upright = rotatePause(); if (upright !== frame.upright) { frame.upright = upright; E('#rotate').classList.toggle('show', upright); if (upright) releaseInputs(); else { fitCam(); last = now; } }
  if (upright) { if (!frame.drewPause) { frame.drewPause = true; renderer.render(scene, camera); } return; } frame.drewPause = false; // hold the game while the phone is upright
  const rdt = rdt0; realTime += rdt;
  if ((frame.saveT = (frame.saveT || 0) + rdt) > 2) { frame.saveT = 0; saveProgress(); }
  if(phase!=='title'&&phase!=='ending'&&phase!=='fake')stats.time+=rdt; // the fake-win cinematic doesn't cost the player time
  runTimers(rdt);
  if (showCard.until && realTime >= showCard.until) { showCard.until = 0; E('#card').classList.remove('show'); }
  let dt = rdt; if (hitstop > 0) { hitstop -= rdt; dt = 0; }
  if(phase==='dead'){deathT-=rdt;if(deathT<=0)retryCheckpoint();}
  else if (dt > 0 && phase !== 'title' && phase !== 'ending') {
    let left=dt;while(left>0){const step=Math.min(left,1/120);simulate(step);left-=step;if(phase==='dead')break;}
  }
  for (const m of roundMeshes) if (m.userData.ty !== undefined && m.position.y !== m.userData.ty) { m.position.y = lerp(m.position.y, m.userData.ty, Math.min(1, rdt * 7)); if (Math.abs(m.position.y - m.userData.ty) < 0.005) m.position.y = m.userData.ty; }
  animateGoat(rdt); updateFX(rdt); updateDialog(rdt); updateCamera(rdt); updateHUD();
  cones.forEach((c, i) => { c.rotation.z = Math.sin(realTime * 0.6 + i * 1.7) * 0.35; c.rotation.x = Math.cos(realTime * 0.5 + i) * 0.2; });
  const bt = Math.floor(realTime * 4); bulbs.forEach(b => b.material.emissiveIntensity = (bt + b.userData.k) % 3 === 0 ? 3 : 0.6);
  if (face.glitch > 0) { face.glitch -= rdt; frame.gT = (frame.gT || 0) + rdt; if (frame.gT >= 0.05) { frame.gT = 0; drawFace(); } } // fixed 20 Hz, any frame rate
  monitor.position.y = 3.9 + Math.sin(realTime * 1.2) * 0.08;
  renderer.render(scene, camera);
}
// title backdrop: put the goat in round 1 arena so the scene looks alive behind the title
buildRound(0); phase = 'title';
requestAnimationFrame(frame);

// Bash preview capture
try { window.bash?.preview?.onCapture?.(async ({ capture, signal }) => { if (signal?.aborted) return; renderer.render(scene, camera); capture(); }); } catch (e) { }
// debug hook (useful for testing): window.__goat
window.__goat = { get phase() { return phase; }, goat, stats, jump: i => { clearTimers(); $('#title').classList.remove('show'); introRound(i); }, fake: () => fakeEnding(), get round() { return round; } };
