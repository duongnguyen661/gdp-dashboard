// Tiện ích vẽ chữ / nhãn thành sprite 3D
import * as THREE from 'three';

const FONT = '"Be Vietnam Pro", "Segoe UI", Arial, sans-serif';

export function drawLabel(canvas, text, o = {}) {
  const {
    fg = '#ffffff', bg = 'rgba(10,10,20,0.72)', size = 34, weight = 'bold', pad = 14,
    maxW = 440, radius = 18, border = null, align = 'center',
  } = o;
  const ctx = canvas.getContext('2d');
  const font = `${weight} ${size}px ${FONT}`;
  ctx.font = font;
  const lines = [];
  let cur = '';
  for (const w of String(text).split(/\s+/)) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  const lh = size * 1.25;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + pad * 2;
  const h = Math.ceil(lines.length * lh) + pad * 2;
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d');
  c.font = font; c.textBaseline = 'middle'; c.textAlign = align;
  if (bg) {
    c.fillStyle = bg;
    c.beginPath(); c.roundRect(1, 1, w - 2, h - 2, radius); c.fill();
    if (border) { c.lineWidth = 3; c.strokeStyle = border; c.stroke(); }
  }
  c.fillStyle = fg;
  lines.forEach((l, i) => c.fillText(l, align === 'center' ? w / 2 : pad, pad + lh * (i + 0.5)));
  return { w, h };
}

export function textSprite(text, o = {}) {
  const canvas = document.createElement('canvas');
  const { w, h } = drawLabel(canvas, text, o);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.userData = { canvas, tex, baseH: o.worldH ?? 0.4, opts: o, text: String(text), scaleMode: o.scaleMode ?? 'dist' };
  fit(spr, w, h);
  return spr;
}

function fit(spr, w, h) {
  const bh = spr.userData.baseH;
  spr.userData.aspect = w / h;
  spr.userData.lastW = w; spr.userData.lastH = h;
  spr.scale.set(bh * (w / h), bh, 1);
}

export function setSpriteText(spr, text, extra = {}) {
  const u = spr.userData;
  const key = text + JSON.stringify(extra);
  if (u.key === key) return;
  u.key = key; u.text = text;
  const { w, h } = drawLabel(u.canvas, text, { ...u.opts, ...extra });
  u.tex.dispose?.();
  u.tex.needsUpdate = true;
  fit(spr, w, h);
}

// Phóng nhãn theo khoảng cách camera để người xem điện thoại vẫn đọc được
export function scaleByDistance(spr, camera, ref = 24, maxK = 3.2) {
  const u = spr.userData;
  if (u.scaleMode !== 'dist') return;
  const d = camera.position.distanceTo(spr.getWorldPosition(_v));
  const k = Math.min(maxK, Math.max(1, d / ref));
  spr.scale.set(u.baseH * u.aspect * k, u.baseH * k, 1);
}
const _v = new THREE.Vector3();

export function radialTexture(inner = 'rgba(255,200,120,0.9)', outer = 'rgba(255,200,120,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
